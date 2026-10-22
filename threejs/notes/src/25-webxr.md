---
title: WebXR — VR and AR on the Web
summary: How immersive sessions, reference spaces, poses and per-eye views work; VR in three.js with controllers, rays and hands; AR hit testing and anchors; the maths of teleport arcs and readable text in headsets; comfort and performance budgets; and @react-three/xr.
difficulty: Intermediate
prereqs: Chapters 6 and 14
time: 60 minutes
outcome: Build VR and AR experiences with controllers, hands and hit testing, and keep them comfortable within headset frame budgets.
---

## The WebXR model

:::def WebXR Device API
The browser standard for VR and AR. A page requests an **XR session** (only from a user gesture such as a click), the browser takes over the display (headset, or a phone's camera view for AR), and on every frame it supplies the device's **pose** and one **view** per eye, each with its own view and projection matrix.
:::

| Session mode | Device | What you get |
|---|---|---|
| `immersive-vr` | Headsets (Quest, Vision Pro, PC VR) | Full virtual environment, stereo rendering |
| `immersive-ar` | AR phones (Android Chrome), passthrough headsets | Your content composited over the real world |
| `inline` | Any browser | A non-immersive view on the page (rarely used directly) |

:::def Reference space
The coordinate system poses are expressed in. `viewer` (fixed to the head), `local` (origin at the starting head position), **`local-floor`** (origin on the floor below the start position: y = 0 is the floor, which is what three.js requests by default), `bounded-floor` (with a play-area boundary) and `unbounded` (large-scale AR). Units are metres.
:::

:::def Pose and views
An `XRFrame` gives the **viewer pose** (head position and orientation) and an array of **views**: two for stereo headsets (left and right eye, offset by the interpupillary distance, about 63 mm), one for phone AR. Each view has a transform and a projection matrix, often asymmetric. three.js builds an `ArrayCamera` with one sub-camera per view and renders the scene once per eye (or once with the multiview extension).
:::

| Optional feature | Enables |
|---|---|
| `hand-tracking` | Joint poses for both hands (25 joints each) |
| `hit-test` | Rays against real-world surfaces (AR) |
| `anchors` | Points that stay fixed to the real world as tracking improves |
| `plane-detection`, `mesh-detection` | Detected floors, walls, tables and room meshes |
| `dom-overlay` | HTML UI on top of phone AR |
| `layers` | Compositor layers (sharp text and video, cheaper rendering) |
| `depth-sensing`, `light-estimation` | Real-world depth for occlusion; real lighting for matching |

## VR in three.js

```js title="three.js — VR with controllers, rays and grabbing"
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ["hand-tracking"] }));

const factory = new XRControllerModelFactory();
const raycaster = new THREE.Raycaster();
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);              // the "target ray" space: where the pointer aims
  ctrl.addEventListener("selectstart", () => {
    raycaster.setFromXRController(ctrl);                  // ray from the controller's pose
    const hit = raycaster.intersectObjects(grabbables, false)[0];
    if (hit) { ctrl.attach(hit.object); ctrl.userData.held = hit.object; }   // attach keeps the world pose
  });
  ctrl.addEventListener("selectend", () => {
    const held = ctrl.userData.held;
    if (held) { scene.attach(held); ctrl.userData.held = null; }
  });
  scene.add(ctrl);
  const grip = renderer.xr.getControllerGrip(i);          // the "grip" space: where the hand holds it
  grip.add(factory.createControllerModel(grip));          // the real controller model, loaded on connect
  scene.add(grip);
}
renderer.setAnimationLoop(render);                        // required: XR drives the frame loop
```

:::warn The camera belongs to the headset
In a session three.js overwrites the camera's pose every frame from the headset. To move the player (teleport, smooth locomotion), move a parent **rig** group containing the camera and controllers, not the camera itself. Content is in metres, with the floor at y = 0 in `local-floor`.
:::

### Hands

`renderer.xr.getHand(i)` gives a group whose `joints` (wrist, finger tips…) follow the tracked hand; `XRHandModelFactory` renders them as spheres, boxes or a skinned mesh. A **pinch** is detected when the thumb tip and index tip are closer than about 1–2 cm, and the browser also emits `select` events for pinches, so controller code often works for hands unchanged.

## Locomotion and comfort

:::def Simulator sickness
Discomfort caused when the eyes see motion the inner ear does not feel (vection), or when the image lags head movement. Main causes: smooth artificial movement and rotation, acceleration, dropped frames and latency, and wrong scale. Rules: never move the camera without the user's intent, keep the frame rate at the display rate, and prefer teleportation and snap turning.
:::

| Technique | Comfort | Notes |
|---|---|---|
| Teleport (arc + target) | High | The standard default |
| Snap turning (30–45° steps) | High | Instead of smooth rotation |
| Smooth locomotion | Low–medium | Offer as an option, add a comfort vignette |
| Room-scale walking | Highest | Limited by the play area |

:::formula A teleport arc
The pointer arc is a projectile path from the controller position $\mathbf{p}_0$ with launch speed $v$ along the controller's forward direction:
$$\mathbf{p}(t) = \mathbf{p}_0 + \mathbf{v}\,t + \tfrac{1}{2}\mathbf{g}\,t^2$$
Sample it at small time steps, raycast between successive points, and the first hit on a valid floor is the teleport target.
:::

:::calc How far does the arc reach?
Hand at height 1.2 m, $v = 7$ m/s at 45°: $v_x = v_y = 4.95$ m/s. Landing when $1.2 + 4.95t - 4.905t^2 = 0$: $t = (4.95 + \sqrt{4.95^2 + 2\times9.81\times1.2})/9.81 = 1.21$ s, so the target is $4.95\times1.21 = 6.0$ m away. A faster launch speed reaches farther but makes precise aiming harder.
:::

### Readable text and UI in a headset

:::formula Size from visual angle
$$h = 2\,d\,\tan\frac{\theta}{2}$$
An object of height $h$ at distance $d$ subtends visual angle $\theta$. Size UI in angles, not pixels: headset pixels are large, so text needs to subtend roughly 1–1.5° for comfortable reading.
:::

:::calc Sizing a menu label
At 1.5 m, 1° of visual angle is $2\times1.5\times\tan 0.5° = 2.6$ cm, and 1.5° is 3.9 cm. So a label meant to be read at arm's-length-plus (1.5 m) needs letters about 3–4 cm tall, far larger than "desktop" proportions. Place panels 1–2 m away, slightly below eye level, and curve wide panels around the user.
:::

## AR: hit testing and anchors

:::def Hit test
A ray cast against the device's understanding of the **real world** (detected planes and meshes), returning poses where the ray meets real surfaces. The classic AR placement loop: each frame, cast a ray from the screen centre (phone) or the controller, show a **reticle** at the hit pose, and place the object there when the user taps.
:::

```js title="three.js — an AR placement reticle"
import { ARButton } from "three/addons/webxr/ARButton.js";
renderer.xr.enabled = true;
document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ["hit-test"] }));

let hitSource = null;
renderer.xr.addEventListener("sessionstart", async () => {
  const session = renderer.xr.getSession();
  const viewerSpace = await session.requestReferenceSpace("viewer");
  hitSource = await session.requestHitTestSource({ space: viewerSpace });   // rays from the screen centre
});
renderer.xr.getController(0).addEventListener("select", () => {
  if (reticle.visible) { const chair = chairModel.clone(); chair.position.setFromMatrixPosition(reticle.matrix); scene.add(chair); }
});
renderer.setAnimationLoop((t, frame) => {
  if (frame && hitSource) {
    const hits = frame.getHitTestResults(hitSource);
    reticle.visible = hits.length > 0;
    if (hits.length) reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix);
  }
  renderer.render(scene, camera);
});
// reticle.matrixAutoUpdate = false, so the pose matrix is used as is
```

:::def Anchor
A pose the AR system keeps attached to the real world, updating it as tracking improves (drift correction). Objects that must stay put for a long session (a virtual sofa, a measurement, a note on a machine) should be parented to an anchor created from a hit-test result rather than placed at fixed coordinates.
:::

## Performance in XR

:::calc Frame budgets in headsets
72 Hz: 13.9 ms. 90 Hz: 11.1 ms. 120 Hz: 8.3 ms. And the scene is rendered **twice** (once per eye) at high resolution, on a mobile GPU for standalone headsets. Dropped frames are not just stutter here; they cause discomfort, and the system's reprojection fills gaps with warped images.
:::

| Technique | Effect |
|---|---|
| Multiview (`OVR_multiview2`) | Render both eyes in one pass (three.js uses it when available) |
| Fixed foveated rendering (`renderer.xr.setFoveation(1)`) | Lower resolution in the periphery |
| `renderer.xr.setFramebufferScaleFactor(0.8–1.0)` | Trade sharpness for speed |
| Compositor layers | Text and video at full sharpness, cheaply |
| Budget like mobile | Few draw calls, instancing, baked lighting, no heavy post-processing, KTX2 |
| Avoid transparency and full-screen effects | Overdraw at stereo resolution is expensive |

## WebXR in React Three Fiber

```jsx title="R3F — @react-three/xr v6"
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore, XROrigin, TeleportTarget } from "@react-three/xr";

const store = createXRStore({ hand: { teleportPointer: true }, controller: { teleportPointer: true } });

export default function App() {
  const [origin, setOrigin] = useState([0, 0, 0]);
  return (
    <>
      <button onClick={() => store.enterVR()}>Enter VR</button>
      <button onClick={() => store.enterAR()}>Enter AR</button>
      <Canvas>
        <XR store={store}>
          <XROrigin position={origin} />                      {/* the player rig */}
          <TeleportTarget onTeleport={(p) => setOrigin([p.x, 0, p.z])}>
            <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[20, 20]} /><meshStandardMaterial /></mesh>
          </TeleportTarget>
          <Gallery />                                          {/* ordinary R3F content; onClick works with rays and pinches */}
        </XR>
      </Canvas>
    </>
  );
}
```

`createXRStore()` provides controller and hand models, ray and grab pointers, teleport pointers when enabled, Vision Pro's transient pointer and phone screen taps. It also injects the **IWER emulator** on localhost, so VR and AR can be tested on a laptop. `useXRHitTest` and `XRHitTest` handle AR hit testing; `IfInSessionMode` renders content only in VR or AR; `@react-three/uikit` builds flexbox UI panels for headsets.

:::keypoints
- Sessions: `immersive-vr`, `immersive-ar`, `inline`, requested from a user gesture.
- `local-floor` reference space: metres, floor at y = 0; one view (and projection) per eye.
- three.js: `renderer.xr.enabled`, `VRButton`/`ARButton`, `getController` (ray) and `getControllerGrip` (model), `setAnimationLoop`, move a rig not the camera.
- Comfort: teleport and snap turning, steady frame rate, correct scale; arcs are projectile paths.
- Size UI by visual angle: $h = 2d\tan(\theta/2)$; 1° ≈ 2.6 cm at 1.5 m.
- AR: hit-test sources from the viewer space → reticle → place; anchors for long-lived placement.
- Budgets: 8.3–13.9 ms rendered twice; multiview, foveation, layers, mobile-class content.
- R3F: `createXRStore` + `<XR>` + `XROrigin`, `TeleportTarget`, emulator on localhost.
:::

:::build VR gallery with teleport and grab
Problem: Build a small VR gallery: teleport between rooms, snap-turn, and pick up and inspect a sculpture with either controller or a hand pinch.
Requirements:
- Movement by moving a rig, never the camera.
- Teleport arc from the controller with a valid-floor check.
- Panels sized by visual angle and readable at 1.5 m.
Constraints: hold the headset's frame rate; test in the emulator first.
Hints: `attach()` to keep world transforms when grabbing; size text with $h = 2d\tan(\theta/2)$.
Relevant APIs: `renderer.xr`, `getController`, `getControllerGrip`, `Raycaster.setFromXRController`, `@react-three/xr` `createXRStore`, `TeleportTarget`.
Expected result: comfortable movement, natural grabbing with controllers and hands, and smooth frame pacing.
:::

## Interview questions

:::qa What changes in a three.js app when you add VR? {level=mid}
Enable `renderer.xr`, offer a `VRButton` (sessions need a user gesture), and drive rendering with `setAnimationLoop` because the headset controls the frame rate. The camera's pose now comes from the headset each frame, so player movement must move a parent rig. Scale must be real (metres, floor at y = 0). Input comes from controllers or hands (select/squeeze events, target-ray and grip spaces). And the scene renders twice per frame at 72–120 Hz on mobile hardware, so the performance budget becomes much tighter.
:::

:::qa How does AR placement with hit testing work? {level=mid}
Request an `immersive-ar` session with the `hit-test` feature, create a hit-test source from the viewer reference space (a ray from the screen centre or a controller), and each frame read `frame.getHitTestResults(source)`. The first result's pose (in the session's reference space) positions a reticle on the real surface; on select, place the object at the reticle's pose, ideally attached to an anchor created from that hit result so it stays fixed as tracking refines.
:::

:::qa Why is smooth locomotion uncomfortable and what are the alternatives? {level=junior}
The eyes perceive self-motion while the vestibular system feels none, a sensory mismatch that causes simulator sickness, worst with acceleration and rotation. Alternatives: teleportation (aim an arc, fade or blink, appear at the target), snap turning in fixed steps, comfort vignettes that narrow the view while moving, and designing experiences around room-scale walking.
:::

:::qa How would you size text for a VR menu? {level=mid}
By visual angle rather than pixels: height $h = 2d\tan(\theta/2)$. For about 1–1.5° at a reading distance of 1.5 m, letters need to be roughly 2.6–3.9 cm tall. Place panels 1–2 m away, slightly below eye level, facing the user (or curved), with high contrast; use SDF text (drei `Text`, uikit) or compositor layers so glyphs stay sharp, and avoid thin fonts that shimmer at headset resolution.
:::
