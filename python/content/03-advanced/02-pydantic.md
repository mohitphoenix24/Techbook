---
title: Pydantic — Validated Data
level: advanced
time: 30
summary: Turn messy outside data (LLM JSON, API payloads, configs) into clean, typed, validated Python objects. Pydantic is the backbone of structured output, tool calling and FastAPI.
---

LLMs are asked to return JSON, but they can still return a string where you wanted a number, forget a field, or invent a value. User input and third-party APIs are just as messy. **Pydantic** checks data against a schema you describe with type hints, converts what it safely can, and gives clear errors for the rest.

:::def Pydantic
A library that **validates** data using Python type hints. You define a `BaseModel` class with typed fields; creating an instance checks and converts the input, or raises a `ValidationError` explaining every problem.
:::

:::def Schema
A formal description of what data should look like: which fields exist, their types, which are required, and what values are allowed. Pydantic models can export themselves as **JSON Schema** — the format LLM APIs use for tools and structured outputs.
:::

## Your first model

:::syntax
```python
from pydantic import BaseModel

class Name(BaseModel):
    required_field: int
    optional_field: str | None = None
    with_default: float = 1.0

obj = Name(required_field=3)                 # validates on creation
obj = Name.model_validate(some_dict)         # from a dict
obj = Name.model_validate_json(json_text)    # straight from JSON text
obj.model_dump()                             # -> dict
obj.model_dump_json()                        # -> JSON text
```
:::

```python run level=intermediate
from pydantic import BaseModel

class Review(BaseModel):
    text: str
    stars: int
    verified: bool = False

r = Review(text="Great course!", stars="5", verified="yes")   # strings get converted
print(r)
print(r.stars + 1, type(r.stars))        # really an int now
print(r.model_dump())
print(r.model_dump_json())
```

Notice: `"5"` became `5` and `"yes"` became `True`. Pydantic **coerces** values when the conversion is safe and unambiguous.

## Validation errors

```python run level=intermediate
from pydantic import BaseModel, ValidationError

class Review(BaseModel):
    text: str
    stars: int
    verified: bool = False

try:
    Review(text=None, stars="five")
except ValidationError as e:
    print(f"{e.error_count()} errors:")
    for err in e.errors():
        print(f"  - field {err['loc']}: {err['msg']}")
```

Every problem is reported at once, with the field location and a readable message. You can even send these messages **back to the LLM** and ask it to fix its output (a "repair loop").

## Constraints with Field

:::def Field
A function that adds rules and metadata to a field: limits (`ge`, `le`, `min_length`, `max_length`), patterns, defaults, and a `description` — which ends up in the JSON Schema the LLM reads.
:::

```python run level=intermediate
from pydantic import BaseModel, Field, ValidationError
from typing import Literal

class GenerationParams(BaseModel):
    model: str = "claude-opus-5-5"
    max_tokens: int = Field(1024, gt=0, le=128_000, description="Maximum tokens to generate")
    temperature: float = Field(1.0, ge=0.0, le=1.0)
    stop: list[str] = Field(default_factory=list, max_length=4)
    effort: Literal["low", "medium", "high"] = "medium"

print(GenerationParams(max_tokens=500, effort="high"))

for bad in [{"temperature": 1.4}, {"max_tokens": 0}, {"effort": "extreme"}, {"stop": ["a", "b", "c", "d", "e"]}]:
    try:
        GenerationParams(**bad)
    except ValidationError as e:
        print(bad, "->", e.errors()[0]["msg"])
```

## Nested models and lists

```python run level=intermediate
from pydantic import BaseModel

class Message(BaseModel):
    role: str
    content: str

class Usage(BaseModel):
    input_tokens: int
    output_tokens: int

    @property
    def total(self) -> int:
        return self.input_tokens + self.output_tokens

class ChatLog(BaseModel):
    id: str
    messages: list[Message]
    usage: Usage

raw = {
    "id": "chat_1",
    "messages": [{"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hello!"}],
    "usage": {"input_tokens": "12", "output_tokens": 5},
}
log = ChatLog.model_validate(raw)
print(log.messages[1].content)      # real objects with dot access — no more ["key"]["key"]
print(log.usage.total)
```

