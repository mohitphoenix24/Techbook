---
title: Object Storage for Files, Images and Video
level: intermediate
time: 35
summary: Block vs file vs object storage, how S3-style object stores work (buckets, keys, metadata separation, replication vs erasure coding, eleven nines), uploading large files with pre-signed URLs and multipart uploads, serving through a CDN, storage tiers and lifecycle rules.
---

Photos, videos, documents, backups, logs, ML datasets: most of the **bytes** in a modern system aren't rows in a database. They're **blobs** (binary large objects), and they live in **object storage** like Amazon S3, Google Cloud Storage or Azure Blob Storage. Nearly every case study that involves media (Instagram, YouTube, Dropbox, WhatsApp attachments) depends on getting this part right.

## Three kinds of storage

| | Block storage | File storage | Object storage |
|---|---|---|---|
| What you get | a raw disk (volumes of blocks) | a shared file system with folders | a flat namespace of objects (key → bytes + metadata) |
| Accessed via | the OS, mounted on **one** server | NFS/SMB, mounted by **many** servers | **HTTP API** (PUT/GET/DELETE) from anywhere |
| Examples | AWS EBS, local SSDs | AWS EFS, NFS servers | S3, GCS, Azure Blob, MinIO, Ceph |
| Scale | up to ~tens of TB per volume | large, but limited | effectively unlimited (exabytes) |
| Latency | sub-millisecond | milliseconds | tens of milliseconds (first byte) |
| Modify in place | yes, any byte | yes | **no**: objects are replaced as a whole |
| Cost | highest | high | **lowest** per GB |
| Used for | database disks, VM boot disks | shared configs, legacy apps | media, backups, data lakes, static websites |

:::def Object storage
A storage service where each **object** is an immutable blob of bytes plus **metadata**, addressed by a **key** inside a **bucket** (`s3://photos-prod/u42/2026/03/abc.jpg`). There are no real folders (the `/` is just part of the key) and no partial updates: you upload a new version of the whole object.
:::

## Why blobs don't go in the database

Storing a 3 MB photo as a `BYTEA`/`BLOB` column technically works, but:

- It **bloats the database**: backups, replication and caches all carry the image bytes.
- Database storage (fast SSDs, replicated) costs many times more per GB than object storage.
- Serving bytes through the database ties up connections and memory meant for queries.
- CDNs can't fetch from a database; they can fetch from object storage directly.

The standard pattern: **bytes in object storage, metadata in the database**.

```text
photos (PostgreSQL)
id        | owner_id | object_key                          | width | height | size_bytes | status | created_at
ph_19x7   | 42       | u42/2026/03/ph_19x7/original.jpg     | 4032  | 3024   | 3145728    | READY  | 2026-03-14 10:22
```

## How an object store achieves durability

Object stores typically promise **99.999999999% (eleven nines) durability** per year: store 10 million objects and you'd expect to lose one every 10,000 years. Two techniques make that possible:

**1. Replication**: store full copies on 3 different machines (in different availability zones). Simple and fast to read and repair, but it costs **3× the storage**.

**2. Erasure coding**: split an object into *k* data fragments, compute *m* parity fragments (Reed–Solomon codes), and store all *k + m* on different machines. **Any *k*** of them can rebuild the object.

```js run title="Replication vs erasure coding: overhead and failures tolerated"
const schemes = [
  { name: "3× replication",         k: 1,  m: 2 },
  { name: "Reed-Solomon (6 + 3)",   k: 6,  m: 3 },
  { name: "Reed-Solomon (10 + 4)",  k: 10, m: 4 },
];
for (const { name, k, m } of schemes) {
  const overhead = (k + m) / k;
  console.log(`${name.padEnd(22)} stores ${overhead.toFixed(2)}× the data, survives ${m} lost fragments`);
}
```

Erasure coding survives **more** failures with **half** the storage overhead. The costs: reading or repairing requires fetching fragments from several machines and computing, so it's used for large, colder data, while small or hot objects are often replicated.

The other piece is a **metadata layer** separate from the data:

```viz algo=arch title="Inside an object store (simplified)"
client   Client [client]
api      API front end | auth, routing [gateway]
meta     Metadata service | bucket + key → fragment locations [db]
d1       Storage node 1 [storage]
d2       Storage node 2 [storage]
d3       Storage node 3 [storage]
--
client -> api : PUT / GET
api -> meta : where does this key live?
api -> d1 : fragments
api -> d2
api -> d3
```

