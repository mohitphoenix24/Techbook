"""The LLM gateway: every model call in the application goes through here.

One place that adds the things a production system needs around a model: a rate limit, a daily budget per user, a cache,
retries with backoff, a fallback model, a circuit breaker and timeouts. It speaks the same interface as a model client, so
nothing else in the application knows it is there.

Pure Python and asyncio only, with an injectable clock, so every behaviour here can be tested (and shown) instantly.
"""
# region: imports
import asyncio
import hashlib
import json
import random
import time
from collections import OrderedDict
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import date
from typing import Any

from .llm.base import JsonResult, LLMClient, LLMError, Message, TextDelta, TextDone, Usage
from .pricing import cost_usd
# endregion: imports


# region: clock
class Clock:
    """Time, as an object, so tests can replace it. `now` never goes backwards; `day` names the budget day."""

    def now(self) -> float:
        return time.monotonic()

    def day(self) -> str:
        return date.today().isoformat()

    async def sleep(self, seconds: float) -> None:
        await asyncio.sleep(seconds)


class FakeClock(Clock):
    """A clock that only moves when you tell it to. Sleeping jumps forward instantly, so a retry test takes no time."""

    def __init__(self, start: float = 1000.0):
        self.t = start
        self.slept: list[float] = []

    def now(self) -> float:
        return self.t

    def day(self) -> str:
        return f"day-{int(self.t // 86400)}"

    async def sleep(self, seconds: float) -> None:
        self.slept.append(round(seconds, 3))
        self.t += seconds

    def advance(self, seconds: float) -> None:
        self.t += seconds
# endregion: clock


# region: limits
class RateLimiter:
    """A token bucket per key: it refills steadily, allows short bursts, and says how long to wait when it is empty."""

    def __init__(self, per_minute: int, clock: Clock):
        self.capacity, self.rate, self.clock = float(per_minute), per_minute / 60, clock
        self.buckets: dict[str, tuple[float, float]] = {}                 # key -> (tokens, time of last update)

    def check(self, key: str, cost: float = 1) -> float:
        """0 when the call is allowed (and it is counted), otherwise the seconds to wait."""
        now = self.clock.now()
        tokens, updated = self.buckets.get(key, (self.capacity, now))
        tokens = min(self.capacity, tokens + (now - updated) * self.rate)
        if tokens >= cost:
            self.buckets[key] = (tokens - cost, now)
            return 0.0
        self.buckets[key] = (tokens, now)
        return round((cost - tokens) / self.rate, 1)


class Budget:
    """Spend per user per day, in dollars. A runaway loop or a stolen key hits this wall instead of your bill."""

    def __init__(self, daily_usd: float, clock: Clock):
        self.daily_usd, self.clock = daily_usd, clock
        self.spent: dict[tuple[str, str], float] = {}

    def used(self, user: str) -> float:
        return self.spent.get((self.clock.day(), user), 0.0)

    def exhausted(self, user: str) -> bool:
        return self.used(user) >= self.daily_usd

    def charge(self, user: str, usd: float) -> None:
        key = (self.clock.day(), user)
        self.spent[key] = self.spent.get(key, 0.0) + usd
# endregion: limits


# region: cache
class TTLCache:
    """A small least-recently-used cache whose entries expire."""

    def __init__(self, ttl: float, clock: Clock, max_items: int = 500):
        self.ttl, self.clock, self.max_items = ttl, clock, max_items
        self.items: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    def get(self, key: str) -> Any | None:
        entry = self.items.get(key)
        if entry is None or self.clock.now() - entry[0] > self.ttl:
            self.items.pop(key, None)
            return None
        self.items.move_to_end(key)
        return entry[1]

    def put(self, key: str, value: Any) -> None:
        self.items[key] = (self.clock.now(), value)
        self.items.move_to_end(key)
        while len(self.items) > self.max_items:
            self.items.popitem(last=False)


