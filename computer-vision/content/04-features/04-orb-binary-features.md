---
title: ORB and Binary Descriptors — Fast Features
level: intermediate
time: 35
summary: Why binary descriptors are fast, how BRIEF compares pairs of pixels, how ORB adds scale and rotation to FAST and BRIEF, the Hamming distance, and a head-to-head test of ORB, AKAZE and SIFT on the same pair.
---

SIFT is accurate but heavy: 128 floating-point numbers per keypoint and a lot of computation. A phone, a drone or a robot running SLAM at 30 frames per second needs something much lighter. The answer: **binary descriptors**.

## The idea: compare pairs of pixels

A **binary descriptor** is a string of bits (for example 256 bits = 32 bytes). Each bit is the answer to a simple question about two pixels in the patch around the keypoint:

> Is the pixel at position A **darker** than the pixel at position B? (1 = yes, 0 = no)

With 256 such pairs, spread randomly inside the patch, you get 256 bits. Two patches that look alike give mostly the same answers, so their bit strings are similar. This is **BRIEF** (Binary Robust Independent Elementary Features, 2010).

:::analogy
Imagine describing a face by asking 256 yes/no questions such as "is the left cheek brighter than the nose?". Two photos of the same face give nearly the same list of answers. And comparing two lists of yes/no answers is very quick: just count how many answers differ.
:::

## The Hamming distance

To compare two bit strings, count how many bits are **different**. This is the **Hamming distance**. On a computer it is one XOR and one "popcount" instruction. It is **much** faster than computing the Euclidean distance of 128 floats.

```python run title="Hamming distance of binary descriptors" level=easy
import numpy as np

a = np.array([0b10110010, 0b01101100], np.uint8)            # two bytes = 16 bits
b = np.array([0b10100010, 0b01101111], np.uint8)
xor = np.bitwise_xor(a, b)
distance = int(np.unpackbits(xor).sum())                    # count the 1-bits of the XOR
print("a =", np.unpackbits(a))
print("b =", np.unpackbits(b))
print("bits that differ:", distance)
print("same with cv2.norm:", end=" ")
import cv2
print(cv2.norm(a, b, cv2.NORM_HAMMING))
```

## BRIEF is not enough, so ORB

Plain BRIEF has no scale or rotation invariance. **ORB** (Oriented FAST and Rotated BRIEF, 2011) fixes this by combining and improving several pieces:

- **Detector: oFAST.** Run **FAST** on every level of an image **pyramid** (scale), keep the best by Harris score, and compute an **orientation** for each keypoint from the **intensity centroid** of its patch (the direction from the centre to the brightness-weighted centre of mass).
- **Descriptor: rBRIEF.** **Rotate** the BRIEF sampling pattern by the keypoint's orientation (rotation invariance), and use pairs that were chosen by **learning** on data so that the bits are not correlated and have good variance.

It is free (not patented), written for OpenCV, and about **ten times faster** than SIFT with a descriptor 4× smaller.

```python run title="ORB keypoints and binary descriptors" level=easy
import cv2
import numpy as np
import cvlab

gray = cvlab.image("coffee", gray=True)
orb = cv2.ORB_create(nfeatures=500)
kps, desc = orb.detectAndCompute(gray, None)
print("keypoints:", len(kps), "  descriptors:", desc.shape, desc.dtype, "-> 32 bytes = 256 bits each")
k = kps[0]
print(f"first keypoint: ({k.pt[0]:.0f}, {k.pt[1]:.0f})  size {k.size:.0f}  angle {k.angle:.0f}  pyramid level {k.octave}")
print("first descriptor as bits:", "".join(map(str, np.unpackbits(desc[0])))[:64], "...")
vis = cv2.drawKeypoints(cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB), kps, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)
cvlab.show(vis, "ORB keypoints")
```

## Head to head on the same pair

We have a pair of pictures with a **known** true transform, so we can check how many matches are correct. The matcher uses the L2 distance for SIFT and the Hamming distance for the binary features.

```python run title="SIFT vs ORB vs AKAZE on one image pair" level=intermediate
import cv2
import numpy as np
import cvlab

a, b, H = cvlab.warped_pair("coffee")
ga, gb = [cv2.cvtColor(x, cv2.COLOR_RGB2GRAY) for x in (a, b)]

def evaluate(name, detector, norm):
    ka, da = detector.detectAndCompute(ga, None)
    kb, db = detector.detectAndCompute(gb, None)
    matches = cv2.BFMatcher(norm).knnMatch(da, db, k=2)
    good = [m[0] for m in matches if len(m) == 2 and m[0].distance < 0.75 * m[1].distance]
    src = np.float32([ka[m.queryIdx].pt for m in good]); dst = np.float32([kb[m.trainIdx].pt for m in good])
    err = np.linalg.norm(cv2.perspectiveTransform(src[None], H)[0] - dst, axis=1) if len(good) else np.array([])
    correct = int((err < 3).sum())
    print(f"{name:6} keypoints {len(ka):4d}  descriptor {da.shape[1]:3d} x {da.dtype}  good matches {len(good):4d}  correct {correct:4d}  precision {correct / max(len(good), 1):.2f}")

evaluate("SIFT", cv2.SIFT_create(), cv2.NORM_L2)
evaluate("ORB", cv2.ORB_create(nfeatures=1000), cv2.NORM_HAMMING)
evaluate("AKAZE", cv2.AKAZE_create(), cv2.NORM_HAMMING)
evaluate("BRISK", cv2.BRISK_create(), cv2.NORM_HAMMING)
```

