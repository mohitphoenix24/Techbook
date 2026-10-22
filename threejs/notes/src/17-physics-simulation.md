---
title: Physics and Simulation
summary: Numerical integration (explicit and semi-implicit Euler, Verlet) compared on the same throw, forces and torque, impulse-based collision response with restitution and friction worked by hand, constraints and solvers, tunnelling and CCD, Verlet cloth, and practical physics with Rapier in three.js and @react-three/rapier.
difficulty: Intermediate
prereqs: Chapters 3 and 7
time: 60–75 minutes
outcome: Choose a stable integrator, compute collision impulses, avoid tunnelling, and build physics scenes with Rapier in three.js and R3F.
---

## Simulating motion

A physics engine moves objects by repeatedly applying Newton's second law over small time steps.

:::formula Newton's second law, linear and angular
$$\mathbf{F} = m\,\mathbf{a},\qquad \boldsymbol{\tau} = \mathbf{r}\times\mathbf{F} = I\,\boldsymbol{\alpha}$$
Force $\mathbf{F}$ accelerates mass $m$. A force applied at offset $\mathbf{r}$ from the centre of mass also creates a **torque** $\boldsymbol{\tau}$, which spins the body according to its **inertia tensor** $I$ (how its mass is spread out).
:::

:::calc Pushing a door
A force of 10 N pushing in $-Z$ at the door's edge, 0.5 m from the hinge along $+X$: $\boldsymbol{\tau} = (0.5, 0, 0)\times(0, 0, -10) = (0\cdot(-10) - 0\cdot 0,\ 0\cdot 0 - 0.5\cdot(-10),\ 0) = (0, 5, 0)$ N·m. A torque about $+Y$: the door swings anticlockwise seen from above. Push at 0.25 m and the torque halves, which is why handles sit far from hinges.
:::

### Integrators

:::def Numerical integration
Turning accelerations into velocities and positions one time step $h$ at a time. The choice of method decides accuracy and, more importantly for games, **stability**: whether errors stay bounded or grow until objects explode.
:::

:::formula Three integrators
$$\textbf{Explicit Euler:}\quad \mathbf{x}_{n+1} = \mathbf{x}_n + h\,\mathbf{v}_n,\quad \mathbf{v}_{n+1} = \mathbf{v}_n + h\,\mathbf{a}_n$$
$$\textbf{Semi-implicit (symplectic) Euler:}\quad \mathbf{v}_{n+1} = \mathbf{v}_n + h\,\mathbf{a}_n,\quad \mathbf{x}_{n+1} = \mathbf{x}_n + h\,\mathbf{v}_{n+1}$$
$$\textbf{Position Verlet:}\quad \mathbf{x}_{n+1} = 2\mathbf{x}_n - \mathbf{x}_{n-1} + h^2\,\mathbf{a}_n$$
Explicit Euler adds energy to oscillating systems (springs grow until they explode). Semi-implicit Euler is just as cheap but keeps energy bounded, which is why most game engines use it. Verlet needs no velocity at all (it is implied by the last two positions), which makes constraints easy (cloth, ropes, ragdolls).
:::

:::calc The same throw, three integrators
A ball thrown straight up at 10 m/s, $g = -9.81$ m/s², step $h = 0.1$ s, ten steps (1 s). Exact height: $10(1) - \tfrac{1}{2}(9.81)(1)^2 = 5.095$ m.

- Explicit Euler: $y = 5.586$ m (too high, it uses the old, faster velocity).
- Semi-implicit Euler: $y = 4.605$ m (too low by the same amount, but stable).
- Verlet: $y = 5.095$ m (exact for constant acceleration).

With realistic steps ($h = 1/60$) the errors are about six times smaller; what matters more is that springs and stacked contacts stay stable.
:::

@fig(integrators) Explicit Euler on a spring spirals outwards (gains energy); semi-implicit Euler stays on a stable orbit. Same step size, same cost.

## Collision response

Detecting a collision (Chapter 14) gives a contact point, a normal $\hat{\mathbf{n}}$ and a penetration depth. The response changes velocities so the bodies separate, using an **impulse**: a large force over a tiny time, an instant change of momentum.

:::formula Impulse for a collision (no rotation)
Relative velocity along the normal $v_n = (\mathbf{v}_1 - \mathbf{v}_2)\cdot\hat{\mathbf{n}}$ (with $\hat{\mathbf{n}}$ pointing from body 1 to body 2; $v_n > 0$ means approaching). With restitution $e$ (0 = dead stop, 1 = perfectly bouncy):
$$j = \frac{(1 + e)\,v_n}{\dfrac{1}{m_1} + \dfrac{1}{m_2}},\qquad \mathbf{v}_1' = \mathbf{v}_1 - \frac{j}{m_1}\hat{\mathbf{n}},\qquad \mathbf{v}_2' = \mathbf{v}_2 + \frac{j}{m_2}\hat{\mathbf{n}}$$
A static body has $1/m = 0$ (infinite mass). With rotation, the denominator gains terms $(I^{-1}(\mathbf{r}\times\hat{\mathbf{n}})\times\mathbf{r})\cdot\hat{\mathbf{n}}$ for each body.
:::

