---
title: Marble Maze (Physics Game)
level: intermediate
time: 60
icon: target
cover: #0ea5e9,#78716c
tags: "@react-three/rapier, kinematic bodies, sensors, CCD, ASCII level data, InstancedMesh, game state, keyboard + pointer input"
summary: A tilt-the-board marble game in the spirit of the classic wooden labyrinth. Levels are written as ASCII maps and turned into colliders and instanced meshes. A kinematic board tilts under keyboard or drag input and a physics marble rolls with CCD. Holes respawn the marble with a fall penalty, a sensor detects the goal, and the game tracks a timer, best times and multiple levels.
---

Physics games are a great way to learn a physics engine, because the feel of the game *is* the physics. Here the player never touches the marble: they tilt the board, and the engine does the rest. The same structure (data-driven levels, kinematic bodies, sensors, a small state machine) underlies most web games.

:::flow How it fits together
Level data | ASCII rows: `#` wall, `.` floor, `O` hole, `S` start, `G` goal
Build | each cell → a collider on ONE kinematic board body + an instance in an InstancedMesh
Input | keys or pointer drag → target tilt → eased tilt → `setNextKinematicRotation`
Physics | the dynamic marble rolls under gravity; CCD stops tunnelling through thin floors
Rules | fell below the board → respawn + 1 fall; goal sensor → win, time, best time
:::

## Step 1: A kinematic board moves a dynamic marble

Rotate a **kinematic** body with `setNextKinematicRotation` and Rapier gives it the matching angular velocity, so friction drags the marble along. Here the board wobbles on its own:

```jsx run title="Step 1 · A tilting kinematic board" height=380
import { Suspense, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";

function Board() {
  const body = useRef();
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    body.current.setNextKinematicRotation(q.setFromEuler(e.set(Math.sin(t) * 0.15, 0, Math.cos(t) * 0.15)));
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false}>
      <CuboidCollider args={[3, 0.1, 3]} position={[0, -0.1, 0]} />
      {[[0, 3.1, 3, 0.1], [0, -3.1, 3, 0.1], [3.1, 0, 0.1, 3], [-3.1, 0, 0.1, 3]].map(([x, z, w, d], i) => (
        <CuboidCollider key={i} args={[w, 0.3, d]} position={[x, 0.2, z]} />
      ))}
      <mesh receiveShadow position-y={-0.1}><boxGeometry args={[6, 0.2, 6]} /><meshStandardMaterial color="#d6d3d1" /></mesh>
      {[[0, 3.1, 6.4, 0.2], [0, -3.1, 6.4, 0.2], [3.1, 0, 0.2, 6], [-3.1, 0, 0.2, 6]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.2, z]} castShadow><boxGeometry args={[w, 0.6, d]} /><meshStandardMaterial color="#78716c" /></mesh>
      ))}
    </RigidBody>
  );
}

export default function App() {
  return (
    <Canvas shadows="percentage" camera={{ position: [0, 8, 7], fov: 40 }}>
      <color attach="background" args={["#e0f2fe"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 8, 3]} intensity={2} castShadow />
      <Suspense fallback={null}>
        <Physics>
          <Board />
          <RigidBody colliders="ball" position={[0, 1, 0]} ccd friction={0.6}>
            <mesh castShadow><sphereGeometry args={[0.3, 32, 16]} /><meshStandardMaterial color="#2563eb" metalness={0.3} roughness={0.25} /></mesh>
          </RigidBody>
        </Physics>
      </Suspense>
    </Canvas>
  );
}
```

## Step 2: The complete game

Step 1's approach has a catch at full size. This maze is 13 m wide, and tilting it about its centre at 1 rad/s moves its edges at up to 6 m/s, enough to launch a marble sitting near an edge into the air. Real labyrinth toys get away with it because they're small. The fix is a classic: **the marble can't tell the difference between a tilted board and tilted gravity**. So keep the board `fixed`, rotate the gravity vector by the inverse of the tilt, and rotate the camera the same way so the player still *sees* the board tilt. The result is identical physics in the board's frame, without the flinging.

Click the game first so it receives key presses, then use the **arrow keys / WASD**, or **drag** on the board to tilt it.

