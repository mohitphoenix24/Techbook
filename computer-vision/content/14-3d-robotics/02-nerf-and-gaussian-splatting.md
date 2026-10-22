---
title: NeRF and 3-D Gaussian Splatting
level: advanced
time: 55
summary: Neural scene representations. How a radiance field turns rays into pixels with volume rendering, why NeRF needs positional encoding (shown in a trained check), speed-ups (Instant-NGP, Mip-NeRF), 3-D Gaussian splatting and how it renders in real time, comparison with SfM and meshes, and uses in robotics.
---

Photogrammetry (module 5: SfM and multi-view stereo) builds a 3-D model from photos. In 2020 **NeRF** showed a different way: let a neural network **memorise the scene** and render **new views** with striking realism. In 2023 **3-D Gaussian splatting (3DGS)** made this real-time. Both belong in every modern 3-D interview.

## NeRF: a scene as a function

A **neural radiance field** is a function learned from photos with known camera poses (from COLMAP/SfM):

`F(x, y, z, view direction) → (colour, density σ)`

The network takes a **3-D point** and the **direction** you look from, and returns its **colour** (which may depend on direction, for shiny surfaces) and its **density** (how much "stuff" is there; 0 = empty air).

## Volume rendering: from the field to pixels

To get a pixel, shoot a **ray** from the camera centre through that pixel (the pinhole geometry of module 5), sample many points along it, ask the network at each point, and **accumulate colour front to back**:

:::formula Volume rendering along a ray
`αᵢ = 1 − exp(−σᵢ δᵢ)`   (chance the ray is absorbed inside slab *i* of length δᵢ)
`Tᵢ = ∏ⱼ<ᵢ (1 − αⱼ)`   (transmittance: the chance the ray reached slab *i*)
`pixel = Σᵢ Tᵢ αᵢ cᵢ`    (the weight of a sample is Tᵢαᵢ)
The same weights give the **expected depth**, so NeRF also produces depth maps.
:::

Training: render pixels from the training views and minimise the **squared colour error** to the real photo. Everything is differentiable, so gradient descent learns the field. The next demo does the rendering step for one ray through two objects: a half-transparent red ball and a solid blue wall.

```python run title="Volume rendering along a single ray" level=advanced
import numpy as np

# a ray through a scene: two "objects" along the ray, at t = 2.0 (a red ball, fairly transparent) and t = 3.5 (a solid blue wall)
def scene(t):
    sigma = 4.0 * np.exp(-((t - 2.0) / 0.12) ** 2) + 30.0 * np.exp(-((t - 3.5) / 0.1) ** 2)              # density: how much "stuff" is at depth t
    red = np.exp(-((t - 2.0) / 0.3) ** 2)[:, None] * np.array([1.0, 0.1, 0.1])
    blue = (1 - np.exp(-((t - 2.0) / 0.3) ** 2))[:, None] * np.array([0.1, 0.2, 1.0])
    return sigma, red + blue

def render(n, near=1.0, far=5.0, stratified=False, seed=0):
    rng = np.random.default_rng(seed)
    t = np.linspace(near, far, n, endpoint=False)
    if stratified: t = t + rng.random(n) * (far - near) / n                                              # jitter inside each bin (what NeRF does in training)
    delta = np.full(n, (far - near) / n)
    sigma, color = scene(t)
    alpha = 1 - np.exp(-sigma * delta)                                                                    # chance that the ray stops inside this slab
    T = np.cumprod(np.concatenate([[1.0], 1 - alpha[:-1]]))                                              # transmittance: chance it reached this slab
    w = T * alpha                                                                                         # weight of each sample
    return (w[:, None] * color).sum(0), (w * t).sum() / max(w.sum(), 1e-9), w.sum()

print("samples | rendered colour (R, G, B)    | expected depth | total opacity")
for n in (4, 8, 16, 64, 256):
    c, d, o = render(n)
    print(f"{n:>7} | {c[0]:.2f}, {c[1]:.2f}, {c[2]:.2f}             | {d:.2f}           | {o:.2f}")
print("with too few samples the answer depends on where the samples happen to fall (4 samples see only the ball and miss the wall); enough samples converge, hence the coarse-to-fine sampling in NeRF")
c, d, o = render(256)
print("the ball is only partly opaque (density 4), so the colour is a blend of red (ball) and blue (wall behind it):", np.round(c, 2))
```

NeRF uses **hierarchical sampling**: a coarse pass finds where the weights are large, and a fine pass samples more densely there.

