---
title: Scene, Camera & Renderer
level: easy
time: 25
summary: The three objects behind every app in detail. Renderer options, pixel ratio, resizing correctly (window and container), the animation loop, rendering only when needed, backgrounds, fog and cleaning up.
---

You met the trio in the first lesson. Now let's set them up the way production apps do: sharp on high-density screens, correctly sized when the window or layout changes, light on battery, and cleaned up when the page no longer needs them.

## The production boilerplate

```js run title="A complete, well-behaved setup" level=easy
import * as THREE from "three";

// --- renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  antialias: true,                       // smooth jagged edges (costs a little GPU)
  powerPreference: "high-performance",   // ask for the fast GPU on dual-GPU laptops
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));   // sharp, but cap the cost
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// --- scene ------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1020");
scene.fog = new THREE.Fog("#0b1020", 6, 18);             // fade to the background colour

// --- camera -----------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2, 7);
camera.lookAt(0, 0, 0);

// --- content ----------------------------------------------------------------
scene.add(new THREE.HemisphereLight("#bfdbfe", "#1e1b4b", 2));
const geo = new THREE.TorusGeometry(0.5, 0.18, 24, 64);
const mat = new THREE.MeshStandardMaterial({ color: "#34d399", roughness: 0.35 });
for (let i = 0; i < 12; i++) {                           // a row disappearing into the fog
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(Math.sin(i) * 1.5, 0, -i * 1.4);
  scene.add(ring);
}

// --- loop -------------------------------------------------------------------
renderer.setAnimationLoop((time) => {
  scene.children.forEach((o, i) => { if (o.isMesh) o.rotation.y = time / 1000 + i * 0.4; });
  renderer.render(scene, camera);
});

// --- resize -----------------------------------------------------------------
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;   // 1. fix the camera's shape
  camera.updateProjectionMatrix();            // 2. apply camera changes
  renderer.setSize(innerWidth, innerHeight);  // 3. resize the canvas
});
```

Press **Fullscreen** above the scene: the resize handler keeps the image undistorted.

## The renderer

:::def WebGLRenderer
The object that turns your scene into pixels in a `<canvas>`. It owns the GPU context, compiles materials into shaders, uploads geometry and textures, and issues draw calls. `renderer.domElement` is the canvas element it draws into.
:::

| Option | What it does | Typical |
|---|---|---|
| `antialias` | smooths edges (MSAA); set at creation, can't change later | `true` (consider `false` with post-processing) |
| `alpha` | transparent canvas background, so the page shows through | `true` for UI overlays |
| `powerPreference` | `"high-performance"` or `"low-power"` GPU hint | `"high-performance"` |
| `canvas` | draw into an existing `<canvas>` instead of creating one | for custom layouts |
| `preserveDrawingBuffer` | keep the last frame (needed for `canvas.toDataURL()` screenshots) | `false` unless you export images |

:::def Device pixel ratio (DPR)
How many physical pixels a screen has per CSS pixel. A typical laptop is 1–2, phones 2–3. Rendering at full DPR on a 3× phone means **9×** the pixels of DPR 1, so most apps cap it at 2: `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
:::

## The animation loop

`renderer.setAnimationLoop(callback)` calls your function before every screen refresh, passing a timestamp in milliseconds. Prefer it over `requestAnimationFrame`: it is required for WebXR (headsets have their own refresh loop), and `setAnimationLoop(null)` stops it cleanly.

:::warn Fixed steps vs. time
`mesh.rotation.y += 0.01` per frame spins twice as fast at 120 Hz as at 60 Hz. Base movement on **time**: either the absolute time (`rotation.y = time / 1000`) or the **delta** since the last frame (`rotation.y += speed * delta`). The Animation lesson covers `THREE.Timer`, which computes delta for you.
:::

## Render only when something changes

A product viewer that sits still doesn't need to redraw 60 times a second. Rendering **on demand** saves battery and keeps laptops cool. Here the scene renders only while you drag (OrbitControls fires `change`) or press the button. The counter shows how few frames that is.

```js run title="On-demand rendering" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2, 1.5, 3);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.2));
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.22, 160, 24),
  new THREE.MeshStandardMaterial({ color: "#818cf8", roughness: 0.3 }));
scene.add(knot);

const hud = document.createElement("div");
hud.className = "overlay";
hud.innerHTML = `<button class="primary">Change colour</button><span class="muted">frames rendered: 0</span>`;
document.body.appendChild(hud);

let frames = 0;
function render() {
  renderer.render(scene, camera);
  hud.querySelector("span").textContent = `frames rendered: ${++frames}`;
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.addEventListener("change", render);          // redraw only while the camera moves
hud.querySelector("button").onclick = () => {
  knot.material.color.setHSL(Math.random(), 0.7, 0.6);
  render();                                            // redraw after a change
};
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  render();
});
render();                                              // the first frame
```

R3F has this built in: `<Canvas frameloop="demand">` plus `invalidate()` (Module 3).

## The canvas inside a page layout

Real apps rarely render full-window. The canvas usually lives inside a card, a sidebar layout or a grid, and must resize when **its container** changes, not just the window. `ResizeObserver` watches an element's size:

```js run title="Canvas in a layout, sized by its container" level=intermediate
import * as THREE from "three";

