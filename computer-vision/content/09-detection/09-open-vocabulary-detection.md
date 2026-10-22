---
title: Open-Vocabulary and Promptable Detection
level: advanced
time: 40
summary: Detect things you never trained on, by describing them in words. How CLIP-style region-text matching works, OWL-ViT, GLIP and Grounding DINO, YOLO-World, a toy matcher you can run, and where open-vocabulary detectors fail.
---

A normal detector knows a **fixed list of classes** (80 for COCO). To add "forklift" you need labelled boxes of forklifts and retraining. **Open-vocabulary detection** (OVD) takes a **text prompt** ("a forklift", "red hard hat", "person holding a phone") and finds matching objects, with **no new training data**. It connects detection to language models and is one of the most important recent changes for practical vision.

## The key idea: classify by similarity to text

Replace the fixed classification layer (a matrix with one row per class) with **text embeddings**. A model like **CLIP** has an image encoder and a text encoder trained so that a picture and its caption land close together in the same embedding space. To classify a region:

1. Compute an **embedding of the region** (from the image).
2. Compute embeddings of the **class names** as text (for example "a photo of a forklift").
3. Pick the class whose text embedding has the highest **cosine similarity** with the region embedding.

Adding a class means writing a new text string. No retraining.

:::flow Open-vocabulary detection, generically
Image encoder | A vision backbone (often a ViT) produces features for the image, region by region.
Text encoder | A language model (CLIP text tower, BERT) turns each class name or phrase into a vector.
Region proposals / queries | The detector produces boxes (from a DETR-style head or a dense head) with a region embedding each.
Alignment | The classification score of a box for a prompt is the similarity between the region embedding and the text embedding.
Training | Large data: detection datasets plus image-text pairs or grounding data (boxes tied to phrases), including pseudo-labels from captions.
Inference | Type any prompts; get boxes with scores for each.
:::

## A toy version you can run

Real models need big networks. The next block shows the **mechanism** with made-up vectors: each concept is a combination of attributes, "region embeddings" are noisy versions of their concept, and text prompts are matched by cosine similarity, including a class the "detector" **never saw during training**.

```python run title="Zero-shot classification of regions by text similarity (toy embeddings)" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
attributes = ["vehicle", "animal", "wheels", "legs", "metal", "fur", "yellow", "big", "indoor", "tool"]
concepts = {                                          # each concept = a mix of attributes (a stand-in for a learned text embedding)
    "car":       dict(vehicle=1, wheels=1, metal=1, big=1),
    "dog":       dict(animal=1, legs=1, fur=1),
    "forklift":  dict(vehicle=1, wheels=1, metal=1, yellow=1, tool=0.5),      # a class the detector was never trained on
    "hammer":    dict(tool=1, metal=1),
    "bicycle":   dict(vehicle=1, wheels=1, metal=0.5),
}
def embed(d):
    v = np.array([d.get(a, 0.0) for a in attributes]); return v / np.linalg.norm(v)
text = {k: embed(v) for k, v in concepts.items()}

# "region embeddings": noisy versions of the true concept (what an image encoder would produce for each box)
regions = [("car", text["car"]), ("dog", text["dog"]), ("forklift", text["forklift"]), ("hammer", text["hammer"])]
regions = [(name, e + rng.normal(0, 0.12, e.shape)) for name, e in regions]
regions = [(n, e / np.linalg.norm(e)) for n, e in regions]

def classify(region, prompts):
    sims = {p: float(region @ text[p]) for p in prompts}
    best = max(sims, key=sims.get)
    return best, sims[best]

print("closed vocabulary (the detector was trained on car, dog, hammer):")
for name, e in regions:
    print(f"  true {name:9s} -> predicted {classify(e, ['car', 'dog', 'hammer'])[0]}")
print("open vocabulary (we simply add the word 'forklift' to the prompt list):")
for name, e in regions:
    pred, s = classify(e, ["car", "dog", "hammer", "forklift", "bicycle"])
    print(f"  true {name:9s} -> predicted {pred:9s} (similarity {s:.2f})")
```

With a closed list, the forklift is wrongly called a "car" (the nearest known class). Adding "forklift" to the prompts fixes it **without retraining**. In a real model the embeddings are learned from hundreds of millions of image-text pairs, which is what makes them meaningful.

## The main models

| Model | Idea |
|---|---|
| **OVR-CNN, ViLD, RegionCLIP** | Distil CLIP's knowledge into a detector's region classifier; train the box part on base classes, align regions to CLIP text |
| **OWL-ViT / OWLv2** (Google) | A ViT trained with CLIP-style contrastive pre-training, then fine-tuned on detection: each output token predicts a box and an embedding matched to text **or to an example image** ("find things like this crop") |
| **GLIP** | Reformulate detection as **phrase grounding**: align image regions with words in a sentence; trained on grounding data |
| **Grounding DINO** | A DINO (DETR-style) detector with deep **text-image fusion**; accepts free-form text ("the red cup on the left"); very popular for zero-shot boxes and auto-labelling |
| **YOLO-World** | A YOLO detector with a **re-parameterisable text** branch: you type the vocabulary once, and then it runs at real-time speed with the prompts baked into the classifier |
| **Florence-2, PaliGemma, Qwen-VL** | Multimodal language models that output boxes as text tokens |
| **SAM + Grounding DINO** ("Grounded SAM") | Text prompt → boxes (Grounding DINO) → masks (SAM): open-vocabulary segmentation |

