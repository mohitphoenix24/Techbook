---
title: Start Here — 3D on the Web
level: easy
time: 15
summary: What Three.js, React Three Fiber and WebXR are, where 3D on the web is used, how the live scenes on this site work, and your first spinning cube, written twice.
---

Open a car maker's site and spin the car around. Rotate a sneaker before you buy it. Walk through an apartment that hasn't been built yet, or put on a headset and step into a museum from a link. All of that runs in an ordinary browser tab, and most of it is built with **Three.js**.

This course teaches 3D on the web from zero: first plain Three.js, then **React Three Fiber** (Three.js written as React components), then shaders, physics and the new WebGPU renderer, and finally **WebXR**, which takes the same scenes into VR headsets and AR on phones. The last part covers the industries that pay for this work, with a dozen projects drawn from them.

:::def Three.js
A free, open-source JavaScript library that draws interactive 3D graphics in the browser. It sits on top of the browser's low-level GPU APIs (**WebGL**, and now **WebGPU**) and gives you friendly building blocks: scenes, cameras, lights, 3D models, materials and animation.
:::

:::def WebGL / WebGPU
Browser APIs that let JavaScript send work to the computer's graphics card (GPU). WebGL has been everywhere since 2011. WebGPU is its modern successor, now shipping in all major browsers. Writing either one by hand takes hundreds of lines for a single triangle, which is why libraries like Three.js exist.
:::

:::def React Three Fiber (R3F)
A React renderer for Three.js. Instead of `new THREE.Mesh()` you write `<mesh />` in JSX. Your 3D scene becomes components with props and state. It adds no rendering overhead and supports everything Three.js does.
:::

:::def WebXR
The browser API for **virtual reality** (VR, a fully digital world in a headset) and **augmented reality** (AR, digital objects placed in the real world through a phone camera or headset passthrough). Three.js and R3F both support it. Users open a link instead of installing an app.
:::

## Your first scene

Press **▶ Run**. A cube appears and spins. After the first run the scene re-renders **as you type**, so change `"#34d399"` to `"hotpink"` or `0.01` to `0.05` and watch.

```js run title="main.js — your first Three.js scene" level=easy
import * as THREE from "three";

// 1. A scene holds everything you want to draw
const scene = new THREE.Scene();

// 2. A camera decides what part of the scene you see
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 3;                       // step back so the cube is in view

// 3. A renderer draws the scene, from the camera's point of view, into a <canvas>
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// 4. A mesh = a shape (geometry) + a surface (material)
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshNormalMaterial()             // colours each face by its direction: no light needed
);
scene.add(cube);

// 5. Draw a new frame ~60 times a second
renderer.setAnimationLoop(() => {
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
});
```

Those five steps are the skeleton of every Three.js app, from this cube to a car configurator: **scene, camera, renderer, objects, loop**.

:::analogy
Think of a film set. The **scene** is the stage with all the props. The **camera** is the film camera: where it stands and how wide its lens is decides what ends up in the shot. The **renderer** is the crew that turns the stage into a frame of film, 60 times a second. A **mesh** is one prop: a shape (wood cut to size) with a finish (paint, metal, glass).
:::

## The same cube in React Three Fiber

Here is the same idea written as React components. `<Canvas>` creates the scene, camera, renderer and loop for you. Every Three.js class becomes a lowercase JSX tag. This version also adds light, a shinier material and mouse orbiting: **drag** the scene, **scroll** to zoom, and **click** the cube.

```jsx run title="App.jsx — the same idea in R3F" level=easy
import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

function Cube() {
  const ref = useRef();
  const [big, setBig] = useState(false);
  useFrame((state, delta) => {                // runs every frame
    ref.current.rotation.x += delta * 0.6;    // delta = seconds since last frame
    ref.current.rotation.y += delta * 0.6;
  });
  return (
    <mesh ref={ref} scale={big ? 1.5 : 1} onClick={() => setBig(!big)}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#34d399" roughness={0.3} />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 3] }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={2} />
      <Cube />
      <OrbitControls />
    </Canvas>
  );
}
```

Notice `delta`. The R3F version rotates by *seconds × speed* instead of a fixed amount per frame, so it spins at the same speed on a 60 Hz laptop and a 120 Hz phone. You'll use that habit everywhere.

:::tip How the live scenes on this site work
Each example is compiled in your browser and runs in a sandboxed frame with three.js r186, React 19, React Three Fiber 9 and friends loaded from a CDN. Plain `js` examples create their own renderer and add its canvas to the page. `jsx` examples define a component called **App** (or `export default` one), which is mounted full-size. Use **Fullscreen** for a bigger view and **Console** to see `console.log` output. Scenes pause automatically when you scroll away.
:::

## Where 3D on the web is used

