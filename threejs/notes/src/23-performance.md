---
title: Performance and Optimisation
part: Production, Advanced Rendering and WebXR
summary: A method, not a list of tricks. Measure first, find whether the CPU or GPU limits you, then apply the right fix: draw-call reduction (instancing, BatchedMesh, merging), culling and LOD with the screen-size maths, fill-rate and overdraw, shader and post-processing cost, memory budgets, dynamic resolution, workers and OffscreenCanvas, and mobile realities.
difficulty: Advanced
prereqs: Chapters 2, 7 and 21
time: 75–90 minutes
outcome: Diagnose whether a frame is CPU- or GPU-bound, apply the fix that matches, and reason through realistic before-and-after optimisations.
---

## Measure first {intermediate}

:::def CPU-bound and GPU-bound
A frame is **CPU-bound** when JavaScript (scene updates, physics, draw-call submission) takes longer than the GPU's work; it is **GPU-bound** when the GPU (vertex and fragment work, bandwidth) is the slower side. Fixes for one do nothing for the other, so diagnose before optimising.
:::

| Experiment | If the frame time drops a lot… |
|---|---|
| Shrink the canvas or set `setPixelRatio(0.5)` | You are **fragment / fill-rate bound** (GPU) |
| Hide all post-processing | Post-processing passes are the cost (GPU bandwidth) |
| Replace all materials with `MeshBasicMaterial` | Shading / lighting cost (GPU) |
| Disable shadows | Shadow passes (GPU, plus CPU for the extra draw calls) |
| Hide half the objects (keep resolution) | Draw calls or vertex count (CPU or vertex-bound GPU) |
| Pause physics / animation logic | JavaScript simulation (CPU) |

| Tool | Shows |
|---|---|
| `renderer.info` | Draw calls (`render.calls`, or `render.drawCalls` on WebGPU), triangles, geometries, textures, programs |
| stats-gl, r3f-perf | FPS, CPU time, **GPU time** (timer queries), draw calls |
| Chrome Performance panel | JavaScript, garbage collection, layout, GPU tasks on a timeline |
| Spector.js | Every WebGL call in a frame, state, textures, shaders |
| WebGPU timestamp queries, three.js Inspector addon | Per-pass GPU timings on `WebGPURenderer` |
| Safari Web Inspector (connected iPhone/iPad) | Real mobile timings and memory |

## Budgets

These are rules of thumb for a smooth experience on typical hardware; measure on your own targets.

| Resource | Mid-range phone | Laptop (integrated GPU) | Desktop (discrete GPU) |
|---|---|---|---|
| Draw calls per frame | 100–200 | 300–1,000 | 1,000–5,000+ |
| Triangles on screen | 100k–500k | 1–3 M | 5–20 M |
| Texture VRAM | 100–300 MB | 500 MB–1 GB | Several GB |
| Pixels shaded (canvas × DPR²) | ≈ 1–2 M | ≈ 4–8 M | ≈ 8–16 M |
| Full-screen post passes | 1–2 | 3–5 | 5–10 |

## Reducing draw calls (CPU)

Each mesh with each material is at least one draw call; shadows add one per caster per shadow map; multi-material meshes add one per material group.

| Technique | Draw calls | Constraints |
|---|---|---|
| Share materials and geometries | Fewer state changes, programs | Needed for everything below |
| Merge static geometry (`mergeGeometries`) | 1 per merged group | Static; culled as a whole |
| `InstancedMesh` | 1 per geometry+material | Same geometry; per-instance matrix, colour (and custom attributes) |
| `BatchedMesh` | 1 multi-draw | Different geometries, one material; per-instance matrix, colour, visibility, opacity (r183) |
| Texture atlases / array textures | Lets different-looking objects share a material | UV remapping or a layer index per instance |
| Fewer shadow casters | Fewer shadow-pass draws | `castShadow` only where it shows |

