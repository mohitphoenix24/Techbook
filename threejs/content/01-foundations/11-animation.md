---
title: Animation — Time, Easing, Tweens & Keyframes
level: intermediate
time: 30
summary: Frame-rate independent motion with THREE.Timer, simple physics, easing curves, timelines with GSAP, three.js's own keyframe system (AnimationClip and AnimationMixer), and when to use which.
---

There are four ways to move things in three.js, and real apps use all of them: **code that runs every frame** (orbits, physics, following), **tweens** that go from A to B with an easing curve (UI transitions, camera moves), **timelines** that sequence many tweens (product reveals), and **keyframe clips** made by artists or by you (characters, machines). This lesson covers each, starting with the clock.

## Time: THREE.Timer

:::def THREE.Timer
Three.js's clock (it replaced `THREE.Clock`, deprecated in r186). Call `timer.update(timestamp)` once per frame; then `getDelta()` returns seconds since the previous frame and `getElapsed()` seconds since the start. `timer.connect(document)` makes it ignore the time while the tab is hidden, so things don't jump when the user comes back.
:::

```js
const timer = new THREE.Timer();
timer.connect(document);                    // pause-aware: no giant delta after switching tabs

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const dt = timer.getDelta();              // seconds since last frame (≈ 0.0167 at 60 Hz)
  const elapsed = timer.getElapsed();       // seconds since start
  mesh.rotation.y += 1.5 * dt;              // 1.5 radians per second on any screen
  renderer.render(scene, camera);
});
```

## Per-frame code: a bouncing ball

Simple physics is "velocity changes position, gravity changes velocity", applied every frame with `dt`. This is how particles, projectiles and game characters move.

```js run title="Gravity, bounce and friction" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3, 9);
camera.lookAt(0, 1.5, 0);
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.4));
const sun = new THREE.DirectionalLight("#fff", 2);
sun.position.set(2, 8, 4);
sun.castShadow = true;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), new THREE.MeshStandardMaterial({ color: "#e2e8f0" }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const R = 0.35;
const balls = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"].map((color, i) => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.3 }));
  mesh.castShadow = true;
  scene.add(mesh);
  return { mesh, vel: new THREE.Vector3(), bounce: [0.9, 0.75, 0.55, 0.3][i] };   // restitution
});
function reset() {
  balls.forEach((b, i) => { b.mesh.position.set(-4.5 + i * 0.3, 4 + i * 0.4, (i - 1.5) * 1.2); b.vel.set(2.2, 0, 0); });
}
reset();
const btn = document.createElement("button");
btn.className = "overlay";
btn.textContent = "Drop again";
btn.onclick = reset;
document.body.appendChild(btn);

const GRAVITY = -9.81;                     // m/s², because 1 unit = 1 m
const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 1 / 30);   // clamp: a slow frame shouldn't tunnel through the floor
  for (const b of balls) {
    b.vel.y += GRAVITY * dt;                       // gravity changes velocity
    b.mesh.position.addScaledVector(b.vel, dt);    // velocity changes position
    if (b.mesh.position.y < R) {                   // hit the floor
      b.mesh.position.y = R;
      b.vel.y = -b.vel.y * b.bounce;               // bounce, losing energy
      b.vel.x *= 0.98;                             // a little friction
    }
    if (Math.abs(b.mesh.position.x) > 6) b.vel.x *= -1;
    b.mesh.rotation.z -= (b.vel.x * dt) / R;       // roll: distance / radius = angle
  }
  renderer.render(scene, camera);
});
```

For anything beyond simple bouncing (stacking boxes, collisions between many shapes, joints), use a physics engine: Rapier is covered in Module 4.

## Easing: the shape of motion

:::def Easing function
A function that maps linear progress `t` (0 → 1) to eased progress. **Linear** motion looks robotic; **ease-in-out** starts and ends gently like real objects; **ease-out-back** overshoots slightly; **bounce** settles like a dropped ball. Good easing is most of what makes an interface feel polished.
:::

