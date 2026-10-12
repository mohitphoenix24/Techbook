---
title: Regular Expressions
level: intermediate
time: 25
summary: Find, extract and clean text with patterns. Regex is the go-to tool for cleaning documents, pulling data out of LLM replies and simple tokenization.
---

Want every email address in a document? Every number in a model's answer? The JSON block inside a chatty reply? Want to remove HTML tags or collapse whitespace? **Regular expressions** (regex) do all of this in one line.

:::def Regular expression (regex)
A mini-language for describing **text patterns**. `\d+` means "one or more digits". Python's `re` module searches text for these patterns.
:::

:::tip Always use raw strings for patterns
Write patterns as `r"\d+"` (raw string). Otherwise Python treats backslashes as escape characters before `re` ever sees them.
:::

## Your first patterns

```python run level=easy
import re

text = "Order 66 shipped on 2026-03-14. Order 7 is pending. Call 555-0199."

print(re.findall(r"\d+", text))                 # every run of digits
print(re.findall(r"\d{4}-\d{2}-\d{2}", text))   # dates like 2026-03-14
print(re.search(r"Order (\d+)", text).group(1))  # the first match's captured part
print(re.sub(r"\d", "#", "PIN: 4821"))          # replace every digit
```

## The pattern cheat sheet

| Pattern | Matches | Example |
|---|---|---|
| `.` | any character except newline | `a.c` → abc, a-c |
| `\d` / `\D` | a digit / not a digit | `\d\d` → 42 |
| `\w` / `\W` | a word character (letter, digit, `_`) / not | `\w+` → hello_1 |
| `\s` / `\S` | whitespace / not whitespace | `\s+` → spaces, tabs, newlines |
| `[abc]` | one of a, b, c | `[aeiou]` → vowels |
| `[^abc]` | anything except a, b, c | `[^0-9]` → non-digits |
| `[a-z]` | a range | `[A-Za-z]` → letters |
| `^` / `$` | start / end of the text (or line) | `^Hello` |
| `\b` | word boundary | `\bcat\b` → cat but not category |
| `a\|b` | a or b | `cat\|dog` |
| `( )` | group (and capture) | `(\d+)-(\d+)` |

### Quantifiers — how many?

| Quantifier | Meaning |
|---|---|
| `*` | 0 or more |
| `+` | 1 or more |
| `?` | 0 or 1 (optional) |
| `{3}` | exactly 3 |
| `{2,5}` | between 2 and 5 |
| `*?`, `+?` | the **lazy** versions: as few as possible |

```python run level=easy
import re

print(re.findall(r"colou?r", "color colour colr"))        # optional u
print(re.findall(r"\b\w{5,}\b", "a tiny model learns language patterns"))   # words of 5+ letters
print(re.findall(r"\bAI\b", "AI, FAIR and OpenAI"))        # whole word only
print(re.findall(r"^\w+", "first line\nsecond line", flags=re.MULTILINE))
```

## The main functions

:::syntax
```python
re.search(pattern, text)     # first match anywhere -> Match or None
re.match(pattern, text)      # match only at the START -> Match or None
re.fullmatch(pattern, text)  # the WHOLE text must match
re.findall(pattern, text)    # list of all matches (strings or tuples of groups)
re.finditer(pattern, text)   # iterator of Match objects
re.sub(pattern, repl, text)  # replace matches
re.split(pattern, text)      # split on matches
re.compile(pattern)          # pre-compile a pattern you reuse a lot
```
:::

```python run level=intermediate
import re

log = "user=ada tokens=1500 model=claude-opus-5-5 latency=320ms"

m = re.search(r"tokens=(\d+)", log)
if m:                                   # always check: search returns None if nothing found
    print("whole match:", m.group(0), "| captured:", m.group(1), "| at:", m.span())

print(re.match(r"tokens", log))         # None — match only checks the start
print(bool(re.fullmatch(r"[\w.-]+@[\w-]+\.\w+", "ada@example.com")))

for m in re.finditer(r"(\w+)=(\S+)", log):
    print(f"{m.group(1):>8} -> {m.group(2)}")

print(re.split(r"[;,]\s*", "rag; agents, tools,evals"))
```

### Named groups

Give groups names with `(?P<name>...)` — much more readable:

```python run level=intermediate
import re

pattern = re.compile(r"(?P<key>\w+)=(?P<value>\S+)")
log = "user=ada tokens=1500 model=claude-opus-5-5"

record = {m["key"]: m["value"] for m in pattern.finditer(log)}
print(record)

date = re.search(r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})", "released 2026-09-09")
print(date.groupdict())
```

## Cleaning text for AI

```python run level=intermediate
import re

raw = """<p>Hello   <b>World</b>!!!</p>
Visit https://example.com/docs?id=7   or email   team@example.com.


Thanks!!   """

text = re.sub(r"<[^>]+>", "", raw)                      # 1. strip HTML tags
text = re.sub(r"https?://\S+", "[URL]", text)           # 2. mask URLs
text = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "[EMAIL]", text)   # 3. mask emails (privacy!)
text = re.sub(r"([!?.])\1+", r"\1", text)               # 4. "!!!" -> "!"   (\1 = same char again)
text = re.sub(r"\s+", " ", text).strip()                # 5. collapse whitespace
print(text)
```

:::ai PII masking
Masking emails, phone numbers and IDs before sending text to an external LLM is a standard **privacy guardrail**. Regex is the first line of defence (dedicated libraries go further).
:::

## Extracting structured data from LLM replies

Models often wrap their answer in Markdown code fences or extra text. Regex pulls out exactly what you need:

````python run level=intermediate
import re
import json

