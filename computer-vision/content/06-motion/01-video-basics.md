---
title: Video Basics — Frames, Codecs, Latency
level: easy
time: 35
summary: A video is a stream of frames. Learn frame rate and the time budget, how codecs store video, how to read and write video in OpenCV, the camera-stream traps (lag, dropped frames, timestamps), and the simplest motion detector: frame differencing.
---

Everything so far worked on a single picture. A **video** is a sequence of pictures over time, called **frames**. Time brings new questions: *what moved? how fast? where will it be next?* It also brings new engineering problems: speed, delay, and synchronisation.

## Frame rate and the time budget

The **frame rate** (fps, frames per second) is how many frames arrive each second. At 30 fps a new frame arrives every **33 ms**. If your processing takes longer than that, you fall behind.

| fps | Time per frame | Typical use |
|---|---|---|
| 5–10 | 100–200 ms | Slow monitoring, time-lapse |
| 24–30 | 33–42 ms | Normal video, many robot cameras |
| 60 | 16.7 ms | Smooth motion, fast robot tasks |
| 120–1000+ | 8 ms or less | High-speed inspection, sports analysis |

The **budget** is the whole pipeline: capture, decode, pre-processing, the model, post-processing, drawing, sending the result to the robot. If a detector needs 40 ms on its own, 30 fps is out of reach. Options: skip frames (process every 2nd frame), use a smaller model or lower resolution, run stages in parallel (a pipeline), or track between detections (cheap tracker on in-between frames).

## How video is stored

- **Container** (`.mp4`, `.avi`, `.mkv`, `.mov`): the file wrapper that holds video, audio and timestamps.
- **Codec** (H.264, H.265/HEVC, VP9, AV1, MJPEG): how the pictures are compressed. We saw the idea in the files lesson: **I-frames** (complete pictures), **P-frames** and **B-frames** (changes only). That makes video 50–200 times smaller than a stack of JPEGs.
- **MJPEG** stores every frame as a separate JPEG: bigger files, but **every frame is independent**, so there is no decoding delay and each frame can be used alone. Many industrial and robot cameras use it, or send raw frames.

Consequences for vision work:

- **Compression artefacts**: blocks and blur around moving things; noise is smoothed away. A model trained on clean images may behave differently on compressed streams.
- **Seeking is not free**: jumping to frame 5,000 means decoding from the previous key frame.
- **Latency**: H.264 encoders buffer frames, so a streamed picture can be **0.1–1 second old**. For a robot reacting to what it sees, low-latency settings (or no compression) matter a lot.

## Read and write video with OpenCV

The browser has no video files, so here is the code to run **on your computer**. It writes a short test video and reads it back frame by frame.

```python local check title="Write a video, then read it back frame by frame"
import os, tempfile
import cv2
import cvlab

frames, _ = cvlab.video(n=30)                                   # 30 synthetic frames (320 x 240)
path = os.path.join(tempfile.mkdtemp(), "demo.avi")

writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), 25, (320, 240))     # file, codec, fps, (width, height)
for f in frames:
    writer.write(cv2.cvtColor(f, cv2.COLOR_RGB2BGR))              # OpenCV writes BGR
writer.release()

cap = cv2.VideoCapture(path)
print("opened:", cap.isOpened(), " fps:", cap.get(cv2.CAP_PROP_FPS), " frames:", int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
      " size:", int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), "x", int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
count = 0
while True:
    ok, frame = cap.read()                                        # ok is False at the end of the file
    if not ok:
        break
    count += 1                                                    # ... process `frame` here (BGR!) ...
cap.release()
assert count == 30, count
print("frames read:", count)
```

For a **camera** use `cv2.VideoCapture(0)` (the first camera), and for a network stream a URL such as `rtsp://...`. Always **check `ok`**, and always **release** the capture.

## Camera stream traps

- **Lag from buffering**: if your processing is slower than the camera, frames queue up and you work on pictures that are seconds old. Fix: keep only the **latest** frame (read in a separate thread and overwrite a variable), use `cap.grab()` to skip, or set a small buffer size. *Drop frames, never queue them.*
- **Variable frame rate**: do not assume the time between frames is constant. Use the **timestamp** of each frame (from the camera or `CAP_PROP_POS_MSEC`) for speeds and for synchronising with robot data.
- **Dropped or duplicated frames** appear under load or on bad cables. Count them with the timestamps.
- **Rolling versus global shutter** (camera lesson): fast motion looks skewed with a rolling shutter.
- **Exposure and frame rate**: a long exposure limits the frame rate (exposure must be shorter than the frame interval) and causes motion blur.
- **Auto settings**: auto-exposure and auto-white-balance change the picture from frame to frame, upsetting trackers and background models. Lock them for machine vision.
- **Glass-to-glass latency**: the time from "something happens" to "the program has seen it". Measure it (film a clock, or flash an LED), because it decides how fast a robot can react.

## The simplest motion detector: frame differencing

If the camera is fixed, anything that moved changes the pixels. Subtract the previous frame from the current one. Where the difference is large, something moved.

