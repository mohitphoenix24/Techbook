---
title: Visualization with Matplotlib
level: intermediate
time: 28
summary: Turn numbers into pictures. Line plots for training curves, histograms for distributions, scatter plots for embeddings, heatmaps for attention and confusion matrices — all rendered right on this page.
---

A plot often reveals in one second what a table hides: a loss curve that stopped improving, a skewed dataset, clusters in embedding space. **Matplotlib** is Python's core plotting library — Seaborn and pandas plotting are built on top of it.

:::tip Plots on this page
Press **Run** and the chart appears below the code. Change colours, sizes, data — and run again.
:::

## The two-line plot

```python run level=easy
import matplotlib.pyplot as plt

epochs = [1, 2, 3, 4, 5, 6, 7, 8]
loss = [2.3, 1.7, 1.3, 1.05, 0.9, 0.82, 0.78, 0.76]

plt.plot(epochs, loss)
plt.show()
```

## Figure and Axes — the right way

:::def Figure and Axes
A **Figure** is the whole image. An **Axes** is one plot inside it (with its own x-axis, y-axis, title…). `fig, ax = plt.subplots()` creates both; you then call methods on `ax`. This "object-oriented" style scales to multi-plot figures.
:::

:::syntax
```python
fig, ax = plt.subplots(figsize=(width, height))
ax.plot(x, y, label="name")
ax.set(title="...", xlabel="...", ylabel="...")
ax.legend()
plt.show()
```
:::

```python run level=easy
import matplotlib.pyplot as plt
import numpy as np

epochs = np.arange(1, 21)
train_loss = 2.5 * np.exp(-epochs / 5) + 0.25
val_loss = 2.5 * np.exp(-epochs / 6) + 0.35 + 0.012 * np.maximum(0, epochs - 10) ** 1.5

fig, ax = plt.subplots(figsize=(7, 4))
ax.plot(epochs, train_loss, marker="o", markersize=4, label="train loss")
ax.plot(epochs, val_loss, marker="s", markersize=4, label="validation loss")
best = int(np.argmin(val_loss))
ax.axvline(epochs[best], color="gray", linestyle="--", linewidth=1)
ax.annotate(f"best epoch: {epochs[best]}", (epochs[best], val_loss[best]),
            xytext=(epochs[best] + 1.5, val_loss[best] + 0.6), arrowprops=dict(arrowstyle="->"))
ax.set(title="Training curves — spot the overfitting", xlabel="epoch", ylabel="loss")
ax.legend()
plt.show()
```

:::def Overfitting (visual)
When the training loss keeps going down but the validation loss starts going **up**, the model is memorising the training data instead of learning general patterns. The best checkpoint is where validation loss is lowest.
:::

## The main chart types

| Chart | Method | Use it for |
|---|---|---|
| line | `ax.plot` | values over time / steps (loss curves) |
| scatter | `ax.scatter` | relationship of two variables, embeddings in 2-D |
| bar | `ax.bar` / `ax.barh` | comparing categories (model accuracy) |
| histogram | `ax.hist` | distribution of one variable (token lengths) |
| box plot | `ax.boxplot` | spread and outliers per group (latencies) |
| heatmap | `ax.imshow` | grids (confusion matrix, attention weights) |

### Histogram — how long are my documents?

```python run level=easy
import matplotlib.pyplot as plt
import numpy as np

rng = np.random.default_rng(0)
token_lengths = rng.lognormal(mean=6, sigma=0.6, size=2000).astype(int)

fig, ax = plt.subplots(figsize=(7, 3.8))
ax.hist(token_lengths, bins=50, color="#6d7cff", edgecolor="white")
ax.axvline(np.median(token_lengths), color="crimson", linestyle="--", label=f"median = {int(np.median(token_lengths))}")
ax.axvline(512, color="black", linewidth=1, label="chunk limit = 512")
ax.set(title="Document length distribution", xlabel="tokens", ylabel="number of documents")
ax.legend()
plt.show()
print(f"{(token_lengths > 512).mean():.0%} of documents need splitting into chunks")
```

### Bar chart — comparing models

