---
title: Regularisation and Data Augmentation
level: intermediate
time: 45
summary: How to stop a network from memorising. Weight decay, dropout, label smoothing, early stopping, and above all data augmentation: flips, crops, colour jitter, cutout, mixup, CutMix, RandAugment and test-time augmentation, with pictures.
---

Deep networks have millions of parameters and can memorise a small data set perfectly, then fail on new images. **Regularisation** is everything that fights this. The most effective weapon in vision is **data augmentation**: showing the network many realistic variations of each training image.

## The regularisation toolbox

| Method | Idea |
|---|---|
| **Weight decay (L2)** | Penalise large weights; keeps the function smooth. Typical 1e-4 to 5e-2 |
| **Dropout** | Randomly drop units in training; discourages co-dependence |
| **Early stopping** | Stop when validation performance stops improving |
| **Label smoothing** | Train on soft targets (0.9 / 0.1/(C−1)) instead of hard 0/1, to avoid over-confidence |
| **Data augmentation** | Create new training examples by label-preserving transformations |
| **Stochastic depth, DropPath** | Randomly skip whole residual blocks in training |
| **Ensembles, EMA of weights** | Average many models or the weights over time |
| **Smaller model / more data / pretraining** | Often the most effective of all |

## Data augmentation: the main idea

If a cat is still a cat when mirrored, slightly rotated, a bit darker or cropped, then use these variations as **extra training data**. The network learns the **invariances** that a CNN does not have built in (rotation, scale, lighting). The rule: **choose transformations that the real world also produces, and that do not change the label.** (A horizontal flip is wrong for reading text or telling a "6" from a "9" mirrored left and right, and **vertical** flips are wrong for most street scenes but fine for satellite pictures.)

```python run title="A gallery of augmentations (OpenCV and NumPy)" level=easy shared
import cv2
import numpy as np
import cvlab

img = cvlab.image("cat")
rng = np.random.default_rng(0)
h, w = img.shape[:2]

def hflip(x): return x[:, ::-1]
def random_resized_crop(x, scale=(0.5, 1.0)):
    s = rng.uniform(*scale); ch, cw = int(h * np.sqrt(s)), int(w * np.sqrt(s))
    y0, x0 = rng.integers(0, h - ch + 1), rng.integers(0, w - cw + 1)
    return cv2.resize(x[y0:y0 + ch, x0:x0 + cw], (w, h))
def rotate(x, deg=15):
    return cv2.warpAffine(x, cv2.getRotationMatrix2D((w / 2, h / 2), rng.uniform(-deg, deg), 1.0), (w, h), borderMode=cv2.BORDER_REFLECT)
def colour_jitter(x, b=0.3, s=0.4):
    hsv = cv2.cvtColor(x, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 2] *= rng.uniform(1 - b, 1 + b); hsv[..., 1] *= rng.uniform(1 - s, 1 + s)
    return cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB)
def blur_noise(x):
    return cvlab.noisy(cv2.GaussianBlur(x, (0, 0), rng.uniform(0.5, 2)), rng.uniform(3, 12), int(rng.integers(0, 1000)))
def cutout(x, size=0.3):
    out = x.copy(); ch, cw = int(h * size), int(w * size)
    y0, x0 = rng.integers(0, h - ch), rng.integers(0, w - cw); out[y0:y0 + ch, x0:x0 + cw] = 127
    return out

augs = {"original": lambda x: x, "flip": hflip, "random crop": random_resized_crop, "rotate": rotate, "colour jitter": colour_jitter, "blur + noise": blur_noise, "cutout": cutout}
cvlab.show(*[f(img) for f in augs.values()], titles=list(augs), width=190)
print("each call gives a different result; one training image becomes thousands of variants")
```

**Photometric** changes (brightness, contrast, colour, blur, noise, JPEG) simulate camera and lighting variation. **Geometric** changes (flip, crop, scale, rotate, shear, perspective) simulate viewpoint. **Occlusion** changes (cutout, random erasing) force the network to use the whole object and not rely on one part.

## Mixing images: mixup and CutMix

