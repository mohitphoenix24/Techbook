---
title: Panorama Stitching, Step by Step
level: intermediate
time: 40
summary: Join two overlapping photos into one wide picture. Detect and match features, estimate the homography with RANSAC, warp one image onto the other's frame, blend the seam, and see what OpenCV's high-level Stitcher adds.
---

You have all the pieces now: keypoints, descriptors, matching, RANSAC, homography and warping. Putting them together gives a **panorama stitcher**, a classic project that interviewers love because it touches every idea.

## Why a homography works here

If you only **rotate the camera** (standing still and turning), or if the scene is **flat**, any two photos are related by a **homography**. That is why panoramas work when you stand in one place and turn. If you walk sideways, nearby objects shift differently from far ones (parallax) and a single homography cannot fit everything.

## The pipeline

:::flow Stitching two images
1. Detect and describe | SIFT (or ORB) keypoints and descriptors in both photos.
2. Match | Nearest neighbours with Lowe's ratio test.
3. Estimate | `cv2.findHomography` with RANSAC gives H that maps image B into image A's frame.
4. Warp | Make a bigger canvas. `warpPerspective` puts B on it; A is copied to its place.
5. Blend | Mix the overlap smoothly (feather, or multi-band) so the seam disappears.
:::

## Make two overlapping photos

We cut two overlapping windows from one wide picture. The second one is slightly rotated and has different exposure, as if the photographer had turned a bit and the camera had adjusted.

```python run title="Two overlapping photos" level=easy
import cv2
import numpy as np
import cvlab

wide = cvlab.image("rocket")                         # 280 x 420 pixels
h, w = wide.shape[:2]
left = wide[:, :270].copy()
right_plain = wide[:, 150:].copy()                   # overlaps the left photo by 120 pixels

M = cv2.getRotationMatrix2D((right_plain.shape[1] / 2, h / 2), 4, 1.0)           # the photographer turned the camera by 4 degrees
right = cv2.warpAffine(right_plain, M, (right_plain.shape[1], h), borderMode=cv2.BORDER_REFLECT)
right = np.clip(right.astype(np.float32) * 1.15 + 6, 0, 255).astype(np.uint8)       # a little brighter

print("left:", left.shape, " right:", right.shape)
cvlab.show(left, "Left photo", right, "Right photo (turned, brighter)")
```

## Find the homography

```python run title="Match and estimate the homography" level=intermediate shared
import cv2
import numpy as np
import cvlab

wide = cvlab.image("rocket")
h, w = wide.shape[:2]
left = wide[:, :270].copy()
right_plain = wide[:, 150:].copy()
M = cv2.getRotationMatrix2D((right_plain.shape[1] / 2, h / 2), 4, 1.0)
right = cv2.warpAffine(right_plain, M, (right_plain.shape[1], h), borderMode=cv2.BORDER_REFLECT)
right = np.clip(right.astype(np.float32) * 1.15 + 6, 0, 255).astype(np.uint8)

gl, gr = [cv2.cvtColor(x, cv2.COLOR_RGB2GRAY) for x in (left, right)]
sift = cv2.SIFT_create()
kl, dl = sift.detectAndCompute(gl, None)
kr, dr = sift.detectAndCompute(gr, None)
knn = cv2.BFMatcher(cv2.NORM_L2).knnMatch(dr, dl, k=2)                       # match RIGHT descriptors to LEFT ones
good = [m for m, n in knn if m.distance < 0.75 * n.distance]
src = np.float32([kr[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)         # points in the right photo
dst = np.float32([kl[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)         # the same points in the left photo
H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
print("keypoints left/right:", len(kl), "/", len(kr), "  good matches:", len(good), "  RANSAC inliers:", int(mask.sum()))
print("H maps the right photo into the left photo's frame:\n", np.round(H, 3))
```

## Warp and blend

The canvas must be big enough for both pictures. We find where the right picture's four corners land after applying `H`, take the bounding box of everything, and shift so no coordinate is negative.

