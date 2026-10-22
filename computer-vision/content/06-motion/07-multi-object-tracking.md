---
title: Multi-Object Tracking — SORT, DeepSORT, ByteTrack
level: advanced
time: 60
summary: Track many objects at once by detecting in every frame and linking detections over time. IoU matching with the Hungarian algorithm, SORT written from scratch with Kalman filters, ID switches and occlusions, appearance features (DeepSORT), the low-score trick of ByteTrack, and the metrics MOTA, IDF1 and HOTA.
---

In a street scene there are dozens of people and cars. You want not only *where* they are in each frame, but *which is which* over time: person #7 walked from the door to the till. This is **multi-object tracking (MOT)**. It is the base of people counting, traffic analysis, sports analytics, and robots that must follow or avoid moving things.

## Tracking by detection

The dominant design: **run an object detector on every frame, then link the detections over time.**

:::flow The tracking-by-detection loop
1. Detect | A detector gives boxes (with scores and classes) in the new frame.
2. Predict | Each existing track predicts where its object should be now (Kalman filter).
3. Associate | Match detections to predicted tracks (IoU or appearance, solved as an assignment problem).
4. Update | Matched tracks update their state with the detection. Unmatched detections start new tracks. Tracks unmatched for too long are deleted.
5. Output | Report each track's ID and box for this frame.
:::

The heart is step 3: **data association**.

## Data association: the Hungarian algorithm

Build a **cost matrix**: rows are tracks, columns are detections, and each cell is the cost of matching them, for example `1 − IoU(predicted box, detection box)`. We want the assignment of tracks to detections with the **smallest total cost**, with each track and detection used at most once. This is the **assignment problem**, solved exactly by the **Hungarian algorithm** (`scipy.optimize.linear_sum_assignment`). Pairs with an IoU below a threshold are rejected afterwards.

```python run title="Association with IoU and the Hungarian algorithm" level=intermediate shared
import numpy as np
from scipy.optimize import linear_sum_assignment

def iou_matrix(A, B):
    """A: (n, 4), B: (m, 4) boxes as x1, y1, x2, y2. Returns the (n, m) matrix of IoU values."""
    A, B = np.asarray(A, float), np.asarray(B, float)
    ix1 = np.maximum(A[:, None, 0], B[None, :, 0]); iy1 = np.maximum(A[:, None, 1], B[None, :, 1])
    ix2 = np.minimum(A[:, None, 2], B[None, :, 2]); iy2 = np.minimum(A[:, None, 3], B[None, :, 3])
    inter = np.clip(ix2 - ix1, 0, None) * np.clip(iy2 - iy1, 0, None)
    area = lambda X: (X[:, 2] - X[:, 0]) * (X[:, 3] - X[:, 1])
    return inter / (area(A)[:, None] + area(B)[None, :] - inter + 1e-9)

predicted = np.array([[10, 10, 50, 60], [100, 40, 150, 100], [200, 20, 240, 70]])         # where the 3 tracks should be now
detections = np.array([[104, 44, 152, 104], [12, 14, 52, 62], [300, 100, 340, 150]])      # what the detector found (different order, one new object)

iou = iou_matrix(predicted, detections)
print("IoU matrix (rows: tracks, columns: detections):\n", np.round(iou, 2))
rows, cols = linear_sum_assignment(1 - iou)                                              # minimise the total cost 1 - IoU
for r, c in zip(rows, cols):
    status = "match" if iou[r, c] >= 0.3 else "rejected (IoU too low)"
    print(f"track {r} <-> detection {c}: IoU {iou[r, c]:.2f}  {status}")
print("unmatched detections (become new tracks):", sorted(set(range(len(detections))) - set(cols[iou[rows, cols] >= 0.3])))
```

(Greedy matching, "take the best pair first", can make mistakes when two tracks compete for one detection; the Hungarian algorithm finds the best **global** assignment.)

## SORT: the simple baseline that works

**SORT** (Simple Online and Realtime Tracking, 2016) is just: a Kalman filter per track plus IoU association with the Hungarian algorithm. No appearance model. It is fast (hundreds of fps) and is the foundation of nearly every modern tracker. Here it is in full:

```python run title="SORT from scratch" level=advanced shared
class KalmanBox:
    """Constant-velocity Kalman filter for one box. State: centre x, y, width, height, and the velocity of the centre."""
    count = 0
    def __init__(self, box):
        x1, y1, x2, y2 = box
        self.x = np.array([(x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1, 0, 0], float)
        self.P = np.diag([10, 10, 10, 10, 100, 100]).astype(float)
        self.F = np.eye(6); self.F[0, 4] = self.F[1, 5] = 1
        self.H = np.eye(4, 6)
        self.Q = np.diag([1, 1, 1, 1, 0.5, 0.5]).astype(float)
        self.R = np.eye(4) * 9.0
        KalmanBox.count += 1
        self.id = KalmanBox.count
        self.hits, self.age, self.since_update = 1, 0, 0
    def predict(self):
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q
        self.age += 1; self.since_update += 1
        return self.box()
    def update(self, box):
        z = np.array([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2, box[2] - box[0], box[3] - box[1]], float)
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ (z - self.H @ self.x)
        self.P = (np.eye(6) - K @ self.H) @ self.P
        self.hits += 1; self.since_update = 0
    def box(self):
        cx, cy, w, h = self.x[:4]
        return np.array([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2])

class Sort:
    def __init__(self, max_age=5, min_hits=2, iou_thr=0.2):
        self.max_age, self.min_hits, self.iou_thr = max_age, min_hits, iou_thr
        self.tracks = []
        KalmanBox.count = 0
    def update(self, dets):
        preds = [t.predict() for t in self.tracks]                                       # 1. predict
        matched, unmatched_d = [], list(range(len(dets)))
        if preds and len(dets):
            iou = iou_matrix(preds, dets)
            rows, cols = linear_sum_assignment(1 - iou)                                  # 2. associate
            for r, c in zip(rows, cols):
                if iou[r, c] >= self.iou_thr:
                    matched.append((r, c)); unmatched_d.remove(c)
        for r, c in matched:                                                             # 3. update matched tracks
            self.tracks[r].update(dets[c])
        for c in unmatched_d:                                                            # 4. new tracks for unmatched detections
            self.tracks.append(KalmanBox(dets[c]))
        self.tracks = [t for t in self.tracks if t.since_update <= self.max_age]         # 5. remove old tracks
        return [(t.id, t.box()) for t in self.tracks if t.since_update == 0 and t.hits >= self.min_hits]
```

Now run it on the synthetic video. We build detections from the true boxes, then make the detector **realistic**: jitter, random misses, a couple of false alarms, and the **ball hidden** while the ellipse passes in front of it (frames 28–34).

```python run title="Run SORT and measure ID switches" level=advanced shared
import cvlab
frames, tracks = cvlab.video(n=60)
names = list(tracks)
rng = np.random.default_rng(0)

def make_detections():
    dets = []
    for t in range(60):
        d = []
        for name in names:
            b = tracks[name][t]
            if b is None or (name == "ball" and 28 <= t <= 34) or rng.random() < 0.08:          # missing: outside, occluded, or simply missed
                continue
            d.append(np.array(b) + rng.normal(0, 1.5, 4))                                       # jittered box
        if rng.random() < 0.1:
            d.append(np.array([40, 180, 80, 215.0]))                                             # a false alarm
        dets.append(np.array(d).reshape(-1, 4))
    return dets
detections = make_detections()

def evaluate(max_age):
    sort = Sort(max_age=max_age, min_hits=1, iou_thr=0.2)
    fn = fp = idsw = total = 0
    last_id = {}
    for t in range(60):
        out = sort.update(detections[t])
        gt = [(n, tracks[n][t]) for n in names if tracks[n][t] is not None and not (n == "ball" and 28 <= t <= 34)]       # objects that could be seen
        total += len(gt)
        ious = iou_matrix([g[1] for g in gt], [o[1] for o in out]) if gt and out else np.zeros((len(gt), len(out)))
        used = set()
        for gi, (n, _) in enumerate(gt):
            j = int(ious[gi].argmax()) if ious.shape[1] else -1
            if j >= 0 and ious[gi, j] > 0.4 and j not in used:
                used.add(j)
                tid = out[j][0]
                if n in last_id and last_id[n] != tid:
                    idsw += 1                                                                     # this object now has a different ID
                last_id[n] = tid
            else:
                fn += 1                                                                           # a visible object without a track
        fp += len(out) - len(used)                                                                # tracks that match no object
    mota = 1 - (fn + fp + idsw) / total
    return fn, fp, idsw, mota, sort

print("max_age  missed(FN)  false(FP)  ID switches   MOTA")
for max_age in (1, 3, 10):
    fn, fp, idsw, mota, _ = evaluate(max_age)
    print(f"{max_age:7d} {fn:11d} {fp:10d} {idsw:12d} {mota:7.2f}")
```

