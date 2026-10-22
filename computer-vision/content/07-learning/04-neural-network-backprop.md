---
title: A Neural Network and Backpropagation from Scratch
level: intermediate
time: 50
summary: Add a hidden layer and non-linearity, and learn the weights with backpropagation (the chain rule). You write the forward and backward pass in NumPy, train on digits, check gradients, and see why activation functions matter.
---

A linear classifier can only draw straight boundaries. A **neural network** stacks layers with **non-linear** steps between them, so it can learn curved, complex decision rules. Here is the smallest useful one, with the learning algorithm written out. Backpropagation is the one algorithm every deep-learning interview checks.

## The model

A **two-layer network**:

```text
x  ->  z1 = x W1 + b1  ->  a1 = ReLU(z1)  ->  z2 = a1 W2 + b2  ->  p = softmax(z2)
```

- **Hidden layer**: 64 inputs → 64 hidden units. Each unit computes a weighted sum and then **ReLU**: `ReLU(z) = max(0, z)`.
- **Output layer**: 64 → 10 class scores, then softmax.

:::def Why a non-linearity?
Without ReLU, `(xW1)W2 = x(W1W2)` is just another linear map. Stacking linear layers adds nothing. The non-linearity is what lets depth build up complex features from simple ones.
:::

## Backpropagation = the chain rule, applied backwards

To learn we need `∂L/∂W` for **every** weight. The **chain rule** says: to find how the loss changes with an early weight, multiply the local derivatives along the path from that weight to the loss. Backpropagation computes this efficiently by going **backwards**, reusing results:

:::flow Backward pass for the two-layer network
Output scores | dz2 = (p − onehot(y)) / N. The gradient at the scores.
Second layer weights | dW2 = a1ᵀ dz2,  db2 = sum of dz2.
Hidden activations | da1 = dz2 W2ᵀ. Pass the gradient back through the weights.
Through the ReLU | dz1 = da1 · (z1 > 0). ReLU passes the gradient where it was active and blocks it elsewhere.
First layer weights | dW1 = xᵀ dz1,  db1 = sum of dz1.
:::

Each step needs only the gradient arriving from above and the values saved during the forward pass. The same pattern repeats for any depth, and deep-learning frameworks (PyTorch autograd) do it automatically. Writing it once by hand makes you understand what autograd does.

## Train it

```python run title="A two-layer network with backpropagation" level=intermediate shared
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split

X, y = load_digits(return_X_y=True)
X = X / 16.0
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
Y = np.eye(10)[ytr]

def softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)

rng = np.random.default_rng(0)
H = 64
W1 = rng.normal(0, np.sqrt(2 / 64), (64, H)); b1 = np.zeros(H)          # He initialisation: scale sqrt(2 / fan_in) suits ReLU
W2 = rng.normal(0, np.sqrt(2 / H), (H, 10)); b2 = np.zeros(10)

def forward(x):
    z1 = x @ W1 + b1
    a1 = np.maximum(0, z1)
    return z1, a1, softmax(a1 @ W2 + b2)

lr = 0.5
for epoch in range(300):
    z1, a1, P = forward(Xtr)
    loss = -np.log(P[np.arange(len(ytr)), ytr] + 1e-12).mean()
    dz2 = (P - Y) / len(ytr)                                  # backward pass
    dW2, db2 = a1.T @ dz2, dz2.sum(0)
    da1 = dz2 @ W2.T
    dz1 = da1 * (z1 > 0)
    dW1, db1 = Xtr.T @ dz1, dz1.sum(0)
    W1 -= lr * dW1; b1 -= lr * db1; W2 -= lr * dW2; b2 -= lr * db2
    if epoch in (0, 25, 100, 299):
        acc = (forward(Xte)[2].argmax(1) == yte).mean()
        print(f"epoch {epoch:3d}: loss {loss:.3f}   test accuracy {acc:.3f}")
```

The hidden layer lifts test accuracy from about 95% (linear) to about 97%. On harder image data the gap would be far larger.

## Check the backward pass

```python run title="Numerical gradient check for the network" level=intermediate shared
def loss_of(W1_, b1_, W2_, b2_, xb, yb):
    a = np.maximum(0, xb @ W1_ + b1_)
    P_ = softmax(a @ W2_ + b2_)
    return -np.log(P_[np.arange(len(yb)), yb] + 1e-12).mean()

xb, yb = Xtr[:40], ytr[:40]
z1 = xb @ W1 + b1; a1 = np.maximum(0, z1); P = softmax(a1 @ W2 + b2)
dz2 = (P - np.eye(10)[yb]) / len(yb); dW2 = a1.T @ dz2
dz1 = (dz2 @ W2.T) * (z1 > 0); dW1 = xb.T @ dz1
h = 1e-5
for name, arr, grad, idx in [("W1", W1, dW1, (5, 7)), ("W1", W1, dW1, (40, 20)), ("W2", W2, dW2, (3, 4)), ("W2", W2, dW2, (50, 9))]:
    plus, minus = arr.copy(), arr.copy()
    plus[idx] += h; minus[idx] -= h
    args = lambda w: (w if name == "W1" else W1, b1, w if name == "W2" else W2, b2, xb, yb)
    num = (loss_of(*args(plus)) - loss_of(*args(minus))) / (2 * h)
    print(f"{name}{idx}: backprop {grad[idx]: .7f}   numeric {num: .7f}")
```

The two columns agree to many digits: the backward pass is correct.

## Activation functions

