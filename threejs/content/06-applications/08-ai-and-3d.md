---
title: AI & 3D: Generation, Agents and Synthetic Data
level: intermediate
time: 45
summary: How AI and web 3D work together. Generative models produce 3D assets and whole worlds (text/image-to-3D, Gaussian-splat world models); language models drive scenes through tool calling; in-browser ML (hand, face and depth tracking) brings 3D to life; and three.js renders labelled synthetic data to train vision models. Includes a scene agent driven by tool calls and a synthetic-dataset generator with bounding boxes and masks.
---

AI touches 3D in four distinct ways, and a three.js developer can work in all of them:

| Direction | What happens | Examples |
|---|---|---|
| **AI makes 3D** | models generate meshes, textures, splats and whole scenes from text or images | Meshy, Tripo, Rodin, Hunyuan3D, TRELLIS, World Labs Marble |
| **AI controls 3D** | a language model turns plain-language requests into scene edits via **tool calls** | design assistants, configurators ("show me the oak version with a taller back"), BIM queries |
| **AI senses for 3D** | on-device ML tracks hands, faces, bodies and depth, driving 3D content | face filters, avatars, virtual try-on, 2.5D photo parallax |
| **3D makes AI** | rendered scenes become perfectly labelled **training data** for vision models | robotics, retail shelf detection, defect inspection, autonomous driving |

## AI makes 3D: generated assets

:::def Text/image-to-3D
Models that output a 3D asset (usually a textured mesh as **GLB**, sometimes a Gaussian splat) from a prompt or one or more photos. Modern systems generate geometry first, then PBR textures, and some offer automatic retopology, rigging and animation.
:::

| Tool | Notes |
|---|---|
| **Meshy** | text/image to 3D, AI texturing of existing meshes, remeshing, rigging; GLB/FBX/USDZ export; API |
| **Tripo** | fast image/text to 3D, rigging and animation, API |
| **Hyper3D Rodin** | high-detail production-oriented models, PBR materials |
| **Hunyuan3D** (Tencent) | open weights: run it yourself; strong shape and texture quality |
| **TRELLIS** (Microsoft) | open structured-latent model; outputs meshes, radiance fields or splats |
| **World Labs Marble** | generates explorable **worlds** (exportable as Gaussian splats and meshes) from text, images or video; their open-source **Spark** renders splats in three.js |

Generated assets still go through the same **production pipeline** as hand-made ones before they reach a web page:

:::flow From prompt to web-ready asset
Generate | several variations; pick by silhouette and topology, not just the thumbnail
Clean up | fix scale (metres) and pivot (base at y = 0), remove floating fragments, check normals
Optimise | decimate or remesh to a triangle budget, resize textures, then `gltf-transform optimize` (Draco/Meshopt, KTX2)
Make it consistent | match materials/lighting across assets from different generators
Check rights | read the tool's licence for commercial use; avoid prompts that copy trademarked designs
:::

## AI controls 3D: tool calling

A language model can't touch your WebGL context, but it can **call functions you describe**. You declare tools (name, description, JSON-schema input), send the user's request and a summary of the scene, and the model replies with structured tool calls that your code validates and executes. This is the same pattern as any AI agent; the "environment" is your scene.

:::flow One round of a scene agent
User | "make the chairs walnut and add a lamp near the sofa"
Your server | sends the prompt + scene summary + tool definitions to the model (API key stays on the server)
Model | returns tool calls: `set_material({ids:[3,4], material:"walnut"})`, `add_object({type:"lamp", near:7})`
Your client | validates inputs (schema, ids exist, limits) and applies them to scene state
Loop | optionally send results back (`tool_result`) so the model can continue or explain
:::

The server side with the Anthropic SDK (Node). Never call a model API directly from the browser with your secret key:

```js
// server.js — POST /api/scene-agent  { prompt, scene }
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS } from "./scene-tools.js"; // the same tool list the client executes

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

export async function sceneAgent(req, res) {
  const { prompt, scene } = req.body;
  const msg = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    system:
      "You edit a 3D scene by calling tools. Units are metres, y is up, the floor is y = 0. " +
      "Only reference ids that exist. Current scene: " + JSON.stringify(scene),
    tools: TOOLS,
    messages: [{ role: "user", content: prompt }],
  });
  // content is a list of blocks: text and/or { type: "tool_use", id, name, input }
  const calls = msg.content.filter((b) => b.type === "tool_use").map(({ name, input }) => ({ name, input }));
  res.json({ calls });
}
```

The live demo below runs the **client half** for real: the same tool definitions, a trace of every call, and a reducer that executes them. To keep it offline and free, a tiny keyword "planner" stands in for the model; swap `mockPlan` for a `fetch("/api/scene-agent")` and nothing else changes.

```jsx run title="Scene agent: requests → tool calls → scene" level=intermediate height=540
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";

// 1. The tools, described exactly as you'd send them to the model
const SHAPES = ["box", "sphere", "cone", "torus", "cylinder"];
const TOOLS = [ // send these as `tools` in the API request
  { name: "add_object", description: "Add a primitive resting on the floor",
    input_schema: { type: "object", properties: { shape: { enum: SHAPES }, color: { type: "string" } }, required: ["shape", "color"] } },
  { name: "set_color", description: "Change an object's colour", input_schema: { type: "object", properties: { id: { type: "integer" }, color: { type: "string" } }, required: ["id", "color"] } },
  { name: "move_object", description: "Move by a delta in metres", input_schema: { type: "object", properties: { id: { type: "integer" }, delta: { type: "array", items: { type: "number" } } }, required: ["id", "delta"] } },
  { name: "scale_object", description: "Multiply size", input_schema: { type: "object", properties: { id: { type: "integer" }, factor: { type: "number" } }, required: ["id", "factor"] } },
  { name: "delete_object", description: "Remove an object", input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] } },
  { name: "set_lighting", description: "Lighting mood", input_schema: { type: "object", properties: { preset: { enum: ["day", "sunset", "night", "studio"] } }, required: ["preset"] } },
];

// 2. Stand-in for the model: keyword rules that emit the same tool calls
const COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "white", "black"];
const ALIAS = { box: "box", cube: "box", sphere: "sphere", ball: "sphere", cone: "cone", torus: "torus", ring: "torus", donut: "torus", cylinder: "cylinder" };
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const DIRS = { left: [-1, 0, 0], right: [1, 0, 0], up: [0, 0.6, 0], down: [0, -0.6, 0], forward: [0, 0, 1], back: [0, 0, -1] };
const shapeOf = (w) => ALIAS[w] || ALIAS[w.replace(/es$/, "")] || ALIAS[w.replace(/s$/, "")];

function mockPlan(text, objects) {
  const t = text.toLowerCase();
  const words = t.match(/[a-z]+|\d+/g) || [];
  const color = words.find((w) => COLORS.includes(w));
  const shape = words.map(shapeOf).find(Boolean);
  const count = Math.min(5, +words.find((w) => /^\d+$/.test(w)) || NUM[words.find((w) => NUM[w])] || 1);
  const targets = shape ? objects.filter((o) => o.shape === shape)
    : /\b(everything|all|them)\b/.test(t) ? objects : objects.slice(-1);
  const each = (name, input) => targets.map((o) => ({ name, input: { id: o.id, ...input } }));
  const light = words.find((w) => ["day", "sunset", "night", "studio"].includes(w));

  if (light) return [{ name: "set_lighting", input: { preset: light } }];
  if (/\b(add|create|put|place|spawn)\b/.test(t))
    return Array.from({ length: count }, () => ({ name: "add_object", input: { shape: shape || "box", color: color || "white" } }));
  if (/\b(clear|reset)\b/.test(t)) return objects.map((o) => ({ name: "delete_object", input: { id: o.id } }));
  if (/\b(remove|delete)\b/.test(t)) return each("delete_object", {});
  const dir = words.find((w) => DIRS[w]);
  if (dir) return each("move_object", { delta: DIRS[dir] });
  if (/\b(bigger|larger|grow)\b/.test(t)) return each("scale_object", { factor: 1.4 });
  if (/\b(smaller|shrink)\b/.test(t)) return each("scale_object", { factor: 0.7 });
  if (color) return each("set_color", { color });
  return [];
}

// 3. Execute validated tool calls against scene state (a pure reducer)
function execute(state, { name, input }) {
  const find = (id) => state.objects.find((o) => o.id === id);
  if (name !== "add_object" && name !== "set_lighting" && !find(input.id)) return state; // reject unknown ids
  const patch = (fn) => ({ ...state, objects: state.objects.map((o) => (o.id === input.id ? fn(o) : o)) });
  switch (name) {
    case "add_object": {
      if (!SHAPES.includes(input.shape) || state.objects.length >= 15) return state;
      const id = state.nextId, slot = id % 15;
      const position = [((slot % 5) - 2) * 1.3, 0.5, 1 - Math.floor(slot / 5) * 1.3];
      return { ...state, nextId: id + 1, objects: [...state.objects, { id, shape: input.shape, color: input.color, position, scale: 1 }] };
    }
    case "set_color": return patch((o) => ({ ...o, color: input.color }));
    case "move_object": return patch((o) => ({ ...o, position: o.position.map((v, i) => (i === 1 ? Math.max(0.5, v + input.delta[i]) : v + input.delta[i])) }));
    case "scale_object": return patch((o) => ({ ...o, scale: Math.min(3, Math.max(0.3, o.scale * input.factor)) }));
    case "delete_object": return { ...state, objects: state.objects.filter((o) => o.id !== input.id) };
    case "set_lighting": return { ...state, lighting: input.preset };
    default: return state;
  }
}

const LIGHTS = {
  day: { bg: "#dbeafe", sun: "#ffffff", power: 2.5, amb: 0.7 },
  sunset: { bg: "#fed7aa", sun: "#fb923c", power: 2.4, amb: 0.4 },
  night: { bg: "#0f172a", sun: "#93c5fd", power: 0.8, amb: 0.15 },
  studio: { bg: "#e5e7eb", sun: "#ffffff", power: 1.6, amb: 1.1 },
};

function Shape({ o }) {
  return (
    <mesh position={o.position} scale={o.scale} castShadow>
      {o.shape === "box" && <boxGeometry args={[0.8, 0.8, 0.8]} />}
      {o.shape === "sphere" && <sphereGeometry args={[0.5, 32, 16]} />}
      {o.shape === "cone" && <coneGeometry args={[0.5, 1, 32]} />}
      {o.shape === "torus" && <torusGeometry args={[0.38, 0.14, 16, 48]} />}
      {o.shape === "cylinder" && <cylinderGeometry args={[0.4, 0.4, 0.9, 32]} />}
      <meshStandardMaterial color={o.color} roughness={0.4} />
    </mesh>
  );
}

const EXAMPLES = ["add three red spheres", "make the boxes green", "move the sphere up", "make everything bigger", "sunset lighting", "remove the cones", "clear"];

export default function App() {
  const [state, setState] = useState({
    nextId: 3, lighting: "day",
    objects: [{ id: 0, shape: "box", color: "blue", position: [-1.3, 0.5, 1], scale: 1 },
              { id: 1, shape: "cone", color: "orange", position: [0, 0.5, 1], scale: 1 },
              { id: 2, shape: "torus", color: "purple", position: [1.3, 0.5, 1], scale: 1 }],
  });
  const [text, setText] = useState("");
  const [trace, setTrace] = useState([]);

  const send = (prompt) => {
    const calls = mockPlan(prompt, state.objects);   // ← fetch("/api/scene-agent") in production
    setState((s) => calls.reduce(execute, s));
    setTrace((t) => [{ prompt, calls }, ...t].slice(0, 4));
    setText("");
  };
  const L = LIGHTS[state.lighting];

  return (
    <>
      <div className="overlay" style={{ width: 300 }}>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask for a change…" style={{ flex: 1, padding: "6px 8px", borderRadius: 8, border: "1px solid #ccc" }} />
          <button className="primary">Send</button>
        </form>
        <div className="row">{EXAMPLES.map((ex) => <button key={ex} onClick={() => send(ex)} style={{ fontSize: 11, padding: "3px 7px" }}>{ex}</button>)}</div>
      </div>
      <div className="overlay right bottom" style={{ width: 260, maxHeight: "55%", overflow: "auto", font: "11px/1.45 ui-monospace, monospace" }}>
        {trace.length === 0 && <span className="muted">Tool calls appear here</span>}
        {trace.map((t, i) => (
          <div key={i} style={{ opacity: i ? 0.55 : 1 }}>
            <b>“{t.prompt}”</b>
            {t.calls.length ? t.calls.map((c, j) => <div key={j}>{c.name}({JSON.stringify(c.input)})</div>) : <div className="muted">no tool calls (a real model would ask or explain)</div>}
          </div>
        ))}
      </div>
      <Canvas shadows="percentage" camera={{ position: [0, 4, 8], fov: 45 }}>
        <color attach="background" args={[L.bg]} />
        <ambientLight intensity={L.amb} />
        <directionalLight position={[4, 6, 3]} color={L.sun} intensity={L.power} castShadow />
        {state.objects.map((o) => <Shape key={o.id} o={o} />)}
        <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[14, 10]} /><meshStandardMaterial color={state.lighting === "night" ? "#1e293b" : "#f5f5f4"} /></mesh>
        <ContactShadows opacity={0.35} />
        <OrbitControls target={[0, 0.5, 0]} />
      </Canvas>
    </>
  );
}
```

