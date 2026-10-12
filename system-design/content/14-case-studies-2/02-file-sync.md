---
title: Design Dropbox (File Sync)
level: advanced
time: 50
summary: Keeping files in sync across devices — chunking files and storing chunks by content hash, uploading only what changed (content-defined chunking), deduplication, the metadata service as the source of truth with a per-user journal, notifying devices of changes, conflict handling, and sharing.
---

:::problem Design Dropbox {level=hard tags="HLD,object storage,sync,deduplication"}
Design a file hosting and sync service like Dropbox or Google Drive: users put files in a folder on their laptop, and the files appear on their other devices and on the web; edits sync automatically; files can be shared. **100 M daily users**, files up to **50 GB**.

:::hint Hint
Don't move whole files: split them into chunks identified by their hash. Then an edit uploads only the changed chunks, identical chunks are stored once, and resuming a broken upload is trivial. Separate **file bytes** (chunks in object storage) from **metadata** (which chunks make up which file version), and give each user a change journal that devices sync from.
:::
:::

## 1. Requirements

**Functional**: upload/download files and folders; **automatic sync** across devices; version history; sharing with other users; offline edits synced later.

**Non-functional**
- **Never lose data**; files are consistent (a device never sees half a file).
- **Bandwidth-efficient**: small edits to big files upload little; resumable transfers.
- Changes appear on other devices within seconds.
- Scale: 100 M DAU, billions of files, exabytes of storage.

## 2. Estimates

:::derive Storage and traffic
\text{users} = 500\text{M},\ \text{avg 10 GB stored} \Rightarrow 5\,\text{EB logical} ||
\text{after dedup + compression} \approx 2\text{–}3\,\text{EB physical} || identical chunks stored once
\text{metadata: } 500\text{M} \times 2{,}000\ \text{files} = 10^{12}\ \text{file versions/chunk refs} || sharded by user/namespace
!\text{sync events} \approx 100\text{M} \times 50/\text{day} \approx 60\text{K/s} || mostly small metadata updates
:::

## 3. Data model

```text
chunks        hash (SHA-256) → object storage location        (immutable, ~4 MB, content-addressed)
files         namespace_id, path, latest_version
file_versions namespace_id, file_id, version, [chunk hashes…], size, modified_by, ts
journal       namespace_id, seq → change (add/modify/delete/move, file_id, version)   ← devices sync from this
```

A **namespace** is a user's root folder or a shared folder; it's the unit of sharding and of sync.

## 4. High-level design

```viz algo=arch title="File sync service" dir=down
laptop   Laptop client | watcher, chunker, local DB [client] @0,0.5
blocks   Block service | upload/download chunks [service*2] @1,0
meta     Metadata service | versions, journal [service*2] @1,1
notify   Notification service | long poll / WebSocket [bell] @1,2
s3       Chunk storage | by content hash [storage] @2,0
mdb      Metadata DB | sharded by namespace [db] @2,1
phone    Phone client [mobile] @2,2
--
laptop -> blocks : missing chunks
blocks -> s3
laptop -> meta : commit
meta -> mdb
meta ~> notify : changed
notify ~> phone : poke
phone -> meta : changes after 812
--
flow Edit a file on the laptop
laptop > meta : The client notices report.docx changed, re-chunks it, and asks: which of these 40 chunk hashes do you lack?
laptop > blocks : Only 1 chunk is new: upload it (resumable).
blocks > s3 : Stored under its hash; identical chunks from anyone are stored once.
laptop > meta : Commit: report.docx v8 = [h1, h2, …, h40]. The service checks all chunks exist, writes the version and a journal entry (seq 813).
meta > notify : Devices subscribed to this namespace are told "something changed".
notify > phone : The phone wakes up…
phone > meta : …asks for journal entries after seq 812, gets "report.docx → v8".
phone > blocks : It downloads only the chunk it doesn't have, then atomically replaces the local file.
```

## 5. Deep dives

### A. Chunking and deduplication

Files are split into chunks (~4 MB, or smaller for delta sync) addressed by **SHA-256**. Benefits: upload only **changed** chunks, **resume** by chunk, **dedup** identical chunks within and across users, and parallel transfers. With **fixed-size** chunks, inserting a few bytes at the start shifts every boundary, so every chunk changes. **Content-defined chunking** picks boundaries from the content itself (a rolling hash), so boundaries move with the data:

```js run title="Fixed-size vs content-defined chunking after a small edit"
// Fixed-size vs content-defined chunking: what must be re-uploaded after a small edit?
let seed = 21;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const words = ["sync", "file", "chunk", "block", "server", "client", "delta", "hash", "upload", "notify", "metadata", "version"];
let text = "";
while (text.length < 200_000) text += words[Math.floor(rand() * words.length)] + (rand() < 0.1 ? ".\n" : " ");
const bytes = (s) => new TextEncoder().encode(s);

const fingerprint = (buf) => {                     // stands in for SHA-256 of the chunk
  let h1 = 2166136261, h2 = 5381;
  for (const b of buf) { h1 = Math.imul(h1 ^ b, 16777619); h2 = (Math.imul(h2, 33) + b) | 0; }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
};

function fixedChunks(buf, size = 4096) {
  const out = [];
  for (let i = 0; i < buf.length; i += size) out.push(fingerprint(buf.subarray(i, i + size)));
  return out;
}

// Content-defined chunking: cut where a rolling hash of the last 32 bytes has its top 12 bits zero (~4 KB average)
const mix = (x) => { x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };
const GEAR = Array.from({ length: 256 }, (_, i) => mix(i + 1));      // a random 32-bit value per byte value
function cdcChunks(buf, mask = 0xfff00000, min = 1024, max = 16384) {
  const out = [];
  let start = 0, h = 0;
  for (let i = 0; i < buf.length; i++) {
    h = ((h << 1) + GEAR[buf[i]]) >>> 0;           // gear hash: a byte's influence shifts out after 32 steps
    const len = i - start + 1;
    if ((len >= min && (h & mask) === 0) || len >= max || i === buf.length - 1) {
      out.push(fingerprint(buf.subarray(start, i + 1)));
      start = i + 1; h = 0;
    }
  }
  return out;
}

const before = bytes(text);
const edits = {
  "edit 5 bytes in the middle": bytes(text.slice(0, 100_000) + "EDIT!" + text.slice(100_005)),
  "insert 16 bytes at the start": bytes("TITLE: Q3 notes\n" + text),
};
for (const [edit, after] of Object.entries(edits)) {
  console.log(edit + ":");
  for (const [name, fn] of [["fixed 4 KB blocks", fixedChunks], ["content-defined", cdcChunks]]) {
    const old = new Set(fn(before)), now = fn(after);
    const changed = now.filter((c) => !old.has(c)).length;
    console.log(`  ${name.padEnd(18)} ${String(now.length).padStart(3)} chunks, ${String(changed).padStart(3)} new → upload ${(changed / now.length * 100).toFixed(1)}% of the file`);
  }
}
```

Cross-user dedup saves a lot (the same installer or video uploaded by millions), but can leak whether a file exists ("do you have chunk X?"). Mitigations: dedup only within a user/team, or require proof of possession.

### B. Metadata is the source of truth

A file version becomes visible only when the **commit** succeeds: the metadata service verifies that all referenced chunks exist, then atomically writes the new version and a **journal entry**. Chunks are uploaded first and are invisible until committed, so readers never see half a file. Garbage collection deletes chunks no version references (after a grace period). The metadata DB is **sharded by namespace**; within a namespace, the journal gives a total order of changes (a sequence number per namespace).

### C. Sync protocol and notifications

Each device stores the last journal **cursor** per namespace. To sync: "give me changes after cursor N", apply them, advance the cursor. Instead of polling constantly, devices hold a **long-poll or WebSocket** connection to a notification service that only says "namespace X changed"; the device then pulls the journal. Offline devices simply sync from their cursor when they reconnect.

### D. Conflicts

Two devices edit the same file offline. On commit, the client includes the **base version** it edited (`v7 → v8`); if the server's latest is already `v8` from another device, the commit is rejected (optimistic concurrency), and the client saves its version as a **conflicted copy** ("report (Bo's conflicted copy).docx") instead of overwriting. For real-time co-editing, see the collaborative editor case study.

### E. Sharing and permissions

A shared folder is its own **namespace** mounted into each member's tree. Permissions are checked by the metadata service on every operation; chunk downloads use short-lived signed URLs issued by it. Large shared namespaces (a company drive) can become hot; they get their own shards.

## 6. Wrap-up

Clients **chunk** files (content-defined), upload only **missing chunks** to content-addressed object storage, then **commit** a version to the **metadata service**, which appends to the namespace **journal** and triggers **notifications**; other devices pull changes after their cursor and download missing chunks. Conflicts are detected with base versions and saved as conflicted copies. Monitor sync latency, commit failures, upload retries, dedup ratio, and storage growth.

```quiz
? Why does content-defined chunking beat fixed-size chunking for sync?
+ Boundaries depend on the content, so an insertion only changes nearby chunks instead of shifting every boundary
- Its chunks are smaller
- It doesn't need hashing
> With fixed blocks, one inserted byte changes every following block.

? Why are chunks uploaded before the metadata commit?
+ The commit atomically publishes a version only once all its chunks exist, so no device ever sees a partial file
- Metadata is too large to send first
- To save bandwidth
> Upload bytes, then flip the pointer atomically.

? Two devices edited the same file offline. What happens when the second one syncs?
+ Its commit is based on an old version, so it's rejected and saved as a conflicted copy
- The last writer silently wins
- Both edits are merged line by line automatically
> Optimistic concurrency with base versions.
```

:::keypoints
- Split files into **content-addressed chunks**: upload only changed chunks, resume, dedup, parallelise; **content-defined chunking** survives insertions.
- **Bytes** in object storage, **metadata** (versions = lists of chunk hashes) in a DB sharded by **namespace**: the source of truth.
- Commit atomically after chunks exist; a per-namespace **journal** with cursors drives sync; a **notification** channel tells devices to pull.
- Conflicts via **base versions** → conflicted copies; shared folders are namespaces; chunk downloads via signed URLs.
:::
