---
title: Vectors
summary: The single most used maths in 3D. Points and directions, length and normalisation, the dot and cross products and what they mean geometrically, projection, reflection, interpolation and frame-rate-independent damping, with three.js and R3F code for each.
---

## Points and directions

:::def Vector
A quantity with a **direction** and a **magnitude** (length), written as components $\mathbf{v} = (v_x, v_y, v_z)$. In 3D graphics the same three numbers can mean two different things: a **point** (a position) or a **direction** (a displacement, a velocity, a normal).
:::

The difference matters when transforming. Moving an object should move its points but must not change a direction such as "up". Homogeneous coordinates encode this with a fourth component: points have $w = 1$, directions have $w = 0$, so translation (which lives in the fourth column of a matrix) affects only points. Chapter 4 shows the matrix.

| Operation | Result | Meaning |
|---|---|---|
| point − point | vector | the displacement from one point to the other |
| point + vector | point | a point moved by a displacement |
| vector + vector | vector | combined displacement |
| point + point | (meaningless) | except in weighted averages whose weights sum to 1 |

In three.js all of these are `THREE.Vector3`. The class does not know whether it holds a point or a direction; you decide, and you choose the right method (`applyMatrix4` for points, `transformDirection` for directions).

:::warn three.js vector methods change the vector itself
`a.add(b)` modifies `a` and returns `a` (for chaining); it does **not** return a new vector. To keep `a`, write `a.clone().add(b)` or `result.addVectors(a, b)`. Forgetting this is the most common maths bug in three.js code: for example `mesh.position.add(velocity)` moves the mesh, which is right, but `const p = mesh.position; p.add(offset)` also moves the mesh, which usually is not intended.
:::

## Length and normalisation

:::formula Length (magnitude)
$$\lVert\mathbf{v}\rVert = \sqrt{v_x^2 + v_y^2 + v_z^2}$$
The distance between points $A$ and $B$ is $\lVert B - A\rVert$.
:::

:::def Unit vector and normalisation
A **unit vector** has length 1 and represents a pure direction. **Normalising** divides a vector by its length: $\hat{\mathbf{v}} = \mathbf{v} / \lVert\mathbf{v}\rVert$. Normals, light directions and camera axes are always unit vectors, because the formulas that use them assume it.
:::

:::calc Distance and direction to a target
Player at $P = (1, 0, 2)$, enemy at $E = (4, 0, 6)$.

1. Displacement $\mathbf{d} = E - P = (3, 0, 4)$.
2. Distance $\lVert\mathbf{d}\rVert = \sqrt{9 + 0 + 16} = 5$ metres.
3. Direction $\hat{\mathbf{d}} = (3/5, 0, 4/5) = (0.6, 0, 0.8)$.
4. Moving at $2$ m/s for one 60 Hz frame ($\Delta t = 0.0167$ s): step $= 2 \times 0.0167 \times (0.6, 0, 0.8) = (0.02, 0, 0.0267)$.
:::

:::tip Compare squared lengths
A square root is not free. To compare distances ("is the enemy within 10 m?") compare **squared** lengths: `p.distanceToSquared(e) < 100`. The answer is the same and no square root is needed.
:::

```js title="three.js — distance, direction and movement"
const toEnemy = new THREE.Vector3();               // allocate once, reuse every frame

function update(dt) {
  toEnemy.subVectors(enemy.position, player.position);  // E - P
  const dist = toEnemy.length();
  if (dist > 0.001) {
    toEnemy.divideScalar(dist);                     // normalise (same as .normalize())
    player.position.addScaledVector(toEnemy, Math.min(speed * dt, dist));
  }
}
```

## The dot product

:::formula Dot product
$$\mathbf{a}\cdot\mathbf{b} = a_x b_x + a_y b_y + a_z b_z = \lVert\mathbf{a}\rVert\,\lVert\mathbf{b}\rVert\cos\theta$$
$\theta$ is the angle between the vectors. For unit vectors, $\mathbf{a}\cdot\mathbf{b} = \cos\theta$.
:::

