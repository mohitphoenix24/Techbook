---
title: Diffusion and Flow Models — How Images Are Generated
level: advanced
time: 55
summary: How text-to-image models work. The forward noising process, the denoising network that learns to reverse it, latent diffusion (VAE + U-Net/DiT), text conditioning and classifier-free guidance, samplers and step counts, flow matching and rectified flow, fine-tuning and control (LoRA, ControlNet, IP-Adapter), evaluation and safety (provenance and misuse). With an interactive 2-D diffusion sampler and runnable noising, guidance and schedule demos.
---

Generating a photorealistic image from a sentence sounds like magic. The core idea is surprisingly simple: **learn to remove a little noise, then do it many times starting from pure noise.** This lesson explains diffusion models, the engine behind most image and video generators, and the newer flow-matching variants.

:::analogy
A sculptor facing a block of marble sees the statue inside and chips away what does not belong. A diffusion model starts from a block of pure static and, step by step, chips away the "noise" that does not belong, guided by the text prompt, until a picture emerges.
:::

## Forward process: destroy the data slowly

Take a real image `x₀` and add Gaussian noise gradually over `T` steps until only noise remains. There is a closed form for any step `t`:

:::formula Forward (noising) process
x_t = \sqrt{\bar\alpha_t}\; x_0 + \sqrt{1-\bar\alpha_t}\;\epsilon,\qquad \epsilon\sim\mathcal{N}(0, I)
:::

`ᾱ_t` (the **noise schedule**) goes from ≈ 1 (clean) at `t = 0` to ≈ 0 (pure noise) at `t = T`. No learning here: it is just a recipe for corrupting data.

## Reverse process: learn to denoise

Train a neural network `ε_θ(x_t, t, c)` to **predict the noise** that was added (or equivalently the clean image or a "velocity"), given the noisy image, the time step and a condition `c` (the text prompt). The training loss is just mean squared error:

:::formula Diffusion training objective
\mathcal{L} = \mathbb{E}_{x_0,\,\epsilon,\,t}\big\|\epsilon - \epsilon_\theta(x_t, t, c)\big\|^2
:::

At generation time: start from `x_T ~ N(0, I)` and repeatedly use the network's prediction to take a small step toward a cleaner image (**DDPM**, **DDIM**, or modern **ODE solvers** such as DPM-Solver or Euler), until `x₀`.

Play with a miniature version: data is a 2-D smiley, noise slowly erases it, and sampling brings new points back from pure noise. Change the number of sampling steps to see quality trade off against compute.

```viz algo=diffusion title="Diffusion on a 2-D dataset"
```

```python run title="The forward process destroys structure; the denoiser recovers it" level=advanced
import numpy as np

rng = np.random.default_rng(0)
# data: two clusters on a line (a toy "distribution of images")
x0 = np.concatenate([rng.normal(-2.0, 0.25, 500), rng.normal(2.0, 0.25, 500)])

def abar(t, T=1.0):                                         # cosine schedule: fraction of signal left at t in [0, 1]
    return np.cos((t + 0.008) / 1.008 * np.pi / 2) ** 2

print("noise level -> signal left | std of x_t | are the two clusters still visible?")
for t in (0.0, 0.3, 0.6, 0.9, 1.0):
    a = abar(t)
    xt = np.sqrt(a) * x0 + np.sqrt(1 - a) * rng.normal(size=x0.size)
    left, right = xt[:500].mean(), xt[500:].mean()
    print(f"t={t:.1f}: signal {a:6.1%} | std {xt.std():.2f} | cluster means {left:+.2f}, {right:+.2f}  gap {right - left:+.2f}")

# The best possible denoiser for this data (exact posterior mean of x0 given x_t) pushes points back toward the clusters
def denoise(xt, a, centers=(-2.0, 2.0), s0=0.25):
    var = a * s0 ** 2 + (1 - a)                              # variance of x_t within one cluster
    logp = np.stack([-(xt - np.sqrt(a) * c) ** 2 / (2 * var) for c in centers])
    w = np.exp(logp - logp.max(0)); w /= w.sum(0)            # responsibility of each cluster
    return sum(w[i] * (centers[i]) for i in range(len(centers)))

t = 0.6; a = abar(t)
xt = np.sqrt(a) * x0 + np.sqrt(1 - a) * rng.normal(size=x0.size)
x0_hat = denoise(xt, a)
print(f"\nat t={t}: error of the noisy sample {np.mean((xt / np.sqrt(a) - x0) ** 2):.3f} -> error after denoising {np.mean((x0_hat - x0) ** 2):.3f}")
```

## Why "latent" diffusion

