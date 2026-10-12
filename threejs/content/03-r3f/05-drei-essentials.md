---
title: drei — The Helper Library Everyone Uses
level: intermediate
time: 40
summary: A guided tour of @react-three/drei by category — controls, staging (environment, shadows, sky), text and HTML, materials, gizmos and helpers, loaders and performance — with four complete scenes that use the components real products rely on.
---

**drei** ("three" in German) is a collection of 150+ ready-made components and hooks for React Three Fiber. Almost every R3F project uses it, because it turns tasks that take dozens of lines of three.js (an HDR environment, soft contact shadows, crisp text, HTML that tracks a 3D point, an orbit camera that can frame an object) into one element.

:::def @react-three/drei
The official helper library for R3F, maintained by pmndrs. Components are tree-shakable (you only ship what you import) and documented with live examples at drei.docs.pmnd.rs.
:::

## The map

| Category | Components you'll actually use |
|---|---|
| **Controls** | `OrbitControls`, `CameraControls`, `PresentationControls`, `MapControls`, `KeyboardControls`, `PointerLockControls`, `ScrollControls`, `FlyControls` |
| **Staging** | `Environment`, `Lightformer`, `ContactShadows`, `AccumulativeShadows`, `SoftShadows`, `Stage`, `Center`, `Bounds`, `Float`, `Sky`, `Stars`, `Sparkles`, `Cloud`, `Backdrop`, `SpotLight` (volumetric) |
| **Text & HTML** | `Text`, `Text3D`, `Html`, `Billboard` |
| **Materials** | `MeshTransmissionMaterial`, `MeshReflectorMaterial`, `MeshDistortMaterial`, `MeshWobbleMaterial`, `shaderMaterial` |
| **Shapes** | `RoundedBox`, `Line`, `QuadraticBezierLine`, `CatmullRomLine`, `Edges`, `Outlines`, `Decal` |
| **Gizmos & helpers** | `Grid`, `GizmoHelper` + `GizmoViewport`, `PivotControls`, `TransformControls`, `DragControls`, `Helper`, `Stats` |
| **Loaders** | `useGLTF`, `useTexture`, `useKTX2`, `useFBX`, `useVideoTexture`, `useProgress`, `Preload` |
| **Performance** | `Instances` / `Instance`, `Merged`, `Detailed` (LOD), `Bvh`, `AdaptiveDpr`, `AdaptiveEvents`, `PerformanceMonitor`, `BakeShadows` |
| **Portals & views** | `View`, `Hud`, `RenderTexture`, `MeshPortalMaterial`, `Mask` |

## Scene 1: a product stage

The "hero product" setup used on countless product pages: studio lighting from an HDR preset, soft contact shadow, gentle floating, and a turntable-style control that springs back when released.

```jsx run title="Product stage: Environment, ContactShadows, Float, PresentationControls" level=intermediate height=440
import { Canvas } from "@react-three/fiber";
import { Environment, ContactShadows, Float, PresentationControls, RoundedBox, Text } from "@react-three/drei";

function Product() {
  return (
    <group>
      {/* a stylised smart speaker */}
      <mesh position-y={0.55} castShadow>
        <cylinderGeometry args={[0.55, 0.6, 1.1, 64]} />
        <meshStandardMaterial color="#1f2937" roughness={0.85} />
      </mesh>
      <mesh position-y={1.12}>
        <cylinderGeometry args={[0.55, 0.55, 0.04, 64]} />
        <meshStandardMaterial color="#d1d5db" metalness={1} roughness={0.15} />
      </mesh>
      <mesh position-y={1.15}>
        <torusGeometry args={[0.32, 0.015, 16, 64]} />
        <meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 1.3, 6], fov: 35 }}>
      <color attach="background" args={["#f1f5f9"]} />
      <PresentationControls
        global                                   // drag anywhere on the canvas
        snap                                     // spring back on release
        rotation={[0.1, 0.4, 0]}
        polar={[-0.2, 0.3]}                      // vertical limits (radians)
        azimuth={[-1, 1]}                        // horizontal limits
      >
        <Float speed={2} rotationIntensity={0.2} floatIntensity={0.4}>
          <Product />
        </Float>
      </PresentationControls>
      <ContactShadows position-y={-0.49} opacity={0.55} scale={6} blur={2.4} far={2} />
      <Environment preset="studio" />            {/* HDR studio lighting, no lights needed */}
      <Text position={[0, 1.75, -0.6]} fontSize={0.24} color="#0f172a" anchorX="center">Aurora Mini</Text>
      <RoundedBox args={[1.8, 0.2, 1.8]} radius={0.08} position-y={-0.6}>   {/* a pedestal with soft edges */}
        <meshStandardMaterial color="#e2e8f0" />
      </RoundedBox>
    </Canvas>
  );
}
```

