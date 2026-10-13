---
title: Build an LLM Gateway
level: advanced
time: 65
icon: server
cover: #6366f1,#14b8a6
tags: gateway, routing, caching, rate-limiting, circuit-breaker, observability
summary: Build the proxy that sits between your applications and model providers — model routing, exact and semantic caching with tenant isolation, token-bucket rate limits, budgets, retries with backoff, circuit breakers with failover, and per-request traces — then simulate an hour of traffic with a provider outage and compare it with calling the provider directly.
---

Once more than one team or feature calls LLMs, the same problems appear everywhere: rate limits, outages, runaway spend, repeated identical requests, no visibility. An **LLM gateway** solves them once, in one place. LiteLLM, Portkey and Helicone are public examples; many companies build their own. In this project you build the core of one and **test it against a simulated outage**.

**What you'll build:** a `Gateway` with eight features and a deterministic traffic simulator (a virtual clock, so results are reproducible and need no real waiting).

:::flow A request through the gateway
Budget | stop overspending tenants
Rate limit | token bucket per tenant
Cache | exact, then semantic
Route | pick a provider chain
Breaker | skip providers that are failing
Call | retries with backoff
Fail over | next provider in the chain
Trace | cost, latency, path, outcome
:::

## Step 1 — Simulated providers and a virtual clock

Real providers are slow, costly and occasionally down. For testing we want **fake providers with realistic behaviour that we control**: latency per token, prices, an outage window and random transient errors. Time is a **virtual clock** we advance ourselves, so a simulated hour runs in milliseconds.

```python run shared title="Step 1 · fake providers"
import random, math, zlib, hashlib, json
from collections import Counter, defaultdict, OrderedDict
import numpy as np

class ProviderError(Exception):
    def __init__(self, message, transient=True):
        super().__init__(message); self.transient = transient

class FakeProvider:
    def __init__(self, name, price_in, price_out, base_latency, per_token, outages=(), flaky=0.0, seed=0):
        self.name, self.price_in, self.price_out = name, price_in, price_out          # prices in dollars per million tokens
        self.base_latency, self.per_token, self.outages, self.flaky = base_latency, per_token, outages, flaky
        self.rng, self.calls = random.Random(seed), 0
    def complete(self, prompt, max_tokens, now):
        self.calls += 1
        if any(a <= now < b for a, b in self.outages): raise ProviderError(f"{self.name}: 503 service unavailable")
        if self.rng.random() < self.flaky: raise ProviderError(f"{self.name}: 429 rate limited")
        in_tok = max(1, int(len(prompt.split()) * 1.3)); out_tok = min(max_tokens, 60 + in_tok // 2)
        return {"text": f"[{self.name}] answer to: {prompt[:40]}", "in_tok": in_tok, "out_tok": out_tok,
                "latency": round(self.base_latency + self.per_token * out_tok, 3),
                "cost": (in_tok * self.price_in + out_tok * self.price_out) / 1e6}

big   = FakeProvider("big-model",   price_in=3.0, price_out=15.0, base_latency=0.8, per_token=0.020, outages=[(200, 320)], seed=1)
small = FakeProvider("small-model", price_in=0.25, price_out=1.25, base_latency=0.3, per_token=0.006, flaky=0.05, seed=2)
r = small.complete("What is the capital of France?", 100, now=10)
print(r, "\nbig model is down between t=200s and t=320s")
```

## Step 2 — Rate limiting and budgets per tenant

A **token bucket** allows bursts up to a capacity and refills steadily. We meter **tokens** rather than requests, because one huge prompt costs far more than many small ones. A **budget** caps spend per tenant.

