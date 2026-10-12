---
title: XR Interaction — Grabbing, Handles & Physical Controls
level: advanced
time: 40
summary: How pointers work in @react-three/xr (ray, grab, touch), making objects grabbable and constrained with @react-three/handle, building physical controls (buttons you poke, sliders, dials) that drive a machine, controlling which pointers an object reacts to, haptic feedback, and interaction design rules for headsets.
---

On a desktop, "interaction" means pointing and clicking. In XR people **reach out and grab**: pick up a part, pull a lever, turn a dial, poke a button with a fingertip. `@react-three/xr` gives every controller and hand several pointers, and `@react-three/handle` turns "grab and move" into one component that also works with a mouse, so you can build and test interactions on a laptop and they behave the same in a headset.

## The pointers you get by default

| Pointer | Comes from | Feels like |
|---|---|---|
| **ray** | controller or hand, pointing | a laser pointer: select things far away |
| **grab** | controller grip / hand pinch near an object | picking something up |
| **touch** | the index fingertip (hand tracking) | poking a button or a screen |
| **transient** | Vision Pro gaze-and-pinch | look + pinch |
| **screen** | phone tap in AR | tapping |

All of them produce R3F pointer events. You can restrict an object to some kinds with `pointerEventsType`, for example a UI panel that ignores grabs: `pointerEventsType={{ deny: "grab" }}`, or a lever that only reacts to grabs: `pointerEventsType={{ allow: "grab" }}`.

## Handles: grab, move, rotate, scale

:::def Handle (@react-three/handle)
A component that makes its children draggable by any pointer (mouse, touch, ray, grab, hand) and applies the motion to a **target**: itself by default, or another object via `targetRef`. Options constrain the motion: `translate`, `rotate` and `scale` can be disabled, limited to an axis, clamped to a range, or converted (`translate="as-rotate"` turns a drag into a rotation, like a door handle).
:::

```jsx run title="Grabbable objects and constrained handles (mouse or VR)" level=advanced height=560
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { XR, createXRStore, IfInSessionMode } from "@react-three/xr";
import { Handle } from "@react-three/handle";

const store = createXRStore({ emulate: { inject: true } });

export default function App() {
  return (
    <>
      <div className="overlay"><span>Drag with the mouse, or <b>Enter VR</b> and grab with a controller (Grip).</span></div>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>
      <Canvas camera={{ position: [0, 1.6, 1.1], fov: 55 }}>
        <XR store={store}>
          <color attach="background" args={["#e2e8f0"]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[1, 3, 2]} intensity={2} />
          <mesh position={[0, 0.85, -0.6]}><boxGeometry args={[1.4, 0.05, 0.7]} /><meshStandardMaterial color="#a8a29e" /></mesh>

          {/* free: move and rotate anywhere */}
          <Handle>
            <mesh position={[-0.45, 0.95, -0.55]}><boxGeometry args={[0.12, 0.12, 0.12]} /><meshStandardMaterial color="#3b82f6" /></mesh>
          </Handle>

          {/* slides only along x, between -0.15 and +0.45 m: a slider/drawer */}
          <Handle translate={{ x: [-0.15, 0.45], y: false, z: false }} rotate={false} scale={false}>
            <mesh position={[0, 0.93, -0.75]}><boxGeometry args={[0.1, 0.06, 0.06]} /><meshStandardMaterial color="#f59e0b" /></mesh>
          </Handle>
          <mesh position={[0.15, 0.905, -0.75]}><boxGeometry args={[0.7, 0.01, 0.02]} /><meshStandardMaterial color="#57534e" /></mesh>

          {/* stretch to scale uniformly between 0.5× and 2× */}
          <Handle translate="as-scale" rotate={false} scale={{ uniform: true, x: [0.5, 2], y: [0.5, 2], z: [0.5, 2] }}>
            <mesh position={[0.45, 0.97, -0.5]}><sphereGeometry args={[0.07, 32, 16]} /><meshStandardMaterial color="#10b981" /></mesh>
          </Handle>

          <IfInSessionMode deny={["immersive-vr", "immersive-ar"]}>
            <OrbitControls target={[0, 0.9, -0.6]} />
          </IfInSessionMode>
        </XR>
      </Canvas>
    </>
  );
}
```

Dragging an object with the mouse doesn't also orbit the camera: handles capture the pointer and stop propagation, so you don't have to disable controls by hand as in plain three.js.

