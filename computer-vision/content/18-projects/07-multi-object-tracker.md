---
title: Build a Multi-Object Tracker
level: advanced
time: 60
icon: route
cover: #ef4444,#3b82f6
tags: background subtraction, kalman filter, hungarian algorithm, tracking by detection, MOTA
summary: Track several moving objects through a video. Detect them with background subtraction, predict each with a Kalman filter, assign detections to tracks with the Hungarian algorithm, manage track birth and death, and score the result with MOT metrics (MOTA, ID switches) against ground truth, including what happens when the detector drops frames or merges two objects.
---

**Tracking by detection** is how most real systems follow objects: a detector finds objects in each frame, and a tracker links the detections over time so each object keeps an **identity**. The linking logic is classical (module 6): a **Kalman filter** predicts where each object should be, the **Hungarian algorithm** matches predictions to detections, and simple rules start and stop tracks. This is the core of SORT and ByteTrack.

**What you'll build:** a detector, a Kalman filter, a tracker, and an evaluation that counts **missed objects, false alarms and identity switches** against the true trajectories.

:::flow The pipeline
Video frames | static camera, three moving objects
Background model | median of the frames
Detect | difference, threshold, blobs
Predict | Kalman filter per track
Associate | Hungarian algorithm on IoU
Update and manage | confirm, coast, delete
Evaluate | MOTA, ID switches
:::

## Step 1 — A video with ground-truth tracks

`cvlab.video()` makes 60 frames of a fixed camera: a red ball, a blue box and a yellow ellipse move across a textured background. Around frame 30 the **ellipse passes in front of the ball**, which will create exactly the kind of difficulty trackers must handle. It also returns the **true box of each object in every frame**, the ground truth.

```python run shared title="Step 1 · video and ground truth"
import numpy as np
import cv2
import cvlab
from scipy.optimize import linear_sum_assignment

frames, truth = cvlab.video(n=60, size=(320, 240), noise=3)
N = len(frames)
print(f"{N} frames of {frames[0].shape[1]}x{frames[0].shape[0]}; objects: {list(truth)}")
for name, boxes in truth.items():
    visible = sum(b is not None for b in boxes)
    print(f"  {name:<8} visible in {visible} frames; first box {tuple(round(v) for v in boxes[0]) if boxes[0] else None}")

def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1])); i = ix * iy
    return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i + 1e-9)

strip = np.hstack([frames[0], frames[30], frames[59]])
cvlab.show(strip, "Frames 0, 30 and 59: the ellipse crosses in front of the ball around frame 30")
```

## Step 2 — Detect by background subtraction

For a **fixed camera** the background is whatever stays the same: the per-pixel **median over time** removes moving objects (each pixel is background most of the time). A frame's difference from the background, thresholded and cleaned with morphology (module 2), leaves blobs; **connected components** (module 3) give their boxes. We score the detector against the truth: how many true objects are found, how many boxes are false alarms.

```python run shared title="Step 2 · background model and detections"
gray = np.array([cv2.cvtColor(f, cv2.COLOR_RGB2GRAY) for f in frames]).astype(np.float32)
background = np.median(gray, axis=0)

def detect(i, thr=25):
    diff = cv2.GaussianBlur(np.abs(gray[i] - background), (5, 5), 0)
    mask = (diff > thr).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))          # remove noise specks
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))         # join the pieces of one object
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    return [(stats[k, 0], stats[k, 1], stats[k, 0] + stats[k, 2], stats[k, 1] + stats[k, 3]) for k in range(1, n) if stats[k, 4] > 120]

detections = [detect(i) for i in range(N)]
tp = fp = fn = 0
for i in range(N):
    gts = [truth[k][i] for k in truth if truth[k][i] is not None]
    used = set()
    for g in gts:
        best = max(((iou(g, d), j) for j, d in enumerate(detections[i]) if j not in used), default=(0, -1))
        if best[0] > 0.4: tp += 1; used.add(best[1])
        else: fn += 1
    fp += len(detections[i]) - len(used)
print(f"detector: {tp} objects found, {fn} missed, {fp} false boxes (over {N} frames)")
counts = [len(d) for d in detections]
merged = [i for i in range(N) if counts[i] < sum(truth[k][i] is not None for k in truth)]
print(f"frames where fewer boxes than objects were found: {merged[0]}-{merged[-1]} ({len(merged)} frames): the ball and the ellipse overlap and form ONE blob")
vis = frames[30].copy()
for x1, y1, x2, y2 in detections[30]: cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 255, 0), 2)
cvlab.show(vis, "Frame 30: two touching objects, one detection")
```

