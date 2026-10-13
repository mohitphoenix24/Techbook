---
title: Video, Music and Audio Generation
level: advanced
time: 40
summary: How generative models extend to time. Video diffusion transformers over spacetime latents, why temporal consistency and cost are hard, image-to-video, controllability and editing, audio and music generation (codec language models and diffusion), sound effects, 3D and world models, evaluation, and the provenance and misuse issues unique to realistic synthetic media. With runnable cost and token calculators for video.
---

If images are diffusion over a 2-D grid of latents, **video** is diffusion over a 3-D block (height × width × time), and **audio** is diffusion or language modelling over a 1-D signal with extreme temporal resolution. The ideas carry over; the **costs and consistency problems** explode. This lesson maps the landscape so you know what is feasible, expensive, or still unreliable.

## Video generation

### How it works

Most current video generators are **latent diffusion (or flow) models with Transformer backbones** that operate on **spacetime patches**:

1. A **video VAE** compresses frames spatially and temporally into a latent video (for example 8× spatial and 4–8× temporal compression).
2. The latent is cut into **spacetime patches** ("tokens"), and a **Diffusion Transformer** attends over them, conditioned on text (and optionally an image, audio, camera path or reference clips).
3. Sampling denoises the whole clip jointly (or chunk by chunk), then the VAE decoder renders frames.

OpenAI's Sora report popularised the "video as patches" view; many open and closed systems (Google's Veo, Runway, Kling, Luma, Pika, Wan, HunyuanVideo, LTX-Video and others) follow variants of it.

```python run title="How big is a video? Latent size and token count" level=intermediate
def video_tokens(frames, height, width, vae_spatial=8, vae_temporal=4, patch=2):
    lat_t = (frames - 1) // vae_temporal + 1                                    # temporal compression (first frame kept)
    lat_h, lat_w = height // vae_spatial, width // vae_spatial                  # spatial compression
    return lat_t * (lat_h // patch) * (lat_w // patch)                          # transformer tokens after spacetime patching

clips = {"image 1024x1024": (1, 1024, 1024), "2 s @16fps, 480p": (32, 480, 832), "5 s @24fps, 720p": (120, 720, 1280), "10 s @24fps, 1080p": (240, 1080, 1920)}
print(f"{'clip':>22} {'frames':>7} {'DiT tokens':>11} {'attention pairs':>16}")
for name, (frames, h, w) in clips.items():
    tokens = video_tokens(frames, h, w)
    print(f"{name:>22} {frames:>7} {tokens:>11,} {tokens ** 2:>16.2e}")
print("\nfull attention is quadratic in tokens, which is why video models use factorised/windowed attention and heavy compression")
```

### Why video is hard

| Challenge | Why |
|---|---|
| **Cost** | tens to hundreds of thousands of tokens per clip; many denoising steps; minutes of GPU time per few seconds of video |
| **Temporal consistency** | objects must keep identity, shape, lighting and physics across frames; flicker and morphing are common failures |
| **Motion and physics** | models learn visual plausibility, not true physics: impossible interactions, objects passing through each other |
| **Long duration** | quality and coherence degrade over longer clips; typical outputs are seconds, extended by chaining/continuation |
| **Control** | text alone is imprecise: users need camera paths, first/last frames, reference images, motion brushes, pose and depth control |
| **Text, hands and fine detail** | persistent weak spots |
| **Audio** | joint audio-video generation (dialogue, sound effects) is emerging; many systems generate silent video |
| **Data and licensing** | huge, legally sensitive training sets |

### Modes you will see

- **Text-to-video**, **image-to-video** (animate a still: usually more controllable), **video-to-video** (restyle/edit), **first/last-frame interpolation**, **reference-based generation** (keep a character/product consistent), **camera control**, **extension/continuation**, **inpainting** and **lip-sync/dubbing**.
- **World models / interactive video** (generating explorable environments from actions) are an active frontier.

### Using video generation in products

Treat it as a **creative tool with a generate-review-iterate loop**, not a deterministic function: generate several candidates (seeds), have a human or automatic check pick, and use image-to-video from a controlled keyframe for consistency. Budget **time and money per clip** (API pricing is per second of output; open models need big GPUs), cache results, and design UX for **waiting** (asynchronous jobs, previews, notifications).

## Audio and music generation

| Task | Approach |
|---|---|
| **Speech** | previous lesson (TTS, voice conversion) |
| **Music** | **codec language models** (MusicGen: an LLM over discrete audio tokens from a neural codec such as EnCodec) or **latent diffusion** (Stable Audio and others); conditioned on text, melody, lyrics, style; commercial systems such as Suno and Udio produce full songs with vocals |
| **Sound effects / foley** | text-to-audio diffusion or LMs (AudioLDM, Stable Audio, newer video-to-audio models that sync sounds to video) |
| **Audio editing and enhancement** | denoising, separation (stems), inpainting, super-resolution, voice isolation |
| **Speech-to-speech translation and dubbing** | ASR + translation + TTS with voice preservation, or end-to-end models |

Under the hood, **neural audio codecs** (SoundStream, EnCodec, DAC, SNAC) compress waveforms into streams of discrete tokens at a few hundred tokens per second, so audio becomes a "language" LLMs can model; the codec decoder renders sound. Raw audio has 16–48K samples per second, which is why direct modelling is impractical.

