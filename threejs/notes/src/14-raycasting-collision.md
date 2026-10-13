---
title: Raycasting, Picking and Collision Maths
part: Motion and Interaction
summary: Rays and the four intersection tests every 3D developer should be able to derive (plane, sphere, box and triangle), each worked by hand and checked against three.js. Then the Raycaster API, BVH acceleration, GPU picking, R3F pointer events, dragging, and the basics of collision detection.
---

## Rays

:::def Ray
A half-line with an origin $\mathbf{o}$ and a unit direction $\hat{\mathbf{d}}$: the set of points $\mathbf{r}(t) = \mathbf{o} + t\,\hat{\mathbf{d}}$ for $t \ge 0$. Because $\hat{\mathbf{d}}$ is unit length, $t$ is the **distance** along the ray. Every intersection test below solves for $t$; the nearest positive $t$ is the hit.
:::

Rays answer most interaction questions: what is under the mouse, where does a bullet hit, is the ground below the character, can the guard see the player, where does the VR controller point. three.js's `Ray` class (`ray.intersectPlane`, `intersectSphere`, `intersectBox`, `intersectTriangle`) and the higher-level `Raycaster` implement them.

## Ray–plane

:::formula Ray–plane intersection
Plane: $\hat{\mathbf{n}}\cdot\mathbf{x} + d = 0$. Substituting $\mathbf{x} = \mathbf{o} + t\hat{\mathbf{d}}$:
$$t = -\frac{\hat{\mathbf{n}}\cdot\mathbf{o} + d}{\hat{\mathbf{n}}\cdot\hat{\mathbf{d}}}$$
If $\hat{\mathbf{n}}\cdot\hat{\mathbf{d}} = 0$ the ray is parallel to the plane (no hit, or lying in it). A negative $t$ means the plane is behind the origin.
:::

:::calc Where on the floor did I click?
Camera ray: $\mathbf{o} = (0, 5, 10)$, $\hat{\mathbf{d}} = \text{normalise}(0, -0.5, -1) = (0, -0.447, -0.894)$. Floor $y = 0$: $\hat{\mathbf{n}} = (0, 1, 0)$, $d = 0$.

$t = -\dfrac{5 + 0}{-0.447} = 11.18$; point $= (0, 5, 10) + 11.18\,(0, -0.447, -0.894) = (0, 0, 0)$. `ray.intersectPlane()` returns the same. This is how "click to move" and "drag on the ground" work, with no meshes needed at all.
:::

## Ray–sphere

:::formula Ray–sphere intersection
Sphere: centre $\mathbf{c}$, radius $r$. Let $\mathbf{m} = \mathbf{o} - \mathbf{c}$. Solving $\lVert\mathbf{m} + t\hat{\mathbf{d}}\rVert^2 = r^2$ gives a quadratic in $t$:
$$t^2 + 2bt + c = 0,\quad b = \mathbf{m}\cdot\hat{\mathbf{d}},\quad c = \mathbf{m}\cdot\mathbf{m} - r^2,\qquad t = -b \pm\sqrt{b^2 - c}$$
The **discriminant** $b^2 - c$ decides: negative, a miss; zero, a graze; positive, two hits (entry and exit).
:::

@fig(ray_sphere) Ray–sphere geometry. The discriminant measures how close the ray passes to the centre compared with the radius.

:::calc A ray past a sphere
$\mathbf{o} = (0, 0, 0)$, $\hat{\mathbf{d}} = (0, 0, -1)$, sphere at $\mathbf{c} = (0.5, 0, -5)$, $r = 1$.

1. $\mathbf{m} = (-0.5, 0, 5)$, $b = \mathbf{m}\cdot\hat{\mathbf{d}} = -5$, $c = 25.25 - 1 = 24.25$.
2. Discriminant $= 25 - 24.25 = 0.75 > 0$: two hits.
3. $t = 5 \pm 0.866$: entry at $t = 4.134$, exit at $5.866$.
4. Entry point $(0, 0, -4.134)$; check: its distance from the centre is $\sqrt{0.5^2 + 0.866^2} = 1$. three.js's `intersectSphere` gives $(0, 0, -4.134)$.
:::

## Ray–box (the slab method)

