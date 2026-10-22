---
title: Latent Diffusion and Stable Diffusion
level: advanced
time: 55
summary: How text-to-image models work in practice. Working in a compressed latent space, the parts of Stable Diffusion (VAE, text encoder, denoiser, scheduler), cross-attention for text, classifier-free guidance with a runnable demo, DiT and flow-based models (SD3, Flux), and the cost of generation.
---

Plain diffusion in pixel space is expensive: a 512×512 image has 786,432 numbers and the network runs 50 times. **Latent diffusion** (Rombach et al., 2022, the paper behind **Stable Diffusion**) made it cheap by working in a **small latent space**.

## The idea: diffuse in latents, not in pixels

1. Train an **autoencoder** (a VAE with adversarial and perceptual losses, as in the last lessons) that compresses a 512×512×3 image into a **64×64×4** latent (8× smaller on each side) and decodes it back almost perfectly.
2. Run the whole diffusion process on the **latents**. The denoiser is 48× cheaper per step.
3. At the end, **decode** the final latent into the image.

Details that pixels waste a lot of capacity on (exact noise, texture) are handled by the autoencoder's decoder. The diffusion model concentrates on the **meaningful structure**.

:::flow Stable Diffusion at generation time
Text encoder | Your prompt is turned into a sequence of vectors by a text transformer (CLIP ViT-L in SD 1.x; OpenCLIP-G plus CLIP-L in SDXL; T5 and CLIP in SD3/Flux).
Start noise | A random latent of shape 64×64×4 (the seed fixes it).
Denoiser loop | A U-Net (SD 1/2, SDXL) or transformer (SD3, Flux) predicts the noise (or velocity) for a latent, a timestep and the text embeddings. A scheduler (Euler, DPM++, DDIM) takes 20–50 steps.
Guidance | Each step runs the model twice (with and without the prompt) and mixes the two predictions, to follow the prompt more strongly.
VAE decoder | The final 64×64×4 latent becomes the 512×512 RGB image.
:::

```python run title="What the latent space saves" level=beginner
def numbers(h, w, c): return h * w * c
for res in (256, 512, 768, 1024):
    pix = numbers(res, res, 3); lat = numbers(res // 8, res // 8, 4)
    print(f"{res}x{res} image: {pix:>9,} pixel values -> latent {res // 8}x{res // 8}x4 = {lat:>7,} values  ({pix / lat:.0f}x fewer)")
print("convolutions run on 64x fewer positions (8 x 8) when the grid is 8x smaller per side")
print("attention over a 64x64 latent: tokens =", 64 * 64, "-> pairs =", (64 * 64) ** 2 // 10 ** 6, "million per head per layer (versus", (512 * 512) ** 2 // 10 ** 9, "billion for pixel space)")
```

## How the text gets in: cross-attention

Inside the denoiser, the **image latent tokens** produce queries, and the **text tokens** produce keys and values. Each image position can then "look at" the words relevant to it ("red" and "car" for the region where a car appears). This **cross-attention** is also how you can **edit** with text (Prompt-to-Prompt swaps the attention maps) and visualise which words influence which regions.

```python local check title="Cross-attention: image tokens ask, text tokens answer"
import torch
from torch import nn

torch.manual_seed(0)
B, n_img, n_txt, d = 1, 64 * 64, 77, 320
latent_tokens = torch.randn(B, n_img, d)                      # a 64x64 latent grid, flattened
text_tokens = torch.randn(B, n_txt, d)                        # 77 prompt token embeddings (CLIP length)
attn = nn.MultiheadAttention(d, 8, batch_first=True)
out, w = attn(latent_tokens, text_tokens, text_tokens, need_weights=True, average_attn_weights=True)
print("output:", tuple(out.shape), "(one updated vector per image position)")
print("attention map:", tuple(w.shape), "-> for every image position, a weight over the 77 text tokens (rows sum to 1):", round(float(w[0, 0].sum()), 3))
print("cost is only", n_img * n_txt, "pairs; self-attention on the same grid would need", n_img * n_img)
```

## Classifier-free guidance (CFG)

If you simply condition on the prompt, images only loosely follow it. **Classifier-free guidance** (Ho and Salimans) fixes this:

- During **training**, drop the prompt (replace it by an empty prompt) about 10% of the time. One model learns both the **conditional** and **unconditional** predictions.
- During **sampling**, compute both and **extrapolate** away from the unconditional one:

:::formula Classifier-free guidance
`ε̂ = ε_uncond + w · (ε_cond − ε_uncond)`
`w` is the **guidance scale**: 1 means plain conditional; 5–9 is typical for Stable Diffusion; higher means stronger prompt following but less diversity and oversaturated, "burnt" images.
:::

The demo below is a one-dimensional version: the data contain **two bumps** (two kinds of images); the prompt says "the right bump". Plain conditioning still leaks some samples to the wrong bump. Guidance removes the leakage, at the price of **narrower diversity**.

```python run title="Guidance in one dimension: prompt adherence versus diversity" level=advanced
import numpy as np
rng = np.random.default_rng(0)
def score_cond(x):                                    # the class "right bump" is N(2, 1)
    return -(x - 2.0)
def score_uncond(x):                                  # the unconditional data are an equal mix of N(-2,1) and N(2,1)
    a, b = np.exp(-0.5 * (x + 2) ** 2), np.exp(-0.5 * (x - 2) ** 2)
    return (a * -(x + 2) + b * -(x - 2)) / (a + b)
def sample(w, n=4000, steps=600, eps=0.02):
    x = rng.normal(0, 3, n)
    for _ in range(steps):
        s = score_uncond(x) + w * (score_cond(x) - score_uncond(x))
        x = x + eps * s + np.sqrt(2 * eps) * rng.normal(0, 1, n)
    return x
print("guidance w | mean    | spread | share of samples in the requested (right) bump")
for w in (0, 1, 2, 4, 8):
    x = sample(w)
    print(f"{w:>10} | {x.mean():>6.2f}  | {x.std():.2f}   | {(x > 0).mean():.3f}")
print("w = 0 ignores the prompt (both bumps); w = 1 is plain conditioning (a few wrong-bump leaks); larger w removes the leaks but pushes samples to the extreme and narrows the variety")
```

CFG doubles the compute (two network passes per step; often run as one batch of two). **Distilled** guidance (guidance-distilled Flux-dev, LCM) bakes the guidance into the model. **Negative prompts** use the *negative* text as the "unconditional" branch, so the image is pushed away from it ("blurry, extra fingers").

## Architectures over time

| Model | Denoiser | Notes |
|---|---|---|
| **Stable Diffusion 1.x / 2.x** | U-Net with cross-attention (860 M) | 512 px; CLIP/OpenCLIP text encoder |
| **SDXL** | Larger U-Net (2.6 B), two text encoders, a refiner | 1024 px; extra conditioning on size and crop |
| **DALL·E 2 / Imagen / eDiff** | Cascades: base + super-resolution diffusion | Imagen showed that a bigger frozen language model (T5) improves text alignment |
| **DiT** (Peebles and Xie) | A **transformer** on latent patches, conditioned through adaptive LayerNorm | Scales smoothly with compute; the base of many new models |
| **SD3, Flux, PixArt** | **MM-DiT / DiT** with flow matching (rectified flow); text and image tokens attend jointly | Better text rendering and prompt following |
| **Video models** (Sora-like, Veo, Wan) | Space-time DiT on video latents | Temporal consistency over seconds |
| **Consistency / turbo / LCM** | Distilled for 1–4 steps | Real-time generation |

## Practical knobs

- **Seed**: the same seed + settings gives the same image; change only the seed to explore.
- **Steps**: 20–30 with a good sampler; more steps rarely help.
- **Guidance scale**: 5–8 (SD), 3–4 (flow models); too high gives artefacts.
- **Resolution**: generate near the training size; very different sizes make duplicates (two heads). Use hires-fix or tiled upscaling.
- **VAE quirks**: tiny text and fine faces suffer from the autoencoder's 8× compression.
- **Memory**: fp16/bf16, attention slicing, offloading, quantisation (GGUF/INT8).

```python
# Typical use with Hugging Face diffusers (needs a GPU and a model download; not run here)
import torch
from diffusers import StableDiffusionXLPipeline
pipe = StableDiffusionXLPipeline.from_pretrained("stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16).to("cuda")
image = pipe("a yellow forklift in a clean warehouse, photo", negative_prompt="blurry, text",
             num_inference_steps=30, guidance_scale=6.5, generator=torch.Generator("cuda").manual_seed(7)).images[0]
```