- **Mixup**: blend two images and their labels: `x = λ·x₁ + (1−λ)·x₂`, `y = λ·y₁ + (1−λ)·y₂` with `λ` drawn from a Beta distribution. The network learns smoother, less over-confident boundaries.
- **CutMix**: paste a rectangle from image 2 into image 1, and mix the labels in proportion to the **area**. Keeps natural-looking local texture and gives the network localisation pressure.

```python run title="Mixup and CutMix" level=intermediate shared
a, b = cvlab.image("cat"), cvlab.image("coffee")
b = cv2.resize(b, (a.shape[1], a.shape[0]))
ya, yb = np.array([1.0, 0.0]), np.array([0.0, 1.0])                     # labels: [cat, coffee]

lam = 0.7
mix = (lam * a + (1 - lam) * b).astype(np.uint8)
y_mix = lam * ya + (1 - lam) * yb

H, W = a.shape[:2]
cut_h, cut_w = int(H * np.sqrt(1 - lam)), int(W * np.sqrt(1 - lam))      # the cut-out area is (1 - lam) of the picture
y0, x0 = 40, 60
cm = a.copy(); cm[y0:y0 + cut_h, x0:x0 + cut_w] = b[y0:y0 + cut_h, x0:x0 + cut_w]
area = cut_h * cut_w / (H * W)
y_cm = (1 - area) * ya + area * yb
print("mixup  label:", np.round(y_mix, 2))
print("cutmix label:", np.round(y_cm, 2), f" (the pasted patch covers {area * 100:.0f}% of the picture)")
cvlab.show(a, "image 1", b, "image 2", mix, "mixup (70% / 30%)", cm, "CutMix")
```

## Automatic policies

**AutoAugment**, **RandAugment** and **TrivialAugment** pick augmentation operations and strengths automatically (RandAugment: choose N random operations of magnitude M). They gave solid gains on ImageNet without hand tuning. For a new problem, start with a simple set (flip, crop, colour jitter), look at the pictures to check they make sense, and add heavier ones if you still overfit.

## Label smoothing

Hard targets (1 for the right class) push the network to infinite confidence. **Label smoothing** with ε = 0.1 uses 0.9 for the right class and spreads 0.1 over the others. It reduces over-confidence and often helps calibration slightly.

```python run title="Label smoothing changes the target, and the loss floor" level=easy
import numpy as np

C, eps = 5, 0.1
hard = np.eye(C)[2]
smooth = hard * (1 - eps) + eps / C
print("hard target  :", hard)
print("smooth target:", np.round(smooth, 3))
p = np.array([0.001, 0.001, 0.996, 0.001, 0.001])                     # a very confident prediction
print("loss with hard target  :", round(float(-(hard * np.log(p)).sum()), 3))
print("loss with smooth target:", round(float(-(smooth * np.log(p)).sum()), 3), "(too confident is now penalised)")
```

## Test-time augmentation (TTA)

At prediction time, run the model on several augmented versions of the image (the original and its flip, a few crops) and **average** the predictions. It costs more compute but often gives a small free accuracy gain. Used in competitions and in some deployed systems.

## The PyTorch way

```python local check title="torchvision transforms for training and for evaluation"
import torch
from torchvision.transforms import v2

train_tf = v2.Compose([
    v2.RandomResizedCrop(64, scale=(0.5, 1.0), antialias=True),
    v2.RandomHorizontalFlip(),
    v2.ColorJitter(0.3, 0.3, 0.3, 0.05),
    v2.ToDtype(torch.float32, scale=True),                      # uint8 0..255 -> float 0..1
    v2.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])
eval_tf = v2.Compose([                                          # NO random augmentation at evaluation time
    v2.Resize(64, antialias=True), v2.CenterCrop(64),
    v2.ToDtype(torch.float32, scale=True),
    v2.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])
img = torch.randint(0, 256, (3, 90, 120), dtype=torch.uint8)
a, b = train_tf(img), train_tf(img)
print("train transform output:", tuple(a.shape), a.dtype, " two calls differ:", not torch.allclose(a, b))
print("eval transform output :", tuple(eval_tf(img).shape), " deterministic:", torch.allclose(eval_tf(img), eval_tf(img)))

criterion = torch.nn.CrossEntropyLoss(label_smoothing=0.1)      # label smoothing is a one-argument option
print("loss on random logits:", float(criterion(torch.randn(4, 10), torch.tensor([1, 2, 3, 4]))))
cutmix = v2.CutMix(num_classes=10); mixup = v2.MixUp(num_classes=10)
x, y = cutmix(torch.rand(8, 3, 32, 32), torch.randint(0, 10, (8,)))
print("CutMix batch:", tuple(x.shape), "soft labels:", tuple(y.shape))
```

