---
title: LiDAR Point-Cloud Viewer
level: advanced
time: 70
icon: eye
cover: #22d3ee,#0b1020
tags: Points, PCDLoader, BufferAttribute, sensor simulation, Ray intersections, colour ramps, clipping planes, point picking, measurement
summary: Load real point clouds with PCDLoader, then build a full LiDAR viewer around a simulated 16-beam spinning sensor that drives down a street and maps it. Colour by height, intensity, range or class, slice by height with a clipping plane, compare against the ground-truth scene, and measure distances by picking points.
---

LiDAR (light detection and ranging) sensors fire laser pulses and time the echoes, producing **point clouds**: millions of x, y, z samples of the world. They power self-driving cars, robots, drones, surveying, construction scanning and forestry. A browser viewer for point clouds is a classic three.js job: it needs efficient `Points` rendering, colour modes, slicing and measurement.

:::flow How it fits together
Source | a PCD/LAS file, or our simulated sensor raycasting a procedural street
Buffers | preallocated `Float32Array`s for positions and colours, plus per-point height, intensity, range and class
Render | one `Points` object; `drawRange` grows as scans arrive
Analyse | colour ramps, a height-slice clipping plane, ground-truth overlay
Measure | pick points with a `Raycaster` (`params.Points.threshold`), show distance and height difference
:::

## Step 1: Load a real point cloud

`PCDLoader` reads the Point Cloud Library's `.pcd` format (ASCII, binary and compressed) and returns a ready `THREE.Points`. This scan of a statue has about 60,000 points:

```js run title="Step 1 · Loading a PCD scan" height=420
import * as THREE from "three";
import { PCDLoader } from "three/addons/loaders/PCDLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1020");
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 40);
camera.position.set(0, 0, 1.1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;

const points = await new PCDLoader().loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/pcd/binary/Zaghetto.pcd");
points.geometry.center();                 // scanners use their own origin: recentre for viewing
points.geometry.rotateX(Math.PI);         // and their own up axis
points.material.size = 0.004;
points.material.color.set("#67e8f9");
scene.add(points);

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<b>${points.geometry.attributes.position.count.toLocaleString()} points</b>
  <label>size <input type="range" min="0.001" max="0.012" step="0.0005" value="0.004"></label>`;
ui.querySelector("input").oninput = (e) => (points.material.size = +e.target.value);
document.body.append(ui);

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
```

:::def Point-cloud formats
**PCD** (Point Cloud Library) and **PLY** are common in robotics and research; **LAS/LAZ** is the standard for aerial and survey LiDAR (with classification codes and GPS time); **E57** for terrestrial scanners; **3D Tiles** and **Potree**'s octree format for streaming *billions* of points to the browser, which is how city-scale scans are viewed online.
:::

## Step 2: Simulate a sensor, then build the viewer

Real LiDAR data is big and often private, so we'll **make our own**: a 16-beam spinning sensor (like the popular VLP-16) on a car drives down a procedural street, firing 11,520 rays per revolution. Each ray is intersected analytically with boxes, spheres and the ground, with range noise and an intensity that depends on surface reflectivity and angle, just like a real unit. Press **Drive & scan**, then explore:

```js run title="LiDAR Viewer · simulated mapping run" level=advanced height=620
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ---------- 1. a procedural street made of simple primitives ----------
const CLASSES = {
  ground: "#a8a29e", building: "#f59e0b", vegetation: "#22c55e", vehicle: "#3b82f6", pole: "#e11d48", person: "#d946ef",
};
const CLASS_IDS = Object.keys(CLASSES);
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // repeatable random numbers

const boxes = [], spheres = [];
const addBox = (cls, refl, cx, cy, cz, sx, sy, sz) => boxes.push({ cls, refl,
  box: new THREE.Box3(new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2), new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2)) });
