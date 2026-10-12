---
title: Linear Regression & Gradient Descent
level: intermediate
time: 35
summary: Build your first learning algorithm from scratch. Fit a line, measure the error, and use gradient descent — the same optimization idea that trains every neural network and LLM.
---

Linear regression is the "hello world" of machine learning. It is simple enough to understand completely, and it introduces **gradient descent** — the algorithm that, scaled up, trains GPT, Claude and every other neural network.

## The model: a straight line

:::def Linear regression
A model that predicts a number as a **weighted sum** of the input features plus a constant: `ŷ = w·x + b`. With one feature it is a straight line; `w` is the slope (weight) and `b` the intercept (bias).
:::

:::formula Linear model
ŷ = w · x + b        (one feature)
ŷ = w₁x₁ + w₂x₂ + … + b = X @ w + b        (many features)
:::

```python run level=easy
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(42)
size = rng.uniform(30, 150, 60)                              # m²
price = 2.5 * size + 40 + rng.normal(0, 25, size.size)       # k$, true w=2.5, b=40 + noise

fig, ax = plt.subplots(figsize=(6.5, 4))
ax.scatter(size, price, alpha=0.7)
for w, b, style in [(1.5, 80, ":"), (2.5, 40, "-"), (3.5, 0, "--")]:
    xs = np.array([30, 150])
    ax.plot(xs, w * xs + b, style, linewidth=2, label=f"w={w}, b={b}")
ax.set(xlabel="size (m²)", ylabel="price (k$)", title="Which line fits best?")
ax.legend()
plt.show()
```

## Measuring "best": the loss

:::def Mean squared error (MSE)
The average of the squared differences between predictions and true values: `MSE = mean((ŷ − y)²)`. Squaring makes all errors positive and punishes big mistakes more.
:::

```python run level=easy
import numpy as np

rng = np.random.default_rng(42)
x = rng.uniform(30, 150, 60)
y = 2.5 * x + 40 + rng.normal(0, 25, x.size)

def mse(w, b):
    return np.mean((w * x + b - y) ** 2)

for w, b in [(1.5, 80), (2.5, 40), (3.5, 0)]:
    print(f"w={w}, b={b:>3}:  MSE = {mse(w, b):8.1f}")
```

Training = **finding the `w` and `b` with the smallest MSE**.

## Gradient descent: walking downhill

:::def Gradient
The direction of **steepest increase** of a function — a list of slopes, one per parameter. It tells you how the loss changes when you nudge each parameter a little.
:::

:::def Gradient descent
An optimization algorithm: start with random parameters, compute the gradient of the loss, take a small step in the **opposite** direction (downhill), and repeat until the loss stops decreasing.
:::

:::def Learning rate
The size of each step in gradient descent. Too small → painfully slow. Too large → you overshoot and the loss explodes. One of the most important hyperparameters in all of deep learning.
:::

:::analogy
You are on a foggy mountain and want to reach the valley. You cannot see far, but you can feel which way the ground slopes under your feet. So you take a small step downhill, feel again, take another step… That is gradient descent. The learning rate is your step size.
:::

:::formula Gradients of MSE for ŷ = w·x + b
∂L/∂w = 2 · mean((ŷ − y) · x)
∂L/∂b = 2 · mean(ŷ − y)
update:   w ← w − lr · ∂L/∂w        b ← b − lr · ∂L/∂b
:::

### Gradient descent on one parameter first

```python run level=intermediate
# Minimize f(w) = (w - 3)^2. Its derivative (gradient) is 2(w - 3). The answer is w = 3.
w = -4.0
lr = 0.2
for step in range(12):
    grad = 2 * (w - 3)
    w = w - lr * grad
    print(f"step {step:2d}: w = {w:7.4f}   loss = {(w - 3) ** 2:.6f}")
```

### Now the full linear regression

```python run level=intermediate
import numpy as np

rng = np.random.default_rng(42)
x = rng.uniform(30, 150, 60)
y = 2.5 * x + 40 + rng.normal(0, 25, x.size)

# Standardize x so a single learning rate works well (we convert back at the end)
mu, sigma = x.mean(), x.std()
xs = (x - mu) / sigma

w, b = 0.0, 0.0
lr = 0.1
history = []
for epoch in range(200):
    y_hat = w * xs + b                         # 1. forward: predict
    error = y_hat - y
    loss = np.mean(error ** 2)                 # 2. measure the loss
    dw = 2 * np.mean(error * xs)               # 3. gradients
    db = 2 * np.mean(error)
    w -= lr * dw                               # 4. update: step downhill
    b -= lr * db
    history.append(loss)
    if epoch % 40 == 0 or epoch == 199:
        print(f"epoch {epoch:3d}  loss {loss:9.2f}")

w_orig = w / sigma                             # undo the standardization
b_orig = b - w * mu / sigma
print(f"\nlearned: price ≈ {w_orig:.2f} · size + {b_orig:.1f}   (true: 2.5 · size + 40)")
```

