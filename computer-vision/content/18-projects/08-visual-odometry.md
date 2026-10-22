---
title: Build a Visual Odometry System
level: advanced
time: 60
icon: rocket
cover: #0891b2,#a3e635
tags: orb, sift, feature matching, ransac, motion estimation, drift, keyframes
summary: Estimate how a camera moved from the images alone. A downward-looking camera flies over a textured map along a known path; you match features between consecutive frames, estimate the motion with RANSAC, chain the motions into a trajectory, measure drift against the truth, and see how features, keyframes, speed and noise change the accuracy.
---

**Visual odometry (VO)** answers "how did I move?" from camera images. A robot or drone uses it when wheels or GPS are unreliable. The basic loop is always the same (module 5): **find features, match them between two frames, estimate the relative motion robustly, and chain the motions** to get a trajectory. Errors accumulate, so the trajectory **drifts**. SLAM adds a map and loop closure to correct drift; VO is the first half.

To keep the geometry simple, our camera looks **straight down at a flat textured ground** (like a drone or an optical-flow sensor). Then the motion between two frames is a **2-D rotation plus translation** (a similarity transform), which `cv2.estimateAffinePartial2D` estimates with RANSAC. Real 3-D VO estimates the essential matrix or uses PnP, but the pipeline and the lessons about drift are the same.

**What you'll build:** a frame-to-frame VO with RANSAC, a trajectory evaluation (ATE and drift), and experiments with the feature type, keyframes, speed and noise.

:::flow The pipeline
Frames | camera looking down at the ground
Features | ORB or SIFT keypoints
Match | ratio test between neighbouring frames
RANSAC motion | rotation + translation, outliers rejected
Chain | multiply the motions: a trajectory
Evaluate | error against the true path
Improve | keyframes, better features
:::

## Step 1 — A map, a path and a camera simulator

We build a large textured **map** (mirrored tiles of two ground textures mixed smoothly, plus a faint large-scale pattern) and a **path** that curves across it while the camera also turns. For each point of the path we render the **240 × 180 image the camera would see** (a rotated crop of the map) with sensor noise. The true poses are the ground truth we will compare against.

```python run shared title="Step 1 · map, path and the images the camera sees"
import numpy as np
import cv2
import cvlab

def make_map(seed=0):
    def mirror_tile(img, h, w):                                           # seamless tiling by mirroring
        out = img
        while out.shape[1] < w: out = np.hstack([out, out[:, ::-1]])
        while out.shape[0] < h: out = np.vstack([out, out[::-1]])
        return out[:h, :w]
    to_rgb = lambda a: cv2.cvtColor(a, cv2.COLOR_GRAY2RGB) if a.ndim == 2 else a
    g, b, c = to_rgb(cvlab.image("gravel")), to_rgb(cvlab.image("brick")), to_rgb(cvlab.image("coffee"))
    h, w = 700, 1050
    ground, brick = mirror_tile(g, h, w).astype(np.float32), mirror_tile(b, h, w).astype(np.float32)
    big = cv2.resize(c, (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    blend = cv2.GaussianBlur(np.random.default_rng(seed).random((h, w)).astype(np.float32), (0, 0), 60)
    blend = (blend - blend.min()) / (blend.max() - blend.min())
    return np.clip(0.8 * (blend[..., None] * ground + (1 - blend[..., None]) * brick) + 0.2 * big, 0, 255).astype(np.uint8)

MAP = make_map()
FW, FH = 240, 180                                                         # the camera image size

def make_path(n=80):
    t = np.linspace(0, 1, n)
    cx, cy = MAP.shape[1] / 2, MAP.shape[0] / 2
    x = cx + 0.30 * MAP.shape[1] * np.cos(2 * np.pi * 0.85 * t + np.pi) * (0.6 + 0.4 * t)
    y = cy + 0.28 * MAP.shape[0] * np.sin(2 * np.pi * 0.85 * t + np.pi)
    heading = np.arctan2(np.gradient(y), np.gradient(x))                  # the camera turns to follow the path
    return np.stack([x, y, heading], 1)                                   # (x, y, angle) of the image centre in map coordinates

PATH = make_path()

def pose_matrix(p):                                                       # image pixel coordinates -> map coordinates
    c, s = np.cos(p[2]), np.sin(p[2])
    return np.array([[c, -s, p[0] - (c * FW / 2 - s * FH / 2)], [s, c, p[1] - (s * FW / 2 + c * FH / 2)], [0, 0, 1]])

def render(pose, rng, noise=3.0):
    img = cv2.warpAffine(MAP, pose_matrix(pose)[:2].astype(np.float32), (FW, FH), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
    return np.clip(img.astype(np.float32) + rng.normal(0, noise, img.shape), 0, 255).astype(np.uint8)

frames = [render(p, np.random.default_rng(i)) for i, p in enumerate(PATH)]
steps = np.linalg.norm(np.diff(PATH[:, :2], axis=0), axis=1)
print(f"{len(frames)} frames | path length {steps.sum():.0f} px | the camera moves {steps.mean():.1f} px per frame ({steps.mean() / FW:.0%} of the image width)")
overview = cv2.cvtColor(MAP, cv2.COLOR_RGB2BGR).copy()
cv2.polylines(overview, [PATH[:, :2].astype(np.int32)], False, (0, 255, 255), 3)
cvlab.show(cv2.cvtColor(overview, cv2.COLOR_BGR2RGB), "The map and the true path", np.hstack([frames[0], frames[1], frames[40]]), "Camera images: frames 0, 1 and 40")
```

