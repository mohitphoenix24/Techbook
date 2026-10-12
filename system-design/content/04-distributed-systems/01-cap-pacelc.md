---
title: The CAP Theorem and PACELC
level: advanced
time: 35
summary: What CAP really says (and the common misreadings), why partitions force a choice between consistency and availability, how real databases fall into CP and AP, PACELC's latency-vs-consistency trade-off when there's no partition, and how to choose per feature in an interview.
---

Once data lives on more than one machine, the machines must talk over a network, and networks fail. The **CAP theorem** describes the unavoidable choice this creates. It's quoted in nearly every system design interview, and often quoted wrongly, so getting it precise is an easy way to stand out.

## The three properties

:::def Consistency (C, in CAP)
Every read receives the **most recent write** or an error. All nodes appear to hold a single, up-to-date copy of the data. (Formally: **linearizability**.) Not the same as the C in ACID.
:::

:::def Availability (A)
Every request to a **non-failed** node receives a **non-error response**, without a guarantee that it contains the most recent write.
:::

:::def Partition tolerance (P)
The system keeps operating even when the network **drops or delays messages** between nodes, splitting them into groups that can't communicate.
:::

## What the theorem says

:::def CAP theorem
In a distributed data store, **when a network partition happens**, you must choose between **consistency** and **availability**. You can't have both during the partition. (Eric Brewer's conjecture, 2000; proved by Gilbert and Lynch, 2002.)
:::

The popular "pick two of three" phrasing is misleading. **Partitions aren't optional**: in any real network across machines, racks or regions, they will happen (a switch fails, a cable is cut, a GC pause makes a node unreachable). So the real choice is between two behaviours **during** a partition:

- **CP**: refuse (some) requests rather than return possibly stale data or accept writes that would diverge. Consistent, but parts of the system are unavailable.
- **AP**: keep answering on both sides of the partition, accepting that replicas diverge and that reads may be stale. Available, but inconsistent until the partition heals and the replicas reconcile.

When there's **no** partition, a well-built system can be both consistent and available.

Try it. Write on both sides while the network is cut, in each mode, then heal the network:

```viz algo=cap title="A network partition between two replicas"
mode = CP
```

In **CP** mode, the cut makes both sides refuse writes (in real systems, usually only the **minority** side refuses; see the consensus lesson). In **AP** mode, both sides keep accepting writes; when the network heals, the conflicting writes must be reconciled, and with last-write-wins one of them is silently lost.

## Real systems on the spectrum

| System | During a partition | Notes |
|---|---|---|
| Single-leader SQL (Postgres, MySQL) with synchronous failover | **CP**-ish | the side without the leader can't accept writes |
| ZooKeeper, etcd, Consul | **CP** | consensus-based; the minority side stops serving writes (and linearizable reads) |
| Google Spanner, CockroachDB | **CP** | consensus per data range; very high availability in practice through redundancy |
| MongoDB (default settings) | **CP** | the minority side's primary steps down |
| Cassandra, ScyllaDB, Riak | **AP** (tunable) | any replica accepts writes; quorum settings move it toward C |
| DynamoDB | **AP** by default | eventually consistent reads; strongly consistent reads are optional |
| DNS, CDN caches | **AP** | serve cached, possibly stale answers |

:::warn Don't label a whole system CP or AP and stop there
Many databases are **tunable** per operation (Cassandra's consistency levels, DynamoDB's `ConsistentRead`), and big systems mix both: the payment path is CP, the "people you may know" path is AP. Choose **per feature**.
:::

## How to choose

Ask: **what's worse for this feature, an error or wrong data?**

