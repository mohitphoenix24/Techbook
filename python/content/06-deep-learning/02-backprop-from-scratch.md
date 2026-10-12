---
title: Backpropagation & a Network from Scratch
level: advanced
time: 40
summary: How neural networks learn. Understand the chain rule and backpropagation, build a tiny autograd engine like PyTorch's, then train a real neural network in pure NumPy and watch its decision boundary form.
---

You know the training loop: **forward → loss → gradients → update**. For a straight line we wrote the gradients by hand. For a network with millions of weights, we need an automatic way to get **every** gradient. That method is **backpropagation**, and it is just the chain rule from school maths, applied cleverly.

## The chain rule, intuitively

:::def Derivative / gradient
How much an output changes when you nudge an input a tiny bit. If `dL/dw = 3`, increasing `w` by 0.001 increases the loss by about 0.003.
:::

:::def Chain rule
If `y` depends on `u`, and `u` depends on `x`, then `dy/dx = dy/du × du/dx`. Effects **multiply** along a chain of steps.
:::

:::analogy
A chain of gears: if gear A turns gear B 3× as fast, and B turns C 2× as fast, then A turns C **6×** as fast. Backpropagation multiplies these "gear ratios" backwards through every layer to see how each weight affects the final loss.
:::

```python run level=intermediate
# L = (w*x + b - y)^2 for one example. Check the chain-rule gradient against a numerical one.
x, y = 2.0, 10.0
w, b = 3.0, 1.0

pred = w * x + b               # forward: pred = 7
err = pred - y                 # err = -3
L = err ** 2                   # L = 9

dL_derr = 2 * err              # backward, step by step
derr_dpred = 1
dpred_dw = x
dL_dw = dL_derr * derr_dpred * dpred_dw          # chain rule: multiply along the chain
print("chain rule dL/dw:", dL_dw)

eps = 1e-6                     # numerical check: nudge w and measure
L2 = ((w + eps) * x + b - y) ** 2
print("numerical  dL/dw:", round((L2 - L) / eps, 4))
```

## A computational graph

Every calculation can be drawn as a **graph** of simple operations. Backprop walks the graph **backwards**, passing gradients from the loss to every input.

```text
 forward  →
 x ─┐
    (*) ── u ──┐
 w ─┘          (+) ── z ── (relu) ── a ── (loss) ── L
 b ────────────┘
 ←  backward: dL/da → dL/dz → dL/du, dL/db → dL/dw, dL/dx
```

## Build a tiny autograd engine

