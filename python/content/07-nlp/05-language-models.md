---
title: Language Models & Sampling
level: advanced
time: 40
summary: What a language model really computes, how to train one (an n-gram model and a neural one, from scratch), every decoding strategy — greedy, temperature, top-k, top-p — and how base models become helpful chat assistants.
---

A **language model** assigns probabilities to text: given some words, how likely is each possible next word? That single skill — scaled up enormously — produces essays, code, translations and conversation. Let's build language models from the ground up.

:::def Language model (LM)
A model that predicts the probability of the next token given the previous ones: `P(next token | context)`. Multiplying these predictions gives the probability of a whole sentence; sampling from them generates new text.
:::

:::formula Chain rule of probability
P(w₁, w₂, …, wₙ) = P(w₁) · P(w₂ | w₁) · P(w₃ | w₁, w₂) · … · P(wₙ | w₁ … wₙ₋₁)
:::

## Model 1: a bigram (n-gram) model by counting

:::def N-gram model
A language model that predicts the next token from only the previous **n − 1** tokens, using counts from a corpus. A bigram model (n = 2) looks at just the previous token.
:::

```python run level=intermediate
import random
from collections import Counter, defaultdict

corpus = """the cat sat on the mat . the dog sat on the rug . the cat chased the dog .
the dog chased the ball . a cat sat on a mat . the dog slept on the rug ."""
tokens = corpus.split()

counts = defaultdict(Counter)
for a, b in zip(tokens, tokens[1:]):
    counts[a][b] += 1

def next_probs(word):
    total = sum(counts[word].values())
    return {w: c / total for w, c in counts[word].most_common()}

print("P(next | 'the') =", {w: round(p, 2) for w, p in next_probs("the").items()})
print("P(next | 'sat') =", next_probs("sat"))

random.seed(4)
def generate(start="the", n=12):
    out = [start]
    for _ in range(n):
        probs = next_probs(out[-1])
        if not probs:
            break
        out.append(random.choices(list(probs), weights=list(probs.values()))[0])
    return " ".join(out)

for _ in range(3):
    print("→", generate())
```

The sentences are locally plausible but go nowhere — a bigram model only remembers **one** word. Bigger `n` helps a bit, but the counts become hopelessly sparse. Neural models solve this by **generalizing** across similar contexts.

## Model 2: a neural character-level model

Now a tiny **neural** language model, trained with gradient descent: it learns an embedding per character and predicts the next character from the previous three.

```python run level=advanced
import numpy as np

text = ("to be or not to be that is the question whether tis nobler in the mind to suffer "
        "the slings and arrows of outrageous fortune or to take arms against a sea of troubles ") * 8
chars = sorted(set(text)); V = len(chars)
stoi = {c: i for i, c in enumerate(chars)}
data = np.array([stoi[c] for c in text])

ctx, d_emb, d_hid = 3, 10, 64
X = np.stack([data[i:i + ctx] for i in range(len(data) - ctx)])    # previous 3 chars
Y = data[ctx:]                                                     # next char

rng = np.random.default_rng(0)
C = rng.normal(0, 1, (V, d_emb))
W1 = rng.normal(0, 1 / np.sqrt(ctx * d_emb), (ctx * d_emb, d_hid)); b1 = np.zeros(d_hid)
W2 = rng.normal(0, 1 / np.sqrt(d_hid), (d_hid, V)); b2 = np.zeros(V)
params = [C, W1, b1, W2, b2]

lr = 0.5
for step in range(1501):
    idx = rng.integers(0, len(X), 128)                  # mini-batch
    xb, yb = X[idx], Y[idx]
    emb = C[xb].reshape(len(idx), -1)                   # (B, ctx*d_emb)
    h_pre = emb @ W1 + b1
    h = np.tanh(h_pre)
    logits = h @ W2 + b2
    p = np.exp(logits - logits.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
    loss = -np.log(p[np.arange(len(idx)), yb]).mean()
    # backprop
    d = p.copy(); d[np.arange(len(idx)), yb] -= 1; d /= len(idx)
    dW2, db2 = h.T @ d, d.sum(0)
    dh = d @ W2.T * (1 - h ** 2)
    dW1, db1 = emb.T @ dh, dh.sum(0)
    demb = (dh @ W1.T).reshape(len(idx), ctx, d_emb)
    dC = np.zeros_like(C); np.add.at(dC, xb, demb)
    for P_, G in zip(params, [dC, dW1, db1, dW2, db2]):
        P_ -= lr * G
    if step % 500 == 0:
        print(f"step {step:4d}  loss {loss:.3f}  (perplexity {np.exp(loss):.1f}, random = {V})")

def sample(prompt="to ", n=80, temperature=0.7):
    ids = [stoi[c] for c in prompt]
    for _ in range(n):
        h = np.tanh(C[ids[-ctx:]].reshape(-1) @ W1 + b1)
        lg = (h @ W2 + b2) / temperature
        pr = np.exp(lg - lg.max()); pr /= pr.sum()
        ids.append(int(rng.choice(V, p=pr)))
    return "".join(chars[i] for i in ids)

print("\nsample:", sample())
```