On this easy pair all four work well. The differences appear with bigger changes (strong viewpoint change, blur, night images), where SIFT and learned features hold up better. Use `NORM_HAMMING` for binary descriptors and `NORM_L2` for SIFT. **Using the wrong norm is a common bug** and gives meaningless matches.

## Choosing a feature

| Feature | Descriptor | Speed | Robustness | Typical use |
|---|---|---|---|---|
| **SIFT** | 128 floats | slow | best classic | 3-D reconstruction, photogrammetry, offline matching |
| **SURF** | 64/128 floats | medium | good | Patented; rarely used now |
| **ORB** | 256 bits | very fast | good for small changes | Real-time SLAM (ORB-SLAM), mobile apps |
| **BRISK** | 512 bits | fast | good | Embedded |
| **AKAZE** | 486 bits | medium | good, keeps edges | Planar tracking, mapping |
| **SuperPoint, DISK, ALIKED** | learned (256 floats) | needs a GPU or a fast chip | best under big changes | Modern SLAM and SfM |

The rule of thumb: **ORB** if time and power are limited, **SIFT** if you want quality and have time, **learned features** if you have a GPU and hard conditions.

:::interview Questions you may get
- "What is a binary descriptor and why is it fast?" A bit string built by comparing pixel pairs; the Hamming distance is one XOR plus a popcount.
- "How does ORB get rotation invariance?" It computes an orientation by the intensity centroid and rotates the BRIEF sampling pattern.
- "How does ORB get scale invariance?" It runs FAST on every level of an image pyramid.
- "Which distance for ORB descriptors? For SIFT?" Hamming; L2.
- "When would you prefer SIFT over ORB?" Offline, high-accuracy, large viewpoint changes; ORB when real-time matters.
:::

```quiz
? What does a bit in a BRIEF descriptor encode?
- The colour of one pixel
+ Whether one pixel in a chosen pair is brighter than the other
- The gradient direction
> Each bit is the result of one intensity comparison.

? Which distance do you use to match ORB descriptors?
- Euclidean (L2)
+ Hamming
- Cosine
> Count the differing bits.

? How does ORB find the orientation of a keypoint?
- From a Sobel histogram
+ From the intensity centroid of the patch
- From the colour
> The vector from the patch centre to its centre of mass of intensity gives an angle.

? You use NORM_L2 to match ORB descriptors. What happens?
+ Matching still runs but the distances are meaningless, so results are poor
- OpenCV raises an error
- Matching is faster
> Always use NORM_HAMMING for binary descriptors.
```

:::problem A drone must track features at 60 frames per second on a small computer. Choose a feature type and explain the trade-offs. {level=easy tags="orb,real-time,slam"}
Think about speed, memory and robustness.

:::solution Model answer
ORB (or a fast FAST+BRIEF variant): FAST detection on a pyramid and a 256-bit descriptor give good speed and small memory, and Hamming matching is very cheap. Limit the number of keypoints (for example 500–1000) and spread them over a grid so tracking is even. Trade-offs: less robust than SIFT to large viewpoint or lighting changes, so use keyframe-based maps and re-localisation, and combine with an IMU. If a small GPU is available, a learned feature such as SuperPoint can be considered.
:::
:::

:::keypoints
- Binary descriptors store pixel-pair comparisons as bits and compare with the Hamming distance. They are small and very fast.
- ORB = FAST on a pyramid + orientation by intensity centroid + rotated, learned BRIEF.
- Use `NORM_HAMMING` for binary, `NORM_L2` for SIFT.
- ORB for real time, SIFT for quality, learned features for hard conditions.
:::

:::resources
- [Rublee et al.: ORB, an efficient alternative to SIFT or SURF (ICCV 2011)](https://doi.org/10.1109/ICCV.2011.6126544) — the ORB paper.
- [Calonder et al.: BRIEF: Binary Robust Independent Elementary Features](https://www.cs.ubc.ca/~lowe/525/papers/calonder_eccv10.pdf) — the original binary descriptor.
- [OpenCV: ORB tutorial](https://docs.opencv.org/4.x/d1/d89/tutorial_py_orb.html) — code and drawing.
:::
