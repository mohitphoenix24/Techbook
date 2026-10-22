---
title: Hand-Eye Calibration and Robot Vision
level: advanced
time: 55
summary: How a robot uses a camera. Coordinate frames and transforms, eye-in-hand versus eye-to-hand, the AX = XB problem, cv2.calibrateHandEye with synthetic data, turning a pixel into a robot target on a table, and the error sources behind accuracy in a pick-and-place cell.
---

A robot arm and a camera each have their own coordinate frame. The camera says "the screw is at (0.04, −0.02, 0.45) in my frame". The arm needs "move to (0.62, 0.15, 0.03) in the robot base frame". **Hand-eye calibration** finds the fixed transform between the two, and is the most important calibration in any vision-guided robot cell. If you interview for a robotics-vision job, expect questions on it.

## Frames and transforms

A **rigid transform** `T` (4 × 4 matrix, rotation + translation) converts coordinates between frames. `T_A_B` means "the pose of frame B expressed in frame A": it maps a point in B into A (`p_A = T_A_B · p_B`). Chains multiply:

`T_base_target = T_base_gripper · T_gripper_camera · T_camera_target`

- **base**: the fixed robot base.
- **gripper (tool, TCP)**: at the arm's end. `T_base_gripper` comes from the robot controller (forward kinematics).
- **camera**: the camera optical frame.
- **target**: a calibration board (or any object we want).

## Two setups

:::flow Eye-in-hand and eye-to-hand
Eye-in-hand | The camera is mounted on the arm and moves with it. Unknown: T_gripper_camera (fixed). Good for inspecting from many views and for guiding the last centimetres.
Eye-to-hand | The camera is fixed in the cell and watches the arm. Unknown: T_base_camera (fixed). Good for a stable global view; a board is attached to the gripper for calibration.
:::

## The AX = XB equation

Move the robot between two poses `i` and `j`. For eye-in-hand with a fixed calibration board:

- The gripper motion `A = T_gripper_i⁻¹ · T_gripper_j` is known from the robot.
- The camera motion `B = T_camera_i_target · T_camera_j_target⁻¹` is measured by detecting the board in the two images.
- The unknown fixed transform `X = T_gripper_camera` satisfies

:::formula Hand-eye equation
A\,X = X\,B
:::

Each pair of robot poses gives one such equation. With **at least 3 poses with rotations about different axes**, we can solve for `X` (rotation and translation). Methods (all in OpenCV): **Tsai–Lenz**, **Park**, **Horaud**, **Andreff**, **Daniilidis**.

## Run it with synthetic data

We invent a robot cell where we know the truth: the true camera-to-gripper transform `X`, a board fixed in the base frame, and 15 robot poses. We generate noisy board detections and robot poses, and see how well each method recovers `X`.

```python run title="cv2.calibrateHandEye with noisy data" level=advanced
import cv2
import numpy as np

rng = np.random.default_rng(0)
def T(R, t):
    M = np.eye(4); M[:3, :3] = R; M[:3, 3] = np.ravel(t); return M
rod = lambda v: cv2.Rodrigues(np.asarray(v, float))[0]

X_true = T(rod([0.10, -0.20, 0.30]), [0.05, -0.02, 0.08])          # camera pose in the gripper frame (unknown to the algorithm)
T_base_target = T(rod([0.0, 0.0, 0.2]), [0.5, 0.1, 0.0])           # the board sits somewhere in front of the robot

R_g2b, t_g2b, R_t2c, t_t2c = [], [], [], []
for _ in range(15):
    # a robot pose that looks down at the board (gripper z points down), with some variety
    Tbg = T(rod(rng.uniform(-0.5, 0.5, 3) + np.array([np.pi, 0, 0])), [0.4 + rng.uniform(-0.1, 0.1), 0.1 + rng.uniform(-0.1, 0.1), 0.45 + rng.uniform(-0.05, 0.1)])
    Tct = np.linalg.inv(X_true) @ np.linalg.inv(Tbg) @ T_base_target                 # where the camera should see the board
    # noise: the board detection (0.5 mm, 0.2 degrees) and the robot kinematics (0.1 mm, 0.02 degrees)
    Tct = Tct @ T(rod(rng.normal(0, np.deg2rad(0.2), 3)), rng.normal(0, 0.0005, 3))
    Tbg = Tbg @ T(rod(rng.normal(0, np.deg2rad(0.02), 3)), rng.normal(0, 0.0001, 3))
    R_g2b.append(Tbg[:3, :3]); t_g2b.append(Tbg[:3, 3:])
    R_t2c.append(Tct[:3, :3]); t_t2c.append(Tct[:3, 3:])

print("method        rotation error (deg)   translation error (mm)")
for name in ("TSAI", "PARK", "HORAUD", "ANDREFF", "DANIILIDIS"):
    R, t = cv2.calibrateHandEye(R_g2b, t_g2b, R_t2c, t_t2c, method=getattr(cv2, "CALIB_HAND_EYE_" + name))
    ang = np.degrees(np.arccos(np.clip((np.trace(R.T @ X_true[:3, :3]) - 1) / 2, -1, 1)))
    print(f"{name:12s} {ang:14.3f} {np.linalg.norm(t.ravel() - X_true[:3, 3]) * 1000:20.2f}")
```

