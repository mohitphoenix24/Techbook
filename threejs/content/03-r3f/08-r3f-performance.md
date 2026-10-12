---
title: R3F Performance — Renders, Frames & Adaptive Quality
level: advanced
time: 35
summary: The two kinds of cost in R3F (React re-renders and GPU frames), rendering on demand with invalidate, finding and fixing re-render storms, adaptive resolution with PerformanceMonitor, LOD with Detailed, faster raycasting, preloading and compiling, and startTransition for heavy changes.
---

Everything from the three.js performance lesson still applies inside R3F: draw calls, pixels, textures and shaders cost the same. R3F adds one more thing to watch: **React re-renders**. A re-render doesn't redraw the GPU frame, but it does run your component functions and reconcile the scene graph on the CPU, and done 60 times a second it eats the frame budget. This lesson covers both sides.

## Render only when needed: frameloop="demand"

By default R3F renders continuously. For scenes that are often still (product viewers, dashboards, maps), `frameloop="demand"` renders **only when something changes**: R3F re-renders automatically when props change, drei controls request frames while moving, and you call `invalidate()` for anything else.

```jsx run title="On-demand rendering with invalidate" level=intermediate
import { useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";

function FrameCounter({ onFrame }) {
  useFrame(() => onFrame());                       // runs only on frames that are actually rendered
  return null;
}

function Turntable({ spinning }) {
  const ref = useRef();
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, dt) => {
    if (!spinning) return;
    ref.current.rotation.y += dt;
    invalidate();                                  // keep requesting frames only while animating
  });
  return (
    <mesh ref={ref}>
      <torusKnotGeometry args={[0.8, 0.28, 200, 32]} />
      <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.25} />
    </mesh>
  );
}

export default function App() {
  const counter = useRef(null), frames = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const onFrame = () => { frames.current++; if (counter.current) counter.current.textContent = frames.current; };
  return (
    <>
      <div className="overlay">
        <span>Frames rendered: <b ref={counter}>0</b></span>
        <button onClick={() => setSpinning(!spinning)}>{spinning ? "Stop" : "Spin"}</button>
        <span className="muted">Idle = 0 frames. Drag to orbit: frames only while moving.</span>
      </div>
      <Canvas frameloop="demand" camera={{ position: [0, 0, 4] }}>
        <color attach="background" args={["#1e293b"]} />
        <Turntable spinning={spinning} />
        <Environment preset="city" />
        <OrbitControls enableDamping={false} />
        <FrameCounter onFrame={onFrame} />
      </Canvas>
    </>
  );
}
```

Notice the frame counter is updated through a **ref**, not state: setting state on every frame would re-render the overlay 60 times a second (the very problem this lesson is about).

:::tip Things that need invalidate()
With `frameloop="demand"`, call `invalidate()` after anything R3F can't see: mutating an object through a ref outside `useFrame`, a texture finishing loading in your own code, an animation library (GSAP) updating values, or a WebSocket message changing a mesh. Many drei components (controls, `useTexture`, `Environment`) already call it for you.
:::

## Finding re-render storms

The classic mistake: putting fast-changing values in React state. This demo shows both versions side by side, with a render counter on each component. Move the mouse over the canvas:

```jsx run title="State vs. ref: count the re-renders" level=intermediate
import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

function useRenderCount() {
  const n = useRef(0);
  n.current++;
  return n.current;
}

function BadFollower({ report }) {
  const [pos, setPos] = useState([0, 0, 0]);
  report(useRenderCount());
  useFrame(({ pointer, viewport }) => setPos([pointer.x * viewport.width / 2 - 1.2, pointer.y * viewport.height / 2, 0]));   // ❌ setState 60×/s
  return <mesh position={pos}><sphereGeometry args={[0.3]} /><meshStandardMaterial color="#ef4444" /></mesh>;
}

function GoodFollower({ report }) {
  const ref = useRef();
  report(useRenderCount());
  useFrame(({ pointer, viewport }) => ref.current.position.set(pointer.x * viewport.width / 2 + 1.2, pointer.y * viewport.height / 2, 0));   // ✅ mutate
  return <mesh ref={ref}><sphereGeometry args={[0.3]} /><meshStandardMaterial color="#22c55e" /></mesh>;
}

export default function App() {
  const bad = useRef(), good = useRef();
  const show = (el) => (n) => { if (el.current) el.current.textContent = n; };
  return (
    <>
      <div className="overlay">
        <span style={{ color: "#ef4444" }}>red (useState): <b ref={bad}>0</b> React renders</span>
        <span style={{ color: "#22c55e" }}>green (ref): <b ref={good}>0</b> React renders</span>
      </div>
      <Canvas camera={{ position: [0, 0, 6] }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 4]} intensity={2} />
        <BadFollower report={show(bad)} />
        <GoodFollower report={show(good)} />
      </Canvas>
    </>
  );
}
```

