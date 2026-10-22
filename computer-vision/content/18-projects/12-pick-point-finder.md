---
title: Build a Robot Pick-Point Finder
level: advanced
time: 65
icon: bot
cover: #f59e0b,#0f766e
tags: depth, point cloud, plane fitting, ransac, segmentation, grasp, hand-eye calibration
summary: From a depth image of objects on a table to a pick pose in the robot's frame. Simulate a calibrated depth camera, fit the table plane with RANSAC, segment the objects by height, estimate position, orientation and width of each top face, turn it into a grasp across the short side, transform it with the hand-eye calibration, evaluate the pick accuracy on twenty scenes, and measure how calibration errors and depth noise destroy it.
---

The vision half of a robot pick has one job: say **where to put the gripper, in the robot's own coordinates**, accurately enough for the fingers to close on the object. In this project you build exactly that, end to end, on a simulated depth camera whose **true answer is known**, so you can measure the error budget instead of guessing (module 5, hand-eye calibration; module 14, grasping).

**What you'll build:** a simulator of an overhead depth camera, a table-plane fit, an object segmenter, a grasp estimator, a camera-to-robot transform, and an evaluation including calibration errors and sensor noise.

:::flow The pipeline
Depth image | overhead camera, noise and holes
Deproject | 3-D points in the camera frame
Table plane | RANSAC fit, height above the table
Segment | components above 1.5 cm
Top face | position, orientation, width
Grasp | fingers close across the short side
Hand-eye transform | camera frame to robot base frame
Evaluate | position and angle error, success rate
:::

## Step 1 — A camera, a table and some objects

The robot's frame has its origin on the table (`z` up). The camera is **above the table, looking down, slightly tilted and yawed** (the hand-eye pose `T_bc` maps camera coordinates to base coordinates). Four boxes (length, width, height of 3–6 cm) lie on the table with random positions and rotations. To render the depth image we intersect **each pixel's ray** with the table plane `z = 0` and with the **top face** of every box, and add realistic **depth noise (2 mm)** and **missing pixels (2%)**.

```python run shared title="Step 1 · the simulator"
import numpy as np
import cv2
import cvlab

W, H = 320, 240
K = np.array([[600.0, 0, 160], [0, 600.0, 120], [0, 0, 1]])                       # intrinsics of the depth camera
def rotx(a): c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def rotz(a): c, s = np.cos(a), np.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
R_bc = rotz(np.deg2rad(8)) @ rotx(np.deg2rad(181.5))                               # looking down (180 degrees about x), tilted 1.5 deg and yawed 8 deg
t_bc = np.array([0.30, 0.05, 0.80])                                                # the camera is 80 cm above the table
T_bc = np.eye(4); T_bc[:3, :3], T_bc[:3, 3] = R_bc, t_bc                           # camera -> base transform (the hand-eye calibration)

us, vs = np.meshgrid(np.arange(W), np.arange(H))
rays_cam = np.linalg.inv(K) @ np.stack([us.ravel(), vs.ravel(), np.ones(W * H)])  # one ray per pixel (camera z-component = 1)
rays_base = R_bc @ rays_cam

def plane_depth(z_plane):
    """Camera-z depth where each pixel's ray meets the horizontal plane z = z_plane (in the base frame)."""
    return ((z_plane - t_bc[2]) / rays_base[2]).reshape(H, W)

def project(points_base):
    cam = (np.linalg.inv(T_bc) @ np.c_[points_base, np.ones(len(points_base))].T)[:3]
    uv = K @ cam
    return (uv[:2] / uv[2]).T

def render(objects, rng, noise=0.002, holes=0.02):
    depth = plane_depth(0.0)                                                        # the table
    for x, y, yaw, length, width, height in objects:
        corners = np.array([[sx * length / 2, sy * width / 2] for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]])
        c, s = np.cos(yaw), np.sin(yaw)
        corners = corners @ np.array([[c, s], [-s, c]]) + [x, y]                    # the top face's corners in the base frame
        mask = np.zeros((H, W), np.uint8)
        cv2.fillConvexPoly(mask, np.round(project(np.c_[corners, np.full(4, height)])).astype(np.int32), 1)
        depth = np.where(mask > 0, plane_depth(height), depth)                      # the top face is nearer to the camera
    depth = depth + rng.normal(0, noise, depth.shape)
    depth[rng.random(depth.shape) < holes] = np.nan                                 # missing measurements
    return depth

def random_objects(rng, n=4):
    objs = []
    while len(objs) < n:
        x, y = rng.uniform(0.18, 0.42), rng.uniform(-0.08, 0.17)
        if all(np.hypot(x - o[0], y - o[1]) > 0.075 for o in objs):                 # keep the objects apart
            objs.append((x, y, rng.uniform(0, np.pi), rng.uniform(0.05, 0.07), rng.uniform(0.028, 0.04), rng.uniform(0.03, 0.06)))      # elongated boxes: a well-defined long axis
    return objs

demo_objects = [(0.28, 0.02, np.deg2rad(20), 0.06, 0.035, 0.04), (0.36, 0.10, np.deg2rad(-35), 0.055, 0.04, 0.05),
                (0.24, 0.10, np.deg2rad(70), 0.07, 0.03, 0.03), (0.33, -0.03, np.deg2rad(5), 0.045, 0.04, 0.06)]
depth = render(demo_objects, np.random.default_rng(0))
print(f"depth image {depth.shape}: {np.nanmin(depth):.3f} m (tallest object top) to {np.nanmax(depth):.3f} m (table), {np.isnan(depth).mean():.1%} missing")
colour = cv2.applyColorMap((np.nan_to_num((depth - 0.72) / 0.1, nan=0).clip(0, 1) * 255).astype(np.uint8), cv2.COLORMAP_TURBO)[..., ::-1]
cvlab.show(colour, "Depth image (objects are nearer = hotter colours)")
```

