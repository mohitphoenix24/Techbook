---
title: Games on the Web
level: intermediate
time: 40
summary: Why browser games are thriving, the architecture of a three.js game (loop, state machine, entities, input, collisions, audio), a complete playable endless-dodge game, entity-component systems, multiplayer options, distribution on web game portals, and choosing between three.js, PlayCanvas, Babylon.js, Needle and exporting from game engines.
---

A browser game starts in a second from a link, needs no install, runs on phones, laptops and headsets, and can be shared in a chat message. That's why web games, from tiny ad-supported portal games to award-winning experiences like Abeto's *Messenger* (a multiplayer three.js world that loads in under 6 MB) and Bruno Simon's drivable portfolio, are a vibrant part of the three.js world. Games also teach every real-time skill there is: loops, input, physics, animation, audio, performance.

## The anatomy of a game

| Part | Job | In this course |
|---|---|---|
| **game loop** | update simulation, then render, every frame (fixed or variable timestep) | `useFrame` / `setAnimationLoop` + delta |
| **state machine** | menu → playing → paused → game over | React state or a store |
| **entities** | player, enemies, pickups, projectiles | objects, instances, or an ECS |
| **input** | keyboard, mouse, touch, gamepad, XR controllers | `KeyboardControls`, pointer events, Gamepad API |
| **collisions & physics** | hits, pickups, solid walls | simple AABB/sphere tests, or Rapier |
| **camera** | follow, shake, framing | damping, CameraControls |
| **feedback ("juice")** | particles, screen shake, sound, hit-stop, easing | particles, maath, Web Audio |
| **persistence** | high scores, progress | `localStorage`, a backend |

## A complete game: Neon Dodge

Steer with **← →** (or A/D, or by moving the mouse/finger), dodge the blocks, collect the green orbs. Speed increases over time. Click the scene first so it receives key presses.

