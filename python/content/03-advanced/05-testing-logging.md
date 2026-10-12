---
title: Testing, Logging & Clean Code
level: advanced
time: 28
summary: Write tests with pytest, fake the LLM so tests are fast and free, log properly instead of printing, and keep code clean with formatters and linters.
---

AI apps break in sneaky ways: a prompt change makes JSON parsing fail, a refactor breaks chunking, a provider changes a field name. **Tests** catch these before your users do, and **logs** tell you what happened when something goes wrong in production.

## Testing with assert

:::def Unit test
A small piece of code that checks one function behaves correctly: given this input, I expect that output. If the expectation fails, the test fails.
:::

```python run level=easy
def chunk_text(text: str, size: int) -> list[str]:
    return [text[i:i + size] for i in range(0, len(text), size)]

# tests
assert chunk_text("abcdef", 2) == ["ab", "cd", "ef"]
assert chunk_text("abcde", 2) == ["ab", "cd", "e"]
assert chunk_text("", 3) == []
assert all(len(c) <= 4 for c in chunk_text("x" * 50, 4))
print("all tests passed ✓")
```

## pytest — the standard test runner

:::def pytest
The most popular Python testing tool. Put functions named `test_...` in files named `test_*.py`, use plain `assert`, and run `pytest` in the terminal. It finds and runs every test and shows a clear report.
:::

```python title="tests/test_chunking.py"
import pytest
from rag_app.chunking import chunk_text

def test_splits_evenly():
    assert chunk_text("abcdef", 2) == ["ab", "cd", "ef"]

def test_keeps_remainder():
    assert chunk_text("abcde", 2)[-1] == "e"

@pytest.mark.parametrize("size", [1, 3, 7, 100])
def test_no_chunk_too_big(size):
    assert all(len(c) <= size for c in chunk_text("x" * 50, size))

def test_rejects_bad_size():
    with pytest.raises(ValueError):
        chunk_text("abc", 0)
```

```bash
pip install pytest      # or: uv add --dev pytest
pytest -q               # run all tests quietly
pytest -k chunk -v      # only tests with "chunk" in the name, verbose
```

Here is a tiny pytest-style runner so you can see the idea working in the browser:

```python run level=intermediate
import traceback

def chunk_text(text: str, size: int) -> list[str]:
    if size <= 0:
        raise ValueError("size must be positive")
    return [text[i:i + size] for i in range(0, len(text), size)]

def test_splits_evenly():
    assert chunk_text("abcdef", 2) == ["ab", "cd", "ef"]

def test_keeps_remainder():
    assert chunk_text("abcde", 2)[-1] == "e"

def test_rejects_bad_size():
    try:
        chunk_text("abc", 0)
    except ValueError:
        return
    raise AssertionError("expected ValueError")

def test_deliberately_wrong():
    assert chunk_text("abcd", 2) == ["abcd"], "this test is wrong on purpose"

passed = failed = 0
for name, fn in list(globals().items()):
    if name.startswith("test_") and callable(fn):
        try:
            fn()
            passed += 1
            print(f"PASS {name}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {name}: {e}")
print(f"\n{passed} passed, {failed} failed")
```

## Testing LLM code without calling the LLM

Real API calls in unit tests are **slow, cost money and give different answers each time**. Instead, design your code so the model can be **swapped for a fake**.

:::def Mock / fake
A stand-in object that behaves like the real thing (same methods) but returns pre-programmed answers. It makes tests fast, free and deterministic.
:::

:::def Dependency injection
Passing the things a function needs (like an LLM client) **in as parameters** instead of creating them inside. This makes it trivial to pass a fake during tests.
:::

```python run level=advanced
import json
from dataclasses import dataclass

# ----- production code ------------------------------------------------------
@dataclass
class Classification:
    label: str
    confidence: float

class TicketClassifier:
    def __init__(self, llm):                 # the LLM is injected
        self.llm = llm

    def classify(self, text: str) -> Classification:
        prompt = f"Classify this support ticket as billing/bug/other. Reply as JSON.\n\n{text}"
        raw = self.llm(prompt)
        try:
            data = json.loads(raw)
            return Classification(data["label"], float(data["confidence"]))
        except (json.JSONDecodeError, KeyError, ValueError):
            return Classification("other", 0.0)       # safe fallback

# ----- tests ------------------------------------------------------------------
class FakeLLM:
    def __init__(self, reply):
        self.reply = reply
        self.prompts = []                          # record what we were asked

    def __call__(self, prompt):
        self.prompts.append(prompt)
        return self.reply

def test_parses_good_json():
    fake = FakeLLM('{"label": "billing", "confidence": 0.92}')
    result = TicketClassifier(fake).classify("I was charged twice")
    assert result == Classification("billing", 0.92)
    assert "charged twice" in fake.prompts[0]           # the ticket reached the prompt

def test_falls_back_on_garbage():
    result = TicketClassifier(FakeLLM("Sorry, I can't help with that.")).classify("??")
    assert result.label == "other" and result.confidence == 0.0

for t in [test_parses_good_json, test_falls_back_on_garbage]:
    t()
    print("PASS", t.__name__)
```

`unittest.mock` in the standard library can also create fakes automatically:

```python run level=advanced
from unittest.mock import MagicMock

client = MagicMock()
client.messages.create.return_value.content = [MagicMock(type="text", text="Paris")]

def capital_of(country, client):
    resp = client.messages.create(model="claude-opus-5-5", max_tokens=50,
                                  messages=[{"role": "user", "content": f"Capital of {country}?"}])
    return next(b.text for b in resp.content if b.type == "text")

print(capital_of("France", client))
client.messages.create.assert_called_once()
print("called with model:", client.messages.create.call_args.kwargs["model"])
```

