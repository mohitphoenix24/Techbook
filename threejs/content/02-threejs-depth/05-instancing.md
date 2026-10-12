---
title: Instancing — Thousands of Objects, One Draw Call
level: intermediate
time: 35
summary: InstancedMesh for forests, crowds, warehouses and data visualisations, per-instance matrices and colours, animating and picking instances, BatchedMesh for many different shapes, merging static geometry, and a decision guide for which to use.
---

A city with 10,000 buildings, a warehouse with 5,000 boxes, a forest, a stadium crowd, a 3D bar chart with a bar per country: as separate meshes these mean thousands of draw calls and a frame rate in single digits. **Instancing** tells the GPU "draw this one geometry N times, each with its own transform and colour" in a **single** draw call.

:::def InstancedMesh
A mesh that renders `count` copies (instances) of the same geometry and material. Each instance has its own 4×4 **matrix** (position, rotation, scale) and optionally its own **colour**. Instances can be updated, hidden and picked individually.
:::

## 10,000 cubes, one draw call

```js run title="InstancedMesh basics" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1020");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 40, 80);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#c7d2fe", "#0b1020", 1.4));
const sun = new THREE.DirectionalLight("#ffffff", 2);
sun.position.set(30, 60, 20);
scene.add(sun);

const COUNT = 10000;
const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), COUNT);
const dummy = new THREE.Object3D();          // a helper to build matrices from position/rotation/scale
const color = new THREE.Color();
let i = 0;
for (let x = 0; x < 100; x++) for (let z = 0; z < 100; z++) {
  const height = 0.5 + Math.random() ** 3 * 14;          // a few tall towers, many low blocks
  dummy.position.set(x - 50, height / 2, z - 50);
  dummy.scale.set(0.8, height, 0.8);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);                      // instance i's transform
  mesh.setColorAt(i, color.setHSL(0.55 + height / 40, 0.6, 0.35 + height / 30));
  i++;
}
scene.add(mesh);

const hud = document.createElement("div");
hud.className = "overlay";
document.body.appendChild(hud);
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  hud.textContent = `${COUNT.toLocaleString()} buildings · ${renderer.info.render.calls} draw call(s)`;
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

Compare with the "measuring a frame" demo in Module 1: 500 separate meshes cost 500 draw calls; here 10,000 buildings cost one.

| Method | Purpose |
|---|---|
| `new InstancedMesh(geometry, material, count)` | create with a maximum count |
| `setMatrixAt(i, matrix)` / `getMatrixAt(i, target)` | write / read instance i's transform |
| `setColorAt(i, color)` / `getColorAt(i, target)` | per-instance colour (multiplied with the material colour) |
| `instanceMatrix.needsUpdate = true` | after changing matrices later |
| `instanceColor.needsUpdate = true` | after changing colours later |
| `mesh.count = n` | draw only the first n instances (cheap way to hide the rest) |
| `computeBoundingSphere()` | after moving instances, so frustum culling and raycasting stay correct |

## Animating instances

To animate, rebuild the matrices each frame and flag the buffer. A wave of 4,900 pillars, like an audio visualiser or a sensor heat-field:

```js run title="An animated field of instances" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#09090b");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
camera.position.set(42, 34, 42);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#ffffff", "#18181b", 1.5));
const key = new THREE.DirectionalLight("#ffffff", 1.6);
key.position.set(-20, 40, 10);
scene.add(key);

const N = 70, COUNT = N * N;
const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 1, 0.8).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.4 }), COUNT);
pillars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);   // updated every frame
scene.add(pillars);
const dummy = new THREE.Object3D(), color = new THREE.Color();

renderer.setAnimationLoop((t) => {
  const s = t / 1000;
  for (let x = 0, i = 0; x < N; x++) for (let z = 0; z < N; z++, i++) {
    const dx = x - N / 2, dz = z - N / 2, d = Math.hypot(dx, dz);
    const h = 1 + (Math.sin(d * 0.35 - s * 3) * 0.5 + 0.5) * 8 * Math.exp(-d / 40);
    dummy.position.set(dx, 0, dz);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    pillars.setMatrixAt(i, dummy.matrix);
    pillars.setColorAt(i, color.setHSL(0.75 - h / 16, 0.8, 0.5));
  }
  pillars.instanceMatrix.needsUpdate = true;
  pillars.instanceColor.needsUpdate = true;
  renderer.render(scene, camera);
});
```

Rebuilding 4,900 matrices per frame in JavaScript takes about a millisecond. For far more, or for motion that's a pure function of time, move the animation into the **vertex shader** and send only a `time` uniform each frame.

## Picking instances

Raycasting an `InstancedMesh` works like any mesh, and the hit tells you **which** instance via `instanceId`. Here's a warehouse rack where you can click any of 2,400 boxes to see its inventory record:

```js run title="Click one of 2,400 instanced boxes" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
camera.position.set(18, 12, 26);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 4, 0);
scene.add(new THREE.HemisphereLight("#ffffff", "#64748b", 1.6));
const sun = new THREE.DirectionalLight("#ffffff", 1.8);
sun.position.set(10, 20, 15);
scene.add(sun);

