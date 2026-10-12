---
title: Robot Arm Digital Twin
level: advanced
time: 75
icon: cpu
cover: #f59e0b,#334155
tags: kinematic chains, forward & inverse kinematics, TransformControls, state machines, latency simulation, telemetry charts, R3F
summary: A digital twin of a 4-axis robot arm with a gripper. It has forward kinematics with joint sliders, analytic inverse kinematics you steer with a drag gizmo, and a pick-and-place program. A simulated "real" robot follows commands with latency and speed limits, a ghost overlay compares commanded and measured pose, and a live telemetry panel tracks joint angles, tool position and tracking error.
---

Robotics teams use 3D twins to **program, monitor and debug** robots: you see what the robot *was told* to do next to what it *is* doing, from any angle, without standing next to a moving machine. This project builds the core of such a tool from scratch, with no robotics library: just groups, trigonometry and a frame loop.

:::flow How it fits together
Kinematic chain | nested groups: base yaw → shoulder → elbow → wrist → gripper
Command | manual sliders (FK), a drag target (IK), or a pick-and-place program
Robot | a simulated real arm that follows commands with latency and speed limits
Twin | solid arm = measured state, ghost arm = command; the carried box follows the measured gripper
Telemetry | joint-angle chart, tool position, tracking error, cycle stats
:::

:::def Forward and inverse kinematics
**Forward kinematics (FK)**: given the joint angles, where is the tool? In three.js you get this for free: set each group's rotation and read the tool's `getWorldPosition()`. **Inverse kinematics (IK)**: given where the tool should be, which joint angles put it there? That needs maths, and there may be zero, one or several answers.
:::

## Step 1: Two-link IK, solved with the law of cosines

Move the pointer: the arm reaches for it. Two links of length L1 and L2 form a triangle with the line to the target; the **law of cosines** gives the elbow angle, and two `atan2` calls give the shoulder angle. There are two solutions (elbow up or down); toggle between them.

```js run title="Step 1 · Planar two-link IK" height=400
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#f8fafc");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.5, 10);

const L1 = 2, L2 = 1.5;
const link = (len, color) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, 0.22), new THREE.MeshStandardMaterial({ color }));
  m.geometry.translate(len / 2, 0, 0);           // pivot at the start of the link, not its centre
  return m;
};
const shoulder = new THREE.Group();
shoulder.position.y = -1.5;
const elbow = new THREE.Group();
elbow.position.x = L1;                            // elbow sits at the end of link 1
shoulder.add(link(L1, "#f59e0b"), elbow);
elbow.add(link(L2, "#3b82f6"));
scene.add(shoulder, new THREE.HemisphereLight(0xffffff, 0x94a3b8, 3));

// workspace: everything the tip can reach is inside this ring
const ring = new THREE.Mesh(new THREE.RingGeometry(L1 + L2 - 0.02, L1 + L2, 96), new THREE.MeshBasicMaterial({ color: "#cbd5e1" }));
ring.position.copy(shoulder.position);
const target = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: "#22c55e" }));
scene.add(ring, target);

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<button>Elbow up</button><div class="muted" id="t"></div>`;
document.body.append(ui);
let elbowUp = true;
ui.querySelector("button").onclick = (e) => { elbowUp = !elbowUp; e.target.textContent = elbowUp ? "Elbow up" : "Elbow down"; };

// pointer → point on the z = 0 plane
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), ray = new THREE.Raycaster(), p = new THREE.Vector3();
addEventListener("pointermove", (e) => {
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  ray.ray.intersectPlane(plane, p) && target.position.copy(p);
});
target.position.set(2, 0.5, 0);

