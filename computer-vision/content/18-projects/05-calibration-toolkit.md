---
title: Build a Camera Calibration Toolkit
level: advanced
time: 60
icon: eye
cover: #14b8a6,#6366f1
tags: calibration, intrinsics, distortion, chessboard, reprojection error, undistortion
summary: Calibrate a camera from chessboard images and learn what makes a calibration good. A simulator renders lens-distorted chessboard views from a known camera, so you can detect corners, run cv2.calibrateCamera, compare the recovered focal length and distortion with the truth, undistort images, validate on held-out poses, and discover why a low reprojection error can still hide a wrong focal length.
---

Every measurement or 3-D computation from a camera (module 5) starts with its **intrinsics** (focal lengths, principal point) and **lens distortion**. Zhang's method gets them from photos of a flat chessboard. Most people run `cv2.calibrateCamera`, see an RMS error below one pixel, and stop. This project shows that **a small RMS error does not prove a good calibration**, because we know the true camera and can check.

**What you'll build:** a simulator of a distorted camera, a `calibrate(images)` function, a comparison with the truth, an undistortion test, and experiments on how the choice of views changes the accuracy.

:::flow The pipeline
True camera | K, distortion (known to us only)
Render views | a chessboard at varied poses, with lens distortion
Find corners | chessboard detection + sub-pixel refinement
calibrateCamera | K, distortion, board poses
Check | error versus truth, undistortion, held-out validation
Experiments | what makes views good or bad
:::

:::def Intrinsics and distortion
`K = [[fx, 0, cx], [0, fy, cy], [0, 0, 1]]` maps camera coordinates to pixels. Lens distortion bends straight lines: radial terms `k1, k2, k3` (barrel or pincushion) and tangential terms `p1, p2`. Calibration estimates all of them by minimising the **reprojection error**: the distance between the detected chessboard corners and the corners predicted by the model.
:::

## Step 1 — A simulated camera and a chessboard

We pick a true camera (`fx = 820, fy = 815, cx = 322, cy = 241`, noticeable barrel distortion) and render a chessboard with **25 mm squares** at random poses. Each view is produced by projecting the board plane with a homography and then applying the lens distortion with `remap`. Real photos would replace this step; everything after it is identical.

```python run shared title="Step 1 · the true camera and a view generator"
import numpy as np
import cv2
import cvlab

W, H = 640, 480
K_true = np.array([[820.0, 0, 322.0], [0, 815.0, 241.0], [0, 0, 1]])
dist_true = np.array([-0.28, 0.09, 0.0008, -0.0006, 0.0])                   # k1, k2, p1, p2, k3

board = cvlab.checkerboard(rows=6, cols=9, square=40, border=40)            # the picture of the board (40 px squares), 8 x 5 inner corners
pattern, sq_mm = (8, 5), 25.0
objp = np.zeros((pattern[0] * pattern[1], 3), np.float32)                   # the inner corners in the board's own frame, in millimetres
objp[:, :2] = np.mgrid[0:pattern[0], 0:pattern[1]].T.reshape(-1, 2) * sq_mm
S = np.array([[sq_mm / 40, 0, -80 * sq_mm / 40], [0, sq_mm / 40, -80 * sq_mm / 40], [0, 0, 1]])      # board image pixel -> board plane millimetres

# lens distortion maps: for each pixel of the distorted output, where does it come from in the ideal image?
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
src = cv2.undistortPoints(np.stack([xs.ravel(), ys.ravel()], 1)[:, None, :], K_true, dist_true, P=K_true).reshape(H, W, 2)
mapx, mapy = src[..., 0].astype(np.float32), src[..., 1].astype(np.float32)

def render(rvec, tvec):
    R = cv2.Rodrigues(np.asarray(rvec, float))[0]
    Hp = K_true @ np.column_stack([R[:, 0], R[:, 1], tvec]) @ S             # board plane -> ideal image: a homography
    ideal = cv2.warpPerspective(board, Hp, (W, H), borderValue=128)
    return cv2.remap(ideal, mapx, mapy, cv2.INTER_LINEAR, borderValue=128)  # then bend it with the lens distortion

def random_pose(rng, max_tilt=35, z_range=(350, 650), spread=60):
    centre = np.array([sq_mm * 3.5, sq_mm * 2, 0])                          # the middle of the corner grid
    for _ in range(200):
        rv = np.deg2rad(rng.uniform(-max_tilt, max_tilt, 3)) * np.array([1, 1, 3])
        R = cv2.Rodrigues(rv)[0]
        t = np.array([*rng.uniform(-spread, spread, 2), rng.uniform(*z_range)]) - R @ centre
        pix = cv2.projectPoints(objp, cv2.Rodrigues(R)[0], t, K_true, dist_true)[0].reshape(-1, 2)
        if pix[:, 0].min() > 15 and pix[:, 0].max() < W - 15 and pix[:, 1].min() > 15 and pix[:, 1].max() < H - 15:     # the whole board must be visible
            return cv2.Rodrigues(R)[0].ravel(), t
    raise RuntimeError("no valid pose")

rng = np.random.default_rng(0)
poses = [random_pose(rng) for _ in range(20)]
views = [render(*p) for p in poses]
print(f"rendered {len(views)} views of size {views[0].shape}")
cvlab.show(views[0], "View 0", views[1], "View 1", views[2], "View 2")
```

