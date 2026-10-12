---
title: "@react-three/xr — VR & AR in React"
level: advanced
time: 40
summary: The XR store, the <XR> component and Enter VR/AR buttons, how existing R3F scenes become XR with almost no changes, the user's origin, reacting to session mode (VR vs. AR vs. desktop), transparent backgrounds for AR, reading controller buttons and thumbsticks, and the HTTPS dev setup for testing on a headset.
---

`@react-three/xr` (pmndrs) is to WebXR what R3F is to three.js: everything from the previous lesson (sessions, controllers, models, rays, hands, events) becomes a store and a component, and **the same pointer events** you use on desktop work with controllers, hands, Vision Pro gaze-and-pinch and phone taps. One codebase serves desktop, mobile and headsets.

:::syntax
```jsx
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";

const store = createXRStore();                  // 1. one store per app (session, inputs, options)

export function App() {
  return (
    <>
      <button onClick={() => store.enterVR()}>Enter VR</button>   {/* 2. enter from a click */}
      <button onClick={() => store.enterAR()}>Enter AR</button>
      <Canvas>
        <XR store={store}>                        {/* 3. wrap the scene */}
          {/* …your normal R3F scene… */}
        </XR>
      </Canvas>
    </>
  );
}
```
:::

`createXRStore()` gives you, with no extra code: controller models, hand models (with hand tracking), ray and grab pointers, teleport support when enabled, the Vision Pro transient pointer, screen-tap input on phones, and optional features (hit test, anchors, planes, meshes, layers, DOM overlay) requested when available. On `localhost` it also injects the **emulator** automatically; the examples here force it with `emulate: { inject: true }` because they don't run on localhost.

## Your first XR scene

Press **Enter VR**: the emulated headset starts with controllers. Point a controller at a block (use the controller panel's position/rotation fields or drag its gizmo) and **Press** the trigger, exactly like clicking with a mouse. Leave VR (the exit icon in the emulator toolbar) and the same blocks still react to your mouse.

```jsx run title="One scene: desktop, VR and AR" level=intermediate height=560
import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { XR, createXRStore, useXR } from "@react-three/xr";

// emulate a Quest 3 everywhere (in your own project, the default injects only on localhost)
const store = createXRStore({ emulate: { inject: true } });

function Block({ position, color }) {
  const [on, setOn] = useState(false);
  const [hover, setHover] = useState(false);
  return (
    <mesh position={position} scale={hover ? 1.15 : 1}
      onClick={() => setOn(!on)} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
      <boxGeometry args={[0.2, 0.2, 0.2]} />
      <meshStandardMaterial color={on ? "#facc15" : color} emissive={hover ? "#ffffff" : "#000000"} emissiveIntensity={0.2} />
    </mesh>
  );
}

function Environment() {
  const mode = useXR((s) => s.mode);                    // null | "immersive-vr" | "immersive-ar"
  return (
    <>
      {mode !== "immersive-ar" && <color attach="background" args={["#0f172a"]} />}   {/* AR needs a transparent background */}
      {mode !== "immersive-ar" && <gridHelper args={[10, 20, "#475569", "#334155"]} />}
    </>
  );
}

export default function App() {
  const [mode, setMode] = useState(null);
  useEffect(() => store.subscribe((s) => setMode(s.mode)), []);   // mirror the mode into React state for the HTML UI (returns unsubscribe)
  return (
    <>
      <div className="overlay"><span>Session: <b>{mode ?? "desktop"}</b></span></div>
      <div className="xr-buttons">
        <button className="primary" onClick={() => store.enterVR()}>Enter VR</button>
        <button onClick={() => store.enterAR()}>Enter AR</button>
      </div>
      <Canvas camera={{ position: [0, 1.5, 1.2], fov: 60 }}>
        <XR store={store}>
          <Environment />
          <ambientLight intensity={0.6} />
          <directionalLight position={[1, 3, 2]} intensity={2} />
          {/* a row of blocks at chest height, 60 cm in front of the user */}
          {["#ef4444", "#f97316", "#22c55e", "#3b82f6", "#a855f7"].map((c, i) => (
            <Block key={c} position={[(i - 2) * 0.28, 1.2, -0.6]} color={c} />
          ))}
          <OrbitControls target={[0, 1.2, -0.6]} />          {/* used on desktop; inactive in XR */}
        </XR>
      </Canvas>
    </>
  );
}
```

Things to notice:

- **No XR-specific interaction code.** `onClick`, `onPointerOver` and `onPointerOut` work with the controller ray, the grab pointer (touching an object with the controller), hands and the mouse.
- **AR needs a transparent background.** In `immersive-ar` the camera image (or passthrough) is behind your canvas; a solid `scene.background` would hide the real world. That's why `Environment` drops the background and the floor grid in AR.
- **Sizes are real.** The blocks are 20 cm cubes at 1.2 m height: comfortable to reach in a headset.

## The user's origin: XROrigin

In XR the headset controls the camera. To decide **where the user stands** in your world, place an `<XROrigin>`: the user's floor position (`local-floor` origin) becomes that point, and moving or rotating the origin moves the user (that's how teleporting and locomotion work, next lessons):

