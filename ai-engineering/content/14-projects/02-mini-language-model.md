---
title: Train a Tiny Language Model
level: intermediate
time: 55
icon: brain
cover: #8b5cf6,#14b8a6
tags: language-model, numpy, backpropagation, perplexity
summary: Build a character-level language model twice — first by counting (n-grams), then as a small neural network with embeddings trained by hand-written backpropagation in NumPy — and measure both with cross-entropy and perplexity. Everything a large model does, in miniature.
---

A language model is a function that, given some text, returns a **probability for every possible next token**. GPT-style models do exactly that with a Transformer and billions of parameters. Here you build the same thing at toy scale, so every part is visible: the data, the loss, the gradients and the sampling.

**What you'll build:** a character-level model trained on about twenty thousand characters, evaluated on held-out text, that you can sample from.

:::flow The pipeline
Text | ~20,000 characters
Dataset | context window to next char
Baseline | count-based n-gram model
Neural model | embeddings + tanh layer + softmax
Train | cross-entropy, Adam, backprop
Evaluate | loss and perplexity on held-out text
Sample | generate new text
:::

:::def Cross-entropy and perplexity
The **loss** is the average of −log p(correct next character). It is the surprise of the model at the true text; lower is better. **Perplexity** = e^loss: roughly "the model is as unsure as if it were choosing uniformly among this many characters". A model that guesses uniformly over V characters has perplexity V.
:::

## Step 1 — Data

```python run shared title="Step 1 · text, vocabulary and a train/validation split"
import numpy as np

# A character model needs plenty of text. To keep this page self-contained we generate ~20,000 characters of
# simple English from a tiny grammar (subject, verb, object, place). Swap in any real text file for the exercises.
gen = np.random.default_rng(42)
subjects = ["the cat", "a small dog", "the old teacher", "my sister", "the young farmer", "our neighbour", "the quiet river", "a tired traveller",
            "the football team", "the new student", "a friendly baker", "the little robot"]
verbs = ["reads", "finds", "carries", "watches", "builds", "follows", "paints", "cleans", "opens", "tastes", "remembers", "draws"]
objects = ["a long letter", "the broken map", "some fresh bread", "the garden gate", "a heavy book", "the wooden bridge", "a small boat",
           "the old door", "a bowl of soup", "the winding road", "a bright lamp", "the morning news"]
places = ["in the morning", "near the river", "after the rain", "with great care", "at the market", "before dinner", "on a cold day", "under the old bridge"]
sentences = []
for _ in range(420):
    s = f"{gen.choice(subjects)} {gen.choice(verbs)} {gen.choice(objects)} {gen.choice(places)}."
    sentences.append(s[0].upper() + s[1:])
TEXT = " ".join(sentences)
chars = sorted(set(TEXT))
stoi = {c: i for i, c in enumerate(chars)}
itos = {i: c for c, i in stoi.items()}
V = len(chars)
data = np.array([stoi[c] for c in TEXT])
split = int(len(data) * 0.9)
train_data, val_data = data[:split], data[split:]
print(TEXT[:150], "...")
print(f"{len(TEXT)} characters, vocabulary of {V} symbols, {len(train_data)} for training and {len(val_data)} held out")
print("uniform guessing would give loss", round(float(np.log(V)), 2), "and perplexity", V)
```

## Step 2 — The counting baseline

Before any neural network, count. An **n-gram model** estimates P(next | previous n−1 characters) from frequencies in the training text, with a little smoothing so unseen combinations do not get probability zero.

```python run shared title="Step 2 · bigram and trigram models by counting"
from collections import defaultdict

def train_ngram(data, n, alpha=0.1):
    counts = defaultdict(lambda: np.zeros(V))
    for i in range(n - 1, len(data)):
        counts[tuple(data[i - n + 1:i])][data[i]] += 1
    def prob(ctx):                                         # P(next | context) with add-alpha smoothing
        c = counts.get(tuple(ctx), np.zeros(V)) + alpha
        return c / c.sum()
    prob.n_contexts = len(counts)                          # how many distinct contexts were seen: the size of the "model"
    return prob

def nll(prob, data, n):
    losses = [-np.log(prob(data[i - n + 1:i])[data[i]]) for i in range(n - 1, len(data))]
    return float(np.mean(losses))

for n, alpha in ((2, 0.1), (3, 0.1), (4, 0.1)):
    p = train_ngram(train_data, n, alpha)
    print(f"{n}-gram: {p.n_contexts:>4} contexts stored | train loss {nll(p, train_data, n):.2f} | validation loss {nll(p, val_data, n):.2f} | validation perplexity {np.exp(nll(p, val_data, n)):.1f}")
print("\nlonger context predicts better, but the table of counts grows with every new context and never shares what it learned between similar ones")
```