## Why positional encoding?

A plain MLP is biased towards **smooth, low-frequency** functions (the *spectral bias*), so it renders blurry scenes. NeRF first maps each coordinate through **sines and cosines at growing frequencies** (Fourier features), which lets the same small network fit sharp detail. The check below fits a 64×64 photo by an MLP that maps `(x, y)` to colour, with and without such features.

```python local check title="Positional encoding lets an MLP fit fine detail (the heart of NeRF)"
import math
import numpy as np
import cv2
import torch
from torch import nn
import cvlab

torch.manual_seed(0)
device = "cuda" if torch.cuda.is_available() else "cpu"
img = cv2.resize(cvlab.image("astronaut"), (64, 64), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
H, W = img.shape[:2]
ys, xs = torch.meshgrid(torch.linspace(0, 1, H), torch.linspace(0, 1, W), indexing="ij")
coords = torch.stack([xs, ys], -1).reshape(-1, 2).to(device)                       # input: (x, y); the network "is" the image
target = torch.tensor(img).reshape(-1, 3).to(device)

def fourier(x, L):                                                                  # positional encoding: sin/cos at growing frequencies
    if L == 0: return x
    freqs = (2.0 ** torch.arange(L, device=x.device)) * math.pi
    return torch.cat([x] + [f(x * w) for w in freqs for f in (torch.sin, torch.cos)], -1)

def fit(L, steps=1500):
    torch.manual_seed(0)
    d_in = 2 + 4 * L
    net = nn.Sequential(nn.Linear(d_in, 128), nn.ReLU(), nn.Linear(128, 128), nn.ReLU(), nn.Linear(128, 128), nn.ReLU(), nn.Linear(128, 3), nn.Sigmoid()).to(device)
    opt = torch.optim.Adam(net.parameters(), lr=2e-3)
    for _ in range(steps):
        loss = ((net(fourier(coords, L)) - target) ** 2).mean()
        opt.zero_grad(); loss.backward(); opt.step()
    return 10 * math.log10(1 / loss.item())

print("positional-encoding frequencies L | PSNR of the fitted image after 1500 steps")
for L in (0, 2, 6, 10):
    print(f"{L:>33} | {fit(L):.2f} dB")
print("a plain MLP prefers smooth functions (spectral bias); Fourier features let it fit fine detail: this is why NeRF uses positional encoding")
```

## Making NeRF fast and better

| Method | Idea |
|---|---|
| **Instant-NGP** | A **multi-resolution hash grid** of learned features replaces most of the MLP: training in seconds to minutes instead of hours |
| **Mip-NeRF / Mip-NeRF 360** | Cast **cones** instead of rays (anti-aliasing), contract space for unbounded scenes |
| **Nerfacto / Nerfstudio** | A practical toolbox combining the best parts, with a viewer |
| **TensoRF, Plenoxels, K-Planes** | Factorised or explicit grids instead of a big MLP |
| **NeuS, VolSDF, 2DGS** | Represent a **surface** (signed distance) for better geometry |
| **Few-view / generalisable NeRF** (PixelNeRF, MVSNeRF), **DreamFusion** | Fewer photos or generation from text using diffusion models as a prior |
| **Dynamic NeRF** (D-NeRF, HexPlane, 4D-GS) | Moving scenes and people |

## 3-D Gaussian Splatting

3DGS replaces the neural network with **millions of explicit 3-D Gaussians** (soft ellipsoids). Each has:

- a **position** (3), a **scale** (3) and **rotation** (a quaternion, 4) that define its shape;
- an **opacity** (1) and a **colour** stored as spherical-harmonic coefficients (up to 48), which let colour change with the viewing direction.

**Rendering = splatting**: project every 3-D Gaussian onto the image as a 2-D Gaussian (an ellipse), **sort by depth**, and **alpha-composite** front to back, exactly the same formula as above but on a rasteriser instead of ray marching. A custom GPU tile-based rasteriser draws 100+ frames per second at 1080p.

