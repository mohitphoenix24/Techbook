---
title: The GPU Rendering Pipeline
summary: How triangles become pixels. The stages of the graphics pipeline, rasterisation and barycentric interpolation, the depth buffer, blending maths, draw calls, and what three.js does inside renderer.render() every frame.
difficulty: Foundation
prereqs: Chapter 1
time: 60–75 minutes
outcome: Trace a vertex from a buffer to a pixel, compute barycentric weights and blend results by hand, and explain why draw calls, overdraw and transparency cost what they cost.
---

## CPU and GPU: two processors, two jobs

A computer that renders 3D has two very different processors working together.

| | CPU | GPU |
|---|---|---|
| Cores | A few (4–16) very fast, clever cores | Thousands of simple cores |
| Good at | Branching logic, game rules, JavaScript | The same small program on millions of items at once |
| In a three.js app | Your code, scene-graph updates, culling, sorting, issuing commands | Transforming vertices, shading pixels, blending |
| Talks via | A command buffer (WebGL calls / WebGPU command encoders) | Reads buffers and textures in its own memory (VRAM) |

:::def Shader
A small program that runs **on the GPU**, once per item, massively in parallel. A **vertex shader** runs once per vertex; a **fragment shader** (pixel shader) runs once per fragment (a candidate pixel). WebGL shaders are written in GLSL, WebGPU shaders in WGSL; three.js can generate both from its node system (TSL).
:::

:::def Draw call
One command from the CPU telling the GPU "draw this geometry with this shader and these settings". In three.js, each visible `Mesh` normally costs at least one draw call (more with multi-materials, shadows or multiple passes). Draw calls have a fixed CPU cost, so their **count** is often the first performance limit.
:::

:::intuition A kitchen
The CPU is the head chef reading orders and shouting instructions. The GPU is a kitchen with a thousand cooks who can only do simple steps, but all at once. Shouting one instruction ("chop all these 10,000 onions") is fast. Shouting 10,000 separate instructions ("chop this onion", "chop this onion"…) wears the chef out long before the cooks are busy. That is why draw calls matter more than triangle counts in many scenes.
:::

@fig(cpu_gpu_drawcalls) The same 1,000 objects submitted as separate meshes and as one instanced mesh. The GPU work is similar; the CPU work, and the GPU idle time waiting for it, is not.


## The stages of the pipeline

Every draw call flows through the same fixed sequence. Some stages are **programmable** (you write the shader), the rest are **fixed-function** hardware that you only configure.

@fig(pipeline) The real-time graphics pipeline. Programmable stages are highlighted; the others are fixed hardware configured by render state (culling, depth test, blending).

1. **Input assembly.** The GPU reads vertex attributes (position, normal, uv, …) from buffers, and the **index buffer** that says which vertices form each triangle.
2. **Vertex shader** (programmable). Runs once per vertex. Its main job is to output the vertex's **clip-space position** (`gl_Position`), usually $P\,V\,M\,\mathbf{p}$, and any **varyings** (values to be interpolated across the triangle, such as normals and UVs).
3. **Primitive assembly.** Groups transformed vertices into triangles (or lines, points).
4. **Clipping.** Discards triangles fully outside the view volume and cuts the ones that cross its edges, in clip space, so nothing behind the camera is drawn.
5. **Perspective divide.** Divides $x, y, z$ by $w$, giving **normalised device coordinates** (NDC).
6. **Viewport transform.** Maps NDC to pixel coordinates in the framebuffer.
7. **Face culling.** Drops triangles facing away from the camera (`material.side = THREE.FrontSide` is the default) using the winding order: counter-clockwise on screen counts as front-facing.
8. **Rasterisation.** Works out which pixel centres each triangle covers, creating a **fragment** for each, and interpolates the varyings for it.
9. **Fragment shader** (programmable). Runs once per fragment and outputs a colour (lighting, textures, fog).
10. **Per-fragment tests.** Scissor, stencil and **depth** tests decide whether the fragment survives.
11. **Blending.** Combines the fragment's colour with what is already in the framebuffer (for transparency).
12. **Output.** The colour lands in the **framebuffer** (the canvas, or an offscreen render target).