for (const side of [-1, 1]) {
  for (let x = -44; x < 44;) {                                              // buildings behind the pavement
    const w = 6 + rnd() * 8, h = 6 + rnd() * 14, d = 8 + rnd() * 4;
    addBox("building", 0.55 + rnd() * 0.2, x + w / 2, h / 2, side * (7 + d / 2), w - 0.5, h, d);
    x += w;
  }
  for (let x = -38; x < 40; x += 9 + rnd() * 4) {                          // trees: trunk + crown
    addBox("vegetation", 0.3, x, 1.3, side * 4.7, 0.35, 2.6, 0.35);
    spheres.push({ cls: "vegetation", refl: 0.35, s: new THREE.Sphere(new THREE.Vector3(x, 3.7, side * 4.7), 1.3 + rnd() * 0.6) });
  }
  for (let x = -34; x < 40; x += 14) addBox("pole", 0.8, x + 3, 3, side * 3.9, 0.15, 6, 0.15);
  for (let x = -36; x < 38; x += 7 + rnd() * 6) {                          // parked cars: body + cabin
    if (rnd() < 0.3) continue;
    addBox("vehicle", 0.85, x, 0.75, side * 2.5, 4.3, 1.0, 1.8);
    addBox("vehicle", 0.7, x - 0.3, 1.5, side * 2.5, 2.2, 0.6, 1.6);
  }
  for (let i = 0; i < 4; i++) addBox("person", 0.5, -30 + rnd() * 60, 0.85, side * (5.4 + rnd()), 0.5, 1.7, 0.45);
}
function groundReflectivity(x, z) {
  const a = Math.abs(z);
  if (a < 0.08 && ((x % 6) + 6) % 6 < 3) return 0.95;                     // dashed centre line: retro-reflective paint
  if (a > 3.35 && a < 3.5) return 0.8;                                      // kerb line
  return a < 3.5 ? 0.15 : 0.45;                                             // asphalt vs pavement
}

// ---------- 2. the sensor: 16 beams × 720 azimuth steps per revolution ----------
const BEAMS = Array.from({ length: 16 }, (_, i) => THREE.MathUtils.degToRad(-15 + i * 2));
const AZ_STEPS = 720, MAX_RANGE = 60, SENSOR_Y = 1.9;
const STATIONS = Array.from({ length: 9 }, (_, i) => -24 + i * 6);       // scan every 6 m along the street
const MAX = STATIONS.length * BEAMS.length * AZ_STEPS;

const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
const H = new Float32Array(MAX), I = new Float32Array(MAX), RG = new Float32Array(MAX), K = new Uint8Array(MAX);
let count = 0;

const ray = new THREE.Ray(), hit = new THREE.Vector3(), best = new THREE.Vector3(), n = new THREE.Vector3();
const origin = new THREE.Vector3(), dir = new THREE.Vector3();
function cast() {
  let t = MAX_RANGE, cls = -1, refl = 0;
  if (dir.y < 0) {                                                           // ground plane y = 0
    const tg = -origin.y / dir.y;
    if (tg < t) { t = tg; best.copy(dir).multiplyScalar(tg).add(origin); cls = 0; refl = groundReflectivity(best.x, best.z); n.set(0, 1, 0); }
  }
  for (const b of boxes) {
    if (!ray.intersectBox(b.box, hit)) continue;
    const d = hit.distanceTo(origin);
    if (d < t) {
      t = d; best.copy(hit); cls = CLASS_IDS.indexOf(b.cls); refl = b.refl;
      const e = 1e-3, mn = b.box.min, mx = b.box.max;                       // which face did we hit?
      n.set(Math.abs(hit.x - mn.x) < e ? -1 : Math.abs(hit.x - mx.x) < e ? 1 : 0,
            Math.abs(hit.y - mn.y) < e ? -1 : Math.abs(hit.y - mx.y) < e ? 1 : 0,
            Math.abs(hit.z - mn.z) < e ? -1 : Math.abs(hit.z - mx.z) < e ? 1 : 0).normalize();
    }
  }
  for (const s of spheres) {
    if (!ray.intersectSphere(s.s, hit)) continue;
    const d = hit.distanceTo(origin);
    if (d < t) { t = d; best.copy(hit); cls = CLASS_IDS.indexOf(s.cls); refl = s.refl; n.copy(hit).sub(s.s.center).normalize(); }
  }
  return cls < 0 ? null : { t, cls, refl, cos: Math.abs(n.dot(dir)) };
}

