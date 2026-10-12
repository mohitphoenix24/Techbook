---
title: Probability & Statistics for ML
level: intermediate
time: 30
summary: The handful of probability ideas behind ML and LLMs — distributions, mean and variance, softmax, sampling, log-probabilities, entropy, cross-entropy and perplexity — each with runnable code.
---

A language model is a **probability machine**: given some text, it outputs a probability for every possible next token, then samples one. Classifiers output probabilities. Training minimizes a probability-based loss. This lesson gives you exactly the probability you need — no more.

## Probability basics

:::def Probability
A number between 0 and 1 saying how likely something is. 0 = impossible, 1 = certain. The probabilities of all possible outcomes add up to 1.
:::

:::def Probability distribution
A list (or function) giving the probability of **every** possible outcome. For an LLM, it is a probability for each token in the vocabulary.
:::

```python run level=easy
import numpy as np

next_token = {"Paris": 0.82, "Lyon": 0.07, "the": 0.05, "France": 0.04, "banana": 0.02}
print("sums to:", round(sum(next_token.values()), 6))

rng = np.random.default_rng(0)
tokens, probs = list(next_token), list(next_token.values())
samples = rng.choice(tokens, size=1000, p=probs)
values, counts = np.unique(samples, return_counts=True)
for v, c in sorted(zip(values, counts), key=lambda x: -x[1]):
    print(f"{v:<7} sampled {c / 1000:.1%}  (true {next_token[v]:.0%})")
```

With enough samples, the observed frequencies match the true probabilities — that is the **law of large numbers**.

## Describing data: mean, variance, standard deviation

:::def Mean, variance, standard deviation
**Mean**: the average. **Variance**: the average squared distance from the mean — how spread out values are. **Standard deviation** (std): the square root of variance, in the same units as the data.
:::

```python run level=easy
import numpy as np

latencies = np.array([310, 290, 305, 1200, 298, 315, 302])
print("mean:  ", latencies.mean().round(1))
print("median:", np.median(latencies))            # robust to the 1200 outlier
print("var:   ", latencies.var().round(1))
print("std:   ", latencies.std().round(1))
print("p95:   ", np.percentile(latencies, 95).round(1))
```

:::tip Report percentiles for latency
For response times, the **median (p50)** and **p95/p99** tell you much more than the mean. One slow request can wreck an average.
:::

## The normal distribution

:::def Normal (Gaussian) distribution
The famous "bell curve", defined by a mean μ (centre) and standard deviation σ (width). About 68% of values fall within 1σ of the mean, 95% within 2σ. Neural-network weights are usually initialized from a normal distribution.
:::

```python run level=easy
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(0)
x = rng.normal(loc=0, scale=1, size=50_000)
for k in [1, 2, 3]:
    print(f"within {k}σ: {(np.abs(x) < k).mean():.1%}")

fig, ax = plt.subplots(figsize=(6.5, 3.5))
ax.hist(x, bins=80, density=True, color="#a5b4fc")
grid = np.linspace(-4, 4, 200)
ax.plot(grid, np.exp(-grid ** 2 / 2) / np.sqrt(2 * np.pi), color="#4338ca", linewidth=2)
ax.set(title="Samples vs the normal curve", xlabel="value", ylabel="density")
plt.show()
```

## From scores to probabilities: softmax

A model's last layer produces raw scores called **logits** — any real numbers. **Softmax** turns them into a probability distribution.

:::def Logits
The raw, unnormalized scores a model outputs, one per class or token. Higher = more likely, but they are not probabilities yet.
:::

:::formula Softmax
softmax(zᵢ) = exp(zᵢ) / Σⱼ exp(zⱼ)
:::

```python run level=intermediate
import numpy as np

def softmax(z):
    e = np.exp(z - np.max(z))          # subtract max for numerical stability
    return e / e.sum()

vocab = ["Paris", "Lyon", "London", "pizza"]
logits = np.array([5.0, 2.5, 1.0, -2.0])
p = softmax(logits)
for tok, prob in zip(vocab, p):
    print(f"{tok:<7} {prob:.4f}")
print("sum:", p.sum())
```

## Temperature: controlling creativity

:::def Temperature
A number that divides the logits before softmax. **Low** temperature (e.g. 0.2) sharpens the distribution → safer, more predictable text. **High** temperature (e.g. 1.5) flattens it → more varied, creative (and riskier) text.
:::

