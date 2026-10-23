---
title: Design a Rate Limiter
level: intermediate
time: 55
summary: Four classic algorithms behind one interface (fixed window, sliding window log, token bucket, leaky bucket), per-key limits with tiers, an injectable clock for deterministic tests, thread-safety, and the trade-offs interviewers ask about.
---

:::problem Design a Rate Limiter {level=medium tags="Strategy,algorithms,concurrency,time,API gateway"}
Design a rate limiter that decides whether a request from a client (user id, API key or IP) is allowed. Example rule: at most 5 requests per 10 seconds per user. Support several algorithms, per-client configuration (free vs paid tiers), thread-safety, and tests that do not wait for real time.
:::

:::hint Hint
All the algorithms answer the same question: `allow(key, now)`. Put them behind one interface and keep **one small state object per key**. Take the current time as a parameter (or inject a clock) so tests are instant.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Interface? | `bool allow(const string& key)`; optional `retryAfter` |
| Rules? | N requests per window, with burst behaviour depending on the algorithm |
| Per-key? | each client has its own state; tier decides the limit |
| Algorithms? | fixed window, sliding window log, token bucket, leaky bucket |
| Time? | injected `Clock` (seconds as double) |
| Concurrency? | many threads hitting the same key |
| Memory? | state per active key; evict idle keys |
| Out of scope | distributed limiting (mention Redis) |

## Step 2: the four algorithms, compared

| Algorithm | Idea | Pros | Cons |
|---|---|---|---|
| **Fixed window** | counter per time window (`now / W`) | simplest, O(1) memory | **boundary burst**: 5 at the end of a window + 5 at the start of the next = 10 in a short time |
| **Sliding window log** | keep timestamps of recent requests; drop older than W | exact | memory O(N) per key |
| **Token bucket** | bucket of capacity C refilled at rate R; each request takes 1 token | allows **bursts** up to C, smooth average rate, O(1) | two parameters to tune |
| **Leaky bucket** | requests enter a queue drained at a fixed rate; overflow is dropped | **smooth output** rate | no bursts; queueing latency |

Token bucket is the usual default (used by many APIs); sliding window log is the accurate one for small limits.

## Step 3: design

```viz algo=uml title="Rate limiter"
interface RateLimiter
  + allow(key: string): bool
class FixedWindowLimiter
class SlidingWindowLimiter
class TokenBucketLimiter
class LeakyBucketLimiter
class LimiterFactory
  + forTier(tier: Tier): RateLimiter
class KeyedLimiter
  - perKey: map<string, State>
  - mutex: mutex
interface Clock
  + now(): double
RateLimiter <|-- FixedWindowLimiter
FixedWindowLimiter ..|> RateLimiter
SlidingWindowLimiter ..|> RateLimiter
TokenBucketLimiter ..|> RateLimiter
LeakyBucketLimiter ..|> RateLimiter
LimiterFactory ..> RateLimiter
RateLimiter --> Clock
```

- **Strategy**: each algorithm is a `RateLimiter` implementation. A **factory** builds the right one for a tier (free: 5/10s; paid: 50/10s).
- **State per key** lives inside the limiter in a map guarded by a mutex; a refinement is one lock per key (striping) or atomics (token bucket with CAS).
- **Lazy refill** in the token bucket: no timer thread; compute tokens from elapsed time at each call (`tokens = min(capacity, tokens + elapsed * rate)`).
- **Injected clock** makes every behaviour deterministic.
- **Memory**: periodically drop keys idle for longer than the window.

## Step 4: the code

