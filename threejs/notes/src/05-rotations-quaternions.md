---
title: Rotations and Quaternions
summary: Four ways to describe an orientation, why Euler angles suffer gimbal lock, the axis–angle formula, quaternions from first principles with hand-worked rotations, slerp for smooth turning, and how lookAt builds a rotation from a direction.
difficulty: Advanced
prereqs: Chapters 3 and 4
time: 60–90 minutes
outcome: Choose between Euler angles, matrices and quaternions, rotate and interpolate orientations by hand, and turn objects smoothly towards targets.
---

## Four ways to describe a rotation {foundation}

| Representation | Numbers | Strengths | Weaknesses | three.js |
|---|---|---|---|---|
| Euler angles | 3 (+ an order) | Human-readable; easy UI sliders | Gimbal lock; order-dependent; poor interpolation | `object.rotation` (`THREE.Euler`) |
| Axis–angle | 4 (unit axis + angle) | Intuitive for one rotation | Composing two is awkward | `setFromAxisAngle`, `rotateOnAxis` |
| Rotation matrix | 9 | Directly usable by the GPU; composes by multiplication | Redundant; drifts from orthonormal under repeated maths | `Matrix4` / `Matrix3` |
| Quaternion | 4 | Compact; no gimbal lock; smooth interpolation (slerp); cheap to compose | Not intuitive to read | `object.quaternion` (`THREE.Quaternion`) |

`object.rotation` and `object.quaternion` are **kept in sync** by three.js: change one and the other updates. Use Euler angles to set simple orientations and quaternions for anything animated, accumulated or interpolated.

## Euler angles and gimbal lock {foundation}

:::def Euler angles
An orientation given as three successive rotations about coordinate axes, plus the **order** in which they are applied. three.js's default order is `"XYZ"`: the rotation matrix is $R = R_x(\alpha)\,R_y(\beta)\,R_z(\gamma)$. Read as rotations about the object's own (moving) axes, it turns about X first, then about its new Y, then its new Z.
:::

:::tip Use "YXZ" for cameras and characters
For a first-person camera you want yaw (turn left/right about world Y) to be independent of pitch (look up/down). With order `"YXZ"` the object yaws first, then pitches about its own X, then rolls. Set `camera.rotation.order = "YXZ"`; `PointerLockControls` does exactly this.
:::

:::def Gimbal lock
The loss of one degree of freedom when the middle rotation of an Euler sequence reaches ±90°, which lines up the first and third rotation axes. Two of the three angles then turn the object about the same axis, so one direction of rotation becomes impossible to reach with small changes, and interpolation takes strange paths.
:::

@fig(gimbal) Three nested gimbals. Normally each ring adds an independent axis (left). When the middle ring turns 90°, the outer and inner axes coincide (right): two angles now do the same thing.

:::calc Seeing gimbal lock in the matrix
Order `"XYZ"` with $\beta = 90°$ ($\cos\beta = 0$, $\sin\beta = 1$). Multiplying out $R_x(\alpha)R_y(90°)R_z(\gamma)$ gives a matrix whose entries depend only on $\alpha + \gamma$, for example its first row is $(0,\ 0,\ 1)$ and the second is $(\sin(\alpha+\gamma),\ \cos(\alpha+\gamma),\ 0)$. So $(\alpha, \gamma) = (30°, 0°)$ and $(0°, 30°)$ give the **same** orientation: one degree of freedom has gone.
:::

## Axis–angle and Rodrigues' formula

