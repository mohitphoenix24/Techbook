---
title: Controls & Camera Rigs for Games and Walkthroughs
level: advanced
time: 40
summary: Keyboard input with drei's KeyboardControls, a third-person character with a smooth follow camera, first-person walking with pointer lock and collision, cinematic transitions with CameraControls, and choosing the right control scheme for games, walkthroughs, viewers and editors.
---

Every 3D product picks a way for people to move: orbit around a product, walk through a building, drive a forklift around a warehouse, fly a drone over a site. Getting this right matters more than graphics, because bad controls make people leave. This lesson builds the three most common rigs: **third-person**, **first-person** and **cinematic**.

| Experience | Control scheme |
|---|---|
| product viewer, configurator | orbit / presentation controls (Modules 1 and 3) |
| architecture walkthrough, museum, showroom | first-person (pointer lock + WASD), or click-to-move for non-gamers |
| game, avatar world, training simulation | third-person character + follow camera |
| guided tour, data story, onboarding | cinematic camera moves between viewpoints |
| map, site plan, dashboard | map controls (pan / zoom / tilt) |
| VR | locomotion and teleport (Module 5) |

## Keyboard input: KeyboardControls

drei's `<KeyboardControls>` maps physical keys to named actions. Components read them either reactively (`useKeyboardControls(selector)`) or, better for movement, **without re-rendering** inside `useFrame` via `get()`:

```jsx
const map = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "back", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "jump", keys: ["Space"] },
];
<KeyboardControls map={map}><Canvas>…</Canvas></KeyboardControls>

// inside a component in the Canvas:
const [, get] = useKeyboardControls();
useFrame(() => { const { forward, jump } = get(); /* … */ });
```

Using `KeyW` codes (physical positions) instead of `"w"` letters keeps WASD working on AZERTY and other keyboard layouts.

## Third-person: a character and a follow camera

The character moves relative to where the **camera** is looking (pressing "forward" goes away from the camera), turns smoothly to face its direction of travel, and the camera follows from behind with damping:

```jsx run title="Third-person controller with a follow camera" level=advanced height=460
import { useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { KeyboardControls, useKeyboardControls, Grid } from "@react-three/drei";
import { easing } from "maath";

const KEYS = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] }, { name: "back", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] }, { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "run", keys: ["ShiftLeft", "ShiftRight"] },
];
// scratch vectors, reused every frame (no garbage in the loop)
const move = new THREE.Vector3(), camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3();

function Player() {
  const body = useRef();
  const [, get] = useKeyboardControls();
  const facing = useRef(0);
  useFrame((state, dt) => {
    const k = get();
    // camera-relative directions on the ground plane
    state.camera.getWorldDirection(forward).setY(0).normalize();
    right.set(-forward.z, 0, forward.x);
    move.set(0, 0, 0)
      .addScaledVector(forward, (k.forward ? 1 : 0) - (k.back ? 1 : 0))
      .addScaledVector(right, (k.right ? 1 : 0) - (k.left ? 1 : 0));
    const speed = k.run ? 7 : 3.5;
    if (move.lengthSq() > 0) {
      move.normalize();
      body.current.position.addScaledVector(move, speed * dt);
      facing.current = Math.atan2(move.x, move.z);                 // face the travel direction
    }
    easing.dampAngle(body.current.rotation, "y", facing.current, 0.12, dt);
    // a little bob while walking
    body.current.children[0].position.y = 0.9 + (move.lengthSq() > 0 ? Math.abs(Math.sin(state.clock.elapsedTime * speed * 2)) * 0.08 : 0);
    // follow camera: behind and above, smoothed
    camGoal.copy(body.current.position).add({ x: 0, y: 3.2, z: 6 });
    easing.damp3(state.camera.position, camGoal, 0.35, dt);
    lookGoal.copy(body.current.position).add({ x: 0, y: 1, z: 0 });
    state.camera.lookAt(lookGoal);
  });
  return (
    <group ref={body}>
      <mesh position-y={0.9} castShadow><capsuleGeometry args={[0.35, 1, 8, 16]} /><meshStandardMaterial color="#6366f1" /></mesh>
      <mesh position={[0, 1.4, 0.3]}><boxGeometry args={[0.4, 0.12, 0.12]} /><meshStandardMaterial color="#e0e7ff" /></mesh>  {/* "visor" shows facing */}
    </group>
  );
}

function World() {
  const props = Array.from({ length: 30 }, (_, i) => ({ x: Math.sin(i * 7.3) * 18, z: Math.cos(i * 3.1) * 18, h: 0.6 + (i % 4) * 0.6 }));
  return (
    <>
      {props.map((p, i) => (
        <mesh key={i} position={[p.x, p.h / 2, p.z]} castShadow receiveShadow>
          <boxGeometry args={[1, p.h, 1]} /><meshStandardMaterial color={`hsl(${i * 12}, 50%, 60%)`} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[60, 60]} /><meshStandardMaterial color="#d6d3d1" /></mesh>
      <Grid position-y={0.01} args={[60, 60]} cellColor="#a8a29e" sectionColor="#78716c" fadeDistance={40} />
    </>
  );
}

export default function App() {
  return (
    <KeyboardControls map={KEYS}>
      <div className="overlay"><span>Click the scene, then <b>WASD / arrows</b> to move, <b>Shift</b> to run</span></div>
      <Canvas shadows="percentage" camera={{ position: [0, 3.2, 6], fov: 50 }} tabIndex={0}>
        <color attach="background" args={["#e7e5e4"]} />
        <fog attach="fog" args={["#e7e5e4", 15, 40]} />
        <hemisphereLight args={["#ffffff", "#a8a29e", 1.2]} />
        <directionalLight position={[8, 12, 5]} intensity={2} castShadow shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-25} shadow-camera-right={25} shadow-camera-top={25} shadow-camera-bottom={-25} />
        <Player />
        <World />
      </Canvas>
    </KeyboardControls>
  );
}
```

