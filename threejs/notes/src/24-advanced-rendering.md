---
title: Advanced Rendering Techniques
summary: The wider world of real-time graphics, explained from first principles with the maths. Forward, deferred and clustered (Forward+) rendering; global illumination with lightmaps, light probes and spherical harmonics; reflections; order-independent transparency; fog, volumetrics and Beer–Lambert; raymarching signed distance fields; Monte Carlo path tracing; 3D Gaussian splatting; virtualised geometry; and precision in very large worlds.
difficulty: Advanced
prereqs: Chapters 10, 13 and 19
time: 90 minutes
outcome: Explain clustered shading, global illumination, OIT, volumetrics, SDF raymarching, path tracing and Gaussian splatting, and when each is worth its cost.
---

## Rendering architectures

How a renderer organises lighting work is its biggest design decision, because lighting cost multiplies with both scene complexity and the number of lights.

:::def Forward rendering
Each object is drawn once and its fragment shader evaluates **every light** that might affect it. Simple, works with transparency and MSAA, and is what three.js does by default. Cost grows with (fragments shaded) × (lights), and overdraw wastes lighting work on hidden fragments.
:::

:::def Deferred rendering
Two stages. The **geometry pass** draws all objects once into a **G-buffer** (several textures holding albedo, normal, roughness/metalness, depth for every pixel). The **lighting pass** then shades each screen pixel once per light that touches it, reading the G-buffer. Lighting cost no longer depends on overdraw, and hundreds of lights are affordable. Costs: large memory bandwidth for the G-buffer, no hardware MSAA, transparency needs a separate forward pass, and every material must fit the G-buffer layout.
:::

:::def Clustered (Forward+) shading
Divide the view frustum into a 3D grid of **clusters** (screen tiles × depth slices). A cheap pass assigns each light to the clusters its sphere of influence touches. When shading a fragment, look up its cluster and evaluate **only that cluster's lights**. Works with forward rendering (keeping MSAA and transparency) and with deferred. three.js offers it for `WebGPURenderer` as `ClusteredLighting` (r185).
:::

@fig(clustered) Clustered shading. The view frustum is cut into clusters (here 2D tiles × depth slices). Each cluster stores the short list of lights that reach it, so a fragment evaluates three lights instead of all twelve.

:::calc Light evaluations per frame
A 1080p frame (2.07 M pixels) with average overdraw 1.5 and 50 point lights:

- Forward, all lights everywhere: $2.07\text{M}\times1.5\times50 \approx 155$ million light evaluations per frame.
- Clustered, about 4 lights per cluster on average: $2.07\text{M}\times1.5\times4 \approx 12$ million, about **13× less**. The cluster build costs a little compute, which is negligible by comparison.
:::

```js title="three.js — clustered lighting on WebGPURenderer (r185+)"
import { ClusteredLighting } from "three/addons/lighting/ClusteredLighting.js";
renderer.lighting = new ClusteredLighting(1024 /* max lights */, 32 /* tile px */, 24 /* depth slices */, 64 /* max per cluster */);
for (let i = 0; i < 500; i++) {
  const light = new THREE.PointLight(randomColour(), 4, 3);   // intensity 4 cd, distance 3 m
  light.position.copy(randomPos());
  scene.add(light);
}
// give each light a finite distance: it bounds the light's sphere of influence, so it touches few clusters
```

| | Forward | Deferred | Clustered forward (Forward+) |
|---|---|---|---|
| Lights | Few | Hundreds | Hundreds |
| Overdraw sensitivity | High | Low | Medium (a depth pre-pass helps) |
| Transparency | Native | Separate forward pass | Native |
| MSAA | Yes | Hard | Yes |
| Material variety | Unlimited | Limited by G-buffer | Unlimited |
| Memory bandwidth | Low | High | Medium |

## Global illumination

:::def Global illumination (GI)
Light that arrives **indirectly**, after bouncing off other surfaces: the red glow on a white wall next to a red sofa, soft light filling a room from a sunlit floor, darkening in corners. Direct lighting (Chapters 9–13) ignores it; GI techniques approximate it, trading quality, cost and how dynamic the scene may be.
:::

