---
title: Document AI — OCR, Parsing and Extraction
level: intermediate
time: 40
summary: Turning PDFs, scans and forms into trustworthy data. Classic OCR versus layout-aware parsers versus vision-language models, the pipeline (ingest, classify, parse, extract, validate, review), tables and forms, schemas with provenance, character and field-level metrics, validation rules in code, confidence and human-in-the-loop, and cost. With runnable CER and field-scoring code and a validation layer for an invoice.
---

Most business knowledge lives in documents: invoices, contracts, statements, forms, manuals, slide decks. **Document AI** turns them into structured data or clean text for RAG. It is one of the most commercially valuable GenAI applications, and one where **evaluation and validation matter more than the model**.

## Three generations of tooling

| Approach | How it works | Strengths | Weaknesses |
|---|---|---|---|
| **Classic OCR** (Tesseract, cloud OCR) | detect text lines, recognise characters | cheap, fast, runs anywhere, good on clean print | loses layout and tables; struggles with noise, handwriting and odd fonts |
| **Layout-aware parsers** (Docling, Unstructured, Azure Document Intelligence, AWS Textract, Google Document AI, LlamaParse, Marker, MinerU) | layout detection + OCR + table structure models, output Markdown/JSON with reading order | preserve headings, tables, figures, reading order; deterministic; scalable | model mistakes on unusual layouts; configuration needed |
| **Vision-language models** | send the page image (or crop) and ask for text or fields | handle messy, unseen layouts, handwriting, charts; one prompt for many document types | cost, latency, hallucinated values, no guarantees on exactness |

In practice, strong systems **combine** them: a layout parser for structure and text, a VLM for hard regions (handwriting, charts, stamps), and code for validation. **Text-native PDFs** should be read with a PDF text extractor first (exact characters, free); OCR is for scans and images.

## The pipeline

```viz algo=arch title="A production document pipeline" dir=down
in    Upload | PDF, scan, photo, email attachment [file] @0,1
pre   Preprocess | deskew, rotate, denoise, split pages [filter] @1,1
cls   Classify | invoice, contract, ID, other [filter] @2,1
par   Parse | text layer or OCR + layout + tables [embed] @3,1
ext   Extract | LLM or VLM to a schema with evidence [llm] @4,1
val   Validate | types, sums, cross-field rules in code [guard] @5,1
rev   Human review | low confidence or failed rules [user] @5,0
out   Structured data | database, ERP, search index [db] @6,1
--
in -> pre
pre -> cls
cls -> par
par -> ext
ext -> val
val -> out : "passes"
val -> rev : "fails or low confidence"
rev -> out
```

Design points:

1. **Preprocess**: fix rotation and skew, split multi-document scans, drop blank pages, upscale small text.
2. **Classify** first: different document types need different schemas and prompts (a cheap model or rules).
3. **Parse** to an intermediate representation that preserves **reading order, tables and page/bbox coordinates**. Keep coordinates so every extracted value can point back to the source.
4. **Extract** to a **strict schema** (structured outputs), with each field carrying its **evidence** (quote and page).
5. **Validate in code**: arithmetic, formats, ranges, cross-field and database lookups.
6. **Route** failures and low-confidence results to **human review**, and feed corrections back into your eval set.

## Tables, forms and charts

- **Tables** are the hardest part. Prefer parsers with **table-structure recognition** and export to HTML/Markdown/CSV; for merged cells and multi-page tables ask a VLM to read the cropped table and verify row/column sums.
- **Forms** (key-value pairs, checkboxes) benefit from layout models or VLMs with a schema; check mark detection should be tested explicitly.
- **Charts**: extract the underlying numbers when possible; otherwise treat VLM readings as approximate and label them.
- **Handwriting**: quality varies widely; measure it on your own samples and always keep a review path.
- **Figures and diagrams** in RAG: generate a text description at ingest time and store it with the image reference.

## Schema with provenance

```python run title="Extraction schema that carries evidence" level=intermediate
from dataclasses import dataclass, field

@dataclass
class Field:
    value: object
    page: int
    quote: str                                   # exact text the value came from
    confidence: float = 1.0

@dataclass
class Invoice:
    vendor: Field
    invoice_number: Field
    date: Field
    total: Field
    lines: list = field(default_factory=list)    # each line: dict of Fields

# what an extractor (LLM or VLM) would return, after parsing its JSON output
inv = Invoice(
    vendor=Field("ACME GmbH", 1, "ACME GmbH, Hauptstr. 4"),
    invoice_number=Field("INV-2041", 1, "Invoice No. INV-2041"),
    date=Field("2026-03-14", 1, "Date: 14.03.2026"),
    total=Field(1190.00, 2, "Total EUR 1,190.00", confidence=0.93),
    lines=[{"desc": Field("Consulting", 1, "Consulting 10h"), "amount": Field(1000.00, 1, "1,000.00")}],
)
print(inv.total.value, "from", repr(inv.total.quote), "on page", inv.total.page)
print("every field points back to its source, so a reviewer can verify in one click")
```

