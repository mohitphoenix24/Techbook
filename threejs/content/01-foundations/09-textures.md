---
title: Textures & UV Mapping
level: intermediate
time: 35
summary: Loading images onto surfaces, colour spaces, UV coordinates, repeating and wrapping, a full PBR texture set (colour, normal, roughness, AO, displacement), textures drawn with canvas or generated from data, video, and how texture size affects memory.
---

Geometry gives a surface its shape; **textures** give it detail. A brick wall can be a flat plane with a photograph of bricks, plus a few extra images that tell the lighting where the mortar is recessed and which bricks are rough. Done right, a box with 12 triangles looks like a detailed object, which is why textures are the cheapest realism you can buy.

:::def Texture
An image (or video, canvas, or raw data) that a material samples per pixel. The most common is the colour **map**, but materials accept many more: normal maps, roughness maps, emissive maps and others, each changing one property across the surface.
:::

:::def UV coordinates
Two numbers `(u, v)` stored on each vertex that say **where on the image** that vertex sits: (0, 0) is the bottom-left corner, (1, 1) the top-right. The GPU interpolates them across each triangle. Built-in geometries come with UVs; models get them from artists "unwrapping" the mesh in Blender.
:::

## Loading a texture

A UV test grid shows how each built-in shape maps the image onto itself. Notice the seams on the sphere and the stretching at its poles:

```js run title="UV grid on different shapes" level=easy
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 6);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#555", 3));

const BASE = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/";
const texture = new THREE.TextureLoader().load(BASE + "textures/uv_grid_opengl.jpg");
texture.colorSpace = THREE.SRGBColorSpace;       // photos and colour maps are sRGB
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();   // sharper at grazing angles

const mat = new THREE.MeshStandardMaterial({ map: texture });
const shapes = [new THREE.BoxGeometry(1.3, 1.3, 1.3), new THREE.SphereGeometry(0.8, 48, 24), new THREE.CylinderGeometry(0.6, 0.6, 1.4, 48), new THREE.TorusGeometry(0.6, 0.25, 32, 64)];
shapes.forEach((g, i) => {
  const m = new THREE.Mesh(g, mat);
  m.position.x = (i - 1.5) * 2;
  scene.add(m);
});
renderer.setAnimationLoop((t) => {
  scene.children.forEach((o) => { if (o.isMesh) o.rotation.y = t / 2500; });
  renderer.render(scene, camera);
});
```

`TextureLoader.load()` returns a texture **immediately** and fills in the image when it arrives, so the scene renders straight away and the texture pops in. Use `loadAsync()` with `await` when you want to wait, or a `LoadingManager` to show progress (next module).

:::warn Colour space
Colour images (photos, `map`, `emissiveMap`) are stored in **sRGB** and need `texture.colorSpace = THREE.SRGBColorSpace`. **Data** textures (normal, roughness, metalness, AO, displacement maps) hold numbers, not colours: leave them at the default (linear). Getting this wrong makes colours look washed out or too dark. glTF models set this correctly for you.
:::

## Repeat, wrap and offset

A 1 m texture on a 10 m floor would be stretched 10×. Instead, **repeat** it: set wrapping to `RepeatWrapping` and choose how many times it tiles.

```js run title="Tiling a floor" level=easy
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0f172a");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3, 7);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#334", 2.5));

const BASE = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/";
const wood = new THREE.TextureLoader().load(BASE + "textures/hardwood2_diffuse.jpg");
wood.colorSpace = THREE.SRGBColorSpace;
wood.wrapS = wood.wrapT = THREE.RepeatWrapping;   // S = u (horizontal), T = v (vertical)
wood.repeat.set(4, 4);
wood.anisotropy = 8;

const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<label>repeat <input id="r" type="range" min="1" max="12" value="4"></label>
  <label>rotation <input id="rot" type="range" min="0" max="3.14" step="0.01" value="0"></label>
  <label><input id="scroll" type="checkbox"> scroll offset (conveyor belt)</label>`;
document.body.appendChild(ui);
ui.querySelector("#r").oninput = (e) => wood.repeat.set(+e.target.value, +e.target.value);
ui.querySelector("#rot").oninput = (e) => (wood.rotation = +e.target.value);
const scroll = ui.querySelector("#scroll");

