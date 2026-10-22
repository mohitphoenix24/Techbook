---
title: Pose from a Known Object — PnP and ArUco Markers
level: intermediate
time: 45
summary: Given a few 3-D points on an object and where they appear in the picture, find the object's position and orientation. Perspective-n-Point (solvePnP), its minimal cases and RANSAC version, drawing axes, and ArUco markers that give a full 6-D pose from one camera.
---

You have a calibrated camera. A part sits on a table. You know its CAD shape (the 3-D positions of some features on it), and you can find those features in the picture. **Where is the part, and how is it rotated?** That is the **Perspective-n-Point (PnP)** problem. It is how robots pick known objects, how AR apps stick graphics to a marker, and how a camera finds its own position relative to a known scene.

## The problem

**Given:** `n` 3-D points `Xᵢ` in the object's own frame, their 2-D pixel positions `uᵢ`, and the intrinsics `K` (and distortion).

**Find:** the pose `(R, t)` of the object in the camera frame, such that projecting each `Xᵢ` with `K[R|t]` gives `uᵢ`. The pose has **6 degrees of freedom** (3 rotation + 3 translation), and each point gives 2 equations, so you need at least **3 points** (P3P, which has up to 4 solutions) and in practice **4 or more** for a unique answer. More points average out noise.

```python run title="solvePnP on a chessboard" level=intermediate
import cv2
import numpy as np

K = np.array([[600., 0, 320], [0, 600., 240], [0, 0, 1]])
sq = 0.03
pattern = (6, 4)
obj = np.zeros((pattern[0] * pattern[1], 3), np.float32)
obj[:, :2] = np.mgrid[0:pattern[0], 0:pattern[1]].T.reshape(-1, 2) * sq          # the corners in the board frame (metres, Z = 0)

rvec_true = np.array([0.35, -0.25, 0.10]).reshape(3, 1)                           # the true pose we will try to recover
tvec_true = np.array([-0.06, -0.04, 0.55]).reshape(3, 1)
img_pts, _ = cv2.projectPoints(obj, rvec_true, tvec_true, K, None)
rng = np.random.default_rng(0)
img_pts = img_pts + rng.normal(0, 0.4, img_pts.shape)                              # detection noise of 0.4 pixels

ok, rvec, tvec = cv2.solvePnP(obj, img_pts, K, None, flags=cv2.SOLVEPNP_ITERATIVE)
print("solved:", ok)
print("rotation  true:", np.round(rvec_true.ravel(), 3), " estimated:", np.round(rvec.ravel(), 3))
print("position  true:", np.round(tvec_true.ravel(), 4), " estimated:", np.round(tvec.ravel(), 4), "metres")
print("position error:", round(float(np.linalg.norm(tvec - tvec_true)) * 1000, 2), "mm")
```

`rvec` is a rotation vector and `tvec` is the position of the **object origin in the camera frame**. To get the **camera pose in the object frame** (what a mobile robot wants): `R_cam = Rᵀ`, `t_cam = −Rᵀ t`.

## Solver choices

| Flag | Use |
|---|---|
| `SOLVEPNP_ITERATIVE` | Default: DLT start, then Levenberg-Marquardt refinement. General |
| `SOLVEPNP_EPNP` | Fast, good for many points (n ≥ 4) |
| `SOLVEPNP_P3P`, `SOLVEPNP_AP3P` | Exactly 4 points (used inside RANSAC) |
| `SOLVEPNP_IPPE` | **Planar** objects (all points in a plane). Accurate and fast |
| `SOLVEPNP_IPPE_SQUARE` | A square marker (4 corners). Returns the best of two ambiguous solutions |
| `solvePnPRansac` | Robust to wrong 2-D to 3-D matches (outliers) |

**Planar ambiguity**: a flat object seen from far away can have two very different poses that look almost the same (like a "flip" of a tilted square). Noise can switch the answer between frames and make the pose jitter. `SOLVEPNP_IPPE` returns both candidates, and you can choose with the reprojection error or with temporal continuity.

## When some matches are wrong: solvePnPRansac

If the 2-D to 3-D matches come from feature matching, some are wrong. `cv2.solvePnPRansac` repeatedly solves PnP from small random subsets (4 points), counts the inliers, and keeps the best.