```python run level=intermediate
import numpy as np
import matplotlib.pyplot as plt

def softmax(z):
    e = np.exp(z - z.max())
    return e / e.sum()

vocab = ["Paris", "Lyon", "London", "Rome", "pizza"]
logits = np.array([4.0, 2.5, 2.0, 1.5, -1.0])

fig, ax = plt.subplots(figsize=(7, 3.8))
width = 0.25
for i, T in enumerate([0.3, 1.0, 2.0]):
    p = softmax(logits / T)
    ax.bar(np.arange(len(vocab)) + (i - 1) * width, p, width, label=f"T = {T}")
    print(f"T={T}: " + "  ".join(f"{t}={q:.2f}" for t, q in zip(vocab, p)))
ax.set_xticks(range(len(vocab)), vocab)
ax.set(title="Same logits, different temperatures", ylabel="probability")
ax.legend()
plt.show()
```

## Log-probabilities

:::def Log-probability
The natural logarithm of a probability: `log(p)`. Always ≤ 0. Models work with log-probs because multiplying many small probabilities underflows to zero, while **adding** their logs is stable.
:::

```python run level=intermediate
import numpy as np

token_probs = np.full(400, 0.05)              # a 400-token sentence, each token p=0.05
print("product of probabilities:", np.prod(token_probs))       # underflows to 0.0!
print("sum of log-probabilities:", np.log(token_probs).sum())  # perfectly fine
```

## Entropy — how uncertain is a distribution?

:::def Entropy
A measure of uncertainty: `H = −Σ p log p`. It is **0** when one outcome is certain and **largest** when all outcomes are equally likely. A model with high entropy over the next token is "unsure".
:::

```python run level=intermediate
import numpy as np

def entropy(p):
    p = np.asarray(p, dtype=float)
    p = p[p > 0]
    return float(-(p * np.log2(p)).sum())       # in bits

print("certain:      ", entropy([1, 0, 0, 0]))
print("confident:    ", round(entropy([0.9, 0.05, 0.03, 0.02]), 3))
print("unsure:       ", round(entropy([0.4, 0.3, 0.2, 0.1]), 3))
print("uniform (max):", entropy([0.25] * 4))
```

## Cross-entropy — the loss that trains LLMs

:::def Cross-entropy loss
How "surprised" the model is by the correct answer: `−log(p_correct)`. If the model gave the right token probability 0.9 the loss is small (0.105); if it gave 0.01 the loss is large (4.6). Training an LLM = minimizing average cross-entropy on next-token prediction.
:::

```python run level=intermediate
import numpy as np

for p_correct in [0.99, 0.9, 0.5, 0.1, 0.01]:
    print(f"p(correct)={p_correct:<5} -> loss = {-np.log(p_correct):.3f}")
```

```python run level=advanced
import numpy as np

def softmax(z, axis=-1):
    e = np.exp(z - z.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

def cross_entropy(logits, targets):
    """Mean cross-entropy for a batch: logits (N, C), targets (N,) of class ids."""
    probs = softmax(logits)
    return float(-np.log(probs[np.arange(len(targets)), targets]).mean())

logits = np.array([[2.0, 0.5, -1.0],     # model thinks class 0
                   [0.1, 3.0, 0.2],      # class 1
                   [1.0, 1.0, 1.0]])     # unsure
good_targets = np.array([0, 1, 2])
bad_targets = np.array([2, 0, 2])
print("loss when mostly right:", round(cross_entropy(logits, good_targets), 3))
print("loss when mostly wrong:", round(cross_entropy(logits, bad_targets), 3))
print("random guessing over 3 classes:", round(np.log(3), 3))
```

## Perplexity

:::def Perplexity
`exp(average cross-entropy)`. Read it as "the model is as confused as if it had to choose uniformly among **N** tokens". Lower is better. A perplexity of 1 means perfect prediction.
:::

```python run level=intermediate
import numpy as np

# probability the model assigned to each actual next token in a sentence
p_good_model = np.array([0.6, 0.4, 0.7, 0.5, 0.8])
p_bad_model = np.array([0.05, 0.1, 0.02, 0.2, 0.08])
for name, p in [("good", p_good_model), ("bad", p_bad_model)]:
    ce = -np.log(p).mean()
    print(f"{name} model: cross-entropy={ce:.3f}  perplexity={np.exp(ce):.1f}")
```