renderer.setAnimationLoop(() => {
  const x = target.position.x - shoulder.position.x, y = target.position.y - shoulder.position.y;
  const reach = Math.hypot(x, y);
  const d = Math.min(reach, L1 + L2 - 1e-3);                          // clamp unreachable targets
  const cosE = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);           // law of cosines
  const e = Math.acos(THREE.MathUtils.clamp(cosE, -1, 1)) * (elbowUp ? -1 : 1);
  const s = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(e), L1 + L2 * Math.cos(e));
  shoulder.rotation.z = s;
  elbow.rotation.z = e;
  target.material.color.set(reach > L1 + L2 ? "#ef4444" : "#22c55e");
  ui.querySelector("#t").textContent = `shoulder ${(s * 180 / Math.PI).toFixed(0)}°, elbow ${(e * 180 / Math.PI).toFixed(0)}°`;
  renderer.render(scene, camera);
});
```

For a real arm we add two things: a **base yaw** (rotate the whole plane towards the target with `atan2`) and a **wrist** angle that keeps the gripper pointing straight down: wrist = 180° − shoulder − elbow. That's the complete IK for this kind of arm, the same "decouple the wrist" approach industrial controllers use.

## Step 2: The digital twin

```jsx run title="Robot Arm Digital Twin · complete app" level=advanced height=620
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, TransformControls, Grid, Environment } from "@react-three/drei";

// ---------- robot geometry & limits ----------
const SH = 0.42, L1 = 0.8, L2 = 0.7, L3 = 0.28;   // shoulder height, upper arm, forearm, wrist → finger tips (m)
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const JOINTS = [
  { name: "Base", min: -170, max: 170, color: "#f97316" },
  { name: "Shoulder", min: -90, max: 110, color: "#16a34a" },
  { name: "Elbow", min: -150, max: 150, color: "#2563eb" },
  { name: "Wrist", min: -180, max: 180, color: "#a855f7" },
];
const BOX = 0.12;
const PADS = [new THREE.Vector3(-0.9, 0, 0.6), new THREE.Vector3(0.9, 0, 0.6)];

// ---------- inverse kinematics (analytic) ----------
// Joints rotate about local z; links point along local +y; positive angles lean towards the base's local −x.
function solveIK(t) {
  const q0 = Math.atan2(t.z, -t.x);                       // turn the arm's plane towards the target
  const u = Math.hypot(t.x, t.z), v = t.y + L3 - SH;      // wrist point in that plane (tool points down)
  let d = Math.hypot(u, v), reach = true;
  if (d > (L1 + L2) * 0.999) { d = (L1 + L2) * 0.999; reach = false; }
  if (d < Math.abs(L1 - L2) + 0.01) { d = Math.abs(L1 - L2) + 0.01; reach = false; }
  const e = Math.acos(THREE.MathUtils.clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1));
  const q1 = Math.atan2(u, v) - Math.atan2(L2 * Math.sin(e), L1 + L2 * Math.cos(e)); // elbow-up solution
  const q = [q0, q1, e, Math.PI - q1 - e];                // wrist keeps the gripper vertical
  q.forEach((a, i) => {
    const c = THREE.MathUtils.clamp(a, JOINTS[i].min * D2R, JOINTS[i].max * D2R);
    if (c !== a) { q[i] = c; reach = false; }
  });
  return { q, reach };
}
const PAD_YAW = PADS.map((p) => solveIK(p).q[0]);

// pick from one pad, place on the other
const makeSteps = (a, b) => [
  { t: [a.x, 0.45, a.z], grip: 0, dur: 1.2 },
  { t: [a.x, 0.02, a.z], grip: 0, dur: 0.8 },
  { grip: 1, dur: 0.5, event: "grab" },
  { t: [a.x, 0.45, a.z], grip: 1, dur: 0.8 },
  { t: [b.x, 0.45, b.z], grip: 1, dur: 1.5 },
  { t: [b.x, 0.02, b.z], grip: 1, dur: 0.8 },
  { grip: 0, dur: 0.5, event: "release" },
  { t: [b.x, 0.45, b.z], grip: 0, dur: 0.8 },
];
const ease = (k) => k * k * (3 - 2 * k);

const GHOST = new THREE.MeshStandardMaterial({ color: "#38bdf8", transparent: true, opacity: 0.25, depthWrite: false });

