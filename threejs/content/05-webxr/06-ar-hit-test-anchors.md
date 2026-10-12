---
title: AR — Hit Testing, Anchors & Understanding the Room
level: advanced
time: 40
summary: Placing virtual objects on real surfaces with hit testing and a reticle, keeping them in place with anchors, using detected planes and room meshes, HTML on top of phone AR with DOM overlay, lighting and occlusion, and a cross-platform "view in your room" strategy that includes iPhone.
---

AR is where web 3D meets everyday commerce: "see this sofa in your living room", "check if the TV fits on that wall", "follow the arrows to the right machine". The core loop is always the same: **find a real surface**, **place** something on it, and keep it **stuck** there while the user moves. WebXR provides each step as a feature, and `@react-three/xr` wraps them in hooks.

:::def Hit test
Casting a ray into the **real world** and getting back where it hits a real surface (floor, table, wall), as a position and orientation. The device computes it from its understanding of the environment (camera-based tracking on phones, depth sensors and room scans on headsets).
:::

:::def Anchor
A real-world position the device keeps track of. As tracking improves, the device may correct its map of the room; content attached to an anchor moves with those corrections and stays put relative to the real world. Content placed with plain coordinates can drift.
:::

## Place objects with a reticle

The classic AR placement UI: a **reticle** (a ring on the surface) follows where you're looking or pointing; tapping or pressing the trigger places an object there. In the emulator, **Enter AR** opens a synthetic living room; aim with the controller (or head) and press the trigger to place.

```jsx run title="Hit-test placement with a reticle" level=advanced height=560
import { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { XR, createXRStore, useXRHitTest, useXRInputSourceState, IfInSessionMode } from "@react-three/xr";
import { OrbitControls } from "@react-three/drei";

const store = createXRStore({ emulate: { inject: true } });
const matrix = new THREE.Matrix4();
// the latest hit, shared by the reticle and the placement logic (updated every frame, so not React state)
const hit = { found: false, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };

function Reticle() {
  const ring = useRef();
  const controller = useXRInputSourceState("controller", "right");

  // continuous hit test from the right controller's pointing ray, against detected surfaces
  useXRHitTest((results, getWorldMatrix) => {
    hit.found = results.length > 0;
    if (!hit.found) return;
    getWorldMatrix(matrix, results[0]);                      // pose of the hit on the real surface
    matrix.decompose(hit.position, hit.quaternion, hit.scale);
  }, controller?.inputSource.targetRaySpace ?? "viewer");     // fall back to gaze on phones

  useFrame(() => {
    ring.current.visible = hit.found;
    ring.current.position.copy(hit.position);
    ring.current.quaternion.copy(hit.quaternion);
  });

  return (
    <group ref={ring}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.08, 0.1, 32]} />
        <meshBasicMaterial color="#34d399" />
      </mesh>
    </group>
  );
}

function PlaceOnTrigger({ onPlace }) {
  // a fresh trigger press places an object at the current hit (no need to point at the ring itself)
  const controller = useXRInputSourceState("controller", "right");
  const wasDown = useRef(false);
  useFrame(() => {
    const down = controller?.gamepad["xr-standard-trigger"]?.state === "pressed";
    if (down && !wasDown.current && hit.found) onPlace(hit.position.clone(), hit.quaternion.clone());
    wasDown.current = down;
  });
  return null;
}

function Plant({ position, quaternion }) {
  return (
    <group position={position} quaternion={quaternion}>
      <mesh position-y={0.1}><cylinderGeometry args={[0.08, 0.06, 0.2, 24]} /><meshStandardMaterial color="#b45309" /></mesh>
      <mesh position-y={0.32}><sphereGeometry args={[0.15, 24, 12]} /><meshStandardMaterial color="#16a34a" /></mesh>
    </group>
  );
}

function Scene() {
  const [plants, setPlants] = useState([]);
  const place = (position, quaternion) => setPlants((p) => [...p, { position, quaternion, id: p.length }]);
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[1, 3, 2]} intensity={1.5} />
      <IfInSessionMode allow="immersive-ar">
        <Reticle />
        <PlaceOnTrigger onPlace={place} />
      </IfInSessionMode>
      {plants.map((p) => <Plant key={p.id} {...p} />)}
    </>
  );
}

export default function App() {
  return (
    <>
      <div className="overlay"><span><b>Enter AR</b>, point the right controller at the floor or a table, then <b>Press</b> its trigger to place a plant.</span></div>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterAR()}>Enter AR</button></div>
      <Canvas camera={{ position: [0, 1.6, 1.5] }}>
        <XR store={store}>
          <Scene />
          <IfInSessionMode deny={["immersive-ar", "immersive-vr"]}>
            <color attach="background" args={["#e2e8f0"]} />
            <gridHelper args={[4, 8]} />
            <OrbitControls />
          </IfInSessionMode>
        </XR>
      </Canvas>
    </>
  );
}
```

