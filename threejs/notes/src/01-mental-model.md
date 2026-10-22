---
title: The 3D Mental Model
part: Foundations of 3D Graphics
summary: What real-time rendering actually is, the handful of objects every 3D app is built from, the coordinate systems that a point travels through, and how three.js and React Three Fiber map onto all of it.
difficulty: Foundation
prereqs: Basic JavaScript
time: 45–60 minutes
outcome: Explain how a real-time 3D frame is produced, name the objects every scene needs, and write the same lit, animated scene in three.js and in React Three Fiber.
---

## What real-time rendering is

A 3D scene on a screen is an illusion made of flat pictures. Many times per second the computer takes a mathematical description of a world (shapes, surfaces, lights, a camera) and **renders** it into a grid of coloured pixels. Show those pictures fast enough and the brain sees smooth motion.

:::def Rendering
The process of turning a description of a 3D scene into a 2D image. **Real-time** rendering must finish each image inside a fixed time budget (for example 16.7 ms) so the result can be shown interactively. **Offline** rendering (films, product shots) may spend minutes or hours per image.
:::

:::def Frame and frame rate
A **frame** is one finished image. The **frame rate** is how many frames are produced per second (FPS). The **frame time** is the time one frame takes, $t = 1000 / \text{FPS}$ milliseconds.
:::

Displays refresh at a fixed rate: most laptops at 60 Hz, many phones at 90–120 Hz, VR headsets at 72–120 Hz. The browser calls your render function once per refresh through `requestAnimationFrame` (three.js wraps this as `renderer.setAnimationLoop`). If your work for one frame takes longer than the refresh interval, a refresh is missed and the animation stutters.

