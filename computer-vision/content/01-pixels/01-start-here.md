---
title: Start Here — The Map of Computer Vision
level: easy
time: 25
summary: What computer vision is, how the field moved from hand-written rules to learning from data, how this course follows that same road, how to use the runnable code and simulators, and your first OpenCV program.
---

Welcome. This course teaches computer vision from the very first pixel to the models used today. It is long on purpose. Read it in order the first time. Later, use it as a reference when you prepare for an interview.

:::def Computer vision
Teaching computers to understand pictures and video. The computer gets a grid of numbers. We want it to answer questions such as: *What is in this picture? Where is it? How far away is it? What is moving?*
:::

:::analogy
When you look at a cup, you do not "calculate" anything. You just see a cup. A computer sees only numbers, for example `[212, 198, 190, ...]`, millions of them. Computer vision is the work of turning those numbers into the same understanding you get without effort.
:::

## Where computer vision is used

You already use it every day.

- **Phone**: face unlock, portrait mode, photo search ("show me beach photos").
- **Cars**: lane keeping, reading traffic signs, spotting people on the road.
- **Factories**: checking every product for scratches, cracks and missing parts.
- **Robots**: finding the part to pick up and knowing exactly where it is in 3D. This is a very common interview topic for robotics roles.
- **Hospitals**: finding tumours in scans, counting cells.
- **Phones and shops**: reading text (OCR), scanning documents, scanning barcodes.
- **Creative tools**: removing a background, making a new picture from a sentence.

## Two eras, one road

The field has two big eras. This course follows the same road, because modern ideas make much more sense when you know the old ones they replaced.

:::flow The story of computer vision
1960s–2000s: hand-written rules | Experts write the steps: blur, find edges, find corners, match points. Fast, explainable, and still used in robots and cameras today.
2001: a fast face detector | Viola–Jones uses simple features and boosting. Your first digital camera used it.
2005–2011: engineered features + a classifier | SIFT and HOG describe a patch of the image. An SVM decides what it is.
2012: AlexNet | A deep neural network (a CNN) wins ImageNet by a huge margin. Features are now learned from data, not designed by hand.
2015: ResNet, Faster R-CNN, U-Net, YOLO | Networks get deep and accurate. Detection and segmentation become practical.
2020: Vision Transformer (ViT) | The attention idea from language models works on image patches too.
2021: CLIP | A model learns from images and their captions. Now you can search images using words.
2023 onwards: SAM, DINOv2, diffusion models, vision-language models | One big model can do many jobs. Pictures can be generated from text.
:::

You will learn **both** eras. Interviewers love to ask "how did people do this before deep learning, and why did it stop working?" A good answer shows you understand the problem, not only the tool.

## Why classical vision still matters

- **Robots and cameras** often run on small chips where a simple filter is cheaper and more reliable than a big network.
- **3D geometry** (cameras, calibration, stereo, SLAM) is mostly not learned. It is mathematics, and it is asked in almost every robotics-vision interview.
- **Pre-processing and debugging**: many deep-learning pipelines still resize, normalise, warp and filter their data with classical tools.
- **Understanding**: a CNN's first layers learn filters that look like the classical edge detectors. Knowing the old tools explains the new ones.

## The map of this course

```viz algo=arch title="From pixels to modern vision" dir=right
px    Pixels | images as numbers [img] @0,1
proc  Image processing | filters, edges, shapes [filter] @1,0
feat  Features | corners, SIFT, matching [search] @1,2
geo   Camera and 3D | calibration, stereo, SLAM [camera] @2,1
cnn   CNNs | learned filters [conv] @3,0
task  Detection and segmentation | boxes, masks [boxes] @4,0
vit   Transformers and foundation models | ViT, CLIP, SAM [attn] @4,2
gen   Generative vision | GANs, diffusion [ai] @5,1
ship  Deploy and interview | ONNX, edge, design [gpu] @6,1
--
px -> proc
px -> feat
proc -> geo
feat -> geo
proc -> cnn
cnn -> task
cnn -> vit
task -> gen
vit -> gen
gen -> ship
task -> ship
```

| Part | What you will be able to do |
|---|---|
| Pixels and cameras | Explain what an image is, handle it with NumPy, avoid the classic bugs |
| Image processing | Blur, sharpen, find edges, threshold, clean up masks, find shapes |
| Features and matching | Find the same point in two photos. Build a panorama. Explain SIFT and RANSAC |
| Camera geometry and 3D | Calibrate a camera, measure depth with two cameras, understand SLAM |
| Video and motion | Track objects, estimate motion, explain Kalman filters |
| Learning for vision | Train a classifier the right way, measure it honestly |
| CNNs | Explain convolution, ResNet, transfer learning. Build one from scratch |
| Detection and segmentation | Explain YOLO, Faster R-CNN, DETR, U-Net, Mask R-CNN, IoU, NMS and mAP |
| Transformers and foundation models | Explain ViT, CLIP, DINOv2, SAM and vision-language models |
| Generative vision | Explain GANs and diffusion |
| 3D deep learning and robotics | Point clouds, NeRF, 6D pose, hand-eye calibration |
| Shipping vision systems | Quantise, export to ONNX, run on edge devices, monitor |
| Interview preparation | Rapid-fire questions, coding problems, system design, a study plan |

