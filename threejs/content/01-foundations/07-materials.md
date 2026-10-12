---
title: Materials — How Surfaces Look
level: easy
time: 30
summary: Every built-in material and when to use it, physically based rendering (colour, roughness, metalness, environment), MeshPhysicalMaterial's glass, clear-coat and fabric, transparency pitfalls, and sharing materials efficiently.
---

The material is the **surface** half of a mesh: its colour, how shiny or rough it is, whether it is metal or glass, and how it reacts to light. Three.js materials range from "flat colour, ignore lighting" (cheap and great for UI) to "physically based glass with refraction" (beautiful and expensive). Choosing the cheapest material that looks right is a big part of making scenes fast.

:::def Material
An object that describes how a mesh's surface is drawn. Behind the scenes, three.js compiles each material type into a GPU **shader** program. Materials can be shared between many meshes.
:::

## The lineup

```js run title="Every common material, side by side" level=easy height=420
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();                       // draws HTML elements at 3D positions
labels.setSize(innerWidth, innerHeight);
labels.domElement.style.cssText = "position:absolute;top:0;pointer-events:none";
document.body.appendChild(labels.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.5, 9);
new OrbitControls(camera, renderer.domElement);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const light = new THREE.DirectionalLight("#ffffff", 2);
light.position.set(3, 4, 5);
scene.add(light, new THREE.AmbientLight("#ffffff", 0.3));

const color = "#22c55e";
const materials = {
  Basic: new THREE.MeshBasicMaterial({ color }),
  Lambert: new THREE.MeshLambertMaterial({ color }),
  Phong: new THREE.MeshPhongMaterial({ color, shininess: 80 }),
  Toon: new THREE.MeshToonMaterial({ color }),
  Standard: new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 }),
  Physical: new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1 }),
  Normal: new THREE.MeshNormalMaterial(),
  Depth: new THREE.MeshDepthMaterial(),
};
const geo = new THREE.TorusKnotGeometry(0.42, 0.15, 128, 24);
Object.entries(materials).forEach(([name, mat], i) => {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((i % 4 - 1.5) * 2.1, i < 4 ? 1.1 : -1.1, 0);
  const tag = document.createElement("div");
  tag.className = "label3d";
  tag.textContent = name;
  const label = new CSS2DObject(tag);
  label.position.y = -0.85;
  mesh.add(label);
  scene.add(mesh);
});

renderer.setAnimationLoop((t) => {
  scene.children.forEach((o) => { if (o.isMesh) o.rotation.y = t / 2000; });
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight);
});
```

| Material | Lighting | Cost | Use it for |
|---|---|---|---|
| `MeshBasicMaterial` | ignores lights | lowest | UI, unlit art, wireframes, video screens, baked lighting |
| `MeshLambertMaterial` | matte only (per vertex) | low | mobile, large low-poly worlds |
| `MeshPhongMaterial` | matte + plastic-like highlight | low–medium | stylised scenes, older look |
| `MeshToonMaterial` | banded cartoon shading | low–medium | cel-shaded games and illustrations |
| `MeshStandardMaterial` | **physically based** (PBR) | medium | the default for realistic scenes and glTF models |
| `MeshPhysicalMaterial` | PBR + clear-coat, transmission, sheen, iridescence… | high | car paint, glass, fabric, gems, product shots |
| `MeshNormalMaterial` | colour = surface direction | lowest | debugging normals, quick demos |
| `MeshDepthMaterial` | colour = distance | lowest | debugging, depth effects |
| `MeshMatcapMaterial` | a "matcap" image fakes lighting | low | sculpting looks, stylised previews without lights |

## Physically based rendering (PBR)

:::def PBR (physically based rendering)
A way of describing surfaces with a few physical properties, mainly **colour** (albedo), **roughness** and **metalness**, so they look right under any lighting. Artists in Blender, Substance and every game engine use the same model, which is why a glTF model exported from Blender looks the same in three.js.
:::

| Property | Range | Meaning |
|---|---|---|
| `color` | any colour | the base colour (for metals, the colour of reflections) |
| `roughness` | 0 → 1 | 0 = mirror-smooth sharp reflections, 1 = fully diffuse (chalk) |
| `metalness` | 0 or 1 (rarely in between) | 0 = plastic, wood, skin, paint; 1 = bare metal |
| `envMap` / `scene.environment` | a 360° image | what the surface reflects; PBR looks flat without one |
| `emissive` + `emissiveIntensity` | colour × strength | glowing parts (screens, LEDs) that don't need light |