// ---------- the arm: a chain of groups, posed from a joint array every frame ----------
function Arm({ src, ghost, tip }) {
  const base = useRef(), sh = useRef(), el = useRef(), wr = useRef(), f1 = useRef(), f2 = useRef();
  const m = useMemo(() => ghost ? { a: GHOST, d: GHOST } : {
    a: new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.45, metalness: 0.2 }),
    d: new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.5, metalness: 0.4 }),
  }, [ghost]);
  useFrame(() => {
    const q = src.current;
    base.current.rotation.y = q[0];
    sh.current.rotation.z = q[1];
    el.current.rotation.z = q[2];
    wr.current.rotation.z = q[3];
    const x = 0.11 - q[4] * 0.035;                    // finger offset: open 0.11 → closed 0.075 (touches the box)
    f1.current.position.x = -x;
    f2.current.position.x = x;
  });
  const s = { castShadow: !ghost };
  const hinge = (r, len) => <mesh rotation-x={Math.PI / 2} material={m.d} {...s}><cylinderGeometry args={[r, r, len, 24]} /></mesh>;
  return (
    <group ref={base}>
      <mesh position-y={0.12} material={m.d} {...s}><cylinderGeometry args={[0.24, 0.28, 0.24, 32]} /></mesh>
      <mesh position-y={0.3} material={m.a} {...s}><cylinderGeometry args={[0.14, 0.16, 0.14, 32]} /></mesh>
      <group ref={sh} position-y={SH}>
        {hinge(0.1, 0.28)}
        <mesh position-y={L1 / 2} material={m.a} {...s}><boxGeometry args={[0.13, L1, 0.13]} /></mesh>
        <group ref={el} position-y={L1}>
          {hinge(0.085, 0.24)}
          <mesh position-y={L2 / 2} material={m.a} {...s}><boxGeometry args={[0.1, L2, 0.1]} /></mesh>
          <group ref={wr} position-y={L2}>
            {hinge(0.06, 0.18)}
            <mesh position-y={0.12} material={m.d} {...s}><boxGeometry args={[0.26, 0.04, 0.09]} /></mesh>
            <mesh ref={f1} position-y={L3 - 0.07} material={m.d} {...s}><boxGeometry args={[0.025, 0.14, 0.07]} /></mesh>
            <mesh ref={f2} position-y={L3 - 0.07} material={m.d} {...s}><boxGeometry args={[0.025, 0.14, 0.07]} /></mesh>
            {tip && <group ref={tip} position-y={L3} />}
          </group>
        </group>
      </group>
    </group>
  );
}