| Component | What it replaces |
|---|---|
| `<Environment preset="studio" />` | loading an HDR, PMREM, `scene.environment` (presets: apartment, city, dawn, forest, lobby, night, park, studio, sunset, warehouse; or `files="..."`) |
| `<ContactShadows />` | a top-down depth render, blurred, on a plane: soft grounding with no shadow maps |
| `<Float />` | a sine-wave bob and wobble in `useFrame` |
| `<PresentationControls />` | a rotate-the-object (not the camera) drag control with limits and spring-back |
| `<Text />` | troika SDF text: crisp at any distance, cheap |

## Scene 2: annotations with Html

`<Html>` renders real DOM at a 3D position: the right tool for hotspots, price tags, tooltips and machine dashboards. `occlude` hides it when it's behind other geometry, and `distanceFactor` scales it with distance as if it were in the world:

```jsx run title="Hotspots that track parts and hide behind geometry" level=intermediate
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, Environment } from "@react-three/drei";

const HOTSPOTS = [
  { id: 1, position: [0.75, 0.6, 0.62], title: "Servo motor", text: "Joint 2 · 3.1 Nm · 41 °C" },   // just outside the surface
  { id: 2, position: [-0.6, 1.25, 0], title: "Camera module", text: "Depth + RGB, 30 fps" },
  { id: 3, position: [0, 0.1, -0.8], title: "Cable gland", text: "IP67 rated" },
];

function Hotspot({ position, title, text, open, onToggle }) {
  return (
    <Html position={position} center distanceFactor={3} occlude>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <button onClick={onToggle} style={{ width: 28, height: 28, borderRadius: 99, padding: 0 }} className={open ? "primary" : ""}>{open ? "×" : "+"}</button>
        {open && <div className="label3d" style={{ whiteSpace: "normal", width: 150 }}><b>{title}</b><br />{text}</div>}
      </div>
    </Html>
  );
}

export default function App() {
  const [open, setOpen] = useState(1);
  return (
    <Canvas camera={{ position: [2.6, 1.6, 2.8], fov: 45 }}>
      <color attach="background" args={["#e2e8f0"]} />
      <mesh position-y={0.4}><boxGeometry args={[1.4, 0.8, 1.4]} /><meshStandardMaterial color="#64748b" /></mesh>
      <mesh position={[-0.6, 1.05, 0]}><boxGeometry args={[0.3, 0.3, 0.3]} /><meshStandardMaterial color="#0f172a" /></mesh>
      <mesh position={[0.75, 0.6, 0.35]}><cylinderGeometry args={[0.2, 0.2, 0.4, 32]} /><meshStandardMaterial color="#f59e0b" /></mesh>
      {HOTSPOTS.map((h) => <Hotspot key={h.id} {...h} open={open === h.id} onToggle={() => setOpen(open === h.id ? null : h.id)} />)}
      <Environment preset="city" />
      <OrbitControls target={[0, 0.5, 0]} />
    </Canvas>
  );
}
```

Orbit around: hotspots behind the box disappear (`occlude`), and they scale as you zoom (`distanceFactor`). Because they're real HTML, they can hold buttons, charts and forms, and screen readers can read them.

## Scene 3: an atmospheric environment

