---
title: Deep Learning on Point Clouds
level: advanced
time: 55
summary: Neural networks that read 3-D points directly. Why point clouds are hard (unordered, irregular), farthest-point sampling and voxel grids, PointNet and permutation invariance (trained in the check), PointNet++, voxel and sparse convolutions, point transformers, tasks and datasets, and practical tips for LiDAR and depth data.
---

Module 5 showed how depth cameras and LiDAR produce **point clouds**, and how **ICP** aligns them. This lesson is about **neural networks** that classify, segment and detect objects in 3-D.

## Why points are not like images

| Image | Point cloud |
|---|---|
| A regular grid: pixel `(i, j)` always has neighbours at `(i±1, j±1)` | **Unordered set**: no grid, no first point |
| Fixed size (H × W) | Different number of points per scan (10 k to 1 M) |
| Dense | **Sparse**: LiDAR returns are dense near the sensor and sparse far away; most of 3-D space is empty |
| Convolutions fit directly | A neighbour must be **searched** (k-NN, ball query) |

Three requirements follow for a network: **permutation invariance** (shuffling the points must not change the answer), robustness to **varying density**, and sensitivity to **local geometry**.

## Three ways to feed 3-D data to a network

1. **Points directly** (PointNet, PointNet++, Point Transformer, KPConv, PointNeXt).
2. **Voxels / sparse voxels**: put points into a 3-D grid and use **3-D convolutions**; **sparse convolution** (SparseConvNet, MinkowskiNet, spconv, TorchSparse) computes only on occupied voxels. Standard in LiDAR perception and indoor scene segmentation.
3. **Projections**: project to **multiple 2-D views** (MVCNN), a **range image** (RangeNet++ for LiDAR, each pixel = one laser beam), or a **bird's-eye view** grid (next lesson), then use 2-D CNNs and all their tools.

## Preparing points (runnable)

Typical preprocessing: **voxel downsampling** (one averaged point per grid cell, reduces size and evens out density), **farthest-point sampling (FPS)** (choose a subset that covers the shape evenly) and **normal estimation** (fit a plane to the neighbours; the direction of least variance is the normal, from the SVD).

```python run title="Voxel downsampling, farthest-point sampling and normals in NumPy" level=intermediate
import numpy as np

rng = np.random.default_rng(0)

def sphere(n):
    p = rng.normal(0, 1, (n, 3)); return p / np.linalg.norm(p, axis=1, keepdims=True)
def cube(n):
    p = rng.uniform(-1, 1, (n, 3)); ax = rng.integers(0, 3, n); p[np.arange(n), ax] = rng.choice([-1, 1], n); return p
def cylinder(n):
    a = rng.uniform(0, 2 * np.pi, n); z = rng.uniform(-1, 1, n)
    side = np.stack([np.cos(a), np.sin(a), z], 1)
    r = np.sqrt(rng.uniform(0, 1, n)); cap = np.stack([r * np.cos(a), r * np.sin(a), rng.choice([-1, 1], n)], 1)
    return np.where(rng.random((n, 1)) < 0.7, side, cap)

cloud = np.vstack([cube(1500), cylinder(1500)]) * 0.5 + rng.normal(0, 0.003, (3000, 3))
print("point cloud:", cloud.shape, " bounding box:", np.round(cloud.min(0), 2), np.round(cloud.max(0), 2))

def voxel_downsample(p, size):
    keys = np.floor(p / size).astype(int)
    _, inv, cnt = np.unique(keys, axis=0, return_inverse=True, return_counts=True)
    out = np.zeros((cnt.size, 3)); np.add.at(out, inv.ravel(), p)
    return out / cnt[:, None]

def farthest_point_sampling(p, k):
    idx = [0]; d = np.linalg.norm(p - p[0], axis=1)
    for _ in range(k - 1):
        i = int(d.argmax()); idx.append(i); d = np.minimum(d, np.linalg.norm(p - p[i], axis=1))
    return np.array(idx)

def estimate_normals(p, k=12):
    d = ((p[:, None] - p[None]) ** 2).sum(-1)
    nn = np.argsort(d, axis=1)[:, :k]
    normals = np.zeros_like(p)
    for i in range(len(p)):
        q = p[nn[i]] - p[nn[i]].mean(0)
        normals[i] = np.linalg.svd(q, full_matrices=False)[2][-1]              # the direction of least variance = the surface normal
    return normals

vox = voxel_downsample(cloud, 0.08)
print(f"voxel downsample (8 cm cells): {len(cloud)} -> {len(vox)} points, keeps the shape with {len(vox) / len(cloud):.0%} of the points")
fps = farthest_point_sampling(cloud, 128)
rnd = rng.choice(len(cloud), 128, replace=False)
def coverage(sel):        # how far is the worst point of the cloud from the selected subset?
    return max(np.linalg.norm(cloud[i] - cloud[sel], axis=1).min() for i in range(0, len(cloud), 6))
print(f"128 samples: worst-case gap  farthest-point {coverage(fps):.3f}   random {coverage(rnd):.3f}  (FPS covers the shape evenly)")
box = cube(2500) * 0.5
sub = box[np.random.default_rng(1).choice(len(box), 700, replace=False)]
n = estimate_normals(sub, k=10)
top = (sub[:, 2] > 0.49) & (np.abs(sub[:, 0]) < 0.4) & (np.abs(sub[:, 1]) < 0.4)           # points inside the top face, away from the edges
print(f"normals on the flat top face of a box ({int(top.sum())} points): mean |n_z| = {np.abs(n[top, 2]).mean():.3f}  (1.0 = pointing exactly along z)")
```

