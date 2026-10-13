---
title: React Three Fiber in Depth
part: React Three Fiber
summary: How R3F works inside (a React reconciler whose host objects are three.js objects), the exact rules that map JSX to three.js (args, props, dash-piercing, attach, primitive, extend), the Canvas store, the frame loop and its priorities, the hooks, the event system, state management without re-renders, performance rules and TypeScript.
---

## A React renderer for three.js

:::def Reconciler
The part of React that compares the previous and next component trees and decides what to create, update or remove. `react-dom` plugs DOM operations into it; `@react-three/fiber` plugs in three.js operations: `createInstance` calls `new THREE.X(...args)`, `appendChild` calls `parent.add(child)` (or attaches), `commitUpdate` sets properties, `removeChild` removes and disposes.
:::

@fig(r3f_reconciler) What R3F does. React components produce a tree of JSX elements; the reconciler turns them into a tree of three.js objects and applies only the changes on each React render. The frame loop (useFrame) runs outside React, every frame.

Two consequences follow, and they explain most R3F advice:

1. **React renders are not frames.** A React render happens only when state or props change; three.js renders 60–120 times a second regardless. Per-frame work belongs in `useFrame`, not in React state.
2. **There is no overhead per frame.** Once the objects exist, rendering is plain three.js. R3F costs time only when the React tree changes (mounting thousands of elements, frequent re-renders).

## How JSX maps to three.js

| JSX | three.js equivalent |
|---|---|
| `<mesh />` | `new THREE.Mesh()` (lower-camel-case name of any class in the catalogue) |
| `<boxGeometry args={[2, 1, 1]} />` | `new THREE.BoxGeometry(2, 1, 1)`, attached to the parent's `geometry` |
| `<meshStandardMaterial color="hotpink" />` | `new THREE.MeshStandardMaterial()`, then `material.color.set("hotpink")`, attached to `material` |
| `position={[1, 2, 3]}` | `object.position.set(1, 2, 3)` (properties with `.set` are set, not replaced) |
| `scale={2}` | `object.scale.setScalar(2)` |
| `rotation-y={Math.PI}` | `object.rotation.y = Math.PI` (dash = nested property, "piercing") |
| `material-roughness={0.2}` | `object.material.roughness = 0.2` |
| `<color attach="background" args={["#000"]} />` | `scene.background = new THREE.Color("#000")` |
| `<bufferAttribute attach="attributes-position" args={[arr, 3]} />` | `geometry.attributes.position = new THREE.BufferAttribute(arr, 3)` |
| `<primitive object={gltf.scene} />` | Insert an **existing** object as is |
| `extend({ OrbitControls })` then `<orbitControls />` | Register a class that is not in the THREE namespace |

:::def attach
Says **where** a child goes in its parent instead of `parent.add(child)`. Geometries and materials attach to `geometry` and `material` automatically. Use a string path (`attach="material-0"`, `attach="shadow-camera"`) for anything else, or a function `attach={(parent, self) => { …; return () => detach }}` for custom logic.
:::

:::warn Changing args re-creates the object
`args` are constructor arguments. When they change, R3F must **destroy and re-create** the object (a new geometry, re-uploaded to the GPU, and a new material means a new shader program). `<sphereGeometry args={[radius, 64, 32]} />` with an animated `radius` rebuilds geometry every render. Animate `scale` instead, or change properties (not constructor args), and memoise `args` arrays that do not change.
:::

```jsx title="R3F — all the mapping rules in one component"
import { extend, useFrame } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
extend({ RoundedBoxGeometry });                    // now <roundedBoxGeometry /> exists

function Card({ hovered }) {
  return (
    <group position={[0, 1, 0]} rotation-y={0.3}>
      <mesh castShadow scale={hovered ? 1.1 : 1}>
        <roundedBoxGeometry args={[1.6, 1, 0.08, 4, 0.06]} />
        <meshPhysicalMaterial color="#e2e8f0" clearcoat={1} roughness={0.25} />
      </mesh>
      <spotLight position={[2, 3, 2]} angle={0.4} penumbra={0.6} castShadow
                 shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
    </group>
  );
}
```

## The Canvas and its store

`<Canvas>` creates the renderer, scene, camera, raycaster and a resize observer, starts the frame loop, and holds everything in a **zustand store** that every component inside can read with hooks.

