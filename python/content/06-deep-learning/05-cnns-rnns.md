---
title: CNNs, RNNs & Why Transformers Won
level: advanced
time: 32
summary: Convolutions for images and recurrent networks for sequences — built from scratch so you understand them — and the limitations that led to the Transformer architecture behind today's LLMs.
---

Before Transformers took over, two architectures dominated: **CNNs** for images and **RNNs** for sequences like text. They are still used (and CNN ideas live on in vision models), and understanding their limits explains why attention was such a breakthrough.

## Convolutional Neural Networks (CNNs)

:::def Convolution
Sliding a small grid of weights (a **filter** or **kernel**) across an image, computing a weighted sum at each position. The result is a **feature map** showing where the pattern the filter detects (an edge, a corner, a texture) appears.
:::

:::analogy
A convolution filter is like a **stencil** you slide over a picture. Wherever the picture underneath matches the stencil's pattern, you get a bright spot. A CNN learns its own stencils — first edges, then shapes, then whole objects.
:::

### Convolution from scratch

```python run level=intermediate
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_digits

def conv2d(image, kernel):
    kh, kw = kernel.shape
    H, W = image.shape[0] - kh + 1, image.shape[1] - kw + 1
    out = np.zeros((H, W))
    for i in range(H):
        for j in range(W):
            out[i, j] = np.sum(image[i:i + kh, j:j + kw] * kernel)    # weighted sum of a patch
    return out

digit = load_digits().images[0]            # an 8x8 image of a "0"
digit = np.kron(digit, np.ones((4, 4)))    # upscale to 32x32 so the effect is visible

kernels = {
    "vertical edges": np.array([[1, 0, -1], [2, 0, -2], [1, 0, -1]]),
    "horizontal edges": np.array([[1, 2, 1], [0, 0, 0], [-1, -2, -1]]),
    "blur": np.ones((3, 3)) / 9,
}
fig, axes = plt.subplots(1, 4, figsize=(11, 3))
axes[0].imshow(digit, cmap="gray"); axes[0].set_title("input")
for ax, (name, k) in zip(axes[1:], kernels.items()):
    ax.imshow(conv2d(digit, k), cmap="gray"); ax.set_title(name)
for ax in axes: ax.axis("off")
plt.show()
```

In a CNN, nobody hand-designs those kernels — they are **learned** by backprop, just like any other weights.

### Why convolutions suit images

- **Local patterns**: nearby pixels belong together; a 3×3 filter looks at a small neighbourhood.
- **Weight sharing**: the same filter is used everywhere, so a cat ear is detected anywhere in the image — with far fewer parameters than a dense layer.
- **Hierarchy**: stacked layers combine edges → textures → parts → objects.

```python run level=intermediate
dense_params = (224 * 224 * 3) * 64           # dense layer: every pixel to 64 neurons
conv_params = (3 * 3 * 3) * 64 + 64           # 64 filters of size 3x3x3 + biases
print(f"dense layer:       {dense_params:,} parameters")
print(f"convolution layer: {conv_params:,} parameters")
```

:::def Pooling
Shrinking a feature map by keeping one value per small window — usually the **maximum** (max pooling). It makes the network cheaper and more tolerant to small shifts.
:::

```python run level=intermediate
import numpy as np

def max_pool(x, size=2):
    H, W = x.shape[0] // size, x.shape[1] // size
    return x[:H * size, :W * size].reshape(H, size, W, size).max(axis=(1, 3))

fmap = np.array([[1, 3, 2, 0],
                 [4, 6, 1, 1],
                 [0, 2, 9, 8],
                 [1, 1, 7, 5]])
print(max_pool(fmap))
```

A typical CNN: `[conv → ReLU → pool] × N → flatten → dense → softmax`.

