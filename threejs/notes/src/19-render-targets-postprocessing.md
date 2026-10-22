---
title: Render Targets and Post-processing
summary: Rendering into textures, ping-pong buffers and multiple render targets, then the post-processing pipeline with EffectComposer (WebGL), pmndrs postprocessing (R3F) and RenderPipeline (WebGPU), and how the classic effects work inside: bloom, separable blur, SSAO/GTAO, anti-aliasing (MSAA, FXAA, SMAA, TAA), depth of field with the circle-of-confusion formula, outlines and colour grading.
difficulty: Advanced
prereqs: Chapters 12 and 18
time: 75 minutes
outcome: Render into textures, assemble post-processing chains for WebGL and WebGPU, and explain how bloom, AO, anti-aliasing and depth of field work.
---

## Rendering into a texture {intermediate}

:::def Render target
An off-screen framebuffer (`WebGLRenderTarget` / `RenderTarget`) with a colour texture and optionally a depth (and stencil) buffer. Calling `renderer.setRenderTarget(rt)` makes the next `render()` draw into it instead of the canvas; the result `rt.texture` can then be used like any texture.
:::

| Use | How |
|---|---|
| Mirrors, water, portals | Render the scene from a mirrored or virtual camera into a target, map it onto a surface (`Reflector`, `Water` addons) |
| Security-camera screens, minimaps | A second camera into a target shown on a mesh |
| Shadow maps, transmission | three.js does it internally (Chapters 10 and 13) |
| Post-processing | Render the scene into a target, process it with full-screen passes |
| GPGPU (WebGL) | Store simulation state in float textures; update with shaders |
| Picking | Render object IDs into a small target (Chapter 14) |

```js title="three.js — a TV screen showing another camera"
const rt = new THREE.WebGLRenderTarget(512, 512, {
  type: THREE.HalfFloatType,      // HDR-capable; UnsignedByteType for plain 8-bit
  samples: 4,                     // MSAA inside the target (WebGL 2)
  depthBuffer: true,
});
const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ map: rt.texture }));

renderer.setAnimationLoop(() => {
  tv.visible = false;                        // avoid rendering the screen into itself (a feedback loop)
  renderer.setRenderTarget(rt);
  renderer.render(scene, securityCam);
  renderer.setRenderTarget(null);            // back to the canvas
  tv.visible = true;
  renderer.render(scene, camera);
});
```

:::warn Reading and writing the same texture
A shader may not sample the texture it is currently rendering into; the result is undefined (and WebGL reports a feedback loop). Effects that need the previous result, such as motion trails, blurs and simulations, use **two** targets and swap them every frame: **ping-pong** buffers.
:::

:::def Multiple render targets (MRT)
Writing several outputs from one fragment shader in a single pass (colour, normals, depth, velocity, emissive). It is the basis of deferred shading's G-buffer and makes post-effects cheaper because the scene is drawn once. `WebGLRenderTarget` accepts a `count` option; in WebGPU, `pass()` combined with `mrt({ output, normal, velocity })` does this in TSL.
:::

## The post-processing pipeline

:::def Post-processing
Rendering the scene into a render target and then running one or more **full-screen passes** (fragment shaders over a screen-sized triangle) that read the image (and often the depth buffer) and write a modified image, until the last pass writes to the canvas.
:::

@fig(postfx_pipeline) A typical post-processing chain. The scene renders once into a half-float target; effects read colour and depth; tone mapping and the sRGB conversion happen once, at the end.

```js title="three.js — EffectComposer (WebGLRenderer)"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const composer = new EffectComposer(renderer);          // uses a HalfFloat target by default
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new GTAOPass(scene, camera, innerWidth, innerHeight));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.4, 0.9)); // strength, radius, threshold
composer.addPass(new SMAAPass());
composer.addPass(new OutputPass());                      // tone mapping + sRGB, once, at the end
renderer.setAnimationLoop(() => composer.render());      // instead of renderer.render
addEventListener("resize", () => composer.setSize(innerWidth, innerHeight));
```

```js title="three.js — RenderPipeline (WebGPURenderer, TSL)"
import * as THREE from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

const pipeline = new THREE.RenderPipeline(renderer);    // named PostProcessing before r183
const scenePass = pass(scene, camera);
const sceneColor = scenePass.getTextureNode("output");
pipeline.outputNode = sceneColor.add(bloom(sceneColor, 1.2, 0.4, 0.6));   // strength, radius, threshold
renderer.setAnimationLoop(() => pipeline.render());     // tone mapping + sRGB applied automatically at the end
```