## Step 3 — A Kalman filter for each track

Each track has a **state** `[x, y, vx, vy]` (centre and velocity) and a **covariance** that says how unsure we are. Every frame: **predict** with the constant-velocity model (`x ← F x`, uncertainty grows), then, if a detection is matched, **update**: the Kalman gain `K` blends the prediction and the measurement according to their uncertainties (module 6). When no detection arrives, the track **coasts** on its prediction.

```python run shared title="Step 3 · the Kalman filter"
class Kalman:
    """Constant-velocity filter for the box centre; the box size is smoothed separately."""
    def __init__(self, box):
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        self.x = np.array([cx, cy, 0.0, 0.0]); self.P = np.diag([10., 10., 100., 100.])         # unknown velocity: large variance
        self.wh = np.array([box[2] - box[0], box[3] - box[1]], float)
        self.F = np.array([[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], float)       # position += velocity each frame
        self.H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], float)                                    # we measure the position only
        self.Q = np.diag([1., 1., 0.5, 0.5])                                                      # process noise: how much the motion can change
        self.R = np.diag([4., 4.])                                                                # measurement noise of the detector
    def predict(self):
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q
        return self.box()
    def update(self, box):
        z = np.array([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2])
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)                                                   # Kalman gain
        self.x = self.x + K @ (z - self.H @ self.x)
        self.P = (np.eye(4) - K @ self.H) @ self.P
        self.wh = 0.7 * self.wh + 0.3 * np.array([box[2] - box[0], box[3] - box[1]])
    def box(self):
        cx, cy = self.x[:2]; w, h = self.wh
        return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)

# the filter learns the velocity from noisy measurements of a ball moving 4 px per frame
rng = np.random.default_rng(0)
kf = Kalman((10, 10, 30, 30))
for t in range(1, 16):
    kf.predict(); kf.update((10 + 4 * t + rng.normal(0, 2), 10, 30 + 4 * t + rng.normal(0, 2), 30))
print(f"after 15 noisy measurements: estimated velocity {kf.x[2]:.2f} px/frame (true 4.00), position uncertainty {np.sqrt(kf.P[0, 0]):.2f} px")
for _ in range(5): kf.predict()                                                                    # 5 frames without measurements
print(f"after coasting for 5 frames: position uncertainty grew to {np.sqrt(kf.P[0, 0]):.2f} px")
```

## Step 4 — The tracker: predict, associate, update, manage

For each frame:

1. **Predict** every track's new box.
2. Build a **cost matrix** between tracks and detections: `1 − IoU(predicted box, detection)`.
3. Solve the assignment with the **Hungarian algorithm** (`linear_sum_assignment`), which finds the globally cheapest one-to-one matching, then reject pairs whose IoU is below a **gate** (they are not really the same object).
4. **Update** matched tracks; count a **miss** for the others; start a **new track** for each unmatched detection.
5. **Delete** a track after `max_age` frames without a match; only report a track after `min_hits` matches (to ignore one-frame false alarms).

