---
title: Security, Secrets and Multi-Tenancy
level: advanced
time: 35
summary: Production security for LLM apps beyond the safety module. Threat model of an LLM service, API key and secret management, least privilege for tools and retrieval, tenant isolation in indexes, caches and logs, authorization on the server not in the prompt, abuse and cost attacks, audit logging, supply chain and model risks, and a runnable tenant-isolation test. Complements the OWASP and injection lessons.
---

The safety module covered **prompt injection, guardrails and privacy** as AI-specific risks. This lesson covers the **conventional security engineering** that decides whether an LLM feature is safe to run for real customers: identity, secrets, isolation, authorization, abuse and auditing. The unifying principle:

> **The model is an untrusted component.** Anything it can read, say or do must be authorised by code outside the model, as if a stranger on the internet were typing the requests.

## Threat model in one table

| Asset | Threat | Primary control |
|---|---|---|
| **Provider API keys** | leak via client code, logs, repos; theft then cost abuse | keep server-side, secrets manager, rotation, per-env keys, spend limits |
| **Customer data** (documents, chats) | cross-tenant leakage via retrieval, caches, logs, fine-tunes | tenant filters enforced in the data layer, separate indexes, redaction |
| **Tools and actions** | injection or error makes the model delete, send or spend | least privilege, confirmation on risky actions, scoped credentials |
| **Your prompts and logic** | extraction via prompt leaking | assume prompts are public; keep secrets out of prompts |
| **Budget** | denial-of-wallet: loops, huge inputs, abusive users | quotas, token caps, per-user limits, anomaly alerts |
| **Availability** | flooding, expensive requests, provider quota exhaustion | rate limits, queues, fairness (previous lessons) |
| **Supply chain** | malicious packages, models, MCP servers, notebooks | pin and verify dependencies, vet third-party tools |
| **Integrity of outputs** | model produces unsafe code, links or HTML | output encoding, sandboxing, validation |

## Secrets and keys

- **Never ship provider keys to browsers or mobile apps.** Call your backend, which holds the key. Direct-from-client calls need short-lived, scoped, per-user tokens issued by your server.
- Store secrets in a **secrets manager** (cloud KMS/Secret Manager, Vault), not in code, images, `.env` files committed to git, or prompts. Inject at runtime.
- **Rotate** keys, use **separate keys per environment and service**, set **spend caps and alerts**, and enable secret scanning in CI (GitHub secret scanning, gitleaks, trufflehog).
- Do not log full request headers, and **redact** secrets and tokens in traces.
- **Never put secrets in the prompt** (the model can be induced to repeat them). If a tool needs a credential, the tool runtime holds it; the model only names the tool and arguments.
- A leaked key is an incident: revoke, rotate, review usage, and add the detection that would have caught it.

## Authorization belongs in code, not in prompts

A system prompt saying "only show the user their own data" is **not access control**. Enforce authorisation where the data is fetched:

1. **Authenticate** the caller and resolve their identity and tenant at the gateway.
2. **Pass identity through** to retrieval and tool calls (never let the model choose the user id or tenant id).
3. **Filter at the data layer**: every vector query, SQL query and API call carries the tenant/user constraint added by trusted code. Prefer **row-level security** or per-tenant indexes/namespaces.
4. **Check permissions on retrieved chunks** (ACLs from the source system) before they reach the prompt.
5. **Authorise each tool call** against the user's rights, regardless of what the model asked for.
6. **Confirm risky actions** with the user (send, delete, pay), with the action shown in plain language.

