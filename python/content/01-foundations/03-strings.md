---
title: Strings & f-strings
level: easy
time: 25
summary: Text is the raw material of Generative AI. Learn to slice, clean, search, format and build prompts with Python strings.
---

Large Language Models read text and write text. Prompts, documents, chat messages, model outputs — all of them are **strings**. Getting comfortable with strings is the single most useful skill for Gen-AI work.

:::def String (str)
A sequence of characters (letters, digits, spaces, emoji…) written inside quotes: `"hello"` or `'hello'`. Strings are **immutable** — once created, they cannot be changed; operations always make a new string.
:::

## Creating strings

```python run level=easy
single = 'Hello'
double = "It's easy"                 # use double quotes when the text has an apostrophe
escaped = 'It\'s also fine'          # or escape it with a backslash
multi = """You are a helpful assistant.
Answer in one short sentence.
Be friendly."""                       # triple quotes keep line breaks

print(single)
print(double)
print(escaped)
print(multi)
```

:::def Escape character
A backslash `\` that gives the next character a special meaning: `\n` = new line, `\t` = tab, `\"` = a quote, `\\` = a real backslash.
:::

```python run level=easy
print("Line one\nLine two")
print("Name:\tClaude")
print("Path: C:\\models\\weights")
print(r"Raw string: C:\new\table")   # r"..." = raw string, backslashes are kept as-is
```

## Indexing and slicing

Each character has a **position** (index). Python counts from **0**. Negative numbers count from the end.

```text
 text:   P   y   t   h   o   n
 index:  0   1   2   3   4   5
 from end:-6  -5  -4  -3  -2  -1
```

:::syntax
```python
text[i]            # one character at position i
text[start:stop]   # from start up to (NOT including) stop
text[start:stop:step]
```
Leave out `start` to begin at 0, leave out `stop` to go to the end.
:::

```python run level=easy
word = "Python"
print(word[0])      # P
print(word[-1])     # n  (last)
print(word[0:3])    # Pyt (positions 0, 1, 2)
print(word[2:])     # thon
print(word[:2])     # Py
print(word[::-1])   # nohtyP (reversed)
print(len(word))    # 6 characters
```

:::warn
`text[start:stop]` stops **before** `stop`. `"Python"[0:3]` is `"Pyt"`, not `"Pyth"`. Think of the numbers as the gaps *between* letters.
:::

## The most useful string methods

:::def Method
A function that belongs to a value. You call it with a dot: `text.upper()`. String methods never change the original — they **return a new string**.
:::

```python run level=easy
raw = "   Generative AI is FUN!   "

print(raw.strip())          # remove spaces at both ends
print(raw.lower())          # all lowercase
print(raw.upper())          # all uppercase
print(raw.strip().title())  # Each Word Capitalized
print(raw.replace("FUN", "powerful"))
print(raw.count("A"))       # how many times "A" appears
print("AI" in raw)          # True — the in operator searches text
print(raw.strip().startswith("Gen"), raw.strip().endswith("!"))
print(raw.find("AI"))       # position of first match (-1 if not found)
```

| Method | What it does | Example |
|---|---|---|
| `.strip()` | trims whitespace from both ends | `" hi ".strip()` → `"hi"` |
| `.lower()` / `.upper()` | change case | `"Hi".lower()` → `"hi"` |
| `.replace(a, b)` | replace every `a` with `b` | `"a-b".replace("-", " ")` |
| `.split(sep)` | cut into a list | `"a,b".split(",")` → `["a", "b"]` |
| `sep.join(list)` | glue a list into text | `", ".join(["a","b"])` → `"a, b"` |
| `.startswith()` / `.endswith()` | check the beginning / end | `"q.pdf".endswith(".pdf")` |
| `.find(x)` | index of `x`, or `-1` | `"hello".find("l")` → `2` |
| `.isdigit()` / `.isalpha()` | content checks | `"42".isdigit()` → `True` |

### split and join — your text-processing workhorses

```python run level=easy
sentence = "large language models predict the next token"
words = sentence.split()           # split on any whitespace
print(words)
print(len(words), "words")

print(" ".join(reversed(words)))
print("-".join(words).upper())

csv_line = "gpt,claude,gemini,llama"
models = csv_line.split(",")
print(models)
```

## f-strings: the best way to build text

:::def f-string
A string with an `f` before the quote. Anything inside `{curly braces}` is **evaluated** as Python and inserted into the text. Introduced in Python 3.6 and now the standard way to format text.
:::

:::syntax
```python
f"text {expression} more text"
f"{value:.2f}"     # format spec after a colon
```
:::

```python run level=easy
name = "Ada"
tokens = 1534
cost = 0.00654321

print(f"Hello {name}!")
print(f"You used {tokens} tokens.")
print(f"Next year you will be {36 + 1}.")      # any expression works
print(f"Cost: ${cost:.4f}")                     # 4 decimal places
print(f"Tokens: {tokens:,}")                    # thousands separator
print(f"Accuracy: {0.9372:.1%}")                # as a percentage
print(f"|{name:<10}|{name:^10}|{name:>10}|")    # left / center / right align in 10 chars
print(f"{tokens=}")                             # debug: shows name AND value
```