| Hook / component | Use |
|---|---|
| `useXRHitTest(fn, relativeTo, trackableType?)` | continuous hit test every frame from a space (`"viewer"` = where the user looks; a controller's `targetRaySpace` = where it points) |
| `useXRRequestHitTest()` | a one-off hit test on demand (e.g. on a tap) |
| `<XRHitTest>` | the component form, e.g. inside a custom controller |
| `trackableType` | `"plane"`, `"point"`, `"mesh"` or an array: which kinds of surfaces count |

On a phone, the ray comes from the screen centre or from the user's tap; on a headset, from the controller, the hand, or the gaze. Writing against "a space" keeps the code device-independent.

## Anchors: keep it where you put it

For anything that should stay put across a long session, or across sessions (a note left on a machine, a measurement), create an **anchor** from the hit-test result and attach the object to it:

```jsx
import { useXRAnchor, XRSpace, useXRRequestHitTest } from "@react-three/xr";

function AnchoredNote() {
  const [anchor, requestAnchor] = useXRAnchor();
  const requestHitTest = useXRRequestHitTest();
  const place = async () => {
    const hit = await requestHitTest("viewer");                // where the user is looking
    const result = hit?.results[0];
    if (result) requestAnchor({ relativeTo: "hit-test-result", hitTestResult: result });
  };
  return (
    <>
      <mesh onClick={place}>{/* a "place note" button in 3D */}</mesh>
      {anchor && (
        <XRSpace space={anchor.anchorSpace}>                 {/* children follow the anchor every frame */}
          <Note text="Check valve pressure" />
        </XRSpace>
      )}
    </>
  );
}
```

On Quest, anchors can be **persisted** (`anchor.requestPersistentHandle()`) and restored in a later session, which is how apps remember where the user placed their virtual monitor or a maintenance note.

## Understanding the room: planes and meshes

Headsets with room setup (Quest, Android XR) report detected **planes** (floor, walls, tables, each with a semantic label) and a **room mesh**. Use them to put content on the right surfaces automatically, bounce virtual balls off real walls, or hide virtual objects behind real furniture:

```jsx
import { useXRPlanes, XRSpace, XRPlaneModel } from "@react-three/xr";

function Tables() {
  const tables = useXRPlanes("table");                      // semantic label filter: "floor", "wall", "table", "couch"…
  return tables.map((plane, i) => (
    <XRSpace key={i} space={plane.planeSpace}>
      <XRPlaneModel plane={plane}>                           {/* a mesh shaped like the real table top */}
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.3} />
      </XRPlaneModel>
      <Lamp position-y={0.01} />                             {/* drop something onto every real table */}
    </XRSpace>
  ));
}
```

## HTML on top of phone AR: DOM overlay

On Android phones, an AR session takes over the screen, but the **DOM overlay** feature lets regular HTML (buttons, a product name, a "Place" button) stay on top. `@react-three/xr` provides `<XRDomOverlay>`:

```jsx
import { XRDomOverlay, IfInSessionMode } from "@react-three/xr";

<IfInSessionMode allow="immersive-ar">
  <XRDomOverlay>
    <div style={{ position: "absolute", bottom: 24, width: "100%", textAlign: "center" }}>
      <button onClick={placeAtReticle}>Place sofa</button>
      <button onClick={() => store.getState().session?.end()}>Done</button>
    </div>
  </XRDomOverlay>
</IfInSessionMode>
```

Headsets don't support DOM overlay; use in-scene UI there (next lesson).

## Making AR look real

| Problem | Fix |
|---|---|
| object looks pasted on | contact shadows (drei `ContactShadows` or a blob) on the real floor |
| wrong lighting | WebXR **light estimation** (Android) for light direction and intensity; or an HDR environment roughly matching indoor light |
| object floats or slides | anchors; hit tests against planes, not feature points |
| object visible through real furniture | **depth sensing** / room mesh occlusion: render the room mesh with `colorWrite: false` so it hides what's behind it |
| wrong size | real units (metres) and real product dimensions; offer a "lock to real size" mode |

## "View in your room" on every phone

WebXR AR runs on Android Chrome and headsets, but **not on iPhone**. Production product pages use Google's **`<model-viewer>`** web component, which picks the best path per device:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@4/dist/model-viewer.min.js"></script>

<model-viewer
  src="/models/sofa.glb"            <!-- glTF for web and Android -->
  ios-src="/models/sofa.usdz"       <!-- USDZ for iPhone AR Quick Look -->
  ar ar-modes="webxr scene-viewer quick-look"
  ar-placement="floor" camera-controls shadow-intensity="1"
  alt="Grey three-seater sofa">
</model-viewer>
```

| Device | What happens |
|---|---|
| Android Chrome | WebXR session in the page (or Google's Scene Viewer app) |
| iPhone / iPad | Apple **AR Quick Look** opens the USDZ |
| Headset | WebXR immersive AR |
| Desktop | the 3D viewer only (show a QR code to continue on a phone) |

A common architecture: a custom three.js/R3F configurator on the page, plus a **"View in AR"** button that exports the current configuration (three.js has `GLTFExporter` and `USDZExporter`) or links to pre-generated variants, and hands it to model-viewer/Quick Look.

## Check yourself

```quiz
? What does a hit test return?
+ Where a ray hits a real-world surface, as a pose (position + orientation)
- The virtual object under the pointer
- A list of detected planes
> It's a ray against the real environment.

? Why use an anchor instead of just placing an object at the hit position?
+ The device keeps anchors aligned with the real world as its tracking corrects itself
- Anchors render faster
- Hit test results can't be used directly
> Plain coordinates can drift relative to the room.

? Which space should a phone AR hit test usually come from?
+ "viewer" (the screen centre / where the camera looks)
- The right controller
- "local-floor"
> Phones have no controllers.

? How do you keep HTML buttons visible during phone AR?
+ The dom-overlay feature (<XRDomOverlay>)
- position: fixed CSS
- You can't
> DOM overlay works on Android, not on headsets.

? How do iPhone users get "view in your room"?
+ AR Quick Look with a USDZ file, e.g. via <model-viewer ios-src>
- WebXR immersive-ar
- A Chrome extension
> iOS Safari doesn't implement WebXR.
```

:::exercise Measure tape
Build an AR measuring tool: each trigger press places a point at the reticle; after two points, draw a line between them and show the distance in centimetres as a drei `<Text>` label at the midpoint, facing the camera (`<Billboard>`).
:::

:::solution
```jsx run height=560
import { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Line, Text } from "@react-three/drei";
import { XR, createXRStore, useXRHitTest, useXRInputSourceState } from "@react-three/xr";

const store = createXRStore({ emulate: { inject: true } });
const m = new THREE.Matrix4(), hit = new THREE.Vector3();

function Tape() {
  const [points, setPoints] = useState([]);
  const reticle = useRef(), ok = useRef(false), was = useRef(false);
  const right = useXRInputSourceState("controller", "right");
  useXRHitTest((results, getWorldMatrix) => {
    ok.current = results.length > 0;
    if (ok.current) { getWorldMatrix(m, results[0]); hit.setFromMatrixPosition(m); }
  }, right?.inputSource.targetRaySpace ?? "viewer");
  useFrame(() => {
    reticle.current.visible = ok.current;
    reticle.current.position.copy(hit);
    const down = right?.gamepad["xr-standard-trigger"]?.state === "pressed";
    if (down && !was.current && ok.current) setPoints((p) => (p.length >= 2 ? [hit.clone()] : [...p, hit.clone()]));
    was.current = down;
  });
  const [a, b] = points;
  return (
    <>
      <mesh ref={reticle}><sphereGeometry args={[0.01]} /><meshBasicMaterial color="#f43f5e" /></mesh>
      {points.map((p, i) => <mesh key={i} position={p}><sphereGeometry args={[0.012]} /><meshBasicMaterial color="#facc15" /></mesh>)}
      {a && b && (
        <>
          <Line points={[a, b]} color="#facc15" lineWidth={3} />
          <Billboard position={a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.05, 0))}>
            <Text fontSize={0.04} color="white" outlineWidth={0.004} outlineColor="black">{`${(a.distanceTo(b) * 100).toFixed(1)} cm`}</Text>
          </Billboard>
        </>
      )}
    </>
  );
}

export default function App() {
  return (
    <>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterAR()}>Enter AR</button></div>
      <Canvas><XR store={store}><Tape /></XR></Canvas>
    </>
  );
}
```
:::

:::keypoints
- AR placement = **hit test** (ray vs. real surfaces) → reticle → place on select.
- `useXRHitTest(fn, space, trackableType)` works from the viewer (phones), controllers or hands (headsets).
- **Anchors** keep content locked to the real world (and can persist on Quest); **planes/meshes** give semantic surfaces and occlusion.
- `XRDomOverlay` for HTML in phone AR; in-scene UI on headsets.
- Ground objects with shadows and believable light; use real dimensions.
- Cross-platform "view in your room": WebXR + **model-viewer** (Scene Viewer, **AR Quick Look** with USDZ for iPhone).
:::
