---
title: Super-Resolution, Denoising and Restoration
level: advanced
time: 45
summary: Making images sharper and cleaner. The degradation model, interpolation versus learned super-resolution (SRCNN, ESPCN, EDSR, ESRGAN, SwinIR), the perception-distortion trade-off, denoising and deblurring, real-world and blind restoration, diffusion restorers, metrics, and the danger of hallucinated detail.
---

**Image restoration** recovers a clean, sharp image from a degraded one: **super-resolution** (SR, more pixels), **denoising**, **deblurring**, **de-JPEG**, **dehazing**, **low-light enhancement**, **inpainting**. It is used in phones, medical imaging, satellite photos, old-photo repair, video calls and, in robotics, to help detection on far, small objects.

## The degradation model

Everything starts from how the bad image was made from the good one:

`y = D( x )`   with   `D` = blur, then down-sample, then add noise, then JPEG compress.

Restoration is the **inverse problem**: given `y`, find `x`. It is **ill-posed**: many sharp images give the same blurry one, so a good method must choose a **plausible** one using knowledge of what images look like.

## Classical baselines

```python run title="Interpolation methods and what they cannot do" level=intermediate
import numpy as np
import cv2
from skimage.metrics import structural_similarity as ssim
import cvlab

hr = cvlab.image("camera", gray=True)
hr = hr[: hr.shape[0] // 4 * 4, : hr.shape[1] // 4 * 4]
h, w = hr.shape
scale = 4
lr = cv2.resize(hr, (w // scale, h // scale), interpolation=cv2.INTER_AREA)            # the camera "sees" only this much detail
print(f"high-res {w}x{h}  ->  low-res {w // scale}x{h // scale}  (x{scale} per side: 15 of every 16 target pixels were never observed)")

psnr = lambda a, b: 10 * np.log10(255 ** 2 / np.mean((a.astype(float) - b.astype(float)) ** 2))
results = {}
for name, flag in [("nearest", cv2.INTER_NEAREST), ("bilinear", cv2.INTER_LINEAR), ("bicubic", cv2.INTER_CUBIC), ("lanczos", cv2.INTER_LANCZOS4)]:
    up = cv2.resize(lr, (w, h), interpolation=flag)
    results[name] = up
    print(f"{name:<9} PSNR {psnr(up, hr):5.2f} dB   SSIM {ssim(up, hr):.3f}")
blur = cv2.GaussianBlur(results["bicubic"], (0, 0), 1.5)
sharp = cv2.addWeighted(results["bicubic"], 1.8, blur, -0.8, 0)                        # unsharp masking: add back edge contrast (no new information)
print(f"bicubic + unsharp mask   PSNR {psnr(sharp, hr):5.2f} dB   SSIM {ssim(sharp, hr):.3f}")
print("interpolation can only smooth between known pixels; learned models add plausible detail learned from other images")
crop = lambda a: cv2.resize(a[60:140, 100:180], None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST)
cvlab.show(crop(results["nearest"]), "Nearest", crop(results["bicubic"]), "Bicubic", crop(sharp), "Bicubic + sharpening", crop(hr), "True high-res")

# the real world is not a clean "area down-sample": blur, noise and JPEG make the problem harder, so models trained on clean pairs fail on real photos
degraded = cv2.GaussianBlur(hr, (0, 0), 2.0)
degraded = cv2.resize(degraded, (w // scale, h // scale), interpolation=cv2.INTER_AREA)
degraded = np.clip(degraded.astype(float) + np.random.default_rng(0).normal(0, 4, degraded.shape), 0, 255).astype(np.uint8)
ok, buf = cv2.imencode(".jpg", degraded, [cv2.IMWRITE_JPEG_QUALITY, 40]); degraded = cv2.imdecode(buf, 0)
print(f"degraded input (blur + noise + JPEG): bicubic PSNR drops to {psnr(cv2.resize(degraded, (w, h), interpolation=cv2.INTER_CUBIC), hr):.2f} dB")
```

Interpolation is a **fixed, hand-made filter**: it never adds detail. **Unsharp masking** raises edge contrast and can help PSNR slightly, but amplifies noise. **Classical SR** (example-based, sparse coding, back-projection) came before deep learning.

## Learned super-resolution

Train a network on pairs (low-res, high-res) made by degrading real photos, with the loss `‖SR(y) − x‖`:

| Model | Key idea |
|---|---|
| **SRCNN** (2014) | First 3-layer CNN: interpolate to the target size, then correct with convolutions |
| **ESPCN** | Work at low resolution and use **sub-pixel convolution (PixelShuffle)** to rearrange channels into a bigger image at the end: fast |
| **VDSR** | Learn the **residual** (the missing detail) on top of bicubic; deep network |
| **EDSR / RCAN** | Deep residual networks without batch norm; channel attention |
| **SRGAN / ESRGAN / Real-ESRGAN** | Adversarial + perceptual losses create **sharp, realistic textures**; Real-ESRGAN trains on a synthetic **high-order degradation** pipeline for real photos |
| **SwinIR, HAT, Restormer** | Transformer restoration backbones; state of the art for PSNR |
| **Diffusion restorers** (SR3, StableSR, SUPIR, DiffBIR, SinSR) | Use a generative prior; best perceptual quality for heavy degradations; slower and can hallucinate |

