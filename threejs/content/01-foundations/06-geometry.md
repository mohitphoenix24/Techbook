---
title: Geometry — Shapes from Primitives to Custom Meshes
level: easy
time: 30
summary: The built-in shapes and their parameters, how BufferGeometry stores vertices, indices, normals and UVs, building your own geometry, editing vertices for terrain and animation, and shapes from 2D outlines with Lathe and Extrude.
---

A geometry is the **shape** half of a mesh: where the vertices are and how they connect into triangles. Three.js ships about twenty ready-made shapes, and every one of them, plus every model you load, is the same underlying class: `BufferGeometry`. Once you can read and write its buffers, you can generate terrain, animate flags, build shapes from data, and understand what loaders hand you.

## The built-in shapes

```js run title="Geometry gallery" level=easy height=440
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 4, 11);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#ffffff", "#334155", 1.5));
const sun = new THREE.DirectionalLight("#ffffff", 2);
sun.position.set(3, 5, 4);
scene.add(sun);

const shapes = {
  Box: new THREE.BoxGeometry(1, 1, 1),
  Sphere: new THREE.SphereGeometry(0.6, 32, 16),
  Cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1.1, 32),
  Cone: new THREE.ConeGeometry(0.6, 1.2, 32),
  Torus: new THREE.TorusGeometry(0.5, 0.18, 16, 48),
  TorusKnot: new THREE.TorusKnotGeometry(0.4, 0.14, 120, 16),
  Capsule: new THREE.CapsuleGeometry(0.35, 0.6, 8, 16),
  Icosahedron: new THREE.IcosahedronGeometry(0.6, 0),
  Dodecahedron: new THREE.DodecahedronGeometry(0.6),
  Octahedron: new THREE.OctahedronGeometry(0.65),
  Plane: new THREE.PlaneGeometry(1.1, 1.1),
  Ring: new THREE.RingGeometry(0.3, 0.6, 32),
};
const names = Object.keys(shapes);
names.forEach((name, i) => {
  const mesh = new THREE.Mesh(shapes[name], new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(i / names.length, 0.65, 0.55), side: THREE.DoubleSide, roughness: 0.4,
  }));
  mesh.position.set((i % 4 - 1.5) * 2.4, 1.6 - Math.floor(i / 4) * 2.2, 0);
  mesh.name = name;
  scene.add(mesh);
});

const label = document.createElement("div");
label.className = "overlay";
label.textContent = names.join(" · ");
document.body.appendChild(label);

renderer.setAnimationLoop((t) => {
  scene.traverse((o) => { if (o.isMesh) { o.rotation.y = t / 1500; o.rotation.x = t / 3000; } });
  renderer.render(scene, camera);
});
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

| Geometry | Key parameters | Typical use |
|---|---|---|
| `BoxGeometry` | width, height, depth, segments | crates, buildings, UI panels |
| `SphereGeometry` | radius, widthSegments, heightSegments | planets, balls, markers |
| `PlaneGeometry` | width, height, segments | floors, walls, terrain, images |
| `CylinderGeometry` | radiusTop, radiusBottom, height, radialSegments | pipes, columns, robot joints |
| `ConeGeometry` | radius, height, radialSegments | arrows, trees, cursors |
| `CapsuleGeometry` | radius, height, capSegments, radialSegments | characters, physics bodies |
| `TorusGeometry` / `TorusKnotGeometry` | radius, tube, segments | rings, demos |
| `CircleGeometry` / `RingGeometry` | radius (inner/outer), segments, theta | markers, gauges, pie slices |
| `Icosahedron` / `Dodecahedron` / `Octahedron` / `Tetrahedron` | radius, detail | low-poly art, dice; `detail` > 0 makes a geodesic sphere |
| `LatheGeometry` | 2D profile points | vases, bottles, wheels |
| `ExtrudeGeometry` | a 2D `Shape` + depth, bevel | logos, floor plans, text |
| `TubeGeometry` | a 3D curve + radius | cables, paths, roller coasters |
| `ShapeGeometry` | a 2D `Shape` | flat outlines, map regions |

:::tip Segments are a quality knob
Curved shapes take segment counts. More segments look smoother and cost more triangles. A sphere that covers half the screen needs ~64×32; a 5-pixel marker is fine with 12×6. Pick per use, not "as high as possible".
:::

## Inside BufferGeometry

:::def BufferGeometry
Three.js's geometry class. It stores data in named **attributes**, each a flat typed array: `position` (3 numbers per vertex), `normal` (3, the direction the surface faces, used for lighting), `uv` (2, where the vertex sits on a texture) and optionally `color`. An optional **index** lists which vertices make each triangle so shared corners are stored once.
:::

```js run title="Reading a geometry's buffers (console)" level=easy
import * as THREE from "three";