renderer.setAnimationLoop((t) => {
  if (scroll.checked) wood.offset.y = (t / 4000) % 1;      // moving UVs = cheap animation
  renderer.render(scene, camera);
});
```

| Property | Meaning |
|---|---|
| `wrapS`, `wrapT` | `ClampToEdgeWrapping` (default, edge pixels stretch), `RepeatWrapping`, `MirroredRepeatWrapping` |
| `repeat.set(x, y)` | tiles across u and v |
| `offset.set(x, y)` | shifts the image (animate it for conveyor belts, water, scrolling screens) |
| `rotation`, `center` | rotate the image around a UV point |
| `magFilter` | when one texel covers many pixels: `LinearFilter` (smooth) or `NearestFilter` (crisp pixel art) |
| `minFilter` + mipmaps | when many texels fall in one pixel: three.js generates smaller copies (**mipmaps**) to avoid shimmering |
| `anisotropy` | keeps textures sharp on surfaces seen at a steep angle (floors, roads); up to 16 |

## A full PBR texture set

Real materials come as **sets** of images exported from Substance, Poly Haven or Quixel. Each slot controls one property:

| Material slot | Image holds | Colour space |
|---|---|---|
| `map` | base colour | sRGB |
| `normalMap` | fake surface bumps for lighting (purple-blue image) | linear |
| `roughnessMap` | where it's shiny vs. matte (green channel) | linear |
| `metalnessMap` | which parts are metal (blue channel) | linear |
| `aoMap` | baked ambient occlusion: dark creases (red channel) | linear |
| `displacementMap` | actually moves vertices (needs many segments) | linear |
| `emissiveMap` | glowing parts | sRGB |
| `alphaMap` | transparency mask (cut-outs) | linear |

```js run title="A brick wall: colour + bump + roughness" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#111827");
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(1.5, 0.5, 3.5);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.AmbientLight("#fff", 0.25));
const lamp = new THREE.PointLight("#ffedd5", 12);
scene.add(lamp);
lamp.add(new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: "#fff7ed" })));

const BASE = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/";
const loader = new THREE.TextureLoader();
const load = (file, srgb) => {
  const t = loader.load(BASE + file);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 2);
  return t;
};
const plain = new THREE.MeshStandardMaterial({ map: load("brick_diffuse.jpg", true), roughness: 0.9 });
const full = new THREE.MeshStandardMaterial({
  map: load("brick_diffuse.jpg", true),
  bumpMap: load("brick_bump.jpg"),           // a height image: lighting reacts to the mortar lines
  bumpScale: 4,
  roughnessMap: load("brick_roughness.jpg"),
});
const wall = new THREE.Mesh(new THREE.PlaneGeometry(2, 4), full);
scene.add(wall);

const ui = document.createElement("label");
ui.className = "overlay";
ui.innerHTML = `<span><input type="checkbox" checked> bump + roughness maps (move the light by watching it orbit)</span>`;
ui.querySelector("input").onchange = (e) => (wall.material = e.target.checked ? full : plain);
document.body.appendChild(ui);

renderer.setAnimationLoop((t) => {
  lamp.position.set(Math.sin(t / 1300) * 1.2, Math.cos(t / 1700) * 1.5, 0.6);   // the light sweeps across
  renderer.render(scene, camera);
});
```

Toggle the checkbox: with only a colour map the bricks look like a printed poster; with the bump and roughness maps the light rakes across the mortar and catches the bricks' edges. The geometry is the same two triangles either way.

:::def Normal map vs. bump map
Both fake small surface detail for lighting without adding triangles. A **bump map** is a greyscale height image; three.js derives slopes from it. A **normal map** stores the surface direction per pixel directly (the purple-blue images), which is more accurate and what glTF uses. A **displacement map** really moves vertices, so silhouettes change, but it needs a densely subdivided mesh.
:::

## Textures you draw: CanvasTexture

Any 2D `<canvas>` can be a texture. Draw text, charts, gauges or a whole HTML-like dashboard with the Canvas 2D API, then set `texture.needsUpdate = true` when it changes. This is how 3D scoreboards, price tags, name plates and in-world screens are made.

```js run title="A live scoreboard with CanvasTexture" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);
scene.add(new THREE.HemisphereLight("#fff", "#446", 2));

