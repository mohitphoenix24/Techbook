---
title: Build a Text Generator and Sampling Lab
level: intermediate
time: 45
icon: dice
cover: #f59e0b,#f43f5e
tags: decoding, sampling, temperature, top-p, beam-search
summary: Implement greedy decoding, temperature, top-k, top-p, min-p, repetition penalties and beam search from scratch on top of a small word-level language model, then measure diversity, repetition and likelihood to see exactly what each API parameter does to the output.
---

When an API asks for `temperature`, `top_p` or `stop_sequences`, it is exposing the **decoding** stage: the model produced a probability distribution over next tokens and something has to pick one. This project builds that stage yourself, so the parameters stop being magic numbers.

**What you'll build:** a word-level generator with six pluggable samplers, a beam-search decoder, and a small evaluation that scores each strategy.

:::flow The pipeline
Language model | next-token probabilities
Adjust | temperature, repetition penalty
Truncate | top-k, top-p, min-p
Pick | greedy, sample, or beam search
Stop | length, stop sequence, end token
Score | diversity, repetition, likelihood
:::

## Step 1 — A small language model to decode from

We need next-token probabilities. A trigram word model trained on generated text is enough: it has the same interface as a large model (history in, distribution out).

```python run shared title="Step 1 · a trigram word model"
import math, random
from collections import Counter, defaultdict

gen = random.Random(7)
subjects = ["the cat", "a small dog", "the old teacher", "my sister", "the young farmer", "our neighbour", "the quiet river", "a tired traveller", "the football team", "a friendly baker"]
verbs = ["reads", "finds", "carries", "watches", "builds", "follows", "paints", "cleans", "opens", "tastes"]
objects = ["a long letter", "the broken map", "some fresh bread", "the garden gate", "a heavy book", "the wooden bridge", "a small boat", "the old door"]
places = ["in the morning", "near the river", "after the rain", "with great care", "at the market", "before dinner"]
def zipf(options):
    """Pick an option with probability proportional to 1/rank, like real language: a few common choices and a long tail."""
    return gen.choices(options, [1 / (i + 1) for i in range(len(options))])[0]

corpus = []
for _ in range(600):
    s = f"{zipf(subjects)} {zipf(verbs)} {zipf(objects)} {zipf(places)}"
    if gen.random() < 0.3:
        s += f" and then {zipf(subjects)} {zipf(verbs)} {zipf(objects)}"
    corpus.append(s.split() + ["."])

tri, bi = defaultdict(Counter), defaultdict(Counter)
stream = ["<s>", "<s>"] + [w for sent in corpus for w in sent]          # one long stream: the model also learns what follows a full stop
for a, b, c in zip(stream, stream[1:], stream[2:]):
    tri[(a, b)][c] += 1
    bi[b][c] += 1
vocab = sorted({w for s in corpus for w in s})

def next_dist(history):
    """Return {token: probability} for the next token given the history (a list of tokens)."""
    h = ["<s>", "<s>"] + history
    counts = tri.get((h[-2], h[-1])) or bi.get(h[-1])                        # back off to a bigram if the trigram is unseen
    total = sum(counts.values())
    return {w: c / total for w, c in counts.items()}

dist = next_dist(["the", "cat"])
print("P(next | 'the cat'):", {w: round(p, 2) for w, p in sorted(dist.items(), key=lambda kv: -kv[1])[:6]})
print("vocabulary:", len(vocab), "words |", sum(len(s) for s in corpus), "training tokens")
```

## Step 2 — The samplers

Every sampler is a small function from a distribution to a (possibly reshaped) distribution, plus a final "pick" step.

