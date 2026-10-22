---
title: How Computer-Vision Interviews Work
level: mixed
time: 35
summary: The kinds of roles (vision engineer, perception engineer, applied scientist, edge engineer), the usual rounds and what each one tests, how to structure answers, how to handle coding and design rounds, how to present projects, common mistakes, and a map from interview topics to the lessons of this course.
---

Computer-vision interviews are not all the same. A **robotics perception** interview asks about cameras, calibration and SLAM; an **applied ML** interview asks about detection, training and metrics; an **edge** interview asks about latency and quantisation. This lesson helps you aim your preparation, then gives you a way of answering that works for every round.

## Who is hiring, and what they ask

| Role | Day-to-day | Heavy topics in the interview |
|---|---|---|
| **Computer vision engineer** | OpenCV, classical + deep pipelines, C++/Python, cameras | Image processing, features, geometry, detection, deployment, coding |
| **ML engineer (vision)** | Train, evaluate and ship vision models | CNN and transformer fundamentals, training, metrics, data, MLOps, PyTorch coding |
| **Perception engineer (robotics, AV)** | Sensors, calibration, 3-D, tracking, SLAM, ROS | Camera model, calibration, stereo, PnP, RANSAC, Kalman filters, point clouds, C++, sensor fusion |
| **Applied / research scientist** | New methods, papers, experiments | Deep learning theory, recent papers (ViT, diffusion, SSL), maths, experimental design |
| **Edge / embedded vision engineer** | Make models fit and run on devices | Quantisation, TensorRT/ONNX, profiling, memory, C++, camera interfaces |
| **MLOps / platform for vision** | Data pipelines, training infrastructure, serving | Data engines, monitoring, scaling, cost, reliability |

Read the job description closely, and ask the recruiter which rounds to expect. Then weight your preparation. A robotics company will care more about *the geometry of a pixel* than about *the latest diffusion paper*.

## The usual rounds

1. **Recruiter / screening**: your background, what you built, motivation, logistics. Have a clear **two-minute story** ready.
2. **Coding round (45-60 min)**: Python or C++; often data structures and algorithms (arrays, graphs, dynamic programming), and for vision roles **image or vision coding**: implement IoU, NMS, convolution, resize, k-means, histogram operations with NumPy (module 16, coding lessons).
3. **ML/CV fundamentals (45-60 min)**: questions like the question banks in this module. Expect follow-ups that go deeper until you say "I am not sure"; that is fine if you reason well.
4. **Deep-dive on your project(s) (45-60 min)**: they pick something you wrote on your CV and probe every decision: data, model choice, metrics, failure cases, what you would change.
5. **System design (45-60 min)**: "Design a defect-inspection system", "design face unlock", "design search over a billion images" (design lesson).
6. **Hiring manager / behavioural**: collaboration, ambiguity, conflict, ownership, learning. Use stories with a result (STAR).
7. **Take-home or on-site exercise** (some companies): a small dataset and a few days; focus on a clean baseline, honest evaluation and a short, clear write-up rather than a leaderboard score.

## What interviewers are really checking

- **Fundamentals**: do you understand *why* things work (a convolution is local and weight-shared; the ratio test removes ambiguous matches), not only *how to call the function*?
- **Practical judgement**: can you pick a simple baseline, find the failure modes, and say what you would measure?
- **Geometry and maths comfort** (for robotics and AV): homogeneous coordinates, rotations, least squares, SVD.
- **Engineering**: clean code, tests, complexity, debugging, performance awareness.
- **Honesty about limits**: knowing when a method does not work is a strong signal.
- **Communication**: structure, clarity, drawing a diagram, checking assumptions.

## A structure for answering any technical question

