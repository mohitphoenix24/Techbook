---
title: Architecture, Real Estate, Healthcare, Education & Heritage
level: intermediate
time: 40
summary: How architecture, construction and real estate use web 3D (BIM/IFC viewers, section cuts, walkthroughs, Gaussian-splat captures), how healthcare and life sciences use it (anatomy, DICOM volumes, molecules, surgical training), how education and cultural heritage use it, with a live building section-cut tool and a photoreal captured object.
---

Architecture, medicine, education and museums share a need: help people **understand space and structure** they can't easily see: a building that doesn't exist yet, the inside of a body, a molecule, a fragile artefact. Each field has its own data formats and specialised libraries, but the core three.js skills (models, cameras, clipping, labels, performance, WebXR) carry over directly.

## Architecture, engineering & construction (AEC)

:::def BIM and IFC
**Building Information Modelling** is the practice of designing buildings as rich 3D databases: every wall, door and pipe is an object with properties (material, fire rating, cost, supplier). **IFC** (Industry Foundation Classes) is the open file format for exchanging BIM models between tools like Revit, ArchiCAD and Tekla.
:::

| Use | What users do | Tools |
|---|---|---|
| **BIM viewers** | open IFC models, select elements, read properties, filter by category/floor | **That Open Engine** (formerly IFC.js, built on three.js, with web-ifc in WebAssembly), xeokit, Speckle, Autodesk APS viewer |
| **design review & coordination** | section cuts, measurements, clash markers, comments | clipping planes, measurement tools, issue tracking (BCF) |
| **construction progress** | compare as-built scans with the design | point clouds, Gaussian splats, 360° photos synced to BIM |
| **real-estate marketing** | tour unbuilt apartments, change finishes, view from the balcony | R3F walkthroughs, configurators, WebXR |
| **site & city context** | the building in its real neighbourhood | 3D Tiles, Google Photorealistic Tiles |

### Section cuts with clipping planes

Every BIM viewer has a **section tool**: a plane that slices the model so you can see inside. three.js does this with **clipping planes** on materials. Drag the slider to cut the building horizontally, or switch to a vertical cut:

```jsx run title="Section cut through a building (clipping planes)" level=intermediate height=500
import { useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";

function Building({ plane }) {
  // one material per finish, all clipped by the same plane
  const mats = useMemo(() => ({
    slab: new THREE.MeshStandardMaterial({ color: "#d6d3d1", side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ color: "#f5f5f4", side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    core: new THREE.MeshStandardMaterial({ color: "#f59e0b", side: THREE.DoubleSide }),
    furniture: new THREE.MeshStandardMaterial({ color: "#64748b", side: THREE.DoubleSide }),
  }), []);
  Object.values(mats).forEach((m) => (m.clippingPlanes = [plane]));
  const floors = [0, 1, 2, 3];
  return (
    <group>
      {floors.map((f) => (
        <group key={f} position-y={f * 1.2}>
          <mesh position-y={0.05} material={mats.slab}><boxGeometry args={[6, 0.1, 4]} /></mesh>
          {/* outer walls with a glass facade on the front */}
          <mesh position={[0, 0.6, -2]} material={mats.wall}><boxGeometry args={[6, 1.1, 0.1]} /></mesh>
          <mesh position={[-3, 0.6, 0]} material={mats.wall}><boxGeometry args={[0.1, 1.1, 4]} /></mesh>
          <mesh position={[3, 0.6, 0]} material={mats.wall}><boxGeometry args={[0.1, 1.1, 4]} /></mesh>
          <mesh position={[0, 0.6, 2]} material={mats.glass}><boxGeometry args={[6, 1.1, 0.05]} /></mesh>
          {/* interior: a lift/stair core and some furniture */}
          <mesh position={[0, 0.6, -1]} material={mats.core}><boxGeometry args={[1.2, 1.1, 1.2]} /></mesh>
          {[-2, 2].map((x) => <mesh key={x} position={[x, 0.45, 0.6]} material={mats.furniture}><boxGeometry args={[1.2, 0.8, 0.6]} /></mesh>)}
        </group>
      ))}
      <mesh position-y={4.85} material={mats.slab}><boxGeometry args={[6.2, 0.15, 4.2]} /></mesh>
    </group>
  );
}

export default function App() {
  const [axis, setAxis] = useState("horizontal");
  const [cut, setCut] = useState(0.55);
  // a plane keeps everything on the side its normal points AWAY from… so we flip the normal to keep the lower part
  const plane = useMemo(() => new THREE.Plane(), []);
  if (axis === "horizontal") plane.set(new THREE.Vector3(0, -1, 0), cut * 5);   // keep below y = cut × 5
  else plane.set(new THREE.Vector3(0, 0, -1), (cut - 0.5) * 4.2);                 // keep behind z = …
  return (
    <>
      <div className="overlay">
        <div className="row">{["horizontal", "vertical"].map((a) => <button key={a} className={a === axis ? "on" : ""} onClick={() => setAxis(a)}>{a} cut</button>)}</div>
        <label>position <input type="range" min="0" max="1" step="0.01" value={cut} onChange={(e) => setCut(+e.target.value)} /></label>
      </div>
      <Canvas camera={{ position: [8, 7, 9], fov: 40 }} gl={{ localClippingEnabled: true }}>
        <color attach="background" args={["#e7e5e4"]} />
        <Building plane={plane} />
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[20, 20]} /><meshStandardMaterial color="#a8a29e" /></mesh>
        <Environment preset="city" />
        <OrbitControls target={[0, 2, 0]} />
      </Canvas>
    </>
  );
}
```

