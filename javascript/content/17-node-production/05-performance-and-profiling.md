---
title: Node.js performance: measuring, profiling and fixing
level: advanced
time: 35
summary: A method for performance work (measure, find the bottleneck, fix, re-measure), load testing, CPU and heap profiling, flame graphs, event-loop lag, and the usual wins: caching, connection reuse, avoiding sync work, pooling, compression, and batching.
---

## The method

1. **Define the goal**: "p95 latency under 200 ms at 500 requests per second", not "faster".
2. **Measure** with a realistic load test (the baseline).
3. **Find the bottleneck** with a profiler or tracing (CPU? event loop? DB? network? memory?).
4. **Change one thing**.
5. **Re-measure.** Keep it only if it helps.

> "Premature optimisation is the root of all evil." Profile first. A 20-minute profile saves days of guessing.

## What is slow? Four usual suspects

| Bottleneck | Symptoms | Typical fixes |
|---|---|---|
| **Database / external calls** | High latency, low CPU | indexes, fewer queries (N+1), batching, caching, connection pooling, timeouts |
| **CPU on the main thread** | CPU 100% of one core, **event loop lag** | optimise the algorithm, worker threads, move work off the request path |
| **Blocking calls** | Everything freezes periodically | no `*Sync` calls, no huge JSON, no catastrophic regex |
| **Memory / GC** | Growing RSS, GC pauses, OOM | fix leaks, stream data, smaller objects |

## Load testing

Use a tool that generates concurrent load and shows percentiles: **autocannon** (Node), **k6**, **wrk**, **Artillery**.

```bash
npx autocannon -c 100 -d 30 http://localhost:3000/api/items
# -c: 100 concurrent connections   -d: for 30 seconds
# watch: requests/sec, latency p50 / p95 / p99, errors, throughput
```

Measure **percentiles** (p95, p99), not only averages: averages hide the slow tail that real users feel.

```js run node title="A tiny load test: percentiles of response time" nondet
const http = require("node:http");

const server = http.createServer(async (req, res) => {
  await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));          // pretend DB time: 5 to 25 ms
  res.end("ok");
});

server.listen(0, async () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  const timings = [];
  const worker = async () => { for (let i = 0; i < 20; i++) { const t0 = performance.now(); await (await fetch(url)).text(); timings.push(performance.now() - t0); } };

  const t0 = performance.now();
  await Promise.all(Array.from({ length: 10 }, worker));                    // 10 concurrent clients, 200 requests in total
  const seconds = (performance.now() - t0) / 1000;

  timings.sort((a, b) => a - b);
  const pct = (p) => timings[Math.min(timings.length - 1, Math.floor((p / 100) * timings.length))];
  console.log("requests:", timings.length, "| throughput > 100 req/s:", timings.length / seconds > 100);
  console.log("p50 < p95 <= p99:", pct(50) < pct(95) && pct(95) <= pct(99));
  server.close();
});
```

## CPU profiling

### With the built-in profiler

```bash
node --cpu-prof app.js                      # writes CPU.<date>.cpuprofile when the process exits
node --cpu-prof --cpu-prof-dir=./profiles --cpu-prof-interval 100 app.js
```

Open the `.cpuprofile` file in **Chrome DevTools → Performance (or the "JavaScript Profiler")** or **VS Code**. You see which functions spent the most time.

### Attach DevTools to a running process

```bash
node --inspect app.js          # then open chrome://inspect → "inspect" → Profiler / Memory tabs
node --inspect-brk app.js      # also pause on the first line
```

### Flame graphs

A **flame graph** shows the call stack over time: **width = time spent**, so wide boxes at the top are the hot functions. Tools: **clinic flame** (`npx clinic flame -- node app.js`), **0x**, Chrome DevTools, `node --prof` + `--prof-process`.

