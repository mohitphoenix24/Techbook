---
title: Characters — Skeletons, Clips & Morph Targets
level: intermediate
time: 35
summary: How skinned characters work, playing glTF animation clips, smooth cross-fades between idle, walk and run, one-shot actions like waving, facial expressions with morph targets, cloning animated characters for crowds, and where to get rigged models.
---

Animated characters bring scenes to life: a guide that waves on a landing page, an avatar in a VR meeting, a worker walking a route in a factory simulation. Characters from Blender, Mixamo or Ready Player Me arrive as glTF files with a **skeleton** and a set of **animation clips**. Three.js's job is to play and blend those clips, and yours is to decide which one plays when.

:::def Skinned mesh & skeleton
A **skeleton** is a hierarchy of invisible **bones** (hips → spine → shoulder → arm → hand). A **skinned mesh** is a mesh whose vertices are attached to one or more bones with weights, so when the bones rotate the skin bends with them. Animating 60 bones is far cheaper than animating 50,000 vertices.
:::

:::def Morph targets (blend shapes)
Alternative versions of a mesh's vertex positions, such as "smile" or "blink". Each has an **influence** from 0 to 1, and the mesh blends between them. Used for facial expressions, lip-sync, and shape changes that bones can't do well.
:::

## Playing and blending clips

`RobotExpressive.glb` has 14 animation clips and three facial morph targets. Click the states to cross-fade between looping animations, fire one-shot emotes, and drag the face sliders:

```js run title="An animation state machine with cross-fades" level=intermediate height=460
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e0f2fe");
scene.fog = new THREE.Fog("#e0f2fe", 20, 60);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.25, 100);
camera.position.set(-7, 3.5, 13);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-2.5, 2.3, 0);                 // aim left of the robot so the UI panel doesn't cover it
scene.add(new THREE.HemisphereLight("#ffffff", "#8d8d8d", 2.5));
const sun = new THREE.DirectionalLight("#ffffff", 2.5);
sun.position.set(0, 20, 10);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: "#cbd5e1" }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
const grid = new THREE.GridHelper(200, 40, "#000000", "#000000");
grid.material.opacity = 0.15;
grid.material.transparent = true;
grid.position.y = 0.01;
scene.add(ground, grid);

const gltf = await new GLTFLoader().loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/RobotExpressive/RobotExpressive.glb");
const robot = gltf.scene;
robot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(robot);

const mixer = new THREE.AnimationMixer(robot);
const actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
console.log("clips:", Object.keys(actions).join(", "));

const LOOPS = ["Idle", "Walking", "Running", "Dance"];
const EMOTES = ["Wave", "Jump", "Yes", "No", "ThumbsUp", "Punch"];
for (const name of EMOTES) {                       // one-shots: play once and hold the last frame
  actions[name].setLoop(THREE.LoopOnce, 1);
  actions[name].clampWhenFinished = true;
}

let current = actions.Idle;
current.play();
function fadeTo(name, duration = 0.4) {
  const next = actions[name];
  if (next === current) return;
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  current.crossFadeTo(next, duration, true);       // true = warp: match the walk/run cycle speeds
  current = next;
}
let loopState = "Idle";
function emote(name) {
  fadeTo(name, 0.2);
  const back = (e) => {                            // when the one-shot finishes, return to the loop
    if (e.action !== actions[name]) return;
    mixer.removeEventListener("finished", back);
    fadeTo(loopState, 0.3);
  };
  mixer.addEventListener("finished", back);
}

// facial expressions are morph targets on the head mesh
const face = robot.getObjectByName("Head_4");
const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<b>State</b><div class="row">${LOOPS.map((n) => `<button data-loop="${n}">${n}</button>`).join("")}</div>
  <b>Emote</b><div class="row">${EMOTES.map((n) => `<button data-emote="${n}">${n}</button>`).join("")}</div>
  <b>Face</b>${Object.keys(face.morphTargetDictionary).map((k) => `<label>${k} <input type="range" min="0" max="1" step="0.01" value="0" data-morph="${k}"></label>`).join("")}`;
document.body.appendChild(ui);
ui.onclick = (e) => {
  const { loop, emote: em } = e.target.dataset;
  if (loop) { loopState = loop; fadeTo(loop); }
  if (em) emote(em);
};
ui.oninput = (e) => {
  const i = face.morphTargetDictionary[e.target.dataset.morph];
  face.morphTargetInfluences[i] = +e.target.value;
};

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  mixer.update(timer.getDelta());
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

### The pieces

