---
title: Scene Graph, Renderer and the Frame Loop
part: Building Scenes with three.js
summary: Object3D in detail, configuring WebGLRenderer and WebGPURenderer, timing and fixed-timestep loops, render-on-demand, pixel ratio maths, multiple views, disposing GPU memory properly, and how R3F's Canvas wraps all of it.
---

## Object3D: the base of everything

Every thing you place in a scene (meshes, lights, cameras, groups, sprites, even the scene itself) extends `THREE.Object3D`. Knowing its properties saves a lot of searching.

| Property | Type | What it does |
|---|---|---|
| `position`, `rotation`, `quaternion`, `scale` | Vector3, Euler, Quaternion, Vector3 | The local transform ($T$, $R$, $S$) |
| `matrix`, `matrixWorld` | Matrix4 | Local and world matrices (Chapter 4) |
| `matrixAutoUpdate` | boolean | Recompute `matrix` from TRS every frame (default true) |
| `parent`, `children` | Object3D, Object3D[] | The tree; use `add`, `remove`, `attach`, `clear` |
| `visible` | boolean | Skips rendering this object **and its children** |
| `castShadow`, `receiveShadow` | boolean | Shadow participation (also needs a shadow-casting light) |
| `frustumCulled` | boolean | Skip when the bounding sphere is off-screen (default true) |
| `renderOrder` | number | Overrides sorting; lower draws first |
| `layers` | Layers | 32 bit flags; the camera only renders objects sharing a layer |
| `name`, `userData` | string, object | Your own labels and data (`getObjectByName`) |
| `up` | Vector3 | The up hint for `lookAt` (default $(0,1,0)$) |

```js title="three.js — walking the tree"
scene.traverse((o) => {                       // every descendant, depth first
  if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
});
const wheel = car.getObjectByName("wheel_front_left");
scene.traverseVisible((o) => { /* skips hidden branches */ });
object.removeFromParent();                    // safe even if it has no parent
```

:::def Layers
A 32-bit mask on every object and camera. The renderer draws an object only if it shares at least one enabled layer with the camera; the `Raycaster` also has layers. Use them to render a "selection outline" set in a second pass, hide helpers from a reflection camera, or make some objects unclickable.
:::

```js title="three.js — layers for selective rendering and picking"
const HELPERS = 1;
gizmo.layers.set(HELPERS);                    // only on layer 1
camera.layers.enable(HELPERS);                // main camera sees layers 0 and 1
mirrorCamera.layers.disable(HELPERS);         // reflections do not show gizmos
raycaster.layers.set(0);                      // picking ignores the helpers
```

## Configuring the renderer

```js title="three.js — a production WebGLRenderer"
const renderer = new THREE.WebGLRenderer({
  canvas,                         // reuse an existing <canvas> (optional)
  antialias: true,                // MSAA on the default framebuffer
  alpha: false,                   // opaque canvas: cheaper compositing; true to see the page behind
  powerPreference: "high-performance",   // ask for the discrete GPU on dual-GPU laptops
  stencil: false,                 // skip the stencil buffer unless you need it
  preserveDrawingBuffer: false,   // true only for toDataURL screenshots taken outside the loop
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);  // false: do not touch CSS size
renderer.outputColorSpace = THREE.SRGBColorSpace;     // default; see Chapter 12
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // or AgXToneMapping / NeutralToneMapping
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;         // soft since r182; PCFSoftShadowMap removed in r186
```

:::def Device pixel ratio (DPR)
The number of physical screen pixels per CSS pixel: 1 on old monitors, 2 on most laptops and iPads, 3 on many phones. The drawing buffer has (CSS width × DPR) × (CSS height × DPR) pixels, and fragment cost grows with that **pixel count**, so cost grows with DPR².
:::

:::calc What a pixel ratio costs
An iPad Pro 11" canvas of 1194×834 CSS pixels:

- DPR 1: $1194\times834 = 0.996$ M pixels.
- DPR 2 (its native ratio): $2388\times1668 = 3.98$ M pixels: **4×** the fragment work.
- A 3× phone (390×844 CSS) at full DPR: $1170\times2532 = 2.96$ M; capped at 2: $780\times1688 = 1.32$ M, a 56% saving that most users cannot see.

This is why `setPixelRatio(Math.min(devicePixelRatio, 2))` is standard, and why adaptive apps drop to 1–1.5 when the frame rate falls.
:::

### WebGPURenderer differences

