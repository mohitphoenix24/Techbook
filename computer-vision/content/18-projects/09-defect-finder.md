---
title: Build a Surface Defect Finder
level: advanced
time: 60
icon: shield
cover: #dc2626,#475569
tags: anomaly detection, patchcore, nearest neighbour, memory bank, auroc, inspection
summary: Find defects when you only have good samples. Build a PatchCore-style detector from normal texture patches (PCA features and a nearest-neighbour memory bank), score images and pixels, evaluate with image and pixel AUROC on a proper split, plot detection against defect strength, speed it up with a coreset, and test what happens when the lighting changes.
---

On a production line you usually have thousands of **good** parts and almost no **defective** ones, and the next defect may look like nothing you have seen. **Anomaly detection** (module 13) learns what *normal* looks like and flags anything different. In this project you build the idea behind **PatchCore** with classical features, evaluate it **honestly** (train and test patches come from different regions of the material), and probe where it breaks: weak defects and lighting changes.

**What you'll build:** a detector from a memory bank of normal patches, an evaluation with AUROC, a speed-up with a coreset, and a lighting-robustness test.

:::flow The pipeline
Normal images | brick texture, no defects
Patch features | 8×8 patches, PCA to 16 numbers
Memory bank | all normal patch features
Score a patch | distance to its nearest normal patch
Anomaly map | patch scores spread over the image
Image score | the maximum of the map
Decide | threshold from normal scores
:::

## Step 1 — Textures and defects with known masks

`cvlab.image("brick")` is a real texture photo. We cut **training crops from the left half** and **test crops from the right half**, so no pixel is shared between them (a classic leak is to test on crops that overlap the training crops). Then we add synthetic defects with **known masks**: thin **scratches**, small **blobs** and soft **stains**. A **severity** between 0 and 1 controls how strongly the defect differs from the surface, so we can find the detection limit.

```python run shared title="Step 1 · textures, crops and defects"
import time
import numpy as np
import cv2
import cvlab
from sklearn.decomposition import PCA
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import roc_auc_score

TEXTURE = "brick"
CROP = 100

def crop(seed, part, name=TEXTURE):
    rng = np.random.default_rng(seed)
    g = cvlab.image(name, gray=True); h, w = g.shape
    x_lo, x_hi = (0, w // 2 - CROP // 2 - 4) if part == "train" else (w // 2 + CROP // 2 + 4, w)       # left half to train on, right half to test on
    y = rng.integers(0, h - CROP); x = rng.integers(x_lo, max(x_lo + 1, x_hi - CROP))
    return g[y:y + CROP, x:x + CROP].copy()

def add_defect(img, kind, rng, severity=1.0):
    out = img.astype(np.float32); layer = np.zeros(img.shape, np.float32); mask = np.zeros(img.shape, np.uint8); h, w = img.shape
    if kind == "scratch":
        p1 = rng.integers(20, w - 20, 2); ang = rng.uniform(0, np.pi); length = rng.integers(30, 70)
        p2 = (p1 + length * np.array([np.cos(ang), np.sin(ang)])).astype(int)
        cv2.line(layer, tuple(int(v) for v in p1), tuple(int(v) for v in p2), 1.0, 2); cv2.line(mask, tuple(int(v) for v in p1), tuple(int(v) for v in p2), 1, 5)
        target = rng.choice([25, 230])                                            # a dark or a bright scratch
    elif kind == "blob":
        c = rng.integers(25, w - 25, 2); r = int(rng.integers(5, 9))
        cv2.circle(layer, tuple(int(v) for v in c), r, 1.0, -1); cv2.circle(mask, tuple(int(v) for v in c), r + 2, 1, -1); target = rng.choice([30, 220])
    else:                                                                          # a soft dark stain
        c = rng.integers(30, w - 30, 2); axes = rng.integers(8, 16, 2)
        cv2.ellipse(layer, tuple(int(v) for v in c), tuple(int(v) for v in axes), float(rng.uniform(0, 180)), 0, 360, 1.0, -1)
        layer = cv2.GaussianBlur(layer, (0, 0), 3); mask = (layer > 0.4).astype(np.uint8); target = 60
    a = layer * severity                                                           # how much the surface is replaced by the defect colour
    return np.clip(out * (1 - a) + target * a, 0, 255).astype(np.uint8), mask

KINDS = ["scratch", "blob", "stain"]
def defect_set(n=21, severity=1.0, seed0=200):
    return [add_defect(crop(seed0 + s, "test"), KINDS[s % 3], np.random.default_rng(s), severity) + (KINDS[s % 3],) for s in range(n)]

normal_test = [crop(100 + s, "test") for s in range(20)]
sample = defect_set(3)
print(f"{CROP}x{CROP} crops | train from the left half, test from the right half | defect kinds: {KINDS}")
cvlab.show(*[im for im, m, k in sample], titles=[f"{k}" for _, _, k in sample])
```

