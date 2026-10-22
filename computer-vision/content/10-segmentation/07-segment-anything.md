---
title: Segment Anything (SAM) and Promptable Segmentation
level: advanced
time: 50
summary: A foundation model for segmentation. The promptable task (points, boxes, masks, text via Grounded SAM), SAM's architecture (image encoder, prompt encoder, light mask decoder, three masks for ambiguity), the SA-1B data engine, SAM 2 for video, small variants, and a classic click-to-segment demo that shows what a prompt does.
---

Until 2023, a segmentation model knew **only the classes it was trained on**. **Segment Anything** (Kirillov et al., Meta AI, 2023) changed this: one model that segments **almost any object** in **any image** from a simple **prompt** (a click, a box, a rough mask), with no training on your data. It is to segmentation what GPT-style models are to language: a **foundation model**.

## The promptable segmentation task

The task SAM solves: *given an image and a prompt that says "this object" (a point, a box, a mask, or text), return a valid mask.*

- **Point prompts**: foreground points (inside the object) and background points (outside).
- **Box prompt**: a rough bounding box.
- **Mask prompt**: a low-resolution mask from before, to refine.
- **Text prompt**: not in the original SAM, but obtained by combining SAM with a text-to-box model: **Grounded SAM** (Grounding DINO gives boxes from words, SAM gives masks).

A single click is **ambiguous**: a click on a shirt may mean the shirt, the person, or the whole group. So SAM returns **three masks** (whole / part / sub-part) with a predicted quality score (IoU) for each, and the user picks one.

## Architecture: heavy once, light per prompt