## Validate in code, not in the prompt

LLMs make plausible mistakes. Deterministic rules catch most of them.

```python run title="Validation layer: sums, dates, formats and quote checks" level=advanced
import re
from datetime import date

document_text = """ACME GmbH, Hauptstr. 4
Invoice No. INV-2041   Date: 14.03.2026
Consulting 10h   1,000.00
VAT 19%            190.00
Total EUR 1,190.00"""

extracted = {"vendor": "ACME GmbH", "invoice_number": "INV-2041", "date": "2026-03-14",
             "net": 1000.00, "vat_rate": 0.19, "vat": 190.00, "total": 1190.00,
             "quotes": {"invoice_number": "INV-2041", "total": "Total EUR 1,190.00"}}

def validate(d, text):
    problems = []
    if not re.fullmatch(r"INV-\d{4,}", d["invoice_number"]):
        problems.append("invoice number format")
    try:
        y, m, dd = map(int, d["date"].split("-")); date(y, m, dd)
        if not (2000 <= y <= 2100):
            problems.append("date out of range")
    except Exception:
        problems.append("invalid date")
    if abs(d["net"] * d["vat_rate"] - d["vat"]) > 0.01:
        problems.append("VAT does not match net * rate")
    if abs(d["net"] + d["vat"] - d["total"]) > 0.01:
        problems.append("net + VAT != total")
    for k, quote in d["quotes"].items():                                  # evidence must really appear in the source
        if quote not in text:
            problems.append(f"quote for {k} not found in document (possible hallucination)")
    return problems

print("clean extraction ->", validate(extracted, document_text) or "all checks passed")
bad = dict(extracted, total=1900.00)                                       # simulate a misread digit
print("misread total    ->", validate(bad, document_text))
bad2 = dict(extracted, quotes={"total": "Total EUR 1,900.00"})              # simulate an invented quote
print("invented quote   ->", validate(bad2, document_text))
```

Typical rule types: **format** (regex, checksum such as IBAN), **range**, **arithmetic consistency**, **cross-document** (PO number exists, vendor in master data), **evidence presence** (quote appears in OCR text), and **duplicates**. A failed rule is a signal for retry with a stronger model, a second pass on the crop, or human review.

## Measuring quality

Different layers need different metrics:

| Layer | Metric |
|---|---|
| **OCR text** | **CER** (character error rate) and **WER**: edit distance divided by reference length |
| **Layout / reading order** | order accuracy, table cell accuracy (TEDS-style tree edit distance) |
| **Extraction** | **field-level precision / recall / exact match**, normalised (dates, amounts) |
| **End to end** | straight-through rate (documents needing no human touch), error rate on auto-approved documents, cost per document |

```python run title="CER and field-level scoring" level=intermediate
def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]

def cer(ref, hyp):
    return edit_distance(ref, hyp) / max(len(ref), 1)

ref = "Total EUR 1,190.00"
for name, hyp in {"perfect": "Total EUR 1,190.00", "one char": "Total EUR 1,l90.00", "dropped digits": "Total EUR 1,19", "garbled": "Tota1 EUR l.190,0O"}.items():
    print(f"{name:15} CER={cer(ref, hyp):.2f}   {hyp!r}")

# field-level evaluation across a small labelled set
gold = [{"total": "1190.00", "date": "2026-03-14", "vendor": "ACME GmbH"},
        {"total": "89.90",   "date": "2026-04-02", "vendor": "Beta AG"},
        {"total": "250.00",  "date": "2026-04-05", "vendor": "Gamma Ltd"}]
pred = [{"total": "1190.00", "date": "2026-03-14", "vendor": "ACME GmbH"},
        {"total": "89.00",   "date": "2026-04-02", "vendor": "Beta AG"},
        {"total": "250.00",  "date": None,         "vendor": "Gamma Limited"}]
for f in ("total", "date", "vendor"):
    correct = sum(p[f] == g[f] for p, g in zip(pred, gold))
    answered = sum(p[f] is not None for p in pred)
    print(f"{f:7} exact match {correct}/{len(gold)}   precision {correct / answered:.2f}   recall {correct / len(gold):.2f}")
print("note: 'Gamma Limited' vs 'Gamma Ltd' needs normalisation rules or fuzzy matching before scoring")
```

