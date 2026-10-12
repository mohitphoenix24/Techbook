---
title: Design a Distributed Rate Limiter
level: intermediate
time: 50
summary: Rate limiting as a service for a large API fleet — rules and identities, where the limiter runs, a Redis-backed sliding-window or token-bucket check done atomically in one round trip, sharding and hot keys, local approximations for extreme scale, fail-open vs fail-closed, multi-region limits, and the client-facing contract.
---

:::problem Design a Distributed Rate Limiter {level=medium tags="HLD,Redis,rate limiting,atomicity"}
An API platform runs 200 gateway instances. Limit each client according to rules like "100 requests per minute per API key", "5 login attempts per 15 minutes per account", and "1,000 requests per second per IP", across the whole fleet, adding at most a millisecond or two of latency.

:::hint Hint
The algorithms are from the rate limiting lesson. The design questions are: where the shared counters live, how to update them atomically in one round trip, what happens when that store is slow or down, and how to cope with one client generating huge traffic.
:::
:::

## 1. Requirements

**Functional**
- Rules: a **limit** per **identity** (API key, user id, IP, account) per **scope** (all endpoints, or a specific endpoint) per **window**.
- Requests over the limit are rejected with **429** + `Retry-After` and rate-limit headers.
- Rules are configurable without redeploying.

