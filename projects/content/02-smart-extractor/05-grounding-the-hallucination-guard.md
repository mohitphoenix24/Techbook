---
title: Grounding: the hallucination guard
level: easy
time: 35
summary: Catch values the model made up by checking that each copied name, number and date really appears in the document, and return the exact span so the interface can highlight it. Runs live in your browser.
tags: grounding, hallucination, verification, offsets
---

Validation asks: *is this answer consistent?* Grounding asks a different question: **is this answer in the document?** A model can return an invoice number that follows every rule, is the right format, and appears nowhere on the page. Nothing in the schema can catch that, because nothing in the schema knows what the page says.

:::def Grounding
Checking that each value the model was supposed to *copy* really occurs in the source, and recording where. A value with no evidence is not necessarily wrong, but it is exactly the kind of value a person should look at.
:::

## Which fields to check

Grounding only makes sense for values the model **copies**: names, identifiers, amounts, dates. It makes no sense for values the model **creates**: a summary, a category, a sentiment. Those are the model's own words, and searching for them in the text would only produce false alarms. The registry already encodes this choice per document type:

```python src="smart-extractor/backend/app/doctypes/__init__.py" region="registry" title="backend/app/doctypes/__init__.py"
```

`line_items[].amount` means "the `amount` of every line item". The `[]` is turned into a regular expression later.

## Step 1: three finders

Each kind of value needs its own way to look something up, because the *same* value is written many ways:

| Value | In the JSON | In the document |
|---|---|---|
| a name | `"Sharma Stationers Pvt Ltd"` | `Sharma  Stationers\nPvt Ltd` (extra space, a line break) |
| a number | `4861.6` | `INR 4,861.60` |
| a date | `"2026-10-14"` | `14 Oct 2026`, `14/10/2026`, `Oct 14, 2026` |

So we search for the *meaning*, not the characters. Dates first, since numbers and names are simpler:

```python src="smart-extractor/backend/app/dates.py" region="dates" title="backend/app/dates.py"
```

Day comes first in numeric dates (`03/04/2026` is 3 April), as in India and most of the world. Impossible dates such as 31 February are skipped by the `try/except ValueError`. A date written without a year (`15 Oct`) can borrow the year of the first complete date in the document, which is how meeting notes are usually written.

```python src="smart-extractor/backend/app/grounding.py" region="finders" title="backend/app/grounding.py: the finders"
```

Every finder returns a **span** `(start, end)`: character positions in the source. That is more useful than yes or no, because the interface can highlight the exact text a value came from.

## Step 2: check a whole result

```python src="smart-extractor/backend/app/grounding.py" region="ground" title="backend/app/grounding.py: ground()"
```

- `flatten` turns nested data into `(path, value)` pairs: `{"line_items": [{"amount": 2500}]}` becomes `("line_items.0.amount", 2500)`.
- `_wildcard` turns `line_items[].amount` into the regular expression `^line_items\.\d+\.amount$`.
- Only paths that match a **verbatim** pattern are checked; everything else is silently left out.
- **Zero is skipped.** `tax: 0` because the invoice has no tax line is a correct answer with nothing to point at.

## Step 3: play with it

The block below joins the real `dates.py` and `grounding.py` into one script and runs them in your browser. The first data set is correct. The second contains three problems: an **invented** invoice number, a **wrong** total, and a **real** value written in another format. Run it, then edit the data and see how each change is reported.

```python run src="smart-extractor/backend/app/dates.py,smart-extractor/backend/app/grounding.py" flat title="Grounding playground (dates.py + grounding.py)" level=intermediate
SOURCE = """Sharma Stationers Pvt Ltd
Invoice No: INV-2026-0042   Invoice Date: 14 Oct 2026
Due Date: 13/11/2026

A4 Paper          10   250.00   2,500.00
Total: INR 4,861.60"""

VERBATIM = ["vendor", "invoice_number", "invoice_date", "due_date", "total", "line_items[].amount"]

def show(label, data):
    print(label)
    for path, ev in ground(SOURCE, data, VERBATIM).items():
        where = f"  -> {SOURCE[ev['start']:ev['end']]!r}" if ev["status"] == "found" else ""
        print(f"  {path:<22}{ev['status']:<8}{where}")

show("a correct answer", {
    "vendor": "sharma stationers pvt ltd", "invoice_number": "INV-2026-0042", "invoice_date": "2026-10-14",
    "due_date": "2026-11-13", "total": 4861.6, "line_items": [{"amount": 2500.0}],
})
show("\nan answer with problems", {
    "vendor": "Sharma Stationers Pvt Ltd", "invoice_number": "INV-9999-X", "invoice_date": "2026-10-14",
    "due_date": "2026-11-14", "total": 4916.0, "line_items": [{"amount": 2500.0}],
})
```