// racks: 10 aisles × 40 slots × 6 levels
const records = [];
const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial(), 2400);
const dummy = new THREE.Object3D(), color = new THREE.Color();
let i = 0;
for (let aisle = 0; aisle < 10; aisle++) for (let slot = 0; slot < 40; slot++) for (let level = 0; level < 6; level++) {
  dummy.position.set(slot * 1 - 20, level * 1.2 + 0.5, aisle * 2.4 - 12);
  dummy.updateMatrix();
  boxes.setMatrixAt(i, dummy.matrix);
  const fill = Math.random();
  boxes.setColorAt(i, color.setHSL(fill * 0.33, 0.65, 0.5));          // red (empty) → green (full)
  records.push({ sku: `SKU-${(100000 + i * 37) % 999999}`, aisle: aisle + 1, slot: slot + 1, level: level + 1, fill });
  i++;
}
scene.add(boxes);

const info = document.createElement("div");
info.className = "overlay";
info.textContent = "Click a box";
document.body.appendChild(info);
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
let selected = -1;
const prev = new THREE.Color();
renderer.domElement.addEventListener("click", (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(boxes)[0];
  if (selected >= 0) boxes.setColorAt(selected, prev);                  // restore the old selection
  if (!hit) { selected = -1; info.textContent = "Click a box"; boxes.instanceColor.needsUpdate = true; return; }
  selected = hit.instanceId;                                           // ← which instance was hit
  boxes.getColorAt(selected, prev);
  boxes.setColorAt(selected, color.set("#ffffff"));
  boxes.instanceColor.needsUpdate = true;
  const rec = records[selected];
  info.innerHTML = `<b>${rec.sku}</b><span>Aisle ${rec.aisle} · Slot ${rec.slot} · Level ${rec.level}</span><span class="muted">${Math.round(rec.fill * 100)}% full</span>`;
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

The pattern (instance index ↔ record in an array) is how 3D dashboards connect thousands of objects to database rows.

## Many *different* shapes: BatchedMesh

Instancing needs one shared geometry. **`BatchedMesh`** draws **many different geometries** sharing one material in a single draw call: a scene of rocks, crates, barrels and plants, each a different mesh. You add geometries once, then add instances of each. All geometries in a batch must share the same attribute layout (here: position, normal, uv, all indexed):

```js run title="BatchedMesh: different shapes, one draw call" level=advanced
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1c1917");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 14, 26);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fef3c7", "#1c1917", 1.6));
const sun = new THREE.DirectionalLight("#ffffff", 1.6);
sun.position.set(5, 10, 5);
scene.add(sun);

// every geometry in a batch must have the same attributes and all be indexed (or all non-indexed)
const geometries = [
  new THREE.SphereGeometry(0.5, 7, 5),                          // a low-poly "rock"
  new THREE.BoxGeometry(0.8, 0.8, 0.8),
  new THREE.CylinderGeometry(0.35, 0.35, 1, 16),
  new THREE.ConeGeometry(0.45, 1.2, 8),
  new THREE.TorusGeometry(0.4, 0.15, 12, 24),
];
const MAX = 3000;
let maxVerts = 0, maxIdx = 0;
for (const g of geometries) { maxVerts += g.attributes.position.count; maxIdx += g.index.count; }
const batch = new THREE.BatchedMesh(MAX, maxVerts, maxIdx, new THREE.MeshStandardMaterial({ roughness: 0.6 }));
const ids = geometries.map((g) => batch.addGeometry(g));          // upload each shape once

const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
const spin = [];
for (let i = 0; i < MAX; i++) {
  const id = batch.addInstance(ids[i % ids.length]);            // an instance of shape (i mod 5)
  p.set((Math.random() - 0.5) * 40, Math.random() * 4, (Math.random() - 0.5) * 40);
  q.setFromEuler(e.set(Math.random() * 6, Math.random() * 6, 0));
  s.setScalar(0.5 + Math.random());
  batch.setMatrixAt(id, m.compose(p, q, s));
  batch.setColorAt(id, c.setHSL(0.08 + (i % 5) * 0.12, 0.6, 0.55));
  spin.push({ id, p: p.clone(), q: q.clone(), s: s.clone(), speed: Math.random() * 2 - 1 });
}
scene.add(batch);

const hud = document.createElement("div");
hud.className = "overlay";
document.body.appendChild(hud);
const turn = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
renderer.setAnimationLoop(() => {
  for (const o of spin) {
    o.q.premultiply(turn.setFromAxisAngle(Y, o.speed * 0.02));
    batch.setMatrixAt(o.id, m.compose(o.p, o.q, o.s));
  }
  renderer.render(scene, camera);
  hud.textContent = `${MAX} objects of 5 different shapes · ${renderer.info.render.calls} draw call(s)`;
});
```

## Merging static geometry

For things that **never move independently** (walls of a building, rocks in a level, the parts of a machine housing), merging their geometries into one is simplest of all:

```js
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const parts = walls.map((wall) => wall.geometry.clone().applyMatrix4(wall.matrixWorld));   // bake each transform
const merged = new THREE.Mesh(mergeGeometries(parts), wallMaterial);                      // one draw call
```

The cost: merged parts can no longer be moved, hidden or picked individually (unless you track triangle ranges yourself).

## Which technique when?

| Situation | Use |
|---|---|
| many copies of **one** shape (trees, boxes, bars, particles with shape) | `InstancedMesh` |
| many **different** shapes, one material, each still movable | `BatchedMesh` |
| static parts that never change | `mergeGeometries` |
| a few dozen objects | plain meshes — don't optimise early |
| copies of a glTF model with several meshes | one `InstancedMesh` per sub-mesh (R3F: drei `<Merged>` / `<Instances>`) |

:::ai
Instancing is the workhorse of 3D data visualisation: one instance per data row. A 3D scatter plot of 100,000 embedding vectors (projected to 3D with UMAP or t-SNE), a globe with a bar per city, or a digital twin where each instance is a sensor, all hold one instance per record and map `instanceId` back to the data on hover.
:::

## Check yourself

```quiz
? What does InstancedMesh share between all instances?
+ One geometry and one material
- One matrix
- One colour
> Each instance gets its own matrix (and optionally colour).

? How do you find which instance a ray hit?
+ The intersection's instanceId
- The intersection's faceIndex
- mesh.getInstance(point)
> instanceId indexes into the instance arrays.

? After calling setMatrixAt in the animation loop, what else is needed?
+ instanceMatrix.needsUpdate = true
- mesh.updateMatrix()
- geometry.needsUpdate = true
> The instance buffer must be re-uploaded.

? You need 3,000 objects of 5 different shapes that can still move. Best fit?
- InstancedMesh
+ BatchedMesh
- mergeGeometries
> BatchedMesh handles multiple geometries in one draw call with per-object matrices.

? What's the downside of mergeGeometries?
+ Merged parts can't move or be picked individually
- It creates more draw calls
- It only works with BoxGeometry
> Merging trades flexibility for the cheapest rendering.
```

:::exercise Hide sold-out stock
In the warehouse example, add a "Hide empty" checkbox that hides boxes whose `fill` is below 0.2. Hint: you can hide an instance by setting its matrix scale to 0 (compose with scale `(0, 0, 0)`), then flag `instanceMatrix.needsUpdate`.
:::

:::solution
```js run
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
camera.position.set(18, 12, 26);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#64748b", 2.4));

const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial(), 2400);
const dummy = new THREE.Object3D(), color = new THREE.Color(), records = [];
let i = 0;
for (let aisle = 0; aisle < 10; aisle++) for (let slot = 0; slot < 40; slot++) for (let level = 0; level < 6; level++) {
  const fill = Math.random();
  records.push({ pos: new THREE.Vector3(slot - 20, level * 1.2 + 0.5, aisle * 2.4 - 12), fill });
  boxes.setColorAt(i++, color.setHSL(fill * 0.33, 0.65, 0.5));
}
function layout(hideEmpty) {
  records.forEach((r, i) => {
    dummy.position.copy(r.pos);
    dummy.scale.setScalar(hideEmpty && r.fill < 0.2 ? 0 : 1);   // scale 0 = invisible
    dummy.updateMatrix();
    boxes.setMatrixAt(i, dummy.matrix);
  });
  boxes.instanceMatrix.needsUpdate = true;
}
layout(false);
scene.add(boxes);
const ui = document.createElement("label");
ui.className = "overlay";
ui.innerHTML = `<span><input type="checkbox"> Hide empty (&lt; 20%)</span>`;
ui.querySelector("input").onchange = (e) => layout(e.target.checked);
document.body.appendChild(ui);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```
:::

:::keypoints
- `InstancedMesh` draws N copies of one geometry + material in **one draw call**, each with its own matrix and colour.
- Build matrices with a dummy `Object3D` (or `Matrix4.compose`); flag `instanceMatrix` / `instanceColor` after changes.
- Raycast hits report `instanceId`: map it to your data records.
- `BatchedMesh` handles many **different** geometries in one draw call; `mergeGeometries` is cheapest for static parts.
- Instancing is how cities, forests, warehouses and 3D data visualisations stay fast.
:::