The runnable check below trains a tiny residual network (VDSR idea) for a few seconds on patches from ten photos and tests on a photo it never saw. It beats bicubic on PSNR; a bigger network and more data widen the gap.

```python local check title="A tiny learned super-resolution model beats bicubic on an unseen photo"
import numpy as np
import cv2
import torch
from torch import nn
import cvlab

torch.manual_seed(0); np.random.seed(0)
device = "cuda" if torch.cuda.is_available() else "cpu"
scale = 3
train_names = ["astronaut", "coffee", "cat", "camera", "rocket", "brick", "grass", "horse", "moon", "gravel"]
test_name = "coins"

def gray01(name):
    return cvlab.image(name, gray=True).astype(np.float32) / 255

def pair(hr):
    h, w = (hr.shape[0] // scale) * scale, (hr.shape[1] // scale) * scale
    hr = hr[:h, :w]
    lr = cv2.resize(hr, (w // scale, h // scale), interpolation=cv2.INTER_AREA)       # the degradation: area down-sampling
    up = cv2.resize(lr, (w, h), interpolation=cv2.INTER_CUBIC)                         # a bicubic guess at the full size
    return hr, up

# training patches: 32x32 crops of the bicubic guess and of the true high-resolution picture
ups, hrs = [], []
for n in train_names:
    hr, up = pair(gray01(n))
    for _ in range(400):
        y = np.random.randint(0, hr.shape[0] - 32); x = np.random.randint(0, hr.shape[1] - 32)
        ups.append(up[y:y + 32, x:x + 32]); hrs.append(hr[y:y + 32, x:x + 32])
up_t = torch.tensor(np.array(ups))[:, None].to(device); hr_t = torch.tensor(np.array(hrs))[:, None].to(device)

class ResidualSR(nn.Module):                                                           # VDSR-style: learn only what bicubic gets wrong (the missing detail)
    def __init__(self):
        super().__init__()
        self.body = nn.Sequential(nn.Conv2d(1, 32, 3, padding=1), nn.ReLU(), nn.Conv2d(32, 32, 3, padding=1), nn.ReLU(),
                                  nn.Conv2d(32, 32, 3, padding=1), nn.ReLU(), nn.Conv2d(32, 1, 3, padding=1))
    def forward(self, up):
        return up + self.body(up)

net = ResidualSR().to(device)
opt = torch.optim.Adam(net.parameters(), lr=1e-3)
for step in range(2500):
    idx = torch.randint(0, len(up_t), (64,), device=device)
    loss = ((net(up_t[idx]) - hr_t[idx]) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()

hr, up = pair(gray01(test_name))
psnr = lambda a, b: float(10 * np.log10(1 / np.mean((a - b) ** 2)))
with torch.no_grad():
    sr = net(torch.tensor(up)[None, None].to(device))[0, 0].clamp(0, 1).cpu().numpy()
print(f"x{scale} super-resolution of an unseen photo ({hr.shape[1]}x{hr.shape[0]})")
print(f"PSNR bicubic: {psnr(up, hr):.2f} dB   |   residual CNN trained for a few seconds: {psnr(sr, hr):.2f} dB")
```

## The perception–distortion trade-off

Training with **pixel losses (MSE/L1)** gives the highest **PSNR** but **blurry** results: the network predicts the average of all plausible sharp images. Training with **GAN or perceptual (LPIPS) losses** produces **sharper, more realistic textures**, but they are not the true ones, so PSNR falls. Blau and Michaeli proved this trade-off is fundamental: you cannot maximise fidelity and realism together.

| Goal | Choose |
|---|---|
| Measurement, forensic, medical, OCR | A fidelity model (L1/MSE), no invented texture |
| Photos, video upscaling for viewing | GAN or diffusion-based perceptual models |
| Detection or recognition on small objects | Whatever improves the **downstream accuracy**, measured end-to-end |

## Denoising, deblurring and friends

- **Denoising**: classical BM3D and non-local means (module 2) are strong; deep nets (DnCNN, FFDNet, Restormer, NAFNet) win on learned noise types. **Self-supervised denoisers** (Noise2Noise, Noise2Void) need no clean images; essential in microscopy and astronomy. In cameras, denoising works on **raw** data before the image pipeline.
- **Deblurring**: if the blur kernel is known, **Wiener / Richardson–Lucy deconvolution**; unknown (blind) blur needs learned models (DeblurGAN, NAFNet, MPRNet) or kernel estimation. Motion blur can be reduced at capture by shorter exposure.
- **JPEG artefact removal, dehazing, deraining, low-light enhancement** (Retinex-based, Zero-DCE, SID/raw denoising), **HDR fusion**.
- **Inpainting**: fill missing regions (diffusion inpainting, LaMa).
- **All-in-one restoration** models handle many degradations with one network (PromptIR, DiffBIR).
- **Video restoration** (BasicVSR++, VRT) uses neighbouring frames, which carry extra information, with optical-flow or deformable alignment (module 6).