Those four steps — **predict, measure loss, compute gradients, update** — are the training loop of *every* neural network. PyTorch just computes the gradients for you automatically.

### Watch it learn

```python run level=intermediate
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(42)
x = rng.uniform(30, 150, 60)
y = 2.5 * x + 40 + rng.normal(0, 25, x.size)
mu, sigma = x.mean(), x.std()
xs = (x - mu) / sigma

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4))
ax1.scatter(x, y, alpha=0.5, color="gray")
w = b = 0.0
losses = []
grid = np.linspace(30, 150, 2)
for epoch in range(60):
    err = w * xs + b - y
    losses.append(np.mean(err ** 2))
    if epoch in (0, 2, 5, 10, 59):
        ax1.plot(grid, w * (grid - mu) / sigma + b, label=f"epoch {epoch}")
    w -= 0.1 * 2 * np.mean(err * xs)
    b -= 0.1 * 2 * np.mean(err)
ax1.set(title="The line moves toward the data", xlabel="size", ylabel="price")
ax1.legend(fontsize=8)
ax2.plot(losses, linewidth=2)
ax2.set(title="Loss goes down", xlabel="epoch", ylabel="MSE", yscale="log")
fig.tight_layout()
plt.show()
```

### The learning rate matters a lot

```python run level=intermediate
import numpy as np

rng = np.random.default_rng(42)
x = (lambda v: (v - v.mean()) / v.std())(rng.uniform(30, 150, 60))
y = 60 * x + 230 + rng.normal(0, 25, x.size)

for lr in [0.001, 0.1, 0.9, 1.1]:
    w = b = 0.0
    for _ in range(50):
        err = w * x + b - y
        w -= lr * 2 * np.mean(err * x)
        b -= lr * 2 * np.mean(err)
    final = np.mean((w * x + b - y) ** 2)
    print(f"lr={lr:<6} final loss after 50 steps: {final:,.1f}")
```

- `0.001` — too slow: barely moved.
- `0.1` — just right.
- `0.9` — fast, still OK here.
- `1.1` — too big: the loss **explodes**.

## Many features: the vectorized version

With several features, `w` becomes a vector and predictions become a matrix multiplication.

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
n, d = 500, 3
X = rng.normal(size=(n, d))                          # 3 standardized features
true_w = np.array([3.0, -2.0, 0.5])
y = X @ true_w + 7.0 + rng.normal(0, 0.5, n)

w = np.zeros(d)
b = 0.0
lr = 0.1
for epoch in range(300):
    y_hat = X @ w + b                                # (n,d) @ (d,) -> (n,)
    err = y_hat - y
    grad_w = 2 * X.T @ err / n                       # (d,n) @ (n,) -> (d,)
    grad_b = 2 * err.mean()
    w -= lr * grad_w
    b -= lr * grad_b

print("learned w:", w.round(3), " true:", true_w)
print("learned b:", round(b, 3), " true: 7.0")
```

### Mini-batch stochastic gradient descent

:::def Stochastic gradient descent (SGD)
Instead of computing the gradient on **all** the data each step, use a small random **mini-batch** (e.g. 32 examples). Each step is much cheaper and noisier, but you take many more steps. This is how all large models are trained.
:::

:::def Epoch
One full pass through the entire training dataset. With mini-batches, one epoch contains many update steps.
:::

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
n, d = 2000, 3
X = rng.normal(size=(n, d))
y = X @ np.array([3.0, -2.0, 0.5]) + 7.0 + rng.normal(0, 0.5, n)

w, b = np.zeros(d), 0.0
lr, batch_size = 0.05, 32
for epoch in range(5):
    order = rng.permutation(n)                      # shuffle each epoch
    for start in range(0, n, batch_size):
        idx = order[start:start + batch_size]
        xb, yb = X[idx], y[idx]
        err = xb @ w + b - yb
        w -= lr * 2 * xb.T @ err / len(idx)
        b -= lr * 2 * err.mean()
    loss = np.mean((X @ w + b - y) ** 2)
    print(f"epoch {epoch}: loss {loss:.4f}  w={w.round(2)}  b={b:.2f}  ({n // batch_size + 1} steps)")
```

