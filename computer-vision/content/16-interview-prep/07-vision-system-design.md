---
title: Vision System Design Interviews
level: advanced
time: 90
summary: A repeatable framework for open-ended "design a vision system" questions, back-of-envelope numbers (with a runnable capacity calculator), and eight worked designs: defect inspection, face unlock, retail shelves, driver monitoring, document extraction, bin picking, visual product search and safety video analytics.
---

System-design rounds test **judgement**: can you turn a vague business request into a system that works, with the right trade-offs, and say what could go wrong? There is no single right answer. Interviewers look for a structured path, sensible numbers, awareness of data and deployment, and honest discussion of risks.

## The framework (use it every time)

:::flow Seven steps
1. Clarify | Who uses it? What exactly is the task and the output? Inputs: camera type, resolution, FPS, viewpoint, lighting, environment. Latency, accuracy and cost targets. What does each kind of error cost (miss versus false alarm)? Privacy and regulation.
2. Metrics | Define success in business and ML terms before models: recall at a false-alarm budget, latency p95, cost per image, human-review rate. Pick the test protocol.
3. Data | What exists, what must be collected and labelled, how many images, class balance, the hard cases (night, rare defects), annotation guidelines, privacy. Plan the data engine.
4. Approach | Start with the simplest baseline that could work (classical, pre-trained, rule-based), then the main model, then upgrades justified by error analysis. Say what you would *not* do.
5. System | Pipeline from camera to decision: edge versus cloud, pre/post-processing, hardware, latency budget, throughput, failure handling, human-in-the-loop.
6. Evaluate and monitor | Offline test with slices, pilot or shadow mode, drift and quality monitoring, feedback and retraining loop.
7. Risks | What breaks (lighting, camera shift, new products), safety, bias, privacy, cost, what you would do next with more time.
:::

**Habits that impress**: draw a box diagram; **quantify** (frames per second, storage, GPUs); name a **fallback** for every uncertain output; propose an **incremental rollout** (shadow mode, then assist, then automate); and keep talking in terms of **requirements**, not technology names.

## Back-of-envelope numbers

Do these early; they decide edge versus cloud, hardware and cost.

- **Pixel rate** = cameras × FPS × width × height. Raw RGB is 24 bits per pixel; H.264 surveillance video is about 0.05-0.15 bits per pixel after compression.
- **Throughput per GPU** depends on model size and precision (small YOLO at FP16 on a modern GPU: hundreds of FPS with batching; a large ViT: tens of FPS).
- **Storage** = bitrate × time; plan **retention** and what to keep (all video, event clips, 1-2% of frames as JPEG for retraining).
- **Latency budget**: break the end-to-end target into capture, decode, pre-process, inference, post-process, actuation.
- **Labelling cost** = images × seconds per label × hourly rate; pre-labelling with a model cuts it 3-10×.

```python run title="A capacity and latency calculator for design interviews" level=intermediate
import math

def capacity(cameras, fps, width, height, bits_per_pixel_compressed=0.1, gpu_fps_capacity=250, hours=24, keep_fraction=0.02, jpeg_kb=150):
    pixels = width * height
    raw_mbps = cameras * fps * pixels * 3 * 8 / 1e6                                      # uncompressed RGB bandwidth
    h264_mbps = cameras * fps * pixels * bits_per_pixel_compressed / 1e6                 # roughly 0.05-0.15 bits per pixel for H.264 surveillance video
    gpus = math.ceil(cameras * fps / gpu_fps_capacity)
    store_all_gb = h264_mbps / 8 * 3600 * hours / 1000                                    # keep all video for a day
    saved_frames_per_day = cameras * fps * 3600 * hours * keep_fraction
    store_samples_gb = saved_frames_per_day * jpeg_kb / 1e6                               # keep only 2% of frames as JPEG for retraining
    return raw_mbps, h264_mbps, gpus, store_all_gb, store_samples_gb

print("scenario                            | raw video   | H.264       | GPUs at 250 FPS each | video/day | 2% JPEG samples/day")
for name, cams, fps, w, h in [("10 cameras, 1080p, 15 FPS", 10, 15, 1920, 1080), ("50 cameras, 1080p, 15 FPS", 50, 15, 1920, 1080), ("4 cameras, 4K, 30 FPS", 4, 30, 3840, 2160)]:
    raw, h264, gpus, all_gb, samp = capacity(cams, fps, w, h)
    print(f"{name:<36}| {raw / 1000:>6.1f} Gbps | {h264:>7.0f} Mbps | {gpus:>20} | {all_gb / 1000:>6.2f} TB | {samp:>8.0f} GB")
print("always run these numbers early in a design interview: they decide edge versus cloud, hardware and retention")

# a latency budget check
stages = {"capture + transfer": 12, "decode": 5, "pre-process": 4, "inference": 22, "post-process": 5, "decision + actuator": 10}
total = sum(stages.values())
print(f"\nlatency budget for a reject gate that must act within 100 ms of exposure: {total} ms used ->", "OK" if total <= 100 else "TOO SLOW", f"(margin {100 - total} ms)")
```

