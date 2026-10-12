---
title: Consistency Models
level: advanced
time: 40
summary: The ladder of guarantees between "strong" and "eventual" — linearizability, sequential and causal consistency, the client-centric session guarantees (read-your-writes, monotonic reads and writes, writes-follow-reads), eventual consistency and conflict resolution — and how to pick the weakest model each feature can tolerate.
---

"Strong or eventual?" is too coarse a question for real designs. Between those two extremes is a ladder of **consistency models**, each a different promise about what readers may see after writes on replicated data. Weaker promises are cheaper (lower latency, higher availability); stronger ones are easier to reason about. Knowing the rungs lets you say exactly what a feature needs.

:::def Consistency model
A contract between a data store and its clients describing which values a read may return, given the writes that have happened (possibly concurrently, on different replicas).
:::

## The ladder, strongest first

```viz algo=arch title="Stronger guarantees cost more coordination" dir=down
lin     Linearizable | single-copy illusion, real-time order [lock]
seq     Sequential | one global order everyone agrees on [key]
causal  Causal | cause before effect [stream]
session Session guarantees | read-your-writes, monotonic reads [user]
ev      Eventual | replicas converge… eventually [cloud]
--
lin -> seq
seq -> causal
causal -> session
session -> ev
caption: Each step down is cheaper and more available, and allows more surprising reads.
```

### Linearizability (strong consistency)

:::def Linearizability
The system behaves as if there were **one single copy** of the data, and every operation takes effect **atomically at some instant** between its start and its end. Once a write completes, every later read (in real time, by anyone) sees it or something newer.
:::

