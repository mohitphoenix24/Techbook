---
title: Capstone Projects
part: Projects
summary: Six project briefs that combine the whole book into portfolio-quality applications: what to build, the architecture, the milestones, the APIs you will rely on and how to stretch each one. Each brief names the chapters it draws on, so you can revise exactly what you need.
difficulty: Intermediate
prereqs: Parts II–V
time: Several days per project
outcome: Plan, build and extend a complete real-time 3D product using the techniques from the earlier chapters.
---

## How to use these briefs

A project teaches what chapters cannot: making dozens of decisions that interact. Each brief below gives the goal and the constraints, a suggested architecture and a sequence of milestones, but not the code. Build the first milestone end to end before adding features, measure performance from the start (Chapter 23), and keep a short log of the decisions you make and why. Reference implementations live in the `projects/` folder of the companion repository.

:::flow A milestone rhythm that works
**Spike**: the smallest version that proves the hardest part (the shader, the physics, the data feed)
**Skeleton**: scene structure, state store, asset loading, render loop, resize and disposal
**Features**: one at a time, each with its own small test scene
**Budget pass**: measure draw calls, frame time, VRAM and load time on a phone; fix the worst
**Polish**: lighting, tone mapping, transitions, loading states, accessibility and fallbacks
:::

## Product configurator

:::project Furniture configurator
Brief: A sofa (or shoe, or car) that customers can rotate, recolour and re-upholster, with accurate colours and a shareable link to their configuration. Draws on Chapters 11–13, 16, 21–23.
Features:
- Orbit and auto-framing; hotspots with HTML labels.
- Fabric, leg and colour options; price summary in the DOM.
- Configuration stored in the URL; a screenshot for the cart.
Architecture: zustand store for the configuration; DOM option pickers write to it; a gltfjsx model component subscribes with selectors. All material variants created and compiled during loading. Neutral tone mapping, a studio HDR, contact shadows, `frameloop="demand"`.
Milestones: model pipeline (gltf-transform, KTX2) → viewer with framing → material variants → URL state → screenshot → mobile budget pass.
Key APIs: `useGLTF`, `MeshPhysicalMaterial` (sheen for fabric), `Environment`, `ContactShadows`, `Bounds`, `NeutralToneMapping`, `compileAsync`, `toBlob`.
Stretch goals: AR view (USDZ for iOS Quick Look, WebXR on Android); a dimension overlay; comparing two configurations side by side with `View`.
:::

## Digital twin dashboard

:::project Factory-floor digital twin
Brief: A live 3D view of a production line where each machine shows its status from a real-time data feed, with history playback. Draws on Chapters 8, 14, 16, 21–23.
Features:
- Machines coloured by status; alarms pulse.
- Click a machine for a details panel; search and fly-to.
- A timeline to replay the last hour.
Architecture: static building merged with baked lighting; machines as `InstancedMesh`/`BatchedMesh` by type; a WebSocket feed buffered into a store and applied once per frame; labels only for nearby, visible machines.
Milestones: static scene → instanced machines with picking → simulated live feed → details panel → history playback → stress test with 10× the machines.
Key APIs: `BatchedMesh`, `setColorAt`, `Raycaster` with `instanceId`, drei `Html`, `CameraControls`, zustand transient reads.
Stretch goals: heatmap overlay as a texture on the floor; WebXR walkthrough; anomaly highlighting from an ML service.
:::

## Interactive data globe

:::project Data globe
Brief: An Earth with atmosphere glow, day–night shading and thousands of animated arcs between cities, driven by a dataset you choose. Draws on Chapters 6, 10, 15, 18, 20.
Features:
- Lat/long to 3D conversion; arcs as great-circle curves.
- Animated "data packets" travelling along arcs.
- Hover a city to highlight its connections.
Architecture: sphere with a custom shader (day/night mix by sun direction, Fresnel atmosphere); arcs as instanced tube or line geometry with a shader-driven dash offset; city points instanced.
Milestones: lat/long maths with tests → textured globe → atmosphere shader → arcs → animation → interaction.
Key APIs: `Spherical`/`setFromSphericalCoords`, `QuadraticBezierCurve3` or `CatmullRomCurve3`, `TubeGeometry`, `ShaderMaterial` or TSL, `InstancedMesh`.
Stretch goals: a WebGPU compute version with 100,000 particles flowing along arcs; time scrubbing; a 2D map projection that morphs into the globe.
:::

## Physics game

:::project Marble maze
Brief: Tilt a maze with the keyboard, mouse or phone orientation to guide a ball to the goal, with levels loaded from data. Draws on Chapters 7, 14, 15, 17, 21.
Features:
- Kinematic maze tilt, dynamic ball with CCD.
- Goal sensor, timer, level progression.
- Sound on collisions, camera shake on hard hits.
Architecture: Rapier world with a fixed time step and interpolation; the maze as a kinematic body moved with `setNextKinematicRotation`; levels as JSON grids converted to instanced colliders and meshes.
Milestones: tilt and ball → walls from data → goal and timer → effects → device-orientation input → level editor.
Key APIs: `@react-three/rapier` (`Physics`, `RigidBody`, `CuboidCollider`, sensors, `onCollisionEnter`), `DeviceOrientationEvent`, `PositionalAudio`.
Stretch goals: replays recorded from inputs (requires a deterministic step); online leaderboard; procedural mazes.
:::

## Shader and particle lab

:::project Galaxy generator and shader lab
Brief: A procedural spiral galaxy with hundreds of thousands of particles, controllable parameters, and a gallery of post-processing looks. Draws on Chapters 12, 18–20.
Features:
- Parameters: arm count, spin, randomness, colours, size.
- GPU-animated rotation with differential speed by radius.
- Bloom and colour grading presets.
Architecture: positions generated in a compute shader (WebGPU) or once on the CPU (WebGL); rotation in the vertex stage from time and radius; additive blending without depth writes; a `RenderPipeline` with bloom.
Milestones: static galaxy → shader rotation → parameter panel (leva) → compute generation → post-processing presets → screenshot export.
Key APIs: `instancedArray`, `Fn().compute()`, `SpriteNodeMaterial`, `AdditiveBlending`, `RenderPipeline`, `bloom()`, leva.
Stretch goals: black-hole lensing with a screen-space distortion; audio-reactive parameters; export a short video with `MediaRecorder`.
:::

## WebXR experience

:::project VR art gallery
Brief: A small gallery you can explore in VR or on a laptop, with teleport, readable labels and paintings that can be picked up and inspected. Draws on Chapters 10, 11, 16, 25.
Features:
- Teleport and snap turn; seated and standing modes.
- Wall labels sized by visual angle; audio guide per painting.
- Grab and inspect with controllers or hand pinch.
Architecture: baked lighting for the rooms; paintings as one material with an array texture (or an atlas); `@react-three/xr` store with teleport targets; a desktop fallback with pointer-lock controls.
Milestones: rooms with baked light → desktop navigation → XR session in the emulator → teleport → grabbing → performance pass on a standalone headset.
Key APIs: `createXRStore`, `XR`, `XROrigin`, `TeleportTarget`, `useXRHitTest` (for an AR mode), `PositionalAudio`, drei `Text`.
Stretch goals: AR mode that places a painting on your real wall with hit testing and anchors; multi-user visits with avatars.
:::

:::keypoints
- Build the hardest part first as a spike, then the skeleton, then features one by one.
- Measure on a phone from the first milestone, not at the end.
- Each brief maps to specific chapters; revise those before starting.
- Keep a decision log: it becomes the best answer to "tell me about a project" in an interview.
:::
