---
title: Segmentation Losses — Cross-Entropy, Dice, Focal, Tversky
level: advanced
time: 45
summary: Why plain cross-entropy fails on small structures, and the alternatives. Weighted cross-entropy, Dice and soft IoU, focal loss, Tversky for recall, boundary-aware weights, and combinations. Implemented in NumPy so you can see the numbers, and a gradient check.
---

For a segmenter, the **loss function** is as important as the architecture. The wrong loss can make a network predict "all background". Here is how each loss behaves, and when to use it.

## The setting

For each pixel `i` the network gives a probability `p_i` of the foreground class (binary case) and the truth is `g_i ∈ {0, 1}`. The loss combines all pixels.

## Cross-entropy

:::formula Binary cross-entropy
L_{BCE} = -\frac{1}{N}\sum_i \big[g_i \log p_i + (1-g_i)\log(1-p_i)\big]
:::

Each pixel counts equally. With **1% foreground**, a network that predicts `p = 0.01` everywhere has a small loss, because 99% of the pixels are easy. Gradients from the few foreground pixels are swamped.

```python run title="Cross-entropy is satisfied by predicting background" level=easy shared
import numpy as np

H = W = 100
g = np.zeros((H, W)); g[45:55, 45:55] = 1                        # a 10 x 10 object: 1% of the pixels
eps = 1e-7

def bce(p, g, w_pos=1.0):
    p = np.clip(p, eps, 1 - eps)
    return float(-(w_pos * g * np.log(p) + (1 - g) * np.log(1 - p)).mean())

def dice_loss(p, g, smooth=1.0):
    return float(1 - (2 * (p * g).sum() + smooth) / (p.sum() + g.sum() + smooth))

all_bg = np.full((H, W), 0.001)                                    # "there is nothing here"
good = np.where(g > 0, 0.9, 0.001)                                 # a decent prediction
print(f"{'':28s} BCE     Dice loss")
print(f"{'predict all background':28s} {bce(all_bg, g):.4f}  {dice_loss(all_bg, g):.4f}")
print(f"{'a decent segmentation':28s} {bce(good, g):.4f}  {dice_loss(good, g):.4f}")
print("BCE is tiny for BOTH (0.07 and 0.002): even the useless prediction looks 'almost solved'. Dice loss says 0.99 for the useless one and 0.10 for the good one.")
```

## Weighted cross-entropy

Give the foreground a larger weight `w_pos` (often `(1 − freq)/freq`, or a smaller number). It rebalances the gradient. It is simple, but the best weight is a hyper-parameter, and a large weight can raise false positives.

For the **separation of touching objects**, U-Net's authors used a **per-pixel weight map** that is high on the thin background gaps between cells (computed from the distance to the two nearest objects), so the network learns the borders.

## Dice loss (soft Dice)

Optimise the **overlap measure** directly. With probabilities instead of hard masks (so it is differentiable):

:::formula Soft Dice loss
L_{Dice} = 1 - \frac{2\sum_i p_i g_i + \varepsilon}{\sum_i p_i + \sum_i g_i + \varepsilon}
:::

Since the numerator and denominator are sums over **all** pixels, the loss is about the **ratio of foreground overlap**, independent of the number of background pixels. It handles imbalance naturally. Weaknesses: noisy, unstable gradients early on (especially for tiny objects, or when the mask is empty), and it can produce over-confident probabilities. The **soft IoU (Jaccard) loss** is similar: `1 − Σpg / (Σp + Σg − Σpg)`. The **`ε` smoothing** avoids dividing by zero for empty masks.

## Focal loss

Down-weight pixels that are already well classified (as in RetinaNet): `FL = −(1 − p_t)^γ log p_t`. It focuses on hard pixels (boundaries, small structures). Often combined with Dice.

## Tversky and Focal Tversky

**Tversky** generalises Dice with separate weights for **false positives** and **false negatives**:

:::formula Tversky index
TI = \frac{TP}{TP + \alpha\,FP + \beta\,FN}
:::

With `α = β = 0.5` it equals Dice. For a medical task where **missing** a lesion is worse than a false alarm, use `β > α` (for example `α = 0.3, β = 0.7`) to favour recall. **Focal Tversky** raises `(1 − TI)` to a power for extra focus on hard cases.

```python run title="Compare the losses on the same predictions" level=intermediate shared
def tversky_loss(p, g, a=0.3, b=0.7, smooth=1.0):
    tp = (p * g).sum(); fp = (p * (1 - g)).sum(); fn = ((1 - p) * g).sum()
    return float(1 - (tp + smooth) / (tp + a * fp + b * fn + smooth))

def focal(p, g, gamma=2.0, alpha=0.25):
    p = np.clip(p, eps, 1 - eps); pt = np.where(g > 0, p, 1 - p); at = np.where(g > 0, alpha, 1 - alpha)
    return float((-at * (1 - pt) ** gamma * np.log(pt)).mean())

cases = {
    "perfect":                      np.where(g > 0, 0.99, 0.001),
    "misses half the object":       np.where(g > 0, np.where(np.arange(W)[None, :] < 50, 0.9, 0.05), 0.001),
    "object + a big false region":  np.where(g > 0, 0.9, 0.001) + np.pad(np.full((10, 20), 0.9), ((70, 20), (60, 20))),
    "all background":               np.full((H, W), 0.001),
}
cases["object + a big false region"] = np.clip(cases["object + a big false region"], 0, 1)
print(f"{'prediction':30s} BCE     Dice    Tversky(a=.3,b=.7)  focal")
for name, p in cases.items():
    print(f"{name:30s} {bce(p, g):.4f}  {dice_loss(p, g):.4f}  {tversky_loss(p, g):.4f}             {focal(p, g):.4f}")
print("Tversky punishes the missed half (false negatives) more than the false region (false positives)")
```

## Other losses you will meet

| Loss | Idea |
|---|---|
| **Lovász-softmax** | A convex surrogate that directly optimises the IoU (Jaccard) |
| **Boundary loss, Hausdorff loss** | Penalise the distance of predicted boundary pixels from the true boundary: better for tiny structures and shape accuracy |
| **Combo / BCE + Dice** | Sum of cross-entropy (stable gradients) and Dice (overlap): the most common default |
| **Online hard example mining (OHEM)** | Average only over the hardest pixels |
| **Distance-map and level-set losses** | Regress a signed distance map instead of a mask |
| **Lovász hinge, active contour loss** | Shape and boundary priors |

## A practical recipe

1. Start with **BCE + Dice** (binary or multi-label) or **CE + Dice** (multi-class, per class).
2. If it predicts nothing: add **positive weighting** or **focal**, oversample foreground crops.
3. If precision is poor (many false regions): lower recall weighting (Tversky with `α > β`), add hard-negative images.
4. If boundaries are poor: add a **boundary term**, a higher output resolution, or a refinement step.
5. Always **monitor the metric you care about** (per-class IoU/Dice, object-level recall) next to the loss; they do not move together.
6. Make the loss **ignore void pixels** (`ignore_index`), and handle **empty masks** (Dice with smoothing).

## Check the gradient of soft Dice

```python local check title="Soft Dice loss and its gradient in PyTorch"
import torch

def soft_dice(logits, g, eps=1.0):
    p = torch.sigmoid(logits)
    return 1 - (2 * (p * g).sum() + eps) / (p.sum() + g.sum() + eps)

torch.manual_seed(0)
g = torch.zeros(1, 1, 16, 16); g[..., 6:10, 6:10] = 1
logits = torch.zeros(1, 1, 16, 16, requires_grad=True)               # an uncertain start (p = 0.5 everywhere)
loss = soft_dice(logits, g)
loss.backward()
inside, outside = logits.grad[..., 6:10, 6:10].mean().item(), logits.grad[..., :4, :4].mean().item()
print(f"initial Dice loss {loss.item():.3f}")
print(f"mean gradient on the object pixels: {inside:+.5f}   on far background pixels: {outside:+.5f}")
assert inside < 0 < outside                                           # descent raises logits on the object and lowers them on the background
# one gradient step improves the loss
with torch.no_grad():
    new_logits = logits - 5.0 * logits.grad
print("loss after one step:", round(soft_dice(new_logits, g).item(), 3))
```

