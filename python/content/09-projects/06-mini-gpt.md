---
title: Train a Tiny GPT from Scratch
level: advanced
time: 90
icon: sparkles
cover: #f97316,#a855f7
tags: transformer, autograd, numpy, language-model
summary: The capstone. Write a small autograd engine for tensors, build a GPT (embeddings, causal multi-head attention, MLP, LayerNorm, residuals), verify every gradient, train it on Shakespeare in your browser, and generate text — all in pure NumPy.
---

This is the project that removes the last bit of magic. You'll build — from an empty file — the same kind of model that powers ChatGPT and Claude: a **decoder-only Transformer**, trained with **backpropagation** and **AdamW** to predict the next character. It's tiny (~60k parameters vs billions), but every component is the real thing.

:::note Runtime
Training (Step 6) takes about 30–60 seconds in the browser. Run the steps in order, or press **▶ Run all steps**.
:::

:::flow What you'll build
Tokenizer + batches | characters → ids
Autograd engine | Tensor with backward()
Neural ops | GELU, softmax, LayerNorm, loss
Gradient check | prove it's correct
GPT model | attention + MLP blocks
Train | AdamW, loss curve
Generate | sample new text
:::

## Step 1 — Data: characters, ids and batches

```python run shared title="Step 1 · dataset"
import numpy as np
import time

TEXT = """To be, or not to be, that is the question:
Whether 'tis nobler in the mind to suffer
The slings and arrows of outrageous fortune,
Or to take arms against a sea of troubles
And by opposing end them. To die—to sleep,
No more; and by a sleep to say we end
The heart-ache and the thousand natural shocks
That flesh is heir to: 'tis a consummation
Devoutly to be wish'd. To die, to sleep;
To sleep, perchance to dream—ay, there's the rub:
For in that sleep of death what dreams may come,
When we have shuffled off this mortal coil,
Must give us pause—there's the respect
That makes calamity of so long life.
Shall I compare thee to a summer's day?
Thou art more lovely and more temperate:
Rough winds do shake the darling buds of May,
And summer's lease hath all too short a date;
Sometime too hot the eye of heaven shines,
And often is his gold complexion dimm'd;
And every fair from fair sometime declines,
By chance or nature's changing course untrimm'd;
But thy eternal summer shall not fade,
Nor lose possession of that fair thou ow'st;
Nor shall death brag thou wander'st in his shade,
When in eternal lines to time thou grow'st:
So long as men can breathe or eyes can see,
So long lives this, and this gives life to thee.
"""

chars = sorted(set(TEXT))
VOCAB = len(chars)
stoi = {c: i for i, c in enumerate(chars)}
itos = {i: c for c, i in stoi.items()}
encode = lambda s: np.array([stoi[c] for c in s])
decode = lambda ids: "".join(itos[int(i)] for i in ids)
data = encode(TEXT)

BLOCK = 32                                    # context length

def get_batch(rng, batch_size=16):
    starts = rng.integers(0, len(data) - BLOCK - 1, batch_size)
    x = np.stack([data[s:s + BLOCK] for s in starts])
    y = np.stack([data[s + 1:s + BLOCK + 1] for s in starts])     # targets = inputs shifted by one
    return x, y

x, y = get_batch(np.random.default_rng(0), 2)
print(f"{len(TEXT)} characters, vocabulary of {VOCAB}")
print("input :", repr(decode(x[0])))
print("target:", repr(decode(y[0])))
```

:::def Next-token targets
For a training sequence, the target at each position is simply the **next** character. One sequence of 32 characters therefore gives 32 training examples at once — position *t* learns to predict character *t + 1* from everything before it.
:::

## Step 2 — An autograd engine for tensors

Like the scalar `Value` class from the Backprop lesson, but each node holds a **NumPy array**. Each operation records how to send gradients back to its inputs.

