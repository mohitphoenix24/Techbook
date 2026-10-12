---
title: Decorators
level: intermediate
time: 25
summary: Wrap functions to add behaviour — timing, logging, caching, retries, validation — without touching their code. Decorators are how @tool, @app.get and @torch.no_grad work.
---

You have already seen `@dataclass` and `@property`. AI frameworks are full of these `@` lines: `@app.post("/chat")` in FastAPI, `@beta_tool` in the Anthropic SDK, `@torch.no_grad()` in PyTorch, `@lru_cache` everywhere. They are **decorators**, and they are simpler than they look.

:::def Decorator
A function that **takes a function and returns a new function** (usually a wrapper that adds some behaviour before and/or after calling the original). Writing `@my_decorator` above a `def` applies it.
:::

:::syntax
```python
@decorator
def func(): ...

# is exactly the same as:
def func(): ...
func = decorator(func)
```
:::

## Step 1: functions can wrap functions

```python run level=easy
def shout(fn):
    def wrapper(text):
        result = fn(text)          # call the original
        return result.upper() + "!"
    return wrapper                 # return the NEW function

def greet(name):
    return f"hello {name}"

loud_greet = shout(greet)
print(greet("ada"))
print(loud_greet("ada"))
```

## Step 2: the @ shortcut

```python run level=easy
def shout(fn):
    def wrapper(text):
        return fn(text).upper() + "!"
    return wrapper

@shout                      # same as: greet = shout(greet)
def greet(name):
    return f"hello {name}"

print(greet("ada"))
```

## A real decorator: timing

To work with **any** function, the wrapper should accept any arguments with `*args, **kwargs` and pass them through. Use `functools.wraps` to keep the original function's name and docstring.

```python run level=intermediate
import time
import functools

def timed(fn):
    @functools.wraps(fn)                  # keep fn's name, docstring, etc.
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = fn(*args, **kwargs)
        ms = (time.perf_counter() - start) * 1000
        print(f"[timed] {fn.__name__} took {ms:.2f} ms")
        return result
    return wrapper

@timed
def tokenize(text: str) -> list[str]:
    """Split text into lowercase words."""
    return text.lower().split()

@timed
def slow_sum(n):
    return sum(i * i for i in range(n))

print(tokenize("Decorators Wrap Functions"))
print(slow_sum(200_000))
print(tokenize.__name__, "-", tokenize.__doc__)   # thanks to functools.wraps
```

:::warn Forgetting functools.wraps
Without `@functools.wraps(fn)`, every decorated function would be named `wrapper` — which breaks debugging, logging and frameworks that read function names (like tool-calling libraries that turn function names into tool names!).
:::

## Logging calls

```python run level=intermediate
import functools

def log_calls(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        arg_text = ", ".join([repr(a) for a in args] + [f"{k}={v!r}" for k, v in kwargs.items()])
        print(f"→ {fn.__name__}({arg_text})")
        result = fn(*args, **kwargs)
        print(f"← {fn.__name__} returned {result!r}")
        return result
    return wrapper

@log_calls
def search(query, top_k=3):
    return [f"doc-{i}" for i in range(top_k)]

search("what is RAG", top_k=2)
```

## Decorators with arguments

Sometimes you want to configure the decorator: `@retry(times=3)`. That needs **one more layer**: a function that *returns* a decorator.

```python run level=advanced
import functools
import random

def retry(times=3, exceptions=(Exception,)):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as e:
                    print(f"  attempt {attempt}/{times} failed: {e}")
                    if attempt == times:
                        raise
        return wrapper
    return decorator

random.seed(1)

@retry(times=5, exceptions=(ConnectionError,))
def call_api(prompt):
    if random.random() < 0.7:
        raise ConnectionError("server overloaded")
    return f"answer for {prompt!r}"

print(call_api("hello"))
```

:::analogy
- `@timed` → "wrap this function in a timer."
- `@retry(times=5)` → "build me a retry-wrapper set to 5 tries, **then** wrap this function in it."

The extra brackets mean "configure first, then decorate".
:::

## Caching: never pay twice for the same answer

:::def Memoization (caching)
Saving the result of a function call so that calling it again with the same arguments returns the saved result instantly instead of recomputing.
:::

```python run level=intermediate
import functools

calls = 0

@functools.lru_cache(maxsize=1000)
def embed(text: str) -> tuple[float, ...]:
    """Pretend this is an expensive embedding API call."""
    global calls
    calls += 1
    return tuple(round(ord(c) / 128, 3) for c in text[:4])

for t in ["hello", "world", "hello", "hello", "world"]:
    embed(t)

print("real calls:", calls)          # only 2!
print(embed.cache_info())
```

:::tip
`lru_cache` needs **hashable** arguments (str, int, tuple — not list or dict). `functools.cache` is the same with no size limit. For LLM calls you often build your own cache keyed by `(model, prompt)` and saved to disk, so it survives restarts.
:::