```python run title="Warp the right photo onto a canvas and blend" level=intermediate shared
hr, wr = right.shape[:2]
corners_right = np.float32([[0, 0], [wr, 0], [wr, hr], [0, hr]]).reshape(-1, 1, 2)
warped_corners = cv2.perspectiveTransform(corners_right, H)
all_corners = np.vstack([warped_corners, np.float32([[0, 0], [270, 0], [270, h], [0, h]]).reshape(-1, 1, 2)])
x_min, y_min = (int(v) for v in np.floor(all_corners.min(axis=(0, 1))))
x_max, y_max = (int(v) for v in np.ceil(all_corners.max(axis=(0, 1))))
T = np.array([[1, 0, -x_min], [0, 1, -y_min], [0, 0, 1]], np.float64)          # shift so that everything is inside the canvas
size = (int(x_max - x_min), int(y_max - y_min))
print("canvas size (width, height):", size)

warped_right = cv2.warpPerspective(right, T @ H, size)
canvas_left = np.zeros_like(warped_right)
canvas_left[-y_min:-y_min + h, -x_min:-x_min + 270] = left

# a simple "feather" blend: weight each picture by its distance to its own border, so the seam fades
def weight(img_valid):
    d = cv2.distanceTransform(img_valid.astype(np.uint8), cv2.DIST_L2, 3)
    return d
valid_l = canvas_left.sum(axis=2) > 0
valid_r = warped_right.sum(axis=2) > 0
wl, wr_ = weight(valid_l), weight(valid_r)
total = wl + wr_ + 1e-6
pano = ((canvas_left * wl[..., None] + warped_right * wr_[..., None]) / total[..., None]).astype(np.uint8)

naive = np.where(valid_r[..., None], warped_right, canvas_left)                     # just paste on top: a visible seam
cvlab.show(naive, "Pasted: the exposure difference shows a seam", pano, "Feathered blend")
```

(The `shared` flag makes this block continue from the previous one, so it can use `left`, `right` and `H`.)

## Check the result against the truth

We built the right photo from a known transformation, so we can measure how good H is: map a few points and compare.

```python run title="Is the estimate accurate?" level=intermediate shared
# truth: the right photo = wide[:, 150:] rotated by M, so a point (u, v) in the right photo came from wide at
M3 = np.vstack([M, [0, 0, 1]])
true_to_wide = np.array([[1, 0, 150], [0, 1, 0], [0, 0, 1]]) @ np.linalg.inv(M3)       # right-photo coordinates -> wide coordinates
pts_right = np.float32([[30, 40], [100, 60], [90, 230], [20, 200]]).reshape(-1, 1, 2)       # points inside the overlap (the left 120 pixels of the right photo)
truth = cv2.perspectiveTransform(pts_right, true_to_wide)                               # where they are in the wide picture = left-photo coordinates
est = cv2.perspectiveTransform(pts_right, H)
print("error in pixels at four test points:", np.round(np.linalg.norm(truth - est, axis=2).ravel(), 2))
```

An error of about one or two pixels is good for 32 matches in a small overlap. More matches, and a final refinement on all inliers, bring it lower. (Points **outside** the overlap would have a larger error: the homography was fitted only on the overlap, and errors grow when you extrapolate.)

## Better blending: multi-band

A feathered blend still blurs detail and can show ghosts where the photos disagree (a moving person). The **multi-band** blend from the pyramid lesson mixes low frequencies over a wide zone and high frequencies over a narrow one, giving a sharp, seamless result. Add **exposure compensation** (match the brightness gains of the images) before blending, and a **seam finder** (a graph cut) to choose a path through the overlap that avoids moving objects.

## OpenCV's high-level Stitcher