The loss falls from `ln(V)` (random guessing) toward much lower values and the samples start to look like the training text. A real LLM is this idea with a Transformer instead of a small MLP, a context of hundreds of thousands of tokens, and trillions of training tokens.

## Decoding strategies

Once the model gives a probability distribution, **how** you pick the next token changes the output dramatically.

:::def Greedy decoding
Always pick the single most likely token. Deterministic, but often repetitive and dull.
:::

:::def Temperature sampling
Divide logits by a temperature `T` before softmax and sample. `T < 1` = safer, more focused; `T > 1` = more random and creative. `T → 0` approaches greedy.
:::

:::def Top-k sampling
Keep only the `k` most likely tokens, renormalize, and sample among them. Cuts off the long tail of nonsense.
:::

:::def Top-p (nucleus) sampling
Keep the **smallest** set of tokens whose probabilities add up to at least `p` (e.g. 0.9), renormalize, and sample. Adapts automatically: few candidates when the model is confident, more when it isn't.
:::

```python run level=intermediate
import numpy as np

vocab = np.array(["Paris", "the", "a", "London", "beautiful", "France", "banana", "xylophone"])
logits = np.array([4.0, 2.2, 2.0, 1.5, 1.2, 1.0, -1.0, -3.0])

def softmax(z):
    e = np.exp(z - z.max()); return e / e.sum()

def top_k_filter(logits, k):
    out = np.full_like(logits, -np.inf)
    keep = np.argsort(logits)[-k:]
    out[keep] = logits[keep]
    return out

def top_p_filter(logits, p):
    probs = softmax(logits)
    order = np.argsort(probs)[::-1]
    cum = np.cumsum(probs[order])
    keep = order[: int(np.searchsorted(cum, p) + 1)]
    out = np.full_like(logits, -np.inf)
    out[keep] = logits[keep]
    return out

rng = np.random.default_rng(0)
def sample(lg, n=12):
    pr = softmax(lg)
    return " ".join(rng.choice(vocab, size=n, p=pr))

print("probabilities:", dict(zip(vocab, softmax(logits).round(3))))
print("\ngreedy:      ", vocab[np.argmax(logits)])
print("T=0.3:       ", sample(logits / 0.3))
print("T=1.0:       ", sample(logits))
print("T=2.0:       ", sample(logits / 2.0))
print("top-k (k=3): ", sample(top_k_filter(logits, 3)))
print("top-p (0.9): ", sample(top_p_filter(logits, 0.9)))
print("kept by top-p 0.9:", vocab[np.isfinite(top_p_filter(logits, 0.9))])
```

| Setting | Use for |
|---|---|
| low temperature (0–0.3) | extraction, classification, code, factual Q&A |
| medium (0.5–0.8) | general assistance, summaries |
| high (0.9–1.2) | brainstorming, creative writing |
| top-p 0.9–0.95 | a common general default alongside temperature |

:::tip Sampling settings in APIs
Some newer models fix or restrict sampling parameters and manage them internally (for example, current Claude models with built-in reasoning reject custom `temperature`/`top_p`) — you steer them with **instructions** and **effort** settings instead. Always check the model's documentation.
:::

## Measuring a language model: perplexity

```python run level=intermediate
import numpy as np

def perplexity(token_probs):
    return float(np.exp(-np.mean(np.log(token_probs))))

sentence = ["The", "cat", "sat", "on", "the", "mat"]
good_lm = [0.20, 0.10, 0.30, 0.60, 0.50, 0.40]     # P(each word | previous words)
weak_lm = [0.05, 0.01, 0.02, 0.10, 0.20, 0.01]
print("good model perplexity:", round(perplexity(good_lm), 1))
print("weak model perplexity:", round(perplexity(weak_lm), 1))
```

Lower perplexity = the model is less "surprised" by real text = a better language model.

## From base model to chat assistant

:::flow How a chat LLM is made
Pretraining | next-token prediction on trillions of tokens → base model
Supervised fine-tuning (SFT) | learn from example conversations
Preference tuning | RLHF / RLAIF / DPO: prefer helpful, honest, harmless answers
Reasoning training | RL on problems with checkable answers
Deployment | system prompts, safety systems, tools
:::

