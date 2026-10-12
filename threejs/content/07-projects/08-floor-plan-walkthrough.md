---
title: Floor-Plan Walkthrough
level: intermediate
time: 65
icon: home
cover: #a16207,#0f766e
tags: data → geometry, wall openings, ShapeGeometry, area calculation, first-person controls, 2D collision, orthographic plan view, minimap
summary: Turn a JSON floor plan into a furnished 3D apartment. Walls are split around doors and windows, room floors are built from polygons with their areas calculated, and the furniture is placed from the same data. Explore it in dollhouse, 2D plan and first-person walk modes, with wall collisions, a live minimap, and teleporting to any room.
---

Real estate, architecture, interior design and facility management all start from the same thing: a **floor plan**. Turning plan data into an explorable 3D space is one of the most practical skills in this course; it's the core of property tours, space planners and indoor digital twins. Everything here is generated from one small JSON object.

:::flow How it fits together
Plan data | rooms (polygons), walls (segments + openings), furniture (boxes)
Walls | split each segment around doors/windows → solid pieces, lintels, sills, glass
Rooms | polygon → `ShapeGeometry` floor + area (shoelace formula) + label
Modes | dollhouse (orbit), plan (orthographic, top-down), walk (first person)
Walk | WASD + drag-look; circle-vs-segment collision against wall pieces
:::

## Step 1: Cutting openings into a wall

A wall is a segment with a height and thickness. A door removes a full-height gap except for a **lintel** above it; a window leaves a **sill** wall below, a lintel above, and glass between. Walk along the wall from start to end, emitting pieces:

```jsx run title="Step 1 · Splitting a wall around a door and a window" height=400
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

const H = 2.7, T = 0.15, L = 6;
function pieces(openings) {
  const out = [];
  let cur = 0;
  for (const o of [...openings].sort((a, b) => a.t - b.t)) {
    const a = o.t - o.w / 2, b = o.t + o.w / 2;
    if (a > cur) out.push({ a: cur, b: a, y0: 0, y1: H });                       // solid wall up to the opening
    if (o.type === "window") {
      out.push({ a, b, y0: 0, y1: 0.9 });                                         // sill
      out.push({ a, b, y0: 0.9, y1: 2.1, glass: true });                          // glass
    }
    out.push({ a, b, y0: 2.1, y1: H });                                           // lintel
    cur = b;
  }
  if (cur < L) out.push({ a: cur, b: L, y0: 0, y1: H });
  return out;
}

export default function App() {
  const [door, setDoor] = useState(1.5), [win, setWin] = useState(4.3);
  const list = pieces([{ type: "door", t: door, w: 0.9 }, { type: "window", t: win, w: 1.6 }]);
  return (
    <>
      <div className="overlay">
        <label>door at {door.toFixed(1)} m <input type="range" min="0.6" max="5.4" step="0.1" value={door} onChange={(e) => setDoor(+e.target.value)} /></label>
        <label>window at {win.toFixed(1)} m <input type="range" min="1" max="5.1" step="0.1" value={win} onChange={(e) => setWin(+e.target.value)} /></label>
        <span className="muted">{list.length} pieces</span>
      </div>
      <Canvas camera={{ position: [3, 2.5, 6], fov: 45 }}>
        <color attach="background" args={["#f1f5f9"]} />
        <ambientLight intensity={0.8} /><directionalLight position={[3, 5, 4]} intensity={1.6} />
        {list.map((p, i) => (
          <mesh key={i} position={[(p.a + p.b) / 2 - L / 2, (p.y0 + p.y1) / 2, 0]}>
            <boxGeometry args={[p.b - p.a, p.y1 - p.y0, T]} />
            <meshStandardMaterial color={p.glass ? "#7dd3fc" : ["#e7e5e4", "#d6d3d1"][i % 2]} transparent={p.glass} opacity={p.glass ? 0.4 : 1} />
          </mesh>
        ))}
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[8, 4]} /><meshStandardMaterial color="#a8a29e" /></mesh>
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>
    </>
  );
}
```

Overlapping openings would produce negative-length pieces; real tools validate the plan first. Alternating colours show each generated piece.

## Step 2: The walkthrough

