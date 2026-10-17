---
title: Guardrail checks
level: advanced
time: 50
summary: Plain code that reads every draft before a human is told it is ready: leaked personal data, invented citations, an amount or promise the policy does not support, over-promising, internal wording. Blocking checks stop approval; warnings ask a person to look. Run them on good and bad drafts in your browser.
tags: guardrails, validation, safety, testing, policy
---

A fluent draft can hide a serious fault. "We guarantee your refund within minutes" reads well and is a promise you cannot keep. "We will call you on 98765 43210" reads helpfully and leaks a number. The model does not notice, because it was not asked to check its own work, and even if it were, you would not want a safety property to depend on the same system that made the mistake.

So after the draft we run **guardrails**: ordinary functions, no model, that look at the text and the facts and say pass or fail.

## Block or warn

```python src="support-pilot/backend/app/checks.py" region="check" title="backend/app/checks.py"
```

Each check has a **severity**:

| Severity | Meaning | Effect |
|---|---|---|
| `block` | sending this would be wrong or unsafe | **approval is impossible** until a check passes (the workflow enforces it) |
| `warn` | probably fine, but a person should glance at it | shown in the list; approval still allowed |

Choosing severity is a real design decision. If everything blocks, people fight the tool and edit around it. If nothing blocks, the guardrails are decoration. Rule of thumb: **block what could harm the customer or the company** (leaks, wrong money, false promises); **warn about style** (tone, length, a missing order number).

## The nine checks

```python src="support-pilot/backend/app/checks.py" region="run" title="backend/app/checks.py"
```

| Check | Severity | What it catches |
|---|---|---|
| `no_personal_data` | block | a phone, email, card, Aadhaar or UPI id in the reply (the exit guard of lesson 3) |
| `citations_exist` | block | a `[kb:...]` that is not among the articles the model was given: an invented source |
| `cites_policy` | block | the reply never cites the article that states the rule it applies |
| `matches_policy` | block | the amount differs from the decision; or a refund is promised after the policy said no |
| `no_overpromise` | block | "guarantee", "100%", "definitely", "within minutes"... |
| `no_internal_info` | block | "a team lead has to approve", "our approval limit": the customer should not hear how the machine works |
| `mentions_order` | warn | the order number is missing |
| `empathy` | warn | an upset customer, and no apology or acknowledgement |
| `length` | warn | more than about 170 words for a support reply |

Two of them deserve a closer look.

### `matches_policy`: comparing the draft with the decision

For a refund, the amount in the policy decision **must appear** in the text, and **no other amount may appear** beyond that one and the order total. So "we will refund ₹4,999" when the decision says ₹4,499 fails, and so does a reply with no amount at all. For a "deny" (or an informational decision), a regular expression looks for refund promises ("we will refund", "has been credited", "is being reimbursed...") and blocks them.

This is the check that turns the policy engine of lesson 5 from advice into law: **the draft cannot contradict the decision**, whatever the model decided to write.

### `no_personal_data`: the same patterns, pointed outward

It reuses `find_personal_data`, so there is one definition of "personal data" for the whole project. If you add a PAN card pattern in one place (the lesson 3 exercise), the guardrail learns it for free.

## Try it

Six drafts for the same refund (a ₹4,499 refund for order `AUR-1001`), and a denied refund. The checks are the real ones.

