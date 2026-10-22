---
title: Sharpening and Unsharp Masking
level: easy
time: 25
summary: How "sharpen" really works. Subtract a blurred copy to find the detail, then add some of it back. Unsharp mask, the Laplacian kernel, why sharpening makes noise worse, and why you cannot recover detail that was never captured.
---

A sharp picture has strong, quick changes at the edges. A blurry one has slow, soft changes. To sharpen, we **find the fast changes and make them stronger**.

## The unsharp mask idea

The name is odd. It comes from darkroom photography. The trick works like this:

1. Make a **blurred** copy of the picture. It has the slow, big shapes, but no fine detail.
2. **Subtract** the blurred copy from the original. What is left is **only the detail**: edges and texture.
3. **Add** some of that detail back to the original.

:::formula Unsharp mask
\text{sharp} = \text{img} + \text{amount} \times (\text{img} - \text{blur}(\text{img}))
:::

`amount` (often 0.5 to 2) says how strongly to boost the detail. The blur's σ says which size of detail counts as "detail".

```python run title="Unsharp masking by hand" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("astronaut")
soft = cv2.GaussianBlur(img, (0, 0), 3)                   # a deliberately soft picture
blur = cv2.GaussianBlur(soft, (0, 0), 2)
detail = soft.astype(np.float32) - blur.astype(np.float32)
sharp = np.clip(soft + 1.5 * detail, 0, 255).astype(np.uint8)

# the same thing in one OpenCV call: addWeighted(img, 1+amount, blur, -amount, 0)
sharp2 = cv2.addWeighted(soft, 2.5, blur, -1.5, 0)
print("by hand and addWeighted match:", bool(np.abs(sharp.astype(int) - sharp2.astype(int)).max() <= 1))
cvlab.show(soft, "Soft input", np.clip(detail * 4 + 128, 0, 255).astype(np.uint8), "The detail layer (x4)", sharp, "Sharpened")
```

## Sharpening with a kernel

Unsharp masking can be written as **one** convolution. A common sharpening kernel is:

```text
 0 -1  0
-1  5 -1
 0 -1  0
```

It is the identity (centre 1) plus a **Laplacian** (the "edge" kernel `0 1 0; 1 -4 1; 0 1 0`) with a minus sign. Weights add to 1, so brightness stays the same.

```python run title="Sharpen with a kernel" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("cat")
kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], np.float32)
sharp = cv2.filter2D(img, -1, kernel)
strong = cv2.filter2D(img, -1, np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]], np.float32))
print("kernel sums to:", kernel.sum())
cvlab.show(img, "Original", sharp, "5-kernel", strong, "9-kernel (stronger)")
```

## Why sharpening hurts noise

Noise is made of tiny, very fast changes, exactly what sharpening boosts. So sharpening a noisy picture makes it grainier. In a pipeline, **denoise first, sharpen last**, and always sharpen gently.

Another side effect is **halos**: dark and bright outlines around strong edges, because we pushed the pixels on each side apart. Too much sharpening gives a "crunchy" look.

```python run title="Sharpening amplifies noise" level=intermediate
import cv2
import numpy as np
import cvlab

clean = cvlab.image("camera")
noisy = cvlab.noisy(clean, sigma=10)

def usm(x, amount, sigma=1.5):
    b = cv2.GaussianBlur(x, (0, 0), sigma)
    return cv2.addWeighted(x, 1 + amount, b, -amount, 0)

for amount in (0, 1, 2, 4):
    out = usm(noisy, amount)
    err = np.sqrt(np.mean((out.astype(float) - clean) ** 2))
    print(f"amount {amount}: RMS error to the clean picture {err:5.1f}")
cvlab.show(noisy, "Noisy", usm(noisy, 1), "amount 1", usm(noisy, 4), "amount 4: grainy and haloed")
```

## You cannot recover lost detail

Sharpening **raises the contrast of the detail that is already there**. It cannot create detail that the camera never recorded. A badly out-of-focus picture, or a picture shrunk and enlarged again, stays soft however much you sharpen.

If the blur has a known cause (say, motion in a known direction), you can try to **undo** it. That is called **deconvolution** (Wiener filter, Richardson–Lucy). It works in good conditions but is fragile with noise. Modern **deblurring networks** are far more robust, and **super-resolution networks** *invent* believable detail. Keep the difference in mind: sharpening **amplifies**, deblurring **inverts**, and super-resolution **imagines**.

:::interview Questions you may get
- "How does unsharp masking work?" Subtract a blurred copy to get the detail, add a multiple of it back.
- "Why does sharpening increase noise?" Noise is high-frequency detail, which sharpening boosts.
- "Can you recover a blurred photo?" Only if you know the blur and noise is low (deconvolution). Otherwise use learned deblurring, which guesses.
- "Where would you put sharpening in a pipeline?" Last, after denoising and resizing.
:::

```quiz
? What is the unsharp mask formula?
- img + blur
+ img + amount × (img − blur)
- img − blur
> The difference is the detail layer; you add a multiple of it back.

? You must sharpen and denoise. Which order?
+ Denoise first, then sharpen
- Sharpen first, then denoise
- Order does not matter
> Sharpening first would boost the noise before you can remove it.

? Too much sharpening causes...
- Lower contrast
+ Halos around edges and amplified noise
- Colour changes
> It pushes the two sides of an edge apart.

? Which tool can invent plausible new detail?
- Unsharp masking
- Laplacian kernel
+ A super-resolution network
> Classical sharpening only boosts what exists.
```

:::keypoints
- Sharpen = image + amount × (image − blurred image). It boosts existing fast changes.
- A sharpening kernel has weights adding to 1 (identity plus Laplacian).
- Sharpening amplifies noise and creates halos. Denoise first, sharpen gently and last.
- Sharpening cannot recover detail that was never recorded.
:::

:::resources
- [Cambridge in Colour: Unsharp mask](https://www.cambridgeincolour.com/tutorials/unsharp-mask.htm) — a clear explanation with examples.
- [scikit-image: unsharp_mask](https://scikit-image.org/docs/stable/api/skimage.filters.html#skimage.filters.unsharp_mask) — a ready-made function.
:::