:::warn Treat model output as untrusted input
Tool calls are suggestions, not commands. **Validate every input** (schema, enum values, ids that exist, numeric limits like the 15-object cap and scale clamp above), keep tools **narrow** (`set_color`, not `eval_js`), and require confirmation for destructive actions. Keep the API key on the server and rate-limit the endpoint.
:::

Ways to make a scene agent good:

- **Send a compact scene summary**, not the whole glTF: ids, names, types, positions, materials. Give objects meaningful names so "the sofa" resolves.
- **Describe units and axes** in the system prompt (metres, y-up) so spatial requests land correctly.
- **Return results** (`tool_result` blocks) when the model needs to see the effect, e.g. "place it where it doesn't overlap", and let it loop a few times.
- **Undo is mandatory**: a reducer over immutable state (as above) gives you history for free.
- Vision models can also **look**: send a `canvas.toDataURL()` screenshot so the model can judge composition.
- **MCP servers** expose the same idea to agents in desktop tools; for example, community Blender MCP servers let an assistant build scenes in Blender that you then export as glTF.

## AI senses for 3D: in-browser ML

Small models run in the browser at interactive rates (WebGL/WebGPU/WASM), producing data that drives three.js:

| Model output | 3D use | Libraries |
|---|---|---|
| face landmarks + blendshapes | face filters, avatar puppeteering, glasses try-on | MediaPipe Face Landmarker |
| hand landmarks | gesture controls, hand-tracked UIs without a headset | MediaPipe Hand Landmarker |
| body pose | fitness apps, motion capture to a rigged avatar | MediaPipe Pose, TensorFlow.js |
| monocular depth | turn a photo into a displaced mesh with parallax | Transformers.js (Depth Anything) |
| segmentation | cut out a person/product and place them in a 3D scene | MediaPipe, Transformers.js |