That last line is the central tension of language modelling: **more context is more informative but sparser**. On this very regular text a 4-gram does well, but real language is far more varied, and counting cannot share information between similar contexts. A neural network can.

## Step 3 — A neural language model

The model (in the spirit of Bengio et al. 2003): look up an **embedding vector** for each of the last `C` characters, concatenate them, pass them through a **tanh hidden layer**, and produce **logits** for the next character, which a **softmax** turns into probabilities.

```python run shared title="Step 3 · dataset and parameters"
C, D, H = 5, 12, 128                                       # context length, embedding size, hidden units

def make_xy(data, C):
    X = np.stack([data[i:i + C] for i in range(len(data) - C)])
    Y = data[C:]
    return X, Y

Xtr, Ytr = make_xy(train_data, C)
Xva, Yva = make_xy(val_data, C)
rng = np.random.default_rng(0)
params = {
    "E":  rng.normal(0, 0.1, (V, D)),                      # embedding table: one row per character
    "W1": rng.normal(0, 1 / np.sqrt(C * D), (C * D, H)), "b1": np.zeros(H),
    "W2": rng.normal(0, 0.1, (H, V)),                    "b2": np.zeros(V),
}
n_params = sum(p.size for p in params.values())
print("examples:", len(Xtr), "train /", len(Xva), "validation | parameters:", n_params)
```

### Forward pass, loss and backpropagation

```python run shared title="Step 3b · forward, loss and gradients"
def forward(params, X):
    emb = params["E"][X].reshape(len(X), -1)               # (B, C*D): look up and concatenate embeddings
    h = np.tanh(emb @ params["W1"] + params["b1"])         # (B, H)
    logits = h @ params["W2"] + params["b2"]               # (B, V)
    logits = logits - logits.max(axis=1, keepdims=True)    # numerical stability
    probs = np.exp(logits); probs /= probs.sum(axis=1, keepdims=True)
    return emb, h, probs

def loss_and_grads(params, X, Y):
    B = len(X)
    emb, h, probs = forward(params, X)
    loss = -np.log(probs[np.arange(B), Y]).mean()
    dlogits = probs.copy(); dlogits[np.arange(B), Y] -= 1; dlogits /= B       # softmax + cross-entropy gradient
    grads = {"W2": h.T @ dlogits, "b2": dlogits.sum(0)}
    dh = dlogits @ params["W2"].T
    dpre = dh * (1 - h ** 2)                                                   # derivative of tanh
    grads["W1"], grads["b1"] = emb.T @ dpre, dpre.sum(0)
    demb = (dpre @ params["W1"].T).reshape(B, C, D)
    grads["E"] = np.zeros_like(params["E"]); np.add.at(grads["E"], X, demb)    # scatter-add into the rows that were used
    return loss, grads

# gradient check: compare one analytic gradient entry with a numerical estimate
Xs, Ys = Xtr[:32], Ytr[:32]
_, g = loss_and_grads(params, Xs, Ys)
eps, i, j = 1e-5, 3, 7
params["W1"][i, j] += eps; lp, _ = loss_and_grads(params, Xs, Ys)
params["W1"][i, j] -= 2 * eps; lm, _ = loss_and_grads(params, Xs, Ys)
params["W1"][i, j] += eps
print(f"gradient check on W1[{i},{j}]: analytic {g['W1'][i, j]:+.6f}  numerical {(lp - lm) / (2 * eps):+.6f}")
print("initial loss:", round(float(loss_and_grads(params, Xtr[:512], Ytr[:512])[0]), 2), "(close to ln V = " + str(round(float(np.log(V)), 2)) + ", as expected for random weights)")
```

A **gradient check** like this is the most valuable habit when writing backpropagation by hand: if the analytic and numerical numbers agree to several digits, your derivatives are right.

## Step 4 — Train with Adam

