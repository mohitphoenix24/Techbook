---
title: Image Files, JPEG and Compression
level: easy
time: 30
summary: Why a photo file is much smaller than its raw numbers. Lossless PNG versus lossy JPEG, what JPEG really does, how to measure quality (PSNR), the generation-loss trap, EXIF rotation, and a first look at how video is compressed.
---

A raw 12-megapixel photo is 36 MB of numbers. A JPEG of it is about 3 MB. Where did the other 33 MB go? This lesson explains it, because compression changes your pixels, and that can quietly hurt your models.

## Lossless and lossy

:::def Lossless compression
The file is smaller, and when you open it you get **exactly the same numbers back**. PNG and TIFF work like this. It is like zipping a file.
:::

:::def Lossy compression
The file is much smaller, but the numbers you get back are **only close** to the original. JPEG, WebP and video codecs work like this. Details your eye does not notice are thrown away.
:::

| Format | Type | Good for | Not good for |
|---|---|---|---|
| PNG | lossless | Masks, labels, screenshots, graphics, anything you will process again | Big photos (large files) |
| JPEG | lossy | Photos you will only look at | Masks and labels, text, repeated editing |
| WebP / AVIF / HEIC | lossy or lossless | Smaller files for web and phones | Tools that do not read them |
| TIFF | lossless | Scientific and medical images, 16-bit | Web |
| RAW (DNG etc.) | sensor data | Photography, calibration, best-quality work | Everyday use |

:::warn Never save masks or labels as JPEG
A segmentation mask stores class numbers like 0, 1, 2. JPEG blurs the edges, creating invented values like 1 or 2 where there should be only 0 or 3. Always use PNG for masks and labels.
:::

## What JPEG does, in five steps

1. Convert RGB to **YCrCb** and shrink the colour channels (chroma subsampling).
2. Cut each channel into **8 × 8 blocks**.
3. For each block, do a **DCT** (discrete cosine transform). It rewrites the 64 pixel values as 64 "wave patterns": a flat average, then slow waves, then fast fine waves.
4. **Quantise**: divide each wave strength by a number and round. The fine waves become zero. This is the step that loses information. The **quality** setting controls how strong it is.
5. Pack the many zeros very efficiently (run-length and Huffman coding).

Because it works on 8 × 8 blocks, strong compression shows **blocky squares** and ringing around sharp edges. Let us see it.

```python run title="JPEG quality versus file size" level=easy
import cv2
import numpy as np
import cvlab

rgb = cvlab.image("astronaut")
bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)            # imencode expects BGR, like imwrite

raw_bytes = rgb.size
print("raw size:", raw_bytes, "bytes")
shots, titles = [], []
for q in (95, 50, 10):
    ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, q])
    back = cv2.cvtColor(cv2.imdecode(buf, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
    mse = np.mean((back.astype(float) - rgb.astype(float)) ** 2)
    psnr = 10 * np.log10(255 ** 2 / mse)
    print(f"quality {q:2d}: {len(buf):6d} bytes  ({raw_bytes / len(buf):4.1f}x smaller)  PSNR {psnr:5.1f} dB")
    shots.append(back); titles.append(f"JPEG quality {q}")

ok, png = cv2.imencode(".png", bgr)
print(f"PNG (lossless): {len(png)} bytes ({raw_bytes / len(png):.1f}x smaller)")
cvlab.show(*shots, titles=titles)
```

**PSNR** (peak signal-to-noise ratio) is a number for "how close is the copy to the original". Higher is better. Above about 40 dB you can hardly see any difference. Below 30 dB you can see damage. (It does not match human taste perfectly. Later we meet SSIM and LPIPS.)

Now look at the damage as a picture. We show the difference, multiplied by 10 so it is visible.

```python run title="What JPEG throws away" level=intermediate
import cv2
import numpy as np
import cvlab

rgb = cvlab.image("cat")
bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 15])
back = cv2.cvtColor(cv2.imdecode(buf, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)
diff = np.abs(back.astype(int) - rgb.astype(int))
print("largest single-pixel change:", int(diff.max()))
print("pixels that changed at all :", round(float((diff.sum(axis=2) > 0).mean()), 3))
cvlab.show(back[60:140, 100:220], "Zoom into the JPEG (see the 8x8 blocks)", np.clip(diff * 10, 0, 255).astype(np.uint8)[60:140, 100:220], "Difference x 10")
```

## The generation-loss trap

Every time you save a JPEG, you lose a little more. Open, edit, save, open, edit, save... and the picture slowly rots. Never use JPEG for the **middle** of a pipeline. Keep PNG or raw arrays inside, and use JPEG only at the end.

```python run title="Save a JPEG 30 times" level=intermediate
import cv2
import numpy as np
import cvlab

rgb = cvlab.image("coffee")
cur = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
for i in range(30):
    ok, buf = cv2.imencode(".jpg", cur, [cv2.IMWRITE_JPEG_QUALITY, 70])
    cur = cv2.imdecode(buf, cv2.IMREAD_COLOR)
final = cv2.cvtColor(cur, cv2.COLOR_BGR2RGB)
mse = np.mean((final.astype(float) - rgb) ** 2)
print("PSNR after 30 saves:", round(10 * np.log10(255 ** 2 / mse), 1), "dB")
cvlab.show(rgb, "Original", final, "After 30 JPEG saves at quality 70")
```