const g = new THREE.BoxGeometry(1, 1, 1);
console.log("attributes:", Object.keys(g.attributes));
console.log("vertices:", g.attributes.position.count);         // 24, not 8: each face needs its own normals
console.log("triangles:", g.index.count / 3);                   // 12 = 6 faces × 2
console.log("first vertex:", g.attributes.position.getX(0), g.attributes.position.getY(0), g.attributes.position.getZ(0));
console.log("its normal:", g.attributes.normal.getX(0), g.attributes.normal.getY(0), g.attributes.normal.getZ(0));
console.log("its uv:", g.attributes.uv.getX(0), g.attributes.uv.getY(0));

g.computeBoundingBox();
console.log("bounding box min:", g.boundingBox.min, "max:", g.boundingBox.max);

// geometry can be transformed directly (baked into the vertices, unlike mesh.position)
g.translate(0, 0.5, 0);            // move it so its base sits at y = 0
g.computeBoundingBox();
console.log("after translate, min y:", g.boundingBox.min.y);
```

Why does a cube have 24 vertices instead of 8? Each corner belongs to three faces that point in different directions, and a vertex can only have one normal. For a **hard edge** the corner is duplicated, once per face. Smooth shapes like spheres share vertices between neighbouring triangles, which is what makes their shading smooth.

## Building your own geometry

A four-sided pyramid: 5 corners, 6 triangles (4 sides + 2 for the square base). `computeVertexNormals()` works out the lighting directions for you.

```js run title="Custom geometry: a pyramid" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.5, 2, 3);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.2));
const light = new THREE.DirectionalLight("#fff", 2.5);
light.position.set(2, 4, 3);
scene.add(light, new THREE.GridHelper(4, 8));

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.Float32BufferAttribute([
  -0.5, 0, -0.5,   // 0 back-left
   0.5, 0, -0.5,   // 1 back-right
   0.5, 0,  0.5,   // 2 front-right
  -0.5, 0,  0.5,   // 3 front-left
   0,   1,  0,     // 4 apex
], 3));
geometry.setIndex([
  3, 2, 4,   2, 1, 4,   1, 0, 4,   0, 3, 4,   // sides — counter-clockwise seen from outside
  0, 1, 2,   0, 2, 3,                         // base, facing down
]);
geometry.computeVertexNormals();

const pyramid = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#fbbf24", flatShading: true }));
scene.add(pyramid);
scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: "#1f2937" })));

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

:::warn Winding order decides which side is "front"
Triangles are visible from the side where their corners go **counter-clockwise**. List them clockwise and the face is culled (invisible) from that side. If a custom mesh has "holes", flip the order of two indices, or use `side: THREE.DoubleSide` while debugging.
:::

## Editing vertices: terrain

A `PlaneGeometry` with many segments is a grid of vertices you can push up and down. Mix a few sine waves and you have rolling hills; real projects use noise functions or height maps from GIS data.

