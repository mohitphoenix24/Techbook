---
title: Vision-Language Models — How Models See
level: intermediate
time: 45
summary: How an LLM reads images. Patches and vision transformers, the projector that turns image features into "tokens", CLIP-style contrastive pretraining, the LLaVA recipe and natively multimodal models, resolution and token cost, what VLMs do well (OCR, charts, screenshots, documents) and where they fail (counting, precise localisation, fine detail), prompting and evaluation. With runnable patchification, token-cost and contrastive-loss demos.
---

When you send an image to a modern assistant, it does not "see" pixels the way you do. The picture is converted into a sequence of **vectors that look like tokens** to the language model, which then reasons over them together with your text. Understanding that pipeline explains both the power and the quirks of vision-language models (VLMs).

## The architecture in four pieces

```viz algo=arch title="A typical vision-language model" dir=down
img   Image | pixels [image] @0,1
vit   Vision encoder (ViT) | patches to features [embed] @1,1
proj  Projector | maps features into the LLM's token space [filter] @2,1
txt   Text prompt | tokenised [prompt] @2,0
llm   Language model | attends over image tokens + text tokens [llm] @3,1
out   Text answer [guard] @4,1
--
img -> vit
vit -> proj
proj -> llm : "image tokens"
txt -> llm
llm -> out
```