## JSON Schema — what the LLM sees

```python run level=intermediate
import json
from pydantic import BaseModel, Field
from typing import Literal

class SentimentResult(BaseModel):
    """Sentiment analysis of a customer review."""
    sentiment: Literal["positive", "negative", "neutral"]
    confidence: float = Field(ge=0, le=1, description="How sure you are, 0 to 1")
    key_phrases: list[str] = Field(description="Short phrases that drove the decision")

print(json.dumps(SentimentResult.model_json_schema(), indent=2))
```

This schema is exactly what you hand to an LLM for **structured output** or as a **tool's input schema**. Pydantic gives you both directions: schema **out** to the model, validation **in** from the model.

## Custom validators

```python run level=advanced
from pydantic import BaseModel, field_validator, model_validator, ValidationError

class Chunk(BaseModel):
    doc_id: str
    text: str
    start: int
    end: int

    @field_validator("text")
    @classmethod
    def clean_text(cls, v: str) -> str:
        v = " ".join(v.split())               # normalise whitespace
        if not v:
            raise ValueError("text must not be empty")
        return v

    @field_validator("doc_id")
    @classmethod
    def lowercase_id(cls, v: str) -> str:
        return v.strip().lower()

    @model_validator(mode="after")
    def check_span(self):
        if self.end <= self.start:
            raise ValueError(f"end ({self.end}) must be after start ({self.start})")
        return self

print(Chunk(doc_id="  Guide-1 ", text="  RAG   is   neat ", start=0, end=17))
for bad in [dict(doc_id="x", text="   ", start=0, end=5), dict(doc_id="x", text="ok", start=9, end=3)]:
    try:
        Chunk(**bad)
    except ValidationError as e:
        print("invalid:", e.errors()[0]["msg"])
```

## Parsing LLM output safely

Here is the full pattern you will use in real apps: get JSON text from a model, validate it, and handle failure.

```python run level=advanced
from pydantic import BaseModel, Field, ValidationError
from typing import Literal

class Ticket(BaseModel):
    category: Literal["billing", "bug", "feature", "other"]
    priority: int = Field(ge=1, le=5)
    summary: str = Field(max_length=80)

llm_outputs = [
    '{"category": "bug", "priority": 2, "summary": "App crashes on login"}',
    '{"category": "Billing", "priority": "high", "summary": "Charged twice"}',
    'Sure! {"category": "feature"}',
]

for raw in llm_outputs:
    try:
        ticket = Ticket.model_validate_json(raw)
        print("✓", ticket)
    except ValidationError as e:
        problems = "; ".join(f"{'.'.join(map(str, err['loc'])) or 'json'}: {err['msg']}" for err in e.errors())
        print("✗", problems)
        # In a real app: send `problems` back to the model and ask it to fix the JSON
```

## Structured output with Claude (run locally)

The Anthropic SDK accepts a Pydantic model directly and returns a validated object:

```python local title="client.messages.parse with a Pydantic model"
from pydantic import BaseModel
import anthropic

class ContactInfo(BaseModel):
    name: str
    email: str
    plan: str
    interests: list[str]
    demo_requested: bool

client = anthropic.Anthropic()

response = client.messages.parse(
    model="claude-opus-5-5",
    max_tokens=16000,
    messages=[{
        "role": "user",
        "content": "Extract: Jane Doe (jane@co.com) wants Enterprise, interested in API and SDKs, wants a demo.",
    }],
    output_format=ContactInfo,
)

contact = response.parsed_output        # a validated ContactInfo instance
print(contact.name, contact.interests)
```

## Serialization options