## Real-world and blind SR

Models trained on "clean bicubic down-sampling" **fail on real photos**: real blur, sensor noise, compression and unknown kernels. Fixes: random **high-order degradation** during training (Real-ESRGAN, BSRGAN), real paired data captured with different focal lengths (RealSR, DRealSR), and **degradation-aware** conditioning.

## Metrics

- **PSNR, SSIM**: fidelity to the reference (see the earlier warning: they prefer blur).
- **LPIPS, DISTS**: perceptual distance to the reference.
- **NIQE, BRISQUE, MUSIQ, CLIP-IQA**: **no-reference** quality estimators for real images without ground truth.
- **FID** for distribution realism; **user studies** (mean opinion score).
- **Task metrics**: OCR accuracy, detection AP, recognition rate after restoration. If these do not improve, the restoration was only cosmetic.

## Hallucination and trust

A generative SR model may **invent** a plausible but **wrong** detail: letters in a licence plate, a face that is not the real person, a tumour-like texture. Rules:

- Never use SR to claim identity, read evidence or measure sizes (forensics, law, medicine) unless the model's fidelity is proven for that task.
- Keep the **original** image, store the model version, and label restored images.
- For measurement, prefer **better optics, more pixels at capture (tiling, higher-resolution camera) or multi-frame fusion** (several frames give **real** extra information).

:::interview Questions you may get
- "Explain how super-resolution is learned." Pairs of low/high-res images made by degrading photos; a network (residual CNN, transformer) learns the mapping with L1/perceptual/adversarial losses; sub-pixel convolution upsamples efficiently.
- "Why are GAN-based SR results sharper but have lower PSNR?" PSNR rewards the pixel-wise average (blur); GAN/perceptual losses create realistic but not exact texture (perception–distortion trade-off).
- "Why does a model trained on bicubic down-sampling fail on real photos?" Real degradations (unknown blur, noise, JPEG) differ; use realistic, randomised degradation pipelines.
- "How would you improve license-plate reading from a blurry far camera?" Multi-frame fusion or video SR, a better camera/shutter/lighting, a task-specific recogniser trained on degraded plates; verify gain on OCR accuracy, and avoid trusting hallucinated characters.
- "What does PixelShuffle do?" Rearranges `r²` channels into an `r×` larger spatial grid, letting the network compute at low resolution.
:::

```quiz
? Why is image restoration called an ill-posed problem?
+ Many different clean images are consistent with the same degraded image
- It needs too much memory
- The loss is not differentiable
> Priors are required.

? Which loss typically produces the highest PSNR but blurry results?
+ L1/L2 pixel loss
- GAN loss
- Perceptual loss
> It predicts the average.

? What is a major risk of generative SR for evidence or measurement?
+ It can hallucinate plausible but wrong details
- It always lowers resolution
- It removes colour
> Fidelity is not guaranteed.

? What does sub-pixel convolution (PixelShuffle) allow?
+ Doing most computation at low resolution and upsampling at the end
- Training without data
- Removing noise
> Efficiency.
```

:::problem A surveillance team wants to upscale a 40×20-pixel car plate from far away to read the characters. What do you tell them? {level=medium tags="sr,ocr,limits"}
Think about information content and verification.

:::solution Model answer
Single-image SR cannot recover information that was never captured; a generative model can produce readable but wrong characters. Better: improve capture (higher resolution or zoom lens, shorter exposure, IR/lighting, camera placement), use multi-frame fusion over a track of the same plate (real sub-pixel information), and a recogniser trained for low-resolution plates with a constrained format (plate grammar), reporting confidence and top-k candidates rather than one "enhanced" image. Evaluate by OCR accuracy on a labelled set of real far plates, and treat enhanced images as aids, not proof.
:::
:::

:::keypoints
- Restoration inverts a degradation (blur, down-sampling, noise, JPEG); it is ill-posed, so priors learned from data are needed.
- Learned SR (SRCNN, ESPCN, EDSR, Real-ESRGAN, SwinIR, diffusion models) beats interpolation, which adds no detail; sub-pixel convolution and residual learning are key tricks.
- Perception–distortion trade-off: pixel losses give high PSNR but blur; GAN/diffusion give realism but may hallucinate.
- Real photos need realistic degradation training; judge with task metrics, LPIPS/no-reference scores and users; never trust invented detail for measurement or evidence.
:::

:::resources
- [Dong et al.: Image Super-Resolution Using Deep Convolutional Networks (SRCNN)](https://arxiv.org/abs/1501.00092) — the first deep SR.
- [Shi et al.: Real-Time Single Image and Video Super-Resolution Using an Efficient Sub-Pixel CNN (ESPCN)](https://arxiv.org/abs/1609.05158) — PixelShuffle.
- [Wang et al.: Real-ESRGAN](https://arxiv.org/abs/2107.10833) — practical blind SR.
- [Liang et al.: SwinIR: Image Restoration Using Swin Transformer](https://arxiv.org/abs/2108.10257) — transformer restoration.
- [Blau and Michaeli: The Perception-Distortion Tradeoff](https://arxiv.org/abs/1711.06077) — why sharp and exact conflict.
:::
