---
title: Projects, Behavioural Rounds and an Eight-Week Study Plan
level: mixed
time: 50
summary: How to tell your project stories, answer behavioural questions with the STAR method, questions to ask the interviewer, a week-by-week eight-week plan that maps to the lessons of this course, a final-week checklist, and a rapid-fire self-test.
---

Technical skill gets you into the room; **clarity, ownership and judgement** decide the offer. This lesson covers the human rounds and gives you a plan that turns this whole course into eight weeks of preparation.

## Your project stories

Choose **two or three** projects you can discuss for 30 minutes. Good projects have: a real problem, messy data, a measurable result, a decision you had to defend, and a failure you learned from. If you have no work project, use course projects (module 18) and **extend** them: new data, a deployment, an error analysis.

For each project prepare these answers:

| Question | Prepare |
|---|---|
| **Problem** | Who needed what, and why did it matter (a number: scrap rate, hours saved, accuracy needed)? |
| **Data** | Source, size, labels, who labelled, quality problems, how you split it (leakage checks) |
| **Baseline** | The simplest thing you tried first and its score; why it was not enough |
| **Approach** | The final method and **why** this one (what alternatives you considered) |
| **Metrics** | What you measured, why those metrics, how you set the threshold, confidence intervals |
| **Error analysis** | The top three failure modes you found and what you did about each |
| **Engineering** | Training setup, deployment (latency, hardware), monitoring, tests |
| **Result** | Numbers, before and after, compared with the baseline or the human |
| **Your role** | What *you* did versus the team; what you would do differently |
| **Next steps** | What you would do with another month |

**Two versions**: a **90-second pitch** (problem, approach, result, your role) and a **10-minute deep dive** (all rows above, with a diagram). Practise aloud; record yourself.

**Honest numbers only.** If you say "98% accuracy", expect: on what test set? class balance? how many images? who labelled? versus what baseline? A modest number with a rigorous evaluation beats a large number you cannot defend.

## The STAR method for behavioural questions

**S**ituation (1-2 sentences of context), **T**ask (what *you* were responsible for), **A**ction (what *you* did, specifically, in steps: this is the longest part), **R**esult (the outcome with numbers, and what you learned). Aim for 2 minutes. Use "I" for your own actions and "we" for the team's.

Typical questions and what they test:

- **"Tell me about a time a model failed in production."** Ownership and debugging: how you found the cause (drift, data issue), the fix, and the process change (monitoring, tests).
- **"Describe a disagreement with a teammate about an approach."** Collaboration: you listened, proposed an experiment to settle it with data, and accepted the outcome.
- **"A deadline was impossible. What did you do?"** Prioritisation and communication: reduced scope, shipped a baseline, set expectations early.
- **"Tell me about the hardest bug you fixed."** Depth and persistence: a systematic approach (bisecting the pipeline), not luck.
- **"How do you handle ambiguous requirements?"** You clarify, write down assumptions, define the metric, and iterate with stakeholders.
- **"Tell me about a time you learned something quickly."** Learning speed: the method you used (read the paper, reproduce, small experiments) and the result.
- **"What is a mistake you made?"** Honesty and growth: a real mistake (data leakage, wrong metric, untested assumption), its impact, and the guard you now use.
- **"How do you explain a technical result to a non-technical person?"** Communication: analogies, outcomes first, uncertainty stated plainly.

### A worked example

> **Situation.** On our packaging line, a detector that worked well in testing started rejecting about 8% of good parts a few weeks after launch. **Task.** I owned the vision model and had to cut false rejects below 1% without missing real defects. **Action.** I first checked the logged images and saw the brightness had dropped; the plant had replaced the light strips. I confirmed it by comparing the brightness histogram and model confidence against launch data. I collected 400 images under the new lighting, labelled them using the model's pre-labels, fine-tuned and evaluated on held-out images from both lighting conditions, and ran it in shadow mode for two days before switching. I also added an input-brightness monitor with an alert. **Result.** False rejects fell from 8% to 0.7% with recall unchanged at 99.2%, and the monitor caught a similar issue three months later in one hour. **Learning.** I now add data-drift monitoring and a lighting check to every deployment.

Notice: specific, a method, numbers, own actions, a lesson.

## Questions to ask the interviewer

Good questions show maturity and help you judge the job:

- "What does the data pipeline look like, and how are labels produced and checked?"
- "How do you evaluate models before release? Is there a frozen test set, slices and a shadow stage?"
- "How does a model get from a notebook to production here? Who owns monitoring?"
- "What hardware and sensors do the models run on? What are the latency and power constraints?"
- "What was the last significant failure in production, and what changed afterwards?"
- "How are decisions made between buying versus building, classical versus deep approaches?"
- "What would success look like in this role after six months?"
- "How much time is there for reading papers, experiments, and writing tests?"

## An eight-week plan

Assumes **10-15 hours per week**. Adjust the weighting to your target role (see the first lesson of this module). Each week ends with a **self-test**: explain the week's key topics aloud for 2 minutes each, without notes.