:::calc Two carts collide
Cart 1: $m_1 = 2$ kg, $\mathbf{v}_1 = (3, 0, 0)$. Cart 2: $m_2 = 1$ kg, $\mathbf{v}_2 = (-1, 0, 0)$. Normal $\hat{\mathbf{n}} = (1,0,0)$, restitution $e = 0.5$.

1. $v_n = (3 - (-1)) = 4$ m/s (approaching).
2. $j = (1.5\times4)/(0.5 + 1) = 4$ N·s.
3. $\mathbf{v}_1' = 3 - 4/2 = 1$ m/s; $\mathbf{v}_2' = -1 + 4/1 = 3$ m/s.
4. Checks: momentum before $2(3) + 1(-1) = 5$, after $2(1) + 1(3) = 5$ (conserved). Separation speed $3 - 1 = 2 = e\times 4$ (restitution respected).
:::

:::formula Coulomb friction
$$\lVert\mathbf{F}_t\rVert \le \mu\,\lVert\mathbf{F}_n\rVert$$
Friction opposes sliding with at most $\mu$ times the normal force. In impulse form, the tangential impulse is clamped to $\mu\,j$. A block rests on a slope while $\tan\theta \le \mu_s$.
:::

:::calc When does the crate slide?
With $\mu = 0.5$: $\tan\theta = 0.5$, so $\theta = 26.6°$. Tilt the ramp beyond 26.6° and the crate slides. In Rapier, contact friction combines the two colliders' coefficients (the average by default).
:::

## Constraints, solvers and stability

:::def Constraint and joint
A rule that removes freedom of motion: a contact (no penetration), a **fixed** joint (weld), a **revolute** joint (hinge: doors, wheels), a **prismatic** joint (slider: pistons, drawers), a **spherical** joint (ball and socket: ragdoll shoulders), a **rope** joint (maximum distance). Motors drive joints towards a target speed or position.
:::

:::def Iterative solver
Engines solve all contacts and joints together by **iteration** (sequential impulses / projected Gauss–Seidel): fix each constraint in turn, repeat a few times per step. More iterations give stiffer stacks and chains but cost CPU; too few and tall stacks jitter and sink.
:::

| Problem | Cause | Fix |
|---|---|---|
| Objects pass through thin walls | **Tunnelling**: one step moves farther than the wall is thick | Continuous collision detection (`ccd`), thicker colliders, smaller step |
| Stacks jitter and topple | Too few solver iterations; huge mass ratios | More iterations, similar masses, sleeping |
| Things explode apart | Deep initial overlap, explicit integration, giant forces | Spawn without overlap, clamp forces, fixed step |
| Slow-motion or speed-up | Simulating with the variable frame delta | Fixed timestep + interpolation (Chapter 7) |
| Ragdolls feel floaty | Wrong scale (centimetres instead of metres) | Model in metres; gravity −9.81 |

:::calc Tunnelling a bullet
A projectile at 100 m/s simulated at 60 Hz moves $100/60 = 1.67$ m per step. A 0.1 m wall lies between two sampled positions and is never touched. **Continuous collision detection** sweeps the shape between steps and finds the time of impact; enable it only for small fast objects, because it costs more.
:::

:::def Sleeping
Bodies that have been almost motionless for a while are put to **sleep**: skipped by the solver until something touches them. It is why a pile of 1,000 resting boxes costs little. Calling `applyImpulse(…, true)` (the `true` wakes the body) or moving a neighbour wakes them.
:::

## Physics engines for the web

| Engine | Language | Strengths | three.js integration |
|---|---|---|---|
| **Rapier** | Rust → WASM | Fast, robust, deterministic option, character controller, CCD, joints | `@dimforge/rapier3d-compat`; `RapierPhysics` addon; `@react-three/rapier` |
| **Jolt** (JoltPhysics.js) | C++ → WASM | AAA engine (Horizon Forbidden West), very fast with many bodies, vehicles, soft bodies | `JoltPhysics` addon |
| **Ammo.js** | Bullet (C++) → asm.js/WASM | Mature, soft bodies | `AmmoPhysics` addon (older, larger) |
| **cannon-es** | JavaScript | Tiny and easy, pure JS | `@react-three/cannon` |

Physics runs in its own **world**, separate from the three.js scene. Each frame you step the world and copy every dynamic body's position and rotation onto its mesh (the addons and `@react-three/rapier` do this for you).

