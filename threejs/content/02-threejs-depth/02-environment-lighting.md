---
title: Environment Maps, HDR & Tone Mapping
level: intermediate
time: 30
summary: Image-based lighting with HDR environments, the difference between scene.environment and scene.background, blur, intensity and rotation, grounded skyboxes, tone mapping operators and exposure, and colour management — the recipe behind every photoreal product shot.
---

Photographers light products with softboxes and reflectors; 3D artists light them with **pictures of light**. A single 360° HDR photograph of a studio or a street, wrapped around the scene, gives every object realistic reflections, soft ambient light and believable colour, usually with no extra lights at all. This technique, image-based lighting, is behind nearly every photoreal 3D product page.

:::def Environment map
A 360° image surrounding the scene that materials **reflect** and are **lit by**. In three.js, `scene.environment` lights every PBR material; `scene.background` decides what you see behind objects. They can be the same image or different ones.
:::

:::def HDR (high dynamic range) image
An image that stores real light intensities, so the sun can be thousands of times brighter than a shadow instead of clipping at "white". `.hdr` (Radiance) and `.exr` are the common formats; **Ultra HDR** JPEGs pack HDR into a much smaller JPEG. Free, high-quality HDRIs come from **Poly Haven**.
:::

## Lighting with an HDR

```js run title="An HDR environment: lighting, reflections, background" level=intermediate height=440
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.6, 5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const BASE = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/equirectangular/";
const hdr = await new HDRLoader().loadAsync(BASE + "venice_sunset_1k.hdr");
hdr.mapping = THREE.EquirectangularReflectionMapping;      // a 2:1 panorama
scene.environment = hdr;                                   // lights and reflects in every PBR material
scene.background = hdr;                                    // and is visible behind
scene.backgroundBlurriness = 0.35;                         // soften the background (product-shot look)

// No lights at all in this scene: everything comes from the image
const geo = new THREE.SphereGeometry(0.6, 64, 32);
[
  { color: "#ffffff", metalness: 1, roughness: 0 },        // chrome
  { color: "#d97706", metalness: 1, roughness: 0.35 },     // brushed gold
  { color: "#f8fafc", metalness: 0, roughness: 0.6 },      // matte white plastic
  { color: "#0f766e", metalness: 0, roughness: 0.08 },     // glossy paint
].forEach((p, i) => {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(p));
  m.position.x = (i - 1.5) * 1.45;
  scene.add(m);
});

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `
  <label>blur <input id="blur" type="range" min="0" max="1" step="0.01" value="0.35"></label>
  <label>env intensity <input id="int" type="range" min="0" max="3" step="0.01" value="1"></label>
  <label>env rotation <input id="rot" type="range" min="0" max="6.28" step="0.01" value="0"></label>
  <label><input id="bg" type="checkbox" checked> show background</label>`;
document.body.appendChild(ui);
ui.oninput = () => {
  scene.backgroundBlurriness = +ui.querySelector("#blur").value;
  scene.environmentIntensity = +ui.querySelector("#int").value;
  scene.environmentRotation.y = scene.backgroundRotation.y = +ui.querySelector("#rot").value;
  scene.background = ui.querySelector("#bg").checked ? hdr : new THREE.Color("#e2e8f0");
};

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

Rotate the environment and watch the highlights slide across the spheres: art directors use exactly this to put a reflection where it flatters the product. Turn the background off and the spheres are *still* lit by the sunset, which is the usual product-page setup: realistic lighting on a clean studio colour.

| Scene property | What it does |
|---|---|
| `scene.environment` | default env map for all Standard/Physical materials |
| `scene.environmentIntensity` | scales its lighting |
| `scene.environmentRotation` | rotates it (an `Euler`) |
| `scene.background` | Color, Texture, or the HDR itself |
| `scene.backgroundBlurriness` | 0 = sharp, 1 = fully blurred |
| `scene.backgroundIntensity`, `scene.backgroundRotation` | brightness and rotation of the background only |
| `material.envMap`, `material.envMapIntensity` | per-material override |

:::def PMREM (prefiltered mipmapped radiance environment map)
A pre-blurred set of versions of the environment used for rough surfaces: a rough material samples a blurrier copy. Three.js builds it automatically when you assign an equirectangular texture to `scene.environment`. `PMREMGenerator` does it manually, for example from a scene (`fromScene(new RoomEnvironment())`, which you've used already).
:::

## Smaller HDRs: Ultra HDR JPEG

A 1K `.hdr` is about 1.4 MB; a 2K Ultra HDR JPEG is about 0.5 MB with similar quality, because it stores a normal JPEG plus a small "gain map" describing how much brighter each pixel really is. Swap the loader:

```js
import { UltraHDRLoader } from "three/addons/loaders/UltraHDRLoader.js";
const env = await new UltraHDRLoader().loadAsync(".../equirectangular/royal_esplanade_2k.hdr.jpg");
env.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = env;
```

Poly Haven offers every HDRI as Ultra HDR JPEG, and in R3F drei's `<Environment files="…">` loads all three formats.

## Standing on the ground: GroundedSkybox

A normal background is "infinitely far away", so objects seem to float in front of it. `GroundedSkybox` projects the lower half of the panorama onto a ground plane, so a car looks parked *in* the street photo:

```js run title="A model grounded in an HDR scene" level=intermediate
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { GroundedSkybox } from "three/addons/objects/GroundedSkybox.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(-5, 1.8, 6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.5, 0);
controls.maxPolarAngle = THREE.MathUtils.degToRad(88);   // stay above the ground
controls.enableDamping = true;