The pattern is always the same: grab a video frame, run the model, map its output (landmarks in normalised image space, blendshape weights 0–1) onto your scene: positions, bone rotations or `mesh.morphTargetInfluences`.

## 3D makes AI: synthetic training data

Training a detector needs thousands of labelled images. Rendering them is faster and labels are **exact**, because you know where every object is. **Domain randomisation** varies colours, poses, lighting, backgrounds and camera angles so the model learns the object, not the scene. Click *New sample* repeatedly, and toggle the segmentation mask:

```js run title="Synthetic dataset generator (bounding boxes + masks)" level=advanced height=500
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

// 2D layer for drawing labels on top of the render
const labels = document.createElement("canvas");
Object.assign(labels.style, { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none" });
document.body.append(labels);
const ctx = labels.getContext("2d");

const CLASSES = [
  { name: "box", geo: new THREE.BoxGeometry(0.8, 0.8, 0.8), mask: "#ef4444" },
  { name: "ball", geo: new THREE.SphereGeometry(0.45, 32, 16), mask: "#22c55e" },
  { name: "donut", geo: new THREE.TorusGeometry(0.35, 0.14, 16, 48), mask: "#3b82f6" },
  { name: "cone", geo: new THREE.ConeGeometry(0.4, 0.9, 32), mask: "#eab308" },
];
CLASSES.forEach((c) => c.geo.computeBoundingBox());

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
const sun = new THREE.DirectionalLight(0xffffff, 2);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial());
ground.rotation.x = -Math.PI / 2;
scene.add(hemi, sun, ground);

let items = [], sample = 0, showMask = false, annotations = [], bg = new THREE.Color();
const BLACK = new THREE.Color("black");
const rand = (a, b) => a + Math.random() * (b - a);

function generate() {
  items.forEach((m) => scene.remove(m));
  items = [];
  sample++;
  // randomise the world: background, floor, light, camera
  bg.setHSL(Math.random(), rand(0.1, 0.5), rand(0.3, 0.85));
  ground.material.color.setHSL(Math.random(), rand(0, 0.4), rand(0.2, 0.8));
  sun.position.set(rand(-6, 6), rand(3, 8), rand(-6, 6));
  sun.intensity = rand(0.8, 3);
  hemi.intensity = rand(0.3, 1.2);
  const az = rand(0, Math.PI * 2), el = rand(0.35, 1.0), r = rand(5.5, 7.5);
  camera.position.set(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az));
  camera.lookAt(0, 0.3, 0);

  // randomise the objects: class, colour, pose, material
  const n = 3 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const cls = CLASSES[Math.floor(Math.random() * CLASSES.length)];
    const mat = new THREE.MeshStandardMaterial({ roughness: rand(0.1, 0.9), metalness: rand(0, 0.6) });
    mat.color.setHSL(Math.random(), rand(0.4, 0.9), rand(0.35, 0.65));
    const mesh = new THREE.Mesh(cls.geo, mat);
    mesh.userData = { cls, mat, maskMat: new THREE.MeshBasicMaterial({ color: cls.mask }) };
    mesh.rotation.set(Math.random() < 0.5 ? rand(0, Math.PI) : 0, rand(0, Math.PI * 2), 0);
    // spread them out: retry a few times to avoid heavy overlap
    for (let t = 0; t < 20; t++) {
      mesh.position.set(rand(-2.4, 2.4), 0, rand(-2.4, 2.4));
      if (items.every((o) => o.position.distanceTo(mesh.position) > 1.1)) break;
    }
    mesh.updateMatrixWorld();
    // rest it on the floor: lift by how far its rotated bounds go below y = 0
    const box = new THREE.Box3().setFromObject(mesh);
    mesh.position.y -= box.min.y;
    items.push(mesh);
    scene.add(mesh);
  }
  draw();
}

// project every vertex to screen space → tight 2D box in pixels
const v = new THREE.Vector3();
function bbox2D(mesh, w, h) {
  mesh.updateMatrixWorld();
  const pos = mesh.geometry.attributes.position;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(camera);
    const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0].map(Math.round) : null;
}

function draw() {
  const w = innerWidth, h = innerHeight;
  // mask mode: flat class colours, black background, no lighting
  scene.background = showMask ? BLACK : bg;
  items.forEach((m) => (m.material = showMask ? m.userData.maskMat : m.userData.mat));
  ground.visible = !showMask;
  renderer.render(scene, camera);

  annotations = items.map((m) => ({ class: m.userData.cls.name, bbox: bbox2D(m, w, h) })).filter((a) => a.bbox);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = "600 12px system-ui";
  for (const a of annotations) {
    const [x, y, bw, bh] = a.bbox;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, bh);
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(x, y - 16, ctx.measureText(a.class).width + 8, 16);
    ctx.fillStyle = "#fff"; ctx.fillText(a.class, x + 4, y - 4);
  }
  json.textContent = JSON.stringify({ image: `sample_${String(sample).padStart(5, "0")}.png`, width: w, height: h, objects: annotations }, null, 1)
    .replace(/\n\s+(\d|-)/g, " $1").replace(/\n\s+\]/g, "]");
}

// UI
const ui = document.createElement("div");
ui.className = "overlay";
ui.style.width = "250px";
ui.innerHTML = `<div class="row"><button class="primary" id="next">New sample</button><button id="mask">Mask view</button><button id="save">Save PNG</button></div>
  <pre id="json" style="margin:0;max-height:120px;overflow:auto;font:10px/1.4 ui-monospace,monospace"></pre>`;
document.body.append(ui);
const json = ui.querySelector("#json");
ui.querySelector("#next").onclick = () => { showMask = false; ui.querySelector("#mask").classList.remove("on"); generate(); };
ui.querySelector("#mask").onclick = (e) => {
  showMask = !showMask;
  e.target.classList.toggle("on", showMask);
  draw();
};
ui.querySelector("#save").onclick = () => {
  const a = document.createElement("a");
  a.href = renderer.domElement.toDataURL("image/png");
  a.download = `sample_${sample}.png`;
  a.click();
};

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  labels.width = innerWidth * devicePixelRatio; labels.height = innerHeight * devicePixelRatio;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (items.length) draw();
}
addEventListener("resize", resize);
resize();
generate();
```

