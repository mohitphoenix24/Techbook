---
title: Using and Adapting Foundation Models
level: advanced
time: 50
summary: How to actually use big pre-trained vision models. Frozen features and linear probes, k-NN and few-shot, fine-tuning with layer-wise learning rates, parameter-efficient methods (LoRA, adapters, prompt tuning), distillation to a small model, and a decision guide.
---

You will almost never train a vision model from scratch. The skill is **choosing how much to adapt** a pre-trained model. From cheapest to most powerful:

| Level | What you train | Data needed | Typical use |
|---|---|---|---|
| **Zero-shot** | Nothing | 0 | CLIP prompts, SAM, open-vocabulary detectors |
| **Frozen features + k-NN** | Nothing (just an index) | a few per class | Retrieval, prototyping, duplicate search |
| **Linear probe** | One linear layer | 10s–1000s | Quick strong baseline; tests feature quality |
| **Light adapters / LoRA** | 0.1–5% of weights | 100s–10,000s | Domain shift, limited GPU |
| **Full fine-tuning** | Everything | 1,000s–millions | Best accuracy when data is enough |
| **Distillation** | A small student | Any unlabelled images | Deployment on edge hardware |

## 1. Frozen features and a linear probe

Run the images through the backbone **once**, save the feature vectors, and train a logistic regression on them. It takes minutes, needs no GPU for the second step, and it is the baseline you must beat before attempting anything heavier. Below, a classical feature (HOG) plays the role of the "frozen backbone" so the demo runs in your browser: the same code works with DINOv2 or CLIP embeddings.

```python run title="Linear probe on frozen features vs raw pixels, with few labels" level=intermediate
import numpy as np
import cv2
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from skimage.feature import hog

X, y = load_digits(return_X_y=True)
rng = np.random.default_rng(0)

def make(im):                                                      # make the task realistic: upscale, shift by up to 2 pixels, add noise
    im = cv2.resize(im.astype(np.float32) / 16, (16, 16), interpolation=cv2.INTER_CUBIC)
    shift = np.float32([[1, 0, rng.integers(-2, 3)], [0, 1, rng.integers(-2, 3)]])
    return cv2.warpAffine(im, shift, (16, 16)) + rng.normal(0, 0.1, im.shape)

images = np.array([make(im) for im in X.reshape(-1, 8, 8)])
feats = np.array([hog(im, orientations=9, pixels_per_cell=(4, 4), cells_per_block=(2, 2)) for im in images])    # stand-in for a frozen backbone
Xtr, Xte, Ftr, Fte, ytr, yte = train_test_split(images.reshape(len(images), -1), feats, y, test_size=0.4, random_state=0, stratify=y)

print("labels per class | raw pixels | frozen features + linear probe")
for k in (1, 3, 10, 30):
    idx = np.concatenate([rng.choice(np.where(ytr == c)[0], k, replace=False) for c in range(10)])
    a = LogisticRegression(max_iter=3000).fit(Xtr[idx], ytr[idx]).score(Xte, yte)
    b = LogisticRegression(max_iter=3000).fit(Ftr[idx], ytr[idx]).score(Fte, yte)
    print(f"{k:>16} | {a:.3f}      | {b:.3f}")
print("features that ignore small shifts make every label count more; a real pre-trained backbone does this far better than HOG")
```

**k-NN** on normalised features needs no training at all and is a good sanity check of feature quality (and a good retrieval tool).

## 2. Full fine-tuning: the usual recipe

- Start from the pre-trained weights, replace the head, and train with a **small learning rate** (about 10–100× smaller than from scratch: 1e-5 to 1e-4 with AdamW).
- **Warm-up** then cosine decay; **weight decay** 0.05; strong **augmentation**.
- **Layer-wise learning-rate decay (LLRD)**: lower layers (general features) get a smaller LR than upper layers; for a 12-layer ViT multiply by 0.65–0.85 per layer going down.
- **Two-stage (LP-FT)**: first train only the head (linear probe), then unfreeze everything. Avoids distorting good features with a randomly initialised head, and gives better out-of-distribution robustness.
- **WiSE-FT**: average the weights of the pre-trained and the fine-tuned model to keep robustness.
- **Resolution**: fine-tune at a higher resolution if your objects are small (interpolate position embeddings).
- Watch for **catastrophic forgetting** if you need the original abilities (zero-shot) as well.

## 3. Parameter-efficient fine-tuning (PEFT)

Train a tiny number of new parameters and keep the big model frozen: cheaper memory, small files per task, less forgetting.

- **LoRA (low-rank adaptation)**: for a weight matrix `W` (d × d), learn the **update** as a product of two thin matrices: `W' = W + (α/r)·B·A` with `A` (r × d) and `B` (d × r), rank `r` of 4–64. Only `A` and `B` are trained. After training, you can **merge** the update into `W`: zero extra inference cost.
- **Adapters**: small bottleneck MLPs inserted into each block.
- **Prompt / visual prompt tuning (VPT)**: learn a few extra input tokens.
- **BitFit**: train only bias terms. **Norm tuning**: only LayerNorm parameters.
- **QLoRA**: LoRA on a 4-bit quantised base for very large models.