```jsx run title="Neon Dodge — a complete little game" level=intermediate height=520
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { create } from "zustand";
import { easing } from "maath";

// ---------- game state (store) ----------
const useGame = create((set) => ({
  phase: "menu",                 // menu | playing | over
  score: 0, best: 0,
  start: () => set({ phase: "playing", score: 0 }),
  end: () => set((s) => ({ phase: "over", best: Math.max(s.best, Math.floor(s.score)) })),
}));

// ---------- input: keys + pointer, stored outside React ----------
const input = { left: false, right: false, pointerX: null };
function useInput() {
  useEffect(() => {
    const key = (down) => (e) => {
      if (["ArrowLeft", "KeyA"].includes(e.code)) input.left = down;
      if (["ArrowRight", "KeyD"].includes(e.code)) input.right = down;
      if (down && e.code === "Space" && useGame.getState().phase !== "playing") useGame.getState().start();
    };
    const kd = key(true), ku = key(false);
    const pm = (e) => (input.pointerX = (e.clientX / innerWidth) * 2 - 1);
    addEventListener("keydown", kd); addEventListener("keyup", ku); addEventListener("pointermove", pm);
    return () => { removeEventListener("keydown", kd); removeEventListener("keyup", ku); removeEventListener("pointermove", pm); };
  }, []);
}

const LANE = 3.2, POOL = 40;

function World() {
  const player = useRef(), obstacles = useRef(), orbs = useRef(), floor = useRef();
  const dummy = useRef(new THREE.Object3D()).current;
  // entity pools: fixed arrays reused forever (no garbage during play)
  const state = useRef({
    speed: 8, t: 0,
    blocks: Array.from({ length: POOL }, () => ({ x: 0, z: -999, w: 1 })),
    gems: Array.from({ length: 12 }, () => ({ x: 0, z: -999, taken: true })),
    spawn: 0, gemSpawn: 0,
  }).current;

  const reset = () => {
    state.speed = 8; state.t = 0; state.spawn = 0; state.gemSpawn = 0;
    state.blocks.forEach((b) => (b.z = -999)); state.gems.forEach((g) => { g.z = -999; g.taken = true; });
    player.current.position.x = 0;
  };
  useEffect(() => useGame.subscribe((s, prev) => { if (s.phase === "playing" && prev.phase !== "playing") reset(); }), []);

  useFrame(({ camera }, dt) => {
    dt = Math.min(dt, 1 / 30);
    const playing = useGame.getState().phase === "playing";
    const p = player.current.position;

    if (playing) {
      // --- input → player movement (damped, clamped to the track)
      let target = p.x + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 9 * dt;
      if (input.pointerX != null && !input.left && !input.right) target = input.pointerX * LANE;
      p.x = THREE.MathUtils.clamp(THREE.MathUtils.damp(p.x, target, 14, dt), -LANE, LANE);
      player.current.rotation.z = THREE.MathUtils.damp(player.current.rotation.z, (target - p.x) * -0.3, 8, dt);

      // --- difficulty and spawning
      state.t += dt;
      state.speed = 8 + state.t * 0.6;
      state.spawn -= dt; state.gemSpawn -= dt;
      if (state.spawn <= 0) {
        const b = state.blocks.find((b) => b.z > 5 || b.z === -999);
        if (b) { b.x = (Math.random() * 2 - 1) * LANE; b.w = 0.6 + Math.random() * 1.4; b.z = -60; }
        state.spawn = Math.max(0.18, 0.7 - state.t * 0.01);
      }
      if (state.gemSpawn <= 0) {
        const g = state.gems.find((g) => g.taken || g.z > 5);
        if (g) { g.x = (Math.random() * 2 - 1) * LANE; g.z = -60; g.taken = false; }
        state.gemSpawn = 1.3;
      }

      // --- move entities and test collisions (simple AABB in x/z)
      for (const b of state.blocks) {
        if (b.z === -999) continue;
        b.z += state.speed * dt;
        if (Math.abs(b.z - p.z) < 0.6 && Math.abs(b.x - p.x) < b.w / 2 + 0.35) useGame.getState().end();
      }
      for (const g of state.gems) {
        if (g.taken) continue;
        g.z += state.speed * dt;
        if (Math.abs(g.z - p.z) < 0.6 && Math.abs(g.x - p.x) < 0.6) { g.taken = true; useGame.setState((s) => ({ score: s.score + 10 })); }
      }
      useGame.setState((s) => ({ score: s.score + dt * state.speed * 0.5 }));
    }

    // --- write entity pools into instanced meshes (one draw call each)
    state.blocks.forEach((b, i) => {
      dummy.position.set(b.x, 0.5, b.z); dummy.scale.set(b.w, 1, 1); dummy.updateMatrix();
      obstacles.current.setMatrixAt(i, dummy.matrix);
    });
    obstacles.current.instanceMatrix.needsUpdate = true;
    state.gems.forEach((g, i) => {
      dummy.position.set(g.x, 0.6 + Math.sin(state.t * 6 + i) * 0.15, g.z); dummy.scale.setScalar(g.taken ? 0 : 1); dummy.rotation.set(0, state.t * 3, 0); dummy.updateMatrix();
      orbs.current.setMatrixAt(i, dummy.matrix);
    });
    orbs.current.instanceMatrix.needsUpdate = true;
    dummy.rotation.set(0, 0, 0);

    // --- scrolling floor texture and a camera that leans with the player
    floor.current.material.map.offset.y -= (playing ? state.speed : 2) * dt * 0.05;
    easing.damp3(camera.position, [p.x * 0.4, 3.2, 6.5], 0.25, dt);
    camera.lookAt(p.x * 0.3, 0.5, -6);
  });

  const grid = useRef((() => {                      // a neon grid texture drawn on a canvas
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"); g.fillStyle = "#0b0420"; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#a21caf"; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 40); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })()).current;

  return (
    <>
      <mesh ref={player} position={[0, 0.4, 2]}>
        <coneGeometry args={[0.35, 0.9, 4]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.8} />
      </mesh>
      <instancedMesh ref={obstacles} args={[undefined, undefined, POOL]}>
        <boxGeometry /><meshStandardMaterial color="#f43f5e" emissive="#be123c" emissiveIntensity={0.6} />
      </instancedMesh>
      <instancedMesh ref={orbs} args={[undefined, undefined, 12]}>
        <icosahedronGeometry args={[0.28, 0]} /><meshStandardMaterial color="#4ade80" emissive="#16a34a" emissiveIntensity={1} />
      </instancedMesh>
      <mesh ref={floor} rotation-x={-Math.PI / 2} position={[0, 0, -25]}>
        <planeGeometry args={[LANE * 2 + 1.5, 80]} /><meshBasicMaterial map={grid} />
      </mesh>
    </>
  );
}

function HUD() {
  const { phase, score, best, start } = useGame();
  return (
    <>
      <div className="overlay right"><b style={{ fontSize: 20 }}>{Math.floor(score)}</b><small className="muted">best {best}</small></div>
      {phase !== "playing" && (
        <div className="overlay" style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)", alignItems: "center", textAlign: "center" }}>
          <b style={{ fontSize: 22 }}>{phase === "over" ? "Game over" : "Neon Dodge"}</b>
          <span className="muted">← → / A D / mouse to steer · collect green orbs</span>
          <button className="primary" onClick={start}>{phase === "over" ? "Play again" : "Start"} (Space)</button>
        </div>
      )}
    </>
  );
}

export default function App() {
  useInput();
  return (
    <>
      <Canvas camera={{ position: [0, 3.2, 6.5], fov: 60 }}>
        <color attach="background" args={["#05010f"]} />
        <fog attach="fog" args={["#05010f", 20, 60]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 5, 4]} intensity={1.2} />
        <World />
      </Canvas>
      <HUD />
    </>
  );
}
```