// ---------- controller: modes → command; simulated robot → measured state ----------
function Controller({ mode, playing, latency, cmd, act, stats, target, targetMat, tip, box }) {
  const prog = useRef(null), hold = useRef(null), pending = useRef(null), hist = useRef([]);
  const v = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {   // new mode: reset the program and put the box back on pad A
    prog.current = hold.current = pending.current = null;
    box.current.position.set(PADS[0].x, BOX / 2, PADS[0].z);
    box.current.rotation.set(0, PAD_YAW[0], 0);
    stats.current.status = mode === "manual" ? "manual jog" : "";
  }, [mode]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05), now = state.clock.elapsedTime;
    const c = cmd.current, a = act.current;

    // 1. COMMAND from the active mode
    if (mode === "ik" && target.current) {
      target.current.getWorldPosition(v);
      const { q, reach } = solveIK(v);
      c.splice(0, 4, ...q);
      targetMat.current.color.set(reach ? "#22c55e" : "#ef4444");
      stats.current.status = reach ? "target reachable" : "out of reach / joint limit";
    }
    if (mode === "program" && playing) {
      let p = prog.current ??= { from: 0, steps: makeSteps(PADS[0], PADS[1]), i: -1, k: 1, dur: 1, cycleStart: now };
      p.k += dt / p.dur;
      if (p.k >= 1) {
        const done = p.steps[p.i];
        if (done?.event) pending.current = done.event;
        if (++p.i >= p.steps.length) {                       // cycle finished: swap pads and go again
          stats.current.cycles++;
          stats.current.cycleTime = now - p.cycleStart;
          p.cycleStart = now;
          p.from = 1 - p.from;
          p.steps = makeSteps(PADS[p.from], PADS[1 - p.from]);
          p.i = 0;
        }
        const s = p.steps[p.i];
        p.q0 = c.slice();
        p.q1 = s.t ? solveIK(new THREE.Vector3(...s.t)).q : c.slice(0, 4);
        p.g0 = c[4]; p.g1 = s.grip; p.k = 0; p.dur = s.dur;
        stats.current.status = `cycle ${stats.current.cycles + 1} · step ${p.i + 1}/${p.steps.length}`;
      }
      const k = ease(p.k);                                    // joint-space interpolation
      for (let i = 0; i < 4; i++) c[i] = p.q0[i] + (p.q1[i] - p.q0[i]) * k;
      c[4] = p.g0 + (p.g1 - p.g0) * k;
    }

    // 2. ROBOT: follows the command after a network delay, with a speed limit (rad/s)
    hist.current.push([now, c.slice()]);
    while (hist.current.length > 2 && hist.current[1][0] <= now - latency) hist.current.shift();
    const delayed = hist.current[0][1];
    for (let i = 0; i < 5; i++) {
      const step = (delayed[i] - a[i]) * (1 - Math.exp(-dt * 8));
      a[i] += THREE.MathUtils.clamp(step, -2.2 * dt, 2.2 * dt);
    }

    // 3. TWIN: grab/release when the MEASURED gripper actually closes/opens; carried box follows the measured tool
    if (pending.current === "grab" && a[4] > 0.85) {
      tip.current.getWorldPosition(v);
      hold.current = { offset: box.current.position.clone().sub(v), yaw: box.current.rotation.y - a[0] };
      pending.current = null;
    }
    if (pending.current === "release" && a[4] < 0.4) {
      hold.current = pending.current = null;
      box.current.position.y = BOX / 2;
    }
    if (hold.current) {
      tip.current.getWorldPosition(v);
      box.current.position.copy(v).add(hold.current.offset);
      box.current.rotation.y = a[0] + hold.current.yaw;
    }
  });
  return null;
}

