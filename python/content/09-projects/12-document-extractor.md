---
title: Invoice Data Extractor
level: advanced
time: 70
icon: box
cover: #64748b,#0ea5e9
tags: extraction, pydantic, structured-output, evaluation
summary: Turn messy invoices into clean, validated JSON — define the schema with Pydantic, build a rule-based baseline, add business-rule validation and a human-review queue, measure field-level accuracy, then upgrade to Claude structured outputs and vision.
---

"Read these invoices / receipts / forms and put the data in our system" is one of the most valuable things AI does in businesses. The hard part isn't calling a model — it's **guaranteeing the data is right**: a strict schema, validation rules, accuracy measurement and a path for humans to fix the uncertain cases. This project builds all of it.

:::flow Extraction pipeline
Document | text or image
Extract | rules or LLM → fields
Validate | schema + business rules
Score | field-level accuracy
Route | auto-approve or human review
Export | clean JSON / CSV
:::

## Step 1 — Invoices in different layouts

```python run shared title="Step 1 · sample invoices"
INVOICES = {
    "inv_a.txt": """ACME SUPPLIES LTD
Invoice No: INV-2026-0412        Date: 2026-09-14
Bill to: Nimbus Notes GmbH
Description                 Qty   Unit price   Amount
Printer paper (box)          10        24.50   245.00
Ink cartridges                4        38.00   152.00
Subtotal: 397.00
VAT (19%): 75.43
TOTAL DUE: EUR 472.43
Payment due by 2026-10-14""",
    "inv_b.txt": """Invoice #7781 — Bright Cloud Hosting
Issued 03/09/2026 to Ada Labs
- Cloud server (monthly) x1 @ 120.00 = 120.00
- Extra storage 500GB x2 @ 15.00 = 30.00
Net amount 150.00 USD
Tax 0.00
Amount payable: 150.00 USD""",
    "inv_c.txt": """TAX INVOICE
Supplier: Chai & Co Catering        GSTIN 27ABCDE1234F1Z5
Invoice: CC/26/1193     Invoice date: 21-Sep-2026
Customer: Pune AI Meetup
Items:
  Samosa platter     3 x 450.00  = 1350.00
  Masala chai (L)    5 x 120.00  =  600.00
Taxable value: 1950.00
GST 5%: 97.50
Grand total: INR 2047.50""",
    "inv_d.txt": """From: Studio Pixel Design (studio@pixel.example)
To: Ada Labs
Ref. PX-0091 / 30 Sep 2026
Logo design ............ 1 × 800.00 = 800.00
Brand guidelines ....... 1 × 400.00 = 400.00
Sum 1150.00 GBP
Tax 230.00
Total 1380.00 GBP""",
}
for name, text in INVOICES.items():
    print(f"── {name} ──\n{text}\n")
```

## Step 2 — The target schema

```python run shared title="Step 2 · Pydantic schema with validation rules"
from datetime import date
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, model_validator, ValidationError

class LineItem(BaseModel):
    description: str
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    amount: Decimal = Field(ge=0)

    @model_validator(mode="after")
    def amount_matches(self):
        if abs(self.quantity * self.unit_price - self.amount) > Decimal("0.01"):
            raise ValueError(f"line '{self.description}': {self.quantity} × {self.unit_price} ≠ {self.amount}")
        return self

class Invoice(BaseModel):
    invoice_number: str = Field(min_length=1)
    vendor: str
    customer: str
    invoice_date: date
    currency: Literal["EUR", "USD", "INR", "GBP"]
    line_items: list[LineItem] = Field(min_length=1)
    subtotal: Decimal
    tax: Decimal = Field(ge=0)
    total: Decimal

    @model_validator(mode="after")
    def totals_add_up(self):
        items = sum(li.amount for li in self.line_items)
        if abs(items - self.subtotal) > Decimal("0.01"):
            raise ValueError(f"line items sum to {items}, but subtotal is {self.subtotal}")
        if abs(self.subtotal + self.tax - self.total) > Decimal("0.01"):
            raise ValueError(f"subtotal {self.subtotal} + tax {self.tax} ≠ total {self.total}")
        return self

print("fields:", list(Invoice.model_fields))
```

:::tip Use Decimal for money
`0.1 + 0.2 != 0.3` with floats. `Decimal` does exact decimal arithmetic — what accounting systems expect. Pydantic converts strings like `"472.43"` to `Decimal` for you.
:::

## Step 3 — A rule-based baseline extractor

Before reaching for an LLM, write a quick baseline. It tells you how hard the problem is and gives you something to beat.

