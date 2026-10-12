---
title: Performance — Fast on Every Device
level: advanced
time: 40
summary: Measuring before optimising, frame budgets for phones, laptops and headsets, telling CPU-bound from GPU-bound, the optimisations that matter most (draw calls, pixels, geometry, textures, shadows), level of detail, adaptive resolution, avoiding memory leaks and shader-compile stutter, and a pre-launch checklist.
---

A 3D page that stutters feels broken, drains batteries, and in VR makes people sick. Most performance problems come from a short list of causes, and the fixes are well known. The skill is **measuring** to find which one you have, instead of guessing.

## Measure first

| Tool | Tells you |
|---|---|
| `renderer.info.render` | draw calls, triangles, points, lines in the last frame |
| `renderer.info.memory` | geometries and textures currently on the GPU (leak detector) |
| **stats.js / stats-gl** | FPS, frame time, GPU time (stats-gl) as a small overlay |
| Chrome DevTools → **Performance** | where CPU time goes: your code, three.js, garbage collection |
| **Spector.js** (extension) | every WebGL call in a frame: draw calls, shaders, textures, state changes |
| three.js **Inspector** (WebGPU) | frame and compute timings for `WebGPURenderer` |
| **r3f-perf** (R3F) | all of the above as a React component |
| Remote debugging (`chrome://inspect`) | the real numbers on a phone or a Quest headset |

:::def Frame budget
The time available per frame: **16.7 ms** at 60 Hz, **11.1 ms** at 90 Hz (VR), **8.3 ms** at 120 Hz. JavaScript, three.js's scene update and the GPU's rendering all have to fit. Leave headroom: aim for ~70% of the budget on your target device.
:::

### Rough budgets by device class

| Target | Draw calls | Triangles | Texture memory | Notes |
|---|---|---|---|---|
| Low-end / mid phone | < 100 | < 300k | < 150 MB | cap DPR at ~1.5, avoid real-time shadows |
| Laptop (integrated GPU) | < 300 | < 1M | < 500 MB | DPR ≤ 2, one shadow light |
| Desktop GPU | 1,000+ | several M | GBs | most things are fine |
| Standalone VR (Quest 3) | < 100–200 | < 500k–1M | < 1 GB | renders **twice** (one per eye) at 72–120 Hz |

These are starting points, not laws. Test on the weakest device you must support.

## CPU-bound or GPU-bound?

:::flow Find the bottleneck
Shrink the canvas (or set DPR to 0.5) | if FPS jumps → GPU-bound on pixels (fill rate)
Hide half the objects | if FPS jumps with the same pixels → draw calls / CPU or vertex cost
Profile in DevTools | long JS tasks or GC → CPU-bound in your code
:::

| Bottleneck | Symptoms | Fixes |
|---|---|---|
| **Draw calls** (CPU) | many objects; FPS barely changes with resolution | instancing, `BatchedMesh`, merging, fewer materials, texture atlases |
| **Pixels** (GPU fill rate) | big screen / high DPR is slow; post-processing is heavy | cap DPR, fewer/cheaper passes, less transparency overdraw, cheaper materials |
| **Vertices** (GPU) | dense meshes, many skinned characters | LOD, decimation, fewer bones, culling |
| **JavaScript** (CPU) | long tasks in profiler, GC spikes | avoid per-frame allocations, move work to the GPU or a Web Worker |
| **Memory** | crashes on mobile, slow loads | smaller/KTX2 textures, dispose unused assets |

## Level of detail (LOD)

Objects far from the camera cover few pixels, so they don't need many triangles. `THREE.LOD` swaps between versions of an object by distance automatically:

```js run title="THREE.LOD — fewer triangles far away" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1020");
scene.fog = new THREE.Fog("#0b1020", 30, 120);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 6, 14);
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxDistance = 100;
scene.add(new THREE.HemisphereLight("#c7d2fe", "#0b1020", 2.2));

// IcosahedronGeometry(r, detail) has 20 × (detail + 1)² triangles
const levels = [
  { detail: 24, distance: 0, color: "#34d399" },    // close: 12,500 triangles
  { detail: 5, distance: 15, color: "#fbbf24" },    // medium: 720
  { detail: 1, distance: 35, color: "#f87171" },    // far: 80
];
const lods = [];
for (let i = 0; i < 60; i++) {
  const lod = new THREE.LOD();
  for (const l of levels) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, l.detail), new THREE.MeshStandardMaterial({ color: l.color, flatShading: true }));
    lod.addLevel(mesh, l.distance);
  }
  lod.position.set((Math.random() - 0.5) * 80, 0, (Math.random() - 0.5) * 80);
  scene.add(lod);
  lods.push(lod);
}

const hud = document.createElement("div");
hud.className = "overlay";
document.body.appendChild(hud);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);                    // LOD levels update automatically during render
  hud.innerHTML = `<b>${renderer.info.render.triangles.toLocaleString()} triangles drawn</b><span class="muted">green = high, yellow = medium, red = low detail · zoom out to see levels switch</span>`;
});
```

