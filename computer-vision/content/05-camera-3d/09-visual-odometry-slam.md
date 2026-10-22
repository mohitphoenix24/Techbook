---
title: Visual Odometry and SLAM
level: advanced
time: 55
summary: How a robot tracks its own motion with a camera and builds a map at the same time. Visual odometry, drift, keyframes and local maps, loop closure, feature-based versus direct methods, a pose-graph optimiser you can run, and a tour of ORB-SLAM, DSO and visual-inertial systems.
---

A robot moving through a building has to know **where it is** and **what the place looks like**. GPS does not work indoors. With a camera we can do both at once. This is **SLAM**: **S**imultaneous **L**ocalisation **A**nd **M**apping. It is one of the most asked topics in robotics-vision interviews.

## Visual odometry (VO)

**Odometry** means tracking your motion step by step. **Visual odometry** estimates the camera's motion from **consecutive frames**:

:::flow One step of feature-based visual odometry
1. Detect and track | Find keypoints in frame t−1 and match or track them into frame t.
2. Estimate the motion | Use the essential matrix (2-D to 2-D, needs scale) or PnP against triangulated 3-D points (2-D to 3-D) with RANSAC.
3. Chain | Multiply the relative motion onto the previous pose: T_t = T_(t−1) · ΔT.
4. Maintain the points | Triangulate new points when parallax is enough; drop points that were lost.
:::

**Problem: drift.** Each step has a tiny error. The errors **add up**: after a few hundred metres the estimated path no longer matches the real one. VO has **no memory** of places, so it cannot correct itself.

## SLAM = VO + a map + loop closure

SLAM adds three ingredients:

1. **A map**: the 3-D points (or other landmarks) that were seen, remembered across time.
2. **Local mapping and bundle adjustment** over recent **keyframes** to keep the nearby trajectory and map accurate.
3. **Loop closure**: recognising that the robot has come **back to a place seen before** (using bag of words, or learned place recognition). Then we add a constraint "this pose equals that pose" and **optimise the whole trajectory**, which pulls the accumulated drift out.

:::analogy
Walk blindfolded around a square room, counting steps. You think you walked in a perfect square, but you end up two steps away from where you started. Now someone taps you and says "you are back at the start". You know your path was wrong, and you can spread the 2-step error over the whole walk to correct it. That is loop closure.
:::

## Drift and loop closure you can run

We simulate a robot driving a **square** path of 40 poses. Each odometry step has a small error (including a bias). The loop closure says "pose 39 is next to pose 0". A **pose graph** has the poses as nodes and the relative-motion measurements as edges; we find the poses that best satisfy **all** the edges using least squares.

```python run title="A pose graph with one loop closure" level=advanced shared
import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import least_squares

# a true square path: 10 steps forward, then turn left 90 degrees, four times (40 poses)
rng = np.random.default_rng(3)
true_steps = []
for side in range(4):
    for i in range(10):
        true_steps.append((1.0, 0.0, 0.0))                              # move 1 m forward in the robot frame
    true_steps[-1] = (1.0, 0.0, np.pi / 2)                              # then turn left by 90 degrees at the corner

def compose(p, d):                                                       # pose p = (x, y, theta); d = (dx, dy, dtheta) in the robot frame
    x, y, th = p
    return np.array([x + np.cos(th) * d[0] - np.sin(th) * d[1], y + np.sin(th) * d[0] + np.cos(th) * d[1], th + d[2]])

truth = [np.zeros(3)]
for d in true_steps:
    truth.append(compose(truth[-1], d))
truth = np.array(truth)

# noisy odometry: a little noise and a small systematic bias (a wheel that is slightly off)
meas = [(dx * 1.01 + rng.normal(0, 0.02), dy + rng.normal(0, 0.02), dth + 0.012 + rng.normal(0, 0.01)) for dx, dy, dth in true_steps]
odo = [np.zeros(3)]
for d in meas:
    odo.append(compose(odo[-1], d))
odo = np.array(odo)
print("distance between the last pose and the start (truth is 0 m for the closed loop):")
print("  odometry alone:", round(float(np.hypot(*odo[-1][:2])), 2), "m")
```

