---
title: Conditions & Loops
level: easy
time: 25
summary: Make decisions with if / elif / else, repeat work with for and while loops, and control loops with break and continue — the logic behind every training loop and agent loop.
---

So far our code ran straight from top to bottom. Real programs make **decisions** ("is the response too long?") and **repeat** work ("for each document, create an embedding"). That is called **control flow**.

## if, elif, else

:::def Conditional (if statement)
Code that runs **only when a condition is true**. `elif` ("else if") checks another condition, and `else` runs when nothing above matched.
:::

:::syntax
```python
if condition:
    # runs when condition is True
elif other_condition:
    # runs when the first was False and this is True
else:
    # runs when everything above was False
```
The colon `:` and the **indentation** (4 spaces) are required. Indentation is how Python knows which lines belong to the `if`.
:::

```python run level=easy
confidence = 0.83

if confidence >= 0.9:
    print("High confidence — answer directly.")
elif confidence >= 0.6:
    print("Medium confidence — answer, but add a note.")
else:
    print("Low confidence — say 'I am not sure'.")

print("This line always runs (it is not indented).")
```

:::def Indentation
The spaces at the start of a line. In Python they are **not decoration** — they define blocks of code. The standard is 4 spaces per level.
:::

:::warn
Forgetting the `:` or mixing indentation is the #1 beginner error. Your editor will indent for you after you type `:` and press Enter.
:::

### Combining conditions

```python run level=easy
tokens = 3500
max_tokens = 4096
is_streaming = True

if tokens < max_tokens and is_streaming:
    print("OK to stream")

if tokens > max_tokens or not is_streaming:
    print("Use a different approach")
else:
    print("All good")

# Python allows chained comparisons:
temperature = 0.7
if 0 <= temperature <= 1:
    print("valid temperature")
```

### One-line if (conditional expression)

:::syntax
```python
value = A if condition else B
```
:::

```python run level=easy
score = 0.42
label = "positive" if score >= 0.5 else "negative"
print(label)

items = 1
print(f"{items} item{'s' if items != 1 else ''}")
```

### match / case (pattern matching)

Python 3.10+ has `match`, a cleaner way to check one value against many options — great for handling different message or event types.

```python run level=intermediate
def handle(event):
    match event:
        case {"type": "text", "text": text}:
            print("TEXT:", text)
        case {"type": "tool_use", "name": name}:
            print("CALL TOOL:", name)
        case {"type": "error"}:
            print("Something went wrong")
        case _:
            print("unknown event", event)

handle({"type": "text", "text": "Hello!"})
handle({"type": "tool_use", "name": "get_weather", "input": {"city": "Paris"}})
handle({"type": "error"})
handle({"type": "ping"})
```

`case _:` is the "anything else" fallback. Notice how `match` can even pull values out of a dictionary (`text`, `name`).

## for loops

:::def Loop
Code that **repeats**. A `for` loop runs once for **each item** in a collection (a list, string, dict, range…). The loop variable takes each value in turn.
:::

:::syntax
```python
for item in collection:
    # do something with item
```
:::

```python run level=easy
documents = ["intro.txt", "rag.txt", "agents.txt"]

for doc in documents:
    print("Embedding", doc, "...")

for i in range(3):            # 0, 1, 2
    print("Epoch", i + 1)

for ch in "AI":
    print(ch)
```

### Accumulating results

The **accumulator pattern** — start with an empty value and build it up inside the loop — is everywhere.

```python run level=easy
prices = [0.003, 0.012, 0.0005, 0.02]

total = 0
expensive = []
for p in prices:
    total += p
    if p > 0.01:
        expensive.append(p)

print("total cost:", round(total, 4))
print("expensive calls:", expensive)
```

### A real training loop shape

Here is the skeleton of every machine-learning training loop. We fake the "loss" with a simple formula, but the structure is real:

```python run level=intermediate
epochs = 5
loss = 2.5

for epoch in range(1, epochs + 1):
    loss = loss * 0.7               # pretend the model improves
    print(f"epoch {epoch}/{epochs}  loss={loss:.3f}")
    if loss < 0.6:
        print("Target reached, stopping early!")
        break
```

## while loops

:::def while loop
A loop that keeps running **as long as** a condition stays true. Use it when you do not know in advance how many times to repeat.
:::

```python run level=easy
attempts = 0
success = False

while not success:
    attempts += 1
    print("Trying API call, attempt", attempts)
    if attempts == 3:          # pretend it works on the 3rd try
        success = True

print("Succeeded after", attempts, "attempts")
```