## Design 1: Surface-defect inspection on a production line

**Clarify.** Metal parts pass a camera at 10 parts/s; defects (scratches, dents, stains) are rare (0.5%) and varied; a reject gate must act within 100 ms; missing a defect costs 50× a false reject. Targets: recall ≥ 99% at ≤ 1% false rejects.

**Imaging first.** Lighting and optics beat models: choose dark-field/diffuse lighting to make scratches visible, a global-shutter camera triggered by an encoder, resolution so that the smallest defect covers ≥ 8 pixels, and fixtures that position the part consistently. Enclose the station against ambient light.

**Data.** Collect thousands of normal parts across shifts and material batches, and every defect available; label defect type and location; set aside a test set from different days. Defects are rare and new ones appear, so start with **anomaly detection** (PatchCore/EfficientAD trained on good parts) and add a **supervised segmentation/detection** model (U-Net, YOLO-seg) as defect examples accumulate.

**System.** Camera → trigger → GPU industrial PC (TensorRT) → decision → PLC → reject gate, with the image saved for traceability. Pipeline budget about 60 ms (see calculator). Ambiguous scores go to a **review station**; operators' labels feed the data engine.

**Evaluate.** Image-level recall and false-reject rate at the chosen threshold, pixel/region metrics for localisation, by defect type, part variant and shift; threshold calibrated on validation with real defects; **drift monitor** on the score distribution of good parts.

**Risks.** Lighting drift, camera bumped, new surface finish (false-alarm storm), unseen defect types, label noise, over-reliance on synthetic defects. Mitigations: calibration target check every shift, quality gates, per-batch re-baselining, periodic audits with known defect samples.

## Design 2: Face unlock / access control

**Clarify.** 1:1 verification on a phone or door; tens of thousands of enrolled users for the door; false accept rate ≤ 1 in 100,000; latency ≤ 300 ms; works indoors and outdoors; must resist photo and screen spoofing; privacy is critical.

**Approach.** Detection → landmarks → alignment → embedding network (ArcFace-trained, 512-d) → cosine similarity against the **enrolled template(s)** → threshold. **Liveness**: active/passive PAD (texture, depth/IR, challenge-response) as a separate model and ideally a different sensor (IR or structured light).

**Data.** Large diverse training data with consent (public sets have licensing issues), augmentation for pose, lighting, glasses, masks, ageing; **hard negatives** (look-alikes); separate sets for evaluation across demographics, ages, skin tones and capture devices.

**System.** On-device (secure enclave/TEE) for phones; edge device with encrypted template storage for doors; enrolment flow with several poses and quality checks; fallback (PIN/badge). Template protection, no raw image retention, tamper detection.

**Metrics.** ROC; TAR at FAR 1e-5; FRR by group; PAD metrics (APCER/BPCER); latency; enrolment failure rate.

**Risks.** Bias, spoofing (3-D masks, deepfake on screens), template theft, drift with ageing (re-enrolment), legal compliance (consent, retention). Discuss why a 1:N identification of a crowd is a different, much riskier problem.