```python run level=advanced
import functools
import hashlib
import json

def disk_cache(fn):
    store = {}                         # in real code: a JSON file or SQLite on disk

    @functools.wraps(fn)
    def wrapper(**kwargs):
        key = hashlib.sha256(json.dumps(kwargs, sort_keys=True).encode()).hexdigest()[:16]
        if key in store:
            print(f"  cache HIT  {key}")
            return store[key]
        print(f"  cache MISS {key}")
        store[key] = fn(**kwargs)
        return store[key]
    return wrapper

@disk_cache
def ask_llm(model: str, prompt: str, temperature: float = 0.0) -> str:
    return f"({model}) answer to: {prompt}"

ask_llm(model="claude-opus-5-5", prompt="What is AI?")
ask_llm(prompt="What is AI?", model="claude-opus-5-5")     # same request, different order -> HIT
ask_llm(model="claude-opus-5-5", prompt="What is ML?")
```

## Registering functions: how @tool works

Many decorators do not wrap anything — they **register** the function somewhere and return it unchanged. This is how tool-calling frameworks collect your tools and build their JSON descriptions from type hints and docstrings.

```python run level=advanced
import inspect
import json

TOOLS = {}

def tool(fn):
    """Register fn as a tool and build a JSON-schema-like description from it."""
    type_names = {str: "string", int: "integer", float: "number", bool: "boolean"}
    sig = inspect.signature(fn)
    TOOLS[fn.__name__] = {
        "function": fn,
        "schema": {
            "name": fn.__name__,
            "description": inspect.getdoc(fn),
            "input_schema": {
                "type": "object",
                "properties": {name: {"type": type_names.get(p.annotation, "string")} for name, p in sig.parameters.items()},
                "required": [name for name, p in sig.parameters.items() if p.default is inspect.Parameter.empty],
            },
        },
    }
    return fn                                  # unchanged!

@tool
def get_weather(city: str, unit: str = "celsius") -> str:
    """Get the current weather for a city."""
    return f"22 degrees {unit} in {city}"

@tool
def add(a: int, b: int) -> int:
    """Add two integers."""
    return a + b

print(json.dumps([t["schema"] for t in TOOLS.values()], indent=2))
print(TOOLS["add"]["function"](2, 3))
```

That JSON is very close to the real tool format the Claude API expects. The Anthropic SDK's `@beta_tool` decorator does this introspection for you.

## Class-based decorators and stacking

Decorators can be stacked — they apply **bottom-up** (the one nearest the function wraps first):

```python run level=advanced
import functools
import time

class CountCalls:
    """A decorator written as a class: it keeps state between calls."""
    def __init__(self, fn):
        functools.update_wrapper(self, fn)
        self.fn = fn
        self.count = 0

    def __call__(self, *args, **kwargs):
        self.count += 1
        return self.fn(*args, **kwargs)

def timed(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        t = time.perf_counter()
        out = fn(*args, **kwargs)
        print(f"{fn.__name__}: {(time.perf_counter() - t) * 1e6:.0f} µs")
        return out
    return wrapper

@timed          # applied second (outer)
@CountCalls     # applied first (inner)
def classify(text):
    return "positive" if "good" in text else "negative"

classify("good stuff")
classify("bad stuff")
print("calls:", classify.__wrapped__.count)
```

:::ai Decorators you will meet
| Decorator | Library | What it does |
|---|---|---|
| `@app.get("/path")`, `@app.post(...)` | FastAPI | registers a web endpoint |
| `@beta_tool` | anthropic | turns a function into a Claude tool |
| `@torch.no_grad()` | PyTorch | turns off gradient tracking for inference |
| `@lru_cache` / `@cache` | functools | caches results |
| `@retry(...)` | tenacity | retries with backoff |
| `@dataclass`, `@property` | standard library | generates class code |
:::

## Check yourself

```quiz
? What is `@deco` above `def f()` equivalent to?
+ f = deco(f)
- deco = f(deco)
- f()(deco)
> A decorator is just a function that receives f and returns a replacement.

? Why do decorators use `*args, **kwargs` in the wrapper?
+ So they work with functions of any signature
- To make them faster
- It is required syntax
> The wrapper passes whatever it receives straight through to the original.

? Why use `@functools.wraps(fn)`?
+ To keep the original function's name and docstring on the wrapper
- To cache the result
- To make the decorator take arguments
> Without it, every decorated function would look like "wrapper".

? `@retry(times=3)` needs how many nested functions?
- 1
- 2
+ 3 — retry(...) returns a decorator, which returns a wrapper
> Configuration layer → decorator layer → wrapper layer.
```

:::exercise Validate inputs
Write a decorator `non_empty` that raises `ValueError("empty prompt")` if the **first argument** of the decorated function is an empty or whitespace-only string. Use `functools.wraps`. Apply it to `def ask(prompt): return f"answering: {prompt}"` and test both cases.
:::

:::solution
```python run
import functools

def non_empty(fn):
    @functools.wraps(fn)
    def wrapper(prompt, *args, **kwargs):
        if not str(prompt).strip():
            raise ValueError("empty prompt")
        return fn(prompt, *args, **kwargs)
    return wrapper

@non_empty
def ask(prompt):
    return f"answering: {prompt}"

print(ask("What is a decorator?"))
try:
    ask("   ")
except ValueError as e:
    print("ValueError:", e)
```
:::

:::keypoints
- A decorator takes a function and returns a (usually wrapped) function: `@d` means `f = d(f)`.
- Write wrappers with `*args, **kwargs` and `@functools.wraps(fn)`.
- Decorators with arguments add one more layer: `@retry(times=3)`.
- Common uses: timing, logging, caching (`lru_cache`), retries, validation, and **registering** tools/routes.
- Stacked decorators apply bottom-up.
:::
