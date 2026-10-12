---
title: Solar System Explorer
level: easy
time: 45
icon: sun
cover: #f59e0b,#4f46e5
tags: scene graph, textures, CanvasTexture, CSS2DRenderer, OrbitControls, camera follow, Timer
summary: An interactive solar system with real orbital periods, day lengths and axial tilts. It has textured and procedurally painted planets, Saturn's rings, Earth's clouds and Moon, labels, click-to-follow camera, and a time machine. A first complete three.js app that uses almost everything from Module 1.
---

A solar system is the classic first three.js project because it exercises the **scene graph** (moons orbit planets that orbit the sun), **textures**, **lighting** from a single point, **animation** driven by time, and **camera control**. Ours goes further with real data, follow-cam navigation and labels.

:::flow How it fits together
Data | each planet's real radius, orbit, year, day length and tilt
Build | anchor (orbit position) → tilt group → spinning mesh; label on the anchor
Simulate | `days += dt × speed` → orbit angle and spin from real periods
Navigate | click a label or planet → camera eases to it and follows
Render | WebGL for the scene, CSS2DRenderer for the HTML labels
:::

## Step 1: Orbits are just nested groups

Before the full app, see the core idea. A **pivot group** at the sun rotates; the planet sits at an offset inside it, so it circles the sun. The Moon's pivot sits inside the Earth's group, so it circles Earth *while* Earth circles the Sun:

```js run title="Step 1 · Orbits with nested groups" height=380
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 9, 12);
camera.lookAt(0, 0, 0);

const ball = (r, color) => new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshStandardMaterial({ color }));
const sun = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 16), new THREE.MeshBasicMaterial({ color: "#fbbf24" }));
scene.add(sun, new THREE.PointLight(0xffffff, 3, 0, 0), new THREE.AmbientLight(0xffffff, 0.08));

const earthOrbit = new THREE.Group();             // rotates → carries Earth around the sun
scene.add(earthOrbit);
const earth = ball(0.45, "#3b82f6");
earth.position.x = 5;                             // distance from the sun
earthOrbit.add(earth);

const moonOrbit = new THREE.Group();              // lives INSIDE Earth → follows it
earth.add(moonOrbit);
const moon = ball(0.14, "#d4d4d8");
moon.position.x = 1;
moonOrbit.add(moon);

renderer.setAnimationLoop((t) => {
  earthOrbit.rotation.y = t * 0.0004;             // one turn ≈ 16 s
  moonOrbit.rotation.y = t * 0.003;               // the moon goes round ~7× faster
  earth.rotation.y = t * 0.002;                   // Earth's own spin (also spins moonOrbit!)
  renderer.render(scene, camera);
});
```

Notice the last comment: because `moonOrbit` is a child of `earth`, Earth's spin also swings the Moon around. Child transforms are **relative to the parent**. The full app avoids this by giving each planet separate groups for *where it is*, *how it's tilted* and *how it spins*.

## Step 2: The complete explorer

