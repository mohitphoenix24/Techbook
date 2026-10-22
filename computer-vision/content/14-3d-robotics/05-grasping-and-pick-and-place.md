---
title: Perception for Grasping and Pick-and-Place
level: advanced
time: 55
summary: From pixels to a robot grasp. The pick-and-place perception pipeline, 6-D object pose (instance-level and novel objects: PoseCNN, FoundationPose, MegaPose), grasp detection (analytic antipodal scoring with a runnable demo, GG-CNN, Contact-GraspNet, AnyGrasp), the pixel-to-robot error budget with a runnable demo, bin picking, and what actually breaks in the factory.
---

This lesson ties together calibration (module 5), segmentation (module 10), pose and depth (modules 13 and 5), and foundation models (module 11) into the most common industrial vision task: **see an object and pick it up**.

## The pick-and-place perception pipeline

:::flow Vision for a pick
Image + depth | An RGB-D camera (stereo, structured light or ToF) or RGB plus a depth model; capture while the robot is out of the way.
Find the object | Detection or segmentation: YOLO-seg, Mask R-CNN, or SAM prompted by a box or text (Grounded SAM) for new objects.
Estimate pose or grasp | Either a **6-D object pose** (use a CAD model and a stored grasp) or a **grasp directly** from the depth/point cloud (model-free).
Transform to the robot | Pixel + depth to the camera frame to the robot base frame using intrinsics and the **hand-eye** transform (module 5).
Plan and check | Inverse kinematics, collision check against the point cloud, choose an approach direction; verify the grasp after lifting (weight, camera, force).
Place | Often needs a second pose estimate for the destination (a fixture, a box, an assembly pose).
:::

## 6-D object pose

The pose is a rigid transform `(R, t)`: where the object is (3 numbers) and how it is oriented (3 numbers). It lets the robot reuse a **grasp taught once in the object's own frame**.

| Approach | How | Notes |
|---|---|---|
| **Keypoints + PnP** | Predict 2-D image positions of known 3-D model points (corners, markers); solve `cv2.solvePnPRansac` (module 5) | Needs RGB only; sensitive to occlusion and symmetric objects |
| **PoseCNN, PVNet, DenseFusion, GDR-Net** | Learn to regress rotation/translation, or dense correspondences, per object; trained on synthetic + real | Strong on instance-level benchmarks (YCB-Video, LM-O, T-LESS); need training per object |
| **Template and render-and-compare** (CosyPose, **MegaPose**, **GigaPose**) | Render the CAD model at hypothesised poses and compare with the image; iterate | Works for new objects with a CAD model |
| **Point-cloud registration / ICP** | Align the model's point cloud to the observed cloud (module 5) | Excellent refinement from a decent initial pose; fails with bad initialisation or symmetries |
| **FoundationPose** (2023), **Any6D, GenFlow** | Foundation models: given a CAD model or a few reference images, estimate and **track** the 6-D pose of **novel objects** with no fine-tuning, using large-scale synthetic training | The current default for flexible cells; needs a GPU |
| **BundleSDF, NeRF-based** | Model-free tracking by reconstructing the object online | Research-grade |

Practicalities: **symmetric objects** (a cylinder, a screw) have infinitely many equally correct poses; evaluate with symmetry-aware metrics (**ADD-S**), and use a loss that treats them as equivalent. Use **pose refinement** (ICP or render-and-compare) before grasping. **Metrics**: ADD / ADD-S (average distance of model points between predicted and true pose, as a fraction of the object diameter, threshold 10%), the BOP challenge's AR (average recall of VSD, MSSD and MSPD).

## Grasp detection without a model

For unknown or cluttered objects (bins of mixed items), predict **where to place the gripper** directly from depth.

- **Analytic grasp quality**: a two-finger grasp is **stable** (force-closure) if each contact's push direction lies inside its **friction cone**: the angle between the finger force and the surface normal is below `arctan(μ)`. Two contacts with opposing normals along the closing line are **antipodal**. Quality also prefers grasps near the **centre of mass**, within the gripper's opening range, and with clear fingers (no collision).
- **Dex-Net** (2017): trains a network on millions of synthetic depth images labelled by analytic quality metrics and simulated physics, to score grasp candidates.
- **GG-CNN**: a small fully convolutional net outputs, for each pixel of a depth image, a grasp quality, angle and width: fast closed-loop grasping.
- **6-DoF grasps**: **Contact-GraspNet**, **GraspNet-1Billion / AnyGrasp**, **GraspGen**, **Graspness** predict full 6-DoF gripper poses from point clouds in clutter, with large synthetic data sets and sim-to-real training.
- **Suction** grasping (a vacuum cup) needs a **flat, sealable patch**: predict suction quality from the depth map and normals.
- **Language-conditioned grasping** (Grounded SAM + a grasp network, or VLMs that point): "pick the red screwdriver".

