---
title: What Is an Image? A Grid of Numbers
level: easy
time: 30
summary: A picture is a grid of numbers. Learn the shape of an image array, grey versus colour, the 0–255 range, how big an image is in memory, and the (row, column) versus (x, y) trap that causes bugs in almost every project.
---

Before filters, networks or cameras, you need one simple idea. **An image is a table of numbers.** Everything in this course is arithmetic on that table.

:::def Pixel
Short for "picture element". One small square of the image. A pixel stores a number (grey image) or a few numbers (colour image) that say how bright, or what colour, that square is.
:::

:::analogy
Think of a mosaic made of coloured tiles. From far away you see a picture. Up close you see separate tiles, and each tile has just one colour. A digital image is a mosaic where every tile is a number. A phone photo has about 12 million tiles.
:::

## A grey image

In a grey image, each pixel is one number. **0 is black. 255 is white.** Numbers in between are shades of grey. Why 255? One pixel uses 8 bits (one byte), and 8 bits can hold 256 different values: 0 to 255.

Let us look at a real image as numbers. This picture is the famous "cameraman" photo.

```python run title="Look at the numbers behind a photo" level=easy
import numpy as np
import cvlab

img = cvlab.image("camera")           # a grey photo
print("type  :", type(img).__name__)
print("shape :", img.shape)           # (rows, columns)
print("dtype :", img.dtype)           # uint8 = whole numbers 0..255
print("min/max:", img.min(), img.max())

print("\nThe top-left 6 x 6 pixels:")
print(img[:6, :6])

cvlab.show(img, "The photo")
cvlab.show(img[100:116, 150:166], "A 16 x 16 piece, zoomed so you can see the pixels")
```

Three things to notice:

1. The image is a NumPy array. `shape` is `(400, 400)`: 400 rows and 400 columns. There are 160,000 numbers.
2. `dtype` is `uint8`: *u*nsigned *int*eger, *8* bits. Whole numbers from 0 to 255 only.
3. When we zoom in, the picture is just square blocks. Nothing hides behind them.

## A colour image

A colour pixel needs **three numbers**: how much red, green and blue light. Mix them and you get any colour. Red and green together make yellow. All three at full brightness make white.

So a colour image has one more axis. Its shape is `(height, width, 3)`.

```python run title="One pixel, three numbers" level=easy
import numpy as np
import cvlab

img = cvlab.image("astronaut")
print("shape:", img.shape)            # (rows, columns, channels)

pixel = img[60, 100]                  # row 60, column 100
print("pixel at row 60, col 100 =", pixel, "-> (R, G, B)")

red, green, blue = img[..., 0], img[..., 1], img[..., 2]
print("each channel is its own grey image:", red.shape)
print("average red/green/blue:", red.mean().round(1), green.mean().round(1), blue.mean().round(1))

cvlab.show(img, "Colour image", red, "Red channel", green, "Green channel", blue, "Blue channel")
```

Each **channel** is a grey image. Where the red channel is bright, there is a lot of red light. Look at the skin and the flag: they are bright in the red channel.

:::note Order of channels
This course always uses **R, G, B** order. OpenCV's `cv2.imread` is different: it gives **B, G, R**. This is a famous source of bugs. We cover it in the next lesson. `cvlab.image` already gives you RGB.
:::

## The big trap: (row, column) versus (x, y)

An array is indexed as `img[row, column]`. Rows go **down**, columns go **right**. The origin (0, 0) is the **top-left corner**.

But OpenCV drawing functions, and almost every maths formula, use **(x, y)**. And **x is the column, y is the row**. So the same pixel is written two ways:

| Where | Order | Example for the same pixel |
|---|---|---|
| NumPy indexing | `img[row, col]` = `img[y, x]` | `img[60, 100]` |
| OpenCV points | `(x, y)` = `(col, row)` | `(100, 60)` |
| `img.shape` | `(height, width)` | `(384, 384, 3)` |
| `cv2.resize` size | `(width, height)` | `(200, 100)` |

```python run title="Row/column versus x/y" level=easy
import cv2
import numpy as np
import cvlab

img = np.zeros((100, 200, 3), np.uint8)       # 100 rows (height), 200 columns (width)
print("shape (height, width, channels):", img.shape)

img[20, 150] = (255, 0, 0)                    # row 20, column 150: red pixel (NumPy: row first)
cv2.circle(img, (150, 20), 8, (255, 255, 0), 2)   # centre at x=150, y=20 (OpenCV: x first)
cv2.putText(img, "x=150,y=20", (20, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

cvlab.show(img, "The red pixel sits inside the yellow circle")
small = cv2.resize(img, (100, 50))            # (width, height)
print("after resize((100, 50)):", small.shape)   # note: shape is (50, 100, 3)
```