```python local check title="LoRA from scratch: few trainable weights, and the update merges back"
import torch
from torch import nn

class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, r=4, alpha=8):
        super().__init__()
        self.base, self.scale = base, alpha / r
        for p in self.base.parameters():
            p.requires_grad = False                                         # the pre-trained weights stay frozen
        self.A = nn.Parameter(torch.randn(r, base.in_features) * 0.01)      # (r x d_in)
        self.B = nn.Parameter(torch.zeros(base.out_features, r))            # (d_out x r), zeros: the update starts as exactly zero
    def forward(self, x):
        return self.base(x) + self.scale * (x @ self.A.T @ self.B.T)
    def merge(self):
        with torch.no_grad():
            self.base.weight += self.scale * self.B @ self.A
        return self.base

torch.manual_seed(0)
base = nn.Linear(768, 768)
lora = LoRALinear(base, r=8, alpha=16)
x = torch.randn(4, 768)
print("output unchanged at initialisation:", torch.allclose(lora(x), base(x), atol=1e-6))
full = 768 * 768 + 768
tr = sum(p.numel() for p in lora.parameters() if p.requires_grad)
print(f"trainable: {tr} of {full} ({tr / full:.1%}) for one 768x768 layer")

# fit a small target change with only the LoRA weights
target = nn.Linear(768, 768)
with torch.no_grad():
    target.weight.copy_(base.weight + 0.02 * (torch.randn(768, 8) @ torch.randn(8, 768)) / 8 ** 0.5); target.bias.copy_(base.bias)   # a low-rank change to learn
opt = torch.optim.Adam([lora.A, lora.B], lr=3e-3)
for step in range(400):
    xb = torch.randn(64, 768)
    loss = ((lora(xb) - target(xb)) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
print(f"loss after 400 steps: {loss.item():.2e}")
y_before = lora(x).detach()
merged = lora.merge()
print("after merging into W the output is identical:", torch.allclose(merged(x), y_before, atol=1e-4))
```

## 4. Distillation: make it small

Train a **small student** to copy the outputs (soft probabilities or features) of a big **teacher** on lots of unlabelled images. Used for deployment (a 3 M-parameter model on a camera) and to build fast variants (MobileSAM, DeiT-tiny). Loss: KL divergence between softened teacher and student outputs (`T = 2–4`) plus the normal label loss if you have labels. **Feature distillation** matches intermediate features, good for dense tasks.

## A decision guide

:::flow Choosing how to adapt
Start | Try zero-shot (CLIP/SAM/open-vocabulary) on 50 real images. Good enough? Stop here.
Few labels | Frozen embeddings (DINOv2/SigLIP) + logistic regression or k-NN. Compare against a small CNN fine-tune.
Hundreds to thousands | Fine-tune with LP-FT and LLRD, or LoRA if GPU memory is tight. Use augmentation.
Domain gap is large | Continue self-supervised pre-training on your unlabelled images, then fine-tune.
Needs to run on a device | Distil or choose a small architecture, quantise (INT8), export (ONNX/TensorRT), measure real latency.
Always | Hold out a test set from a different time/site, track per-class and failure cases, keep the baseline.
:::

:::interview Questions you may get
- "You have 200 labelled images. What do you do?" Frozen strong features + linear probe or k-NN first; then light fine-tuning; heavy augmentation; compare with the baseline using cross-validation.
- "What is LoRA and why use it?" A low-rank update `W + BA` trained while `W` is frozen: few trainable parameters, small checkpoints, no inference overhead after merging.
- "Why use a lower learning rate when fine-tuning?" To keep the pre-trained features from being destroyed; use LLRD and warm-up.
- "What is LP-FT?" Linear-probe first, then full fine-tune: better features retained and better OOD robustness.
- "What is knowledge distillation?" Train a small model to imitate a big model's soft predictions or features.
:::

```quiz
? You have 30 labelled images per class and a strong frozen backbone. What is the best first experiment?
+ A linear probe or k-NN on frozen embeddings
- Train a ViT from scratch
- Full fine-tuning with a high learning rate
> Cheap, strong baseline.

? In LoRA, which weights are trained?
+ Two thin matrices A and B added to the frozen weight
- All the original weights
- Only the biases
> W' = W + BA.

? Why does LP-FT help?
+ The head is already sensible when the backbone is unfrozen, so features are not distorted
- It trains faster per step
- It needs no labels
> Avoids feature distortion.

? What does distillation produce?
+ A smaller student that mimics a larger teacher
- A bigger model
- A new dataset
> Used for deployment.
```

:::problem A wind-turbine inspection team has 400 labelled drone crops (5 defect types, very imbalanced), 100k unlabelled crops, a single 12 GB GPU, and needs the model to run on a laptop. Propose a plan. {level=hard tags="fine-tuning,imbalance,deployment"}
Think about baseline, adaptation level, imbalance and deployment.

:::solution Model answer
Baseline: DINOv2-S/B frozen embeddings + logistic regression with class weights, cross-validated; measure per-class recall/precision (imbalance means accuracy is misleading). If not enough: LoRA or LP-FT fine-tuning of the same backbone with augmentation (flips, crops, brightness), focal loss or balanced sampling, and optionally continue self-supervised pre-training on the 100k unlabelled crops. Use the model to mine uncertain crops for labelling (active learning). For the laptop, distil to a small CNN/ViT (or pick DINOv2-S directly), export to ONNX and test the latency. Evaluate on turbines unseen during training; report per-defect recall at a chosen false-alarm rate.
:::
:::

:::keypoints
- Adaptation ladder: zero-shot → frozen features (k-NN, linear probe) → LoRA/adapters → full fine-tune → distillation for deployment. Always run the cheap baseline first.
- Fine-tune with a small LR, warm-up, layer-wise decay, augmentation; LP-FT and WiSE-FT keep robustness.
- LoRA trains `A` and `B` in `W + BA` and can be merged into `W` for free inference.
- Continue self-supervised pre-training when the domain gap is large; distil and quantise for devices; test on unseen sites.
:::

:::resources
- [Hu et al.: LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) — the method (works for vision too).
- [Oquab et al.: DINOv2](https://arxiv.org/abs/2304.07193) — frozen features for many tasks.
- [Hugging Face PEFT documentation](https://huggingface.co/docs/peft) — LoRA and adapters in practice.
:::
