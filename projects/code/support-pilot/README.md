# SupportPilot

An AI copilot for a customer support desk. **React + TypeScript** front end, **FastAPI** back end, and a multi-step **pipeline** (redact, triage, find the order, apply the policy, retrieve help articles, draft, check) behind a **gateway** with a rate limit, budget, cache, retries, fallback and circuit breaker. Every run is **traced**, every draft is **checked by guardrails**, and **a person approves every reply** (a team lead approves large refunds).
It is Project 5 of the ProjectLab course, the advanced one: it puts together everything from the earlier four and adds the parts that make an AI feature safe to run for real.

**What it does:** customers write in (the public form, or the demo inbox). An agent opens a ticket and presses *Draft a reply*. The copilot hides personal data, classifies the ticket, looks up the customer's order, lets a rules engine decide the refund, retrieves the right help articles, writes a reply and runs guardrail checks on it, streaming each stage to the browser. A person edits, approves and sends. Nothing leaves without a human, and the money decision is never the model's.

## Run it

You need Python 3.11+ and Node 22.12+. No API key is needed: without one an offline model follows keyword rules and templates, and the *real* pipeline, policy, guardrails, gateway and database run around it.

```bash
# terminal 1: the back end (a demo shop and a demo inbox of 18 tickets are created on first start)
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                      # optional: add ANTHROPIC_API_KEY for a real model
uvicorn app.main:app --reload                             # http://localhost:8000/docs

# terminal 2: the front end
cd frontend
npm install
npm run dev                                               # http://localhost:5173
```

Sign in as **Asha (agent)** or **Ravi (team lead)** (demo tokens from `.env`; change them before sharing the app). Try: the headphones refund (the whole happy path), the smart watch (a refund above the limit that only a lead can approve), the consumer-court threat (escalated, never drafted) and *Simulate* on the offline model (a draft that over-promises, leaks a phone number, or stays wrong so a person must fix it, and a provider that fails so the gateway retries).

## Test it, and measure it

```bash
cd backend && pytest -q                  # 131 tests: redaction, policy, guardrails, workflow, gateway, tracing, triage, pipeline, API, the Claude adapter, evals
cd backend && python -m evals.run        # 24 labelled tickets: triage, escalation, policy decisions, guardrails, cost (--fail-under 0.8 for CI)
cd frontend && npm test && npm run build # 26 unit tests, then a type-check and production build
```

## Layout

```text
backend/app/
  redact.py        hide emails, phones, cards (Luhn-checked), Aadhaar and UPI ids before a model, log or trace sees them
  policy.py        the refund and cancellation rules as code: the model never decides money
  kb.py            help articles and a small keyword (BM25) search
  checks.py        guardrails on a draft: no personal data, real citations, matches the policy, no over-promising
  workflow.py      who may do what in which state (a pure state machine); the browser draws only the allowed buttons
  gateway.py       rate limit, daily budget, cache, retries with backoff, fallback model, circuit breaker, timeouts
  tracing.py       spans with durations, tokens and cost for every step of every run
  triage.py        structured output, validation, one repair, a safe fallback, and grounding of order numbers
  pipeline.py      the stages, streamed as events; drafts only, never sends
  store.py         SQLite: tickets, drafts, audit log, traces, sent messages
  auth.py          bearer tokens to roles, compared in constant time
  llm/             base.py, anthropic_client.py (structured output + streaming), mock_rules.py, mock_client.py, factory.py
  routes/          tickets.py (intake, list, process as SSE, edit, approve, reject, send, close, trace), meta.py (health, me, metrics)
backend/evals/     labelled tickets and the runner
frontend/src/
  pipelineReducer.ts  the run as state: stages, streaming draft, revisions (tested)    waterfall.ts  trace layout (tested)
  citations.ts        draft text to citation chips (tested)                              session.ts, format.ts (tested)
  components/         Inbox, TicketView, DraftPanel, Checks, Pipeline, TracePanel, MetricsView, IntakeForm, Login
```
