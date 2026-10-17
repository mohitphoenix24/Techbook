---
title: The support copilot
level: advanced
time: 40
summary: What it takes to put an AI feature in front of real customers and real money. The product, the five principles that shape every decision, the pipeline stage by stage (and which stages need a model at all), and a map of the project.
tags: architecture, human in the loop, pipeline, guardrails, design
---

The first four projects each taught one big idea: streaming, structured output, retrieval, agents. This one is about something harder: **what changes when the output touches a customer, and money**.

A wrong answer in a chat demo is a funny screenshot. A wrong answer in a support reply is a refund you should not have promised, a phone number you should not have written, a customer who now quotes your own email back at you. The model is the same. The *engineering around it* is what is different, and that engineering is this project.

## The product

SupportPilot is the screen a support agent works in. Tickets arrive in an inbox (from a public form, email, chat or WhatsApp). The agent opens one and presses **Draft a reply**. A few seconds later there is a draft, written from the customer's real order and the company's real policy, with citations to the help articles it used, and a list of guardrail checks it passed or failed. The agent edits it if needed, approves it, and sends it.

![The agent desk: the inbox, the stages the copilot ran, and a checked draft with its policy decision](assets/img/support-pilot-draft.png)

Notice what the screen does *not* do: it does not send anything by itself. That is not a missing feature. It is the first of five principles.

## Five principles

| # | Principle | What it looks like in the code |
|---|---|---|
| 1 | **The model drafts. A person decides.** | nothing is sent unless a human pressed Approve (`workflow.py`) |
| 2 | **Money is decided by code, not by the model.** | refund, amount and "needs a team lead" come from `policy.py`, plain rules you can read and test |
| 3 | **Hide personal data before any model sees it.** | `redact.py` runs first, and traces never contain it |
| 4 | **Check everything the model writes.** | `checks.py` looks for leaked data, promises the policy denies, wrong amounts, invented citations |
| 5 | **Every step is observable and limited.** | traces (`tracing.py`), a gateway with rate limits, budgets, retries and fallbacks (`gateway.py`), an audit log, and evals |

Read the first two together. Many teams start by asking "can the model decide if this customer gets a refund?". It usually can, most of the time. But "most of the time" is a poor property for a decision about money, and you cannot easily explain, test or change a decision that lives inside a model. A rule like "refund within 10 days of delivery, 30 for damage, above ₹5,000 ask a lead" fits in twenty lines of Python, behaves identically every time, and a manager can read it. So the model's job is the part that genuinely needs language: **understand the ticket, and explain the decision kindly**.

## The pipeline

```viz algo=arch title="SupportPilot" dir=right
ui    Agent desk | React [browser] @0,0
api   API | FastAPI, roles, SSE [service] @1,0
pipe  Pipeline | 8 traced stages [agent] @2,0
gw    Gateway | limits, cache, retries [guard] @3,0
llm   Claude | or the offline model [llm] @4,0
rules Rules and checks | policy, guardrails [tool] @2,1.6
kb    Help articles | keyword search [db] @3,1.6
store Desk database | tickets, audit, traces [db] @4,1.6
--
ui -> api : tickets, approvals
api ~> ui : stage events (SSE)
api -> pipe
pipe -> gw : triage, draft
gw -> llm
pipe -> rules
pipe -> kb
pipe -> store
```

One ticket takes this path:

```viz algo=seq title="One ticket, from inbox to sent"
participant ag Agent [browser]
participant api Desk API [service]
participant llm Claude [llm]
participant db Database [db]
ag -> api : Draft a reply
api -> api : hide personal data
api -> llm : triage (structured JSON)
llm --> api : category, priority, needs a person?
api -> db : find the customer's order
api -> api : the policy decides: action, amount, who approves
api -> llm : draft, from facts and help articles
llm --> api : the reply, streamed
api -> api : guardrail checks (revise once if one fails)
api --> ag : every stage, and the draft
note ag : a person reads, edits, approves
ag -> api : Approve
ag -> api : Send
```

