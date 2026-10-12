---
title: Choosing Your Stack & Building a Career
level: easy
time: 35
summary: Where three.js and R3F sit among web 3D options (Babylon.js, PlayCanvas, A-Frame, Needle, Spline, model-viewer, Cesium, Threlte/TresJS and engine exports), a decision guide with an interactive stack chooser, the same product viewer built three ways, and the roles, skills and portfolio that get you hired for 3D web work.
---

three.js is the most widely used web 3D library, but it isn't the only option, and picking the right tool is a senior skill. This lesson maps the landscape so you can choose (and defend) a stack, then looks at the careers this course prepares you for.

## The landscape

| Option | What it is | Choose it when |
|---|---|---|
| **three.js** | low-level-enough 3D library: scene graph, materials, loaders, WebGL + WebGPU renderers | you want full control, custom visuals, smallest dependency surface; any framework or none |
| **React Three Fiber** | React renderer for three.js + the pmndrs ecosystem (drei, rapier, xr, postprocessing, uikit) | your app is React; you want components, state and a huge ecosystem |
| **Threlte / TresJS** | three.js for **Svelte** / **Vue**, in the spirit of R3F | your app is Svelte or Vue |
| **Babylon.js** | complete engine (Microsoft-backed): physics, GUI, inspector, node material editor, WebXR, WebGPU | you want batteries included and an engine's tooling, especially for games and XR |
| **PlayCanvas** | engine with a collaborative **cloud editor**, also usable as an open-source library | teams with designers who want an editor; lightweight games and ads |
| **A-Frame** | HTML-like entity-component framework on top of three.js | quick WebXR prototypes, education, people who prefer HTML tags |
| **Needle Engine** | export from **Unity or Blender** to a three.js-based web runtime | your 3D team lives in Unity/Blender and you need web output with components |
| **Spline** | browser design tool with a web runtime/embeds (and React component) | designers building interactive 3D for marketing without code |
| **`<model-viewer>`** | Google web component: one tag for a glTF with AR, hotspots, variants | product viewers and AR quick-look, nothing custom |
| **CesiumJS / deck.gl / Mapbox / Google 3D Tiles** | geospatial 3D on a real-world globe/map | maps, digital earth, city twins (deck.gl and Mapbox interop with three.js) |
| **Unity / Unreal / Godot web exports** | full game engines building to WebAssembly + WebGL/WebGPU | porting an existing game; heavy downloads acceptable |

:::analogy Libraries vs engines
three.js is a **professional camera body**: it does exactly what you tell it, and you choose every lens. Babylon and PlayCanvas are **camera kits** with lenses, tripod and editing software included. model-viewer is a **phone camera**: point and shoot, great results, few knobs. Engine exports are **film studios**: astonishing, but you're shipping the whole studio to the viewer's browser.
:::

## Decision guide