:::warn Infinite loops
If the condition never becomes false, the loop runs forever and the page will freeze. Always make sure something **inside** the loop moves toward stopping — or add a maximum count.
:::

## break, continue and else

| Keyword | Effect |
|---|---|
| `break` | stop the loop right now |
| `continue` | skip to the next round |
| `else` (on a loop) | runs if the loop finished **without** `break` |

```python run level=intermediate
texts = ["hello", "", "  ", "spam spam", "good doc", "STOP", "never reached"]

for t in texts:
    if t == "STOP":
        print("found STOP — breaking")
        break
    if not t.strip():
        continue              # skip empty / whitespace-only texts
    if "spam" in t:
        print("skipping spam:", t)
        continue
    print("processing:", t)
```

```python run level=advanced
def find_tool(tools, name):
    for tool in tools:
        if tool["name"] == name:
            print("found", name)
            break
    else:                       # runs only if we never hit break
        print(name, "is not a known tool")

tools = [{"name": "search"}, {"name": "calculator"}]
find_tool(tools, "calculator")
find_tool(tools, "weather")
```

## Nested loops

A loop inside a loop runs the inner loop **completely** for every round of the outer one.

```python run level=intermediate
learning_rates = [0.1, 0.01]
batch_sizes = [16, 32, 64]

for lr in learning_rates:
    for bs in batch_sizes:
        print(f"try lr={lr:<5} batch={bs}")
```

That is a tiny **grid search** — trying every combination of settings to find the best one.

## The agent loop (preview)

AI agents are just a `while` loop around an LLM: ask the model, run any tool it requests, feed the result back, repeat until it gives a final answer. Here is the shape with a fake model:

```python run level=advanced
# A fake "model" that asks for a tool once, then answers.
script = [
    {"type": "tool_use", "name": "calculator", "input": "21 * 2"},
    {"type": "final", "text": "The answer is 42."},
]

step = 0
max_steps = 5
while step < max_steps:
    reply = script[step]
    step += 1
    if reply["type"] == "tool_use":
        result = eval(reply["input"])   # (never eval untrusted input in real code!)
        print(f"step {step}: model called {reply['name']}({reply['input']}) -> {result}")
        continue
    print(f"step {step}: final answer -> {reply['text']}")
    break
else:
    print("Gave up: too many steps")
```

:::ai
- **Training loops**: `for epoch in range(epochs): for batch in data: ...`
- **Retry logic**: `while attempts < max_retries: ...`
- **Agent loops**: `while not done:` call the model, run tools, repeat.
- **Routing**: `if/elif` or `match` on the model's output type.
:::

## Check yourself

```quiz
? What does `range(2, 8, 2)` produce?
- 2, 4, 6, 8
+ 2, 4, 6
- 2, 3, 4, 5, 6, 7
> range stops before the stop value: 2, 4, 6.

? What does `continue` do inside a loop?
- Ends the loop
+ Skips the rest of this round and moves to the next item
- Restarts the loop from the beginning
> `break` ends the loop; `continue` only skips the current round.

? When does a loop's `else` block run?
- When the loop breaks
+ When the loop finishes without a break
- Never — it is a syntax error
> for/else and while/else run the else part only if no break happened.
```

:::exercise Content filter
Loop over these user messages. Skip empty ones, stop completely at `"/quit"`, flag any message containing a word from `banned`, and print the rest in uppercase.

```python
messages = ["hello", "", "buy cheap pills", "what is RAG?", "/quit", "after quit"]
banned = {"cheap", "pills"}
```
:::

:::solution
```python run
messages = ["hello", "", "buy cheap pills", "what is RAG?", "/quit", "after quit"]
banned = {"cheap", "pills"}

for msg in messages:
    if not msg:
        continue
    if msg == "/quit":
        print("bye!")
        break
    if banned & set(msg.lower().split()):
        print("FLAGGED:", msg)
        continue
    print(msg.upper())
```
:::

:::keypoints
- `if / elif / else` choose a path; the colon and 4-space indentation are required.
- `x if cond else y` is a one-line choice; `match/case` handles many shapes cleanly.
- `for` loops over items; `while` loops while a condition holds — make sure it can stop!
- `break` exits, `continue` skips, loop-`else` runs when there was no `break`.
- Training loops, retries and AI agents are all just loops.
:::
