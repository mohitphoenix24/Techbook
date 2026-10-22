---
title: Camera Calibration (Zhang's Method)
level: intermediate
time: 50
summary: How to find a camera's K and distortion. Photograph a chessboard in many poses, find the corners, and solve for the parameters. You run the full pipeline on rendered chessboard views, read the reprojection error, and learn what makes a calibration good or bad.
---

To use the pinhole model you need the camera's **intrinsics** `K` (fx, fy, cx, cy) and **distortion coefficients**. The datasheet is only a rough guide. **Calibration** measures them accurately. It is a standard procedure for every robot or measuring camera, and a very common interview topic.

## The idea (Zhang, 2000)

Print a **chessboard**, glue it on something flat, and take 10–20 photos of it from different positions and angles. Zhang's method uses these facts:

- The board is **flat** and its squares have a **known size**, so we know the 3-D position of every corner (in the board's own frame, with Z = 0).
- In each photo we find the 2-D pixel position of every corner (OpenCV does this very precisely).
- Each photo gives a **homography** between the board plane and the image. Each homography gives **two equations** on `K`, because the board's axes must be perpendicular and have equal length. With 3 or more photos we can solve for `K`.
- Then a **non-linear optimisation** refines everything (K, distortion, and the pose of the board in each photo) by minimising the **reprojection error**: the pixel distance between the detected corners and where the model says they should be.

:::flow Calibrating a camera
1. Print and mount a target | A chessboard (or circles grid, or ChArUco board). It must be perfectly flat.
2. Take 10 to 30 photos | Different distances and tilts, covering the whole image, including the corners.
3. Detect the corners | cv2.findChessboardCorners, then cv2.cornerSubPix for sub-pixel accuracy.
4. Solve | cv2.calibrateCamera returns K, distortion, and the board pose for each photo.
5. Check | Look at the reprojection error per image. Remove bad photos. Validate with new photos.
:::

## Make rendered views of a chessboard

We have no camera here, so we **render** photographs of a chessboard from known poses with a known camera (including lens distortion). Then calibration can be checked against the truth. (This is a good habit on real projects too: test your pipeline on synthetic data first.)

```python run title="Render chessboard photos with a known camera" level=intermediate shared
import cv2
import numpy as np
import cvlab

K_true = np.array([[520., 0, 320], [0, 520., 240], [0, 0, 1]])
dist_true = np.array([-0.25, 0.08, 0.0, 0.0, 0.0])
W, H = 640, 480
rows, cols, sq_px, border, sq_m = 6, 9, 40, 40, 0.025            # 9 x 6 squares of 25 mm: 8 x 5 inner corners
board = cvlab.checkerboard(rows, cols, sq_px, border)
pattern = (cols - 1, rows - 1)

obj = np.zeros((pattern[0] * pattern[1], 3), np.float32)           # the 3-D corner positions in the board's own frame (Z = 0), in metres
obj[:, :2] = np.mgrid[0:pattern[0], 0:pattern[1]].T.reshape(-1, 2) * sq_m

A = np.array([[sq_m / sq_px, 0, -border * sq_m / sq_px], [0, sq_m / sq_px, -border * sq_m / sq_px], [0, 0, 1]])   # board picture pixels -> metres
us, vs = np.meshgrid(np.arange(W), np.arange(H))
pix = np.stack([us, vs], -1).reshape(-1, 1, 2).astype(np.float32)
und = cv2.undistortPoints(pix, K_true, dist_true, P=K_true).reshape(H, W, 2)              # maps for adding lens distortion to a clean picture
map_x, map_y = und[..., 0].astype(np.float32), und[..., 1].astype(np.float32)

def photograph(rvec, tvec):
    R, _ = cv2.Rodrigues(rvec)
    Hm = K_true @ np.column_stack([R[:, 0], R[:, 1], tvec.ravel()]) @ A              # board plane -> image: the homography K [r1 r2 t]
    ideal = cv2.warpPerspective(board, Hm, (W, H), borderValue=200)
    return cv2.remap(ideal, map_x, map_y, cv2.INTER_LINEAR, borderValue=200)

rng = np.random.default_rng(3)
photos = []
for _ in range(14):
    rvec = rng.uniform(-0.5, 0.5, 3).reshape(3, 1); rvec[2] *= 0.4                  # a random tilt
    tvec = np.array([rng.uniform(-0.17, 0.0), rng.uniform(-0.12, 0.0), rng.uniform(0.32, 0.6)]).reshape(3, 1)
    photos.append(photograph(rvec, tvec))
print("rendered", len(photos), "photos of size", photos[0].shape)
cvlab.show(photos[0], "view 1", photos[3], "view 4", photos[7], "view 8")
```

## Detect the corners

```python run title="findChessboardCorners and cornerSubPix" level=intermediate shared
object_points, image_points, used = [], [], []
for i, im in enumerate(photos):
    ok, corners = cv2.findChessboardCorners(im, pattern)
    if not ok:
        continue
    corners = cv2.cornerSubPix(im, corners, (11, 11), (-1, -1), (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.001))      # refine to sub-pixel
    object_points.append(obj)
    image_points.append(corners)
    used.append(i)
print("chessboard found in", len(used), "of", len(photos), "photos;", len(obj), "corners each")

vis = cv2.cvtColor(photos[0], cv2.COLOR_GRAY2RGB)
cv2.drawChessboardCorners(vis, pattern, image_points[0], True)
cvlab.show(vis, "Detected corners, drawn as a rainbow in board order")
```

## Calibrate and compare with the truth

```python run title="cv2.calibrateCamera" level=intermediate shared
rms, K_est, dist_est, rvecs, tvecs = cv2.calibrateCamera(object_points, image_points, (W, H), None, None)
print("overall RMS reprojection error (pixels):", round(rms, 3))
print("estimated K:\n", np.round(K_est, 1))
print("true K    :\n", K_true)
print("estimated distortion k1, k2, p1, p2, k3:", np.round(dist_est.ravel(), 3))
print("true distortion                        :", dist_true)
```

The estimated focal length and principal point are within a pixel or two of the truth, `k1` is close, and `k2`/`k3` are less certain (high-order terms are hard to separate; this is normal).

## The reprojection error

How do we judge a calibration on **real** cameras where there is no truth? With the **reprojection error**: project the known 3-D corners with the estimated parameters and compare with the detected corners.

```python run title="Reprojection error per photo" level=intermediate shared
errors = []
for i in range(len(object_points)):
    projected, _ = cv2.projectPoints(object_points[i], rvecs[i], tvecs[i], K_est, dist_est)
    errors.append(float(np.sqrt(np.mean(np.sum((projected - image_points[i]) ** 2, axis=2)))))
print("RMS reprojection error per photo (pixels):", np.round(errors, 3))
print("worst photo:", int(np.argmax(errors)), " mean:", round(float(np.mean(errors)), 3))
```

Rule of thumb: **below 0.5 pixels is good, below 0.2 is excellent.** But a low error alone does not prove a good calibration. With too few or too similar poses, the optimiser can **overfit** (it fits the corners and gets silly parameters). Also check that the parameters are plausible, and validate on **new** photos that were not used.

## What makes a good calibration

- **Many poses (15–30)**, not many photos of the same pose.
- **Tilt the board** (up to about 45°) in different directions. A board facing the camera head-on cannot determine the focal length.
- **Cover the whole image**, especially the corners, where distortion is largest.
- **Good, even light and sharp focus.** Blur or glare moves corners.
- **A truly flat, rigid board** with accurately known square size. A printed paper that curls ruins the result.
- **Lock focus and zoom.** Recalibrate if they change.
- **Remove outliers**: photos with a high error.

**Useful extras:**

- **ChArUco boards** (a chessboard with ArUco markers inside) work even if part of the board is hidden or cut off.
- **Circle grids** are accurate for some setups.
- **Fix parameters** you know (`cv2.CALIB_FIX_PRINCIPAL_POINT`, `CALIB_ZERO_TANGENT_DIST`) for more stable results with fewer photos.
- `cv2.calibrateCameraRO` and **stereo calibration** (`cv2.stereoCalibrate`) for two cameras: the next lessons.

## The practical workflow on a robot

1. Calibrate once at the final lens settings; save K and dist to a file.
2. At runtime, undistort points (or images) with them.
3. Check calibration occasionally (a known target, a few views) because knocks and temperature changes can shift it.
4. Version your calibration files with the camera's serial number.

:::interview Questions you may get
- "How does camera calibration work?" Photograph a planar target of known geometry from many poses, detect corners, estimate K and distortion by minimising the reprojection error (Zhang's method).
- "Why do you need the board at different angles?" A fronto-parallel board makes the equations degenerate; different tilts give enough constraints for the focal length.
- "What is reprojection error and what is a good value?" The pixel distance between detected corners and the model's projection; below 0.5 px is good.
- "What would make a calibration unreliable even with low error?" Too few or similar poses (overfitting), corners not covering the image, a non-flat board, blur.
- "What is ChArUco?" A chessboard with ArUco markers: corners can be detected even when partially occluded.
:::

```quiz
? What is the minimum number of different board views needed in theory to solve for K (with a flat board)?
- 1
+ At least 3 (more are used in practice)
- 100
> Each view gives two equations; K has few unknowns, and extra views give robustness.

? What does reprojection error measure?
+ Pixel distance between detected corners and the corners projected with the estimated model
- The image sharpness
- The board size
> It is the quantity that calibration minimises.

? Why should the board be tilted in the views?
- To make it brighter
+ A board facing the camera head-on does not constrain the focal length well
- To reduce distortion
> Different orientations give independent equations.

? Your calibration reports 0.15 px error, but measurements near the image corners are off. A likely cause?
+ No calibration views had the board near the corners, so distortion there was not constrained
- The error value is wrong
- The camera is too good
> Make sure poses cover the whole field of view, and validate with new photos.
```

:::problem Your calibration of a new robot camera gives fx = 1020, fy = 1450 for a camera whose pixels are square. What do you suspect and what do you do? {level=medium tags="calibration,debugging"}
Think about plausible parameter values.

:::solution Model answer
For square pixels fx and fy should be almost equal. A 40% difference signals a bad calibration (overfitting or insufficient pose variety), not a real camera property. Check: number of poses and tilt; whether the board is flat; whether corners were detected correctly (draw them); the reprojection error per photo and remove outliers. Re-capture with at least 15 varied poses including strong tilts and corners, or constrain the problem with `CALIB_FIX_ASPECT_RATIO` (fy/fx fixed to 1) and `CALIB_ZERO_TANGENT_DIST`. Validate against a held-out set.
:::
:::

:::keypoints
- Zhang's method: photograph a flat target of known size in many poses; each view gives constraints on K; a final non-linear optimisation refines K, distortion and poses.
- `findChessboardCorners` + `cornerSubPix` + `calibrateCamera`. Test on synthetic views first.
- Reprojection error (below 0.5 px) is necessary but not sufficient. Use many varied, tilted poses covering the whole image, with a flat board.
- Lock focus and zoom, save calibration files, and re-check occasionally.
:::

:::resources
- [OpenCV: camera calibration tutorial](https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html) — the chessboard workflow.
- [Zhang: A Flexible New Technique for Camera Calibration (2000)](https://www.microsoft.com/en-us/research/publication/a-flexible-new-technique-for-camera-calibration/) — the original paper.
- [OpenCV: detection of ChArUco boards](https://docs.opencv.org/4.x/df/d4a/tutorial_charuco_detection.html) — a more robust calibration target.
:::
