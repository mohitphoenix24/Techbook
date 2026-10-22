---
title: The Vision Transformer (ViT)
level: advanced
time: 55
summary: Cut the image into patches, treat patches as words, and run a transformer. Patch embedding, position embeddings, the class token, self-attention explained with a small NumPy example, what ViT needs (data), and how it compares with a CNN.
---

For a decade, CNNs were vision. In 2020, **An Image is Worth 16×16 Words** showed that a plain **transformer**, the model behind language AI, can match or beat the best CNNs when it gets enough data. This lesson builds ViT step by step.

## The big idea in one line

> **Cut the image into small square patches. Turn each patch into a vector (a "token"). Feed the tokens to a standard transformer.**

A sentence is a list of word tokens. An image becomes a list of **patch tokens**. After that, it is the same machine.

:::flow ViT forward pass
Patchify | A 224×224 image is cut into 16×16 patches: 14 × 14 = 196 patches of 16·16·3 = 768 numbers each.
Linear embedding | Each flattened patch is multiplied by one learned matrix to get a token of size D (768 for ViT-Base). This is exactly a convolution with kernel 16 and stride 16.
Add class token | A learned extra token `[CLS]` is put in front. It will collect a summary of the image.
Add position embeddings | A learned vector per position is added, so the model knows where each patch came from. (Without it, the patches would be an unordered bag.)
Transformer encoder | L identical blocks: LayerNorm → multi-head self-attention → residual; LayerNorm → MLP → residual. (12 blocks for ViT-Base.)
Head | The final `[CLS]` token goes through a linear layer to give the class scores.
:::

## Step 1: patches (runnable)

```python run title="Cut an image into patches with reshape" level=intermediate shared
import numpy as np
import cv2
import cvlab

img = cv2.resize(cvlab.image("astronaut"), (224, 224))           # (224, 224, 3)
P = 16                                                           # patch size
H, W, C = img.shape
patches = img.reshape(H // P, P, W // P, P, C).transpose(0, 2, 1, 3, 4).reshape(-1, P * P * C)
print("image:", img.shape, "-> patches:", patches.shape, "  (196 patches, each 16*16*3 = 768 numbers)")

# the same thing seen as a picture: pull the patches apart with a gap
gap = 4
grid = np.full(((P + gap) * 14, (P + gap) * 14, 3), 255, np.uint8)
for i, p in enumerate(patches.reshape(-1, P, P, C)):
    r, c = divmod(i, 14)
    grid[r * (P + gap): r * (P + gap) + P, c * (P + gap): c * (P + gap) + P] = p
cvlab.show(img, "Image", grid, "196 patches pulled apart")
print("tokens needed vs image size: a 448x448 image gives", (448 // P) ** 2, "tokens (4x more), and attention cost grows with the SQUARE of tokens")
```

Smaller patches mean **more tokens**: better detail but much slower. ViT-B/16 means "Base size, 16×16 patches". ViT-L/14 means "Large, 14×14 patches".

## Step 2: self-attention in plain words

Each token asks: *"Which other tokens are useful for me?"*

1. Every token makes three vectors: a **query** (what I look for), a **key** (what I offer) and a **value** (what I carry).
2. Token *i* compares its query with the key of every token *j* (a dot product). A high score means "relevant".
3. The scores go through a **softmax** to become weights that add up to 1.
4. The output of token *i* is the **weighted sum of the values**.

:::formula Scaled dot-product attention
`Attention(Q, K, V) = softmax(Q Kᵀ / √d) V`   where `d` is the key size. Dividing by `√d` stops the scores from becoming huge, which would make the softmax too sharp.
:::

**Multi-head** attention runs this several times in parallel with smaller vectors (12 heads in ViT-B), so different heads can look for different things (edges, same colour, nearby, same object), then joins the results.

```python run title="Self-attention from scratch on a tiny image" level=advanced shared
import numpy as np

rng = np.random.default_rng(0)
tokens, d = 6, 8                                   # 6 patch tokens, each a vector of 8 numbers
X = rng.normal(0, 1, (tokens, d))
X[4] = X[1] + rng.normal(0, 0.1, d)                # make token 4 similar to token 1 (like two patches of the same object)

Wq, Wk, Wv = (rng.normal(0, 0.5, (d, d)) for _ in range(3))
Q, K, V = X @ Wq, X @ Wk, X @ Wv
scores = Q @ K.T / np.sqrt(d)
weights = np.exp(scores - scores.max(1, keepdims=True)); weights /= weights.sum(1, keepdims=True)
out = weights @ V

np.set_printoptions(precision=2, suppress=True)
print("attention weights (row i = where token i looks; each row sums to 1):")
print(weights)
print("row sums:", weights.sum(1))
print("tokens 1 and 4 are similar, so their attention rows are nearly the same (max difference %.2f); token 0 is different (%.2f)" % (np.abs(weights[1] - weights[4]).max(), np.abs(weights[1] - weights[0]).max()))
print("output shape:", out.shape, "(same number of tokens, each now mixed with information from the others)")
print("cost: the weights matrix is tokens x tokens =", tokens * tokens, "numbers; for 196 tokens it is", 196 * 196, "and for 784 tokens", 784 * 784)
```

