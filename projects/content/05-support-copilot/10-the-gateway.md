---
title: The gateway
level: advanced
time: 65
summary: Every model call goes through one gateway that adds what production needs: a rate limit, a daily budget, a cache, retries with backoff, a fallback model, a circuit breaker and timeouts. It speaks the same interface as a model, so nothing else knows it is there. A fake clock lets you watch retries, outages and recoveries in an instant.
tags: reliability, rate limiting, caching, retries, circuit breaker, cost control
---

Calling a model from a script is easy. Calling it from a system that people depend on is a different job. Models are remote services: they are slow sometimes, they fail sometimes, they rate-limit you, and every call costs money. A bug that loops, or a user who clicks fifty times, can spend a month's budget in an afternoon.

You can scatter `try/except` and `time.sleep` around every call. Or you can put all of that in **one place**, once, tested: a **gateway**.

## The idea

```text
the pipeline -> [ GATEWAY: limit, budget, cache, retry, fallback, breaker, timeout ] -> Claude (or the offline model)
```

The gateway has the **same interface as a model client** (`complete_json` and `stream_text`), so the pipeline calls it exactly as it would call Claude. That means:

- the pipeline is unchanged, whether or not a gateway exists;
- you can test the pipeline with a fake model and the gateway with a fake clock;
- every model call in the application is forced through the same safety net.

## A clock you can control

Reliability code is about **time**: "retry after 0.4 seconds", "open the breaker for 20 seconds", "reset the budget tomorrow". Code that reads the real clock can only be tested by waiting. So time is an object:

```python src="support-pilot/backend/app/gateway.py" region="clock" title="backend/app/gateway.py"
```

`FakeClock.sleep` does not wait: it moves time forward instantly and records how long it was asked to sleep. A test for "retry with growing pauses" runs in microseconds and can assert on the pauses.

## Admission: should this call happen at all?

```python src="support-pilot/backend/app/gateway.py" region="limits" title="backend/app/gateway.py"
```

**Rate limit: a token bucket.** Each person has a bucket that holds up to `per_minute` tokens and refills steadily. A call takes one token. A burst is fine (the bucket is full), a sustained flood is not (it empties), and when it is empty the limiter says **how long to wait** ("try again in 20 seconds"), which is much more useful than "no".

