---
title: Classic Detectors — HOG and Viola–Jones
level: intermediate
time: 45
summary: How objects were detected before deep learning. HOG describes shapes with gradient histograms, an SVM scores each sliding window; Viola-Jones finds faces with Haar features, the integral image, AdaBoost and a cascade. You run both and see why they were replaced.
---

Before 2012, two detectors ruled. **Viola–Jones** (2001) made **real-time face detection** possible and ended up in every digital camera. **HOG + SVM** (Dalal and Triggs, 2005) became the standard for detecting **pedestrians**. Both use a **sliding window** and a hand-designed feature. Understanding them also makes modern detectors easier to learn.

## The sliding-window idea

To find objects of unknown position and size: take a fixed-size window (for example 24 × 24 for a face, 64 × 128 for a person), slide it over **every position** of the picture, and ask a classifier "is there an object in this window?". To find objects of different sizes, repeat on an **image pyramid**. Many windows overlap the same object, so finish with **non-maximum suppression** to keep one box per object.

The cost is large: a 640 × 480 picture at many scales has hundreds of thousands of windows. So the classifier has to be **very fast**.

## HOG: Histogram of Oriented Gradients

HOG describes **shape** by the local directions of edges, not by colour or exact pixels.

:::flow HOG for one 64×128 window
1. Gradients | Compute Gx and Gy (Sobel), then the strength and direction at each pixel.
2. Cells | Cut the window into 8 × 8 pixel cells. In each cell, make a histogram of gradient directions with 9 bins (0 to 180°), each pixel voting with its gradient strength.
3. Blocks | Group 2 × 2 cells (16 × 16 pixels) into a block, sliding by 1 cell. Concatenate their 4 histograms (36 numbers) and normalise this vector. This makes the feature robust to lighting and contrast changes.
4. Descriptor | Concatenate all block vectors. For a 64 × 128 window: 7 × 15 blocks × 36 = 3780 numbers.
:::

Why it works for people: the outline of a standing person (head, shoulders, legs) forms a recognisable pattern of edge directions, whatever the clothing colour.

```python run title="Compute HOG and see it" level=intermediate
import cv2
import numpy as np
from skimage.feature import hog
import cvlab

gray = cvlab.image("astronaut", size=(128, 128), gray=True)
features, hog_image = hog(gray, orientations=9, pixels_per_cell=(8, 8), cells_per_block=(2, 2), block_norm="L2-Hys", visualize=True)
print("HOG feature length for a 128 x 128 patch:", features.shape[0], "= (16-1) x (16-1) blocks x 36")

win = cv2.HOGDescriptor()                                            # OpenCV's default: 64 x 128 window, 8x8 cells, 16x16 blocks, 9 bins
patch = cv2.resize(gray, (64, 128))
print("OpenCV HOG length for a 64 x 128 window:", len(win.compute(patch)), "(= 3780)")
cvlab.show(gray, "Picture", cv2.normalize(hog_image, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8), "HOG: each cell shows its dominant edge directions")
```

The picture on the right draws a small line for each strong orientation in each cell: it traces the outline of the head and shoulders.

## HOG + linear SVM for people

Dalal and Triggs trained a **linear SVM** on HOG vectors of thousands of 64×128 windows with a person and without. At test time: slide, compute the HOG of each window, get the SVM score (`w·x + b`), threshold, and apply NMS. OpenCV ships a **pre-trained people detector**.

