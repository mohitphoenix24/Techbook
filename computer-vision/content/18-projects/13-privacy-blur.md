---
title: Build a Privacy Filter That Blurs Faces
level: intermediate
time: 50
icon: key
cover: #64748b,#22c55e
tags: haar cascade, face detection, anonymisation, recall, temporal smoothing, privacy
summary: Detect faces and anonymise them, and measure whether it really protects people. Use a Viola-Jones face detector, compare blur, pixelation and solid fill (and show that weak blur can be reversed), measure how detection recall falls with head rotation and how many false boxes you pay for more sensitivity, add rotation search, and in a simulated video count the frames where a face leaks, with margins and temporal holding.
---

Cameras in shops, factories, cars and cities see people who never agreed to be recorded. A common mitigation is to **blur the faces at the edge**, before anything is stored. It sounds trivial, and it is a perfect example of why *evaluation* matters: a blur filter that misses a face in **one frame in ten** does not protect anyone, and a blur that can be **undone** is not a blur at all. In this project you build the filter and **measure its failure modes**.

**What you'll build:** a face detector with a rotation search, three anonymisation methods with an irreversibility test, and a **leak rate** metric on a simulated video.

:::flow The pipeline
Frame | image from a camera
Detect faces | Viola-Jones cascade, several rotations
Expand | margin around each box
Hold | keep the last boxes for a few frames
Anonymise | blur, pixelate or fill
Measure | leak rate, false boxes, reversibility
:::

:::def Recall is the privacy metric
For anonymisation, a **missed face** (false negative) is a privacy failure, while an extra box (false positive) only costs some visual quality. So the metric that matters is **recall** (the fraction of faces covered), reported as a **leak rate** = `1 − recall` per frame, and you tune the system to push it down, accepting more false boxes.
:::

## Step 1 — Detect faces with a Haar cascade

The **Viola-Jones** detector (module 4) slides windows over an image pyramid and rejects non-faces quickly with a **cascade** of simple Haar-feature classifiers. `detectMultiScale` has two parameters that control the trade-off: `scaleFactor` (the pyramid step) and `minNeighbors` (how many overlapping detections are needed to accept a face). The sample `astronaut` photo contains one face.

```python run shared title="Step 1 · the detector"
import numpy as np
import cv2
import cvlab
from skimage import restoration

face_model = cv2.CascadeClassifier(cvlab.data_path("haarcascade_frontalface_default.xml"))
img = cvlab.image("astronaut")
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)

def detect(g, scale=1.1, neighbours=5, min_size=40):
    return [tuple(int(v) for v in b) for b in face_model.detectMultiScale(g, scaleFactor=scale, minNeighbors=neighbours, minSize=(min_size, min_size))]

faces = detect(gray)
print("faces found in the astronaut photo:", faces, "(x, y, width, height)")
vis = img.copy()
for x, y, w, h in faces: cv2.rectangle(vis, (x, y), (x + w, y + h), (0, 255, 0), 2)
cvlab.show(img, "Photo", vis, "Detected face")
```

## Step 2 — Three ways to hide a face (and which one can be undone)

- **Gaussian blur**: smooth the face region.
- **Pixelation** (mosaic): average blocks of pixels.
- **Solid fill**: replace the region by a constant colour. Nothing remains.

A blur is a **convolution with a known kernel**, and convolutions can often be **inverted** (deconvolution, module 13). To test how reversible each method is, we hide the face and then try to recover it with **Wiener deconvolution** using the *known* blur kernel (an attacker who knows the filter settings, which are usually public). We report the **correlation** between the recovered face and the original (1.0 means fully recovered).