```jsx run title="Stack chooser" level=easy height=520
import { useState } from "react";

const QUESTIONS = [
  { q: "What are you building?", a: [
    ["A product viewer with AR", { mv: 4, spline: 1 }],
    ["A custom, art-directed site or app", { three: 3, r3f: 3 }],
    ["A game", { babylon: 3, playcanvas: 3, r3f: 1, three: 1, engine: 2 }],
    ["Maps / geospatial", { geo: 5 }],
    ["A quick VR/AR prototype or lesson", { aframe: 4, r3f: 1, babylon: 1 }],
  ] },
  { q: "What does your team know?", a: [
    ["React", { r3f: 4 }], ["Vue or Svelte", { tres: 4 }], ["Plain JS / any", { three: 3, babylon: 1 }],
    ["Unity / Blender, little web", { needle: 4, engine: 2 }], ["Designers, no code", { spline: 4, mv: 2, playcanvas: 1 }],
  ] },
  { q: "How custom are the visuals?", a: [
    ["Standard: show the model nicely", { mv: 2, spline: 1, babylon: 1 }],
    ["Some custom effects", { r3f: 1, three: 1, babylon: 1, playcanvas: 1 }],
    ["Very: shaders, post-processing, unique look", { three: 3, r3f: 3 }],
  ] },
  { q: "Download budget?", a: [
    ["Tiny: must load instantly on mobile", { mv: 1, three: 2, r3f: 1 }],
    ["Normal web app", {}],
    ["Large is fine (installed-app feel)", { engine: 3, babylon: 1 }],
  ] },
];

const NAMES = {
  three: "three.js", r3f: "React Three Fiber", tres: "Threlte (Svelte) / TresJS (Vue)", babylon: "Babylon.js",
  playcanvas: "PlayCanvas", aframe: "A-Frame", needle: "Needle Engine", spline: "Spline", mv: "<model-viewer>",
  geo: "CesiumJS / deck.gl (+ three.js layers)", engine: "Unity / Unreal / Godot web export",
};

export default function App() {
  const [picks, setPicks] = useState({});
  const score = {};
  Object.entries(picks).forEach(([qi, ai]) =>
    Object.entries(QUESTIONS[qi].a[ai][1]).forEach(([k, v]) => (score[k] = (score[k] || 0) + v)));
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const max = ranked[0]?.[1] || 1;

  return (
    <div style={{ padding: 16, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", height: "100%", overflow: "auto", boxSizing: "border-box" }}>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        {QUESTIONS.map((Q, qi) => (
          <div key={qi}>
            <b style={{ fontSize: 13 }}>{Q.q}</b>
            <div className="row" style={{ marginTop: 6 }}>
              {Q.a.map(([label], ai) => (
                <button key={ai} className={picks[qi] === ai ? "on" : ""} style={{ fontSize: 12, padding: "4px 9px" }}
                  onClick={() => setPicks({ ...picks, [qi]: ai })}>{label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ alignSelf: "start", padding: 14, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)" }}>
        <b>Suggested stack</b>
        {ranked.length === 0 && <p className="muted">Answer the questions to see a recommendation.</p>}
        {ranked.map(([k, v], i) => (
          <div key={k} style={{ marginTop: 10 }}>
            <div style={{ fontSize: i ? 13 : 16, fontWeight: i ? 500 : 700 }}>{i + 1}. {NAMES[k]}</div>
            <div style={{ height: 6, borderRadius: 4, marginTop: 4, width: `${(v / max) * 100}%`, background: i ? "#a7f3d0" : "#059669" }} />
          </div>
        ))}
        {ranked.length > 0 && <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>A starting point, not a verdict: prototype the riskiest part in your top two choices before committing.</p>}
      </div>
    </div>
  );
}
```

Questions that decide most projects:

1. **What does the team already know?** React → R3F. Unity → Needle (or a Unity export). Designers only → Spline or model-viewer. Fighting your team's skills costs more than any library difference.
2. **How custom is it?** Showing a product well is a solved problem (model-viewer). A unique look needs three.js-level control.
3. **What's the budget for download and devices?** Engine exports are tens of MB; a three.js scene can be a few hundred KB plus assets.
4. **Who maintains it?** An agency microsite lives for months; a configurator or twin lives for years and needs tests, typed code and boring, popular dependencies.
5. **Is there a domain tool?** Maps → Cesium/deck.gl; BIM → That Open Engine; molecules → Mol*; medical → Cornerstone3D. Build *on* them (often with three.js layers) rather than from scratch.

## One product viewer, three ways

The same job (show a model, orbit it, offer AR) at three levels of abstraction.

**`<model-viewer>`**: one HTML tag. AR on Android (Scene Viewer/WebXR) and iOS (Quick Look, with a USDZ) comes free:

```js run title="<model-viewer>: one tag" level=easy height=400
// the official bundle (it includes its own copy of three.js)
import "https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js";

document.body.insertAdjacentHTML("beforeend", `
  <model-viewer
    src="https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf"
    alt="A damaged sci-fi helmet"
    camera-controls auto-rotate ar shadow-intensity="1" exposure="1.1"
    environment-image="neutral"
    style="width:100%;height:100%;background:#f1f5f9">
    <button slot="hotspot-visor" data-position="0 0.1 0.9" data-normal="0 0 1"
      style="font-size:11px;padding:3px 8px;border-radius:8px">Visor</button>
  </model-viewer>`);
```