:::def Fragment
A candidate pixel produced by rasterising a triangle: it has a screen position, a depth, and interpolated varyings. It only becomes a visible pixel if it passes the depth and stencil tests and survives blending. Several fragments can compete for the same pixel; that waste is called **overdraw**.
:::

:::tip Early-z
GPUs try to run the depth test **before** the fragment shader ("early-z"), so hidden fragments are rejected cheaply. Writing `gl_FragDepth`, using `discard` or alpha testing can disable it. This is why three.js draws opaque objects **front to back**: near objects fill the depth buffer first and the far ones behind them are rejected before shading.
:::

## Rasterisation and barycentric coordinates {intermediate}

To fill a triangle, the GPU must know, for each pixel centre $\mathbf{p}$, whether it is inside and how much each of the three vertices contributes to it. Both answers come from **barycentric coordinates**.

:::def Barycentric coordinates
For a triangle $A, B, C$, any point $\mathbf{p}$ in its plane can be written $\mathbf{p} = \lambda_A A + \lambda_B B + \lambda_C C$ with $\lambda_A + \lambda_B + \lambda_C = 1$. The point is **inside** the triangle exactly when all three $\lambda$ are between 0 and 1. Each $\lambda$ is the area of the sub-triangle opposite its vertex divided by the whole triangle's area.
:::

@fig(barycentric) Barycentric weights are area ratios. The weight of A is the area of the triangle PBC (opposite A) divided by the area of ABC. A varying such as colour is blended with these weights.

:::formula Edge function and barycentrics
$$E_{AB}(\mathbf{p}) = (B_x - A_x)(p_y - A_y) - (B_y - A_y)(p_x - A_x)$$
$E_{AB}$ is twice the signed area of triangle $A B \mathbf{p}$: positive on one side of edge $AB$, negative on the other, zero on it. With $\text{Area} = E_{AB}(C)$:
$$\lambda_A = \frac{E_{BC}(\mathbf{p})}{\text{Area}},\quad \lambda_B = \frac{E_{CA}(\mathbf{p})}{\text{Area}},\quad \lambda_C = \frac{E_{AB}(\mathbf{p})}{\text{Area}}$$
:::

:::calc Is the pixel inside, and what colour is it?
Triangle $A=(0,0)$ red, $B=(4,0)$ green, $C=(0,4)$ blue. Pixel centre $\mathbf{p}=(1,1)$.

1. $\text{Area} = E_{AB}(C) = (4-0)(4-0) - (0-0)(0-0) = 16$.
2. $E_{BC}(\mathbf{p}) = (0-4)(1-0) - (4-0)(1-4) = -4 + 12 = 8$, so $\lambda_A = 8/16 = 0.5$.
3. $E_{CA}(\mathbf{p}) = (0-0)(1-4) - (0-4)(1-0) = 0 + 4 = 4$, so $\lambda_B = 4/16 = 0.25$.
4. $E_{AB}(\mathbf{p}) = (4-0)(1-0) - (0-0)(1-0) = 4$, so $\lambda_C = 0.25$.
5. All three are in $[0,1]$ and sum to 1: the pixel is **inside**.
6. Interpolated colour $= 0.5\,(1,0,0) + 0.25\,(0,1,0) + 0.25\,(0,0,1) = (0.5, 0.25, 0.25)$, a muted red.
:::

### Perspective-correct interpolation

Interpolating linearly in **screen** space is wrong for 3D triangles: a texture on a floor would bend. The fix is to interpolate $a/w$ and $1/w$ linearly (they are linear in screen space) and divide.

:::formula Perspective-correct varying
$$a(\mathbf{p}) = \frac{\lambda_A \dfrac{a_A}{w_A} + \lambda_B \dfrac{a_B}{w_B} + \lambda_C \dfrac{a_C}{w_C}}{\lambda_A \dfrac{1}{w_A} + \lambda_B \dfrac{1}{w_B} + \lambda_C \dfrac{1}{w_C}}$$
$a$ is any varying (UV, normal, colour), $w$ the clip-space $w$ of each vertex (its distance in front of the camera) and $\lambda$ the screen-space barycentrics. GPUs do this for every varying automatically; GLSL's `flat` and `noperspective` qualifiers turn it off.
:::