All of this is wrapped in `cv2.Stitcher_create()`. It adds **many-image** panoramas with **bundle adjustment** (refining every camera's rotation together), **cylindrical or spherical warping** (so wide panoramas do not stretch at the sides), **seam finding**, **exposure compensation** and **multi-band blending**.

```python run title="cv2.Stitcher (high level)" level=intermediate
import cv2
import numpy as np
import cvlab

wide = cvlab.image("rocket")
parts = [wide[:, :270], wide[:, 150:]]
bgr = [cv2.cvtColor(np.ascontiguousarray(p), cv2.COLOR_RGB2BGR) for p in parts]
stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
status, pano = stitcher.stitch(bgr)
print("status:", status, "(0 = OK)", " result:", None if pano is None else pano.shape)
if status == 0:
    cvlab.show(cv2.cvtColor(pano, cv2.COLOR_BGR2RGB), "Stitched by cv2.Stitcher")
```

## What goes wrong in real panoramas

- **Parallax**: if the camera moved, near and far objects do not line up. Rotate around the camera's optical centre (use a tripod head) or use a more advanced method.
- **Moving objects** create ghosts: use a seam finder, or take the median of several frames.
- **Exposure and white balance** change between shots: compensate gains.
- **Lens distortion** bends straight lines: undistort first (the calibration lessons).
- **Too little overlap** (under about 20–30%) or **no texture** in the overlap: too few matches.
- **Accumulated drift** in long panoramas: use bundle adjustment.

:::interview Questions you may get
- "Walk me through making a panorama." Features, matching with ratio test, RANSAC homography, warp onto a common canvas, blend.
- "When is a homography the right model?" For a planar scene, or when the camera only rotates about its centre.
- "How do you decide the output canvas size?" Transform the corners of each image, take the bounding box, and add a translation so all coordinates are positive.
- "How would you hide the seams?" Exposure compensation plus multi-band blending, and a seam finder to avoid moving objects.
- "What is bundle adjustment's role?" Jointly refine all camera parameters to minimise reprojection errors and remove drift.
:::

```quiz
? When do two photos from a single viewpoint (camera only rotating) relate by a homography?
+ Always, for any scene
- Never
- Only for flat scenes
> A pure camera rotation gives a homography regardless of scene depth.

? How do you choose the canvas size for the stitched picture?
- Use the size of the first image
+ Warp the corners of all images, take their bounding box and shift to positive coordinates
- Use the average size
> Otherwise parts of the warped images would be cut off or placed at negative coordinates.

? What causes ghosting in a panorama?
+ Moving objects, or parallax from camera translation
- JPEG compression
- A large homography
> Different photos disagree in the overlap.

? What is the benefit of multi-band blending over a simple average?
- It is faster
+ Low frequencies blend over a wide zone and high frequencies over a narrow one, giving a sharp, seamless result
- It removes noise
> It uses Laplacian pyramids of the images and Gaussian pyramids of the mask.
```

:::problem Your panorama has a visible line where the two photos meet, and the right photo looks brighter. Which steps do you add? {level=easy tags="stitching,blending"}
Think about exposure and blending.

:::solution Model answer
Add exposure (gain) compensation so that the average brightness in the overlap matches, then blend with feathering or multi-band blending instead of pasting. Also check that the alignment is exact (inlier reprojection error below one pixel) and consider vignetting correction because corners of each photo are darker.
:::
:::

:::keypoints
- Panorama = features → ratio-test matches → RANSAC homography → warp onto a big canvas → blend.
- A homography fits a pure camera rotation or a planar scene.
- Compute the canvas from the warped corners and shift by the minimum coordinates.
- Use exposure compensation and multi-band blending. `cv2.Stitcher` adds bundle adjustment, cylindrical warping and seam finding.
:::

:::resources
- [Brown and Lowe: Automatic Panoramic Image Stitching using Invariant Features (IJCV 2007)](https://link.springer.com/article/10.1007/s11263-006-0002-3) — the method behind modern stitchers.
- [OpenCV: Stitcher class](https://docs.opencv.org/4.x/d2/d8d/classcv_1_1Stitcher.html) — the high-level API.
- [PyImageSearch: Image stitching with OpenCV](https://pyimagesearch.com/2016/01/11/opencv-panorama-stitching/) — a step-by-step walkthrough.
:::