:::formula Frame budget
$$t_{\text{budget}} = \frac{1000\ \text{ms}}{f_{\text{refresh}}}$$
$f_{\text{refresh}}$ is the display refresh rate in hertz. Everything you do in a frame (JavaScript, physics, the GPU's drawing) must fit inside $t_{\text{budget}}$.
:::

:::calc Budgets you should know by heart
- 60 Hz: $1000 / 60 = 16.67$ ms per frame.
- 90 Hz (Quest-class headsets): $1000/90 = 11.11$ ms.
- 120 Hz (ProMotion iPad, gaming phones): $1000/120 = 8.33$ ms.

If your JavaScript takes 6 ms and the GPU needs 9 ms, the CPU and GPU work in parallel (the GPU draws frame $n$ while JavaScript prepares frame $n+1$), so the frame time is roughly $\max(6, 9) = 9$ ms. That fits 60 Hz and 90 Hz, but not 120 Hz.
:::

@fig(frame_budget) One frame at 60 Hz. The CPU (JavaScript, scene updates, issuing draw calls) and the GPU (vertex and fragment work) overlap. The slower of the two decides the frame rate, so you must first find out which side is the bottleneck.

:::intuition A flip book
Rendering is a flip book that draws its own pages. Each page must be drawn in the time it takes to flip to it. If one page takes too long, the book visibly stutters.
:::

## The building blocks of every 3D app

Every 3D engine, from three.js to Unreal, is built from the same small set of ideas. Learn these words precisely: interviews start here.

:::def Scene
A container (a tree, called the **scene graph**) holding everything that can be drawn or that affects drawing: meshes, lights, cameras, helpers and groups. In three.js, `THREE.Scene`.
:::

:::def Camera
The viewpoint. It defines where the eye is, where it looks, and how 3D is flattened into 2D (the **projection**: perspective or orthographic). In three.js, `PerspectiveCamera` or `OrthographicCamera`.
:::

:::def Renderer
The object that talks to the GPU. Each frame it walks the scene, works out what is visible from the camera, and issues the GPU commands that draw it into a canvas. In three.js, `WebGLRenderer` or `WebGPURenderer`.
:::

:::def Mesh
A drawable object made of a **geometry** (the shape: vertex positions, normals, UVs, triangle indices) and a **material** (how the surface reacts to light: colour, roughness, textures, the shader program).
:::

:::def Light
A source of illumination used by lit materials: ambient, hemisphere, directional (sun), point (bulb), spot and rect-area lights in three.js, plus **image-based lighting** from an environment map.
:::

The relationship is easy to remember: **the renderer draws the scene as seen by the camera**, which in code is literally `renderer.render(scene, camera)`.

| Concept | Responsibility | three.js | R3F (JSX) |
|---|---|---|---|
| Scene | Holds the world | `new THREE.Scene()` | created by `<Canvas>` |
| Camera | Eye + projection | `new THREE.PerspectiveCamera(50, aspect, 0.1, 100)` | `<Canvas camera={{ fov: 50, position: [0, 1, 5] }}>` |
| Renderer | Talks to the GPU | `new THREE.WebGLRenderer({ antialias: true })` | created by `<Canvas gl={...}>` |
| Geometry | Shape data | `new THREE.BoxGeometry(1, 1, 1)` | `<boxGeometry args={[1, 1, 1]} />` |
| Material | Surface look | `new THREE.MeshStandardMaterial({ color: "orange" })` | `<meshStandardMaterial color="orange" />` |
| Mesh | Geometry + material | `new THREE.Mesh(geo, mat)` | `<mesh>…</mesh>` |
| Light | Illumination | `new THREE.DirectionalLight("white", 2)` | `<directionalLight intensity={2} />` |

## Coordinate systems

A 3D world needs agreed directions. three.js uses a **right-handed** coordinate system with **+Y up**. Point your right hand's thumb along +X (right), index finger along +Y (up); your middle finger points along +Z, **towards you**, out of the screen. A camera with no rotation therefore looks down **−Z**.

@fig(coord_system) The three.js world axes. The default camera sits on +Z and looks towards −Z. Positive rotation about an axis is anticlockwise when you look down that axis towards the origin (the right-hand rule).

:::def Right-hand rule
For a right-handed system, $\mathbf{x} \times \mathbf{y} = \mathbf{z}$. Curl the fingers of your right hand in the direction of rotation and your thumb points along the axis; a **positive** angle turns anticlockwise when seen from the tip of the axis.
:::

:::warn Other tools use other conventions
Blender is right-handed but **Z-up**; Unity is **left-handed** Y-up; Unreal is left-handed Z-up. glTF is right-handed Y-up like three.js, which is one reason glTF is the preferred format: models arrive the right way up. Since r184, `FBXLoader` converts Z-up models to Y-up automatically.
:::

**Units.** three.js has no built-in unit, but the convention (and what WebXR, physics engines and glTF assume) is **1 unit = 1 metre**. Keep it: lights with physical intensities, physics gravity of $9.81\ \text{m/s}^2$ and VR scale only look right when the world is in metres.

### The journey of a vertex through spaces

A single vertex passes through a chain of coordinate systems before it becomes a pixel. Each arrow is a matrix multiplication, which the next chapters derive one by one.

@fig(spaces_chain) The coordinate spaces of the rendering pipeline. three.js builds the model, view and projection matrices for you; the GPU performs the divide by $w$ and the viewport mapping in fixed hardware.

| Space | What the numbers mean | Who computes it |
|---|---|---|
| Local (object / model) space | Relative to the object's own origin, as authored | The geometry's data |
| World space | Relative to the scene origin | `object.matrixWorld` (model matrix) |
| View (camera / eye) space | Relative to the camera; camera at origin looking down −Z | `camera.matrixWorldInverse` (view matrix) |
| Clip space | 4D homogeneous coordinates after projection | `camera.projectionMatrix` |
| NDC | Clip ÷ $w$: a cube from −1 to 1 (z from 0 to 1 in WebGPU) | GPU (perspective divide) |
| Screen (window) space | Pixels, origin top-left in CSS, bottom-left in GL | GPU (viewport transform) |

:::formula The whole chain in one line
$$\mathbf{p}_{\text{clip}} = P \cdot V \cdot M \cdot \mathbf{p}_{\text{local}}$$
$M$ is the model (world) matrix, $V$ the view matrix (inverse of the camera's world matrix), $P$ the projection matrix. In a three.js vertex shader this is `projectionMatrix * modelViewMatrix * vec4(position, 1.0)`, where `modelViewMatrix` $= V M$ is precomputed on the CPU per object.
:::

## Your first scene

Here is the smallest complete program in both styles. Read them side by side: R3F does exactly what the plain three.js code does, only declaratively.

```js title="three.js — a lit, spinning cube"
import * as THREE from "three";

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1020");

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 4);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // cap: 3x screens cost 2.25x the pixels of 2x
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: "#34d399", roughness: 0.4 })
);
scene.add(cube);
scene.add(new THREE.HemisphereLight("#dbeafe", "#1e293b", 1.5));
const sun = new THREE.DirectionalLight("#ffffff", 2.5);
sun.position.set(3, 4, 2);
scene.add(sun);

const timer = new THREE.Timer();       // core since r179; replaces the deprecated Clock
timer.connect(document);               // pauses cleanly when the tab is hidden
renderer.setAnimationLoop((time) => {
  timer.update(time);
  cube.rotation.y += timer.getDelta() * 0.8;   // radians per second: frame-rate independent
  renderer.render(scene, camera);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();       // the aspect lives inside the projection matrix
  renderer.setSize(innerWidth, innerHeight);
});
```

```jsx title="R3F — the same scene"
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";

function Cube() {
  const ref = useRef();
  useFrame((state, delta) => { ref.current.rotation.y += delta * 0.8; });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#34d399" roughness={0.4} />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas camera={{ fov: 50, position: [0, 1.2, 4] }} dpr={[1, 2]}>
      <color attach="background" args={["#0b1020"]} />
      <hemisphereLight args={["#dbeafe", "#1e293b", 1.5]} />
      <directionalLight position={[3, 4, 2]} intensity={2.5} />
      <Cube />
    </Canvas>
  );
}
```

What `<Canvas>` did for you: created the scene, a perspective camera, a `WebGLRenderer` with sensible defaults (antialiasing, sRGB output, ACES Filmic tone mapping in R3F), a render loop, resize handling and pointer events. `dpr={[1, 2]}` clamps the device pixel ratio between 1 and 2.

:::tip Two rules from the very first scene
1. **Animate with time, not frames.** `rotation.y += 0.01` spins twice as fast at 120 Hz as at 60 Hz. Multiply by the frame's delta time instead.
2. **Cap the pixel ratio.** Pixel count grows with the square of the ratio: a 3× phone screen at full ratio costs $3^2/2^2 = 2.25$ times the fragment work of 2×, for little visible gain.
:::

## How three.js is organised

three.js ships as one npm package, `three`, versioned `0.NNN.x` where NNN is the release number (r186 is `three@0.186.0`). Releases land every two to three months. It has a small number of entry points:

| Import | What you get |
|---|---|
| `three` | Core: maths, scene graph, geometries, materials, lights, loaders' base classes, `WebGLRenderer` |
| `three/addons/...` | Everything optional: `OrbitControls`, `GLTFLoader`, `DRACOLoader`, `EffectComposer`, `RGBELoader`'s successor `HDRLoader`, `SunLight`, … |
| `three/webgpu` | The same core plus `WebGPURenderer`, node materials and `RenderPipeline` |
| `three/tsl` | TSL, the three.js shading language (shader code written as JavaScript functions) |

:::new The modern three.js baseline (r180–r186)
- `THREE.Timer` is in core (r179) and `Clock` is deprecated (r183).
- `RGBELoader` is now `HDRLoader` (r180).
- The `PostProcessing` class of the WebGPU renderer is now `RenderPipeline` (r183).
- `PCFSoftShadowMap` is gone (r186); `PCFShadowMap` is soft since r182.
- `SunLight` gives cascaded shadows for both renderers (r186), and a Gaussian-splatting addon arrived in r186.
- The minified builds were removed and the CommonJS build deprecated (r186): use ES modules.
Upgrade in steps of at most ten releases, because deprecation warnings only last ten releases.
:::

## What React Three Fiber is

:::def React Three Fiber (R3F)
A **React renderer** for three.js. Just as `react-dom` turns JSX into DOM nodes, `@react-three/fiber` turns JSX into three.js objects. `<mesh>` becomes `new THREE.Mesh()`, props become property assignments, and children are added with `.add()` (or attached to a property with `attach`). It adds no wrapper layer at render time: every frame is still plain three.js.
:::

Three facts make R3F click:

1. **Every three.js class is available as lower-camel-case JSX.** `THREE.MeshPhysicalMaterial` → `<meshPhysicalMaterial>`. Constructor arguments go in `args={[...]}`.
2. **Props set properties, with dashes for nesting.** `position={[1, 2, 3]}` calls `position.set(1, 2, 3)`; `rotation-y={Math.PI}` sets `rotation.y`; `material-color="red"` reaches into the material.
3. **React state is for things that change rarely.** Per-frame animation goes in `useFrame` by mutating refs, never through `setState` (Chapter 21 explains why).

R3F version 9 pairs with React 19 (R3F 8 pairs with React 18). Its `gl` prop accepts an **async factory**, which is how you plug in `WebGPURenderer`.

:::keypoints
- A frame must finish inside $1000/f$ ms: 16.67 ms at 60 Hz, 11.11 ms at 90 Hz, 8.33 ms at 120 Hz.
- Scene, camera, renderer, mesh (geometry + material), light: `renderer.render(scene, camera)`.
- three.js is right-handed and Y-up; the camera looks down −Z; 1 unit = 1 metre by convention.
- A vertex travels local → world → view → clip → NDC → screen via $P\,V\,M\,\mathbf{p}$.
- Animate by delta time, cap the pixel ratio, update the projection matrix on resize.
- R3F maps JSX to three.js objects one-to-one; per-frame changes are mutations in `useFrame`.
:::

## Interview questions

:::qa What are the minimum objects you need to show something with three.js, and what does each do? {level=junior}
A **scene** (the container of everything), a **camera** (the viewpoint and projection), a **renderer** (draws the scene from the camera into a canvas with the GPU), and at least one **mesh** (geometry + material). If the material is lit (`MeshStandardMaterial`), you also need light: a light object or an environment map, otherwise the mesh renders black. Then call `renderer.render(scene, camera)`, usually every frame inside `renderer.setAnimationLoop`.
:::

:::qa Why must animation use delta time? Give the numbers. {level=junior}
Because frame rates differ between devices. `rotation += 0.01` per frame gives $0.6$ rad/s at 60 Hz but $1.2$ rad/s at 120 Hz. Multiplying a speed in units per second by the frame's delta, `rotation += speed * delta`, gives the same motion on every device. In three.js use `THREE.Timer` (`update()` then `getDelta()`); in R3F, `useFrame((state, delta) => …)` passes delta directly.
:::

:::qa Which coordinate system does three.js use, and why does it matter when importing models? {level=mid}
Right-handed, +Y up, the camera looks down −Z, and by convention 1 unit is 1 metre. Tools differ: Blender is Z-up, Unity is left-handed. A model exported with another convention arrives lying on its side or mirrored, and at the wrong scale (centimetres give a model 100× too big). glTF fixes the convention (right-handed, Y-up, metres), which is why it is the recommended format; exporters convert on export.
:::

:::qa What happens on a window resize, and what goes wrong if you forget it? {level=junior}
Two things must change: the camera's `aspect` (then `camera.updateProjectionMatrix()`, because aspect is baked into the projection matrix) and the renderer's drawing-buffer size (`renderer.setSize`). Forget the first and the image stretches; forget the second and the canvas is blurry (upscaled) or crops. R3F's `<Canvas>` handles both automatically by observing its container's size.
:::

:::qa How does React Three Fiber relate to three.js? Is it slower? {level=mid}
R3F is a React renderer (a custom reconciler) whose host objects are three.js objects. JSX elements are converted to `new THREE.X(...args)`, props to property sets, children to `add()` or `attach`. Rendering is still three.js's own `renderer.render`, so there is no per-frame overhead from React. React only does work when the component tree changes. It becomes slow only if you misuse React, for example calling `setState` every frame, which re-renders components 60 times a second; the correct pattern is mutating refs in `useFrame`.
:::
