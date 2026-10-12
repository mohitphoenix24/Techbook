---
title: Advanced Typing
level: advanced
time: 25
summary: Protocols, generics, TypedDict, overloads and more — the typing tools that let large AI codebases swap models, retrievers and vector stores safely.
---

As projects grow, you want to swap one LLM provider for another, one vector database for another, one embedding model for another — without breaking anything. Advanced typing lets you describe **what a component must be able to do**, and lets tools check that every implementation fits.

## TypedDict — typing the dicts you already use

:::def TypedDict
A way to describe the **exact keys and value types** of a dictionary. At runtime it is a normal dict; type checkers verify you use the right keys.
:::

```python run level=intermediate skiplocal
from typing import TypedDict, Literal, NotRequired

class Message(TypedDict):
    role: Literal["user", "assistant"]
    content: str

class Request(TypedDict):
    model: str
    max_tokens: int
    messages: list[Message]
    system: NotRequired[str]           # this key may be missing

req: Request = {
    "model": "claude-opus-5-5",
    "max_tokens": 512,
    "messages": [{"role": "user", "content": "Hello"}],
}
print(req["messages"][0]["content"])
print(type(req))                       # just a dict at runtime
print(Request.__required_keys__, Request.__optional_keys__)
```

:::tip TypedDict vs dataclass vs Pydantic
| | TypedDict | dataclass | Pydantic |
|---|---|---|---|
| runtime type | `dict` | your class | your class |
| validates at runtime | ✗ | ✗ | ✓ |
| best for | JSON-shaped dicts, API payloads | internal records | data from outside |
:::

## Protocols — "anything that can do X"

:::def Protocol
A description of the **methods** an object must have, without forcing it to inherit from anything. If a class has those methods, it fits the protocol. This is called **structural typing** (or "duck typing", checked by tools).
:::

:::analogy
"If it walks like a duck and quacks like a duck, it's a duck." A `Protocol` writes down what "walking" and "quacking" mean, so your editor can check every duck.
:::

```python run level=advanced
from typing import Protocol, runtime_checkable

@runtime_checkable
class LLM(Protocol):
    def generate(self, prompt: str) -> str: ...

class FakeClaude:                      # does NOT inherit from LLM
    def generate(self, prompt: str) -> str:
        return f"Claude-ish answer to: {prompt}"

class EchoModel:
    def generate(self, prompt: str) -> str:
        return prompt

class Calculator:
    def compute(self, expr: str) -> float:
        return 0.0

def answer_all(model: LLM, questions: list[str]) -> list[str]:
    return [model.generate(q) for q in questions]

for m in [FakeClaude(), EchoModel()]:
    print(answer_all(m, ["What is RAG?"]))

print(isinstance(FakeClaude(), LLM), isinstance(Calculator(), LLM))
```

Your RAG pipeline can accept **any** retriever with a `search(query, k)` method — a FAISS one, a Chroma one, or a fake one in tests.

## Generics — containers that remember their contents

:::def Generic
A class or function that works with **any type**, while keeping track of **which** type. `list[int]` is a generic list of ints. You can write your own: `Cache[str]`, `Result[Ticket]`.
:::

```python run level=advanced
from typing import Generic, TypeVar

T = TypeVar("T")

class Result(Generic[T]):
    """Either a value or an error — a common pattern for LLM calls."""
    def __init__(self, value: T | None = None, error: str | None = None):
        self.value, self.error = value, error

    @property
    def ok(self) -> bool:
        return self.error is None

    def unwrap(self) -> T:
        if self.error is not None:
            raise RuntimeError(self.error)
        return self.value

def parse_int(text: str) -> Result[int]:
    try:
        return Result(int(text))
    except ValueError:
        return Result(error=f"not an int: {text!r}")

for t in ["42", "forty-two"]:
    r = parse_int(t)
    print(t, "->", r.unwrap() if r.ok else r.error)

def first(items: list[T]) -> T:        # a generic function: returns the same type it gets
    return items[0]

print(first(["a", "b"]), first([1.5, 2.5]))
```

### The new generics syntax (Python 3.12+)

Python 3.12 added a shorter way to write generics — no `TypeVar` needed. You will see it in newer codebases:

```python run level=advanced skiplocal
class Box[T]:
    def __init__(self, item: T):
        self.item = item

    def get(self) -> T:
        return self.item

def last[T](items: list[T]) -> T:
    return items[-1]

type Vector = list[float]          # a type alias statement

v: Vector = [0.1, 0.2]
print(Box("hello").get(), last([1, 2, 3]), v)
```

## Callable, overloads and Self

