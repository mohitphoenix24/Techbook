---
title: Pandas Essentials
level: intermediate
time: 35
summary: Spreadsheets in Python. Load, explore, filter, sort, group and join tabular data with DataFrames — the everyday tool for datasets, evaluation results and LLM usage logs.
---

Most real data comes as **tables**: rows of examples, columns of features. Pandas lets you load a table, look at it, clean it, and summarize it in a few lines. You will use it for training data, evaluation results, cost reports and much more.

:::def DataFrame
A 2-D table with **labelled columns** (each with its own type) and an **index** labelling the rows. Think of a spreadsheet you control with code.
:::

:::def Series
A single column of a DataFrame: a 1-D array of values with an index. `df["price"]` gives you a Series.
:::

:::tip Tables on this page
When the **last line** of a code block is just a DataFrame (like `df.head()`), this page shows it as a nice table — the same way Jupyter notebooks do.
:::

## Creating a DataFrame

```python run level=easy
import pandas as pd

df = pd.DataFrame({
    "model":      ["opus", "sonnet", "haiku", "opus", "haiku", "sonnet"],
    "task":       ["summarize", "classify", "classify", "code", "extract", "summarize"],
    "latency_ms": [2100, 850, 320, 3400, 410, 990],
    "tokens":     [1500, 300, 280, 4200, 650, 1300],
    "correct":    [True, True, False, True, True, False],
})
df
```

```python run level=easy
import pandas as pd

df = pd.DataFrame({
    "model":      ["opus", "sonnet", "haiku", "opus", "haiku", "sonnet"],
    "latency_ms": [2100, 850, 320, 3400, 410, 990],
    "tokens":     [1500, 300, 280, 4200, 650, 1300],
})
print(df.shape)            # (rows, columns)
print(df.columns.tolist())
print(df.dtypes)
print(df.head(3))          # first rows
df.describe()              # quick statistics for numeric columns
```

## Loading and saving data

```python run level=easy
import pandas as pd
from pathlib import Path

Path("reviews.csv").write_text("""text,stars,date
Loved the course,5,2026-01-03
Too fast for me,2,2026-01-05
Great examples,5,2026-01-09
Okay I guess,3,2026-02-11
""")

df = pd.read_csv("reviews.csv", parse_dates=["date"])
print(df)
print(df.dtypes)

df.to_json("reviews.jsonl", orient="records", lines=True)    # JSONL!
print(Path("reviews.jsonl").read_text())
print(pd.read_json("reviews.jsonl", lines=True).shape)
```

| Read | Write |
|---|---|
| `pd.read_csv("f.csv")` | `df.to_csv("f.csv", index=False)` |
| `pd.read_json("f.jsonl", lines=True)` | `df.to_json("f.jsonl", orient="records", lines=True)` |
| `pd.read_parquet("f.parquet")` | `df.to_parquet("f.parquet")` |
| `pd.read_excel("f.xlsx")` | `df.to_excel("f.xlsx")` |
| `pd.DataFrame(list_of_dicts)` | `df.to_dict(orient="records")` |

## Selecting columns and rows

:::syntax
```python
df["col"]                    # one column (Series)
df[["col1", "col2"]]         # several columns (DataFrame)
df.loc[row_labels, cols]     # select by LABEL
df.iloc[row_positions, cols] # select by POSITION
df[df["col"] > 5]            # filter rows with a condition
```
:::

```python run level=easy
import pandas as pd

df = pd.DataFrame({
    "model": ["opus", "sonnet", "haiku", "opus", "haiku", "sonnet"],
    "task": ["summarize", "classify", "classify", "code", "extract", "summarize"],
    "latency_ms": [2100, 850, 320, 3400, 410, 990],
    "correct": [True, True, False, True, True, False],
})

print(df["latency_ms"].mean())
print(df[["model", "latency_ms"]].head(2))
print(df.iloc[0])                       # first row (by position)
print(df.iloc[-2:, :2])                 # last 2 rows, first 2 columns
print(df.loc[df["model"] == "haiku", ["task", "latency_ms"]])
```

### Filtering

```python run level=easy
import pandas as pd

df = pd.DataFrame({
    "model": ["opus", "sonnet", "haiku", "opus", "haiku", "sonnet"],
    "task": ["summarize", "classify", "classify", "code", "extract", "summarize"],
    "latency_ms": [2100, 850, 320, 3400, 410, 990],
    "correct": [True, True, False, True, True, False],
})

fast = df[df["latency_ms"] < 1000]
print(fast)

# combine conditions with & (and), | (or), ~ (not) — and wrap each in brackets!
print(df[(df["model"] == "opus") & (df["correct"])])
print(df[df["task"].isin(["code", "extract"])])
print(df.query("latency_ms > 900 and model != 'opus'"))
```