## Step 2 — Patch features and the memory bank

We cut every training crop into **8 × 8 patches** (every 3 pixels), flatten each to 64 numbers, and compress with **PCA to 16 dimensions** (a stand-in for the deep features PatchCore takes from a pre-trained network). All of these normal patch features form the **memory bank**. A new patch is **normal** if the bank contains something close to it, and **anomalous** if not.

```python run shared title="Step 2 · patches, PCA and the memory bank"
P = 8

def patches(img, step=2):
    feats, pos = [], []
    for y in range(0, img.shape[0] - P + 1, step):
        for x in range(0, img.shape[1] - P + 1, step):
            feats.append(img[y:y + P, x:x + P].astype(np.float32).ravel()); pos.append((y + P // 2, x + P // 2))
    return np.array(feats), pos

train_crops = [crop(s, "train") for s in range(12)]
bank_raw = np.vstack([patches(t, 3)[0] for t in train_crops])
pca = PCA(16, random_state=0).fit(bank_raw)
bank = pca.transform(bank_raw)
nn_index = NearestNeighbors(n_neighbors=1).fit(bank)
print(f"memory bank: {bank.shape[0]} normal patches of {bank.shape[1]} features | PCA keeps {pca.explained_variance_ratio_.sum():.0%} of the variance")
```

## Step 3 — The anomaly map

For each test patch we find its **nearest neighbour** in the memory bank; the distance is its **anomaly score**. We paint each score back onto the patch's pixels (averaging overlaps) and smooth the map slightly. The **image score** is the **largest value** of the map: one clearly abnormal spot is enough to flag the part.

```python run shared title="Step 3 · scores, maps and a first look"
def anomaly_map(img, index, transform=pca.transform, step=2):
    f, pos = patches(img, step)
    d = index.kneighbors(transform(f))[0][:, 0]                                   # distance to the nearest normal patch
    amap = np.zeros(img.shape, np.float32); count = np.zeros(img.shape, np.float32)
    for v, (y, x) in zip(d, pos):
        amap[y - P // 2:y + P // 2, x - P // 2:x + P // 2] += v; count[y - P // 2:y + P // 2, x - P // 2:x + P // 2] += 1
    return cv2.GaussianBlur(amap / np.maximum(count, 1), (0, 0), 2), count > 0

normal_scores = [anomaly_map(t, nn_index)[0].max() for t in normal_test]
defects = defect_set(21, severity=1.0)
defect_scores = [anomaly_map(im, nn_index)[0].max() for im, m, k in defects]
print(f"image score of normal crops:    mean {np.mean(normal_scores):.1f}, max {np.max(normal_scores):.1f}")
print(f"image score of defective crops: mean {np.mean(defect_scores):.1f}, min {np.min(defect_scores):.1f}")
view = [defects[0], defects[1], defects[2]]
tiles = []
for im, m, k in view:
    am, _ = anomaly_map(im, nn_index)
    tiles += [im, (255 * am / am.max()).astype(np.uint8)]
cvlab.show(*tiles, titles=sum([[k, "anomaly map"] for _, _, k in view], []))
```

## Step 4 — Evaluate: image AUROC, pixel AUROC and a threshold

**AUROC** is the probability that a random defective image scores higher than a random normal one (1.0 is perfect, 0.5 is chance). It needs no threshold. A real system needs a **threshold**; without defect examples we set it from the **normal** scores, for example the 95th percentile, which accepts about 5% false alarms on good parts. **Pixel AUROC** asks the same question per pixel: do defect pixels score higher than normal pixels? (We also report the sensitivity at the chosen threshold.)