```python run shared title="Step 2 · Tensor + core ops"
DTYPE = np.float32

def unbroadcast(grad, shape):
    """Sum a gradient back down to `shape` (undo NumPy broadcasting)."""
    while grad.ndim > len(shape):
        grad = grad.sum(axis=0)
    for axis, size in enumerate(shape):
        if size == 1 and grad.shape[axis] != 1:
            grad = grad.sum(axis=axis, keepdims=True)
    return grad

class Tensor:
    def __init__(self, data, parents=(), requires_grad=False):
        self.data = np.asarray(data, dtype=DTYPE)
        self.grad = None
        self.parents = parents
        self.backward_fn = None
        self.requires_grad = requires_grad or any(p.requires_grad for p in parents)

    def accumulate(self, g):
        if self.requires_grad:
            g = unbroadcast(g, self.data.shape)
            self.grad = g if self.grad is None else self.grad + g

    @property
    def shape(self):
        return self.data.shape

    def __add__(self, other):
        other = other if isinstance(other, Tensor) else Tensor(other)
        out = Tensor(self.data + other.data, (self, other))
        out.backward_fn = lambda g: (self.accumulate(g), other.accumulate(g))
        return out

    def __mul__(self, other):
        other = other if isinstance(other, Tensor) else Tensor(other)
        out = Tensor(self.data * other.data, (self, other))
        out.backward_fn = lambda g: (self.accumulate(g * other.data), other.accumulate(g * self.data))
        return out

    def __matmul__(self, other):
        out = Tensor(self.data @ other.data, (self, other))
        out.backward_fn = lambda g: (self.accumulate(g @ np.swapaxes(other.data, -1, -2)),
                                     other.accumulate(np.swapaxes(self.data, -1, -2) @ g))
        return out

    def reshape(self, *shape):
        out = Tensor(self.data.reshape(*shape), (self,))
        out.backward_fn = lambda g: self.accumulate(g.reshape(self.data.shape))
        return out

    def transpose(self, *axes):
        out = Tensor(self.data.transpose(*axes), (self,))
        inverse = np.argsort(axes)
        out.backward_fn = lambda g: self.accumulate(g.transpose(*inverse))
        return out

    def backward(self):
        # Topological order via an iterative depth-first search. (A recursive inner function that
        # calls itself would create a reference cycle keeping the whole graph alive after each step.)
        order, seen, stack = [], set(), [(self, False)]
        while stack:
            t, children_done = stack.pop()
            if children_done:
                order.append(t)
            elif id(t) not in seen:
                seen.add(id(t))
                stack.append((t, True))
                stack.extend((p, False) for p in t.parents)
        self.grad = np.ones_like(self.data)
        for t in reversed(order):
            if t.backward_fn is not None and t.grad is not None:
                t.backward_fn(t.grad)

def take(t, i):
    """t[i] along the first axis, with gradient."""
    out = Tensor(t.data[i], (t,))
    def bw(g):
        G = np.zeros_like(t.data)
        G[i] = g
        t.accumulate(G)
    out.backward_fn = bw
    return out

a = Tensor(np.ones((2, 3)), requires_grad=True)
b = Tensor(np.full((3, 4), 2.0), requires_grad=True)
(a @ b).backward()
print("dL/da =\n", a.grad, "\ndL/db =\n", b.grad)
```

:::def Unbroadcasting
When NumPy broadcasts (e.g. adding a bias of shape `(C,)` to activations of shape `(B, T, C)`), the backward pass must **sum** the gradient over the broadcast dimensions so it matches the original shape. That's all `unbroadcast` does — and forgetting it is the most common autograd bug.
:::

## Step 3 — Neural-network operations

