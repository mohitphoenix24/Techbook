---
title: The Math You Actually Need
level: intermediate
time: 35
summary: Vectors, the dot and cross product, radians, Euler angles versus quaternions, matrices, and smooth interpolation with lerp and damp — each explained with a problem it solves in real apps.
---

3D programming has a reputation for heavy math. In practice you need a small toolkit used over and over: **vectors** for positions and directions, two products (**dot** and **cross**), a way to describe **rotations** that doesn't break, and **interpolation** to move things smoothly. Three.js implements all of it; your job is to know which tool fits which problem.

## Vectors

:::def Vector3
Three numbers `(x, y, z)`. The same type means two different things: a **point** (a position in space) or a **direction with a length** (a velocity, an offset, an arrow). Three.js uses `THREE.Vector3` for both.
:::

```js run title="Vector basics (console)" level=easy
import * as THREE from "three";

const player = new THREE.Vector3(1, 0, 2);
const enemy = new THREE.Vector3(4, 0, 6);

// direction FROM player TO enemy = enemy − player
const toEnemy = new THREE.Vector3().subVectors(enemy, player);
console.log("offset player → enemy:", toEnemy);            // (3, 0, 4)
console.log("distance:", toEnemy.length());                 // 5 (a 3-4-5 triangle)
console.log("same thing:", player.distanceTo(enemy));

// a unit vector keeps the direction but has length 1
const dir = toEnemy.clone().normalize();
console.log("direction (normalized):", dir, "length", dir.length());

// move the player 2 m towards the enemy
const step = dir.clone().multiplyScalar(2);
player.add(step);
console.log("player after moving:", player);

// most methods MUTATE and return `this`, so they chain
const v = new THREE.Vector3(1, 2, 3).multiplyScalar(2).add(new THREE.Vector3(0, 1, 0));
console.log("chained:", v);
```

:::warn Vectors are mutable
`a.add(b)` changes `a` in place. If you still need the original, `clone()` first. Mutation is deliberate: creating new vectors every frame produces garbage that triggers the garbage collector and stutters. A common pattern is to reuse "scratch" vectors declared once outside the loop.
:::

| Method | Meaning |
|---|---|
| `add(v)`, `sub(v)`, `multiplyScalar(s)` | arithmetic (in place) |
| `subVectors(a, b)` | `this = a − b`: the offset from b to a |
| `length()`, `distanceTo(v)` | sizes and distances |
| `normalize()` | keep the direction, set length to 1 |
| `lerp(v, t)` | move a fraction `t` of the way to `v` |
| `applyQuaternion(q)`, `applyMatrix4(m)` | rotate / transform a vector |
| `project(camera)` | 3D point → screen coordinates (for HTML labels) |

## The dot product: "how aligned are two directions?"

:::def Dot product
For two **unit** vectors, `a.dot(b)` is the cosine of the angle between them: **1** = same direction, **0** = perpendicular, **−1** = opposite. It answers "is this in front of me?", "how much does this surface face the light?" and "what's the angle between these?"
:::

A guard can "see" the player if the player is within its field of view. That's a dot product against the guard's forward direction. Move the yellow target with your mouse:

```js run title="Field of view with the dot product" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 12, 0.01);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.5), new THREE.GridHelper(14, 14));

const FOV = THREE.MathUtils.degToRad(70);              // the guard sees 70° wide
const guard = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#818cf8" }));
scene.add(guard);
// a flat wedge showing what the guard can see, centred on its +z ("forward") axis
const cone = new THREE.Mesh(new THREE.CircleGeometry(5, 32, Math.PI / 2 - FOV / 2, FOV).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: "#818cf8", transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
guard.add(cone);
const target = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: "#facc15" }));
scene.add(target);

const hud = document.createElement("div");
hud.className = "overlay";
document.body.appendChild(hud);

// mouse → point on the ground (raycasting is explained in the Interaction lesson)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
addEventListener("pointermove", (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  ray.ray.intersectPlane(ground, target.position);
});
target.position.set(2, 0, 3);

const forward = new THREE.Vector3(), toTarget = new THREE.Vector3();
renderer.setAnimationLoop((t) => {
  guard.rotation.y = Math.sin(t / 1500) * 1.2;                  // the guard looks around
  forward.set(0, 0, 1).applyQuaternion(guard.quaternion);       // its local +z in world space
  toTarget.subVectors(target.position, guard.position).normalize();
  const dot = forward.dot(toTarget);
  const angle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dot, -1, 1)));
  const seen = dot > Math.cos(FOV / 2) && guard.position.distanceTo(target.position) < 5;
  target.material.color.set(seen ? "#ef4444" : "#facc15");
  hud.innerHTML = `<span>dot = <b>${dot.toFixed(2)}</b> · angle = ${angle.toFixed(0)}° · ${seen ? "<b style='color:#ef4444'>SPOTTED</b>" : "hidden"}</span>`;
  renderer.render(scene, camera);
});
```

The whole test is one line: the target is inside the field of view when `dot > cos(fov / 2)`. No angles, no trigonometry per object, which is why games run it for hundreds of characters every frame.

