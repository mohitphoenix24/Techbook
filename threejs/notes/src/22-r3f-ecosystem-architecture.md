---
title: The R3F Ecosystem and App Architecture
summary: A map of the pmndrs ecosystem (drei, postprocessing, rapier, xr, uikit, leva, zustand, react-spring, maath, gltfjsx) with what each piece is for, then how to structure a real R3F application: folders, scene versus DOM UI, multiple views in one canvas, HUDs and portals, code splitting, Next.js and SSR, accessibility, and a production checklist.
difficulty: Intermediate
prereqs: Chapter 21
time: 45–60 minutes
outcome: Pick the right ecosystem package for a job and structure a production React Three Fiber application.
---

## The ecosystem at a glance

| Package | What it gives you |
|---|---|
| `@react-three/fiber` | The renderer: `<Canvas>`, hooks, events |
| `@react-three/drei` | Hundreds of ready-made helpers (below) |
| `@react-three/postprocessing` | Merged post-processing effects (WebGL) |
| `@react-three/rapier` | Physics with Rapier (Chapter 17) |
| `@react-three/xr` | VR/AR sessions, controllers, hands, teleport, hit testing (Chapter 25) |
| `@react-three/uikit` | Flexbox UI rendered in 3D (panels, buttons, text) for XR and in-scene interfaces |
| `@react-three/a11y` | Accessibility: focus, keyboard and screen-reader support for 3D objects |
| `@react-three/test-renderer` | Unit-testing R3F trees without a browser canvas |
| `zustand` | Tiny global store; transient reads in `useFrame` |
| `leva` | A debug control panel (sliders, colour pickers) bound to state |
| `@react-spring/three`, `maath` | Spring physics animation; maths and easing (`easing.damp3`) |
| `gltfjsx` | Turns a `.glb` into a typed JSX component, optionally optimising it |
| `r3f-perf` | A performance overlay: FPS, draw calls, triangles, GPU time |

## drei, by job

| Job | drei components and hooks |
|---|---|
| Cameras and controls | `OrbitControls`, `CameraControls`, `MapControls`, `PointerLockControls`, `PresentationControls`, `KeyboardControls`, `PerspectiveCamera`, `OrthographicCamera`, `GizmoHelper` |
| Staging and lighting | `Environment`, `Lightformer`, `Stage`, `ContactShadows`, `AccumulativeShadows`, `SoftShadows`, `Sky`, `Stars`, `Sparkles`, `Center`, `Bounds`, `Float` |
| Loading | `useGLTF`, `useTexture`, `useKTX2`, `useVideoTexture`, `useFBX`, `Preload`, `useProgress`, `Loader` |
| Text and HTML | `Text` (SDF text via troika), `Text3D`, `Html` (DOM in 3D, with occlusion), `Billboard` |
| Shapes and lines | `RoundedBox`, `Line`, `QuadraticBezierLine`, `Edges`, `Outlines`, `Grid` |
| Materials | `MeshTransmissionMaterial`, `MeshReflectorMaterial`, `MeshDistortMaterial`, `MeshWobbleMaterial`, `shaderMaterial` |
| Performance | `Instances`/`Instance`, `Merged`, `Detailed` (LOD), `Bvh`, `AdaptiveDpr`, `AdaptiveEvents`, `PerformanceMonitor`, `BakeShadows` |
| Interaction | `DragControls`, `PivotControls`, `TransformControls`, `Select` |
| Layout and composition | `View`, `Hud`, `RenderTexture`, `ScrollControls` + `Scroll` + `useScroll` |
| Utilities | `useHelper`, `Clone`, `useAnimations`, `Stats` |

```jsx title="R3F — a product stage in a dozen lines"
import { Canvas } from "@react-three/fiber";
import { Stage, PresentationControls, ContactShadows, Html, useGLTF } from "@react-three/drei";

function Shoe() {
  const { scene } = useGLTF("/shoe.glb");
  return <primitive object={scene} />;
}

export default function Viewer() {
  return (
    <Canvas dpr={[1, 2]} shadows camera={{ fov: 40, position: [0, 0, 4] }} frameloop="demand">
      <PresentationControls global polar={[-0.2, 0.3]} azimuth={[-1, 1]} snap>
        <Stage environment="city" intensity={0.6} adjustCamera={1.2}>
          <Shoe />
        </Stage>
      </PresentationControls>
      <ContactShadows position-y={-0.8} opacity={0.5} blur={2.5} />
      <Html position={[0.6, 0.4, 0]} occlude className="hotspot">Breathable mesh</Html>
    </Canvas>
  );
}
```

