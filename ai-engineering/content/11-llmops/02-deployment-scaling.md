---
title: Deployment, Scaling and Rate Limits
level: advanced
time: 40
summary: Scaling LLM apps whose slowest dependency is a rate-limited remote model. Concurrency and Little's law, token-based rate limits and 429 handling, backoff with jitter, queues and backpressure, autoscaling on the right signal, multi-provider failover and circuit breakers, region and data-residency choices, and serverless versus long-running containers for streaming. With runnable token-bucket and backoff simulations.
---

A normal web service scales on CPU and memory. An LLM application is usually **I/O bound on a slow, expensive, rate-limited dependency**: each request holds a connection for seconds (or minutes for agents) while a remote model generates tokens. That changes how you think about concurrency, limits, queues and failure.

## Concurrency and Little's law

**Little's law**: average number of requests in flight = arrival rate × average time in the system.

If 50 requests per second arrive and each takes 8 seconds to stream, you hold **400 concurrent connections**. Your servers, load balancer, database pool and the provider's concurrency limits must all handle that, even though CPU use is tiny.

```python run title="Little's law and what slow generations do to your connection count" level=easy
for rps, seconds in [(5, 2), (50, 8), (50, 30), (200, 8), (20, 120)]:
    inflight = rps * seconds
    print(f"{rps:>4} req/s x {seconds:>3}s per request = {inflight:>5} concurrent connections")
print("\nrule of thumb: size connection pools, file descriptors and worker concurrency for requests-in-flight, not for CPU")
```

Consequences:

- Use **async I/O** (asyncio, Node, Go) so one process can hold thousands of idle connections cheaply. Thread-per-request designs fall over.
- **Timeouts** at every hop must exceed the longest legitimate generation (and load balancer idle timeouts are a classic gotcha for streaming).
- Long-running agent tasks do not belong on request-response HTTP: use **jobs with status endpoints or events**.

## Provider rate limits

LLM providers limit **requests per minute** and **tokens per minute** (input and output counted separately or together), per model and per organisation tier; some also limit **concurrent requests**. Exceeding them returns **HTTP 429** (sometimes with a `retry-after` header), and overload can return 5xx/529-style errors.

Design rules:

1. **Budget tokens, not just requests.** One request with a 100K-token context uses as much quota as hundreds of small ones.
2. **Client-side limiter** in front of the provider so you queue gracefully instead of bouncing off 429s.
3. **Honour `retry-after`** when present, otherwise use **exponential backoff with jitter**.
4. **Per-tenant fairness**: one noisy customer must not consume everyone's quota.
5. **Priorities**: reserve capacity for interactive traffic; push batch to lower priority or the batch API.

```python run title="Token bucket: smoothing bursts under a tokens-per-minute limit" level=intermediate
class TokenBucket:
    def __init__(self, rate_per_s, burst):
        self.rate, self.capacity, self.tokens, self.t = rate_per_s, burst, burst, 0.0
    def allow(self, now, cost):
        self.tokens = min(self.capacity, self.tokens + (now - self.t) * self.rate)   # refill since last call
        self.t = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False

# limit: 60,000 tokens per minute = 1000 per second, burst of 5000
bucket = TokenBucket(rate_per_s=1000, burst=5000)
arrivals = [(0.0, 3000), (0.1, 3000), (0.2, 500), (1.0, 3000), (2.5, 4000), (2.6, 2000), (4.0, 1000)]    # (time s, request tokens)
for t, cost in arrivals:
    ok = bucket.allow(t, cost)
    print(f"t={t:>4}s request of {cost:>5} tokens -> {'send' if ok else 'queue/delay'}   bucket now {bucket.tokens:>6.0f}")
```

## Backoff with jitter

When many clients fail together (a provider blip) and all retry at fixed intervals, they re-synchronise and hammer the service. **Exponential backoff** spaces retries out; **jitter** de-synchronises them.

