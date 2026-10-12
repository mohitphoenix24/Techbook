---
title: AR Furniture Planner
level: advanced
time: 75
icon: box
cover: #0f766e,#b45309
tags: "WebXR AR, hit testing, real-world scale, in-scene UI, select events, oriented-box overlap (SAT), blob shadows, desktop fallback"
summary: Place true-to-size furniture in your room with AR, or in a virtual room on desktop. Pick from a catalogue, place items with hit testing (reticle plus trigger or tap), select, rotate and delete them, see dimensions and a running total, and get warned when footprints overlap. In AR a 3D palette floats in front of you, so it works on headsets and phones alike.
---

"Will it fit?" is the question that made AR shopping mainstream. Furniture retailers let you drop a sofa into your living room at true scale before you buy. The essentials are **real-world units**, **reliable placement on surfaces**, **UI that works in AR**, and a **desktop fallback** for everyone without an AR device.

:::flow How it fits together
Catalogue | items with real dimensions (metres), price, procedural model
Place | desktop: click the virtual floor; AR: reticle from hit testing + select (trigger or screen tap)
Edit | select an item → rotate, recolour, delete; dimensions label above it
Check | oriented-rectangle overlap (separating axis test) flags clashing footprints
Summarise | total price, layout export
:::

## Step 1: Do these two footprints overlap?

Furniture rotates, so axis-aligned box tests aren't enough. The **separating axis theorem (SAT)** says two convex shapes don't overlap if you can find an axis on which their projections don't overlap; for rectangles you only need to test the four edge directions. Here the table wanders and spins; the footprints turn red when they intersect:

```js run title="Step 1 · Oriented footprint overlap (SAT)" height=380
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#f1f5f9");
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 50);
camera.position.set(0, 5, 3.2);
camera.lookAt(0, 0, 0);

// a footprint: centre (x, z), size (w, d), rotation about y
const sofa = { x: 0, z: 0, w: 2.0, d: 0.9, rot: 0.3 }, table = { x: 0, z: 1.2, w: 1.1, d: 0.6, rot: 0 };
function corners(f) {
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const x = (a * f.w) / 2, z = (b * f.d) / 2;
    return [f.x + x * c + z * s, f.z - x * s + z * c];             // same maths as rotation.y
  });
}
function overlaps(a, b) {
  const A = corners(a), B = corners(b);
  for (const P of [A, B]) for (let i = 0; i < 2; i++) {             // two edge normals per rectangle
    const [x1, z1] = P[i], [x2, z2] = P[i + 1];
    const ax = -(z2 - z1), az = x2 - x1;
    const proj = (Q) => Q.map(([x, z]) => x * ax + z * az);
    const pa = proj(A), pb = proj(B);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;  // found a gap
  }
  return true;
}

const mk = (f) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), new THREE.MeshBasicMaterial({ color: "#22c55e", transparent: true, opacity: 0.7 }));
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  scene.add(g);
  return g;
};
const gs = mk(sofa), gt = mk(table);

renderer.setAnimationLoop((t) => {
  table.z = Math.sin(t * 0.0007) * 1.3;
  table.x = Math.cos(t * 0.0005) * 0.9;
  table.rot = t * 0.0006;
  for (const [g, f] of [[gs, sofa], [gt, table]]) { g.position.set(f.x, 0, f.z); g.rotation.y = f.rot; }
  const hit = overlaps(sofa, table);
  gs.children[0].material.color.set(hit ? "#ef4444" : "#22c55e");
  gt.children[0].material.color.set(hit ? "#ef4444" : "#3b82f6");
  renderer.render(scene, camera);
});
```

## Step 2: The planner

**Desktop**: pick an item and click the floor to place it; click an item to select it. **AR**: press *Enter AR*, aim at the floor (the green reticle), and press the trigger or tap to place; use the floating palette to switch item, rotate or delete.

