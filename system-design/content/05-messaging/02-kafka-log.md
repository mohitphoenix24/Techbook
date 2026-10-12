---
title: Kafka and the Partitioned Log
level: intermediate
time: 50
summary: How Kafka works and why it's everywhere — the append-only log, topics and partitions, keys and ordering, consumer groups and offsets (with an interactive model), replication with leaders, ISR and acks, retention and log compaction, why it's so fast, and when to use it instead of a classic queue.
---

Apache Kafka (built at LinkedIn in 2011) is the backbone of event streaming at most large companies: activity tracking, metrics pipelines, change data capture, event-driven microservices, stream processing. It looks like a message queue, but its core idea is different and powerful: a **distributed, partitioned, replicated, append-only log** that consumers read at their own pace and can **re-read**.

:::def Log (in the Kafka sense)
An **append-only, ordered sequence of records**, each identified by an increasing **offset** (0, 1, 2, …). Records are never modified; new ones are added at the end. Readers keep track of how far they've read.
:::

## Topics, partitions and offsets

- A **topic** is a named stream of records: `orders`, `page-views`, `payments`.
- Each topic is split into **partitions**, each an independent log stored on a broker. Partitions are the unit of **parallelism** and **ordering**.
- Each record in a partition has an **offset**. Order is guaranteed **within a partition**, not across partitions.

### Keys decide the partition

A producer sends records with an optional **key**. By default, `partition = hash(key) mod numPartitions`, so **all records with the same key go to the same partition, in order**. Records without a key are spread across partitions.

Choose the key to match what must stay ordered: `user_id` for user events, `order_id` for order state changes, `account_id` for ledger entries.

## Consumer groups

:::def Consumer group
A set of consumers that **share** the work of reading a topic. Each partition is assigned to **exactly one** consumer in the group, which reads it in order. Different groups read the **same** topic **independently**, each with its own offsets.
:::

So a consumer group is a work queue, and multiple groups give you pub/sub, on the same topic. Explore it: produce some orders, let the consumers poll, then change the number of consumers and partitions, and add a second group.

```viz algo=kafka title="Partitions, keys and consumer groups"
partitions = 4
consumers = 2
```

Key observations:

