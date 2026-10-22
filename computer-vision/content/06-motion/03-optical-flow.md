---
title: Optical Flow — Lucas-Kanade and Farneback
level: advanced
time: 55
summary: How to measure how every point moves between two frames. The brightness-constancy assumption, the optical flow equation, the aperture problem, Lucas-Kanade written from scratch, pyramids for large motion, tracking corners with calcOpticalFlowPyrLK, and dense flow with Farneback.
---

Background subtraction tells you **that** something moved. **Optical flow** tells you **how**: for each pixel, a small arrow `(u, v)` showing where that pixel went between frame `t` and frame `t+1`. Flow is used for motion detection, tracking, video stabilisation, frame interpolation, action recognition, visual odometry, and robot navigation (obstacle avoidance by flow divergence).

## The key assumption: brightness constancy

A point keeps its brightness as it moves. If a pixel at `(x, y)` in frame `t` moves by `(u, v)` to frame `t+1`:

`I(x + u, y + v, t + 1) = I(x, y, t)`

Take a first-order Taylor expansion and get the **optical flow constraint equation**:

:::formula Optical flow equation
I_x\,u + I_y\,v + I_t = 0
:::

`Ix`, `Iy` are the spatial gradients (Sobel) and `It` is the change in time between the frames. This is **one equation with two unknowns** `(u, v)` for each pixel. That is the heart of the problem.

## The aperture problem

Look at a moving straight edge through a small hole (an aperture). You can only see the motion **perpendicular to the edge**; any motion along the edge is invisible. The single equation says the same: only the component of flow along the gradient direction is determined.

:::analogy
Look at a barber's pole through a small window. The stripes seem to move up, although the pole is only turning. You cannot tell the true motion from what is visible through the window. To know the true motion, you need to see something that is **not just an edge**: a corner, or a texture with different directions.
:::

## Lucas–Kanade: solve it over a window

Lucas and Kanade (1981) assume that **all pixels in a small window move together** (the same `(u, v)`). A 5 × 5 window gives 25 equations for 2 unknowns. Solve by least squares:

:::formula Lucas-Kanade
\begin{pmatrix} u \\ v \end{pmatrix} = \begin{pmatrix} \sum I_x^2 & \sum I_x I_y \\ \sum I_x I_y & \sum I_y^2 \end{pmatrix}^{-1} \begin{pmatrix} -\sum I_x I_t \\ -\sum I_y I_t \end{pmatrix}
:::

You may recognise the 2×2 matrix: it is the **structure tensor** from the Harris corner lesson. It is invertible (and the flow is well determined) exactly where **both eigenvalues are large**: at **corners**. On an edge one eigenvalue is small (aperture problem); on flat areas both are small. So LK flow is reliable at good features, which is why it is paired with Shi–Tomasi corners.

## Lucas–Kanade from scratch

We shift a texture picture by a known sub-pixel amount and recover the motion.

```python run title="Lucas-Kanade by hand for one window" level=advanced
import cv2
import numpy as np
import cvlab

img = cvlab.image("coffee", gray=True).astype(np.float32)
true_u, true_v = 1.3, -0.8                                           # the true motion in pixels
M = np.float32([[1, 0, true_u], [0, 1, true_v]])
frame1 = cv2.GaussianBlur(img, (0, 0), 1.5)
frame2 = cv2.warpAffine(frame1, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_CUBIC)       # frame 1 moved by (u, v)

Ix = cv2.Sobel(frame1, cv2.CV_32F, 1, 0, ksize=3) / 8.0              # divide by 8: Sobel's scale factor
Iy = cv2.Sobel(frame1, cv2.CV_32F, 0, 1, ksize=3) / 8.0
It = frame2 - frame1

def lk_at(x, y, r=7):
    sl = (slice(y - r, y + r + 1), slice(x - r, x + r + 1))
    A = np.stack([Ix[sl].ravel(), Iy[sl].ravel()], 1)                # one row per pixel of the window
    b = -It[sl].ravel()
    ATA = A.T @ A
    eigvals = np.linalg.eigvalsh(ATA)
    flow = np.linalg.solve(ATA, A.T @ b) if eigvals[0] > 1e-3 else None
    return flow, eigvals

for (x, y) in [(200, 120), (60, 200), (320, 60)]:
    flow, ev = lk_at(x, y)
    print(f"window at ({x:3d},{y:3d}): smallest eigenvalue {ev[0]:9.1f}  estimated flow", None if flow is None else np.round(flow, 2), " true", (true_u, true_v))
```

The estimates land within about half a pixel of `(1.3, −0.8)`. They are not exact, because the equation is a first-order approximation and a 1.3-pixel motion is already a bit large for it (this is why pyramids and iterations are used). The smallest eigenvalue tells you how much to trust a window: where it is tiny (a flat or edge-only window) the estimate is unreliable, and good tracking points are chosen where it is large.

