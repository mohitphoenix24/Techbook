---
title: Single-Object Tracking — Mean Shift, Correlation Filters, Siamese Networks
level: advanced
time: 50
summary: Follow one object through a video after being told where it is in the first frame. Tracking versus detection, mean shift and CamShift, a MOSSE correlation filter written from scratch (the idea behind KCF and CSRT), the update and drift problem, and modern Siamese and transformer trackers.
---

**Detection** finds objects in each frame independently. **Tracking** follows **one specific object** through time, starting from a box in the first frame. Why track instead of detecting in every frame?

- **Speed**: a tracker is far cheaper than a detector (milliseconds on a CPU).
- **Identity**: it follows *this* object, not "some person".
- **Robustness**: it can ride through frames where the detector misses.
- **Any object**: you can track something no detector was trained for (a box drawn by the user).

The task is called **visual object tracking (VOT)** or **single-object tracking (SOT)**. Many objects at once is **multi-object tracking (MOT)**, in two lessons.

## Mean shift and CamShift: colour tracking

The oldest simple idea: describe the object by its **colour histogram** (in HSV, using the hue). In the next frame, compute for each pixel how well its colour matches the object's histogram (the **back-projection**, a probability map). **Mean shift** moves the window to the **centre of mass** of this map, and repeats until it stops. **CamShift** (continuously adaptive mean shift) also adapts the window size and orientation.

```python run title="CamShift on the red ball" level=intermediate
import cv2
import numpy as np
import cvlab

frames, tracks = cvlab.video(n=45)
x1, y1, x2, y2 = [int(v) for v in tracks["ball"][0]]
roi = frames[0][y1:y2, x1:x2]
hsv_roi = cv2.cvtColor(roi, cv2.COLOR_RGB2HSV)
hist = cv2.calcHist([hsv_roi], [0], None, [30], [0, 180])                    # hue histogram of the ball
cv2.normalize(hist, hist, 0, 255, cv2.NORM_MINMAX)

window = (x1, y1, x2 - x1, y2 - y1)
crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 1)
errors = []
for t in range(1, 45):
    hsv = cv2.cvtColor(frames[t], cv2.COLOR_RGB2HSV)
    prob = cv2.calcBackProject([hsv], [0], hist, [0, 180], 1)                # how ball-like is each pixel
    prob &= cv2.inRange(hsv, (0, 80, 60), (180, 255, 255))                  # ignore grey/dark pixels
    rot_rect, window = cv2.CamShift(prob, window, crit)
    gt = tracks["ball"][t]
    cx, cy = window[0] + window[2] / 2, window[1] + window[3] / 2
    errors.append(np.hypot(cx - (gt[0] + gt[2]) / 2, cy - (gt[1] + gt[3]) / 2))
print("average centre error over 44 frames:", round(float(np.mean(errors)), 1), "pixels   worst:", round(float(np.max(errors)), 1))
vis = frames[44].copy()
cv2.polylines(vis, [cv2.boxPoints(rot_rect).astype(np.int32)], True, (0, 255, 0), 2)
cvlab.show(frames[0], "Frame 0: the ball", prob, "Back-projection at frame 44", vis, "CamShift box at frame 44")
```

It works while the colour of the object is distinct from the background. It fails when other objects have the same colour, or when the lighting changes. Also note that it ignores shape completely.

## Correlation-filter trackers: MOSSE, KCF, CSRT

A much better idea (2010 and later): learn a **filter** `h` that gives a sharp peak (a bright dot) when applied to the object patch, and low values elsewhere. In the next frame, apply the filter around the old position; **the peak shows the new position**. Then **update** the filter with the new appearance.

The trick is how fast this is: filtering is a **convolution**, which becomes a cheap **element-wise multiplication in the Fourier domain** (the fast-filters lesson). The filter can even be **solved in closed form** in the Fourier domain.

:::formula MOSSE filter (in the Fourier domain)
H^{*} = \frac{\sum_i G_i \odot F_i^{*}}{\sum_i F_i \odot F_i^{*} + \lambda}
:::

`F` is the FFT of the patch, `G` the FFT of the desired output (a Gaussian peak at the centre), `⊙` is element-wise product, `*` is the complex conjugate and `λ` stops divisions by zero. **MOSSE** (Bolme et al., 2010) tracks at 600+ frames per second. **KCF** (kernelised correlation filters) adds a kernel trick and multi-channel features (HOG); **CSRT** adds a spatial reliability mask and colour features. Both are in OpenCV contrib (`cv2.TrackerKCF_create`, `cv2.TrackerCSRT_create`). Here is MOSSE from scratch:

```python run title="MOSSE tracker from scratch" level=advanced
import cv2
import numpy as np
import cvlab

def preprocess(patch):                                           # log transform, zero-mean, and a window to reduce edge effects
    p = np.log(patch.astype(np.float32) + 1)
    p = (p - p.mean()) / (p.std() + 1e-5)
    return p * cv2.createHanningWindow(patch.shape[::-1], cv2.CV_32F)

class Mosse:
    def __init__(self, gray, box, lr=0.125, sigma=2.0):
        x1, y1, x2, y2 = [int(round(v)) for v in box]
        self.bw, self.bh = x2 - x1, y2 - y1
        self.w, self.h = 2 * self.bw, 2 * self.bh                # the search patch is twice the object size: the filter also sees some context
        self.cx, self.cy = x1 + self.bw / 2, y1 + self.bh / 2
        self.lr = lr
        gy, gx = np.mgrid[0:self.h, 0:self.w]
        g = np.exp(-((gx - self.w // 2) ** 2 + (gy - self.h // 2) ** 2) / (2 * sigma ** 2))        # desired output: a peak in the centre
        self.G = np.fft.fft2(g)
        rng = np.random.default_rng(0)
        self.A = np.zeros_like(self.G); self.B = np.zeros_like(self.G)
        patch = self.crop(gray)
        for _ in range(8):                                       # train on a few slightly warped copies of the first patch
            M = cv2.getRotationMatrix2D((self.w / 2, self.h / 2), rng.uniform(-8, 8), rng.uniform(0.9, 1.1))
            F = np.fft.fft2(preprocess(cv2.warpAffine(patch, M, (self.w, self.h), borderMode=cv2.BORDER_REFLECT)))
            self.A += self.G * np.conj(F); self.B += F * np.conj(F)

    def crop(self, gray):
        return cv2.getRectSubPix(gray, (self.w, self.h), (self.cx, self.cy))

    def update(self, gray):
        F = np.fft.fft2(preprocess(self.crop(gray)))
        H = self.A / (self.B + 1e-3)
        resp = np.real(np.fft.ifft2(H * F))                      # the filter's response: a peak where the object is
        dy, dx = np.unravel_index(resp.argmax(), resp.shape)
        self.cx += dx - self.w // 2; self.cy += dy - self.h // 2
        Fn = np.fft.fft2(preprocess(self.crop(gray)))            # update the filter with the object's new look
        self.A = (1 - self.lr) * self.A + self.lr * self.G * np.conj(Fn)
        self.B = (1 - self.lr) * self.B + self.lr * Fn * np.conj(Fn)
        return resp.max()

frames, tracks = cvlab.video(n=60)
gray = [cv2.cvtColor(f, cv2.COLOR_RGB2GRAY) for f in frames]
tr = Mosse(gray[0], tracks["box"][0])
errors = []
for t in range(1, 40):
    peak = tr.update(gray[t])
    gt = tracks["box"][t]
    errors.append(np.hypot(tr.cx - (gt[0] + gt[2]) / 2, tr.cy - (gt[1] + gt[3]) / 2))
print("MOSSE on the blue box, 39 frames: mean centre error", round(float(np.mean(errors)), 2), "px  worst", round(float(np.max(errors)), 2), "px")
vis = frames[39].copy()
cv2.rectangle(vis, (int(tr.cx - tr.bw / 2), int(tr.cy - tr.bh / 2)), (int(tr.cx + tr.bw / 2), int(tr.cy + tr.bh / 2)), (0, 255, 0), 2)
cvlab.show(vis, "MOSSE box at frame 39")
```

The peak value of the response (`peak`) is also a **confidence**: when it falls, the object may be occluded or lost. The tracker follows the box through 39 frames with an error of about one pixel, using only a handful of FFTs per frame. Note that the patch is **twice the size of the object**: the filter needs some surrounding context to find a sharp peak, and a patch cut exactly to the object works much worse.

## The update problem: drift

A tracker must **update** its model as the object changes (rotates, changes lighting). But every update can take in a bit of the **background**, and then the model slowly **drifts** away from the object, and the tracker follows something else. This is the central trade-off:

- **Update fast** → adapts to change but drifts easily.
- **Update slowly** → stable but cannot follow big appearance change.

Practical rules: update only when the **confidence is high**; keep the **first frame's appearance** as an anchor; stop updating during occlusion.

## Siamese trackers and transformers

Modern trackers use **deep features**. A **Siamese tracker** (SiamFC, SiamRPN, SiamRPN++, SiamMask) uses one network to embed the **template** (the object from frame 1) and the **search region** (around the last position in the new frame), then **cross-correlates** the two feature maps. The peak is the new location. Training is offline on large datasets, and **no online updating is needed** (so no drift), and it runs at 100+ fps on a GPU. Newer **transformer trackers** (TransT, OSTrack, MixFormer, ARTrack) fuse template and search features with attention. Generalist models (SAM 2) can **track masks** through a video from a click or box.