```python run shared title="Step 4 · AUROC and a threshold"
def evaluate(index, transform, defects, normals, label=""):
    sn = [anomaly_map(t, index, transform)[0].max() for t in normals]
    sd, pix_s, pix_l = [], [], []
    for im, m, k in defects:
        am, valid = anomaly_map(im, index, transform); sd.append(am.max()); pix_s.append(am[valid]); pix_l.append(m[valid])
    auc_img = roc_auc_score([0] * len(sn) + [1] * len(sd), sn + sd)
    auc_pix = roc_auc_score(np.concatenate(pix_l), np.concatenate(pix_s))
    thr = np.percentile(sn, 95)
    return dict(img=auc_img, pix=auc_pix, thr=thr, tpr=float(np.mean(np.array(sd) > thr)), fpr=float(np.mean(np.array(sn) > thr)), sn=sn, sd=sd)

res = evaluate(nn_index, pca.transform, defects, normal_test)
print(f"image AUROC {res['img']:.3f} | pixel AUROC {res['pix']:.3f}")
print(f"threshold (95th percentile of normal scores) = {res['thr']:.1f}: catches {res['tpr']:.0%} of the defective crops, flags {res['fpr']:.0%} of the good ones")
by_kind = {k: np.mean([s > res["thr"] for s, (_, _, kk) in zip(res["sd"], defects) if kk == k]) for k in KINDS}
print("detection rate by defect type:", {k: f"{v:.0%}" for k, v in by_kind.items()})
assert res["img"] > 0.9
```

## Step 5 — How weak a defect can you find?

Real defects are often subtle. We reduce the **severity** (how much the surface is replaced by the defect colour) and recompute the AUROC. Every inspection system has such a **detection limit**; knowing it tells the customer what the system can promise. Also look at the difference between *image* and *pixel* AUROC: localising a faint defect is harder than noticing that something is off.

```python run shared title="Step 5 · the detection limit"
print("defect severity | image AUROC | pixel AUROC | detection rate at the 95% threshold")
for sev in (1.0, 0.6, 0.4, 0.25):
    d = defect_set(21, severity=sev)
    r = evaluate(nn_index, pca.transform, d, normal_test)
    print(f"{sev:>15} | {r['img']:>11.3f} | {r['pix']:>11.3f} | {r['tpr']:>8.0%}")
print("as the severity falls the defects become comparable to the natural variation of the brick: detection becomes unreliable, and no unsupervised detector can promise to find them")
print("what helps: more normal data, better features (a pre-trained CNN), higher resolution, and better lighting that makes the defect more visible")
```

## Step 6 — A smaller memory bank with a coreset

PatchCore keeps the bank small with a **greedy coreset**: repeatedly pick the patch that is **farthest** from the ones already chosen (**k-centre**), so a few hundred patches cover the same space as thousands. Search time drops with the bank size, and, because the coreset avoids redundant patches, accuracy barely changes, unlike a random subsample, which may miss rare patches.

```python run shared title="Step 6 · coreset versus random subsampling"
def greedy_coreset(F, k, seed=0):
    rng = np.random.default_rng(seed); chosen = [int(rng.integers(len(F)))]
    d = np.linalg.norm(F - F[chosen[0]], axis=1)
    for _ in range(k - 1):
        i = int(d.argmax()); chosen.append(i)                                      # the point farthest from everything chosen so far
        d = np.minimum(d, np.linalg.norm(F - F[i], axis=1))
    return np.array(chosen)

d_med = defect_set(21, severity=0.5)
print("memory bank       | patches | image AUROC | ms per image")
k = max(len(bank) // 50, 50)
for label, sel in [("full bank", np.arange(len(bank))),
                   (f"random {k}", np.random.default_rng(0).choice(len(bank), k, replace=False)),
                   (f"coreset {k}", greedy_coreset(bank, k))]:
    index = NearestNeighbors(n_neighbors=1).fit(bank[sel])
    t0 = time.perf_counter()
    r = evaluate(index, pca.transform, d_med, normal_test)
    ms = (time.perf_counter() - t0) / (len(d_med) + len(normal_test)) * 1000
    print(f"{label:<17} | {len(sel):>7} | {r['img']:>11.3f} | {ms:>8.1f}")
print("a 50-times smaller bank gives similar accuracy at a fraction of the cost (timings vary by machine)")
```

