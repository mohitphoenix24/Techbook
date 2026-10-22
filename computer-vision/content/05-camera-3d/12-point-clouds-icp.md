---
title: Point Clouds — Filtering, Planes, Clusters and ICP
level: advanced
time: 55
summary: Working with 3-D points. Downsampling, normals, removing the table with RANSAC, splitting objects by clustering, and ICP, which aligns a known 3-D model with a scan. Everything is written in NumPy/SciPy so you can see how it works.
---

A **point cloud** is a set of 3-D points `(X, Y, Z)`, sometimes with colour or a normal vector, from a depth camera, LiDAR or photogrammetry. It is a plain `N × 3` array. This lesson covers the tools you need for robot perception: clean the data, find the table, separate objects, and **align** a known model with what you see (registration).

## Make a test scene

A table (a plane), a box standing on it, and a cylinder, plus sensor noise.

```python run title="A synthetic scene: table, box and cylinder" level=intermediate shared
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(0)
def plane(n):                                                       # the table: z = 0, 1 m x 1 m
    return np.c_[rng.uniform(-0.5, 0.5, n), rng.uniform(-0.5, 0.5, n), np.zeros(n)]
def box(n, c, size):                                                # the visible faces of a box (top and two sides)
    s = np.array(size); out = []
    for _ in range(n):
        face = rng.integers(0, 3)
        p = (rng.random(3) - 0.5) * s
        if face == 0: p[2] = s[2] / 2
        elif face == 1: p[0] = -s[0] / 2
        else: p[1] = -s[1] / 2
        out.append(p)
    return np.array(out) + c
def cylinder(n, c, r, h):
    a = rng.uniform(0, 2 * np.pi, n)
    return np.c_[c[0] + r * np.cos(a), c[1] + r * np.sin(a), c[2] + rng.uniform(0, h, n)]

scene = np.vstack([plane(6000), box(1500, [-0.15, 0.0, 0.06], [0.14, 0.10, 0.12]), cylinder(1200, [0.18, 0.1, 0.0], 0.04, 0.15)])
scene += rng.normal(0, 0.002, scene.shape)                           # 2 mm of sensor noise
print("points:", len(scene))

def show(ax, pts, color, title):
    ax.scatter(pts[:, 0], pts[:, 2], s=1, c=color); ax.set_title(title); ax.set_xlabel("x (m)"); ax.set_ylabel("z (m)"); ax.set_aspect("equal")
fig, ax = plt.subplots(figsize=(5, 3)); show(ax, scene, "gray", "Side view of the scene")
```

## Voxel downsampling

Clouds have millions of points. A **voxel grid filter** cuts space into small cubes (voxels) and keeps **one point per voxel** (the average). This reduces size, makes the density uniform, and speeds up everything after it.

```python run title="Voxel grid downsampling" level=intermediate shared
def voxel_downsample(pts, voxel):
    keys = np.floor(pts / voxel).astype(np.int64)
    _, inverse, counts = np.unique(keys, axis=0, return_inverse=True, return_counts=True)
    sums = np.zeros((counts.size, 3))
    np.add.at(sums, inverse.ravel(), pts)
    return sums / counts[:, None]

down = voxel_downsample(scene, 0.01)
print("before:", len(scene), "points   after a 1 cm voxel grid:", len(down), "points")
```

## Surface normals

A **normal** is the direction perpendicular to the surface at a point. For each point, take its `k` nearest neighbours and fit a plane: the normal is the direction of **least variance**, the eigenvector of the neighbours' covariance matrix with the smallest eigenvalue (PCA). Normals are used for shading, segmentation, feature descriptors (FPFH) and point-to-plane ICP.

```python run title="Normals with PCA of the neighbourhood" level=advanced shared
from scipy.spatial import cKDTree

tree = cKDTree(down)
_, nbrs = tree.query(down, k=20)                                      # the 20 nearest neighbours of every point
normals = np.zeros_like(down)
for i, idx in enumerate(nbrs):
    q = down[idx] - down[idx].mean(0)
    w, v = np.linalg.eigh(q.T @ q)                                    # eigenvalues in ascending order
    normals[i] = v[:, 0]                                              # the smallest one: the surface normal
table = down[:, 2] < 0.004
print("average |nz| of normals on the table (should be close to 1):", round(float(np.abs(normals[table, 2]).mean()), 3))
```

## Find and remove the table with RANSAC

Most robot scenes have a dominant plane (table, floor). **RANSAC** fits it: pick 3 random points, compute the plane through them, count points within a distance threshold, keep the best. Then **remove** the plane inliers and what remains is the objects.

