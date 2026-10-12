---
title: Files, JSON & Paths
level: easy
time: 25
summary: Read and write text files, JSON and JSONL, CSV, and work with folders using pathlib — how datasets, prompts, configs and chat logs are stored.
---

Datasets, prompt templates, model configs, evaluation results and chat logs all live in **files**. Most of them are plain text, **JSON** or **JSONL**. This lesson covers everything you need.

:::note Files in the browser
The code on this page runs in a small private file system inside your browser. Files you create here disappear when you reload — but the code is exactly what you would run on your computer.
:::

## Writing and reading text files

:::def File handle
The object you get from `open()`. You read from it or write to it, then it must be **closed** so the data is saved. The `with` statement closes it automatically.
:::

:::syntax
```python
with open("path.txt", "w", encoding="utf-8") as f:   # "w" = write (overwrites)
    f.write("text")

with open("path.txt", "r", encoding="utf-8") as f:   # "r" = read
    content = f.read()
```
| Mode | Meaning |
|---|---|
| `"r"` | read (default) |
| `"w"` | write — creates or **erases** the file |
| `"a"` | append — add to the end |
| `"rb"` / `"wb"` | read / write bytes (images, PDFs) |
:::

```python run level=easy
with open("notes.txt", "w", encoding="utf-8") as f:
    f.write("Python is great for AI.\n")
    f.write("Transformers changed NLP.\n")

with open("notes.txt", "a", encoding="utf-8") as f:
    f.write("RAG reduces hallucinations.\n")

with open("notes.txt", encoding="utf-8") as f:
    content = f.read()

print(content)
print(len(content.splitlines()), "lines")
```

:::tip Always pass encoding="utf-8"
Without it, Windows may use a different default encoding and crash on emoji or accented characters. Being explicit avoids "works on my machine" bugs.
:::

### Reading line by line

For big files, loop over the file handle — it reads **one line at a time** instead of loading everything into memory.

```python run level=easy
with open("corpus.txt", "w", encoding="utf-8") as f:
    f.write("first document\n\nsecond document\nthird document\n")

with open("corpus.txt", encoding="utf-8") as f:
    for line_number, line in enumerate(f, start=1):
        line = line.rstrip("\n")       # remove the line break
        if not line:
            continue                   # skip blank lines
        print(line_number, line)
```

## pathlib: working with paths the modern way

:::def Path
An object from the `pathlib` module that represents a file or folder location. It has handy methods like `.exists()`, `.read_text()`, `.glob("*.txt")` and joins paths with `/`.
:::

```python run level=intermediate
from pathlib import Path

data_dir = Path("data")
data_dir.mkdir(exist_ok=True)                 # create folder if missing

for name, text in [("a.txt", "alpha"), ("b.txt", "beta"), ("c.md", "# gamma")]:
    (data_dir / name).write_text(text, encoding="utf-8")   # / joins paths

print([p.name for p in data_dir.glob("*.txt")])            # only .txt files
for p in sorted(data_dir.iterdir()):
    print(p, "| stem:", p.stem, "| suffix:", p.suffix, "| size:", p.stat().st_size, "bytes")

print(Path("data/a.txt").read_text(encoding="utf-8"))
print(Path("data/missing.txt").exists())
```

| Path method | Does |
|---|---|
| `p / "name"` | join paths |
| `p.exists()` / `p.is_file()` / `p.is_dir()` | checks |
| `p.read_text()` / `p.write_text(s)` | read / write a whole text file |
| `p.glob("*.pdf")` / `p.rglob("*.md")` | find files (rglob = in all subfolders) |
| `p.name`, `p.stem`, `p.suffix`, `p.parent` | parts of the path |
| `p.mkdir(parents=True, exist_ok=True)` | create folders |

## JSON — the language of APIs

:::def JSON
**JavaScript Object Notation** — a text format for structured data. It looks almost exactly like Python dicts and lists. Every web API, including LLM APIs, sends and receives JSON.
:::

| JSON | Python |
|---|---|
| `{"key": value}` object | `dict` |
| `[1, 2]` array | `list` |
| `"text"` | `str` |
| `12`, `3.5` | `int`, `float` |
| `true` / `false` | `True` / `False` |
| `null` | `None` |

:::syntax
```python
import json
text = json.dumps(obj, indent=2)    # Python -> JSON text   ("dump string")
obj = json.loads(text)              # JSON text -> Python   ("load string")
json.dump(obj, file)                # write to a file
obj = json.load(file)               # read from a file
```
:::

```python run level=easy
import json

config = {"model": "claude-opus-5-5", "max_tokens": 1024, "stream": False, "stop": None}

text = json.dumps(config, indent=2)
print(text)                       # notice: false and null in JSON

back = json.loads(text)
print(back["model"], back["stream"], back["stop"])

with open("config.json", "w", encoding="utf-8") as f:
    json.dump(config, f, indent=2)

with open("config.json", encoding="utf-8") as f:
    loaded = json.load(f)
print(loaded == config)
```

:::warn JSON is stricter than Python
JSON needs **double quotes**, no trailing commas, and lowercase `true/false/null`. `json.loads("{'a': 1}")` fails because of the single quotes.
:::