```python run title="Why jitter matters: retry storms with and without it" level=advanced
import random

def simulate(jitter, clients=200, capacity_per_slot=40, slots=24, seed=0):
    rnd = random.Random(seed)
    next_try = {c: 0 for c in range(clients)}              # all clients start at slot 0 (say, right after an outage)
    attempts = {c: 0 for c in range(clients)}
    done, load = set(), []
    for slot in range(slots):
        trying = [c for c in range(clients) if c not in done and next_try[c] == slot]
        load.append(len(trying))
        for c in trying[:capacity_per_slot]:                # the server handles only so many requests per slot
            done.add(c)
        for c in trying[capacity_per_slot:]:                # the rest fail and back off exponentially
            attempts[c] += 1
            window = 2 ** attempts[c]
            next_try[c] = slot + (rnd.randint(1, window) if jitter else window)
    return load, len(done)

for jitter in (False, True):
    load, finished = simulate(jitter)
    print(f"jitter={jitter!s:5} finished {finished:>3}/200 in 24 slots | retry load per slot: {load[1:]}")
print("\nwithout jitter, the failed clients return together in big waves (the same spikes again and again);")
print("with jitter their retries spread out: the peak retry load is about half as high, and all 200 finish within 24 slots")
```

Retry **only transient errors** (429, timeouts, 5xx), never 4xx validation errors. Make retried operations **idempotent** (especially tool calls with side effects), cap total attempts and total time, and avoid retrying at several layers at once (retry amplification: 3 layers × 3 tries = 27 calls).

## Queues and backpressure

For anything not strictly interactive, put a **queue** between the API and the workers:

- The queue **absorbs bursts** and lets workers consume at the rate the provider allows.
- **Backpressure**: when the queue grows beyond a threshold, shed load (reject with 429/503, degrade to a cheaper path, or ask users to wait) rather than letting latency explode.
- **Dead-letter queues** hold jobs that keep failing for inspection.
- **Prioritise**: interactive > paid tier > free tier > batch.
- Track **queue depth and age of oldest job** as primary health signals.

## Autoscaling on the right signal

CPU is a poor signal for I/O-bound LLM services. Better:

| Service | Scale on |
|---|---|
| Stateless API/orchestrator | **in-flight requests / connections** per instance, or queue depth |
| Background workers | **queue depth and oldest message age** |
| Self-hosted model servers (GPU) | **queue length, KV-cache utilisation, time-to-first-token SLO** (see the inference module); GPU capacity is slow and expensive to add, so keep headroom and use scheduled scaling for known peaks |

Cold starts matter: container start plus **model weight loading** can take minutes on GPU nodes. Keep a warm pool, pre-pull images, and cache weights on fast local storage.

## Multi-provider resilience

Providers have outages and capacity events. Options, from simple to elaborate:

1. **Retries and timeouts** against one provider.
2. **Fallback model** (a smaller or alternative model on the same provider) for degraded service.
3. **Fallback provider** behind your model client interface, with prompts tested on both (output differences are real; run your evals on the fallback too).
4. **Circuit breaker**: after N failures in a window, stop calling the failing route for a cool-down period and send traffic elsewhere; probe periodically to recover.
5. **Cloud marketplaces** (the same model family via different clouds) for capacity and compliance options.

```python run title="A circuit breaker that fails over to a fallback model" level=advanced
class CircuitBreaker:
    def __init__(self, threshold=3, cooldown=5.0):
        self.threshold, self.cooldown, self.failures, self.opened_at = threshold, cooldown, 0, None
    def available(self, now):
        if self.opened_at is None: return True
        if now - self.opened_at >= self.cooldown: return True        # half-open: let one probe through
        return False
    def record(self, ok, now):
        if ok: self.failures, self.opened_at = 0, None
        else:
            self.failures += 1
            if self.failures >= self.threshold: self.opened_at = now

primary = CircuitBreaker(threshold=3, cooldown=5.0)
primary_up = lambda t: not (2 <= t < 9)                                 # simulated outage from t=2 to t=9
for t in range(0, 14):
    if primary.available(t):
        ok = primary_up(t); primary.record(ok, t)
        route = "primary " + ("ok" if ok else "FAILED -> fallback")
    else:
        route = "fallback (circuit open)"
    print(f"t={t:>2}s  {route}")
```

## Where to run it

