---
title: Video Understanding — Action Recognition and Video Models
level: advanced
time: 45
summary: How models read video. Sampling frames, 2D CNNs with temporal pooling, two-stream networks, 3D convolutions (C3D, I3D, SlowFast), video transformers (TimeSformer, ViViT, VideoMAE), the cost of time, benchmarks, and how video-language models work.
---

So far we tracked objects. **Video understanding** asks bigger questions about the whole clip: *what is happening?* (**action recognition**), *when does it start and end?* (**temporal localisation**), *describe it* (**captioning**), *answer a question about it* (**video QA**). Video adds a third dimension, time, and with it a large cost.

## Why video is harder

- **Cost**: a 10-second clip at 30 fps is 300 frames. Processing every frame with an image model is 300 times the work.
- **Redundancy**: neighbouring frames are nearly the same. Most of the compute would be wasted.
- **Motion matters**: some actions can only be told apart by **how** things move ("pushing something left to right" versus "right to left"), not by what is visible in a single frame ("a person with a cup").
- **Long range**: events can span minutes (a whole cooking recipe).
- **Data**: labelling video is expensive; datasets are noisy.

### See it: a clip and its reverse

Play a clip backwards: every frame is the same, but the meaning is reversed. A model that only looks at single frames, or at an order-blind **bag of frames**, cannot tell the difference. Motion information (optical flow from module 6, or learned temporal layers) is needed.

```python run title="A clip and its reverse: same frames, opposite motion" level=intermediate
import numpy as np
import cv2
import cvlab

frames, tracks = cvlab.video(n=40, size=(256, 192), noise=2)
backward = frames[::-1]                                          # the same frames played in reverse: the ball now moves the other way

def appearance_feature(clip):                                    # an order-blind "bag of frames": the average colour histogram
    h = [cv2.calcHist([f], [c], None, [8], [0, 256]).ravel() for f in clip for c in range(3)]
    return np.mean(np.array(h).reshape(len(clip), -1), axis=0)

def motion_feature(clip, step=3):                                # mean horizontal optical flow over the moving pixels
    us = []
    for i in range(0, len(clip) - step, step):
        a, b = cv2.cvtColor(clip[i], cv2.COLOR_RGB2GRAY), cv2.cvtColor(clip[i + step], cv2.COLOR_RGB2GRAY)
        flow = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        mag = np.linalg.norm(flow, axis=2)
        us.append(flow[..., 0][mag > 1.0].mean() if (mag > 1.0).any() else 0.0)
    return np.array(us)

fa, ba = appearance_feature(frames), appearance_feature(backward)
print("appearance feature (colour histogram of all frames): difference between the clip and its reverse =", float(np.abs(fa - ba).max()))
mf, mb = motion_feature(frames), motion_feature(backward)
print("motion feature, mean horizontal flow over time (forward):", np.round(mf[:5], 2), "...")
print("motion feature, mean horizontal flow over time (reverse):", np.round(mb[:5], 2), "...")
print("three objects move in different directions, yet the overall average flips sign when time is reversed: forward %.2f, reverse %.2f" % (mf.mean(), mb.mean()))
print("so the motion feature separates the two clips, and the appearance feature (identical) cannot")
step = 3
a, b = cv2.cvtColor(frames[10], cv2.COLOR_RGB2GRAY), cv2.cvtColor(frames[10 + step], cv2.COLOR_RGB2GRAY)
flow = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 3, 15, 3, 5, 1.2, 0)
hsv = np.zeros_like(frames[10]); mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])
hsv[..., 0] = ang * 90 / np.pi; hsv[..., 1] = 255; hsv[..., 2] = np.clip(mag * 40, 0, 255).astype(np.uint8)
cvlab.show(frames[10], "Frame 10", cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB), "Optical flow (colour = direction)")
```

## The big design families

:::flow From frames to a video model
Sample frames | Do not use every frame. Take T frames (8, 16, 32) evenly or randomly from the clip. This is the first and most important cost control.
2D CNN per frame + pooling | Run an image CNN on each frame, average the features over time (TSN). Simple, strong on "appearance" actions. Misses fine motion.
Two-stream | One CNN on RGB (appearance), one on stacked optical flow (motion). Combine. Strong but flow is slow to compute.
3D convolutions | Convolve over height, width and time together (C3D, I3D, R(2+1)D, SlowFast). Learn motion directly.
Video transformers | Split the video into spatio-temporal patches and use attention (TimeSformer, ViViT, Video Swin, MViT, VideoMAE).
Video-language models | A vision encoder turns frames into tokens, a language model reasons over them (Video-LLaVA, Qwen-VL video, Gemini, GPT-4o video input).
:::

### 3D convolutions

A 2D convolution slides a `k × k` kernel over height and width. A **3D convolution** uses a `k × k × k` kernel, so it also slides over **time** and can detect **motion patterns** (an edge moving left). The cost and the parameter count are about `k` times bigger.

