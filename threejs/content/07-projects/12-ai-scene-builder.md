---
title: AI Scene Builder
level: advanced
time: 75
icon: bot
cover: #059669,#4f46e5
tags: LLM tool calling, zod schemas, JSON Schema, validation, undo/redo, scene summaries, GLTFExporter, Claude API
summary: Describe a room in plain language and watch it appear. Requests become tool calls (add, update, arrange, delete, lighting) defined once as zod schemas, converted to JSON Schema for the model, and validated before they touch the scene. The app has a full trace, undo/redo, a scene summary for the model, glTF export, a built-in offline planner, and a drop-in endpoint for Claude with the server code included.
---

This capstone ties the course together with the AI lesson (6.8): a natural-language **scene builder**. The pattern is the one used by AI design tools, configurators with chat, and "text to layout" features: the model never touches WebGL; it proposes **structured actions**, and your app validates and applies them to state, with undo for anything the user doesn't like.

:::flow How it fits together
Schemas | each tool's input defined once with zod → JSON Schema for the model, runtime validation for the app
Prompt | user text + a compact scene summary (ids, kinds, positions) + room rules
Plan | offline mock planner, or your endpoint calling Claude
Validate | schema parse + semantic checks (ids exist, inside the room) → ✓ applied or ✗ rejected with the reason
Apply | a pure reducer over immutable state → history for undo/redo; render; export glTF
:::

## Step 1: One schema, three jobs

A zod schema gives you the **JSON Schema** the model needs, **runtime validation** of what the model sends back, and **TypeScript types** for free. Edit the test calls and see what passes:

```js run title="Step 1 · zod tool schemas → JSON Schema + validation" height=420
import { z } from "zod";

const KINDS = ["sofa", "armchair", "chair", "table", "desk", "lamp", "plant", "shelf", "rug"];
const add_object = z.object({
  kind: z.enum(KINDS).describe("What to place"),
  x: z.number().min(-4).max(4).describe("Metres, left (-) / right (+)"),
  z: z.number().min(-3).max(3).describe("Metres, back wall (-3) / front (+3)"),
  rotation: z.number().default(0).describe("Degrees; 0 faces the viewer"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

// 1. what you send to the model as the tool's input_schema
const jsonSchema = z.toJSONSchema(add_object);

// 2. what you do with what comes back
const tests = [
  { kind: "sofa", x: 0, z: -2 },
  { kind: "spaceship", x: 0, z: 0 },
  { kind: "lamp", x: 9, z: 0, color: "teal" },
];
const results = tests.map((input) => {
  const r = add_object.safeParse(input);
  return `${JSON.stringify(input)}\n  → ${r.success ? "✓ " + JSON.stringify(r.data) : "✗ " + z.prettifyError(r.error).replace(/\n/g, "\n    ")}`;
});

document.body.innerHTML = `<div style="padding:14px;height:100%;overflow:auto;font:12px/1.5 ui-monospace,monospace">
  <b>input_schema sent to the model</b><pre>${JSON.stringify(jsonSchema, null, 2)}</pre>
  <b>validating model output</b><pre>${results.join("\n\n")}</pre></div>`;
```