```python run shared title="Step 3 · regex baseline"
import re
from datetime import datetime

def find(patterns, text, flags=re.I):
    for p in patterns:
        if m := re.search(p, text, flags):
            return m.group(1).strip()
    return None

def parse_date(s):
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except (TypeError, ValueError):
            pass
    return None

def money(s):
    return s.replace(",", "") if s else None

def rule_extract(text):
    lines = [l for l in text.splitlines() if l.strip()]
    items = []
    for l in lines:
        m = re.match(r"\s*-?\s*(.+?)\s+x?(\d+)\s*(?:x|@)?\s*([\d.]+)\s*=?\s*([\d.]+)\s*$", l)
        if m and not re.search(r"subtotal|total|tax|vat|gst", l, re.I):
            items.append({"description": m.group(1).strip(" x"), "quantity": m.group(2), "unit_price": m.group(3), "amount": m.group(4)})
    return {
        "invoice_number": find([r"Invoice No:\s*(\S+)", r"Invoice #(\S+)", r"Invoice:\s*(\S+)"], text),
        "vendor": lines[0].strip() if "invoice" not in lines[0].lower() else find([r"—\s*(.+)$", r"Supplier:\s*(.+?)\s{2,}"], text, re.M),
        "customer": find([r"Bill to:\s*(.+)", r"Customer:\s*(.+)", r"to (.+)$"], text, re.M),
        "invoice_date": parse_date(find([r"Date:\s*(\S+)", r"Issued (\S+)", r"Invoice date:\s*(\S+)"], text)),
        "currency": find([r"\b(EUR|USD|INR|GBP)\b"], text),
        "line_items": items,
        "subtotal": money(find([r"Subtotal:\s*([\d,.]+)", r"Net amount\s*([\d,.]+)", r"Taxable value:\s*([\d,.]+)"], text)),
        "tax": money(find([r"VAT[^:]*:\s*([\d,.]+)", r"Tax\s+([\d,.]+)", r"GST[^:]*:\s*([\d,.]+)"], text)),
        "total": money(find([r"TOTAL DUE:\s*\w*\s*([\d,.]+)", r"Amount payable:\s*([\d,.]+)", r"Grand total:\s*\w*\s*([\d,.]+)"], text)),
    }

for name, text in INVOICES.items():
    raw = rule_extract(text)
    try:
        inv = Invoice.model_validate(raw)
        print(f"✅ {name}: {inv.invoice_number} | {inv.vendor} → {inv.customer} | {inv.total} {inv.currency} | {len(inv.line_items)} items")
    except ValidationError as e:
        print(f"❌ {name}: {e.error_count()} problem(s): " + "; ".join(f"{'.'.join(map(str, er['loc'])) or 'invoice'}: {er['msg']}" for er in e.errors())[:300])
```

## Step 4 — Measure field-level accuracy

```python run shared title="Step 4 · evaluation against gold labels"
GOLD = {
    "inv_a.txt": {"invoice_number": "INV-2026-0412", "vendor": "ACME SUPPLIES LTD", "customer": "Nimbus Notes GmbH",
                  "invoice_date": "2026-09-14", "currency": "EUR", "subtotal": "397.00", "tax": "75.43", "total": "472.43", "n_items": 2},
    "inv_b.txt": {"invoice_number": "7781", "vendor": "Bright Cloud Hosting", "customer": "Ada Labs",
                  "invoice_date": "2026-09-03", "currency": "USD", "subtotal": "150.00", "tax": "0.00", "total": "150.00", "n_items": 2},
    "inv_c.txt": {"invoice_number": "CC/26/1193", "vendor": "Chai & Co Catering", "customer": "Pune AI Meetup",
                  "invoice_date": "2026-09-21", "currency": "INR", "subtotal": "1950.00", "tax": "97.50", "total": "2047.50", "n_items": 2},
    "inv_d.txt": {"invoice_number": "PX-0091", "vendor": "Studio Pixel Design", "customer": "Ada Labs",
                  "invoice_date": "2026-09-30", "currency": "GBP", "subtotal": "1150.00", "tax": "230.00", "total": "1380.00", "n_items": 2},
}

def field_scores(extract_fn):
    per_field = {}
    for name, gold in GOLD.items():
        got = extract_fn(INVOICES[name])
        got = {**got, "n_items": len(got.get("line_items") or [])}
        for field, expected in gold.items():
            ok = str(got.get(field) or "").strip().lower() == str(expected).lower()
            per_field.setdefault(field, []).append(ok)
    return {f: sum(v) / len(v) for f, v in per_field.items()}

scores = field_scores(rule_extract)
for field, acc in scores.items():
    print(f"{field:<15} {'█' * int(acc * 20):<20} {acc:.0%}")
print(f"\noverall field accuracy: {sum(scores.values()) / len(scores):.0%}")
```

The three layouts we wrote rules for extract perfectly — and the new layout (`inv_d`) breaks most fields. Regex gets you far on **known** layouts and fails on every new one. That brittleness is exactly where LLMs shine.

## Step 5 — Validation and the human-review queue