## Conditional probability and Bayes (intuition)

:::def Conditional probability
`P(A | B)` — the probability of A **given that** B happened. An LLM computes `P(next token | all previous tokens)`.
:::

```python run level=advanced
# Bayes' rule with a spam filter:  P(spam | "free") = P("free" | spam) · P(spam) / P("free")
p_spam = 0.2                  # 20% of email is spam
p_free_given_spam = 0.6       # "free" appears in 60% of spam
p_free_given_ham = 0.05       # ... and 5% of normal mail

p_free = p_free_given_spam * p_spam + p_free_given_ham * (1 - p_spam)
p_spam_given_free = p_free_given_spam * p_spam / p_free
print(f"P(spam | 'free') = {p_spam_given_free:.1%}")
```

## Sampling, confidence and A/B comparisons

When you evaluate a model on 200 questions and get 86% accuracy, how sure are you? **Bootstrapping** estimates the uncertainty by resampling your results:

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
results_a = rng.random(200) < 0.86          # prompt A: True = correct
results_b = rng.random(200) < 0.82          # prompt B

def bootstrap_ci(x, n=5000):
    means = [rng.choice(x, size=len(x), replace=True).mean() for _ in range(n)]
    return np.percentile(means, [2.5, 97.5])

for name, r in [("A", results_a), ("B", results_b)]:
    lo, hi = bootstrap_ci(r)
    print(f"prompt {name}: accuracy {r.mean():.1%}  95% CI [{lo:.1%}, {hi:.1%}]")
print("Overlapping intervals → the difference may just be noise. Collect more examples!")
```

:::ai Where each idea shows up
| Idea | In Gen-AI |
|---|---|
| distribution + sampling | generating text token by token |
| softmax + temperature | the `temperature` setting in every LLM API |
| log-probs | token log-probabilities, scoring and ranking answers |
| cross-entropy | the training loss of every language model |
| perplexity | measuring language-model quality |
| entropy | detecting model uncertainty |
| bootstrap CI | deciding whether prompt B is *really* better than prompt A |
:::

## Check yourself

```quiz
? What does lowering the temperature do?
+ Makes the distribution sharper — more predictable text
- Makes the model faster
- Makes the output longer
> Dividing logits by a small T exaggerates differences between them.

? The model gave the correct token probability 0.5. What is the cross-entropy loss?
+ about 0.693 (−ln 0.5)
- 0.5
- 2
> −log(0.5) = ln 2 ≈ 0.693.

? Why use log-probabilities instead of probabilities?
+ Products of many small probabilities underflow; sums of logs are stable
- Logs are always positive
- They are easier to read
> log turns products into sums.

? A perplexity of 1 means…
+ The model predicted every token with certainty
- The model is maximally confused
- One token was wrong
> exp(0) = 1: zero cross-entropy.
```

:::exercise Top-k sampling
Write `sample_top_k(logits, k, temperature, rng)` that keeps only the `k` largest logits, applies temperature, softmaxes them, and samples one index. Sample 1,000 times from `logits = [3.0, 2.0, 1.0, 0.5, -1.0]` with `k=3, temperature=1.0` and print how often each index was chosen (indexes 3 and 4 should never appear).
:::

:::solution
```python run
import numpy as np

def sample_top_k(logits, k, temperature, rng):
    logits = np.asarray(logits, dtype=float)
    top = np.argsort(logits)[-k:]                # indices of the k largest
    z = logits[top] / temperature
    p = np.exp(z - z.max())
    p /= p.sum()
    return int(rng.choice(top, p=p))

rng = np.random.default_rng(0)
logits = [3.0, 2.0, 1.0, 0.5, -1.0]
counts = np.bincount([sample_top_k(logits, 3, 1.0, rng) for _ in range(1000)], minlength=5)
for i, c in enumerate(counts):
    print(f"index {i}: {c}")
```
:::

:::keypoints
- A distribution assigns a probability to every outcome; LLMs output one over the vocabulary.
- Mean/median/std/percentiles describe data; report p50/p95 for latency.
- **Softmax** turns logits into probabilities; **temperature** sharpens or flattens them.
- Work in **log-probabilities**; **cross-entropy** `−log p(correct)` is the training loss; **perplexity** = `exp(CE)`.
- **Entropy** measures uncertainty; **bootstrapping** tells you if an eval difference is real.
:::