```python run shared title="Step 2 · anonymisation methods and how reversible they are"
x, y, w, h = faces[0]
face = gray[y:y + h, x:x + w].astype(np.float64) / 255
corr = lambda a, b: float(np.corrcoef(a.ravel(), b.ravel())[0, 1])

def gaussian_psf(sigma):
    k = cv2.getGaussianKernel(int(sigma * 6) | 1, sigma)
    return k @ k.T

def pixelate(region, block):
    small = cv2.resize(region, (max(1, region.shape[1] // block), max(1, region.shape[0] // block)), interpolation=cv2.INTER_AREA)
    return cv2.resize(small, (region.shape[1], region.shape[0]), interpolation=cv2.INTER_NEAREST)

print("method               | similarity to the original | after an attack (deconvolution / smoothing)")
for sigma in (1, 2, 4, 8):
    psf = gaussian_psf(sigma)
    blurred = np.round(cv2.filter2D(face, -1, psf, borderType=cv2.BORDER_REFLECT) * 255) / 255            # saved as 8-bit
    recovered = np.clip(restoration.wiener(blurred, psf, balance=0.003), 0, 1)
    print(f"Gaussian blur s={sigma:<2}      | {corr(blurred, face):>26.3f} | {corr(recovered, face):>6.3f}")
for block in (4, 8, 12):
    p = pixelate(face, block)
    print(f"pixelation {block:>2} px      | {corr(p, face):>26.3f} | {corr(cv2.GaussianBlur(p, (0, 0), block / 2), face):>6.3f}")
print(f"solid fill           | {'none (constant)':>26} | {0.0:>6.3f}")
print("a light blur (sigma 1-2) can be almost completely undone; strong blur, coarse pixelation or a solid fill leave much less")
print("rule: choose the method for the threat, not for the look. Solid fill is the only one that removes the information entirely")
```

## Step 3 — Does the detector find faces that are not upright?

People tilt their heads. We make 12 test photos for each rotation range by **rotating** the astronaut photo by a random angle (and scaling, brightening and adding noise), and check whether a detection lands on the face (we know where the face moved, because we know the transform). The Haar cascade was trained on **upright, frontal** faces, so recall should fall as the tilt grows.

```python run shared title="Step 3 · recall versus head rotation"
def augment(img, angle, scale, bright, rng, noise=3):
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, scale)
    out = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REFLECT)
    return np.clip(out.astype(np.float32) * bright + rng.normal(0, noise, out.shape), 0, 255).astype(np.uint8), M

x, y, w, h = faces[0]
truth_box = np.array([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], np.float32)

def face_hit(detections, M):
    centre = cv2.transform(truth_box[None], M)[0].mean(0)                        # where the true face centre moved to
    return any(abs(centre[0] - (a + aw / 2)) < aw / 2 and abs(centre[1] - (b + ah / 2)) < ah / 2 for a, b, aw, ah in detections)

rng = np.random.default_rng(0)
print("head rotation up to | recall of the plain detector (12 photos each)")
for max_angle in (0, 10, 20, 30, 45):
    hits = 0
    for _ in range(12):
        im, M = augment(img, rng.uniform(-max_angle, max_angle) if max_angle else 0, rng.uniform(0.8, 1.2), rng.uniform(0.7, 1.3), rng)
        hits += face_hit(detect(cv2.cvtColor(im, cv2.COLOR_RGB2GRAY)), M)
    print(f"{max_angle:>13} deg | {hits / 12:.0%}")
```

## Step 4 — Sensitivity costs false boxes; rotation search buys recall

Two ways to find more faces:

1. Lower `minNeighbors` (accept weaker evidence): more recall, **more false boxes**.
2. Run the detector on the image **rotated by several angles** (−30°, −15°, 0°, 15°, 30°), rotate the boxes back, and merge duplicates: this finds tilted faces that the upright cascade misses, at **five times the compute**.

The "false boxes" are counted on the other 13 sample photos, which contain no faces of the kind the cascade was trained on (they are false alarms), to measure the **price** of sensitivity.