:::flow The layered answer
One line | A direct definition or answer in a sentence ("RANSAC is a robust model-fitting method that repeatedly fits to random minimal samples and keeps the model with most inliers").
Mechanism | How it works, step by step, with a small example or formula. Draw it.
Why it matters | Where it is used and what it enables.
Limits | When it fails, assumptions, failure modes. (This is where good answers separate from average ones.)
Trade-offs / alternatives | Cost, speed, accuracy, and what you would choose instead.
Your experience | A short real example: "In my project I used it for... and found...".
:::

Stop when you have covered it; do not talk for ten minutes. Pause and ask: *"Shall I go deeper into the failure cases?"* Interviewers love being invited to choose the depth.

**If you do not know**: say what you do know, reason from first principles, and state your guess as a guess. ("I haven't used that, but if it is a learned matcher it probably uses attention between the two keypoint sets; let me think about what the loss would need to be.") Never bluff: a wrong confident answer costs more than an honest one.

## Coding rounds: a routine

1. **Clarify** the input and output: shapes, dtypes, edge cases (empty arrays, one-pixel images, ties, NaN), constraints.
2. **Give a simple solution first** (even brute force) and its complexity; then improve.
3. **Think aloud** and write readable code: good names, small helper functions.
4. **Test with small examples**, including edges. Walk through the code by hand.
5. **State complexity** (time and memory); for image code, mention vectorisation, memory layout and `uint8` overflow.
6. For vision: remember **coordinate conventions** (x = column, y = row; OpenCV `(x, y)` vs NumPy `[y, x]`), **dtype** (uint8 wrap-around), **channel order** (BGR vs RGB), and **border handling**. Naming these unprompted impresses.

## System-design rounds: a routine

1. **Clarify requirements**: users, task, inputs (camera type, resolution, FPS), latency budget, accuracy targets and the cost of each error type, constraints (device, privacy, budget).
2. **Define the metric** and success criteria before the model.
3. **Data**: what exists, how to collect and label, class balance, hard cases, privacy.
4. **Baseline then model**: start simple (classical or pre-trained), justify upgrades.
5. **Pipeline and deployment**: edge versus cloud, pre/post-processing, throughput, failure handling.
6. **Evaluation and monitoring**: offline metrics, slices, online metrics, drift, feedback loop.
7. **Risks and trade-offs**: what could go wrong, safety, bias, cost, what you would do next.

## Presenting your projects

Pick two or three projects you know to the last detail. For each prepare a **90-second version** and a **10-minute version** covering: the problem and why it mattered, the data (size, source, labelling, splits), the baseline, the final approach and **why**, the metrics and how you validated them, what failed and what you learned, the impact in numbers, and what you would do with more time. Be ready for: *"What was your contribution versus the team's?"*, *"How do you know it wasn't overfitting?"*, *"What happens on images unlike the training data?"*

## Common mistakes

- Reciting definitions without examples or failure modes.
- Jumping to a deep network when a threshold or a classical method would do, **or** refusing to use deep learning where it clearly helps.
- Ignoring data and metrics (talking only about architectures).
- Forgetting deployment realities (latency, memory, calibration drift).
- In coding: no tests, off-by-one in coordinates, `uint8` overflow, mixing `(x, y)` and `(row, col)`.
- Overclaiming on the CV: listing a technique you cannot explain.
- Not asking questions: clarifying questions are part of the evaluation.

## Map: from interview topic to lesson

