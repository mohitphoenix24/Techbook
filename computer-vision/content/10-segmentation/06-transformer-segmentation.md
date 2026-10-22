---
title: Transformer Segmentation — SegFormer, MaskFormer, Mask2Former
level: advanced
time: 50
summary: Segmentation with attention. SegFormer's hierarchical encoder and simple all-MLP decoder, then the shift to mask classification: MaskFormer and Mask2Former predict a set of masks with class labels from object queries, unifying semantic, instance and panoptic segmentation. A mask-classification inference step in NumPy.
---

Convolutional segmenters see only local neighbourhoods at each layer. **Transformers** attend across the whole image, which helps context. Two ideas matter here: efficient **hierarchical transformer encoders** (SegFormer) and a new view of the task, **mask classification** (MaskFormer / Mask2Former).

## SegFormer (2021): a simple, strong semantic segmenter

SegFormer (Xie et al.) has two parts:

**1. A hierarchical transformer encoder (Mix Transformer, MiT).** Unlike the plain ViT (one resolution), it makes **multi-scale features** at strides 4, 8, 16 and 32, like a CNN, which dense prediction needs. Tricks:

- **Overlapping patch embedding**: a strided convolution with overlap (rather than non-overlapping patches), to keep local continuity.
- **Efficient self-attention**: attention is quadratic in the number of tokens. At stride 4 a 512 × 512 image has 16,384 tokens (268 million attention pairs per head). SegFormer **reduces the keys and values by a factor R** (a strided convolution over the token grid) so the attention cost falls by R.
- **Mix-FFN**: a 3 × 3 depthwise convolution inside the feed-forward block provides **positional information**, so **no positional encoding** is needed (which would have to be interpolated for other image sizes, hurting accuracy).

**2. A lightweight all-MLP decoder.** Take the four feature maps, project each to the same channel count with a linear layer, upsample to stride 4, concatenate, fuse with another MLP and predict classes. No heavy decoder is needed, because the transformer features already carry global context. SegFormer-B0 (3.7 M parameters) to B5 (82 M) cover mobile to server.

```python run title="Why efficient attention matters: counting attention pairs" level=easy
H = W = 512
print("stage  stride  tokens    full attention pairs   with reduction R   pairs (reduced)")
for stride, R in [(4, 8), (8, 4), (16, 2), (32, 1)]:
    tokens = (H // stride) * (W // stride)
    full = tokens * tokens
    reduced = tokens * (tokens // (R * R))                          # keys and values are spatially reduced by R in each direction
    print(f"{stride:5d} {stride:7d} {tokens:7d} {full / 1e6:18.1f} M {R:16d} {reduced / 1e6:14.1f} M")
```

```python local check title="Efficient (reduced) self-attention, SegFormer style"
import torch
from torch import nn

class EfficientAttention(nn.Module):
    def __init__(self, dim, heads, reduction):
        super().__init__()
        self.attn = nn.MultiheadAttention(dim, heads, batch_first=True)
        self.reduce = nn.Conv2d(dim, dim, kernel_size=reduction, stride=reduction) if reduction > 1 else nn.Identity()    # shrink the key/value grid
        self.norm = nn.LayerNorm(dim)
    def forward(self, x, h, w):                                              # x: (batch, h*w tokens, channels)
        b, n, c = x.shape
        kv = self.reduce(x.transpose(1, 2).reshape(b, c, h, w))              # (b, c, h/R, w/R)
        kv = self.norm(kv.flatten(2).transpose(1, 2))                        # (b, h*w / R^2, c)
        out, weights = self.attn(x, kv, kv)                                  # every token attends to the reduced set of tokens
        return out, weights

layer = EfficientAttention(dim=32, heads=2, reduction=4)
h = w = 32
x = torch.randn(1, h * w, 32)
out, weights = layer(x, h, w)
print("tokens:", h * w, " keys after reduction:", (h // 4) * (w // 4))
print("output", tuple(out.shape), " attention matrix", tuple(weights.shape), "(queries x reduced keys: 16x smaller than full attention)")
assert out.shape == x.shape and weights.shape == (1, h * w, (h // 4) * (w // 4))
```

## A new view: mask classification

Per-pixel classification (FCN, DeepLab, SegFormer) predicts a class for each pixel. Instance and panoptic segmentation do not fit this view well (they need separate masks), so they had their own architectures. **MaskFormer** (Cheng et al., 2021) asked: why not predict a **set of binary masks, each with one class label**? This is **mask classification**, and it works for **all three tasks**. Semantic segmentation is the case where each class has one mask.