## Step 2 — Find the table with RANSAC

Back-project every pixel to a 3-D point in the **camera** frame (`X = (u − cx)·Z/f`, and so on). Most points belong to the table, so a **plane fitted with RANSAC** (module 4: sample three points, count points within 4 mm, keep the best) finds it even though the objects are outliers. The **height above the plane** of every point then separates objects from table, regardless of the camera tilt. No calibration is needed for this step.

```python run shared title="Step 2 · deproject, fit the table, compute heights"
def deproject(depth):
    return np.stack([(us - K[0, 2]) * depth / K[0, 0], (vs - K[1, 2]) * depth / K[1, 1], depth], -1)

def fit_plane(points, rng, thresh=0.004, iters=80, subsample=6000):
    pts = points.reshape(-1, 3); pts = pts[np.isfinite(pts).all(1)]
    pts = pts[rng.choice(len(pts), min(subsample, len(pts)), replace=False)]       # a subsample is enough to find the dominant plane
    best, best_inliers = None, 0
    for _ in range(iters):
        s = pts[rng.choice(len(pts), 3, replace=False)]
        n = np.cross(s[1] - s[0], s[2] - s[0]); norm = np.linalg.norm(n)
        if norm < 1e-12: continue
        n /= norm; d = -n @ s[0]
        inliers = (np.abs(pts @ n + d) < thresh).sum()
        if inliers > best_inliers: best, best_inliers = (n, d), inliers
    n, d = best
    return (n, d) if n[2] > 0 else (-n, -d), best_inliers / len(pts)

rng = np.random.default_rng(1)
points = deproject(depth)
(normal, offset), frac = fit_plane(points, rng)
height = -(points @ normal + offset)                                                # positive = above the table (towards the camera)
print(f"table plane: {frac:.0%} of the points are inliers | normal in the camera frame {np.round(normal, 3)}")
print(f"the camera's tilt is visible in the normal: angle from the optical axis = {np.degrees(np.arccos(normal[2])):.2f} degrees (we built in 1.5 degrees)")
print(f"object heights seen: {np.nanmax(height) * 100:.1f} cm at most; table noise (std of height on the table): {np.nanstd(height[np.nan_to_num(height) < 0.01]) * 1000:.1f} mm")
cvlab.show((np.nan_to_num(height).clip(0, 0.07) / 0.07 * 255).astype(np.uint8), "Height above the table (white = 7 cm)")
```

## Step 3 — Segment the objects and find their top faces