```jsx run title="AR Furniture Planner · complete app" level=advanced height=620
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Billboard, Line } from "@react-three/drei";
import { XR, createXRStore, useXR, useXRHitTest, useXRInputSourceState, useXRInputSourceEvent, IfInSessionMode } from "@react-three/xr";

const store = createXRStore({ emulate: { inject: true } });

// ---------- catalogue: real sizes in metres ----------
const CAT = {
  armchair: { name: "Armchair", w: 0.8, d: 0.8, h: 0.85, price: 349, color: "#0f766e", fabric: true },
  sofa: { name: "Sofa", w: 2.0, d: 0.9, h: 0.85, price: 899, color: "#475569", fabric: true },
  table: { name: "Coffee table", w: 1.1, d: 0.6, h: 0.42, price: 179, color: "#a16207" },
  lamp: { name: "Floor lamp", w: 0.35, d: 0.35, h: 1.6, price: 89, color: "#f59e0b" },
  shelf: { name: "Bookshelf", w: 0.9, d: 0.35, h: 1.8, price: 229, color: "#78350f" },
  plant: { name: "Plant", w: 0.45, d: 0.45, h: 1.1, price: 59, color: "#15803d" },
};
const FABRICS = ["#0f766e", "#475569", "#b45309", "#be123c", "#e7e5e4"];
const WOOD = "#5b3a1e";

// ---------- procedural models (origin at floor centre, front = +z) ----------
const M = ({ p, s, c, r = 0.6, e }) => (
  <mesh position={p}><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={r} emissive={e} /></mesh>
);
function Legs({ w, d, h = 0.12, inset = 0.06 }) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b], i) => (
    <mesh key={i} position={[a * (w / 2 - inset), h / 2, b * (d / 2 - inset)]}><cylinderGeometry args={[0.022, 0.018, h, 10]} /><meshStandardMaterial color={WOOD} /></mesh>
  ));
}
function Model({ type, color }) {
  switch (type) {
    case "armchair": return (<group>
      <Legs w={0.8} d={0.8} />
      <M p={[0, 0.21, 0]} s={[0.8, 0.18, 0.8]} c={color} r={0.95} />
      <M p={[0, 0.35, 0.05]} s={[0.56, 0.1, 0.62]} c={color} r={0.95} />
      <M p={[0, 0.58, -0.33]} s={[0.8, 0.5, 0.14]} c={color} r={0.95} />
      {[-1, 1].map((k) => <M key={k} p={[k * 0.34, 0.45, 0]} s={[0.12, 0.3, 0.8]} c={color} r={0.95} />)}
    </group>);
    case "sofa": return (<group>
      <Legs w={2.0} d={0.9} />
      <M p={[0, 0.22, 0]} s={[2.0, 0.2, 0.9]} c={color} r={0.95} />
      {[-0.6, 0, 0.6].map((x) => <M key={x} p={[x, 0.38, 0.06]} s={[0.58, 0.12, 0.64]} c={color} r={0.95} />)}
      <M p={[0, 0.58, -0.36]} s={[2.0, 0.5, 0.18]} c={color} r={0.95} />
      {[-1, 1].map((k) => <M key={k} p={[k * 0.92, 0.47, 0]} s={[0.16, 0.35, 0.9]} c={color} r={0.95} />)}
    </group>);
    case "table": return (<group>
      <M p={[0, 0.4, 0]} s={[1.1, 0.04, 0.6]} c={color} r={0.4} />
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b], i) => <M key={i} p={[a * 0.5, 0.19, b * 0.25]} s={[0.04, 0.38, 0.04]} c={WOOD} />)}
    </group>);
    case "lamp": return (<group>
      <mesh position-y={0.015}><cylinderGeometry args={[0.16, 0.17, 0.03, 32]} /><meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} /></mesh>
      <mesh position-y={0.72}><cylinderGeometry args={[0.015, 0.015, 1.4, 12]} /><meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} /></mesh>
      <mesh position-y={1.45}><cylinderGeometry args={[0.12, 0.17, 0.28, 32, 1, true]} /><meshStandardMaterial color="#fef3c7" emissive="#fbbf24" emissiveIntensity={0.6} side={THREE.DoubleSide} /></mesh>
    </group>);
    case "shelf": return (<group>
      {[-1, 1].map((k) => <M key={k} p={[k * 0.435, 0.9, 0]} s={[0.03, 1.8, 0.35]} c={color} />)}
      {[0.015, 0.45, 0.9, 1.35, 1.785].map((y) => <M key={y} p={[0, y, 0]} s={[0.9, 0.03, 0.35]} c={color} />)}
      <M p={[0, 0.9, -0.17]} s={[0.9, 1.8, 0.01]} c={color} />
      {[0.03, 0.48, 0.93].map((y, row) => [0, 1, 2, 3, 4, 5].map((k) => (
        <M key={`${row}-${k}`} p={[-0.3 + k * 0.1 + row * 0.04, y + 0.13, 0.02]} s={[0.07, 0.24 - (k % 3) * 0.03, 0.22]} c={["#be123c", "#1d4ed8", "#15803d", "#ca8a04", "#7c3aed", "#0f766e"][(k + row) % 6]} />
      )))}
    </group>);
    case "plant": return (<group>
      <mesh position-y={0.16}><cylinderGeometry args={[0.18, 0.14, 0.32, 24]} /><meshStandardMaterial color="#c2410c" roughness={0.9} /></mesh>
      {[[0, 0.62, 0, 0.22], [0.1, 0.82, 0.05, 0.17], [-0.09, 0.78, -0.06, 0.18], [0.02, 0.98, 0, 0.13]].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}><icosahedronGeometry args={[r, 1]} /><meshStandardMaterial color={color} roughness={0.8} flatShading /></mesh>
      ))}
    </group>);
    default: return null;
  }
}

// soft "blob" shadow: works in AR where there is no real floor mesh to receive shadows
let blobTex;
function Blob({ w, d }) {
  blobTex ??= (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,.45)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  return <mesh rotation-x={-Math.PI / 2} position-y={0.003} renderOrder={-1}><planeGeometry args={[w + 0.35, d + 0.35]} /><meshBasicMaterial map={blobTex} transparent depthWrite={false} /></mesh>;
}

// ---------- overlap test (Step 1's SAT) ----------
function corners({ type, position: [px, , pz], rotY }) {
  const { w, d } = CAT[type], c = Math.cos(rotY), s = Math.sin(rotY);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const x = (a * w) / 2, z = (b * d) / 2; return [px + x * c + z * s, pz - x * s + z * c]; });
}
function overlaps(a, b) {
  const A = corners(a), B = corners(b);
  for (const P of [A, B]) for (let i = 0; i < 2; i++) {
    const ax = -(P[i + 1][1] - P[i][1]), az = P[i + 1][0] - P[i][0];
    const pa = A.map(([x, z]) => x * ax + z * az), pb = B.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

function Item({ item, selected, clash, onSelect }) {
  const c = CAT[item.type];
  const rect = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => [(a * (c.w + 0.06)) / 2, 0.01, (b * (c.d + 0.06)) / 2]);
  return (
    <group position={item.position} rotation-y={item.rotY} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <Blob w={c.w} d={c.d} />
      <Model type={item.type} color={item.color} />
      {/* not clickable: XR pointers can't raycast fat lines (they need a camera on the raycaster) */}
      {(selected || clash) && <Line points={rect} color={clash ? "#ef4444" : "#22c55e"} lineWidth={2.5} raycast={() => null} />}
      {selected && (
        <Billboard position-y={c.h + 0.16}>
          <Text fontSize={0.09} color="#111827" outlineWidth={0.008} outlineColor="#ffffff">{`${c.name} · ${Math.round(c.w * 100)}×${Math.round(c.d * 100)}×${Math.round(c.h * 100)} cm`}</Text>
        </Billboard>
      )}
    </group>
  );
}

// ---------- desktop: a virtual room to plan in ----------
function Room({ onPlace }) {
  const camera = useThree((s) => s.camera);
  const cursor = useRef();
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}
        onPointerMove={(e) => cursor.current.position.set(e.point.x, 0.01, e.point.z)}
        onClick={(e) => { const p = e.point; onPlace([p.x, 0, p.z], Math.atan2(camera.position.x - p.x, camera.position.z - p.z)); }}>
        <planeGeometry args={[5, 4]} />
        <meshStandardMaterial color="#e7d8c3" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.3, -2.05]}><boxGeometry args={[5, 2.6, 0.1]} /><meshStandardMaterial color="#f5f5f4" /></mesh>
      <mesh position={[-2.55, 1.3, 0]}><boxGeometry args={[0.1, 2.6, 4.2]} /><meshStandardMaterial color="#efeae4" /></mesh>
      <mesh ref={cursor} rotation-x={-Math.PI / 2}><ringGeometry args={[0.1, 0.13, 32]} /><meshBasicMaterial color="#059669" /></mesh>
    </group>
  );
}

// ---------- AR: reticle, placement on select, floating palette ----------
const hit = { found: false, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };
const hitMatrix = new THREE.Matrix4();
function Reticle() {
  const ring = useRef();
  const controller = useXRInputSourceState("controller", "right");
  useXRHitTest((results, getWorldMatrix) => {
    hit.found = results.length > 0;
    if (hit.found) { getWorldMatrix(hitMatrix, results[0]); hitMatrix.decompose(hit.position, hit.quaternion, hit.scale); }
  }, controller?.inputSource.targetRaySpace ?? "viewer");     // headset: where the controller points; phone: screen centre
  useFrame(() => { ring.current.visible = hit.found; ring.current.position.copy(hit.position); ring.current.quaternion.copy(hit.quaternion); });
  return <group ref={ring}><mesh rotation-x={-Math.PI / 2}><ringGeometry args={[0.08, 0.1, 32]} /><meshBasicMaterial color="#34d399" /></mesh></group>;
}

function ARPlacer({ onPlace, lastUi }) {
  const camera = useThree((s) => s.camera);
  // "select" = trigger press or screen tap from ANY input source. If that same press hit our 3D UI or an item,
  // the UI's onClick has just stamped lastUi, so we don't also place furniture.
  useXRInputSourceEvent("all", "select", () => {
    setTimeout(() => {
      if (performance.now() - lastUi.current < 250 || !hit.found) return;
      const p = hit.position;
      onPlace([p.x, p.y, p.z], Math.atan2(camera.position.x - p.x, camera.position.z - p.z));
    }, 60);
  }, [onPlace]);
  return null;
}

function Palette({ current, onPick, onRotate, onDelete, lastUi }) {
  const g = useRef();
  const camera = useThree((s) => s.camera);
  const fwd = useMemo(() => new THREE.Vector3(), []), target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {                                   // lazily follow the user: 0.7 m ahead, 35 cm below eye level
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    target.copy(camera.position).addScaledVector(fwd, 0.7); target.y -= 0.35;
    g.current.position.lerp(target, 1 - Math.exp(-dt * 3));
    g.current.rotation.y = Math.atan2(-fwd.x, -fwd.z);
  });
  const buttons = [...Object.keys(CAT).map((k) => ({ id: k, label: CAT[k].name, on: k === current, act: () => onPick(k) })),
    { id: "rot", label: "Rotate 45°", act: onRotate }, { id: "del", label: "Delete", act: onDelete }];
  return (
    <group ref={g}>
      <mesh position={[0, -0.04, -0.005]}><planeGeometry args={[0.54, 0.2]} /><meshBasicMaterial color="#0f172a" transparent opacity={0.85} /></mesh>
      {buttons.map((b, i) => (
        <group key={b.id} position={[((i % 4) - 1.5) * 0.125, -Math.floor(i / 4) * 0.085, 0]}>
          <mesh onClick={(e) => { e.stopPropagation(); lastUi.current = performance.now(); b.act(); }}>
            <planeGeometry args={[0.115, 0.07]} />
            <meshBasicMaterial color={b.on ? "#059669" : "#334155"} />
          </mesh>
          <Text position-z={0.002} fontSize={0.014} maxWidth={0.105} textAlign="center" color="#ffffff">{b.label}</Text>
        </group>
      ))}
    </group>
  );
}

function ModeWatcher({ onMode }) {
  const mode = useXR((s) => s.mode);
  useEffect(() => onMode(mode), [mode]);
  return null;
}

export default function App() {
  const [items, setItems] = useState([
    { id: 1, type: "sofa", position: [0, 0, -1.3], rotY: 0, color: CAT.sofa.color },
    { id: 2, type: "table", position: [0.1, 0, -0.1], rotY: 0, color: CAT.table.color },
  ]);
  const [sel, setSel] = useState(2);
  const [current, setCurrent] = useState("armchair");
  const [mode, setMode] = useState(null);
  const nextId = useRef(3), lastUi = useRef(0), currentRef = useRef(current);
  currentRef.current = current;

  const place = (position, rotY) => {
    const id = nextId.current++, type = currentRef.current;
    setItems((it) => [...it, { id, type, position, rotY, color: CAT[type].color }]);
    setSel(id);
  };
  const update = (fn) => setItems((it) => it.map((x) => (x.id === sel ? fn(x) : x)));
  const rotate = (deg) => update((x) => ({ ...x, rotY: x.rotY + THREE.MathUtils.degToRad(deg) }));
  const remove = () => { setItems((it) => it.filter((x) => x.id !== sel)); setSel(null); };

  const clashes = useMemo(() => {
    const out = new Set();
    items.forEach((a, i) => items.slice(i + 1).forEach((b) => { if (overlaps(a, b)) { out.add(a.id); out.add(b.id); } }));
    return out;
  }, [items]);
  const selected = items.find((x) => x.id === sel);
  const total = items.reduce((s, x) => s + CAT[x.type].price, 0);

  return (
    <>
      {mode !== "immersive-ar" && (
        <div className="overlay" style={{ width: 236, gap: 10 }}>
          <div className="row">{Object.entries(CAT).map(([k, c]) => (
            <button key={k} className={current === k ? "on" : ""} onClick={() => setCurrent(k)} style={{ fontSize: 11.5, padding: "3px 8px" }}>{c.name}</button>
          ))}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>Click the floor to place a {CAT[current].name.toLowerCase()} (${CAT[current].price}).</div>
          {selected && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 12 }}>
              <b>{CAT[selected.type].name}</b>{clashes.has(selected.id) && <span style={{ color: "#dc2626" }}> · overlaps another item</span>}
              {CAT[selected.type].fabric && (
                <div className="row" style={{ margin: "6px 0" }}>{FABRICS.map((f) => (
                  <button key={f} onClick={() => update((x) => ({ ...x, color: f }))} title={f}
                    style={{ width: 22, height: 22, padding: 0, borderRadius: "50%", background: f, outline: selected.color === f ? "2px solid var(--accent)" : "none", outlineOffset: 2 }} />
                ))}</div>
              )}
              <div className="row" style={{ marginTop: 6 }}>
                <button onClick={() => rotate(-15)}>⟲ 15°</button><button onClick={() => rotate(15)}>⟳ 15°</button><button onClick={remove}>Delete</button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <span>{items.length} items</span><b>${total.toLocaleString()}</b>
          </div>
          <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(items.map(({ type, position, rotY, color }) => ({ type, position: position.map((v) => +v.toFixed(3)), rotY: +rotY.toFixed(3), color })))).catch(() => {})}>Copy layout JSON</button>
        </div>
      )}
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterAR()}>Enter AR</button></div>

      <Canvas camera={{ position: [2.6, 3.1, 4.2], fov: 45 }}>
        <XR store={store}>
          <ModeWatcher onMode={setMode} />
          <hemisphereLight args={["#ffffff", "#a8a29e", 1.4]} />
          <directionalLight position={[2, 4, 3]} intensity={1.6} />
          <IfInSessionMode deny={["immersive-ar", "immersive-vr"]}>
            <color attach="background" args={["#e2e8f0"]} />
            <Room onPlace={place} />
            <OrbitControls makeDefault target={[0, 0.4, -0.4]} maxPolarAngle={1.45} />
          </IfInSessionMode>
          <IfInSessionMode allow="immersive-ar">
            <Reticle />
            <ARPlacer onPlace={place} lastUi={lastUi} />
            <Palette current={current} onPick={setCurrent} onRotate={() => rotate(45)} onDelete={remove} lastUi={lastUi} />
          </IfInSessionMode>
          {items.map((it) => (
            <Item key={it.id} item={it} selected={it.id === sel} clash={clashes.has(it.id)}
              onSelect={() => { lastUi.current = performance.now(); setSel(it.id); }} />
          ))}
        </XR>
      </Canvas>
    </>
  );
}
```

