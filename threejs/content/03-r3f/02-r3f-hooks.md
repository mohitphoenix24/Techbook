---
title: R3F Hooks — useFrame, useThree & useLoader
level: intermediate
time: 35
summary: Animating with useFrame (clock, delta, pointer, priorities), reading the renderer, camera, size and viewport with useThree, loading assets with useLoader and Suspense, refs to three.js objects, and writing your own 3D hooks.
---

Components describe *what* is in the scene. **Hooks** connect them to time, to the renderer and to assets. Three hooks cover almost everything: `useFrame` for per-frame updates, `useThree` for the R3F state (camera, size, renderer…), and `useLoader` for loading files with caching and Suspense. They only work **inside** `<Canvas>`, because that's where R3F's context lives.

## useFrame: code that runs every frame

:::syntax
```jsx
useFrame((state, delta, xrFrame) => {
  // state: the R3F state (clock, camera, pointer, size, scene, gl…)
  // delta: seconds since the last frame
  // xrFrame: the WebXR frame, during VR/AR sessions
  ref.current.rotation.y += delta;
}, priority);   // optional: order relative to other useFrame calls
```
:::

```jsx run title="useFrame: clock, delta and the pointer" level=intermediate
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

function Spinner({ position, speed }) {
  const ref = useRef();
  useFrame((_, delta) => (ref.current.rotation.y += delta * speed));      // frame-rate independent
  return (
    <mesh ref={ref} position={position}>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial color="#818cf8" />
    </mesh>
  );
}

function Bobber() {
  const ref = useRef();
  useFrame(({ clock }) => {
    ref.current.position.y = Math.sin(clock.elapsedTime * 2) * 0.5;      // absolute time → smooth loop
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.45, 32, 16]} />
      <meshStandardMaterial color="#34d399" />
    </mesh>
  );
}

function Eye({ position }) {
  const ref = useRef();
  useFrame(({ pointer, viewport }) => {
    // pointer is in normalised coordinates (−1…1); viewport is the visible area in world units
    const x = (pointer.x * viewport.width) / 2, y = (pointer.y * viewport.height) / 2;
    ref.current.lookAt(x, y, 3);                                           // look at a point in front of the screen
  });
  return (
    <group ref={ref} position={position}>
      <mesh><sphereGeometry args={[0.4, 32, 16]} /><meshStandardMaterial color="white" /></mesh>
      <mesh position-z={0.33}><sphereGeometry args={[0.13, 16, 8]} /><meshStandardMaterial color="#0f172a" /></mesh>
    </group>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 3]} intensity={2} />
      <Spinner position={[-2.5, 0, 0]} speed={1} />
      <Spinner position={[2.5, 0, 0]} speed={3} />
      <Bobber />
      <Eye position={[-0.5, 1.6, 0]} />
      <Eye position={[0.5, 1.6, 0]} />
    </Canvas>
  );
}
```

Move the mouse: the eyes follow it. `state.pointer` and `state.viewport` together convert the mouse into world units, a pattern used for parallax hero sections and cursor-following effects.

:::warn Never call setState inside useFrame
`useFrame` runs 60–120 times a second. Calling `setState` there re-renders the component 60–120 times a second through React, which is slow and unnecessary. **Mutate the three.js object through a ref** instead (`ref.current.position.x = …`). Keep React state for things that change on user actions (selected item, colour, mode), not for things that change every frame.
:::

### What's in `state`

| Field | What it is |
|---|---|
| `clock` | elapsed time (`clock.elapsedTime`) since the canvas started |
| `camera`, `scene`, `gl` | the default camera, the scene, the `WebGLRenderer` (or WebGPU) |
| `pointer` | the mouse/touch in NDC (−1…1) |
| `size` | canvas size in pixels |
| `viewport` | visible area **in world units** at the camera's focus distance: `{ width, height, factor, dpr }` |
| `raycaster` | the raycaster R3F uses for events |
| `invalidate()` | request a frame (with `frameloop="demand"`) |
| `setDpr`, `setFrameloop`, `set` | change settings at runtime |
| `performance` | the regression system used by adaptive-quality helpers |

