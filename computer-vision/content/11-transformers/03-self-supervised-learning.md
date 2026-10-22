---
title: Self-Supervised Learning (SimCLR, DINO, MAE)
level: advanced
time: 55
summary: Learning good image features without labels. Pretext tasks, contrastive learning (SimCLR, MoCo, InfoNCE), non-contrastive methods (BYOL, DINO, VICReg), masked image modelling (MAE), how to evaluate features, and a hands-on InfoNCE and masking demo.
---

Labels are expensive. Images are free. **Self-supervised learning (SSL)** makes a model learn useful features from **unlabelled** images by inventing a task whose answer comes from the data itself. The features can then be reused for classification, detection, retrieval and robotics with few labels. Modern foundation models (DINOv2, MAE, CLIP) are built this way.

## The two main families

| Family | Idea | Examples |
|---|---|---|
| **Joint-embedding (contrastive and friends)** | Two **augmented views** of the same image should give **similar** features; different images should give different features | SimCLR, MoCo, BYOL, SwAV, DINO, VICReg |
| **Masked image modelling (generative)** | Hide parts of the image and **predict the missing parts** | MAE, SimMIM, BEiT, I-JEPA |

(Older pretext tasks: predict image rotation, solve a jigsaw, colourise a grey image. Simple, but weaker.)

## Contrastive learning, simply

Take one photo. Make **two different views** by random crop, colour jitter, blur and flip. They look different but show the **same thing**. Train the network so that:

- the two views of the **same** image get **close** features (a *positive pair*);
- views of **other** images in the batch get **far** features (*negatives*).

The loss is **InfoNCE** (NT-Xent in SimCLR): for image *i*, treat the other view's similarity as the right answer in a classification over all candidates:

:::formula InfoNCE
`L_i = − log [ exp(sim(z_i, z_i⁺) / τ) / Σ_j exp(sim(z_i, z_j) / τ) ]`   with cosine similarity and temperature `τ` (about 0.1–0.5).
:::

The **augmentations are the supervision**: crop + colour jitter forces the model to ignore colour and position, and keep the object identity.

```python run title="InfoNCE loss from scratch: aligned views give low loss" level=advanced shared
import numpy as np

def info_nce(z1, z2, tau=0.2):
    """z1[i] and z2[i] are the two views of image i. Cosine similarity, softmax over all of z2."""
    z1 = z1 / np.linalg.norm(z1, axis=1, keepdims=True); z2 = z2 / np.linalg.norm(z2, axis=1, keepdims=True)
    logits = z1 @ z2.T / tau                                     # (N, N): row i should peak at column i
    logits -= logits.max(1, keepdims=True)
    logp = logits - np.log(np.exp(logits).sum(1, keepdims=True))
    return float(-np.mean(np.diag(logp))), (logits.argmax(1) == np.arange(len(z1))).mean()

rng = np.random.default_rng(0)
N, D = 64, 32
base = rng.normal(0, 1, (N, D))                                  # one "true identity" vector per image
print("noise on the second view | loss  | top-1 match accuracy")
for noise in (0.1, 0.5, 1.0, 2.0, 5.0, 50.0):
    v1 = base + rng.normal(0, 0.1, (N, D)); v2 = base + rng.normal(0, noise, (N, D))
    loss, acc = info_nce(v1, v2)
    print(f"{noise:>20} | {loss:5.2f} | {acc:.2f}")
print("random-guess loss is log(N) =", round(float(np.log(N)), 2), "; the loss climbs to about that value as the two views stop agreeing")
```

### What makes contrastive learning work

- **Large batches or a memory of negatives** (SimCLR uses batches of 4096–8192; **MoCo** keeps a queue of past features from a slowly updated **momentum encoder**).
- **A projection head** (small MLP) after the backbone: the loss is applied there; you throw it away and use the backbone's features afterwards.
- **Strong augmentation**, especially random-resized crop plus colour jitter.
- **Temperature** `τ` controls how hard the negatives are.

## Methods without negatives

If the loss only pulls two views together, the network can **collapse** (output the same vector for everything). Different tricks prevent this:

- **BYOL**: a *student* predicts the output of a *teacher* that is a slowly moving average (EMA) of the student; a predictor head and stop-gradient break the symmetry. No negatives needed.
- **DINO** (self-DIstillation with NO labels): student and teacher are ViTs; the teacher is an EMA of the student and sees **global crops**, the student also sees many **small local crops**; the teacher output is **centred and sharpened** to avoid collapse. The surprise: DINO's features contain **semantic segmentation** in the self-attention maps of the `[CLS]` token, and give excellent k-NN classification. **DINOv2** scaled this with a curated 142 M-image dataset and a ViT-g; its frozen features are strong for classification, segmentation, depth and retrieval with a simple linear head. **DINOv3** pushes this further.
- **VICReg / Barlow Twins**: explicit loss terms keep each feature dimension varied (variance) and decorrelated (covariance) so nothing collapses.
- **SwAV**: cluster assignments are the targets.

## Masked image modelling: MAE

Inspired by BERT: **hide most of the image and reconstruct it**. **Masked Autoencoder (MAE)** (He et al., 2021):

1. Split into patches; **randomly mask 75%** of them.
2. The **encoder (a ViT) sees only the visible 25%**: very cheap (about 3× faster training).
3. A small **decoder** gets the encoded tokens plus mask tokens and predicts the **pixels** of the missing patches (loss on masked patches only).
4. After pre-training, drop the decoder, use the encoder and fine-tune.

Why 75%? Images are very redundant: if only 15% is masked (as in language) the model can fill in by interpolating neighbours. A high ratio makes the task need real understanding of objects.

```python run title="Random masking like MAE (75%) and a naive reconstruction" level=intermediate shared
import numpy as np
import cv2
import cvlab

img = cv2.resize(cvlab.image("astronaut"), (224, 224))
P, ratio = 16, 0.75
n = (224 // P) ** 2
rng = np.random.default_rng(0)
keep = np.zeros(n, bool); keep[rng.permutation(n)[: int(n * (1 - ratio))]] = True        # which patches the encoder sees
print(f"patches: {n}, visible to the encoder: {keep.sum()} ({keep.mean():.0%}); attention cost drops by about {(n / keep.sum()) ** 2:.0f}x")

mask_img = img.copy()
for i in range(n):
    r, c = divmod(i, 224 // P)
    if not keep[i]:
        mask_img[r * P:(r + 1) * P, c * P:(c + 1) * P] = 127

# a naive "decoder": fill each hidden patch by interpolating from the visible ones (inpainting)
hole = np.zeros((224, 224), np.uint8)
for i in range(n):
    r, c = divmod(i, 224 // P)
    if not keep[i]:
        hole[r * P:(r + 1) * P, c * P:(c + 1) * P] = 255
naive = cv2.inpaint(mask_img, hole, 5, cv2.INPAINT_TELEA)
mse = lambda a, b: float(np.mean((a.astype(float) - b.astype(float)) ** 2))
print(f"pixel error of naive inpainting on the whole image: {mse(naive, img):.0f}  (MAE's network learns object shapes and does far better)")
cvlab.show(img, "Original", mask_img, "What the encoder sees (25%)", naive, "Naive inpainting (no learning)")
```

## Evaluating self-supervised features

Freeze the backbone and test the features:

- **Linear probe**: train only a linear classifier on top of frozen features (ImageNet top-1). Measures how *linearly separable* the features are.
- **k-NN classification** on the features (no training at all).
- **Fine-tuning** the whole model (MAE is weak on linear probe but excellent after fine-tuning; DINO is strong on both).
- **Dense tasks**: segmentation/depth with a frozen backbone, which tests local feature quality.
- **Transfer** to other datasets and low-label regimes (1% of labels).

## Contrastive vs masked, at a glance

| | Contrastive / DINO | Masked (MAE) |
|---|---|---|
| Needs hand-made augmentations | Yes, crucial | Little |
| Linear-probe quality | Strong | Weaker |
| Fine-tune quality | Strong | Very strong |
| Training cost | High (two views, big batches) | Low (encoder sees 25%) |
| Typical use | Frozen features, retrieval, k-NN | Pre-training before fine-tuning |

## SSL in practice (robotics and industry)

- You have 1 million unlabelled factory frames and 2,000 labelled: pre-train (or continue pre-training) with SSL on your domain, or just use **DINOv2 features**, then train a small head. Often beats ImageNet supervised pre-training on domain-shifted images.
- Check the augmentations: do not use colour jitter if colour is the signal (ripe vs unripe fruit); do not use flips if orientation matters (text, left/right).
- **Domain gap**: web-image models may be weaker on medical, satellite and microscopy images; domain-specific SSL helps.