```python run title="solvePnPRansac with wrong correspondences" level=intermediate
import cv2
import numpy as np

K = np.array([[600., 0, 320], [0, 600., 240], [0, 0, 1]])
rng = np.random.default_rng(1)
obj = rng.uniform([-0.15, -0.1, -0.05], [0.15, 0.1, 0.05], (60, 3)).astype(np.float32)           # 60 points of a 3-D object
rvec_true, tvec_true = np.array([0.2, 0.4, -0.1]).reshape(3, 1), np.array([0.02, -0.03, 0.7]).reshape(3, 1)
img, _ = cv2.projectPoints(obj, rvec_true, tvec_true, K, None)
img = img.reshape(-1, 2) + rng.normal(0, 0.5, (60, 2))
bad = rng.choice(60, 18, replace=False)                                                           # make 30% of the matches totally wrong
img[bad] = rng.uniform([0, 0], [640, 480], (18, 2))

_, r1, t1 = cv2.solvePnP(obj, img.astype(np.float32), K, None)
ok, r2, t2, inliers = cv2.solvePnPRansac(obj, img.astype(np.float32), K, None, reprojectionError=3.0, iterationsCount=200, flags=cv2.SOLVEPNP_EPNP)
print("plain solvePnP position error:", round(float(np.linalg.norm(t1 - tvec_true)) * 1000, 1), "mm")
print("solvePnPRansac position error:", round(float(np.linalg.norm(t2 - tvec_true)) * 1000, 1), "mm   inliers:", len(inliers), "of 60 (true inliers: 42)")
```

Plain PnP is badly wrong with outliers; RANSAC recovers the truth. After RANSAC, refine the pose with all inliers (`cv2.solvePnPRefineLM`).

## Draw the pose: axes

A good habit: **draw the 3-D axes** at the object origin to check the pose by eye. Red = X, green = Y, blue = Z (the usual convention).

```python run title="Draw the coordinate axes of the estimated pose" level=easy
import cv2
import numpy as np
import cvlab

K = np.array([[520., 0, 320], [0, 520., 240], [0, 0, 1]])
rvec = np.array([0.5, -0.35, 0.15]).reshape(3, 1)
tvec = np.array([-0.08, -0.05, 0.5]).reshape(3, 1)

img = np.full((480, 640, 3), 235, np.uint8)
axes = np.float32([[0, 0, 0], [0.06, 0, 0], [0, 0.06, 0], [0, 0, 0.06]])         # origin and the ends of the X, Y, Z axes (6 cm)
pts, _ = cv2.projectPoints(axes, rvec, tvec, K, None)
o, x, y, z = [tuple(int(v) for v in p) for p in pts.reshape(-1, 2)]
cv2.arrowedLine(img, o, x, (255, 0, 0), 3); cv2.arrowedLine(img, o, y, (0, 160, 0), 3); cv2.arrowedLine(img, o, z, (0, 0, 255), 3)
print("axis tips in pixels:", x, y, z, "  origin:", o)
cvlab.show(img, "Red = X, green = Y, blue = Z (pointing away from the board)")
```

OpenCV also has `cv2.drawFrameAxes(img, K, dist, rvec, tvec, length)` which does the same.

## ArUco and AprilTag markers: a pose from one picture

Finding point correspondences on a real object is hard. **Fiducial markers** make it trivial. An **ArUco marker** is a square with a thick black border and a binary pattern inside that encodes an ID. The detector finds the four **corners** very accurately and reads the ID. Since the marker is a square of **known size**, the four corners give a full PnP problem, and you get the marker's **6-D pose** from a single camera. **AprilTag** is a similar, popular system (very common in robotics).

Uses: robot localisation, AR, calibrating a camera or hand-eye (later lessons), tracking tools, and marking workpieces.

```python run title="Detect an ArUco marker and estimate its pose" level=intermediate
import cv2
import numpy as np
import cvlab

# 1. make a marker image (ID 7) and place it in a scene with a known pose
dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
marker = cv2.aruco.generateImageMarker(dictionary, 7, 200)
marker = cv2.copyMakeBorder(marker, 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)          # white quiet zone around the marker
side = 0.05                                                                                  # the black square is 5 cm wide
K = np.array([[700., 0, 320], [0, 700., 240], [0, 0, 1]])
rvec_true = np.array([0.45, -0.3, 0.2]).reshape(3, 1)
tvec_true = np.array([-0.03, -0.02, 0.45]).reshape(3, 1)

R, _ = cv2.Rodrigues(rvec_true)
s = side / 200                                                                                # metres per marker pixel
A = np.array([[s, 0, -(30 + 100) * s], [0, s, -(30 + 100) * s], [0, 0, 1]])                    # marker image pixels -> metres, origin at the marker centre
Hm = K @ np.column_stack([R[:, 0], R[:, 1], tvec_true.ravel()]) @ A
scene = cv2.warpPerspective(marker, Hm, (640, 480), borderValue=170)

# 2. detect it
detector = cv2.aruco.ArucoDetector(dictionary, cv2.aruco.DetectorParameters())
corners, ids, rejected = detector.detectMarkers(scene)
print("detected ids:", ids.ravel().tolist())

# 3. pose with PnP on the four corners (marker frame: centre at the origin, Z = 0)
h = side / 2
obj = np.array([[-h, h, 0], [h, h, 0], [h, -h, 0], [-h, -h, 0]], np.float32)                  # same order as the detected corners: TL, TR, BR, BL
ok, rvec, tvec = cv2.solvePnP(obj, corners[0].reshape(4, 2), K, None, flags=cv2.SOLVEPNP_IPPE_SQUARE)
print("true position (m)     :", np.round(tvec_true.ravel(), 4))
print("estimated position (m):", np.round(tvec.ravel(), 4), "  error:", round(float(np.linalg.norm(tvec - tvec_true)) * 1000, 2), "mm")

vis = cv2.cvtColor(scene, cv2.COLOR_GRAY2RGB)
cv2.aruco.drawDetectedMarkers(vis, corners, ids)
cv2.drawFrameAxes(vis, K, None, rvec, tvec, side * 0.8)
cvlab.show(vis, "Detected marker with its 3-D axes")
```

