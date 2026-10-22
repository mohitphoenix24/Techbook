---
title: NumPy for Images — Slicing, Masks and Drawing
level: easy
time: 35
summary: The NumPy skills you use in every vision task. Cropping and flipping with slices, masks and boolean indexing, broadcasting, fast array maths instead of loops, and drawing boxes, circles and text with OpenCV.
---

An image is a NumPy array. So **NumPy is your main image tool.** Most clever "image tricks" are one line of slicing. Learn these few moves well and the rest of the course gets easier.

## Slicing: crop, flip, split

`img[row_start:row_end, col_start:col_end]` cuts a rectangle. It does not copy the pixels. It gives you a **view** of the same memory.

```python run title="Crop, flip and rotate with slicing" level=easy
import numpy as np
import cvlab

img = cvlab.image("astronaut")                    # (384, 384, 3)

face    = img[20:150, 150:280]                    # rows 20..149, columns 150..279
flip_lr = img[:, ::-1]                            # reverse the columns: mirror image
flip_ud = img[::-1]                               # reverse the rows: upside down
small   = img[::4, ::4]                           # every 4th pixel: a crude 4x smaller picture
rot90   = np.rot90(img)                           # turn 90 degrees

print("crop:", face.shape, " small:", small.shape, " rot90:", rot90.shape)
cvlab.show(face, "Crop", flip_lr, "Mirror", flip_ud, "Upside down", small, "Every 4th pixel")
```

Remember: a slice is a **view**. If you change the crop, you change the original.

```python run title="A slice is a view, not a copy" level=easy
import numpy as np

img = np.zeros((4, 4), np.uint8)
view = img[1:3, 1:3]
view[:] = 255                      # writes into img!
print(img)

safe = img[1:3, 1:3].copy()        # an independent copy
safe[:] = 7
print("original unchanged:", img[1, 1])
```

## Channels

```python run title="Work with channels" level=easy
import numpy as np
import cvlab

img = cvlab.image("rocket")
r, g, b = img[..., 0], img[..., 1], img[..., 2]
swapped = img[..., ::-1]                         # reverse channel order: RGB <-> BGR
only_blue = np.zeros_like(img)
only_blue[..., 2] = b                            # keep only the blue channel
print("img[..., 0] is the red channel with shape", r.shape)
cvlab.show(img, "Original", swapped, "Channels reversed", only_blue, "Blue only")
```

`...` (Ellipsis) means "all the other axes". So `img[..., 0]` is the first channel whatever the number of axes.

## Masks: choose pixels by a rule

A **mask** is a true/false image. It says which pixels you want. You make one by comparing: `img > 200` is true where the pixel is brighter than 200. Then you can use it to pick or change pixels.

```python run title="Boolean masks" level=easy
import numpy as np
import cvlab

gray = cvlab.image("coins")                       # grey image
mask = gray > 140                                 # True where bright

print("mask dtype:", mask.dtype, " shape:", mask.shape)
print("how many bright pixels:", int(mask.sum()), "of", mask.size)
print("their average brightness:", gray[mask].mean().round(1))      # boolean indexing picks them out

result = gray.copy()
result[mask] = 255                                # paint them white
result[~mask] //= 2                               # halve the others
cvlab.show(gray, "Original", mask, "Mask", result, "Edited with the mask")
```

## Broadcasting: do maths on the whole image at once

When you combine arrays of different shape, NumPy **stretches** the smaller one to fit. A colour image `(H, W, 3)` times a vector of 3 numbers multiplies every pixel's R, G, B by those numbers.

```python run title="Broadcasting: one line for every pixel" level=easy
import numpy as np
import cvlab

img = cvlab.image("coffee").astype(np.float32)
warm = img * np.array([1.2, 1.0, 0.8], np.float32)          # (H, W, 3) * (3,)
vignette_y = np.hanning(img.shape[0])[:, None]               # (H, 1)
vignette_x = np.hanning(img.shape[1])[None, :]               # (1, W)
fade = (vignette_y * vignette_x)[..., None]                  # (H, W, 1)
out = np.clip(warm * (0.4 + 0.6 * fade), 0, 255).astype(np.uint8)
print("shapes:", warm.shape, fade.shape)
cvlab.show(out, "Warm colour and dark corners")
```

## Vectorise: avoid pixel loops

A Python loop over every pixel is **hundreds of times slower** than the same maths in NumPy or OpenCV, because the array code runs in fast compiled C. In interviews, "I would loop over pixels" is a weak answer. "I would vectorise it" is a strong one.

```python run title="Loop versus vectorised: same answer" level=easy
import numpy as np
import cvlab

gray = cvlab.image("camera")

def brighten_loop(img, k):
    out = np.zeros_like(img)
    for y in range(img.shape[0]):
        for x in range(img.shape[1]):
            out[y, x] = min(255, int(img[y, x]) + k)
    return out

def brighten_fast(img, k):
    return np.clip(img.astype(np.int16) + k, 0, 255).astype(np.uint8)

a, b = brighten_loop(gray, 40), brighten_fast(gray, 40)
print("same result:", bool((a == b).all()))
```