Threshold the height at **1.5 cm**, clean with morphology (module 2), and label the connected components (module 3). For each object, the **top face** is the set of its highest points (the top 40%); we transform these points into the **robot base frame** with the hand-eye transform and fit a rotated rectangle with `cv2.minAreaRect` **in metres**, which gives the centre, the long and short side lengths and the orientation. Working in the base frame (not in pixels) makes the angles and sizes **perspective-correct**.

The **grasp** for a two-finger gripper closes **across the short side**: the closing direction is perpendicular to the long axis. The pick pose is the top-face centre, the top height and that closing angle.

```python run shared title="Step 3 · segmentation and grasp estimation"
def segment_objects(depth, rng, min_height=0.015, min_area=60):
    pts = deproject(depth)
    (n, d), _ = fit_plane(pts, rng)
    h = -(pts @ n + d)
    mask = (np.nan_to_num(h) > min_height).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n_lab, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    found = []
    for k in range(1, n_lab):
        if stats[k, cv2.CC_STAT_AREA] < min_area: continue
        sel = (labels == k) & np.isfinite(pts[..., 2])
        hh = h[sel]; top = hh > np.percentile(hh, 60)                                 # the top face: the highest points
        found.append(dict(top_cam=pts[sel][top], height=float(np.median(hh[top])), area_px=int(stats[k, cv2.CC_STAT_AREA])))
    return found

def grasp_from_object(obj, T_est):
    top_base = (T_est @ np.c_[obj["top_cam"], np.ones(len(obj["top_cam"]))].T)[:3].T         # camera -> base frame
    (cx, cy), (a, b), angle = cv2.minAreaRect(top_base[:, :2].astype(np.float32))               # rotated rectangle in metres
    if a < b: a, b, angle = b, a, angle + 90                                                   # a = the long side
    close_angle = (np.deg2rad(angle) + np.pi / 2) % np.pi                                      # fingers close across the short side
    return dict(xy=np.array([cx, cy]), z=float(top_base[:, 2].mean()), long=float(a), short=float(b), close_angle=close_angle, height=obj["height"])

objs = segment_objects(depth, np.random.default_rng(2))
grasps = [grasp_from_object(o, T_bc) for o in objs]                                          # here we use the TRUE hand-eye transform
print(f"{len(objs)} objects found")
print("object | centre x, y (m)  | top z (m) | long x short (cm) | closing angle (deg)")
for i, g in enumerate(sorted(grasps, key=lambda g: g["xy"][0])):
    print(f"{i:>6} | ({g['xy'][0]:.3f}, {g['xy'][1]:.3f})   | {g['z']:.3f}     | {g['long'] * 100:.1f} x {g['short'] * 100:.1f}       | {np.degrees(g['close_angle']):.0f}")
print("true centres (x, y):", sorted((round(o[0], 3), round(o[1], 3)) for o in demo_objects))
```

## Step 4 — Evaluate against the truth on twenty scenes

A pick **succeeds** if the position error is under **5 mm** and the closing-angle error under **10°** (a typical tolerance for a parallel gripper with a few millimetres of play). We generate 20 random scenes (80 objects), run the pipeline with the **true** hand-eye transform first, then report the errors. Our boxes are elongated (aspect ratio at least 1.25), so the long axis and therefore the closing direction are well defined; for a square object any of four closing directions is equally good, which is a real-world subtlety.

```python run shared title="Step 4 · position and angle errors"
def match_to_truth(grasps, objects):
    """For every true object: the error of the nearest estimated grasp. Returns a list of (position error m, angle error rad)."""
    out = []
    for x, y, yaw, length, width, height in objects:
        if not grasps: out.append((np.inf, np.inf)); continue
        j = int(np.argmin([np.linalg.norm(g["xy"] - [x, y]) for g in grasps])); g = grasps[j]
        da = abs(g["close_angle"] - (yaw + np.pi / 2) % np.pi); da = min(da, np.pi - da)
        out.append((float(np.linalg.norm(g["xy"] - [x, y])), float(da)))
    return out

scenes = []
for i in range(20):
    r = np.random.default_rng(100 + i)
    objs_true = random_objects(r)
    scenes.append((objs_true, render(objs_true, r)))

def evaluate(T_est, scene_depths=None, pos_tol=0.005, ang_tol=np.deg2rad(10), seed=3):
    errs = []
    for k, (truth, d) in enumerate(scenes if scene_depths is None else scene_depths):
        found = segment_objects(d, np.random.default_rng(seed + k))
        errs += match_to_truth([grasp_from_object(o, T_est) for o in found], truth)
    pe, ae = np.array([e[0] for e in errs]), np.array([e[1] for e in errs])
    return dict(success=float(np.mean((pe < pos_tol) & (ae < ang_tol))), pos_mm=float(np.median(pe) * 1000), ang_deg=float(np.degrees(np.median(ae))), n=len(errs))

res = evaluate(T_bc)
print(f"{res['n']} objects in 20 scenes with a perfect hand-eye calibration:")
print(f"  success rate (< 5 mm and < 10 deg): {res['success']:.0%} | median position error {res['pos_mm']:.2f} mm | median angle error {res['ang_deg']:.2f} deg")
assert res["success"] > 0.9
```