| Platform | Good for | Watch out for |
|---|---|---|
| **Serverless functions** | bursty, short, non-streaming work | execution time limits, streaming support, cold starts, concurrency limits |
| **Containers on a managed platform** (Cloud Run, ECS/Fargate, Kubernetes) | most LLM backends: long-lived streaming, async I/O | connection limits, load balancer timeouts, scaling on in-flight requests |
| **Edge** | auth, caching, routing in front of the app | limited runtime, small CPU/memory |
| **GPU clusters** (self-hosting) | high-volume, privacy-sensitive, fine-tuned models | utilisation economics, ops burden (inference module) |

**Region and residency**: put compute near users and near the model endpoint (latency), and honour **data-residency** rules (choose regional endpoints or zero-retention terms when contracts or law require). Know where logs and traces are stored too.

## Release safety

Roll out changes gradually: **canary** a small percentage of traffic, compare quality, latency, cost and error metrics against the baseline, then ramp or roll back. Keep **kill switches** (feature flags) for risky features such as agent tool use. Run **load tests** with realistic token lengths and streaming, including provider-failure drills.

```quiz
? 50 requests per second each stream for 8 seconds. How many requests are in flight on average?
+ 400 (Little's law: rate × time)
- 50
- 8
> Plan connection pools and concurrency for in-flight requests.

? Why add jitter to exponential backoff?
+ To de-synchronise clients so they do not all retry at the same moment and overload the service again
- To make retries faster
- To avoid logging
> Jitter prevents retry storms.

? Which metric is usually the best autoscaling signal for background LLM workers?
+ Queue depth and age of the oldest message
- CPU temperature
- Disk size
> Workers are I/O bound; the queue shows real demand.

? What does a circuit breaker do?
+ Stops calling a failing dependency for a cool-down period and routes to a fallback, probing later to recover
- Encrypts traffic
- Caches answers
> It prevents wasting time and quota on a dependency that is down.
```

:::problem Your assistant works fine in testing but in production you see bursts of 429s every few minutes and tail latencies of 40 s. Diagnose likely causes and propose fixes. {level=hard tags="scaling,rate-limits"}
Consider token usage, retries and fairness.

:::solution Model answer
Likely causes: (1) a few requests with huge contexts or max_tokens consume the **tokens-per-minute** quota, so other requests are rejected; (2) **synchronised retries** (no jitter) amplify bursts; (3) **retries at several layers** multiply load; (4) batch jobs share the same quota as interactive traffic; (5) one tenant dominates; (6) no client-side limiter, so spikes hit the provider directly. Fixes: add a **token-aware client-side rate limiter and queue** with priorities (interactive reserved), honour retry-after, add backoff with jitter and a single retry layer, cap context and max_tokens per request, move batch to the batch API, add per-tenant quotas, request higher limits or a second provider/route with fallback and a circuit breaker, and monitor 429 rate, queue depth, tokens per minute and p95/p99 latency. Verify with a load test using production-like token sizes.
:::
:::

:::keypoints
- LLM apps are I/O bound on a slow remote model: size for requests in flight (Little's law), use async I/O and long timeouts.
- Rate limits are in tokens as well as requests: use a client-side limiter, honour retry-after, backoff with jitter, per-tenant fairness and priorities.
- Queues absorb bursts; apply backpressure and use dead-letter queues; scale workers on queue depth and age.
- Add fallbacks and circuit breakers across models and providers, and re-run evals on the fallback.
- Roll out with canaries, flags and load tests; mind region, residency and cold starts.
:::

:::resources
- [Claude docs: Rate limits](https://docs.claude.com/en/api/rate-limits) — how limits and tiers work.
- [AWS Architecture Blog: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — the classic analysis.
- [Google SRE Book: Handling Overload](https://sre.google/sre-book/handling-overload/) — load shedding and graceful degradation.
- [Google SRE Book: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/) — retries, timeouts and failure propagation.
- [Kubernetes HPA docs](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) — autoscaling on custom metrics.
- [LiteLLM docs](https://docs.litellm.ai) — an open-source gateway with routing, fallbacks and budgets.
:::
