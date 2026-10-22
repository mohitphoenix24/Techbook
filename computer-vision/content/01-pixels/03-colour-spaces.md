---
title: Colour and Colour Spaces (RGB, BGR, HSV, Lab)
level: easy
time: 35
summary: How a computer stores colour, why grey is not a plain average, the BGR trap in OpenCV, and when to use HSV, Lab or YCrCb. You pick a colour out of a photo with a few lines of code.
---

A colour image has three numbers per pixel. But **which** three numbers? There are many ways to describe a colour. Each way is called a **colour space**. The right choice can turn a hard problem into an easy one.

:::def Colour space
A way of describing colour with numbers. RGB uses amounts of red, green and blue light. HSV uses hue (which colour), saturation (how strong) and value (how bright). Same colour, different numbers.
:::

## RGB: the screen's way

Screens and cameras work with red, green and blue light. This is **additive** mixing: more light means brighter. (Paint is the opposite: mixing paint makes it darker.)

| Colour | R | G | B |
|---|---|---|---|
| Black | 0 | 0 | 0 |
| White | 255 | 255 | 255 |
| Red | 255 | 0 | 0 |
| Yellow | 255 | 255 | 0 |
| Grey (mid) | 128 | 128 | 128 |

RGB has one weakness. Brightness is mixed into all three numbers. A red apple in the sun and in the shade have very different R, G and B. If you want "find the red thing", RGB is awkward.

## The BGR trap

:::warn The most famous OpenCV surprise
`cv2.imread` returns the channels in **B, G, R** order, not R, G, B. This is a historical choice. If you show a BGR image with a library that expects RGB (matplotlib, PIL, most web code), the colours look wrong: skin turns blue.
:::

In this course `cvlab.image()` already returns RGB. Here is what the bug looks like.

```python run title="The BGR bug, on purpose" level=easy
import cv2
import cvlab

rgb = cvlab.image("astronaut")
bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)          # what cv2.imread would give you

cvlab.show(rgb, "Correct (RGB shown as RGB)", bgr, "Bug: BGR shown as RGB")
print("pixel in RGB order:", rgb[60, 100])
print("same pixel in BGR order:", bgr[60, 100])
```

The rule: **know the order at every step.** Convert once, at the edges: `cv2.imread` → `COLOR_BGR2RGB` when you load, and `COLOR_RGB2BGR` before `cv2.imwrite`.

## Grey is not a plain average

To make a grey image, we need one brightness number from three. The simple average `(R+G+B)/3` looks wrong, because the eye is not equally sensitive to the three colours. We see green as brightest and blue as darkest. The standard formula weights them:

:::formula Luma (brightness)
Y = 0.299\,R + 0.587\,G + 0.114\,B
:::

```python run title="Grey: average versus the standard formula" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("astronaut")
r, g, b = [img[..., i].astype(np.float32) for i in range(3)]

average = ((r + g + b) / 3).astype(np.uint8)
luma    = (0.299 * r + 0.587 * g + 0.114 * b).round().astype(np.uint8)
cv_gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)           # the same formula, in C++

print("my luma vs OpenCV: biggest difference =", int(np.abs(luma.astype(int) - cv_gray).max()))
cvlab.show(average, "Plain average", cv_gray, "Weighted (OpenCV)")
```

The two results are close, but the weighted one keeps the brightness the way people see it. Always use `cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)`.

## HSV: the colour picker's way

HSV splits colour into three ideas that match how we talk:

- **H, hue**: which colour (red, orange, green, blue...). It sits on a **circle**.
- **S, saturation**: how pure. 0 is grey. 255 is a strong colour.
- **V, value**: how bright. 0 is black.

Now "find the red thing" is easy: pick the hue range of red, and ask for enough saturation and brightness. The shade of the apple only changes V.

:::note OpenCV's HSV numbers
For 8-bit images OpenCV uses **H from 0 to 179** (degrees divided by 2, so it fits in a byte), **S and V from 0 to 255**. Red wraps around: it is near 0 **and** near 179.
:::

Try it. Drag the sliders until only the part you want is white in the mask.

```viz algo=hsvmask title="Pick a colour by hue, saturation and brightness"
```

Here is the same idea in code.

```python run title="Pick a colour with cv2.inRange" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("rocket")
hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)

# the blue sky: hue about 95-125, a reasonably strong colour, not too dark
lower = (95, 90, 60)
upper = (125, 255, 255)
mask = cv2.inRange(hsv, lower, upper)                    # 255 where inside the range, else 0

picked = cv2.bitwise_and(img, img, mask=mask)            # keep only the masked pixels
print("fraction of pixels picked:", round(float((mask > 0).mean()), 3))
cvlab.show(img, "Photo", mask, "Mask", picked, "Picked pixels")
```

`inRange` is a classic tool for finding coloured objects: a ball, a marker, a traffic light, a green screen. It is fast and needs no training. Its weakness: it breaks when the lighting changes a lot. That is when we turn to learned models.

## Lab: colours as people see them

**Lab** (CIE L\*a\*b\*) has one lightness channel L and two colour channels: `a` (green to red) and `b` (blue to yellow). Its special property: the straight-line distance between two Lab colours matches how different they *look* to a person. That makes it the best choice when you must say "how close are these two colours?" (colour transfer, clustering colours, skin-tone checks).