:::tip Testing the LLM itself = evaluation
Unit tests check **your code**. Checking whether the **model's answers** are good is called **evaluation** (evals) — you will learn it in the Gen-AI module. Do both.
:::

## Logging instead of print

:::def Logging
Recording what your program does — with timestamps, severity levels and the module name — to the console or files. Unlike `print`, logs can be filtered by level, routed to files or monitoring tools, and switched off without editing code.
:::

| Level | Use for |
|---|---|
| `DEBUG` | detailed internals (full prompts, raw responses) |
| `INFO` | normal events ("indexed 120 documents") |
| `WARNING` | something odd but handled ("retrying after rate limit") |
| `ERROR` | an operation failed |
| `CRITICAL` | the app cannot continue |

```python run level=intermediate
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
    force=True,
)
log = logging.getLogger("rag_app.ingest")

log.debug("this is hidden because the level is INFO")
log.info("indexed %d documents", 120)                 # use %-style args, not f-strings
log.warning("rate limited, retrying in %.1fs", 2.0)
try:
    1 / 0
except ZeroDivisionError:
    log.exception("chunking failed")                   # logs the traceback too
```

:::tip Why `log.info("x %d", n)` instead of an f-string?
With `%`-style arguments, the message is only built if that level is actually enabled — cheaper when you log a lot at DEBUG level.
:::

### Structured (JSON) logs for LLM calls

In production, log each LLM call as one JSON line — then you can search, chart and alert on latency, tokens and errors.

```python run level=advanced
import json
import logging
import sys
import time

class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {"ts": round(record.created, 3), "level": record.levelname, "msg": record.getMessage()}
        payload.update(getattr(record, "extra_fields", {}))
        return json.dumps(payload)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
log = logging.getLogger("llm")
log.handlers = [handler]
log.setLevel(logging.INFO)
log.propagate = False

def logged_call(prompt):
    start = time.perf_counter()
    answer = prompt.upper()                       # fake model
    log.info("llm_call", extra={"extra_fields": {
        "model": "claude-opus-5-5",
        "latency_ms": round((time.perf_counter() - start) * 1000, 2),
        "input_chars": len(prompt),
        "output_chars": len(answer),
    }})
    return answer

logged_call("hello there")
logged_call("summarize the quarterly report")
```

:::warn Logging secrets and personal data
Never log API keys. Be careful logging full prompts and responses — they may contain users' personal data. Mask or truncate them, and follow your privacy policy.
:::

## Clean code tools

| Tool | What it does | Command |
|---|---|---|
| **ruff** | super-fast linter + formatter (replaces flake8, isort, black) | `ruff check . --fix` and `ruff format .` |
| **mypy / pyright** | static type checking | `mypy src/` |
| **pytest** | tests | `pytest` |
| **pre-commit** | runs the above automatically before every git commit | `pre-commit install` |

A tiny `pyproject.toml` section:

```toml
[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP"]    # errors, pyflakes, imports, bugbear, pyupgrade

[tool.pytest.ini_options]
testpaths = ["tests"]
```

### Small habits that matter

- **Small functions** with one job and a clear name.
- **Type hints** on public functions.
- **No magic numbers** — `MAX_CHUNK_TOKENS = 512` instead of `512` scattered around.
- **Fail loudly and early** with clear error messages.
- **Keep prompts in one place** (a `prompts.py` or template files), not sprinkled through the code.
- **Docstrings** that say *why*, not just *what*.

## Check yourself

```quiz
? Why fake the LLM in unit tests?
+ Real calls are slow, cost money and are non-deterministic
- Fakes are more accurate than real models
- pytest cannot make network calls
> Unit tests should be fast, free and repeatable. Evaluate the real model separately.

? What is dependency injection?
+ Passing collaborators (like an LLM client) into a function/class instead of creating them inside
- Installing packages with pip
- Injecting prompts into the model
> It makes swapping in fakes for testing easy.

? Which log level fits "retrying after a rate-limit error"?
- DEBUG
+ WARNING
- CRITICAL
> Something unusual happened but it was handled.

? How does pytest find tests?
+ Functions named test_* in files named test_*.py
- Any function containing assert
- Functions decorated with @test
> Naming conventions are how discovery works.
```

:::exercise Test a prompt builder
Write `build_prompt(question, context_docs, max_docs=3)` that numbers up to `max_docs` documents as `[1] ...` and appends `Question: ...`. Then write three tests: documents are numbered from 1, no more than `max_docs` appear, and the question is the last line. Run them with a mini runner.
:::

:::solution
```python run
def build_prompt(question, context_docs, max_docs=3):
    lines = [f"[{i}] {doc}" for i, doc in enumerate(context_docs[:max_docs], start=1)]
    return "\n".join(lines + [f"Question: {question}"])

def test_numbered_from_one():
    assert build_prompt("q", ["a", "b"]).splitlines()[0] == "[1] a"

def test_respects_max_docs():
    p = build_prompt("q", ["a", "b", "c", "d", "e"], max_docs=2)
    assert "[3]" not in p and "[2] b" in p

def test_question_last():
    assert build_prompt("What is RAG?", ["a"]).splitlines()[-1] == "Question: What is RAG?"

for t in [test_numbered_from_one, test_respects_max_docs, test_question_last]:
    t()
    print("PASS", t.__name__)
```
:::

:::keypoints
- Write small `test_*` functions with `assert`; run them with **pytest**.
- **Inject** the LLM client so tests can use a **fake** — fast, free, deterministic.
- Use `logging` with levels (DEBUG→CRITICAL), not `print`; log LLM calls as JSON lines.
- Never log secrets; be careful with personal data in prompts.
- `ruff`, `mypy`/`pyright`, `pytest` and `pre-commit` keep a codebase healthy.
:::
