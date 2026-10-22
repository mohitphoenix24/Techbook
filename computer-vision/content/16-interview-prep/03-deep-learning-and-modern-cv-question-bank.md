---
title: Deep Learning and Modern Vision Question Bank
level: mixed
time: 90
summary: About fifty questions with model answers on CNNs and training, detection, segmentation, transformers, self-supervision, CLIP and vision-language models, generative models, deployment and judgement. Answer aloud first, then compare.
---

The same method as the classical bank: **answer aloud, then open the solution.** Interviewers for modern vision roles move quickly from definitions to judgement ("so what would you do if..."), so for each topic also be ready with a failure mode and a numerical example.

## CNN fundamentals and training

The building blocks and the training habits that every vision engineer is expected to know.

:::problem Why do convolutional networks work well on images? {level=easy tags="cnn,inductive-bias"}
Locality, weight sharing, hierarchy.

:::solution Model answer
Three built-in assumptions match images: **locality** (nearby pixels are related, so small kernels), **weight sharing / translation equivariance** (the same feature detector is useful everywhere, so far fewer parameters and a shifted input gives a shifted feature map), and **hierarchy** (edges combine into textures, parts and objects as layers stack, growing the receptive field). Pooling or strides add some translation invariance. A fully connected layer on a 224×224×3 image would need about 150 k weights per neuron and could not exploit these regularities.
:::
:::

:::problem How do you compute the output size and parameters of a convolution layer? {level=easy tags="conv,output-size"}
Formula.

:::solution Model answer
Output size per dimension: `floor((N + 2P − K) / S) + 1` (input N, kernel K, padding P, stride S; add dilation as `K_eff = D(K−1)+1`). Parameters: `K·K·C_in·C_out + C_out` (bias). MACs: `H_out·W_out·K·K·C_in·C_out`. Example: 3×3, 64 → 128 channels: 3·3·64·128 + 128 = 73,856 parameters. A depthwise-separable version (3×3 depthwise + 1×1 pointwise) needs 3·3·64 + 64·128 = 8,768, about 8× fewer.
:::
:::

:::problem What is the receptive field and how do you increase it? {level=medium tags="receptive-field"}
Stack, stride, dilation.

