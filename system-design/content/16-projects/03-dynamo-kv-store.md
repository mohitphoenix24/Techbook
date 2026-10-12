---
title: Build a Dynamo-Style Key-Value Store
level: advanced
time: 60
icon: network
cover: #7c3aed,#ec4899
tags: consistent hashing, quorums, Merkle trees, hinted handoff, eventual consistency
summary: Build the replication machinery of Dynamo and Cassandra in simulated time — Merkle-tree anti-entropy that finds divergent keys with a handful of hashes, then a cluster with a hash ring, sloppy N/R/W quorums, replication delays, read repair and hinted handoff, and an experiment that measures stale reads for every R/W setting.
---

The key-value store case study described the Dynamo toolbox; here you'll build it and **measure** it. You'll see why `R + W > N` matters (with numbers, not just a rule), how a node that was down catches up, and how two replicas find their differences without comparing everything.

:::flow What you'll build
Merkle trees | hash ranges of keys, compare top-down
Hash ring | vnodes, preference lists of N distinct nodes
Quorum writes/reads | wait for W acks, read R replicas, newest wins
Simulated network | random delays, so replicas really lag
Failures | sloppy quorum, hints, handoff on recovery
Experiment | stale-read rate for every (W, R)
:::

## Step 1: Merkle-tree anti-entropy

Two replicas of 10,000 keys differ in three places. Sending all keys to compare would cost 20,000 entries. Instead, each replica hashes its keys into 64 **ranges**, hashes each range, and builds a binary **hash tree** over them. Comparing trees top-down only descends where hashes differ:

```js run title="Merkle trees find 3 divergent keys out of 10,000"
// Step 1: Merkle-tree anti-entropy — find the few keys two replicas disagree on without sending every key
const h32 = (s) => {                                     // FNV-1a + Murmur3 finalizer
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};
const LEAVES = 64;                                       // the key space is split into 64 ranges

function merkle(replica) {                               // replica: Map key → value (with a version inside)
  const buckets = Array.from({ length: LEAVES }, () => []);
  for (const [k, v] of replica) buckets[h32(k) % LEAVES].push(`${k}=${v}`);
  let level = buckets.map((b) => h32(b.sort().join("|")));    // leaf hash = hash of its range's contents
  const levels = [level];
  while (level.length > 1) {                             // parent = hash(left child, right child)
    level = Array.from({ length: level.length / 2 }, (_, i) => h32(`${level[2 * i]}:${level[2 * i + 1]}`));
    levels.unshift(level);
  }
  return { levels, buckets };
}

function diff(a, b) {                                    // walk down only where hashes differ
  let exchanged = 0, frontier = [0];
  for (let d = 0; d < a.levels.length; d++) {
    exchanged += frontier.length * 2;                    // both sides send these hashes
    frontier = frontier.filter((i) => a.levels[d][i] !== b.levels[d][i]);
    if (d < a.levels.length - 1) frontier = frontier.flatMap((i) => [2 * i, 2 * i + 1]);
  }
  return { ranges: frontier, exchanged };
}

const A = new Map(), B = new Map();
for (let i = 0; i < 10000; i++) { A.set(`user:${i}`, "v1"); B.set(`user:${i}`, "v1"); }
B.set("user:42", "v2"); B.set("user:7777", "v2"); B.delete("user:9001");   // B missed / got some writes
const ta = merkle(A), tb = merkle(B);
const { ranges, exchanged } = diff(ta, tb);
const keysToCompare = ranges.reduce((s, r) => s + ta.buckets[r].length + tb.buckets[r].length, 0);
console.log(`roots equal? ${ta.levels[0][0] === tb.levels[0][0]}`);
console.log(`differing ranges: [${ranges.join(", ")}] after exchanging ${exchanged} hashes`);
console.log(`then compare ${keysToCompare} keys in those ranges instead of 20,000`);
const bad = ranges.flatMap((r) => {
  const sa = new Set(ta.buckets[r]), sb = new Set(tb.buckets[r]);
  return [...new Set([...sa, ...sb])].filter((x) => !(sa.has(x) && sb.has(x))).map((x) => x.split("=")[0]);
});
console.log("keys to repair:", [...new Set(bad)].sort().join(", "));
```

