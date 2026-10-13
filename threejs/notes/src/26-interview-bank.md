---
title: The Interview Question Bank
part: Interview Preparation
summary: Everything you need on the day. How to structure answers, a rapid-fire revision table, coding questions with complete code, debugging scenarios, system-design questions for 3D web products, senior-level conceptual questions, and behavioural preparation. Together with the questions at the end of each chapter, this notebook holds over 200 worked answers.
---

## How to answer a 3D interview question

:::flow A reliable answer structure
**Define** the thing in one sentence (what it is)
Say **why it exists**: the problem it solves
Explain **how it works**, with the maths or the pipeline stage if relevant
Show **how you do it in three.js / R3F**: the class, the property, the hook
Name the **trade-offs** and failure modes
Give a **real example**: something you built, measured or fixed
:::

:::tip What interviewers listen for
Juniors are expected to know the scene/camera/renderer model, materials, lights, loading and the render loop. Mid-level developers should talk about draw calls, disposal, instancing, raycasting edge cases and shaders. Seniors are judged on diagnosing performance with evidence, rendering-pipeline knowledge (colour management, shadows, post-processing, WebGPU), architecture of large apps, and trade-offs. Saying "I would measure first with `renderer.info` and a GPU timer" is often worth more than listing tricks.
:::

## Rapid-fire revision

| Question | Short answer |
|---|---|
| Three objects every three.js app needs? | Scene, camera, renderer (plus a mesh = geometry + material) |
| Units and up axis? | Metres by convention; right-handed, +Y up, camera looks down −Z |
| `fov` units? | Degrees, vertical; everything else uses radians |
| What is a draw call? | One CPU command to draw a geometry with a material; ~1 per visible mesh |
| How to reduce draw calls? | Instancing, BatchedMesh, merging, shared materials, atlases |
| Why multiply by delta? | Frame-rate independence |
| Default material that needs no light? | `MeshBasicMaterial` |
| Why is my model black? | No lights / no environment; metals need an environment |
| sRGB textures? | Colour maps only: `texture.colorSpace = SRGBColorSpace` |
| Default output colour space? | `SRGBColorSpace` |
| What is tone mapping? | Compressing HDR values into displayable [0,1] |
| Tone mapper for product colours? | `NeutralToneMapping` |
| Lambert's law? | Diffuse ∝ max(0, n·l) |
| Blinn–Phong half vector? | h = normalise(l + v) |
| GGX roughness parameter? | α = roughness² |
| F0 of plastic/glass? | ≈ 0.04 |
| Metals and diffuse? | Metals have no diffuse; base colour is F0 |
| What is PMREM? | Pre-filtered, mip-mapped environment map for roughness-based reflections |
| Model matrix order? | M = T·R·S (scale, then rotate, then translate) |
| Local vs world matrix? | `matrix` vs `matrixWorld` = parent.matrixWorld · matrix |
| Normal matrix? | Inverse-transpose of the model-view 3×3 |
| Gimbal lock? | Euler middle angle ±90° aligns two axes |
| Quaternion for θ about axis k? | (k sin θ/2, cos θ/2) |
| Slerp vs lerp? | Constant angular speed on the arc vs uneven speed on the chord |
| Why does z-fighting happen? | Depth precision; raise `near` first |
| Reversed-Z? | Float depth with near = 1, far = 0: near-uniform precision |
| Frustum culling uses? | Bounding spheres vs six planes |
| Mip level? | log2(texels per pixel) |
| Mipmap memory overhead? | +1/3 |
| 4K RGBA texture VRAM? | ≈ 85 MiB with mips |
| KTX2/Basis? | One file transcoded to the GPU's compressed format |
| Raycasting cost? | Bounding sphere/box then every triangle; BVH for big meshes |
| R3F events pass through objects? | Yes, call `e.stopPropagation()` |
| setState in useFrame? | Never; mutate refs |
| useFrame priority > 0? | You render manually; R3F stops its own render |
| Changing `args`? | Re-creates the object |
| Fixed timestep? | Accumulator + interpolation for stable physics |
| Semi-implicit Euler? | Update v, then x with new v; stable |
| Shadow acne fix? | Small bias + normalBias; tight shadow camera |
| Point light shadows cost? | Six renders (cube) |
| Bloom steps? | Bright pass → mip-chain blur → add |
| MSAA with post-processing? | Needs a multisampled target or SMAA/TAA |
| Separable blur cost? | 2N instead of N² samples |
| TSL? | Shaders as JavaScript node graphs → WGSL/GLSL |
| WebGPU compute workgroup default in three.js? | 64 |
| What replaced Clock? | `THREE.Timer` (core since r179; Clock deprecated r183) |
| What replaced PostProcessing class? | `RenderPipeline` (r183) |
| What replaced RGBELoader? | `HDRLoader` (r180) |
| PCFSoftShadowMap? | Removed in r186; PCFShadowMap is soft |
| New light in r186? | `SunLight` with cascaded shadows |
| Gaussian splats in three.js? | `GaussianSplat` addon (r186, WebGPURenderer) |
| WebXR frame loop? | `renderer.setAnimationLoop` |
| Move the player in VR? | Move a rig parent, not the camera |

