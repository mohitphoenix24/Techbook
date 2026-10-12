---
title: Trade-offs and Patterns Cheat Sheet
level: intermediate
time: 35
summary: The recurring decisions in every HLD interview in one place — the classic trade-offs (consistency vs availability, latency vs throughput, push vs pull, SQL vs NoSQL, sync vs async, normalise vs denormalise…), a "if you hear X, reach for Y" pattern map, and the go-to answers for hot spots, contention, real-time delivery, large files and big fan-outs.
---

Most design interviews reuse the same dozen decisions. Having them ready, with the reasons, lets you spend your thinking on what's unique about the problem. Use this page as a pre-interview refresher; each row links back to a lesson.

## The classic trade-offs

| Decision | Option A | Option B | Choose A when… | Choose B when… |
|---|---|---|---|---|
| **Consistency vs availability** | CP: reject when unsure | AP: answer, maybe stale | money, bookings, inventory, uniqueness | feeds, counts, catalogs, presence |
| **Latency vs consistency** (PACELC) | read from the leader / quorum | read the nearest replica | read-your-writes, correctness | global low-latency reads |
| **Push vs pull** (feeds) | fan-out on write | fan-out on read | normal users, read-heavy | celebrities, rarely active readers |
| **Sync vs async** | call and wait | queue / event | the user needs the result now | slow, retryable, or many reactors |
| **SQL vs NoSQL** | relational, transactions | key-value / wide-column / document | relations, invariants, ad-hoc queries | huge scale, simple access patterns, flexible schema |
| **Normalise vs denormalise** | one copy of each fact | precomputed copies | write-heavy, correctness first | read-heavy hot paths |
| **Cache-aside vs write-through** | load on miss | write both | read-heavy, tolerate brief staleness | data read right after writes |
| **Polling vs push** (clients) | short/long polling | SSE / WebSocket | infrequent updates, simple infra | real-time, chat, live data |
| **Strong vs eventual ordering** | single partition / sequencer | per-key ordering | strict global order (rare) | per user/chat/order ordering (usual) |
| **Batch vs stream** | periodic jobs | continuous processing | reports, ML training, billing | dashboards, alerts, fraud, trending |
| **Monolith vs microservices** | one deployable | many services | small team, early product | many teams, divergent scaling needs |
| **Accuracy vs cost** | exact counts | approximate (HLL, CMS, sampling) | money, billing | analytics, dashboards, trending |

## "If you hear X, reach for Y"

| Requirement / phrase | Reach for | Lesson |
|---|---|---|
| "millions of reads, few writes" | cache (cache-aside + TTL), read replicas, CDN | caching, replication |
| "static files, images, video" | object storage + CDN, pre-signed uploads | object storage |
| "global users, low latency" | CDN, GeoDNS, regional replicas, edge | DNS & CDN, multi-region |
| "must never double-book / oversell" | atomic conditional update, unique constraint, holds with TTL | SQL & ACID, thread-safe design |
| "must not charge twice" | idempotency keys, outbox, reconciliation | API design, distributed transactions |
| "real-time updates / chat / live" | WebSockets (or SSE) + pub/sub for routing to gateways | real-time protocols |
| "notify many users" | queue + workers, fan-out service, APNs/FCM | messaging, notification case study |
| "slow processing (video, ML, reports)" | async jobs, queue, workers, status API | background jobs |
| "spiky traffic" | queue as buffer, autoscaling, rate limits, waiting room | queues, deployment |
| "abuse / protect the API" | rate limiting (token bucket / sliding window in Redis) | rate limiting |
| "search / text matching" | inverted index (Elasticsearch) fed by CDC | search systems |
| "find nearby" | geohash / quadtree / S2/H3, in-memory index for moving objects | geospatial |
| "trending / top-k / heavy hitters" | stream processing + Count-Min Sketch + heap | probabilistic structures, streams |
| "unique visitors / distinct counts" | HyperLogLog | probabilistic structures |
| "has this been seen?" at huge scale | Bloom filter | probabilistic structures |
| "unique IDs across servers" | Snowflake / UUIDv7 | unique IDs |
| "data too big / too many writes for one DB" | sharding (choose the key!), consistent hashing | sharding |
| "leader / only one worker" | consensus store (etcd/ZooKeeper) leases + fencing tokens | locks & leader election |
| "audit trail / history / undo" | event sourcing, append-only ledger | event-driven |
| "different read and write shapes" | CQRS with read models | event-driven |
| "steps across services" | saga + outbox + idempotent consumers | distributed transactions |
| "time-ordered data, huge write volume" | wide-column store (Cassandra), LSM | NoSQL, storage engines |
| "analytics over everything" | stream to a columnar warehouse (OLAP) | NoSQL, batch & stream |

