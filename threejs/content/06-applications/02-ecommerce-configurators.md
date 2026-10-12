---
title: E-commerce — Product Viewers & Configurators
level: intermediate
time: 40
summary: Why retailers and manufacturers build 3D configurators, the architecture behind them (product data, option rules, pricing, materials, URL state, snapshots, AR hand-off), a complete working configurator with constraints and a shareable link, asset and performance budgets, and the metrics that justify the investment.
---

Configurable products (sofas in 40 fabrics, sneakers with custom colourways, cars with paint and wheel packages, industrial machines with optional modules) can't be photographed in every combination: five colours × three materials × four options is already 60 photos per product. A 3D configurator renders any combination on demand, shows exactly what the customer will receive, and can hand the model to AR so they see it in their room. Done well, it raises conversion and lowers returns, which is why it's the most common paid three.js work.

## The architecture

:::flow A configurator, end to end
Product data | options, rules, prices from the catalogue/PIM (not hard-coded)
Configuration state | one plain object: { frame: "oak", fabric: "sage", base: "legs" }
Rules engine | valid combinations, defaults, constraints (pure functions)
3D view | maps state → model parts, materials, visibility
Outputs | price, URL to share, screenshot, AR model, order payload
:::

Keep these layers separate. The 3D view should **read** a configuration and render it; it shouldn't decide prices or rules. Then the same configuration drives the cart, the share link, the PDF quote and the factory order, and the rules are trivially testable.

## A complete configurator

A lounge chair with frame finish, fabric, base type and an optional cushion. Notice the rule: the **swivel base requires a metal frame**, so choosing it changes the frame automatically and the incompatible options are disabled. The URL updates as you configure, so the link always reproduces the chair.