:::calc Why the correction matters
A line from a near vertex ($w=1$, $u=0$) to a far vertex ($w=3$, $u=1$). At the screen-space midpoint ($\lambda = 0.5$ each), plain interpolation gives $u = 0.5$. Perspective-correct: numerator $0.5\cdot 0/1 + 0.5 \cdot 1/3 = 0.1667$, denominator $0.5 \cdot 1 + 0.5 \cdot 1/3 = 0.6667$, so $u = 0.25$. The screen midpoint is much closer to the near vertex in 3D, so it really is only a quarter of the way along the texture.
:::

## The depth buffer

:::def Depth buffer (z-buffer)
A per-pixel image that stores the depth of the nearest fragment drawn so far. When a new fragment arrives, the **depth test** compares its depth with the stored one; by default (`LessEqualDepth`) it passes only if it is nearer, and then it writes its own depth (if `depthWrite` is true). This solves visibility without sorting triangles.
:::

@fig(zbuffer) The z-buffer algorithm. Whichever triangle is drawn first, each pixel keeps the nearest fragment. Where two surfaces have almost equal depth, rounding makes them flicker against each other (z-fighting).

:::warn Z-fighting
When two surfaces are almost coplanar (a decal on a wall, two overlapping planes), their depths round to the same stored value and the winner changes pixel by pixel and frame by frame. Fixes, in order of preference: separate the surfaces a little; push the near plane **out** (`camera.near` of 0.1, not 0.0001, because precision depends mostly on near); use `material.polygonOffset`; or use a reversed or logarithmic depth buffer (Chapter 6).
:::

### Transparency and sorting

The depth buffer only works for opaque surfaces. A transparent surface must show what is behind it, so what is behind must be drawn **first**. three.js therefore renders in two lists:

1. **Opaque** objects, sorted **front to back** (to make early-z reject hidden work).
2. **Transparent** objects (`material.transparent = true`), sorted **back to front** by the distance of each object's centre to the camera, drawn with blending and usually `depthWrite: false`.

Sorting is per **object**, not per triangle, so intersecting transparent objects, or a single concave transparent mesh, can still draw in the wrong order. Workarounds: split meshes, set `renderOrder`, use `alphaTest` or `alphaHash` for cut-outs, or use order-independent transparency (Chapter 24).

## Blending maths

:::formula The blend equation
$$C_{\text{out}} = C_{\text{src}} \cdot F_{\text{src}} \;\oplus\; C_{\text{dst}} \cdot F_{\text{dst}}$$
$C_{\text{src}}$ is the incoming fragment colour, $C_{\text{dst}}$ the colour already in the framebuffer, $F$ the blend factors and $\oplus$ the blend operation (usually add).
:::

| Mode | Factors | Result | three.js |
|---|---|---|---|
| Normal (straight alpha) | $F_s = \alpha_s,\ F_d = 1-\alpha_s$ | $\alpha_s C_s + (1-\alpha_s) C_d$ | `NormalBlending` |
| Premultiplied alpha | $F_s = 1,\ F_d = 1-\alpha_s$ | $C_s' + (1-\alpha_s) C_d$ where $C_s' = \alpha_s C_s$ | `premultipliedAlpha: true` |
| Additive | $F_s = \alpha_s$ (or 1), $F_d = 1$ | $C_s + C_d$ (only brightens) | `AdditiveBlending` |
| Multiply | $F_s = C_d,\ F_d = 0$ | $C_s \cdot C_d$ (only darkens) | `MultiplyBlending` |

:::calc Two panes of glass
Background $C_d = (0.2, 0.2, 0.2)$. A red pane $C=(1,0,0)$ with $\alpha = 0.5$ is drawn, then a blue pane $C=(0,0,1)$ with $\alpha=0.4$ in front of it.

