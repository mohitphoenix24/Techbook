---
title: Code-Based Metrics — Cheap, Fast and Objective
level: intermediate
time: 50
summary: Everything you can score without another model. Exact match and normalisation, regex and containment, schema and format validity, execution-based checks (unit tests, SQL result comparison), overlap metrics (token F1, ROUGE-L, edit distance), embedding similarity, and classification metrics (precision, recall, F1, confusion matrices, calibration). What each measures, where it fails, and runnable implementations.
---

Whenever "correct" can be **computed**, compute it. Code-based scorers are free, instant, deterministic and easy to trust. Most mature eval suites are **mostly code-based checks** with a few model-judged ones layered on top. This lesson is a toolbox, from the simplest checks to the ones people misuse.

## The ladder (use the lowest rung that works)

| Rung | Scorer | Best for | Beware |
|---|---|---|---|
| 1 | **Exact match** (after normalisation) | classification, short factual answers, ids | brittle to harmless variation |
| 2 | **Containment / regex** | "mentions 30 days", "contains a citation", "no email addresses" | false passes; context |
| 3 | **Format / schema validity** | JSON, enums, required fields, length limits | validity ≠ correctness |
| 4 | **Executable checks** | code passes tests; SQL returns the right rows; math answer matches numerically | needs a sandbox and good tests |
| 5 | **Overlap metrics** (F1, ROUGE, BLEU) | extraction, QA spans, rough summary overlap | poor proxy for meaning |
| 6 | **Embedding similarity** | paraphrase-tolerant comparison to a reference | fooled by topical similarity; threshold choice |
| 7 | **LLM judge** | open-ended quality | cost, bias (next lesson) |

## Exact match, with normalisation

Raw string equality fails on `"Paris."` vs `"paris"`. Normalise before comparing: lowercase, strip punctuation and articles, collapse whitespace, canonicalise numbers and dates.

```python run title="Normalised exact match and containment" level=easy
import re, string

def normalise(s):
    s = s.lower().strip()
    s = re.sub(r"\b(a|an|the)\b", " ", s)                              # drop articles
    s = s.translate(str.maketrans("", "", string.punctuation))       # drop punctuation
    return re.sub(r"\s+", " ", s).strip()

def exact_match(pred, gold): return float(normalise(pred) == normalise(gold))

def contains_all(pred, must_include):
    return float(all(normalise(m) in normalise(pred) for m in must_include))

print(exact_match("The Eiffel Tower.", "eiffel tower"))                    # 1.0
print(exact_match("Paris, France", "Paris"))                              # 0.0: the extra word breaks exact match
print(contains_all("You have 30 days to return it.", ["30 days"]))       # 1.0
print(contains_all("Returns are accepted within a month.", ["30 days"])) # 0.0: right idea, different words -> need a judge
```

## Format and schema checks

Cheap and powerful: did the model return **valid** output? Check JSON parses, required keys exist, enums are in range, lengths and forbidden strings. These catch many production bugs.

```python run title="Format checks as scorers" level=easy
import json, re

def valid_json_with_keys(text, keys):
    try: data = json.loads(text)
    except json.JSONDecodeError: return 0.0
    return float(isinstance(data, dict) and all(k in data for k in keys))

def no_pii(text):
    return float(not re.search(r"[\w.]+@[\w.]+\.\w+|\b\d{3}[- ]?\d{3}[- ]?\d{4}\b", text))

def within_length(text, max_words): return float(len(text.split()) <= max_words)

print(valid_json_with_keys('{"category": "bug", "urgency": 3}', ["category", "urgency"]))
print(valid_json_with_keys('Sure! {"category": "bug"}', ["category"]))
print(no_pii("Contact me at priya@example.com"), no_pii("We will contact you soon."))
print(within_length("short reply", 50))
```

## Executable checks: run the output

For code, SQL, formulas and anything with an **oracle**, execute the output and compare. This is the gold standard for coding evals (HumanEval, SWE-bench use tests).

```python run title="Score generated code by running unit tests" level=intermediate
def run_unit_tests(code, tests):
    """Execute model-written code in an isolated namespace and run assertions. (Use a real sandbox in production!)"""
    ns = {}
    try:
        exec(code, ns)
    except Exception as e:
        return 0.0, f"does not run: {type(e).__name__}: {e}"
    passed = 0
    failures = []
    for call, want in tests:
        try:
            got = eval(call, ns)
            if got == want: passed += 1
            else: failures.append(f"{call} -> {got!r}, want {want!r}")
        except Exception as e:
            failures.append(f"{call} raised {type(e).__name__}")
    return passed / len(tests), failures

tests = [("is_palindrome('level')", True), ("is_palindrome('Level')", True), ("is_palindrome('abc')", False), ("is_palindrome('')", True)]
good = "def is_palindrome(s):\n    s = s.lower()\n    return s == s[::-1]"
bad  = "def is_palindrome(s):\n    return s == s[::-1]"
for name, code in (("good", good), ("bad", bad)):
    score, info = run_unit_tests(code, tests)
    print(f"{name}: pass rate {score:.0%}", info if info else "")
```