1. **Vision encoder**: usually a **Vision Transformer (ViT)** ([paper](https://arxiv.org/abs/2010.11929)) pretrained to understand images (often with CLIP- or SigLIP-style contrastive training).
2. **Patchification**: the image is cut into a grid of small patches (e.g. 14×14 or 16×16 pixels); each patch is flattened and linearly embedded: "an image is worth 16×16 words".
3. **Projector**: a small MLP (or cross-attention/resampler) maps visual features into the **same embedding space as the LLM's text tokens**.
4. **Language model**: sees `[image tokens] + [text tokens]` as one sequence and generates text.

```python run title="Patchify an image: how pixels become a token sequence" level=easy
import numpy as np

rng = np.random.default_rng(0)
H, W, C, P = 224, 224, 3, 16                      # image size, channels, patch size
image = rng.random((H, W, C))

patches = (image.reshape(H // P, P, W // P, P, C)         # split into a grid of P x P blocks
                .transpose(0, 2, 1, 3, 4)
                .reshape(-1, P * P * C))                   # flatten each block into one vector
print(f"{H}x{W} image with {P}x{P} patches -> {patches.shape[0]} patches, each a {patches.shape[1]}-number vector")

embed = rng.normal(size=(patches.shape[1], 768)) * 0.02     # a linear projection to the model width
tokens = patches @ embed
print("after the linear embedding:", tokens.shape, "= a sequence of", tokens.shape[0], "'visual tokens' of width", tokens.shape[1])
```

## Resolution and token cost

The number of visual tokens grows with image area. A 224×224 image with 16×16 patches gives 196 tokens; a 1344×896 screenshot gives thousands. Models handle this in different ways:

- **Fixed resize** (simple; loses detail on large or tall images).
- **Tiling / "any resolution"**: split a large image into tiles plus a downscaled overview and encode each (more tokens, better detail; used by LLaVA-NeXT-style models).
- **Native resolution with 2-D position embeddings** (Qwen-VL, Pixtral-style): variable token count per image.
- **Token compression/pooling**: merge neighbouring patches to cut cost.

For APIs, this is why image **cost scales with pixels** (earlier lesson), and why **cropping to the region that matters** is the best optimisation.

```python run title="Visual token counts for different images and strategies" level=intermediate
import math

def tokens_fixed(h, w, patch=14, max_side=448):
    s = min(1.0, max_side / max(h, w)); h2, w2 = int(h * s), int(w * s)
    return math.ceil(h2 / patch) * math.ceil(w2 / patch)

def tokens_tiled(h, w, tile=448, patch=14, merge=2):
    tiles = math.ceil(h / tile) * math.ceil(w / tile)
    per_tile = (tile // patch // merge) ** 2                              # 2x2 patch merging reduces tokens 4x
    return (tiles + 1) * per_tile                                         # + one low-res overview image

for name, (h, w) in {"thumbnail 256x256": (256, 256), "phone photo 4032x3024": (4032, 3024), "screenshot 1920x1080": (1920, 1080), "A4 scan 1654x2339": (1654, 2339)}.items():
    print(f"{name:24} fixed-resize {tokens_fixed(h, w):>5} tokens | tiled {tokens_tiled(h, w):>6} tokens")
```

## Training: from CLIP to chat

**CLIP** ([paper](https://arxiv.org/abs/2103.00020)) trains an image encoder and a text encoder with a **contrastive loss** on hundreds of millions of image–caption pairs: matching pairs are pulled together, mismatched ones pushed apart. The resulting image embeddings carry rich semantic information and became the standard "eyes" for VLMs.

```python run title="The contrastive (InfoNCE) loss behind CLIP, on a toy batch" level=advanced
import numpy as np

rng = np.random.default_rng(0)
B, D = 6, 16
concepts = rng.normal(size=(B, D))                                  # 6 underlying "things" (dog, car, ...)
img = concepts + 0.3 * rng.normal(size=(B, D))                      # image embeddings of each thing
txt = concepts + 0.3 * rng.normal(size=(B, D))                      # caption embeddings of each thing
unit = lambda x: x / np.linalg.norm(x, axis=1, keepdims=True)
img, txt = unit(img), unit(txt)

def clip_loss(img, txt, temperature=0.07):
    logits = img @ txt.T / temperature                              # (B, B): similarity of every image with every caption
    def ce(l): l = l - l.max(1, keepdims=True); return -np.mean(np.diag(l - np.log(np.exp(l).sum(1, keepdims=True))))
    return (ce(logits) + ce(logits.T)) / 2                          # image->text and text->image

print("loss with matching pairs aligned :", round(float(clip_loss(img, txt)), 3))
shuffled = txt[rng.permutation(B)]
print("loss with captions shuffled      :", round(float(clip_loss(img, shuffled)), 3), "(much higher)")
sims = img @ txt.T
print("zero-shot classification of image 0 among 6 captions ->", int(sims[0].argmax()), "(correct = 0)")
```

The **LLaVA recipe** ([Visual Instruction Tuning](https://arxiv.org/abs/2304.08485)): connect a pretrained vision encoder to a pretrained LLM with a small projector; first train the projector on image–caption pairs (alignment), then **fine-tune on visual instruction data** (conversations about images, often synthesised by a strong model). Today's frontier models are **natively multimodal**: trained on interleaved text, images (and audio/video) from early in pretraining, rather than bolted together afterwards, which improves grounding and OCR.

## What VLMs are good at

- **OCR and reading screenshots**: UI text, receipts, signs, handwriting (varying quality).
- **Documents and charts**: tables, forms, plots, slides, diagrams (often better than classic OCR on messy layouts).
- **Describing and reasoning about scenes**: what is happening, what is unusual, comparing images.
- **Visual question answering and extraction** to structured output (JSON).
- **Code from screenshots/designs** and UI understanding (basis for computer-use agents).
- **Multi-image reasoning**: before/after, diffs, sequences.

## Where they fail (design around these)

| Weakness | Why | Mitigation |
|---|---|---|
| **Counting** many objects | tokens do not preserve exact instances | ask for lists with locations; use a detection model for counts |
| **Precise localisation** (exact pixel coordinates) | coordinates are not natural to language models | use models trained for grounding or a detector; verify visually |
| **Small text and fine detail** | downscaling and patch size | crop/zoom to the region; send higher resolution |
| **Spatial relations** (left/right, above) in complex scenes | weak geometric reasoning | simplify the question; add markers; verify |
| **Hallucinated details** | the language prior fills gaps | ask for evidence ("quote the text you see"); allow "can't tell" |
| **Rotated, upside-down or low-quality images** | training distribution | preprocess (deskew, rotate, enhance) |
| **Charts with dense data** | reading values precisely is hard | extract the underlying data when possible |
| **Sensitive content and people identification** | policy and privacy | follow provider rules; do not use for identifying people |

## Prompting for vision

- Put the **image before the text**; label multiple images ("Image 1, Image 2").
- **Be specific** about what to look at; give the task and the output format.
- **Ask for grounded answers**: quote visible text, list the evidence, say "unreadable" when unsure.
- For documents: ask for **structured output** and **verify** totals and cross-field consistency in code.
- For small details: **crop and zoom**, or send a second pass for the region of interest.
- For counting: ask the model to **enumerate** items, then count the list.
- Use **high-detail/high-resolution** settings where the API offers them, and weigh the token cost.

## Evaluating vision features

Build an eval set of **real images with ground truth** (extracted fields, correct answers, reference descriptions), including **hard cases** (blur, rotation, glare, odd layouts). Score extraction with field-level exact match or tolerance, VQA with exact/fuzzy match or a calibrated judge, and track failure modes by image type. Public benchmarks (MMMU, DocVQA, ChartQA, MathVista, ScreenSpot) are useful for shortlisting, with the usual caveats.

```quiz
? What does the projector do in a VLM?
+ Maps vision-encoder features into the language model's token embedding space
- Generates the text answer
- Resizes the image
> It makes image features look like tokens to the LLM.

? Why does image cost grow with resolution?
+ More pixels produce more patches, hence more visual tokens for the model to process
- Images are stored uncompressed
- Colour channels cost extra
> Crop and resize to what you need.

? Which is a known VLM weakness?
+ Counting many objects and giving exact pixel coordinates
- Reading large printed text
- Describing a scene in words
> Use detectors or structured workflows for counting and localisation.

? What is a good way to reduce hallucinated details in image answers?
+ Ask for quoted evidence, allow "unreadable/unclear", and verify with code or a second look at a crop
- Ask for longer answers
- Lower the image resolution
> Ground answers in visible evidence.
```

:::problem A user uploads a photo of a crowded whiteboard and asks the assistant to extract all action items. Describe a robust pipeline. {level=medium tags="vision,pipeline"}
Address resolution, structure and verification.

:::solution Model answer
Preprocess: auto-rotate/deskew, enhance contrast, and **tile or crop** the board into overlapping regions so small handwriting is legible at the model's resolution (keep a downscaled overview for context). For each tile, ask the VLM to **transcribe text verbatim** (with "[illegible]" markers), then run a second text-only step to merge tiles, remove duplicates from overlaps, and extract **action items to a schema** (owner, task, due date, source quote). Have the model **quote the source text** for each item, flag low-confidence items for user confirmation, and show the user the image regions they came from. Evaluate on a labelled set of boards for item-level precision and recall.
:::
:::

:::keypoints
- A VLM = vision encoder (ViT on patches) + projector + LLM: image patches become visual tokens processed with the text.
- Cost and detail depend on resolution: fixed resize, tiling or native-resolution strategies; crop to what matters.
- CLIP-style contrastive pretraining aligns images and text; LLaVA-style instruction tuning (and native multimodal pretraining) enable chat about images.
- Strengths: OCR, documents, charts, screenshots, scene reasoning; weaknesses: counting, exact localisation, tiny text, spatial relations, hallucinated detail.
- Prompt with image first, be specific, demand evidence, use structured output with verification, crop and zoom, and build real-image evals.
:::

:::resources
- [An Image is Worth 16x16 Words (ViT)](https://arxiv.org/abs/2010.11929) — the vision transformer.
- [CLIP](https://arxiv.org/abs/2103.00020) and [Visual Instruction Tuning (LLaVA)](https://arxiv.org/abs/2304.08485) — contrastive pretraining and the VLM recipe.
- [Claude docs: Vision](https://docs.claude.com/en/docs/build-with-claude/vision) — formats, sizing and tips.
- [Hugging Face LLM Course](https://huggingface.co/learn/llm-course) and [Hugging Face Cookbook](https://huggingface.co/learn/cookbook) — multimodal recipes.
- [ColPali](https://arxiv.org/abs/2407.01449) — VLM-based document retrieval.
- [Hugging Face blog](https://huggingface.co/blog) — search for "vision language models explained".
:::