```js title="three.js — WebGPURenderer setup"
import * as THREE from "three/webgpu";

const renderer = new THREE.WebGPURenderer({ antialias: true /*, forceWebGL: true for testing */ });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
await renderer.init();                  // needed if you render or read capabilities before the loop starts
renderer.setAnimationLoop(() => renderer.render(scene, camera));   // setAnimationLoop also initialises
console.log(renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL 2 fallback");
```

:::new Async methods
Since r181 the `renderAsync()`/`computeAsync()` family is deprecated: initialise once (`await renderer.init()` or implicitly via `setAnimationLoop`) and then call the synchronous `render()`/`compute()`. `compileAsync()` stopped blocking rendering in r184, and r186 added `compileComputeAsync()` to pre-compile compute shaders and avoid first-use hitches.
:::

## The frame loop

`renderer.setAnimationLoop(fn)` calls `fn` once per display refresh, using `requestAnimationFrame` normally and the XR session's own loop inside VR/AR. Always prefer it to calling `requestAnimationFrame` yourself, because WebXR **requires** it.

:::def THREE.Timer
The time-keeping class (core since r179, replacing the deprecated `Clock`). Call `timer.update(timestamp)` once per frame, then read `getDelta()` (seconds since the previous update) and `getElapsed()` (seconds since start). `timer.connect(document)` uses the Page Visibility API so that a long hidden period does not produce one giant delta when the tab returns.
:::

### Fixed timestep for physics and game logic

Variable delta time is fine for visual animation, but physics simulations become unstable or non-deterministic when the step size changes every frame. The standard pattern: advance the simulation in **fixed** steps, as many as fit into the elapsed time, and interpolate the rendering between the last two states.

:::formula The accumulator loop
$$\text{acc} \leftarrow \text{acc} + \Delta t;\qquad \text{while } \text{acc} \ge h:\ \text{step}(h),\ \text{acc} \leftarrow \text{acc} - h;\qquad \alpha = \text{acc}/h$$
$h$ is the fixed step (for example $1/60$ s). Render each object at $\text{lerp}(\text{previous}, \text{current}, \alpha)$. Cap the number of steps per frame (say 5) to avoid the "spiral of death" on slow devices.
:::

@fig(fixed_timestep) Rendering at a variable rate while the simulation advances in fixed 16.7 ms steps. Leftover time stays in the accumulator and becomes the interpolation factor α.

:::calc One slow frame
$h = 16.67$ ms. The accumulator holds 4 ms, and the next frame took $\Delta t = 25$ ms.

1. $\text{acc} = 4 + 25 = 29$ ms.
2. $29 \ge 16.67$: one step, $\text{acc} = 12.33$ ms. $12.33 < 16.67$: stop.
3. $\alpha = 12.33/16.67 = 0.74$: draw objects 74% of the way from their previous to their current physics state.
:::

```js title="three.js — fixed-step simulation with interpolation"
const STEP = 1 / 60, MAX_STEPS = 5;
let acc = 0;
renderer.setAnimationLoop((t) => {
  timer.update(t);
  acc += Math.min(timer.getDelta(), 0.25);
  let steps = 0;
  while (acc >= STEP && steps++ < MAX_STEPS) {
    for (const b of bodies) b.prev.copy(b.pos);   // remember the last state
    world.step(STEP);                               // deterministic step
    acc -= STEP;
  }
  const alpha = acc / STEP;
  for (const b of bodies) b.mesh.position.lerpVectors(b.prev, b.pos, alpha);
  renderer.render(scene, camera);
});
```

### Render on demand

A product viewer that is not moving does not need to redraw 60 times a second. Rendering only when something changes saves battery and keeps laptops cool.

```js title="three.js — render only when needed"
let pending = false;
function requestRender() {
  if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; controls.update(); renderer.render(scene, camera); }); }
}
controls.addEventListener("change", requestRender);   // OrbitControls fires change while moving
addEventListener("resize", () => { resize(); requestRender(); });
requestRender();
```

```jsx title="R3F — frameloop='demand'"
<Canvas frameloop="demand">   {/* renders on prop changes, events and invalidate() */}
  <Model />
  <OrbitControls />           {/* drei controls call invalidate() for you */}
</Canvas>

// from your own code, after mutating something outside React:
const invalidate = useThree((s) => s.invalidate);
useEffect(() => { ref.current.material.color.set(color); invalidate(); }, [color]);
```

:::warn Damping and demand mode
With `enableDamping`, OrbitControls keeps moving for a while after the pointer is released. In a hand-written on-demand loop, keep requesting frames while `controls.update()` returns true (it reports whether the camera changed). drei's `<OrbitControls>` handles this in R3F.
:::