document.body.insertAdjacentHTML("beforeend", `
  <div id="layout" style="display:grid;grid-template-columns:1fr 2fr;gap:12px;height:100%;padding:12px">
    <aside class="overlay" style="position:static;max-width:none">
      <b>Product</b><span class="muted">Drag the divider: the 3D view follows its box, not the window.</span>
      <label>Panel width <input id="w" type="range" min="20" max="60" value="33"></label>
    </aside>
    <div id="view" style="border-radius:12px;overflow:hidden;border:1px solid var(--border)"></div>
  </div>`);
const grid = document.getElementById("layout");
const view = document.getElementById("view");
document.getElementById("w").oninput = (e) => (grid.style.gridTemplateColumns = `${e.target.value}% 1fr`);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#111827");
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
camera.position.set(0, 0.6, 3);
scene.add(new THREE.HemisphereLight("#fff", "#335", 2));
const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#f59e0b" }));
scene.add(box);

new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);        // also sets the canvas CSS size
}).observe(view);

renderer.setAnimationLoop((t) => {
  box.rotation.set(t / 1500, t / 1000, 0);
  renderer.render(scene, camera);
});
```

## Backgrounds and fog

| Value of `scene.background` | Result |
|---|---|
| `null` (default) | the renderer's clear colour, or the page behind if `alpha: true` |
| `new THREE.Color("#0b1020")` | a flat colour |
| a `Texture` | a flat image behind everything |
| a cube texture or equirectangular HDR | a 360° environment (Module 2) |

:::def Fog
Blends objects towards a colour with distance, hiding the far clipping plane and adding depth. `THREE.Fog(color, near, far)` fades linearly between two distances; `THREE.FogExp2(color, density)` thickens exponentially, like real haze. Match the fog colour to the background.
:::

## Cleaning up

Three.js can't know when you're done with GPU resources, so geometries, materials, textures and render targets must be **disposed** explicitly. This matters in single-page apps that open and close 3D views, or the GPU memory grows each time.

```js
function disposeScene(scene, renderer) {
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of materials) {
      if (!m) continue;
      for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
      m.dispose();
    }
  });
  renderer.setAnimationLoop(null);   // stop the loop
  renderer.dispose();                // free the renderer's internal caches
  renderer.domElement.remove();      // remove the canvas
}
```

:::tip R3F does this for you
When a React Three Fiber component unmounts, R3F disposes its geometries and materials automatically. In plain three.js it's your job.
:::

## Check yourself

```quiz
? Why cap the pixel ratio at 2?
+ Rendering at DPR 3 costs 9× the pixels of DPR 1, with little visible gain
- WebGL doesn't support DPR above 2
- To make text sharper
> Pixel count grows with the square of the DPR.

? After changing `camera.aspect`, what must you call?
- renderer.render()
+ camera.updateProjectionMatrix()
- scene.updateMatrixWorld()
> Camera lens settings are baked into a matrix that only updates when you ask.

? When is `ResizeObserver` better than the window `resize` event?
+ When the canvas lives in a container whose size can change without the window changing
- Always — window resize no longer works
- Only on mobile
> Layouts, sidebars and split views resize elements independently of the window.

? Why prefer `renderer.setAnimationLoop` over `requestAnimationFrame`?
+ It works in WebXR sessions, which have their own frame timing
- It is faster
- It renders twice per frame
> Headsets drive the loop at their own refresh rate; setAnimationLoop handles both.
```

:::exercise Pause when hidden
Extend the first example with a **Pause / Play** button that stops and restarts the loop using `renderer.setAnimationLoop(null)` and `renderer.setAnimationLoop(loop)`.
:::

:::solution
```js run
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1020");
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);
scene.add(new THREE.HemisphereLight("#bfdbfe", "#1e1b4b", 2));
const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 24, 64), new THREE.MeshStandardMaterial({ color: "#34d399" }));
scene.add(ring);

function loop(time) {
  ring.rotation.y = time / 1000;
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);

const btn = document.createElement("button");
btn.className = "overlay";
btn.textContent = "Pause";
document.body.appendChild(btn);
let running = true;
btn.onclick = () => {
  running = !running;
  renderer.setAnimationLoop(running ? loop : null);
  btn.textContent = running ? "Pause" : "Play";
};
```
Because rotation uses absolute `time`, the ring jumps forward on Play. With a delta-based update it would continue smoothly from where it stopped.
:::

:::keypoints
- Create the renderer with `antialias`, cap **pixel ratio** at 2, append `renderer.domElement`.
- On resize: update `camera.aspect`, call `updateProjectionMatrix()`, then `renderer.setSize()`.
- Use `ResizeObserver` when the canvas lives inside a layout.
- `setAnimationLoop` drives the frame loop (and WebXR); render **on demand** for static scenes.
- `scene.background` and `scene.fog` set the mood; match fog to the background.
- In plain three.js, **dispose** geometries, materials, textures and the renderer when done.
:::
