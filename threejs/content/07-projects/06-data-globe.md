---
title: Interactive Data Globe
level: intermediate
time: 55
icon: globe
cover: #0ea5e9,#1e1b4b
tags: lat/lon → 3D, InstancedMesh, great-circle arcs, slerp, fresnel shader, raycasting instances, camera fly-to
summary: A 3D globe of the world's largest cities. Population bars stand on a textured Earth as one InstancedMesh, great-circle flight arcs draw themselves with moving planes, and a fresnel atmosphere glows around the edge. Hover tooltips come from instance raycasting, and clicking a city flies the camera there and re-routes the flights.
---

Globes are everywhere: company sites show global customers, airlines show routes, newsrooms show where things happen, and dashboards show live traffic. The core skills are converting **latitude/longitude to 3D**, drawing **arcs along the sphere**, and handling **many data points** efficiently.

:::flow How it fits together
Data | cities: name, latitude, longitude, population
Place | lat/lon → point on the sphere; orient each bar along the surface normal
Render | one InstancedMesh for all bars, one Line per arc, a fresnel shell for the atmosphere
Interact | raycast → instanceId → tooltip; click → fly the camera and rebuild the arcs
Animate | arcs grow with drawRange; planes slide along the same curve
:::

## Step 1: Latitude and longitude on a sphere

Latitude is the angle north of the equator, longitude the angle east of Greenwich. Convert both to spherical angles and then to x, y, z. The exact formula must match how the texture wraps the sphere, so check it with known places:

```js run title="Step 1 · lat/lon → 3D on a textured Earth" height=400
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 3.2);
new OrbitControls(camera, renderer.domElement);

// matches SphereGeometry's UV layout for an equirectangular map
function latLonToVector3(lat, lon, radius = 1) {
  const phi = THREE.MathUtils.degToRad(90 - lat);      // from the north pole
  const theta = THREE.MathUtils.degToRad(lon + 180);   // around the axis
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

const map = new THREE.TextureLoader().load("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/planets/earth_atmos_2048.jpg");
map.colorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial({ map })));

for (const [lat, lon, color] of [[51.51, -0.13, "red"], [-33.87, 151.21, "yellow"], [40.71, -74.01, "lime"], [0, 0, "white"]]) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025), new THREE.MeshBasicMaterial({ color }));
  dot.position.copy(latLonToVector3(lat, lon, 1.01));
  scene.add(dot);
}
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

Red should sit on London, yellow on Sydney, green on New York, and white at 0°, 0° in the Gulf of Guinea. If they don't, your sign or offset doesn't match the texture: always verify with landmarks.

## Step 2: The complete globe

```js run title="Interactive Data Globe · complete app" level=intermediate height=600
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Largest urban areas, approximate population in millions (2025 estimates)
const CITIES = [
  ["Tokyo", 35.68, 139.69, 37.0], ["Delhi", 28.61, 77.21, 34.7], ["Shanghai", 31.23, 121.47, 30.5], ["Dhaka", 23.81, 90.41, 24.6],
  ["Cairo", 30.04, 31.24, 23.1], ["São Paulo", -23.55, -46.63, 22.9], ["Mexico City", 19.43, -99.13, 22.8], ["Beijing", 39.9, 116.41, 22.6],
  ["Mumbai", 19.08, 72.88, 22.1], ["Osaka", 34.69, 135.5, 18.9], ["New York", 40.71, -74.01, 18.9], ["Karachi", 24.86, 67.01, 18.1],
  ["Chongqing", 29.56, 106.55, 17.9], ["Istanbul", 41.01, 28.98, 16.2], ["Kinshasa", -4.44, 15.27, 17.8], ["Lagos", 6.52, 3.38, 17.2],
  ["Buenos Aires", -34.6, -58.38, 15.8], ["Kolkata", 22.57, 88.36, 15.8], ["Manila", 14.6, 120.98, 15.2], ["Lahore", 31.55, 74.34, 14.4],
  ["Rio de Janeiro", -22.91, -43.17, 13.9], ["Moscow", 55.76, 37.62, 12.7], ["Los Angeles", 34.05, -118.24, 12.5], ["Paris", 48.86, 2.35, 11.3],
  ["Jakarta", -6.21, 106.85, 11.4], ["Bangkok", 13.76, 100.5, 11.4], ["London", 51.51, -0.13, 9.8], ["Lima", -12.05, -77.04, 11.4],
  ["Johannesburg", -26.2, 28.05, 6.4], ["Toronto", 43.65, -79.38, 6.5], ["Singapore", 1.35, 103.82, 6.1], ["Sydney", -33.87, 151.21, 5.4],
  ["Nairobi", -1.29, 36.82, 5.5], ["Dubai", 25.2, 55.27, 3.8],
].map(([name, lat, lon, pop], rank) => ({ name, lat, lon, pop, rank: rank + 1 }));

