---
title: Decoding — Temperature, Top-p and How a Token Gets Chosen
level: intermediate
time: 45
summary: The model gives probabilities; decoding picks the token. Greedy, temperature, top-k, top-p, min-p and beam search implemented and visualised, what each knob does to creativity and reliability, how determinism really works, and what changed in the newest hosted models that fix these settings for you.
---

The network ends with a probability for every token. **Decoding** (also called sampling) decides which one to emit. This one step controls creativity, repetition, and whether the same prompt gives the same answer twice.

## Play with the knobs

Drag temperature, top-k, top-p and min-p. Bars show the probabilities after your settings; faded bars are tokens that were cut off. Press **Sample 30** to draw tokens and compare the histogram with the probabilities.

```viz algo=sampling title="Decoding playground" prompt="The capital of France is"
```

## The strategies

:::def Greedy decoding
Always pick the single most probable token. Deterministic and focused, but can get stuck in repetitive loops and cannot "explore" alternatives.
:::

:::def Temperature
A number that rescales logits before the softmax: `softmax(z / T)`. **T < 1** sharpens the distribution (more predictable), **T = 1** leaves it unchanged, **T > 1** flattens it (more random). As T → 0 it becomes greedy.
:::

:::def Top-k
Keep only the *k* most probable tokens, renormalise, then sample. Simple, but a fixed *k* is too many when the model is confident and too few when it is not.
:::

:::def Top-p (nucleus sampling)
Keep the smallest set of tokens whose cumulative probability reaches *p* (for example 0.9), renormalise, then sample. The size of the set **adapts** to how confident the model is.
:::

:::def Min-p
Keep tokens whose probability is at least `min_p ×` the top token's probability. Another adaptive cut that behaves well at higher temperatures.
:::

```python run title="All the samplers in one place" level=intermediate
import numpy as np

def softmax(z):
    z = np.asarray(z, float); e = np.exp(z - z.max()); return e / e.sum()

def apply_temperature(logits, T):
    return np.asarray(logits, float) / max(T, 1e-8)

def top_k_filter(probs, k):
    keep = np.argsort(probs)[-k:]
    out = np.zeros_like(probs); out[keep] = probs[keep]
    return out / out.sum()

def top_p_filter(probs, p):
    order = np.argsort(probs)[::-1]
    cum = np.cumsum(probs[order])
    cutoff = np.searchsorted(cum, p) + 1               # smallest prefix reaching p
    keep = order[:cutoff]
    out = np.zeros_like(probs); out[keep] = probs[keep]
    return out / out.sum()

def min_p_filter(probs, min_p):
    out = np.where(probs >= min_p * probs.max(), probs, 0.0)
    return out / out.sum()

vocab  = ["Paris", "Lyon", "France", "the", "a", "Berlin", "banana"]
logits = np.array([5.0, 3.2, 2.9, 2.0, 1.2, 0.8, -3.0])

for T in (0.3, 1.0, 1.8):
    p = softmax(apply_temperature(logits, T))
    print(f"T={T}: " + "  ".join(f"{w}={x:.2f}" for w, x in zip(vocab, p)))

base = softmax(logits)
show = lambda p: {w: round(float(x), 2) for w, x in zip(vocab, p)}
print("\ntop_k=3 :", show(top_k_filter(base, 3)))
print("top_p=.9:", show(top_p_filter(base, 0.9)))
print("min_p=.1:", show(min_p_filter(base, 0.1)))
```

Order matters: the common recipe is **temperature first, then top-k / top-p / min-p filters, then sample.** Some libraries apply filters first, so check the docs when you compare results across providers.

## What to use when

| Task | Settings (typical) | Why |
|---|---|---|
| Extraction, classification, code, tool calling | T ≈ 0–0.3 | You want the most likely, consistent answer |
| Q&A over documents | T ≈ 0–0.5 | Grounded; avoid invention |
| Chat, brainstorming | T ≈ 0.7–1.0, top-p ≈ 0.9–0.95 | Natural variety |
| Creative writing, many diverse options | T ≈ 1.0–1.3 with min-p or top-p | Exploration, with protection from nonsense |
| Self-consistency / best-of-n | T ≈ 0.7–1.0, n samples | Variety is the point |

:::warn Randomness is not "creativity"
High temperature gives variety, not quality. Past a point it produces confident nonsense, because tail tokens (like "banana") get real probability. Don't use top-k, top-p and temperature all at once without a reason; change one at a time and **evaluate**.
:::

## Is temperature 0 deterministic?

Not entirely. Even with greedy decoding, outputs can differ between runs because GPU arithmetic is not perfectly reproducible: floating-point addition is not associative, batch composition changes the order of operations, and near-tied logits can flip. Providers describe results as "mostly deterministic". Design for **robustness to small variations**: validate outputs, pin model versions, store the outputs you depend on, and test with several runs.

## What changed in recent hosted models

Several newest hosted models **no longer let you set sampling parameters at all**. For example, Anthropic's current models (such as Claude Opus 5.5 and Sonnet 5.5) reject non-default `temperature`, `top_p` and `top_k` with a 400 error. Reasons include reasoning models that sample internally in ways these knobs would break, and a push to control behaviour through **instructions, effort and structured outputs** instead.

What this means for you:

1. For hosted frontier models, steer with the **prompt**, the **effort / thinking** setting, and **schemas**, not temperature.
2. Where you do control sampling (open-weight models served by vLLM, llama.cpp or Ollama, and many other APIs), the knobs in this lesson apply directly.
3. If you need several different answers, ask for them in one request ("give 5 distinct options") or sample multiple times and rank them.

```python local title="Sampling parameters on an open model (vLLM / OpenAI-compatible server)"
from openai import OpenAI   # works against vLLM, Ollama, llama.cpp servers
client = OpenAI(base_url="http://localhost:8000/v1", api_key="not-needed")
r = client.chat.completions.create(
    model="Qwen/Qwen3-8B",
    messages=[{"role": "user", "content": "Give me a name for a coffee shop."}],
    temperature=0.9, top_p=0.95, max_tokens=30, n=3,           # three diverse samples
    extra_body={"top_k": 50, "min_p": 0.05},                  # server-specific extras
)
print([c.message.content for c in r.choices])
```

## Beam search and friends

**Beam search** keeps the *b* best partial sequences at each step instead of one. It optimises total sequence probability, which suits translation and speech recognition, but tends to produce bland, repetitive text for open-ended chat, so chat models rarely use it.

```python run title="Greedy vs beam search finds a better sentence" level=advanced
import numpy as np

# next-token probabilities depend on the last token (a tiny Markov model)
P = {
    "<s>": {"the": 0.55, "a": 0.45},
    "the": {"cat": 0.45, "dog": 0.55},
    "a":   {"cat": 0.9, "dog": 0.1},
    "cat": {"sat": 0.5, "</s>": 0.5},
    "dog": {"ran": 0.34, "sat": 0.33, "</s>": 0.33},
    "sat": {"</s>": 1.0}, "ran": {"</s>": 1.0},
}

def greedy():
    seq, lp, tok = ["<s>"], 0.0, "<s>"
    while tok != "</s>":
        tok, p = max(P[tok].items(), key=lambda kv: kv[1])
        seq.append(tok); lp += np.log(p)
    return seq, np.exp(lp)

def beam(width=3):
    beams = [(["<s>"], 0.0)]
    done = []
    while beams:
        cand = []
        for seq, lp in beams:
            for tok, p in P[seq[-1]].items():
                cand.append((seq + [tok], lp + np.log(p)))
        cand.sort(key=lambda x: -x[1])
        beams = []
        for seq, lp in cand[:width]:
            (done if seq[-1] == "</s>" else beams).append((seq, lp))
    best = max(done, key=lambda x: x[1])
    return best[0], np.exp(best[1])

print("greedy:", *greedy())
print("beam  :", *beam())
```

Greedy commits to "the dog" early (0.55 × 0.55 beats 0.45 × 0.45 at first glance), but the sequence "a cat …" has higher total probability. Beam search can find it.

## Other controls you will see

- **`max_tokens`** (limit output), **stop sequences** (end when a string appears), **seed** (where supported, repeatability).
- **Frequency / presence / repetition penalties**: lower the probability of tokens already used, to fight loops.
- **Logit bias**: add or subtract from specific tokens' logits (ban a word, force a label).
- **Logprobs**: return the model's probabilities for each chosen token. Useful for classification confidence and for finding where a model was unsure.
- **Constrained / grammar-guided decoding**: at each step mask out tokens that would break a JSON schema or grammar. This is how "structured outputs" can guarantee valid JSON (the structured-output lesson builds one).

```quiz
? What does lowering temperature do?
- Makes the model smarter
+ Sharpens the distribution so high-probability tokens dominate
- Increases the context window
> Dividing logits by T < 1 makes the softmax peakier; T → 0 approaches greedy.

? Why is top-p often preferred over top-k?
+ The number of candidate tokens adapts to how confident the model is
- It is always faster
- It removes all randomness
> A fixed k can be too loose or too tight; p keeps the smallest set covering the probability mass.

? Does temperature 0 guarantee identical outputs every time?
- Yes, always
+ No, tiny numeric and batching differences can still change results
- Only on CPUs
> Floating-point non-associativity and batching make exact reproducibility hard.

? A newest hosted model returns an error when you set temperature. What is the right fix?
- Try top_k instead
+ Remove the sampling parameters and steer with the prompt, effort and structured output
- Switch to Python 2
> Some recent models fix sampling and reject non-default values.
```

:::keypoints
- The model produces probabilities; decoding chooses a token. Greedy = argmax; sampling draws from the distribution.
- Temperature rescales logits; top-k, top-p and min-p cut the tail; apply temperature first, then filters.
- Low temperature for extraction, code and grounded answers; moderate for chat; higher plus filters for diversity.
- Determinism is approximate even at T = 0; design for variation.
- Newest hosted models may not expose sampling knobs; control behaviour with prompts, effort and schemas.
:::

:::resources
- [The Curious Case of Neural Text Degeneration (top-p)](https://arxiv.org/abs/1904.09751) — the nucleus-sampling paper.
- [How to generate text (Hugging Face blog)](https://huggingface.co/blog/how-to-generate) — greedy, beam, sampling with code.
- [Lilian Weng: Large Transformer Model Inference Optimization](https://lilianweng.github.io/posts/2023-01-10-inference-optimization/) — decoding and why it is slow.
- [Claude docs: Messages API parameters](https://docs.claude.com/en/api/messages) — what each parameter does on the Claude API.
- [Outlines](https://github.com/dottxt-ai/outlines) — grammar-constrained generation.
:::