## Structuring a real application

:::flow A typical R3F project layout
`app/` or `src/pages/`: routes and DOM UI (React as usual)
`src/scene/`: the 3D world: `Experience.tsx` (lights, environment, camera rig), feature components (`Car.tsx`, `Showroom.tsx`)
`src/models/`: gltfjsx-generated components, one per asset, with `useGLTF.preload`
`src/materials/` and `src/shaders/`: shared materials, `shaderMaterial`s, TSL node functions
`src/state/`: zustand stores (UI state, configuration, game state)
`src/hooks/`: reusable behaviour (`useFollowCamera`, `useKeyboardMove`)
`public/`: optimised `.glb`, `.ktx2`, `.hdr` assets (built by a gltf-transform script)
:::

:::tip Keep the DOM and the scene separate but connected
Render menus, forms and text in normal HTML outside (or over) the canvas, and put only 3D in the scene. Connect them through a store: a DOM colour picker writes `useConfig.setState({ color })`; the 3D component subscribes with a selector and updates its material. DOM UI stays accessible, indexable and easy to style; the 3D scene stays fast.
:::

### Many views, one canvas

Browsers limit live WebGL contexts (often 16 per page), and each `<Canvas>` creates one. A page with a grid of product thumbnails or several viewports should use **one** canvas with drei's `<View>`: each view tracks a DOM element and renders its own scene into that rectangle with the scissor test (Chapter 7).

```jsx title="R3F — several 3D views in one WebGL context"
import { View, OrbitControls, Environment } from "@react-three/drei";

export default function Gallery({ products }) {
  const container = useRef();
  return (
    <div ref={container} className="grid">
      {products.map((p) => (
        <View key={p.id} className="tile">          {/* a normal DOM element in the grid */}
          <Environment preset="studio" />
          <ProductModel url={p.url} />
          <OrbitControls makeDefault />
        </View>
      ))}
      <Canvas eventSource={container} className="canvas-overlay">  {/* one fixed canvas behind/over the page */}
        <View.Port />
      </Canvas>
    </div>
  );
}
```

### HUDs, portals and render-to-texture

- **`<Hud>`** renders a second scene on top of the main one with its own camera (minimaps, gizmos, crosshairs) in the same frame.
- **`createPortal(children, scene)`** renders JSX into another scene or object, for example a scene that is only rendered into a texture.
- **`<RenderTexture>`** renders a scene into a texture you can attach as a material map: a TV screen showing another 3D world, a screen inside a laptop model.

### Code splitting and loading

Split heavy 3D experiences from the rest of the page: `const Experience = lazy(() => import("./scene/Experience"))` inside `<Suspense>`. Preload the assets of the next likely view (`useGLTF.preload`), show a lightweight placeholder (a poster image or a low-poly proxy), and use `<Preload all />` to upload textures to the GPU before the first frame so the camera move does not stutter.

### Next.js and server rendering

WebGL needs a browser, so the canvas must render only on the client: mark scene files with `"use client"` in the App Router, or load the canvas with `dynamic(() => import("./Scene"), { ssr: false })`. Everything around it (text, SEO content, layout) still benefits from server rendering. Do not import `three` addons that touch `window` at module level in server components.

### Accessibility

3D content is invisible to screen readers and keyboard users by default. Provide the important information and actions in DOM (text descriptions, buttons for configurator options), make the canvas focusable with a label, offer a reduced-motion mode (`prefers-reduced-motion`: disable auto-rotation and parallax), keep contrast high for overlaid text, and use `@react-three/a11y` for focusable, announced 3D objects where interaction lives inside the scene.

## Production checklist

