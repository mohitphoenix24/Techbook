---
title: Looking Inside a CNN — Filters, Grad-CAM, Adversarial Examples
level: advanced
time: 50
summary: How to see what a network looks at. First-layer filters, feature maps, saliency, Grad-CAM written from scratch (and tested: it finds the object), shortcut learning, and adversarial examples with FGSM. Why interpretability tools are debugging tools.
---

A CNN is a black box with millions of numbers. But you can often learn a lot by asking it: *which pixels did you use? what does this filter respond to? how fragile are you?* These tools find **shortcuts, biases and bugs** before they hurt in production.

## First-layer filters

The first conv layer of an ImageNet network has 64 filters of 7 × 7 × 3. You can **draw them as small colour images**. They look like **oriented edge detectors, colour blobs and Gabor-like patterns**, the same things hand-made filters (Sobel, Gabor) detect. Deeper layers cannot be drawn directly (their filters act on abstract feature maps), but you can find the **images that excite a unit most**, or optimise an image to maximise it (**feature visualisation**, Olah et al.). The progression is striking: edges → textures → patterns → object parts → objects.

```python local check title="Draw the first-layer filters of a network"
import torch
from torchvision import models

model = models.resnet18(weights=None)                                # random weights here; with weights="DEFAULT" you see edge and colour detectors
w = model.conv1.weight.detach()                                      # shape (64, 3, 7, 7): 64 filters of 7x7 over RGB
print("first-layer filter bank:", tuple(w.shape))
f = w[0]
f = (f - f.min()) / (f.max() - f.min())                              # scale to 0..1 so it can be shown as a colour picture
print("filter 0 as a 7x7 RGB image:", tuple(f.permute(1, 2, 0).shape))

# feature maps: the output of a layer for one image (what the layer "saw")
x = torch.randn(1, 3, 224, 224)
with torch.no_grad():
    fmap = model.layer1(model.maxpool(model.relu(model.bn1(model.conv1(x)))))
print("feature maps after layer1:", tuple(fmap.shape), "= 64 channels, each a 56 x 56 picture")
assert w.shape == (64, 3, 7, 7)
```

## Saliency: which pixels matter?

The simplest explanation: the **gradient of the class score with respect to the input pixels** (a **saliency map**). Pixels with large gradient magnitude are those that, if changed slightly, would change the score most. Raw saliency is noisy; improved versions are **SmoothGrad** (average over noisy copies), **Integrated Gradients** (integrate the gradient along a path from a baseline image) and **Guided Backprop**.

## Grad-CAM: where does the network look?

**Grad-CAM** (Selvaraju et al., 2017) gives a coarse **heat map over the image** for a chosen class. Method:

:::flow Grad-CAM
1. Forward | Run the image through the network; take the feature maps A of the last convolutional layer (K maps, each h × w).
2. Gradients | Back-propagate the score of the class of interest to those maps: how much does each map matter for this class?
3. Channel weights | Average the gradient over each map: α_k = mean of ∂score/∂A_k. A big weight means that channel is important for the class.
4. Combine | CAM = ReLU( Σ_k α_k · A_k ). Keep only the positive evidence.
5. Upsample | Resize the h × w map to the image size and overlay it as a heat map.
:::

We test it on a task where we **know** where the evidence is: images are noise, and class 1 contains a bright 8 × 8 square at a random position. A small CNN learns it, then Grad-CAM should light up the square. (Runs on your computer.)

