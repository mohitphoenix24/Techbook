---
title: React Three Fiber — Three.js as Components
level: intermediate
time: 35
summary: What R3F is and why most React teams use it for 3D, the Canvas, how JSX maps to three.js (args, props, dash-case, attach, primitive), components with props and state, conditional and list rendering of 3D objects, and setting up a project.
---

Everything you built in Modules 1 and 2 was **imperative**: create an object, add it to the scene, change its properties in a loop, remember to remove and dispose it. **React Three Fiber** (R3F) lets you describe the scene **declaratively** instead: "this mesh exists while this state is true, with this colour". React works out what to create, update and dispose. If your app already uses React, which most product UIs do, R3F lets the 3D view share state, components and tooling with the rest of the interface.

:::def React Three Fiber (R3F)
A **React renderer** for three.js, maintained by the Poimandres (pmndrs) collective. Like `react-dom` renders to HTML elements, R3F renders to three.js objects: `<mesh>` becomes `new THREE.Mesh()`. It has no runtime overhead on rendering itself, supports every three.js feature, and versions track React (R3F 9 ↔ React 19).
:::

## The same scene, both ways

```js
// three.js
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "orange" }));
mesh.position.set(0, 1, 0);
scene.add(mesh, new THREE.AmbientLight());
renderer.setAnimationLoop(() => { mesh.rotation.y += 0.01; renderer.render(scene, camera); });
// + resize handling, + dispose on unmount, + event handling via raycasting
```

```jsx
// React Three Fiber
<Canvas>
  <ambientLight />
  <mesh position={[0, 1, 0]}>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color="orange" />
  </mesh>
</Canvas>
// renderer, scene, camera, loop, resize, dispose and pointer events are handled for you
```

## Your first R3F component

```jsx run title="Components, props and state" level=easy
import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

function Box({ position, color }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  useFrame((state, delta) => (ref.current.rotation.x += delta));      // runs every frame
  return (
    <mesh
      ref={ref}
      position={position}
      scale={active ? 1.4 : 1}
      onClick={() => setActive(!active)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? "hotpink" : color} />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 2]} intensity={2} />
      <Box position={[-1.4, 0, 0]} color="#34d399" />
      <Box position={[1.4, 0, 0]} color="#818cf8" />
    </Canvas>
  );
}
```

Hover and click the boxes. Notice what you **didn't** write: no raycaster (R3F's `onClick` and `onPointerOver` handle picking), no resize code, no `scene.add`, no dispose. Each `<Box>` is a reusable component with its own state, exactly like a React button.

## How JSX maps to three.js

R3F's rules are few and consistent. Once you know them, any three.js class is usable from JSX without a wrapper.

| Rule | JSX | three.js equivalent |
|---|---|---|
| Every three.js class is a **camelCase** element | `<meshStandardMaterial />` | `new THREE.MeshStandardMaterial()` |
| Constructor arguments go in **`args`** | `<boxGeometry args={[1, 2, 3]} />` | `new THREE.BoxGeometry(1, 2, 3)` |
| Props **set properties** | `<mesh visible={false} />` | `mesh.visible = false` |
| Arrays call **`.set()`** on vectors, eulers, colours | `position={[1, 2, 3]}` | `mesh.position.set(1, 2, 3)` |
| Scalars also work for uniform vectors | `scale={2}` | `mesh.scale.setScalar(2)` |
| Colours accept CSS colour strings | `color="hotpink"`, `"#34d399"`, `"hsl(160, 60%, 45%)"` | `material.color.set("hotpink")` |
| **Dash-case** sets nested properties | `position-y={2}`, `shadow-mapSize={[2048, 2048]}` | `mesh.position.y = 2`, `light.shadow.mapSize.set(…)` |
| Children are added to parents | `<group><mesh /></group>` | `group.add(mesh)` |
| Geometries and materials **attach** automatically | `<mesh><boxGeometry /></mesh>` | `mesh.geometry = …` |
| **`attach`** for anything else | `<color attach="background" args={["#000"]} />` | `scene.background = new THREE.Color("#000")` |
| **`<primitive object={x} />`** inserts an existing object | `<primitive object={gltf.scene} />` | `parent.add(gltf.scene)` |
| **`ref`** gives you the three.js object | `ref.current.rotation.y` | the instance itself |

:::warn three.js colour strings are not full CSS
`THREE.Color` understands hex, named colours, `rgb(…)` and `hsl(…)` **with commas**. The newer space-separated CSS syntax (`hsl(160 60% 45%)`) and `oklch()` aren't parsed and silently become **white**. If a colour mysteriously renders white, check the string.
:::

