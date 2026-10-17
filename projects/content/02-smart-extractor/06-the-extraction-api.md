---
title: The extraction API and file uploads
level: easy
time: 35
summary: The routes that wrap the pipeline: describing document types for the front end, extracting, mapping failures to the right HTTP status, saving reviews, history, and turning PDFs into text.
tags: FastAPI, routes, uploads, pypdf, status codes
---

The pipeline is a function. The API makes it available to the browser, and decides what an error *means* to a client. This lesson walks through the routes and ends with a script that calls them all.

## 1. Tell the front end what exists

```python src="smart-extractor/backend/app/routes/extract.py" region="doc-types" title="backend/app/routes/extract.py"
```

One request gives the browser everything it needs to draw itself: the list of types, a **description of each type's fields** (built by `describe()` from the Pydantic model), and **sample documents**. The front end has no copy of the schema, so there is nothing to keep in sync, and adding a document type is a back-end-only change.

The description is a plain tree. The sample below is built by the real `describe.py`, and it runs here with a small model of our own:

```python run src="smart-extractor/backend/app/describe.py" title="describe(): a Pydantic model becomes a field tree" level=intermediate
import json
from datetime import date
from typing import Literal
from pydantic import BaseModel, Field

class Item(BaseModel):
    name: str
    qty: float

class Order(BaseModel):
    customer: str
    placed: date | None = Field(description="Date of the order, or null")
    status: Literal["new", "shipped"]
    items: list[Item]

print(json.dumps(describe(Order), indent=1)[:1500])
```

Look at how `placed` becomes `{"type": "date", "nullable": true}`, `status` becomes an `enum` with `options`, and `items` becomes a `list` whose `item` is an `object` with its own `fields`. That is a complete recipe for a form.

## 2. Extract

```python src="smart-extractor/backend/app/routes/extract.py" region="extract-route" title="backend/app/routes/extract.py"
```

Notice what the route *does not* do: it does not contain any extraction logic. It checks the request, calls the pipeline, shapes the response and saves it. Thin routes, rich functions.

### Status codes carry meaning

| Situation | Status | Why |
|---|---|---|
| unknown `doc_type` | **404** | the thing you asked for does not exist |
| empty text, bad `simulate_mistake` | **422** | Pydantic rejected the request body, before our code runs |
| text over `max_document_chars` | **413** | the request is too large; we protect the model budget |
| the model refused | **422** | we cannot process this content |
| rate limited by the provider | **429** | the browser may retry later |
| bad API key, provider down | **502** | *we* are the gateway; the upstream failed |
| a document the extractor cannot read | **200** with `valid: false` | the request was fine; the *result* needs a person |

That last row is a design choice worth defending. A document the model cannot understand is a normal outcome, not an error, so it returns data and issues, and the interface shows them.

## 3. Review: validate the human too

```python src="smart-extractor/backend/app/routes/extract.py" region="review-route" title="backend/app/routes/extract.py"
```

A person's correction goes through the **same schema**. Humans make mistakes too: a typo in a total should not be saved as the "right answer" that your evals later trust. On failure the route returns `422` with a list of `{path, message}` items, the same shape as the pipeline's issues, so the form can put each message next to its field.

## 4. History

`GET /api/extractions` lists past results (newest first, with a one-line preview), `GET /api/extractions/{id}` returns one with the model's answer *and* the reviewed version, and `DELETE` removes one. The storage is one SQLite table with two JSON columns:

```python src="smart-extractor/backend/app/db.py" region="schema" title="backend/app/db.py"
```