const R = 1;
function latLon(lat, lon, radius = R) {
  const phi = THREE.MathUtils.degToRad(90 - lat), theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

// ---------- renderer, camera, lights ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#030712");
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
camera.position.copy(latLon(25, 40, 3.4));
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1.4;
controls.maxDistance = 6;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
scene.add(camera, new THREE.AmbientLight(0xffffff, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(-2, 2, 3);
camera.add(key);                                   // light follows the camera: the visible side is always lit

// ---------- earth, atmosphere, stars ----------
const loader = new THREE.TextureLoader();
const earthMap = loader.load("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/planets/earth_atmos_2048.jpg");
earthMap.colorSpace = THREE.SRGBColorSpace;
earthMap.anisotropy = 8;
const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48), new THREE.MeshStandardMaterial({ map: earthMap, roughness: 0.9 }));
scene.add(earth);

// fresnel glow on the BACK faces of a slightly larger shell: strongest just outside the planet's limb,
// fading to nothing at the shell's own edge
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.08, 64, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  vertexShader: /* glsl */ `
    varying vec3 vNormal; varying vec3 vView;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vNormal; varying vec3 vView;
    void main() {
      // back faces point away from the camera: dot ≈ 0 at the shell's edge, ≈ -0.38 at the planet's limb
      float glow = pow(clamp(-dot(vNormal, vView) / 0.38, 0.0, 1.0), 2.0);
      gl_FragColor = vec4(vec3(0.35, 0.65, 1.0) * glow, glow);
    }`,
}));
scene.add(atmosphere);

const starPos = new Float32Array(3000 * 3);
for (let i = 0; i < 3000; i++) new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 20).toArray(starPos, i * 3);
const starGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#94a3b8", size: 1.2, sizeAttenuation: false })));

// ---------- population bars: ONE InstancedMesh ----------
const barGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 10);
barGeo.translate(0, 0.5, 0);                          // base at y = 0 so scaling grows it outwards
const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#0ea5e9", emissiveIntensity: 0.35 }), CITIES.length);
const color = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
let barMode = true;
function layoutBars() {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  CITIES.forEach((c, i) => {
    const n = latLon(c.lat, c.lon).normalize();
    q.setFromUnitVectors(up, n);                                     // point the bar along the surface normal
    s.set(1, barMode ? 0.02 + c.pop * 0.007 : 0.015, 1);
    bars.setMatrixAt(i, m.compose(n.clone().multiplyScalar(R), q, s));
    bars.setColorAt(i, color.setHSL(0.55 - (c.pop / 37) * 0.55, 0.9, 0.55)); // blue (small) → red (huge)
  });
  bars.instanceMatrix.needsUpdate = true;
  bars.instanceColor.needsUpdate = true;
  bars.computeBoundingSphere();
}
layoutBars();
scene.add(bars);