:::solution Model answer
The region of the input that influences one output unit. It grows with depth, kernel size, **stride** (down-sampling) and **dilation**. Two stacked 3×3 convolutions have a 5×5 receptive field (three: 7×7) with fewer parameters than one large kernel (VGG's insight). Increase it with deeper networks, strided/pooling layers, dilated (atrous) convolutions, larger kernels (ConvNeXt 7×7), or global operations (attention, global pooling). The **effective** receptive field is smaller than the theoretical one (Gaussian-like central weighting). For segmentation and detection of large objects it must cover the object and its context.
:::
:::

:::problem What does batch normalisation do, and what are its pitfalls? {level=medium tags="batchnorm,normalisation"}
Statistics in train versus eval.

:::solution Model answer
It normalises each channel by the **batch mean and variance** during training, then applies a learned scale and shift. It speeds and stabilises training, allows higher learning rates and acts as a mild regulariser. At inference it uses **running averages**. Pitfalls: **small batches** give noisy statistics (use GroupNorm/LayerNorm), **train/eval mismatch** (forgetting `model.eval()`, or fine-tuning with a different data distribution), **distributed training** needs SyncBN for small per-GPU batches, and frozen BN is common in detection fine-tuning. Transformers use LayerNorm because sequence statistics per sample are more stable.
:::
:::

:::problem Why ReLU rather than sigmoid or tanh in deep CNNs? What replaced it? {level=easy tags="relu,activation"}
Vanishing gradients.

:::solution Model answer
Sigmoid/tanh **saturate**: their derivatives approach zero for large |x|, so gradients vanish through many layers; ReLU has gradient 1 for positive inputs, is cheap, and gives sparse activations. Its problem is the **dying ReLU** (neurons stuck at zero). Alternatives: LeakyReLU/PReLU, **GELU** and **SiLU/Swish** (smooth, used in transformers and EfficientNet/YOLO), **Hardswish** for mobile. Sigmoid and softmax remain for outputs; choose the activation with the hardware in mind (ReLU6/hard variants quantise well).
:::
:::

:::problem Why do skip connections make very deep networks trainable? {level=medium tags="resnet,skip"}
Gradient highway, identity.

:::solution Model answer
A residual block computes `y = x + F(x)`. The gradient flows through the identity path unchanged (`∂y/∂x = 1 + ∂F/∂x`), so it cannot vanish through many layers, and the block only has to learn a **residual** correction; if the best function is the identity, the weights simply go to zero. This removed the "degradation problem" in which deeper plain networks had higher training error. The same idea appears in DenseNet (concatenation), U-Net (encoder-decoder skips), transformers (residual streams) and diffusion U-Nets.
:::
:::

:::problem How do you reduce overfitting in an image classifier? {level=medium tags="regularisation,augmentation"}
Data, regularisation, model.

:::solution Model answer
More and more varied **data** (collect, label, **augmentation**: crops, flips, colour jitter, RandAugment, Mixup/CutMix, random erasing, domain-specific ones); **weight decay**, **dropout** (less in conv nets, more in classifier heads), **stochastic depth**, **label smoothing**; **early stopping** on validation loss; **transfer learning** from a pre-trained model; a smaller model; **batch/layer norm**; ensembling and test-time augmentation. Diagnose first: compare training and validation curves, check for **data leakage** (near-duplicates across splits), and look at what the model gets wrong. Augmentations must preserve the label (do not flip digits 6/9 or text).
:::
:::

:::problem How do you choose a learning rate and a schedule? {level=medium tags="optimisation,lr"}
LR range test, warm-up, cosine.

:::solution Model answer
Start with a known-good optimiser setting (AdamW 1e-3 to 1e-4 for training from scratch/transformers, SGD with momentum 0.9 and lr 0.1 for ResNets with batch 256, 1e-4 to 1e-5 when fine-tuning). Use an **LR range test** (increase LR exponentially over a short run, pick a value below where the loss starts to diverge). Use **warm-up** (a few hundred to thousand steps), then **cosine or step decay**. Scale the LR with batch size (linear scaling rule with warm-up). Signs of a bad LR: loss NaN or oscillating (too high), loss decreasing painfully slowly (too low). Pair the LR with weight decay and gradient clipping when training is unstable.
:::
:::

:::problem Your classes are highly imbalanced (1% defects). How do you train and evaluate? {level=medium tags="loss,imbalance"}
Sampling, loss, metrics.

:::solution Model answer
Training: **class-weighted loss** or **focal loss**, **oversampling** the rare class (with augmentation) or undersampling the majority, **hard-negative mining**, and collecting more rare examples (active learning); consider an anomaly-detection approach if defects are very rare and varied. Evaluation: **never accuracy** (99% by predicting "good"); use **precision/recall, F1, PR-AUC**, per-class metrics and the **confusion matrix**, choose the threshold for the cost trade-off, and report false alarms per hour at the target recall. Keep the validation/test distribution at the **real** prevalence.
:::
:::

:::problem Describe how you would fine-tune a pre-trained model on a small dataset. {level=medium tags="transfer,fine-tuning"}
Freeze, then unfreeze.

:::solution Model answer
Pick a strong backbone pre-trained on a large dataset (ImageNet-21k, DINOv2, CLIP). Replace the head. First **train only the head** (linear probe) with a moderate LR to get a sensible classifier; then **unfreeze** (all or the top blocks) with a **much smaller LR** (10-100× lower), **layer-wise LR decay**, warm-up and strong augmentation. Match the pre-training **pre-processing** (size, mean/std). Watch **BatchNorm** (freeze statistics if the batch is small). Validate with cross-validation on small data, and compare with a linear probe and a classical baseline; use LoRA or adapters if memory is tight.
:::
:::

:::problem Your training loss does not go down. What do you check, in order? {level=medium tags="debugging,training"}
Pipeline before model.

:::solution Model answer
(1) **Overfit a tiny batch** (8 images): if it cannot reach near-zero loss there is a bug. (2) **Data**: labels aligned with images, augmentation not destroying the signal, normalisation correct, shuffling on, correct classes. (3) **Loss and outputs**: right loss for the output (logits to `CrossEntropyLoss`, no extra softmax), label dtype and shape, the expected initial loss (≈ ln(num_classes)). (4) **Optimisation**: LR too high/low, `zero_grad` called, gradient norms, no frozen parameters by mistake, `eval()`/`train()` modes. (5) **Model**: initialisation, dead activations, exploding/vanishing gradients. (6) Simplify: remove augmentation, regularisation and schedules, then add back one at a time. Log activations, gradient norms and sample predictions.
:::
:::

:::problem Walk through backpropagation for a convolution layer. {level=hard tags="gradient,backprop"}
Gradients are convolutions too.

:::solution Model answer
Forward: `y = x ⋆ w + b`. Given the upstream gradient `∂L/∂y`: the gradient with respect to the **weights** is the correlation of the input with `∂L/∂y` (each weight accumulates over all positions where it was used: `∂L/∂w = Σ x_patch · ∂L/∂y`), the gradient with respect to the **bias** is the sum of `∂L/∂y` over positions, and the gradient with respect to the **input** is the full convolution of `∂L/∂y` with the **flipped kernel** (a transposed convolution). Implementation trick: `im2col` turns the convolution into a matrix multiplication whose backward pass is two matrix multiplications. Weight sharing means gradients are summed over all spatial positions and batch items.
:::
:::

:::problem Explain precision, recall, F1, ROC-AUC and PR-AUC, and when you prefer each. {level=medium tags="metrics,classification"}
Imbalance.

:::solution Model answer
Precision = TP/(TP+FP) (how many alarms are real), recall = TP/(TP+FN) (how many real cases are found), F1 = harmonic mean. The **ROC curve** plots TPR vs FPR over thresholds; ROC-AUC is the probability a random positive scores above a random negative; it can look excellent under heavy imbalance because FPR is divided by many negatives. **PR-AUC / average precision** focuses on the positive class and is more informative for rare events. Choose the **operating point** by cost (missed defect vs false alarm) and report precision/recall at that point, with confidence intervals; macro vs micro averaging for multi-class.
:::
:::

## Detection and segmentation

:::problem Define IoU and explain non-maximum suppression. What are its failure modes? {level=easy tags="iou,nms"}
Greedy, threshold.

:::solution Model answer
**IoU** = area of intersection / area of union of two boxes (or masks). **NMS**: sort detections by score; keep the best, remove other boxes of the same class with IoU above a threshold (0.5-0.7) with it; repeat. Failure modes: **crowded scenes** (true neighbouring objects overlap and get suppressed: use Soft-NMS, higher thresholds, or learned/NMS-free models like DETR), boxes with high IoU of different classes (class-wise NMS), threshold sensitivity, speed on many boxes (use batched GPU NMS), and it is not differentiable (end-to-end detectors with set prediction avoid it).
:::
:::

:::problem How is mAP computed for object detection? {level=medium tags="map,metrics"}
Ranked list per class.

:::solution Model answer
For each class: sort all detections by confidence; mark each as TP (IoU ≥ threshold with an unmatched ground-truth box) or FP; walk down the list computing precision and recall at each step to build the **precision-recall curve**; **AP** = area under the (interpolated) curve; **mAP** = mean over classes. COCO averages over IoU thresholds 0.50 to 0.95 (step 0.05), written mAP@[.5:.95], and reports AP₅₀, AP₇₅ and AP by object size (small/medium/large). Pascal VOC used a single IoU 0.5. Pitfalls: mAP ignores the confidence calibration and the operating threshold; it does not tell you the false alarms per image at a given recall: report those too.
:::
:::

:::problem What are anchors and why did newer detectors drop them? {level=medium tags="anchors,anchor-free"}
Priors versus centres.

:::solution Model answer
Anchors are predefined boxes of various scales/aspect ratios at each feature-map location; the network predicts offsets and class scores relative to them, and positives are assigned by IoU. Drawbacks: many hyper-parameters (sizes, ratios, thresholds), huge numbers of mostly negative anchors (class imbalance), and dataset-specific tuning. **Anchor-free** detectors (FCOS, CenterNet, YOLOX, YOLOv8) predict, for each location, the distances to the box sides or the object centre and size, assign positives by location/centre-ness or dynamic matching (OTA, SimOTA, TAL), simplifying design. **DETR** removes anchors and NMS with learned object queries and bipartite matching.
:::
:::

:::problem Compare two-stage and one-stage detectors. {level=medium tags="two-stage,one-stage"}
Accuracy versus speed, and how this changed.

:::solution Model answer
**Two-stage** (Faster R-CNN): a region proposal network suggests candidate regions; a second head classifies and refines each after ROI pooling/align. Historically more accurate, especially for small objects, but slower. **One-stage** (SSD, RetinaNet, YOLO): predict classes and boxes densely in one pass: simpler and fast; RetinaNet's **focal loss** fixed the easy-negative imbalance and closed the accuracy gap. Modern YOLO/RT-DETR models are both fast and accurate; Faster R-CNN-style models are still used for instance segmentation (Mask R-CNN) and when box quality at high IoU matters.
:::
:::

:::problem Explain focal loss. {level=medium tags="focal-loss"}
Down-weight easy examples.

:::solution Model answer
Dense detectors see about 100,000 candidate locations, almost all easy background; their sum of small losses overwhelms the few hard positives. Focal loss multiplies cross-entropy by `(1 − p_t)^γ` (γ ≈ 2): confident correct predictions (p_t near 1) are down-weighted to almost zero, so training focuses on hard, misclassified examples; an α factor balances classes. It helps with class imbalance in detection and segmentation; with γ = 0 it becomes ordinary cross-entropy. It changes calibration (predictions become less confident), so check threshold choices.
:::
:::

:::problem How would you improve detection of small objects? {level=medium tags="small-objects"}
Resolution and context.

:::solution Model answer
Increase the **input resolution** or use **tiling/SAHI** (slice the image with overlap); keep **high-resolution feature maps** (FPN/PAN with stride-4 or stride-8 outputs); anchor/assignment tuned to small boxes; **multi-scale training** and augmentation (copy-paste, mosaic, zoom-in); a better label assignment and IoU variants (NWD, CIoU) because small-box IoU is very sensitive; use context (larger crops around the region), super-resolution on crops only if validated; **collect more small-object data**; and evaluate AP_small separately. Check that the annotation boxes are tight and consistent.
:::
:::

:::problem Why use GIoU/DIoU/CIoU instead of L1 for box regression? {level=medium tags="bbox,loss"}
Scale and overlap awareness.

:::solution Model answer
L1/L2 on coordinates treats a 5-pixel error equally for small and large objects and is not what the metric (IoU) measures. **IoU loss** optimises overlap directly and is scale invariant, but gives **zero gradient** when boxes do not overlap. **GIoU** subtracts a penalty based on the empty area of the smallest enclosing box (works with no overlap), **DIoU** adds the normalised centre distance (faster convergence), **CIoU** adds an aspect-ratio consistency term. YOLO models use CIoU/DFL; DETR uses L1 + GIoU.
:::
:::

:::problem Differentiate semantic, instance and panoptic segmentation. {level=medium tags="segmentation,types"}
Stuff, things, and both.

:::solution Model answer
**Semantic**: a class for every pixel; instances of the same class are not distinguished. **Instance**: separate masks for each object of countable "thing" classes (Mask R-CNN); no labels for "stuff" (sky, road). **Panoptic**: both: every pixel gets a class, and thing pixels also get an instance ID, with no overlaps. Metrics: **mIoU** (semantic), mask **AP** (instance), **PQ = SQ × RQ** (segmentation quality × recognition quality, panoptic). Architectures: FCN/DeepLab/SegFormer, Mask R-CNN/YOLO-seg/SOLO, Panoptic FPN/MaskFormer/Mask2Former/OneFormer.
:::
:::

:::problem Why does U-Net use skip connections, and what are good loss functions for small structures? {level=medium tags="unet"}
Resolution and overlap-based losses.

:::solution Model answer
The encoder reduces resolution and gains semantics, losing spatial detail; the decoder restores resolution. **Skip connections** concatenate encoder features at the same scale with decoder features, giving precise **localisation** (boundaries) with **context**. For small or rare structures (lesions, thin cracks) where the foreground is a tiny fraction of pixels, plain cross-entropy is dominated by the background: use **Dice**, **Tversky/focal Tversky** (control the FP/FN trade-off), **focal loss**, class weights, or a **combined** CE + Dice loss; train on patches centred on the foreground (positive sampling).
:::
:::

:::problem What is the difference between Dice and IoU, and what are they not good at? {level=medium tags="dice,iou"}
Same ranking, different values.

:::solution Model answer
`Dice = 2|A∩B| / (|A|+|B|)`, `IoU = |A∩B| / |A∪B|`; they are monotonically related (`Dice = 2·IoU / (1 + IoU)`), so they rank models identically on one image, but the mean over a dataset can differ. Neither measures **boundary accuracy** well (a one-pixel boundary error on a huge object barely changes them): use **Boundary IoU**, Hausdorff distance or surface distances where the contour matters; neither measures **topology** (a broken thin structure may keep a high score); and they are undefined/unstable for empty masks.
:::
:::

:::problem How does the Segment Anything Model work and how would you use it in a pipeline? {level=hard tags="sam,promptable"}
Heavy encoder, light decoder.

:::solution Model answer
A large ViT **image encoder** (run once per image) produces an embedding; a light **prompt encoder** (points, boxes, masks) and a **mask decoder** produce masks in tens of milliseconds, returning several masks for ambiguous prompts with predicted IoU scores. It was trained on SA-1B (1.1 billion masks) built with a data engine. Use it for **annotation** (click, box), for **auto-labelling** with a text-to-box detector (Grounded SAM) followed by human review, and as a component in robotics (box from a detector, mask from SAM, depth statistics for grasps). Limits: no class semantics, thin/transparent structures, domain shifts, and a heavy encoder (use MobileSAM/EdgeSAM or SAM 2 for video).
:::
:::

## Transformers, self-supervision and foundation models

:::problem Explain the Vision Transformer and how it differs from a CNN. {level=medium tags="vit"}
Patches and attention.

:::solution Model answer
Split the image into patches (16×16), flatten and linearly embed each (a strided convolution), add a **class token** and **position embeddings**, and run a stack of transformer blocks (multi-head self-attention + MLP, residual connections, LayerNorm). It has **weaker inductive bias** (no locality or translation equivariance built in), so it needs more data (or strong augmentation, distillation or self-supervised pre-training), but it models long-range dependencies from the first layer and scales better with data and compute. Costs: attention is quadratic in the number of tokens, so high resolution is expensive (windowed attention in Swin, FlashAttention, token merging). Interpolate position embeddings for new resolutions.
:::
:::

:::problem Write the self-attention formula and explain each part. {level=medium tags="attention"}
QK^T over sqrt(d).

:::solution Model answer
`Attention(Q, K, V) = softmax(Q Kᵀ / √d) V`. Each token produces a **query** (what it looks for), **key** (what it offers) and **value** (its content) by linear projections. The dot products `QKᵀ` measure relevance between all token pairs; dividing by `√d` stops large dot products from saturating the softmax (variance control); softmax turns each row into weights; the output is the weighted sum of values. **Multi-head** attention runs several heads with smaller dimensions in parallel and concatenates, letting heads specialise. Cost O(N²d) time and O(N²) memory; masks implement causality or padding.
:::
:::

:::problem Explain contrastive self-supervised learning and why BYOL/DINO do not collapse. {level=medium tags="ssl,contrastive"}
Positives, negatives, tricks.

:::solution Model answer
Contrastive methods (SimCLR, MoCo) create two augmented views of an image; the network should map them close together (positives) and push other images' views apart (negatives) via InfoNCE; they need many negatives (large batch or a momentum queue) and strong augmentation. **BYOL and DINO** use only positives: a student predicts the output of a **momentum (EMA) teacher** on another view; collapse (a constant output) is avoided by the **stop-gradient, the predictor/asymmetry, the EMA teacher and, in DINO, centring and sharpening of the teacher outputs**. VICReg/Barlow Twins use explicit variance and covariance terms. The resulting features support k-NN classification and linear probes.
:::
:::

:::problem What is a masked autoencoder and why does it mask 75%? {level=medium tags="mae,masked"}
Redundancy.

:::solution Model answer
Mask most image patches, encode only the visible ones with a ViT, and have a light decoder reconstruct the pixels of the masked patches (loss on masked patches only). Images are highly redundant, so a low mask ratio can be solved by interpolation; **75%** makes the task require understanding of object structure, and the encoder processing only 25% of tokens makes pre-training about 3× cheaper. After pre-training, the decoder is discarded and the encoder is fine-tuned: excellent fine-tuning accuracy, weaker linear-probe accuracy than contrastive/DINO features.
:::
:::

:::problem How does CLIP enable zero-shot classification? {level=medium tags="clip"}
Shared embedding space.

:::solution Model answer
CLIP trains an image encoder and a text encoder on ~400 M image-text pairs so the embeddings of matching pairs are close (symmetric InfoNCE over the batch). For zero-shot classification, write a **prompt** per class ("a photo of a {class}"), embed it, and choose the class whose text embedding has the highest cosine similarity with the image embedding; average several prompt templates. Limitations: weak at counting, relations and fine-grained or domain-specific categories; prompt sensitivity; calibration (softmax over only the listed classes); bias from web data. Use a linear probe or fine-tuning with a few labels to adapt.
:::
:::

:::problem Describe how a vision-language model such as LLaVA is built and trained. {level=hard tags="vlm,architecture"}
Encoder, projector, LLM.

:::solution Model answer
A pre-trained vision encoder (CLIP/SigLIP ViT) produces patch features; a **projector** (linear or 2-layer MLP; Q-Former/resampler in other models) maps them to the LLM's embedding space as "visual tokens" placed before the text prompt; a pre-trained LLM generates the answer. Training: **stage 1** aligns the projector on image-caption pairs with the encoder and LLM frozen; **stage 2** instruction-tunes projector and LLM (often LoRA) on visual conversations/VQA. Cost grows with the number of visual tokens (resolution), and weaknesses include hallucination, counting, small text and spatial relations; evaluate on your own task data.
:::
:::

:::problem What is LoRA and why is it popular for adapting large vision models? {level=medium tags="lora,peft"}
Low-rank updates.

:::solution Model answer
LoRA freezes the pre-trained weight `W` and learns a low-rank update `ΔW = B A` (rank r ≈ 4-64) added to selected layers (typically attention projections). Only `A` and `B` are trained: 0.1-2% of parameters, small checkpoints (MBs), less memory, less forgetting, easy to swap per task, and after training you can **merge** `W + BA` for zero inference overhead. It is used for diffusion personalisation, VLM instruction tuning and ViT adaptation. Limits: very different domains may need higher ranks or full fine-tuning.
:::
:::

:::problem What does Swin Transformer change compared with ViT, and why? {level=medium tags="swin,hierarchical"}
Windows, shifting, pyramid.

:::solution Model answer
Attention in **local windows** (cost linear in the image size), **shifted windows** in alternate layers (cross-window communication), **patch merging** that builds a multi-scale feature pyramid (strides 4-32), and relative position bias. This makes transformers usable as backbones for detection and segmentation (which need pyramids and high resolution) and reduces the quadratic cost.
:::
:::

## Generative models

:::problem Compare GANs and diffusion models. {level=medium tags="gan,diffusion"}
Training, quality, speed.

:::solution Model answer
**GANs**: a generator and discriminator trained adversarially; one-step sampling (fast) and sharp results, but unstable training, **mode collapse**, and no likelihood. **Diffusion models**: learn to denoise; stable regression-style (MSE) training, excellent mode coverage and conditioning (text, ControlNet), but sampling needs many steps (mitigated by DDIM/DPM-Solver, latent diffusion and distillation). Diffusion has replaced GANs for general image generation; GAN ideas live on in adversarial losses for autoencoders, super-resolution and one-step distillation.
:::
:::

:::problem What is the training objective of a diffusion model? {level=medium tags="diffusion,training"}
Predict the noise.

:::solution Model answer
Take a clean image `x₀`, a random timestep `t` and noise `ε ~ N(0, I)`; form `x_t = √ᾱ_t x₀ + √(1−ᾱ_t) ε`; train a network `ε_θ(x_t, t)` (U-Net or transformer, with text conditioning) to predict `ε` with mean squared error. Sampling starts at pure noise and repeatedly denoises. Equivalent parametrisations predict `x₀`, the velocity `v` or the score; flow matching uses straight-line paths. Classifier-free guidance combines conditional and unconditional predictions at sampling time.
:::
:::

:::problem Why does Stable Diffusion work in latent space? {level=medium tags="latent,stable-diffusion"}
Compression.

:::solution Model answer
A VAE-like autoencoder compresses the 512×512×3 image to a 64×64×4 latent (about 48× fewer values); diffusion runs on the latent, making each step far cheaper and letting the model concentrate on semantic structure while the decoder restores texture. Text enters via cross-attention from CLIP/T5 embeddings. The costs: the autoencoder limits fine details (small text, faces), and artefacts of the VAE appear in the output.
:::
:::

:::problem How would you evaluate a generative image model? {level=medium tags="fid,evaluation"}
Quality, diversity, alignment.

:::solution Model answer
Separate **quality, diversity and prompt alignment**: **FID** (distance between Gaussian fits of Inception features of real and generated images; needs thousands of samples, same preprocessing, can be gamed by memorisation), **precision/recall** or density/coverage (quality versus diversity), **CLIPScore** and compositional benchmarks for text alignment, **LPIPS** for perceptual similarity, human preference studies for the final say, plus task-specific checks (OCR accuracy for text, identity similarity for faces). Watch guidance scale: FID prefers moderate guidance, CLIPScore keeps rising.
:::
:::

## Practice, deployment and judgement

:::problem A model works in the lab but fails in the field. What do you do? {level=medium tags="distribution-shift"}
Find the gap.

:::solution Model answer
Compare **field data versus training data**: lighting, camera model/angle, resolution, compression, object variety, backgrounds, class balance. Collect and look at failures; check **pre-processing parity** (colour order, resize, normalisation) and the **runtime** (precision, post-processing). Slice the metrics by condition. Fix by adding representative data (labelled with the data engine), augmentation matching the shift, domain adaptation or fine-tuning, quality gates for bad inputs, recalibrated thresholds, and monitoring for drift. Do not just train a bigger model: first understand which shift happened.
:::
:::

:::problem What is data leakage in vision, and how do you prevent it? {level=medium tags="data-leakage"}
Near-duplicates, splits.

:::solution Model answer
When information from the test set reaches training, inflating the metric: **near-duplicate or adjacent frames** split randomly, the same patient/product/scene in both splits, augmentations applied before splitting, test-set tuning of hyper-parameters, pre-training data that contains the test images (web-scale models), and label-derived features. Prevent with **group splits** (by scene, camera, day, patient), de-duplication (perceptual hashes, embeddings), a frozen test set used once, and checks that performance on a truly new site is similar.
:::
:::

:::problem How do you ensure label quality for a detection dataset? {level=medium tags="annotation,quality"}
Guidelines and audits.

:::solution Model answer
Write clear guidelines with examples and edge cases (truncated, occluded, tiny, ambiguous), measure **inter-annotator agreement** (IoU between annotators) on a shared subset, use pre-labels from a model with human correction, include **gold-standard items** and review sampling, track annotator accuracy, run **model-based label-error detection** (confident learning, large training loss), and iterate guidelines when disagreements are systematic. The model cannot exceed the label noise ceiling; budget label cleaning before architecture search.
:::
:::

:::problem How would you make a detector run on a Jetson at 30 FPS? {level=medium tags="edge,optimisation"}
Measure first.

:::solution Model answer
Profile the **whole pipeline** (decode, pre-process, inference, NMS) to find the bottleneck. Use a smaller/faster architecture (YOLO-n/s, MobileNet backbones), reduce input size, export to **TensorRT** with FP16 then INT8 (calibrate with production images, check mAP by slice), fuse layers, do pre-processing on the GPU, use hardware decode, batch/streams for multiple cameras, set the power mode, and pipeline stages with bounded queues. Verify accuracy after each step and test thermal stability for 10+ minutes.
:::
:::

:::problem What is quantisation-aware training, and when is post-training quantisation enough? {level=medium tags="quantisation"}
Fake quantisation.

:::solution Model answer
PTQ computes scales from a calibration set and converts a trained model to INT8 without retraining; it is usually enough for classification CNNs (< 1% loss) with per-channel weights and good calibration data. **QAT** inserts fake-quantisation (round and clip) in the forward pass during fine-tuning, with the straight-through estimator for gradients, so the network adapts to rounding error; it is needed for sensitive models (detectors, small mobile networks, INT4, transformers with outliers). Practical path: FP16 → PTQ INT8 → mixed precision for sensitive layers → QAT.
:::
:::

:::problem How do you know when a vision model is uncertain, and what do you do about it? {level=hard tags="calibration,uncertainty"}
Confidence is not enough.

:::solution Model answer
Raw softmax confidence is often **overconfident** and stays high on out-of-distribution images. Measure **calibration** (ECE, reliability diagram) and improve it (temperature scaling, label smoothing, ensembles, MC dropout, conformal prediction). For unfamiliar inputs use OOD scores (max logit/energy, Mahalanobis, embedding k-NN distance), an "other" class, input quality gates, or an anomaly detector. Decide with **thresholds tied to costs**, route uncertain cases to humans or to a safe fallback, and monitor confidence distributions in production.
:::
:::

:::problem How do you connect a model metric (mAP) to a business metric? {level=medium tags="metrics,business"}
Cost of errors.

:::solution Model answer
Translate errors into costs: a missed defect (scrap, recall, safety), a false alarm (stopped line, rework, operator time), latency (throughput), and manual-review cost. Pick the operating point by minimising expected cost or meeting a constraint (for example recall ≥ 99.5% at ≤ 1 false alarm per 1000 parts), measure on the real distribution, include per-slice results, and test through a pilot with the business metric (scrap rate, interventions per hour). A model with a lower mAP can be better if it fails on the cheaper errors or runs fast enough for the line.
:::
:::

```quiz
? What does `(1 − p_t)^γ` do in focal loss?
+ Down-weights easy, confidently correct examples so training focuses on hard ones
- Increases the learning rate
- Normalises the batch
> γ is typically 2.

? A model has 99% accuracy on a dataset with 1% positives. What is the most important next step?
+ Check precision and recall (and PR-AUC) for the positive class
- Celebrate
- Increase the batch size
> A model that always says "negative" scores 99%.

? Why can't a plain ViT be applied to a very large image cheaply?
+ Self-attention cost grows with the square of the number of patches
- It cannot process colour
- It has no position information
> Windowed attention and token reduction help.

? Which of these prevents data leakage in a video dataset?
+ Splitting by scene or camera, not by random frame
- Shuffling frames
- Using more augmentation
> Adjacent frames are nearly identical.
```

:::keypoints
- Know the mechanics (conv output size, residuals, BatchNorm, focal loss, IoU/NMS/mAP, attention formula) and their failure modes.
- Detection and segmentation answers should include metrics (mAP, mIoU, PQ), losses (focal, GIoU, Dice) and small-object/imbalance strategies.
- Modern vision: ViT and Swin, DINO/MAE/CLIP, VLM structure, LoRA, diffusion training and evaluation.
- Judgement questions (field failures, leakage, label quality, edge deployment, calibration, business metrics) reward a systematic, data-first approach.
:::

:::resources
- [Stanford CS231n: Deep Learning for Computer Vision](https://cs231n.stanford.edu) — lecture notes and assignments behind many interview questions.
- [Papers with Code: Computer Vision](https://paperswithcode.com/area/computer-vision) — tasks, benchmarks and leaderboards.
- [Dive into Deep Learning](https://d2l.ai) — free interactive book with code.
:::