:::flow SAM
Image encoder | A large Vision Transformer (ViT-H, MAE pre-trained; 632 M parameters) turns the 1024×1024 image into an image embedding (64×64×256). This is the expensive step (hundreds of ms on a GPU) and is done once per image.
Prompt encoder | Points and boxes become positional encodings plus learned embeddings; mask prompts pass through small convolutions; (text via CLIP in the paper's experiments). Very cheap.
Mask decoder | A small two-layer transformer decoder: prompt tokens and output tokens cross-attend with the image embedding; then upsample to get mask logits and predict an IoU score. About 50 ms in a browser on CPU.
Outputs | Three masks (multi-mask output for ambiguity) and a confidence per mask.
:::

Because the heavy encoder runs **once per image** and the decoder is light, you can click repeatedly and get **real-time** interactive segmentation (in the browser, even, with the embedding precomputed). **Automatic mask generation** prompts the model with a **grid of points** (32 × 32), filters the masks by predicted IoU and stability, and removes duplicates with NMS, giving "segment everything".

## How it was trained: the data engine

There were no billion-mask data sets, so the authors built one in three stages (a **data engine**):

1. **Assisted-manual**: annotators used an early SAM in an interactive tool, which sped up labelling.
2. **Semi-automatic**: SAM found confident objects, humans labelled the rest.
3. **Fully automatic**: SAM generated masks over a 32 × 32 grid of points on all images.

The result: **SA-1B**, **11 million licensed, privacy-respecting images with 1.1 billion masks** (99.1% generated automatically). Training uses prompt simulation: random points, boxes and masks sampled from the ground truth, with the loss being focal + dice on the best of the 3 predicted masks.

## SAM 2 (2024): video

**SAM 2** extends the idea to **video** (and images as one-frame videos). A **streaming memory** stores features and predictions of earlier frames; a **memory attention** module lets each new frame attend to the memory, so the mask **follows the object** through time, including occlusions (an occlusion head predicts when the object is not visible). You prompt on any frame and correct on any later frame. It was trained on the **SA-V** data set (about 51 thousand videos, 600 thousand "masklets"), is more accurate and faster than SAM on images, and powers interactive video object segmentation, tracking and annotation.

## Variants for speed and domains

| Model | Idea |
|---|---|
| **MobileSAM, EfficientSAM, EdgeSAM** | Distil the ViT-H encoder into a tiny encoder (5–10 M parameters): 10–50× faster, a few points less accurate |
| **FastSAM** | A YOLOv8-seg model trained on SA-1B subset: real-time "segment everything" |
| **HQ-SAM** | Sharper boundaries for thin structures |
| **MedSAM, SAM-Med2D/3D** | Fine-tuned for medical images |
| **SAM 2 / SAM 2.1** | Video, memory, better image quality |
| **Grounded SAM, SEEM, SAM-CLIP** | Text and multi-modal prompts |
| **Semantic-SAM, SAM 3** | Add concepts/semantics (promptable concept segmentation with text or exemplars) |

## Using SAM (a sketch; not run here)

```python
# pip install segment-anything torch   (+ a downloaded checkpoint, ~375 MB for ViT-B)
# This snippet follows the official README; it was not run in this course because it needs the checkpoint.
import numpy as np
from segment_anything import sam_model_registry, SamPredictor

sam = sam_model_registry["vit_b"](checkpoint="sam_vit_b_01ec64.pth").to("cuda")
predictor = SamPredictor(sam)
predictor.set_image(image_rgb)                               # the heavy step: computes the image embedding once

masks, scores, logits = predictor.predict(
    point_coords=np.array([[420, 310]]), point_labels=np.array([1]),       # one foreground click (label 1; background clicks use 0)
    multimask_output=True)                                    # three candidate masks for an ambiguous click
best = masks[np.argmax(scores)]                               # pick by the predicted quality

masks, _, _ = predictor.predict(box=np.array([100, 120, 380, 400]), multimask_output=False)   # a box prompt
```

## What a prompt does: a classic stand-in

SAM itself cannot run in this page. But the **interaction pattern** (draw a rough box, click inside the object, click on wrong regions to correct, watch the mask improve) existed before SAM as **interactive segmentation**, for example with GrabCut. Here, a deliberately sloppy box and some clicks become seeds for GrabCut, and we measure the IoU against the true mask after each step. Real SAM does this far better because it knows what objects look like: it often needs just one prompt.

```python run title="Interactive segmentation: a box, then correcting clicks (GrabCut as the engine)" level=advanced
import cv2
import numpy as np
import cvlab

rng = np.random.default_rng(0)
img = cv2.cvtColor(cvlab.shapes(256), cv2.COLOR_RGB2BGR)
img = np.clip(img.astype(np.float32) + rng.normal(0, 14, img.shape) + 15 * np.sin(np.arange(256) / 9)[None, :, None], 0, 255).astype(np.uint8)    # a noisy, textured version

truth = np.zeros((256, 256), np.uint8)
cv2.fillConvexPoly(truth, np.array([[40, 228], [100, 140], [160, 228]]), 1)                # we want the green triangle

def segment(box, clicks):
    """box: (x0, y0, x1, y1); clicks: list of ((x, y), is_foreground). Returns a binary mask."""
    mask = np.full((256, 256), cv2.GC_BGD, np.uint8)                                          # outside the box: surely background
    x0, y0, x1, y1 = box
    mask[y0:y1, x0:x1] = cv2.GC_PR_FGD                                                        # inside the box: probably foreground
    for (x, y), fg in clicks:
        cv2.circle(mask, (x, y), 5, cv2.GC_FGD if fg else cv2.GC_BGD, -1)                     # each click becomes a small sure seed
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(img, mask, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
    return ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)

def iou(a, b): return float((a & b).sum() / ((a | b).sum() + 1e-9))

tight, sloppy = (30, 130, 170, 238), (0, 90, 256, 256)
print(f"tight box around the triangle        IoU {iou(segment(tight, []), truth):.3f}")
clicks = []
print(f"sloppy box, no clicks                IoU {iou(segment(sloppy, clicks), truth):.3f}")
clicks += [((100, 200), True), ((210, 215), False), ((30, 180), False)]                       # a click on the object, two on the white background
print(f"+ 3 clicks (object, 2 x background)  IoU {iou(segment(sloppy, clicks), truth):.3f}")
clicks += [((208, 175), False), ((190, 165), False), ((228, 185), False)]                     # now three on the orange ellipse
print(f"+ 3 clicks on the ellipse            IoU {iou(segment(sloppy, clicks), truth):.3f}")
clicks += [((112, 104), False)]                                                               # and one on the purple dot
result = segment(sloppy, clicks)
print(f"+ 1 click on the purple dot          IoU {iou(result, truth):.3f}")
vis = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).copy()
cv2.rectangle(vis, sloppy[:2], (sloppy[2] - 1, sloppy[3] - 1), (0, 0, 0), 1)
for (x, y), fg in clicks:
    cv2.circle(vis, (x, y), 5, (0, 255, 0) if fg else (255, 0, 0), -1)
overlay = vis.copy(); overlay[result > 0] = (0.5 * overlay[result > 0] + 0.5 * np.array([255, 255, 0])).astype(np.uint8)
cvlab.show(vis, "Box and clicks (green: object, red: not)", overlay, "Resulting mask in yellow")
```

Each correction removes one kind of mistake, just as extra clicks do in SAM. The usual evaluation of interactive models is **NoC@90**: the **number of clicks** needed to reach 90% IoU, and the IoU after `k` clicks. SAM reaches high IoU in about one to three clicks on most objects.

## Strengths and weaknesses

| Strength | Weakness |
|---|---|
| Works on almost any object with no training | No semantics: masks have no class names |
| Huge time saver for annotation (labelling) | Very thin structures, fine boundaries and transparent objects can be wrong |
| Real-time interaction after one encoder pass | Heavy encoder (ViT-H); needs a GPU or a distilled variant |
| Zero-shot transfer to many domains | Weaker on specialised domains (medical, remote sensing, microscopy) without fine-tuning |
| Foundation for text-prompted, video and 3-D tools | Automatic "segment everything" over-segments and gives parts, not "things" |

## How SAM is used in practice

1. **Annotation**: click or box objects, accept the mask; export to COCO/YOLO-seg. Tools such as CVAT, Label Studio, Roboflow and X-AnyLabeling integrate it. Typically 5–10× faster than polygon drawing.
2. **Auto-labelling pipelines**: Grounding DINO / YOLO-World boxes → SAM masks → human review → train a small, fast model for deployment (YOLO-seg).
3. **Robotics**: box from a detector → SAM mask → centroid, grasp point, depth statistics.
4. **Editing and background removal**; **video object masking** with SAM 2.
5. **Pre-processing** for other models (mask out distractors, crop an object for classification).

:::interview Questions you may get
- "What is SAM and what makes it different?" A promptable segmentation foundation model: point, box or mask prompts give masks for almost any object, zero-shot, trained on 1.1 billion masks.
- "Why does SAM output three masks?" A prompt can be ambiguous (part, object or group); it returns several valid masks with confidence scores.
- "Why is SAM fast to interact with despite a huge model?" The heavy ViT image encoder runs once per image; the prompt encoder and mask decoder are tiny.
- "How was SA-1B built?" A three-stage data engine: assisted-manual, semi-automatic and fully automatic labelling with the model in the loop.
- "What does SAM 2 add?" Video: a streaming memory and memory attention so masks track objects through time and occlusions.
- "What would you do to use SAM in production on an edge device?" Use a distilled variant (MobileSAM/EdgeSAM), precompute embeddings, or use SAM offline to label data for a small detector/segmenter.
:::

```quiz
? What runs once per image in SAM?
+ The heavy ViT image encoder
- The mask decoder
- The prompt encoder
> Then each prompt only needs the light decoder.

? What is the idea behind Grounded SAM?
+ A text-to-box model (Grounding DINO) supplies boxes that SAM turns into masks
- Training SAM on captions only
- Running SAM on text images
> It makes SAM text-promptable.

? Which weakness does SAM have by itself?
+ Its masks carry no class names (no semantics)
- It cannot segment cars
- It needs a different model per image size
> Combine with a classifier or an open-vocabulary detector.

? What does NoC@90 measure?
+ The number of clicks needed to reach 90% IoU
- The number of classes
- The latency
> A standard metric for interactive segmentation.
```

:::problem You need to segment 50,000 images of 12 product types for a quality-control model, with a budget for labelling about 1,000 images by hand. How would you use SAM and what would the final deployed model be? {level=medium tags="sam,labelling,pipeline"}
Think about auto-labelling and a deployable model.

:::solution Model answer
Use an open-vocabulary detector or a small detector trained on a few hundred boxes to get boxes for the 12 product types, then SAM with box prompts for masks. Have people review and correct a sample (and all low-confidence/hard cases), measuring mask quality against a gold set of manual labels. Train a compact instance or semantic model (YOLO-seg, U-Net/DeepLab with a pretrained encoder) on the corrected masks; it is fast, cheap and gives class information. Evaluate on a held-out manually labelled set; iterate on failure cases (thin parts, reflections). SAM stays in the labelling pipeline rather than in production.
:::
:::

:::keypoints
- SAM is a promptable segmentation foundation model: image embedding once (ViT-H), light prompt encoder and mask decoder, three masks per ambiguous prompt, trained on SA-1B (1.1 billion masks) via a data engine.
- Prompts: points, boxes, masks; text through Grounded SAM. SAM 2 adds video with streaming memory.
- Distilled variants (MobileSAM, EfficientSAM, FastSAM) trade accuracy for speed; medical and HQ variants exist.
- No class semantics, weak on thin or specialised structures; best used for annotation, auto-labelling and as a component with detectors.
:::

:::resources
- [Kirillov et al.: Segment Anything](https://arxiv.org/abs/2304.02643) — the paper.
- [Ravi et al.: SAM 2: Segment Anything in Images and Videos](https://arxiv.org/abs/2408.00714) — the video model.
- [Segment Anything code and models (Meta AI)](https://github.com/facebookresearch/segment-anything) — the official repository, with the demo link.
- [Zhang et al.: Faster Segment Anything: Towards Lightweight SAM (MobileSAM)](https://arxiv.org/abs/2306.14289) — a distilled variant.
:::