```js title="three.js — BatchedMesh: different shapes, one draw call"
const batch = new THREE.BatchedMesh(1000, 200_000, 400_000, material);   // max instances, vertices, indices
const rockA = batch.addGeometry(rockGeoA);       // register each geometry once
const rockB = batch.addGeometry(rockGeoB);
const m = new THREE.Matrix4();
for (let i = 0; i < 1000; i++) {
  const id = batch.addInstance(i % 2 ? rockA : rockB);
  batch.setMatrixAt(id, m.compose(randomPos(), randomQuat(), randomScale()));
  batch.setColorAt(id, new THREE.Color().setHSL(0.08, 0.3, 0.3 + Math.random() * 0.2));
}
scene.add(batch);   // per-instance frustum culling and optional sorting happen inside
```

:::tip Keep matrices static when you can
For static objects set `matrixAutoUpdate = false` and call `updateMatrix()` once; for a whole static subtree, also set `matrixWorldAutoUpdate = false` on the root and update manually after edits. In a scene of 20,000 objects, recomputing every matrix each frame is pure waste.
:::

## Culling and level of detail

| Culling | What it skips | In three.js |
|---|---|---|
| Frustum culling | Objects outside the view | Automatic (bounding spheres); per instance in `BatchedMesh` |
| Distance culling | Small or far objects | `camera.far`, layers, manual `visible = false` by distance |
| Occlusion culling | Objects hidden behind others | Not built in; portals/rooms for interiors, occlusion queries, or precomputed visibility |
| Back-face culling | Triangles facing away | `side: FrontSide` (default) |

:::def Level of detail (LOD)
Swapping a detailed mesh for simpler versions as it gets smaller on screen. `THREE.LOD` (`lod.addLevel(mesh, distance)`) and drei's `<Detailed distances={[0, 15, 40]}>` switch by camera distance; `SimplifyModifier` (meshoptimizer-based since r186, async) or `gltf-transform simplify` produce the levels; at the far end an **impostor** (a camera-facing quad with a pre-rendered image) can replace the model entirely.
:::

:::formula Screen-space size
An object with bounding radius $r$ at distance $d$ covers about
$$h_{\text{px}} \approx \frac{2r}{2d\tan(\text{fov}/2)}\cdot H_{\text{px}} = \frac{r\,H_{\text{px}}}{d\tan(\text{fov}/2)}$$
pixels of a canvas $H_{\text{px}}$ tall. Choose LOD distances so each level switches at a target on-screen size.
:::

:::calc Where to switch LOD levels
A tree with $r = 1$ m, FOV 50°, a 1080 px canvas: at 10 m it is $1080/(10\times0.466) = 232$ px tall; at 50 m, 46 px. To switch to the low-poly version when it is under 100 px: $d = 1080/(100\times0.466) = 23.2$ m. A 5,000-triangle tree that is 46 px tall has about one triangle per pixel, which is wasted work (and tiny triangles are inefficient for GPUs, which shade in 2 × 2 pixel quads).
:::

## Fill rate and overdraw (GPU)

:::def Overdraw
Shading the same pixel more than once in a frame because several surfaces cover it: transparent layers, particles, foliage cards, full-screen effects, and opaque objects drawn back to front. The cost is (pixels) × (average layers) × (fragment shader cost).
:::

:::calc Fragment shader invocations
1920 × 1080 at an average overdraw of 3 and 60 Hz: $2.07\text{M}\times3\times60 = 373$ million fragment-shader runs per second. Halve the overdraw or render at 0.75 resolution (0.56× the pixels) and you remove a large fraction of GPU time.
:::

| Fix | Effect |
|---|---|
| Cap DPR at 2 (or lower adaptively) | Pixel count scales with DPR² |
| Opaque objects front to back (three.js does) | Early-z rejects hidden fragments |
| Fewer, smaller transparent particles; additive without depth writes | Less blended overdraw |
| Tight geometry around alpha-tested foliage cards | Fewer discarded fragments |
| Half-resolution buffers for AO, bloom, volumetrics | ¼ of the fragment work for those passes |
| Simpler materials for distant or small objects | Cheaper per-pixel shading |
| Bake lighting and AO for static scenes | No real-time shadows or AO passes |