Notice what the generator does that real-world labelling can't: boxes are pixel-exact, the mask gives a **per-pixel class label** for segmentation models, and you could just as easily export depth (from the depth buffer), surface normals, or 6-DoF object poses. Production pipelines (NVIDIA Omniverse Replicator, Unity Perception, BlenderProc) add photoreal rendering and physics-based placement; a three.js generator is ideal for quick, browser-based or domain-specific datasets.

:::tip Occlusion and the sim-to-real gap
These boxes ignore occlusion: a ball hidden behind a box still gets a full box. Real pipelines compute **visible** boxes from the mask (count each class colour's pixels with `readPixels`) and drop objects that are mostly hidden. To close the gap between rendered and real images, randomise more (textures, distractor objects, blur, noise, lens distortion) and mix in some real labelled photos.
:::

## AI helps you write three.js

Coding assistants are good at three.js because there's so much public code, but they also learned from **years of outdated examples**. Hold them to the current API:

- Name the versions in your prompt: "three r186, R3F 9, drei 10, ES module imports from `three/addons/`".
- Watch for removed and renamed APIs: `THREE.Clock` → `THREE.Timer`, `RGBELoader` → `HDRLoader`, `PCFSoftShadowMap` → `PCFShadowMap`/`VSMShadowMap`, `examples/js/` script tags → ES modules, `PostProcessing` → `RenderPipeline` for WebGPU.
- Ask for **small, runnable** pieces and run them, like the playgrounds in this course. Visual bugs only show up when you look.
- Paste the console error back verbatim; it's the fastest fix.

:::ai
The most valuable skill isn't prompting a generator; it's **integration**: knowing glTF, materials, performance budgets, coordinate systems and state management well enough to turn generated assets and model outputs into a fast, reliable product. That's exactly what this course has been building.
:::

## Check yourself

```quiz
? What format do most text/image-to-3D tools export for the web?
+ GLB (binary glTF), often with PBR textures
- PSD
- OBJ only, without textures
> Some also export USDZ, FBX or Gaussian splats; GLB is the web default.

? In a scene agent, what does the language model actually return?
+ Structured tool calls (name + JSON input) that your code validates and executes
- Raw WebGL commands
- A new three.js build
> The model never touches your renderer directly; your reducer applies its calls.

? Where should the model API key live?
+ On your server; the browser calls your endpoint
- In the client bundle
- In localStorage
> Anything shipped to the browser is public.

? Why is rendered synthetic data attractive for training vision models?
+ Labels (boxes, masks, depth, poses) are exact and free, and variation is unlimited
- It always looks identical to real photos
- It doesn't need a GPU
> The sim-to-real gap is handled with domain randomisation and some real data.

? What is domain randomisation?
+ Varying lighting, colours, poses, backgrounds and cameras so a model learns the object, not the scene
- Randomly choosing a web domain
- Training on one fixed scene
> The real world then looks like just another variation.
```

:::exercise Visible-only boxes
Extend the generator so each annotation also gets a **visible pixel count** from the mask: render the mask, read the pixels with `renderer.readRenderTargetPixels` (or a 2D canvas `getImageData` of a mask snapshot), count pixels per class colour, and drop objects with fewer than 200 visible pixels. (Hint: give each **instance** its own mask colour so two boxes don't merge.)
:::

:::solution
The key steps (add to the generator):

```js
// 1. unique colour per instance: encode the index in the red channel
items.forEach((m, i) => (m.userData.maskColor = new THREE.Color((i + 1) / 255, 0, 0)));

// 2. render the instance mask into a render target and read it back
const rt = new THREE.WebGLRenderTarget(256, 256);
function visibleCounts() {
  items.forEach((m) => (m.material = new THREE.MeshBasicMaterial({ color: m.userData.maskColor })));
  const bg = scene.background; scene.background = new THREE.Color(0, 0, 0); ground.visible = false;
  // colour management would gamma-encode our ids: render them linearly
  const cs = renderer.outputColorSpace; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
  renderer.outputColorSpace = cs; scene.background = bg; ground.visible = true;
  items.forEach((m) => (m.material = m.userData.mat));

  const px = new Uint8Array(256 * 256 * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, 256, 256, px);
  const counts = new Array(items.length).fill(0);
  for (let i = 0; i < px.length; i += 4) if (px[i]) counts[px[i] - 1]++;
  // scale counts from 256×256 to the full image area
  const scale = (innerWidth * innerHeight) / (256 * 256);
  return counts.map((c) => Math.round(c * scale));
}

// 3. in draw(): keep objects with enough visible pixels
const vis = visibleCounts();
annotations = items
  .map((m, i) => ({ class: m.userData.cls.name, bbox: bbox2D(m, w, h), visiblePx: vis[i] }))
  .filter((a) => a.bbox && a.visiblePx >= 200);
```
Using a small render target keeps the readback cheap; ids are written in linear colour space so the value you read is exactly the index you wrote.
:::

:::keypoints
- **AI makes 3D**: text/image-to-3D tools (Meshy, Tripo, Rodin, Hunyuan3D, TRELLIS) and world models output GLB or splats, which still need cleanup, optimisation and licence checks.
- **AI controls 3D** through **tool calling**: declare narrow tools, send a compact scene summary from your server, validate and execute calls in a reducer with undo.
- **AI senses for 3D**: MediaPipe and Transformers.js give face, hand, pose and depth data in the browser to drive scenes.
- **3D makes AI**: randomised renders give exact boxes, masks and depth for training vision models.
- Hold coding assistants to **current APIs** (r186, R3F 9) and run what they write.
:::