```python run title="Why codecs matter: tokens per second of audio" level=easy
raw_rate = 24_000                                         # samples per second at 24 kHz
for name, tokens_per_sec, codebooks in (("speech codec (low rate)", 75, 1), ("music codec (EnCodec-style)", 75, 4), ("high-quality music codec", 86, 9)):
    total = tokens_per_sec * codebooks
    print(f"{name:30} {total:>4} tokens/s  ({raw_rate / total:>5.0f}x fewer symbols than raw samples)")
minutes = 3
print(f"\na 3-minute song at 300 tokens/s = {int(300 * 60 * minutes):,} tokens: long, but within reach of long-context models")
```

## 3D, scenes and other modalities

**Text/image-to-3D** (mesh or Gaussian-splat generation), **novel-view synthesis** (NeRF and 3D Gaussian Splatting reconstruct scenes from photos), **motion generation** for animation, **CAD and code-based generation** (an LLM writes OpenSCAD/Blender scripts: often more controllable), **protein and molecule generation** (diffusion/flow models in science). The common theme: choose the **representation** (pixels, latents, tokens, code) that makes the target easiest to generate and verify.

## Evaluation

| Dimension | Methods |
|---|---|
| **Visual quality** | FVD/FID-style distribution metrics (weakly correlated), human ratings |
| **Text/prompt alignment** | CLIP/VLM-based scoring, benchmark suites (VBench) |
| **Temporal consistency** | frame-to-frame similarity, identity preservation, flicker metrics |
| **Motion quality and physics** | targeted tests; human review |
| **Audio quality** | MOS (mean opinion score), FAD (Fréchet audio distance), CLAP alignment |
| **Music** | listener studies; musicality is hard to automate |
| **Product metrics** | acceptance rate, regenerations per kept clip, time-to-usable-asset, cost per accepted asset |

For products, the best metric is usually **cost and time per accepted output**, which captures reliability and the review loop together.

## Provenance, rights and misuse

Realistic synthetic video and voice enable **deepfakes, fraud, harassment and misinformation**, and raise **copyright, likeness and licensing** questions (training data, style imitation, voice/likeness rights, ownership of outputs). Practices:

- **Disclose and label** synthetic media; embed **provenance metadata** (C2PA content credentials) and **robust watermarks** (SynthID-style); check platform and legal requirements.
- **Consent and likeness**: never generate real people's likeness or voice without permission; block public-figure and minors misuse; strong **abuse monitoring**.
- **Policy filters** on prompts and outputs (violence, sexual content, impersonation).
- **Licensing**: use models and data with clear terms; keep records of prompts and settings for provenance.
- **Verification** culture: for important content, rely on **provenance at creation** rather than after-the-fact detection, which is unreliable.

```quiz
? Why is video generation so much more expensive than image generation?
+ A clip has far more latent tokens (space × time), attention scales quadratically, and sampling takes many steps
- Videos are stored in colour
- Video models have no text encoder
> Compression, windowed attention and distillation are used to tame it.

? What are neural audio codecs used for in music generation?
+ Turning audio into a stream of discrete tokens a language model can generate, then decoding it back to sound
- Compressing MP3 files for storage only
- Detecting copyright
> They make audio modelling tractable by drastically reducing the sequence length.

? What is a typical product-level success metric for generative video?
+ Cost and time per accepted clip (captures quality and the review loop)
- Number of frames
- Model parameter count
> Acceptance rate drives real economics.

? Why is provenance at creation preferred to AI-content detection?
+ Detectors are unreliable and easily evaded; signed provenance and watermarks are verifiable
- Detectors are always accurate
- Provenance is slower
> Build labelling and credentials into the generation pipeline.
```

:::problem A marketing team wants 30 short product videos per week using generative video. Describe a workflow, risk controls and how you would measure success. {level=medium tags="video,workflow"}
Be concrete about consistency and review.

:::solution Model answer
Workflow: write a **shot list**; generate **keyframes** with an image model (product-accurate via reference/LoRA), then **image-to-video** per shot for consistency, using several seeds; automatic checks (product visible, logo correct via VLM, no artefacts) plus **human review**; add voiceover/music (licensed or generated with clear terms), edit in a standard tool, and export with **provenance metadata and AI disclosure**. Controls: brand/likeness policy, prompt and output filters, licence tracking, approval gate before publishing, archive of prompts/settings. Metrics: accepted-clip rate, regenerations per kept clip, cost and hours per finished video, brand-compliance defects, engagement versus conventional videos.
:::
:::

:::keypoints
- Video models are latent diffusion/flow Transformers over spacetime patches; cost and token counts explode with duration and resolution.
- Hard problems: temporal consistency, physics, long duration, control, fine details, joint audio; image-to-video and keyframes improve control.
- Music and audio use neural codecs plus language models or diffusion; commercial tools generate full songs and sound effects.
- Evaluate with human review and benchmark suites; for products track cost and time per accepted output.
- Handle provenance (C2PA, watermarks), consent and likeness, policy filtering and licensing; rely on provenance at creation rather than detection.
:::

:::resources
- [Scalable Diffusion Models with Transformers (DiT)](https://arxiv.org/abs/2212.09748) — the backbone behind modern video generators.
- [Hugging Face Diffusers docs](https://huggingface.co/docs/diffusers) — video and image pipelines.
- [High-Resolution Image Synthesis with Latent Diffusion Models](https://arxiv.org/abs/2112.10752) — the latent-space idea extended to video.
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) — workflows for open video and image models.
- [C2PA (Content Credentials)](https://c2pa.org) — the provenance standard.
- [Hugging Face blog](https://huggingface.co/blog) — search for "video generation" and "audio generation" explainers.
:::