The weights matrix is `N × N` for `N` tokens, so the cost grows with **N²**. This is why high-resolution ViTs are expensive (Swin, in the next lesson, fixes it).

## Step 3: ViT in PyTorch (checked here with a tiny model)

```python local check title="A small Vision Transformer you can read in one screen"
import torch
from torch import nn

class Block(nn.Module):
    def __init__(self, d, heads, mlp=4):
        super().__init__()
        self.n1, self.n2 = nn.LayerNorm(d), nn.LayerNorm(d)
        self.attn = nn.MultiheadAttention(d, heads, batch_first=True)
        self.mlp = nn.Sequential(nn.Linear(d, mlp * d), nn.GELU(), nn.Linear(mlp * d, d))
    def forward(self, x):
        h = self.n1(x)
        x = x + self.attn(h, h, h, need_weights=False)[0]       # residual around attention
        return x + self.mlp(self.n2(x))                         # residual around the MLP

class TinyViT(nn.Module):
    def __init__(self, img=32, patch=8, d=64, depth=4, heads=4, classes=10):
        super().__init__()
        n = (img // patch) ** 2
        self.patchify = nn.Conv2d(3, d, kernel_size=patch, stride=patch)      # patch embedding = strided convolution
        self.cls = nn.Parameter(torch.zeros(1, 1, d))
        self.pos = nn.Parameter(torch.randn(1, n + 1, d) * 0.02)
        self.blocks = nn.Sequential(*[Block(d, heads) for _ in range(depth)])
        self.norm, self.head = nn.LayerNorm(d), nn.Linear(d, classes)
    def forward(self, x):
        x = self.patchify(x).flatten(2).transpose(1, 2)                       # (B, N, d)
        x = torch.cat([self.cls.expand(len(x), -1, -1), x], 1) + self.pos
        x = self.norm(self.blocks(x))
        return self.head(x[:, 0])                                             # classify from the class token

torch.manual_seed(0)
m = TinyViT()
x = torch.randn(2, 3, 32, 32)
print("output:", tuple(m(x).shape), " parameters:", sum(p.numel() for p in m.parameters()))
# the patch embedding really is a linear layer on flattened patches
patch = x[:, :, :8, :8].reshape(2, -1)                                        # first 8x8 patch, flattened (C*P*P)
w = m.patchify.weight.reshape(64, -1)
print("conv == linear on the flattened patch:", torch.allclose(m.patchify(x)[:, :, 0, 0], patch @ w.T + m.patchify.bias, atol=1e-5))
# permutation test: without position embeddings the model would not care about patch order; with them it does
m.eval()
with torch.no_grad():
    t = m.patchify(x).flatten(2).transpose(1, 2)
    perm = t[:, torch.randperm(16)]
    base = m.blocks(torch.cat([m.cls.expand(2, -1, -1), t], 1) + m.pos)[:, 0]
    shuf = m.blocks(torch.cat([m.cls.expand(2, -1, -1), perm], 1) + m.pos)[:, 0]
print("shuffled patches change the output (positions matter):", not torch.allclose(base, shuf, atol=1e-4))
```

## What ViT needs (and why)

A CNN has **built-in assumptions** (an *inductive bias*): neighbours matter (locality) and the same detector works everywhere (translation equivariance). ViT has almost none; it must **learn** them from data.

| | CNN | ViT |
|---|---|---|
| Locality | Built in (small kernels) | Learned (attention can look anywhere from layer 1) |
| Translation equivariance | Built in (weight sharing) | Approximate, learned |
| Small data (≈ 10 k–1 M images) | Good | Weak without tricks |
| Huge data (≥ 14 M–3 B images) or self-supervision | Good | Better, scales further |
| Cost | Linear in pixels | Quadratic in tokens |
| Global context | Needs many layers | From the very first layer |
| Fine-tuning at other resolutions | Easy | Needs position-embedding interpolation |

