---
title: How 3D Graphics Work
level: easy
time: 20
summary: What actually happens between your JavaScript and the pixels. Vertices and triangles, the GPU pipeline, the 3D coordinate system, frame budgets, draw calls, and where WebGL, WebGPU and Three.js fit.
---

Before writing more Three.js, it pays to know what the library does for you. Every 3D image you have ever seen in a browser, game or film is built from the same few ideas: points in space, triangles between them, and a program on the graphics card that decides each pixel's colour. Once you can picture those, Three.js's API stops feeling like magic and starts feeling obvious.

## Everything is triangles

:::def Vertex
A point in 3D space, stored as three numbers `(x, y, z)`. A vertex can also carry extra data: a **normal** (which way the surface faces), **UV** coordinates (where it sits on a texture) and a colour.
:::

:::def Triangle (face)
Three vertices joined into a flat surface. GPUs only draw points, lines and triangles, so every shape (a sphere, a car, a face) is approximated by many small triangles. More triangles mean smoother curves and more work.
:::

Here is the smallest possible "model": one triangle made from three vertices, each with its own colour. The GPU **interpolates** (blends) the colours across the surface.

```js run title="One triangle, three vertices" level=easy
import * as THREE from "three";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 3;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const geometry = new THREE.BufferGeometry();
// 3 vertices × (x, y, z) — a flat array the GPU can copy in one go
const positions = new Float32Array([
  -1, -0.8, 0,     // bottom left
   1, -0.8, 0,     // bottom right
   0,  0.9, 0,     // top
]);
const colors = new Float32Array([
  1, 0.2, 0.3,     // red-ish
  0.2, 0.8, 0.4,   // green-ish
  0.3, 0.4, 1,     // blue-ish
]);
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const triangle = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
scene.add(triangle);

renderer.setAnimationLoop((t) => {
  triangle.rotation.y = Math.sin(t / 1000) * 0.8;   // t = milliseconds since start
  renderer.render(scene, camera);
});
```

Every mesh you'll ever load, from a cube to a 2-million-triangle scan, is that same structure: arrays of vertex data plus (optionally) a list saying which vertices form each triangle.

## Seeing the triangles

Smooth-looking shapes are just *lots* of triangles. Drag the slider to change how many segments the sphere uses, and watch the triangle count and the curve quality.

```js run title="Smoothness costs triangles" level=easy
import * as THREE from "three";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 3.2;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight("#ffffff", "#334155", 2));
const solid = new THREE.Mesh(undefined, new THREE.MeshStandardMaterial({ color: "#34d399", flatShading: true }));
const wire = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ color: "#0f172a", wireframe: true }));
solid.position.x = -0.9;
wire.position.x = 0.9;
scene.add(solid, wire);

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<label>Segments <input type="range" min="3" max="64" value="8"></label><span class="muted"></span>`;
document.body.appendChild(ui);
const slider = ui.querySelector("input");

function rebuild() {
  const n = +slider.value;
  const geo = new THREE.SphereGeometry(0.75, n, Math.max(2, Math.round(n / 2)));
  solid.geometry.dispose?.();                    // free the old GPU buffers
  solid.geometry = wire.geometry = geo;
  const tris = geo.index.count / 3;
  ui.querySelector("span").textContent = `${tris.toLocaleString()} triangles`;
}
slider.oninput = rebuild;
rebuild();

