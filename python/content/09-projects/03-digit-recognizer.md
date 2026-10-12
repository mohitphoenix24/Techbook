---
title: Handwritten Digit Recognizer from Scratch
level: intermediate
time: 60
icon: brain
cover: #10b981,#3b82f6
tags: numpy, neural-network, backprop, computer-vision
summary: Train a real neural network on handwritten digits using only NumPy — a reusable Layer/Model mini-framework with backprop, Adam, mini-batches, dropout and early stopping — then inspect its predictions and what it learned.
---

This project turns everything from the Deep Learning module into a small, reusable **neural network framework** — then uses it to read handwritten digits with about 97% accuracy. No PyTorch, no magic: every gradient is yours.

**What you'll build:** `Dense`, `ReLU`, `Dropout` layers and a `Model` class with `fit()` / `predict()` — the same design as Keras and PyTorch — plus training curves and error analysis.

:::flow The plan
Load digits | 1,797 images, 8×8
Normalize + split | train / val / test
Layers | Dense, ReLU, Dropout
Train | mini-batch Adam + early stopping
Evaluate | accuracy, confusion, mistakes
Inspect | what the first layer learned
:::

## Step 1 — Load and look at the data

```python run shared title="Step 1 · the digits dataset"
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split

digits = load_digits()
X = digits.images.reshape(len(digits.images), -1) / 16.0     # 64 pixels scaled to [0, 1]
y = digits.target
print("images:", X.shape, "| labels:", np.bincount(y))

X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.5, random_state=0, stratify=y_temp)
print("train/val/test:", len(X_train), len(X_val), len(X_test))

fig, axes = plt.subplots(2, 8, figsize=(10, 2.8))
for ax, img, label in zip(axes.flat, digits.images, digits.target):
    ax.imshow(img, cmap="gray_r"); ax.set_title(label); ax.axis("off")
plt.show()
```

## Step 2 — Layers