```python run title="Tenant isolation: enforce it in the query, then test it" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
DOCS = [{"id": i, "tenant": ["acme", "globex"][i % 2], "text": f"doc {i}", "vec": rng.normal(size=8)} for i in range(10)]

def search_unsafe(query_vec, k=3):                         # BAD: global search, then "trust the prompt" to hide other tenants
    return sorted(DOCS, key=lambda d: -float(d["vec"] @ query_vec))[:k]

def search_safe(query_vec, tenant, k=3):                   # GOOD: the tenant constraint is part of the query, set by trusted code
    candidates = [d for d in DOCS if d["tenant"] == tenant]
    return sorted(candidates, key=lambda d: -float(d["vec"] @ query_vec))[:k]

q = DOCS[1]["vec"] + 0.01                                  # a query that happens to be closest to a globex document
leaks = [d["id"] for d in search_unsafe(q) if d["tenant"] != "acme"]
print("unsafe search for tenant acme returned other-tenant docs:", leaks)
assert all(d["tenant"] == "acme" for d in search_safe(q, "acme")), "isolation broken"
print("safe search for acme returned only:", [d["id"] for d in search_safe(q, "acme")], "-> isolation holds")

# a property test you can run in CI: for random queries and every tenant, results never cross tenants
for tenant in ("acme", "globex"):
    for _ in range(200):
        res = search_safe(rng.normal(size=8), tenant)
        assert all(d["tenant"] == tenant for d in res)
print("200 random queries x 2 tenants: no cross-tenant results")
```

## Multi-tenancy patterns

| Pattern | Isolation | Cost | Use when |
|---|---|---|---|
| **Shared index with tenant filter** | logical (filter must be enforced everywhere) | lowest | many small tenants; strong code discipline and tests |
| **Namespace/collection per tenant** | stronger logical | low-medium | moderate tenant counts; easy deletion per tenant |
| **Separate index/database per tenant** | strong | higher | regulated or large customers |
| **Separate deployment/account per tenant** | strongest | highest | strict compliance, data residency, bring-your-own-key |

Everywhere state is stored needs the same treatment: **vector indexes, caches (semantic caches especially), conversation memory, uploaded files, logs and traces, fine-tuned models, evals**. A **semantic cache shared across tenants** can leak one customer's answer to another; scope the cache key by tenant (and by permission set). Deletion requests must reach all of these stores.

## Tool and agent privileges

- Give each tool the **narrowest credential** that works (read-only database role, one repo, one mailbox), preferably **per user via OAuth on-behalf-of**, not a god-mode service account.
- **Sandbox code execution** (containers/microVMs/WASM, no network by default, resource limits, no secrets in the environment).
- Separate **read tools** from **write tools**; require confirmation, dry-run or approval queues for writes and irreversible steps.
- **Validate tool arguments** in code (schemas, allow-lists, ranges); never pass model output to a shell, SQL or `eval` unsanitised.
- Treat **MCP servers and third-party tools** as code you are running: review, pin versions, restrict network and file access, and watch for tool-description poisoning.

## Abuse, cost attacks and fairness

- **Denial of wallet**: attackers (or buggy clients) trigger many expensive calls. Use **per-user and per-tenant quotas**, token caps per request, max steps for agents, CAPTCHA or proof of work on anonymous endpoints, and **spend alerts**.
- **Prompt-extraction and model-extraction** attempts: rate limit, detect bulk systematic querying, avoid exposing logprobs unless needed.
- **Content abuse** (spam, harassment, illegal content): moderation on inputs and outputs, abuse reporting, account enforcement.
- **Fair use across tenants**: quotas and priority classes (see the scaling lesson).

## Audit logging and incident response

Log **who did what, when, with which data**: authentication events, prompt/response metadata, retrieved document ids, tool calls and results, admin actions, policy blocks. Make logs **tamper-evident** and access-controlled. Prepare runbooks: **kill switch** per feature/tool, ability to disable a tenant, key rotation procedure, data-deletion procedure, and a way to notify affected customers. Practise with tabletop exercises (for example: "injection caused an email to be sent to the wrong customer").

## Supply chain and model risk

