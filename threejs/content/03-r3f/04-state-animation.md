---
title: State & Animation without Re-render Storms
level: intermediate
time: 35
summary: The two kinds of state in a 3D app, sharing state between HTML UI and the scene with Zustand, reading fast-changing values without re-rendering, smooth transitions with maath's damping, springy interactions with react-spring, and a camera that glides to whatever you select.
---

A configurator has state: the chosen colour, the selected part, whether the doors are open. It also has values that change **every frame**: the door's current angle as it swings, the camera drifting to a new viewpoint. Mixing the two up is the most common R3F performance mistake. The rule is simple, and the tools in this lesson make it easy to follow.

| Kind | Changes | Examples | Store it in | Animate with |
|---|---|---|---|---|
| **App state** | on user actions (a few times a minute) | selected part, colour, mode, cart | React state / **Zustand** | — |
| **Frame state** | every frame | current position, angle, opacity during a transition | **refs**, three.js objects | `useFrame` + damping, springs |

The pattern is always: **app state sets a target; the frame loop moves towards it.**

## Zustand: one store for HTML and 3D

:::def Zustand
A tiny state-management library from the same team as R3F. A store is a hook (`useStore(selector)`) that any component can read, inside or outside the Canvas, plus `useStore.getState()` to read the latest value **without subscribing**, which is perfect for `useFrame`.
:::

```jsx run title="A Zustand store shared by HTML and the scene" level=intermediate
import { useRef } from "react";
import { create } from "zustand";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";

// one store for the whole app
const useConfig = create((set) => ({
  color: "#10b981",
  doorsOpen: false,
  spin: 0.4,
  setColor: (color) => set({ color }),
  toggleDoors: () => set((s) => ({ doorsOpen: !s.doorsOpen })),
  setSpin: (spin) => set({ spin }),
}));

function Cabinet() {
  const color = useConfig((s) => s.color);                 // re-renders only when color changes
  const group = useRef(), left = useRef(), right = useRef();
  useFrame((_, dt) => {
    const { doorsOpen, spin } = useConfig.getState();      // read without subscribing: no re-renders
    group.current.rotation.y += spin * dt;
    const target = doorsOpen ? 1.9 : 0;
    left.current.rotation.y += (-target - left.current.rotation.y) * Math.min(1, dt * 6);
    right.current.rotation.y += (target - right.current.rotation.y) * Math.min(1, dt * 6);
  });
  return (
    <group ref={group}>
      <mesh position-y={1}><boxGeometry args={[1.6, 2, 0.8]} /><meshStandardMaterial color="#334155" /></mesh>
      {/* each door pivots on its outer edge: the group sits on the hinge, the mesh is offset inside it */}
      <group ref={left} position={[-0.8, 1, 0.42]}>
        <mesh position-x={0.4}><boxGeometry args={[0.78, 1.9, 0.05]} /><meshStandardMaterial color={color} /></mesh>
      </group>
      <group ref={right} position={[0.8, 1, 0.42]}>
        <mesh position-x={-0.4}><boxGeometry args={[0.78, 1.9, 0.05]} /><meshStandardMaterial color={color} /></mesh>
      </group>
    </group>
  );
}

function Panel() {                                          // ordinary HTML, same store
  const { color, setColor, doorsOpen, toggleDoors, spin, setSpin } = useConfig();
  return (
    <div className="overlay">
      <div className="row">{["#10b981", "#f59e0b", "#ef4444", "#6366f1"].map((c) => (
        <button key={c} onClick={() => setColor(c)} style={{ background: c, width: 28, height: 28, outline: c === color ? "2px solid var(--fg)" : "" }} />
      ))}</div>
      <button onClick={toggleDoors}>{doorsOpen ? "Close doors" : "Open doors"}</button>
      <label>spin <input type="range" min="0" max="2" step="0.01" value={spin} onChange={(e) => setSpin(+e.target.value)} /></label>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Panel />
      <Canvas camera={{ position: [3, 2.5, 4], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 3]} intensity={2} />
        <Cabinet />
        <ContactShadows position-y={0} opacity={0.5} blur={2.5} scale={6} />
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>
    </>
  );
}
```

Two different reads, deliberately:

- `useConfig((s) => s.color)` **subscribes**: the component re-renders when the colour changes, which is what you want for a prop like `color`.
- `useConfig.getState()` inside `useFrame` **reads without subscribing**: the spin speed changes many times while you drag the slider, but the cabinet never re-renders; the frame loop just picks up the new value.

