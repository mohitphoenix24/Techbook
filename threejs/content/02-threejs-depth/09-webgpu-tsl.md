---
title: WebGPU & TSL — The Next Renderer
level: advanced
time: 45
summary: What WebGPU changes, setting up WebGPURenderer with automatic WebGL 2 fallback, node materials written in TSL (three.js's shading language in JavaScript), GPU compute shaders that simulate 100,000 particles, post-processing with RenderPipeline, and when to adopt it.
---

WebGL is based on a 2007 graphics API. **WebGPU**, now shipping in Chrome, Edge, Safari and Firefox, is modelled on modern native APIs (Vulkan, Metal, Direct3D 12): less CPU overhead per draw call, and **compute shaders**, which let the GPU run general-purpose parallel work such as physics, particles and simulations. Three.js supports it through `WebGPURenderer` and a new way to write shaders, **TSL**, that compiles to both WebGPU's WGSL and WebGL's GLSL.

:::def WebGPU
The modern browser API for GPU graphics **and** computation. Compared with WebGL it has lower driver overhead, explicit pipelines, storage buffers, and compute shaders. Its shading language is **WGSL**.
:::

:::def TSL (Three.js Shading Language)
A way to write shaders as **JavaScript function calls** (`uv().mul(2.0)`, `sin(time)`, `mix(a, b, t)`) instead of GLSL strings. Three.js builds a node graph from them and generates WGSL for WebGPU or GLSL for WebGL 2 automatically. Node materials use TSL for their `colorNode`, `positionNode`, `normalNode`, `opacityNode` and more.
:::

## Hello, WebGPURenderer

Three things change from WebGL: import from **`three/webgpu`**, call **`await renderer.init()`** (or let the first `render` initialise it), and use **node materials** when you want TSL. Built-in materials like `MeshStandardMaterial` also work: three.js converts them to node materials internally.

```js run title="WebGPURenderer with a TSL node material" level=advanced
import * as THREE from "three/webgpu";
import { color, mix, uv, sin, time, positionLocal, normalLocal, vec3 } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
await renderer.init();                                         // picks WebGPU, or falls back to WebGL 2

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1020");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.5, 4);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#ffffff", "#1e1b4b", 1.5));
const key = new THREE.DirectionalLight("#ffffff", 2.5);
key.position.set(2, 3, 4);
scene.add(key);

const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.2 });
// colour: a gradient from indigo to emerald along the surface's v coordinate
material.colorNode = mix(color("#4f46e5"), color("#10b981"), uv().y);
// position: push vertices along their normal with a travelling wave (runs in the vertex shader)
const wave = sin(positionLocal.y.mul(8).add(time.mul(3))).mul(0.08);
material.positionNode = positionLocal.add(normalLocal.mul(wave));

const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.28, 256, 48), material);
scene.add(knot);

const hud = document.createElement("div");
hud.className = "overlay";
hud.innerHTML = `<b>Backend: ${renderer.backend.isWebGPUBackend ? "WebGPU ✓" : "WebGL 2 (fallback)"}</b><span class="muted">same code either way</span>`;
document.body.appendChild(hud);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

Note that **lighting still works**: the node material keeps all of `MeshStandardMaterial`'s PBR shading and you only replaced its colour and vertex position, the same idea as `onBeforeCompile` in lesson 6, but supported, typed, and backend-independent.

### TSL in a nutshell

| GLSL | TSL |
|---|---|
| `uniform float uTime;` + updating `.value` | `time` (built-in) or `const u = uniform(0)` → `u.value = 1` |
| `vec3 c = vec3(1.0, 0.5, 0.0);` | `vec3(1, 0.5, 0)` |
| `a * b + c` | `a.mul(b).add(c)` |
| `mix(a, b, t)`, `sin(x)`, `smoothstep(a, b, x)` | `mix(a, b, t)`, `sin(x)`, `smoothstep(a, b, x)` (or `x.sin()`) |
| `vUv` varying | `uv()` |
| `position` / `normal` attribute | `positionLocal`, `normalLocal` (and `positionWorld`, `normalWorld`, `normalView`…) |
| `if (...) {...}` | `If(cond, () => {...})` inside `Fn` |
| a GLSL function | `const f = Fn(([a, b]) => a.mul(b))` |
| writing `gl_FragColor` | assigning `material.colorNode` / `outputNode` |

| Node material | Based on |
|---|---|
| `MeshBasicNodeMaterial`, `MeshStandardNodeMaterial`, `MeshPhysicalNodeMaterial`, `MeshLambertNodeMaterial`… | the matching classic material |
| `SpriteNodeMaterial`, `PointsNodeMaterial`, `LineBasicNodeMaterial` | sprites, points and lines |
| `NodeMaterial` | a blank material for fully custom shading |

## Instanced particles defined entirely in TSL

`range(a, b)` gives each **instance** a random value in a range, so a whole galaxy can be described as maths in the material, with no per-particle data from JavaScript at all:

```js run title="A TSL galaxy: 20,000 instances, zero JS per frame" level=advanced
import * as THREE from "three/webgpu";
import { color, cos, float, mix, range, sin, time, uniform, uv, vec3, vec4, TWO_PI } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#120c18");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(4, 2.5, 5);
new OrbitControls(camera, renderer.domElement);

const material = new THREE.SpriteNodeMaterial({ depthWrite: false, blending: THREE.AdditiveBlending });
const size = uniform(0.08);
material.scaleNode = range(0, 1).mul(size);                       // random size per instance

const radiusRatio = range(0, 1);                                  // random 0..1 per instance
const radius = radiusRatio.pow(1.5).mul(5).toVar();
const branches = 3;
const branchAngle = range(0, branches).floor().mul(TWO_PI.div(branches));
const angle = branchAngle.add(time.mul(radiusRatio.oneMinus()));  // inner stars orbit faster
material.positionNode = vec3(cos(angle), 0, sin(angle)).mul(radius)
  .add(range(vec3(-1), vec3(1)).pow3().mul(radiusRatio).add(0.2));

const inside = uniform(color("#ffa575")), outside = uniform(color("#311599"));
const alpha = float(0.1).div(uv().sub(0.5).length()).sub(0.2);   // a soft round sprite, computed
material.colorNode = vec4(mix(inside, outside, radiusRatio.oneMinus().pow(2).oneMinus()), alpha);

scene.add(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, 20000));

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<label>size <input type="range" min="0.01" max="0.3" step="0.005" value="0.08"></label>
  <div class="row"><input type="color" value="#ffa575"><input type="color" value="#311599"></div>`;
ui.querySelector("input[type=range]").oninput = (e) => (size.value = +e.target.value);   // uniforms update instantly
const [c1, c2] = ui.querySelectorAll("input[type=color]");
c1.oninput = () => inside.value.set(c1.value);
c2.oninput = () => outside.value.set(c2.value);
document.body.appendChild(ui);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

## Compute shaders: simulation on the GPU

This is the headline feature. A **compute shader** runs a function once per element of a buffer, in parallel, without drawing anything. Here 100,000 particles fall, bounce and get pushed away from your mouse, and **JavaScript never touches a single particle**: it only calls `renderer.compute()` each frame.

```js run title="100,000 particles simulated in a compute shader" level=advanced height=440
import * as THREE from "three/webgpu";
import { Fn, If, uniform, float, uv, vec3, hash, instancedArray, instanceIndex, shapeCircle } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COUNT = 100000;
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color("#000000");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 12, 26);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -2, 0);

