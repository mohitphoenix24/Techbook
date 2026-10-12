---
title: Objects, Transforms & the Scene Graph
level: easy
time: 25
summary: Position, rotation and scale; groups and parent–child hierarchies; local versus world coordinates; lookAt; finding and walking through objects. The ideas behind every robot arm, solar system and character rig.
---

Everything you place in a three.js scene (meshes, lights, cameras, groups) is an **Object3D**. Every Object3D has the same three transform properties and can hold children. Master these and you can build anything from a clock to a robot arm, because complex motion is just simple motions **nested** inside each other.

:::def Object3D
The base class of everything in a scene. It has a `position`, `rotation` and `scale`, a list of `children`, a `parent`, and methods such as `add()`, `remove()`, `lookAt()` and `traverse()`. `Mesh`, `Group`, `Light`, `Camera` and `Scene` all extend it.
:::

:::def Transform
The combination of **position** (where), **rotation** (which way it faces) and **scale** (how big). Three.js combines them into a 4×4 **matrix** for the GPU, but you usually just set the three properties.
:::

## Position, rotation, scale

```js run title="Transform playground" level=easy
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(4, 3, 6);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.GridHelper(8, 8), new THREE.AxesHelper(1.5));
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.5));

const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#34d399" }));
box.add(new THREE.AxesHelper(0.9));                   // the box's OWN axes rotate with it
scene.add(box);

const ui = document.createElement("div");
ui.className = "overlay";
const sliders = [
  ["position.x", -3, 3, 0.1], ["position.y", 0, 3, 0.1],
  ["rotation.y", -3.14, 3.14, 0.01], ["rotation.x", -3.14, 3.14, 0.01],
  ["scale.x", 0.2, 3, 0.1], ["scale.y", 0.2, 3, 0.1],
];
ui.innerHTML = sliders.map(([p, min, max, step]) =>
  `<label><code style="width:80px">${p}</code><input data-p="${p}" type="range" min="${min}" max="${max}" step="${step}" value="${p.startsWith("scale") ? 1 : p === "position.y" ? 0.5 : 0}"></label>`).join("");
document.body.appendChild(ui);
ui.oninput = (e) => {
  const [prop, axis] = e.target.dataset.p.split(".");
  box[prop][axis] = +e.target.value;                 // e.g. box.rotation.y = 1.2
};
box.position.y = 0.5;

renderer.setAnimationLoop(() => renderer.render(scene, camera));
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

| Property | Type | Units | Handy methods |
|---|---|---|---|
| `position` | `Vector3` | metres | `.set(x, y, z)`, `.copy(v)`, `.add(v)` |
| `rotation` | `Euler` | **radians** | `.set(x, y, z)`; `rotateY(angle)` on the object |
| `scale` | `Vector3` | multiplier (1 = original) | `.setScalar(2)` for uniform scaling |
| `quaternion` | `Quaternion` | — | an alternative to `rotation`, kept in sync |

:::warn Radians, not degrees
`rotation.y = 90` spins the object about 14 full turns. Rotations are in **radians**: a full turn is `2 * Math.PI` (≈ 6.28), a quarter turn `Math.PI / 2`. Convert with `THREE.MathUtils.degToRad(90)`.
:::

## Groups and the scene graph

:::def Scene graph
The tree of objects in your scene. Each child's transform is **relative to its parent**: move the parent and all children move with it. The scene is the root.
:::

A **`Group`** is an invisible Object3D used purely to organise and move things together. The classic demo is a solar system: the Moon orbits the Earth, which orbits the Sun, with no orbital math, only rotating groups.

```js run title="A solar system from nested groups" level=easy
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#05070f");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 7, 9);
camera.lookAt(0, 0, 0);

const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: "#fbbf24" }));
scene.add(sun);
scene.add(new THREE.PointLight("#fff7e0", 60, 0, 1.5));   // light at the sun's position
scene.add(new THREE.AmbientLight("#ffffff", 0.15));

// earthOrbit spins around the sun; earth sits 4 units out inside it
const earthOrbit = new THREE.Group();
scene.add(earthOrbit);
const earth = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), new THREE.MeshStandardMaterial({ color: "#3b82f6" }));
earth.position.x = 4;
earthOrbit.add(earth);

// moonOrbit is a child of the EARTH, so it follows the earth automatically
const moonOrbit = new THREE.Group();
earth.add(moonOrbit);
const moon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshStandardMaterial({ color: "#cbd5e1" }));
moon.position.x = 0.8;
moonOrbit.add(moon);

