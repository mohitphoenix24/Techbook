---
title: Rate Limiting Algorithms
level: intermediate
time: 50
summary: Why and where to rate limit, the five classic algorithms — token bucket, leaky bucket, fixed window, sliding window log and sliding window counter — with an interactive timeline and implementations in C++ and JavaScript, plus 429 responses, headers, and making it work across many servers with Redis.
---

A rate limiter caps how many requests a client can make in a period of time: "100 requests per minute per API key". It protects your system from abuse, bugs, and plain overload, and it's one of the most frequently asked interview questions, both as a component inside a bigger design and as a standalone "design a rate limiter".

## Why rate limit?

- **Prevent abuse and attacks**: brute-force logins, scraping, credential stuffing, denial-of-service.
- **Protect shared resources**: one buggy client in a retry loop shouldn't take down the service for everyone (the "noisy neighbour").
- **Control costs**: calls to paid third-party APIs, expensive queries, LLM tokens.
- **Enforce business tiers**: free plan 60 requests/min, pro plan 1,000.

## Where does it go?

```viz algo=arch title="Rate limiting at the edge of your system"
client   Clients [users]
gw       API gateway | rate limiter here [gateway]
store    Counter store | Redis [cache]
api      API servers [service*3]
--
client -> gw
gw -> store : check + increment
gw -> api : only if allowed
--
flow Allowed request
client > gw : POST /v1/messages with API key k_123.
gw > store : Atomically: count for k_123 in this window → 41 of 100.
gw > api : Allowed: forward to the API.
flow Rejected request
client > gw : The 101st request this minute.
gw > store : Count would be 101 of 100.
gw > client : 429 Too Many Requests, Retry-After: 12
```

