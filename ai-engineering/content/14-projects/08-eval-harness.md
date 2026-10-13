---
title: Build an LLM Eval Harness
level: intermediate
time: 60
icon: check
cover: #14b8a6,#f43f5e
tags: evals, graders, llm-judge, regression, statistics
summary: Build the evaluation harness every AI team ends up writing — datasets with slices, pluggable graders (exact, regex, schema, judge), an async runner, bootstrap confidence intervals, a paired comparison between two prompt versions, a regression gate, and a calibration check for an LLM-as-judge. Run it against a deterministic stand-in system, then point it at a real model.
---

"It seems to work" is not a quality bar. An **eval harness** turns a change (new prompt, new model, new retrieval setting) into a number you can compare with the last one. The harness itself is small; what matters is doing it **right**: representative cases, honest graders, slices, and statistics that account for noise.

**What you'll build:** a reusable `evaluate()` function, a paired comparison with confidence intervals, a CI-style gate, and a judge-calibration report.

:::flow The pipeline
Dataset | cases with expected results and tags
System | the thing under test (prompt, model)
Run | async, with a concurrency limit
Grade | exact, regex, schema, judge
Aggregate | accuracy, slices, confidence interval
Compare | paired diff versus baseline
Gate | pass or fail the change
:::

## Step 1 — A dataset with slices

Our system under test triages support tickets into one of five categories. Each case carries **tags** so we can look at slices (here, the true category, and whether the text has a typo), because averages hide failures.

```python run shared title="Step 1 · build a labelled dataset"
import random, json, re, math, asyncio
from collections import Counter, defaultdict

PHRASES = {
    "billing":   ["I was charged twice this month", "please refund my last payment", "the invoice total is wrong", "I want to cancel my subscription", "my card was declined at checkout", "why is there a fee on my bill"],
    "shipping":  ["my package has not arrived", "the tracking number shows nothing", "delivery is two weeks late", "you sent the parcel to the wrong address", "the box arrived damaged", "where is my order"],
    "account":   ["I cannot log in", "please reset my password", "I need to change my email address", "delete my account", "the two factor code is not working", "I am locked out"],
    "technical": ["the app crashes on startup", "I get error 500 when saving", "the api returns a timeout", "sync is stuck at 40 percent", "exporting to csv fails", "the page is blank after the update"],
    "other":     ["do you offer a student discount", "I love your product", "what are your opening hours", "can I talk to someone in sales", "we would like to discuss a partnership", "do you have a referral programme"],
}
rng = random.Random(1)
def typo(s):
    i = rng.randrange(1, len(s) - 2)
    return s[:i] + s[i + 1] + s[i] + s[i + 2:]                    # swap two neighbouring letters

CASES = []
for label, phrases in PHRASES.items():
    for k, phrase in enumerate(phrases * 2):
        text = rng.choice(["Hi, ", "Hello team, ", "", "Hey! "]) + phrase + rng.choice(["", ".", " please help", " thanks"])
        has_typo = k % 3 == 2
        if has_typo: text = typo(text)
        CASES.append({"id": len(CASES), "input": text, "expected": label, "tags": [label, "typo" if has_typo else "clean"]})
rng.shuffle(CASES)
print(len(CASES), "cases;", Counter(c["expected"] for c in CASES))
for c in CASES[:4]: print(" ", c["expected"], "<-", repr(c["input"]))
```

## Step 2 — Two versions of the system under test

We need something to evaluate. These two functions stand in for "prompt v1" and "prompt v2" of an LLM classifier. They are rule-based so the page is deterministic, but the harness cannot tell the difference: it only sees `system(text) -> answer`.

```python run shared title="Step 2 · prompt v1 and prompt v2 (stand-ins)"
V1 = {"billing": ["charged", "refund", "invoice", "payment", "subscription"],
      "shipping": ["package", "tracking", "delivery", "parcel"],
      "account": ["log in", "password", "email", "delete my account"],
      "technical": ["crash", "error", "api", "sync"]}
V2 = {"billing": ["charged", "refund", "invoice", "payment", "subscription", "card", "fee", "bill"],
      "shipping": ["package", "tracking", "delivery", "parcel", "box", "order", "address"],
      "account": ["log in", "password", "email", "account", "factor", "locked"],
      "technical": ["crash", "error", "api", "sync", "export", "page", "update", "app"]}

def make_system(keywords, default):
    def system(text):
        t = text.lower()
        scores = {label: sum(k in t for k in words) for label, words in keywords.items()}
        best = max(scores.values())
        if best == 0: return default                                  # nothing matched
        return max(sorted(scores), key=lambda l: scores[l])           # best keyword score (ties: alphabetical)
    return system

system_v1 = make_system(V1, default="other")
system_v2 = make_system(V2, default="technical")                       # v2 added many keywords, but changed the fallback
acc = lambda sys_: sum(sys_(c["input"]) == c["expected"] for c in CASES) / len(CASES)
print(f"quick look: v1 accuracy {acc(system_v1):.0%}, v2 accuracy {acc(system_v2):.0%}")
```