## The cross product: "which way is perpendicular?"

:::def Cross product
`a.cross(b)` returns a vector **perpendicular to both** a and b. Its length is largest when they're at 90°, and zero when they're parallel. Use it to compute a surface's **normal** from two edges, find "right" from "forward" and "up", or decide whether to turn left or right.
:::

```js run title="Normals and left/right with the cross product (console)" level=intermediate
import * as THREE from "three";

// a triangle lying flat on the ground (counter-clockwise when seen from above)
const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(1, 0, 1), c = new THREE.Vector3(1, 0, 0);
const edge1 = new THREE.Vector3().subVectors(b, a);
const edge2 = new THREE.Vector3().subVectors(c, a);
const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
console.log("triangle normal:", normal);            // (0, 1, 0): it faces up

// "right" vector from forward and up — how cameras and characters build their axes
const forward = new THREE.Vector3(0, 0, -1), up = new THREE.Vector3(0, 1, 0);
console.log("right:", new THREE.Vector3().crossVectors(forward, up));   // (1, 0, 0)

// should a car turn left or right to face a target? sign of the cross product's y
const heading = new THREE.Vector3(0, 0, 1);
for (const target of [new THREE.Vector3(2, 0, 5), new THREE.Vector3(-3, 0, 1)]) {
  const turn = new THREE.Vector3().crossVectors(heading, target).y;
  console.log("target", target, "→ turn", turn > 0 ? "left" : "right");
}
```

## Radians and handy helpers

`THREE.MathUtils` collects small functions you'll use constantly:

| Helper | Example | Use |
|---|---|---|
| `degToRad(d)` / `radToDeg(r)` | `degToRad(90)` → 1.5708 | UI and data in degrees, three.js in radians |
| `clamp(x, min, max)` | `clamp(zoom, 1, 10)` | keep values in range |
| `lerp(a, b, t)` | `lerp(0, 100, 0.25)` → 25 | blend between values |
| `mapLinear(x, a1, a2, b1, b2)` | map 0–1023 sensor to 0–180° | rescale ranges |
| `damp(x, y, lambda, dt)` | smooth follow | frame-rate independent easing |
| `smoothstep(x, min, max)` | soft transitions | fades, thresholds |
| `randFloat(a, b)`, `randFloatSpread(r)` | scatter objects | randomness |

## Rotations: Euler angles vs. quaternions

:::def Euler angles
A rotation written as three angles around X, Y and Z, applied in an **order** (default `"XYZ"`). Easy to read and type, which is why `object.rotation` uses them. But combining or interpolating Euler angles gives weird paths, and in some orientations two axes line up and you lose one degree of freedom: **gimbal lock**.
:::

:::def Quaternion
A four-number representation of a rotation `(x, y, z, w)` that has no gimbal lock and interpolates smoothly along the shortest path (**slerp**). You rarely read the numbers. You create quaternions from axes and angles, multiply them to combine rotations, and slerp between them. `object.quaternion` is kept in sync with `object.rotation` automatically.
:::

Both cubes below turn between the same two orientations. The left one interpolates its Euler angles; the right one slerps quaternions. Watch the left one wobble off the direct path:

```js run title="Euler lerp vs quaternion slerp" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 6);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.5));

function makeCube(x, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color }));
  m.add(new THREE.AxesHelper(1));
  m.position.x = x;
  scene.add(m);
  return m;
}
const eulerCube = makeCube(-1.4, "#f472b6");
const quatCube = makeCube(1.4, "#34d399");

const fromE = new THREE.Euler(0, 0, 0), toE = new THREE.Euler(Math.PI / 2, Math.PI / 2, Math.PI / 2);
const fromQ = new THREE.Quaternion().setFromEuler(fromE), toQ = new THREE.Quaternion().setFromEuler(toE);

renderer.setAnimationLoop((t) => {
  const k = (Math.sin(t / 1200) + 1) / 2;                   // 0 → 1 → 0 smoothly
  eulerCube.rotation.set(                                   // naive: lerp each angle separately
    THREE.MathUtils.lerp(fromE.x, toE.x, k),
    THREE.MathUtils.lerp(fromE.y, toE.y, k),
    THREE.MathUtils.lerp(fromE.z, toE.z, k));
  quatCube.quaternion.slerpQuaternions(fromQ, toQ, k);      // shortest arc
  renderer.render(scene, camera);
});
```

Rules of thumb:

- **Set** rotations with `rotation` (Euler) when it's simple: `door.rotation.y = angle`.
- **Combine, interpolate or store** rotations with quaternions: camera transitions, IK, network sync, VR controller poses (WebXR gives you quaternions).
- `object.rotateOnAxis(axis, angle)` and `Quaternion.setFromAxisAngle(axis, angle)` rotate around any axis without thinking about Euler order.

## Matrices (in one paragraph)