You can rate limit in the **client** (polite, but can't be trusted), at the **API gateway / edge** (the usual place: rejects bad traffic before it costs anything), or **inside a service** (fine-grained limits like "5 password attempts per account per hour"). Real systems layer them.

When a request is rejected, return **`429 Too Many Requests`** with headers that tell the client what to do:

```text
HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1767225600
```

## The five algorithms

Use the timeline below to compare them. Each dot is a request: **green** allowed, **red** rejected, **amber** queued. The lower chart shows the limiter's internal state. Click on the timeline to add requests, and try the *"Burst at a window edge"* traffic with the fixed window algorithm.

```viz algo=ratelimit title="Rate limiter playground"
algo = token
limit = 4
window = 2
pattern = bursty
```

### 1. Token bucket

:::def Token bucket
A bucket holds up to **capacity** tokens and is refilled at a steady **rate** (e.g. 1 token per second). Each request takes one token. No token → rejected. A full bucket allows a **burst** of up to *capacity* requests, while the long-term average can't exceed the refill rate.
:::

It's the most widely used algorithm (AWS, Stripe, most API gateways) because it's simple, needs only **two numbers per client** (tokens, last refill time), and allows reasonable bursts. Refill is computed lazily on each request, so no background timer is needed.

:::tabs Token bucket
```cpp run
#include <bits/stdc++.h>
using namespace std;

class TokenBucket {
    double capacity_, refillPerSec_, tokens_;
    double last_;                       // time of the last refill, in seconds
public:
    TokenBucket(double capacity, double refillPerSec)
        : capacity_(capacity), refillPerSec_(refillPerSec), tokens_(capacity), last_(0) {}

    bool allow(double now) {
        tokens_ = min(capacity_, tokens_ + (now - last_) * refillPerSec_);   // lazy refill
        last_ = now;
        if (tokens_ < 1) return false;
        tokens_ -= 1;
        return true;
    }
};

int main() {
    TokenBucket tb(3, 1);               // bursts of 3, then 1 request per second
    for (double t : {0.0, 0.1, 0.2, 0.3, 0.9, 1.3, 2.4, 2.5, 6.0, 6.0, 6.0, 6.0})
        cout << "t=" << fixed << setprecision(1) << t << "s  " << (tb.allow(t) ? "allowed" : "429") << "\n";
}
```
```js run
class TokenBucket {
  constructor(capacity, refillPerSec) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.tokens = capacity;
    this.last = 0;                      // time of the last refill, in seconds
  }
  allow(now) {
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerSec);   // lazy refill
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

const tb = new TokenBucket(3, 1);       // bursts of 3, then 1 request per second
for (const t of [0, 0.1, 0.2, 0.3, 0.9, 1.3, 2.4, 2.5, 6, 6, 6, 6]) {
  console.log(`t=${t.toFixed(1)}s  ${tb.allow(t) ? "allowed" : "429"}`);
}
```
:::

### 2. Leaky bucket

:::def Leaky bucket
Requests enter a **fixed-size queue** and are processed at a **constant rate**, like water leaking from a hole in a bucket. If the queue is full, new requests are dropped.
:::

It **smooths** traffic into a perfectly steady stream, which is great when the backend needs a constant pace (writing to a slow partner API, a payment processor with strict limits, network traffic shaping). The downside: bursts are delayed rather than served quickly, and old queued requests can delay new ones. Many people say "leaky bucket" for a token-bucket-like **meter** (no queue); in interviews, clarify which one you mean.

### 3. Fixed window counter

:::def Fixed window counter
Divide time into fixed windows (each minute: 12:00:00–12:00:59, …). Keep one counter per client per window; reject when it reaches the limit. Reset at the window boundary.
:::

It's very cheap (one counter, e.g. Redis `INCR` + `EXPIRE`) and easy to explain. Its flaw: **bursts at window edges**. With a limit of 100 per minute, a client can send 100 requests at 12:00:59 and 100 more at 12:01:00, so **200 requests in two seconds**, double the intended rate. The playground's "Burst at a window edge" pattern shows this.

### 4. Sliding window log

:::def Sliding window log
Store the **timestamp of every accepted request** (e.g. in a Redis sorted set). For a new request, drop timestamps older than one window, then count what's left. Allow if the count is below the limit.
:::

It's exact: in **any** window-length interval, at most *limit* requests are accepted. The cost is memory: one timestamp per request, so 1,000 requests/min per user means up to 1,000 stored entries per user.

### 5. Sliding window counter

:::def Sliding window counter
A hybrid: keep counters for the **current** and **previous** fixed windows, and estimate the count over the last full window as `previous × (fraction of the previous window still inside the sliding window) + current`.
:::

Example: limit 100/min, the previous minute had 80 requests, the current minute has 30 so far, and we're 25% into it. Estimate = 80 × 0.75 + 30 = **90** → allowed. It needs only two counters, smooths the edge-burst problem, and is accurate enough in practice (Cloudflare measured an error rate of a few thousandths of a percent of requests). It's an excellent default for a distributed limiter.

:::tabs Fixed window vs sliding window counter vs sliding log
```js run
class FixedWindow {
  constructor(limit, windowSec) { Object.assign(this, { limit, windowSec, window: -1, count: 0 }); }
  allow(now) {
    const w = Math.floor(now / this.windowSec);
    if (w !== this.window) { this.window = w; this.count = 0; }
    if (this.count >= this.limit) return false;
    this.count++;
    return true;
  }
}

class SlidingWindowLog {
  constructor(limit, windowSec) { Object.assign(this, { limit, windowSec, log: [] }); }
  allow(now) {
    while (this.log.length && this.log[0] <= now - this.windowSec) this.log.shift();
    if (this.log.length >= this.limit) return false;
    this.log.push(now);
    return true;
  }
}

class SlidingWindowCounter {
  constructor(limit, windowSec) { Object.assign(this, { limit, windowSec, window: 0, prev: 0, curr: 0 }); }
  allow(now) {
    const w = Math.floor(now / this.windowSec);
    if (w !== this.window) {                              // roll the windows forward
      this.prev = w === this.window + 1 ? this.curr : 0;
      this.curr = 0;
      this.window = w;
    }
    const intoWindow = (now - w * this.windowSec) / this.windowSec;
    const estimate = this.prev * (1 - intoWindow) + this.curr;
    if (estimate + 1 > this.limit) return false;
    this.curr++;
    return true;
  }
}

// Limit: 5 per 10 s. Ten requests straddle the boundary at t = 10 s.
const times = [9.1, 9.3, 9.5, 9.7, 9.9, 10.1, 10.3, 10.5, 10.7, 10.9];
for (const Limiter of [FixedWindow, SlidingWindowLog, SlidingWindowCounter]) {
  const rl = new Limiter(5, 10);
  const accepted = times.filter((t) => rl.allow(t)).length;
  console.log(`${Limiter.name.padEnd(21)} accepted ${accepted} of 10 within 1.8 s (limit is 5 per 10 s)`);
}
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Limiter { virtual bool allow(double now) = 0; virtual ~Limiter() = default; };

class FixedWindow : public Limiter {
    int limit_, count_ = 0; double win_; long long window_ = -1;
public:
    FixedWindow(int limit, double win) : limit_(limit), win_(win) {}
    bool allow(double now) override {
        long long w = (long long)floor(now / win_);
        if (w != window_) { window_ = w; count_ = 0; }
        if (count_ >= limit_) return false;
        ++count_;
        return true;
    }
};

class SlidingWindowLog : public Limiter {
    int limit_; double win_; deque<double> log_;
public:
    SlidingWindowLog(int limit, double win) : limit_(limit), win_(win) {}
    bool allow(double now) override {
        while (!log_.empty() && log_.front() <= now - win_) log_.pop_front();
        if ((int)log_.size() >= limit_) return false;
        log_.push_back(now);
        return true;
    }
};

class SlidingWindowCounter : public Limiter {
    int limit_; double win_; long long window_ = 0; double prev_ = 0, curr_ = 0;
public:
    SlidingWindowCounter(int limit, double win) : limit_(limit), win_(win) {}
    bool allow(double now) override {
        long long w = (long long)floor(now / win_);
        if (w != window_) {                         // roll the windows forward
            prev_ = (w == window_ + 1) ? curr_ : 0;
            curr_ = 0;
            window_ = w;
        }
        double into = (now - w * win_) / win_;
        double estimate = prev_ * (1 - into) + curr_;
        if (estimate + 1 > limit_) return false;
        ++curr_;
        return true;
    }
};

int main() {
    // Limit: 5 per 10 s. Ten requests straddle the boundary at t = 10 s.
    vector<double> times = {9.1, 9.3, 9.5, 9.7, 9.9, 10.1, 10.3, 10.5, 10.7, 10.9};
    vector<pair<string, unique_ptr<Limiter>>> limiters;
    limiters.emplace_back("FixedWindow", make_unique<FixedWindow>(5, 10));
    limiters.emplace_back("SlidingWindowLog", make_unique<SlidingWindowLog>(5, 10));
    limiters.emplace_back("SlidingWindowCounter", make_unique<SlidingWindowCounter>(5, 10));
    for (auto& [name, rl] : limiters) {
        int accepted = 0;
        for (double t : times) accepted += rl->allow(t);
        cout << left << setw(21) << name << " accepted " << accepted
             << " of 10 within 1.8 s (limit is 5 per 10 s)\n";
    }
}
```
:::

The fixed window lets **all 10** through in under two seconds. The log and the sliding counter hold the line at 5.

### Comparison

| Algorithm | Memory per client | Bursts | Accuracy | Typical use |
|---|---|---|---|---|
| Token bucket | 2 numbers | allows up to capacity | good | API limits (the default) |
| Leaky bucket (queue) | a queue | smoothed into a steady flow | good | shaping traffic to a slow downstream |
| Fixed window | 1 counter | 2× at window edges | weak at edges | simple quotas, daily limits |
| Sliding window log | 1 timestamp per request | none beyond the limit | exact | low-volume, strict limits (logins) |
| Sliding window counter | 2 counters | small | approximate, very close | high-volume distributed limits |

## Rate limiting across many servers

With 20 gateway instances, a per-instance counter would let a client get 20× the limit by spreading requests. The counters must be **shared**, usually in **Redis**, and updated **atomically**.

:::warn The race in "read, check, write"
`count = GET key; if count < limit: SET key count+1` breaks under concurrency: two gateways read 99 at the same moment, both allow, and the count becomes 100 after 101 requests. Use atomic operations: `INCR` (then compare the result), or a **Lua script** that reads, decides and writes as one step. Redis runs a script without interleaving other commands.
:::

A fixed-window limiter in Redis is two commands:

```text
count = INCR rate:k_123:202604011205      -- key = client + current minute
if count == 1: EXPIRE rate:k_123:202604011205 120
allow = count <= 100
```

A token bucket or sliding window counter is a short Lua script (read the state, compute, write back, return the decision), executed with `EVALSHA` in one round trip.

**Design questions to raise** (they come up in the rate limiter case study):

- **Latency**: a Redis round trip (~0.5 ms) on every request. Fine for most APIs. For extreme volumes, use **local token buckets** that sync with Redis every few hundred ms, trading a little accuracy for speed.
- **Hot keys**: a single huge client hammers one Redis key. Shard by client, or keep local pre-allocated token batches.
- **Fail open or fail closed?** If Redis is down, do you allow everything (fail open: availability first, the usual choice for general APIs) or reject everything (fail closed: for security-critical limits like login attempts)?
- **What's the key?** User id, API key, IP address (careful with many users behind one corporate NAT), or a combination, plus per-endpoint limits for expensive operations.
- **Soft vs hard limits** and **retry behaviour**: clients should back off with jitter on 429s, not retry instantly.

:::problem Choose the algorithm {level=easy tags="rate limiting"}
For each case, pick an algorithm and the key you'd limit on:
1. A public API with a limit of 1,000 requests per minute per API key, served by 50 gateway instances.
2. A login endpoint: at most 5 failed attempts per account per 15 minutes.
3. A worker that calls a partner's API, which allows at most 10 calls per second, with no bursts.

:::hint Hint
Think about volume (memory per client), how strict the limit must be, and whether bursts are acceptable.
:::

:::solution
1. **Sliding window counter** (or token bucket) in **Redis**, keyed by **API key**, implemented as a Lua script for atomicity. High volume makes the log too expensive; the edge burst rules out a plain fixed window. Fail open if Redis is down.
2. **Sliding window log** keyed by **account id** (and a second, looser limit keyed by IP to stop attackers trying many accounts). Volume is tiny and the limit must be exact. Fail **closed**: security first.
3. A **leaky bucket queue** (or a token bucket with capacity 1) inside the worker: requests are queued and sent at a steady 10/s, which is exactly what the partner wants. If several workers share the partner limit, coordinate through a shared token bucket in Redis.
:::
:::

```quiz
? Which algorithm allows short bursts while keeping a long-term average rate, using only two numbers per client?
+ Token bucket
- Sliding window log
- Leaky bucket queue
> The bucket's capacity sets the maximum burst; the refill rate sets the average.

? With a fixed window of 100 requests/minute, what's the most a client can send in a 2-second span?
- 100
+ 200
- 102
> 100 at the end of one window and 100 at the start of the next.

? Twenty gateway instances share a Redis-based limiter that does `GET`, then a check, then `SET`. What goes wrong?
+ Concurrent requests read the same old count and all pass, so clients exceed the limit
- Redis can't store counters
- Nothing; Redis is single-threaded so the sequence is atomic
> Each command is atomic, but a GET-check-SET sequence across three commands isn't. Use INCR or a Lua script.

? The rate limiter's Redis cluster is down. For a public read API, what's the usual choice?
+ Fail open: let requests through (maybe with a local fallback limit) so the API stays available
- Fail closed: reject every request
- Return 500 for all requests
> For general APIs, availability usually wins. Security-critical limits (logins, payments) may fail closed.
```

:::keypoints
- Rate limiting protects against abuse, overload and runaway costs, and enforces plans. Usually done at the **API gateway**, with `429` + `Retry-After`.
- **Token bucket**: bursts up to capacity, steady average; 2 numbers per client — the common default.
- **Leaky bucket**: a queue drained at a constant rate — smooths traffic for fragile downstreams.
- **Fixed window**: one counter, but allows 2× bursts at window edges. **Sliding log**: exact but memory-heavy. **Sliding window counter**: two counters, nearly exact — great for distributed limits.
- Distributed limiters keep state in **Redis** and update it **atomically** (`INCR`, Lua). Decide fail-open vs fail-closed, the limiting key, and how to handle hot keys and latency.
:::