function scan(sx) {
  origin.set(sx, SENSOR_Y, 0);
  for (let a = 0; a < AZ_STEPS; a++) {
    const az = (a / AZ_STEPS) * Math.PI * 2;
    for (const el of BEAMS) {
      dir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      ray.set(origin, dir);
      const r = cast();
      if (!r || r.t < 0.8) continue;                                         // no echo, or the car itself
      const range = r.t + (Math.random() + Math.random() + Math.random() - 1.5) * 0.03;   // ~2 cm range noise
      pos[count * 3] = origin.x + dir.x * range;
      pos[count * 3 + 1] = origin.y + dir.y * range;
      pos[count * 3 + 2] = origin.z + dir.z * range;
      H[count] = pos[count * 3 + 1];
      I[count] = THREE.MathUtils.clamp(r.refl * (0.35 + 0.65 * r.cos) + (Math.random() - 0.5) * 0.05, 0, 1);
      RG[count] = range;
      K[count] = r.cls;
      colorPoint(count++);
    }
  }
  geo.setDrawRange(0, count);
  geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
  geo.computeBoundingSphere();
}

// ---------- 3. rendering ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#070b16");
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
camera.position.set(-6, 24, 30);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(6, 0, -6);
controls.enableDamping = true;

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
geo.setDrawRange(0, 0);
const slice = new THREE.Plane(new THREE.Vector3(0, -1, 0), 30);            // keeps points below y = 30
const cloud = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, clippingPlanes: [slice] }));
scene.add(cloud);

// the mapping car with a spinning sensor
const car = new THREE.Group();
car.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 1.8), new THREE.MeshBasicMaterial({ color: "#f8fafc", wireframe: true })));
const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.35, 16), new THREE.MeshBasicMaterial({ color: "#22d3ee" }));
puck.position.y = SENSOR_Y - 0.6;
car.add(puck);
car.position.set(STATIONS[0], 0.6, 0);
scene.add(car);

// ground truth: the primitives the sensor "sees"
const truth = new THREE.Group();
const truthMat = new THREE.MeshBasicMaterial({ color: "#94a3b8", wireframe: true, transparent: true, opacity: 0.25 });
for (const b of boxes) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...b.box.getSize(new THREE.Vector3()).toArray()), truthMat);
  b.box.getCenter(m.position);
  truth.add(m);
}
for (const s of spheres) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(s.s.radius, 12, 8), truthMat);
  m.position.copy(s.s.center);
  truth.add(m);
}
truth.visible = false;
scene.add(truth);

// ---------- 4. colour modes ----------
let mode = "height";
const c = new THREE.Color();
function colorPoint(i) {
  if (mode === "height") c.setHSL(0.66 - THREE.MathUtils.clamp(H[i] / 16, 0, 1) * 0.66, 0.9, 0.5);  // blue → red
  else if (mode === "intensity") c.setHSL(0.7 - I[i] * 0.55, 0.85, 0.12 + I[i] * 0.6);               // dark purple → bright yellow
  else if (mode === "range") c.setHSL(THREE.MathUtils.clamp(RG[i] / MAX_RANGE, 0, 1) * 0.8, 0.85, 0.55);
  else c.set(CLASSES[CLASS_IDS[K[i]]]);
  c.toArray(col, i * 3);
}
function recolor() {
  for (let i = 0; i < count; i++) colorPoint(i);
  geo.attributes.color.needsUpdate = true;
}

