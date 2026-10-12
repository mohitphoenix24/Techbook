---
title: Scroll-Driven 3D Storytelling
level: intermediate
time: 35
summary: The technique behind award-winning product launches and portfolios — tying 3D animation to page scroll with drei's ScrollControls and useScroll, scroll ranges for chapters, HTML sections that scroll with the scene, an exploded product view, and accessibility and performance rules for scroll sites.
---

Scroll down a modern product launch page and the phone rotates, the camera dives inside the engine, the parts fly apart and reassemble. These pages feel like films the visitor controls with their scroll wheel. The core trick is simple: **map scroll progress (0 → 1) to animation progress**. drei's `<ScrollControls>` does the plumbing in R3F.

:::def ScrollControls / useScroll
`<ScrollControls pages={n}>` creates a scrollable area `n` screens tall on top of the canvas. Inside it, `useScroll()` returns live scroll data: `offset` (0 at the top, 1 at the bottom), `delta`, and helpers `range(start, length)`, `curve(start, length)` and `visible(start, length)` for chapter-style animation. `<Scroll>` moves 3D content with the page; `<Scroll html>` moves HTML sections.
:::

## Scroll moves the camera and the product

Scroll inside the preview (wheel, trackpad or touch):

```jsx run title="A scroll-driven product page" level=intermediate height=460
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ScrollControls, Scroll, useScroll, Environment, Float } from "@react-three/drei";
import { easing } from "maath";

function Watch() {
  const ref = useRef();
  const scroll = useScroll();
  useFrame((state, delta) => {
    const t = scroll.offset;                                     // 0 … 1 across the whole page
    // rotate the product a full turn over the page, tilt it in the middle
    easing.dampE(ref.current.rotation, [Math.sin(t * Math.PI) * 0.6, t * Math.PI * 2, 0], 0.15, delta);
    // the camera dollies in, then out, and moves the product left/right per chapter
    easing.damp3(state.camera.position, [Math.sin(t * Math.PI * 2) * 1.5, 0.3, 5 - Math.sin(t * Math.PI) * 2], 0.25, delta);
    state.camera.lookAt(0, 0, 0);
  });
  return (
    <group ref={ref}>
      <group rotation-x={1.2}>                                    {/* tilt the face towards the camera */}
      <mesh><cylinderGeometry args={[1, 1, 0.3, 64]} /><meshStandardMaterial color="#1f2937" metalness={0.9} roughness={0.25} /></mesh>
      <mesh position-y={0.16}><cylinderGeometry args={[0.88, 0.88, 0.02, 64]} /><meshStandardMaterial color="#0f172a" /></mesh>
      <mesh position={[0, 0.18, 0]} rotation-x={-Math.PI / 2}><ringGeometry args={[0.7, 0.75, 64]} /><meshBasicMaterial color={[0.3, 3, 2]} toneMapped={false} /></mesh>
      <mesh position={[0, 0, 1.05]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.08, 0.08, 0.15, 16]} /><meshStandardMaterial color="#d1d5db" metalness={1} roughness={0.2} /></mesh>
      {[1.5, -1.5].map((z) => <mesh key={z} position={[0, 0, z]}><boxGeometry args={[0.9, 0.12, 1.4]} /><meshStandardMaterial color="#10b981" roughness={0.8} /></mesh>)}
      </group>
    </group>
  );
}

const section = (align) => ({ position: "absolute", width: "100%", padding: "0 6%", display: "flex", justifyContent: align, boxSizing: "border-box" });

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0.3, 5], fov: 40 }}>
      <color attach="background" args={["#f1f5f9"]} />
      <Environment preset="city" />
      <ScrollControls pages={4} damping={0.2}>
        <Float floatIntensity={0.4} rotationIntensity={0}><Watch /></Float>
        <Scroll html style={{ width: "100%" }}>
          {/* each block is positioned at a page offset: top = page × 100vh */}
          <div style={{ ...section("flex-start"), top: "20vh" }}><div className="overlay" style={{ position: "static" }}><h2 style={{ margin: 0 }}>Pulse One</h2><span>Scroll to explore ↓</span></div></div>
          <div style={{ ...section("flex-end"), top: "120vh" }}><div className="overlay" style={{ position: "static" }}><b>Sapphire glass</b><span className="muted">Scratch-proof, edge to edge.</span></div></div>
          <div style={{ ...section("flex-start"), top: "220vh" }}><div className="overlay" style={{ position: "static" }}><b>7-day battery</b><span className="muted">Always-on display included.</span></div></div>
          <div style={{ ...section("center"), top: "320vh" }}><div className="overlay" style={{ position: "static", alignItems: "center" }}><b>From $299</b><button className="primary">Pre-order</button></div></div>
        </Scroll>
      </ScrollControls>
    </Canvas>
  );
}
```