// ---------- flight arcs along great circles ----------
const arcs = new THREE.Group();
scene.add(arcs);
const SEG = 64;
function arcPoints(a, b) {
  const va = latLon(a.lat, a.lon).normalize(), vb = latLon(b.lat, b.lon).normalize();
  const angle = va.angleTo(vb), lift = 0.05 + angle * 0.18;           // longer flights fly higher
  const full = new THREE.Quaternion().setFromUnitVectors(va, vb), q = new THREE.Quaternion();
  const pts = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    q.identity().slerp(full, t);                                      // rotate part of the way: a great circle
    pts.push(va.clone().applyQuaternion(q).multiplyScalar(R + Math.sin(Math.PI * t) * lift)); // raised by a sine bump
  }
  return pts;
}
let hub = CITIES[0], flights = [];
function buildArcs() {
  arcs.clear();
  flights = CITIES.filter((c) => c !== hub).sort((a, b) => b.pop - a.pop).slice(0, 12).map((dest, i) => {
    const pts = arcPoints(hub, dest);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#fbbf24", transparent: true, opacity: 0.75 }));
    const plane = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: "#fff7ed" }));
    arcs.add(line, plane);
    return { dest, pts, geo, plane, delay: i * 0.12, speed: 0.25 + Math.random() * 0.15 };
  });
  arcClock = 0;
}
let arcClock = 0;

// ---------- UI ----------
const ui = document.createElement("div");
ui.className = "overlay";
ui.style.width = "220px";
ui.innerHTML = `<b>World's largest cities</b>
  <label style="font-size:12px">Flights from <select id="hub" style="flex:1">${CITIES.map((c, i) => `<option value="${i}">${c.name}</option>`).join("")}</select></label>
  <div class="row"><button id="bars" class="on">Bars</button><button id="arcs" class="on">Flights</button><button id="spin" class="on">Spin</button></div>
  <div class="muted" style="font-size:11px">Bar height ∝ population · drag to rotate · click a city</div>`;
document.body.append(ui);
const tip = document.createElement("div");
tip.className = "label3d";
Object.assign(tip.style, { position: "absolute", display: "none", zIndex: 20, fontSize: "12px" });
document.body.append(tip);
const $ = (s) => ui.querySelector(s);
$("#hub").onchange = (e) => selectCity(CITIES[+e.target.value]);
$("#bars").onclick = (e) => { barMode = e.target.classList.toggle("on"); layoutBars(); };
$("#arcs").onclick = (e) => { arcs.visible = e.target.classList.toggle("on"); };
$("#spin").onclick = (e) => { controls.autoRotate = e.target.classList.toggle("on"); };

// ---------- fly the camera to a city ----------
let fly = null;
function selectCity(c) {
  hub = c;
  $("#hub").value = CITIES.indexOf(c);
  buildArcs();
  controls.autoRotate = false;
  $("#spin").classList.remove("on");
  const to = latLon(c.lat + 12, c.lon, 2.6);                                     // a little south-facing tilt
  fly = { from: camera.position.clone(), turn: new THREE.Quaternion().setFromUnitVectors(camera.position.clone().normalize(), to.clone().normalize()), dist: to.length(), t: 0 };
}

// ---------- hover & click via instance raycasting ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hovered = -1, downAt = null;
function pick(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects([bars, earth])[0];             // the earth blocks cities behind it
  return hit && hit.object === bars ? hit.instanceId : -1;
}
renderer.domElement.addEventListener("pointermove", (e) => {
  hovered = pick(e);
  if (hovered < 0) { tip.style.display = "none"; renderer.domElement.style.cursor = ""; return; }
  const c = CITIES[hovered];
  tip.innerHTML = `<b>#${c.rank} ${c.name}</b> · ${c.pop.toFixed(1)} M`;
  Object.assign(tip.style, { display: "block", left: e.clientX + 12 + "px", top: e.clientY + 12 + "px" });
  renderer.domElement.style.cursor = "pointer";
});
renderer.domElement.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 4) { const i = pick(e); if (i >= 0) selectCity(CITIES[i]); }
});