```python run title="Optimise the pose graph" level=advanced shared
def relative(a, b):                                                      # the motion that takes pose a to pose b, in a's frame
    c, s = np.cos(a[2]), np.sin(a[2])
    dx, dy = b[0] - a[0], b[1] - a[1]
    dth = (b[2] - a[2] + np.pi) % (2 * np.pi) - np.pi
    return np.array([c * dx + s * dy, -s * dx + c * dy, dth])

n = len(odo)
edges = [(i, i + 1, np.array(meas[i]), 1.0) for i in range(n - 1)]       # odometry edges, weight 1
edges.append((n - 1, 0, relative(truth[-1], truth[0]), 50.0))            # loop closure: "the last pose is where we started", trusted a lot

def residuals(flat):
    poses = flat.reshape(n, 3)
    res = [poses[0] - odo[0]]                                            # anchor the first pose (a gauge)
    for i, j, z, w in edges:
        r = relative(poses[i], poses[j]) - z
        r[2] = (r[2] + np.pi) % (2 * np.pi) - np.pi
        res.append(w * r)
    return np.concatenate(res)

sol = least_squares(residuals, odo.ravel())
opt = sol.x.reshape(n, 3)
rmse = lambda p: float(np.sqrt(np.mean(np.sum((p[:, :2] - truth[:, :2]) ** 2, axis=1))))
print("average position error  odometry:", round(rmse(odo), 2), "m   after pose-graph optimisation:", round(rmse(opt), 2), "m")

fig, ax = plt.subplots(figsize=(5, 5))
ax.plot(*truth[:, :2].T, "k-", label="truth"); ax.plot(*odo[:, :2].T, "r--", label="odometry (drifts)"); ax.plot(*opt[:, :2].T, "g-", label="after loop closure")
ax.set_aspect("equal"); ax.legend(); ax.set_title("Loop closure pulls the path back")
```

Odometry alone drifts away from the closing point. With one loop-closure edge, the optimiser spreads the error over all poses and the path snaps back close to the truth. Real systems do this with **g2o**, **GTSAM** or **Ceres**, on graphs with thousands of poses.

## Feature-based versus direct methods

| | Feature-based (indirect) | Direct |
|---|---|---|
| Uses | Keypoints and descriptors; minimises **reprojection error** (geometric) | Raw **pixel intensities**; minimises **photometric error** (brightness difference) |
| Example systems | **ORB-SLAM** 1/2/3, PTAM, VINS | **LSD-SLAM**, **DSO** (direct sparse), SVO (semi-direct) |
| Strengths | Robust to lighting change and large motion; easy loop closure with descriptors | Uses all image information, works in low-texture (edges only) areas, accurate and dense maps |
| Weaknesses | Needs texture; throws away most pixels | Sensitive to exposure changes and rolling shutter; needs good photometric calibration |

## Sensors that help

- **Stereo**: gives metric scale at once.
- **RGB-D** (depth cameras): scale and dense 3-D (KinectFusion, ElasticFusion, RTAB-Map).
- **IMU (visual-inertial)**: the gyroscope and accelerometer give metric scale and good short-term motion, and survive fast motion and blur. Systems: **VINS-Mono**, **OKVIS**, **ORB-SLAM3**, Apple ARKit and Google ARCore use visual-inertial odometry on every phone.
- **LiDAR**: very accurate geometry (LOAM, LIO-SAM); often combined with cameras.
- **Wheel encoders** on ground robots for extra constraints.

## The big names (and what they do)

- **ORB-SLAM3**: feature-based, monocular/stereo/RGB-D, with IMU, multi-map support, loop closure with DBoW2, relocalisation after tracking loss. The standard reference.
- **DSO / LSD-SLAM**: direct methods.
- **VINS-Mono/Fusion**: tightly coupled visual-inertial.
- **RTAB-Map**: appearance-based loop closure with RGB-D and LiDAR, very common in ROS.
- **DROID-SLAM** and other learned SLAM systems: a recurrent network updates camera poses and dense depth, with a dense bundle adjustment layer. Strong accuracy and robustness, but GPU-hungry.
- **Gaussian-splatting SLAM** (Splat-SLAM, MonoGS) and **NeRF-based SLAM**: build photorealistic maps while tracking.

## SLAM in practice: what goes wrong

