---
title: Car Configurator
level: intermediate
time: 60
icon: palette
cover: #dc2626,#0f172a
tags: R3F, glTF + Draco, MeshPhysicalMaterial, clearcoat, iridescence, transmission, CameraControls, environment maps, URL state
summary: A showroom-quality car configurator. Inspect a glTF to find its parts, then build paint colours and finishes (gloss, metallic, matte, pearl), rims, glass tint, studio and sunset environments, camera presets, a turntable, spinning wheels, live pricing, shareable links and snapshots.
---

Car makers were among the first to put 3D configurators online, and they set the bar: paint that looks wet, chrome that reflects the sky, smooth camera moves and instant feedback. This project builds one on the three.js example Ferrari model. The techniques transfer to any product: shoes, watches, furniture, machines.

:::flow How it fits together
Inspect | find part names in the glTF (body, rims, glass, wheels)
Assign | replace those parts' materials with your own, once
Configure | React state → material properties (colour, roughness, clearcoat…)
Present | environment lighting, contact shadow, camera presets, turntable
Convert | price, spec code, shareable URL, snapshot
:::

## Step 1: Find the parts

Every configurator starts by opening the model and learning its structure. Click any part of the car to see its object and material names. These names are your API for the rest of the project:

```js run title="Step 1 · Part inspector" height=440
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e2e8f0");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment()).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(4.5, 2, 5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.5, 0);

const draco = new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
const gltf = await new GLTFLoader().setDRACOLoader(draco)
  .loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/ferrari.glb");
const car = gltf.scene;
scene.add(car);

const info = document.createElement("div");
info.className = "overlay";
info.innerHTML = "Click a part of the car";
document.body.append(info);

// highlight = temporarily swap in an emissive copy of the part's material
let picked = null, original = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
renderer.domElement.addEventListener("click", (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(car)[0];
  if (picked) picked.material = original;
  if (!hit) { picked = null; info.innerHTML = "Click a part of the car"; return; }
  picked = hit.object;
  original = picked.material;
  picked.material = original.clone();
  picked.material.emissive = new THREE.Color("#22c55e");
  picked.material.emissiveIntensity = 0.6;
  const path = [];
  for (let o = picked; o && o !== car; o = o.parent) path.unshift(o.name || "(unnamed)");
  info.innerHTML = `<div><b>${picked.name || "(unnamed mesh)"}</b><br>material: <code>${original.name}</code><br>
    <span class="muted">path: ${path.join(" › ")}</span></div>`;
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

Useful findings: the paint is the object named **`body`**, the four rims are **`rim_fl/fr/rl/rr`**, the windows are **`glass`**, and the spinning parts are the groups **`wheel_fl/fr/rl/rr`**. Model files from a 3D artist should come with names like these; agree on a naming convention before modelling starts.

:::tip Ask for configurator-ready models
Separate meshes (or material slots) for every configurable part, sensible names, real-world scale in metres, the car's origin on the ground at its centre, and a baked ambient-occlusion shadow texture. This model ships with one (`ferrari_ao.png`), which is cheaper and softer than real-time shadows.
:::

## Step 2: The complete configurator

```jsx run title="Car Configurator · complete app" level=intermediate height=620
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useTexture, Environment, CameraControls, useProgress } from "@react-three/drei";

const EX = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/";
const DRACO = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";