A single accuracy number says "v2 is better". Is it better **everywhere**, and is the difference **bigger than noise**? That is what the harness is for.

## Step 3 — Graders

A **grader** takes `(case, output)` and returns a score between 0 and 1 (plus a reason). Use the simplest grader that can judge the task: deterministic checks first, an LLM judge only for what code cannot decide.

```python run shared title="Step 3 · pluggable graders"
def exact_match(case, output):
    return float(output.strip().lower() == case["expected"]), "exact"

def regex_match(pattern):
    return lambda case, output: (float(bool(re.search(pattern, output, re.I))), f"regex {pattern}")

def valid_json_with_keys(*keys):
    def grader(case, output):
        try: obj = json.loads(output)
        except json.JSONDecodeError: return 0.0, "not valid JSON"
        missing = [k for k in keys if k not in obj]
        return (0.0, f"missing {missing}") if missing else (1.0, "valid")
    return grader

def combine(*graders, weights=None):
    """Weighted average of several graders: e.g. 70% correctness, 30% format."""
    weights = weights or [1 / len(graders)] * len(graders)
    def grader(case, output):
        parts = [g(case, output) for g in graders]
        return sum(w * s for w, (s, _) in zip(weights, parts)), "; ".join(r for _, r in parts)
    return grader

case = {"expected": "billing"}
print("exact on 'Billing '      :", exact_match(case, "Billing "))
print("regex on 'it is billing' :", regex_match(r"\bbilling\b")(case, "it is billing"))
print("json grader on bad json  :", valid_json_with_keys("label")(case, "label: billing"))
print("json grader on good json :", valid_json_with_keys("label")(case, '{"label": "billing"}'))
```

## Step 4 — The runner

Real systems call an API, so runs are **I/O bound**. Run cases concurrently with a **semaphore** that caps parallelism (to respect rate limits), and capture exceptions per case so one failure does not kill the run.

```python run shared title="Step 4 · async runner"
async def run_one(system, grader, case, sem, delay):
    async with sem:
        await asyncio.sleep(delay)                                    # stands in for network latency
        try:
            output = system(case["input"])
            score, reason = grader(case, output)
        except Exception as e:                                        # a crashing case is a failed case, not a crashed run
            output, score, reason = "", 0.0, f"error: {type(e).__name__}"
    return {"id": case["id"], "tags": case["tags"], "output": output, "score": score, "reason": reason}

async def evaluate_async(system, grader, cases, concurrency=8):
    sem = asyncio.Semaphore(concurrency)
    return await asyncio.gather(*(run_one(system, grader, c, sem, 0.001) for c in cases))   # results keep the order of the cases

def evaluate(system, grader=exact_match, cases=CASES, concurrency=8):
    return asyncio.run(evaluate_async(system, grader, cases, concurrency))

results_v1 = evaluate(system_v1)
results_v2 = evaluate(system_v2)
print("ran", len(results_v1), "cases each | first result:", results_v1[0])
```

## Step 5 — Report with slices and confidence intervals

With 60 cases, "78% versus 85%" could easily be noise. A **bootstrap confidence interval** resamples the cases with replacement many times and shows how much the score would move.

```python run shared title="Step 5 · accuracy, slices and bootstrap CI"
def bootstrap_ci(scores, n_boot=2000, seed=0):
    r = random.Random(seed)
    n = len(scores)
    means = sorted(sum(r.choice(scores) for _ in range(n)) / n for _ in range(n_boot))
    return means[int(0.025 * n_boot)], means[int(0.975 * n_boot)]

def report(name, results):
    scores = [r["score"] for r in results]
    lo, hi = bootstrap_ci(scores)
    print(f"{name}: accuracy {sum(scores) / len(scores):.1%}  (95% CI {lo:.1%} to {hi:.1%}, n={len(scores)})")
    by_tag = defaultdict(list)
    for r in results:
        for t in r["tags"]: by_tag[t].append(r["score"])
    print("   slices: " + " | ".join(f"{t} {sum(v) / len(v):.0%}" for t, v in sorted(by_tag.items())))

report("prompt v1", results_v1)
report("prompt v2", results_v2)
```