The demo scores antipodal grasps on three flat shapes with exactly the analytic idea: contour points, surface normals from the mask gradient, a friction-cone test, the gripper opening limit, and a preference for the centre of mass.

```python run title="Analytic antipodal grasp scoring from a mask" level=advanced
import numpy as np
import cv2
import cvlab

# three flat objects seen from above (binary masks)
canvas = np.zeros((200, 480), np.uint8)
cv2.ellipse(canvas, (80, 100), (60, 32), 25, 0, 360, 255, -1)
cv2.rectangle(canvas, (190, 60), (290, 140), 255, -1)
cv2.fillConvexPoly(canvas, np.array([[350, 150], [430, 150], [390, 50]]), 255)
mu_friction, max_open = 0.5, 90                                       # friction coefficient and the widest the gripper opens, in pixels
cone = np.degrees(np.arctan(mu_friction))                             # half-angle of the friction cone: 26.6 degrees

blur = cv2.GaussianBlur(canvas.astype(np.float32) / 255, (0, 0), 2.0)
gx, gy = cv2.Sobel(blur, cv2.CV_32F, 1, 0), cv2.Sobel(blur, cv2.CV_32F, 0, 1)

def best_grasp(mask):
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    pts = cnts[0][:, 0, :][::3]                                         # contour points, every third one
    ys_, xs_ = np.nonzero(mask); centroid = np.array([xs_.mean(), ys_.mean()])    # centre of mass: grasp near it so the object does not rotate in the gripper
    n = np.stack([-gx[pts[:, 1], pts[:, 0]], -gy[pts[:, 1], pts[:, 0]]], 1)   # outward normal (the gradient points inwards)
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    best = (None, 1e9)
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            d = pts[j] - pts[i]; w = np.linalg.norm(d)
            if w < 10 or w > max_open: continue
            u = d / w
            a_i = np.degrees(np.arccos(np.clip(np.dot(-n[i], u), -1, 1)))      # at contact i the finger pushes along +u: it must lie inside the friction cone around the inward normal
            a_j = np.degrees(np.arccos(np.clip(np.dot(-n[j], -u), -1, 1)))
            angle = max(a_i, a_j)                                              # the worse of the two contacts
            score = angle + 0.3 * np.linalg.norm((pts[i] + pts[j]) / 2 - centroid)      # prefer grasps through the centre of mass
            if score < best[1]: best = ((pts[i], pts[j], w, angle), score)
    return best

n_obj, labels = cv2.connectedComponents(canvas)
vis = cv2.cvtColor(canvas, cv2.COLOR_GRAY2RGB)
print(f"friction cone half-angle for mu={mu_friction}: {cone:.1f} degrees; gripper opening limit {max_open} px")
order = sorted(range(1, n_obj), key=lambda k: np.nonzero(labels == k)[1].mean())          # left to right: ellipse, rectangle, triangle
names = {k: nm for k, nm in zip(order, ["ellipse", "rectangle", "triangle"])}
for k in order:
    g, score = best_grasp((labels == k).astype(np.uint8) * 255)
    if g is None:
        print(f"{names[k]}: no antipodal grasp fits in the gripper"); continue
    p1, p2, w, angle = g
    print(f"{names[k]:<9}: best grasp width {w:5.1f} px, worst contact angle {angle:4.1f} deg -> {'stable (inside the friction cone)' if angle < cone else 'slips (outside the cone)'}")
    cv2.line(vis, tuple(int(v) for v in p1), tuple(int(v) for v in p2), (255, 60, 60), 2); cv2.circle(vis, tuple(int(v) for v in p1), 4, (60, 255, 60), -1); cv2.circle(vis, tuple(int(v) for v in p2), 4, (60, 255, 60), -1)
cvlab.show(vis, "Antipodal grasps: contact points (green) joined by the closing line (red)")
print("deep grasp networks (GG-CNN, Contact-GraspNet, AnyGrasp) learn to predict the same quality score directly from depth, for cluttered scenes")
```

## The error budget from pixel to robot (runnable)

A pick fails when the **sum of all small errors** exceeds the gripper's tolerance. The next demo back-projects a detected pixel plus depth through the camera model and the hand-eye transform, then perturbs each ingredient to see its effect in millimetres.