:::def useThree
Reads the store: `gl`, `scene`, `camera`, `size` (CSS pixels), `viewport` (world units at the camera's target distance, plus `dpr` and `aspect`), `pointer` (NDC), `raycaster`, `clock`, `invalidate`, `advance`, `setDpr`, `setFrameloop`, `get` (non-reactive read). Pass a **selector** to subscribe only to what you need: `useThree((s) => s.viewport)` re-renders on resize, not on every store change.
:::

:::def useFrame
`useFrame((state, delta, xrFrame) => {…}, priority?)` subscribes a callback to the render loop. Callbacks run before rendering, sorted by priority (lower first). If **any** subscriber has a priority greater than 0, R3F assumes you render manually (for example, a post-processing pipeline) and no longer calls `gl.render(scene, camera)` itself. Unsubscription happens automatically when the component unmounts.
:::

:::calc Viewport units
Camera FOV 50°, distance 5 to the origin, canvas 1200 × 800 px. `viewport.height` $= 2\times5\times\tan 25° = 4.66$ world units and `viewport.width` $= 4.66\times1.5 = 6.99$. `viewport.factor` (pixels per world unit) $= 800/4.66 = 171.6$. A plane of `args={[viewport.width, viewport.height]}` at the origin fills the screen exactly.
:::

| Hook | Use |
|---|---|
| `useFrame` | Per-frame animation by mutating refs |
| `useThree` | Renderer, camera, size, viewport, invalidate |
| `useLoader(Loader, url, extensions?)` | Suspending, cached loading; `useLoader.preload`, `useLoader.clear` |
| `useGraph(object)` | Flattened `{ nodes, materials }` of an object tree |
| `createPortal(children, target)` | Render JSX into another scene or object (HUDs, render-to-texture) |
| `useInstanceHandle(ref)` | Low-level access to R3F's instance data |

## The event system

R3F raycasts only against objects that **have event handlers**, once per pointer event (and per frame for hover state). Handlers receive a three.js-flavoured event (`point`, `distance`, `face`, `uv`, `object`, `eventObject`, `intersections`, `ray`, `stopPropagation`) (Chapter 14).

| Behaviour | Rule |
|---|---|
| Ordering | Nearest intersection first, then farther objects (the ray passes through everything) |
| Bubbling | An event bubbles from the hit object up through its parents (`eventObject` changes) |
| `stopPropagation()` | Stops delivery to parents **and** to objects behind |
| `onPointerOver/Out` vs `onPointerEnter/Leave` | Over/Out bubble; Enter/Leave do not |
| Missed clicks | `onPointerMissed` on objects or the Canvas fires when a click hits none of them |
| Capture | `e.target.setPointerCapture(e.pointerId)` keeps events flowing during drags |
| Overlays | `eventSource` lets a DOM element that wraps both the canvas and HTML UI receive events |

## State management without re-renders

| Kind of state | Changes | Where to keep it |
|---|---|---|
| UI state (selected colour, menu open) | Rarely | React state or a store with selectors; re-render is fine |
| Shared app state (cart, level, score) | Occasionally | zustand/jotai store, read with selectors |
| Fast state (positions, velocities, pointer, time) | Every frame | Refs, three.js objects, or a store read **transiently** in `useFrame` |

```jsx title="R3F — transient store reads (no re-render)"
import { create } from "zustand";
const useGame = create((set) => ({ speed: 1, score: 0, setSpeed: (speed) => set({ speed }) }));

function Spinner() {
  const ref = useRef();
  useFrame((_, dt) => {
    const { speed } = useGame.getState();      // read without subscribing: no React render
    ref.current.rotation.y += speed * dt;
  });
  return <mesh ref={ref}><boxGeometry /><meshNormalMaterial /></mesh>;
}

function Score() {
  const score = useGame((s) => s.score);       // subscribe to one slice: re-renders only when score changes
  return <div className="hud">{score}</div>;
}
```

## Performance rules

| Rule | Why |
|---|---|
| Never `setState` in `useFrame` or fast events | Re-renders the component (and children) 60–120 times a second |
| Mutate refs in `useFrame`; multiply by `delta` | No React work; frame-rate independent |
| Do not allocate in `useFrame` | Reuse vectors (`useMemo`/module scope); avoids GC pauses |
| Share geometries and materials | One upload, one program; pass them as props (`geometry={geo}`) |
| Toggle `visible` instead of mounting/unmounting | Mounting re-creates objects and may compile shaders |
| Use instancing for many similar objects | drei `<Instances>`/`<Merged>` or `<instancedMesh>`: one draw call |
| Avoid thousands of JSX elements | Each element is a reconciler instance; mount cost grows |
| `useLoader`/`useGLTF` instead of manual loaders | Caching and Suspense; no duplicate downloads |
| `frameloop="demand"` for static scenes | Render only on change |
| Adaptive quality | `<PerformanceMonitor>`, `<AdaptiveDpr>`, `performance={{ min: 0.5 }}` + `regress()` |
| `startTransition` for heavy updates | Keeps input responsive while React works |

:::calc Why setState in useFrame hurts
A component tree of 40 meshes re-rendered by `setState` each frame at 120 Hz: 4,800 component renders per second, each diffing props and possibly re-creating objects, all on the main thread that also runs three.js. The same animation with a ref mutation costs 120 property assignments per second.
:::

```jsx title="R3F — instancing with drei"
import { Instances, Instance } from "@react-three/drei";

function Forest({ trees }) {                    // 5,000 trees, one draw call
  return (
    <Instances limit={trees.length} castShadow receiveShadow>
      <coneGeometry args={[0.5, 1.6, 8]} />
      <meshStandardMaterial color="#2f6b3a" />
      {trees.map((t, i) => <Instance key={i} position={t.position} scale={t.scale} rotation-y={t.angle} />)}
    </Instances>
  );
}
```

:::tip Instances versus instancedMesh
drei's `<Instance>` components are convenient (each can have events and props) but each is still a React element. For tens of thousands of static instances, write the matrices once into an `<instancedMesh args={[geo, mat, count]}>` in a `useLayoutEffect` (`setMatrixAt`, then `instanceMatrix.needsUpdate = true`) to avoid the React overhead entirely.
:::

## TypeScript and testing

```tsx title="R3F 9 — typing custom elements and props"
import { type ThreeElement, type ThreeElements, extend } from "@react-three/fiber";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

declare module "@react-three/fiber" {
  interface ThreeElements { orbitControls: ThreeElement<typeof OrbitControls> }
}
extend({ OrbitControls });

type MeshProps = ThreeElements["mesh"];           // was MeshProps in v8 (removed in v9)
export function Box(props: MeshProps) { return <mesh {...props}><boxGeometry /><meshStandardMaterial /></mesh>; }
```

`@react-three/test-renderer` renders a tree without a browser canvas so you can assert on the resulting three.js graph and fire events; React 19 exports `act` from `react` itself. Visual regressions are better caught with Playwright screenshots of the real canvas.

:::keypoints
- R3F is a React reconciler whose host objects are three.js objects; React renders on change, three.js renders every frame.
- JSX rules: lower-camel-case classes, `args` = constructor arguments (changing them re-creates the object), `.set()` for vector props, dash-piercing for nested properties, `attach` for non-child slots, `<primitive>` for existing objects, `extend` for custom classes.
- `useFrame` with priority > 0 takes over rendering; `useThree` with selectors; `viewport` gives world units.
- Events raycast only objects with handlers; they bubble and pass through objects unless stopped.
- Fast state lives in refs or transient store reads; React state is for rare changes.
- Instancing, shared resources, visibility toggling, demand frameloop and adaptive DPR are the main performance tools.
- R3F 9 types: `ThreeElements["mesh"]`, `ThreeElement<typeof X>`.
:::

## Interview questions

:::qa How does React Three Fiber work under the hood? {level=mid}
It is a custom React renderer built with `react-reconciler`. Its host config maps JSX element types to three.js constructors (`<mesh>` → `new THREE.Mesh`), applies props as property assignments (with `.set()` for maths objects and dash-piercing for nested properties), adds children with `add()` or `attach`, and removes and disposes objects on unmount. The `<Canvas>` component creates the renderer, scene, camera and a zustand store, runs the render loop (calling `useFrame` subscribers, then `gl.render`), and implements pointer events by raycasting against objects with handlers. After mounting, each frame is plain three.js.
:::

:::qa Why shouldn't you use setState to animate in R3F? What do you do instead? {level=junior}
setState schedules a React render; doing it every frame re-renders the component and its children 60–120 times per second, diffing props and possibly re-creating objects, on the same thread three.js needs. Instead, keep a ref to the three.js object and mutate it in `useFrame`, using `delta` for frame-rate independence. For values shared across components, store them in refs or a zustand store read transiently with `getState()` inside `useFrame`.
:::

:::qa What happens when the `args` of a geometry change? {level=mid}
`args` are constructor arguments, so R3F cannot apply them to the existing object: it disposes the old geometry and constructs a new one, which then has to be uploaded to the GPU (for materials, a new shader program may compile). Doing this every frame or on every slider tick is expensive. Prefer animating properties like `scale`, memoising `args`, or building the geometry once in `useMemo` and updating its attributes.
:::

:::qa How do you render 10,000 interactive objects efficiently in R3F? {level=senior}
Use instancing: one `instancedMesh` (or drei `<Instances>` for moderate counts) with per-instance matrices and colours, so it is one draw call. Avoid one JSX element per object at very high counts; write instance matrices in an effect or `useFrame`. For interaction, R3F events on an instanced mesh report `e.instanceId`, so one handler serves all instances; accelerate raycasting with a BVH if the geometry is complex. Keep per-instance state in typed arrays, not React state.
:::

:::qa When does useFrame's priority matter? {level=mid}
Callbacks run in ascending priority each frame, so a camera rig (priority 0) can update before an effect that reads the camera (priority 1). Any positive priority also tells R3F that you will call render yourself, so R3F stops its own `gl.render`. That is how post-processing pipelines (`EffectComposer`, a WebGPU `RenderPipeline`) and multi-pass renders take over rendering; forgetting it leads to rendering twice or not at all.
:::

:::qa How do you share state between a 3D scene and DOM UI in an R3F app? {level=mid}
Use a store outside React's tree, typically zustand: DOM components and 3D components both import the hook and subscribe to the slices they need with selectors, so updates only re-render consumers. Fast-changing values are read transiently in `useFrame` (`useStore.getState()`) or kept in refs. React context also works, but context does not cross renderer boundaries automatically in older versions and re-renders all consumers on every change, so a store is the common choice.
:::
