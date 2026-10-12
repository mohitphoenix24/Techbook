---
title: Text, Lines, Curves & SVG
level: intermediate
time: 30
summary: Four ways to show text in 3D and when to use each, thin and thick (fat) lines, smooth curves and tubes, animated arcs between points on a globe, and turning SVG logos into extruded 3D shapes.
---

Data visualisations, maps, CAD viewers and dashboards are full of text, lines and paths: axis labels, flight routes, measurement lines, cable runs, logos. Each has a right tool in three.js, and the wrong one is often either slow or ugly.

## Four ways to show text

| Technique | Looks | Cost | Best for |
|---|---|---|---|
| **HTML overlay** (`CSS2DRenderer`, drei `<Html>`) | perfectly crisp, selectable, accessible | DOM per label; hundreds are fine, thousands are not | tooltips, labels, panels, forms |
| **SDF text** (troika-three-text, drei `<Text>`) | crisp at any size, real 3D object (occluded, lit, in VR) | low: one quad per glyph | labels in the scene, VR UI, signs |
| **CanvasTexture** | a picture of text on a plane | low; blurry when close | dynamic screens, name tags |
| **TextGeometry** | real extruded 3D letters | **high**: thousands of triangles per word | titles, logos, hero text |

:::def SDF (signed distance field) text
A font technique that stores, for each pixel of a glyph texture, the distance to the letter's edge. The shader reconstructs a sharp edge at any zoom level from a small texture. It's how game engines, VR apps and drei's `<Text>` render crisp text cheaply.
:::

### Extruded 3D text

