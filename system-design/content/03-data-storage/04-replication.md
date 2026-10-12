---
title: Replication
level: intermediate
time: 45
summary: Keeping copies of data on several machines — leader-follower replication with synchronous, asynchronous and semi-synchronous modes, replication lag and its anomalies (read-your-writes, monotonic reads), failover and split brain, multi-leader replication with write conflicts, and leaderless replication with quorums.
---

**Replication** means keeping a copy of the same data on several machines. It's how databases survive machine failures, serve more reads, and put data close to users. It's also the source of some of the subtlest bugs in distributed systems, because copies drift apart. Interviewers love asking "what happens if the primary dies?" — this lesson gives you precise answers.

:::def Replication
Maintaining copies (**replicas**) of the same data on multiple nodes, kept up to date by shipping every change from one node to the others.
:::

Why replicate?

1. **High availability**: if one node dies, another has the data.
2. **Read scaling**: spread reads over many replicas.
3. **Lower latency**: a replica near the users.
4. **Durability**: data survives losing a disk or a machine.

There are three architectures: **single-leader**, **multi-leader**, and **leaderless**.

## Single-leader (primary–replica) replication

:::def Leader–follower replication
One node, the **leader** (primary), accepts all writes. It records each change in its **replication log** and streams it to the **followers** (replicas), which apply the changes in the same order. Reads can go to the leader or any follower.
:::

This is the default for PostgreSQL, MySQL, MongoDB replica sets, Redis, and many more. The key question is **when the leader acknowledges a write to the client**:

| Mode | The leader acknowledges after… | Write latency | If the leader dies right after acking |
|---|---|---|---|
| **Asynchronous** | writing locally | lowest | recent writes not yet shipped are **lost** |
| **Synchronous** | every follower confirms | highest; one slow follower stalls all writes | no loss |
| **Semi-synchronous** | at least **one** follower confirms | medium | no loss (one copy is guaranteed) |

Try them in the simulator. **Write** a few new values, then **Read**: with asynchronous replication and a big lag, reads often hit a replica that hasn't caught up. Then write quickly and **crash the primary** before the dots arrive.

```viz algo=replication title="Leader–follower replication"
mode = async
lag = 1500
```

You should see:

- **Stale reads**: a replica returns an old version for a while after the write.
- **Lost writes on failover** (async mode): writes the client was told were saved vanish when an out-of-date replica is promoted.
- **Slow writes** (sync mode): every write waits a full replication round trip.

Most production setups use **asynchronous** replication for its speed (and keep lag small, usually milliseconds), or **semi-synchronous** for important data so at least two copies exist before acknowledging.

## Replication lag and its anomalies

:::def Replication lag
The delay between a write on the leader and that write appearing on a follower. Usually milliseconds, but it can grow to seconds or minutes under load, network trouble, or a long-running query on the replica.
:::

Lag causes three classic anomalies, each with a standard fix:

**1. Reading your own writes.** You post a comment, the page reloads from a lagging replica, and your comment is gone. Users think the write failed and post it again.

:::def Read-your-writes consistency
A guarantee that a user always sees **their own** writes. Fixes: read the user's own data from the leader (e.g. their own profile); read from the leader for a short window (say 10 s) after the user writes; or remember the write's log position and only read from replicas that have reached it.
:::

**2. Monotonic reads.** You refresh twice: the first read hits an up-to-date replica, the second a lagging one. Data appears to **go back in time**. Fix: route each user's reads to the **same replica** (e.g. hash the user id), so their view only moves forward.

**3. Consistent prefix reads.** In a chat, you see an answer before the question it replies to, because they came from different partitions/replicas with different lag. Fix: write causally related data to the same partition, or track causal dependencies.

```viz algo=seq title="Read-your-writes, fixed by routing to the leader after a write"
participant u User [mobile]
participant app App server [service]
participant l Leader [db]
participant f Follower [db]
u -> app : POST /comments "Great post!"
app -> l : INSERT comment
l --> app : OK
note app : remember: user 42 wrote at t=12:00:00
u -> app : GET /post/9 (reload)
app -> l : read comments (user wrote < 10 s ago → leader) | Without this rule, the read would go to a follower that may not have the comment yet.
l --> app : includes "Great post!"
l ->> f : replication (arrives 300 ms later)
```

## Failover

When the leader dies, a follower must become the new leader. This can be automatic (Patroni for Postgres, MySQL orchestrators, MongoDB elections, Redis Sentinel) or manual.

:::flow Automatic failover
Detect | the leader misses heartbeats for ~10–30 s
Elect | choose the most up-to-date follower (consensus or a coordinator)
Reconfigure | clients and other followers switch to the new leader
Fence | make sure the old leader can't accept writes if it comes back
:::

What can go wrong (every one of these has happened in real outages):

- **Lost writes** with async replication, as you saw in the simulator. If those writes already caused side effects elsewhere (an email, an id used by another system), you now have inconsistencies.
- **Split brain**: the old leader wasn't dead, just slow or partitioned. Now **two** nodes accept writes, and the data diverges. Prevent it with **fencing** (revoke the old leader's access, or require a lease/epoch number on every write) and consensus-based elections. The Distributed Systems module covers both.
- **False positives**: too short a timeout triggers failovers during brief load spikes, which add more load. Too long a timeout means minutes of downtime.

