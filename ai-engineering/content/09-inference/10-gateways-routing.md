---
title: LLM Gateways, Routing and Caching
level: advanced
time: 45
summary: The infrastructure layer between your apps and model providers. What an LLM gateway does (one API, keys, quotas, budgets, retries, fallbacks, caching, observability, guardrails), routing strategies (rules, cost-based, latency-based, cascades, learned routers), exact and semantic caching with their pitfalls, multi-provider resilience, the tools (LiteLLM, Portkey, OpenRouter, cloud gateways), and a runnable mini-gateway.
---

Once more than one team or product calls models, a pattern appears: everyone reimplements retries, key management, logging, fallbacks and cost tracking, slightly differently. An **LLM gateway** centralises these concerns in one service so applications talk to **one stable API** while the platform team controls providers, budgets, safety and observability.

## What a gateway provides

```viz algo=arch title="An LLM gateway between applications and providers" dir=down
app1  App A | chatbot [client] @0,0
app2  App B | agents [client] @0,1.4
app3  App C | batch jobs [client] @0,2.8
gw    LLM gateway | auth, budgets, routing [gateway] @1,1.4
cache Cache | exact + semantic [cache] @2,0
guard Guardrails | PII, safety [guard] @2,1.4
obs   Logging + cost | traces, spend [eval] @2,2.8
p1    Provider 1 | frontier API [cloud] @3,0
p2    Provider 2 | other vendor [cloud] @3,1.4
p3    Self-hosted | vLLM cluster [gpu] @3,2.8
--
app1 -> gw
app2 -> gw
app3 -> gw
gw -> cache
gw -> guard
gw ~> obs
gw -> p1
gw -> p2
gw -> p3
```

| Capability | Why it matters |
|---|---|
| **Unified API** (often OpenAI-compatible) | apps are not coupled to a vendor; swap models by config |
| **Key and secret management** | provider keys live only in the gateway; apps get scoped virtual keys |
| **Authentication, quotas and rate limits** | per team/user/app limits in requests and tokens; fair sharing |
| **Budgets and cost tracking** | spend per key/team/model/feature, alerts and hard caps (stop runaway agents) |
| **Routing** | choose model/provider by rules, cost, latency, load, capability |
| **Retries, timeouts, fallbacks, circuit breakers** | resilience across providers and regions |
| **Caching** | exact and semantic response caches; prompt-cache awareness |
| **Observability** | central logging, tracing, token and latency metrics, OpenTelemetry export |
| **Guardrails and policy** | PII redaction, content filters, allowed models, region restrictions |
| **Load balancing** | across deployments, keys (to multiply rate limits), regions |
| **Prompt management / templates** | versioned prompts served through the gateway |
| **Governance and audit** | who called what, with which data; compliance evidence |

### The tools