// ---------- catalogue (would come from your product API) ----------
const PAINTS = [
  { id: "red", name: "Racing Red", color: "#9b0c0c", price: 0 },
  { id: "yellow", name: "Sun Yellow", color: "#e8a900", price: 4500 },
  { id: "blue", name: "Midnight Blue", color: "#122545", price: 4500 },
  { id: "white", name: "Pearl White", color: "#e9e9e6", price: 3000 },
  { id: "black", name: "Deep Black", color: "#0a0a0c", price: 3000 },
  { id: "green", name: "British Green", color: "#0e3a2b", price: 6000 },
];
const FINISHES = [
  { id: "gloss", name: "Gloss", price: 0, mat: { metalness: 0.5, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0 } },
  { id: "metal", name: "Metallic", price: 3500, mat: { metalness: 1, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0 } },
  { id: "matte", name: "Matte", price: 9000, mat: { metalness: 0.3, roughness: 0.7, clearcoat: 0, clearcoatRoughness: 0, iridescence: 0 } },
  { id: "pearl", name: "Pearl", price: 12000, mat: { metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 1 } },
];
const RIMS = [
  { id: "chrome", name: "Chrome", color: "#ffffff", metalness: 1, roughness: 0.04, price: 0 },
  { id: "gun", name: "Gunmetal", color: "#43474d", metalness: 1, roughness: 0.3, price: 2200 },
  { id: "gold", name: "Gold", color: "#c9a24a", metalness: 1, roughness: 0.2, price: 3800 },
  { id: "black", name: "Gloss black", color: "#0d0d0d", metalness: 0.4, roughness: 0.15, price: 1800 },
];
const GLASS = [
  { id: "clear", name: "Clear", color: "#ffffff", transmission: 1, price: 0 },
  { id: "smoke", name: "Smoked", color: "#8d96a0", transmission: 0.85, price: 900 },
  { id: "dark", name: "Privacy", color: "#2b2f35", transmission: 0.6, price: 1400 },
];
const VIEWS = {
  Hero: [-5.6, 1.8, -6.4, 0, 0.5, 0], Front: [0, 1.2, -7.6, 0, 0.6, 0], Side: [8, 1.2, 0, 0, 0.6, 0],
  Rear: [0, 1.7, 7.6, 0, 0.6, 0], Top: [0.01, 10, 0, 0, 0, 0], Wheel: [3.4, 0.8, -3.4, 0.8, 0.35, -1.3],
};
const BASE = 249000;
const DEFAULT = { paint: "red", finish: "gloss", rim: "chrome", glass: "clear", env: "studio" };
const by = (list, id) => list.find((x) => x.id === id) ?? list[0];

// ---------- URL state: #paint=blue&finish=metal… ----------
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  return Object.fromEntries(Object.keys(DEFAULT).map((k) => [k, q.get(k) ?? DEFAULT[k]]));
}
function writeHash(cfg) {
  try { history.replaceState(null, "", "#" + new URLSearchParams(cfg)); } catch {} // blocked in some sandboxes
}

// ---------- the car ----------
function Car({ cfg, drive }) {
  const { scene } = useGLTF(EX + "models/gltf/ferrari.glb", DRACO);
  const ao = useTexture(EX + "models/gltf/ferrari_ao.png");

  // our own materials, created once and assigned to the named parts
  const mats = useMemo(() => ({
    body: new THREE.MeshPhysicalMaterial({ iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600] }),
    rim: new THREE.MeshStandardMaterial(),
    glass: new THREE.MeshPhysicalMaterial({ roughness: 0, metalness: 0.2, ior: 1.5, thickness: 0.02 }),
  }), []);
  const wheels = useMemo(() => {
    scene.getObjectByName("body").material = mats.body;
    ["rim_fl", "rim_fr", "rim_rl", "rim_rr"].forEach((n) => (scene.getObjectByName(n).material = mats.rim));
    scene.getObjectByName("glass").material = mats.glass;
    return ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"].map((n) => scene.getObjectByName(n));
  }, [scene, mats]);

  // configuration → material properties (mutate; never re-create per change)
  useEffect(() => {
    const paint = by(PAINTS, cfg.paint), fin = by(FINISHES, cfg.finish), rim = by(RIMS, cfg.rim), gl = by(GLASS, cfg.glass);
    mats.body.color.set(paint.color);
    Object.assign(mats.body, fin.mat);
    mats.rim.color.set(rim.color);
    Object.assign(mats.rim, { metalness: rim.metalness, roughness: rim.roughness });
    mats.glass.color.set(gl.color);
    mats.glass.transmission = gl.transmission;
  }, [cfg, mats]);

  useFrame((_, dt) => {
    if (drive) wheels.forEach((w) => (w.rotation.x -= dt * 12));
  });

  return (
    <group>
      <primitive object={scene} />
      {/* baked soft shadow: a plane multiplied over whatever is beneath */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.002} renderOrder={2}>
        <planeGeometry args={[0.655 * 4, 1.3 * 4]} />
        <meshBasicMaterial map={ao} blending={THREE.MultiplyBlending} toneMapped={false} transparent premultipliedAlpha />
      </mesh>
    </group>
  );
}