```js run node title="Profile a hot function with the inspector from code" nondet
const inspector = require("node:inspector");
const session = new inspector.Session();
session.connect();

function fibonacci(n) { return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2); }          // the "problem" function
function innocent() { return Array.from({ length: 1000 }, (_, i) => i * 2).length; }

session.post("Profiler.enable", () => {
  session.post("Profiler.start", () => {
    for (let i = 0; i < 5; i++) { fibonacci(28); innocent(); }
    session.post("Profiler.stop", (err, { profile }) => {
      const self = new Map();
      const dt = profile.timeDeltas;
      profile.samples.forEach((id, i) => { const n = profile.nodes.find((x) => x.id === id); const key = n.callFrame.functionName || "(anon)"; self.set(key, (self.get(key) || 0) + dt[i]); });
      const top = [...self].sort((a, b) => b[1] - a[1])[0][0];
      console.log("the hottest function by self time:", top);
      session.disconnect();
    });
  });
});
```

## Event loop lag

If the loop is busy, **everything** gets slower. Track it:

```js
const { monitorEventLoopDelay } = require("node:perf_hooks");
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => { metrics.gauge("loop_delay_p99_ms", h.percentile(99) / 1e6); h.reset(); }, 5000);
```

## The usual wins

### 1. Do less work per request: caching

```js run node title="A TTL cache that also shares in-flight requests"
function cached(fn, ttlMs) {
  const store = new Map();
  return (key) => {
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;            // fresh: return the same promise (shares in-flight work)
    const promise = fn(key).catch((e) => { store.delete(key); throw e; });
    store.set(key, { promise, expires: Date.now() + ttlMs });
    return promise;
  };
}

let dbCalls = 0;
const getProduct = cached(async (id) => { dbCalls++; await new Promise((r) => setTimeout(r, 20)); return { id, name: "Product " + id }; }, 1000);

(async () => {
  await Promise.all(Array.from({ length: 50 }, () => getProduct(7)));     // 50 concurrent requests for the same product
  await getProduct(7);
  console.log("database calls for 51 requests:", dbCalls);
})();
```

Cache layers: in-process (`Map`, LRU), **Redis**, **HTTP caching headers** (`Cache-Control`, ETag), **CDN**. Always decide **invalidation** (TTL, events).

### 2. Avoid N+1 queries and batch

```js run node title="N+1 queries vs one batched query" 
let queries = 0;
const db = {
  user: async (id) => { queries++; return { id, name: "User " + id }; },
  users: async (ids) => { queries++; return ids.map((id) => ({ id, name: "User " + id })); },
};

(async () => {
  const orders = Array.from({ length: 20 }, (_, i) => ({ id: i, userId: (i % 5) + 1 }));

  queries = 0;
  await Promise.all(orders.map((o) => db.user(o.userId)));                  // N+1: one query per order
  console.log("N+1:", queries, "queries");

  queries = 0;
  const unique = [...new Set(orders.map((o) => o.userId))];
  await db.users(unique);                                                   // one query for all unique ids (DataLoader does this automatically)
  console.log("batched:", queries, "query");
})();
```

### 3. Reuse connections

- **HTTP keep-alive** for outgoing requests (`new http.Agent({ keepAlive: true })`; Node 19+ enables it by default for `fetch`/global agent).
- **Database connection pools** (`pg.Pool`, `mysql2` pool): sized to your DB limit.
- **Redis/other clients**: create once at start-up, not per request.

### 4. Reduce payload and CPU per response

- **Compression** (gzip/brotli) at the reverse proxy, or `compression()`.
- Send **only needed fields**; **paginate**.
- Cache **serialised JSON**; use `fast-json-stringify` with a schema in hot paths.
- Avoid `JSON.parse(JSON.stringify(x))` clones; avoid big `Object.assign`/spread in loops.
- Prefer **streams** for large responses.

### 5. Do not block the loop

- No `*Sync` after start-up; move CPU work to **worker threads** or a **queue**.
- Chunk long loops with `setImmediate`.
- Validate regexes for catastrophic backtracking (`safe-regex`, `re2`).

### 6. Pick a faster framework or parser when it matters