:::warn Changing `args` re-creates the object
Props update an existing object, but `args` are constructor arguments, so changing them **destroys and re-creates** the object (and disposes the old one). That's fine for occasional changes (a segment-count slider) and expensive every frame. Animate with props or refs, not args.
:::

```jsx run title="args, dash-case, attach and nested properties" level=intermediate
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

export default function App() {
  return (
    <Canvas shadows="percentage" camera={{ position: [4, 3, 6], fov: 45 }}>
      {/* attach: sets scene.background and scene.fog */}
      <color attach="background" args={["#0f172a"]} />
      <fog attach="fog" args={["#0f172a", 8, 20]} />

      <hemisphereLight args={["#c7d2fe", "#0f172a", 1]} />
      {/* dash-case reaches into nested objects: light.shadow.mapSize, light.shadow.camera… */}
      <directionalLight position={[4, 6, 3]} intensity={2.5} castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-5} shadow-camera-right={5}
        shadow-camera-top={5} shadow-camera-bottom={-5} />

      <mesh position-y={1} rotation-y={Math.PI / 4} castShadow>
        <torusKnotGeometry args={[0.6, 0.2, 160, 24]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.3} metalness={0.4} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <OrbitControls />
    </Canvas>
  );
}
```

`shadows="percentage"` selects `PCFShadowMap`. Plain `shadows` asks for `PCFSoftShadowMap`, which three.js r186 removed, so it logs a warning (see the Lights lesson).

## The Canvas

`<Canvas>` creates the renderer, a scene, a default camera, the render loop, resize handling and the pointer-event system, and sizes itself to its **parent element**. Common props:

| Prop | Purpose | Default |
|---|---|---|
| `camera` | default camera settings, e.g. `{ position: [0, 2, 5], fov: 50 }` | fov 75 at z = 5 |
| `orthographic` | use an orthographic camera | `false` |
| `shadows` | enable shadow maps (`"percentage"`, `"variance"`, `"basic"`) | off |
| `dpr` | pixel ratio, or a `[min, max]` range | `[1, 2]` |
| `gl` | renderer options, or a (async) factory for custom renderers like WebGPU | `{ antialias: true, alpha: true }` |
| `frameloop` | `"always"`, `"demand"` (render on change) or `"never"` | `"always"` |
| `flat` | disable tone mapping (`NoToneMapping`) | ACES Filmic |
| `linear` | disable automatic sRGB output | off |
| `onCreated` | callback with the R3F state once ready | — |
| `onPointerMissed` | clicks that hit nothing (deselect!) | — |
| `fallback` | DOM content shown if WebGL is unavailable | — |

## Lists, conditions and state: it's just React

Because 3D objects are components, everything you know from React works: map over data to render a list of meshes, use `&&` to show and hide objects, lift state up, pass callbacks. Here a normal HTML panel and the 3D scene share the same state:

```jsx run title="HTML UI and 3D scene sharing state" level=intermediate
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

const SHAPES = { box: <boxGeometry />, sphere: <sphereGeometry args={[0.6, 32, 16]} />, cone: <coneGeometry args={[0.6, 1.2, 32]} /> };

export default function App() {
  const [items, setItems] = useState([{ id: 1, shape: "box", color: "#34d399", x: 0 }]);
  const [selected, setSelected] = useState(null);
  const add = (shape) => setItems((list) => [...list, {
    id: Date.now(), shape, color: `hsl(${Math.round(Math.random() * 360)}, 70%, 60%)`, x: (list.length % 6) * 1.5 - 3.5,
  }]);

  return (
    <>
      <div className="overlay">
        <div className="row">{Object.keys(SHAPES).map((s) => <button key={s} onClick={() => add(s)}>+ {s}</button>)}</div>
        <span className="muted">{items.length} objects · selected: {selected ?? "none"}</span>
        {selected && <button onClick={() => { setItems((l) => l.filter((i) => i.id !== selected)); setSelected(null); }}>Delete selected</button>}
      </div>
      <Canvas camera={{ position: [0, 3, 8], fov: 45 }} onPointerMissed={() => setSelected(null)}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 2]} intensity={2} />
        {items.map((item) => (
          <mesh key={item.id} position={[item.x, 0.6, 0]} onClick={(e) => { e.stopPropagation(); setSelected(item.id); }}>
            {SHAPES[item.shape]}
            <meshStandardMaterial color={item.color} emissive={item.id === selected ? "#ffffff" : "#000000"} emissiveIntensity={0.25} />
          </mesh>
        ))}
        <gridHelper args={[12, 12]} />
        <OrbitControls />
      </Canvas>
    </>
  );
}
```

Delete an object and R3F removes it from the scene **and disposes** its geometry and material. That automatic cleanup alone prevents the most common three.js memory leak.

