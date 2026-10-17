---
title: Schemas: the contract with the model
level: easy
time: 40
summary: Describe each document type as a Pydantic model with rules, make every field required but nullable, and run the real invoice model in your browser against good and bad data.
tags: Pydantic, validation, JSON Schema, nullable
---

The schema is the most important file in this project. It is the contract between *you*, *the model* and *the interface*: one class that decides what a valid invoice is.

## One class, three jobs

```viz algo=arch title="One Pydantic model feeds three consumers" dir=right
model Invoice model | Pydantic class [prompt] @0,0
schema JSON Schema | sent to the model [llm] @1,0
valid Validation | rules after the reply [guard] @1,1.5
form Form description | for React [browser] @1,-1.5
--
model -> schema : model_json_schema()
model -> valid : model_validate()
model -> form : describe()
```

Write the rules once and the model is *told* them, your server *enforces* them, and the interface *draws* itself from them. They cannot drift apart.

## Step 1: the building blocks

The shared imports and a helper for comparing money, because floating-point numbers are approximate:

```python src="smart-extractor/backend/app/doctypes/models.py" region="base" title="backend/app/doctypes/models.py"
```

`close(a, b)` says two amounts are equal if they differ by at most two cents. Money is rounded to cents on paper, but `0.1 + 0.2 == 0.3` is `False` in Python, and comparing with `==` would reject correct invoices.

## Step 2: the invoice model

```python src="smart-extractor/backend/app/doctypes/models.py" region="invoice" title="backend/app/doctypes/models.py"
```

Read it as three layers of rules:

1. **Field types** (`float`, `date`): a string that is not a date is rejected before anything else.
2. **Field constraints** (`gt=0`, `ge=0`, `min_length=1`): a quantity of zero or an invoice with no lines is rejected.
3. **Rules that span fields** (`model_validator`): the line adds up, the lines add up to the subtotal, subtotal plus tax equals the total, the due date is not before the invoice date. These are what a JSON Schema *cannot express*, and they are where most real errors hide.

The error messages are written for two readers: a person, and **the model on a repair turn**. "quantity x unit_price is 2500.00 but amount is 2000.00" tells either exactly what to fix. A message like "invalid line" would not.

## Required but nullable

Look at `due_date: date | None = Field(description=...)`. There is **no default**. In Pydantic that means *the key must be present, and its value may be null*. This is deliberate:

| Choice | What the model does when the document has no due date |
|---|---|
| `due_date: date \| None = None` (optional) | may leave the key out, silently. You cannot tell "no due date" from "forgot to look" |
| `due_date: date \| None` (required, nullable) | must write `"due_date": null`, an explicit decision |

Forcing a decision for every field makes the output more complete and the missing values visible. It also keeps the schema simple for the structured-output grammar.

## Step 3: run it

This block runs the real `models.py` from the project, in your browser, with Pydantic. First a correct invoice, then three different mistakes. Change the numbers and run again.

```python run src="smart-extractor/backend/app/doctypes/models.py" region="base,invoice" title="Validate invoices with the real model" level=easy
from pydantic import ValidationError

good = {
    "vendor": "Sharma Stationers", "invoice_number": "INV-1", "invoice_date": "2026-10-14", "due_date": None, "currency": "inr",
    "line_items": [{"description": "Paper", "quantity": 10, "unit_price": 250, "amount": 2500}],
    "subtotal": 2500, "tax": 450, "total": 2950,
}

def check(label, data):
    try:
        inv = Invoice.model_validate(data)
        print(f"{label}: OK  (currency stored as {inv.currency})")
    except ValidationError as err:
        for e in err.errors():
            where = ".".join(str(p) for p in e["loc"]) or "(whole invoice)"
            print(f"{label}: {where}: {e['msg'].removeprefix('Value error, ')}")

check("good            ", good)
check("wrong total     ", {**good, "total": 3000})
check("wrong line      ", {**good, "line_items": [{"description": "Paper", "quantity": 10, "unit_price": 250, "amount": 2000}]})
check("due before issue", {**good, "due_date": "2026-10-01"})
check("not a date      ", {**good, "invoice_date": "last Tuesday"})
check("key left out    ", {k: v for k, v in good.items() if k != "due_date"})
```