Cassandra's `nodetool repair` and Dynamo's background anti-entropy work this way (with trees per token range, built from a snapshot of the data).

## Step 2: a cluster with quorums, delays and failures

Now a five-node cluster with a ring of virtual nodes. Writes go to the key's **N = 3** home replicas and are acknowledged after **W** replies; reads ask **R** replicas and take the newest version, repairing stale ones. Messages take random time to arrive, so a replica can genuinely be behind when it's read.

```js run title="Quorums measured: stale reads per (W, R), plus hinted handoff"
// Step 2: a Dynamo-style cluster in simulated time — ring, N/R/W quorums, replication delay,
// failures with hinted handoff, read repair, and a stale-read experiment
const h32 = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};
let seed = 3;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const delay = () => -Math.log(rand()) * 10;                      // network + disk: ~10 ms on average, long tail

class Cluster {
  constructor(names, { n = 3, vnodes = 16 } = {}) {
    this.n = n;
    this.nodes = new Map(names.map((x) => [x, { up: true, data: new Map(), hints: [] }]));
    this.ring = names.flatMap((x) => Array.from({ length: vnodes }, (_, v) => [h32(`${x}#${v}`), x])).sort((a, b) => a[0] - b[0]);
  }
  walk(key) {                                                    // distinct nodes clockwise from the key
    const out = [], hk = h32(key);
    let i = this.ring.findIndex(([p]) => p >= hk); if (i < 0) i = 0;
    for (let k = 0; out.length < this.nodes.size; k++) { const x = this.ring[(i + k) % this.ring.length][1]; if (!out.includes(x)) out.push(x); }
    return out;
  }
  store(node, key, rec) {                                        // keep the newest version (LWW by version number)
    const cur = this.nodes.get(node).data.get(key);
    if (!cur || cur.ver < rec.ver) this.nodes.get(node).data.set(key, rec);
  }
  // A write: send to the first N healthy nodes (sloppy quorum); returns the time when W acks arrived
  put(key, value, ver, now, w) {
    const pref = this.walk(key), home = pref.slice(0, this.n), targets = pref.filter((x) => this.nodes.get(x).up).slice(0, this.n);
    const missing = home.filter((x) => !targets.includes(x));
    const acks = targets.map((x) => {
      const at = now + delay(), rec = { value, ver, at };
      const hintFor = home.includes(x) ? null : missing.shift();
      if (hintFor) this.nodes.get(x).hints.push({ for: hintFor, key, rec });
      else this.pending.push({ at, node: x, key, rec });           // applied when the message arrives
      return at;
    }).sort((a, b) => a - b);
    return acks[w - 1];
  }
  deliver(now) {
    this.pending = this.pending.filter((m) => (m.at <= now ? (this.store(m.node, m.key, m.rec), false) : true));
  }
  get(key, now, r) {                                             // ask R of the home replicas; newest wins; repair others
    const replicas = this.walk(key).filter((x) => this.nodes.get(x).up).slice(0, this.n).slice(0, r);
    const seen = replicas.map((x) => this.nodes.get(x).data.get(key)).filter(Boolean);
    const best = seen.sort((a, b) => b.ver - a.ver)[0];
    if (best) replicas.forEach((x) => this.store(x, key, best));   // read repair
    return best;
  }
  recover(name) {
    this.nodes.get(name).up = true;
    let handed = 0;
    for (const [, nd] of this.nodes) nd.hints = nd.hints.filter((h) => (h.for === name ? (this.store(name, h.key, h.rec), handed++, false) : true));
    return handed;
  }
}

