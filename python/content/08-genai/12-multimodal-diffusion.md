---
title: Multimodal AI & Image Generation
level: advanced
time: 40
summary: Beyond text — send images and PDFs to Claude, transcribe speech, embed images and text in one space with CLIP, and understand how diffusion models generate images by learning to remove noise (with a working sampler you can run).
---

Modern AI isn't text-only. Models read **images, charts, screenshots and PDFs**, transcribe and generate **speech**, and **create images** from prompts. This lesson covers how multimodal inputs work in code, and the core idea behind image generation: **diffusion**.

:::def Multimodal model
A model that accepts and/or produces more than one type of data — text, images, audio, video. Claude, for example, takes text, images and PDFs as input and responds with text.
:::

## Images are arrays of numbers

```python run level=easy
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_digits

img = load_digits().images[7]                   # an 8x8 grayscale image
print("shape:", img.shape, "| min/max:", img.min(), img.max())
print(img.astype(int))

rgb = np.zeros((40, 60, 3))                     # height × width × (red, green, blue)
rgb[:, :20, 0] = 1; rgb[:, 20:40, 1] = 1; rgb[:, 40:, 2] = 1

fig, axes = plt.subplots(1, 2, figsize=(7, 3))
axes[0].imshow(img, cmap="gray"); axes[0].set_title("grayscale 8×8")
axes[1].imshow(rgb); axes[1].set_title("RGB 40×60×3")
for ax in axes: ax.axis("off")
plt.show()
```

:::def Vision encoder / image tokens
Vision-language models split an image into small **patches**, turn each patch into a vector (like a token embedding), and feed those "image tokens" to the Transformer alongside text tokens. That's why images cost tokens, and why resolution affects price and detail.
:::

## Sending images to Claude

Images go in the message `content` as **image blocks** — base64-encoded data or a URL — next to text blocks.

```python run level=intermediate
import base64
import io
import json
import numpy as np
import matplotlib.pyplot as plt

# make a small chart and encode it, exactly as you'd do with a real PNG file
fig, ax = plt.subplots(figsize=(3, 2))
ax.bar(["Q1", "Q2", "Q3"], [12, 19, 15])
buf = io.BytesIO()
fig.savefig(buf, format="png")
plt.close(fig)
b64 = base64.standard_b64encode(buf.getvalue()).decode("utf-8")

message = {
    "role": "user",
    "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
        {"type": "text", "text": "Which quarter had the highest sales, and by how much did it beat Q1?"},
    ],
}
preview = json.dumps(message)[:220]
print(preview, "...")
print(f"\nimage payload: {len(buf.getvalue()):,} bytes → {len(b64):,} base64 characters")
```

```python local title="Vision with Claude"
import base64
import anthropic

client = anthropic.Anthropic()
with open("chart.png", "rb") as f:
    data = base64.standard_b64encode(f.read()).decode("utf-8")

response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=2048,
    messages=[{"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}},
        {"type": "text", "text": "Describe this chart and list any trends."},
    ]}],
)
print(response.content[0].text)

# Or reference an image by URL:
# {"type": "image", "source": {"type": "url", "url": "https://example.com/photo.jpg"}}
```

:::tip Put images before the question
Like long documents, images usually work best **before** your instructions in the content list. Several images can go in one message — label them ("Image 1:", "Image 2:") when you want to compare.
:::

### PDFs

```python local title="Ask questions about a PDF"
import base64
import anthropic

client = anthropic.Anthropic()
pdf_b64 = base64.standard_b64encode(open("report.pdf", "rb").read()).decode("utf-8")

response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=4096,
    messages=[{"role": "user", "content": [
        {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64}},
        {"type": "text", "text": "Summarise the key financial figures in a table."},
    ]}],
)
print(response.content[0].text)
```

Claude reads both the text and the visuals (charts, tables, scanned pages) of each PDF page. For files you reuse across many requests, upload them once with the **Files API** and reference the `file_id`.

| Use case | Input |
|---|---|
| extract data from receipts, invoices, forms | images / PDFs |
| understand charts, dashboards, diagrams | images |
| UI screenshots → bug reports or code | images |
| contract / report Q&A | PDFs |
| handwriting, whiteboards | images |

## Speech: audio in and out

:::def Speech-to-text (ASR) and text-to-speech (TTS)
**ASR** (automatic speech recognition) turns audio into text — e.g. OpenAI's open-source **Whisper** model. **TTS** turns text into natural speech. Together with an LLM in the middle, they make voice assistants.
:::

```python local title="Transcribe audio with Whisper (open source)"
# pip install transformers torch   (plus ffmpeg installed on your system)
from transformers import pipeline

asr = pipeline("automatic-speech-recognition", model="openai/whisper-small")
result = asr("meeting.mp3", return_timestamps=True)
print(result["text"])
```