Every layer has a `forward` (compute outputs, remember what's needed) and a `backward` (receive the gradient of the loss w.r.t. its output, return the gradient w.r.t. its input, and store gradients for its parameters).

```python run shared title="Step 2 · layers"
class Dense:
    def __init__(self, n_in, n_out, rng):
        self.W = rng.normal(0, np.sqrt(2 / n_in), (n_in, n_out))   # He initialization
        self.b = np.zeros(n_out)
        self.params = [self.W, self.b]

    def forward(self, x, training=True):
        self.x = x
        return x @ self.W + self.b

    def backward(self, grad):
        self.grads = [self.x.T @ grad, grad.sum(axis=0)]
        return grad @ self.W.T

class ReLU:
    params = []
    def forward(self, x, training=True):
        self.mask = x > 0
        return x * self.mask
    def backward(self, grad):
        return grad * self.mask

class Dropout:
    params = []
    def __init__(self, p, rng):
        self.p, self.rng = p, rng
    def forward(self, x, training=True):
        if not training or self.p == 0:
            return x
        self.mask = (self.rng.random(x.shape) >= self.p) / (1 - self.p)
        return x * self.mask
    def backward(self, grad):
        return grad * self.mask

print("layers defined")
```

## Step 3 — Loss and optimizer

```python run shared title="Step 3 · softmax cross-entropy + Adam"
def softmax_cross_entropy(logits, y):
    """Return (loss, gradient wrt logits) for integer labels y."""
    z = logits - logits.max(axis=1, keepdims=True)
    p = np.exp(z); p /= p.sum(axis=1, keepdims=True)
    n = len(y)
    loss = -np.log(p[np.arange(n), y] + 1e-12).mean()
    grad = p.copy(); grad[np.arange(n), y] -= 1
    return loss, grad / n

class Adam:
    def __init__(self, params, lr=1e-3, betas=(0.9, 0.999), weight_decay=0.0):
        self.params, self.lr, (self.b1, self.b2), self.wd = params, lr, betas, weight_decay
        self.m = [np.zeros_like(p) for p in params]
        self.v = [np.zeros_like(p) for p in params]
        self.t = 0

    def step(self, grads):
        self.t += 1
        for p, g, m, v in zip(self.params, grads, self.m, self.v):
            m *= self.b1; m += (1 - self.b1) * g
            v *= self.b2; v += (1 - self.b2) * g * g
            m_hat, v_hat = m / (1 - self.b1 ** self.t), v / (1 - self.b2 ** self.t)
            p -= self.lr * (m_hat / (np.sqrt(v_hat) + 1e-8) + self.wd * p)   # AdamW-style decay

print("loss and optimizer ready")
```

## Step 4 — The Model class

```python run shared title="Step 4 · Model with fit / predict"
class Model:
    def __init__(self, layers):
        self.layers = layers

    def forward(self, x, training=False):
        for layer in self.layers:
            x = layer.forward(x, training)
        return x

    def backward(self, grad):
        for layer in reversed(self.layers):
            grad = layer.backward(grad)

    @property
    def params(self):
        return [p for l in self.layers for p in l.params]

    def grads(self):
        return [g for l in self.layers if l.params for g in l.grads]

    def predict(self, x):
        return self.forward(x).argmax(axis=1)

    def fit(self, X, y, X_val, y_val, epochs=60, batch_size=64, lr=2e-3, patience=8, seed=0):
        rng = np.random.default_rng(seed)
        opt = Adam(self.params, lr=lr, weight_decay=1e-4)
        history, best = [], (np.inf, None, 0)
        for epoch in range(epochs):
            order = rng.permutation(len(X))
            for start in range(0, len(X), batch_size):
                idx = order[start:start + batch_size]
                loss, grad = softmax_cross_entropy(self.forward(X[idx], training=True), y[idx])
                self.backward(grad)
                opt.step(self.grads())
            train_loss, _ = softmax_cross_entropy(self.forward(X), y)
            val_loss, _ = softmax_cross_entropy(self.forward(X_val), y_val)
            val_acc = (self.predict(X_val) == y_val).mean()
            history.append((train_loss, val_loss, val_acc))
            if val_loss < best[0] - 1e-4:
                best = (val_loss, [p.copy() for p in self.params], epoch)       # checkpoint
            elif epoch - best[2] >= patience:
                print(f"early stop at epoch {epoch}; best epoch {best[2]}")
                break
        for p, saved in zip(self.params, best[1]):                              # restore the best weights
            p[...] = saved
        return history

print("Model ready")
```

## Step 5 — Train

```python run shared title="Step 5 · train the network"
rng = np.random.default_rng(42)
model = Model([
    Dense(64, 128, rng), ReLU(), Dropout(0.2, rng),
    Dense(128, 64, rng), ReLU(), Dropout(0.2, rng),
    Dense(64, 10, rng),
])
print("parameters:", sum(p.size for p in model.params))
history = model.fit(X_train, y_train, X_val, y_val)

h = np.array(history)
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 3.6))
ax1.plot(h[:, 0], label="train"); ax1.plot(h[:, 1], label="validation")
ax1.set(title="Loss", xlabel="epoch"); ax1.legend()
ax2.plot(h[:, 2], color="green"); ax2.set(title="Validation accuracy", xlabel="epoch", ylim=(0.8, 1.0))
plt.show()
print(f"final validation accuracy: {(model.predict(X_val) == y_val).mean():.1%}")
```

## Step 6 — Test and analyse the errors

```python run shared title="Step 6 · test set + mistakes"
from sklearn.metrics import confusion_matrix

pred = model.predict(X_test)
print(f"TEST accuracy: {(pred == y_test).mean():.1%}  (on {len(y_test)} unseen images)")
cm = confusion_matrix(y_test, pred)
off = cm.copy(); np.fill_diagonal(off, 0)
i, j = np.unravel_index(off.argmax(), off.shape)
print(f"most common confusion: {i} mistaken for {j} ({off[i, j]}x)")

wrong = np.where(pred != y_test)[0][:8]
probs = np.exp(model.forward(X_test[wrong]))
probs /= probs.sum(axis=1, keepdims=True)
if len(wrong):
    fig, axes = plt.subplots(1, len(wrong), figsize=(1.6 * len(wrong), 2.2))
    for ax, k, p in zip(np.atleast_1d(axes), wrong, probs):
        ax.imshow(X_test[k].reshape(8, 8), cmap="gray_r")
        ax.set_title(f"true {y_test[k]}\npred {pred[k]} ({p.max():.0%})", fontsize=8); ax.axis("off")
    plt.show()
```

## Step 7 — What did the first layer learn?

Each first-layer neuron has 64 weights — one per pixel — so we can draw them as 8×8 images. They act as learned **feature detectors**: strokes, loops and edges.

```python run shared title="Step 7 · visualize learned features"
W1 = model.layers[0].W                                # (64, 128)
strongest = np.argsort(-np.abs(W1).sum(axis=0))[:16]
fig, axes = plt.subplots(2, 8, figsize=(10, 2.8))
for ax, k in zip(axes.flat, strongest):
    ax.imshow(W1[:, k].reshape(8, 8), cmap="RdBu"); ax.axis("off")
fig.suptitle("First-layer weights (blue = 'ink here helps', red = 'ink here hurts')")
plt.show()
```

## Step 8 — Use it like a library

```python run shared title="Step 8 · predict + compare"
from sklearn.linear_model import LogisticRegression

def classify(images_8x8):
    x = np.asarray(images_8x8).reshape(len(images_8x8), -1) / 16.0
    logits = model.forward(x)
    p = np.exp(logits - logits.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
    return [(int(k), float(p[i, k])) for i, k in enumerate(p.argmax(1))]

print(classify(digits.images[:5]), "true:", digits.target[:5])
baseline = LogisticRegression(max_iter=3000).fit(X_train, y_train).score(X_test, y_test)
print(f"logistic regression baseline: {baseline:.1%}  vs  our network: {(pred == y_test).mean():.1%}")
```

:::exercise Extensions
1. Try a wider network (`Dense(64, 256)`) and different dropout rates — what happens to validation accuracy?
2. **Data augmentation**: shift each training image by one pixel in a random direction (`np.roll`) each epoch and see if test accuracy improves.
3. Port the network to PyTorch on your computer (`nn.Sequential(nn.Linear(64,128), nn.ReLU(), …)`) and train on full 28×28 MNIST.
4. Add a gradient check for the `Dense` layer like in the Backprop lesson.
:::

:::keypoints
- A neural net framework is just layers with `forward` / `backward` plus an optimizer and a training loop.
- **He init**, **ReLU**, **Adam**, **dropout** and **early stopping** make even a small MLP reach ~97% on digits.
- Always keep a **validation** set for decisions and a **test** set for the final number.
- Error analysis (confusions, wrong examples) shows *how* the model fails.
- First-layer weights are interpretable feature detectors.
:::
