---
title: Design a Distributed Key-Value Store (Dynamo)
level: advanced
time: 55
summary: Putting the Distributed Systems module together — a highly available, horizontally scalable key-value store with consistent hashing and virtual nodes, N-way replication with a preference list, tunable quorums, versioning and conflict resolution, hinted handoff, Merkle-tree anti-entropy, gossip membership, an LSM storage engine, and tombstones for deletes.
---

:::problem Design a Key-Value Store {level=hard tags="HLD,consistent hashing,quorums,replication"}
Design a distributed key-value store (like Amazon Dynamo, Cassandra or Riak) that supports `put(key, value)` and `get(key)`, scales to many terabytes across hundreds of nodes, stays writable during node and network failures, and lets each application choose its consistency level.

:::hint Hint
Walk through the Dynamo toolbox one problem at a time: how to partition (consistent hashing), how to replicate (preference lists), how to read/write (quorums), how to detect conflicts (version vectors), how to survive temporary failures (hinted handoff), permanent divergence (Merkle trees) and membership changes (gossip).
:::
:::

## 1. Requirements

**Functional**: `put(key, value)`, `get(key)`, `delete(key)`; values up to ~1 MB.

**Non-functional**
- **Scalable**: add nodes to grow storage and throughput roughly linearly; no single coordinator.
- **Highly available for writes**, even during node failures and partitions (an "always writable" shopping cart was Dynamo's original goal).
- **Tunable consistency** per request: strong-ish (quorum) or fast (eventual).
- **Durable**: data on N replicas.
- Low latency: single-digit milliseconds at p99 inside a region.

## 2. Estimates

Assume **100 TB** of data, 1 KB average value, **500K reads/s and 200K writes/s** at peak, N = 3.

:::derive Sizing the cluster
\text{stored} = 100\,\text{TB} \times 3 = 300\,\text{TB} || three replicas
\text{per node} \approx 2\,\text{TB (half of a 4 TB disk, room for compaction)} || LSM compaction needs free space
\text{nodes for capacity} = 300 / 2 = 150 ||
\text{replica writes} = 200\text{K} \times 3 = 600\text{K/s} \Rightarrow 4\text{K/s per node} || easy for an LSM engine
!\approx 150\text{–}200 \text{ nodes; capacity, not throughput, sets the size} ||
:::

## 3. API and data model

```text
get(key)                    → [ (value, context), … ]     one value, or several siblings on conflict
put(key, value, context)    → ok                          context = the version vector the client read
delete(key, context)        → ok                          writes a tombstone
per request: consistency level (ONE, QUORUM, ALL, LOCAL_QUORUM)
```

The value is an **opaque blob**: the store doesn't interpret it. Each stored version is `(key, value, version vector)`; the **context** returned by `get` must be passed back on `put` so the store knows which versions the new write supersedes.

## 4. The building blocks, mapped to problems

| Problem | Technique | Lesson |
|---|---|---|
| Partition data across nodes | **consistent hashing** with **virtual nodes** | consistent hashing |
| Replicate for durability/availability | store each key on the **next N distinct nodes** on the ring (the preference list) | consistent hashing |
| Tunable consistency | **quorum** reads/writes: N, W, R | quorums |
| Detect conflicting writes | **version vectors** (vector clocks); or last-write-wins | time & ordering |
| Temporary node failures | **sloppy quorum + hinted handoff** | quorums |
| Permanent divergence | **anti-entropy with Merkle trees**, plus read repair | quorums |
| Membership & failure detection | **gossip** + phi-accrual detection | quorums |
| Fast durable writes on each node | **LSM tree**: commit log → memtable → SSTables + Bloom filters | storage engines |

## 5. Architecture

Every node is identical (no master); any node can **coordinate** a request.

```viz algo=arch title="A leaderless key-value store"
client   Client library | knows the ring [client]
coord    Coordinator | any node [service]
n1       Node A | replica 1 for key K [db]
n2       Node B | replica 2 [db]
n3       Node C | replica 3 [db]
n4       Node D | stand-in (hinted) [db]
--
client -> coord : put(K, v)
coord -> n1 : write ×3
coord -> n2
coord -> n3
coord ~> n4 : hint if C down
n1 <-> n2 : gossip, Merkle sync
--
flow put with N=3, W=2
client > coord : put("cart:42", {...}) arrives at any node (or the client routes directly to a replica).
coord > n1 : The coordinator finds K's preference list on the ring: A, B, C. It sends the write to all three.
coord > n2 : As soon as W = 2 replicas acknowledge (each appended to its commit log + memtable)…
coord > client : …the write succeeds. C's ack arrives later or is repaired later.
flow put while node C is down
coord > n4 : C doesn't answer: write to D (the next healthy node) with a hint "belongs to C" (sloppy quorum).
n4 > n3 : When C recovers, D hands the data over and drops its copy (hinted handoff).
```

## 6. Write and read paths

**Write (put)**
1. The coordinator computes the preference list (N distinct nodes clockwise from `hash(key)`, in different racks/AZs).
2. It attaches a **version** (an updated version vector, or a timestamp for LWW).
3. Sends to all N; succeeds after **W** acks. On each replica: append to the **commit log** (durability), insert into the **memtable**; flush to SSTables later.

**Read (get)**
1. Send to the replicas (or R of them); wait for **R** responses.
2. If versions differ: return the newest, or **all concurrent siblings** if version vectors show a conflict (the client merges, e.g. union of cart items).
3. **Read repair**: write the newest version back to stale replicas.

Try the quorum behaviour again:

```viz algo=quorum title="N, W and R in the key-value store"
n = 3
w = 2
r = 2
```

Typical settings (N = 3): `W = 2, R = 2` balanced; `W = 1, R = 3` very fast writes; `W = 3, R = 1` very fast reads; `W = 1, R = 1` maximum availability, eventual consistency (sessions, metrics).

## 7. Deep dives

### A. Partitioning and rebalancing

Virtual nodes (e.g. 256 tokens per physical node) spread load evenly and make adding a node move only ~1/N of the data, pulled from many existing nodes in parallel (fast rebuilds). Heterogeneous hardware gets proportionally more tokens. A new node **streams** its ranges from their current owners before it starts serving them.

```viz algo=hashring title="Ranges move only near the new node"
nodes = A,B,C,D
vnodes = 8
keys = 80
```

### B. Conflicts: version vectors vs last-write-wins

- **Last-write-wins** (Cassandra's default): simple; concurrent writes are silently lost, and clock skew decides the winner. Fine for idempotent overwrites (a user's profile picture URL).
- **Version vectors** (Dynamo, Riak): detect concurrent updates and keep **siblings**; the application or a CRDT merges them (shopping cart = union; counters = G-counters). No silent loss, more complexity.

The whole read/write path in a few dozen lines: a ring with virtual nodes, a preference list, a sloppy quorum with hinted handoff, version vectors that detect concurrent writes, read repair, and a client merging siblings:

```js run title="A tiny Dynamo: preference lists, hints, version vectors, siblings"
// A tiny Dynamo: ring with vnodes, N=3 replicas, W=2, R=2, version vectors, hinted handoff, read repair
const hash = (s) => {                                   // FNV-1a + Murmur3 finalizer → well-spread 32-bit
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};
const N = 3, W = 2, R = 2;
const nodes = new Map(["A", "B", "C", "D", "E"].map((n) => [n, { up: true, data: new Map(), hints: [] }]));
const ring = [...nodes.keys()].flatMap((n) => [0, 1, 2, 3].map((v) => ({ pos: hash(`${n}#${v}`), node: n })))
  .sort((a, b) => a.pos - b.pos);

// Walk clockwise from hash(key), collecting distinct physical nodes
function walk(key) {
  const h = hash(key), out = [];
  let i = ring.findIndex((t) => t.pos >= h); if (i < 0) i = 0;
  for (let k = 0; out.length < nodes.size; k++) { const n = ring[(i + k) % ring.length].node; if (!out.includes(n)) out.push(n); }
  return out;
}
const prefList = (key) => walk(key).slice(0, N);

// Version vectors: {A: 2, B: 1}
const descends = (a, b) => Object.keys(b).every((n) => (a[n] || 0) >= b[n]);   // a has seen everything b has
const vcStr = (vc) => "{" + Object.entries(vc).map(([k, v]) => `${k}:${v}`).join(",") + "}";

function store(node, key, version) {             // keep only versions not dominated by another
  const old = node.data.get(key) || [];
  if (old.some((v) => descends(v.vc, version.vc))) return;          // already have it or newer
  node.data.set(key, [...old.filter((v) => !descends(version.vc, v.vc)), version]);
}

function put(key, value, context = {}) {
  const [coord] = walk(key).filter((n) => nodes.get(n).up);          // first healthy node coordinates
  const vc = { ...context, [coord]: (context[coord] || 0) + 1 };
  const intended = prefList(key), down = intended.filter((n) => !nodes.get(n).up);
  const standIns = walk(key).slice(N).filter((n) => nodes.get(n).up);   // sloppy quorum: next healthy nodes
  let acks = 0;
  for (const n of intended) if (nodes.get(n).up) { store(nodes.get(n), key, { value, vc }); acks++; }
  down.forEach((d, i) => {
    const s = standIns[i]; if (!s) return;
    nodes.get(s).hints.push({ for: d, key, version: { value, vc } }); acks++;
    console.log(`  ${d} is down → ${s} keeps a hint for ${d}`);
  });
  console.log(`put ${key}=${JSON.stringify(value)} via ${coord} vc=${vcStr(vc)} acks=${acks}/${N} (need W=${W}) ${acks >= W ? "OK" : "FAILED"}`);
}

function get(key) {
  const replicas = prefList(key).filter((n) => nodes.get(n).up).slice(0, R);
  if (replicas.length < R) return console.log(`get ${key}: only ${replicas.length} replicas up, need R=${R}`);
  const all = replicas.flatMap((n) => nodes.get(n).data.get(key) || []);
  const latest = all.filter((v, i) => !all.some((w, j) => j !== i && descends(w.vc, v.vc) && vcStr(w.vc) !== vcStr(v.vc)))
    .filter((v, i, arr) => arr.findIndex((w) => vcStr(w.vc) === vcStr(v.vc)) === i);
  for (const n of replicas) for (const v of latest) store(nodes.get(n), key, v);     // read repair
  console.log(`get ${key} from ${replicas.join(",")}: ` + latest.map((v) => `${JSON.stringify(v.value)} ${vcStr(v.vc)}`).join("  |  ")
    + (latest.length > 1 ? "  ← siblings (concurrent writes)" : ""));
  return latest;
}

function recover(name) {
  nodes.get(name).up = true;
  for (const [, n] of nodes) n.hints = n.hints.filter((h) => {
    if (h.for !== name) return true;
    store(nodes.get(name), h.key, h.version); console.log(`  hinted handoff: ${h.key} → ${name}`); return false;
  });
}

const key = "cart:42";
console.log("preference list for", key, "=", prefList(key).join(", "));
put(key, ["milk"]);
let [v] = get(key);

const third = prefList(key)[2];
nodes.get(third).up = false;
console.log(`\n-- ${third} crashes --`);
put(key, ["milk", "eggs"], v.vc);
recover(third);
console.log(`${third} now has:`, JSON.stringify(nodes.get(third).data.get(key)[0].value));

console.log("\n-- two clients update the same version concurrently (e.g. during a partition) --");
[v] = get(key);
const coord = prefList(key)[0];
nodes.get(coord).up = false;                               // the second write is coordinated by another node
put(key, ["milk", "eggs", "bread"], v.vc);
recover(coord);                                            // A returns and receives its hinted write
put(key, ["milk", "eggs", "jam"], v.vc);
const sibs = get(key);
const merged = [...new Set(sibs.flatMap((s) => s.value))];
const ctx = sibs.reduce((acc, s) => { for (const [n, c] of Object.entries(s.vc)) acc[n] = Math.max(acc[n] || 0, c); return acc; }, {});
console.log("client merges siblings (set union) and writes back with the merged context:");
put(key, merged, ctx);
get(key);
```

Notice the two concurrent writes: `{A:3}` and `{A:2,D:1}` don't descend from each other, so **both** survive as siblings, and nothing is silently lost. With last-write-wins, one of "bread" and "jam" would have vanished.

### C. Deletes

You can't just remove a key: a replica that missed the delete would later "resurrect" it during repair. Deletes write a **tombstone** (a marker with a version) that propagates like a write; tombstones are garbage-collected after a grace period longer than the maximum repair interval.

### D. Failure detection and membership

Nodes **gossip** heartbeats and ring membership every second; a **phi-accrual** detector marks a node down only when its heartbeats are statistically overdue. Temporary failures are handled by **hinted handoff**; permanent ones by an administrator (or automation) removing the node, after which its ranges are re-replicated from the surviving replicas. **Merkle-tree anti-entropy** runs in the background to find and fix any divergence.

### E. Storage engine on each node

Writes: commit log (sequential append) → memtable → flush to immutable SSTables. Reads: memtable → SSTables newest-first, skipping files with per-SSTable **Bloom filters**; a row cache for hot keys. **Compaction** merges SSTables and drops overwritten values and expired tombstones. This makes the write path extremely fast (the Project Lab builds a mini LSM engine).

### F. Multi-datacenter

Replicate to N replicas **per data centre** (e.g. 3 + 3) and offer `LOCAL_QUORUM` for low-latency reads/writes within a region, with async replication between regions; or `EACH_QUORUM` when stronger cross-region guarantees are worth the latency.

## 8. Wrap-up

Strengths: linear scalability, no single point of failure, writes available through failures, consistency tunable per request. Costs: eventual consistency by default, conflict handling (or LWW data loss), operational complexity (repairs, tombstones, compaction tuning). Monitor per-node latency and load (hot partitions), pending hints, repair progress, tombstone counts, compaction backlog, and disk usage.

```quiz
? Why can't a Dynamo-style store simply remove a key on delete?
+ A replica that missed the delete would later re-propagate the old value during repair; a tombstone records the deletion as a versioned write
- Deleting is too slow
- Keys are immutable
> Deletes must win against older versions everywhere, so they're represented as data.

? Node C is down when a write for one of its keys arrives (N = 3, W = 2). How does the store stay writable?
+ A healthy node outside the preference list accepts the write with a hint, and hands it to C when C recovers (sloppy quorum + hinted handoff)
- The write fails until C returns
- The coordinator stores it in memory only
> Availability for writes is a core Dynamo goal.

? Which mechanism finds which keys differ between two replicas without comparing every key?
+ Merkle trees: compare root hashes, descend only into differing subtrees
- Gossip
- Vector clocks
> Anti-entropy with hash trees exchanges very little data.
```

:::keypoints
- Leaderless and symmetric: any node coordinates; data placed by **consistent hashing with vnodes**; replicas = next **N distinct nodes** across racks/AZs.
- **Quorums** (N, W, R) tune consistency vs latency per request; **read repair** fixes stale replicas.
- Conflicts via **version vectors + siblings/CRDT merges**, or **LWW** (simpler, may lose writes).
- **Hinted handoff** (temporary failures), **Merkle anti-entropy** (divergence), **gossip + phi-accrual** (membership), **tombstones** (deletes).
- Each node runs an **LSM engine** (commit log, memtable, SSTables, Bloom filters, compaction); multi-DC with LOCAL_QUORUM.
:::