**Non-functional**
- Accurate across **all** gateway instances (a client can't get 200× the limit by spreading requests).
- Low overhead: **< 2 ms p99** added per request; very high throughput (≈ 1 M checks/s).
- Highly available: the limiter failing must not take the API down (choose fail-open/closed per rule).
- Small error is acceptable for general API limits; security limits (login) must be strict.

## 2. Estimates

1 M requests/s across the fleet, each needing one check. If each check is one Redis operation, that's 1 M ops/s: a Redis cluster of ~10–20 shards (100K ops/s each with headroom). Memory: say 50 M active identities × 2 rules × ~100 bytes ≈ **10 GB**: fits in memory, spread across shards.

## 3. Where does the limiter run?

| Placement | Pros | Cons |
|---|---|---|
| In each service | fine-grained, knows business context | duplicated logic, inconsistent rules |
| **In the API gateway / edge** (middleware) | one place, rejects early (before costly work) | needs a shared store for fleet-wide counts |
| A separate rate-limit service called per request | language-independent, central | an extra network hop |
| At the CDN/WAF | absorbs attacks before your infrastructure | coarse rules only |

The usual answer: **middleware in the API gateway**, talking directly to a **Redis cluster**, with rules from a config service cached locally; plus coarse IP limits at the edge/WAF for attack traffic.

## 4. High-level design

```viz algo=arch title="Fleet-wide rate limiting"
client   Clients [users]
edge     CDN / WAF | coarse IP limits [shield]
gw       API gateway fleet | limiter middleware [gateway*3]
rules    Rules service | config, cached locally [service]
redis    Redis cluster | counters, sharded by identity [cache]
api      Backend services [service*3]
metrics  Metrics | allowed, rejected [chart]
--
client -> edge
edge -> gw
gw -> rules : poll every 30 s
gw -> redis : 1 atomic script per check
gw -> api : if allowed
gw ~> metrics
--
flow A request within the limit
client > edge : POST /v1/messages with API key k_77.
edge > gw : Passes the IP-level check at the edge.
gw > rules : Rules are already cached in memory: k_77 → 100/min (pro plan).
gw > redis : EVALSHA sliding_window(key=rl:k_77:messages, limit=100, window=60): returns allowed, remaining 41.
gw > api : Forward with X-RateLimit-Remaining: 41.
flow Over the limit
client > gw : Request #101 in the window.
gw > redis : The script returns denied, retry after 12 s.
gw > client : 429 Too Many Requests, Retry-After: 12 (no backend work done).
```

## 5. Deep dives

### A. Atomic check-and-update in one round trip

The check must read the state, decide, and update **atomically**; otherwise concurrent gateways read the same count and both allow (the race from the rate limiting lesson). Redis executes a **Lua script** without interleaving other commands, so the whole decision is one atomic operation and one network round trip:

```text
-- sliding window counter: KEYS[1]=base key, ARGV = limit, window_s, now_s
local limit, window, now = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local cur  = math.floor(now / window)
local into = (now % window) / window
local c = tonumber(redis.call('GET', KEYS[1]..':'..cur)  or '0')
local p = tonumber(redis.call('GET', KEYS[1]..':'..(cur-1)) or '0')
if p * (1 - into) + c + 1 > limit then return {0, c} end      -- denied
redis.call('INCR', KEYS[1]..':'..cur)
redis.call('EXPIRE', KEYS[1]..':'..cur, window * 2)
return {1, c + 1}                                              -- allowed
```

A token bucket works the same way (store `tokens` and `lastRefill` in a hash, refill lazily in the script). For strict low-volume limits (logins), a **sliding log** in a sorted set (`ZREMRANGEBYSCORE` + `ZCARD` + `ZADD`) is exact.

### B. Sharding and hot keys

- Keys are `rl:{identity}:{scope}`; Redis Cluster shards them by hash slot. Using a **hash tag** (`rl:{k_77}:…`) keeps all of one identity's windows on one shard, so the script can touch them atomically.
- A **hot identity** (one huge customer, or one IP under attack) concentrates load on one shard. Mitigations: (1) handle attack IPs at the edge first; (2) give the biggest tenants **local token buckets**: each gateway gets a share of the tenant's limit and refills it from Redis in batches ("I'll take 500 tokens"), turning 1 M Redis calls into a few thousand; (3) split a tenant's counter into N sub-keys and sum on read.

### C. Trading accuracy for speed: local approximation

At extreme volumes, even one Redis round trip per request is too much. Options:

- **Local counters + periodic sync**: each gateway counts locally and pushes deltas to Redis every 100 ms; decisions use local count + last known global count. Error is bounded by the sync interval × traffic.
- **Static partitioning**: with N gateways, each enforces limit / N locally (no shared state). Error grows when traffic is uneven across gateways (sticky load balancing reduces it).
- **Batch token leasing** (above).

```js run title="Why per-instance limits drift: local limit/N vs a shared counter"
// 10 gateways; a client's limit is 100 req/min. The load balancer spreads its traffic unevenly.
let seed = 9;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const N = 10, LIMIT = 100, REQUESTS = 120;

const sharedCount = { value: 0 };
const local = new Array(N).fill(0);
let allowedShared = 0, allowedLocal = 0;
for (let i = 0; i < REQUESTS; i++) {
  const gw = Math.min(N - 1, Math.floor(Math.pow(rand(), 3) * N));   // skewed: low-numbered gateways get most traffic
  if (sharedCount.value < LIMIT) { sharedCount.value++; allowedShared++; }          // central (Redis) check
  if (local[gw] < LIMIT / N) { local[gw]++; allowedLocal++; }                        // static limit/N per gateway
}
console.log(`shared counter allowed ${allowedShared} (exactly the limit of ${LIMIT})`);
console.log(`per-gateway limit/N allowed only ${allowedLocal}: busy gateways hit their 10 while idle ones waste their share`);
console.log("traffic per gateway:", local.map((n, i) => `gw${i}:${n}`).join(" "));
```

### D. Failure modes

- **Redis slow or down**: put a tight **timeout** (a few ms) on the limiter call and a **circuit breaker** around it. When open: **fail open** for general API limits (availability matters more than perfect limiting; optionally fall back to coarse local limits), **fail closed** for security-sensitive limits (login attempts, OTP sends, payment attempts).
- **Redis failover** may lose recent increments (async replication): a brief over-allowance, acceptable for rate limits.
- **Clock skew** between gateways: compute windows with the **Redis server's time** (`TIME` inside the script) or pass a single time source.

### E. Multi-region

Global limits across regions would need a cross-region round trip per request, too slow. Common choices: limits **per region** (each region gets a share), or local enforcement with **asynchronous** cross-region aggregation (a small, temporary over-allowance), or route each tenant to a **home region** for limiting.

### F. Client contract

```text
HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1767225660
```

Document the limits, return them on **every** response (not only 429s) so clients can pace themselves, and expect well-behaved clients to back off with jitter.

## 6. Wrap-up

The design: limiter middleware in the gateway; rules cached from a config service; a sharded Redis cluster holding counters, updated with one atomic Lua script per check; sliding window counter or token bucket for general limits, sliding log for strict ones; local token leasing for hot tenants; timeouts + circuit breaker with per-rule fail-open/closed; per-region limits. Monitor allowed/rejected counts per rule, limiter latency, Redis CPU per shard (hot keys), and fallback activations.

```quiz
? Why run the rate-limit decision as a Lua script in Redis rather than GET, compare, then INCR from the gateway?
+ The script executes atomically on the Redis node, so concurrent gateways can't both read the same count and over-allow; it's also one round trip
- Lua is faster than C
- Redis can't run INCR from clients
> Atomic read-decide-write is the whole point; separate commands race.

? Redis is unreachable. What should the limiter do for (a) a general API limit and (b) a login-attempt limit?
+ (a) fail open (maybe with a coarse local limit); (b) fail closed
- Fail closed for both
- Fail open for both
> Availability first for general traffic; security first for brute-force protection.

? One enterprise customer sends 300K requests/s, all hitting one Redis key. What's an effective mitigation?
+ Local token leasing: each gateway takes batches of tokens from Redis and decides locally, cutting Redis calls by orders of magnitude
- Increase the limit
- Use a bigger Redis instance only
> Batching turns per-request coordination into occasional coordination, with a small bounded error.
```

:::keypoints
- Run the limiter as **gateway middleware** (plus coarse IP limits at the edge) with **rules cached** from a config service.
- Counters in a **sharded Redis cluster**; each check is **one atomic Lua script** (sliding window counter / token bucket; sorted-set log for strict limits); hash tags keep an identity on one shard.
- Hot identities: edge filtering, **local token leasing**, split counters. Extreme scale: local counters with periodic sync (bounded error).
- Failures: tight timeouts + circuit breaker; **fail open** for general limits, **fail closed** for security limits; use one time source.
- Multi-region: per-region limits or async aggregation; return rate-limit headers on every response.
:::