The gradient pushes the object logits **up** (negative gradient) and the background logits **down**, as it should.

:::interview Questions you may get
- "Why does cross-entropy struggle with small objects?" Foreground pixels are a tiny fraction; predicting background everywhere already gives a low average loss.
- "Write the Dice loss and say when it is better." `1 − 2Σpg/(Σp + Σg)`; it is insensitive to the amount of background, so it suits imbalanced segmentation.
- "What are the drawbacks of Dice loss?" Unstable gradients with tiny or empty targets, and it can produce over-confident outputs; combine it with cross-entropy.
- "Tversky versus Dice?" Tversky weights false positives and false negatives separately, so you can favour recall.
- "How would you segment touching cells?" Weighted loss for borders, instance-aware targets (borders or distance maps), or an instance segmentation model.
- "Which loss would you start with?" BCE (or CE) + Dice, then adapt to what the errors show.
:::

```quiz
? What does soft Dice loss compute?
+ One minus a differentiable overlap ratio between predicted probabilities and the mask
- The mean squared error
- The number of wrong pixels
> It optimises the overlap measure directly.

? You care more about missing a lesion than about a false alarm. Which Tversky weights?
+ A larger weight on false negatives (beta greater than alpha)
- Equal weights
- A larger weight on false positives
> That increases recall.

? Why add cross-entropy to Dice?
+ Cross-entropy gives stable, informative gradients while Dice optimises overlap
- It makes training slower on purpose
- Dice cannot be used alone with images
> The combination is a robust default.

? What is the purpose of the smoothing term in Dice loss?
+ Avoid division by zero and instability when masks are empty
- Increase the resolution
- Remove the background
> Empty target masks would otherwise give 0/0.
```

:::problem Your segmentation Dice is 0.85 but the area of the segmented region is systematically 15% too small. Which loss or post-processing changes do you consider? {level=hard tags="loss,bias,calibration"}
Think about the threshold and false-negative weighting.

:::solution Model answer
A systematic underestimate means predicted probabilities at the boundary are lower than 0.5 or the model is biased towards background. Options: tune the threshold on validation data to match areas (a threshold below 0.5), weight false negatives more (Tversky with beta > alpha, or a positive weight), use a boundary-aware loss, check for annotation bias (labellers drawing inside the edge) and calibrate; apply a small dilation as a post-process (and verify the bias disappears on held-out data); and evaluate the quantity you care about (area error, boundary error), not only Dice.
:::
:::

:::keypoints
- Cross-entropy ignores imbalance: tiny objects can be "solved" by predicting background; weighted CE, focal loss, Dice and Tversky address it.
- Soft Dice optimises overlap directly (`1 − 2Σpg/(Σp+Σg)`); combine with BCE for stable gradients; use smoothing for empty masks.
- Tversky trades false positives against false negatives; boundary and Lovász losses refine shape and IoU.
- Start with BCE/CE + Dice, adapt to the errors, and monitor the metric you care about; ignore void pixels.
:::

:::resources
- [Jadon: A survey of loss functions for semantic segmentation](https://arxiv.org/abs/2006.14822) — Dice, focal, Tversky, boundary losses compared.
- [Berman et al.: The Lovász-Softmax loss](https://arxiv.org/abs/1705.08790) — optimising IoU directly.
- [Salehi et al.: Tversky loss function for image segmentation](https://arxiv.org/abs/1706.05721) — the Tversky loss.
:::