## Design 3: Retail shelf analytics

**Clarify.** Detect out-of-stock gaps, misplaced products and planogram compliance in 500 stores from phone photos by staff (or fixed cameras); catalogue of 20,000 SKUs that changes monthly; reports within minutes.

**Approach.** Two-stage: (1) **class-agnostic product detector** (YOLO/DETR) to find product facings, robust to new items; (2) **product recognition by retrieval**: crop → embedding (DINOv2/CLIP fine-tuned with metric learning) → nearest neighbour search against reference images of each SKU, with a re-ranking step; low-confidence crops go to human labelling. Match recognised facings to the **planogram** with a shelf-structure model (rows via clustering, gaps via spacing).

**Why retrieval not classification.** 20,000 classes with monthly change would require constant retraining; retrieval adds a new SKU by adding a few reference images.

**Data.** Reference images per SKU (studio and in-store), thousands of annotated shelf photos across stores/lighting/angles, hard negatives (similar packaging).

**System.** Mobile app guiding capture (blur/glare/coverage checks), upload, cloud inference with an ANN index (FAISS/HNSW), reports. Panorama stitching for long shelves.

**Metrics.** Detection AP, recognition top-1/recall@k at the SKU level, planogram compliance accuracy versus a human audit, out-of-stock precision/recall, processing time per shelf.

**Risks.** Packaging changes, occlusion, near-identical variants (sizes/flavours), store lighting, privacy (shoppers in photos: blur people), label cost.

## Design 4: Driver monitoring system (DMS)

**Clarify.** In-cabin infrared camera, embedded SoC (a few TOPS), 30 FPS, latency < 100 ms, detect drowsiness, distraction (gaze off road) and phone use; must work day/night, with sunglasses; regulatory requirements (EU GSR) and strict privacy (no cloud video).

**Approach.** Face detection and tracking → **landmarks/head pose** (6-DoF) → eye state (open/closed, PERCLOS), **gaze direction** (appearance model or landmarks-based), yawning, plus an object detector for phones/cigarettes/seat belts; temporal logic (fusion over a window of seconds, hysteresis) converts per-frame signals into alerts; calibrate per driver.

**Data.** IR in-cabin footage with varied people, glasses, hats, masks and lighting; synthetic data for rare states (eyes closed) plus real labelled sessions; labelling by expert protocols, e.g. Karolinska sleepiness scale; strict consent.

**System.** All processing on the vehicle SoC (INT8 models), camera synchronised IR illumination, safety-oriented false-alert budget, logging of events only (not video) with an optional privacy-preserving upload.

**Metrics.** Eye-state accuracy, gaze error in degrees, alert precision/recall per scenario, false alerts per hour, latency, performance across demographics and with sunglasses.

**Risks.** Sunglasses/IR reflections, extreme head poses, driver trust (annoying false alerts), regulation, privacy; handle with multi-cue fusion, calibration and user-adjustable sensitivity.

## Design 5: Invoice and document extraction

**Clarify.** 100,000 invoices/month from hundreds of suppliers, scans and phone photos, 8 languages; extract supplier, date, total, tax, line items; target ≥ 98% field-level accuracy with human review for the rest.

**Approach.** Pre-processing (deskew, perspective fix, denoise) → **OCR** (text detection and recognition) → **layout and key-value extraction** (LayoutLMv3 or a document VLM) → **validation rules** (totals equal the sum of lines, tax rates, date formats, supplier master data) → confidence scoring → human review queue for low-confidence fields. Start with a strong **baseline using a commercial OCR + rules**, replace with trained models where error analysis shows gains.

**Data.** A few thousand labelled documents per major template family; synthetic generation for rare layouts; active learning to pick the next documents to label; privacy and access control.

**System.** Queue-based pipeline (document ingestion, OCR workers on GPU, extraction, validation), an annotation/review UI whose corrections feed retraining, audit logs.

**Metrics.** Field-level exact match, CER/WER on critical fields, straight-through-processing rate, review time per document, cost per document.