**A-Frame**: HTML entities and components on top of three.js, with VR/AR buttons built in:

```js run title="A-Frame: HTML for 3D and XR" level=easy height=400
// A-Frame ships its own three.js build, so load it as a classic script
const s = document.createElement("script");
s.src = "https://aframe.io/releases/1.8.0/aframe.min.js";
s.onload = () => document.body.insertAdjacentHTML("beforeend", `
  <a-scene embedded style="width:100%;height:100%" renderer="colorManagement: true" vr-mode-ui="enabled: true">
    <a-assets>
      <a-asset-item id="helmet" src="https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf"></a-asset-item>
    </a-assets>
    <a-entity gltf-model="#helmet" position="0 1.4 -2.2" scale="0.8 0.8 0.8"
      animation="property: rotation; to: 0 360 0; loop: true; dur: 12000; easing: linear"></a-entity>
    <a-plane rotation="-90 0 0" width="8" height="8" color="#cbd5e1"></a-plane>
    <a-light type="ambient" intensity="0.6"></a-light>
    <a-light type="directional" position="2 4 2" intensity="1.6"></a-light>
    <a-sky color="#e0f2fe"></a-sky>
    <a-camera position="0 1.6 0"></a-camera>
  </a-scene>`);
document.head.append(s);
```

**React Three Fiber**: more code, but every pixel and behaviour is yours (custom materials, configurator logic, physics, post-processing, XR interactions), as you've seen throughout this course:

```jsx run title="R3F: full control" level=easy height=400
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF } from "@react-three/drei";

const URL = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf";
function Helmet() { return <primitive object={useGLTF(URL).scene} />; }

export default function App() {
  return (
    <Canvas shadows="percentage" camera={{ position: [0, 0, 4], fov: 40 }}>
      <color attach="background" args={["#f1f5f9"]} />
      <Suspense fallback={null}>
        <Stage environment="city" intensity={0.6} adjustCamera={1.6}><Helmet /></Stage>
      </Suspense>
      <OrbitControls autoRotate makeDefault />
    </Canvas>
  );
}
```

:::tip Mix, don't marry
These aren't exclusive. Big products often use **model-viewer** for simple catalogue pages and **R3F** for the flagship configurator; **deck.gl** for the map with a **three.js** layer for custom 3D; **Blender** (or AI generators) for assets and **three.js** at runtime. glTF is the common language that lets you swap tools.
:::

## Careers in 3D for the web

| Role | What you do | Emphasis |
|---|---|---|
| **Creative developer** | award-style sites, brand experiences, interactive campaigns | shaders, motion, GSAP, taste, performance |
| **3D web / product engineer** | configurators, viewers, editors, dashboards inside products | R3F/three.js, state, TypeScript, testing, asset pipelines |
| **XR developer** | WebXR training, retail AR, spatial apps | WebXR, interaction design, comfort, device performance |
| **Visualisation / digital-twin engineer** | twins, BIM, robotics, geospatial, scientific viz | data pipelines, real-time streams, domain formats (IFC, URDF, 3D Tiles) |
| **Technical artist** | bridge between art and code: materials, optimisation, pipelines | Blender, PBR, baking, glTF tooling, shaders |
| **Graphics / engine engineer** | renderers, WebGPU, libraries like three.js itself | linear algebra, GPU architecture, WGSL/GLSL, profiling |
| **Game developer (web)** | browser and casual games, playable ads | game loops, physics, controls, monetisation |

### A skills ladder

:::flow From learner to senior
Foundations | scene graph, cameras, materials, lighting, glTF, interaction (Modules 1–2)
Framework fluency | R3F + drei, state, events, performance, TypeScript (Modules 3–4)
A specialism | shaders & post, XR, physics & games, data/twins, or pipelines
Production | asset optimisation, profiling, accessibility, testing, CI/CD, monitoring
Senior | choosing stacks, budgeting performance, mentoring, shaping product decisions
:::

### A portfolio that gets interviews