```jsx
<XROrigin position={[0, 0, 3]} rotation-y={Math.PI} />   {/* start 3 m back, facing the other way */}
```

Without an `XROrigin`, the user starts at the world origin `(0, 0, 0)` on the floor.

## Session-aware rendering

| Tool | Use |
|---|---|
| `useXR((s) => s.mode)` | read the mode (`null`, `"immersive-vr"`, `"immersive-ar"`) |
| `useXR((s) => s.session)` | the raw `XRSession` |
| `<IfInSessionMode allow="immersive-ar">…</IfInSessionMode>` | mount children only in some modes |
| `<IfInSessionMode deny={["immersive-ar", "immersive-vr"]}>` | desktop-only content (e.g. OrbitControls) |
| `<ShowIfInSessionMode …>` | keep mounted, toggle visibility (no remount cost) |
| `useXRSessionModeSupported("immersive-ar")` | decide whether to show an "Enter AR" button |
| `store.onSessionEnd(fn)` | clean up when the user exits (or takes the headset off) |

## Reading buttons and thumbsticks

For actions beyond pointing (thumbstick to rotate a model, A button to change colour, trigger pressure for a throttle), read the controller's **gamepad state**. `useXRInputSourceState("controller", "right")` returns the right controller's state; its `gamepad` object maps component ids to `{ state, button, xAxis, yAxis }`:

```jsx run title="Thumbstick rotates, trigger scales, A button recolours" level=advanced height=560
import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { XR, createXRStore, useXRInputSourceState, useXRControllerButtonEvent, XROrigin } from "@react-three/xr";

const store = createXRStore({ emulate: { inject: true } });
const COLORS = ["#10b981", "#f59e0b", "#6366f1", "#ef4444"];

function Model() {
  const ref = useRef();
  const right = useXRInputSourceState("controller", "right");
  const [colorIndex, setColorIndex] = useState(0);

  // discrete button → React state (only changes on press)
  useXRControllerButtonEvent(right, "a-button", (state) => {
    if (state === "pressed") setColorIndex((i) => (i + 1) % COLORS.length);
  });

  // continuous inputs → mutate in useFrame
  useFrame((_, dt) => {
    const stick = right?.gamepad["xr-standard-thumbstick"];
    const trigger = right?.gamepad["xr-standard-trigger"];
    if (stick?.xAxis) ref.current.rotation.y += stick.xAxis * dt * 2;         // left/right = spin
    if (stick?.yAxis) ref.current.rotation.x += stick.yAxis * dt * 2;         // up/down = tilt
    const s = 1 + (trigger?.button ?? 0);                                     // analog 0…1
    ref.current.scale.setScalar(s);
  });

  return (
    <mesh ref={ref} position={[0, 1.3, -0.8]}>
      <torusKnotGeometry args={[0.12, 0.04, 128, 16]} />
      <meshStandardMaterial color={COLORS[colorIndex]} roughness={0.3} />
    </mesh>
  );
}

export default function App() {
  return (
    <>
      <div className="overlay"><span>Enter VR, then use the <b>right controller</b> panel: Stick to rotate, Trig (hold) to scale, <b>A</b> to recolour.</span></div>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>
      <Canvas camera={{ position: [0, 1.5, 0.6] }}>
        <XR store={store}>
          <color attach="background" args={["#1e1b4b"]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[1, 3, 2]} intensity={2} />
          <XROrigin position={[0, 0, 0]} />
          <Model />
          <gridHelper args={[6, 12]} />
        </XR>
      </Canvas>
    </>
  );
}
```