## Physical controls that drive a machine

Industrial and training apps need **controls** rather than free-floating objects: a lever, a dial, a big red button. Each is a constrained handle whose value you read and feed into your application state. Here three controls drive a two-joint robot arm, the kind of panel used in VR teleoperation and robot-cell training:

```jsx run title="Dial, lever and button controlling a robot arm" level=advanced height=560
import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { XR, createXRStore, IfInSessionMode } from "@react-three/xr";
import { Handle, HandleTarget } from "@react-three/handle";
import { create } from "zustand";
import { easing } from "maath";

const store = createXRStore({ emulate: { inject: true } });
const useArm = create((set) => ({ base: 0, lift: 0.4, gripper: false, set }));

// a dial: drag sideways to rotate, limited to ±150°, reports its angle
function Dial({ position }) {
  const ref = useRef();
  useFrame(() => { useArm.setState({ base: ref.current.rotation.y }); });
  return (
    <group position={position}>
      <HandleTarget ref={ref}>
        <Handle targetRef="from-context" translate="as-rotate" rotate={{ x: false, y: [-2.6, 2.6], z: false }} scale={false}>
          <mesh><cylinderGeometry args={[0.06, 0.06, 0.03, 32]} /><meshStandardMaterial color="#334155" /></mesh>
          <mesh position={[0, 0.02, 0.045]}><boxGeometry args={[0.01, 0.01, 0.03]} /><meshStandardMaterial color="#f8fafc" /></mesh>
        </Handle>
      </HandleTarget>
      <Text position={[0, 0.06, 0]} fontSize={0.025} color="#0f172a">BASE</Text>
    </group>
  );
}

// a lever: slides along z between two limits, mapped to 0…1
function Lever({ position }) {
  const ref = useRef();
  useFrame(() => { useArm.setState({ lift: (ref.current.position.z + 0.08) / 0.16 }); });
  return (
    <group position={position}>
      <mesh position-y={-0.01}><boxGeometry args={[0.03, 0.01, 0.2]} /><meshStandardMaterial color="#57534e" /></mesh>
      {/* the HandleTarget group is what moves; read its position, not the mesh's */}
      <HandleTarget ref={ref}>
        <Handle targetRef="from-context" translate={{ x: false, y: false, z: [-0.08, 0.08] }} rotate={false} scale={false}>
          <mesh position-y={0.03}><boxGeometry args={[0.04, 0.06, 0.04]} /><meshStandardMaterial color="#f59e0b" /></mesh>
        </Handle>
      </HandleTarget>
      <Text position={[0, 0.08, 0]} fontSize={0.025} color="#0f172a">LIFT</Text>
    </group>
  );
}

// a push button: any pointer (ray click, mouse, fingertip touch) toggles the gripper
function GripButton({ position }) {
  const gripper = useArm((s) => s.gripper);
  const [down, setDown] = useState(false);
  return (
    <group position={position}>
      <mesh position-y={down ? 0.005 : 0.015}
        onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)}
        onClick={() => useArm.setState({ gripper: !gripper })}>
        <cylinderGeometry args={[0.035, 0.035, 0.03, 32]} />
        <meshStandardMaterial color={gripper ? "#22c55e" : "#ef4444"} />
      </mesh>
      <Text position={[0, 0.06, 0]} fontSize={0.025} color="#0f172a">{gripper ? "CLOSED" : "OPEN"}</Text>
    </group>
  );
}

function Arm() {
  const base = useRef(), upper = useRef(), left = useRef(), right = useRef();
  useFrame((_, dt) => {
    const { base: b, lift, gripper } = useArm.getState();
    easing.dampAngle(base.current.rotation, "y", b, 0.2, dt);          // joint 1 follows the dial
    easing.dampAngle(upper.current.rotation, "z", -0.2 - lift * 1.2, 0.2, dt);   // joint 2 follows the lever
    easing.damp(left.current.position, "x", gripper ? -0.015 : -0.05, 0.1, dt);
    easing.damp(right.current.position, "x", gripper ? 0.015 : 0.05, 0.1, dt);
  });
  return (
    <group position={[0, 0.88, -1.0]}>
      <mesh position-y={0.04}><cylinderGeometry args={[0.12, 0.14, 0.08, 32]} /><meshStandardMaterial color="#f97316" /></mesh>
      <group ref={base} position-y={0.08}>
        <mesh position-y={0.15}><boxGeometry args={[0.07, 0.3, 0.07]} /><meshStandardMaterial color="#fb923c" /></mesh>
        <group ref={upper} position-y={0.3}>
          <mesh position-x={0.15}><boxGeometry args={[0.3, 0.06, 0.06]} /><meshStandardMaterial color="#fdba74" /></mesh>
          <group position-x={0.3}>
            <mesh ref={left} position={[-0.05, -0.05, 0]}><boxGeometry args={[0.02, 0.08, 0.04]} /><meshStandardMaterial color="#475569" /></mesh>
            <mesh ref={right} position={[0.05, -0.05, 0]}><boxGeometry args={[0.02, 0.08, 0.04]} /><meshStandardMaterial color="#475569" /></mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

export default function App() {
  return (
    <>
      <div className="overlay"><span>Turn the <b>dial</b>, slide the <b>lever</b>, press the <b>button</b> (mouse or VR).</span></div>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>
      <Canvas camera={{ position: [0.4, 1.35, 0.3], fov: 55 }}>
        <XR store={store}>
          <color attach="background" args={["#e2e8f0"]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[1, 3, 2]} intensity={2} />
          {/* the control desk, at waist height in front of the user */}
          <mesh position={[0, 0.84, -0.45]}><boxGeometry args={[0.6, 0.04, 0.3]} /><meshStandardMaterial color="#cbd5e1" /></mesh>
          <Dial position={[-0.18, 0.87, -0.45]} />
          <Lever position={[0, 0.87, -0.45]} />
          <GripButton position={[0.18, 0.86, -0.45]} />
          <Arm />
          <IfInSessionMode deny={["immersive-vr", "immersive-ar"]}>
            <OrbitControls target={[0, 1, -0.7]} />
          </IfInSessionMode>
        </XR>
      </Canvas>
    </>
  );
}
```