```jsx run title="Marble Maze · complete game" level=intermediate height=600
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider, useRapier } from "@react-three/rapier";
import { Environment } from "@react-three/drei";

// ---------- levels as data ----------
const LEVELS = [
  { name: "Warm-up", map: [
    "#############",
    "#S....#.....#",
    "#.###.#.###.#",
    "#...#...#...#",
    "###.#####.###",
    "#...#O..#...#",
    "#.###.#.#.#.#",
    "#.....#...#.#",
    "#.#######.#.#",
    "#.......O.#G#",
    "#############"] },
  { name: "Swiss cheese", map: [
    "#############",
    "#S..O....O..#",
    "#..O..O.....#",
    "#.O...O.O.O.#",
    "#...O.....O.#",
    "#.O...O.O...#",
    "#...O...O.O.#",
    "#.O..O.O....#",
    "#...O.....O.#",
    "#.O...O..O.G#",
    "#############"] },
];
const MAX_TILT = 0.24;   // radians (≈ 14°)
const CAM = new THREE.Vector3(-1.6, 16, 7), LOOK = new THREE.Vector3(-1.6, 0, 0.3);

function parse(map) {
  const H = map.length, W = map[0].length, L = { walls: [], floor: [], holes: [], W, H };
  map.forEach((row, r) => [...row].forEach((ch, c) => {
    const p = [c - (W - 1) / 2, 0, r - (H - 1) / 2];       // one cell = 1 m, board centred on the origin
    if (ch === "#") L.walls.push(p);
    else if (ch === "O") L.holes.push(p);
    else {
      L.floor.push(p);
      if (ch === "S") L.start = p;
      if (ch === "G") L.goal = p;
    }
  }));
  return L;
}

// ---------- best times (localStorage can be blocked: always try/catch) ----------
const loadBest = () => { try { return JSON.parse(localStorage.getItem("marble-best") || "{}"); } catch { return {}; } };
const saveBest = (b) => { try { localStorage.setItem("marble-best", JSON.stringify(b)); } catch {} };

// many identical boxes → one draw call
function Boxes({ items, size, y, color }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    items.forEach((p, i) => ref.current.setMatrixAt(i, m.makeTranslation(p[0], y, p[2])));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [items, y]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </instancedMesh>
  );
}

// Tilting a 13 m board about its centre would move its edges at metres per second and launch
// the marble. Equivalent and calm: keep the board still, tilt GRAVITY, and counter-rotate the camera.
function Tilt({ input }) {
  const { world } = useRapier();
  const tilt = useRef({ x: 0, z: 0 });
  const t = useMemo(() => ({ q: new THREE.Quaternion(), e: new THREE.Euler(), g: new THREE.Vector3(), look: new THREE.Vector3() }), []);
  useFrame((state, dt) => {
    const k = 1 - Math.exp(-dt * 6);                                   // ease towards the target tilt
    tilt.current.x += (input.current.z * MAX_TILT - tilt.current.x) * k; // +z input (towards camera) lowers the near edge
    tilt.current.z += (-input.current.x * MAX_TILT - tilt.current.z) * k; // +x input lowers the right edge
    // the board's tilt, inverted: how the world looks from the board's point of view
    t.q.setFromEuler(t.e.set(tilt.current.x, 0, tilt.current.z)).invert();
    t.g.set(0, -9.81, 0).applyQuaternion(t.q);
    world.gravity = { x: t.g.x, y: t.g.y, z: t.g.z };
    state.camera.position.copy(CAM).applyQuaternion(t.q);
    state.camera.up.set(0, 1, 0).applyQuaternion(t.q);
    state.camera.lookAt(t.look.copy(LOOK).applyQuaternion(t.q));
  });
  return null;
}

function Board({ level, onGoal }) {
  const [gx, , gz] = level.goal, [sx, , sz] = level.start;
  return (
    <RigidBody type="fixed" colliders={false}>
      {level.floor.map((p, i) => <CuboidCollider key={"f" + i} args={[0.5, 0.1, 0.5]} position={[p[0], -0.1, p[2]]} friction={0.6} />)}
      {level.walls.map((p, i) => <CuboidCollider key={"w" + i} args={[0.5, 0.35, 0.5]} position={[p[0], 0.25, p[2]]} friction={0.2} />)}
      <CuboidCollider sensor args={[0.25, 0.3, 0.25]} position={[gx, 0.3, gz]} onIntersectionEnter={onGoal} />
      <Boxes items={level.floor} size={[0.98, 0.2, 0.98]} y={-0.1} color="#e7e5e4" />
      <Boxes items={level.walls} size={[1, 0.7, 1]} y={0.25} color="#57534e" />
      <mesh position={[gx, 0.005, gz]} rotation-x={-Math.PI / 2}><ringGeometry args={[0.2, 0.42, 40]} /><meshBasicMaterial color="#16a34a" /></mesh>
      <mesh position={[sx, 0.005, sz]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.4, 40]} /><meshBasicMaterial color="#bae6fd" /></mesh>
      {level.holes.map((p, i) => (
        <mesh key={i} position={[p[0], -0.19, p[2]]} rotation-x={-Math.PI / 2}><ringGeometry args={[0.42, 0.5, 32]} /><meshBasicMaterial color="#292524" /></mesh>
      ))}
    </RigidBody>
  );
}

// watches the marble every frame: falls, respawns, timer display
function Referee({ marble, level, status, startedAt, clock, onFall }) {
  useFrame(() => {
    const m = marble.current;
    if (!m) return;
    if (m.translation().y < -3) {
      const [x, , z] = level.start;
      m.setTranslation({ x, y: 0.6, z }, true);
      m.setLinvel({ x: 0, y: 0, z: 0 }, true);
      m.setAngvel({ x: 0, y: 0, z: 0 }, true);
      onFall();
    }
    if (status.current === "playing") clock.current.textContent = ((performance.now() - startedAt.current) / 1000).toFixed(2) + " s";
  });
  return null;
}

export default function App() {
  const [levelIdx, setLevelIdx] = useState(0);
  const [run, setRun] = useState(0);                 // bump to restart
  const [phase, setPhase] = useState("ready");       // ready → playing → won
  const [falls, setFalls] = useState(0);
  const [result, setResult] = useState(null);
  const [best, setBest] = useState(loadBest);
  const level = useMemo(() => parse(LEVELS[levelIdx].map), [levelIdx]);

  const marble = useRef(), input = useRef({ x: 0, z: 0 }), keys = useRef(new Set());
  const status = useRef("ready"), startedAt = useRef(0), clock = useRef(), fallsRef = useRef(0);
  const setStatus = (s) => { status.current = s; setPhase(s); };
  const startIfReady = () => { if (status.current === "ready") { startedAt.current = performance.now(); setStatus("playing"); } };

  const restart = (idx = levelIdx) => {
    setLevelIdx(idx); setRun((r) => r + 1); setFalls(0); fallsRef.current = 0; setResult(null);
    setStatus("ready"); input.current = { x: 0, z: 0 };
    if (clock.current) clock.current.textContent = "0.00 s";
  };

  // keyboard → input vector
  useEffect(() => {
    const KEYMAP = { ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1] };
    const update = () => {
      let x = 0, z = 0;
      keys.current.forEach((k) => { x += KEYMAP[k][0]; z += KEYMAP[k][1]; });
      input.current = { x: Math.sign(x), z: Math.sign(z) };
    };
    const down = (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (KEYMAP[k]) { e.preventDefault(); keys.current.add(k); update(); startIfReady(); } };
    const up = (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys.current.delete(k); update(); };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); };
  }, []);

  // pointer drag → analogue tilt (distance from the centre of the screen)
  const onPointer = (e) => {
    if (e.buttons !== 1) return;
    const r = e.currentTarget.getBoundingClientRect();
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    input.current = { x: clamp(((e.clientX - r.left) / r.width - 0.5) * 3), z: clamp(((e.clientY - r.top) / r.height - 0.5) * 3) };
    startIfReady();
  };
  const release = () => { if (!keys.current.size) input.current = { x: 0, z: 0 }; };

  const onGoal = useCallback(({ other }) => {
    if (other.rigidBodyObject?.name !== "marble" || status.current !== "playing") return;
    const time = (performance.now() - startedAt.current) / 1000 + fallsRef.current * 5;   // +5 s per fall
    const name = LEVELS[levelIdx].name;
    setBest((b) => {
      const next = !b[name] || time < b[name] ? { ...b, [name]: time } : b;
      saveBest(next);
      return next;
    });
    setResult(time);
    setStatus("won");
  }, [levelIdx]);

  const onFall = useCallback(() => { fallsRef.current++; setFalls(fallsRef.current); }, []);

  return (
    <div style={{ height: "100%", position: "relative", touchAction: "none" }} onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={release} onPointerLeave={release}>
      <Canvas shadows="percentage" camera={{ position: CAM.toArray(), fov: 50 }}>
        <color attach="background" args={["#0c4a6e"]} />
        <Environment preset="apartment" environmentIntensity={0.5} />
        <directionalLight position={[5, 12, 4]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} />
        <Suspense fallback={null}>
          <Physics key={`${levelIdx}-${run}`}>
            <Board level={level} onGoal={onGoal} />
            <Tilt input={input} />
            <RigidBody ref={marble} name="marble" colliders="ball" position={[level.start[0], 0.5, level.start[2]]}
              ccd canSleep={false} friction={0.6} restitution={0.15} linearDamping={0.1} angularDamping={0.2}>
              <mesh castShadow><sphereGeometry args={[0.3, 32, 16]} /><meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.08} /></mesh>
            </RigidBody>
            <Referee {...{ marble, level, status, startedAt, clock, onFall }} />
          </Physics>
        </Suspense>
      </Canvas>

      <div className="overlay" onPointerDown={(e) => e.stopPropagation()} style={{ width: 175 }}>
        <div className="row">{LEVELS.map((l, i) => (
          <button key={l.name} className={i === levelIdx ? "on" : ""} onClick={() => restart(i)} style={{ fontSize: 12, padding: "4px 9px" }}>{i + 1}. {l.name}</button>
        ))}</div>
        <b ref={clock} style={{ fontSize: 24, fontVariantNumeric: "tabular-nums" }}>0.00 s</b>
        <div className="muted" style={{ fontSize: 12 }}>Falls: {falls} (+5 s each)<br />Best: {best[LEVELS[levelIdx].name] ? best[LEVELS[levelIdx].name].toFixed(2) + " s" : "-"}</div>
        <button onClick={() => restart()}>Restart</button>
      </div>
      {phase === "ready" && <div className="overlay bottom" style={{ left: "50%", transform: "translateX(-50%)", fontSize: 13 }}>Arrow keys / WASD, or drag on the board to tilt</div>}

      {phase === "won" && (
        <div onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(15,23,42,.45)" }}>
          <div className="overlay" style={{ position: "static", alignItems: "center", textAlign: "center", padding: 22 }}>
            <div style={{ fontSize: 13 }} className="muted">{LEVELS[levelIdx].name} complete</div>
            <div style={{ fontSize: 34, fontWeight: 800 }}>{result.toFixed(2)} s</div>
            <div className="muted" style={{ fontSize: 12 }}>{falls} falls · best {best[LEVELS[levelIdx].name].toFixed(2)} s</div>
            <div className="row" style={{ marginTop: 6 }}>
              <button onClick={() => restart()}>Play again</button>
              {levelIdx < LEVELS.length - 1 && <button className="primary" onClick={() => restart(levelIdx + 1)}>Next level</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

## How it works

| Feature | Technique |
|---|---|
| levels | ASCII maps parsed into cell lists: designers can edit levels in a text editor, and adding a level is adding an array |
| board | **one** `fixed` body with many `CuboidCollider` children (floor tiles and walls); holes are just missing floor tiles |
| visuals | floors and walls are two `InstancedMesh`es (two draw calls for the whole maze), matched 1:1 with the colliders |
| tilting | input → target tilt → exponential easing → **gravity** rotated by the inverse tilt (`world.gravity`), and the camera rotated the same way, so on screen the board tilts |
| marble | dynamic ball with `ccd` (no tunnelling through the 20 cm floor), friction for rolling, slight damping for control, and `canSleep={false}`: a resting body goes to sleep, and changing gravity alone wouldn't wake it |
| goal | a `sensor` collider on the board; `onIntersectionEnter` checks the other body's `name` |
| falling | a `Referee` checks the marble's height each frame and teleports it back with `setTranslation`/`setLinvel`/`setAngvel` |
| restarting | changing the `Physics` **key** remounts a fresh world: the simplest reliable reset |
| state | React state for what the UI shows (phase, falls, best); **refs** for what callbacks and the frame loop read (status, start time), avoiding stale closures |
| timer | written to the DOM from `useFrame`, not React state |

:::tip Game feel
Tune `MAX_TILT`, the easing rate (`dt * 6`), friction and damping together: a slower tilt feels heavier and more precise; a bigger maximum makes it frantic. Small touches add a lot: a rolling sound whose volume follows the marble's speed, a camera shake on falls, and a particle burst at the goal.
:::

:::exercise Extend it
1. Add **device-orientation** tilt for phones: `DeviceOrientationEvent` `beta`/`gamma` → `input` (iOS needs `DeviceOrientationEvent.requestPermission()` from a tap).
2. Add **checkpoints** (`C` in the map): sensors that update the respawn position.
3. Add **moving obstacles**: a second kinematic body that slides back and forth across a corridor.
4. Add a **level editor**: click cells on a 2D grid to cycle `# . O S G`, preview it live, and share levels via the URL.
5. Add **ghost replays**: record the marble's position every frame during your best run and replay it as a translucent ball.
:::

:::keypoints
- Drive levels from **data**: parse text maps into colliders and instances.
- Move small **kinematic** bodies with `setNextKinematicRotation`; for a large tilting world, rotate **gravity and the camera** instead.
- Use **sensors** for goals and triggers, **CCD** for fast or small bodies, and teleport with `setTranslation` + zeroed velocities.
- Restart by **remounting** the physics world with a new `key`.
- Keep per-frame values in **refs** and DOM, and React state for UI that changes occasionally.
:::