## Coding questions

:::qa Set up three.js inside a plain React component (no R3F) without leaks or duplicate loops. {level=mid}
Create everything in an effect, start one animation loop, and undo everything in the cleanup (React 19 Strict Mode runs effects twice in development, which exposes missing cleanup).

```jsx title="React + three.js — correct lifecycle"
function Viewer() {
  const host = useRef(null);
  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 1, 4);
    const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 128, 16), new THREE.MeshNormalMaterial());
    scene.add(mesh);

    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      renderer.setSize(width, height, false);
      camera.aspect = width / height; camera.updateProjectionMatrix();
    });
    ro.observe(el);
    const timer = new THREE.Timer();
    renderer.setAnimationLoop((t) => { timer.update(t); mesh.rotation.y += timer.getDelta(); renderer.render(scene, camera); });

    return () => {                                  // runs on unmount (and between Strict Mode double-mounts)
      renderer.setAnimationLoop(null);
      ro.disconnect();
      mesh.geometry.dispose(); mesh.material.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);
  return <div ref={host} style={{ width: "100%", height: 400 }} />;
}
```
:::

:::qa Render a 20×20×20 grid of cubes in one draw call, coloured by position, and highlight the cube under the mouse. {level=mid}
```js title="three.js — instanced grid with per-instance hover"
const N = 20, COUNT = N ** 3;
const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial(), COUNT);
const m = new THREE.Matrix4(), c = new THREE.Color();
let i = 0;
for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++, i++) {
  mesh.setMatrixAt(i, m.makeTranslation(x - N / 2, y - N / 2, z - N / 2));
  mesh.setColorAt(i, c.setRGB(x / N, y / N, z / N));        // linear values
}
mesh.computeBoundingSphere();                                 // so culling and raycasting see all instances
scene.add(mesh);

let hovered = -1;
const base = new THREE.Color(), white = new THREE.Color(1, 1, 1);
canvas.addEventListener("pointermove", (e) => {
  raycaster.setFromCamera(toNdc(e), camera);
  const hit = raycaster.intersectObject(mesh)[0];
  const id = hit ? hit.instanceId : -1;
  if (id === hovered) return;
  if (hovered >= 0) { mesh.setColorAt(hovered, base); }      // restore the previous colour
  if (id >= 0) { mesh.getColorAt(id, base); mesh.setColorAt(id, white); }
  hovered = id;
  mesh.instanceColor.needsUpdate = true;
});
```
One draw call for 8,000 cubes; hover costs one raycast per pointer move (add three-mesh-bvh or a coarser proxy if the geometry were complex).
:::

:::qa Write a fragment shader that draws an anti-aliased ring. {level=mid}
```glsl title="GLSL — ring with fwidth anti-aliasing"
varying vec2 vUv;
uniform vec3 uColor;
uniform float uRadius;      // e.g. 0.35
uniform float uThickness;   // e.g. 0.05
void main() {
  vec2 p = vUv - 0.5;
  float d = abs(length(p) - uRadius) - uThickness * 0.5;   // SDF of a ring
  float aa = fwidth(d);
  float alpha = 1.0 - smoothstep(-aa, aa, d);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}
```
The ring is the set of points whose distance from the circle of radius `uRadius` is under half the thickness; `fwidth` makes the edge one pixel wide at any scale. Use `transparent: true` on the material.
:::

:::qa Build a custom BufferGeometry for a parametric surface with correct normals and UVs. {level=senior}
```js title="three.js — parametric surface (a wavy sheet)"
function waveSurface(segU = 64, segV = 64, f = (u, v) => new THREE.Vector3(u * 4 - 2, Math.sin(u * 6) * Math.cos(v * 6) * 0.2, v * 4 - 2)) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segV; j++) for (let i = 0; i <= segU; i++) {
    const u = i / segU, v = j / segV, p = f(u, v);
    pos.push(p.x, p.y, p.z); uv.push(u, v);
  }
  const row = segU + 1;
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);              // counter-clockwise when seen from +Y
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();                  // smooth normals from the shared, indexed vertices
  g.computeBoundingSphere();
  return g;
}
```
Check the winding: for the cell corners $a=(u,v)$, $c=(u, v+\Delta)$, $b=(u+\Delta, v)$, the normal $(c-a)\times(b-a)$ points along $+Y$ for a flat sheet (here $+Z$ in $v$ maps to $+z$ and $u$ to $+x$: $\hat{\mathbf{z}}\times\hat{\mathbf{x}} = \hat{\mathbf{y}}$).
:::