:::flow A voice assistant
Microphone | audio
Speech-to-text | Whisper / ASR API
LLM | understand + answer
Text-to-speech | TTS model
Speaker | audio reply
:::

## One space for images and text: CLIP

:::def CLIP (contrastive image–text embeddings)
A model trained on millions of (image, caption) pairs so that an image and its matching text get **similar embeddings**. You can then search images with text ("a red bicycle in the rain"), classify images with no training (zero-shot), or compare images to each other.
:::

```python local title="Zero-shot image classification with CLIP"
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

image = Image.open("pet.jpg")
labels = ["a photo of a cat", "a photo of a dog", "a photo of a horse"]
inputs = processor(text=labels, images=image, return_tensors="pt", padding=True)
probs = model(**inputs).logits_per_image.softmax(dim=1)[0]
for label, p in zip(labels, probs):
    print(f"{label:<20} {p:.2%}")
```

The training idea is the same contrastive trick used for text embeddings — pull matching pairs together, push mismatched pairs apart:

```python run level=advanced
import numpy as np

def contrastive_loss(img_emb, txt_emb, temperature=0.07):
    """CLIP-style loss: row i of images should match row i of texts."""
    img = img_emb / np.linalg.norm(img_emb, axis=1, keepdims=True)
    txt = txt_emb / np.linalg.norm(txt_emb, axis=1, keepdims=True)
    logits = img @ txt.T / temperature                   # similarity of every image with every caption
    def ce(l):                                           # cross-entropy with the diagonal as the target
        l = l - l.max(axis=1, keepdims=True)
        return -np.mean(np.diag(l) - np.log(np.exp(l).sum(axis=1)))
    return (ce(logits) + ce(logits.T)) / 2

rng = np.random.default_rng(0)
shared = rng.normal(size=(4, 16))                        # 4 concepts
aligned_images = shared + 0.1 * rng.normal(size=(4, 16))
aligned_texts = shared + 0.1 * rng.normal(size=(4, 16))
random_texts = rng.normal(size=(4, 16))
print("loss when captions match their images:", round(contrastive_loss(aligned_images, aligned_texts), 3))
print("loss when captions are random:        ", round(contrastive_loss(aligned_images, random_texts), 3))
```

## How image generation works: diffusion

:::def Diffusion model
A generative model trained to **remove noise**. During training, real images get progressively noisier; the network learns to predict the noise that was added. To generate, start from **pure random noise** and repeatedly remove a little predicted noise — guided by a text prompt — until an image emerges. Stable Diffusion, Imagen, DALL·E 3 and many video models work this way (often in a compressed "latent" space).
:::

:::analogy
A sculptor removing marble: start with a shapeless block (pure noise) and, step by step, chip away what doesn't belong. The trained network is the sculptor's eye that knows, at every stage, which chips to remove to reveal "a cat wearing a hat".
:::

### The forward process: adding noise

:::formula Forward (noising) process
x_t = √ᾱ_t · x₀ + √(1 − ᾱ_t) · ε,     ε ~ N(0, I),     ᾱ_t = Π (1 − β_s)
:::

```python run level=intermediate
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_digits

x0 = load_digits().images[3] / 16 * 2 - 1            # scale pixels to [-1, 1]
T = 200
betas = np.linspace(1e-4, 0.05, T)                    # noise schedule
alpha_bar = np.cumprod(1 - betas)

rng = np.random.default_rng(0)
steps = [0, 10, 30, 60, 100, 199]
fig, axes = plt.subplots(1, len(steps), figsize=(12, 2.3))
for ax, t in zip(axes, steps):
    eps = rng.normal(size=x0.shape)
    xt = np.sqrt(alpha_bar[t]) * x0 + np.sqrt(1 - alpha_bar[t]) * eps
    ax.imshow(xt, cmap="gray", vmin=-2, vmax=2)
    ax.set_title(f"t={t}\nsignal {np.sqrt(alpha_bar[t]):.2f}", fontsize=9)
    ax.axis("off")
fig.suptitle("Forward process: the image slowly dissolves into noise")
plt.show()
```

### The reverse process: generating from noise

Training teaches a network `ε_θ(x_t, t)` to predict the noise. Then sampling runs backwards from pure noise. Below, the data is a simple 2-D distribution (points on five clusters), for which the **perfect** denoiser can be computed exactly — so you can watch real DDPM sampling turn random noise into data without hours of training:

```python run level=advanced
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(0)
angles = np.linspace(0, 2 * np.pi, 5, endpoint=False)
means = np.stack([2.5 * np.cos(angles), 2.5 * np.sin(angles)], axis=1)   # the "dataset": 5 clusters
s2 = 0.08                                                                  # cluster variance

T = 200
betas = np.linspace(1e-4, 0.06, T)
alphas = 1 - betas
alpha_bar = np.cumprod(alphas)

def predict_noise(x, t):
    """The optimal ε-prediction for this dataset (a trained network approximates this)."""
    ab = alpha_bar[t]
    var = ab * s2 + (1 - ab)                                   # variance of each noisy cluster
    d = x[:, None, :] - np.sqrt(ab) * means[None]              # (n, 5, 2)
    logw = -(d ** 2).sum(-1) / (2 * var)
    w = np.exp(logw - logw.max(1, keepdims=True)); w /= w.sum(1, keepdims=True)
    score = -(w[..., None] * d).sum(1) / var                   # ∇ log p(x_t)
    return -np.sqrt(1 - ab) * score

x = rng.normal(size=(1500, 2))                                 # start: pure noise
snapshots = {}
for t in reversed(range(T)):                                   # DDPM sampling loop
    eps = predict_noise(x, t)
    x = (x - betas[t] / np.sqrt(1 - alpha_bar[t]) * eps) / np.sqrt(alphas[t])
    if t > 0:
        x += np.sqrt(betas[t]) * rng.normal(size=x.shape)
    if t in (199, 120, 60, 20, 0):
        snapshots[t] = x.copy()

fig, axes = plt.subplots(1, 5, figsize=(13, 2.8), sharex=True, sharey=True)
for ax, (t, pts) in zip(axes, snapshots.items()):
    ax.scatter(pts[:, 0], pts[:, 1], s=2, alpha=0.5)
    ax.scatter(means[:, 0], means[:, 1], marker="x", color="red", s=40)
    ax.set_title(f"t = {t}")
    ax.set_xlim(-4, 4); ax.set_ylim(-4, 4)
fig.suptitle("Reverse diffusion: noise → samples from the data distribution")
plt.show()
nearest = np.linalg.norm(x[:, None] - means[None], axis=2).min(axis=1)
print(f"{(nearest < 0.9).mean():.0%} of generated points landed on a cluster")
```

:::def Classifier-free guidance (CFG)
How text prompts steer image generation. The model predicts the noise twice — once **with** the prompt and once **without** — and pushes the result further in the "with prompt" direction: `ε = ε_uncond + w · (ε_cond − ε_uncond)`. Higher guidance `w` follows the prompt more strictly (but can reduce variety).
:::

:::def Latent diffusion
Running diffusion in a small compressed **latent** space (from an autoencoder) instead of on full-resolution pixels, then decoding the result to an image. Much faster — the key idea behind Stable Diffusion.
:::

```python local title="Generate an image with Hugging Face diffusers (GPU recommended)"
# pip install diffusers transformers accelerate torch
import torch
from diffusers import AutoPipelineForText2Image

pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16).to("cuda")
image = pipe(prompt="a watercolor painting of a robot reading a book in a library",
             num_inference_steps=4, guidance_scale=0.0).images[0]
image.save("robot.png")
```

:::ai Multimodal in practice
- **Document AI**: invoices, receipts, contracts → structured JSON (vision + structured outputs).
- **Support**: users send screenshots; the model reads the error and suggests a fix.
- **Search**: CLIP-style embeddings for text-to-image and image-to-image search.
- **Accessibility**: image descriptions, transcription, voice interfaces.
- **Creative tools**: diffusion models for images, video and audio, guided by text prompts.
:::

## Check yourself

```quiz
? How is an image sent to Claude in a message?
+ As an image content block (base64 data or a URL) alongside text blocks
- As a file path string
- It can't be — only text is supported
> Content can be a list of typed blocks: image, document, text.

? What does a diffusion model learn during training?
+ To predict the noise that was added to an image at a given noise level
- To copy training images exactly
- To classify images into categories
> Generation runs that denoising step repeatedly, starting from pure noise.

? CLIP puts images and captions in the same embedding space so that…
+ Matching image–text pairs have similar vectors
- Images become text
- Text becomes images
> That enables text-to-image search and zero-shot classification.

? What does a higher classifier-free guidance scale do?
+ Makes the image follow the prompt more strictly
- Adds more noise
- Makes generation faster
> At the cost of some diversity.
```

:::keypoints
- Images are arrays; vision models turn patches into tokens. Send images/PDFs to Claude as **content blocks** (base64, URL or Files API).
- **ASR** (Whisper) + LLM + **TTS** = voice assistants.
- **CLIP**-style contrastive training aligns images and text in one embedding space.
- **Diffusion** models learn to remove noise; sampling turns pure noise into data step by step, steered by **classifier-free guidance**; **latent diffusion** makes it fast.
:::
