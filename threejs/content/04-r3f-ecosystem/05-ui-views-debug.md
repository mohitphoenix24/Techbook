---
title: Debug GUIs, Multiple Views, HUDs & 3D UI
level: intermediate
time: 35
summary: Tweaking scenes live with leva panels, rendering several 3D views inside a normal page layout with drei's View, heads-up displays with Hud, and real flexbox user interfaces inside the 3D scene with @react-three/uikit — the foundation for VR interfaces.
---

Four tools for four UI problems that every 3D product eventually hits: **tuning** values while developing (leva), showing **several 3D views** in one page (View), drawing a **HUD** on top of the scene (Hud), and building **interfaces inside 3D** (uikit), which is essential in VR, where there is no HTML page to put buttons on.

## leva: a GUI panel in one hook

**leva** (pmndrs) creates a polished control panel from a description of your values. Every number, colour, boolean or option becomes a slider, picker, checkbox or dropdown, and the hook returns live values:

```jsx run title="Tune a scene live with leva" level=easy
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { useControls, folder } from "leva";

function Product() {
  const { color, metalness, roughness, shape, wireframe } = useControls({
    Material: folder({
      color: "#f59e0b",
      metalness: { value: 0.6, min: 0, max: 1, step: 0.01 },
      roughness: { value: 0.25, min: 0, max: 1, step: 0.01 },
      wireframe: false,
    }),
    shape: { options: ["torusKnot", "sphere", "box"] },
  });
  return (
    <mesh position-y={1}>
      {shape === "torusKnot" && <torusKnotGeometry args={[0.6, 0.2, 200, 32]} />}
      {shape === "sphere" && <sphereGeometry args={[0.8, 64, 32]} />}
      {shape === "box" && <boxGeometry args={[1.2, 1.2, 1.2]} />}
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} wireframe={wireframe} />
    </mesh>
  );
}

function Stage() {
  const { preset, shadowOpacity } = useControls("Stage", {
    preset: { value: "city", options: ["city", "studio", "sunset", "warehouse", "forest", "apartment"] },
    shadowOpacity: { value: 0.5, min: 0, max: 1 },
  });
  return (
    <>
      <Environment preset={preset} />
      <ContactShadows opacity={shadowOpacity} blur={2.4} scale={6} />
    </>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [2.5, 2, 4], fov: 45 }}>
      <color attach="background" args={["#e2e8f0"]} />
      <Product />
      <Stage />
      <OrbitControls target={[0, 1, 0]} />
    </Canvas>
  );
}
```

leva is for **developers and designers** tuning lighting, materials and animation timings; when the values feel right, copy them into code. You can also hide it in production (`<Leva hidden />`) and reveal it with a URL flag for QA. three.js's own equivalent is **lil-gui**.

## Several views, one canvas: View

Browsers limit the number of WebGL contexts (roughly 16), and every `<Canvas>` creates one. A page with a 3D thumbnail per product card would run out quickly. drei's `<View>` solves this: **one** canvas covers the page, and each `<View>` tracks the position of an ordinary DOM element and renders its own scene into exactly that rectangle with the scissor technique from Module 2.

```jsx run title="Product cards: many 3D views, one WebGL context" level=advanced height=460
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { View, PerspectiveCamera, OrbitControls, Environment } from "@react-three/drei";

function Spin({ children }) {
  const ref = useRef();
  useFrame((_, dt) => (ref.current.rotation.y += dt * 0.6));
  return <group ref={ref}>{children}</group>;
}

const PRODUCTS = [
  { name: "Orb", price: 49, color: "#6366f1", geo: <sphereGeometry args={[0.8, 48, 24]} /> },
  { name: "Knot", price: 79, color: "#f59e0b", geo: <torusKnotGeometry args={[0.55, 0.18, 160, 24]} /> },
  { name: "Cube", price: 39, color: "#10b981", geo: <boxGeometry args={[1.1, 1.1, 1.1]} /> },
  { name: "Cone", price: 29, color: "#ef4444", geo: <coneGeometry args={[0.7, 1.4, 48]} /> },
];

export default function App() {
  const container = useRef();
  return (
    <div ref={container} style={{ position: "relative", height: "100%", overflow: "auto", padding: 12, boxSizing: "border-box" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
        {PRODUCTS.map((p) => (
          // the shared canvas sits BEHIND the page, so the card must be see-through where the View draws
          <div key={p.name} className="overlay" style={{ position: "static", maxWidth: "none", background: "transparent", backdropFilter: "none" }}>
            {/* this View renders into its parent div's rectangle */}
            <View style={{ height: 150, borderRadius: 10 }}>
              <color attach="background" args={["#f1f5f9"]} />
              <PerspectiveCamera makeDefault position={[0, 0.4, 3.2]} fov={40} />
              <Environment preset="city" />
              <Spin><mesh>{p.geo}<meshStandardMaterial color={p.color} metalness={0.3} roughness={0.3} /></mesh></Spin>
              <OrbitControls enableZoom={false} />
            </View>
            <b>{p.name}</b><span className="muted">${p.price}</span>
          </div>
        ))}
      </div>
      {/* ONE canvas behind everything; eventSource lets the views receive pointer events */}
      <Canvas eventSource={container} style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <View.Port />
      </Canvas>
    </div>
  );
}
```

