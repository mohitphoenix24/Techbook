---
title: TypeScript, Project Structure & Testing
level: advanced
time: 35
summary: Typing R3F components, refs, events and extended elements, typed models from gltfjsx, a typed Zustand store, how to organise a real 3D codebase, Next.js integration, and testing scenes with @react-three/test-renderer and visual regression screenshots.
---

Prototypes live in one file; products don't. Once a 3D view becomes part of a real application (a configurator inside an e-commerce site, a digital twin inside an operations dashboard) it needs types, a structure other developers can navigate, and tests. R3F has first-class TypeScript support and its own test renderer.

## Typing components and refs

Every three.js JSX element's props are available as `ThreeElements['elementName']`, so wrapper components can accept and forward **all** mesh props with full autocompletion:

```tsx run title="Typed components, refs and events" level=intermediate
import { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, type ThreeElements, type ThreeEvent } from "@react-three/fiber";

type SpinnerProps = ThreeElements["mesh"] & {
  speed?: number;
  color?: THREE.ColorRepresentation;
  onPicked?: (point: THREE.Vector3) => void;
};

function Spinner({ speed = 1, color = "#34d399", onPicked, ...meshProps }: SpinnerProps) {
  const ref = useRef<THREE.Mesh>(null!);              // non-null: R3F fills it before useFrame runs
  const [hovered, setHovered] = useState(false);
  useFrame((_, delta: number) => {
    ref.current.rotation.y += delta * speed;           // fully typed: rotation is a THREE.Euler
  });
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onPicked?.(e.point.clone());
  };
  return (
    <mesh ref={ref} {...meshProps} onClick={handleClick}
      onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? "#f472b6" : color} />
    </mesh>
  );
}

export default function App() {
  const [last, setLast] = useState<THREE.Vector3 | null>(null);
  return (
    <>
      <div className="overlay">{last ? `picked (${last.x.toFixed(2)}, ${last.y.toFixed(2)}, ${last.z.toFixed(2)})` : "click a box"}</div>
      <Canvas camera={{ position: [0, 1, 5] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 4]} intensity={2} />
        <Spinner position={[-1.3, 0, 0]} speed={0.5} onPicked={setLast} />
        <Spinner position={[1.3, 0, 0]} speed={2} color="#818cf8" scale={0.8} onPicked={setLast} />
      </Canvas>
    </>
  );
}
```

On this site `tsx` examples have their types **stripped**, not checked, so the editor won't flag type errors. In a real project, `tsc` and your editor do.

| Type | Use |
|---|---|
| `ThreeElements["mesh"]`, `ThreeElements["group"]`… | props of any built-in element |
| `useRef<THREE.Mesh>(null!)` | a ref you'll only read after mount |
| `ThreeEvent<MouseEvent \| PointerEvent \| WheelEvent>` | event handler parameters |
| `RootState` | the `state` argument of `useFrame` and `useThree` |
| `CanvasProps` | props of `<Canvas>` (renamed from `Props` in v9) |
| `ThreeElement<typeof Class>` | the props type for an `extend`ed class |

### Typing extended elements

When you `extend` a class, tell TypeScript about the new element by augmenting R3F's `ThreeElements` interface:

```tsx
import { extend, type ThreeElement } from "@react-three/fiber";
import { Sky } from "three/addons/objects/Sky.js";

extend({ Sky });

declare module "@react-three/fiber" {
  interface ThreeElements {
    sky: ThreeElement<typeof Sky>;
  }
}

// <sky scale={1000} material-uniforms-turbidity-value={8} />  ← now type-checked
```

The factory form avoids the global declaration entirely: `const SkyElement = extend(Sky)` gives a typed component.

### Typed models from gltfjsx

`npx gltfjsx model.glb --types` generates a type describing the model's nodes and materials, so a renamed part becomes a compile error instead of a blank screen:

```tsx
import type { GLTF } from "three-stdlib";

type GLTFResult = GLTF & {
  nodes: { laces: THREE.Mesh; sole: THREE.Mesh; upper: THREE.Mesh };
  materials: { laces: THREE.MeshStandardMaterial; sole: THREE.MeshStandardMaterial; upper: THREE.MeshStandardMaterial };
};

export function Shoe(props: ThreeElements["group"]) {
  const { nodes, materials } = useGLTF("/shoe.glb") as unknown as GLTFResult;
  return (
    <group {...props} dispose={null}>
      <mesh geometry={nodes.laces.geometry} material={materials.laces} />
      …
    </group>
  );
}
```

## A typed store