```python run level=intermediate
import json

print(json.dumps({"emoji": "🤖", "accent": "café"}))                      # escaped by default
print(json.dumps({"emoji": "🤖", "accent": "café"}, ensure_ascii=False))  # keep readable characters
print(json.dumps({"b": 2, "a": 1}, sort_keys=True))                       # stable key order
print(json.dumps([1, 2, 3], separators=(",", ":")))                       # compact
```

## JSONL — one JSON object per line

:::def JSONL (JSON Lines)
A file where **each line is a separate JSON object**. It is the standard format for AI datasets, fine-tuning data, batch API requests and evaluation logs, because you can stream it line by line and append to it easily.
:::

```python run level=intermediate
import json

examples = [
    {"messages": [{"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hello!"}]},
    {"messages": [{"role": "user", "content": "2+2?"}, {"role": "assistant", "content": "4"}]},
]

# write
with open("train.jsonl", "w", encoding="utf-8") as f:
    for ex in examples:
        f.write(json.dumps(ex, ensure_ascii=False) + "\n")

# read
with open("train.jsonl", encoding="utf-8") as f:
    rows = [json.loads(line) for line in f if line.strip()]

print(open("train.jsonl", encoding="utf-8").read())
print(len(rows), "examples; first user message:", rows[0]["messages"][0]["content"])
```

## CSV files

```python run level=intermediate
import csv

rows = [
    {"text": "I love this!", "label": "positive"},
    {"text": "Not great, honestly", "label": "negative"},
    {"text": "Works as expected", "label": "positive"},
]

with open("reviews.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["text", "label"])
    writer.writeheader()
    writer.writerows(rows)

with open("reviews.csv", newline="", encoding="utf-8") as f:
    print(f.read())

with open("reviews.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        print(row["label"], "->", row["text"])
```

:::tip
For anything beyond simple reading, use **pandas** (`pd.read_csv`) — covered in the Data module. The `csv` module is great for quick scripts with no dependencies.
:::

## Putting it together: an LLM call logger

Here is a pattern used in real apps — append every request and response to a JSONL log so you can analyse costs and quality later.

```python run level=advanced
import json
import time
from pathlib import Path

LOG = Path("llm_log.jsonl")
LOG.unlink(missing_ok=True)        # start fresh for the demo

def log_call(prompt: str, response: str, input_tokens: int, output_tokens: int) -> None:
    record = {
        "ts": round(time.time(), 3),
        "prompt": prompt,
        "response": response,
        "usage": {"input": input_tokens, "output": output_tokens},
    }
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

log_call("What is RAG?", "Retrieval-Augmented Generation...", 12, 40)
log_call("Explain attention", "Attention lets each token...", 9, 85)
log_call("Summarize this doc", "The document says...", 1500, 120)

records = [json.loads(line) for line in LOG.read_text(encoding="utf-8").splitlines()]
total_in = sum(r["usage"]["input"] for r in records)
total_out = sum(r["usage"]["output"] for r in records)
print(f"{len(records)} calls, {total_in} input tokens, {total_out} output tokens")
print("longest answer:", max(records, key=lambda r: r["usage"]["output"])["prompt"])
```

:::ai
- **Fine-tuning datasets** are JSONL files of example conversations.
- **Batch APIs** take a JSONL file of requests and return a JSONL file of results.
- **RAG pipelines** start by walking a folder with `Path.rglob("*.pdf")` or `*.md`.
- **Configs** for experiments are JSON (or YAML/TOML) files.
:::

## Check yourself

```quiz
? What does `open("data.txt", "w")` do if data.txt already has content?
- Adds to the end
+ Erases it and starts fresh
- Raises an error
> "w" overwrites. Use "a" to append.

? Which turns a Python dict into JSON text?
+ json.dumps(d)
- json.loads(d)
- str.json(d)
> dumps = dump to string. loads = load from string.

? Why is JSONL popular for datasets?
+ Each line is one record, so you can stream and append easily
- It is smaller than CSV
- It does not need quotes
> You can process huge JSONL files one line at a time and add records by appending lines.

? Why use `with open(...) as f:`?
+ It closes the file automatically, even if an error happens
- It makes reading faster
- It is the only way to open files
> The with-statement guarantees cleanup. You will learn how it works in the Context Managers lesson.
```

:::exercise Dataset splitter
Create a list of 10 dicts like `{"id": i, "text": f"example {i}"}`. Write the first 8 to `train.jsonl` and the last 2 to `test.jsonl`. Then read both files back and print how many lines each has.
:::

:::solution
```python run
import json
from pathlib import Path

data = [{"id": i, "text": f"example {i}"} for i in range(10)]

def write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")

write_jsonl("train.jsonl", data[:8])
write_jsonl("test.jsonl", data[8:])

for name in ["train.jsonl", "test.jsonl"]:
    lines = Path(name).read_text(encoding="utf-8").splitlines()
    print(name, len(lines), "lines; first:", json.loads(lines[0]))
```
:::

:::keypoints
- Use `with open(path, mode, encoding="utf-8") as f:` — it closes files for you.
- `pathlib.Path` is the modern way to build paths, list folders and read/write quickly.
- `json.dumps` / `json.loads` convert between Python and JSON text; `dump` / `load` work with files.
- **JSONL** (one JSON object per line) is the standard for AI datasets and logs.
- The `csv` module handles CSV; pandas is better for analysis.
:::