// ---------- 5. UI ----------
const ui = document.createElement("div");
ui.className = "overlay";
ui.style.width = "240px";
ui.innerHTML = `
  <div class="row"><button class="primary" id="drive">Drive &amp; scan</button><button id="truth">Ground truth</button></div>
  <label style="font-size:12px">Colour <select id="mode" style="flex:1">
    <option value="height">Height</option><option value="intensity">Intensity</option><option value="range">Range</option><option value="class">Class</option></select></label>
  <div id="legend" style="display:none;font-size:11px" class="row">${CLASS_IDS.map((k) => `<span><span style="color:${CLASSES[k]}">●</span> ${k}</span>`).join("")}</div>
  <label style="font-size:12px">Point size <input id="size" type="range" min="0.03" max="0.35" step="0.01" value="0.12" style="flex:1"></label>
  <label style="font-size:12px">Max height <input id="slice" type="range" min="0.2" max="22" step="0.1" value="22" style="flex:1"></label>
  <div class="row"><button id="measure">Measure</button><span class="muted" id="hint" style="font-size:11px"></span></div>
  <div class="muted" id="stats" style="font-size:11px"></div>`;
document.body.append(ui);
const $ = (s) => ui.querySelector(s);
let next = 0, driving = false;
$("#drive").onclick = () => { count = 0; next = 0; driving = true; car.position.x = STATIONS[0] - 4; geo.setDrawRange(0, 0); };
$("#truth").onclick = (e) => { truth.visible = e.target.classList.toggle("on"); };
$("#mode").onchange = (e) => { mode = e.target.value; $("#legend").style.display = mode === "class" ? "flex" : "none"; recolor(); };
$("#size").oninput = (e) => (cloud.material.size = +e.target.value);
$("#slice").oninput = (e) => (slice.constant = +e.target.value);

// ---------- 6. measuring: pick two points ----------
let measuring = false, picks = [];
const picker = new THREE.Raycaster();
picker.params.Points.threshold = 0.25;
const markers = new THREE.Group();
scene.add(markers);
const label = document.createElement("div");
label.className = "label3d";
Object.assign(label.style, { position: "absolute", display: "none", zIndex: 5 });
document.body.append(label);
$("#measure").onclick = (e) => {
  measuring = e.target.classList.toggle("on");
  picks = []; markers.clear(); label.style.display = "none";
  $("#hint").textContent = measuring ? "click two points" : "";
};
let downAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!measuring || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
  picker.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hitPt = picker.intersectObject(cloud)[0];
  if (!hitPt) return;
  if (picks.length === 2) { picks = []; markers.clear(); }
  const p = new THREE.Vector3().fromArray(pos, hitPt.index * 3);            // snap to the actual point
  picks.push(p);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: "#fde047", depthTest: false }));
  dot.position.copy(p);
  dot.renderOrder = 2;
  markers.add(dot);
  if (picks.length === 2) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(picks), new THREE.LineBasicMaterial({ color: "#fde047", depthTest: false }));
    line.renderOrder = 2;
    markers.add(line);
    const d = picks[0].distanceTo(picks[1]), dh = picks[1].y - picks[0].y;
    label.innerHTML = `<b>${d.toFixed(2)} m</b> · Δh ${dh >= 0 ? "+" : ""}${dh.toFixed(2)} m`;
    label.style.display = "block";
  }
});