- **Dependencies**: pin versions, use lockfiles, scan for vulnerabilities (pip-audit, npm audit, Dependabot), and be wary of packages that sound like popular ones (typosquatting, including hallucinated package names suggested by code models: "slopsquatting").
- **Model files**: load weights in **safetensors** rather than pickle formats that can execute code; use trusted sources and verify hashes.
- **Third-party models and APIs**: review data-handling terms (retention, training use, sub-processors), region, certifications (SOC 2, ISO 27001, HIPAA BAA if relevant), and incident history.
- **Prompt and dataset provenance**: know where your prompts, few-shot examples and fine-tuning data came from and who can edit them.

## Compliance hooks

Map controls to your obligations early: **SOC 2 / ISO 27001** evidence (access control, logging, change management), **GDPR** (lawful basis, DPA with providers, deletion, data minimisation, cross-border transfers), **HIPAA** (BAAs, PHI handling), and the **EU AI Act** (risk classification, transparency, documentation; see the safety module). Keep a **data-flow diagram** showing where user data goes, including the model provider and every log sink.

```quiz
? Why is "only show the user their own data" in the system prompt not sufficient access control?
+ The model can be manipulated or err; authorisation must be enforced in code at the data layer
- System prompts are never read
- It is too long
> Treat the model as untrusted; enforce tenant filters in queries and tool calls.

? Where should provider API keys live in a consumer web app?
+ On your server in a secrets manager; clients call your backend (or use short-lived scoped tokens)
- In the JavaScript bundle
- In the system prompt
> Anything shipped to a client is public.

? What is a risk of a semantic cache shared across tenants?
+ One tenant's answer could be returned to another tenant
- It is slower
- It breaks streaming
> Scope cache keys by tenant and permissions.

? What is "denial of wallet"?
+ Abusive or buggy usage that drives up your model spend; mitigated by quotas, caps and alerts
- A database lock
- Losing a payment card
> Cost is an attack surface for LLM apps.
```

:::problem Design the access control for a "chat with your company's documents" assistant used by 200 enterprise customers, where each document has its own permission list in the source system. {level=hard tags="security,design"}
Cover indexing, query time, caches and deletion.

:::solution Model answer
At ingest, store with each chunk the **tenant id and the source ACL** (users, groups) and a **sync job** that refreshes permissions (permissions change more often than content). At query time, the gateway authenticates the user and expands their **group memberships**; retrieval runs with a **mandatory filter** (tenant AND ACL intersects user principals) added by trusted code, ideally with per-tenant namespaces; retrieved chunks are **re-checked** against the source system or a fresh ACL cache before entering the prompt. Tools use **on-behalf-of tokens**, not a global service account. Caches are keyed by tenant and permission set (or disabled for sensitive content). Logs store chunk ids and are access-controlled and redacted. **Deletion and permission revocation** propagate to the index, caches, memory and eval sets within an SLA. Test with automated **isolation tests** (users must never retrieve forbidden documents, including via prompt-injection attempts) in CI and with red-teaming. Provide audit logs of who accessed which documents.
:::
:::

:::keypoints
- Treat the model as untrusted: authorise everything in code, outside the prompt.
- Keep provider keys and secrets server-side in a secrets manager; rotate, scope, cap spend, scan for leaks, never put secrets in prompts.
- Enforce tenant and permission filters at the data layer for retrieval, tools, caches, memory and logs; test isolation automatically.
- Give tools least-privilege, per-user credentials; sandbox code; confirm risky writes; vet third-party tools and MCP servers.
- Defend against denial of wallet and abuse with quotas, caps and alerts; keep audit logs and incident runbooks.
- Pin dependencies, prefer safetensors, review provider terms, and map controls to compliance obligations.
:::

:::resources
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) — the standard risk list.
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org) — practical secure-coding guidance (secrets, authorisation, logging).
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — risk management structure for AI systems.
- [Simon Willison: The lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) — why private data + untrusted content + exfiltration is dangerous.
- [Safetensors](https://huggingface.co/docs/safetensors) — a safe weight format.
- [Claude docs: Reduce prompt leak and jailbreaks](https://docs.claude.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-prompt-leak) — mitigation guidance.
:::