const EX = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/";
const hdr = await new HDRLoader().loadAsync(EX + "textures/equirectangular/blouberg_sunrise_2_1k.hdr");
hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = hdr;
const sky = new GroundedSkybox(hdr, 15, 100);           // camera height the photo was taken at (m), radius
sky.position.y = 15 - 0.01;
scene.add(sky);

const draco = new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
const { scene: car } = await new GLTFLoader().setDRACOLoader(draco).loadAsync(EX + "models/gltf/ferrari.glb");
car.getObjectByName("body").material = new THREE.MeshPhysicalMaterial({   // the part named "body" gets car paint
  color: "#b91c1c", metalness: 0.9, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.03,
});
scene.add(car);

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

## Tone mapping and exposure

Lighting values in a physically based scene easily exceed 1.0 ("brighter than white"). **Tone mapping** compresses them into what a screen can show, like a camera's film or sensor curve. The operator changes the look a lot; compare them here:

```js run title="Tone mapping operators and exposure" level=intermediate
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.5, 4.5);
new OrbitControls(camera, renderer.domElement);

const hdr = await new HDRLoader().loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/equirectangular/quarry_01_1k.hdr");
hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = scene.background = hdr;

const colors = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6"];
colors.forEach((c, i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.38, 48, 24), new THREE.MeshStandardMaterial({ color: c, roughness: 0.25 }));
  m.position.x = (i - 2) * 0.9;
  scene.add(m);
});
const sun = new THREE.DirectionalLight("#ffffff", 6);       // deliberately strong: highlights > 1.0
sun.position.set(2, 3, 2);
scene.add(sun);

const ops = { None: THREE.NoToneMapping, Linear: THREE.LinearToneMapping, Reinhard: THREE.ReinhardToneMapping,
  Cineon: THREE.CineonToneMapping, ACESFilmic: THREE.ACESFilmicToneMapping, AgX: THREE.AgXToneMapping, Neutral: THREE.NeutralToneMapping };
const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<select>${Object.keys(ops).map((k) => `<option ${k === "ACESFilmic" ? "selected" : ""}>${k}</option>`).join("")}</select>
  <label>exposure <input type="range" min="0.1" max="3" step="0.01" value="1"></label>`;
document.body.appendChild(ui);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
ui.querySelector("select").onchange = (e) => (renderer.toneMapping = ops[e.target.value]);
ui.querySelector("input").oninput = (e) => (renderer.toneMappingExposure = +e.target.value);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