```python local title="A small CNN in PyTorch"
import torch
from torch import nn

cnn = nn.Sequential(
    nn.Conv2d(1, 16, kernel_size=3, padding=1), nn.ReLU(), nn.MaxPool2d(2),   # 28x28 -> 14x14
    nn.Conv2d(16, 32, kernel_size=3, padding=1), nn.ReLU(), nn.MaxPool2d(2),  # 14x14 -> 7x7
    nn.Flatten(),
    nn.Linear(32 * 7 * 7, 128), nn.ReLU(),
    nn.Linear(128, 10),
)
print(cnn(torch.randn(8, 1, 28, 28)).shape)    # torch.Size([8, 10]) — 10 class scores per image
```

### A CNN-style classifier in the browser

Here is a quick experiment: hand-made convolution features + logistic regression on the 8×8 digits dataset.

```python run level=advanced
import numpy as np
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

digits = load_digits()
imgs, y = digits.images / 16, digits.target

kernels = [np.array([[1, 0, -1]] * 3), np.array([[1, 0, -1]] * 3).T,
           np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]]), np.ones((3, 3)) / 9]

def conv_features(img):
    windows = np.lib.stride_tricks.sliding_window_view(img, (3, 3))          # all 3x3 patches at once
    maps = [np.maximum(0, (windows * k).sum(axis=(-1, -2))) for k in kernels]   # conv + ReLU
    pooled = [m.reshape(3, 2, 3, 2).max(axis=(1, 3)) for m in maps]         # 6x6 -> 3x3 max pool
    return np.concatenate([p.ravel() for p in pooled])

X_raw = imgs.reshape(len(imgs), -1)
X_conv = np.array([conv_features(im) for im in imgs])
for name, X in [("raw pixels (64 features)", X_raw), (f"conv features ({X_conv.shape[1]} features)", X_conv)]:
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
    acc = LogisticRegression(max_iter=3000).fit(Xtr, ytr).score(Xte, yte)
    print(f"{name:<32} test accuracy {acc:.3f}")
```

## Recurrent Neural Networks (RNNs)

Text is a **sequence** — word order matters. RNNs read a sequence one step at a time, carrying a **hidden state** that summarises everything seen so far.

:::def Recurrent neural network (RNN)
A network that processes a sequence step by step. At each step it combines the current input with its **hidden state** from the previous step: `h_t = tanh(x_t · W_x + h_{t−1} · W_h + b)`. The final hidden state summarises the whole sequence.
:::

:::analogy
Reading a sentence word by word while keeping a running mental summary. By the end of a long paragraph, the details from the first sentence have faded — that is the RNN's main weakness.
:::

```python run level=intermediate
import numpy as np

rng = np.random.default_rng(0)
vocab = {"i": 0, "love": 1, "deep": 2, "learning": 3, "hate": 4, "bugs": 5}
emb = rng.normal(0, 1, (len(vocab), 4))           # 4-dim word embeddings
Wx = rng.normal(0, 0.5, (4, 6))                   # input -> hidden
Wh = rng.normal(0, 0.5, (6, 6))                   # hidden -> hidden (the "memory")
b = np.zeros(6)

def rnn(sentence):
    h = np.zeros(6)
    for t, word in enumerate(sentence.split()):
        x = emb[vocab[word]]
        h = np.tanh(x @ Wx + h @ Wh + b)          # new state from input + old state
        print(f"  t={t} '{word:<8}' h={h.round(2)}")
    return h

h1 = rnn("i love deep learning")
h2 = rnn("i hate bugs")
print("final states differ by:", np.linalg.norm(h1 - h2).round(3))
```

### The problem: vanishing memory

Gradients (and information) must flow back through **every** time step, being multiplied by `Wh` again and again. Over long sequences they shrink to nothing:

```python run level=advanced
import numpy as np

rng = np.random.default_rng(1)
Wh = rng.normal(0, 0.3, (32, 32))
grad = np.ones(32)
for t in range(1, 101):
    grad = grad @ Wh.T * 0.8                       # chain through one step (tanh' ≤ 1)
    if t in (1, 5, 10, 25, 50, 100):
        print(f"after {t:3d} steps back, gradient size = {np.linalg.norm(grad):.2e}")
```

:::def LSTM and GRU
Improved RNNs with **gates** — small learned switches that decide what to remember, what to forget and what to output. They keep information much longer than a plain RNN and dominated NLP from about 2014 to 2017.
:::

