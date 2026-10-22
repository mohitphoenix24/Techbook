---
title: CLIP, SigLIP and Zero-Shot Recognition
level: advanced
time: 50
summary: Learn images and text together. The CLIP dual encoder and its symmetric contrastive loss, zero-shot classification with prompts, prompt ensembling, retrieval, SigLIP's sigmoid loss, limitations, and a worked NumPy demo of the whole idea.
---

Before CLIP, a classifier knew a fixed list of classes (the 1000 of ImageNet). **CLIP** (OpenAI, 2021) learned from **400 million image–text pairs scraped from the internet** so that you can describe the classes **in words at test time**: *"a photo of a forklift"*. No training on your classes at all: **zero-shot**.

## The dual encoder

Two networks, one for each kind of input, both producing a vector in the **same shared space**:

:::flow CLIP
Image encoder | A ViT (or ResNet) turns the image into a vector `v`.
Text encoder | A transformer turns the caption into a vector `t`.
Normalise | Both vectors are scaled to length 1, so a dot product is the cosine similarity.
Contrastive training | In a batch of N pairs, the N matching pairs should have high similarity, and the N² − N mismatched pairs low. Done in both directions (image→text and text→image).
:::

For a batch the similarity matrix is `S = V Tᵀ / τ` (N × N, a **learned** temperature τ). The correct answer for row *i* is column *i*, so the loss is **cross-entropy over rows and columns**, averaged. This is the same InfoNCE idea as in the last lesson, but the two "views" are an image and its caption.

```python run title="CLIP loss and zero-shot classification from scratch" level=advanced shared
import numpy as np

rng = np.random.default_rng(0)
classes = ["cat", "dog", "car", "forklift", "pallet", "robot arm"]
D = 24
concept = rng.normal(0, 1, (len(classes), D))                      # an idealised "meaning" vector per class

def norm(x): return x / np.linalg.norm(x, axis=-1, keepdims=True)
def fake_image_embed(c, n, noise=1.0):                             # images of class c: the meaning plus visual variation
    return norm(concept[c] + rng.normal(0, noise, (n, D)))
def fake_text_embed(c, noise=0.5):                                 # a caption of class c: the meaning plus wording variation
    return norm(concept[c] + rng.normal(0, noise, D))

# --- training loss on a batch of matching (image, caption) pairs
labels = rng.integers(0, len(classes), 32)
V = np.vstack([fake_image_embed(c, 1) for c in labels]); T = np.vstack([fake_text_embed(c) for c in labels])
def clip_loss(V, T, tau=0.07):
    S = V @ T.T / tau
    def ce_rows(S):
        S = S - S.max(1, keepdims=True); return -np.mean(np.diag(S - np.log(np.exp(S).sum(1, keepdims=True))))
    return (ce_rows(S) + ce_rows(S.T)) / 2                         # image->text and text->image, averaged
print("batch loss with matched pairs:", round(float(clip_loss(V, T)), 3), " | with shuffled captions:", round(float(clip_loss(V, T[rng.permutation(32)])), 3))
print("(two different images of the same class in a batch are false negatives; real training lives with this noise)")

# --- zero-shot classification: compare the image with a text embedding for each class prompt
test_labels = rng.integers(0, len(classes), 300)
Vt = np.vstack([fake_image_embed(c, 1) for c in test_labels])
prompts = np.vstack([fake_text_embed(c) for c in range(len(classes))])          # "a photo of a {class}"
pred = (Vt @ prompts.T).argmax(1)
print("zero-shot accuracy with one prompt per class:", round(float((pred == test_labels).mean()), 3))

# --- prompt ensembling: average several wordings per class
ens = norm(np.stack([np.vstack([fake_text_embed(c, 1.8) for c in range(len(classes))]) for _ in range(8)]).mean(0))
single = norm(np.vstack([fake_text_embed(c, 1.8) for c in range(len(classes))]))
print("noisy single prompt:", round(float(((Vt @ single.T).argmax(1) == test_labels).mean()), 3), "| ensemble of 8 prompts:", round(float(((Vt @ ens.T).argmax(1) == test_labels).mean()), 3))
```

## Zero-shot classification in practice

1. Write **prompts** for each class: `"a photo of a {class}."` (CLIP found this beats the bare class name; for special domains: `"a satellite photo of {class}"`, `"a thermal image of a {class}"`).
2. Encode all prompts once, **average several templates** per class (**prompt ensembling**), normalise.
3. Encode the image, take cosine similarity with every class vector, **softmax** (times the learned scale) for probabilities.

```python
# Sketch with the open-source OpenCLIP library (needs a download; not run in this course)
import torch, open_clip
model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
tokenizer = open_clip.get_tokenizer("ViT-B-32")
text = tokenizer([f"a photo of a {c}" for c in ["forklift", "pallet", "person"]])
with torch.no_grad():
    image_features = model.encode_image(preprocess(image).unsqueeze(0))
    text_features = model.encode_text(text)
    image_features /= image_features.norm(dim=-1, keepdim=True)
    text_features /= text_features.norm(dim=-1, keepdim=True)
    probs = (100.0 * image_features @ text_features.T).softmax(dim=-1)
```

## What else CLIP gives you