```python run title="Equal RGB steps are not equal-looking steps" level=intermediate
import cv2
import numpy as np

def lab(rgb):
    return cv2.cvtColor(np.uint8([[rgb]]), cv2.COLOR_RGB2LAB)[0, 0].astype(float)

# Each pair is about 20 apart in RGB. Do they look equally different? Lab tries to answer that.
pairs = {
    "green steps up by 20 ": ((0, 120, 0), (0, 140, 0)),
    "blue steps up by 20  ": ((0, 0, 120), (0, 0, 140)),
    "red steps up by 20   ": ((120, 0, 0), (140, 0, 0)),
    "grey steps up by 12  ": ((120, 120, 120), (132, 132, 132)),
}
for name, (a, b) in pairs.items():
    d_rgb = np.linalg.norm(np.array(a, float) - np.array(b, float))
    d_lab = np.linalg.norm(lab(a) - lab(b))
    print(f"{name} RGB distance {d_rgb:5.1f}   Lab distance {d_lab:5.1f}")
```

In RGB all four steps are "about 20 apart". In Lab they are different, because the eye is more sensitive to some changes than to others. Lab distance is a better guess of how different two colours look.

## YCrCb: how JPEG and video store colour

**Y** is brightness (the grey image). **Cr** and **Cb** are two colour-difference channels. Our eyes notice fine detail in brightness much more than in colour. So JPEG and video keep Y at full size and store Cr and Cb at **half the width and height**. This is called **chroma subsampling** (for example 4:2:0). It saves half the data and you rarely notice.

```python run title="Throw away colour detail, keep brightness detail" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("astronaut")
ycc = cv2.cvtColor(img, cv2.COLOR_RGB2YCrCb)
y, cr, cb = cv2.split(ycc)

def blur_down_up(c, f=4):                                   # lose f x f detail
    small = cv2.resize(c, (c.shape[1] // f, c.shape[0] // f), interpolation=cv2.INTER_AREA)
    return cv2.resize(small, (c.shape[1], c.shape[0]), interpolation=cv2.INTER_LINEAR)

lost_colour = cv2.cvtColor(cv2.merge([y, blur_down_up(cr), blur_down_up(cb)]), cv2.COLOR_YCrCb2RGB)
lost_bright = cv2.cvtColor(cv2.merge([blur_down_up(y), cr, cb]), cv2.COLOR_YCrCb2RGB)
cvlab.show(img, "Original", lost_colour, "Colour detail lost (looks fine)", lost_bright, "Brightness detail lost (looks blurry)")
```

## See every channel of every space

```viz algo=channels title="Split a photo into channels in four colour spaces"
```

## Which colour space should I use?

| Task | Good choice | Why |
|---|---|---|
| Show, save, feed a neural network | RGB | Networks are trained on RGB |
| Pick a colour, threshold by colour | HSV | Hue is separate from brightness |
| Compare colours, cluster colours | Lab | Distances match human vision |
| Work on brightness only (edges, corners, SIFT) | Grey (or Y) | One channel is faster and enough |
| Compression, video | YCrCb | Colour can be stored in less detail |

:::interview Questions you may get
- "Why is HSV better than RGB for colour segmentation?" Because lighting changes mostly V, while hue stays about the same.
- "Why does my OpenCV image look blue when I plot it?" It is BGR. Convert with `COLOR_BGR2RGB`.
- "Why are the grey weights 0.299, 0.587, 0.114?" They follow the eye's sensitivity: highest for green, lowest for blue.
- "What is chroma subsampling?" Storing colour at lower resolution than brightness, since eyes notice colour detail less.
:::

```quiz
? You load an image with cv2.imread and show it with matplotlib. The colours look wrong. Why?
- The file is damaged
+ OpenCV gives BGR order and matplotlib expects RGB
- matplotlib only shows grey images
> Convert with cv2.cvtColor(img, cv2.COLOR_BGR2RGB) before plotting.

? Which colour space is best for "find all the red pixels" under changing light?
- RGB
+ HSV
- Grey
> In HSV the colour (hue) is separate from the brightness (value).

? In OpenCV's 8-bit HSV, what is the range of H?
- 0 to 255
+ 0 to 179
- 0 to 360
> Degrees (0-359) are halved so they fit in one byte.

? Why do JPEG and video keep colour at lower resolution than brightness?
- Colour cannot be measured accurately
+ People notice detail in brightness much more than detail in colour
- It makes the file bigger
> This is chroma subsampling, for example 4:2:0.
```

:::problem You must find a red ball in a video with changing light. How would you start, and what could go wrong? {level=easy tags="colour,hsv,segmentation"}
Think about the colour space and about hue wrapping.

:::solution Model answer
Convert each frame to HSV and threshold with `cv2.inRange`. Red wraps around the hue circle, so use **two ranges** (about 0–10 and 170–179) and combine the two masks with OR. Require a minimum saturation and value to ignore grey and dark areas. Clean the mask with morphology (open then close) and take the largest contour. What can go wrong: other red objects, very bright or very dark light, shiny highlights (low saturation), and cameras whose auto white balance shifts the hue. Fixes: fix the exposure and white balance, calibrate the ranges on real footage, or use a learned detector when conditions are not controlled.
:::
:::

:::keypoints
- A colour space is a way to describe colour with three numbers. Pick the one that makes your task easy.
- OpenCV loads images as **BGR**. Convert at the edges of your program.
- Grey = 0.299 R + 0.587 G + 0.114 B. Use `cv2.cvtColor`, not a plain average.
- HSV separates colour from brightness (H 0–179, S and V 0–255). `cv2.inRange` picks colours.
- Lab distances match human perception. YCrCb is how JPEG and video store colour.
:::

:::resources
- [OpenCV: Changing colour spaces](https://docs.opencv.org/4.x/df/d9d/tutorial_py_colorspaces.html) — the official short tutorial with `inRange`.
- [OpenCV: cvtColor and the colour conversion codes](https://docs.opencv.org/4.x/d8/d01/group__imgproc__color__conversions.html) — the exact formulas.
- [Colour science for developers (CIE Lab explained)](https://en.wikipedia.org/wiki/CIELAB_color_space) — background on Lab.
:::
