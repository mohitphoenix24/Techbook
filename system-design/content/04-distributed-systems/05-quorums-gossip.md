---
title: Quorums, Anti-Entropy and Gossip
level: advanced
time: 45
summary: How leaderless (Dynamo-style) stores stay consistent enough without a leader — N/W/R quorums and tunable consistency, sloppy quorums and hinted handoff, read repair, Merkle-tree anti-entropy — and how gossip protocols spread membership and failure information through a cluster.
---

Amazon's **Dynamo** paper (2007) described a key-value store built for one goal: **the shopping cart must always accept writes**, even when machines and networks fail. Its techniques (quorums, hinted handoff, read repair, Merkle trees, gossip) were adopted by Cassandra, Riak, ScyllaDB and Voldemort, and they show up whenever an interviewer asks you to "design a key-value store". This lesson explains each one.

## Quorums: N, W, R

Every key is stored on **N** replicas (chosen by consistent hashing: the next N distinct nodes on the ring). There's no leader. A **coordinator** node (any node, often the one that received the request) forwards each operation to the replicas:

- A **write** is sent to all N replicas and succeeds once **W** acknowledge.
- A **read** is sent to the replicas, waits for **R** responses, and returns the value with the **newest version**.

:::def Quorum condition
If **W + R > N**, the set of replicas that acknowledged any successful write and the set answering any later read must **overlap** in at least one replica, so the read sees the latest write (as long as versions are compared correctly).
:::

Try it: write a few versions, then read. Compare W = 3, R = 3 (N = 5) with W = 1, R = 1. Take replicas down and see when writes and reads start failing.

```viz algo=quorum title="N, W, R quorums"
n = 5
w = 3
r = 3
```

### Tuning the dial

| Setting (N = 3) | W + R > N? | Behaviour | Good for |
|---|---|---|---|
| W = 3, R = 1 | ✓ | fast reads, slow writes; any one failure blocks writes | read-heavy, rarely written data |
| W = 1, R = 3 | ✓ | fast writes, slow reads; any one failure blocks reads | write-heavy logs |
| **W = 2, R = 2** | ✓ | balanced; tolerates one failure for both | the common default |
| W = 1, R = 1 | ✗ | fastest, highly available; reads can be stale | caches, metrics, "eventual is fine" |

Cassandra exposes this per query as **consistency levels**: `ONE`, `QUORUM`, `ALL`, `LOCAL_QUORUM` (a majority within the local data centre, avoiding cross-region latency), and others. You can write with `QUORUM` and read with `ONE` for a feed, but use `QUORUM`/`QUORUM` for a balance.

:::warn W + R > N isn't full linearizability
Quorums give "reads see the latest **successful** write" in the simple case, but edge cases remain: concurrent writes with last-write-wins and skewed clocks, a write that succeeded on fewer than W replicas (it failed, but some replicas kept it), and sloppy quorums (below). Dynamo-style stores are best described as **eventually consistent with tunable staleness**, not as strongly consistent.
:::

## When replicas are down: sloppy quorums and hinted handoff

With strict quorums, if 2 of a key's 3 home replicas are down, writes with W = 2 fail. Dynamo prefers availability:

:::def Sloppy quorum
If some of a key's home replicas are unreachable, the write goes to **other healthy nodes** further along the ring, so that W acknowledgements can still be collected. The write succeeds, but on "stand-in" nodes.
:::

:::def Hinted handoff
A stand-in node stores the write together with a **hint**: "this belongs to node C". When C comes back, the stand-in **hands the data over** and deletes its copy.
:::

```viz algo=seq title="Hinted handoff while replica C is down"
participant co Coordinator [service]
participant a Replica A [db]
participant c Replica C (down) [db]
participant d Node D (stand-in) [db]
co -> a : PUT cart:42 v7
a --> co : ack
co -x c : PUT cart:42 v7 | C is down: the request times out.
co -> d : PUT cart:42 v7 + hint "for C" | D isn't a home replica, but it accepts the write.
d --> co : ack → W = 2 reached, write succeeds
note c : …C recovers 10 minutes later
d -> c : handoff: cart:42 v7 | D delivers the hinted write and drops its copy.
```

This keeps writes available through failures, at the cost of weaker guarantees (a read quorum among the home replicas might not see the write until the handoff happens).

## Repairing divergence

Replicas drift apart: hinted handoffs get lost, nodes are down for long periods, writes reach fewer than N replicas. Two mechanisms bring them back together.

### Read repair

