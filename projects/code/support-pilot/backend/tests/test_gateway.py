import asyncio
import random

import pytest

from app.gateway import Budget, CircuitBreaker, FakeClock, Gateway, RateLimiter, TTLCache
from app.llm.base import LLMError, TextDone

from .scripted import Scripted

CALL = dict(system="s", messages=[{"role": "user", "content": "hi"}], schema={"type": "object"}, max_tokens=100)
NO_RETRY = LLMError("bad_request", "rejected")


def gateway(primary, fallback=None, **kw):
    clock = kw.pop("clock", FakeClock())
    return Gateway(primary, fallback, clock=clock, rng=random.Random(1), **kw), clock


# region: gateway-tests
async def test_a_transient_failure_is_retried_with_growing_pauses():
    primary = Scripted(fail=2)
    gw, clock = gateway(primary)
    result = await gw.complete_json("asha", **CALL)
    assert result.attempts == 3 and primary.calls == 3 and gw.stats["retries"] == 2
    assert 0.1 <= clock.slept[0] <= 0.3 and 0.2 <= clock.slept[1] <= 0.6                   # base 0.2 x 2^n, with jitter


async def test_when_the_main_model_keeps_failing_the_fallback_answers():
    primary, backup = Scripted(fail=99), Scripted(name="backup", model="claude-haiku-5-5")
    gw, _ = gateway(primary, backup)
    result = await gw.complete_json("asha", **CALL)
    assert result.model == "claude-haiku-5-5" and primary.calls == 3 and backup.calls == 1 and gw.stats["fallbacks"] == 1


async def test_with_no_fallback_the_error_surfaces_as_provider_unavailable():
    gw, _ = gateway(Scripted(fail=99))
    with pytest.raises(LLMError) as err:
        await gw.complete_json("asha", **CALL)
    assert err.value.code == "provider_unavailable" and err.value.retryable


async def test_errors_that_retrying_cannot_fix_are_not_retried():
    primary = Scripted(fail=99, error=NO_RETRY)
    gw, _ = gateway(primary, Scripted(name="backup"))
    with pytest.raises(LLMError) as err:
        await gw.complete_json("asha", **CALL)
    assert err.value.code == "bad_request" and primary.calls == 1


async def test_identical_requests_are_answered_from_the_cache_and_cost_nothing():
    primary = Scripted()
    gw, clock = gateway(primary, cache_ttl=60)
    first = await gw.complete_json("asha", **CALL)
    second = await gw.complete_json("ravi", **CALL)
    assert not first.cached and second.cached and second.usage.input_tokens == 0 and primary.calls == 1 and gw.stats["cache_hits"] == 1
    clock.advance(61)                                                                      # the entry has expired
    assert not (await gw.complete_json("asha", **CALL)).cached and primary.calls == 2


async def test_a_slow_model_times_out_and_counts_as_a_failure():
    class Slow(Scripted):
        async def complete_json(self, **kw):
            await asyncio.sleep(1)

    gw, _ = gateway(Slow(), timeout=0.01, attempts=2)
    with pytest.raises(LLMError) as err:
        await gw.complete_json("asha", **CALL)
    assert err.value.code == "provider_unavailable" and "too long" in err.value.message


async def test_a_stream_that_fails_before_its_first_word_is_retried():
    primary = Scripted(fail=1, text="All good now")
    gw, _ = gateway(primary)
    events = [e async for e in gw.stream_text("asha", system="s", messages=[], max_tokens=100)]
    assert isinstance(events[-1], TextDone) and events[-1].text == "All good now" and events[-1].attempts == 2


async def test_a_stream_that_fails_after_words_were_sent_ends_with_the_error():
    class Breaks(Scripted):
        async def stream_text(self, **kw):
            from app.llm.base import TextDelta
            yield TextDelta("Hello ")
            raise self.error

    gw, _ = gateway(Breaks(), Scripted(name="backup"))
    seen = []
    with pytest.raises(LLMError):
        async for event in gw.stream_text("asha", system="s", messages=[], max_tokens=100):
            seen.append(event)
    assert len(seen) == 1                      # the customer-facing text is never silently switched mid-sentence
# endregion: gateway-tests


# region: limits-tests
def test_the_rate_limiter_allows_a_burst_then_says_how_long_to_wait():
    clock = FakeClock()
    limiter = RateLimiter(per_minute=3, clock=clock)
    assert [limiter.check("asha") for _ in range(3)] == [0, 0, 0]
    assert limiter.check("asha") == 20.0                                                  # 3 per minute: one token every 20 seconds
    assert limiter.check("ravi") == 0                                                     # another person has their own bucket
    clock.advance(20)
    assert limiter.check("asha") == 0


async def test_the_gateway_refuses_calls_over_the_limit_and_over_the_daily_budget():
    gw, clock = gateway(Scripted(), per_minute=2)
    for i in range(2):
        await gw.complete_json("asha", system=str(i), messages=[], schema={}, max_tokens=10)
    with pytest.raises(LLMError) as err:
        await gw.complete_json("asha", system="3", messages=[], schema={}, max_tokens=10)
    assert err.value.code == "rate_limited" and err.value.retryable and gw.stats["rate_limited"] == 1

    gw, clock = gateway(Scripted(), daily_budget_usd=0.0001)
    await gw.complete_json("asha", **CALL)                                                # this call spends past the budget...
    with pytest.raises(LLMError) as err:
        await gw.complete_json("asha", system="other", messages=[], schema={}, max_tokens=10)
    assert err.value.code == "budget_exceeded" and not err.value.retryable
    clock.advance(86400)                                                                  # ...and tomorrow it resets
    await gw.complete_json("asha", system="other", messages=[], schema={}, max_tokens=10)


def test_budget_is_tracked_per_user_per_day():
    clock = FakeClock()
    budget = Budget(1.0, clock)
    budget.charge("asha", 1.2)
    assert budget.exhausted("asha") and not budget.exhausted("ravi")
    clock.advance(86400)
    assert not budget.exhausted("asha")


def test_the_cache_evicts_the_least_recently_used_entry():
    cache = TTLCache(ttl=60, clock=FakeClock(), max_items=2)
    cache.put("a", 1), cache.put("b", 2), cache.get("a"), cache.put("c", 3)
    assert cache.get("b") is None and cache.get("a") == 1 and cache.get("c") == 3
# endregion: limits-tests


# region: breaker-tests
def test_the_breaker_opens_after_repeated_failures_then_allows_one_trial():
    clock = FakeClock()
    breaker = CircuitBreaker(failures=3, cooldown=20, clock=clock)
    for _ in range(3):
        assert breaker.allow()
        breaker.failure()
    assert breaker.state == "open" and not breaker.allow()
    clock.advance(20)
    assert breaker.state == "half_open" and breaker.allow() and not breaker.allow()      # exactly one trial call
    breaker.failure()
    assert breaker.state == "open"                                                       # the trial failed: wait again
    clock.advance(20)
    assert breaker.allow()
    breaker.success()
    assert breaker.state == "closed" and breaker.allow()


async def test_an_open_breaker_skips_the_broken_provider_without_calling_it():
    primary = Scripted(fail=99)
    gw, clock = gateway(primary, Scripted(name="backup"), breaker_failures=3, attempts=3)
    await gw.complete_json("asha", system="1", messages=[], schema={}, max_tokens=10)    # three failures open the breaker
    calls_before = primary.calls
    await gw.complete_json("asha", system="2", messages=[], schema={}, max_tokens=10)
    assert primary.calls == calls_before and gw.breakers[id(primary)].state == "open"    # the second request never touched it
# endregion: breaker-tests