:::interview Questions you may get
- "What is self-supervised learning and why does it matter?" Learning representations from unlabelled data with a task built from the data; it cuts labelling cost and gives strong general features.
- "Explain contrastive learning and the InfoNCE loss." Pull two augmented views of one image together, push other images away; InfoNCE is a softmax classification over similarities with temperature.
- "How do BYOL/DINO avoid collapse without negatives?" EMA teacher, stop-gradient, a predictor, and centring plus sharpening (DINO), or variance/covariance terms (VICReg).
- "Why does MAE mask 75% of patches and encode only the visible ones?" Images are redundant so a high ratio makes the task meaningful, and a small input makes the encoder cheap.
- "How do you evaluate representations?" Linear probe, k-NN, fine-tuning, dense-task probes and transfer.
- "Which augmentations would you avoid for a given task?" Anything that destroys the signal: colour jitter for colour-defined classes, flips for orientation-sensitive tasks.
:::

```quiz
? In contrastive learning, what are the positive pairs?
+ Two different augmented views of the same image
- Two images of the same class label
- An image and its caption only
> Labels are not used.

? What is the main job of the temperature τ in InfoNCE?
+ It scales the similarities and controls how strongly hard negatives are weighted
- It sets the learning rate
- It is the number of negatives
> Lower τ gives a sharper softmax.

? Why does MAE use a very high mask ratio (75%)?
+ Images are redundant; hiding few patches makes the task too easy
- To save disk space
- Because the decoder is large
> And the encoder only processes the visible patches.

? What does DINO's teacher network use as its weights?
+ An exponential moving average of the student
- A frozen ImageNet model
- A random network
> Student and teacher are ViTs; no labels.
```

:::problem You have 2 million unlabelled warehouse images and 1,500 labelled ones for a 6-class pallet-damage classifier. Outline your plan. {level=medium tags="ssl,transfer,labels"}
Think about pre-training, probes and what could go wrong.

:::solution Model answer
Baseline: take a strong frozen backbone (DINOv2 or similar), extract features for the labelled images, train a linear/logistic-regression head with cross-validation; check accuracy per class. Then fine-tune the backbone (low LR, layer-wise decay, augmentation) and compare. If the domain gap is big, continue self-supervised pre-training on the 2 M warehouse images (DINO/MAE style) before fine-tuning. Use active learning (the model's uncertainty and k-NN neighbours) to choose the next images to label. Choose augmentations carefully (no colour changes if damage is colour-related). Evaluate on a held-out set from different days/sites to test generalisation.
:::
:::

:::keypoints
- SSL builds features from unlabelled images: joint-embedding methods (SimCLR, MoCo, BYOL, DINO) match two views; masked modelling (MAE) reconstructs hidden patches.
- InfoNCE = softmax over similarities with temperature; collapse is avoided by negatives, EMA teachers, centring/sharpening or variance/covariance terms.
- MAE: mask 75%, encode only visible patches, light decoder, loss on masked pixels; best after fine-tuning.
- Evaluate with linear probes, k-NN, fine-tuning and dense-task probes; DINOv2 features are a strong default for frozen use.
:::

:::resources
- [Chen et al.: A Simple Framework for Contrastive Learning of Visual Representations (SimCLR)](https://arxiv.org/abs/2002.05709) — contrastive learning, clearly explained.
- [He et al.: Momentum Contrast for Unsupervised Visual Representation Learning (MoCo)](https://arxiv.org/abs/1911.05722) — the momentum encoder and queue.
- [Grill et al.: Bootstrap Your Own Latent (BYOL)](https://arxiv.org/abs/2006.07733) — no negatives.
- [Caron et al.: Emerging Properties in Self-Supervised Vision Transformers (DINO)](https://arxiv.org/abs/2104.14294) — self-distillation.
- [Oquab et al.: DINOv2](https://arxiv.org/abs/2304.07193) — frozen features at scale.
- [He et al.: Masked Autoencoders Are Scalable Vision Learners (MAE)](https://arxiv.org/abs/2111.06377) — masked image modelling.
:::
