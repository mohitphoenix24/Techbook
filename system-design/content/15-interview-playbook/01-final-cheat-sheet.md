---
title: The Final Cheat Sheet
level: mixed
time: 30
summary: The whole course on a few screens, for the last days before an interview — the 45-minute HLD script, a reusable estimation helper, the one-line core idea of every case study, the LLD checklist and pattern map, concurrency reminders, and the questions to ask yourself before you say "that's my design".
---

Read this the day before, and again an hour before. Every line points back to a lesson you can revisit.

## The HLD script (45 minutes)

:::flow The interview timeline
Requirements · 5 min | functional + non-functional, as numbers
Estimates · 3–5 min | QPS, storage, bandwidth → conclusions
API + data · 5 min | endpoints, entities, keys
High-level design · 10 min | boxes, then walk each flow through them
Deep dives · 15 min | the 2–3 hardest parts: options → trade-offs → decision
Wrap-up · 3 min | bottlenecks, failures, monitoring
:::

- **Requirements**: 3–5 functional features (say what's out of scope); non-functional as **numbers** (latency, availability, consistency per feature, scale).
- **Estimates**: always end with a **conclusion** ("read-heavy → cache", "fits in memory → replicate", "egress dominates → CDN").
- **High-level design**: draw the simplest design that satisfies the requirements; walk **each** functional requirement through it.
- **Deep dives**: find the problem's core difficulty; for each: options → trade-offs tied to requirements → decision.
- **Wrap-up**: hot paths at peak, failure of each component, data loss/duplication, consistency, monitoring.

## Estimation in five lines

```js run title="A reusable back-of-the-envelope helper"
// A back-of-the-envelope helper: the same five lines of arithmetic answer most estimate questions
const fmt = (n) => n >= 1e15 ? (n / 1e15).toFixed(1) + " P" : n >= 1e12 ? (n / 1e12).toFixed(1) + " T" : n >= 1e9 ? (n / 1e9).toFixed(1) + " G" : n >= 1e6 ? (n / 1e6).toFixed(1) + " M" : n >= 1e3 ? (n / 1e3).toFixed(1) + " K" : n.toFixed(0);
function estimate({ name, dau, actionsPerUser, readWriteRatio, bytesPerWrite, years = 5, peak = 3 }) {
  const writesPerSec = (dau * actionsPerUser) / 86_400;
  const readsPerSec = writesPerSec * readWriteRatio;
  const storage = dau * actionsPerUser * bytesPerWrite * 365 * years;
  console.log(`${name.padEnd(14)} writes ${fmt(writesPerSec)}/s (peak ${fmt(writesPerSec * peak)}/s), ` +
    `reads ${fmt(readsPerSec)}/s (peak ${fmt(readsPerSec * peak)}/s), storage ${fmt(storage)}B over ${years} year${years > 1 ? "s" : ""}`);
}
estimate({ name: "URL shortener", dau: 10e6, actionsPerUser: 0.33, readWriteRatio: 100, bytesPerWrite: 500 });
estimate({ name: "Chat", dau: 500e6, actionsPerUser: 40, readWriteRatio: 1, bytesPerWrite: 100, years: 1 });
estimate({ name: "News feed", dau: 300e6, actionsPerUser: 2, readWriteRatio: 5, bytesPerWrite: 1000 });
estimate({ name: "Photo sharing", dau: 500e6, actionsPerUser: 0.2, readWriteRatio: 100, bytesPerWrite: 2e6, years: 1 });
```

Anchors: 1 day ≈ 10⁵ s · 1 M/day ≈ 12/s · peak ≈ 2–3× average · SSD read ~100 µs, same-DC round trip ~0.5 ms, cross-ocean ~150 ms · one Redis ~100K ops/s · one SQL primary ~10K simple queries/s · 99.9% ≈ 8.8 h/year, 99.99% ≈ 53 min/year.

## Every case study in one line

| Problem | The core idea to say out loud |
|---|---|
| **URL shortener** | read-heavy: CDN → cache → KV store; keys from counter ranges + scramble; 302 for analytics; clicks async |
| **Pastebin** | content in object storage, metadata in a DB; unguessable keys; lazy expiry + sweeper |
| **Rate limiter** | gateway middleware + Redis; one atomic Lua script per check; fail open vs closed per rule; token leasing for hot keys |
| **Key-value store** | consistent hashing + vnodes, N/W/R quorums, version vectors, hinted handoff, Merkle anti-entropy, LSM per node |
| **Web crawler** | frontier = priority front queues + per-host back queues (politeness); Bloom filter URL-seen; SimHash; partition by host |
| **Notifications** | planner (prefs, quiet hours, caps) → per-channel, per-priority queues → workers with failover; idempotency |
| **News feed** | hybrid fan-out: push for normal accounts, pull for celebrities; feed = post ids in Redis; cursor pagination |
| **Chat** | WebSocket gateways + session registry + pub/sub; per-conversation seq; clientMsgId dedup; sync after last seq |
| **Typeahead** | trie with top-k per node, built offline from logs; immutable snapshots in memory; CDN + client caching |
| **Instagram** | pre-signed uploads → async variants → CDN; metadata sharded by user with shard-embedding ids |
| **Leaderboard / top-k** | Redis sorted sets; merge per-shard top N; trending = bucketed counts + CMS + heap, ranked by growth |
| **YouTube** | resumable upload → transcoding DAG → HLS/DASH segments; ABR player; CDN + ISP caches |
| **Dropbox** | content-defined chunks by hash; upload missing chunks, then commit metadata; journal + cursor sync |
| **Uber** | in-memory geo index per city (cells + rings); atomic driver reservation; trips in a consistent store |
| **Yelp** | static places: quadtree/geohash index replicated in memory; adaptive radius; CDC updates |
| **Ticketmaster** | waiting room; atomic conditional updates free → held → sold; holds expire; idempotent payment |
| **Payments** | idempotency keys at every hop; state machine; double-entry append-only ledger; nightly reconciliation |
| **Google Docs** | one session server per doc; OT (or CRDT); operation log + snapshots; cursors ephemeral |
| **Metrics** | cardinality limits; Kafka → TSDB (delta-of-delta/XOR); rollups with histograms; alert for-durations |
| **Job scheduler** | deterministic run ids; claims with leases; at-least-once + idempotent effects; fair queues |
| **LLM serving** | continuous batching; KV-cache limits concurrency; prefix-affinity routing; token-based quotas; SSE |

## The LLD checklist

1. **Clarify** use cases and actors; list the nouns (classes) and verbs (methods).
2. Find the **variation points**; each one is a candidate interface (Strategy, State, Factory).
3. Sketch the **class diagram**: composition over inheritance, depend on interfaces, small classes (SRP).
4. Write the **core flow** in code first (park/leave, book/cancel), then the extensions.
5. Name the **concurrency** hazards: what must be atomic? Lock at the right granularity (per floor, per show, per account).
6. Mention **testing** (inject clocks, random sources and strategies) and **extensions** (new vehicle type, new pricing) and how the design absorbs them (Open/Closed).

| Smell in the requirements | Pattern |
|---|---|
| "different ways to compute X" | **Strategy** |
| behaviour depends on a mode/status | **State** |
| "notify when something changes" | **Observer** / pub-sub |
| undo/redo, queue actions | **Command** (+ **Memento**) |
| create families or decide which class at runtime | **Factory** / **Abstract Factory** |
| many optional parameters | **Builder** |
| add features without changing the class | **Decorator** |
| incompatible interface to integrate | **Adapter**; simplify a subsystem: **Facade** |
| tree of parts and wholes | **Composite** |
| a chain of handlers that may each stop the request | **Chain of Responsibility** |
| the same algorithm with varying steps | **Template Method** |
| exactly one shared instance (and only then) | **Singleton**, preferably injected |

## Concurrency reminders

- Check-then-act on shared state is a race: make it **atomic** (lock, CAS, conditional update).
- Lock ordering prevents deadlocks; keep critical sections small; never call out (I/O, callbacks) while holding a lock.
- Producer–consumer with a bounded queue gives back-pressure; thread pools bound concurrency.
- In JS, `await` between a check and an update is the same race as two threads.

## Before you say "that's my design"

1. Where is each piece of data stored, keyed by what, and how big is it?
2. What happens on the hottest path at peak? Is there a hot key?
3. What happens when each component fails? What's the blast radius?
4. Where could data be lost or duplicated? (idempotency, outbox, at-least-once)
5. What's eventually consistent, and why is that acceptable to users?
6. What would you monitor and alert on?

```quiz
? You finish the high-level design with 20 minutes left. What's the best use of the time?
+ Deep-dive into the 2–3 hardest parts of this problem, comparing options and deciding
- Add more boxes for completeness
- Recompute the estimates more precisely
> Depth on the core difficulty is what separates strong answers.

? A requirement says "pricing differs for weekends, members and holidays, and new rules will come". Which pattern?
+ Strategy (possibly composed), selected per context
- Singleton
- Iterator
> Variation point → interface.
```

:::keypoints
- Follow the script: requirements → estimates with conclusions → API/data → simple design → 2–3 deep dives → wrap-up.
- Know the one-line core idea of each classic problem, and why it's the core.
- LLD: find variation points, depend on interfaces, write the core flow, handle concurrency, explain extensions.
- Always close with data placement, hot paths, failures, loss/duplication, consistency and monitoring.
:::
