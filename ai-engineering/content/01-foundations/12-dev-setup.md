---
title: Your AI Engineering Workstation
level: easy
time: 30
summary: Set up everything you need to do the exercises on your own machine, safely. Python environments, API keys and secrets, your first real call with the Anthropic SDK, notebooks, running an open model locally with Ollama, a spending cap, and a project layout that scales.
---

The browser examples in this course teach the ideas. To *build* things you also need a real environment. This lesson is a checklist you do once.

## 1. Python and an isolated environment

Use Python 3.10 or newer. Always create a **virtual environment** per project so packages never clash.

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install anthropic openai numpy pydantic python-dotenv httpx
```

Faster alternative: [uv](https://docs.astral.sh/uv/) (`uv venv`, `uv pip install ...`). Commit a `requirements.txt` or `pyproject.toml` so others can reproduce your setup.

## 2. API keys, safely

An API key is a password that **spends your money**. Rules:

1. Never paste a key into code, a notebook, a prompt, a screenshot or a Git commit.
2. Keep keys in environment variables or a `.env` file that is listed in `.gitignore`.
3. Use a **separate key per project** with a **monthly spending limit**, and rotate it if it leaks (bots scan public repositories within minutes).
4. In production, use a secret manager (cloud secrets, Vault), never a file on a server.

```bash
# .env  (never commit this file)
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
# .gitignore
.env
.venv/
__pycache__/
```

```python local title="Load the key without hard-coding it"
from dotenv import load_dotenv
import os

load_dotenv()                                   # reads .env into environment variables
assert os.getenv("ANTHROPIC_API_KEY"), "Set ANTHROPIC_API_KEY in your .env file"
```

## 3. Your first real call

The Anthropic SDK reads `ANTHROPIC_API_KEY` from the environment. Models in this course's code: `claude-opus-5-5` (most capable of the three), `claude-sonnet-5-5` (balanced), `claude-haiku-5-5` (fast and cheap). Any provider's SDK follows the same shape.

```python local title="Hello, Claude"
import anthropic

client = anthropic.Anthropic()                  # reads ANTHROPIC_API_KEY

response = client.messages.create(
    model="claude-haiku-5-5",
    max_tokens=300,
    system="You are a concise assistant.",
    messages=[{"role": "user", "content": "Explain what a token is in two sentences."}],
)

for block in response.content:                  # content is a list of blocks
    if block.type == "text":
        print(block.text)

print("stop_reason:", response.stop_reason)
print("tokens in/out:", response.usage.input_tokens, response.usage.output_tokens)
```

Look at the three things worth checking on every call: the **text**, the **`stop_reason`** (`end_turn` is normal; `max_tokens` means it was cut off), and the **usage** (what it cost). The next module goes through the whole API.

:::tip Use the SDK, not hand-rolled HTTP
Official SDKs handle retries, timeouts, streaming, typed responses and errors. Reach for raw `requests` only when no SDK exists.
:::

## 4. Notebooks and editors

- **Jupyter / VS Code notebooks / Google Colab** are ideal for exploring prompts and data. [Colab](https://colab.research.google.com/) gives free GPUs for small fine-tuning and local-model experiments.
- Move working code into **modules** with tests as soon as it stabilises. Notebooks are for exploring, not for production.
- Editor tools: an AI coding assistant is useful, but **read every line** it writes in your first months. You are building judgement.

## 5. Running open models on your own machine

Local models cost nothing per token, keep data on your device, and teach you how inference behaves.

- **[Ollama](https://ollama.com)**: one command to download and chat with a model, plus an OpenAI-compatible local API.
- **[LM Studio](https://lmstudio.ai)**: a desktop app with a model browser and local server.
- **[llama.cpp](https://github.com/ggml-org/llama.cpp)**: the engine under many tools, great on CPUs and Apple silicon.

```bash
# install Ollama from ollama.com, then:
ollama pull qwen3:8b            # a small open model (pick one that fits your RAM)
ollama run qwen3:8b "Give me three names for a coffee shop"
```

```python local title="Call the local model with the OpenAI-compatible API"
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")     # key is ignored
r = client.chat.completions.create(
    model="qwen3:8b",
    messages=[{"role": "user", "content": "Say hello in French."}],
)
print(r.choices[0].message.content)
```

A rough hardware guide: a **7–8B** model quantized to 4 bits needs about **5 GB** of RAM/VRAM; **13–14B** about 9 GB; **30–34B** about 20 GB; **70B** about 40 GB. (Why: memory ≈ parameters × bits ÷ 8; the inference module derives it.)

## 6. Keep an eye on spend

- Set a **monthly limit** in the provider console and an alert at 50% and 80%.
- Log `usage` for every call from day one (tokens in, out, cached) and compute cost; the token-economics lesson shows how.
- Start experiments with the **cheap tier** and short `max_tokens`.
- Beware loops: an agent with no step limit can spend a surprising amount overnight.

## 7. A project layout that scales

```text
my-ai-app/
  .env                    # secrets, git-ignored
  pyproject.toml          # dependencies
  src/myapp/
    llm.py                # ALL model calls go through here (swap providers in one place)
    prompts/              # prompt templates as files, versioned
    retrieval.py          # RAG code
    tools.py              # functions the model can call
    schemas.py            # Pydantic models for structured output
  evals/
    dataset.jsonl         # your test cases
    run_evals.py          # prints a score table
  tests/                  # ordinary unit tests for the deterministic parts
```

The two habits that pay off most: **one module owns every model call** (so you can add logging, caching, retries and a different provider later), and **`evals/` exists from the first week**.

```quiz
? Where should an API key live?
- In the source code, for convenience
+ In an environment variable or secret manager, never committed to Git
- In the system prompt
> Keys are passwords that spend money; keep them out of code and history.

? A response has stop_reason "max_tokens". What happened?
- The model finished normally
+ The output was cut off at your limit; raise max_tokens or shorten the task
- The key expired
> Always check why generation stopped.

? What is a good first habit when running an agent loop?
- Let it run forever
+ Set a maximum number of steps and a spending cap
- Disable logging
> Unbounded loops can burn money quickly.
```

:::keypoints
- Use a virtual environment per project; keep dependencies in a file.
- API keys are secrets that spend money: environment variables, `.gitignore`, per-project keys, spending limits, rotate on leak.
- A first call returns text blocks, a stop reason and token usage; check all three.
- Ollama, LM Studio and llama.cpp let you run open models locally with an OpenAI-compatible API.
- Route every model call through one module and create `evals/` from the start.
:::

:::resources
- [Anthropic SDK for Python](https://github.com/anthropics/anthropic-sdk-python) — the client used in this course.
- [Claude API docs](https://docs.claude.com/en/docs/intro) — models, parameters, limits and guides.
- [Anthropic Cookbook](https://github.com/anthropics/anthropic-cookbook) — runnable recipes for common tasks.
- [OpenAI Cookbook](https://cookbook.openai.com/) — provider-neutral patterns worth reading too.
- [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), [llama.cpp](https://github.com/ggml-org/llama.cpp) — local models.
- [Hugging Face Hub](https://huggingface.co/models) — browse open models and datasets.
:::
