---
title: Message Queues and Pub/Sub
level: intermediate
time: 45
summary: Why asynchronous messaging decouples and protects systems, point-to-point queues vs publish/subscribe, delivery guarantees (at-most-once, at-least-once, effectively-once), acknowledgements and visibility timeouts, ordering, dead-letter queues, backpressure, and choosing between RabbitMQ, SQS, Kafka and friends.
---

In the scaling lesson, a **queue** let the API reply immediately while workers handled slow work in the background. That's one of many reasons queues appear in almost every large design. Message brokers decouple services in time, absorb traffic spikes, and let many consumers share or fan out work. They also bring their own rules about delivery, ordering and duplicates, which interviewers probe.

:::def Message queue
A durable buffer between **producers** (which send messages) and **consumers** (which process them). Producers and consumers don't call each other directly, don't need to be up at the same time, and can run at different speeds.
:::

## Why queues?

1. **Decoupling**: the order service publishes "OrderPlaced" and doesn't know or care who listens (billing, email, analytics). New consumers can be added without touching the producer.
2. **Absorbing spikes (load levelling)**: a burst of 10× traffic fills the queue instead of crashing the consumers; they drain it at their own pace.
3. **Reliability**: if a consumer is down, messages wait in the queue instead of being lost.
4. **Async user experience**: slow work (video transcoding, emails, reports) leaves the request path.
5. **Scaling workers independently**: add consumers when the queue grows.

Explore load levelling. With the spike pattern, the queue absorbs the burst: nothing is lost, but messages wait longer. Add consumers, or turn on autoscaling, to drain it faster.

```viz algo=queue title="A queue absorbing a traffic spike"
pattern = spike
consumers = 3
rate = 40
```

:::tip Queue depth and age are your key metrics
Monitor the **number of messages waiting** and the **age of the oldest message**. A growing backlog means consumers can't keep up; the age tells you how stale the work is getting. Autoscaling workers on queue depth (as in the simulator) is a standard pattern, for example with KEDA on Kubernetes or SQS-based scaling on AWS.
:::

## Two messaging models

### Point-to-point (work queue)

Each message is delivered to **exactly one** of the competing consumers. It distributes **work**: 10 workers share the thumbnail jobs.

### Publish/subscribe (pub/sub)

Each message is delivered to **every subscriber** (every subscription gets its own copy). It distributes **information**: "OrderPlaced" goes to billing **and** email **and** analytics.

```viz algo=arch title="Work queue vs pub/sub"
p1    Upload API [service]
q     Work queue | thumbnails [queue]
w     Thumbnail workers | each job to ONE worker [worker*3]
p2    Order service [service]
topic Topic | OrderPlaced [stream]
bill  Billing [service]
mail  Email [mail]
ana   Analytics [chart]
--
p1 -> q
q -> w
p2 -> topic
topic -> bill : copy
topic -> mail : copy
topic -> ana : copy
```

Most real systems combine them: a topic fans out to several **subscriptions**, and each subscription is a work queue shared by that service's instances (SNS → SQS, Kafka topics with consumer groups, Google Pub/Sub subscriptions).

## Delivery guarantees

A message's life: the producer sends it, the broker stores it, a consumer receives it, processes it, and **acknowledges** it, after which the broker deletes it (or marks it consumed). Failures can strike at any of these steps, which gives three possible guarantees:

| Guarantee | Meaning | How | Risk |
|---|---|---|---|
| **At-most-once** | delivered 0 or 1 times | ack **before** processing (or fire-and-forget) | a crash during processing loses the message |
| **At-least-once** | delivered 1 or more times | ack **after** processing; redeliver if no ack | a crash after processing but before the ack causes a **duplicate** |
| **Exactly-once** | processed exactly 1 time | not possible end-to-end in general; approximated | |

**At-least-once is the standard choice**, combined with **idempotent consumers** so that duplicates are harmless. That combination is often called **effectively-once**. (Kafka's "exactly-once semantics" is real, but it covers reading from and writing to Kafka within transactions; as soon as a consumer has a side effect outside Kafka, such as charging a card or sending an email, you're back to idempotency.)

```viz algo=seq title="At-least-once: why duplicates happen"
participant b Broker [queue]
participant c Consumer [worker]
participant db Database [db]
b -> c : message m42 (charge order 77)
c -> db : charge order 77 ✓
note c : consumer crashes before acknowledging
note b : visibility timeout expires: m42 is visible again
b -> c : message m42 again (redelivery)
c -> db : charge order 77?? | Without idempotency this charges twice. With a processed-message table or idempotency key, it's skipped.
c -> b : ack m42
```

### Acknowledgements and visibility timeouts

- **RabbitMQ**: a delivered message stays "unacked" while the consumer works; if the consumer's connection dies, the broker redelivers it.
- **SQS**: a received message becomes **invisible** for a **visibility timeout** (say 30 s). If it isn't deleted within that time, it reappears for another consumer. Set the timeout longer than the processing time (and extend it for long jobs), or jobs get processed twice concurrently.
- **Kafka**: consumers commit **offsets** (positions in the log) instead of acknowledging individual messages; the next lesson covers it.

## Ordering

Ordering is expensive at scale, so most systems only promise it **within a key**:

- A plain distributed queue (SQS standard) is **best-effort ordered**: messages can arrive out of order, and occasionally twice.
- **FIFO queues** (SQS FIFO, RabbitMQ single-consumer queues) preserve order but limit throughput.
- **Kafka** preserves order **within a partition**. Send all messages for one entity (one user, one order) with the same **key**, and they land in the same partition and are consumed in order. Across keys, there's no global order, and you rarely need one.

:::warn Retries and parallel consumers break ordering
If message 1 fails and is retried while message 2 succeeds, they finish out of order. When order matters per entity, process each key sequentially (one partition, one consumer at a time) and make handlers tolerate stale events (compare a version number and ignore older updates).
:::

## Poison messages and dead-letter queues

Some messages will **never** succeed: malformed data, a bug triggered by one specific input, a reference to something deleted. Retried forever, they block the queue or burn resources.

:::def Dead-letter queue (DLQ)
A separate queue where messages go after failing a set number of times (say 5). The main queue keeps flowing; engineers inspect the DLQ, fix the bug, and **replay** the messages.
:::

Alert on DLQ growth: a DLQ that silently fills up is lost work.

## Backpressure

When producers are faster than consumers for a long time, a queue only **delays** the problem: it grows until it runs out of space or the messages become too old to matter.

:::def Backpressure
Signalling producers to **slow down** when consumers can't keep up, instead of buffering without limit. Examples: a bounded queue that blocks or rejects producers when full, HTTP 429/503 responses with `Retry-After`, TCP flow control, reactive streams.
:::

Options when the backlog keeps growing: scale out consumers, **shed load** (drop low-priority messages, such as analytics events during an incident), apply backpressure to producers, or set a **message TTL** so stale work expires.

## Choosing a broker

| Broker | Model | Strengths | Typical use |
|---|---|---|---|
| **RabbitMQ** | queues + exchanges (routing), push to consumers | flexible routing, per-message acks, priorities, delayed messages | task queues, RPC-style work, complex routing |
| **Amazon SQS** (+ SNS for fan-out) | managed queues | zero operations, scales automatically, DLQs built in | AWS background jobs, decoupling services |
| **Apache Kafka** | distributed, partitioned, **retained log** | huge throughput, ordering per partition, **replay**, many independent consumer groups | event streaming, CDC, analytics pipelines, event sourcing |
| **Google Pub/Sub**, **Azure Service Bus** | managed pub/sub / queues | managed, global | cloud-native messaging |
| **Redis Streams / lists** | lightweight log / queue | simple, fast, already deployed | small-scale queues |
| **NATS** | lightweight pub/sub (JetStream for persistence) | very low latency, simple | IoT, service messaging |

The big split: **traditional queues** (RabbitMQ, SQS) **delete** messages once consumed, so they're for distributing **tasks**. **Log-based** brokers (Kafka, Pulsar, Kinesis) **retain** messages for days or forever, so many consumers can read the same stream independently and **re-read** history. That's the next lesson.

:::interview When to add a queue
Add a queue when there's **slow or failure-prone work** that the user doesn't need to wait for, **spiky traffic** downstream services can't absorb, or **one event that several services react to**. Then say the guarantees: *"at-least-once delivery, consumers are idempotent using the event id, failed messages go to a DLQ after 5 attempts with exponential backoff, and we alert on queue age."*
:::

```quiz
? A thumbnail job must be processed by exactly one of 20 identical workers. Which model fits?
+ A point-to-point work queue with competing consumers
- Pub/sub, so every worker gets a copy
- A broadcast to all workers over WebSockets
> Each message is delivered to one consumer, which spreads the work.

? With at-least-once delivery, a consumer charges a card, then crashes before acknowledging. What happens next?
- The message is lost
+ The message is redelivered, so the charge may happen twice unless the consumer is idempotent
- The broker detects the charge and skips the message
> At-least-once trades duplicates for never losing messages. Idempotency makes the duplicate harmless.

? Why does a dead-letter queue help?
+ Messages that keep failing are moved aside after N attempts, so they don't block or overload the main queue, and can be inspected and replayed
- It makes delivery exactly-once
- It speeds up consumers
> Poison messages would otherwise be retried forever.

? You need all events for a given user to be processed in order, at high throughput. What's the usual approach?
- One global FIFO queue for everything
+ Partition by user id (e.g. a Kafka message key), so each user's events stay in one ordered partition
- Many parallel consumers on an unordered queue
> Ordering per key scales: different users are processed in parallel, each user sequentially.
```

:::keypoints
- Queues **decouple** services, **absorb spikes**, keep messages safe while consumers are down, and move slow work off the request path.
- **Point-to-point** distributes tasks to one of many consumers; **pub/sub** gives every subscription a copy.
- Delivery is **at-most-once**, **at-least-once** (the standard) or "exactly-once" (in practice: at-least-once + **idempotent consumers** = effectively-once).
- Understand acks, **visibility timeouts** and redelivery; order is guaranteed only **per key / partition**.
- Use **DLQs** for poison messages, **backpressure**/load shedding for sustained overload, and monitor queue depth and age.
- **RabbitMQ/SQS** delete messages after consumption (task queues); **Kafka** retains a replayable log for many consumer groups.
:::