function Rig({ controls, spin }) {
  useFrame((_, dt) => {
    if (spin && controls.current) controls.current.azimuthAngle += dt * 0.25;
  });
  return null;
}

// shift the framing left so the car isn't hidden behind the options panel
function FocalOffset({ controls }) {
  useEffect(() => { controls.current?.setFocalOffset(1.1, 0, 0, false); }, [controls]);
  return null;
}

function Loading() {
  const { active, progress } = useProgress();
  return active ? <div className="overlay bottom">Loading car… {progress.toFixed(0)}%</div> : null;
}

// ---------- UI pieces ----------
const Swatches = ({ items, value, onPick }) => (
  <div className="row">
    {items.map((it) => (
      <button key={it.id} title={`${it.name}${it.price ? ` (+$${it.price.toLocaleString()})` : ""}`} onClick={() => onPick(it.id)}
        style={{ width: 28, height: 28, padding: 0, borderRadius: "50%", background: it.color,
          outline: value === it.id ? "2px solid var(--accent)" : "none", outlineOffset: 2 }} />
    ))}
  </div>
);
const Segments = ({ items, value, onPick }) => (
  <div className="row">{items.map((it) => (
    <button key={it.id} className={value === it.id ? "on" : ""} onClick={() => onPick(it.id)} style={{ fontSize: 12, padding: "4px 9px" }}>{it.name}</button>
  ))}</div>
);
const Section = ({ title, note, children }) => (
  <div><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>{title} <span className="muted" style={{ fontWeight: 400 }}>{note}</span></div>{children}</div>
);

