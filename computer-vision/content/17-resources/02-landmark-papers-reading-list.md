---
title: A Reading List of Landmark Papers
level: mixed
time: 30
summary: Around seventy papers that built modern computer vision, grouped by area and ordered so you can read them in sequence: CNNs, detection, segmentation, transformers, self-supervision and vision-language, generative models, 3-D and robotics, and efficiency. Each entry says why it matters.
---

You do not need to read every paper in full. For each one: read the **abstract, the figures, the method section's main equation, and the ablation table**; then write two sentences on *what problem it solved and what trick made it work*. Interviewers love hearing "the key idea was ..." more than a list of titles. Papers marked ★ are the ones to read first. All links go to arXiv and were checked.

## Convolutional networks and training

| Paper | Why it matters |
|---|---|
| [★ Simonyan and Zisserman: Very Deep Convolutional Networks (VGG)](https://arxiv.org/abs/1409.1556) | Stacked 3×3 convolutions as the default building block |
| [Szegedy et al.: Going Deeper with Convolutions (GoogLeNet)](https://arxiv.org/abs/1409.4842) | Inception modules, efficiency |
| [★ He et al.: Deep Residual Learning (ResNet)](https://arxiv.org/abs/1512.03385) | Skip connections made very deep networks trainable |
| [Huang et al.: Densely Connected Convolutional Networks](https://arxiv.org/abs/1608.06993) | Feature reuse through concatenation |
| [Tan and Le: EfficientNet](https://arxiv.org/abs/1905.11946) | Compound scaling of depth, width and resolution |
| [Liu et al.: A ConvNet for the 2020s (ConvNeXt)](https://arxiv.org/abs/2201.03545) | Modernising CNNs with transformer-era design |
| [Sandler et al.: MobileNetV2](https://arxiv.org/abs/1801.04381) | Inverted residuals for mobile networks |

## Object detection

| Paper | Why it matters |
|---|---|
| [Girshick et al.: R-CNN](https://arxiv.org/abs/1311.2524) | Deep features for detection |
| [Girshick: Fast R-CNN](https://arxiv.org/abs/1504.08083) | Shared computation with RoI pooling |
| [★ Ren et al.: Faster R-CNN](https://arxiv.org/abs/1506.01497) | Region proposal network; the two-stage reference |
| [★ Redmon et al.: You Only Look Once (YOLO)](https://arxiv.org/abs/1506.02640) | Detection as a single regression problem |
| [Liu et al.: SSD](https://arxiv.org/abs/1512.02325) | Multi-scale single-shot detection |
| [Lin et al.: Feature Pyramid Networks](https://arxiv.org/abs/1612.03144) | Multi-scale features for small objects |
| [★ Lin et al.: Focal Loss (RetinaNet)](https://arxiv.org/abs/1708.02002) | Fixing class imbalance in dense detection |
| [Zhou et al.: Objects as Points (CenterNet)](https://arxiv.org/abs/1904.07850) | Anchor-free detection by centre heat-maps |
| [Tian et al.: FCOS](https://arxiv.org/abs/1904.01355) | Anchor-free per-pixel detection |
| [★ Carion et al.: End-to-End Object Detection with Transformers (DETR)](https://arxiv.org/abs/2005.12872) | Set prediction without anchors or NMS |
| [Zhu et al.: Deformable DETR](https://arxiv.org/abs/2010.04159) | Fast-converging DETR with sparse attention |
| [Redmon and Farhadi: YOLOv3](https://arxiv.org/abs/1804.02767) | A readable, influential YOLO paper |
| [Wang et al.: YOLOv7](https://arxiv.org/abs/2207.02696) | Trainable bag-of-freebies for real-time detection |
| [Liu et al.: Grounding DINO](https://arxiv.org/abs/2303.05499) | Open-set detection from text |

## Segmentation

| Paper | Why it matters |
|---|---|
| [★ Long et al.: Fully Convolutional Networks](https://arxiv.org/abs/1411.4038) | Pixel-wise prediction from classification networks |
| [★ Ronneberger et al.: U-Net](https://arxiv.org/abs/1505.04597) | Encoder-decoder with skip connections; medical standard |
| [Chen et al.: DeepLab](https://arxiv.org/abs/1606.00915) | Atrous convolution and multi-scale context |
| [★ He et al.: Mask R-CNN](https://arxiv.org/abs/1703.06870) | Instance segmentation by adding a mask branch |
| [Xie et al.: SegFormer](https://arxiv.org/abs/2105.15203) | Simple, efficient transformer segmentation |
| [Cheng et al.: Mask2Former](https://arxiv.org/abs/2112.01527) | One architecture for semantic, instance and panoptic |
| [★ Kirillov et al.: Segment Anything](https://arxiv.org/abs/2304.02643) | Promptable foundation model for segmentation |
| [Ravi et al.: SAM 2](https://arxiv.org/abs/2408.00714) | Segment anything in video |

## Transformers, self-supervision and vision-language

| Paper | Why it matters |
|---|---|
| [★ Vaswani et al.: Attention Is All You Need](https://arxiv.org/abs/1706.03762) | The transformer |
| [★ Dosovitskiy et al.: An Image Is Worth 16x16 Words (ViT)](https://arxiv.org/abs/2010.11929) | Transformers for images |
| [Touvron et al.: DeiT](https://arxiv.org/abs/2012.12877) | Data-efficient training recipe |
| [Liu et al.: Swin Transformer](https://arxiv.org/abs/2103.14030) | Hierarchical, windowed attention |
| [Chen et al.: SimCLR](https://arxiv.org/abs/2002.05709) | Contrastive learning, simply |
| [He et al.: Momentum Contrast (MoCo)](https://arxiv.org/abs/1911.05722) | Contrastive learning with a queue |
| [Grill et al.: BYOL](https://arxiv.org/abs/2006.07733) | Self-supervision without negatives |
| [★ Caron et al.: DINO](https://arxiv.org/abs/2104.14294) | Self-distillation; emerging segmentation in attention |
| [★ He et al.: Masked Autoencoders (MAE)](https://arxiv.org/abs/2111.06377) | Masked image modelling at scale |
| [Oquab et al.: DINOv2](https://arxiv.org/abs/2304.07193) | General-purpose frozen visual features |
| [★ Radford et al.: CLIP](https://arxiv.org/abs/2103.00020) | Image-text contrastive pre-training, zero-shot recognition |
| [Zhai et al.: SigLIP](https://arxiv.org/abs/2303.15343) | Sigmoid loss for language-image pre-training |
| [Alayrac et al.: Flamingo](https://arxiv.org/abs/2204.14198) | Few-shot visual language model |
| [Li et al.: BLIP-2](https://arxiv.org/abs/2301.12597) | Q-Former bridging vision and LLMs |
| [★ Liu et al.: Visual Instruction Tuning (LLaVA)](https://arxiv.org/abs/2304.08485) | A simple, strong open VLM recipe |
| [Hu et al.: LoRA](https://arxiv.org/abs/2106.09685) | Parameter-efficient fine-tuning |
| [Yang et al.: Depth Anything](https://arxiv.org/abs/2401.10891) | A foundation model for monocular depth |

## Generative models

| Paper | Why it matters |
|---|---|
| [Kingma and Welling: Auto-Encoding Variational Bayes](https://arxiv.org/abs/1312.6114) | The VAE |
| [★ Goodfellow et al.: Generative Adversarial Networks](https://arxiv.org/abs/1406.2661) | The adversarial framework |
| [Karras et al.: StyleGAN](https://arxiv.org/abs/1812.04948) | High-quality, controllable face synthesis |
| [Isola et al.: pix2pix](https://arxiv.org/abs/1611.07004) | Paired image-to-image translation |
| [★ Ho et al.: Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2006.11239) | Diffusion made practical |
| [Song et al.: DDIM](https://arxiv.org/abs/2010.02502) | Fast deterministic sampling |
| [★ Rombach et al.: Latent Diffusion (Stable Diffusion)](https://arxiv.org/abs/2112.10752) | Diffusion in a latent space |
| [Ho and Salimans: Classifier-Free Guidance](https://arxiv.org/abs/2207.12598) | Guidance without a classifier |
| [Peebles and Xie: DiT](https://arxiv.org/abs/2212.09748) | Transformers as diffusion backbones |
| [Zhang et al.: ControlNet](https://arxiv.org/abs/2302.05543) | Spatial control for diffusion |
| [Lipman et al.: Flow Matching](https://arxiv.org/abs/2210.02747) | Simple, fast generative training |

## Geometry, 3-D and robotics

| Paper | Why it matters |
|---|---|
| [★ Mildenhall et al.: NeRF](https://arxiv.org/abs/2003.08934) | Neural radiance fields |
| [★ Kerbl et al.: 3D Gaussian Splatting](https://arxiv.org/abs/2308.04079) | Real-time radiance fields |
| [Müller et al.: Instant-NGP](https://arxiv.org/abs/2201.05989) | Hash-grid acceleration |
| [Qi et al.: PointNet](https://arxiv.org/abs/1612.00593) | Deep learning on point sets |
| [Lang et al.: PointPillars](https://arxiv.org/abs/1812.05784) | Fast LiDAR 3-D detection |
| [Li et al.: BEVFormer](https://arxiv.org/abs/2203.17270) | Camera-based bird's-eye-view perception |
| [★ DeTone et al.: SuperPoint](https://arxiv.org/abs/1712.07629) | Learned keypoints |
| [Lindenberger et al.: LightGlue](https://arxiv.org/abs/2306.13643) | Fast learned matching |
| [Sun et al.: LoFTR](https://arxiv.org/abs/2104.00680) | Detector-free matching |
| [★ Wang et al.: DUSt3R](https://arxiv.org/abs/2312.14132) | Pointmaps from images, a new SfM paradigm |
| [Wang et al.: VGGT](https://arxiv.org/abs/2503.11651) | Feed-forward 3-D reconstruction |
| [Teed and Deng: DROID-SLAM](https://arxiv.org/abs/2108.10869) | Learned dense SLAM |
| [Campos et al.: ORB-SLAM3](https://arxiv.org/abs/2007.11898) | The reference feature-based SLAM system |
| [Wen et al.: FoundationPose](https://arxiv.org/abs/2312.08344) | 6-D pose of novel objects |
| [★ Chi et al.: Diffusion Policy](https://arxiv.org/abs/2303.04137) | Visuomotor policies via diffusion |
| [Brohan et al.: RT-2](https://arxiv.org/abs/2307.15818) | Vision-language-action models |
| [Kim et al.: OpenVLA](https://arxiv.org/abs/2406.09246) | An open VLA model |

## Applications and tasks

| Paper | Why it matters |
|---|---|
| [Cao et al.: OpenPose](https://arxiv.org/abs/1611.08050) | Multi-person 2-D pose |
| [Xu et al.: ViTPose](https://arxiv.org/abs/2204.12484) | Plain ViT for pose |
| [★ Deng et al.: ArcFace](https://arxiv.org/abs/1801.07698) | Margin loss for face recognition |
| [Shi et al.: CRNN](https://arxiv.org/abs/1507.05717) | Text recognition with CTC |
| [Liao et al.: DBNet](https://arxiv.org/abs/1911.08947) | Scene-text detection |
| [★ Roth et al.: PatchCore](https://arxiv.org/abs/2106.08265) | Industrial anomaly detection |
| [Wang et al.: Real-ESRGAN](https://arxiv.org/abs/2107.10833) | Practical super-resolution |
| [Johnson et al.: Billion-scale similarity search (FAISS)](https://arxiv.org/abs/1702.08734) | Vector search at scale |
| [Feichtenhofer et al.: SlowFast](https://arxiv.org/abs/1812.03982) | Video recognition |

## Efficiency, evaluation and reliability

| Paper | Why it matters |
|---|---|
| [★ Jacob et al.: Integer-Arithmetic-Only Inference (INT8 quantisation)](https://arxiv.org/abs/1712.05877) | The standard quantisation scheme |
| [Hinton et al.: Distilling the Knowledge in a Neural Network](https://arxiv.org/abs/1503.02531) | Knowledge distillation |
| [Dao et al.: FlashAttention](https://arxiv.org/abs/2205.14135) | IO-aware exact attention |
| [★ Guo et al.: On Calibration of Modern Neural Networks](https://arxiv.org/abs/1706.04599) | Overconfidence and temperature scaling |
| [Hendrycks and Dietterich: Common Corruptions (ImageNet-C)](https://arxiv.org/abs/1903.12261) | Robustness benchmark |
| [Heusel et al.: FID (TTUR)](https://arxiv.org/abs/1706.08500) | The standard generative metric |

## How to read a paper efficiently

1. **Abstract and conclusion** (2 minutes): the claim and the numbers.
2. **Figures and tables** (5 minutes): the architecture figure, the main results table, the ablation.
3. **Method** (15 minutes): the central equation or algorithm; write it in your own words.
4. **Limitations** and **related work**: what the authors admit; what it replaced.
5. **Reproduce a tiny version** or run their demo; check that you understand why it works.
6. **Write a three-line summary**: problem, key idea, result and limitation.

:::keypoints
- Read the ★ papers first; for each one write down the problem, the key idea, the result and the limitation.
- Reading order that works: ResNet → Faster R-CNN/YOLO/RetinaNet → DETR → U-Net/Mask R-CNN → ViT → DINO/MAE/CLIP → LLaVA → DDPM/Latent Diffusion → NeRF/3DGS → SuperPoint/DUSt3R → Diffusion Policy/RT-2.
- Interview answers improve when you can name the *key idea* of a paper and the one thing it could not do.
:::

:::resources
- [arXiv cs.CV listing](https://arxiv.org/list/cs.CV/recent) — daily new computer-vision preprints.
- [CVF Open Access](https://openaccess.thecvf.com) — all CVPR, ICCV and WACV papers, free.
- [Hugging Face Papers](https://huggingface.co/papers) — daily trending papers with discussion.
:::