```python run shared title="Step 4 · rotation search and its price"
def detect_rotated(g, angles=(-30, -15, 0, 15, 30), neighbours=5):
    h_, w_ = g.shape; found = []
    for a in angles:
        M = cv2.getRotationMatrix2D((w_ / 2, h_ / 2), a, 1.0)
        for bx, by, bw, bh in detect(cv2.warpAffine(g, M, (w_, h_)), neighbours=neighbours):
            cx, cy = cv2.invertAffineTransform(M) @ np.array([bx + bw / 2, by + bh / 2, 1.0])        # the box centre back in the original image
            found.append((int(cx - bw / 2), int(cy - bh / 2), bw, bh))
    keep = []                                                                       # merge near-duplicates: the same face found at several angles
    for b in sorted(found, key=lambda b: -b[2]):
        if all(np.hypot((b[0] + b[2] / 2) - (k[0] + k[2] / 2), (b[1] + b[3] / 2) - (k[1] + k[3] / 2)) > 0.5 * k[2] for k in keep):
            keep.append(b)
    return keep

others = [to for to in (cvlab.image(n) for n in ("coffee", "cat", "camera", "coins", "page", "rocket", "retina", "moon", "text", "horse", "brick", "gravel", "grass"))]
to_gray = lambda a: cv2.cvtColor(a, cv2.COLOR_RGB2GRAY) if a.ndim == 3 else a

rng = np.random.default_rng(0)
tilted = [augment(img, rng.uniform(-30, 30), rng.uniform(0.8, 1.2), rng.uniform(0.7, 1.3), rng) for _ in range(12)]
print("detector                          | recall on 12 photos tilted up to 30 deg | false boxes on 13 face-free photos")
for label, fn in [("plain, minNeighbors 8", lambda g: detect(g, neighbours=8)), ("plain, minNeighbors 5", lambda g: detect(g, neighbours=5)),
                  ("plain, minNeighbors 3", lambda g: detect(g, neighbours=3)), ("rotation search, minNeighbors 5", lambda g: detect_rotated(g, neighbours=5)),
                  ("rotation search, minNeighbors 8", lambda g: detect_rotated(g, neighbours=8))]:
    recall = np.mean([face_hit(fn(to_gray(im)), M) for im, M in tilted])
    false_boxes = sum(len(fn(to_gray(o))) for o in others)
    print(f"{label:<33} | {recall:>38.0%} | {false_boxes:>12}")
print("for privacy you want the highest recall you can afford, then reduce the false boxes (they only cost image quality) with a stricter second check")
```

## Step 5 — A video, and the leak rate

A single image is not a camera feed. We simulate **60 frames** in which the head turns and moves (rotation up to ±28°, scale and position changes, flickering brightness), with the true face box known in every frame. A frame **leaks** if less than 90% of the true face area is covered by the anonymisation mask. We compare:

- the **plain detector** with no margin,
- a **margin** around each box (30% of its width),
- **temporal holding**: if the detector misses a frame, keep the last boxes for up to 8 frames (a face does not vanish in 1/30 s),
- the **rotation search**.

```python run shared title="Step 5 · leak rate in a simulated video"
N = 60
H_img, W_img = img.shape[:2]
frames, truth = [], []
rng = np.random.default_rng(1)
for t in range(N):
    angle, scale, tx = 28 * np.sin(t / 7.0), 1.0 + 0.12 * np.sin(t / 11.0), 40 * np.sin(t / 13.0)
    M = cv2.getRotationMatrix2D((W_img / 2, H_img / 2), angle, scale); M[0, 2] += tx
    im = cv2.warpAffine(img, M, (W_img, H_img), borderMode=cv2.BORDER_REFLECT)
    frames.append(np.clip(im.astype(np.float32) * (0.85 + 0.15 * np.sin(t / 5.0)) + rng.normal(0, 3, im.shape), 0, 255).astype(np.uint8))
    truth.append(cv2.transform(truth_box[None], M)[0])

def coverage(mask, true_quad):
    truth_mask = np.zeros(mask.shape, np.uint8); cv2.fillConvexPoly(truth_mask, true_quad.astype(np.int32), 1)
    return float((mask & truth_mask).sum() / max(truth_mask.sum(), 1))

def leak_rate(detector, margin=0.0, hold=0):
    leaks, last, age = 0, [], 99
    for frame, quad in zip(frames, truth):
        boxes = detector(cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY))
        if boxes: last, age = boxes, 0
        else: age += 1
        use = boxes if boxes else (last if age <= hold else [])                          # hold the last boxes through short misses
        mask = np.zeros(frame.shape[:2], np.uint8)
        for bx, by, bw, bh in use:
            m = int(margin * bw); cv2.rectangle(mask, (bx - m, by - m), (bx + bw + m, by + bh + m), 1, -1)
        leaks += coverage(mask, quad) < 0.9
    return leaks / N

print("configuration                              | frames where the face leaks")
for label, det, margin, hold in [("plain detector", detect, 0.0, 0), ("+ 30% margin", detect, 0.3, 0), ("+ hold 8 frames", detect, 0.3, 8),
                                 ("rotation search", detect_rotated, 0.0, 0), ("rotation search + margin + hold", detect_rotated, 0.3, 8)]:
    print(f"{label:<42} | {leak_rate(det, margin, hold):>6.0%}")
print("most of the leak comes from missed detections when the head is tilted; the margin helps a little, holding helps more, rotation search fixes the cause")
```

## Step 6 — The finished filter, and an honest report

