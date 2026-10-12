---
title: Cameras & Controls
level: intermediate
time: 30
summary: Perspective and orthographic cameras, field of view, near and far planes, the frustum, OrbitControls tuned for products, map, first-person and gizmo controls, smooth camera moves, fly-through paths, and switching viewpoints.
---

The camera decides what the user sees, and the controls decide how they explore. A product page wants a gentle orbit that can't flip under the floor; a CAD tool wants an orthographic view and a gizmo; a game wants a first-person camera; a data story wants scripted flights. Three.js has building blocks for all of them.

## Perspective vs. orthographic

:::def PerspectiveCamera
Mimics an eye or a photo camera: distant things look smaller and parallel lines converge. Defined by a vertical **field of view** (degrees), an **aspect** ratio (width / height), and **near** / **far** clipping distances.
:::

:::def OrthographicCamera
Draws without perspective: an object is the same size at any distance, and parallel lines stay parallel. Defined by a box (`left`, `right`, `top`, `bottom`, `near`, `far`). Used for CAD and engineering drawings, isometric games, 2D-in-3D UIs, maps and shadow cameras.
:::

```js run title="Switch between the two cameras" level=easy
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.5));
const sun = new THREE.DirectionalLight("#fff", 2);
sun.position.set(3, 5, 2);
scene.add(sun, new THREE.GridHelper(20, 20));

// a city block: rows of boxes going into the distance
for (let x = -4; x <= 4; x += 2) for (let z = -10; z <= 4; z += 2) {
  const h = 0.5 + Math.abs(Math.sin(x * 3.1 + z * 1.7)) * 2.5;
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 1.2), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.6 + h * 0.05, 0.5, 0.6) }));
  b.position.set(x, h / 2, z);
  scene.add(b);
}

const aspect = innerWidth / innerHeight;
const persp = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
const size = 8;                                               // how many metres tall the ortho view is
const ortho = new THREE.OrthographicCamera(-size * aspect / 2, size * aspect / 2, size / 2, -size / 2, 0.1, 100);
for (const cam of [persp, ortho]) cam.position.set(9, 8, 10);
let camera = persp;
let controls = new OrbitControls(camera, renderer.domElement);

const btn = document.createElement("button");
btn.className = "overlay";
btn.textContent = "Switch to orthographic";
document.body.appendChild(btn);
btn.onclick = () => {
  const next = camera === persp ? ortho : persp;
  next.position.copy(camera.position);
  next.quaternion.copy(camera.quaternion);
  controls.dispose();
  camera = next;
  controls = new OrbitControls(camera, renderer.domElement);
  btn.textContent = camera === persp ? "Switch to orthographic" : "Switch to perspective";
};

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

## Field of view, near and far

| Setting | Effect | Typical |
|---|---|---|
| `fov` | vertical viewing angle. Small = telephoto, flat; large = wide-angle, dramatic distortion | 35–50 product shots, 50–75 general, VR sets its own |
| `near` | closest distance drawn | 0.1 (not 0!) |
| `far` | farthest distance drawn | just beyond your scene |
| `zoom` | magnifies without moving | 1 |

:::warn Don't make near tiny and far huge
Depth precision is spread between `near` and `far`, and most of it is spent close to `near`. `near: 0.0001, far: 1e6` makes distant surfaces fight over which is in front (**z-fighting**: flickering stripes). Keep the ratio far/near as small as your scene allows. For planet-to-street scales, `logarithmicDepthBuffer: true` on the renderer helps.
:::

:::def Frustum
The truncated pyramid of space a perspective camera can see, between the near and far planes. Three.js automatically skips drawing objects entirely outside it (**frustum culling**), which is free performance.
:::

After changing `fov`, `aspect`, `near`, `far`, `zoom` or the orthographic box, call `camera.updateProjectionMatrix()`.

## OrbitControls for a product viewer

`OrbitControls` rotates the camera around a target point with drag, zooms with the wheel or a pinch, and pans with right-drag or two fingers. A good product viewer **limits** it so users can't get lost:

```js run title="A well-behaved product orbit" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#f1f5f9");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 50);
camera.position.set(3, 1.6, 4);

