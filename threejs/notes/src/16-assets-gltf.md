---
title: Assets — glTF and the Loading Pipeline
summary: The glTF format from the inside (scenes, nodes, meshes, accessors, buffers, extensions), loading with GLTFLoader plus Draco, Meshopt and KTX2, quantisation maths, an optimisation pipeline with gltf-transform and gltfjsx, other formats, and loading with Suspense in R3F.
---

## Why glTF

:::def glTF 2.0
The Khronos Group's open standard for delivering 3D scenes, often called "the JPEG of 3D". It stores meshes, PBR materials, textures, cameras, lights, skins and animations in a form that maps almost directly onto GPU buffers, so loading is mostly copying, not converting. It is right-handed, +Y up, in metres, and its core material is exactly the metal–roughness model of `MeshStandardMaterial`.
:::

| Variant | Contents | Use |
|---|---|---|
| `.gltf` + `.bin` + images | JSON description, binary buffers and textures as separate files | Debugging, hand editing |
| `.glb` | One binary file: a JSON chunk plus a binary chunk (textures embedded) | Delivery on the web |

## Inside a glTF file

@fig(gltf_structure) How a glTF file is organised. Nodes form the scene tree; a mesh's primitives point at accessors, which describe typed views into binary buffers; materials point at textures, which point at images and samplers.

| Object | What it describes | Becomes in three.js |
|---|---|---|
| `scenes`, `nodes` | The hierarchy with TRS or matrix transforms | `Group` / `Object3D` tree (`gltf.scene`) |
| `meshes` → `primitives` | Geometry pieces, each with one material and a draw mode | `Mesh` per primitive (a `Group` if several) |
| `accessors` | Typed data: count, component type, `VEC3`/`VEC2`/`SCALAR`, min/max | `BufferAttribute` |
| `bufferViews`, `buffers` | Byte ranges inside binary blobs | `ArrayBuffer` slices |
| `materials` | PBR metal–roughness + extensions | `MeshStandardMaterial` / `MeshPhysicalMaterial` |
| `textures`, `images`, `samplers` | Image + filtering/wrapping | `Texture` (colour maps sRGB, `flipY = false`) |
| `skins` | Joints + inverse bind matrices | `Skeleton` + `SkinnedMesh` |
| `animations` | Channels (node + path) and samplers (input times, output values) | `AnimationClip`s (`gltf.animations`) |
| `cameras`, `KHR_lights_punctual` | Cameras and lights | `PerspectiveCamera`, `DirectionalLight`… |
| `extras` | Custom data from the exporter | `object.userData` |

:::formula Accessor size
$$\text{bytes} = \text{count}\times\text{components}\times\text{component size}$$
`VEC3` has 3 components; FLOAT is 4 bytes, UNSIGNED_SHORT 2, BYTE 1. (Vertex attributes are padded so each element starts on a 4-byte boundary.)
:::

:::calc What a 100k-vertex model weighs
100,000 vertices with float positions (12 B), normals (12 B) and UVs (8 B), plus 200,000 triangles of 32-bit indices:

- Attributes: $100{,}000\times32 = 3.2$ MB. Indices: $600{,}000\times4 = 2.4$ MB. Total **5.6 MB** before textures.
- With `KHR_mesh_quantization`: positions as 16-bit integers (6 B, padded to 8), normals as 8-bit (3 B, padded to 4), UVs as 16-bit (4 B): 16 B per vertex, **1.6 MB**, and it stays that small **in GPU memory** too.
- Meshopt or Draco compression on top shrinks the download several times more.
:::

:::formula Quantisation precision
Storing a coordinate that spans an extent $E$ with $b$ bits gives a step of
$$\Delta = \frac{E}{2^b - 1}$$
:::

:::calc Is 16-bit enough?
A 2 m tall statue with 16-bit positions: $\Delta = 2/65535 = 0.03$ mm, far below anything visible. A 2 km city in one mesh: $\Delta = 3$ cm, visible as wobbly edges up close, so split large worlds into tiles (each with its own offset and scale) before quantising.
:::

## Loading glTF in three.js

```js title="three.js — a complete, production-style loader"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => progressBar.style.width = `${(loaded / total) * 100}%`;

const draco = new DRACOLoader(manager).setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
const ktx2 = new KTX2Loader(manager)
  .setTranscoderPath("https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/basis/")
  .detectSupport(renderer);
const loader = new GLTFLoader(manager)
  .setDRACOLoader(draco)
  .setKTX2Loader(ktx2)
  .setMeshoptDecoder(MeshoptDecoder);

const gltf = await loader.loadAsync("/models/chair.glb");
const model = gltf.scene;
model.traverse((o) => {
  if (o.isMesh) { o.castShadow = o.receiveShadow = true; }
});
// normalise size and position: 1 m tall, standing on the floor, centred
const box = new THREE.Box3().setFromObject(model);
const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
model.scale.setScalar(1 / size.y);
model.position.set(-centre.x / size.y, -box.min.y / size.y, -centre.z / size.y);
scene.add(model);
```

