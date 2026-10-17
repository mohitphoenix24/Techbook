# Smart Extractor

Turn messy documents (invoices, meeting notes, support emails) into **validated, traceable data**. **React + TypeScript** front end, **FastAPI** back end, **Claude** structured outputs (or an offline demo model) in the middle.
It is Project 2 of the ProjectLab course.

**What it does:** asks the model for JSON that follows a Pydantic schema, validates every rule (totals add up, dates in order), sends the model its own errors to repair a bad answer, checks that every copied value really appears in the document (grounding), lets a person review and correct the result, and measures accuracy with an eval harness.

## Run it

You need Python 3.11+ and Node 22.12+. No API key is needed: without one the app uses an offline demo model.

```bash
# terminal 1: the back end
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                      # optional: add ANTHROPIC_API_KEY for real extraction
uvicorn app.main:app --reload                             # http://localhost:8000/docs

# terminal 2: the front end
cd frontend
npm install
npm run dev                                               # http://localhost:5173
```

Load a sample, press **Extract**, and try the **Simulate a mistake** menu (offline model only) to watch the repair loop and the grounding check work.

## Test it, and measure it

```bash
cd backend && pytest -q                 # 58 tests, no network, no API key
cd backend && python -m evals.run       # accuracy on 10 golden cases (add --fail-under 0.9 for CI)
cd frontend && npm test && npm run build        # 15 unit tests
```

With the offline model the eval scores about 87%: it was built for the sample documents and fails on the three hard cases on purpose. A real model should do much better, and the eval is how you will know.

## Layout

```text
backend/app/
  doctypes/models.py     the contract: Invoice, MeetingNotes, SupportTicket (Pydantic, with rules)
  doctypes/__init__.py   registry: model + extra instructions + which fields must be copied verbatim
  prompts.py             system prompt, user message, repair message
  extract.py             the pipeline: ask, validate, repair, ground
  grounding.py  dates.py scoring.py   pure helpers
  describe.py            Pydantic model -> field tree for the React form
  llm/                   base.py, anthropic_client.py (structured outputs), mock_client.py, mock_extractors.py
  routes/extract.py      /api/doc-types, /api/extract, /api/extractions/..., /api/documents/text
  files.py  db.py  schemas.py  config.py
backend/evals/           golden cases and the runner
frontend/src/
  extractorReducer.ts    all state changes (tested)         paths.ts   get/set by "a.0.b" paths (tested)
  export.ts              CSV (tested)                       api.ts
  components/            FieldForm (schema-driven), Highlighted, SourcePanel, ResultPanel, History
```
