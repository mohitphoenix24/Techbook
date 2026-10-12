---
title: Functions
level: easy
time: 28
summary: Package code into reusable, named actions. Parameters, return values, defaults, *args and **kwargs, scope, lambdas and docstrings — the building blocks of every AI library.
---

A **function** is a named recipe. You write it once, then use it as many times as you like with different ingredients. Every AI library you will use — `numpy.mean()`, `client.messages.create()`, `model.fit()` — is a collection of functions.

:::def Function
A named, reusable block of code. It can take **inputs** (parameters), do some work, and give back an **output** (the return value).
:::

:::syntax
```python
def function_name(parameter1, parameter2):
    """Short description of what it does."""
    # body: the work
    return result
```
- `def` starts the definition, then the name, brackets, and a colon.
- The body is indented.
- `return` sends a value back to whoever called the function.
:::

```python run level=easy
def greet(name):
    return f"Hello, {name}!"

message = greet("Ada")       # "calling" the function
print(message)
print(greet("Alan"))
```

:::def Parameter vs argument
A **parameter** is the name in the definition (`name`). An **argument** is the actual value you pass in when calling (`"Ada"`).
:::

## return vs print

This confuses everyone at first. `print` **shows** a value on screen. `return` **gives** the value back so your code can keep using it.

```python run level=easy
def add_print(a, b):
    print(a + b)        # shows it, but gives back nothing (None)

def add_return(a, b):
    return a + b        # gives the value back

x = add_print(2, 3)
y = add_return(2, 3)
print("x is", x)        # None!
print("y is", y)
print("y * 10 =", y * 10)
```

:::tip
Functions that **compute** something should `return` it. Leave printing to the code that calls them. That makes functions reusable and testable.
:::

## Default values and keyword arguments

```python run level=easy
def ask(question, model="claude-opus-5-5", max_tokens=1024, temperature=1.0):
    return f"[{model} | max={max_tokens} | temp={temperature}] {question}"

print(ask("What is AI?"))                                 # uses all defaults
print(ask("What is AI?", max_tokens=200))                 # keyword argument
print(ask("Explain RAG", "claude-haiku-4-5", temperature=0.2))
```

:::def Keyword argument
An argument passed **by name**: `ask("hi", max_tokens=200)`. Order no longer matters and the call reads clearly. LLM SDKs use keyword arguments for almost everything.
:::

:::warn Never use a mutable default
`def f(history=[])` creates the list **once** and shares it between every call — a famous bug. Use `None` and create the list inside.
:::

```python run level=intermediate
def bad_add(msg, history=[]):
    history.append(msg)
    return history

print(bad_add("hi"))
print(bad_add("again"))      # surprise: the old message is still there!

def good_add(msg, history=None):
    if history is None:
        history = []
    history.append(msg)
    return history

print(good_add("hi"))
print(good_add("again"))
```

## Returning several values

```python run level=easy
def stats(values):
    mean = sum(values) / len(values)
    return min(values), max(values), mean     # actually returns a tuple

lo, hi, avg = stats([3, 9, 4, 8])
print(lo, hi, avg)
```

## Type hints and docstrings

Professional Python functions say **what types they expect** and **what they do**.

:::def Type hint
An annotation like `text: str` or `-> int` that documents the expected types. Python does not enforce it at runtime, but editors and tools like `mypy` use it to catch bugs.
:::

:::def Docstring
A string right under the `def` line that explains the function. Tools show it as help: try `help(count_words)`.
:::

```python run level=intermediate
def count_words(text: str, min_length: int = 1) -> int:
    """Count the words in `text` that have at least `min_length` characters.

    Args:
        text: The input text.
        min_length: Ignore words shorter than this.

    Returns:
        The number of matching words.
    """
    return sum(1 for w in text.split() if len(w) >= min_length)

print(count_words("I love deep learning"))
print(count_words("I love deep learning", min_length=4))
help(count_words)
```

## *args and **kwargs

Sometimes you do not know how many arguments will come in.

:::def *args and **kwargs
`*args` collects any number of **extra positional** arguments into a tuple. `**kwargs` collects any number of **extra keyword** arguments into a dict. The names are a convention; the `*` and `**` are what matter.
:::

```python run level=intermediate
def total(*numbers):
    print("got:", numbers)
    return sum(numbers)

print(total(1, 2, 3, 4))

def create_request(prompt, **options):
    request = {"prompt": prompt}
    request.update(options)        # any extra settings go straight in
    return request

print(create_request("Hi", temperature=0.2, max_tokens=50, stream=True))
```

The stars also work the other way — **unpacking** a list or dict into arguments:

```python run level=intermediate
def describe(model, max_tokens, temperature):
    return f"{model}: {max_tokens} tokens @ {temperature}"

settings = {"model": "claude-opus-5-5", "max_tokens": 512, "temperature": 0.5}
print(describe(**settings))             # dict -> keyword args

args = ["claude-haiku-4-5", 128, 0.0]
print(describe(*args))                  # list -> positional args
```

:::ai
You will see `**kwargs` all over AI code: wrapper functions take extra options and pass them through untouched — e.g. `def chat(prompt, **kwargs): return client.messages.create(..., **kwargs)`.
:::

### Keyword-only and positional-only parameters (advanced)