```python run shared title="Step 2 · token bucket and budgets"
class TokenBucket:
    def __init__(self, tokens_per_minute, burst):
        self.rate, self.capacity, self.level, self.t = tokens_per_minute / 60, burst, burst, 0.0
    def allow(self, now, cost):
        self.level = min(self.capacity, self.level + (now - self.t) * self.rate); self.t = now
        if self.level >= cost: self.level -= cost; return True
        return False

class Budget:
    def __init__(self, dollars): self.limit, self.spent = dollars, 0.0
    def can_spend(self): return self.spent < self.limit
    def charge(self, dollars): self.spent += dollars

tb = TokenBucket(tokens_per_minute=600, burst=300)
print([tb.allow(now, 100) for now in (0, 0.1, 0.2, 0.3, 1, 2, 3, 12)], "<- burst of 3 allowed, then limited, then refilled over time")
```

## Step 3 — Caches: exact and semantic

Many requests repeat. An **exact cache** keys on the full request. A **semantic cache** also catches near-duplicates ("what's your refund policy" versus "tell me your refund policy") by comparing embeddings. Both must be **scoped by tenant**: sharing a cache across customers can leak one customer's answer to another.

```python run shared title="Step 3 · tenant-scoped exact and semantic caches"
import re
DIM = 512
def embed(text):
    v = np.zeros(DIM)
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        w = f" {w} "
        for k in (3, 4):
            for i in range(max(len(w) - k + 1, 1)): v[zlib.crc32(w[i:i + k].encode()) % DIM] += 1
    n = np.linalg.norm(v); return v / n if n else v

class Cache:
    def __init__(self, ttl=300, max_items=500, semantic_threshold=0.9):
        self.ttl, self.max, self.threshold = ttl, max_items, semantic_threshold
        self.exact, self.semantic = OrderedDict(), []                      # semantic: (tenant, vector, key)
    def key(self, tenant, model_hint, prompt):
        return hashlib.sha256(f"{tenant}|{model_hint}|{prompt}".encode()).hexdigest()
    def get(self, tenant, model_hint, prompt, now):
        k = self.key(tenant, model_hint, prompt)
        if k in self.exact and now - self.exact[k]["t"] < self.ttl: return self.exact[k]["value"], "exact"
        q = embed(prompt)
        best, best_sim = None, 0.0
        for t, vec, key in self.semantic:
            if t != tenant or key not in self.exact or now - self.exact[key]["t"] >= self.ttl: continue      # never cross tenants
            sim = float(vec @ q)
            if sim > best_sim: best, best_sim = key, sim
        if best and best_sim >= self.threshold: return self.exact[best]["value"], f"semantic({best_sim:.2f})"
        return None, None
    def put(self, tenant, model_hint, prompt, value, now):
        k = self.key(tenant, model_hint, prompt)
        self.exact[k] = {"value": value, "t": now}; self.exact.move_to_end(k)
        self.semantic.append((tenant, embed(prompt), k))
        while len(self.exact) > self.max: self.exact.popitem(last=False)

c = Cache()
c.put("acme", "any", "What is your refund policy for annual plans?", "Refunds within 14 days.", now=0)
for tenant, q in [("acme", "What is your refund policy for annual plans?"), ("acme", "what is your refund policy for the annual plan"), ("acme", "How do I reset my password?"), ("globex", "What is your refund policy for annual plans?")]:
    print(f"{tenant:7} {q[:48]!r:52} ->", c.get(tenant, "any", q, now=5))
```

The last line is the important one: **the same question from another tenant is a miss**.

## Step 4 — Circuit breaker and retries

When a provider is failing, hammering it wastes time and quota. A **circuit breaker** opens after repeated failures, skips the provider for a cool-down, then lets one probe through (half-open). **Retries** use exponential backoff and apply only to transient errors.

```python run shared title="Step 4 · circuit breaker"
class CircuitBreaker:
    def __init__(self, threshold=3, cooldown=30.0):
        self.threshold, self.cooldown, self.failures, self.opened_at = threshold, cooldown, 0, None
    def available(self, now):
        return self.opened_at is None or now - self.opened_at >= self.cooldown          # closed, or time for a probe (half-open)
    def record(self, ok, now):
        if ok: self.failures, self.opened_at = 0, None
        else:
            self.failures += 1
            if self.failures >= self.threshold: self.opened_at = now

cb = CircuitBreaker(threshold=3, cooldown=30)
events = []
for t, ok in [(0, False), (1, False), (2, False), (10, None), (40, True), (41, None)]:
    if ok is None: events.append(f"t={t}: available={cb.available(t)}")
    else: cb.record(ok, t); events.append(f"t={t}: call {'ok' if ok else 'failed'}")
print(" | ".join(events))
```