Colours make the switching obvious here; in a real app the levels look alike and users never notice. Generate lower levels with Blender's Decimate modifier, `gltf-transform simplify`, or `meshoptimizer` at build time. In R3F, drei's `<Detailed distances={[0, 15, 35]}>` does the same.

## Adaptive resolution

Pixel count is the easiest lever: rendering at DPR 1.5 instead of 2 cuts pixel work by 44% and is barely visible on a phone. Many production apps watch the frame time and adjust DPR on the fly:

```js run title="Dynamic resolution that reacts to frame time" level=advanced
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#111827");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 6;
scene.add(new THREE.HemisphereLight("#fff", "#334155", 2));

// a deliberately heavy fragment load: many overlapping transparent physical materials
const group = new THREE.Group();
for (let i = 0; i < 40; i++) {
  const m = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 128, 16), new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHSL(i / 40, 0.7, 0.5), transparent: true, opacity: 0.25, roughness: 0.2, clearcoat: 1,
  }));
  m.rotation.set(i, i * 2, 0);
  group.add(m);
}
scene.add(group);

const MIN = 0.5, MAX = Math.min(devicePixelRatio, 2);
let dpr = MAX, acc = 0, frames = 0, last = performance.now();
const hud = document.createElement("div");
hud.className = "overlay";
document.body.appendChild(hud);

renderer.setAnimationLoop((now) => {
  group.rotation.y = now / 3000;
  renderer.render(scene, camera);
  acc += now - last; last = now; frames++;
  if (acc > 500) {                                   // evaluate twice a second
    const ms = acc / frames;
    if (ms > 20 && dpr > MIN) dpr = Math.max(MIN, dpr - 0.25);        // too slow → fewer pixels
    else if (ms < 13 && dpr < MAX) dpr = Math.min(MAX, dpr + 0.25);   // headroom → sharper
    renderer.setPixelRatio(dpr);
    hud.innerHTML = `<b>${ms.toFixed(1)} ms/frame</b><span>pixel ratio ${dpr.toFixed(2)} (range ${MIN}–${MAX})</span>`;
    acc = 0; frames = 0;
  }
});
```

R3F packages this as `<PerformanceMonitor>` + `<AdaptiveDpr>` in drei. In WebXR, the equivalent levers are **foveated rendering** and `frameBufferScaling` (Module 5).

## Memory leaks: dispose what you remove

Removing an object from the scene does **not** free its GPU memory. Apps that open and close 3D views, switch products in a configurator, or stream levels leak until the tab crashes, unless they dispose. Compare the two buttons and watch `renderer.info.memory`:

```js run title="Leaky vs. clean object replacement" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
scene.add(new THREE.HemisphereLight("#fff", "#334155", 2));

let current = null;
function makeProduct() {
  const c = document.createElement("canvas");               // each product gets its own texture
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = `hsl(${Math.random() * 360} 70% 55%)`; ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.35, 200, 32), new THREE.MeshStandardMaterial({ map: tex }));
}
function replace(clean) {
  if (current) {
    scene.remove(current);
    if (clean) {                                            // free GPU resources
      current.geometry.dispose();
      current.material.map.dispose();
      current.material.dispose();
    }
  }
  current = makeProduct();
  scene.add(current);
}
replace(true);

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<div class="row"><button id="leak">Swap ×20 (leaky)</button><button id="clean" class="primary">Swap ×20 (dispose)</button></div><span id="mem"></span>`;
document.body.appendChild(ui);
const swap20 = (clean) => { for (let i = 0; i < 20; i++) { replace(clean); renderer.render(scene, camera); } };
ui.querySelector("#leak").onclick = () => swap20(false);
ui.querySelector("#clean").onclick = () => swap20(true);