`max_age` is how many frames a track may stay unmatched before it is deleted. A larger value lets the Kalman **prediction carry a track through an occlusion**, so the object keeps its ID. Too large, and old tracks can steal new detections or linger as ghosts.

:::note The Kalman prediction is what keeps the ball's identity
During the six frames when the ball is hidden behind the ellipse, there are no detections. The tracker keeps predicting the ball's position from its speed. When the ball re-appears, it is close to the prediction, so the IoU matches and the **old ID continues**. Without the prediction (or with too small `max_age`) the ball would get a new ID.
:::

## When IoU is not enough: DeepSORT

IoU fails when objects **overlap heavily** (crowds), when the **camera moves** (boxes jump), or when a track is lost for a while (the prediction is far from the new detection). **DeepSORT** (2017) adds an **appearance embedding**: a small CNN (a re-identification network) turns each detection's crop into a vector, so that crops of the **same person** are close. The association cost mixes **motion** (Mahalanobis distance from the Kalman prediction) and **appearance** (cosine distance to the track's stored embeddings), and uses **cascade matching**, trying recently seen tracks first. The result: far fewer ID switches, at the price of running a re-ID network on every box.

## ByteTrack: don't throw away low-score boxes

A detector gives a score for each box. Most trackers **discard** low-score boxes (below 0.5–0.6) as unreliable. But a partly occluded person often gets a **low score**, and discarding it makes the track disappear exactly when you need it. **ByteTrack** (2021) uses **all** boxes in two stages:

1. Match **high-score** detections with tracks (IoU, Hungarian).
2. Match the **remaining tracks** with the **low-score** detections (a second, looser pass).

Low-score boxes that match a track are kept (partly hidden objects); low-score boxes that match nothing are treated as background and dropped. This simple trick gave a big jump in accuracy at almost no cost, and ByteTrack became the default practical tracker.

## The tracker family

| Tracker | Idea |
|---|---|
| **SORT** | Kalman filter + IoU + Hungarian. Fast baseline |
| **DeepSORT** | Adds appearance embeddings and cascade matching |
| **ByteTrack** | Two-stage association using low-score detections too |
| **OC-SORT** | Better handling of non-linear motion and occlusion (observation-centric updates) |
| **BoT-SORT, StrongSORT** | Add camera-motion compensation, better re-ID and Kalman details |
| **JDE, FairMOT** | One network for detection and re-ID embeddings (joint) |
| **CenterTrack** | Tracks objects as points; the network predicts offsets to the previous frame |
| **MOTR, TrackFormer, MOTRv2** | Transformer "track queries" carry identity across frames end-to-end |
| **SAM 2 based trackers** | Mask tracking with memory |

## Metrics

MOT quality has several aspects: finding the objects, localising them, and **keeping identities**. Hence several metrics:

- **MOTA** (multi-object tracking accuracy) = `1 − (FN + FP + IDSW) / GT`. Counts all errors, but is dominated by detection quality.
- **IDF1**: the F1 score of **identity** assignments; measures how well identities are preserved over the whole sequence.
- **HOTA** (higher-order tracking accuracy): balances detection accuracy and association accuracy, and is now the main metric. It averages over localisation thresholds.
- **ID switches (IDSW)**, **fragmentation**, **mostly tracked / mostly lost** fractions.
- Benchmarks: **MOT17/MOT20** (pedestrians), **DanceTrack** (similar-looking dancers: hard for appearance), **SportsMOT**, **BDD100K** and **nuScenes** (driving), **KITTI**.