A few millimetres of accuracy from a single, cheap, printed marker (at 45 cm here) is why fiducials are so popular. A bigger marker or a closer camera gives better accuracy. Tips: print the marker on a **rigid, flat** surface; measure the **real size**; use a **matte** finish (glare breaks detection); keep it large enough in the picture (at least about 30–40 pixels wide); and use **several markers** (a "board") for more accuracy and robustness.

## Pose from many views

Everything here used one picture. If the camera moves and you know the 3-D points (a map), PnP gives the camera pose in every frame. That is **localisation** in visual SLAM. If you do not know the 3-D points, you must **estimate them too** (structure from motion, later lessons).

:::interview Questions you may get
- "What is the PnP problem and how many points do you need?" Estimate the 6-DOF pose of an object from n 3-D to 2-D correspondences and known K. Minimum 3 (P3P, up to 4 solutions); 4+ for a unique solution.
- "What if some correspondences are wrong?" `solvePnPRansac` (or a robust refinement afterwards).
- "What is the ambiguity for planar objects?" Two similar-looking poses (a flip); use `IPPE` and pick by reprojection error or temporal consistency.
- "How would you get the camera pose from an ArUco marker?" Detect the four corners, solvePnP with the known marker size (IPPE_SQUARE).
- "How do you convert object-in-camera to camera-in-object?" Invert the transform: `Rᵀ, −Rᵀt`.
:::

```quiz
? What does solvePnP return as tvec?
+ The position of the object's origin in the camera frame
- The camera position in the object frame
- The pixel position of the object
> To get the camera in the object frame use −Rᵀt.

? A flat marker far from the camera gives a pose that flips between two answers. What is this called?
- Distortion
+ The planar pose ambiguity
- Aliasing
> IPPE returns both candidates; choose with reprojection error or tracking.

? Why use solvePnPRansac?
- It is faster in all cases
+ It is robust to wrong 2-D to 3-D correspondences
- It needs no calibration
> Plain solvePnP is dragged away by outliers.

? What does a detected ArUco marker give you beyond its ID?
+ Four precise corner points, which with the known marker size give the full 6-D pose
- The depth map
- The camera focal length
> It is a PnP problem with four known coplanar points.
```

:::problem A robot must find the pose of a known metal bracket on a conveyor, using one camera. Compare two approaches: (a) ArUco marker stuck on it, (b) features of the bracket itself. {level=medium tags="pnp,aruco,robotics"}
Think about accuracy, effort and robustness.

:::solution Model answer
(a) A marker gives a very reliable, accurate 6-D pose with trivial code, works with a mono camera, and gives an ID, but it needs to be attached (cost, handling, can be hidden or dirty, may not be allowed on the product) and its accuracy depends on size and distance. (b) Natural features need the 3-D model and a way to find 2-D to 3-D matches: keypoints on textured parts, edges and contours, or a learned 6-D pose estimator; it needs no change to the part but is harder, may fail on shiny, textureless metal, and needs validation. Use PnP with RANSAC, then refine. For a bin-picking setting people often use a depth camera with point-cloud registration (ICP) or a learned pose network instead. Choose by the required accuracy, the cycle time and whether parts can be marked.
:::
:::

:::keypoints
- PnP finds the 6-DOF pose of a known object from 2-D to 3-D point matches: `cv2.solvePnP` (needs ≥ 4 points for a unique answer).
- `solvePnPRansac` handles outliers; `IPPE` is for planar targets, which have a flip ambiguity.
- `tvec` is the object origin in the camera frame; invert to get the camera pose.
- ArUco/AprilTag markers give corners and IDs, hence a precise 6-D pose from one camera.
:::

:::resources
- [OpenCV: perspective-n-point and solvePnP flags](https://docs.opencv.org/4.x/d5/d1f/calib3d_solvePnP.html) — each method explained.
- [OpenCV: ArUco marker detection](https://docs.opencv.org/4.x/d5/dae/tutorial_aruco_detection.html) — detection and pose.
- [AprilTag (University of Michigan APRIL lab)](https://april.eecs.umich.edu/software/apriltag) — a widely used fiducial system in robotics.
:::
