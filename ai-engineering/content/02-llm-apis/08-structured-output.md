---
title: Structured Output — Getting Reliable JSON
level: intermediate
time: 50
summary: How to make a model return data your code can trust. The four levels (ask nicely, JSON mode, tool-based extraction, schema-constrained decoding), designing good schemas, Pydantic validation, a validate-and-repair loop, and a from-scratch demonstration of how constrained decoding masks tokens so invalid JSON becomes impossible.
---

Programs consume data, not prose. The moment an LLM's output feeds another system (a database insert, an API call, a UI component), you need it in a **predictable structure**. This lesson is the toolbox for that, from cheap and flaky to strict and guaranteed.

## The four levels

| Level | How | Reliability | Notes |
|---|---|---|---|
| 1. Ask in the prompt | "Return JSON with keys a, b" + examples | decent on strong models, fails sometimes | You must parse and validate |
| 2. JSON mode | the API guarantees syntactically valid JSON | valid syntax, not necessarily your schema | Provider feature |
| 3. Tool-based | define a "tool" whose input schema is your structure; the model "calls" it | good; schema-guided | Works on many providers; use `strict` where offered |
| 4. **Schema-constrained decoding** | the decoder only allows tokens that keep the output valid for a JSON Schema | **guaranteed** valid shape | Called "structured outputs" at several providers |

On the Claude API, level 4 is `output_config.format` (a JSON Schema), or `client.messages.parse()` with a Pydantic model. Strict tool use (`strict: true`) gives the same guarantee for tool inputs.

## Pydantic: one definition for schema and validation

:::def Pydantic
A Python library where you describe data as typed classes. It validates and converts incoming data, and can emit a **JSON Schema** from the same class, so your prompt schema and your runtime validation never drift apart.
:::

```python local title="Structured extraction with the Anthropic SDK + Pydantic"
from pydantic import BaseModel, Field
from typing import Literal
import anthropic

class Ticket(BaseModel):
    category: Literal["billing", "bug", "feature_request", "other"]
    urgency: Literal["low", "medium", "high"]
    summary: str = Field(description="One sentence, under 20 words")
    needs_human: bool

client = anthropic.Anthropic()
response = client.messages.parse(
    model="claude-haiku-5-5",
    max_tokens=1000,
    messages=[{"role": "user", "content": "Extract a ticket: 'I was charged twice for March and my payroll run is blocked!'"}],
    output_format=Ticket,
)
ticket = response.parsed_output           # a validated Ticket instance
print(ticket)
```

```python local title="The same thing with a raw JSON Schema"
import json
response = client.messages.create(
    model="claude-haiku-5-5",
    max_tokens=1000,
    messages=[{"role": "user", "content": "Extract: John Smith (john@example.com) wants the Enterprise plan."}],
    output_config={"format": {"type": "json_schema", "schema": {
        "type": "object",
        "properties": {"name": {"type": "string"}, "email": {"type": "string"}, "plan": {"type": "string"}},
        "required": ["name", "email", "plan"],
        "additionalProperties": False,
    }}},
)
data = json.loads(next(b.text for b in response.content if b.type == "text"))
```

Constrained output guarantees the **shape**, not the **truth**: the email may still be wrong. And a `max_tokens` cut-off can still truncate the JSON, so check `stop_reason`.

## Designing schemas that models fill in well

- **Use enums** (`Literal[...]`) for closed sets instead of free text.
- **Add field descriptions**: they are part of the prompt. "date in ISO-8601 (YYYY-MM-DD)" beats "date".
- **Keep it flat and small.** Deep nesting and dozens of optional fields invite mistakes and may hit schema-size limits.
- **Make "unknown" representable**: use `null` / optional fields or an explicit `"unknown"` option so the model need not invent values.
- **Order matters for quality**: if you want reasoning, put a `reasoning` string field *before* the final `answer` field, because generation is left to right.
- **Validate beyond types** with your own rules (ranges, cross-field consistency, existence in the database).
- **Version your schema** like an API.

## Validate, repair, retry

Even with guarantees, validate. Without guarantees (level 1–2, or open-weight models), build a **repair loop**.

