---
title: Loading 3D Models (glTF and Friends)
level: intermediate
time: 35
summary: Why glTF is the format of the web, loading models with GLTFLoader, Draco, Meshopt and KTX2 compression, progress bars, centring and scaling unknown models, exploring and editing a model's parts, other formats (STL, OBJ, FBX, USDZ, point clouds, Gaussian splats) and an optimisation pipeline.
---

Hand-built geometry is great for learning, but real products show real models: a sneaker scanned in a studio, a car exported from CAD, a character rigged in Blender. Getting those into the browser quickly, at a size phones can handle, is one of the most important practical skills in 3D web work.

## glTF: the JPEG of 3D

:::def glTF / GLB
The **GL Transmission Format**, an open standard from the Khronos Group designed for delivering 3D to apps. It stores meshes, PBR materials, textures, cameras, lights, skeletons, animations and morph targets. `.gltf` is JSON plus separate binary and image files; **`.glb`** packs everything into one binary file. Blender, Maya, 3ds Max, Substance, Sketchfab and most CAD tools export it, and three.js supports it best of all formats.
:::

| Format | Typical source | Materials | Animation | Use on the web |
|---|---|---|---|---|
| **glTF / GLB** | Blender, Sketchfab, configurator pipelines | PBR | yes | ✅ the default — use this |
| FBX | Maya, Mixamo, game asset stores | partial | yes | convert to glTF in Blender first |
| OBJ (+ MTL) | old asset libraries, scanners | basic | no | simple static meshes |
| STL | CAD, 3D printing | none | no | engineering/print previews |
| USDZ | Apple AR Quick Look | PBR | yes | iOS "view in your room" (export, rarely load) |
| PLY / PCD / XYZ | 3D scanners, LiDAR | per-point colour | no | point clouds |
| SPLAT / KSPLAT / SPZ | Gaussian splat captures | — | no | photoreal captured scenes (three.js has loaders) |
| IFC | architecture & construction (BIM) | — | no | via That Open Engine (Module 6) |

## Loading a glTF model

```js run title="DamagedHelmet: load, centre, frame" level=intermediate
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1e293b");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const status = document.createElement("div");
status.className = "overlay";
status.textContent = "Loading…";
document.body.appendChild(status);

const URL = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf";
const gltf = await new GLTFLoader().loadAsync(URL, (e) => {
  if (e.total) status.textContent = `Loading… ${Math.round((e.loaded / e.total) * 100)}%`;
});
const model = gltf.scene;                          // a Group containing the whole model
scene.add(model);

// Unknown models come in any size and position: measure, centre and frame them
const box = new THREE.Box3().setFromObject(model);
const size = box.getSize(new THREE.Vector3()).length();
const center = box.getCenter(new THREE.Vector3());
model.position.sub(center);                        // move the model's centre to the origin
camera.position.set(0, size * 0.15, size * 1.1);
camera.near = size / 100; camera.far = size * 100;
camera.updateProjectionMatrix();
controls.target.set(0, 0, 0);

status.innerHTML = `<b>DamagedHelmet</b><span class="muted">${Math.round(size * 100) / 100} m across · scene graph has ${model.children.length} child</span>`;

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

What the loader gives you:

| Field | Contents |
|---|---|
| `gltf.scene` | the model as a `Group` (add this to your scene) |
| `gltf.animations` | an array of `AnimationClip`s |
| `gltf.cameras` | cameras defined in the file |
| `gltf.asset` | generator and version info |
| `gltf.parser` | low-level access (materials, textures, extensions) |

:::tip Top-level await
`loadAsync` returns a promise, so inside a module you can simply `await` it, as above. In your own app, wrap it in `try / catch` and show a friendly message if the file is missing or the network fails.
:::

## Compressed models: Draco, Meshopt and KTX2

Uncompressed models are big. Three compression schemes are standard, and each needs a **decoder** registered on the loader:

| Compression | Shrinks | Decoder | Notes |
|---|---|---|---|
| **Draco** | geometry, 5–10× | `DRACOLoader` + decoder files (WASM) | great ratios, slower to decode |
| **Meshopt** | geometry (and animation), 2–5× + gzip | `MeshoptDecoder` | very fast decode, pairs with HTTP compression |
| **KTX2 / Basis** | textures, stays compressed **on the GPU** | `KTX2Loader` + transcoder | the big win for GPU memory on mobile |

`LittlestTokyo.glb` is a Draco-compressed, animated scene (4 MB instead of ~30 MB):

```js run title="A Draco-compressed, animated model" level=intermediate
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#bfe3dd");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 100);
camera.position.set(5, 2, 8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.5, 0);
controls.enableDamping = true;

// Draco: point the loader at the decoder files (Google hosts versioned copies)
const draco = new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
const loader = new GLTFLoader().setDRACOLoader(draco);