:::warn Use & and |, not and / or
`df[df.a > 1 and df.b < 5]` raises an error. Write `df[(df.a > 1) & (df.b < 5)]` — with the brackets, because `&` binds tighter than `>`.
:::

## Adding and changing columns

```python run level=intermediate
import pandas as pd

df = pd.DataFrame({
    "model": ["opus", "sonnet", "haiku"],
    "input_tokens": [12000, 3000, 2500],
    "output_tokens": [800, 400, 150],
})
price_in = {"opus": 4.00, "sonnet": 2.00, "haiku": 1.00}     # $ per 1M input tokens
price_out = {"opus": 20.00, "sonnet": 10.00, "haiku": 5.00}  # $ per 1M output tokens

df["total_tokens"] = df["input_tokens"] + df["output_tokens"]         # vectorized math
df["cost_usd"] = (df["input_tokens"] * df["model"].map(price_in)
                  + df["output_tokens"] * df["model"].map(price_out)) / 1e6
df["size"] = df["total_tokens"].apply(lambda n: "big" if n > 5000 else "small")
df = df.rename(columns={"size": "request_size"})
df.loc[df["model"] == "haiku", "note"] = "cheapest"                   # set by condition
df.sort_values("cost_usd", ascending=False)
```

:::def Vectorized column operation
Math on whole columns at once (`df["a"] + df["b"]`) instead of looping over rows. It is much faster than `.apply` or a Python loop — prefer it whenever possible.
:::

## Sorting, counting, unique values

```python run level=intermediate
import pandas as pd

df = pd.DataFrame({
    "model": ["opus", "sonnet", "haiku", "opus", "haiku", "sonnet", "haiku"],
    "task": ["summarize", "classify", "classify", "code", "extract", "summarize", "classify"],
    "latency_ms": [2100, 850, 320, 3400, 410, 990, 300],
})
print(df.sort_values(["model", "latency_ms"], ascending=[True, False]))
print(df["model"].value_counts())
print(df["task"].unique().tolist(), df["task"].nunique())
print(df.nlargest(2, "latency_ms"))
```

## groupby — split, apply, combine

:::def groupby
Split the rows into groups by one or more columns, compute something for each group (mean, count, sum…), and combine the results into a new table. It is SQL's `GROUP BY`, and the most powerful pandas tool.
:::

```python run level=intermediate
import pandas as pd

df = pd.DataFrame({
    "model": ["opus", "sonnet", "haiku", "opus", "haiku", "sonnet", "haiku", "opus"],
    "task": ["summarize", "classify", "classify", "code", "extract", "summarize", "classify", "code"],
    "latency_ms": [2100, 850, 320, 3400, 410, 990, 300, 2900],
    "correct": [True, True, False, True, True, False, True, True],
})

print(df.groupby("model")["latency_ms"].mean())

summary = df.groupby("model").agg(
    calls=("task", "count"),
    avg_latency=("latency_ms", "mean"),
    p_max=("latency_ms", "max"),
    accuracy=("correct", "mean"),          # mean of True/False = fraction True
).sort_values("accuracy", ascending=False)
summary.round(2)
```

```python run level=intermediate
import pandas as pd

df = pd.DataFrame({
    "model": ["opus", "sonnet", "haiku", "opus", "haiku", "sonnet", "haiku", "opus"],
    "task": ["summarize", "classify", "classify", "code", "extract", "summarize", "classify", "code"],
    "correct": [True, True, False, True, True, False, True, True],
})
# Accuracy for every model × task combination, as a grid
pd.pivot_table(df, index="model", columns="task", values="correct", aggfunc="mean")
```

## Joining tables

```python run level=intermediate
import pandas as pd

answers = pd.DataFrame({"question_id": [1, 2, 3, 4], "answer": ["Paris", "4", "Blue", "1991"]})
gold = pd.DataFrame({"question_id": [1, 2, 3, 5], "expected": ["Paris", "4", "Red", "Tokyo"]})

merged = answers.merge(gold, on="question_id", how="inner")     # only ids in both
merged["correct"] = merged["answer"] == merged["expected"]
print(merged)
print("accuracy:", merged["correct"].mean())

print(answers.merge(gold, on="question_id", how="outer", indicator=True))   # see what's missing where
print(pd.concat([answers, answers], ignore_index=True).shape)              # stack rows
```

| `how=` | Keeps |
|---|---|
| `"inner"` | only keys in **both** tables |
| `"left"` | all keys from the left table |
| `"right"` | all keys from the right table |
| `"outer"` | all keys from either table |

## Text columns with .str

