---
title: XR Performance, Comfort & Shipping
level: advanced
time: 35
summary: Why XR is the hardest performance target (two eyes, 72–120 Hz, mobile GPUs), the budgets that keep standalone headsets smooth, foveated rendering, frame-buffer scaling and frame rates, compositor layers for crisp text and video, an in-headset performance HUD, comfort and safety checklists, accessibility, and getting a WebXR app into users' hands.
---

A frame that's late on a monitor is a stutter. A frame that's late in a headset is a lurch of the world in front of your eyes, and repeated, it makes people sick. Standalone headsets like the Quest have phone-class GPUs, render **two views**, at **72–120 Hz**, at resolutions higher than a 4K monitor. XR is the most demanding target three.js has, and it rewards everything you learned in the performance lessons.

## The budget

| | Desktop web | Standalone VR (Quest 3) |
|---|---|---|
| frame time | 16.7 ms (60 Hz) | **13.9 ms (72 Hz) – 8.3 ms (120 Hz)** |
| views per frame | 1 | **2** (multiview renders both in one pass where supported) |
| GPU | discrete or integrated laptop | mobile (Snapdragon XR) |
| draw calls (rule of thumb) | hundreds+ | **< 100–200** |
| triangles | millions | **< 500k–1M** visible |
| post-processing | fine in moderation | mostly avoid |
| real-time shadows | one light OK | bake, blob or contact shadows instead |

## The levers @react-three/xr exposes

```jsx
const store = createXRStore({
  frameRate: "high",            // ask the headset for its highest refresh rate ("mid", "low" or a number also work)
  foveation: 1,                 // 0…1: render the periphery at lower resolution (big savings, barely visible)
  frameBufferScaling: 0.9,      // < 1 renders fewer pixels than native; > 1 supersamples (sharper, slower)
});
// change at runtime, e.g. from a PerformanceMonitor:
store.setFrameRate("mid");
```

:::def Foveated rendering
Rendering the edges of each eye's view at lower resolution, because lenses blur the periphery anyway and the eye sees detail only in the centre. **Fixed** foveation always lowers the edges; **eye-tracked** (dynamic) foveation follows the user's gaze on headsets with eye tracking. It often saves 20–40% of GPU time.
:::

## An in-headset performance HUD

Browser DevTools aren't visible inside the headset. A small world-locked or wrist panel that shows frame time is invaluable while developing:

```jsx run title="Frame-time HUD that also works inside VR" level=advanced height=560
import { useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { XR, createXRStore, IfInSessionMode } from "@react-three/xr";

const store = createXRStore({ emulate: { inject: true }, foveation: 1, frameRate: "high" });

function PerfHud() {
  const text = useRef(), gl = useThree((s) => s.gl);
  const acc = useRef({ t: 0, frames: 0, worst: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.t += dt; a.frames++; a.worst = Math.max(a.worst, dt);
    if (a.t >= 0.5) {                                       // update twice a second (text changes are not free)
      const avg = (a.t / a.frames) * 1000;
      const { calls, triangles } = gl.info.render;
      text.current.text = `${(1000 / avg).toFixed(0)} fps   avg ${avg.toFixed(1)} ms   worst ${(a.worst * 1000).toFixed(1)} ms\n${calls} draw calls   ${(triangles / 1000).toFixed(0)}k tris   ${gl.xr.isPresenting ? "XR" : "desktop"}`;
      text.current.color = avg > 13.9 ? "#f87171" : "#4ade80";   // red when over the 72 Hz budget
      a.t = 0; a.frames = 0; a.worst = 0;
    }
  });
  return (
    <group position={[0, 2.1, -1.4]}>
      <mesh><planeGeometry args={[1.25, 0.24]} /><meshBasicMaterial color="#020617" transparent opacity={0.8} /></mesh>
      <Text ref={text} position-z={0.01} fontSize={0.045} color="#4ade80" anchorX="center" textAlign="center">…</Text>
    </group>
  );
}

function Load({ count }) {
  return Array.from({ length: count }, (_, i) => (
    <mesh key={i} position={[(i % 10 - 4.5) * 0.35, 0.6 + Math.floor(i / 10) * 0.35, -2]}>
      <torusKnotGeometry args={[0.1, 0.035, 96, 12]} />
      <meshStandardMaterial color={`hsl(${i * 7}, 60%, 55%)`} />
    </mesh>
  ));
}

export default function App() {
  const [count, setCount] = useState(20);
  return (
    <>
      <div className="overlay">
        <label>objects (draw calls) <input type="range" min="10" max="200" step="10" value={count} onChange={(e) => setCount(+e.target.value)} /></label>
        <span className="muted">{count} separate meshes; each is a draw call, twice in VR</span>
      </div>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>
      <Canvas camera={{ position: [0, 1.6, 1.5] }}>
        <XR store={store}>
          <color attach="background" args={["#0f172a"]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[1, 3, 2]} intensity={1.5} />
          <Load count={count} />
          <PerfHud />
          <IfInSessionMode deny={["immersive-vr", "immersive-ar"]}><OrbitControls target={[0, 1.4, -1.5]} /></IfInSessionMode>
        </XR>
      </Canvas>
    </>
  );
}
```