```python run title="Splatting: depth-sorted alpha compositing of Gaussians" level=intermediate
import numpy as np
import cvlab

H = W = 96
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)

# a few 3-D Gaussians after projection: 2-D centre, 2x2 covariance (an ellipse), colour, opacity, depth
gs = [
    dict(mu=(40, 44), cov=[[260, 60], [60, 90]], col=(0.9, 0.2, 0.2), op=0.95, z=3.0),
    dict(mu=(52, 48), cov=[[120, -80], [-80, 200]], col=(0.2, 0.4, 0.95), op=0.9, z=2.0),
    dict(mu=(46, 56), cov=[[300, 0], [0, 60]], col=(0.95, 0.85, 0.2), op=0.8, z=1.0),
    dict(mu=(42, 62), cov=[[150, 20], [20, 120]], col=(0.2, 0.8, 0.4), op=0.9, z=4.0),
]

def render(gaussians, order):
    img = np.zeros((H, W, 3), np.float32)
    T = np.ones((H, W), np.float32)                                         # transmittance: how much light still passes through
    for g in order(gaussians):
        d = np.stack([xs - g["mu"][0], ys - g["mu"][1]], -1)
        inv = np.linalg.inv(np.array(g["cov"], np.float32))
        power = -0.5 * np.einsum("hwi,ij,hwj->hw", d, inv, d)
        alpha = np.clip(g["op"] * np.exp(power), 0, 0.99)                   # opacity falls off like a Gaussian bump
        img += (T * alpha)[..., None] * np.array(g["col"], np.float32)       # front-to-back alpha compositing
        T *= 1 - alpha
    return np.clip(img, 0, 1), T

front_to_back = lambda g: sorted(g, key=lambda a: a["z"])
shuffled = lambda g: g                                                       # wrong: ignore depth
img_a, T = render(gs, front_to_back)
img_b, _ = render(gs, shuffled)
print("image values range:", float(img_a.min()), "to", round(float(img_a.max()), 2))
diff = np.abs(img_a - img_b)
print(f"depth order changes the picture: largest per-pixel colour change {diff.max():.2f}, {(diff.max(-1) > 0.05).mean():.0%} of pixels change by more than 0.05")
print("real 3DGS sorts the Gaussians by depth per tile (on the GPU) because the compositing order changes the picture")
print("one Gaussian = 3 (position) + 3 (scale) + 4 (rotation) + 1 (opacity) + 48 (spherical-harmonic colour) = 59 numbers; a scene has 1-6 million of them")
big = lambda a: (np.kron(a, np.ones((3, 3, 1))) * 255).astype(np.uint8) if a.ndim == 3 else None
cvlab.show(big(img_a), "Sorted by depth (correct)", big(img_b), "Unsorted (wrong)")
```

**Training**: start from the sparse SfM point cloud (COLMAP), initialise a Gaussian per point, render, compare with the training photos (L1 + SSIM), and optimise all parameters with Adam. **Adaptive density control** adds Gaussians where the error is large (**split** big ones, **clone** small ones in under-reconstructed areas) and **prunes** the transparent ones. Training takes 10–40 minutes for a room.

## NeRF vs 3DGS vs classic reconstruction

| | **Classic SfM + MVS + mesh** | **NeRF** | **3D Gaussian splatting** |
|---|---|---|---|
| Output | Point cloud / mesh + textures | Neural field (weights) | Millions of Gaussians (a file) |
| View-dependent effects (reflections) | Poor | Good | Good |
| Training time | Minutes-hours | Hours (vanilla), minutes (Instant-NGP) | Minutes |
| Rendering speed | Real time (mesh) | Slow (vanilla), fast variants | **Real time** |
| Geometry accuracy | **Best for metric accuracy** | Noisy density, needs extraction | Floaters, loose geometry (2DGS / SuGaR improve) |
| Editing, physics, CAD use | Easy (mesh) | Hard | Moderate (tools exist) |
| Needs poses | Estimates them | Needs COLMAP poses | Needs COLMAP poses |

## Uses in robotics and industry

- **Digital twins** and **inspection**: capture a plant or a part and look at it from any angle, compare over time.
- **Simulation**: turn real scenes into photorealistic simulation backgrounds for sim-to-real training (module 14, lesson on VLA and sim-to-real).
- **Mapping and SLAM**: NeRF/3DGS-based SLAM (iMAP, NICE-SLAM, SplaTAM, GS-ICP SLAM) produce dense colour maps; classical SLAM is still more robust and faster for pose tracking.
- **Manipulation**: NeRF-based grasp planning for transparent objects (Dex-NeRF), feature fields (**Distilled Feature Fields**, LERF: language-embedded radiance fields) for open-vocabulary queries in 3-D.
- **Data augmentation / synthetic data** by rendering new viewpoints of captured scenes.
- **Photogrammetry-style measurement**: prefer SfM/MVS or LiDAR, which have known metric accuracy; neural fields give beautiful pictures that are not guaranteed to be metrically right.