## Step 7 — What if the lighting changes?

A real line changes: a new lamp, a different shift, a dirty window. A detector trained under one lighting is **tested under a darker, lower-contrast one**. The raw patches shift away from the memory bank, so *normal* parts start to look anomalous: a **false-alarm storm**. One fix is to **normalise each patch** (subtract its mean, divide by its standard deviation) before PCA, which removes brightness and contrast, at the price of ignoring defects that are *only* a brightness change (a soft stain). The same trade-off as everywhere: robustness costs sensitivity.

```python run shared title="Step 7 · lighting shift and patch normalisation"
def normalise(f):
    return (f - f.mean(1, keepdims=True)) / (f.std(1, keepdims=True) + 5)

bank_norm_raw = normalise(bank_raw)
pca_n = PCA(16, random_state=0).fit(bank_norm_raw)
index_n = NearestNeighbors(n_neighbors=1).fit(pca_n.transform(bank_norm_raw))
tf_n = lambda f: pca_n.transform(normalise(f))

darker = lambda im: np.clip(im.astype(np.float32) * 0.75 + 15, 0, 255).astype(np.uint8)          # lower contrast and a different brightness
print("features             | false alarms (normal, new lighting) | false alarms (normal, same lighting) | detection (stains+scratches+blobs, severity 1)")
for label, index, tf in [("raw patches", nn_index, pca.transform), ("normalised patches", index_n, tf_n)]:
    base = evaluate(index, tf, defects, normal_test)
    thr = base["thr"]
    shifted = [anomaly_map(darker(t), index, tf)[0].max() for t in normal_test]
    print(f"{label:<20} | {np.mean(np.array(shifted) > thr):>34.0%} | {base['fpr']:>35.0%} | {base['tpr']:>8.0%}")
print("a threshold set under one lighting is wrong under another: re-baseline per lighting condition, normalise features, or control the lighting")
```

## How it works

| Piece | Purpose |
|---|---|
| Train/test from different regions | prevents the leak that makes every anomaly detector look perfect |
| 8×8 patches + PCA | local appearance features; deep features (WideResNet, DINO) replace them in real PatchCore |
| Memory bank + nearest neighbour | the model of normality is the data itself; no training |
| Max of the anomaly map | one abnormal spot flags the whole part |
| Threshold from normal scores | the only information available without defect examples |
| Severity sweep | measures the detection limit and sets honest promises |
| Coreset | keeps coverage with far fewer patches |
| Normalisation | robustness to lighting at the cost of brightness-only defects |

**For a real deployment** (module 15): fix the **imaging** first (lighting, optics, fixtures), align the parts, collect normals across shifts and batches, calibrate the threshold with some real defects (even a handful), monitor the score distribution of good parts for drift, and keep a review queue whose labels slowly give you a supervised dataset.

:::exercise Extend it
1. Swap the PCA features for **pre-trained CNN features** in your own environment (a ResNet layer, as in PatchCore) and rerun the severity sweep.
2. Evaluate the other textures (`gravel`, `grass`) and explain why detection differs (the amount of natural variation).
3. Add **cutting-edge logic defects**: a missing element in a regular pattern (a missing brick row). Does a patch detector see it?
4. Compute the **PRO** metric (per-region overlap) instead of pixel AUROC for the scratches.
5. Make the threshold choice explicit: report **false alarms per 1000 good crops** and the **missed defects** for thresholds at the 90th, 95th, 99th percentile.
6. Add a **feedback loop**: add confirmed false-alarm patches to the memory bank and show that the false-alarm rate falls.
:::

:::keypoints
- Anomaly detection learns normality from good images only; PatchCore-style methods score each patch by its distance to the nearest normal patch.
- Evaluate with a leak-free split, image and pixel AUROC, and a threshold taken from normal scores; report detection limits by defect strength and type.
- A coreset shrinks the memory bank dramatically with little loss in accuracy.
- Lighting changes cause false-alarm storms; normalisation and controlled imaging trade robustness against sensitivity.
- A detector is only as good as the imaging, the normal data and the threshold process around it.
:::