:::formula Slab test for an axis-aligned box
An axis-aligned bounding box (AABB) is the intersection of three "slabs" $x_{\min}\le x\le x_{\max}$, etc. For each axis, compute where the ray enters and leaves its slab:
$$t_{1} = \frac{x_{\min} - o_x}{d_x},\qquad t_{2} = \frac{x_{\max} - o_x}{d_x}$$
then $t_{\text{near}} = \max$ over axes of $\min(t_1, t_2)$ and $t_{\text{far}} = \min$ over axes of $\max(t_1, t_2)$. The ray hits the box if $t_{\text{near}} \le t_{\text{far}}$ and $t_{\text{far}} \ge 0$.
:::

@fig(slab) The slab method in 2D. The ray is inside the box only while it is inside every slab at once, from the latest entry to the earliest exit.

:::calc Hitting a crate
$\mathbf{o} = (0,0,0)$, $\hat{\mathbf{d}} = \text{normalise}(1, 0.25, 0) = (0.970, 0.243, 0)$, box from $(2, -1, -1)$ to $(4, 1, 1)$.

- x slab: $t = 2/0.970 = 2.06$ to $4/0.970 = 4.12$.
- y slab: $t = -1/0.243 = -4.12$ to $1/0.243 = 4.12$.
- z slab: $d_z = 0$ and $o_z = 0$ lies inside $[-1, 1]$, so the whole ray is inside it.
- $t_{\text{near}} = \max(2.06, -4.12) = 2.06$, $t_{\text{far}} = \min(4.12, 4.12) = 4.12$. Since $2.06 \le 4.12$: hit at $t = 2.06$, point $(2, 0.5, 0)$. `intersectBox` agrees.
:::

The slab test needs only a few divisions (precompute $1/d$) and comparisons, which is why bounding boxes are the first test in every acceleration structure.

## Ray–triangle (Möller–Trumbore)

:::formula Möller–Trumbore
For a triangle $\mathbf{v}_0, \mathbf{v}_1, \mathbf{v}_2$ with edges $\mathbf{e}_1 = \mathbf{v}_1 - \mathbf{v}_0$, $\mathbf{e}_2 = \mathbf{v}_2 - \mathbf{v}_0$, solve $\mathbf{o} + t\hat{\mathbf{d}} = (1-u-v)\mathbf{v}_0 + u\mathbf{v}_1 + v\mathbf{v}_2$ with Cramer's rule:
$$\mathbf{p} = \hat{\mathbf{d}}\times\mathbf{e}_2,\quad \det = \mathbf{e}_1\cdot\mathbf{p},\quad \mathbf{s} = \mathbf{o} - \mathbf{v}_0,\quad u = \frac{\mathbf{s}\cdot\mathbf{p}}{\det},\quad \mathbf{q} = \mathbf{s}\times\mathbf{e}_1,\quad v = \frac{\hat{\mathbf{d}}\cdot\mathbf{q}}{\det},\quad t = \frac{\mathbf{e}_2\cdot\mathbf{q}}{\det}$$
Hit if $\det \neq 0$, $u \ge 0$, $v \ge 0$, $u + v \le 1$ and $t > 0$. The sign of $\det$ tells front face from back face (used for culling). $u$ and $v$ are barycentric coordinates, which give the hit's UV and interpolated normal.
:::

:::calc A ray through a triangle
$\mathbf{v}_0 = (0,0,-2)$, $\mathbf{v}_1 = (2,0,-2)$, $\mathbf{v}_2 = (0,2,-2)$; ray $\mathbf{o} = (0.5, 0.5, 0)$, $\hat{\mathbf{d}} = (0,0,-1)$.

1. $\mathbf{e}_1 = (2,0,0)$, $\mathbf{e}_2 = (0,2,0)$.
2. $\mathbf{p} = \hat{\mathbf{d}}\times\mathbf{e}_2 = (2, 0, 0)$; $\det = \mathbf{e}_1\cdot\mathbf{p} = 4$ (positive: front face).
3. $\mathbf{s} = (0.5, 0.5, 2)$; $u = (\mathbf{s}\cdot\mathbf{p})/4 = 1/4 = 0.25$.
4. $\mathbf{q} = \mathbf{s}\times\mathbf{e}_1 = (0, 4, -1)$; $v = (\hat{\mathbf{d}}\cdot\mathbf{q})/4 = 1/4 = 0.25$.
5. $t = (\mathbf{e}_2\cdot\mathbf{q})/4 = 8/4 = 2$.
6. All tests pass: hit at $(0.5, 0.5, -2)$ with barycentrics $(1-u-v, u, v) = (0.5, 0.25, 0.25)$, exactly what `Triangle.getBarycoord` returns.
:::