Let's build what PyTorch's autograd does — a `Value` class that remembers how it was computed and can backpropagate. (This design is inspired by Andrej Karpathy's *micrograd*.)

:::def Autograd (automatic differentiation)
A system that records every operation during the forward pass and then computes all gradients automatically in a backward pass. PyTorch, JAX and TensorFlow are built on it.
:::

```python run level=advanced
import math

class Value:
    """A number that remembers how it was made, so it can compute gradients."""
    def __init__(self, data, parents=(), op=""):
        self.data = data
        self.grad = 0.0
        self._parents = parents
        self._backward = lambda: None
        self.op = op

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other), "+")
        def _backward():
            self.grad += out.grad            # d(a+b)/da = 1
            other.grad += out.grad
        out._backward = _backward
        return out

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other), "*")
        def _backward():
            self.grad += other.data * out.grad   # d(a*b)/da = b
            other.grad += self.data * out.grad
        out._backward = _backward
        return out

    def __pow__(self, k):
        out = Value(self.data ** k, (self,), f"**{k}")
        def _backward():
            self.grad += k * self.data ** (k - 1) * out.grad
        out._backward = _backward
        return out

    def tanh(self):
        t = math.tanh(self.data)
        out = Value(t, (self,), "tanh")
        def _backward():
            self.grad += (1 - t ** 2) * out.grad
        out._backward = _backward
        return out

    __radd__ = __add__
    __rmul__ = __mul__
    def __neg__(self): return self * -1
    def __sub__(self, other): return self + (-other)

    def backward(self):
        order, seen = [], set()
        def build(v):                        # topological order: parents before children
            if v not in seen:
                seen.add(v)
                for p in v._parents:
                    build(p)
                order.append(v)
        build(self)
        self.grad = 1.0                      # dL/dL = 1
        for v in reversed(order):
            v._backward()

    def __repr__(self):
        return f"Value(data={self.data:.4f}, grad={self.grad:.4f})"

# a single neuron: out = tanh(w1*x1 + w2*x2 + b)
x1, x2 = Value(2.0), Value(-1.0)
w1, w2, b = Value(0.5), Value(-0.3), Value(0.1)
out = (w1 * x1 + w2 * x2 + b).tanh()
loss = (out - 1.0) ** 2
loss.backward()
print("output:", out)
print("loss:  ", loss)
for name, v in [("w1", w1), ("w2", w2), ("b", b)]:
    print(f"dloss/d{name} = {v.grad:+.4f}")
```

Each operation only knows its **local** derivative; `backward()` chains them together. That's all autograd is.

### Train a tiny network with it

```python run level=advanced
import math
import random

class Value:
    def __init__(self, data, parents=()):
        self.data, self.grad, self._parents, self._backward = data, 0.0, parents, (lambda: None)
    def __add__(self, o):
        o = o if isinstance(o, Value) else Value(o)
        out = Value(self.data + o.data, (self, o))
        def bw(): self.grad += out.grad; o.grad += out.grad
        out._backward = bw; return out
    def __mul__(self, o):
        o = o if isinstance(o, Value) else Value(o)
        out = Value(self.data * o.data, (self, o))
        def bw(): self.grad += o.data * out.grad; o.grad += self.data * out.grad
        out._backward = bw; return out
    def tanh(self):
        t = math.tanh(self.data); out = Value(t, (self,))
        def bw(): self.grad += (1 - t * t) * out.grad
        out._backward = bw; return out
    __radd__, __rmul__ = __add__, __mul__
    def __sub__(self, o): return self + (o * -1 if isinstance(o, Value) else -o)
    def backward(self):
        order, seen = [], set()
        def build(v):
            if v not in seen:
                seen.add(v); [build(p) for p in v._parents]; order.append(v)
        build(self); self.grad = 1.0
        for v in reversed(order): v._backward()

random.seed(0)
class Neuron:
    def __init__(self, n): self.w = [Value(random.uniform(-1, 1)) for _ in range(n)]; self.b = Value(0.0)
    def __call__(self, x): return sum((wi * xi for wi, xi in zip(self.w, x)), self.b).tanh()
    def params(self): return self.w + [self.b]

class MLP:
    def __init__(self, sizes): self.layers = [[Neuron(a) for _ in range(b)] for a, b in zip(sizes, sizes[1:])]
    def __call__(self, x):
        for layer in self.layers: x = [n(x) for n in layer]
        return x[0] if len(x) == 1 else x
    def params(self): return [p for layer in self.layers for n in layer for p in n.params()]

net = MLP([2, 4, 4, 1])
xs = [[0, 0], [0, 1], [1, 0], [1, 1]]
ys = [-1, 1, 1, -1]                                      # XOR with targets -1 / +1

for step in range(60):
    preds = [net(x) for x in xs]
    loss = sum(((p - y) * (p - y) for p, y in zip(preds, ys)), Value(0.0))
    for p in net.params(): p.grad = 0.0                  # zero old gradients
    loss.backward()                                      # backprop
    for p in net.params(): p.data -= 0.1 * p.grad        # gradient descent
    if step % 15 == 0 or step == 59:
        print(f"step {step:2d}  loss {loss.data:.4f}")
print("predictions:", [round(net(x).data, 2) for x in xs], "targets:", ys)
print("parameters:", len(net.params()))
```

You just trained a neural network with an engine you wrote yourself. PyTorch does the same thing — on tensors instead of single numbers, on GPUs, with hundreds of operation types.

## Backprop for a real network in NumPy

For speed, real code computes gradients for **whole matrices** at once. Here is a 2-layer network trained on a non-linear "two moons" dataset, with the backward pass written by hand.

:::formula Backward pass for  h = relu(X W₁ + b₁),  logits = h W₂ + b₂,  softmax cross-entropy
dlogits = (softmax(logits) − one_hot(y)) / N
dW₂ = hᵀ · dlogits          db₂ = Σ dlogits
dh  = dlogits · W₂ᵀ          dz₁ = dh ⊙ (z₁ > 0)
dW₁ = Xᵀ · dz₁              db₁ = Σ dz₁
:::

```python run level=advanced
import numpy as np
from sklearn.datasets import make_moons

X, y = make_moons(n_samples=600, noise=0.2, random_state=0)
rng = np.random.default_rng(0)
H = 32                                                   # hidden units
W1 = rng.normal(0, np.sqrt(2 / 2), (2, H)); b1 = np.zeros(H)
W2 = rng.normal(0, np.sqrt(2 / H), (H, 2)); b2 = np.zeros(2)
lr, N = 0.5, len(X)
Y = np.eye(2)[y]                                         # one-hot targets

for epoch in range(1501):
    # ---- forward ----
    z1 = X @ W1 + b1
    h = np.maximum(0, z1)
    logits = h @ W2 + b2
    e = np.exp(logits - logits.max(axis=1, keepdims=True))
    p = e / e.sum(axis=1, keepdims=True)
    loss = -np.mean(np.log(p[np.arange(N), y] + 1e-12))
    # ---- backward ----
    dlogits = (p - Y) / N
    dW2 = h.T @ dlogits;   db2 = dlogits.sum(axis=0)
    dh = dlogits @ W2.T
    dz1 = dh * (z1 > 0)                                  # ReLU passes gradient only where z1 > 0
    dW1 = X.T @ dz1;       db1 = dz1.sum(axis=0)
    # ---- update ----
    for param, grad in [(W1, dW1), (b1, db1), (W2, dW2), (b2, db2)]:
        param -= lr * grad
    if epoch % 300 == 0:
        acc = np.mean(p.argmax(axis=1) == y)
        print(f"epoch {epoch:4d}  loss {loss:.4f}  accuracy {acc:.1%}")
```

### Gradient checking

Hand-written gradients are easy to get wrong. Always verify them numerically:

```python run level=advanced
import numpy as np

rng = np.random.default_rng(1)
X = rng.normal(size=(5, 3)); y = np.array([0, 1, 1, 0, 1])
W1 = rng.normal(size=(3, 4)); b1 = np.zeros(4); W2 = rng.normal(size=(4, 2)); b2 = np.zeros(2)

def loss_fn(W1):
    h = np.maximum(0, X @ W1 + b1); lg = h @ W2 + b2
    p = np.exp(lg - lg.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
    return -np.mean(np.log(p[np.arange(5), y]))

# analytic gradient (backprop)
z1 = X @ W1 + b1; h = np.maximum(0, z1); lg = h @ W2 + b2
p = np.exp(lg - lg.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
dlg = (p - np.eye(2)[y]) / 5
dW1 = X.T @ ((dlg @ W2.T) * (z1 > 0))

# numerical gradient
num = np.zeros_like(W1); eps = 1e-5
for i in range(W1.shape[0]):
    for j in range(W1.shape[1]):
        Wp, Wm = W1.copy(), W1.copy()
        Wp[i, j] += eps; Wm[i, j] -= eps
        num[i, j] = (loss_fn(Wp) - loss_fn(Wm)) / (2 * eps)
print("max difference:", np.abs(num - dW1).max())     # tiny = our backprop is correct
```

## See what the network learned

```python run level=advanced
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import make_moons

X, y = make_moons(n_samples=400, noise=0.2, random_state=0)
rng = np.random.default_rng(0)

def train(hidden, epochs=2000, lr=0.5):
    W1 = rng.normal(0, 1, (2, hidden)); b1 = np.zeros(hidden)
    W2 = rng.normal(0, np.sqrt(2 / hidden), (hidden, 2)); b2 = np.zeros(2)
    Y = np.eye(2)[y]
    for _ in range(epochs):
        z1 = X @ W1 + b1; h = np.maximum(0, z1); lg = h @ W2 + b2
        p = np.exp(lg - lg.max(1, keepdims=True)); p /= p.sum(1, keepdims=True)
        d = (p - Y) / len(X)
        dz = (d @ W2.T) * (z1 > 0)
        W2 -= lr * h.T @ d; b2 -= lr * d.sum(0); W1 -= lr * X.T @ dz; b1 -= lr * dz.sum(0)
    return lambda P: (np.maximum(0, P @ W1 + b1) @ W2 + b2).argmax(1)

xx, yy = np.meshgrid(np.linspace(-1.6, 2.6, 200), np.linspace(-1.2, 1.7, 200))
grid = np.c_[xx.ravel(), yy.ravel()]
fig, axes = plt.subplots(1, 3, figsize=(12, 3.6))
for ax, hidden in zip(axes, [1, 4, 64]):
    predict = train(hidden)
    ax.contourf(xx, yy, predict(grid).reshape(xx.shape), alpha=0.3, cmap="coolwarm")
    ax.scatter(X[:, 0], X[:, 1], c=y, cmap="coolwarm", s=10)
    ax.set_title(f"{hidden} hidden neuron(s) — acc {np.mean(predict(X) == y):.0%}")
fig.tight_layout()
plt.show()
```

With one hidden neuron the network can only draw a straight-ish line. With more, it bends the boundary to fit the moons.

:::def Vanishing / exploding gradients
In deep networks, gradients are products of many factors. If those factors are mostly < 1, gradients **vanish** (early layers stop learning); if mostly > 1, they **explode**. ReLU-family activations, good initialization, normalization layers and residual connections fix this.
:::

:::ai
Training an LLM is exactly this: forward pass through ~100 layers, cross-entropy loss on the next token, **backprop** computes gradients for billions of weights, an optimizer updates them — repeated for trillions of tokens. The code is bigger; the idea is the same.
:::

## Check yourself

```quiz
? What does backpropagation compute?
+ The gradient of the loss with respect to every parameter
- The network's predictions
- The best learning rate
> It applies the chain rule backwards from the loss.

? In the Value class, why do gradients use `+=` instead of `=`?
+ A value used in several places receives gradient from each use, and these add up
- To make it faster
- It's a bug
> If x feeds two operations, dL/dx is the sum of both paths.

? Why must you zero gradients before each backward pass?
+ Otherwise gradients from previous steps accumulate
- To reset the weights
- To save memory
> PyTorch's optimizer.zero_grad() exists for exactly this reason.

? What does ReLU pass backwards?
+ The incoming gradient where the input was positive, 0 elsewhere
- Always 1
- The input value
> d/dz max(0, z) = 1 if z > 0 else 0.
```

:::exercise Add a sigmoid operation
Extend the small `Value` class with a `sigmoid()` method (forward: `1 / (1 + e^-x)`, local derivative: `s * (1 - s)`). Compute `y = sigmoid(w * x)` for `w = 0.5, x = 2.0`, call `backward()`, and check `w.grad` against the numerical derivative.
:::

:::solution
```python run
import math

class Value:
    def __init__(self, data, parents=()):
        self.data, self.grad, self._parents, self._backward = data, 0.0, parents, (lambda: None)
    def __mul__(self, o):
        out = Value(self.data * o.data, (self, o))
        def bw(): self.grad += o.data * out.grad; o.grad += self.data * out.grad
        out._backward = bw; return out
    def sigmoid(self):
        s = 1 / (1 + math.exp(-self.data)); out = Value(s, (self,))
        def bw(): self.grad += s * (1 - s) * out.grad
        out._backward = bw; return out
    def backward(self):
        order, seen = [], set()
        def build(v):
            if v not in seen:
                seen.add(v); [build(p) for p in v._parents]; order.append(v)
        build(self); self.grad = 1.0
        for v in reversed(order): v._backward()

w, x = Value(0.5), Value(2.0)
y = (w * x).sigmoid()
y.backward()
f = lambda wv: 1 / (1 + math.exp(-wv * 2.0))
print("autograd :", round(w.grad, 6))
print("numerical:", round((f(0.5 + 1e-6) - f(0.5 - 1e-6)) / 2e-6, 6))
```
:::

:::keypoints
- Backpropagation = the **chain rule** applied backwards through the computation graph.
- **Autograd** records operations in the forward pass and computes every gradient in the backward pass.
- For matrices: `dW = Xᵀ · d(output)`, and ReLU passes gradients only where its input was positive.
- Verify hand-written gradients with **numerical gradient checking**.
- More hidden units → more flexible decision boundaries.
:::
