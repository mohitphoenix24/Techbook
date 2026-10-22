---
title: Background Subtraction
level: intermediate
time: 40
summary: With a fixed camera, learn what the empty scene looks like and flag everything that differs. Running average, Gaussian mixture models (MOG2), shadows, the learning rate, cleaning the mask, and when this method fails.
---

A fixed camera watches a corridor, a road or a conveyor. Most of the picture never changes: the **background**. The interesting things (people, cars, parts) are the **foreground**. **Background subtraction** builds a model of the background and marks every pixel that does not fit it as foreground.

It is cheap and needs **no training data and no labels**, so it is a classic first step for traffic counting, people counting, intruder alarms and checking whether a conveyor slot is full.

## Idea 1: the average of past frames

The simplest background is the **running average**: each new frame updates the background a little.

:::formula Running-average background
B_t = (1 - \alpha)\,B_{t-1} + \alpha\,F_t
:::

`α` (the **learning rate**, for example 0.02) controls how fast the background adapts. Foreground = pixels where `|F_t − B_t|` is large. A small `α` is stable but slow to adapt to lighting changes; a big `α` adapts fast but **absorbs slow or stopped objects into the background**.

```python run title="Running-average background" level=easy
import cv2
import numpy as np
import cvlab

frames, tracks = cvlab.video(n=60)
gray = [cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_RGB2GRAY), (5, 5), 0).astype(np.float32) for f in frames]

alpha = 0.05
bg = gray[0].copy()
for t in range(1, 40):
    fg_mask = (np.abs(gray[t] - bg) > 18).astype(np.uint8) * 255                     # differs a lot from the background
    cv2.accumulateWeighted(gray[t], bg, alpha)                                      # then update the background slowly
fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
n, _, stats, _ = cv2.connectedComponentsWithStats(fg_mask)
print("foreground blobs at frame 39 (area > 100):", sum(1 for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > 100), " (3 objects are in the scene)")
cvlab.show(frames[39], "Frame 39", bg.astype(np.uint8), "Learned background", fg_mask, "Foreground mask")
```

Notice that the learned background has faint "ghosts" where objects passed; they fade with time (larger `α`, faster).

## Idea 2: a model per pixel (Gaussian mixtures)

Real backgrounds are not static: leaves move, water ripples, a screen flickers, lighting drifts. A single average per pixel cannot describe "this pixel is sometimes green (leaf) and sometimes blue (sky)". **MOG2** (Mixture of Gaussians, Zivkovic) keeps for **every pixel** a **mixture of a few Gaussians**, each with a mean, a variance and a weight. A new value is background if it matches one of the heavy Gaussians. The mixture adapts online. OpenCV also has **KNN**-based subtraction.

```python run title="MOG2 background subtractor" level=easy
import cv2
import numpy as np
import cvlab

frames, tracks = cvlab.video(n=60)
mog = cv2.createBackgroundSubtractorMOG2(history=100, varThreshold=25, detectShadows=True)
for t, f in enumerate(frames[:45]):
    mask = mog.apply(f, learningRate=-1)                          # -1: automatic learning rate

print("mask values:", np.unique(mask).tolist(), "  (0 background, 127 shadow, 255 foreground)")
clean = cv2.threshold(mask, 200, 255, cv2.THRESH_BINARY)[1]       # drop the shadow pixels (127)
clean = cv2.morphologyEx(clean, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
clean = cv2.morphologyEx(clean, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
contours, _ = cv2.findContours(clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
boxes = [cv2.boundingRect(c) for c in contours if cv2.contourArea(c) > 150]
vis = frames[44].copy()
for x, y, w, h in boxes:
    cv2.rectangle(vis, (x, y), (x + w, y + h), (0, 255, 0), 2)
print("objects found at frame 44:", len(boxes))
cvlab.show(frames[44], "Frame 44", mask, "MOG2 mask (grey = shadow)", vis, "Boxes from the cleaned mask")
```

Key parameters:

| Parameter | Meaning |
|---|---|
| `history` | How many frames the model remembers (longer = more stable, slower to adapt) |
| `varThreshold` | How different from the background (in standard deviations squared) counts as foreground. Lower finds more, with more noise |
| `detectShadows` | Marks shadows as grey (127), so you can drop them |
| `learningRate` | 0 freezes the model, 1 forgets everything every frame; -1 chooses automatically |

## From mask to objects

The raw mask is noisy. The usual cleaning pipeline:

1. **Threshold** the mask to remove shadow values.
2. **Morphological open** (remove specks) and **close** (fill holes).
3. **Connected components** or **contours**, then filter by **area**.
4. **Bounding boxes** and centres as detections, which can be passed to a **tracker** (a later lesson).

## When it fails