**Budget: money per person per day.** After every call the gateway charges its cost (tokens times the model's price). When a person's day total reaches the limit, further calls are refused with a clear, non-retryable error until tomorrow. This is the wall that a runaway loop or a stolen token hits instead of your credit card.

Both are **per user**, because the gateway is bound to the signed-in person (`gateway.bind(user.name)`). One enthusiastic agent cannot use up everyone's allowance.

## A cache for repeated questions

```python src="support-pilot/backend/app/gateway.py" region="cache" title="backend/app/gateway.py"
```

Triage is a pure function of the ticket text: the same text gives the same category. If an agent presses *Draft again* on an unchanged ticket, there is no need to pay for the same answer twice, and the cache makes it free and instant. The key is a **hash of everything that affects the answer** (model, system prompt, messages, schema, hints), so a change to any of them is a cache miss. Entries expire (`ttl`), and the cache keeps a bounded number of items, evicting the least recently used.

We cache **JSON calls only**, not the streamed draft: replies depend on facts that can change, and a stale draft is worse than a fresh one.

## Resilience: retry, fall back, break the circuit

```python src="support-pilot/backend/app/gateway.py" region="gateway-json" title="backend/app/gateway.py"
```

Read `complete_json` from top to bottom:

1. **Cache first.** A hit returns immediately, flagged `cached=True`, with zero usage.
2. **Admit.** Rate limit and budget; either can refuse with a typed `LLMError`.
3. **For each provider** (the main model, then the fallback):
   - If its **circuit breaker** is open, skip it without calling.
   - Try up to `attempts` times. A **timeout** (`asyncio.wait_for`) counts as a failure.
   - A **non-retryable** error (bad request, bad key) is raised at once: retrying cannot fix it, and falling back would only repeat it.
   - A retryable error waits, then retries.
4. If every provider failed, raise `provider_unavailable`.

### Backoff with jitter

```python
await self.clock.sleep(self.base_delay * 2 ** attempt * (0.5 + self.rng.random()))
```

Each retry waits **twice as long** as the previous one (0.2 s, 0.4 s, 0.8 s...), so a struggling provider gets room to recover. The random factor between 0.5 and 1.5 is **jitter**: without it, a hundred clients that failed together would all retry together, and knock the provider over again.

### The circuit breaker

```python src="support-pilot/backend/app/gateway.py" region="breaker" title="backend/app/gateway.py"
```

If a provider has failed several times in a row, retrying more is pointless and slow: every request would wait through its full retry cycle. A breaker **stops calling** it for a cool-down. The states:

```text
closed --(N failures in a row)--> open --(cool-down passes)--> half-open
   ^                                                              |
   +------------ success: close again ------------------ one trial call
                  failure: back to open
```

While open, calls skip straight to the fallback (or fail fast). After the cool-down, exactly **one** trial call tests whether the provider is back.

### Streams are different

```python src="support-pilot/backend/app/gateway.py" region="gateway-stream" title="backend/app/gateway.py"
```

A stream **cannot be taken back**. If the connection breaks *before the first word*, retrying or falling back is invisible to the user, so the gateway does it. But once words have been shown, switching to another model mid-sentence would produce nonsense, so the error ends the reply, and the pipeline reports it. (The `started` flag is that difference.)

## Bound to a person

```python src="support-pilot/backend/app/gateway.py" region="bound" title="backend/app/gateway.py"
```

`bind(user)` returns a tiny wrapper with the model-client interface. This is how the pipeline, which only knows `llm.complete_json(...)`, gets per-user limits without a `user` argument threaded through every function.

## Watch it work

Every behaviour above, in one block. The clock is fake, so a "20 second cool-down" takes no time, and you can see exactly how long each retry *would* have waited.

```python run src="support-pilot/backend/app/pricing.py,support-pilot/backend/app/llm/base.py,support-pilot/backend/app/gateway.py" flat title="Retries, fallback, breaker, cache, limits and budget" level=advanced
import asyncio, random


class Model:
    """A fake model. It fails `fail` times, then answers. Counts its calls."""

    def __init__(self, name, model="claude-sonnet-5-5", fail=0):
        self.name, self.model, self.fail, self.calls = name, model, fail, 0

    async def complete_json(self, *, system, messages, schema, max_tokens, hints=None):
        self.calls += 1
        if self.calls <= self.fail:
            raise LLMError("provider_down", "The model provider had a problem.", retryable=True)
        return JsonResult('{"ok": true}', Usage(1000, 200))


def call(system="s"):
    return dict(system=system, messages=[{"role": "user", "content": "hi"}], schema={}, max_tokens=100)


async def main():
    print("1. A flaky provider: two failures, then success, with growing pauses")
    clock = FakeClock()
    main_model = Model("claude", fail=2)
    gw = Gateway(main_model, clock=clock, rng=random.Random(7))
    r = await gw.complete_json("asha", **call())
    print(f"   answered after {r.attempts} tries; pauses before retries: {clock.slept} seconds")

    print("\n2. The main model is down for good: the fallback answers")
    gw = Gateway(Model("claude", fail=99), Model("haiku", "claude-haiku-5-5"), clock=FakeClock(), rng=random.Random(7))
    r = await gw.complete_json("asha", **call())
    print(f"   answered by {r.model} after {r.attempts} tries; fallbacks so far: {gw.stats['fallbacks']}")

    print("\n3. The circuit breaker: after repeated failures, stop calling the broken provider")
    down, backup, clock = Model("claude", fail=99), Model("haiku", "claude-haiku-5-5"), FakeClock()
    gw = Gateway(down, backup, clock=clock, breaker_failures=3, rng=random.Random(7))
    await gw.complete_json("asha", **call("first"))
    print(f"   request 1 called the broken model {down.calls} times; breaker is now {gw.breakers[id(down)].state}")
    await gw.complete_json("asha", **call("second"))
    print(f"   request 2 never touched it: calls still {down.calls}, answered by the fallback")
    clock.advance(20)
    print(f"   20 seconds later the breaker is {gw.breakers[id(down)].state}: one trial call is allowed")

    print("\n4. The cache: the same question twice costs one call")
    model = Model("claude")
    gw = Gateway(model, clock=FakeClock())
    a, b = await gw.complete_json("asha", **call()), await gw.complete_json("ravi", **call())
    print(f"   model calls: {model.calls}; second answer cached={b.cached}, tokens charged={b.usage.input_tokens + b.usage.output_tokens}")

    print("\n5. The rate limit: 3 calls a minute, then it says how long to wait")
    gw = Gateway(Model("claude"), clock=FakeClock(), per_minute=3)
    for i in range(5):
        try:
            await gw.complete_json("asha", **call(f"q{i}"))
            print(f"   call {i + 1}: ok")
        except LLMError as e:
            print(f"   call {i + 1}: refused ({e.code}): {e.message}")

    print("\n6. The daily budget: spend past it and the next call is refused until tomorrow")
    clock = FakeClock()
    gw = Gateway(Model("claude"), clock=clock, daily_budget_usd=0.003)
    for i in range(5):
        try:
            await gw.complete_json("asha", **call(f"b{i}"))
            print(f"   call {i + 1}: ok, spent ${gw.budget.used('asha'):.4f}")
        except LLMError as e:
            print(f"   call {i + 1}: refused ({e.code})")
            break
    clock.advance(86400)
    await gw.complete_json("asha", **call("tomorrow"))
    print("   the next day: ok again")

asyncio.run(main())
```

Check each number against the idea. In 1, the first pause is between 0.1 and 0.3 seconds and the second between 0.2 and 0.6 (base 0.2, doubled, with jitter). In 3, request 2 makes **zero** calls to the broken model. In 6, the budget wall is crossed *by* a call, so the next one is refused (a budget is checked before a call, and charged after).

## What the gateway does not do

| Not covered | Why it matters |
|---|---|
| **Sharing state across servers** | the rate limit, budget and breaker here live in one process's memory. With several servers, use a shared store (Redis) or a gateway service |
| **Spending a budget before knowing the cost** | we charge after the call; a very long answer can overshoot slightly |
| **Streaming cache or partial results** | not worth it for text that depends on live facts |
| **Smart routing** | sending easy tickets to a cheap model and hard ones to a strong one needs a rule or a classifier on top |

Each of these is a reasonable next step, and each would be added **inside the gateway**, which is the point of having one.

## Tests

```python src="support-pilot/backend/tests/test_gateway.py" region="gateway-tests" title="backend/tests/test_gateway.py"
```

```python src="support-pilot/backend/tests/test_gateway.py" region="limits-tests" title="backend/tests/test_gateway.py"
```

```python src="support-pilot/backend/tests/test_gateway.py" region="breaker-tests" title="backend/tests/test_gateway.py"
```

Every one of these runs instantly thanks to the fake clock, even though they describe seconds, minutes and days. That is the payoff for making time an object.

:::keypoints
- Put every model call behind one gateway with the same interface as a model, so nothing else needs to change.
- Make time an object (a clock) so retries, cool-downs and daily resets are tested instantly.
- A token bucket allows bursts and tells people how long to wait; a per-user daily budget is the wall a runaway loop hits instead of your bill.
- Cache pure calls by a hash of everything that affects the answer; expire entries; bound the size.
- Retry transient errors with exponential backoff and jitter; never retry errors retrying cannot fix; fall back to a second model.
- A circuit breaker stops calling a provider that keeps failing, and lets exactly one trial call test its return.
- A stream can be retried only before its first word.
- Let the gateway own retries: configure the SDK client with zero retries so layers do not multiply.
:::

```quiz
? Why add random "jitter" to the retry delay?
- To make logs look different
+ So many clients that failed together do not all retry at the same instant and knock the provider over again
- It makes retries faster
> Synchronised retries create a stampede.
? A circuit breaker is open. What does a new request do?
- Waits until it closes
+ Skips that provider immediately and uses the fallback (or fails fast)
- Retries the provider three times
> Not calling a provider that keeps failing saves time and gives it room to recover.
? The connection breaks after the model has streamed half a reply. What does the gateway do?
- Switches to the fallback model and continues
+ Ends the reply with the error: words have already been shown and cannot be taken back
- Starts over silently
> Retrying is only invisible before the first word.
```

:::exercise Route by difficulty
Add a method to the gateway that takes an optional `tier` ("cheap" or "strong") and picks the first provider by tier, still falling back to the other. Write the test with two fake models. Then decide who would set the tier: the pipeline for triage (cheap) and draft (strong)? What would you measure in the evals to confirm the cheaper triage did not get worse?
:::
