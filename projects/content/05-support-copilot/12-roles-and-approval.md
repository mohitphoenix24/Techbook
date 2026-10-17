---
title: Roles and approval
level: advanced
time: 55
summary: Who is calling, and what may they do to a ticket in its current state? Bearer tokens compared in constant time, two roles, a state machine of about forty lines that makes "nothing is sent without a human" a fact of the code, an audit trail, and the one list of allowed actions the browser draws its buttons from.
tags: authentication, authorisation, state machine, audit log, human in the loop
---

Everything so far makes the copilot's drafts better. This lesson makes the *process around them* safe, and it is the lesson that most directly decides whether a company would let this system near real customers.

Two questions, which people often blur together:

| | Question | Here |
|---|---|---|
| **Authentication** | *who* is calling? | a token that maps to a person |
| **Authorisation** | *what may they do*, to this ticket, right now? | a role, and the ticket's state |

## Who is calling?

```python src="support-pilot/backend/app/principal.py" region="principal" title="backend/app/principal.py"
```

```python src="support-pilot/backend/app/auth.py" region="authenticate" title="backend/app/auth.py"
```

A client sends `Authorization: Bearer <token>`. The server maps the token to a `Principal` (a name and a role), or to nothing.

Notice `hmac.compare_digest`. A plain `==` on strings stops at the first different character, so how long it takes leaks **how many leading characters were right**. Measured over many guesses, that can reveal a secret one character at a time. A constant-time comparison takes the same time however close the guess was. It costs nothing, so always use it for secrets.

```python src="support-pilot/backend/app/auth.py" region="dependency" title="backend/app/auth.py"
```

FastAPI's dependency system makes this declarative. A route that asks for `Depends(current_user)` cannot run without a valid token, and one that asks for `require_lead` needs the right *role*. The tests prove **every desk endpoint refuses a missing or wrong token**, so a route someone adds later and forgets to protect shows up as a failing test only if it is on the list. That is one reason to keep authentication in a dependency on a router rather than in each function.

:::warn About these demo tokens
Two fixed tokens in `.env` are a **teaching shortcut**. A real deployment signs people in through your identity provider (OpenID Connect or SAML, with Google Workspace, Microsoft Entra ID or similar), receives a signed token such as a JWT with an expiry, verifies the signature and claims on every request, and takes the role from the provider's groups. The structure of this project does not change: only `authenticate()` does. Also decide where the browser keeps the token. Here it is in `sessionStorage` (gone when the tab closes), which is simple but readable by any script that runs on the page, so keep your front end free of untrusted scripts. Cookies with `HttpOnly` and `SameSite` are the common alternative, at the cost of thinking about CSRF.
:::

## The two roles

| Role | Can |
|---|---|
| **agent** | process, edit, approve and reject drafts, and send approved ones; cannot approve a refund above the limit |
| **lead** | everything an agent can, and approve large refunds, close escalated or rejected tickets, and read the metrics |

Two roles are enough to teach the structure. A bigger organisation adds more (a trainee whose drafts always need a second pair of eyes, an auditor who can read but not act), and the code that follows scales by adding rows, not by adding `if`s all over the place.

## "Nothing is sent without a human": a state machine

Every ticket is in exactly one **state**, and every action is a move between states that is allowed only for certain roles and conditions. That is a *state machine*, and writing it as a small pure module turns the principle into something you can test exhaustively:

```python src="support-pilot/backend/app/workflow.py" region="states" title="backend/app/workflow.py"
```

```python src="support-pilot/backend/app/workflow.py" region="transitions" title="backend/app/workflow.py"
```

Two functions do all the work:

- **`allowed_actions(status, role, gate)`** returns the list of things this person may do now.
- **`next_status(status, action, role, gate)`** returns the new state, or raises a `WorkflowError` that says *why not* ("A team lead must approve it", "A guardrail check is failing").

The `Gate` carries the two facts about the *draft* that matter: does the policy want a lead (`needs_lead`), and is a blocking check failing (`blocked`). So the rules read:

