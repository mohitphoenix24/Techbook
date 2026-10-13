---
title: Responsible AI in Practice — Fairness, Transparency, Oversight and Impact
level: intermediate
time: 40
summary: The human side of shipping AI. Bias and fairness (where it comes from, how to measure disparities with real metrics), transparency and documentation (system cards, model cards, disclosures), meaningful human oversight, accountability and incident response, content provenance, environmental footprint and the practical governance habits that make "responsible AI" concrete rather than a slogan.
---

Responsible AI is not a separate project after the engineering is done. It is the set of **practices that make a system trustworthy for the people it affects**: fair, transparent, accountable, safe and respectful of their autonomy and data. This lesson turns the slogans into engineering tasks.

## Where harm comes from

| Source | Example |
|---|---|
| **Training-data bias** | a resume screener learns historical hiring patterns and replicates discrimination |
| **Representation gaps** | a speech model works poorly for some accents; a vision model for some skin tones |
| **Label and judge bias** | human labellers' or LLM judges' preferences become the "ground truth" |
| **Proxy variables** | postcode stands in for protected attributes |
| **Feedback loops** | recommendations shape the data used to train the next model |
| **Use outside intended scope** | a tool designed for triage used for final decisions |
| **Automation bias** | humans over-trust the AI's suggestion |
| **Stereotyping in generated content** | images or stories that reinforce stereotypes |

LLM-specific: models reflect biases in web-scale text, may behave differently across **languages, dialects and names**, and can be **more or less safe/helpful** depending on who appears to be asking.

## Measuring fairness

You cannot fix what you do not measure. Define **groups** relevant to your context (and lawful to analyse), then compare outcomes:

| Metric | Meaning | Example |
|---|---|---|
| **Demographic (statistical) parity** | the rate of positive outcomes is equal across groups | loan approval rate by group |
| **Equal opportunity** | among people who *deserve* a positive outcome, the true-positive rate is equal | qualified applicants approved at equal rates |
| **Equalised odds** | both true-positive and false-positive rates are equal | |
| **Calibration by group** | a score of 0.7 means the same thing for every group | |
| **Disparate impact ratio** | ratio of selection rates; the "four-fifths rule" flags ratios below 0.8 | employment screening |
| **Counterfactual tests** | change only a protected attribute or name; does the output change? | same resume, different name |

These metrics **cannot all be satisfied at once** in general (known impossibility results), so choose based on the harm model and legal context, and document the choice.

```python run title="Measure group disparities in a screening system" level=intermediate
import numpy as np

# outcomes of a screening model: group, truly_qualified (ground truth), selected (model decision)
data = ([("A", 1, 1)] * 70 + [("A", 1, 0)] * 10 + [("A", 0, 1)] * 10 + [("A", 0, 0)] * 60 +
        [("B", 1, 1)] * 40 + [("B", 1, 0)] * 40 + [("B", 0, 1)] * 5 + [("B", 0, 0)] * 65)

def rates(rows):
    g = np.array([[q, s] for _, q, s in rows])
    q, s = g[:, 0], g[:, 1]
    selection = s.mean()
    tpr = s[q == 1].mean()                       # of qualified people, how many were selected
    fpr = s[q == 0].mean()                       # of unqualified people, how many were selected
    return selection, tpr, fpr

by_group = {name: rates([r for r in data if r[0] == name]) for name in ("A", "B")}
for name, (sel, tpr, fpr) in by_group.items():
    print(f"group {name}: selection rate {sel:.0%}  true-positive rate {tpr:.0%}  false-positive rate {fpr:.0%}")
sel_a, sel_b = by_group["A"][0], by_group["B"][0]
print(f"\ndisparate impact ratio (B/A) = {sel_b / sel_a:.2f}  ({'below 0.8: potential adverse impact' if sel_b / sel_a < 0.8 else 'ok'})")
print(f"equal-opportunity gap = {by_group['A'][1] - by_group['B'][1]:.0%} (qualified people in group B are selected far less often)")
```

For **LLM applications**, practical bias testing includes:

- **Counterfactual prompts**: swap names, genders, nationalities or dialects in otherwise identical inputs and compare outputs (quality, tone, refusals, recommendations).
- **Benchmarks** such as BBQ and others for social bias in QA, plus **your own domain cases**.
- **Language coverage**: evaluate quality and safety in every language you serve, not just English.
- **Disaggregated evals**: report quality **by user segment** instead of one average.

