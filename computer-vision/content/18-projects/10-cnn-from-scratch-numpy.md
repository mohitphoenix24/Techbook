---
title: Build a CNN From Scratch in NumPy
level: advanced
time: 70
icon: brain
cover: #7c3aed,#f43f5e
tags: convolution, im2col, backpropagation, maxpool, softmax, gradient check, augmentation
summary: Write a complete convolutional network with nothing but NumPy: convolution by im2col, ReLU, max pooling, a dense layer and softmax cross-entropy, each with a hand-written backward pass. Check the gradients numerically, train on 8x8 digit images, compare with a plain linear classifier, and see how shifts, the number of filters and augmentation change the result.
---

Using `nn.Conv2d` hides everything that matters in an interview: *what does the backward pass of a convolution actually do?* In this project you write every layer and its gradient yourself, **prove the gradients are right** with a numerical check, and train a real network on real images. About 100 lines of NumPy; everything runs in your browser.

**What you'll build:** `Conv`, `ReLU`, `MaxPool`, `Flatten` and `Dense` layers with `forward` and `backward`, a softmax cross-entropy loss, a gradient checker, an SGD-with-momentum trainer, and experiments on robustness and capacity.

:::flow The network
8×8 digit | one grey channel
Conv 3×3, 8 filters | local pattern detectors
ReLU | non-linearity
Max pool 2×2 | keep the strongest response, shrink to 4×4
Flatten | 8 × 4 × 4 = 128 numbers
Dense | 128 → 10 class scores
Softmax + cross-entropy | probabilities and the loss
:::

:::def im2col
A convolution slides a small kernel over the image. **im2col** copies every kernel-sized patch into a column of a big matrix; the convolution then becomes **one matrix multiplication** `W @ columns`. It is how many GPU libraries implement convolution, and it makes the backward pass easy: the gradient with respect to the weights is another matrix product, and the gradient with respect to the input is the **reverse** of im2col (`col2im`), which adds each patch's gradient back to where it came from.
:::

## Step 1 — The data

`sklearn.datasets.load_digits` has 1,797 handwritten digits of 8 × 8 pixels. We scale the values to 0–1 and use the layout `(N, C, H, W)` that frameworks use: here `C = 1` (grey). The split keeps 30% for testing.

```python run shared title="Step 1 · data"
import time
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression

X, y = load_digits(return_X_y=True)
X = (X / 16.0).reshape(-1, 1, 8, 8)
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
print("train", Xtr.shape, "test", Xte.shape, "| pixel range", float(X.min()), "to", float(X.max()), "| classes:", np.bincount(y).tolist())
```

## Step 2 — Convolution as a matrix product

`im2col` gathers the patches; `col2im` is its adjoint. Check the forward pass against OpenCV's `filter2D` (a correlation, which is what deep-learning "convolution" is) on one image to be sure that the indexing is right *before* building anything on top.

```python run shared title="Step 2 · im2col, col2im and a forward check"
import cv2

def im2col(x, k, pad):
    N, C, H, W = x.shape
    xp = np.pad(x, ((0, 0), (0, 0), (pad, pad), (pad, pad)))
    Ho, Wo = H + 2 * pad - k + 1, W + 2 * pad - k + 1
    cols = np.empty((N, C, k, k, Ho, Wo), x.dtype)
    for i in range(k):
        for j in range(k):
            cols[:, :, i, j] = xp[:, :, i:i + Ho, j:j + Wo]                   # the (i, j) tap of every patch, at every position
    return cols.reshape(N, C * k * k, Ho * Wo), (Ho, Wo)

def col2im(dcols, x_shape, k, pad):
    N, C, H, W = x_shape
    Ho, Wo = H + 2 * pad - k + 1, W + 2 * pad - k + 1
    dcols = dcols.reshape(N, C, k, k, Ho, Wo)
    dxp = np.zeros((N, C, H + 2 * pad, W + 2 * pad), dcols.dtype)
    for i in range(k):
        for j in range(k):
            dxp[:, :, i:i + Ho, j:j + Wo] += dcols[:, :, i, j]               # ADD: pixels covered by several patches receive several gradients
    return dxp[:, :, pad:pad + H, pad:pad + W]

# forward check on one image with a Sobel-like kernel
img = Xtr[:1]
kernel = np.array([[1, 0, -1], [2, 0, -2], [1, 0, -1]], np.float64)
cols, (Ho, Wo) = im2col(img, 3, 1)
mine = (kernel.reshape(1, -1) @ cols[0]).reshape(Ho, Wo)
ref = cv2.filter2D(img[0, 0], -1, kernel, borderType=cv2.BORDER_CONSTANT)           # zero padding like pad=1
print("max difference from cv2.filter2D:", float(np.abs(mine - ref).max()))
assert np.abs(mine - ref).max() < 1e-9

# the adjoint property: <im2col(x), g> == <x, col2im(g)>  (this is what makes the backward pass correct)
rng = np.random.default_rng(0)
x = rng.normal(size=(2, 3, 8, 8)); c, _ = im2col(x, 3, 1); g = rng.normal(size=c.shape)
print("adjoint check:", float((c * g).sum()), "=", float((x * col2im(g, x.shape, 3, 1)).sum()))
```

