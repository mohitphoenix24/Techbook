---
title: Build a CNN from Scratch in NumPy
level: advanced
time: 55
summary: Write the convolution layer, max-pool and the full backward pass yourself and train a small CNN on digits. You see exactly what PyTorch's autograd does, check every gradient numerically, and look at the filters the network learned.
---

Frameworks hide the details. Writing a small CNN once, with its backward pass, is the best way to understand it, and it is a classic interview exercise ("implement conv2d forward and backward").

## The plan

The network: `image (1×8×8) → conv 3×3 (8 filters) → ReLU → max-pool 2×2 → flatten (128) → linear (10) → softmax`.

:::flow Forward and backward through each layer
Convolution | Forward: slide each filter over the padded image (a sum of products). Backward: dW = sum over positions of (input patch × output gradient); dx = each output gradient spreads back through the filter weights.
ReLU | Forward: max(0, x). Backward: pass the gradient where the input was positive.
Max-pool | Forward: keep the biggest value of each 2×2 block. Backward: send the gradient only to the position that was the maximum.
Linear | Forward: x W + b. Backward: dW = xᵀ dz, dx = dz Wᵀ.
Softmax + cross-entropy | dz = (p − y) / N, as before.
:::

## The layers

We use `sliding_window_view` to see every k×k patch at once, and `einsum` to do the sums without Python loops.

```python run title="Conv and pooling layers with forward and backward" level=advanced shared
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

class Conv:
    """3x3 (or k x k) convolution, stride 1, 'same' padding."""
    def __init__(self, cin, cout, k, rng):
        self.k = k
        self.W = rng.normal(0, np.sqrt(2 / (cin * k * k)), (cout, cin, k, k))         # He initialisation
        self.b = np.zeros(cout)

    def forward(self, x):                                                              # x: (N, Cin, H, W)
        p = self.k // 2
        xp = np.pad(x, ((0, 0), (0, 0), (p, p), (p, p)))
        self.patches = sliding_window_view(xp, (self.k, self.k), axis=(2, 3))          # (N, Cin, H, W, k, k): every patch
        self.x_shape = x.shape
        return np.einsum("nchwij,ocij->nohw", self.patches, self.W) + self.b[None, :, None, None]

    def backward(self, dout):                                                          # dout: (N, Cout, H, W)
        self.dW = np.einsum("nchwij,nohw->ocij", self.patches, dout)                   # each weight: sum over all positions
        self.db = dout.sum(axis=(0, 2, 3))
        n, c, h, w = self.x_shape
        p = self.k // 2
        dxp = np.zeros((n, c, h + 2 * p, w + 2 * p))
        for i in range(self.k):                                                        # spread each output gradient back through the weights
            for j in range(self.k):
                dxp[:, :, i:i + h, j:j + w] += np.einsum("nohw,oc->nchw", dout, self.W[:, :, i, j])
        return dxp[:, :, p:p + h, p:p + w]

class MaxPool2:
    def forward(self, x):
        n, c, h, w = x.shape
        blocks = x.reshape(n, c, h // 2, 2, w // 2, 2)
        out = blocks.max(axis=(3, 5))
        self.mask = blocks == out[:, :, :, None, :, None]                              # which position was the maximum
        return out

    def backward(self, dout):
        n, c, h, w = dout.shape
        g = self.mask * dout[:, :, :, None, :, None]
        g = g / self.mask.sum(axis=(3, 5), keepdims=True)                              # ties share the gradient
        return g.reshape(n, c, h * 2, w * 2)

def softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)
print("layers defined")
```

## Check the backward pass first

A wrong gradient silently gives a network that trains badly. We compare against finite differences on a tiny network.

```python run title="Numerical gradient check of the conv layer" level=advanced shared
rng = np.random.default_rng(0)
conv = Conv(1, 2, 3, rng)
x = rng.normal(size=(2, 1, 6, 6))
target = rng.normal(size=(2, 2, 6, 6))

def loss(W):
    conv.W = W
    return 0.5 * ((conv.forward(x) - target) ** 2).sum()

W0 = conv.W.copy()
out = conv.forward(x)
conv.backward(out - target)                                      # d(loss)/d(out) = out - target
worst = 0
for idx in [(0, 0, 1, 1), (1, 0, 0, 2), (0, 0, 2, 0)]:
    h = 1e-6
    Wp, Wm = W0.copy(), W0.copy(); Wp[idx] += h; Wm[idx] -= h
    num = (loss(Wp) - loss(Wm)) / (2 * h)
    worst = max(worst, abs(num - conv.dW[idx]))
    print(f"dW{idx}: analytic {conv.dW[idx]: .6f}   numeric {num: .6f}")
conv.W = W0
dx = conv.backward(out - target)                                 # check dx too
xi = (0, 0, 2, 3); h = 1e-6
xp, xm = x.copy(), x.copy(); xp[xi] += h; xm[xi] -= h
f = lambda xx: 0.5 * ((conv.forward(xx) - target) ** 2).sum()
print(f"dx{xi}: analytic {dx[xi]: .6f}   numeric {(f(xp) - f(xm)) / (2 * h): .6f}")
print("largest weight-gradient difference:", f"{worst:.1e}")
```

## Train it on the digits