When a read collects responses from several replicas and sees **different versions**, the coordinator returns the newest and **writes it back** to the stale replicas. (Turn "Read repair" on and off in the simulator above.) It fixes frequently read keys cheaply, but keys that are rarely read can stay inconsistent for a long time.

### Anti-entropy with Merkle trees

A background process compares replicas **systematically**. Comparing every key between two nodes would mean sending all the data across the network. Instead, each node builds a **Merkle tree** over its key range.

:::def Merkle tree
A tree of hashes: each leaf is the hash of a small range of keys and values; each parent is the hash of its children. Two nodes compare **root hashes**: if equal, the whole range is identical. If not, they compare the children and descend **only into the branches that differ**, finding the out-of-sync keys while exchanging very little data.
:::

:::tabs Finding differences with a Merkle tree
```js run
// Simple string hash for the demo (real systems use SHA-256 or similar)
const h = (s) => { let x = 0x811c9dc5; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(16).padStart(8, "0"); };

// Build a Merkle tree over 8 key buckets; returns levels from leaves to root
function build(buckets) {
  const levels = [buckets.map((b) => h(JSON.stringify(b)))];
  while (levels.at(-1).length > 1) {
    const prev = levels.at(-1), next = [];
    for (let i = 0; i < prev.length; i += 2) next.push(h(prev[i] + prev[i + 1]));
    levels.push(next);
  }
  return levels;
}

// Walk down from the root, only into subtrees whose hashes differ
function diff(a, b) {
  let compared = 0, suspects = [0];
  for (let lvl = a.length - 1; lvl >= 0; lvl--) {
    const next = [];
    for (const i of suspects) {
      compared++;
      if (a[lvl][i] !== b[lvl][i]) next.push(...(lvl ? [2 * i, 2 * i + 1] : [i]));
    }
    suspects = next;
  }
  return { buckets: suspects, compared };
}

const replica1 = Array.from({ length: 8 }, (_, i) => ({ [`key${i}`]: `v1` }));
const replica2 = structuredClone(replica1);
replica2[5] = { key5: "v2" };                      // one bucket diverged

const t1 = build(replica1), t2 = build(replica2);
console.log("roots equal?", t1.at(-1)[0] === t2.at(-1)[0]);
const { buckets, compared } = diff(t1, t2);
console.log(`out-of-sync buckets: ${buckets}  (found by comparing ${compared} hashes instead of all 8 buckets of data)`);
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

// Simple string hash for the demo (real systems use SHA-256 or similar)
string h(const string& s) {
    uint32_t x = 2166136261u;
    for (unsigned char c : s) { x ^= c; x *= 16777619u; }
    char buf[9]; snprintf(buf, sizeof buf, "%08x", x);
    return buf;
}

// levels[0] = leaf hashes, levels.back() = {root}
vector<vector<string>> build(const vector<string>& buckets) {
    vector<vector<string>> levels{{}};
    for (auto& b : buckets) levels[0].push_back(h(b));
    while (levels.back().size() > 1) {
        auto& prev = levels.back();
        vector<string> next;
        for (size_t i = 0; i < prev.size(); i += 2) next.push_back(h(prev[i] + prev[i + 1]));
        levels.push_back(next);
    }
    return levels;
}

int main() {
    vector<string> r1, r2;
    for (int i = 0; i < 8; i++) r1.push_back("key" + to_string(i) + "=v1");
    r2 = r1;
    r2[5] = "key5=v2";                                   // one bucket diverged

    auto t1 = build(r1), t2 = build(r2);
    cout << boolalpha << "roots equal? " << (t1.back()[0] == t2.back()[0]) << "\n";

    vector<size_t> suspects{0};
    int compared = 0;
    for (int lvl = (int)t1.size() - 1; lvl >= 0; lvl--) {   // descend only into differing subtrees
        vector<size_t> next;
        for (size_t i : suspects) {
            compared++;
            if (t1[lvl][i] != t2[lvl][i]) {
                if (lvl) { next.push_back(2 * i); next.push_back(2 * i + 1); }
                else next.push_back(i);
            }
        }
        suspects = next;
    }
    cout << "out-of-sync buckets:";
    for (size_t b : suspects) cout << " " << b;
    cout << "  (found by comparing " << compared << " hashes instead of all 8 buckets of data)\n";
}
```
:::

With millions of keys, the saving is enormous: two replicas that differ in a handful of keys exchange a few kilobytes of hashes instead of gigabytes of data. Merkle trees also appear in Git, BitTorrent, blockchains, Amazon S3 integrity checks, and Certificate Transparency logs.