| You can... | when |
|---|---|
| **process** | the ticket is new, rejected, or has a draft (to draft again) |
| **edit** or **reject** | a draft is waiting |
| **approve** | a draft is waiting, **no blocking check fails**, and (for a large refund) you are a lead |
| **send** | the ticket is **approved**, and only then |
| **close** | you are a lead, and the ticket is escalated or rejected |

Look for what is **missing**: there is no way to go from `drafted` to `sent`. The only route to the customer passes through `approved`, and the only way to `approved` is `approve`. This is not a convention that someone could forget. It is the shape of the code.

## Explore it

The real state machine, in your browser. First, what each role can do in each state. Then a few attempts, including the ones that *must* fail.

```python run src="support-pilot/backend/app/workflow.py" title="Who can do what, and what is refused" level=intermediate
STATES = ["new", "drafted", "needs_lead", "approved", "sent", "rejected", "escalated"]
print(f"{'state':<12}{'agent':<34}{'lead'}")
for status in STATES:
    gate = Gate(needs_lead=(status == "needs_lead"))
    print(f"{status:<12}{', '.join(allowed_actions(status, 'agent', gate)) or '-':<34}{', '.join(allowed_actions(status, 'lead', gate)) or '-'}")

print("\nWith a blocking guardrail check failing on a draft:")
for role in ("agent", "lead"):
    print(f"  {role:<6}{allowed_actions('drafted', role, Gate(blocked=True))}")

print("\nAttempts:")
attempts = [
    ("drafted", "approve", "agent", Gate()),
    ("needs_lead", "approve", "agent", Gate(needs_lead=True)),
    ("needs_lead", "approve", "lead", Gate(needs_lead=True)),
    ("drafted", "approve", "agent", Gate(blocked=True)),
    ("drafted", "send", "lead", Gate()),
    ("approved", "send", "agent", Gate()),
    ("sent", "send", "agent", Gate()),
    ("escalated", "close", "agent", Gate()),
    ("escalated", "close", "lead", Gate()),
]
for status, action, role, gate in attempts:
    try:
        print(f"  {role:<6}{action:<8}on {status:<11}-> {next_status(status, action, role, gate)}")
    except WorkflowError as e:
        print(f"  {role:<6}{action:<8}on {status:<11}-> REFUSED ({e.code}, HTTP {e.status_code}): {e.message}")

print("\nA full journey, with a large refund:")
status = status_after_processing(needs_human=False, needs_lead=True)
print(f"  the copilot finishes: {status}")
for action, role in [("approve", "lead"), ("send", "agent")]:
    status = next_status(status, action, role, Gate(needs_lead=True))
    print(f"  {role} does {action}: {status}")
```

Read the "REFUSED" lines. Each carries a **code** (machine-readable, for the interface), a **message** (for a human), and the right HTTP status: 403 when *this person* may not do it (wrong role), 409 when *nobody* could do it right now (wrong state, or a failing check).

## The server enforces it, the browser only draws it

```python src="support-pilot/backend/app/routes/tickets.py" region="view" title="backend/app/routes/tickets.py"
```

Every ticket the API returns includes an **`actions` list**, computed by `allowed_actions` for the signed-in person. The browser draws exactly those buttons and nothing else. It contains no copy of the rules.

That matters twice. When a rule changes, you change one file. And hiding a button is **not** security: anyone can send a request by hand. So every action route calls `next_status` again before doing anything:

```python src="support-pilot/backend/app/routes/tickets.py" region="decide" title="backend/app/routes/tickets.py"
```

`_transition` loads the ticket, loads the latest draft to build the gate, asks the state machine, and only then changes the status and writes an audit entry. The `send` path adds a final look at the text for personal data. There is no route that changes a status without passing through `next_status`.

## People can edit, and the checks still apply

```python src="support-pilot/backend/app/routes/tickets.py" region="edit" title="backend/app/routes/tickets.py"
```

