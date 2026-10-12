---
title: Design a Leaderboard and Top-K (Trending)
level: intermediate
time: 45
summary: Two ranking problems interviewers love — a real-time game leaderboard with Redis sorted sets (updates, top N, "my rank", players around me, ties, periodic boards, sharding past one node), and top-k heavy hitters over a stream (trending hashtags) with windows, Count-Min Sketch and heaps, merged across partitions.
---

:::problem Design a Leaderboard and Trending Top-K {level=medium tags="HLD,Redis,sorted sets,streaming"}
**Part 1**: a mobile game with **50 M daily players** needs a real-time leaderboard: show the global top 100, each player's exact rank, and the players just above and below them; plus daily and weekly boards.
**Part 2**: show the **top 10 trending hashtags** in the last hour, updated every minute, from a stream of **500K posts per second**.

:::hint Hint
Part 1 is a sorted set: Redis gives you O(log n) updates and rank queries. The challenge is what happens beyond one Redis node. Part 2 can't keep exact counts for everything at that rate cheaply: use windows, partitioned counting, and approximate structures, then merge.
:::
:::

## Part 1 — the game leaderboard

### Requirements and estimates

- Update a player's score after each match; read the top 100, my rank, and the players around me.
- Real time (a rank shown seconds after the match ends); daily/weekly/all-time boards.
- 50 M players, ~5 matches each per day → 250 M updates/day ≈ **3K/s** (peak ~15K/s); reads of ranks a few times that.
- Memory: a sorted set entry is ~100 bytes → 50 M × 100 B ≈ **5 GB** per board. **One Redis node can hold and serve this.**

### The core: a sorted set

A Redis **sorted set** (a skip list + hash table) keeps members ordered by score:

```text
ZINCRBY lb:global 30 player:42         → new score            O(log n)
ZREVRANGE lb:global 0 99 WITHSCORES    → top 100              O(log n + 100)
ZREVRANK lb:global player:42           → 0-based rank         O(log n)
ZREVRANGE lb:global r-5 r+5            → players around me
ZADD lb:daily:2026-10-12 …  + EXPIRE   → periodic boards (one key per period)
```

```viz algo=arch title="Leaderboard service" dir=down
game     Game servers | match results [server*2] @0,0
app      Players [mobile] @0,1.2
lbsvc    Leaderboard service [service*2] @1,0.6
redis    Redis sorted sets | global, daily, weekly [cache] @2,0
db       Scores DB | durable source of truth [db] @2,1.2
--
game -> lbsvc : score +30
app -> lbsvc : my rank, top 100
lbsvc -> db : record match
lbsvc -> redis : ZINCRBY · ZREVRANK
--
flow A match ends
game > lbsvc : Match result: player 42 earned 30 points (validated server-side: never trust client scores).
lbsvc > db : The result is recorded durably first (the leaderboard can be rebuilt from it).
lbsvc > redis : ZINCRBY on the global, daily and weekly boards in one pipeline.
app > lbsvc : The player opens the leaderboard…
lbsvc > redis : …ZREVRANK gives the exact rank; ZREVRANGE around it gives the neighbours.
```

### Deep dives

- **Ties**: sorted sets order equal scores lexicographically by member. To rank "who reached it first" higher, encode the score as `points × 2^k + (MAX_TS − timestamp)`, or as a float with the time in the fractional part.
- **Durability**: Redis is a fast index, not the source of truth. Keep match results in a database (or a log) and rebuild the sorted set if needed; use replicas for failover and read scaling.
- **Beyond one node** (hundreds of millions of players, or many boards): shard by player id. The **top N** stays exact: each shard returns its top N and you merge. An exact **rank** needs "how many players score higher" from every shard (`ZCOUNT` on each, then add), which is a scatter-gather. At very large scale, approximate the rank of non-top players with a **score histogram**: an error of a few hundredths of a percent is invisible at rank 24,326.
- **Sharding by score range** (0–999 on shard A, …) makes ranks easy (count the higher shards + rank within the shard) but creates hot shards and moves players between shards as scores change; sharding by player id with merged top N is usually simpler.