```python run shared title="Step 3 · GELU, masked softmax, LayerNorm, embedding, loss"
def gelu(t):
    x = t.data
    th = np.tanh(0.7978845608 * (x + 0.044715 * x ** 3))
    out = Tensor(0.5 * x * (1 + th), (t,))
    def bw(g):
        dth = (1 - th ** 2) * 0.7978845608 * (1 + 3 * 0.044715 * x ** 2)
        t.accumulate(g * (0.5 * (1 + th) + 0.5 * x * dth))
    out.backward_fn = bw
    return out

def softmax(t, mask=None):
    x = t.data if mask is None else np.where(mask, t.data, -1e9)     # masked positions get ~0 probability
    e = np.exp(x - x.max(axis=-1, keepdims=True))
    s = e / e.sum(axis=-1, keepdims=True)
    out = Tensor(s, (t,))
    out.backward_fn = lambda g: t.accumulate(s * (g - (g * s).sum(axis=-1, keepdims=True)))
    return out

def layer_norm(t, gamma, beta, eps=1e-5):
    x = t.data
    mu, var = x.mean(-1, keepdims=True), x.var(-1, keepdims=True)
    inv = 1 / np.sqrt(var + eps)
    xhat = (x - mu) * inv
    out = Tensor(xhat * gamma.data + beta.data, (t, gamma, beta))
    def bw(g):
        n = x.shape[-1]
        gamma.accumulate((g * xhat).reshape(-1, n).sum(0))
        beta.accumulate(g.reshape(-1, n).sum(0))
        dx = g * gamma.data
        t.accumulate(inv / n * (n * dx - dx.sum(-1, keepdims=True) - xhat * (dx * xhat).sum(-1, keepdims=True)))
    out.backward_fn = bw
    return out

def embedding(table, ids):
    out = Tensor(table.data[ids], (table,))
    def bw(g):
        G = np.zeros_like(table.data)
        np.add.at(G, ids, g)                               # repeated ids accumulate gradient
        table.accumulate(G)
    out.backward_fn = bw
    return out

def cross_entropy(logits, targets):
    x = logits.data
    B, T, V = x.shape
    e = np.exp(x - x.max(-1, keepdims=True))
    p = (e / e.sum(-1, keepdims=True)).reshape(-1, V)
    rows = np.arange(B * T)
    out = Tensor(-np.log(p[rows, targets.ravel()] + 1e-9).mean(), (logits,))
    def bw(g):
        d = p.copy()
        d[rows, targets.ravel()] -= 1                       # softmax + cross-entropy gradient: p - one_hot
        logits.accumulate(g * d.reshape(B, T, V) / (B * T))
    out.backward_fn = bw
    return out

print("ops ready")
```

## Step 4 — The GPT model

```python run shared title="Step 4 · GPT"
class Param(Tensor):
    def __init__(self, data):
        super().__init__(data, requires_grad=True)

class GPT:
    def __init__(self, vocab, d_model=48, n_heads=4, n_layers=2, block=BLOCK, seed=0):
        rng = np.random.default_rng(seed)
        init = lambda *shape, std=0.02: Param(rng.normal(0, std, shape))
        self.n_heads, self.block = n_heads, block
        self.tok_emb, self.pos_emb = init(vocab, d_model), init(block, d_model)
        self.blocks = [{
            "ln1_g": Param(np.ones(d_model)), "ln1_b": Param(np.zeros(d_model)),
            "W_qkv": init(d_model, 3 * d_model), "W_o": init(d_model, d_model, std=0.02 / np.sqrt(2 * n_layers)),
            "ln2_g": Param(np.ones(d_model)), "ln2_b": Param(np.zeros(d_model)),
            "W_up": init(d_model, 4 * d_model), "W_down": init(4 * d_model, d_model, std=0.02 / np.sqrt(2 * n_layers)),
        } for _ in range(n_layers)]
        self.lnf_g, self.lnf_b = Param(np.ones(d_model)), Param(np.zeros(d_model))
        self.lm_head = init(d_model, vocab)
        self.attention_maps = []

    def parameters(self):
        ps = [self.tok_emb, self.pos_emb, self.lnf_g, self.lnf_b, self.lm_head]
        for blk in self.blocks:
            ps += list(blk.values())
        return ps

    def attention(self, x, blk):
        B, T, C = x.shape
        H, hd = self.n_heads, C // self.n_heads
        qkv = (x @ blk["W_qkv"]).reshape(B, T, 3, H, hd).transpose(2, 0, 3, 1, 4)   # (3, B, H, T, hd)
        q, k, v = take(qkv, 0), take(qkv, 1), take(qkv, 2)
        scores = (q @ k.transpose(0, 1, 3, 2)) * (1 / np.sqrt(hd))                  # (B, H, T, T)
        weights = softmax(scores, mask=np.tril(np.ones((T, T), dtype=bool)))         # causal mask
        self.attention_maps.append(weights.data)
        out = (weights @ v).transpose(0, 2, 1, 3).reshape(B, T, C)                    # merge heads
        return out @ blk["W_o"]

    def __call__(self, ids):
        B, T = ids.shape
        self.attention_maps = []
        x = embedding(self.tok_emb, ids) + embedding(self.pos_emb, np.arange(T))
        for blk in self.blocks:
            x = x + self.attention(layer_norm(x, blk["ln1_g"], blk["ln1_b"]), blk)               # attention + residual
            x = x + gelu(layer_norm(x, blk["ln2_g"], blk["ln2_b"]) @ blk["W_up"]) @ blk["W_down"]  # MLP + residual
        return layer_norm(x, self.lnf_g, self.lnf_b) @ self.lm_head                              # logits (B, T, vocab)

model = GPT(VOCAB)
print(f"parameters: {sum(p.data.size for p in model.parameters()):,}")
logits = model(x)
print("logits shape:", logits.shape, "→ one score per vocabulary character, at every position")
print(f"initial loss: {float(cross_entropy(logits, y).data):.3f}  (random guessing = ln({VOCAB}) = {np.log(VOCAB):.3f})")
```