reply = """Sure! Here is the data you asked for:

```json
{"name": "Ada Lovelace", "born": 1815, "field": "mathematics"}
```

Let me know if you need anything else."""

match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", reply, flags=re.DOTALL)
data = json.loads(match.group(1)) if match else None
print(data)
print(data["born"] + 200)
````

:::def Flags
Options that change how a pattern behaves: `re.IGNORECASE` (`re.I`) ignores case, `re.DOTALL` (`re.S`) lets `.` match newlines too, `re.MULTILINE` (`re.M`) makes `^`/`$` work per line, `re.VERBOSE` (`re.X`) allows comments and spacing inside the pattern.
:::

```python run level=intermediate
import re

answer = "Thought: I should check the weather.\nAction: get_weather\nAction Input: Paris\n"

action = re.search(r"^Action:\s*(.+)$", answer, re.MULTILINE).group(1)
action_input = re.search(r"^Action Input:\s*(.+)$", answer, re.MULTILINE).group(1)
print(action, "|", action_input)        # this is how classic ReAct agents parse model output

score_text = "I'd rate this response 8/10 because it is clear."
score = int(re.search(r"(\d+)\s*/\s*10", score_text).group(1))
print("score:", score)                    # LLM-as-judge parsing
```

## Greedy vs lazy

:::warn Greedy by default
`.*` grabs **as much as possible**. To match the smallest piece, add `?`: `.*?`. This is the most common regex surprise.
:::

```python run level=intermediate
import re

html = "<b>bold</b> and <i>italic</i>"
print(re.findall(r"<.*>", html))     # greedy: one giant match
print(re.findall(r"<.*?>", html))    # lazy: each tag separately
```

## A regex tokenizer

Before modern subword tokenizers, NLP pipelines split text with regex. GPT-2's tokenizer still uses a regex **pre-tokenization** step before BPE. Here is a simplified version:

```python run level=advanced
import re

TOKEN_PATTERN = re.compile(r"""
      \d+(?:\.\d+)?        # numbers like 42 or 3.14
    | [A-Za-z]+(?:'[a-z]+)?  # words, with optional 's, 't, 're ...
    | [^\sA-Za-z\d]         # any single punctuation / symbol
""", re.VERBOSE)

def tokenize(text):
    return TOKEN_PATTERN.findall(text)

print(tokenize("Don't panic! GPT-5 costs $2.50 per 1M tokens, it's fine."))
```

### Sentence splitting for chunking

```python run level=advanced
import re

doc = "RAG has two steps. First, retrieve relevant text! Then generate an answer? Dr. Smith agrees. It works."

# split after . ! ? followed by space + capital letter, but not after "Dr."
sentences = re.split(r"(?<!\bDr\.)(?<=[.!?])\s+(?=[A-Z])", doc)
for s in sentences:
    print("-", s)
```

`(?<=...)` and `(?<!...)` are **lookbehinds** ("only if preceded / not preceded by"), and `(?=...)` is a **lookahead**. They check context without consuming characters.

## When NOT to use regex

- **Parsing HTML** properly → use `BeautifulSoup`.
- **Parsing JSON** → use `json.loads`.
- **Splitting text into LLM tokens** → use the model's real tokenizer (`tiktoken`, Hugging Face `tokenizers`, or the API's token counter).
- **Complex validation** that you cannot read a week later → write normal Python code.

## Check yourself

```quiz
? What does `\d+` match?
+ One or more digits
- Exactly one digit
- The letter d
> \d is a digit; + means one or more.

? `re.search(...)` finds nothing. What does it return?
+ None
- An empty string
- It raises an error
> Always check `if m:` before calling `m.group()`.

? Why does `<.*>` match too much in `"<b>x</b>"`?
+ `*` is greedy; use `.*?` for the shortest match
- Because < is a special character
- It does not — it matches only <b>
> Greedy quantifiers take as much as they can.

? Which flag lets `.` match newline characters?
- re.MULTILINE
+ re.DOTALL
- re.IGNORECASE
> DOTALL ("dot matches all"). MULTILINE changes ^ and $.
```

:::exercise Parse a model's citation list
The model answered with citations like `[1]`, `[2]` and a source list. Extract every **distinct** citation number used in the answer (sorted ints), and build a dict from number → URL from the source lines.

```python
reply = """RAG reduces hallucinations [1]. It needs a good retriever [2][3], and chunking matters [1].
Sources:
[1] https://example.com/rag
[2] https://example.com/retrievers
[3] https://example.com/chunking"""
```
:::

:::solution
```python run
import re

reply = """RAG reduces hallucinations [1]. It needs a good retriever [2][3], and chunking matters [1].
Sources:
[1] https://example.com/rag
[2] https://example.com/retrievers
[3] https://example.com/chunking"""

body, sources = reply.split("Sources:")
cited = sorted({int(n) for n in re.findall(r"\[(\d+)\]", body)})
urls = {int(n): url for n, url in re.findall(r"^\[(\d+)\]\s+(\S+)$", sources, re.MULTILINE)}
print(cited)
print(urls)
```
:::

:::keypoints
- Use raw strings: `r"\d+"`. Learn `\d \w \s . [] ^ $ \b` and `* + ? {m,n}`.
- `search` (first match), `findall` (all), `finditer` (Match objects), `sub` (replace), `split`.
- Groups `( )` capture parts; named groups `(?P<name>...)` are clearer.
- Quantifiers are greedy — add `?` for lazy. `re.DOTALL`, `re.MULTILINE`, `re.VERBOSE` change behaviour.
- Great for cleaning, PII masking and pulling JSON/answers out of LLM replies.
:::
