---
title: Particles & Point Clouds
level: intermediate
time: 30
summary: Drawing tens of thousands of points in one draw call with THREE.Points, sizes, sprites and additive blending, a galaxy generator, animating particles every frame, per-particle colours and sizes, and visualising point-cloud data from scanners and LiDAR.
---

Stars, snow, sparks, dust, rain, magic, fireworks, data points and laser scans all have one thing in common: they're **many small dots**. Drawing each as a mesh would cost one draw call per dot. `THREE.Points` draws all of them in a **single** draw call, so 100,000 particles run smoothly even on a phone.

:::def THREE.Points
An object that renders each vertex of a geometry as a screen-facing square (a **point sprite**) instead of joining vertices into triangles. Combined with `PointsMaterial` (size, colour, texture, transparency), it's the basis of particle effects and point-cloud viewers.
:::

## Your first particle field

```js run title="20,000 stars in one draw call" level=easy
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#020617");
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.z = 8;
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

const COUNT = 20000;
const positions = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  // random points inside a sphere of radius 50 (rejection-free: random direction × cube-root radius)
  const r = 50 * Math.cbrt(Math.random());
  const v = new THREE.Vector3().randomDirection().multiplyScalar(r);
  positions.set([v.x, v.y, v.z], i * 3);
}
const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
  color: "#e0e7ff",
  size: 0.08,
  sizeAttenuation: true,        // farther points look smaller (false = fixed pixel size)
}));
scene.add(stars);

const hud = document.createElement("div");
hud.className = "overlay";
document.body.appendChild(hud);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  hud.textContent = `${COUNT.toLocaleString()} points · ${renderer.info.render.calls} draw call`;
});
```

## Round, glowing particles

By default each point is a hard square. Three settings turn squares into soft glows:

| Setting | Effect |
|---|---|
| `map` (+ `alphaMap`) | a texture drawn on every point, e.g. a soft white disc |
| `transparent: true`, `depthWrite: false` | particles don't hide each other in an ugly, order-dependent way |
| `blending: THREE.AdditiveBlending` | overlapping particles **add** their light, so dense areas glow brighter (fire, magic, galaxies) |
| `vertexColors: true` | a per-particle colour from a `color` attribute |

## A galaxy generator

This is a classic exercise (popularised by Bruno Simon's *Three.js Journey*) because it combines everything: math for placement, per-particle colours, additive blending and a soft sprite. Play with the parameters:

```js run title="Galaxy generator" level=intermediate height=460
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#030014");
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(3, 3.5, 5);
new OrbitControls(camera, renderer.domElement);

// a soft round sprite drawn on a canvas
const c = document.createElement("canvas");
c.width = c.height = 64;
const ctx = c.getContext("2d");
const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
g.addColorStop(0, "rgba(255,255,255,1)");
g.addColorStop(0.3, "rgba(255,255,255,0.6)");
g.addColorStop(1, "rgba(255,255,255,0)");
ctx.fillStyle = g;
ctx.fillRect(0, 0, 64, 64);
const sprite = new THREE.CanvasTexture(c);

const params = { count: 60000, radius: 5, branches: 4, spin: 1.2, randomness: 0.35, inside: "#ff8a3d", outside: "#5b6cff" };
let galaxy = null;

function generate() {
  if (galaxy) { galaxy.geometry.dispose(); scene.remove(galaxy); }
  const pos = new Float32Array(params.count * 3), col = new Float32Array(params.count * 3);
  const inside = new THREE.Color(params.inside), outside = new THREE.Color(params.outside), mixed = new THREE.Color();
  for (let i = 0; i < params.count; i++) {
    const r = Math.random() ** 1.6 * params.radius;                  // more stars near the centre
    const branch = ((i % params.branches) / params.branches) * Math.PI * 2;
    const spin = r * params.spin;                                     // farther out = more twisted
    const jitter = () => (Math.random() - 0.5) ** 3 * 8 * params.randomness * (r * 0.4 + 0.3);
    pos[i * 3] = Math.cos(branch + spin) * r + jitter();
    pos[i * 3 + 1] = jitter() * 0.5;
    pos[i * 3 + 2] = Math.sin(branch + spin) * r + jitter();
    mixed.lerpColors(inside, outside, r / params.radius);
    col.set([mixed.r, mixed.g, mixed.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  galaxy = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.05, map: sprite, vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(galaxy);
}
generate();

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = [["count", 1000, 200000, 1000], ["branches", 2, 8, 1], ["spin", -3, 3, 0.1], ["randomness", 0, 1, 0.01]]
  .map(([k, min, max, step]) => `<label>${k} <input data-k="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${params[k]}"></label>`).join("")
  + `<div class="row"><input type="color" data-k="inside" value="${params.inside}"><input type="color" data-k="outside" value="${params.outside}"></div>`;
document.body.appendChild(ui);
ui.onchange = (e) => {
  const k = e.target.dataset.k;
  params[k] = e.target.type === "color" ? e.target.value : +e.target.value;
  generate();                                             // rebuild on release (generation is too heavy for every input event)
};

renderer.setAnimationLoop((t) => {
  galaxy.rotation.y = t / 12000;
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

:::warn Additive blending needs a dark background
Adding light on top of white stays white, so additive particles vanish on light backgrounds. Use them over dark scenes, or switch to normal blending with a coloured sprite in light themes.
:::

## Animating particles every frame

To move particles, change the `position` buffer and set `needsUpdate`. This snowfall keeps each flake's velocity in a separate array and wraps flakes back to the top:

```js run title="Snowfall with wind" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0f172a");
scene.fog = new THREE.Fog("#0f172a", 5, 22);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 8);

