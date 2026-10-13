---
title: Reliability — Errors, Retries, Timeouts and Fallbacks
level: intermediate
time: 45
summary: LLM APIs fail often and in different ways. Learn the error taxonomy, which errors to retry, exponential backoff with jitter, honouring retry-after, timeouts and deadlines, idempotency, client-side rate limiting, circuit breakers and model fallbacks — each built and run against a simulated flaky API.
---

If your product depends on one API call, it is only as reliable as that call. LLM providers have rate limits, overload spikes, slow tails and the occasional outage. The difference between a demo and a product is a **resilience layer** around every model call.

## The error taxonomy

| Status | Meaning | Retry? | What to do |
|---|---|---|---|
| **400** | Bad request (invalid parameters, too many tokens) | No | Fix the request. A retry will fail identically. |
| **401 / 403** | Bad key or no permission | No | Alert; check secrets and plan limits. |
| **404** | Unknown model or resource | No | Often a deprecated or misspelled model name. |
| **413** | Request too large | No | Truncate or chunk the input. |
| **429** | Rate limited (too many requests or tokens) | **Yes**, after waiting | Respect `retry-after`; back off; slow the sender. |
| **500 / 502 / 503** | Provider-side failure | **Yes** | Retry with backoff; fail over if persistent. |
| **529** (and similar "overloaded") | Provider is overloaded | **Yes** | Backoff; consider a fallback model. |
| **Timeout / connection reset** | Network or very slow generation | **Yes**, carefully | Retry once or twice; stream long outputs. |
| `stop_reason: max_tokens` / `refusal` | Not an HTTP error | Depends | Handle explicitly (earlier lesson). |

:::tip The SDK already retries
The official Anthropic SDK retries connection errors, 408, 409, 429 and 5xx with exponential backoff, by default **twice**. Configure it (`max_retries`, `timeout`) before writing your own loop, and write custom logic only for behaviour the SDK does not provide: deadlines across multiple calls, fallbacks, circuit breakers, and queueing.
:::

## Exponential backoff with jitter

When a service is struggling, retrying immediately makes it worse. **Exponential backoff** waits longer after each failure (1 s, 2 s, 4 s, ...). **Jitter** adds randomness so a thousand clients do not all retry at the same instant (a "thundering herd").

:::formula Full-jitter backoff
\text{sleep} = \text{random}(0,\; \min(\text{cap},\; \text{base} \cdot 2^{\text{attempt}}))
:::

```python run title="Retry with backoff and jitter against a flaky API" level=intermediate
import random

class FlakyAPI:
    """Fails with 429/503 a while, then recovers. Deterministic via a seed."""
    def __init__(self, fail_first=3, seed=0):
        self.calls, self.fail_first = 0, fail_first
        self.rng = random.Random(seed)
    def call(self):
        self.calls += 1
        if self.calls <= self.fail_first:
            raise RuntimeError(self.rng.choice(["429 rate limited", "503 unavailable"]))
        return "ok"

def call_with_retry(api, max_retries=5, base=1.0, cap=30.0, seed=1):
    rng = random.Random(seed)
    waited = 0.0
    for attempt in range(max_retries + 1):
        try:
            return api.call(), attempt, waited
        except RuntimeError as e:
            retryable = str(e).startswith(("429", "5"))
            if not retryable or attempt == max_retries:
                raise
            delay = rng.uniform(0, min(cap, base * 2 ** attempt))     # full jitter
            waited += delay                                           # (a real client would time.sleep(delay))
            print(f"  attempt {attempt + 1} failed ({e}); sleeping {delay:.2f}s")
    raise AssertionError

result, attempts, waited = call_with_retry(FlakyAPI(fail_first=3))
print(f"result={result} after {attempts} retries, {waited:.2f}s of waiting")

try:
    call_with_retry(FlakyAPI(fail_first=99), max_retries=2)
except RuntimeError as e:
    print("gave up:", e)
```

**Retry only what is retryable, and cap the attempts.** A 400 retried five times is five wasted calls; unbounded retries can melt the provider and your budget.

### Honour `retry-after`

On a 429, providers often send a `retry-after` header (seconds). Use `max(computed_backoff, retry_after)`. The SDK exposes it: `e.response.headers.get("retry-after")`.

