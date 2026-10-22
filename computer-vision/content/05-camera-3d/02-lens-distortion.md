---
title: Lens Distortion and Undistortion
level: intermediate
time: 35
summary: Why straight lines bend near the edges of a wide-angle photo. Radial and tangential distortion, the OpenCV coefficients (k1, k2, p1, p2, k3), how to remove distortion with remap, the fisheye model, and why you must undistort before measuring.
---

The pinhole model has no lens. A real lens bends light, and so **straight lines in the world can become curved lines in the picture**. This is **lens distortion**. For measuring, SLAM, stitching and robot guidance you must correct it. The correction is a small formula with a few numbers that you find once, during calibration.

## Two kinds of distortion

**Radial distortion** is the common one. The effect depends on the **distance from the image centre**.

- **Barrel**: straight lines bulge outwards, like a barrel. Typical for wide-angle lenses and phones. `k1 < 0`.
- **Pincushion**: lines bend inwards, towards the centre. Typical for telephoto lenses. `k1 > 0`.

**Tangential distortion** is smaller. It appears when the lens is not perfectly parallel to the sensor, so the picture is slightly skewed. It is modelled by `p1, p2`.

## The model

Take a point in **normalised camera coordinates** `(x, y) = (X/Z, Y/Z)`. Let `r² = x² + y²`. The distorted point is:

:::formula OpenCV's distortion model
\begin{aligned} x_d &= x\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2 p_1 x y + p_2 (r^2 + 2x^2) \\ y_d &= y\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1 (r^2 + 2y^2) + 2 p_2 x y \end{aligned}
:::

After this, the pixel is `u = fx·x_d + cx`, `v = fy·y_d + cy`. The five numbers `(k1, k2, p1, p2, k3)` are the **distortion coefficients**, stored in a vector `dist`. Notice the factor `(1 + k1 r² + ...)`: at the centre `r = 0`, so there is no change; the farther from the centre, the stronger the effect.

## See it

We project a regular grid of 3-D points on a wall with and without distortion. Barrel distortion pulls the outer points towards the centre.

```python run title="A grid with and without barrel distortion" level=easy
import cv2
import numpy as np
import cvlab

K = np.array([[500., 0, 320], [0, 500., 240], [0, 0, 1]])
dist = np.array([-0.30, 0.10, 0.0, 0.0, 0.0])                      # k1 = -0.3: barrel distortion

xs, ys = np.meshgrid(np.linspace(-0.55, 0.55, 12), np.linspace(-0.40, 0.40, 9))
wall = np.stack([xs, ys, np.ones_like(xs)], -1).reshape(-1, 3)         # a flat wall 1 m in front of the camera
ideal, _ = cv2.projectPoints(wall, np.zeros(3), np.zeros(3), K, None)
real, _ = cv2.projectPoints(wall, np.zeros(3), np.zeros(3), K, dist)

def draw(points):
    img = np.full((480, 640, 3), 255, np.uint8)
    p = points.reshape(9, 12, 2)
    for r in range(9):
        cv2.polylines(img, [p[r].astype(np.int32)], False, (0, 0, 0), 1, cv2.LINE_AA)
    for c in range(12):
        cv2.polylines(img, [p[:, c].astype(np.int32)], False, (0, 0, 0), 1, cv2.LINE_AA)
    return img

shift = np.linalg.norm((ideal - real).reshape(-1, 2), axis=1)
print("pixels moved by distortion: centre point", round(float(shift[54]), 2), "  corner point", round(float(shift[0]), 1))
cvlab.show(draw(ideal), "Ideal pinhole: straight lines", draw(real), "With barrel distortion k1 = -0.3")
```

## Undistort a picture

To correct a picture we need, for **each output pixel**, to know **where to read from** in the distorted picture. That is exactly what `cv2.remap` does. OpenCV prepares the two lookup maps with `cv2.initUndistortRectifyMap` and applies them. The one-line version is `cv2.undistort(img, K, dist)`.