// ---------- telemetry: chart + readouts, drawn straight to the DOM (no React re-renders) ----------
function Telemetry({ cmd, act, tip, stats, chart, text }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  const hist = useRef([]), last = useRef(0);
  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (now - last.current < 1 / 30 || !chart.current) return;    // 30 Hz is plenty for a chart
    last.current = now;
    hist.current.push(act.current.slice(0, 4));
    if (hist.current.length > 240) hist.current.shift();

    const g = chart.current.getContext("2d"), W = chart.current.width, H = chart.current.height;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = "rgba(148,163,184,.35)";
    g.lineWidth = 1;
    for (const deg of [-90, 0, 90]) { const y = H / 2 - (deg / 180) * (H / 2); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    JOINTS.forEach((j, k) => {
      g.strokeStyle = j.color;
      g.lineWidth = 1.6;
      g.beginPath();
      hist.current.forEach((q, i) => { const x = (i / 239) * W, y = H / 2 - (q[k] / Math.PI) * (H / 2); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    });

    tip.current.getWorldPosition(v);
    const err = Math.max(...[0, 1, 2, 3].map((i) => Math.abs(cmd.current[i] - act.current[i]))) * R2D;
    const mm = (n) => (n * 1000).toFixed(0).padStart(5, " ");
    const s = stats.current;
    text.current.innerHTML =
      `<div style="display:grid;grid-template-columns:1fr 1fr">` +
      JOINTS.map((j, i) => `<span><span style="color:${j.color}">●</span> ${j.name} ${(act.current[i] * R2D).toFixed(1)}°</span>`).join("") +
      `</div>Tool x${mm(v.x)} y${mm(v.y)} z${mm(v.z)} mm<br>Gripper ${(act.current[4] * 100).toFixed(0)}% closed` +
      `<br>Tracking error <b style="color:${err > 5 ? "#ef4444" : "inherit"}">${err.toFixed(1)}°</b> · ${s.status}` +
      (s.cycles ? `<br>Cycles ${s.cycles} · last ${s.cycleTime.toFixed(1)} s` : "");
  });
  return null;
}

export default function App() {
  const home = useMemo(() => [...solveIK(new THREE.Vector3(0, 0.7, 0.9)).q, 0], []);
  const cmd = useRef(home.slice()), act = useRef(home.slice());
  const stats = useRef({ status: "", cycles: 0, cycleTime: 0 });
  const tip = useRef(), box = useRef(), target = useRef(), targetMat = useRef(), chart = useRef(), text = useRef();
  const [mode, setMode] = useState("program");
  const [playing, setPlaying] = useState(true);
  const [latency, setLatency] = useState(0.15);
  const [ghost, setGhost] = useState(true);
  const [manual, setManual] = useState(home);

  const switchMode = (m) => { if (m === "manual") setManual(cmd.current.slice()); setMode(m); };
  const jog = (i, val) => { const q = manual.slice(); q[i] = val; setManual(q); cmd.current[i] = val; };

  return (
    <>
      <Canvas shadows="percentage" camera={{ position: [0.4, 1.9, 3.6], fov: 45 }}>
        <color attach="background" args={["#eef2f7"]} />
        <Environment preset="warehouse" environmentIntensity={0.6} />
        <directionalLight position={[3, 5, 2]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <Arm src={act} tip={tip} />
        {ghost && <Arm src={cmd} ghost />}
        {PADS.map((p, i) => (
          <mesh key={i} position={[p.x, 0.005, p.z]} receiveShadow>
            <cylinderGeometry args={[0.16, 0.16, 0.01, 40]} />
            <meshStandardMaterial color={i ? "#bae6fd" : "#bbf7d0"} />
          </mesh>
        ))}
        <mesh ref={box} castShadow><boxGeometry args={[BOX, BOX, BOX]} /><meshStandardMaterial color="#8b5cf6" /></mesh>
        {mode === "ik" && (
          <TransformControls position={[0.5, 0.35, 0.8]} size={0.6}>
            <mesh ref={target}><sphereGeometry args={[0.04]} /><meshBasicMaterial ref={targetMat} color="#22c55e" /></mesh>
          </TransformControls>
        )}
        <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[10, 10]} /><shadowMaterial opacity={0.18} /></mesh>
        <Grid args={[10, 10]} cellSize={0.25} sectionSize={1} cellColor="#cbd5e1" sectionColor="#94a3b8" fadeDistance={9} infiniteGrid />
        <Controller {...{ mode, playing, latency, cmd, act, stats, target, targetMat, tip, box }} />
        <Telemetry {...{ cmd, act, tip, stats, chart, text }} />
        <OrbitControls makeDefault target={[0, 0.5, 0.3]} />
      </Canvas>

      <div className="overlay" style={{ width: 250 }}>
        <div className="row">{[["program", "Program"], ["ik", "IK target"], ["manual", "Manual"]].map(([id, label]) => (
          <button key={id} className={mode === id ? "on" : ""} onClick={() => switchMode(id)} style={{ fontSize: 12, padding: "4px 9px" }}>{label}</button>
        ))}</div>
        {mode === "program" && <button onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Run"} pick &amp; place</button>}
        {mode === "ik" && <div className="muted" style={{ fontSize: 12 }}>Drag the gizmo's arrows: the arm solves IK every frame. Red = unreachable.</div>}
        {mode === "manual" && JOINTS.map((j, i) => (
          <label key={j.name} style={{ fontSize: 12 }}>
            <span style={{ color: j.color }}>●</span> {j.name} {Math.round(manual[i] * R2D)}°
            <input type="range" min={j.min} max={j.max} value={Math.round(manual[i] * R2D)} onChange={(e) => jog(i, +e.target.value * D2R)} style={{ width: "100%" }} />
          </label>
        ))}
        {mode === "manual" && (
          <label style={{ fontSize: 12 }}>Gripper {Math.round(manual[4] * 100)}%
            <input type="range" min="0" max="100" value={Math.round(manual[4] * 100)} onChange={(e) => jog(4, +e.target.value / 100)} style={{ width: "100%" }} />
          </label>
        )}
        <label style={{ fontSize: 12 }}>Network latency
          <select value={latency} onChange={(e) => setLatency(+e.target.value)} style={{ marginLeft: 6 }}>
            {[0, 0.15, 0.5, 1].map((l) => <option key={l} value={l}>{l * 1000} ms</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} /> Show commanded pose (ghost)</label>
      </div>

      <div className="overlay right bottom" style={{ width: 270, fontSize: 11.5, lineHeight: 1.5 }}>
        <canvas ref={chart} width="250" height="80" style={{ width: "100%", height: 80 }} />
        <div ref={text} style={{ fontVariantNumeric: "tabular-nums" }} />
      </div>
    </>
  );
}
```

Switch the latency to 1000 ms and watch the solid arm trail the blue ghost: that gap is exactly what a twin operator sees when a network is slow, and why the box is grabbed only when the **measured** gripper closes.

## How it works

| Feature | Technique |
|---|---|
| kinematic chain | nested groups; each joint's group sits at the end of the previous link, so FK is just `rotation` + `getWorldPosition()` |
| link pivots | links are offset by half their length inside their joint group, so they rotate about their end |
| IK | base yaw by `atan2`; shoulder and elbow by the law of cosines in the arm's plane; wrist = 180° − shoulder − elbow; joint limits clamped and flagged |
| IK target | drei `TransformControls` around a sphere (with `OrbitControls makeDefault`, dragging the gizmo pauses orbiting automatically) |
| program | a list of steps (target, gripper, duration, event) run by a small **state machine** in `useFrame`; poses interpolated in **joint space** with smoothstep easing |
| real robot | command history buffer for **latency**, exponential approach plus a **velocity limit** for the drives |
| twin semantics | solid arm = measured state, ghost = command; events (grab/release) fire on **measured** gripper state, not on the command |
| carried object | at grab time store the box's offset from the tool tip, then copy tool position + offset every frame (no re-parenting fights with React) |
| telemetry | written directly to a `<canvas>` and `innerHTML` at 30 Hz from `useFrame`: high-frequency data never goes through React state |

:::warn Real robots need real safety
A web twin is for visualisation, planning and monitoring. Commands to physical robots must go through the robot controller's safety system (speed and separation monitoring, e-stops, certified safety PLCs). Never let a browser drive motors directly.
:::

:::exercise Extend it
1. Connect to a **real data stream**: replace the simulated robot with WebSocket messages (`{t, q:[...]}`) from a ROS 2 bridge (`rosbridge_suite` + `roslibjs`) or an MQTT broker, and keep the same twin rendering.
2. Add **Cartesian (straight-line) moves**: interpolate the *tool position* and solve IK at each frame, instead of interpolating joint angles. Compare the paths by drawing both with `Line`.
3. Add **collision checking**: warn when the tool goes below the floor or the forearm enters a "keep-out" box (use `Box3.intersectsBox` on link bounds).
4. **Record and replay** a shift: store timestamped joint states, then scrub through them with a timeline slider (see Lesson 6.3).
5. Load a **URDF** robot (Lesson 6.3's T12) and drive its joints from the same controller with `robot.setJointValue()`.
:::

:::keypoints
- A robot arm is a **chain of groups**; forward kinematics comes free from the scene graph.
- Analytic IK for a 2-link arm is the **law of cosines** plus `atan2`; add base yaw and a decoupled wrist for a 4-axis arm.
- Run motion programs as a **state machine** in the frame loop; joint-space interpolation is simple, Cartesian is straighter.
- A twin shows **commanded vs measured** state; simulate latency and limits to design for reality.
- Keep high-frequency telemetry **out of React state**: draw directly to canvas/DOM from `useFrame`.
:::