## How it works

| Feature | Technique |
|---|---|
| real scale | every model is built in metres (sofa 2.0 × 0.9 × 0.85 m); WebXR's units are metres, so AR shows true size with no calibration |
| desktop fallback | a simple room with a clickable floor: `e.point` gives the placement position; the item turns to face the camera |
| AR placement | continuous `useXRHitTest` from the right controller (headset) or the viewer (phone) drives the reticle; a `select` event from any input places at the latest hit |
| UI vs placement | in AR one trigger press can hit a 3D button *and* fire `select`; UI `onClick`s stamp `lastUi`, and the placer waits a moment and skips if UI was just used |
| in-scene palette | a panel that lazily follows the user's gaze (yaw only, below eye level); meshes with `onClick` work with controllers, hands and screen taps |
| overlap | oriented rectangles in plan view, tested with the separating axis theorem; clashing items get a red outline |
| shadows | a radial-gradient **blob shadow** under each item: cheap, soft, and it works in AR where there's no floor mesh to receive real shadows |
| labels | drei `Billboard` + `Text` above the selected item: visible in AR too (HTML overlays aren't) |
| state | one `items` array (type, position, rotation, colour): easy to export, save or share |

:::tip Production AR commerce
Retailers usually ship **glTF for Android/WebXR and USDZ for iOS Quick Look** (iOS Safari doesn't support immersive WebXR AR), often via `<model-viewer ar>`. Add **light estimation** (WebXR `light-estimation`) so materials match the room, **anchors** so items stay put, and **depth sensing / occlusion** so a real chair can hide a virtual table. Keep models light (≤ 5 MB, compressed textures) because users open them on mobile data.
:::

:::exercise Extend it
1. Add **snap to wall**: in AR use plane detection (`useXRPlanes("wall")`) and rotate bookshelves to sit flush against the nearest wall; on desktop snap to the room's walls.
2. Add **drag to move** for placed items: on desktop with pointer capture on the floor; in AR by re-placing the selected item at the reticle while the trigger is held.
3. Replace the procedural models with **glTF** products and a variant switcher (fabric materials via `KHR_materials_variants`).
4. Add a **"measure the gap"** tool: two taps on the floor show the distance, to check walkways (at least 90 cm is a common guideline).
5. Save layouts to a backend and reopen them in AR anchored to the same room using **persistent anchors** where supported.
:::

:::keypoints
- Work in **metres**: WebXR and three.js agree on scale, so true-size AR is automatic.
- Place with **hit testing** + a **select** event; give users a clear reticle.
- Build AR UI **in the scene** (palettes, labels, outlines) so it works on headsets and phones; keep an HTML UI for desktop.
- Prevent UI presses from also triggering placement.
- Check footprints with **SAT** for oriented rectangles; fake grounding with **blob shadows**.
- Always ship a **desktop fallback**: most visitors won't have AR.
:::