```js run title="Solar System Explorer · complete app" level=intermediate height=560
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const TEX = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/planets/";

// Real data: radius (km), orbit (AU), year (Earth days), day (hours, negative = retrograde), axial tilt (°)
const PLANETS = [
  { name: "Mercury", r: 2440, a: 0.387, year: 87.97, day: 1407.6, tilt: 0.03, colors: ["#8c8c8c", "#c4c4c4"] },
  { name: "Venus", r: 6052, a: 0.723, year: 224.7, day: -5832.5, tilt: 177.4, colors: ["#e3b866", "#f6e0ad"] },
  { name: "Earth", r: 6371, a: 1, year: 365.26, day: 23.93, tilt: 23.44, map: "earth_atmos_2048.jpg" },
  { name: "Mars", r: 3390, a: 1.524, year: 686.98, day: 24.62, tilt: 25.19, colors: ["#a63d22", "#d9784f"] },
  { name: "Jupiter", r: 69911, a: 5.203, year: 4332.6, day: 9.93, tilt: 3.13, colors: ["#b8875e", "#efe3cf", "#c9a27e"], bands: true },
  { name: "Saturn", r: 58232, a: 9.537, year: 10759, day: 10.66, tilt: 26.73, colors: ["#cfb57f", "#efe2bd"], bands: true, ring: true },
  { name: "Uranus", r: 25362, a: 19.19, year: 30688, day: -17.24, tilt: 97.77, colors: ["#94d8df", "#c3eef2"], bands: true },
  { name: "Neptune", r: 24622, a: 30.07, year: 60182, day: 16.11, tilt: 28.32, colors: ["#3557c0", "#5b82e0"], bands: true },
];
// Real distances would put Neptune 77× farther than Mercury and make planets invisible dots,
// so we compress both scales (and say so in the UI).
const distOf = (a) => 6 + 7 * Math.sqrt(a);
const sizeOf = (r) => 0.18 + 0.55 * Math.cbrt(r / 6371);
const SPIN = 0.02; // slow the spin so it's visible at high time speeds

// ---------- renderer, scene, camera, labels ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.append(renderer.domElement);
const labels = new CSS2DRenderer();
Object.assign(labels.domElement.style, { position: "absolute", left: 0, top: 0, pointerEvents: "none" });
document.body.append(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#02030a");
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 3000);
camera.position.set(0, 32, 58);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxDistance = 400;

scene.add(new THREE.AmbientLight(0xffffff, 0.06));
scene.add(new THREE.PointLight(0xffffff, 3, 0, 0)); // decay 0: light doesn't fade with distance

const loader = new THREE.TextureLoader();
const srgb = (t) => ((t.colorSpace = THREE.SRGBColorSpace), t);

// ---------- procedural textures for planets without a photo ----------
function paint(p) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  const cols = p.colors.map((x) => new THREE.Color(x));
  if (p.bands) {
    // gas giants: horizontal bands of wobbly stripes
    for (let y = 0; y < 256; y++) {
      const t = Math.sin(y * 0.21 + Math.sin(y * 0.05) * 2.5) * 0.5 + 0.5;
      const k = cols.length === 3 && Math.sin(y * 0.07) > 0.6 ? 2 : 1;
      g.fillStyle = cols[0].clone().lerp(cols[k], t).getStyle();
      g.fillRect(0, y, 512, 1);
    }
  } else {
    // rocky: base colour plus random craters/blotches
    g.fillStyle = cols[0].getStyle();
    g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 500; i++) {
      g.globalAlpha = 0.08 + Math.random() * 0.25;
      g.fillStyle = (Math.random() < 0.5 ? cols[1] : cols[0].clone().multiplyScalar(0.7)).getStyle();
      g.beginPath();
      g.arc(Math.random() * 512, Math.random() * 256, 2 + Math.random() * 14, 0, Math.PI * 2);
      g.fill();
    }
  }
  return srgb(new THREE.CanvasTexture(c));
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,200,90,.55)");
  grad.addColorStop(1, "rgba(255,140,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- the sun ----------
const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(2.6, 48, 24), new THREE.MeshBasicMaterial({ color: "#ffd27a" }));
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false }));
glow.scale.setScalar(14);
sunMesh.add(glow);
scene.add(sunMesh);

// ---------- stars ----------
const starPos = new Float32Array(4000 * 3);
for (let i = 0; i < 4000; i++) {
  const v = new THREE.Vector3().randomDirection().multiplyScalar(500 + Math.random() * 400);
  starPos.set([v.x, v.y, v.z], i * 3);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#cbd5e1", size: 1.4, sizeAttenuation: false })));

// ---------- planets ----------
const bodies = [];
const orbitLines = new THREE.Group();
scene.add(orbitLines);

function addLabel(parent, text, y, onClick) {
  const el = document.createElement("div");
  el.className = "label3d";
  el.textContent = text;
  Object.assign(el.style, { pointerEvents: "auto", cursor: "pointer", fontSize: "11px", padding: "2px 7px" });
  el.onclick = onClick;
  const obj = new CSS2DObject(el);
  obj.position.y = y;
  parent.add(obj);
  return obj;
}

PLANETS.forEach((p, i) => {
  const dist = distOf(p.a), size = sizeOf(p.r);
  const anchor = new THREE.Group();                                  // WHERE it is (moves along the orbit)
  const tilt = new THREE.Group();                                    // HOW it's tilted (fixed in space)
  tilt.rotation.z = THREE.MathUtils.degToRad(p.tilt);
  const map = p.map ? srgb(loader.load(TEX + p.map)) : paint(p);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 48, 24), new THREE.MeshStandardMaterial({ map, roughness: 1 }));
  mesh.userData.body = i;
  tilt.add(mesh);                                                    // HOW it spins (mesh.rotation.y)
  anchor.add(tilt);
  scene.add(anchor);

  const body = { p, i, anchor, mesh, size, phase: i * 1.7 };
  bodies.push(body);

  if (p.name === "Earth") {
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(size * 1.02, 48, 24),
      new THREE.MeshStandardMaterial({ map: srgb(loader.load(TEX + "earth_clouds_1024.png")), transparent: true, depthWrite: false }));
    tilt.add(clouds);
    body.clouds = clouds;
    const moonPivot = new THREE.Group();                             // child of the anchor: unaffected by Earth's spin
    const moon = new THREE.Mesh(new THREE.SphereGeometry(size * 0.27, 32, 16),
      new THREE.MeshStandardMaterial({ map: srgb(loader.load(TEX + "moon_1024.jpg")), roughness: 1 }));
    moon.position.x = size * 2.2;
    moonPivot.add(moon);
    anchor.add(moonPivot);
    body.moonPivot = moonPivot;
  }

  if (p.ring) {
    const inner = size * 1.25, outer = size * 2.3;
    const geo = new THREE.RingGeometry(inner, outer, 128, 1);
    // remap UVs so u runs from the inner to the outer edge
    const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      uv.setXY(k, (v.length() - inner) / (outer - inner), 0.5);
    }
    const c = document.createElement("canvas");
    c.width = 256; c.height = 1;
    const g = c.getContext("2d");
    for (let x = 0; x < 256; x++) {
      const a = (0.35 + 0.5 * Math.abs(Math.sin(x * 0.11) * Math.sin(x * 0.037))) * (x > 150 && x < 165 ? 0.1 : 1);
      g.fillStyle = `rgba(226, 208, 168, ${a.toFixed(3)})`;
      g.fillRect(x, 0, 1, 1);
    }
    const ring = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: srgb(new THREE.CanvasTexture(c)), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
  }

  // orbit path
  const pts = new THREE.EllipseCurve(0, 0, dist, dist).getPoints(160).map((q) => new THREE.Vector3(q.x, 0, q.y));
  orbitLines.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: "#94a3b8", transparent: true, opacity: 0.22 })));

  body.label = addLabel(anchor, p.name, size + 0.45, () => setFocus(body));
});
const sunBody = { p: { name: "Sun" }, anchor: sunMesh, size: 8 };
addLabel(sunMesh, "Sun", 3.4, () => setFocus(sunBody));

// ---------- UI ----------
const ui = document.createElement("div");
ui.className = "overlay";
ui.style.width = "250px";
ui.innerHTML = `
  <div class="row">${["Sun", ...PLANETS.map((p) => p.name)].map((n) => `<button data-go="${n}" style="font-size:11px;padding:3px 7px">${n}</button>`).join("")}</div>
  <div style="font-size:12px">Speed: <b id="spd"></b><input id="speed" type="range" min="0" max="400" value="30" style="width:100%;display:block"></div>
  <div class="row"><button id="pause">Pause</button><button id="lbl" class="on">Labels</button><button id="orb" class="on">Orbits</button></div>
  <div class="muted" style="font-size:11px">Day <b id="day">0</b> · distances and sizes compressed</div>`;
document.body.append(ui);
const info = document.createElement("div");
info.className = "overlay right bottom";
info.style.cssText = "width:200px;font-size:12px";
document.body.append(info);

let speed = 30, paused = false, days = 0;
const $ = (s) => ui.querySelector(s);
const showSpeed = () => ($("#spd").textContent = speed >= 365 ? `${(speed / 365).toFixed(2)} years / s` : `${speed} days / s`);
$("#speed").oninput = (e) => { speed = +e.target.value; showSpeed(); };
$("#pause").onclick = (e) => { paused = !paused; e.target.textContent = paused ? "Play" : "Pause"; };
$("#lbl").onclick = (e) => { const on = e.target.classList.toggle("on"); labels.domElement.style.display = on ? "" : "none"; };
$("#orb").onclick = (e) => { orbitLines.visible = e.target.classList.toggle("on"); };
ui.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => setFocus(b.dataset.go === "Sun" ? sunBody : bodies.find((x) => x.p.name === b.dataset.go))));
showSpeed();

// ---------- focus & follow ----------
let focus = sunBody, zooming = true;
const last = new THREE.Vector3(), now = new THREE.Vector3();
function setFocus(body) {
  focus = body;
  zooming = true;
  body.anchor.getWorldPosition(last);
  ui.querySelectorAll("[data-go]").forEach((b) => b.classList.toggle("on", b.dataset.go === body.p.name));
  const p = body.p;
  info.innerHTML = "<div>" + (p.r
    ? `<b style="font-size:14px">${p.name}</b><br>Radius: ${p.r.toLocaleString()} km<br>Orbit: ${p.a} AU<br>
       Year: ${p.year < 1000 ? p.year + " days" : (p.year / 365.26).toFixed(1) + " years"}<br>
       Day: ${Math.abs(p.day) > 48 ? (Math.abs(p.day) / 24).toFixed(0) + " days" : Math.abs(p.day) + " h"}${p.day < 0 ? " (retrograde)" : ""}<br>
       Axial tilt: ${p.tilt}°`
    : `<b style="font-size:14px">The Sun</b><br>Radius: 696,340 km<br>99.86% of the Solar System's mass<br>Click a planet or label to fly there.`) + "</div>";
}
controls.addEventListener("start", () => (zooming = false)); // the user takes over the zoom
setFocus(sunBody);