renderer.setAnimationLoop((t) => {
  current.rotation.y = t / 1500;
  renderer.render(scene, camera);
  const { geometries, textures } = renderer.info.memory;
  ui.querySelector("#mem").innerHTML = `GPU: <b>${geometries}</b> geometries · <b>${textures}</b> textures`;
});
```

## Shader compilation stutter

The first time a material is drawn, three.js compiles its shader, which can take tens of milliseconds and causes a visible hitch: the classic "first click on a configurator option freezes". Warm up before the user interacts:

```js
// after loading everything, before revealing the scene:
await renderer.compileAsync(scene, camera);    // compile all materials in parallel where supported
// for objects that start hidden (other product variants), add them to the scene invisibly first,
// or call renderer.compileAsync(variantObject, camera, scene)
```

Fewer distinct materials also means fewer shaders: three.js reuses a compiled program for materials with the same type and settings, so 200 `MeshStandardMaterial`s that differ only in colour share one program.

## The optimisation checklist

:::flow In order of typical payoff
Cap pixel ratio | Math.min(devicePixelRatio, 2) — or adaptive
Cut draw calls | instancing, BatchedMesh, merging, shared materials
Compress assets | Meshopt/Draco geometry, KTX2 textures, ≤ 2K
Simplify shadows | one shadow light, tight shadow camera, bake the rest
Trim post-processing | few passes, merged effects, lower resolution
Render on demand | static viewers don't need 60 fps
Warm up shaders | compileAsync before interaction
:::

More techniques, by area:

- **Geometry**: LOD; decimate; remove hidden faces (insides of machines); `frustumCulled = true` (default) and correct bounding spheres; occlusion culling for building interiors (portal/cell systems).
- **Materials**: the cheapest material that looks right; avoid `transmission` and many transparent layers; `alphaTest` instead of blending for foliage.
- **Lighting**: environment maps for ambient light; few real-time lights; bake lightmaps for static scenes.
- **JavaScript**: no `new Vector3()` in the render loop; throttle raycasts; move heavy work (physics, parsing, pathfinding) into Web Workers; WebGPU compute for big simulations.
- **Loading**: show a poster image; load low-res first then upgrade; lazy-load off-screen models; HTTP compression (Brotli) for `.glb`; a CDN.
- **Mobile**: test on real devices, watch thermal throttling (performance drops after a few minutes), and offer a "low quality" mode.

:::ai
AI-generated 3D assets (text-to-3D and image-to-3D models) often arrive with hundreds of thousands of triangles and 4K textures. Treat them like CAD exports: run them through glTF-Transform (`simplify`, `resize`, `meshopt`, `etc1s`/`uastc`) before shipping, and check the triangle and texture budget like any other asset.
:::

## Check yourself

```quiz
? Lowering the pixel ratio makes your scene much faster. What were you bound by?
+ GPU fill rate (pixel/fragment work)
- Draw calls
- JavaScript
> Fewer pixels helped, so pixels were the cost.

? Does `scene.remove(mesh)` free its GPU memory?
- Yes, automatically
+ No — dispose its geometry, material and textures
- Only for textures
> renderer.info.memory shows the leak.

? What does THREE.LOD do?
+ Shows simpler versions of an object as it gets farther from the camera
- Loads textures on demand
- Lowers the frame rate when idle
> Distant objects cover few pixels and don't need many triangles.

? How do you avoid a freeze the first time a material appears?
+ Warm up with renderer.compileAsync(scene, camera) before interaction
- Use more materials
- Disable antialiasing
> Shader compilation happens on first use otherwise.

? What's a sensible draw-call budget for a mid-range phone?
+ Roughly under 100
- Roughly 10,000
- Draw calls don't matter on phones
> Phones have weaker CPUs; draw calls cost CPU time.
```

:::exercise Profile the 500-meshes scene
Take the "Measuring a frame" example from Module 1 (500 separate meshes) and rewrite it with a single `InstancedMesh`. Print the draw calls and FPS before and after in the overlay.
:::

:::solution
```js run
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 30);
scene.add(new THREE.HemisphereLight("#fff", "#335", 2));

const N = 500;
const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: "#f472b6" }), N);
const dummy = new THREE.Object3D();
for (let i = 0; i < N; i++) {
  dummy.position.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 20);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}
scene.add(mesh);
const hud = document.createElement("div");
hud.className = "overlay";
document.body.appendChild(hud);
let frames = 0, last = performance.now();
renderer.setAnimationLoop((now) => {
  scene.rotation.y = now / 4000;
  renderer.render(scene, camera);
  frames++;
  if (now - last > 1000) {
    hud.innerHTML = `<b>${frames} fps</b><span>${renderer.info.render.calls} draw call(s) — was 500</span>`;
    frames = 0; last = now;
  }
});
```
:::

:::keypoints
- **Measure** with `renderer.info`, stats, DevTools, Spector.js and on real target devices.
- Know your **budget** (16.7 ms / 11.1 ms in VR) and whether you're bound by **draw calls, pixels, vertices, JS or memory**.
- Biggest wins: cap/adapt **DPR**, cut **draw calls**, compress **assets**, simplify **shadows** and **post-processing**, render **on demand**.
- Use **LOD** for distant objects, **dispose** what you remove, and **warm up shaders** with `compileAsync`.
:::