## The Raycaster

```js title="three.js — picking with Raycaster"
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.05;      // world-unit tolerance for Points
raycaster.params.Line.threshold = 0.05;        // and for Lines
raycaster.far = 100;                           // ignore hits beyond 100 m

function pick(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(clickables, true);   // recursive; sorted by distance
  if (!hits.length) return null;
  const h = hits[0];
  // h.distance, h.point (world), h.object, h.face, h.faceIndex, h.uv, h.barycoord,
  // h.normal (interpolated, LOCAL space: use transformDirection(h.object.matrixWorld) for world),
  // h.instanceId (InstancedMesh), h.batchId (BatchedMesh)
  return h;
}
```

How `Mesh.raycast` works, which explains its performance:

1. Transform the ray into the mesh's **local space** with the inverse world matrix (cheaper than transforming every vertex).
2. Test the geometry's **bounding sphere**, then bounding box: most meshes are rejected here.
3. Otherwise test **every triangle** (Möller–Trumbore), respecting `material.side`.
4. Convert hits back to world space and sort by distance.

:::warn Raycasting sees the CPU geometry, not the pixels
Vertex-shader displacement, skinning not applied on the CPU, morph targets, GPU particles and instanced transforms changed only in shaders are invisible to the `Raycaster`. The click lands where the original geometry is. For skinned meshes call `mesh.computeBoundingSphere()`/`computeBoundingBox()` after posing, or raycast against simple proxy shapes; for shader effects use GPU picking.
:::

### Accelerating raycasts with a BVH

:::def Bounding volume hierarchy (BVH)
A tree of nested bounding boxes over a mesh's triangles. A ray only descends into child boxes it actually hits, so instead of testing all $N$ triangles it tests about $\log_2 N$ levels of boxes and a handful of triangles. Building it costs time once; queries become hundreds of times faster on big meshes.
:::

@fig(bvh) A BVH splits triangles into nested boxes. The ray (amber) only visits the boxes it crosses (highlighted), skipping every triangle in the other branches.

:::calc Brute force against a BVH
A 1,000,000-triangle scanned statue. Brute force: one million ray–triangle tests per pick (tens of milliseconds in JavaScript). A BVH with 10 triangles per leaf has about $\log_2(10^5) \approx 17$ levels; a ray typically visits a few dozen boxes and tests a few dozen triangles: well under a millisecond, which makes hover effects at 60 Hz and continuous VR pointer rays affordable.
:::

```js title="three.js — three-mesh-bvh"
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

statue.geometry.computeBoundsTree();          // once, after loading
raycaster.firstHitOnly = true;                // stop at the nearest hit (another big speed-up)
```

```jsx title="R3F — drei <Bvh>"
import { Bvh } from "@react-three/drei";
<Bvh firstHitOnly>
  <Statue />          {/* every mesh inside gets a BVH and accelerated raycasting */}
</Bvh>
```

### GPU picking

An alternative to rays: render the scene once more into a tiny off-screen target where each object is drawn in a **unique flat colour** that encodes its ID, then read back the pixel under the cursor.

| | CPU raycasting | GPU picking |
|---|---|---|
| Cost | Grows with triangles (BVH helps) | One extra render (can be 1×1 pixel with a narrowed camera) |
| Shader-displaced or skinned geometry | Wrong | Correct (same vertex shader) |
| Returns | Exact point, normal, UV, all hits | Object/instance ID (depth needs a second channel) |
| Latency | Immediate | Reading pixels back can stall the GPU; use async reads |
| Good for | Most apps, physics-like queries | Millions of points, instanced crowds, CAD models |

## Pointer events in React Three Fiber

R3F runs the raycaster for you and gives meshes DOM-like event handlers.

```jsx title="R3F — events on meshes"
function Box(props) {
  const [hovered, setHovered] = useState(false);
  return (
    <mesh {...props}
      onClick={(e) => { e.stopPropagation(); console.log(e.point, e.distance, e.object.name); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onPointerMissed={() => console.log("clicked empty space")}>
      <boxGeometry />
      <meshStandardMaterial color={hovered ? "hotpink" : "orange"} />
    </mesh>
  );
}
```

