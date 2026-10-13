---
title: Geometry and Meshes
summary: How shapes are stored on the GPU. BufferGeometry and its attributes, indexed versus non-indexed meshes, normals and why a cube has 24 vertices, UV seams, built-in and procedural geometry, updating vertices efficiently, bounding volumes, merging, morph targets, points and lines.
---

## BufferGeometry: shapes as arrays

:::def BufferGeometry
three.js's container for shape data. It holds named **attributes** (per-vertex arrays such as `position`, `normal`, `uv`, `color`) and an optional **index** (which vertices form each triangle). Each attribute is a `BufferAttribute` wrapping a typed array plus an **item size** (3 for positions and normals, 2 for UVs, 4 for tangents and skin weights). These arrays are uploaded to GPU buffers as they are.
:::

| Attribute | Item size | Used for |
|---|---|---|
| `position` | 3 | Vertex positions in local space (required) |
| `normal` | 3 | Lighting (Chapter 9) |
| `uv` | 2 | Texture coordinates (Chapter 11); `uv1`, `uv2`… for extra sets (light maps, AO) |
| `color` | 3 or 4 | Vertex colours (enable `material.vertexColors`) |
| `tangent` | 4 | Normal mapping with a tangent frame; `w` stores handedness |
| `skinIndex`, `skinWeight` | 4 | Skeletal animation (Chapter 15) |

```js title="three.js — a triangle by hand"
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array([
  -1, 0, 0,     // vertex 0
   1, 0, 0,     // vertex 1
   0, 1.5, 0,   // vertex 2  (counter-clockwise when seen from +Z, so it faces the default camera)
]);
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.computeVertexNormals();             // (0, 0, 1) for all three
const tri = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "tomato" }));
```

```jsx title="R3F — the same geometry declared in JSX"
function Triangle() {
  const positions = useMemo(() => new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1.5, 0]), []);
  return (
    <mesh>
      <bufferGeometry onUpdate={(g) => g.computeVertexNormals()}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <meshStandardMaterial color="tomato" />
    </mesh>
  );
}
```

## Indexed and non-indexed geometry

:::def Index buffer
An array of integers listing vertices three at a time, one triple per triangle. With an index, a vertex shared by several triangles is stored **once** and referenced several times. Without one (non-indexed), every triangle stores its own three vertices.
:::

@fig(indexed_quad) A quad as two triangles. Non-indexed it needs six vertices; indexed it needs four vertices plus six small integers, and the GPU's post-transform cache can reuse shaded vertices.

:::calc Memory for a 100 × 100 terrain grid
`PlaneGeometry(1, 1, 100, 100)`: $(100+1)^2 = 10{,}201$ vertices and $2\times100^2 = 20{,}000$ triangles. With position + normal + uv each vertex is $(3 + 3 + 2)\times 4 = 32$ bytes.

- Indexed: $10{,}201\times 32 = 326$ KB of vertices, plus $60{,}000$ indices $\times$ 2 bytes (Uint16 suffices below 65,536 vertices) $= 120$ KB. Total about **446 KB**.
- Non-indexed: $60{,}000$ vertices $\times 32 = 1.92$ MB, about **4.3×** larger.
:::

### Why a cube has 24 vertices

A cube has 8 corners, yet `BoxGeometry` has 24 vertices. A vertex is not just a position: it is the **whole set of attributes**. Each corner touches three faces with three different normals (and different UVs), so it must be stored three times: $8\times 3 = 24$.

:::def Flat and smooth shading
**Smooth** shading shares vertices between neighbouring faces and averages their normals, so lighting varies smoothly across edges (a sphere). **Flat** (faceted) shading gives each face its own vertices with the face normal, so edges look sharp (a cube, low-poly art). `material.flatShading = true` fakes flat shading in the shader using screen-space derivatives, without changing the geometry.
:::

@fig(flat_smooth) The same corner with split vertices (hard edge, separate face normals) and shared vertices (soft edge, averaged normal).