```js run title="Sharded leaderboard: exact top N by merging, rank from a histogram"
// A leaderboard split over 4 shards (by player id). Each shard keeps its own sorted set.
let seed = 5;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const SHARDS = 4, PLAYERS = 40000;
const shards = Array.from({ length: SHARDS }, () => new Map());          // playerId → score
const score = new Map();
for (let p = 0; p < PLAYERS; p++) {
  const s = Math.floor(10000 * Math.pow(rand(), 3));                     // most players score low
  shards[p % SHARDS].set(p, s); score.set(p, s);
}

// Global top 5: each shard returns its own top 5 (ZREVRANGE 0 4), then merge. Exact.
const top = (k) => shards.flatMap((m) => [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k))
  .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k);
console.log("top 5:", top(5).map(([p, s]) => `#${p}:${s}`).join("  "));

// "What's my rank?" Exact: ask every shard how many players score higher (ZCOUNT score+1 +inf), then add.
const exactRank = (p) => 1 + shards.reduce((sum, m) => sum + [...m.values()].filter((s) => s > score.get(p)).length, 0);

// Cheaper at huge scale: a global histogram of scores in buckets of 100 (updated asynchronously)
const BUCKET = 100, hist = new Array(10000 / BUCKET).fill(0);
for (const s of score.values()) hist[Math.floor(s / BUCKET)]++;
const approxRank = (p) => {
  const b = Math.floor(score.get(p) / BUCKET);
  const above = hist.slice(b + 1).reduce((a, x) => a + x, 0);
  const within = hist[b] * (1 - (score.get(p) % BUCKET + 0.5) / BUCKET);   // assume uniform inside the bucket
  return 1 + Math.round(above + within);
};
for (const p of [7, 1234, 31999]) {
  const e = exactRank(p), a = approxRank(p);
  console.log(`player #${p} score ${score.get(p)}: exact rank ${e}, histogram estimate ${a} (${(Math.abs(a - e) / e * 100).toFixed(2)}% off)`);
}
```

## Part 2 — trending top-k over a stream

### The pipeline

500K posts/s, each with a few hashtags, over a **sliding window** of one hour, updated every minute:

1. **Partition** the stream (Kafka) by hashtag, so all occurrences of one tag land on one counter instance (or partition randomly and merge counts later).
2. Each instance counts per **1-minute bucket** (tumbling windows); the hourly view is the sum of the last 60 buckets (drop the oldest, add the newest).
3. Each instance emits its **local top-k** every minute; an aggregator **merges** them into the global top-k. With partitioning by tag, the merge is exact (each tag's full count is on one instance).
4. Store the result in a cache; clients read the precomputed list.

```viz algo=arch title="Trending hashtags"
posts    Post stream [stream]
part     Partitioned by hashtag [queue]
cnt      Counters | 1-min buckets, local top-k [worker*3]
agg      Aggregator | merge top-k [service]
cache    Trending cache | per region [cache]
app      Clients [mobile]
--
posts -> part
part -> cnt
cnt -> agg : local top-k every minute
agg -> cache
app -> cache : GET /trending
--
flow One minute of trending
posts > part : Every post's hashtags are published, keyed by hashtag.
part > cnt : Each counter owns a subset of hashtags and keeps 60 one-minute buckets.
cnt > agg : Every minute: each counter sends its top 50 for the last hour.
agg > cache : The aggregator merges them, applies filters (spam, blocked tags), and stores the top 10 per region.
app > cache : Clients read a precomputed list: no computation on the read path.
```

### When the key space is huge: Count-Min Sketch + heap

Exact counters for millions of distinct tags per minute cost memory. A **Count-Min Sketch** counts in fixed memory (it may **over**-estimate, never under), and a small **heap** keeps the current top candidates:

```js run title="Approximate top-k with a Count-Min Sketch"
// Trending: the top-k hashtags in a stream using a Count-Min Sketch (fixed memory) + a small candidate set
let seed = 3;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const hash = (s, salt) => {
  let h = 2166136261 ^ salt;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};
