---
title: OpenCV Gotchas Every Engineer Hits
level: easy
time: 30
summary: The small mistakes that cost hours. BGR order, uint8 overflow, (x, y) versus (row, column), views versus copies, dtype and range surprises, imread returning None, channel layout for PyTorch, and a cheat sheet to keep.
---

OpenCV is powerful and old, and it has habits that surprise everyone. Interviewers like to ask about these because only people who have really used OpenCV know them. Each item here has a short demo.

## 1. BGR, not RGB

`cv2.imread` and `cv2.VideoCapture` give **B, G, R**. `cv2.imwrite` and `cv2.imshow` expect BGR. Almost everything else (matplotlib, PIL, PyTorch models, web) uses RGB. Convert at the edge of your program, once.

```python run title="Convert at the edges" level=easy
import cv2
import numpy as np
import cvlab

rgb = cvlab.image("astronaut")
bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)       # = rgb[..., ::-1]
print("same thing with slicing:", bool((bgr == rgb[..., ::-1]).all()))
# Drawing colours follow the order of the array you draw on: (255, 0, 0) is RED on an RGB array, BLUE on a BGR array.
cv2.rectangle(rgb, (10, 10), (60, 60), (255, 0, 0), 3)
cvlab.show(rgb, "(255, 0, 0) drawn on an RGB array is red")
```

## 2. uint8 overflow: 250 + 10 is 4

NumPy `uint8` **wraps around**. OpenCV's own functions **saturate** (clip at 0 and 255). Same arithmetic, different result.

```python run title="Wrap-around versus saturation" level=easy
import cv2
import numpy as np

a = np.array([[250, 100]], np.uint8)
b = np.array([[10, 10]], np.uint8)
print("numpy  a + b      :", a + b)                 # 250 + 10 wraps to 4
print("cv2.add(a, b)     :", cv2.add(a, b))         # saturates at 255
print("numpy  a - 200    :", a - np.uint8(200))     # 100 - 200 wraps to 156
print("cv2.subtract      :", cv2.subtract(a, np.full_like(a, 200)))    # clips at 0

# the safe NumPy way: widen, calculate, clip, narrow
safe = np.clip(a.astype(np.int16) + b, 0, 255).astype(np.uint8)
print("widened and clipped:", safe)
```

A classic bug: `img + 50` to brighten. Bright pixels wrap to near-black and you get strange dark spots. Use `cv2.add`, or widen first.

## 3. (x, y) versus (row, column) — again

Covered in lesson 2, but it deserves a second warning. Points and sizes in OpenCV calls are `(x, y)` and `(width, height)`. Array shapes and indices are `(row, col)` and `(height, width)`.

## 4. Views, copies and in-place drawing

Slices are views. Drawing functions modify the array in place. Together they cause "my original image has a rectangle on it" bugs.

```python run title="The original picture got drawn on" level=easy
import cv2
import numpy as np

img = np.zeros((50, 50, 3), np.uint8)
alias = img                    # not a copy: the same array
crop = img[:25, :25]           # a view
cv2.rectangle(alias, (5, 5), (20, 20), (255, 255, 255), -1)
print("original now has white pixels:", bool(img.any()))
print("the crop sees them too      :", bool(crop.any()))
clean = np.zeros((50, 50, 3), np.uint8)
safe = clean.copy()
cv2.rectangle(safe, (5, 5), (20, 20), (255, 255, 255), -1)
print("copy drawn on, original clean:", not clean.any())
```

## 5. imread returns None, silently

If the path is wrong, `cv2.imread` does **not** raise an error. It returns `None`. Then the next line fails with a confusing message such as `'NoneType' object has no attribute 'shape'`. Always check.

```python run title="Check what imread gives you" level=easy
import cv2

img = cv2.imread("this_file_does_not_exist.jpg")
print("imread returned:", img)
if img is None:
    print("-> file missing, wrong path, or unreadable format")
```

(In the browser there are no files, so you see this result. On your computer, a wrong path gives the same `None`.) A related trap: on Windows, paths with non-English characters can fail. Reading the bytes yourself with `np.fromfile` and `cv2.imdecode` is the robust way.

## 6. Data types: float64, ranges, and what each function wants

- Many OpenCV functions accept `uint8`, `uint16`, `float32` but **not `float64`** (or `int64`). If you get a cryptic assertion like `depth == CV_8U || depth == CV_32F`, check `img.dtype`.
- **Range matters.** A float image shown or saved as if it were 0..255 looks white or black. Float images are expected in 0..1 (for display tools) or in whatever range you chose. Say it out loud: "this array is `float32` in 0..1".
- HSV hue is 0–179 for `uint8`, but 0–360 for `float32` images. This surprises people who change dtype.