## Step 2 — Motion between two frames

For two consecutive frames we detect features (ORB: fast binary descriptors), match them with the ratio test, and estimate the transform with **RANSAC**: random pairs of matches define a candidate rotation + translation, and the one supported by the most matches wins; matches that disagree are **outliers** and are discarded. The result is a 2×3 matrix `A` that maps points of the previous frame to the current frame.

```python run shared title="Step 2 · relative motion from two images"
def estimate_motion(a, b, detector, ratio=0.75):
    ga, gb = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY), cv2.cvtColor(b, cv2.COLOR_RGB2GRAY)
    ka, da = detector.detectAndCompute(ga, None); kb, db = detector.detectAndCompute(gb, None)
    if da is None or db is None or len(ka) < 6 or len(kb) < 6:
        return None
    norm = cv2.NORM_HAMMING if da.dtype == np.uint8 else cv2.NORM_L2        # binary descriptors use Hamming distance
    knn = cv2.BFMatcher(norm).knnMatch(da, db, k=2)
    good = [m for m, n in (p for p in knn if len(p) == 2) if m.distance < ratio * n.distance]
    if len(good) < 6:
        return None
    src = np.float32([ka[m.queryIdx].pt for m in good]); dst = np.float32([kb[m.trainIdx].pt for m in good])
    A, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=2.5)
    return None if A is None else (A, int(inliers.sum()), len(good))

orb = cv2.ORB_create(1000)
A, n_in, n_match = estimate_motion(frames[0], frames[1], orb)
angle = np.degrees(np.arctan2(A[1, 0], A[0, 0]))
print(f"matches after the ratio test: {n_match}, RANSAC inliers: {n_in}")
print(f"estimated motion: rotation {angle:.2f} degrees, translation ({A[0, 2]:.1f}, {A[1, 2]:.1f}) px, scale {np.hypot(A[0, 0], A[1, 0]):.3f} (a rigid motion should give 1.000)")
# the truth: the relative motion between the true poses
T0, T1 = pose_matrix(PATH[0]), pose_matrix(PATH[1])
A_true = np.linalg.inv(T1) @ T0                                            # maps frame-0 pixels to frame-1 pixels
print(f"true motion:      rotation {np.degrees(np.arctan2(A_true[1, 0], A_true[0, 0])):.2f} degrees, translation ({A_true[0, 2]:.1f}, {A_true[1, 2]:.1f}) px")
```

