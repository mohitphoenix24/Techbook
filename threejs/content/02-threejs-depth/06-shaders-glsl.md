---
title: Shaders with GLSL
level: advanced
time: 45
summary: Writing your own vertex and fragment shaders with ShaderMaterial, uniforms, attributes and varyings, animating with time, drawing patterns with math, displacing geometry on the GPU, a Fresnel hologram effect, and extending built-in materials with onBeforeCompile.
---

Every material you've used so far is a pair of shader programs three.js wrote for you. Writing your own unlocks effects the built-ins can't do: water, holograms, dissolves, procedural patterns, heat maps, and animating a million vertices for free. Shaders look intimidating because they run per pixel in a C-like language, but the core idea is small: **a function that receives a few inputs and returns a position or a colour**, run in parallel millions of times.

:::def GLSL
The OpenGL Shading Language, the C-like language WebGL shaders are written in. It has vector and matrix types built in (`vec2`, `vec3`, `vec4`, `mat4`) and fast math functions (`sin`, `mix`, `smoothstep`, `dot`, `length`…). WebGPU uses **WGSL**; three.js's new **TSL** (lesson 9) writes either for you from JavaScript.
:::

:::def Uniform, attribute, varying
Three kinds of shader inputs. A **uniform** is the same for every vertex and pixel in a draw (time, colour, mouse position). An **attribute** is per vertex (position, normal, uv). A **varying** is a value the vertex shader passes to the fragment shader, interpolated across each triangle.
:::

## The smallest ShaderMaterial

```js run title="A gradient that moves with time" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 3;

const material = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color("#4f46e5") },
    uColorB: { value: new THREE.Color("#10b981") },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;                       // sent to the fragment shader
    void main() {
      vUv = uv;                             // 'uv' and 'position' attributes are provided by three.js
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColorA, uColorB;
    varying vec2 vUv;                       // interpolated per pixel
    void main() {
      float t = 0.5 + 0.5 * sin(vUv.x * 6.0 + uTime * 2.0);   // a wave travelling across u
      vec3 color = mix(uColorA, uColorB, t * vUv.y);
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>        // convert to the renderer's output colour space
    }`,
});
const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), material);
scene.add(plane);

renderer.setAnimationLoop((t) => {
  material.uniforms.uTime.value = t / 1000;     // the ONLY thing JavaScript does per frame
  renderer.render(scene, camera);
});
```

:::flow What runs where
JavaScript (CPU) | sets uniforms once per frame: uTime, colours
Vertex shader | once per vertex: computes gl_Position, writes varyings
Rasterizer | interpolates varyings across each triangle
Fragment shader | once per pixel: computes gl_FragColor
:::

`ShaderMaterial` adds handy built-ins automatically: the matrices (`projectionMatrix`, `modelViewMatrix`, `modelMatrix`, `viewMatrix`, `normalMatrix`), `cameraPosition`, and the attributes `position`, `normal` and `uv`. `RawShaderMaterial` adds nothing, for when you want full control.

## GLSL cheat sheet

```glsl
float a = 1.0;               // floats need the decimal point: 1 is an int and won't mix with floats
vec2 uv = vec2(0.5, 0.5);
vec3 c = vec3(1.0, 0.5, 0.0);
vec4 p = vec4(c, 1.0);       // build bigger vectors from smaller ones
c.rgb; c.xy; p.xyz;          // "swizzling": read components by name (xyzw = rgba = stpq)

mix(a, b, t)                 // lerp: a*(1-t) + b*t
step(edge, x)                // 0.0 if x < edge else 1.0  — a hard threshold
smoothstep(e0, e1, x)        // smooth 0→1 between e0 and e1 — soft edges, anti-aliasing
fract(x)                     // fractional part: repeats patterns (fract(uv * 10.0) = 10 tiles)
length(v), distance(a, b)    // circles: length(uv - 0.5) is the distance from the centre
dot(a, b), normalize(v), cross(a, b), reflect(i, n)
clamp(x, lo, hi), abs, sin, cos, pow, min, max, mod
```

:::tip Think in 0 → 1
Most shader patterns are built from UV coordinates (0 → 1 across the surface) and functions that map 0–1 to 0–1. `step` makes hard edges, `smoothstep` soft ones, `fract` repeats, `sin` oscillates, `length` makes circles, `mix` blends colours. The Book of Shaders (thebookofshaders.com) is the classic free guide.
:::

## Patterns from math

Pick a pattern, then move the mouse over the plane: the mouse position is a `vec2` uniform.

```js run title="Procedural patterns" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);   // a full-screen quad needs no perspective