The classic PBR chart: roughness increases left to right, metalness bottom to top.

```js run title="Roughness × metalness" level=easy
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;       // film-like handling of bright highlights
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1e293b");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 13);
new OrbitControls(camera, renderer.domElement);

const geo = new THREE.SphereGeometry(0.45, 48, 24);
for (let m = 0; m < 3; m++) {
  for (let r = 0; r < 6; r++) {
    const mat = new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: r / 5, metalness: m / 2 });
    const s = new THREE.Mesh(geo, mat);
    s.position.set((r - 2.5) * 1.15, (m - 1) * 1.2, 0);
    scene.add(s);
  }
}
const hud = document.createElement("div");
hud.className = "overlay";
hud.innerHTML = "<span>→ roughness 0 … 1</span><span>↑ metalness 0, 0.5, 1</span>";
document.body.appendChild(hud);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

:::tip PBR needs an environment
A metal sphere is a mirror: with nothing to reflect, it renders black. Always give realistic scenes an **environment map**. `RoomEnvironment` (above) is a free, built-in studio; real projects load an HDR image of a studio or outdoor scene (next module), or use drei's `<Environment preset="city" />` in R3F.
:::

## MeshPhysicalMaterial: glass, clear-coat, fabric

`MeshPhysicalMaterial` extends Standard with layers that product visualisation depends on:

| Property | Simulates | Example |
|---|---|---|
| `clearcoat`, `clearcoatRoughness` | a thin glossy layer on top | car paint, lacquered wood, carbon fibre |
| `transmission`, `thickness`, `ior` | light passing **through** (refraction) | glass, liquids, plastic bottles, gems |
| `sheen`, `sheenColor`, `sheenRoughness` | soft fuzz at grazing angles | velvet, cloth, fabric sofas |
| `iridescence` | thin-film rainbow | soap bubbles, beetles, coated lenses |
| `dispersion` | rainbow splitting of light | diamonds, prisms |
| `anisotropy` | stretched highlights | brushed metal, hair |

```js run title="Glass, car paint, velvet and a bubble" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e2e8f0");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 7);
new OrbitControls(camera, renderer.domElement);

// something colourful behind the glass, so you can see refraction
const stripes = new THREE.Group();
for (let i = 0; i < 9; i++) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 9, 0.8, 0.55) }));
  bar.position.set(-4 + i, 0.5, -2.5);
  stripes.add(bar);
}
scene.add(stripes);

const geo = new THREE.SphereGeometry(0.75, 64, 32);
const looks = [
  new THREE.MeshPhysicalMaterial({ transmission: 1, thickness: 1.2, ior: 1.5, roughness: 0.05 }),             // glass
  new THREE.MeshPhysicalMaterial({ color: "#b91c1c", metalness: 0.6, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.03 }), // car paint
  new THREE.MeshPhysicalMaterial({ color: "#4c1d95", roughness: 0.9, sheen: 1, sheenColor: "#c4b5fd", sheenRoughness: 0.4 }),   // velvet
  new THREE.MeshPhysicalMaterial({ transmission: 1, thickness: 0.05, roughness: 0, iridescence: 1, iridescenceIOR: 1.3 }),       // bubble
];
looks.forEach((mat, i) => {
  const s = new THREE.Mesh(geo, mat);
  s.position.x = (i - 1.5) * 1.8;
  scene.add(s);
});

