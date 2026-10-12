---
title: Interaction — Picking Objects with Raycasting
level: intermediate
time: 35
summary: Turning a mouse or touch position into a ray, hover highlights and click selection, dragging objects across the floor, placing objects where you click, HTML labels that follow 3D objects, and keeping picking fast in big scenes.
---

A scene you can only look at is a video. The moment users can **hover** a part to see its name, **click** a machine to open its dashboard, or **drag** furniture across a floor, it becomes an application. In three.js all of that starts with one technique: shooting a ray from the camera through the mouse pointer and asking what it hits.

:::def Raycasting
Casting an invisible line (a **ray**) from a point in a direction and finding which objects it crosses, sorted by distance. For mouse picking, the ray starts at the camera and passes through the pointer's position on screen. `THREE.Raycaster` does the math.
:::

:::def NDC (normalized device coordinates)
Screen positions rescaled so the canvas spans **−1 to +1** on both axes, with +y **up** (the opposite of CSS pixels, where y grows downward). The raycaster wants the pointer in NDC.
:::

## Hover and click

```js run title="Hover highlights, click selects" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 6, 9);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.6));
const sun = new THREE.DirectionalLight("#fff", 2);
sun.position.set(3, 6, 4);
scene.add(sun);

const pickable = [];
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4 + Math.random() * 1.6, 0.9),
    new THREE.MeshStandardMaterial({ color: "#64748b" }));                 // each mesh gets its OWN material
  m.position.set((i % 4 - 1.5) * 1.5, m.geometry.parameters.height / 2, (Math.floor(i / 4) - 1.5) * 1.5);
  m.name = `Machine ${String.fromCharCode(65 + i)}`;
  scene.add(m);
  pickable.push(m);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null, selected = null;
const info = document.createElement("div");
info.className = "overlay";
info.textContent = "Hover and click a machine";
document.body.appendChild(info);

function toNDC(e) {
  const r = renderer.domElement.getBoundingClientRect();     // works even when the canvas isn't full-screen
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;     // flip y
}
function pick() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickable, false);  // false = don't test children
  return hits[0]?.object ?? null;                            // hits are sorted nearest first
}
function paint() {
  for (const m of pickable) m.material.color.set(m === selected ? "#10b981" : m === hovered ? "#f59e0b" : "#64748b");
}

renderer.domElement.addEventListener("pointermove", (e) => {
  toNDC(e);
  hovered = pick();
  renderer.domElement.style.cursor = hovered ? "pointer" : "auto";
  paint();
});
renderer.domElement.addEventListener("click", () => {
  selected = hovered;
  info.innerHTML = selected
    ? `<b>${selected.name}</b><span class="muted">height ${selected.geometry.parameters.height.toFixed(2)} m · status OK</span>`
    : "Nothing selected";
  paint();
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

:::warn Clicks vs. orbit drags
With OrbitControls, the end of every drag also fires a `click`, so users accidentally select things when they meant to rotate. Record the pointer position on `pointerdown` and ignore the click if it moved more than a few pixels. React Three Fiber does this for you (`e.delta`).
:::

## What an intersection tells you

`intersectObjects()` returns an array of hits, nearest first. Each hit is rich:

| Field | Meaning | Use it to |
|---|---|---|
| `object` | the mesh hit | select, highlight, open details |
| `point` | world position of the hit | place markers, decals, spawn effects |
| `distance` | metres from the ray's origin | range checks |
| `face.normal` | the triangle's normal (local space) | align placed objects to walls/slopes |
| `uv` | texture coordinate at the hit | paint on textures, click on in-world screens |
| `instanceId` | which instance of an `InstancedMesh` | pick one of thousands of instances |

## Dragging objects on the floor

To drag something across a floor, intersect the ray with a mathematical **plane** instead of meshes. The plane is infinite and costs nothing to test.

```js run title="Drag crates around a warehouse floor" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 9, 9);
const orbit = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.6), new THREE.GridHelper(12, 12));
const sun = new THREE.DirectionalLight("#fff", 2);
sun.position.set(3, 6, 4);
scene.add(sun);

const crates = ["#f97316", "#eab308", "#06b6d4", "#a855f7"].map((color, i) => {
  const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color }));
  c.position.set((i - 1.5) * 2, 0.5, 0);
  scene.add(c);
  return c;
});

const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);   // y = 0, facing up
const hit = new THREE.Vector3(), offset = new THREE.Vector3();
let dragging = null;