| Tool | Notes |
|---|---|
| **LiteLLM** ([repo](https://github.com/BerriAI/litellm)) | open-source proxy and Python SDK; 100+ providers behind an OpenAI-compatible API; budgets, keys, fallbacks, logging |
| **Portkey** ([repo](https://github.com/Portkey-AI/gateway)) | open-source gateway + managed platform: routing, guardrails, observability |
| **OpenRouter** ([docs](https://openrouter.ai/docs)) | hosted marketplace API for hundreds of models with unified billing and provider routing |
| **Cloud gateways** | Cloudflare AI Gateway, Vercel AI Gateway, Kong/Apigee AI plugins, Azure API Management, AWS (Bedrock as a multi-model API) |
| **Self-built** | a thin FastAPI service is a fine start; grow it deliberately |

Trade-offs: one more hop (latency, ~1–10 ms) and one more critical service to run; it becomes a **single point of failure** if not made highly available.

## Routing strategies

:::flow Choosing the model per request
Rules | task type, tenant tier, region or data class decide the model
Cost-based | the cheapest model that meets the quality bar for this task
Latency/load-based | send to the fastest or least-loaded healthy deployment
Cascade | try a cheap model; escalate if it fails a check or is unsure
Learned router | a classifier predicts which model is good enough for this prompt
A/B | split traffic to compare models safely
:::

**Cascades** are the workhorse of cost control: ask a small model first and **verify** (schema valid? confidence high? judge passes? tests pass?). Escalate only failures. The savings depend on how often the cheap model is good enough, and you must verify that quality is preserved.

```python run title="Cost of a cascade vs always-large" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
N = 20_000
difficulty = rng.beta(2, 5, N)                                  # most requests are easy
cost = {"small": 0.0004, "large": 0.012, "check": 0.0001}      # $ per request (example numbers)
p_small_ok = np.clip(1.0 - 1.6 * difficulty, 0, 1)             # chance the small model's answer is acceptable
p_check_catches = 0.9                                          # the verifier catches 90% of bad small answers

def cascade():
    spend, wrong = 0.0, 0
    for p_ok in p_small_ok:
        spend += cost["small"] + cost["check"]
        small_good = rng.random() < p_ok
        flagged = (not small_good) and rng.random() < p_check_catches
        if flagged:
            spend += cost["large"]                             # escalate; assume the large model is right
        elif not small_good:
            wrong += 1                                         # a bad answer slipped through
    return spend, wrong

spend, wrong = cascade()
always_large = N * cost["large"]
print(f"always large : ${always_large:>8,.0f}   wrong answers ≈ 0 (assumed)")
print(f"cascade      : ${spend:>8,.0f}   ({1 - spend / always_large:.0%} cheaper), bad answers that slipped through: {wrong} ({wrong / N:.2%})")
```

The cheaper path costs some quality leakage (what the verifier misses): **measure it** with evals before adopting.

## Caching at the gateway

| Cache | Key | Hit when | Risk |
|---|---|---|---|
| **Exact** | hash of (model, params, messages) | identical request | stale answers; per-user data leaks if not scoped; skip for non-deterministic needs |
| **Semantic** | embedding similarity of the prompt | paraphrase of a previous prompt | **wrong hits** (similar words, different meaning); needs a high threshold and evaluation |
| **Provider prompt cache** | prefix match (provider side) | shared prefix | none; but keep prefixes stable |
| **Embedding / tool-result caches** | content hash / call args | repeated inputs | staleness |

Rules for safe response caching: **scope keys by tenant/user** (and by any data that influences the answer), include **model and prompt version** in the key, set **TTLs** by data volatility, never cache personalised or sensitive outputs across users, and **log hits** so you can audit quality.

```python run title="A tiny semantic cache, and why the threshold matters" level=intermediate
import numpy as np, re, zlib

DIM = 256
def embed(text):
    v = np.zeros(DIM)
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        for i in range(max(1, len(w) - 2)):
            h = zlib.crc32(w[i:i + 3].encode()); v[h % DIM] += 1 if (h >> 8) & 1 else -1
    n = np.linalg.norm(v); return v / n if n else v

cache = [("how do i reset my password", "Go to Settings > Security > Reset password."),
         ("what is the refund window", "Refunds are accepted within 30 days.")]
E = np.stack([embed(q) for q, _ in cache])

queries = [("how can i reset my password", "should hit"), ("how do i reset my pin", "should NOT hit (different thing)"),
           ("what's the refund window", "should hit"), ("what is the warranty window", "should NOT hit")]
for threshold in (0.70, 0.85):
    print(f"\nthreshold {threshold}:")
    for q, note in queries:
        s = E @ embed(q); i = int(s.argmax())
        print(f"  {q!r:36} best sim {s[i]:.2f} -> {'HIT: ' + cache[i][1][:28] if s[i] >= threshold else 'miss'}   ({note})")
```

A low threshold serves wrong answers confidently; a high one rarely hits. **Evaluate hit quality** on real traffic before enabling.

## A mini gateway

```python run title="Router + budget + cache + fallback in 60 lines" level=advanced
import hashlib, itertools

class Provider:
    def __init__(self, name, price_in, price_out, fail_every=0):
        self.name, self.price_in, self.price_out, self.fail_every, self.calls = name, price_in, price_out, fail_every, itertools.count(1)
    def complete(self, prompt):
        n = next(self.calls)
        if self.fail_every and n % self.fail_every == 0: raise RuntimeError(f"{self.name} 503")
        return f"[{self.name}] answer to: {prompt[:24]}", len(prompt) // 4, 60          # (text, tokens_in, tokens_out)

class Gateway:
    def __init__(self, routes, budgets):
        self.routes, self.budgets, self.spend, self.cache, self.log = routes, budgets, {}, {}, []
    def call(self, team, task, prompt):
        key = hashlib.sha256(f"{team}|{task}|{prompt}".encode()).hexdigest()            # cache scoped by team
        if key in self.cache:
            self.log.append((team, "cache", 0.0)); return self.cache[key]
        if self.spend.get(team, 0.0) >= self.budgets[team]:
            raise PermissionError(f"budget exhausted for {team}")
        last_err = None
        for p in self.routes[task]:                                                       # ordered: preferred model first, then fallbacks
            try:
                text, ti, to = p.complete(prompt)
                cost = (ti * p.price_in + to * p.price_out) / 1e6
                self.spend[team] = self.spend.get(team, 0.0) + cost
                self.cache[key] = text; self.log.append((team, p.name, cost)); return text
            except RuntimeError as e:
                last_err = e; self.log.append((team, f"{p.name} FAILED", 0.0))
        raise RuntimeError(f"all providers failed: {last_err}")

small, big = Provider("small", 0.1, 0.5), Provider("frontier", 4.0, 20.0, fail_every=2)
gw = Gateway(routes={"classify": [small], "analyse": [big, small]}, budgets={"support": 0.001, "research": 1.0})
for team, task, prompt in [("support", "classify", "refund request"), ("support", "classify", "refund request"),
                           ("research", "analyse", "compare vendors A and B"), ("research", "analyse", "summarise the contract"),
                           ("support", "classify", "x" * 6000), ("support", "classify", "another one")]:
    try:
        print(f"{team:9} {task:9} ->", gw.call(team, task, prompt)[:42])
    except Exception as e:
        print(f"{team:9} {task:9} -> ERROR {type(e).__name__}: {e}")
print("\nlog:", gw.log)
print("spend:", {k: round(v, 6) for k, v in gw.spend.items()})
```

Look at the log: a cache hit costs nothing, the frontier model's failure **falls back to the small one**, and the support team's **budget stops** further calls.

## Multi-provider resilience

- **Health checks and circuit breakers** per provider/region; automatic failover.
- **Model equivalence**: a fallback model should be **in your eval suite**; prompts may need per-model variants.
- **Rate-limit multiplexing**: spread load across multiple keys, projects and regions.
- **Provider-specific features** (prompt caching, thinking, tool formats) do not translate 1:1: the gateway's "unified API" often exposes only the lowest common denominator, so decide where portability matters.
- **Data residency routing**: EU data only to EU endpoints.
- **Vendor risk**: an exit plan reduces lock-in.

## Rollout advice

1. Start with a **thin gateway**: unified API, key management, logging, budgets.
2. Add **retries/fallbacks** and **rate limiting**.
3. Add **caching** only where measured quality and savings justify it.
4. Add **routing/cascades** with evals, and **guardrails** as policy requires.
5. Keep the gateway **stateless and horizontally scalable**, with its config in git.
6. Instrument it: latency overhead, error rates per provider, cache hit and quality rates, spend per team.

```quiz
? What is the main benefit of an LLM gateway?
+ One stable API and central control over keys, budgets, routing, resilience, caching and observability
- Faster GPUs
- Better prompts
> It decouples applications from providers and centralises cross-cutting concerns.

? What is a cascade?
+ Try a cheap model first and escalate to a stronger one when a check fails or confidence is low
- Running all models at once
- Caching all answers
> It reduces cost if the cheap model is good enough often and the verifier is reliable.

? What is the danger of a semantic cache with a low similarity threshold?
+ It returns confident answers to different questions that merely look similar
- It is slower than exact cache
- It uses more tokens
> Tune the threshold on real traffic and scope by tenant.

? Why must a fallback model be in your evals?
+ Prompts and behaviour differ between models, so quality must be verified before an outage forces a switch
- It is faster to deploy
- Gateways require it
> Test the path you will rely on in an incident.
```

:::problem Your company has 12 teams calling three providers directly. Costs are unpredictable and an outage last month took down two products. Propose a platform plan. {level=hard tags="gateway,platform"}
Include phases, metrics and risks.

:::solution Model answer
Phase 1: deploy a **gateway** (LiteLLM/Portkey or in-house) behind an OpenAI-compatible endpoint with per-team virtual keys, central provider keys, logging and spend dashboards; migrate teams by changing base URLs. Phase 2: **budgets and quotas**, alerts, and per-team rate limits; add **retries, timeouts, circuit breakers and cross-provider fallbacks** for the critical models (verified in each team's evals). Phase 3: **routing and cascades** for high-volume tasks, **prompt and exact caching**, optional semantic cache for FAQ-like traffic with measured hit quality, plus guardrails (PII redaction, allowed regions). Metrics: availability per product, p95 added latency, spend per team/feature, cache hit rate and answer-quality audits, fallback frequency. Risks: gateway as SPOF (run multi-AZ, stateless), feature mismatch across providers, over-aggressive caching, migration friction. Provide a runbook and game-day test (kill a provider).
:::
:::

:::keypoints
- An LLM gateway gives apps one API while centralising keys, quotas, budgets, routing, retries/fallbacks, caching, observability and guardrails.
- Routing: rules, cost- or latency-based, cascades with verification, learned routers, A/B; measure quality leakage.
- Cache carefully: scope by tenant, version keys, use TTLs, tune semantic thresholds on real traffic; combine with provider prompt caching.
- Resilience needs health checks, circuit breakers, tested fallback models and rate-limit multiplexing; beware lowest-common-denominator APIs.
- Start thin (unified API, keys, logs, budgets) and add features as measured needs appear; keep the gateway highly available.
:::

:::resources
- [LiteLLM](https://github.com/BerriAI/litellm) — open-source proxy and SDK for 100+ providers.
- [Portkey gateway](https://github.com/Portkey-AI/gateway) — open-source AI gateway with routing and guardrails.
- [OpenRouter docs](https://openrouter.ai/docs) — a unified API over many models and providers.
- [Chip Huyen: Building a GenAI platform](https://huyenchip.com/2024/07/25/genai-platform.html) — the gateway and its place in the platform.
- [Claude docs: Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) — provider-side caching that gateways should preserve.
- [Eugene Yan: Patterns for Building LLM-based Systems & Products](https://eugeneyan.com/writing/llm-patterns/) — caching and guardrails patterns.
:::