// a stand-in "product": a stylised speaker
const product = new THREE.Group();
const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.4, 64), new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.6 }));
const grill = new THREE.Mesh(new THREE.CylinderGeometry(0.505, 0.505, 0.9, 64, 1, true), new THREE.MeshStandardMaterial({ color: "#94a3b8", metalness: 0.8, roughness: 0.35, wireframe: true }));
const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 64), new THREE.MeshStandardMaterial({ color: "#10b981", metalness: 0.5, roughness: 0.2 }));
top.position.y = 0.71;
product.add(body, grill, top);
product.position.y = 0.7;
scene.add(product);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: "#e2e8f0" }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.7, 0);                   // orbit around the product's centre, not the floor
controls.enableDamping = true;                    // inertia: feels physical (needs controls.update() each frame)
controls.dampingFactor = 0.08;
controls.minDistance = 2;                         // can't zoom inside the product
controls.maxDistance = 7;
controls.minPolarAngle = Math.PI * 0.15;          // can't look straight down…
controls.maxPolarAngle = Math.PI * 0.48;          // …or below the floor
controls.enablePan = false;                       // keep the product centred
controls.autoRotate = true;                       // gentle idle spin
controls.autoRotateSpeed = 1.2;
controls.addEventListener("start", () => (controls.autoRotate = false));   // stop when the user grabs it

