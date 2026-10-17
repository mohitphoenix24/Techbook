---
title: The policy engine
level: advanced
time: 50
summary: The model drafts, but money is decided by code. A pure function turns a ticket category and an order into one decision (refund, cancel, deny, inform or investigate), the amount, the reason, the help article that states the rule, and whether a team lead must approve. Change the date or the limit and watch the decisions move.
tags: business rules, determinism, policy, testing, separation of concerns
---

Suppose you ask a capable model: "A customer wants a refund for headphones delivered 7 days ago, price ₹4,499. Our policy allows returns within 10 days. What do we do?" It will answer correctly, nearly always. Now ask it ten thousand times, with different orders, dates and phrasing, and some answers will be wrong in a way nobody notices until a customer quotes it back to you.

For a **decision that moves money**, "nearly always" is not a property you can accept, explain to an auditor, or fix with a one-line change. So this project does something that surprises people who expect "AI" to do everything: **the decision is plain code**, and the model only explains it.

## What a decision looks like

```python src="support-pilot/backend/app/policy.py" region="constants,decision" title="backend/app/policy.py"
```

| Field | What it is for |
|---|---|
| `action` | `refund`, `cancel`, `deny`, `info` or `investigate`: what the desk will do |
| `code` | a short machine-readable reason (`within_window`, `window_closed`...) that evals, metrics and tests can count |
| `reason` | the same reason in words: it goes into the prompt, and the human reads it beside the draft |
| `amount` | rupees to return (only for refund and cancel) |
| `needs_lead` | whether a team lead must approve (an amount above the limit) |
| `article` | the help article that states the rule: the draft must cite it |

The dataclass is `frozen`: a decision cannot be changed after it is made, by anything downstream. (A later stage that "adjusts" the amount would be a very hard bug to find.)

## The rules

```python src="support-pilot/backend/app/policy.py" region="decide" title="backend/app/policy.py"
```

Read it by category, as a customer-support lead would:

- **No order found** for a refund, damage, cancellation or delivery question: don't guess. Ask for the order number.
- **Delivery questions**: the answer depends only on the order's status. Processing, shipped (with the date it is expected), delivered (the carrier says so, so *investigate*).
- **Cancellation**: free before it ships (full refund, or nothing for cash on delivery, because nothing was paid), impossible after.
- **Refund and damage**: not delivered yet means there is nothing to return; already refunded means the money is on its way; digital goods are never refundable; otherwise it depends on the **window**: 10 days for a change of mind, 30 for a damaged item. Inside it: refund the amount. Outside it: a kind "no".
- **Amount above the limit**: set `needs_lead`. The rule does not forbid the refund, it routes the *approval*.
- **Payment problems** go to the payments team (`investigate`); **account** questions point to the password reset; everything else is a general question.

Every branch ends in a `Decision` with an `article`, so the reply can always point to the rule.

:::tip Why a pure function?
`decide(category, order, today, auto_limit)` reads nothing from a database, a clock, or the network, and changes nothing. Everything it needs is an argument. So it is trivially testable (a table of cases), repeatable (same inputs, same decision, forever), and easy to reason about. `today` is an argument for exactly the same reason: a function that reads the clock cannot be tested for "9 days after delivery" without waiting nine days.
:::

## Try it

The block below runs the real `decide`. First the decisions for a few orders under a few categories on the demo date. Then the *same* rules with a later "today", so windows close; then with a different approval limit.

```python run src="support-pilot/backend/app/seed.py#orders,support-pilot/backend/app/policy.py" flat title="Decisions, and what changes them" level=intermediate
from datetime import date

CASES = [("refund", "AUR-1001"), ("refund", "AUR-1012"), ("damaged", "AUR-1002"), ("damaged", "AUR-1005"),
         ("refund", "AUR-1006"), ("cancellation", "AUR-1004"), ("cancellation", "AUR-1003"), ("delivery", "AUR-1010")]


def table(title, today, limit=AUTO_LIMIT_INR):
    print(f"\n{title}  (today {today}, lead above ₹{limit:,})")
    print(f"{'category':<14}{'order':<10}{'item':<24}{'decision':<12}{'amount':>8}  lead  code")
    for category, order_id in CASES:
        order = ORDER_BY_ID[order_id]
        d = decide(category, order, date.fromisoformat(today), limit)
        print(f"{category:<14}{order_id:<10}{order['items'][0]['name'][:22]:<24}{d.action:<12}{d.amount:>8,}  {'YES ' if d.needs_lead else '-   '}  {d.code}")


table("1. The demo day", TODAY)
table("2. Eight days later: windows close", "2026-10-20")
table("3. Back to the demo day, but a lead must approve above Rs 3,000", TODAY, limit=3000)

print("\nNo order on file:", decide("refund", None, date.fromisoformat(TODAY)).reason)
print("Ownership is not the policy's job: the pipeline decides WHICH order to pass in (lesson 9).")
```

