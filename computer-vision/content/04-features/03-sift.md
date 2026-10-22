---
title: SIFT — Scale-Invariant Feature Transform
level: intermediate
time: 45
summary: The most famous classical feature. How SIFT finds keypoints in scale space, cleans them, gives each a direction, and describes the neighbourhood with a 128-number vector. You use it in OpenCV, see its invariance on a real pair, and learn its strengths and limits.
---

**SIFT** (David Lowe, 1999 and 2004) was the feature that made image matching work in the real world. It finds keypoints that survive changes of **scale, rotation, brightness, a bit of viewpoint** and noise, and it gives each a **128-number description** that you can compare. For about 15 years it was the first thing to try for panoramas, 3-D reconstruction, object recognition and robot localisation, and it is still a strong baseline.

## The four stages

:::flow SIFT in four stages
1. Scale-space extrema | Build a pyramid of blurred pictures (octaves). Subtract neighbouring blur levels to get Difference-of-Gaussians. A pixel that is the maximum or minimum among its 26 neighbours (8 in its own level, 9 above, 9 below) is a candidate keypoint with position and scale.
2. Keypoint localisation | Fit a small curve to refine the position to a fraction of a pixel and scale. Reject low-contrast points (noise) and points on edges (which have a strong curvature in only one direction, checked with a Harris-like ratio).
3. Orientation assignment | In the patch around the keypoint (sized by its scale), build a histogram of gradient directions weighted by magnitude, with 36 bins. The tallest peak is the keypoint's orientation (more peaks make extra keypoints). Everything later is measured relative to this direction, which makes it rotation invariant.
4. Descriptor | Rotate the patch to the orientation. Cut it into a 4 × 4 grid of cells. In each cell, make an 8-bin histogram of gradient directions. 4 × 4 × 8 = 128 numbers. Normalise, clip large values at 0.2, normalise again.
:::

Why does this work?

- **Gradients, not raw pixels**: gradient directions do not change when brightness shifts or contrast changes (a global gain cancels after normalisation).
- **Histograms inside cells**: small shifts of a few pixels move values between neighbouring bins, but do not change the histograms much.
- **Relative orientation and scale**: the patch is rotated and sized by the keypoint, so the description does not depend on them.

## Use it in OpenCV

```python run title="Detect SIFT keypoints and read their properties" level=easy
import cv2
import cvlab

img = cvlab.image("coffee", gray=True)
sift = cv2.SIFT_create()
kps, desc = sift.detectAndCompute(img, None)
print("keypoints:", len(kps), "   descriptor array:", desc.shape, desc.dtype)

k = kps[0]
print(f"first keypoint: position ({k.pt[0]:.1f}, {k.pt[1]:.1f})  size {k.size:.1f}  angle {k.angle:.1f} degrees  response {k.response:.4f}")
print("descriptor values of the first keypoint (first 12 of 128):", desc[0][:12].astype(int))

vis = cv2.drawKeypoints(cv2.cvtColor(img, cv2.COLOR_GRAY2RGB), kps, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)
cvlab.show(vis, "SIFT keypoints: circle size = scale, line = orientation")
```

Each keypoint has a position, a **size** (scale), an **angle** (orientation), a **response** (strength), and a 128-number descriptor. In the picture, the circle radius shows the scale and the line shows the orientation.

## A look inside the descriptor idea

The heart of the descriptor is a histogram of gradient directions. Here is a stripped-down version, for one patch.

```python run title="A gradient-orientation histogram, the heart of the descriptor" level=intermediate
import cv2
import numpy as np
import cvlab

def sift_like(patch):
    """A 16 x 16 patch -> 128 numbers: 4 x 4 cells, each an 8-bin histogram of gradient directions."""
    gx = cv2.Sobel(patch, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(patch, cv2.CV_32F, 0, 1)
    mag, ang = cv2.cartToPolar(gx, gy, angleInDegrees=True)
    desc = []
    for cy in range(0, 16, 4):
        for cx in range(0, 16, 4):
            hist, _ = np.histogram(ang[cy:cy + 4, cx:cx + 4].ravel(), bins=8, range=(0, 360), weights=mag[cy:cy + 4, cx:cx + 4].ravel())
            desc.extend(hist)
    desc = np.array(desc)
    desc /= np.linalg.norm(desc) + 1e-9
    desc = np.minimum(desc, 0.2)                                  # clip big values so one strong edge cannot dominate
    return desc / (np.linalg.norm(desc) + 1e-9)

img = cvlab.image("coffee", gray=True).astype(np.float32)
patch = img[100:116, 150:166]                                     # a 16 x 16 patch (SIFT uses this size around a keypoint)
other = img[200:216, 60:76]                                       # a patch from somewhere else
changed = patch * 0.7 + 10                                        # the same patch with less contrast and a different brightness

d, d_changed, d_other = sift_like(patch), sift_like(changed), sift_like(other)
print("descriptor length:", len(d), "(4 x 4 cells x 8 bins)   norm:", round(float(np.linalg.norm(d)), 3))
print("distance to the same patch with different brightness/contrast:", round(float(np.linalg.norm(d - d_changed)), 3))
print("distance to a patch from a different place                 :", round(float(np.linalg.norm(d - d_other)), 3))
```

The first distance is close to zero and the second is large: **the description ignores lighting changes but tells different places apart.** Real SIFT adds Gaussian weighting, trilinear interpolation between cells and orientation bins, and the rotation to the dominant direction. But this is the idea.

## See the invariance

Take a photo and a rotated, shrunk, darker and noisier copy. Do the same points get found, and can we match them?

