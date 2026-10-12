---
title: Design a Metrics and Monitoring System
level: advanced
time: 50
summary: A Datadog/Prometheus-style platform — collecting metrics by push or pull, the time-series data model and the cardinality problem, an ingestion pipeline through Kafka, a time-series database with compression and downsampled rollups, correct percentile aggregation with histograms, querying dashboards, and an alerting engine that doesn't page people for nothing.
---

:::problem Design a Metrics and Monitoring System {level=hard tags="HLD,time series,streaming,alerting"}
Design a monitoring platform like Datadog or Prometheus + Grafana: services and hosts emit metrics (CPU, request rate, latency percentiles, error counts); engineers view dashboards and define alerts ("p99 latency > 500 ms for 5 minutes → page the on-call"). **10 M active time series**, **10 M data points per second**, 1-year retention.

:::hint Hint
The workload is **write-heavy, append-only and time-ordered**; queries read recent data and aggregate across many series. That points to a time-series storage format (compressed blocks per series), **rollups** for old data, and an ingestion buffer. Watch out for **cardinality** (labels like user_id explode the number of series) and for averaging percentiles.
:::
:::

## 1. Requirements

**Functional**: ingest metrics (counters, gauges, histograms) with labels; query and graph them over time ranges with aggregation (sum/avg/percentiles by label); alert rules with notifications; dashboards.

**Non-functional**
- **High write throughput**, low ingestion lag (seconds); queries over the last hours in < 1 s.
- **Reliable alerting**: the monitoring system must be more available than what it monitors (and must monitor itself).
- Retention: raw data for days, downsampled for a year; cost-efficient storage.

## 2. Estimates

:::derive Ingest and storage
10^7\ \text{points/s} \times 16\,\text{B raw} = 160\,\text{MB/s} || 8 B timestamp + 8 B value
\text{compressed (Gorilla-style)} \approx 1.4\,\text{B/point} \Rightarrow 14\,\text{MB/s} \approx 1.2\,\text{TB/day} || ~12× compression
\text{raw for 15 days} \approx 18\,\text{TB}; \text{ 1-min rollups for 1 year} \approx \text{a few TB} ||
!\text{storage is manageable; the hard parts are ingest fan-in, cardinality and query fan-out} ||
:::

## 3. Data model

A **time series** is identified by a metric name plus **labels**: `http_request_duration_seconds{service="checkout", region="eu", status="500"}`, and holds `(timestamp, value)` points. Every distinct label combination is a separate series, so **cardinality** = product of label values. Labels like `user_id` or `request_id` create millions of series and can take the system down: enforce limits per metric and reject unbounded labels (those belong in logs or traces).

## 4. High-level design

```viz algo=arch title="Metrics platform" dir=down
apps     Services + hosts | agents, SDKs [server*3] @0,1
coll     Collectors | push gateway or scrapers [worker*2] @1,1
kafka    Ingest buffer | partitioned by series [stream] @2,1
tsdb     Time-series DB | recent blocks in memory + disk [db*3] @3,0.4
roll     Rollup jobs | 1 min, 1 h [worker] @3,1.6
cold     Object storage | old blocks [storage] @4,1.6
query    Query service | fan-out + merge [service*2] @4,0.4
dash     Dashboards [chart] @5,0
alert    Alert evaluator [bell] @5,0.9
page     On-call | PagerDuty, Slack [mail] @6,0.9
--
apps -> coll : push / scrape every 10 s
coll -> kafka
kafka -> tsdb
kafka ~> roll
roll -> cold
tsdb ~> cold : compacted blocks
query -> tsdb
query -> cold
dash -> query
alert -> query : every 30 s
alert -> page : firing
--
flow A data point's journey
apps > coll : A service exposes counters/histograms; an agent sends them every 10 s (or a scraper pulls /metrics).
coll > kafka : Collectors validate, enforce cardinality limits, and batch points into Kafka, partitioned by series id.
kafka > tsdb : TSDB nodes consume their partitions: append to in-memory head blocks (with a write-ahead log), compress, and flush 2-hour blocks to disk.
tsdb > cold : Older blocks are compacted and moved to object storage; rollup jobs produce 1-min and 1-h aggregates.
flow An alert fires
alert > query : Every 30 s the evaluator runs: p99(latency{service="checkout"}) over 5 min > 500 ms?
query > tsdb : The query fans out to the shards holding those series and merges histograms.
alert > page : The condition has held for 5 minutes → notify the on-call (deduplicated, grouped, routed by team).
```

## 5. Deep dives

### A. Push vs pull

- **Pull** (Prometheus scrapes `/metrics`): the server controls the rate, a dead target is visible immediately (scrape fails), easy to debug; needs service discovery and reachable targets.
- **Push** (agents send to collectors; StatsD, Datadog, OpenTelemetry): works behind NAT and for short-lived jobs, central rate control is harder.
Large systems use both: local agents scrape or receive, then push to a central pipeline.

### B. Storage: compressed time-series blocks

Points for a series arrive in time order: store them in **per-series chunks**, compressed with **delta-of-delta** timestamps (regular intervals → mostly 1 bit each) and **XOR-encoded** floats (consecutive values share most bits): Facebook's Gorilla gets ~1.4 bytes per point. Recent data lives in memory with a WAL; immutable blocks are flushed, compacted, and indexed by an **inverted index** from label → series ids (to answer `{service="checkout"}` quickly). Shard by series id (hash of name + labels); replicate for availability.

### C. Rollups and retention