| Operator | Character | Good for |
|---|---|---|
| `NoToneMapping` | values clip at white: harsh, blown highlights | UI, unlit/flat art, exact brand colours |
| `ACESFilmicToneMapping` | contrasty film look, saturated colours shift in bright areas | games, dramatic scenes (R3F's default) |
| `AgXToneMapping` | gentle, natural highlight roll-off, colours stay true (Blender's default) | realistic scenes, matching Blender renders |
| `NeutralToneMapping` | keeps base colours accurate, only compresses highlights | **e-commerce**: product colours must match the real thing |
| `Reinhard`, `Cineon`, `Linear` | older curves | specific looks |

:::tip Product colours must match reality
A customer who orders the "forest green" sneaker expects that exact green. ACES shifts hues noticeably; **Neutral** tone mapping was designed by Khronos for commerce, so configurators should prefer it (or AgX). Check colours against the physical sample.
:::

## Colour management in one minute

Three.js does the right thing by default, as long as inputs are labelled:

1. **Colours you type** (`"#22c55e"`, `color.set(...)`) are treated as sRGB and converted to linear for lighting math (`THREE.ColorManagement.enabled = true`).
2. **Colour textures** must be marked `texture.colorSpace = THREE.SRGBColorSpace`; data textures stay linear (GLTFLoader handles this).
3. Lighting is computed in **linear** space, then tone mapped and converted to the screen's sRGB on output (`renderer.outputColorSpace = THREE.SRGBColorSpace`, the default).

If colours look washed out or too dark, check step 2 first.

## Where to get environments

| Source | What |
|---|---|
| **Poly Haven** (polyhaven.com) | hundreds of free CC0 HDRIs at 1K–16K, plus Ultra HDR JPEGs |
| `RoomEnvironment` | a procedural studio built into three.js: no download |
| drei `<Environment preset="…">` | `city`, `studio`, `sunset`, `warehouse`, `forest`… presets (R3F) |
| drei `<Lightformer>` | build your own studio from glowing panels, rendered into an env map |
| a photographer | for brand work, shoot an HDRI of the real retail space or studio |

Use **1K** HDRs for lighting-only (reflections on rough materials don't need detail) and higher resolutions only when the background is visible and sharp.

## Check yourself

```quiz
? What's the difference between scene.environment and scene.background?
+ environment lights and reflects in PBR materials; background is what's drawn behind objects
- They are two names for the same thing
- background lights the scene; environment is decorative
> They're independent: lit by a sunset, shown on a white backdrop is a common setup.

? Why do HDR images matter for lighting?
+ They store real light intensities beyond white, so bright sources light the scene correctly
- They have higher resolution
- They load faster than JPEG
> Clipped LDR images can't tell a lamp from a white wall.

? Which tone mapping is designed to keep product colours accurate?
- ACESFilmic
- None
+ Neutral
> Khronos PBR Neutral preserves base colours for commerce.

? An object seems to float in front of a street HDRI. What helps?
+ GroundedSkybox, which projects the panorama onto a ground
- Increasing environmentIntensity
- backgroundBlurriness = 1
> It gives the photo a floor the object can stand on.

? Which property rotates the lighting from the environment?
+ scene.environmentRotation
- camera.rotation
- hdr.rotation
> Rotate to move highlights where you want them.
```

:::exercise Studio vs. sunset
Load two HDRs (`ferndale_studio_04_1k.hdr` and `venice_sunset_1k.hdr` from the same folder) and add two buttons that switch `scene.environment` between them while the background stays a plain `#f1f5f9`. Use a glossy red sphere and a chrome sphere to compare.
:::

:::solution
```js run
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#f1f5f9");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.4, 4);
new OrbitControls(camera, renderer.domElement);

const BASE = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/equirectangular/";
const loader = new HDRLoader();
const [studio, sunset] = await Promise.all(["ferndale_studio_04_1k.hdr", "venice_sunset_1k.hdr"].map((f) => loader.loadAsync(BASE + f)));
for (const t of [studio, sunset]) t.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = studio;

const geo = new THREE.SphereGeometry(0.7, 64, 32);
const red = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: "#dc2626", roughness: 0.15, clearcoat: 1 }));
const chrome = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.02 }));
red.position.x = -0.85; chrome.position.x = 0.85;
scene.add(red, chrome);

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<div class="row"><button data-e="studio">Studio</button><button data-e="sunset">Sunset</button></div>`;
ui.onclick = (e) => e.target.dataset.e && (scene.environment = e.target.dataset.e === "studio" ? studio : sunset);
document.body.appendChild(ui);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```
:::

:::keypoints
- **Image-based lighting**: an HDR panorama on `scene.environment` gives realistic light and reflections with no lights.
- `scene.background` is independent: blur it, rotate it, or use a plain colour.
- Load `.hdr` with **HDRLoader** (RGBELoader was renamed), `.exr` with EXRLoader, smaller **Ultra HDR JPEGs** with UltraHDRLoader.
- **GroundedSkybox** puts objects on the ground of a photo.
- Pick tone mapping deliberately: **Neutral/AgX** for accurate colours, **ACES** for drama; tune `toneMappingExposure`.
- Colour textures are sRGB, data textures linear; three.js handles the rest.
:::
