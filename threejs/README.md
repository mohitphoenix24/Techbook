# ThreeLab — Three.js, React Three Fiber & WebXR

A complete, interactive course in 3D for the web with three.js (r186), React Three Fiber (9.8) and WebXR, from your first spinning cube to VR galleries, AR furniture placement and AI-driven scenes. Every lesson explains ideas in plain English, gives clear definitions and syntax, and has **live editors**: change the code and the 3D preview updates instantly, with a console underneath.

## Open it

Open the site from the repo root (`../index.html`) and pick this course, or open this folder's `index.html` directly. No server or install is needed.

The live editors load three.js, React and the other libraries from a CDN ([esm.sh](https://esm.sh)) the first time you run one, and many examples stream models, textures and HDRs from the three.js repository on GitHub, so you need an internet connection to run code. Reading works offline.

If your browser blocks local files, serve the folder instead:

```bash
python3 -m http.server 8000      # from the repo root, then open http://localhost:8000
```

## What's inside

| Module | Lessons |
|---|---|
| 1. Three.js Foundations | start here, how 3D works, scene/camera/renderer, objects & transforms, maths for 3D, geometry, materials, lights & shadows, textures, cameras & controls, animation, interaction & raycasting |
| 2. Three.js in Depth | loading models (glTF, Draco, KTX2), environment lighting & tone mapping, character animation, particles, instancing, GLSL shaders, post-processing, render targets, WebGPU & TSL, text/lines/curves, performance |
| 3. React Three Fiber | R3F basics, hooks, events, state & animation, drei essentials, models & gltfjsx, custom objects & shaders, performance, TypeScript/structure/testing |
| 4. The R3F Ecosystem | physics with Rapier, post-processing, scroll storytelling, game controls, debug GUIs/Views/HUDs/uikit, R3F on WebGPU, production & deployment |
| 5. WebXR: VR & AR on the Web | WebXR fundamentals, VR with three.js, @react-three/xr, interaction (rays, grabbing, hands), locomotion & comfort, AR hit testing & anchors, spatial UI, XR performance & shipping |
| 6. Applications & Industries | where 3D is used, e-commerce configurators, digital twins & robotics, data viz & maps, web games, creative/marketing sites, AEC/healthcare/education/heritage, AI & 3D, choosing a stack & careers |
| Project Lab (12 projects) | solar system explorer · car configurator · robot-arm digital twin · 3D scroll portfolio · marble maze physics game · interactive data globe · LiDAR point-cloud viewer · floor-plan walkthrough · VR art gallery · AR furniture planner · galaxy generator & shader lab · AI scene builder |

Features: Ctrl+K search, a glossary of every definition, progress tracking, quizzes, exercises, light/dark themes (synced into the previews), and a mobile layout.

The live editors include three.js r186 (WebGL and WebGPU renderers, TSL, all addons), React 19.3, React Three Fiber 9.8, drei 10, @react-three/xr 6 and handle, Rapier, @react-three/postprocessing, uikit, leva, maath, zustand, GSAP, Zod, urdf-loader and the IWER WebXR emulator. `js` blocks are plain three.js (top-level `await` works); `jsx`/`tsx` blocks mount the `App` component automatically. Every XR example runs in a **built-in headset emulator** when no real device is present, so VR and AR lessons work on an ordinary laptop. Off-screen previews pause, and at most six previews run at once. AI examples use an offline planner in the browser, so nothing costs money; the lessons also show the real backend code with the official Anthropic SDK and `claude-opus-5-5`, keeping the API key on the server.

## Editing content

Lessons are Markdown files in `content/`. After editing, rebuild the bundle:

```bash
python3 build.py            # regenerates assets/js/content.js
python3 build.py --watch    # rebuild automatically on save
```

Extra Markdown syntax used in lessons:

| Syntax | Renders as |
|---|---|
| ```` ```js run ```` | a live three.js editor with a full-size preview (create a renderer and append its canvas to `document.body`) |
| ```` ```jsx run ```` / ```` ```tsx run ```` | a live R3F editor. The component named `App`, or the default export, is mounted automatically |
| ```` ```jsx ```` / ```` ```glsl ```` (no `run`) | a read-only code sample (backend code, config, shader snippets) |
| ```` ```quiz ```` | a quiz: `? question`, `- wrong`, `+ right`, `> explanation` |
| `:::def Term` … `:::` | a definition card (also added to the Glossary) |
| `:::syntax`, `:::tip`, `:::warn`, `:::note`, `:::ai`, `:::analogy`, `:::keypoints` | callout boxes |
| `:::exercise` / `:::solution` | a practice task with a collapsible solution |
| `:::flow Title` | a step diagram (one step per line, `Title \| detail`) |

Add `title="..."`, `level=easy|intermediate|advanced` or `height=520` (preview height in pixels) after `run`. Each module folder has a `_module.md` with its title, icon, level and description. Projects also take `icon`, `cover` (two colours) and `tags` in their front matter.

Inside previews, a few CSS helpers are available: `.overlay` (a floating panel; add `.right` / `.bottom`), `.row`, `.muted`, `.xr-buttons` (bottom-centre button bar) and `.label3d` (a small label for CSS2D/Html labels).

To use another npm package in the editors, add it to the `IMPORTS` map at the top of `assets/js/runner-three.js`. Mark packages that depend on React, three or R3F as `external` so every module shares one copy (two copies of three.js break `instanceof` checks and materials).

Assets: examples load models and textures from `https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/…` (pinned to the release, with CORS), the Draco decoder from Google's CDN, and a few public-domain paintings and Gaussian splats from Wikimedia Commons and Hugging Face.

## Folder layout

This course is one part of the combined site (see `../README.md`). The design system (`style.css`), the engine (`app.js`), CodeMirror, marked and KaTeX are shared from `../shared/`; the course catalogue is `../courses.js`.

```text
index.html                  the site shell + config
build.py                    bundles content/ → assets/js/content.js
content/                    all lessons and projects (Markdown)
assets/js/runner-three.js   live editor: Babel compile → import map (esm.sh) → sandboxed iframe preview + console + XR emulator
```