Note how `rotation` was filled in with its default, and how the error messages are specific enough to send back to the model so it can correct itself (that's the agent loop below).

## Step 2: The builder

Try the example prompts, chain edits ("make the sofa green", "arrange the chairs in a circle"), then **Undo**/**Redo**, and **Export .glb** to open the result in any 3D tool. The built-in planner is a small keyword-and-recipe engine so the demo runs offline; paste your own endpoint URL to use a real model.

```jsx run title="AI Scene Builder · complete app" level=advanced height=660
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Grid } from "@react-three/drei";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { z } from "zod";

// ---------- 1. object library: real sizes, procedural models ----------
const LIB = {
  sofa: { w: 2.0, d: 0.9, color: "#475569" }, armchair: { w: 0.8, d: 0.8, color: "#0f766e" }, chair: { w: 0.45, d: 0.5, color: "#a16207" },
  table: { w: 1.2, d: 0.75, color: "#92400e" }, desk: { w: 1.4, d: 0.7, color: "#e7e5e4" }, lamp: { w: 0.35, d: 0.35, color: "#f59e0b" },
  plant: { w: 0.45, d: 0.45, color: "#15803d" }, shelf: { w: 0.9, d: 0.35, color: "#78350f" }, rug: { w: 2.4, d: 1.6, color: "#c084fc" },
};
const KINDS = Object.keys(LIB);
const B = ({ p, s, c, r = 0.7 }) => <mesh position={p} castShadow receiveShadow><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={r} /></mesh>;
const legs = (w, d, h, c = "#3f2d1e") => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b], i) => <B key={i} p={[a * (w / 2 - 0.05), h / 2, b * (d / 2 - 0.05)]} s={[0.04, h, 0.04]} c={c} />);
function Model({ kind, color }) {
  switch (kind) {
    case "sofa": return <group>{legs(2, 0.9, 0.12)}<B p={[0, 0.25, 0]} s={[2, 0.26, 0.9]} c={color} r={0.95} /><B p={[0, 0.6, -0.36]} s={[2, 0.5, 0.18]} c={color} r={0.95} />{[-1, 1].map((k) => <B key={k} p={[k * 0.92, 0.48, 0]} s={[0.16, 0.36, 0.9]} c={color} r={0.95} />)}</group>;
    case "armchair": return <group>{legs(0.8, 0.8, 0.12)}<B p={[0, 0.25, 0]} s={[0.8, 0.26, 0.8]} c={color} r={0.95} /><B p={[0, 0.6, -0.33]} s={[0.8, 0.5, 0.14]} c={color} r={0.95} />{[-1, 1].map((k) => <B key={k} p={[k * 0.34, 0.47, 0]} s={[0.12, 0.3, 0.8]} c={color} r={0.95} />)}</group>;
    case "chair": return <group>{legs(0.45, 0.45, 0.44, color)}<B p={[0, 0.46, 0]} s={[0.45, 0.04, 0.45]} c={color} /><B p={[0, 0.72, -0.2]} s={[0.45, 0.5, 0.04]} c={color} /></group>;
    case "table": return <group>{legs(1.2, 0.75, 0.72, "#3f2d1e")}<B p={[0, 0.74, 0]} s={[1.2, 0.04, 0.75]} c={color} r={0.4} /></group>;
    case "desk": return <group>{legs(1.4, 0.7, 0.72, "#334155")}<B p={[0, 0.74, 0]} s={[1.4, 0.03, 0.7]} c={color} r={0.5} /><B p={[0.45, 0.58, 0]} s={[0.4, 0.26, 0.6]} c={color} /><B p={[0, 1.0, -0.2]} s={[0.55, 0.32, 0.03]} c="#111827" r={0.2} /></group>;
    case "lamp": return <group><B p={[0, 0.02, 0]} s={[0.3, 0.04, 0.3]} c="#1f2937" /><B p={[0, 0.75, 0]} s={[0.03, 1.45, 0.03]} c="#1f2937" /><mesh position-y={1.5}><cylinderGeometry args={[0.12, 0.17, 0.26, 24, 1, true]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} side={THREE.DoubleSide} /></mesh></group>;
    case "plant": return <group><mesh position-y={0.16} castShadow><cylinderGeometry args={[0.18, 0.14, 0.32, 20]} /><meshStandardMaterial color="#c2410c" /></mesh>{[[0, 0.6, 0, 0.24], [0.1, 0.85, 0.05, 0.17], [-0.1, 0.8, -0.05, 0.18]].map(([x, y, zz, r], i) => <mesh key={i} position={[x, y, zz]} castShadow><icosahedronGeometry args={[r, 1]} /><meshStandardMaterial color={color} flatShading /></mesh>)}</group>;
    case "shelf": return <group>{[-1, 1].map((k) => <B key={k} p={[k * 0.435, 0.9, 0]} s={[0.03, 1.8, 0.35]} c={color} />)}{[0.02, 0.6, 1.2, 1.78].map((y) => <B key={y} p={[0, y, 0]} s={[0.9, 0.03, 0.35]} c={color} />)}</group>;
    case "rug": return <mesh position-y={0.006} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[2.4, 1.6]} /><meshStandardMaterial color={color} roughness={1} /></mesh>;
    default: return null;
  }
}

// ---------- 2. tools: zod schemas = JSON Schema for the model + runtime validation ----------
const Id = z.string().describe("An existing object id, e.g. chair-2");
const X = z.number().min(-4).max(4), Zc = z.number().min(-3).max(3), Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const TOOLS = {
  add_object: { description: "Place a new object on the floor", schema: z.object({ kind: z.enum(KINDS), x: X, z: Zc, rotation: z.number().default(0), color: Hex.optional() }) },
  update_object: { description: "Move, turn, recolour or rescale an object", schema: z.object({ id: Id, x: X.optional(), z: Zc.optional(), rotation: z.number().optional(), color: Hex.optional(), scale: z.number().min(0.4).max(2.5).optional() }) },
  delete_object: { description: "Remove an object", schema: z.object({ id: Id }) },
  arrange: { description: "Lay out several objects in a row, circle or grid around a centre", schema: z.object({ ids: z.array(Id).min(2), layout: z.enum(["row", "circle", "grid"]), cx: X.default(0), cz: Zc.default(0), spacing: z.number().min(0.4).max(3).default(1.2) }) },
  set_lighting: { description: "Lighting mood", schema: z.object({ preset: z.enum(["day", "sunset", "night"]) }) },
  clear_scene: { description: "Remove everything", schema: z.object({}) },
};
// exactly what a server would send as `tools` to the model
const TOOL_DEFS = Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, input_schema: z.toJSONSchema(t.schema) }));

// ---------- 3. a pure reducer: (state, validated call) → new state ----------
const empty = { objects: [], counter: {}, lighting: "day" };
function apply(state, name, a) {
  const objs = state.objects;
  switch (name) {
    case "add_object": {
      const n = (state.counter[a.kind] ?? 0) + 1;
      return { ...state, counter: { ...state.counter, [a.kind]: n },
        objects: [...objs, { id: `${a.kind}-${n}`, kind: a.kind, x: a.x, z: a.z, rotation: a.rotation, color: a.color ?? LIB[a.kind].color, scale: 1 }] };
    }
    case "update_object": return { ...state, objects: objs.map((o) => (o.id === a.id ? { ...o, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)) } : o)) };
    case "delete_object": return { ...state, objects: objs.filter((o) => o.id !== a.id) };
    case "arrange": {
      const n = a.ids.length, cols = Math.ceil(Math.sqrt(n)), r = Math.max(a.spacing, (a.spacing * n) / (2 * Math.PI));
      const pos = (i) => a.layout === "row" ? [a.cx + (i - (n - 1) / 2) * a.spacing, a.cz]
        : a.layout === "grid" ? [a.cx + ((i % cols) - (cols - 1) / 2) * a.spacing, a.cz + (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * a.spacing]
        : [a.cx + Math.sin((i / n) * Math.PI * 2) * r, a.cz + Math.cos((i / n) * Math.PI * 2) * r];
      return { ...state, objects: objs.map((o) => {
        const i = a.ids.indexOf(o.id);
        if (i < 0) return o;
        const [x, zz] = pos(i);
        // circles face the centre; rows and grids face the viewer
        const rotation = a.layout === "circle" ? THREE.MathUtils.radToDeg(Math.atan2(a.cx - x, a.cz - zz)) : 0;
        return { ...o, x, z: zz, rotation };
      }) };
    }
    case "set_lighting": return { ...state, lighting: a.preset };
    case "clear_scene": return { ...state, objects: [] };
    default: return state;
  }
}
// validation = schema + semantics; returns [newState, traceLine]
function run(state, call) {
  const tool = TOOLS[call.name];
  if (!tool) return [state, { ...call, ok: false, why: "unknown tool" }];
  const parsed = tool.schema.safeParse(call.input ?? {});
  if (!parsed.success) return [state, { ...call, ok: false, why: z.prettifyError(parsed.error) }];
  const a = parsed.data, ids = new Set(state.objects.map((o) => o.id));
  const missing = [a.id, ...(a.ids ?? [])].filter((id) => id && !ids.has(id));
  if (missing.length) return [state, { ...call, ok: false, why: `no object ${missing.join(", ")}` }];
  return [apply(state, call.name, a), { ...call, input: a, ok: true }];
}

// ---------- 4. the offline planner (stands in for the model) ----------
const COLORS = { red: "#dc2626", orange: "#ea580c", yellow: "#ca8a04", green: "#16a34a", teal: "#0d9488", blue: "#2563eb", purple: "#9333ea", pink: "#db2777", white: "#f5f5f4", black: "#1c1917", grey: "#6b7280", gray: "#6b7280" };
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const RECIPES = {
  living: { text: "A cosy living area: sofa facing a coffee table on a rug, an armchair, a reading lamp and a plant.", calls: [
    ["rug", 0, 0.2], ["sofa", 0, -1.6], ["table", 0, 0.1, 0, "#a16207"], ["armchair", -2.1, 0.3, 90], ["lamp", -2.3, -1.7], ["plant", 2.0, -2.2], ["shelf", 3.4, -2.6]] },
  office: { text: "A home office: desk against the back wall, chair, task lamp, bookshelf and a plant.", calls: [
    ["desk", 0, -2.3], ["chair", 0, -1.6, 180], ["lamp", 1.1, -2.5], ["shelf", -2.4, -2.7], ["shelf", -1.4, -2.7], ["plant", 2.3, -2.4], ["rug", 0, -1.4, 0, "#94a3b8"]] },
  dining: { text: "A dining set: a table with six chairs arranged around it, plus a plant in the corner.", calls: [
    ["table", 0, 0], ...Array.from({ length: 6 }, () => ["chair", 0, 0]), ["plant", 3.3, -2.4]], arrange: true },
};
function mockPlan(text, state) {
  const t = text.toLowerCase(), words = t.match(/[a-z]+|\d+/g) ?? [];
  const kindOf = (w) => KINDS.find((k) => w === k || w === k + "s" || w === k + "es");
  const kind = words.map(kindOf).find(Boolean), colorWord = words.find((w) => COLORS[w]);
  const targets = kind ? state.objects.filter((o) => o.kind === kind) : /\b(everything|all|them)\b/.test(t) ? state.objects : state.objects.slice(-1);
  const each = (name, extra) => targets.map((o) => ({ name, input: { id: o.id, ...extra(o) } }));
  const counts = { ...state.counter };
  const add = (k, x, zz, rotation = 0, color) => { counts[k] = (counts[k] ?? 0) + 1; return { name: "add_object", input: { kind: k, x, z: zz, rotation, ...(color && { color }) } }; };

  const recipe = /living|lounge|cosy|cozy/.test(t) ? "living" : /office|desk|study|work/.test(t) && !/\badd\b/.test(t) ? "office" : /dining|dinner/.test(t) ? "dining" : null;
  if (recipe) {
    const R = RECIPES[recipe];
    const calls = [{ name: "clear_scene", input: {} }, ...R.calls.map((c) => add(...c))];
    if (R.arrange) calls.push({ name: "arrange", input: { ids: Array.from({ length: 6 }, (_, i) => `chair-${i + 1}`), layout: "circle", cx: 0, cz: 0, spacing: 1.15 } });
    return { text: R.text, calls, resetCounter: true };   // ids restart at 1 in a fresh room
  }
  if (/\b(night|sunset|day|evening|morning)\b/.test(t)) return { text: "Changing the light.", calls: [{ name: "set_lighting", input: { preset: /night|evening/.test(t) ? "night" : /sunset/.test(t) ? "sunset" : "day" } }] };
  if (/\b(clear|empty|reset)\b/.test(t)) return { text: "Cleared the room.", calls: [{ name: "clear_scene", input: {} }] };
  if (/\b(add|place|put|another)\b/.test(t) && kind) {
    const n = Math.min(6, +words.find((w) => /^\d+$/.test(w)) || NUM[words.find((w) => NUM[w])] || 1), calls = [];
    for (let i = 0; i < n; i++) {
      // find a free spot on a 0.9 m grid, away from existing objects
      let spot = [0, 0];
      search: for (let r = 0; r < 8; r++) for (let a = 0; a < 16; a++) {
        const x = Math.round(Math.sin(a * 2.4) * r * 0.9 * 10) / 10, zz = Math.round(Math.cos(a * 2.4) * r * 0.6 * 10) / 10;
        const busy = [...state.objects, ...calls.map((c) => c.input)].some((o) => Math.hypot(o.x - x, o.z - zz) < 1.0);
        if (!busy && Math.abs(x) < 3.6 && Math.abs(zz) < 2.6) { spot = [x, zz]; break search; }
      }
      calls.push(add(kind, spot[0], spot[1], 0, colorWord && COLORS[colorWord]));
    }
    return { text: `Added ${n} ${kind}${n > 1 ? "s" : ""}.`, calls };
  }
  if (/\b(arrange|circle|row|grid|around)\b/.test(t) && targets.length > 1) {
    const layout = /circle|around/.test(t) ? "circle" : /grid/.test(t) ? "grid" : "row";
    const table = state.objects.find((o) => o.kind === "table");
    return { text: `Arranged ${targets.length} objects in a ${layout}.`, calls: [{ name: "arrange", input: { ids: targets.map((o) => o.id), layout, cx: table && layout === "circle" ? table.x : 0, cz: table && layout === "circle" ? table.z : 0, spacing: 1.2 } }] };
  }
  if (/\b(remove|delete)\b/.test(t)) return { text: "Removed.", calls: each("delete_object", () => ({})) };
  const dir = { left: [-0.5, 0], right: [0.5, 0], forward: [0, 0.5], back: [0, -0.5] }[words.find((w) => ["left", "right", "forward", "back"].includes(w))];
  if (dir) return { text: "Moved.", calls: each("update_object", (o) => ({ x: +(o.x + dir[0]).toFixed(2), z: +(o.z + dir[1]).toFixed(2) })) };
  if (/\b(turn|rotate)\b/.test(t)) return { text: "Turned 90°.", calls: each("update_object", (o) => ({ rotation: o.rotation + 90 })) };
  if (/\b(bigger|larger|smaller)\b/.test(t)) return { text: "Rescaled.", calls: each("update_object", (o) => ({ scale: +((o.scale ?? 1) * (/smaller/.test(t) ? 0.8 : 1.25)).toFixed(2) })) };
  if (colorWord) return { text: `Painted ${colorWord}.`, calls: each("update_object", () => ({ color: COLORS[colorWord] })) };
  return { text: "I can build a living room, office or dining room, add objects, move, turn, recolour, resize, arrange, delete, or change the light.", calls: [] };
}

// ---------- 5. scene ----------
const LIGHTS = { day: ["#f8fafc", 1.0, 2.2, "#ffffff"], sunset: ["#fde2c8", 0.6, 2.0, "#fb923c"], night: ["#0f172a", 0.25, 0.4, "#93c5fd"] };
function Room({ state, groupRef }) {
  const [bg, env, sun, sunColor] = LIGHTS[state.lighting];
  return (
    <>
      <color attach="background" args={[bg]} />
      <Environment preset="apartment" environmentIntensity={env} />
      <directionalLight position={[3, 6, 4]} intensity={sun} color={sunColor} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[8, 6]} /><meshStandardMaterial color="#e7d8c3" /></mesh>
      <mesh position={[0, 1.4, -3.05]} receiveShadow><boxGeometry args={[8, 2.8, 0.1]} /><meshStandardMaterial color="#f1ede7" /></mesh>
      <mesh position={[-4.05, 1.4, 0]} receiveShadow><boxGeometry args={[0.1, 2.8, 6.2]} /><meshStandardMaterial color="#ebe5dd" /></mesh>
      <Grid args={[8, 6]} position-y={0.003} cellSize={0.5} cellColor="#d6c4ab" sectionSize={1} sectionColor="#c4ad8e" fadeDistance={30} />
      <group ref={groupRef} name="layout">
        {state.objects.map((o) => (
          <group key={o.id} name={o.id} position={[o.x, 0, o.z]} rotation-y={THREE.MathUtils.degToRad(o.rotation)} scale={o.scale ?? 1}>
            <Model kind={o.kind} color={o.color} />
          </group>
        ))}
      </group>
      <ContactShadows position-y={0.004} opacity={0.3} scale={10} blur={2.5} far={2} />
    </>
  );
}

// ---------- 6. app: chat, trace, history ----------
const EXAMPLES = ["Build a cosy living room", "Make the sofa green", "Add two plants", "Set up a dining room", "Arrange the chairs in a row", "Turn the armchair", "Make it sunset", "Home office please"];

export default function App() {
  const [history, setHistory] = useState({ past: [], present: empty, future: [] });
  const [trace, setTrace] = useState([]);
  const [text, setText] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const group = useRef();
  const state = history.present;

  // what the model sees: compact, with ids it can reference
  const summary = () => ({ room: { width: 8, depth: 6, x: [-4, 4], z: [-3, 3], units: "metres", rotation: "degrees, 0 faces +z (the viewer)" },
    lighting: state.lighting, objects: state.objects.map(({ id, kind, x, z, rotation, color, scale }) => ({ id, kind, x, z, rotation, color, scale })) });

  async function send(prompt) {
    if (!prompt.trim() || busy) return;
    setBusy(true); setText("");
    let plan;
    try {
      plan = endpoint
        ? await (await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, scene: summary(), tools: TOOL_DEFS }) })).json()
        : mockPlan(prompt, state);
    } catch (e) { plan = { text: `Endpoint error: ${e.message}`, calls: [] }; }
    let s = plan.resetCounter ? { ...state, counter: {} } : state;
    const lines = [];
    for (const call of plan.calls ?? []) { const [next, line] = run(s, call); s = next; lines.push(line); }
    if (lines.some((l) => l.ok)) setHistory((h) => ({ past: [...h.past, h.present].slice(-50), present: s, future: [] }));
    setTrace((t) => [{ prompt, text: plan.text, lines }, ...t].slice(0, 8));
    setBusy(false);
  }
  const undo = () => setHistory((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1), future: [h.present, ...h.future] } : h));
  const redo = () => setHistory((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));
  const exportGlb = async () => {
    const glb = await new GLTFExporter().parseAsync(group.current, { binary: true });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
    a.download = "scene.glb";
    a.click();
  };

  return (
    <>
      <Canvas shadows="percentage" camera={{ position: [3.6, 5.6, 7.8], fov: 42 }}>
        <Room state={state} groupRef={group} />
        <OrbitControls makeDefault target={[-1.3, 0.3, -0.3]} maxPolarAngle={1.45} />
      </Canvas>

      <div className="overlay" style={{ width: 300, maxHeight: "calc(100% - 20px)", overflow: "auto" }}>
        <form className="row" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe a change…" style={{ flex: 1 }} />
          <button className="primary" disabled={busy}>{busy ? "…" : "Send"}</button>
        </form>
        <div className="row">{EXAMPLES.map((ex) => <button key={ex} onClick={() => send(ex)} style={{ fontSize: 11, padding: "3px 7px" }}>{ex}</button>)}</div>
        <div style={{ font: "11px/1.45 ui-monospace, monospace" }}>
          {trace.length === 0 && <span className="muted">Tool calls and validation results appear here.</span>}
          {trace.map((t, i) => (
            <div key={i} style={{ opacity: i ? 0.55 : 1, borderTop: i ? "1px solid var(--border)" : "none", paddingTop: i ? 6 : 0, marginTop: i ? 6 : 0 }}>
              <b>“{t.prompt}”</b><div style={{ fontFamily: "inherit", color: "var(--muted)" }}>{t.text}</div>
              {t.lines.map((l, j) => (
                <div key={j} title={JSON.stringify(l.input)} style={{ color: l.ok ? "inherit" : "#dc2626", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.ok ? "✓" : "✗"} {l.name}({JSON.stringify(l.input)}){l.ok ? "" : ` → ${l.why}`}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="overlay right" style={{ width: 210 }}>
        <div className="row">
          <button onClick={undo} disabled={!history.past.length}>Undo</button>
          <button onClick={redo} disabled={!history.future.length}>Redo</button>
          <button onClick={exportGlb} disabled={!state.objects.length}>Export .glb</button>
        </div>
        <div className="muted" style={{ fontSize: 11.5 }}>{state.objects.length} objects · {state.lighting}</div>
        <label style={{ fontSize: 11.5, flexDirection: "column", alignItems: "stretch", gap: 4 }}>Model endpoint (blank = offline planner)
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://your-server/api/scene" style={{ fontSize: 11.5 }} />
        </label>
      </div>
    </>
  );
}
```

### The server: Claude with a real agent loop

The endpoint receives the prompt and scene summary and returns `{ text, calls }`. This version runs an **agent loop**: it lets the model call tools, applies them to a server-side copy of the scene with the same validation, and sends back `tool_result` blocks (including validation errors), so the model can see the outcome, fix mistakes and continue, up to a few rounds:

```js
// server.js (Node 20+): npm i express @anthropic-ai/sdk zod
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, TOOL_DEFS, run } from "./scene-tools.js";   // the same schemas + reducer as the client

const app = express();
app.use(express.json({ limit: "200kb" }));
const client = new Anthropic();                                // ANTHROPIC_API_KEY from the environment

app.post("/api/scene", async (req, res) => {
  const { prompt, scene } = req.body;
  if (typeof prompt !== "string" || prompt.length > 500) return res.status(400).json({ error: "bad prompt" });

  const system = `You arrange furniture in a 3D room by calling tools.
Room: 8 m wide (x −4…4) and 6 m deep (z −3 back wall … 3 front). Units are metres; rotation is degrees, 0 faces +z.
Keep 0.6 m walkways, put large items against walls, reference existing ids exactly.
When done, reply with one short sentence describing the result.`;
  const messages = [{ role: "user", content: `Scene: ${JSON.stringify(scene)}\n\nRequest: ${prompt}` }];
  let state = scene, calls = [], text = "";

  for (let round = 0; round < 4; round++) {                    // bounded agent loop
    const msg = await client.messages.create({ model: "claude-opus-5-5", max_tokens: 2048, system, tools: TOOL_DEFS, messages });
    messages.push({ role: "assistant", content: msg.content });
    text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join(" ");
    const uses = msg.content.filter((b) => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || !uses.length) break;

    const results = uses.map((u) => {
      const [next, line] = run(state, { name: u.name, input: u.input });
      state = next;
      if (line.ok) calls.push({ name: u.name, input: line.input });
      return { type: "tool_result", tool_use_id: u.id, content: line.ok ? "ok" : `error: ${line.why}`, is_error: !line.ok };
    });
    messages.push({ role: "user", content: results });          // the model sees what happened
  }
  res.json({ text, calls });
});

app.listen(3000);
```

Allow your page's origin with CORS, rate-limit the route, and log prompts and calls (they're the best debugging and evaluation data you'll have). Because the client **re-validates** every call it receives, a buggy or compromised server still can't put the scene into an invalid state.

## How it works

| Feature | Technique |
|---|---|
| tool definitions | zod schemas → `z.toJSONSchema()` for the model's `input_schema`; the **same** schemas validate responses with `safeParse` |
| semantic checks | after schema validation, ids must exist; failures are shown in red in the trace (and returned to the model as `tool_result` errors on the server) |
| state | `{ objects, counter, lighting }` updated only by a **pure reducer**; ids like `chair-3` are human- and model-readable |
| history | `{ past, present, future }` snapshots: undo/redo are array moves, and a batch of calls from one prompt is one undo step |
| scene summary | compact JSON: room bounds, units, rotation convention, objects with ids; this is all the model needs |
| arrange | a deterministic layout tool (row/circle/grid), so the model doesn't have to compute coordinates for common patterns; circles face their centre |
| offline planner | recipes + keyword rules producing the **same** tool calls a model would: the UI can't tell the difference |
| export | `GLTFExporter.parseAsync(group, { binary: true })` → `.glb` download of just the layout group |

:::warn Guardrails for AI-driven 3D
Keep tools **narrow and declarative** (never "run this JavaScript"), validate **schema and semantics** on both server and client, bound the agent loop, cap object counts and coordinate ranges, keep the API key server-side, and make every AI change **undoable** and visible in a trace. Users trust AI features they can inspect and reverse.
:::

:::exercise Extend it
1. Give the model **eyes**: send a `toDataURL()` screenshot with the request (an image content block) and add the instruction "check the layout visually before finishing".
2. Add a **`check_layout` tool** that returns overlaps (SAT from the AR project) and walkway violations, so the agent can fix its own clashes.
3. Add **streaming**: apply tool calls as they arrive (the SDK's streaming API) so objects pop in one by one.
4. Swap the procedural library for **glTF models** with a catalogue the model can query (`search_catalog(query) → items with ids and sizes`).
5. Build an **evaluation set**: 30 prompts with checks (object counts, no overlaps, items inside the room) and run it against your endpoint whenever you change the system prompt.
:::

:::keypoints
- The model proposes **structured tool calls**; your code validates and applies them. It never touches the renderer.
- Define tools once with **zod**: JSON Schema for the model, validation for the app, types for TypeScript.
- Send a **compact scene summary** with ids, units and conventions; provide high-level tools (like `arrange`) for common patterns.
- A **pure reducer + history** gives you undo/redo, traces and safe experimentation.
- Run a **bounded agent loop** on the server with `tool_result` feedback, and keep keys and guardrails server-side.
:::