## Step 5 — Prove the gradients are right

```python run shared title="Step 5 · gradient check"
DTYPE = np.float64                                   # high precision for checking
check = GPT(VOCAB, d_model=8, n_heads=2, n_layers=1, seed=3)
rng = np.random.default_rng(1)
for p in check.parameters():
    p.data = p.data + rng.normal(0, 0.3, p.data.shape)
xb, yb = get_batch(rng, 2)
xb, yb = xb[:, :6], yb[:, :6]
loss = cross_entropy(check(xb), yb)
loss.backward()

worst = 0.0
for p in check.parameters():
    i = tuple(rng.integers(0, s) for s in p.data.shape)
    old = p.data[i]
    p.data[i] = old + 1e-5; up = float(cross_entropy(check(xb), yb).data)
    p.data[i] = old - 1e-5; down = float(cross_entropy(check(xb), yb).data)
    p.data[i] = old
    worst = max(worst, abs((up - down) / 2e-5 - p.grad[i]))
DTYPE = np.float32
print(f"largest difference between backprop and numerical gradients: {worst:.2e}")
print("✅ gradients are correct" if worst < 1e-6 else "❌ something is wrong")
```

## Step 6 — Train it

```python run shared title="Step 6 · training loop with AdamW"
import matplotlib.pyplot as plt

class AdamW:
    def __init__(self, params, lr=4e-3, weight_decay=0.01, betas=(0.9, 0.999)):
        self.params, self.lr, self.wd, (self.b1, self.b2), self.t = params, lr, weight_decay, betas, 0
        self.m = [np.zeros_like(p.data) for p in params]
        self.v = [np.zeros_like(p.data) for p in params]

    def step(self):
        self.t += 1
        for p, m, v in zip(self.params, self.m, self.v):
            if p.grad is None:
                continue
            m[:] = self.b1 * m + (1 - self.b1) * p.grad
            v[:] = self.b2 * v + (1 - self.b2) * p.grad ** 2
            m_hat, v_hat = m / (1 - self.b1 ** self.t), v / (1 - self.b2 ** self.t)
            decay = self.wd * p.data if p.data.ndim > 1 else 0      # no decay on biases / norms
            p.data -= self.lr * (m_hat / (np.sqrt(v_hat) + 1e-8) + decay)
            p.grad = None                                           # "zero_grad"

model = GPT(VOCAB)
optimizer = AdamW(model.parameters())
rng = np.random.default_rng(0)
losses, start = [], time.time()
for step in range(601):
    xb, yb = get_batch(rng)
    loss = cross_entropy(model(xb), yb)        # forward
    loss.backward()                            # backward
    optimizer.step()                           # update
    losses.append(float(loss.data))
    if step % 150 == 0:
        print(f"step {step:3d}  loss {np.mean(losses[-20:]):.3f}  ({time.time() - start:.1f}s)")

fig, ax = plt.subplots(figsize=(7, 3.4))
ax.plot(losses, alpha=0.35, label="batch loss")
ax.plot(np.convolve(losses, np.ones(20) / 20, mode="valid"), linewidth=2, label="moving average")
ax.axhline(np.log(VOCAB), color="gray", linestyle="--", label="random guessing")
ax.set(title="Training our tiny GPT", xlabel="step", ylabel="cross-entropy")
ax.legend()
plt.show()
```