renderer.setAnimationLoop(() => {
  controls.update();                              // required for damping and autoRotate
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

| OrbitControls option | Purpose |
|---|---|
| `target` | the point it orbits around |
| `enableDamping` + `dampingFactor` | smooth inertia (call `update()` every frame) |
| `minDistance` / `maxDistance` | zoom limits (perspective) — `minZoom` / `maxZoom` for orthographic |
| `minPolarAngle` / `maxPolarAngle` | vertical limits (0 = from above, π = from below) |
| `minAzimuthAngle` / `maxAzimuthAngle` | horizontal limits (e.g. only show the front of a car) |
| `enablePan`, `enableZoom`, `enableRotate` | turn gestures off |
| `autoRotate` + `autoRotateSpeed` | turntable mode |
| events `start`, `change`, `end` | react to interaction (e.g. render on demand, analytics) |

## The other controls

| Control | Import from `three/addons/controls/` | Feels like |
|---|---|---|
| `MapControls` | `MapControls.js` | Google Maps: drag pans, right-drag rotates. City and floor-plan views |
| `TrackballControls` / `ArcballControls` | `TrackballControls.js` / `ArcballControls.js` | free rotation in any direction, no "up". Molecules, CAD parts |
| `FlyControls` | `FlyControls.js` | spaceship: WASD + mouse look, roll with Q/E |
| `FirstPersonControls` | `FirstPersonControls.js` | simple look-around walking |
| `PointerLockControls` | `PointerLockControls.js` | real FPS games: hides the cursor, mouse look; you add WASD movement and collisions |
| `TransformControls` | `TransformControls.js` | an editor gizmo: drag arrows/rings to move, rotate, scale an object |
| `DragControls` | `DragControls.js` | drag objects on the screen plane |

`TransformControls` turns any scene into a mini editor, the core of level editors, room planners and robot-cell layout tools. It must disable OrbitControls while you drag the gizmo:

```js run title="An editor gizmo with TransformControls" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(4, 3.5, 5);
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.5), new THREE.GridHelper(10, 20));
const sun = new THREE.DirectionalLight("#fff", 2);
sun.position.set(3, 6, 4);
scene.add(sun);

const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#f59e0b" }));
crate.position.y = 0.5;
scene.add(crate);

const orbit = new OrbitControls(camera, renderer.domElement);
const gizmo = new TransformControls(camera, renderer.domElement);
gizmo.attach(crate);
gizmo.setTranslationSnap(0.5);                       // snap to a 0.5 m grid
gizmo.setRotationSnap(THREE.MathUtils.degToRad(15));
scene.add(gizmo.getHelper());                        // the visible arrows / rings
gizmo.addEventListener("dragging-changed", (e) => (orbit.enabled = !e.value));   // don't orbit while dragging

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<div class="row">${["translate", "rotate", "scale"].map((m) => `<button data-m="${m}">${m}</button>`).join("")}</div><span class="muted" id="info"></span>`;
document.body.appendChild(ui);
ui.onclick = (e) => e.target.dataset.m && gizmo.setMode(e.target.dataset.m);
const info = ui.querySelector("#info");
gizmo.addEventListener("objectChange", () => {
  const p = crate.position, r = crate.rotation;
  info.textContent = `pos (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) · rotY ${THREE.MathUtils.radToDeg(r.y).toFixed(0)}°`;
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

## Moving the camera smoothly

Clicking a hotspot should **glide** the camera to a new viewpoint, not teleport it. Damp both the camera position and the controls' target towards goals each frame:

```js run title="Click a hotspot to fly there" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 6, 12);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.6), new THREE.GridHelper(16, 16));
const sun = new THREE.DirectionalLight("#fff", 2);
sun.position.set(3, 6, 4);
scene.add(sun);

const stations = [
  { name: "Overview", color: "#64748b", pos: [0, 0, 0], view: [0, 6, 12] },
  { name: "Robot cell", color: "#f97316", pos: [-4, 0, -2], view: [-1.5, 2.2, 1] },
  { name: "Conveyor", color: "#22c55e", pos: [3, 0, -3], view: [5.5, 2, 0] },
  { name: "Inspection", color: "#6366f1", pos: [1, 0, 4], view: [3.5, 1.8, 7] },
];
stations.slice(1).forEach((s) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshStandardMaterial({ color: s.color }));
  m.position.set(s.pos[0], 0.6, s.pos[2]);
  scene.add(m);
});

const goalPos = camera.position.clone(), goalTarget = new THREE.Vector3();
let flying = false;
const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<div class="row">${stations.map((s, i) => `<button data-i="${i}">${s.name}</button>`).join("")}</div>`;
document.body.appendChild(ui);
ui.onclick = (e) => {
  const s = stations[e.target.dataset.i];
  if (!s) return;
  goalPos.set(...s.view);
  goalTarget.set(s.pos[0], 0.6, s.pos[2]);
  flying = true;
};
controls.addEventListener("start", () => (flying = false));   // user takes over → stop flying

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  if (flying) {
    const k = 1 - Math.exp(-4 * dt);                  // the same maths as MathUtils.damp, applied to vectors
    camera.position.lerp(goalPos, k);
    controls.target.lerp(goalTarget, k);
    if (camera.position.distanceTo(goalPos) < 0.01) flying = false;
  }
  controls.update();
  renderer.render(scene, camera);
});
```

:::tip Libraries for camera moves
In R3F, drei's `<CameraControls>` (a wrapper of the `camera-controls` library) has `setLookAt(…, true)` for animated transitions, `fitToBox()` to frame an object, and smooth damping built in. In plain three.js, `camera-controls` works too, or animate with GSAP (next lesson).
:::

## Fly-through paths

For guided tours and scroll-driven stories, put the camera on a **curve** and move a parameter `t` from 0 to 1. `CatmullRomCurve3` makes a smooth curve through any list of points:

```js run title="A camera on rails" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#020617");
scene.fog = new THREE.FogExp2("#020617", 0.06);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 100);
scene.add(new THREE.HemisphereLight("#a5b4fc", "#020617", 2));

const path = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(6, 2, -6), new THREE.Vector3(0, 4, -14),
  new THREE.Vector3(-8, 1, -10), new THREE.Vector3(-6, -1, 0),
], true);                                                      // true = closed loop