## Smooth transitions with maath

The door code above hand-writes "move a fraction of the way each frame". **maath** (also from pmndrs) packages frame-rate-independent damping for numbers, vectors, Euler angles, quaternions, colours and matrices:

:::syntax
```js
import { easing } from "maath";

useFrame((state, delta) => {
  easing.damp(ref.current, "opacity", target, 0.25, delta);          // a number property
  easing.damp3(ref.current.position, [x, y, z], 0.25, delta);        // a Vector3 towards [x, y, z]
  easing.dampE(ref.current.rotation, [0, angle, 0], 0.25, delta);    // an Euler (shortest path)
  easing.dampC(material.color, "#ff0000", 0.25, delta);              // a Color
  easing.damp3(state.camera.position, camTarget, 0.4, delta);        // the camera, too
});
// the 4th argument is the smooth time in seconds: roughly how long to settle
```
:::

```jsx run title="Click a shelf item: it slides out and the camera follows" level=intermediate
import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { easing } from "maath";

const items = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];

function Item({ index, color, active, onSelect }) {
  const ref = useRef();
  useFrame((_, dt) => {
    easing.damp3(ref.current.position, [(index - 2) * 1.2, active ? 1.2 : 0.4, active ? 1.2 : 0], 0.25, dt);
    easing.dampE(ref.current.rotation, [0, active ? Math.PI * 2 : 0, 0], 0.4, dt);
    easing.dampC(ref.current.material.color, active ? "#ffffff" : color, 0.3, dt);
    easing.damp3(ref.current.scale, active ? 1.3 : 1, 0.2, dt);
  });
  return (
    <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onSelect(active ? null : index); }}>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function CameraRig({ active }) {
  useFrame((state, dt) => {
    const x = active === null ? 0 : (active - 2) * 1.2;
    easing.damp3(state.camera.position, [x * 0.6, active === null ? 2.5 : 2, active === null ? 7 : 4.5], 0.5, dt);
    state.camera.lookAt(x * 0.8, 0.8, 0);
  });
  return null;                                   // a component that only adds behaviour
}

export default function App() {
  const [active, setActive] = useState(null);
  return (
    <Canvas camera={{ position: [0, 2.5, 7], fov: 45 }} onPointerMissed={() => setActive(null)}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 3]} intensity={2} />
      {items.map((c, i) => <Item key={c} index={i} color={c} active={active === i} onSelect={setActive} />)}
      <mesh position-y={-0.05}><boxGeometry args={[7, 0.1, 1.5]} /><meshStandardMaterial color="#475569" /></mesh>
      <CameraRig active={active} />
    </Canvas>
  );
}
```

React state (`active`) changes **once per click**. Everything that moves (position, rotation, colour, scale, camera) is damped in `useFrame`, so transitions are smooth, interruptible (click another item mid-flight and it simply retargets), and cause zero extra React renders.

## Springs with react-spring

For bouncy, physical motion triggered by events, **react-spring** animates props with spring physics. `@react-spring/three` provides `animated.mesh`, `animated.group` and friends that accept animated values directly:

```jsx run title="Springy buttons with @react-spring/three" level=intermediate
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useSpring, animated } from "@react-spring/three";

function SpringyBox({ x }) {
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { scale, rotation, color } = useSpring({
    scale: active ? 1.6 : hovered ? 1.15 : 1,
    rotation: [0, active ? Math.PI : 0, 0],
    color: active ? "#f472b6" : "#38bdf8",
    config: { mass: 1, tension: 280, friction: 14 },     // low friction → more bounce
  });
  return (
    <animated.mesh position-x={x} scale={scale} rotation={rotation}
      onClick={() => setActive(!active)} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      <boxGeometry args={[0.9, 0.9, 0.9]} />
      <animated.meshStandardMaterial color={color} />
    </animated.mesh>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 1.5, 6] }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 3]} intensity={2} />
      {[-2, 0, 2].map((x) => <SpringyBox key={x} x={x} />)}
    </Canvas>
  );
}
```

| Tool | Feel | Best for |
|---|---|---|
| `useFrame` + **maath** `easing.damp*` | smooth ease-out, always heading to the latest target | camera rigs, follow behaviour, state-driven transitions |
| **react-spring** | physical, bouncy, configurable mass/tension/friction | buttons, pop-ins, playful UI |
| **GSAP** (Module 1) | precise timelines, sequences, scroll triggers | storytelling, choreographed reveals |
| `AnimationMixer` / drei `useAnimations` | keyframe clips from Blender | characters, machines |