| Problem | What happens | Fix |
|---|---|---|
| **Camera moves** (handheld, drone, PTZ) | Everything is "foreground" | Compensate camera motion first (homography/optical flow), or use a method designed for moving cameras |
| **Stopped objects** (a parked car) | Become background after a while | Lower the learning rate, use a longer history, or keep a second slow background |
| **Sudden lighting changes** (a cloud, lights on) | The whole picture flashes as foreground | Use a robust threshold, a ratio test, or reset on global change |
| **Shadows and reflections** | Foreground includes the shadow | Shadow detection (colour-based), or a different colour space |
| **Camouflage** (object colour = background) | Parts missing | Use texture/gradient models, or learned methods |
| **Dynamic backgrounds** (trees, water) | Constant noise | MOG2 with more components, or learned dynamic-background methods |
| **Auto exposure / white balance** | Global brightness flicker | Lock camera settings |
| **Initialisation** (people in the scene at start) | Ghosts | Learn from an empty scene or a median over many frames |

## A quick way to get a clean background: the median

If you have a short video where objects move around, the **temporal median** of the frames (per pixel) usually gives an excellent empty background, because an object covers each pixel only a minority of the time.

```python run title="Median of frames as the background" level=easy
import cv2
import numpy as np
import cvlab

frames, _ = cvlab.video(n=60)
stack = np.stack(frames[::2])                                    # every second frame: (30, H, W, 3)
median_bg = np.median(stack, axis=0).astype(np.uint8)
diff = cv2.absdiff(frames[25], median_bg).max(axis=2)
mask = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)[1]
print("foreground pixels with the median background:", int((mask > 0).sum()))
cvlab.show(median_bg, "Median background: no objects left", mask, "Foreground at frame 25")
```

## Learned alternatives

Deep learning approaches (FgSegNet, BSUV-Net, and general video object segmentation) handle moving cameras, shadows and dynamic backgrounds far better, but need training data. Often a good design is: **cheap background subtraction to find regions of interest, then a small classifier or detector to decide what the object is**. That saves compute and removes false alarms.

:::interview Questions you may get
- "How does background subtraction work?" Model each pixel's normal appearance; pixels that do not fit are foreground. Running average, Gaussian mixtures (MOG2), KNN.
- "Why Gaussian mixtures instead of one average?" The background can have several states per pixel (waving leaves, flicker).
- "What does the learning rate trade off?" Fast adaptation to change versus absorbing slow or stopped objects.
- "How do you clean the foreground mask?" Remove shadow values, open and close with morphology, filter blobs by area.
- "When does it fail?" Moving cameras, stopped objects, sudden lighting changes, camouflage, shadows.
:::

```quiz
? You increase the learning rate of a background model. What is a side effect?
+ Slow or stopped objects are absorbed into the background faster
- It becomes more stable
- Shadows disappear
> A high rate adapts quickly but forgets objects that stop moving.

? Which value in a MOG2 mask marks a shadow?
- 0
+ 127
- 255
> Foreground is 255 and background 0.

? Why is a median over many frames a good background estimate?
+ A moving object covers each pixel only for a minority of the frames
- It is faster than any other method
- It removes noise completely
> The median ignores values that appear in less than half of the frames.

? The camera is mounted on a drone. What happens to plain background subtraction?
- It works better
+ Almost every pixel is flagged as foreground; the camera motion must be compensated
- Only the sky is foreground
> The model assumes a fixed camera.
```

:::problem Design a people counter at a shop entrance using a fixed overhead camera. What do you do about shadows, groups walking together and people standing still? {level=medium tags="background-subtraction,counting,design"}
Think about the pipeline and the failure cases.

:::solution Model answer
Overhead view reduces occlusion. Pipeline: background subtraction (MOG2 with shadow detection, or a median/running model), clean the mask by opening/closing, find blobs by area (a person's area range), then **track** blobs across frames (nearest-neighbour or Kalman) and count **crossings of a virtual line** in each direction. Shadows: drop the shadow value, use a colour-based shadow filter, and avoid direct sunlight with fixed lighting. Groups merge into one big blob: estimate the count from the area (area / typical person area) or split with watershed, or switch to a person detector/head detector for crowded entries. People standing still get absorbed: use a lower learning rate or freeze the model when a blob is stationary, keep the track alive by prediction. Validate against a manual count for different times of day.
:::
:::

:::keypoints
- Background subtraction learns the empty scene and flags what differs. It needs a fixed camera and no labels.
- Running average (`α` = learning rate), MOG2 (mixtures per pixel, shadows at 127), KNN. Median of frames gives a clean background.
- Clean the mask (threshold shadows, open/close), then use contours or components with an area filter.
- Failures: camera motion, stopped objects, sudden light changes, shadows, camouflage. Learned methods are more robust.
:::

:::resources
- [OpenCV: background subtraction tutorial](https://docs.opencv.org/4.x/d1/dc5/tutorial_background_subtraction.html) — MOG2 and KNN in code.
- [Zivkovic: Improved adaptive Gaussian mixture model for background subtraction](https://www.zoranz.net/Publications/zivkovic2004ICPR.pdf) — the MOG2 paper.
- [ChangeDetection.net benchmark](http://changedetection.net) — the standard dataset for background subtraction.
:::