const material = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uMode: { value: 0 }, uAspect: { value: innerWidth / innerHeight } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uTime, uAspect;
    uniform vec2 uMouse;
    uniform int uMode;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv; p.x *= uAspect;                       // square pixels
      vec2 m = uMouse; m.x *= uAspect;
      vec3 col;
      if (uMode == 0) {                                   // stripes
        float s = step(0.5, fract(p.x * 12.0 + uTime * 0.5));
        col = mix(vec3(0.06, 0.09, 0.16), vec3(0.2, 0.83, 0.6), s);
      } else if (uMode == 1) {                            // grid lines with smooth edges
        vec2 g = abs(fract(p * 10.0) - 0.5);
        float line = 1.0 - smoothstep(0.0, 0.04, min(g.x, g.y));
        col = mix(vec3(0.02, 0.03, 0.08), vec3(0.5, 0.55, 1.0), line);
      } else if (uMode == 2) {                            // ripples from the mouse
        float d = distance(p, m);
        col = vec3(0.5 + 0.5 * sin(d * 60.0 - uTime * 6.0)) * vec3(0.3, 0.7, 1.0) * smoothstep(0.9, 0.0, d);
      } else {                                            // glowing spotlight following the mouse
        float d = distance(p, m);
        col = vec3(1.0, 0.6, 0.2) * 0.02 / d + vec3(0.03, 0.02, 0.08);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

addEventListener("pointermove", (e) => material.uniforms.uMouse.value.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight));
const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<div class="row">${["Stripes", "Grid", "Ripples", "Glow"].map((n, i) => `<button data-m="${i}">${n}</button>`).join("")}</div>`;
ui.onclick = (e) => e.target.dataset.m && (material.uniforms.uMode.value = +e.target.dataset.m);
document.body.appendChild(ui);

renderer.setAnimationLoop((t) => {
  material.uniforms.uTime.value = t / 1000;
  renderer.render(scene, camera);
});
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); material.uniforms.uAspect.value = innerWidth / innerHeight; });
```

Every pixel runs the same program at the same time, so a shader can't "look at" its neighbours or remember the previous frame on its own; everything must be computed from the inputs. That constraint is exactly what makes GPUs so fast.

## Moving vertices on the GPU

The vertex shader can change `position` before projecting it. Displacing along the **normal** inflates and wobbles a sphere; with a uniform for time it animates with zero JavaScript cost per vertex. Compare this with the CPU flag in Module 1, which recomputed every vertex in JavaScript:

```js run title="A wobbling blob — vertex displacement" level=advanced
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1020");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4.5;
new OrbitControls(camera, renderer.domElement);

const material = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uAmp: { value: 0.25 } },
  vertexShader: /* glsl */ `
    uniform float uTime, uAmp;
    varying float vDisp;
    varying vec3 vNormal;
    void main() {
      // three overlapping waves give an organic, noise-like wobble
      float d = sin(position.x * 3.0 + uTime) * sin(position.y * 4.0 + uTime * 1.3) * sin(position.z * 3.5 + uTime * 0.7);
      vDisp = d;
      vec3 displaced = position + normal * d * uAmp;      // push along the normal
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying float vDisp;
    varying vec3 vNormal;
    void main() {
      vec3 base = mix(vec3(0.31, 0.27, 0.9), vec3(0.06, 0.73, 0.5), vDisp * 0.5 + 0.5);   // colour by displacement
      float light = 0.45 + 0.55 * max(dot(vNormal, normalize(vec3(0.5, 0.8, 0.6))), 0.0); // a simple directional light
      gl_FragColor = vec4(base * light, 1.0);
      #include <colorspace_fragment>
    }`,
});
const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 64), material);   // 80k triangles, all moved on the GPU
scene.add(blob);

const ui = document.createElement("label");
ui.className = "overlay";
ui.innerHTML = `<span>amplitude <input type="range" min="0" max="0.6" step="0.01" value="0.25"></span>`;
ui.querySelector("input").oninput = (e) => (material.uniforms.uAmp.value = +e.target.value);
document.body.appendChild(ui);

renderer.setAnimationLoop((t) => {
  material.uniforms.uTime.value = t / 1000;
  renderer.render(scene, camera);
});
```

The normals still describe the *undisplaced* sphere, so lighting is approximate. That's fine for stylised looks; exact normals need recomputing them in the shader from neighbouring points (or a normal map).

## A Fresnel hologram

The **Fresnel effect** makes surfaces reflect more at grazing angles: the edges of a soap bubble glow. In shaders it's a one-liner using the angle between the surface normal and the view direction, and it's the base of hologram, force-field and "selected object" effects:

```js run title="Hologram material (Fresnel + scan lines)" level=advanced
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#020617");
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.4, 3.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;

const hologram = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#22d3ee") } },
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    varying vec3 vNormalW, vPosW;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vPosW = world.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * world;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec3 vNormalW, vPosW;
    void main() {
      vec3 viewDir = normalize(cameraPosition - vPosW);
      vec3 n = gl_FrontFacing ? vNormalW : -vNormalW;
      float fresnel = pow(1.0 - abs(dot(viewDir, n)), 2.0);            // 0 facing you, 1 at the edges
      float scan = step(0.5, fract(vPosW.y * 40.0 - uTime * 2.0)) * 0.25; // moving horizontal lines
      float flicker = 0.9 + 0.1 * sin(uTime * 30.0);
      float alpha = (fresnel * 1.2 + scan) * flicker;
      gl_FragColor = vec4(uColor * alpha, alpha);
      #include <colorspace_fragment>
    }`,
});

const { scene: helmet } = await new GLTFLoader().loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf");
helmet.traverse((o) => { if (o.isMesh) o.material = hologram; });     // replace every material
scene.add(helmet);
const base = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), new THREE.MeshBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.6 }));
base.rotation.x = -Math.PI / 2;
base.position.y = -1.1;
scene.add(base);

renderer.setAnimationLoop((t) => {
  hologram.uniforms.uTime.value = t / 1000;
  controls.update();
  renderer.render(scene, camera);
});
```

## Extending built-in materials: onBeforeCompile

Writing lighting, shadows and PBR from scratch is a lot of work. Often you want a *standard* material with one twist. `onBeforeCompile` lets you inject code into three.js's own shader before it compiles. Three.js shaders are assembled from named chunks (`#include <begin_vertex>`, `#include <color_fragment>`…), and you replace a chunk with your version:

```js run title="Twist a MeshStandardMaterial without losing PBR lighting" level=advanced
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1e293b");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 7);
new OrbitControls(camera, renderer.domElement);

const uniforms = { uTime: { value: 0 }, uTwist: { value: 1.2 } };
const material = new THREE.MeshStandardMaterial({ color: "#f59e0b", metalness: 0.6, roughness: 0.25 });
material.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, uniforms);              // share our uniforms with three.js's shader
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>
      uniform float uTime, uTwist;
      mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }`)
    .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
      float angle = position.y * uTwist * sin(uTime);
      objectNormal.xz = rot(angle) * objectNormal.xz;    // rotate the normal too, so lighting stays right`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      transformed.xz = rot(angle) * transformed.xz;      // twist around the Y axis by height`);
};
const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1, 8, 64, 8), material);
scene.add(bar);