| Stage | What it does | Needs a model? | Lesson |
|---|---|---|---|
| **redact** | replaces emails, phones, cards, Aadhaar and UPI ids with placeholders | no | 3 |
| **triage** | category, priority, sentiment, language, order numbers, "does a person need to see this?" | **yes** (structured output) | 4 |
| **escalate** | stops here for legal threats, safety problems and instructions hidden in the ticket | no | 4 |
| **lookup** | finds the customer's order, and refuses an order number that belongs to someone else | no | 9 |
| **decide** | the policy: refund, cancel, deny, inform or investigate; the amount; who must approve | no | 5 |
| **retrieve** | the help articles that state the rule, plus related ones | no (keyword search) | 6 |
| **draft** | the reply, streamed, from facts the earlier stages gathered | **yes** (streaming text) | 7 |
| **check** | guardrails on the draft; one automatic rewrite if a blocking check fails | no | 8 |

Count the right-hand column: **two of eight stages call a model.** The rest is ordinary, testable code. This is a pattern worth remembering: put a model only where language is needed, and surround it with code where rules, safety and money are involved. It makes the system cheaper, faster, and far easier to trust.

## What the desk looks like to different people

| Person | Can |
|---|---|
| a **customer** (not signed in) | submit a ticket through the public form, and nothing else |
| a support **agent** | see the inbox, run the copilot, edit, approve, reject and send, but not approve a refund above the limit |
| a **team lead** | all of that, plus approve large refunds, close escalated tickets and see the metrics |

Roles are enforced by the server (lesson 12). The browser only draws the buttons the server says are allowed.

## A ticket's life

```text
new ──process──▶ drafted ──approve──▶ approved ──send──▶ sent
                    │  ▲                  
                    │  └── edit (checks run again)
                    ├──reject──▶ rejected ──process──▶ (a new draft)
new ──process──▶ needs_lead ──(lead) approve──▶ approved      (refund above the limit)
new ──process──▶ escalated ──(lead) close──▶ closed           (a person must read this)
```

That small diagram is a **state machine**, and lesson 12 turns it into about forty lines of tested code. It is the single most important safety feature of the project.

## What you will build

| Lessons | Topic |
|---|---|
| 1 to 2 | the product, the setup and the desk's data |
| 3 to 8 | the stages: redaction, triage, policy, retrieval, drafting, guardrails |
| 9 to 11 | the machinery: the pipeline, the gateway, tracing |
| 12 to 13 | people: roles and approval, the agent desk interface |
| 14 to 15 | proof and launch: evals, and what to do before real customers |

Everything runs **offline** with no key: an offline model stands in for Claude behind the same interface, and the whole pipeline, policy, guardrails and gateway run around it. In lesson 9 you will run the *entire* copilot inside this page.

:::keypoints
- When AI output touches customers and money, the engineering around the model matters more than the model.
- Five principles: the model drafts and a person decides; money is decided by code; hide personal data first; check everything the model writes; make every step observable and limited.
- The pipeline has eight stages and only two call a model. Use a model where language is needed and code where rules, safety or money are involved.
- Roles and a state machine decide who can do what; the server enforces it and the browser only draws what is allowed.
:::

```quiz
? Why does the refund decision come from `policy.py` rather than from the model?
- Models cannot do arithmetic
+ A rule is predictable, testable and readable by a manager; "usually right" is a poor property for a decision about money
- It is cheaper
> The model's job is language: understanding the ticket and explaining the decision. The decision itself is a rule.
? How many of the eight stages call a model?
- All of them
+ Two: triage and draft
- None; it is rule-based
> Everything else is ordinary code, which makes the system cheaper, faster and easier to trust.
? What does the copilot do when it has written a draft?
- Sends it to the customer
+ Saves it and waits for a person to approve it
- Emails the team lead
> Nothing leaves without a human pressing Approve; for large refunds, a team lead.
```

:::exercise Decide the boundary
List five more things a support copilot could do (for example: "offer a 10% goodwill coupon", "tell the customer their delivery date", "close the ticket", "look up the customer's phone number", "reply in Hindi"). For each, decide: should the *model* decide it, should *code* decide it, or should a *person* decide it? Write one sentence on the worst thing that could happen if you got it wrong.
:::