```js run title="TextGeometry: a metallic 3D title" level=intermediate
import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
camera.position.set(0, 0.5, 7);
new OrbitControls(camera, renderer.domElement);

// typeface.json fonts are made from TTF/OTF with the facetype.js converter
const font = await new FontLoader().loadAsync("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/fonts/helvetiker_bold.typeface.json");
const geometry = new TextGeometry("ThreeLab", {
  font,
  size: 1,               // letter height in metres
  depth: 0.3,            // extrusion depth
  curveSegments: 8,      // smoothness of curved letters
  bevelEnabled: true,
  bevelThickness: 0.04,
  bevelSize: 0.03,
  bevelSegments: 4,
});
geometry.center();       // pivot in the middle
const text = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#34d399", metalness: 0.8, roughness: 0.2 }));
scene.add(text);

const hud = document.createElement("div");
hud.className = "overlay";
hud.textContent = `${(geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3 | 0} triangles for 8 letters`;
document.body.appendChild(hud);

renderer.setAnimationLoop((t) => {
  text.rotation.y = Math.sin(t / 1500) * 0.4;
  renderer.render(scene, camera);
});
```

Check the triangle count in the corner: one short word costs tens of thousands of triangles. Fine for a hero title, wasteful for 500 labels. For labels, use SDF text: in plain three.js the **troika-three-text** library, in R3F drei's `<Text>` (Module 3).

## Lines

Three.js has three basic line objects that share `LineBasicMaterial` / `LineDashedMaterial`:

| Object | Draws |
|---|---|
| `THREE.Line` | a connected path through all points |
| `THREE.LineLoop` | the same, closed back to the start |
| `THREE.LineSegments` | separate segments: points 0–1, 2–3, 4–5… (grids, wireframes, edges) |

:::warn `linewidth` doesn't work
Because of how WebGL works, basic lines are always **1 pixel** wide on almost every platform; `linewidth` is ignored. For thick lines use **`Line2`** with `LineMaterial` from `three/addons/lines/`, which builds lines from triangles and supports pixel or world-unit widths, dashes and per-vertex colours.
:::

```js run title="Thin lines vs. fat lines (Line2)" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 4, 10);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.GridHelper(12, 12, "#94a3b8", "#cbd5e1"));

// a "sensor reading" over time as a 3D path
const pts = [];
for (let i = 0; i <= 200; i++) {
  const x = -5 + i * 0.05;
  pts.push(new THREE.Vector3(x, 1.2 + Math.sin(x * 1.3) * 0.8 + Math.sin(x * 4.7) * 0.2, 0));
}

// thin: always 1 px
const thin = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#64748b" }));
thin.position.z = 1.5;
scene.add(thin);

// fat: width in pixels, gradient colours, optional dashes
const lineGeo = new LineGeometry().setFromPoints(pts);
const colors = [];
pts.forEach((p) => { const c = new THREE.Color().setHSL(0.6 - (p.y - 0.2) / 2.2 * 0.6, 0.9, 0.5); colors.push(c.r, c.g, c.b); });
lineGeo.setColors(colors);
const fatMat = new LineMaterial({ linewidth: 6, vertexColors: true, dashed: false, dashSize: 0.3, gapSize: 0.15 });   // linewidth in pixels
const fat = new Line2(lineGeo, fatMat);
fat.computeLineDistances();             // needed for dashes
scene.add(fat);

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<label>width (px) <input type="range" min="1" max="20" value="6"></label><label><input type="checkbox"> dashed</label>`;
ui.querySelector("input[type=range]").oninput = (e) => (fatMat.linewidth = +e.target.value);
ui.querySelector("input[type=checkbox]").onchange = (e) => (fatMat.dashed = e.target.checked);
document.body.appendChild(ui);

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

`EdgesGeometry(geometry, thresholdAngle)` + `LineSegments` draws only the sharp edges of a mesh: the classic "technical drawing" look for CAD viewers and architectural models.

## Curves and tubes

Three.js's curve classes return points along smooth paths. Use them for camera rails (Module 1), cables and pipes (`TubeGeometry`), roads, and, very commonly, **arcs between locations** on a map or globe:

| Curve | Defined by |
|---|---|
| `LineCurve3` | two points |
| `QuadraticBezierCurve3` | start, one control point, end |
| `CubicBezierCurve3` | start, two control points, end |
| `CatmullRomCurve3` | any number of points it passes **through** (`closed`, `tension`) |
| `EllipseCurve`, `ArcCurve` | 2D circles and ellipses |

Every curve has `getPoint(t)` / `getPointAt(t)` (t from 0 to 1; the `At` version spaces points evenly by length), `getPoints(n)`, `getTangent(t)` and `getLength()`.

```js run title="Animated flight arcs on a globe" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#020617");
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 6.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

const R = 2;
const earthMap = new THREE.TextureLoader().load("https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/planets/earth_atmos_2048.jpg");
earthMap.colorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32), new THREE.MeshBasicMaterial({ map: earthMap })));

// latitude/longitude (degrees) → a point on the sphere (matches three's sphere UV layout)
function latLon(lat, lon, radius = R) {
  const phi = THREE.MathUtils.degToRad(90 - lat), theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}
const cities = { Bengaluru: [12.97, 77.59], London: [51.5, -0.13], "New York": [40.71, -74.0], Tokyo: [35.68, 139.69], Sydney: [-33.87, 151.21], "São Paulo": [-23.55, -46.63], Nairobi: [-1.29, 36.82] };
const routes = [["Bengaluru", "London"], ["Bengaluru", "Tokyo"], ["London", "New York"], ["New York", "São Paulo"], ["Tokyo", "Sydney"], ["Nairobi", "London"], ["Bengaluru", "Sydney"]];

for (const [name, [lat, lon]] of Object.entries(cities)) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: "#fbbf24" }));
  dot.position.copy(latLon(lat, lon, R * 1.005));
  scene.add(dot);
}

const arcs = routes.map(([a, b], i) => {
  const start = latLon(...cities[a]), end = latLon(...cities[b]);
  // the control point sits above the midpoint, higher for longer routes
  const mid = start.clone().add(end).multiplyScalar(0.5);
  mid.normalize().multiplyScalar(R + start.distanceTo(end) * 0.45);
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
  const geo = new THREE.TubeGeometry(curve, 64, 0.008, 6, false);
  const line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.45 + i * 0.07, 0.9, 0.6) }));
  scene.add(line);
  return { line, total: geo.index.count, delay: i * 0.4 };
});

renderer.setAnimationLoop((t) => {
  const s = t / 1000;
  for (const a of arcs) {
    const k = THREE.MathUtils.clamp(((s - a.delay) % 4) / 2, 0, 1);     // draw over 2 s, hold, repeat
    a.line.geometry.setDrawRange(0, Math.floor(a.total * k / 3) * 3);   // reveal the tube progressively
  }
  controls.update();
  renderer.render(scene, camera);
});
```

`setDrawRange(start, count)` draws only part of a geometry's index, which makes "growing" lines nearly free: no geometry is rebuilt per frame.

## SVG to 3D

`SVGLoader` turns SVG paths (logos, icons, floor plans, map regions) into three.js `Shape`s that you can fill flat (`ShapeGeometry`) or extrude:

```js run title="An SVG logo, extruded" level=intermediate
import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 0, 220);
new OrbitControls(camera, renderer.domElement);

// any SVG works; here: a hexagon with a lightning bolt cut out (fill-rule evenodd makes the hole)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path fill="#10b981" fill-rule="evenodd" d="M50 2 L92 26 L92 74 L50 98 L8 74 L8 26 Z M56 14 L28 56 L46 56 L40 86 L72 42 L54 42 Z"/>
  <path fill="#4f46e5" d="M50 2 L92 26 L50 50 L8 26 Z" transform="translate(0 110) scale(1 0.3)"/>
</svg>`;
const data = new SVGLoader().parse(svg);
const logo = new THREE.Group();
for (const path of data.paths) {
  const material = new THREE.MeshStandardMaterial({ color: path.color, metalness: 0.4, roughness: 0.35 });
  for (const shape of path.toShapes()) {             // (SVGLoader.createShapes was deprecated in r186)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.2, bevelSegments: 3 });
    logo.add(new THREE.Mesh(geo, material));
  }
}
logo.scale.y = -1;                                 // SVG's y axis points down, three's points up
new THREE.Box3().setFromObject(logo).getCenter(logo.position).multiplyScalar(-1);
const pivot = new THREE.Group();
pivot.add(logo);
scene.add(pivot);

renderer.setAnimationLoop((t) => {
  pivot.rotation.y = Math.sin(t / 1200) * 0.6;
  renderer.render(scene, camera);
});
```

:::tip Floor plans and maps
The same loader turns an architect's SVG floor plan into extruded walls (one `ExtrudeGeometry` per wall path), and a country map exported as SVG into a 3D choropleth where each region's extrusion depth encodes a value. For GeoJSON (the usual map format), convert coordinates to `Shape`s yourself or use libraries like `three-geojson-geometry`.
:::

## Check yourself

```quiz
? Which text technique stays crisp at any distance and works inside VR, at low cost?
+ SDF text (troika / drei Text)
- TextGeometry
- CanvasTexture
> SDF reconstructs sharp edges from a small texture.

? Why does `linewidth: 5` on LineBasicMaterial usually do nothing?
+ WebGL draws basic lines at 1 pixel on most platforms; use Line2/LineMaterial for thick lines
- linewidth is in metres
- It requires a GPU flag
> Fat lines are built from triangles instead.

? What's the difference between getPoint(t) and getPointAt(t) on a curve?
+ getPointAt spaces points evenly by arc length; getPoint uses the curve's raw parameter
- getPointAt is in local space
- They are identical
> Use getPointAt for constant-speed motion along a path.

? How do you "grow" a line over time without rebuilding geometry?
+ geometry.setDrawRange(0, n) with an increasing n
- Recreate the TubeGeometry every frame
- Change the material opacity
> Draw range limits how many indices are drawn.

? Why flip `scale.y = -1` after loading SVG shapes?
+ SVG's y axis points down while three.js's points up
- SVG units are inches
- To fix the winding order only
> Otherwise the logo appears upside down.
```

:::exercise Measurement tool
Click two points on a ground plane (raycasting from Module 1) and draw a `Line2` between them, with an HTML label at the midpoint showing the distance in metres to 2 decimals. A third click starts a new measurement.
:::

:::solution
```js run
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 8, 8);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.GridHelper(10, 10));
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const label = Object.assign(document.createElement("div"), { className: "label3d" });
label.style.cssText = "position:absolute;left:0;top:0;display:none";
document.body.appendChild(label);
const mat = new LineMaterial({ color: "#f43f5e", linewidth: 4 });
let points = [], line = null, down = new THREE.Vector2();