| Geometry | Vertices | Triangles |
|---|---|---|
| `BoxGeometry(1,1,1)` | 24 | 12 |
| `PlaneGeometry(1,1)` | 4 | 2 |
| `SphereGeometry(1, 32, 16)` | 561 | 960 |
| `SphereGeometry(1, 64, 32)` | 2,145 | 3,968 |
| `CylinderGeometry(1,1,1,32)` | 196 | 128 |
| `TorusGeometry(1, 0.4, 12, 48)` | 637 | 1,152 |
| `TorusKnotGeometry()` (defaults) | 585 | 1,024 |
| `IcosahedronGeometry(1, 0)` (non-indexed) | 60 | 20 |

:::tip Segment counts are a budget
Doubling both sphere segment counts roughly quadruples the triangles. A sphere filling a quarter of a 1080p screen looks perfectly round with 64×32; a background planet needs far fewer. Choose segments by on-screen size, or use LOD (Chapter 23).
:::

### Normals and UV seams

`geometry.computeVertexNormals()` averages, at each vertex, the normals of all triangles that share that vertex **through the index**. Vertices that are duplicated (for UV seams or hard edges) do not share, so the edge stays sharp. Two utilities change this:

- `BufferGeometryUtils.mergeVertices(geometry, tolerance)` welds duplicate vertices whose attributes all match, which makes a geometry indexed and smooth-shadeable.
- `geometry.toNonIndexed()` splits every triangle apart, for per-face effects (exploding meshes, per-face colours, flat normals).

:::warn UV seams split vertices too
A sphere's texture must wrap round, so the vertical seam where $u$ jumps from 1 back to 0 needs two copies of each seam vertex. That is why `SphereGeometry(1, 32, 16)` has $33\times17 = 561$ vertices rather than $32\times17$. Welding such vertices would smear the texture across the whole sphere along the seam.
:::

## Built-in and procedural geometry

three.js ships with primitive geometries (box, sphere, plane, circle, ring, cylinder, cone, capsule, torus, torus knot, the platonic solids), shape-based ones (`ShapeGeometry`, `ExtrudeGeometry`, `LatheGeometry`, `TubeGeometry`) and, in addons, `TextGeometry`, `ConvexGeometry`, `RoundedBoxGeometry`, `DecalGeometry` and `ParametricGeometry`.

:::formula A regular grid
A grid of $N_x\times N_z$ segments has $(N_x+1)(N_z+1)$ vertices and $2N_xN_z$ triangles. Vertex $(i, j)$ has index $k = j\,(N_x+1) + i$, and cell $(i, j)$ uses the two triangles $(k,\ k+N_x+1,\ k+1)$ and $(k+1,\ k+N_x+1,\ k+N_x+2)$.
:::

```js title="three.js — terrain from a height function"
function terrain(size = 50, seg = 128, height = (x, z) => Math.sin(x * 0.3) * Math.cos(z * 0.3) * 2) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);                    // the plane is XY by default; lay it on XZ
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  }
  g.computeVertexNormals();                   // lighting must follow the new shape
  g.computeBoundingSphere();                  // culling must follow it too
  return g;
}
```

:::deep Shapes, extrusion and lathe
`THREE.Shape` describes a 2D outline with `moveTo`, `lineTo`, `bezierCurveTo` and holes; `ExtrudeGeometry(shape, { depth, bevelEnabled, bevelSize, steps, extrudePath })` sweeps it into 3D (logos, floor plans from polygons, cookie cutters). `LatheGeometry(points, segments)` spins a 2D profile around the Y axis (vases, bottles, wine glasses), and `TubeGeometry(curve, tubularSegments, radius)` sweeps a circle along a 3D curve (cables, pipes, roller-coaster tracks), using the curve's Frenet frames to orient each ring.
:::

## Updating geometry at runtime

Changing a typed array on the CPU does nothing until three.js re-uploads it.

```js title="three.js — animating vertices on the CPU"
const pos = geometry.attributes.position;
pos.setUsage(THREE.DynamicDrawUsage);         // hint: this buffer changes often
function update(t) {
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, Math.sin(x * 2 + t) * 0.2);
  }
  pos.needsUpdate = true;                     // re-upload on the next render
  geometry.computeVertexNormals();            // costly; skip if the material ignores normals
}
// Only part of the array changed? Upload just that range:
pos.clearUpdateRanges();
pos.addUpdateRange(startIndex * 3, count * 3);
pos.needsUpdate = true;
```