// ---------- loop ----------
const timer = new THREE.Timer();
timer.connect(document);
buildArcs();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.1);
  arcClock += dt;
  for (const f of flights) {
    const k = THREE.MathUtils.clamp((arcClock - f.delay) * 0.9, 0, 1);         // the line draws itself…
    f.geo.setDrawRange(0, Math.floor(k * SEG) + 1);
    const u = ((arcClock - f.delay) * f.speed) % 1;                           // …then a plane loops along it
    f.plane.visible = k >= 1;
    f.plane.position.copy(f.pts[Math.floor(Math.max(0, u) * SEG)]);
  }
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / 1.4);
    const e = 1 - Math.pow(1 - fly.t, 3);                                    // ease-out
    const q = new THREE.Quaternion().slerp(fly.turn, e);                     // swing around the globe…
    camera.position.copy(fly.from).normalize().applyQuaternion(q)
      .multiplyScalar(THREE.MathUtils.lerp(fly.from.length(), fly.dist, e)); // …not through it
    if (fly.t >= 1) fly = null;
  }
  controls.update();
  renderer.render(scene, camera);
});

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
```

## How it works

| Feature | Technique |
|---|---|
| placing data | `latLon()` converts to a point on the sphere; the same function places bars, arcs and camera targets |
| bars | one `InstancedMesh`; each instance's matrix = position on the surface + `setFromUnitVectors(up, normal)` rotation + scale for population; `setColorAt` for the colour ramp |
| geometry pivot | the cylinder is translated so its **base** is at the origin, so scaling grows it outwards from the surface |
| arcs | points along the **great circle** (quaternion slerp between the two directions) lifted by `sin(πt)` × a height that grows with distance |
| arc animation | `geometry.setDrawRange` reveals the line progressively, so the geometry is never rebuilt; a small sphere then loops along the stored points |
| atmosphere | a slightly larger **back-facing** sphere; a fresnel-style term from `N·V` is 0 at the shell's edge and peaks at the planet's limb, with additive blending |
| lighting | a directional light parented to the camera keeps the visible hemisphere lit as the user orbits |
| hover | raycast against `[bars, earth]`; the earth in the list means cities on the far side can't be picked through the planet; `instanceId` identifies the city |
| fly-to | slerp the camera's **direction** (a quaternion from the current to the target direction) and lerp its **distance** separately, so it swings around the globe instead of through it |

:::tip Scaling up
For thousands of points use `InstancedMesh` (as here) or `Points` with a custom shader; for thousands of arcs merge them into one `LineSegments` with a progress attribute animated in the shader. For real geography (country borders, choropleths) load GeoJSON and triangulate polygons onto the sphere, or use a dedicated library such as **three-globe** / **globe.gl**, deck.gl's `GlobeView`, or CesiumJS when you need accurate terrain and map tiles.
:::

:::exercise Extend it
1. Add **day/night**: a sun direction from the current UTC time and a shader that blends the day texture with `earth_lights_2048.png` on the dark side.
2. Load **live data**: for example, the USGS earthquake feed (GeoJSON) as pulsing rings sized by magnitude.
3. Draw **country borders** from a low-resolution world GeoJSON as `LineSegments` slightly above the surface.
4. Replace the planes with an **instanced** set of 1,000 particles flowing along all arcs.
5. Add a **2D/3D toggle** that morphs the globe into a flat map: interpolate each vertex between its sphere and equirectangular positions in a vertex shader.
:::

:::keypoints
- One function, `latLon()`, maps data onto the sphere; verify it with known landmarks.
- Orient objects along the **surface normal** with `Quaternion.setFromUnitVectors`.
- Great-circle arcs = **slerp** between directions plus a lift; animate with `setDrawRange`.
- **InstancedMesh** + `instanceId` raycasting handle many data points with one draw call.
- A back-facing **fresnel** shell gives the classic atmosphere glow cheaply.
:::