## Memory

| Item | Size rule | Example |
|---|---|---|
| Texture | $w\times h\times\text{bytes per texel}\times 4/3$ | 4K RGBA8: 85 MiB; 4K BC7: 21 MiB |
| Render target | $w\times h\times$ bytes $\times$ (MSAA samples) | 1440p half-float RGBA ×4 MSAA: 118 MB |
| Shadow map | $\text{size}^2\times4$ (× 6 for point lights) | 2048²: 16.8 MB |
| Geometry | vertices × bytes per vertex + indices | 1 M vertices × 32 B = 32 MB |

Free what you no longer render (`dispose()`, Chapter 7), compress textures (KTX2), quantise geometry, share resources, and stream large worlds in and out by tiles.

## Dynamic resolution and adaptive quality

:::formula Dynamic resolution scale
To bring a GPU-bound frame time $t_{\text{measured}}$ down to a target $t_{\text{target}}$, scale the pixel count by $t_{\text{target}}/t_{\text{measured}}$, i.e. scale the pixel ratio by
$$k = \sqrt{\frac{t_{\text{target}}}{t_{\text{measured}}}}$$
(assuming fragment work dominates and scales with pixels). Smooth the measurement over several frames and clamp the result.
:::

:::calc Recovering a slow frame
GPU time 22 ms, target 14 ms (leaving headroom under 16.7 ms): pixel scale $14/22 = 0.636$, so the ratio factor $k = \sqrt{0.636} = 0.80$. At DPR 2, render at $2\times0.80 = 1.6$. Upscaling with FSR 1 or TAAU (WebGPU nodes since r184) recovers much of the lost sharpness.
:::

```jsx title="R3F — adaptive quality"
import { PerformanceMonitor, AdaptiveDpr, AdaptiveEvents } from "@react-three/drei";

function App() {
  const [dpr, setDpr] = useState(1.5);
  return (
    <Canvas dpr={dpr} performance={{ min: 0.5 }}>       {/* regress() can drop to half quality briefly */}
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(2)} flipflops={3} onFallback={() => setDpr(1)} />
      <AdaptiveDpr pixelated />                         {/* lowers DPR while regressing (for example, during camera moves) */}
      <AdaptiveEvents />                                {/* skips raycasting while regressing */}
      <Scene />
    </Canvas>
  );
}
```

## Off the main thread

- **Web Workers** for physics, procedural generation, pathfinding, parsing (loaders already decode Draco/Basis in workers).
- **OffscreenCanvas**: transfer the canvas to a worker and run the whole three.js renderer there (`canvas.transferControlToOffscreen()`), leaving the main thread for the UI. Input events must be forwarded to the worker; R3F has `@react-three/offscreen` for this.
- **WASM** for heavy maths (Rapier, Jolt, meshoptimizer, Draco).
- **Compute shaders** for massively parallel work (Chapter 20).

## Mobile realities

:::warn Thermal throttling
Phones and thin laptops reduce GPU and CPU clocks after a minute or two of sustained load, so a scene that runs at 60 fps in a quick test can drop to 30 fps later. Test for five minutes, leave headroom (aim for 10–12 ms of work at 60 Hz), render on demand when nothing moves, pause when the tab is hidden, and lower quality on battery-saver signals where available.
:::

| Mobile-specific tip | Why |
|---|---|
| DPR ≤ 2, often 1.5 | Pixel count is the biggest GPU cost |
| Avoid real-time shadows from many lights; bake or use contact shadows | Shadow passes multiply draw calls |
| KTX2 textures, ≤ 2K | VRAM limits (iOS Safari kills tabs) |
| Fewer post passes; no SSR/SSGI | Bandwidth is limited on tile-based GPUs |
| Prefer `alphaTest` over blending | Tile-based GPUs pay heavily for overdraw and blending |
| Watch `highp` precision in heavy fragment shaders | Mobile GPUs may run `mediump` faster |