| Field | What gets built | Example |
|---|---|---|
| E-commerce | product viewers, configurators, "view in your room" AR | sneakers, furniture, watches in every colour and material |
| Automotive | car configurators, launch sites | paint, wheels and interiors switched live |
| Manufacturing & robotics | digital twins, CAD viewers, robot simulators | a factory floor with live sensor data on each machine |
| Architecture & real estate | walkthroughs, BIM viewers, interactive floor plans | touring an apartment before it's built |
| Data & science | 3D charts, globes, point clouds, molecules | flight paths on a globe, LiDAR scans, protein structures |
| Games & entertainment | browser games, music videos, interactive stories | games that start instantly from a link |
| Marketing & portfolios | award-winning scroll-driven sites | product launches, agency and developer portfolios |
| Education & medicine | simulations, anatomy viewers, training in VR | a beating heart you can slice, safety training in a headset |

Module 6 goes through each of these in detail, with the libraries and architectures real teams use.

## Why Three.js?

It is the most widely used 3D library on the web by a wide margin. It is MIT-licensed (free for commercial work), small enough to load quickly, runs on every modern browser and phone, and has a huge ecosystem: thousands of examples, loaders for every 3D file format, physics engines, post-processing, VR support and React bindings. Unlike exporting a game engine to the web, there is no multi-megabyte runtime to download first.

## The roadmap

:::flow How this course is organised
Foundations | scene, camera, renderer, transforms, materials, light
Three.js in depth | models, shaders, particles, WebGPU, performance
React Three Fiber | 3D as React components
R3F ecosystem | physics, effects, scroll sites, production
WebXR | VR & AR from a link
Applications | industries, architectures, career paths
Project Lab | 12 complete apps
:::

## Setting up a project on your computer

The live scenes need nothing installed. For your own projects, use **Vite**:

```bash
# Plain Three.js
npm create vite@latest my-3d-app -- --template vanilla
cd my-3d-app
npm install three
npm install -D @types/three      # editor autocompletion, even in plain JS
npm run dev                      # open the printed http://localhost:5173 URL

# React Three Fiber
npm create vite@latest my-r3f-app -- --template react-ts
cd my-r3f-app
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
npm run dev
```

You'll need **Node.js** (the LTS version). Import paths are the same as on this site: `import * as THREE from "three"`, and extras such as controls and loaders come from `"three/addons/..."`.

:::note What you should know first
Basic JavaScript (variables, functions, objects, arrays, `import`) is enough for Module 1. The React modules assume you know components, props, state and hooks; if you don't, the **ReactLab** course on this site covers exactly that. No previous 3D or math experience is needed: the math lesson starts from scratch.
:::

## Check yourself

```quiz
? What are the three objects every Three.js app needs before anything appears on screen?
+ A scene, a camera and a renderer
- A mesh, a light and a texture
- A canvas, a shader and a GPU
> The scene holds objects, the camera chooses the view, the renderer draws it into a canvas.

? What is a mesh?
- A light source
+ A geometry (the shape) combined with a material (the surface)
- The canvas element
> A mesh is the visible object: shape + surface.

? Why does the R3F example multiply rotation by `delta`?
+ So the speed is the same on 60 Hz and 120 Hz screens
- Because React requires it
- To make the cube rotate backwards
> delta is the time since the last frame in seconds; speed × time is frame-rate independent.

? What does WebXR add?
- Faster rendering
+ The ability to show a scene in VR headsets and as AR on phones and headsets
- 3D file loading
> WebXR is the browser API for immersive VR and AR sessions.
```

:::exercise Your turn
In the plain Three.js example, add a **second cube** to the right of the first (hint: `cube2.position.x = 1.5`) that spins the other way. Then move the camera back (`camera.position.z = 5`) so both fit.
:::

:::solution
```js run
import * as THREE from "three";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const geometry = new THREE.BoxGeometry(1, 1, 1);     // shapes and materials can be shared
const material = new THREE.MeshNormalMaterial();
const cube1 = new THREE.Mesh(geometry, material);
const cube2 = new THREE.Mesh(geometry, material);
cube1.position.x = -1;
cube2.position.x = 1.5;
scene.add(cube1, cube2);

renderer.setAnimationLoop(() => {
  cube1.rotation.y += 0.01;
  cube2.rotation.y -= 0.01;
  renderer.render(scene, camera);
});
```
:::

:::keypoints
- **Three.js** draws 3D in the browser on top of WebGL/WebGPU; **R3F** lets you write it as React components; **WebXR** takes it into VR and AR.
- Every app has the same skeleton: **scene → camera → renderer → meshes → animation loop**.
- A **mesh** is a geometry (shape) plus a material (surface).
- Multiply movement by **delta time** so animation speed doesn't depend on the screen's refresh rate.
- On this site, press ▶ Run: scenes update as you type, with Fullscreen and Console buttons.
:::