**Risks.** New templates, handwriting, low-quality scans, hallucination by generative extractors (always validate against the OCR text and arithmetic), language coverage, data protection.

## Design 6: Robotic bin picking

**Clarify.** An arm picks randomly piled metal brackets from a bin and places them on a fixture; cycle time 6 s; 99% pick success; parts are shiny; a 3-D sensor above the bin.

**Approach.** Structured-light/stereo scan (multi-exposure for shine) → **segmentation/instance separation** in the point cloud + RGB → **6-D pose** by CAD-based matching with ICP refinement (or FoundationPose for variants) → **grasp candidates** from stored grasps, ranked by reachability, collision with bin walls and neighbours (voxel check), occlusion → motion plan → pick → **verify** (gripper width/force, re-image the fixture) → place with a second vision pose refinement. Fallbacks: re-scan, shake the bin, re-grasp.

**Data.** CAD models, synthetic bin-piles with randomised lighting/materials for training segmentation/pose networks, a small real labelled set for fine-tuning; logged picks with outcomes for improving the ranker.

**System.** Calibrated sensor and **hand-eye** calibration, scan 300-500 ms, inference 100 ms, planning 100 ms; an emergency stop and safety-rated guarding independent of vision.

**Metrics.** Pick success rate by pile height and part pose, cycle time, failures by category, pose error versus a reference, scan coverage.

**Risks.** Reflections and missing depth, calibration drift, tangled parts, symmetric ambiguity, lighting; mitigations: polarised light, periodic calibration check, verification steps, learned grasp scoring.

## Design 7: Visual product search (e-commerce)

**Clarify.** Users upload a photo and see similar products from a catalogue of 20 million items; p95 latency < 300 ms; the catalogue changes hourly; relevance measured by clicks and purchases.

**Approach.** Detect and crop the product (so the background does not dominate) → **embedding** model fine-tuned with metric learning on same-product pairs (street-to-shop domain gap) → vector index (HNSW/IVF-PQ, sharded, with attribute filters) → **re-rank** top 200 with a finer model or attributes → business logic (availability, price, diversity). Text queries share the space via CLIP/SigLIP-style models.

**Data.** Catalogue images, click-through logs as weak supervision, human-labelled relevance sets, hard negatives from near-duplicates.

**System.** Embedding service on GPUs, streaming indexing of new items, re-embedding when the model changes (versioned indexes), cache for popular queries; A/B testing framework.

**Metrics.** Recall@K and mAP offline on unseen products; latency p95; online CTR, add-to-cart, revenue per search; index recall versus exact search.

**Risks.** Domain gap, near-duplicate flooding, bias in clicks, index freshness, cost of re-embedding 20 M images, adversarial listings.

## Design 8: Safety video analytics (PPE and zones)

**Clarify.** 60 cameras across a plant; alert when a person without helmet/vest enters a restricted zone or stands near moving machinery; ≤ 2 s alert latency; ≤ 5 false alerts per camera per day; workers' privacy must be respected.

**Approach.** Edge boxes running TensorRT: person detection + tracking (ByteTrack) → **PPE classification** on person crops or a PPE detector → **zone logic** using a calibrated floor homography (module 3/5) → temporal filters (condition must hold for N frames) → alert with a short clip. Cloud for dashboards, model updates and retraining.

**Data.** Frames from each camera/site with diverse lighting, distance and clothing; hard negatives (yellow jackets that are not vests); active learning from operator feedback.

**System.** Edge inference at 8-10 FPS per stream, event-based upload only, face blurring at the edge, health monitoring for each camera (offline, blocked, moved), fleet updates with canary releases.

**Metrics.** Per-violation precision/recall, alerts per camera per day, alert latency, performance by camera distance and lighting, camera uptime.

**Risks.** Occlusion, small people far from the camera, camera drift after maintenance (re-calibrate zones), alert fatigue, privacy and labour-law concerns (transparency, purpose limitation), over-reliance (vision is an aid, not a certified safety function).

## How to practise

