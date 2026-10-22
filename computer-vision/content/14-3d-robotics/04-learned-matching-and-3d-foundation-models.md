---
title: Learned Matching and 3-D Foundation Models
level: advanced
time: 50
summary: How deep learning changed geometry. Learned keypoints (SuperPoint), learned matchers (SuperGlue, LightGlue, LoFTR), dense matching, a runnable comparison of matching rules, then feed-forward 3-D foundation models (DUSt3R, MASt3R, VGGT) that replace the SfM pipeline, and how learned SLAM (DROID-SLAM) fits with classical systems.
---

Modules 4 and 5 built geometry from **hand-designed** features (SIFT, ORB), **matching rules** (ratio test, RANSAC), and **optimisation** (PnP, bundle adjustment). Deep learning now improves **each stage**, and recent models even collapse the whole pipeline into one network. Knowing both sides, and when the classical part is still the right tool, is a strong interview signal.

## Stage 1: learned keypoints and descriptors

| Method | Idea |
|---|---|
| **SuperPoint** (2017) | A fully convolutional network with two heads: a **keypoint heat-map** and a **256-d descriptor**; trained with **homographic adaptation** (self-supervised: detect on many warped copies of an image and aggregate) |
| **D2-Net, R2D2, DISK, ALIKED** | Joint detection and description with repeatability/reliability losses; DISK trains with reinforcement-learning-style policy gradients |
| **DINOv2 / foundation features** | Dense semantic descriptors; good for matching across big appearance changes (category-level correspondence) |

Learned features are better than SIFT/ORB under **large viewpoint, illumination and seasonal change**, but they need a GPU for speed (SuperPoint runs at 30–100 FPS on a desktop GPU and ~10–20 FPS on a Jetson with TensorRT); ORB is still the choice on tiny CPUs.

## Stage 2: learned matching

Given two sets of keypoints and descriptors, **which ones correspond?** Classical rules treat each point independently. **Learned matchers** let the points **talk to each other** using attention:

- **SuperGlue** (2019): a graph neural network with **self-attention** (within an image) and **cross-attention** (between images), then an **optimal-transport** layer (Sinkhorn) with a "dustbin" for points without a match. Strong, but slow.
- **LightGlue** (2023): faster and more accurate; **adaptive depth and width**: it stops early for easy pairs and prunes points that are clearly unmatched. The current default for sparse matching.
- **LoFTR** (2021): **detector-free**: a CNN + transformer matches **dense features** coarsely, then refines at sub-pixel level; works on textureless walls where no keypoint detector finds anything. **RoMa, DKM, GIM** are dense matchers with robust warps.
- **Optical-flow-like dense matching** (RAFT, GMFlow, UniMatch) gives per-pixel correspondences between consecutive frames (module 6).

The runnable demo compares matching **rules** on real SIFT descriptors for a hard pair (40° rotation, darker, noisy), with the true correspondence known from the homography so we can score precision:

```python run title="Nearest neighbour, ratio test, mutual check and dual-softmax" level=advanced
import numpy as np
import cv2
import cvlab

a, b, H = cvlab.warped_pair("coffee", angle=40, scale=0.8, darker=0.7, noise=8)                  # a harder pair than in module 4: large rotation, darker, noisier
ga, gb = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY), cv2.cvtColor(b, cv2.COLOR_RGB2GRAY)
sift = cv2.SIFT_create(nfeatures=1500)
ka, da = sift.detectAndCompute(ga, None)
kb, db = sift.detectAndCompute(gb, None)
pa = np.float32([k.pt for k in ka]); pb = np.float32([k.pt for k in kb])
print(f"keypoints: {len(ka)} in image A, {len(kb)} in image B")

proj = cv2.perspectiveTransform(pa[None], H)[0]                                                   # where each A keypoint truly lands in B
def correct(i, j, tol=4.0):
    return np.linalg.norm(proj[i] - pb[j]) < tol                                                  # a match is right if it lands within 4 px of the truth

da, db = da / np.linalg.norm(da, axis=1, keepdims=True), db / np.linalg.norm(db, axis=1, keepdims=True)
S = da @ db.T                                                                                     # cosine similarity of every descriptor pair

def report(name, pairs):
    ok = sum(correct(i, j) for i, j in pairs)
    print(f"{name:<34} matches {len(pairs):>4}   correct {ok:>4}   precision {ok / max(len(pairs), 1):.2f}")

report("nearest neighbour (no filtering)", [(i, int(S[i].argmax())) for i in range(len(da))])
srt = np.sort(S, axis=1)[:, ::-1]
dist1, dist2 = np.sqrt(np.maximum(2 - 2 * srt[:, 0], 0)), np.sqrt(np.maximum(2 - 2 * srt[:, 1], 0))
report("Lowe ratio test (0.8)", [(i, int(S[i].argmax())) for i in range(len(da)) if dist1[i] < 0.8 * dist2[i]])
rows, cols = S.argmax(1), S.argmax(0)
report("mutual nearest neighbours", [(i, int(rows[i])) for i in range(len(da)) if cols[rows[i]] == i])

def softmax(x, ax):
    z = np.exp(x - x.max(ax, keepdims=True)); return z / z.sum(ax, keepdims=True)
P = softmax(S / 0.05, 1) * softmax(S / 0.05, 0)                                                   # dual-softmax (LoFTR / LightGlue style): both directions must agree
mutual = [(i, int(rows[i])) for i in range(len(da)) if cols[rows[i]] == i and P[i, rows[i]] > 0.3]
report("dual-softmax + mutual (P > 0.3)", mutual)

# geometric verification with RANSAC on the mutual matches
src = np.float32([pa[i] for i, _ in mutual]); dst = np.float32([pb[j] for _, j in mutual])
Hest, inl = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
err = np.linalg.norm(cv2.perspectiveTransform(np.float32([[0, 0], [a.shape[1], 0], [a.shape[1], a.shape[0]], [0, a.shape[0]]])[None], Hest)[0] - cv2.perspectiveTransform(np.float32([[0, 0], [a.shape[1], 0], [a.shape[1], a.shape[0]], [0, a.shape[0]]])[None], H)[0], axis=1).mean()
print(f"RANSAC homography from the filtered matches: {int(inl.sum())} inliers, mean corner error {err:.2f} px")
print("the strictest filter is the most precise but keeps the fewest matches: you choose the threshold for the task")
print("learned matchers (SuperGlue, LightGlue, LoFTR) add attention between the two images so each point sees context, then use the same mutual + threshold logic")
```