```jsx run title="Sky, Stars, Sparkles, Grid and a reflective floor" level=intermediate
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Sky, Stars, Sparkles, Grid, MeshReflectorMaterial, OrbitControls, Float } from "@react-three/drei";

export default function App() {
  const [night, setNight] = useState(true);
  return (
    <>
      <button className="overlay" onClick={() => setNight(!night)}>{night ? "Switch to day" : "Switch to night"}</button>
      <Canvas camera={{ position: [0, 1.6, 7], fov: 50 }}>
        {night ? (
          <>
            <color attach="background" args={["#030014"]} />
            <Stars radius={60} depth={40} count={4000} factor={4} fade speed={0.6} />
            <Sparkles count={80} scale={[8, 3, 8]} position-y={1.5} size={3} speed={0.4} color="#a5b4fc" />
          </>
        ) : (
          <Sky sunPosition={[50, 20, -100]} turbidity={6} rayleigh={1.5} />
        )}
        <ambientLight intensity={night ? 0.2 : 1} />
        <pointLight position={[0, 2.5, 0]} intensity={night ? 25 : 5} color="#c084fc" />
        <Float speed={1.5} floatIntensity={1}>
          <mesh position-y={1.4}>
            <icosahedronGeometry args={[0.7, 0]} />
            <meshStandardMaterial color="#e879f9" emissive="#a21caf" emissiveIntensity={night ? 1.2 : 0.1} flatShading />
          </mesh>
        </Float>
        {/* a blurry mirror floor: renders the scene reflected, like wet asphalt */}
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[40, 40]} />
          <MeshReflectorMaterial resolution={512} blur={[300, 100]} mixBlur={1} mixStrength={night ? 6 : 2} roughness={0.9} color={night ? "#0b0b14" : "#94a3b8"} metalness={0.4} mirror={0} />
        </mesh>
        <Grid position-y={0.01} args={[20, 20]} cellColor="#6366f1" sectionColor="#a855f7" fadeDistance={25} infiniteGrid />
        <OrbitControls maxPolarAngle={1.45} target={[0, 1, 0]} />
      </Canvas>
    </>
  );
}
```

## Scene 4: editor tools

Editors, room planners and robot-cell layout tools need gizmos, a navigation cube, an infinite grid and "frame the selection". drei has all of them:

```jsx run title="PivotControls, GizmoHelper, Grid and Bounds (zoom to fit)" level=intermediate height=440
import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { PivotControls, GizmoHelper, GizmoViewport, Grid, Bounds, useBounds, OrbitControls, Edges } from "@react-three/drei";

function Part({ position, color, size }) {
  const bounds = useBounds();
  return (
    <mesh position={position} onClick={(e) => { e.stopPropagation(); bounds.refresh(e.object).fit(); }}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
      <Edges color="#0f172a" />                 {/* CAD-style outline of sharp edges */}
    </mesh>
  );
}

export default function App() {
  const fitAll = useRef(null);                  // filled in by a component inside <Bounds>
  return (
    <>
      <div className="overlay"><span>Click a part to zoom to it</span><button onClick={() => fitAll.current?.()}>Fit all</button><span className="muted">Drag the arrows/rings on the orange part</span></div>
      <Canvas camera={{ position: [6, 5, 8], fov: 40 }}>
        <color attach="background" args={["#f8fafc"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 8, 3]} intensity={2} />
        <Bounds fit clip observe margin={1.3}>
          <FitAll apiRef={fitAll} />
          <PivotControls anchor={[0, -1, 0]} depthTest={false} scale={1.2} lineWidth={3}>
            <Part position={[0, 0.5, 0]} color="#f97316" size={[1.2, 1, 1.2]} />
          </PivotControls>
          <Part position={[2.5, 0.75, -1]} color="#3b82f6" size={[1, 1.5, 1]} />
          <Part position={[-2.2, 0.3, 1.5]} color="#22c55e" size={[1.6, 0.6, 0.8]} />
        </Bounds>
        <Grid infiniteGrid cellSize={0.5} sectionSize={2.5} fadeDistance={30} cellColor="#cbd5e1" sectionColor="#94a3b8" />
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
          <GizmoViewport axisColors={["#ef4444", "#22c55e", "#3b82f6"]} labelColor="white" />
        </GizmoHelper>
        <OrbitControls makeDefault />            {/* makeDefault: other helpers can find and use these controls */}
      </Canvas>
    </>
  );
}

// bridge: lets HTML outside the Canvas call into R3F/drei APIs that only exist inside it
function FitAll({ apiRef }) {
  const bounds = useBounds();
  apiRef.current = () => bounds.refresh().fit();
  return null;
}
```

Everything inside `<Bounds>` counts towards "fit all", so keep helper objects (big invisible planes, sky domes) outside it. The `FitAll` component shows a pattern you'll reuse often: HTML outside the Canvas can't call hooks that live inside it, so a tiny component inside hands a function out through a ref. `makeDefault` registers the OrbitControls in R3F's state so that helpers like `<Bounds>` and `<GizmoHelper>` can move the camera *through* them instead of fighting them.

## More drei you'll meet in this course

