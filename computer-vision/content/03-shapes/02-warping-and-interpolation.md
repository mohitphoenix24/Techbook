---
title: How Warping Really Works — Inverse Mapping and Interpolation
level: intermediate
time: 30
summary: Why OpenCV looks up where each output pixel comes from, not where each input pixel goes. Forward versus inverse mapping, holes, bilinear interpolation, writing warpAffine yourself, and remap for any custom warp such as lens correction.
---

You know the matrix. Now, how does the computer actually build the new picture? It looks simple: take every pixel, apply the matrix, and put it at the new position. But that simple method has a flaw.

## Forward mapping leaves holes

Suppose we rotate by 30°. We move each **input** pixel `(x, y)` to `(x', y')` and write its colour there. Problems:

- New positions are **not whole numbers**. Which pixel do we write to?
- Some output pixels receive **no** input pixel (holes), and some receive **two** or more.
- If we scale up by 2, only a quarter of the output pixels get written.

```python run title="Forward mapping makes holes" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("astronaut", size=(160, 160), gray=True)
scale = 1.8
out = np.zeros((int(160 * scale), int(160 * scale)), np.uint8)
for y in range(160):
    for x in range(160):
        out[int(y * scale), int(x * scale)] = img[y, x]            # push each input pixel forward
print("output pixels that never got written:", round(float((out == 0).mean()), 2))
cvlab.show(out, "Forward mapping: many black holes")
```

## Inverse mapping: ask "where did you come from?"

The fix: **loop over the output pixels**. For each output position `(x', y')`, apply the **inverse** transform to find the **source position** `(x, y)` in the input, and read the colour there. Every output pixel gets exactly one value. No holes.

The source position is usually **between** pixels (like `(12.3, 40.7)`). So we need **interpolation** to estimate the colour at that in-between place.

:::flow Warping one output pixel
Take an output pixel (x', y') | We want to know its colour.
Apply the inverse matrix | (x, y) = M⁻¹ (x', y'). This is where it came from in the input picture.
Is (x, y) inside the input? | If not, use the border value (black, or reflect, or replicate).
Interpolate | Nearest: round to one pixel. Bilinear: mix the four pixels around it.
Write the colour at (x', y') | Done. Repeat for every output pixel.
:::

## Bilinear interpolation

With a source point `(12.3, 40.7)`, the four neighbours are at columns 12 and 13 and rows 40 and 41. The weights come from how close the point is: `fx = 0.3` in x and `fy = 0.7` in y.

:::formula Bilinear interpolation
v = (1-f_y)\big[(1-f_x)\,v_{00} + f_x\,v_{10}\big] + f_y\big[(1-f_x)\,v_{01} + f_x\,v_{11}\big]
:::

It mixes in x, then in y. It gives smooth results and is the default in OpenCV (`INTER_LINEAR`).

## Write warpAffine yourself

```python run title="warpAffine from scratch (inverse mapping + bilinear)" level=intermediate
import cv2
import numpy as np
import cvlab

def warp_affine(img, M, size):
    W, H = size
    Minv = cv2.invertAffineTransform(M)                        # output -> input
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    sx = Minv[0, 0] * xs + Minv[0, 1] * ys + Minv[0, 2]        # source x for every output pixel, at once
    sy = Minv[1, 0] * xs + Minv[1, 1] * ys + Minv[1, 2]
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = sx - x0, sy - y0
    inside = (x0 >= 0) & (y0 >= 0) & (x0 < img.shape[1] - 1) & (y0 < img.shape[0] - 1)
    x0c, y0c = np.clip(x0, 0, img.shape[1] - 2), np.clip(y0, 0, img.shape[0] - 2)
    v00, v10 = img[y0c, x0c], img[y0c, x0c + 1]
    v01, v11 = img[y0c + 1, x0c], img[y0c + 1, x0c + 1]
    out = (1 - fy) * ((1 - fx) * v00 + fx * v10) + fy * ((1 - fx) * v01 + fx * v11)
    return np.where(inside, out, 0).round().astype(np.uint8)

img = cvlab.image("camera", size=(200, 200), gray=True)
M = cv2.getRotationMatrix2D((100, 100), 25, 0.9)
mine = warp_affine(img, M, (200, 200))
ref = cv2.warpAffine(img, M, (200, 200))
diff = np.abs(mine.astype(int) - ref.astype(int))
print("mean difference to OpenCV:", round(float(diff.mean()), 3), "grey levels")
print("pixels that differ by more than 3:", round(float((diff > 3).mean() * 100), 2), "% (only along the rotated border)")
cvlab.show(img, "Input", mine, "My warp", ref, "cv2.warpAffine")
```

The whole thing is only a few lines because NumPy does the loops for us. The same recipe works for a homography: compute `(X, Y, W) = H⁻¹ (x', y', 1)` and divide.

## Interpolation quality

| Method | Speed | Look |
|---|---|---|
| `INTER_NEAREST` | fastest | Jagged edges, but keeps exact values: use for masks and labels |
| `INTER_LINEAR` | fast | Smooth, a little soft. The default |
| `INTER_CUBIC` | slower | Sharper. May overshoot (ringing) |
| `INTER_LANCZOS4` | slowest | Sharpest, mild ringing |