Each card is plain HTML in a CSS grid; resize the preview and the grid reflows while the 3D views follow their boxes. Drag a product to orbit it: all four views share one WebGL context, one renderer and one render loop. Uses: product listing pages, comparison tables, dashboards with several 3D widgets, documentation with many small 3D figures.

## Heads-up displays: Hud

A HUD is drawn **on top** of the scene with its own camera: a compass, a minimap, a score, a "you are here" axis indicator. drei's `<Hud>` renders its children in a separate pass after the main scene:

```jsx run title="A compass HUD over a flyable scene" level=intermediate
import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Hud, OrthographicCamera, OrbitControls, Text } from "@react-three/drei";

function Compass() {
  const needle = useRef();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    // the camera's heading on the ground plane → rotate the compass the opposite way
    needle.current.rotation.z = Math.atan2(camera.position.x, camera.position.z);
  });
  return (
    <Hud renderPriority={1}>
      <OrthographicCamera makeDefault position={[0, 0, 10]} />
      <group position={[size.width / 2 - 70, size.height / 2 - 70, 0]} ref={needle}>
        <mesh><circleGeometry args={[48, 48]} /><meshBasicMaterial color="#0f172a" transparent opacity={0.75} /></mesh>
        <mesh position-y={22}><coneGeometry args={[9, 34, 3]} /><meshBasicMaterial color="#ef4444" /></mesh>
        <mesh position-y={-22} rotation-z={Math.PI}><coneGeometry args={[9, 34, 3]} /><meshBasicMaterial color="#e2e8f0" /></mesh>
        <Text position={[0, 38, 1]} fontSize={14} color="white">N</Text>
      </group>
    </Hud>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [6, 5, 8] }}>
      <color attach="background" args={["#bae6fd"]} />
      <hemisphereLight args={["#fff", "#64748b", 1.5]} />
      {Array.from({ length: 20 }, (_, i) => (
        <mesh key={i} position={[Math.sin(i) * 6, 0.5, Math.cos(i * 1.7) * 6]}><boxGeometry args={[1, 1 + (i % 3), 1]} /><meshStandardMaterial color={`hsl(${i * 18}, 60%, 55%)`} /></mesh>
      ))}
      <mesh position={[0, 0.2, -8]}><coneGeometry args={[0.6, 2, 4]} /><meshStandardMaterial color="#ef4444" /></mesh>  {/* "north" marker */}
      <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[30, 30]} /><meshStandardMaterial color="#94a3b8" /></mesh>
      <OrbitControls />
      <Compass />
    </Canvas>
  );
}
```

## Real UI inside 3D: @react-three/uikit

HTML overlays don't exist inside a VR headset: an immersive WebXR session shows only what you render into the scene. **@react-three/uikit** (pmndrs) brings a **flexbox layout engine** (Yoga, the same one React Native uses) into three.js, with `Container`, `Text`, `Image`, `Input` components and props that mirror CSS: `flexDirection`, `padding`, `gap`, `borderRadius`, `backgroundColor`, `hover` styles. The result is crisp, styled, interactive UI that works with mouse, touch and VR controllers alike:

```jsx run title="A flexbox panel inside the 3D scene" level=advanced
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Container, Text } from "@react-three/uikit";

const COLORS = ["#10b981", "#f59e0b", "#6366f1", "#ef4444"];

function Panel({ color, setColor, size, setSize }) {
  return (
    <group position={[1.2, 1.1, 0]} rotation-y={-0.3}>
      {/* the outermost uikit component becomes the panel's root; colours can carry alpha like CSS */}
      <Container backgroundColor="rgba(15, 23, 42, 0.88)" borderRadius={24} padding={24} gap={16} flexDirection="column" width={420}>
        <Text fontSize={28} fontWeight="bold" color="white">Configure</Text>
        <Text fontSize={16} color="#94a3b8">Pick a finish and size. This panel is real 3D geometry.</Text>
        <Container flexDirection="row" gap={12}>
          {COLORS.map((c) => (
            <Container key={c} width={56} height={56} borderRadius={28} backgroundColor={c}
              borderWidth={c === color ? 4 : 0} borderColor="white"
              hover={{ opacity: 0.7 }} cursor="pointer" onClick={() => setColor(c)} />
          ))}
        </Container>
        <Container flexDirection="row" gap={12}>
          {["S", "M", "L"].map((s) => (
            <Container key={s} flexGrow={1} height={48} borderRadius={12} alignItems="center" justifyContent="center"
              backgroundColor={s === size ? "#f8fafc" : "#1e293b"} hover={{ backgroundColor: s === size ? "#f8fafc" : "#334155" }}
              cursor="pointer" onClick={() => setSize(s)}>
              <Text fontSize={20} color={s === size ? "#0f172a" : "white"}>{s}</Text>
            </Container>
          ))}
        </Container>
      </Container>
    </group>
  );
}

export default function App() {
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState("M");
  const scale = { S: 0.7, M: 1, L: 1.3 }[size];
  return (
    <Canvas camera={{ position: [0.2, 1.2, 5.2], fov: 45 }}>
      <color attach="background" args={["#e2e8f0"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 3]} intensity={2} />
      <mesh position={[-1.7, 1, 0]} scale={scale}><torusKnotGeometry args={[0.5, 0.17, 160, 24]} /><meshStandardMaterial color={color} roughness={0.3} /></mesh>
      <Panel color={color} setColor={setColor} size={size} setSize={setSize} />
      <OrbitControls target={[0, 1, 0]} />
    </Canvas>
  );
}
```