Dual-softmax with a mutual check is what **LoFTR** uses for its coarse stage; the learned part (attention) makes the similarity matrix `S` much better before this rule is applied.

## Stage 3: from matches to geometry, with robust estimation

Learned or not, wrong matches remain. **RANSAC** (module 4) and its modern versions (**MAGSAC++**, **LO-RANSAC**, **PoseLib**) estimate the homography, essential matrix or PnP pose and reject outliers. Deep networks that predict **inlier weights** (OANet, SuperGlue's scores) feed the same solvers. For metric structure, **bundle adjustment** (module 5) is still the gold standard; modern tools run it on GPU (Ceres, GTSAM, g2o, **PyCeres**, **Theseus**, **DPVO**).

## A full learned SfM front-end (hloc)

The **hierarchical localisation toolbox (hloc)** shows the standard modern pipeline: global descriptor retrieval (NetVLAD / DINOv2) to find candidate image pairs → SuperPoint features → LightGlue matching → **COLMAP** triangulation and bundle adjustment → localisation of new images with PnP + RANSAC. It is the common recipe for **visual localisation** (find the camera pose in a prebuilt map), digital twins, and the pose inputs for NeRF/3DGS.

## Feed-forward 3-D foundation models

What if a network could directly output the 3-D structure and camera poses from raw images, with no matching, RANSAC or bundle adjustment?

- **DUSt3R** (2023): for a pair of images, a transformer predicts a **pointmap** per image (the 3-D coordinates of every pixel in a common frame). Camera intrinsics, relative pose and depth fall out of the pointmaps; for many images, a light **global alignment** merges them. No calibration or known poses needed.
- **MASt3R**: adds dense **local features** so it also does state-of-the-art matching (grounded in 3-D) and metric scale; **MASt3R-SfM** handles thousands of images. **Spann3R, CUT3R, Fast3R, MUSt3R** target streaming/large collections.
- **VGGT** (2025): a single feed-forward transformer takes **one to hundreds of images** and outputs **camera poses, depth maps, pointmaps and tracks in a second**, often better than classical SfM + optimisation on common benchmarks.
- **Depth/normal foundation models** (module 13) and **Pi3, MoGe** give per-image geometry; **DepthCrafter / Video Depth Anything** for video.

Strengths: robust with **few views, little texture, wide baselines**; very fast; no hand-tuned pipeline. Weaknesses: **accuracy and metric consistency** can lag behind a well-run classical pipeline on large scenes (drift, scale), they need a GPU and memory that grows with the number of images, and failure modes are harder to debug (no inlier count to inspect). A strong practice is **hybrid**: use the foundation model for initialisation and then refine with bundle adjustment.

## Learned SLAM and odometry

- **ORB-SLAM3** (feature-based, CPU real-time, with IMU) remains the reference classical system (module 5).
- **DROID-SLAM** (2021): a recurrent network updates **dense optical flow** and **depth** iteratively, with a differentiable **dense bundle adjustment** layer; very robust and accurate, but heavy (GPU). **DPVO / DPV-SLAM** are lighter patch-based variants.
- **NeRF/3DGS-based SLAM** (NICE-SLAM, SplaTAM, MonoGS) give dense photorealistic maps (previous lesson) at lower tracking robustness.
- **Learning-based visual odometry** (TartanVO, DF-VO) and **inertial** learning (TLIO) help in feature-poor scenes; **VIO** with an IMU (VINS-Fusion, OpenVINS, Basalt) is what drones and AR headsets actually run for metric scale.
- **Place recognition for loop closure**: NetVLAD, MixVPR, AnyLoc (retrieval lesson).

## What to use when (rules of thumb)

| Situation | Choice |
|---|---|
| Embedded CPU, tight latency, normal textures | ORB + classical matching + RANSAC, ORB-SLAM3 |
| Large viewpoint/illumination change, a GPU available | SuperPoint + LightGlue (+ hloc) |
| Textureless indoor scenes | LoFTR/RoMa dense matching, or depth-sensor-based SLAM |
| Few images, no calibration, quick 3-D prototype | DUSt3R/MASt3R/VGGT |
| Survey-grade accuracy, metric scale | Calibrated cameras, COLMAP-style SfM + BA with control points, or LiDAR SLAM |
| Robot odometry in the wild | VIO / LiDAR-inertial odometry (+ learned place recognition for loop closure) |

:::interview Questions you may get
- "What does SuperPoint do differently from SIFT?" A CNN predicts keypoints and descriptors trained self-supervised with homographic adaptation; more robust to illumination changes and fast on GPU, but needs training data and a GPU.
- "How does SuperGlue/LightGlue improve matching?" Attention among keypoints of both images with context, plus optimal transport and an unmatched option; LightGlue adds adaptive early exit and pruning.
- "What is a detector-free matcher?" LoFTR-style dense matching with transformers, working without keypoint detection, helpful for low-texture scenes.
- "What is a pointmap (DUSt3R)?" A per-pixel 3-D coordinate map in a shared frame, from which depth, intrinsics and relative pose are derived.
- "When would you still use classical SfM + BA?" When metric accuracy, large scale, auditability or CPU-only constraints matter; use learned parts for robustness where needed.
- "How do you measure matching quality?" Precision/recall of matches against known geometry, pose error (AUC of angular error at 5°/10°/20°), inlier counts, and downstream metrics like localisation recall.
:::

```quiz
? What does the ratio test do?
+ Rejects matches whose best distance is not clearly smaller than the second-best
- Adds more matches
- Estimates the camera pose
> Lowe's rule for ambiguity.

? What is the main advantage of LoFTR-style detector-free matching?
+ It can match textureless regions where keypoint detectors fail
- It needs no GPU
- It outputs depth directly
> Dense features with transformers.

? What does DUSt3R predict for an image pair?
+ A pointmap: 3-D coordinates per pixel in a common frame
- A class label
- A segmentation map
> Poses and depth follow from it.

? Which pipeline would you pick on a small CPU-only robot with normal textures?
+ ORB features with classical matching and RANSAC (or ORB-SLAM3)
- A large transformer matcher on CPU
- A NeRF
> Efficiency.
```

:::problem Your visual-localisation system works in summer but fails in winter (snow, low sun). What changes would you try? {level=medium tags="localisation,robustness,features"}
Think about retrieval, features and map content.

:::solution Model answer
Add appearance diversity to the map (capture in several seasons and merge), use more robust global retrieval (DINOv2/AnyLoc/MixVPR) and local features (SuperPoint + LightGlue or dense LoFTR/RoMa), and use geometric verification with RANSAC. Fine-tune or augment with seasonal/illumination changes (or generative relighting), fuse with other cues (IMU, wheel odometry, LiDAR maps) and add temporal filtering; evaluate localisation recall at thresholds (0.25 m / 2°, 0.5 m / 5°) per season and weather.
:::
:::

:::keypoints
- Deep learning improves each geometry stage: keypoints (SuperPoint), matching (SuperGlue, LightGlue, LoFTR), robust estimation, and even full SfM (DUSt3R, MASt3R, VGGT).
- Matching rules trade precision against count: ratio test, mutual check and dual-softmax thresholds; always verify geometrically (RANSAC).
- Feed-forward 3-D models are fast and robust for few views but less metric-accurate at scale; hybrid pipelines refine with bundle adjustment.
- Choose by hardware and accuracy needs: ORB/classical on CPU, SuperPoint + LightGlue with a GPU, dense matchers for low texture, VIO/LiDAR for odometry.
:::

:::resources
- [DeTone et al.: SuperPoint](https://arxiv.org/abs/1712.07629) — self-supervised keypoints.
- [Sarlin et al.: SuperGlue](https://arxiv.org/abs/1911.11763) — graph-network matching.
- [Lindenberger et al.: LightGlue](https://arxiv.org/abs/2306.13643) — adaptive fast matching.
- [Sun et al.: LoFTR](https://arxiv.org/abs/2104.00680) — detector-free matching.
- [Wang et al.: DUSt3R](https://arxiv.org/abs/2312.14132) — pointmaps from image pairs.
- [Leroy et al.: MASt3R](https://arxiv.org/abs/2406.09756) — matching grounded in 3-D.
- [Wang et al.: VGGT](https://arxiv.org/abs/2503.11651) — feed-forward 3-D reconstruction.
- [Teed and Deng: DROID-SLAM](https://arxiv.org/abs/2108.10869) — learned dense SLAM.
- [hloc on GitHub](https://github.com/cvg/Hierarchical-Localization) — a practical localisation toolbox.
:::
