---
title: A Linear Classifier from Scratch — Softmax and Cross-Entropy
level: intermediate
time: 45
summary: The simplest image classifier, built in NumPy. Scores from a weight matrix, softmax to get probabilities, cross-entropy loss, the gradient, gradient descent, and a picture of what the weights learned. This is the last layer of every CNN.
---

A neural network for images looks complicated. But its last step is always the same small machine: **a linear classifier with softmax**. Understand it once and a CNN is just "a better way to make the input vector".

## From pixels to class scores

Flatten the image into a vector `x` (for an 8 × 8 digit, 64 numbers). For `C = 10` classes keep a weight matrix `W` of shape `64 × 10` and a bias `b` (10 numbers). The **scores** (also called **logits**) are:

`z = x W + b`

Each class has its own column of `W`: a **template**. The score of a class is how well the image matches its template (a dot product).

## Softmax: scores to probabilities

Scores can be any number. **Softmax** turns them into probabilities that are positive and add to 1:

:::formula Softmax
p_k = \frac{e^{z_k}}{\sum_j e^{z_j}}
:::

The exponential makes the biggest score dominate. Always subtract the maximum score first (`z − max z`): it gives the same result but avoids overflow.

```python run title="Softmax" level=easy
import numpy as np

def softmax(z):
    z = z - z.max(axis=-1, keepdims=True)                  # numerical stability: same answer, no overflow
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)

scores = np.array([2.0, 1.0, 0.1])
print("probabilities:", np.round(softmax(scores), 3), " sum =", softmax(scores).sum())
print("big scores, no overflow:", np.round(softmax(np.array([1000.0, 1001.0, 1002.0])), 3))
print("temperature 0.5 (sharper):", np.round(softmax(scores / 0.5), 3), "  temperature 5 (flatter):", np.round(softmax(scores / 5), 3))
```

## Cross-entropy loss: how wrong is the model?

If the true class is `y`, we want the probability `p_y` to be 1. The **cross-entropy loss** is `L = −log p_y`. If the model gives the right class probability 0.9, the loss is 0.105; at 0.1 it is 2.3; at 0.01 it is 4.6. It punishes **confident mistakes** very strongly.

Useful check: with `C` classes and random weights, every class has probability `1/C`, so the **starting loss should be about `log C`** (2.30 for 10 classes). If it is very different, you have a bug.

## The gradient (it is beautiful)

To reduce the loss we need the gradient of `L` with respect to the weights. For softmax plus cross-entropy it simplifies to:

:::formula Gradient of the loss with respect to the scores
\frac{\partial L}{\partial z} = p - \text{onehot}(y)
:::

"Predicted probabilities minus the true one-hot vector." Then `∂L/∂W = xᵀ (p − y)`, averaged over the examples. Gradient descent updates `W ← W − lr · ∂L/∂W`.

## Train it

```python run title="Softmax regression on digits, from scratch" level=intermediate shared
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split

X, y = load_digits(return_X_y=True)
X = X / 16.0
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
Y = np.eye(10)[ytr]                                          # one-hot labels

def softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)

rng = np.random.default_rng(0)
W = rng.normal(0, 0.01, (64, 10)); b = np.zeros(10)
lr, wd = 0.5, 1e-3                                           # learning rate and weight decay (L2 regularisation)
history = []
for epoch in range(200):
    P = softmax(Xtr @ W + b)
    loss = -np.log(P[np.arange(len(ytr)), ytr] + 1e-12).mean() + wd * (W ** 2).sum()
    G = (P - Y) / len(ytr)                                   # gradient of the loss with respect to the scores
    W -= lr * (Xtr.T @ G + 2 * wd * W)
    b -= lr * G.sum(axis=0)
    history.append(loss)
    if epoch in (0, 50, 100, 199):
        acc = (softmax(Xte @ W + b).argmax(1) == yte).mean()
        print(f"epoch {epoch:3d}: loss {loss:.3f}   test accuracy {acc:.3f}")
print("starting loss was about log(10) =", round(float(np.log(10)), 3))
```

The loss starts at 2.3 (= log 10) and falls; test accuracy reaches about 95%. A linear classifier on raw pixels is already decent on tidy digits.

## Check your gradient numerically

When you write gradients by hand, **always verify** them with finite differences: nudge one weight by a tiny `h` and see if the loss changes by `h × gradient`. This habit saves hours.