```python run title="Plane segmentation with RANSAC" level=advanced shared
def ransac_plane(pts, n_iter=200, thresh=0.006):
    best, best_inl = None, None
    for _ in range(n_iter):
        p = pts[rng.choice(len(pts), 3, replace=False)]
        nrm = np.cross(p[1] - p[0], p[2] - p[0])
        if np.linalg.norm(nrm) < 1e-9:
            continue
        nrm /= np.linalg.norm(nrm)
        dist = np.abs((pts - p[0]) @ nrm)
        inl = dist < thresh
        if best is None or inl.sum() > best_inl.sum():
            best, best_inl = (nrm, -nrm @ p[0]), inl
    return best, best_inl

(normal, d), inliers = ransac_plane(down)
print("plane normal:", np.round(normal, 3), " offset:", round(float(d), 4), " inliers:", int(inliers.sum()), "of", len(down))
objects = down[~inliers]
print("points left after removing the table:", len(objects))
fig, ax = plt.subplots(figsize=(5, 3)); show(ax, down[inliers], "lightgray", "table removed: objects in red"); ax.scatter(objects[:, 0], objects[:, 2], s=2, c="red")
```

## Separate the objects: clustering

The points left over form separate groups. **Euclidean clustering** joins points closer than a distance `ε` (DBSCAN does this). One cluster per object; then fit a box or a cylinder, or estimate a pose.

```python run title="DBSCAN clustering of the remaining points" level=intermediate shared
from sklearn.cluster import DBSCAN

labels = DBSCAN(eps=0.02, min_samples=8).fit_predict(objects)
for k in sorted(set(labels) - {-1}):
    c = objects[labels == k]
    print(f"object {k}: {len(c):4d} points  centre {np.round(c.mean(0), 3)}  size (x, y, z) {np.round(c.max(0) - c.min(0), 3)}")
print("points labelled as noise:", int((labels == -1).sum()))
```

The two clusters have the sizes of the box (14 × 10 × 12 cm) and the cylinder (8 cm across, 15 cm tall).

## ICP: align a model with a scan

You have a **model** of the object (for example from CAD) and a **scan** (the point cloud of the object as the robot sees it). **Iterative Closest Point (ICP)** finds the rotation `R` and translation `t` that place the model on the scan. The loop:

:::flow ICP
1. Correspondences | For each model point, find its nearest scan point (KD-tree).
2. Best rigid transform | Given these pairs, compute R and t that minimise the sum of squared distances (closed form with SVD, the Kabsch method).
3. Apply and repeat | Move the model. Stop when the error stops falling.
:::

```python run title="ICP from scratch" level=advanced shared
def best_rigid(A, B):
    """R, t minimising || R A + t - B ||, for matched Nx3 sets (Kabsch)."""
    ca, cb = A.mean(0), B.mean(0)
    H = (A - ca).T @ (B - cb)
    U, _, Vt = np.linalg.svd(H)
    D = np.diag([1, 1, np.sign(np.linalg.det(Vt.T @ U.T))])           # avoid a reflection
    R = Vt.T @ D @ U.T
    return R, cb - R @ ca

def icp(model, scan, iters=40):
    tree = cKDTree(scan)
    R_tot, t_tot, cur = np.eye(3), np.zeros(3), model.copy()
    history = []
    for _ in range(iters):
        dist, idx = tree.query(cur)                                    # step 1: nearest neighbours
        R, t = best_rigid(cur, scan[idx])                              # step 2: best transform for these pairs
        cur = cur @ R.T + t                                            # step 3: move the model
        R_tot, t_tot = R @ R_tot, R @ t_tot + t
        history.append(float(np.sqrt(np.mean(dist ** 2))))
    return R_tot, t_tot, history

# the model: the box (three visible faces, 900 points). The scan: the same box moved and turned, scanned again
# (different random points on the faces, 700 of them) with 1 mm of noise.
box_size = [0.14, 0.10, 0.12]
model = box(900, [0, 0, 0], box_size)
def rot_z(deg):
    a = np.deg2rad(deg)
    return np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
R_true, t_true = rot_z(25), np.array([0.03, -0.02, 0.01])
scan = box(700, [0, 0, 0], box_size) @ R_true.T + t_true + rng.normal(0, 0.001, (700, 3))

R_est, t_est, hist = icp(model, scan)
angle = np.degrees(np.arccos(np.clip((np.trace(R_est.T @ R_true) - 1) / 2, -1, 1)))
print("RMS distance  start:", round(hist[0] * 1000, 2), "mm   end:", round(hist[-1] * 1000, 2), "mm   (the two clouds sample the surface at different points)")
print("rotation error:", round(float(angle), 2), "degrees   translation error:", round(float(np.linalg.norm(t_est - t_true)) * 1000, 2), "mm")
```

## ICP's two big weaknesses

1. **It needs a good starting guess.** ICP only finds a **local** minimum. If the model starts far away or rotated more than about 30–40 degrees, it locks onto the wrong place.
2. **Partial overlap and outliers** can bias it. Use a distance cut-off (ignore far pairs) or robust weights.

