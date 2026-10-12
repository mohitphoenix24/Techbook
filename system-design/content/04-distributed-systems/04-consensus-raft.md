---
title: Consensus and Raft
level: advanced
time: 50
summary: Why distributed systems need consensus (leader election, replicated logs, locks, configuration), majorities and quorums, how Raft works — terms, randomized election timeouts, voting rules, log replication and commitment — with a live 5-node simulator, plus Paxos in one paragraph, and ZooKeeper/etcd in practice.
---

Many problems in distributed systems reduce to one: **getting several machines to agree on a value**, even when some of them crash or messages are lost. Which node is the leader? Has this transaction committed? Who holds the lock? What's the cluster configuration? The protocols that solve this, **Paxos** and **Raft**, are the foundation under etcd, ZooKeeper, Consul, Kafka's KRaft, CockroachDB, Spanner and many more.

:::def Consensus
A set of nodes **agreeing on a single value** (or a sequence of values) such that: every non-faulty node eventually decides (**termination**), all nodes decide the same value (**agreement**), and the decided value was proposed by some node (**validity**). Once decided, it never changes.
:::

## Why majorities

Consensus protocols require a **majority (quorum)** of nodes, ⌊N/2⌋ + 1, for every decision. Any two majorities **overlap** in at least one node, so two conflicting decisions can never both get a majority: the overlapping node would have to vote for both.

| Cluster size N | Majority | Failures tolerated |
|---|---|---|
| 1 | 1 | 0 |
| 3 | 2 | 1 |
| 4 | 3 | 1 |
| 5 | 3 | **2** |
| 7 | 4 | 3 |

That's why consensus clusters have **odd sizes**: 4 nodes tolerate no more failures than 3, while paying for an extra machine. Production clusters are usually 3 or 5 nodes (more nodes make every decision slower).

During a network partition, only the side with a majority can make progress. The minority side **stops** accepting writes. That's consensus being **CP**: it never lets two sides decide differently.

## Raft in brief

Raft (Ongaro & Ousterhout, 2014) was designed to be **understandable**, and it is now the most widely implemented consensus algorithm. It splits the problem into three parts: **leader election**, **log replication**, and **safety**.

Every node is in one of three roles:

- **Follower**: passive; responds to the leader and candidates.
- **Candidate**: trying to become leader.
- **Leader**: handles all client requests and replicates its log to followers.

Time is divided into **terms**, numbered 1, 2, 3, … Each term begins with an election and has at most one leader. Terms act as a logical clock: any message with a newer term makes a node update its term and step down to follower.

### Leader election

1. Followers expect regular **heartbeats** (empty AppendEntries messages) from the leader.
2. Each follower has an **election timeout**, **randomized** (e.g. 150–300 ms in real systems). If it expires without a heartbeat, the follower becomes a **candidate**: it increments its term, votes for itself, and sends **RequestVote** to everyone.
3. Each node grants **at most one vote per term**, first come first served, and only to a candidate whose log is **at least as up-to-date** as its own.
4. A candidate that collects votes from a **majority** becomes leader and starts sending heartbeats.
5. If two candidates split the vote, nobody wins; their randomized timeouts make it very likely that one times out first in the next round.

### Log replication

1. A client sends a command (e.g. `SET x = 5`) to the leader.
2. The leader **appends** it to its own log, tagged with the current term, and sends **AppendEntries** to all followers (in parallel).
3. Each follower checks that its log matches the leader's at the entry **just before** the new ones (same index and term). If not, it rejects, and the leader retries one entry earlier until the logs match; then the follower overwrites any conflicting entries with the leader's.
4. Once an entry is stored on a **majority**, the leader marks it **committed**, applies it to its state machine, and replies to the client. Followers learn the commit index from later messages and apply it too.

:::def Replicated state machine
If every node applies the **same commands in the same order** to the same deterministic state machine (a key-value map, say), they all end up in the same state. Raft's job is to keep that ordered log identical on a majority, so a key-value store built on top behaves like a single, fault-tolerant machine.
:::

Watch it happen. The ring around each follower is its election timer. Send client requests, then **crash the leader** by clicking it and watch a new election. Try crashing two nodes (the cluster keeps working) and then a third (it can no longer commit).

```viz algo=raft title="Raft: 5 servers"
```

### Safety: why committed entries are never lost

The key rule is the **election restriction**: a node votes only for a candidate whose log is at least as up-to-date as its own (higher last term, or the same last term and at least as long). A committed entry is on a majority; any winning candidate needs votes from a majority; the two majorities overlap; and the overlapping voter refuses candidates missing the entry. So **every future leader already has every committed entry**.