const bar = document.createElement("div");
bar.className = "overlay";
bar.innerHTML = `<span>Loading LittlestTokyo.glb</span><progress max="1" value="0" style="width:200px"></progress>`;
document.body.appendChild(bar);

const gltf = await loader.loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/LittlestTokyo.glb",
  (e) => e.total && (bar.querySelector("progress").value = e.loaded / e.total));
const model = gltf.scene;
model.position.set(1, 1, 0);
model.scale.setScalar(0.01);                       // the file is in centimetres
scene.add(model);
bar.innerHTML = `<b>LittlestTokyo</b><span class="muted">${gltf.animations.length} animation · Draco compressed</span>`;

const mixer = new THREE.AnimationMixer(model);
mixer.clipAction(gltf.animations[0]).play();       // the clip that came inside the file

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  mixer.update(timer.getDelta());
  controls.update();
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

The full production setup registers all three decoders once and reuses the loader everywhere:

```js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export function createGLTFLoader(renderer) {
  const draco = new DRACOLoader().setDecoderPath("/decoders/draco/");     // copy from node_modules/three/examples/jsm/libs/draco/
  const ktx2 = new KTX2Loader().setTranscoderPath("/decoders/basis/").detectSupport(renderer);
  return new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
}
```

## Exploring a model

Loaded models are ordinary three.js objects, so everything from the scene-graph lesson applies. `traverse` it to list parts, find a named mesh, enable shadows, swap a material or hide a component:

```js run title="Inspect and edit a model's parts" level=intermediate
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0.3, 0.25, 0.45);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.08, 0);

const gltf = await new GLTFLoader().loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/MaterialsVariantsShoe/glTF/MaterialsVariantsShoe.gltf");
const shoe = gltf.scene;
scene.add(shoe);

// list every mesh with its material and triangle count
const parts = [];
shoe.traverse((o) => {
  if (!o.isMesh) return;
  const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  parts.push(o);
  console.log(`mesh "${o.name}" · material "${o.material.name}" · ${tris.toLocaleString()} triangles`);
});

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<b>${parts.length} part(s)</b>
  <label>Tint <input type="color" value="#ffffff"></label>
  <label><input type="checkbox" id="wire"> wireframe</label>`;
document.body.appendChild(ui);
const original = parts.map((p) => p.material.color.clone());
ui.querySelector("input[type=color]").oninput = (e) =>
  parts.forEach((p, i) => p.material.color.copy(original[i]).multiply(new THREE.Color(e.target.value)));
ui.querySelector("#wire").onchange = (e) => parts.forEach((p) => (p.material.wireframe = e.target.checked));

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

Open the **Console**: the model reports its meshes, material names and triangle counts. Named parts are what make configurators possible ("recolour the mesh called `laces`"), so when you work with 3D artists, agree on a **naming convention** for every part the code needs to touch.

## Loading many things: LoadingManager

A `LoadingManager` tracks every file loaded by the loaders you give it (models, textures, HDRs), which is how you build one progress bar for the whole app:

```js
const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => progressBar.style.width = `${(loaded / total) * 100}%`;
manager.onLoad = () => loadingScreen.classList.add("hidden");
manager.onError = (url) => console.error("Failed to load", url);

const gltfLoader = new GLTFLoader(manager);
const textureLoader = new THREE.TextureLoader(manager);
```

## Other loaders in `three/addons/loaders/`

| Loader | Returns | Example use |
|---|---|---|
| `STLLoader` | a `BufferGeometry` (no materials) | CAD parts, 3D-print previews |
| `OBJLoader` (+ `MTLLoader`) | a `Group` | legacy assets |
| `FBXLoader` | a `Group` with animations | Mixamo characters (prefer converting) |
| `PLYLoader`, `PCDLoader`, `XYZLoader` | geometry with points | scanners, LiDAR, robotics point clouds |
| `SVGLoader` | 2D paths → `Shape`s | logos and icons extruded to 3D |
| `FontLoader` (+ `TextGeometry`) | fonts for 3D text | titles, labels |
| `HDRLoader`, `EXRLoader`, `UltraHDRLoader` | HDR environment images | lighting (next lesson) |
| `USDZLoader` / `USDLoader` | USD scenes | Apple / Pixar pipelines |
| `SPLATLoader`, `KSPLATLoader`, `SPZLoader` | Gaussian splats | photoreal captured places and objects |
| `3DMLoader`, `IFCLoader` (via That Open), `ColladaLoader`, `VRMLLoader`… | — | specialised pipelines |

:::def Gaussian splatting
A way of capturing a real place or object from photos or video as millions of soft, coloured, semi-transparent blobs ("splats") instead of triangles. It looks photoreal from new viewpoints and is spreading quickly in real estate, cultural heritage, e-commerce and VR. Three.js r186 ships splat loaders, and libraries such as Spark and drei's `<Splat>` render them.
:::