- **3–5 polished, live projects** beat twenty tutorials. The Project Lab in this course is designed as portfolio material: extend each with your own twist.
- Each project gets a **short write-up**: the problem, your approach, a performance number ("60 fps on a 2019 Android, 1.2 MB total"), what you'd do next.
- Show the **range your target role needs**: a configurator and a dashboard for product roles; a shader piece and a scroll site for creative roles; a WebXR demo for XR roles.
- **Public code**: clean repos with READMEs; contributing a fix or example to three.js, drei or another pmndrs library is a strong signal.
- **Share the work**: the three.js forum's showcase, social posts with short screen recordings, CodeSandbox/StackBlitz demos.

### Keep learning

| Resource | For |
|---|---|
| **threejs.org** docs, manual and 500+ examples | the source of truth; read example source code |
| **pmndrs docs** (R3F, drei, xr, rapier, uikit) | the R3F ecosystem |
| **three.js forum** (discourse.threejs.org) and pmndrs Discord | help, showcases, jobs |
| **The Book of Shaders**, Inigo Quilez's articles | shader thinking, SDFs, noise |
| **Three.js Journey**, **Discover three.js** | structured courses |
| **Immersive Web Developer** (Meta), **WebXR samples** (immersive-web) | XR patterns |
| **Awwwards / FWA** | what great creative 3D looks like |
| **SIGGRAPH / GDC talks** | where real-time graphics techniques come from |

## Check yourself

```quiz
? Which is the best fit for "show a product glTF with AR on a catalogue page, with minimal code"?
+ <model-viewer>
- A Unity WebGL export
- A hand-written WebGPU renderer
> One tag gives orbit controls, AR and hotspots.

? Your team is all React and the product needs a custom 3D configurator. What's the natural choice?
+ React Three Fiber (with drei)
- A-Frame
- Spline only
> R3F lets the 3D scene share React state, components and tooling.

? What's the main cost of a Unity/Unreal web export compared with three.js?
+ Large downloads and startup time (engine runtime + WebAssembly)
- It can't render 3D
- It has no physics
> Great for porting games; heavy for a website.

? What is the common format that lets you mix tools (Blender, generators, model-viewer, three.js)?
+ glTF / GLB
- PSD
- MP4
> Standard assets keep you free to change runtime or authoring tools.

? What makes a portfolio project convincing?
+ A polished live demo with a short write-up including measured performance and decisions
- As many tutorial clones as possible
- Screenshots only
> Show judgement, not just output.
```

:::exercise Make a stack decision record
Pick a real or imagined project (a furniture shop's configurator, a museum's VR exhibit, a factory dashboard). Write a one-page **decision record**: context, options considered (at least three from this lesson), the decision, consequences (what gets easier, what gets harder), and the riskiest thing to prototype first.
:::

:::solution
Example for a furniture configurator:

- **Context**: React/Next.js storefront, 2 front-end developers, 40 products × ~10 options, must work on mid-range phones, AR wanted.
- **Options**: (1) `<model-viewer>` with variants; (2) R3F + drei; (3) a Spline embed.
- **Decision**: R3F for the configurator page; model-viewer for simple catalogue pages (shared GLBs).
- **Why**: options have rules and pricing that live in React state already; custom materials and camera moves are needed; the team knows React. model-viewer covers simple pages and AR quick-look with zero code.
- **Consequences**: more code to own than Spline; need an asset pipeline (gltf-transform, KTX2) and performance budget (≤ 3 MB per product, 60 fps on a Pixel 6a); AR via USDZ export for iOS.
- **Prototype first**: the heaviest product with all material variants on the slowest target phone, measuring load time and frame rate.
:::

:::keypoints
- three.js gives control; **R3F/Threlte/TresJS** fit it into frameworks; **Babylon/PlayCanvas** are full engines; **A-Frame**, **Spline** and **model-viewer** trade control for speed; **Needle** and engine exports bring Unity/Blender/Unreal content to the web; domain tools handle maps, BIM and medicine.
- Decide by **team skills, customisation, download budget, lifespan** and existing **domain tools**, and prototype the riskiest part first.
- **glTF** lets you mix tools freely.
- Roles: creative developer, 3D product engineer, XR developer, visualisation/twin engineer, technical artist, graphics engineer, web game developer. Build a small portfolio of polished, measured, written-up projects.
:::