:::def Base (pretrained) model
A model trained only to continue text. Ask it a question and it might continue with more questions — it imitates documents, it doesn't "assist".
:::

:::def Instruction tuning / SFT
Supervised fine-tuning on (instruction, ideal response) pairs so the model learns to follow instructions and hold conversations.
:::

:::def RLHF and its relatives
**Reinforcement Learning from Human Feedback**: people (or, in **RLAIF**, an AI guided by principles — as in Anthropic's Constitutional AI) compare model answers; a reward model learns those preferences; the LLM is optimized toward higher reward. **DPO** achieves a similar effect directly from preference pairs without a separate reward model.
:::

:::def Reasoning ("thinking") models
LLMs trained, often with reinforcement learning on tasks with verifiable answers (maths, code), to produce an internal chain of reasoning before answering. More thinking tokens usually means better answers on hard problems, at higher cost and latency.
:::

```python run level=intermediate
# What a base model vs a chat model "wants" to do with the same prompt (illustrative)
prompt = "What is the capital of France?"
base_model_continuation = "\nWhat is the capital of Germany?\nWhat is the capital of Italy?"
chat_model_reply = "The capital of France is Paris."

print("PROMPT:", prompt)
print("\nbase model continues the document:", base_model_continuation)
print("\nchat model answers:", chat_model_reply)
```

## Why LLMs hallucinate

:::def Hallucination
When a model produces fluent, confident text that is false or unsupported. It happens because the model generates **likely-sounding** tokens; it has no built-in fact database and may not know what it doesn't know.
:::

Mitigations you will use in the Gen-AI module:

- **RAG** — put the relevant facts into the context and ask the model to answer only from them, with citations.
- **Tool use** — let the model call a calculator, a search engine or a database instead of guessing.
- **Clear instructions** — allow "I don't know"; ask for quotes from the source.
- **Evaluation** — measure factual accuracy on test sets and monitor production outputs.

:::ai
Every concept here maps to an API setting or behaviour: `max_tokens` (how many tokens to sample), `temperature`/`top_p` (decoding), `stop_sequences` (stop sampling at a string), streaming (receiving tokens as they're sampled), and token usage in the response (input + output tokens you pay for).
:::

## Check yourself

```quiz
? What does a language model fundamentally predict?
+ A probability distribution over the next token
- The meaning of a sentence
- The number of words in a document
> Generation = repeatedly sampling from that distribution.

? Top-p = 0.9 means…
+ Sample from the smallest set of tokens whose probabilities sum to ≥ 0.9
- Keep the 90 most likely tokens
- Use 90% of the vocabulary
> The candidate set size adapts to how confident the model is.

? Which step turns a base model into an instruction-following assistant?
+ Supervised fine-tuning on example conversations (then preference tuning)
- Pretraining on more text
- Increasing the temperature
> SFT teaches the format and behaviour of helpful replies.

? A model gets perplexity 1.0 on a test set. That means…
+ It predicted every actual token with probability 1
- It is completely random
- It used one token
> exp(mean(−log 1)) = exp(0) = 1.
```

:::exercise Trigram model
Extend the bigram counting model to a **trigram** model: predict the next word from the previous **two** words (use `(a, b)` tuples as keys). Generate a 12-word sentence starting from `("the", "cat")`, and compare its coherence with the bigram version.
:::

:::solution
```python run
import random
from collections import Counter, defaultdict

corpus = """the cat sat on the mat . the dog sat on the rug . the cat chased the dog .
the dog chased the ball . a cat sat on a mat . the dog slept on the rug ."""
t = corpus.split()
tri = defaultdict(Counter)
for a, b, c in zip(t, t[1:], t[2:]):
    tri[(a, b)][c] += 1

random.seed(1)
out = ["the", "cat"]
for _ in range(12):
    options = tri[(out[-2], out[-1])]
    if not options:
        break
    out.append(random.choices(list(options), weights=list(options.values()))[0])
print(" ".join(out))
```
:::

:::keypoints
- A language model predicts `P(next token | context)`; generating = sampling repeatedly.
- N-gram models count; neural models learn embeddings and generalize (you trained both).
- Decoding: **greedy**, **temperature**, **top-k**, **top-p** — choose by task.
- **Perplexity** measures LM quality (lower is better).
- Chat assistants = pretraining → SFT → preference tuning (RLHF/RLAIF/DPO) → often reasoning training. They can still **hallucinate**.
:::