This version moves freely through objects; the next step in a real game is collision, either with **Rapier** (a capsule rigid body with `lockRotations`, moved by setting its velocity) or a character controller library such as **ecctrl**, which adds slopes, stairs, jumping and a physics-aware follow camera.

:::tip Keyboard focus in embedded canvases
Key events only reach the page that has focus. On this site (and in any canvas embedded in a larger page), **click the scene first**. In your own apps, listen on `window` for full-page experiences, or give the canvas `tabIndex={0}` and focus it on click for embedded ones, and always show which keys to press.
:::

## First-person: pointer lock + WASD

For architecture walkthroughs and shooters, the mouse should turn your head without a visible cursor. The browser's **Pointer Lock API** hides the cursor and reports raw mouse movement; drei's `<PointerLockControls>` wraps it. Combine it with keyboard movement relative to the view and a simple collision check against walls:

```jsx run title="First-person walkthrough with collisions" level=advanced height=460
import { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { PointerLockControls, KeyboardControls, useKeyboardControls } from "@react-three/drei";

const KEYS = [
  { name: "forward", keys: ["KeyW", "ArrowUp"] }, { name: "back", keys: ["KeyS", "ArrowDown"] },
  { name: "left", keys: ["KeyA", "ArrowLeft"] }, { name: "right", keys: ["KeyD", "ArrowRight"] },
];
// walls of a small floor plan, as axis-aligned boxes [x, z, width, depth]
const WALLS = [[0, -6, 12, 0.2], [0, 6, 12, 0.2], [-6, 0, 0.2, 12], [6, 0, 0.2, 12], [-1, -2, 0.2, 8], [2.5, 2, 7, 0.2]];
const boxes = WALLS.map(([x, z, w, d]) => new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, 3, z + d / 2)));
const dir = new THREE.Vector3(), side = new THREE.Vector3(), next = new THREE.Vector3(), probe = new THREE.Box3();
const center = new THREE.Vector3(), size = new THREE.Vector3(0.6, 2, 0.6);

function Walker() {
  const [, get] = useKeyboardControls();
  useFrame(({ camera }, dt) => {
    const k = get();
    camera.getWorldDirection(dir).setY(0).normalize();
    side.set(-dir.z, 0, dir.x);
    next.copy(camera.position)
      .addScaledVector(dir, ((k.forward ? 1 : 0) - (k.back ? 1 : 0)) * 3 * dt)
      .addScaledVector(side, ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 3 * dt);
    // collide: a 0.6 m wide "body" box around the eye position must not overlap any wall
    probe.setFromCenterAndSize(center.set(next.x, 1, next.z), size);
    if (!boxes.some((b) => b.intersectsBox(probe))) camera.position.copy(next);
    camera.position.y = 1.65;                                      // eye height of an adult
  });
  return null;
}

export default function App() {
  const [locked, setLocked] = useState(false);
  return (
    <KeyboardControls map={KEYS}>
      <div className="overlay">{locked ? <span><b>WASD</b> to walk · mouse to look · <b>Esc</b> to release</span> : <b>Click the scene to start walking</b>}</div>
      <Canvas camera={{ position: [-4, 1.65, 4], fov: 70 }}>
        <color attach="background" args={["#f5f5f4"]} />
        <hemisphereLight args={["#ffffff", "#d6d3d1", 1.5]} />
        <pointLight position={[0, 2.8, 0]} intensity={10} />
        {WALLS.map(([x, z, w, d], i) => (
          <mesh key={i} position={[x, 1.5, z]}><boxGeometry args={[w, 3, d]} /><meshStandardMaterial color={i < 4 ? "#e7e5e4" : "#93c5fd"} /></mesh>
        ))}
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[12, 12]} /><meshStandardMaterial color="#a8a29e" /></mesh>
        <mesh position={[3, 0.4, -3]}><boxGeometry args={[1.6, 0.8, 0.8]} /><meshStandardMaterial color="#f59e0b" /></mesh>
        <PointerLockControls onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />
        <Walker />
      </Canvas>
    </KeyboardControls>
  );
}
```