renderer.domElement.addEventListener("pointerdown", (e) => down.set(e.clientX, e.clientY));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
  if (!p) return;
  if (points.length === 2) { points = []; scene.remove(line); label.style.display = "none"; }
  points.push(p);
  if (points.length === 2) {
    line = new Line2(new LineGeometry().setFromPoints(points), mat);
    scene.add(line);
    label.textContent = `${points[0].distanceTo(points[1]).toFixed(2)} m`;
    label.style.display = "";
  }
});
const mid = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  if (points.length === 2) {
    mid.addVectors(points[0], points[1]).multiplyScalar(0.5).project(camera);
    label.style.transform = `translate(-50%, -150%) translate(${(mid.x + 1) / 2 * innerWidth}px, ${(1 - mid.y) / 2 * innerHeight}px)`;
  }
});
```
:::

:::keypoints
- Text: **HTML** for UI labels, **SDF** (troika / drei `<Text>`) for in-scene and VR text, **CanvasTexture** for dynamic screens, **TextGeometry** only for hero titles.
- Basic lines are 1 px; use **Line2 + LineMaterial** for width, dashes and gradients; `EdgesGeometry` for CAD-style outlines.
- Curves (`QuadraticBezierCurve3`, `CatmullRomCurve3`…) give points, tangents and lengths; `TubeGeometry` turns them into pipes.
- `setDrawRange` animates growing paths cheaply; arcs over a globe use a lifted midpoint as control point.
- `SVGLoader` + `ExtrudeGeometry` turn logos, plans and maps into 3D (flip Y).
:::