```cpp run title="Four limiters behind one interface"
#include <algorithm>
#include <cmath>
#include <deque>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
using namespace std;

struct Clock { virtual ~Clock() = default; virtual double now() const = 0; };
struct ManualClock : Clock { double t = 0; double now() const override { return t; } void advance(double s) { t += s; } };

struct RateLimiter { virtual ~RateLimiter() = default; virtual bool allow(const string& key) = 0; };

// 1) Fixed window: a counter per (key, window number)
class FixedWindowLimiter : public RateLimiter {
    int limit_; double window_; const Clock& clock_;
    struct S { long window = -1; int count = 0; };
    map<string, S> state_; mutex m_;
public:
    FixedWindowLimiter(int limit, double window, const Clock& c) : limit_(limit), window_(window), clock_(c) {}
    bool allow(const string& key) override {
        lock_guard l(m_);
        long w = static_cast<long>(clock_.now() / window_);
        S& s = state_[key];
        if (s.window != w) { s.window = w; s.count = 0; }          // a new window: reset
        return s.count < limit_ ? (++s.count, true) : false;
    }
};

// 2) Sliding window log: exact, remembers timestamps
class SlidingWindowLimiter : public RateLimiter {
    int limit_; double window_; const Clock& clock_;
    map<string, deque<double>> log_; mutex m_;
public:
    SlidingWindowLimiter(int limit, double window, const Clock& c) : limit_(limit), window_(window), clock_(c) {}
    bool allow(const string& key) override {
        lock_guard l(m_);
        double now = clock_.now();
        auto& q = log_[key];
        while (!q.empty() && q.front() <= now - window_) q.pop_front();     // forget requests older than the window
        if (static_cast<int>(q.size()) >= limit_) return false;
        q.push_back(now);
        return true;
    }
};

// 3) Token bucket: capacity C, refill R tokens per second, lazily computed
class TokenBucketLimiter : public RateLimiter {
    double capacity_, rate_; const Clock& clock_;
    struct S { double tokens; double last; };
    map<string, S> state_; mutex m_;
public:
    TokenBucketLimiter(double capacity, double ratePerSec, const Clock& c) : capacity_(capacity), rate_(ratePerSec), clock_(c) {}
    bool allow(const string& key) override {
        lock_guard l(m_);
        double now = clock_.now();
        auto it = state_.find(key);
        if (it == state_.end()) it = state_.emplace(key, S{capacity_, now}).first;      // a new client starts with a full bucket
        S& s = it->second;
        s.tokens = min(capacity_, s.tokens + (now - s.last) * rate_);                    // refill for the elapsed time
        s.last = now;
        if (s.tokens < 1) return false;
        s.tokens -= 1;
        return true;
    }
};

// 4) Leaky bucket (as a meter): water level drains at a constant rate; each request adds one unit; overflow is rejected
class LeakyBucketLimiter : public RateLimiter {
    double capacity_, leakPerSec_; const Clock& clock_;
    struct S { double level = 0; double last = 0; };
    map<string, S> state_; mutex m_;
public:
    LeakyBucketLimiter(double capacity, double leakPerSec, const Clock& c) : capacity_(capacity), leakPerSec_(leakPerSec), clock_(c) {}
    bool allow(const string& key) override {
        lock_guard l(m_);
        double now = clock_.now();
        S& s = state_[key];
        s.level = max(0.0, s.level - (now - s.last) * leakPerSec_);
        s.last = now;
        if (s.level + 1 > capacity_) return false;
        s.level += 1;
        return true;
    }
};

// A factory chooses the limiter for a customer tier
enum class Tier { Free, Paid };
unique_ptr<RateLimiter> forTier(Tier t, const Clock& c) {
    return t == Tier::Free ? unique_ptr<RateLimiter>(make_unique<TokenBucketLimiter>(5, 0.5, c))      // burst of 5, then 1 per 2 s
                           : unique_ptr<RateLimiter>(make_unique<TokenBucketLimiter>(50, 5, c));      // burst of 50, then 5 per second
}

string run(RateLimiter& l, const string& key, int n) { string s; for (int i = 0; i < n; ++i) s += l.allow(key) ? 'Y' : 'n'; return s; }

int main() {
    ManualClock clock;
    cout << "Y = allowed, n = rejected\n";

    FixedWindowLimiter fixed(5, 10, clock);
    clock.t = 0;  cout << "fixed window (5 per 10s), t=0..:   " << run(fixed, "u", 7) << "\n";
    clock.t = 9.9; cout << "  t=9.9 same window:               " << run(fixed, "u", 1) << "\n";
    clock.t = 10;  cout << "  t=10 new window (burst of 5 again): " << run(fixed, "u", 5) << "   <- the boundary problem: 10 requests within 0.1 s\n";

    ManualClock c2;
    SlidingWindowLimiter sliding(5, 10, c2);
    c2.t = 0;   cout << "sliding window (5 per 10s), t=0:   " << run(sliding, "u", 5) << "\n";
    c2.t = 9.9; cout << "  t=9.9:                           " << run(sliding, "u", 1) << "\n";
    c2.t = 10;  cout << "  t=10 (the first requests expire): " << run(sliding, "u", 6) << "\n";

    ManualClock c3;
    TokenBucketLimiter bucket(5, 1, c3);                       // capacity 5, 1 token per second
    c3.t = 0;  cout << "token bucket (cap 5, 1/s), burst:     " << run(bucket, "u", 7) << "\n";
    c3.t = 2;  cout << "  after 2 s (2 tokens back):         " << run(bucket, "u", 3) << "\n";
    c3.t = 100; cout << "  after a long pause (capped at 5):  " << run(bucket, "u", 7) << "\n";

    ManualClock c4;
    LeakyBucketLimiter leaky(3, 1, c4);
    c4.t = 0;   cout << "leaky bucket (cap 3, drains 1/s):  " << run(leaky, "u", 5) << "\n";
    c4.t = 2;   cout << "  after 2 s:                         " << run(leaky, "u", 3) << "\n";

    cout << "per-key isolation and tiers:\n";
    ManualClock c5;
    auto freeTier = forTier(Tier::Free, c5), paidTier = forTier(Tier::Paid, c5);
    cout << "  free user A: " << run(*freeTier, "A", 7) << "   free user B (own bucket): " << run(*freeTier, "B", 6) << "\n";
    cout << "  paid user:   " << run(*paidTier, "P", 52) << "\n";

    cout << "threads: 8 threads x 100 requests against a 100-token bucket (no refill)\n";
    ManualClock c6;
    TokenBucketLimiter shared(100, 0, c6);
    vector<thread> ts; vector<int> allowed(8, 0);
    for (int t = 0; t < 8; ++t) ts.emplace_back([&, t] { for (int i = 0; i < 100; ++i) allowed[t] += shared.allow("api-key") ? 1 : 0; });
    for (auto& th : ts) th.join();
    int total = 0; for (int a : allowed) total += a;
    cout << "  allowed in total: " << total << " (exactly the capacity, never more)\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Clock goes backwards | clamp elapsed time to >= 0 |
| New key | token bucket starts full (or empty, by policy) |
| Rejected requests: do they count? | in sliding log, no (not recorded); some APIs penalise abusers |
| Huge number of keys | evict idle keys; bound memory; use a bloom filter or LRU for the key table |
| Sub-second precision | use `double` seconds or integer milliseconds consistently |
| Config changes at runtime | rebuild the limiter for that tier; keep per-key state if compatible |
| Returning "retry after" | compute from the bucket: `(1 - tokens) / rate` seconds |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Different limits per endpoint and per user" | composite limiter: ALL of several limiters must allow (Chain/Specification) |
| "Distributed across many servers" | state in Redis with atomic Lua scripts (token bucket) or approximate local counters synced periodically |
| "Return headers `X-RateLimit-Remaining`" | `allow` returns a `Decision {allowed, remaining, retryAfter}` |
| "Block abusers temporarily" | a penalty box layered on top (State per key) |
| "Throttle (delay) instead of reject" | leaky bucket with a queue and a worker |
| "Fairness among tenants" | weighted token buckets; hierarchical limits |
| "Observability" | counters for allowed/rejected by key and tier |

```quiz
? What is the "boundary problem" of the fixed window?
- It uses too much memory
+ A client can send a full quota at the end of one window and again at the start of the next: double the rate in a short time
- It is not thread-safe
> Sliding windows and token buckets avoid it.
? Why is the token bucket refilled lazily?
- Because a timer thread is required
+ Tokens are computed from the elapsed time on each call, so no background work is needed
- It is required by C++
> Lazy refill is O(1) per request.
```

:::keypoints
- One interface, four algorithms: fixed window (cheap, boundary burst), sliding log (exact, memory heavy), token bucket (bursts + steady rate), leaky bucket (smooth output).
- State per key, lazy time-based updates, injected clock, a mutex (or sharding) for thread-safety.
- Tiers via a factory; distributed versions move the state to a shared store with atomic operations.
:::
