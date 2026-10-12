---
title: Lights & Shadows
level: easy
time: 30
summary: The six light types and what each costs, physically based light intensities, shadow maps and how to tune them (map size, shadow camera, bias), the r186 shadow types, and cheaper alternatives like baked lighting and contact shadows.
---

Light is what makes 3D look 3D. A sphere with no light is a flat disc; the same sphere lit from one side shows its roundness instantly. Lights are also one of the biggest performance costs in a scene, and shadows even more so, so knowing which light to use where is a core skill.

## The light types

```js run title="Lighting lab — toggle each light" level=easy height=440
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { RectAreaLightHelper } from "three/addons/helpers/RectAreaLightHelper.js";

RectAreaLightUniformsLib.init();                       // RectAreaLight needs extra shader data
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0f172a");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(5, 4, 7);
new OrbitControls(camera, renderer.domElement);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.8 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const mat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.4 });
[[-1.6, 0.6, 0, new THREE.SphereGeometry(0.6, 48, 24)], [0, 0.6, 0, new THREE.BoxGeometry(1.1, 1.2, 1.1)], [1.6, 0.8, 0, new THREE.TorusKnotGeometry(0.4, 0.15, 128, 16)]]
  .forEach(([x, y, z, g]) => { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); scene.add(m); });

const at = (light, x, y, z) => { light.position.set(x, y, z); return light; };
const lights = {
  Ambient: new THREE.AmbientLight("#ffffff", 0.4),
  Hemisphere: new THREE.HemisphereLight("#93c5fd", "#78350f", 1.2),
  Directional: at(new THREE.DirectionalLight("#fff7ed", 2.5), 4, 6, 3),
  Point: at(new THREE.PointLight("#f472b6", 15), -2, 1.8, 1.5),            // (colour, candela)
  Spot: at(new THREE.SpotLight("#34d399", 40, 0, Math.PI / 7, 0.4), 2.5, 4, 1), // (colour, candela, range, cone angle, penumbra)
  RectArea: at(new THREE.RectAreaLight("#60a5fa", 6, 3, 1.2), 0, 2.2, -2.5),  // (colour, nits, width, height)
};
lights.RectArea.lookAt(0, 0.5, 0);
lights.RectArea.add(new RectAreaLightHelper(lights.RectArea));
lights.Point.add(new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: "#f472b6" })));
const on = { Ambient: true, Hemisphere: false, Directional: true, Point: true, Spot: false, RectArea: false };
for (const [name, light] of Object.entries(lights)) { light.visible = on[name]; scene.add(light); }

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = Object.keys(lights).map((n) => `<label><input type="checkbox" data-l="${n}" ${on[n] ? "checked" : ""}> ${n}Light</label>`).join("");
document.body.appendChild(ui);
ui.onchange = (e) => (lights[e.target.dataset.l].visible = e.target.checked);

renderer.setAnimationLoop((t) => {
  lights.Point.position.x = Math.sin(t / 1000) * 2.5;
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

| Light | What it models | Shadows | Cost |
|---|---|---|---|
| `AmbientLight` | flat light from everywhere | no | ~free |
| `HemisphereLight` | sky colour from above, ground colour from below | no | ~free |
| `DirectionalLight` | the sun: parallel rays from far away | yes | low (+ shadow pass) |
| `PointLight` | a bulb: light in all directions from a point | yes (6 shadow views!) | medium |
| `SpotLight` | a cone: torches, stage lights, headlights | yes | medium |
| `RectAreaLight` | a glowing rectangle: windows, softboxes, TV screens | no | medium–high, Standard/Physical materials only |

:::tip A good default rig
**Hemisphere** (soft fill with a sky/ground tint) + one **Directional** (the sun, casting shadows) covers most outdoor and product scenes at almost no cost. Add an **environment map** for reflections. Point and spot lights are for specific accents: lamps, sparks, headlights.
:::

## Light intensities are physical

Since three.js r155, lights use real-world units:

| Light | Unit | Typical values |
|---|---|---|
| Directional, Ambient, Hemisphere | lux-like scale | 1–3 |
| Point, Spot | **candela**, falling off with distance² (`decay = 2`) | 5–100 at a few metres |
| RectArea | nits | 2–20 |

Because point and spot lights fade with the **square** of distance (like real light), a PointLight with intensity 1 placed 5 m away is barely visible. If a light "does nothing", raise its intensity before suspecting a bug. Models exported from Blender with physical light units come out right.

:::def Tone mapping
Turning very bright lighting values into colours a screen can show, like a camera's exposure. `renderer.toneMapping = THREE.ACESFilmicToneMapping` (or `AgXToneMapping`, `NeutralToneMapping`) gives a filmic roll-off instead of harsh clipping; `renderer.toneMappingExposure` brightens or darkens everything. R3F enables ACES by default.
:::

## Shadows

Shadows in real-time graphics use **shadow maps**: the renderer draws the scene from the light's point of view into a depth image, then, when drawing from the camera, checks each pixel against that image to see whether something blocks the light.

:::def Shadow map
A depth image rendered from a light's point of view. Pixels farther from the light than the stored depth are in shadow. Its resolution (`shadow.mapSize`) and the volume it covers (`shadow.camera`) decide how sharp shadows look.
:::

Four switches are needed, and forgetting any one is the most common "my shadows don't work" bug:

```js run title="Shadows done properly" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;                           // ① the renderer
renderer.shadowMap.type = THREE.PCFShadowMap;                // soft-edged PCF (the default)
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e0f2fe");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(6, 5, 8);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#ffffff", "#94a3b8", 1.2));