- **Image retrieval by text** and the reverse: embed all images once, search with a text query using a vector index (FAISS).
- **A frozen visual backbone** for linear probes and few-shot learning.
- **Zero-shot detection/segmentation** by plugging CLIP into detectors and segmenters (OWL-ViT, Grounding DINO, CLIPSeg).
- **Text-to-image conditioning**: the text encoder of CLIP (or similar) guides Stable Diffusion.
- **Filtering and de-duplicating** large web datasets (LAION).

## Better recipes

| Model | Change |
|---|---|
| **OpenCLIP** | Open-source training on LAION-2B; many sizes |
| **SigLIP** | Replaces the softmax over the batch with an independent **sigmoid loss** per pair (a yes/no for each image–text pair). Works with smaller or larger batches and scales better, used in PaliGemma and many VLMs |
| **EVA-CLIP, MetaCLIP** | Better initialisation, data curation |
| **ALIGN** | Same idea with noisy alt-text at 1.8 B scale |
| **LiT** | Freeze a strong pre-trained image tower, train only the text tower |
| **CoCa** | Contrastive loss plus a captioning loss |

## Limits you must know

- **Counting, spatial relations, fine-grained detail** (left of, 3 apples) are weak: the global embedding blurs them.
- **Bag-of-words behaviour**: "a horse eating grass" vs "grass eating a horse" score similarly (see the Winoground benchmark).
- **Prompt sensitivity**: wording changes accuracy; always validate prompts on labelled data.
- **Fine-grained and specialised domains** (medical, industrial defects) can be near chance zero-shot: use a few labels and a linear probe or fine-tune.
- **Bias** from web data; **text in images** can fool it (typographic attacks: a sticker "iPod" on an apple).
- **Calibration**: softmax over your listed classes always sums to 1, even if none of them is in the image. Add a "none of these" class or threshold the raw cosine similarity.
- Fixed **224–384 px** inputs and **77 text tokens**.

:::interview Questions you may get
- "How does CLIP work?" Dual encoders trained with a symmetric contrastive loss on 400 M image–text pairs so matched pairs have the highest cosine similarity in a shared space.
- "How do you do zero-shot classification with CLIP?" Encode prompts per class, average templates, compare with the image embedding, softmax over classes.
- "Why does zero-shot CLIP fail on your factory defects?" Domain not in web data, fine-grained differences, prompt choice; fix with a few-shot linear probe, fine-tuning or a domain-specific model.
- "What is SigLIP's difference?" A pairwise sigmoid loss rather than a batch-wide softmax, removing the need for global normalisation and scaling better with batch size.
- "How would you build text search over 10 million images?" Embed with CLIP/SigLIP, index with FAISS/HNSW, search with the text embedding, rerank.
:::

```quiz
? What is CLIP trained to do?
+ Make the embedding of a matching image–text pair more similar than non-matching pairs
- Generate captions for images
- Classify the 1000 ImageNet classes
> Contrastive alignment of two encoders.

? Why average several prompt templates per class?
+ It reduces sensitivity to wording and usually raises accuracy
- It makes the model smaller
- It is required by the loss
> Prompt ensembling.

? What is a known weakness of CLIP?
+ Counting and spatial relations ("left of", "three apples")
- It cannot recognise cats
- It requires labelled data
> The global embedding loses such detail.

? How does SigLIP differ from CLIP?
+ It uses a sigmoid loss on each pair instead of a softmax across the batch
- It uses only images
- It has no text encoder
> Easier to scale and less batch-dependent.
```

:::problem Your CLIP zero-shot classifier says "forklift" for every image with a yellow object, even a yellow bin. List three ways to fix it without collecting thousands of labels. {level=medium tags="clip,prompts,few-shot"}
Think about prompts, calibration and adaptation.

:::solution Model answer
(1) Improve prompts and add hard negative class names ("a yellow storage bin", "a yellow pallet jack"), using an ensemble of templates, and validate on a small labelled set. (2) Calibrate: use a "background/other" class or threshold on the raw similarity rather than forcing a softmax over the listed classes. (3) Few-shot adaptation: with 10–50 labelled images per class, train a logistic-regression head on the frozen embeddings (or mix text and image prototypes, e.g. Tip-Adapter / WiSE-FT), which fixes domain-specific confusions cheaply. Optionally crop the object with a detector first so that the colour of the background does not dominate.
:::
:::

:::keypoints
- CLIP = image encoder + text encoder in one normalised space, trained with a symmetric contrastive loss on hundreds of millions of image–text pairs.
- Zero-shot classification compares the image embedding with prompt embeddings; ensemble templates and add "other" for open sets.
- SigLIP uses a pairwise sigmoid loss; OpenCLIP/EVA-CLIP/MetaCLIP are strong open recipes.
- Weak on counting, relations, fine detail and specialised domains; adapt with linear probes or fine-tuning.
:::

:::resources
- [Radford et al.: Learning Transferable Visual Models From Natural Language Supervision (CLIP)](https://arxiv.org/abs/2103.00020) — the paper.
- [Zhai et al.: Sigmoid Loss for Language Image Pre-Training (SigLIP)](https://arxiv.org/abs/2303.15343) — the sigmoid loss.
- [OpenCLIP on GitHub](https://github.com/mlfoundations/open_clip) — open-source training and models.
:::