:::interview Questions you may get
- "How does tracking-by-detection work?" Detect every frame, predict tracks with a motion model, associate detections to tracks (Hungarian), update, create and delete tracks.
- "What is the Hungarian algorithm used for?" Optimal one-to-one assignment of tracks to detections that minimises the total cost.
- "How does SORT handle occlusions?" The Kalman filter keeps predicting while no detection matches, up to `max_age` frames.
- "What does DeepSORT add?" Appearance embeddings from a re-ID network, combined with motion distance, which reduces ID switches in crowded scenes.
- "What is the key idea of ByteTrack?" Use low-score detections in a second association pass to keep partly occluded objects.
- "MOTA versus IDF1 versus HOTA?" MOTA is dominated by detection errors; IDF1 measures identity consistency; HOTA balances detection and association.
- "What happens when the camera moves?" Predictions and detections both move: compensate camera motion (homography, optical flow, as in BoT-SORT) before association.
:::

```quiz
? What does the Hungarian algorithm solve in MOT?
+ The globally optimal one-to-one assignment of detections to tracks
- Object detection
- Kalman prediction
> It minimises the total association cost.

? A tracker deletes tracks after a single missed frame (max_age = 1). What is a likely result?
+ More ID switches after short occlusions
- Fewer false detections
- Faster detection
> The object gets a new ID when it re-appears.

? What is the main idea of ByteTrack?
- Using a bigger detector
+ Also associate low-score detections with unmatched tracks in a second pass
- Removing the Kalman filter
> It keeps partly occluded objects that detectors score low.

? Which metric focuses on keeping consistent identities over a whole sequence?
- mAP
+ IDF1
- PSNR
> HOTA combines detection and association quality.
```

:::problem Your tracker works in the daytime but produces many ID switches in a crowded evening scene with people in similar dark clothes. What do you change? {level=hard tags="mot,id-switch,appearance"}
Think about what information separates the people.

:::solution Model answer
IoU and colour/appearance both become ambiguous: overlapping boxes and similar clothes. Improve the motion model and camera compensation; keep low-score detections (ByteTrack-style); use appearance features trained for re-ID on data like yours (fine-tune on night crowd images), and combine them with motion in the cost (not appearance alone); use longer-term memory of embeddings; increase `max_age` and use gating by the Kalman covariance; improve the detector for crowd and low light (the source of FN and merged boxes); consider a transformer-based tracker or a tracker with global association (graph-based or offline refinement) if latency allows. Evaluate with HOTA/IDF1 on a labelled sample of this exact scene.
:::
:::

:::keypoints
- MOT = detect every frame, predict with Kalman, associate with the Hungarian algorithm on IoU (and appearance), update, create and delete tracks.
- SORT is Kalman + IoU + Hungarian; `max_age` lets predictions carry tracks through occlusions. DeepSORT adds appearance; ByteTrack uses low-score boxes.
- Camera motion needs compensation; crowds need appearance and better motion models.
- Metrics: MOTA, IDF1, HOTA, ID switches. Benchmarks: MOT17/20, DanceTrack.
:::

:::resources
- [Bewley et al.: Simple Online and Realtime Tracking (SORT)](https://arxiv.org/abs/1602.00763) — the baseline.
- [Wojke et al.: Simple Online and Realtime Tracking with a Deep Association Metric (DeepSORT)](https://arxiv.org/abs/1703.07402) — adds appearance.
- [Zhang et al.: ByteTrack: Multi-Object Tracking by Associating Every Detection Box](https://arxiv.org/abs/2110.06864) — the low-score trick.
- [Luiten et al.: HOTA: A Higher Order Metric for Evaluating Multi-Object Tracking](https://arxiv.org/abs/2009.07736) — the modern metric.
:::
