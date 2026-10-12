---
title: Digital Twins, Industry 4.0 & Robotics
level: advanced
time: 45
summary: What a digital twin is (and isn't), the data pipeline from sensors to 3D (MQTT, WebSockets, ROS 2 bridges), status colours, alarms, history and time scrubbing, a live factory-floor twin, loading real robots from URDF files and driving their joints, and how robotics teams use web 3D for monitoring, teleoperation and data review.
---

A factory dashboard full of numbers says "Press 4: 87 °C". A digital twin shows a **red press in the corner of the hall**, with the conveyor behind it backing up. Putting live data where it physically happens is why manufacturers, warehouses, energy companies and robotics teams build web-based twins: operators diagnose faster, remote experts see what's happening, and the same view runs on a control-room wall, a laptop and a tablet on the shop floor.

:::def Digital twin
A virtual model of a physical asset or system (a machine, a production line, a building, a robot) that is **kept in sync with the real thing using live data**, and is used to monitor, analyse, predict or control it. A 3D model alone is not a twin; the live connection is what makes it one.
:::

| Level | What it does | Example |
|---|---|---|
| **Digital model** | 3D only, no live data | a showroom model of the factory |
| **Digital shadow** | 3D updated **from** the real system | live machine states and sensor values |
| **Digital twin** | two-way: also sends commands or runs simulations that inform decisions | start/stop a line, test a new layout before moving machines |

## The data pipeline

:::flow From sensor to pixel
Sensors & controllers | PLCs, robots, IoT devices (OPC UA, Modbus, ROS 2)
Edge gateway | normalises data, publishes to a broker
Broker / bridge | MQTT, Kafka, foxglove_bridge, rosbridge
Backend | time-series DB (history), alarms, auth, aggregation
WebSocket to browser | only the topics this view needs, throttled
3D client | store → scene: colours, positions, labels, alerts
:::

The rules that keep twins fast and correct:

- **Throttle at the edge.** A sensor may sample at 1 kHz; the browser needs 5–20 updates per second. Aggregate (min/max/mean) before sending.
- **Data goes into a store, not into components.** Messages update a Zustand store (or plain objects); `useFrame` reads it. React re-renders only for things the user selects.
- **Never block the frame on the network.** Render the latest known state; show staleness ("last update 4 s ago") instead of freezing.
- **Keep history.** Operators need "what happened at 14:02?", so buffer recent history client-side and query the time-series DB for older data.

## A live factory twin

This twin simulates the WebSocket feed in the browser so it runs here; replace the simulator with a real `WebSocket` and it's the same app. Click a machine for its live trend; drag the timeline to **replay** the last minute.

```jsx run title="Factory floor twin: live status, alarms, trends, replay" level=advanced height=540
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { create } from "zustand";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Text, Environment } from "@react-three/drei";
import { easing } from "maath";

const MACHINES = [
  { id: "CNC-1", type: "cnc", pos: [-3, 0, -1.5] }, { id: "CNC-2", type: "cnc", pos: [-1, 0, -1.5] },
  { id: "PRESS-3", type: "press", pos: [1, 0, -1.5] }, { id: "ROBOT-4", type: "robot", pos: [3, 0, -1.5] },
  { id: "PACK-5", type: "pack", pos: [-2, 0, 1.5] }, { id: "QA-6", type: "qa", pos: [2, 0, 1.5] },
];
const HISTORY = 600;    // samples kept (10 per second → 60 s)

// ---- the store: latest values + a ring buffer of history per machine ----
const useTwin = create(() => ({ latest: {}, history: {}, alarms: [], t: 0 }));

// ---- a simulated telemetry feed (replace with: new WebSocket("wss://…/telemetry")) ----
function useTelemetryFeed() {
  useEffect(() => {
    let t = 0;
    const id = setInterval(() => {
      t += 0.1;
      const { latest, history, alarms } = useTwin.getState();
      const nextLatest = { ...latest }, nextHistory = { ...history };
      let nextAlarms = alarms;
      MACHINES.forEach((m, i) => {
        const base = 55 + i * 4 + Math.sin(t * 0.3 + i) * 10;
        const spike = m.id === "PRESS-3" && (t % 40) > 30 ? 30 : 0;       // the press overheats every 40 s
        const temp = base + spike + (Math.random() - 0.5) * 2;
        const status = temp > 90 ? "alarm" : temp > 78 ? "warn" : "ok";
        if (status === "alarm" && latest[m.id]?.status !== "alarm") {
          nextAlarms = [{ id: m.id, at: t.toFixed(1), text: `${m.id} over temperature (${temp.toFixed(0)} °C)` }, ...alarms].slice(0, 5);
        }
        nextLatest[m.id] = { temp, status, load: 0.5 + Math.sin(t * 0.7 + i) * 0.4 };
        nextHistory[m.id] = [...(history[m.id] ?? []), { t, temp }].slice(-HISTORY);
      });
      useTwin.setState({ latest: nextLatest, history: nextHistory, alarms: nextAlarms, t });
    }, 100);
    return () => clearInterval(id);
  }, []);
}

const STATUS_COLOR = { ok: "#22c55e", warn: "#f59e0b", alarm: "#ef4444" };

function Machine({ id, type, pos, selected, onSelect, replay }) {
  const body = useRef(), light = useRef(), arm = useRef();
  const color = new THREE.Color();
  useFrame(({ clock }, dt) => {
    // live mode reads the latest sample; replay mode reads the sample at the scrubbed time
    const { latest, history } = useTwin.getState();
    const sample = replay == null ? latest[id] : history[id]?.[Math.floor(replay * ((history[id]?.length ?? 1) - 1))];
    if (!sample) return;
    const status = sample.status ?? (sample.temp > 90 ? "alarm" : sample.temp > 78 ? "warn" : "ok");
    easing.dampC(light.current.material.color, STATUS_COLOR[status], 0.15, dt);
    light.current.material.emissive.copy(light.current.material.color);
    light.current.material.emissiveIntensity = status === "alarm" ? 1 + Math.sin(clock.elapsedTime * 10) : 0.6;   // alarms blink
    easing.dampC(body.current.material.emissive, color.set(selected ? "#1e40af" : "#000000"), 0.2, dt);
    if (arm.current) arm.current.rotation.y = Math.sin(clock.elapsedTime * 1.5) * 1.2;                     // the robot works
  });
  return (
    <group position={pos} onClick={(e) => { e.stopPropagation(); onSelect(id); }}>
      <mesh ref={body} position-y={0.5}>
        <boxGeometry args={type === "pack" || type === "qa" ? [1.6, 1, 1] : [1.2, 1, 1.2]} />
        <meshStandardMaterial color="#64748b" metalness={0.3} roughness={0.5} />
      </mesh>
      {type === "robot" && (
        <group ref={arm} position-y={1}>
          <mesh position={[0.35, 0.35, 0]} rotation-z={-0.8}><boxGeometry args={[0.15, 0.9, 0.15]} /><meshStandardMaterial color="#f97316" /></mesh>
        </group>
      )}
      <mesh ref={light} position={[0, 1.15, 0]}><sphereGeometry args={[0.1, 16, 8]} /><meshStandardMaterial color="#22c55e" /></mesh>
      <Text position={[0, 0.5, 0.62]} fontSize={0.16} color="#f8fafc">{id}</Text>
    </group>
  );
}

function Trend({ id }) {
  const canvas = useRef();
  useEffect(() => {
    let raf;
    const draw = () => {
      const data = useTwin.getState().history[id] ?? [];
      const c = canvas.current;
      if (c) {
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.strokeStyle = "#94a3b8"; ctx.setLineDash([3, 3]);
        ctx.beginPath(); const y90 = c.height - ((90 - 40) / 70) * c.height; ctx.moveTo(0, y90); ctx.lineTo(c.width, y90); ctx.stroke();   // alarm limit
        ctx.setLineDash([]); ctx.strokeStyle = "#10b981"; ctx.lineWidth = 2; ctx.beginPath();
        data.forEach((p, i) => { const x = (i / HISTORY) * c.width, y = c.height - ((p.temp - 40) / 70) * c.height; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [id]);
  const latest = useTwin((s) => s.latest[id]);
  return (
    <div className="overlay right" style={{ width: 240 }}>
      <b>{id}</b>
      <span>{latest ? `${latest.temp.toFixed(1)} °C · ${latest.status}` : "…"}</span>
      <canvas ref={canvas} width={216} height={70} style={{ background: "var(--bg)", borderRadius: 6 }} />
      <small className="muted">last 60 s · dashed line = 90 °C alarm limit</small>
    </div>
  );
}

function Alarms() {
  const alarms = useTwin((s) => s.alarms);
  return (
    <div className="overlay bottom" style={{ width: 300 }}>
      <b>Alarms</b>
      {alarms.length === 0 ? <span className="muted">none</span> : alarms.map((a, i) => <span key={i} style={{ color: "#ef4444", fontSize: 12 }}>t={a.at}s · {a.text}</span>)}
    </div>
  );
}

export default function App() {
  useTelemetryFeed();
  const [selected, setSelected] = useState("PRESS-3");
  const [replay, setReplay] = useState(null);       // null = live, 0…1 = position in history
  return (
    <>
      <div className="overlay" style={{ width: 280 }}>
        <b>{replay == null ? "● LIVE" : "⏪ REPLAY"}</b>
        <input type="range" min="0" max="1" step="0.001" value={replay ?? 1} onChange={(e) => setReplay(+e.target.value)} />
        <button onClick={() => setReplay(null)} disabled={replay == null}>Back to live</button>
      </div>
      {selected && <Trend id={selected} />}
      <Alarms />
      <Canvas camera={{ position: [0, 7, 8], fov: 45 }} onPointerMissed={() => setSelected(null)}>
        <color attach="background" args={["#0f172a"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={1.5} />
        {MACHINES.map((m) => <Machine key={m.id} {...m} selected={selected === m.id} onSelect={setSelected} replay={replay} />)}
        <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[12, 7]} /><meshStandardMaterial color="#1e293b" /></mesh>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[9, 0.2, 0.6]} /><meshStandardMaterial color="#334155" /></mesh>
        <gridHelper args={[12, 12, "#334155", "#1e293b"]} position-y={0.01} />
        <Environment preset="warehouse" />
        <OrbitControls maxPolarAngle={1.3} />
      </Canvas>
    </>
  );
}
```

Watch PRESS-3: every 40 seconds it overheats, its light blinks red, an alarm is logged, and the trend crosses the dashed limit. Drag the timeline back to replay the incident; "Back to live" resumes. That replay is often the most valued feature by operators: it answers "what happened just before the alarm?".

:::tip From simulation to a real feed
Swap `useTelemetryFeed` for a WebSocket that writes to the same store:

```js
const ws = new WebSocket("wss://twin.example.com/stream?site=plant-7");
ws.onmessage = (e) => {
  const { machine, temp, status, ts } = JSON.parse(e.data);
  useTwin.setState((s) => ({
    latest: { ...s.latest, [machine]: { temp, status, ts } },
    history: { ...s.history, [machine]: [...(s.history[machine] ?? []), { t: ts, temp }].slice(-600) },
  }));
};
```

The 3D code doesn't change. For MQTT brokers, `mqtt.js` connects from the browser over WebSockets; for ROS 2, use **foxglove_bridge** or **rosbridge** (below).
:::

## Robots from URDF

:::def URDF (Unified Robot Description Format)
The XML format ROS uses to describe a robot: its **links** (rigid parts, with meshes for visuals and collisions) and **joints** (how links connect: revolute, prismatic, fixed, with axes and limits). Loading a URDF gives you the robot as a scene graph whose joints you can set by angle, exactly the parent–child structure from Module 1.
:::

The **urdf-loader** library (by Garrett Johnson, also the author of three-mesh-bvh and NASA's 3D Tiles renderer) turns a URDF into a three.js object with a `setJointValue(name, value)` API. This loads a real six-legged robot from GitHub and lets you drive its joints:

```jsx run title="Load a URDF robot and drive its joints" level=advanced height=540
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, Grid } from "@react-three/drei";
import URDFLoader from "urdf-loader";

const URL = "https://raw.githubusercontent.com/gkjohnson/urdf-loaders/master/urdf/T12/urdf/T12_flipped.URDF";

function useURDF(url) {
  const [robot, setRobot] = useState(null);
  useEffect(() => {
    const loader = new URDFLoader();
    loader.load(url, (r) => {
      r.rotation.x = -Math.PI / 2;               // ROS is Z-up; three.js is Y-up
      r.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: "#cbd5e1", metalness: 0.4, roughness: 0.5 }); });
      setRobot(r);
    });
  }, [url]);
  return robot;
}

function Driver({ robot, joints, walk, values }) {
  useFrame(({ clock }) => {
    if (!robot) return;
    joints.forEach((j, i) => {
      const v = walk ? Math.sin(clock.elapsedTime * 2 + i * 0.9) * 0.4 : (values[j.name] ?? 0);   // a simple gait, or the sliders
      robot.setJointValue(j.name, v);
    });
  });
  return null;
}

export default function App() {
  const robot = useURDF(URL);
  const [walk, setWalk] = useState(true);
  const [values, setValues] = useState({});
  const joints = useMemo(() => robot ? Object.values(robot.joints).filter((j) => j.jointType === "revolute" || j.jointType === "continuous") : [], [robot]);

  return (
    <>
      <div className="overlay" style={{ maxHeight: "90%", overflow: "auto", width: 260 }}>
        <b>{robot ? `${robot.robotName}: ${joints.length} joints` : "Loading URDF…"}</b>
        <label><input type="checkbox" checked={walk} onChange={(e) => setWalk(e.target.checked)} /> animate gait</label>
        {!walk && joints.slice(0, 12).map((j) => (
          <label key={j.name} style={{ fontSize: 11 }}><code style={{ width: 90, overflow: "hidden" }}>{j.name}</code>
            <input type="range" min={j.limit.lower || -1.5} max={j.limit.upper || 1.5} step="0.01" value={values[j.name] ?? 0}
              onChange={(e) => setValues((v) => ({ ...v, [j.name]: +e.target.value }))} />
          </label>
        ))}
      </div>
      <Canvas camera={{ position: [5, 4, 7], fov: 45 }}>
        <color attach="background" args={["#f1f5f9"]} />
        {robot && <primitive object={robot} />}                {/* T12 is a big rover: several metres across */}
        <Driver robot={robot} joints={joints} walk={walk} values={values} />
        <Grid infiniteGrid cellColor="#cbd5e1" sectionColor="#94a3b8" fadeDistance={25} />
        <Environment preset="warehouse" />
        <OrbitControls target={[0, 0.8, 0]} />
      </Canvas>
    </>
  );
}
```

In a real deployment, the joint values come from the robot: ROS publishes `sensor_msgs/JointState` messages, a bridge forwards them over WebSocket, and you call `robot.setJointValue(name, position)` for each.

```js
// ROS 2 → browser with rosbridge (roslibjs); foxglove_bridge works similarly with @foxglove/ws-protocol
import ROSLIB from "roslib";
const ros = new ROSLIB.Ros({ url: "wss://robot-cell-3.local:9090" });
new ROSLIB.Topic({ ros, name: "/joint_states", messageType: "sensor_msgs/msg/JointState", throttle_rate: 50 })
  .subscribe(({ name, position }) => name.forEach((n, i) => robot.setJointValue(n, position[i])));
```

## How robotics teams use web 3D

| Use | What's shown | Tools |
|---|---|---|
| **monitoring & fleet dashboards** | robot pose, status, battery, current task on a map/twin | three.js/R3F + live telemetry |
| **log review & debugging** | recorded sensor data (LiDAR, cameras, TF, plans) on a timeline | **Foxglove** (built on three.js), Rerun, Webviz |
| **teleoperation** | camera feeds + 3D twin; drag a target, IK computes joints | R3F + WebXR + WebRTC video |
| **cell design & offline programming** | layout robots, reach studies, paths | TransformControls, IK, collision checks |
| **data labelling for ML** | 3D boxes on point clouds, grasp annotations | three.js point clouds, instancing |
| **customer demos & sales** | the robot in the customer's own cell, in AR | glTF + model-viewer / WebXR |

:::ai
Robot learning runs on data: thousands of demonstrations, sensor logs and simulated episodes. Web-based 3D tools are how teams **inspect** that data at scale (scrub a failed grasp frame by frame), **label** it (3D bounding boxes, grasp points), **collect** it (VR teleoperation of a twin), and **evaluate** policies (replay a model's planned trajectory over the real robot's log). Fluency in three.js, point clouds, URDF and real-time data is directly useful in physical-AI companies.
:::

## Check yourself

```quiz
? What makes a 3D model a digital twin?
+ A live data connection that keeps it in sync with the real asset (and ideally two-way interaction)
- High-quality textures
- Being built with three.js
> Without live data it's a digital model.

? A sensor samples at 1 kHz. How often should it reach the browser?
+ Aggregated to roughly 5–20 updates per second at the edge or backend
- 1,000 times per second
- Once per minute
> The screen can't show more, and the network shouldn't carry it.

? Where should incoming telemetry be written in an R3F twin?
+ Into a store; useFrame reads it, React re-renders only for selections
- Into React state of every machine component
- Directly into the DOM
> Avoid re-render storms at telemetry rates.

? What does a URDF describe?
+ A robot's links (with meshes) and joints (types, axes, limits)
- A robot's software API
- A factory layout
> It's the standard ROS robot description.

? Why rotate a loaded URDF by -90° around X?
+ ROS uses Z-up coordinates and three.js uses Y-up
- URDF files are mirrored
- To fix the scale
> Coordinate conventions differ between ecosystems.
```

:::exercise Utilisation heat map
Add an "Overview" mode to the factory twin: a button that colours each machine's **body** by its current `load` (0 = blue, 1 = red) instead of grey, so a supervisor can spot bottlenecks at a glance. Keep status lights as they are.
:::

:::solution
```jsx run height=480
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { easing } from "maath";

const MACHINES = [[-3, -1.5], [-1, -1.5], [1, -1.5], [3, -1.5], [-2, 1.5], [2, 1.5]];
const load = { current: MACHINES.map(() => 0) };                     // a shared live buffer instead of a store

function useFeed() {
  useEffect(() => {
    let t = 0;
    const id = setInterval(() => { t += 0.1; load.current = MACHINES.map((_, i) => (Math.sin(t * 0.7 + i) + 1) / 2); }, 100);
    return () => clearInterval(id);
  }, []);
}

function Machine({ i, pos, overview }) {
  const ref = useRef(), c = new THREE.Color();
  useFrame((_, dt) => {
    const l = load.current[i];
    easing.dampC(ref.current.material.color, overview ? c.setHSL(0.66 * (1 - l), 0.8, 0.5) : c.set("#64748b"), 0.2, dt);
  });
  return <mesh ref={ref} position={[pos[0], 0.5, pos[1]]}><boxGeometry args={[1.2, 1, 1.2]} /><meshStandardMaterial /></mesh>;
}

export default function App() {
  useFeed();
  const [overview, setOverview] = useState(false);
  return (
    <>
      <button className="overlay" onClick={() => setOverview(!overview)}>{overview ? "Normal view" : "Utilisation overview"}</button>
      <Canvas camera={{ position: [0, 7, 8], fov: 45 }}>
        <color attach="background" args={["#0f172a"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 10, 5]} intensity={1.5} />
        {MACHINES.map((p, i) => <Machine key={i} i={i} pos={p} overview={overview} />)}
        <OrbitControls />
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- A **twin** = 3D + live data (+ ideally two-way control and simulation); model → shadow → twin.
- Pipeline: sensors → edge → broker/bridge (MQTT, ROS bridges) → backend (history, alarms) → WebSocket → store → scene.
- Throttle upstream, write to a store, render the latest state, show staleness, keep history for **replay**.
- Status colours, blinking alarms, trends and replay are what operators value most.
- **URDF** robots load with `urdf-loader`; drive joints from `JointState` via rosbridge or foxglove_bridge (rotate Z-up → Y-up).
- Robotics teams use web 3D for monitoring, log review (Foxglove), teleoperation, labelling and demos.
:::
