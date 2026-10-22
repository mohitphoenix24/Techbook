---
title: Anomaly Detection and Industrial Inspection
level: advanced
time: 50
summary: Finding defects when you have only good examples. Why supervised classification fails, reconstruction and feature-based methods (PaDiM, PatchCore, student-teacher, flows), a runnable patch-memory detector, image and pixel metrics (AUROC, PRO), MVTec AD, and a practical inspection workflow.
---

On a production line, 99.9% of items are good. Defects are **rare, varied and often new**: a scratch, a crack, a missing screw, a stain nobody has seen before. You cannot collect enough examples of every defect to train a normal classifier. **Anomaly detection** (AD) trains on **good images only** and flags anything **different**.

## Settings

| Setting | Training data | Notes |
|---|---|---|
| **Unsupervised AD** | Only normal images | The classic industrial case |
| **Few-shot / zero-shot AD** | A handful of normals, or none (text prompts) | WinCLIP, AnomalyGPT, foundation-model features |
| **Semi-supervised** | Many normals + a few defects | Use the defects to tune the threshold or train a supervised head |
| **Supervised segmentation** | Many labelled defects | Best if you really have them; use U-Net-style segmentation (module 10) |

Two questions: is the **image** anomalous (a good/bad decision: *image-level*), and **where** is the defect (a heat map: *pixel-level*).

## Families of methods

1. **Reconstruction-based**: train an autoencoder/GAN/diffusion model on normal images; defects reconstruct badly, so `|image − reconstruction|` is the anomaly map. Simple, but modern networks reconstruct defects too (see the autoencoder lesson). Improved by inpainting-style or denoising training (DRAEM, with simulated defects).
2. **Feature-embedding (memory-bank) methods**: take features of a **pre-trained** network (ImageNet ResNet/WideResNet, DINO), model what "normal" features look like, and score test features by their distance from normal.
   - **PaDiM**: fit a Gaussian (mean and covariance) per image position; score with Mahalanobis distance.
   - **PatchCore** (Roth et al., 2022): store a **memory bank** of normal **patch features** (greedy coreset to keep it small), and score a test patch by the **distance to its nearest neighbour** in the bank. Excellent accuracy (about 99% image AUROC on MVTec AD) and no training.
3. **Student–teacher**: a frozen pre-trained teacher and a student trained **only on normal images** to copy it; on defects, the student fails to copy, so the difference is the anomaly score (STFPM, Reverse Distillation, EfficientAD for real-time).
4. **Normalising flows** (FastFlow, CFlow, CS-Flow): learn the density of normal features; low likelihood means anomalous.
5. **Foundation-model approaches**: WinCLIP (CLIP with window prompts "a damaged {object}"), AnomalyCLIP, and VLMs for zero-/few-shot inspection; useful when there are no normal images, less accurate than PatchCore on specific parts.

## A patch-memory detector you can run

The next demo is a tiny PatchCore: the "features" are PCA-reduced 8×8 patches (instead of deep features), the memory bank comes from two normal pictures of a gravel texture, and a test crop has a scratch and a bright blob added. The score of each patch is the distance to its **nearest normal patch**.