:::tip Move per-vertex animation to the GPU
Looping over 100,000 vertices in JavaScript every frame costs milliseconds and a full buffer upload. The same wave in a vertex shader (Chapter 18) costs almost nothing on the CPU, because the GPU computes all vertices in parallel. Use CPU updates for occasional edits (sculpting, terrain painting) and shaders for continuous animation.
:::

Other runtime tools: `geometry.setDrawRange(start, count)` draws only part of the buffer (growing trails, revealing a path), and pre-allocating a large buffer then increasing the draw range avoids reallocations.

## Bounding volumes

:::def Bounding box and bounding sphere
`geometry.boundingBox` (a `Box3`) and `geometry.boundingSphere` (a `Sphere`) enclose all vertices in **local** space. three.js uses the sphere for frustum culling and as a quick rejection test before raycasting against triangles. They are computed lazily and are **not** updated automatically when vertices change.
:::

```js title="three.js — bounds in local and world space"
geometry.computeBoundingBox();
const local = geometry.boundingBox;                       // local space
const world = new THREE.Box3().setFromObject(mesh);       // world space, follows transforms and children
const size = world.getSize(new THREE.Vector3());          // e.g. to scale a model to fit 1 m
mesh.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
geometry.center();                                         // move the geometry so its bbox centre is the origin
```

## Merging geometry

:::def Merging
Combining several geometries into one `BufferGeometry` (with `BufferGeometryUtils.mergeGeometries`) so they render in **one draw call** with one material. The result is static: you can no longer move the parts independently, and the merged mesh is culled as one object.
:::

```js title="three.js — merging a static city block"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const parts = buildings.map((b) => {
  const g = new THREE.BoxGeometry(b.w, b.h, b.d);
  g.translate(b.x, b.h / 2, b.z);             // bake each building's position into its vertices
  return g;
});
const block = new THREE.Mesh(mergeGeometries(parts), concrete);   // 1 draw call instead of parts.length
parts.forEach((g) => g.dispose());
```

| Technique | Draw calls | Per-object movement | Different shapes | Typical use |
|---|---|---|---|---|
| Separate meshes | N | Yes | Yes | Few interactive objects |
| Merged geometry | 1 | No | Yes | Static scenery |
| `InstancedMesh` | 1 | Yes (matrix per instance) | No (one geometry) | Trees, crowds, particles, grids |
| `BatchedMesh` | 1 (multi-draw) | Yes (matrix per instance) | Yes (shared material) | Varied static or dynamic props |

## Morph targets

:::def Morph targets (blend shapes)
Alternative positions (and optionally normals) for every vertex, stored in `geometry.morphAttributes.position`. The mesh blends between the base shape and the targets with weights in `mesh.morphTargetInfluences`. Used for facial expressions, lip sync, muscle bulges and shape keys from Blender.
:::

:::formula Morph blending
$$\mathbf{p} = \mathbf{p}_{\text{base}} + \sum_i w_i\,\Delta\mathbf{p}_i$$
With `geometry.morphTargetsRelative = true` (as glTF stores them) each target holds the **offset** $\Delta\mathbf{p}_i$; otherwise it holds absolute positions and three.js uses $\Delta\mathbf{p}_i = \mathbf{p}_i - \mathbf{p}_{\text{base}}$.
:::

:::calc A smile and a blink
A mouth-corner vertex at $(0.03, -0.02, 0.09)$. Its "smile" offset is $(0.004, 0.006, 0)$ and its "jawOpen" offset is $(0, -0.01, 0.002)$. With weights smile $= 0.5$, jawOpen $= 0.25$:
$\mathbf{p} = (0.03, -0.02, 0.09) + 0.5(0.004, 0.006, 0) + 0.25(0, -0.01, 0.002) = (0.032,\ -0.0195,\ 0.0905)$.
:::