```python run level=easy
import matplotlib.pyplot as plt

models = ["model A", "model B", "model C", "model D"]
accuracy = [0.91, 0.87, 0.78, 0.83]
colors = ["#22c55e" if a == max(accuracy) else "#94a3b8" for a in accuracy]

fig, ax = plt.subplots(figsize=(6, 3.5))
bars = ax.bar(models, accuracy, color=colors)
ax.bar_label(bars, labels=[f"{a:.0%}" for a in accuracy], padding=3)
ax.set_ylim(0, 1)
ax.set(title="Accuracy on the eval set", ylabel="accuracy")
plt.show()
```

### Scatter — embeddings in 2-D

```python run level=intermediate
import matplotlib.pyplot as plt
import numpy as np

rng = np.random.default_rng(3)
topics = {"sports": (2, 2), "finance": (-2, 1), "cooking": (0, -2.5)}

fig, ax = plt.subplots(figsize=(6, 5))
for name, (cx, cy) in topics.items():
    pts = rng.normal([cx, cy], 0.6, size=(40, 2))
    ax.scatter(pts[:, 0], pts[:, 1], alpha=0.7, s=30, label=name)
query = np.array([1.6, 1.4])
ax.scatter(*query, marker="*", s=350, color="black", label="query")
ax.set(title="Document embeddings (projected to 2-D)", xlabel="dim 1", ylabel="dim 2")
ax.legend()
plt.show()
```

## Several plots in one figure

```python run level=intermediate
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(-5, 5, 200)
activations = {
    "sigmoid": 1 / (1 + np.exp(-x)),
    "tanh": np.tanh(x),
    "ReLU": np.maximum(0, x),
    "GELU": 0.5 * x * (1 + np.tanh(np.sqrt(2 / np.pi) * (x + 0.044715 * x ** 3))),
}

fig, axes = plt.subplots(2, 2, figsize=(8, 6), sharex=True)
for ax, (name, y) in zip(axes.flat, activations.items()):
    ax.plot(x, y, linewidth=2.2)
    ax.axhline(0, color="gray", linewidth=0.6)
    ax.axvline(0, color="gray", linewidth=0.6)
    ax.set_title(name)
fig.suptitle("Activation functions used in neural networks", fontweight="bold")
fig.tight_layout()
plt.show()
```

## Heatmaps — confusion matrices and attention

```python run level=intermediate
import matplotlib.pyplot as plt
import numpy as np

labels = ["billing", "bug", "feature", "other"]
cm = np.array([[42, 3, 1, 4],
               [2, 51, 6, 1],
               [0, 5, 38, 2],
               [6, 2, 3, 29]])

fig, ax = plt.subplots(figsize=(5.5, 4.5))
im = ax.imshow(cm, cmap="Blues")
ax.set_xticks(range(len(labels)), labels, rotation=30)
ax.set_yticks(range(len(labels)), labels)
for i in range(len(labels)):
    for j in range(len(labels)):
        ax.text(j, i, cm[i, j], ha="center", va="center", color="white" if cm[i, j] > 30 else "black")
ax.set(xlabel="predicted", ylabel="actual", title="Confusion matrix")
fig.colorbar(im, ax=ax)
plt.show()
```

```python run level=advanced
import matplotlib.pyplot as plt
import numpy as np

tokens = ["The", "cat", "sat", "on", "the", "mat"]
rng = np.random.default_rng(1)
scores = rng.normal(size=(6, 6)) + np.eye(6) * 1.5
scores[np.triu_indices(6, k=1)] = -np.inf            # causal mask: can't look at future tokens
weights = np.exp(scores - scores.max(axis=1, keepdims=True))
weights /= weights.sum(axis=1, keepdims=True)

fig, ax = plt.subplots(figsize=(5, 4.5))
ax.imshow(weights, cmap="viridis")
ax.set_xticks(range(6), tokens)
ax.set_yticks(range(6), tokens)
ax.set(title="Causal self-attention weights", xlabel="attends to (key)", ylabel="token (query)")
for i in range(6):
    for j in range(i + 1):
        ax.text(j, i, f"{weights[i, j]:.2f}", ha="center", va="center", fontsize=8, color="white")
plt.show()
```

## Plotting from pandas

