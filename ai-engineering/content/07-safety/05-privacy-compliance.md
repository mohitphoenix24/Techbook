---
title: Privacy, Data Protection and Compliance
level: intermediate
time: 45
summary: What AI engineers must know about personal data and the law (not legal advice). Data flows through an LLM application, data minimisation and redaction with reversible pseudonyms, retention, vendor and region choices, training-data policies, GDPR essentials (lawful basis, rights, DPIAs), the EU AI Act's risk tiers and obligations, sector rules, security certifications, copyright, and a data-flow inventory you can run.
---

Every LLM application moves data: user messages, documents, retrieved records, tool results, logs. If any of it is **personal, confidential, regulated or copyrighted**, you have obligations. This lesson gives engineers the vocabulary and the practices that keep systems out of trouble. It is **not legal advice**: involve your legal, privacy and security teams early, because rules vary by country, sector and contract, and they change.

## Map the data flow first

Draw where data goes. For a typical RAG chatbot:

```viz algo=arch title="Personal data flows in an LLM application" dir=down
user  User | types questions, may paste PII [user] @0,1
app   Your backend | auth, sessions [service] @1,1
ret   Retrieval + vector store | customer docs, embeddings [vector] @2,0
llm   LLM provider API | prompts leave your boundary [cloud] @2,2
log   Logs + traces | prompts and outputs stored [eval] @3,0
anl   Analytics / evals | sampled conversations [chart] @3,2
vend  Sub-processors | embedding API, observability, hosting [ext] @4,1
--
user -> app
app -> ret
app -> llm
app ~> log
log ~> anl
llm ~> vend
log ~> vend
```

For **each arrow** ask: what personal data is in it, **who receives it** (including sub-processors), **where** it is stored (region), **how long**, and **who can access** it.

## Core practices

| Practice | What to do |
|---|---|
| **Data minimisation** | send the model only what the task needs: not whole records, only relevant fields; summarise or hash identifiers |
| **Redaction / pseudonymisation** | replace names, emails, ids with placeholders before sending; restore after (reversible mapping kept in your system) |
| **Purpose limitation** | use data only for the purposes users were told about; do not silently reuse conversations for training |
| **Retention limits** | delete prompts, outputs, traces and embeddings on a schedule; support deletion requests end to end |
| **Access control** | least-privilege access to logs, datasets and vector stores; audit access |
| **Encryption** | in transit and at rest; manage keys properly |
| **Segregation** | per-tenant isolation in storage, indexes and caches |
| **Vendor management** | contracts (data processing agreements), zero or short retention modes, no-training guarantees, region pinning, security certifications |
| **Transparency** | tell users they are interacting with AI, what is collected, and how to opt out |
| **Human oversight** | for decisions that significantly affect people |

## Redact before sending, restore after

```python run title="Reversible pseudonymisation of PII around an LLM call" level=intermediate
import re, itertools

PATTERNS = {"EMAIL": r"[\w.+-]+@[\w-]+\.[\w.]+", "PHONE": r"\b\d{3}[- ]\d{3}[- ]\d{4}\b",
            "NAME": r"\b(?:Priya Sharma|John Smith)\b"}          # (production systems use NER models, not just regex)

def pseudonymise(text):
    mapping, counter = {}, itertools.count(1)
    def sub(label):
        def inner(m):
            value = m.group(0)
            for k, v in mapping.items():
                if v == value: return k                         # reuse the same placeholder for the same value
            token = f"<{label}_{next(counter)}>"
            mapping[token] = value
            return token
        return inner
    for label, pat in PATTERNS.items():
        text = re.sub(pat, sub(label), text)
    return text, mapping

def restore(text, mapping):
    for token, value in mapping.items():
        text = text.replace(token, value)
    return text

original = "Hi, I'm Priya Sharma (priya@example.com, 555-123-4567). Please update my address. Priya Sharma again."
safe, mapping = pseudonymise(original)
print("sent to the model:", safe)
name_tok = next(k for k in mapping if k.startswith("<NAME"))
email_tok = next(k for k in mapping if k.startswith("<EMAIL"))
model_reply = f"Thanks {name_tok}, we'll email {email_tok} with a confirmation."                   # stand-in for an LLM reply
print("restored for the user:", restore(model_reply, mapping))
print("mapping stays inside your boundary:", list(mapping))
```

Limits: regex misses many PII forms (free-text addresses, indirect identifiers); use proper PII detection (NER-based, e.g. Presidio) and review; **pseudonymised data is still personal data** under GDPR, since you can re-identify it.

## Vendors, regions and training policies

Questions to answer for every provider that touches your data:

1. **Is my data used to train their models?** (Enterprise/API terms usually say no by default; consumer products often differ. Read the terms.)
2. **Retention**: how long are prompts and outputs stored (abuse monitoring windows), and is **zero data retention** available?
3. **Region and residency**: where is it processed and stored? Can I pin a region (EU)?
4. **Sub-processors**: who else sees it?
5. **Certifications and attestations**: SOC 2, ISO 27001/27701/42001, HIPAA BAA, PCI scope, FedRAMP, as relevant.
6. **Security controls**: encryption, access controls, incident notification.
7. **Contractual terms**: data processing agreement, liability, audit rights.

Note provider features can be restricted under strict retention modes (for example some features or models may not be available with zero data retention), so check compatibility early.

## GDPR essentials for AI builders (EU/UK context)

- **Personal data** is any information relating to an identifiable person, including names, emails, ids, device ids, and anything that can be linked to them.
- **Lawful basis** is required to process it (consent, contract, legitimate interests, etc.), and **purpose limitation** and **data minimisation** apply.
- **Data subject rights**: access, rectification, **erasure** ("right to be forgotten"), restriction, portability, objection, and rights regarding **solely automated decisions** with significant effects. Your design must be able to **find and delete** a person's data across databases, vector stores, caches, logs and datasets.
- **DPIA** (data protection impact assessment) is required for high-risk processing; AI features often qualify.
- **Controllers and processors**: you are usually the controller; your LLM provider a processor, with a **DPA** in place.
- **International transfers** need a valid mechanism.
- **Security** of processing and **breach notification** (typically within 72 hours).

Other regimes: **CCPA/CPRA** (California), **HIPAA** (US health data: a BAA with vendors, minimum necessary rule), **GLBA/PCI** (finance/cards), **FERPA/COPPA** (education/children), India's **DPDP Act**, Brazil's **LGPD**, and many more. Children's data and health, biometric and financial data are high-risk categories almost everywhere.

### A hard question: erasure and models

Deleting a user's record from your database is straightforward; deleting what a model **learned** from it is not. Practical rule: **do not train or fine-tune on personal data unless you have a clear basis and a deletion strategy** (for example train on de-identified data, keep per-user adapters that can be deleted, or use retrieval so deletion is just removing documents). Prefer **RAG over fine-tuning** for personal data because deletion is simple.

## The EU AI Act in brief