```python run title="Frame differencing" level=easy
import cv2
import numpy as np
import cvlab

frames, tracks = cvlab.video(n=60)
gray = [cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_RGB2GRAY), (5, 5), 0) for f in frames]

t = 20
diff = cv2.absdiff(gray[t], gray[t - 1])
_, motion = cv2.threshold(diff, 15, 255, cv2.THRESH_BINARY)
motion = cv2.morphologyEx(motion, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
print("pixels flagged as moving at frame", t, ":", int((motion > 0).sum()))

# a static scene: the mean difference should be pure noise
quiet = cv2.absdiff(gray[0], gray[0]).mean()
levels = [float(cv2.absdiff(gray[i], gray[i - 1]).mean()) for i in range(1, 60)]
print("average change per frame: min", round(min(levels), 2), "max", round(max(levels), 2), "(gray levels)")
cvlab.show(frames[t], "Frame 20", diff * 6, "|frame 20 - frame 19| x 6", motion, "Moving pixels")
```

Two weaknesses are visible. You see only the **edges** of uniformly coloured objects (the middle of a moving object looks the same as before). And a slowly moving or **stopped** object disappears. A cheap improvement is **three-frame differencing**: combine `|f(t) − f(t−1)|` and `|f(t+1) − f(t)|` with an AND to remove the "ghost" left behind. The next lesson does better: it builds a model of the background.

## Draw results and measure the time

```python run title="Boxes around the moving regions" level=easy
import cv2
import numpy as np
import cvlab

frames, tracks = cvlab.video(n=60)
gray = [cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_RGB2GRAY), (5, 5), 0) for f in frames]
t = 15
motion = cv2.threshold(cv2.absdiff(gray[t], gray[t - 1]), 12, 255, cv2.THRESH_BINARY)[1]
motion = cv2.dilate(motion, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)), iterations=2)
contours, _ = cv2.findContours(motion, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
vis = frames[t].copy()
boxes = [cv2.boundingRect(c) for c in contours if cv2.contourArea(c) > 80]
for x, y, w, h in boxes:
    cv2.rectangle(vis, (x, y), (x + w, y + h), (0, 255, 0), 2)
print("moving regions found:", len(boxes), " (true moving objects visible:", sum(1 for k in tracks if tracks[k][t] is not None), ")")
cvlab.show(vis, "Frame 15 with boxes around the movement")
```

:::interview Questions you may get
- "Your model runs at 25 ms per frame but the system lags by seconds. Why?" Frames queue up because capture or other stages are slower or buffered; drop old frames and keep only the latest, measure each stage, check codec latency.
- "What is the difference between an I-frame and a P-frame?" A complete picture versus the changes from a reference frame.
- "Why do robots often use MJPEG or raw cameras instead of H.264?" Each frame is independent and there is little encoding delay.
- "How do you compute speed from video?" Distance moved (calibrated to metres) divided by the time between frames, using timestamps, not an assumed fps.
- "What are the limits of frame differencing?" It shows only edges of uniform objects, misses stopped objects and is sensitive to noise and lighting.
:::

```quiz
? At 30 fps, how much time do you have for the whole processing of one frame?
- About 3 ms
+ About 33 ms
- About 300 ms
> 1 / 30 s = 33 ms. If you need longer, you must skip frames, speed up or parallelise.

? A video stream shows a delayed picture whose lag grows over time. What is the most likely cause?
+ Frames are buffered faster than the program consumes them
- The codec is too good
- The resolution is too high
> Always drop old frames and process the most recent one.

? Why does frame differencing show only the edges of a plain-coloured moving object?
+ The middle of the object has the same colour as before, so there is little change there
- OpenCV only finds edges
- Noise removes the centre
> A background model or optical flow handles this better.

? What does MJPEG store?
- Differences between frames
+ Each frame as a separate JPEG
- Only key frames
> This makes it larger but every frame is independent.
```

:::problem A conveyor camera runs at 60 fps, but your classifier takes 30 ms per frame. How do you still keep up with the line speed? {level=medium tags="video,real-time,pipeline"}
Think about the budget and parallelism.

:::solution Model answer
60 fps gives 16.7 ms per frame, so one 30 ms model cannot process every frame in sequence. Options: (1) process only the frames you need (a trigger or a motion/part-present test, or one frame per part rather than every frame); (2) run the model on a **pipeline** with several workers or batches (throughput rises, latency stays at about 30 ms); (3) shrink the model (quantise, smaller backbone, lower resolution, TensorRT) until it fits the budget; (4) use a fast **tracker** between detector calls. Measure latency (time until the decision) separately from throughput (frames per second), because the reject gate downstream needs the result in time.
:::
:::

:::keypoints
- A video is frames over time; at 30 fps you have about 33 ms per frame for the whole pipeline.
- Codecs store key frames plus changes; MJPEG keeps every frame independent. Compression adds artefacts and latency.
- Read with `VideoCapture` (check `ok`, release). Drop old frames instead of queueing, use timestamps, lock auto-exposure.
- Frame differencing finds motion cheaply but only edges of moving objects; background models are better.
:::

:::resources
- [OpenCV: getting started with videos](https://docs.opencv.org/4.x/dd/d43/tutorial_py_video_display.html) — VideoCapture and VideoWriter.
- [FFmpeg documentation](https://ffmpeg.org/documentation.html) — the tool behind most video decoding and encoding.
- [Computerphile: How video compression works (H.264)](https://www.youtube.com/watch?v=r6Rp-uo6HmI) — a clear introduction to I/P/B frames.
:::