## Step 3 — Chain the motions into a trajectory

If `A` maps frame `k−1` pixels to frame `k` pixels, then the camera pose in the map evolves as `T_k = T_{k−1} · A⁻¹`. Starting from the true first pose (the only information we give VO), we apply this for every frame and track where the image centre goes.

```python run shared title="Step 3 · chaining relative motions"
def run_vo(frames, detector, keyframe_every=None, stride=1):
    used = list(range(0, len(frames), stride))
    T = pose_matrix(PATH[0]); centre = np.array([FW / 2, FH / 2, 1.0])
    traj = [T @ centre]; indices = [0]
    key_i, key_T = 0, T                                                    # the last keyframe and its pose
    for k in used[1:]:
        ref = key_i if keyframe_every else indices[-1]                     # compare with the keyframe, or with the previous frame
        r = estimate_motion(frames[ref], frames[k], detector)
        if r is None:
            return np.array(traj)[:, :2], indices, False                   # tracking lost
        base = key_T if keyframe_every else T
        T = base @ np.linalg.inv(np.vstack([r[0], [0, 0, 1]]))
        traj.append(T @ centre); indices.append(k)
        if keyframe_every and k - key_i >= keyframe_every:
            key_i, key_T = k, T                                            # make this frame the new keyframe
    return np.array(traj)[:, :2], indices, True

def errors(traj, indices):
    e = np.linalg.norm(traj - PATH[indices, :2], axis=1)
    return float(np.sqrt((e ** 2).mean())), float(e[-1])                  # ATE (RMSE over the path) and the final error

traj, idx, ok = run_vo(frames, orb)
ate, final = errors(traj, idx)
print(f"tracked all {len(idx)} frames: {ok}")
print(f"absolute trajectory error (RMSE): {ate:.2f} px | final position error: {final:.2f} px = {100 * final / steps.sum():.2f}% of the path length")
assert ok and ate < 6
plot = cv2.cvtColor(MAP, cv2.COLOR_RGB2BGR).copy()
cv2.polylines(plot, [PATH[:, :2].astype(np.int32)], False, (0, 255, 255), 4)       # truth in yellow
cv2.polylines(plot, [traj.astype(np.int32)], False, (0, 0, 255), 2)                  # estimate in red
cvlab.show(cv2.cvtColor(plot, cv2.COLOR_BGR2RGB), "Truth (yellow) and the visual-odometry estimate (red)")
```

## Step 4 — Features: ORB versus SIFT

SIFT descriptors are more distinctive and more accurate than ORB's binary ones, but about ten times slower. Here the question is how that shows up in **drift**. Each frame's motion error is small, but errors **add up** over the path, so the final error grows with the number of frames.

```python run shared title="Step 4 · feature type and keyframes"
print("features | strategy           | tracked | ATE (px) | final error (px) | inliers per frame (mean)")
for name, det in [("ORB", cv2.ORB_create(1000)), ("SIFT", cv2.SIFT_create(1000))]:
    for label, kf in [("previous frame", None), ("keyframe, every 5", 5)]:
        traj, idx, ok = run_vo(frames, det, keyframe_every=kf)
        ate, final = errors(traj, idx)
        inl = np.mean([estimate_motion(frames[idx[i]], frames[idx[i + 1]], det)[1] for i in range(0, len(idx) - 1, 8)])
        print(f"{name:<8} | {label:<18} | {'yes' if ok else 'LOST':>7} | {ate:>8.2f} | {final:>16.2f} | {inl:>10.0f}")
print("a keyframe strategy chains fewer motions, so it helped ORB; SIFT was already accurate and did not gain: the effect is not guaranteed, so measure it")
print("and the keyframe must still overlap the current frame: too long a gap and tracking is lost (try keyframe_every = 10 with ORB)")
```

