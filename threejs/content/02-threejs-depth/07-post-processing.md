---
title: Post-Processing Effects
level: advanced
time: 35
summary: Image effects applied after rendering — bloom for glowing lights, outlines for selection, ambient occlusion for depth, anti-aliasing, and your own full-screen shader pass — with EffectComposer, plus what each effect costs.
---

Films are colour-graded after they're shot; 3D frames can be too. **Post-processing** renders the scene into an image first, then runs full-screen shader passes over it: glow around bright lights (bloom), outlines around selected objects, darkened creases (ambient occlusion), vignettes, film grain, colour grading. It's often the difference between "a 3D demo" and "a polished product".

:::def Post-processing
Rendering the scene to an off-screen image (a **render target**) and then processing that image with one or more full-screen **passes** before showing it. Each pass is a fragment shader that reads the previous image and writes a new one.
:::

:::def EffectComposer
Three.js's post-processing manager (`three/addons/postprocessing/EffectComposer.js`). You add passes in order (usually `RenderPass` first and `OutputPass` last) and call `composer.render()` instead of `renderer.render()`.
:::

## Bloom: make bright things glow

```js run title="Selective glow with UnrealBloomPass" level=intermediate height=440
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#05060f");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3, 9);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#6366f1", "#05060f", 0.6));

// dark, non-glowing objects…
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.3, metalness: 0.5 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
for (let i = 0; i < 8; i++) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 2 + (i % 3), 1), new THREE.MeshStandardMaterial({ color: "#1f2937" }));
  b.position.set(Math.cos(i) * 5, b.geometry.parameters.height / 2, Math.sin(i) * 4 - 2);
  scene.add(b);
}
// …and EMISSIVE ones with intensity > 1: only these exceed the bloom threshold
const neon = (color, intensity) => new THREE.MeshStandardMaterial({ color: "#000000", emissive: color, emissiveIntensity: intensity });
const rings = [];
["#22d3ee", "#f472b6", "#a3e635"].forEach((c, i) => {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 16, 100), neon(c, 4));
  ring.position.set((i - 1) * 2.4, 1.3, 0);
  scene.add(ring);
  rings.push(ring);
});
const tube = new THREE.Mesh(new THREE.BoxGeometry(8, 0.05, 0.05), neon("#fbbf24", 3));
tube.position.set(0, 0.03, 1.8);
scene.add(tube);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));                 // 1. draw the scene into an image
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.4, 1.0);   // strength, radius, threshold
composer.addPass(bloom);                                         // 2. blur & add back the bright parts
composer.addPass(new OutputPass());                              // 3. tone mapping + sRGB output

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = ["strength 0 3 0.9", "radius 0 1 0.4", "threshold 0 2 1"].map((s) => {
  const [k, min, max, v] = s.split(" ");
  return `<label>${k} <input data-k="${k}" type="range" min="${min}" max="${max}" step="0.01" value="${v}"></label>`;
}).join("") + `<label><input type="checkbox" id="on" checked> bloom on</label>`;
ui.oninput = (e) => { if (e.target.dataset.k) bloom[e.target.dataset.k] = +e.target.value; };
ui.querySelector("#on").onchange = (e) => (bloom.enabled = e.target.checked);
document.body.appendChild(ui);

renderer.setAnimationLoop((t) => {
  rings.forEach((r, i) => (r.rotation.y = t / 1000 + i));
  composer.render();                                             // instead of renderer.render
});
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});
```

:::tip Selective bloom without extra passes
Bloom picks up every pixel brighter than `threshold`. Set the threshold to about 1 and give only the parts that should glow an `emissiveIntensity` above 1 (or `toneMapped: false` with a bright colour). Everything else stays crisp. This "HDR threshold" approach is how most production scenes do selective bloom.
:::

## Outlines for selection

Digital twins, editors and configurators highlight the hovered or selected part with an outline. `OutlinePass` draws a glowing edge around any objects you put in its `selectedObjects` list:

```js run title="Hover outlines with OutlinePass" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e2e8f0");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(5, 5, 8);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#94a3b8", 1.8));
const sun = new THREE.DirectionalLight("#fff", 1.5);
sun.position.set(3, 6, 4);
scene.add(sun);

const parts = [];
const shapes = [new THREE.BoxGeometry(1, 1, 1), new THREE.CylinderGeometry(0.5, 0.5, 1.4, 32), new THREE.TorusKnotGeometry(0.4, 0.14, 100, 16), new THREE.SphereGeometry(0.6, 32, 16)];
for (let i = 0; i < 9; i++) {
  const m = new THREE.Mesh(shapes[i % 4], new THREE.MeshStandardMaterial({ color: "#94a3b8" }));
  m.position.set((i % 3 - 1) * 2, 0.7, (Math.floor(i / 3) - 1) * 2);
  scene.add(m);
  parts.push(m);
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const outline = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
outline.edgeStrength = 4;
outline.edgeThickness = 1.5;
outline.visibleEdgeColor.set("#10b981");
outline.hiddenEdgeColor.set("#0f766e");          // the outline also shows through objects in front
composer.addPass(outline);
composer.addPass(new OutputPass());

const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
renderer.domElement.addEventListener("pointermove", (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(parts)[0];
  outline.selectedObjects = hit ? [hit.object] : [];
  renderer.domElement.style.cursor = hit ? "pointer" : "auto";
});
outline.selectedObjects = [parts[4]];             // something highlighted from the start

renderer.setAnimationLoop((t) => {
  parts.forEach((p, i) => (p.rotation.y = t / 2000 + i));
  composer.render();
});
```

## Writing your own pass

A `ShaderPass` runs any fragment shader over the image. The previous pass's result arrives as the texture `tDiffuse`. This one adds three classic "lens" effects:

```js run title="Custom ShaderPass: vignette, chromatic aberration, grain" level=advanced
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#334155");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;
const { scene: helmet } = await new GLTFLoader().loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf");
scene.add(helmet);

const LensShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 1 }, uAberration: { value: 1 }, uGrain: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uAberration, uGrain;
    varying vec2 vUv;
    void main() {
      vec2 fromCenter = vUv - 0.5;
      // chromatic aberration: sample R, G and B slightly apart, more towards the edges
      vec2 shift = fromCenter * 0.012 * uAberration;
      vec3 col = vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b);
      // vignette: darken the corners
      col *= mix(1.0, smoothstep(0.85, 0.25, length(fromCenter)), uVignette);
      // film grain: per-pixel noise that changes every frame
      float n = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.08 * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const lens = new ShaderPass(LensShader);
composer.addPass(lens);
composer.addPass(new OutputPass());

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = ["Vignette", "Aberration", "Grain"].map((k) => `<label><input type="checkbox" data-k="u${k}" checked> ${k}</label>`).join("");
ui.onchange = (e) => (lens.uniforms[e.target.dataset.k].value = e.target.checked ? 1 : 0);
document.body.appendChild(ui);

renderer.setAnimationLoop((t) => {
  lens.uniforms.uTime.value = (t / 1000) % 100;
  controls.update();
  composer.render();
});
```

## Ambient occlusion and anti-aliasing

| Pass (`three/addons/postprocessing/`) | Effect | Cost |
|---|---|---|
| `UnrealBloomPass` | glow around bright pixels | medium (several blur passes) |
| `GTAOPass` / `SAOPass` / `SSAOPass` | ambient occlusion: darkens creases and contact points for depth | **high**; GTAO looks best |
| `OutlinePass` | outlines around selected objects | medium (extra renders of the selection) |
| `SMAAPass` / `FXAAPass` | anti-aliasing for the final image | low |
| `TAARenderPass` / `SSAARenderPass` | supersampled anti-aliasing for still images | high |
| `BokehPass` | depth of field (blurry background) | medium–high |
| `FilmPass`, `GlitchPass`, `DotScreenPass`, `HalftonePass`, `RenderPixelatedPass`, `AfterimagePass` | stylised looks | low–medium |
| `LUTPass` | colour grading with a lookup table from Photoshop/Resolve | low |
| `OutputPass` | tone mapping + colour-space conversion | always last |

