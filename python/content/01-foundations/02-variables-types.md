---
title: Variables & Data Types
level: easy
time: 18
summary: Store values with names, and meet Python's basic types — int, float, str, bool and None — plus how to convert between them.
---

Every AI program is full of values: a temperature setting of `0.7`, a model name like `"claude-opus-5-5"`, a token count of `1500`, a flag like `stream=True`. To work with values, we give them **names**.

## Variables: names for values

:::def Variable
A **name** that points to a value stored in memory. You create one with `=`. Later, whenever you use the name, Python uses the value.
:::

:::syntax
```python
name = value
```
Read `=` as **"is set to"**, not "equals". `x = 5` means "x is set to 5".
:::

```python run level=easy
model = "claude-opus-5-5"
temperature = 0.7
max_tokens = 1024

print(model)
print(temperature)
print("Budget:", max_tokens, "tokens")
```

:::analogy
A variable is like a **sticky label** you put on a box. The box holds the value. You can move the label to a different box at any time — that is "reassigning" the variable.
:::

Variables can change. The newest assignment wins:

```python run level=easy
score = 10
print(score)

score = score + 5     # take the old value, add 5, store it back
print(score)

score += 5            # shortcut for: score = score + 5
print(score)
```

:::tip Shortcut operators
`x += 1` means `x = x + 1`. The same works for `-=`, `*=`, `/=`. You will see `total += loss` in every training loop.
:::

### Naming rules

| Rule | Good | Bad |
|---|---|---|
| Letters, numbers, underscores only | `learning_rate` | `learning-rate` |
| Cannot start with a number | `layer2` | `2layer` |
| Case-sensitive | `Model` ≠ `model` | |
| Not a Python keyword | `class_name` | `class` |

:::def snake_case
The Python style for names: all lowercase, words joined with underscores, like `max_tokens` or `train_test_split`. Constants (values that never change) use `UPPER_CASE`, like `MAX_RETRIES = 3`.
:::

## The basic data types

Every value has a **type**. The type decides what you can do with it.

:::def Data type
The **kind** of a value — whole number, decimal, text, true/false, and so on. Check any value's type with `type(value)`.
:::

| Type | Name | Example | Used in AI for… |
|---|---|---|---|
| `int` | integer (whole number) | `42`, `-3`, `1_000_000` | token counts, epochs, batch sizes |
| `float` | floating-point (decimal) | `0.7`, `3.14`, `1e-4` | temperatures, learning rates, probabilities |
| `str` | string (text) | `"hello"`, `'claude'` | prompts, model names, documents |
| `bool` | boolean | `True`, `False` | flags like `stream=True` |
| `NoneType` | nothing | `None` | "no value yet", optional settings |

```python run level=easy
print(type(42))
print(type(0.7))
print(type("hello"))
print(type(True))
print(type(None))
```

### Numbers: int and float

```python run level=easy
epochs = 10                 # int
learning_rate = 3e-4        # float — scientific notation: 3 × 10⁻⁴ = 0.0003
big = 1_000_000             # underscores make big numbers readable

print(learning_rate)
print(big)
print(10 / 4)               # / always gives a float
print(10 // 4)              # // gives an int (when both are ints)
print(round(3.14159, 2))    # round to 2 decimal places
print(abs(-7), max(3, 9, 2), min(3, 9, 2))
```

:::warn Floats are not exact
Computers store decimals in binary, so tiny rounding errors happen: `0.1 + 0.2` gives `0.30000000000000004`. Never compare floats with `==`. Use `math.isclose(a, b)` or round first.
:::

```python run level=intermediate
import math

print(0.1 + 0.2)
print(0.1 + 0.2 == 0.3)               # False!
print(math.isclose(0.1 + 0.2, 0.3))   # True — the safe way
```

### Booleans: True and False

:::def Boolean
A value that is either `True` or `False` (capital T and F). Comparisons like `5 > 3` produce booleans.
:::

```python run level=easy
tokens_used = 1800
limit = 2000

over_limit = tokens_used > limit
print(over_limit)
print(tokens_used <= limit)
print(tokens_used == 1800)    # == checks equality (one = is assignment!)
print(tokens_used != 1800)    # != means "not equal"

# Combine with and / or / not
is_premium = True
print(is_premium and not over_limit)
```

| Operator | Meaning | Example → result |
|---|---|---|
| `==` | equal | `3 == 3` → `True` |
| `!=` | not equal | `3 != 4` → `True` |
| `>` `<` `>=` `<=` | greater / less | `5 >= 5` → `True` |
| `and` | both true | `True and False` → `False` |
| `or` | at least one true | `True or False` → `True` |
| `not` | flip | `not True` → `False` |