def cache_key(model: str, system: str, messages: list[Message], schema: dict, hints: dict | None) -> str:
    raw = json.dumps([model, system, messages, schema, hints], sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()
# endregion: cache


# region: breaker
class CircuitBreaker:
    """Stops calling a provider that keeps failing, and tries again after a cool-down.

    closed -> (N failures in a row) -> open -> (cool-down passes) -> half-open -> one trial call:
    success closes it again, failure reopens it.
    """

    def __init__(self, failures: int, cooldown: float, clock: Clock):
        self.limit, self.cooldown, self.clock = failures, cooldown, clock
        self.failures, self.opened_at, self.trial = 0, None, False

    @property
    def state(self) -> str:
        if self.opened_at is None:
            return "closed"
        return "half_open" if self.clock.now() - self.opened_at >= self.cooldown else "open"

    def allow(self) -> bool:
        state = self.state
        if state == "closed":
            return True
        if state == "half_open" and not self.trial:
            self.trial = True                       # exactly one call may test whether the provider is back
            return True
        return False

    def success(self) -> None:
        self.failures, self.opened_at, self.trial = 0, None, False

    def failure(self) -> None:
        self.failures += 1
        self.trial = False
        if self.failures >= self.limit or self.opened_at is not None:
            self.opened_at = self.clock.now()
# endregion: breaker


# region: gateway-json
class Gateway:
    name = "gateway"

    def __init__(self, primary: LLMClient, fallback: LLMClient | None = None, *, clock: Clock | None = None, per_minute: int = 30,
                 daily_budget_usd: float = 5.0, cache_ttl: float = 600, attempts: int = 3, base_delay: float = 0.2,
                 breaker_failures: int = 4, breaker_cooldown: float = 20, timeout: float = 30, rng: random.Random | None = None):
        self.clock = clock or Clock()
        self.providers = [p for p in (primary, fallback) if p is not None]
        self.breakers = {id(p): CircuitBreaker(breaker_failures, breaker_cooldown, self.clock) for p in self.providers}
        self.limiter, self.budget = RateLimiter(per_minute, self.clock), Budget(daily_budget_usd, self.clock)
        self.cache = TTLCache(cache_ttl, self.clock)
        self.attempts, self.base_delay, self.timeout, self.rng = attempts, base_delay, timeout, rng or random.Random()
        self.stats = {"calls": 0, "cache_hits": 0, "retries": 0, "fallbacks": 0, "rate_limited": 0, "budget_blocked": 0, "failures": 0, "cost_usd": 0.0}

    @property
    def model(self) -> str:
        return self.providers[0].model

    def bind(self, user: str) -> "BoundGateway":
        """A view of the gateway for one user, with the same interface as a model client."""
        return BoundGateway(self, user)

    # -- admission: should this call happen at all? --
    def _admit(self, user: str) -> None:
        if self.budget.exhausted(user):
            self.stats["budget_blocked"] += 1
            raise LLMError("budget_exceeded", "The daily AI budget for this user is used up. It resets tomorrow.")
        wait = self.limiter.check(user)
        if wait:
            self.stats["rate_limited"] += 1
            raise LLMError("rate_limited", f"Too many requests. Try again in {wait:g} seconds.", retryable=True)

    def _charge(self, user: str, model: str, usage: Usage) -> float:
        usd = cost_usd(model, usage.input_tokens, usage.output_tokens)
        self.budget.charge(user, usd)
        self.stats["cost_usd"] = round(self.stats["cost_usd"] + usd, 6)
        return usd

    async def _pause(self, attempt: int) -> None:
        await self.clock.sleep(self.base_delay * 2 ** attempt * (0.5 + self.rng.random()))      # exponential, with jitter

    # -- a JSON call: cache, admit, then retry and fall back --
    async def complete_json(self, user: str, **kw: Any) -> JsonResult:
        key = cache_key(self.model, kw["system"], kw["messages"], kw["schema"], kw.get("hints"))
        hit = self.cache.get(key)
        if hit is not None:
            self.stats["cache_hits"] += 1
            return JsonResult(hit.text, Usage(), cached=True, model=hit.model)
        self._admit(user)
        self.stats["calls"] += 1
        last: LLMError | None = None
        tries = 0
        for index, client in enumerate(self.providers):
            breaker = self.breakers[id(client)]
            if not breaker.allow():
                last = LLMError("circuit_open", f"{client.name} is paused after repeated failures.", retryable=True)
                continue
            if index:
                self.stats["fallbacks"] += 1
            for attempt in range(self.attempts):
                tries += 1
                try:
                    result = await asyncio.wait_for(client.complete_json(**kw), self.timeout)
                except asyncio.TimeoutError:
                    last = LLMError("timeout", "The model took too long to answer.", retryable=True)
                except LLMError as exc:
                    if not exc.retryable:
                        raise
                    last = exc
                else:
                    breaker.success()
                    result.model, result.attempts = result.model or client.model, tries
                    self._charge(user, result.model, result.usage)
                    self.cache.put(key, result)
                    return result
                breaker.failure()
                self.stats["failures"] += 1
                if attempt + 1 < self.attempts and breaker.state == "closed":
                    self.stats["retries"] += 1
                    await self._pause(attempt)
                else:
                    break
        raise LLMError("provider_unavailable", last.message if last else "No model is available.", retryable=True)
# endregion: gateway-json

    # region: gateway-stream
    async def stream_text(self, user: str, **kw: Any) -> AsyncIterator[TextDelta | TextDone]:
        """Like complete_json, but a stream cannot be taken back: once a word has been sent, an error ends the reply."""
        self._admit(user)
        self.stats["calls"] += 1
        last: LLMError | None = None
        tries = 0
        for index, client in enumerate(self.providers):
            breaker = self.breakers[id(client)]
            if not breaker.allow():
                last = LLMError("circuit_open", f"{client.name} is paused after repeated failures.", retryable=True)
                continue
            if index:
                self.stats["fallbacks"] += 1
            for attempt in range(self.attempts):
                tries += 1
                started = False
                stream = client.stream_text(**kw).__aiter__()
                try:
                    while True:
                        event = await asyncio.wait_for(stream.__anext__(), self.timeout)
                        started = True
                        if isinstance(event, TextDone):
                            event.model, event.attempts = event.model or client.model, tries
                            self._charge(user, event.model, event.usage)
                            breaker.success()
                        yield event
                        if isinstance(event, TextDone):
                            return
                except StopAsyncIteration:
                    return
                except (asyncio.TimeoutError, LLMError) as exc:
                    error = exc if isinstance(exc, LLMError) else LLMError("timeout", "The model took too long to answer.", retryable=True)
                    if started or not error.retryable:
                        raise error                                   # words were already shown (or the error is final): end here
                    last = error
                breaker.failure()
                self.stats["failures"] += 1
                if attempt + 1 < self.attempts and breaker.state == "closed":
                    self.stats["retries"] += 1
                    await self._pause(attempt)
                else:
                    break
        raise LLMError("provider_unavailable", last.message if last else "No model is available.", retryable=True)
    # endregion: gateway-stream


# region: bound
class BoundGateway:
    """The gateway as one user sees it: the same two methods as any model client."""

    name = "gateway"

    def __init__(self, gateway: Gateway, user: str):
        self.gateway, self.user = gateway, user

    @property
    def model(self) -> str:
        return self.gateway.model

    def complete_json(self, **kw: Any) -> Awaitable[JsonResult]:
        return self.gateway.complete_json(self.user, **kw)

    def stream_text(self, **kw: Any) -> AsyncIterator[TextDelta | TextDone]:
        return self.gateway.stream_text(self.user, **kw)
# endregion: bound
