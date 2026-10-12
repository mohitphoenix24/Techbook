---
title: Observability — Logs, Metrics, Traces and Alerts
level: intermediate
time: 40
summary: How you know a distributed system is healthy and find out why it isn't — the three pillars (structured logs, metrics, distributed traces), the golden signals and RED/USE methods, histograms and percentiles, cardinality, sampling, SLO-based alerting with burn rates, and dashboards that help in an incident.
---

A system you can't see into is a system you can't operate. With dozens of services, "it's slow for some users" could be caused by any of them. **Observability** is the ability to answer new questions about your system's behaviour from the data it emits, without shipping new code. Interviewers expect a sentence or two on monitoring in every design, and a real answer when they ask "how would you know?".

## The three pillars

| Pillar | What it is | Answers | Tools |
|---|---|---|---|
| **Logs** | timestamped records of individual events | "what exactly happened to request X?" | Elasticsearch/OpenSearch, Loki, Splunk, CloudWatch Logs |
| **Metrics** | numbers aggregated over time (counters, gauges, histograms) | "how many, how fast, how full — and is it getting worse?" | Prometheus, Datadog, CloudWatch, Grafana |
| **Traces** | the path of one request across services, with timings | "where did these 900 ms go?" | OpenTelemetry + Jaeger, Tempo, Zipkin, Datadog APM |

They work together: an **alert** fires on a metric, a **trace** shows which service is slow, and that service's **logs** (found by trace id) explain why.

## Logs

Write **structured logs** (JSON with consistent fields), not free text, so they can be searched and aggregated:

```json
{"ts":"2026-03-14T10:22:31.512Z","level":"error","service":"checkout","trace_id":"4bf92f35","user_id":"u_42",
 "route":"POST /checkout","status":502,"duration_ms":1834,"upstream":"payments","msg":"payment provider timeout"}
```

Good practice:

- Include **correlation ids** (`trace_id`, `request_id`) in every log line, propagated across services.
- Use **levels** sensibly (debug/info/warn/error) and keep high-volume debug logs off in production, or **sample** them.
- **Never log secrets** or sensitive personal data (passwords, tokens, card numbers); mask emails and ids where regulations require.
- Ship logs asynchronously to a central store; set **retention** (logs are big and costly: hot for days, archived for months).

## Metrics

Metrics are cheap to store and query because they're aggregates. Three types:

- **Counter**: only goes up (requests served, errors). You look at its **rate**.
- **Gauge**: a value that goes up and down (queue depth, memory in use, connections).
- **Histogram**: counts of values falling into buckets (request latency 0–10 ms, 10–50 ms, …), from which **percentiles** are computed.

:::warn You can't average percentiles
p99 latencies from 10 servers can't be averaged into a cluster p99. Aggregate the **histograms** (bucket counts) first, then compute the percentile. That's why latency is exported as a histogram, not as a precomputed p99.
:::

### What to measure: golden signals, RED and USE

Google's SRE book recommends **four golden signals** for every service:

1. **Latency**: how long requests take (separately for successes and errors, as percentiles).
2. **Traffic**: demand (requests/s, messages/s).
3. **Errors**: the rate of failed requests (explicit 5xx, wrong answers, too-slow responses).
4. **Saturation**: how full the service is (CPU, memory, queue depth, thread pools, connection pools).

Two shorthand methods:

- **RED** for request-driven services: **R**ate, **E**rrors, **D**uration.
- **USE** for resources (CPU, disk, network, pools): **U**tilisation, **S**aturation, **E**rrors.

Add **business metrics**: orders per minute, sign-ups, payment success rate. They often reveal problems that technical metrics miss (everything returns 200, but nobody can actually check out).

```js run title="From raw latencies to a histogram, percentiles and an error rate"
let seed = 3;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// 10,000 requests in one minute: mostly fast, some slow, a few errors
const reqs = Array.from({ length: 10_000 }, () => {
  const r = rand();
  return { ms: r < 0.9 ? 20 + rand() * 60 : r < 0.99 ? 100 + rand() * 300 : 800 + rand() * 1500, ok: rand() > 0.004 };
});

// Prometheus-style cumulative buckets (le = "less or equal")
const bounds = [25, 50, 100, 250, 500, 1000, 2500, Infinity];
const buckets = bounds.map((le) => [le, reqs.filter((r) => r.ms <= le).length]);
console.log("histogram:", buckets.map(([le, n]) => `≤${le === Infinity ? "+Inf" : le}ms:${n}`).join("  "));

// Estimate a percentile from buckets (linear interpolation inside the bucket, like histogram_quantile)
function quantile(q) {
  const rank = q * reqs.length;
  for (let i = 0; i < buckets.length; i++) {
    const [le, n] = buckets[i], [prevLe, prevN] = i ? buckets[i - 1] : [0, 0];
    if (n >= rank) return le === Infinity ? prevLe : prevLe + ((rank - prevN) / (n - prevN)) * (le - prevLe);
  }
}
const exact = (q) => [...reqs].map((r) => r.ms).sort((a, b) => a - b)[Math.ceil(q * reqs.length) - 1];
for (const q of [0.5, 0.95, 0.99]) console.log(`p${q * 100}: from buckets ≈ ${quantile(q).toFixed(0)} ms, exact ${exact(q).toFixed(0)} ms`);
console.log(`traffic: ${(reqs.length / 60).toFixed(0)} req/s   error rate: ${(reqs.filter((r) => !r.ok).length / reqs.length * 100).toFixed(2)}%`);
```

Bucket-based percentiles are approximate (accuracy depends on bucket boundaries), but they're cheap and aggregatable across servers, which is exactly what large systems need.