```tsx run title="A typed Zustand store driving the scene" level=intermediate
import { useRef } from "react";
import * as THREE from "three";
import { create } from "zustand";
import { Canvas, useFrame, type ThreeElements } from "@react-three/fiber";
import { easing } from "maath";

type Part = "body" | "lid" | "handle";
type ConfigState = {
  colors: Record<Part, string>;
  selected: Part | null;
  select: (part: Part | null) => void;
  paint: (color: string) => void;
};

const useConfig = create<ConfigState>((set) => ({
  colors: { body: "#334155", lid: "#10b981", handle: "#f59e0b" },
  selected: "lid",
  select: (selected) => set({ selected }),
  paint: (color) => set((s) => (s.selected ? { colors: { ...s.colors, [s.selected]: color } } : s)),
}));

function Piece({ part, children, ...props }: { part: Part } & ThreeElements["mesh"]) {
  const ref = useRef<THREE.Mesh>(null!);
  const color = useConfig((s) => s.colors[part]);
  const selected = useConfig((s) => s.selected === part);
  const select = useConfig((s) => s.select);
  useFrame((_, dt) => {
    const mat = ref.current.material as THREE.MeshStandardMaterial;
    easing.dampC(mat.color, color, 0.2, dt);
    easing.damp(mat, "emissiveIntensity", selected ? 0.25 : 0, 0.2, dt);
  });
  return (
    <mesh ref={ref} {...props} onClick={(e) => { e.stopPropagation(); select(part); }}>
      {children}
      <meshStandardMaterial emissive="#ffffff" emissiveIntensity={0} />
    </mesh>
  );
}

export default function App() {
  const { selected, paint } = useConfig();
  return (
    <>
      <div className="overlay">
        <span>Selected: <b>{selected ?? "none"}</b></span>
        <div className="row">{["#334155", "#10b981", "#f59e0b", "#ef4444", "#6366f1"].map((c) => <button key={c} onClick={() => paint(c)} style={{ background: c, width: 26, height: 26 }} />)}</div>
      </div>
      <Canvas camera={{ position: [2.5, 2, 3.5], fov: 45 }} onPointerMissed={() => useConfig.getState().select(null)}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 2]} intensity={2} />
        <Piece part="body" position-y={0.5}><cylinderGeometry args={[0.7, 0.7, 1, 48]} /></Piece>
        <Piece part="lid" position-y={1.06}><cylinderGeometry args={[0.74, 0.74, 0.12, 48]} /></Piece>
        <Piece part="handle" position-y={1.22}><torusGeometry args={[0.18, 0.05, 12, 32, Math.PI]} /></Piece>
      </Canvas>
    </>
  );
}
```

The `Part` union type means `paint`, `select` and `colors` can never refer to a part that doesn't exist, and adding a part forces you to handle it everywhere.

## Structuring a 3D codebase

A layout that scales from prototype to product:

```text
src/
  app/                    routes / pages (Next.js or React Router)
  components/
    ui/                   ordinary HTML components (panels, buttons, forms)
    three/
      canvas/             <Scene>, <Lighting>, <CameraRig>, <Effects> — the stage
      models/             generated by gltfjsx, then hand-edited (Shoe.tsx, Robot.tsx)
      objects/            reusable 3D building blocks (Hotspot, Label, Gizmo)
      materials/          shaderMaterial definitions, TSL node materials
  stores/                 zustand stores (config, selection, telemetry)
  hooks/                  useHotkeys, useTelemetry, useCameraFocus…
  lib/                    pure logic: pricing rules, kinematics, data parsing (no React, easy to unit test)
public/
  models/                 optimised .glb (gltfjsx --transform / gltf-transform)
  hdri/  textures/  fonts/  decoders/ (draco, basis)
```

Principles: keep **pure logic** (prices, constraints, maths) out of components so it's trivially testable; let **stores** be the single source of truth shared by HTML and 3D; keep the **Canvas** as a thin stage that composes small components; and **version your assets** next to the code that depends on part names.

## Next.js and SSR

R3F runs only in the browser (WebGL needs a real canvas). In the Next.js App Router, mark 3D components as client components and, for heavy scenes, load them lazily so they don't block the first paint:

```tsx
// app/product/[id]/Viewer.tsx
"use client";
import { Canvas } from "@react-three/fiber";
export default function Viewer({ modelUrl }: { modelUrl: string }) { /* … <Canvas> … */ }

// app/product/[id]/page.tsx  (server component)
import dynamic from "next/dynamic";
const Viewer = dynamic(() => import("./Viewer"), { ssr: false, loading: () => <img src="/poster.webp" alt="" /> });
export default function Page() { return <Viewer modelUrl="/models/sofa.glb" />; }
```

Show a **poster image** (a pre-rendered screenshot) while the 3D bundle and model load: it gives instant visual feedback and is what search engines and link previews see.

## Testing