## Step 3 — The layers, forward and backward

Each layer remembers what it needs during `forward`, and `backward(dout)` returns the gradient with respect to its input (and stores the gradients of its parameters):

- **Conv**: `out = W @ cols + b`. Backward: `dW = Σ dout · colsᵀ`, `db = Σ dout`, `dcols = Wᵀ @ dout`, then `col2im`.
- **ReLU**: pass the gradient where the input was positive.
- **MaxPool 2×2**: forward keeps the maximum of each 2×2 block; backward sends the gradient **only to the position that held the maximum** (ties share it).
- **Dense**: `out = x @ W + b`; backward `dW = xᵀ @ dout`, `dx = dout @ Wᵀ`.
- **Softmax cross-entropy**: with `p = softmax(logits)`, the gradient with respect to the logits is simply `p − onehot(y)` (divided by the batch size).

```python run shared title="Step 3 · layers and loss"
class Conv:
    def __init__(self, cin, cout, k=3, pad=1, rng=None):
        self.k, self.pad = k, pad
        self.W = rng.normal(0, np.sqrt(2 / (cin * k * k)), (cout, cin * k * k))      # He initialisation for ReLU networks
        self.b = np.zeros(cout); self.dW, self.db = np.zeros_like(self.W), np.zeros_like(self.b)
    def forward(self, x):
        self.x_shape = x.shape
        self.cols, (Ho, Wo) = im2col(x, self.k, self.pad)
        return (self.W @ self.cols + self.b[None, :, None]).reshape(x.shape[0], -1, Ho, Wo)
    def backward(self, dout):
        d = dout.reshape(dout.shape[0], dout.shape[1], -1)                           # (N, out_channels, positions)
        self.dW = np.einsum("nol,ncl->oc", d, self.cols); self.db = d.sum((0, 2))
        return col2im(np.einsum("oc,nol->ncl", self.W, d), self.x_shape, self.k, self.pad)
    def params(self): return [(self.W, self.dW), (self.b, self.db)]

class ReLU:
    def forward(self, x): self.mask = x > 0; return x * self.mask
    def backward(self, d): return d * self.mask
    def params(self): return []

class MaxPool:
    def forward(self, x):
        N, C, H, W = x.shape; self.shape = x.shape
        blocks = x.reshape(N, C, H // 2, 2, W // 2, 2)
        out = blocks.max(axis=(3, 5)); self.mask = blocks == out[:, :, :, None, :, None]       # where the maximum was
        return out
    def backward(self, d):
        N, C, H, W = self.shape
        m = self.mask / self.mask.sum(axis=(3, 5), keepdims=True)                              # ties share the gradient
        return (m * d[:, :, :, None, :, None]).reshape(N, C, H, W)
    def params(self): return []

class Flatten:
    def forward(self, x): self.shape = x.shape; return x.reshape(len(x), -1)
    def backward(self, d): return d.reshape(self.shape)
    def params(self): return []

class Dense:
    def __init__(self, nin, nout, rng):
        self.W = rng.normal(0, np.sqrt(2 / nin), (nin, nout)); self.b = np.zeros(nout)
        self.dW, self.db = np.zeros_like(self.W), np.zeros_like(self.b)
    def forward(self, x): self.x = x; return x @ self.W + self.b
    def backward(self, d): self.dW = self.x.T @ d; self.db = d.sum(0); return d @ self.W.T
    def params(self): return [(self.W, self.dW), (self.b, self.db)]

def softmax_cross_entropy(logits, y):
    z = logits - logits.max(1, keepdims=True)                                         # subtract the max: numerical stability
    p = np.exp(z); p /= p.sum(1, keepdims=True)
    loss = -np.log(p[np.arange(len(y)), y] + 1e-12).mean()
    grad = p.copy(); grad[np.arange(len(y)), y] -= 1                                  # d(loss)/d(logits) = p - onehot
    return loss, grad / len(y)

class Net:
    def __init__(self, filters=8, seed=0):
        rng = np.random.default_rng(seed)
        self.layers = [Conv(1, filters, 3, 1, rng), ReLU(), MaxPool(), Flatten(), Dense(filters * 4 * 4, 10, rng)]
    def forward(self, x):
        for layer in self.layers: x = layer.forward(x)
        return x
    def backward(self, d):
        for layer in reversed(self.layers): d = layer.backward(d)
    def params(self): return [p for layer in self.layers for p in layer.params()]
    def predict(self, x): return self.forward(x).argmax(1)

net = Net()
logits = net.forward(Xtr[:5])
loss, grad = softmax_cross_entropy(logits, ytr[:5])
net.backward(grad)
print("logits", logits.shape, "| initial loss", round(float(loss), 3), "| chance level is ln(10) =", round(float(np.log(10)), 3), "(random weights start near it, a bit higher when the initial logits are large)")
print("parameters:", sum(p.size for p, _ in net.params()), "| a linear classifier on 64 pixels would have", 64 * 10 + 10)
```