| Component | Where |
|---|---|
| `useGLTF`, `useAnimations`, `Clone`, `useProgress` | next lesson (models) |
| `Instances`, `Merged`, `Detailed`, `PerformanceMonitor`, `AdaptiveDpr`, `Bvh` | R3F performance |
| `shaderMaterial`, `MeshTransmissionMaterial` | custom objects and shaders |
| `ScrollControls`, `useScroll` | scroll-driven sites (Module 4) |
| `KeyboardControls`, `CameraControls`, `PointerLockControls` | game controls (Module 4) |
| `View`, `Hud`, `RenderTexture` | multiple views and UI (Module 4) |

:::warn Don't import what you don't use
drei is big, but tree-shaking keeps your bundle to what you import. Avoid `import * as drei` patterns and wrapper files that re-export everything. Some components also fetch assets at runtime (environment presets download HDRs from a CDN, `<Text>` downloads a font if you don't pass `font=`). For production and offline apps, pass your own files: `<Environment files="/hdr/studio.hdr" />`, `<Text font="/fonts/Inter.woff">`.
:::

## Check yourself

```quiz
? Which drei component gives realistic studio lighting with no lights in the scene?
+ <Environment preset="studio" />
- <Stage />
- <Sky />
> It loads an HDR and sets scene.environment.

? You need soft shadows under a floating product without shadow maps. Which component?
+ ContactShadows
- SoftShadows
- BakeShadows
> It renders a blurred top-down silhouette on a plane.

? What do `occlude` and `distanceFactor` do on <Html>?
+ Hide the HTML when geometry is in front; scale it with distance like a 3D object
- Blur and fade the HTML
- Disable pointer events
> Both make DOM annotations feel part of the scene.

? Why add `makeDefault` to OrbitControls?
+ So other helpers (Bounds, GizmoHelper…) can find and drive the same controls
- To make it the only control allowed
- To enable damping
> Helpers look up state.controls.

? `<Text>` renders crisply at any size because it uses…
+ SDF (signed distance field) fonts via troika
- TextGeometry
- CSS
> SDF text is cheap and sharp in 3D and VR.
```

:::exercise Configurator stage
Combine Scene 1 and Scene 2: put the speaker on the product stage and add two `<Html>` hotspots ("Speaker grille", "Light ring") that open a small card on click. Add three colour buttons in an HTML overlay that change the speaker body colour.
:::

:::solution
```jsx run
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, ContactShadows, PresentationControls, Html } from "@react-three/drei";

function Spot({ position, title, text }) {
  const [open, setOpen] = useState(false);
  return (
    <Html position={position} center distanceFactor={5}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <button style={{ width: 26, height: 26, padding: 0, borderRadius: 99 }} onClick={() => setOpen(!open)}>{open ? "×" : "+"}</button>
        {open && <div className="label3d"><b>{title}</b> · {text}</div>}
      </div>
    </Html>
  );
}

export default function App() {
  const [color, setColor] = useState("#1f2937");
  return (
    <>
      <div className="overlay row">{["#1f2937", "#be123c", "#0e7490"].map((c) => <button key={c} onClick={() => setColor(c)} style={{ background: c, width: 28, height: 28 }} />)}</div>
      <Canvas camera={{ position: [0, 1.2, 5.5], fov: 35 }}>
        <color attach="background" args={["#f1f5f9"]} />
        <PresentationControls global snap polar={[-0.2, 0.3]} azimuth={[-1, 1]}>
          <mesh position-y={0.55}><cylinderGeometry args={[0.55, 0.6, 1.1, 64]} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>
          <mesh position-y={1.15}><torusGeometry args={[0.32, 0.015, 16, 64]} /><meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={2} toneMapped={false} /></mesh>
          <Spot position={[0.6, 0.55, 0]} title="Speaker grille" text="360° sound" />
          <Spot position={[0, 1.25, 0]} title="Light ring" text="Shows assistant status" />
        </PresentationControls>
        <ContactShadows position-y={-0.05} opacity={0.5} scale={6} blur={2.4} />
        <Environment preset="studio" />
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- drei turns common three.js tasks into single components: **controls, staging, text/HTML, materials, gizmos, loaders, performance**.
- Product pages: `Environment` + `ContactShadows` + `PresentationControls` + `Float`.
- Annotations: `<Html occlude distanceFactor>`; in-scene text: `<Text>` (SDF).
- Editors: `PivotControls`, `GizmoHelper`, `Grid`, `Bounds` (+ `makeDefault` on your controls).
- Ship your own HDRs and fonts in production; import only what you use.
:::