```python run title="A counterfactual test: swap names, compare the outputs" level=easy
def stand_in_reviewer(resume_text):
    """A deliberately biased stand-in so the test has something to find."""
    score = 70 + 5 * ("python" in resume_text.lower()) + 5 * ("led a team" in resume_text.lower())
    if resume_text.startswith(("Jamal", "Lakisha")): score -= 8                     # injected bias for the demo
    return score

template = "{name}, 5 years experience. Skills: Python, SQL. Led a team of 4."
names = ["Emily", "Greg", "Jamal", "Lakisha", "Priya", "Wei"]
scores = {n: stand_in_reviewer(template.format(name=n)) for n in names}
print(scores)
spread = max(scores.values()) - min(scores.values())
print(f"score spread across names on an identical resume: {spread} points ->", "FAIL: investigate" if spread > 2 else "ok")
```

## Transparency and documentation

People deserve to know when they interact with AI, what it can and cannot do, and how decisions are made.

| Artefact | Audience | Contents |
|---|---|---|
| **AI disclosure in the UI** | users | "You're chatting with an AI assistant"; limitations; how to reach a human |
| **System card / use-case documentation** | internal reviewers, regulators, customers | purpose, intended and prohibited uses, data sources, model(s) and versions, architecture, evals and results, known limitations, safeguards, human oversight, monitoring |
| **Model cards** ([Mitchell et al.](https://arxiv.org/abs/1810.03993)) | users of a model | training data summary, intended use, performance by group, limitations |
| **Data sheets for datasets** | data users | provenance, collection, labelling, composition, licences |
| **Decision explanations** | affected individuals | the main factors and how to contest the decision (where required) |
| **Change log and incident log** | operators | prompt/model/policy changes, incidents and fixes |

Honest **explanations** of LLM decisions are hard: a model's stated reasoning may not reflect its actual computation. Prefer **evidence-based explanations** (sources quoted, rules applied, data used) over the model's narrative of why.

## Human oversight that actually works

"A human reviews it" is only a safeguard if the human can **really** catch errors:

- **Give reviewers the evidence**, not just the AI's conclusion: sources, key facts highlighted, alternatives, confidence.
- **Calibrate workload**: review fatigue leads to rubber-stamping; sample or prioritise by risk.
- **Beware automation bias** and anchoring: measure how often reviewers override the AI, and whether they catch seeded errors.
- **Make overriding easy** and record reasons: they become training and eval data.
- **Define authority**: who may accept, edit, reject, or escalate, and who is accountable.
- **Match oversight to stakes**: human-in-the-loop (approves each decision), human-on-the-loop (monitors and can intervene), human-over-the-loop (sets policy and audits).

```python run title="Is the human reviewer actually catching errors? (seeded-error audit)" level=easy
reviews = [  # (ai_was_wrong, human_flagged)
    *[(True, True)] * 12, *[(True, False)] * 8,        # 20 seeded errors: reviewers caught 12
    *[(False, False)] * 170, *[(False, True)] * 10,    # 180 correct AI outputs: 10 unnecessary flags
]
wrong = [r for r in reviews if r[0]]
catch_rate = sum(h for _, h in wrong) / len(wrong)
false_alarm = sum(h for a, h in reviews if not a) / sum(1 for a, _ in reviews if not a)
print(f"error catch rate {catch_rate:.0%}   false-alarm rate {false_alarm:.0%}")
print("human 'oversight' catches only", f"{catch_rate:.0%}", "of seeded errors: do not count it as a strong control without improving the review UX")
```

## Accountability, governance and incidents

- **Owners**: every AI system has a named accountable owner and a review body for high-risk uses.
- **Risk assessment before launch** (use case, harms, affected groups, mitigations) and **periodic review**.
- **Policy**: acceptable-use rules, prohibited use cases, data rules, vendor rules.
- **Incident response**: detect, triage, contain (kill switch, safe mode), communicate (users, regulators when required), fix, learn (blameless review), add tests.
- **Complaint and redress channels** for people affected by decisions.
- **Audit trail**: logs sufficient to reconstruct what happened and why.

## Content provenance and misuse

Generative models create text, images, audio and video that can deceive. Mitigations: **disclosure and labelling** of AI-generated content, **watermarks** and **provenance metadata** (C2PA content credentials), policies against impersonation and non-consensual content, and abuse monitoring on generation endpoints. For text, reliable detection is **not** technically solved, so do not base decisions (like academic penalties) on AI-text detectors.

## Environmental and economic footprint

Training and serving models consume energy and water. Per-query inference energy is small but large at scale ([From Words to Watts](https://arxiv.org/abs/2310.03003) benchmarks inference energy). As an engineer you influence it through **model choice (right-size)**, **caching**, **batching**, **efficient serving** (quantization, speculative decoding), **shorter prompts and outputs**, region choice, and not running pointless agent loops. These are the same optimisations that cut your bill, so cost discipline is also environmental discipline.

```python run title="A back-of-envelope energy and cost comparison" level=easy
# illustrative figures only: measure your own deployment
requests_per_day = 2_000_000
wh_per_request = {"small model": 0.05, "large model": 0.6, "large model + 70% cache hits": 0.6 * 0.3}   # watt-hours (made-up but plausible orders of magnitude)
for name, wh in wh_per_request.items():
    kwh_year = requests_per_day * 365 * wh / 1000
    print(f"{name:32} {kwh_year:>9,.0f} kWh/year")
```

## Labour and societal impact

Consider who is affected beyond users: **workers** whose tasks change (design for augmentation, training and fair transitions), **data labellers** (fair pay and exposure to harmful content), **communities** affected by errors, and **dependency risks** (skills atrophy, over-reliance). Involve affected stakeholders and domain experts early; they find problems engineers cannot.

## A practical responsible-AI checklist for a launch

1. **Purpose and scope**: intended use, users, prohibited uses.
2. **Risk assessment** with affected-group analysis; classify under applicable regulation.
3. **Data**: provenance, consent, minimisation, bias review.
4. **Evaluation**: quality and safety, **disaggregated by segment and language**; counterfactual and red-team tests.
5. **Transparency**: AI disclosure, limitations, system card, explanations where needed.
6. **Oversight**: defined human roles, seeded-error audits, override channels.
7. **Safeguards**: guardrails, least privilege, approvals, kill switch.
8. **Monitoring**: drift, incidents, complaints, fairness metrics in production.
9. **Governance**: owners, review cadence, change management, incident process.
10. **Redress**: a way for people to contest and correct outcomes.

```quiz
? Why can't you satisfy every fairness metric at once?
+ Different definitions (parity, equal opportunity, calibration) conflict when base rates differ, so you must choose based on the harm model and context
- Fairness is meaningless
- Metrics are random
> Document which notion you chose and why.

? What is a counterfactual fairness test for an LLM feature?
+ Change only a name or attribute in an otherwise identical input and compare outputs
- Run the model twice
- Lower the temperature
> Large differences reveal bias to investigate.

? Why might human review fail as a safeguard?
+ Automation bias and fatigue: reviewers rubber-stamp AI output unless given evidence and measured on seeded errors
- Humans cannot read
- Review is illegal
> Test the oversight itself.

? Why prefer evidence-based explanations to the model's own account of its reasoning?
+ The model's narrative may not reflect what actually drove the output; sources and rules are verifiable
- Models never explain
- It is shorter
> Show the sources and rules used.
```

:::problem Your resume-screening assistant (an LLM that ranks candidates) is a high-risk use case. What must you build before launch? {level=hard tags="fairness,high-risk,governance"}
Cover evaluation, process and documentation.

:::solution Model answer
Treat it as **high-risk** (employment) under the EU AI Act and non-discrimination law: do a **risk assessment/DPIA**, define human oversight (the model **assists**, a recruiter decides; show evidence and reasons), and avoid using protected attributes or their proxies. **Evaluate** quality and fairness with disaggregated metrics (selection rates, equal opportunity gaps, disparate impact ratio), counterfactual name/gender/dialect swaps, multilingual cases, and red-team tests; set thresholds for acceptable disparity and re-test on every model/prompt change. **Document** a system card (purpose, data, model versions, evals, limitations), disclose AI use to candidates, offer a way to request human review and contest outcomes, **log** decisions for audit, monitor drift and fairness in production, assign an accountable owner, and plan incident response.
:::
:::

:::keypoints
- Harm sources: biased data and labels, representation gaps, proxies, feedback loops, scope creep, automation bias, stereotyping.
- Measure fairness with disaggregated metrics (selection rate, equal opportunity, equalised odds, disparate impact) and counterfactual tests; choose metrics by harm model and document them.
- Be transparent: AI disclosure, system cards, model cards, honest limitations, evidence-based explanations.
- Make oversight real: give reviewers evidence, manage workload, measure catch rates with seeded errors, record overrides.
- Govern with owners, risk assessments, incident response, redress and audit trails; consider provenance, environmental footprint and labour impact.
:::

:::resources
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — practical governance and measurement guidance.
- [Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993) — the documentation practice.
- [EU AI Act explorer](https://artificialintelligenceact.eu) — obligations for high-risk and transparency use cases.
- [From Words to Watts: Benchmarking the Energy Costs of LLM Inference](https://arxiv.org/abs/2310.03003) — inference energy measurements.
- [Anthropic Research](https://www.anthropic.com/research) — societal-impact and alignment work.
- [Hugging Face: Ethics and society](https://huggingface.co/blog) — essays and tools on ethics in open AI (see the ethics posts).
:::