```python run level=advanced
from pydantic import BaseModel, Field
from datetime import datetime

class Record(BaseModel):
    id: int
    created: datetime
    api_key: str = Field(exclude=True)          # never serialized
    tags: list[str] = []
    note: str | None = None

r = Record(id=1, created="2026-10-06T12:00:00Z", api_key="sk-secret", tags=["rag"])
print(r.created.year, type(r.created).__name__)         # parsed into a real datetime
print(r.model_dump())                                    # api_key is gone
print(r.model_dump(exclude_none=True, include={"id", "tags", "note"}))
print(r.model_dump_json(indent=2))
print(r.model_copy(update={"tags": ["agents"]}))         # copy with changes
```

## Validating any type with TypeAdapter

You do not always need a class — `TypeAdapter` validates plain types like `list[int]` or `dict[str, float]`:

```python run level=advanced
from pydantic import TypeAdapter, ValidationError

scores = TypeAdapter(dict[str, float])
print(scores.validate_python({"doc1": "0.9", "doc2": 0.4}))

ids = TypeAdapter(list[int])
try:
    ids.validate_json('[1, 2, "three"]')
except ValidationError as e:
    print(e.errors()[0]["loc"], e.errors()[0]["msg"])
```

:::ai Where Pydantic shows up
- **Structured outputs**: define the shape you want; validate the model's JSON.
- **Tool calling**: a tool's parameters = a Pydantic model → JSON Schema for the LLM, validation for the arguments it sends.
- **FastAPI**: request and response bodies are Pydantic models.
- **Config**: `pydantic-settings` validates environment variables.
- **Agent frameworks** like Pydantic AI and the OpenAI Agents SDK are built on it.
:::

## Check yourself

```quiz
? `Review(stars="5")` where `stars: int` — what happens?
+ Pydantic converts "5" to the integer 5
- ValidationError
- stars stays the string "5"
> Safe, unambiguous conversions are applied (lax mode). "five" would fail.

? Which method parses and validates JSON text in one step?
- Model.from_json()
+ Model.model_validate_json()
- json.loads(Model)
> model_validate (dict) and model_validate_json (string) are the v2 entry points.

? Why is `Field(description=...)` useful for LLM work?
+ It appears in the JSON Schema, telling the model what each field means
- It makes validation faster
- It hides the field
> Descriptions guide the model when the schema is used for tools or structured output.

? How do you get a dict back from a model instance?
+ obj.model_dump()
- dict(obj.json())
- obj.to_dict()
> model_dump() → dict, model_dump_json() → JSON string.
```

:::exercise Validate extracted events
Create a model `Event` with `title: str` (1–60 chars), `date: date` (from `datetime`), `attendees: int` (≥ 0, default 0) and `online: bool = False`. Validate this list of LLM outputs and print either the parsed event or the error messages.

```python
outputs = [
    '{"title": "RAG workshop", "date": "2026-11-02", "attendees": "40", "online": true}',
    '{"title": "", "date": "next friday"}',
    '{"title": "Agents meetup", "date": "2026-12-10", "attendees": -3}',
]
```
:::

:::solution
```python run
from datetime import date
from pydantic import BaseModel, Field, ValidationError

class Event(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    date: date
    attendees: int = Field(0, ge=0)
    online: bool = False

outputs = [
    '{"title": "RAG workshop", "date": "2026-11-02", "attendees": "40", "online": true}',
    '{"title": "", "date": "next friday"}',
    '{"title": "Agents meetup", "date": "2026-12-10", "attendees": -3}',
]
for raw in outputs:
    try:
        print("✓", Event.model_validate_json(raw))
    except ValidationError as e:
        print("✗", [f"{err['loc'][0]}: {err['msg']}" for err in e.errors()])
```
:::

:::keypoints
- Subclass `BaseModel` with typed fields; creating an object **validates and converts** the data.
- `Field(...)` adds limits and descriptions; `Literal[...]` restricts to exact values.
- `model_validate` / `model_validate_json` in; `model_dump` / `model_dump_json` out.
- `model_json_schema()` produces the JSON Schema used for LLM tools and structured outputs.
- `field_validator` / `model_validator` add custom rules; `ValidationError` lists every problem.
:::