| Event field | Meaning |
|---|---|
| `e.object` | The object whose handler is running |
| `e.eventObject` | The object the handler is attached to (differs while bubbling) |
| `e.point`, `e.distance` | World-space hit point and distance from the ray origin |
| `e.face`, `e.uv`, `e.instanceId` | Triangle, texture coordinate, instance index |
| `e.intersections` | Every hit along the ray, nearest first |
| `e.ray`, `e.camera`, `e.pointer` | The ray, camera and NDC pointer used |
| `e.stopPropagation()` | Stop the event reaching objects **behind** (not only parents) |

:::warn Events go through objects
Unlike the DOM, a ray passes **through** every object it hits. Without `e.stopPropagation()`, hovering a cube also triggers `onPointerOver` on the floor behind it. Call it in handlers on foreground objects. For cheap hit-testing on complex meshes, `raycast={meshBounds}` (drei) tests only the bounding sphere.
:::

### Dragging on a plane

Dragging an object across the floor is a ray–plane intersection each pointer move, with an offset so the object does not jump to the cursor.

```js title="three.js — drag on the ground plane"
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3(), offset = new THREE.Vector3();
let dragging = null;

canvas.addEventListener("pointerdown", (e) => {
  const h = pick(toNdc(e));
  if (!h) return;
  dragging = h.object;
  raycaster.ray.intersectPlane(ground, hit);
  offset.copy(dragging.position).sub(hit);          // keep the grab point under the cursor
  canvas.setPointerCapture(e.pointerId);            // keep receiving moves outside the canvas
  controls.enabled = false;                         // stop OrbitControls fighting the drag
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  raycaster.setFromCamera(toNdc(e), camera);
  if (raycaster.ray.intersectPlane(ground, hit)) dragging.position.copy(hit).add(offset);
});
canvas.addEventListener("pointerup", () => { dragging = null; controls.enabled = true; });
```

In R3F the same is a few lines with drei's `<DragControls>` or `<PivotControls>`, or by setting pointer capture in `onPointerDown` (`e.target.setPointerCapture(e.pointerId)`) and moving the object in `onPointerMove` with `e.ray.intersectPlane(...)`.

## Collision detection basics

Physics engines (Chapter 17) handle collisions for you, but the core tests are short and worth knowing.

:::formula Overlap tests
- **Sphere–sphere**: overlap if $\lVert\mathbf{c}_1 - \mathbf{c}_2\rVert < r_1 + r_2$ (compare squared values). Penetration depth $= r_1 + r_2 - \lVert\mathbf{c}_1-\mathbf{c}_2\rVert$.
- **AABB–AABB**: overlap if, on **every** axis, $\min_1 \le \max_2$ and $\min_2 \le \max_1$.
- **Sphere–AABB**: clamp the centre to the box to find the closest point $\mathbf{q}$; overlap if $\lVert\mathbf{c} - \mathbf{q}\rVert < r$.
- **Oriented boxes, convex shapes**: the **separating axis theorem** (two convex shapes do not overlap if and only if some axis exists on which their projections do not overlap; for boxes, test 15 axes).
:::

:::calc Two balls
Ball A at $(0, 1, 0)$ with $r = 0.5$; ball B at $(0.6, 1.2, 0.3)$ with $r = 0.4$. $\lVert\mathbf{c}_1 - \mathbf{c}_2\rVert^2 = 0.36 + 0.04 + 0.09 = 0.49$, so the distance is 0.7, and $r_1 + r_2 = 0.9$. They overlap by $0.2$ m; push each apart by 0.1 m along the line between centres, $\text{normalise}(0.6, 0.2, 0.3) = (0.857, 0.286, 0.429)$.
:::

:::def Broad phase and narrow phase
Testing every pair of $N$ objects is $N(N-1)/2$ tests: 4,950 for 100 objects, about 500,000 for 1,000. The **broad phase** quickly finds candidate pairs with a cheap structure (a uniform grid or spatial hash, sweep-and-prune on sorted AABB edges, or a dynamic BVH); the **narrow phase** runs exact tests only on those candidates.
:::