:::note Pointer lock needs a user gesture and permission
The browser only grants pointer lock after a click, shows a notice to the user, and releases it on Esc. In iframes it needs the `allow-pointer-lock` sandbox permission (this site's previews have it). Non-gamers often find mouse-look disorienting; for real-estate tours offer **click-to-move** (raycast the floor, glide there) as the default and pointer lock as an option.
:::

## Cinematic transitions: CameraControls

drei's `<CameraControls>` wraps the **camera-controls** library: orbit, dolly, truck and zoom like OrbitControls, plus **animated transitions** with proper easing, `fitToBox` to frame any object, and `setLookAt` to fly to a viewpoint. It's the best general-purpose camera for guided tours, configurators and dashboards:

```jsx run title="Guided tour with CameraControls" level=intermediate
import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls, Environment } from "@react-three/drei";

const STOPS = {
  Overview: [8, 6, 10, 0, 0.5, 0],
  "Front door": [0, 1.6, 5, 0, 1.2, 0],
  Roof: [2, 6, 2, 0, 2.6, 0],
  Garden: [-6, 1.8, -2, -3, 0.4, -3],
};

export default function App() {
  const cam = useRef(), house = useRef();
  const fly = (name) => cam.current.setLookAt(...STOPS[name], true);   // true = animate
  return (
    <>
      <div className="overlay">
        <div className="row">{Object.keys(STOPS).map((n) => <button key={n} onClick={() => fly(n)}>{n}</button>)}</div>
        <button onClick={() => cam.current.fitToBox(house.current, true, { paddingTop: 0.5, paddingBottom: 0.5 })}>Frame the house</button>
      </div>
      <Canvas camera={{ position: [8, 6, 10], fov: 45 }}>
        <color attach="background" args={["#e0f2fe"]} />
        <House groupRef={house} />
        <mesh position={[-3, 0.3, -3]}><sphereGeometry args={[0.6, 24, 12]} /><meshStandardMaterial color="#15803d" /></mesh>
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[30, 30]} /><meshStandardMaterial color="#86efac" /></mesh>
        <Environment preset="park" />
        <CameraControls ref={cam} makeDefault smoothTime={0.6} minDistance={1.5} maxPolarAngle={1.5} />
      </Canvas>
    </>
  );
}

function House({ groupRef }) {
  return (
    <group ref={groupRef}>
      <mesh position-y={1}><boxGeometry args={[3, 2, 3]} /><meshStandardMaterial color="#fde68a" /></mesh>
      <mesh position-y={2.6} rotation-y={Math.PI / 4}><coneGeometry args={[2.4, 1.2, 4]} /><meshStandardMaterial color="#b91c1c" /></mesh>
      <mesh position={[0, 0.6, 1.51]}><boxGeometry args={[0.7, 1.2, 0.05]} /><meshStandardMaterial color="#78350f" /></mesh>
    </group>
  );
}
```

| CameraControls method | Does |
|---|---|
| `setLookAt(px, py, pz, tx, ty, tz, animate)` | move the camera and its target together |
| `fitToBox(object, animate, padding)` / `fitToSphere` | frame an object perfectly |
| `rotate(azimuth, polar, animate)`, `dolly(distance, animate)`, `truck(x, y, animate)` | relative moves |
| `smoothTime` | transition speed (seconds-ish) |
| `saveState()` / `reset(animate)` | "home" button |
| events: `controlstart`, `control`, `rest` | analytics, render-on-demand |

## Choosing controls for real products

- **Configurators**: limited orbit or presentation controls, plus programmatic `setLookAt` to show the part being configured.
- **Real estate and museums**: click-to-move hotspots with smooth transitions; first-person as an option; always a "back to overview".
- **Games**: third-person or first-person with physics-based collision, gamepad support (the browser **Gamepad API**), and remappable keys.
- **Digital twins and dashboards**: map/orbit controls with keyboard shortcuts for preset views (top, front, isometric) and "focus selected".
- **Touch devices**: one finger rotates, two fingers pan/zoom; avoid relying on keyboards; make hit targets large.

## Check yourself

```quiz
? Why read keys with get() inside useFrame rather than useKeyboardControls(selector)?
+ It reads the current state without re-rendering the component on every key change
- get() is the only way to read keys
- Selectors don't work in R3F
> Movement is per-frame state; no React re-renders needed.

? In a third-person controller, which direction should "forward" move the character?
+ Away from the camera, along the camera's view direction projected onto the ground
- Always along world +z
- Towards the camera
> Camera-relative movement feels natural.

? What does the Pointer Lock API provide?
+ A hidden cursor and raw mouse movement for mouse-look
- Locking the camera position
- Preventing scrolling
> It needs a user gesture and is released with Esc.

? Which CameraControls call flies smoothly to a viewpoint?
+ setLookAt(px, py, pz, tx, ty, tz, true)
- lookAt(target)
- position.set(...)
> The final `true` animates the transition.

? Why use KeyW instead of "w" in key maps?
+ Codes refer to physical key positions, so WASD works on any keyboard layout
- Letters are case-sensitive
- Codes are faster
> AZERTY users press Z-Q-S-D in the same physical spots.
```

:::exercise Click-to-move
Replace pointer lock in the walkthrough with click-to-move: clicking the floor sets a target point (from `e.point`), and the camera glides there at eye height with `easing.damp3`, while you can still look around with `OrbitControls` whose target follows the camera. Simplest version: ignore walls.
:::

:::solution
```jsx run
import { useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { easing } from "maath";

const goal = new THREE.Vector3(-4, 1.65, 4), before = new THREE.Vector3(), moved = new THREE.Vector3();

function Mover({ controls }) {
  useFrame(({ camera }, dt) => {
    before.copy(camera.position);
    easing.damp3(camera.position, goal, 0.5, dt);
    // keep looking in the same direction: move the orbit target by the same amount
    controls.current.target.add(moved.subVectors(camera.position, before));
    controls.current.update();
  });
  return null;
}

export default function App() {
  const controls = useRef();
  return (
    <>
      <div className="overlay">Click the floor to walk there · drag to look around</div>
      <Canvas camera={{ position: [-4, 1.65, 4], fov: 70 }}>
        <color attach="background" args={["#f5f5f4"]} />
        <hemisphereLight args={["#fff", "#d6d3d1", 1.5]} />
        <mesh rotation-x={-Math.PI / 2} onClick={(e) => goal.set(e.point.x, 1.65, e.point.z)}>
          <planeGeometry args={[12, 12]} /><meshStandardMaterial color="#a8a29e" />
        </mesh>
        <mesh position={[3, 0.4, -3]}><boxGeometry args={[1.6, 0.8, 0.8]} /><meshStandardMaterial color="#f59e0b" /></mesh>
        <OrbitControls ref={controls} target={[-3.9, 1.6, 3.9]} enablePan={false} enableZoom={false} />
        <Mover controls={controls} />
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- Match controls to the experience: orbit for products, first-person or click-to-move for spaces, third-person for games, cinematic for tours.
- `KeyboardControls` + `get()` in `useFrame` for re-render-free input; use key **codes** for layout independence.
- Third-person = camera-relative movement + `dampAngle` facing + a damped follow camera.
- First-person = `PointerLockControls` + WASD + collision; offer click-to-move for non-gamers.
- `CameraControls` gives animated `setLookAt`, `fitToBox` and smooth damping for guided experiences.
:::
