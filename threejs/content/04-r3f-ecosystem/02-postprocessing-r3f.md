---
title: Effects with @react-three/postprocessing
level: intermediate
time: 30
summary: Declarative post-processing in R3F — bloom that makes emissive materials glow, vignette, noise, chromatic aberration, ambient occlusion (N8AO), depth of field, outlines for selection, anti-aliasing — and how the pmndrs postprocessing library merges effects for speed.
---

Module 2 built post-processing by hand with `EffectComposer` and passes. In R3F, **@react-three/postprocessing** turns effects into components. It's built on the pmndrs **postprocessing** library, which **merges** compatible effects into as few full-screen passes as possible, so stacking bloom, vignette, noise and colour grading costs roughly one pass instead of four.

:::syntax
```jsx
import { EffectComposer, Bloom, Vignette, Noise } from "@react-three/postprocessing";

<Canvas>
  {/* …scene… */}
  <EffectComposer>                 {/* replaces R3F's normal render */}
    <Bloom mipmapBlur luminanceThreshold={1} intensity={1.2} />
    <Vignette darkness={0.5} />
    <Noise opacity={0.03} />
  </EffectComposer>
</Canvas>
```
:::

## Bloom that only affects what should glow

The modern recipe: set the bloom `luminanceThreshold` to **1** and make glowing materials **brighter than 1** by turning off their tone mapping (`toneMapped={false}`) and pushing colour or `emissiveIntensity` above 1. Everything else stays crisp. `mipmapBlur` gives a wide, high-quality glow cheaply.

```jsx run title="Neon: selective bloom, vignette and noise" level=intermediate height=440
import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from "@react-three/postprocessing";
import { OrbitControls } from "@react-three/drei";

function NeonRing({ color, position, speed }) {
  const ref = useRef();
  useFrame((_, dt) => (ref.current.rotation.y += dt * speed));
  return (
    <mesh ref={ref} position={position}>
      <torusGeometry args={[0.7, 0.05, 16, 100]} />
      {/* colour values above 1 + toneMapped={false} → brighter than white → only these bloom */}
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

export default function App() {
  const [fx, setFx] = useState({ bloom: true, vignette: true, noise: true, aberration: false });
  const toggle = (k) => setFx((f) => ({ ...f, [k]: !f[k] }));
  return (
    <>
      <div className="overlay">{Object.keys(fx).map((k) => <label key={k}><input type="checkbox" checked={fx[k]} onChange={() => toggle(k)} /> {k}</label>)}</div>
      <Canvas camera={{ position: [0, 1.5, 6], fov: 45 }}>
        <color attach="background" args={["#05060f"]} />
        <ambientLight intensity={0.2} />
        <pointLight position={[0, 3, 2]} intensity={8} />
        <NeonRing color={[0.3, 4, 6]} position={[-2.2, 1, 0]} speed={0.8} />
        <NeonRing color={[6, 0.6, 3]} position={[0, 1, 0]} speed={-0.6} />
        <NeonRing color={[3, 6, 0.4]} position={[2.2, 1, 0]} speed={1.1} />
        <mesh position={[0, 0.5, -1.5]}><boxGeometry args={[6, 1, 0.3]} /><meshStandardMaterial color="#334155" /></mesh>
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[20, 20]} /><meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.6} /></mesh>
        <EffectComposer>
          {fx.bloom && <Bloom mipmapBlur luminanceThreshold={1} intensity={1.4} radius={0.7} />}
          {fx.aberration && <ChromaticAberration offset={[0.002, 0.002]} />}
          {fx.vignette && <Vignette offset={0.25} darkness={0.75} />}
          {fx.noise && <Noise opacity={0.04} />}
        </EffectComposer>
        <OrbitControls />
      </Canvas>
    </>
  );
}
```

The grey wall and floor don't glow at all, even with bloom on, because their brightness never exceeds the threshold. The same rule works for screens, LEDs, lasers, UI highlights and "status" indicators in digital twins.

## Outlines for hover and selection

`<Selection>` + `<Select enabled>` mark which objects an `<Outline>` (or `<SelectiveBloom>`) should apply to:

```jsx run title="Outline the hovered part" level=intermediate
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Outline, Selection, Select } from "@react-three/postprocessing";
import { OrbitControls, Environment, useCursor } from "@react-three/drei";

function Part({ position, children }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  return (
    <Select enabled={hovered}>
      <mesh position={position} onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>
        {children}
        <meshStandardMaterial color="#94a3b8" metalness={0.4} roughness={0.4} />
      </mesh>
    </Select>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [3, 3, 5], fov: 45 }}>
      <color attach="background" args={["#f1f5f9"]} />
      <Selection>
        <Part position={[-1.5, 0.5, 0]}><boxGeometry /></Part>
        <Part position={[0, 0.6, 0]}><cylinderGeometry args={[0.5, 0.5, 1.2, 32]} /></Part>
        <Part position={[1.5, 0.6, 0]}><torusKnotGeometry args={[0.4, 0.14, 128, 16]} /></Part>
        <EffectComposer autoClear={false}>
          <Outline visibleEdgeColor={0x10b981} hiddenEdgeColor={0x10b981} edgeStrength={8} width={1200} />
        </EffectComposer>
      </Selection>
      <Environment preset="city" />
      <OrbitControls />
    </Canvas>
  );
}
```

## Depth: ambient occlusion and depth of field

**N8AO** is a high-quality, fast screen-space ambient occlusion: it darkens contact points and creases, which grounds objects and adds a lot of perceived realism. **Depth of field** blurs what's out of focus, like a camera lens:

```jsx run title="N8AO + DepthOfField + SMAA" level=advanced
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, N8AO, DepthOfField, SMAA } from "@react-three/postprocessing";
import { OrbitControls, Environment } from "@react-three/drei";

function Clutter() {
  return Array.from({ length: 24 }, (_, i) => {
    const x = (i % 6 - 2.5) * 0.9, z = (Math.floor(i / 6) - 1.5) * 1.6;
    return (
      <mesh key={i} position={[x, 0.35 + (i % 3) * 0.05, z]} rotation={[0, i, 0]}>
        {i % 3 === 0 ? <boxGeometry args={[0.6, 0.7, 0.6]} /> : i % 3 === 1 ? <sphereGeometry args={[0.38, 32, 16]} /> : <cylinderGeometry args={[0.3, 0.3, 0.75, 24]} />}
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    );
  });
}

export default function App() {
  const [ao, setAo] = useState(true);
  const [dof, setDof] = useState(true);
  return (
    <>
      <div className="overlay">
        <label><input type="checkbox" checked={ao} onChange={(e) => setAo(e.target.checked)} /> ambient occlusion (N8AO)</label>
        <label><input type="checkbox" checked={dof} onChange={(e) => setDof(e.target.checked)} /> depth of field</label>
      </div>
      <Canvas camera={{ position: [0, 3, 6], fov: 40 }} gl={{ antialias: false }}>   {/* AA done by SMAA in the composer */}
        <color attach="background" args={["#e2e8f0"]} />
        <Clutter />
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[20, 20]} /><meshStandardMaterial color="#f1f5f9" /></mesh>
        <Environment preset="apartment" />
        <EffectComposer multisampling={0}>
          {ao && <N8AO aoRadius={0.6} intensity={3} distanceFalloff={0.5} />}
          {dof && <DepthOfField focusDistance={0.025} focalLength={0.05} bokehScale={3} />}
          <SMAA />
        </EffectComposer>
        <OrbitControls />
      </Canvas>
    </>
  );
}
```