```python run title="PatchCore-style anomaly map from normal patches only" level=advanced
import numpy as np
import cv2
from sklearn.decomposition import PCA
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import roc_auc_score
import cvlab

tex = cvlab.image("gravel", gray=True)                                   # a texture photo
rng = np.random.default_rng(0)
h, w = tex.shape
train_imgs = [tex[:, : w // 2], tex[h // 2:, w // 2:]]                    # "normal" pictures of the texture (we have only normal ones)
clean = tex[: h // 2, w // 2:].copy()                                      # a held-out normal crop
test = clean.copy()
mask = np.zeros(test.shape, np.uint8)
cv2.line(test, (10, 25), (115, 85), 30, 2); cv2.line(mask, (10, 25), (115, 85), 1, 4)       # a dark scratch
cv2.circle(test, (95, 30), 8, 235, -1); cv2.circle(mask, (95, 30), 10, 1, -1)              # a bright blob

P = 8
def patches(img, step=2):
    out, pos = [], []
    for y in range(0, img.shape[0] - P + 1, step):
        for x in range(0, img.shape[1] - P + 1, step):
            p = img[y:y + P, x:x + P].astype(np.float32).ravel()
            out.append(p); pos.append((y + P // 2, x + P // 2))
    return np.array(out), pos
bank = np.vstack([patches(i, 3)[0] for i in train_imgs])
pca = PCA(16, random_state=0).fit(bank)
nn_ = NearestNeighbors(n_neighbors=1).fit(pca.transform(bank))
tp, pos = patches(test, 2)
dist = nn_.kneighbors(pca.transform(tp))[0][:, 0]
amap = np.zeros(test.shape, np.float32); cnt = np.zeros(test.shape, np.float32)
for d, (y, x) in zip(dist, pos):
    amap[y - P // 2:y + P // 2, x - P // 2:x + P // 2] += d; cnt[y - P // 2:y + P // 2, x - P // 2:x + P // 2] += 1
amap = amap / np.maximum(cnt, 1)
amap = cv2.GaussianBlur(amap, (0, 0), 2)
valid = cnt > 0
auc = roc_auc_score(mask[valid].ravel(), amap[valid].ravel())
base = np.abs(test.astype(np.float32) - cv2.GaussianBlur(test, (0, 0), 6).astype(np.float32))                 # naive baseline: deviation from local mean
auc0 = roc_auc_score(mask[valid].ravel(), base[valid].ravel())
print(f"pixel AUROC  patch-memory (PatchCore-like): {auc:.3f}   |   naive intensity deviation: {auc0:.3f}")
cp, cpos = patches(clean, 2)
cd = nn_.kneighbors(pca.transform(cp))[0][:, 0]
print(f"image-level score (largest patch distance): defect-free crop {cd.max():.0f}  vs defective crop {dist.max():.0f}")
cvlab.show(test, "Test image with defects", (255 * amap / amap.max()).astype(np.uint8), "Anomaly map", mask * 255, "True defect mask")
```

Notice the **naive baseline** (deviation from local mean) is much worse: texture itself varies a lot, and only the memory of *what normal texture looks like* separates it from a defect. With deep features, the same idea works on complicated objects.

## How the score becomes a decision

- **Pixel map** → smoothed (Gaussian blur, σ ≈ 4 px on the feature map upscaled to image size).
- **Image score** = the maximum (or mean of the top-k) pixels of the map.
- **Threshold**: from the validation distribution of normal scores (for example the 99.5th percentile) or from a small labelled set with known defects at the target false-alarm rate. The threshold must be **recalibrated** when lighting, camera or product batch changes.
- **Localisation** helps humans trust the system and supports defect-size rules ("reject if scratch > 2 mm", which needs pixel-to-mm calibration, module 5).

## Metrics

- **Image-level AUROC** and **AUPR** (anomalies are rare, so look at precision–recall too).
- **Pixel-level AUROC** is dominated by the many easy normal pixels; prefer **PRO (per-region overlap)** and **AUPRO**, which weight each defect region equally regardless of size, or **F1 at the best threshold**.
- Report **false-alarm rate per 1000 items** and **miss rate** at the chosen threshold: these are the business numbers.
- **Benchmarks**: **MVTec AD** (15 object/texture categories, 5k images), **MVTec AD 2** (harder, with lighting variation), **VisA**, **MPDD**, **BTAD**, **Real-IAD**.

## A practical inspection workflow

1. **Fix the imaging first**: lighting (dark-field for scratches, back-light for edges, diffuse dome for glossy parts), a fixed camera pose, trigger, enough resolution (a defect should cover at least ~5–10 pixels). Good optics beats a better network.
2. **Align the parts** if the object position varies (template matching, keypoint registration, module 4) so that patch positions are comparable (PaDiM needs it; PatchCore is more tolerant).
3. **Collect normals** across shifts, lots and lighting drift. Remove accidental defects from the "normal" set (clean the training data: even 1% contamination hurts).
4. **Baseline** with PatchCore or EfficientAD; look at maps for 50 good and 50 bad parts.
5. **Calibrate** the threshold on a validation set with real defects; set the false-alarm rate with the line owner.
6. **Deploy** with a speed target (EfficientAD runs at hundreds of FPS on a GPU; PatchCore needs memory-bank search, so use a small coreset or FAISS; consider ONNX/TensorRT).
7. **Monitor drift**: track the score distribution of passing parts; retrain or recalibrate when it shifts; keep a human review queue and feed confirmed defects back (this later enables supervised training).