renderer.setAnimationLoop((t) => {
  const s = t / 1000;
  earthOrbit.rotation.y = s * 0.4;     // one turn every ~16 s
  earth.rotation.y = s * 2;            // the earth's day (also spins its moonOrbit child)
  moonOrbit.rotation.y = s * 1.5;
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

:::analogy
A scene graph works like your body. Rotate your shoulder and your elbow, wrist and fingers all move with it, but each joint can still bend on its own relative to the one above. Robot arms, character skeletons, car wheels on a car body and doors on a building are all built this way.
:::

## Local vs. world coordinates

A child's `position` is **local**: measured from its parent. To ask "where is this object in the world right now?", use `getWorldPosition()`. That's how you aim a camera at a moving moon, attach effects, or measure distances between objects in different groups.

```js run title="Local vs world position" level=intermediate
import * as THREE from "three";

const arm = new THREE.Group();
arm.position.set(2, 0, 0);
arm.rotation.z = Math.PI / 2;            // rotate the parent 90° around z

const hand = new THREE.Object3D();
hand.position.set(1, 0, 0);              // 1 m along the ARM's x axis
arm.add(hand);

arm.updateMatrixWorld();                 // three.js does this before each render; we're not rendering

const world = new THREE.Vector3();
hand.getWorldPosition(world);
console.log("hand local position:", hand.position);
console.log("hand world position:", world);          // ≈ (2, 1, 0): the arm's x now points up

// and the reverse: convert a world point into the arm's local space
const local = arm.worldToLocal(new THREE.Vector3(2, 3, 0));
console.log("world (2,3,0) in arm space:", local);
```

:::note `updateMatrixWorld`
Three.js recomputes world matrices automatically just before rendering. If you read world positions **outside** the render loop right after changing transforms (as above), call `object.updateMatrixWorld()` first.
:::

## Making things face each other: lookAt

`object.lookAt(x, y, z)` rotates an object so its **front** (its local **+z** for meshes, **−z** for cameras and lights) points at a target. Turrets, eyes, name tags and security cameras use it every frame.

```js run title="A turret tracking a target" level=easy
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 6, 8);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.5), new THREE.GridHelper(10, 10));

const turret = new THREE.Group();
const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 24), new THREE.MeshStandardMaterial({ color: "#64748b" }));
const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.2), new THREE.MeshStandardMaterial({ color: "#f472b6" }));
barrel.position.set(0, 0.35, 0.5);       // sticks out along +z, the "front"
turret.add(base, barrel);
scene.add(turret);

const target = new THREE.Mesh(new THREE.SphereGeometry(0.25), new THREE.MeshStandardMaterial({ color: "#facc15", emissive: "#a16207" }));
scene.add(target);

renderer.setAnimationLoop((t) => {
  const s = t / 1000;
  target.position.set(Math.cos(s) * 3.5, 0.3, Math.sin(s * 1.3) * 3);
  turret.lookAt(target.position.x, turret.position.y, target.position.z);   // keep it level
  renderer.render(scene, camera);
});
```

## Finding and walking objects

Loaded models arrive as deep hierarchies. These methods help you find the parts you need:

```js
scene.add(robot);
robot.name = "robot";
const claw = robot.getObjectByName("Claw");        // first descendant with that name

robot.traverse((obj) => {                          // visit every descendant
  if (obj.isMesh) {
    obj.castShadow = true;
    console.log(obj.name, obj.geometry.attributes.position.count, "vertices");
  }
});

robot.visible = false;                             // hide without removing
scene.remove(robot);                               // detach from the scene
const copy = robot.clone();                        // shares geometry & materials
```

| Method | Use it to |
|---|---|
| `add(a, b, …)` / `remove(a)` | build and edit the hierarchy |
| `attach(obj)` | re-parent **keeping** its world transform (e.g. picking up an object) |
| `getObjectByName(name)` | find a part in a loaded model |
| `traverse(fn)` | apply something to every descendant |
| `getWorldPosition / Quaternion / Scale` | read world-space values |
| `localToWorld(v)` / `worldToLocal(v)` | convert points between spaces |
| `lookAt(v)` | face a point |

:::ai
Robotics teams use exactly this structure for **digital twins**: each robot link is a child of the previous joint, so setting six joint angles positions the whole arm (forward kinematics). The Project Lab builds a 6-axis robot arm this way, and the Applications module covers URDF robot descriptions that load straight into this hierarchy.
:::

## Check yourself

```quiz
? A child at local position (1, 0, 0) has a parent at world position (3, 0, 0) with no rotation. What is the child's world position?
+ (4, 0, 0)
- (1, 0, 0)
- (3, 0, 0)
> Local transforms add up through the hierarchy.

? How do you rotate an object a quarter turn around Y?
- object.rotation.y = 90
+ object.rotation.y = Math.PI / 2
- object.rotate(90)
> Rotations are in radians; π/2 is 90°.

? What does a `Group` draw on screen?
+ Nothing — it only organises and transforms its children
- A bounding box
- A wireframe
> Groups are invisible containers.

? Which method re-parents an object without it jumping?
- add()
+ attach()
- clone()
> attach() keeps the world transform; add() keeps the local transform.
```

:::exercise Add a satellite
In the solar system example, add a tiny red **satellite** that orbits the **Moon** (not the Earth). Hint: create a `satelliteOrbit` group as a child of `moon`.
:::

:::solution
```js run
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#05070f");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 7, 9);
camera.lookAt(0, 0, 0);
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: "#fbbf24" })));
scene.add(new THREE.PointLight("#fff7e0", 60, 0, 1.5), new THREE.AmbientLight("#fff", 0.15));

const earthOrbit = new THREE.Group();
const earth = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), new THREE.MeshStandardMaterial({ color: "#3b82f6" }));
earth.position.x = 4;
const moonOrbit = new THREE.Group();
const moon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshStandardMaterial({ color: "#cbd5e1" }));
moon.position.x = 0.8;
const satelliteOrbit = new THREE.Group();                 // child of the moon
const satellite = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: "#ef4444" }));
satellite.position.x = 0.25;
scene.add(earthOrbit); earthOrbit.add(earth); earth.add(moonOrbit); moonOrbit.add(moon);
moon.add(satelliteOrbit); satelliteOrbit.add(satellite);

renderer.setAnimationLoop((t) => {
  const s = t / 1000;
  earthOrbit.rotation.y = s * 0.4;
  earth.rotation.y = s * 2;
  moonOrbit.rotation.y = s * 1.5;
  satelliteOrbit.rotation.z = s * 4;                      // orbit on a different plane
  renderer.render(scene, camera);
});
```
:::

:::keypoints
- Everything is an **Object3D** with `position`, `rotation` (radians) and `scale`.
- Children are positioned **relative to their parent**; nest groups to compose motion.
- `getWorldPosition()` and `worldToLocal()` convert between local and world space.
- `lookAt()` points an object's front at a target; `attach()` re-parents without a jump.
- `getObjectByName()` and `traverse()` are how you work with loaded models.
:::