### Cardinality: the hidden cost

Each unique combination of a metric's labels is a separate **time series**. `http_requests_total{route, status, region}` with 50 routes × 10 statuses × 5 regions = 2,500 series: fine. Add a `user_id` label with 10 million users, and you have 25 billion series, and a dead metrics system. **Never put unbounded values (user ids, request ids, URLs with ids) in metric labels.** Those belong in logs and traces.

## Distributed tracing

:::def Distributed trace
The record of one request's journey through the system: a tree of **spans**, one per unit of work (a service handling the request, a database query, a cache call), each with a start time, duration, parent span, and attributes. The **trace id** is propagated in request headers (W3C `traceparent`) so every service adds its spans to the same trace.
:::

```viz algo=seq title="One traced request: where did 920 ms go?"
participant gw API gateway [gateway]
participant o Order service [service]
participant p Pricing [service]
participant db Orders DB [db]
participant pay Payments [pay]
gw -> o : POST /checkout  (trace 4bf92f35, span A: 920 ms)
o -> p : getPrice  (span B: 40 ms)
p --> o : ok
o -> db : INSERT order  (span C: 15 ms)
o -> pay : charge  (span D: 820 ms) | The trace shows at a glance that payments took 820 of the 920 ms.
pay --> o : ok
o --> gw : 201
```

**OpenTelemetry** is the standard: one set of APIs and SDKs to emit traces, metrics and logs, exported to any backend. Tracing every request is expensive at scale, so systems **sample**: keep, say, 1% of normal traces but **100% of errors and slow requests** ("tail-based sampling" decides after seeing the whole trace).

## Alerting

Alerts wake people up, so they must be **actionable**, **urgent** and **rare**. The classic mistakes: alerting on causes ("CPU > 80%") instead of symptoms, and hundreds of noisy alerts that train everyone to ignore them.

- **Alert on symptoms users feel**: error rate, latency, availability against the **SLO** (from the requirements lesson). Cause-level signals (CPU, disk, queue depth) go to dashboards and lower-urgency tickets, unless they predict an outage (a disk 95% full).
- **Burn-rate alerts**: an SLO of 99.9% allows 0.1% errors per 30 days (the error budget). Page someone when the budget is being consumed **fast** (e.g. at 14× the sustainable rate over the last hour: the whole monthly budget would be gone in about 2 days), and open a ticket for slow burns. This catches real problems quickly without paging for brief blips.
- Every page links to a **runbook**: what this alert means, how to check, how to mitigate.

```js run title="Error budget burn rate"
const slo = 0.999;                        // 99.9% of requests succeed, over 30 days
const budget = 1 - slo;                   // 0.1% may fail
for (const [window, errorRate] of [["last 5 min", 0.0005], ["last 1 hour", 0.0142], ["last 6 hours", 0.0061]]) {
  const burn = errorRate / budget;        // 1.0 = consuming the budget exactly on schedule
  const daysToExhaust = 30 / burn;
  const action = burn >= 14 ? "PAGE now" : burn >= 6 ? "page (slower burn)" : burn > 1 ? "ticket" : "ok";
  console.log(`${window.padEnd(12)} error rate ${(errorRate * 100).toFixed(2)}%  burn ${burn.toFixed(1).padStart(4)}×  budget gone in ${daysToExhaust.toFixed(1).padStart(5)} days → ${action}`);
}
```

## Dashboards and health

- One **service dashboard** per service: RED metrics, saturation, dependencies' error rates and latencies, recent deploys marked on the graphs.
- A **top-level dashboard** of user-facing SLOs and business metrics.
- **Health endpoints** (`/healthz`, `/readyz`) for load balancers and orchestrators.
- **Synthetic monitoring**: robots that log in and place a test order every minute from several regions, catching outages before users report them.

:::interview Monitoring in one breath
*"Each service exports RED metrics (Prometheus histograms for latency), structured JSON logs with trace ids, and OpenTelemetry traces sampled at 1% plus all errors. We alert on SLO burn rate for checkout error rate and p99 latency, and also on queue age for the async pipeline. Dashboards per service, with deploy markers."*
:::

```quiz
? Which pillar best answers "which service made this particular request slow?"
- Metrics
+ Distributed traces
- Logs alone
> A trace shows every span of one request with its duration, so the slow hop stands out.

? Why must latency be exported as a histogram rather than as each server's p99?
+ Percentiles can't be averaged across servers; histograms can be summed and then turned into percentiles
- Histograms use less memory than a single number
- Prometheus only supports histograms
> Aggregating raw bucket counts and computing the quantile afterwards gives a correct fleet-wide p99.

? Why is adding a `user_id` label to a request-count metric a bad idea?
- It leaks passwords
+ It creates one time series per user (unbounded cardinality), which can overwhelm the metrics system
- Labels can't be strings
> Unbounded values belong in logs and traces, not metric labels.

? What should usually trigger a page in the middle of the night?
- CPU above 80% on one server
+ A fast burn of the SLO error budget (users are experiencing errors or slowness right now)
- Any warning-level log line
> Page on user-facing symptoms; route causes to dashboards and tickets.
```

:::keypoints
- **Logs** (structured, with trace ids, no secrets), **metrics** (counters, gauges, histograms), and **traces** (spans across services) answer different questions; use them together.
- Measure the **golden signals** (latency, traffic, errors, saturation), RED for services, USE for resources, plus **business metrics**.
- Export latency as **histograms**; never average percentiles. Watch metric **cardinality**.
- Use **OpenTelemetry** with sampling (keep all errors and slow traces).
- **Alert on symptoms** against SLOs with **burn-rate** alerts, each with a runbook; dashboards and synthetic checks for the rest.
:::