Here we first **simulate** a distorted photo from a clean picture (we need the reverse mapping for that, which `cv2.undistortPoints` gives), then undistort it and check how well straight lines are restored.

```python run title="Simulate a distorted photo, then fix it" level=intermediate
import cv2
import numpy as np
import cvlab

K = np.array([[500., 0, 320], [0, 500., 240], [0, 0, 1]])
dist = np.array([-0.30, 0.10, 0.0, 0.0, 0.0])
W, H = 640, 480

ideal = np.full((H, W), 255, np.uint8)                              # a picture with straight lines: what an ideal camera sees
for x in range(0, W, 64):
    cv2.line(ideal, (x, 0), (x, H), 0, 2)
for y in range(0, H, 60):
    cv2.line(ideal, (0, y), (W, y), 0, 2)

# for every pixel of the DISTORTED picture, where is it in the ideal picture?
us, vs = np.meshgrid(np.arange(W), np.arange(H))
pix = np.stack([us, vs], -1).reshape(-1, 1, 2).astype(np.float32)
und = cv2.undistortPoints(pix, K, dist, P=K).reshape(H, W, 2)
distorted = cv2.remap(ideal, und[..., 0].astype(np.float32), und[..., 1].astype(np.float32), cv2.INTER_LINEAR, borderValue=255)

fixed = cv2.undistort(distorted, K, dist)                           # the correction (needs K and dist, from calibration)
inner = (slice(40, 440), slice(60, 580))
err_before = float(np.abs(distorted[inner].astype(int) - ideal[inner].astype(int)).mean())
err_after = float(np.abs(fixed[inner].astype(int) - ideal[inner].astype(int)).mean())
print("difference to the ideal picture   before:", round(err_before, 1), "  after undistort:", round(err_after, 1))
cvlab.show(distorted, "Distorted photo", fixed, "After cv2.undistort", np.abs(fixed.astype(int) - ideal.astype(int)).astype(np.uint8), "Remaining difference")
```

## Undistorting the picture versus the points

- Undistorting the **whole picture** costs time and creates empty (black) borders, because some pixels have no source. You can keep more of the picture with `cv2.getOptimalNewCameraMatrix(K, dist, size, alpha)`: `alpha=0` crops to valid pixels only, `alpha=1` keeps every pixel (with black borders).
- If you only need to measure a **few points** (feature locations, a detected corner), undistort **just those points** with `cv2.undistortPoints`. It is much cheaper than warping the whole image.
- For video, precompute the maps once with `initUndistortRectifyMap` and call `remap` for each frame.

```python run title="Undistort only a few points" level=easy
import cv2
import numpy as np

K = np.array([[500., 0, 320], [0, 500., 240], [0, 0, 1]])
dist = np.array([-0.30, 0.10, 0.0, 0.0, 0.0])

true_point = np.array([[[0.45, 0.30, 1.0]]])                       # a 3-D point (camera frame)
observed, _ = cv2.projectPoints(true_point, np.zeros(3), np.zeros(3), K, dist)         # where the real, distorted camera sees it
ideal, _ = cv2.projectPoints(true_point, np.zeros(3), np.zeros(3), K, None)             # where an ideal camera would see it
fixed = cv2.undistortPoints(observed, K, dist, P=K)                                     # P=K keeps the answer in pixels
print("observed (distorted):", np.round(observed.ravel(), 2))
print("after undistortPoints:", np.round(fixed.ravel(), 2), "  ideal:", np.round(ideal.ravel(), 2))
```

Without `P=K`, `undistortPoints` returns **normalised** coordinates `(X/Z, Y/Z)`. This is a very common source of confusion.

## Fisheye lenses

Very wide lenses (above about 120° field of view) cannot be described by the polynomial in `r²`. Use the **fisheye model** (`cv2.fisheye`), where the angle of the ray from the optical axis `θ` is distorted: `θ_d = θ (1 + k1 θ² + k2 θ⁴ + k3 θ⁶ + k4 θ⁸)`. It has four coefficients and its own functions (`cv2.fisheye.calibrate`, `cv2.fisheye.undistortImage`). Fisheye is common in robots, drones and car surround-view systems. Models also exist for omnidirectional cameras and for 360° spherical images.