## Go-to answers for recurring deep dives

- **Hot key / celebrity / viral item**: cache it in-process for seconds, replicate the key, split counters into N sub-keys, treat celebrities specially (pull instead of push), request coalescing.
- **High contention on one resource** (last seat, flash sale): atomic conditional updates or per-item locks, short holds with expiry, a queue in front (serialise per item), a virtual waiting room to cap concurrency.
- **Thundering herd / stampede**: single-flight, stale-while-revalidate, TTL jitter, retries with backoff + jitter.
- **Large fan-out** (one event to millions): async workers through a queue, batching, fan-out on read for the biggest producers, CDN for identical content.
- **Large files**: chunked/multipart uploads straight to object storage via pre-signed URLs, resumable uploads, content hashing for dedup, async processing.
- **Exactly-once effects**: at-least-once delivery + idempotent consumers (dedupe by id) + outbox; never rely on exactly-once delivery.
- **Ordering**: partition by the entity key (user, chat, order) and process each partition sequentially; sequence numbers to detect gaps.
- **A dependency is slow or down**: timeouts from p99, retries with budgets, circuit breaker + fallback, bulkheads, graceful degradation.
- **A region goes down**: multi-AZ by default; for regions, pick the DR tier by RPO/RTO; home-region routing for writes; health-checked DNS failover.

## Numbers worth having at your fingertips

| Quantity | Value |
|---|---|
| seconds per day | ~10⁵ (86,400) |
| 1 M requests/day | ~12 per second |
| RAM vs SSD vs datacentre RTT vs cross-ocean RTT | 100 ns · 16–100 µs · 0.5 ms · ~150 ms |
| one app server | 1K–10K simple requests/s |
| one SQL primary | 5K–20K simple queries/s; a few TB comfortable |
| one Redis node | 100K+ ops/s, tens of GB |
| one Kafka broker | hundreds of MB/s |
| availability nines | 99.9% ≈ 8.8 h/yr · 99.99% ≈ 53 min/yr |
| Snowflake capacity | 4,096 ids/ms per machine |
| Bloom filter | ~10 bits per item for 1% false positives |
| HyperLogLog | ~12 KB for ~0.8% error |

## Questions that always deserve an answer

Before you wrap up, make sure you've addressed:

1. **Where is each piece of data stored, and keyed by what?**
2. **What happens on the hottest path at peak load?**
3. **What happens when each component fails?**
4. **Where could data be lost or duplicated, and how is that prevented?**
5. **What's eventually consistent, and why is that acceptable to users?**
6. **What would you monitor and alert on?**

```quiz
? A ticketing system must never sell the same seat twice, while the "seats left" counter on the event page can lag. What's the CAP choice per feature?
+ CP for the seat reservation, AP (cached, slightly stale) for the displayed counter
- AP for both
- CP for both, served from the primary database on every page view
> Choose per feature: correctness where money/inventory is at stake, availability and speed for display.

? "Show the top 10 trending hashtags of the last 5 minutes" calls for…
+ Stream processing with sliding windows plus a Count-Min Sketch and a min-heap for the top-k
- A nightly batch job
- A SQL GROUP BY on every page load
> Real-time freshness + approximate heavy hitters at scale.

? A payment webhook may arrive twice. What makes processing it safe?
+ An idempotent consumer that records processed event ids (in the same transaction as the side effect)
- Hoping the provider never retries
- Exactly-once delivery from the queue
> At-least-once delivery + idempotency = effectively-once.
```

:::keypoints
- Most designs reuse a dozen trade-offs: CP vs AP per feature, push vs pull, sync vs async, SQL vs NoSQL, normalise vs denormalise, exact vs approximate.
- Map requirement phrases to building blocks ("never double-book" → atomic conditional updates/holds; "real-time" → WebSockets + pub/sub; "nearby" → geo index…).
- Keep standard answers ready for hot keys, contention, stampedes, fan-out, large files, exactly-once effects, ordering, slow dependencies and region failures.
- Before wrapping up, answer: where data lives, the hot path at peak, failures, loss/duplication, consistency, monitoring.
:::