| Interview topic | Where in this course |
|---|---|
| Image formation, colour, sampling, formats | Module 1 (pixels) |
| Filtering, edges, thresholding, morphology, frequency | Module 2 (processing) |
| Transforms, contours, Hough, template matching, classic segmentation | Module 3 (shapes) |
| Corners, SIFT/ORB, matching, RANSAC, homography, HOG | Module 4 (features) |
| Camera model, calibration, PnP, stereo, SfM, SLAM, BA, point clouds, hand-eye | Module 5 (camera and 3-D) |
| Optical flow, background subtraction, tracking, Kalman, MOT, video models | Module 6 (motion) |
| ML basics, metrics, backprop, PCA | Module 7 (learning) |
| CNNs, training, regularisation, ResNet, efficient nets, transfer learning, debugging | Module 8 (CNN) |
| Detection, NMS, mAP, YOLO, DETR, small objects | Module 9 (detection) |
| Segmentation, U-Net, Mask R-CNN, SAM, losses | Module 10 (segmentation) |
| ViT, SSL, CLIP, VLMs, fine-tuning | Module 11 (transformers and foundation models) |
| VAE, GAN, diffusion, evaluation | Module 12 (generative) |
| Pose, face, OCR, depth, anomaly, super-resolution, retrieval | Module 13 (other tasks) |
| Point-cloud nets, NeRF/3DGS, BEV, learned matching, grasping, VLA | Module 14 (3-D and robots) |
| Export, quantisation, latency, edge, MLOps, testing | Module 15 (shipping) |
| Banks, coding, maths, system design, plan | The rest of this module |

## How to prepare (three passes)

1. **Breadth pass (2 weeks)**: skim every module, run every example, and answer the interview boxes aloud. Note the topics you cannot explain simply.
2. **Depth pass (3-4 weeks)**: for your target role's heavy topics, do the problems, re-derive the key formulas, and implement from scratch (coding lessons). Read two or three key papers per area.
3. **Simulation pass (2 weeks)**: mock interviews with a friend, timed coding on a whiteboard or plain editor, design practice, and a project story rehearsed aloud. Record yourself once; you will hear the rambling.

:::interview Self-check before an interview
- Can you explain in two minutes, with a diagram: *convolution*, *Canny*, *SIFT*, *RANSAC*, *homography*, *camera calibration*, *stereo depth*, *Kalman filter*, *IoU/NMS/mAP*, *ResNet*, *ViT*, *how a detector is trained*, *how segmentation metrics differ*, *quantisation*?
- Can you write IoU, NMS, 2-D convolution and bilinear resize from memory in ten minutes each?
- Do you have a clear story for two projects, including failures and numbers?
- Can you name the first three things you would check when a model works in the lab but fails in the field?
:::

```quiz
? What is the best first step in a system-design question?
+ Clarify requirements and the cost of each kind of error
- Name an architecture
- Draw the GPU
> Everything follows from the requirements.

? You do not know an answer in a technical interview. What is best?
+ Say what you know, reason from first principles and mark your guess as a guess
- Bluff confidently
- Stay silent
> Honest reasoning earns trust.

? Which habit prevents many image-coding bugs?
+ Stating the coordinate convention, dtype and channel order up front
- Writing very short variable names
- Avoiding tests
> (x, y) versus (row, col), uint8 overflow, BGR versus RGB.

? What should a project deep-dive answer always include?
+ Data, baseline, metrics, failure cases, your contribution and what you would change
- Only the final accuracy
- Only the library names
> They probe every decision.
```

:::keypoints
- Roles differ: aim preparation at robotics perception (geometry, calibration, SLAM), applied ML (training, metrics, data), edge (quantisation, latency) or research (papers, maths).
- Typical rounds: screening, coding (including image coding), CV/ML fundamentals, project deep-dive, system design, behavioural.
- Answer in layers: one line, mechanism, why it matters, limits, trade-offs, your experience; ask which depth to go to.
- In coding, clarify, start simple, test, and name conventions (coordinates, dtype, channel order); in design, requirements, metric, data, baseline, deployment, monitoring, risks.
- Prepare in three passes: breadth, depth, simulation.
:::

:::resources
- [Chip Huyen: Machine Learning Interviews Book](https://huyenchip.com/ml-interviews-book/) — a free book on ML interview structure and questions.
- [Stanford CS231n: Deep Learning for Computer Vision](https://cs231n.stanford.edu) — a standard course that interviewers assume you know.
- [Szeliski: Computer Vision: Algorithms and Applications (free online)](https://szeliski.org/Book/) — the reference textbook for classical vision.
- [OpenCV documentation](https://docs.opencv.org/4.x/) — look up functions and parameter meanings.
:::
