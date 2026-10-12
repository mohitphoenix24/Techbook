---
title: VR with Plain three.js
level: advanced
time: 40
summary: Turning any three.js scene into VR with renderer.xr and VRButton, the emulated Quest you can test with, controllers with real 3D models, pointing and selecting with controller rays, grabbing objects with the grip button, hand tracking with pinch, and what changes in your render loop.
---

three.js has WebXR built into the renderer. Turning a scene into VR takes three lines; making it **interactive** (pointing, selecting, grabbing) takes a bit more, and this lesson builds all of it in plain three.js. The next lesson does the same in React Three Fiber with far less code, but knowing what happens underneath makes you much better at debugging XR.

## Three lines to VR

```js
renderer.xr.enabled = true;                                   // 1. let the renderer drive an XR session
document.body.appendChild(VRButton.createButton(renderer));   // 2. a button that starts it (needs a user click)
renderer.setAnimationLoop(render);                            // 3. the loop the headset can drive (not requestAnimationFrame)
```

`VRButton` checks support, shows "ENTER VR" or "VR NOT SUPPORTED", requests an `immersive-vr` session with `local-floor` on click, and hands it to the renderer. From then on, three.js renders your scene for each eye using the headset's pose. `ARButton` and `XRButton` do the same for AR or "whichever is available".

## The emulator

Every example in this module runs an **emulated Meta Quest 3** (IWER). In plain three.js you install it yourself before creating the session:

```js
import { XRDevice, metaQuest3 } from "iwer";
import { DevUI } from "@iwer/devui";

const device = new XRDevice(metaQuest3);
device.installRuntime({ forceInstall: true });   // provide navigator.xr even if the browser already has one
device.installDevUI(DevUI);                      // the control panels for headset, controllers and hands
```

After you press **ENTER VR**, panels appear: drag in the view to look around, move each controller with its position/rotation fields or by dragging its gizmo, and press **Trigger** / **Grip** / buttons with the "Press" and "Hold" controls. Only install the emulator in development (for example, behind `import.meta.env.DEV` or a `?emulate` URL flag).

## Controllers: point, select, grab

The renderer gives you two kinds of object per controller:

| Object | Pose | Use |
|---|---|---|
| `renderer.xr.getController(i)` | the **target ray** (where the controller points) | rays, selection, laser pointers; receives `select*` and `squeeze*` events |
| `renderer.xr.getControllerGrip(i)` | the **grip** (where it sits in the hand) | attaching the 3D controller model, held objects |