```python run title="SIFT survives rotation, scale and brightness change" level=intermediate
import cv2
import numpy as np
import cvlab

a, b, H = cvlab.warped_pair("coffee")                         # b = a rotated 18 degrees, shrunk to 0.85, darker, noisy, slightly in perspective
ga, gb = [cv2.cvtColor(x, cv2.COLOR_RGB2GRAY) for x in (a, b)]
sift = cv2.SIFT_create()
ka, da = sift.detectAndCompute(ga, None)
kb, db = sift.detectAndCompute(gb, None)

matches = cv2.BFMatcher(cv2.NORM_L2).knnMatch(da, db, k=2)
good = [m for m, n in matches if m.distance < 0.75 * n.distance]          # Lowe's ratio test (next lessons)

# how many of the good matches agree with the TRUE transform H (we know it, because we made the pair)?
src = np.float32([ka[m.queryIdx].pt for m in good])
dst = np.float32([kb[m.trainIdx].pt for m in good])
pred = cv2.perspectiveTransform(src[None], H)[0]
err = np.linalg.norm(pred - dst, axis=1)
print("keypoints in a / b:", len(ka), "/", len(kb))
print("good matches:", len(good), "  of which correct (within 3 pixels of the truth):", int((err < 3).sum()))
vis = cv2.drawMatches(a, ka, b, kb, good[:40], None, flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
cvlab.show(vis, "SIFT matches between the photo and its transformed copy")
```

Most of the matches are right, even though the second picture is turned, smaller, darker and noisy. The few wrong ones are removed in the next two lessons (ratio test and RANSAC).

## Strengths and weaknesses

| Strength | Weakness |
|---|---|
| Invariant to scale, rotation, brightness; tolerant to small viewpoint change (up to about 30–40°) | Slow compared with ORB (floating-point 128-D descriptors, big scale space) |
| Very distinctive descriptor: good matching quality | Needs textured regions; fails on blank walls, repetitive patterns |
| Works well for wide baselines and 3-D reconstruction | Large memory for many descriptors |
| Free to use since the patent expired in 2020 | Struggles with big viewpoint changes, day/night changes |

**Relatives and successors:** RootSIFT (a small change in how descriptors are compared, which improves matching), **SURF** (faster using box filters and integral images, patented), **ORB** (next lesson, binary and fast), **AKAZE**, and **learned features** (SuperPoint + SuperGlue / LightGlue, LoFTR, DISK), which handle large viewpoint and appearance change far better. Modern pipelines in robotics and 3-D reconstruction still use SIFT or learned features.

:::interview Questions you may get
- "Explain SIFT." Scale-space DoG extrema, refinement and rejection of edges and low contrast, dominant orientation from a gradient histogram, 128-D descriptor from 4×4 cells × 8 orientation bins.
- "How is SIFT scale invariant? Rotation invariant?" Scale: extrema across a DoG scale space, patch sized by σ. Rotation: patch rotated to the dominant gradient orientation.
- "Why is it robust to illumination change?" It uses gradient orientations and normalises the vector; clipping at 0.2 limits the effect of big gradients.
- "What is the descriptor size?" 128 floats.
- "Why would you choose ORB over SIFT?" Speed and memory on small devices; SIFT is more accurate and robust.
:::

```quiz
? What is the length of a standard SIFT descriptor?
- 64
+ 128
- 256
> 4 × 4 cells × 8 orientation bins.

? How does SIFT become rotation invariant?
+ It measures gradients relative to the keypoint's dominant orientation
- It uses colour
- It blurs the picture
> The patch is rotated to the dominant direction before the descriptor is made.

? Why does SIFT reject keypoints on edges?
- Edges are too bright
+ Their position along the edge is ambiguous, so they are not well localised
- They are too large
> A curvature test removes them, similar to the Harris idea.

? Which step makes the descriptor insensitive to a global brightness gain?
- Using colour
+ Normalising the vector (and using gradient directions)
- The scale space
> Multiplying all gradients by a constant cancels after normalisation.
```

:::problem Two photos of the same textureless white wall with one picture frame: SIFT gives only a few matches, mostly on the frame. Why, and what would you try? {level=medium tags="sift,matching,debugging"}
Think about where SIFT finds keypoints.

:::solution Model answer
SIFT needs gradients and corners. A blank wall has almost none, so keypoints concentrate on the frame, and matches are few and concentrated. Remedies: lower the contrast threshold (`contrastThreshold`) to accept weaker points, increase the image contrast with CLAHE first, use a different sensor (add texture by projected light, use depth), use line features or the frame's edges, add markers (AprilTags), or use learned matchers that are better in low-texture areas (LoFTR). Also check the exposure.
:::
:::

:::keypoints
- SIFT: DoG scale-space extrema → refined and filtered keypoints → dominant orientation → 128-D gradient histogram descriptor.
- Invariant to scale, rotation and brightness; tolerant to modest viewpoint change.
- `cv2.SIFT_create().detectAndCompute(gray, None)` gives keypoints (position, size, angle) and descriptors.
- It is accurate but slower than ORB; learned features are better for big changes.
:::

:::resources
- [Lowe: Distinctive Image Features from Scale-Invariant Keypoints (IJCV 2004)](https://www.cs.ubc.ca/~lowe/papers/ijcv04.pdf) — the original paper.
- [OpenCV: Introduction to SIFT](https://docs.opencv.org/4.x/da/df5/tutorial_py_sift_intro.html) — the four steps with code.
- [Arandjelovic and Zisserman: Three things everyone should know to improve object retrieval (RootSIFT)](https://www.robots.ox.ac.uk/~vgg/publications/2012/Arandjelovic12/arandjelovic12.pdf) — a simple SIFT improvement.
:::