const canvas = document.createElement("canvas");
canvas.width = 512; canvas.height = 256;
const ctx = canvas.getContext("2d");
const texture = new THREE.CanvasTexture(canvas);
texture.colorSpace = THREE.SRGBColorSpace;

const screen = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.08), [
  ...Array(4).fill(new THREE.MeshStandardMaterial({ color: "#1f2937" })),
  new THREE.MeshBasicMaterial({ map: texture }),            // +z face: the screen (unlit, like a real display)
  new THREE.MeshStandardMaterial({ color: "#1f2937" }),
]);
scene.add(screen);

let sensor = 50;
function draw(t) {
  sensor += (Math.random() - 0.5) * 4;
  sensor = Math.min(95, Math.max(5, sensor));
  ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = "#34d399"; ctx.font = "bold 34px Inter, sans-serif";
  ctx.fillText("MOTOR 3 · TEMP", 28, 58);
  ctx.font = "bold 92px Inter, sans-serif";
  ctx.fillStyle = sensor > 80 ? "#f87171" : "#e5e7eb";
  ctx.fillText(`${sensor.toFixed(1)}°C`, 28, 160);
  ctx.fillStyle = "#1f2937"; ctx.fillRect(28, 192, 456, 26);
  ctx.fillStyle = sensor > 80 ? "#f87171" : "#34d399"; ctx.fillRect(28, 192, 456 * sensor / 100, 26);
  texture.needsUpdate = true;                               // re-upload the canvas to the GPU
}

let last = 0;
renderer.setAnimationLoop((t) => {
  if (t - last > 250) { draw(t); last = t; }                // redraw 4× per second, not every frame
  screen.rotation.y = Math.sin(t / 2000) * 0.5;
  renderer.render(scene, camera);
});
```

:::ai
In-world screens are central to **digital twins**: each machine gets a panel showing its live sensor values. The same CanvasTexture technique displays model outputs in 3D dashboards, and in VR it's a quick way to show text without an HTML overlay (WebXR sessions can't show normal HTML on top of the scene).
:::

## Textures from data: DataTexture

`DataTexture` builds an image from a typed array, one value per channel per pixel. Use it for procedural patterns, heat maps, lookup tables, or passing arrays of numbers to shaders.

```js run title="A heat map from a 2D array of numbers" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.6, 2.6);
camera.lookAt(0, 0, 0);

const W = 64, H = 64;
const data = new Uint8Array(W * H * 4);                     // RGBA, 0–255
const texture = new THREE.DataTexture(data, W, H);          // RGBAFormat, UnsignedByteType by default
texture.magFilter = THREE.LinearFilter;
texture.colorSpace = THREE.SRGBColorSpace;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: texture }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const cold = new THREE.Color("#1e3a8a"), warm = new THREE.Color("#facc15"), hot = new THREE.Color("#dc2626"), c = new THREE.Color();
const rgb = { r: 0, g: 0, b: 0 };     // THREE.Color works in linear space; the texture stores sRGB bytes
renderer.setAnimationLoop((t) => {
  const s = t / 1000;
  // two moving heat sources, e.g. machines on a factory floor
  const sources = [[32 + Math.sin(s) * 18, 32 + Math.cos(s * 0.7) * 18], [20, 44 + Math.sin(s * 1.3) * 10]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (const [sx, sy] of sources) v += Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / 90);
    v = Math.min(1, v);
    v < 0.5 ? c.lerpColors(cold, warm, v * 2) : c.lerpColors(warm, hot, (v - 0.5) * 2);
    c.getRGB(rgb, THREE.SRGBColorSpace);                    // convert before writing bytes
    const i = (y * W + x) * 4;
    data[i] = rgb.r * 255; data[i + 1] = rgb.g * 255; data[i + 2] = rgb.b * 255; data[i + 3] = 255;
  }
  texture.needsUpdate = true;
  renderer.render(scene, camera);
});
```

## Video textures

`new THREE.VideoTexture(videoElement)` puts a playing `<video>` onto any surface: in-world TVs, 360° video (on the inside of a sphere with `side: BackSide`), or webcam feeds for AR effects. It updates automatically each frame. Browsers only autoplay **muted** video, so set `video.muted = true` and `video.playsInline = true`, or start playback from a click.

```js
const video = Object.assign(document.createElement("video"), {
  src: "/media/demo.mp4", loop: true, muted: true, playsInline: true, crossOrigin: "anonymous",
});
video.play();
const tvTexture = new THREE.VideoTexture(video);
tvTexture.colorSpace = THREE.SRGBColorSpace;
screenMesh.material = new THREE.MeshBasicMaterial({ map: tvTexture });
```

## Texture memory

GPU memory is spent on the **decoded** image, not the file size. A texture costs width × height × 4 bytes, plus about a third more for mipmaps:

| Texture | JPEG on disk | On the GPU |
|---|---|---|
| 1024 × 1024 | ~200 KB | ~5.6 MB |
| 2048 × 2048 | ~700 KB | ~22 MB |
| 4096 × 4096 | ~3 MB | **~90 MB** |

Ten 4K textures can exhaust a phone's memory even though they downloaded quickly. Guidelines: use the smallest size that looks right at the distance it's seen; prefer 1K–2K for most objects; use powers of two (512, 1024, 2048) for best mipmapping; and for production, compress to **KTX2 / Basis Universal**, which stays compressed **on the GPU** (4–8× less memory) and is loaded with `KTX2Loader` (covered in the models lesson).

## Check yourself

```quiz
? What do UV coordinates describe?
+ Where on the texture image each vertex samples from
- The direction a surface faces
- The colour of each vertex
> u and v go from 0 to 1 across the image.