// GPU buffers: one vec3 per particle, living only in GPU memory
const positions = instancedArray(COUNT, "vec3");
const velocities = instancedArray(COUNT, "vec3");
const colors = instancedArray(COUNT, "vec3");
const gravity = uniform(-0.00098), bounce = uniform(0.8), friction = uniform(0.99), pointer = uniform(new THREE.Vector3(0, -100, 0));

// 1) initialise: lay particles out on a grid, give each a random colour — runs once
const side = Math.sqrt(COUNT), half = float(side / 2);
const init = Fn(() => {
  const p = positions.element(instanceIndex);
  p.x = half.sub(instanceIndex.mod(side)).mul(0.2);
  p.z = half.sub(instanceIndex.div(side)).mul(0.2);
  p.y = hash(instanceIndex.add(7)).mul(8);
  const c = colors.element(instanceIndex);
  c.x = hash(instanceIndex); c.y = hash(instanceIndex.add(2)); c.z = 1;
})().compute(COUNT);

// 2) update: gravity, friction, bounce on the floor, push away from the pointer — runs every frame
const update = Fn(() => {
  const p = positions.element(instanceIndex), v = velocities.element(instanceIndex);
  v.addAssign(vec3(0, gravity, 0));
  const away = p.sub(pointer), d = away.length();
  v.addAssign(away.normalize().mul(float(3).sub(d).max(0).mul(0.01)));   // within 3 m of the pointer
  p.addAssign(v);
  v.mulAssign(friction);
  If(p.y.lessThan(0), () => {
    p.y = 0;
    v.y = v.y.negate().mul(bounce);
    v.x = v.x.mul(0.9); v.z = v.z.mul(0.9);
  });
})().compute(COUNT);