```python local check title="Grad-CAM from scratch: does it find the square?" shared
import numpy as np
import torch
import torch.nn.functional as F
from torch import nn

torch.manual_seed(0); np.random.seed(0)

def make(n):
    x = torch.rand(n, 1, 32, 32) * 0.3
    y = torch.randint(0, 2, (n,))
    centre = torch.zeros(n, 2, dtype=torch.long)
    for i in range(n):
        if y[i] == 1:                                                   # class 1: a bright 8x8 square at a random place
            r, c = np.random.randint(2, 22, 2)
            x[i, 0, r:r + 8, c:c + 8] += 0.7
            centre[i] = torch.tensor([r + 4, c + 4])
    return x, y, centre

Xtr, Ytr, _ = make(800); Xte, Yte, Cte = make(200)

class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.c1, self.c2, self.fc = nn.Conv2d(1, 8, 3, padding=1), nn.Conv2d(8, 16, 3, padding=1), nn.Linear(16, 2)
    def features(self, x):                                               # the last convolutional feature maps
        return F.relu(self.c2(F.max_pool2d(F.relu(self.c1(x)), 2)))
    def forward(self, x):
        return self.fc(self.features(x).mean((2, 3)))                    # global average pooling, then the classifier

model = Net()
opt = torch.optim.Adam(model.parameters(), 1e-2)
for step in range(300):
    idx = torch.randint(0, 800, (64,))
    loss = F.cross_entropy(model(Xtr[idx]), Ytr[idx]); opt.zero_grad(); loss.backward(); opt.step()
acc = (model(Xte).argmax(1) == Yte).float().mean().item()
print("test accuracy:", acc)

def grad_cam(x, cls):
    fmap = model.features(x)                                            # 1. feature maps of the last conv layer
    fmap.retain_grad()
    score = model.fc(fmap.mean((2, 3)))[0, cls]
    score.backward()                                                    # 2. gradient of the class score wrt the feature maps
    alpha = fmap.grad.mean((2, 3), keepdim=True)                        # 3. one weight per channel
    cam = F.relu((alpha * fmap).sum(1, keepdim=True))                   # 4. weighted sum of the maps, positive part only
    return F.interpolate(cam, size=x.shape[-2:], mode="bilinear", align_corners=False)[0, 0].detach()    # 5. upsample

hits = total = 0
for i in range(200):
    if Yte[i] == 1 and model(Xte[i:i + 1]).argmax(1).item() == 1:
        cam = grad_cam(Xte[i:i + 1], 1)
        r, c = np.unravel_index(cam.argmax().item(), cam.shape)
        total += 1
        hits += abs(r - Cte[i, 0].item()) <= 8 and abs(c - Cte[i, 1].item()) <= 8
print(f"Grad-CAM's brightest pixel is on the square in {hits} of {total} images")
assert acc > 0.95 and hits / total > 0.9
```

On this clean task Grad-CAM points at the square almost every time. On real images it shows which **regions** the decision depended on, and sometimes reveals problems: a model that "recognises" a husky by the **snow** in the background, a pneumonia classifier looking at the **hospital marker** on the X-ray, a "cow" detector keyed on **green grass**. This is **shortcut learning**: the model found an easy cue that correlates with the label in the training set but not in the real world.

**Related methods:** **CAM** (class activation maps, needs global pooling), **Grad-CAM++**, **Score-CAM**, **LayerCAM**, **attention rollout** for vision transformers, **LIME** and **SHAP** (model-agnostic perturbation methods), occlusion sensitivity (slide a grey box and watch the score). Always keep in mind that heat maps are **hints, not proofs**: they can be unstable and are sometimes insensitive to the model's weights ("sanity checks for saliency maps").

## Adversarial examples

A network that is 99% accurate can be fooled by a **tiny, invisible perturbation** crafted to maximise the loss. The simplest attack, **FGSM** (fast gradient sign method), takes one step of size `ε` in the direction of the sign of the input gradient:

:::formula FGSM
x_{\text{adv}} = x + \varepsilon\cdot \operatorname{sign}\big(\nabla_x L(x, y)\big)
:::

```python local check title="FGSM: a small perturbation breaks the classifier" shared
x = Xte.clone().requires_grad_(True)
loss = F.cross_entropy(model(x), Yte)
loss.backward()                                                          # gradient of the loss with respect to the INPUT pixels
print("perturbation size (max change per pixel) -> accuracy")
accs = {}
for eps in (0.0, 0.02, 0.05, 0.1, 0.3):
    adv = (Xte + eps * x.grad.sign())
    accs[eps] = (model(adv).argmax(1) == Yte).float().mean().item()
    print(f"{eps:5.2f} -> {accs[eps]:.2f}")
assert accs[0.0] > 0.95 and accs[0.1] < 0.7
```

A change of at most 0.05 per pixel (on a 0–1 scale; noise level in the data is already 0.3!) already drops accuracy to chance, because the perturbation is **aligned with the network's own gradient**. On natural images the same attack on an ImageNet CNN changes pixels by less than 1/255 and still flips the label.

What this means in practice:

- **Robustness is not accuracy.** Models are brittle in directions humans never notice. Real-world analogues: stickers on stop signs, adversarial patches, glasses frames that fool face recognition, printed textures.
- **Defences**: **adversarial training** (train on attacked examples; costs compute and some clean accuracy), input pre-processing (weak), certified methods for small models, ensembles, detection of out-of-distribution inputs. No defence is perfect.
- **Black-box and physical attacks** exist (transfer from a surrogate model; patches that work through a camera).
- For deployed safety-critical systems, adversarial robustness is evaluated explicitly and combined with sensor redundancy and plausibility checks.