Separating a small, strongly consistent **metadata service** (which knows where every object's fragments are) from huge, simple **data nodes** is the key design idea. It also appears in the Dropbox and distributed file system designs. (Since 2020, S3 gives strong read-after-write consistency for objects.)

## Uploading: don't proxy the bytes

A naive design uploads files **through** your app servers: client → API server → S3. With large files and many users, your servers spend all their bandwidth and memory shuffling bytes.

:::def Pre-signed URL
A URL generated by your backend that grants **temporary permission** (e.g. 15 minutes) to upload or download **one specific object** directly from object storage. It's signed with your credentials, so the client never sees them.
:::

```viz algo=seq title="Direct-to-storage upload with a pre-signed URL"
participant c Client [mobile]
participant api API server [service]
participant s3 Object storage [storage]
participant q Queue [queue]
c -> api : POST /uploads {type: image/jpeg, size: 3 MB} | The API checks auth, size limits, quotas.
api --> c : {uploadUrl (signed, 15 min), photoId} | The API records the photo as PENDING in the DB.
c -> s3 : PUT bytes to uploadUrl | The bytes go straight to storage, never through your servers.
s3 --> c : 200 OK
s3 ->> q : event: object created | Storage notifies the backend (or the client calls "upload complete").
q ->> api : process ph_19x7 → thumbnails, mark READY
```

For big files, use **multipart (chunked) uploads**: split the file into parts (e.g. 5–100 MB each), upload them **in parallel**, retry failed parts individually, then call "complete" to assemble the object. A dropped connection at 90% of a 4 GB video then costs one part, not the whole upload. **Resumable uploads** keep track of the parts already received so the client can continue after going offline.

## Downloading: CDN in front

Reads go through a **CDN** that fetches from the bucket on a miss, so popular files are served from the edge. For **private** files (your documents, paid videos), the backend issues a short-lived **signed download URL** (or signed CDN cookies) after checking permissions. The bucket itself is never public.

Image-heavy apps add an **image service** that generates sizes on demand (`/img/ph_19x7?w=320&fmt=webp`), caches each variant on the CDN, and avoids pre-generating dozens of sizes nobody requests.

## Storage tiers and lifecycle rules

Object stores offer classes trading **access cost and latency** for **storage price**:

| Tier | Storage price | Retrieval | Use for |
|---|---|---|---|
| Standard / hot | highest of the tiers | instant, cheap | recent and popular content |
| Infrequent access | ~40–50% cheaper | instant, per-GB fee | backups, older media |
| Archive (Glacier, Archive) | 5–20× cheaper | minutes to hours | compliance archives, raw logs |

**Lifecycle rules** move objects automatically: "photos untouched for 90 days → infrequent access; raw upload originals after 1 year → archive; temporary files → delete after 7 days." At petabyte scale this is a major cost lever, and saying so in an interview shows real-world sense.

## Other practical details

- **Key design**: include the owner and a unique id (`u42/ph_19x7/original.jpg`); avoid user-supplied file names as keys. Old guidance about randomising key prefixes for performance mostly no longer applies on S3 (it scales request rates per prefix automatically), but well-distributed keys still help other stores.
- **Versioning** keeps old versions on overwrite or delete (protection from accidents and ransomware).
- **Content hashing** for **deduplication**: store each unique blob once, keyed by its SHA-256 (Dropbox's design).
- **Validation**: scan uploads for malware, check real file types, strip location metadata (EXIF GPS) from public photos.
- **Data lakes** store analytics data (Parquet files) in object storage and query it in place (Athena, BigQuery external tables, Spark).

:::problem Design file attachments for a chat app {level=medium tags="object storage,pre-signed URLs,CDN"}
Users of a chat app send photos, videos (up to 2 GB) and documents to individual chats and groups of up to 1,000 people. Attachments must only be visible to members of the chat. Describe the upload flow, the storage layout, how recipients download, and how you'd keep costs down for old attachments.

:::hint Hint
Separate the bytes from the message record, keep app servers out of the data path, and remember the CDN can't check chat membership by itself.
:::

:::solution
- **Upload**: the client asks the API for an upload slot (`POST /attachments` with size and type). The API checks quotas and returns a **pre-signed multipart upload** for `att/{attachmentId}`. The client uploads parts in parallel directly to object storage, resuming failed parts. On completion, a worker generates a thumbnail/preview and (for video) a lower-quality preview stream, and marks the attachment READY. The message itself stores only `attachmentId`, type, size and thumbnail key.
- **Storage**: object storage with server-side encryption; metadata (owner, chat id, key, size, hash, status) in the database. **Deduplicate** forwarded files by content hash: a meme forwarded to 50 chats is stored once.
- **Download**: a recipient requests `GET /attachments/{id}`. The API checks **chat membership**, then returns a **short-lived signed URL** (CDN-signed, a few minutes). The CDN caches the object, but every access URL is signed, so non-members can't fetch it. Thumbnails can use longer-lived signed URLs.
- **Cost**: lifecycle rules move attachments older than ~60 days to an infrequent-access tier and very old originals to archive (with on-demand restore and a "downloading…" state). Expire previews that can be regenerated.
:::
:::

```quiz
? Why store photos in object storage and only their metadata in the database?
+ Object storage is far cheaper per GB, scales without limit, and CDNs can serve from it, while blobs would bloat the database, its backups and replicas
- Databases can't store binary data
- Object storage supports SQL joins
> The bytes go where bytes are cheap and servable; the database keeps the small, queryable facts about them.

? What does a pre-signed URL let you do?
- Encrypt a file with the user's password
+ Let a client upload or download one specific object directly from storage for a limited time, without your servers handling the bytes
- Make a bucket public
> The backend authorises the operation and signs a time-limited URL; the data path bypasses the application servers.

? Compared with 3× replication, a 10 + 4 erasure code…
+ uses about 1.4× storage and survives up to 4 lost fragments, but reads and repairs need data from several nodes and some computation
- uses more storage and survives fewer failures
- needs no metadata
> Erasure coding is far more storage-efficient for the durability it buys, at a CPU and network cost.
```

:::keypoints
- **Block** storage = a disk for one server; **file** storage = a shared file system; **object** storage = HTTP key → immutable blob + metadata, unlimited and cheapest.
- Keep **bytes in object storage, metadata in the database**, and serve reads through a **CDN** (signed URLs for private content).
- Durability (eleven nines) comes from **replication** or **erasure coding** (much less overhead), plus a separate **metadata service**.
- Upload directly to storage with **pre-signed URLs**; use **multipart, resumable** uploads for large files; process asynchronously from a queue.
- Use **storage tiers and lifecycle rules** to cut costs, and content hashing for **deduplication**.
:::
