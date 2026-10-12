---
title: Data Cleaning & Feature Engineering
level: intermediate
time: 30
summary: Real data is messy. Handle missing values, duplicates, outliers and wrong types; scale numbers, encode categories, and avoid data leakage — the unglamorous work that decides model quality.
---

"Garbage in, garbage out." A brilliant model trained on dirty data gives bad results; a simple model on clean data often wins. Data scientists famously spend most of their time here. This lesson is your cleaning checklist.

:::def Data cleaning
Fixing or removing incorrect, missing, duplicated or badly formatted data before analysis or training.
:::

:::def Feature
One measurable input property used by a model — like `age`, `price`, `number_of_words`. **Feature engineering** is creating better features from raw data.
:::

## A messy dataset

```python run level=easy
import pandas as pd
import numpy as np

raw = pd.DataFrame({
    "user_id":  [1, 2, 2, 3, 4, 5, 6, 7],
    "age":      [25, None, None, 41, 230, 33, 19, None],
    "country":  ["IN", "us", "us", "US ", "in", None, "UK", "uk"],
    "plan":     ["pro", "free", "free", "team", "pro", "free", "pro", "free"],
    "spend":    ["12.5", "0", "0", "99", "15.0", "n/a", "20", "0"],
    "signup":   ["2026-01-03", "2026-01-05", "2026-01-05", "2026-02-11", "2026-03-01", "2026-03-04", "bad date", "2026-03-09"],
})
print(raw)
print(raw.dtypes)
print("\nmissing per column:\n", raw.isna().sum())
```

## Step 1 — duplicates

```python run level=easy
import pandas as pd

raw = pd.DataFrame({"user_id": [1, 2, 2, 3], "plan": ["pro", "free", "free", "team"]})
print("duplicate rows:", raw.duplicated().sum())
clean = raw.drop_duplicates()                              # exact duplicates
clean = clean.drop_duplicates(subset=["user_id"], keep="first")   # same id = same user
print(clean)
```

## Step 2 — fix types and formats

```python run level=intermediate
import pandas as pd

df = pd.DataFrame({
    "country": ["IN", "us", "US ", "in", None, "UK", "uk"],
    "spend":   ["12.5", "0", "99", "15.0", "n/a", "20", "0"],
    "signup":  ["2026-01-03", "2026-01-05", "2026-02-11", "2026-03-01", "2026-03-04", "bad date", "2026-03-09"],
})

df["country"] = df["country"].str.strip().str.upper()                 # " us" -> "US"
df["spend"] = pd.to_numeric(df["spend"], errors="coerce")             # "n/a" -> NaN instead of crashing
df["signup"] = pd.to_datetime(df["signup"], errors="coerce")          # "bad date" -> NaT
print(df)
print(df.dtypes)
```

:::def NaN / NaT
"Not a Number" / "Not a Time" — pandas' markers for **missing** numeric and date values. `None` in a numeric column becomes `NaN`. Check with `.isna()`.
:::

## Step 3 — missing values

There is no single right answer. Choose per column:

| Strategy | When | Code |
|---|---|---|
| drop rows | few rows missing, plenty of data | `df.dropna(subset=["col"])` |
| fill with a constant | "missing" has a meaning | `df["col"].fillna("unknown")` |
| fill with median/mean | numeric, roughly random gaps | `df["col"].fillna(df["col"].median())` |
| forward-fill | time series | `df["col"].ffill()` |
| add a "was missing" flag | missingness itself is informative | `df["col_missing"] = df["col"].isna()` |

```python run level=intermediate
import pandas as pd

df = pd.DataFrame({
    "age": [25, None, 41, 33, 19, None],
    "country": ["IN", "US", None, "UK", "UK", "IN"],
    "spend": [12.5, 0, 99, None, 20, 0],
})

df["age_missing"] = df["age"].isna().astype(int)        # keep the information!
df["age"] = df["age"].fillna(df["age"].median())
df["country"] = df["country"].fillna("UNKNOWN")
df = df.dropna(subset=["spend"])                        # can't trust rows without spend
print(df)
print("missing left:", int(df.isna().sum().sum()))
```