| Technique | Dynamic? | Cost at runtime | Notes |
|---|---|---|---|
| Baked lightmaps (Blender, Unity, Bakery) | Static geometry and lights | Free (a texture lookup) | Highest quality per cost; needs a second UV set |
| Light probes (spherical harmonics) | Dynamic objects in static lighting | Very cheap | `LightProbe`; probe grids via `LightProbeGridWebGL` (added r184, renamed r186) |
| Irradiance volumes / probe grids | Moving objects in large spaces | Cheap | Interpolate between probes in a 3D grid |
| Reflection probes (cube maps) | Mostly static | Cheap | `CubeCamera` / PMREM per area |
| Screen-space GI (SSGI) | Fully dynamic | Moderate–high | Only what is on screen; `SSGINode` (WebGPU) |
| Voxel / SDF GI | Dynamic | High | Used in large engines |
| Path tracing | Everything | Very high | Offline-like quality; progressive (below) |

:::def Spherical harmonics (SH)
A set of basis functions on the sphere, the spherical equivalent of a Fourier series. Low-frequency lighting around a point (how much light arrives from each direction, blurred) can be stored as a few SH coefficients: **order 2 (L2) uses 9 coefficients per colour channel**, 27 numbers in total. Evaluating irradiance for a normal is then a short polynomial in the normal's components, with no texture lookup.
:::

:::formula Irradiance from L2 spherical harmonics
$$E(\hat{\mathbf{n}}) \approx \sum_{l=0}^{2}\sum_{m=-l}^{l} \hat{A}_l\,L_{lm}\,Y_{lm}(\hat{\mathbf{n}})$$
$L_{lm}$ are the stored coefficients, $Y_{lm}$ the basis functions (constants, $x$, $y$, $z$, $xy$, $yz$, $3z^2-1$, $xz$, $x^2-y^2$ up to normalisation), and $\hat{A}_0 = \pi$, $\hat{A}_1 = 2\pi/3$, $\hat{A}_2 = \pi/4$ the cosine-lobe convolution factors (Ramamoorthi and Hanrahan, 2001).
:::

:::calc The size of a probe grid
A building lit by a $16\times8\times16$ grid of probes: $2{,}048$ probes $\times$ 27 floats $\times$ 4 bytes $= 221$ KB. That small table gives every moving character believable bounce light by trilinearly blending the eight surrounding probes.
:::

## Reflections

| Method | Accuracy | Cost | Limits |
|---|---|---|---|
| Environment map (IBL) | Distant surroundings only | Very low | No nearby objects, no self-reflection |
| Box-projected / local cube maps | Good inside rooms | Low | Assumes a box-shaped room |
| Planar reflection (`Reflector`, `MeshReflectorMaterial`) | Exact for flat mirrors and water | Re-renders the scene | One plane per extra render |
| Screen-space reflections (SSR) | Good for what is visible | Moderate | Missing data off-screen or behind objects |
| Ray-traced reflections | Exact | High | Path tracers, offline |

## Transparency without sorting

Sorting transparent objects (Chapter 2) fails for intersecting or self-overlapping geometry. **Order-independent transparency (OIT)** removes the dependence on order.

:::formula Weighted blended OIT (McGuire and Bavoil, 2013)
$$C = \frac{\sum_i c_i\,\alpha_i\,w_i}{\sum_i \alpha_i\,w_i}\left(1 - \prod_i (1 - \alpha_i)\right) + C_{\text{bg}}\prod_i(1 - \alpha_i)$$
Each transparent fragment adds into two accumulation targets in any order; a weight $w_i$ that decreases with depth favours nearer surfaces. One extra composite pass resolves the image. Approximate, but cheap and stable. three.js's WebGPU stack includes an `OITPassNode`; `alphaHash` (stochastic transparency + TAA) is another order-independent option.
:::

Exact alternatives: **depth peeling** (render several layers, peeling off the nearest each pass: exact, but costs one pass per layer) and per-pixel linked lists (exact, needs compute and atomics).

## Fog, participating media and volumetrics

:::def Participating medium
A volume that interacts with light along the way: fog, smoke, clouds, murky water, dusty air. Light is absorbed and scattered as it travels, so distant objects fade towards the medium's colour and beams of light become visible.
:::

:::formula Beer–Lambert transmittance and three.js fog
$$T(d) = e^{-\sigma_t d}$$
The fraction of light surviving a path of length $d$ through a uniform medium with extinction coefficient $\sigma_t$. three.js fog blends the surface colour towards the fog colour with a factor $f$:
$$f_{\text{linear}} = \frac{d - \text{near}}{\text{far} - \text{near}},\qquad f_{\text{exp2}} = 1 - e^{-(\rho d)^2}$$
(`THREE.Fog(color, near, far)` and `THREE.FogExp2(color, density)`.)
:::