:::def Reconciliation
React's process of comparing the new component tree with the previous one and applying only the differences. In R3F, "differences" become three.js operations: create a mesh, set `material.color`, remove an object. Use stable `key`s in lists so React knows which object is which.
:::

## Setting up a project

```bash
npm create vite@latest my-r3f -- --template react-ts
cd my-r3f
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
npm run dev
```

```tsx
// src/App.tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";

export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>   {/* Canvas fills its parent: give the parent a size */}
      <Canvas camera={{ position: [0, 1, 4] }}>
        <mesh>
          <torusKnotGeometry />
          <meshStandardMaterial color="hotpink" />
        </mesh>
        <Environment preset="city" />
        <OrbitControls />
      </Canvas>
    </div>
  );
}
```

:::warn The invisible Canvas
The single most common R3F question: "my canvas is empty / 0 pixels tall". The Canvas fills its **parent**, so the parent needs a height (`100vh`, a fixed height, or a flex/grid layout that gives it one).
:::

| Package | What it adds |
|---|---|
| `@react-three/fiber` | the renderer: Canvas, hooks, events |
| `@react-three/drei` | 150+ helpers: controls, environment, text, HTML, loaders, shadows, materials… |
| `@react-three/xr` | VR and AR (Module 5) |
| `@react-three/rapier` | physics |
| `@react-three/postprocessing` | effects |
| `zustand` | state management that plays well with the render loop |
| `leva` | debug GUI panels |

:::tip When to choose plain three.js instead
R3F shines when your 3D lives inside a React app with UI, routing and state. Plain three.js is simpler for a standalone canvas (a WebGL hero banner on a non-React site), for libraries meant to be framework-agnostic, and for engines with their own architecture. Everything you learned in Modules 1–2 still applies inside R3F: refs give you the same objects.
:::

## Check yourself

```quiz
? How do you pass constructor arguments to a three.js class in R3F?
+ With the args prop, e.g. <boxGeometry args={[1, 2, 3]} />
- As children
- With a constructor prop
> args maps to the constructor; changing it re-creates the object.

? What does `position-y={2}` do?
+ Sets mesh.position.y = 2 (dash-case reaches nested properties)
- Creates a new Vector3
- Moves the camera
> Dash-case pierces into nested objects.

? How do you set scene.background in JSX?
+ <color attach="background" args={["#000"]} />
- <scene background="#000" />
- <background color="#000" />
> attach puts the object on a property of the parent (the scene).

? An object is removed from the list you render. What does R3F do?
+ Removes it from the scene and disposes its geometry and material
- Hides it but keeps it in memory
- Nothing until the page reloads
> Automatic cleanup prevents leaks.

? The Canvas renders nothing and has 0 height. Most likely cause?
+ Its parent element has no height
- Missing lights
- R3F requires a camera prop
> The Canvas fills its parent.
```

:::exercise Colour picker
Add a `<input type="color">` to the HTML overlay in the "sharing state" example that changes the colour of the **selected** object (update the item in state with `setItems(list => list.map(...))`).
:::

:::solution
```jsx run
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

export default function App() {
  const [items, setItems] = useState([0, 1, 2].map((i) => ({ id: i, color: ["#34d399", "#818cf8", "#f472b6"][i], x: (i - 1) * 1.6 })));
  const [selected, setSelected] = useState(0);
  const current = items.find((i) => i.id === selected);
  const recolor = (color) => setItems((list) => list.map((i) => (i.id === selected ? { ...i, color } : i)));

  return (
    <>
      <div className="overlay">
        <span>Selected: object {selected ?? "–"}</span>
        {current && <input type="color" value={current.color} onChange={(e) => recolor(e.target.value)} />}
      </div>
      <Canvas camera={{ position: [0, 2, 6] }} onPointerMissed={() => setSelected(null)}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 2]} intensity={2} />
        {items.map((item) => (
          <mesh key={item.id} position={[item.x, 0, 0]} onClick={(e) => { e.stopPropagation(); setSelected(item.id); }}>
            <sphereGeometry args={[0.6, 32, 16]} />
            <meshStandardMaterial color={item.color} emissive={item.id === selected ? "#ffffff" : "#000000"} emissiveIntensity={0.2} />
          </mesh>
        ))}
        <OrbitControls />
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- R3F renders three.js **declaratively** as React components; no overhead, full three.js support.
- JSX rules: camelCase classes, **`args`** for constructors, props set properties, arrays call `.set()`, **dash-case** for nested props, **`attach`** for non-child slots, **`primitive`** for existing objects.
- `<Canvas>` brings renderer, scene, camera, loop, resize and pointer events; it fills its parent.
- Lists, conditions and shared state work like any React UI, and removed objects are **disposed automatically**.
- Avoid changing `args` every frame; use refs and props for animation.
:::