```python run level=intermediate
import pandas as pd

df = pd.DataFrame({"text": ["  Loved it!!  ", "TERRIBLE support", "ok", "Great RAG demo, great docs"]})
df["clean"] = df["text"].str.strip().str.lower()
df["n_words"] = df["clean"].str.split().str.len()
df["mentions_great"] = df["clean"].str.contains("great")
df["first_word"] = df["clean"].str.extract(r"^(\w+)", expand=False)
df
```

## Dates and time series

```python run level=advanced
import pandas as pd
import numpy as np

rng = np.random.default_rng(0)
logs = pd.DataFrame({
    "ts": pd.date_range("2026-09-01", periods=14 * 24, freq="h"),
    "tokens": rng.integers(100, 3000, size=14 * 24),
})
logs["day"] = logs["ts"].dt.date
logs["weekday"] = logs["ts"].dt.day_name()

daily = logs.set_index("ts")["tokens"].resample("D").sum()
print(daily.head())
print("busiest weekday:", logs.groupby("weekday")["tokens"].sum().idxmax())
print("7-day rolling mean (last 3 days):")
print(daily.rolling(7).mean().tail(3).round(0))
```

## From DataFrame to model input

Pandas is usually the last stop before the numbers go into a model:

```python run level=advanced
import pandas as pd

df = pd.DataFrame({
    "text": ["great course", "bad audio", "loved it", "meh"],
    "plan": ["pro", "free", "pro", "team"],
    "minutes": [120, 15, 300, 40],
    "label": ["pos", "neg", "pos", "neg"],
})

X = pd.get_dummies(df[["plan", "minutes"]], columns=["plan"], dtype=int)   # one-hot encode categories
y = (df["label"] == "pos").astype(int)
print(X)
print("X as NumPy:", X.to_numpy().shape, "| y:", y.to_numpy())
records = df[["text", "label"]].to_dict(orient="records")   # e.g. to build few-shot prompts
print(records[:2])
```

:::ai
- **Evaluation**: a DataFrame of `question, answer, expected, score` → `groupby` model or prompt version.
- **Cost tracking**: load JSONL logs → total tokens and cost per day, per user, per feature.
- **Datasets**: clean and filter training examples before fine-tuning; export to JSONL.
- **Few-shot prompts**: sample rows with `df.sample(n=5, random_state=0)` and format them into a prompt.
:::

## Check yourself

```quiz
? What does `df["price"]` return?
+ A Series (one column)
- A DataFrame
- A Python list
> Use `df[["price"]]` (double brackets) to get a one-column DataFrame.

? How do you keep rows where tokens > 1000 AND model is "opus"?
+ df[(df["tokens"] > 1000) & (df["model"] == "opus")]
- df[df["tokens"] > 1000 and df["model"] == "opus"]
- df.filter(tokens > 1000, model="opus")
> Use & with brackets around each condition.

? `.loc` vs `.iloc`?
+ loc selects by label; iloc selects by integer position
- They are identical
- loc is for columns, iloc for rows
> df.iloc[0] is the first row whatever its label; df.loc[0] is the row labelled 0.

? What does `df.groupby("model")["latency_ms"].mean()` give?
+ The average latency for each model
- The overall average latency
- The model with the lowest latency
> One result per group.
```

:::exercise Evaluation report
Given the eval results below, compute for each `prompt_version`: number of rows, accuracy (mean of `correct`), and average `latency_ms`. Sort by accuracy (best first) and print which version wins.

```python
data = {
    "prompt_version": ["v1", "v1", "v1", "v2", "v2", "v2", "v3", "v3", "v3"],
    "correct": [True, False, True, True, True, True, False, True, False],
    "latency_ms": [900, 1100, 950, 1200, 1300, 1250, 700, 650, 720],
}
```
:::

:::solution
```python run
import pandas as pd

data = {
    "prompt_version": ["v1", "v1", "v1", "v2", "v2", "v2", "v3", "v3", "v3"],
    "correct": [True, False, True, True, True, True, False, True, False],
    "latency_ms": [900, 1100, 950, 1200, 1300, 1250, 700, 650, 720],
}
df = pd.DataFrame(data)
report = (df.groupby("prompt_version")
            .agg(n=("correct", "size"), accuracy=("correct", "mean"), avg_latency=("latency_ms", "mean"))
            .sort_values("accuracy", ascending=False))
print(report.round(3))
print("winner:", report.index[0])
```
:::

:::keypoints
- A **DataFrame** is a table; a **Series** is one column.
- Load with `read_csv` / `read_json(lines=True)`; inspect with `head`, `shape`, `dtypes`, `describe`.
- Select with `df["col"]`, `.loc` (labels), `.iloc` (positions); filter with conditions joined by `&` / `|`.
- Create columns with vectorized math, `.map`, `.str` methods; `groupby(...).agg(...)` summarizes.
- `merge` joins tables; `pivot_table` makes grids; `to_numpy()` / `to_dict("records")` hand data onward.
:::