| Format spec | Meaning | `f"{x:...}"` with `x = 1234.5678` |
|---|---|---|
| `.2f` | 2 decimals | `1234.57` |
| `,` | thousands commas | `1,234.5678` |
| `,.0f` | commas, no decimals | `1,235` |
| `.1%` | percent | `123456.8%` |
| `>10` | right-align in 10 spaces | `' 1234.5678'` |
| `e` | scientific | `1.234568e+03` |

## Building prompts with strings

This is where strings meet AI. A **prompt template** is a string with blanks you fill in.

```python run level=intermediate
def build_prompt(document: str, question: str, style: str = "simple") -> str:
    return f"""You are a careful assistant. Answer ONLY using the document.

<document>
{document.strip()}
</document>

Question: {question.strip()}
Answer in a {style} style. If the answer is not in the document, say "I don't know"."""

doc = """
Python was created by Guido van Rossum and first released in 1991.
It is the most popular language for machine learning.
"""
prompt = build_prompt(doc, "  Who created Python?  ")
print(prompt)
print("\nPrompt length:", len(prompt), "characters")
```

:::tip XML-style tags in prompts
Wrapping pieces of a prompt in tags like `<document>…</document>` helps models like Claude tell your instructions apart from the data. It is a widely recommended prompting technique.
:::

### Templates with .format() and string.Template

You will also see older styles in real code. Know how to read them:

```python run level=intermediate
template = "Translate to {language}: {text}"
print(template.format(language="French", text="Good morning"))

# Reusable template filled later (good when the template is stored in a file)
from string import Template
t = Template("Summarize this $kind in $n bullet points.")
print(t.substitute(kind="article", n=3))

# Old %-style (still in some libraries' logging)
print("%s scored %.1f%%" % ("model-a", 87.25))
```

:::warn Curly braces in f-strings
To put a literal `{` or `}` inside an f-string or `.format()` template, double it: `{{` and `}}`. This matters when your prompt contains JSON examples!
:::

```python run level=intermediate
field = "sentiment"
print(f'Return JSON like {{"{field}": "positive"}}')
```

## Cleaning text — a real preprocessing step

Before sending documents to a model or an embedding API, you usually clean them:

```python run level=intermediate
raw_doc = """

   Machine   learning  is a field of   AI.\t\t
It learns patterns   from DATA.


"""

# 1) collapse all runs of whitespace into a single space
clean = " ".join(raw_doc.split())
print(repr(clean))

# 2) normalize case for search / comparison
print(clean.lower())

# 3) simple word statistics
words = clean.lower().replace(".", "").split()
print("word count:", len(words))
print("unique words:", len(set(words)))
print("longest word:", max(words, key=len))
```

## Characters, Unicode and bytes (advanced)

Modern text includes emoji and every human language. Python strings are **Unicode**, so this all just works — but models and files deal in **bytes**.

:::def Unicode
A standard that gives every character in every language a number (a "code point"). `ord("A")` gives `65`; `chr(65)` gives `"A"`.
:::

:::def Encoding (UTF-8)
The rule for turning text into bytes for storage or sending over the network. UTF-8 is the universal default. `"é".encode("utf-8")` gives 2 bytes.
:::

```python run level=advanced
text = "AI 🤖 café"
print(len(text), "characters")
data = text.encode("utf-8")
print(len(data), "bytes:", data)
print(data.decode("utf-8"))

print([ord(c) for c in "AI"])
print(chr(129302))
```

:::ai Why bytes matter for LLMs
LLM tokenizers (like the BPE tokenizer you will build in the Project Lab) often work on **UTF-8 bytes**, not characters. That is why one emoji can cost several tokens, and why non-English text often uses more tokens than English.
:::

## Check yourself

```quiz
? What is `"machine"[1:4]`?
- "mach"
+ "ach"
- "achi"
> Start at index 1 ("a") and stop before index 4, giving positions 1, 2, 3.

? What does `" ".join(["a", "b", "c"])` return?
+ "a b c"
- ["a b c"]
- "abc"
> join glues list items together using the string before the dot as the glue.

? What does `f"{0.4567:.1%}"` show?
- 0.5
+ 45.7%
- 0.46%
> `%` multiplies by 100 and adds a percent sign; `.1` keeps one decimal.

? Strings are immutable. What does that mean?
- They cannot be printed
+ You cannot change a string in place — methods return a new string
- They cannot contain numbers
> `s.upper()` does not change `s`. You must store the result: `s = s.upper()`.
```

:::exercise Chat message formatter
Given `role = "assistant"`, `content = "  Hello! How can I help you today?  "` and `tokens = 9`, print exactly:

```text
[ASSISTANT] Hello! How can I help you today? (9 tokens, 32 chars)
```
Use `.upper()`, `.strip()`, `len()` and one f-string.
:::

:::solution
```python run
role = "assistant"
content = "  Hello! How can I help you today?  "
tokens = 9

clean = content.strip()
print(f"[{role.upper()}] {clean} ({tokens} tokens, {len(clean)} chars)")
```
:::

:::keypoints
- Strings hold text; index from **0**, slice with `[start:stop]` (stop is excluded).
- Methods like `.strip()`, `.lower()`, `.split()`, `.replace()` and `"sep".join()` return **new** strings.
- **f-strings** (`f"{x:.2f}"`) are the modern way to format and build prompts.
- Double the braces (`{{ }}`) to show literal braces — important for JSON in prompts.
- Text is Unicode; files and tokenizers often work with UTF-8 **bytes**.
:::