renderer.setAnimationLoop((t) => {
  solid.rotation.y = wire.rotation.y = t / 2000;
  renderer.render(scene, camera);
});
```

`flatShading` makes each triangle a single colour so you can see the facets; without it, three.js smooths the lighting across triangles using the vertex **normals**, which hides the edges even at low counts.

## The GPU pipeline in one picture

:::flow What happens every frame
Your JavaScript | updates positions, rotations, colours
Draw calls | three.js tells the GPU "draw this mesh with this material"
Vertex shader | runs once per vertex: moves it to screen space
Rasterization | turns each triangle into the pixels it covers
Fragment shader | runs once per pixel: decides its colour (light, textures)
Frame on screen | repeat 60–120 times a second
:::

:::def Shader
A small program that runs **on the GPU**, massively in parallel. The **vertex shader** positions vertices; the **fragment shader** (also called pixel shader) colours pixels. Three.js writes these for you from its materials. You can write your own later (Module 2).
:::

:::def Draw call
One instruction from the CPU to the GPU: "draw this geometry with this material". Each visible mesh usually costs at least one. Draw calls have a fixed overhead, so 1,000 tiny meshes are often slower than one mesh with 1,000× the triangles. Instancing and merging (Module 2) exist to cut draw calls.
:::

:::analogy
The CPU is a manager handing out jobs; the GPU is a factory with thousands of workers. Each **draw call** is one job ticket. Workers are incredibly fast at the job itself (shading millions of pixels), but walking a ticket over to the factory takes time. A thousand tickets for a thousand small parts wastes the day; one ticket that says "make a thousand of these" keeps the factory busy.
:::

## The 3D coordinate system

Three.js uses a **right-handed** coordinate system with **Y pointing up**:

| Axis | Direction | Colour in helpers |
|---|---|---|
| **x** | to the right | red |
| **y** | up | green |
| **z** | towards you, out of the screen | blue |

By convention **1 unit = 1 metre**. Three.js doesn't enforce units, but physics engines, glTF models and WebXR all assume metres, so stick to it: a door is about 2 units tall, a phone 0.15.

```js run title="Axes, grid and units" level=easy
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(4, 3, 5);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
new OrbitControls(camera, renderer.domElement);   // drag to orbit, scroll to zoom

scene.add(new THREE.AxesHelper(2));                // red = x, green = y, blue = z
scene.add(new THREE.GridHelper(10, 10));           // 10 m × 10 m floor, 1 m squares
scene.add(new THREE.HemisphereLight("#ffffff", "#444466", 2.5));

// a 1.8 m tall "person" (a capsule) standing at x = 1, z = 1
const person = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.25, 1.3, 8, 16),
  new THREE.MeshStandardMaterial({ color: "#818cf8" })
);
person.position.set(1, 0.9, 1);                    // the capsule's centre is half its height up
scene.add(person);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
```

:::tip Right hand rule
Hold up your right hand: thumb = x (right), index finger = y (up), middle finger bent towards you = z. Positive rotations go **counter-clockwise** when you look down an axis towards the origin.
:::

## The frame budget

| Refresh rate | Time per frame | Where you meet it |
|---|---|---|
| 30 Hz | 33.3 ms | low-end phones under load |
| 60 Hz | 16.7 ms | most laptops and phones |
| 90 Hz | 11.1 ms | Meta Quest, most VR headsets |
| 120 Hz | 8.3 ms | modern phones, Quest 3 high mode, ProMotion |

Everything (your JavaScript, physics, three.js's work and the GPU's drawing) must fit in that window, or frames drop. In VR, dropped frames make people feel sick, so the budget is strict. You can read the renderer's statistics to see what each frame costs:

```js run title="Measuring a frame" level=intermediate
import * as THREE from "three";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 30);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#335", 2));

// 500 separate meshes = 500 draw calls
const geo = new THREE.IcosahedronGeometry(0.5, 1);
const mat = new THREE.MeshStandardMaterial({ color: "#f472b6" });
for (let i = 0; i < 500; i++) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 20);
  scene.add(m);
}

const hud = document.createElement("div");
hud.className = "overlay";
document.body.appendChild(hud);