The dot product answers "**how much do two directions agree?**". For unit vectors:

| $\hat{\mathbf{a}}\cdot\hat{\mathbf{b}}$ | Angle | Meaning |
|---|---|---|
| 1 | 0° | same direction |
| between 0 and 1 | under 90° | roughly the same way ("in front") |
| 0 | 90° | perpendicular |
| below 0 | over 90° | roughly opposite ("behind") |
| −1 | 180° | exactly opposite |

@fig(dot_projection) The dot product as projection. $\mathbf{a}\cdot\hat{\mathbf{b}}$ is the length of $\mathbf{a}$'s shadow on the line of $\hat{\mathbf{b}}$. Its sign tells you which side of the perpendicular $\mathbf{a}$ points to.

Uses you will meet throughout this notebook:

- **Diffuse lighting.** Lambert's law: brightness $\propto \max(0, \hat{\mathbf{n}}\cdot\hat{\mathbf{l}})$ (Chapter 9).
- **Facing tests.** Is the enemy in front of the player? $\text{forward}\cdot(E - P) > 0$. Within a 60° vision cone? $\hat{\text{forward}}\cdot\hat{\mathbf{d}} > \cos 30° = 0.866$.
- **Back-face culling** and **Fresnel** effects use $\hat{\mathbf{n}}\cdot\hat{\mathbf{v}}$.
- **Projection.** The component of $\mathbf{a}$ along a unit $\hat{\mathbf{b}}$ is $(\mathbf{a}\cdot\hat{\mathbf{b}})\,\hat{\mathbf{b}}$.

:::calc Is the enemy inside the guard's view cone?
Guard faces $\hat{\mathbf{f}} = (0, 0, -1)$. Enemy direction from the guard (normalised) $\hat{\mathbf{d}} = (0.6, 0, -0.8)$. Half-angle of the cone: 45°.

1. $\hat{\mathbf{f}}\cdot\hat{\mathbf{d}} = 0(0.6) + 0(0) + (-1)(-0.8) = 0.8$.
2. Angle $= \arccos(0.8) = 36.87°$.
3. Threshold $\cos 45° = 0.7071$. Since $0.8 > 0.7071$, the enemy is **inside** the cone. No `acos` is needed at runtime: compare the dot product with a precomputed cosine.
:::

```js title="three.js — view-cone test"
const forward = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const COS_HALF = Math.cos(THREE.MathUtils.degToRad(45));

function canSee(guard, target) {
  guard.getWorldDirection(forward);   // unit vector of the object's local +Z in world space
  forward.negate();                    // characters usually "face" −Z; flip if yours face +Z
  toTarget.subVectors(target.position, guard.position).normalize();
  return forward.dot(toTarget) > COS_HALF;
}
```

:::warn getWorldDirection points along +Z
`Object3D.getWorldDirection()` returns the object's local **+Z** axis in world space. For a camera, `camera.getWorldDirection()` is overridden to return the direction the camera **looks** (its −Z). Know which one you are calling.
:::

## The cross product

:::formula Cross product
$$\mathbf{a}\times\mathbf{b} = (a_y b_z - a_z b_y,\ \ a_z b_x - a_x b_z,\ \ a_x b_y - a_y b_x)$$
$$\lVert\mathbf{a}\times\mathbf{b}\rVert = \lVert\mathbf{a}\rVert\,\lVert\mathbf{b}\rVert\sin\theta$$
The result is perpendicular to both inputs, its direction follows the right-hand rule, and its length is the area of the parallelogram the two vectors span. It is **anti-commutative**: $\mathbf{b}\times\mathbf{a} = -(\mathbf{a}\times\mathbf{b})$.
:::

@fig(cross_product) The cross product is perpendicular to both inputs. Its length equals the parallelogram's area, so half of it is the area of the triangle formed by the two edges.

Uses:

- **Surface normals.** For a triangle $A, B, C$ with counter-clockwise winding, $\hat{\mathbf{n}} = \text{normalise}((B-A)\times(C-A))$. This is what `geometry.computeVertexNormals()` does per face before averaging.
- **Building a coordinate frame.** Given a forward direction and world up, $\text{right} = \text{forward}\times\text{up}$, then $\text{up}' = \text{right}\times\text{forward}$. This is how `lookAt` builds a rotation (Chapter 5).
- **Areas.** Triangle area $= \tfrac{1}{2}\lVert(B-A)\times(C-A)\rVert$, used for uniform random sampling on meshes (`MeshSurfaceSampler`).
- **Which side?** The sign of $(\mathbf{a}\times\mathbf{b})_y$ tells whether $\mathbf{b}$ is to the left or right of $\mathbf{a}$ on the ground plane, which steering behaviours use.

:::calc Normal and area of a triangle
$A = (0,0,0)$, $B = (2,0,0)$, $C = (0,0,-3)$ (a triangle lying on the ground).

1. Edges: $\mathbf{e}_1 = B - A = (2,0,0)$, $\mathbf{e}_2 = C - A = (0,0,-3)$.
2. $\mathbf{e}_1\times\mathbf{e}_2 = (0\cdot(-3) - 0\cdot 0,\ \ 0\cdot 0 - 2\cdot(-3),\ \ 2\cdot 0 - 0\cdot 0) = (0, 6, 0)$.
3. Normal $= (0, 1, 0)$: it points **up**, as expected for a counter-clockwise triangle seen from above.
4. Area $= \tfrac{1}{2}\times 6 = 3\ \text{m}^2$. Check: a right triangle with legs 2 and 3 has area $3$.
:::

## Projection and reflection

:::formula Projection onto a direction and onto a plane
$$\text{proj}_{\hat{\mathbf{n}}}\mathbf{v} = (\mathbf{v}\cdot\hat{\mathbf{n}})\,\hat{\mathbf{n}} \qquad \text{proj}_{\text{plane}}\mathbf{v} = \mathbf{v} - (\mathbf{v}\cdot\hat{\mathbf{n}})\,\hat{\mathbf{n}}$$
Projecting onto a plane removes the part of $\mathbf{v}$ along the plane's normal. Characters use this to slide along walls and slopes.
:::

:::formula Reflection
$$\mathbf{r} = \mathbf{d} - 2(\mathbf{d}\cdot\hat{\mathbf{n}})\,\hat{\mathbf{n}}$$
$\mathbf{d}$ is the incoming direction, $\hat{\mathbf{n}}$ the unit surface normal. Used for bouncing balls, mirror and environment reflections (`reflect()` in GLSL) and specular highlights.
:::

@fig(reflection) Reflection keeps the part of the direction along the surface and flips the part along the normal. Sliding (projection onto the plane) keeps only the along-surface part.

:::calc A ball bouncing off the floor
Velocity $\mathbf{d} = (3, -4, 0)$ m/s hits the floor with normal $\hat{\mathbf{n}} = (0, 1, 0)$.

1. $\mathbf{d}\cdot\hat{\mathbf{n}} = -4$.
2. $\mathbf{r} = (3,-4,0) - 2(-4)(0,1,0) = (3, -4, 0) + (0, 8, 0) = (3, 4, 0)$.
3. With a restitution (bounciness) of 0.8 applied to the normal part only: $(3, 0.8\times 4, 0) = (3, 3.2, 0)$.
:::

```js title="three.js — reflect, slide and project"
const n = new THREE.Vector3(0, 1, 0);                 // must be unit length
velocity.reflect(n);                                   // r = d - 2(d·n)n, in place
const slide = velocity.clone().projectOnPlane(n);      // movement along the surface
const along = velocity.clone().projectOnVector(n);     // movement into the surface
```

## Interpolation and damping

:::formula Linear interpolation (lerp)
$$\text{lerp}(\mathbf{a}, \mathbf{b}, t) = \mathbf{a} + t\,(\mathbf{b} - \mathbf{a}) = (1-t)\,\mathbf{a} + t\,\mathbf{b}$$
$t = 0$ gives $\mathbf{a}$, $t = 1$ gives $\mathbf{b}$, $t = 0.5$ the midpoint.
:::