:::warn Assign the result
In modern pandas, write `df["age"] = df["age"].fillna(...)`. Older code often uses `df["age"].fillna(..., inplace=True)`, which no longer reliably changes `df` (pandas 3 uses copy-on-write).
:::

## Step 4 — outliers

:::def Outlier
A value far outside the normal range — like an age of 230. It may be a typo or a genuine rare case. Outliers can badly distort averages and some models.
:::

```python run level=intermediate
import pandas as pd

ages = pd.Series([25, 31, 41, 230, 33, 19, 28, 35, -4])

q1, q3 = ages.quantile(0.25), ages.quantile(0.75)
iqr = q3 - q1                                        # interquartile range
low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
print(f"normal range: {low:.1f} .. {high:.1f}")
print("outliers:", ages[(ages < low) | (ages > high)].tolist())

valid = ages.where(ages.between(0, 120))             # impossible values -> NaN
print("after sanity rule:", valid.tolist())
print("clipped:", ages.clip(0, 100).tolist())        # or cap them
```

## Feature engineering

### Scaling numbers

Many models (neural nets, k-NN, logistic regression) learn badly when features have very different ranges, like `age` (0–100) and `income` (0–1,000,000).

:::def Standardization (z-score)
Rescale a feature to mean 0 and standard deviation 1: `(x − mean) / std`.
:::

:::def Min-max normalization
Rescale a feature into the range [0, 1]: `(x − min) / (max − min)`.
:::

```python run level=intermediate
import numpy as np

income = np.array([20_000, 35_000, 50_000, 120_000, 1_000_000], dtype=float)

z = (income - income.mean()) / income.std()
minmax = (income - income.min()) / (income.max() - income.min())
log = np.log1p(income)                         # tames very skewed values

print("z-score:", z.round(2))
print("min-max:", minmax.round(3))
print("log1p:  ", log.round(2))
```

### Encoding categories

Models need numbers, not words like `"pro"` or `"UK"`.

```python run level=intermediate
import pandas as pd

df = pd.DataFrame({"plan": ["free", "pro", "team", "pro"], "size": ["S", "L", "M", "S"]})

one_hot = pd.get_dummies(df["plan"], prefix="plan", dtype=int)        # one column per category
print(one_hot)

order = {"S": 0, "M": 1, "L": 2}                                      # ordinal: categories with an order
df["size_code"] = df["size"].map(order)
print(df)
```

:::def One-hot encoding
Turning a category column into several 0/1 columns, one per category. "pro" becomes `plan_free=0, plan_pro=1, plan_team=0`. It avoids implying a false order between categories.
:::

### Creating new features

```python run level=intermediate
import pandas as pd

df = pd.DataFrame({
    "signup": pd.to_datetime(["2026-01-03", "2026-02-14", "2026-03-09"]),
    "last_active": pd.to_datetime(["2026-09-30", "2026-03-01", "2026-09-28"]),
    "messages": [340, 12, 95],
    "review": ["Amazing!! Best tool ever", "meh", "Useful for RAG, a bit slow"],
})

df["days_active"] = (df["last_active"] - df["signup"]).dt.days
df["msgs_per_day"] = (df["messages"] / df["days_active"]).round(2)
df["signup_month"] = df["signup"].dt.month
df["review_len"] = df["review"].str.len()
df["exclamations"] = df["review"].str.count("!")
df.drop(columns=["signup", "last_active"])
```

## Train / test split and data leakage

:::def Data leakage
When information from the **test set** (or from the future) sneaks into training — for example, computing the mean for scaling on **all** the data before splitting. The model looks great in testing, then fails in the real world.
:::

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
X = rng.normal(50, 10, size=(100, 1))

# ✗ leaky: statistics computed on ALL rows, including future test rows
X_leaky = (X - X.mean()) / X.std()

# ✓ correct: split first, learn scaling ONLY from training data, apply to both
idx = rng.permutation(len(X))
train_idx, test_idx = idx[:80], idx[80:]
mu, sigma = X[train_idx].mean(), X[train_idx].std()
X_train = (X[train_idx] - mu) / sigma
X_test = (X[test_idx] - mu) / sigma        # same mu/sigma — never refit on test

