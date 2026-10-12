---
title: 3D Scroll Portfolio
level: intermediate
time: 60
icon: rocket
cover: #6366f1,#ec4899
tags: native scroll, section keyframes, maath easing, MeshDistortMaterial, drei View, prefers-reduced-motion, sticky nav
summary: A creative developer's one-page portfolio. A hero object flows between per-section keyframes as you scroll, project cards have live 3D thumbnails sharing one WebGL context, and a sticky nav highlights the current section. It is built on native scrolling so keyboard, find-in-page, links and screen readers all keep working, and it respects reduced-motion settings.
---

Your portfolio is often the first three.js project an employer sees, so it should show both **craft** (motion, materials, polish) and **judgement** (fast, accessible, real HTML). This one keeps the page a normal scrolling document and puts the 3D *behind* it, synchronised to scroll position.

:::flow How it fits together
HTML page | real sections, headings, links: scrolls natively
Progress | scroll position → continuous section index `s` (e.g. 1.4 = 40% from About to Work)
Keyframes | each section defines where the hero object is, its size, colour, distortion
Blend + damp | interpolate between the two nearest keyframes, then ease towards it every frame
Views | project cards render small 3D scenes into their own rectangles of the same canvas
:::

## Step 1: Section-aware scroll progress

Dividing `scrollTop` by the total height breaks as soon as sections have different heights. Measure each section's top instead and compute **which section you're in and how far through it**:

```jsx run title="Step 1 · Continuous section index from native scroll" height=380
import { useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { easing } from "maath";

const KEYS = [
  { x: 1.5, color: "#6366f1" },
  { x: -1.5, color: "#ec4899" },
  { x: 1.5, color: "#f59e0b" },
];

// which section are we in, and how far through it? → e.g. 1.25
function sectionProgress(scroller, sections) {
  const top = scroller.scrollTop;
  for (let i = sections.length - 1; i >= 0; i--) {
    const start = sections[i].offsetTop;
    if (top >= start || i === 0) {
      const next = sections[i + 1]?.offsetTop ?? start + 1;
      return Math.min(i + Math.max(0, (top - start) / (next - start)), sections.length - 1);
    }
  }
}

function Cube({ scroller, sections, label }) {
  const mesh = useRef();
  const target = new THREE.Color();
  useFrame((_, dt) => {
    const s = sectionProgress(scroller.current, sections.current);
    const i = Math.floor(s), t = THREE.MathUtils.smoothstep(s - i, 0, 1);
    const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
    easing.damp(mesh.current.position, "x", THREE.MathUtils.lerp(a.x, b.x, t), 0.2, dt);
    easing.dampC(mesh.current.material.color, target.set(a.color).lerp(new THREE.Color(b.color), t), 0.2, dt);
    mesh.current.rotation.set(s * 2, s * 3, 0);
    label.current.textContent = `s = ${s.toFixed(2)}`;
  });
  return <mesh ref={mesh}><boxGeometry /><meshStandardMaterial /></mesh>;
}

export default function App() {
  const scroller = useRef(), sections = useRef([]), label = useRef();
  return (
    <div ref={scroller} style={{ height: "100%", overflowY: "auto", position: "relative" }}>
      <Canvas style={{ position: "fixed", inset: 0, pointerEvents: "none" }} camera={{ position: [0, 0, 5] }}>
        <ambientLight intensity={0.6} /><directionalLight position={[2, 3, 4]} intensity={2} />
        <Cube scroller={scroller} sections={sections} label={label} />
      </Canvas>
      <div ref={label} className="overlay right" style={{ position: "fixed", fontFamily: "monospace" }} />
      {["One (tall)", "Two", "Three"].map((t, i) => (
        <section key={t} ref={(el) => (sections.current[i] = el)}
          style={{ position: "relative", minHeight: i === 0 ? "160vh" : "100vh", padding: 24, borderTop: "1px dashed #cbd5e1" }}>
          <h2 style={{ margin: 0, width: "45%", marginLeft: i === 1 ? "50%" : 0 }}>Section {t}</h2>
        </section>
      ))}
    </div>
  );
}
```

Section one is 1.6 screens tall and the others are one, yet `s` still moves exactly from 0 to 1 across section one. That's what makes per-section keyframes reliable.

## Step 2: The complete portfolio

