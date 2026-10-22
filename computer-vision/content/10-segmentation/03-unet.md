---
title: U-Net — Encoder, Decoder and Skip Connections
level: advanced
time: 55
summary: The architecture behind most medical and many industrial segmenters. The contracting path, the expanding path, concatenated skip connections, why they give sharp boundaries, training with little data, and a small U-Net you can train in a minute (tested: it reaches a Dice above 0.9).
---

In 2015, Ronneberger, Fischer and Brox needed to segment cells in microscope images with **very few labelled pictures** (30!). Their network, **U-Net**, trains well on tiny data sets and gives sharp boundaries. It became the most popular segmentation architecture in medicine, satellite imagery, industrial inspection, and as the **denoising network inside diffusion models** (Stable Diffusion's UNet).

## The shape of a U

:::flow U-Net
Encoder (contracting path) | Repeated blocks of two 3×3 convolutions, then a 2×2 max-pool. The image shrinks (for example 256→128→64→32) and the channels double (64→128→256→512). It captures context: what is in the picture.
Bottleneck | The smallest, deepest feature map: the most abstract summary.
Decoder (expanding path) | Repeated blocks: upsample 2× (transposed conv or bilinear), concatenate the encoder feature map of the same resolution (the skip connection), then two 3×3 convolutions. The image grows back, the channels halve.
Output | A 1×1 convolution gives class scores (or one logit for a binary mask) at the full resolution.
:::

```viz algo=arch title="The U-Net shape (3 levels)" dir=right
inp    Image | 1 x 64 x 64 [img] @0,0
e1     Conv block | 16 ch, 64 x 64 [conv] @1,0
e2     Conv block | 32 ch, 32 x 32 [conv] @2,1
bn     Bottleneck | 64 ch, 16 x 16 [conv] @3,2
d2     Conv block | 32 ch, 32 x 32 [conv] @4,1
d1     Conv block | 16 ch, 64 x 64 [conv] @5,0
out    1x1 conv | mask logits [mask] @6,0
--
inp -> e1
e1 -> e2 : pool
e2 -> bn : pool
bn -> d2 : upsample
d2 -> d1 : upsample
d1 -> out
e2 -> d2 : skip (concatenate)
e1 -> d1 : skip (concatenate)
```

## Why the skip connections matter

The decoder has to produce an answer at full resolution. The deep features know **what** is there but have lost **where** (exact edges). The encoder's feature maps at the same resolution still hold **fine spatial detail**. **Concatenating** them gives the decoder both: semantic context from below and precise location from the side. Without skips the boundaries are blurry; with them they are sharp.

Note the difference from ResNet: ResNet **adds** a shortcut within a block; U-Net **concatenates** features from the encoder into the decoder, across the whole network.

## A U-Net you can train

We make a toy segmentation task: noisy images containing random discs and rectangles; the target mask is where the shapes are. This runs on your computer (CPU or GPU) in about a minute.

```python local check title="Train a small U-Net and measure the Dice score"
import numpy as np
import torch
from torch import nn
import torch.nn.functional as F

torch.manual_seed(0); np.random.seed(0)
S = 64

def make_batch(n):
    x = torch.rand(n, 1, S, S) * 0.3
    y = torch.zeros(n, 1, S, S)
    yy, xx = torch.meshgrid(torch.arange(S), torch.arange(S), indexing="ij")
    for i in range(n):
        for _ in range(np.random.randint(1, 4)):
            cx, cy, r = np.random.randint(10, S - 10), np.random.randint(10, S - 10), np.random.randint(5, 11)
            m = ((xx - cx) ** 2 + (yy - cy) ** 2 <= r * r) if np.random.rand() < 0.5 else ((xx - cx).abs() <= r) & ((yy - cy).abs() <= r)
            y[i, 0][m] = 1.0; x[i, 0][m] += 0.5
    return x, y

def block(cin, cout):
    return nn.Sequential(nn.Conv2d(cin, cout, 3, padding=1), nn.BatchNorm2d(cout), nn.ReLU(), nn.Conv2d(cout, cout, 3, padding=1), nn.BatchNorm2d(cout), nn.ReLU())

class UNet(nn.Module):
    def __init__(self, c=16):
        super().__init__()
        self.e1, self.e2, self.bottleneck = block(1, c), block(c, 2 * c), block(2 * c, 4 * c)
        self.up2 = nn.ConvTranspose2d(4 * c, 2 * c, 2, stride=2); self.d2 = block(4 * c, 2 * c)        # the decoder block takes the upsampled map + the skip: 4c channels
        self.up1 = nn.ConvTranspose2d(2 * c, c, 2, stride=2);     self.d1 = block(2 * c, c)
        self.out = nn.Conv2d(c, 1, 1)
    def forward(self, x):
        e1 = self.e1(x)                                        # full resolution
        e2 = self.e2(F.max_pool2d(e1, 2))                      # half
        b = self.bottleneck(F.max_pool2d(e2, 2))               # quarter
        d2 = self.d2(torch.cat([self.up2(b), e2], dim=1))      # upsample, then CONCATENATE the skip connection
        d1 = self.d1(torch.cat([self.up1(d2), e1], dim=1))
        return self.out(d1)

device = "cuda" if torch.cuda.is_available() else "cpu"
model = UNet().to(device)
print("parameters:", sum(p.numel() for p in model.parameters()))
opt = torch.optim.Adam(model.parameters(), 3e-3)

def dice_loss(logits, y, eps=1.0):
    p = torch.sigmoid(logits)
    inter = (p * y).sum((1, 2, 3)); union = p.sum((1, 2, 3)) + y.sum((1, 2, 3))
    return 1 - ((2 * inter + eps) / (union + eps)).mean()

for step in range(250):
    x, y = make_batch(16); x, y = x.to(device), y.to(device)
    logits = model(x)
    loss = F.binary_cross_entropy_with_logits(logits, y) + dice_loss(logits, y)          # BCE + Dice: a common combination
    opt.zero_grad(); loss.backward(); opt.step()
    if step in (0, 100, 249):
        print(f"step {step:3d}: loss {loss.item():.3f}")

model.eval()
with torch.no_grad():
    x, y = make_batch(64); x, y = x.to(device), y.to(device)
    pred = (torch.sigmoid(model(x)) > 0.5).float()
inter = (pred * y).sum().item(); dice = 2 * inter / (pred.sum().item() + y.sum().item())
iou = inter / (pred.sum().item() + y.sum().item() - inter)
print(f"held-out Dice {dice:.3f}   IoU {iou:.3f}")
assert dice > 0.9
```

## Details that matter

- **Padding**: the original U-Net used unpadded ("valid") convolutions, so the output was smaller than the input and the tiles had to overlap; modern versions use **"same" padding**.
- **Skip connections by concatenation** require matching spatial sizes: use sizes divisible by `2^levels` (or pad).
- **Upsampling**: transposed convolution can leave checkerboard artefacts; **bilinear upsampling + 3×3 conv** is a safe alternative.
- **Depth and width**: 4–5 levels with 32–64 base channels is typical for 256–512 pixel images.
- **Normalisation**: BatchNorm, or **GroupNorm / InstanceNorm** when the batch is tiny (3-D medical volumes).
- **Deep supervision**: extra outputs at intermediate decoder levels.
- **Pretrained encoders**: replace the encoder with a ResNet/EfficientNet/ConvNeXt trained on ImageNet (a **"U-Net with a pretrained backbone"**), which helps a lot on small data. The `segmentation_models_pytorch` library does this in one line.

## Training with little data

U-Net's fame came from small data sets. What made it work:

- **Heavy augmentation**: flips, rotations, scaling, **elastic deformations** (smooth random warps that mimic tissue deformation), brightness/contrast. A few images become thousands of variants.
- **Weighted loss** that emphasises thin **borders between touching cells**, so they get separated.
- **Overlap-tile** inference for big images, blending the tiles.
- **Dice + cross-entropy** loss for imbalance (next lesson).

## Variants and relatives

| Model | Idea |
|---|---|
| **U-Net++** | Dense nested skip pathways: reduces the semantic gap between encoder and decoder features |
| **Attention U-Net** | Attention gates on the skips to suppress irrelevant regions |
| **ResUNet** | Residual blocks inside |
| **3-D U-Net, V-Net, nnU-Net** | Volumes (CT, MRI). **nnU-Net** automatically configures a U-Net for any medical data set and is a very strong baseline |
| **TransUNet, Swin-UNet, UNETR** | Transformer encoders in a U-shape |
| **Diffusion UNet** | The same U shape predicts the noise in diffusion models (with time and text conditioning) |

:::interview Questions you may get
- "Describe the U-Net architecture." A contracting encoder (conv blocks and pooling), a bottleneck, an expanding decoder (upsample and conv blocks), and skip connections that concatenate encoder features into the decoder at each resolution.
- "Why are skip connections useful?" They give the decoder precise spatial information lost in downsampling, producing sharp boundaries and improving gradient flow.
- "U-Net skips versus ResNet skips?" Concatenation across encoder and decoder versus addition inside a block.
- "How does U-Net work with little data?" Strong augmentation (elastic deformation), a weighted loss for borders, and the architecture's efficient use of context and detail; plus pretrained encoders.
- "What loss would you use for a small structure?" Dice (or Tversky/focal) combined with cross-entropy to handle imbalance.
:::

```quiz
? What does a U-Net skip connection do?
+ Concatenates encoder features of the same resolution into the decoder
- Adds the input to the output of one block
- Removes the bottleneck
> It recovers spatial detail lost by pooling.

? Which loss combination is common for segmentation of small objects?
+ Cross-entropy (BCE) plus Dice
- Mean squared error only
- Hinge loss
> Dice handles the foreground/background imbalance.

? Why does the decoder block in the code above take 4c channels as input?
+ The upsampled map (2c channels) is concatenated with the skip features (2c channels)
- It doubles the image size
- It adds noise
> Concatenation adds the channel counts.

? What are elastic deformations used for?
+ Augmenting the data with smooth, realistic warps, especially for medical images
- Compressing the model
- Normalising colours
> They are a key U-Net augmentation for tissue.
```

:::problem You train a U-Net for crack detection with only 40 labelled images, and it predicts empty masks (all background). What do you do? {level=medium tags="unet,imbalance,small-data"}
Think about the imbalance and the data.

:::solution Model answer
The crack pixels are a tiny fraction, so cross-entropy is satisfied by predicting background. Use a Dice/Tversky/focal term (with BCE), class weights or positive weighting, and oversample crops that contain cracks (random crops centred on cracks). Use a pretrained encoder, strong augmentation (flips, rotations, brightness, elastic), a lower threshold at inference, and check the prediction probabilities (not only the thresholded masks). Evaluate crack-class Dice/recall, and tune the threshold on validation images. Check the labels' alignment as well.
:::
:::

:::keypoints
- U-Net: contracting encoder, bottleneck, expanding decoder, with encoder features concatenated into the decoder at each resolution.
- Skips supply fine spatial detail; the encoder supplies context; the result is sharp masks, even from few training images.
- Use same padding, bilinear or transposed upsampling, BatchNorm/GroupNorm, a pretrained encoder, heavy augmentation (elastic), and Dice + BCE.
- Variants: U-Net++, Attention U-Net, nnU-Net, transformer U-Nets; diffusion models use a conditioned U-Net.
:::

:::resources
- [Ronneberger et al.: U-Net](https://arxiv.org/abs/1505.04597) — the original paper.
- [Isensee et al.: nnU-Net](https://arxiv.org/abs/1809.10486) — self-configuring segmentation.
- [segmentation_models_pytorch](https://github.com/qubvel-org/segmentation_models.pytorch) — U-Nets with pretrained encoders.
:::