Execution-based scoring needs a **real sandbox** (containers, resource limits, no network) because model-written code is untrusted. The same idea for SQL: run the generated query and the reference query on a test database and compare the result sets.

## Overlap metrics

For spans and extraction, **token F1** (precision and recall over words) is standard, for example in SQuAD-style QA. **ROUGE** (n-gram or longest-common-subsequence overlap) and **BLEU** were built for summarisation and translation; they correlate weakly with human judgement for modern LLM outputs, because a correct paraphrase shares few words with the reference. Use them only for tasks where wording matters.

```python run title="Token F1, ROUGE-L and edit distance" level=intermediate
from collections import Counter

def tokens(s): return s.lower().split()

def token_f1(pred, gold):
    p, g = tokens(pred), tokens(gold)
    common = sum((Counter(p) & Counter(g)).values())
    if common == 0: return 0.0
    precision, recall = common / len(p), common / len(g)
    return 2 * precision * recall / (precision + recall)

def lcs(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            dp[i][j] = dp[i - 1][j - 1] + 1 if a[i - 1] == b[j - 1] else max(dp[i - 1][j], dp[i][j - 1])
    return dp[-1][-1]

def rouge_l(pred, gold):
    p, g = tokens(pred), tokens(gold)
    l = lcs(p, g)
    if l == 0: return 0.0
    precision, recall = l / len(p), l / len(g)
    return 2 * precision * recall / (precision + recall)

def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]

gold = "returns are accepted within 30 days of delivery"
for label, pred in [("same meaning, same words", "returns are accepted within 30 days of delivery"),
                    ("same meaning, new words", "you can send it back inside a month after it arrives"),
                    ("wrong meaning, similar words", "returns are accepted within 3 days of delivery"),
                    ("unrelated", "shipping takes five business days")]:
    print(f"{label:30} F1={token_f1(pred, gold):.2f}  ROUGE-L={rouge_l(pred, gold):.2f}  edit={edit_distance(pred, gold)}")
```

Look at rows 2 and 3: the **correct paraphrase scores near zero** while the **factually wrong answer scores high**. That is why overlap metrics are dangerous as proxies for correctness on open-ended outputs.

## Embedding similarity

Compare the **embedding** of the output and the reference (cosine similarity). It tolerates paraphrase, so it fixes one weakness of overlap metrics, but it adds others: it rewards **topical** closeness and cannot tell "30 days" from "3 days", or a negation from its opposite. Use it for coarse checks (is the answer on topic?) and for **retrieval and semantic duplicates**, not as the sole correctness check.

## Classification metrics

When the output is a **label** (route, category, safe/unsafe), use the full classification toolkit, not just accuracy.

```python run title="Confusion matrix, precision, recall, F1" level=intermediate
from collections import Counter

gold = ["safe"] * 90 + ["unsafe"] * 10                                  # imbalanced: unsafe is rare
pred = (["safe"] * 86 + ["unsafe"] * 4) + (["unsafe"] * 6 + ["safe"] * 4)   # 4 false positives, 4 false negatives

cm = Counter(zip(gold, pred))
tp, fp, fn, tn = cm[("unsafe", "unsafe")], cm[("safe", "unsafe")], cm[("unsafe", "safe")], cm[("safe", "safe")]
accuracy = (tp + tn) / len(gold)
precision, recall = tp / (tp + fp), tp / (tp + fn)
f1 = 2 * precision * recall / (precision + recall)
print(f"confusion: TP={tp} FP={fp} FN={fn} TN={tn}")
print(f"accuracy={accuracy:.0%} (looks great)  precision={precision:.0%}  recall={recall:.0%}  F1={f1:.0%}")
print("a model that always says 'safe' would have accuracy", f"{90 / 100:.0%}", "but recall 0%")
```

- **Precision**: of what I flagged, how much was right? (cost of false alarms)
- **Recall**: of what I should have flagged, how much did I catch? (cost of misses)
- **F1**: harmonic mean; **macro/micro averaging** for many classes; **per-class** numbers matter.
- Choose the metric by the **cost of each error type**: missing an unsafe response is usually worse than a false flag, so optimise recall at an acceptable precision.