```js title="three.js — Rapier directly"
import RAPIER from "@dimforge/rapier3d-compat";
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.1, 10));                 // static ground (half extents)
const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 4, 0).setCcdEnabled(true));
world.createCollider(RAPIER.ColliderDesc.ball(0.5).setRestitution(0.6).setFriction(0.5), body);

renderer.setAnimationLoop(() => {
  world.step();                                   // default fixed step of 1/60 s
  const p = body.translation(), q = body.rotation();
  ball.position.set(p.x, p.y, p.z);
  ball.quaternion.set(q.x, q.y, q.z, q.w);
  renderer.render(scene, camera);
});
body.applyImpulse({ x: 0, y: 5, z: 0 }, true);    // a jump; true wakes the body
```

```jsx title="R3F — @react-three/rapier"
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";

function Ball() {
  const ref = useRef();
  return (
    <RigidBody ref={ref} colliders="ball" position={[0, 4, 0]} restitution={0.6} ccd
      onCollisionEnter={({ other }) => console.log("hit", other.rigidBodyObject?.name)}>
      <mesh castShadow onClick={() => ref.current.applyImpulse({ x: 0, y: 5, z: 0 }, true)}>
        <sphereGeometry args={[0.5, 32, 16]} />
        <meshStandardMaterial color="#f472b6" />
      </mesh>
    </RigidBody>
  );
}

export default function App() {
  return (
    <Canvas shadows camera={{ position: [6, 5, 8] }}>
      <Physics gravity={[0, -9.81, 0]} debug={false}>
        <Ball />
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[10, 0.1, 10]} position={[0, -0.1, 0]} />
        </RigidBody>
        <CuboidCollider sensor args={[1, 1, 1]} position={[4, 1, 0]} onIntersectionEnter={() => console.log("goal!")} />
      </Physics>
    </Canvas>
  );
}
```

| Body type | Moved by | Use |
|---|---|---|
| `dynamic` | Forces, impulses, collisions | Balls, crates, ragdolls |
| `fixed` | Nothing | Ground, walls |
| `kinematicPosition` | You, via `setNextKinematicTranslation/Rotation` | Moving platforms, doors, robot arms, tilting mazes |
| `kinematicVelocity` | You, via a velocity | Conveyor belts, elevators |

| Collider shapes | Cost | Notes |
|---|---|---|
| ball, cuboid, capsule, cylinder, cone | Cheapest | Approximate everything you can with these |
| convex hull (`colliders="hull"`) | Moderate | A tight convex wrapper; good for props |
| trimesh (`colliders="trimesh"`) | Expensive, static-only in practice | Exact level geometry; avoid on dynamic bodies |
| heightfield | Cheap for terrain | Grid of heights |

:::tip Character controllers
Players should usually **not** be dynamic rigid bodies (they tip over, slide and bounce). Use a kinematic capsule with Rapier's `KinematicCharacterController` (`world.createCharacterController(0.01)`, then `computeColliderMovement(collider, desired)` and read `computedMovement()`), which slides along walls, climbs steps and snaps to slopes, then move the body with `setNextKinematicTranslation`.
:::

## Verlet cloth and soft constraints {advanced}