Both spheres look identical. The red one re-renders its component every frame (thousands of renders within a minute); the green one rendered once. In a real app the "red" pattern is multiplied by every component that subscribes to the changing state.

| Symptom | Likely cause | Fix |
|---|---|---|
| whole scene re-renders on every mouse move | `setState` in `onPointerMove`/`useFrame` | refs, or throttle, or transient store reads |
| everything re-renders when one value changes | components subscribe to a whole store/context | narrow Zustand selectors; split contexts |
| geometry/material rebuilt on every render | inline objects (`args={[new Float32Array(...)]}`, `new THREE.Color()` in render) | `useMemo`, or hoist constants outside the component |
| freeze when switching models | heavy suspense work blocks input | `startTransition`, preload, nested Suspense |

React DevTools' **Profiler** ("Highlight updates when components render") shows exactly which components re-render.

## Adaptive quality with PerformanceMonitor

drei's `<PerformanceMonitor>` watches the frame rate and calls `onDecline` / `onIncline` when it drops or recovers. Pair it with the canvas `dpr` to trade sharpness for speed automatically, and with feature flags to disable expensive effects on weak devices:

```jsx run title="PerformanceMonitor: lower resolution and effects when slow" level=advanced
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, Environment, OrbitControls, ContactShadows } from "@react-three/drei";

function HeavyScene({ quality }) {
  const knots = quality === "high" ? 40 : 12;
  return Array.from({ length: knots }, (_, i) => (
    <mesh key={i} position={[(i % 8 - 3.5) * 1.1, Math.floor(i / 8) * 1.1 - 1.5, 0]} rotation={[i, i * 2, 0]}>
      <torusKnotGeometry args={[0.35, 0.12, quality === "high" ? 256 : 64, quality === "high" ? 32 : 8]} />
      <meshPhysicalMaterial color={`hsl(${i * 9}, 70%, 55%)`} clearcoat={1} roughness={0.2} />
    </mesh>
  ));
}

export default function App() {
  const [dpr, setDpr] = useState(1.5);
  const [quality, setQuality] = useState("high");
  const [log, setLog] = useState("measuring…");
  return (
    <>
      <div className="overlay"><b>dpr {dpr.toFixed(2)} · {quality} quality</b><span className="muted">{log}</span></div>
      <Canvas dpr={dpr} camera={{ position: [0, 0, 8] }}>
        <PerformanceMonitor
          onIncline={() => { setDpr(Math.min(2, dpr + 0.25)); setLog("fast → sharper"); }}
          onDecline={() => { setDpr(Math.max(0.75, dpr - 0.25)); setLog("slow → fewer pixels"); }}
          flipflops={3}                                          // give up adjusting after 3 up/down swings…
          onFallback={() => { setQuality("low"); setLog("still slow → low quality"); }}   // …and switch to low quality
        />
        <HeavyScene quality={quality} />
        <ContactShadows position-y={-2.4} opacity={0.4} blur={2} scale={12} />
        <Environment preset="city" />
        <OrbitControls />
      </Canvas>
    </>
  );
}
```

Related drei helpers:

| Helper | Does |
|---|---|
| `<AdaptiveDpr pixelated />` | drops pixel ratio while the camera moves, restores when still |
| `<AdaptiveEvents />` | disables raycasting while the camera moves |
| `<Detailed distances={[0, 10, 20]}>` | level of detail: children are high → low versions |
| `<Bvh firstHitOnly>` | accelerates raycasting on big meshes with three-mesh-bvh |
| `<BakeShadows />` | renders shadow maps once, then freezes them (static scenes) |
| `<Preload all />` | uploads textures and compiles shaders up front |
| `r3f-perf` (`<Perf />`) | an on-screen panel: FPS, GPU time, draw calls, memory |

## Heavy changes without freezing: startTransition

Swapping a product model or rebuilding a large instanced field can take long enough to freeze input. React's `startTransition` marks the update as low-priority: React keeps the previous scene interactive while it prepares the next one, and Suspense won't flash a fallback:

```jsx
import { startTransition, useState } from "react";

const [model, setModel] = useState("/sofa.glb");
<button onClick={() => startTransition(() => setModel("/armchair.glb"))}>Armchair</button>
```

## Checklist for R3F apps

- `dpr={[1, 2]}` (the default) or tighter on mobile; consider `PerformanceMonitor`.
- `frameloop="demand"` for viewers that are mostly idle.
- Mutate in `useFrame`; never `setState` per frame; narrow selectors.
- `useMemo` for generated data, geometries and materials; hoist constants.
- Instances / Merged for repeated objects; `Detailed` for LOD.
- Preload models (`useGLTF.preload`), `<Preload all />`, compressed assets (gltfjsx `--transform`).
- Profile with React DevTools (renders) and r3f-perf / Spector.js (GPU).

## Check yourself

```quiz
? With frameloop="demand", when does R3F draw a frame?
+ When props change, when controls move, or when invalidate() is called
- Only once at startup
- 30 times per second
> Idle scenes cost nothing.

? A sphere follows the mouse with setState inside useFrame. What's wrong?
+ The component re-renders through React every frame; mutate a ref instead
- useFrame doesn't support state
- Nothing; that's the recommended way
> Re-renders are CPU work the frame doesn't need.

? What does PerformanceMonitor's onDecline typically do?
+ Lower the pixel ratio or disable expensive features when FPS drops
- Reload the page
- Increase antialiasing
> Adaptive quality keeps frame rate stable.

? Why wrap a model swap in startTransition?
+ So React keeps the current scene interactive while preparing the heavy update
- To animate the transition
- To preload the model
> Low-priority updates don't block input.

? What does <Bvh> help with?
+ Much faster raycasting (pointer events) on large meshes
- Fewer draw calls
- Smaller textures
> It builds a bounding volume hierarchy with three-mesh-bvh.
```

:::exercise Pause when hidden
Using `frameloop="demand"`, make the spinning turntable stop requesting frames when the browser tab is hidden (`document.visibilityState`), and resume when visible.
:::

:::solution
```jsx run
import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

function Spinner({ active }) {
  const ref = useRef();
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, dt) => {
    if (!active) return;
    ref.current.rotation.y += dt;
    invalidate();
  });
  useEffect(() => { if (active) invalidate(); }, [active, invalidate]);   // kick off the first frame
  return <mesh ref={ref}><boxGeometry /><meshNormalMaterial /></mesh>;
}

export default function App() {
  const [visible, setVisible] = useState(document.visibilityState === "visible");
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return (
    <>
      <div className="overlay">Tab visible: {String(visible)}</div>
      <Canvas frameloop="demand"><Spinner active={visible} /></Canvas>
    </>
  );
}
```
:::

:::keypoints
- Two costs: **React re-renders** (CPU) and **GPU frames**; optimise both.
- `frameloop="demand"` + `invalidate()` makes idle scenes free.
- Never `setState` per frame; use refs, narrow selectors and `useMemo`.
- `PerformanceMonitor` + `dpr`, `AdaptiveDpr`, `Detailed`, `Bvh`, `BakeShadows` and `Preload` adapt and speed things up.
- `startTransition` keeps the UI responsive during heavy scene changes.
:::
