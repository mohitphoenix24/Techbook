---
title: The Risk Landscape — Threat-Modelling an AI System
level: intermediate
time: 45
summary: A structured way to think about what can go wrong. Assets, actors and trust boundaries for LLM applications, the OWASP Top 10 for LLM applications walked through with examples, how AI risk frameworks (NIST AI RMF, MITRE ATLAS) fit in, defence in depth, and a runnable threat-model scorer that ranks risks by likelihood and impact.
---

Security and safety for AI systems is not a single feature; it is a way of thinking. A model that can read untrusted text and take actions is a **new kind of component**: it follows instructions written in natural language, cannot reliably tell instructions from data, and behaves probabilistically. This module teaches you to design around that fact. We start with the map.

:::def Safety vs security
**Safety** is about the system not causing harm in normal and misused operation: harmful content, bad advice, bias, unsafe actions. **Security** is about resisting adversaries: injection, data theft, abuse, supply-chain attacks. The two overlap heavily in LLM systems (an injection attack is a security issue that causes a safety harm), so treat them together.
:::

## Threat modelling in five questions

A threat model is a structured answer to:

1. **What are we protecting?** (assets)
2. **Who might attack, or misuse it, and what do they want?** (actors and motives)
3. **Where does untrusted data enter, and where can the model act?** (entry points and capabilities)
4. **What could go wrong?** (threats)
5. **What do we do about it, and how do we know it works?** (controls and tests)

### Assets in an LLM application

| Asset | Examples |
|---|---|
| **User and customer data** | conversations, uploaded files, PII, account information |
| **Business data** | internal documents, source code, pricing, contracts |
| **Credentials and capabilities** | API keys, OAuth tokens, database access, the ability to send email or move money |
| **The system prompt and logic** | proprietary instructions, tool definitions |
| **The model and its weights** (if you host them) | IP, fine-tuned behaviour |
| **Reputation and trust** | brand safety, correct and fair outputs |
| **Compute and budget** | tokens and GPU time (denial-of-wallet attacks) |

### Actors

External users (curious, malicious, or competitors), **third parties whose content you ingest** (anyone who can write a web page, email, document or issue your agent will read), **insiders**, **supply-chain attackers** (poisoned models, packages, MCP servers, datasets), and **accidental misuse** by well-meaning users.

### Trust boundaries

Draw them explicitly. Everything crossing from a less-trusted zone into the model's context is **untrusted input**, including things that look like yours (retrieved documents, tool results, memory).

```viz algo=arch title="Trust boundaries in an LLM application" dir=down
user  End user | semi-trusted [user] @0,1
web   Web pages, emails, files | UNTRUSTED [ext] @0,2.6
app   Your application code | trusted [service] @1,1.8
llm   LLM | follows instructions in ANY text [llm] @2,1.8
tools Tools: DB, email, code | powerful [tool] @3,1
mem   Memory / vector store | partly trusted [vector] @3,2.6
out   Output to user/UI | rendered by browser [guard] @4,1.8
--
user -> app
web -> app : ingested content
app -> llm
llm -> tools : actions
llm <-> mem
llm -> out
```

Key insight: the model sits at the point where **untrusted text, secret data and powerful actions meet**.

## The OWASP Top 10 for LLM Applications