```python run title="A minimal JSON-Schema validator" level=intermediate
def validate(value, schema, path="$"):
    """Return a list of error strings. Supports type, enum, required, properties, items, minimum/maximum, additionalProperties."""
    errors = []
    t = schema.get("type")
    py = {"string": str, "integer": int, "number": (int, float), "boolean": bool, "array": list, "object": dict, "null": type(None)}
    if t and (not isinstance(value, py[t]) or (t in ("integer", "number") and isinstance(value, bool))):
        return [f"{path}: expected {t}, got {type(value).__name__}"]
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: {value!r} not in {schema['enum']}")
    if t in ("integer", "number"):
        if "minimum" in schema and value < schema["minimum"]: errors.append(f"{path}: {value} < minimum {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]: errors.append(f"{path}: {value} > maximum {schema['maximum']}")
    if t == "object":
        props = schema.get("properties", {})
        for k in schema.get("required", []):
            if k not in value: errors.append(f"{path}: missing required '{k}'")
        for k, v in value.items():
            if k in props: errors += validate(v, props[k], f"{path}.{k}")
            elif schema.get("additionalProperties") is False: errors.append(f"{path}: unexpected key '{k}'")
    if t == "array":
        for i, item in enumerate(value):
            errors += validate(item, schema.get("items", {}), f"{path}[{i}]")
    return errors

schema = {"type": "object", "required": ["category", "urgency"], "additionalProperties": False,
          "properties": {"category": {"type": "string", "enum": ["billing", "bug", "other"]},
                         "urgency": {"type": "integer", "minimum": 1, "maximum": 5}}}
for doc in [{"category": "billing", "urgency": 3},
            {"category": "refund", "urgency": 9},
            {"category": "bug"},
            {"category": "bug", "urgency": 2, "note": "x"}]:
    print(doc, "->", validate(doc, schema) or "valid")
```

```python run title="Validate → feed errors back → retry" level=intermediate
import json, re

# A fake "model" that is wrong the first time and fixes itself when shown the error
class FakeModel:
    def __init__(self): self.calls = 0
    def generate(self, prompt):
        self.calls += 1
        if "Your previous output was invalid" not in prompt:
            return 'Sure! Here you go: {"category": "refund", "urgency": "high"}'     # prose + wrong values
        return '{"category": "billing", "urgency": 4}'

SCHEMA = {"type": "object", "required": ["category", "urgency"], "properties": {
    "category": {"type": "string", "enum": ["billing", "bug", "other"]},
    "urgency": {"type": "integer", "minimum": 1, "maximum": 5}}}

def extract_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m: raise ValueError("no JSON object found")
    return json.loads(m.group(0))

def check(obj):                       # reuse a validator in real code; kept tiny here
    errs = []
    if obj.get("category") not in SCHEMA["properties"]["category"]["enum"]: errs.append("category must be billing|bug|other")
    if not isinstance(obj.get("urgency"), int) or not 1 <= obj["urgency"] <= 5: errs.append("urgency must be an integer 1-5")
    return errs

def structured_call(model, task, max_attempts=3):
    prompt = f"{task}\nReturn JSON matching the schema."
    for attempt in range(1, max_attempts + 1):
        raw = model.generate(prompt)
        try:
            obj = extract_json(raw)
            errs = check(obj)
        except (ValueError, json.JSONDecodeError) as e:
            errs = [str(e)]
        if not errs:
            return obj, attempt
        prompt += f"\nYour previous output was invalid: {errs}. Return corrected JSON only."
    raise RuntimeError("could not get valid output")

model = FakeModel()
print(structured_call(model, "Classify: 'charged twice'"))
```

Keep the number of repair attempts small (2–3), log every failure (it tells you where the prompt or schema is weak), and route repeated failures to a fallback.

## How constrained decoding works

Why can a decoder *guarantee* valid JSON? Because at each step it **masks out every token that would make the output invalid**, then samples from what is left. You can see the idea in a tiny model with a tiny grammar:

```python run title="Constrained decoding: masks make invalid output impossible" level=advanced
import numpy as np

rng = np.random.default_rng(3)
vocab = ["{", "}", '"name"', '"age"', ":", ",", '"Ada"', "36", "banana", "<eos>"]

# A tiny grammar as a state machine: which token ids are allowed after each state
GRAMMAR = {
    "start":      {"{": "key"},
    "key":        {'"name"': "colon_name", '"age"': "colon_age"},
    "colon_name": {":": "name_val"},
    "colon_age":  {":": "age_val"},
    "name_val":   {'"Ada"': "after"},
    "age_val":    {"36": "after"},
    "after":      {",": "key", "}": "end"},
    "end":        {"<eos>": "done"},
}

def softmax(z):
    e = np.exp(z - z.max()); return e / e.sum()

def decode(constrained, steps=14):
    state, out = "start", []
    for _ in range(steps):
        logits = rng.normal(size=len(vocab)) * 2          # a "model" with no idea of JSON
        if constrained:
            allowed = GRAMMAR.get(state, {})
            mask = np.array([0.0 if t in allowed else -np.inf for t in vocab])
            logits = logits + mask                        # forbid every invalid token
        tok = vocab[rng.choice(len(vocab), p=softmax(logits))]
        out.append(tok)
        if constrained:
            state = GRAMMAR[state][tok]
            if state == "done": break
    return " ".join(out)

print("unconstrained:", decode(False))
print("constrained:  ", decode(True))
```