Warping a picture twice (rotate 30°, then back) makes it a bit softer each time, because every interpolation blurs. **Combine** all transforms into **one** matrix and warp once.

```python run title="Warp once, not twice" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("text")
h, w = img.shape[:2]
M1 = cv2.getRotationMatrix2D((w / 2, h / 2), 20, 1.0)
M2 = cv2.getRotationMatrix2D((w / 2, h / 2), -20, 1.0)
twice = cv2.warpAffine(cv2.warpAffine(img, M1, (w, h)), M2, (w, h))
c1 = np.vstack([M1, [0, 0, 1]]); c2 = np.vstack([M2, [0, 0, 1]])
once = cv2.warpAffine(img, (c2 @ c1)[:2], (w, h))            # identity: nothing to do
sharp = lambda x: float(cv2.Laplacian(x, cv2.CV_64F).var())
print("sharpness  original:", round(sharp(img)), " warped twice:", round(sharp(twice)), " one combined warp:", round(sharp(once)))
```

## remap: any warp you can describe

Sometimes the warp is not a matrix. A **fisheye lens correction**, a "wave" effect, or moving to a polar view all need a different source position for each output pixel. `cv2.remap` takes two arrays, `map_x` and `map_y`, giving for **every output pixel** the source coordinates. It does the interpolation for you.

```python run title="remap: a custom warp" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("astronaut")
h, w = img.shape[:2]
ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)

# a sine "wave" that shifts each row sideways
map_x = xs + 12 * np.sin(ys / 14.0)
map_y = ys
wavy = cv2.remap(img, map_x, map_y, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

# a pincushion/barrel style warp: sample at a radius that depends on the radius
cx, cy = w / 2, h / 2
dx, dy = (xs - cx) / cx, (ys - cy) / cy
r2 = dx ** 2 + dy ** 2
k = 0.35
barrel = cv2.remap(img, (cx + dx * (1 + k * r2) * cx).astype(np.float32), (cy + dy * (1 + k * r2) * cy).astype(np.float32), cv2.INTER_LINEAR)
cvlab.show(img, "Original", wavy, "Sine warp", barrel, "Radial (lens-like) warp")
```

This is exactly how **lens distortion** is removed after calibration: `cv2.undistort` builds the maps once and `remap`s each frame. (The camera lessons come back to this.)

:::interview Questions you may get
- "Why does OpenCV use inverse mapping?" Forward mapping leaves holes and overlaps. Inverse mapping gives every output pixel one value.
- "What is bilinear interpolation?" A weighted average of the four nearest pixels, weights from the fractional position.
- "Why combine transforms into one matrix?" Each warp interpolates and blurs, and one warp is also faster.
- "How would you implement a custom warp, such as undistortion?" Precompute `map_x` and `map_y` and call `cv2.remap`.
:::

```quiz
? Why does forward mapping leave holes?
- The matrix is wrong
+ Not every output pixel receives an input pixel, especially when scaling up or rotating
- Images have missing data
> Inverse mapping fixes this by looping over the output.

? In inverse mapping, what do you do for an output pixel?
+ Apply the inverse transform to find its source position, then interpolate there
- Apply the forward transform to the output
- Average all input pixels
> The source position is usually between pixels, so interpolation is needed.

? Which interpolation keeps label values exact?
- INTER_CUBIC
- INTER_LINEAR
+ INTER_NEAREST
> It copies an existing value, never a mix.

? You must rotate, then scale, then translate a picture. What is best?
- Three separate warps
+ Multiply the matrices and warp once
- Warp in the reverse order
> Fewer interpolations means less blur and less time.
```

:::problem Implement a function that rotates a point list and a picture consistently, and explain what can go wrong with the output size. {level=medium tags="warp,rotation"}
Think about the corners.

:::solution Model answer
Build `M = cv2.getRotationMatrix2D(centre, angle, 1)`. Apply it to the picture with `cv2.warpAffine` and to points with `cv2.transform(pts, M)` (shape `(N,1,2)`). Problem: with the same output size, rotated corners go outside the frame and are cut off. To keep everything, compute the new bounding size `new_w = h·|sin| + w·|cos|`, `new_h = h·|cos| + w·|sin|`, then add `(new_w − w)/2` and `(new_h − h)/2` to the translation part of `M` before warping. Use the same `M` for points so boxes and keypoints stay aligned with the image.
:::
:::

:::keypoints
- Warping uses inverse mapping: for each output pixel, find where it comes from and interpolate. No holes.
- Bilinear interpolation mixes four neighbours. Use nearest for labels.
- Combine transforms into one matrix, then warp once.
- `cv2.remap` applies any per-pixel lookup, such as lens undistortion.
:::

:::resources
- [OpenCV: remap and geometric transformations](https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html) — all warping functions.
- [Wikipedia: Bilinear interpolation](https://en.wikipedia.org/wiki/Bilinear_interpolation) — the formula with a picture.
:::
