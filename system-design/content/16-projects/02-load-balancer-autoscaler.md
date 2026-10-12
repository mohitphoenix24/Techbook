---
title: Build a Load Balancer with Autoscaling
level: intermediate
time: 50
icon: gauge
cover: #2563eb,#06b6d4
tags: load balancing, tail latency, health checks, autoscaling, capacity planning
summary: Simulate the front door of a web service — compare round robin, least connections and power-of-two-choices on a fleet with a slow server, then add health checks that pull a crashed server out of rotation and a target-tracking autoscaler with boot delays, cooldowns and gradual scale-in, measuring dropped requests and cost.
---

Load balancers and autoscalers appear in every design ("put it behind an LB, autoscale on CPU"), but the interesting questions are in the details: *which* algorithm, *how fast* a dead server is detected, *how long* new servers take to help, and what that costs. In this project you'll measure all of it with small simulations.

:::flow What you'll build
Traffic + servers | requests with random work; one slow server
Algorithms | round robin, least connections, power of two choices
Health checks | every 5 s; 3 failures → out of rotation
Autoscaler | target tracking at 60% utilisation, boot delay, cooldowns
Report | dropped requests, tail latency, server-hours
:::

## Step 1: choosing a balancing algorithm

Four servers with 4 worker threads each; one of them runs at a third of the speed (a noisy neighbour, a bad disk). Requests arrive randomly and need random amounts of work. Which algorithm keeps the **tail latency** low?

```js run title="Round robin vs least connections vs power of two choices"
// Step 1: three load-balancing algorithms on the same traffic. Server s3 is slow (a noisy neighbour).
function run(pick, label) {
  let seed = 42;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const servers = [1, 1, 1, 0.35].map((speed, i) => ({ name: `s${i}`, speed, slots: [0, 0, 0, 0], done: [], served: 0 }));
  const latencies = [];
  let t = 0, rr = 0;
  for (let i = 0; i < 20000; i++) {
    t += -Math.log(rand()) * 1.2;                                  // a request every ~1.2 ms (fleet ~50% busy)
    for (const s of servers) { s.done = s.done.filter((x) => x > t); s.load = s.done.length; }   // outstanding requests
    const s = pick(servers, { next: () => rr++, rand });
    const work = -Math.log(rand()) * 8 / s.speed;                  // ~8 ms of work on a normal server
    const slot = s.slots.indexOf(Math.min(...s.slots));            // 4 worker threads; wait for the first free one
    const finish = Math.max(t, s.slots[slot]) + work;
    s.slots[slot] = finish; s.done.push(finish); s.served++;
    latencies.push(finish - t);
  }
  latencies.sort((a, b) => a - b);
  const q = (p) => latencies[Math.floor(p * latencies.length)].toFixed(0);
  console.log(`${label.padEnd(18)} p50 ${q(0.5).padStart(3)} ms  p99 ${q(0.99).padStart(5)} ms   share: ${servers.map((s) => `${s.name} ${(100 * s.served / 20000).toFixed(0)}%`).join(" ")}`);
}
run((ss, c) => ss[c.next() % ss.length], "round robin");
run((ss, c) => {                                                    // fewest outstanding requests; rotate ties
  const off = c.next();
  return ss.map((_, i) => ss[(i + off) % ss.length]).reduce((a, b) => (b.load < a.load ? b : a));
}, "least connections");
run((ss, c) => {                                                    // power of two choices: sample 2, take the less loaded
  const a = ss[Math.floor(c.rand() * ss.length)], b = ss[Math.floor(c.rand() * ss.length)];
  return a.load <= b.load ? a : b;
}, "power of two");
```

Round robin gives the slow server a quarter of the traffic regardless of how it's coping, so its queue grows without bound and p99 explodes. Algorithms that look at **outstanding requests** naturally send less to a struggling server. **Power of two choices** (sample two servers, pick the less loaded) gets most of the benefit while only looking at two servers, which matters when hundreds of load balancers each have a partial, stale view.

## Step 2: health checks and autoscaling

Now a full hour of traffic: a morning ramp, a flash spike, a quiet evening. One server crashes at minute 18. The autoscaler uses **target tracking**: keep utilisation near 60% (headroom for spikes), scale out quickly, scale in slowly, and remember that new servers take 90 seconds to boot.