## Avoiding re-render storms: a checklist

- Don't `setState` in `useFrame` or in high-frequency events (`onPointerMove`, `onWheel`); mutate refs instead.
- Subscribe with **narrow selectors** (`useStore(s => s.color)`), not the whole store.
- Read fast-changing store values with `getState()` inside `useFrame`.
- Keep expensive geometry/material creation in `useMemo`, or declare it outside components, so re-renders don't rebuild it.
- Use `startTransition` (React) for heavy state changes such as swapping a model, so the frame loop stays responsive.

:::ai
This "state sets targets, the loop animates towards them" pattern is exactly what you need when an **AI assistant** drives a 3D scene: the model calls a tool like `setColor("forest green")` or `focusPart("left door")`, which updates the store once, and the scene animates smoothly to the new state. The Project Lab's AI scene builder is built this way.
:::

## Check yourself

```quiz
? Which belongs in React/Zustand state?
+ The id of the selected part
- The camera's position during a transition
- A door's angle as it swings
> Discrete app state goes in state; per-frame values in refs.

? How do you read a Zustand value inside useFrame without re-rendering?
+ useStore.getState().value
- useStore() at the top of the component
- useState
> getState reads the current value without subscribing.

? What does `easing.damp3(ref.current.position, [0, 1, 0], 0.25, delta)` do?
+ Moves the position smoothly towards (0, 1, 0), settling in about 0.25 s, frame-rate independently
- Teleports the object
- Animates over exactly 0.25 frames
> Call it every frame; it retargets automatically.

? You want a playful, bouncy scale-up on click. Which tool fits best?
- GSAP ScrollTrigger
+ react-spring
- AnimationMixer
> Springs give physical overshoot and settle.

? Why is calling setState in onPointerMove risky?
+ It can fire many times per frame, re-rendering React each time
- It's not allowed by R3F
- It breaks pointer capture
> Use refs (or throttle) for high-frequency updates.
```

:::exercise Theme switch
Add a `theme` value (`"day"` / `"night"`) to the Zustand store in the cabinet example and a button to toggle it. In a `<Lighting>` component, damp the ambient light's intensity and the scene background colour towards the theme's values in `useFrame` with maath (`easing.damp` and `easing.dampC`), so switching fades smoothly.
:::

:::solution
```jsx run
import { useRef } from "react";
import * as THREE from "three";
import { create } from "zustand";
import { Canvas, useFrame } from "@react-three/fiber";
import { easing } from "maath";

const useTheme = create((set) => ({ theme: "day", toggle: () => set((s) => ({ theme: s.theme === "day" ? "night" : "day" })) }));
const LOOK = { day: { bg: "#e0f2fe", ambient: 1 }, night: { bg: "#020617", ambient: 0.1 } };

function Lighting() {
  const ambient = useRef();
  useFrame((state, dt) => {
    const look = LOOK[useTheme.getState().theme];
    if (!state.scene.background) state.scene.background = new THREE.Color(look.bg);
    easing.dampC(state.scene.background, look.bg, 0.6, dt);
    easing.damp(ambient.current, "intensity", look.ambient, 0.6, dt);
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={1} />
      <pointLight position={[0, 2, 1.5]} intensity={8} color="#fbbf24" />
    </>
  );
}

export default function App() {
  const toggle = useTheme((s) => s.toggle);
  return (
    <>
      <button className="overlay" onClick={toggle}>Toggle day / night</button>
      <Canvas camera={{ position: [0, 1.5, 5] }}>
        <Lighting />
        <mesh><torusKnotGeometry args={[0.8, 0.28, 160, 24]} /><meshStandardMaterial color="#10b981" /></mesh>
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- Separate **app state** (selections, settings: React/Zustand) from **frame state** (current motion: refs).
- **Zustand** shares one store between HTML and 3D; use narrow selectors to render, `getState()` to read in `useFrame`.
- **maath** `easing.damp/damp3/dampE/dampC` gives smooth, interruptible, frame-rate-independent transitions, including the camera.
- **react-spring** for bouncy event-driven motion, **GSAP** for timelines, mixers for clips.
- State sets **targets**; the loop animates towards them, with no re-render storms.
:::