(Try timing both on your own computer with `%timeit`. The vectorised one is usually 100 times faster or more.)

## Drawing with OpenCV

OpenCV can draw lines, rectangles, circles and text **on an image array**. You use it to show detection results. All points are `(x, y)`, and colours follow the channel order of your image (RGB here).

```python run title="Draw boxes, circles, lines and text" level=easy
import cv2
import cvlab

img = cvlab.image("coins").copy()                    # grey image; make it colour so we can draw in colour
img = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)

cv2.rectangle(img, (40, 30), (140, 130), (255, 0, 0), 2)             # top-left, bottom-right, colour, thickness
cv2.circle(img, (250, 80), 40, (0, 255, 0), 3)                       # centre, radius
cv2.line(img, (0, 290), (380, 200), (255, 255, 0), 2)
cv2.putText(img, "coins", (45, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 0, 0), 2, cv2.LINE_AA)
overlay = img.copy()
cv2.rectangle(overlay, (200, 150), (360, 280), (255, 0, 255), -1)    # thickness -1 fills the shape
img = cv2.addWeighted(overlay, 0.3, img, 0.7, 0)                     # blend: semi-transparent fill
cvlab.show(img, "Drawn on the picture")
```

Drawing changes the array **in place**. If you still need the clean picture, draw on a copy.

## Stacking and padding

```python run title="Put pictures together" level=easy
import numpy as np
import cv2
import cvlab

a = cvlab.image("astronaut", size=(160, 160))
b = np.rot90(a).copy()
row = np.hstack([a, b])                                   # side by side (same height)
grid = np.vstack([row, row[:, ::-1]])                     # stacked (same width)
padded = cv2.copyMakeBorder(a, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=(255, 255, 255))
print(row.shape, grid.shape, padded.shape)
cvlab.show(grid, "hstack and vstack", padded, "20-pixel border")
```

:::interview Questions you may get
- "How do you crop an object given its box `(x1, y1, x2, y2)`?" `img[y1:y2, x1:x2]` (rows first). Mention that it is a view.
- "How do you convert an HWC image to CHW for PyTorch?" `img.transpose(2, 0, 1)` (and add a batch axis with `[None]`).
- "How would you set all pixels darker than 50 to zero?" `img[img < 50] = 0`.
- "Why vectorise?" The loop runs in slow Python; array operations run as compiled loops (and can use SIMD).
:::

```quiz
? What does img[:, ::-1] do?
- Flips the picture upside down
+ Mirrors the picture left to right
- Rotates it by 90 degrees
> The second axis (columns) is reversed.

? You change a crop made with img[10:50, 10:50]. What happens to img?
+ The original pixels change too, because a slice is a view
- Nothing, a crop is always a copy
- NumPy raises an error
> Use .copy() when you need an independent array.

? An (H, W, 3) array times an array of shape (3,) does what?
- Raises a shape error
+ Multiplies the R, G and B of every pixel by the three numbers (broadcasting)
- Multiplies only the first row
> The smaller array is stretched over the other axes.

? How do you turn an (H, W, 3) array into the (3, H, W) layout PyTorch expects?
+ img.transpose(2, 0, 1)
- img.reshape(3, H, W)
- img.T
> reshape would scramble the pixels; transpose moves the axes.
```

:::problem You have a detection box (x, y, w, h) and an image. Crop the object, then draw the box on a copy of the image. What are the traps? {level=easy tags="numpy,opencv,basics"}
Think about order of axes, bounds, and copies.

:::solution Model answer
Crop: `crop = img[y:y+h, x:x+w]` (rows are y, columns are x). Draw on a copy: `vis = img.copy(); cv2.rectangle(vis, (x, y), (x+w, y+h), colour, 2)`. Traps: swapping x and y; boxes that go outside the image (clip them with `max(0, ...)` and `min(W, ...)` first, because negative slice indices wrap around); floating-point boxes (convert to `int`); drawing on the original and losing the clean picture; and the crop being a view that you later modify by mistake.
:::
:::

:::keypoints
- `img[y1:y2, x1:x2]` crops (rows first). Slices are views, so copy when you need independence.
- `...`, `[::-1]` and `transpose` move axes. Channel order and layout (HWC versus CHW) matter.
- Masks are boolean arrays. `img[mask]` selects pixels, and `img[mask] = v` edits them.
- Broadcasting applies maths to the whole picture in one line. Vectorise instead of looping over pixels.
- OpenCV drawing uses `(x, y)` points and edits the array in place.
:::

:::resources
- [NumPy: indexing on ndarrays](https://numpy.org/doc/stable/user/basics.indexing.html) — slices, masks and views.
- [NumPy: broadcasting](https://numpy.org/doc/stable/user/basics.broadcasting.html) — the rules, with pictures.
- [OpenCV: drawing functions](https://docs.opencv.org/4.x/dc/da5/tutorial_py_drawing_functions.html) — every shape you can draw.
:::
