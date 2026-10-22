---
title: Geometric Transforms — Translate, Rotate, Affine, Perspective
level: easy
time: 40
summary: How to move, rotate, scale, shear and perspective-warp a picture with small matrices. Homogeneous coordinates, degrees of freedom, the order of composition, and the OpenCV functions you use every day.
---

Sometimes you need to **move pixels**: straighten a tilted scan, rotate a photo, cut out a document seen at an angle, or line up two pictures. Each of these is a **geometric transform**. The good news: each one is just a small table of numbers (a matrix).

## What can we do to a flat picture?

Think of the picture as a rubber sheet. From most to least strict:

| Transform | What it keeps | Free numbers (DOF) | Example |
|---|---|---|---|
| **Translation** | Everything (just moves) | 2 | Shift 20 pixels right |
| **Rigid** (rotation + translation) | Lengths and angles | 3 | Turn a part on a table |
| **Similarity** (rigid + scale) | Angles and shapes | 4 | Zoom and rotate |
| **Affine** | Straight lines and **parallel** lines | 6 | Shear, stretch |
| **Projective** (homography) | Only straight lines | 8 | A page photographed at an angle |

**DOF** (degrees of freedom) is the number of values you need to choose. It also tells you **how many point pairs** you need to find the transform: each pair of matching points gives 2 equations. So an affine transform needs 3 point pairs (6 equations), and a homography needs 4 point pairs (8 equations).

## Matrices and homogeneous coordinates

A rotation or a scale is a 2 × 2 matrix multiplication. But a **translation** is an *addition*, which breaks the pattern. A neat trick fixes this: add a third coordinate that is always 1. Then `(x, y)` becomes `(x, y, 1)`, and **every** transform is a matrix multiplication. These are **homogeneous coordinates**.

:::formula Affine transform in homogeneous form
\begin{pmatrix} x' \\ y' \\ 1 \end{pmatrix} = \begin{pmatrix} a & b & t_x \\ c & d & t_y \\ 0 & 0 & 1 \end{pmatrix} \begin{pmatrix} x \\ y \\ 1 \end{pmatrix}
:::

Common building blocks:

- **Translation**: `[1 0 tx; 0 1 ty]`
- **Scale**: `[sx 0 0; 0 sy 0]`
- **Rotation by θ**: `[cos θ  −sin θ; sin θ  cos θ]`
- **Shear in x**: `[1 k 0; 0 1 0]`

The top two rows (a 2 × 3 matrix) are what `cv2.warpAffine` takes. For the projective case the bottom row is `[g h 1]` instead of `[0 0 1]`, and after multiplying you **divide** by the third value: `x' = X/W`, `y' = Y/W`. That division is what creates perspective.

Try it: change the sliders and watch the matrix.

```viz algo=affine title="Move, rotate, scale and shear"
```

## Order matters

Matrix multiplication is **not commutative**. "Rotate, then shift" is different from "shift, then rotate". With column vectors, the matrix **closest to the point** acts first: `M = T · R · S` means scale first, then rotate, then translate.

To rotate about the **centre of the picture** (not the top-left corner): shift the centre to the origin, rotate, shift back: `M = T(c) · R · T(−c)`.

```python run title="Rotate about the centre, in three ways" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("astronaut")
h, w = img.shape[:2]
centre = (w / 2, h / 2)

M = cv2.getRotationMatrix2D(centre, angle=30, scale=0.8)         # 2 x 3 matrix: rotate 30° anticlockwise, shrink to 0.8
print(np.round(M, 3))

# the same matrix, built by hand: T(c) @ R @ S @ T(-c)
a = np.deg2rad(30)
R = np.array([[np.cos(a), np.sin(a), 0], [-np.sin(a), np.cos(a), 0], [0, 0, 1]])     # OpenCV's angle is anticlockwise on screen
S = np.diag([0.8, 0.8, 1])
T = lambda x, y: np.array([[1, 0, x], [0, 1, y], [0, 0, 1]])
mine = T(*centre) @ R @ S @ T(-centre[0], -centre[1])
print("same as getRotationMatrix2D:", bool(np.allclose(mine[:2], M)))

rotated = cv2.warpAffine(img, M, (w, h))
wrong = cv2.warpAffine(img, np.float32([[np.cos(a), np.sin(a), 0], [-np.sin(a), np.cos(a), 0]]), (w, h))   # rotates about the corner (0, 0)
cvlab.show(img, "Original", rotated, "About the centre", wrong, "About the top-left corner (wrong)")
```

## Affine in code

You can give OpenCV the matrix, or give **three point pairs** and let it find the matrix.

```python run title="Affine transform from three point pairs" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("cat")
h, w = img.shape[:2]
src = np.float32([[0, 0], [w - 1, 0], [0, h - 1]])                 # three corners of the picture
dst = np.float32([[40, 30], [w - 60, 10], [10, h - 40]])           # where they should go
M = cv2.getAffineTransform(src, dst)                               # solves for the 6 numbers
warped = cv2.warpAffine(img, M, (w, h), borderValue=(30, 30, 30))
print("2 x 3 matrix:\n", np.round(M, 3))
# check: the three source corners land exactly on the destination points
print("corner (0,0) goes to", np.round(M @ np.array([0, 0, 1]), 2), "(wanted (40, 30))")
cvlab.show(img, "Original", warped, "Affine warp")
```

## Perspective: a flat page seen at an angle

When a flat object (a page, a wall, a table) is photographed from the side, parallel lines seem to meet in the distance. This is **perspective**, and an affine transform cannot describe it. We need the 8-number **homography**. With **four** point pairs we can solve it, then **undo** the perspective and get a "bird's-eye" view.