The EU AI Act is a risk-based regulation for AI systems placed on the EU market. Key ideas (consult current texts and counsel, because application dates and details are phased and may be amended; see [the Act's explorer](https://artificialintelligenceact.eu)):

| Tier | Meaning | Examples | Obligations |
|---|---|---|---|
| **Unacceptable risk** | prohibited practices | social scoring by public authorities, manipulative or exploitative AI, certain biometric categorisation and untargeted facial scraping | banned |
| **High risk** | AI in sensitive uses (employment, education, credit, essential services, law enforcement, critical infrastructure) and safety components | CV screening, credit scoring | risk management, data governance, documentation, logging, human oversight, accuracy and robustness, conformity assessment |
| **Limited risk (transparency)** | systems that interact with people or generate content | chatbots, deepfakes | tell users they interact with AI; label synthetic content |
| **Minimal risk** | everything else | spam filters, games | voluntary codes |
| **General-purpose AI (GPAI) models** | obligations for model providers | foundation models | technical documentation, copyright policy, training-data summary; extra duties for models with systemic risk |

As an **application builder** (a "deployer" or sometimes "provider" of an AI system), classify your use case early: a recruitment screening tool is high-risk even if it uses a third-party model, and you inherit documentation, oversight and monitoring duties.

## Copyright, licensing and content

- **Training and outputs**: legal treatment of training on copyrighted works and of ownership of AI output varies and is being litigated; check provider **indemnities** and terms.
- **RAG and quoting**: reproducing copyrighted passages at length can infringe; prefer summarising and linking; respect robots/TDM opt-outs when crawling.
- **Licences** for open models and datasets (research-only, non-commercial, attribution, use-based restrictions) must be honoured.
- **Content provenance**: label AI-generated media (watermarks, C2PA metadata) where required or sensible.

## Security programme basics

Privacy depends on security: SSO and MFA, secrets management, network controls, vulnerability management, logging and monitoring, incident response, vendor reviews, and **secure SDLC** practices. Customers will ask for **SOC 2** or **ISO 27001** evidence; ISO/IEC 42001 and the NIST AI RMF structure AI-specific governance.

## A runnable data-flow inventory

An inventory makes reviews concrete and can be checked automatically.

```python run title="Check a data-flow inventory against policy" level=intermediate
flows = [
    {"name": "chat -> LLM API",        "data": {"pii", "business"},       "processor": "llm_provider",   "region": "us", "retention_days": 30, "dpa": True,  "no_training": True},
    {"name": "docs -> embedding API",  "data": {"business"},              "processor": "embed_provider", "region": "eu", "retention_days": 0,  "dpa": True,  "no_training": True},
    {"name": "traces -> observability","data": {"pii", "business"},       "processor": "obs_vendor",     "region": "us", "retention_days": 365,"dpa": False, "no_training": True},
    {"name": "eval export -> labeling","data": {"pii"},                   "processor": "labeling_vendor","region": "in", "retention_days": 90, "dpa": True,  "no_training": False},
]
POLICY = {"pii_regions": {"eu", "us"}, "max_pii_retention": 90, "require_dpa": True, "require_no_training": True}

for f in flows:
    issues = []
    if "pii" in f["data"]:
        if f["region"] not in POLICY["pii_regions"]: issues.append(f"PII processed in region {f['region']!r} (approved: {sorted(POLICY['pii_regions'])})")
        if f["retention_days"] > POLICY["max_pii_retention"]: issues.append(f"PII retained {f['retention_days']} days (max {POLICY['max_pii_retention']})")
    if POLICY["require_dpa"] and not f["dpa"]: issues.append("no data processing agreement")
    if POLICY["require_no_training"] and not f["no_training"]: issues.append("vendor may train on this data")
    print(f"{'OK ' if not issues else 'FIX'} {f['name']}")
    for i in issues: print("      -", i)
```

## Engineering checklist

1. Maintain a **data inventory and flow diagram**; review when features change.
2. **Minimise and redact** before data leaves your boundary; log less.
3. Choose vendors with **no-training, retention and region** controls; sign DPAs.
4. Implement **deletion and access requests** across stores, indexes, caches and logs.
5. Prefer **retrieval to training** for personal data.
6. **Classify your use case** under the AI Act and applicable sector rules; do DPIAs for high-risk processing.
7. Add **transparency** (AI disclosure, content labels) and **human oversight** where decisions affect people.
8. Build **security basics** and incident response; test deletion and breach drills.
9. Keep **documentation** (model cards, system descriptions, evals, risk assessments): regulators and customers ask for it.

```quiz
? Is pseudonymised data still personal data under GDPR?
+ Yes, if it can be re-identified (for example via a mapping you hold)
- No, placeholders remove all obligations
- Only for EU citizens
> Pseudonymisation reduces risk but does not make data anonymous.

? Why is RAG usually better than fine-tuning for personal data?
+ Deleting a person's documents from the retrieval store is easy; removing what a model learned is not
- RAG is cheaper
- Fine-tuning is illegal
> Retrieval keeps data deletable and access-controlled.

? Under the EU AI Act, a chatbot that interacts with people mainly triggers which kind of obligation?
+ Transparency: users must be told they are interacting with AI (plus any applicable higher-tier rules)
- A ban
- No obligation of any kind
> Classify the use case; hiring or credit tools are high-risk.

? What should you check about an LLM vendor before sending personal data?
+ Training use, retention/zero-retention options, region, sub-processors, certifications and the DPA
- Only the price
- Only latency
> Vendor terms determine your compliance posture.
```

:::problem A healthcare startup wants to summarise patient notes with an LLM API. Outline the privacy approach. {level=hard tags="privacy,healthcare"}
Cover legal, technical and process aspects at a high level.

:::solution Model answer
Confirm applicable regimes (HIPAA in the US, GDPR special-category health data in the EU) and involve counsel/privacy officer. Choose a vendor offering a **BAA/DPA**, **zero or minimal retention**, **no training**, region pinning and relevant certifications (and check feature availability under those modes). **Minimise**: send only needed note sections, de-identify (names, dates, ids) before sending using robust PII/PHI detection, re-attach identifiers after. Encrypt in transit/at rest, isolate tenants, restrict and log access, short retention for prompts and traces (or metadata-only logging). Keep a **human clinician in the loop** and show source text with summaries; evaluate faithfulness. Do a **DPIA/risk assessment**, document data flows, and have breach-response and deletion processes. Prefer retrieval over fine-tuning on patient data.
:::
:::

:::keypoints
- Map every data flow: what personal data, who receives it, where, how long, who can access it.
- Practise minimisation, redaction/pseudonymisation, purpose limitation, retention limits, encryption, tenant isolation and access control.
- Vet vendors: training use, retention, region, sub-processors, certifications, DPA; check feature trade-offs under strict modes.
- Know GDPR basics (lawful basis, rights including erasure, DPIA, transfers) and sector rules (HIPAA, PCI, CCPA); prefer RAG over training on personal data.
- Classify your use under the EU AI Act risk tiers; handle copyright, licences and provenance; keep documentation; get legal advice.
:::

:::resources
- [EU AI Act explorer](https://artificialintelligenceact.eu) — the text, summaries and timeline.
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — governance practices.
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) — sensitive information disclosure and related risks.
- [Microsoft Presidio](https://github.com/microsoft/presidio) — open-source PII detection and anonymisation.
- [Claude docs: Intro](https://docs.claude.com/en/docs/intro) — provider documentation and links to data-handling, retention and compliance information.
- [OpenAI: Safety best practices](https://platform.openai.com/docs/guides/safety-best-practices) — data and abuse-monitoring guidance for API users.
:::
