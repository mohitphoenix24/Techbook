---
title: WebXR Fundamentals
level: intermediate
time: 35
summary: What WebXR is and isn't, VR versus AR versus mixed reality, session modes, reference spaces, the XR frame loop and poses, input sources (controllers, hands, gaze-and-pinch), optional features like hit testing and anchors, which devices and browsers support what in 2026, and how to develop without a headset.
---

**WebXR** lets a web page take over a VR headset or place 3D content into the real world through a phone or a headset's cameras, from a link: no app store, no install, no update. Teams use it for product try-outs in AR, VR training, architecture walkthroughs, museum and education experiences, collaborative design reviews, games, and robotics teleoperation. This module teaches it end to end, and every example runs in an **emulated Meta Quest 3** inside this page, so no headset is needed.

:::def WebXR Device API
The browser API (`navigator.xr`) for immersive experiences. It finds XR hardware, starts **sessions**, reports where the user's head and hands are (**poses**) every frame, gives you the views to render (one per eye), and reports input from controllers and hands. It does **not** render anything itself: three.js does that.
:::

:::def VR, AR, MR, XR
**Virtual reality** replaces the world with a rendered one. **Augmented reality** adds rendered objects to the real world (phone camera view or headset **passthrough**). **Mixed reality** is AR where virtual objects understand and interact with the room (sit on tables, hide behind walls). **XR** ("extended reality") is the umbrella term.
:::

## Session modes

A page asks for one of three modes:

| Mode | What the user sees | Typical device |
|---|---|---|
| `inline` | 3D in a normal page element (no headset needed) | any browser; "magic window" with device orientation |
| `immersive-vr` | your scene fills the headset, real world hidden | Quest, Vision Pro, Galaxy XR, PC VR, Pico |
| `immersive-ar` | your content over the real world | Android phones (ARCore), Quest passthrough, Galaxy XR / Android XR |

Immersive sessions can only start from a **user action** (a click), only on **secure origins** (HTTPS, or localhost during development), and the browser may show a permission prompt.

## Detecting support

```js run title="What does this browser support? (console)" level=easy
// Feature detection — the first thing every WebXR app does
if (!("xr" in navigator)) {
  console.log("navigator.xr not available: no WebXR in this browser (e.g. iPhone Safari).");
} else {
  for (const mode of ["inline", "immersive-vr", "immersive-ar"]) {
    const ok = await navigator.xr.isSessionSupported(mode).catch(() => false);
    console.log(mode.padEnd(13), ok ? "✓ supported" : "✕ not supported");
  }
  console.log("Desktop browsers usually report immersive modes as unsupported unless a headset is connected.");
}
```

Run it on a laptop and you'll see "not supported" for the immersive modes; on a Quest's browser, both are supported. Real apps hide or disable the "Enter VR/AR" buttons based on this, and offer a non-XR fallback (orbit controls, a 360° photo, a video).

## Reference spaces: where is "here"?

Poses are always relative to a **reference space**, a coordinate system the device keeps stable:

| Reference space | Origin | Use |
|---|---|---|
| `viewer` | the user's head (moves with it) | head-locked UI, hit testing from where you look |
| `local` | where the head was when the session started | seated experiences |
| `local-floor` | same, but **y = 0 is the floor** | standing experiences (the most common) |
| `bounded-floor` | floor origin + the guardian/play-area boundary | room-scale apps that must stay inside a safe area |
| `unbounded` | large-scale tracking that can drift-correct | walking around a building in AR |

With `local-floor`, a box at `y = 1.0` floats at waist height and a ground plane at `y = 0` is the real floor. This is why the **1 unit = 1 metre** convention you've used since Module 1 matters so much here.

## The XR frame loop

In a VR session the browser drives rendering at the **headset's refresh rate** (72, 90, 120 Hz), not the monitor's. Each frame:

:::flow One WebXR frame
Headset predicts pose | where your head will be when the frame is shown
XRFrame delivered | via the session's requestAnimationFrame
Read poses | getViewerPose(refSpace) → one view per eye (projection + transform)
Render | each eye's view into its half of the framebuffer
Input | controller/hand poses, button states, select/squeeze events
:::

