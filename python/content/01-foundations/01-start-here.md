---
title: Start Here — Python & AI
level: easy
time: 12
summary: What Python is, why every AI team uses it, how this site works, and your very first lines of code.
---

Welcome! This site teaches you **Python for AI** — from your first `print()` all the way to building chatbots, RAG systems and AI agents. You do not need any experience. Every idea is explained in simple words first, and almost every example can be **run right here in your browser**.

## How to use this site

Every lesson follows the same pattern, so you always know where to look:

| You will see | What it is for |
|---|---|
| **Definition** cards (blue) | The exact meaning of a new word. All of them are collected in the [Glossary](#/glossary). |
| **Syntax** boxes | The "shape" of the code — the pattern you copy. |
| **▶ Run** code blocks | Real Python you can edit and run. Output appears right below. |
| **Run locally** badge | Code that needs your own computer (big libraries or an API key). |
| **Where this shows up in AI** | How the idea is used in real AI projects. |
| **Quick check** & **Practice** | Short quizzes and exercises with hidden solutions. |

:::tip
Press **Ctrl + Enter** (or **⌘ + Enter** on Mac) inside any code block to run it. Press **Ctrl + K** anywhere to search.
:::

## Your first program

Press **▶ Run** below. The first run takes a few seconds because Python itself is being downloaded into your browser. After that it is instant.

```python run title="hello.py" level=easy
print("Hello, AI world!")
print("Python version check:", 2 + 3)
```

That is a complete Python program. `print()` shows something on the screen. Now **change the text inside the quotes** and run it again — you just edited your first program.

:::def Program
A list of instructions written for a computer. Python reads your program **from top to bottom, one line at a time**, and does what each line says.
:::

:::def Function
A named action you can use. You "call" a function by writing its name followed by round brackets, like `print("hi")`. What goes inside the brackets is the input.
:::

## What is Python?

Python is a **programming language** — a way to give instructions to a computer using words that look a lot like English. It was designed to be easy to read. Compare:

```python
# Python
if temperature > 30:
    print("It's hot")
```

Even if you have never coded, you can probably guess what that does. That readability is a big reason Python won.

:::analogy
Think of Python as the **universal remote** of AI. The heavy lifting (math on GPUs, giant neural networks) is done by super-fast code written in C, C++ and CUDA. Python is the friendly remote control you use to drive all of it with a few simple lines.
:::

## Why every AI team uses Python

Almost every AI tool you will hear about is used from Python:

| Area | Popular Python libraries |
|---|---|
| Data | `numpy`, `pandas`, `polars` |
| Classic Machine Learning | `scikit-learn`, `xgboost` |
| Deep Learning | `pytorch`, `jax`, `keras` |
| Language models | `transformers` (Hugging Face), `tokenizers` |
| LLM APIs | `anthropic` (Claude), `openai`, `google-genai` |
| LLM apps | `langchain`, `llama-index`, `pydantic-ai` |
| Vector search | `faiss`, `chromadb`, `qdrant-client` |
| Serving apps | `fastapi`, `streamlit`, `gradio` |

:::flow The road map of this site
Python Foundations | the language itself
Intermediate & Advanced | write code like a pro
Data & Math | NumPy, Pandas, plots
Machine Learning | models that learn
Deep Learning | neural networks
NLP & Transformers | how LLMs work
Gen-AI Engineering | build LLM apps
Project Lab | put it all together
:::

## Python as a calculator

Python can do math directly. Try changing the numbers:

```python run level=easy
print(7 + 3)      # addition
print(7 - 3)      # subtraction
print(7 * 3)      # multiplication
print(7 / 3)      # division (always gives a decimal)
print(7 // 3)     # whole-number division (drops the decimal)
print(7 % 3)      # remainder ("modulo")
print(2 ** 10)    # power: 2 to the 10th
```

:::def Comment
Text after a `#` symbol. Python **ignores** it. Comments are notes for humans — use them to explain *why* your code does something.
:::

:::def Operator
A symbol that does an operation on values, like `+`, `-`, `*`, `/`, `**` (power), `//` (whole division) and `%` (remainder).
:::

## More about print()

`print()` can take several things at once, separated by commas. It puts a space between them.

:::syntax
```python
print(value1, value2, ..., sep=" ", end="\n")
```
- `sep` — what goes **between** values (default: one space)
- `end` — what goes at the **end** (default: a new line `\n`)
:::

```python run level=easy
print("Model:", "Claude", "| Tokens:", 1500)
print("a", "b", "c", sep="-")
print("Loading", end="")
print("...", end="")
print(" done!")
```

:::warn
Text must be inside **quotes**: `print(hello)` fails because Python thinks `hello` is a name it should know. Write `print("hello")`. Both `"double"` and `'single'` quotes work.
:::

Let's see that mistake on purpose. Run this, read the error, then fix it by adding quotes:

```python run level=easy expect-error
print(hello)
```

:::tip Errors are friends
Every error tells you **what** went wrong and **which line**. Read the last line of the error first — it is the most useful. On this site you also get a plain-English explanation under each error.
:::

## Setting up Python on your own computer

You can learn everything in the browser, but to build real AI apps you will want Python on your machine too. Here is the modern, simple setup:

1. Install **Python 3.12 or newer** from [python.org](https://www.python.org/downloads/) (on Windows, tick "Add Python to PATH").
2. Install **VS Code** and its **Python** extension.
3. Open a terminal and check it works:

```bash
python --version          # Windows
python3 --version         # macOS / Linux
```

4. Create a project folder with its own **virtual environment** (a private box of packages for this project):

```bash
mkdir my-ai-project && cd my-ai-project
python -m venv .venv
source .venv/bin/activate      # macOS / Linux
.venv\Scripts\activate         # Windows
pip install numpy pandas anthropic
```

:::note Prefer speed? Try uv
`uv` is a newer, much faster tool that does the same job: `uv init`, then `uv add numpy pandas anthropic`, then `uv run main.py`. Either tool is fine. We cover both in the lesson on modules and environments.
:::

## Check yourself

```quiz
? What does Python do with a line that starts with `#`?
- It runs it twice
+ It ignores it — it is a comment
- It prints it
> Comments are notes for humans. Python skips them completely.

? What is the result of `7 // 2`?
- 3.5
+ 3
- 1
> `//` is whole-number (floor) division. It throws away the decimal part.

? Which line correctly prints the word Claude?
- print(Claude)
+ print("Claude")
- print[Claude]
> Text must be inside quotes, and functions are called with round brackets.
```

:::exercise Your turn
Write a program that prints three lines:
1. Your name
2. How many seconds are in a day (let Python calculate `24 * 60 * 60`)
3. The words `AI`, `ML` and `DL` joined by ` -> ` using the `sep` option
:::

:::solution
```python run
print("Ada Lovelace")
print(24 * 60 * 60)
print("AI", "ML", "DL", sep=" -> ")
```
:::

:::keypoints
- Python runs your code **top to bottom, line by line**.
- `print()` shows output; `#` starts a comment that Python ignores.
- Python is the "remote control" of AI — the fast math happens in libraries it calls.
- Errors are normal. Read the **last line** first.
- Use a **virtual environment** (`venv` or `uv`) for every real project.
:::