## Step 4 — Prove the gradients with a numerical check

A wrong backward pass still *trains*, just badly, and you will never know why. The **gradient check** perturbs one parameter by `±ε`, recomputes the loss and compares `(L(+ε) − L(−ε)) / 2ε` with the analytic gradient. The relative error should be about `1e-7` or smaller.

One subtlety, a real one: a ReLU has a **kink at 0**. With all biases at exactly 0, the many all-black patches of a digit give pre-activations of exactly 0, and a tiny bias change turns them positive, which the analytic gradient (derivative 0 at 0) cannot see. So we start the check from small random biases, a standard trick.

```python run shared title="Step 4 · gradient check"
net = Net(); net.layers[0].b[:] = np.random.default_rng(5).normal(0, 0.1, 8)             # avoid the exact-zero ReLU kink
xb, yb = Xtr[:6], ytr[:6]
loss, grad = softmax_cross_entropy(net.forward(xb), yb); net.backward(grad)
rng = np.random.default_rng(1)
print("parameter | analytic gradient | numerical gradient | relative error")
worst = 0
for name, (p, g) in zip(["conv W", "conv b", "dense W", "dense b"], net.params()):
    idx = tuple(rng.integers(0, s) for s in p.shape)
    old, eps = p[idx], 1e-5
    p[idx] = old + eps; lp = softmax_cross_entropy(net.forward(xb), yb)[0]
    p[idx] = old - eps; lm = softmax_cross_entropy(net.forward(xb), yb)[0]
    p[idx] = old
    num = (lp - lm) / (2 * eps)
    rel = abs(g[idx] - num) / (abs(g[idx]) + abs(num) + 1e-12); worst = max(worst, rel)
    print(f"{name:<9} | {g[idx]:>17.8f} | {num:>18.8f} | {rel:.1e}")
assert worst < 1e-6
print("all four gradients match: the backward pass is correct")
```

## Step 5 — Train it

Mini-batch **stochastic gradient descent with momentum**: for each batch of 32 images, compute the loss, run `backward`, and update every parameter with `v ← 0.9 v − lr·grad; p ← p + v`. We track the test accuracy and compare with a **logistic regression** on the raw pixels, the natural linear baseline.

```python run shared title="Step 5 · training loop and a linear baseline"
def accuracy(net, X, y): return float((net.predict(X) == y).mean())

def train(filters=8, epochs=15, lr=0.05, augment=False, seed=0, verbose=False):
    net = Net(filters, seed)
    vel = [np.zeros_like(p) for p, _ in net.params()]
    for epoch in range(epochs):
        perm = np.random.default_rng(epoch).permutation(len(Xtr))
        for i in range(0, len(Xtr), 32):
            idx = perm[i:i + 32]; xb = Xtr[idx]
            if augment:                                                         # random shifts of up to 1 pixel (a data augmentation)
                shifts = np.random.default_rng(epoch * 1000 + i).integers(-1, 2, (len(xb), 2))
                xb = np.stack([np.roll(im, (int(s[0]), int(s[1])), (1, 2)) for im, s in zip(xb, shifts)])
            loss, grad = softmax_cross_entropy(net.forward(xb), ytr[idx]); net.backward(grad)
            for v, (p, g) in zip(vel, net.params()):
                v *= 0.9; v -= lr * g; p += v                                   # momentum SGD, in place
        if verbose and epoch % 3 == 2:
            print(f"epoch {epoch + 1:>2}: last batch loss {loss:.3f}, test accuracy {accuracy(net, Xte, yte):.4f}")
    return net

t0 = time.time()
cnn = train(8, 15, verbose=True)
print(f"trained in {time.time() - t0:.1f} s | CNN test accuracy {accuracy(cnn, Xte, yte):.4f}")
lin = LogisticRegression(max_iter=3000).fit(Xtr.reshape(len(Xtr), -1), ytr)
print(f"logistic regression on the pixels: {lin.score(Xte.reshape(len(Xte), -1), yte):.4f}")
assert accuracy(cnn, Xte, yte) > 0.93
```

## Step 6 — What did it learn? Look at the filters and the mistakes

The 8 convolution kernels are the network's **feature detectors**: edges and strokes in different orientations. And the mistakes show which digits it confuses.

