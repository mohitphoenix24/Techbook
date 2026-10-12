---
title: Dataclasses & Type Hints
level: intermediate
time: 25
summary: Describe your data clearly. Type hints document what goes where; dataclasses give you clean record classes with almost no code. Both are standard in modern AI codebases.
---

Modern Python code is **typed**. Type hints make code self-documenting, let your editor autocomplete and catch bugs, and power libraries like Pydantic and FastAPI. Dataclasses turn "a bunch of related fields" into a proper class in a few lines.

## Type hints

:::def Type hint (annotation)
A note after a name saying what type it should hold: `count: int`, `def f(x: str) -> bool`. Python itself **ignores** hints at runtime — they are for humans, editors and checkers like `mypy` or `pyright`.
:::

:::syntax
```python
name: str = "Ada"
def function(param: int, other: str = "x") -> float: ...
items: list[str]
scores: dict[str, float]
point: tuple[int, int]
maybe: str | None          # "str or None" (Python 3.10+)
```
:::

```python run level=easy
def estimate_cost(input_tokens: int, output_tokens: int, price_in: float = 4.0, price_out: float = 20.0) -> float:
    """Dollar cost for one request; prices are per million tokens."""
    return (input_tokens * price_in + output_tokens * price_out) / 1_000_000

cost: float = estimate_cost(2000, 500)
print(f"${cost:.4f}")

# Hints are NOT enforced at runtime — a float where an int is expected still runs:
print(estimate_cost(2000.7, 500))
print(estimate_cost.__annotations__)      # the hints are stored as plain data
```

### Common types at a glance

| Hint | Meaning | Example value |
|---|---|---|
| `int`, `float`, `str`, `bool` | basic types | `3`, `0.5`, `"hi"`, `True` |
| `list[str]` | list of strings | `["a", "b"]` |
| `dict[str, int]` | dict: str keys → int values | `{"a": 1}` |
| `tuple[int, int]` | exactly two ints | `(32, 512)` |
| `tuple[float, ...]` | any number of floats | `(0.1, 0.2, 0.3)` |
| `set[str]` | set of strings | `{"ai", "ml"}` |
| `str \| None` | a str or None | `None` |
| `Any` | anything (from `typing`) | — |
| `Callable[[str], int]` | a function taking str, returning int | `len` |
| `Literal["user", "assistant"]` | only these exact values | `"user"` |

```python run level=intermediate
from typing import Literal, Callable, Any

Role = Literal["user", "assistant"]             # a type alias
Message = dict[str, str]

def make_message(role: Role, content: str) -> Message:
    return {"role": role, "content": content}

def apply_all(texts: list[str], fn: Callable[[str], str]) -> list[str]:
    return [fn(t) for t in texts]

def first_or_none(items: list[Any]) -> Any | None:
    return items[0] if items else None

print(make_message("user", "hello"))
print(apply_all(["a", "b"], str.upper))
print(first_or_none([]))
```