```python run shared title="Step 5 · route each document"
def process(name, raw):
    """Validate an extraction and decide: auto-approve, or send to a human with reasons."""
    try:
        inv = Invoice.model_validate(raw)
    except ValidationError as e:
        reasons = [f"{'.'.join(map(str, er['loc'])) or 'invoice'}: {er['msg']}" for er in e.errors()]
        return {"file": name, "status": "needs_review", "reasons": reasons, "draft": raw}
    flags = []
    if inv.total > 10_000:
        flags.append("high value (> 10,000) — policy requires approval")
    if inv.invoice_date > date(2026, 10, 6):
        flags.append("invoice dated in the future")
    status = "needs_review" if flags else "approved"
    return {"file": name, "status": status, "reasons": flags, "invoice": inv}

results = [process(name, rule_extract(text)) for name, text in INVOICES.items()]
for r in results:
    icon = "✅" if r["status"] == "approved" else "🕵️"
    print(f"{icon} {r['file']}: {r['status']}" + (f" — {r['reasons']}" if r["reasons"] else ""))

# Even a PERFECT extraction of inv_d is flagged — the document itself doesn't add up:
perfect_d = {"invoice_number": "PX-0091", "vendor": "Studio Pixel Design", "customer": "Ada Labs",
             "invoice_date": "2026-09-30", "currency": "GBP", "subtotal": "1150.00", "tax": "230.00", "total": "1380.00",
             "line_items": [{"description": "Logo design", "quantity": 1, "unit_price": "800.00", "amount": "800.00"},
                            {"description": "Brand guidelines", "quantity": 1, "unit_price": "400.00", "amount": "400.00"}]}
print("\nperfectly extracted inv_d →", process("inv_d.txt", perfect_d)["reasons"])

approved = [r["invoice"] for r in results if r["status"] == "approved"]
if approved:
    print("\nexport:", approved[0].model_dump_json(indent=2)[:400], "…")
```

:::def Human-in-the-loop
Designing the system so uncertain or high-risk cases go to a person, with the model's draft and the reasons attached. Humans fix fewer documents faster — and their corrections become new evaluation (and training) data.
:::

## Step 6 — Upgrade to Claude (run locally)

With **structured outputs**, Claude returns data that already matches your Pydantic schema — for any layout, in any language. Your validation rules and review queue stay exactly the same.

```python local title="llm_extract.py"
import anthropic

client = anthropic.Anthropic()

EXTRACTION_INSTRUCTIONS = """Extract the invoice data.
- Copy the invoice number exactly as printed.
- Dates in ISO format (YYYY-MM-DD). Amounts as plain numbers without thousands separators.
- 'tax' is the total tax amount (VAT/GST/sales tax); use 0 if none.
- Include every line item."""

def llm_extract(text: str) -> dict:
    response = client.messages.parse(
        model="claude-opus-5-5",
        max_tokens=4096,
        system=EXTRACTION_INSTRUCTIONS,
        messages=[{"role": "user", "content": f"<invoice>\n{text}\n</invoice>"}],
        output_format=Invoice,                 # the Pydantic model from Step 2
    )
    return response.parsed_output.model_dump(mode="json")

scores = field_scores(llm_extract)             # the same evaluation as Step 4
print(scores)
```

```python local title="Scanned invoices and photos: vision"
import base64

def extract_from_image(path: str, media_type: str = "image/png") -> dict:
    data = base64.standard_b64encode(open(path, "rb").read()).decode()
    response = client.messages.parse(
        model="claude-opus-5-5",
        max_tokens=4096,
        system=EXTRACTION_INSTRUCTIONS,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}},
            {"type": "text", "text": "Extract this invoice."},
        ]}],
        output_format=Invoice,
    )
    return response.parsed_output.model_dump(mode="json")
```

:::tip Production checklist for extraction
- **Batch** large backlogs with the Message Batches API (50% cheaper).
- Keep **validation rules** outside the model — they catch both model and document errors.
- Track field-level accuracy over time; sample approved documents for audit.
- Store the **source document + extraction + reviewer corrections** together.
- Never let the model's output trigger payments without the review step for high-value items.
:::

:::exercise Extensions
1. Add a fourth invoice in a new layout and see which regex fields break.
2. Add a `due_date` field (optional) and a rule that it must be after `invoice_date`.
3. Implement **two-model agreement**: run two extractors and send the document to review when they disagree on any money field.
4. Export approved invoices to a CSV with one row per line item using pandas.
:::

:::keypoints
- Start from a strict **schema** (Pydantic + `Decimal`) with **business-rule validators** (totals must add up).
- A **rule-based baseline** shows the difficulty and gives a score to beat.
- Measure **field-level accuracy** against gold labels; the same harness evaluates any extractor.
- Route failures and high-risk cases to **human review** with reasons.
- Upgrade the extractor to **Claude structured outputs** (text or images) without changing validation or routing.
:::
