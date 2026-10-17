---
title: Why structured output, and what we are building
level: easy
time: 30
summary: The difference between text a person reads and data a program uses, the four-step pipeline (ask, validate, repair, ground), the three document types, and the project skeleton.
tags: structured output, pipeline, Pydantic, architecture
---

In Project 1 the model's job was to talk to a person. In most real products its job is different: **read something messy and hand a program clean data.** An invoice becomes a row in the accounts system. A support email becomes a ticket with a priority. Meeting notes become tasks with owners and dates.

That sounds like a small step from chat. It is not, because *programs cannot be polite to a model that is slightly wrong*. A chat reply that is 95% right is fine. An invoice total that is 5% wrong is a payment error. So this project is really about one question:

:::analogy How much do you trust the answer?
Imagine hiring a fast data-entry clerk who works for pennies but sometimes makes things up. You would give them a **form** to fill in (a schema), **check their arithmetic** (validation), **hand it back** when it is wrong (repair), **check every name and number against the original paper** (grounding), and let a **colleague approve** the important ones (review). That is exactly the pipeline we build.
:::

## What you will build

**Smart Extractor** takes a document of one of three types and produces an editable form where every value is checked.

| Document | Output you get |
|---|---|
| **Invoice** | vendor, number, dates, currency, line items, subtotal, tax, total |
| **Meeting notes** | title, date, attendees, decisions, action items with owners and due dates |
| **Support email** | customer, order, product, category, priority, sentiment, one-line summary |

## The pipeline

:::flow Four safety nets around one model call
Ask | the model returns JSON that follows the schema
Validate | rules a schema cannot say: totals add up, dates in order
Repair | on failure, show the model its own errors and ask again
Ground | check that every copied value really appears in the document
:::

Then a fifth step that is not code but a habit: a **person reviews**, and their corrections are saved. Those corrections become the tests that tell you whether the next change made things better or worse (lesson 8).

```viz algo=arch title="Smart Extractor" dir=right
ui    React form | schema-driven, evidence view [browser] @0,0
api   FastAPI | /api/extract, review, upload [service] @1,0
llm   Claude | structured outputs (or offline mock) [llm] @2,0
chk   Validate + ground | Pydantic rules, source check [guard] @1,1.6
db    SQLite | extractions and corrections [db] @0,1.6
--
ui -> api : POST /api/extract {doc_type, text}
api -> llm : schema + document
llm --> api : JSON
api -> chk : validate, repair, ground
api <-> db : save result, save review
flow Extracting an invoice
ui > api : The browser sends the document text and the document type.
api > llm : The server wraps the text in tags and sends it with the invoice schema.
llm > api : The model returns JSON that follows the schema.
api > chk : Pydantic checks the arithmetic and dates. If a rule fails, the errors go back to the model (repair).
chk > api : Every copied value is searched for in the source text. Anything not found becomes a warning.
api > ui : The response has the data, the issues, the evidence offsets, the attempts and the cost.
```

## Free text versus structured output

There are three ways to get data out of a model, from weakest to strongest guarantee:

| Approach | What you do | What can go wrong |
|---|---|---|
| **Ask nicely** | "Reply in JSON with these keys…" | markdown fences around the JSON, extra commentary, missing keys, wrong types |
| **Tool calling** | define a tool whose input schema is your shape | usually fine, but you still parse and check |
| **Structured outputs** | give the API a JSON Schema; it **constrains** generation to match | syntax is guaranteed; **meaning is not** |

We use the third, and the last row matters: structured outputs make sure the JSON has the right *shape*, so `total` is a number and `due_date` is a string or `null`. They cannot make sure the *content* is right. A total of `1.00` is perfectly well-formed. That gap is what validation and grounding fill.

:::note The shape of the problem
Two different failures need two different checks:

- **Well-formed but breaks a rule** (the lines add up to 4,120 but the subtotal says 4,000). Caught by **validation**, fixed by **repair**.
- **Well-formed, follows every rule, but invented** (an invoice number that appears nowhere in the document). Caught by **grounding**.

The app can *simulate* both so you can watch each safety net work.
:::

## Set up the project

```bash title="From an empty folder"
mkdir smart-extractor && cd smart-extractor
mkdir -p backend/app/{llm,doctypes,routes} backend/tests backend/evals
cd backend
python -m venv .venv && source .venv/bin/activate
```

```text src="smart-extractor/backend/requirements.txt" title="backend/requirements.txt"
```

Two new packages appear compared with Project 1: `python-multipart` (FastAPI needs it to read file uploads) and `pypdf` (to read text from PDFs). The same ideas carry over: settings from the environment, an `LLMClient` interface with an offline double and a real Claude client, a factory, `create_app()`.

```python src="smart-extractor/backend/app/config.py" title="backend/app/config.py"
```

Note the new settings that belong to this project: `max_repairs` (how many times we send errors back), `max_document_chars` (an input limit: a 5 MB paste must not become a 5 MB prompt) and `llm_effort` (how hard the model thinks: extraction deserves `medium`, chat wanted `low`).

## The API at a glance

| Method and path | Purpose |
|---|---|
| `GET /api/doc-types` | the document types, their field descriptions and sample documents |
| `POST /api/extract` | extract one document: returns data, issues, evidence, attempts, cost |
| `POST /api/extractions/{id}/review` | save a person's corrections (validated again) |
| `GET /api/extractions` and `/{id}` | history |
| `POST /api/documents/text` | upload a `.txt`, `.md` or `.pdf` and get its text back |

Notice that **the browser does not know what an invoice looks like**. `GET /api/doc-types` describes every field, and the form is drawn from that description (lesson 7). Adding a fourth document type will need no front-end change at all.

:::keypoints
- Programs need data that is both well-formed and *correct*; chat does not.
- The pipeline is ask, validate, repair, ground, then a human review whose corrections become tests.
- Structured outputs guarantee the **shape** of the JSON, never its **meaning**.
- Two failures need two checks: rule-breaking (validation, repair) and invention (grounding).
- The server describes the fields; the React form is drawn from that, so new document types need no UI work.
:::

```quiz
? A model returns {"total": 1.0} for an invoice whose lines add up to 4,861.60. Which safety net catches it?
- Structured outputs
+ Validation: a rule that compares total with subtotal plus tax
- Grounding
> The JSON is well-formed, so the schema accepts it. A Pydantic rule that checks the arithmetic catches the contradiction.
? A model returns an invoice number that passes every rule but appears nowhere in the document. Which net catches it?
- Validation
- Repair
+ Grounding
> Grounding searches the source text for each copied value. A value with no evidence is flagged for a person to check.
? What do structured outputs guarantee?
- That every value is true to the document
+ That the output is valid JSON of the right shape
- That the model never refuses
> The schema constrains the format. Whether the content is right is still your job.
```

:::exercise Design on paper
Pick a document you handle in real life (a bank statement, a rental agreement, a prescription). List five fields you would extract. For each, decide: could the model *invent* it? Could it break a *rule* (what rule)? Which fields would you require a human to confirm? Keep this list: in lesson 2 you will turn something like it into a schema.
:::