Patterns worth noticing, because they scale to bigger games:

- **Object pools**: blocks and orbs are fixed arrays reused forever; nothing is created or garbage-collected during play, so no stutters.
- **Instanced rendering**: 40 obstacles are one draw call; the simulation writes matrices each frame.
- **Input outside React**: key and pointer state live in a plain object read by the loop.
- **One store for game state**: the HUD subscribes to score and phase; the loop updates them. (For heavy games, throttle score updates to a few per second.)
- **Difficulty curve**: speed and spawn rate are functions of elapsed time, the simplest way to keep a game engaging.

## Entity-component systems

As games grow, "a component per enemy" gets messy. An **ECS** stores entities as plain data (components) and runs **systems** over all entities that have certain components: a movement system, a collision system, a render system. In the R3F world, **koota** and **miniplex** are lightweight ECS libraries that integrate with React; **bitECS** is a very fast, data-oriented option.

```js
// miniplex-style sketch
const world = new World();
world.add({ position: { x: 0, z: -60 }, velocity: { z: 12 }, obstacle: true });
const moving = world.with("position", "velocity");
function movementSystem(dt) { for (const e of moving) e.position.z += e.velocity.z * dt; }
```

## Multiplayer

| Need | Options |
|---|---|
| rooms, authoritative server state | **Colyseus**, **PartyKit/Cloudflare Durable Objects**, Nakama, a Node WebSocket server |
| peer-to-peer, low latency | **WebRTC** data channels (via a signalling server) |
| shared state for casual/co-op experiences | Yjs/CRDTs, Liveblocks, Supabase Realtime |
| what to sync | inputs or compact state at 10–30 Hz; interpolate remote players between updates; never trust the client for scoring |

## Audio

Sound is half of game feel. Use the **Web Audio API** directly, **Howler.js**, or three.js's `AudioListener` + `PositionalAudio` (drei `<PositionalAudio>`) for 3D-positioned sound. Browsers only start audio after a user gesture, so unlock it on the first click ("Start").

## Distribution and business

Web game **portals** (Poki, CrazyGames, itch.io and others) host thousands of three.js and engine-exported games and share ad revenue; other paths are sponsorships, premium unlocks, branded games for marketing campaigns (a common agency job), and PWAs on desktop and app stores. Portal guidelines usually ask for: fast loading (a few MB to first play), mobile support, no external links, and an SDK for ads and analytics.

## Which technology for a game?