function follow() {
  focus.anchor.getWorldPosition(now);
  // 1. carry target and camera along with the body's motion this frame (no lag)…
  const moved = now.clone().sub(last);
  last.copy(now);
  // 2. …plus ease out the remaining offset (the jump when you pick a new body)
  moved.add(now.clone().sub(controls.target).sub(moved).multiplyScalar(0.1));
  controls.target.add(moved);
  camera.position.add(moved);
  if (zooming) {
    const want = focus === sunBody ? 60 : focus.size * 6 + 1.5;
    const off = camera.position.clone().sub(controls.target);
    const len = THREE.MathUtils.lerp(off.length(), want, 0.06);
    camera.position.copy(controls.target).add(off.setLength(len));
    if (Math.abs(len - want) < 0.02) zooming = false;
  }
}

// click a planet to focus it (ignore drags)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(bodies.map((b) => b.mesh))[0];
  if (hit) setFocus(bodies[hit.object.userData.body]);
});

// ---------- simulation loop ----------
const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.1);
  if (!paused) days += dt * speed;
  for (const b of bodies) {
    const angle = b.phase + (days / b.p.year) * Math.PI * 2;
    const d = distOf(b.p.a);
    b.anchor.position.set(Math.cos(angle) * d, 0, -Math.sin(angle) * d); // counter-clockwise seen from above
    b.mesh.rotation.y = ((days * 24) / b.p.day) * Math.PI * 2 * SPIN;
    if (b.clouds) b.clouds.rotation.y = b.mesh.rotation.y * 1.1;
    if (b.moonPivot) b.moonPivot.rotation.y = (days / 27.32) * Math.PI * 2;
  }
  sunMesh.rotation.y = days * 0.01;
  $("#day").textContent = Math.floor(days).toLocaleString();
  follow();
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
```

## How it works

| Feature | Technique |
|---|---|
| orbit position | **set the anchor's position** from an angle each frame, rather than rotating a pivot, so axial tilt stays fixed in space (that's what gives Earth its seasons) |
| tilt and spin | separate groups: `tilt.rotation.z` once, `mesh.rotation.y` every frame. Order of nesting = order of transforms |
| real timing | one `days` counter; angle = `days / year × 2π`, spin = `days × 24 / dayHours × 2π`. Negative day lengths spin backwards (Venus, Uranus) |
| Earth and Moon | photo textures from the three.js repo with `colorSpace = SRGBColorSpace`; a slightly larger transparent cloud sphere; the Moon's pivot hangs off the **anchor**, not the spinning mesh |
| other planets | `CanvasTexture` painted with bands or blotches: zero downloads |
| Saturn's rings | `RingGeometry` with **remapped UVs** (u = radial distance) and a 256×1 alpha-striped canvas texture, including the Cassini division |
| sun glow | an additive `Sprite` with a radial-gradient texture; `PointLight` with `decay: 0` lights every planet equally |
| labels | `CSS2DRenderer`: real HTML elements positioned over 3D points, clickable |
| follow camera | each frame, move the controls' target **and** the camera by the body's exact motion plus an eased share of the remaining offset, so the view keeps its angle, glides to a new body and then tracks it without lag; `zooming` stops when the user grabs the controls |
| time | `THREE.Timer` with `connect(document)`, so returning to a hidden tab doesn't jump months ahead; delta clamped to 0.1 s |

:::exercise Extend it
1. Add a **"True scale"** toggle that uses real distance (`a × 100`) and size ratios, and see how empty space really is (you'll need to zoom a lot).
2. Make orbits **elliptical** using each planet's eccentricity (Mercury 0.206, Mars 0.093). Solve Kepler's equation `M = E − e sin E` with a few Newton iterations to get the true position.
3. Add the **asteroid belt** between Mars and Jupiter as an `InstancedMesh` of 2,000 rocks, each with its own orbital speed.
4. Add a **date picker** that sets `days` from a real calendar date (J2000 epoch: 1 Jan 2000), with each planet's real starting longitude.
5. Use **Earth's night lights** (`earth_lights_2048.png`) in an `onBeforeCompile` shader that shows them only on the dark side.
:::

:::keypoints
- Orbits are a scene-graph problem: separate **position, tilt and spin** into their own groups.
- Drive every animation from **one time value** with real periods, so speed controls and pause are trivial.
- Mix **photo textures** and **procedural `CanvasTexture`s**, remembering sRGB colour space for colour maps.
- `CSS2DRenderer` gives you crisp, clickable HTML labels anchored to 3D objects.
- A follow camera moves **target and camera together**, then hands control back to the user.
:::