:::formula Smoothstep
$$s(t) = 3t^2 - 2t^3 \qquad (0 \le t \le 1)$$
An S-shaped curve with zero slope at both ends: motion eases in and out. GLSL's `smoothstep(e0, e1, x)` first maps $x$ to $t = (x - e_0)/(e_1 - e_0)$ and clamps it to $[0,1]$.
:::

A very common camera trick is "move 10% of the way towards the target every frame": `pos.lerp(target, 0.1)`. It looks smooth, but it is **frame-rate dependent**: at 120 Hz it runs that step twice as often and arrives faster. The fix is **exponential damping**.

:::formula Frame-rate-independent damping
$$x \leftarrow \text{lerp}\big(x,\ \text{target},\ 1 - e^{-\lambda\,\Delta t}\big)$$
$\lambda$ is a smoothing rate (per second); the remaining distance shrinks by a factor $e^{-\lambda\Delta t}$ each frame, so after one second it has shrunk by $e^{-\lambda}$ whatever the frame rate. three.js provides `THREE.MathUtils.damp(x, target, lambda, dt)`; drei's companion library `maath` provides `easing.damp3` for vectors.
:::

@fig(damping) Following a target with a fixed per-frame lerp (dashed) depends on the frame rate; exponential damping (solid) gives the same curve at 30, 60 and 120 Hz.

:::calc Same feel at 60 Hz and 120 Hz
With $\lambda = 5$:

- At 60 Hz, $\Delta t = 1/60$: $t = 1 - e^{-5/60} = 1 - e^{-0.0833} = 0.0800$ per frame. After 60 frames the remaining fraction is $(1 - 0.08)^{60} = e^{-5} = 0.0067$.
- At 120 Hz, $\Delta t = 1/120$: $t = 1 - e^{-0.04167} = 0.0408$ per frame. After 120 frames: $e^{-5} = 0.0067$. Identical.
- The naive `lerp(…, 0.08)` at 120 Hz would leave $(0.92)^{120} = 0.000045$ after one second: much faster.
:::

```js title="three.js — damped follow camera"
const desired = new THREE.Vector3();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);         // clamp: a background tab can return a huge delta
  desired.copy(player.position).add(offset);          // where the camera wants to be
  const k = 1 - Math.exp(-5 * dt);
  camera.position.lerp(desired, k);
  camera.lookAt(player.position);
  renderer.render(scene, camera);
});
```

```jsx title="R3F — the same with maath"
import { useFrame } from "@react-three/fiber";
import { easing } from "maath";

function FollowCamera({ target, offset = [0, 3, 6] }) {
  useFrame((state, dt) => {
    const p = target.current.position;
    easing.damp3(state.camera.position, [p.x + offset[0], p.y + offset[1], p.z + offset[2]], 0.25, dt);
    state.camera.lookAt(p);
  });
  return null;
}
```

:::note maath's smoothTime
`easing.damp3(current, target, smoothTime, dt)` takes a **smooth time** in seconds (roughly the time to reach the target) instead of a rate; it uses a critically damped spring internally, so it also stays frame-rate independent.
:::

## Useful distance tests

:::formula Signed distance from a point to a plane
A plane with unit normal $\hat{\mathbf{n}}$ through point $Q$ can be written $\hat{\mathbf{n}}\cdot\mathbf{x} + d = 0$ with $d = -\hat{\mathbf{n}}\cdot Q$. For any point $\mathbf{p}$:
$$\text{dist}(\mathbf{p}) = \hat{\mathbf{n}}\cdot\mathbf{p} + d$$
Positive in front of the plane (the side the normal points to), negative behind, zero on it. `THREE.Plane.distanceToPoint()` computes it, and frustum culling is six of these tests.
:::

:::calc Which side of the water surface?
Water plane: normal $(0,1,0)$ through $(0, 2, 0)$, so $d = -2$. A fish at $(5, 1.4, -3)$: $\text{dist} = 1.4 - 2 = -0.6$, so it is 0.6 m **under** water. A bird at $(1, 7, 0)$: $7 - 2 = 5$ m above.
:::