The ViT paper: trained on ImageNet-1k alone, ViT lost to ResNets; pre-trained on JFT-300M (300 million images), it won. **DeiT** (next lesson) later showed that good augmentation and distillation make ViT work on ImageNet-1k.

## Details that interviewers like

- **Position embeddings** are 1-D learned vectors in the paper. For a new resolution, reshape them to a 2-D grid and **interpolate** (bicubic) to the new grid. Newer models use **relative** or **rotary (RoPE)** positions.
- **Class token vs average pooling**: global average pooling of the patch tokens works just as well; many recent models use it, or use attention pooling.
- **Pre-norm** (LayerNorm before attention/MLP) trains more stably than the original post-norm.
- **Registers**: ViTs trained at scale develop a few "garbage" tokens with high norm that store global information and create artefacts in attention maps. Adding a few extra **register tokens** removes these (Darcet et al., 2023).
- **Attention is not always explanation**: attention maps are a rough guide to what the model uses, not a proof. Use gradient-based methods (Grad-CAM variants, attention rollout) with care.
- **FLOPs**: attention costs `O(N² d)`, the MLP costs `O(N d²)`. At 224 px and D = 768, the MLP dominates; at high resolution attention does.
- **Efficient attention**: FlashAttention (exact, memory-efficient kernel), windowed attention (Swin), token pruning/merging (ToMe), linear attention.
- **Hybrid models**: use a small CNN stem to make tokens (early convolutions make ViT training more stable and faster).

:::interview Questions you may get
- "Explain how a Vision Transformer works." Patches → linear embedding → add class token and position embeddings → L transformer blocks (attention + MLP with residuals) → classify from the class token.
- "Why does ViT need more data than a CNN?" It lacks locality and translation-equivariance priors, so it must learn them; with little data, a CNN's priors win.
- "What is the time complexity of self-attention and why does it matter in vision?" `O(N²)` in the number of tokens, and `N` grows with the square of image side; high resolution becomes expensive.
- "Why do we need position embeddings?" Attention is permutation-invariant; without them the model sees a bag of patches.
- "How do you run a ViT at a different resolution than it was trained on?" Interpolate the position embeddings (and optionally fine-tune).
- "Is the patch embedding a convolution?" Yes, a conv with kernel = stride = patch size.
:::

```quiz
? A 224×224 image with 16×16 patches gives how many tokens (without the class token)?
+ 196
- 256
- 14
> 14 × 14 = 196.

? What happens to attention cost when you double the image side (same patch size)?
+ Roughly 16× for the attention matrix (4× tokens, squared)
- 2×
- It stays the same
> Tokens grow 4×, and the attention matrix is tokens × tokens.

? What is the role of position embeddings?
+ They tell the model where each patch came from, because attention itself ignores order
- They compress the image
- They normalise colours
> Without them, shuffled patches look identical.

? Why did ViT beat ResNets only after pre-training on very large datasets?
+ It has weak built-in priors and needs lots of data to learn them
- It has fewer parameters
- It cannot use augmentation
> Inductive bias versus data.
```

:::problem You must classify 5,000 labelled factory images (10 classes) and a colleague suggests training a ViT-B from scratch. What do you recommend and why? {level=easy tags="vit,transfer-learning"}
Think about data size and priors.

:::solution Model answer
Do not train from scratch: 5,000 images are far too few for a ViT, which lacks locality priors. Start from a model pre-trained on a large dataset (ImageNet-21k, or a self-supervised model such as DINOv2), then fine-tune: first a linear probe, then the whole network (or LoRA) with a small learning rate, layer-wise LR decay, and strong augmentation. A small CNN or ConvNeXt/EfficientNet fine-tune is also a good, cheaper baseline. Compare on a validation set and pick the cheapest model that meets the target.
:::
:::

:::keypoints
- ViT = patches → linear embedding → class token + position embeddings → transformer encoder (attention + MLP, residuals, LayerNorm) → head.
- Self-attention: softmax(QKᵀ/√d)V; cost grows with the square of the number of tokens.
- ViT has weak priors, so it needs large-scale pre-training (or self-supervision/distillation); CNNs win on small data.
- Interpolate position embeddings for new resolutions; registers, FlashAttention and windowed attention are common fixes.
:::

:::resources
- [Dosovitskiy et al.: An Image is Worth 16x16 Words (ViT)](https://arxiv.org/abs/2010.11929) — the original paper.
- [Vaswani et al.: Attention Is All You Need](https://arxiv.org/abs/1706.03762) — the transformer.
- [Jay Alammar: The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) — a friendly walk-through of attention.
:::