If the yellow circle had landed somewhere else, we would have mixed up the order. Many "my code draws in the wrong place" bugs are this.

:::warn Common mistake
Writing `cv2.resize(img, (img.shape[0], img.shape[1]))`. `shape[0]` is the **height**, but `resize` wants **(width, height)**. The picture comes out squeezed or stretched. Use `(img.shape[1], img.shape[0])`.
:::

## How big is an image in memory?

An image needs `height × width × channels × bytes per number`.

```python run title="Memory of an image" level=easy
def megabytes(h, w, c=3, bytes_per=1):
    return h * w * c * bytes_per / 1e6

print("1080p colour frame (uint8):", megabytes(1080, 1920), "MB")
print("4K colour frame (uint8)   :", round(megabytes(2160, 3840), 1), "MB")
print("same 4K frame as float32  :", round(megabytes(2160, 3840, bytes_per=4), 1), "MB")
print("1 second of 1080p at 30 fps:", round(30 * megabytes(1080, 1920)), "MB (raw, before compression)")
```

This is why we compress video, why we resize images before feeding a network, and why `float32` copies of big images can fill your memory quickly.

## Other number types

| dtype | Range | Where you see it |
|---|---|---|
| `uint8` | 0 to 255 | normal photos, JPEG, PNG |
| `uint16` | 0 to 65535 | medical scans, depth cameras (millimetres), RAW photos |
| `float32` | any, usually 0.0 to 1.0 | inside neural networks and most maths |
| `bool` | `True` / `False` | masks (which pixels are selected) |

When you convert, remember to scale. A `uint8` image divided by 255 gives a float image in 0..1. Multiplying back by 255 and converting to `uint8` restores it.

```python run title="uint8 to float and back" level=easy
import numpy as np
import cvlab

img = cvlab.image("coffee")
f = img.astype(np.float32) / 255.0                 # 0..1
print("float range:", f.min(), "to", f.max(), f.dtype)

darker = f * 0.5
back = (darker * 255).round().astype(np.uint8)
print("back to uint8:", back.dtype, back.min(), back.max())
cvlab.show(img, "Original", back, "Half as bright")
```

## Explore: see the pixels

Move your mouse over the picture to read the numbers under the cursor. Zoom in to see the pixel grid.

```viz algo=pixels title="Pixel inspector"
```

:::interview Questions you may get
- "What is the shape of a 1080p RGB image in NumPy?" Answer: `(1080, 1920, 3)`. Height first.
- "How much memory does it need as `uint8`? As `float32`?" About 6.2 MB and 24.9 MB.
- "OpenCV says the point is `(x, y)`. NumPy says `[row, col]`. Which is which?" `x` is the column, `y` is the row.
:::

```quiz
? An image has shape (480, 640, 3). How many pixels does it have?
- 3
- 480 × 640 × 3
+ 480 × 640 = 307,200 (each pixel has 3 numbers)
> A pixel is one position. The 3 is the number of channels (numbers) at each position.

? In NumPy, which pixel is img[10, 200]?
- x = 10, y = 200
+ Row 10 (y = 10), column 200 (x = 200)
- The pixel at the bottom-left corner
> NumPy indexes rows first. Rows go down from the top-left origin.

? Which call gives the correct resize to width 300 and height 200?
- cv2.resize(img, (200, 300))
+ cv2.resize(img, (300, 200))
- cv2.resize(img, 300, 200)
> OpenCV size arguments are (width, height).

? A depth camera gives values like 1523 for a pixel. Which dtype is most likely?
- uint8
+ uint16 (for example millimetres)
- bool
> uint8 cannot hold 1523. Depth is often stored as 16-bit integers.
```

:::problem What are the two index orders in image code, and why do they cause bugs? {level=easy tags="basics,opencv,numpy"}
Think about NumPy indexing, OpenCV points, `shape` and `resize`.

:::solution Model answer
NumPy arrays are indexed `[row, column]`, which is `[y, x]`, and `shape` is `(height, width, channels)`. OpenCV functions that take a point or a size use `(x, y)` or `(width, height)`. Mixing them draws things in the wrong place, swaps width and height in `resize`, or crops the wrong area. A good habit: name variables `x`, `y`, `w`, `h` and only convert at the call. Write one small test with a non-square image to catch swaps.
:::
:::

:::keypoints
- An image is an array of numbers. Grey: `(H, W)`. Colour: `(H, W, 3)`.
- `uint8` means 0 to 255. Float images are usually 0 to 1. Convert and scale with care.
- NumPy uses `[row, col]`. OpenCV points use `(x, y)`. `resize` takes `(width, height)`.
- Memory = height × width × channels × bytes. A 4K colour frame is about 25 MB as `uint8` and about 100 MB as `float32`.
:::