That's why three.js uses `renderer.setAnimationLoop()` instead of `requestAnimationFrame`: when a session starts, three.js switches the loop to the session's frame callback and renders the scene **twice** (once per eye, or with multiview in a single pass) using cameras it builds from the poses. You keep writing the same scene code.

## Input sources

| Input | How it works | Events / data |
|---|---|---|
| **Controllers** (Quest Touch, Pico, Index) | tracked ray + grip pose, buttons, thumbstick, haptics | `select` (trigger), `squeeze` (grip), `gamepad` buttons/axes |
| **Hands** | 25 tracked joints per hand | pinch → `select`; joint poses for gestures and direct touch |
| **Transient pointer** (Vision Pro gaze-and-pinch) | look at something, pinch: a pointer exists only during the pinch | `select` events with a target ray along your gaze |
| **Screen input** (phone AR) | tap on the screen | `select` with a ray from the tap |
| **Gaze** | head direction, dwell to select | for devices without controllers |

`@react-three/xr` turns all of these into the **same R3F pointer events** you already know (`onClick`, `onPointerOver`…), which is the single biggest productivity win of the library.

## Optional features

Sessions request extra capabilities as **required** or **optional** features:

| Feature string | Gives you | Where |
|---|---|---|
| `local-floor`, `bounded-floor` | floor-relative tracking, play area | headsets |
| `hand-tracking` | articulated hand joints | Quest, Vision Pro, Android XR |
| `hit-test` | rays against real-world surfaces | Android AR, Quest |
| `anchors` | real-world positions that stay put as tracking improves | Android AR, Quest |
| `plane-detection`, `mesh-detection` | detected floors, walls, tables, room mesh | Quest, Android XR |
| `dom-overlay` | HTML UI on top of phone AR | Android Chrome |
| `depth-sensing` | real-world depth for occlusion | Quest 3, Android |
| `light-estimation` | real lighting direction and colour | Android Chrome |
| `layers` | compositor layers for crisp text and video | Quest, others |

`@react-three/xr`'s `createXRStore()` requests the common ones as optional by default, so they're used when available and ignored otherwise.

## Devices and browsers (late 2026)

| Platform | Browser | VR | AR | Notes |
|---|---|---|---|---|
| Meta Quest 2/3/3S/Pro | Meta Quest Browser (Chromium) | ✅ | ✅ passthrough | the most complete WebXR: hands, planes, meshes, anchors, depth, layers |
| Apple Vision Pro | Safari (visionOS 2+) | ✅ | experimental flag | gaze-and-pinch via **transient-pointer**; hand tracking available |
| Samsung Galaxy XR / Android XR | Chrome | ✅ | ✅ | full WebXR, Chrome bookmarks synced |
| Android phones (ARCore) | Chrome | (Cardboard-style) | ✅ | hit test, anchors, DOM overlay, light estimation |
| iPhone / iPad | Safari | ❌ | ❌ WebXR | use **AR Quick Look** with USDZ (`<model-viewer>`) as a fallback |
| PC VR (SteamVR, Windows MR) | Chrome / Edge | ✅ | — | via OpenXR |
| Pico, HTC Vive XR Elite | built-in / Wolvic | ✅ | varies | |

:::warn iPhone has no WebXR
A large share of mobile traffic is iOS, where Safari doesn't support WebXR. For "view in your room" product features, pair WebXR (Android, headsets) with **AR Quick Look** on iOS: `<model-viewer ar ar-modes="webxr scene-viewer quick-look">` handles all three with one tag and a `.glb` + `.usdz` pair. The Applications module covers this in the e-commerce lesson.
:::

## Developing without a headset