```python run title="Train the CNN" level=advanced shared
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split

X, y = load_digits(return_X_y=True)
X = (X / 16.0).reshape(-1, 1, 8, 8)
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
Y = np.eye(10)[ytr]

rng = np.random.default_rng(0)
conv, pool = Conv(1, 8, 3, rng), MaxPool2()
Wf = rng.normal(0, np.sqrt(2 / 128), (128, 10)); bf = np.zeros(10)

def predict(x):
    return softmax(pool.forward(np.maximum(0, conv.forward(x))).reshape(len(x), -1) @ Wf + bf)

lr = 0.1
for epoch in range(30):
    order = rng.permutation(len(Xtr))
    for i in range(0, len(order), 64):                           # mini-batches of 64
        idx = order[i:i + 64]
        a = conv.forward(Xtr[idx]); r = np.maximum(0, a); p = pool.forward(r)
        f = p.reshape(len(idx), -1)
        P = softmax(f @ Wf + bf)
        dz = (P - Y[idx]) / len(idx)                             # backward pass, last layer first
        dWf, dbf = f.T @ dz, dz.sum(0)
        dp = pool.backward((dz @ Wf.T).reshape(p.shape))
        conv.backward(dp * (a > 0))                              # through the ReLU, then the conv
        Wf -= lr * dWf; bf -= lr * dbf; conv.W -= lr * conv.dW; conv.b -= lr * conv.db
    if epoch in (0, 4, 14, 29):
        print(f"epoch {epoch + 1:2d}: test accuracy {(predict(Xte).argmax(1) == yte).mean():.3f}")
n_params = conv.W.size + conv.b.size + Wf.size + bf.size
print("parameters:", n_params, "(the two-layer MLP of the last module had about 4,800)")
```

With only 8 filters the CNN reaches about 96% on this tiny dataset. The point is the structure, not the score: the code that learned is the code you read.

## What did the filters learn?

```python run title="The learned 3x3 filters" level=easy shared
import cvlab
filters = [conv.W[o, 0] for o in range(8)]
cvlab.show(*filters, titles=[f"filter {o}" for o in range(8)], width=90)
print("filter 0 values:\n", np.round(conv.W[0, 0], 2))
```

After training, the 3 × 3 filters look like **small edge, corner and blob detectors**, which is just what the classical filters of the first modules were, except now they were **learned from data** for this task. In large networks trained on ImageNet, the first layer learns Gabor-like oriented edges and colour blobs (see the visualisation lesson).

## What autograd does for you

PyTorch's `loss.backward()` records every operation in a graph during the forward pass, then walks it backwards applying each operation's local gradient rule, exactly as our code did by hand. You get: any architecture without writing gradients, GPU speed, and correct, tested rules for hundreds of operations. The cost: you must still understand shapes, memory (activations are stored for the backward pass), and numerical issues.

:::interview Questions you may get
- "Derive the gradient of a convolution layer with respect to its weights and its input." Weights: correlate the input patches with the output gradient and sum over positions. Input: a full convolution of the output gradient with the flipped kernel (spreading each output gradient back through the weights).
- "How does the backward pass of max-pool work?" The gradient goes only to the location of the maximum in each window; the others get zero.
- "How does the backward pass of ReLU work?" It passes the gradient where the input was positive and blocks it elsewhere.
- "Why is the conv layer's gradient a sum over positions?" The same weight is used at every position (weight sharing), so each use contributes.
- "What must be stored for the backward pass?" The inputs of each layer (activations), and masks such as the ReLU and max-pool positions: this is why training needs much more memory than inference.
:::

```quiz
? In the backward pass of a max-pool layer, which input positions receive gradient?
+ Only the position that was the maximum in each window
- All positions equally
- None
> Everything else did not influence the output.

? Why does a conv layer's weight gradient sum over all positions?
+ The same weights are shared by every position, so each position contributes
- It is a bug
- Because of the bias
> Weight sharing means the weights influence the loss through many outputs.

? Why does training need more memory than inference?
+ Intermediate activations are stored for the backward pass
- The weights are bigger
- The batch is bigger
> Autograd must remember each layer's inputs.

? What should you always do after writing a backward pass by hand?
+ Compare with numerical gradients
- Increase the learning rate
- Remove ReLU
> Finite differences catch almost all gradient bugs.
```

:::problem Write the forward pass of a naive conv2d with loops (single image, stride 1, no padding). What is its time complexity and how do libraries speed it up? {level=medium tags="conv,implementation,complexity"}
Think about im2col.

:::solution Model answer
```python
def conv2d(x, W):                       # x: (Cin, H, W), W: (Cout, Cin, k, k)
    Cout, Cin, k, _ = W.shape
    H, Wd = x.shape[1] - k + 1, x.shape[2] - k + 1
    out = np.zeros((Cout, H, Wd))
    for o in range(Cout):
        for i in range(H):
            for j in range(Wd):
                out[o, i, j] = (x[:, i:i+k, j:j+k] * W[o]).sum()
    return out
```
Time `O(Cout · H · W · Cin · k²)`. Libraries use **im2col**: unroll every patch into a column of a big matrix and do one matrix multiplication (GEMM) with the filters matrix, using highly optimised BLAS/cuBLAS; or **Winograd** and **FFT** based algorithms for small/large kernels, and cuDNN auto-tuning to pick the fastest one. Memory trade-off: im2col duplicates the pixels `k²` times.
:::
:::

:::keypoints
- A CNN layer's backward pass: weight gradient = sum over positions of (input patch × output gradient); input gradient = output gradient spread back through the weights.
- ReLU blocks gradients where the input was ≤ 0; max-pool routes them to the argmax.
- Check gradients numerically. Autograd does the same thing automatically for any graph.
- Small learned filters resemble classical edge detectors; the network learns its own features.
:::

:::resources
- [CS231n: assignment-style notes on convolution backward pass](https://cs231n.github.io/convolutional-networks/#conv) — im2col and the gradient.
- [Karpathy: Hacker's guide to neural networks](https://karpathy.github.io/neuralnets/) — backprop intuition with code.
- [PyTorch autograd mechanics](https://docs.pytorch.org/docs/stable/notes/autograd.html) — how the computation graph works.
:::