- **C3D** (2015): a plain 3D VGG-style network.
- **I3D** (2017): **inflate** a pretrained 2D image network into 3D by copying its weights along the time axis, so ImageNet pre-training helps video.
- **R(2+1)D**: factor the 3D convolution into a spatial 2D one plus a temporal 1D one: fewer parameters, an extra non-linearity.
- **SlowFast** (2019): two pathways: a **slow** one (few frames, many channels: captures appearance) and a **fast** one (many frames, few channels: captures motion). Inspired by the human visual system, very efficient.

```python run title="2D versus 3D convolution: parameters and output shapes" level=intermediate
def conv_params(cin, cout, k, kt=1):
    return cin * cout * k * k * kt                                    # no bias

cin, cout = 64, 64
print("one 3x3 2D conv:", conv_params(cin, cout, 3), "parameters")
print("one 3x3x3 3D conv:", conv_params(cin, cout, 3, 3), "parameters  (3 times as many)")
print("(2+1)D version (3x3 spatial then 3 temporal):", conv_params(cin, cout, 3) + cin * cout * 3, "parameters")

T, H, W = 16, 112, 112                                                # 16 frames of 112 x 112
for name, kt in (("2D conv on each frame separately", 1), ("3D conv, time kernel 3", 3)):
    flops = T * H * W * cout * cin * 9 * kt
    print(f"{name}: {flops / 1e9:.1f} GFLOPs per layer (multiply-adds)")
```

### Video transformers

Cut the video into **tubelets** (small spatio-temporal blocks, for example 2 frames × 16 × 16 pixels) and treat each as a token. Full attention over all tokens is very expensive (tokens grow with `T × H × W`), so models use tricks:

- **TimeSformer**: **divided attention**: attend over time first (same patch position across frames), then over space (within the frame). Much cheaper.
- **ViViT**: several factorised designs; tubelet embedding.
- **Video Swin**, **MViT** (multiscale): windowed or pooled attention, hierarchical like image Swin.
- **VideoMAE** (self-supervised): mask 90% of the tubelets and train the model to reconstruct them. Video is so redundant that a very high mask ratio works, and the model learns strong features without labels.

## Frame sampling: the practical secret

```python run title="Uniform and random frame sampling" level=easy
import numpy as np

def sample_indices(n_frames, n_samples, mode="uniform", rng=None):
    """Which frames of a clip to feed to the model."""
    segment = n_frames / n_samples
    if mode == "uniform":                                           # the centre of each of n_samples equal segments (testing)
        return (segment * (np.arange(n_samples) + 0.5)).astype(int)
    rng = rng or np.random.default_rng(0)                            # one random frame inside each segment (training: acts as augmentation)
    return (segment * (np.arange(n_samples) + rng.random(n_samples))).astype(int)

n = 300                                                              # a 10 s clip at 30 fps
print("uniform 8 frames :", sample_indices(n, 8))
print("random 8 frames  :", sample_indices(n, 8, "random", np.random.default_rng(1)))
print("uniform 16 frames:", sample_indices(n, 16))
```

This "**segment-based sampling**" (from TSN) keeps the whole clip's story with a fixed number of frames, whatever its length. At training time, taking a random frame within each segment is a cheap and effective augmentation. For motion-sensitive tasks, models use more frames or a denser "fast" path.

## A look at a 3D-CNN in PyTorch

On your computer, with PyTorch and torchvision, you can build a video network in two lines. Random weights here (to see the shapes and the cost).

```python local check title="A 3D ResNet in torchvision: shapes and parameters"
import torch
from torchvision.models.video import r3d_18, mvit_v1_b

model = r3d_18(weights=None).eval()                         # a ResNet-18 with 3D convolutions
clip = torch.rand(2, 3, 16, 112, 112)                       # (batch, channels, time, height, width): 16 frames of 112 x 112
with torch.no_grad():
    logits = model(clip)
print("R3D-18 input :", tuple(clip.shape), "(B, C, T, H, W)")
print("R3D-18 output:", tuple(logits.shape), "(one score per Kinetics-400 class)")
print("parameters   :", sum(p.numel() for p in model.parameters()) // 1_000_000, "million")

vit = mvit_v1_b(weights=None).eval()
x = torch.rand(1, 3, 16, 224, 224)
with torch.no_grad():
    print("MViT-B output:", tuple(vit(x).shape), " parameters:", sum(p.numel() for p in vit.parameters()) // 1_000_000, "million")
```

Note the input layout: **(B, C, T, H, W)**, with time as its own axis. Many image habits (resizing, normalising per channel) apply frame by frame.

## Tasks and datasets

| Task | Question | Datasets |
|---|---|---|
| **Action recognition** | One label per clip: "playing guitar" | UCF-101, HMDB-51 (small), **Kinetics-400/600/700** (large, appearance heavy), **Something-Something v2** (needs motion) |
| **Temporal action localisation** | Find the start and end of each action in a long video | ActivityNet, THUMOS, Charades |
| **Spatio-temporal action detection** | Who does what, where, when | AVA |
| **Video object segmentation** | Mask the objects through the video | DAVIS, YouTube-VOS (SAM 2) |
| **Video captioning / QA** | Describe or answer questions | MSR-VTT, ActivityNet-QA, Ego4D, Video-MME |
| **Egocentric video** | First-person understanding | Ego4D, EPIC-KITCHENS |