Two habits make this feel premium rather than jerky:

- **Damping**: `ScrollControls damping` smooths the scroll value itself, and `easing.damp*` smooths each animated property, so fast flicks of the wheel still produce gentle motion.
- **Absolute progress**: everything is a function of `scroll.offset`, so scrolling back up plays the story in reverse for free. No timelines to manage.

## Chapters with range, curve and visible

Real pages have chapters: "parts fly out between 20% and 50%, labels appear from 40% to 60%". `useScroll()` provides helpers that turn global progress into **local** progress for a slice of the page:

| Helper | Returns | Use |
|---|---|---|
| `scroll.range(from, length)` | 0 before `from`, rising to 1 over `length` | one-way transitions (explode, fade in) |
| `scroll.curve(from, length)` | 0 → 1 → 0 over the slice (a sine bump) | something that appears and leaves (a highlight) |
| `scroll.visible(from, length)` | `true` while inside the slice | toggling labels or whole objects |

The **exploded view** is a staple of engineering and hardware marketing: every part moves out along its own direction as you scroll, revealing the internals, with labels in the middle chapter:

```jsx run title="Exploded view with scroll ranges" level=intermediate height=460
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ScrollControls, useScroll, Environment, Html } from "@react-three/drei";
import * as THREE from "three";

// each part: where it sits assembled, and the direction it flies out to
const PARTS = [
  { name: "Top cover", color: "#e2e8f0", geo: <cylinderGeometry args={[1, 1, 0.12, 64]} />, pos: [0, 0.62, 0], dir: [0, 1.8, 0] },
  { name: "Battery", color: "#22c55e", geo: <boxGeometry args={[1.2, 0.25, 0.8]} />, pos: [0, 0.38, 0], dir: [0, 0.9, 0.9] },
  { name: "Logic board", color: "#0ea5e9", geo: <boxGeometry args={[1.5, 0.06, 1.5]} />, pos: [0, 0.18, 0], dir: [0, 0.2, -1.4] },
  { name: "Motor", color: "#f97316", geo: <cylinderGeometry args={[0.35, 0.35, 0.4, 32]} />, pos: [0, -0.1, 0], dir: [1.6, -0.3, 0] },
  { name: "Housing", color: "#334155", geo: <cylinderGeometry args={[1.05, 1.05, 0.6, 64, 1, true]} />, pos: [0, 0.1, 0], dir: [0, -1.4, 0] },
];

function Part({ name, color, geo, pos, dir }) {
  const ref = useRef();
  const label = useRef();
  const scroll = useScroll();
  const target = useRef(new THREE.Vector3()).current;
  useFrame((_, delta) => {
    const explode = scroll.range(0.15, 0.35);                 // 0 → 1 between 15% and 50% of the page
    target.set(pos[0] + dir[0] * explode, pos[1] + dir[1] * explode, pos[2] + dir[2] * explode);
    ref.current.position.lerp(target, 1 - Math.exp(-10 * delta));
    ref.current.rotation.y += delta * 0.2 * (1 - scroll.range(0.8, 0.2));
    if (label.current) label.current.style.opacity = scroll.curve(0.4, 0.4);   // labels fade in, then out
  });
  return (
    <mesh ref={ref} position={pos}>
      {geo}
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.5} side={THREE.DoubleSide} />
      <Html center distanceFactor={7}><div ref={label} className="label3d" style={{ opacity: 0 }}>{name}</div></Html>
    </mesh>
  );
}

const camGoal = new THREE.Vector3();                           // reused every frame: no allocations in the loop

function Rig() {
  const scroll = useScroll();
  useFrame((state, delta) => {
    const t = scroll.offset;
    state.camera.position.lerp(camGoal.set(Math.sin(t * 2) * 4, 1.5 + t * 2, 6 - t), 1 - Math.exp(-4 * delta));
    state.camera.lookAt(0, 0.3, 0);
  });
  return null;
}

export default function App() {
  return (
    <>
      <div className="overlay">Scroll inside the preview to explode the device</div>
      <Canvas camera={{ position: [0, 1.5, 6], fov: 40 }}>
        <color attach="background" args={["#0b1020"]} />
        <Environment preset="warehouse" />
        <ScrollControls pages={3} damping={0.25}>
          {PARTS.map((p) => <Part key={p.name} {...p} />)}
          <Rig />
        </ScrollControls>
      </Canvas>
    </>
  );
}
```

## Other ways to drive 3D from scroll