```js run title="VR: point with a ray, trigger to select, grip to grab" level=advanced height=540
import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { XRDevice, metaQuest3 } from "iwer";
import { DevUI } from "@iwer/devui";

// --- emulated Quest 3 (remove for real devices) -----------------------------
const device = new XRDevice(metaQuest3);
device.installRuntime({ forceInstall: true });
device.installDevUI(DevUI);

// --- renderer with XR -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#1e293b");
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 50);
camera.position.set(0, 1.6, 1.5);                       // outside VR: a standing person's eye height
scene.add(new THREE.HemisphereLight("#ffffff", "#334155", 2.5));
const sun = new THREE.DirectionalLight("#ffffff", 1.5);
sun.position.set(1, 3, 2);
scene.add(sun, new THREE.GridHelper(10, 20, "#475569", "#334155"));

// a table with objects at hand height (y ≈ 0.9–1.2 m, in front of the user at z ≈ −0.6)
const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.7), new THREE.MeshStandardMaterial({ color: "#78350f" }));
table.position.set(0, 0.85, -0.7);
scene.add(table);
const grabbables = new THREE.Group();
scene.add(grabbables);
const shapes = [new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.SphereGeometry(0.07, 32, 16), new THREE.ConeGeometry(0.07, 0.15, 24), new THREE.TorusGeometry(0.06, 0.025, 12, 32)];
shapes.forEach((g, i) => {
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 4, 0.7, 0.55), roughness: 0.4 }));
  m.position.set(-0.45 + i * 0.3, 0.95, -0.65);
  grabbables.add(m);
});

// --- controllers ------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const modelFactory = new XRControllerModelFactory();       // downloads the real controller model for the device
const controllers = [0, 1].map((i) => {
  const controller = renderer.xr.getController(i);         // target-ray space
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: "#ffffff" }));
  ray.scale.z = 3;
  controller.add(ray);
  controller.userData.ray = ray;
  scene.add(controller);

  const grip = renderer.xr.getControllerGrip(i);           // grip space: where the hand holds it
  grip.add(modelFactory.createControllerModel(grip));
  scene.add(grip);

  controller.addEventListener("selectstart", () => {       // trigger pressed
    const hit = intersect(controller);
    if (hit) hit.object.material.emissive.setHex(hit.object.material.emissive.getHex() ? 0x000000 : 0x444444);
  });
  controller.addEventListener("squeezestart", () => {      // grip pressed: grab
    const hit = intersect(controller);
    if (!hit) return;
    controller.attach(hit.object);                         // attach keeps the world transform (Module 1!)
    controller.userData.held = hit.object;
  });
  controller.addEventListener("squeezeend", () => {        // grip released: drop
    const held = controller.userData.held;
    if (held) { grabbables.attach(held); controller.userData.held = null; }
  });
  return controller;
});

function intersect(controller) {
  raycaster.setFromXRController(controller);               // a ray along the controller's pointing direction
  return raycaster.intersectObjects(grabbables.children, false)[0];
}

// --- loop -------------------------------------------------------------------
renderer.setAnimationLoop(() => {
  for (const c of controllers) {
    const hit = !c.userData.held && intersect(c);
    c.userData.ray.scale.z = hit ? hit.distance : 3;       // shorten the laser to what it touches
    c.userData.ray.material.color.set(hit ? "#34d399" : "#ffffff");
  }
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

Try it: press **ENTER VR**, then in the right controller's panel use the position fields (or drag its gizmo) to point the ray at an object: the laser turns green. **Press** the trigger to toggle a highlight, **Hold** the grip to grab the object and move the controller to carry it, release to drop it.

:::def select / squeeze events
WebXR's built-in input events. **select** is the primary action (trigger on controllers, pinch with hands, tap on phones, pinch on Vision Pro). **squeeze** is the grip button. Each comes as `…start`, `…end`, and a combined `select`/`squeeze` when a press completes. For other buttons and thumbsticks, read `inputSource.gamepad` each frame.
:::

## What changes inside a VR session

| Topic | In VR |
|---|---|
| camera | three.js **replaces** your camera's pose with the headset's each frame. To move the *user*, move a parent group of the camera ("dolly"/"rig") or the reference space, never `camera.position` |
| frame rate | the loop runs at the headset's rate (72–120 Hz), and every frame renders twice |
| resolution | set by the headset; `renderer.xr.setFramebufferScaleFactor()` trades sharpness for speed |
| UI | HTML overlays are invisible in the headset; UI must be in the scene |
| post-processing | most `EffectComposer` effects don't work correctly in stereo; avoid them in VR |
| units | metres, and the floor is at y = 0 (`local-floor`) |

```js
// moving the user: put the camera in a rig and move the rig
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
rig.position.set(5, 0, -3);           // teleport the user (next lessons do this with @react-three/xr)

// react to session start/end
renderer.xr.addEventListener("sessionstart", () => hud.visible = false);
renderer.xr.addEventListener("sessionend", () => hud.visible = true);
```

## Hand tracking

On Quest, Vision Pro and Android XR, users can put the controllers down and use their hands. `renderer.xr.getHand(i)` returns a group with 25 joint objects (`hand.joints["index-finger-tip"]`…), and `XRHandModelFactory` draws a hand model. A **pinch** (thumb + index) fires the same `select` events, so the code above works with hands too, with one change: request the feature.

```js
const button = VRButton.createButton(renderer, { optionalFeatures: ["hand-tracking"] });
const handFactory = new XRHandModelFactory();
for (const i of [0, 1]) {
  const hand = renderer.xr.getHand(i);
  hand.add(handFactory.createHandModel(hand, "mesh"));   // "mesh" = realistic hand, "spheres"/"boxes" = joints
  hand.addEventListener("pinchstart", () => console.log("pinch!"));
  scene.add(hand);
}
// direct touch: compare a joint position with an object every frame
const tip = renderer.xr.getHand(1).joints["index-finger-tip"];
if (tip && tip.position.distanceTo(button3D.position) < 0.02) press(button3D);
```

In the emulator, switch the input mode in the DevUI to hands to test this.

## Check yourself

```quiz
? Which method gives you the object to attach a controller's 3D model to?
+ renderer.xr.getControllerGrip(i)
- renderer.xr.getController(i)
- renderer.xr.getHand(i)
> The grip space matches how the controller sits in the hand.