Read the output carefully:

- **The vendor matched in lower case.** Names are compared ignoring case and whitespace.
- **`due_date` `2026-11-13` was found as `13/11/2026`**: same date, different format. The second data set has `2026-11-14`, which is **not** in the text, so it is flagged.
- **`total` 4861.6 matched `4,861.60`**, while `4916.0` has no evidence.
- The invented invoice number is reported `missing`, and **that is the whole point**: the JSON was perfectly valid.

:::warn What grounding does not prove
Grounding proves a value is *present*, not that it is *right*. If the model returns the due date where the invoice date belongs, both dates exist in the text, so both are "found". Short values are weak evidence too: a quantity of `2` will match a `2` almost anywhere. Grounding is a cheap filter that catches the worst failure (invention); it does not replace review for important fields.
:::

## How the pipeline and the interface use it

In `extract_document`, after validation succeeds:

```python
evidence = ground(text, data, doc.verbatim)
issues = [{"path": path, "level": "warning", "message": "This value was not found in the document. ..."}
          for path, ev in evidence.items() if ev["status"] == "missing"]
```

A missing value becomes a **warning**, not an error. The result is still *valid* (it passes every rule) but the banner turns amber and the field is marked.

![The result of an invented invoice number: valid, but flagged as not found in the document](assets/img/smart-extractor-flagged.png)

The same `evidence` dictionary, with its offsets, powers the **Evidence** tab. Hovering a field highlights its span in the source:

![The Evidence tab: every value found in the document is highlighted, and the hovered field's text is emphasised](assets/img/smart-extractor-evidence.png)

That highlight is not decoration: it turns "do you trust the model?" into "look, it is right there", and a reviewer who can *see* the evidence reviews far faster than one who has to hunt through a page.

## The tests

```python src="smart-extractor/backend/tests/test_grounding.py" region="grounding-tests" title="backend/tests/test_grounding.py"
```

:::keypoints
- Validation checks consistency; grounding checks that copied values are in the source. They catch different failures.
- Check only the fields the model copies (the `verbatim` list), never its own wording.
- Search for the meaning: ignore case and whitespace in names, understand `4,861.60` and `14/10/2026`.
- Return a span, not a yes/no: the interface can then highlight the evidence.
- A missing value is a warning for a person, not an automatic rejection.
- Grounding proves presence, not correctness; it is a filter, not a replacement for review.
:::

```quiz
? An invoice has due date 13/11/2026. The model returns "2026-11-13". What does grounding report?
- missing, because the text is different
+ found, because the finder understands the date written in another format
- skipped
> find_date reads dates in several formats and compares real dates, not strings.
? Why is the invoice summary of a support ticket not in the verbatim list?
- Because summaries are numbers
+ It is the model's own wording, so searching for it in the text would only create false alarms
- Because it is too long
> Only copied values can be checked against the source. Derived values need other checks.
? Both the invoice date and the due date appear in the text. The model swaps them. What does grounding say?
- Both are flagged
+ Both are found, so grounding does not catch the swap; a validation rule or a reviewer must
- It raises an exception
> Grounding proves presence, not placement. Rules such as "due date is not before invoice date" help here.
```

:::exercise Add a fuzzy match
Names are sometimes abbreviated: "Sharma Stationers" for "Sharma Stationers Pvt Ltd", or "A. Rao" for "Asha Rao". Extend `find_text` so that, if there is no exact match, it accepts the longest run of words (at least two) that appears in the text, and returns that span. Add tests for both abbreviations. What false positives could this introduce, and would you keep it as a *warning* or turn it into a pass?
:::