const sun = new THREE.DirectionalLight("#ffffff", 2.5);
sun.position.set(5, 8, 3);
sun.castShadow = true;                                        // ② the light
sun.shadow.mapSize.set(2048, 2048);                           // sharper (costs memory)
const s = sun.shadow.camera;                                  // an orthographic box around the area that needs shadows
s.left = -5; s.right = 5; s.top = 5; s.bottom = -5; s.near = 1; s.far = 20;   // (call s.updateProjectionMatrix() if you change these later)
sun.shadow.bias = -0.0005;                                    // removes "shadow acne" stripes
sun.shadow.normalBias = 0.02;
scene.add(sun);
const helper = new THREE.CameraHelper(s);                     // visualise the shadow camera's box
helper.visible = false;
scene.add(helper);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: "#f1f5f9" }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;                                  // ③ objects that receive
scene.add(ground);

const mat = new THREE.MeshStandardMaterial({ color: "#6366f1", roughness: 0.4 });
const objects = [];
for (let i = 0; i < 7; i++) {
  const m = new THREE.Mesh(i % 2 ? new THREE.BoxGeometry(0.8, 0.8, 0.8) : new THREE.TorusKnotGeometry(0.35, 0.12, 100, 16), mat);
  m.position.set(Math.cos(i) * 2.6, 0.8 + (i % 3) * 0.5, Math.sin(i * 1.7) * 2.4);
  m.castShadow = true;                                        // ④ objects that cast
  m.receiveShadow = true;                                     //   (and receive each other's)
  scene.add(m);
  objects.push(m);
}

const ui = document.createElement("label");
ui.className = "overlay";
ui.innerHTML = `<span><input type="checkbox"> show shadow camera</span>`;
ui.querySelector("input").onchange = (e) => (helper.visible = e.target.checked);
document.body.appendChild(ui);