:::qa Implement drag-and-drop of objects on the floor in R3F. {level=mid}
```jsx title="R3F — draggable object on the ground plane"
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3(), offset = new THREE.Vector3();

function Draggable({ children, ...props }) {
  const ref = useRef();
  const controls = useThree((s) => s.controls);     // set by <OrbitControls makeDefault />
  const [dragging, setDragging] = useState(false);
  return (
    <group ref={ref} {...props}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.target.setPointerCapture(e.pointerId);    // keep receiving moves
        e.ray.intersectPlane(floor, hit);
        offset.copy(ref.current.position).sub(hit);
        if (controls) controls.enabled = false;
        setDragging(true);                            // a rare state change: fine
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        if (e.ray.intersectPlane(floor, hit)) ref.current.position.copy(hit).add(offset);   // mutate, no setState
      }}
      onPointerUp={(e) => { e.target.releasePointerCapture(e.pointerId); if (controls) controls.enabled = true; setDragging(false); }}>
      {children}
    </group>
  );
}
```
:::

:::qa Write a camera shake that decays smoothly and does not depend on frame rate. {level=mid}
```js title="three.js — trauma-based camera shake"
let trauma = 0;                                       // 0..1, add on hits: trauma = Math.min(1, trauma + 0.5)
const base = new THREE.Vector3(), jitter = new THREE.Vector3();   // allocated once, reused every frame
function updateShake(camera, t, dt) {
  trauma = Math.max(0, trauma - dt * 1.5);            // decays in about 0.7 s
  const s = trauma * trauma;                          // squared: small hits barely shake, big ones a lot
  jitter.set(
    s * 0.15 * Math.sin(t * 37.1),                    // incommensurate frequencies avoid an obvious loop
    s * 0.15 * Math.sin(t * 43.7 + 1.3),
    0);
  camera.position.copy(base).add(jitter);
  camera.rotation.z = s * 0.05 * Math.sin(t * 29.3 + 2.1);
}
```
Use smooth noise (simplex) instead of sines for a more organic feel; drei's `<CameraShake>` packages the same idea for R3F.
:::

:::qa Make an object always face the camera (a billboard) but stay upright. {level=junior}
```js title="three.js — cylindrical billboard"
const target = new THREE.Vector3();
function faceCamera(obj, camera) {
  target.copy(camera.position);
  target.y = obj.position.y;           // ignore height difference: rotate about Y only
  obj.lookAt(target);                  // Object3D.lookAt points +Z at the target for non-camera objects
}
```
For a full (spherical) billboard copy the camera's quaternion: `obj.quaternion.copy(camera.quaternion)`. `THREE.Sprite`, drei's `<Billboard>` and TSL's `billboarding()` do this for you; in shaders, building the quad from the camera's right and up vectors is cheapest for particles.
:::

:::qa Take a high-resolution screenshot of the canvas. {level=mid}
```js title="three.js — screenshot at 2× without changing the visible canvas"
function screenshot(scale = 2) {
  const size = renderer.getSize(new THREE.Vector2());
  const dpr = renderer.getPixelRatio();
  renderer.setPixelRatio(dpr * scale);
  renderer.setSize(size.x, size.y, false);
  renderer.render(scene, camera);                       // render and read in the same task
  const url = renderer.domElement.toDataURL("image/png");
  renderer.setPixelRatio(dpr);
  renderer.setSize(size.x, size.y, false);
  return url;
}
```
The drawing buffer is cleared after compositing, so read it immediately after rendering (or set `preserveDrawingBuffer: true`, which costs performance). Very large shots may exceed the maximum texture size; render tiles with `camera.setViewOffset` and stitch them.
:::

## Debugging scenarios

