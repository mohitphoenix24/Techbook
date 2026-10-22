---
title: Testing, Robustness, Calibration and Responsible Vision
level: advanced
time: 50
summary: Proving that a vision system is safe to trust. Test-set design and leakage, slice testing, robustness to corruptions, calibration and confidence thresholds (runnable), out-of-distribution handling, fairness and privacy, safety cases for robots and vehicles, and a pre-launch checklist.
---

"It has 95% accuracy" is the start of a conversation, not the end. A shippable vision system needs evidence that it is accurate **where it matters**, **robust** to real-world variation, **honest about uncertainty**, and **safe when it fails**.

## Designing the test set

- **Hold out realistically**: split by **scene, camera, site, day or customer**, not by random image. Random splits of video frames or near-duplicates leak information and inflate the metric.
- **Freeze it**: a test set that you look at while tuning is a validation set. Keep a **final** test set untouched until the decision, and a **golden regression set** (a few hundred images with hand-checked expected outputs) in CI.
- **Represent production**: include the bad days: night, rain, dirty lens, motion blur, rare classes, empty scenes (for false alarms), crowded scenes (for misses). Weight the slices by business importance, not only by frequency.
- **Enough samples**: a 95% accuracy estimate from 100 images has a 95% confidence interval of about ±4 points; to confirm a 1-point difference you need thousands. Use **bootstrap** confidence intervals and report them.
- **Label quality in the test set** matters most: re-check and adjudicate the test labels; a noisy test set caps the measured score and hides real improvements.
- **Negatives matter**: a detector evaluated only on images that contain objects can show a great recall and a terrible false-alarm rate in production. Measure **false positives per image / hour**.

## Slice testing

Average metrics hide failures. Break the evaluation into slices and look for the **worst**: by class, object size, distance, lighting, camera, site, time of day, season, demographic group, occlusion level, image quality. A model with 97% overall accuracy and 60% on the night slice is a night-time failure waiting to happen. Define **per-slice acceptance thresholds** before testing, and add the worst slices to the training and monitoring plans.

## Robustness to corruptions

Real images are blurred, noisy, compressed, dark, shifted, partly covered. Benchmarks such as **ImageNet-C** apply standard corruptions (noise, blur, weather, digital artefacts) at five severities. Do the same for your domain: simulate what your camera will do (focus error, exposure change, vibration shift, lens dirt, JPEG at low quality, glare), and measure accuracy versus severity. The demo shows a digit classifier at 98% clean accuracy:

```python run title="Calibration under shift, corruption curves and slice accuracy" level=advanced
import numpy as np
import cv2
from scipy.optimize import minimize_scalar
from sklearn.datasets import load_digits
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split

X, y = load_digits(return_X_y=True); X = X / 16.0
Xtr, Xrest, ytr, yrest = train_test_split(X, y, test_size=0.5, random_state=0, stratify=y)
Xval, Xte, yval, yte = train_test_split(Xrest, yrest, test_size=0.5, random_state=0, stratify=yrest)
clf = MLPClassifier((256, 256), alpha=0.0, max_iter=400, random_state=0).fit(Xtr, ytr)
print(f"test accuracy {clf.score(Xte, yte):.3f}")

def softmax_T(logp, T):
    z = logp / T; z -= z.max(1, keepdims=True); e = np.exp(z); return e / e.sum(1, keepdims=True)
def ece(p, y, bins=10):
    conf, pred = p.max(1), p.argmax(1); edges = np.linspace(0, 1, bins + 1); total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any(): total += m.mean() * abs((pred[m] == y[m]).mean() - conf[m].mean())
    return total
def nll(p, y): return float(-np.log(p[np.arange(len(y)), y] + 1e-12).mean())

def blur(A, sigma): return np.clip(np.array([cv2.GaussianBlur(i, (0, 0), sigma) for i in A.reshape(-1, 8, 8).astype(np.float32)]), 0, 1).reshape(len(A), -1)
Xval_b, Xte_b = blur(Xval, 1.0), blur(Xte, 1.0)                                  # a camera that is slightly out of focus
logp = lambda A: clf.predict_log_proba(A)
print("data                          | accuracy | mean confidence | ECE")
for name, A in [("clean test images", Xte), ("blurred test images (sigma 1.0)", Xte_b)]:
    p = softmax_T(logp(A), 1.0)
    print(f"{name:<30}| {np.mean(p.argmax(1) == yte):>8.3f} | {p.max(1).mean():>15.3f} | {ece(p, yte):.4f}")
T = minimize_scalar(lambda t: nll(softmax_T(logp(Xval_b), t), yval), bounds=(0.3, 10), method="bounded").x      # fit ONE number on a blurred validation set
p = softmax_T(logp(Xte_b), T)
print(f"after temperature scaling (T = {T:.2f}) on blurred data: accuracy {np.mean(p.argmax(1) == yte):.3f} (unchanged), mean confidence {p.max(1).mean():.3f}, ECE {ece(p, yte):.4f}")
print("calibration means a confidence of 0.9 is right about 90% of the time. It can be fine on clean data and overconfident under a shift;")
print("temperature scaling fixes the confidence on the domain you calibrate on, without changing the predicted class")

# ---- robustness to corruptions (like ImageNet-C, in miniature)
rng = np.random.default_rng(0)
imgs = Xte.reshape(-1, 8, 8).astype(np.float32)
def corrupt(kind, level):
    if kind == "noise": out = imgs + rng.normal(0, 0.05 * level, imgs.shape)
    elif kind == "brightness": out = imgs * (1 - 0.15 * level)
    elif kind == "blur": out = np.array([cv2.GaussianBlur(i, (0, 0), 0.4 * level) for i in imgs])
    elif kind == "shift": out = np.array([np.roll(i, level, axis=1) for i in imgs])
    elif kind == "contrast": out = 0.5 + (imgs - 0.5) * (1 - 0.2 * level)
    return np.clip(out, 0, 1).reshape(len(imgs), -1)
print("\ncorruption  | " + " | ".join(f"severity {l}" for l in range(0, 5)))
for kind in ("noise", "brightness", "blur", "shift", "contrast"):
    accs = [clf.score(corrupt(kind, l) if l else Xte, yte) for l in range(0, 5)]
    print(f"{kind:<11} | " + " | ".join(f"{a:>10.3f}" for a in accs))
print("a model with 97% clean accuracy can collapse under a small shift: test the corruptions your cameras will really produce")

# ---- slice analysis: the average hides weak spots
pred = clf.predict(Xte)
dark = Xte.mean(1) < np.quantile(Xte.mean(1), 0.25)
print(f"\naccuracy overall {np.mean(pred == yte):.3f} | darkest quarter of images {np.mean(pred[dark] == yte[dark]):.3f} | brightest 3 quarters {np.mean(pred[~dark] == yte[~dark]):.3f}")
per_class = [np.mean(pred[yte == c] == c) for c in range(10)]
print("worst class:", int(np.argmin(per_class)), f"with accuracy {min(per_class):.3f}; best {max(per_class):.3f}")
```

What to take from it: **(1)** accuracy can fall off a cliff for a modest change (a one-pixel shift!), so train with **augmentation** that matches deployment (shifts, blur, brightness) and test it explicitly; **(2)** the confidence stays high while accuracy falls: **calibration breaks under shift**; **(3)** slice analysis reveals weak spots the average hides.

Remedies: realistic **augmentation** (module 8), training on **multiple domains**, **test-time augmentation**, **robust pre-trained backbones** (self-supervised and large-scale models are usually more robust), **adversarial training** (costly; for security-critical use), **input quality gates** (reject blurred or dark images instead of guessing), and **ensembles**.

## Calibration and confidence thresholds