renderer.compute(init);

// draw: one sprite instance per particle, positioned from the GPU buffer
const material = new THREE.SpriteNodeMaterial();
material.positionNode = positions.toAttribute();
material.colorNode = uv().mul(colors.element(instanceIndex));
material.scaleNode = float(0.12);
material.opacityNode = shapeCircle();          // round particles
material.transparent = true;
const particles = new THREE.Sprite(material);
particles.count = COUNT;
particles.frustumCulled = false;
scene.add(particles, new THREE.GridHelper(60, 30, "#222", "#222"));

// the pointer's position on the floor, sent to the GPU as a uniform
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
renderer.domElement.addEventListener("pointermove", (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  ray.ray.intersectPlane(floor, pointer.value);
});
const hud = document.createElement("div");
hud.className = "overlay";
hud.innerHTML = `<b>${COUNT.toLocaleString()} particles</b><span class="muted">${renderer.backend.isWebGPUBackend ? "WebGPU compute" : "WebGL 2 fallback (transform feedback)"} · move the mouse over the floor</span>`;
document.body.appendChild(hud);

renderer.setAnimationLoop(() => {
  renderer.compute(update);                    // simulate…
  renderer.render(scene, camera);              // …then draw
});
```

The same simulation in JavaScript would loop over 100,000 particles every frame on one CPU core. On the GPU, thousands of cores each handle a few particles. Compute shaders are how three.js examples run cloth, fluids, flocking birds and millions of particles in real time.

## Post-processing with RenderPipeline

With WebGPU, post-processing is also built from TSL nodes. `pass(scene, camera)` renders the scene into a texture node; effects are functions of that node, and you combine them with ordinary maths:

```js run title="Bloom with RenderPipeline (WebGPU-style post-processing)" level=advanced
import * as THREE from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#020617");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2, 8);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#334155", "#020617", 1));

const knots = [];
["#22d3ee", "#e879f9", "#facc15"].forEach((c, i) => {
  const m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.16, 160, 20),
    new THREE.MeshStandardMaterial({ color: "#111827", emissive: c, emissiveIntensity: 2.5 }));
  m.position.x = (i - 1) * 2.4;
  scene.add(m);
  knots.push(m);
});

const pipeline = new THREE.RenderPipeline(renderer);          // (named PostProcessing before r183)
const scenePass = pass(scene, camera);
const sceneColor = scenePass.getTextureNode("output");
const glow = bloom(sceneColor, 1.2, 0.4, 0.6);               // strength, radius, threshold
pipeline.outputNode = sceneColor.add(glow);                  // effects are just node maths

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<label>strength <input type="range" min="0" max="3" step="0.01" value="1.2"></label>`;
ui.querySelector("input").oninput = (e) => (glow.strength.value = +e.target.value);
document.body.appendChild(ui);

renderer.setAnimationLoop((t) => {
  knots.forEach((k, i) => (k.rotation.y = t / 1500 + i));
  pipeline.render();                                         // instead of renderer.render
});
```

`three/addons/tsl/display/` has nodes for bloom, GTAO, SSR (screen-space reflections), SSGI, depth of field, motion blur, FXAA/SMAA/TRAA, outlines, film effects, LUTs and more.

## Should you switch?

| | `WebGLRenderer` (`"three"`) | `WebGPURenderer` (`"three/webgpu"`) |
|---|---|---|
| Browser support | everywhere, including old devices | WebGPU in all major browsers; automatic WebGL 2 fallback |
| Maturity | 15 years, every tutorial and library | production-ready, still evolving quickly |
| Custom shaders | GLSL `ShaderMaterial`, `onBeforeCompile` | TSL node materials (GLSL `ShaderMaterial` not supported) |
| Compute shaders | no (workarounds with render targets) | **yes** |
| Post-processing | `EffectComposer`, pmndrs `postprocessing` | TSL `RenderPipeline` |
| Ecosystem (R3F, drei, effects) | everything | R3F 9 supports it via an async `gl` prop; some drei helpers and effect libraries are WebGL-only |
| WebXR | yes | yes, since r185 |