```js title="three.js — driving morph targets by name"
const face = gltf.scene.getObjectByName("Head");
const i = face.morphTargetDictionary["mouthSmile"];   // name → index
face.morphTargetInfluences[i] = 0.5;
```

```jsx title="R3F — the same through props"
<mesh geometry={nodes.Head.geometry} material={materials.Skin}
      morphTargetDictionary={nodes.Head.morphTargetDictionary}
      morphTargetInfluences={influences} />
```

## Points, lines and sprites

| Object | Draws | Notes |
|---|---|---|
| `Points` + `PointsMaterial` | One square sprite per vertex | `size` in pixels or world units (`sizeAttenuation`); millions are cheap |
| `Line` / `LineLoop` / `LineSegments` | 1-pixel lines | WebGL ignores `linewidth` > 1 on most platforms |
| `Line2` (addon) / drei `<Line>` | Thick lines built from instanced quads | Real widths, dashes, world or pixel units |
| `Sprite` | A camera-facing quad | Labels, icons, impostors |
| `EdgesGeometry` / `WireframeGeometry` | Edges or all triangle edges as lines | Technical drawings, outlines |

:::keypoints
- A vertex is the full set of its attributes; any difference (normal, uv) forces a separate vertex.
- Indexed geometry stores shared vertices once; a cube needs 24 vertices because of per-face normals.
- Grid: $(N+1)^2$ vertices and $2N^2$ triangles; segments are a triangle budget.
- After editing attributes set `needsUpdate = true`; recompute normals and bounds when the shape changes.
- Continuous vertex animation belongs in shaders; CPU edits are for occasional changes.
- Merge static geometry, instance repeated geometry, batch varied geometry: each becomes one draw call.
- Morph targets blend vertex offsets with weights; glTF stores them as relative offsets.
:::

## Interview questions

:::qa Why does `BoxGeometry` have 24 vertices instead of 8? {level=junior}
Because a vertex is a unique combination of all its attributes, not only a position. Each cube corner belongs to three faces that need different normals (for flat lighting) and different UVs (for per-face textures), so every corner is stored three times: $8\times3 = 24$. If you merged them into 8 vertices, normals would be averaged and the cube would be shaded like a blob.
:::

:::qa What is the difference between indexed and non-indexed geometry? {level=junior}
Indexed geometry stores each unique vertex once and an index buffer lists which three vertices make each triangle; shared vertices save memory and let the GPU reuse already-processed vertices. Non-indexed geometry repeats vertices for every triangle: simpler, needed for per-face attributes (exploding faces, flat colours), but larger. `mergeVertices` converts to indexed, `toNonIndexed` the other way.
:::

:::qa You change vertex positions but nothing happens on screen, or the mesh disappears near screen edges. Why? {level=mid}
Nothing happens: the attribute was not flagged, so set `geometry.attributes.position.needsUpdate = true` after editing (and recompute normals if lighting should change). Disappearing: the bounding sphere still describes the old shape, so frustum culling (and raycasting) use stale bounds; call `geometry.computeBoundingSphere()` (and `computeBoundingBox()`) after the change, or enlarge the bounds when a shader displaces vertices.
:::

:::qa When would you merge geometries, use InstancedMesh, or use BatchedMesh? {level=mid}
Merge static objects that never move independently and share a material (buildings, rocks baked into a level): one draw call, but no per-object transforms and culling as a whole. Use `InstancedMesh` for many copies of the same geometry that need individual transforms or colours (trees, crowds, particles). Use `BatchedMesh` when objects have different geometries but share a material and still need individual transforms and visibility (varied props, CAD parts); it renders them with a single multi-draw call.
:::

:::qa Morph targets or skinning for a character's face? {level=senior}
Both are used together in production. Skinning (bones) is cheap to store and suits large rigid-ish motions like the jaw, neck and eyes. Morph targets store a full offset per vertex per shape, which costs memory but captures subtle, non-rigid detail (lip shapes, cheek bulges, ARKit's 52 blend shapes for face tracking). three.js supports both on the same `SkinnedMesh`, and glTF exports both.
:::