:::calc How foggy is 20 metres?
- `Fog(color, 10, 50)` at 20 m: $f = (20 - 10)/40 = 0.25$.
- `FogExp2(color, 0.05)` at 20 m: $f = 1 - e^{-(0.05\times20)^2} = 1 - e^{-1} = 0.632$.
- A physical medium with $\sigma_t = 0.1\ \text{m}^{-1}$: $T(10) = e^{-1} = 0.37$, so 63% of the light from a wall 10 m away is lost before it reaches you.
:::

@fig(fog_curves) Fog factor against distance: linear fog ramps evenly between near and far; exponential-squared fog stays clear close up and closes in quickly; physical transmittance falls off exponentially.

:::def Raymarched volumetrics
For clouds, smoke and light shafts, march a ray through the volume in small steps; at each step sample density (from noise or a 3D texture), accumulate transmittance with Beer–Lambert and add light scattered towards the eye (with a phase function such as Henyey–Greenstein and a shadow ray towards the sun). Expensive, so done at reduced resolution with temporal accumulation. Screen-space **god rays** (`GodraysNode`) are a cheaper approximation from the depth buffer.
:::

## Raymarching signed distance fields

Chapter 18 used 2D SDFs. In 3D, a scene described entirely by an SDF can be rendered without triangles by **sphere tracing**.

:::def Sphere tracing
March along each pixel's ray. At the current point, the SDF value $d$ is the distance to the nearest surface in **any** direction, so it is safe to step forward by exactly $d$ without passing through anything. Repeat until $d$ is below a small epsilon (a hit) or the ray travels too far (a miss). Normals come from the SDF's gradient (central differences).
:::

:::formula Sphere tracing and SDF normals
$$t_{k+1} = t_k + f(\mathbf{o} + t_k\hat{\mathbf{d}}),\qquad \hat{\mathbf{n}} = \text{normalise}\big(\nabla f\big) \approx \text{normalise}\!\begin{pmatrix} f(\mathbf{p}+\epsilon\hat{\mathbf{x}}) - f(\mathbf{p}-\epsilon\hat{\mathbf{x}})\\ \ldots \\ \ldots\end{pmatrix}$$
:::

@fig(sphere_tracing) Sphere tracing in 2D. Each circle is the safe step given by the distance field at that point; steps shrink as the ray approaches the surface and converge on the hit.

:::calc Tracing the sphere from Chapter 14
The Chapter 14 sphere, mirrored: a ray from the origin along $+z$ towards a sphere at $(0.5, 0, 5)$ with $r = 1$, so $f(\mathbf{p}) = \lVert\mathbf{p} - \mathbf{c}\rVert - 1$.

| Step | $t$ | $f$ |
|---|---|---|
| 0 | 0 | 4.025 |
| 1 | 4.025 | 0.096 |
| 2 | 4.121 | 0.012 |
| 3 | 4.132 | 0.0015 |
| 4 | 4.134 | 0.0002 |

Converged to $t = 4.134$ in five steps: the same answer as the analytic ray–sphere intersection in Chapter 14. Rays passing close to surfaces without hitting need many small steps, which is the main cost of the technique.
:::

SDF raymarching powers Shadertoy-style demos, fractals, soft shadows and ambient occlusion from distance fields, metaballs, and medical or scientific volume rendering. In three.js it is a full-screen quad with a custom shader (or a TSL `Fn` with `Loop`).

## Path tracing

:::def Path tracing
Solving the rendering equation by **Monte Carlo** integration: from each pixel, trace random light paths that bounce around the scene (sampling the BRDF at each hit) until they reach a light, and average many such samples. It produces all effects at once (soft shadows, GI, caustics, glossy reflections), at the cost of noise that only fades as samples accumulate.
:::

:::formula Monte Carlo estimate and its error
$$\int f(x)\,dx \approx \frac{1}{N}\sum_{i=1}^{N}\frac{f(x_i)}{p(x_i)},\qquad \text{error} \propto \frac{1}{\sqrt{N}}$$
$p$ is the probability density used to choose samples. **Importance sampling** (choosing directions where the BRDF or the lights are strong) lowers the variance; denoisers remove much of what remains.
:::

@fig(monte_carlo) Monte Carlo ambient occlusion of a sphere on a floor, computed per pixel with 1, 4, 16 and 64 random rays. Noise falls as 1/√N: sixteen times the samples give a four times cleaner image.

:::calc Samples versus noise
To halve the noise you need **four times** the samples. Going from 16 to 1,024 samples per pixel ($64\times$ more work) reduces noise by only $8\times$. Interactive path tracers (such as three-gpu-pathtracer for three.js) therefore render progressively: a noisy image while the camera moves, refining when it stops, plus a denoiser.
:::

## 3D Gaussian splatting