```python run level=advanced
# Everything after * must be passed by name — prevents mix-ups
def embed(texts, *, model="text-embed", normalize=True):
    return f"{len(texts)} texts with {model}, normalize={normalize}"

print(embed(["a", "b"], normalize=False))
# embed(["a"], "other-model")   # TypeError: must use model=...

# Everything before / must be positional
def power(base, exp, /):
    return base ** exp
print(power(2, 8))
```

## Scope: where variables live

:::def Scope
The region of code where a name can be seen. Variables created **inside** a function are **local** — they exist only while the function runs and cannot be seen outside.
:::

```python run level=intermediate
model = "global-model"          # global variable

def run():
    temperature = 0.5           # local variable
    print("inside:", model, temperature)   # can READ globals

run()
print("outside:", model)
# print(temperature)   # NameError: temperature only lived inside run()
```

:::tip
Prefer passing values **in** as parameters and getting results **out** with `return`. Functions that secretly change global variables are hard to debug.
:::

## Functions are values too

In Python, a function is an object like any other. You can store it in a variable, put it in a dict, or pass it to another function.

```python run level=intermediate
def shout(text): return text.upper() + "!"
def whisper(text): return text.lower() + "..."

styles = {"shout": shout, "whisper": whisper}     # a dict of functions
for name, fn in styles.items():
    print(name, "->", fn("Hello AI"))

def apply_twice(fn, value):
    return fn(fn(value))

print(apply_twice(lambda x: x * 2, 5))
```

:::def Lambda
A tiny **unnamed** function written in one line: `lambda x: x * 2`. Good for short "key" functions in `sorted()`, `max()` or `map()`. If it needs more than one expression, use `def`.
:::

```python run level=intermediate
docs = [{"id": 1, "score": 0.4}, {"id": 2, "score": 0.9}, {"id": 3, "score": 0.7}]
best = max(docs, key=lambda d: d["score"])
print(best)
print(sorted(docs, key=lambda d: d["score"], reverse=True))
```

### A tool registry — functions in action

This is exactly how AI agents know what "tools" they can call: a dictionary from **tool name** to **Python function**.

```python run level=advanced
def get_weather(city: str) -> str:
    """Return the (fake) weather for a city."""
    return f"It is 22°C and sunny in {city}."

def calculate(expression: str) -> str:
    """Safely evaluate simple arithmetic."""
    allowed = set("0123456789+-*/(). ")
    if not set(expression) <= allowed:
        return "error: unsupported characters"
    return str(eval(expression))

TOOLS = {"get_weather": get_weather, "calculate": calculate}

def run_tool(name: str, **arguments) -> str:
    if name not in TOOLS:
        return f"error: unknown tool {name!r}"
    return TOOLS[name](**arguments)

# Pretend the LLM asked for these:
print(run_tool("get_weather", city="Tokyo"))
print(run_tool("calculate", expression="(3 + 4) * 6"))
print(run_tool("send_email", to="x"))
for name, fn in TOOLS.items():
    print(f"- {name}: {fn.__doc__}")
```

## Recursion (a quick look)

:::def Recursion
When a function calls **itself** to solve a smaller version of the same problem. It needs a **base case** that stops the calls.
:::

```python run level=advanced
def count_tokens_in_tree(node):
    """Sum the 'tokens' of a nested document tree."""
    total = node.get("tokens", 0)
    for child in node.get("children", []):
        total += count_tokens_in_tree(child)    # recursive call
    return total

doc = {"tokens": 10, "children": [
    {"tokens": 50, "children": [{"tokens": 5}]},
    {"tokens": 20},
]}
print(count_tokens_in_tree(doc))
```

## Check yourself

```quiz
? A function has no `return` statement. What does calling it give back?
- 0
+ None
- An error
> Every function returns something; without `return` it is `None`.

? In `def f(a, b=2):`, what is `f(5)`'s value of b?
+ 2
- 5
- None
> b has a default of 2, used when no second argument is passed.

? What does `**kwargs` collect?
- Extra positional arguments into a list
+ Extra keyword arguments into a dict
- Only the first argument
> `*args` → tuple of positional; `**kwargs` → dict of keyword arguments.

? Why is `def f(items=[])` dangerous?
+ The same list is shared across all calls
- Lists are not allowed as defaults
- It makes the function slow
> The default is created once. Use `items=None` and create a new list inside.
```

:::exercise Prompt builder
Write a function `make_messages(user_text, system=None, history=None)` that returns a list of message dicts:
- If `history` is given, start with a copy of it.
- Always end with `{"role": "user", "content": user_text}`.
- Return a tuple `(system, messages)`.

Test it with and without history.
:::

:::solution
```python run
def make_messages(user_text, system=None, history=None):
    messages = list(history) if history else []
    messages.append({"role": "user", "content": user_text})
    return system, messages

sys_prompt, msgs = make_messages("Hi!", system="Be brief.")
print(sys_prompt, msgs)

past = [{"role": "user", "content": "Hi!"}, {"role": "assistant", "content": "Hello!"}]
_, msgs = make_messages("What is RAG?", history=past)
for m in msgs:
    print(m)
print("original history untouched:", len(past))
```
:::

:::keypoints
- `def name(params): ... return value` — functions take inputs and **return** outputs.
- Use defaults, keyword arguments and type hints for clear, safe functions.
- Never use a mutable default (`[]`, `{}`); use `None`.
- `*args` / `**kwargs` collect extra arguments; `*` / `**` also unpack them.
- Functions are values: store them in dicts (tool registries!) and pass them around.
:::
