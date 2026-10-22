# VisionLab: Computer Vision, Pixels to Modern AI

A hands-on course that goes from "what is a pixel?" to foundation models, 3-D vision, robots and the vision interview. It is written in simple words, with real OpenCV and NumPy code that runs in your browser on real photos, live simulators, and a full interview-preparation module.

## Open it

Open the site from the repo root (`../index.html`) and pick VisionLab, or serve the repo root:

```bash
python3 -m http.server 8000      # then open http://localhost:8000/computer-vision/
```

## How running code works

- ` ```python run ` examples run in the browser with **Pyodide** (Python, NumPy, **real OpenCV**, scikit-image, SciPy, scikit-learn). Press **Run** or `Ctrl` + `Enter`; you can edit the code. The first run downloads the runtime.
- `cvlab` is the course helper: `cvlab.image(name)` loads a sample photo, `cvlab.show(...)` draws pictures under the code, and generators (`checkerboard`, `shapes`, `road`, `document`, `stereo_pair`, `video`, ...) make test scenes with known truth.
- ` ```python local check ` blocks show PyTorch (and ONNX) code that cannot run in the browser. `build.py` executes them on a machine with PyTorch and checks their results, so every example in the course was run.
- ` ```viz ` blocks are interactive simulators (convolution, Canny, homography, RANSAC, stereo, Kalman filter, NMS, mAP and more).

## Build and test

```bash
python3 -m venv .venv && .venv/bin/pip install numpy opencv-python-headless scikit-image scipy scikit-learn matplotlib
.venv/bin/python build.py            # bundles the lessons, runs every example, lints, verifies links to arXiv
python3 tools/check_links.py         # external links
python3 tools/browser_test.py ...    # Playwright test in a real browser
```

## What's inside

| Module | Lessons |
|---|---|
| 1. Pixels and Cameras | Start Here — The Map of Computer Vision; What Is an Image? A Grid of Numbers; Colour and Colour Spaces (RGB, BGR, HSV, Lab); How a Camera Makes Numbers; NumPy for Images — Slicing, Masks and Drawing; Image Files, JPEG and Compression; Resolution, Aliasing and Resizing; OpenCV Gotchas Every Engineer Hits |
| 2. Image Processing | Brightness, Contrast and Lookup Tables; Histograms, Equalisation and CLAHE; Thresholding — Black and White Decisions; Convolution — The Core Idea of Filtering; Blur and Denoise — Box, Gaussian, Median, Bilateral; Sharpening and Unsharp Masking; Gradients and Edges — Sobel, Scharr, Laplacian; Canny Edge Detector, Step by Step; Making Filters Fast — Separable, Integral Image, FFT; Morphology — Cleaning Binary Masks; The Frequency View — Fourier Transform for Images; Image Pyramids, Laplacian Pyramids and Blending; Measuring Image Quality — PSNR, SSIM, Sharpness |
| 3. Geometry and Shapes | Geometric Transforms — Translate, Rotate, Affine, Perspective; How Warping Really Works — Inverse Mapping and Interpolation; Contours and Shape Analysis; Connected Components and Blob Analysis; The Hough Transform — Finding Lines and Circles by Voting; Template Matching; Splitting Touching Objects — Distance Transform and Watershed; Classic Segmentation — K-means, Mean Shift, GrabCut, Superpixels |
| 4. Features and Matching | Corners and Interest Points — Harris, Shi-Tomasi, FAST; Scale and Blobs — Finding Things at the Right Size; SIFT — Scale-Invariant Feature Transform; ORB and Binary Descriptors — Fast Features; Matching Features — Brute Force, Ratio Test, FLANN; RANSAC — Fitting a Model When Data Has Outliers; Panorama Stitching, Step by Step; Image Retrieval — Bag of Visual Words; Classic Detectors — HOG and Viola–Jones; The Classic Recognition Pipeline (and Why Deep Learning Won) |
| 5. Camera Geometry and 3D Vision | The Pinhole Camera Model; Lens Distortion and Undistortion; Camera Calibration (Zhang's Method); Pose from a Known Object — PnP and ArUco Markers; Two-View Geometry — Epipolar Lines, F and E; Stereo Vision — Depth from Two Cameras; Triangulation — From Two Rays to a 3-D Point; Structure from Motion — 3-D from Many Photos; Visual Odometry and SLAM; Bundle Adjustment — Refining Cameras and Points Together; Depth Sensors — Stereo, Structured Light, ToF, LiDAR; Point Clouds — Filtering, Planes, Clusters and ICP; Hand-Eye Calibration and Robot Vision |
| 6. Motion and Video | Video Basics — Frames, Codecs, Latency; Background Subtraction; Optical Flow — Lucas-Kanade and Farneback; Deep Optical Flow and Motion Metrics (FlowNet, RAFT); Single-Object Tracking — Mean Shift, Correlation Filters, Siamese Networks; The Kalman Filter — Predict, Then Correct; Multi-Object Tracking — SORT, DeepSORT, ByteTrack; Video Understanding — Action Recognition and Video Models |
| 7. Learning from Data | Machine Learning Recap for Vision — Overfitting, Splits and Leakage; Metrics for Classifiers — Precision, Recall, ROC, Calibration; A Linear Classifier from Scratch — Softmax and Cross-Entropy; A Neural Network and Backpropagation from Scratch; PCA, Clustering and Visualising Features |
| 8. Convolutional Neural Networks | Why Convolutional Networks? Locality, Weight Sharing, Receptive Fields; Convolution Layer Maths — Shapes, Parameters, FLOPs; Build a CNN from Scratch in NumPy; Pooling, Normalisation and Activations (BatchNorm, GroupNorm, GELU); Training a CNN in PyTorch — Loop, Optimisers, Schedules; Regularisation and Data Augmentation; Classic CNN Architectures — LeNet, AlexNet, VGG, Inception; ResNet and Skip Connections; Efficient Architectures — MobileNet, EfficientNet, ConvNeXt; Transfer Learning and Fine-Tuning; Debugging Neural Network Training; Looking Inside a CNN — Filters, Grad-CAM, Adversarial Examples; Data-Centric Vision — Imbalance, Noisy Labels, Active Learning |
| 9. Object Detection | The Detection Task, IoU and mAP; Non-Maximum Suppression and Anchor Boxes; Two-Stage Detectors — R-CNN to Faster R-CNN and Mask R-CNN; Single-Stage Detectors — SSD, RetinaNet and the YOLO Idea; The YOLO Family — From v1 to v11; Anchor-Free Detectors — CenterNet, FCOS, CornerNet; DETR and Transformer Detectors; Small Objects, Crowds and Other Practical Tricks; Open-Vocabulary and Promptable Detection; Detection in Practice — Train, Evaluate, Analyse Errors, Deploy |
| 10. Segmentation | Segmentation Tasks and Metrics — mIoU, Dice, Panoptic Quality; Fully Convolutional Networks and DeepLab (Atrous Convolution); U-Net — Encoder, Decoder and Skip Connections; Segmentation Losses — Cross-Entropy, Dice, Focal, Tversky; Instance Segmentation — Mask R-CNN, YOLACT, SOLO, YOLO-seg; Transformer Segmentation — SegFormer, MaskFormer, Mask2Former; Segment Anything (SAM) and Promptable Segmentation; Refinement, Matting and Segmentation in Practice |
| 11. Vision Transformers and Foundation Models | The Vision Transformer (ViT); DeiT, Swin, ConvNeXt and Friends; Self-Supervised Learning (SimCLR, DINO, MAE); CLIP, SigLIP and Zero-Shot Recognition; Vision-Language Models (LLaVA, Flamingo, PaliGemma, Qwen-VL); Using and Adapting Foundation Models |
| 12. Generative Vision | Autoencoders and VAEs; GANs: The Forger and the Detective; Diffusion Models from Scratch; Latent Diffusion and Stable Diffusion; Control, Personalisation and Editing; Evaluating Generative Models |
| 13. Other Vision Tasks | Human Pose Estimation and Keypoints; Face Detection, Recognition and Verification; OCR and Document Understanding; Monocular Depth Estimation; Anomaly Detection and Industrial Inspection; Super-Resolution, Denoising and Restoration; Image Retrieval, Embeddings and Similarity Search |
| 14. 3-D Deep Learning and Robot Vision | Deep Learning on Point Clouds; NeRF and 3-D Gaussian Splatting; 3-D Object Detection and Bird's-Eye-View Perception; Learned Matching and 3-D Foundation Models; Perception for Grasping and Pick-and-Place; Learning for Robots: Imitation, VLA Models and Sim-to-Real |
| 15. Shipping Vision Systems | Exporting Models: ONNX, TensorRT, OpenVINO and TFLite; Quantisation, Pruning and Distillation; Measuring Latency, Throughput and Cost Honestly; Camera Pipelines and Edge Deployment; Data Engines, MLOps and Monitoring for Vision; Testing, Robustness, Calibration and Responsible Vision |
| 16. Interview Preparation | How Computer-Vision Interviews Work; Classical Computer Vision Question Bank; Deep Learning and Modern Vision Question Bank; Coding Round: Vision Algorithms in NumPy and OpenCV; Coding Round: PyTorch for Vision; The Maths You Need for Vision Interviews; Vision System Design Interviews; Projects, Behavioural Rounds and an Eight-Week Study Plan |
| 17. Resources | Courses, Books and Videos; A Reading List of Landmark Papers; Tools, Datasets, Benchmarks and Communities |
| 18. Project Lab | Build a Document Scanner; Build a Coin Counter and Sizer; Build a Lane Finder; Build a Panorama Stitcher; Build a Camera Calibration Toolkit; Build a Stereo Depth Mapper; Build a Multi-Object Tracker; Build a Visual Odometry System; Build a Surface Defect Finder; Build a CNN From Scratch in NumPy; Build an Image Search Engine; Build a Robot Pick-Point Finder; Build a Privacy Filter That Blurs Faces |

Totals: **151 lessons** (including 13 projects), **244 interview questions** with model answers, **539 quiz questions**, **490 runnable examples**, and external links checked with `tools/check_links.py` (arXiv ids verified against the arXiv API).