## Resizing correctly

The canvas has two sizes: its **CSS size** (layout) and its **drawing-buffer size** (pixels). Keep the drawing buffer equal to CSS size × DPR, and the camera's aspect equal to CSS width ÷ height.

```js title="three.js — resize from the canvas's own size (works in any layout)"
const ro = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);    // false = leave the CSS size to the layout
});
ro.observe(renderer.domElement);
```

## Several views in one canvas

`setViewport` and `setScissor` restrict drawing to a rectangle of the canvas, so one renderer can draw a minimap, a split screen or a picture-in-picture view in the same frame.

```js title="three.js — a minimap in the corner"
renderer.setScissorTest(true);
const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h);
renderer.render(scene, camera);                         // main view
renderer.setViewport(w - 220, h - 220, 200, 200);      // origin is bottom-left, in CSS pixels
renderer.setScissor(w - 220, h - 220, 200, 200);
renderer.render(scene, topDownCamera);                 // minimap
renderer.setScissorTest(false);
```

For a HUD that must draw on top of everything, render a second scene with `renderer.autoClear = false`, calling `renderer.clearDepth()` between the two renders so the HUD is never hidden by world geometry.

## Disposing GPU memory

JavaScript's garbage collector frees JavaScript objects, but **not** the GPU buffers, textures and shader programs behind them. three.js keeps those alive until you call `dispose()`. Long-running apps (configurators, editors, single-page apps with routes) leak GPU memory without it, and mobile browsers kill the tab when memory runs out.

| Owner | What `dispose()` frees |
|---|---|
| `BufferGeometry` | Vertex and index buffers |
| `Material` | The shader program reference (freed when no material uses it) |
| `Texture` | The GPU texture (and the `ImageBitmap` if you close it yourself) |
| `WebGLRenderTarget` | Its colour and depth textures and framebuffer |
| `Object3D` (r186) | A new `dispose()` hook for custom objects; call `super.dispose()` in subclasses |
| Renderer | Everything it owns; use when tearing down the whole canvas |

```js title="three.js — dispose a subtree completely"
function disposeDeep(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();   // map, normalMap, ...
      m.dispose();
    }
  });
  root.removeFromParent();
}
console.log(renderer.info.memory);   // { geometries, textures } should go back down afterwards
```

:::warn Shared resources
Only dispose what nobody else uses. If ten meshes share one material and one texture, disposing them for the first mesh breaks the other nine on the next frame (three.js re-uploads, causing hitches and possible errors). Keep shared assets in a cache with reference counts, or dispose them when the whole level unloads.
:::

:::tip WebGL context loss
The browser can take the GPU context away (driver reset, too many contexts, the phone reclaiming memory). Listen for `webglcontextlost` (call `event.preventDefault()` to allow restoration) and `webglcontextrestored`; three.js re-uploads resources after restoration. Browsers allow a limited number of live WebGL contexts per page (often 16), so reuse one renderer across views instead of creating one per component.
:::

## R3F's Canvas, in detail

| Canvas prop | Meaning |
|---|---|
| `gl` | Renderer options object, an instance, or a (sync or async) factory `(props) => renderer` |
| `camera` | Default camera props, or an existing camera; `orthographic` switches type |
| `dpr` | Pixel ratio, or `[min, max]` clamped to the device (default `[1, 2]`) |
| `frameloop` | `"always"` (default), `"demand"` (render on change) or `"never"` (you call `advance`) |
| `shadows` | `true` enables `renderer.shadowMap` (or `"soft"`, `"basic"`, `"percentage"`, `"variance"`) |
| `flat` | Disables tone mapping (uses `NoToneMapping`) |
| `linear` | Disables automatic sRGB output |
| `events`, `eventSource` | Pointer-event system and the element it listens on |
| `performance` | `{ min, max, debounce }` for `regress()`-based adaptive quality |
| `onCreated` | Called with the store state once the renderer is ready |

:::def useThree
A hook returning R3F's store: `gl` (renderer), `scene`, `camera`, `size` (CSS pixels), `viewport` (world units), `clock`, `invalidate`, `advance`, `setDpr`, `events`, `raycaster`, `pointer`. Pass a selector to subscribe to one slice and avoid re-renders: `useThree((s) => s.camera)`.
:::

:::def useFrame
`useFrame((state, delta, xrFrame) => …, priority)` registers a callback that runs every frame **before** rendering. Callbacks run in ascending priority. Any callback with a **positive** priority tells R3F that you will render yourself (for example a post-processing pipeline), so R3F stops calling `gl.render` automatically.
:::