// a tunnel of rings along the path, and a faint tube showing it
const ring = new THREE.TorusGeometry(1.4, 0.06, 8, 48);
const ringMat = new THREE.MeshStandardMaterial({ color: "#34d399", emissive: "#065f46" });
for (let i = 0; i < 60; i++) {
  const t = i / 60, p = path.getPointAt(t), tangent = path.getTangentAt(t);
  const r = new THREE.Mesh(ring, ringMat);
  r.position.copy(p);
  r.lookAt(p.clone().add(tangent));                            // face along the path
  scene.add(r);
}
scene.add(new THREE.Mesh(new THREE.TubeGeometry(path, 300, 0.03, 6, true), new THREE.MeshBasicMaterial({ color: "#818cf8" })));

renderer.setAnimationLoop((time) => {
  const t = (time / 20000) % 1;                                // one lap every 20 s
  camera.position.copy(path.getPointAt(t));
  camera.lookAt(path.getPointAt((t + 0.01) % 1));              // look a little ahead
  renderer.render(scene, camera);
});
```

## Check yourself

```quiz
? Which camera keeps objects the same size regardless of distance?
+ OrthographicCamera
- PerspectiveCamera
- CubeCamera
> No perspective foreshortening — ideal for CAD and isometric views.

? Distant surfaces flicker in stripes. What's the likely cause?
+ The near/far range is too large (near too small), causing z-fighting
- The fov is too small
- Too many lights
> Depth precision is spread between near and far.

? With `enableDamping = true`, what must you do every frame?
- Nothing
+ Call controls.update()
- Call camera.updateProjectionMatrix()
> Damping is integrated inside update().

? Why disable OrbitControls while dragging a TransformControls gizmo?
+ Otherwise dragging the gizmo would also orbit the camera
- TransformControls requires OrbitControls to be disposed
- For performance
> Listen to dragging-changed and toggle orbit.enabled.

? How do you keep users from orbiting below the floor in a product viewer?
- Set enablePan = false
+ Set maxPolarAngle to just under π/2
- Set minDistance
> The polar angle is measured from straight above.
```

:::exercise Keyboard turntable
In the product viewer, add keyboard support: the **left/right arrow** keys rotate the view by 15° around the product (hint: move the camera around `controls.target` using spherical coordinates, or rotate the offset vector `camera.position − target` around the Y axis with `applyAxisAngle`). Accessibility matters: not everyone can drag.
:::

:::solution
```js run
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 50);
camera.position.set(3, 1.6, 4);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2));
const product = new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.18, 128, 16), new THREE.MeshStandardMaterial({ color: "#10b981" }));
product.position.y = 0.7;
scene.add(product);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.7, 0);
controls.enableDamping = true;

const UP = new THREE.Vector3(0, 1, 0), offset = new THREE.Vector3();
addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const angle = THREE.MathUtils.degToRad(e.key === "ArrowLeft" ? 15 : -15);
  offset.subVectors(camera.position, controls.target).applyAxisAngle(UP, angle);
  camera.position.copy(controls.target).add(offset);
});
const hint = document.createElement("div");
hint.className = "overlay";
hint.textContent = "Click here, then press ← / →";
hint.tabIndex = 0;
document.body.appendChild(hint);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
```
:::

:::keypoints
- **Perspective** for natural views; **orthographic** for CAD, maps, isometric games and 2D-like UIs.
- Keep **near** reasonably large and **far** reasonably small to avoid z-fighting; call `updateProjectionMatrix()` after changes.
- `OrbitControls` with damping, a proper `target` and **limits** makes a great product viewer.
- `MapControls`, `PointerLockControls`, `TransformControls` and friends cover maps, games and editors.
- Animate the camera by **damping** its position and the controls' target towards goals; put it on a **curve** for tours.
:::
