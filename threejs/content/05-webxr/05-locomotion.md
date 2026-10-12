---
title: Moving Around in VR — Teleport, Locomotion & Comfort
level: advanced
time: 35
summary: Why moving in VR makes people sick and how to prevent it, teleportation with TeleportTarget and XROrigin, smooth thumbstick locomotion and snap turning with useXRControllerLocomotion, restricting where users can go, comfort options, and walking real rooms with room-scale tracking.
---

A headset tracks the user walking around their room, but virtual spaces are usually bigger than real ones: a museum, a factory, a building that hasn't been built. **Locomotion** is how users travel further than their legs can take them, and it's the part of VR design most likely to make people feel ill if done carelessly.

:::def Vection and simulator sickness
When your eyes see motion that your inner ear doesn't feel (**vection**), many people get dizzy or nauseous. Smooth artificial movement, especially acceleration and turning, causes it; **teleporting** (an instant jump) and **snap turning** (instant fixed rotations) avoid it because there's no visible motion to disagree with.
:::

| Technique | Comfort | Immersion | Use |
|---|---|---|---|
| room-scale walking | ★★★ | ★★★ | always available; limited to the real room |
| **teleport** | ★★★ | ★★ | the default for most apps |
| **snap turn** (e.g. 30–45°) | ★★★ | ★★ | turning without spinning around in real life |
| smooth locomotion (thumbstick) | ★ | ★★★ | games for experienced users; always optional |
| smooth turn | ★ | ★★★ | optional, with a speed setting |
| vehicles / seated travel | ★★ (with a stable cockpit) | ★★★ | driving, flying simulations |

## The user's position: XROrigin

In `@react-three/xr`, the user stands on the `<XROrigin>`. Moving it moves the user's whole tracked space: their head and hands move with it, and they can still walk around inside it. Every locomotion technique is just a way of changing the origin's position and rotation.

## Teleportation

Enable the teleport pointer on controllers and hands, keep the origin's position in state, and mark the surfaces users may teleport onto with `<TeleportTarget>`. Pushing the thumbstick forward shows an arc; releasing it teleports to where the arc lands:

```jsx run title="A gallery you can teleport around" level=advanced height=560
import { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { XR, createXRStore, XROrigin, TeleportTarget, IfInSessionMode, useXRControllerLocomotion } from "@react-three/xr";

const store = createXRStore({
  emulate: { inject: true },
  controller: { teleportPointer: true },     // thumbstick forward → teleport arc
  hand: { teleportPointer: true },
});

// hung 5 cm in front of the walls (a picture exactly on a wall surface flickers: z-fighting)
const ARTWORKS = [
  { title: "Sunrise", color: "#f97316", pos: [-3.9, 1.5, -2], rot: Math.PI / 2 },
  { title: "Ocean", color: "#0ea5e9", pos: [3.9, 1.5, -2], rot: -Math.PI / 2 },
  { title: "Forest", color: "#16a34a", pos: [0, 1.5, -5.9], rot: 0 },
  { title: "Dusk", color: "#a855f7", pos: [-3.9, 1.5, 2], rot: Math.PI / 2 },
];

function Gallery() {
  return (
    <group>
      {/* walls */}
      {[[0, 2, -6, 8, 4, 0.1], [-4, 2, 0, 0.1, 4, 12], [4, 2, 0, 0.1, 4, 12]].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color="#f5f5f4" /></mesh>
      ))}
      {ARTWORKS.map((a) => (
        <group key={a.title} position={a.pos} rotation-y={a.rot}>
          <mesh><planeGeometry args={[1.6, 1.1]} /><meshStandardMaterial color={a.color} /></mesh>
          <Text position={[0, -0.75, 0.01]} fontSize={0.09} color="#292524">{a.title}</Text>
        </group>
      ))}
      {/* a plinth in the middle: NOT a teleport target, so you can't land on it */}
      <mesh position={[0, 0.5, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#d6d3d1" /></mesh>
    </group>
  );
}

function Locomotion({ originRef }) {
  // left stick: smooth movement (optional comfort setting); right stick: 45° snap turns
  useXRControllerLocomotion(originRef, { speed: 1.5 }, { type: "snap", degrees: 45 });
  return null;
}

const START = [0, 0, 4];

export default function App() {
  const origin = useRef();
  const [marker, setMarker] = useState(() => new THREE.Vector3(...START));
  // teleport by moving the origin object directly: smooth locomotion also moves it,
  // so a React `position` prop would fight it (and snap the user back on re-render)
  const teleport = (point) => { origin.current.position.copy(point); setMarker(point.clone()); };
  return (
    <>
      <div className="overlay"><span><b>Enter VR</b>, then push the right stick forward (Stick panel) to aim the arc and release to teleport. Left stick moves, right stick snaps 45°.</span></div>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>
      <Canvas camera={{ position: [0, 6, 9], fov: 50 }}>
        <XR store={store}>
          <color attach="background" args={["#e7e5e4"]} />
          <hemisphereLight args={["#ffffff", "#a8a29e", 1.6]} />
          <directionalLight position={[2, 6, 3]} intensity={1.5} />
          <XROrigin ref={origin} position={START} />
          <TeleportTarget onTeleport={teleport}>
            <mesh rotation-x={-Math.PI / 2} position-y={0}>
              <planeGeometry args={[8, 12]} />
              <meshStandardMaterial color="#a8a29e" />
            </mesh>
          </TeleportTarget>
          <Gallery />
          <Locomotion originRef={origin} />
          {/* show where the user is standing (desktop view) */}
          <mesh position={[marker.x, 0.02, marker.z]} rotation-x={-Math.PI / 2}><ringGeometry args={[0.25, 0.32, 32]} /><meshBasicMaterial color="#10b981" /></mesh>
          <IfInSessionMode deny={["immersive-vr", "immersive-ar"]}><OrbitControls target={[0, 1, -1]} /></IfInSessionMode>
        </XR>
      </Canvas>
    </>
  );
}
```

What each piece does:

| Piece | Role |
|---|---|
| `teleportPointer: true` in the store | adds a curved teleport pointer to controllers/hands (activated by pushing the thumbstick forward, or a pinch-and-point gesture with hands) |
| `<TeleportTarget onTeleport>` | marks valid landing surfaces; calls back with the landing point |
| `<XROrigin ref>` | where the user stands; teleport by moving it (`origin.current.position.copy(point)`) |
| `useXRControllerLocomotion(originRef, translation, rotation)` | thumbstick movement and snap/smooth turning applied to the origin |

Because your code applies the teleport, you decide the rules: snap to a grid of allowed spots, block teleporting through walls (only wrap reachable floors in `TeleportTarget`), fade the screen briefly during the jump, log where people go for analytics, or sync the position to other users in a multi-user session.

## Comfort options users expect

Offer these in a settings panel (in VR, built with uikit or simple 3D buttons), and remember the user's choices:

- **Turning**: snap (default) with 30°/45°/90° steps, or smooth with a speed slider.
- **Movement**: teleport only (default) or teleport + smooth locomotion; a speed setting.
- **Vignette**: darken the edges of the view during smooth movement and turning; it reduces vection significantly.
- **Seated mode**: raise the origin so seated users have a standing eye height (or let them recentre).
- **Height calibration and recentre**: one button to reset the view forward.
- **Dominant hand**: swap which hand moves and which turns.