// ---------- 7. loop ----------
const timer = new THREE.Timer();
timer.connect(document);
const mid = new THREE.Vector3();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.1);
  puck.rotation.y += dt * 20;
  if (driving) {
    car.position.x += dt * 6;                                                // 6 m/s ≈ 22 km/h
    if (next < STATIONS.length && car.position.x >= STATIONS[next]) scan(STATIONS[next++]);   // one revolution per station
    if (next >= STATIONS.length && car.position.x > STATIONS.at(-1) + 4) driving = false;
  }
  $("#stats").textContent = `${count.toLocaleString()} points · ${next}/${STATIONS.length} scans`;
  if (picks.length === 2) {                                                  // keep the label on the line's midpoint
    mid.copy(picks[0]).add(picks[1]).multiplyScalar(0.5).project(camera);
    Object.assign(label.style, { left: (mid.x + 1) / 2 * innerWidth + "px", top: (1 - mid.y) / 2 * innerHeight + "px" });
  }
  controls.update();
  renderer.render(scene, camera);
});

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
$("#drive").click();                                                          // start mapping straight away
```

Try these: switch to **Intensity** and the road paint jumps out (retro-reflective lines return far more light than asphalt); switch to **Class** for the labels an annotated dataset would carry; drag **Max height** down to about 2.5 m for a "floor plan" of the street at kerb level; and **Measure** a car (about 4.3 m) or the road width.

## How it works

| Feature | Technique |
|---|---|
| sensor model | 16 elevation angles × 720 azimuths per revolution; each ray intersected with `Ray.intersectBox` / `intersectSphere` / the ground plane analytically, which is far faster than `Raycaster` against meshes |
| realism | Gaussian-ish range noise, a minimum range, and **intensity = reflectivity × (0.35 + 0.65·cos incidence)**, so road paint and number plates stand out as they do in real data |
| buffers | preallocated typed arrays sized for the whole run, `DynamicDrawUsage`, and `setDrawRange(0, count)` as points arrive: no reallocation, ever |
| per-point data | height, intensity, range and class kept in parallel arrays, so colour modes are a loop over `count` writing into the colour buffer |
| colour ramps | HSL ramps written with `Color.toArray` (handles linear colour space for `vertexColors`) |
| height slice | one `Plane` in `material.clippingPlanes` with `renderer.localClippingEnabled`; moving the slider just changes `plane.constant` |
| mapping | the car drives along x and performs one revolution at each station; points accumulate in world coordinates (a real system would use GNSS/IMU or SLAM to know the pose) |
| picking | `Raycaster` with `params.Points.threshold`; `intersection.index` snaps to the real point; markers render on top with `depthTest: false` |

:::tip Real-world scale
A real mobile-mapping run produces hundreds of millions of points. Viewers like **Potree** and **3D Tiles** point clouds stream an **octree**: coarse points for the whole scene, more detail only where the camera looks, within a fixed point budget. For custom viewers, compute colours in a vertex shader from attributes (so switching modes costs nothing), use **eye-dome lighting** to give depth to unlit points, and move parsing to a Web Worker.
:::

:::exercise Extend it
1. Move the colour ramps into a `ShaderMaterial`: pass height, intensity, range and class as attributes and a `mode` uniform, so switching modes is instant even with millions of points.
2. Add a **ground filter**: classify points as ground if their height is within 15 cm of the lowest point in their 1 m × 1 m grid cell, and hide them.
3. Add a **box-crop tool** with `TransformControls` and six clipping planes, and export the cropped points as an ASCII PCD (`# .PCD v0.7` header + `x y z intensity` lines) with a download link.
4. Simulate **motion distortion**: let the car keep moving *during* a revolution and see the smeared scans; then correct it ("de-skewing") using the known speed.
5. Add **circular scan lines** in a 2D "bird's-eye" canvas view: the classic range-image visualisation used in autonomous driving.
:::

:::keypoints
- Point clouds render as one `Points` object; use **preallocated typed arrays**, `DynamicDrawUsage` and `setDrawRange` for streaming data.
- A LiDAR simulator is just **rays from a spinning sensor**; analytic ray–primitive tests make it fast enough to run in a frame.
- Keep per-point attributes (height, intensity, range, class) to drive **colour modes** and analysis.
- Clipping planes give instant **slices**, and `Raycaster` with a points threshold gives **picking and measurement**.
- At scale, stream with **octrees** (Potree, 3D Tiles) under a point budget.
:::