| Symptom | Likely causes | First checks |
|---|---|---|
| Blank / black canvas | Camera inside or looking away from objects; object outside `near`–`far`; no `render()` call; canvas size 0 | Add an `AxesHelper`; log `camera.position`; check `renderer.domElement` size; console errors |
| Model loads but is invisible | Wrong scale (centimetres → 100× too big, camera inside it); far away; `visible` false; culled by stale bounds | `Box3().setFromObject(model)` size and centre; frame the camera to it |
| Model is black | No light, no environment; metal without environment; normals missing or inverted | Add `scene.environment`; `MeshNormalMaterial` to inspect normals |
| Colours washed out or too dark | Colour textures not sRGB; double conversion with post-processing; custom shader missing colorspace chunk | `texture.colorSpace`; only one `OutputPass` |
| Texture upside down on a glTF | `flipY` mismatch | glTF textures need `flipY = false` |
| Flickering surfaces | Z-fighting | Raise `near`; separate geometry; `polygonOffset` |
| Shadows missing | `renderer.shadowMap.enabled`, `light.castShadow`, `mesh.castShadow/receiveShadow`; object outside shadow camera | `CameraHelper(light.shadow.camera)` |
| Stripy shadows | Shadow acne | Bias / normalBias; tighter shadow box |
| Transparent objects vanish or flicker | Sorting; `depthWrite` | `depthWrite: false`; `renderOrder`; `alphaTest` |
| Frame rate drops over time | Memory leak (no dispose), growing arrays, listeners added repeatedly | `renderer.info.memory` over time; heap snapshots |
| Stutter when something first appears | Shader compilation, texture upload | `compileAsync`, pre-upload (`initTexture`), drei `<Preload all />` |
| R3F hook error "R3F: Hooks can only be used within the Canvas component" | `useThree`/`useFrame` used outside `<Canvas>` | Move the component inside, or pass data via a store |
| R3F clicks hit the wrong object | No `stopPropagation`; invisible objects with handlers; displaced geometry | Inspect `e.intersections` |
| Everything renders twice per frame | Manual render plus R3F's render | Positive `useFrame` priority when rendering yourself |
| Works on desktop, crashes on iPhone | VRAM (textures), too many contexts, WebGL feature differences | KTX2, smaller textures, one canvas, test on device |

## System design questions

:::qa Design a 3D product configurator for a furniture e-commerce site (millions of visitors). {level=senior}
**Goals**: fast first view, accurate colours, smooth option changes, works on mid-range phones, shareable configurations.

**Assets**: models built in Blender with clean UVs and separate material slots; an automated pipeline (gltf-transform: dedupe, weld, simplify, Meshopt, KTX2 with UASTC for normals) producing per-product `.glb` files under 3–5 MB; material swatches as separate small KTX2 sets loaded on demand; CDN with long cache headers and content hashing.

**Rendering**: one canvas; `NeutralToneMapping`; a neutral studio HDR (small, prefiltered once); contact shadows instead of real-time shadows; `frameloop="demand"`; DPR capped at 2 and adaptive. Pre-create materials for the current options and compile them during idle time to avoid hitches.

**State**: configuration in a store (and the URL for sharing); the DOM UI (option pickers, price) is server-rendered and accessible; the 3D view subscribes to the store.

**Robustness**: poster image fallback if WebGL fails; context-loss handling; analytics on load time and FPS; snapshot rendering server-side or client-side for carts and social sharing; AR via `USDZExporter`/Quick Look on iOS and WebXR or Scene Viewer on Android.
:::

:::qa Design a web digital twin of a factory floor with live sensor data. {level=senior}
**Scene**: the building as merged static geometry with baked lighting; machines as instanced or batched meshes by type; detailed models only for the selected machine (LOD and on-demand loading). **Data**: a WebSocket or MQTT-over-WebSocket feed into a normalised store keyed by machine ID; updates at sensor rates are buffered and applied once per frame (no React re-render per message); status drives instance colours and small HTML labels only for visible, nearby machines. **Interaction**: picking via `instanceId`, a BVH for complex meshes, a details panel in DOM. **Time**: a timeline scrubber that replays history from a time-series API, interpolating states. **Scale**: frustum culling per instance (`BatchedMesh`), distance-based label culling, workers for parsing and aggregation. **Ops**: role-based access, offline mode, alarms highlighted with emissive pulses and audio.
:::

:::qa Design a viewer for a 200-million-point LiDAR scan in the browser. {level=senior}
You cannot load 200 M points (≈ 3 GB as float positions and colours) at once. Preprocess into a spatial hierarchy (an octree with progressively denser levels, as in Potree, or Cesium 3D Tiles / COPC), stored as compressed chunks on a CDN. At runtime, traverse the hierarchy each frame, choosing nodes by projected screen size within a point budget (for example 3–5 M points), stream them with priority by screen-space error, decode in workers, and render as `Points` with a custom shader (size attenuation, eye-dome lighting for depth perception, colour by height or intensity). Evict least recently used nodes to cap memory. Picking uses the hierarchy plus a GPU ID pass. WebGPU compute can rasterise points faster than the point primitive.
:::