| Clipping detail | How |
|---|---|
| enable it | `renderer.localClippingEnabled = true` (`gl={{ localClippingEnabled: true }}` in R3F) |
| per material | `material.clippingPlanes = [plane1, plane2]`; `clipIntersection: true` keeps only the region outside *all* planes (a box cutout) |
| everything at once | `renderer.clippingPlanes = [plane]` clips the whole scene (global) |
| solid "caps" on the cut | stencil-buffer technique (three.js `webgl_clipping_stencil` example) so walls look solid, not hollow |
| a draggable section gizmo | a plane mesh + `TransformControls`/`PivotControls` whose transform drives `plane.setFromNormalAndCoplanarPoint()` |

### Captured reality: Gaussian splats

Photogrammetry and **Gaussian splatting** turn photos or a phone video into a photoreal 3D capture of a room, a building or an object. Real-estate listings, construction progress reports, museums and e-commerce use them because they look like reality from any angle. drei's `<Splat>` renders `.splat` files (this one is ~9 MB, so give it a few seconds):

```jsx run title="A Gaussian-splat capture (photoreal, from photos)" level=intermediate height=480
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Splat, useProgress } from "@react-three/drei";

function Loading() {
  const { active, progress } = useProgress();
  return active ? <div className="overlay">Loading capture… {progress.toFixed(0)}%</div> : null;
}

export default function App() {
  return (
    <>
      <Canvas camera={{ position: [0.4, 0.7, 3], fov: 45 }}>
        <color attach="background" args={["#f5f5f4"]} />
        <Suspense fallback={null}>
          <Splat src="https://huggingface.co/cakewalk/splat-data/resolve/main/nike.splat" position={[-0.45, 1.2, -0.6]} />
        </Suspense>
        <OrbitControls />
      </Canvas>
      <Loading />
    </>
  );
}
```

A splat has no fixed "centre": its origin is wherever the capture software put it, so you usually nudge `position`/`rotation` until the subject sits at the origin. Captures come from apps like Polycam, Luma, Scaniverse and Postshot, or open-source training pipelines. Production viewers use compressed formats (`.ksplat`, `.spz`, SOG) and streaming for building-scale captures; three.js r186 ships loaders for these, and libraries like **Spark** render millions of splats efficiently.

## Healthcare & life sciences

| Use | What's shown | Tools |
|---|---|---|
| **patient education & anatomy** | interactive organs, layers, labels, animations | three.js/R3F, glTF anatomy models |
| **medical imaging** | CT/MRI scans as slices and 3D **volume renderings** | **Cornerstone3D**, **vtk.js**, OHIF viewer (DICOM); three.js `Data3DTexture` ray-marching for custom work |
| **surgical planning** | segmented organs and tumours from scans, measurements, implant fitting | segmentations → meshes (marching cubes) → three.js; clipping planes |
| **training & simulation** | procedures in VR, device training | WebXR, physics, haptics |
| **molecular biology & chemistry** | proteins, molecules, docking results | Mol*, NGL, 3Dmol.js; three.js for custom visuals (instanced atoms and bonds) |
| **medical devices & pharma marketing** | how a device or drug works | creative 3D sites (previous lesson) |

:::def Volume rendering
Displaying a 3D grid of values (a CT scan is a stack of slices, each pixel a density) by marching rays through the volume in a shader and accumulating colour and opacity according to a **transfer function** (e.g. bone = white and opaque, soft tissue = faint red). three.js supports it through `Data3DTexture` and custom shaders (`webgl2_materials_texture3d` example); medical-grade viewers add DICOM parsing, windowing and measurement tools.
:::

:::warn Regulated software
Software used for diagnosis or treatment decisions is a **medical device** in most countries (FDA, EU MDR, CDSCO) and needs a quality management system, validation and approval. Patient-education, training and marketing tools usually don't, but patient data always falls under privacy law (HIPAA, GDPR, DPDP Act): keep scans on approved infrastructure and anonymise them.
:::