Storing `result_json` (the model's answer) and `reviewed_json` (the corrected one) **side by side** is what makes the data valuable later: every row where they differ is a mistake the model made, with the right answer attached.

## 5. Uploads: PDFs become text

Users have files, not clipboards. The upload route returns *text*, and the user reads and fixes it before extraction. That separation matters: you never extract from a file you have not looked at.

```python src="smart-extractor/backend/app/files.py" region="text-from-file" title="backend/app/files.py"
```

```python src="smart-extractor/backend/app/routes/extract.py" region="upload-route" title="backend/app/routes/extract.py"
```

Things to know about PDFs:

- A PDF may be **text-based** (pypdf can read the words) or a **scan** (a picture of a page). A scan has no text layer; `extract_text()` returns nothing and we say so, instead of passing an empty string to the model. Reading scans needs OCR, or a model that can read images (see the extension ladder in the last lesson).
- Layout is lost: columns of a table come out as lines of text. That is why the sample invoices keep their rows readable even without alignment.
- Always limit **size** (5 MB here), **type** (by extension *and* by what the library can actually parse) and **text length** (`max_document_chars`).

## Call it all from Python

This script drives every route with FastAPI's `TestClient`, with the offline model and a throw-away database. It even builds a real PDF in memory for the upload.

```python local verify cwd="smart-extractor/backend" title="The whole API in one script"
import io, tempfile, os
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app.doctypes.samples import SAMPLES
from tests.helpers import make_pdf

settings = Settings(llm_provider="mock", database_path=os.path.join(tempfile.mkdtemp(), "demo.db"), frontend_dist="nope", _env_file=None)
with TestClient(create_app(settings)) as client:
    types = client.get("/api/doc-types").json()
    print("types:", [t["id"] for t in types], "| invoice has", len(types[0]["fields"]), "fields and", len(types[0]["samples"]), "samples")

    text = SAMPLES["invoice"][0]["text"]
    r = client.post("/api/extract", json={"doc_type": "invoice", "text": text}).json()
    print("extract:", r["valid"], "attempts", r["attempts"], "| total", r["data"]["total"], "| issues", r["issues"])

    bad = client.post("/api/extract", json={"doc_type": "invoice", "text": text, "simulate_mistake": "invent"}).json()
    print("invented:", bad["valid"], [(i["path"], i["level"]) for i in bad["issues"]])

    print("unknown type:", client.post("/api/extract", json={"doc_type": "passport", "text": "x"}).status_code)
    print("too long:", client.post("/api/extract", json={"doc_type": "invoice", "text": "x" * 40000}).status_code)

    wrong = client.post(f"/api/extractions/{r['id']}/review", json={"data": {**r["data"], "total": 1}})
    print("bad review:", wrong.status_code, wrong.json()["detail"][0]["message"])
    right = client.post(f"/api/extractions/{r['id']}/review", json={"data": {**r["data"], "vendor": "Sharma Stationers"}})
    print("good review:", right.json()["ok"], "| history:", [(h["doc_type"], h["reviewed"]) for h in client.get("/api/extractions").json()])

    pdf = client.post("/api/documents/text", files={"file": ("x.pdf", io.BytesIO(make_pdf(["Invoice No: INV-1", "Total: 100.00"])), "application/pdf")}).json()
    print("pdf:", pdf["kind"], pdf["pages"], "page |", pdf["text"].replace("\n", " / "))
    print("exe:", client.post("/api/documents/text", files={"file": ("x.exe", io.BytesIO(b"MZ"), "application/octet-stream")}).status_code)
```

```output
types: ['invoice', 'meeting_notes', 'support_ticket'] | invoice has 9 fields and 2 samples
extract: True attempts 1 | total 4861.6 | issues []
invented: True [('invoice_number', 'warning')]
unknown type: 404
too long: 413
bad review: 422 subtotal + tax is 4861.60 but total is 1.00
good review: True | history: [('invoice', False), ('invoice', True)]
pdf: pdf 1 page | Invoice No: INV-1 / Total: 100.00
exe: 415
```

Open `http://localhost:8000/docs` after you start the server: every route above is listed with its schema and a **Try it out** button, written by FastAPI from your models.

## The tests

```python src="smart-extractor/backend/tests/test_api.py" region="upload-tests" title="backend/tests/test_api.py"
```

Notice the unhappy paths: an executable, a "PDF" that is not a PDF, and a PDF with no text layer each get a specific, readable message and the right status (415 Unsupported Media Type).

:::keypoints
- Routes are thin: validate, call the pipeline, shape the response, save.
- Describe the schema to the browser from the Pydantic model, so a new document type needs no front-end change.
- Status codes carry meaning; a document the model cannot read is a normal result (200, `valid: false`), not an error.
- Validate a human's corrections with the same schema as the model's output.
- Store the model's answer and the corrected one side by side: the differences are your best data.
- Uploads return text for the user to check; limit size, type and text length; remember scans have no text layer.
:::

```quiz
? Why does POST /api/extract return 200 with valid: false for a document the extractor cannot read?
- It is a bug we have not fixed
+ The request was fine; the result simply needs a person, and the interface shows the issues
- 200 is the only status FastAPI allows
> Reserve error statuses for failures of the request or the service. A hard document is an expected outcome.
? Why does the review route validate the corrected data again?
- To slow down the user
+ A human can make a mistake too, and an invalid "correct answer" would poison later evals
- Because the model asked for it
> Corrections become test cases. They must satisfy the same schema as any extraction.
? A user uploads a scanned PDF. What should happen?
- Send an empty string to the model
+ Return a clear message that the file has no text layer and suggest OCR or pasting text
- Crash with a 500
> Empty input would produce an invented answer. Stop early with a helpful error.
```

:::exercise Add a fourth document type
Add `receipt` (store, date, total, payment method) as a new Pydantic model and registry entry, with one sample. Without touching `frontend/`, check that it appears as a fourth tab and that the form draws correctly. What did you need to add to the *mock* so extraction works offline? (If nothing changes in the mock, what happens when you press Extract, and which status code does the user see?)
:::