const COUNT = 15000, W = 20, H = 12;
const pos = new Float32Array(COUNT * 3), vel = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  pos[i * 3] = (Math.random() - 0.5) * W;
  pos[i * 3 + 1] = Math.random() * H - 2;
  pos[i * 3 + 2] = (Math.random() - 0.5) * W;
  vel[i] = 0.4 + Math.random() * 0.9;                 // fall speed in m/s
}
const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));   // hint: updated often
const flake = new THREE.TextureLoader().load("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/sprites/snowflake2.png");
flake.colorSpace = THREE.SRGBColorSpace;
const snow = new THREE.Points(geo, new THREE.PointsMaterial({
  color: "#f8fafc", size: 0.12, map: flake, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending,       // the sprite is white-on-black: adding it makes the black vanish
}));
scene.add(snow);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: "#1e293b" }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -2;
scene.add(ground);

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.05), time = timer.getElapsed();
  const wind = Math.sin(time * 0.4) * 0.8;
  for (let i = 0; i < COUNT; i++) {
    const ix = i * 3;
    pos[ix + 1] -= vel[i] * dt;
    pos[ix] += (wind + Math.sin(time * 2 + i) * 0.2) * dt;           // drift and flutter
    if (pos[ix + 1] < -2) { pos[ix + 1] = H - 2; pos[ix] = (Math.random() - 0.5) * W; }
  }
  geo.attributes.position.needsUpdate = true;
  camera.position.x = Math.sin(time * 0.1) * 2;
  camera.lookAt(0, 1, 0);
  renderer.render(scene, camera);
});
```

The JavaScript loop is fine for tens of thousands of particles. For hundreds of thousands or millions, move the motion into a **vertex shader** (next lessons) or a **compute shader** with WebGPU, where the GPU updates every particle in parallel.

## Point clouds: real data as particles

LiDAR scanners on cars and robots, photogrammetry, terrestrial laser scanners and depth cameras all produce **point clouds**: millions of measured 3D points, often with colour or intensity. Three.js displays them with exactly the tools above; loaders for `.ply`, `.pcd` and `.xyz` return a geometry ready for `THREE.Points`.

```js run title="A synthetic LiDAR scan, coloured by height" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#000000");
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(-14, 9, 16);
new OrbitControls(camera, renderer.domElement);

// Simulate a spinning 32-beam LiDAR in the middle of a street: ground, two building walls, a car, a pole
const pts = [];
const sensor = new THREE.Vector3(0, 1.8, 0), dir = new THREE.Vector3(), hit = new THREE.Vector3();
const ray = new THREE.Ray();
const box = (min, max) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
const obstacles = [box([-20, 0, 6], [20, 12, 8]), box([-20, 0, -9], [20, 9, -7]), box([3, 0, 1.5], [7.5, 1.5, 3.3]), box([-4, 0, -3], [-3.7, 5, -2.7])];
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
for (let beam = 0; beam < 32; beam++) {
  const elev = THREE.MathUtils.degToRad(-25 + beam * 1.3);            // beam angles from −25° to +15°
  for (let a = 0; a < 2048; a++) {
    const az = (a / 2048) * Math.PI * 2;
    dir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev));
    ray.set(sensor, dir);
    let best = Infinity;
    for (const b of obstacles) if (ray.intersectBox(b, hit)) best = Math.min(best, hit.distanceTo(sensor));
    if (ray.intersectPlane(groundPlane, hit)) best = Math.min(best, hit.distanceTo(sensor));
    if (best < 40) {
      const p = ray.at(best + (Math.random() - 0.5) * 0.04, new THREE.Vector3());   // a little sensor noise
      pts.push(p.x, p.y, p.z);
    }
  }
}
const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
// colour by height, like most point-cloud viewers
const colors = [], c = new THREE.Color();
for (let i = 1; i < pts.length; i += 3) { c.setHSL(0.66 - THREE.MathUtils.clamp(pts[i] / 10, 0, 1) * 0.66, 1, 0.5); colors.push(c.r, c.g, c.b); }
geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true })));
scene.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 16), new THREE.MeshBasicMaterial({ color: "#ffffff" })).translateY(1.8));