Now put it together: detect with the rotation search, expand by a margin, hold through misses (for a video), and anonymise with a **strong** method. A final check on all 14 sample photos reports how many faces were found, how many boxes were drawn on faceless photos, and the **fail-closed** policy: when a frame's detector is *uncertain* (for example, the tracker lost a face it had seen a second ago), blur the whole last known region rather than show it.

```python run shared title="Step 6 · anonymise() and the report"
def anonymise(image, method="fill", margin=0.3, strength=24):
    g = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if image.ndim == 3 else image
    boxes = detect_rotated(g)
    out = image.copy()
    for bx, by, bw, bh in boxes:
        m = int(margin * bw)
        x0, y0, x1, y1 = max(bx - m, 0), max(by - m, 0), min(bx + bw + m, image.shape[1]), min(by + bh + m, image.shape[0])
        region = out[y0:y1, x0:x1]
        if method == "fill":
            region[:] = region.mean(axis=(0, 1)).astype(np.uint8)                       # replace by the mean colour: no information left
        elif method == "pixelate":
            region[:] = pixelate(region, strength)
        else:
            region[:] = cv2.GaussianBlur(region, (0, 0), strength)
    return out, boxes

protected, boxes = anonymise(img, "fill")
cvlab.show(img, "Original", protected, "Anonymised (solid fill, 30% margin)")
print(f"astronaut: {len(boxes)} face box(es) covered")
total_boxes = 0
for name in ("coffee", "cat", "camera", "coins", "page", "rocket", "retina", "moon", "text", "horse", "brick", "gravel", "grass"):
    photo = cvlab.image(name); photo = cv2.cvtColor(photo, cv2.COLOR_GRAY2RGB) if photo.ndim == 2 else photo
    total_boxes += len(anonymise(photo)[1])
print(f"false boxes on the 13 faceless photos: {total_boxes} (each one blurs something that is not a face)")
print("an honest report: recall on tilted faces, false boxes per image, leak rate on video, and the anonymisation method with its reversibility")
```

## How it works

| Piece | Purpose |
|---|---|
| Viola-Jones cascade | a fast classical face detector, trained on upright frontal faces |
| Recall, not precision | a missed face is a privacy failure, a false box only a cosmetic one |
| Rotation search | handles in-plane head tilt at the cost of more computation |
| Margin | covers the whole head and detector jitter |
| Temporal holding | bridges the frames where the detector flickers |
| Solid fill / strong blur | information is actually removed; light blur is reversible |
| Leak rate | the metric that matters in a video |

**What this filter does not do**: profile and looking-down faces (the cascade is frontal), masked or partly hidden faces, tiny faces, other personal data (number plates, name badges, screens, tattoos, voices, gait), and **context**: a person can be recognised from clothing and place. Modern systems use **learned face detectors** (RetinaFace, YuNet, SCRFD) with far better recall on all poses, run them **at the edge** (nothing sensitive leaves the device), keep **no raw footage** where possible, and follow the law (GDPR in the EU, the DPDP Act in India): **purpose limitation, minimisation, retention limits, transparency**. A privacy filter is one control in a privacy programme, not the programme.

:::exercise Extend it
1. Replace the Haar cascade by OpenCV's **YuNet** or a DNN face detector in your own environment and repeat the rotation and leak experiments.
2. Detect **profile faces** with `haarcascade_profileface.xml` and add them to the detector; measure the change in recall.
3. Replace the hold with a **Kalman tracker** (module 6) that predicts where the face moves and keep blurring the predicted box.
4. Add **number plates**: train or find a plate detector and apply the same pipeline.
5. Make the filter **fail closed**: if the detector's confidence is low, or the previous frame had a face and this one has none, blur the area where the face was.
6. Measure the **compute cost** (milliseconds per frame) of the rotation search and find the smallest angle set that still gives zero leaks in the simulation.
:::

:::keypoints
- For anonymisation, recall is the metric: a missed face is a privacy failure, an extra box is a cosmetic cost; report a leak rate per frame.
- A frontal Haar cascade loses recall quickly with head tilt; rotation search, margins and temporal holding bring the leak rate down.
- Light blur can be reversed by deconvolution; strong blur, coarse pixelation or a solid fill remove the information.
- Evaluate in video, not only in single images; detectors flicker.
- Privacy filters are one control among many: minimise collection, process at the edge, limit retention and follow the law.
:::