Look at the slices. The aggregate improved, but one slice moved the wrong way.

## Step 6 — Compare two versions properly

Because both versions ran on the **same cases**, we can do a **paired comparison**: which cases did v2 fix, which did it break, and is the average per-case difference clearly above zero?

```python run shared title="Step 6 · paired comparison"
def compare(base, new, n_boot=2000, seed=0):
    diffs = [n["score"] - b["score"] for b, n in zip(base, new)]
    fixed = [b["id"] for b, n in zip(base, new) if n["score"] > b["score"]]
    broken = [b["id"] for b, n in zip(base, new) if n["score"] < b["score"]]
    r = random.Random(seed)
    boots = sorted(sum(r.choice(diffs) for _ in diffs) / len(diffs) for _ in range(n_boot))
    return {"mean_diff": sum(diffs) / len(diffs), "ci": (boots[int(0.025 * n_boot)], boots[int(0.975 * n_boot)]), "fixed": fixed, "broken": broken}

cmp_ = compare(results_v1, results_v2)
print(f"v2 - v1 = {cmp_['mean_diff']:+.1%} (95% CI {cmp_['ci'][0]:+.1%} to {cmp_['ci'][1]:+.1%}) | fixed {len(cmp_['fixed'])} cases, broke {len(cmp_['broken'])} cases")
by_id = {c["id"]: c for c in CASES}
out1, out2 = {r["id"]: r["output"] for r in results_v1}, {r["id"]: r["output"] for r in results_v2}
print("\nexamples of cases v2 broke:")
for i in cmp_["broken"][:4]:
    print(f"  expected {by_id[i]['expected']:9} v1 said {out1[i]:9} v2 said {out2[i]:9} <- {by_id[i]['input']!r}")
```

This is the habit that prevents regressions: **always look at the cases that got worse**, not just the average. Here v2's new fallback sends every unmatched ticket to `technical`, which hurts the `other` category.

## Step 7 — A regression gate for CI

```python run shared title="Step 7 · pass/fail rules"
def gate(base, new, min_overall=0.80, max_slice_drop=0.10, max_broken=3):
    problems = []
    overall = sum(r["score"] for r in new) / len(new)
    if overall < min_overall: problems.append(f"overall {overall:.0%} is below {min_overall:.0%}")
    def by_tag(results):
        d = defaultdict(list)
        for r in results:
            for t in r["tags"]: d[t].append(r["score"])
        return {t: sum(v) / len(v) for t, v in d.items()}
    b, n = by_tag(base), by_tag(new)
    for t in b:
        if b[t] - n[t] > max_slice_drop: problems.append(f"slice '{t}' dropped {b[t] - n[t]:.0%} ({b[t]:.0%} -> {n[t]:.0%})")
    broken = compare(base, new)["broken"]
    if len(broken) > max_broken: problems.append(f"{len(broken)} cases that used to pass now fail (limit {max_broken})")
    return problems

problems = gate(results_v1, results_v2)
print("GATE:", "PASS" if not problems else "FAIL")
for p in problems: print("  -", p)
```

In CI this script would exit non-zero on failure and block the merge. The thresholds are policy: set them from the **cost of each kind of failure**, and keep **hard assertions** (valid JSON, no leaked secrets) separate from **soft thresholds** (accuracy).

## Step 8 — Can you trust an LLM judge?

For open-ended outputs, a code grader cannot decide, so teams use **LLM-as-judge**. A judge is itself a system under test: **measure how well it agrees with humans before you trust it**. Below, a stand-in judge (keyword coverage, which accidentally rewards length — a famous real bias) is compared with human labels, using Cohen's kappa for agreement beyond chance.