Compare table 1 and table 2. `AUR-1001` (the headphones) is a refund on the demo day, 7 days after delivery; eight days later it is 15 days, so the same rule says no. Nothing about the model, the ticket's wording or the customer's tone changed. In table 3 only the *approval* column moves: the limit is a parameter, so a policy change is a configuration change.

## The model gets the decision as a fact

In lesson 7 the decision is handed to the model inside the prompt as "POLICY DECISION: refund Rs 4,499 | within_window | ...", with the instruction that it is **final**. The model explains it. If the model writes "we will refund ₹4,999", or promises a refund after a "deny", the guardrails of lesson 8 catch it, because they compare the draft with this same `Decision`.

So the decision is used three times: in the prompt (what to say), in the checks (did it say it?), and in the workflow (who must approve). One source of truth, three consumers.

## What this simple engine does not cover

Real policies are messier, and it is better to know the gaps than to pretend:

| Gap | What you would add |
|---|---|
| a multi-item order where only one item is damaged | ask which item, or have triage extract it; refund that line only |
| partial refunds, restocking fees, store credit | more `action` values, and amounts that are not the whole order |
| goodwill exceptions ("this customer has bought 40 times") | a rule with a customer-history input, or a *human override* with a reason in the audit log |
| rules that differ by country, category, or seller | a table-driven policy loaded from configuration, with a version number recorded on each decision |

Notice that most of these are easy to *add* to a rules engine and hard to add to a model's habits. And whatever you add, you add a test row for it.

## Tests

```python src="support-pilot/backend/tests/test_policy.py" region="policy-tests" title="backend/tests/test_policy.py"
```

The big parametrised table is the **specification** of the policy, readable by someone who has never written Python. When a manager says "make damaged items 45 days", you change one constant and one row, and the test tells you which other rows moved.

:::keypoints
- Decisions that move money are code, not model output: predictable, testable, explainable and changeable in one line.
- A decision carries an action, a machine-readable code, a human reason, an amount, whether a lead must approve, and the article that states the rule.
- Keep the rules a pure function: everything it needs (including today's date and the limit) is an argument.
- The approval limit routes the *approval*, it does not forbid the action.
- The same `Decision` is used three times: in the prompt, in the guardrails, and in the workflow.
- A parametrised table of cases is the policy's executable specification.
:::

```quiz
? Why is today's date an argument to `decide` instead of read inside it?
- Python cannot read the clock in a function
+ A function that reads the clock cannot be tested for "9 days after delivery" without waiting; arguments keep it repeatable
- To save time
> Pure functions are repeatable: same inputs, same decision.
? The refund is ₹12,999 and the limit is ₹5,000. What does the policy do?
- Denies it
- Reduces it to ₹5,000
+ Decides refund ₹12,999 and marks needs_lead, so a team lead must approve
> The limit routes the approval; it does not change the decision.
? The model's draft promises a refund the policy denied. What catches it?
- Nothing: the model decides
+ The guardrail checks, which compare the draft with the same Decision
- The customer
> One decision, three consumers: prompt, checks and workflow.
```

:::exercise Change the policy
The business wants: damaged items get 45 days; refunds for orders paid by cash on delivery always need a lead (they are paid to a bank account, so there is fraud risk). Make both changes in `policy.py`, update the table of tests, and run the block above with the new rules. Which rows changed? Which customers (from the demo inbox) would now get a different answer, and would that change any ticket's *expected* result in `seed.py`?
:::