:::apichange Post-processing classes
Older tutorials: `new THREE.PostProcessing(renderer)` on `WebGPURenderer`; on `WebGLRenderer`, a gamma-correction `ShaderPass` at the end of the composer.
Current approach: `new THREE.RenderPipeline(renderer)` for WebGPU. For `EffectComposer`, finish the chain with `OutputPass`, which reads tone mapping and output colour space from the renderer (inline tone mapping only applies when rendering to the screen).
Why it changed: `OutputPass` centralises the final colour transform so it happens exactly once; `RenderPipeline` is a rename.
Version: `OutputPass` added in r153, parameterless since r155; `PostProcessing` renamed `RenderPipeline` in r183.
:::


```jsx title="R3F — @react-three/postprocessing (WebGL)"
import { EffectComposer, Bloom, N8AO, SMAA, Vignette, ToneMapping } from "@react-three/postprocessing";

<Canvas gl={{ antialias: false }}>         {/* the composer does its own anti-aliasing */}
  <Scene />
  <EffectComposer multisampling={4}>
    <N8AO aoRadius={0.6} intensity={3} />
    <Bloom mipmapBlur luminanceThreshold={1} intensity={1.2} />
    <Vignette offset={0.25} darkness={0.6} />
    <SMAA />
  </EffectComposer>
</Canvas>
```

:::tip Why pmndrs postprocessing is faster
The pmndrs `postprocessing` library (behind `@react-three/postprocessing`) **merges** compatible effects into a single full-screen pass where possible, instead of one pass per effect as `EffectComposer` does. Every full-screen pass reads and writes every pixel, so at 4K with 6 passes you move gigabytes of memory per second; merging saves most of that.
:::

:::calc The cost of full-screen passes
A 2560 × 1440 canvas at DPR 1 is 3.69 M pixels. Each pass reads and writes a half-float RGBA texel (8 bytes each way): about $3.69\text{M}\times16 = 59$ MB of memory traffic per pass per frame. Six passes at 60 Hz: about **21 GB/s**, a large share of an integrated GPU's bandwidth. Hence: fewer passes, merged effects, and half-resolution buffers for blurry effects (bloom, AO, DOF).
:::

## Inside the classic effects

### Gaussian and separable blur

:::formula Gaussian weights
$$w(x) = \frac{1}{\sqrt{2\pi}\,\sigma}\,e^{-x^2/(2\sigma^2)}$$
A 2D Gaussian is **separable**: blurring horizontally then vertically equals one 2D blur. An $N\times N$ kernel then costs $2N$ samples instead of $N^2$.
:::

:::calc A 9-tap blur
$\sigma = 2$, taps $x = -4\ldots4$, normalised weights: $0.028,\ 0.066,\ 0.124,\ 0.180,\ \mathbf{0.204},\ 0.180,\ 0.124,\ 0.066,\ 0.028$ (they sum to 1). A full 9×9 kernel needs 81 texture reads per pixel; two separable passes need $9 + 9 = 18$. Linear filtering can halve that again by sampling between two texels with a combined weight.
:::

### Bloom

:::def Bloom
The glow that spreads around very bright light (from lens and eye imperfections). Algorithm: (1) **bright pass**: keep only pixels brighter than a threshold (in HDR, above 1.0 means "brighter than white"); (2) **downsample** into a mip chain (½, ¼, ⅛… resolution), blurring each level; (3) **upsample** and add the levels back together; (4) **add** the result to the original image.
:::

@fig(bloom_chain) Bloom as a mip chain. Each level is half the size of the previous, so blurring it covers twice the screen distance for the same cost. Adding the levels back together gives a wide, natural glow.

:::tip Selective glow without masks
In an HDR pipeline only pixels above the threshold glow. Set `luminanceThreshold` to 1 and give the things that should glow `emissiveIntensity` above 1 (with `toneMapped: true`): neon tubes bloom, white paper does not, with no layers or selection masks needed.
:::

### Ambient occlusion: SSAO and GTAO

