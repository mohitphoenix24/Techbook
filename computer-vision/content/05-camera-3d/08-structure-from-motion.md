---
title: Structure from Motion — 3-D from Many Photos
level: advanced
time: 55
summary: How a set of ordinary photos becomes a 3-D model and camera positions. The incremental pipeline (matching, two-view start, triangulation, PnP, bundle adjustment), a three-view demo you can run, similarity alignment for evaluation, COLOR/COLMAP-style tools and what modern learned methods change.
---

Take 50 photos of a statue from different sides. **Structure from Motion (SfM)** recovers, from those photos alone, **the 3-D shape** (a cloud of points) and **where every camera stood**. It is the technology behind photogrammetry, Google Earth's 3-D cities, drone mapping, heritage digitisation, and the camera poses used to train NeRF and Gaussian splatting.

## The pipeline

:::flow Incremental SfM (COLMAP style)
1. Features | Detect and describe keypoints in every photo (SIFT, or learned features).
2. Matching | Match features between photo pairs (all pairs, sequential, or vocabulary-tree candidates).
3. Geometric verification | Fit F, E or H with RANSAC for each pair; keep pairs with enough inliers. This builds the scene graph.
4. Initialise | Pick a good starting pair (many inliers, wide baseline). Estimate E, recover pose, triangulate points.
5. Register a new image | Pick the image that sees the most known 3-D points. Estimate its pose with PnP and RANSAC.
6. Triangulate | Add new 3-D points seen in the new image and others.
7. Bundle adjustment | Refine all camera poses and points together by minimising reprojection error. Remove bad points.
8. Repeat | Go back to step 5 until all images are registered.
:::

Output: camera intrinsics (if they were unknown), the pose of every camera, and a **sparse** point cloud. Then **Multi-View Stereo (MVS)** can compute a **dense** reconstruction using the known poses, followed by meshing and texturing.

Two ideas make it work:

- **No scale, no absolute position.** The result is correct only up to a **similarity transform** (rotation, translation and a uniform scale). You fix them with known distances, GPS, or markers.
- **Drift and error accumulate** with each added image; bundle adjustment (and loop closure on loops) controls it.

## A three-view demo with synthetic data

We build a small world: 300 points, three cameras side by side, all looking at the scene, with noisy 2-D observations. Then we follow the real steps: two-view start, triangulation, PnP for the third camera, triangulating more points. The truth is known, so we can measure the error.

```python run title="Mini SfM with three views" level=advanced shared
import cv2
import numpy as np

rng = np.random.default_rng(2)
K = np.array([[800., 0, 320], [0, 800., 240], [0, 0, 1]])
X = rng.uniform([-1.5, -1.0, 4.0], [1.5, 1.0, 7.0], (300, 3))                    # a 3-D scene: 300 points

def pose(yaw_deg, cx):                                                          # a camera at x = cx, turned inwards by yaw
    R, _ = cv2.Rodrigues(np.array([0.0, np.deg2rad(yaw_deg), 0.0]))
    C = np.array([cx, 0.0, 0.0])
    return R, -R @ C                                                            # world -> camera: x_cam = R X + t

cams = [pose(0, 0.0), pose(9.3, 0.9), pose(18.1, 1.8)]                         # moving right, turning left to keep looking at the scene
obs = []
for R, t in cams:                                                               # noisy 2-D observations in each view
    p, _ = cv2.projectPoints(X, cv2.Rodrigues(R)[0], t, K, None)
    obs.append(p.reshape(-1, 2) + rng.normal(0, 0.3, (len(X), 2)))

# step 1: two-view start (views 0 and 1)
E, mask = cv2.findEssentialMat(obs[0], obs[1], K, cv2.RANSAC, 0.999, 1.0)
_, R01, t01, _ = cv2.recoverPose(E, obs[0], obs[1], K)
P0 = K @ np.hstack([np.eye(3), np.zeros((3, 1))])
P1 = K @ np.hstack([R01, t01])                                                  # |t01| = 1: the unit of our reconstruction
X_h = cv2.triangulatePoints(P0, P1, obs[0].T, obs[1].T)
X_est = (X_h[:3] / X_h[3]).T
print("two-view start: triangulated", len(X_est), "points; depth range:", np.round(X_est[:, 2].min(), 2), "to", np.round(X_est[:, 2].max(), 2), "(in units of the baseline)")

# step 2: register view 2 by PnP, using the triangulated points
ok, rvec2, t2, inl = cv2.solvePnPRansac(X_est.astype(np.float32), obs[2].astype(np.float32), K, None, reprojectionError=2.0)
R2, _ = cv2.Rodrigues(rvec2)
print("view 2 registered with", len(inl), "inliers of", len(X_est))
```

## Evaluate against the truth

Our reconstruction is in its own units. To compare with the truth we align the two with the best **similarity transform** (rotation + translation + scale), computed by the **Umeyama** method, and look at the leftover error.

```python run title="Align with a similarity transform (Umeyama) and measure the error" level=advanced shared
def umeyama(src, dst):
    """Best s, R, t with dst ~ s * R @ src + t."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    S, D = src - mu_s, dst - mu_d
    U, sig, Vt = np.linalg.svd(D.T @ S / len(src))
    d = np.sign(np.linalg.det(U @ Vt))
    Dm = np.diag([1, 1, d])
    R = U @ Dm @ Vt
    s = np.trace(np.diag(sig) @ Dm) / (S ** 2).sum() * len(src)
    return s, R, mu_d - s * R @ mu_s

s, Ralign, talign = umeyama(X_est, X)
X_aligned = (s * (Ralign @ X_est.T)).T + talign
err = np.linalg.norm(X_aligned - X, axis=1)
print(f"scale factor found: {s:.2f}   (true |baseline| was {np.linalg.norm(-cams[0][0].T @ cams[0][1] + cams[1][0].T @ cams[1][1]):.2f} m)")
print(f"3-D point error after alignment: mean {err.mean() * 100:.1f} cm, median {np.median(err) * 100:.1f} cm   (scene size about 3 m x 2 m x 3 m)")

# camera centres: C = -R^T t. Compare the third camera with the truth after the same alignment
C_est = [np.zeros(3), (-R01.T @ t01).ravel(), (-R2.T @ t2).ravel()]
C_true = [(-R.T @ t) for R, t in cams]
C_al = [s * Ralign @ c + talign for c in C_est]
print("camera position errors after alignment (cm):", np.round([np.linalg.norm(a - b) * 100 for a, b in zip(C_al, C_true)], 1))
```

