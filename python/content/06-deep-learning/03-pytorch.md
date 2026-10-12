---
title: PyTorch Essentials
level: advanced
time: 40
summary: The deep-learning framework behind most modern AI research and LLMs. Tensors, autograd, nn.Module, the training loop, DataLoaders, GPUs and saving models — mapped one-to-one onto what you built from scratch.
---

You have built neural networks and an autograd engine yourself. **PyTorch** is the professional version of exactly that: GPU-accelerated tensors + automatic gradients + ready-made layers and optimizers. Hugging Face Transformers, most open LLMs, and most AI research are written in PyTorch.

:::note Run these on your computer
PyTorch is too large to run inside this web page, so the code here is marked **Run locally**. Install it with `pip install torch` (see [pytorch.org](https://pytorch.org/get-started/locally/) for the GPU version), or open a free **Google Colab** notebook, which has PyTorch and a GPU ready. Expected outputs are shown under each example.
:::

## From NumPy to PyTorch

| You built | PyTorch equivalent |
|---|---|
| `np.array` | `torch.tensor` |
| `Value` + `.backward()` | `requires_grad=True` + `loss.backward()` |
| `X @ W + b` layer | `nn.Linear(in, out)` |
| `np.maximum(0, z)` | `nn.ReLU()` / `F.relu` |
| softmax + cross-entropy by hand | `nn.CrossEntropyLoss()` (takes raw logits) |
| `W -= lr * grad` | `torch.optim.SGD` / `AdamW` |
| shuffling + slicing batches | `DataLoader` |

## Tensors

:::def Tensor
PyTorch's array type: like a NumPy array, but it can live on a **GPU** and can track operations for automatic differentiation.
:::

```python local title="tensors.py"
import torch

x = torch.tensor([[1.0, 2.0], [3.0, 4.0]])
print(x.shape, x.dtype)                 # torch.Size([2, 2]) torch.float32
print(x @ x.T)                          # matrix multiply, like NumPy
print(torch.zeros(2, 3), torch.randn(2, 3))
print(x.mean(dim=0))                    # 'dim' instead of NumPy's 'axis'

a = x.numpy()                           # tensor -> NumPy (shares memory on CPU)
b = torch.from_numpy(a)                 # NumPy -> tensor
print(x.view(4), x.reshape(1, 4).shape) # reshaping
print(x.unsqueeze(0).shape)             # add a dimension: torch.Size([1, 2, 2])
```

```output
torch.Size([2, 2]) torch.float32
tensor([[ 5., 11.],
        [11., 25.]])
...
```

### Devices: CPU, GPU, Apple Silicon

```python local
import torch

device = (
    "cuda" if torch.cuda.is_available()          # NVIDIA GPU
    else "mps" if torch.backends.mps.is_available()   # Apple Silicon
    else "cpu"
)
print("using", device)
x = torch.randn(1000, 1000, device=device)       # create directly on the device
y = x @ x                                        # runs on the GPU if available
model_input = torch.randn(32, 10).to(device)     # or move with .to(device)
```

:::warn Same device rule
Every tensor in an operation must be on the **same device**. `Expected all tensors to be on the same device` means you forgot to `.to(device)` the model or a batch.
:::

## Autograd

```python local title="autograd.py"
import torch

w = torch.tensor(3.0, requires_grad=True)
b = torch.tensor(1.0, requires_grad=True)
x, y = torch.tensor(2.0), torch.tensor(10.0)

loss = (w * x + b - y) ** 2       # forward pass — PyTorch records the graph
loss.backward()                   # backward pass — fills .grad
print(w.grad, b.grad)             # tensor(-12.) tensor(-6.)  — same as our chain-rule example!
```

This is exactly your `Value` class, for tensors of any size.

## Building a model with nn.Module

:::def nn.Module
The base class for every PyTorch model and layer. You create the layers in `__init__` and describe the forward pass in `forward()`. Calling `model(x)` runs `forward(x)`. All learnable parameters are found automatically.
:::

```python local title="model.py"
import torch
from torch import nn

class MLP(nn.Module):
    def __init__(self, in_features: int, hidden: int, n_classes: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_features, hidden),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, n_classes),      # raw logits (no softmax here!)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)

model = MLP(in_features=2, hidden=64, n_classes=2)
print(model)
print("parameters:", sum(p.numel() for p in model.parameters()))
logits = model(torch.randn(5, 2))           # batch of 5 -> shape (5, 2)
print(logits.shape)
```

```output
MLP(
  (net): Sequential(
    (0): Linear(in_features=2, out_features=64, bias=True)
    (1): ReLU()
    (2): Dropout(p=0.1, inplace=False)
    (3): Linear(in_features=64, out_features=64, bias=True)
    (4): ReLU()
    (5): Linear(in_features=64, out_features=2, bias=True)
  )
)
parameters: 4482
torch.Size([5, 2])
```

:::tip CrossEntropyLoss takes logits
`nn.CrossEntropyLoss` applies log-softmax **internally** for numerical stability. Give it the raw outputs of your last `nn.Linear`, and integer class labels — don't apply softmax yourself.
:::

## The training loop

This is the most important code pattern in deep learning. Memorise its shape:

```python local title="train.py — the complete recipe"
import torch
from torch import nn
from torch.utils.data import TensorDataset, DataLoader, random_split
from sklearn.datasets import make_moons

torch.manual_seed(0)
device = "cuda" if torch.cuda.is_available() else "cpu"

# 1. data
X, y = make_moons(n_samples=2000, noise=0.2, random_state=0)
dataset = TensorDataset(torch.tensor(X, dtype=torch.float32), torch.tensor(y))
train_ds, val_ds = random_split(dataset, [1600, 400])
train_dl = DataLoader(train_ds, batch_size=64, shuffle=True)
val_dl = DataLoader(val_ds, batch_size=256)

# 2. model, loss, optimizer
model = nn.Sequential(nn.Linear(2, 64), nn.ReLU(), nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, 2)).to(device)
loss_fn = nn.CrossEntropyLoss()
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-2)

# 3. train
for epoch in range(20):
    model.train()                                   # training mode (dropout on)
    for xb, yb in train_dl:
        xb, yb = xb.to(device), yb.to(device)
        logits = model(xb)                          # forward
        loss = loss_fn(logits, yb)                  # loss
        optimizer.zero_grad()                       # clear old gradients
        loss.backward()                             # backprop
        optimizer.step()                            # update weights

    # 4. evaluate
    model.eval()                                    # evaluation mode (dropout off)
    correct = total = 0
    with torch.no_grad():                           # no graph needed -> faster, less memory
        for xb, yb in val_dl:
            preds = model(xb.to(device)).argmax(dim=1)
            correct += (preds == yb.to(device)).sum().item()
            total += len(yb)
    if epoch % 5 == 0 or epoch == 19:
        print(f"epoch {epoch:2d}  last batch loss {loss.item():.4f}  val acc {correct / total:.1%}")
```

```output
epoch  0  last batch loss 0.3141  val acc 85.8%
epoch  5  last batch loss 0.1123  val acc 96.5%
epoch 10  last batch loss 0.0611  val acc 97.0%
epoch 15  last batch loss 0.0479  val acc 97.2%
epoch 19  last batch loss 0.0810  val acc 97.0%
```

:::flow The training loop, every time
model(xb) | forward
loss_fn(...) | measure error
zero_grad() | clear old grads
loss.backward() | compute grads
optimizer.step() | update weights
:::

:::warn The four classic bugs
1. Forgetting `optimizer.zero_grad()` → gradients pile up across steps.
2. Forgetting `model.eval()` / `torch.no_grad()` when evaluating → dropout stays on, memory explodes.
3. Applying softmax before `CrossEntropyLoss` → worse training.
4. Model and data on different devices.
:::

## Datasets and DataLoaders

:::def Dataset and DataLoader
A `Dataset` knows how to return **one** example by index (`__getitem__`) and how many there are (`__len__`). A `DataLoader` wraps it to produce shuffled **mini-batches**, optionally using several worker processes.
:::

```python local title="A custom text dataset"
import torch
from torch.utils.data import Dataset, DataLoader

class ReviewDataset(Dataset):
    def __init__(self, texts, labels, vocab, max_len=32):
        self.texts, self.labels, self.vocab, self.max_len = texts, labels, vocab, max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, i):
        ids = [self.vocab.get(w, 1) for w in self.texts[i].lower().split()][: self.max_len]
        ids += [0] * (self.max_len - len(ids))           # pad to a fixed length
        return torch.tensor(ids), torch.tensor(self.labels[i])

texts = ["great course", "terrible audio", "loved the examples"]
vocab = {"<pad>": 0, "<unk>": 1, "great": 2, "course": 3, "terrible": 4, "loved": 5}
dl = DataLoader(ReviewDataset(texts, [1, 0, 1], vocab), batch_size=2, shuffle=True)
for ids, labels in dl:
    print(ids.shape, labels)          # torch.Size([2, 32]) tensor([...])
```

## Layers you will meet

| Layer | Purpose |
|---|---|
| `nn.Linear(in, out)` | dense layer |
| `nn.Embedding(vocab, dim)` | token id → vector lookup table |
| `nn.Conv2d(c_in, c_out, k)` | image convolution |
| `nn.LSTM`, `nn.GRU` | recurrent layers |
| `nn.MultiheadAttention`, `F.scaled_dot_product_attention` | attention |
| `nn.LayerNorm`, `nn.BatchNorm1d` | normalization |
| `nn.Dropout(p)` | regularization |
| `nn.TransformerEncoderLayer` | a full Transformer block |

```python local title="An embedding layer = a lookup table"
import torch
from torch import nn

emb = nn.Embedding(num_embeddings=50_000, embedding_dim=768)   # vocab of 50k tokens
token_ids = torch.tensor([[15496, 11, 995]])                    # batch of 1 sentence, 3 tokens
vectors = emb(token_ids)
print(vectors.shape)                                            # torch.Size([1, 3, 768])
```

## Saving and loading

```python local
import torch

torch.save(model.state_dict(), "model.pt")         # save only the weights (recommended)

model = MLP(2, 64, 2)                              # rebuild the architecture...
model.load_state_dict(torch.load("model.pt", weights_only=True))   # ...then load weights
model.eval()
```

:::def state_dict
A dictionary mapping each layer's name to its parameter tensors. Saving the state dict (rather than the whole object) is the portable, recommended way. Hugging Face uses the safer **safetensors** format for the same purpose.
:::

## Inference

```python local
import torch

model.eval()
with torch.inference_mode():                 # like no_grad, even faster
    x = torch.tensor([[0.5, -0.2]])
    probs = torch.softmax(model(x), dim=-1)
    print(probs, probs.argmax(dim=-1).item())
```

## Speed and memory features

```python local title="Mixed precision and torch.compile"
import torch

model = torch.compile(model)                                   # JIT-compile for speed (PyTorch 2.x)

scaler_dtype = torch.bfloat16                                  # half precision on modern GPUs
with torch.autocast(device_type="cuda", dtype=scaler_dtype):
    logits = model(xb)                                         # matmuls run in bf16: ~2x faster, half the memory
    loss = loss_fn(logits, yb)
```

| Feature | Benefit |
|---|---|
| `torch.autocast` (bf16/fp16) | 2× speed, half memory on modern GPUs |
| `torch.compile` | fuses operations for speed |
| gradient accumulation | simulate big batches on small GPUs |
| `torch.nn.utils.clip_grad_norm_` | prevents exploding gradients |
| gradient checkpointing | trade compute for memory on huge models |

## The same model in the browser (NumPy version)

To connect everything, here is the `train.py` recipe above re-written with plain NumPy and the **Adam** optimizer — runnable right here. Compare it line by line with the PyTorch version.

```python run level=advanced
import numpy as np
from sklearn.datasets import make_moons

rng = np.random.default_rng(0)
X, y = make_moons(n_samples=2000, noise=0.2, random_state=0)
idx = rng.permutation(len(X)); tr, va = idx[:1600], idx[1600:]

sizes = [2, 64, 64, 2]
params = []
for m, n in zip(sizes[:-1], sizes[1:]):
    params += [rng.normal(0, np.sqrt(2 / m), (m, n)), np.zeros(n)]
m_state = [np.zeros_like(p) for p in params]; v_state = [np.zeros_like(p) for p in params]

def forward(Xb):
    cache, a = [], Xb
    for i in range(0, len(params), 2):
        z = a @ params[i] + params[i + 1]
        cache.append((a, z))
        a = np.maximum(0, z) if i < len(params) - 2 else z
    return a, cache

def backward(logits, cache, yb):
    p = np.exp(logits - logits.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
    d = (p - np.eye(2)[yb]) / len(yb)
    grads = [None] * len(params)
    for layer in reversed(range(len(cache))):
        a_in, z = cache[layer]
        if layer < len(cache) - 1:
            d = d * (z > 0)
        grads[2 * layer], grads[2 * layer + 1] = a_in.T @ d, d.sum(0)
        d = d @ params[2 * layer].T
    return grads, -np.mean(np.log(p[np.arange(len(yb)), yb] + 1e-12))

lr, b1, b2, t = 1e-3, 0.9, 0.999, 0
for epoch in range(20):
    order = rng.permutation(tr)
    for s in range(0, len(order), 64):
        bi = order[s:s + 64]
        logits, cache = forward(X[bi])                              # forward
        grads, loss = backward(logits, cache, y[bi])                # loss + backprop
        t += 1
        for k, g in enumerate(grads):                               # Adam step
            m_state[k] = b1 * m_state[k] + (1 - b1) * g
            v_state[k] = b2 * v_state[k] + (1 - b2) * g * g
            mh, vh = m_state[k] / (1 - b1 ** t), v_state[k] / (1 - b2 ** t)
            params[k] -= lr * mh / (np.sqrt(vh) + 1e-8)
    if epoch % 5 == 0 or epoch == 19:
        acc = np.mean(forward(X[va])[0].argmax(1) == y[va])
        print(f"epoch {epoch:2d}  last batch loss {loss:.4f}  val acc {acc:.1%}")
```

:::ai
When you load an open LLM with Hugging Face (`AutoModelForCausalLM.from_pretrained(...)`), you get an `nn.Module`. Fine-tuning it — including LoRA — is this same training loop, with a tokenizer feeding batches of token IDs and cross-entropy on the next token.
:::

## Check yourself

```quiz
? What must you call before `loss.backward()` in each training step?
+ optimizer.zero_grad()
- model.eval()
- torch.no_grad()
> Otherwise gradients from previous batches are added in.

? What should go into nn.CrossEntropyLoss?
+ Raw logits and integer class labels
- Softmax probabilities and one-hot labels
- Predicted class ids
> It applies log-softmax internally.

? Why wrap evaluation in `torch.no_grad()`?
+ No computation graph is stored, saving memory and time
- It makes the model more accurate
- It's required to call model()
> Gradients are only needed for training.

? What does `model.eval()` change?
+ It switches layers like dropout and batch-norm to inference behaviour
- It disables gradients
- It moves the model to the GPU
> Use it together with no_grad / inference_mode.
```

:::keypoints
- Tensors = NumPy arrays + GPU + autograd. Move model and data to the same `device`.
- Models subclass `nn.Module`: layers in `__init__`, math in `forward`.
- The loop: `model(x)` → `loss_fn` → `zero_grad()` → `backward()` → `step()`.
- `Dataset` + `DataLoader` deliver shuffled mini-batches.
- `model.eval()` + `torch.no_grad()` for evaluation; save `state_dict()`.
:::