## Large motions: pyramids

The Taylor expansion is valid only for **small** motions (about 1 pixel). For larger motions we use a **pyramid** (coarse to fine): estimate the flow on a small version of the picture, where a 16-pixel motion looks like 1 pixel, then **upsample** it and refine at each finer level. OpenCV's `calcOpticalFlowPyrLK` does exactly this with `maxLevel` pyramid levels.

## Track corners with calcOpticalFlowPyrLK

```python run title="Sparse flow: track corners through the video" level=intermediate
import cv2
import numpy as np
import cvlab

frames, tracks = cvlab.video(n=40)
gray = [cv2.cvtColor(f, cv2.COLOR_RGB2GRAY) for f in frames]

p0 = cv2.goodFeaturesToTrack(gray[0], maxCorners=40, qualityLevel=0.2, minDistance=8, blockSize=7)
print("corners to track:", len(p0))
lk = dict(winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))

pts = p0
paths = [p0.reshape(-1, 2)]
alive = np.ones(len(p0), bool)
for t in range(1, 40):
    p1, status, err = cv2.calcOpticalFlowPyrLK(gray[t - 1], gray[t], pts, None, **lk)
    # forward-backward check: track back and see if we return to where we started; if not, drop the point
    p_back, st_back, _ = cv2.calcOpticalFlowPyrLK(gray[t], gray[t - 1], p1, None, **lk)
    fb_error = np.linalg.norm((pts - p_back).reshape(-1, 2), axis=1)
    good = (status.ravel() == 1) & (st_back.ravel() == 1) & (fb_error < 1.0)
    alive &= good
    pts = np.where(good[:, None, None], p1, pts)
    paths.append(pts.reshape(-1, 2).copy())
print("points still tracked after 39 frames:", int(alive.sum()), "of", len(p0))

vis = frames[39].copy()
for i in np.where(alive)[0]:
    trail = np.array([p[i] for p in paths], np.int32)
    cv2.polylines(vis, [trail], False, (255, 255, 0), 1, cv2.LINE_AA)
    cv2.circle(vis, tuple(int(v) for v in trail[-1]), 3, (255, 0, 0), -1)
cvlab.show(frames[0], "First frame", vis, "Tracks of corners that survived")
```

The **forward-backward check** is a useful trick: a good track can be followed **backwards** and returns to its start. Points failing this are dropped. LK tracking of corners (the **KLT tracker**) is used in visual odometry front-ends (for example in VINS) because it is fast and avoids descriptor matching.

## Dense flow: Farneback

LK gives flow at selected points. **Dense** flow gives an arrow at **every pixel**. **Farneback's** method approximates each neighbourhood by a polynomial and compares the polynomials in the two frames. It is robust, fast and in OpenCV (`cv2.calcOpticalFlowFarneback`). **DIS** flow (`cv2.DISOpticalFlow_create`) is faster and often better.

We **colour** the flow: the **hue** shows the direction and the **brightness** shows the speed.

```python run title="Dense flow and the colour wheel" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("coffee", gray=True)
h, w = img.shape
M = cv2.getRotationMatrix2D((w / 2, h / 2), 4, 1.0)                  # rotate 4 degrees about the centre
img2 = cv2.warpAffine(img, M, (w, h))

flow = cv2.calcOpticalFlowFarneback(img, img2, None, pyr_scale=0.5, levels=4, winsize=21, iterations=3, poly_n=7, poly_sigma=1.5, flags=0)

# the true flow of this rotation, for comparison
ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
true_flow = np.stack([M[0, 0] * xs + M[0, 1] * ys + M[0, 2] - xs, M[1, 0] * xs + M[1, 1] * ys + M[1, 2] - ys], -1)
valid = np.zeros((h, w), bool); valid[40:-40, 40:-40] = True
epe = np.linalg.norm(flow - true_flow, axis=2)[valid]
print("flow shape:", flow.shape, "(one (u, v) arrow per pixel)")
print("average endpoint error:", round(float(epe.mean()), 3), "pixels   (typical motion size:", round(float(np.linalg.norm(true_flow, axis=2)[valid].mean()), 1), "pixels)")

def flow_to_color(flow):
    mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])
    hsv = np.zeros((*flow.shape[:2], 3), np.uint8)
    hsv[..., 0] = (ang * 180 / np.pi / 2).astype(np.uint8)            # hue = direction
    hsv[..., 1] = 255
    hsv[..., 2] = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)       # brightness = speed
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
cvlab.show(img, "Frame 1", img2, "Frame 2 (rotated 4 degrees)", flow_to_color(flow), "Estimated flow", flow_to_color(true_flow.astype(np.float32)), "True flow")
```