## The shortcut: closed-form solution

For linear regression specifically, there is a formula that jumps straight to the answer (the **normal equation**). It is great for small problems, but does not scale to neural networks — which is why gradient descent matters.

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
X = rng.normal(size=(500, 3))
y = X @ np.array([3.0, -2.0, 0.5]) + 7.0 + rng.normal(0, 0.5, 500)

Xb = np.hstack([X, np.ones((len(X), 1))])          # add a column of 1s for the bias
coef, *_ = np.linalg.lstsq(Xb, y, rcond=None)       # least-squares solution
print("weights:", coef[:-1].round(3), "bias:", coef[-1].round(3))
```

## Evaluating a regression model

:::def R² (coefficient of determination)
How much of the variation in `y` the model explains, from −∞ to 1. **1** = perfect, **0** = no better than always predicting the mean.
:::

```python run level=advanced
import numpy as np

rng = np.random.default_rng(1)
x = rng.uniform(0, 10, 200)
y = 3 * x + 5 + rng.normal(0, 2, 200)
x_train, x_test, y_train, y_test = x[:150], x[150:], y[:150], y[150:]

w, b = np.polyfit(x_train, y_train, 1)               # fit on train only
pred = w * x_test + b

mse = np.mean((pred - y_test) ** 2)
rmse = np.sqrt(mse)
mae = np.mean(np.abs(pred - y_test))
r2 = 1 - np.sum((y_test - pred) ** 2) / np.sum((y_test - y_test.mean()) ** 2)
print(f"test MSE {mse:.2f} | RMSE {rmse:.2f} | MAE {mae:.2f} | R² {r2:.3f}")
```

| Metric | Read it as |
|---|---|
| MSE | average squared error (units²) |
| RMSE | typical error size, in the target's units |
| MAE | average absolute error — less sensitive to outliers |
| R² | fraction of variance explained (1 = perfect) |

:::ai
Swap "line" for "giant neural network" and "MSE" for "cross-entropy on the next token", and you have LLM pretraining: forward pass → loss → gradients (via backpropagation) → update with an optimizer like **AdamW**, over trillions of tokens in mini-batches. The loop you just wrote is the same loop.
:::

## Check yourself

```quiz
? In gradient descent, which way do you step?
+ Opposite to the gradient (downhill)
- In the direction of the gradient
- Randomly
> The gradient points uphill; we want lower loss.

? The loss gets bigger every step and becomes huge. Most likely cause?
+ The learning rate is too large
- The learning rate is too small
- Too much data
> Big steps overshoot the minimum and diverge.

? What is an epoch?
+ One full pass over the training data
- One gradient update
- One mini-batch
> With batch size 32 and 3200 examples, one epoch = 100 updates.

? R² = 0 means…
+ The model is no better than predicting the mean every time
- The model is perfect
- The model is always wrong by 0
> R² compares your errors with those of the mean predictor.
```

:::exercise Fit a quadratic with gradient descent
Data follows `y = 2x² − 3x + 1` plus noise for `x` in [−2, 2]. Create features `[x², x]`, then use gradient descent (vectorized, lr 0.05, 2000 steps) to learn the weights and bias. You should get close to `[2, −3]` and `1`.
:::

:::solution
```python run
import numpy as np

rng = np.random.default_rng(0)
x = rng.uniform(-2, 2, 300)
y = 2 * x**2 - 3 * x + 1 + rng.normal(0, 0.3, x.size)

X = np.column_stack([x**2, x])
w, b, lr = np.zeros(2), 0.0, 0.05
for _ in range(2000):
    err = X @ w + b - y
    w -= lr * 2 * X.T @ err / len(y)
    b -= lr * 2 * err.mean()
print("w:", w.round(3), "b:", round(b, 3))
```
:::

:::keypoints
- Linear regression predicts `ŷ = X @ w + b`; MSE measures how wrong it is.
- **Gradient descent**: predict → loss → gradients → step opposite the gradient → repeat.
- The **learning rate** controls step size: too small is slow, too big explodes.
- **Mini-batch SGD** + epochs is how all big models train.
- Evaluate regression with RMSE, MAE and R² on held-out data.
:::