function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}
renderer.domElement.addEventListener("pointerdown", (e) => {
  setPointer(e);
  const h = raycaster.intersectObjects(crates)[0];
  if (!h) return;
  dragging = h.object;
  orbit.enabled = false;                                   // don't orbit while dragging
  raycaster.ray.intersectPlane(floorPlane, hit);
  offset.subVectors(dragging.position, hit);               // keep the grab point under the cursor
  renderer.domElement.setPointerCapture(e.pointerId);      // keep receiving moves outside the canvas
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  setPointer(e);
  if (raycaster.ray.intersectPlane(floorPlane, hit)) {
    dragging.position.x = Math.round((hit.x + offset.x) * 2) / 2;   // snap to 0.5 m
    dragging.position.z = Math.round((hit.z + offset.z) * 2) / 2;
  }
});
renderer.domElement.addEventListener("pointerup", () => { dragging = null; orbit.enabled = true; });

renderer.setAnimationLoop(() => {
  for (const c of crates) c.position.y = THREE.MathUtils.damp(c.position.y, c === dragging ? 0.8 : 0.5, 12, 1 / 60);  // lift while dragging
  renderer.render(scene, camera);
});
```

## Placing objects where you click

Clicking the ground to place things is the core loop of room planners, level editors and AR apps (in AR, the "ground" comes from the real world via hit testing, Module 5). Use the hit `point`, and align the new object to the surface `normal` so it sits flush on slopes and walls:

```js run title="Click surfaces to place markers aligned to them" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(5, 5, 7);
const orbit = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.6));
const sun = new THREE.DirectionalLight("#fff", 2);
sun.position.set(3, 6, 4);
scene.add(sun);

const surfaces = new THREE.Group();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: "#cbd5e1" }));
ground.rotation.x = -Math.PI / 2;
const ramp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 2), new THREE.MeshStandardMaterial({ color: "#94a3b8" }));
ramp.position.set(-1.5, 0.6, 0);
ramp.rotation.z = 0.4;
const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 4), new THREE.MeshStandardMaterial({ color: "#a5b4fc" }));
wall.position.set(2.5, 1.25, 0);
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 16), new THREE.MeshStandardMaterial({ color: "#fda4af" }));
ball.position.set(0.5, 0.9, -2.5);
surfaces.add(ground, ramp, wall, ball);
scene.add(surfaces);

const markerGeo = new THREE.ConeGeometry(0.12, 0.4, 12).translate(0, 0.2, 0);   // tip points along +y
const markerMat = new THREE.MeshStandardMaterial({ color: "#10b981" });
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), normal = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
let down = new THREE.Vector2();

renderer.domElement.addEventListener("pointerdown", (e) => down.set(e.clientX, e.clientY));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4) return;   // it was an orbit drag
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const h = raycaster.intersectObject(surfaces, true)[0];
  if (!h) return;
  normal.copy(h.face.normal).transformDirection(h.object.matrixWorld);       // local → world direction
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.copy(h.point);
  marker.quaternion.setFromUnitVectors(UP, normal);                           // stand up along the normal
  scene.add(marker);
});
const tip = document.createElement("div");
tip.className = "overlay";
tip.textContent = "Click the floor, ramp, wall or ball. Drag to orbit.";
document.body.appendChild(tip);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

`face.normal` is in the object's **local** space, so it must be rotated into world space with `transformDirection(matrixWorld)` before use. `setFromUnitVectors(a, b)` builds the rotation that turns direction `a` into direction `b`, a handy trick for aligning anything to a surface.

## HTML labels that follow 3D objects

For tooltips, price tags and machine dashboards, ordinary HTML often beats text drawn in 3D: it's crisp, accessible, selectable and styled with CSS. Project the object's world position to the screen each frame and move a `<div>` there:

```js run title="Project 3D → screen for HTML labels" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3, 8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.2), new THREE.GridHelper(10, 10));

const items = ["Pump 1", "Valve 7", "Tank B"].map((name, i) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1 + i * 0.6, 32), new THREE.MeshStandardMaterial({ color: ["#38bdf8", "#f472b6", "#a3e635"][i] }));
  mesh.position.set((i - 1) * 2.5, (1 + i * 0.6) / 2, 0);
  scene.add(mesh);
  const el = document.createElement("div");
  el.className = "label3d";
  el.style.cssText = "position:absolute;left:0;top:0";      // anchor at the corner; transform moves it
  el.innerHTML = `<b>${name}</b> · ${(40 + i * 17).toFixed(0)} °C`;
  document.body.appendChild(el);
  return { mesh, el, top: new THREE.Vector3() };
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  for (const it of items) {
    it.top.copy(it.mesh.position);
    it.top.y += it.mesh.geometry.parameters.height / 2 + 0.25;   // just above the object
    it.top.project(camera);                                     // world → NDC (−1..1)
    const x = (it.top.x + 1) / 2 * innerWidth, y = (1 - it.top.y) / 2 * innerHeight;
    it.el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    it.el.style.display = it.top.z < 1 ? "" : "none";           // hide labels behind the camera
  }
});
```