:::interview Questions you may get
- "Why does Stable Diffusion work in a latent space?" A VAE compresses 8× per side, so the denoiser is far cheaper to train and run, and it focuses on semantics while the decoder restores detail.
- "How is text injected into the model?" Text encoder embeddings are used as keys and values in cross-attention layers of the denoiser (or as joint tokens in MM-DiT).
- "What is classifier-free guidance?" Train with random prompt dropout, then sample with `uncond + w (cond − uncond)` to trade diversity for prompt adherence.
- "What are the downsides of high guidance?" Over-saturation, artefacts, less diversity, twice the compute.
- "How would you generate faster?" Fewer steps with a better solver, distilled/turbo/LCM models, smaller latents, quantisation, compile, TensorRT.
- "DiT versus U-Net?" Transformers on patches scale better with data and compute; U-Nets have useful image biases and are efficient at lower scale.
:::

```quiz
? How much smaller (per side) is the Stable Diffusion latent compared with the image?
+ 8× (512 → 64)
- 2×
- 64×
> Plus 4 channels instead of 3.

? In classifier-free guidance, what does a larger w do?
+ Pushes the prediction further away from the unconditional one, so the prompt is followed more strongly
- Increases the number of steps
- Makes the model smaller
> At the cost of diversity.

? Where do the text embeddings enter a U-Net denoiser?
+ As keys and values in cross-attention layers
- As the input image
- In the loss function only
> Image tokens are the queries.

? Which model family replaced the U-Net by a transformer on latent patches?
+ DiT (and SD3/Flux)
- ResNet
- YOLO
> With flow matching in the newest ones.
```

:::problem A product team wants 1024×1024 product photos with a specific, fixed bottle design appearing correctly in every image. Stable Diffusion keeps distorting the label text. What approaches would you consider? {level=hard tags="generation,control,product"}
Think about what the model cannot do reliably and how to constrain it.

:::solution Model answer
Do not ask the generator to invent the exact object. Options: (1) generate only the **background/scene** and composite the real product cut-out (segmentation with SAM) with relighting and shadow generation, so the label is pixel-exact; (2) personalise with **DreamBooth/LoRA** on 20–50 photos of the bottle plus an IP-Adapter or ControlNet (depth/edges from the real bottle render) to fix the shape, then **inpaint** the label region from the original artwork; (3) use an editing model that conditions on a reference image. Validate with automatic checks (OCR on the label, CLIP similarity, a detector for the product) and human review. Choose a higher-resolution or a text-capable model (SD3/Flux) for any text that must be generated.
:::
:::

:::keypoints
- Latent diffusion: a VAE compresses the image 8× per side; diffusion runs on the latent; the decoder returns pixels. Far cheaper, which made Stable Diffusion possible.
- Text enters through cross-attention (or joint attention); classifier-free guidance mixes conditional and unconditional predictions: `ε_u + w(ε_c − ε_u)`.
- Architectures moved from U-Nets to transformers (DiT, MM-DiT) and from noise prediction to flow matching; distilled models need 1–4 steps.
- For exact products, text or layouts, combine generation with compositing, ControlNet-like conditioning and inpainting, then verify automatically.
:::

:::resources
- [Rombach et al.: High-Resolution Image Synthesis with Latent Diffusion Models](https://arxiv.org/abs/2112.10752) — the Stable Diffusion paper.
- [Ho and Salimans: Classifier-Free Diffusion Guidance](https://arxiv.org/abs/2207.12598) — the guidance trick.
- [Podell et al.: SDXL](https://arxiv.org/abs/2307.01952) — the larger model.
- [Peebles and Xie: Scalable Diffusion Models with Transformers (DiT)](https://arxiv.org/abs/2212.09748) — transformer denoisers.
- [Esser et al.: Scaling Rectified Flow Transformers (Stable Diffusion 3)](https://arxiv.org/abs/2403.03206) — MM-DiT and rectified flow.
- [Hugging Face Diffusers documentation](https://huggingface.co/docs/diffusers) — practical pipelines.
:::