## An optimisation pipeline

Models straight out of Blender or a CAD tool are rarely web-ready. The standard tool is **glTF-Transform**, a command-line and JavaScript toolkit:

```bash
# inspect: sizes, triangle counts, texture resolutions, what's wasting space
npx @gltf-transform/cli inspect model.glb

# one-shot optimise: dedupe, prune unused data, weld vertices, simplify,
# compress geometry with Meshopt, resize & convert textures to WebP
npx @gltf-transform/cli optimize model.glb model.web.glb \
  --compress meshopt --texture-compress webp --texture-size 2048

# GPU-compressed textures (needs the KTX-Software "toktx" tool installed)
npx @gltf-transform/cli etc1s model.web.glb model.ktx2.glb      # small, lower quality: colour maps
npx @gltf-transform/cli uastc model.web.glb model.ktx2.glb      # larger, high quality: normal maps
```

:::flow From artist to browser
Blender / CAD | model, UVs, PBR materials, named parts
Export glTF | apply transforms, metres, Y-up
glTF-Transform | prune, weld, simplify, compress
Budget check | e.g. < 5 MB, < 300k triangles, ≤ 2K textures for mobile
Load in three.js | GLTFLoader + decoders + progress UI
:::

Rules of thumb for a product page: **under 5 MB** download, **under ~300k triangles** for mid-range phones, textures at **2K or less**, and a poster image shown while loading. Tools worth knowing: **gltf.report** (drag a file into the browser to inspect and optimise it), the **Khronos glTF Validator**, Blender's **Decimate** modifier for reducing triangles, and **gltfjsx** (Module 3) which turns a model into a React component.

## Check yourself

```quiz
? Which format should you default to for 3D on the web?
+ glTF / GLB
- FBX
- OBJ
> It is the open, compact standard with PBR materials and animation that three.js supports best.

? Which compression keeps textures compressed in GPU memory?
- Draco
- Meshopt
+ KTX2 / Basis Universal
> JPEG and PNG are decompressed on the GPU; KTX2 stays compressed there.

? A loaded model is huge and off to one side. What's the fix?
+ Measure it with Box3, move its centre to the origin, and scale or frame the camera
- Reload it with a different loader
- Increase the camera's far plane only
> Box3.setFromObject + getCenter/getSize handle any model.

? Where do a glTF's animations end up?
+ gltf.animations, as AnimationClips you play with an AnimationMixer
- Inside gltf.scene.animations automatically playing
- They are lost — glTF has no animation
> Create a mixer on gltf.scene and call clipAction(clip).play().

? Why agree on part names with your 3D artist?
+ Code finds meshes by name to recolour, hide or attach things
- Three.js rejects unnamed meshes
- Names make files smaller
> getObjectByName and traverse depend on predictable names.
```

:::exercise Turntable from any URL
Turn the DamagedHelmet example into a reusable viewer: wrap the load-centre-frame logic in `async function show(url)` that removes the previous model before adding the new one, and add two buttons that load `DamagedHelmet/glTF/DamagedHelmet.gltf` and `duck.glb` (both under `…/examples/models/gltf/`).
:::

:::solution
```js run
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const BASE = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/";
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;
// duck.glb happens to be Draco-compressed: a general-purpose viewer should always register decoders
const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/"));
let current = null;

async function show(url) {
  const { scene: model } = await loader.loadAsync(url);
  if (current) scene.remove(current);
  current = model;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()).length();
  model.position.sub(box.getCenter(new THREE.Vector3()));
  scene.add(model);
  camera.position.set(0, size * 0.2, size * 1.2);
  camera.near = size / 100; camera.far = size * 100;
  camera.updateProjectionMatrix();
}
const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<div class="row"><button data-u="DamagedHelmet/glTF/DamagedHelmet.gltf">Helmet</button><button data-u="duck.glb">Duck</button></div>`;
ui.onclick = (e) => e.target.dataset.u && show(BASE + e.target.dataset.u);
document.body.appendChild(ui);
await show(BASE + "duck.glb");
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
```
Without the `DRACOLoader`, loading the duck fails with *"No DRACOLoader instance provided"*: you can't tell from a file name whether a model is compressed, so viewers that accept arbitrary models register every decoder up front.
:::

:::keypoints
- Use **glTF/GLB**: meshes, PBR materials, textures, skeletons and animations in one open format.
- `GLTFLoader.loadAsync(url)` → `gltf.scene` (add it) and `gltf.animations` (play with a mixer).
- Register **Draco**, **Meshopt** and **KTX2** decoders; KTX2 is the big GPU-memory win on mobile.
- Centre and frame unknown models with `Box3`; explore and edit them with `traverse` and named parts.
- Optimise every model with **glTF-Transform** (`optimize`, Meshopt, WebP/KTX2) against a size budget.
:::