```viz algo=seq title="One client write, start to finish"
participant c Client [client]
participant l Leader S1 [server]
participant f2 Follower S2 [server]
participant f3 Follower S3 [server]
c -> l : SET x = 5
l -> l : append at index 7, term 3 | Not committed yet: it exists only on the leader.
l -> f2 : AppendEntries(prev = 6/term 3, entry 7)
l -> f3 : AppendEntries(prev = 6/term 3, entry 7)
f2 --> l : success (match = 7) | Now on 2 of 3 nodes: a majority.
l -> l : commit index = 7, apply x = 5
l --> c : OK | Only now does the client hear "done".
f3 --> l : success (match = 7)
note f2 : learns commit = 7 with the next heartbeat, applies x = 5
```

## Paxos in one paragraph

**Paxos** (Lamport, 1989/1998) is the original consensus algorithm. Proposers send *prepare(n)* with a proposal number; acceptors promise to ignore lower numbers and report any value they've already accepted; the proposer then sends *accept(n, v)*, using the previously accepted value if there was one; once a majority accepts, the value is chosen. **Multi-Paxos** elects a stable leader to skip the first phase for later values, which makes it very similar to Raft in practice. Google's Chubby and Spanner use Paxos. In interviews, it's enough to know that Paxos and Raft solve the same problem with majorities, and that Raft is the easier to explain.

## Consensus in practice: coordination services

You'll rarely implement Raft. You'll **use** a system built on it:

| Service | Built on | Used for |
|---|---|---|
| **etcd** | Raft | Kubernetes' entire cluster state; config, service discovery, locks |
| **ZooKeeper** | Zab (Paxos-like) | Kafka (older versions), HBase, Hadoop: leader election, config, membership |
| **Consul** | Raft | service discovery, health checks, config, locks |
| Kafka **KRaft** | Raft | Kafka's metadata (replaced ZooKeeper) |
| CockroachDB, TiKV, YugabyteDB | Raft per data range | strongly consistent distributed SQL |

These services provide **small, strongly consistent** storage plus primitives like **watches** (get notified when a key changes), **ephemeral keys / sessions** (deleted automatically when the client stops heartbeating), and **leases**. The next lessons build distributed locks and leader election on them.

:::warn Consensus is for small, critical data
Every write needs a majority round trip and goes through one leader, so consensus clusters handle thousands, not millions, of writes per second. Store **metadata and coordination state** there (who's the leader, which shard lives where, configuration), not your main application data. Systems like CockroachDB scale by running **many independent Raft groups**, one per data range.
:::

## Byzantine faults

Raft and Paxos assume nodes may **crash** or be slow, but never **lie**. Tolerating malicious or arbitrarily faulty nodes (**Byzantine** faults) needs heavier protocols (PBFT, blockchain consensus) with at least 3f + 1 nodes to tolerate f traitors. Inside a company's own data centre, crash-fault tolerance is the norm.

:::interview Where consensus shows up in designs
You don't need to draw Raft. Say where you rely on it: *"Shard assignment and leader election live in etcd (Raft-based), so a partitioned minority can't elect a second leader."* Or: *"The lock service uses ZooKeeper ephemeral nodes."* If asked how it works, the 4-sentence version is: majorities, terms, randomized election timeouts, and commit-on-majority with the election restriction.
:::

```quiz
? How many node failures can a 5-node Raft cluster tolerate while still making progress?
- 1
+ 2
- 3
- 4
> A majority of 5 is 3, so 2 nodes can fail.

? Why does Raft use randomized election timeouts?
+ So that followers rarely time out at the same moment, avoiding repeated split votes
- To make elections slower and safer
- To encrypt votes
> If all followers became candidates simultaneously, they'd split the vote forever. Randomness lets one usually start first.

? When does a Raft leader consider a log entry committed?
- As soon as it appends the entry to its own log
+ Once the entry is stored on a majority of servers (from the leader's current term)
- When every follower has stored it
> Majority replication guarantees the entry survives any minority of failures and is known to every future leader.

? A 5-node cluster is split by a partition into groups of 3 and 2. What happens?
+ The group of 3 can elect a leader and commit writes; the group of 2 can't commit anything
- Both groups elect leaders and accept writes
- Neither group can do anything
> Only a majority can elect a leader or commit, so the minority side stops making progress: consensus chooses consistency.
```

:::keypoints
- **Consensus** = agreeing on one value (or an ordered log) despite crashes and lost messages. It underlies leader election, locks, configuration and replicated databases.
- Decisions need a **majority**; any two majorities overlap. A cluster of 2f + 1 nodes tolerates f failures, hence odd sizes (3, 5).
- **Raft**: followers, candidates and a leader; **terms**; **randomized election timeouts**; votes only for candidates with up-to-date logs; **commit once on a majority**; followers' logs are forced to match the leader's.
- A **replicated state machine** applies the same log in the same order on every node.
- In practice, use **etcd, ZooKeeper or Consul** for small, critical coordination data; consensus is CP and doesn't scale to bulk data writes.
:::