| Level | Tool | Tests |
|---|---|---|
| pure logic | Vitest / Jest | pricing rules, kinematics, data transforms |
| scene graph | **@react-three/test-renderer** | "selecting 'lid' paints the lid mesh", "3 hotspots render", events fire |
| visual | Playwright screenshots | the rendered pixels match a reviewed baseline |
| performance | Playwright + `renderer.info`, Lighthouse | draw calls and frame time stay within budget |

`@react-three/test-renderer` renders R3F components **without a browser or WebGL**, so it runs in Node inside your normal test suite:

```tsx
// Piece.test.tsx  (Vitest)
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { expect, test } from "vitest";
import { Configurator } from "./Configurator";

test("clicking the lid selects it", async () => {
  const renderer = await ReactThreeTestRenderer.create(<Configurator />);
  const lid = renderer.scene.findByProps({ name: "lid" });
  await renderer.fireEvent(lid, "click");
  expect(useConfig.getState().selected).toBe("lid");
});

test("renders one mesh per configurable part", async () => {
  const renderer = await ReactThreeTestRenderer.create(<Configurator />);
  expect(renderer.scene.findAll((n) => n.type === "Mesh")).toHaveLength(3);
});
```

Visual regression with Playwright (it can render WebGL headlessly, with software rendering if needed), which is also how every example on this site was checked:

```ts
// e2e/viewer.spec.ts
import { test, expect } from "@playwright/test";

test("product viewer renders the default configuration", async ({ page }) => {
  await page.goto("/product/sofa");
  await page.waitForFunction(() => (window as any).__sceneReady === true);   // set by your app after load
  await expect(page.locator("canvas")).toHaveScreenshot("sofa-default.png", { maxDiffPixelRatio: 0.02 });
});
```

:::tip Make scenes testable
Expose a small "ready" signal (a global flag or a DOM attribute set after models load and the first frame renders), disable random animation and auto-rotate under test (`?test=1`), and fix the device pixel ratio. Deterministic scenes make screenshot tests reliable.
:::

## Check yourself

```quiz
? How do you type a wrapper component that accepts every <mesh> prop?
+ props: ThreeElements["mesh"] (plus your own props)
- props: THREE.Mesh
- props: any
> ThreeElements maps every element to its JSX props.

? How do you make an extended element type-checked?
+ Augment the ThreeElements interface in "@react-three/fiber" with ThreeElement<typeof Class>
- Add it to global JSX.IntrinsicElements
- It's typed automatically
> v9 uses module augmentation of ThreeElements.

? Why mark R3F components "use client" in Next.js?
+ WebGL and the canvas only exist in the browser
- Server components are slower
- R3F requires class components
> Load heavy viewers with dynamic(..., { ssr: false }).

? What does @react-three/test-renderer let you do?
+ Render R3F components in Node without WebGL and assert on the scene graph and events
- Take screenshots
- Measure GPU time
> Use Playwright for pixels.

? Where should pricing rules for a configurator live?
+ In pure functions outside components, unit-tested on their own
- Inside useFrame
- In the GLSL shader
> Pure logic is the easiest thing to test.
```

:::exercise Typed hotspot
Write a typed `Hotspot` component in TSX: props `{ position: [number, number, number]; label: string; onOpen?: (label: string) => void }`, rendering a small sphere that calls `onOpen(label)` on click and scales up on hover.
:::

:::solution
```tsx run
import { useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";

type HotspotProps = { position: [number, number, number]; label: string; onOpen?: (label: string) => void };

function Hotspot({ position, label, onOpen }: HotspotProps) {
  const [hover, setHover] = useState(false);
  return (
    <mesh position={position} scale={hover ? 1.4 : 1}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onOpen?.(label); }}
      onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
      <sphereGeometry args={[0.15, 24, 12]} />
      <meshStandardMaterial color={hover ? "#f472b6" : "#22d3ee"} emissive="#22d3ee" emissiveIntensity={0.4} />
    </mesh>
  );
}

export default function App() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="overlay">{open ?? "click a hotspot"}</div>
      <Canvas camera={{ position: [0, 0, 4] }}>
        <ambientLight />
        <Hotspot position={[-1, 0, 0]} label="Motor" onOpen={setOpen} />
        <Hotspot position={[0, 0.6, 0]} label="Sensor" onOpen={setOpen} />
        <Hotspot position={[1, -0.3, 0]} label="Gripper" onOpen={setOpen} />
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- Type props with `ThreeElements["mesh"]`, refs with `useRef<THREE.Mesh>(null!)`, events with `ThreeEvent<…>`.
- Augment `ThreeElements` for extended classes; use `gltfjsx --types` for typed models; type stores with union types.
- Structure: UI vs three components, models from gltfjsx, stores as single source of truth, pure logic in `lib/`.
- Next.js: `"use client"`, `dynamic(..., { ssr: false })`, and a poster image while loading.
- Test logic with Vitest, scene graphs with `@react-three/test-renderer`, pixels with Playwright screenshots.
:::