A pure rotation gives flow arrows that circle around the centre: still at the centre, faster toward the edges, with the direction changing round the circle (hence all the colours).

## What flow is used for

- **Video stabilisation**: estimate global motion (from flow or tracked points), smooth it, warp frames.
- **Motion segmentation**: flow of moving objects differs from the flow of the camera's own motion.
- **Visual odometry** and **obstacle avoidance**: flow divergence ("time to contact").
- **Frame interpolation** (slow motion) and **video compression** (motion vectors).
- **Action recognition**: the two-stream network feeds flow to a CNN.
- **Object tracking**, **gesture recognition**, **moving-object detection from a moving camera**.

## When flow fails

- **Large motions** (beyond what the pyramid covers), fast objects, **motion blur**.
- **Brightness changes** (violate brightness constancy), shadows, specular highlights.
- **Occlusions**: pixels that appear or disappear have no match.
- **Textureless regions**: the aperture problem; dense methods add smoothness to fill in.
- **Transparent or repeating textures.**

:::interview Questions you may get
- "State the optical flow constraint equation." `Ix u + Iy v + It = 0`, from brightness constancy and a first-order Taylor expansion.
- "What is the aperture problem?" From a local window you only see the flow component along the image gradient; the component along an edge is undetermined.
- "How does Lucas–Kanade solve it?" Assume constant flow over a window and solve the least squares `(AᵀA) d = Aᵀ b`; reliable where `AᵀA` is well conditioned (corners).
- "Why use pyramids?" The linearisation only holds for small motion; coarse-to-fine handles large displacements.
- "Sparse versus dense flow?" Sparse tracks selected points (LK, fast); dense estimates every pixel (Farneback, DIS, RAFT).
- "How would you check a track's quality?" Forward-backward consistency or an error value from the tracker.
:::

```quiz
? Why does Lucas-Kanade work best at corners?
+ The structure tensor has two large eigenvalues there, so the 2 x 2 system is well conditioned
- Corners are brighter
- Corners move slower
> On edges one eigenvalue is small (aperture problem).

? What does the forward-backward check do?
+ Tracks a point forward and then backward and rejects it if it does not return to the start
- Reverses the video
- Doubles the frame rate
> It detects unreliable tracks.

? What assumption does optical flow rely on?
- Objects do not rotate
+ A point keeps the same brightness as it moves (brightness constancy)
- The camera is fixed
> Lighting changes break it.

? Why do we use an image pyramid in calcOpticalFlowPyrLK?
+ To handle motions larger than a pixel or two by working coarse to fine
- To save memory only
- To remove colour
> A large motion becomes small at coarse levels.
```

:::problem A drone-mounted camera must detect a moving person from the video. Background subtraction fails. How can optical flow help, and what are the difficulties? {level=hard tags="optical-flow,motion-segmentation,drone"}
Think about camera motion versus object motion.

:::solution Model answer
The camera moves, so every pixel has flow. Estimate the **dominant (ego) motion**, for example by fitting a homography or affine model to sparse flow (or tracked features) with RANSAC, which explains the background; then compute the **residual flow** (observed minus the background model). Pixels with a large residual belong to independently moving objects; cluster them to get the person. Difficulties: parallax (near objects have different flow than a plane model predicts), motion blur and large motion at low frame rates, rolling shutter, textureless ground, and slow-moving people (small residual). A detector (CNN) combined with tracking is more robust; flow can add a motion cue or be used to stabilise frames before detection.
:::
:::

:::keypoints
- Optical flow gives the motion of each pixel between frames. Brightness constancy yields `Ix u + Iy v + It = 0`: one equation, two unknowns.
- Lucas–Kanade assumes constant flow in a window and solves least squares; it works at corners (the structure tensor again).
- Pyramids handle large motion; `calcOpticalFlowPyrLK` tracks features with a forward-backward check; Farneback and DIS give dense flow.
- Flow powers stabilisation, tracking, odometry and action recognition. It fails with large motion, blur, lighting changes and occlusions.
:::

:::resources
- [OpenCV: optical flow tutorial](https://docs.opencv.org/4.x/d4/dee/tutorial_optical_flow.html) — Lucas-Kanade and dense flow in code.
- [Baker et al.: A Database and Evaluation Methodology for Optical Flow](https://vision.middlebury.edu/flow/) — the Middlebury benchmark and its colour-wheel visualisation.
- [Lucas and Kanade: An Iterative Image Registration Technique (1981)](https://www.ri.cmu.edu/pub_files/pub3/lucas_bruce_d_1981_2/lucas_bruce_d_1981_2.pdf) — the original paper.
:::
