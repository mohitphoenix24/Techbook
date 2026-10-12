---
title: Errors & Exceptions
level: easy
time: 22
summary: Read error messages calmly, handle problems with try / except, raise your own errors, and build retry logic — essential for code that calls flaky network APIs.
---

APIs time out. Models return broken JSON. Files go missing. Users type nonsense. Good AI code **expects** things to go wrong and handles it gracefully. Python does this with **exceptions**.

:::def Exception
An error that happens while the program runs. Python "raises" an exception object (like `ValueError`) and, unless your code "catches" it, the program stops and prints a **traceback**.
:::

:::def Traceback
The error report Python prints. Read it **from the bottom up**: the last line says the error type and message; the lines above show which code was running, most recent call last.
:::

## Reading a traceback

Run this and look at the output — the last line is what matters most.

```python run level=easy expect-error
def average(values):
    return sum(values) / len(values)

scores = []
print(average(scores))
```

The last line, `ZeroDivisionError: division by zero`, tells you exactly what happened: the list was empty, so `len(values)` was 0.

### Errors you will meet most often

| Error | Usually means | Example |
|---|---|---|
| `SyntaxError` | Python cannot read the code | missing `:` or bracket |
| `IndentationError` | wrong spaces at line start | mixed indent levels |
| `NameError` | unknown variable name | typo: `promt` instead of `prompt` |
| `TypeError` | wrong type for the operation | `"5" + 5` |
| `ValueError` | right type, bad value | `int("abc")` |
| `KeyError` | missing dict key | `d["missing"]` |
| `IndexError` | list position out of range | `[1, 2][5]` |
| `AttributeError` | object has no such method | `"text".push("x")` |
| `FileNotFoundError` | file path does not exist | `open("nope.txt")` |
| `ZeroDivisionError` | divided by zero | `1 / 0` |

## try / except: catching errors

:::syntax
```python
try:
    risky_code()
except SomeError as e:
    handle_it(e)
else:
    runs_only_if_no_error()
finally:
    always_runs()
```
:::

```python run level=easy
user_input = "twelve"

try:
    n = int(user_input)
    print("You entered", n)
except ValueError:
    print(f"'{user_input}' is not a whole number — using 10 instead.")
    n = 10

print("Continuing with n =", n)
```

The program did **not** crash. We caught the `ValueError` and recovered.

### Catching specific errors

```python run level=intermediate
def safe_divide(a, b):
    try:
        result = a / b
    except ZeroDivisionError:
        print("  can't divide by zero")
        return None
    except TypeError as e:
        print("  bad types:", e)
        return None
    else:
        print("  success")          # only when no exception happened
        return result
    finally:
        print("  (finally always runs)")

print(safe_divide(10, 2))
print(safe_divide(10, 0))
print(safe_divide(10, "x"))
```

:::warn Do not catch everything blindly
A bare `except:` or `except Exception:` that just does `pass` hides real bugs (even typos!). Catch the **specific** errors you expect and know how to handle. If you must catch broadly, at least **log** the error.
:::

## Handling messy LLM output

LLMs are asked to return JSON, but sometimes they wrap it in extra text or make mistakes. Robust code handles both:

```python run level=intermediate
import json

def parse_llm_json(text: str):
    """Try to read JSON from a model reply; fall back gracefully."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # common case: JSON surrounded by chatter — grab the {...} part
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
        return {"error": "could not parse", "raw": text}

print(parse_llm_json('{"sentiment": "positive", "score": 0.93}'))
print(parse_llm_json('Sure! Here it is: {"sentiment": "negative"} Hope that helps.'))
print(parse_llm_json("I think it's positive."))
```

## Raising your own errors

:::def raise
The keyword that **creates** an exception on purpose: `raise ValueError("message")`. Use it when your function receives input it cannot work with — fail early with a clear message.
:::

```python run level=intermediate
def set_temperature(t: float) -> float:
    if not isinstance(t, (int, float)):
        raise TypeError(f"temperature must be a number, got {type(t).__name__}")
    if not 0.0 <= t <= 1.0:
        raise ValueError(f"temperature must be between 0 and 1, got {t}")
    return float(t)

for value in [0.7, 1.5, "hot"]:
    try:
        print("OK:", set_temperature(value))
    except (TypeError, ValueError) as e:
        print(f"{type(e).__name__}: {e}")
```

## Custom exceptions

For bigger programs, define your own error types. Then callers can catch exactly what they care about.