Any 3D rotation, however complicated, is a single turn by some angle $\theta$ about some unit axis $\hat{\mathbf{k}}$ (Euler's rotation theorem).

:::formula Rodrigues' rotation formula
$$\mathbf{v}_{\text{rot}} = \mathbf{v}\cos\theta + (\hat{\mathbf{k}}\times\mathbf{v})\sin\theta + \hat{\mathbf{k}}\,(\hat{\mathbf{k}}\cdot\mathbf{v})(1-\cos\theta)$$
The part of $\mathbf{v}$ along the axis stays put; the perpendicular part turns in the plane perpendicular to $\hat{\mathbf{k}}$.
:::

:::calc 90° about Y with Rodrigues
$\mathbf{v} = (1, 0, 0)$, $\hat{\mathbf{k}} = (0, 1, 0)$, $\theta = 90°$.

1. $\mathbf{v}\cos\theta = (0, 0, 0)$.
2. $\hat{\mathbf{k}}\times\mathbf{v} = (1\cdot 0 - 0\cdot 0,\ 0\cdot 1 - 0\cdot 0,\ 0\cdot 0 - 1\cdot 1) = (0, 0, -1)$, times $\sin\theta = 1$.
3. $\hat{\mathbf{k}}\cdot\mathbf{v} = 0$, so the last term vanishes.
4. Result $(0, 0, -1)$, the same answer as the matrix $R_y(90°)$ in Chapter 4.
:::

## Quaternions

:::def Quaternion
A four-component number $q = (x, y, z, w) = (\mathbf{u}, w)$ with a vector part $\mathbf{u}$ and a scalar part $w$. A **unit** quaternion ($x^2+y^2+z^2+w^2 = 1$) represents a rotation by angle $\theta$ about unit axis $\hat{\mathbf{k}}$:
$$q = \left(\hat{\mathbf{k}}\sin\tfrac{\theta}{2},\ \cos\tfrac{\theta}{2}\right)$$
The identity (no rotation) is $(0, 0, 0, 1)$. three.js stores quaternions in the order `x, y, z, w`.
:::

Why the half angle? A quaternion rotates a vector by "sandwiching" it, $q\,\mathbf{v}\,q^{*}$, and each side contributes half of the turn. A side effect: $q$ and $-q$ describe the **same** rotation (a turn of $\theta$ and of $\theta + 360°$), which is called the **double cover**.

:::formula Quaternion product (composition)
$$q_1 q_2 = \big(\,w_1\mathbf{u}_2 + w_2\mathbf{u}_1 + \mathbf{u}_1\times\mathbf{u}_2,\ \ w_1 w_2 - \mathbf{u}_1\cdot\mathbf{u}_2\,\big)$$
$q_1 q_2$ means "rotate by $q_2$, then by $q_1$" (like matrices, the right-most acts first). It is **not commutative**. The inverse of a unit quaternion is its conjugate $q^{*} = (-\mathbf{u}, w)$.
:::

:::formula Rotating a vector with a quaternion
$$\mathbf{v}' = q\,\mathbf{v}\,q^{*} = \mathbf{v} + 2w\,(\mathbf{u}\times\mathbf{v}) + 2\,\mathbf{u}\times(\mathbf{u}\times\mathbf{v})$$
The right-hand form is what `Vector3.applyQuaternion` effectively computes: two cross products, no trigonometry.
:::

:::calc Building and applying a quaternion by hand
Rotate $\mathbf{v} = (1, 0, 0)$ by 90° about Y.

1. $q = (\hat{\mathbf{k}}\sin 45°, \cos 45°) = (0,\ 0.7071,\ 0,\ 0.7071)$; so $\mathbf{u} = (0, 0.7071, 0)$, $w = 0.7071$.
2. $\mathbf{u}\times\mathbf{v} = (0.7071\cdot 0 - 0\cdot 0,\ 0\cdot 1 - 0\cdot 0,\ 0\cdot 0 - 0.7071\cdot 1) = (0, 0, -0.7071)$.
3. $2w(\mathbf{u}\times\mathbf{v}) = 2(0.7071)(0, 0, -0.7071) = (0, 0, -1)$.
4. $\mathbf{u}\times(\mathbf{u}\times\mathbf{v}) = (0.7071\cdot(-0.7071) - 0,\ 0 - 0,\ 0 - 0) = (-0.5, 0, 0)$; doubled: $(-1, 0, 0)$.
5. $\mathbf{v}' = (1,0,0) + (0,0,-1) + (-1,0,0) = (0, 0, -1)$. Matches Rodrigues and the matrix.
:::

:::calc Composing: two quarter turns make a half turn
$q\,q$ with $q = (0, 0.7071, 0, 0.7071)$:

- Vector part: $w\mathbf{u} + w\mathbf{u} + \mathbf{u}\times\mathbf{u} = 2(0.7071)(0, 0.7071, 0) + \mathbf{0} = (0, 1, 0)$.
- Scalar part: $w^2 - \mathbf{u}\cdot\mathbf{u} = 0.5 - 0.5 = 0$.
- $(0, 1, 0, 0) = (\hat{\mathbf{y}}\sin 90°, \cos 90°)$: a 180° turn about Y.
:::

:::tip Renormalise accumulated quaternions
Multiplying many quaternions (for example applying a small rotation every frame) slowly drifts their length away from 1 through floating-point error, which skews the object. Call `q.normalize()` occasionally. Matrices drift too, and are much harder to fix (re-orthonormalisation), one more reason to accumulate rotations as quaternions.
:::

## Slerp: smooth interpolation between orientations

Interpolating Euler angles component by component gives wobbly, non-uniform paths and can take the long way round. Interpolating quaternions along the great circle of the 4D unit sphere gives the **shortest** rotation at **constant** angular speed.

:::formula Spherical linear interpolation (slerp)
$$\text{slerp}(q_0, q_1, t) = \frac{\sin\big((1-t)\Omega\big)}{\sin\Omega}\,q_0 + \frac{\sin(t\Omega)}{\sin\Omega}\,q_1, \qquad \cos\Omega = q_0\cdot q_1$$
If $q_0\cdot q_1 < 0$, negate $q_1$ first (allowed by the double cover) so the path takes the short way. When $\Omega$ is tiny, fall back to normalised lerp to avoid dividing by $\sin\Omega \approx 0$. three.js's `Quaternion.slerp` does all of this.
:::

@fig(slerp) Lerp moves along the straight chord and must be renormalised, which makes it speed up in the middle. Slerp moves along the arc at constant angular speed. For small angles the two are almost identical, so nlerp (normalised lerp) is a common cheap substitute.

:::calc Halfway between "no rotation" and "90° about Y"
$q_0 = (0,0,0,1)$, $q_1 = (0, 0.7071, 0, 0.7071)$, $t = 0.5$.

1. $\cos\Omega = q_0\cdot q_1 = 0.7071$, so $\Omega = 45°$ (in quaternion space, half the rotation angle).
2. Both weights $= \sin(22.5°)/\sin(45°) = 0.3827/0.7071 = 0.5412$.
3. $q = 0.5412\,(0,0,0,1) + 0.5412\,(0, 0.7071, 0, 0.7071) = (0,\ 0.3827,\ 0,\ 0.9239)$.
4. That is $(\hat{\mathbf{y}}\sin 22.5°, \cos 22.5°)$: exactly **45°** about Y, as expected.
:::

```js title="three.js — turn a turret smoothly towards a target"
const targetQ = new THREE.Quaternion();
const m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

function aim(turret, targetPos, dt) {
  // a rotation matrix that points the object's −Z at the target (camera-style lookAt)
  m.lookAt(turret.position, targetPos, UP);
  targetQ.setFromRotationMatrix(m);
  // Option 1: exponential smoothing (frame-rate independent)
  turret.quaternion.slerp(targetQ, 1 - Math.exp(-8 * dt));
  // Option 2: a fixed maximum turn speed of 90° per second
  // turret.quaternion.rotateTowards(targetQ, THREE.MathUtils.degToRad(90) * dt);
}
```

```jsx title="R3F — the same inside useFrame"
function Turret({ target }) {
  const ref = useRef();
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame((_, dt) => {
    const t = ref.current;
    tmp.m.lookAt(t.position, target.current.position, tmp.up);
    tmp.q.setFromRotationMatrix(tmp.m);
    t.quaternion.slerp(tmp.q, 1 - Math.exp(-8 * dt));
  });
  return <mesh ref={ref}><coneGeometry args={[0.3, 1, 16]} /><meshStandardMaterial /></mesh>;
}
```

## Useful quaternion recipes

| Goal | three.js |
|---|---|
| Rotation of $\theta$ about an axis | `q.setFromAxisAngle(axis, theta)` (axis must be unit length) |
| The rotation that turns direction $\mathbf{a}$ into $\mathbf{b}$ | `q.setFromUnitVectors(a, b)` (both unit length) |
| From Euler angles | `q.setFromEuler(new THREE.Euler(x, y, z, "YXZ"))` |
| Apply in world space | `object.rotateOnWorldAxis(axis, angle)` or `object.quaternion.premultiply(q)` |
| Apply in local space | `object.rotateOnAxis(axis, angle)` or `object.quaternion.multiply(q)` |
| Angle between two orientations | `q1.angleTo(q2)` (radians) |
| Rotate a vector | `v.applyQuaternion(q)` |

:::calc Aligning a model's up axis with a surface normal
A tree should stand perpendicular to a slope with unit normal $\hat{\mathbf{n}} = (0.6, 0.8, 0)$. `q.setFromUnitVectors((0,1,0), n)` gives the rotation about the axis $\hat{\mathbf{y}}\times\hat{\mathbf{n}} = (0, 0, -0.6)$ (normalised $(0,0,-1)$) by the angle $\arccos(\hat{\mathbf{y}}\cdot\hat{\mathbf{n}}) = \arccos(0.8) = 36.87°$. The tree tilts 36.87° towards +X, matching the slope.
:::

## How lookAt builds a rotation

`lookAt` turns "look from here towards there" into an orientation by building three perpendicular unit axes, which become the columns of a rotation matrix.

:::formula Look-at basis
For an eye at $E$ looking at target $T$ with a world up hint $\mathbf{up}$:
$$\hat{\mathbf{z}} = \text{normalise}(E - T),\quad \hat{\mathbf{x}} = \text{normalise}(\mathbf{up}\times\hat{\mathbf{z}}),\quad \hat{\mathbf{y}} = \hat{\mathbf{z}}\times\hat{\mathbf{x}}$$
$R = [\,\hat{\mathbf{x}}\ \hat{\mathbf{y}}\ \hat{\mathbf{z}}\,]$. The camera's local −Z then points at the target. three.js's `Object3D.lookAt` uses this for cameras and lights, and the reverse ($+Z$ towards the target) for other objects.
:::

@fig(lookat) lookAt builds a frame from the view direction and the up hint. If the view direction is parallel to up (looking straight down), the cross product is zero and the frame is undefined, which causes a sudden flip.

:::calc A camera looking at the origin from (0, 0, 5)
$\hat{\mathbf{z}} = \text{normalise}((0,0,5) - (0,0,0)) = (0,0,1)$; $\hat{\mathbf{x}} = (0,1,0)\times(0,0,1) = (1, 0, 0)$; $\hat{\mathbf{y}} = (0,0,1)\times(1,0,0) = (0, 1, 0)$. The identity rotation, as expected for a camera on +Z looking down −Z.
:::

:::warn Looking straight up or down
When the view direction is (almost) parallel to `object.up`, $\mathbf{up}\times\hat{\mathbf{z}} \approx \mathbf{0}$ and the orientation flips or spins. Top-down cameras should set `camera.up.set(0, 0, -1)` (or another axis not parallel to the view) before calling `lookAt`. `OrbitControls` clamps the polar angle slightly short of the poles for the same reason.
:::

:::keypoints
- `rotation` (Euler) and `quaternion` are synced; default Euler order is `"XYZ"`, use `"YXZ"` for cameras.
- Gimbal lock: the middle Euler angle at ±90° aligns the other two axes.
- Unit quaternion $= (\hat{\mathbf{k}}\sin\frac{\theta}{2}, \cos\frac{\theta}{2})$; $q$ and $-q$ are the same rotation.
- $q_1 q_2$ applies $q_2$ first; rotate a vector with $\mathbf{v} + 2w(\mathbf{u}\times\mathbf{v}) + 2\mathbf{u}\times(\mathbf{u}\times\mathbf{v})$.
- Slerp gives constant-speed, shortest-path interpolation; negate when the dot product is negative.
- `setFromUnitVectors`, `rotateTowards`, `slerp` with $1-e^{-\lambda\Delta t}$ cover most gameplay rotation needs.
- lookAt builds $[\hat{\mathbf{x}}\ \hat{\mathbf{y}}\ \hat{\mathbf{z}}]$ with cross products; it breaks when looking along `up`.
:::

:::build Smooth turret
Problem: A turret on a tank must track a moving target with a maximum turn speed of 120° per second; the barrel pitches separately from the base.
Requirements:
- Yaw the base about world Y and pitch the barrel about its local X.
- Limit the barrel pitch to between −10° and +45°.
- Never interpolate Euler angles.
Constraints: identical behaviour at 30, 60 and 120 Hz.
Hints: build the desired orientation with `Matrix4.lookAt` or `setFromUnitVectors`, then `rotateTowards` with `maxSpeed * dt`; split yaw and pitch by projecting the target direction onto the ground plane.
Relevant APIs: `Quaternion.rotateTowards`, `Quaternion.setFromAxisAngle`, `Matrix4.lookAt`, `Vector3.projectOnPlane`, `MathUtils.clamp`.
Expected result: the turret turns at a steady rate, takes the short way round, and stops exactly on target without jitter.
:::

## Interview questions

:::qa What is gimbal lock and how do quaternions avoid it? {level=mid}
Euler angles apply three rotations in sequence. When the middle one reaches ±90°, the first and third axes line up, so two angles produce the same motion and a degree of freedom is lost; interpolation then follows odd paths. A quaternion represents the whole orientation as one rotation about one axis (a point on the 4D unit sphere), with no sequence of axes to collapse, so it has no gimbal lock. Gimbal lock is a problem of the **parametrisation**, not of rotations themselves.
:::

:::qa Why does a unit quaternion use half the angle, and what is the double cover? {level=senior}
A quaternion rotates a vector by conjugation, $q\mathbf{v}q^{*}$, and each multiplication contributes half the rotation, so $q$ stores $\sin\frac{\theta}{2}$ and $\cos\frac{\theta}{2}$. Consequently $q$ and $-q$ give the same rotation (adding 360° to $\theta$ flips both signs). When interpolating you must pick the representative closer to the start ($q_0\cdot q_1 \geq 0$), otherwise slerp takes the long way round (a 350° turn instead of 10°).
:::

:::qa How would you make an object turn towards a moving target at a limited speed? {level=mid}
Each frame compute the desired orientation (for example `Matrix4.lookAt` then `setFromRotationMatrix`, or `setFromUnitVectors` for a single axis), then move the current quaternion towards it: `quaternion.rotateTowards(target, maxAngularSpeed * dt)` for a hard speed limit, or `slerp(target, 1 - Math.exp(-k * dt))` for smooth exponential easing. Both are frame-rate independent. Avoid interpolating Euler angles, which can spin the long way when an angle wraps past ±180°.
:::

:::qa What is the difference between `multiply` and `premultiply` on a quaternion? {level=mid}
`q.multiply(r)` sets $q = q\,r$: $r$ is applied first, in the object's **local** frame (a local-space rotation). `q.premultiply(r)` sets $q = r\,q$: $r$ is applied after, in the **world** frame. So turning a spaceship about its own nose axis uses `multiply`, while rotating it about the world's vertical axis uses `premultiply` (or `rotateOnWorldAxis`).
:::

:::qa A top-down camera flips randomly when you call lookAt. Why? {level=mid}
`lookAt` builds the right axis as $\mathbf{up}\times\hat{\mathbf{z}}$. With the default up $(0,1,0)$ and a view straight down, the view direction is parallel to up, the cross product is (nearly) zero, and normalising it is unstable, so the orientation flips. Set a different `camera.up` (for example $(0, 0, -1)$) for top-down views, or use an orthographic camera with a fixed rotation.
:::