1. After red: $0.5(1,0,0) + 0.5(0.2,0.2,0.2) = (0.6, 0.1, 0.1)$.
2. After blue: $0.4(0,0,1) + 0.6(0.6,0.1,0.1) = (0.36, 0.06, 0.46)$.

Draw blue first and red second and you get $0.5(1,0,0) + 0.5(0.12, 0.12, 0.52) = (0.56, 0.06, 0.26)$ instead: blending is **not commutative**, which is exactly why transparent objects must be sorted.
:::

:::intuition Why premultiplied alpha is preferred
Filtering (mipmaps, bilinear sampling) averages neighbouring texels. With straight alpha, a fully transparent texel's meaningless colour (often black) bleeds into the edge, creating dark halos. Premultiplied colours are already weighted by alpha, so a transparent texel is $(0,0,0,0)$ and averages correctly. Compositing also becomes associative, which matters for layered effects.
:::

## What renderer.render() actually does

Knowing the steps inside `renderer.render(scene, camera)` explains most performance advice.

1. **Update matrices.** If `scene.matrixWorldAutoUpdate` is true, walk the tree and recompute each object's `matrixWorld` from its position, quaternion and scale (and the parent's matrix).
2. **Update the camera.** Compute the view matrix (`camera.matrixWorldInverse`) and the combined view-projection.
3. **Frustum culling.** For each object with `frustumCulled = true`, test its **bounding sphere** against the six frustum planes; skip objects fully outside.
4. **Build render lists.** Split visible objects into opaque, transmissive and transparent lists; sort opaque front to back (grouped by program and material to reduce state changes) and transparent back to front.
5. **Shadows.** For each shadow-casting light, render the scene's depth from the light into its shadow map.
6. **Programs.** For each material, find or compile the shader program for its current settings. A new combination of features (fog, number of lights, textures used, skinning) means a new program to compile, which causes a hitch the first time.
7. **Draw.** For each object: bind the program, upload changed uniforms, bind buffers and textures, set state (blending, depth, culling) and issue the draw call.

:::tip Read the numbers
`renderer.info.render.calls`, `.triangles`, `.points`, `.lines` and `renderer.info.memory.geometries` / `.textures` / `renderer.info.programs.length` tell you what the last frame cost. For `WebGPURenderer` the draw-call count is `renderer.info.render.drawCalls`. Watch them while you optimise.
:::

## WebGL and WebGPU {intermediate}

:::def WebGL 2
A JavaScript binding of OpenGL ES 3.0, available in every browser since around 2021. It is a **global state machine**: you bind things, set states, then draw. Shaders are GLSL ES 3.0. No compute shaders.
:::

:::def WebGPU
The modern web graphics and compute API, modelled on Vulkan, Metal and Direct3D 12. State is baked into immutable **pipeline** objects, commands are recorded into **command encoders** and submitted in batches, and **compute shaders** run general GPU programs. Shaders are WGSL. Enabled by default in Chrome and Edge (113+), Safari 26 and Firefox on Windows and Apple Silicon.
:::

| | WebGL 2 | WebGPU |
|---|---|---|
| Model | Global state machine | Explicit pipelines, bind groups, command encoders |
| Shader language | GLSL ES 3.0 | WGSL |
| Compute shaders | No (tricks with render targets) | Yes |
| CPU overhead per draw | Higher (validation per call) | Lower (validation at pipeline creation) |
| NDC depth range | −1 to 1 | 0 to 1 |
| three.js renderer | `WebGLRenderer` (mature, recommended for pure WebGL) | `WebGPURenderer` (falls back to WebGL 2 automatically) |
| Custom shaders | `ShaderMaterial`, `onBeforeCompile` | Node materials and TSL only |

:::note Which renderer should I use?
`WebGLRenderer` is still maintained and the safe choice for an existing WebGL project, but new big features go into `WebGPURenderer`. New projects can start on `WebGPURenderer`: it uses WebGPU where available and falls back to WebGL 2 elsewhere, with one codebase. Profile both, since WebGPU is not faster for every scene.
:::