Report errors **by field and by document type**, and weight by business cost (a wrong total is worse than a wrong middle initial). Evaluate on **real, messy** samples including bad scans, rotated pages, multilingual and handwritten documents.

## Documents for RAG

When the goal is retrieval rather than extraction:

- Convert to **Markdown with headings and tables intact** so chunking by structure works (see the RAG chunking lesson).
- Keep **page numbers and section paths** as metadata for citations.
- Store **table summaries** next to raw tables; describe figures in text.
- Consider **vision-based retrieval (ColPali-style)** to embed page images directly, which sidesteps OCR errors (next lesson).
- Deduplicate and handle versions of the same document.

## Cost, latency and privacy

- Text-layer extraction costs nothing; OCR is cheap; VLM calls are the expensive step, so **cascade**: cheap parser first, VLM only for low-confidence regions or pages.
- Batch API and caching apply to large back-catalogues.
- Documents are often **sensitive** (IDs, medical, financial): minimise retention, redact PII before logging, check data-processing terms, and consider on-premises parsers or private deployments for regulated content.
- Handle **prompt injection in documents**: text inside a PDF can instruct the model. Treat document content as data, constrain outputs to the schema, and never let extracted text trigger tool calls without checks.

```quiz
? Why should you read a text-native PDF with a PDF text extractor rather than OCR?
+ The text layer contains exact characters for free, whereas OCR can introduce errors
- OCR is always faster
- PDF extractors understand images better
> Use OCR for scans and images only.

? What is the main advantage of validating extracted fields in code?
+ Deterministic rules (sums, formats, evidence checks) catch plausible-looking model mistakes
- It makes the model smarter
- It removes the need for a schema
> Treat the model as a proposer and code as the verifier.

? How is CER computed?
+ Edit distance between recognised and reference text divided by the reference length
- Number of words correct
- Fraction of pages processed
> Lower is better; it measures character-level OCR accuracy.

? Which design best controls cost on a large document backlog?
+ A cascade: cheap parser first, escalate only low-confidence pages or regions to a VLM
- Send every page to the largest model
- Skip validation
> Reserve expensive calls for hard cases.
```

:::problem Design a system that extracts line items and totals from 50,000 supplier invoices per month in 20 layouts and languages, with a target of under 1% errors on auto-approved invoices. {level=hard tags="document-ai,design"}
Cover pipeline, validation, human review, evaluation and drift.

:::solution Model answer
Pipeline: ingest, preprocess (rotate, deskew), **classify layout/vendor**, parse with a layout-aware parser (text layer when present, OCR otherwise) into Markdown/JSON with coordinates, then **extract to a strict schema with evidence quotes** (small/cheap model first; escalate pages with low confidence or failed rules to a stronger VLM on the cropped region). **Validate**: totals and VAT arithmetic, line sums, date and currency formats, vendor and PO lookups, quote-in-source check, duplicate detection. Route failures to **human review** with the source highlighted; corrections go into the labelled set. Auto-approve only when all rules pass and confidence is above a threshold calibrated on a held-out set to reach <1% error. Evaluation: stratified labelled sample per layout and language, field-level precision/recall, auto-approval error rate, straight-through rate, cost per invoice; run regression evals on every prompt/model change. Operations: monitor per-vendor failure rates and new layouts (drift), sample audits of auto-approved invoices, PII-safe logging, retention limits, and fallbacks if a provider is down.
:::
:::

:::keypoints
- Document AI = preprocess, classify, parse (text layer/OCR/layout/tables), extract to a schema with evidence, validate in code, review exceptions.
- Combine tools: text extractors and layout parsers for structure, VLMs for hard regions, code for verification.
- Keep coordinates, quotes and page numbers so every value is traceable.
- Measure CER for OCR, field-level precision/recall for extraction, and straight-through rate and auto-approval error for the system.
- Cascade for cost, protect sensitive data, and treat document text as untrusted input.
:::

:::resources
- [Docling](https://github.com/docling-project/docling) — open-source document conversion with layout and tables.
- [Unstructured](https://docs.unstructured.io) — partitioning and cleaning pipelines for many file types.
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) — the classic open-source OCR engine.
- [Claude docs: PDF support](https://docs.claude.com/en/docs/build-with-claude/pdf-support) — sending PDFs directly to a model.
- [ColPali](https://arxiv.org/abs/2407.01449) — retrieval over page images that skips OCR.
- [Hugging Face Cookbook](https://huggingface.co/learn/cookbook) — document-processing recipes.
:::