This is what people usually mean by "strong consistency" and what CAP calls C. It's what you need for **locks, leader election, unique constraints, account balances and seat booking**. It's implemented with a single leader that serves reads, consensus (Raft, Paxos), or synchronized clocks (Spanner's TrueTime). Cost: coordination on every operation, and unavailability during partitions.

```viz algo=seq title="A linearizability violation: the read 'goes back in time'"
participant a Alice [user]
participant r1 Replica 1 [db]
participant r2 Replica 2 [db]
participant b Bob [user]
a -> r1 : write score = 2 | Replica 1 applies it; replication to replica 2 is still in flight.
r1 --> a : OK (write complete)
b -> r1 : read score → 2 | Bob sees the new value…
b -> r2 : read score → 1 | …then, a moment later, the OLD value from a lagging replica.
note b : allowed under eventual consistency, forbidden under linearizability
```

### Sequential consistency

All nodes see **all operations in the same order**, and each client's operations appear in the order that client issued them. But that order doesn't have to match real time across clients: a write that "happened" earlier on the wall clock may be ordered after a later one. It's weaker than linearizable, and rarely offered as a product feature, but the idea of **one agreed total order** (e.g. a log) matters: consensus systems and Kafka partitions provide it.

### Causal consistency

:::def Causal consistency
Operations that are **causally related** are seen by everyone in the same order: if B could have been influenced by A (B is a reply to A, or the same client wrote A then B), nobody sees B without A. **Concurrent** (unrelated) operations may be seen in different orders by different replicas.
:::

Causality is what humans notice: seeing an answer before its question, or a comment on a post you can't see yet. Causal consistency avoids those surprises **without** global coordination, so it remains available during partitions. It's the strongest model that can (theoretically) stay available under partitions. It's implemented by tracking dependencies with version vectors or vector clocks (next lesson). MongoDB offers causally consistent sessions.

### Session (client-centric) guarantees

These promise things about what **one client** sees, which is often all a user actually notices:

| Guarantee | Promise | Violation users notice | Typical fix |
|---|---|---|---|
| **Read-your-writes** | you always see your own writes | "my comment disappeared after refresh" | read own data from the leader; or wait until a replica has your write's position |
| **Monotonic reads** | you never see older data after newer | refresh twice, the like count goes 10 → 8 | stick each session to one replica |
| **Monotonic writes** | your writes are applied in the order you made them | edit then delete, applied as delete then edit | send a session's writes through one leader / sequence them |
| **Writes-follow-reads** | a write you make after reading X is ordered after X | your reply is stored "before" the message it answers | carry the read's version with the write |

They're cheap to provide (mostly routing) and remove the most visible anomalies of eventual consistency.

### Eventual consistency

:::def Eventual consistency
If no new writes are made, all replicas **eventually converge** to the same value. Until then, reads may return stale or different values. Nothing is promised about **when**.
:::

It's the weakest useful model and the cheapest: any replica can serve any read or write immediately, which gives the lowest latency and the highest availability. DNS, CDN caches, Cassandra at consistency level ONE, DynamoDB's default reads, and search indexes are all eventually consistent. In practice, "eventually" usually means milliseconds to seconds.

Eventual consistency raises one hard question: **what happens when two replicas accept conflicting writes?**

## Resolving conflicts

| Strategy | How | Trade-off |
|---|---|---|
| **Last-write-wins (LWW)** | keep the value with the highest timestamp | simple; **silently loses** concurrent writes, and clock skew can pick the wrong one |
| **Version vectors + siblings** | detect concurrent versions and keep both ("siblings"); the application merges on read | no lost writes, but app complexity (Dynamo's shopping cart) |
| **CRDTs** | data types whose merge is mathematically guaranteed to converge (counters, sets, text) | no coordination, automatic; limited to supported types |
| **Application rules** | domain logic: "the higher bid wins", "union of tags" | correct for the domain; needs per-type thought |
| **Avoid conflicts** | route all writes for a key to one place (a home region / leader) | the most common practical answer |

Here's the difference between last-write-wins and a CRDT on a simple counter that two replicas update during a partition:

:::tabs Two replicas count likes during a partition
```js run
// Each replica counted likes while partitioned; now they merge.

// Last-write-wins register: keep whichever value has the latest timestamp
const lwwA = { value: 105, ts: 1000 };   // 5 likes added on replica A
const lwwB = { value: 103, ts: 1002 };   // 3 likes added on replica B, slightly later
const lwwMerged = lwwA.ts > lwwB.ts ? lwwA : lwwB;
console.log("LWW merged count:", lwwMerged.value, " (5 likes lost)");

// G-Counter CRDT: each replica only increments its OWN slot; merge = per-slot max
const merge = (x, y) => Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map((k) => [k, Math.max(x[k] ?? 0, y[k] ?? 0)]));
const total = (c) => Object.values(c).reduce((s, v) => s + v, 0);

const base = { A: 50, B: 50 };              // 100 likes before the partition
const gA = { ...base, A: base.A + 5 };      // replica A saw 5 new likes
const gB = { ...base, B: base.B + 3 };      // replica B saw 3 new likes
const g = merge(gA, gB);
console.log("G-Counter merged:", g, "→ count", total(g), " (nothing lost)");
console.log("merge is order-independent:", total(merge(gB, gA)) === total(g), "and idempotent:", total(merge(g, g)) === total(g));
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

// G-Counter CRDT: each replica increments only its own slot; merge = per-slot max
using GCounter = map<string, long>;

GCounter merge(const GCounter& x, const GCounter& y) {
    GCounter out = x;
    for (auto& [replica, n] : y) out[replica] = max(out[replica], n);
    return out;
}
long total(const GCounter& c) {
    long s = 0;
    for (auto& [_, n] : c) s += n;
    return s;
}

int main() {
    // Last-write-wins: keep whichever value has the latest timestamp
    struct Reg { long value; long ts; };
    Reg lwwA{105, 1000}, lwwB{103, 1002};      // +5 on A, +3 on B during the partition
    Reg lww = lwwA.ts > lwwB.ts ? lwwA : lwwB;
    cout << "LWW merged count: " << lww.value << "  (5 likes lost)\n";

    GCounter base{{"A", 50}, {"B", 50}};       // 100 likes before the partition
    GCounter gA = base, gB = base;
    gA["A"] += 5;                               // replica A saw 5 new likes
    gB["B"] += 3;                               // replica B saw 3 new likes
    GCounter g = merge(gA, gB);
    cout << "G-Counter merged: A=" << g["A"] << " B=" << g["B"] << " -> count " << total(g) << "  (nothing lost)\n";
    cout << boolalpha << "order-independent: " << (total(merge(gB, gA)) == total(g))
         << ", idempotent: " << (total(merge(g, g)) == total(g)) << "\n";
}
```
:::

The CRDT works because its merge is **commutative, associative and idempotent**: replicas can exchange state in any order, any number of times, and still converge. The collaborative editor case study builds a CRDT for text.

## Choosing a model

The rule of thumb: **use the weakest model each feature can tolerate**, because every step up costs latency and availability.

| Feature | Model that's enough |
|---|---|
| Seat booking, payments, unique usernames, distributed locks | **linearizable** |
| Comments and replies, chat threads | **causal** (+ read-your-writes) |
| User profile edits | **read-your-writes** + monotonic reads |
| Like counts, view counts, follower counts | **eventual** (CRDT counters or async aggregation) |
| Search index, recommendations, analytics | **eventual** |

:::interview Be specific
Instead of "it's eventually consistent", say what the user may observe and why it's acceptable: *"The like count is eventually consistent; it can lag by a second or two, and we guarantee read-your-writes so a user always sees their own like immediately."* Precision like that is what separates senior answers.
:::

```quiz
? A user edits their bio, refreshes, and sees the old bio. Which guarantee is violated?
+ Read-your-writes
- Monotonic writes
- Linearizability only
> The user didn't see their own write. Read-your-writes (a session guarantee) is enough to fix it.

? In a comment thread, readers sometimes see a reply before the comment it answers. Which model prevents exactly this, without global coordination?
- Eventual consistency
+ Causal consistency
- Last-write-wins
> Causal consistency orders causally related operations for everyone, while still allowing concurrent ones to differ.

? Why does a G-Counter CRDT never lose increments when replicas merge?
+ Each replica only increments its own slot, and merge takes the per-slot maximum, which is commutative, associative and idempotent
- It uses synchronized clocks
- It locks the counter during merges
> Separating each replica's contribution means concurrent increments never overwrite each other.

? Which feature most needs linearizability?
- Showing the number of views on a video
+ Granting a distributed lock so that only one worker processes a job
- Ranking search results
> Two holders of the same lock breaks correctness; every client must agree on who holds it right now.
```

:::keypoints
- Consistency models form a ladder: **linearizable** > **sequential** > **causal** > **session guarantees** > **eventual**. Stronger is simpler to reason about but costs coordination, latency and availability.
- **Linearizability** = a single-copy illusion in real time; needed for locks, uniqueness, money and booking.
- **Causal consistency** keeps cause before effect without global coordination.
- **Session guarantees** (read-your-writes, monotonic reads/writes, writes-follow-reads) fix the anomalies users notice, cheaply.
- **Eventual consistency** needs conflict resolution: LWW (loses writes), version vectors + siblings, **CRDTs**, app rules, or avoiding conflicts with a home leader.
- Pick the **weakest model each feature tolerates**, and say precisely what users may observe.
:::