:::note Automatic disposal in R3F
When a JSX-created object unmounts, R3F calls `dispose()` on it (geometries, materials, textures created through JSX). Objects you pass in with `<primitive object={…}>` are **not** disposed automatically, because you may share them; add `dispose={null}` to opt any element out. Assets loaded through `useLoader`/`useGLTF` are cached: call `useGLTF.clear(url)` to evict them.
:::

## Helpers for development

| Helper | Shows |
|---|---|
| `AxesHelper(size)` | X (red), Y (green), Z (blue) axes |
| `GridHelper(size, divisions)` | A ground grid |
| `BoxHelper` / `Box3Helper` | An object's bounding box |
| `CameraHelper(light.shadow.camera)` | A camera's frustum: essential for tuning shadows |
| `DirectionalLightHelper`, `PointLightHelper`, `SpotLightHelper` | Light positions and directions |
| `SkeletonHelper(model)` | The bones of a skinned mesh |
| `VertexNormalsHelper` (addon) | Normals as small lines |
| stats-gl / `Stats` | FPS, CPU and GPU frame time |
| lil-gui (vanilla) / leva (R3F) | Sliders for live tuning |
| Spector.js, browser GPU profilers | Every WebGL call in a captured frame |

:::keypoints
- Everything is an `Object3D`: transform, tree, visibility, shadows, culling, `renderOrder`, `layers`, `userData`.
- Configure the renderer once: antialias, pixel ratio ≤ 2, `SRGBColorSpace` output, a tone mapper, `PCFShadowMap`.
- Fragment cost scales with DPR²; capping at 2 saves more than half the work on 3× phones.
- `setAnimationLoop` for every loop (XR needs it); `Timer` for time; a fixed-step accumulator for physics.
- Render on demand for static viewers (`frameloop="demand"` + `invalidate()` in R3F).
- Dispose geometries, materials, textures and render targets you no longer need; watch `renderer.info.memory`.
- In R3F, `useFrame` with a positive priority takes over rendering; `<primitive>` objects are not auto-disposed.
:::

## Interview questions

:::qa Why use `renderer.setAnimationLoop` instead of `requestAnimationFrame`? {level=junior}
It does the same thing outside XR, but when a WebXR session starts the browser stops firing `window.requestAnimationFrame` for the immersive display and instead drives frames through `XRSession.requestAnimationFrame` at the headset's refresh rate. `setAnimationLoop` switches automatically. It also initialises `WebGPURenderer` before the first frame. Passing `null` stops the loop.
:::

:::qa A configurator's memory grows every time the user switches models, until mobile Safari reloads the page. What do you do? {level=mid}
GPU resources are not garbage-collected. When a model is removed, traverse it and call `dispose()` on its geometries, materials and textures (unless shared), and dispose any render targets created for it. Verify with `renderer.info.memory.geometries/textures` returning to the baseline after a switch, and with the browser's memory tools. Cache and reuse assets the user is likely to come back to rather than reloading them. In R3F, JSX objects dispose on unmount automatically, but `<primitive>` objects and cached `useGLTF` results need explicit handling.
:::

:::qa How do you keep physics stable when the frame rate varies? {level=mid}
Use a fixed timestep with an accumulator: add each frame's delta to an accumulator, run the physics in constant steps (for example 1/60 s) while the accumulator has enough time, and interpolate the rendered transforms with $\alpha = \text{acc}/h$. Cap steps per frame to avoid a spiral of death, and clamp huge deltas after tab switches. Rapier and cannon-es support this pattern (`@react-three/rapier` exposes `timeStep` and `interpolate`).
:::

:::qa What does `frameloop="demand"` do in R3F and when would you use it? {level=mid}
R3F stops rendering continuously and renders only when something requests it: React props changing, pointer events, controls calling `invalidate()`, or your own `invalidate()` calls after imperative mutations. Use it for mostly static scenes (product viewers, maps, dashboards) to save battery and heat. Anything animated must call `invalidate()` each frame while it animates, or use `frameloop="always"`.
:::

:::qa Why is the canvas blurry on a retina screen, and why might you deliberately keep it slightly blurry? {level=junior}
If the drawing buffer is sized in CSS pixels, a DPR-2 screen stretches each rendered pixel over four physical pixels. `renderer.setPixelRatio(devicePixelRatio)` fixes it, but costs DPR² more fragment work. On 3× phones and in heavy scenes you cap it at 2 (or lower, adaptively), trading a small loss of sharpness for a large gain in frame rate and battery life.
:::