| Function | Formula | Notes |
|---|---|---|
| **Sigmoid** | `1 / (1 + e^−z)` | Squashes to 0–1. Saturates (gradient ≈ 0 for large |z|), so deep networks **stop learning** (vanishing gradient). Now used only at outputs |
| **Tanh** | `tanh z` | Centred at 0, but also saturates |
| **ReLU** | `max(0, z)` | Cheap, no saturation for z > 0; the default for years. "Dead ReLU": a unit stuck at 0 never recovers |
| **Leaky ReLU / PReLU** | `max(0.01z, z)` | Small slope for z < 0 avoids dead units |
| **GELU, SiLU (Swish)** | smooth ReLU-like | Used in transformers and modern CNNs (EfficientNet, ConvNeXt) |

```python run title="Why sigmoid hurts deep networks: gradients shrink" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
x = rng.normal(0, 1, (64, 100))
def grad_norm_through(layers, act, dact):
    """Push a signal forward through `layers` random layers and a gradient backward; report the gradient size at the first layer."""
    Ws = [rng.normal(0, np.sqrt(1 / 100), (100, 100)) for _ in range(layers)]
    zs, a = [], x
    for W in Ws:
        z = a @ W; zs.append(z); a = act(z)
    g = np.ones_like(a)
    for W, z in zip(reversed(Ws), reversed(zs)):
        g = (g * dact(z)) @ W.T
    return float(np.sqrt((g ** 2).mean()))

sig = lambda z: 1 / (1 + np.exp(-z)); dsig = lambda z: sig(z) * (1 - sig(z))
relu = lambda z: np.maximum(0, z); drelu = lambda z: (z > 0).astype(float)
print("layers   gradient size at layer 1: sigmoid        ReLU")
for L in (2, 5, 10, 20):
    print(f"{L:6d} {grad_norm_through(L, sig, dsig):28.2e} {grad_norm_through(L, relu, drelu):12.2e}")
```

With sigmoid, the gradient shrinks by a large factor with every layer (the derivative is at most 0.25). ReLU, whose derivative is 1 for positive inputs, keeps it from collapsing (it can still shrink or grow depending on the initialisation, which is why we use He initialisation). The same problem is solved in deep CNNs by **ReLU, good initialisation, normalisation layers and skip connections**.

## What else you need to know

- **Initialisation** matters: too small → signals vanish; too large → they explode. **He** (ReLU) and **Xavier/Glorot** (tanh/sigmoid) scale by the layer width.
- **Mini-batches**: compute the gradient on 32–256 examples at a time (stochastic gradient descent). Noisy, but faster and often generalises better.
- **Momentum / Adam**: smooth the updates; Adam adapts a step size per weight (CNN lesson).
- **Universal approximation**: a wide enough network with one hidden layer can approximate any reasonable function, but depth is far more efficient in practice.

:::interview Questions you may get
- "Explain backpropagation." Apply the chain rule from the loss backwards through the layers, reusing the forward-pass values, to compute the gradient of every weight in one backward sweep.
- "Why do we need non-linear activations?" Without them, any stack of linear layers collapses into one linear layer.
- "What is the vanishing gradient problem and how is it reduced?" Gradients shrink layer by layer (saturating activations, bad init); use ReLU-type activations, good initialisation, normalisation and skip connections.
- "What is the gradient of ReLU?" 1 where the input is positive, 0 elsewhere.
- "Why mini-batches?" Cheaper steps and noise that helps generalisation; the batch fits in memory and uses the GPU efficiently.
:::

```quiz
? What happens to the gradient at a ReLU unit whose input was negative?
+ It is blocked (zero)
- It doubles
- It passes unchanged
> ReLU's derivative is 0 for negative inputs.

? Why can't a stack of purely linear layers learn a curved decision boundary?
+ The product of linear maps is itself a single linear map
- They are too slow
- They need more data
> A non-linearity is essential between layers.

? Which initialisation is designed for ReLU layers?
+ He initialisation: std = sqrt(2 / fan_in)
- All zeros
- All ones
> Zeros would make all units identical.

? Why does a deep sigmoid network train badly?
+ The sigmoid's derivative is at most 0.25, so gradients shrink layer after layer
- It has too few parameters
- It cannot output probabilities
> That is the vanishing gradient problem.
```

:::problem Show that initialising all weights of a network to zero is a bad idea. {level=easy tags="initialisation,backprop"}
Think about symmetry.

:::solution Model answer
With all weights equal (zero), every hidden unit computes the same value and receives the same gradient, so after any update they remain identical: the symmetry is never broken and the layer behaves like a single unit. (With ReLU and zero weights, outputs and gradients are even all zero.) Random initialisation breaks the symmetry so that units learn different features; its scale (He/Xavier) keeps activations and gradients at a sensible size across layers.
:::
:::

:::keypoints
- A network is linear layers with non-linearities (ReLU) between them; without them depth adds nothing.
- Backpropagation is the chain rule run backwards: `dz2 = p − y`, `dW2 = a1ᵀdz2`, `dz1 = (dz2W2ᵀ)·[z1>0]`, `dW1 = xᵀdz1`.
- Verify gradients numerically. Use He initialisation with ReLU. Sigmoid saturates and starves deep networks of gradient.
- Mini-batches and better optimisers (momentum, Adam) come next in the CNN module.
:::

:::resources
- [CS231n: backpropagation, intuitions](https://cs231n.github.io/optimization-2/) — the best written explanation.
- [Karpathy: The spelled-out intro to neural networks and backpropagation (micrograd)](https://www.youtube.com/watch?v=VMj-3S1tku0) — builds autograd from scratch.
- [3Blue1Brown: What is backpropagation really doing?](https://www.youtube.com/watch?v=Ilg3gGewQ5U) — a visual explanation.
:::