## Step 5 — What makes VO fail? Speed and noise

Two common causes of failure: the camera moves **too far between frames** (little overlap, fewer matches) and the images are **noisy or blurred** (fewer reliable features). We test by skipping frames (a faster camera) and by adding sensor noise.

```python run shared title="Step 5 · speed and noise"
print("camera speed (px per frame) | tracked | ATE (px) | final error (px)")
for stride in (1, 3, 6):
    traj, idx, ok = run_vo(frames, orb, stride=stride)
    ate, final = errors(traj, idx)
    print(f"{steps.mean() * stride:>27.0f} | {'yes' if ok else 'LOST':>7} | {ate:>8.2f} | {final:>16.2f}")
print("larger steps mean fewer motions to chain, so less accumulation, until the overlap between frames becomes too small for reliable matching")
print()
print("image noise (grey levels) | tracked | ATE (px) | final error (px)")
for noise in (3, 15, 30):
    noisy = [render(p, np.random.default_rng(i), noise=noise) for i, p in enumerate(PATH)]
    traj, idx, ok = run_vo(noisy, orb)
    ate, final = errors(traj, idx)
    print(f"{noise:>25} | {'yes' if ok else 'LOST':>7} | {ate:>8.2f} | {final:>16.2f}")
print("drift grows quickly with noise: fewer inliers -> noisier motion estimates -> larger accumulated error")
```

## How it works

| Piece | Purpose |
|---|---|
| Ratio-test matching | removes ambiguous matches before the geometry step |
| RANSAC + similarity transform | robust to the matches that are wrong (outliers) |
| Chaining `T_k = T_{k−1} A⁻¹` | converts relative motions into a trajectory |
| ATE and final error | quantify accuracy and drift against the ground truth |
| Keyframes | fewer chained motions per metre travelled (can reduce accumulated error), if the keyframe still overlaps the current frame |
| Speed/noise experiments | show where tracking breaks and how errors accumulate |

**What a real VO needs on top of this**: **scale** (a single camera cannot know the size of the world; use a known camera height, a depth sensor, stereo or an IMU), **3-D motion** (essential matrix with five-point RANSAC, then triangulation and PnP against a local map), **bundle adjustment** over a window, **loop closure** to remove drift when places repeat (module 5, SLAM), and **robustness** to dynamic objects, motion blur and low texture. Systems such as ORB-SLAM3 and VINS-Mono implement all of this.

:::exercise Extend it
1. Plot the **position error over time** and fit a line: is drift proportional to distance travelled or to the number of frames?
2. Add a **second path that returns to the start** and measure the **loop closure error** (the gap between the start and end estimates); correct it by distributing the error linearly along the path (a pose-graph in miniature).
3. Replace RANSAC `estimateAffinePartial2D` by a full **homography** and observe the extra degrees of freedom amplify noise.
4. Make the ground **textureless in part** (blur a region of the map) and detect tracking failure automatically from the inlier count; fall back to the previous motion (constant velocity).
5. Implement **local refinement**: after chaining, refine the last 5 poses by minimising the reprojection error of matched points with `scipy.optimize.least_squares`.
6. Add **scale drift** by simulating a camera that slowly gets closer to the ground, and show how the similarity transform's scale term reveals it.
:::

:::keypoints
- Visual odometry = features, matching with a ratio test, robust motion estimation with RANSAC, and chaining relative motions into a trajectory.
- Errors accumulate: even tiny per-frame errors produce drift, so always report ATE and final error against the truth.
- Keyframes can reduce drift but need enough overlap and are not always better; SIFT is more accurate than ORB and slower.
- Fast motion and noise reduce inlier counts and increase drift or lose tracking; monitor inliers and handle failures.
- Monocular VO has no metric scale; stereo, depth, IMU or known geometry resolve it, and loop closure plus bundle adjustment (SLAM) remove drift.
:::