## Step 5 — The gateway

```python run shared title="Step 5 · Gateway.handle"
class Gateway:
    def __init__(self, providers, tenants, max_attempts=2, backoff=0.5):
        self.providers = providers
        self.breakers = {p.name: CircuitBreaker() for p in providers.values()}
        self.cache = Cache()
        self.limits = {t: TokenBucket(**cfg["rate"]) for t, cfg in tenants.items()}
        self.budgets = {t: Budget(cfg["budget"]) for t, cfg in tenants.items()}
        self.max_attempts, self.backoff, self.traces = max_attempts, backoff, []

    def chain(self, task):
        return ["small-model", "big-model"] if task == "simple" else ["big-model", "small-model"]       # route by task, fall back to the other

    def handle(self, req, now):
        trace = {"t": now, "tenant": req["tenant"], "task": req["task"], "path": [], "retries": 0, "cost": 0.0, "latency": 0.0, "cache": None, "status": None}
        def done(status, text=None):
            trace["status"] = status; self.traces.append(trace); return text
        tenant = req["tenant"]
        if not self.budgets[tenant].can_spend(): return done("over_budget")
        est_tokens = int(len(req["prompt"].split()) * 1.3) + req["max_tokens"]
        if not self.limits[tenant].allow(now, est_tokens): return done("rate_limited")
        hit, kind = self.cache.get(tenant, "any", req["prompt"], now)
        if hit is not None:
            trace["cache"] = kind; trace["latency"] = 0.01; return done("ok", hit)
        elapsed = 0.0
        for name in self.chain(req["task"]):
            breaker = self.breakers[name]
            if not breaker.available(now + elapsed): trace["path"].append(f"{name}:skipped(open)"); continue
            for attempt in range(self.max_attempts):
                try:
                    r = self.providers[name].complete(req["prompt"], req["max_tokens"], now + elapsed)
                    breaker.record(True, now + elapsed)
                    elapsed += r["latency"]; trace.update(cost=r["cost"], latency=elapsed)
                    trace["path"].append(f"{name}:ok"); self.budgets[tenant].charge(r["cost"])
                    self.cache.put(tenant, "any", req["prompt"], r["text"], now + elapsed)
                    return done("ok", r["text"])
                except ProviderError as e:
                    breaker.record(False, now + elapsed)
                    trace["path"].append(f"{name}:error"); trace["retries"] += 1
                    elapsed += self.backoff * 2 ** attempt                                   # exponential backoff (virtual time)
                    if not breaker.available(now + elapsed): break                           # the breaker just opened: stop retrying this provider
        trace["latency"] = elapsed
        return done("error")

TENANTS = {"acme": {"rate": dict(tokens_per_minute=4000, burst=1500), "budget": 5.0},
           "globex": {"rate": dict(tokens_per_minute=1500, burst=600), "budget": 5.0},
           "initech": {"rate": dict(tokens_per_minute=4000, burst=1500), "budget": 0.002}}      # a tiny budget, to see the cut-off
gw = Gateway({"big-model": big, "small-model": small}, TENANTS)
for t, task in [(1, "simple"), (2, "hard"), (3, "simple")]:
    out = gw.handle({"tenant": "acme", "task": task, "prompt": "Explain our refund policy in one sentence", "max_tokens": 80}, now=t)
    tr = gw.traces[-1]
    print(out, "|", {"path": tr["path"], "cache": tr["cache"], "cost": round(tr["cost"], 6), "latency": round(tr["latency"], 2)})
```

Note the second call: the question repeats, so the **cache** answers instantly at zero cost, even though the task type differs.

## Step 6 — Simulate traffic with an outage

