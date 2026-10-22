---
title: Tools, Datasets, Benchmarks and Communities
level: mixed
time: 25
summary: The libraries, annotation and MLOps tools, public datasets and benchmarks, conferences and communities you will actually use, with a note on what each is for and how to choose.
---

## Libraries and frameworks

| Area | Tools | Use them for |
|---|---|---|
| **Classical vision** | [OpenCV](https://opencv.org), [scikit-image](https://scikit-image.org), [Kornia](https://kornia.github.io) (differentiable ops in PyTorch) | Filtering, geometry, features, calibration, video I/O |
| **Deep learning** | [PyTorch](https://pytorch.org), [torchvision](https://pytorch.org/vision/stable/index.html), [timm](https://github.com/huggingface/pytorch-image-models) (hundreds of pre-trained backbones), [JAX](https://jax.readthedocs.io) | Training and fine-tuning |
| **Detection and segmentation** | [Ultralytics (YOLO)](https://docs.ultralytics.com), [Detectron2](https://github.com/facebookresearch/detectron2), [MMDetection](https://github.com/open-mmlab/mmdetection), [Supervision](https://supervision.roboflow.com) (utilities for tracking, annotation, metrics) | Strong baselines and training recipes |
| **Foundation models** | [Hugging Face Transformers](https://huggingface.co/docs/transformers), [OpenCLIP](https://github.com/mlfoundations/open_clip), [Segment Anything](https://github.com/facebookresearch/segment-anything), [Diffusers](https://huggingface.co/docs/diffusers) | CLIP, SAM, VLMs, diffusion |
| **Augmentation** | [Albumentations](https://albumentations.ai), torchvision transforms v2 | Boxes, masks and keypoints transformed consistently |
| **3-D and point clouds** | [Open3D](http://www.open3d.org), [PCL](https://pointclouds.org), [COLMAP](https://colmap.github.io), [Nerfstudio](https://docs.nerf.studio), [PyTorch3D](https://pytorch3d.org) | Registration, SfM, NeRF/3DGS |
| **SLAM and robotics** | [ROS 2](https://docs.ros.org), [ORB-SLAM3](https://github.com/UZ-SLAMLab/ORB_SLAM3), [Isaac Sim](https://developer.nvidia.com/isaac/sim), [MuJoCo](https://mujoco.org) | Robot software and simulation |
| **Deployment** | [ONNX Runtime](https://onnxruntime.ai), [TensorRT](https://developer.nvidia.com/tensorrt), [OpenVINO](https://docs.openvino.ai), [TFLite/LiteRT](https://ai.google.dev/edge/litert), [Triton Inference Server](https://github.com/triton-inference-server/server) | Fast inference on target hardware |
| **Video pipelines** | [GStreamer](https://gstreamer.freedesktop.org), [DeepStream](https://developer.nvidia.com/deepstream-sdk), [FFmpeg](https://ffmpeg.org) | Capture, decode, multi-stream analytics |

## Annotation, data and MLOps tools

| Need | Tools |
|---|---|
| Labelling | [CVAT](https://www.cvat.ai), [Label Studio](https://labelstud.io), Labelbox, V7, Roboflow, Supervisely; SAM-assisted labelling in several of these |
| Dataset exploration and error analysis | [FiftyOne](https://docs.voxel51.com), Cleanlab (find label errors) |
| Experiment tracking | [Weights & Biases](https://wandb.ai), [MLflow](https://mlflow.org), TensorBoard, ClearML |
| Data and model versioning | [DVC](https://dvc.org), LakeFS, Hugging Face Hub |
| Monitoring | [Evidently](https://docs.evidentlyai.com), WhyLabs, Prometheus + Grafana |

## Datasets and benchmarks by task

| Task | Datasets | Notes |
|---|---|---|
| Classification | [ImageNet](https://www.image-net.org) (1k and 21k classes), CIFAR-10/100, iNaturalist, ObjectNet | ImageNet-C/R/A/V2 test robustness |
| Detection | [COCO](https://cocodataset.org), [Pascal VOC](http://host.robots.ox.ac.uk/pascal/VOC/), [Open Images](https://storage.googleapis.com/openimages/web/index.html), [LVIS](https://www.lvisdataset.org) (long tail), Objects365, DOTA (aerial) | COCO mAP@[.5:.95] is the standard |
| Segmentation | [Cityscapes](https://www.cityscapes-dataset.com), [ADE20K](https://groups.csail.mit.edu/vision/datasets/ADE20K/), COCO panoptic, Mapillary Vistas, [SA-1B](https://ai.meta.com/datasets/segment-anything/) | mIoU and PQ |
| Tracking and video | [MOTChallenge](https://arxiv.org/abs/2010.07548), Kinetics, Something-Something V2, AVA, DAVIS | MOTA, IDF1, HOTA |
| Pose and faces | COCO keypoints, MPII, Human3.6M, LFW, IJB-C, WIDER FACE | OKS-AP, MPJPE, TAR@FAR |
| Autonomous driving | [KITTI](https://www.cvlibs.net/datasets/kitti/), [nuScenes](https://www.nuscenes.org), [Waymo Open Dataset](https://waymo.com/open/), Argoverse 2 | 3-D detection and tracking |
| 3-D and SLAM | [ScanNet](http://www.scan-net.org), [TUM RGB-D](https://cvg.cit.tum.de/data/datasets/rgbd-dataset), [EuRoC MAV](https://projects.asl.ethz.ch/datasets/doku.php?id=kmavvisualinertialdatasets), [Middlebury stereo](https://vision.middlebury.edu/stereo/), 7-Scenes | Poses, depth, reconstruction |
| Robot manipulation | [BOP](https://bop.felk.cvut.cz) (6-D pose), YCB objects, GraspNet-1Billion, Open X-Embodiment, DROID | Pose and grasp benchmarks |
| Industrial inspection | [MVTec AD](https://www.mvtec.com/company/research/datasets/mvtec-ad), VisA, MPDD | Anomaly detection |
| Vision-language | [LAION](https://laion.ai) (web scale), CC3M/12M, VQAv2, TextVQA, DocVQA, MMMU | CLIP, VLMs |
| Generation | FFHQ, LSUN, ImageNet, LAION-Aesthetics | FID and human preference |

**Dataset hygiene**: check the **licence** and **consent** (many web datasets are research-only or contain personal data); look for **duplicates and test leakage** (web-scale pre-training sets can contain benchmark images); read the **datasheet**; and remember that **a benchmark is not your data**. Always evaluate on your own distribution.

## Conferences and journals

- **Computer vision**: [CVPR](https://cvpr.thecvf.com), [ICCV](https://iccv.thecvf.com) (odd years), [ECCV](https://eccv.ecva.net) (even years), WACV, BMVC.
- **Machine learning**: NeurIPS, ICML, ICLR (many vision foundation-model papers appear here).
- **Robotics**: ICRA, IROS, RSS, CoRL (robot learning).
- **Graphics**: SIGGRAPH (NeRF, rendering, 3-D).
- **Journals**: TPAMI, IJCV, Pattern Recognition.
- Workshop papers and tutorials at CVPR/ICCV/ECCV are often the best learning material: look for "tutorial" in the programme.

## Communities and ways to stay current

- [r/computervision](https://www.reddit.com/r/computervision/) and the [OpenCV forum](https://forum.opencv.org): practical questions.
- [Hugging Face](https://huggingface.co) community, Discords and model/dataset hubs.
- [arXiv cs.CV](https://arxiv.org/list/cs.CV/recent) and [Hugging Face Papers](https://huggingface.co/papers): daily reading; set aside 20 minutes a few times a week, read only the titles and abstracts, and deep-read one paper a week.
- [Kaggle](https://www.kaggle.com) competitions and notebooks: learn from others' solutions.
- Local meetups, university seminars, and open-source contributions (fix a bug in OpenCV, add an example to a library): the best way to be seen and to learn.
- Newsletters: [The Batch](https://www.deeplearning.ai/the-batch/), [Import AI](https://importai.substack.com).

:::keypoints
- Use OpenCV + PyTorch + timm/Ultralytics + ONNX/TensorRT as the core toolchain; add Open3D/COLMAP for 3-D and ROS 2 for robots.
- Label with CVAT/Label Studio (+ SAM), explore errors with FiftyOne, track experiments and data versions, and monitor in production.
- Know the standard benchmark for each task, check licences and leakage, and always evaluate on your own data.
- Stay current in small daily doses: scan arXiv/HF papers, deep-read one paper a week, and build things.
:::

:::resources
- [Papers Explained and community lists on Hugging Face](https://huggingface.co/papers) — trending papers.
- [Awesome Computer Vision (GitHub list)](https://github.com/jbhuang0604/awesome-computer-vision) — a long curated list of resources.
- [Kaggle: Computer Vision learning paths and competitions](https://www.kaggle.com/learn) — free hands-on courses.
:::
