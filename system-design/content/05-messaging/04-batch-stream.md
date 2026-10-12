---
title: Batch and Stream Processing
level: advanced
time: 45
summary: Processing data in bulk vs as it arrives — MapReduce and Spark for batch (with a runnable word count), stream processors like Flink and Kafka Streams, windows (tumbling, sliding, session), event time vs processing time, watermarks and late events, stateful processing with checkpoints, and the Lambda vs Kappa architectures.
---

Requests and responses are only half of a large system. The other half processes **data in bulk**: daily reports, search indexes, recommendation models, fraud scores, trending topics, billing aggregates. That work is done either in **batches** (process yesterday's data at 2 a.m.) or as **streams** (process each event within seconds of it happening). Several case studies (ad click aggregation, metrics, leaderboards) hinge on this choice.

| | Batch | Stream |
|---|---|---|
| Input | a bounded dataset (yesterday's logs) | an unbounded flow of events |
| Latency | minutes to hours | milliseconds to seconds |
| Correctness | easy: all data is present; just rerun on failure | harder: late, out-of-order and duplicate events |
| Throughput / cost | very efficient | always running |
| Tools | Hadoop MapReduce, Spark, Hive, dbt, BigQuery | Flink, Kafka Streams, Spark Structured Streaming, Kinesis, Beam/Dataflow |
| Typical jobs | reports, ML training, backfills, billing | real-time dashboards, alerts, fraud detection, trending, recommendations |

## Batch processing and MapReduce

**MapReduce** (Google, 2004) made it possible to process petabytes on thousands of commodity machines with a simple programming model:

:::flow MapReduce
Map | each worker reads a chunk of input and emits (key, value) pairs
Shuffle | pairs are grouped by key and sent to the reducer responsible for that key
Reduce | each reducer combines all values for its keys into results
Write | results are written to distributed storage
:::

The framework handles distribution, scheduling, retries of failed tasks, and moving the code to where the data lives. The classic example, counting words:

```js run title="MapReduce word count, simulated on 3 'machines'"
const documents = [
  "the cache is warm the database is cold",
  "the queue absorbs the spike",
  "the database is the source of truth",
];

// MAP: each worker turns its chunk into (word, 1) pairs
const mapped = documents.map((doc, worker) => ({
  worker,
  pairs: doc.split(" ").map((w) => [w, 1]),
}));

// SHUFFLE: route each pair to a reducer by hash(key) mod R, grouping by key
const R = 2;
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const reducers = Array.from({ length: R }, () => new Map());
for (const { pairs } of mapped)
  for (const [word, one] of pairs) {
    const bucket = reducers[hash(word) % R];
    bucket.set(word, [...(bucket.get(word) ?? []), one]);
  }

// REDUCE: each reducer sums the values for its keys
const results = reducers.flatMap((bucket, r) =>
  [...bucket].map(([word, ones]) => ({ word, count: ones.reduce((a, b) => a + b, 0), reducer: r })));

results.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
console.log(results.slice(0, 5).map((r) => `${r.word}=${r.count} (reducer ${r.reducer})`).join("\n"));
```

**Spark** (2014) replaced MapReduce for most uses. It keeps intermediate data **in memory** between steps (MapReduce wrote everything to disk), offers a richer API (joins, aggregations, SQL, DataFrames, ML), and is often 10–100× faster. Today, batch processing is frequently plain **SQL on a cloud warehouse** (BigQuery, Snowflake, Redshift) or on files in a **data lake** (Parquet on S3 with Spark, Trino or Athena), orchestrated by schedulers like **Airflow**.

:::def ETL vs ELT
**ETL**: Extract data from sources, Transform it in a processing engine, Load the result into the warehouse. **ELT**: Extract and Load raw data into the warehouse first, then Transform it there with SQL (dbt). Cheap warehouse compute made ELT the modern default.
:::

## Stream processing

A **stream processor** consumes an unbounded event stream (usually from Kafka), keeps **state** (counts, aggregates, windows, joins), and emits results continuously. **Apache Flink** is the most capable engine; **Kafka Streams** is a library that runs inside your own services; **Spark Structured Streaming** processes small micro-batches.

### Windows

Infinite streams have no "end" to aggregate over, so aggregations are computed over **windows**:

:::def Tumbling window
Fixed-size, non-overlapping intervals: clicks per minute (12:00–12:01, 12:01–12:02, …). Each event belongs to exactly one window.
:::

:::def Sliding (hopping) window
Fixed-size windows that **overlap**: "clicks in the last 5 minutes, updated every minute". Each event belongs to several windows.
:::

:::def Session window
A window per user that stays open while events keep arriving and closes after a **gap of inactivity** (say 30 minutes). Its length varies: a user's browsing session.
:::

```js run title="Tumbling, sliding and session windows over the same events"
// (user, event time in seconds)
const events = [["asha", 2], ["bilal", 5], ["asha", 8], ["asha", 31], ["bilal", 34], ["asha", 63], ["chen", 64], ["asha", 140]];

// Tumbling 60 s: count events per window
const tumbling = {};
for (const [, t] of events) { const w = Math.floor(t / 60) * 60; tumbling[`[${w},${w + 60})`] = (tumbling[`[${w},${w + 60})`] ?? 0) + 1; }
console.log("tumbling 60s:", tumbling);

// Sliding: 60 s windows every 30 s (each event lands in 2 windows)
const sliding = {};
for (const [, t] of events)
  for (let start = Math.floor(t / 30) * 30 - 30; start <= t; start += 30)
    if (start >= 0 && t < start + 60) sliding[`[${start},${start + 60})`] = (sliding[`[${start},${start + 60})`] ?? 0) + 1;
console.log("sliding 60s/30s:", sliding);

// Session windows per user, gap = 30 s
const sessions = {};
for (const [user, t] of [...events].sort((a, b) => a[1] - b[1])) {
  const list = (sessions[user] ??= []);
  const last = list.at(-1);
  if (last && t - last.end <= 30) { last.end = t; last.n++; } else list.push({ start: t, end: t, n: 1 });
}
for (const [user, list] of Object.entries(sessions))
  console.log(`sessions for ${user}:`, list.map((s) => `${s.start}-${s.end}s (${s.n} events)`).join(", "));
```

### Event time, processing time and watermarks

:::def Event time vs processing time
**Event time**: when the event actually happened (stamped on the device). **Processing time**: when the stream processor sees it. They differ because of network delays, retries, and phones that were offline for an hour and then upload everything.
:::

If you count clicks per minute by **processing time**, a network hiccup moves clicks into the wrong minute. Correct analytics use **event time**, which raises a question: when is the 12:00–12:01 window **complete**, given that events from 12:00:58 might still be in flight?

:::def Watermark
The processor's estimate that "all events with event time ≤ T have probably arrived". When the watermark passes the end of a window, the window's result is emitted. Typically: watermark = largest event time seen − allowed lateness (say 10 s).
:::

Events arriving **after** the watermark are **late**. Options: drop them, send them to a side output for correction, or keep windows open for an **allowed lateness** period and emit **updated** results. It's a trade-off between latency (emit early) and completeness (wait longer).

### State, checkpoints and exactly-once

Stream processors keep state (running counts, open windows) in local stores (RocksDB in Flink). To survive crashes, Flink takes periodic **checkpoints**: consistent snapshots of all operator state together with the Kafka offsets they correspond to. After a failure, the job restores the last checkpoint and replays Kafka from those offsets. Combined with transactional or idempotent sinks, this gives **exactly-once state updates**, even though events may be read twice.

## Lambda vs Kappa architecture

How do you get both **fast** results and **correct** results?

:::def Lambda architecture
Run **two pipelines**: a **batch layer** recomputes accurate results from all raw data periodically, and a **speed layer** (streaming) gives approximate real-time results for the recent data the batch hasn't covered yet. A serving layer merges both.
:::

:::def Kappa architecture
Run **only a streaming pipeline** over a replayable log (Kafka with long retention). To fix a bug or change logic, **replay** the log through a new version of the stream job.
:::

```viz algo=arch title="Lambda architecture"
src     Events | clicks, orders [users]
log     Kafka [stream]
batch   Batch layer | Spark, nightly, accurate [worker]
lake    Data lake | raw events [storage]
speed   Speed layer | Flink, real time [worker]
serve   Serving layer | merged views [db]
dash    Dashboards / APIs [chart]
--
src -> log
log -> lake
lake -> batch
log -> speed
batch -> serve
speed -> serve
serve -> dash
```

Lambda gives correctness and speed but means **maintaining the same logic twice**. Kappa is simpler (one codebase) and became practical as stream processors matured. Many real systems are a pragmatic mix: streaming for real-time views, plus periodic batch **reconciliation** for money (the ad-click and payment case studies use exactly that).

:::interview When to say "stream" and when "batch"
Ask how fresh the result must be. "Trending hashtags in the last 5 minutes", "fraud score before the payment completes", "live viewer count" → **stream** (Flink/Kafka Streams with event-time windows and watermarks). "Monthly invoices", "train tomorrow's recommendation model", "a report for finance" → **batch** (Spark/warehouse SQL). For money, mention **batch reconciliation** of streaming results.
:::

```quiz
? You must count ad clicks per minute for billing, and phones may send events late. Which time should windows use?
+ Event time, with watermarks and a policy for late events
- Processing time, because it's simpler
- Wall-clock time of the database
> Billing must reflect when clicks happened. Event time plus watermarks handles delays correctly.

? "Visits per user, where a visit ends after 30 minutes of inactivity" calls for which window?
- Tumbling
- Sliding
+ Session
> Session windows are per key and close after an inactivity gap, so their length varies.

? What is the main drawback of the Lambda architecture?
+ The same business logic must be implemented and kept consistent in two pipelines (batch and streaming)
- It can't produce real-time results
- It can't reprocess historical data
> Kappa avoids this by using a single streaming pipeline and replaying the log when logic changes.

? How does Flink recover a stateful job after a crash without double counting?
- It never crashes
+ It restores the last consistent checkpoint of operator state and replays Kafka from the offsets saved with it
- It recounts everything from the beginning of time
> Checkpointed state and source offsets are restored together, giving exactly-once state updates.
```

:::keypoints
- **Batch** processes bounded data with high efficiency and easy correctness (MapReduce → Spark → warehouse SQL). **Stream** processes unbounded events with low latency (Flink, Kafka Streams).
- MapReduce = **map → shuffle (group by key) → reduce**; Spark keeps data in memory. ETL vs **ELT** (load raw, transform in the warehouse).
- Windows: **tumbling** (fixed, non-overlapping), **sliding** (overlapping), **session** (inactivity gap).
- Use **event time** with **watermarks**; decide how to treat **late events**.
- Stateful streaming relies on **checkpoints** + replayable sources for exactly-once state.
- **Lambda** = batch + speed layers (two codebases); **Kappa** = streaming only with replay. Reconcile money with batch.
:::