## Step 5 — Can the gripper actually do it?

Vision gives candidate grasps; the robot needs the **feasible** ones. Two simple checks:

1. **Width**: the object's *short side* must fit inside the gripper's opening (8 cm here) and be wide enough to hold.
2. **Clearance**: the two fingers are about 1 cm thick and open slightly wider than the object; a neighbouring object **within the finger footprint** would collide. We approximate it by requiring that no other object's centre lies within a safety distance of the grasp centre in the closing direction.

Then we **rank** the feasible grasps: **tallest first** (top of a pile) and, among equals, the one with the **most clearance**.

```python run shared title="Step 5 · feasibility and ordering"
GRIPPER_OPEN = 0.08
FINGER_THICK = 0.01
def feasible_grasps(grasps):
    out = []
    for i, g in enumerate(grasps):
        need = g["short"] + 0.01 + 2 * FINGER_THICK                              # opening needed: object width + 1 cm margin + two fingers
        if g["short"] > GRIPPER_OPEN - 0.02:
            continue                                                             # too wide to grasp across the short side
        others = [np.linalg.norm(o["xy"] - g["xy"]) for j, o in enumerate(grasps) if j != i]
        clearance = min(others) - (g["long"] / 2 + 0.02) if others else 1.0       # distance to the nearest neighbour beyond our own body
        out.append(dict(g, clearance=float(clearance), ok=bool(clearance > 0.01)))
    return sorted(out, key=lambda g: (not g["ok"], -g["height"], -g["clearance"]))

plan = feasible_grasps(grasps)
print("pick order (feasible first, then tallest):")
for rank, g in enumerate(plan, 1):
    print(f"  {rank}. centre ({g['xy'][0]:.3f}, {g['xy'][1]:.3f}) m, height {g['height'] * 100:.1f} cm, short side {g['short'] * 100:.1f} cm, clearance {g['clearance'] * 100:.1f} cm {'' if g['ok'] else '(collision risk: skip)'}")
vis = colour.copy()
for g in plan:
    u, v = project(np.array([[g["xy"][0], g["xy"][1], g["z"]]]))[0]
    cv2.circle(vis, (int(u), int(v)), 4, (255, 255, 255), -1)
    d = np.array([np.cos(g["close_angle"]), np.sin(g["close_angle"])]) * 0.03                    # the closing axis, drawn 3 cm either side
    p1, p2 = project(np.array([[g["xy"][0] - d[0], g["xy"][1] - d[1], g["z"]], [g["xy"][0] + d[0], g["xy"][1] + d[1], g["z"]]]))
    cv2.line(vis, (int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1])), (255, 255, 255), 2)
cvlab.show(vis, "Grasp centres and closing axes (white)")
```

## Step 6 — The error budget: hand-eye calibration

The vision measurement is good to a millimetre, but the robot acts in **its own frame**, through the **hand-eye calibration** `T_bc` (module 5). A small rotation error is multiplied by the distance (the **lever arm**, here 0.8 m). We perturb `T_bc` with random rotation and translation errors and repeat the evaluation with the **same** depth images.