:::tip Where the decoders run
Draco and Basis transcoding run in **Web Workers** (WASM), so they do not freeze the page, but decoding still takes time on low-end phones. Host the decoder files yourself in production (same version as your three.js) instead of depending on a third-party CDN, and reuse **one** loader instance for all models so the workers are created once.
:::

### Draco versus Meshopt

| | Draco (`KHR_draco_mesh_compression`) | Meshopt (`EXT_meshopt_compression`) |
|---|---|---|
| Download size | Smallest for geometry | Small, especially combined with gzip/Brotli |
| Decode speed | Slow (WASM, heavy) | Very fast (often near memcpy speed) |
| In GPU memory | Decompressed to full floats | Can stay quantised (with `KHR_mesh_quantization`) |
| Animations, morph targets | Geometry only | Also compresses animation and morph data |
| Best for | Huge static meshes where download dominates | Most web apps, mobile, animated characters |

## The optimisation pipeline

Exported files are rarely web-ready: duplicated materials, unused data, 4K PNGs, uncompressed geometry. Optimise as a build step.

:::flow
A raw export from Blender, CAD or a scanner
`gltf-transform inspect model.glb`: see sizes per mesh, texture and animation
`dedup`, `prune`, `weld`, `join`: remove duplicates and unused data, merge compatible meshes
`simplify --ratio 0.5`: reduce triangles (meshoptimizer) where the detail is not visible
`resize --width 2048` then `etc1s` / `uastc`: smaller, GPU-compressed KTX2 textures
`meshopt` (or `draco`): compress geometry and animation
`gltfjsx model.glb --transform --types`: generate a typed R3F component (it runs similar optimisations)
:::

```bash title="one-line optimisation"
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress ktx2
npx gltfjsx out.glb --types --shadows   # → Model.tsx with typed nodes and materials
```

:::calc A typical result
A Blender export of a sofa: 38 MB (four 4K PNG textures, 450k triangles, float geometry). After `resize 2048` + KTX2 (ETC1S colour, UASTC normal) + `simplify 0.5` + meshopt: about 3–4 MB to download, and texture VRAM drops from about 340 MiB (four $85$ MiB 4K maps) to under 25 MiB. Load time on 4G improves from tens of seconds to a couple of seconds.
:::

## Other formats

| Format | Loader | Notes |
|---|---|---|
| FBX | `FBXLoader` | Common from Autodesk tools and Mixamo; converts Z-up to Y-up since r184; prefer converting to glTF |
| OBJ (+ MTL) | `OBJLoader`, `MTLLoader` | Geometry only, old materials, no animation; very common, very simple |
| USD / USDZ | `USDLoader` (`USDZLoader` deprecated in r179) | Apple and Pixar ecosystem; `USDZExporter` for AR Quick Look on iOS |
| STL | `STLLoader` | 3D printing; no UVs or materials |
| PLY | `PLYLoader` | Scanners and point clouds; honours data types since r185 |
| 3DM | `3DMLoader` | Rhino (architecture, jewellery) |
| VOX | `VOXLoader` | MagicaVoxel voxel art |
| Gaussian splats | `GaussianSplatPLYLoader`, `SPLATLoader`, `KSPLATLoader`, glTF extension (r186) | Photoreal captured scenes (Chapter 24) |
| IFC (BIM) | `web-ifc` / That Open Engine | Building information models |

## Loading in React Three Fiber

:::def Suspense loading
R3F's loaders (`useLoader`, drei's `useGLTF`, `useTexture`) **suspend** the component until the asset is ready, and cache the result by URL. Wrap them in React `<Suspense fallback={…}>` and the fallback shows while loading; every other component that asks for the same URL gets the cached result instantly.
:::

```jsx title="R3F — loading with Suspense, preload and progress"
import { Suspense } from "react";
import { useGLTF, useProgress, Html, Clone } from "@react-three/drei";

function Chair(props) {
  const { scene } = useGLTF("/models/chair.glb");   // Draco handled automatically (decoder from a CDN by default)
  return <Clone object={scene} {...props} />;        // safe to render many times (deep clone, skinning-aware)
}
useGLTF.preload("/models/chair.glb");               // start downloading before the component mounts

function Loader() {
  const { progress } = useProgress();
  return <Html center>{progress.toFixed(0)} %</Html>;
}

export default function App() {
  return (
    <Canvas shadows>
      <Suspense fallback={<Loader />}>
        <Chair position={[-1, 0, 0]} />
        <Chair position={[1, 0, 0]} rotation-y={Math.PI} />
      </Suspense>
    </Canvas>
  );
}
```

