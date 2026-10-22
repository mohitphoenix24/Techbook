---
title: Depth Sensors — Stereo, Structured Light, ToF, LiDAR
level: intermediate
time: 40
summary: How machines measure distance. Passive and active stereo, structured light, time of flight, LiDAR and event cameras: how each works, what goes wrong with each, depth image formats, hole filling, and how a depth image becomes a point cloud.
---

A normal camera gives colour but not distance. Many robot tasks need distance directly: grasping, obstacle avoidance, mapping. Several sensor types measure depth. Knowing how each works helps you choose one, and explains why it fails in some situations.

## Sensor families

:::flow Ways to measure depth
Passive stereo | Two cameras, match features, Z = f·B/d. Works outdoors and costs little. Needs texture and compute.
Active stereo | Stereo plus an infrared projector that paints a texture on the scene. Works on plain walls. (Intel RealSense D400 series.)
Structured light | A projector sends a known pattern (stripes, dots). A camera sees how the pattern bends and computes depth by triangulation. Very precise at short range (Zivid, Photoneo, Kinect v1, iPhone Face ID).
Time of flight (ToF) | Send light, measure the time it takes to come back. Distance = speed of light × time / 2. Direct ToF measures pulse time; indirect ToF measures the phase shift of modulated light (Kinect v2, many phone depth sensors).
LiDAR | A laser scanner. Spinning, or solid-state with a mirror or phased array. Direct ToF with sparse, accurate points, long range (Velodyne, Ouster, Livox).
Learned monocular depth | A neural network guesses depth from a single picture. No extra hardware; relative depth is good, metric accuracy is weaker.
:::

| Sensor | Range | Accuracy | Resolution | Works in sunlight? | Strengths | Weak points |
|---|---|---|---|---|---|---|
| Passive stereo | 0.5–50 m (by baseline) | Falls with Z² | High (needs texture) | Yes | Cheap, outdoor | Textureless surfaces, compute |
| Active stereo (IR) | 0.3–10 m | Medium | Medium–high | Poor outdoors | Handles plain walls | IR washed out by sun |
| Structured light | 0.2–3 m | Very high (sub-mm) | High | Poor | Best for bin picking | Slow, needs darkness or filters, sunlight |
| Indirect ToF | 0.3–7 m | Medium (cm) | Low (VGA) | Fair | Compact, fast | Multipath, flying pixels |
| LiDAR | 1–200+ m | High (cm) | Sparse | Yes | Long range, robust | Cost, sparse points |
| Event camera | n/a | n/a | n/a | Yes | Microsecond latency | Not direct depth |

**Event cameras** are different. Each pixel reports a tiny event when its brightness *changes*, with microsecond timing and a huge dynamic range. They do not give depth directly, but they are excellent for fast motion and are used for tracking and visual odometry.

## What goes wrong

- **Reflective, transparent and very dark surfaces**: glass, shiny metal and black plastic return little or confusing signal. This is the classic headache of bin picking.
- **Multipath** (ToF): light bounces off walls and corners before returning, so corners look rounded and distances are too large.
- **Flying pixels** (ToF, LiDAR): at an object's edge a pixel mixes foreground and background returns and reports a point **in mid-air**.
- **Sunlight and IR interference**: active IR sensors lose their pattern outdoors, and two sensors in one room can disturb each other.
- **Motion**: scanned or sequential patterns (structured light, rolling LiDAR) smear moving objects.
- **Temperature drift**: cheap ToF sensors change calibration while warming up.
- **Range limits and quantisation**: depth resolution gets coarser with distance.

## Depth images

A depth sensor usually outputs a **depth image**: a 2-D array where each pixel holds the distance, typically as `uint16` in **millimetres**, with **0 meaning "no measurement"**. Two details cause many bugs: (1) the unit (millimetres versus metres, `float32`), and (2) the meaning of the distance: **Z** (along the optical axis, the usual one) or the **range** (straight-line distance to the point, common for LiDAR and some ToF sensors). Convert if needed: `Z = range · cos(angle)`.