| Tracker | Type | Notes |
|---|---|---|
| Mean shift, CamShift | Colour histogram | Simple; fragile |
| MOSSE, KCF, CSRT | Correlation filter | Fast on a CPU; CSRT is more accurate; may drift |
| MIL, GOTURN | Online boosting, learned regression | Older; OpenCV has MIL built in |
| SiamFC, SiamRPN++ | Siamese CNN | GPU; strong accuracy-speed balance |
| OSTrack, MixFormer | Transformer | State of the art on benchmarks |
| SAM 2 | Foundation video segmentation | Tracks masks, handles occlusion with memory |

OpenCV ships `TrackerNano` (a tiny Siamese tracker), `TrackerVit` and `TrackerDaSiamRPN`, which need model files you download.

## Evaluation: success and precision

- **Success** plot / **AUC**: the fraction of frames where the **IoU** between the tracker's box and the true box exceeds a threshold, averaged over thresholds.
- **Precision**: the fraction of frames where the centre error is below 20 pixels.
- **Robustness**: how often the tracker fails and must be reinitialised (VOT challenge).
- Benchmarks: OTB, LaSOT, GOT-10k, TrackingNet, VOT.

:::interview Questions you may get
- "Tracking versus detection?" Detection finds all objects of known classes per frame; tracking follows a specific object using its appearance and motion, usually faster, and keeps identity.
- "How does a correlation-filter tracker work?" It learns a filter that outputs a peak on the object, applies it in the next frame (via FFT), takes the peak as the new position and updates the filter.
- "What is tracker drift and how do you reduce it?" The model absorbing background through updates; update slowly or only when confident, keep an anchor template, re-detect.
- "How do Siamese trackers work?" Embed the template and the search region with the same network and cross-correlate; the response peak gives the location; no online update.
- "What do you do when the tracker loses the object?" Use the confidence to detect it, then re-detect with a detector or search a wider area.
:::

```quiz
? Why is a correlation filter fast?
+ Correlation becomes an element-wise product in the Fourier domain
- It uses a GPU
- It tracks only colour
> FFTs make it cheap even for large patches.

? What is tracker drift?
- The camera moving
+ The model slowly absorbing background so it follows the wrong thing
- Motion blur
> Update rarely or only when confident.

? What do Siamese trackers avoid by training offline?
+ The need for online model updates, and hence much drift
- The need for a template
- Using a GPU
> The same network embeds template and search region.

? What does a low peak response in MOSSE suggest?
+ The object may be occluded or lost
- The object is fast
- The filter is perfect
> It is a built-in confidence measure.
```

:::problem A KCF tracker follows a person well until they walk behind a pillar, then it locks onto the pillar. How would you fix this in a product? {level=medium tags="tracking,occlusion,drift"}
Think about confidence and re-detection.

:::solution Model answer
Use the tracker's **confidence** (peak response) to detect the occlusion, freeze model updates and predict motion with a Kalman filter while the confidence is low. Re-detect the person (a person detector plus an appearance embedding that matches the stored identity) near the predicted position and re-initialise the tracker. Keep a gallery of past appearances for re-identification. Alternatively use a tracker designed for long-term tracking (with a re-detection module), a transformer tracker with a memory, or SAM 2, which has an occlusion-aware memory. Measure the improvement on videos with occlusions, not on clean clips.
:::
:::

:::keypoints
- Tracking follows one object from a first-frame box: cheaper than detecting every frame and keeps identity.
- CamShift uses a colour back-projection; MOSSE/KCF/CSRT learn a correlation filter in the Fourier domain and update it; drift is the main risk.
- Siamese and transformer trackers match deep features of a template and the search region, with no online update; SAM 2 tracks masks with memory.
- Use the response peak as a confidence, re-detect after losses, and evaluate with success (IoU) and precision.
:::

:::resources
- [Bolme et al.: Visual Object Tracking using Adaptive Correlation Filters (MOSSE)](https://www.cs.colostate.edu/~draper/papers/bolme_cvpr10.pdf) — the MOSSE paper.
- [Henriques et al.: High-Speed Tracking with Kernelized Correlation Filters](https://arxiv.org/abs/1404.7584) — KCF.
- [Fully-Convolutional Siamese Networks for Object Tracking (SiamFC)](https://arxiv.org/abs/1606.09549) — the Siamese tracker idea.
- [OpenCV: object tracking API](https://docs.opencv.org/4.x/d9/df8/group__tracking.html) — the available trackers.
:::