Every object has a 4×4 `matrix` (local) and `matrixWorld` (relative to the scene) that pack position, rotation and scale into one structure the GPU can multiply quickly. You'll touch them directly when **instancing** (each instance is a matrix), working with **WebXR poses**, or **decomposing** a transform:

```js run title="compose / decompose (console)" level=intermediate
import * as THREE from "three";

const m = new THREE.Matrix4().compose(
  new THREE.Vector3(1, 2, 3),                                       // position
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
  new THREE.Vector3(2, 2, 2)                                        // scale
);
console.log(m);

const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
m.decompose(p, q, s);
console.log("position", p, "scale", s);
console.log("rotation", new THREE.Euler().setFromQuaternion(q));

// a point 1 m in front of the object, in world space
console.log("transformed point:", new THREE.Vector3(0, 0, 1).applyMatrix4(m));
```

## Smooth motion: lerp and damp

The most useful animation trick in real-time graphics: each frame, move a value a **fraction** of the way towards its target. It eases out naturally and reacts instantly when the target changes, with no timelines.

```js
// ❌ frame-rate dependent: faster on 120 Hz screens
mesh.position.lerp(target, 0.1);

// ✅ frame-rate independent: lambda = responsiveness, dt = seconds since last frame
mesh.position.x = THREE.MathUtils.damp(mesh.position.x, target.x, 6, dt);
```

```js run title="Smooth follow with damp" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 10);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.5));

const followers = ["#34d399", "#818cf8", "#f472b6"].map((color, i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.35 - i * 0.08), new THREE.MeshStandardMaterial({ color }));
  scene.add(m);
  return { mesh: m, lambda: [12, 5, 2][i] };              // higher = snappier
});

const goal = new THREE.Vector3();
addEventListener("pointermove", (e) => {
  goal.set((e.clientX / innerWidth - 0.5) * 14, -(e.clientY / innerHeight - 0.5) * 8, 0);
});

const hud = document.createElement("div");
hud.className = "overlay";
hud.innerHTML = "Move the mouse. Green λ=12, purple λ=5, pink λ=2.";
document.body.appendChild(hud);

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  for (const { mesh, lambda } of followers) {
    mesh.position.x = THREE.MathUtils.damp(mesh.position.x, goal.x, lambda, dt);
    mesh.position.y = THREE.MathUtils.damp(mesh.position.y, goal.y, lambda, dt);
  }
  renderer.render(scene, camera);
});
```

:::tip Where you'll use this
Camera rigs that glide to a selected product, UI panels that follow a VR controller, a character turning towards where you clicked, values on a dashboard settling on new data. In R3F, the `maath` library's `easing.damp3` does the same for whole vectors and colours.
:::

## Check yourself

```quiz
? Two unit vectors have a dot product of 0. What does that mean?
- They point the same way
+ They are perpendicular
- One of them has zero length
> cos(90°) = 0.

? What is the direction from point A to point B?
+ B − A (then normalize)
- A − B
- A × B
> Destination minus origin.

? Why use quaternions for interpolating rotations?
+ They take the shortest path smoothly and avoid gimbal lock
- They are easier to type
- Euler angles can't represent 3D rotations
> Euler is fine for setting, poor for blending.

? Why is `position.lerp(target, 0.1)` every frame a problem?
+ The speed depends on the frame rate
- lerp only works on numbers
- It never reaches the target
> Use damp with delta time for consistent motion on any screen.

? What does `a.cross(b)` give you?
- The angle between a and b
+ A vector perpendicular to both
- The distance between a and b
> That's how normals and "right" vectors are computed.
```

:::exercise Orbit with vectors
Without using groups, make a sphere orbit the origin at radius 3 by computing its position each frame from an angle: `x = cos(angle) * r`, `z = sin(angle) * r`. Then make a second sphere always sit **halfway** between the first one and the point `(0, 2, 0)` using `lerpVectors`.
:::

:::solution
```js run
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 6, 8);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.5), new THREE.GridHelper(8, 8));

const orbiter = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: "#34d399" }));
const middle = new THREE.Mesh(new THREE.SphereGeometry(0.18), new THREE.MeshStandardMaterial({ color: "#f472b6" }));
const top = new THREE.Vector3(0, 2, 0);
scene.add(orbiter, middle);

renderer.setAnimationLoop((t) => {
  const angle = t / 1000;
  orbiter.position.set(Math.cos(angle) * 3, 0, Math.sin(angle) * 3);
  middle.position.lerpVectors(orbiter.position, top, 0.5);
  renderer.render(scene, camera);
});
```
:::

:::keypoints
- `Vector3` holds points and directions; B − A is the offset from A to B; `normalize()` keeps only the direction.
- **Dot** = how aligned (field of view, lighting, angles). **Cross** = perpendicular (normals, left/right).
- Rotations are radians. Use **Euler** to set simple rotations and **quaternions** to combine or interpolate.
- Matrices pack position + rotation + scale; `compose` / `decompose` convert both ways.
- Smooth everything with `MathUtils.damp(current, target, lambda, dt)`, which is frame-rate independent.
- Reuse scratch vectors instead of allocating new ones every frame.
:::