:::tip Run a type checker
Install `mypy` or `pyright` (VS Code's Pylance uses pyright) and it will underline bugs like passing a `str` where an `int` is expected — **before** you run anything. In big AI projects this saves hours.
:::

## Dataclasses

Writing classes that mostly **hold data** gets repetitive: `__init__`, `__repr__`, `__eq__`… Dataclasses write those for you.

:::def Dataclass
A class decorated with `@dataclass`. You list the fields with type hints, and Python automatically generates `__init__`, `__repr__` and `__eq__`.
:::

:::syntax
```python
from dataclasses import dataclass, field

@dataclass
class Name:
    field_a: int
    field_b: str = "default"
    items: list[str] = field(default_factory=list)
```
:::

```python run level=easy
from dataclasses import dataclass

@dataclass
class Document:
    id: str
    text: str
    source: str = "unknown"

doc = Document("doc-1", "RAG combines search with generation.")
print(doc)                                   # nice repr for free
print(doc.text)
print(doc == Document("doc-1", "RAG combines search with generation."))   # value equality for free
```

Compare with the manual version — same behaviour, much more code:

```python
class Document:
    def __init__(self, id, text, source="unknown"):
        self.id = id
        self.text = text
        self.source = source
    def __repr__(self):
        return f"Document(id={self.id!r}, text={self.text!r}, source={self.source!r})"
    def __eq__(self, other):
        return (self.id, self.text, self.source) == (other.id, other.text, other.source)
```

### Mutable defaults need field()

```python run level=intermediate
from dataclasses import dataclass, field

@dataclass
class ChatSession:
    user_id: str
    model: str = "claude-opus-5-5"
    messages: list[dict] = field(default_factory=list)   # NEW list for each session
    tags: set[str] = field(default_factory=set)

    def add(self, role: str, content: str) -> None:
        self.messages.append({"role": role, "content": content})

    @property
    def turns(self) -> int:
        return sum(1 for m in self.messages if m["role"] == "user")

s1, s2 = ChatSession("u1"), ChatSession("u2")
s1.add("user", "Hi")
print(s1)
print(s2.messages)          # still empty — not shared
print(s1.turns)
```

:::warn
`messages: list = []` in a dataclass raises an error on purpose — Python protects you from the shared-default bug from the Functions lesson. Use `field(default_factory=list)`.
:::

### Useful dataclass options

```python run level=intermediate
from dataclasses import dataclass, asdict, replace, field
import json

@dataclass(frozen=True)          # immutable: fields cannot change
class ModelConfig:
    model: str = "claude-opus-5-5"
    max_tokens: int = 1024
    temperature: float = 1.0

cfg = ModelConfig(max_tokens=4096)
print(cfg)
print(asdict(cfg))                           # -> dict (ready for an API call or JSON)
print(json.dumps(asdict(cfg)))

cheap = replace(cfg, model="claude-haiku-4-5")   # copy with changes
print(cheap)

try:
    cfg.max_tokens = 10
except Exception as e:
    print(type(e).__name__, "-", e)

@dataclass(order=True)            # adds <, > comparisons using field order
class SearchHit:
    score: float
    doc_id: str = field(compare=False)

hits = [SearchHit(0.4, "a"), SearchHit(0.9, "b"), SearchHit(0.7, "c")]
print(sorted(hits, reverse=True))
```

| Option | Effect |
|---|---|
| `frozen=True` | read-only objects (and hashable — usable as dict keys) |
| `order=True` | `<`, `>` sorting by fields in order |
| `slots=True` | less memory, faster attribute access (3.10+) |
| `kw_only=True` | all fields must be passed by keyword (3.10+) |

### Validation with __post_init__

```python run level=advanced
from dataclasses import dataclass

@dataclass
class GenerationParams:
    temperature: float = 1.0
    top_p: float = 1.0
    max_tokens: int = 1024

    def __post_init__(self):           # runs right after the generated __init__
        if not 0 <= self.temperature <= 1:
            raise ValueError(f"temperature must be in [0, 1], got {self.temperature}")
        if not 0 < self.top_p <= 1:
            raise ValueError(f"top_p must be in (0, 1], got {self.top_p}")
        if self.max_tokens <= 0:
            raise ValueError("max_tokens must be positive")

print(GenerationParams(temperature=0.2))
for bad in [dict(temperature=1.7), dict(top_p=0), dict(max_tokens=-5)]:
    try:
        GenerationParams(**bad)
    except ValueError as e:
        print("invalid:", e)
```

:::tip Dataclass or Pydantic?
Dataclasses are built in and fast, but they do **not** check types. When data comes from the outside world (API responses, LLM JSON output, user input), use **Pydantic** — it validates and converts types automatically. You will learn it in the Advanced module.
:::

## Enums: a fixed set of named choices

:::def Enum
A type with a fixed set of named values, like `Role.USER` and `Role.ASSISTANT`. It prevents typos like `"asistant"` from silently slipping through.
:::

```python run level=intermediate
from enum import Enum

class Role(str, Enum):           # str mixin: members behave like strings
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"

print(Role.USER, Role.USER.value)
print(Role("assistant"))             # look up by value
print([r.value for r in Role])
print(Role.USER == "user")           # True thanks to the str mixin

try:
    Role("asistant")
except ValueError as e:
    print("ValueError:", e)
```

## Putting it together: a typed RAG record

```python run level=advanced
from dataclasses import dataclass, field, asdict
from enum import Enum
import json

class Source(str, Enum):
    PDF = "pdf"
    WEB = "web"
    NOTES = "notes"

@dataclass
class Chunk:
    doc_id: str
    index: int
    text: str
    source: Source
    metadata: dict[str, str] = field(default_factory=dict)

    @property
    def chunk_id(self) -> str:
        return f"{self.doc_id}#{self.index}"

def chunk_document(doc_id: str, text: str, source: Source, size: int = 40) -> list[Chunk]:
    return [
        Chunk(doc_id, i, text[start:start + size], source, {"chars": str(len(text[start:start + size]))})
        for i, start in enumerate(range(0, len(text), size))
    ]

chunks = chunk_document("guide", "Retrieval-Augmented Generation looks up relevant text and gives it to the model as context.", Source.PDF)
for c in chunks:
    print(c.chunk_id, repr(c.text))
print(json.dumps(asdict(chunks[0])))
```

## Check yourself

```quiz
? Does Python stop you from passing a str to a parameter hinted as `int`?
- Yes, immediately
+ No — hints are not enforced at runtime; a type checker like mypy can warn you
- Only in dataclasses
> Hints document intent. Use mypy/pyright, or Pydantic for runtime validation.

? What does @dataclass generate for you?
+ __init__, __repr__ and __eq__
- Only __init__
- Database tables
> Plus more with options like order=True and frozen=True.

? How do you give a dataclass field a default empty list?
- items: list = []
+ items: list = field(default_factory=list)
- items: list = list
> default_factory creates a fresh list for every object.

? What does `str | None` mean?
+ The value is either a string or None
- A string converted to None
- Bitwise OR of two types at runtime
> It is the modern (3.10+) way to write Optional[str].
```

:::exercise Experiment tracker
Create a frozen dataclass `RunResult` with `model: str`, `accuracy: float`, `latency_ms: float`, and an `order=True` setting so results sort by accuracy. Create 3 results, sort them best-first, and print each as a dict using `asdict`.
:::

:::solution
```python run
from dataclasses import dataclass, asdict

@dataclass(frozen=True, order=True)
class RunResult:
    accuracy: float          # first field = primary sort key
    model: str
    latency_ms: float

results = [
    RunResult(0.81, "small-model", 120.0),
    RunResult(0.93, "big-model", 850.0),
    RunResult(0.88, "medium-model", 300.0),
]
for r in sorted(results, reverse=True):
    print(asdict(r))
```
:::

:::keypoints
- Type hints (`x: int`, `-> str`, `list[str]`, `str | None`) document intent; checkers catch mistakes.
- `@dataclass` auto-writes `__init__`, `__repr__`, `__eq__` for data-holding classes.
- Use `field(default_factory=list)` for mutable defaults; `__post_init__` for validation.
- `frozen=True` makes records immutable; `asdict()` turns them into dicts for JSON/APIs.
- `Enum` gives a safe, fixed set of choices like message roles.
:::