## Gossip: spreading information without a coordinator

A leaderless cluster still needs to know **who's in the cluster**, **who's alive**, and **who owns which ranges**. Rather than a central registry (a single point of failure), Dynamo-style systems use **gossip**.

:::def Gossip protocol
Every second or so, each node picks **a few random peers** and exchanges state with them (membership lists, heartbeat counters, schema versions). Like rumours spreading through a crowd, information reaches every node in about **log(N) rounds**, with no central coordinator and great tolerance of failures.
:::

```js run title="How fast does gossip spread? (1,000 nodes, each tells 2 random peers per round)"
let seed = 4;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const N = 1000, FANOUT = 2;
let informed = new Set([0]);                 // node 0 learns that node 517 has failed
for (let round = 1; informed.size < N; round++) {
  const next = new Set(informed);
  for (const node of informed) for (let k = 0; k < FANOUT; k++) next.add(Math.floor(rand() * N));
  informed = next;
  console.log(`round ${String(round).padStart(2)}: ${String(informed.size).padStart(4)} nodes know`);
}
console.log(`log2(${N}) ≈ ${Math.log2(N).toFixed(1)}: gossip reaches everyone in a few times log N rounds`);
```

Gossip carries **heartbeat counters** for failure detection: if a node's counter hasn't increased for a while (as seen through gossip), it's suspected dead. Modern systems use smarter **failure detectors** such as the **phi accrual detector** (Cassandra), which outputs a suspicion level based on the history of heartbeat arrival times, and **SWIM** (used by Consul/Serf), which confirms suspicions by asking other nodes to probe the suspect indirectly before declaring it dead.

## Putting the Dynamo design together

```viz algo=arch title="The Dynamo toolbox"
client   Client [client]
coord    Coordinator | any node [service]
ring     Consistent hash ring | N replicas per key [cdn]
reps     Replicas | quorum W / R [db*3]
hint     Stand-in node | hinted handoff [db]
--
client -> coord : get / put
coord -> ring : who owns this key?
coord -> reps : W writes / R reads
coord ~> hint : if a replica is down
reps <-> hint : gossip + Merkle anti-entropy
```

| Problem | Dynamo-style technique |
|---|---|
| Partitioning data | consistent hashing with virtual nodes |
| High availability for writes | sloppy quorum + hinted handoff |
| Tunable consistency | N, W, R per request |
| Detecting conflicting versions | vector clocks (version vectors) |
| Temporary failures | hinted handoff |
| Permanent divergence | Merkle-tree anti-entropy |
| Fixing hot keys' stale replicas | read repair |
| Membership and failure detection | gossip |

You'll use exactly this table in the "Design a key-value store" case study.

```quiz
? With N = 5 replicas and W = 3, what's the smallest R that guarantees reads overlap the latest successful write?
- 2
+ 3
- 5
> W + R must exceed N: 3 + 3 = 6 > 5. With R = 2, a read could hit only the 2 replicas that missed the write.

? What is hinted handoff?
+ When a home replica is down, another node temporarily stores its writes with a hint, and delivers them when the replica recovers
- A way to elect a leader
- Sending hints to the client about which replica to read
> It keeps writes available during temporary failures (with a sloppy quorum).

? Why do replicas compare Merkle trees instead of comparing all keys?
+ Matching subtree hashes prove whole ranges are identical, so only the few differing branches need to be explored and transferred
- Merkle trees compress the data
- It's required by the CAP theorem
> Hash trees find the differences between huge datasets while exchanging very little data.

? In a 1,000-node cluster using gossip, roughly how many rounds does it take for news to reach every node?
- About 1,000
- About 500
+ A small multiple of log₂(1000) ≈ 10, so a few dozen at most
> Each round roughly multiplies the number of informed nodes, so dissemination takes O(log N) rounds.
```

:::keypoints
- **Quorums**: N replicas, writes wait for W, reads for R; **W + R > N** makes reads overlap the latest successful write. Tune per request (Cassandra's `ONE`/`QUORUM`/`ALL`/`LOCAL_QUORUM`).
- **Sloppy quorums + hinted handoff** keep writes available when home replicas are down.
- **Read repair** fixes stale replicas seen during reads; **Merkle-tree anti-entropy** finds and fixes divergence in the background with little data transfer.
- **Gossip** spreads membership and liveness information in O(log N) rounds without a coordinator; smarter failure detectors (phi accrual, SWIM) reduce false alarms.
- Together with consistent hashing and vector clocks, these form the **Dynamo** design behind Cassandra, Riak and ScyllaDB.
:::