```js run title="Four easing curves, same distance, same time" level=easy
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 10);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.5));

const ease = {
  linear: (t) => t,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  easeOutBack: (t) => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  easeOutBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
const rows = Object.entries(ease).map(([name, fn], i) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 4, 0.7, 0.55) }));
  m.position.y = 2.1 - i * 1.4;
  scene.add(m);
  return { m, fn, name };
});
const legend = document.createElement("div");
legend.className = "overlay";
legend.innerHTML = rows.map((r) => `<code>${r.name}</code>`).join("");
document.body.appendChild(legend);

renderer.setAnimationLoop((time) => {
  const cycle = (time / 1000) % 2.6;                    // 2 s move + 0.6 s pause
  const t = Math.min(cycle / 2, 1);                     // linear progress 0 → 1
  for (const { m, fn } of rows) {
    const k = fn(t);
    m.position.x = THREE.MathUtils.lerp(-3, 3, k);
    m.rotation.z = -k * Math.PI;
  }
  renderer.render(scene, camera);
});
```

## Tweens and timelines with GSAP

Writing every transition by hand gets tedious. **GSAP** (GreenSock, free for all uses) animates any numeric property of any object, including `mesh.position`, `material.opacity` or `camera.fov`, with easing, delays, repeats and **timelines** that sequence steps. It's the most used animation library on award-winning 3D websites.

```js run title="A product reveal with a GSAP timeline" level=intermediate
import * as THREE from "three";
import { gsap } from "gsap";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0f172a");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.2, 7);
camera.lookAt(0, 0.6, 0);

// a box with a hinged lid (the lid's pivot sits on the back edge)
const boxMat = new THREE.MeshStandardMaterial({ color: "#a16207", roughness: 0.7 });
const box = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), boxMat);
box.position.y = 0.5;
const hinge = new THREE.Group();
hinge.position.set(0, 1, -1);
const lid = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.1, 2.05), boxMat);
lid.position.set(0, 0.05, 1);
hinge.add(lid);
const product = new THREE.Mesh(new THREE.TorusKnotGeometry(0.4, 0.14, 160, 24),
  new THREE.MeshStandardMaterial({ color: "#34d399", metalness: 0.7, roughness: 0.15 }));
product.position.y = 0.5;
product.scale.setScalar(0.01);
scene.add(box, hinge, product);

const tl = gsap.timeline({ paused: true, defaults: { duration: 0.8, ease: "power2.inOut" } });
tl.to(hinge.rotation, { x: -Math.PI * 0.7 })                                // open the lid
  .to(product.position, { y: 2.2, ease: "back.out(1.6)", duration: 1 }, "-=0.2")
  .to(product.scale, { x: 1, y: 1, z: 1, duration: 1, ease: "elastic.out(1, 0.5)" }, "<")   // "<" = same start time
  .to(product.rotation, { y: Math.PI * 2, duration: 1.6, ease: "power1.inOut" }, "-=0.5")
  .to(camera.position, { z: 5.2, y: 2.8, duration: 1.4 }, "<");

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<div class="row"><button class="primary" data-a="play">Unbox</button><button data-a="reverse">Reverse</button><button data-a="restart">Restart</button></div>
  <input type="range" min="0" max="1" step="0.001" value="0" title="scrub">`;
document.body.appendChild(ui);
ui.onclick = (e) => e.target.dataset.a && tl[e.target.dataset.a]();
const scrub = ui.querySelector("input");
scrub.oninput = () => tl.pause().progress(+scrub.value);                    // drag to scrub the timeline

renderer.setAnimationLoop(() => {
  camera.lookAt(0, 1, 0);
  if (tl.isActive()) scrub.value = tl.progress();
  renderer.render(scene, camera);
});
```

The scrub slider hints at **scroll-driven** animation: tie `tl.progress()` to the page's scroll position (GSAP's `ScrollTrigger` plugin does this) and you have the core of most "Apple-style" product pages.

## Keyframe clips: AnimationClip & AnimationMixer

Three.js has its own animation system, built for characters and models from Blender, but you can also write clips by hand. A **clip** contains **tracks**; each track animates one property with a list of times and values; a **mixer** plays clips on an object.

:::def AnimationMixer
The player for keyframe animations on one object hierarchy. You create **actions** from clips with `mixer.clipAction(clip)`, then `play()`, `stop()`, `fadeIn()`, `crossFadeTo()`, change `timeScale` or `loop`, and call `mixer.update(dt)` every frame.
:::

```js run title="A hand-written AnimationClip" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2, 7);
camera.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.2), new THREE.GridHelper(10, 10));

const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: "#ffffff" }));
lamp.name = "lamp";
scene.add(lamp);