:::warn uikit and minifiers
uikit registers its components by **class name**. Production minifiers that mangle names make different components collide, which shows up as *"the text component can not have any children"* only in production builds. Keep the names: in Vite, `build: { minify: "terser", terserOptions: { keep_classnames: true, keep_fnames: true } }` (or limit it to uikit's names). This site loads uikit with esm.sh's `keep-names` option for the same reason.
:::

Orbit around: the panel is part of the scene, so it can be placed on a wall, attached to a controller in VR, or float beside a machine in a digital twin. uikit also ships ready-made component kits (buttons, sliders, cards, dialogs styled like shadcn or Apple's visionOS) and a converter from HTML/Figma designs.

| Need | Tool |
|---|---|
| tune values during development | **leva** (or lil-gui) |
| several 3D views in a normal page layout | drei **View** |
| HTML anchored to a 3D point (desktop/mobile) | drei **Html** (Module 3) |
| overlays drawn on top of the scene with its own camera | drei **Hud** |
| crisp, interactive UI *inside* the 3D world, including VR | **@react-three/uikit** |
| a few labels or signs in 3D | drei **Text** |

## Check yourself

```quiz
? What problem does drei's View solve?
+ Rendering many 3D views in a page with a single WebGL context
- Making HTML visible in VR
- Adding a GUI panel
> Browsers limit WebGL contexts; one canvas + scissoring avoids the limit.

? Why can't you use normal HTML buttons inside an immersive VR session?
+ The headset shows only what is rendered into the WebXR scene, not the HTML page
- HTML is too slow
- VR browsers don't support HTML
> UI must be part of the 3D scene: uikit, Text, meshes.

? What does leva's useControls return?
+ The current values of the controls, updating live as you drag
- A three.js material
- A React ref to the panel
> It's a hook that both declares the GUI and returns values.

? Which drei component draws a compass or minimap on top of the scene with its own camera?
+ Hud
- View
- Html
> Hud renders after the main scene with its own camera.

? What layout system does @react-three/uikit use?
+ Flexbox (via the Yoga layout engine)
- CSS Grid
- Absolute positioning only
> The same engine React Native uses.
```

:::exercise Debug the lights
Add a leva folder "Lights" to the first example with an `intensity` slider and a `position` vector control (`{ value: [3, 5, 2] }`) for a directional light, and a checkbox to show a `DirectionalLightHelper` via drei's `useHelper`.
:::

:::solution
```jsx run
import { useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useHelper } from "@react-three/drei";
import { useControls } from "leva";

function Light() {
  const ref = useRef();
  const { intensity, position, helper } = useControls("Lights", {
    intensity: { value: 2, min: 0, max: 6 },
    position: { value: [3, 5, 2] },
    helper: true,
  });
  useHelper(helper && ref, THREE.DirectionalLightHelper, 1, "#ef4444");
  return <directionalLight ref={ref} intensity={intensity} position={position} />;
}

export default function App() {
  return (
    <Canvas camera={{ position: [4, 3, 6] }}>
      <ambientLight intensity={0.3} />
      <Light />
      <mesh position-y={0.5}><boxGeometry /><meshStandardMaterial color="#38bdf8" /></mesh>
      <gridHelper args={[10, 10]} />
      <OrbitControls />
    </Canvas>
  );
}
```
:::

:::keypoints
- **leva**: `useControls` declares a GUI and returns live values; perfect for tuning, hidden in production.
- **View**: one canvas, many DOM-tracked 3D views; avoids the WebGL context limit in product grids and dashboards.
- **Hud**: overlays with their own camera drawn on top of the scene (compass, minimap, score).
- **@react-three/uikit**: flexbox UI as real 3D objects, working with mouse, touch and VR controllers.
:::