| Choice | Strengths | Consider when |
|---|---|---|
| **three.js / R3F** | total control, smallest runtime, huge ecosystem, React UI | stylised or custom games, games inside React sites, marketing games |
| **PlayCanvas** | a full engine with a collaborative online editor, great mobile performance | team game production with designers in an editor |
| **Babylon.js** | batteries-included engine (physics, GUI, inspector, XR) | teams wanting an engine-style API with official tooling |
| **Needle Engine** | Unity/Blender editor workflow exporting to a three.js-based runtime | Unity-trained teams targeting the web and WebXR |
| **Godot / Unity / Unreal web export** | full desktop engines | ports of existing games; accept larger downloads (WebAssembly runtimes) |

:::ai
AI is changing small-team game production: generated 3D assets (next lessons), AI-assisted level design, LLM-driven characters that hold conversations, and coding assistants that write game systems quickly. The technical constraints don't change: assets still need optimising, NPC dialogue needs guardrails and latency hiding, and the game loop must hold 60 fps.
:::

## Check yourself

```quiz
? Why use object pools for obstacles?
+ Reusing entities avoids creating garbage during play, which causes collection pauses (stutter)
- Pools render faster than meshes
- React requires it
> Allocate once, reuse forever.

? Where should keyboard state live in a fast game loop?
+ In a plain object updated by event listeners and read in useFrame
- In React state updated on every keydown
- In the URL
> No re-renders for input.

? What is an ECS?
+ Entities as data components, processed by systems that act on all matching entities
- An effect composer for shaders
- A physics engine
> It keeps large games organised and fast.

? How should a multiplayer game handle scoring?
+ The server is authoritative; never trust client-reported scores
- Each client reports its own score
- Scores are stored in localStorage
> Clients can be modified by cheaters.

? Why must web game audio start after a user gesture?
+ Browsers block autoplaying audio until the user interacts
- Web Audio needs WebGL first
- Audio files load slowly
> Unlock audio on the first click or tap.
```

:::exercise Lives and shields
Give the player 3 lives instead of instant game over: hitting a block removes a life, makes the player blink for 1.5 seconds of invulnerability, and only ends the game at 0 lives. Show lives as hearts in the HUD.
:::

:::solution
```js run
// The core of the change, as testable game logic (state machine for invulnerability)
function createLives({ lives = 3, invulnerableFor = 1.5 } = {}) {
  let left = lives, shield = 0;
  return {
    update(dt) { shield = Math.max(0, shield - dt); },
    hit() {
      if (shield > 0 || left === 0) return { lives: left, over: left === 0, ignored: true };
      left -= 1; shield = invulnerableFor;
      return { lives: left, over: left === 0, ignored: false };
    },
    visible(time) { return shield === 0 || Math.floor(time * 10) % 2 === 0; },   // blink at 5 Hz while shielded
    get lives() { return left; },
  };
}

// simulate: hits at t = 1.0, 1.2 (ignored, shielded), 3.0 and 5.0
const p = createLives();
let t = 0;
for (const hitAt of [1.0, 1.2, 3.0, 5.0]) {
  while (t < hitAt) { p.update(0.1); t = +(t + 0.1).toFixed(1); }
  const r = p.hit();
  console.log(`t=${hitAt}s`, r.ignored ? "hit ignored (shield)" : `hit! lives left ${r.lives}`, r.over ? "→ GAME OVER" : "");
}
console.log("HUD:", "❤".repeat(p.lives) || "(no lives)");
// In the game: call lives.update(dt) each frame, replace end() with lives.hit(), and set
// player.visible = lives.visible(state.t); end() when hit() returns over: true.
```
:::

:::keypoints
- A game = loop + state machine + entities + input + collisions + camera + feedback + persistence.
- Use **pools** and **instancing**, keep **input outside React**, and drive difficulty from time.
- Scale up with an **ECS** (koota, miniplex, bitECS); add **Rapier** for real physics.
- Multiplayer: an authoritative server (Colyseus, PartyKit) or WebRTC; interpolate remote state.
- Unlock **audio** on first interaction; ship small for portals and phones.
- Pick the stack by team and game: three.js/R3F, PlayCanvas, Babylon, Needle, or engine exports.
:::