? How do you aim a raycaster along a controller?
+ raycaster.setFromXRController(controller)
- raycaster.setFromCamera(pointer, camera)
- controller.lookAt(target)
> It uses the target-ray pose.

? Which event fires when the grip button is pressed?
- selectstart
+ squeezestart
- gripdown
> select = primary (trigger/pinch), squeeze = grip.

? How do you move the user in VR?
+ Move a rig group that contains the camera (or the reference space)
- Set camera.position
- Rotate the scene
> The headset overwrites the camera's own pose every frame.

? Why use controller.attach(object) to grab?
+ It re-parents the object while keeping its world position, so it doesn't jump
- It's faster than add()
- It enables physics
> attach() keeps the world transform (Module 1).
```

:::exercise Throw it
Make dropped objects fall: when `squeezeend` fires, give the object a `velocity` (store the controller's world position for the last few frames and compute the difference / time), then in the loop apply gravity (−9.81) and stop at the table height (0.9) or the floor (0).
:::

:::solution
```js run height=540
import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRDevice, metaQuest3 } from "iwer";
import { DevUI } from "@iwer/devui";

const device = new XRDevice(metaQuest3);
device.installRuntime({ forceInstall: true });
device.installDevUI(DevUI);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1e293b");
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 50);
camera.position.set(0, 1.6, 1.5);
scene.add(new THREE.HemisphereLight("#fff", "#334155", 3), new THREE.GridHelper(10, 20));
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 12), new THREE.MeshStandardMaterial({ color: "#f97316" }));
ball.position.set(0, 1.1, -0.5);
ball.userData.velocity = new THREE.Vector3();
scene.add(ball);

const controller = renderer.xr.getController(1);
scene.add(controller);
const history = [], now = new THREE.Vector3();
let held = false;
controller.addEventListener("squeezestart", () => {
  controller.getWorldPosition(now);
  if (now.distanceTo(ball.getWorldPosition(new THREE.Vector3())) < 0.3) { controller.attach(ball); held = true; }
});
controller.addEventListener("squeezeend", () => {
  if (!held) return;
  scene.attach(ball);
  held = false;
  const a = history[0], b = history[history.length - 1];
  if (a && b && b.t > a.t) ball.userData.velocity.subVectors(b.p, a.p).divideScalar((b.t - a.t) / 1000);
});

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.05);
  controller.getWorldPosition(now);
  history.push({ p: now.clone(), t });
  if (history.length > 6) history.shift();
  if (!held) {
    const v = ball.userData.velocity;
    v.y -= 9.81 * dt;
    ball.position.addScaledVector(v, dt);
    if (ball.position.y < 0.06) { ball.position.y = 0.06; v.set(0, 0, 0); }
  }
  renderer.render(scene, camera);
});
```
:::

:::keypoints
- `renderer.xr.enabled = true` + `VRButton` + `setAnimationLoop` turn any scene into VR.
- Develop with **IWER** (`installRuntime({ forceInstall: true })` + `DevUI`); test on devices over HTTPS.
- `getController(i)` = pointing ray + `select`/`squeeze` events; `getControllerGrip(i)` = model and holding.
- Raycast with `setFromXRController`; grab with `controller.attach(obj)`, drop with `group.attach(obj)`.
- In VR the headset owns the camera: move a **rig**, keep UI in the scene, avoid post-processing.
- Hand tracking: request `hand-tracking`, `getHand(i)` + `XRHandModelFactory`; pinch = `select`.
:::