## Education & training

Interactive 3D turns abstract ideas into things students can poke: the solar system to scale, electric fields, a beating heart, the inside of an engine, a chemistry lab where mistakes are safe. Effective educational 3D:

- **Has a goal per scene** (one concept), with guided steps and questions, not just a model to spin.
- **Lets learners manipulate variables** (sliders for mass, voltage, angle) and see consequences: simulation, not animation.
- **Works on school hardware**: Chromebooks and low-end tablets, so budgets are tight.
- **Uses VR where presence matters** (safety training, field trips, spatial skills), and desktop elsewhere.
- **Integrates with the classroom**: LMS links, progress tracking, accessibility, offline support.

This site itself is an example: live, editable 3D scenes embedded in lessons, with quizzes and exercises.

## Cultural heritage & museums

Museums digitise collections with photogrammetry, laser scanning and splats, then publish them online (Sketchfab collections, custom viewers), build virtual exhibitions, reconstruct lost places, and run AR guides in their galleries. The technical themes: very high-resolution models streamed with LOD, annotations with rich media, accessibility for broad audiences, and long-term preservation (open formats like glTF and IFC-like standards for heritage, CIDOC-CRM metadata).

## Check yourself

```quiz
? What is IFC?
+ An open file format for exchanging BIM (building information) models between tools
- A three.js loader for images
- A WebXR feature
> That Open Engine loads IFC in the browser with three.js.

? Which renderer setting enables per-material clipping planes?
+ renderer.localClippingEnabled = true
- renderer.shadowMap.enabled = true
- material.clip = true
> Then set material.clippingPlanes = [plane].

? What makes Gaussian splats attractive for real estate and heritage?
+ Photoreal captures from photos or video that look right from any angle
- They are tiny files
- They don't need a GPU
> They capture reality quickly, but files are large and need efficient viewers.

? How are CT/MRI scans shown in 3D in the browser?
+ Volume rendering: ray-marching a 3D texture with a transfer function (e.g. Cornerstone3D, vtk.js)
- As glTF models only
- As point clouds only
> Each voxel's density maps to colour and opacity.

? What's the key regulatory caution for medical 3D software?
+ Diagnostic or treatment software is a regulated medical device; patient data needs privacy protection
- Medical 3D must use WebGPU
- There are no regulations
> Education and marketing tools are usually outside device regulation, but privacy always applies.
```

:::exercise Box cutout
Change the building example to use **two** clipping planes with `clipIntersection: true` on the materials, so a corner of the building is cut away (like an architectural cutaway drawing) instead of a single slice.
:::

:::solution
```jsx run height=460
import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

export default function App() {
  const planes = useMemo(() => [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.5), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.5)], []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e7e5e4", side: THREE.DoubleSide, clippingPlanes: planes, clipIntersection: true }), [planes]);
  const core = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f59e0b", clippingPlanes: planes, clipIntersection: true }), [planes]);
  return (
    <Canvas camera={{ position: [5.5, 5, 6.5], fov: 45 }} gl={{ localClippingEnabled: true }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 4]} intensity={1.5} />
      {[0, 1, 2, 3].map((f) => (
        <group key={f} position-y={f * 1.2}>
          <mesh position-y={0.05} material={mat}><boxGeometry args={[4, 0.1, 4]} /></mesh>
          {[[0, 0.6, -2, 4, 0.1], [0, 0.6, 2, 4, 0.1], [-2, 0.6, 0, 0.1, 4], [2, 0.6, 0, 0.1, 4]].map(([x, y, z, w, d], i) => (
            <mesh key={i} position={[x, y, z]} material={mat}><boxGeometry args={[w, 1.1, d]} /></mesh>
          ))}
          <mesh position-y={0.6} material={core}><boxGeometry args={[1, 1.1, 1]} /></mesh>
        </group>
      ))}
      <OrbitControls target={[0, 2, 0]} />
    </Canvas>
  );
}
```
With `clipIntersection: true`, only fragments clipped by **both** planes disappear, so the corner where x > 0.5 and z > 0.5 is removed.
:::

:::keypoints
- **AEC**: BIM/IFC viewers (That Open, xeokit, Speckle), section cuts with **clipping planes**, walkthroughs, site context with 3D Tiles.
- **Captured reality**: photogrammetry and **Gaussian splats** for real estate, construction progress and heritage.
- **Healthcare**: anatomy, DICOM volume rendering (Cornerstone3D, vtk.js), molecules (Mol*, NGL), surgical planning, VR training; mind regulation and privacy.
- **Education**: goal-driven, manipulable simulations on modest hardware; **museums**: digitised collections, virtual exhibitions, AR guides.
:::