```python run level=advanced
class LLMError(Exception):
    """Base class for our LLM errors."""

class RateLimitError(LLMError):
    def __init__(self, retry_after: float):
        super().__init__(f"rate limited, retry after {retry_after}s")
        self.retry_after = retry_after

class ContextTooLongError(LLMError):
    pass

def call_model(prompt: str):
    if len(prompt) > 50:
        raise ContextTooLongError(f"prompt has {len(prompt)} chars, limit is 50")
    if "busy" in prompt:
        raise RateLimitError(retry_after=2.5)
    return f"answer to: {prompt}"

for p in ["hello", "are you busy?", "x" * 80]:
    try:
        print(call_model(p))
    except RateLimitError as e:
        print("wait", e.retry_after, "seconds then retry")
    except LLMError as e:              # catches any other LLMError subclass
        print("LLM problem:", e)
```

Real SDKs do exactly this: the Anthropic Python SDK raises `anthropic.RateLimitError`, `anthropic.APIConnectionError`, `anthropic.BadRequestError` and so on — all subclasses of one base error.

## Retry with exponential backoff

:::def Exponential backoff
A retry strategy where you wait longer after each failure: 1s, 2s, 4s, 8s… It avoids hammering a busy server. Adding a little randomness ("jitter") stops many clients retrying at the same moment.
:::

```python run level=advanced
import random

random.seed(3)

def flaky_api():
    """Fails 60% of the time, like a busy server."""
    if random.random() < 0.6:
        raise ConnectionError("server busy")
    return {"text": "Here is your answer."}

def with_retries(fn, max_attempts=5, base_delay=1.0):
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except ConnectionError as e:
            if attempt == max_attempts:
                raise                      # give up: re-raise the last error
            delay = base_delay * 2 ** (attempt - 1) + random.uniform(0, 0.5)
            print(f"attempt {attempt} failed ({e}); waiting {delay:.2f}s")
            # time.sleep(delay)   <- in real code you would actually wait

print(with_retries(flaky_api))
```

:::tip
The official LLM SDKs already retry common failures for you (the Anthropic SDK retries twice by default — set `max_retries` to change it). Write your own retries for your **own** flaky steps, like parsing or tool calls.
:::

## assert: checking your assumptions

:::def assert
`assert condition, "message"` stops the program with an `AssertionError` if the condition is false. Use it to check things that **should** always be true while developing — e.g. that two arrays have the same length.
:::

```python run level=intermediate expect-error
texts = ["a", "b", "c"]
labels = [1, 0]

assert len(texts) == len(labels), f"{len(texts)} texts but {len(labels)} labels!"
print("shapes match")
```

## Check yourself

```quiz
? Where should you look first in a traceback?
- The first line
+ The last line (error type and message)
- The middle
> The last line names the error; the lines above show where it came from.

? `int("3.5")` raises which error?
- TypeError
+ ValueError
- SyntaxError
> The argument is the right type (a string) but its value cannot become an int.

? When does the `else` block of a try statement run?
+ Only when no exception was raised in `try`
- Only when an exception was caught
- Always
> `finally` always runs; `else` runs only on success.

? Why is `except: pass` a bad habit?
+ It silently hides every error, including real bugs
- It is a syntax error
- It makes code slower
> Catch the specific errors you expect, and log anything unexpected.
```

:::exercise Safe config loader
Write `load_setting(config, key, cast)` that:
- returns `cast(config[key])` normally,
- returns `None` and prints `missing: <key>` if the key is absent,
- returns `None` and prints `bad value for <key>: <value>` if casting fails.

Test with `config = {"max_tokens": "512", "temperature": "warm"}`.
:::

:::solution
```python run
def load_setting(config, key, cast):
    try:
        return cast(config[key])
    except KeyError:
        print("missing:", key)
    except (ValueError, TypeError):
        print(f"bad value for {key}: {config[key]!r}")
    return None

config = {"max_tokens": "512", "temperature": "warm"}
print(load_setting(config, "max_tokens", int))
print(load_setting(config, "temperature", float))
print(load_setting(config, "top_p", float))
```
:::

:::keypoints
- Read tracebacks **bottom-up**: the last line is the error type and message.
- `try / except SpecificError` lets you recover; `else` runs on success; `finally` always runs.
- `raise ValueError("clear message")` to reject bad input early.
- Define custom exception classes for your own error families.
- Retry flaky calls with **exponential backoff** — and never hide errors with a bare `except: pass`.
:::