An agent who edits a draft creates a **new version** (`source="human"`, with their name), and the **same guardrail checks** run on the new text. Editing is how a person clears a blocked draft: fix the text, the checks pass, `approve` appears.

## The audit trail

Each transition writes one line: who (name and role), what, which ticket, when, and a detail (the reason given for a rejection, how many blocking problems remain after an edit). Together with the draft versions and the trace it answers every "who sent that?" question:

```text
Asha (agent)       processed         drafted v1: refund within_window
Asha (agent)       edited the draft  edited; 0 blocking problem(s) remain
Ravi (team lead)   approved
Asha (agent)       sent the reply
```

An audit log is **append-only**: there is no route that edits or deletes an entry. When a customer or a regulator asks how a decision was made, this is the evidence.

## The public form

One endpoint needs no sign-in at all: the form customers use. Anyone on the internet can call it, so it is the part to be strictest about:

```python src="support-pilot/backend/app/routes/tickets.py" region="intake" title="backend/app/routes/tickets.py"
```

Strict validation (an email shape, a body between 10 and 4,000 characters), a **rate limit per address** (a token bucket, the same one the gateway uses) with a `Retry-After` header, and a response that echoes **nothing** about the ticket. And note what it cannot do: it creates a ticket in state `new`. It cannot read tickets, draft, approve or send. Create-only endpoints are the safest kind to expose.

## Tests

```python src="support-pilot/backend/tests/test_workflow.py" region="workflow-tests" title="backend/tests/test_workflow.py"
```

```python src="support-pilot/backend/tests/test_api.py" region="auth-tests" title="backend/tests/test_api.py"
```

```python src="support-pilot/backend/tests/test_api.py" region="workflow-api-tests" title="backend/tests/test_api.py"
```

```python src="support-pilot/backend/tests/test_api.py" region="intake-tests" title="backend/tests/test_api.py"
```

The workflow tests are the **specification**: a lead approves a large refund and the audit says so; an agent cannot; a failing check blocks everyone; nothing is sent before approval, or twice. The API tests prove the server enforces all of it, even against a request the browser would never send.

:::keypoints
- Authentication says who; authorisation says what they may do to this ticket in this state. Keep them separate.
- Compare secrets in constant time. Put authentication in a dependency so a protected route cannot forget it, and test that every desk endpoint refuses a missing or wrong token.
- Model the process as a pure state machine: `allowed_actions` and `next_status`. "Nothing is sent without a human" becomes the shape of the code, because no path leads from draft to sent without `approve`.
- Return a typed error with the right status: 403 for "not you", 409 for "not now".
- The server decides and enforces; the browser draws only the actions the server lists. Hiding a button is not security.
- Human edits face the same guardrails as model drafts.
- An append-only audit trail, with who, what and when, plus draft versions and traces, answers every "who sent that?".
- A public endpoint should be strict, rate limited, create-only, and echo nothing.
- Fixed demo tokens are for learning. Use your identity provider in production.
:::

```quiz
? Why is `hmac.compare_digest` used to check the token?
- It is faster
+ A plain == leaks, through timing, how many leading characters were right
- It encrypts the token
> Constant-time comparison stops guessing a secret one character at a time.
? The browser hides the Approve button from an agent. Is that enough?
- Yes, the agent cannot click it
+ No: anyone can send the request by hand, so the server checks the state machine again on every action
- Only if the page is not cached
> Hiding a button is a convenience. The server enforces the rules.
? What is the only way a ticket reaches the state `sent`?
- Process
+ Approve, then send
- Edit
> There is no transition from a draft straight to sent. The shape of the code enforces the principle.
```

:::exercise A second pair of eyes
Add a rule: an agent's **own** edits cannot be approved by the same agent (four-eyes principle): if the latest draft is `source="human"` and `author == the approver`, only a different person may approve. Where does the information live (the draft's `author`)? Does it belong in `Gate` or as a new argument? Write the state-machine test first. What would you tell the team when this slows them down on a quiet afternoon, and what would you measure to decide whether it is worth it?
:::
