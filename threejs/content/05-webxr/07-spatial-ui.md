---
title: Spatial UI — Menus, Panels & Text in XR
level: advanced
time: 35
summary: Designing interfaces that live in 3D space — world-locked, body-locked and head-locked placement, comfortable distances and sizes measured in angles, a lazy-follow menu built with @react-three/uikit, hand menus, readable text, and guidelines from Meta, Apple and Google for interfaces in headsets.
---

The moment a user puts on a headset, the HTML page disappears. Menus, settings, labels, tooltips and dialogs must exist **in the scene**, at a distance and size that are comfortable to read and reach. Spatial UI design has its own rules, learned the hard way by headset makers; this lesson condenses them and builds the common patterns with `@react-three/uikit`.

## Where UI lives

| Placement | Behaviour | Good for | Avoid for |
|---|---|---|---|
| **World-locked** | fixed in the room, like a sign on a wall | labels on machines, info boards, dashboards next to objects | anything the user needs everywhere |
| **Body-locked (lazy follow)** | stays in front of the user, catching up smoothly when they turn | main menus, settings, wizard steps | — (the most versatile choice) |
| **Hand-attached** | on the wrist or palm | quick tools, colour pickers, watch-style menus | long reading |
| **Head-locked** | rigidly glued to the view | tiny, brief notifications only | almost everything: it's uncomfortable and can cause eye strain |

:::tip Distances and sizes
Place readable panels **1–2 m** away (closer for things you touch: 0.4–0.7 m). Size text by **visual angle**, not pixels: about **1°** of view for body text, which is roughly 1.7 cm tall at 1 m. Keep content within about **±30°** of straight ahead horizontally and slightly below eye level vertically, so users don't strain their necks.
:::

## A lazy-follow menu with uikit

The panel stays where it is while the user looks around a little, then glides back in front of them once they've turned far enough. It always faces the user. This is the pattern most headset system menus use:

```jsx run title="Body-locked lazy-follow menu (uikit)" level=advanced height=560
import { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { XR, createXRStore, IfInSessionMode } from "@react-three/xr";
import { Container, Text } from "@react-three/uikit";
import { easing } from "maath";

const store = createXRStore({ emulate: { inject: true } });
const forward = new THREE.Vector3(), goal = new THREE.Vector3(), head = new THREE.Vector3();

function LazyFollow({ distance = 1.2, height = -0.15, threshold = 0.6, children }) {
  const ref = useRef();
  const following = useRef(true);
  useFrame(({ camera }, dt) => {
    camera.getWorldPosition(head);
    camera.getWorldDirection(forward).setY(0).normalize();          // ignore looking up/down
    goal.copy(head).addScaledVector(forward, distance);
    goal.y = head.y + height;                                      // slightly below eye level
    // only start moving when the panel is far enough out of view, then catch up smoothly
    if (ref.current.position.distanceTo(goal) > threshold) following.current = true;
    if (following.current) {
      easing.damp3(ref.current.position, goal, 0.4, dt);
      if (ref.current.position.distanceTo(goal) < 0.02) following.current = false;
    }
    ref.current.lookAt(head.x, ref.current.position.y, head.z);    // face the user, stay upright
  });
  return <group ref={ref}>{children}</group>;
}

function Menu({ setLights }) {
  const [tab, setTab] = useState("Scene");
  const button = (label, active, onClick) => (
    <Container key={label} paddingX={20} paddingY={10} borderRadius={12} backgroundColor={active ? "#10b981" : "#1e293b"}
      hover={{ backgroundColor: active ? "#10b981" : "#334155" }} cursor="pointer" onClick={onClick}>
      <Text fontSize={18} color="white">{label}</Text>
    </Container>
  );
  return (
    <Container pixelSize={0.0015} backgroundColor="rgba(15, 23, 42, 0.9)" borderRadius={24} padding={24} gap={16} flexDirection="column" width={460}>
      <Text fontSize={26} fontWeight="bold" color="white">Showroom</Text>
      <Container flexDirection="row" gap={8}>{["Scene", "Lights", "About"].map((t) => button(t, t === tab, () => setTab(t)))}</Container>
      {tab === "Scene" && <Text fontSize={18} color="#cbd5e1">Turn your head: the menu stays put, then glides back in front of you.</Text>}
      {tab === "Lights" && (
        <Container flexDirection="row" gap={8}>{["Day", "Evening", "Night"].map((m) => button(m, false, () => setLights(m)))}</Container>
      )}
      {tab === "About" && <Text fontSize={18} color="#cbd5e1">Built with @react-three/uikit: flexbox layout, real text, works with mouse, controllers and hands.</Text>}
    </Container>
  );
}

const LIGHTS = { Day: ["#e0f2fe", 1.2], Evening: ["#fed7aa", 0.7], Night: ["#1e1b4b", 0.25] };

export default function App() {
  const [lights, setLights] = useState("Day");
  const [bg, intensity] = LIGHTS[lights];
  return (
    <>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>
      <Canvas camera={{ position: [0, 1.6, 0.01], fov: 70 }}>
        <XR store={store}>
          <color attach="background" args={[bg]} />
          <ambientLight intensity={intensity} />
          <directionalLight position={[2, 4, 1]} intensity={intensity * 2} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <mesh key={i} position={[Math.sin(a) * 3, 0.5, Math.cos(a) * 3]}><boxGeometry args={[0.6, 1, 0.6]} /><meshStandardMaterial color={`hsl(${i * 30}, 60%, 55%)`} /></mesh>;
          })}
          <gridHelper args={[10, 20]} />
          <LazyFollow><Menu setLights={setLights} /></LazyFollow>
          <IfInSessionMode deny={["immersive-vr", "immersive-ar"]}><OrbitControls target={[0, 1.6, -0.1]} /></IfInSessionMode>
        </XR>
      </Canvas>
    </>
  );
}
```

