---
title: Control, Personalisation and Editing
level: advanced
time: 50
summary: Steering a diffusion model. Image-to-image and the strength knob (SDEdit), inpainting, ControlNet and T2I-Adapter (edges, depth, pose), LoRA, DreamBooth and textual inversion, IP-Adapter, instruction-based editing, and using generation for synthetic training data.
---

A text prompt alone is a weak way to say what you want. Real work needs **control**: keep this layout, this pose, this object, change only that part. This lesson shows the standard tools, and they all build on the same denoising model.

## Image-to-image: start from a noisy photo instead of pure noise (SDEdit)

Instead of starting at `t = T` (pure noise), **add noise to an existing image only up to a middle step** and denoise from there. The **strength** parameter (0 to 1) chooses how far to go:

- **Low strength** (0.2–0.4): keeps the layout and colours, changes details and style.
- **High strength** (0.8–1.0): only a vague memory of the original remains.

```python run title="Strength = how much of the original survives" level=intermediate shared
import numpy as np
import cv2
import cvlab

img = cv2.resize(cvlab.image("astronaut"), (160, 160)).astype(np.float32) / 127.5 - 1
T = 1000
abar = np.cumprod(1 - np.linspace(1e-4, 0.02, T))
rng = np.random.default_rng(1)
eps = rng.normal(0, 1, img.shape).astype(np.float32)
show = lambda a: ((np.clip(a, -1, 1) + 1) * 127.5).astype(np.uint8)

print("strength | start step | signal kept | correlation of the start image with the original")
shots = []
for s in (0.2, 0.4, 0.6, 0.8, 1.0):
    t = min(int(s * T), T - 1)
    start = np.sqrt(abar[t]) * img + np.sqrt(1 - abar[t]) * eps          # where the denoising loop begins
    corr = np.corrcoef(start.ravel(), img.ravel())[0, 1]
    print(f"{s:>8} | {t:>10} | {abar[t]:>11.3f} | {corr:.3f}")
    shots += [show(start), f"strength {s}"]
cvlab.show(*shots)
print("the model then denoises from that point, so what is already 'visible' in the start image decides the final layout")
```

## Inpainting and outpainting

**Inpainting**: give an image and a **mask**; the model fills the masked region following the prompt and blends with the surroundings. Dedicated inpainting models take the mask and the masked image as extra input channels; general models use the **RePaint** trick of repeatedly re-noising the known region. **Outpainting** extends the image beyond its border. Typical use: remove an object (classical cousin: `cv2.inpaint`), replace a background, repair damage, fill after SAM segmentation ("segment, then replace").

## ControlNet: spatial control

**ControlNet** (Zhang et al., 2023) adds a **trainable copy of the encoder** of the frozen diffusion U-Net, fed with a control image, and connects it to the original through **zero-initialised convolutions** (so at the start it changes nothing, and training cannot damage the base model). Train separate ControlNets per condition:

| Control image | Gives |
|---|---|
| **Canny edges** | Keeps outlines (classical vision pre-processing, straight from module 2) |
| **Depth map** | Keeps 3-D layout (a monocular depth network makes it from a photo) |
| **Human pose (OpenPose)** | Keeps a pose skeleton |
| **Segmentation map** | Keeps regions and classes |
| **Scribble / HED / line art** | From a rough sketch |
| **Normal map, MLSD lines, tiles** | Architecture and upscaling |

**T2I-Adapter** is a lighter alternative. The pipeline is therefore: **classical or neural vision to extract structure (edges, depth, pose) → ControlNet → generation**. This is how CV and generative AI join in practice.

```python run title="The control signals are classical vision outputs: make a Canny condition" level=intermediate
import cv2
import numpy as np
import cvlab

photo = cvlab.image("astronaut")
gray = cv2.cvtColor(photo, cv2.COLOR_RGB2GRAY)
edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 100, 200)                   # the image a Canny-ControlNet would receive
cond = np.dstack([edges] * 3)
print("condition image:", cond.shape, cond.dtype, " edge pixels:", int((edges > 0).sum()))
print("with a ControlNet: prompt 'an oil painting of an astronaut' + this edge map -> same outline, new style")
cvlab.show(photo, "Source photo", cond, "Canny control image")
```

## Teaching the model new things

| Method | What you provide | What is trained | Notes |
|---|---|---|---|
| **Textual inversion** | 3–10 images | One new word embedding | Tiny file, limited fidelity |
| **DreamBooth** | 3–30 images of a subject | The whole U-Net (or LoRA), with a rare token and prior-preservation images | High fidelity; risks forgetting |
| **LoRA** (low-rank adapters) | 10–200 images (a style, a character, a product) | Small low-rank updates to attention layers | A few MB; mix several LoRAs; the standard in practice |
| **IP-Adapter** | One reference image at inference time | A small adapter that injects image features through extra cross-attention | No training per subject; "image prompt" |
| **Fine-tune / full train** | Thousands of images | Everything | For a new domain (medical, satellite) |

## Instruction-based editing

