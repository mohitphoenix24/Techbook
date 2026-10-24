---
title: Design a Rate Limiter
level: intermediate
time: 55
summary: Four common ways to limit requests (fixed window, sliding window log, token bucket, leaky bucket) behind one interface, limits for each client and tier, a clock you can control in tests, thread safety, and the trade-offs interviewers ask about.
---

:::problem Design a Rate Limiter {level=medium tags="Strategy,algorithms,concurrency,time,API gateway"}
Design a rate limiter that decides whether a request from a client (a user id, API key or IP address) is allowed. Example rule: at most 5 requests in 10 seconds for each user. Support several algorithms, different settings for each client (free and paid tiers), thread safety, and tests that do not wait for real time.
:::

:::hint Hint
All the algorithms answer the same question: `allow(key, now)`. Put them behind one interface and keep **one small state object for each key**. Pass in the current time (or a clock), so tests run instantly.
:::

## What is a rate limiter?

Imagine a doorman at a club who lets in only 5 people every 10 seconds. If more people arrive, they must wait outside. A rate limiter does the same for requests to a server. It protects the server from too many requests, from a bug or from an attacker.

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| The interface? | `bool allow(const string& key)`. Maybe also a `retryAfter` |
| Rules? | N requests for each window of time. How bursts are treated depends on the algorithm |
| For each client? | each client has its own state. The tier decides the limit |
| Algorithms? | fixed window, sliding window log, token bucket, leaky bucket |
| Time? | a `Clock` that we pass in (seconds as a double) |
| Many threads? | yes, many threads can hit the same key |
| Memory? | state for each active key. Remove keys that are idle |
| Not needed | limiting across many machines (we mention Redis) |

## Step 2: The four algorithms side by side

| Algorithm | The idea | Good | Not so good |
|---|---|---|---|
| **Fixed window** | one counter for each time window (`now / W`) | simplest, O(1) memory | **boundary burst**: 5 at the end of one window and 5 at the start of the next gives 10 in a very short time |
| **Sliding window log** | keep the times of recent requests, and drop those older than W | exact | uses O(N) memory for each key |
| **Token bucket** | a bucket holds up to C tokens and is refilled at rate R. Each request takes 1 token | allows **bursts** up to C, steady average rate, O(1) | two numbers to tune |
| **Leaky bucket** | requests go in a queue that is emptied at a fixed rate. When the queue is full, requests are dropped | **smooth output** | no bursts, and waiting time |

The token bucket is the usual choice (many APIs use it). The sliding window log is the exact one for small limits.

## Step 3: The design

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

- **Strategy:** each algorithm is a `RateLimiter` class. A **factory** makes the right one for a tier (free: 5 per 10 seconds, paid: 50 per 10 seconds).
- **State for each key** lives inside the limiter in a map protected by a mutex. To improve, use one lock for each key (striping) or atomics (a token bucket with CAS).
- **Lazy refill** for the token bucket: no timer thread. At each call we work out the tokens from the time passed: `tokens = min(capacity, tokens + elapsed * rate)`.
- **A clock passed in** makes every behaviour predictable in tests.
- **Memory:** now and then, remove keys that have been idle for longer than the window.

## Step 4: The code

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

| Case | What happens |
|---|---|
| The clock goes backwards | use `max(0, elapsed)` |
| A new key | the token bucket starts full (or empty, as the policy says) |
| Do refused requests count? | in the sliding log, no (they are not recorded). Some APIs punish abusers |
| A huge number of keys | remove idle keys, limit memory, use an LRU for the key table |
| Fractions of a second | use `double` seconds or integer milliseconds, and stay consistent |
| Settings change while running | rebuild the limiter for that tier. Keep the key state if it still fits |
| Telling "retry after" | work it out from the bucket: `(1 - tokens) / rate` seconds |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Different limits for each endpoint and each user" | a combined limiter: ALL the limiters must allow (Chain or Specification) |
| "Many servers" | keep the state in Redis with atomic Lua scripts (token bucket), or approximate local counters that sync now and then |
| "Send headers like `X-RateLimit-Remaining`" | `allow` returns a `Decision {allowed, remaining, retryAfter}` |
| "Block abusers for a while" | a penalty box on top (State for each key) |
| "Delay instead of reject" | a leaky bucket with a queue and a worker |
| "Fair share between customers" | weighted token buckets and limits in layers |
| "Watching it" | counters for allowed and refused by key and tier |

## Short answer to say in an interview

:::interview Compare fixed window, sliding window and token bucket.
"The fixed window keeps one counter for each time window. It is the simplest, but it has the boundary problem: a client can send a full quota at the end of one window and again at the start of the next, so twice the rate in a short time. The sliding window log keeps the timestamps of requests, so it is exact, but it uses more memory. The token bucket refills tokens at a steady rate and lets a request take one, so it allows bursts up to the bucket size and keeps a steady average. It is O(1), and I refill it lazily from the elapsed time."
:::

```quiz
? What is the "boundary problem" of the fixed window?
- It uses too much memory
+ A client can send a full quota at the end of one window and again at the start of the next, so double the rate in a short time
- It is not thread-safe
> Sliding windows and token buckets avoid this.
? Why is the token bucket refilled lazily?
- A timer thread is required
+ Tokens are worked out from the time passed at each call, so no background work is needed
- C++ requires it
> Lazy refill is O(1) for each request.
```

:::keypoints
- One interface, four algorithms: fixed window (cheap, boundary burst), sliding log (exact, uses memory), token bucket (bursts and a steady rate), leaky bucket (smooth output).
- State for each key, updates based on time when called, a clock passed in, a mutex (or shards) for threads.
- Tiers through a factory. For many machines, keep the state in a shared store with atomic operations.
:::