```tsx title="R3F — what gltfjsx generates (abridged)"
type GLTFResult = GLTF & {
  nodes: { Seat: THREE.Mesh; Legs: THREE.Mesh };
  materials: { Fabric: THREE.MeshStandardMaterial; Oak: THREE.MeshStandardMaterial };
};
export function Model(props: ThreeElements["group"]) {
  const { nodes, materials } = useGLTF("/chair-transformed.glb") as unknown as GLTFResult;
  return (
    <group {...props} dispose={null}>
      <mesh castShadow geometry={nodes.Seat.geometry} material={materials.Fabric} />
      <mesh castShadow geometry={nodes.Legs.geometry} material={materials.Oak} position={[0, -0.21, 0]} />
    </group>
  );
}
useGLTF.preload("/chair-transformed.glb");
```

:::tip Why gltfjsx is worth it
The generated component makes the model's structure explicit JSX: you can swap a material per instance (`material-color` overrides), add events to individual parts, animate a door node, or render many instances with drei's `<Merged>` for one draw call per part. `dispose={null}` keeps cached geometry alive when one instance unmounts.
:::

:::keypoints
- glTF = JSON scene graph + binary buffers + PBR materials; `.glb` packs everything in one file.
- Accessor bytes = count × components × component size; quantisation step = extent / $(2^b - 1)$.
- `GLTFLoader` + `DRACOLoader` + `KTX2Loader` + `MeshoptDecoder`, one shared instance, decoders self-hosted.
- Meshopt for fast decode and animated content; Draco for the smallest static geometry; KTX2 for textures.
- Optimise in the build: `gltf-transform optimize`, then `gltfjsx --transform` for R3F.
- R3F: `useGLTF` suspends and caches; preload; `<Clone>` for multiple copies; `useProgress` for loading UI.
:::

## Interview questions

:::qa Why is glTF the preferred format for the web? {level=junior}
It is an open standard designed for runtime delivery: its buffers map directly onto GPU vertex and index buffers, its core material is the same PBR metal–roughness model three.js uses, it carries skins, morph targets, animations, cameras and lights, it has a fixed convention (right-handed, Y-up, metres), and it has compression extensions for geometry (Draco, Meshopt, quantisation) and textures (KTX2/Basis). FBX and OBJ need more conversion, lose information and are larger.
:::

:::qa A 40 MB model takes too long to load on mobile. Walk me through optimising it. {level=mid}
Inspect it first (`gltf-transform inspect`) to see whether textures or geometry dominate. Usually textures: resize to what the screen needs (often 1–2K), convert to KTX2 (ETC1S for colour, UASTC for normals), pack ORM channels. Geometry: deduplicate, weld, simplify where detail is invisible, quantise and compress with Meshopt (or Draco for very large static meshes). Remove unused nodes, materials and animations. Serve with Brotli, preload, show progress, and consider splitting into a quick low-resolution first load plus streamed detail.
:::

:::qa What is the trade-off between Draco and Meshopt? {level=mid}
Draco produces the smallest geometry downloads but decoding is CPU-heavy (a WASM worker) and the result is expanded to full floats in memory; it covers geometry only. Meshopt compresses slightly less on its own (very well with gzip/Brotli), decodes extremely fast, can keep data quantised in GPU memory with `KHR_mesh_quantization`, and also compresses animations and morph targets. For most interactive web apps, especially on mobile or with animated characters, Meshopt is the better default.
:::

:::qa How does Suspense-based loading work in R3F? {level=mid}
Hooks like `useLoader` and drei's `useGLTF` start the load and throw a promise if the asset is not ready, which suspends the component; React shows the nearest `<Suspense>` fallback and re-renders once the promise resolves. Results are cached by URL, so other components using the same asset get it immediately, and `useGLTF.preload` starts loading early. Because the cache is shared, rendering the same model twice needs `<Clone>` (or gltfjsx's component, which reuses geometry and materials) rather than adding the same `scene` object twice.
:::

:::qa Why does adding the same `gltf.scene` to the scene twice only show one model? {level=junior}
An `Object3D` can have only one parent; adding it again moves it. You need separate objects: `gltf.scene.clone()` for static models (geometry and materials are shared, which is efficient), `SkeletonUtils.clone()` for skinned ones, or drei's `<Clone>` in R3F. For many copies of the same part, instancing (`InstancedMesh` or drei's `<Merged>`/`<Instances>`) is better still.
:::