## Step 7 — Generate text

```python run shared title="Step 7 · sampling"
def generate(model, prompt, n_chars=200, temperature=0.8, top_k=8, seed=0):
    rng = np.random.default_rng(seed)
    ids = list(encode(prompt))
    for _ in range(n_chars):
        context = np.array([ids[-model.block:]])               # crop to the context window
        logits = model(context).data[0, -1] / temperature       # scores for the NEXT character
        top = np.argsort(logits)[-top_k:]                       # top-k filtering
        p = np.exp(logits[top] - logits[top].max())
        p /= p.sum()
        ids.append(int(rng.choice(top, p=p)))
    return decode(ids)

for t in [0.5, 1.0]:
    print(f"--- temperature {t} ---")
    print(generate(model, "To be", temperature=t, seed=1))
    print()
```

It learned spelling, words, punctuation and line structure from 1,200 characters in seconds — and it remixes phrases in ways that don't exist in the training text.

## Step 8 — Look inside: attention patterns

```python run shared title="Step 8 · attention heatmaps"
prompt = "So long lives this, and this"             # must fit in the 32-character context
model(np.array([encode(prompt)[-BLOCK:]]))
att = model.attention_maps[-1][0]                           # last layer, batch item 0 → (heads, T, T)

fig, axes = plt.subplots(1, att.shape[0], figsize=(13, 3.4))
for h, ax in enumerate(axes):
    ax.imshow(att[h], cmap="magma")
    ax.set_title(f"layer 2 · head {h}")
    ax.set_xticks(range(len(prompt)), list(prompt), fontsize=6)
    ax.set_yticks([])
plt.show()
```

Each row shows which earlier characters that position attended to. Some heads focus on the immediately previous characters; others look further back — patterns the model discovered by itself.

## From here to a real LLM

| Our tiny GPT | A production LLM |
|---|---|
| ~60k parameters | billions to trillions |
| 46-character vocabulary | 50k–250k BPE tokens (your Project 1!) |
| context 32 | hundreds of thousands of tokens |
| 1.2 KB of Shakespeare | trillions of tokens of text and code |
| NumPy on a CPU | PyTorch/JAX on thousands of GPUs, mixed precision |
| 600 steps in seconds | weeks of training, then fine-tuning (SFT, RLHF/RLAIF) |

The **architecture and training loop are the same**. To go further, port this to PyTorch on your computer — `nn.Embedding`, `F.scaled_dot_product_attention(is_causal=True)`, `nn.LayerNorm`, `torch.optim.AdamW` — and train on a bigger dataset (Andrej Karpathy's *nanoGPT* is an excellent next step).

:::exercise Extensions
1. Increase `d_model` to 64 and `n_layers` to 3, train 800 steps — does the loss go lower? Does the text look better?
2. Add **learning-rate warmup + cosine decay** to the training loop.
3. Hold out the last 15% of `TEXT` as a validation set and plot validation loss — when does it start to overfit?
4. Replace the character tokenizer with your **BPE tokenizer** from Project 1.
:::

:::keypoints
- A GPT is: **token + position embeddings → N × (causal attention + MLP, each with LayerNorm and a residual) → LayerNorm → linear head**.
- An autograd engine needs each op's forward and backward, plus **unbroadcasting** and a topological backward pass.
- **Gradient checking** proves backprop is correct before you trust a training run.
- Training = batches of next-token prediction, **cross-entropy**, backprop, **AdamW**.
- Generation = repeatedly sample the next token (temperature, top-k) and feed it back in.
:::