## Failure modes

- **Pose quality** limits everything: wrong COLMAP poses give blur and ghosts.
- **Few views, textureless regions, glass and mirrors, moving objects and lighting changes** break the static-scene assumption.
- **Floaters** (stray Gaussians or density in empty space) and **view-dependent overfitting** away from training views.
- **Scale and unbounded scenes** need special parametrisations; **aliasing** when zooming out (Mip-Splatting).
- **Memory**: millions of Gaussians (hundreds of MB); compress with pruning and quantisation.

:::interview Questions you may get
- "Explain how NeRF renders an image." For each pixel, cast a ray, sample points, query the network for colour and density, and alpha-composite with weights `Tᵢαᵢ`; train by comparing the rendered colour with the real photo.
- "Why positional encoding?" An MLP is biased to low frequencies; sinusoidal features of coordinates allow fitting high-frequency detail.
- "What does 3DGS change compared with NeRF?" Explicit Gaussians rasterised with depth-sorted alpha blending instead of a neural network sampled along rays: much faster training and real-time rendering, with more memory.
- "What inputs do they need?" Images with accurate camera poses (usually from COLMAP/SfM) and intrinsics.
- "Would you use NeRF or SfM for a metric measurement of a part?" SfM/MVS, structured light or LiDAR with calibration; neural fields are not guaranteed to be metrically accurate.
- "How do you get depth from a NeRF?" The expected termination depth `Σ wᵢ tᵢ` along each ray.
:::

```quiz
? What is the weight of a sample along a ray in volume rendering?
+ Tᵢ · αᵢ (probability that the ray reaches it and is absorbed there)
- Its colour
- The distance to the camera
> Transmittance times opacity.

? Why do NeRFs use positional (Fourier) encoding?
+ To overcome the spectral bias of MLPs and represent fine detail
- To compress the images
- To estimate camera poses
> Low-frequency bias.

? What does 3D Gaussian splatting render with?
+ A tile-based rasteriser that alpha-composites depth-sorted projected Gaussians
- Ray marching through an MLP only
- A mesh
> Real-time rendering.

? Which input is normally required to train NeRF or 3DGS?
+ Photos with known camera poses
- LiDAR scans only
- Text descriptions
> Poses from SfM.
```

:::problem A customer wants to measure the volume of gravel piles from drone photos. Would you use NeRF or Gaussian splatting? What would you do instead and how would you validate it? {level=medium tags="nerf,measurement,drone"}
Think about metric accuracy and scale.

:::solution Model answer
For volume measurement use photogrammetry (SfM + MVS) with ground control points or RTK-GPS so the model is metrically scaled, producing a digital surface model (DSM) from which you integrate the volume above a fitted base plane. NeRF/3DGS give nice visuals but not guaranteed metric geometry (floaters, soft surfaces). Validate against a surveyed pile (total station or LiDAR scan), report the error as a percentage, repeat on different days/lighting, and track failure on shadows or vegetation; neural methods may help with visualisation or filling gaps but not as the measurement source.
:::
:::

:::keypoints
- NeRF: an MLP maps position and direction to colour and density; volume rendering alpha-composites samples along rays; positional encoding is essential for detail.
- Speed-ups: hash-grid encodings (Instant-NGP), anti-aliasing (Mip-NeRF), explicit grids; Nerfstudio packages them.
- 3DGS: millions of explicit Gaussians, depth-sorted splatting on a GPU rasteriser; trains in minutes and renders in real time, with adaptive density control.
- Both need good camera poses and a static scene; for metric measurement prefer SfM/MVS/LiDAR; use neural fields for view synthesis, digital twins and simulation.
:::

:::resources
- [Mildenhall et al.: NeRF](https://arxiv.org/abs/2003.08934) — the original paper.
- [Tancik et al.: Fourier Features Let Networks Learn High Frequency Functions](https://arxiv.org/abs/2006.10739) — why positional encoding works.
- [Müller et al.: Instant Neural Graphics Primitives](https://arxiv.org/abs/2201.05989) — hash-grid encoding.
- [Barron et al.: Mip-NeRF](https://arxiv.org/abs/2103.13415) — anti-aliased radiance fields.
- [Kerbl et al.: 3D Gaussian Splatting for Real-Time Radiance Field Rendering](https://arxiv.org/abs/2308.04079) — the splatting paper.
- [Nerfstudio documentation](https://docs.nerf.studio) — a practical NeRF/3DGS toolbox.
:::