## PointNet: the key idea in three lines

1. Apply **the same small MLP to every point** independently: `f(p) ∈ R^256`.
2. **Max-pool over all points**: `g = max_i f(p_i)`. Max is a **symmetric function**: the order of the points does not matter.
3. Classify `g` with another MLP (for segmentation, concatenate `g` back onto each point's feature).

PointNet (Qi et al., 2017) is simple, fast and surprisingly strong. Its weakness: it has **no notion of local neighbourhoods**: it sees each point alone and then a global summary.

```python local check title="Train PointNet on points: invariant to order, robust to density"
import numpy as np
import torch
from torch import nn

torch.manual_seed(0); np.random.seed(0)
rng = np.random.default_rng(0)
def sphere(n):
    p = rng.normal(0, 1, (n, 3)); return p / np.linalg.norm(p, axis=1, keepdims=True)
def cube(n):
    p = rng.uniform(-1, 1, (n, 3)); ax = rng.integers(0, 3, n); p[np.arange(n), ax] = rng.choice([-1, 1], n); return p
def cylinder(n):
    a = rng.uniform(0, 2 * np.pi, n); z = rng.uniform(-1, 1, n)
    side = np.stack([np.cos(a), np.sin(a), z], 1); r = np.sqrt(rng.uniform(0, 1, n)); cap = np.stack([r * np.cos(a), r * np.sin(a), rng.choice([-1, 1], n)], 1)
    return np.where(rng.random((n, 1)) < 0.7, side, cap)
makers = [sphere, cube, cylinder]
def random_rotation_z(p):
    t = rng.uniform(0, 2 * np.pi); c, s = np.cos(t), np.sin(t)
    return p @ np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]]).T
def batch(n_per_class):
    X, y = [], []
    for k, m in enumerate(makers):
        for _ in range(n_per_class):
            p = m(256) * rng.uniform(0.7, 1.3) * 0.5                          # random size, 256 points
            X.append(random_rotation_z(p) + rng.normal(0, 0.01, p.shape)); y.append(k)
    return torch.tensor(np.array(X), dtype=torch.float32), torch.tensor(y)

class PointNet(nn.Module):
    def __init__(self, classes=3):
        super().__init__()
        self.mlp = nn.Sequential(nn.Linear(3, 64), nn.ReLU(), nn.Linear(64, 128), nn.ReLU(), nn.Linear(128, 256), nn.ReLU())    # shared per point
        self.head = nn.Sequential(nn.Linear(256, 128), nn.ReLU(), nn.Linear(128, classes))
    def forward(self, pts):                                    # pts: (B, N, 3)
        f = self.mlp(pts)                                      # the SAME mlp for every point -> (B, N, 256)
        g = f.max(dim=1).values                                # symmetric function: max-pool over points -> order does not matter
        return self.head(g)

net = PointNet(); opt = torch.optim.Adam(net.parameters(), lr=2e-3)
Xtr, ytr = batch(150); Xte, yte = batch(60)
for epoch in range(80):
    perm = torch.randperm(len(Xtr))
    for i in range(0, len(Xtr), 64):
        idx = perm[i:i + 64]
        loss = nn.functional.cross_entropy(net(Xtr[idx]), ytr[idx]); opt.zero_grad(); loss.backward(); opt.step()
with torch.no_grad():
    acc = (net(Xte).argmax(1) == yte).float().mean().item()
    shuffled = Xte[:, torch.randperm(256)]                      # the same clouds with the points in a different ORDER
    same = torch.allclose(net(Xte), net(shuffled), atol=1e-5)
    sparse = (net(Xte[:, :64]).argmax(1) == yte).float().mean().item()
print(f"classification of sphere / box / cylinder from raw points: test accuracy {acc:.3f}")
print("output unchanged when the point ORDER is shuffled (permutation invariance):", same)
print(f"accuracy with only 64 of the 256 points: {sparse:.3f}  (robust to density)")
print("parameters:", sum(p.numel() for p in net.parameters()))
```

## PointNet++, sparse convolutions and transformers

- **PointNet++**: repeat three steps in a hierarchy, like a CNN. **Sample** centre points (FPS), **group** their neighbours (ball query), and run a **mini-PointNet** on each group. Layers grow the receptive field and learn **local geometry** at multiple scales. **PointNeXt** modernises the training recipe and gets much better results from the same idea.
- **Graph / dynamic-graph networks** (DGCNN): EdgeConv on k-NN graphs recomputed in feature space.
- **KPConv**: a convolution whose kernel is a set of **kernel points** in space with learned weights, applied to neighbourhoods; excellent for segmentation.
- **Sparse 3-D convolutions** (MinkowskiNet, SparseConvNet, **Sparse U-Nets**): voxelise at e.g. 2–5 cm, build a hash map of occupied voxels, convolve only there. Fast and accurate, dominant on **ScanNet** and **nuScenes** pipelines.
- **Point Transformer (V1–V3)**: self-attention over local neighbourhoods with relative position encoding; **PTv3** serialises points along space-filling curves to attend efficiently and is state of the art on many benchmarks.
- **Self-supervised pre-training**: Point-MAE / Point-BERT (mask patches of points and reconstruct), PointContrast, and distillation of 2-D foundation models (CLIP, DINOv2 features lifted to 3-D: OpenScene, ULIP).

## Tasks and benchmarks

| Task | Output | Data sets |
|---|---|---|
| Classification | Shape category | ModelNet40, ScanObjectNN |
| Part segmentation | Part label per point (wing, engine) | ShapeNet-Part |
| Semantic segmentation (indoor) | Class per point (wall, chair) | S3DIS, ScanNet |
| Semantic segmentation (outdoor LiDAR) | Class per point (road, car, person) | SemanticKITTI, nuScenes-lidarseg, Waymo |
| 3-D object detection | Oriented 3-D boxes | KITTI, nuScenes, Waymo (next lesson) |
| Registration | Rigid transform between scans | 3DMatch, KITTI odometry; learned: FCGF, GeoTransformer |
| Completion | Fill missing shape | PCN, ShapeNet |
| Scene understanding with language | Open-vocabulary 3-D | ScanRefer, OpenScene |

Metrics: overall accuracy, **mIoU** (segmentation, as in module 10), **AP at 3-D IoU** (detection), registration recall, Chamfer distance for completion.

## Practical notes

- **Normalise** every cloud: centre it, scale it to a unit sphere (objects), or keep metric units with a fixed range (driving). Use a consistent **coordinate frame** (z up).
- **Augmentation**: random rotation about the up axis, flips, scaling, jitter, random point dropout, **ground-truth sampling / copy-paste of objects** (detection), mixing scans (PolarMix).
- **Neighbour search** dominates run time: use a KD-tree, voxel hashing or a GPU ball query; voxel size is the key accuracy–speed knob.
- **Intensity and extra channels** (reflectivity, colour, timestamps in multi-sweep LiDAR) help; stack sweeps to get density for far objects.
- **Class imbalance** (many ground points, few pedestrians): weighted losses, focal loss, class-balanced sampling (module 10 losses).
- **Domain gap between sensors**: models trained on one LiDAR (64 beams) can fail on another (32 beams): resample, augment beams, or fine-tune.
- **Real-time budget**: sparse convolution backbones run 10–30 FPS on an embedded GPU at typical LiDAR sizes; use TensorRT/ONNX with spconv support.

:::interview Questions you may get
- "Why can't you feed a point cloud to a standard CNN?" There is no regular grid, the points are unordered and the density varies; you must voxelise, project or use set-based networks.
- "What is PointNet and why is max-pooling used?" A shared MLP per point followed by max-pooling, a symmetric function, so the output is invariant to point ordering.
- "What does PointNet++ add?" Hierarchical local grouping (FPS, ball query, mini-PointNets) for multi-scale local features.
- "Why are sparse convolutions used for LiDAR?" Most voxels are empty; computing only on occupied voxels is far cheaper than dense 3-D convolution.
- "How would you segment road surface in LiDAR?" A range-image or sparse-voxel segmentation network (SemanticKITTI), or a classical ground-plane fit (RANSAC) as a baseline; evaluate mIoU and failure on slopes.
- "How do you deal with the different density of near and far points?" Voxel downsampling, multi-sweep accumulation, density-aware sampling/augmentation, range-aware features.
:::

```quiz
? Why is PointNet invariant to the order of the input points?
+ It applies the same MLP to each point and then a symmetric max-pooling
- It sorts the points first
- It uses a 3-D convolution
> Max does not depend on order.

? What does farthest-point sampling do?
+ Picks a subset of points that covers the shape evenly
- Removes the farthest points as outliers
- Orders points by colour
> Greedy: each new point is the farthest from those already picked.

? What is the benefit of sparse convolutions?
+ Computation only on occupied voxels, saving time and memory
- They remove the need for training
- They work only on images
> 3-D space is mostly empty.

? Which sensor mismatch can hurt a LiDAR network the most?
+ A different number of beams (density) than in training
- A different file format
- A different operating system
> Density and range patterns change.
```

:::problem Your PointNet++ model segments pallets and people in warehouse LiDAR scans, but misses people more than 15 m away. What do you try? {level=medium tags="lidar,small-objects,density"}
Think about density, resolution and the training distribution.

:::solution Model answer
Far objects have few points. Options: accumulate several sweeps (with ego-motion compensation) to increase density; use a finer voxel size or a range-adaptive scheme; add augmentation that thins near objects to simulate far density; oversample far persons in training and use class-balanced or distance-aware losses; add camera fusion (image detections project into the cloud) for far range; evaluate recall by distance bucket and report separately. Check the sensor itself (beam count, mounting height) too.
:::
:::

:::keypoints
- Point clouds are unordered, sparse and irregular; networks use symmetric functions (PointNet), local grouping (PointNet++, KPConv, Point Transformer), sparse voxel convolutions, or 2-D projections (range images, BEV).
- Preprocessing: normalise, voxel-downsample, farthest-point-sample, estimate normals; augment with rotation about the up axis, dropout, copy-paste.
- Metrics: mIoU for segmentation, AP at 3-D IoU for detection, registration recall.
- Sensor changes (beam count, range) and density gaps are the main practical failure modes.
:::

:::resources
- [Qi et al.: PointNet](https://arxiv.org/abs/1612.00593) — deep learning on point sets.
- [Qi et al.: PointNet++](https://arxiv.org/abs/1706.02413) — hierarchical local features.
- [Choy et al.: 4D Spatio-Temporal ConvNets (Minkowski)](https://arxiv.org/abs/1904.08755) — sparse convolutions.
- [Thomas et al.: KPConv](https://arxiv.org/abs/1904.08889) — kernel point convolution.
- [Zhao et al.: Point Transformer](https://arxiv.org/abs/2012.09164) — attention for points.
- [Qian et al.: PointNeXt](https://arxiv.org/abs/2206.04670) — better recipes for PointNet++.
- [Open3D documentation](http://www.open3d.org/docs/release/) — a practical library for point-cloud processing.
:::