## Performance case studies

The eight cases below follow the method of this chapter: measure, find the bottleneck, apply the matching fix, measure again. The numbers are **illustrative**: realistic for the hardware described, internally consistent with the formulas in this book, but not benchmarks of a specific device. Your own numbers will differ; the reasoning will not.

:::case Too many draw calls in a warehouse twin {illustrative}
Before:
- Objects: 1,200 shelves and crates
- Draw calls: 1,340
- CPU frame time: 26 ms
- FPS: 38
Problem: Every crate is a separate `Mesh` with its own cloned material, and the sun casts shadows from all of them, so each frame issues more than a thousand draw calls.
Investigation: `renderer.info.render.calls` reads 1,340. Halving the canvas resolution changes nothing (so it is not fragment-bound); the Performance panel shows the time inside `renderer.render` on the main thread: CPU-bound.
Fix: Share one material per crate type, convert the 6 crate types to `InstancedMesh` and the varied shelving to one `BatchedMesh`, and stop small crates casting shadows.
After:
- Objects: 1,200 (unchanged)
- Draw calls: 46
- CPU frame time: 7 ms
- FPS: 60 (display limit)
Why it worked: draw calls have a fixed CPU cost regardless of triangle count; instancing and batching replace thousands of calls with a handful, and the GPU work was never the problem.
:::

:::case A 3× phone rendering 2.2× too many pixels {illustrative}
Before:
- Device pixel ratio: 3
- Pixels shaded: 2.96 M
- GPU frame time: 28 ms
- FPS: 34
Problem: A product viewer uses `setPixelRatio(devicePixelRatio)`, so a 390 × 844 CSS canvas renders 1170 × 2532 pixels with an expensive physical material and transmission.
Investigation: draw calls are low (35), but rendering at half resolution doubles the frame rate: fragment-bound.
Fix: `setPixelRatio(Math.min(devicePixelRatio, 2))`, plus `PerformanceMonitor` lowering it to 1.5 when frames slow down.
After:
- Device pixel ratio: 2 (1.5 under load)
- Pixels shaded: 1.32 M
- GPU frame time: 13 ms
- FPS: 60
Why it worked: fragment cost scales with pixel count, which scales with DPR²; going from 3 to 2 removes 56% of the pixels, and almost nobody can see the difference on a phone.
:::

:::case A forest with 18 million triangles {illustrative}
Before:
- Trees: 6,000 (instanced)
- Triangles: 18 M
- GPU frame time: 22 ms
- FPS: 45
Problem: Every tree, near or far, uses the 3,000-triangle hero model. Distant trees are a few pixels tall but cost the same vertex work.
Investigation: one draw call, low resolution makes little difference, but halving the tree count halves the GPU time: vertex-bound.
Fix: Three LODs (3,000 / 600 / 80 triangles) switched by on-screen size, and an impostor card beyond 120 m; one `InstancedMesh` per level.
After:
- Trees: 6,000 (unchanged)
- Triangles: 2.1 M
- GPU frame time: 9 ms
- FPS: 60
Why it worked: work now scales with what is visible on screen. A tree 40 px tall with 3,000 triangles has more triangles than pixels.
:::

:::case Textures that crash the iPhone tab {illustrative}
Before:
- Textures: 12 × 4K PNG
- Texture VRAM: 1,024 MiB
- iPhone result: tab reloads after loading
Problem: Four materials each with base colour, normal and ORM maps at 4096², decoded to RGBA8 with mipmaps.
Investigation: download size is only 30 MB, but VRAM is $12\times4096^2\times4\times\frac43 = 1024$ MiB; Safari's Web Inspector shows memory pressure, then the reload.
Fix: Resize to 2048 (the model never fills more than half a phone screen), convert to KTX2 (UASTC for normals, ETC1S for colour), pack occlusion, roughness and metalness into one map.
After:
- Textures: 12 × 2K KTX2
- Texture VRAM: about 64 MiB
- iPhone result: stable
Why it worked: GPU memory depends on decoded size, not file size; GPU-compressed textures stay compressed in VRAM (about 1 byte per texel instead of 4).
:::