| Tool | What it is |
|---|---|
| **IWER** (Immersive Web Emulation Runtime, by Meta) | a JavaScript WebXR runtime that emulates Quest devices, with a control panel (DevUI) to move the headset, controllers and hands, and synthetic rooms for AR. Used by every example on this site |
| `@react-three/xr` emulator | IWER, injected automatically by `createXRStore()` on `localhost` (or when `emulate: { inject: true }`) |
| Immersive Web Emulator | a browser extension version of the same idea |
| Apple visionOS Simulator | Xcode's simulator, including WebXR in Safari |
| Remote debugging | `chrome://inspect` on a PC with the Quest connected by USB (developer mode), Safari Web Inspector for Vision Pro |
| Your LAN | `vite --host` with HTTPS (`@vitejs/plugin-basic-ssl`), then open `https://<your-ip>:5173` in the headset browser |

:::note An emulator caveat in 2026
Recent IWER versions skip installing themselves when the browser already exposes `navigator.xr`, which desktop Chrome always does. If the built-in emulator of `@react-three/xr` doesn't appear in your project, install IWER yourself with `installRuntime({ forceInstall: true })` (shown in the next lesson). This site works around it automatically when no headset is present.
:::

## Comfort and safety basics

People get **motion sick** when what they see moves differently from what their inner ear feels. Rules you'll apply throughout this module:

- Hold the **frame rate** (dropped frames are worse in VR than anywhere else).
- **Never move the camera** without the user causing it; no camera shake, no forced cut-scenes in VR.
- Prefer **teleport** to smooth movement; offer **snap turning**; keep a stable horizon.
- Respect the **play area**; don't make people walk backwards into walls.
- Keep UI at comfortable distances (about 1–3 m), avoid text that's too small, and avoid flashing content.

## Check yourself

```quiz
? What does the WebXR Device API render for you?
- The 3D scene
+ Nothing — it provides poses, views and input; three.js renders
- Only the controllers
> WebXR handles devices and timing; rendering is your library's job.

? Which reference space puts y = 0 on the real floor?
+ local-floor
- viewer
- local
> Standing experiences use local-floor.

? Why can't an immersive session start on page load?
+ It requires a user gesture (and a secure origin)
- Headsets boot slowly
- three.js forbids it
> Browsers protect users from surprise immersive takeovers.

? How do Vision Pro users click things in WebXR?
+ Gaze and pinch, delivered as transient-pointer select events
- Only with controllers
- They can't interact
> The pointer exists only during the pinch.

? What should an iPhone user get for "view in your room"?
+ AR Quick Look with a USDZ file (e.g. via <model-viewer>)
- WebXR immersive-ar
- Nothing
> iOS Safari doesn't support WebXR.
```

:::exercise Capability report
Extend the detection example to also report whether this page is a **secure context** (`window.isSecureContext`) and, if `immersive-vr` is supported, try requesting a session with `optionalFeatures: ["hand-tracking"]` only after a button click (create a `<button>`, request inside its click handler, log `session.enabledFeatures`, then `session.end()`).
:::

:::solution
```js run
console.log("secure context:", window.isSecureContext);
const btn = document.createElement("button");
btn.textContent = "Try immersive-vr";
btn.style.cssText = "position:absolute;top:10px;left:10px";
document.body.appendChild(btn);
btn.onclick = async () => {
  if (!navigator.xr || !(await navigator.xr.isSessionSupported("immersive-vr"))) {
    console.log("immersive-vr not supported here (try the next lesson's emulator).");
    return;
  }
  const session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] });
  console.log("enabled features:", session.enabledFeatures ?? "(not reported by this browser)");
  await session.end();
};
```
:::

:::keypoints
- WebXR (`navigator.xr`) = sessions, poses, views and input; **three.js renders**.
- Modes: `inline`, `immersive-vr`, `immersive-ar`; immersive needs HTTPS and a click.
- Reference spaces (`local-floor` for standing) anchor coordinates in metres to the real world.
- Inputs: controllers, hands, transient pointers (Vision Pro), screen taps; optional features add hit tests, anchors, planes, layers.
- Support: Quest, Vision Pro, Android XR and Android phones yes; **iPhone no** (use Quick Look).
- Develop with emulators (IWER), test on devices over HTTPS, and design for comfort.
:::
