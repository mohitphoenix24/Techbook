---
title: Resilience Patterns — Timeouts, Circuit Breakers, Bulkheads
level: advanced
time: 50
summary: How one slow dependency takes down a whole system (cascading failure), and the patterns that stop it — timeouts and deadline propagation, retries with budgets, circuit breakers (simulator plus C++/JS implementation), bulkheads, load shedding and graceful degradation, with fallbacks.
---

Large outages rarely start big. A recommendation service slows down; every page that calls it waits; request threads pile up; the web tier runs out of threads; now **nothing** works, including checkout, which never needed recommendations. This is a **cascading failure**, and the patterns in this lesson exist to contain it. They come up in almost every deep dive ("what if this service is slow?").

```viz algo=seq title="How one slow service takes everything down"
participant u Users [users]
participant w Web tier | 200 threads [service]
participant r Recommendations | now 30 s per call [ai]
participant c Checkout [pay]
u -> w : home page requests
w -> r : get recommendations | No timeout: each call holds a thread for 30 s.
note w : 200 threads all stuck waiting on recommendations
u -> w : POST /checkout
w -x c : no free thread to handle it | Checkout is healthy, but users can't reach it.
note u : the whole site is "down" because of a non-essential feature
```

The root problems: **waiting without limits**, **sharing a resource pool** between important and unimportant work, and **piling more load** onto something already failing. Each pattern below attacks one of them.

## 1. Timeouts

The first rule of remote calls: **never wait forever**. Every network call needs a timeout.

- Choose it from the dependency's latency distribution: e.g. a bit above its **p99** (if p99 is 80 ms, a 200 ms timeout), not an arbitrary 30 s.
- Timeouts must fit inside the caller's own budget. If the user-facing request has 1 s, its downstream calls can't each take 1 s.

:::def Deadline propagation
Pass the **remaining time budget** along with each request (gRPC deadlines do this automatically). If the gateway gives a request 800 ms and 300 ms are spent, downstream services know they have 500 ms left, and stop work that can no longer finish in time.
:::

## 2. Retries, carefully

From the background jobs lesson: retry only transient errors, with exponential backoff and jitter, and only idempotent operations. In request paths, add:

- **Retry budgets**: retries may add at most ~10% extra load; past that, stop retrying. Otherwise retries multiply the load on a struggling service exactly when it can least handle it.
- **Retry at one layer only**, to avoid multiplication across layers.
- **Hedged requests** for tail latency: if a read hasn't returned by its p95 time, send a duplicate to another replica and take whichever answers first.

## 3. Circuit breakers

:::def Circuit breaker
A wrapper around calls to a dependency that tracks failures. **Closed**: calls pass through, and failures are counted. When the failure rate crosses a threshold, it **opens**: calls fail **immediately** (fast) without touching the dependency, typically returning a fallback. After a cool-down, it goes **half-open** and lets a few trial calls through: if they succeed, it closes again; if not, it re-opens.
:::

It's named after the electrical device that cuts power to prevent a fire. The benefits: the caller stops wasting threads and time on doomed calls (failing in 1 ms instead of a 2 s timeout), and the failing dependency gets breathing room to recover instead of being hammered.

Break the dependency below and watch the breaker open. Then turn the breaker off and compare the time wasted on timeouts and the threads stuck waiting.

```viz algo=breaker title="A circuit breaker protecting a caller"
threshold = 50
cooldown = 3
```