The pattern scales to real systems: the controls write **targets** into a store; the 3D arm (or a real robot, via a WebSocket to ROS) follows those targets. That separation is what lets the same panel drive a simulation, a digital twin, or physical hardware.

:::ai
**Teleoperation** is one of the most active uses of WebXR in robotics: an operator in a headset sees the robot's camera feeds and a 3D twin, and moves the robot by grabbing a virtual end-effector (a `Handle` on the gripper), with inverse kinematics computing joint angles. The same setups are used to **collect demonstration data** for training robot learning models (imitation learning), because recording a human's VR motions is far cheaper than programming every task.
:::

## Feedback: hover, haptics and sound

In a headset there's no cursor change or hover colour by default, so feedback must be explicit:

| Feedback | How |
|---|---|
| hover highlight | `onPointerEnter`/`onPointerLeave` (or drei `useCursor` on desktop) |
| pressed state | move the button down on `onPointerDown`, as above |
| **haptics** | a short vibration on the controller that touched it |
| sound | a click via drei `<PositionalAudio>` placed at the control |

```jsx
import { useXRInputSourceState } from "@react-three/xr";

function useHaptics(hand = "right") {
  const controller = useXRInputSourceState("controller", hand);
  return (intensity = 0.4, ms = 40) =>
    controller?.inputSource.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms);   // supported on Quest and most PC VR
}

// in a component:
const buzz = useHaptics("right");
<mesh onPointerEnter={() => buzz(0.2, 20)} onClick={() => buzz(0.8, 60)} />
```

## Interaction design rules for headsets

- **Reachable zone**: put frequently used controls 0.4–0.7 m in front, slightly below eye level; nobody wants to hold their arms up for minutes ("gorilla arm").
- **Size targets generously**: at least 2–3 cm for poke buttons, larger for ray targets far away (angle matters more than size).
- **Give every action feedback**: visual + haptic + optional sound.
- **Support both near and far**: grab what's close, ray what's far; don't require walking across a room.
- **Constrain motion**: levers, sliders and dials with limits are easier and more precise than free 6-DoF grabbing.
- **Design for hands, controllers and gaze**: the same pointer events make this cheap; test in the emulator in each input mode.

## Check yourself