## Timeouts and deadlines

- Set a **timeout** on every request. The default can be ten minutes; that is far too long for a user-facing call. Prefer streaming and a **time-to-first-token** timeout (if nothing arrives in a few seconds, the connection is probably stuck).
- Use an **overall deadline** per user action ("answer within 20 s total"), passed down through retries and fallbacks, so three retries do not add up to a minute.
- Remember wall-clock grows with retries: with a 30 s timeout and 2 retries, a single call can take 90+ s.

```python run title="A deadline shared across retries and fallbacks" level=intermediate
import time

class Deadline:
    def __init__(self, seconds, clock):
        self.end, self.clock = clock() + seconds, clock
    def remaining(self):
        return max(0.0, self.end - self.clock())

# a fake clock so the demo is instant and deterministic
now = [0.0]
clock = lambda: now[0]

def attempt(model, duration, fails):
    now[0] += duration                        # the call takes `duration` seconds
    if fails:
        raise TimeoutError(f"{model} timed out")
    return f"answer from {model}"

deadline = Deadline(20, clock)
plan = [("primary", 8, True), ("primary-retry", 8, True), ("fallback-small", 3, False)]
for model, dur, fails in plan:
    if deadline.remaining() < dur:
        print(f"skip {model}: only {deadline.remaining():.0f}s left"); continue
    try:
        print(attempt(model, dur, fails), f"(at t={now[0]:.0f}s)")
        break
    except TimeoutError as e:
        print(f"{e} (at t={now[0]:.0f}s, {deadline.remaining():.0f}s remaining)")
```

## Idempotency: retrying without double effects

Retrying a pure "generate text" call is harmless. Retrying a call that **caused a side effect** (sent an email, charged a card, created a ticket through a tool) can do it twice. Make side effects **idempotent**: give each logical action a unique key and have your tool layer ignore a repeat. The next lessons on tools return to this.

## Client-side rate limiting

Do not wait for a 429. Shape your own traffic with a **token bucket** that refills at the allowed rate, and queue the rest.

```python run title="A token-bucket limiter for tokens per minute" level=intermediate
class TokenBucket:
    def __init__(self, capacity, refill_per_sec, now=0.0):
        self.capacity, self.rate, self.tokens, self.t = capacity, refill_per_sec, capacity, now
    def allow(self, cost, now):
        self.tokens = min(self.capacity, self.tokens + (now - self.t) * self.rate)
        self.t = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False

# limit: 60,000 input tokens per minute -> refill 1,000 tokens per second, burst up to 60,000
bucket = TokenBucket(capacity=60_000, refill_per_sec=1_000)
requests = [(0, 20_000), (1, 20_000), (2, 20_000), (3, 20_000), (4, 20_000), (30, 20_000), (31, 20_000)]
for t, cost in requests:
    print(f"t={t:>2}s request of {cost:,} tokens ->", "send" if bucket.allow(cost, t) else "queue/wait")
```

## Circuit breaker

If a provider is down, hammering it wastes time and money, and every user waits for a timeout. A **circuit breaker** notices repeated failures and **fails fast** for a cool-down period, then lets a single probe through.

:::flow Circuit breaker states
Closed | normal: calls go through, failures are counted
Open | too many failures: reject instantly (use the fallback)
Half-open | after a cool-down, allow one trial call
Closed again | the trial succeeded; resume normal traffic
:::

```python run title="A circuit breaker with a fallback" level=advanced
class Breaker:
    def __init__(self, threshold=3, cooldown=10):
        self.threshold, self.cooldown = threshold, cooldown
        self.failures, self.opened_at, self.state = 0, None, "closed"
    def call(self, fn, fallback, now):
        if self.state == "open":
            if now - self.opened_at >= self.cooldown:
                self.state = "half-open"
            else:
                return fallback(), "fallback (breaker open)"
        try:
            out = fn()
        except Exception:
            self.failures += 1
            if self.state == "half-open" or self.failures >= self.threshold:
                self.state, self.opened_at = "open", now
            return fallback(), "fallback (call failed)"
        self.failures, self.state = 0, "closed"
        return out, "primary ok"

provider_up = {"value": False}
def primary():
    if not provider_up["value"]:
        raise ConnectionError("provider down")
    return "big-model answer"
fallback = lambda: "small-model answer"

b = Breaker(threshold=3, cooldown=10)
for t in range(0, 26, 2):
    if t == 16:
        provider_up["value"] = True                  # the provider recovers at t=16
    out, why = b.call(primary, fallback, t)
    print(f"t={t:>2}s state={b.state:9} -> {out:20} [{why}]")
```