```python run shared title="Step 6 · filters and confusions"
import cvlab
W = cnn.layers[0].W.reshape(8, 3, 3)
tiles = [cv2.resize(((w - w.min()) / (w.max() - w.min() + 1e-9) * 255).astype(np.uint8), (60, 60), interpolation=cv2.INTER_NEAREST) for w in W]
cvlab.show(np.hstack(tiles), "The 8 learned 3x3 filters (bright = positive weight)")

pred = cnn.predict(Xte)
cm = np.zeros((10, 10), int)
for t, p in zip(yte, pred): cm[t, p] += 1
np.fill_diagonal(cm, 0)
worst = np.dstack(np.unravel_index(np.argsort(-cm.ravel())[:3], cm.shape))[0]
print("most frequent confusions (true -> predicted):", [(int(a), int(b), int(cm[a, b])) for a, b in worst])
wrong = np.where(pred != yte)[0][:6]
cvlab.show(np.hstack([cv2.resize((Xte[i, 0] * 255).astype(np.uint8), (80, 80), interpolation=cv2.INTER_NEAREST) for i in wrong]), "Misclassified test digits (first six)")
print("true:", yte[wrong].tolist(), "| predicted:", pred[wrong].tolist())
```

## Step 7 — Shifts, capacity and augmentation

A network is only as good as the data it has seen. We ask three questions.

1. **Is a CNN more robust than a linear model to a one-pixel shift?** (Convolution is translation-*equivariant* and pooling adds some invariance.)
2. **How much capacity do we need?** (4, 8, 16 filters.)
3. **Does augmentation help?** (Train with random shifts of ±1 pixel.)

```python run shared title="Step 7 · robustness, filters and augmentation"
shift = lambda A, dy, dx: np.roll(A, (dy, dx), (2, 3))
print("model                           | params | clean | shifted 1 px")
print(f"{'logistic regression (pixels)':<31} | {64 * 10 + 10:>6} | {lin.score(Xte.reshape(len(Xte), -1), yte):.3f} | {lin.score(shift(Xte, 0, 1).reshape(len(Xte), -1), yte):.3f}")
for filters in (4, 8, 16):
    n = train(filters, 10)
    print(f"{f'CNN, {filters} filters, 10 epochs':<31} | {sum(p.size for p, _ in n.params()):>6} | {accuracy(n, Xte, yte):.3f} | {accuracy(n, shift(Xte, 0, 1), yte):.3f}")
n = train(16, 30, augment=True)
print(f"{'CNN, 16 filters + shift augment':<31} | {sum(p.size for p, _ in n.params()):>6} | {accuracy(n, Xte, yte):.3f} | {accuracy(n, shift(Xte, 0, 1), yte):.3f}")
print("a linear model collapses under a one-pixel shift, a CNN is more robust, and training with shifts makes it much better still:")
print("invariance is not free; it must be built in (pooling) or learned from augmented data")
```

## How it works

| Piece | What to remember |
|---|---|
| `im2col` + matmul | convolution as one matrix product; the weights are shared across all positions |
| `col2im` (the adjoint) | scatters-and-adds the patch gradients back to the pixels they came from |
| `dW = dout · colsᵀ` | the gradient of a shared weight sums over every position where it was used |
| MaxPool backward | only the winning position receives gradient |
| Softmax-CE gradient `p − y` | the simplest and most stable gradient in deep learning |
| Gradient check | the unit test of every hand-written backward pass; watch for ReLU kinks |
| Momentum SGD | smooths the noisy mini-batch gradient |
| Augmentation | teaches invariances the architecture does not provide |

**What PyTorch adds on top**: automatic differentiation (so you never write backward), optimised GPU kernels, many more layers, batch-norm, data loading, mixed precision and distributed training. The concepts are exactly these.

:::exercise Extend it
1. Add **a second convolution layer** (8 → 16 channels) and another pooling; check the gradients again.
2. Add **L2 weight decay** to the update and observe the effect on the clean and shifted accuracy.
3. Implement **batch normalisation** (forward and backward) and check it with the gradient checker.
4. Replace the update by **Adam** and compare the learning curves.
5. Add **dropout** before the dense layer (remember to scale and to switch it off at test time).
6. Compute the **FLOPs** of each layer and compare the cost of the convolution with the dense layer.
7. Train on **random 2-pixel shifts** and test on larger shifts; where does invariance end?
:::

:::keypoints
- A convolution is `W @ im2col(x)`; its backward pass is two matrix products and a `col2im`, which adds gradients back where each patch came from.
- Max-pooling routes the gradient to the winning position; softmax cross-entropy has the gradient `p − onehot(y)`.
- A numerical gradient check is the essential test for a hand-written backward pass (mind the ReLU kink at exactly 0).
- A CNN beats a linear model on shifted inputs, and augmentation buys more invariance than architecture alone.
- Every framework layer you use is a version of these few functions.
:::