**InstructPix2Pix** and similar models take an input image and an **edit instruction** ("make it sunset", "remove the person") and output the edited image, trained on synthetic (before, instruction, after) triples. Newer models (Flux Kontext, Qwen-Image-Edit, GPT-image editing, Gemini image) do this more faithfully. **Prompt-to-Prompt** and **null-text inversion** edit by changing attention maps and inverting a real image back to noise.

## Generating training data for vision models

Diffusion gives you images that are otherwise rare or expensive: weather, lighting, defects, objects in odd poses.

- **Pipeline**: prompt or ControlNet-conditioned generation → automatic labels (the control mask or box is the label, or a detector/SAM labels it) → filtering (CLIP score, a classifier, human spot-check) → train.
- **Good for**: rare classes, long-tail objects, domain randomisation of backgrounds, augmentations that keep the label (inpaint a different background behind a segmented object).
- **Risks**: synthetic artefacts the model learns to detect, **label noise** (the "dent" is not really a dent), low diversity, bias; **always test on real held-out data** and compare with simpler augmentation.
- Classical **copy-paste augmentation** (paste segmented objects on new backgrounds) is cheap and often equally effective.
- For robotics, mix **simulation** (Isaac Sim, Blender) with **domain randomisation** and optional generative realism, covered in the 3-D lessons.

## Safety and responsibility

Generated media can mislead: watermarking and provenance (C2PA), consent for likenesses, copyright and licences of datasets, and filtering unsafe content. In production use model licences (OpenRAIL, non-commercial restrictions for some weights) and keep records of which model produced which image.

:::interview Questions you may get
- "How would you keep the layout of an input image but change its style?" Image-to-image with moderate strength, or ControlNet with an edge/depth map of the input.
- "What is ControlNet and why zero convolutions?" A trainable copy of the encoder driven by a control image, joined to the frozen model through zero-initialised convs so training starts as the original model and cannot degrade it.
- "How do LoRA and DreamBooth differ?" DreamBooth teaches a subject by fine-tuning (with a rare token and prior preservation); LoRA is a parameter-efficient way to fine-tune that can be applied to DreamBooth or style training.
- "How can generative models help a detector with few examples of a defect?" Controlled generation or inpainting of defects into real images, with automatic labels and strict real-data validation.
- "What are the risks of synthetic training data?" Artefact shortcuts, wrong labels, mode collapse in diversity, distribution mismatch; validate on real data.
:::

```quiz
? What does the strength parameter in image-to-image control?
+ How much noise is added to the input before denoising, and so how much of it is kept
- The number of colours
- The image size
> Low strength keeps more of the original.

? Which control input do you give a ControlNet to preserve the 3-D layout of a scene?
+ A depth map
- A text prompt only
- A random seed
> Depth conditioning.

? What does LoRA train?
+ Small low-rank update matrices added to existing weights
- The whole model from scratch
- Only the VAE
> Small files, mixable.

? What is the most important check when training a detector on synthetic images?
+ Evaluate on real, held-out images
- Count the number of synthetic images
- Check the file format
> Synthetic-only metrics can mislead.
```

:::problem You must detect hairline cracks on ceramic tiles but only have 40 real crack images. A colleague proposes generating 10,000 crack images with Stable Diffusion. What is your plan and what could go wrong? {level=hard tags="synthetic-data,defects"}
Think about label quality, realism and validation.

:::solution Model answer
First try cheaper and safer options: strong augmentation, copy-paste of real crack patches, a pre-trained backbone with few-shot fine-tuning, and anomaly-detection methods (PatchCore) trained on normal tiles. If generation is used, inpaint cracks into real tile photos with a mask drawn from simulated crack shapes (so labels are exact) rather than text-to-image whole pictures; fine-tune with LoRA on the 40 real examples; filter outputs with a crack detector and visual review; mix synthetic with real at limited ratio. Risks: unrealistic cracks the model learns to recognise by artefacts, wrong labels, tile texture mismatch, leakage if synthetic images derive from test images. Validate only on a real, independent test set from different production batches; report recall at a fixed false-alarm rate.
:::
:::

:::keypoints
- Image-to-image (SDEdit) starts the denoising from a partly-noised input; strength sets how much is preserved. Inpainting fills masked regions.
- ControlNet / T2I-Adapter add spatial control from edges, depth, pose or segmentation maps, linking classical/neural vision to generation.
- LoRA, DreamBooth, textual inversion and IP-Adapter personalise a model to a subject or style; instruction editors change images by text commands.
- Synthetic data helps rare cases, but must be label-accurate, filtered and validated on real data.
:::

:::resources
- [Meng et al.: SDEdit](https://arxiv.org/abs/2108.01073) — image-to-image by partial noising.
- [Zhang et al.: Adding Conditional Control to Text-to-Image Diffusion Models (ControlNet)](https://arxiv.org/abs/2302.05543) — spatial control.
- [Ruiz et al.: DreamBooth](https://arxiv.org/abs/2208.12242) — subject personalisation.
- [Gal et al.: Textual Inversion](https://arxiv.org/abs/2208.01618) — one new word per concept.
- [Ye et al.: IP-Adapter](https://arxiv.org/abs/2308.06721) — image prompts.
- [Brooks et al.: InstructPix2Pix](https://arxiv.org/abs/2211.09800) — editing by instruction.
:::