Raw 10-second data for 15 days; **1-minute** rollups for 3 months; **1-hour** rollups for a year. A rollup keeps **min, max, sum, count** (so averages remain correct) and **histograms** (so percentiles remain computable), never just an average. Queries over long ranges automatically read the coarser data.

### D. Percentiles must be merged, not averaged

```js run title="Averaging p99s is wrong; merging histograms works. Plus delta-of-delta compression."
// 1) Fleet-wide p99 latency: averaging each host's p99 is wrong; merge histograms instead
let seed = 17;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const BOUNDS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];           // histogram bucket upper bounds (ms)
const hosts = Array.from({ length: 10 }, (_, h) => {
  const slow = h === 3;                                                      // one host has a bad disk
  const n = slow ? 2000 : 20000;                                             // and the LB sends it less traffic
  return Array.from({ length: n }, () => (slow ? 300 : 20) * -Math.log(rand() + 1e-12));
});
const exactP = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor(p * xs.length)];
const histOf = (xs) => BOUNDS.map((b, i) => xs.filter((x) => x <= b && (i === 0 || x > BOUNDS[i - 1])).length);
const histP = (hist, p) => {                       // find the bucket holding the quantile, interpolate inside it
  const total = hist.reduce((a, b) => a + b, 0), rank = p * total;
  let seen = 0;
  for (let i = 0; i < hist.length; i++) {
    if (seen + hist[i] >= rank) { const lo = i ? BOUNDS[i - 1] : 0; return lo + (BOUNDS[i] - lo) * (rank - seen) / hist[i]; }
    seen += hist[i];
  }
  return Infinity;
};
const avgOfP99 = hosts.reduce((s, xs) => s + exactP(xs, 0.99), 0) / hosts.length;
const merged = hosts.map(histOf).reduce((acc, h) => acc.map((v, i) => v + h[i]));
console.log(`true fleet p99: ${exactP(hosts.flat(), 0.99).toFixed(0)} ms`);
console.log(`average of per-host p99s: ${avgOfP99.toFixed(0)} ms   ← meaningless number`);
console.log(`p99 from merged histograms: ≈ ${histP(merged, 0.99).toFixed(0)} ms (interpolated inside the 100–250 ms bucket)`);

// 2) Compressing timestamps: samples every 10 s → deltas are 10, delta-of-deltas are ~0
const ts = [1760000000];
for (let i = 1; i < 360; i++) ts.push(ts[i - 1] + 10 + (rand() < 0.05 ? 1 : 0));   // an hour, with rare jitter
let bits = 64 + 14;                                                          // first timestamp + first delta
for (let i = 2; i < ts.length; i++) {
  const dod = (ts[i] - ts[i - 1]) - (ts[i - 1] - ts[i - 2]);
  bits += dod === 0 ? 1 : Math.abs(dod) < 64 ? 9 : 12;                       // Gorilla-style variable-length codes
}
console.log(`360 timestamps: ${360 * 64} bits raw → ${bits} bits with delta-of-delta (${(360 * 64 / bits).toFixed(0)}× smaller)`);
```

Percentiles from different hosts or time windows **cannot be averaged**. Record latency as a **histogram** (fixed buckets, or a mergeable sketch like DDSketch/t-digest) and merge the buckets, then compute the percentile. Finer or exponential buckets give better accuracy; sketches give guaranteed relative error.

### E. Alerting that people trust

- Evaluate rules on a schedule against the query service, with a **for-duration** ("for 5 minutes") to ignore blips.
- **Deduplicate, group** (one page for 50 hosts failing the same way) and **route** by team/severity; silences during maintenance.
- Prefer **symptom-based alerts** (SLO burn rates: error budget consumed too fast) over cause-based ones (CPU high).
- **Meta-monitoring**: run the alerting path redundantly and alert if the monitoring system itself stops receiving data (a "dead man's switch").

## 6. Wrap-up

Agents push or scrapers pull → collectors with **cardinality limits** → **Kafka** buffer → **TSDB** shards (in-memory head + WAL, compressed blocks, label inverted index) → compaction to object storage and **rollups** (min/max/sum/count/histograms) → query service fanning out and merging → dashboards and an **alert evaluator** with for-durations, grouping, routing and meta-monitoring. Monitor ingest lag, dropped points, series cardinality per metric, query latency, and alert evaluation delays.

```quiz
? Why must per-host p99 latencies not be averaged to get a fleet p99?
+ Percentiles aren't additive: the result depends on how traffic is spread, and can be far from the true fleet percentile; merge histograms instead
- Averages are too slow to compute
- p99 can't be computed per host
> Store histograms or mergeable sketches, merge, then compute.

? A team adds a user_id label to a request metric. What's the risk?
+ A cardinality explosion: one series per user, millions of series that overwhelm memory and indexes
- Queries get more accurate
- Nothing; labels are free
> Unbounded identifiers belong in logs or traces.

? Why do time-series databases compress so well?
+ Timestamps are regular (delta-of-delta ≈ 0) and consecutive values are similar (XOR encoding), so most points need only a few bits
- They discard data randomly
- They store only averages
> Gorilla-style encoding reaches ~1.4 bytes per point.
```

:::keypoints
- Metrics = series identified by name + labels; **cardinality** is the main scaling risk: limit labels.
- Ingest: push/pull → collectors → **Kafka** → TSDB shards by series id (in-memory head + WAL → compressed blocks).
- Compression: **delta-of-delta** timestamps, **XOR** values; inverted index on labels.
- **Rollups** keep min/max/sum/count/histograms; tiered retention to object storage.
- **Merge histograms** for percentiles, never average them; alerts with for-durations, grouping, routing, SLO burn rates and meta-monitoring.
:::