```python run title="OpenCV's built-in HOG people detector" level=intermediate
import cv2
import numpy as np
import cvlab

hog = cv2.HOGDescriptor()
hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())          # weights trained on the INRIA pedestrian dataset
print("SVM weight vector length:", len(cv2.HOGDescriptor_getDefaultPeopleDetector()), "(3780 weights + 1 bias)")

img = cv2.cvtColor(cvlab.image("astronaut"), cv2.COLOR_RGB2BGR)
rects, scores = hog.detectMultiScale(img, winStride=(8, 8), padding=(8, 8), scale=1.05)
print("detections:", len(rects), " scores:", np.round(np.asarray(scores).ravel(), 2).tolist())
vis = img.copy()
for (x, y, w, h) in rects:
    cv2.rectangle(vis, (x, y), (x + w, y + h), (0, 255, 0), 2)
cvlab.show(cv2.cvtColor(vis, cv2.COLOR_BGR2RGB), "HOG + SVM people detector")
```

(The detector expects a full-body person of about 64 × 128 pixels or more, so a portrait may give nothing. Try your own street photo on your computer.)

## Viola–Jones: faces in real time

Viola and Jones solved a hard engineering problem: finding faces in a video stream on 2001 hardware. They combined **four** ideas:

1. **Haar-like features**: simple rectangle patterns. For example "the eye region is darker than the cheek region". A feature is the **difference between the sum of pixels in the white rectangles and the black rectangles**.
2. **The integral image**: any rectangle sum costs four lookups (the fast-filters lesson), so each feature costs a few operations whatever its size.
3. **AdaBoost**: out of about **160,000** possible features in a 24 × 24 window, boosting **selects** the few hundred best, and combines weak classifiers (each a threshold on one feature) into a strong one.
4. **The cascade**: a chain of stages. Early stages are tiny (2 features) and reject most non-face windows at once. Only windows passing all stages are called faces. Since **most windows are not faces**, the average cost per window is very low.

:::analogy
A bouncer checks queue at a club. The first check ("do you have a ticket?") is quick and removes most people. The second check is slower, but now only a few people remain. The expensive full check only happens for the very few who passed everything. The cascade makes the average cost tiny.
:::

```python run title="Face detection with a Haar cascade" level=easy
import cv2
import cvlab

img = cvlab.image("astronaut")
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
face_model = cv2.CascadeClassifier(cvlab.data_path("haarcascade_frontalface_default.xml"))
print("cascade loaded:", not face_model.empty())

faces = face_model.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
print("faces found:", len(faces), faces.tolist())
vis = img.copy()
for (x, y, w, h) in faces:
    cv2.rectangle(vis, (x, y), (x + w, y + h), (255, 0, 0), 2)
cvlab.show(vis, "Haar cascade face detection")
```

The parameters:

- `scaleFactor` (1.05–1.3): the step of the pyramid. Smaller finds more sizes but is slower.
- `minNeighbors`: how many overlapping detections are needed to accept a face. **Higher is stricter** (fewer false alarms, fewer faces).
- `minSize`, `maxSize`: the range of face sizes to look for.

```python run title="minNeighbors trades false alarms for misses" level=intermediate
import cv2
import cvlab

face_model = cv2.CascadeClassifier(cvlab.data_path("haarcascade_frontalface_default.xml"))
print("minNeighbors:         ", [0, 1, 3, 5, 10, 15])
for name in ("astronaut", "coins"):                              # one real face, and a picture with no faces at all
    gray = cv2.cvtColor(cvlab.image(name), cv2.COLOR_RGB2GRAY) if cvlab.image(name).ndim == 3 else cvlab.image(name)
    counts = [len(face_model.detectMultiScale(gray, 1.1, n, minSize=(24, 24))) for n in (0, 1, 3, 5, 10, 15)]
    print(f"{name:10s} detections:", counts)
```

The coins picture has **no faces**, yet low `minNeighbors` reports many "faces" (round coins with dark spots look a little like faces). A higher value removes the false alarms, but with too high a value a real face can be missed as well.

## Why they were replaced

| | HOG + SVM | Viola–Jones | CNN detectors |
|---|---|---|---|
| Feature | Hand-made, gradient histograms | Hand-made, Haar + boosting | Learned |
| Strength | Good for rigid shapes, simple | Very fast on CPU; frontal faces | Handle any pose and class |
| Weakness | Slow sliding window, one class per model, needs the right pose | Frontal faces only; many false alarms; lighting issues | Needs data and compute |
| Accuracy on hard sets | Low | Low | Far higher |

