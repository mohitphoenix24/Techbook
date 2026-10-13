---
title: WebGPU, TSL and Compute
summary: How WebGPU is organised (adapter, device, pipelines, bind groups, command encoders), what WebGPURenderer changes in three.js, writing materials and effects in TSL (three.js's shading language in JavaScript), compute shaders with storage buffers and workgroup maths, a 100,000-particle simulation, a migration checklist from WebGL, and WebGPU in R3F.
---

## How WebGPU is organised

:::def WebGPU objects
**Adapter**: a physical GPU (and driver). **Device**: your logical connection to it, which creates everything else. **Buffers** and **textures**: GPU memory. **Bind groups**: bundles of resources (uniform buffers, storage buffers, textures, samplers) handed to a shader together. **Pipelines**: immutable, pre-validated objects combining shaders with fixed state (blending, depth, vertex layout), one per material variant. **Command encoder**: records render and compute passes; the finished command buffer is submitted to the device's **queue**.
:::

@fig(webgpu_objects) The WebGPU object model. Expensive validation happens once when pipelines and bind groups are created; per frame, the CPU only records and submits cheap commands.

The design moves work from every draw call (WebGL validates state on each call) to creation time, which is why WebGPU can issue more draw calls per millisecond, and why **pipeline creation** (shader compilation) is the moment to watch for hitches.

```wgsl title="WGSL — a compute shader, for reference"
@group(0) @binding(0) var<storage, read_write> pos : array<vec3f>;
@group(0) @binding(1) var<uniform> dt : f32;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id : vec3u) {
  if (id.x >= arrayLength(&pos)) { return; }       // the last workgroup may run past the end
  pos[id.x].y -= 9.81 * dt;
}
```

You rarely write WGSL by hand with three.js: TSL generates it (or GLSL for the WebGL 2 fallback).

## WebGPURenderer in three.js

| Topic | WebGLRenderer | WebGPURenderer |
|---|---|---|
| Import | `three` | `three/webgpu` (+ `three/tsl` for nodes) |
| Initialisation | Synchronous | Asynchronous: `await renderer.init()` or `setAnimationLoop` |
| Backends | WebGL 2 | WebGPU, automatic WebGL 2 fallback (`forceWebGL: true` to test) |
| Built-in materials | Yes | Yes (converted to node materials internally) |
| Custom shaders | `ShaderMaterial`, `onBeforeCompile` | Node materials + TSL only |
| Post-processing | `EffectComposer` | `RenderPipeline` + TSL nodes (MRT built in) |
| Compute | No | `renderer.compute(node)` |
| Many lights | Forward, all lights per fragment | Clustered (Forward+) lighting since r185 |
| WebXR | Yes | Yes, since r185 |
| Depth | Standard; reversed optional | Reversed depth supported (r183) |

:::warn Not everything ports automatically
Custom `ShaderMaterial`s, `onBeforeCompile` hacks, `EffectComposer` passes and libraries built on them (including `@react-three/postprocessing`) do not run on `WebGPURenderer`. Move them to TSL. Built-in materials, loaders, controls, animation and physics work unchanged. WebGPU is not automatically faster: it shines with many draw calls and compute, so profile before migrating for speed alone.
:::

## TSL: the three.js shading language

:::def TSL (Three.js Shading Language)
A way to write shaders as JavaScript function calls that build a **node graph**. Nothing runs in JavaScript at draw time: three.js compiles the graph to WGSL (WebGPU) or GLSL (WebGL 2). Because it is JavaScript, shader code can be composed, imported, parameterised and tree-shaken like any other module, and the same code runs on both backends.
:::

| GLSL | TSL |
|---|---|
| `float a = 1.0;` | `const a = float(1)` |
| `vec3 c = vec3(1, 0, 0);` | `const c = vec3(1, 0, 0)` or `color("#ff0000")` |
| `a + b`, `a * b`, `a / b` | `a.add(b)`, `a.mul(b)`, `a.div(b)` |
| `x += y;` | `x.addAssign(y)` (inside `Fn`) |
| `mix(a, b, t)`, `smoothstep(e0, e1, x)` | `mix(a, b, t)`, `smoothstep(e0, e1, x)` (also as methods) |
| `uniform float uTime;` | `const uTime = uniform(0)`; set `uTime.value` from JS |
| `texture(map, vUv)` | `texture(map, uv())` |
| `if (c) {…}` | `If(c, () => {…})` inside `Fn` |
| `for (…)` | `Loop(count, ({ i }) => {…})` |
| a GLSL function | `const f = Fn(([a, b]) => { … return … })` |
| `gl_FragColor = …` | `material.colorNode = …` / `material.outputNode = …` |
| varyings | automatic: a vertex-stage value used in the fragment stage becomes a varying (or use `varying(node)`) |

Useful built-in nodes: `positionLocal`, `positionWorld`, `normalLocal`, `normalWorld`, `uv()`, `time`, `cameraPosition`, `screenUV`, `instanceIndex`, `vertexIndex`, `modelWorldMatrix`, plus noise (`mx_noise_float`, `hash`), and effect helpers.

### Node material slots

| Slot | Replaces | Example |
|---|---|---|
| `colorNode` | Base colour | Gradients, procedural patterns, texture blends |
| `positionNode` | Vertex position (local space) | Waves, wind, morphing, billboards |
| `normalNode` | Shading normal | Procedural bumps |
| `emissiveNode`, `roughnessNode`, `metalnessNode`, `opacityNode` | Those PBR inputs | Glowing patterns, wet streaks |
| `outputNode` / `fragmentNode` | The final colour / the whole fragment stage | Full custom shading |

```js title="three.js (TSL) — a lit material with procedural colour and a vertex wave"
import * as THREE from "three/webgpu";
import { color, mix, uv, sin, time, positionLocal, normalLocal } from "three/tsl";

const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.2 });
material.colorNode = mix(color("#4f46e5"), color("#10b981"), uv().y);          // fragment stage
const wave = sin(positionLocal.y.mul(8).add(time.mul(3))).mul(0.08);
material.positionNode = positionLocal.add(normalLocal.mul(wave));               // vertex stage
// PBR lighting, shadows, fog and tone mapping still come from three.js
```

:::calc What that graph computes for one vertex
At $t = 0.5$ s, a vertex with local $y = 0.2$ and normal $(0, 0, 1)$: $\sin(0.2\times8 + 0.5\times3) = \sin(3.1) = 0.0416$, times $0.08$ gives $0.0033$, so the vertex moves 3.3 mm outwards along its normal. Every vertex evaluates the same graph in parallel on the GPU.
:::

:::new TSL changes to know (r181–r186)
`PI2` was renamed `TWO_PI` (r181). `directionToColor`/`colorToDirection` became `packNormalToRGB`/`unpackRGBToNormal` (r185). In a `positionNode`, `positionLocal` no longer includes skinning; use `positionGeometry` for the raw vertex (r185). `rangeFog` and `viewportResolution` were removed (use `fog(color, rangeFogFactor(near, far))` and `screenSize`) in r186. Node materials and TSL also run on `WebGLRenderer` through a compatibility layer since r184.
:::

## Compute shaders

:::def Compute shader
A GPU program that does not draw: it runs a function once for each element of a problem (each particle, pixel, cell, boid), in parallel, reading and writing **storage buffers** or textures. The results stay on the GPU and can be drawn directly, so the CPU never touches the data.
:::

:::def Workgroups and invocations
A compute dispatch is split into **workgroups** of a fixed size (often 64 invocations). Each invocation gets a global index (`instanceIndex` in TSL, `global_invocation_id` in WGSL). Invocations within a workgroup can share fast workgroup memory and synchronise with barriers; different workgroups cannot.
:::

:::calc Dispatching 100,000 particles
With a workgroup size of 64 (three.js's default), $\lceil 100{,}000/64\rceil = 1{,}563$ workgroups run $1{,}563\times64 = 100{,}032$ invocations; the last 32 must do nothing (an index check, which three.js adds for you). Each particle stores position, velocity and colour as `vec3` (16 bytes each with padding): $100{,}000\times48$ bytes $= 4.8$ MB of storage buffers, all GPU-resident.
:::

@fig(compute_flow) The compute loop. Each frame JavaScript only updates a few uniforms and asks the GPU to run the update kernel; the render pass then reads the same storage buffer as instance positions.

```js title="three.js (TSL) — GPU particles: init once, update every frame"
import { Fn, If, uniform, float, vec3, hash, instancedArray, instanceIndex } from "three/tsl";

const COUNT = 100_000;
const positions = instancedArray(COUNT, "vec3");          // storage buffers, GPU only
const velocities = instancedArray(COUNT, "vec3");
const gravity = uniform(-0.00098), bounce = uniform(0.8);

const init = Fn(() => {
  const p = positions.element(instanceIndex);
  p.x = hash(instanceIndex).sub(0.5).mul(40);
  p.z = hash(instanceIndex.add(1)).sub(0.5).mul(40);
  p.y = hash(instanceIndex.add(2)).mul(8);
})().compute(COUNT);

const update = Fn(() => {
  const p = positions.element(instanceIndex), v = velocities.element(instanceIndex);
  v.addAssign(vec3(0, gravity, 0));
  p.addAssign(v);
  If(p.y.lessThan(0), () => { p.y = 0; v.y = v.y.negate().mul(bounce); });
})().compute(COUNT);

renderer.compute(init);                                   // once
const sprites = new THREE.SpriteNodeMaterial();
sprites.positionNode = positions.toAttribute();           // read the buffer per instance
const particles = new THREE.Sprite(sprites);
particles.count = COUNT;
scene.add(particles);
renderer.setAnimationLoop(() => { renderer.compute(update); renderer.render(scene, camera); });
```

:::tip The WebGL fallback
When the browser has no WebGPU, three.js runs simple compute kernels on WebGL 2 with **transform feedback**, so many examples still work, more slowly and with limits (no atomics or workgroup memory). Check `renderer.backend.isWebGPUBackend` and reduce particle counts on the fallback.
:::

| Compute use case | Idea |
|---|---|
| Particles, sparks, rain, galaxies | Integrate positions and velocities per particle |
| Flocking (boids) | Separation, alignment, cohesion; spatial hashing for neighbours |
| Cloth and soft bodies | Verlet + distance constraints on the GPU |
| Fluids (SPH, grid-based) | Neighbour sums, pressure solve, advection |
| GPU culling and LOD | Test instances against the frustum, write a compact visible list for indirect draws |
| Image processing | Blur, histograms (atomics), tone curves on textures |
| Skinning, morphing | Pre-transform vertices once, reuse across passes |
| ML inference | Matrix multiplications in compute (Transformers.js, ONNX Runtime Web use WebGPU) |

## Migrating a project from WebGL

:::flow Migration checklist
Swap imports to `three/webgpu` and initialise with `setAnimationLoop` or `await renderer.init()`
Run the app: built-in materials, loaders, controls and animation should already work
Port each `ShaderMaterial` / `onBeforeCompile` to a node material with TSL slots
Replace `EffectComposer` passes with a `RenderPipeline` and TSL effect nodes (bloom, GTAO, SMAA/TRAA, DOF…)
Replace `WebGLCubeRenderTarget` with `CubeRenderTarget`; remove `PCFSoftShadowMap`; re-tune shadow bias
Pre-compile with `compileAsync()` / `compileComputeAsync()` during loading to avoid hitches
Profile both backends (timestamp queries, the Inspector addon) before declaring victory
:::

## WebGPU in React Three Fiber

```jsx title="R3F — WebGPURenderer with node materials"
import * as THREE from "three/webgpu";
import { color, mix, uv } from "three/tsl";
import { Canvas, extend } from "@react-three/fiber";
import { useMemo } from "react";

extend(THREE);                       // register every three/webgpu class (node materials included) as JSX

function Knot() {
  const colorNode = useMemo(() => mix(color("#4f46e5"), color("#10b981"), uv().y), []);
  return (
    <mesh>
      <torusKnotGeometry args={[0.8, 0.28, 256, 48]} />
      <meshStandardNodeMaterial colorNode={colorNode} roughness={0.3} />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas gl={async (props) => {               // R3F 9: async factory receives default props
      const renderer = new THREE.WebGPURenderer(props);
      await renderer.init();
      return renderer;
    }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 3, 4]} intensity={2.5} />
      <Knot />
    </Canvas>
  );
}
```

For compute in R3F, build the buffers and kernels in `useMemo`, run the init kernel once the renderer is ready (`useEffect(() => gl.compute(init), [gl])`), and dispatch the update kernel in `useFrame((state) => state.gl.compute(update))`. For post-processing, build a `RenderPipeline` in `useMemo` and render it from a `useFrame` with **priority 1**, which tells R3F not to render the scene itself.

:::keypoints
- WebGPU: adapter → device → buffers/textures → bind groups → pipelines → command encoder → queue; validation happens at creation.
- `WebGPURenderer` (`three/webgpu`): async init, automatic WebGL 2 fallback, node materials, TSL, compute, `RenderPipeline`, clustered lighting, WebXR.
- TSL builds a node graph in JavaScript that compiles to WGSL or GLSL; maths is method chaining (`a.mul(b).add(c)`), logic uses `Fn`, `If`, `Loop`.
- Material slots: `colorNode`, `positionNode`, `normalNode`, `emissiveNode`, `opacityNode`, `outputNode`.
- Compute: `instancedArray` storage buffers + `Fn(...)().compute(count)` + `renderer.compute()`; workgroups of 64; data stays on the GPU.
- `ShaderMaterial`, `onBeforeCompile` and `EffectComposer` must be ported; profile before migrating for speed.
- R3F 9: async `gl` factory, `extend(THREE)` from `three/webgpu`, `useFrame` for compute and pipelines.
:::

## Interview questions

:::qa What does WebGPU offer over WebGL? {level=mid}
Lower CPU overhead per draw (state is baked into pre-validated pipeline objects and resources into bind groups, and commands are recorded and submitted in batches), compute shaders with storage buffers and atomics for general GPU work, a modern shading language (WGSL), better-defined resource management, and features like timestamp queries and indirect drawing. In three.js this enables GPU particles and simulations, GPU culling, clustered lighting and a node-based post-processing stack. It is not automatically faster for every scene.
:::

:::qa What is TSL and why did three.js create it? {level=mid}
TSL is three.js's shading language: you compose shader logic with JavaScript functions that build a node graph, which three.js compiles to WGSL for WebGPU or GLSL for WebGL. It lets one shader source target both backends, makes shaders composable and type-checked like normal modules (import a noise function, parameterise it, tree-shake it), and lets you override just one part of a material (`colorNode`, `positionNode`) while keeping three.js's lighting, shadows and fog, which replaces fragile string-replacement hacks like `onBeforeCompile`.
:::

:::qa How would you simulate a million particles in the browser? {level=senior}
Keep the data on the GPU. Store positions and velocities in storage buffers (`instancedArray`), write an init and an update compute kernel in TSL (forces, collisions, noise fields), dispatch the update each frame with `renderer.compute()` (about 15,600 workgroups of 64), and render the particles as instanced sprites or points whose vertex stage reads the same buffer (`positions.toAttribute()`). The CPU only updates a few uniforms (time, mouse). Use additive blending without depth writes for glowing particles, small sprites to limit overdraw, and fall back to fewer particles on the WebGL backend.
:::

:::qa A WebGL app uses ShaderMaterial and EffectComposer. What does moving to WebGPURenderer involve? {level=senior}
Switch imports to `three/webgpu` and handle async initialisation. Port each `ShaderMaterial` to a node material: vertex logic to `positionNode`, colour logic to `colorNode` or `outputNode`, uniforms to `uniform()` nodes, GLSL functions to `Fn`. Port `onBeforeCompile` injections to the matching node slots. Rebuild post-processing as a `RenderPipeline` from `pass()` and TSL effect nodes. Replace `WebGLCubeRenderTarget`, re-tune shadow bias, pre-compile pipelines, then profile both backends to confirm the move is worth it.
:::

:::qa Why might the first frame that shows a new material stutter on WebGPU, and what can you do? {level=mid}
A new material variant needs a new render pipeline, which means generating and compiling its shader and creating the pipeline object, potentially taking tens of milliseconds. Pre-warm during loading with `renderer.compileAsync(scene, camera)` (non-blocking since r184) and `compileComputeAsync()` for compute kernels (r186), reuse materials instead of creating variants at runtime, and avoid toggling features that change the shader (switch between pre-built materials instead).
:::