With a baseline of 0.9 m, 300 matches and 0.3 px of noise, the structure is within a few centimetres at 4–7 m (about 1% of the distance). The errors come mostly from the small error of the essential matrix at the start. A final **bundle adjustment** (two lessons ahead) would reduce them further.

## What real pipelines add

- **Unknown intrinsics**: self-calibration from the photos, with focal length guessed from EXIF.
- **Robust matching**: vocabulary trees (bag of words) pick which pairs to match; geometric verification removes bad pairs; **loop closure** links the start and end of a trajectory.
- **Global SfM** (GLOMAP, OpenMVG): estimate all rotations first, then all translations at once, then refine. Faster for thousands of images, sometimes less accurate than incremental.
- **Dense reconstruction**: **MVS** (PatchMatch Stereo in COLMAP, OpenMVS) computes a depth for every pixel; meshing (Poisson) and texturing finish the model.
- **Scale and geo-registration**: ground control points, GPS tags, or known markers.

## Tools

| Tool | What it is |
|---|---|
| **COLMAP** | The standard open-source SfM + MVS. Command line and GUI |
| **GLOMAP** | A fast global SfM by the COLMAP authors |
| **OpenSfM**, **OpenMVG** | Open libraries |
| **Metashape**, **RealityCapture**, **Pix4D** | Commercial photogrammetry |
| **Nerfstudio**, **3D Gaussian Splatting** pipelines | Use COLMAP poses to train neural scene representations (module on NeRF later) |

## What deep learning changes

- **Learned features and matchers** (SuperPoint, SuperGlue, LightGlue, LoFTR) make SfM work in harder conditions (night, big viewpoint change).
- **Feed-forward 3-D** models like **DUSt3R**, **MASt3R** and **VGGT** predict point maps and camera poses directly from a few photos, with no feature matching or bundle adjustment. They are fast and robust on few images, but classical SfM is still more accurate and scalable for large, precise reconstructions.

:::interview Questions you may get
- "Describe the SfM pipeline." Features → matching → geometric verification → two-view initialisation → incremental PnP registration and triangulation → bundle adjustment → (MVS for dense).
- "What can't SfM recover?" Absolute scale, orientation and position (a similarity transform is free) without external information.
- "Incremental versus global SfM?" Incremental adds images one at a time (robust, accurate, slower); global estimates all poses at once (faster, more sensitive to outlier pairs).
- "What are the failure modes?" Textureless or repetitive scenes, pure rotation, too little overlap, strong lighting change, moving objects, bad intrinsics.
- "How would you fix the scale of a reconstruction?" A known distance or marker, GPS, IMU, or a stereo rig with known baseline.
:::

```quiz
? What does SfM output?
+ Camera poses (and intrinsics) and a sparse 3-D point cloud
- A depth map for each photo only
- A segmentation of the scene
> MVS then densifies it.

? Which transformation of the reconstruction can SfM not determine?
- The relative camera rotations
+ The overall scale, position and orientation (a similarity transform)
- The 3-D structure
> You need external information to fix them.

? Why is bundle adjustment run during and after incremental SfM?
+ To limit the accumulation of error by refining poses and points together
- To find features
- To match images
> It minimises the total reprojection error.

? Which step registers a new image against existing 3-D points?
- Triangulation
+ PnP with RANSAC
- The essential matrix
> 2-D to 3-D correspondences give the new camera's pose.
```

:::problem Your SfM of a plain white room produces a broken model. What are the likely causes and what would you do to improve the capture? {level=medium tags="sfm,failure-modes"}
Think about features and geometry.

:::solution Model answer
White walls have few features, so matching fails or gives wrong, repetitive matches; the camera may also only rotate in place (no parallax). Improve: add texture (posters, markers, a projector), move the camera sideways between photos instead of just turning, ensure 60–80% overlap, use a sensor with depth (RGB-D or LiDAR), or use learned matchers and a feed-forward model for hard cases. Add ArUco/AprilTag markers or other fiducials to guarantee features and to fix the scale.
:::
:::

:::keypoints
- SfM recovers camera poses and a sparse 3-D structure from unordered photos: features → matching → verification → init → PnP + triangulation → bundle adjustment.
- The result is known only up to a similarity transform; fix the scale with a known distance, marker or sensor.
- Evaluate by aligning with Umeyama and measuring errors. COLMAP is the standard tool; MVS makes it dense.
- Learned matchers and feed-forward models (DUSt3R, VGGT) extend it to harder cases, but classical SfM stays the accuracy reference.
:::

:::resources
- [COLMAP documentation](https://colmap.github.io) — the standard SfM/MVS tool, with tutorials.
- [Schonberger and Frahm: Structure-from-Motion Revisited (CVPR 2016)](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) — the paper behind COLMAP.
- [DUSt3R: Geometric 3D Vision Made Easy](https://arxiv.org/abs/2312.14132) — feed-forward 3-D reconstruction.
:::