:::def Screen-space ambient occlusion
An approximation of how much ambient light reaches each point, darkening creases, corners and contact areas. For each pixel, sample points in a hemisphere around its normal (reconstructed from the depth buffer) and count how many are hidden behind nearby geometry in the depth buffer: $\text{AO} = 1 - \frac{\text{occluded}}{N}$. **GTAO** (ground-truth AO) instead searches horizon angles in a few directions and integrates the visible arc analytically, giving more physically correct results for similar cost. Both need a blur or denoise because they use few samples per pixel.
:::

:::calc AO from samples
16 hemisphere samples, 6 of them end up behind the depth buffer: $\text{AO} = 1 - 6/16 = 0.625$, so ambient lighting at that pixel is multiplied by 0.625. Since r181, three.js's GTAO stores AO in the red channel, and r185 made it more physically correct (darker and wider), so lower `radius` and `scale` after upgrading.
:::

### Anti-aliasing

| Method | How | Cost | Quality and caveats |
|---|---|---|---|
| **MSAA** (`antialias: true`, `samples`) | Several coverage samples per pixel at triangle edges; shading once per pixel | Memory × samples; cheap shading | Great geometric edges; does nothing for shader aliasing or specular shimmer |
| **FXAA** | One pass finds high-contrast edges in the final image and blurs along them | Very cheap | Slightly blurry, misses subpixel detail |
| **SMAA** | Detects edge shapes (lines, corners) with lookup textures, blends precisely | Cheap–moderate | Sharper than FXAA; no temporal stability |
| **TAA / TRAA** | Jitter the camera by a subpixel offset each frame; blend with the reprojected history | Moderate (needs velocity buffer) | Best quality and stability; risk of ghosting and blur on motion |
| Supersampling (SSAA) | Render at higher resolution and downsample | Very expensive | Reference quality |

:::def Temporal anti-aliasing
Each frame the projection is shifted by a different subpixel offset (from a low-discrepancy sequence such as Halton), so over several frames every pixel is sampled at many positions. The current frame is blended with the previous result, **reprojected** using per-pixel motion vectors; history colours are clamped to the current neighbourhood's colour range to reject stale data (otherwise you see ghosting). TAA also cleans up noisy effects such as `alphaHash`, SSR and AO. three.js provides `TRAANode` for WebGPU, and r184 added FSR 1 and TAAU upscaling nodes.
:::

### Depth of field

:::formula Circle of confusion
$$c = \frac{A\,f\,|S_2 - S_1|}{S_2\,(S_1 - f)},\qquad A = \frac{f}{N}$$
A point at distance $S_2$ when the lens of focal length $f$ and f-number $N$ is focused at $S_1$ images not as a point but as a blur disc of diameter $c$ on the sensor. DOF effects compute $c$ per pixel from the depth buffer and blur by that amount (bokeh).
:::

:::calc How blurry is the background?
A 50 mm lens at f/1.8 ($A = 27.8$ mm), focused on a face at $S_1 = 2$ m; the wall behind is at $S_2 = 4$ m.
$c = \frac{0.0278\times0.05\times2}{4\times1.95} = 0.000356$ m $= 0.36$ mm on a 36 mm-wide sensor. Rendered 1920 px wide, that is $0.356/36\times1920 \approx 19$ px of blur diameter. Stopping down to f/8 shrinks it to about 4 px.
:::

### Outlines and edge detection

Selection outlines are drawn by (a) rendering the selected objects' mask or depth, then (b) running an edge detector such as the **Sobel** operator, which convolves the image with two 3×3 kernels to find horizontal and vertical gradients:
$$G_x = \begin{pmatrix}-1&0&1\\-2&0&2\\-1&0&1\end{pmatrix},\quad G_y = G_x^T,\quad \lVert G\rVert = \sqrt{G_x^2 + G_y^2}$$
Applying Sobel to depth and normals of the whole scene gives a hand-drawn "ink" look. drei's `<Outlines>` takes a different route: the inverted hull (a slightly enlarged back-face copy of the mesh).

### Colour grading and finishing touches

- **LUT colour grading**: a 3D lookup texture (exported from Photoshop, DaVinci Resolve) maps every input colour to a graded colour in one texture fetch (`LUTPass`, `lut3D` node, `<LUT>` in R3F).
- **Vignette**, **film grain**, **chromatic aberration**, **lens flares**: cheap single-pass effects; apply after tone mapping where they are meant to look photographic.
- **Motion blur**: blur along the per-pixel velocity buffer.
- **SSR** (screen-space reflections): march the reflected ray through the depth buffer; misses anything off-screen.