Three.js packages this as `CSS2DRenderer` (used in the Materials lesson), and R3F as drei's `<Html>` component, which can even hide labels when they're occluded by other objects.

## Keeping picking fast

The raycaster tests every triangle of every object you pass in. That's fine for dozens of objects, slow for a 2-million-triangle CAD model at 60 Hz on `pointermove`.

| Technique | How |
|---|---|
| test only what's pickable | keep a `pickable` array; don't raycast the whole scene |
| use simple proxies | raycast an invisible low-poly box around a detailed model |
| layers | `raycaster.layers.set(1)` + `obj.layers.enable(1)` to filter |
| throttle | raycast on `pointermove` at most once per frame |
| acceleration structure | **three-mesh-bvh** builds a bounding-volume hierarchy: raycasts on huge meshes go from milliseconds to microseconds |
| GPU picking | render object IDs as colours to an offscreen target and read one pixel; constant cost for any scene size |

## Check yourself

```quiz
? Why is the y term negated when converting the mouse to NDC?
+ CSS pixel y grows downward, but NDC y grows upward
- Three.js uses a left-handed system
- To mirror the scene
> NDC: −1 bottom, +1 top.

? Which hit field gives the world position where the ray struck?
- distance
+ point
- face
> Use it to place markers or spawn effects.

? How do you drag an object along the floor without hitting other meshes?
+ Intersect the ray with a mathematical Plane at floor height
- Raycast the object itself on every move
- Use OrbitControls
> ray.intersectPlane is cheap and never misses.

? Why transform `face.normal` with `transformDirection(object.matrixWorld)`?
+ face.normal is in the object's local space
- It is always zero
- To normalize it
> Rotations of the object must be applied to get the world direction.

? A user rotates the camera and accidentally selects an object on release. Fix?
+ Ignore clicks if the pointer moved more than a few pixels since pointerdown
- Disable OrbitControls permanently
- Use dblclick only
> Distinguish taps from drags by movement distance.
```

:::exercise Delete on right-click
Extend the "place markers" example: **right-clicking** a marker removes it (use the `contextmenu` event, call `e.preventDefault()`, and raycast against an array of placed markers).
:::

:::solution
```js run
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 7, 7);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enablePan = false;                         // right-drag is used for deleting instead
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.2));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: "#cbd5e1" }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const markers = [];
const geo = new THREE.ConeGeometry(0.15, 0.5, 12).translate(0, 0.25, 0);
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const aim = (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
};
renderer.domElement.addEventListener("dblclick", (e) => {     // double-click places
  aim(e);
  const h = raycaster.intersectObject(ground)[0];
  if (!h) return;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#10b981" }));
  m.position.copy(h.point);
  scene.add(m);
  markers.push(m);
});
renderer.domElement.addEventListener("contextmenu", (e) => {  // right-click deletes
  e.preventDefault();
  aim(e);
  const h = raycaster.intersectObjects(markers)[0];
  if (!h) return;
  scene.remove(h.object);
  h.object.material.dispose();
  markers.splice(markers.indexOf(h.object), 1);
});
const tip = document.createElement("div");
tip.className = "overlay";
tip.textContent = "Double-click to place · right-click a marker to delete";
document.body.appendChild(tip);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```
:::

:::keypoints
- Convert the pointer to **NDC** (−1…1, y up), then `raycaster.setFromCamera(ndc, camera)`.
- `intersectObjects(list)` returns hits nearest first with `object`, `point`, `distance`, `face`, `uv`, `instanceId`.
- Drag along a mathematical **Plane**; capture the pointer; disable orbiting while dragging.
- Align placed objects with the world-space **normal** and `quaternion.setFromUnitVectors`.
- HTML labels: `vector.project(camera)` → pixels (or `CSS2DRenderer` / drei `<Html>`).
- Keep picking fast with small pickable lists, proxies, layers, **three-mesh-bvh** or GPU picking.
:::