```python run level=intermediate
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(5)
days = pd.date_range("2026-09-01", periods=30, freq="D")
usage = pd.DataFrame({
    "input tokens (M)": np.cumsum(rng.uniform(0.5, 2.0, 30)),
    "output tokens (M)": np.cumsum(rng.uniform(0.1, 0.5, 30)),
}, index=days)

ax = usage.plot(figsize=(7, 3.8), title="Cumulative token usage in September")
ax.set_ylabel("millions of tokens")
plt.show()

latency = pd.DataFrame({m: rng.gamma(k, 150, 200) for m, k in [("fast", 2), ("balanced", 4), ("deep", 9)]})
latency.plot(kind="box", figsize=(6, 3.5), title="Latency by model tier (ms)")
plt.show()
```

## Making plots look good

```python run level=advanced
import matplotlib.pyplot as plt
import numpy as np

steps = np.arange(0, 3000, 10)
rng = np.random.default_rng(0)
raw = 3 * np.exp(-steps / 700) + 0.4 + rng.normal(0, 0.08, steps.size)
smooth = np.convolve(raw, np.ones(25) / 25, mode="same")     # moving average

with plt.style.context("seaborn-v0_8-whitegrid"):
    fig, ax = plt.subplots(figsize=(7.5, 4))
    ax.plot(steps, raw, color="#c7d2fe", linewidth=1, label="raw loss")
    ax.plot(steps[12:-12], smooth[12:-12], color="#4f46e5", linewidth=2.5, label="smoothed (25 steps)")
    ax.fill_between(steps, 0.4, raw.min(), color="#22c55e", alpha=0.08)
    ax.set(xlabel="training step", ylabel="loss", title="Language-model pretraining loss")
    ax.set_yscale("log")
    ax.legend(frameon=True)
    plt.show()
```

| Tip | How |
|---|---|
| label everything | `ax.set(title=..., xlabel=..., ylabel=...)` |
| legend for multiple series | `label="..."` + `ax.legend()` |
| readable size | `figsize=(w, h)` in inches |
| no overlaps | `fig.tight_layout()` |
| noisy curves | plot a moving average on top |
| huge ranges | `ax.set_yscale("log")` |
| save to file | `fig.savefig("plot.png", dpi=200, bbox_inches="tight")` |

:::ai
You will plot: **loss curves** during training, **token-length histograms** when choosing chunk sizes, **embedding scatter plots** (after PCA/t-SNE/UMAP) to inspect clusters, **confusion matrices** for classifiers, **attention heatmaps** to see what a Transformer looks at, and **latency/cost dashboards** for LLM apps.
:::

## Check yourself

```quiz
? Which chart best shows the distribution of document lengths?
+ Histogram
- Line plot
- Pie chart
> A histogram counts how many values fall into each range (bin).

? What does `fig, axes = plt.subplots(2, 3)` give you?
+ One figure with a 2×3 grid of Axes
- Six separate figures
- A plot of the numbers 2 and 3
> Loop over `axes.flat` to fill each one.

? The validation loss rises while training loss falls. This is…
+ Overfitting
- Underfitting
- A plotting bug
> The model memorizes training data and generalizes worse.
```

:::exercise Plot learning-rate experiments
Simulate loss curves for three learning rates — `0.001`, `0.01`, `0.1` — over 50 steps with `loss = 2 * exp(-lr * 40 * step / 50) + noise` (use `rng.normal(0, 0.03, 50)`), and plot all three on one Axes with a legend, labels and a title.
:::

:::solution
```python run
import matplotlib.pyplot as plt
import numpy as np

rng = np.random.default_rng(0)
steps = np.arange(50)
fig, ax = plt.subplots(figsize=(7, 4))
for lr in [0.001, 0.01, 0.1]:
    loss = 2 * np.exp(-lr * 40 * steps / 50) + rng.normal(0, 0.03, 50)
    ax.plot(steps, loss, label=f"lr = {lr}")
ax.set(title="Effect of learning rate", xlabel="step", ylabel="loss")
ax.legend()
plt.show()
```
:::

:::keypoints
- Use `fig, ax = plt.subplots()` and call `ax.plot/scatter/bar/hist/imshow`.
- Always label: title, axis labels, legend.
- Pick the chart for the question: line (trends), hist (distribution), bar (comparison), scatter (relationships), heatmap (grids).
- `plt.subplots(rows, cols)` makes multi-panel figures; `tight_layout()` tidies them.
- DataFrames plot directly with `df.plot(...)`.
:::