```js title="three.js maths classes for collision"
const a = new THREE.Box3().setFromObject(crate);
const b = new THREE.Sphere(ball.position, 0.5);
a.intersectsSphere(b);  a.intersectsBox(otherBox);  a.containsPoint(p);
const closest = a.clampPoint(ball.position, new THREE.Vector3());   // closest point on the box
const frustum = new THREE.Frustum().setFromProjectionMatrix(
  new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
frustum.intersectsObject(mesh);                                     // manual visibility test
```

:::keypoints
- Ray: $\mathbf{o} + t\hat{\mathbf{d}}$; with unit $\hat{\mathbf{d}}$, $t$ is distance.
- Plane: $t = -(\hat{\mathbf{n}}\cdot\mathbf{o} + d)/(\hat{\mathbf{n}}\cdot\hat{\mathbf{d}})$. Sphere: quadratic with discriminant $b^2 - c$. Box: slab method. Triangle: Möller–Trumbore, which also yields barycentrics.
- `Mesh.raycast`: local-space ray → bounding sphere/box → every triangle; use three-mesh-bvh (`<Bvh>`) for big meshes and `firstHitOnly`.
- Raycasting ignores shader displacement; use proxies or GPU picking.
- R3F events pass through objects: call `stopPropagation()`; `onPointerMissed` for empty clicks.
- Drag = ray–plane intersection + grab offset + pointer capture + disabling controls.
- Collision = broad phase (grid, sweep-and-prune, BVH) then narrow phase (exact shape tests, SAT).
:::

## Interview questions

:::qa How does three.js work out which object is under the mouse? {level=junior}
Convert the pointer to normalised device coordinates, build a ray from the camera through that point with `raycaster.setFromCamera(ndc, camera)`, and call `intersectObjects(objects, true)`. For each mesh three.js moves the ray into the mesh's local space, rejects it early with the bounding sphere and box, then tests triangles and returns hits sorted by distance, each with the point, face, UV, normal and (for instanced meshes) the instance ID. R3F does this automatically for its `onClick`/`onPointer*` handlers.
:::

:::qa Derive the ray–sphere intersection. {level=mid}
Points on the ray are $\mathbf{o} + t\hat{\mathbf{d}}$; points on the sphere satisfy $\lVert\mathbf{x} - \mathbf{c}\rVert^2 = r^2$. Substituting with $\mathbf{m} = \mathbf{o} - \mathbf{c}$ gives $t^2 + 2(\mathbf{m}\cdot\hat{\mathbf{d}})t + (\mathbf{m}\cdot\mathbf{m} - r^2) = 0$ (the $t^2$ coefficient is 1 because $\hat{\mathbf{d}}$ is unit). So $t = -b \pm\sqrt{b^2 - c}$ with $b = \mathbf{m}\cdot\hat{\mathbf{d}}$ and $c = \mathbf{m}\cdot\mathbf{m} - r^2$. A negative discriminant is a miss; otherwise take the smallest positive root. If $c < 0$ the origin is inside the sphere.
:::

:::qa Hover detection on a 2-million-triangle CAD model is slow. What would you do? {level=mid}
Build a BVH (three-mesh-bvh, `computeBoundsTree`, or drei's `<Bvh>`) so raycasts cost roughly logarithmic time, enable `firstHitOnly`, raycast only on pointer move (and throttle to once per frame), restrict the candidate list with layers or a smaller array of pickable objects, and test simplified proxy geometry if exact triangles are not needed. If the model is instanced or shader-deformed, use GPU picking (an ID render into a small target).
:::

:::qa Why does clicking a waving flag (vertex shader animation) hit the wrong spot? {level=mid}
The raycaster tests the geometry stored on the CPU, which is the flag's rest pose; the waving happens only in the vertex shader on the GPU. Options: run the same displacement function on the CPU for the hit test, raycast against an approximate proxy, or use GPU picking, which renders with the same vertex shader and therefore sees the displaced surface.
:::

:::qa What is the separating axis theorem? {level=senior}
Two convex shapes are disjoint if and only if there is an axis onto which their projections (intervals) do not overlap. For convex polyhedra you only need to test a finite set of candidate axes: the face normals of each shape and the cross products of pairs of edges (for two oriented boxes: 3 + 3 + 9 = 15 axes). If every axis shows overlap, the shapes intersect, and the axis with the smallest overlap gives the minimum translation vector to separate them, which physics engines use for collision response.
:::