:::def 3D Gaussian splatting (3DGS)
A scene represented not by triangles but by millions of small, semi-transparent, coloured 3D Gaussians ("splats"), each with a position, a shape (3D covariance from a scale and a rotation), an opacity and a view-dependent colour (spherical-harmonic coefficients). They are **optimised from photographs** of a real place or object, giving photoreal captures that render in real time. three.js r186 added `GaussianSplat` with PLY, `.splat`, `.ksplat` and glTF loaders (on `WebGPURenderer`); World Labs' **Spark** library is a full-featured splat renderer for three.js.
:::

:::formula Splat geometry and blending
Each Gaussian's 3D covariance is $\Sigma = R\,S\,S^T R^T$ (rotation $R$ from a quaternion, scale $S$ diagonal). Projected to the screen it becomes a 2D ellipse with covariance $\Sigma' = J\,W\,\Sigma\,W^T J^T$ ($W$ the view rotation, $J$ the Jacobian of the perspective projection). Splats are **sorted by depth** and composited front to back:
$$C = \sum_{i} c_i\,\alpha_i \prod_{j<i}(1 - \alpha_j)$$
where $\alpha_i$ is the splat's opacity times its Gaussian falloff at the pixel.
:::

:::calc Three splats over one pixel
Front to back, opacities $\alpha = 0.7, 0.9, 0.5$:
- Splat 1 contributes $0.7$ of its colour; remaining transmittance $0.3$.
- Splat 2 contributes $0.3\times0.9 = 0.27$; remaining $0.3\times0.1 = 0.03$.
- Splat 3 contributes $0.03\times0.5 = 0.015$.
After two splats 97% of the pixel is decided, which is why renderers stop early once transmittance is tiny.
:::

@fig(splat_blend) Gaussian splats are anisotropic, semi-transparent ellipses. Sorted front to back and alpha-blended, millions of them reconstruct a photoreal scene.

```js title="three.js — loading a Gaussian splat capture (r186, WebGPURenderer)"
import * as THREE from "three/webgpu";
import { GaussianSplat } from "three/addons/objects/GaussianSplat.js";
import { GaussianSplatPLYLoader } from "three/addons/loaders/GaussianSplatPLYLoader.js";

const geometry = await new GaussianSplatPLYLoader().loadAsync("/captures/garden.ply");
const splats = new GaussianSplat(geometry);       // sorts splats back to front automatically (autoSort)
scene.add(splats);
```

| | Meshes | Gaussian splats |
|---|---|---|
| Source | Modelled or scanned and retopologised | Optimised from photos or video |
| Look | Depends on materials and lighting | Photoreal, lighting baked in |
| Editing and relighting | Easy | Hard (research area) |
| Physics and collisions | Easy | Needs a proxy mesh |
| Size | Small | Large (tens to hundreds of MB; compressed formats such as `.spz` help) |
| Rendering | Rasterised triangles, depth buffer | Sorted, blended quads; sorting is the bottleneck |

## Virtualised geometry and GPU-driven rendering