### Priorities and taking over rendering

By default R3F renders the scene **after** all `useFrame` callbacks. Give a callback a positive **priority** and R3F stops rendering automatically, because it assumes you'll do it (post-processing, multiple passes, render targets):

```jsx
useFrame(({ gl, scene, camera }) => {
  gl.render(scene, camera);           // you now own the render call
}, 1);                                // priority > 0 disables R3F's automatic render
```

Negative priorities run earlier, which is useful to update physics or input before other components read them.

## useThree: the R3F state as a hook

`useThree()` returns the same state object, and **re-renders the component when the parts you read change**. Pass a **selector** to subscribe only to what you need:

```jsx
const camera = useThree((s) => s.camera);       // re-render only if the camera object changes
const { width, height } = useThree((s) => s.viewport);
const gl = useThree((s) => s.gl);
```

`viewport` makes **responsive 3D layouts** possible: size and place objects relative to the visible area, so the composition works on phones and wide monitors. Resize the preview (or press Fullscreen) to watch the cards re-flow:

```jsx run title="Responsive layout with viewport" level=intermediate
import { Canvas, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";

function Cards() {
  const { width, height } = useThree((s) => s.viewport);          // world units visible at z = 0
  const columns = width > 7 ? 4 : width > 4.5 ? 3 : 2;
  const gap = 0.25, cardW = (width - gap * (columns + 1)) / columns, cardH = cardW * 0.7;
  return Array.from({ length: 8 }, (_, i) => {
    const col = i % columns, row = Math.floor(i / columns);
    const x = -width / 2 + gap + cardW / 2 + col * (cardW + gap);
    const y = height / 2 - gap - cardH / 2 - row * (cardH + gap);
    return (
      <group key={i} position={[x, y, 0]}>
        <mesh>
          <planeGeometry args={[cardW, cardH]} />
          <meshStandardMaterial color={`hsl(${160 + i * 18}, 60%, 45%)`} />
        </mesh>
        <Text fontSize={Math.min(cardW, cardH) * 0.25} color="white" position-z={0.01}>{`Card ${i + 1}`}</Text>
      </group>
    );
  });
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
      <ambientLight intensity={1.2} />
      <Cards />
    </Canvas>
  );
}
```

## useLoader and Suspense

`useLoader(LoaderClass, url)` loads a file with any three.js loader, **caches** it (the same URL is loaded once for the whole app) and **suspends** the component until it's ready. Wrap it in React's `<Suspense>` with a fallback:

```jsx run title="Loading a texture with useLoader + Suspense" level=intermediate
import { Suspense, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

const EX = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/planets/";

function Earth() {
  const ref = useRef();
  // several URLs at once → an array of textures, loaded in parallel, cached by URL
  const [day, normal, specular] = useLoader(THREE.TextureLoader, [
    EX + "earth_atmos_2048.jpg", EX + "earth_normal_2048.jpg", EX + "earth_specular_2048.jpg",
  ]);
  day.colorSpace = THREE.SRGBColorSpace;
  useFrame((_, dt) => (ref.current.rotation.y += dt * 0.15));
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1.6, 64, 32]} />
      <meshPhongMaterial map={day} normalMap={normal} specularMap={specular} shininess={25} />
    </mesh>
  );
}

function Placeholder() {                     // shown while Earth suspends
  const ref = useRef();
  useFrame((_, dt) => (ref.current.rotation.y += dt * 2));
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1.6, 1]} />
      <meshBasicMaterial color="#64748b" wireframe />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 1.5, 5]} intensity={3} />
      <Suspense fallback={<Placeholder />}>
        <Earth />
      </Suspense>
      <OrbitControls />
    </Canvas>
  );
}
```

:::tip drei shortcuts
drei wraps the common loaders: `useTexture(url | urls | {map, normalMap})`, `useGLTF(url)` (with Draco and Meshopt configured), `useKTX2`, `useFBX`, `useCubeTexture`, `useVideoTexture`. Call `useGLTF.preload(url)` at module level to start downloading before the component mounts.
:::

## Refs: reaching the three.js object