```python run shared title="Step 8 · calibrating a judge against human labels"
# (question key facts, candidate answer, human verdict: 1 = acceptable)
LABELLED = [
    ({"25", "days"}, "Employees get 25 days of paid leave.", 1),
    ({"25", "days"}, "You receive twenty five days off each year, which is generous and shows how much the company cares about people and balance.", 0),
    ({"200", "approval"}, "Expenses above 200 euros need manager approval.", 1),
    ({"200", "approval"}, "It depends on the situation and the team, so ask around. Many expenses are fine, and approval and other processes exist.", 0),
    ({"economy", "flights"}, "Flights must be economy class.", 1),
    ({"economy", "flights"}, "Book flights whenever you like, premium cabins are great, and economy is also available if you really want.", 0),
    ({"3", "years"}, "Laptops are replaced every 3 years.", 1),
    ({"3", "years"}, "Laptops last a long time. Many years, in fact, and we think about three or four hardware generations.", 0),
    ({"1", "hour"}, "Report a lost device within 1 hour.", 1),
    ({"1", "hour"}, "Tell security right away, ideally within the hour, because speed matters a lot in these situations.", 0),
    ({"400", "euros"}, "The home office stipend is 400 euros.", 1),
    ({"400", "euros"}, "The stipend is 400 euros, paid once to set up your workspace at home.", 1),
]

def judge(facts, answer, length_bias=1.0, threshold=0.5):
    words = re.findall(r"[a-z0-9]+", answer.lower())
    coverage = sum(f in words for f in facts) / len(facts)
    score = coverage * (min(len(words), 25) / 12) ** (0.5 * length_bias)       # the flawed judge likes long answers
    return int(score >= threshold)

def kappa(a, b):
    n = len(a); po = sum(x == y for x, y in zip(a, b)) / n
    pe = sum((sum(1 for x in a if x == v) / n) * (sum(1 for y in b if y == v) / n) for v in (0, 1))
    return (po - pe) / (1 - pe) if pe < 1 else 1.0

human = [h for _, _, h in LABELLED]
for name, kwargs in (("naive judge (length-biased)", dict(length_bias=1.0, threshold=0.5)), ("judge with length bias removed", dict(length_bias=0.0, threshold=0.99))):
    verdicts = [judge(f, a, **kwargs) for f, a, _ in LABELLED]
    agree = sum(v == h for v, h in zip(verdicts, human)) / len(human)
    print(f"{name:32} agreement with humans {agree:.0%} | kappa {kappa(verdicts, human):.2f} | passed {sum(verdicts)}/{len(verdicts)}")
print("the naive judge accepts verbose, evasive answers; calibration against human labels exposes it")
```

**Judge hygiene:** use a clear rubric, ask for a short rationale before the score, **swap the order** in pairwise comparisons (position bias), prefer a different model family than the one being judged (self-preference), and **re-measure agreement** whenever the judge model or rubric changes.

## Step 9 — Point it at a real model

The harness only needs `system(text) -> answer`, so evaluating a real prompt is one wrapper (needs an API key, so it runs on your machine):

```python local
import anthropic
client = anthropic.Anthropic()

def system_llm(text):
    r = client.messages.create(
        model="claude-haiku-5-5", max_tokens=10,
        system="Classify the support ticket as one of: billing, shipping, account, technical, other. Reply with the label only.",
        messages=[{"role": "user", "content": text}],
    )
    return r.content[0].text.strip().lower()

results_llm = evaluate(system_llm, concurrency=4)            # low concurrency respects rate limits
report("claude-haiku-5-5", results_llm)
print(compare(results_v1, results_llm)["mean_diff"])
```

Run it several times and compare the spread: **LLM outputs vary between runs**, so for important decisions repeat the evaluation and report the mean and range, not a single run.

## How it works

| Piece | Why it matters |
|---|---|
| Representative cases with tags | averages hide slice failures; tags make slices free |
| Simple graders first | deterministic checks are cheap, fast and unambiguous |
| Concurrency limit and error capture | respects rate limits; one failure does not lose the run |
| Bootstrap confidence interval | tells you whether a difference is bigger than noise |
| Paired comparison | same cases, so you see exactly what got fixed and broken |
| Gate | turns evaluation into an automatic decision in CI |
| Judge calibration | an uncalibrated judge gives confident wrong numbers |

:::exercise Extend it
1. Add 10 harder cases (multi-topic tickets, other languages) and see what happens to both versions.
2. Run `evaluate` 5 times on a randomised system (flip the answer with 5% probability) and report the spread.
3. Add a **cost and latency** column per run and gate on them too.
4. Implement a **pairwise** judge that compares two outputs and swaps their order to cancel position bias.
5. Save each run as JSON with the system version and date, and write a function that diffs two saved runs.
:::

:::keypoints
- An eval harness is a dataset with tags, a system under test, graders, a concurrent runner, aggregation and a gate.
- Use deterministic graders wherever possible; add LLM judges only for what code cannot decide, and calibrate them against human labels.
- Always report slices and confidence intervals; a single accuracy number hides regressions and noise.
- Compare versions on the same cases (paired), and read the cases that got worse.
- Gate in CI with hard assertions plus slice-aware thresholds, and repeat runs for non-deterministic systems.
:::