```jsx run title="3D Scroll Portfolio · complete app" level=intermediate height=600
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { View, PerspectiveCamera, Environment, MeshDistortMaterial, Sparkles } from "@react-three/drei";
import { easing } from "maath";

const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const NAV = ["Home", "About", "Work", "Skills", "Contact"];
// where the hero object goes in each section
const KEYS = [
  { pos: [1.7, 0, 0], scale: 1.2, color: "#6366f1", distort: 0.35 },
  { pos: [-2.0, 0.1, -0.5], scale: 0.95, color: "#ec4899", distort: 0.55 },
  { pos: [0, -2.3, -2.5], scale: 0.6, color: "#f59e0b", distort: 0.2 },     // tucked below the cards
  { pos: [1.9, -0.1, 0], scale: 1.05, color: "#10b981", distort: 0.1, wire: true },
  { pos: [0, -1.9, -1], scale: 1.3, color: "#8b5cf6", distort: 0.45 },      // rises under the call to action
];
const PROJECTS = [
  { title: "Orbit", text: "A solar-system explorer with real orbital data and follow-cam navigation.", tags: ["three.js", "CSS2D"], kind: "planet" },
  { title: "Showroom", text: "A car configurator with clearcoat paint, HDR scenes and shareable builds.", tags: ["R3F", "PBR"], kind: "knot" },
  { title: "Twin", text: "A robot-arm digital twin with inverse kinematics and live telemetry.", tags: ["IK", "Telemetry"], kind: "stack" },
];
const SKILLS = ["three.js", "React Three Fiber", "GLSL & TSL", "WebXR", "GSAP", "Blender", "TypeScript", "Performance"];

function sectionProgress(scroller, sections) {
  const top = scroller.scrollTop;
  for (let i = sections.length - 1; i >= 0; i--) {
    const start = sections[i].offsetTop;
    if (top >= start || i === 0) {
      const next = sections[i + 1]?.offsetTop ?? start + 1;
      return Math.min(i + Math.max(0, (top - start) / (next - start)), sections.length - 1);
    }
  }
}

// ---------- background hero scene ----------
function Hero({ scroller, sections }) {
  const mesh = useRef(), mat = useRef();
  const tmp = useMemo(() => ({ pos: new THREE.Vector3(), b: new THREE.Vector3(), color: new THREE.Color(), c2: new THREE.Color() }), []);
  useFrame((state, dt) => {
    const s = sectionProgress(scroller.current, sections.current);
    const i = Math.floor(s), t = THREE.MathUtils.smoothstep(s - i, 0, 1);
    const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
    tmp.pos.fromArray(a.pos).lerp(tmp.b.fromArray(b.pos), t);
    tmp.color.set(a.color).lerp(tmp.c2.set(b.color), t);
    const smooth = REDUCE ? 0 : 0.3;                       // reduced motion: jump straight to the pose
    easing.damp3(mesh.current.position, tmp.pos, smooth, dt);
    easing.damp3(mesh.current.scale, THREE.MathUtils.lerp(a.scale, b.scale, t), smooth, dt);
    easing.dampC(mat.current.color, tmp.color, smooth, dt);
    easing.damp(mat.current, "distort", THREE.MathUtils.lerp(a.distort, b.distort, t), smooth, dt);
    mat.current.wireframe = Math.round(s) === 3;
    if (!REDUCE) mesh.current.rotation.y += dt * 0.25;
    mesh.current.rotation.x = s * 0.6;
    // gentle parallax towards the pointer
    easing.damp3(state.camera.position, [state.pointer.x * 0.35, state.pointer.y * 0.25, 6], smooth, dt);
    state.camera.lookAt(0, 0, 0);
  });
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 6]} fov={45} />
      <Environment preset="city" environmentIntensity={0.8} />
      <directionalLight position={[3, 4, 5]} intensity={1.5} />
      <mesh ref={mesh}>
        <icosahedronGeometry args={[1, 48]} />
        <MeshDistortMaterial ref={mat} speed={REDUCE ? 0 : 1.6} roughness={0.15} metalness={0.2} />
      </mesh>
      {!REDUCE && <Sparkles count={70} scale={[10, 6, 4]} size={2.5} speed={0.3} color="#c7d2fe" />}
    </>
  );
}

// ---------- 3D thumbnails for the project cards ----------
function Thumb({ kind }) {
  const g = useRef();
  useFrame((_, dt) => { if (!REDUCE) g.current.rotation.y += dt * 0.5; });
  return (
    <>
      <color attach="background" args={["#161827"]} />
      <PerspectiveCamera makeDefault position={[0, 0.6, 3.4]} fov={40} onUpdate={(c) => c.lookAt(0, 0, 0)} />
      <Environment preset="city" />
      <group ref={g}>
        {kind === "planet" && (<>
          <mesh><sphereGeometry args={[0.7, 48, 24]} /><meshStandardMaterial color="#d8b383" roughness={0.8} /></mesh>
          <mesh rotation-x={-1.2}><ringGeometry args={[0.95, 1.4, 64]} /><meshStandardMaterial color="#e5d3a8" side={THREE.DoubleSide} transparent opacity={0.7} /></mesh>
        </>)}
        {kind === "knot" && <mesh><torusKnotGeometry args={[0.55, 0.2, 200, 32]} /><meshPhysicalMaterial color="#b91c1c" metalness={0.6} roughness={0.25} clearcoat={1} /></mesh>}
        {kind === "stack" && [0, 1, 2].map((k) => (
          <mesh key={k} position-y={k * 0.42 - 0.42} rotation-y={k * 0.5}><boxGeometry args={[1 - k * 0.2, 0.36, 1 - k * 0.2]} /><meshStandardMaterial color={["#334155", "#f59e0b", "#f59e0b"][k]} metalness={0.3} roughness={0.4} /></mesh>
        ))}
      </group>
    </>
  );
}

// ---------- page ----------
const sectionStyle = (side) => ({
  position: "relative", minHeight: "100vh", padding: "84px 28px 40px", display: "flex", flexDirection: "column", justifyContent: "center",
  alignItems: side === "right" ? "flex-end" : side === "center" ? "center" : "flex-start", textAlign: side === "center" ? "center" : "left",
});
const col = { maxWidth: 380 };
const h2 = { fontSize: 30, margin: "0 0 10px", letterSpacing: "-0.02em" };

export default function App() {
  const scroller = useRef(), sections = useRef([]), bar = useRef();
  const [active, setActive] = useState(0);
  const sec = (i) => (el) => (sections.current[i] = el);
  const go = (i) => sections.current[i].scrollIntoView({ behavior: REDUCE ? "auto" : "smooth" });

  const onScroll = () => {
    const el = scroller.current;
    bar.current.style.transform = `scaleX(${el.scrollTop / (el.scrollHeight - el.clientHeight)})`;
    const i = Math.round(sectionProgress(el, sections.current));
    if (i !== active) setActive(i);                       // React state only when the section changes
  };

  return (
    <div ref={scroller} onScroll={onScroll} style={{ height: "100%", overflowY: "auto", position: "relative", background: "radial-gradient(circle at 70% 20%, #1e1b4b, #0b0b14 60%)", color: "#e5e7eb" }}>
      {/* the hero scene renders into a fixed, full-size View behind the content */}
      <View index={0} style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <Hero scroller={scroller} sections={sections} />
      </View>

      <nav style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", gap: 4, alignItems: "center", padding: "10px 16px", background: "rgba(11,11,20,.55)", backdropFilter: "blur(10px)" }}>
        <b style={{ marginRight: "auto", letterSpacing: "0.04em" }}>RIN·OKADA</b>
        {NAV.map((n, i) => (
          <a key={n} href={`#${n.toLowerCase()}`} onClick={(e) => { e.preventDefault(); go(i); }}
            style={{ color: i === active ? "#fff" : "#9ca3af", textDecoration: "none", fontSize: 13, padding: "4px 8px", borderRadius: 8, background: i === active ? "rgba(99,102,241,.35)" : "none" }}>{n}</a>
        ))}
        <div ref={bar} style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: "100%", background: "linear-gradient(90deg,#6366f1,#ec4899)", transformOrigin: "0 0", transform: "scaleX(0)" }} />
      </nav>

      <main style={{ position: "relative", zIndex: 1, marginTop: -52 }}>
        <section id="home" ref={sec(0)} style={sectionStyle("left")}>
          <div style={col}>
            <p style={{ color: "#a5b4fc", margin: 0, fontWeight: 600 }}>Creative developer</p>
            <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: "8px 0 14px", letterSpacing: "-0.03em" }}>I build interactive 3D for the web.</h1>
            <p style={{ color: "#cbd5e1" }}>Product configurators, digital twins and award-style sites with three.js and React Three Fiber.</p>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="primary" onClick={() => go(2)}>See my work</button>
              <button onClick={() => go(4)} style={{ background: "transparent", color: "#e5e7eb" }}>Get in touch</button>
            </div>
          </div>
        </section>

        <section id="about" ref={sec(1)} style={sectionStyle("right")}>
          <div style={col}>
            <h2 style={h2}>About</h2>
            <p style={{ color: "#cbd5e1" }}>I turn complex things (machines, products, data) into experiences people can explore. I care about frame rates as much as typography.</p>
            <div className="row" style={{ gap: 22, marginTop: 8 }}>
              {[["6", "years"], ["40+", "launches"], ["60", "fps budget"]].map(([n, l]) => <div key={l}><div style={{ fontSize: 26, fontWeight: 700 }}>{n}</div><div style={{ color: "#9ca3af", fontSize: 12 }}>{l}</div></div>)}
            </div>
          </div>
        </section>

        <section id="work" ref={sec(2)} style={sectionStyle("center")}>
          <h2 style={h2}>Selected work</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, width: "100%", maxWidth: 760, textAlign: "left" }}>
            {PROJECTS.map((p) => (
              <article key={p.title} style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: 10, background: "rgba(15,16,30,.5)" }}>
                <View style={{ height: 140, borderRadius: 10, overflow: "hidden" }}><Thumb kind={p.kind} /></View>
                <h3 style={{ margin: "10px 0 4px", fontSize: 16 }}>{p.title}</h3>
                <p style={{ margin: 0, color: "#9ca3af", fontSize: 12.5 }}>{p.text}</p>
                <div className="row" style={{ marginTop: 8 }}>{p.tags.map((t) => <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,.25)" }}>{t}</span>)}</div>
              </article>
            ))}
          </div>
        </section>

        <section id="skills" ref={sec(3)} style={sectionStyle("left")}>
          <div style={col}>
            <h2 style={h2}>Toolkit</h2>
            <div className="row">{SKILLS.map((s) => <span key={s} style={{ padding: "6px 12px", borderRadius: 99, border: "1px solid rgba(255,255,255,.18)", fontSize: 13 }}>{s}</span>)}</div>
          </div>
        </section>

        <section id="contact" ref={sec(4)} style={sectionStyle("center")}>
          <h2 style={{ ...h2, fontSize: 38 }}>Let's build something.</h2>
          <p style={{ color: "#cbd5e1" }}>Available for freelance and full-time roles.</p>
          <a href="mailto:hello@example.com" style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>hello@example.com</a>
          <p style={{ color: "#6b7280", fontSize: 12, marginTop: 40 }}>Built with React Three Fiber · respects prefers-reduced-motion</p>
        </section>
      </main>

      {/* ONE canvas for the hero and every thumbnail */}
      <Canvas eventSource={scroller} style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <View.Port />
      </Canvas>
    </div>
  );
}
```

## How it works

| Feature | Technique |
|---|---|
| native scrolling | the page is a normal scroll container with real sections, headings and links. Keyboard, find-in-page, screen readers and anchor links all work (on a full site, use `window` scroll the same way) |
| progress | `sectionProgress()` measures section tops, so sections can be any height |
| choreography | one keyframe per section (position, scale, colour, distortion, wireframe); blend the two nearest with smoothstep |
| smoothing | `maath/easing` `damp3`/`dampC`/`damp` ease every property towards its target, frame-rate independently |
| background scene | a `View` fixed to the viewport (`index={0}` draws it first), with a `MeshDistortMaterial` blob, sparkles and pointer parallax |
| card thumbnails | each card holds its own `View` with its own camera and background: one WebGL context for everything |
| nav | sticky header; active link from the same progress function, but React state changes **only when the section changes**, not every frame; the progress bar is a ref-driven `scaleX` |
| accessibility | real text, `prefers-reduced-motion` disables idle animation, smoothing, sparkles and smooth scrolling |

:::tip Make it yours
A portfolio is a design project. Replace the blob with something that says who you are (a model of your desk, your initials in 3D text, a shader that reacts to sound), but keep the bones: real HTML, a stable frame rate on phones, and fast loading. Put the heavy 3D in the hero and keep the rest light.
:::

:::exercise Extend it
1. Replace the blob with a **glTF** of your own, and give each section a camera move as well as an object move.
2. Make each project card **clickable**: open a case-study overlay, and fly the hero object into the card's position as a transition.
3. Add **dark/light themes** that switch both the CSS and the 3D colours from the same tokens.
4. Lazy-render thumbnails: pause each `View`'s animation when its card is off-screen (`IntersectionObserver` → a `visible` prop), and use `frameloop="demand"` with `invalidate()` when nothing moves.
5. Measure it: Lighthouse performance ≥ 90 and a 60 fps scroll on a mid-range phone. Write both numbers in your README.
:::

:::keypoints
- Keep the page **native HTML** and sync the 3D to scroll position; it's better for users, SEO and accessibility than hijacking scroll.
- Compute a **continuous section index** from section offsets, so keyframes line up with content of any height.
- Blend keyframes and **damp** every property for buttery, frame-rate-independent motion.
- drei **`View`** draws the hero and every thumbnail into **one** canvas.
- Respect **`prefers-reduced-motion`**, and only touch React state when something meaningful changes.
:::