renderer.setAnimationLoop((t) => {
  stripes.position.x = Math.sin(t / 2000) * 0.8;
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

:::warn Transmission is expensive
Each transmissive material makes the renderer draw the scene an extra time to see "through" it. One glass bottle on a product page is fine; fifty glass windows in a building are not. For architectural glass, a plain transparent `MeshStandardMaterial` with low opacity is far cheaper.
:::

## Common material settings

| Setting | Values | Notes |
|---|---|---|
| `side` | `FrontSide` (default), `BackSide`, `DoubleSide` | `DoubleSide` for planes and leaves; `BackSide` for "inside a sphere" skies |
| `transparent` + `opacity` | `true`, 0–1 | needs `transparent: true` or opacity is ignored |
| `wireframe` | `true` | show triangle edges |
| `flatShading` | `true` | faceted low-poly look |
| `vertexColors` | `true` | use the geometry's `color` attribute |
| `depthWrite` / `depthTest` | booleans | control overlap; turn `depthWrite` off for glowing transparent effects |
| `visible` | `false` | hide all meshes that use this material |

## Transparency pitfalls

GPUs draw opaque things first, then transparent ones sorted **by object**, back to front. Overlapping transparent objects, or one object overlapping itself, can sort wrongly and "pop". Toggle `depthWrite` below to see the difference on intersecting transparent planes:

```js run title="Sorting transparent objects" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.5, 1.5, 3.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;

const mats = ["#ef4444", "#22c55e", "#3b82f6"].map((color) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
mats.forEach((m, i) => {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  plane.rotation.y = (i * Math.PI) / 3;            // three planes cutting through each other
  scene.add(plane);
});

const ui = document.createElement("label");
ui.className = "overlay";
ui.innerHTML = `<span><input type="checkbox" checked> depthWrite (uncheck to fix the popping)</span>`;
document.body.appendChild(ui);
ui.querySelector("input").onchange = (e) => mats.forEach((m) => (m.depthWrite = e.target.checked));

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
```

Fixes, from simplest: avoid overlapping transparency in the design; set `depthWrite: false` on transparent materials (fine for glows, particles and glass panes); use `alphaTest: 0.5` for cut-outs like leaves and fences (pixels are either fully visible or discarded, no sorting needed); or control order with `mesh.renderOrder`.

## Sharing and changing materials

- Many meshes can share **one** material; changing its colour changes all of them. Clone (`mat.clone()`) when one object needs to differ, such as a hovered item.
- Changing values like `color`, `roughness` or `opacity` is cheap. Changing settings that alter the shader (turning `vertexColors`, `flatShading`, fog or a texture on/off) requires `material.needsUpdate = true` and a recompile, which can stutter.
- `material.dispose()` frees it when no longer needed.

## Check yourself

```quiz
? A metal sphere with MeshStandardMaterial renders almost black. What's missing most likely?
+ An environment map for it to reflect
- A higher metalness
- More segments
> Metals reflect their surroundings; give the scene an environment.

? Which material ignores lights entirely?
+ MeshBasicMaterial
- MeshStandardMaterial
- MeshLambertMaterial
> Basic draws the flat colour or texture as-is.

? You set `opacity: 0.5` and nothing changes. Why?
+ `transparent: true` is also required
- Opacity only works on Physical materials
- The renderer needs alpha: true
> Without transparent, three.js treats the material as opaque.

? Which property simulates glass that bends the light behind it?
- clearcoat
+ transmission (with ior and thickness)
- sheen
> Transmission renders what's behind the object, refracted.

? What does roughness = 0 look like?
+ A mirror-smooth surface with sharp reflections
- A matte, chalky surface
- A transparent surface
> 0 = smooth, 1 = rough.
```

:::exercise Highlight on hover (preview)
Make a row of 5 spheres sharing one `MeshStandardMaterial`. Then give the **middle** sphere its own `clone()` of the material with an orange `emissive` glow, so it looks "selected" while the others stay unchanged.
:::

:::solution
```js run
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 7;

const shared = new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.4 });
const geo = new THREE.SphereGeometry(0.5, 32, 16);
for (let i = 0; i < 5; i++) {
  const s = new THREE.Mesh(geo, i === 2 ? shared.clone() : shared);
  if (i === 2) {
    s.material.emissive.set("#f97316");      // only the clone changes
    s.material.emissiveIntensity = 0.8;
  }
  s.position.x = (i - 2) * 1.3;
  scene.add(s);
}
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```
In the Interaction lesson you'll do this when the mouse hovers over a sphere.
:::

:::keypoints
- Pick the **cheapest material that looks right**: Basic for unlit, Standard for realistic, Physical only where its extras matter.
- PBR = **colour + roughness + metalness** (+ an **environment** to reflect).
- `MeshPhysicalMaterial` adds clear-coat, transmission (glass), sheen (fabric), iridescence and more, at a cost.
- Transparency needs `transparent: true`; fix sorting with `depthWrite: false`, `alphaTest` or `renderOrder`.
- Share materials, `clone()` when one object must differ, and set `needsUpdate` only for shader-changing settings.
:::