:::warn Anti-aliasing and post-processing
The renderer's `antialias: true` only affects drawing to the screen. Once you render into a composer's render target, edges are jagged again. Fix it either with **MSAA on the render target** — `new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType }))` — or with an `SMAAPass`/`FXAAPass` near the end of the chain.
:::

## Performance and alternatives

Each pass processes **every pixel** of the screen at least once, and bloom or AO process them many times. On a 3× phone screen that adds up quickly. Guidelines:

- Use few passes, and render post-processing at a lower resolution where the effect is blurry anyway (bloom, AO).
- The **`postprocessing`** library by pmndrs merges compatible effects into a single pass (bloom + vignette + noise + tone mapping in one shader), which is significantly faster. It's what `@react-three/postprocessing` uses in R3F (Module 4).
- With the **WebGPU renderer**, post-processing is written as TSL nodes in a `RenderPipeline`, with built-in bloom, GTAO, SSR, DOF, motion blur and more (lesson 9).
- Disable expensive effects on low-end devices (drei's `PerformanceMonitor` in R3F detects that).

## Check yourself

```quiz
? With EffectComposer, what do you call each frame instead of renderer.render?
+ composer.render()
- composer.update()
- renderer.compose()
> The composer runs the RenderPass and all following passes.

? Which pass should usually be last?
+ OutputPass
- RenderPass
- UnrealBloomPass
> It applies tone mapping and converts to the output colour space.

? How do you make only some objects glow with UnrealBloomPass?
+ Set the threshold around 1 and give only those objects emissive intensity above 1
- Add them to bloom.selectedObjects
- Use a second scene for everything
> Bloom catches pixels brighter than the threshold.

? Edges look jagged after adding post-processing. Why?
+ The renderer's antialias doesn't apply to render targets; use MSAA samples or an SMAA/FXAA pass
- Bloom removes anti-aliasing on purpose
- The pixel ratio reset to 1
> Render targets need their own anti-aliasing.

? In a ShaderPass, what is `tDiffuse`?
+ The image produced by the previous pass
- The diffuse map of each material
- A noise texture
> Each pass reads the previous result and writes a new one.
```

:::exercise Grayscale with a highlight
Write a `ShaderPass` that turns the whole image grayscale (`dot(col, vec3(0.299, 0.587, 0.114))`), except pixels whose colour is "very green" (`g > r + 0.15 && g > b + 0.15`), which stay coloured. Apply it to the outline example's scene with one part painted bright green.
:::

:::solution
```js run
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#fde68a");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(5, 5, 8);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#94a3b8", 2.4));
for (let i = 0; i < 9; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: i === 4 ? "#22c55e" : new THREE.Color().setHSL(i / 9, 0.7, 0.5) }));
  m.position.set((i % 3 - 1) * 2, 0.5, (Math.floor(i / 3) - 1) * 2);
  scene.add(m);
}
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      bool green = c.g > c.r + 0.15 && c.g > c.b + 0.15;
      vec3 grey = vec3(dot(c, vec3(0.299, 0.587, 0.114)));
      gl_FragColor = vec4(green ? c : grey, 1.0);
    }`,
}));
composer.addPass(new OutputPass());
renderer.setAnimationLoop(() => composer.render());
```
:::

:::keypoints
- Post-processing renders to an image, then applies full-screen **passes**: `RenderPass` → effects → `OutputPass`.
- **Bloom** with an HDR threshold gives selective glow; **OutlinePass** highlights selections; **GTAO** adds contact depth.
- Write custom effects with `ShaderPass` reading `tDiffuse`.
- Re-add anti-aliasing (MSAA samples or SMAA/FXAA) and keep the pass count low; every pass touches every pixel.
- For speed, use pmndrs `postprocessing` (merged effects) in R3F, or TSL `RenderPipeline` with WebGPU.
:::