:::keypoints
- Render targets: `setRenderTarget(rt)` → render → `setRenderTarget(null)`; never sample the target you write; ping-pong instead.
- MRT writes several buffers in one pass (G-buffer, velocity, normals).
- WebGL: `EffectComposer` + `RenderPass` + effects + `OutputPass`; R3F: `@react-three/postprocessing` merges effects; WebGPU: `RenderPipeline` + `pass()` + TSL effect nodes.
- Each full-screen pass costs bandwidth: merge passes, use half resolution for blurry effects.
- Blur is separable ($2N$ vs $N^2$ samples); bloom = bright pass + mip-chain blur + add.
- AO: hemisphere samples (SSAO) or horizon search (GTAO), then denoise.
- AA: MSAA for edges, FXAA/SMAA post, TAA for the best stability (watch ghosting).
- DOF blur diameter from the circle of confusion $c = Af|S_2-S_1|/(S_2(S_1-f))$.
:::

:::build Neon city post-processing chain
Problem: Make a night city with emissive signs that bloom, ambient occlusion in the streets and an anti-aliased final image.
Requirements:
- HDR pipeline: half-float targets, tone mapping once at the end.
- Only emissive signs bloom (threshold above 1.0).
- Show the frame time with each effect on and off.
Constraints: at most three full-screen passes; bloom at reduced resolution.
Hints: emissive intensity above 1 with a luminance threshold of 1; finish with `OutputPass` (WebGL) or rely on `RenderPipeline` (WebGPU).
Relevant APIs: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `GTAOPass`, `SMAAPass`, `OutputPass`; or `RenderPipeline`, `pass()`, `bloom()`.
Expected result: glowing signs, grounded buildings and crisp edges, with a measured cost for every pass.
:::

## Interview questions

:::qa How would you make only neon signs glow, not the whole scene? {level=mid}
Render in HDR (half-float targets, tone mapping at the end) and make the neon materials emissive with intensity well above 1, then set the bloom threshold around 1. Only pixels brighter than white pass the bright filter, so ordinary white surfaces do not bloom. Alternatives: selective bloom with layers or `<SelectiveBloom>`, rendering the glowing objects into a separate mask, at the cost of extra passes.
:::

:::qa Why does adding EffectComposer make my edges jagged, and how do you fix it? {level=mid}
`antialias: true` on the renderer only applies MSAA to the default framebuffer, but with post-processing the scene is drawn into an off-screen target that has no multisampling by default. Fix it by giving the composer's render target `samples: 4` (or `multisampling` on the R3F `EffectComposer`), or by adding an SMAA/FXAA pass at the end, or TAA for the best quality.
:::

:::qa Explain how a Gaussian blur is made cheap. {level=mid}
The 2D Gaussian kernel is separable into the product of two 1D kernels, so a blur is done as a horizontal pass followed by a vertical pass: $2N$ samples per pixel instead of $N^2$. Further savings: use bilinear filtering to fetch two weighted texels per sample, blur at half or quarter resolution (blurry results do not need full resolution), and for very wide blurs use a mip chain (as in bloom) or a dual-filter downsample/upsample.
:::

:::qa What is TAA and what are its trade-offs? {level=senior}
Temporal anti-aliasing jitters the projection by a different subpixel offset every frame and accumulates samples over time, reprojecting the history with motion vectors so moving objects stay aligned. It produces very smooth, stable edges and also denoises stochastic effects (AO, SSR, dithered transparency). Its costs are a velocity buffer, a history buffer, and artefacts: ghosting on disoccluded areas or fast motion (reduced with neighbourhood colour clamping), and a slightly soft image (often countered with sharpening). It also requires every effect to provide correct motion vectors, including skinned and shader-animated objects.
:::

:::qa How does SSAO work, and why is it noisy? {level=senior}
For each pixel it reconstructs the view-space position and normal from the depth (and normal) buffer, then tests a small number of sample points in a hemisphere oriented around the normal: each sample is projected to the screen and compared with the depth buffer; samples behind the stored depth (within a range check) count as occluded. AO is one minus the occluded fraction. With only 8–32 samples per pixel the estimate is noisy, so implementations randomise sample rotations per pixel and then blur or denoise (depth-aware), or accumulate over time with TAA.
:::