A `ref` on any R3F element gives you the real three.js instance, so every Module 1–2 technique still applies: `ref.current.geometry.computeBoundingBox()`, `ref.current.lookAt(...)`, `ref.current.material.color.set(...)`. Refs are populated after the first render, so read them in `useFrame`, `useEffect` or event handlers, not during rendering.

## Your own hooks

Hooks compose. Package a behaviour once and reuse it across components, exactly as in React UI code:

```jsx run title="A custom useFloat hook" level=intermediate
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

// any component can now float, each with its own speed and height
function useFloat({ speed = 1, height = 0.3, offset = 0 } = {}) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed + offset;
    ref.current.position.y = Math.sin(t) * height;
    ref.current.rotation.z = Math.sin(t * 0.7) * 0.15;
  });
  return ref;
}

function Balloon({ x, color, speed }) {
  const ref = useFloat({ speed, height: 0.4, offset: x });
  return (
    <group position-x={x}>
      <group ref={ref}>
        <mesh scale={[1, 1.2, 1]}><sphereGeometry args={[0.45, 32, 16]} /><meshStandardMaterial color={color} roughness={0.2} /></mesh>
        <mesh position-y={-0.9}><cylinderGeometry args={[0.005, 0.005, 0.9]} /><meshBasicMaterial color="#64748b" /></mesh>
      </group>
    </group>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 6] }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 3]} intensity={2} />
      {["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"].map((c, i) => (
        <Balloon key={c} x={(i - 2) * 1.2} color={c} speed={0.8 + i * 0.2} />
      ))}
    </Canvas>
  );
}
```

drei ships many such hooks and components built exactly this way (`<Float>` is the polished version of this one).

## Check yourself

```quiz
? Where can you call useFrame and useThree?
+ Only in components rendered inside <Canvas>
- Anywhere in the React app
- Only in the App component
> They read R3F's context, which exists inside the Canvas.

? A position changes every frame. Where should you store it?
+ Mutate the object through a ref in useFrame
- In useState, updated in useFrame
- In a Context provider
> setState 60× per second re-renders React for nothing.

? What does `viewport.width` from useThree give you?
+ The visible width in world units at the camera's focus distance
- The canvas width in pixels
- The device width in CSS pixels
> Use it to lay out objects responsively.

? What does useLoader do while the file is loading?
+ It suspends the component, so the nearest <Suspense> shows its fallback
- It returns null
- It blocks the main thread
> And it caches by URL afterwards.

? What happens when you give useFrame a priority of 1?
+ R3F stops its automatic render; you must render yourself
- The callback runs only once
- It runs at 1 fps
> Positive priority = you take over rendering.
```

:::exercise Follow the mouse, smoothly
Make a sphere that follows the pointer across the screen in world units, but smoothly: in `useFrame`, damp its position towards the target with `THREE.MathUtils.damp(current, target, 6, delta)` for x and y.
:::

:::solution
```jsx run
import { useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";

function Follower() {
  const ref = useRef();
  useFrame(({ pointer, viewport }, delta) => {
    const tx = (pointer.x * viewport.width) / 2, ty = (pointer.y * viewport.height) / 2;
    ref.current.position.x = THREE.MathUtils.damp(ref.current.position.x, tx, 6, delta);
    ref.current.position.y = THREE.MathUtils.damp(ref.current.position.y, ty, 6, delta);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.3, 32, 16]} />
      <meshStandardMaterial color="#f472b6" />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 6] }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 4]} intensity={2} />
      <Follower />
    </Canvas>
  );
}
```
:::

:::keypoints
- `useFrame((state, delta) => …)` runs every frame: mutate via refs, use `delta` or `clock.elapsedTime`, never `setState`.
- `state` holds `clock`, `camera`, `scene`, `gl`, `pointer`, `size`, `viewport`, `invalidate()`…; positive priorities take over rendering.
- `useThree(selector)` reads that state reactively; `viewport` enables responsive 3D layouts.
- `useLoader` loads, caches and suspends: wrap in `<Suspense fallback={…}>`; drei adds `useTexture`, `useGLTF` and friends.
- Package behaviour in **custom hooks** that use `useFrame` and return refs.
:::