```python run shared title="Step 4 · training loop"
def evaluate(params, X, Y):
    _, _, probs = forward(params, X)
    return float(-np.log(probs[np.arange(len(X)), Y]).mean())

m = {k: np.zeros_like(v) for k, v in params.items()}
v = {k: np.zeros_like(v_) for k, v_ in params.items()}
steps, batch, lr0 = 1500, 128, 0.01
rng = np.random.default_rng(1)
history = []
for step in range(1, steps + 1):
    idx = rng.integers(0, len(Xtr), batch)
    loss, grads = loss_and_grads(params, Xtr[idx], Ytr[idx])
    lr = lr0 * (0.1 ** (step / steps))                      # decay the learning rate by 10x over training
    for k in params:                                        # Adam update
        m[k] = 0.9 * m[k] + 0.1 * grads[k]
        v[k] = 0.999 * v[k] + 0.001 * grads[k] ** 2
        mhat, vhat = m[k] / (1 - 0.9 ** step), v[k] / (1 - 0.999 ** step)
        params[k] -= lr * mhat / (np.sqrt(vhat) + 1e-8)
    if step in (1, 100, 300, 600, 1000, 1500):
        history.append((step, evaluate(params, Xtr, Ytr), evaluate(params, Xva, Yva)))
print(f"{'step':>5} {'train loss':>11} {'val loss':>9} {'val perplexity':>15}")
for s, tr, va in history:
    print(f"{s:>5} {tr:>11.2f} {va:>9.2f} {np.exp(va):>15.1f}")
```

Watch the two columns: with 20,000 characters and only about 12,000 parameters, the **training and validation losses move together**, so the network is learning the structure of the text rather than memorising it. Shrink the training text to a couple of thousand characters (see the exercises) and you will watch the gap open: training loss keeps falling while validation loss stalls far above it. That gap is **overfitting**.

## Step 5 — Compare, then sample

```python run shared title="Step 5 · neural net versus counting, and generated text"
four = train_ngram(train_data, 4, 0.1)
print(f"4-gram counts   : validation loss {nll(four, val_data, 4):.2f}")
print(f"neural network  : validation loss {evaluate(params, Xva, Yva):.2f}  (context of {C} characters, {n_params} parameters)")

def generate(params, prompt, n_chars, temperature=0.8, seed=0):
    rng = np.random.default_rng(seed)
    ids = [stoi[c] for c in prompt][-C:]
    out = list(prompt)
    for _ in range(n_chars):
        ctx = np.array([ids[-C:]])
        _, _, probs = forward(params, ctx)
        p = probs[0] ** (1 / temperature); p /= p.sum()      # temperature: sharpen or flatten the distribution
        nxt = int(rng.choice(V, p=p))
        ids.append(nxt); out.append(itos[nxt])
    return "".join(out)

prompt = "The model "
print("\n--- temperature 0.5 ---\n" + generate(params, prompt, 180, 0.5))
print("\n--- temperature 1.0 ---\n" + generate(params, prompt, 180, 1.0))
```

The samples are not Shakespeare. You should see word-like shapes, real short words and plausible spacing, with errors that grow as the context gets unusual. The exact text will differ a little from machine to machine because floating-point arithmetic differs slightly, and training amplifies tiny differences.

## How it works

| Idea | In the code |
|---|---|
| Next-token prediction | `make_xy` pairs each window of 5 characters with the character that follows |
| Embeddings | `params["E"]` rows are learned vectors; similar characters end up with similar rows |
| Non-linearity | `tanh` hidden layer lets the model combine the embeddings |
| Loss | cross-entropy: −log of the probability given to the true next character |
| Backpropagation | chain rule written out by hand, checked numerically |
| Optimiser | Adam: per-parameter step sizes from running averages of gradient and its square |
| Generalisation | held-out validation text exposes overfitting that training loss hides |
| Sampling | temperature reshapes the distribution before drawing the next character |

A Transformer replaces the "concatenate the last 5 embeddings and apply tanh" step with **attention**, which lets every position look at all earlier positions with learned weights, and stacks many such layers. The loss, the optimiser and the sampling are the same.

:::exercise Extend it
1. Change the context length `C` to 2, 5 and 8. How do validation loss and overfitting change?
2. Cut the training text to 2,000 characters (`TEXT[:2000]`) and watch the training loss fall far below the validation loss. Then add weight decay or early stopping and see if it helps.
3. Train on a much larger text (this whole course is a good source) and compare perplexity.
4. Replace `tanh` with ReLU and check the gradients with the numerical test.
5. Add a second hidden layer. How many parameters does it add, and does it help?
:::

:::keypoints
- A language model outputs a probability for every next token; training minimises cross-entropy, and perplexity is e^loss.
- Count-based n-grams are simple but cannot share statistics between similar contexts and get sparse as the context grows.
- A neural LM learns embeddings and a hidden layer by gradient descent; backprop is the chain rule and can be verified with a numerical gradient check.
- Always evaluate on held-out text: training loss falling while validation loss stalls means overfitting.
- Sampling temperature trades off safe, repetitive text against varied, error-prone text.
:::