### Calibration: do confidences mean anything?

If a classifier says "90% sure", is it right 90% of the time? **Expected calibration error (ECE)** compares stated confidence with actual accuracy in bins. It matters when you route or escalate based on confidence (for example "send to a human below 0.7").

```python run title="Expected calibration error" level=advanced
import numpy as np

rng = np.random.default_rng(0)
conf = rng.uniform(0.5, 1.0, 2000)                                     # the model's stated confidence
correct = rng.random(2000) < (conf - 0.15)                             # but it is actually overconfident by ~15 points

def ece(conf, correct, bins=10):
    edges = np.linspace(0.5, 1.0, bins + 1)
    total, n = 0.0, len(conf)
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf >= lo) & (conf < hi)
        if m.any():
            total += m.mean() * abs(conf[m].mean() - correct[m].mean())
    return total

print(f"mean confidence {conf.mean():.2f}, actual accuracy {correct.mean():.2f}, ECE = {ece(conf, correct):.3f}")
```

## Pitfalls

1. **A metric is a proxy.** Check that it agrees with human judgement on your data before trusting it (compute the correlation on 50 labelled cases).
2. **Single numbers hide structure**: break down by slice and error type.
3. **Normalisation choices change scores**: fix and version them.
4. **Thresholds** (for similarity, F1) must be set on validation data, not guessed.
5. **Gaming**: once a metric is optimised directly, it drifts from the goal (Goodhart's law): keep qualitative review.

```quiz
? Which scorer is best for "did the model's JSON contain the required fields with valid enums"?
- ROUGE
+ A format/schema check in code
- An LLM judge
> Deterministic validation is cheap, exact and fast.

? Why can ROUGE rank a wrong answer above a correct paraphrase?
+ It measures word overlap, not meaning, so a wrong answer with similar words can score higher
- ROUGE only works on code
- It uses embeddings
> Overlap metrics are weak proxies for correctness on open-ended text.

? For rare unsafe outputs, why is accuracy a poor metric?
+ A model that always says "safe" gets high accuracy but catches nothing; use precision, recall and F1
- Accuracy is too complex
- It cannot be computed
> Class imbalance makes accuracy misleading.

? What does calibration measure?
+ Whether stated confidence matches actual correctness
- How fast the model is
- Whether answers are polite
> Poor calibration breaks confidence-based routing.
```

:::problem Design the scorers for a text-to-SQL feature. {level=medium tags="evals,sql,executable"}
List checks from cheapest to richest.

:::solution Model answer
(1) **Parses**: the SQL is valid and uses only allowed tables/columns and read-only statements (static check). (2) **Executes** within a time/row limit on a test database. (3) **Result match**: compare the result set to the reference query's result (order-insensitive unless `ORDER BY` is specified; compare as multisets). (4) **Efficiency guard**: query plan has no unbounded scans (optional). (5) For questions with several valid SQLs, **execution accuracy** is better than string match. (6) A narrow LLM check for **intent** (does the query answer the user's question?) on cases where the reference is ambiguous. Track failures by type (syntax, wrong join, wrong filter).
:::
:::

:::keypoints
- Use the lowest scorer rung that works: exact match, regex/containment, format/schema checks, executable checks, then overlap, embeddings and judges.
- Normalise before comparing; validity is not correctness; executable checks (tests, SQL results) are the gold standard where available, in a sandbox.
- Overlap metrics (F1, ROUGE, BLEU) can score wrong answers high and correct paraphrases low; embedding similarity misses negations and numbers.
- For labels, use precision, recall, F1, confusion matrices and calibration; pick metrics by the cost of each error.
- Validate any metric against human judgement and keep qualitative review to resist metric gaming.
:::

:::resources
- [Hamel Husain: Evals FAQ](https://hamel.dev/blog/posts/evals-faq/) — when to use code-based assertions versus judges.
- [Inspect AI](https://inspect.aisi.org.uk/) — scorers, solvers and sandboxes for code-based evals.
- [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) — standard implementations of many metrics and benchmarks.
- [promptfoo docs](https://www.promptfoo.dev/docs/intro) — assertions (contains, regex, JSON schema, similarity) in a config file.
- [OpenAI simple-evals](https://github.com/openai/simple-evals) — small, readable reference implementations.
- [Holistic Evaluation of Language Models (HELM)](https://arxiv.org/abs/2211.09110) — a multi-metric view of evaluation.
:::