| Area | Check |
|---|---|
| Assets | glTF optimised (Meshopt/Draco, KTX2, resized textures); total download budget per page; preloading |
| Rendering | DPR capped (`dpr={[1, 2]}`); shadows only where needed; environment map for PBR; tone mapping chosen deliberately |
| Performance | Draw calls and triangles measured (`r3f-perf`, `renderer.info`); instancing; `frameloop="demand"` when static; `PerformanceMonitor` + `AdaptiveDpr` |
| Memory | Disposal of unmounted primitives and cached assets; no growth when navigating back and forth |
| Robustness | WebGL context-loss handling; fallback image when WebGL/WebGPU is unavailable; error boundaries around the canvas |
| Mobile | Tested on a mid-range Android and an iPhone; touch controls; low-power GPU paths |
| Accessibility | DOM alternatives, keyboard paths, reduced motion |
| SEO and sharing | Server-rendered text around the canvas; poster images for social cards |
| Monitoring | Real-user FPS and load-time metrics; error reporting from the canvas |

:::lens Structuring a 3D product
Junior: One large component with the canvas, the models and the UI together.
Mid-level: Feature folders, gltfjsx components, a store connecting DOM UI and scene, lazy-loaded 3D bundle.
Senior: An architecture that survives growth: a scene layer with clear interfaces, an asset pipeline owned by the build, one canvas with `View`s for many viewports, accessibility and fallbacks as release criteria, performance and memory monitoring from real users, and a three.js upgrade policy (step through releases, screenshot tests).
:::

:::keypoints
- drei covers controls, staging, loading, text, materials, performance and composition; check it before writing a helper.
- Organise by feature: scene components, generated model components, shared materials/shaders, stores, hooks, optimised assets.
- DOM UI outside the canvas, connected through a store; 3D for 3D.
- One canvas with `<View>` instead of many canvases; `<Hud>`, portals and `<RenderTexture>` for layered and nested scenes.
- Lazy-load the 3D experience, preload next assets, client-only rendering in Next.js.
- Treat accessibility, mobile testing, context loss and memory as release criteria.
:::

## Interview questions

:::qa A page shows 30 product thumbnails, each a small 3D viewer, and crashes on some devices. Why, and what would you do? {level=mid}
Each `<Canvas>` creates its own WebGL context, and browsers cap live contexts (commonly 16); older contexts are lost and memory is duplicated (every viewer loads its own copies of textures and shaders). Use a single canvas with drei's `<View>` components, which render each tile's scene into its DOM rectangle with scissoring, sharing one context and the asset cache. Render only visible views, use `frameloop="demand"`, and consider static poster images until a tile is hovered.
:::

:::qa How would you structure a 3D product configurator in React? {level=mid}
Configuration state (colour, material, options, price) lives in a zustand store; DOM components render the option pickers and summary and write to the store; the 3D component (generated with gltfjsx) subscribes to the relevant slices and swaps pre-created materials or toggles node visibility. Assets are optimised and preloaded; materials for all options are created once to avoid shader compiles on click; the canvas uses `frameloop="demand"` and Neutral tone mapping for accurate colours. Snapshots for sharing come from `gl.domElement.toBlob` after rendering, and the configuration is serialised into the URL.
:::

:::qa How do you use React Three Fiber with Next.js? {level=junior}
The canvas must run only in the browser, so make the scene a client component (`"use client"`) or load it with `next/dynamic` and `ssr: false`. Keep page text and metadata server-rendered for SEO, lazy-load the 3D bundle so it does not block first paint, put optimised models in `public/`, and wrap the canvas in `<Suspense>` with a fallback. Avoid importing browser-only three.js addons into server components.
:::

:::qa What is drei's `<Html>` component and what are its costs? {level=mid}
It renders real DOM elements positioned at a 3D point by projecting the point to screen space each frame (like `CSS2DRenderer`), optionally scaling with distance (`transform`) and hiding when occluded (`occlude`, which raycasts or uses depth). It is ideal for labels, tooltips and forms because the content stays accessible and crisp. Costs: per-frame projection and DOM style updates for every instance, layout work in the browser, and occlusion raycasts; hundreds of them hurt performance, where SDF `<Text>` or sprites are cheaper.
:::