```jsx run title="Floor-Plan Walkthrough · complete app" level=intermediate height=620
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, Html, Environment } from "@react-three/drei";

// ---------- the plan: metres, x to the right, y "down the page" (becomes +z) ----------
const PLAN = {
  height: 2.7, thickness: 0.15,
  rooms: [
    { name: "Living", floor: "wood", poly: [[0, 0], [6, 0], [6, 5], [0, 5]] },
    { name: "Kitchen", floor: "tile", poly: [[6, 0], [10, 0], [10, 5], [6, 5]] },
    { name: "Bedroom", floor: "carpet", poly: [[0, 5], [4, 5], [4, 8], [0, 8]] },
    { name: "Bath", floor: "tile", poly: [[4, 5], [6.5, 5], [6.5, 8], [4, 8]] },
    { name: "Study", floor: "wood", poly: [[6.5, 5], [10, 5], [10, 8], [6.5, 8]] },
  ],
  walls: [
    { seg: [0, 0, 10, 0], openings: [{ type: "window", t: 2.2, w: 2.2 }, { type: "window", t: 8, w: 1.6 }] },
    { seg: [10, 0, 10, 8], openings: [{ type: "window", t: 6.5, w: 1.2 }] },
    { seg: [10, 8, 0, 8], openings: [{ type: "window", t: 1.8, w: 1.5 }, { type: "window", t: 8, w: 1.4 }] },
    { seg: [0, 8, 0, 0], openings: [{ type: "door", t: 6, w: 1.0 }] },           // front door
    { seg: [6, 0, 6, 5], openings: [{ type: "door", t: 3, w: 1.8 }] },           // wide opening to the kitchen
    { seg: [0, 5, 10, 5], openings: [{ type: "door", t: 2.5, w: 0.9 }, { type: "door", t: 5, w: 0.8 }, { type: "door", t: 8.2, w: 0.9 }] },
    { seg: [4, 5, 4, 8], openings: [] },
    { seg: [6.5, 5, 6.5, 8], openings: [] },
  ],
  furniture: [   // x, y (plan centre), width, depth, height, colour
    [2.5, 4.3, 2.4, 0.9, 0.8, "#475569"], [2.5, 3.1, 1.2, 0.6, 0.4, "#a16207"], [2.5, 0.35, 1.8, 0.4, 0.5, "#1f2937"],
    [4.9, 1.6, 1.4, 0.9, 0.75, "#78350f"], [8, 0.4, 3.6, 0.6, 0.9, "#e2e8f0"], [8, 2.6, 1.8, 0.9, 0.9, "#cbd5e1"],
    [9.6, 4.5, 0.7, 0.7, 1.9, "#94a3b8"], [2, 6.9, 1.6, 2.0, 0.5, "#e0e7ff"], [0.4, 6.4, 0.6, 1.6, 2.1, "#a8a29e"],
    [5.2, 7.6, 2.0, 0.7, 0.55, "#f8fafc"], [4.4, 5.5, 0.5, 0.5, 0.85, "#f8fafc"], [8.2, 7.6, 1.6, 0.7, 0.75, "#78350f"],
    [9.75, 6.2, 0.35, 1.6, 1.9, "#57534e"],
  ],
};
const H = PLAN.height, T = PLAN.thickness, OX = 5, OZ = 4;          // plan centre → world origin
const FLOORS = { wood: "#c49a6c", tile: "#d6d3d1", carpet: "#a5b4fc" };
const area = (p) => Math.abs(p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0)) / 2;  // shoelace
const centre = (p) => p.reduce(([a, b], [x, y]) => [a + x / p.length, b + y / p.length], [0, 0]);

// ---------- walls → pieces (same algorithm as Step 1, plus world placement) ----------
function buildWalls() {
  const out = [];
  for (const w of PLAN.walls) {
    const [px1, py1, px2, py2] = w.seg, L = Math.hypot(px2 - px1, py2 - py1);   // plan coordinates
    const d = [(px2 - px1) / L, (py2 - py1) / L], ang = Math.atan2(py2 - py1, px2 - px1);
    const add = (a, b, y0, y1, glass = false) => {                                // a, b along the wall; y0, y1 heights
      if (b - a < 0.01) return;
      const a2 = a === 0 ? -T / 2 : a, b2 = b === L ? L + T / 2 : b;        // overlap at corners
      const A = [px1 + d[0] * a2 - OX, py1 + d[1] * a2 - OZ], B = [px1 + d[0] * b2 - OX, py1 + d[1] * b2 - OZ];
      out.push({ A, B, len: b2 - a2, y0, y1, glass, ang, block: y0 < 1 });
    };
    let cur = 0;
    for (const o of [...w.openings].sort((a, b) => a.t - b.t)) {
      const a = o.t - o.w / 2, b = o.t + o.w / 2;
      add(cur, a, 0, H);
      if (o.type === "window") { add(a, b, 0, 0.9); add(a, b, 0.9, 2.1, true); }
      add(a, b, 2.1, H);
      cur = b;
    }
    add(cur, L, 0, H);
  }
  return out;
}
const WALLS = buildWalls();

// push a circle (the walker) out of every blocking wall piece
function collide(p, r = 0.25) {
  for (const w of WALLS) {
    if (!w.block) continue;
    const [ax, az] = w.A, [bx, bz] = w.B, dx = bx - ax, dz = bz - az;
    const t = THREE.MathUtils.clamp(((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const cx = ax + dx * t, cz = az + dz * t, ox = p.x - cx, oz = p.z - cz, dist = Math.hypot(ox, oz), min = r + T / 2;
    if (dist < min && dist > 1e-6) { p.x = cx + (ox / dist) * min; p.z = cz + (oz / dist) * min; }
  }
}

// ---------- the building ----------
function Apartment({ showLabels }) {
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f5f5f4", roughness: 0.9 }), []);
  const glassMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#bae6fd", transparent: true, opacity: 0.3, roughness: 0.05 }), []);
  const floors = useMemo(() => PLAN.rooms.map((r) => {
    const shape = new THREE.Shape(r.poly.map(([x, y]) => new THREE.Vector2(x - OX, -(y - OZ))));  // y → −z before rotating flat
    return { r, geo: new THREE.ShapeGeometry(shape), c: centre(r.poly), a: area(r.poly) };
  }), []);
  return (
    <group>
      {WALLS.map((w, i) => (
        <mesh key={i} material={w.glass ? glassMat : wallMat} rotation-y={-w.ang}
          position={[(w.A[0] + w.B[0]) / 2, (w.y0 + w.y1) / 2, (w.A[1] + w.B[1]) / 2]}>
          <boxGeometry args={[w.len, w.y1 - w.y0, w.glass ? 0.03 : T]} />
        </mesh>
      ))}
      {floors.map(({ r, geo, c, a }) => (
        <group key={r.name}>
          <mesh geometry={geo} rotation-x={-Math.PI / 2} position-y={0.001}><meshStandardMaterial color={FLOORS[r.floor]} roughness={0.8} /></mesh>
          {showLabels && (
            <Html center position={[c[0] - OX, 0.1, c[1] - OZ]} style={{ pointerEvents: "none" }}>
              <div className="label3d" style={{ textAlign: "center", lineHeight: 1.2 }}><b>{r.name}</b><br /><span className="muted">{a.toFixed(1)} m²</span></div>
            </Html>
          )}
        </group>
      ))}
      {PLAN.furniture.map(([x, y, w, d, h, color], i) => (
        <mesh key={i} position={[x - OX, h / 2, y - OZ]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}><planeGeometry args={[40, 40]} /><meshStandardMaterial color="#d9f99d" /></mesh>
    </group>
  );
}

// ---------- first-person walking ----------
function Walker({ active, player }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set());
  useEffect(() => {
    const down = (e) => keys.current.add(e.key.toLowerCase());
    const up = (e) => keys.current.delete(e.key.toLowerCase());
    let drag = null;
    const pd = (e) => (drag = [e.clientX, e.clientY]);
    const pm = (e) => {
      if (!active || !drag) return;
      const p = player.current;
      p.yaw -= (e.clientX - drag[0]) * 0.004;
      p.pitch = THREE.MathUtils.clamp(p.pitch - (e.clientY - drag[1]) * 0.004, -1.2, 1.2);
      drag = [e.clientX, e.clientY];
    };
    const pu = () => (drag = null);
    addEventListener("keydown", down); addEventListener("keyup", up);
    gl.domElement.addEventListener("pointerdown", pd); addEventListener("pointermove", pm); addEventListener("pointerup", pu);
    return () => {
      removeEventListener("keydown", down); removeEventListener("keyup", up);
      gl.domElement.removeEventListener("pointerdown", pd); removeEventListener("pointermove", pm); removeEventListener("pointerup", pu);
    };
  }, [active, gl, player]);

  useFrame((_, dt) => {
    if (!active) return;
    const k = keys.current, p = player.current;
    const f = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    const s = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const speed = (k.has("shift") ? 3.2 : 1.6) * Math.min(dt, 0.05);
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    p.x += (-sin * f + cos * s) * speed;                 // forward is −z rotated by yaw
    p.z += (-cos * f - sin * s) * speed;
    collide(p);
    camera.position.set(p.x, 1.6, p.z);
    camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
  });
  return null;
}

// a marker showing where the walker stands (plan & dollhouse)
function PlayerMarker({ player }) {
  const g = useRef();
  useFrame(() => { g.current.position.set(player.current.x, 0.05, player.current.z); g.current.rotation.y = player.current.yaw; });
  return (
    <group ref={g}>
      <mesh rotation-x={-Math.PI / 2} position-z={-0.15}><coneGeometry args={[0.18, 0.45, 3]} /><meshBasicMaterial color="#e11d48" /></mesh>
    </group>
  );
}

// the minimap is plain 2D canvas drawing, updated from the frame loop
const S = 14;   // pixels per metre
function Minimap({ canvas, player }) {
  useFrame(() => {
    const cv = canvas.current;
    if (!cv) return;
    const g = cv.getContext("2d"), p = player.current;
    g.clearRect(0, 0, cv.width, cv.height);
    PLAN.rooms.forEach((r) => {
      g.fillStyle = FLOORS[r.floor];
      g.beginPath();
      r.poly.forEach(([x, y], i) => (i ? g.lineTo(x * S + 4, y * S + 4) : g.moveTo(x * S + 4, y * S + 4)));
      g.fill();
    });
    g.strokeStyle = "#1f2937"; g.lineWidth = 2;
    WALLS.filter((w) => w.block && !w.glass).forEach((w) => {
      g.beginPath(); g.moveTo((w.A[0] + OX) * S + 4, (w.A[1] + OZ) * S + 4); g.lineTo((w.B[0] + OX) * S + 4, (w.B[1] + OZ) * S + 4); g.stroke();
    });
    const px = (p.x + OX) * S + 4, py = (p.z + OZ) * S + 4;
    g.fillStyle = "#e11d48";
    g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#e11d48";
    g.beginPath(); g.moveTo(px, py); g.lineTo(px - Math.sin(p.yaw) * 12, py - Math.cos(p.yaw) * 12); g.stroke();
  });
  return null;
}

function PlanCamera() {
  const size = useThree((s) => s.size);
  return <OrthographicCamera makeDefault position={[0, 20, 0]} rotation-x={-Math.PI / 2} zoom={Math.min(size.width / 12, size.height / 10)} />;
}

export default function App() {
  const [mode, setMode] = useState("dollhouse");
  const player = useRef({ x: 0.8 - OX, z: 2 - OZ, yaw: -Math.PI / 2, pitch: 0 });    // just inside the front door, facing in
  const map = useRef();
  const enterRoom = (r) => {
    const [x, y] = centre(r.poly);
    Object.assign(player.current, { x: x - OX, z: y - OZ + 0.6, pitch: 0 });
    setMode("walk");
  };
  const onMapClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - rect.left - 4) / S - OX, z: (e.clientY - rect.top - 4) / S - OZ };
    if (Math.abs(p.x) < 5 && Math.abs(p.z) < 4) { Object.assign(player.current, p); setMode("walk"); }
  };
  const total = PLAN.rooms.reduce((s, r) => s + area(r.poly), 0);

  return (
    <>
      <Canvas camera={{ position: [7, 11, 11], fov: 45 }}>
        <color attach="background" args={["#e0f2fe"]} />
        <Environment preset="apartment" environmentIntensity={0.7} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 10, 6]} intensity={1.4} />
        <Apartment showLabels={mode !== "walk"} />
        {mode !== "walk" && <PlayerMarker player={player} />}
        {mode === "dollhouse" && <OrbitControls makeDefault target={[0, 0, 0]} maxPolarAngle={1.35} />}
        {mode === "plan" && <PlanCamera />}
        <Walker active={mode === "walk"} player={player} />
        <Minimap canvas={map} player={player} />
      </Canvas>

      <div className="overlay" style={{ width: 210 }}>
        <div className="row">{["dollhouse", "plan", "walk"].map((m) => (
          <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} style={{ fontSize: 12, padding: "4px 9px", textTransform: "capitalize" }}>{m}</button>
        ))}</div>
        <div style={{ fontSize: 12 }}>
          {PLAN.rooms.map((r) => (
            <div key={r.name} onClick={() => enterRoom(r)} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", padding: "2px 0" }}>
              <span><span style={{ color: FLOORS[r.floor] }}>■</span> {r.name}</span><span className="muted">{area(r.poly).toFixed(1)} m²</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}><b>Total</b><b>{total.toFixed(1)} m²</b></div>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>{mode === "walk" ? "WASD / arrows to move, drag to look, Shift to run" : "Click a room to walk into it"}</div>
      </div>
      <div className="overlay right bottom" style={{ padding: 6 }}>
        <canvas ref={map} width={10 * S + 8} height={8 * S + 8} onClick={onMapClick} style={{ cursor: "crosshair", display: "block" }} title="Click to teleport" />
      </div>
    </>
  );
}
```