? Which textures need `colorSpace = THREE.SRGBColorSpace`?
+ Colour images like map and emissiveMap
- Normal and roughness maps
- All textures
> Data textures store numbers and must stay linear.

? A floor texture looks stretched and blurry. What should you set?
+ wrapS/wrapT = RepeatWrapping and a repeat count, plus anisotropy
- A larger PlaneGeometry
- magFilter = NearestFilter
> Tile it instead of stretching one image across 10 m.

? After drawing new content into a canvas used by a CanvasTexture, what's required?
- Nothing — it updates automatically
+ texture.needsUpdate = true
- material.needsUpdate = true
> The canvas must be re-uploaded to the GPU.

? Roughly how much GPU memory does a 4096×4096 RGBA texture with mipmaps use?
- About 3 MB
+ About 90 MB
- About 16 KB
> 4096 × 4096 × 4 bytes ≈ 67 MB, plus ~33% for mipmaps.
```

:::exercise A name tag
Make a function `makeLabel(text)` that draws `text` on a canvas (white rounded rectangle, dark text) and returns a `Mesh` with a `PlaneGeometry` sized to the canvas's aspect ratio. Place three labels with different names in a row.
:::

:::solution
```js run
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;

function makeLabel(text) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = "bold 48px Inter, sans-serif";
  c.width = Math.ceil(ctx.measureText(text).width) + 60;   // size the canvas to the text
  c.height = 90;
  ctx.font = "bold 48px Inter, sans-serif";                // resizing a canvas resets its state
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, 24); ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 30, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const h = 0.3;
  return new THREE.Mesh(new THREE.PlaneGeometry(h * c.width / c.height, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}
["Robot A", "Conveyor 2", "Station 12"].forEach((name, i) => {
  const label = makeLabel(name);
  label.position.x = (i - 1) * 1.4;
  scene.add(label);
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```
:::

:::keypoints
- Textures add detail without triangles; **UVs** map image coordinates onto vertices.
- Set `colorSpace = SRGBColorSpace` for colour maps only; data maps stay linear.
- Tile with `RepeatWrapping` + `repeat`; animate `offset` for cheap motion; use `anisotropy` on floors.
- A PBR set = map + normal/bump + roughness + metalness + AO (+ displacement, emissive, alpha).
- `CanvasTexture` for text and dashboards, `DataTexture` for generated data, `VideoTexture` for video; set `needsUpdate` when contents change.
- GPU memory ≈ width × height × 4 × 1.33: keep textures small and compress to **KTX2** in production.
:::