## Step 2 — Find the corners

`findChessboardCorners` locates the 8 × 5 inner corners (the pattern size counts **inner** corners, not squares: a classic mistake), and `cornerSubPix` refines each to a fraction of a pixel by fitting the local saddle shape. Sub-pixel accuracy matters: calibration quality is limited by corner localisation.

```python run shared title="Step 2 · corner detection with sub-pixel refinement"
def find_corners(img):
    ok, c = cv2.findChessboardCorners(img, pattern, cv2.CALIB_CB_ADAPTIVE_THRESH)
    if not ok:
        return None
    return cv2.cornerSubPix(img, c, (7, 7), (-1, -1), (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.001))

found = [find_corners(v) for v in views]
print(f"boards found in {sum(f is not None for f in found)} of {len(views)} views")
# detection accuracy against the true projected corners (possible only in a simulation)
errs = [np.linalg.norm(f.reshape(-1, 2) - cv2.projectPoints(objp, p[0], p[1], K_true, dist_true)[0].reshape(-1, 2), axis=1).mean()
        for f, p in zip(found, poses) if f is not None]
print(f"mean corner localisation error: {np.mean(errs):.3f} px")
vis = cv2.cvtColor(views[0], cv2.COLOR_GRAY2RGB); cv2.drawChessboardCorners(vis, pattern, found[0], True)
cvlab.show(vis, "Detected corners (the line joins them in order)")
```

## Step 3 — Calibrate and compare with the truth

`cv2.calibrateCamera` takes the object points (the same grid in every view), the detected image points and the image size, and returns the RMS reprojection error, `K`, the distortion coefficients and a pose per view. We fix `k3` (`CALIB_FIX_K3`), the usual choice for normal lenses, because `k1, k2, k3` are strongly correlated and leaving all three free lets noise wander between them.

```python run shared title="Step 3 · calibrateCamera and the error against the truth"
def calibrate(images, flags=cv2.CALIB_FIX_K3):
    obj, img_pts = [], []
    for im in images:
        c = find_corners(im)
        if c is not None:
            obj.append(objp); img_pts.append(c)
    if len(obj) < 3:
        return None
    rms, K, d, rvecs, tvecs = cv2.calibrateCamera(obj, img_pts, (W, H), None, None, flags=flags)
    return dict(rms=rms, K=K, dist=d.ravel(), n=len(obj), rvecs=rvecs, tvecs=tvecs, obj=obj, img=img_pts)

def compare(cal, label=""):
    K, d = cal["K"], cal["dist"]
    print(f"{label:<34} views {cal['n']:>2} | RMS {cal['rms']:.3f} px | errors: fx {abs(K[0,0]-K_true[0,0]):6.2f}  fy {abs(K[1,1]-K_true[1,1]):6.2f}  cx {abs(K[0,2]-K_true[0,2]):5.2f}  cy {abs(K[1,2]-K_true[1,2]):5.2f}  k1 {abs(d[0]-dist_true[0]):.3f}  k2 {abs(d[1]-dist_true[1]):.3f}")

cal = calibrate(views)
print("estimated K:\n", np.round(cal["K"], 1), "\ntrue K:\n", K_true)
print("estimated distortion k1, k2, p1, p2, k3:", np.round(cal["dist"], 4), "\ntrue:                                  ", dist_true)
compare(cal, "20 varied views")
assert abs(cal["K"][0, 0] - K_true[0, 0]) < 2 and cal["rms"] < 0.2
```

## Step 4 — Undistort and test straightness

If calibration is right, **straight lines in the world become straight in the undistorted image**. The chessboard rows are straight 3-D lines, so we measure how far the detected corners of each row are from their best-fit line, before and after undistorting the corner positions.

```python run shared title="Step 4 · are the lines straight after undistortion?"
def row_straightness(points):                                           # points: (5 rows x 8) corners in the board grid order -> mean deviation from a straight line
    P = points.reshape(pattern[1], pattern[0], 2); dev = []
    for row in P:
        c = row - row.mean(0)
        direction = np.linalg.svd(c)[2][0]                              # best-fit line direction (total least squares)
        normal = np.array([-direction[1], direction[0]])
        dev.append(np.abs(c @ normal).max())                            # worst point-to-line distance in this row
    return float(np.mean(dev))

before, after = [], []
for f in found:
    pts = f.reshape(-1, 2)
    und = cv2.undistortPoints(f, cal["K"], cal["dist"], P=cal["K"]).reshape(-1, 2)
    before.append(row_straightness(pts)); after.append(row_straightness(und))
print(f"worst deviation of a board row from a straight line: before undistortion {np.mean(before):.2f} px -> after {np.mean(after):.2f} px")
assert np.mean(after) < 0.25 * np.mean(before)

und_img = cv2.undistort(views[3], cal["K"], cal["dist"])
cvlab.show(views[3], "Distorted view (rows bow outwards)", und_img, "Undistorted with the estimated model")
```