The [OWASP GenAI Security Project](https://genai.owasp.org/llm-top-10/) publishes a ranked list of the most critical LLM application risks (the 2025 edition is summarised here; check the site for updates):

| # | Risk | What it is | Example | Primary defences |
|---|---|---|---|---|
| **LLM01** | **Prompt injection** | inputs (direct or hidden in content) alter the model's behaviour | a web page tells the agent to exfiltrate data | architecture and privilege limits; filtering; approvals (next lesson) |
| **LLM02** | **Sensitive information disclosure** | the model reveals PII, secrets or proprietary data | training-data memorisation; leaking another tenant's data via retrieval | data minimisation; access control at retrieval; redaction; output filters |
| **LLM03** | **Supply chain** | compromised models, datasets, packages, plugins, MCP servers | a trojaned open model or malicious dependency | provenance, signing, scanning, pinned versions, sandboxing |
| **LLM04** | **Data and model poisoning** | tampered training, fine-tuning or retrieval data plants backdoors or bias | poisoned documents in a RAG corpus | data vetting, access control on ingestion, anomaly checks; backdoor testing ([Sleeper Agents](https://arxiv.org/abs/2401.05566)) |
| **LLM05** | **Improper output handling** | model output used unsanitised downstream | LLM-generated HTML/JS/SQL/shell executed or rendered | treat output as untrusted: escape, parameterise, sandbox, validate |
| **LLM06** | **Excessive agency** | too many tools, permissions or autonomy | agent with delete rights deletes data on a bad instruction | least privilege, approvals, narrow tools |
| **LLM07** | **System prompt leakage** | secrets or logic in the prompt get extracted | prompt contains API keys or access rules | never put secrets in prompts; enforce rules in code |
| **LLM08** | **Vector and embedding weaknesses** | attacks on retrieval: poisoning, inversion, cross-tenant leakage | embeddings reveal source text; permission bypass | tenant isolation, ACL filters, encryption, ingestion controls |
| **LLM09** | **Misinformation** | confident wrong or fabricated outputs, over-reliance | hallucinated legal citations | grounding, verification, UX that signals uncertainty |
| **LLM10** | **Unbounded consumption** | resource abuse: long inputs, loops, denial of wallet | an attacker forces huge agent loops | rate limits, budgets, quotas, timeouts |

Other frameworks to know:

- **NIST AI Risk Management Framework** ([site](https://www.nist.gov/itl/ai-risk-management-framework)): governance-oriented functions (Govern, Map, Measure, Manage) for organisational AI risk.
- **MITRE ATLAS** ([site](https://atlas.mitre.org)): a knowledge base of adversary tactics and techniques against AI systems, modelled on ATT&CK.
- **ISO/IEC 42001** (AI management systems) and sector rules; the **EU AI Act** (privacy-and-compliance lesson).

## Defence in depth

No single control stops everything, so layer them:

:::flow Layers of defence
Design | minimise capabilities and data; separate duties; threat-model first
Identity and access | per-user permissions; least privilege; scoped credentials
Input controls | sanitise, classify, rate-limit, delimit untrusted content
Model-level | system-prompt hygiene, instruction hierarchy, safety-trained models
Output controls | validate, filter, escape; never execute blindly
Action controls | approvals for risky tools; budgets; sandboxes
Monitoring | logging, anomaly detection, alerts, incident response
Testing | red-teaming, adversarial evals in CI
:::

The most reliable layers are **architectural** (what the system *can* do), not **behavioural** (what the model is *asked* to do). A prompt saying "never reveal data" can be argued out of; a system that cannot read the data cannot leak it.

## Score your risks

A lightweight way to prioritise: rate each threat's **likelihood** and **impact** (1–5), multiply, and attack the top of the list. Adjust impact for your context: a medical advice bot and a recipe bot have very different tolerances.

```python run title="A tiny threat-model scorer" level=easy
threats = [
    # (name, likelihood 1-5, impact 1-5, current control strength 0-1)
    ("Indirect prompt injection via retrieved web pages",  5, 4, 0.2),
    ("Cross-tenant data leak through shared vector index",  3, 5, 0.5),
    ("Secrets embedded in the system prompt are extracted", 4, 3, 0.1),
    ("LLM-generated SQL run with write access",             2, 5, 0.3),
    ("Denial-of-wallet via unbounded agent loops",          4, 3, 0.6),
    ("Hallucinated citation in a legal summary",            4, 4, 0.4),
]
rows = sorted(((n, l * i, l * i * (1 - c)) for n, l, i, c in threats), key=lambda r: -r[2])
print(f"{'residual risk':>13} {'inherent':>9}  threat")
for name, inherent, residual in rows:
    print(f"{residual:>13.1f} {inherent:>9}  {name}")
```

Residual risk = inherent risk × (1 − control strength). It is subjective, but it forces the conversation about **what to fix first**.

## Safety is also product design

Many AI harms come from **over-reliance and misleading UX**, not attacks:

- Show **limits and uncertainty**; do not present generated text as authoritative.
- Provide **sources** and ways to verify.
- Offer **escalation to humans** for high-stakes topics (medical, legal, financial, self-harm).
- Design **friction** where mistakes are costly (confirmations, previews).
- State clearly that the user is talking to an **AI** where appropriate (and where law requires).

## Build safety into the lifecycle

| Stage | Safety activities |
|---|---|
| **Design** | threat model; data classification; decide autonomy level and approvals |
| **Build** | least-privilege tools; input/output handling; secrets management |
| **Test** | adversarial evals; red-teaming; privacy and bias checks |
| **Launch** | staged rollout; kill switch; incident runbook; documentation |
| **Operate** | monitoring; abuse detection; periodic re-testing; model-update reviews |
| **Retire** | data deletion; credential revocation |

```quiz
? Where do untrusted inputs enter an LLM application?
- Only through the user's chat box
+ Anywhere text enters the context: user messages, retrieved documents, web pages, emails, tool results, memory
- Only through the API
> Every source of text in the prompt can carry instructions.

? Why are architectural defences stronger than prompt-based ones?
+ A system that cannot do or access something cannot be tricked into doing it, whereas instructions can be argued around
- Prompts are always ignored
- Architecture is cheaper
> Limit capabilities and data; do not rely on the model's obedience.

? Which OWASP LLM risk covers an agent that has more permissions than its task needs?
- Prompt injection
+ Excessive agency
- Supply chain
> Least privilege reduces the blast radius of every other failure.

? What is a good first step in a threat model?
+ List assets, actors, entry points and the capabilities the model has
- Pick a guardrail product
- Write the system prompt
> You cannot defend what you have not mapped.
```

:::problem Threat-model an AI email assistant that can read your inbox, search the web and send emails on your behalf. {level=medium tags="threat model,agents"}
List the key threats and top three mitigations.

:::solution Model answer
**Assets:** private email contents, contacts, credentials, ability to send as the user. **Untrusted inputs:** incoming emails and web pages. **Key threats:** (1) **indirect prompt injection** in an email or page instructing the assistant to forward private mail (data exfiltration), (2) **excessive agency** (sending/deleting without review), (3) **sensitive information disclosure** via the model's summaries or logs, (4) phishing content produced or acted upon, (5) denial-of-wallet loops. **Top mitigations:** separate read and send capabilities; **human approval for every outgoing email** (show recipient and content) and an allow-list of recipients; treat email text as untrusted data with spotlighting and no tool authority; scoped OAuth tokens; log and rate-limit; adversarial tests with injected emails.
:::
:::

:::keypoints
- Threat-model first: assets, actors, trust boundaries, entry points, capabilities, threats, controls.
- The LLM sits where untrusted text, sensitive data and powerful actions meet; everything entering the context is untrusted.
- Know the OWASP LLM Top 10 (injection, sensitive disclosure, supply chain, poisoning, improper output handling, excessive agency, prompt leakage, vector weaknesses, misinformation, unbounded consumption) plus NIST AI RMF and MITRE ATLAS.
- Layer defences; prefer architectural controls (least privilege, isolation, approvals) over prompt instructions.
- Safety includes UX: limits, sources, escalation, friction; build it into every lifecycle stage.
:::

:::resources
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) — the canonical risk list with examples and mitigations.
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — governance and risk functions.
- [MITRE ATLAS](https://atlas.mitre.org) — adversarial tactics against AI systems.
- [Simon Willison's weblog](https://simonwillison.net) — a running record of real LLM security issues and defences.
- [Not what you've signed up for: Compromising Real-World LLM-Integrated Applications](https://arxiv.org/abs/2302.12173) — the indirect prompt-injection paper.
- [Anthropic: Claude docs, Strengthen guardrails](https://docs.claude.com/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks) — practical mitigation guidance.
:::