```js run title="Health checks + target-tracking autoscaler vs fixed fleets"
// Step 2: a load balancer with health checks in front of an autoscaled fleet, over one simulated hour
const CAP = 100;                         // requests/s one server handles
const BOOT = 90;                         // seconds before a new server takes traffic
const TARGET = 0.6;                      // target-tracking: keep average utilisation near 60%
const traffic = (t) => {                 // requests/s: ramp up, a flash spike at minute 25, then a quiet evening
  const m = t / 60;
  const base = m < 5 ? 200 : m < 15 ? 200 + (m - 5) * 60 : m < 40 ? 800 : m < 50 ? 800 - (m - 40) * 65 : 150;
  return Math.round(base + (m >= 25 && m < 29 ? 700 : 0));
};

function simulate({ autoscale, fixed = 3, label }) {
  let id = 0;
  const fleet = [];
  const launch = (t) => fleet.push({ id: `i-${++id}`, readyAt: t + (t === 0 ? 0 : BOOT), healthy: true, failedChecks: 0, alive: true });
  for (let i = 0; i < fixed; i++) launch(0);
  let served = 0, dropped = 0, serverSeconds = 0, lastScale = -1e9, lowSince = null;
  const log = [], utilHistory = [];
  for (let t = 0; t < 60 * 60; t++) {
    if (t === 18 * 60 && fleet.length) fleet[0].alive = false;                // a server crashes at minute 18
    if (t % 5 === 0) for (const s of fleet) {                                  // LB health check every 5 s
      if (s.alive) s.failedChecks = 0; else s.failedChecks++;
      if (s.failedChecks >= 3 && s.healthy) { s.healthy = false; log.push(`${(t / 60).toFixed(1)} min: ${s.id} failed 3 health checks → out of rotation`); }
    }
    const inRotation = fleet.filter((s) => s.healthy && t >= s.readyAt);
    const live = inRotation.filter((s) => s.alive);                            // a dead server still in rotation drops its share
    const demand = traffic(t), perServer = inRotation.length ? demand / inRotation.length : Infinity;
    const ok = live.length * Math.min(perServer, CAP);
    served += ok; dropped += demand - ok;
    serverSeconds += fleet.filter((s) => s.healthy).length;
    const util = inRotation.length ? Math.min(1, perServer / CAP) : 1;
    utilHistory.push(util);
    for (let i = fleet.length - 1; i >= 0; i--) if (!fleet[i].healthy) fleet.splice(i, 1);   // terminate unhealthy
    if (!autoscale) { while (fleet.length < fixed) launch(t); continue; }      // a fixed group still replaces dead servers
    // target tracking on the last 60 s, counting servers that are still booting as capacity on the way
    const avg = utilHistory.slice(-60).reduce((a, b) => a + b, 0) / Math.min(60, utilHistory.length);
    const desired = Math.max(2, Math.min(30, Math.ceil(demand / (CAP * TARGET))));
    if (desired > fleet.length && t - lastScale >= 30) {                       // scale out fast (30 s cooldown)
      const add = desired - fleet.length;
      for (let i = 0; i < add; i++) launch(t);
      lastScale = t; log.push(`${(t / 60).toFixed(1)} min: ${demand} req/s, util ${(avg * 100).toFixed(0)}% → launch ${add} (fleet ${fleet.length})`);
    } else if (desired < fleet.length) {                                       // scale in slowly: 5 min of low demand
      lowSince ??= t;
      if (t - lowSince >= 300 && t - lastScale >= 120) {                       // remove at most 25% per step
        const remove = Math.min(fleet.length - desired, Math.max(1, Math.floor(fleet.length / 4)));
        fleet.splice(fleet.length - remove, remove); lastScale = t;
        log.push(`${(t / 60).toFixed(1)} min: over-provisioned for 5+ min (${demand} req/s) → terminate ${remove} (fleet ${fleet.length})`);
      }
    } else lowSince = null;
  }
  console.log(`${label}: dropped ${(100 * dropped / (served + dropped)).toFixed(2)}% of requests, cost ${(serverSeconds / 3600).toFixed(1)} server-hours`);
  return log;
}
simulate({ autoscale: false, fixed: 4, label: "fixed fleet of 4    " });
simulate({ autoscale: false, fixed: 16, label: "fixed fleet of 16   " });
const log = simulate({ autoscale: true, fixed: 4, label: "autoscaled (2–30)   " });
console.log("autoscaler log:\n  " + log.join("\n  "));
```

A small fixed fleet drops almost half the requests at peak; a fleet sized for the peak wastes money all evening; the autoscaler drops a little during the spike (servers are still booting) and costs about a quarter less. Over a real day with a night trough, the savings are much larger.

## How it works

| Mechanism | What the simulation does | Real-world equivalent |
|---|---|---|
| Least connections / P2C | route by outstanding requests | NGINX `least_conn`, Envoy `LEAST_REQUEST` (P2C by default) |
| Health checks | probe every 5 s; 3 failures → remove | ALB/NLB target health, Envoy active + passive (outlier) checks |
| Dead server before detection | its share of requests is lost | retries on another server hide it; outlier detection reacts faster |
| Target tracking | desired = demand / (capacity × 60%) | AWS target tracking, Kubernetes HPA |
| Boot delay | 90 s before a new server serves | instance start + app warm-up; keep warm pools or over-provision |
| Asymmetric cooldowns | out after 30 s, in after 5 min low, ≤ 25% per step | scale-in protection, stabilisation windows, avoiding flapping |

:::exercise Extend it
1. Add **retries**: when a request hits a dead server, retry once on another one. How many drops disappear during the 15 seconds before the health check catches the crash?
2. Add **slow start**: a new server receives a gradually increasing share of traffic for its first 30 seconds.
3. Use **predictive scaling**: scale out 5 minutes before the known daily ramp, and compare drops and cost.
4. Make servers **heterogeneous** (2× and 1× capacity) and implement weighted least connections.
5. Model **queueing latency** in Step 2 (e.g. latency ≈ service time / (1 − utilisation)) and plot p99 against the target utilisation: why is 60% safer than 90%?
:::

:::keypoints
- Round robin ignores server health and load; **least connections** and **power of two choices** protect tail latency when servers differ.
- **Health checks** take seconds to detect a failure; retries and outlier detection cover the gap.
- **Target tracking** keeps utilisation below 100% to leave headroom; new capacity arrives only after the **boot delay**, so spikes need headroom or warm pools.
- Scale **out fast, in slowly**, in bounded steps, to avoid flapping.
- Autoscaling trades a little risk during sudden spikes for large savings in quiet periods.
:::