:::tabs A circuit breaker
```js run
class CircuitBreaker {
  constructor({ failureRate = 0.5, minCalls = 5, windowSize = 10, cooldownMs = 3000 } = {}) {
    Object.assign(this, { failureRate, minCalls, windowSize, cooldownMs });
    this.state = "CLOSED";
    this.results = [];                 // sliding window of recent outcomes (true = failure)
    this.openedAt = 0;
    this.trialInFlight = false;
  }
  async call(fn, fallback, now) {
    if (this.state === "OPEN") {
      if (now - this.openedAt < this.cooldownMs) return { value: fallback(), via: "fallback (open)" };
      this.state = "HALF_OPEN";                          // cool-down over: allow one trial call
    }
    if (this.state === "HALF_OPEN" && this.trialInFlight) return { value: fallback(), via: "fallback (half-open)" };
    this.trialInFlight = this.state === "HALF_OPEN";
    try {
      const value = await fn();
      this.#record(false, now);
      return { value, via: "dependency" };
    } catch {
      this.#record(true, now);
      return { value: fallback(), via: "fallback (call failed)" };
    } finally { this.trialInFlight = false; }
  }
  #record(failed, now) {
    if (this.state === "HALF_OPEN") {                   // the trial decides
      this.state = failed ? "OPEN" : "CLOSED";
      this.openedAt = now;
      this.results = [];
      return;
    }
    this.results.push(failed);
    if (this.results.length > this.windowSize) this.results.shift();
    const failures = this.results.filter(Boolean).length;
    if (this.results.length >= this.minCalls && failures / this.results.length >= this.failureRate) {
      this.state = "OPEN";
      this.openedAt = now;
    }
  }
}

let healthy = true;
const recommendations = async () => { if (!healthy) throw new Error("timeout"); return ["shoes", "socks"]; };
const fallback = () => ["bestsellers"];                    // cached, generic, good enough

const cb = new CircuitBreaker();
const timeline = [[0, true], [100, false], [200, false], [300, false], [400, false], [500, false], [600, false],
                  [900, false], [3700, false], [3800, true], [6900, true], [7000, true]];
for (const [t, up] of timeline) {
  healthy = up;
  const { value, via } = await cb.call(recommendations, fallback, t);
  console.log(`t=${String(t).padStart(4)}ms dep ${up ? "up  " : "down"} → ${cb.state.padEnd(9)} via ${via.padEnd(23)} ${JSON.stringify(value)}`);
}
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

class CircuitBreaker {
public:
    enum class State { CLOSED, OPEN, HALF_OPEN };
    State state = State::CLOSED;

    template <class Fn, class Fallback>
    pair<vector<string>, string> call(Fn fn, Fallback fallback, long now) {
        if (state == State::OPEN) {
            if (now - openedAt_ < cooldownMs_) return {fallback(), "fallback (open)"};
            state = State::HALF_OPEN;                 // cool-down over: allow a trial call
        }
        try {
            auto value = fn();
            record(false, now);
            return {value, "dependency"};
        } catch (const exception&) {
            record(true, now);
            return {fallback(), "fallback (call failed)"};
        }
    }
    string stateName() const { return state == State::CLOSED ? "CLOSED" : state == State::OPEN ? "OPEN" : "HALF_OPEN"; }

private:
    double failureRate_ = 0.5;
    size_t minCalls_ = 5, windowSize_ = 10;
    long cooldownMs_ = 3000, openedAt_ = 0;
    deque<bool> results_;                             // recent outcomes (true = failure)

    void record(bool failed, long now) {
        if (state == State::HALF_OPEN) {              // the trial decides
            state = failed ? State::OPEN : State::CLOSED;
            openedAt_ = now;
            results_.clear();
            return;
        }
        results_.push_back(failed);
        if (results_.size() > windowSize_) results_.pop_front();
        double failures = count(results_.begin(), results_.end(), true);
        if (results_.size() >= minCalls_ && failures / results_.size() >= failureRate_) {
            state = State::OPEN;
            openedAt_ = now;
        }
    }
};

int main() {
    bool healthy = true;
    auto recommendations = [&]() -> vector<string> {
        if (!healthy) throw runtime_error("timeout");
        return {"shoes", "socks"};
    };
    auto fallback = [] { return vector<string>{"bestsellers"}; };   // cached, generic, good enough

    CircuitBreaker cb;
    vector<pair<long, bool>> timeline = {{0, true}, {100, false}, {200, false}, {300, false}, {400, false}, {500, false},
                                         {600, false}, {900, false}, {3700, false}, {3800, true}, {6900, true}, {7000, true}};
    for (auto [t, up] : timeline) {
        healthy = up;
        auto [value, via] = cb.call(recommendations, fallback, t);
        cout << "t=" << setw(4) << t << "ms dep " << (up ? "up  " : "down") << " -> " << left << setw(9) << cb.stateName()
             << " via " << setw(23) << via << right << " [";
        for (size_t i = 0; i < value.size(); i++) cout << (i ? ", " : "") << value[i];
        cout << "]\n";
    }
}
```
:::