:::tip Compression and machine learning
- **Train and test on the same kind of images.** If the model trains on clean PNGs but sees heavy JPEG in production, accuracy drops. Many teams add "JPEG compression" as a training augmentation.
- **Labels in PNG, always.**
- Resizing then saving as JPEG is fine for the final model input. Saving as JPEG **before** an algorithm that looks at fine detail (edges, noise, calibration) is a mistake.
:::

## EXIF and the rotation trap

Phones store a photo as sensor data and add a note called **EXIF** that says "rotate me 90° when you show me". Some tools obey the note, others do not. So the same file can look upright in one program and sideways in another. OpenCV's `imread` applies the EXIF rotation by default (since version 3.1). PIL does not, unless you call `ImageOps.exif_transpose`. If your labels (boxes) were made in one tool and your training code uses another, the boxes can end up in the wrong place. This is a real, common data bug.

## Bit depth

8 bits per channel gives 256 levels. This is fine to look at. For measuring (medical, depth, HDR, calibration), 12 to 16 bits are used, stored as `uint16`. Remember that `cv2.imread(path)` converts to 8-bit by default. Use `cv2.IMREAD_UNCHANGED` to keep 16 bits.

## A first look at video compression

Video is a stack of pictures (frames), 30 or 60 per second. Storing each as a JPEG would be huge. Video codecs (H.264, H.265, AV1) use the fact that **neighbouring frames are almost the same**.

- An **I-frame** (key frame) is stored as a whole picture.
- A **P-frame** stores only the **change** from an earlier frame: "this block moved 3 pixels right".
- A **B-frame** uses frames before and after.

Why this matters for vision: a video from a camera is heavily compressed, so noise and fine detail are already damaged. Decoding costs time too. If you need every frame precisely (calibration, measurement), record with low compression or as separate lossless images. If you can seek in a video, remember that jumping to frame 1000 means decoding from the last I-frame.

:::interview Questions you may get
- "PNG or JPEG for segmentation masks?" PNG. JPEG creates invented class values at the edges.
- "How does JPEG compress?" Colour conversion and subsampling, 8×8 DCT, quantisation (the lossy step), entropy coding.
- "Our model works on test data but drops in production. What could be different about the images?" Compression level, resolution, colour order, EXIF rotation, camera, lighting. Check the data first.
- "What is PSNR?" 10·log10(255² / MSE). Higher is closer to the original.
:::

```quiz
? Which step of JPEG actually loses information?
- The colour conversion
- The DCT
+ Quantisation (dividing and rounding the wave strengths)
> The DCT can be reversed exactly. Rounding after dividing cannot.

? You save a segmentation mask with labels 0, 1, 2 as a JPEG. What goes wrong?
+ Edges get blurred and new, invented label values appear
- Nothing, JPEG is lossless for small images
- The file becomes larger
> Always save masks and labels as PNG.

? What does a P-frame in a video store?
- A complete picture
+ The change compared with an earlier frame
- The audio track
> This is why video is much smaller than a stack of JPEGs.

? What is the effect of saving a JPEG again and again after small edits?
+ Quality drops a little each time (generation loss)
- Nothing, the second save is free
- The image gets sharper
> Keep lossless data in the middle of your pipeline.
```

:::problem A model trained on clean lab photos does badly on photos from users' phones. List causes related to image files and handling. {level=medium tags="data,compression,debugging"}
Think about what changes between the lab and the world.

:::solution Model answer
Heavier JPEG compression and blocking; different resolution and aspect ratio; EXIF rotation applied or not; BGR versus RGB; different colour profile or white balance; noise from small phone sensors in low light; digital zoom and beauty filters. How to find out: compare image statistics (size, brightness, sharpness) of the two sets, view a grid of failures, and test with the lab photos after simulated JPEG, noise and blur. Fix: train with realistic augmentation (JPEG, blur, noise, colour jitter) and collect some real phone data.
:::
:::

:::keypoints
- Lossless (PNG) keeps every number. Lossy (JPEG) keeps only close numbers and is much smaller.
- JPEG: colour subsampling, 8×8 DCT, quantisation, entropy coding. Heavy use shows blocks.
- Use PNG for masks, labels and anything you will process again. Do not save JPEG in the middle of a pipeline.
- PSNR measures closeness. Beware EXIF rotation and 8-bit conversion.
- Video codecs store key frames plus changes, so video is already compressed and noisy.
:::

:::resources
- [Computerphile: How JPEG works](https://www.youtube.com/watch?v=Kv1Hiv3ox8I) — a very clear video on the DCT idea.
- [OpenCV: imread flags and imwrite parameters](https://docs.opencv.org/4.x/d4/da8/group__imgcodecs.html) — what each flag does.
- [Pillow: ImageOps.exif_transpose](https://pillow.readthedocs.io/en/stable/reference/ImageOps.html) — fixing the rotation trap.
:::