```python run title="ICP depends on the starting guess" level=advanced shared
for start_deg in (10, 40, 90, 160):
    R, t, h = icp(model @ rot_z(start_deg).T, scan, iters=60)           # start with the model turned by start_deg about the vertical axis
    print(f"start rotated by {start_deg:3d} degrees -> final RMS {h[-1] * 1000:6.2f} mm")
```

Up to about 90 degrees of start error ICP finds the right pose (the small final error), but from 160 degrees it falls into a wrong local minimum and the final error stays high. (A rotationally symmetric object such as the cylinder is even harder: ICP cannot tell its turn about the axis at all. That is why we used the box.)

## Global registration and other ICP variants

- **Global registration** finds a rough alignment **without a start guess**: compute local 3-D descriptors (**FPFH**, or learned ones such as FCGF, GeoTransformer), match them, and run **RANSAC** over the matches (this is the 3-D version of the panorama pipeline). Then refine with ICP.
- **Point-to-plane ICP** minimises the distance from each point to the **tangent plane** of its match (uses normals). It converges faster and is more accurate on smooth surfaces.
- **Generalised ICP**, **robust ICP** (Huber, trimmed) and **colour ICP** handle noise and partial overlap.
- **Open3D** and **PCL** (C++) are the standard libraries for all of the above, with fast KD-trees and GPU support.

## From registration to pose estimation for robots

For bin picking, a common pipeline is: segment objects (clustering or a neural network), compute a **coarse pose** (global registration, a learned pose network), **refine with ICP** against the CAD model, check the **fit score**, then plan a grasp. The fit score (RMS and the fraction of model points with a close scan point) tells you whether to trust the pose.

:::interview Questions you may get
- "Explain ICP." Alternate: nearest-neighbour correspondences, closed-form best rigid transform (SVD), update; repeat until convergence.
- "What are ICP's limitations?" Local minima (needs initial alignment), sensitive to outliers and partial overlap, assumes a rigid transform.
- "How would you register two scans without an initial guess?" Global registration: 3-D keypoints and descriptors (FPFH), RANSAC on correspondences, then ICP refinement.
- "How do you compute a surface normal?" PCA of the k-nearest neighbours; the eigenvector of the smallest eigenvalue.
- "How do you find and remove the ground or table?" RANSAC plane fit (or a known calibrated plane), then filter points above it.
- "Point-to-point versus point-to-plane?" Point-to-plane uses surface normals and usually converges faster and more precisely.
:::

```quiz
? What does a voxel grid filter do?
- Adds colour to points
+ Keeps one representative point per small cube, reducing and evening out the density
- Removes the table
> It is the standard first step before heavy processing.

? How is the normal of a point estimated?
- From its colour
+ Using the eigenvector of the smallest eigenvalue of the covariance of its neighbours
- From its distance to the camera
> The smallest-variance direction is perpendicular to the local plane.

? ICP starts with the model 120 degrees away from the right pose. What is likely?
- It always converges
+ It may converge to a wrong local minimum
- It diverges to infinity
> ICP needs a good initial alignment or a global registration step.

? Which step provides a start guess for ICP when none is available?
- Voxel filtering
+ Global registration with 3-D feature descriptors and RANSAC
- Colour correction
> FPFH + RANSAC gives a coarse alignment to refine with ICP.
```

:::problem A robot cell scans a part with a 3-D camera and ICP often converges to a 180-degree flipped pose for a nearly symmetric part. What do you do? {level=hard tags="icp,pose,robotics"}
Think about ambiguity and verification.

:::solution Model answer
Symmetric or nearly symmetric shapes have several equally good alignments, so ICP's result depends on the start. Add information that breaks the symmetry: a feature (hole, notch, logo) used as part of the matching or as a verification check; compute **several candidate poses** (starts spread over the symmetry group, from a global registration or a pose network), refine each with ICP and pick the best by fit score **plus** a check on the asymmetric feature; use colour or intensity in the cost (colour ICP); constrain the pose with prior knowledge (the part lies flat on the table, so only 2 flips are possible); and verify with a second viewpoint. If the gripper can pick either way, accept the symmetric ambiguity.
:::
:::

:::keypoints
- A point cloud is an `N × 3` array. Voxel downsample, estimate normals with PCA, remove the dominant plane with RANSAC, split objects with clustering (DBSCAN).
- ICP: nearest-neighbour matches → SVD rigid transform → repeat. It needs a good start and copes badly with symmetry and outliers.
- Global registration (FPFH + RANSAC) gives the start; point-to-plane ICP refines.
- Check the fit (RMS and overlap) before trusting a pose for a robot.
:::

:::resources
- [Open3D documentation: ICP and global registration](https://www.open3d.org/docs/release/tutorial/pipelines/icp_registration.html) — the standard Python library.
- [Besl and McKay: A Method for Registration of 3-D Shapes (1992)](https://ieeexplore.ieee.org/document/121791) — the ICP paper.
- [Point Cloud Library (PCL)](https://pointclouds.org) — the standard C++ library.
:::