Production libraries: **Resilience4j** (Java), **Polly** (.NET), **opossum** (Node.js), **gobreaker** (Go), and service meshes (Envoy's outlier detection) that apply it without code changes.

## 4. Bulkheads

:::def Bulkhead
Isolating resources (thread pools, connection pools, processes, even whole clusters) per dependency or per type of work, so that one part failing can't drain the resources the others need. Named after the watertight compartments of a ship: one flooded compartment doesn't sink the ship.
:::

In the opening story, a **separate pool of 20 threads** for recommendation calls would have limited the damage: when recommendations hang, at most 20 threads wait, and checkout keeps its own pool. Other bulkheads: separate connection pools per downstream, separate worker queues per priority, **cell-based architecture** (independent copies of the whole stack, each serving a subset of users, so a bad deploy or poison request affects one cell only).

## 5. Load shedding and backpressure

When a service is overloaded, accepting more work makes **everything** slow (queues grow, every request times out, throughput collapses). Better to **reject some requests quickly** and serve the rest well.

- **Concurrency limits**: cap requests in flight; beyond the cap, return `503` immediately. Adaptive limiters adjust the cap from measured latency.
- **Prioritised shedding**: drop low-value work first (prefetches, analytics beacons, bot traffic) and protect high-value work (checkout, login).
- **Deadline-aware dropping**: if a request's deadline has already passed while it sat in a queue, don't process it; the client has given up.
- **Backpressure**: tell upstream to slow down (429 with `Retry-After`, bounded queues).

## 6. Fallbacks and graceful degradation

When a dependency is unavailable, degrade the **feature**, not the **product**:

| Dependency down | Graceful degradation |
|---|---|
| Recommendations | show cached bestsellers |
| Personalised feed ranking | show a chronological feed |
| Reviews service | hide the reviews section |
| Search | show categories and popular items |
| Payment provider A | route to provider B; or accept the order and charge later |
| Inventory service | allow "add to cart", re-check stock at checkout |

Design for it: decide per feature what's **critical** (must work or fail visibly) and what's **optional** (hide or replace). Feature flags (next lessons) let you switch off expensive features during incidents.

## Putting it together

```viz algo=arch title="A caller protected in depth"
user    User request | deadline 800 ms [users]
svc     Product page service [service]
p1      Pool: reviews | 20 threads [server]
p2      Pool: recommendations | 20 threads [server]
cb1     Breaker + timeout 150 ms [shield]
cb2     Breaker + timeout 120 ms [shield]
rev     Reviews service [service]
rec     Recommendations [ai]
fb      Fallback: cached bestsellers [cache]
--
user -> svc
svc -> p1 : bulkhead
svc -> p2 : bulkhead
p1 -> cb1
p2 -> cb2
cb1 -> rev
cb2 -> rec
cb2 ~> fb : when open
```

:::interview Answering "what if this dependency is slow or down?"
Name the patterns in layers: *"Every call has a timeout derived from its p99, with the deadline propagated. Retries only for idempotent calls, with backoff, jitter and a retry budget. A circuit breaker per dependency, falling back to cached bestsellers. Recommendation calls run in their own bulkhead pool so they can't starve checkout. Under overload we shed low-priority traffic first."*
:::

```quiz
? Why does a circuit breaker help the failing dependency, not just the caller?
+ While open, it stops sending requests, giving the dependency room to recover instead of being hammered by calls and retries
- It restarts the dependency automatically
- It increases the dependency's capacity
> Fast-failing removes load from the struggling service, which often lets it recover.

? What does the half-open state do?
- Lets half of all requests through permanently
+ After the cool-down, lets a few trial requests through; success closes the breaker, failure re-opens it
- Sends requests to a different region
> It probes for recovery without risking a full flood of traffic.

? A slow, non-essential service exhausts the shared thread pool, so checkout requests can't be served. Which pattern prevents this?
+ Bulkheads: separate thread/connection pools per dependency
- Longer timeouts
- More retries
> Isolated pools contain the damage to the failing dependency's own compartment.

? Under extreme overload, why reject some requests immediately rather than queue them all?
+ Queueing everything makes every request slow until they all time out; shedding some keeps the rest fast and useful
- Rejecting requests is always cheaper
- Queues can't hold more than 100 requests
> Load shedding preserves goodput: some users get a fast error, the rest get a working service.
```

:::keypoints
- **Cascading failures** spread through waiting without limits, shared resource pools, and extra load on struggling services.
- **Timeouts** on every call (from the dependency's p99), with **deadline propagation**.
- **Retries** only for transient errors and idempotent operations, with backoff + jitter, **retry budgets**, one layer; **hedged requests** for tail latency.
- **Circuit breakers**: closed → open (fail fast + fallback) → half-open (trial calls) → closed.
- **Bulkheads** isolate pools per dependency (and cells per user subset); **load shedding** and **backpressure** keep an overloaded service useful.
- **Graceful degradation**: decide per feature what's critical and what can fall back.
:::