A sensible 2026 strategy: build new **effect-heavy or simulation-heavy** projects (particles, fluids, generative art, large data) on WebGPU + TSL; keep **ecosystem-heavy** apps (R3F with many drei helpers, pmndrs post-processing) on WebGL until the libraries you depend on support WebGPU; and write new shader work in TSL either way, since it compiles for both.

:::tip Debugging WebGPU
Assign `renderer.inspector = new Inspector()` (from `three/addons/inspector/Inspector.js`) to get three.js's built-in inspector panel: frame timing, render and compute calls, and live parameter controls. TSL nodes can be sent to it with `.toInspector("label")` to preview intermediate textures.
:::

## Check yourself

```quiz
? What must you import WebGPURenderer and node materials from?
+ "three/webgpu"
- "three"
- "three/addons/webgpu.js"
> TSL functions come from "three/tsl".

? What happens on a browser without WebGPU?
+ WebGPURenderer falls back to a WebGL 2 backend automatically
- The page shows an error
- It renders with the CPU
> The same scene and TSL code run on both backends.

? In TSL, how do you write `a * b + c`?
+ a.mul(b).add(c)
- a * b + c inside a string
- mul(a, b, c)
> JavaScript can't overload operators, so TSL uses methods.

? What does a compute shader do?
+ Runs a function for every element of a GPU buffer in parallel, without drawing
- Compiles GLSL faster
- Computes the bounding box of a mesh
> Ideal for particles, physics and simulations.

? How does post-processing work with WebGPURenderer?
+ A RenderPipeline whose outputNode combines pass() textures with effect nodes like bloom()
- With EffectComposer and ShaderPass
- It doesn't support post-processing
> Effects are TSL nodes composed with maths.
```

:::exercise Colour by speed
In the compute example, make each particle's colour depend on its speed: replace the `colorNode` with a mix between blue (slow) and orange (fast) using `velocities.element(instanceIndex).length().mul(20).clamp(0, 1)` as the blend factor. Hint: import `mix` and `color` from `"three/tsl"`.
:::

:::solution
```js run
import * as THREE from "three/webgpu";
import { Fn, If, uniform, float, vec3, hash, instancedArray, instanceIndex, shapeCircle, mix, color } from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COUNT = 60000;
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
await renderer.init();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 10, 22);
new OrbitControls(camera, renderer.domElement);

const positions = instancedArray(COUNT, "vec3"), velocities = instancedArray(COUNT, "vec3");
const side = Math.sqrt(COUNT), half = float(side / 2);
renderer.compute(Fn(() => {
  const p = positions.element(instanceIndex);
  p.x = half.sub(instanceIndex.mod(side)).mul(0.25);
  p.z = half.sub(instanceIndex.div(side)).mul(0.25);
  p.y = hash(instanceIndex).mul(10);
})().compute(COUNT));
const update = Fn(() => {
  const p = positions.element(instanceIndex), v = velocities.element(instanceIndex);
  v.addAssign(vec3(0, -0.001, 0));
  p.addAssign(v);
  If(p.y.lessThan(0), () => { p.y = 0; v.y = v.y.negate().mul(0.85); });
})().compute(COUNT);

const material = new THREE.SpriteNodeMaterial();
material.positionNode = positions.toAttribute();
const speed = velocities.element(instanceIndex).length().mul(20).clamp(0, 1);
material.colorNode = mix(color("#3b82f6"), color("#f97316"), speed);   // blue when slow, orange when fast
material.scaleNode = float(0.12);
material.opacityNode = shapeCircle();
material.transparent = true;
const sprites = new THREE.Sprite(material);
sprites.count = COUNT;
sprites.frustumCulled = false;
scene.add(sprites);
renderer.setAnimationLoop(() => { renderer.compute(update); renderer.render(scene, camera); });
```
:::

:::keypoints
- **WebGPU** = lower overhead + **compute shaders**; three.js's `WebGPURenderer` falls back to WebGL 2 automatically.
- Import from `three/webgpu` and `three/tsl`; `await renderer.init()`.
- **TSL** writes shaders as JS calls (`a.mul(b)`, `mix`, `sin(time)`) and compiles to WGSL or GLSL; node materials expose `colorNode`, `positionNode`, `opacityNode`…
- `instancedArray` + `Fn(...)().compute(n)` + `renderer.compute()` run simulations on the GPU.
- Post-processing uses `RenderPipeline` with `pass()` and effect nodes such as `bloom()`.
- Adopt per project: WebGPU for simulation/effects-heavy work; WebGL where the ecosystem you need is WebGL-only.
:::