:::qa Design a small multiplayer 3D game in the browser. {level=senior}
Authoritative server (Node or a dedicated game server) running the simulation at a fixed tick (for example 20–30 Hz); clients send inputs, not positions. Clients predict their own player locally (client-side prediction) and reconcile with server snapshots; remote players are rendered with **interpolation** about 100 ms in the past between received snapshots, with extrapolation only for short gaps. Transport: WebSockets (or WebTransport/WebRTC data channels for unreliable, unordered updates). Physics deterministic on the server (Rapier), cosmetic physics on clients. Interest management sends only nearby entities. Rendering: instanced characters, compressed assets, a fixed-step client loop for prediction with interpolated rendering.
:::

## Senior-level conceptual questions

:::qa How does instanced rendering work on the GPU? {level=senior}
One draw call is issued with an instance count. The vertex shader runs for every vertex of every instance; per-instance data (a transform matrix, a colour, any custom value) comes from instanced attributes that advance once per instance instead of once per vertex (or from a storage buffer indexed by `gl_InstanceID`/`instanceIndex`). three.js's `InstancedMesh` stores a 4×4 matrix per instance (`instanceMatrix`, 64 bytes) and optional `instanceColor`, and multiplies the vertex by the instance matrix before the model-view-projection. The CPU cost is one call regardless of count; the GPU still processes every vertex.
:::

:::qa What do the different needsUpdate flags do? {level=mid}
They tell three.js to re-upload or recompile something on the next render. `geometry.attributes.x.needsUpdate` re-uploads that buffer (optionally only `updateRanges`). `texture.needsUpdate` re-uploads the image (after drawing on a canvas, changing format or wrapping on an existing texture). `material.needsUpdate` forces the shader program to be re-evaluated and recompiled if its defines changed (adding a map, toggling flat shading or vertex colours). `instanceMatrix.needsUpdate` / `instanceColor.needsUpdate` re-upload instance data. Shadow maps use `renderer.shadowMap.needsUpdate` when `autoUpdate` is off.
:::

:::qa What is the difference between `visible = false`, removing from the scene, and using layers? {level=mid}
`visible = false` skips rendering (and raycasting by default) of the object and its children but keeps it in the graph with its GPU resources, and its matrices still update: ideal for toggling quickly. Removing it detaches it from the graph (no matrix updates, no rendering), but GPU resources stay until disposed, so it suits objects that may return later. Layers filter per camera or raycaster: the object stays visible to cameras with matching layers, enabling selective rendering (minimaps, reflections, selection passes) without changing the scene.
:::

:::qa How does three.js decide when to compile a new shader program? {level=senior}
For each material it computes a program key (cache key) from the material type and every parameter that affects the generated code: which maps are present, fog, vertex colours, skinning and morphs, number and types of lights and shadows, tone mapping, output colour space, precision, custom `onBeforeCompile` keys. Materials with the same key share one program; a new key means generating, compiling and linking a program, which is slow the first time. That is why adding a light to a scene recompiles every lit material, and why pre-warming with `renderer.compile`/`compileAsync` during loading avoids hitches.
:::

:::qa How do you stay current with three.js? {level=junior}
Read each release's notes and the migration guide (releases arrive every couple of months and deprecations last about ten releases), follow the forum and examples (especially the WebGPU ones), test upgrades against screenshots because PBR and shadows changed in recent releases, and use the official `llms.txt` documentation when working with AI assistants, which otherwise suggest deprecated APIs such as `Clock` or `PostProcessing`.
:::

## Behavioural and portfolio preparation

- Prepare **three stories** with numbers: a performance win ("draw calls 1,200 → 40 with BatchedMesh; mid-range Android 24 → 58 fps"), a hard bug ("textures leaked on route changes; added disposal and a memory test"), and a product impact ("configurator raised add-to-cart by X%").
- Bring a **portfolio** of live demos that load fast on a phone; show the code for one and be ready to explain every line, including what you would improve.
- Know your **limits** honestly: if you have not written WGSL, say so and explain how you would approach it (TSL, docs, examples).
- Ask the interviewer about their **stack** (WebGL or WebGPU, R3F or vanilla, asset pipeline, target devices); it shows you think about real constraints.

:::keypoints
- Answer with: definition → why → how → three.js/R3F → trade-offs → example.
- Revise with the rapid-fire table; practise the coding questions by typing them out.
- For debugging questions, describe the evidence you would collect before the fix.
- For system design: assets pipeline, rendering choices, state and data flow, performance budgets, robustness and fallbacks.
:::
