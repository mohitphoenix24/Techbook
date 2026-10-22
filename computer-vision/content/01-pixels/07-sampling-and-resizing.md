---
title: Resolution, Aliasing and Resizing
level: easy
time: 35
summary: Why shrinking a picture the wrong way creates fake patterns (aliasing), how nearest, bilinear, bicubic, Lanczos and area interpolation differ, why enlarging cannot add detail, and how to resize correctly for neural networks.
---

Almost every vision pipeline resizes images. A network wants 224 × 224. A screen wants 1920 × 1080. A detector wants to look at the picture at several sizes. Resizing looks trivial. Done carelessly, it silently damages your data.

## Resolution: two meanings

- **Pixel resolution**: how many pixels there are (for example 1920 × 1080).
- **Detail resolution**: how much real detail those pixels capture. A blurry photo can have a million pixels and little detail. Sharp detail needs a good lens, focus and light, not just a high pixel count.

For a robot or an inspection camera, what matters is the **size of one pixel in the real world**. If a camera sees a 300 mm wide table with 1500 pixels, each pixel is 0.2 mm. To find a 0.1 mm scratch, this camera is not enough, however nice the software is.

## Sampling and aliasing

A camera **samples** the world: it measures light at a grid of points. If the world has fine detail finer than the grid, something odd happens. The fine pattern shows up as a **different, false pattern**. This is **aliasing**.

:::analogy
In films, a car wheel sometimes seems to turn slowly backwards. The camera takes 24 pictures per second, but the spokes pass faster than that. The camera cannot keep up, so it records a false, slower motion. Space works the same way: a fine striped shirt on TV makes strange waves (moiré). Too few samples create fake patterns.
:::

The rule (Nyquist): to capture a pattern you need **at least two samples per cycle**. A pattern with a stripe every 2 pixels is the finest one a grid can hold. Finer than that, and it is lost or turns into fake waves.

The fix is simple: **blur first, then shrink.** Blurring removes the fine detail that the smaller grid cannot hold, so it cannot turn into fake patterns. This is called **low-pass filtering** before **downsampling**.

```python run title="Shrinking: wrong way and right way" level=easy
import cv2
import numpy as np
import cvlab

# a pattern with very fine stripes, finer than a 1/4-size picture can hold
size = 256
x = np.arange(size)
stripes = 127 + 127 * np.sin(2 * np.pi * 0.45 * x ** 2 / (2 * size))      # stripes get finer to the right
img = np.tile(stripes, (size, 1)).astype(np.uint8)

nearest = cv2.resize(img, (64, 64), interpolation=cv2.INTER_NEAREST)     # picks single pixels: aliasing
area    = cv2.resize(img, (64, 64), interpolation=cv2.INTER_AREA)        # averages blocks: correct

print("original  mean/std:", img.mean().round(1), img.std().round(1))
print("nearest   mean/std:", nearest.mean().round(1), nearest.std().round(1))
print("area      mean/std:", area.mean().round(1), area.std().round(1))
cvlab.show(img, "Original (stripes get finer to the right)", nearest, "Nearest: fake slow stripes", area, "Area: smooth grey where detail is lost")
```

Look at the right side. In the nearest-neighbour result you see broad **fake stripes** that do not exist in the original. In the area result, detail too fine to keep fades to grey, which is honest.

## Interpolation methods

When you resize, new pixel positions fall **between** the old ones. Interpolation decides the new value.

| Method (OpenCV flag) | How it works | Speed | Best for |
|---|---|---|---|
| `INTER_NEAREST` | Copy the closest pixel | fastest | Masks and labels (never invents new values) |
| `INTER_LINEAR` | Mix the 4 nearest pixels | fast | General purpose, the default |
| `INTER_CUBIC` | Mix 16 pixels with a smooth curve | slower | Enlarging photos, a bit sharper |
| `INTER_LANCZOS4` | Mix 64 pixels with a sinc curve | slowest | Highest-quality enlarging |
| `INTER_AREA` | Average all the old pixels under each new pixel | fast | **Shrinking** |

Rules of thumb: **shrinking → `INTER_AREA`. Enlarging → `INTER_LINEAR` or `INTER_CUBIC`. Masks → `INTER_NEAREST`.**

:::warn Not all libraries are careful
OpenCV's `INTER_LINEAR` does **not** blur before shrinking, so it aliases when you shrink by a large factor. `PIL.Image.resize` does (it widens its filter automatically). PyTorch's `F.interpolate(mode="bilinear")` does not, unless you pass `antialias=True`. This difference has caused real accuracy gaps between "the same preprocessing" in training and in production.
:::

```python run title="Compare interpolation methods on a small crop" level=easy
import cv2
import cvlab

img = cvlab.image("text")                              # grey picture of text
crop = img[20:60, 30:110]
big = {}
for name, flag in [("NEAREST", cv2.INTER_NEAREST), ("LINEAR", cv2.INTER_LINEAR), ("CUBIC", cv2.INTER_CUBIC), ("LANCZOS4", cv2.INTER_LANCZOS4)]:
    big[name] = cv2.resize(crop, None, fx=5, fy=5, interpolation=flag)
cvlab.show(*big.values(), titles=list(big))
print("crop", crop.shape, "->", big["CUBIC"].shape)
```

Enlarging **never adds detail**. It only fills the gaps smoothly. If you need real extra detail you must use a different tool: a better camera, or a learned super-resolution model (a later lesson), which *guesses* plausible detail.