## Multi-leader replication

Several nodes accept writes, typically **one leader per data centre**, and they replicate to each other asynchronously.

```viz algo=arch title="Multi-leader: one leader per region"
eu      Users in Europe [users]
us      Users in the US [users]
leu     Leader · EU [db]
lus     Leader · US [db]
--
eu -> leu : local writes, low latency
us -> lus : local writes, low latency
leu <-> lus : async replication both ways
```

- ✓ Low-latency writes in every region; each region keeps working if the link between them breaks.
- ✗ **Write conflicts**: two regions change the same record at the same time.

Conflict resolution strategies:

- **Last write wins (LWW)**: keep the version with the highest timestamp. Simple, but it **silently drops** the other write, and clock skew can pick the "wrong" one.
- **Merge** the values (a set union for tags, or **CRDTs**, data types designed to merge automatically; see the collaborative editor case study).
- **Keep both** and let the application or user resolve it (Git-style).
- **Avoid conflicts**: route all writes for a given record (e.g. a user's data) to one "home" leader. This is the most common practical answer.

Multi-leader also describes **offline-first apps** (each device is a "leader" that syncs later) and **collaborative editing**.

## Leaderless replication

There's no leader at all: the client (or a coordinator node) sends each write to **several replicas** and reads from several, and **quorums** make sure reads see recent writes. This is the **Dynamo** design used by Cassandra, ScyllaDB, Riak, and DynamoDB's internals.

:::def Quorum (N, W, R)
Each value is stored on **N** replicas. A write succeeds once **W** of them confirm; a read queries **R** of them and takes the newest version. If **W + R > N**, every read set overlaps every write set in at least one replica, so reads see the latest successful write.
:::

With N = 3, a common choice is W = 2, R = 2: any one node can be down for both reads and writes. Leaderless systems also repair themselves: **read repair** (a read that sees a stale replica writes the newer value back) and **anti-entropy** (background comparison of replicas using Merkle trees). The quorums lesson in the next module goes deep, with a simulator.

## Choosing a replication design

| | Single-leader | Multi-leader | Leaderless |
|---|---|---|---|
| Writes go to | one leader | a leader per region | any W of N replicas |
| Write conflicts | none (one writer) | yes, must resolve | yes (resolved by versions/LWW) |
| Failover | needed (risky step) | other leaders keep working | not needed |
| Consistency | strong possible (read from leader) | eventual | tunable with quorums |
| Typical systems | Postgres, MySQL, MongoDB, Redis | multi-region Postgres/MySQL setups, CouchDB, offline apps | Cassandra, ScyllaDB, Riak, DynamoDB |
| Use when | the default for most systems | writes must be local in several regions | very high availability for writes, multi-DC |

:::interview Talking points
For most designs: *"Single-leader Postgres with two replicas in different availability zones, semi-synchronous replication so a committed write exists on two machines, automatic failover with fencing. Reads that must be fresh (a user's own data right after editing) go to the leader; other reads go to replicas."* That answers durability, availability and staleness in one breath.
:::

```quiz
? With asynchronous replication, the leader crashes right after acknowledging a write. What can happen?
+ The write is lost if it hadn't reached the follower that gets promoted
- Nothing; asynchronous replication can't lose data
- The client automatically retries
> The leader acknowledged before any follower had the write. Promoting a follower without it drops the write.

? A user changes their display name, reloads, and sees the old name. Which guarantee is missing?
- Monotonic reads
+ Read-your-writes
- Consistent prefix reads
> The user's own write isn't visible to their next read. Route their reads to the leader for a short time after writing (or to a sufficiently up-to-date replica).

? What is "split brain"?
- Two replicas hold different data because of lag
+ Two nodes both believe they are the leader and accept writes, so the data diverges
- A database split across two disks
> It typically follows a failover where the old leader wasn't really dead. Fencing and consensus prevent it.

? With N = 3 replicas, which quorum settings guarantee that reads see the latest write?
- W = 1, R = 1
+ W = 2, R = 2
- W = 1, R = 2
> W + R must exceed N: 2 + 2 = 4 > 3, so every read overlaps the latest write in at least one replica.
```

:::keypoints
- Replication keeps copies for **availability, read scaling, latency and durability**.
- **Single-leader** is the default. **Async** is fast but can lose writes on failover; **sync** is safe but slow; **semi-sync** is a common middle ground.
- **Replication lag** breaks **read-your-writes**, **monotonic reads** and **consistent prefix**; each has a routing fix.
- **Failover** risks lost writes and **split brain**; use fencing and consensus-based election.
- **Multi-leader** gives local writes in each region but needs **conflict resolution** (LWW, merge/CRDTs, or avoiding conflicts with a home leader).
- **Leaderless** (Dynamo-style) uses quorums with **W + R > N** plus read repair and anti-entropy.
:::