A calibrated model's confidence matches its accuracy: of all predictions with 0.9 confidence, about 90% are right. Modern deep networks tend to be **overconfident** (Guo et al., 2017). Measure with a **reliability diagram** and **ECE (expected calibration error)**; fix with **temperature scaling** (one scalar fitted on a validation set), **label smoothing**, ensembles or Bayesian approximations (MC dropout), or **conformal prediction** (prediction sets with a statistical coverage guarantee).

Use confidence for decisions: **accept** above a high threshold, **send to a human** in the middle, **reject** below. Choose thresholds on validation data for the cost of each error type (a missed defect may cost 100× a false alarm), and re-check them after every model or camera change. **Selective prediction**: report accuracy at 90% coverage (when the model abstains on the hardest 10%).

## Out-of-distribution (OOD) inputs

A classifier has to answer even when the image is not in its world (a worker's hand, a new product, a lens cap). Softmax confidence on OOD data is often high. Practical defences:

- A **background / "other" class** trained on typical non-target images.
- **OOD scores**: max logit or energy score, Mahalanobis distance on features, k-NN distance in an embedding space (DINOv2/CLIP), ODIN; or an anomaly detector (module 13) on the input.
- **Input checks**: size, brightness, sharpness, empty or frozen frames.
- **Ensembles / disagreement** and **conformal sets** (an uncertain set of many classes signals an unfamiliar image).
- A defined **fallback**: human review, safe stop, re-capture.

## Fairness, privacy and misuse

- **Fairness**: measure performance across groups (skin tone, gender, age, region, clothing, device) at the **same threshold**; report gaps, not just averages. Sources: unbalanced data, label bias, proxy variables, different image quality. Mitigate with data collection, re-weighting, augmentation, threshold review, and by deciding whether the task should be automated at all (see the face lesson).
- **Privacy**: collect the minimum; process on the edge; blur faces/plates if not needed; retention limits; consent; access control; synthetic or de-identified data for development.
- **Misuse and dual use**: think about who can use the system against whom (surveillance, profiling, deepfakes); document intended use and prohibited use; add safeguards.
- **Documentation**: a **model card** (purpose, data, metrics by slice, limitations, ethical considerations) and a **datasheet for datasets** (how the data was collected, labelled, and its biases).
- **Regulation**: EU AI Act risk tiers (biometric identification, safety components, workplace monitoring), GDPR, India's DPDP Act, sectoral standards (medical devices, automotive). Check requirements early; they affect architecture and data handling.

## Safety for robots and vehicles

Perception errors are **random and unavoidable**, so safety cannot rely on the network being right.

- **Defence in depth**: independent redundancy (different sensors and methods), **certified safety sensors** (safety-rated LiDAR scanners, light curtains, e-stops) for protection of people; vision is the "smart" layer on top, not the only safeguard.
- **Safety standards**: ISO 10218 and ISO/TS 15066 (robots and collaborative operation), ISO 13849 / IEC 61508 (functional safety), ISO 26262 and **SOTIF (ISO 21448)** for vehicles (safety of the intended functionality, covering performance limitations of perception), UL 4600 for autonomy.
- **Safety case**: hazards, assumed performance of perception (with numbers and conditions), monitoring that detects when assumptions are violated, safe states, and evidence from testing in simulation and the real world (including **edge cases**: glare, tunnels, children, reflective surfaces).
- **Runtime monitors**: confidence, input quality, time-stamps, sensor disagreement → slow down or stop.
- **Test coverage**: measure scenario coverage, not just image counts; use **fault injection** (cover the camera, flip the image, drop frames) and **simulation** for rare dangerous scenarios.

## Pre-launch checklist

:::flow Before you ship
Data | Test set split by site/day, labels adjudicated, negatives included, frozen; golden regression set in CI.
Accuracy | Metrics with confidence intervals, per slice, per distance/size, false alarms per hour.
Robustness | Corruption curves for the real failure modes; augmentation and gates in place.
Confidence | Calibrated, thresholds chosen on costs, human-review path defined, OOD handling.
System | Latency p99, memory, thermal soak, camera failure tests, safe failure behaviour.
Governance | Model card, data provenance, privacy review, fairness check, monitoring and rollback plan.
Safety | Independent safety layer, hazard analysis, standards mapping, field trial.
:::

:::interview Questions you may get
- "How do you test a vision model before release?" A frozen, representative test set split by site/time, slice metrics, corruption robustness, calibration and false-alarm analysis, a golden regression set, system tests and a field pilot.
- "What is calibration and why does it matter?" Confidence matching accuracy; matters for thresholds, human-in-the-loop routing and risk; measure ECE, fix with temperature scaling.
- "How can an average accuracy of 97% hide a problem?" A weak slice (night, a class, a site) or label bias; slice analysis finds it.
- "How do you handle inputs that are not in the training classes?" Background class, OOD scores, anomaly detection, input quality gates and a fallback.
- "How would you make a perception system safe for a mobile robot?" Redundant sensors, certified protective devices independent of the network, runtime monitors, a hazard analysis and tests including edge cases and fault injection.
- "How many test images do you need?" Enough that the confidence interval is narrow compared with the difference you care about; use bootstrap intervals and stratify.
:::

```quiz
? Which split avoids leakage for video data?
+ By scene, camera or day
- Random frames
- Alternating frames
> Neighbouring frames are almost identical.

? What does a high ECE tell you?
+ The model's confidence does not match its actual accuracy
- The model is too small
- The images are blurry
> Overconfidence or underconfidence.

? Why are slice metrics important?
+ Averages can hide failures on specific conditions or groups
- They make the test set larger
- They replace the test set
> Look for the worst slice.

? In a safety-critical robot cell, which should protect people?
+ Independent certified safety devices, with vision as an additional layer
- The detector's confidence score alone
- A bigger network
> Perception errors are unavoidable.
```

:::problem A hospital asks you to deploy a skin-lesion classifier with 94% accuracy on your test set. List what you need to check before agreeing to a pilot. {level=hard tags="responsible-ai,medical,validation"}
Think about data, slices, calibration, regulation and workflow.

:::solution Model answer
Check where the test data came from (sites, devices, skin tones, ages) and whether it matches the hospital's patients; evaluate by skin tone (Fitzpatrick scale), lesion type, image quality and device; look at sensitivity and specificity at the operating threshold (not accuracy), including rare dangerous classes; check calibration and an "uncertain/refer" pathway; test OOD inputs (rulers, hair, markers, wounds) and robustness to lighting/focus. Verify label quality (histopathology gold standard) and leakage (same patient in train and test). Plan a prospective silent-mode pilot, clinician-in-the-loop use, monitoring, and a regulatory path (medical device rules: FDA/CE/CDSCO). Document intended use, limitations and a model card, and agree failure responsibilities.
:::
:::

:::keypoints
- Build a frozen, realistic, leak-free test set (split by scene/camera/day), include negatives, and report confidence intervals, false alarms and per-slice results.
- Measure robustness to the corruptions your system will see; accuracy can collapse under small shifts, so augment and add quality gates.
- Calibrate confidences (ECE, temperature scaling), set thresholds by costs, and route uncertain or out-of-distribution inputs to a fallback.
- Check fairness, privacy and regulation early; document with model cards; protect people with independent safety systems and a safety case.
:::

:::resources
- [Guo et al.: On Calibration of Modern Neural Networks](https://arxiv.org/abs/1706.04599) — overconfidence and temperature scaling.
- [Hendrycks and Dietterich: Benchmarking Neural Network Robustness to Common Corruptions and Perturbations](https://arxiv.org/abs/1903.12261) — ImageNet-C.
- [Mitchell et al.: Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993) — documenting models.
- [Gebru et al.: Datasheets for Datasets](https://arxiv.org/abs/1803.09010) — documenting datasets.
- [Buolamwini and Gebru: Gender Shades](https://proceedings.mlr.press/v81/buolamwini18a.html) — intersectional accuracy disparities in face analysis.
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — a structured way to manage AI risks.
:::