```python run shared title="Step 4 · tracker with Hungarian assignment"
class Tracker:
    def __init__(self, use_kalman=True, max_age=10, min_hits=2, iou_gate=0.1):
        self.tracks, self.next_id = [], 1
        self.use_kalman, self.max_age, self.min_hits, self.iou_gate = use_kalman, max_age, min_hits, iou_gate
    def step(self, dets):
        preds = [t["kf"].predict() if self.use_kalman else t["last"] for t in self.tracks]          # without a filter: assume the object did not move
        matches, unmatched = {}, set(range(len(dets)))
        if preds and dets:
            cost = np.array([[1 - iou(p, d) for d in dets] for p in preds])
            for r, c in zip(*linear_sum_assignment(cost)):                                          # Hungarian algorithm: best global one-to-one matching
                if 1 - cost[r, c] >= self.iou_gate:
                    matches[r] = c; unmatched.discard(c)
        for i, t in enumerate(self.tracks):
            if i in matches:
                d = dets[matches[i]]; t["kf"].update(d); t["last"] = d; t["age"] = 0; t["hits"] += 1
            else:
                t["age"] += 1                                                                        # missed: coast on the prediction
        for j in unmatched:
            self.tracks.append(dict(id=self.next_id, kf=Kalman(dets[j]), last=dets[j], age=0, hits=1)); self.next_id += 1
        self.tracks = [t for t in self.tracks if t["age"] <= self.max_age]
        return [(t["id"], t["kf"].box() if (t["age"] > 0 and self.use_kalman) else t["last"]) for t in self.tracks if t["hits"] >= self.min_hits]

tracker = Tracker()
outputs = [tracker.step(detections[i]) for i in range(N)]
print("tracks reported per frame:", [len(o) for o in outputs][:12], "...", [len(o) for o in outputs][-5:])
print("track ids used in total:", tracker.next_id - 1, "(3 objects: every extra id is an identity problem)")
colours = {1: (255, 0, 0), 2: (0, 200, 0), 3: (0, 120, 255), 4: (255, 0, 255), 5: (0, 255, 255)}
trail = frames[0].copy()
for o in outputs:
    for tid, b in o:
        cv2.circle(trail, (int((b[0] + b[2]) / 2), int((b[1] + b[3]) / 2)), 2, colours.get(tid, (255, 255, 255)), -1)
cvlab.show(trail, "Trajectories coloured by track id")
```

## Step 5 — Evaluate with MOT metrics

For every frame we **match the tracker's boxes to the true boxes** (Hungarian again, IoU ≥ 0.3), then count:

- **FN**: true objects with no matching track (misses), **FP**: tracker boxes matching no object (false alarms);
- **ID switches**: an object whose matched track id **changes** compared with the previous match;
- **MOTA** = `1 − (FN + FP + IDSW) / (number of true objects)`; **MOTP** = mean IoU of the matches (localisation quality).

We compare a tracker **without** the Kalman filter (it assumes objects do not move between frames) with the Kalman version, with a perfect detector and with a detector that randomly **drops 20% of the detections**.

```python run shared title="Step 5 · MOTA and identity switches"
def evaluate(outs, truth, thr=0.3):
    idsw = fn = fp = gt_total = 0; last_id = {}; ious = []
    for i in range(len(outs)):
        gts = {k: truth[k][i] for k in truth if truth[k][i] is not None}; gt_total += len(gts)
        tr = outs[i]
        if gts and tr:
            keys = list(gts)
            cost = np.array([[1 - iou(gts[k], b) for _, b in tr] for k in keys])
            gm, tm = set(), set()
            for r, c in zip(*linear_sum_assignment(cost)):
                if 1 - cost[r, c] >= thr:
                    gm.add(r); tm.add(c); ious.append(1 - cost[r, c])
                    if keys[r] in last_id and last_id[keys[r]] != tr[c][0]: idsw += 1
                    last_id[keys[r]] = tr[c][0]
            fn += len(keys) - len(gm); fp += len(tr) - len(tm)
        else:
            fn += len(gts); fp += len(tr)
    return dict(MOTA=1 - (fn + fp + idsw) / gt_total, IDSW=idsw, FN=fn, FP=fp, MOTP=float(np.mean(ious)))

print("tracker                            |  MOTA | ID switches | missed | false")
for name, kalman, drop in [("no filter (last box)", False, 0.0), ("Kalman + Hungarian", True, 0.0),
                            ("no filter, 20% dropped detections", False, 0.2), ("Kalman, 20% dropped detections", True, 0.2)]:
    rng = np.random.default_rng(0)
    tr = Tracker(use_kalman=kalman)
    outs = [tr.step([d for d in detections[i] if rng.random() >= drop]) for i in range(N)]
    m = evaluate(outs, truth)
    print(f"{name:<34} | {m['MOTA']:.3f} | {m['IDSW']:>11} | {m['FN']:>6} | {m['FP']:>5}")
print("the Kalman prediction keeps the tracks alive and well-placed through missing detections")
```

