---
title: About This Book
id: about
---

Real-time 3D on the web sits at the meeting point of three disciplines: the mathematics of space, the architecture of the GPU, and the engineering of interactive applications. Most learning material covers one of them. This book connects all three, so that when you place a camera, write a shader or chase a frame-time problem, you know *why* the code works and not only *what* to type.

<div class="pos">
<p>Learn the mathematics.<br>Understand the rendering pipeline.<br>Build with three.js and React Three Fiber.<br>Optimise real-time 3D applications.<br>Prepare for technical interviews.</p>
</div>

## The method

Every topic follows the same path, so you always know where to look:

:::flow
**First principles**: what the idea is and the problem it solves
**Mathematics**: the formula, every symbol explained, then a worked example with real numbers
**Implementation**: the same idea in plain three.js and in React Three Fiber
**Practical advice**: pitfalls, performance and the decisions experienced engineers make
**Interview**: questions you may be asked, with model answers
:::

## What is inside

- **Thirty chapters in nine parts**, from vectors and matrices to WebGPU compute, React Three Fiber architecture and WebXR.
- **Worked calculations** for every important formula, checked against three.js itself.
- **Diagrams** that show mechanisms (pipelines, coordinate spaces, frustums, shadow maps, BVHs), several of them rendered pixel by pixel from the very equations the text explains.
- **Build This** exercises at the end of the key chapters, and capstone project briefs.
- **Performance case studies** and a reference of **50 common three.js / R3F problems**, each with symptom, cause, investigation, fix and prevention.
- **Decision guides** for choosing between techniques, an **interview bank** with revision plans, formula sheets, API quick references and a glossary.

## Technology baseline

Written against **three.js r186, React Three Fiber 9, drei 10 and React 19**. three.js releases every two to three months and keeps deprecation warnings for about ten releases; where an API changed recently, an **API change** callout shows the older pattern you will still see in tutorials, the current one, and the version in which it changed.