// Experiment 1: write, then read soon after from R replicas. How often is the read stale?
console.log("stale reads after 2,000 write→read pairs (N=3, read starts 0–5 ms after the write is acknowledged):");
for (const [w, r] of [[1, 1], [1, 2], [2, 1], [2, 2], [1, 3], [3, 1]]) {
  const c = new Cluster(["A", "B", "C", "D", "E"]);
  c.pending = [];
  let stale = 0;
  for (let i = 0; i < 2000; i++) {
    const key = `k${i % 50}`, now = i * 100;
    c.deliver(now);
    const acked = c.put(key, `v${i}`, i, now, w);
    const readAt = acked + rand() * 5;
    c.deliver(readAt);
    if (c.get(key, readAt, r)?.ver !== i) stale++;
  }
  console.log(`  W=${w} R=${r} ${w + r > 3 ? "(R+W>N)" : "       "}: ${(100 * stale / 2000).toFixed(1).padStart(5)}% stale`);
}

// Experiment 2: a node fails; writes continue via hints; it recovers and catches up
const c = new Cluster(["A", "B", "C", "D", "E"]);
c.pending = [];
const key = "cart:42", home = c.walk(key).slice(0, 3);
c.nodes.get(home[2]).up = false;
console.log(`\nhome replicas of ${key}: ${home.join(",")}; ${home[2]} is down`);
for (let v = 1; v <= 3; v++) { c.put(key, `items×${v}`, v, v * 100, 2); c.deliver(v * 100 + 1000); }
console.log(`  hints held for ${home[2]}: ${[...c.nodes.values()].reduce((s, nd) => s + nd.hints.filter((h) => h.for === home[2]).length, 0)}`);
console.log(`  ${home[2]} recovers, hinted handoff delivers ${c.recover(home[2])} writes; it now has ${c.nodes.get(home[2]).data.get(key).value}`);
console.log(`  quorum read (R=2): ${c.get(key, 5000, 2).value}`);
```

With `R + W ≤ N`, a read can hit only replicas the write hasn't reached yet: up to half of the reads right after a write are stale. With `R + W > N`, every read set **overlaps** every write set, and stale reads disappear. When a home replica is down, writes still succeed (a stand-in node keeps **hints**), and the node catches up the moment it returns.

## How it works

| Piece | Here | In Dynamo / Cassandra / Riak |
|---|---|---|
| Partitioning | ring of 16 vnodes per node, FNV + Murmur3 mixing | 256 vnodes (Cassandra), Murmur3 partitioner |
| Replication | first N distinct nodes clockwise | the same, plus rack/AZ awareness |
| Versioning | integer versions, newest wins (LWW) | timestamps (Cassandra) or vector clocks (Dynamo, Riak) |
| Quorums | W acks, R replies | per-request consistency levels: ONE, QUORUM, ALL, LOCAL_QUORUM |
| Read repair | write the newest version to stale replicas read | the same, plus probabilistic background read repair |
| Hinted handoff | a stand-in keeps hints and delivers on recovery | hints stored with a time limit (e.g. 3 hours) |
| Anti-entropy | Merkle trees over 64 ranges | per-token-range Merkle trees (`nodetool repair`) |

:::exercise Extend it
1. Replace integer versions with **vector clocks** and return **siblings** for concurrent writes (two clients writing the same version).
2. Make reads ask **all N** replicas and use the first R replies (as real coordinators do), then measure latency vs R.
3. Give hints a **time limit**; when they expire, rely on Merkle repair. Measure how long a node can be down before repair is needed.
4. Add a sixth node: move the vnodes it takes over and stream those ranges from their old owners. How many keys move?
5. Run Merkle repair between all replica pairs after a long partition and count the hashes exchanged vs keys repaired.
:::

:::keypoints
- **Merkle trees** let replicas find differences by exchanging a few dozen hashes instead of every key.
- `R + W > N` makes read and write sets **overlap**, eliminating stale reads after acknowledged writes; smaller R/W trade consistency for latency and availability.
- **Sloppy quorums + hinted handoff** keep writes available when home replicas are down; **read repair** and **anti-entropy** heal the rest.
- Replication delay is real: measure consistency, don't assume it.
:::