## Common mistakes

- **Augmenting the validation or test set** (use only resize/crop/normalise there).
- **Augmenting before splitting**, which leaks near-copies across the split.
- **Not augmenting the labels together with the image**: for detection and segmentation, a flip or crop must transform the **boxes and masks** too (libraries such as Albumentations and torchvision v2 do this).
- **Label-changing augmentations** (flipping a "left arrow", rotating a "6" into a "9").
- **Too strong** augmentation for a small model: it cannot fit the training data (underfit).
- **Different preprocessing** between training and inference (normalisation, resize method).

:::interview Questions you may get
- "What is data augmentation and why does it help?" Label-preserving transformations that create new training examples; teaches invariances and reduces overfitting.
- "Which augmentations would you not use for digit recognition? For aerial images?" Vertical flips and rotations by 180 for digits (6/9); vertical flips and rotations are fine for aerial images.
- "Mixup versus CutMix?" Mixup blends whole images and labels; CutMix pastes a patch and mixes labels by area, preserving local texture.
- "What is weight decay doing?" Shrinks the weights, favouring smoother functions; with AdamW it is decoupled from the gradient step.
- "Why must detection augmentations transform the boxes?" The boxes must stay aligned with the object after the geometric transform.
- "What is TTA?" Averaging predictions over several augmented copies of a test image.
:::

```quiz
? Which is NOT label-preserving for handwritten digit recognition?
- Small rotations of 10 degrees
+ A vertical flip
- Slight brightness changes
> A flipped 6 can look like a 9 or an unreadable shape.

? In CutMix, how are the labels combined?
+ In proportion to the pasted area
- Equally
- The label of the bigger image only
> The label weight follows the fraction of pixels from each image.

? Where should random augmentation be applied?
+ To the training data only
- To validation and test data too
- Only to the test data
> Evaluation needs a fixed, comparable pipeline.

? You train on 500 images with a big model. Which change is usually the most effective?
+ Stronger augmentation and pretrained weights
- A bigger model
- Removing normalisation
> They add data and prior knowledge.
```

:::problem Design an augmentation pipeline for a defect classifier on a fixed-camera production line. What would you include, and what would you avoid? {level=medium tags="augmentation,industrial"}
Think about what really varies in production.

:::solution Model answer
Include augmentations matching real variation: small brightness/contrast and colour changes (lamp ageing), small translations and rotations (part placement tolerance), slight blur and noise (focus, sensor), maybe small scale changes. Use flips only if the part is symmetric and defect semantics do not depend on orientation. Avoid transformations that change the defect meaning or never happen (large rotations if the part always sits one way; heavy colour shifts if colour is the defect cue; cutout that hides a small defect while keeping the "defect" label). Check by looking at samples; tune strength on a validation set from real production variation; generate extra defect examples carefully (copy-paste, synthetic defects) only if validated on real defects.
:::
:::

:::keypoints
- Regularisation fights memorisation: weight decay, dropout, label smoothing, early stopping, and especially data augmentation.
- Choose label-preserving, realistic transformations: photometric, geometric, occlusion; mixup and CutMix mix images and labels.
- Augment only the training data, transform boxes/masks together with the image, and keep preprocessing identical at inference.
- Test-time augmentation averages predictions over variants; pretrained weights and more data are the strongest regularisers.
:::

:::resources
- [Cubuk et al.: RandAugment](https://arxiv.org/abs/1909.13719) — automatic augmentation with two numbers.
- [Zhang et al.: mixup](https://arxiv.org/abs/1710.09412) and [Yun et al.: CutMix](https://arxiv.org/abs/1905.04899) — the two mixing methods.
- [Albumentations library](https://albumentations.ai) — fast augmentations that also transform boxes and masks.
:::