```python run title="Float versus uint8 hue" level=intermediate
import cv2
import numpy as np

pure_green = np.uint8([[[0, 255, 0]]])                     # one RGB pixel
hsv8 = cv2.cvtColor(pure_green, cv2.COLOR_RGB2HSV)
hsv32 = cv2.cvtColor(pure_green.astype(np.float32) / 255, cv2.COLOR_RGB2HSV)
print("uint8   HSV:", hsv8[0, 0])            # hue 60 (degrees / 2)
print("float32 HSV:", hsv32[0, 0])           # hue 120 (degrees)
```

## 7. Channel layout: HWC versus CHW

OpenCV and NumPy images are **H × W × C** (channels last). PyTorch wants **C × H × W** (channels first), usually with a batch axis in front: **N × C × H × W**. And a float range of 0..1, often followed by mean and standard-deviation normalisation.

```python run title="Prepare an image for PyTorch (done by hand)" level=easy
import numpy as np
import cvlab

img = cvlab.image("cat")                               # HWC, uint8, RGB
x = img.astype(np.float32) / 255.0                     # 0..1
mean = np.array([0.485, 0.456, 0.406], np.float32)     # the usual ImageNet statistics
std  = np.array([0.229, 0.224, 0.225], np.float32)
x = (x - mean) / std                                   # per-channel normalise (broadcast over H and W)
x = x.transpose(2, 0, 1)[None]                         # HWC -> CHW, then add a batch axis
print("model input shape:", x.shape, x.dtype)
print("channel means after normalising:", x.mean(axis=(0, 2, 3)).round(2))
```

Getting any one of these wrong (BGR, 0..255, no normalisation, HWC) does not crash the model. It just quietly gives worse results. When a model "works but is poor", check the preprocessing **first**.

## 8. Other habits worth knowing

- `cv2.imshow` needs a window system. It does not work in notebooks, servers or this browser. Use matplotlib, `cvlab.show`, or save the picture.
- `cv2.waitKey(0)` is needed after `imshow`, or the window never appears.
- OpenCV uses all CPU cores for some functions. On a busy server call `cv2.setNumThreads(n)`.
- A video file that will not open usually lacks the right codec, not a wrong path. Try `cap.isOpened()` and a different backend.
- Contours, `findContours`, `warpAffine` and friends have changed their return values between OpenCV versions (3.x returned three values, 4.x returns two). Check your version.

## Cheat sheet

| Trap | Safe habit |
|---|---|
| BGR | Convert once at load and once at save |
| `uint8` wrap-around | `cv2.add`, or widen to `int16`/`float32` and clip |
| `(x, y)` vs `[row, col]` | Name variables `x, y, w, h`; test with a non-square image |
| Views and in-place drawing | `.copy()` before drawing or editing |
| `imread` returns `None` | `assert img is not None` |
| Wrong dtype | `.dtype` before every OpenCV call; avoid `float64` |
| Value range | State "float32, 0..1" in a comment |
| HWC vs CHW | `transpose(2, 0, 1)` only at the model boundary |

:::interview Questions you may get
- "What happens if you add two uint8 images with `+`? With `cv2.add`?" Wrap-around versus saturation.
- "Why might `cv2.imread` followed by `img.shape` crash?" The path was wrong and `imread` returned `None`.
- "A model works in your notebook but is worse in production. What do you check in preprocessing?" Channel order, scaling to 0..1, normalisation, resize method, EXIF rotation, aspect ratio handling.
:::

```quiz
? What does np.uint8(250) + np.uint8(10) give in NumPy?
- 255
+ 4
- 260
> uint8 wraps around modulo 256. cv2.add would give 255.

? Which line brightens a uint8 image safely?
- img + 50
+ cv2.add(img, 50) (or widen to int16, add, clip)
- img * 1.2 without converting
> Plain + wraps around, and multiplying by a float needs a cast back to uint8.

? Your cv2.imread call returns None. Most likely reason?
- The image is too large
+ The path is wrong or the file cannot be read
- The image is grey
> imread does not raise an error. Check for None.

? A PyTorch model gets an HWC uint8 image in 0..255 and gives odd results. What is missing?
+ Convert to CHW, scale to 0..1 float, normalise with the training mean and std
- Nothing is missing
- Only a batch axis
> Models fail quietly on wrong preprocessing.
```

:::keypoints
- OpenCV is BGR. Convert at the edges only.
- `uint8` math wraps in NumPy and saturates in OpenCV. Widen and clip when in doubt.
- Slices are views; drawing is in place. Copy before you modify.
- `imread` returns `None` on failure. Check dtype and range before every call.
- For PyTorch: RGB, float 0..1, normalised, CHW, with a batch axis. Check preprocessing first when a model is poor.
:::

:::resources
- [OpenCV Python tutorials: core operations](https://docs.opencv.org/4.x/d7/d16/tutorial_py_table_of_contents_core.html) — basic operations and performance tips.
- [OpenCV: arithmetic operations on images](https://docs.opencv.org/4.x/d0/d86/tutorial_py_image_arithmetics.html) — saturation explained.
- [torchvision transforms: Normalize and ToTensor](https://docs.pytorch.org/vision/stable/transforms.html) — what the standard preprocessing does.
:::