class CountMin {
  constructor(width, depth) { this.w = width; this.d = depth; this.t = Array.from({ length: depth }, () => new Uint32Array(width)); }
  add(x) { let m = Infinity; for (let i = 0; i < this.d; i++) { const c = ++this.t[i][hash(x, i * 0x9e3779b9) % this.w]; m = Math.min(m, c); } return m; }
}
const K = 5, cms = new CountMin(512, 4), candidates = new Map(), exact = new Map();
for (let i = 0; i < 200000; i++) {
  const tag = "#tag" + Math.floor(1 / Math.pow(rand() + 1e-9, 1.4));    // Zipf-like: a few tags dominate
  exact.set(tag, (exact.get(tag) || 0) + 1);
  const est = cms.add(tag);
  candidates.set(tag, est);                                          // keep the top-k by estimate
  if (candidates.size > K * 4) {                                     // a small heap in practice; trim the weakest
    const weakest = [...candidates].sort((a, b) => a[1] - b[1])[0][0];
    candidates.delete(weakest);
  }
}
const topK = [...candidates].sort((a, b) => b[1] - a[1]).slice(0, K);
const truth = [...exact].sort((a, b) => b[1] - a[1]).slice(0, K);
console.log(`distinct tags: ${exact.size.toLocaleString()}, sketch memory: ${512 * 4 * 4 / 1024} KB`);
console.log("sketch top-5:", topK.map(([t, c]) => `${t}≈${c}`).join(" "));
console.log("exact  top-5:", truth.map(([t, c]) => `${t}=${c}`).join(" "));
```

Heavy hitters are estimated almost exactly because collisions add only a little relative error to large counts. **"Trending" ≠ "most popular"**: rank by the **increase** over a baseline (count in the last hour vs the same hour on previous days), otherwise "#love" trends forever. Add spam filtering (bots coordinating a tag) before publishing.

## Wrap-up

- Leaderboard: **Redis sorted sets** (O(log n) updates and ranks), one key per board and period, scores validated server-side and stored durably; shard by player id with **merged top N** and scatter-gather or **histogram** ranks when one node isn't enough.
- Trending: **partition by key**, count in **time buckets**, local **top-k** merged centrally, **Count-Min Sketch** for huge key spaces, rank by **growth** not raw counts, precompute results for readers.

```quiz
? Which Redis structure and command give a player's exact rank in O(log n)?
+ A sorted set with ZREVRANK
- A list with LINDEX
- A hash with HGET
> Sorted sets are skip lists ordered by score.

? The leaderboard is sharded by player id across 8 Redis nodes. How do you get the exact global top 100?
+ Ask each shard for its top 100 and merge the 800 results
- Ask one random shard
- Sum all scores
> The global top 100 must be within the union of each shard's top 100.

? Why rank trending topics by growth relative to a baseline instead of raw counts?
+ Raw counts surface evergreen popular tags forever; trending means unusually high activity right now
- Raw counts are too expensive
- Baselines remove the need for windows
> Compare the current window with what's normal for that tag.
```

:::keypoints
- **Sorted sets**: `ZINCRBY`, `ZREVRANGE`, `ZREVRANK` give updates, top N, rank and neighbours in O(log n); one key per period with expiry.
- Validate scores server-side and keep a durable record; Redis is the fast index.
- Sharded leaderboards: **merge per-shard top N** (exact); ranks via scatter-gather counts or a **score histogram** (approximate).
- Trending: partition by key → **time-bucketed counts** → **local top-k → global merge**; **Count-Min Sketch + heap** for huge key spaces; rank by **growth**.
:::