## Step 6 — The one failure you cannot fix in the tracker

Look at the table: even the best tracker has an **identity switch** at the crossing. The cause is not the association logic. While the ball and the ellipse overlap, the **detector returns one merged box**: only one of the two tracks can be matched to it, and the other one coasts on its prediction until its age limit is reached. When the objects separate, the lost object is detected as a *new* object and receives a **new identity**. A tracker can only be as good as the evidence it receives. The printout below shows the moment: track 1 disappears and track 4 is born.

```python run shared title="Step 6 · inspecting the crossing"
tr = Tracker(); outs = [tr.step(detections[i]) for i in range(N)]
print("frame | detections | tracks (id: centre)")
for i in range(24, 40, 2):
    print(f"{i:>5} | {len(detections[i]):>10} | " + ", ".join(f"{tid}: ({(b[0] + b[2]) / 2:.0f},{(b[1] + b[3]) / 2:.0f})" for tid, b in outs[i]))
mosaic = np.hstack([cv2.resize(frames[i], None, fx=0.75, fy=0.75) for i in (26, 31, 36)])
cvlab.show(mosaic, "Frames 26, 31, 36: approach, overlap (one blob), separation")
print("fixes in real systems: a better detector (separates overlapping objects), appearance features (re-identification), splitting merged blobs, or keeping the track hypothesis for both objects")
```

## How it works

| Piece | Purpose |
|---|---|
| Median background | for a fixed camera, a cheap detector with no training |
| Morphology + components | clean blobs and their boxes |
| Kalman filter | smooths noisy detections, estimates velocity, **predicts** during missing frames |
| `1 − IoU` cost + Hungarian | the globally best one-to-one assignment (greedy nearest-box matching makes order-dependent mistakes) |
| IoU gate | refuses nonsense matches (a far-away detection is not this object) |
| `min_hits` and `max_age` | suppress one-frame false alarms and survive short occlusions |
| MOTA, ID switches | one number that counts misses, false alarms and identity changes together |

**Where it breaks**: a moving camera (background subtraction fails; compensate the motion, module 6), crowded scenes with many overlaps, long occlusions (a track dies after `max_age` and the object gets a new id when it returns), similar-looking objects (no appearance cue), and non-linear motion (use a better motion model or an EKF). Modern trackers keep this structure and improve the parts: **ByteTrack** also uses low-confidence detections, **DeepSORT** adds an appearance embedding, **OC-SORT** corrects the Kalman filter during occlusions.

:::exercise Extend it
1. Add an **appearance cue**: the median colour inside each box, and add `λ · colour_distance` to the association cost. Does the ID switch at the crossing disappear? Why or why not?
2. Try `max_age = 2` and `max_age = 30` with dropped detections and see how identities and false boxes change.
3. Replace the background-subtraction detector by `cv2.createBackgroundSubtractorMOG2` and compare detection quality.
4. Implement **greedy matching** (best IoU first) instead of the Hungarian algorithm and construct a case where it makes a mistake.
5. Add **ByteTrack's second association**: match the leftover tracks with detections that have lower confidence (here, small blobs).
6. Add **constant-acceleration** to the filter and test on a ball that speeds up.
:::

:::keypoints
- Tracking by detection = detect, predict (Kalman), associate (Hungarian on IoU), update, and manage track life with `min_hits` and `max_age`.
- The Kalman filter smooths measurements, estimates velocity and keeps tracks alive through missing detections.
- The Hungarian algorithm gives the globally best assignment; an IoU gate rejects implausible pairs.
- MOTA combines misses, false alarms and ID switches; always inspect where the errors happen.
- A tracker cannot repair a detector's failures (merged blobs); better detection and appearance features address them.
:::