let frames = 0, last = performance.now();
renderer.setAnimationLoop((now) => {
  scene.rotation.y = now / 4000;
  renderer.render(scene, camera);
  frames++;
  if (now - last > 1000) {
    const { calls, triangles } = renderer.info.render;     // stats for the last frame
    hud.innerHTML = `<b>${frames} fps</b><span>${calls} draw calls · ${triangles.toLocaleString()} triangles</span>`;
    frames = 0; last = now;
  }
});
```

You'll make this exact scene 50× cheaper with `InstancedMesh` in Module 2, turning 500 draw calls into 1.

## Where WebGL, WebGPU and Three.js fit

| Layer | What it is | You write |
|---|---|---|
| GPU + driver | the hardware | nothing |
| WebGL 2 / WebGPU | browser APIs to talk to the GPU | buffers, shaders, pipelines (hundreds of lines per triangle) |
| **Three.js** | a scene graph + materials + loaders on top | `new Mesh(geometry, material)` |
| React Three Fiber | Three.js as React components | `<mesh><boxGeometry /></mesh>` |
| Your app | configurator, game, twin… | the fun part |

Three.js ships two renderers. **`WebGLRenderer`** (from `"three"`) works everywhere and is what most code and tutorials use. **`WebGPURenderer`** (from `"three/webgpu"`) uses WebGPU when available, falls back to WebGL 2 automatically, and unlocks compute shaders and the TSL shading language. Module 2 has a full lesson on it. Everything in Module 1 works the same with both.

:::note Why the triangle example uses a `Float32Array`
GPUs read raw binary memory, not JavaScript objects. A typed array is a flat block of numbers that can be uploaded to the GPU without conversion. That's why three.js geometry is called **Buffer**Geometry: it is a set of buffers ready for the GPU.
:::

## Check yourself

```quiz
? Which primitive does the GPU use to draw solid surfaces?
+ Triangles
- Squares
- Spheres
> Every surface is broken into triangles; quads and curves are approximations.

? What does the fragment shader decide?
- Where each vertex goes
+ The colour of each pixel a triangle covers
- How many draw calls happen
> Vertex shader → position; fragment shader → colour.

? In three.js, which way does the positive Y axis point?
+ Up
- Into the screen
- To the right
> Y is up, X is right, Z points towards the viewer.

? Why can 1,000 small meshes be slower than one big mesh with the same triangles?
+ Each mesh costs at least one draw call, and draw calls have a fixed overhead
- Small meshes use more memory per triangle
- The GPU can't draw small meshes
> The CPU→GPU handoff per draw call is the bottleneck, not the triangles.

? How long is one frame at 90 Hz (a typical VR headset)?
- 16.7 ms
+ 11.1 ms
- 33 ms
> 1000 ms / 90 ≈ 11.1 ms.
```

:::exercise Make a square from two triangles
Change the first example so it draws a **square** instead of a triangle. You'll need 6 vertices (two triangles), or 4 vertices plus an **index** with `geometry.setIndex([0, 1, 2, 2, 1, 3])`.
:::

:::solution
```js run
import * as THREE from "three";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 3;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
  -1, -1, 0,   1, -1, 0,   -1, 1, 0,   1, 1, 0,      // 4 corners
]), 3));
geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array([
  1, 0.2, 0.3,   0.2, 0.8, 0.4,   0.3, 0.4, 1,   1, 0.8, 0.2,
]), 3));
geometry.setIndex([0, 1, 2, 2, 1, 3]);               // two triangles share 2 corners

const square = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
scene.add(square);
renderer.setAnimationLoop((t) => {
  square.rotation.y = Math.sin(t / 1000) * 0.8;
  renderer.render(scene, camera);
});
```
With an index, shared corners are stored once: 4 vertices instead of 6. Real models save a lot of memory this way.
:::

:::keypoints
- Every 3D surface is **triangles** made of **vertices**; vertices carry position, normal, UV and colour data.
- Each frame: JavaScript updates → **draw calls** → vertex shader → rasterization → fragment shader → pixels.
- Three.js is **right-handed, Y-up**, and by convention **1 unit = 1 metre**.
- Your whole frame must fit the **budget**: 16.7 ms at 60 Hz, 11.1 ms in VR.
- Fewer draw calls usually beats fewer triangles; `renderer.info` shows both.
:::