```python run title="Pixel to robot base: what each calibration error costs" level=advanced
import numpy as np
import cv2

rng = np.random.default_rng(0)
K = np.array([[900.0, 0, 640], [0, 900.0, 360], [0, 0, 1]])                    # intrinsics: 900 px focal length, 1280x720 image
def rot(axis, deg):
    return cv2.Rodrigues(np.array(axis, float) * np.deg2rad(deg))[0]
R_bc = rot([1, 0, 0], 180) @ rot([0, 0, 1], 10)                                # camera looks straight down at the table (eye-to-hand setup)
t_bc = np.array([0.45, 0.10, 0.70])                                            # camera position in the robot base frame, metres
T_bc = np.eye(4); T_bc[:3, :3] = R_bc; T_bc[:3, 3] = t_bc

def pixel_to_base(u, v, Z, T=T_bc, K=K):
    x_cam = Z * np.linalg.inv(K) @ np.array([u, v, 1.0])                       # back-project: a pixel and its depth give a 3-D point in the camera frame
    return (T @ np.append(x_cam, 1))[:3]                                       # move it to the robot base frame with the hand-eye transform

u, v, Z = 800, 300, 0.70                                                       # the detected part: pixel (800, 300), 0.70 m from the camera
p = pixel_to_base(u, v, Z)
print("part position in the robot base frame (m):", np.round(p, 4), "(the table is at z = 0)")

def mc(label, perturb, n=2000):
    errs = []
    for _ in range(n):
        errs.append(np.linalg.norm(perturb() - p) * 1000)
    errs = np.array(errs); print(f"{label:<44} mean error {errs.mean():6.2f} mm   95th percentile {np.percentile(errs, 95):6.2f} mm")

mc("pixel noise 1 px (detector accuracy)", lambda: pixel_to_base(u + rng.normal(0, 1), v + rng.normal(0, 1), Z))
mc("depth noise 5 mm (sensor)", lambda: pixel_to_base(u, v, Z + rng.normal(0, 0.005)))
mc("focal length 1% wrong (calibration)", lambda: pixel_to_base(u, v, Z, K=np.diag([1.01, 1.01, 1]) @ K))
def bad_extrinsics(rot_deg, trans_mm):
    def f():
        axis = rng.normal(size=3); axis /= np.linalg.norm(axis)                  # a random rotation axis
        T = T_bc.copy(); T[:3, :3] = rot(axis, rng.normal(0, rot_deg)) @ R_bc; T[:3, 3] += rng.normal(0, trans_mm / 1000, 3)
        return pixel_to_base(u, v, Z, T=T)
    return f
mc("hand-eye rotation error 0.3 deg", bad_extrinsics(0.3, 0))
mc("hand-eye translation error 2 mm", bad_extrinsics(0, 2))
mc("hand-eye 0.3 deg + 2 mm together", bad_extrinsics(0.3, 2))
print("a rotation error acts through the 0.7 m lever arm: 0.3 deg x 700 mm = %.1f mm; a gripper with 5 mm tolerance needs all these terms small together" % (np.deg2rad(0.3) * 700))
```

Lessons from the numbers: **depth noise** and **calibration errors** usually dominate pixel noise; rotation errors grow with the distance (**lever arm**); calibrate carefully (module 5), average over several frames, use **visual servoing or a wrist camera** for the last centimetres, and prefer **compliant grippers** or **eye-in-hand** correction when tolerances are tighter than your error budget.

## Bin picking: the full problem

Randomly piled parts, 10–50 picks per minute: the classic hard case.

1. **3-D scan** (structured light or stereo) with the robot out of view; multi-exposure or polarisation for shiny metal.
2. **Segment instances** in the point cloud/depth + RGB; or match the CAD model to find candidate poses.
3. **Rank candidates** by reachability, collision-free approach, grasp quality and occlusion (pick the top-most part).
4. **Collision checking** against the bin walls and neighbouring parts (voxel or signed-distance model of the scan).
5. **Execute, then verify** (gripper width/force check, weight, re-scan the bin) and learn from failures.
6. **Re-scan strategy** when no good candidate remains (shake, re-pile, re-grasp).

## What really goes wrong

- **Reflective, transparent or dark objects** break depth sensors (module 5): use polarised light, multi-exposure, learned depth completion (ClearGrasp, TransCG), or RGB-based grasping.
- **Calibration drift** after a collision or temperature change: add a **check board/fiducial** in the cell and a periodic automatic re-calibration test.
- **Lighting changes** (sun through a window): enclose or illuminate actively; test at all shifts.
- **Domain gap** between synthetic training and real images: domain randomisation (textures, lighting, camera noise) and a few real images for fine-tuning.
- **Symmetry and occlusion** cause pose flips; track over time and add a verification step.
- **Latency**: do not process a 6-D pose model at 1 FPS in a 1-second cycle target; budget the whole cycle (capture, inference, planning, motion).
- **Safety**: a vision error should result in a safe stop, not a crash; use force/torque limits, protective stops and certified sensors for people detection.