## Using them well

- **Prompt wording matters.** "a photo of a {class}" often works better than the bare word; add attributes ("yellow forklift") and try synonyms. Evaluate several prompt templates and **ensemble** them.
- **Threshold per use case.** Scores from different prompts are not calibrated against each other; tune on a small labelled set.
- **Open vocabulary is not magic.** Performance on rare or fine-grained classes (a specific bolt type, a medical finding) can be weak; the model has seen less of them.
- **Counting and spatial relations** ("the second from the left") are still unreliable.
- **Use them to label data.** A common workflow: Grounding DINO / OWL-ViT **auto-labels** images, a person **corrects** the boxes, and a small **closed-set YOLO** model is trained on the result for fast, cheap, reliable deployment (**distillation by pseudo-labelling**).
- **Latency**: the big models are slow (hundreds of ms on a GPU), except YOLO-World-style designs.

## Example-based ("image-conditioned") detection

Instead of a text prompt you can supply an **example crop** ("find more objects that look like this"). OWL-ViT supports it, and so do few-shot detectors (DE-ViT, DINOv2-based matching). This is useful when the object is hard to describe in words (a particular part). A simple version of the same idea: take **DINOv2 patch features** of the example and find image patches with high cosine similarity, a trick you can build in a few lines once you have the features.

:::interview Questions you may get
- "What is open-vocabulary object detection?" Detecting classes specified at test time by text prompts, using a shared image-text embedding space rather than a fixed classifier.
- "How does it classify a box?" Compare the region embedding with the text embedding of the class names (cosine similarity), usually after a CLIP-like alignment.
- "How is Grounding DINO different from CLIP-based classification?" It fuses text and image deeply inside a DETR-style detector for phrase grounding, giving better localisation with language.
- "How would you use it in production?" Auto-label data with it, review, then train a small closed-set detector; or use YOLO-World when the vocabulary is fixed but changes now and then.
- "What are its failure modes?" Rare or fine-grained concepts, prompt sensitivity, uncalibrated scores, spatial relations and counting, and latency of big models.
:::

```quiz
? What replaces the fixed classifier layer in an open-vocabulary detector?
+ Similarity between region embeddings and text embeddings
- A bigger softmax
- Anchors
> New classes are added by writing new text.

? How can open-vocabulary models help build a normal fast detector?
+ Auto-label images, correct them, and train a small closed-set model on the labels
- By running them on the edge device always
- By removing the need for any data
> This distils their knowledge into an efficient model.

? What is "Grounded SAM"?
+ A text-prompted pipeline: Grounding DINO gives boxes, SAM turns them into masks
- A new camera
- A loss function
> Open-vocabulary segmentation.

? Which is a typical weakness of open-vocabulary detectors?
+ Fine-grained or rare concepts, and uncalibrated scores across prompts
- They cannot detect cars
- They need exact class lists
> Always validate on your own labelled sample.
```

:::problem A warehouse wants to detect 200 product types that change every month. Compare training a closed-set detector against an open-vocabulary approach. {level=medium tags="open-vocabulary,design,products"}
Think about maintenance, accuracy and cost.

:::solution Model answer
A closed-set detector needs labelled boxes for every new product and retraining each month: high accuracy once trained, fast at run time, but a heavy labelling and maintenance load. An open-vocabulary model works from names or example images with no new labels, so it handles new products immediately, but accuracy on fine-grained products (similar packaging) is lower, scores need calibration, and big models are slow. A good hybrid: use the open-vocabulary model (with image exemplars) to propose and pre-label boxes, have staff correct a small sample, and fine-tune a compact detector or a classifier on crops for the products that matter most; evaluate on a held-out set of new products to see the zero-shot floor.
:::
:::

:::keypoints
- Open-vocabulary detection classifies boxes by cosine similarity between region embeddings and text embeddings (CLIP-style), so new classes need only new words.
- Models: ViLD/RegionCLIP, OWL-ViT/OWLv2, GLIP, Grounding DINO, YOLO-World; Grounded SAM adds masks.
- Prompt wording and thresholds matter; rare and fine-grained concepts, counting and relations are weak.
- A strong workflow: auto-label with an open-vocabulary model, review, distil into a small closed-set detector.
:::

:::resources
- [Minderer et al.: Simple Open-Vocabulary Object Detection with Vision Transformers (OWL-ViT)](https://arxiv.org/abs/2205.06230) — text or image prompts.
- [Liu et al.: Grounding DINO](https://arxiv.org/abs/2303.05499) — open-set detection with language.
- [Cheng et al.: YOLO-World: Real-Time Open-Vocabulary Object Detection](https://arxiv.org/abs/2401.17270) — fast OVD.
- [Radford et al.: CLIP](https://arxiv.org/abs/2103.00020) — the embedding model behind it all.
:::