:::case React re-rendering the scene every frame {illustrative}
Before:
- Animated components: 300
- React renders per second: 36,000
- Main-thread scripting per frame: 14 ms
- FPS: 50
Problem: Each animated item stores its position in `useState` and updates it from `useFrame`.
Investigation: the React Profiler shows renders on every frame; the three.js side (`renderer.info`) looks fine.
Fix: Keep positions in refs (or typed arrays) and mutate `ref.current.position` in `useFrame`; keep React state for rare changes such as selection.
After:
- Animated components: 300 (unchanged)
- React renders per second: about 0 while animating
- Main-thread scripting per frame: 2 ms
- FPS: 60
Why it worked: three.js renders every frame anyway; routing per-frame values through React adds reconciliation work that produces nothing new.
:::

:::case Post-processing on an integrated GPU {illustrative}
Before:
- Canvas: 2560 × 1440
- Full-screen passes: 7
- GPU frame time: 21 ms
- FPS: 47
Problem: Separate passes for render, SSAO, bloom, depth of field, vignette, colour grading and FXAA, all at full resolution in half-float.
Investigation: disabling post-processing drops GPU time to 8 ms; each pass moves about 59 MB per frame at this resolution.
Fix: Merge vignette, grading and anti-aliasing into one pass (pmndrs postprocessing merges them), run AO and bloom at half resolution, drop depth of field except in the product close-up.
After:
- Canvas: 2560 × 1440
- Full-screen passes: 3
- GPU frame time: 10 ms
- FPS: 60
Why it worked: full-screen effects are bandwidth-bound; fewer passes and quarter-size buffers for blurry effects remove most of the memory traffic.
:::

:::case Garbage-collection hitches {illustrative}
Before:
- Allocations: about 9,000 objects per second
- Long frames (over 50 ms): 25 per minute
- Average FPS: 59
Problem: The average looks fine, but the scene stutters every few seconds. Helper code creates `new Vector3()` and `new Matrix4()` inside the frame loop.
Investigation: the Performance panel shows periodic "Minor GC" blocks of 30–60 ms lining up with the stutters.
Fix: Allocate temporaries once at module scope and reuse them with `.set()`/`.copy()`; avoid array `map`/`filter` in hot loops.
After:
- Allocations: near 0 per frame
- Long frames (over 50 ms): 0 per minute
- Average FPS: 60
Why it worked: users notice the worst frames, not the average; removing per-frame allocations removes the collector pauses that cause them.
:::

:::case Slow first load of a configurator {illustrative}
Before:
- Model download: 38 MB
- Time to first frame (4G): 19 s
- Shader-compile hitch on first colour change: 180 ms
Problem: An uncompressed glTF with 4K PNG textures, loaded after the JavaScript bundle; material variants created when the user first clicks them.
Investigation: the Network panel shows the model dominating; the Performance panel shows a long "compile" task on the first option change.
Fix: `gltf-transform optimize` with Meshopt and KTX2, preload the model in parallel with the bundle, show a poster image immediately, and create and `compileAsync()` all material variants during loading.
After:
- Model download: 3.6 MB
- Time to first frame (4G): 3 s
- Shader-compile hitch on first colour change: none
Why it worked: the asset was the critical path; compression and preloading shorten it, and pre-compiling moves the one-off GPU cost to a moment the user does not notice.
:::

:::lens Performance work
Junior: Tries tips from a list until the frame rate improves.
Mid-level: Measures first, separates CPU-bound from GPU-bound, and applies the matching fix (draw calls, DPR, LOD, shaders).
Senior: Sets budgets per device class (draw calls, triangles, VRAM, frame time), builds adaptive quality into the architecture, tracks performance in CI and from real users, and designs content and features so the budget is respected by default rather than repaired later.
:::