| API | What it does |
|---|---|
| `mixer.clipAction(clip)` | creates (or returns the cached) action that plays a clip on this model |
| `action.play()` / `stop()` / `reset()` | start, stop, rewind |
| `action.crossFadeTo(other, seconds, warp)` | blend from one action to another; `warp` adapts speeds so feet don't slide |
| `action.fadeIn(s)` / `fadeOut(s)` | blend weight in or out |
| `action.setEffectiveWeight(w)` | how much this action contributes (0–1) |
| `action.setEffectiveTimeScale(s)` / `timeScale` | playback speed (negative plays backwards) |
| `action.setLoop(THREE.LoopOnce \| LoopRepeat \| LoopPingPong, n)` | loop mode |
| `action.clampWhenFinished = true` | hold the last frame after a `LoopOnce` |
| `mixer.addEventListener("finished" \| "loop", fn)` | react to clips ending or looping |

:::analogy
Think of a DJ mixing two songs. The mixer is the DJ desk, each action is a track, and its **weight** is the volume fader. A **cross-fade** turns one fader down while turning the other up, so the robot's arms move smoothly from the idle pose into the walk instead of snapping.
:::

## Blending by speed

Games rarely switch abruptly between walk and run. They run **both** and set weights from the character's speed, so going from a stroll to a sprint is continuous:

```js
// speed 0 → idle, 0..2 m/s → idle↔walk, 2..6 m/s → walk↔run
const s = THREE.MathUtils.clamp(speed, 0, 6);
idle.setEffectiveWeight(1 - THREE.MathUtils.smoothstep(s, 0, 2));
walk.setEffectiveWeight(THREE.MathUtils.smoothstep(s, 0, 2) * (1 - THREE.MathUtils.smoothstep(s, 2, 6)));
run.setEffectiveWeight(THREE.MathUtils.smoothstep(s, 2, 6));
```

All three actions are playing; only their weights change. Game engines call this a **blend tree**.

## Crowds: cloning animated characters

`model.clone()` doesn't work for skinned meshes: the clones would share one skeleton. `SkeletonUtils.clone()` duplicates bones properly. Each clone then gets its own mixer, so they can play different clips at different times:

```js run title="A crowd from one loaded file" level=intermediate
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1e293b");
scene.fog = new THREE.Fog("#1e293b", 10, 30);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 4, 11);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#cbd5e1", "#334155", 3));
const floor = new THREE.Mesh(new THREE.CircleGeometry(15, 64), new THREE.MeshStandardMaterial({ color: "#475569" }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const gltf = await new GLTFLoader().loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/Soldier.glb");
const clip = (name) => gltf.animations.find((a) => a.name === name);

const walkers = [];
for (let i = 0; i < 12; i++) {
  const soldier = SkeletonUtils.clone(gltf.scene);         // own skeleton per copy
  const radius = 2 + (i % 3) * 2;
  const angle = (i / 12) * Math.PI * 2;
  soldier.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  scene.add(soldier);
  const mixer = new THREE.AnimationMixer(soldier);
  const running = i % 4 === 0;
  const action = mixer.clipAction(clip(running ? "Run" : "Walk"));
  action.time = Math.random() * action.getClip().duration;  // desynchronise: no marching in lockstep
  action.play();
  walkers.push({ soldier, mixer, radius, angle, speed: (running ? 2.4 : 1) / radius });
}

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = timer.getDelta();
  for (const w of walkers) {
    w.mixer.update(dt);
    w.angle += w.speed * dt;                                // move around the circle…
    w.soldier.position.set(Math.cos(w.angle) * w.radius, 0, Math.sin(w.angle) * w.radius);
    w.soldier.rotation.y = -w.angle + Math.PI;              // …facing the direction of travel
  }
  renderer.render(scene, camera);
});
```

:::tip Big crowds
Each skinned character costs a draw call per mesh plus bone updates on the CPU. Dozens are fine; thousands need tricks: share mixers for identical animations, update distant characters less often, swap far ones for simpler models (LOD), or bake animations into textures and animate with instancing on the GPU ("vertex animation textures").
:::

## Morph-target animation

Some models animate with morph targets instead of bones. The flamingo, parrot and stork in three.js's examples flap their wings by blending between a few stored poses, which is cheap enough to fly a whole flock:

```js run title="A flock with morph-target animation" level=intermediate
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#fde68a");
scene.fog = new THREE.Fog("#fde68a", 200, 900);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 2000);
camera.position.set(0, 60, 420);
scene.add(new THREE.HemisphereLight("#ffffff", "#f59e0b", 3));

const BASE = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/";
const loader = new GLTFLoader();
const birds = [];
for (const [file, count] of [["Flamingo.glb", 6], ["Parrot.glb", 8], ["Stork.glb", 6]]) {
  const gltf = await loader.loadAsync(BASE + file);
  for (let i = 0; i < count; i++) {
    const bird = gltf.scene.clone();                   // no skeleton, so a plain clone is fine
    bird.scale.setScalar(0.35 + Math.random() * 0.2);
    bird.position.set(Math.random() * 1200 - 600, Math.random() * 160 - 40, Math.random() * 200 - 150);
    scene.add(bird);
    const mixer = new THREE.AnimationMixer(bird);
    const action = mixer.clipAction(gltf.animations[0]);
    action.setDuration(0.8 + Math.random() * 0.6).play();   // each bird flaps at its own rate…
    action.time = Math.random();                              // …starting at a different point
    birds.push({ bird, mixer, speed: 60 + Math.random() * 40 });
  }
}

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = timer.getDelta();
  for (const b of birds) {
    b.mixer.update(dt);
    b.bird.position.x += b.speed * dt;
    b.bird.rotation.y = Math.PI / 2;                    // fly towards +x
    if (b.bird.position.x > 600) b.bird.position.x = -600;
  }
  renderer.render(scene, camera);
});
```