export default function App() {
  const [cfg, setCfg] = useState(readHash);
  const [drive, setDrive] = useState(false);
  const [spin, setSpin] = useState(true);
  const controls = useRef();
  const gl = useRef();
  const set = (k) => (v) => setCfg((c) => ({ ...c, [k]: v }));
  useEffect(() => writeHash(cfg), [cfg]);

  const parts = [by(PAINTS, cfg.paint), by(FINISHES, cfg.finish), by(RIMS, cfg.rim), by(GLASS, cfg.glass)];
  const total = BASE + parts.reduce((s, p) => s + p.price, 0);
  const code = parts.map((p) => p.id.slice(0, 3).toUpperCase()).join("-");

  const view = (name) => { setSpin(false); controls.current?.setLookAt(...VIEWS[name], true); };
  const snapshot = () => {
    const a = document.createElement("a");
    a.href = gl.current.domElement.toDataURL("image/png");
    a.download = `car-${code}.png`;
    a.click();
  };

  return (
    <>
      <Canvas camera={{ position: VIEWS.Hero.slice(0, 3), fov: 38 }} gl={{ preserveDrawingBuffer: true, toneMapping: THREE.AgXToneMapping }}
        onCreated={(s) => (gl.current = s.gl)}>
        {cfg.env === "studio" ? (
          <>
            <color attach="background" args={["#1c1d21"]} />
            <Environment preset="studio" environmentIntensity={0.9} />
            <mesh rotation-x={-Math.PI / 2}><circleGeometry args={[9, 64]} /><meshBasicMaterial color="#26282d" /></mesh>
          </>
        ) : (
          <Environment files={EX + "textures/equirectangular/venice_sunset_1k.hdr"} ground={{ height: 5, radius: 40, scale: 20 }} />
        )}
        <Suspense fallback={null}>
          <Car cfg={cfg} drive={drive} />
        </Suspense>
        <CameraControls ref={controls} minDistance={2.5} maxDistance={14} maxPolarAngle={Math.PI / 2 - 0.05}
          onStart={() => setSpin(false)} />
        <FocalOffset controls={controls} />
        <Rig controls={controls} spin={spin} />
      </Canvas>
      <Loading />

      <div className="overlay right" style={{ width: 250, maxHeight: "calc(100% - 20px)", overflow: "auto", gap: 12 }}>
        <Section title="Paint" note={by(PAINTS, cfg.paint).name}><Swatches items={PAINTS} value={cfg.paint} onPick={set("paint")} /></Section>
        <Section title="Finish"><Segments items={FINISHES} value={cfg.finish} onPick={set("finish")} /></Section>
        <Section title="Rims" note={by(RIMS, cfg.rim).name}><Swatches items={RIMS} value={cfg.rim} onPick={set("rim")} /></Section>
        <Section title="Glass"><Segments items={GLASS} value={cfg.glass} onPick={set("glass")} /></Section>
        <Section title="Scene"><Segments items={[{ id: "studio", name: "Studio" }, { id: "sunset", name: "Sunset" }]} value={cfg.env} onPick={set("env")} /></Section>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <div className="muted" style={{ fontSize: 11 }}>{code}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>${total.toLocaleString()}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={snapshot}>Snapshot</button>
            <button onClick={() => navigator.clipboard?.writeText(location.href).catch(() => {})}>Copy link</button>
          </div>
        </div>
      </div>

      <div className="overlay bottom" style={{ maxWidth: "calc(100% - 290px)" }}>
        <div className="row">
          {Object.keys(VIEWS).map((v) => <button key={v} onClick={() => view(v)} style={{ fontSize: 12, padding: "4px 9px" }}>{v}</button>)}
          <button className={spin ? "on" : ""} onClick={() => setSpin(!spin)} style={{ fontSize: 12, padding: "4px 9px" }}>Turntable</button>
          <button className={drive ? "on" : ""} onClick={() => setDrive(!drive)} style={{ fontSize: 12, padding: "4px 9px" }}>Drive</button>
        </div>
      </div>
    </>
  );
}
```

## How it works

| Feature | Technique |
|---|---|
| loading | `useGLTF(url, dracoDecoderPath)`: drei sets up the `DRACOLoader`; the model is cached, so remounts are free |
| part materials | created **once** with `useMemo`, assigned to named parts with `getObjectByName`; an effect copies the configuration into them, so changing paint never recompiles shaders unnecessarily |
| car paint | `MeshPhysicalMaterial`: `clearcoat` adds the lacquer layer; `metalness` + `roughness` give gloss/metallic/matte; **pearl** uses `iridescence` (thin-film interference) for colour shifting with angle |
| glass | `transmission` (physically based refraction, rendered from a transmission pass) tinted by `color` |
| soft shadow | a baked AO texture on a plane with `MultiplyBlending`: free, soft and stable |
| environments | studio `preset` HDR + a dark floor, or an HDR with `ground` projection so the car sits *in* the photo |
| tone mapping | `AgXToneMapping` keeps saturated paint colours from shifting in highlights |
| camera | `CameraControls.setLookAt(..., true)` animates smoothly between presets; `setFocalOffset` shifts the framing so the car isn't behind the panel; a tiny `Rig` turns `azimuthAngle` for the turntable, stopped by `onStart` when the user grabs the view |
| wheels | the `wheel_*` groups rotate around their local x axis in `useFrame` |
| pricing & code | derived from state each render, never stored |
| sharing | configuration in the URL hash (`URLSearchParams`), read on load; snapshot via `toDataURL` with `preserveDrawingBuffer` |

:::warn Physical materials cost GPU time
`transmission` adds an extra render pass, and `clearcoat` and `iridescence` add shader work. On a configurator page that's usually fine, but measure on mid-range phones. Use `PerformanceMonitor` to fall back to plain `transparent` glass and simpler paint when frame rates drop.
:::

:::exercise Extend it
1. Add **brake calipers** (the `brake` meshes) with their own colour swatches, plus a rule: gold rims are only available with black or yellow calipers.
2. Add an **interior view**: a camera preset inside the cabin, with a leather colour option for the `leather` material.
3. Turn on the **headlights** at sunset: make the `lights` material emissive and add bloom with `@react-three/postprocessing`.
4. Add **AR**: export the configured car with `GLTFExporter` and open it in `<model-viewer ar>` (see Lesson 6.9), or place it with WebXR hit-testing (Lesson 5.6).
5. Preload the HDRs and show a **side-by-side compare** of two saved configurations.
:::

:::keypoints
- A configurator starts with **inspecting the model**: named parts are the contract between artists and developers.
- Create materials **once** and drive their properties from state; don't rebuild per click.
- `MeshPhysicalMaterial` features (clearcoat, iridescence, transmission) sell premium finishes, at a GPU cost to measure.
- A baked AO shadow, an HDR environment and good tone mapping do more for realism than any other feature.
- Camera presets, turntable, price, URL state and snapshots turn a 3D viewer into a sales tool.
:::