## Step 5 — Validate on poses you did not calibrate with

A calibration is only useful if it works on **new** images. We render five new poses, detect their corners, find each pose with `solvePnP` using the estimated `K` and distortion, and report the **reprojection error on these held-out views**, which should be close to the calibration RMS. If it is much larger, the model is overfitted to the calibration views.

```python run shared title="Step 5 · held-out reprojection error"
rng_test = np.random.default_rng(123)
test_poses = [random_pose(rng_test) for _ in range(5)]
errs = []
for p in test_poses:
    c = find_corners(render(*p))
    ok, rv, tv = cv2.solvePnP(objp, c, cal["K"], cal["dist"])
    proj = cv2.projectPoints(objp, rv, tv, cal["K"], cal["dist"])[0].reshape(-1, 2)
    errs.append(np.sqrt(np.mean(np.sum((proj - c.reshape(-1, 2)) ** 2, axis=1))))
print(f"held-out reprojection RMS: {np.mean(errs):.3f} px (calibration RMS was {cal['rms']:.3f})")
print("a large gap between the two numbers is a sign of overfitting: more varied views are needed")
```

## Step 6 — What makes a good calibration? Three experiments

Now the important part. We calibrate with deliberately **bad view sets** and compare the *true parameter errors*, which a real project can never see. Watch the RMS column: it stays small even when the focal length is wrong.

```python run shared title="Step 6 · good views, frontal views, small central views, and the number of views"
rng = np.random.default_rng(5)
frontal = [render(*random_pose(rng, max_tilt=2)) for _ in range(15)]                    # the board always faces the camera
small = []
rng = np.random.default_rng(6)
for _ in range(15):                                                                      # a far-away board that covers only the image centre
    rv = np.deg2rad(rng.uniform(-30, 30, 3)) * np.array([1, 1, 3]); R = cv2.Rodrigues(rv)[0]
    t = np.array([rng.uniform(-20, 20), rng.uniform(-20, 20), rng.uniform(900, 1100)]) - R @ np.array([sq_mm * 3.5, sq_mm * 2, 0])
    small.append(render(cv2.Rodrigues(R)[0].ravel(), t))

compare(calibrate(views), "20 varied views (good)")
compare(calibrate(frontal), "15 frontal views (no tilt)")
compare(calibrate(small), "15 small, central views")
for n in (3, 5, 10):
    compare(calibrate(views[:n]), f"first {n} of the varied views")
print()
print("frontal views: the RMS is fine but the focal length is off by tens of pixels, because tilt is what separates focal length from distance")
print("small central views: the distortion (k2) and principal point are poorly constrained, because the corners never reach the image borders")
print("few views: with 3 views the result already works in this clean simulation; real, noisy corners need 15-25 views")
```

## How it works

| Piece | Purpose |
|---|---|
| Inner-corner pattern size (8×5) | the detector needs the count of inner corners, not squares |
| `cornerSubPix` | sub-pixel corner positions; calibration accuracy is limited by this |
| Reprojection error | the quantity minimised; measured per corner in pixels |
| `CALIB_FIX_K3` | stops the correlated radial terms from trading off against each other |
| Strongly tilted views | tilt makes foreshortening that separates `f` from distance (a frontal board cannot) |
| Coverage of the whole image, near the borders | distortion is largest at the edges, so edge corners constrain it |
| Held-out validation | detects overfitting of the model to the calibration views |

**A checklist for a real calibration**: a **flat, rigid** board (printed on foam board or glass, not paper held by hand); the actual **square size measured with calipers**; **fixed focus, zoom and aperture** (any change invalidates `K`); 15-30 sharp images at **different tilts, distances and image positions** (corners near all four borders); **no motion blur**; check the per-view reprojection error and **drop outliers** (> 1 px); validate on a few unseen images; re-calibrate after the lens or focus moves.

:::exercise Extend it
1. Add **noise and blur** to the rendered views and see how many views you need before the focal-length error is below 1 pixel.
2. Calibrate with **`CALIB_RATIONAL_MODEL`** and with all of `k1, k2, k3` free; compare the parameter errors.
3. Use a **fisheye** distortion (the equidistant model) in the simulator and calibrate with `cv2.fisheye.calibrate`.
4. Generate views with a **non-square pixel ratio** and a larger skew and check the corresponding estimates.
5. Replace the chessboard by a **ChArUco** board and calibrate from partial views (corners near the border cut off).
6. Compute **per-view reprojection errors** and automatically drop the worst 10% before re-calibrating.
:::

:::keypoints
- Calibration estimates `K` and distortion from chessboard views by minimising reprojection error (Zhang's method, `cv2.calibrateCamera`).
- A low RMS does **not** prove accuracy: frontal-only or small central views can give a small RMS and a wrong focal length.
- Good calibration data has strong tilts, varied distances, and corners covering the whole image including the borders.
- Validate on held-out views and check that straight lines become straight after undistortion.
- Measure the real square size, keep focus and zoom fixed, and re-calibrate after any change.
:::