| Component id | Quest Touch | Typical use |
|---|---|---|
| `xr-standard-trigger` | index trigger (analog) | select, shoot, throttle |
| `xr-standard-squeeze` | grip (analog) | grab |
| `xr-standard-thumbstick` | stick (`xAxis`, `yAxis`, press) | locomotion, rotate, menus |
| `a-button`, `b-button` / `x-button`, `y-button` | face buttons | actions, menus, undo |
| `thumbrest` | touch sensor | "resting" detection |

Same rule as on desktop: **discrete events into React state, continuous values read in `useFrame`**.

## Testing on a real headset

WebXR needs HTTPS (except on localhost, and the headset isn't localhost). With Vite:

```bash
npm install -D @vitejs/plugin-basic-ssl
```

```js
// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({ plugins: [react(), basicSsl()] });
```

```bash
npx vite --host        # prints e.g. https://192.168.1.42:5173 — open that URL in the Quest browser
```

Accept the self-signed certificate warning once. For debugging, connect the Quest by USB (developer mode on) and open `chrome://inspect` on your computer to get DevTools for the headset tab. Vision Pro: Safari's Develop menu on a Mac. Tunnelling tools (ngrok, Cloudflare Tunnel) give you a real HTTPS URL to share with testers.

## Check yourself

```quiz
? What three steps turn an R3F scene into an XR app?
+ createXRStore(), a button calling store.enterVR()/enterAR(), and wrapping the scene in <XR store={store}>
- Install a VR plugin, set vr={true} on Canvas, reload
- Replace Canvas with XRCanvas
> The rest of the scene stays the same.

? Why remove the scene background in immersive-ar?
+ The real world (camera/passthrough) is behind the canvas; a solid background would hide it
- AR doesn't support colours
- To save performance only
> AR composites your render over reality.

? How does a VR controller click a mesh with an onClick handler?
+ @react-three/xr turns controller rays, grabs, hands and taps into the same pointer events
- You must add a separate onXRSelect prop
- It can't; XR needs custom code
> One interaction model for every input.

? Where should a thumbstick's xAxis be read?
+ In useFrame, every frame (continuous value)
- In useState
- In an onClick handler
> Continuous input = per-frame read; discrete buttons = events.

? Why do you need HTTPS to test on a headset?
+ WebXR only works in secure contexts, and the headset isn't localhost
- Headsets block HTTP entirely
- three.js requires it
> Use basic SSL with vite --host or a tunnel.
```

:::exercise Desktop-only controls
In the first example, show `OrbitControls` only on desktop using `<IfInSessionMode deny={["immersive-vr", "immersive-ar"]}>`, and show a floating "You are in VR" text (drei `<Text>`) only in VR using `<IfInSessionMode allow="immersive-vr">`.
:::

:::solution
```jsx run height=560
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { XR, createXRStore, IfInSessionMode } from "@react-three/xr";

const store = createXRStore({ emulate: { inject: true } });

export default function App() {
  return (
    <>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>
      <Canvas camera={{ position: [0, 1.5, 1.2] }}>
        <XR store={store}>
          <color attach="background" args={["#0f172a"]} />
          <ambientLight intensity={0.8} />
          <mesh position={[0, 1.2, -0.6]}><boxGeometry args={[0.2, 0.2, 0.2]} /><meshStandardMaterial color="#22c55e" /></mesh>
          <IfInSessionMode allow="immersive-vr">
            <Text position={[0, 1.5, -0.8]} fontSize={0.06} color="white">You are in VR</Text>
          </IfInSessionMode>
          <IfInSessionMode deny={["immersive-vr", "immersive-ar"]}>
            <OrbitControls target={[0, 1.2, -0.6]} />
          </IfInSessionMode>
        </XR>
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- `createXRStore()` + `store.enterVR()/enterAR()` + `<XR store>`: your existing R3F scene becomes XR.
- The same **pointer events** work for mouse, controllers, hands, gaze-and-pinch and taps.
- `<XROrigin>` places the user; `useXR`, `IfInSessionMode` and `ShowIfInSessionMode` adapt the scene per mode.
- AR: transparent background, no fake floor; sizes in real metres.
- Controller input: `useXRInputSourceState` + `gamepad[...]` in `useFrame`; `useXRControllerButtonEvent` for presses.
- Test on headsets over HTTPS (`basicSsl` + `vite --host`), debug with `chrome://inspect`.
:::