:::keypoints
- The pipeline: vertex shader → clip → divide by $w$ → viewport → rasterise → fragment shader → depth/stencil test → blend.
- Barycentric weights are area ratios; varyings are interpolated perspective-correctly via $1/w$.
- The depth buffer solves opaque visibility; transparent objects must be sorted back to front and usually do not write depth.
- Normal blending: $\alpha C_s + (1-\alpha) C_d$; order matters.
- Draw calls cost CPU time; overdraw and heavy fragment shaders cost GPU time.
- three.js per frame: update matrices → cull → sort → shadows → compile programs if needed → draw.
:::

## Interview questions

:::qa Walk me through what happens between a vertex in a buffer and a pixel on the screen. {level=mid}
The vertex shader transforms each vertex to clip space ($P V M \mathbf{p}$) and outputs varyings. Triangles are assembled, clipped against the view volume, divided by $w$ into NDC, and mapped to the viewport. Back faces are culled by winding order. The rasteriser finds covered pixel centres and creates fragments, interpolating varyings perspective-correctly. The fragment shader computes each fragment's colour. Depth and stencil tests discard hidden fragments (ideally before shading, early-z), blending combines the survivors with the framebuffer, and the result is shown at the next vsync.
:::

:::qa Why is a scene with 2,000 separate small meshes slow even though it has few triangles? {level=mid}
Each mesh is at least one draw call, and every draw call has a fixed CPU cost (binding programs, uploading uniforms, setting state, driver validation) independent of how small the mesh is. 2,000 calls can cost several milliseconds of CPU, while the GPU sits idle. Fixes: `InstancedMesh` for repeated geometry, `BatchedMesh` for different geometries sharing a material, merging static meshes with `BufferGeometryUtils.mergeGeometries`, and sharing materials. Measure with `renderer.info.render.calls`.
:::

:::qa Why do transparent objects sometimes disappear or draw in the wrong order? {level=mid}
The depth buffer cannot handle partial coverage, so three.js sorts transparent objects back to front by object centre and draws them after the opaque ones. Sorting per object fails for intersecting or concave transparent meshes, and if a transparent material writes depth it can hide objects drawn after it. Fixes: `depthWrite: false` on transparent materials, splitting meshes, `renderOrder`, using `alphaTest`/`alphaHash` for cut-out foliage, or order-independent transparency.
:::

:::qa What is z-fighting and how do you fix it? {level=junior}
Flickering where two surfaces have nearly the same depth, because the depth buffer's limited precision rounds them to the same value. Perspective depth precision is concentrated near the near plane, so the first fix is to increase `camera.near` (and reduce `far`). Others: offset the geometry slightly, `polygonOffset` on the decal material, or a logarithmic or reversed depth buffer (`reversedDepthBuffer: true` on `WebGLRenderer`, `WebGPURenderer` supports reversed depth since r183).
:::

:::qa What are barycentric coordinates used for in rendering? {level=senior}
They express a point inside a triangle as a weighted mix of its three vertices, with weights equal to sub-triangle area ratios. The rasteriser uses them (via edge functions) to test whether a pixel centre is inside a triangle and to interpolate varyings such as UVs, normals and colours, with a $1/w$ correction for perspective. They are also used in ray–triangle intersection (Möller–Trumbore returns barycentrics), in picking (three.js returns `intersection.barycoord` in recent versions) and in wireframe shaders that measure distance to edges.
:::

:::qa Compare WebGL and WebGPU. Would you move an existing project? {level=senior}
WebGL 2 is a global state machine with per-call validation and no compute. WebGPU uses pre-validated pipeline objects, bind groups and command encoders, which lowers CPU cost per draw, and adds compute shaders and storage buffers, enabling GPU particle simulation, culling and more. Its NDC depth range is 0–1. In three.js, moving means switching to `WebGPURenderer`, porting `ShaderMaterial`/`onBeforeCompile` code to node materials and TSL, and replacing `EffectComposer` with `RenderPipeline`. I would move when the project needs compute or is draw-call bound, after profiling, because WebGPU is not automatically faster for every scene.
:::