Even LSTMs have two hard limits:

1. **Sequential**: step `t` needs step `t−1` first, so you can't parallelize over the sequence → slow on GPUs.
2. **Bottleneck**: everything must squeeze through one fixed-size hidden state; long-range details still fade.

## Enter attention and the Transformer

In 2017 the paper *"Attention Is All You Need"* removed recurrence entirely. Instead of passing a state along, **every token looks directly at every other token** and decides how much each matters.

| | RNN / LSTM | Transformer |
|---|---|---|
| how tokens interact | through a chain of hidden states | directly, via attention |
| path length between distant words | grows with distance | **1 step** |
| training parallelism | sequential over time | **all positions at once** |
| scales with GPUs and data | poorly | extremely well |

```python run level=intermediate
import numpy as np

tokens = "The trophy didn't fit in the suitcase because it was too big".split()
# Toy attention weights for the word "it": which earlier words does it look at?
scores = np.array([0.1, 3.0, 0.2, 0.3, 0.1, 0.1, 1.2, 0.2, 0.0, 0.0, 0.0, 0.8])
weights = np.exp(scores) / np.exp(scores).sum()
i = tokens.index("it")
print(f"'{tokens[i]}' attends to:")
for tok, w in sorted(zip(tokens, weights), key=lambda p: -p[1])[:4]:
    print(f"  {tok:<10} {w:.2f}  {'█' * int(w * 40)}")
```

The word "it" can look straight back at "trophy" — no matter how far away — in a single step. You will build real attention in the next module.

:::ai
- **CNNs** live on in image models and in the patch-embedding front-end of Vision Transformers, and in the U-Nets of many image-generation (diffusion) models.
- **RNN ideas** are making a comeback in efficient "state-space" models (like Mamba) that try to combine RNN speed at inference with Transformer-quality training.
- **Transformers** power essentially all modern LLMs: Claude, GPT, Gemini, Llama.
:::

## Check yourself

```quiz
? Why do CNNs need far fewer parameters than dense layers on images?
+ The same small filter is reused at every position (weight sharing)
- They ignore most pixels
- They use smaller numbers
> One 3×3 filter scans the whole image.

? What does an RNN's hidden state represent?
+ A running summary of the sequence so far
- The current word only
- The final prediction
> It's updated at every step from the new input and the previous state.

? What is the main reason Transformers replaced RNNs?
+ They process all positions in parallel and connect distant tokens directly via attention
- They have fewer parameters
- They don't need training data
> Parallel training on GPUs + no long chains for information to fade through.

? What does max pooling do?
+ Keeps the largest value in each small window, shrinking the feature map
- Averages the whole image
- Adds more filters
> It reduces size and adds a little tolerance to small shifts.
```

:::exercise Design a detector
Create a 5×5 "diagonal line" image (ones on the main diagonal, zeros elsewhere) and a 3×3 kernel that responds strongly to diagonal lines going top-left to bottom-right. Convolve and print the feature map — the biggest values should lie along the diagonal.
:::

:::solution
```python run
import numpy as np

def conv2d(image, kernel):
    kh, kw = kernel.shape
    return np.array([[np.sum(image[i:i + kh, j:j + kw] * kernel)
                      for j in range(image.shape[1] - kw + 1)]
                     for i in range(image.shape[0] - kh + 1)])

image = np.eye(5)
kernel = np.array([[ 1, -1, -1],
                   [-1,  1, -1],
                   [-1, -1,  1]])
print(conv2d(image, kernel))
```
:::

:::keypoints
- **CNNs** slide learned filters over images: local patterns, weight sharing, hierarchy (edges → objects).
- **Pooling** shrinks feature maps; a CNN stacks conv → ReLU → pool, then dense layers.
- **RNNs** read sequences step by step through a hidden state; LSTMs/GRUs add gates to remember longer.
- RNNs are slow (sequential) and forgetful (vanishing gradients).
- **Transformers** use attention so every token sees every other token directly and training runs in parallel.
:::
