---
title: Face Detection, Recognition and Verification
level: advanced
time: 45
summary: The face pipeline end to end. Detection, landmarks and alignment, embedding networks trained with margin losses (ArcFace), verification versus identification, ROC/EER/TAR@FAR metrics with a runnable demo, liveness and spoofing, and bias, privacy and responsible use.
---

Face recognition is a good topic to practise because it combines almost everything: detection, geometry, deep embeddings, metric learning and careful evaluation.

## The pipeline

:::flow Face recognition
Detect | Find faces and 5 landmarks (eyes, nose, mouth corners) with a face detector: RetinaFace, SCRFD, YuNet, BlazeFace, MTCNN (older).
Align | Warp each face to a standard template using the landmarks (a similarity or affine transform with `cv2.estimateAffinePartial2D`; module 3): rotation, scale and position are removed, so the network only sees identity.
Embed | A CNN/ViT (ResNet-50, iResNet, MobileFaceNet) converts the 112×112 crop to a **512-d vector**, L2-normalised.
Compare | Cosine similarity (or Euclidean distance) between two embeddings; large means the same person.
Decide | Threshold for **verification** (same person?), nearest neighbour in a gallery for **identification** (who is it?).
:::

## Verification versus identification

- **Verification (1:1)**: "Is this person who they claim?" (phone unlock, border control). One comparison against one stored template. Metric: ROC at fixed false-accept rate.
- **Identification (1:N)**: "Who is this?" against a gallery of N people. Closed-set: always return the best match; **open-set**: also return "unknown" when the best similarity is below the threshold. Needs approximate nearest-neighbour search (FAISS) for millions of faces. Errors grow with N, so thresholds must be set for the gallery size.

## How the embedding is trained: margin losses

A plain softmax classifier over thousands of identities learns features that separate the training people but are not compact enough for comparing **new** people. Modern losses work on **normalised** features and **angles** and add a **margin**:

- **Triplet loss / contrastive loss**: pull same-person pairs together, push different-person pairs apart by a margin (FaceNet). Hard to mine good triplets.
- **SphereFace, CosFace, ArcFace**: normalise features and class weights so that the logit is `s·cos θ`; then require the correct class to win **with a margin**: CosFace subtracts `m` from `cos θ`; **ArcFace** adds an **angular margin** to the angle, `cos(θ + m)`, with `s` about 30–64 and `m` about 0.5. Training becomes harder, so the identity clusters become **tight and well separated**, which is exactly what verification needs.
- **AdaFace, MagFace, ElasticFace** adapt the margin to image quality.
- Large data: MS1MV3, Glint360K, WebFace42M (with licensing and consent concerns).