```jsx run title="Lounge chair configurator: rules, price, share link, snapshot" level=intermediate height=520
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, ContactShadows, OrbitControls, RoundedBox } from "@react-three/drei";
import { easing } from "maath";

// ---------- product data (in production: from your catalogue API) ----------
const OPTIONS = {
  frame: { label: "Frame", choices: { oak: { name: "Oak", price: 0, color: "#b7895b", metal: false }, walnut: { name: "Walnut", price: 120, color: "#5b3a24", metal: false }, steel: { name: "Black steel", price: 80, color: "#1f2937", metal: true } } },
  fabric: { label: "Fabric", choices: { sage: { name: "Sage", price: 0, color: "#8fae8b" }, rust: { name: "Rust", price: 0, color: "#b4532a" }, navy: { name: "Navy", price: 40, color: "#1e3a5f" }, oat: { name: "Oat bouclé", price: 90, color: "#e7dccb" } } },
  base: { label: "Base", choices: { legs: { name: "Four legs", price: 0 }, swivel: { name: "Swivel", price: 150 } } },
  cushion: { label: "Lumbar cushion", choices: { none: { name: "None", price: 0 }, yes: { name: "Add", price: 35 } } },
};
const BASE_PRICE = 690;
const DEFAULT = { frame: "oak", fabric: "sage", base: "legs", cushion: "none" };

// ---------- rules: pure functions, easy to unit test ----------
function isAllowed(config, group, choice) {
  if (group === "base" && choice === "swivel") return true;                       // always selectable…
  if (group === "frame" && config.base === "swivel") return OPTIONS.frame.choices[choice].metal;   // …but swivel needs metal
  return true;
}
function applyChoice(config, group, choice) {
  const next = { ...config, [group]: choice };
  if (next.base === "swivel" && !OPTIONS.frame.choices[next.frame].metal) next.frame = "steel";  // auto-fix the conflict
  return next;
}
const price = (c) => BASE_PRICE + Object.entries(c).reduce((sum, [g, k]) => sum + OPTIONS[g].choices[k].price, 0);

// ---------- URL state: the link reproduces the configuration ----------
const readURL = () => { try { return { ...DEFAULT, ...Object.fromEntries(new URLSearchParams(location.hash.slice(1))) }; } catch { return DEFAULT; } };
const writeURL = (c) => {
  try { history.replaceState(null, "", "#" + new URLSearchParams(c).toString()); }
  catch { /* this site's sandboxed preview frame can't change its URL; on a normal page this works */ }
};

// ---------- 3D: state → parts and materials ----------
function Chair({ config }) {
  const frame = OPTIONS.frame.choices[config.frame], fabric = OPTIONS.fabric.choices[config.fabric];
  // ONE material instance per finish, shared by every part that uses it (one shader, one place to animate)
  const frameMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: frame.color }), []);
  const fabricMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: fabric.color, roughness: 0.95 }), []);
  useFrame((_, dt) => {                                   // smooth colour transitions between options
    easing.dampC(frameMaterial.color, frame.color, 0.2, dt);
    easing.dampC(fabricMaterial.color, fabric.color, 0.2, dt);
    easing.damp(frameMaterial, "metalness", frame.metal ? 0.8 : 0, 0.2, dt);
    easing.damp(frameMaterial, "roughness", frame.metal ? 0.35 : 0.6, 0.2, dt);
  });
  return (
    <group>
      {/* seat and back: soft rounded boxes in fabric */}
      <RoundedBox args={[0.9, 0.16, 0.8]} radius={0.06} position={[0, 0.45, 0]} material={fabricMaterial} />
      <RoundedBox args={[0.9, 0.7, 0.14]} radius={0.06} position={[0, 0.82, -0.36]} rotation-x={-0.18} material={fabricMaterial} />
      {/* arms in the frame finish */}
      {[-0.48, 0.48].map((x) => <mesh key={x} position={[x, 0.6, -0.02]} material={frameMaterial}><boxGeometry args={[0.06, 0.06, 0.78]} /></mesh>)}
      {/* the base swaps geometry entirely */}
      {config.base === "legs"
        ? [[-0.38, -0.32], [0.38, -0.32], [-0.38, 0.32], [0.38, 0.32]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x, 0.19, z]} material={frameMaterial}><cylinderGeometry args={[0.025, 0.018, 0.38, 16]} /></mesh>))
        : <>
            <mesh position-y={0.22} material={frameMaterial}><cylinderGeometry args={[0.04, 0.04, 0.3, 16]} /></mesh>
            {[0, 1, 2, 3, 4].map((i) => (
              <mesh key={i} position={[Math.cos(i * 1.2566) * 0.2, 0.04, Math.sin(i * 1.2566) * 0.2]} rotation-y={-i * 1.2566} material={frameMaterial}>
                <boxGeometry args={[0.42, 0.04, 0.05]} />
              </mesh>))}
          </>}
      {config.cushion === "yes" && (
        <RoundedBox args={[0.5, 0.22, 0.1]} radius={0.05} position={[0, 0.66, -0.24]} rotation-x={-0.18}><meshStandardMaterial color="#f5f5f4" roughness={1} /></RoundedBox>
      )}
    </group>
  );
}

function Snapshot({ onReady }) {
  const { gl, scene, camera } = useThree();
  onReady(() => { gl.render(scene, camera); return gl.domElement.toDataURL("image/png"); });
  return null;
}

export default function App() {
  const [config, setConfig] = useState(readURL);
  const [shot, setShot] = useState(null);
  const takeShot = useRef(null);
  const choose = (group, choice) => { const next = applyChoice(config, group, choice); setConfig(next); writeURL(next); };
  const total = price(config);
  return (
    <>
      <div className="overlay" style={{ maxWidth: 300 }}>
        {Object.entries(OPTIONS).map(([group, { label, choices }]) => (
          <div key={group} className="stack" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <b style={{ fontSize: 12 }}>{label}</b>
            <div className="row">{Object.entries(choices).map(([key, opt]) => (
              <button key={key} className={config[group] === key ? "on" : ""} disabled={!isAllowed(config, group, key)}
                title={!isAllowed(config, group, key) ? "Not available with the swivel base" : ""} onClick={() => choose(group, key)}
                style={{ fontSize: 12, padding: "4px 8px", opacity: isAllowed(config, group, key) ? 1 : 0.4 }}>
                {opt.color && <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: opt.color, marginRight: 4 }} />}
                {opt.name}{opt.price ? ` +$${opt.price}` : ""}
              </button>))}
            </div>
          </div>
        ))}
        <b style={{ fontSize: 20 }}>${total.toLocaleString()}</b>
        <div className="row">
          <button onClick={() => setShot(takeShot.current())}>Snapshot</button>
          <button onClick={() => navigator.clipboard?.writeText(location.href)}>Copy link</button>
        </div>
        <code style={{ fontSize: 10, wordBreak: "break-all" }}>#{new URLSearchParams(config).toString()}</code>
        {shot && <img src={shot} alt="Configured chair" style={{ width: 120, borderRadius: 8, border: "1px solid var(--border)" }} />}
      </div>
      <Canvas camera={{ position: [1.8, 1.3, 2.2], fov: 35 }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={["#f5f5f4"]} />
        <group position-x={0.35}><Chair config={config} /></group>
        <ContactShadows position={[0.35, 0, 0]} opacity={0.5} scale={4} blur={2.2} />
        <Environment preset="apartment" />
        <OrbitControls target={[0.35, 0.5, 0]} minDistance={1.5} maxDistance={4.5} maxPolarAngle={1.45} enablePan={false} />
        <Snapshot onReady={(fn) => (takeShot.current = fn)} />
      </Canvas>
    </>
  );
}
```