Toggle AO off: the white objects float and look flat. AO is one of the best realism-per-millisecond effects, as long as the GPU can afford it (it's heavier than bloom).

## The effects catalogue

| Effect | Use | Cost |
|---|---|---|
| `Bloom` (`mipmapBlur`) | glows, neon, screens, sun | low–medium |
| `SelectiveBloom` | bloom only for selected objects (alternative to the threshold trick) | medium |
| `N8AO` / `SSAO` | contact shadows and depth in creases | medium–high |
| `DepthOfField` | camera focus, cinematic shots, hero products | medium–high |
| `Outline` | selection highlight | medium |
| `Vignette`, `Noise`, `ChromaticAberration` | lens character, film look | very low |
| `ToneMapping`, `HueSaturation`, `BrightnessContrast`, `LUT` | colour grading | very low |
| `SMAA` / `FXAA` | anti-aliasing when the canvas's MSAA is off | low |
| `Glitch`, `Pixelation`, `DotScreen`, `Scanline`, `ASCII` | stylised looks | low |
| `GodRays` | light shafts from a sun mesh | medium |
| `TiltShift2` | miniature look for city and architecture views | medium |

:::tip Performance habits
`<EffectComposer multisampling={0}>` plus `<SMAA />` is often faster than MSAA at high resolutions. Turn effects off in VR (most screen-space effects don't work well in stereo and cost double). And combine `PerformanceMonitor` (previous module) with conditional effects: `{highQuality && <N8AO />}`.
:::

:::note WebGPU
`@react-three/postprocessing` targets `WebGLRenderer`. With `WebGPURenderer`, use three.js's TSL `RenderPipeline` nodes instead (bloom, GTAO, DOF and more), which you saw in Module 2 and will use from R3F in this module's WebGPU lesson.
:::

## Check yourself

```quiz
? How do you make only certain objects bloom with a threshold of 1?
+ Make their colour/emissive exceed 1 and set toneMapped={false} on their materials
- Put them in a separate Canvas
- Give them a higher roughness
> Only pixels brighter than 1 pass the threshold.

? Why is stacking several effects in @react-three/postprocessing relatively cheap?
+ The postprocessing library merges compatible effects into fewer full-screen passes
- Effects run on the CPU
- Each effect is cached as an image
> Fewer passes = fewer full-screen reads and writes.

? Which effect adds contact darkening in creases and under objects?
+ N8AO (ambient occlusion)
- Vignette
- Bloom
> AO grounds objects and adds depth.

? What do Selection, Select and Outline do together?
+ Outline only the objects inside an enabled <Select>
- Select the best outline colour automatically
- Raycast for you
> Wrap parts in <Select enabled={hovered}>.

? Why turn the canvas antialias off when using SMAA in the composer?
+ The composer renders into its own target; SMAA handles anti-aliasing there, so canvas MSAA is wasted
- SMAA requires it
- It makes bloom brighter
> Avoid paying for anti-aliasing twice.
```

:::exercise Sci-fi status lights
Build a row of five "server racks" (dark boxes). Each rack has a small LED (a sphere with `toneMapped={false}`) whose colour comes from a status array: green, green, amber, red, green. Add `<Bloom mipmapBlur luminanceThreshold={1}>` so only the LEDs glow, and make the red one blink with `useFrame`.
:::

:::solution
```jsx run
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

const STATUS = { ok: [0.2, 4, 0.6], warn: [5, 2.5, 0.2], fail: [6, 0.3, 0.3] };

function Rack({ x, status }) {
  const led = useRef();
  useFrame(({ clock }) => {
    if (status === "fail") led.current.visible = Math.sin(clock.elapsedTime * 8) > 0;   // blink
  });
  return (
    <group position-x={x}>
      <mesh position-y={1}><boxGeometry args={[0.8, 2, 0.8]} /><meshStandardMaterial color="#1f2937" /></mesh>
      <mesh ref={led} position={[0, 1.7, 0.41]}><sphereGeometry args={[0.05, 16, 8]} /><meshBasicMaterial color={STATUS[status]} toneMapped={false} /></mesh>
    </group>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 1.5, 5] }}>
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[2, 4, 3]} intensity={1} />
      {["ok", "ok", "warn", "fail", "ok"].map((s, i) => <Rack key={i} x={(i - 2) * 1} status={s} />)}
      <EffectComposer><Bloom mipmapBlur luminanceThreshold={1} intensity={2} /></EffectComposer>
    </Canvas>
  );
}
```
:::

:::keypoints
- `<EffectComposer>` + effect components; the pmndrs postprocessing library **merges** effects for speed.
- Selective bloom: threshold **1**, glowing materials with values **> 1** and `toneMapped={false}`.
- `Outline` with `Selection`/`Select` for highlights; `N8AO` for grounding; `DepthOfField` for focus; `SMAA` for AA.
- Effects cost pixels: keep them few, adapt to device performance, and avoid most of them in VR.
:::