| Feature | Choice | Why |
|---|---|---|
| Account balance, payments | **CP** | a double spend is worse than "try again in a minute" |
| Inventory at checkout, seat booking | **CP** (for the booking step) | overselling is costly |
| Unique usernames, leader election, locks | **CP** | two winners breaks the invariant |
| Shopping cart (Amazon's original Dynamo) | **AP** | never refuse an "add to cart"; merge carts later |
| Social feed, likes, view counts | **AP** | stale by a few seconds is invisible |
| Product catalog, search results | **AP** | slightly outdated is fine |
| Chat delivery | **AP** for sending (queue locally, deliver later), ordering handled separately | users expect to always be able to send |

## PACELC: the trade-off that exists every day

CAP only talks about the rare moments of partition. Daniel Abadi's **PACELC** adds what happens the rest of the time:

:::def PACELC
If there's a **P**artition, choose between **A**vailability and **C**onsistency; **E**lse (normal operation), choose between **L**atency and **C**onsistency.
:::

Even with a healthy network, keeping replicas consistent means **waiting** for other nodes (synchronous replication, quorums, consensus round trips), possibly across regions. Skipping that wait gives lower latency and weaker consistency.

| System | Partition: A or C? | Else: L or C? | Classification |
|---|---|---|---|
| Cassandra, DynamoDB (defaults), Riak | A | L | **PA/EL** |
| Spanner, CockroachDB, etcd, ZooKeeper | C | C | **PC/EC** |
| MongoDB (default) | C | L-ish (async secondaries) | **PC/EL**-ish |
| Postgres with async replicas, reading from replicas | | L | **EL** for replica reads |

```js run title="The everyday cost of consistency: waiting for other replicas"
// A write is acknowledged after hearing back from the k fastest of the replicas it waits for.
const regions = { local: 1, "same region, other zone": 2, "other region": 75, "other continent": 160 };   // round-trip ms

function writeLatency(waitFor) {
  const rtts = waitFor.map((r) => regions[r]).sort((a, b) => a - b);
  return rtts.at(-1);                 // must hear from every replica in the list
}

console.log("async (ack locally):                  ", writeLatency(["local"]), "ms");
console.log("quorum within one region (2 of 3):     ", writeLatency(["local", "same region, other zone"]), "ms");
console.log("quorum across 3 regions (2 of 3):      ", writeLatency(["local", "other region"]), "ms");
console.log("synchronous to every continent:        ", writeLatency(["local", "other region", "other continent"]), "ms");
```

That's the **EL vs EC** choice in milliseconds. Global strong consistency costs at least one cross-region round trip per write.

:::interview Saying CAP correctly
Avoid *"I'll pick CA"*: it isn't an option for a distributed system, because you can't opt out of partitions. A strong phrasing: *"Network partitions will happen, so for each feature I decide what to sacrifice during one. For booking a seat I want consistency, so if the booking service can't reach a quorum it returns an error and the client retries. For the seat map display I prefer availability: it can show slightly stale availability. Outside partitions, the trade-off is latency vs consistency (PACELC), so the browse path reads from nearby replicas while the booking path does a quorum write."*
:::

```quiz
? According to CAP, when must a distributed data store choose between consistency and availability?
- Always: it can only ever have two of the three properties
+ During a network partition
- Only when a node's disk fails
> Without a partition, a system can be both consistent and available. The forced choice arises only when nodes can't communicate.

? A bank wants account balances to never show or accept conflicting values. During a partition it should…
+ Behave CP: reject or delay operations on the side that can't confirm the latest state
- Behave AP: accept writes on both sides and merge later
- Ignore the partition
> For money, returning an error is better than double spending.

? What does the "E-L-C" part of PACELC add?
- Every system is eventually consistent
+ Even without partitions, stronger consistency costs latency because nodes must coordinate
- Latency doesn't matter when there is no partition
> Waiting for replicas (quorums, consensus, sync replication) adds round trips to every operation.

? "Consistency" in CAP refers to…
- database constraints such as foreign keys
+ every read seeing the latest write, as if there were a single copy (linearizability)
- data being stored in a consistent format
> CAP's C is about replicas agreeing on the latest value; ACID's C is about valid states.
```

:::keypoints
- **CAP**: during a **network partition**, a distributed store must give up either **consistency** (linearizable reads) or **availability** (every live node answers).
- Partitions are inevitable, so "CA" isn't a real option; the choice is **CP vs AP during partitions**.
- **CP** systems (etcd, ZooKeeper, Spanner, single-leader SQL) refuse some requests; **AP** systems (Cassandra, DynamoDB defaults, DNS) answer with possibly stale data and reconcile later.
- **PACELC**: otherwise (no partition), choose between **latency** and **consistency**.
- Decide **per feature**: money, bookings, uniqueness → CP; feeds, counts, carts, catalogs → AP.
:::