```python run title="Depth image: valid pixels, range and hole filling" level=easy
import cv2
import numpy as np
import cvlab

left, right, disparity = cvlab.stereo_pair()
f, B = 600.0, 0.10                                                  # pretend focal length (px) and baseline (m)
depth_m = f * B / disparity                                         # Z = f * B / d
depth_mm = (depth_m * 1000).astype(np.uint16)                        # how a sensor stores it: millimetres in uint16

depth_mm[40:70, 200:240] = 0                                         # simulate holes (no measurement)
print("dtype:", depth_mm.dtype, " shape:", depth_mm.shape, " valid pixels:", round(float((depth_mm > 0).mean() * 100), 1), "%")
print("nearest and farthest valid depth:", depth_mm[depth_mm > 0].min() / 1000, "m and", depth_mm[depth_mm > 0].max() / 1000, "m")

# fill the holes: inpaint (works on 8-bit pictures: scale, fill, scale back)
valid = (depth_mm > 0).astype(np.uint8)
scaled = (depth_mm / depth_mm.max() * 255).astype(np.uint8)
filled = cv2.inpaint(scaled, (1 - valid) * 255, 3, cv2.INPAINT_TELEA)
smooth = cv2.medianBlur(filled, 5)                                  # median filter: remove speckles, keep edges
view = lambda d: cv2.applyColorMap(d, cv2.COLORMAP_TURBO)[..., ::-1]
cvlab.show(left, "Colour (left view)", view(scaled), "Depth with a hole (blue = near)", view(smooth), "Hole filled + median")
```

## From depth image to point cloud

With the intrinsics `K`, every valid pixel `(u, v)` with depth `Z` becomes a 3-D point (the back-projection formula from the pinhole lesson). Do it for all pixels at once with NumPy:

```python run title="Back-project a depth image to a point cloud" level=intermediate
import numpy as np
import matplotlib.pyplot as plt
import cvlab

left, right, disparity = cvlab.stereo_pair()
f, B = 600.0, 0.10
h, w = disparity.shape
Z = f * B / disparity                                               # metres
cx, cy = w / 2, h / 2

u, v = np.meshgrid(np.arange(w), np.arange(h))
X = (u - cx) * Z / f
Y = (v - cy) * Z / f
points = np.stack([X, Y, Z], -1).reshape(-1, 3)                      # N x 3 point cloud
colors = left.reshape(-1, 3) / 255.0
print("points:", points.shape[0], "  X range:", np.round([X.min(), X.max()], 2), " Z range:", np.round([Z.min(), Z.max()], 2), "m")

fig, ax = plt.subplots(1, 2, figsize=(9, 3.6))
sel = slice(None, None, 6)
ax[0].scatter(points[sel, 0], points[sel, 2], c=colors[sel], s=2); ax[0].set_xlabel("X (m)"); ax[0].set_ylabel("Z (m)"); ax[0].set_title("Top view (looking down)"); ax[0].invert_yaxis()
ax[1].scatter(points[sel, 0], -points[sel, 1], c=colors[sel], s=2); ax[1].set_xlabel("X (m)"); ax[1].set_ylabel("height (m)"); ax[1].set_title("Front view")
plt.tight_layout()
```

In the top view you can see the layers of the scene: the tilted ground plane, the box and the disc at different depths.

## RGB-D: aligning depth and colour

An **RGB-D camera** gives a colour image and a depth image, but they come from **two different sensors** with different viewpoints. To colour a point cloud you must **align** them: use the known extrinsics between the depth and colour sensors to map each depth pixel into the colour image (SDKs do this: "aligned depth to colour"). Check the alignment visually on an object edge.

## Choosing a sensor for a robot