**Fastify** is typically 2 to 3 times faster than Express in benchmarks, thanks to schema-based serialisation and a lean core. But the database and external calls dominate most real services, so profile before switching.

## Memory and GC tuning

```bash
node --max-old-space-size=2048 app.js       # a cap: set it to about 75% of the container memory limit
node --heapsnapshot-near-heap-limit=2 app.js
```

In containers, Node respects cgroup memory limits in recent versions. Watch **RSS**, **heap used**, **GC pause time** (`--trace-gc`, `PerformanceObserver("gc")`), and the **number of open handles**.

## Production observability

You cannot fix what you cannot see:

- **Metrics:** request rate, error rate, latency percentiles, event loop lag, heap, GC, DB pool usage (Prometheus + Grafana, Datadog).
- **Tracing:** distributed traces (**OpenTelemetry**) show where time goes across services.
- **Logs:** structured, with request ids.
- **Profiling in production:** continuous profilers (Pyroscope, Datadog, Clinic) with low overhead.
- **Alerts:** on symptoms (latency, errors, saturation), the "golden signals".

:::interview A Node.js API is slow under load. How do you investigate and what would you try?
"First I reproduce it with a load test (autocannon or k6) and look at latency percentiles, CPU, memory and event-loop lag, to decide whether the time is in CPU, in waiting on the database or external calls, in blocking the loop, or in memory and GC. For CPU I take a profile with `--cpu-prof` or `--inspect` or clinic flame and read the flame graph for wide frames; for I/O I use tracing and database query logs. Typical fixes: remove N+1 queries and add indexes, cache hot data and share in-flight requests, reuse connections with pools and keep-alive, remove sync calls and move CPU-heavy work to worker threads or a queue, stream large payloads, compress responses, and scale horizontally. I change one thing at a time and re-measure."
:::

## More interview questions on this topic

:::qa Why look at p95 and p99 latency instead of the average? {level=easy}
**Say this:** "The average hides slow outliers. A few very slow requests hurt real users, and percentiles show the tail. Also averages are distorted by a few extremes."

**In simple words:** Most people matter, and so do the unlucky slow ones.
:::

:::qa What is a flame graph? {level=medium}
**Say this:** "A visualisation of sampled call stacks where the x-axis width is the share of time spent in a function including its callees. Wide boxes near the top are hot spots to optimise."

**In simple words:** Wide = slow.
:::

:::qa What is the N+1 query problem? {level=easy}
**Say this:** "Running one query to get N items and then one more query per item. Fix with a join, an `IN` query or batching (DataLoader), turning N+1 queries into 1 or 2."

**In simple words:** Asking the database 101 small questions instead of one clear one.
:::

:::qa How would you measure event loop blocking in production? {level=medium}
**Say this:** "`perf_hooks.monitorEventLoopDelay` exported as a metric (p99 lag), plus alerting. When it is high, a CPU profile shows which synchronous code runs too long."

**In simple words:** If a timer runs late, something is hogging the thread.
:::

```quiz
? What should you do before optimising?
- Rewrite hot functions in C++
+ Measure and profile to find the bottleneck
- Add more servers
> Data first.
? Which tool generates load for an HTTP API from Node?
- clinic
+ autocannon
- nodemon
> Also k6, wrk, Artillery.
? What does a wide box in a flame graph mean?
- A function that is called rarely
+ A function (with callees) that takes a large share of time
- A memory leak
> Width is time.
```

:::keypoints
- **Measure → find the bottleneck → change one thing → re-measure.** Use **percentiles** and **load tests** (autocannon, k6).
- **Profile**: `--cpu-prof`, `--inspect` + DevTools, **clinic flame**, flame graphs (width = time).
- Track **event loop lag**, memory/GC, DB pool usage.
- Wins: **cache** (+ share in-flight), **batch / no N+1**, **reuse connections**, **no sync calls**, **worker threads/queues**, **streams + compression**, scale horizontally.
- Add metrics, tracing (OpenTelemetry), structured logs and alerts.
:::