## Failure modes

- **Normal variation treated as anomaly**: legitimate variations (colour batch, surface marks) need to be in the normal set.
- **Logical anomalies** (wrong number of screws, wrong order, missing component) are **not texture defects**: use detection/counting, or models designed for them (MVTec LOCO benchmark, GCAD, EfficientAD-L).
- **Tiny defects** below feature resolution: use higher resolution or tiling.
- **Shortcut learning**: models may rely on a background cue; vary the background in normals.
- **Domain shift** between cameras.

:::interview Questions you may get
- "How do you detect defects with only good samples?" Learn the distribution of normal appearance (memory bank of pre-trained features, student–teacher, flows, reconstruction) and score deviation.
- "Explain PatchCore." Pre-trained patch features of normal images are stored (coreset-reduced); a test patch's score is its distance to the nearest stored patch; the image score is the maximum.
- "Why might an autoencoder fail for anomaly detection?" It can reconstruct anything if capacity is high, so defects are also reconstructed.
- "How do you pick the threshold?" From the normal-score distribution at the accepted false-alarm rate, verified with real defects, and recalibrated on drift.
- "Which metrics do you report?" Image AUROC/AUPR, pixel PRO/AUPRO, false alarms per 1000 parts, miss rate.
- "What is a logical anomaly?" A configuration error (missing or misplaced part) rather than a surface defect; it needs counting/relational reasoning.
:::

```quiz
? What data does an unsupervised anomaly detector train on?
+ Only normal (defect-free) examples
- Equal numbers of good and defective images
- Text captions only
> Anything unlike the normal data is flagged.

? How does PatchCore score a test patch?
+ By the distance to its nearest neighbour among stored normal patch features
- By classifying it with softmax
- By its brightness
> A memory bank of normal features.

? Why is pixel-level AUROC an optimistic metric?
+ Most pixels are normal and easy, so large normal areas dominate the score
- It ignores the defect
- It needs labels per image
> Prefer PRO or AUPRO.

? Which defect type is poorly handled by texture-based anomaly detectors?
+ A logical anomaly such as a missing screw
- A scratch
- A stain
> Needs counting or part-level reasoning.
```

:::problem A customer's PatchCore model passes all of your tests but raises many false alarms after a new batch of parts with a slightly different surface finish arrives. What do you do? {level=medium tags="anomaly,drift,deployment"}
Think about what the memory bank knows.

:::solution Model answer
The new finish is outside the memory bank, so it looks anomalous. Collect normal images of the new batch (verified good), add them to the memory bank (re-run the coreset) or train a batch-specific model; recalibrate the threshold on a validation set of the new batch; confirm that real defects are still detected. For the future: include batch/lot variation in the normal training data, monitor the score distribution of accepted parts, and add an operator feedback loop to flag false alarms and to extend the bank under change control.
:::
:::

:::keypoints
- Anomaly detection learns normality from good images; flag deviations at image and pixel level.
- Strong baselines: PatchCore (nearest-neighbour memory bank of pre-trained patch features), PaDiM, student–teacher (EfficientAD), flows; reconstruction methods are weaker unless trained carefully.
- Report image AUROC/AUPR, PRO, false-alarm and miss rates; calibrate and monitor the threshold; handle batch drift.
- Imaging (light, resolution, fixtures) matters most; logical anomalies and tiny defects need different tools.
:::

:::resources
- [Roth et al.: Towards Total Recall in Industrial Anomaly Detection (PatchCore)](https://arxiv.org/abs/2106.08265) — memory-bank method.
- [Defard et al.: PaDiM: a Patch Distribution Modeling Framework for Anomaly Detection](https://arxiv.org/abs/2011.08785) — Gaussian per position.
- [Batzner et al.: EfficientAD: Accurate Visual Anomaly Detection at Millisecond-Level Latencies](https://arxiv.org/abs/2303.14535) — real-time student–teacher.
- [Bergmann et al.: The MVTec Anomaly Detection Dataset](https://www.mvtec.com/company/research/datasets/mvtec-ad) — the standard benchmark.
- [anomalib on GitHub](https://github.com/openvinotoolkit/anomalib) — ready implementations of many methods.
:::