## Fallback chains

Plan what happens when the primary model is unavailable or too slow:

1. **Retry** the same model (transient errors).
2. **Fall back to another tier or provider** with a prompt that works on both (test it!).
3. **Degrade gracefully**: cached answer, a shorter canned response, or "try again" with the partial result.
4. **Queue** non-interactive work and process it later (or via the batch API).

:::warn A fallback model is a different model
Prompts that work on one model may behave differently on another: different formats, tool habits and refusals. Include the fallback in your **eval suite**, and keep its quality within an acceptable range, or tell the user.
:::

## What to log for every call

`request_id`, model, latency (TTFT and total), input / output / cached tokens, stop reason, retry count, error type, and a **trace id** that ties it to the user action. Without these you will debug blind.

```quiz
? Which status should you NOT retry?
- 429
- 503
+ 400
> A 400 means your request is invalid; retrying changes nothing. Fix it.

? What does jitter prevent?
- Timeouts
+ Many clients retrying at the same instant after a failure (a thundering herd)
- Rate limits entirely
> Randomising the wait spreads retries out.

? Why can retrying a tool call be dangerous?
- It uses more tokens
+ If the tool had a side effect (email, payment), a retry may repeat it unless it is idempotent
- Tools cannot be retried
> Use idempotency keys for side-effecting actions.

? What does an open circuit breaker do?
+ Fails fast and routes to a fallback instead of calling the struggling service
- Retries more aggressively
- Increases the timeout
> It protects both the provider and your users from long waits.
```

:::problem Design the reliability layer for a customer-facing chatbot that must respond in under 10 seconds 99% of the time. {level=medium tags="reliability,design"}
List the mechanisms and how they interact.

:::solution Model answer
Stream the answer; set a **TTFT timeout** (~3 s) and an **overall deadline** (~10 s). Use SDK retries for transient errors with backoff + jitter, honouring `retry-after`, but stop retrying when the remaining deadline cannot fit another attempt. Add a **circuit breaker** per provider/model that opens after repeated failures, with a **fallback** to a smaller or alternate-provider model (in the eval suite). **Client-side token buckets** and a queue keep traffic under rate limits; autoscale or request higher limits. Log request ids, latency percentiles, retries and fallbacks; alert on error rate and p99 latency. Degrade gracefully (cached/FAQ answer) when everything fails. Test with fault injection.
:::
:::

:::keypoints
- Classify errors: 4xx (except 429) are your bug; 429 and 5xx are retryable with backoff; handle `max_tokens` and `refusal` too.
- Exponential backoff plus jitter, a retry cap, and `retry-after`; the SDK already does the basics.
- Timeouts everywhere, plus an overall deadline so retries and fallbacks cannot add up.
- Make side-effecting tool calls idempotent; rate-limit yourself with token buckets and queues.
- Circuit breakers and tested fallbacks keep the product up when a provider is not.
:::

:::resources
- [Claude docs: Errors and rate limits](https://docs.claude.com/en/api/errors) — status codes and how limits work.
- [AWS Architecture Blog: Exponential backoff and jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — the canonical explanation of why jitter matters.
- [Martin Fowler: Circuit breaker](https://martinfowler.com/bliki/CircuitBreaker.html) — the pattern, concisely.
- [LiteLLM](https://github.com/BerriAI/litellm) and [Portkey gateway](https://github.com/Portkey-AI/gateway) — open-source gateways with retries and fallbacks built in.
- [Tenacity](https://github.com/jd/tenacity) — a Python retry library.
- [Anthropic SDK: retries and timeouts](https://github.com/anthropics/anthropic-sdk-python) — see the "Retries" and "Timeouts" sections of the README.
:::