1. Pick a design, set a 40-minute timer, and talk through the framework aloud, drawing the pipeline.
2. Estimate the numbers with the calculator.
3. Ask a friend to challenge: *"What if the camera moves? What if recall drops after launch? What is your fallback? How do you label 10× faster?"*
4. For each design, list the **one metric**, the **one biggest risk** and the **first experiment** you would run.

:::interview Questions you may get
- "Design a defect-inspection system." Imaging and lighting first, anomaly detection plus supervised models, trigger and gate latency budget, metrics at a false-reject budget, review loop and drift monitoring.
- "How would you decide between edge and cloud?" Latency, bandwidth and privacy favour the edge; model size, fleet management and fast iteration favour the cloud; often a hybrid: edge inference, cloud training and monitoring.
- "Your model recall drops after launch. What do you do?" Check data quality and input drift, compare confidence and class distributions, sample failures, find what changed (camera, lighting, product), fix through data and recalibration, and roll out through shadow and canary.
- "How would you label 1 million images with a small budget?" Pre-label with a model or SAM/detectors, active learning, label only informative subsets, clear guidelines with quality audits, weak and synthetic labels with a clean validation set.
- "How do you handle a class that changes monthly?" Retrieval-based recognition with reference images rather than retraining a classifier.
:::

```quiz
? What should you establish before choosing a model in a design interview?
+ Requirements, the cost of each error type, and the metric
- The GPU brand
- The programming language
> Everything follows from the requirements.

? Why recognise 20,000 changing SKUs by retrieval instead of classification?
+ New items are added with reference images without retraining
- Retrieval is always more accurate
- It needs no data
> The catalogue changes monthly.

? What often improves a defect-inspection system more than a bigger network?
+ Better lighting, optics and fixturing
- A larger batch size
- A different optimiser
> Make the defect visible first.

? What is a sensible rollout for a new model in production?
+ Shadow mode, then canary, with automatic rollback
- Replace everything at once
- Only test on the training set
> Safe release.
```

:::problem Design a system that counts people entering and leaving a metro station through 12 gates, with ±3% accuracy, 24/7, privacy-preserving, on a budget of about one edge box per four gates. Outline the design and the validation plan. {level=hard tags="design,counting,privacy"}
Think about the sensor placement, the counting logic, the privacy approach, and how you would prove the ±3%.

:::solution Model answer
Mount overhead cameras (or ToF/stereo depth sensors) above each gate looking straight down: it reduces occlusion and avoids capturing faces. Detect heads/shoulders (a small YOLO or depth-based blob detector), **track** each person (Kalman + Hungarian), and count when a track crosses a calibrated virtual line, with direction from the track motion; handle groups and children with depth height cues. Run on an edge box with TensorRT (4 streams at 15 FPS is light), send only counts and anonymous events to the cloud, and never store video (or keep short encrypted buffers for debugging). Validate with manual counts from recorded video over diverse hours (rush hour, luggage, wheelchairs, strollers), report error by gate and by crowd density with confidence intervals, tune the line placement, and monitor drift with a daily comparison to the turnstile/ticket data. Fallback: if confidence drops (dirty lens, blocked view) flag the gate for maintenance.
:::
:::

:::keypoints
- Use the seven-step framework: clarify, metrics, data, approach (baseline first), system, evaluate and monitor, risks.
- Quantify early: pixel rates, bandwidth, GPUs, storage, latency budget, labelling cost.
- Imaging, data and fallbacks matter more than model names; propose incremental rollouts with human review.
- Prepare several designs (inspection, face, retail, driver monitoring, documents, bin picking, visual search, safety analytics) and know each one's key metric, biggest risk and first experiment.
:::

:::resources
- [Chip Huyen: Designing Machine Learning Systems](https://huyenchip.com/books/) — the standard book on ML system design.
- [Google: Machine Learning Engineering for Production (course notes)](https://developers.google.com/machine-learning/guides/rules-of-ml) — practical rules for building ML systems.
- [NVIDIA DeepStream documentation](https://developer.nvidia.com/deepstream-sdk) — multi-camera video analytics architecture.
:::