### None: the "nothing" value

```python run level=easy
api_response = None          # nothing yet

print(api_response)
print(api_response is None)  # use "is" to check for None

api_response = "Paris is the capital of France."
print(api_response is None)
```

:::tip
Always check `None` with `is None` / `is not None`, not `== None`. It is faster and always correct.
:::

## Converting between types

Data from users, files and APIs often arrives as **text**, even when it looks like a number. Convert it before doing math.

:::def Type conversion (casting)
Turning a value of one type into another, using the type's name as a function: `int("42")`, `float("0.7")`, `str(100)`, `bool(0)`.
:::

```python run level=easy
user_input = "25"            # text, not a number!
print(user_input + "5")      # joins text: "255"
print(int(user_input) + 5)   # math: 30

print(float("0.7") * 2)
print(str(1024) + " tokens")
print(int(3.99))             # int() cuts off the decimal — does NOT round
```

### Truthiness — what counts as True?

When Python needs a yes/no answer, it can treat **any** value as true or false.

```python run level=intermediate
for value in [0, 1, -5, 0.0, "", "hi", None, [], [0]]:
    print(repr(value).ljust(6), "->", bool(value))
```

:::def Falsy
Values that act like `False`: `0`, `0.0`, `""` (empty text), `None`, and empty collections like `[]` and `{}`. Everything else is **truthy**.
:::

This lets you write short checks like `if response:` — "if the response is not empty".

## Multiple assignment and swapping

```python run level=intermediate
# assign several at once
input_tokens, output_tokens = 1200, 350
print(input_tokens, output_tokens)

# swap without a temporary variable
a, b = 1, 2
a, b = b, a
print(a, b)

# same value to many names
x = y = z = 0
print(x, y, z)
```

## Constants and type hints (a preview)

Python lets you add a **type hint** after a name. It does not change how the code runs — it documents your intent and lets your editor catch mistakes.

```python run level=intermediate
MODEL_NAME: str = "claude-opus-5-5"
MAX_TOKENS: int = 16000
TEMPERATURE: float = 0.3
STREAM: bool = True

# A tiny cost estimate, like you would do before calling an LLM API
INPUT_PRICE_PER_MILLION = 4.00    # dollars per 1M input tokens
OUTPUT_PRICE_PER_MILLION = 20.00  # dollars per 1M output tokens

input_tokens = 12_500
output_tokens = 800
cost = (input_tokens * INPUT_PRICE_PER_MILLION + output_tokens * OUTPUT_PRICE_PER_MILLION) / 1_000_000
print(f"Estimated cost: ${cost:.4f}")
```

The `f"..."` text with `{cost:.4f}` is an **f-string** — you will master it in the next lesson.

:::ai
Every LLM API call is configured with plain variables of these types: `model` (str), `max_tokens` (int), `temperature` (float), `stream` (bool), `system` (str or `None`). Getting the type wrong — like sending `"0.7"` as text instead of `0.7` — is one of the most common bugs.
:::

## Check yourself

```quiz
? What does `x = x + 1` do?
- Checks whether x equals x + 1
+ Takes x's current value, adds 1, and stores the result back in x
- Causes an error
> `=` means "is set to". The right side is calculated first, then stored.

? What is `type(3.0)`?
- int
+ float
- str
> Any number with a decimal point is a float, even if the decimal part is zero.

? What does `int("7") + 3` give?
+ 10
- "73"
- An error
> `int("7")` converts the text to the number 7, then 7 + 3 = 10.

? Which of these is falsy?
- "False"
- [0]
+ ""
> An empty string is falsy. `"False"` is a non-empty string, so it is truthy!
```

:::exercise Token budget calculator
You have a budget of **$5**. Input tokens cost **$4 per million** and output tokens cost **$20 per million**. Each request uses **2,000 input tokens** and **500 output tokens**.

Write code that calculates:
1. the cost of one request
2. how many **whole** requests you can afford (hint: `//`)
:::

:::solution
```python run
budget = 5.00
input_price = 4.00 / 1_000_000     # dollars per token
output_price = 20.00 / 1_000_000

cost_per_request = 2_000 * input_price + 500 * output_price
requests = int(budget // cost_per_request)

print("Cost per request:", round(cost_per_request, 5))
print("Requests you can afford:", requests)
```
:::

:::keypoints
- A **variable** is a name for a value: `name = value`.
- Basic types: `int`, `float`, `str`, `bool`, `None`. Check with `type()`.
- Convert with `int()`, `float()`, `str()`, `bool()` — input from users and files is usually text.
- Never compare floats with `==`; use `math.isclose()`.
- Use `snake_case` for names and `UPPER_CASE` for constants.
:::