**Kinetics** is mostly solvable from a single frame (a guitar means "playing guitar"). **Something-Something** needs real temporal reasoning. When you evaluate a video model, check which kind of dataset you use.

## Video-language models

Modern video understanding often uses a **vision-language model**: sample frames (for example 1 per second), turn each frame into visual tokens with an image encoder (CLIP/SigLIP), reduce the tokens (pooling, a Q-Former, merging), and feed them to a **large language model** along with the question. Models such as Video-LLaVA, LLaVA-Video, Qwen-VL and the large commercial models can summarise, answer and reason over video. The big challenge is **length**: an hour of video would need millions of tokens, so systems use **adaptive sampling**, **token compression**, **memory**, or **retrieval** of relevant segments.

## Efficiency tricks

- Fewer, smarter frames (keyframes; adaptive sampling); lower resolution.
- Reuse features; process only motion regions.
- **Compressed-domain** methods read the codec's motion vectors instead of computing optical flow.
- Distil big video models into small ones; use image-pretrained backbones (inflation, CLIP).
- **Streaming** models keep a memory rather than reprocessing overlapping clips.

:::interview Questions you may get
- "How do you extend an image CNN to video?" Sample T frames and pool features over time (TSN), or use 3D convolutions (I3D by inflating 2D weights), or add temporal attention (TimeSformer).
- "What is a 3D convolution and its cost?" A kernel over height, width and time; about k times more parameters and compute than the 2D version.
- "Idea behind SlowFast?" A slow pathway (few frames, rich channels) for appearance and a fast pathway (many frames, light channels) for motion.
- "Why mask 90% in VideoMAE?" Video is highly redundant, so a high ratio makes the task hard enough to learn good features and cuts the cost.
- "Kinetics versus Something-Something?" Kinetics is mostly recognisable from appearance; Something-Something requires temporal reasoning.
- "How would you handle a one-hour video question?" Retrieve or sample relevant segments, compress tokens, hierarchical summaries.
:::

```quiz
? What is the first and most important cost control in video models?
+ Sampling a small number of frames from the clip
- Using colour
- Larger batch size
> The cost grows with the number of frames.

? What does I3D "inflation" do?
+ Copies a pretrained 2D network's weights along the time axis to make a 3D network
- Doubles the frame rate
- Increases resolution
> It lets ImageNet pre-training help video.

? What is the input layout of a typical PyTorch video model?
- (B, T, H, W, C)
+ (B, C, T, H, W)
- (T, B, C)
> Channels first, with time as its own axis.

? Which dataset needs real temporal reasoning rather than single-frame appearance?
- Kinetics
+ Something-Something v2
- ImageNet
> Actions differ by motion direction or order of events.
```

:::problem You must build an action classifier for factory videos (assembly steps) with 500 labelled clips and a GPU budget of one day. What is your plan? {level=medium tags="video,transfer-learning,design"}
Think about pretrained models and sampling.

:::solution Model answer
Start from a pretrained video backbone (VideoMAE/VideoMAE V2, TimeSformer, SlowFast or an inflated image model) or even a strong image model (DINOv2/CLIP) with temporal pooling, and fine-tune only the last layers (linear probe, then partial fine-tuning) because 500 clips are few. Use segment-based sampling with 8–16 frames, strong augmentation (random crops, flips if actions allow them, colour jitter, temporal jitter), balanced sampling and a validation split by **session or worker** (not by clip) to avoid leakage. Check whether appearance alone already identifies the step (a baseline with single frames); if the steps differ by motion, increase frames or add a motion pathway. Measure per-class precision/recall and confusion between similar steps; consider a temporal model (small transformer or TCN) on top of frame features for sequences of steps.
:::
:::

:::keypoints
- Video models must cut cost: sample frames (segment-based), reduce tokens, use pretrained backbones.
- Families: 2D CNN + pooling (TSN), two-stream (RGB + flow), 3D CNNs (C3D, I3D, R(2+1)D, SlowFast), video transformers (TimeSformer, ViViT, Video Swin, MViT, VideoMAE).
- Input layout `(B, C, T, H, W)`. Kinetics is appearance-heavy; Something-Something needs motion.
- Video-language models sample frames, compress visual tokens and let an LLM answer; long video needs retrieval or memory.
:::

:::resources
- [Carreira and Zisserman: Quo Vadis, Action Recognition? (I3D)](https://arxiv.org/abs/1705.07750) — inflation and Kinetics.
- [Feichtenhofer et al.: SlowFast Networks for Video Recognition](https://arxiv.org/abs/1812.03982) — the two-pathway network.
- [Bertasius et al.: Is Space-Time Attention All You Need for Video Understanding? (TimeSformer)](https://arxiv.org/abs/2102.05095) — divided attention.
- [VideoMAE: Masked Autoencoders are Data-Efficient Learners for Self-Supervised Video Pre-Training](https://arxiv.org/abs/2203.12602) — masked video pre-training.
:::