renderer.setAnimationLoop((t) => {
  objects.forEach((o, i) => { o.rotation.x = t / 1000 + i; o.rotation.y = t / 1400; });
  sun.position.x = Math.sin(t / 4000) * 6;                    // the sun moves; shadows follow
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

:::flow The four shadow switches
renderer.shadowMap.enabled = true | once per app
light.castShadow = true | Directional, Point or Spot
mesh.castShadow = true | things that block light
mesh.receiveShadow = true | things shadows land on
:::

### Tuning shadow quality

| Problem | Cause | Fix |
|---|---|---|
| Blocky, pixelated shadows | shadow map too small for the area it covers | shrink the shadow camera box to fit the scene, or raise `mapSize` (1024 → 2048) |
| Shadows cut off at an edge | objects outside the shadow camera | enlarge `shadow.camera` left/right/top/bottom/far (use `CameraHelper`) |
| Stripes/moiré on lit surfaces ("acne") | a surface shadows itself due to depth precision | small negative `shadow.bias` (e.g. −0.0005) and/or `normalBias` (0.01–0.05) |
| Shadow detached from the object ("peter-panning") | bias too large | reduce bias |
| Slow frames | many shadow-casting lights; point lights render 6 shadow views | one shadow-casting sun; bake the rest |

### Shadow types in three.js r186

| `renderer.shadowMap.type` | Look | Notes |
|---|---|---|
| `THREE.PCFShadowMap` (default) | soft edges | modernised in r182 with better sampling; the right choice for most scenes |
| `THREE.VSMShadowMap` | very soft, blurrable (`shadow.radius`, `shadow.blurSamples`) | can light-bleed where shadows overlap |
| `THREE.BasicShadowMap` | hard, aliased | cheapest; pixel-art looks |
| ~~`PCFSoftShadowMap`~~ | removed in r186 | three.js warns and falls back to PCF. Old tutorials still use it |

:::warn React Three Fiber and `shadows`
`<Canvas shadows>` in R3F 9 asks for `PCFSoftShadowMap`, which three.js r186 no longer has, so you'll see a warning in the console. Write `<Canvas shadows="percentage">` (PCF) or `shadows="variance"` (VSM) instead. You'll use this from Module 3 onwards.
:::

## Cheaper than real-time shadows

Real-time shadows are often the most expensive part of a frame, and on mobile or in VR you may not afford them. Alternatives used in production:

| Technique | How | Good for |
|---|---|---|
| **Baked lighting** | compute lighting and shadows in Blender, save them into textures (`lightMap`, `aoMap`) | static architecture, rooms, game levels |
| **Contact shadows** | render a blurred top-down silhouette under objects (drei `<ContactShadows>`) | product viewers, floating objects |
| **Blob shadows** | a soft dark circle texture under a character | games, mobile, crowds |
| **Ambient occlusion** | darken creases and corners (baked `aoMap`, or SSAO / N8AO post-processing) | adds grounding and depth cheaply |
| **Accumulative shadows** | average many randomised soft shadows over frames until they converge (drei) | photoreal still product shots |

```js run title="A fake 'blob' shadow — no shadow map at all" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.5, 5);
camera.lookAt(0, 0.5, 0);
scene.add(new THREE.HemisphereLight("#fff", "#94a3b8", 2));

// a radial gradient drawn on a 2D canvas → used as a texture
const c = document.createElement("canvas");
c.width = c.height = 128;
const ctx = c.getContext("2d");
const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
g.addColorStop(0, "rgba(0,0,0,0.55)");
g.addColorStop(1, "rgba(0,0,0,0)");
ctx.fillStyle = g;
ctx.fillRect(0, 0, 128, 128);
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6),
  new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2;
scene.add(blob);

const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), new THREE.MeshStandardMaterial({ color: "#f43f5e" }));
scene.add(ball);

renderer.setAnimationLoop((t) => {
  const h = Math.abs(Math.sin(t / 500)) * 1.8;            // bounce height
  ball.position.y = 0.4 + h;
  blob.scale.setScalar(1 - h * 0.3);                      // higher ball → smaller,
  blob.material.opacity = 1 - h * 0.45;                   // fainter shadow
  renderer.render(scene, camera);
});
```

## Check yourself

```quiz
? Which light behaves like the sun?
+ DirectionalLight
- PointLight
- AmbientLight
> Parallel rays from far away; position only sets the direction.

? Shadows don't appear. You enabled them on the renderer and the light. What else is needed?
+ castShadow on the objects and receiveShadow on the ground
- A second light
- MeshBasicMaterial
> All four switches are required.

? Your directional light's shadows are blocky. What's the best first fix?
+ Shrink the shadow camera box to tightly fit the area that needs shadows
- Add more lights
- Use a PointLight instead
> The same map pixels spread over a smaller area = sharper shadows.

? Why are point-light shadows expensive?
+ They render the scene into 6 shadow maps (one per cube face)
- Point lights don't support shadows
- They require transmission
> A point light shines in all directions, so it needs a cube of shadow views.

? A PointLight with intensity 1 at 6 m does almost nothing. Why?
+ Physical units: intensity falls off with distance², so it needs a much higher candela value
- Point lights are disabled by default
- The material is wrong
> Raise intensity to tens of candela at several metres.
```

:::exercise Day and night
Using the shadows example, add a button that toggles **night**: dim the hemisphere light, turn the sun's intensity to 0.2 and its colour to a cool blue, set the background to `#0f172a`, and add a warm `PointLight` (with `castShadow`) between the objects as a lamp.
:::

:::solution
```js run
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(6, 5, 8);
new OrbitControls(camera, renderer.domElement);
const hemi = new THREE.HemisphereLight("#fff", "#94a3b8", 1.2);
const sun = new THREE.DirectionalLight("#fff", 2.5);
sun.position.set(5, 8, 3);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
const lamp = new THREE.PointLight("#fbbf24", 12);
lamp.position.set(0, 1.5, 0);
lamp.castShadow = true;
lamp.visible = false;
scene.add(hemi, sun, lamp);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: "#f1f5f9" }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
for (let i = 0; i < 6; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1 + (i % 3) * 0.5, 0.7), new THREE.MeshStandardMaterial({ color: "#6366f1" }));
  m.position.set(Math.cos(i) * 2.2, m.geometry.parameters.height / 2, Math.sin(i) * 2.2);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}

let night = false;
function apply() {
  scene.background = new THREE.Color(night ? "#0f172a" : "#e0f2fe");
  hemi.intensity = night ? 0.15 : 1.2;
  sun.intensity = night ? 0.2 : 2.5;
  sun.color.set(night ? "#93c5fd" : "#ffffff");
  lamp.visible = night;
}
apply();
const btn = document.createElement("button");
btn.className = "overlay";
btn.textContent = "Toggle night";
btn.onclick = () => { night = !night; apply(); };
document.body.appendChild(btn);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```
:::

:::keypoints
- **Ambient/Hemisphere** = cheap fill; **Directional** = sun; **Point/Spot** = local accents; **RectArea** = soft panels.
- Intensities are **physical**: point and spot lights need much higher values and fall off with distance².
- Shadows need **four switches**: renderer, light, casters, receivers.
- Tune shadows with a tight **shadow camera**, `mapSize`, and `bias` / `normalBias`; use `CameraHelper` to see the box.
- r186 shadow types: **PCF** (default), **VSM**, **Basic**; `PCFSoftShadowMap` is gone, so use `shadows="percentage"` in R3F.
- Bake, fake (blob/contact shadows) or use AO when real-time shadows cost too much.
:::