- **Max parallelism = number of partitions.** A 5th consumer on a 4-partition topic sits idle. Pick partition counts with headroom for future scale (it's easy to add consumers, harder to add partitions without breaking key ordering).
- **Rebalancing**: when a consumer joins, leaves or dies, the group coordinator reassigns partitions. During a rebalance, consumption pauses briefly (newer "cooperative" rebalancing minimises this).
- **Independent groups**: billing and analytics read the same records at different speeds. Adding a new consumer group costs the producer nothing.

### Offsets and delivery semantics

Consumers **commit** their offset ("I've processed everything up to 41") to an internal Kafka topic. After a crash or rebalance, the new owner resumes from the last committed offset. **When** you commit decides the guarantee:

| Commit… | If the consumer crashes mid-batch | Guarantee |
|---|---|---|
| **before** processing | the batch is skipped | at-most-once |
| **after** processing (the norm) | the batch is processed again | at-least-once |
| atomically with the output, in a Kafka transaction (read-process-write to Kafka) | | exactly-once within Kafka |

Because offsets are just numbers, a consumer group can also **rewind**: reset its offset to yesterday and reprocess everything, for example after fixing a bug. That replay ability is one of Kafka's superpowers.

```js run title="A tiny partitioned log with a consumer group"
const hash = (s) => { let h = 0x811c9dc5; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); } h ^= h >>> 16; return h >>> 0; };

class Topic {
  constructor(name, partitions) { this.name = name; this.logs = Array.from({ length: partitions }, () => []); }
  produce(key, value) {
    const p = hash(key) % this.logs.length;
    this.logs[p].push({ key, value });
    return { partition: p, offset: this.logs[p].length - 1 };
  }
}

class ConsumerGroup {
  constructor(topic, members) {
    this.topic = topic;
    this.committed = topic.logs.map(() => 0);           // next offset to read, per partition
    this.assign(members);
  }
  assign(members) {                                     // round-robin partition assignment (a "rebalance")
    this.owner = this.topic.logs.map((_, p) => members[p % members.length]);
  }
  poll(member, max = 10) {
    const out = [];
    this.topic.logs.forEach((log, p) => {
      if (this.owner[p] !== member) return;
      for (let o = this.committed[p]; o < log.length && out.length < max; o++) out.push({ p, o, ...log[o] });
    });
    return out;
  }
  commit(records) { for (const r of records) this.committed[r.p] = Math.max(this.committed[r.p], r.o + 1); }
}

const orders = new Topic("orders", 3);
for (const [user, event] of [["asha", "created"], ["bilal", "created"], ["asha", "paid"], ["chen", "created"], ["asha", "shipped"], ["bilal", "paid"]])
  orders.produce(user, `${user}:${event}`);
orders.logs.forEach((log, p) => console.log(`P${p}:`, log.map((r) => r.value).join(" → ") || "(empty)"));

const billing = new ConsumerGroup(orders, ["billing-1", "billing-2"]);
const batch = billing.poll("billing-1");
console.log("billing-1 got:", batch.map((r) => `${r.value}@P${r.p}/${r.o}`).join(", "));
billing.commit(batch);                                  // commit AFTER processing → at-least-once

billing.assign(["billing-2"]);                          // billing-1 died: rebalance
console.log("after rebalance, billing-2 got:", billing.poll("billing-2").map((r) => r.value).join(", "));
console.log("asha's events stayed in order because they share a partition.");
```

## Replication and durability

Each partition has a **replication factor** (typically 3). One replica is the **leader** (it handles all reads and writes for that partition); the others are **followers** that copy the leader's log.

:::def In-sync replicas (ISR)
The set of replicas that are fully caught up with the leader. If the leader fails, a new leader is elected **from the ISR**, so no acknowledged record is lost.
:::

The producer's **`acks`** setting is the durability dial:

| `acks` | The producer is acknowledged when… | Risk |
|---|---|---|
| `0` | it sent the record (fire-and-forget) | records lost silently |
| `1` | the leader wrote it | lost if the leader dies before followers copy it |
| **`all`** (`-1`) | all in-sync replicas wrote it | none, if `min.insync.replicas ≥ 2` |

A common production setting: replication factor 3, `acks=all`, `min.insync.replicas=2`: a write survives one broker failure, and if two replicas are out, writes are refused rather than risk loss (CP behaviour for that partition). Producers can also be made **idempotent** (`enable.idempotence=true`): the broker discards duplicate retries of the same record using sequence numbers.

```viz algo=arch title="One partition, replicated three times"
prod   Producer | acks=all [service]
l      Broker 1 | P0 leader [stream]
f1     Broker 2 | P0 follower (in sync) [stream]
f2     Broker 3 | P0 follower (in sync) [stream]
cons   Consumer [worker]
--
prod -> l : append
l -> f1 : replicate
l -> f2 : replicate
cons -> l : fetch from offset 41
```

## Retention and compaction

Unlike a queue, Kafka **doesn't delete records when they're consumed**. Retention is a topic setting:

- **Time or size based**: keep records for 7 days (or 1 TB), then delete old log segments. Consumers that fall further behind than that lose data, so size retention for your slowest consumer's worst case.
- **Log compaction**: keep only the **latest record for each key** (older values for the same key are cleaned up eventually). The topic becomes a durable, replayable **table** of current state: "the latest profile for every user". Used for changelogs, CDC, and restoring state stores in stream processing.
- **Tiered storage**: old segments move to object storage (S3), allowing very long retention cheaply.

## Why Kafka is so fast

A single cluster handles millions of records per second. Several design decisions combine:

1. **Sequential disk I/O**: appends to the end of files and sequential reads, which are very fast even on hard disks (from the storage-engine lesson).
2. **The OS page cache**: Kafka relies on the operating system to cache recent data in RAM, so consumers that keep up read from memory.
3. **Zero-copy**: data goes from the page cache to the network socket with `sendfile`, without passing through the application.
4. **Batching and compression**: producers batch many records and compress them together; brokers store and forward batches unchanged.
5. **Partitioning**: load spreads over many brokers and disks, with no global ordering bottleneck.
6. **Dumb broker, smart consumer**: brokers don't track which consumer has acknowledged which message; consumers track their own offsets.

## Kafka vs a classic queue

| | Kafka (log) | RabbitMQ / SQS (queue) |
|---|---|---|
| After consumption | **retained** (replayable) | deleted |
| Multiple independent readers | cheap (consumer groups) | needs a copy per subscriber (fan-out exchange / SNS) |
| Ordering | per partition | per queue (FIFO) or best effort |
| Parallelism | limited by partition count | add consumers freely |
| Per-message features | none: no per-message ack, priority or delay | acks, priorities, delays, routing |
| Throughput | very high | high |
| Best for | event streams, CDC, analytics, event sourcing, many consumers | task queues, job distribution, complex routing |

Similar log systems: **Amazon Kinesis**, **Apache Pulsar** (separates storage and serving), **Redpanda** (Kafka-compatible, written in C++), **Azure Event Hubs**.

:::interview Kafka talking points
*"Events go to a Kafka topic keyed by `order_id`, so each order's events are ordered. 24 partitions give room for 24 parallel consumers. Replication factor 3 with `acks=all` and `min.insync.replicas=2`. Each downstream service is its own consumer group: billing, notifications and the analytics pipeline read independently, and we can replay from an offset after a bug fix. Consumers commit offsets after processing and are idempotent by event id."*
:::

```quiz
? A topic has 6 partitions and a consumer group has 8 consumers. How many consumers actively read?
- 8
+ 6
- 1
> Each partition is consumed by exactly one member of a group, so at most 6 members have work; 2 are idle.

? How does Kafka keep all events of one order in order?
+ The producer uses the order id as the key, so they hash to the same partition, and a partition is read in order by one consumer
- Kafka sorts all records globally by timestamp
- Consumers sort records after reading them
> Ordering is per partition; the key decides the partition.

? Which producer settings make an acknowledged record survive a single broker failure?
- acks=0
- acks=1
+ acks=all with min.insync.replicas=2 (and replication factor 3)
> The record is on at least two in-sync replicas before the producer is told it succeeded.

? What does log compaction keep?
- Only the first record of each key
+ The latest record for each key, so the topic acts as a table of current values
- Nothing older than one hour
> Older records with the same key are eventually removed, leaving the latest state per key.
```

:::keypoints
- Kafka is a **distributed, replicated, append-only log**: topics → partitions → records with **offsets**.
- The **key** picks the partition; order is guaranteed **within a partition** only.
- **Consumer groups** share partitions (max parallelism = partition count); separate groups read independently. Consumers **commit offsets**, and can **rewind** to replay.
- Durability: replication factor 3, **ISR**, `acks=all`, `min.insync.replicas=2`, idempotent producers.
- **Retention** keeps records after consumption; **log compaction** keeps the latest value per key.
- It's fast thanks to sequential I/O, the page cache, zero-copy, batching and partitioning. Use it for event streams; use queues like RabbitMQ/SQS for task distribution.
:::