```python run title="Gradient check" level=intermediate shared
def loss_fn(W_, b_, Xb, yb, wd_=0.0):
    P_ = softmax(Xb @ W_ + b_)
    return -np.log(P_[np.arange(len(yb)), yb] + 1e-12).mean() + wd_ * (W_ ** 2).sum()

Xb, yb = Xtr[:50], ytr[:50]
P = softmax(Xb @ W + b)
analytic = Xb.T @ ((P - np.eye(10)[yb]) / len(yb))          # our formula (no weight decay for this check)
h = 1e-5
worst = 0
for (i, j) in [(0, 0), (10, 3), (30, 7), (63, 9), (20, 5)]:
    Wp, Wm = W.copy(), W.copy()
    Wp[i, j] += h; Wm[i, j] -= h
    numeric = (loss_fn(Wp, b, Xb, yb) - loss_fn(Wm, b, Xb, yb)) / (2 * h)
    worst = max(worst, abs(numeric - analytic[i, j]))
    print(f"W[{i:2d},{j}]  analytic {analytic[i, j]: .6f}  numeric {numeric: .6f}")
print("largest difference:", f"{worst:.2e}")
```

## What did it learn? Look at the weights

Each column of `W` is a template for a class. Reshape it back to 8 × 8 and look at it.

```python run title="The learned templates" level=easy shared
import cvlab

templates = [(W[:, k].reshape(8, 8)) for k in range(10)]
cvlab.show(*templates, titles=[f"class {k}" for k in range(10)], width=110)
print("bright = pixels that vote FOR the class, dark = pixels that vote AGAINST it")
```

You can see rough digit shapes: bright where the class usually has ink and dark where it usually does not. A linear classifier is a **template matcher**, which is also why it fails when the digit moves or changes size. Hidden layers and convolutions fix this.

## Hinge loss and SVMs (for the interview)

Another popular loss is the **hinge loss** of the support vector machine: `max(0, 1 − margin)`. It wants the correct class to win by a margin, then stops caring. Softmax/cross-entropy never fully stops: it always wants more confidence, and gives **probabilities**. Deep learning almost always uses cross-entropy.

:::interview Questions you may get
- "What is softmax and why do we subtract the maximum?" It turns scores into probabilities; subtracting the maximum avoids overflow without changing the result.
- "What should the initial loss be for a 10-class problem?" About `ln 10 = 2.30`.
- "What is the gradient of cross-entropy with softmax?" Probabilities minus the one-hot label.
- "Why cross-entropy and not squared error for classification?" It gives strong gradients for confident mistakes, matches maximum likelihood of the class probabilities, and avoids the vanishing gradients that squared error has with saturated outputs.
- "What does weight decay do?" Adds an L2 penalty on the weights, shrinking them, which reduces overfitting.
- "How do you check a hand-written gradient?" Compare with finite differences.
:::

```quiz
? For 1000 classes with random weights, the expected starting cross-entropy loss is about...
- 0
+ ln(1000) ≈ 6.9
- 1000
> Every class has probability 1/1000 at the start.

? What is the gradient of the loss with respect to the logits for softmax + cross-entropy?
+ p − y (predictions minus the one-hot label)
- p · y
- y − 0.5
> A very simple and useful result.

? What does each column of W represent in a linear classifier on pixels?
+ A template for one class
- A pixel
- A training image
> The score is the dot product of the image with the template.

? Why can softmax over [1000, 1001, 1002] overflow if implemented naively?
+ e^1000 is too large to represent; subtracting the max fixes it
- Softmax needs integers
- The scores add to 1
> Use z − max(z).
```

:::problem Your classifier's loss starts at 11.5 instead of about 2.3 for 10 classes, and does not fall. What do you check? {level=easy tags="debugging,loss,softmax"}
Think about initial conditions.

:::solution Model answer
A starting loss far above `ln C` means the initial logits are large and confidently wrong: the weights were initialised with too large a scale, inputs were not normalised (values 0–255 instead of 0–1, or no mean subtraction), or labels and outputs do not line up (labels off by one, wrong ordering). Check the data scaling, initialise with small random weights, confirm the label range, and verify that loss on a small batch can be driven to zero by overfitting it.
:::
:::

:::keypoints
- A linear classifier: scores `z = xW + b`, softmax for probabilities, cross-entropy loss `−log p_y`.
- Gradient of the loss with respect to the logits is `p − onehot(y)`; update `W ← W − lr·xᵀ(p−y)`.
- Initial loss should be about `ln C`. Always check gradients numerically.
- The weights are class templates; this is the final layer of CNNs, which learn better inputs for it.
:::

:::resources
- [CS231n: linear classification](https://cs231n.github.io/linear-classify/) — softmax, SVM loss and the gradient, explained clearly.
- [CS231n: optimisation](https://cs231n.github.io/optimization-1/) — gradient descent and numerical gradient checks.
:::