We generate 600 requests over 10 simulated minutes from three tenants. Popular questions repeat (so caching matters), 70% are simple tasks, and the **big model is down from t=200 s to t=320 s**. We compare three setups: calling the big model directly, the gateway with failover only, and the full gateway.

```python run shared title="Step 6 · the simulation"
def make_workload(n=600, seed=3):
    rnd = random.Random(seed)
    questions = [f"How do I {a} my {b}?" for a in ("reset", "update", "export", "delete", "share") for b in ("account", "invoice", "report", "profile", "workspace", "settings")]
    zipf = [1 / (i + 1) for i in range(len(questions))]                        # a few popular questions, a long tail
    t, reqs = 0.0, []
    for _ in range(n):
        t += rnd.expovariate(n / 600)                                           # about one request per second on average
        reqs.append((t, {"tenant": rnd.choices(["acme", "globex", "initech"], [5, 3, 2])[0], "task": "simple" if rnd.random() < 0.7 else "hard",
                         "prompt": rnd.choices(questions, zipf)[0], "max_tokens": 120}))
    return reqs

def run_direct(reqs):
    """Baseline: every request goes straight to the big model, no retries, no cache, no limits."""
    p = FakeProvider("big-model", 3.0, 15.0, 0.8, 0.020, outages=[(200, 320)], seed=1)
    stats = {"ok": 0, "error": 0, "cost": 0.0, "lat": []}
    for t, req in reqs:
        try:
            r = p.complete(req["prompt"], req["max_tokens"], t); stats["ok"] += 1; stats["cost"] += r["cost"]; stats["lat"].append(r["latency"])
        except ProviderError: stats["error"] += 1
    return stats

def summarize(traces):
    ok = [x for x in traces if x["status"] == "ok"]
    lat = sorted(x["latency"] for x in ok)
    return {"ok": len(ok), "error": sum(x["status"] == "error" for x in traces), "limited": sum(x["status"] == "rate_limited" for x in traces),
            "over_budget": sum(x["status"] == "over_budget" for x in traces), "cost": sum(x["cost"] for x in traces),
            "cache_hits": sum(x["cache"] is not None for x in ok), "failover": sum(any(p.startswith("small") and x["task"] == "hard" for p in x["path"]) for x in ok),
            "p50": lat[len(lat) // 2], "p95": lat[int(len(lat) * 0.95)]}

reqs = make_workload()
d = run_direct(reqs)
print(f"direct to big model : ok {d['ok']:>3} | errors {d['error']:>3} | cost ${d['cost']:.2f} | p50 {sorted(d['lat'])[len(d['lat']) // 2]:.1f}s p95 {sorted(d['lat'])[int(len(d['lat']) * .95)]:.1f}s")

def fresh_gateway(cache=True):
    big_ = FakeProvider("big-model", 3.0, 15.0, 0.8, 0.020, outages=[(200, 320)], seed=1)
    small_ = FakeProvider("small-model", 0.25, 1.25, 0.3, 0.006, flaky=0.05, seed=2)
    g = Gateway({"big-model": big_, "small-model": small_}, TENANTS)
    if not cache: g.cache.get = lambda *a, **k: (None, None)
    return g

for label, use_cache in (("gateway, no cache    ", False), ("gateway with caches  ", True)):
    g = fresh_gateway(use_cache)
    for t, req in reqs: g.handle(req, t)
    s = summarize(g.traces)
    print(f"{label}: ok {s['ok']:>3} | errors {s['error']:>3} | rate-limited {s['limited']:>3} | over budget {s['over_budget']:>3} | cost ${s['cost']:.2f} | cache hits {s['cache_hits']:>3} | p50 {s['p50']:.1f}s p95 {s['p95']:.1f}s")
```

Read the three lines. The direct baseline loses every request during the outage; the gateway **fails over** and keeps answering. The cache cuts cost and latency sharply. The rate limiter and the tiny `initech` budget turn some requests away **on purpose**, which is the point of the controls.

## Step 7 — Look inside with traces