- **Tracking loss** in fast motion, blur, textureless areas, or sudden lighting changes. Need **relocalisation**.
- **Dynamic objects** (people, cars) violate the static-world assumption. Mask them out (with a segmentation network) or use robust estimators.
- **Scale drift** in monocular SLAM.
- **Wrong loop closures** (perceptual aliasing: two corridors look the same). One false loop closure can destroy the map, so closures are **verified geometrically** and sometimes with robust back-ends.
- **Compute**: real-time on a small robot needs keyframes, efficient maps and careful threading.

:::interview Questions you may get
- "What is SLAM and why is it hard?" Estimating the robot pose and a map at the same time; each depends on the other, errors accumulate, and the environment may be dynamic or ambiguous.
- "What is the difference between VO and SLAM?" VO estimates motion incrementally and drifts; SLAM keeps a map and uses loop closure and global optimisation to reduce drift.
- "How does loop closure work?" Recognise a revisited place (bag of words or learned descriptors), verify geometrically, add a constraint, and optimise the pose graph.
- "Feature-based versus direct SLAM?" Reprojection error on keypoints (robust, sparse) versus photometric error on pixels (uses more information but sensitive to lighting).
- "Why do phones use IMU with the camera?" Metric scale, robustness to fast motion and short lack of features.
- "What is a pose graph?" Nodes = poses, edges = relative measurements; solve by non-linear least squares.
:::

```quiz
? What problem does loop closure solve?
- Slow feature detection
+ Accumulated drift, by recognising a revisited place and correcting the trajectory
- Lens distortion
> It adds a constraint between the current and a past pose, then the whole graph is optimised.

? Which sensor gives monocular visual odometry its metric scale most cheaply?
- A second monocular frame
+ An IMU (visual-inertial odometry)
- A bigger lens
> Accelerometers measure real-world distances.

? ORB-SLAM minimises which kind of error?
+ Reprojection error of feature points (geometric)
- Photometric error of all pixels
- Depth error only
> Direct methods like DSO minimise photometric error.

? A single wrong loop closure can...
+ Corrupt the whole map, so closures are verified before being accepted
- Be ignored by the optimiser
- Improve the scale
> That is why geometric verification (RANSAC) and robust back-ends are used.
```

:::problem A warehouse robot using visual SLAM gets lost every time the aisles look the same, and sometimes the map jumps. Diagnose and propose fixes. {level=hard tags="slam,loop-closure,robotics"}
Think about place recognition and sensors.

:::solution Model answer
Identical aisles cause **perceptual aliasing**: place recognition links different aisles as the same place, producing false loop closures (map jumps) or ambiguous relocalisation. Fixes: stricter geometric verification of closures (many RANSAC inliers, consistency with odometry), robust back-end (switchable constraints, dynamic covariance scaling, or a consistency check over sequences of closures), use multiple cues (add LiDAR or wheel odometry, fiducial markers or unique landmarks like AprilTags at aisle ends), a sequence-based place recognition rather than a single image, and a prior map with known landmarks. Add IMU to survive textureless stretches. Log false closures and tune the thresholds on recorded runs.
:::
:::

:::keypoints
- Visual odometry chains frame-to-frame motion and drifts. SLAM adds a map, keyframes, local bundle adjustment and loop closure to correct drift.
- A pose graph (poses as nodes, relative measurements as edges) is solved by non-linear least squares; one loop-closure edge removes much drift.
- Feature-based methods (ORB-SLAM) minimise reprojection error; direct methods (DSO) minimise photometric error.
- IMU, stereo, depth or LiDAR give metric scale and robustness. Failures: tracking loss, dynamics, scale drift, false loop closures.
:::

:::resources
- [ORB-SLAM3: An Accurate Open-Source Library for Visual, Visual-Inertial and Multi-Map SLAM](https://arxiv.org/abs/2007.11898) — the standard reference system.
- [Cadena et al.: Past, Present, and Future of SLAM](https://arxiv.org/abs/1606.05830) — a long survey.
- [DROID-SLAM: Deep Visual SLAM for Monocular, Stereo, and RGB-D Cameras](https://arxiv.org/abs/2108.10869) — a learned SLAM system.
- [Cyrill Stachniss: SLAM course on YouTube](https://www.youtube.com/@CyrillStachniss) — a very clear lecture series.
:::