Things to copy into real projects:

- **Options, rules and prices are data and pure functions.** The 3D component never computes a price.
- **The URL is the configuration.** Sharing, bookmarking, analytics, "continue on my phone" and the order payload all come from the same object.
- **Transitions are damped**, so switching options feels smooth, not jarring.
- **Disabled options explain themselves** (tooltip), and conflicts are fixed automatically rather than showing an error.

## Mapping options to the model

Real products come from 3D artists, so agree on a contract between the model and the code:

| Option type | Model convention | Code |
|---|---|---|
| colour / material | named materials (`fabric`, `frame`) | swap `material.color`/maps, or select a glTF **material variant** |
| optional part | named nodes (`cushion`, `headrest`) | toggle `visible` |
| alternative part | sibling nodes (`base_legs`, `base_swivel`) | show one, hide the others |
| size | separate meshes or morph targets | swap mesh, or set `morphTargetInfluences` |
| text / logo | a decal area with UVs | `CanvasTexture` or drei `<Decal>` |
| dimensions (made to measure) | parametric geometry | generate in code (as the chair above does) |

Material **libraries** (one KTX2 texture set per fabric, shared across products) keep downloads small: 2,000 product photos can become 14 base models and a library of materials.

## Performance budgets for product pages

| Asset | Budget (mobile) |
|---|---|
| initial model | 1–3 MB (Draco/Meshopt), < 200k triangles |
| each material variant | lazy-loaded, ≤ 1K–2K KTX2/WebP |
| environment | 1K HDR or a baked studio lightmap |
| JavaScript for the viewer | lazy-loaded after the product info |
| first view | poster image immediately; interactive in < 3 s on 4G |

## AR hand-off

"View in your room" turns a configurator into a purchase decision. Export the **current** configuration and hand it to AR:

```js
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

const glb = await new GLTFExporter().parseAsync(chairGroup, { binary: true });   // Android / WebXR
const usdz = await new USDZExporter().parseAsync(chairGroup);                     // iPhone AR Quick Look
const url = URL.createObjectURL(new Blob([usdz], { type: "model/vnd.usdz+zip" }));
// iOS: <a rel="ar" href={url}><img …/></a>; Android/WebXR: <model-viewer src={glbUrl} ar>
```

For catalogues with many combinations, generate common variants server-side (glTF-Transform scripts) and cache them on a CDN, falling back to on-device export for rare ones.

## Metrics that justify the work