:::keypoints
- Diagnose first: shrink resolution (fragment-bound?), hide objects (draw calls?), pause logic (CPU?).
- Draw calls: share materials, merge static meshes, instance repeats, batch varied shapes with `BatchedMesh`.
- Static matrices: `matrixAutoUpdate = false`; cull with frustum, distance and portals; LOD by on-screen size $rH/(d\tan(\text{fov}/2))$.
- Fragment cost = pixels × overdraw × shader cost: cap DPR, reduce transparency, half-resolution effects, bake.
- Memory: compress, share, dispose, stream.
- Adaptive quality: DPR scale $\sqrt{t_{\text{target}}/t}$, `PerformanceMonitor`, `AdaptiveDpr`, upscalers.
- Workers, OffscreenCanvas, WASM and compute shaders move work off the main thread.
- Test on real phones for minutes, not seconds.
:::

## Interview questions

:::qa A scene runs at 60 fps on desktop and 25 fps on a mid-range phone. How do you diagnose it? {level=mid}
Measure on the phone (remote debugging), then isolate. Reduce the pixel ratio or canvas size: if FPS jumps, it is fragment/fill-rate bound, so cap DPR, cut post-processing and overdraw, simplify shaders, bake lighting. If not, check `renderer.info.render.calls` and CPU time in the profiler: too many draw calls means instancing, batching, merging and fewer shadow casters; heavy JavaScript means moving physics or logic to workers and avoiding per-frame allocations. Also check texture memory (KTX2, smaller sizes) and thermal throttling over a few minutes.
:::

:::qa When would you use InstancedMesh versus BatchedMesh versus merging? {level=mid}
`InstancedMesh` when many objects share exactly one geometry and material but need individual transforms or colours (trees, bolts, crowds, particles). `BatchedMesh` when objects have different geometries but share a material and still need individual transforms, visibility or per-instance culling (varied props, CAD assemblies, city buildings). Merging when objects are static and never need to move or be culled individually; it is the simplest and gives one draw call, at the cost of flexibility.
:::

:::qa How do you implement level of detail, and how do you choose switch distances? {level=mid}
Create simplified versions of the mesh (meshoptimizer via `gltf-transform simplify`, `SimplifyModifier`, or artist-made), add them to `THREE.LOD` (or drei's `<Detailed>`) with distances, and let three.js pick the level per frame. Choose distances from the target on-screen size: the projected height is about $rH/(d\tan(\text{fov}/2))$ pixels, so switch when the object falls below, for example, 100–200 pixels for the mid level, and use an impostor or nothing below a few dozen pixels. Hide pops with a small hysteresis or dithered cross-fade.
:::

:::qa What is overdraw and how do you reduce it? {level=mid}
Shading a pixel multiple times per frame because several surfaces overlap: transparent layers, particles, foliage, full-screen effects, unsorted opaque geometry. Each extra layer costs a full fragment-shader run. Reduce it by keeping opaque objects sorted front to back (three.js does), using fewer and smaller transparent particles, preferring alpha-tested cut-outs, trimming card geometry to the visible shape, merging post-processing passes and running blurry effects at lower resolution, and capping the pixel ratio.
:::

:::qa How would you keep a heavy 3D page responsive while it loads? {level=senior}
Split the bundle (lazy-load the 3D experience), show HTML content and a lightweight poster immediately, stream optimised assets (Meshopt/KTX2, smallest first), decode in workers, preload the next assets, pre-compile shaders and pre-upload textures before revealing the scene (`renderer.compileAsync`, drei `<Preload all />`), avoid long synchronous tasks by chunking work, and consider OffscreenCanvas so rendering never blocks input. Measure with Lighthouse and real-user metrics (Interaction to Next Paint, long tasks).
:::