const hud = document.createElement("div");
hud.className = "overlay";
hud.textContent = `${(pts.length / 3).toLocaleString()} points · 32 beams × 2048 steps`;
document.body.appendChild(hud);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

`sizeAttenuation: false` keeps every point 2 pixels wide regardless of distance, the usual choice for measurement data. Real projects load scans with `PCDLoader` (the ROS/PCL format) or `PLYLoader`, and huge city-scale scans use streaming viewers such as **Potree** (built on three.js), which loads only the points the camera can see.

:::ai
Point clouds are the native data of perception systems: autonomous cars, delivery robots and drones see the world as LiDAR points. Engineering teams build browser tools on three.js to **inspect** scans, **label** objects for training machine-learning models (3D bounding boxes on cars and pedestrians), and **compare** predictions with ground truth. The Project Lab includes a LiDAR viewer with picking and measurement.
:::

## Check yourself

```quiz
? Why use THREE.Points instead of thousands of small meshes?
+ All points draw in a single draw call
- Points have better lighting
- Meshes can't be smaller than 1 cm
> One geometry, one material, one draw call.

? Which settings make particles glow where they overlap?
+ blending: AdditiveBlending with transparent: true and depthWrite: false
- sizeAttenuation: false
- vertexColors: true
> Additive blending adds light; depthWrite off stops them occluding each other.

? After changing values in the position buffer of a Points geometry, what is required?
+ geometry.attributes.position.needsUpdate = true
- points.updateMatrix()
- material.needsUpdate = true
> The buffer must be re-uploaded.

? What does `sizeAttenuation: false` do?
+ Points keep a constant pixel size regardless of distance
- Points become invisible when far
- Points become round
> Useful for data and measurement views.

? Where do real point clouds come from?
+ LiDAR, laser scanners, depth cameras and photogrammetry
- Only from three.js generators
- From glTF animations
> They're measurement data; PCD and PLY are common formats.
```

:::exercise Firework burst
Create a burst of 3,000 particles that all start at the origin with random velocities (`Vector3.randomDirection()` × speed 2–5 m/s), fall with gravity, and fade out (lower the material `opacity`) over 2.5 seconds. A button re-launches the burst in a random colour.
:::

:::solution
```js run
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#020617");
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1, 10);

const N = 3000;
const pos = new Float32Array(N * 3), vel = Array.from({ length: N }, () => new THREE.Vector3());
const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
const mat = new THREE.PointsMaterial({ size: 0.08, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
scene.add(new THREE.Points(geo, mat));
let age = 0;

function launch() {
  pos.fill(0);
  vel.forEach((v) => v.randomDirection().multiplyScalar(2 + Math.random() * 3));
  mat.color.setHSL(Math.random(), 1, 0.6);
  age = 0;
}
launch();
const btn = document.createElement("button");
btn.className = "overlay primary";
btn.textContent = "Launch";
btn.onclick = launch;
document.body.appendChild(btn);

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.05);
  age += dt;
  for (let i = 0; i < N; i++) {
    vel[i].y -= 9.81 * 0.25 * dt;                       // gentle gravity
    pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt;
  }
  geo.attributes.position.needsUpdate = true;
  mat.opacity = Math.max(0, 1 - age / 2.5);
  renderer.render(scene, camera);
});
```
:::

:::keypoints
- `THREE.Points` + `PointsMaterial` render every vertex as a sprite: **one draw call** for all particles.
- Soft glows: a round `map`, `transparent`, `depthWrite: false`, **additive blending** on dark backgrounds.
- Per-particle colours via a `color` attribute + `vertexColors`; animate by editing buffers + `needsUpdate`.
- Beyond ~100k moving particles, animate on the GPU (shaders, WebGPU compute).
- Point clouds from LiDAR and scanners use the same tools; `PCDLoader`/`PLYLoader` load them, Potree streams huge ones.
:::