| Approach | When |
|---|---|
| drei `ScrollControls` | the canvas *is* the page (full-screen experiences) |
| **GSAP ScrollTrigger** with a normal page | a regular website (React or not) whose sections pin a canvas; tie `timeline.progress` to scroll, read it in `useFrame` |
| `IntersectionObserver` | trigger an animation once when a section enters the viewport |
| Lenis / smooth-scroll libraries | buttery scroll smoothing for the whole page, combined with any of the above |
| drei `<View>` | several 3D views embedded in normal page sections, all sharing one canvas (next lessons) |

## Rules for scroll experiences

:::warn Don't break the web
Scroll sites win awards and also frustrate users when they hijack scrolling. Keep scroll **direction and speed natural** (no scroll-jacking that ignores the wheel), keep **text in HTML** (selectable, translatable, readable by screen readers and search engines), respect **`prefers-reduced-motion`** (offer a static layout or gentler animation), make sure the page **works on touch**, and provide a **fallback** when WebGL fails.
:::

Performance notes: scroll pages are often viewed on phones, so keep the hero model light (compressed, < 3 MB), cap DPR, preload the model behind a poster image, and pause expensive effects when the canvas is out of view.

:::ai
Scroll storytelling is a common way to explain complex technical products, including AI hardware and robotics: an exploded view of a robot gripper, a camera flying through a data centre, a sensor's field of view sweeping as the reader scrolls. The same `range`/`curve` choreography makes technical explainers far easier to follow than static diagrams.
:::

## Check yourself

```quiz
? What does scroll.offset represent?
+ Progress through the scrollable area, 0 at the top and 1 at the bottom
- Pixels scrolled
- Scroll speed
> Map it to animation progress.

? You want parts to move out only between 20% and 50% of the page. Which helper?
+ scroll.range(0.2, 0.3)
- scroll.curve(0.2, 0.5)
- scroll.visible(0.2)
> range rises from 0 to 1 over the given slice.

? Why compute animation from scroll.offset instead of starting timelines on scroll events?
+ Scrolling back automatically reverses it, and it's always in sync with position
- It's required by React
- Timelines don't work in R3F
> Absolute progress = deterministic choreography.

? Where should the page's text live in a scroll experience?
+ In HTML (Scroll html), for accessibility and SEO
- In TextGeometry
- In a CanvasTexture
> Real text stays readable by everyone and everything.

? What should happen for users with prefers-reduced-motion?
+ A static or gentler version of the experience
- Nothing
- Faster animation
> Respect the OS-level accessibility setting.
```

:::exercise Chapter dots
Add a progress indicator: four dots fixed on the right edge, with the dot for the current chapter (`Math.floor(scroll.offset * 4)`) highlighted. Hint: the dots must stay put while the page scrolls, so don't put them in `<Scroll html>`. Render them as plain DOM **outside** the Canvas, and colour them from a small component **inside** `ScrollControls` (it needs `useScroll`) through refs in `useFrame`, with no React state per frame.
:::

:::solution
```jsx run
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ScrollControls, useScroll } from "@react-three/drei";

// lives inside ScrollControls (it needs useScroll), but only writes to DOM nodes it was handed
function Progress({ dots, box }) {
  const scroll = useScroll();
  useFrame(() => {
    const chapter = Math.min(3, Math.floor(scroll.offset * 4));
    dots.current.forEach((d, i) => { if (d) d.style.background = i === chapter ? "var(--accent)" : "var(--border)"; });
    box.current.rotation.y = scroll.offset * Math.PI * 2;
  });
  return null;
}

export default function App() {
  const dots = useRef([]), box = useRef();
  return (
    <>
      <Canvas camera={{ position: [0, 0, 5] }}>
        <mesh ref={box}><boxGeometry args={[1.5, 1.5, 1.5]} /><meshNormalMaterial /></mesh>
        <ScrollControls pages={4}><Progress dots={dots} box={box} /></ScrollControls>
      </Canvas>
      {/* plain DOM outside the Canvas; pointer-events: none so scrolling still reaches the canvas */}
      <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none" }}>
        {[0, 1, 2, 3].map((i) => <span key={i} ref={(el) => { dots.current[i] = el; }} style={{ width: 10, height: 10, borderRadius: 99, background: "var(--border)" }} />)}
      </div>
    </>
  );
}
```
:::

:::keypoints
- Scroll storytelling = **scroll progress → animation progress**; drei's `ScrollControls` + `useScroll` do it in R3F.
- `range`, `curve` and `visible` split the page into chapters; damping keeps motion smooth.
- `<Scroll html>` keeps real HTML text in sync with the scene.
- Exploded views and camera fly-throughs are the classic product-page patterns.
- Respect accessibility (reduced motion, real text, natural scrolling) and mobile performance.
:::