## Image pyramids (a preview)

Detectors often need to look at a picture at several sizes: a face can be big or small. A **pyramid** is a stack of copies, each half the size of the one before. We build it by "blur, then drop every second pixel" over and over. OpenCV does both steps in `cv2.pyrDown`. You will use pyramids in feature detection (SIFT), optical flow and blending.

```python run title="A Gaussian pyramid" level=easy
import cv2
import cvlab

level = cvlab.image("camera")
pyramid = [level]
for _ in range(3):
    level = cv2.pyrDown(level)                  # blur, then keep every 2nd row and column
    pyramid.append(level)
print([p.shape for p in pyramid])
cvlab.show(*pyramid, titles=[f"level {i}" for i in range(len(pyramid))])
```

## Resizing for neural networks

Networks usually want a fixed size. You have three options when the picture has a different shape:

1. **Stretch** to the target size (aspect ratio changes). Simple. Objects look squashed. OK for many classifiers.
2. **Resize the short side, then centre-crop.** What ImageNet models do (resize to 256, crop 224). You may cut off the object.
3. **Letterbox**: resize so the long side fits, and pad the rest with grey. Nothing is cut and shapes stay true. This is what YOLO does.

```python run title="Letterbox: fit inside a square, keep the shape" level=intermediate
import cv2
import numpy as np
import cvlab

def letterbox(img, size=256, pad_value=114):
    h, w = img.shape[:2]
    scale = size / max(h, w)
    nh, nw = round(h * scale), round(w * scale)
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    out = np.full((size, size, 3), pad_value, np.uint8)
    top, left = (size - nh) // 2, (size - nw) // 2
    out[top:top + nh, left:left + nw] = resized
    return out, scale, (left, top)

img = cvlab.image("rocket")                       # 280 x 420
boxed, scale, offset = letterbox(img)
print("input", img.shape, "-> output", boxed.shape, "scale", round(scale, 3), "offset (x, y)", offset)

# a box found in the letterboxed picture must be mapped back to the original picture:
x1, y1 = 100, 120                                  # a point in the 256 x 256 picture
print("maps back to the original at", ((x1 - offset[0]) / scale, (y1 - offset[1]) / scale))
cvlab.show(img, "Original", boxed, "Letterboxed to 256 x 256")
```

Do not forget the last step. After the network finds boxes, you must **undo** the scale and the padding to draw them on the original. Forgetting this is the number one cause of "my boxes are shifted".

:::interview Questions you may get
- "What is aliasing and how do you avoid it when downsampling?" False patterns from sampling too coarsely. Low-pass (blur) before subsampling, or use area interpolation.
- "Which interpolation for masks?" Nearest neighbour, so no new labels appear.
- "Training used PIL resize, serving uses OpenCV resize. Is that a problem?" Yes. The filters differ, so inputs differ a little, and accuracy can drop. Use the same function in both.
- "How do you map detections back after letterboxing?" Subtract the padding offset, then divide by the scale.
:::

```quiz
? Why do we blur before shrinking an image a lot?
- To make the file smaller
+ To remove fine detail that the smaller grid cannot hold, so it does not become false patterns
- To make colours stronger
> This is the low-pass step before downsampling.

? Which interpolation is the right choice for resizing a segmentation mask?
- INTER_CUBIC
- INTER_LANCZOS4
+ INTER_NEAREST
> Other methods create in-between values that are not valid class labels.

? You enlarge a 100 x 100 photo to 400 x 400 with bicubic interpolation. What has been added?
- New real detail
+ Smooth in-between values only; no new detail
- Colour information
> To add plausible detail you need super-resolution models, which guess it.

? What does a letterbox resize do?
+ Fits the whole picture inside the target size and pads the rest, keeping the aspect ratio
- Crops the centre of the picture
- Stretches the picture to the target size
> After detection you must remove the padding and the scale to get boxes on the original.
```

:::problem Your detector's boxes are all shifted and a bit too small on the original image. The pipeline is: letterbox to 640×640, run the model, draw. What did you forget? {level=easy tags="resize,detection,debugging"}
Think about what the model's coordinates refer to.

:::solution Model answer
The model's boxes are in the letterboxed 640×640 picture. To draw on the original you must (1) subtract the left and top padding, (2) divide by the scale factor `640 / max(h, w)`, and (3) clip to the original image size. Boxes look "too small and shifted" because you are drawing 640-space coordinates on a bigger picture. Also check the x/y order and that the same scale is used for width and height.
:::
:::

:::keypoints
- Sampling too coarsely makes false patterns (aliasing). Blur (low-pass) before shrinking.
- Shrink with `INTER_AREA`. Enlarge with `INTER_LINEAR` or `INTER_CUBIC`. Use `INTER_NEAREST` for masks.
- Enlarging never adds real detail.
- Libraries differ in how they resize (PIL, OpenCV, PyTorch). Use the same one in training and serving.
- Letterbox keeps shapes. Always map predictions back by undoing padding and scale.
:::

:::resources
- [OpenCV: geometric transformations (resize and interpolation flags)](https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html) — all the flags.
- [Richard Zhang: Making Convolutional Networks Shift-Invariant Again](https://arxiv.org/abs/1904.11486) — aliasing inside CNNs.
- [On Aliased Resizing and Surprising Subtleties in GAN Evaluation](https://arxiv.org/abs/2104.11222) — shows how different libraries disagree.
:::