This is exactly how a **document scanner** works: find the four corners of the page, say they should be the corners of a rectangle, and warp.

```python run title="Straighten a photographed page" level=easy
import cv2
import numpy as np
import cvlab

photo, corners = cvlab.document()                       # a page on a desk, plus its 4 true corners (TL, TR, BR, BL)
print("corners in the photo:\n", np.round(corners, 1))

W, H = 300, 400                                         # the shape we want: a flat 300 x 400 page
target = np.float32([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]])
M = cv2.getPerspectiveTransform(np.float32(corners), target)
flat = cv2.warpPerspective(photo, M, (W, H))
print("homography H:\n", np.round(M, 4))
cvlab.show(photo, "Photo of a page", flat, "Warped to a flat page")
```

Here you can drag the four corners and see the matrix change:

```viz algo=homography title="Drag the corners: a perspective warp"
```

## Going the other way: transform points, not pictures

Often you only need to move a **few points** (the corners of a detected box, the keypoints of a person). `cv2.perspectiveTransform` and `cv2.transform` do that for a list of points.

```python run title="Move points with a homography" level=intermediate
import cv2
import numpy as np

H = np.array([[1.1, 0.1, 20], [0.0, 0.9, 10], [0.0005, 0.0002, 1.0]])
pts = np.float32([[[0, 0]], [[100, 0]], [[100, 100]], [[0, 100]]])       # shape (N, 1, 2): OpenCV's point-list layout
out = cv2.perspectiveTransform(pts, H)
print(np.round(out.reshape(-1, 2), 2))

# by hand: multiply, then divide by the third coordinate
p = np.array([100, 100, 1.0])
q = H @ p
print("by hand:", np.round(q[:2] / q[2], 2))
```

## Inverse and composition

- The matrix that **undoes** a transform is its **inverse**: `np.linalg.inv(H)`.
- Doing transform A then B is `B @ A`.
- `cv2.warpAffine(..., flags=cv2.WARP_INVERSE_MAP)` tells OpenCV your matrix goes from **output to input** instead.

Remember this for later: finding a homography between two photos of the same flat scene is the heart of **panorama stitching**. And the camera lessons build on the same matrices to describe how a 3-D world turns into a picture.

:::interview Questions you may get
- "What is the difference between affine and projective transforms?" Affine keeps parallel lines parallel (6 DOF). Projective keeps only straight lines straight (8 DOF) and needs a division by the third coordinate.
- "How many point correspondences do you need for an affine transform? For a homography?" 3 and 4 (minimum); more are used with least squares or RANSAC for robustness.
- "Why homogeneous coordinates?" So that translation (and projection) become matrix multiplications that can be composed.
- "How do you rotate an image about its centre?" `T(c)·R·T(−c)`, or `cv2.getRotationMatrix2D(centre, angle, scale)`.
- "Is `T·R` the same as `R·T`?" No. Matrix multiplication is not commutative.
:::

```quiz
? How many point pairs are the minimum to find a homography?
- 2
- 3
+ 4
> A homography has 8 free numbers and each pair gives 2 equations.

? Which property does an affine transform keep?
- Angles
+ Parallel lines
- Straight lines only
> Parallel lines stay parallel. A homography keeps only straight lines.

? Why do we add a third coordinate equal to 1?
+ It lets translations be written as matrix multiplications
- It stores colour
- It makes images 3-D
> Homogeneous coordinates make all these transforms composable by multiplication.

? You use warpAffine with a rotation matrix built from the origin. The picture swings out of view. Why?
+ The rotation was about the top-left corner, not the centre
- The picture is too big
- OpenCV rotates the wrong way
> Shift to the centre, rotate, shift back.
```

:::problem You have a photo of a rectangular whiteboard. You know the four corners in the photo. Describe how to produce a flat, front-view picture, and which size you choose for the output. {level=easy tags="homography,perspective"}
Use matrices.

:::solution Model answer
Choose the output size from the real board (for example its true aspect ratio such as 16:9, or estimate it from the average of opposite sides' lengths in the photo). Put the four photo corners in a consistent order (top-left, top-right, bottom-right, bottom-left), define the target rectangle corners `(0,0), (W-1,0), (W-1,H-1), (0,H-1)`, compute `M = cv2.getPerspectiveTransform(src, dst)` and `flat = cv2.warpPerspective(photo, M, (W, H))`. Check the corner order and the output aspect ratio. If the corners are noisy, use more point pairs with `cv2.findHomography` (RANSAC).
:::
:::

:::keypoints
- Transforms are matrices: translation (2 DOF), similarity (4), affine (6), homography (8).
- Homogeneous coordinates (x, y, 1) make them all matrix products. Order matters.
- A homography needs a division by the third coordinate: that creates perspective.
- `getRotationMatrix2D`, `getAffineTransform`, `getPerspectiveTransform` find matrices; `warpAffine` and `warpPerspective` apply them.
- A document scanner is "find four corners, warp to a rectangle".
:::

:::resources
- [OpenCV: geometric transformations of images](https://docs.opencv.org/4.x/da/d6e/tutorial_py_geometric_transformations.html) — scaling, rotation, affine and perspective.
- [Hartley and Zisserman: Multiple View Geometry in Computer Vision](https://www.robots.ox.ac.uk/~vgg/hzbook/) — the standard book on this maths.
- [3Blue1Brown: Linear transformations and matrices](https://www.youtube.com/watch?v=kYB8IZa5AuE) — the intuition behind matrices.
:::