// tracks address properties by name: "<objectName>.<property>"
const times = [0, 1, 2, 3];
const clip = new THREE.AnimationClip("patrol", 3, [
  new THREE.VectorKeyframeTrack("lamp.position", times, [-2, 0.4, 0,   0, 2, 0,   2, 0.4, 0,   -2, 0.4, 0]),
  new THREE.ColorKeyframeTrack("lamp.material.color", times, [1, 0.3, 0.3,   1, 0.85, 0.2,   0.2, 0.8, 0.5,   1, 0.3, 0.3]),
  new THREE.QuaternionKeyframeTrack("lamp.quaternion", [0, 3], [
    ...new THREE.Quaternion().toArray(),
    ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).toArray(),
  ]),
]);

const mixer = new THREE.AnimationMixer(scene);
const action = mixer.clipAction(clip);
action.play();

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<label>speed <input type="range" min="-2" max="3" step="0.1" value="1"></label>
  <label><input type="checkbox" id="pp"> ping-pong loop</label>`;
document.body.appendChild(ui);
ui.querySelector("input[type=range]").oninput = (e) => (action.timeScale = +e.target.value);
ui.querySelector("#pp").onchange = (e) => action.setLoop(e.target.checked ? THREE.LoopPingPong : THREE.LoopRepeat, Infinity);

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  mixer.update(timer.getDelta());              // advance all actions
  renderer.render(scene, camera);
});
```

The real power shows with models: a glTF character arrives with clips such as "Idle", "Walk" and "Run", and you blend between them with `crossFadeTo`. That's in the next module's character animation lesson.

## Which tool when?

| Need | Use |
|---|---|
| continuous motion (spin, orbit, follow, float) | per-frame code with `dt` / `damp` |
| physics-like movement | per-frame integration, or a physics engine |
| A → B transitions on click (UI, camera, open/close) | a tween (GSAP) or damping towards a goal |
| choreographed sequences, scroll stories | GSAP timeline (+ ScrollTrigger) |
| character and machine animation from Blender | `AnimationMixer` with glTF clips |
| thousands of moving things (particles, crowds) | the GPU: shaders or instancing (Module 2) |

## Check yourself

```quiz
? What does `timer.getDelta()` return after `timer.update(t)`?
+ Seconds elapsed since the previous update
- Milliseconds since the page loaded
- The frame number
> Multiply speeds by this delta for frame-rate independence.

? Why clamp `dt` in the physics loop?
+ A very long frame would move objects so far they could pass through the floor
- Delta can be negative
- GSAP requires it
> Big steps break simple collision checks ("tunnelling").

? Which easing overshoots its target slightly before settling?
- linear
+ easeOutBack
- easeInOutCubic
> "Back" eases pull back or overshoot.

? In a GSAP timeline, what does the position parameter `"<"` mean?
+ Start at the same time as the previous tween
- Start after a one-second delay
- Reverse the tween
> It lines up tweens that should run together.

? What must happen every frame for AnimationMixer clips to play?
+ mixer.update(delta)
- action.play()
- clip.update()
> The mixer advances time only when you update it.
```

:::exercise Hover pop
Make a grid of 9 cubes. Every 0.6 seconds, pick a random cube and use GSAP to "pop" it: scale up to 1.4 with `back.out` easing, then back to 1 (`yoyo: true, repeat: 1`).
:::

:::solution
```js run
import * as THREE from "three";
import { gsap } from "gsap";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 5, 6);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2.4));
const cubes = [];
for (let i = 0; i < 9; i++) {
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 9, 0.6, 0.55) }));
  c.position.set((i % 3 - 1) * 1.3, 0, (Math.floor(i / 3) - 1) * 1.3);
  scene.add(c);
  cubes.push(c);
}
setInterval(() => {
  const c = cubes[Math.floor(Math.random() * cubes.length)];
  gsap.to(c.scale, { x: 1.4, y: 1.4, z: 1.4, duration: 0.3, ease: "back.out(2)", yoyo: true, repeat: 1 });
}, 600);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```
:::

:::keypoints
- Use **`THREE.Timer`** (`update` → `getDelta` / `getElapsed`); `connect(document)` handles hidden tabs.
- Per-frame motion: `position += velocity × dt`; clamp `dt` for physics.
- **Easing** makes motion feel physical; **GSAP** tweens and timelines handle sequences and scroll stories.
- **AnimationClip** (tracks of keyframes) + **AnimationMixer** (`clipAction`, `update(dt)`) play keyframe animation, mostly from glTF models.
- Pick the tool by need: continuous → per-frame; A→B → tween/damp; sequences → timeline; characters → mixer.
:::