Running diffusion directly on a 1024×1024×3 image means 3 million numbers per step. **Latent diffusion** ([Stable Diffusion, Rombach et al.](https://arxiv.org/abs/2112.10752)) first compresses images with a **VAE** into a small latent (for example 128×128×4, ~48× fewer numbers), runs diffusion in that space, and decodes at the end. This cut compute enough to put image generation on consumer GPUs.

:::flow Text-to-image pipeline (latent diffusion)
Prompt | tokenised and encoded by a text encoder (CLIP/T5/LLM)
Start | sample pure noise in latent space
Denoise (many steps) | U-Net or Diffusion Transformer predicts noise, conditioned on text and timestep
Guidance | combine conditional and unconditional predictions (CFG)
Decode | the VAE decoder turns the clean latent into pixels
Optional | upscalers, refiners, safety filters, watermarking
:::

### The denoiser: U-Net and Diffusion Transformers

Early models used **U-Nets** (convolutional encoder–decoder with skip connections, with cross-attention to the text). Newer ones use **Diffusion Transformers (DiT)** ([paper](https://arxiv.org/abs/2212.09748)): a Transformer over latent patches, which scales well with compute and data and is the backbone of recent image and video generators.

## Text conditioning and classifier-free guidance

The text encoder produces embeddings the denoiser attends to. To make images follow the prompt strongly, models use **classifier-free guidance (CFG)**: at each step, compute the noise prediction **with** the prompt and **without** it (an empty prompt), then extrapolate:

:::formula Classifier-free guidance
\hat\epsilon = \epsilon_\theta(x_t,\varnothing) + w\,\big(\epsilon_\theta(x_t,c) - \epsilon_\theta(x_t,\varnothing)\big)
:::

`w` is the **guidance scale** (typically 3–10): higher means stronger prompt adherence and less diversity (and artefacts if too high). It costs **two network evaluations per step** (or a distilled single-pass version).

```python run title="Guidance sharpens the distribution toward the condition" level=intermediate
import numpy as np

# a toy world with 3 "images" (outcomes). The unconditional model likes all three; the prompt favours outcome 0.
logits_uncond = np.array([1.0, 1.0, 1.0])
logits_cond   = np.array([1.6, 0.9, 0.5])
softmax = lambda z: np.exp(z - z.max()) / np.exp(z - z.max()).sum()

print(f"{'guidance w':>10} {'P(outcome 0)':>13} {'P(outcome 1)':>13} {'P(outcome 2)':>13}   (diversity falls as w rises)")
for w in (0.0, 1.0, 3.0, 7.5):
    guided = logits_uncond + w * (logits_cond - logits_uncond)         # the CFG extrapolation
    p = softmax(guided)
    print(f"{w:>10.1f} {p[0]:>13.2f} {p[1]:>13.2f} {p[2]:>13.2f}")
```

## Sampling: steps, solvers and distillation

Original DDPM sampling needed ~1,000 network evaluations. Better solvers (DDIM, DPM-Solver++, Euler/Heun) reach good quality in **20–50 steps**. **Distillation** (consistency models, adversarial/latent consistency distillation, Turbo/Lightning models) compresses this to **1–4 steps** at some quality or diversity cost: the speed behind real-time image generation.

| Knob | Effect |
|---|---|
| **Steps** | more steps: finer detail, diminishing returns, slower |
| **Guidance scale** | prompt adherence vs diversity and artefacts |
| **Sampler/scheduler** | trade-offs in speed, sharpness, randomness |
| **Seed** | determinism: the same seed, prompt and settings reproduce an image |
| **Resolution / aspect ratio** | cost grows with pixels; models have preferred sizes |
| **Negative prompt** | the "unconditional" side steers away from unwanted content (in CFG) |

## Flow matching and rectified flow

Recent systems (Stable Diffusion 3, FLUX and others) use **flow matching** ([paper](https://arxiv.org/abs/2210.02747)): instead of predicting noise to reverse a stochastic process, the network learns a **velocity field** that transports noise to data along (near-)straight paths, trained with a simple regression loss. Straighter paths mean **fewer sampling steps** and simpler training. Conceptually it is diffusion's cousin: same pipeline (latent space, text conditioning, Transformer backbone), cleaner maths.

## Customising and controlling generation

| Technique | What it does |
|---|---|
| **LoRA / DreamBooth / textual inversion** | teach a model a new subject, character or style from a few images (adapter files you can share) |
| **ControlNet / T2I-Adapter** | condition on structure: edges, depth, pose, segmentation, layouts |
| **IP-Adapter / reference conditioning** | use an image as a style or subject prompt |
| **Inpainting / outpainting** | regenerate only a masked region or extend the canvas |
| **img2img / SDEdit** | start from a noised version of an existing image to edit while preserving layout |
| **Instruction editing** (InstructPix2Pix and newer multimodal editors) | "make it winter" |
| **Upscaling and refinement** | super-resolution models and refiners |

Tools: Hugging Face **Diffusers** ([docs](https://huggingface.co/docs/diffusers)), **ComfyUI** ([repo](https://github.com/comfyanonymous/ComfyUI)) for node-based workflows, and hosted APIs. Open model families include Stable Diffusion/SD3, FLUX; closed APIs from Google, OpenAI, Midjourney and others.

```python local title="Generate an image with Diffusers (GPU recommended)"
import torch
from diffusers import AutoPipelineForText2Image

pipe = AutoPipelineForText2Image.from_pretrained("black-forest-labs/FLUX.1-schnell", torch_dtype=torch.bfloat16).to("cuda")
image = pipe("a watercolor painting of a lighthouse at dawn", num_inference_steps=4, guidance_scale=0.0,
             generator=torch.Generator("cuda").manual_seed(7)).images[0]
image.save("lighthouse.png")
```

## Memorisation and generalisation

In the toy sampler, the exact denoiser **reproduces the training points**: with a perfect fit to a finite dataset, the model memorises. Real networks generalise by sharing structure across data, but **memorisation can still occur** (duplicated images in training data can be reproduced), which is a privacy and copyright concern. Mitigations include deduplicating training data, opt-outs, and output filtering.

## Evaluation

- **FID / KID** (distribution distance between generated and real image features), **CLIP score** (text–image alignment), **aesthetic predictors**, human preference rankings (arenas), and prompt-adherence benchmarks (GenEval, T2I-CompBench).
- Automatic metrics correlate imperfectly with human preference; **human evaluation** remains the reference.
- For products: check **prompt adherence, text rendering, hands/anatomy, consistency across generations, safety filter behaviour, and latency/cost**.

## Safety, provenance and misuse

Image generators can produce **deepfakes, non-consensual imagery, misinformation and copyright-infringing** content. Responsible deployment includes **safety classifiers** on prompts and outputs, **refusal policies**, **watermarking and provenance metadata** (C2PA content credentials; invisible watermarks such as SynthID), **abuse monitoring**, **opt-out and licensing** for training data, and clear **terms of use**. Detecting AI images after the fact is unreliable, so provenance at creation is the stronger approach.

```quiz
? What does the denoising network learn to predict in standard diffusion training?
+ The noise added to a clean sample (equivalently the clean sample or a velocity), given the noisy input, the timestep and the prompt
- The next token
- The image caption
> The loss is a simple regression on the noise.

? Why is latent diffusion much cheaper than pixel-space diffusion?
+ A VAE compresses images into a much smaller latent space where denoising runs
- It skips the denoising steps
- It uses no neural network
> Decode to pixels only at the end.

? What does a higher classifier-free guidance scale do?
+ Pushes the sample toward the prompt more strongly, at the expense of diversity (and eventually quality)
- Makes generation faster
- Removes the need for a text encoder
> CFG extrapolates from the unconditional toward the conditional prediction.

? What is the main advantage of flow matching?
+ Straighter transport paths from noise to data, enabling fewer sampling steps with a simple training objective
- It needs no data
- It generates text
> Same pipeline as diffusion with cleaner maths and faster sampling.
```

:::problem Your marketing team's image generator produces great pictures but ignores specific details in prompts and renders text badly. What can you change? {level=medium tags="diffusion,quality"}
Offer practical remedies.

:::solution Model answer
Raise the **guidance scale** moderately, add **more steps**, and use a model with a stronger text encoder (T5/LLM-based) such as newer flow-matching models; **rewrite prompts** into structured, concrete descriptions (use an LLM prompt expander) and keep text short (or add text afterwards in design tools). Use **ControlNet or layout conditioning** for composition, **LoRA** for brand style, **inpainting** to fix local errors, and a **best-of-n + automatic scoring** (CLIP/VLM check against the prompt) pipeline. Evaluate with a prompt-adherence checklist on a fixed prompt set, comparing models and settings.
:::
:::

:::keypoints
- Diffusion corrupts data with noise (known closed form) and trains a network to predict the noise; generation reverses the process from pure noise.
- Latent diffusion runs in a compressed VAE latent space; backbones are U-Nets or Diffusion Transformers; text conditions via cross-attention.
- Classifier-free guidance combines conditional and unconditional predictions: higher scale = more prompt adherence, less diversity.
- Samplers need 20–50 steps; distillation reaches 1–4; flow matching learns straighter paths for faster sampling.
- Control with LoRA, ControlNet, inpainting and img2img; evaluate with FID, CLIP score and human preference; address safety, memorisation and provenance.
:::

:::resources
- [Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2006.11239) and [High-Resolution Image Synthesis with Latent Diffusion Models](https://arxiv.org/abs/2112.10752) — the foundations.
- [Flow Matching for Generative Modeling](https://arxiv.org/abs/2210.02747) and [Scalable Diffusion Models with Transformers (DiT)](https://arxiv.org/abs/2212.09748) — modern backbones.
- [Hugging Face Diffusers docs](https://huggingface.co/docs/diffusers) — pipelines and training.
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) — node-based generation workflows.
- [Lilian Weng: What are diffusion models?](https://lilianweng.github.io/) — a rigorous, readable derivation (see her 2021 post).
- [Hugging Face Cookbook](https://huggingface.co/learn/cookbook) — practical diffusion and multimodal recipes.
:::