**Mask2Former** (2022) is the strong, unified version. It uses DETR-style object queries:

:::flow Mask2Former
Backbone + pixel decoder | A backbone (ResNet/Swin) gives multi-scale features. A pixel decoder (multi-scale deformable attention) produces per-pixel embeddings at 1/4 resolution.
Object queries | N learned queries (100), as in DETR.
Masked-attention transformer decoder | Each query cross-attends to image features, but only inside the region of its own current mask prediction (masked attention). This focuses the attention and speeds up convergence. Several rounds across scales.
Outputs per query | A class probability (C classes + "no object") and a mask embedding. The mask is the dot product of the embedding with the per-pixel embeddings: sigmoid(E_mask · E_pixel).
Training | Hungarian matching of queries to ground-truth segments; class loss (cross-entropy) + mask loss (BCE + Dice).
Inference | Combine the N (class, mask) pairs into the semantic, instance or panoptic result.
:::

The same trained model type, with different post-processing, gives all three outputs. Mask2Former set state of the art on COCO panoptic, instance and ADE20K semantic segmentation with one architecture. **OneFormer** goes further (one model, one training, three tasks), **SAM** uses a similar prompt-to-mask decoder, and **Mask DINO** adds detection.

## Mask classification inference in NumPy

Given `N` queries with class probabilities `p(c)` and mask probabilities `m(x, y)`, the **semantic** map is the sum over queries of `p(c) · m(x, y)`, then an argmax over classes:

```python run title="From query masks and class scores to a semantic and a panoptic map" level=advanced
import cv2
import numpy as np
import cvlab

H = W = 96
rng = np.random.default_rng(0)
truth = np.zeros((H, W), np.uint8)
cv2.circle(truth, (30, 35), 22, 1, -1); cv2.rectangle(truth, (55, 50), (90, 90), 2, -1)         # class 1 and class 2 on background 0
truth = truth.astype(int)
classes = 3                                                                                       # 0 background, 1, 2

# simulate 6 queries: a disc, a rectangle, a weaker duplicate of the disc, a "background" query, and two "no object" queries
def noisy(mask): return np.clip(cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 2) + rng.normal(0, 0.08, mask.shape), 0, 1)
masks = np.stack([noisy(truth == 1), noisy(truth == 2), noisy(truth == 1) * 0.8, noisy(truth == 0), noisy(truth == 0) * 0.2, noisy(truth == 2) * 0.1])       # (N, H, W)
cls_prob = np.array([[.02, .96, .02, .0], [.03, .02, .95, .0], [.1, .55, .05, .3], [.95, .02, .02, .01], [.05, .05, .05, .85], [.05, .05, .1, .8]])   # (N, classes + "no object")

# semantic map: sum over queries of (class probability) x (mask probability), ignoring the "no object" column
semantic_scores = np.einsum("nc,nhw->chw", cls_prob[:, :classes], masks)
semantic = semantic_scores.argmax(0)
print("semantic pixel accuracy:", round(float((semantic == truth).mean()), 3), "   (shape of the einsum result:", semantic_scores.shape, ")")

# panoptic map: each pixel goes to the query with the highest (class score x mask), only for confident queries
keep = [i for i in range(len(masks)) if cls_prob[i].argmax() < classes and cls_prob[i].max() > 0.5]
print("queries kept as segments:", keep, "(query 2 is a weaker duplicate of the disc)")
score = np.stack([cls_prob[i].max() * masks[i] for i in keep]); owner = np.array(keep)[score.argmax(0)]
panoptic = np.where(score.max(0) > 0.3, owner, -1)
segments = [int(s) for s in sorted(set(panoptic.ravel()) - {-1})]
print("panoptic segments that own pixels:", segments, " sizes:", [int((panoptic == s).sum()) for s in segments], "-> the duplicate (query 2) owns none: the stronger query wins every pixel")
pal = np.array([[240, 240, 240], [220, 60, 60], [60, 120, 220], [60, 180, 90]], np.uint8)
cvlab.show(pal[truth], "Truth", pal[semantic], "Semantic map from queries", pal[np.where(panoptic < 0, 0, (panoptic % 3) + 1)], "Panoptic (colour = query)")
```

## Comparison and when to use what