## Other robustness and bias checks

- **Corruptions** (ImageNet-C): blur, noise, fog, JPEG: test accuracy under them.
- **Distribution shift** (ImageNet-R, ObjectNet, WILDS): renditions, new viewpoints, new sites.
- **Texture versus shape bias**: stylised images; train with stylised augmentation (Stylized-ImageNet) to shift towards shape.
- **Subgroup performance**: accuracy per skin tone, lighting, camera, site. Hidden failures live in slices.
- **Calibration and out-of-distribution detection**: does the model know when it does not know?

:::interview Questions you may get
- "How would you check what a CNN is looking at?" Saliency maps, Grad-CAM (gradient-weighted feature maps of the last conv layer), occlusion tests; compare with what a human expects.
- "Explain Grad-CAM." Weight each last-layer feature map by the average gradient of the class score, sum, apply ReLU, upsample.
- "What is shortcut learning?" The model uses an easy spurious cue (background, watermark) that correlates with the label in the training data, and fails when the cue changes.
- "What is an adversarial example and how can you create one?" A small crafted perturbation that changes the prediction; for example FGSM: `x + ε·sign(∇ₓL)`.
- "How can you defend against them?" Adversarial training, robust architectures/augmentation, input checks and ensembles; none is complete.
- "Are heat maps reliable?" They are diagnostic hints; check them with sanity tests and complement with perturbation tests.
:::

```quiz
? Grad-CAM weights each feature map by...
+ The average gradient of the class score with respect to that map
- Its brightness
- Its size
> Maps with a large positive effect on the class score get a high weight.

? What is FGSM's perturbation direction?
+ The sign of the gradient of the loss with respect to the input
- Random noise
- The sign of the weights
> It moves each pixel to increase the loss.

? A skin-cancer classifier's Grad-CAM highlights the ruler next to the lesion. What is happening?
+ Shortcut learning: the ruler correlates with malignant cases in the training data
- The model is perfect
- The heat map is always wrong
> Remove or randomise such cues and re-evaluate.

? Which first-layer filters do ImageNet CNNs typically learn?
+ Oriented edges and colour blobs
- Whole objects
- Random noise
> Just like classical edge and Gabor filters.
```

:::problem Your hospital-trained chest X-ray model drops from 94% to 78% at a second hospital. How would you use the tools in this lesson to understand why? {level=hard tags="interpretability,shortcut,medical"}
Think about what the model might rely on.

:::solution Model answer
Compute Grad-CAM (or occlusion maps) for correct and incorrect cases at both hospitals. If the heat maps concentrate on image borders, text markers, scanner tags, patient position cues or devices (tubes, pacemakers) instead of lung tissue, the model learned shortcuts that differ between sites. Test by masking those regions, or by training with such cues removed or randomised. Also compare image statistics (contrast, resolution, intensity histograms) between sites and evaluate per-subgroup accuracy. Fixes: remove or normalise the cue (crop, standardise intensity), augment to cover scanner variation, train on multi-site data, and validate externally. Document the failure as a risk.
:::
:::

:::keypoints
- First-layer filters look like edge and colour detectors; deeper features go from textures to parts to objects.
- Saliency uses input gradients; Grad-CAM weights the last conv maps by average gradient and highlights the evidence for a class. Heat maps are hints; they expose shortcut learning.
- Adversarial examples (FGSM: `x + ε·sign(∇ₓL)`) show brittleness invisible to humans; defences like adversarial training are partial.
- Robustness checks beyond accuracy: corruptions, distribution shift, subgroup slices, calibration and out-of-distribution detection.
:::

:::resources
- [Selvaraju et al.: Grad-CAM](https://arxiv.org/abs/1610.02391) — visual explanations from gradient-weighted class activation maps.
- [Goodfellow et al.: Explaining and Harnessing Adversarial Examples (FGSM)](https://arxiv.org/abs/1412.6572) — the fast gradient sign method.
- [Zeiler and Fergus: Visualizing and Understanding Convolutional Networks](https://arxiv.org/abs/1311.2901) — what each layer learns.
- [Olah et al.: Feature Visualization (Distill)](https://distill.pub/2017/feature-visualization/) — optimising images to excite units.
:::