| Question | Points to |
|---|---|
| Small parts, millimetre accuracy, indoor, short range (bin picking, inspection) | Structured light or high-end active stereo |
| Mobile robot indoors, obstacle avoidance, SLAM | Active stereo (RealSense), ToF, or small LiDAR |
| Outdoors, long range (cars, drones, field robots) | LiDAR, passive stereo with a wide baseline, radar |
| Fast motion, high dynamic range | Event camera plus a normal camera |
| Lowest cost, no extra hardware | Passive stereo, or learned depth as a weak cue |
| Shiny or transparent objects | Polarisation, multi-view, or learned depth completion |

Always **measure on your own parts** under your own lighting before committing: datasheets show best cases.

:::interview Questions you may get
- "Explain how a ToF camera measures depth." It emits modulated light and measures the round-trip time (or phase shift): distance = c·t/2.
- "Why does a ToF camera round corners?" Multipath interference: light bounces and arrives later, adding extra distance.
- "Compare structured light and stereo." Structured light projects a known pattern and triangulates the camera view of it: precise at short range, bad in sunlight. Passive stereo needs texture but works outdoors at long range.
- "What are flying pixels?" Edge pixels that mix foreground and background returns and give spurious mid-air points; filter them by depth discontinuity.
- "What are the units and conventions of a depth image?" Often `uint16` millimetres with 0 for invalid; Z-depth versus range.
:::

```quiz
? A ToF sensor measures a time of 20 ns for a pulse to return. What is the distance? (c = 3 × 10^8 m/s)
- 6 m
+ 3 m
- 12 m
> d = c·t/2 = 3e8 × 20e-9 / 2 = 3 m.

? Which sensor most struggles in direct sunlight?
- LiDAR with a narrow-band filter
+ An infrared structured-light camera
- Passive stereo
> The projected IR pattern is overwhelmed by sunlight.

? A depth pixel has the value 0. What does it usually mean?
- The object is touching the camera
+ No valid measurement
- A very far object
> Always mask zeros before computing statistics.

? Why do black, shiny or transparent objects give poor depth?
+ Little light returns to the sensor in a useful way, or it returns from other surfaces
- The camera is too slow
- They have no shape
> This is typical for bin picking.
```

:::problem You need to choose a depth camera for a robot arm that picks shiny metal parts from a bin, indoors, at 0.5 m. What do you evaluate? {level=medium tags="depth,sensors,bin-picking"}
Think about the material, accuracy and cycle time.

:::solution Model answer
Required accuracy (sub-mm to 1 mm for grasping) points to structured-light 3-D cameras (blue light, multiple patterns or projector + stereo), which are designed for bin picking; shiny metal causes specular highlights and multipath, so test with real parts and consider polarising filters, multi-exposure HDR depth, or multiple viewpoints. Check the working distance and field of view (0.5 m), capture time versus cycle time, point cloud density, calibration stability with hand-eye (the camera is mounted rigidly), robot SDK support, ambient light handling and cost. Evaluate a sample set of parts with ground-truth measurements (for example a calibrated sphere or CMM-measured part), measure noise, missing data and pose repeatability, and decide.
:::
:::

:::keypoints
- Depth sensors: passive/active stereo, structured light, indirect/direct ToF, LiDAR; event cameras measure change, not depth.
- Each has failure modes: textureless surfaces, sunlight, multipath, flying pixels, shiny/transparent/dark surfaces.
- A depth image is often `uint16` mm with 0 = invalid; check Z-depth versus range.
- Back-project with K to get a point cloud; align depth and colour for RGB-D. Choose a sensor by testing on your own parts.
:::

:::resources
- [Intel RealSense documentation: depth cameras and tuning](https://dev.intelrealsense.com/docs/docs-get-started) — practical guidance for active stereo.
- [Sarbolandi et al.: Kinect Range Sensing: Structured-Light versus Time-of-Flight](https://arxiv.org/abs/1505.05459) — a careful comparison.
- [Gallego et al.: Event-based Vision: A Survey](https://arxiv.org/abs/1904.08405) — event cameras.
:::