renderer.setAnimationLoop((t) => {
  uniforms.uTime.value = t / 1000;
  renderer.render(scene, camera);
});
```

:::warn onBeforeCompile is fragile
It depends on chunk names inside three.js, which occasionally change between releases, and the material must also cast correct shadows (that needs a matching `customDepthMaterial`). For heavy customisation, the community library **three-custom-shader-material** wraps this safely, and **TSL node materials** (lesson 9) are the officially supported way forward: you set `material.positionNode` or `colorNode` instead of string-patching GLSL.
:::

## Debugging shaders

- A compile error appears in the console with the line number of the **generated** shader. Read the message, then search your code for the variable it names.
- Output values as colours to "print" them: `gl_FragColor = vec4(vUv, 0.0, 1.0);` shows UVs; `vec4(vNormal * 0.5 + 0.5, 1.0)` shows normals.
- Mixing ints and floats (`1` vs `1.0`) is the most common GLSL error.
- Browser tools: **Spector.js** captures a frame and shows every draw call, shader and uniform.

:::ai
Shaders are where AI coding assistants help most and hurt most: they write plausible GLSL quickly, but small mistakes (int/float mixups, wrong coordinate space) produce black screens. Ask for small pieces, test each visually with the "output as colour" trick, and keep a library of working snippets. Shader-generation from text prompts is also an active research area for procedural materials.
:::

## Check yourself

```quiz
? Which shader decides the final colour of each pixel?
- The vertex shader
+ The fragment shader
- The uniform shader
> The vertex shader positions vertices; the fragment shader colours pixels.

? You want the elapsed time available in a shader. What do you use?
+ A uniform updated from JavaScript each frame
- An attribute
- A varying
> Uniforms are the same for every vertex/pixel and set from JS.

? What does `fract(vUv.x * 10.0)` produce?
+ A sawtooth that repeats 10 times across the surface
- A single smooth gradient
- Ten random numbers
> fract keeps only the decimal part, so it repeats.

? What is the Fresnel term based on?
+ The angle between the surface normal and the direction to the camera
- The distance to the light
- The UV coordinates
> Edges (normal perpendicular to view) glow.

? Why use onBeforeCompile instead of a ShaderMaterial for a twist effect?
+ To keep three.js's PBR lighting, shadows and environment while changing only the vertex positions
- It's faster to compile
- ShaderMaterial can't move vertices
> You patch one chunk instead of rewriting the whole lighting model.
```

:::exercise Dissolve effect
Write a `ShaderMaterial` for a sphere that "dissolves": in the fragment shader, compute a pattern from `vUv` (e.g. `fract(sin(dot(floor(vUv * 40.0), vec2(12.9898, 78.233))) * 43758.5453)` gives a blocky random value), `discard` pixels below a `uProgress` uniform, and colour pixels just above the threshold bright orange (the burning edge). Drive `uProgress` with a slider.
:::

:::solution
```js run
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0f172a");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 3.5;

const material = new THREE.ShaderMaterial({
  uniforms: { uProgress: { value: 0.3 } },
  side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uProgress;
    varying vec2 vUv;
    float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float n = rand(floor(vUv * vec2(80.0, 40.0)));
      if (n < uProgress) discard;                               // gone
      float edge = 1.0 - smoothstep(0.0, 0.06, n - uProgress);  // 1 right at the threshold
      vec3 col = mix(vec3(0.55, 0.6, 0.7), vec3(1.0, 0.45, 0.05) * 3.0, edge);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
scene.add(sphere);
const ui = document.createElement("label");
ui.className = "overlay";
ui.innerHTML = `<span>dissolve <input type="range" min="0" max="1" step="0.005" value="0.3"></span>`;
ui.querySelector("input").oninput = (e) => (material.uniforms.uProgress.value = +e.target.value);
document.body.appendChild(ui);
renderer.setAnimationLoop((t) => { sphere.rotation.y = t / 3000; renderer.render(scene, camera); });
```
:::

:::keypoints
- Shaders are small GPU programs: the **vertex** shader positions vertices, the **fragment** shader colours pixels.
- Inputs: **uniforms** (per draw), **attributes** (per vertex), **varyings** (vertex → fragment).
- Build patterns from UVs with `fract`, `step`, `smoothstep`, `mix`, `length`, `sin`; animate with a time uniform.
- Displace geometry in the vertex shader for free per-vertex animation; Fresnel gives rim glows and holograms.
- Extend built-in materials with `onBeforeCompile` (or CSM / TSL) to keep PBR lighting; end GLSL fragment shaders with `#include <colorspace_fragment>`.
:::