## Where characters come from

| Source | What you get | Notes |
|---|---|---|
| **Mixamo** (Adobe) | auto-rigging + thousands of free motion-capture clips | downloads FBX; convert to glTF in Blender |
| **Ready Player Me** and similar avatar creators | customisable avatars as glTF with face blend shapes | common for VR social apps and metaverse demos |
| **VRoid / VRM** | anime-style avatars (VRM is glTF-based) | the `@pixiv/three-vrm` library loads them |
| **Blender** | full control: model, rig, animate | the professional route |
| **AI motion tools** | text-to-motion and video-to-motion capture | generate clips from a description or a phone video, then retarget |
| Sketchfab, Quaternius, Kenney | ready-made rigged models (check licences) | Quaternius and Kenney are free (CC0) |

:::def Retargeting
Applying an animation made for one skeleton to a different skeleton with similar bones. Three.js has `SkeletonUtils.retargetClip()`; in practice it's often easier to retarget in Blender or use clips made for a standard rig such as Mixamo's.
:::

## Check yourself

```quiz
? Why are skeletons cheaper than animating vertices directly?
+ You animate a few dozen bones and the GPU deforms thousands of vertices from them
- Bones are cached on disk
- Skinned meshes have fewer triangles
> Vertex skinning happens in the vertex shader.

? What does `crossFadeTo(next, 0.4, true)` do?
+ Blends from the current action to the next over 0.4 s, warping speeds to keep cycles in sync
- Plays both clips at full weight
- Stops the current clip immediately
> Cross-fades avoid pops between poses.

? Why use SkeletonUtils.clone for animated characters?
+ A normal clone would share one skeleton between all copies
- It's faster to load
- Normal clone removes the materials
> Each copy needs its own bones.

? How do you make a one-shot "Wave" hold its final pose?
+ setLoop(THREE.LoopOnce, 1) and clampWhenFinished = true
- action.stop() at the end
- timeScale = 0
> Otherwise it snaps back to the rest pose when finished.

? What are morph targets typically used for?
+ Facial expressions, lip-sync and shape changes
- Walking cycles
- Shadows
> Influences from 0 to 1 blend between stored vertex positions.
```

:::exercise Speed slider blend tree
In the robot example, replace the Idle / Walking / Running buttons with a **speed** slider (0–6). Play all three actions at once and set their weights from the speed using the smoothstep blend shown above.
:::

:::solution
```js run
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e0f2fe");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.25, 100);
camera.position.set(-6, 3.5, 12);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.3, 0);
scene.add(new THREE.HemisphereLight("#fff", "#8d8d8d", 3));

const gltf = await new GLTFLoader().loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/RobotExpressive/RobotExpressive.glb");
scene.add(gltf.scene);
const mixer = new THREE.AnimationMixer(gltf.scene);
const get = (n) => mixer.clipAction(gltf.animations.find((a) => a.name === n));
const [idle, walk, run] = ["Idle", "Walking", "Running"].map(get);
for (const a of [idle, walk, run]) a.play();

const ui = document.createElement("label");
ui.className = "overlay";
ui.innerHTML = `<span>speed <input type="range" min="0" max="6" step="0.01" value="0"> <b>0.0</b> m/s</span>`;
document.body.appendChild(ui);
let speed = 0;
ui.querySelector("input").oninput = (e) => { speed = +e.target.value; ui.querySelector("b").textContent = speed.toFixed(1); };

const ss = THREE.MathUtils.smoothstep;
const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  idle.setEffectiveWeight(1 - ss(speed, 0, 2));
  walk.setEffectiveWeight(ss(speed, 0, 2) * (1 - ss(speed, 2, 6)));
  run.setEffectiveWeight(ss(speed, 2, 6));
  mixer.update(timer.getDelta());
  renderer.render(scene, camera);
});
```
:::

:::keypoints
- Characters are **skinned meshes** driven by **skeletons**; faces often use **morph targets**.
- Play glTF clips with an `AnimationMixer`; `crossFadeTo` for smooth transitions; `LoopOnce` + `clampWhenFinished` for one-shots.
- Listen for the mixer's `finished` event to return to a loop; blend by **weights** for speed-based motion.
- Clone animated characters with **`SkeletonUtils.clone`** and give each its own mixer and start time.
- Get rigs from Mixamo, avatar creators, VRM, Blender or AI motion tools; retarget clips between skeletons.
:::