## How it works

| Feature | Technique |
|---|---|
| single source of truth | rooms, walls, openings and furniture live in one `PLAN` object; 3D geometry, labels, areas, the minimap and collisions are all **derived** from it |
| walls | each segment walked from start to end, emitting solid pieces, lintels, sills and glass; pieces at segment ends extend by half the thickness so corners close |
| placement | a piece's centre = start + direction × distance; `rotation.y = −atan2(dy, dx)` aligns the box with the wall |
| floors | each room polygon → `THREE.Shape` → `ShapeGeometry`, rotated flat (plan y becomes −shape y so it lands on +z) |
| areas | the **shoelace formula** on the polygon, shown in labels, the room list and the total |
| plan view | an `OrthographicCamera` looking straight down, zoom computed from the canvas size; drei restores the perspective camera when it unmounts |
| walking | yaw/pitch from dragging, WASD relative to yaw, Euler order `"YXZ"` so looking up/down never rolls the camera |
| collisions | circle vs. segment: closest point on each blocking wall piece, push out to `radius + thickness/2`. Door gaps have no blocking piece, so you walk through them; lintels are ignored because they're above head height |
| minimap | a 2D canvas redrawn from `useFrame`, sharing the plan data; click → convert pixels back to metres → teleport |

:::tip From toy to product
Real plans come from CAD/BIM (DXF, IFC) or from floor-plan apps and scanners (Apple RoomPlan exports USDZ, many tools export glTF). Production tours add baked lighting (lightmaps from Blender) for photoreal interiors at low cost, 360° photos or Gaussian splats for "as-built" realism, and an editor where users drag walls and furniture, with the same "data → geometry" pipeline rebuilding the model.
:::

:::exercise Extend it
1. Collide with **furniture**: treat each piece taller than 0.3 m as an axis-aligned rectangle and push the walker out of it.
2. Add **doors that open**: a hinged door leaf at each door opening that swings open when the walker comes within 1.5 m.
3. Add a **ceiling** that is hidden in dollhouse/plan modes and visible when walking, plus ceiling lights per room.
4. Build a **mini editor**: in plan view, drag a wall endpoint (snap to 0.1 m) and rebuild `WALLS`, floors and areas live.
5. Add **measurements**: dimension lines with lengths along each outer wall in plan view.
:::

:::keypoints
- Keep the plan as **data**, and derive geometry, labels, areas, maps and physics from it.
- Split wall segments around openings into pieces, sills, lintels and glass.
- Build floors from polygons with `ShapeGeometry` and compute areas with the shoelace formula.
- Offer several **views**: orthographic plan, orbiting dollhouse, first-person walk.
- Simple **circle-vs-segment** collision is enough for walkthroughs; door gaps fall out of the data naturally.
:::