```python run shared title="Step 2 · temperature, top-k, top-p, min-p, repetition penalty"
def normalize(d):
    z = sum(d.values())
    return {w: p / z for w, p in d.items()}

def temperature(d, T):
    """T < 1 sharpens (more deterministic), T > 1 flattens (more random). Works on probabilities as softmax(log p / T)."""
    if T <= 0: raise ValueError("use greedy() for T = 0")
    return normalize({w: p ** (1 / T) for w, p in d.items()})

def top_k(d, k):
    keep = sorted(d, key=d.get, reverse=True)[:k]
    return normalize({w: d[w] for w in keep})

def top_p(d, p):
    """Nucleus sampling: keep the smallest set of tokens whose cumulative probability reaches p."""
    kept, total = {}, 0.0
    for w in sorted(d, key=d.get, reverse=True):
        kept[w] = d[w]; total += d[w]
        if total >= p: break
    return normalize(kept)

def min_p(d, frac):
    """Keep tokens whose probability is at least frac times the top token's probability (adapts to confidence)."""
    cutoff = frac * max(d.values())
    return normalize({w: p for w, p in d.items() if p >= cutoff})

def repetition_penalty(d, history, penalty=1.3, window=30):
    recent = set(history[-window:])
    return normalize({w: (p / penalty if w in recent else p) for w, p in d.items()})

def pick(d, rng):
    words = list(d)
    return rng.choices(words, [d[w] for w in words])[0]

def greedy(d):
    return max(d, key=lambda w: (d[w], w))                             # ties broken alphabetically so runs are reproducible

# see what each knob does to the same distribution
base = next_dist(["reads", "the"])                                       # what comes after "... reads the"?
show = lambda d: {w: round(p, 2) for w, p in sorted(d.items(), key=lambda kv: -kv[1])[:5]}
print("original         :", show(base), f"({len(base)} candidates)")
print("temperature 0.5  :", show(temperature(base, 0.5)))
print("temperature 2.0  :", show(temperature(base, 2.0)))
print("top-k 3          :", show(top_k(base, 3)))
print("top-p 0.8        :", show(top_p(base, 0.8)), f"({len(top_p(base, 0.8))} kept)")
print("min-p 0.5        :", show(min_p(base, 0.5)), f"({len(min_p(base, 0.5))} kept)")

# how many candidates survive in contexts where the model is confident versus unsure?
print("\ncandidates kept per context        top-k 3   top-p 0.8   min-p 0.5   (of how many)")
for ctx in (["a", "heavy"], ["reads", "the"], ["the", "cat"]):
    d = next_dist(ctx)
    print(f"  after {' '.join(ctx):<16} top prob {max(d.values()):.2f} {len(top_k(d, 3)):>8} {len(top_p(d, 0.8)):>10} {len(min_p(d, 0.5)):>10}   ({len(d)})")
```

Notice in the table how **top-k always keeps up to k** candidates, while **top-p and min-p keep a number that depends on the shape of the distribution**: few tokens when one clearly dominates, more when the model is unsure.

## Step 3 — The generation loop

```python run shared title="Step 3 · generate with any sampler"
def generate(prompt, max_tokens=24, sampler=None, seed=0, stop=(), penalty=None):
    rng = random.Random(seed)
    history = prompt.split()
    out = []
    for _ in range(max_tokens):
        d = next_dist(history)
        if penalty: d = repetition_penalty(d, history, penalty)
        if sampler is None:
            w = greedy(d)                                              # greedy: always the single most likely token
        else:
            w = pick(sampler(d), rng)
        history.append(w); out.append(w)
        if w in stop: break
    return " ".join(out)

prompt = "my sister"
print("greedy               :", generate(prompt, sampler=None))
print("greedy, stop at '.'  :", generate(prompt, sampler=None, stop=(".",)))
for seed in (1, 2, 3):
    print(f"temperature 1.0, seed {seed}:", generate(prompt, sampler=lambda d: temperature(d, 1.0), seed=seed))
```

Greedy decoding is perfectly **repeatable** but boring, and without a stop condition it falls into a loop: the single most likely continuation of each context eventually cycles. Sampling with different seeds gives different outputs from the same prompt.

## Step 4 — Beam search

Instead of committing to one token at a time, **beam search** keeps the `k` best partial sequences by total log-probability. It finds higher-likelihood outputs than greedy, but those outputs tend to be generic, which is why chat models usually sample instead.

```python run shared title="Step 4 · beam search"
def beam_search(prompt, width=4, max_tokens=14, length_norm=True):
    beams = [(0.0, prompt.split(), False)]                              # (log-probability, tokens, finished)
    for _ in range(max_tokens):
        candidates = []
        for lp, toks, done in beams:
            if done:
                candidates.append((lp, toks, True)); continue
            for w, p in next_dist(toks).items():
                candidates.append((lp + math.log(p), toks + [w], w == "."))
        norm = (lambda c: c[0] / len(c[1])) if length_norm else (lambda c: c[0])
        beams = sorted(candidates, key=lambda c: (-norm(c), c[1]))[:width]
        if all(done for _, _, done in beams): break
    return beams

for lp, toks, done in beam_search("my sister", width=3)[:3]:
    print(f"log-prob {lp:6.2f} | {' '.join(toks)}")
```

## Step 5 — Measure what each strategy does

Intuition is not enough, so score each setting on 40 generations. Three simple metrics:

- **distinct-2**: share of word pairs that are unique across all outputs (higher = more varied).
- **repetition**: share of tokens inside a 3-gram that has already appeared in the same output (lower is better).
- **average log-probability** under the model (higher = more "typical"; very high can mean bland, very low means odd text).