## Why distortion matters for measurement

| Task | Effect of ignoring distortion |
|---|---|
| Measuring sizes or positions | Errors that grow toward the edges (several pixels at 500 px focal length with k1 = −0.3) |
| Stitching | Curved lines do not match between photos |
| SLAM / SfM | Poor accuracy and drift; the geometry assumed is wrong |
| Straight-line detection (lanes, edges) | Lines become curves; Hough fails near edges |
| Robot picking | Misses towards the edges of the field of view |

Distortion also depends on the **focus and zoom** of the lens. If your lens changes focus or zoom, calibrate again, or fix the focus with a lock screw.

:::interview Questions you may get
- "What is radial distortion and what are barrel and pincushion?" A distance-dependent radial scaling of image points: negative k1 pulls outer points inward (barrel), positive pushes outward (pincushion).
- "How do you correct it?" Calibrate to find K and the coefficients, then undistort with a remap (whole image) or `undistortPoints` (a few points).
- "What does `cv2.undistortPoints` return by default?" Normalised coordinates; pass `P=K` for pixel coordinates.
- "When do you need the fisheye model?" Very wide lenses (FOV above about 120°) where the polynomial model fails.
- "Can you calibrate with a zoom lens?" Yes, but only for the one zoom and focus setting; changing them changes the parameters.
:::

```quiz
? A wide-angle photo shows straight lines bulging outward. Which sign does k1 most likely have?
+ Negative (barrel distortion)
- Positive (pincushion)
- Zero
> Barrel distortion pulls points toward the centre, giving k1 < 0 in OpenCV's model.

? You pass observed pixels to cv2.undistortPoints without P. What do you get back?
- Undistorted pixels
+ Normalised coordinates (X/Z, Y/Z)
- Distorted pixels
> Pass P=K to get pixel coordinates.

? Why undistort only the feature points instead of the whole image in a real-time system?
+ It is much cheaper and avoids black borders
- It is more accurate
- OpenCV does not allow whole-image undistortion
> Whole-image remapping costs time for each frame.

? At the exact centre of the image, how large is radial distortion?
+ Zero
- Maximum
- Equal to k1
> The factor is 1 + k1 r² + ..., and r = 0 at the centre.
```

:::problem A robot camera with a wide lens measures part positions well in the middle of the picture but is off by several millimetres near the edges. What do you check, and how do you fix it? {level=medium tags="distortion,calibration,robotics"}
Think about the symptoms.

:::solution Model answer
Errors that grow with distance from the centre point at lens distortion that is not modelled or is badly calibrated. Check: is distortion being applied at all (undistort the points before converting pixels to millimetres)? Was calibration done with enough views, including target positions near the edges and corners? What is the reprojection error (should be below about 0.3 px)? Did the focus or aperture change after calibration? Fix: recalibrate with views covering the whole field of view and the working distance, use more distortion terms (k3, or the rational or fisheye model for very wide lenses), lock the lens, and validate with a separate board (measure a known distance across the field of view).
:::
:::

:::keypoints
- Real lenses bend lines: radial (barrel `k1<0`, pincushion `k1>0`) and tangential distortion.
- OpenCV models it with (k1, k2, p1, p2, k3) applied to normalised coordinates; fisheye has its own model.
- Fix with `cv2.undistort` / `initUndistortRectifyMap + remap`, or `undistortPoints` (use `P=K` for pixels).
- Always undistort (or include distortion in the model) before measuring or doing 3-D geometry.
:::

:::resources
- [OpenCV: camera calibration tutorial (distortion section)](https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html) — coefficients and undistortion in practice.
- [OpenCV: fisheye camera model](https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html) — the fisheye functions.
- [Kannala and Brandt: A generic camera model and calibration method for conventional, wide-angle and fisheye lenses](https://ieeexplore.ieee.org/document/1642666) — the basis of the fisheye model.
:::