| Week | Focus | Do |
|---|---|---|
| **1** | **Image fundamentals and processing** (modules 1-2) | Run every example; write convolution, histogram equalisation and Otsu from scratch (coding lesson problems 3, 5, 6); explain Canny, Gaussian vs median vs bilateral, Fourier view |
| **2** | **Shapes and features** (modules 3-4) | Hough, contours, watershed; Harris, SIFT, ORB; matching with ratio test; RANSAC and homography; coding problems 7, 9-12 |
| **3** | **Camera geometry and 3-D** (module 5) | Pinhole model, calibration, PnP, stereo, epipolar geometry, triangulation, SfM/BA, SLAM, ICP, hand-eye; do the maths lesson sections 1, 4; draw each pipeline from memory |
| **4** | **Motion, learning basics and CNNs** (modules 6-8) | Optical flow, Kalman filter, tracking; ML metrics, backprop; CNN math, ResNet, training recipes, debugging; PyTorch coding problems 1, 8, 10, 11 |
| **5** | **Detection and segmentation** (modules 9-10) | IoU/NMS/mAP, anchors vs anchor-free, YOLO, DETR; U-Net, Mask R-CNN, Dice/focal, SAM; coding problems 1, 2, 14 and PyTorch 3-5 |
| **6** | **Transformers, foundation models, generative** (modules 11-12) | ViT, Swin, SSL (SimCLR/DINO/MAE), CLIP, VLMs, LoRA; GANs vs diffusion, latent diffusion, FID; PyTorch problem 2 and 6 |
| **7** | **Applications and deployment** (modules 13-15) | Pose, OCR, depth, anomaly, retrieval; 3-D detection, grasping, VLA (if robotics); ONNX, quantisation, latency, edge, MLOps, testing; maths lesson 2 |
| **8** | **Simulation** (module 16) | Question banks (cover and answer aloud), two system designs, two mock coding sessions (45 min each), project pitch, behavioural stories, final review of weak spots |

**Daily routine** (about 2 hours): 40 minutes reading/running a lesson, 40 minutes coding or deriving, 20 minutes answering interview boxes aloud, 20 minutes reviewing yesterday's mistakes in a notebook.

**If you have 2 weeks**: do the question banks, the 14 coding problems, the maths cheat sheet, one design a day, and re-run your own project's evaluation. **If you have 4 weeks**: weeks 1-8 compressed, skipping topics outside the role.

## Role-specific emphasis

| Target role | Spend extra time on |
|---|---|
| Robotics / AV perception | Module 5 (all), 6 (Kalman, MOT), 14 (3-D detection, matching, grasping), the maths lesson, C++ basics for vision |
| Applied ML / vision engineer | Modules 8-12, the PyTorch coding lesson, system design, data engines |
| Edge / embedded | Module 15 (all), module 8 efficient architectures, profiling, C++ and CUDA basics |
| Research / applied scientist | Modules 11-12 and 14, recent papers (see resources), maths, experiment design, ablations |
| Classical CV / industrial inspection | Modules 1-5, anomaly detection, imaging and lighting, calibration, speed |

## Final week checklist

- [ ] Two project stories rehearsed (90 seconds and 10 minutes), with numbers and failure cases
- [ ] Can write IoU, NMS, convolution, resize and k-means in 10 minutes each
- [ ] Can explain RANSAC, homography, calibration, stereo depth and the Kalman filter with diagrams
- [ ] Can explain how a detector is trained and evaluated (IoU, NMS, mAP, anchors, losses)
- [ ] Can explain ViT, CLIP and diffusion in two minutes each, with limits
- [ ] Can describe a deployment path (ONNX, TensorRT, quantisation) and how you would debug a deployed accuracy drop
- [ ] One full mock interview done with a friend, including a design question
- [ ] Questions prepared for the interviewer
- [ ] Logistics: environment, charger, editor setup, quiet room, a glass of water; sleep

:::interview Rapid-fire self-test (answer each in 20 seconds)
- What does `INTER_AREA` do and when do you use it?
- Why does Canny use hysteresis?
- What makes SIFT scale-invariant?
- When is a homography exact?
- Write the formula for stereo depth and say how its error scales.
- What does the Kalman gain balance?
- What is the difference between mIoU and PQ?
- Why does focal loss help in dense detection?
- What is the role of the class token in ViT?
- How does CLIP do zero-shot classification?
- What does classifier-free guidance do?
- Why do you calibrate with per-channel scales in INT8?
- Name three reasons a model works in the lab but fails in the field.
- What is a golden test set?
:::

```quiz
? In a STAR answer, which part should be the longest?
+ Action: what you specifically did
- Situation
- Result
> Interviewers evaluate your own contribution.

? What is the best way to present a project result?
+ A number compared with a baseline, with how it was measured
- Only the architecture name
- Only a screenshot
> Rigorous and defensible.

? What is a good question for the interviewer?
+ "How do you evaluate models before release and what happened after the last production failure?"
- "How many holidays do I get?" as the first question
- None; asking questions looks weak
> It shows interest in practice and rigour.

? You have two weeks before the interview. What gives the best return?
+ Question banks, core coding problems, system designs and project stories
- Reading every paper from the last year
- Learning a new framework
> Focus on what is asked.
```

:::keypoints
- Prepare two or three projects deeply: problem, data, baseline, approach and why, metrics, error analysis, engineering, results, your role, next steps.
- Answer behavioural questions with STAR; be specific, own your actions, quantify results and state what you learned.
- Use the eight-week plan (breadth, depth, simulation), weight it for your target role, and finish with mock interviews and a checklist.
- Ask good questions: data and labels, evaluation, deployment and monitoring, constraints, failures and success criteria.
:::

:::resources
- [Chip Huyen: Machine Learning Interviews Book](https://huyenchip.com/ml-interviews-book/) — structure of ML interviews and many practice questions.
- [Amazon Leadership Principles and STAR format guide](https://www.amazon.jobs/en/principles) — a common framing of behavioural questions.
- [Pramp: free mock interviews](https://www.pramp.com) — practise live with peers.
:::