Cloth, ropes and jelly are particles joined by distance constraints, simulated with Verlet integration and **position-based** constraint solving (Jakobsen's method, the basis of position-based dynamics).

:::formula Distance constraint relaxation
For two particles $\mathbf{p}_1, \mathbf{p}_2$ that should be $L$ apart, with $\mathbf{d} = \mathbf{p}_2 - \mathbf{p}_1$:
$$\Delta = \frac{\lVert\mathbf{d}\rVert - L}{\lVert\mathbf{d}\rVert}\,\mathbf{d},\qquad \mathbf{p}_1 \leftarrow \mathbf{p}_1 + \tfrac{1}{2}\Delta,\qquad \mathbf{p}_2 \leftarrow \mathbf{p}_2 - \tfrac{1}{2}\Delta$$
Repeat over all constraints several times per step; pinned particles do not move (give their share to the other particle).
:::

:::calc Relaxing one stretched link
Rest length $L = 1$, particles at $(0,0,0)$ and $(1.2, 0, 0)$: $\lVert\mathbf{d}\rVert = 1.2$, $\Delta = (0.2/1.2)(1.2, 0, 0) = (0.2, 0, 0)$. Each moves 0.1 m towards the other: $(0.1, 0, 0)$ and $(1.1, 0, 0)$, exactly 1 m apart. With many links, satisfying one disturbs its neighbours, which is why several iterations are needed.
:::

```js title="three.js — Verlet cloth core loop"
for (const p of particles) {                      // integrate
  if (p.pinned) continue;
  const vx = (p.x - p.px) * 0.99, vy = (p.y - p.py) * 0.99, vz = (p.z - p.pz) * 0.99;  // 1% damping
  p.px = p.x; p.py = p.y; p.pz = p.z;
  p.x += vx; p.y += vy + GRAVITY * dt * dt; p.z += vz;
}
for (let it = 0; it < 8; it++) for (const c of links) satisfy(c);   // relax constraints
for (let i = 0; i < particles.length; i++) pos.setXYZ(i, particles[i].x, particles[i].y, particles[i].z);
pos.needsUpdate = true; geometry.computeVertexNormals();
```

:::deep GPU simulation
Thousands of particles or cloth vertices move to the GPU: in WebGL with ping-pong float render targets (`GPUComputationRenderer`), in WebGPU with compute shaders writing storage buffers (Chapter 20). The GPU updates every particle in parallel; the CPU never touches the data, and the vertex shader reads positions straight from the buffer or texture.
:::

:::keypoints
- $\mathbf{F} = m\mathbf{a}$, $\boldsymbol{\tau} = \mathbf{r}\times\mathbf{F}$; engines integrate in fixed steps.
- Semi-implicit Euler (velocity first) is stable; explicit Euler gains energy; Verlet suits constraints.
- Impulse $j = (1+e)v_n/(1/m_1 + 1/m_2)$ conserves momentum and applies restitution; friction clamps the tangential impulse to $\mu j$.
- Tunnelling: CCD for fast small objects; iterations and similar masses for stable stacks; sleeping for resting piles.
- Rapier (WASM) is the default web choice; `@react-three/rapier` gives `<Physics>`, `<RigidBody>`, colliders, sensors and events.
- Prefer primitive colliders; trimesh only for static level geometry; kinematic character controllers for players.
:::

:::build Knock-down tower
Problem: Build a tower of 60 boxes and let the player throw balls at it with the mouse, using Rapier.
Requirements:
- Fixed ground, dynamic boxes, CCD on the balls.
- Throw direction from the camera ray, speed from how long the button is held.
- A score that counts boxes knocked below a height.
Constraints: stable stacking at rest (no jitter) and identical results at any frame rate.
Hints: start boxes slightly apart rather than overlapping; let bodies sleep; read positions in the physics step, not from React state.
Relevant APIs: `@react-three/rapier` `Physics`, `RigidBody`, `ccd`, `applyImpulse`, `InstancedRigidBodies`, `Raycaster`.
Expected result: a tower that stands still until hit, then collapses believably, with fast balls never passing through it.
:::

## Interview questions

:::qa Why do physics engines use a fixed time step? {level=mid}
Integration error and constraint behaviour depend on the step size: a variable step changes how bouncy, stiff and stable the simulation is from frame to frame, makes results non-deterministic and can explode after a long frame. A fixed step (often 1/60 s) with an accumulator, plus interpolation of the rendered transforms between the last two states, keeps simulation consistent while rendering at any frame rate.
:::

:::qa What is the difference between explicit and semi-implicit Euler, and which would you use? {level=mid}
Both update position and velocity from the acceleration once per step. Explicit Euler updates position with the **old** velocity; for oscillating systems this injects energy each step, so springs and orbits spiral outwards and eventually explode. Semi-implicit Euler updates velocity first and then position with the **new** velocity; it is symplectic, so energy stays bounded at the same cost. Game and real-time engines use semi-implicit Euler (or Verlet for constraint-heavy systems).
:::

:::qa A fast bullet passes straight through a wall. Why, and how do you fix it? {level=junior}
Discrete collision detection only checks positions at each step. At 100 m/s and 60 Hz the bullet jumps 1.67 m per step, so a thin wall can lie entirely between two samples. Fixes: continuous collision detection (sweep the shape between steps and find the time of impact; `ccd` in Rapier), thicker colliders, a smaller step, or a raycast from the previous to the current position for bullets.
:::

:::qa How would you build a player character with physics? {level=senior}
Use a kinematic capsule rather than a dynamic body, driven by a character controller (Rapier's `KinematicCharacterController`): each step compute the desired movement from input, gravity and jumping, let the controller resolve collisions (slide along walls, climb steps up to a height, limit slope angles, snap to the ground), and apply the corrected translation with `setNextKinematicTranslation`. Interactions with dynamic objects can apply impulses explicitly. This gives responsive, predictable movement that a dynamic body (which tips, bounces and slides) cannot.
:::

:::qa When would you use a trimesh collider, and why not always? {level=mid}
For static, complex level geometry where exact collision matters (terrain-like floors, architectural interiors). Trimesh collisions are expensive, are hollow (no inside), and are unreliable between two moving trimeshes, so dynamic objects should use primitives, compounds of primitives, or convex hulls. Simplified collision geometry is also much cheaper than the render mesh.
:::