```python run shared title="Step 6 · calibration errors"
def perturb(T, rot_deg, trans_mm, rng):
    axis = rng.normal(size=3); axis /= np.linalg.norm(axis)
    Tn = T.copy()
    Tn[:3, :3] = cv2.Rodrigues(axis * np.deg2rad(rot_deg))[0] @ T[:3, :3]
    Tn[:3, 3] += rng.normal(0, trans_mm / 1000, 3)
    return Tn

print("hand-eye error (rotation, translation) | median position error | success at 5 mm | at 10 mm")
for rot, tr in [(0, 0), (0.2, 2), (0.5, 3), (1.0, 5), (2.0, 5)]:
    T_est = perturb(T_bc, rot, tr, np.random.default_rng(42)) if (rot or tr) else T_bc
    r5 = evaluate(T_est); r10 = evaluate(T_est, pos_tol=0.010)
    print(f"{rot:>4.1f} deg, {tr:>2} mm                       | {r5['pos_mm']:>12.1f} mm        | {r5['success']:>10.0%}      | {r10['success']:>5.0%}")
print(f"the lever arm: 1 degree at 0.8 m is {np.tan(np.deg2rad(1)) * 800:.1f} mm; the picks break long before the vision is wrong")
print("remedies: a careful hand-eye calibration (module 5), a wrist camera for the last centimetres (eye-in-hand), visual servoing, compliant fingers")
```

## Step 7 — Sensor noise and missing depth

Real depth cameras are noisy, and they **lose pixels on shiny, dark and transparent objects**. We rerun the pipeline with larger depth noise and more missing pixels (with the true calibration) to see the sensor's share of the error.

```python run shared title="Step 7 · depth noise and holes"
print("depth noise | missing pixels | success at 5 mm | median position error")
for noise, holes in [(0.001, 0.0), (0.002, 0.02), (0.004, 0.05), (0.008, 0.10), (0.008, 0.30)]:
    noisy = [(objs_true, render(objs_true, np.random.default_rng(500 + i), noise=noise, holes=holes)) for i, (objs_true, _) in enumerate(scenes)]
    r = evaluate(T_bc, noisy)
    print(f"{noise * 1000:>8.0f} mm | {holes:>12.0%} | {r['success']:>14.0%}  | {r['pos_mm']:>8.1f} mm")
print("averaging many points of the top face makes the position robust to noise; holes hurt when they remove whole faces, which is why shiny parts need special lighting or sensors")
```

## How it works

| Piece | Purpose |
|---|---|
| Deprojection `X = (u − cx) Z / f` | turns the depth image into a 3-D point cloud in the camera frame |
| RANSAC plane fit | finds the table despite the objects; heights are measured relative to it |
| Height threshold + components | segments objects without any training |
| Top face and `minAreaRect` in metres | perspective-correct position, size and orientation |
| Closing across the short side | the antipodal two-finger grasp (module 14) |
| `T_bc` hand-eye transform | camera coordinates to the robot's frame; its accuracy sets the pick accuracy |
| Feasibility and clearance | the gripper's physics: width and neighbours |

**What a production system adds**: instance segmentation with a learned model (for touching, stacked or textured objects), 6-D pose estimation against a CAD model (module 14), grasp networks for unknown objects, collision-aware planning against the whole point cloud, a **verification** step after the pick (weight, camera), and recalibration checks. And it is tested exactly like this: in simulation first, with an **error budget**.

:::exercise Extend it
1. Make two objects **touch** and watch the segmenter merge them; separate them with the distance transform and watershed (module 3).
2. Add **stacked** objects (a box on a box) and use the height to pick the top one first.
3. Make one object **shiny** by adding large holes on its top face and see which pick fails; then fill the holes by interpolation.
4. Estimate the hand-eye error from the data: put a **calibration marker** of known pose on the table, compare, and correct `T_bc`.
5. Add the **gripper approach**: compute a pre-grasp pose 10 cm above the grasp and check that it is inside the robot's reachable workspace.
6. Replace the minimum-area rectangle by a **PCA** of the top-face points and compare the angle error.
:::

:::keypoints
- A pick pose is a position, a height and a closing angle in the robot's frame; vision supplies it from depth and the hand-eye transform.
- RANSAC finds the table plane robustly; heights above it separate objects from the table without training.
- Fitting rectangles in metres (base frame) gives perspective-correct size and orientation.
- Calibration errors are amplified by the lever arm: a fraction of a degree breaks a 5 mm tolerance, far more than depth noise does.
- Check feasibility (gripper width, clearance), rank the picks, and always evaluate with a simulated ground truth before the real robot.
:::