Raise the object count and compare the draw calls on desktop and in VR. The fix, as always, is instancing: these 200 knots would be **one** draw call as an `<instancedMesh>` (Module 2).

## Compositor layers for crisp text and video

Normally everything you render is resampled by the headset's lens-distortion pass, which softens fine text. **WebXR layers** hand a texture directly to the compositor, which draws it at the display's full sharpness. Use them for reading-heavy panels and video:

```jsx
import { XRLayer } from "@react-three/xr";

<XRLayer position={[0, 1.5, -1]} scale={[1.6, 0.9, 1]} src={videoElement} />   // a sharp 16:9 video screen
```

`XRLayer` falls back to a normal textured mesh when layers aren't supported.

## XR performance checklist

:::flow From prototype to smooth XR
Measure in the headset | perf HUD + chrome://inspect Performance panel
Cut draw calls | instancing, merging, atlases, fewer materials
Simplify shading | MeshStandard at most; baked light; no transmission
Drop post-processing | or one very cheap pass
Foveation + scaling | foveation 1, frameBufferScaling 0.8–1.0
Stable frame rate | lower quality to hold 72/90 Hz rather than dip
:::

More: keep **textures** small and KTX2-compressed (memory is shared with the system); avoid many transparent overlapping surfaces (fill rate); use **LOD** for distant objects; avoid big JavaScript work per frame (garbage collection pauses show up as hitches); load assets **before** entering the session (a loading screen in VR is fine, a hitch is not).

## Comfort and safety checklist

- Hold the frame rate; prefer lowering quality to dropping frames.
- No camera movement the user didn't cause; teleport and snap turn by default.
- Keep the horizon level and the world stable; no camera shake.
- UI at comfortable distances; nothing important behind the user or far above/below.
- Warn before intense content; avoid flashing patterns (photosensitivity).
- Respect the play area; make it easy to recentre and to exit.
- Offer seated mode and height adjustment.
- Short sessions for training content; suggest breaks.

## Accessibility in XR

- Support **every input**: controllers, hands, gaze-and-pinch, and a non-XR mode with mouse and keyboard.
- Don't require **standing**, **two hands**, **crouching** or precise **reaching**; provide alternatives (one-handed mode, reach assist, seated mode).
- **Subtitles** for audio, placed comfortably (lazy-follow).
- High-contrast option and adjustable text size.
- Avoid colour-only signals (pair colour with shape or text).

## Shipping a WebXR app

| Step | Notes |
|---|---|
| host on HTTPS | any static host works; WebXR requires a secure context |
| progressive enhancement | everyone gets the 3D page; headsets and AR phones get the "Enter VR/AR" buttons (`useXRSessionModeSupported`) |
| link sharing | a URL opens straight in the headset browser: no store review, instant updates |
| discovery on Quest | add a **web app manifest** and publish it as a PWA; Meta lets PWAs appear in the Horizon Store, Android XR handles PWAs through Chrome |
| analytics | sessions entered, session length, frame-rate distribution, device types |
| testing | real devices (Quest at least), emulator for CI screenshots, visionOS simulator for gaze-and-pinch |

:::ai
WebXR is increasingly used as a **front end for AI systems**: a robot's perception output shown as a 3D overlay in AR, a VR environment for collecting human demonstrations to train robot policies, or an assistant you talk to while it highlights parts of a machine in your view. The same rules apply: stable frame rate first, then smart features.
:::

## Check yourself

```quiz
? Why is standalone VR harder to run smoothly than a desktop page?
+ Two views at 72–120 Hz on a mobile-class GPU at high resolution
- WebXR is slower than WebGL
- Headsets don't support instancing
> The budget is a fraction of a desktop's.

? What does foveated rendering do?
+ Renders the edges of the view at lower resolution, saving GPU time
- Tracks the controllers more precisely
- Increases the refresh rate
> The periphery is blurred by the lenses anyway.

? Why use XRLayer for a video screen?
+ The compositor draws it at full display sharpness, avoiding resampling blur
- It makes the video autoplay
- It's required for any video in VR
> Layers bypass the lens-distortion resample.

? A scene drops below 72 fps in VR. What's usually the first fix?
+ Reduce draw calls (instancing/merging) and simplify materials
- Add bloom to hide it
- Increase frameBufferScaling
> Draw calls and shading are the usual culprits.

? How can a WebXR app appear in the Quest store?
+ As a PWA with a web app manifest
- It can't; only native apps are allowed
- By uploading the HTML file
> Meta supports PWAs in its store.
```

:::keypoints
- XR budget: ~11–14 ms per frame, **two views**, mobile GPU: < 100–200 draw calls, simple shading, minimal post-processing.
- Use `frameRate`, `foveation` and `frameBufferScaling` on the XR store; adapt quality to **hold** the frame rate.
- Build an **in-headset HUD**; profile with `chrome://inspect` on the device.
- `XRLayer` for crisp text and video; load assets before entering.
- Comfort, safety and accessibility are requirements, not extras.
- Ship over HTTPS with progressive enhancement; package as a PWA for store discovery.
:::