print(f"train mean {X_train.mean():+.3f}, test mean {X_test.mean():+.3f} (not exactly 0 — and that's honest)")
```

scikit-learn's **Pipelines** (next module) make doing this correctly automatic.

## Cleaning text data for LLM work

```python run level=advanced
import pandas as pd
import hashlib
import re

docs = pd.DataFrame({"text": [
    "Contact me at ada@example.com for the report.",
    "contact me at  ada@example.com for the report. ",
    "Short",
    "<p>RAG uses retrieval</p> to ground answers.",
    "Agents call tools in a loop until done.",
    "",
]})

def normalize(t: str) -> str:
    t = re.sub(r"<[^>]+>", " ", t)                       # strip HTML
    t = re.sub(r"[\w.+-]+@[\w-]+\.\w+", "[EMAIL]", t)    # mask PII
    return " ".join(t.split())

docs["clean"] = docs["text"].map(normalize)
docs["fingerprint"] = docs["clean"].str.lower().map(lambda t: hashlib.md5(t.encode()).hexdigest()[:8])
docs = docs[docs["clean"].str.split().str.len() >= 3]               # drop near-empty docs
docs = docs.drop_duplicates(subset="fingerprint")                   # drop near-duplicates
print(docs[["clean", "fingerprint"]].to_string(index=False))
```

:::ai
Training and fine-tuning datasets for LLMs go through the same steps at huge scale: **deduplication** (exact and near-duplicate), **quality filtering** (length, language, junk), **PII removal**, and **formatting** into JSONL. RAG pipelines also clean and dedupe documents before chunking.
:::

## The cleaning checklist

:::keypoints
- Look first: `shape`, `dtypes`, `isna().sum()`, `duplicated().sum()`, `describe()`.
- Fix types with `pd.to_numeric(errors="coerce")` / `pd.to_datetime(errors="coerce")`; normalize text.
- Handle missing values per column: drop, fill (median/constant), or flag.
- Detect outliers with the IQR rule or sanity limits; clip or remove.
- Scale numbers, one-hot encode categories, engineer useful features.
- **Split before fitting anything** to avoid data leakage.
:::

## Check yourself

```quiz
? `pd.to_numeric(["1", "n/a"], errors="coerce")` gives…
+ [1.0, NaN]
- An error
- [1, "n/a"]
> coerce turns unparseable values into NaN.

? Why add an `age_missing` flag before filling ages with the median?
+ Because the fact that a value was missing can itself be useful information
- Pandas requires it
- To make the median correct
> Missingness often carries signal (e.g. users who skip a field).

? You compute the mean and std on the whole dataset, then split into train/test. What's the problem?
+ Data leakage — test information influenced the training preprocessing
- Nothing
- The mean will be wrong
> Fit preprocessing on the training set only, then apply it to the test set.

? Which encoding suits "plan" with values free/pro/team (no natural order)?
+ One-hot encoding
- Ordinal encoding 0/1/2
- Leave as text
> Ordinal codes would imply team > pro > free, which isn't meaningful.
```

:::exercise Clean this dataset
Clean `raw` below: strip and title-case `name`, convert `score` to numbers (bad values → NaN), fill missing scores with the median, drop duplicate names (keep first), and add `score_z` (z-score of score). Print the result.

```python
raw = pd.DataFrame({
    "name": [" ada", "alan ", "Ada", "grace", "linus"],
    "score": ["90", "85", "88", "oops", None],
})
```
:::

:::solution
```python run
import pandas as pd

raw = pd.DataFrame({
    "name": [" ada", "alan ", "Ada", "grace", "linus"],
    "score": ["90", "85", "88", "oops", None],
})
df = raw.copy()
df["name"] = df["name"].str.strip().str.title()
df["score"] = pd.to_numeric(df["score"], errors="coerce")
df["score"] = df["score"].fillna(df["score"].median())
df = df.drop_duplicates(subset="name", keep="first")
df["score_z"] = ((df["score"] - df["score"].mean()) / df["score"].std()).round(3)
print(df)
```
:::