```js run title="Procedural terrain" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#bae6fd");
scene.fog = new THREE.Fog("#bae6fd", 20, 45);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 9, 18);
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;
scene.add(new THREE.HemisphereLight("#e0f2fe", "#365314", 1.5));
const sun = new THREE.DirectionalLight("#fff7ed", 2.5);
sun.position.set(10, 15, 5);
scene.add(sun);

const geo = new THREE.PlaneGeometry(40, 40, 160, 160);
geo.rotateX(-Math.PI / 2);                    // lay it flat: the plane is built facing +z
const pos = geo.attributes.position;
const colors = [];
const low = new THREE.Color("#4d7c0f"), high = new THREE.Color("#f5f5f4"), c = new THREE.Color();
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), z = pos.getZ(i);
  const h = Math.sin(x * 0.3) * Math.cos(z * 0.25) * 2.2
          + Math.sin(x * 0.9 + z * 0.6) * 0.5
          + Math.max(0, 6 - Math.hypot(x - 6, z + 4)) * 0.9;   // one mountain
  pos.setY(i, h);
  c.lerpColors(low, high, THREE.MathUtils.smoothstep(h, 1.5, 5));
  colors.push(c.r, c.g, c.b);
}
geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
geo.computeVertexNormals();                   // heights changed, so lighting must be recomputed

scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true })));
const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: "#0ea5e9", transparent: true, opacity: 0.7, roughness: 0.1 }));
water.position.y = -0.6;
scene.add(water);

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
```

## Animating vertices every frame

To change vertices continuously, update the attribute and set `needsUpdate = true` so three.js re-uploads it to the GPU. Here a flag waves. (For thousands of vertices, a vertex **shader** does the same on the GPU for free; Module 2 shows how.)

```js run title="A waving flag (CPU vertex animation)" level=intermediate
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(1.4, 0.4, 4);
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.2));
const light = new THREE.DirectionalLight("#fff", 2.5);
light.position.set(-2, 3, 4);
scene.add(light);

const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4), new THREE.MeshStandardMaterial({ color: "#94a3b8" }));
pole.position.set(0, -0.3, 0);
scene.add(pole);

const geo = new THREE.PlaneGeometry(2.4, 1.5, 40, 25);
geo.translate(1.2, 0.6, 0);                   // pivot at the pole edge
const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#10b981", side: THREE.DoubleSide }));
scene.add(flag);

const pos = geo.attributes.position;
const restX = Float32Array.from({ length: pos.count }, (_, i) => pos.getX(i));   // remember the flat shape

renderer.setAnimationLoop((t) => {
  const s = t / 1000;
  for (let i = 0; i < pos.count; i++) {
    const x = restX[i];
    pos.setZ(i, Math.sin(x * 3 - s * 4) * 0.18 * x);   // waves grow towards the free edge
  }
  pos.needsUpdate = true;                               // re-upload to the GPU
  geo.computeVertexNormals();                           // so the folds catch the light
  renderer.render(scene, camera);
});
```

## Shapes from outlines: Lathe and Extrude

Designers often think in 2D profiles. **Lathe** spins a profile around the Y axis (vases, bottles, chess pieces). **Extrude** pushes a 2D `Shape` into 3D with optional bevels (logos, floor plans, map regions, text).

```js run title="LatheGeometry and ExtrudeGeometry" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2, 6);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.4));
const key = new THREE.DirectionalLight("#fff", 2.5);
key.position.set(3, 4, 5);
scene.add(key);

// --- a vase: profile points (radius, height), spun 360° ---
const profile = [];
for (let i = 0; i <= 20; i++) {
  const y = i / 20 * 2;
  profile.push(new THREE.Vector2(0.35 + Math.sin(y * 2.2) * 0.25 + y * 0.08, y));
}
const vase = new THREE.Mesh(new THREE.LatheGeometry(profile, 64),
  new THREE.MeshStandardMaterial({ color: "#f97316", side: THREE.DoubleSide, roughness: 0.25 }));
vase.position.set(-1.4, -1, 0);
scene.add(vase);

// --- a star: a 2D outline extruded with a bevel ---
const star = new THREE.Shape();
for (let i = 0; i <= 10; i++) {
  const r = i % 2 ? 0.45 : 1, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
  i === 0 ? star.moveTo(Math.cos(a) * r, Math.sin(a) * r) : star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
}
const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 4 });
starGeo.center();                                   // put the pivot in the middle
const starMesh = new THREE.Mesh(starGeo, new THREE.MeshStandardMaterial({ color: "#facc15", metalness: 0.3, roughness: 0.3 }));
starMesh.position.x = 1.4;
scene.add(starMesh);

renderer.setAnimationLoop((t) => {
  starMesh.rotation.y = t / 1000;
  renderer.render(scene, camera);
});
```