:::warn Things that make people sick
Moving the camera without user input (cut-scenes, "falling" elevators, camera shake); accelerating or decelerating smoothly; tilting the horizon; low or unstable frame rates; ladders and stairs climbed with smooth motion. If the story needs travel, put the user in a **stable vehicle cockpit** (a cabin around them that doesn't move relative to them) or fade out and back in.
:::

## Room-scale and the play area

The user's real movement is always tracked, so your world must make sense around them: don't put walls inside their real play area right where they start, place important things within reach of the origin, and for room-scale experiences request `bounded-floor` to get the guardian boundary (`store.getState().session` exposes the reference space bounds), so you can lay out content inside the space they actually have.

:::ai
Locomotion data (where people teleport, what they look at, how long they stay) is valuable for **UX research** in virtual showrooms, museums and training. Aggregated heatmaps of teleport points and gaze direction tell you which exhibits work, a direct parallel to web analytics click maps. Collect it with consent and anonymise it.
:::

## Check yourself

```quiz
? Why is teleporting more comfortable than smooth thumbstick movement?
+ There's no visible motion for the inner ear to disagree with
- It's faster
- It uses less GPU
> Vection (seeing motion you don't feel) causes discomfort.

? What does moving the XROrigin do?
+ Moves the user's whole tracked space (head and hands) in the virtual world
- Moves only the camera
- Moves the controllers only
> The user stands on the origin.

? How do you stop users from teleporting onto a table?
+ Only wrap reachable floor meshes in <TeleportTarget>
- Set the table's opacity
- Disable the teleport pointer
> Landing is only possible on targets.

? Which turning option should be the default?
+ Snap turning in fixed steps (e.g. 45°)
- Smooth turning at high speed
- No turning at all
> Snap turns avoid continuous rotation.

? What helps reduce discomfort during smooth movement?
+ A vignette that darkens the edges of the view while moving
- Increasing field of view
- Adding camera shake
> Less peripheral motion = less vection.
```

:::exercise Teleport hotspots
Instead of a free floor, let users teleport only to four round "viewing spots" in front of each artwork: render four circular `TeleportTarget`s, and when `onTeleport` fires, snap the origin to the **centre** of the spot that was hit (not the exact hit point) and rotate the origin to face the artwork.
:::

:::solution
```jsx run height=520
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { XR, createXRStore, XROrigin, TeleportTarget } from "@react-three/xr";

const store = createXRStore({ emulate: { inject: true }, controller: { teleportPointer: true } });
const SPOTS = [
  { at: [-2.6, 0, -2], face: -Math.PI / 2 },   // looking at the left wall
  { at: [2.6, 0, -2], face: Math.PI / 2 },     // right wall
  { at: [0, 0, -4.6], face: 0 },               // back wall
  { at: [0, 0, 3], face: 0 },                  // entrance
];

export default function App() {
  const [spot, setSpot] = useState(3);
  const s = SPOTS[spot];
  return (
    <>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>
      <Canvas camera={{ position: [0, 6, 9] }}>
        <XR store={store}>
          <color attach="background" args={["#e7e5e4"]} />
          <hemisphereLight args={["#fff", "#a8a29e", 2]} />
          <XROrigin position={s.at} rotation-y={s.face} />
          {SPOTS.map((p, i) => (
            <TeleportTarget key={i} onTeleport={() => setSpot(i)}>
              <mesh position={[p.at[0], 0.01, p.at[2]]} rotation-x={-Math.PI / 2}>
                <circleGeometry args={[0.5, 32]} />
                <meshStandardMaterial color={i === spot ? "#10b981" : "#a8a29e"} />
              </mesh>
            </TeleportTarget>
          ))}
          <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[8, 12]} /><meshStandardMaterial color="#d6d3d1" /></mesh>
          <OrbitControls />
        </XR>
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- Locomotion moves the **XROrigin**; the user stays tracked inside it.
- Default to **teleport** (`teleportPointer` + `TeleportTarget` + origin state) and **snap turning**.
- `useXRControllerLocomotion` adds optional smooth movement and turning on thumbsticks.
- You own the rules: restrict targets, snap to spots, fade, sync to other users.
- Offer comfort settings (turn mode, vignette, seated mode, recentre) and never move the camera without user input.
:::