:::interview Questions you may get
- "Walk me through the vision part of a pick-and-place system." Capture RGB-D, detect/segment, estimate the pose or a grasp, transform to the robot frame with the hand-eye calibration, plan, execute, verify.
- "How do you get 3-D grasp positions from pixels?" Back-project the pixel with its depth through the intrinsics, then apply the camera-to-base transform from hand-eye calibration.
- "What is a force-closure/antipodal grasp?" Two contacts whose forces lie within the friction cones and oppose each other so the object cannot slip.
- "How do you pick an unknown object?" A model-free grasp detector on depth (GG-CNN, Contact-GraspNet, AnyGrasp) plus segmentation (SAM) and collision checking.
- "What causes picks to miss by a few millimetres?" Calibration error (rotation through the lever arm), depth noise, tool-centre-point error, robot repeatability; quantify each.
- "How would you handle shiny metal parts?" Polarised/structured lighting, multi-exposure scanning, CAD-based pose estimation with ICP refinement, and depth completion.
:::

```quiz
? What does the friction cone describe?
+ The range of directions in which a contact can push without the finger slipping
- The shape of the gripper
- The camera field of view
> Half-angle arctan(μ) around the surface normal.

? A 0.3° hand-eye rotation error at 0.7 m distance causes about how much position error?
+ About 3.7 mm
- About 0.04 mm
- About 37 cm
> Error ≈ angle (radians) × distance.

? Why use ADD-S rather than ADD for symmetric objects?
+ ADD-S matches each model point to the nearest transformed point, so equivalent poses are not penalised
- It is faster
- It ignores translation
> Symmetric poses look identical.

? What is a good fix for pose estimates being slightly off before grasping?
+ Refine with ICP or render-and-compare, or correct with a wrist camera
- Increase the image brightness
- Increase the gripper speed
> Closed-loop refinement.
```

:::problem A robot cell picks 30 mm steel brackets from a bin using a structured-light scanner and a 6-D pose model. About 8% of picks fail. How do you find out why and reduce the failure rate? {level=hard tags="bin-picking,diagnostics,calibration"}
Think about instrumenting the pipeline and separating the error sources.

:::solution Model answer
Log every pick with the scan, the chosen pose/grasp, and the outcome (success, missed grasp, collision, dropped), then categorise failures and measure each stage: (1) pose accuracy against a known fixture (place a part at a known pose and compare), (2) calibration (check with a calibration artefact; error versus position in the workspace), (3) grasp planning (collisions with neighbours, grasp near edges), (4) gripper/execution (width, force, slip), (5) scan quality (reflections, missing data). Fix in order of frequency: refine the pose with ICP, improve the hand-eye calibration, add collision-aware candidate ranking, choose grasps closer to the centre of mass, adjust gripper pads, add post-pick verification and a re-scan policy. Track the failure rate per category after each change on a held-out production run.
:::
:::

:::keypoints
- Pipeline: RGB-D, segment, pose or grasp, pixel → camera → base transform, plan with collision checks, verify; keep a safety layer independent of vision.
- 6-D pose: keypoints + PnP, learned regressors, render-and-compare, ICP refinement, and foundation models (FoundationPose) for novel objects; handle symmetry (ADD-S).
- Grasps: antipodal/force-closure analysis, Dex-Net, GG-CNN, Contact-GraspNet/AnyGrasp for 6-DoF in clutter, suction quality maps.
- The pixel-to-robot error budget is a sum of depth, calibration and detection errors; lever arms amplify rotation errors; close the loop with wrist cameras or refinement.
:::

:::resources
- [Xiang et al.: PoseCNN](https://arxiv.org/abs/1711.00199) — 6-D pose in clutter.
- [Wen et al.: FoundationPose](https://arxiv.org/abs/2312.08344) — pose estimation and tracking of novel objects.
- [Labbé et al.: MegaPose](https://arxiv.org/abs/2212.06870) — render-and-compare for novel objects.
- [Mahler et al.: Dex-Net 2.0](https://arxiv.org/abs/1703.09312) — learned grasp quality from synthetic data.
- [Morrison et al.: GG-CNN](https://arxiv.org/abs/1804.05172) — closed-loop grasp synthesis.
- [Sundermeyer et al.: Contact-GraspNet](https://arxiv.org/abs/2103.14127) — 6-DoF grasps in clutter.
- [Fang et al.: AnyGrasp](https://arxiv.org/abs/2212.08333) — robust grasp perception.
- [BOP: Benchmark for 6D Object Pose Estimation](https://bop.felk.cvut.cz) — datasets and leaderboards.
:::