```quiz
? Which pointer type lets a user poke a button with their fingertip?
+ touch (from hand tracking)
- ray
- screen
> The index fingertip is a touch pointer.

? How do you make a handle that slides only along x between -0.1 and 0.3 m?
+ translate={{ x: [-0.1, 0.3], y: false, z: false }} with rotate and scale disabled
- position-x={[-0.1, 0.3]}
- A Rapier joint is required
> Handle options constrain each axis.

? What does translate="as-rotate" do?
+ Turns a drag into a rotation (dials, door handles)
- Rotates the camera
- Disables translation only
> Useful for knobs and hinged parts.

? Why do handles not need OrbitControls disabled while dragging?
+ They capture the pointer and stop event propagation
- OrbitControls ignores meshes automatically
- They only work in VR
> Pointer capture routes the drag to the handle.

? A control panel must ignore grabs but respond to ray clicks. What's the prop?
+ pointerEventsType={{ deny: "grab" }}
- onGrab={null}
- raycast={null}
> Filter which pointer types an object reacts to.
```

:::exercise Emergency stop
Add a big red **E-STOP** button to the robot panel. When pressed, it freezes the arm (the `Arm` ignores dial/lever changes) until pressed again, and the button glows while active (`emissive`). Bonus: call a haptic pulse on press.
:::

:::solution
```jsx run height=520
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { XR, createXRStore } from "@react-three/xr";
import { Handle, HandleTarget } from "@react-three/handle";
import { create } from "zustand";
import { easing } from "maath";

const store = createXRStore({ emulate: { inject: true } });
const useArm = create(() => ({ lift: 0.5, stopped: false }));

function Lever() {
  const ref = useRef();
  useFrame(() => useArm.setState({ lift: (ref.current.position.z + 0.08) / 0.16 }));
  return (
    <group position={[-0.1, 0.9, -0.45]}>
      <HandleTarget ref={ref}>
        <Handle targetRef="from-context" translate={{ x: false, y: false, z: [-0.08, 0.08] }} rotate={false} scale={false}>
          <mesh><boxGeometry args={[0.04, 0.06, 0.04]} /><meshStandardMaterial color="#f59e0b" /></mesh>
        </Handle>
      </HandleTarget>
    </group>
  );
}

function EStop() {
  const stopped = useArm((s) => s.stopped);
  return (
    <group position={[0.12, 0.88, -0.45]}>
      <mesh onClick={() => useArm.setState({ stopped: !stopped })}>
        <cylinderGeometry args={[0.05, 0.05, 0.04, 32]} />
        <meshStandardMaterial color="#dc2626" emissive="#ef4444" emissiveIntensity={stopped ? 1.5 : 0} />
      </mesh>
      <Text position={[0, 0.07, 0]} fontSize={0.022} color="#0f172a">{stopped ? "STOPPED" : "E-STOP"}</Text>
    </group>
  );
}

function Arm() {
  const joint = useRef();
  useFrame((_, dt) => {
    const { lift, stopped } = useArm.getState();
    if (!stopped) easing.dampAngle(joint.current.rotation, "z", -lift * 1.2, 0.2, dt);   // frozen while stopped
  });
  return (
    <group position={[0, 0.88, -0.9]}>
      <mesh position-y={0.15}><boxGeometry args={[0.07, 0.3, 0.07]} /><meshStandardMaterial color="#fb923c" /></mesh>
      <group ref={joint} position-y={0.3}><mesh position-x={0.15}><boxGeometry args={[0.3, 0.06, 0.06]} /><meshStandardMaterial color="#fdba74" /></mesh></group>
    </group>
  );
}

export default function App() {
  return (
    <>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>
      <Canvas camera={{ position: [0.3, 1.3, 0.3] }}>
        <XR store={store}>
          <color attach="background" args={["#e2e8f0"]} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[1, 3, 2]} intensity={1.5} />
          <Lever /><EStop /><Arm />
          <OrbitControls target={[0, 1, -0.6]} />
        </XR>
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- Controllers and hands provide **ray, grab and touch** pointers (plus transient and screen); all fire R3F pointer events.
- `@react-three/handle`'s `<Handle>` makes anything grabbable with mouse or XR; constrain `translate`/`rotate`/`scale` per axis and range.
- Build **physical controls** (dials, levers, buttons) as constrained handles that write targets to a store; the scene (or a real robot) follows.
- Filter inputs with `pointerEventsType`; give feedback with hover states, pressed states, **haptics** and sound.
- Design for reach, comfort and target size; test with controllers, hands and gaze.
:::