```js title="three.js — Plane and Sphere helpers"
const water = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2);   // n·x + d = 0
water.distanceToPoint(fish.position);          // -0.6
const bounds = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.5);
bounds.containsPoint(p);                       // |p - c| <= r
const box = new THREE.Box3().setFromObject(model);   // world-space axis-aligned bounding box
box.getSize(new THREE.Vector3()); box.getCenter(new THREE.Vector3());
```

:::keypoints
- Points have $w = 1$ and are moved by translation; directions have $w = 0$ and are not.
- three.js maths methods mutate in place and return `this`; clone or use `…Vectors(a, b)` forms when you need to keep inputs.
- Dot product: agreement between directions, $\cos\theta$ for unit vectors; used for lighting, facing tests, projection.
- Cross product: a perpendicular vector whose length is the parallelogram area; used for normals and coordinate frames.
- Reflection $\mathbf{r} = \mathbf{d} - 2(\mathbf{d}\cdot\hat{\mathbf{n}})\hat{\mathbf{n}}$; sliding is projection onto the plane.
- Use $1 - e^{-\lambda\Delta t}$ (or `MathUtils.damp`, `maath` `easing`) for frame-rate-independent smoothing.
- Avoid allocating vectors inside the frame loop: create temporaries once and reuse them.
:::

## Interview questions

:::qa How do you check whether one object is in front of another? {level=junior}
Take the first object's forward direction $\mathbf{f}$ in world space and the vector to the second, $\mathbf{d} = B - A$. If $\mathbf{f}\cdot\mathbf{d} > 0$ the target is in front (angle under 90°). For a vision cone with half-angle $\alpha$, normalise both and compare the dot product with $\cos\alpha$ (precomputed), which avoids `acos`. In three.js: `obj.getWorldDirection(f)` (remember it returns local +Z for non-camera objects) and `f.dot(d.normalize())`.
:::

:::qa How do you compute a triangle's normal, and why does winding order matter? {level=junior}
$\hat{\mathbf{n}} = \text{normalise}((B-A)\times(C-A))$. The cross product's direction follows the right-hand rule, so swapping the order of $B$ and $C$ flips the normal. three.js treats counter-clockwise triangles (as seen from the viewer) as front faces, so geometry with the wrong winding is culled or lit from the back. `computeVertexNormals()` averages face normals at shared vertices for smooth shading.
:::

:::qa `camera.position.lerp(target, 0.1)` in the render loop feels different on a 120 Hz screen. Why, and how do you fix it? {level=mid}
A constant per-frame factor runs more steps per second at higher refresh rates, so the camera converges faster (after one second the remaining distance is $0.9^{60}$ at 60 Hz but $0.9^{120}$ at 120 Hz). Use exponential damping with delta time: `lerp(target, 1 - Math.exp(-lambda * dt))`, or `THREE.MathUtils.damp`, or `maath`'s `easing.damp3`. Then the remaining fraction after time $t$ is always $e^{-\lambda t}$. Also clamp `dt`, since a tab returning from the background can report a huge delta.
:::

:::qa Why is `new THREE.Vector3()` inside `useFrame` or an animation loop a problem? {level=mid}
It allocates an object every frame (60–120 times a second per call site). The garbage collector must later reclaim them, and GC pauses cause frame hitches. Create temporaries once (module scope, `useMemo`, or a closure) and reuse them with `.set()` / `.copy()`. This is listed in the official R3F performance pitfalls.
:::

:::qa How would you make a character slide along a wall instead of stopping? {level=mid}
When the movement vector $\mathbf{v}$ hits a wall with unit normal $\hat{\mathbf{n}}$, remove the component going into the wall: $\mathbf{v}' = \mathbf{v} - (\mathbf{v}\cdot\hat{\mathbf{n}})\hat{\mathbf{n}}$, which is `v.projectOnPlane(n)`. Only remove it when $\mathbf{v}\cdot\hat{\mathbf{n}} < 0$ (moving into the wall). Physics engines' character controllers (for example Rapier's `KinematicCharacterController`) do this with several iterations to handle corners.
:::