## How to use this course

1. **Read the idea, then run the code.** Every ▶ Run block works in your browser. Change a number and run it again. Breaking things on purpose is the fastest way to learn.
2. **Play with the simulators.** They are diagrams with sliders. You will see a filter slide over an image and a camera project a 3D scene.
3. **Answer the quiz** at the end of each lesson. It takes one minute and shows what you missed.
4. **Do the interview questions.** Look for the "Interview" boxes and the question cards. Answer out loud first, then read the model answer. The **Interview Qs** tab collects them all.
5. **Use the Go deeper box** at the end of a lesson for the best papers, videos and docs.

:::tip How the code works here
Your browser has no files and no camera window. So the lessons use a tiny helper called `cvlab`:

- `cvlab.image("astronaut")` gives you a ready-made photo. On your own computer you would write `cv2.imread("photo.jpg")`.
- `cvlab.show(img, "title")` draws a picture in the output box. On your own computer you would use `cv2.imshow(...)`.

Everything else is real OpenCV, NumPy and scikit-image code. It works the same on your laptop.
:::

## Your first program

Let us find the outlines in a photo. Four steps: load, make it grey, smooth it, find edges.

```python run title="Your first computer-vision program" level=easy
import cv2
import cvlab

img   = cvlab.image("astronaut")                  # a photo, as a NumPy array
gray  = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)     # colour -> brightness only
blur  = cv2.GaussianBlur(gray, (5, 5), 1.4)       # smooth away the noise
edges = cv2.Canny(blur, 60, 140)                  # keep the strong outlines

cvlab.show(img, "Photo", edges, "Edges")
print(img.shape, "->", edges.shape)
print("edge pixels:", int((edges > 0).sum()))
```

Look at what happened. The photo has three numbers per pixel (red, green, blue). The result has only one number per pixel: white where there is an edge and black everywhere else. You turned millions of numbers into a simple, useful map in four lines. This is the heart of classical vision: a chain of small steps, each one easy to understand.

Now change `(5, 5)` to `(15, 15)` and run again. More blur means fewer edges. Then change `60, 140` to `20, 60`. Lower limits mean more edges, including noise. You will learn exactly why in the lessons on blur and Canny.

:::interview What interviewers want to hear
When someone asks "what is computer vision?", a strong answer has three parts: (1) the **input** is a grid of numbers, (2) the **tasks** are things like classification, detection, segmentation, depth and tracking, and (3) the **tools** went from hand-designed filters to learned features. Add one real example from your own work or a project.
:::

```quiz
? What does a computer receive when it "looks" at a photo?
- A description of the objects in the picture
+ A grid of numbers, one or three per pixel
- A list of edges and corners
> Everything else (objects, edges, depth) has to be worked out from those numbers.

? Which change started the "modern era" of computer vision?
- Faster cameras
+ Deep networks (CNNs such as AlexNet) learning features from data instead of people designing them
- Better image file formats
> In 2012 AlexNet beat hand-designed methods on ImageNet by a very large margin.

? Why does a robotics engineer still need classical vision and geometry?
- Because deep learning cannot see
+ Because camera calibration, stereo and SLAM are mostly mathematics, and simple filters are fast and reliable on small devices
- Because classical methods are always more accurate
> Classical tools are not "old and useless". They are the base of 3D vision and of many pre-processing steps.
```

:::keypoints
- Computer vision turns a grid of numbers into understanding: what, where, how far, how it moves.
- The field went from hand-written rules (filters, SIFT, HOG) to learned features (CNNs, transformers, foundation models).
- This course follows that road: classical first, modern next, and deployment and interviews at the end.
- Classical vision and geometry are still important, especially in robotics.
- Run the code, play with the simulators, answer the quizzes, and practise the interview questions.
:::

:::resources
- [Stanford CS231n: Deep Learning for Computer Vision](https://cs231n.stanford.edu) — the best-known university course, with free notes.
- [OpenCV documentation](https://docs.opencv.org/4.x/) — the reference for every function used in this course.
- [Szeliski: Computer Vision, Algorithms and Applications](https://szeliski.org/Book/) — the classic textbook, free online.
- [ImageNet Large Scale Visual Recognition Challenge (paper)](https://arxiv.org/abs/1409.0575) — the contest that started the deep-learning era.
:::
