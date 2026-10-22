---
title: Data Engines, MLOps and Monitoring for Vision
level: advanced
time: 50
summary: Keeping a vision model good after launch. The data engine loop, labelling workflows and quality control, active learning (with a runnable comparison of selection strategies), dataset versioning, drift detection (PSI and KS tests with a runnable example), shadow mode and rollout, retraining triggers, and monitoring without labels.
---

A model's accuracy at launch is the **best** it will ever be on its own: the world changes (new products, new lighting, new camera firmware) while the model stands still. Companies that run vision systems well do not have better architectures; they have a better **data engine**.

## The data engine loop

:::flow The loop that improves the model
Deploy | The model runs in production and logs predictions, confidence, input statistics and sampled images.
Find | Pick the images that matter: low confidence, disagreements between models, operator corrections, new clusters, rare classes, drift alarms.
Label | Humans label or fix those images (pre-labelled by the model, so humans only correct).
Train | Retrain or fine-tune with the new data; compare against the current model on a fixed test set and on slices.
Verify | Shadow mode and canary rollout; then promote.
Repeat | Every cycle moves the weak spots; the loop is the product.
:::

This is **data-centric AI**: given a fixed model, systematically improving the data (coverage, label quality, balance) usually beats changing the architecture.

## Labelling well

- **Write labelling guidelines** with pictures: what counts as a defect, how tight a box is, how to treat occlusion and truncation, what to do when unsure. Ambiguity in guidelines becomes noise in the model.
- **Measure agreement**: have 2-3 people label the same 100-200 images; compute inter-annotator agreement (IoU for boxes, Cohen's kappa for classes). The model cannot exceed human agreement; disagreement shows where the guideline is unclear.
- **Pre-label with a model** (or SAM and a detector) and let humans correct: 3-10× faster than labelling from scratch. Beware of **automation bias** (annotators accepting wrong pre-labels): audit a random sample.
- **Quality control**: gold-standard (honeypot) items, consensus on hard cases, reviewer pass, label-error detection with the model (**confident learning**, `cleanlab`: find images where a strong model disagrees confidently with the label; typically 1-5% of public datasets are mislabelled).
- **Tools**: CVAT, Label Studio, Labelbox, V7, Roboflow, Supervisely, FiftyOne (dataset exploration and error analysis), and vendor labelling services with SLAs.
- **Class definitions evolve**: version the label schema; migrate old labels explicitly.

## Which images to label? Active learning (runnable)

Labelling everything is wasteful. **Active learning** picks the most useful images: those the model is **uncertain** about (low confidence, small margin, high entropy, disagreement between ensemble members), those that are **diverse** (cover new regions of the embedding space: core-set selection, clustering), or **likely errors** reported by users. The demo compares three ways of choosing 10 images at a time on a small image task.

```python run title="Drift alarms (PSI and KS test) and active learning strategies" level=advanced
import numpy as np
from scipy import stats
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

rng = np.random.default_rng(0)
X, y = load_digits(return_X_y=True)
X = X / 16.0
Xtr, Xpool, ytr, ypool = train_test_split(X, y, test_size=0.6, random_state=0, stratify=y)

# ---- 1. drift monitoring: compare an image statistic of production data with the training reference
def psi(ref, new, bins=10):
    edges = np.quantile(ref, np.linspace(0, 1, bins + 1)); edges[0], edges[-1] = -np.inf, np.inf
    r, n = np.histogram(ref, edges)[0] / len(ref), np.histogram(new, edges)[0] / len(new)
    r, n = np.clip(r, 1e-4, None), np.clip(n, 1e-4, None)
    return float(np.sum((n - r) * np.log(n / r)))
ref_brightness = Xtr.mean(1)
print("scenario                       | mean brightness | PSI    | KS p-value | alarm?")
for name, new in [("same distribution (test split)", Xpool[:300]),
                  ("slightly darker camera (-3%)", Xpool[:300] * 0.97),
                  ("lighting problem (-30%)", Xpool[:300] * 0.7),
                  ("sensor noise added", np.clip(Xpool[:300] + rng.normal(0, 0.2, Xpool[:300].shape), 0, 1))]:
    b = new.mean(1); p = stats.ks_2samp(ref_brightness, b).pvalue; v = psi(ref_brightness, b)
    print(f"{name:<31}| {b.mean():>13.3f}   | {v:5.3f}  | {p:9.2e}  | {'YES' if v > 0.2 or p < 1e-3 else 'no'}")
print("rule of thumb for PSI: < 0.1 stable, 0.1-0.25 watch, > 0.25 act")
clf = LogisticRegression(max_iter=3000).fit(Xtr, ytr)
conf_ok, conf_dark = clf.predict_proba(Xpool[:300]).max(1).mean(), clf.predict_proba(Xpool[:300] * 0.7).max(1).mean()
print(f"mean model confidence: normal {conf_ok:.3f} vs dark {conf_dark:.3f}; accuracy: {clf.score(Xpool[:300], ypool[:300]):.3f} vs {clf.score(Xpool[:300] * 0.7, ypool[:300]):.3f}")
print("monitor inputs AND outputs: confidence and class mix shifts are early warnings even when you have no labels")

# ---- 2. active learning: which images should humans label next?
def run(strategy, budget=150, start=50, step=10, seed=0):
    r = np.random.default_rng(seed); labelled = list(r.choice(len(Xpool), start, replace=False)); accs = []
    while True:
        m = LogisticRegression(max_iter=2000).fit(Xpool[labelled], ypool[labelled]); accs.append(m.score(Xtr, ytr))
        if len(labelled) >= budget: break
        rest = np.setdiff1d(np.arange(len(Xpool)), labelled)
        if strategy == "random": pick = r.choice(rest, step, replace=False)
        else:
            p = m.predict_proba(Xpool[rest])
            if strategy == "margin":
                ps = np.sort(p, 1); pick = rest[np.argsort(ps[:, -1] - ps[:, -2])[:step]]       # smallest gap between the top two classes
            else:
                ent = -(p * np.log(p + 1e-12)).sum(1); pick = rest[np.argsort(-ent)[:step]]       # highest entropy over all classes
        labelled += list(pick)
    return accs
res = {s: np.mean([run(s, seed=k) for k in range(10)], 0) for s in ("random", "entropy", "margin")}
print("\nlabelled images | random | entropy | margin sampling   (accuracy on held-out digits, mean of 10 runs)")
for i in (0, 2, 4, 6, 8, 10):
    n = 50 + 10 * i
    print(f"{n:>15} | {res['random'][i]:.3f}  | {res['entropy'][i]:.3f}   | {res['margin'][i]:.3f}")
print("choosing WHICH images to label helps, but the criterion matters: here margin sampling clearly beats random, entropy does not")
```

Observations to carry into practice: (1) **monitor the inputs and the outputs**: brightness, sharpness and confidence shifts raise an alarm before anyone has labels; (2) **the selection criterion matters**: margin sampling beat random here, entropy did not; always compare against random on a held-out set; (3) combine uncertainty with **diversity** (so you do not label 10 near-duplicates) and with the class balance you need.

## Versioning everything

You must be able to answer "which data, code and model produced this prediction?"

- **Data versioning**: DVC, LakeFS, Delta Lake, or immutable storage paths with manifests (a file list + hashes + the label file version). **Never overwrite** a test set.
- **Experiment tracking**: Weights & Biases, MLflow, Neptune, ClearML: parameters, metrics, artefacts, git commit.
- **Model registry** with stages (staging, canary, production) and **model cards** (intended use, data, metrics by slice, known failures).
- **Reproducibility**: seeds, library versions, containers, data splits saved to disk (split by **scene, camera or day**, not by random image, to prevent leakage between near-identical frames).
- **Lineage** for audits: which images from which site and date went into which model.

## Monitoring in production

| What | Signals | Needs labels? |
|---|---|---|
| **Data quality** | Brightness, contrast, blur (variance of Laplacian), resolution, black/frozen frames, camera online | No |
| **Input drift** | PSI/KS/Wasserstein on simple statistics, or **embedding drift** (distance of production feature distribution to training, with a model or CLIP embedding; MMD, domain classifier) | No |
| **Prediction drift** | Class mix, number of detections per frame, box size distribution, mean confidence, share of "unknown" | No |
| **Performance** | Accuracy, precision/recall, mAP | Yes: from operator feedback, audits of random samples, delayed ground truth (a part that fails final test) |
| **System health** | Latency p95, frame age, throughput, error rates, GPU/CPU/temperature, queue depth | No |
| **Business metrics** | False-alarm rate per hour, rework, scrap, customer complaints | Sometimes |

**Alerting**: set thresholds from a baseline period, use rolling windows, avoid alert fatigue (alert on sustained change), and attach **sample images** to every alert. Tools: Evidently, WhyLabs, Arize, Fiddler, Prometheus + Grafana for system metrics, OpenTelemetry.

## Rollout and retraining

- **Shadow mode**: run the new model next to the old one on live data; compare outputs, do not act on the new one yet.
- **Canary / A-B**: send a small share of traffic or a few devices to the new model, with automatic rollback if metrics regress.
- **Gates before promotion**: fixed test set, **slice tests** (night, rare class, small objects), latency/memory budget, calibration, golden regression images.
- **Retraining triggers**: scheduled (monthly), drift alarms, enough new labelled data, a new product/class, a customer complaint pattern. Avoid **blind retraining on the model's own predictions** (it reinforces its mistakes; use human-checked or high-quality labels, or careful pseudo-labelling with a stronger teacher).
- **Catastrophic forgetting**: when adding new data, keep a replay set of old data and test old slices.
- **Cost**: storage for images, labelling, GPU hours, monitoring; sampling strategies matter (log 1 in 1000 normal frames but 100% of low-confidence ones).

## Privacy and governance

Vision data often contains **people, faces, number plates and sensitive sites**. Minimise collection, blur or drop faces at the edge if they are not needed, set retention limits, restrict access and keep audit logs, and respect law and contracts (GDPR, DPDP Act in India, local labour rules). Document consent and purpose; support deletion requests.

:::interview Questions you may get
- "What is a data engine?" A loop of deploy, mine hard/rare examples, label, retrain, verify, redeploy; the main driver of improvement after launch.
- "How do you detect model degradation without labels?" Monitor input statistics, embedding drift, prediction distributions and confidence, data quality, plus sample audits.
- "What is active learning and what can go wrong?" Selecting the most informative samples to label; pitfalls are uncertainty without diversity, outlier-chasing, bias in the pool and a weak criterion; compare against random.
- "How do you split data for a video or multi-camera dataset?" By scene/camera/day/site to avoid leakage between near-identical frames.
- "How do you roll out a new model safely?" Shadow mode, canary with automatic rollback, slice and regression tests before promotion.
- "How do you find label errors?" Train with cross-validation and look for confident disagreements (confident learning), review them, and fix guidelines.
:::

```quiz
? Which is an early warning of problems that does not need labels?
+ A shift in input statistics or in the confidence distribution
- A drop in training loss
- A new GPU driver
> Drift monitoring.

? Why split a video dataset by scene or camera?
+ Adjacent frames are nearly identical, so random splits leak test information into training
- To get more images
- To balance classes automatically
> Prevents optimistic metrics.

? What does shadow mode mean?
+ The new model runs on live data but its outputs are only compared, not used
- The model runs only at night
- The model is hidden from the team
> Safe evaluation in production.

? Why compare an active learning criterion against random sampling?
+ Some criteria do not beat random and can waste labelling budget
- Random sampling is always best
- It is required by law
> Measure, do not assume.
```

:::problem A retail shelf-monitoring model works in 90 stores but the 91st store's accuracy is 20 points lower. Describe how you would investigate and fix it through the data engine. {level=medium tags="mlops,domain-shift,data-engine"}
Think about what is different, then about the loop.

:::solution Model answer
Compare input statistics and embeddings of store 91 with the training stores (lighting, camera height/angle, shelf layout, packaging variants). Inspect low-confidence and wrong samples from that store. Likely causes: new camera geometry, local products or different lighting. Sample images from the store, label (with pre-labels) the most informative ones (uncertainty and diversity), fine-tune or add store-specific augmentations, evaluate on a held-out part of store 91 and on a slice from the old stores to avoid regression, deploy in shadow mode, then canary. Add drift monitoring per store and an onboarding checklist (camera placement, a calibration set of images) for future stores.
:::
:::

:::keypoints
- A data engine (deploy, find hard cases, label, retrain, verify) is how vision systems keep improving; data-centric work often beats new architectures.
- Good labelling needs clear guidelines, agreement measurements, pre-labels with audits and label-error detection.
- Active learning picks informative, diverse samples; always compare with random. Version data, code and models, and split by scene/camera/day.
- Monitor data quality, input and prediction drift, performance and system health; roll out through shadow, canary and slice-tested gates.
:::

:::resources
- [Sculley et al.: Hidden Technical Debt in Machine Learning Systems](https://papers.nips.cc/paper/2015/hash/86df7dcfd896fcaf2674f757a2463eba-Abstract.html) — why ML systems rot.
- [Google: Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml) — practical engineering advice.
- [Northcutt et al.: Confident Learning: Estimating Uncertainty in Dataset Labels](https://arxiv.org/abs/1911.00068) — finding label errors.
- [FiftyOne documentation](https://docs.voxel51.com) — exploring datasets and model errors.
- [CVAT](https://www.cvat.ai) — an open-source annotation tool.
- [Evidently documentation](https://docs.evidentlyai.com) — data and model monitoring.
:::