Teams track: share of product-page visitors who interact with 3D; **conversion** for visitors who used the configurator vs. those who didn't; **return rate** by product; time on page; AR launches and AR-to-cart rate; and performance (3D load success, time to interactive). Run an A/B test with the static gallery as control; the numbers make the case for (or against) the next round of investment.

:::ai
Configurators pair naturally with LLMs: "a sofa that fits a 2.5 m wall in a warm, kid-proof fabric under $1,500" becomes a structured configuration through tool calling (the model calls `setOption("fabric", "performance-velvet-rust")` and `checkPrice()`), validated by the same pure rules engine, then rendered. The rules engine is what keeps the AI honest: it can propose, but only valid configurations render.
:::

## Check yourself

```quiz
? Where should a configurator's pricing logic live?
+ In pure functions over the configuration object, separate from the 3D view
- Inside the mesh components
- In the GLSL shaders
> Then the same logic serves the cart, quotes and tests.

? Why put the configuration in the URL?
+ Sharing, bookmarking, analytics and orders all reproduce the exact product
- It makes the page load faster
- Three.js requires it
> The URL is a free, universal serialisation.

? How should a configurator handle an incompatible choice (swivel base with a wooden frame)?
+ Disable or auto-correct conflicting options and explain why
- Show an error after checkout
- Let users order impossible products
> Rules prevent invalid states before they happen.

? Which glTF feature ships several colourways of one model efficiently?
+ KHR_materials_variants
- Draco
- Morph targets
> Variants share geometry; only materials switch.

? Which exporter produces a file for iPhone AR Quick Look?
+ USDZExporter
- GLTFExporter
- STLExporter
> iOS uses USDZ; Android/WebXR use glTF.
```

:::exercise Delivery estimate
Add a lead time to each option (e.g. walnut +2 weeks, oat bouclé +1 week, swivel +1 week, base 3 weeks) and show "Ships in N weeks" next to the price, computed by a pure function from the configuration. Bonus: show the most expensive option's contribution in a breakdown list.
:::

:::solution
```js run
// Pure functions over the configuration: easy to test, reusable on the server
const LEAD = { frame: { oak: 0, walnut: 2, steel: 0 }, fabric: { sage: 0, rust: 0, navy: 0, oat: 1 }, base: { legs: 0, swivel: 1 }, cushion: { none: 0, yes: 0 } };
const PRICE = { frame: { oak: 0, walnut: 120, steel: 80 }, fabric: { sage: 0, rust: 0, navy: 40, oat: 90 }, base: { legs: 0, swivel: 150 }, cushion: { none: 0, yes: 35 } };
const BASE_WEEKS = 3, BASE_PRICE = 690;

const leadTimeWeeks = (c) => BASE_WEEKS + Math.max(...Object.entries(c).map(([g, k]) => LEAD[g][k]));   // parts are made in parallel
const breakdown = (c) => Object.entries(c).map(([g, k]) => ({ part: `${g}: ${k}`, price: PRICE[g][k] })).sort((a, b) => b.price - a.price);
const total = (c) => BASE_PRICE + breakdown(c).reduce((s, x) => s + x.price, 0);

for (const config of [
  { frame: "oak", fabric: "sage", base: "legs", cushion: "none" },
  { frame: "walnut", fabric: "oat", base: "legs", cushion: "yes" },
  { frame: "steel", fabric: "navy", base: "swivel", cushion: "none" },
]) {
  console.log(JSON.stringify(config));
  console.log(`  $${total(config)} · ships in ${leadTimeWeeks(config)} weeks · biggest extra: ${breakdown(config)[0].part} (+$${breakdown(config)[0].price})`);
}
```
:::

:::keypoints
- Configurators render any combination on demand: fewer photoshoots, higher conversion, fewer returns.
- Architecture: product data → configuration object → **pure rules and pricing** → 3D view → outputs (URL, snapshot, AR, order).
- Agree a naming contract with artists; use material libraries and glTF variants; keep budgets small for mobile.
- Hand off to AR with GLTFExporter/USDZExporter or pre-generated variants and model-viewer.
- Measure engagement, conversion, returns and AR usage to prove value.
:::