Real systems compile a JSON Schema or grammar into an automaton over **tokens** (not characters), cache the allowed-token masks, and apply them on the GPU. Open-source engines do this too: [Outlines](https://github.com/dottxt-ai/outlines), [XGrammar](https://github.com/mlc-ai/xgrammar), llama.cpp grammars, vLLM and SGLang guided decoding. You will build a version in the project lab.

:::note Constraints can reduce quality
Forcing a format can slightly hurt reasoning-heavy tasks because the model cannot "think out loud" first. Give it a `reasoning` field, or do a free-form step first and a structured step second (**two-stage extraction**).
:::

## Instructor and friends

Libraries such as **Instructor** ([docs](https://python.useinstructor.com)) and **PydanticAI** ([docs](https://ai.pydantic.dev)) wrap this whole pattern (schema → call → validate → retry) across many providers, with a consistent Pydantic-based API.

```quiz
? What does schema-constrained decoding guarantee?
- That every value is factually correct
+ That the output is valid for the schema (the shape), because invalid tokens are masked
- That the model never refuses
> It guarantees structure, not truth. Validate semantics yourself.

? Why put a "reasoning" field before the "answer" field in a schema?
+ Generation is left to right, so reasoning written first can inform the answer
- It makes the JSON shorter
- Fields are always generated in alphabetical order
> Order in the schema is order of generation.

? What should a repair loop send back to the model?
- The same prompt again
+ The specific validation errors, asking for corrected output
- Nothing
> Targeted error messages fix most failures on the second try.

? Which is better for a closed set of categories?
- A free-text string
+ An enum (Literal) in the schema
- Two nested objects
> Enums eliminate invented labels and spelling variants.
```

:::problem Design the extraction pipeline for 10,000 invoices per day. {level=medium tags="structured output,pipeline"}
Include schema, validation, failure handling and cost.

:::solution Model answer
Use a **strict schema** (vendor, invoice number, date ISO, currency enum, line items with amount as number, `null` allowed for unknown) via structured outputs. Pre-process: OCR/PDF text or send the PDF to a vision-capable model. A **small, fast model** first; validate with code (totals equal sum of lines, date plausible, vendor exists). Failures or low-confidence cases → **retry with the validation error**, then escalate to a larger model, then a **human review queue**. Use the **batch API** (cheaper) for non-urgent volume and prompt caching for the static prefix. Log schema version, model, tokens and per-field accuracy against a labelled sample; monitor drift.
:::
:::

:::keypoints
- Pick the strictest level your provider supports: structured outputs / strict tools guarantee valid shape; otherwise validate and repair.
- Define one Pydantic model for schema and validation; enums, descriptions, flat shapes, nullable unknowns.
- Constrained decoding works by masking invalid tokens at each step; it guarantees structure, not correctness.
- Validate semantics in code; feed errors back for 1–2 repairs; escalate or route to a human.
- Reasoning before the answer, or a two-stage approach, protects quality.
:::

:::resources
- [Claude docs: Structured outputs](https://docs.claude.com/en/docs/build-with-claude/structured-outputs) — schema-constrained responses and strict tools.
- [OpenAI: Structured outputs guide](https://platform.openai.com/docs/guides/structured-outputs) — the same idea, with notes on schema limits.
- [Outlines](https://github.com/dottxt-ai/outlines) and [XGrammar](https://github.com/mlc-ai/xgrammar) — open-source constrained decoding.
- [Instructor](https://python.useinstructor.com) and [PydanticAI](https://ai.pydantic.dev) — schema-first LLM libraries.
- [Pydantic docs](https://docs.pydantic.dev) — validation and JSON Schema generation.
- [JSON Schema](https://json-schema.org/understanding-json-schema) — the language behind it all.
:::