```python run src="support-pilot/backend/app/seed.py,support-pilot/backend/app/redact.py,support-pilot/backend/app/policy.py,support-pilot/backend/app/checks.py" flat title="Run the guardrails on good and bad drafts" level=advanced
from datetime import date

today = date.fromisoformat(TODAY)
order = ORDER_BY_ID["AUR-1001"]
refund = decide("refund", order, today)                                   # refund Rs 4,499, article "returns"
late = decide("refund", ORDER_BY_ID["AUR-1012"], today)                   # window closed: NO refund
provided = {"returns", "refunds-timeline"}

DRAFTS = [
    ("a good draft", refund, order, "neutral",
     "Hi Asha, order AUR-1001 is inside our window, so we can refund ₹4,499 to your original payment method [kb:returns]. UPI refunds take 1 to 3 working days [kb:refunds-timeline]."),
    ("leaks a phone number", refund, order, "neutral",
     "Hi Asha, order AUR-1001 can be refunded: ₹4,499 [kb:returns]. We will call you on 98765 43210."),
    ("wrong amount", refund, order, "neutral",
     "Hi Asha, order AUR-1001 can be refunded: ₹4,999 [kb:returns]."),
    ("invents a source", refund, order, "neutral",
     "Hi Asha, order AUR-1001: ₹4,499 will be refunded [kb:returns] under our VIP policy [kb:vip-guarantee]."),
    ("over-promises, reveals internals", refund, order, "neutral",
     "Hi Asha, we guarantee ₹4,499 for order AUR-1001 within minutes [kb:returns]. A team lead has already given approval."),
    ("promises a refund the policy denied", late, ORDER_BY_ID["AUR-1012"], "negative",
     "Hi Tara, order AUR-1012 is outside the window [kb:returns], but we will refund it anyway."),
]

for label, decision, o, mood, text in DRAFTS:
    checks = run_checks(text, decision=decision, sentiment=mood, order=o, article_ids=provided)
    blocking = blocking_failures(checks)
    verdict = "CAN be approved" if not blocking else "BLOCKED"
    print(f"\n--- {label}: {verdict}")
    for c in checks:
        if not c.ok:
            print(f"    {c.severity.upper():<6}{c.name:<18}{c.detail}")
    if not [c for c in checks if not c.ok]:
        print("    all nine checks pass")
```

Look at the last draft. It cites a real article and is polite, but it promises a refund that `window_closed` denied, and it also fails `empathy` (the customer is upset and nothing acknowledges it). The first is blocking, the second a warning. A person fixing it sees both, in order of importance.

## Guardrails stack up

The same fact is checked at several places, because each layer catches what the one before missed:

| Where | What it checks | Stage |
|---|---|---|
| prompt | "Never write phone numbers", "do not over-promise" | draft (hopes) |
| **the checks** | personal data, amounts, citations, promises | after the draft (verifies) |
| **edit** | the *same* checks re-run on any text a person types | `POST /draft` |
| **approve** | refused while a blocking check fails | workflow |
| **send** | one last personal-data scan | `POST /send` |

The prompt only *asks*. The checks *verify*. And because a person's edits go through the same checks, the rules apply to everyone who can put words in front of a customer.

:::warn Guardrails are not magic
These checks are simple on purpose: word lists and patterns. They will miss a subtle promise ("don't worry, it's sorted") and may flag an innocent word. Treat them as a net that catches the common, costly mistakes, and keep the human in the loop for the rest. Review what they miss (the edit rate and the rejection reasons in the audit log tell you), and add a check each time a new kind of failure turns up.
:::

## Tests

```python src="support-pilot/backend/tests/test_checks.py" region="checks-tests" title="backend/tests/test_checks.py"
```

Each test is one specific failure, with the exact text that triggers it. When a new problem is found in real life, it becomes a new test *first*, then a new check. That is the whole maintenance loop.

:::keypoints
- Guardrails are plain code that verify the draft against the facts; they do not depend on the model that made the mistake.
- Block what could harm the customer or the company; warn about style. Too many blocks and people work around the tool.
- The most valuable check compares the draft with the policy decision: the right amount, and no promise the policy denied.
- One definition of personal data serves the redactor, the exit guard and the send check.
- The same checks run on a person's edits, and approval is impossible while a blocking check fails.
- Guardrails are a net, not a guarantee: keep a human in the loop and turn each real failure into a new test and check.
:::

```quiz
? The draft quotes ₹4,999 but the policy decided ₹4,499. What happens?
- It is sent with a warning
+ matches_policy blocks it: approval is impossible until the amount is fixed
- The model is retrained
> The draft may never contradict the decision.
? Why do a person's edits go through the same checks?
- To slow them down
+ Everyone who can put words in front of a customer should be held to the same rules, including leaks
- Editing is not allowed
> A human can paste a phone number into a draft as easily as a model can write one.
? A missing order number in a reply is…
- Blocking
+ A warning: worth a look, not worth stopping the reply
- Ignored
> Severity reflects harm: leaks and wrong money block; style warns.
```

:::exercise A check for your own rule
Add a `no_discount_codes` check: the reply must never contain a coupon-like code (for example `SAVE10` or `AUR-WELCOME20`, a word of capital letters and digits that is not an order number). Decide whether it should block or warn, write the failing test first, then the check. Run the drafts of the block above with a made-up draft that contains `SAVE10`. What false positives could your pattern create for order numbers like `AUR-1001`?
:::