Film-quality assets have millions of triangles. **Virtualised geometry** (popularised by Unreal's Nanite) splits meshes into small **clusters (meshlets)** of about 64–128 triangles, builds a hierarchy of simplified cluster groups, and each frame selects, per region of the screen, the coarsest clusters whose error is under a pixel. Culling and LOD selection run on the GPU (compute shaders), which then draw everything with indirect draw calls. On the web this is experimental, enabled by WebGPU compute and indirect drawing; three.js ships meshoptimizer's clusteriser and simplifier in `examples/jsm/libs` as building blocks.

## Large worlds and precision

:::warn Floating-point precision far from the origin
GPUs compute positions in 32-bit floats, which have 24 bits of precision. The spacing between representable values grows with magnitude: at 10 km from the origin it is about 1 mm, at 1,000 km 6 cm, at Earth's radius (6,371 km) **0.5 m**. Vertices snap to that grid, so geometry far from the origin jitters as the camera moves.
:::

:::calc Precision at a distance
A float32 with exponent $e$ has spacing $2^{e-23}$. At 10,000 m, $e = 13$: $2^{-10} = 0.98$ mm. At $10^6$ m, $e = 19$: $2^{-4} = 0.0625$ m. At 6,371 km, $e = 22$: $2^{-1} = 0.5$ m.
:::

Fixes: **floating origin** (keep the camera near (0, 0, 0) and move the world instead, re-basing when the camera travels far), relative-to-eye rendering (subtract the camera position in double precision on the CPU before uploading), tiled worlds with local origins, and logarithmic or reversed depth for the huge depth ranges (Chapter 6). Geospatial three.js work typically uses `3d-tiles-renderer` (NASA-AMMOS) for streamed, LOD-managed Cesium 3D Tiles and Google Photorealistic 3D Tiles.

:::lens Choosing a rendering architecture
Junior: Uses three.js's default forward renderer and adds lights until the scene looks right.
Mid-level: Knows the cost of each light and shadow, bakes static lighting, and uses environment maps and post-processing deliberately.
Senior: Chooses the rendering approach from the product's requirements (number of lights, transparency, target devices, art direction): clustered lighting for many lights, baked GI for static worlds, splats or path tracing where photorealism matters, and documents the trade-offs so the team can live with them.
:::

:::keypoints
- Forward: lights per fragment; deferred: G-buffer then lighting per pixel; clustered: only the lights in each cluster (`ClusteredLighting` in r185).
- GI: bake when static; light probes with L2 spherical harmonics (27 numbers) for dynamic objects; SSGI and path tracing for dynamic, expensive cases.
- Reflections range from environment maps to planar mirrors, SSR and ray tracing.
- OIT (weighted blended, depth peeling, stochastic `alphaHash`) avoids sorting failures.
- Fog: linear and exp² in three.js; physically $T = e^{-\sigma_t d}$; volumetrics by raymarching.
- Sphere tracing steps by the SDF value; normals from the SDF gradient.
- Path tracing is Monte Carlo: noise ∝ $1/\sqrt{N}$, so importance sampling and denoising matter.
- Gaussian splats: covariance $RSS^TR^T$ projected with $JW$, sorted and alpha-blended; `GaussianSplat` (r186) and Spark.
- Float32 spacing $2^{e-23}$: use floating origins for large worlds.
:::

## Interview questions

:::qa Compare forward, deferred and clustered rendering. {level=senior}
Forward shading evaluates all relevant lights in each object's fragment shader: simple, supports MSAA, transparency and any material, but cost scales with lights × shaded fragments, including overdraw. Deferred writes surface attributes to a G-buffer first and lights each screen pixel once per affecting light, decoupling lighting from overdraw and handling many lights, at the cost of bandwidth, no hardware MSAA, a separate forward path for transparency and a fixed material model. Clustered (Forward+) keeps forward shading but culls lights into 3D clusters of the frustum so each fragment evaluates only nearby lights, giving many-light performance while keeping MSAA and transparency; it works with deferred too.
:::

:::qa What are spherical harmonics used for in real-time rendering? {level=senior}
To store low-frequency lighting compactly: the irradiance arriving at a point from all directions is projected onto the first few SH basis functions (9 coefficients per channel for L2). Evaluating diffuse lighting for any normal is then a cheap polynomial. They are used for light probes and probe grids giving dynamic objects baked bounce light, for the diffuse part of environment lighting, and in Gaussian splats for view-dependent colour. They cannot represent sharp detail, which is why specular reflections use prefiltered cube maps instead.
:::

:::qa What is 3D Gaussian splatting and how does it differ from meshes? {level=mid}
A capture representation: millions of anisotropic 3D Gaussians, each with position, covariance (scale and rotation), opacity and view-dependent colour, optimised from photographs so that rendering them reproduces the photos. Rendering projects each Gaussian to a 2D ellipse, sorts them by depth and alpha-blends them front to back. It produces photoreal results from a phone video without modelling, but the lighting is baked in, editing and collision need extra work, files are large, and depth sorting is the main performance cost. three.js r186 has a `GaussianSplat` addon; Spark is a full renderer.
:::

:::qa A planet-scale scene jitters when the camera is far from the origin. Why and how do you fix it? {level=mid}
32-bit floats have about seven significant digits, so at millions of metres from the origin the spacing between representable positions reaches tens of centimetres; vertex positions and the camera snap to that coarse grid and jitter as the camera moves. Fix it with a floating origin (keep the camera at or near the origin and translate the world, re-basing periodically), relative-to-eye transforms computed in double precision on the CPU, local tile origins, and a logarithmic or reversed depth buffer for the huge depth range.
:::

:::qa How does sphere tracing work, and when is it slow? {level=mid}
For each pixel a ray is marched through a signed distance field. The SDF value at the current point is the radius of an empty sphere around it, so the ray can safely advance by that amount; it repeats until the distance is below a threshold (hit) or a maximum distance or step count is reached (miss). Normals come from the SDF gradient. It is slow when rays graze surfaces (the distance stays small, so steps stay small), for complex SDFs that are expensive to evaluate per step, and at high resolution, since every pixel runs the loop.
:::
