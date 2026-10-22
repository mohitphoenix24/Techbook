---
title: Who This Book Is For
id: audience
---

<div class="cols2">
<div><h4 style="color:var(--em)">This book is for you if…</h4><ul>
<li>You write JavaScript comfortably and want to build 3D for the web.</li>
<li>You have used three.js or React Three Fiber a little and want to understand what is really happening.</li>
<li>You are a front-end or React developer moving into WebGL, WebGPU or WebXR work.</li>
<li>You are preparing for a creative-developer, graphics or 3D front-end interview.</li>
<li>You build configurators, digital twins, data visualisation, games or XR and need them fast and correct.</li>
</ul></div>
<div><h4 style="color:var(--rd)">This book is not…</h4><ul>
<li>A JavaScript or React course: modules, promises, components and hooks are assumed.</li>
<li>A 3D modelling or Blender course: models are treated as assets you load.</li>
<li>A collection of copy-paste effects without explanation.</li>
<li>A reference for every three.js class: the official documentation does that; this book teaches the ideas that let you read it.</li>
</ul></div>
</div>

## Prerequisites

- **JavaScript (ES2020+)**: modules, classes, arrow functions, `async`/`await`, typed arrays at a basic level.
- **For the React Three Fiber part**: React components, props, state and hooks (`useState`, `useEffect`, `useRef`, `useMemo`).
- **Mathematics**: school algebra and trigonometry (sine, cosine, right-angled triangles). Vectors, matrices and quaternions are taught from scratch in Part I.
- **Tools**: a modern browser and a bundler such as Vite.

## What you will be able to do

By the end of the book you will be able to:

1. **Reason about 3D space**: transform points between local, world, view, clip and screen space by hand, and choose between Euler angles, matrices and quaternions.
2. **Explain the rendering pipeline**: what the CPU and GPU each do per frame, how rasterisation, depth testing and blending work, and where performance is lost.
3. **Build scenes correctly**: geometry, PBR materials, lights and shadows, textures with the right colour spaces, tone mapping and environment lighting.
4. **Make things move and respond**: animation and skinning, raycasting and picking, physics, and asset pipelines built on glTF.
5. **Program the GPU**: write GLSL and TSL, build post-processing chains, and run compute shaders on `WebGPURenderer`.
6. **Engineer React Three Fiber applications**: know how the reconciler works, manage state without re-renders, and structure real products.
7. **Diagnose and optimise**: find whether a frame is CPU- or GPU-bound and apply the fix that actually helps.
8. **Explain all of this clearly in an interview**, with the vocabulary and the trade-offs interviewers listen for.