All methods find the camera pose in the gripper frame to a fraction of a degree and a couple of millimetres, even with noise. (With real data, errors are bigger because of imperfect robot kinematics and board detection.)

## What makes hand-eye calibration good

- **Many diverse poses** (15–30): rotations about **different axes** (not only about the vertical), and different distances. Poses that are too similar give an ill-conditioned problem.
- **A calibrated camera** first (intrinsics and distortion). Errors in `K` become errors in the hand-eye result.
- **An accurate board pose** per image: sharp, well lit, large enough in view; ChArUco or a circle grid are better than loose markers.
- **Accurate robot poses**: use the robot's calibrated kinematics, and let the robot **stop** (no motion blur, no time lag) before taking each image.
- **Check the result**: move the arm to new poses, and see if the board's pose in the base frame, computed through the chain, **stays the same**. The spread tells you the accuracy.
- **Re-calibrate** after any change: a bumped camera, a new lens, a replaced gripper.

## From a pixel to a robot target (the pick-and-place chain)

A common task: **find an object in the image and move the gripper onto it**, for objects lying on a **flat table at a known height**. Steps:

1. **Detect** the object pixel `(u, v)` (a detector or contour centroid). Undistort the point.
2. **Back-project** to a ray in the camera frame: `r = K⁻¹ [u, v, 1]ᵀ`.
3. **Transform the ray** into the base frame using the chain: camera pose in base `T_base_camera = T_base_gripper · X` (eye-in-hand).
4. **Intersect** the ray with the table plane `z = z_table` in the base frame.
5. **Command** the robot to that point (plus the object's orientation from a contour or pose estimate).

```python run title="Pixel to robot coordinates" level=advanced
import numpy as np

K = np.array([[900., 0, 640], [0, 900., 360], [0, 0, 1]])
# the camera pose in the robot base frame (from forward kinematics * hand-eye result): looking straight down from 0.5 m above the table
R_base_cam = np.array([[1, 0, 0], [0, -1, 0], [0, 0, -1]], float)       # camera z axis points down, x along base x, y opposite to base y
t_base_cam = np.array([0.40, 0.10, 0.50])
z_table = 0.0                                                             # the table surface is at z = 0 in the base frame

def pixel_to_base(u, v):
    ray_cam = np.linalg.inv(K) @ np.array([u, v, 1.0])                    # direction of the ray in the camera frame
    ray_base = R_base_cam @ ray_cam                                       # same direction in the base frame
    s = (z_table - t_base_cam[2]) / ray_base[2]                           # how far along the ray until it meets the table plane
    return t_base_cam + s * ray_base

for (u, v) in [(640, 360), (800, 360), (640, 200)]:
    p = pixel_to_base(u, v)
    print(f"pixel ({u:3d}, {v:3d}) -> robot base coordinates ({p[0]:.3f}, {p[1]:.3f}, {p[2]:.3f}) m")
print("an error of 1 pixel at this distance is about", round(0.5 / 900 * 1000, 2), "mm")
```

The last line gives the **resolution** of the cell: one pixel at 0.5 m with `f = 900` is about 0.56 mm on the table. That, not the algorithm, often sets the floor for accuracy.

## Where the accuracy goes

| Error source | Typical effect | What to do |
|---|---|---|
| Camera intrinsics / distortion | Position errors that grow toward the edges | Calibrate carefully; validate across the field of view |
| Hand-eye transform | A constant offset or tilt, larger with distance from the calibration poses | Many diverse poses; check across the workspace |
| Robot kinematics (absolute accuracy) | Industrial arms repeat to 0.02–0.1 mm but may be off by 0.5–2 mm in absolute position | Use a kinematic calibration, or calibrate in the working area; use the camera for the final correction (visual servoing) |
| Tool centre point (TCP) calibration | Offset between the commanded tool point and the real tool tip | Calibrate the TCP carefully, as often as tools change |
| Table height / plane assumption | Errors in X, Y when the real height differs (parallax) | Measure the height, or use depth data |
| Object pose estimate | Orientation errors | Better features, depth, or a template/CAD fit |
| Timing / synchronisation | Errors in moving scenes | Trigger the camera at a known robot state; time-stamp |

**Repeatability versus accuracy**: a robot returns to the same point very consistently (repeatability, 0.02 mm) but may be a millimetre away from the point you think you commanded (accuracy). Vision-guided picking improves the **effective accuracy**, because the camera sees the **actual** relative position between the gripper and the object, and the robot can correct it (**visual servoing**: close the loop on the image). A calibration with 1 mm of error is fine if you servo the last 5 cm with the eye-in-hand camera.

:::interview Questions you may get
- "What is hand-eye calibration and what equation does it solve?" Finding the fixed transform between the camera and the robot gripper (eye-in-hand) or base (eye-to-hand): `A X = X B` from several robot poses and board detections.
- "Eye-in-hand versus eye-to-hand?" Camera on the arm (moving view, unknown camera-to-gripper) versus camera fixed (unknown camera-to-base).
- "How many poses and what kind?" At least 3, but 15–30 with rotations about different axes, and varied distances.
- "How do you turn a pixel into a robot coordinate?" Undistort, back-project to a ray, transform to the base frame, intersect with the known plane (or use depth).
- "What limits accuracy in vision-guided picking?" Calibration (intrinsics, hand-eye), the robot's absolute accuracy, TCP, plane assumptions, pixel resolution; visual servoing reduces dependence on the calibration.
- "How do you validate a calibration?" Move to new poses, check the target's pose in the base frame stays constant; do a touch test with a pointer.
:::

```quiz
? In AX = XB, what is X for an eye-in-hand setup?
+ The fixed transform between the camera and the gripper
- The robot's forward kinematics
- The camera intrinsics
> A and B are the gripper and camera motions between two poses.

? Why must calibration poses include rotations about different axes?
+ Rotations about a single axis leave the problem ill-conditioned (part of X cannot be determined)
- To avoid motion blur
- To keep the board in focus
> Diverse motions give independent constraints on X.

? A camera looks down at a table 0.6 m away with f = 1200 px. How big is one pixel on the table?
+ About 0.5 mm
- About 5 mm
- About 0.05 mm
> 0.6 m / 1200 = 0.5 mm.

? Why does visual servoing help when the calibration has a small error?
+ It uses the image to measure the actual remaining offset between gripper and object, so errors in the calibration matter less
- It removes lens distortion
- It makes the robot faster
> It closes the loop on what the camera sees.
```

:::problem A pick-and-place cell is accurate near the centre of the workspace but misses by 3–4 mm near the edges and when the table height changes. List the likely causes and fixes. {level=hard tags="hand-eye,robotics,accuracy"}
Think about distortion, calibration poses and geometry.

:::solution Model answer
Errors that grow toward the edges suggest lens distortion or intrinsics that were calibrated with views only in the centre; recalibrate the camera with board views across the whole field of view and check reprojection error. If the error depends on the table height, the pixel-to-plane intersection uses the wrong plane (parallax): measure and use the true height, or use depth data, or calibrate the plane with the robot touching the table at several points. The hand-eye calibration might have used poses near the centre only: redo it with poses spread over the workspace and verify at new poses. Also check the TCP, tool changes and the robot's absolute accuracy at the edges (kinematic calibration). Finally, add visual servoing or a second look from close to correct the last few millimetres.
:::
:::

:::keypoints
- Frames chain by multiplying 4×4 transforms: `T_base_target = T_base_gripper · T_gripper_camera · T_camera_target`.
- Hand-eye calibration solves `A X = X B` from several robot poses and board detections; `cv2.calibrateHandEye` offers Tsai, Park, Horaud, Andreff and Daniilidis.
- Use many diverse poses (different rotation axes), a calibrated camera, and validate at new poses.
- Pixel to robot: undistort, back-project, transform to the base, intersect with the table plane. Pixel size sets a floor on accuracy.
- Accuracy is limited by intrinsics, hand-eye, robot absolute accuracy, TCP and plane assumptions; visual servoing reduces the dependence on calibration.
:::

:::resources
- [OpenCV: calibrateHandEye](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html) — the function and the five methods.
- [Tsai and Lenz: A New Technique for Fully Autonomous and Efficient 3D Robotics Hand/Eye Calibration](https://ieeexplore.ieee.org/document/34770) — the classic method.
- [MoveIt hand-eye calibration tutorial](https://moveit.picknik.ai/main/doc/examples/hand_eye_calibration/hand_eye_calibration_tutorial.html) — a ROS 2 workflow for real robots.
:::