Things to notice in the output:

- `currency="inr"` was **normalised** to `INR` by the validator. Cleaning small things is better than rejecting them.
- Errors say **where** (`line_items.0`) and **why**, in words the model can act on.
- A rule that involves several fields reports at `(whole invoice)`: Pydantic does not know which of the three numbers is the wrong one.
- Leaving out `due_date` is an error, but `"due_date": null` is fine.

## The other two types

The meeting and ticket models follow the same pattern with different rules. Highlights:

```python src="smart-extractor/backend/app/doctypes/models.py" region="meeting,ticket" title="backend/app/doctypes/models.py"
```

- `Literal["billing", "bug", ...]` turns a free-text label into a **closed set**. The model must pick one, and the form becomes a dropdown with no extra code.
- `priority` carries a description that *defines* the levels ("urgent = money lost or service down"). Descriptions are part of the prompt: they are how you teach the model your meaning of a word.
- `short_summary` enforces 200 characters. Length limits cannot be sent to the API (it does not support `maxLength`), but our validation enforces them anyway, and the repair loop teaches the model.

## The registry: one more piece of information per type

A document type is more than a schema. It also needs instructions only it has, and a list of fields that must be **copied from the text** (grounding checks those):

```python src="smart-extractor/backend/app/doctypes/__init__.py" region="registry" title="backend/app/doctypes/__init__.py"
```

`verbatim` uses `[]` to mean "every item of this list": `line_items[].amount` covers all lines. A summary or category is the model's own wording, so it is **not** listed; checking it against the text would only create false alarms. Choosing the verbatim list is a design decision, and the next-but-one lessons depend on it.

:::warn Do not make rules the data cannot meet
Every rule you add can reject a legitimate document. A tax rule that assumes 18% would reject an invoice with 5% GST. Validate *consistency* (things that must be true of any correct document: totals add up), not *policy* (things you expect to be true of your typical customer).
:::

:::keypoints
- One Pydantic model is the prompt's schema, the server's validator and the form's description.
- Rules that span fields (arithmetic, date order) are what JSON Schema cannot say, and where real errors live.
- Make every field required, and write "may be absent" as `X | None` with no default, so the model must decide.
- Write error messages for the model's repair turn: say where, what you found, and what was expected.
- Validate consistency, not policy; keep the verbatim list to values that are really copied.
:::

```quiz
? Why is due_date declared as `date | None` with no default?
- So the model can leave it out
+ So the key must be present, and the model must explicitly say null when the document has no due date
- Because Python requires it
> A required nullable field turns "forgot to look" into an explicit decision, and missing values stay visible.
? Which of these checks belongs in a `model_validator` rather than in the JSON Schema?
- quantity must be a number
+ subtotal plus tax must equal total
- due_date must be a string
> Types are in the schema. Arithmetic across fields is a rule the schema language cannot express.
? Why use `close(a, b)` instead of `a == b` for money?
- It is faster
+ Floating-point arithmetic is approximate, so exact equality can reject correct invoices
- Money is stored as text
> 0.1 + 0.2 is not exactly 0.3 in floating point. A tolerance of a cent or two avoids false rejections.
```

:::exercise Add a rule, then break it
Add a rule to `Invoice` that rejects a negative `tax`. Wait: `ge=0` already does. Instead add this: if `currency` is `"INR"`, `tax` must be 0 or between 5% and 28% of the subtotal. Run it on the sample invoice and on one with tax 50 on a subtotal of 4,120. Then ask yourself: is this *consistency* or *policy*? What would you lose by shipping it?
:::
:::solution
It is policy: some zero-rated or special-case Indian invoices fall outside that band (exports, composition-scheme dealers, cess), so you would flag good documents. A safer approach is a **warning** (grounded in the text, shown to the user) instead of a hard rejection. In this project, warnings come from grounding; a policy check would be a third kind of issue with `level: "warning"`.
:::