Drag the view on desktop (or turn your head in VR): the menu waits, then catches up. `pixelSize={0.0015}` sets how many metres one uikit "pixel" is, so the 460-px-wide panel is about 70 cm wide, readable at 1.2 m.

## Hand menus

A menu attached to the non-dominant hand (palm up to show it) is fast and always available. With `@react-three/xr` you can render content in a hand's or controller's space by customising its component in the store:

```jsx
const store = createXRStore({
  controller: {
    left: () => (
      <>
        <DefaultXRController />                        {/* keep the normal model and pointers */}
        <group position={[0, 0.06, 0.05]} rotation-x={-Math.PI / 3}>
          <WristMenu />                                {/* a small uikit panel that rides on the controller */}
        </group>
      </>
    ),
  },
});
```

## Text that's comfortable to read

- Use **SDF text** (`<Text>` from drei, uikit's text): crisp at any distance. Avoid CanvasTexture text for long reading in VR.
- **Contrast**: light text on a dark, mostly opaque panel. Pure white on pure black can "glow" in some lenses; slightly grey text on dark slate is easier.
- **Size by angle** (≥ ~1° for body text), short lines (≈ 50 characters), generous spacing.
- **Keep text still** and face the user; text that wobbles with head motion is tiring.
- Prefer **icons + short labels**; nobody wants to read essays in a headset.
- **Check your glyphs**: SDF fonts contain a fixed set of characters. uikit's built-in font covers basic Latin, so symbols like "·", "€" or non-Latin scripts need a custom font (uikit can generate one from a TTF; see its custom fonts guide), otherwise the console warns about missing glyphs and the characters vanish.

## Platform guidelines worth reading

| Source | Highlights |
|---|---|
| **Meta Horizon OS design guidelines** | button sizes, panel distances, hand interaction, locomotion comfort |
| **Apple visionOS Human Interface Guidelines** | glass-material panels, eye-based hover, ornaments, depth and spacing |
| **Android XR design guidelines** | spatial panels, orbiters, transitions between 2D and 3D |
| **uikit kits** | `@react-three/uikit-default` (shadcn style) and `@react-three/uikit-horizon` (Meta Horizon style) give you ready-made, consistent components |

:::ai
Voice is the natural complement to spatial UI: typing in VR is slow. Combining speech-to-text with an LLM that maps requests to your app's actions ("show me the night lighting", "hide the left wall") avoids deep menus entirely. The Project Lab's AI scene builder shows the action-mapping half of this pattern.
:::

## Check yourself

```quiz
? Which placement should you avoid for most UI?
+ Head-locked (rigidly attached to the view)
- World-locked
- Lazy-follow
> It's uncomfortable and fights natural eye movement.

? About how far away should a readable menu panel be?
+ 1–2 metres
- 10 cm
- 5 metres
> Close enough to read, far enough to focus comfortably.

? How should text size be specified for XR?
+ By visual angle (about 1° for body text), not pixels
- In CSS pixels
- As large as possible
> Distance changes apparent size; angles capture what the eye sees.

? What does uikit's pixelSize control?
+ How many metres one uikit layout pixel occupies in the scene
- Texture resolution
- The canvas DPR
> It scales the whole layout into world units.

? What does a lazy-follow panel do?
+ Stays put for small head movements, then smoothly returns in front of the user
- Stays glued to the view
- Never moves
> It balances availability and comfort.
```

:::exercise Label a machine
World-lock a small uikit info card above one of the boxes in the menu example: name, status (OK/WARN) with a coloured dot, and a "Details" button that opens extra lines of text. Make the card face the user every frame (but only rotate around Y).
:::

:::solution
```jsx run height=520
import { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { XR, createXRStore } from "@react-three/xr";
import { Container, Text } from "@react-three/uikit";

const store = createXRStore({ emulate: { inject: true } });
const head = new THREE.Vector3();

function InfoCard({ position }) {
  const ref = useRef();
  const [open, setOpen] = useState(false);
  useFrame(({ camera }) => { camera.getWorldPosition(head); ref.current.lookAt(head.x, ref.current.position.y, head.z); });
  return (
    <group ref={ref} position={position}>
      <Container pixelSize={0.0012} backgroundColor="rgba(15, 23, 42, 0.92)" borderRadius={16} padding={16} gap={8} flexDirection="column" width={300}>
        <Container flexDirection="row" gap={8} alignItems="center">
          <Container width={12} height={12} borderRadius={6} backgroundColor="#22c55e" />
          <Text fontSize={20} color="white">Press 04 - OK</Text>
        </Container>
        <Container backgroundColor="#334155" borderRadius={10} padding={8} cursor="pointer" onClick={() => setOpen(!open)}>
          <Text fontSize={16} color="white">{open ? "Hide details" : "Details"}</Text>
        </Container>
        {open && <Text fontSize={15} color="#cbd5e1">Cycle time 12.4 s, 1,284 parts today, next service in 6 days</Text>}
      </Container>
    </group>
  );
}

export default function App() {
  return (
    <>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>
      <Canvas camera={{ position: [0.2, 1.45, 0.1] }}>
        <XR store={store}>
          <color attach="background" args={["#e2e8f0"]} />
          <ambientLight intensity={1} />
          <mesh position={[0, 0.5, -1]}><boxGeometry args={[0.8, 1, 0.8]} /><meshStandardMaterial color="#64748b" /></mesh>
          <InfoCard position={[0, 1.35, -1]} />
          <OrbitControls target={[0, 1.2, -1]} />
        </XR>
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- In XR, all UI lives in the scene: choose **world-locked**, **lazy-follow**, **hand-attached**; avoid head-locked.
- Panels at 1–2 m (touch targets 0.4–0.7 m), within ±30° of forward, slightly below eye level.
- Size text by **visual angle**; use SDF text, good contrast, short lines, still panels.
- `@react-three/uikit` gives flexbox panels with `pixelSize` scaling; it works with mouse, controllers and hands.
- Follow Meta, Apple and Android XR guidelines; use uikit kits for consistent components.
:::