```python run shared title="Step 5 · a small evaluation of decoding strategies"
def metrics(texts, prompt):
    all_bigrams, bigram_total, rep, tok_total, logp, logp_n = set(), 0, 0, 0, 0.0, 0
    for t in texts:
        toks = t.split()
        bgs = list(zip(toks, toks[1:]))
        all_bigrams.update(bgs); bigram_total += len(bgs)
        seen = set()
        for tri3 in zip(toks, toks[1:], toks[2:]):
            rep += tri3 in seen; seen.add(tri3)
        tok_total += len(toks)
        hist = prompt.split()                                           # score each token given the prompt and what came before
        for w in toks:
            p = next_dist(hist).get(w, 1e-6); logp += math.log(p); logp_n += 1; hist.append(w)
    return len(all_bigrams) / max(bigram_total, 1), rep / max(tok_total, 1), logp / max(logp_n, 1)

strategies = {
    "greedy":                 dict(sampler=None),
    "temperature 0.3":        dict(sampler=lambda d: temperature(d, 0.3)),
    "temperature 1.0":        dict(sampler=lambda d: temperature(d, 1.0)),
    "temperature 2.0":        dict(sampler=lambda d: temperature(d, 2.0)),
    "top-k 3":                dict(sampler=lambda d: top_k(d, 3)),
    "top-p 0.9":              dict(sampler=lambda d: top_p(d, 0.9)),
    "min-p 0.1":              dict(sampler=lambda d: min_p(d, 0.1)),
    "T=1.5 + top-p 0.9":      dict(sampler=lambda d: top_p(temperature(d, 1.5), 0.9)),
    "T=1.0 + rep. penalty":   dict(sampler=lambda d: temperature(d, 1.0), penalty=1.5),
}
print(f"{'strategy':24} {'distinct-2':>10} {'repetition':>11} {'avg log-prob':>13}")
for name, kw in strategies.items():
    texts = [generate(prompt, max_tokens=30, seed=s, **kw) for s in range(40)]
    d2, rep, lp = metrics(texts, prompt)
    print(f"{name:24} {d2:>10.2f} {rep:>11.2f} {lp:>13.2f}")
```

Read the table like an engineer: **greedy** has near-zero diversity and heavy repetition; **low temperature** behaves like greedy; **temperature 2.0** is very diverse but has a low log-probability (odd, off-distribution text); **top-p, min-p and top-k** keep diversity while cutting the risky tail; a **repetition penalty** fights loops at the cost of some likelihood. There is no best setting, only the right one for the task.

## Step 6 — Stop sequences, banned words and reproducibility

```python run shared title="Step 6 · production details"
def generate_ex(prompt, seed, banned=(), stop_words=(), max_tokens=30, T=0.8):
    rng, history, out = random.Random(seed), prompt.split(), []
    for _ in range(max_tokens):
        d = {w: p for w, p in next_dist(history).items() if w not in banned}      # logit bias of -infinity for banned tokens
        if not d: break
        w = pick(temperature(normalize(d), T), rng)
        if w in stop_words: break                                                  # stop sequence: the stop token is not included
        history.append(w); out.append(w)
    return " ".join(out)

print("plain          :", generate_ex(prompt, 11))
print("banned 'cat'   :", generate_ex(prompt, 11, banned={"cat"}))
print("stop at 'then' :", generate_ex(prompt, 11, stop_words={"then"}))
print("same seed twice gives the same text:", generate_ex(prompt, 5) == generate_ex(prompt, 5), "| different seed gives the same text:", generate_ex(prompt, 5) == generate_ex(prompt, 6))
```

## How it works

| API parameter | What it does in the code |
|---|---|
| `temperature` | rescales probabilities with `p ** (1/T)`; below 1 sharpens, above 1 flattens |
| `top_k` | keeps the `k` most likely tokens |
| `top_p` | keeps the smallest set whose probability mass reaches `p` |
| `min_p` | keeps tokens above a fraction of the top token's probability |
| `frequency/presence/repetition penalties` | down-weight tokens already used |
| `stop_sequences` | end generation when a marker appears |
| `logit_bias` / banned tokens | remove or boost specific tokens |
| `seed` | makes the random choice reproducible (hosted APIs may still vary slightly) |
| beam search | keeps several partial sequences; used for translation, rarely for chat |

Real systems apply these to **logits** over 100,000-token vocabularies rather than to a dictionary of probabilities, but the logic is identical. Some of the newest hosted models fix or reject sampling parameters such as `temperature` and `top_p`; always check the current API reference for the model you use.

:::exercise Extend it
1. Implement **typical sampling** (keep tokens whose surprise is close to the distribution's entropy) and add it to the table.
2. Add a **frequency penalty** that grows with how many times a token was already used.
3. Make the beam search return diverse beams (penalise beams that share a prefix).
4. Replace the trigram model with the neural model from the previous project and rerun the evaluation.
5. Write a `self_consistency(prompt, n=5)` that samples several outputs and returns the most common one.
:::

:::keypoints
- The model gives probabilities; decoding decides which token to emit. Temperature, top-k, top-p, min-p, penalties and stop rules are small, composable transforms.
- Greedy is repeatable but repetitive; high temperature is diverse but drifts off-distribution; truncation (top-p, min-p) cuts the unlikely tail.
- Top-p and min-p adapt to model confidence; top-k does not.
- Beam search finds high-likelihood text and suits tasks with one right answer; sampling suits open-ended generation.
- Measure decoding choices (diversity, repetition, likelihood) instead of guessing, and check which parameters your model API still accepts.
:::