```python run shared title="Step 7 · what the gateway saw during the outage"
g = fresh_gateway(True)
for t, req in reqs: g.handle(req, t)
during = [x for x in g.traces if 200 <= x["t"] < 320 and x["task"] == "hard" and x["status"] == "ok" and not x["cache"]]
print("hard requests during the outage, answered by:", Counter(x["path"][-1] for x in during))
print("example path:", during[0]["path"])
by_tenant = defaultdict(lambda: Counter())
for x in g.traces: by_tenant[x["tenant"]][x["status"]] += 1
for tenant, c in by_tenant.items(): print(f"{tenant:8}", dict(c))
spend = {t: round(b.spent, 4) for t, b in g.budgets.items()}
print("spend per tenant:", spend)
```

A gateway makes cost attribution and incident debugging **trivial**: every request has a trace, and everything is tagged by tenant.

## Step 8 — Put a real provider behind it

Replace `FakeProvider` with an adapter that has the same `complete(prompt, max_tokens, now)` method. The gateway code does not change.

```python local
import anthropic
client = anthropic.Anthropic()

class ClaudeProvider:
    def __init__(self, name, model, price_in, price_out):
        self.name, self.model, self.price_in, self.price_out = name, model, price_in, price_out
    def complete(self, prompt, max_tokens, now):
        try:
            r = client.messages.create(model=self.model, max_tokens=max_tokens, messages=[{"role": "user", "content": prompt}])
        except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.InternalServerError) as e:
            raise ProviderError(f"{self.name}: {type(e).__name__}", transient=True)       # transient: worth retrying or failing over
        except anthropic.BadRequestError as e:
            raise ProviderError(f"{self.name}: {e}", transient=False)                      # a bad request will fail everywhere: do not retry
        u = r.usage
        return {"text": r.content[0].text, "in_tok": u.input_tokens, "out_tok": u.output_tokens, "latency": 0.0,
                "cost": (u.input_tokens * self.price_in + u.output_tokens * self.price_out) / 1e6}

providers = {"big-model": ClaudeProvider("big-model", "claude-sonnet-5-5", 2.0, 10.0),
             "small-model": ClaudeProvider("small-model", "claude-haiku-5-5", 0.10, 0.50)}
```

Two production notes: use **wall-clock time** instead of the virtual clock, and run requests **concurrently** with `asyncio` (async SDK client) while sharing the breakers and buckets. Also remember that non-transient errors (`transient=False`) should skip the retries and the fail-over: switching providers will not fix a malformed request.

## How it works

| Feature | Problem it solves | What to watch |
|---|---|---|
| Token-bucket rate limit | one tenant starving others; provider 429s | meter tokens, not requests |
| Budget | runaway spend | alerts before the limit, not only a hard stop |
| Exact cache | repeated identical calls | key must include everything that changes the answer |
| Semantic cache | paraphrased repeats | threshold tuning; **tenant isolation**; stale answers |
| Routing | cost: easy work on cheap models | evaluate quality per route |
| Retries + backoff | transient errors | only retry transient errors; cap attempts |
| Circuit breaker + failover | outages | test the fallback model on your evals too |
| Traces | debugging, cost attribution | redact sensitive content |

:::exercise Extend it
1. Add **priority classes**: interactive requests may use the whole bucket, batch requests only 50%.
2. Implement **request hedging**: if the first provider has not answered after the p95 latency, start the second and take the first result.
3. Add **per-model quotas** that mirror real provider limits, and make the router skip a model that is at its limit.
4. Persist `traces` to a file and write a function that reports cost per tenant per hour.
5. Add a **kill switch**: a config flag that disables one provider instantly without a deploy.
:::

:::keypoints
- A gateway centralises rate limits, budgets, caching, routing, retries, failover and tracing so every application gets them for free.
- Meter tokens, not requests; scope caches by tenant; retry only transient errors with backoff; open circuit breakers to stop wasting quota on a failing provider.
- Route by task (cheap model for easy work, strong model for hard work) and fail over to the other model, evaluating the fallback quality too.
- Test with a deterministic simulator: virtual clock, scripted outages, seeded randomness.
- Traces tagged by tenant make cost attribution and incident debugging straightforward.
:::