:::ai
Extruding 2D shapes is how floor plans become 3D buildings (wall outlines → `ExtrudeGeometry`), how GeoJSON country borders become 3D maps, and how SVG logos become 3D badges (`SVGLoader` turns SVG paths into `Shape`s). The Project Lab's floor-plan walkthrough uses exactly this.
:::

## Sharing, merging and disposing

- **Share** one geometry between many meshes (`new Mesh(sameGeo, mat)`) instead of creating copies; it's uploaded to the GPU once.
- **Merge** static meshes that share a material into one geometry with `BufferGeometryUtils.mergeGeometries([...])` (from `three/addons/utils/BufferGeometryUtils.js`) to cut draw calls.
- **Dispose** geometries you no longer need with `geometry.dispose()`.
- **Groups**: one geometry can use several materials, one per index range, via `geometry.addGroup(start, count, materialIndex)` and an **array** of materials on the mesh. A `BoxGeometry` comes with 6 groups, so `new Mesh(box, [m1, m2, m3, m4, m5, m6])` gives each face its own material: the classic dice and crate trick.

## Check yourself

```quiz
? Why does BoxGeometry have 24 vertices instead of 8?
+ Each corner is duplicated per face so every face can have its own normal (hard edges)
- Three.js adds extra vertices for anti-aliasing
- The box has 24 corners
> One vertex = one normal; hard edges need separate vertices.

? After moving vertices in a position attribute, what must you set?
- geometry.dirty = true
+ attribute.needsUpdate = true
- mesh.updateMatrix()
> needsUpdate tells three.js to re-upload the buffer to the GPU.

? You displaced a terrain's heights. Why call `computeVertexNormals()`?
+ The surface directions changed, so lighting would be wrong without new normals
- To make the mesh visible
- To update the bounding box
> Normals drive lighting; they must match the new shape.

? What is the difference between `geometry.translate(0, 1, 0)` and `mesh.position.y = 1`?
+ translate bakes the move into the vertices (changing the pivot); position moves the whole object
- They are identical
- translate is animated
> Geometry transforms change the data; object transforms change where it's drawn.

? Which geometry turns a 2D profile into a vase?
- ExtrudeGeometry
+ LatheGeometry
- TubeGeometry
> Lathe spins a profile around the Y axis.
```

:::exercise Dice faces
Create a `BoxGeometry` and give each of its 6 faces a different coloured `MeshStandardMaterial` by passing an **array** of 6 materials to the `Mesh`. Rotate it so several faces are visible.
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
scene.add(new THREE.HemisphereLight("#fff", "#446", 1.5));
const light = new THREE.DirectionalLight("#fff", 2);
light.position.set(2, 3, 4);
scene.add(light);

const colors = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#a855f7"];
const materials = colors.map((color) => new THREE.MeshStandardMaterial({ color }));
const die = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), materials);   // one material per face group
scene.add(die);
renderer.setAnimationLoop((t) => {
  die.rotation.set(t / 1300, t / 900, 0);
  renderer.render(scene, camera);
});
```
:::

:::keypoints
- Built-in geometries cover most needs; **segments** trade smoothness for triangles.
- `BufferGeometry` = named attributes (`position`, `normal`, `uv`, `color`) + optional **index**.
- Build custom shapes with `setAttribute` + `setIndex`; mind **counter-clockwise** winding; `computeVertexNormals()` for lighting.
- Edit vertices, then set `needsUpdate = true`; heavy per-frame deformation belongs in a shader.
- **Lathe** spins profiles, **Extrude** thickens 2D shapes; share geometries, merge static ones, dispose unused ones.
:::