```python run level=advanced skiplocal
from typing import Callable, Self, overload

Scorer = Callable[[str, str], float]       # a function taking (query, doc) -> score

def word_overlap(query: str, doc: str) -> float:
    q, d = set(query.lower().split()), set(doc.lower().split())
    return len(q & d) / max(len(q), 1)

def rank(query: str, docs: list[str], scorer: Scorer) -> list[tuple[float, str]]:
    return sorted(((scorer(query, d), d) for d in docs), reverse=True)

print(rank("python for ai", ["Java basics", "Python for AI engineers", "AI history"], word_overlap))

class QueryBuilder:
    def __init__(self):
        self.parts: list[str] = []

    def where(self, cond: str) -> Self:    # Self = "an instance of whatever class this is"
        self.parts.append(cond)
        return self

print(QueryBuilder().where("lang = 'en'").where("year > 2020").parts)

@overload
def embed(text: str) -> list[float]: ...
@overload
def embed(text: list[str]) -> list[list[float]]: ...
def embed(text):                            # one implementation, two precise signatures
    if isinstance(text, str):
        return [float(len(text))]
    return [[float(len(t))] for t in text]

print(embed("hi"), embed(["hi", "hello"]))
```

:::def @overload
Lets you declare several **signatures** for one function so type checkers know the exact return type for each kind of input — e.g. one string in → one vector out; a list in → a list of vectors out.
:::

## Final, ClassVar, Annotated

```python run level=advanced
from typing import Final, ClassVar, Annotated
from pydantic import BaseModel, Field

MAX_CONTEXT: Final = 1_000_000          # "do not reassign this" (checked by tools)

class Model:
    registry: ClassVar[dict[str, "Model"]] = {}     # shared by the class, not per instance

    def __init__(self, name: str):
        self.name = name
        Model.registry[name] = self

Model("claude-opus-5-5"); Model("claude-haiku-4-5")
print(list(Model.registry))

# Annotated attaches extra metadata to a type — Pydantic and FastAPI read it
Temperature = Annotated[float, Field(ge=0, le=1, description="Sampling temperature")]

class Params(BaseModel):
    temperature: Temperature = 1.0
    top_p: Temperature = 1.0

print(Params(temperature=0.2))
print(Params.model_json_schema()["properties"]["temperature"])
```

## Checking it all: mypy / pyright

Type hints pay off when a **checker** reads them. A typical setup:

```bash
pip install mypy            # or: uv add --dev mypy
mypy src/                   # report type errors
# VS Code's Pylance (pyright) shows them live as you type
```

```python
def total_tokens(usages: list[dict[str, int]]) -> int:
    return sum(u["input"] + u["output"] for u in usages)

total_tokens([{"input": 10, "output": "5"}])
# mypy: error: Dict entry 1 has incompatible type "str": "str"; expected "str": "int"
```

:::ai
Frameworks like LangChain, LlamaIndex, Pydantic AI and the Anthropic SDK are fully typed. Generic types like `Result[Ticket]`, protocols like "anything with `.invoke()`", and `TypedDict` message shapes are how your editor can autocomplete `response.content[0].text` and warn you before you ship a bug.
:::

## Check yourself

```quiz
? What is a TypedDict at runtime?
+ A normal dict
- A special class instance
- A Pydantic model
> The typing only matters to checkers; at runtime it is a dict.

? A class has a `generate(self, prompt: str) -> str` method but does not inherit from the `LLM` Protocol. Does it fit `LLM`?
+ Yes — protocols are structural: having the methods is enough
- No — it must inherit from LLM
- Only with @runtime_checkable
> That is the whole point of Protocols. @runtime_checkable only enables isinstance checks.

? What does `TypeVar("T")` let a function express?
+ "the output type is the same as the input type", e.g. first(list[T]) -> T
- That T is always a string
- That the function is asynchronous
> TypeVars connect types across parameters and return values.
```

:::exercise A typed retriever protocol
Define a `Retriever` Protocol with `search(self, query: str, k: int) -> list[str]`. Write two classes that satisfy it: `KeywordRetriever` (returns docs containing any query word) and `FirstKRetriever` (just returns the first k docs). Write `build_context(r: Retriever, query: str) -> str` that joins the results with newlines, and test it with both.
:::

:::solution
```python run
from typing import Protocol

class Retriever(Protocol):
    def search(self, query: str, k: int) -> list[str]: ...

DOCS = ["Python is used for AI", "RAG retrieves documents", "Agents use tools", "Python has great libraries"]

class KeywordRetriever:
    def search(self, query: str, k: int) -> list[str]:
        words = set(query.lower().split())
        return [d for d in DOCS if words & set(d.lower().split())][:k]

class FirstKRetriever:
    def search(self, query: str, k: int) -> list[str]:
        return DOCS[:k]

def build_context(r: Retriever, query: str) -> str:
    return "\n".join(r.search(query, k=2))

for r in [KeywordRetriever(), FirstKRetriever()]:
    print(type(r).__name__, "->", build_context(r, "python libraries"), sep="\n", end="\n\n")
```
:::

:::keypoints
- `TypedDict` types JSON-shaped dicts; `Literal` restricts exact values; `NotRequired` marks optional keys.
- `Protocol` describes required methods — any class with them fits (great for swappable components).
- Generics (`TypeVar`, `Generic[T]`, or 3.12's `class Box[T]`) keep track of contained types.
- `Callable`, `@overload`, `Self`, `Final`, `ClassVar`, `Annotated` add precision.
- Run **mypy** or **pyright** to actually catch the errors.
:::