**Deformable Part Models (DPM)** (2008–2012) improved HOG by modelling an object as a **root template plus movable parts** (a person: head, torso, limbs). They won the PASCAL VOC detection challenges until 2012. Then CNNs (R-CNN in 2013) made all of these obsolete in accuracy. But you will still meet Haar cascades in embedded code, and the **ideas** survive: sliding windows and pyramids in early CNN detectors, NMS in all detectors, and hard-negative mining in training.

:::interview Questions you may get
- "Explain HOG." Gradients, 9-bin orientation histograms per 8×8 cell, block normalisation over 2×2 cells; 3780 numbers for a 64×128 window.
- "Why block normalisation?" Robustness to local illumination and contrast changes.
- "What made Viola–Jones fast?" The integral image (cheap Haar features), AdaBoost feature selection, and the cascade that rejects most windows early.
- "How does the sliding-window approach handle different object sizes?" An image pyramid (or resizing the window), followed by NMS.
- "Why did CNN detectors replace them?" Learned features are more powerful and handle pose, appearance and many classes in one model.
:::

```quiz
? What is the length of the standard HOG descriptor of a 64x128 window?
- 1024
+ 3780
- 128
> 7 × 15 blocks × 36 numbers per block.

? What is the role of the cascade in Viola-Jones?
- It chooses the Haar features
+ It rejects most non-face windows cheaply in early stages, so the average cost per window is tiny
- It adds colour
> Only windows that pass all stages are reported as faces.

? What does a Haar-like feature compute?
+ A difference of sums of pixels in adjacent rectangles
- A gradient histogram
- A colour average
> The integral image makes each such sum cost four lookups.

? You raise minNeighbors in detectMultiScale. What happens?
+ Fewer false detections, but possibly fewer true faces
- More detections
- Faster training
> A box must be supported by more overlapping windows.
```

:::problem A Haar cascade face detector works in the lab but fails on people wearing masks or looking sideways, and gives false alarms on tree bark. What are your options? {level=medium tags="viola-jones,face-detection,robustness"}
Think about the limits of the method.

:::solution Model answer
Haar cascades are trained for frontal, unoccluded faces; masks, profile and shadows are outside what they learned, and bark patterns resemble face features. Options: use a modern face detector (RetinaFace, YuNet, BlazeFace, MTCNN; small ones run in real time on a CPU), which handles pose and occlusion and has far fewer false alarms; add temporal filtering and a skin/size sanity check; or retrain a cascade or detector on data that includes those cases. Measure on a validation set that matches the deployment (masks, angles, lighting) with precision and recall, not on a demo.
:::
:::

:::keypoints
- Sliding window + image pyramid + NMS is the classic detection recipe; the classifier must be very fast.
- HOG: gradient-orientation histograms per 8×8 cell, normalised over 2×2-cell blocks (3780 numbers for 64×128). A linear SVM scores windows.
- Viola–Jones: Haar features + integral image + AdaBoost + cascade = real-time frontal face detection.
- CNN detectors replaced them for accuracy, but the ideas (windows, pyramids, NMS, hard negatives) remain.
:::

:::resources
- [Dalal and Triggs: Histograms of Oriented Gradients for Human Detection (CVPR 2005)](https://hal.inria.fr/inria-00548512/document) — the HOG paper.
- [Viola and Jones: Rapid Object Detection using a Boosted Cascade of Simple Features (2001)](https://www.cs.cmu.edu/~efros/courses/LBMV07/Papers/viola-cvpr-01.pdf) — the cascade paper.
- [OpenCV: Cascade classifier tutorial](https://docs.opencv.org/4.x/db/d28/tutorial_cascade_classifier.html) — face and eye detection code.
:::