```python run title="Verification metrics (EER, TAR@FAR) and the ArcFace margin" level=advanced
import numpy as np

rng = np.random.default_rng(0)
def norm(x): return x / np.linalg.norm(x, axis=-1, keepdims=True)
ids, per, D = 200, 5, 64
centres = norm(rng.normal(0, 1, (ids, D)))                           # one "identity direction" per person

def make(noise):
    emb = norm(centres[:, None, :] + noise * rng.normal(0, 1, (ids, per, D)) / np.sqrt(D))   # 5 photos per person, noise = pose, light, age
    return emb

def evaluate(emb):
    flat = emb.reshape(-1, D); lab = np.repeat(np.arange(ids), per)
    S = flat @ flat.T
    iu = np.triu_indices(len(flat), 1)
    same = (lab[:, None] == lab[None, :])[iu]; s = S[iu]
    gen, imp = s[same], s[~same]
    thr = np.sort(imp)[int(len(imp) * (1 - 1e-3))]                    # threshold giving false-accept rate 0.1%
    tar = float((gen > thr).mean())
    ths = np.linspace(-0.2, 1, 600)
    far = np.array([(imp > t).mean() for t in ths]); frr = np.array([(gen <= t).mean() for t in ths])
    eer = float(far[np.argmin(np.abs(far - frr))])
    return gen.mean(), imp.mean(), eer, tar

print("photo noise | genuine cos | impostor cos | EER    | true-accept at FAR 0.1%")
for noise in (0.5, 1.0, 1.5, 2.0, 3.0):
    g, i, e, t = evaluate(make(noise))
    print(f"{noise:>11} | {g:>11.2f} | {i:>12.2f} | {e:.4f} | {t:.3f}")
print("lower noise (more compact identity clusters) gives lower EER; training losses like ArcFace aim to make the clusters tight and far apart")

# --- additive angular margin (ArcFace): make the correct class harder during training
def arcface_logits(cos, y, s=30.0, m=0.5):
    theta = np.arccos(np.clip(cos, -1, 1))
    out = cos.copy()
    out[np.arange(len(y)), y] = np.cos(theta[np.arange(len(y)), y] + m)   # add the margin m (radians) to the angle of the true class
    return s * out
def ce(logits, y):
    z = logits - logits.max(1, keepdims=True); p = np.exp(z) / np.exp(z).sum(1, keepdims=True)
    return float(-np.log(p[np.arange(len(y)), y]).mean())
n_cls = 50
W = norm(rng.normal(0, 1, (n_cls, D))); y = rng.integers(0, n_cls, 400)
x = norm(W[y] + 1.2 * rng.normal(0, 1, (400, D)) / np.sqrt(D))
cos = x @ W.T
print(f"softmax loss on normalised features {ce(30 * cos, y):.3f}  |  ArcFace (m=0.5) loss {ce(arcface_logits(cos, y), y):.3f}   (higher: the same sample must now be closer to its class centre)")
```

## Metrics you must know

- **FAR (false accept rate)**: impostor pairs wrongly accepted. **FRR (false reject rate)**: genuine pairs wrongly rejected.
- **ROC**: true accept rate (TAR = 1 − FRR) versus FAR. Report **TAR @ FAR = 1e-3 / 1e-4 / 1e-6** (security-critical systems care about tiny FAR).
- **EER**: the point where FAR = FRR (a single number; not an operating point).
- **Rank-1 / rank-5 accuracy** and CMC curves for identification; **open-set** adds the detection and identification rate at a false-alarm rate.
- **Benchmarks**: LFW (saturated, 99.8%), IJB-B/C, MegaFace, NIST FRVT/FRTE.
- Always evaluate across **demographics, ages, poses, lighting and image quality**, not just the average.

## Real-world issues

- **Pose, occlusion and masks**: profile faces and masks reduce accuracy; train with such augmentations.
- **Low resolution and blur**: below about 32 px between the eyes accuracy drops fast; use quality scores (SER-FIQ, MagFace norm) to reject poor images instead of guessing.
- **Presentation attacks (spoofing)**: a printed photo, a screen replay, a 3-D mask or a deepfake. **Liveness detection** uses texture and moiré cues, depth/IR sensors, challenge-response (blink, turn), rPPG (pulse from skin colour), and dedicated PAD classifiers. Evaluate with APCER/BPCER/ACER.
- **Template security**: embeddings are biometric data; store them encrypted or as protected templates, and avoid keeping raw photos.
- **Domain shift**: a model trained on web celebrities can be weaker on factory cameras, infrared images or children.

## Bias, privacy and responsible use

Face recognition accuracy has been shown to vary across demographic groups (NIST FRVT, Gender Shades), partly due to data imbalance. Interview-ready points:

- Measure error rates **per group** at the **same threshold** and report the gap; rebalance data; use quality-aware thresholds.
- **Consent and law**: biometric data is regulated (GDPR special category, India's DPDP Act 2023, BIPA in Illinois, EU AI Act limits on real-time remote biometric identification). Collect the minimum, say why, allow opt-out, set retention limits.
- **Human in the loop** for high-stakes decisions, an audit trail, and an easy way to contest errors.
- Prefer **verification with consent** (unlock a door) to **mass identification** (watching crowds), and consider whether a face is needed at all (a badge may do).

```python
# Detection + embedding with common open-source tools (needs downloads; not run in this course)
# pip install insightface onnxruntime opencv-python
import cv2
from insightface.app import FaceAnalysis
app = FaceAnalysis(name="buffalo_l"); app.prepare(ctx_id=0, det_size=(640, 640))
faces = app.get(cv2.imread("people.jpg"))                       # each face has bbox, 5-point kps, normed_embedding (512-d)
sim = float(faces[0].normed_embedding @ faces[1].normed_embedding)   # cosine similarity; compare to a threshold set from your ROC
```

:::interview Questions you may get
- "Walk me through a face recognition system." Detect, landmarks, alignment, embedding with a margin-loss model, cosine similarity, threshold from the ROC for verification or ANN search for identification.
- "Why is alignment needed?" Removes pose/scale variation so the embedding network can focus on identity; improves accuracy.
- "What is ArcFace and why does it work better than softmax?" Normalised features and weights with an additive angular margin `cos(θ + m)`, forcing compact, separated classes in angular space.
- "How do you choose the threshold?" From the ROC on validation data at the target FAR, per use-case and gallery size; recalibrate per camera/domain.
- "How would you defend against spoofing?" Liveness: texture/depth/IR cues, challenge-response, PAD models, multi-sensor; evaluate with APCER/BPCER.
- "What bias risks exist?" Differences in error rates across groups; measure per group, rebalance data, calibrate thresholds, human review, privacy-by-design.
:::

```quiz
? What is compared in face verification?
+ Two embeddings, using cosine similarity against a threshold
- Two images pixel by pixel
- Two bounding boxes
> Embeddings capture identity.

? What does ArcFace add to the softmax loss?
+ An angular margin on the true class, with normalised features and weights
- A larger network
- Random crops
> It tightens identity clusters.

? You need a very low false-accept rate. Which number do you report?
+ TAR at a fixed small FAR such as 1e-4
- Accuracy at threshold 0.5
- Training loss
> Security systems operate in the extreme tail.

? Why can a printed photo fool a naive system?
+ It contains the same face pattern; only liveness checks can tell it is not a live person
- The embedding changes with paper
- Cameras cannot see paper
> Presentation attack.
```

:::problem A factory wants face unlock for 300 employees at 10 gates (indoor, hard hats, safety glasses, some with masks). Design the system and the evaluation. {level=hard tags="face,verification,deployment"}
Think about occlusions, thresholds, liveness, privacy and metrics.

:::solution Model answer
Use 1:1 verification with a badge/PIN claim to narrow identity (or 1:N over 300 people, which is small). Collect enrolment photos with hard hat/glasses variants; pick a model trained with occlusion augmentation; run detection + alignment at each gate with a fixed camera and lighting (NIR illuminator if lighting varies). Set the threshold from an ROC measured on a pilot at the real gates for a target FAR (for example 1e-4) and report TAR; combine with a second factor for exceptions. Add liveness (NIR/depth or challenge-response). Evaluate per person group (glasses, hat, mask, lighting, time of day), measure throughput/latency and false-reject rework. Privacy: consent, on-device or encrypted templates, retention policy, opt-out alternative, audit logs.
:::
:::

:::keypoints
- Pipeline: detect, align (landmarks + similarity transform), embed (512-d, normalised), compare (cosine), decide (threshold or nearest neighbour).
- Margin-based softmax losses (CosFace, ArcFace) create compact, separated identity clusters; triplet/contrastive losses are alternatives.
- Evaluate with ROC, TAR@low FAR, EER, rank-k, per demographic group; pick thresholds on the target domain and gallery size.
- Handle spoofing with liveness, protect biometric templates, measure bias, follow consent and law.
:::

:::resources
- [Deng et al.: ArcFace: Additive Angular Margin Loss for Deep Face Recognition](https://arxiv.org/abs/1801.07698) — the loss.
- [Schroff et al.: FaceNet: A Unified Embedding for Face Recognition and Clustering](https://arxiv.org/abs/1503.03832) — triplet loss embeddings.
- [Deng et al.: RetinaFace](https://arxiv.org/abs/1905.00641) — a strong face detector.
- [NIST Face Recognition Vendor Test (FRVT/FRTE)](https://pages.nist.gov/frvt/html/frvt11.html) — independent evaluation, including demographic effects.
:::