| | CNN (DeepLabv3+, U-Net) | SegFormer | Mask2Former / OneFormer |
|---|---|---|---|
| Output formulation | Per-pixel classes | Per-pixel classes | Set of (mask, class) |
| Context | Local, grown by depth/dilation | Global attention (efficient) | Global + masked attention |
| Tasks | Semantic (instance via extra heads) | Semantic | Semantic, instance, panoptic |
| Speed / size | Fast and small options | Scales from B0 (3.7M) | Heavier; best accuracy |
| Data need | Works on small sets with pretrained encoders | Needs good pretraining | Large data and long schedules |

For **small medical/industrial data sets**, a U-Net with a pretrained encoder is still often the best and simplest choice. For **large benchmark-style problems**, Mask2Former/SegFormer-class models with strong pretrained backbones lead. For **zero-shot** use, see SAM next.

:::interview Questions you may get
- "What is SegFormer's key design?" A hierarchical transformer encoder (multi-scale, overlapping patches, efficient attention with reduced keys, Mix-FFN with a depthwise conv instead of positional encoding) and a simple all-MLP decoder.
- "What is mask classification?" Predicting a set of binary masks, each with a class label, instead of a class per pixel; it unifies semantic, instance and panoptic segmentation.
- "How does Mask2Former differ from DETR?" It predicts masks (dot products of query embeddings with pixel embeddings) and uses masked attention in the decoder, which speeds up convergence.
- "How do you get a semantic map from mask classification?" Sum class probability times mask probability over queries and take the argmax per pixel.
- "Why efficient attention?" Full attention is quadratic in the number of tokens, too costly at high resolution; reduce keys/values spatially or use windows or deformable attention.
:::

```quiz
? What does SegFormer's Mix-FFN replace?
+ Positional encoding (a depthwise convolution supplies position information)
- The softmax
- The backbone
> It avoids interpolating positional encodings for different image sizes.

? In Mask2Former, how is each query's mask computed?
+ Dot product of the query's mask embedding with per-pixel embeddings, then a sigmoid
- By a separate CNN per query
- By thresholding a box
> Each query yields one mask and one class distribution.

? What is the benefit of masked attention?
+ Each query attends only inside its current mask region, focusing and speeding up learning
- It removes the decoder
- It makes the image smaller
> It is a key reason for Mask2Former's faster convergence.

? Which task does mask classification NOT handle?
+ None of the three: it can do semantic, instance and panoptic with different post-processing
- Semantic segmentation
- Instance segmentation
> That is its main appeal.
```

:::problem You have 300 labelled images of a factory scene and need semantic segmentation of 6 surface types. SegFormer-B5 or a U-Net with a ResNet-34 encoder? How do you decide? {level=medium tags="segformer,unet,model-selection"}
Think about data size, speed and pretraining.

:::solution Model answer
Start with the simpler, cheaper baseline: a U-Net (or DeepLabv3+) with a pretrained encoder, which trains well on 300 images, is easy to debug and fast at inference. Also try SegFormer-B0/B2 fine-tuned from ADE20K/Cityscapes pretrained weights, which may give better context handling and robustness; compare on a validation set grouped by session using mIoU and per-class IoU, plus latency on the target hardware. Choose the model that meets the latency budget with the best IoU; B5-size models are rarely justified with 300 images unless strong pretraining transfers.
:::
:::

:::keypoints
- SegFormer: hierarchical Mix Transformer encoder (overlapped patches, reduced-key attention, Mix-FFN, no positional encoding) + a simple all-MLP decoder; sizes B0–B5.
- Mask classification (MaskFormer/Mask2Former): N queries each give a class and a mask (query embedding · pixel embeddings); Hungarian matching; masked attention; one model for semantic, instance and panoptic.
- Semantic map = Σ_queries p(class)·mask; panoptic assigns pixels to the best query.
- For small data and low latency, a U-Net/DeepLab with a pretrained encoder is still a strong choice.
:::

:::resources
- [Xie et al.: SegFormer](https://arxiv.org/abs/2105.15203) — the hierarchical transformer segmenter.
- [Cheng et al.: Per-Pixel Classification is Not All You Need (MaskFormer)](https://arxiv.org/abs/2107.06278) — mask classification.
- [Cheng et al.: Masked-attention Mask Transformer (Mask2Former)](https://arxiv.org/abs/2112.01527) — the unified model.
- [Jain et al.: OneFormer](https://arxiv.org/abs/2211.06220) — one model for all three tasks.
:::
