---
title: Physics with Rapier
level: advanced
time: 45
summary: Rigid bodies, colliders, gravity, mass, friction and bounciness with @react-three/rapier; pushing things with impulses and forces; collision events and sensors (goals, triggers, pickups); kinematic bodies you move yourself; joints for chains, doors and machines; and thousands of bodies with instancing.
---

Stacking crates, a ball rolling down a ramp, a car with suspension, a robot gripper picking up a box, a pinball flipper: hand-written physics (Module 1's bouncing ball) breaks down quickly once objects collide with each other. A **physics engine** simulates it properly. In the R3F world the standard is **Rapier**, a fast engine written in Rust and compiled to WebAssembly, wrapped as React components by `@react-three/rapier`.

:::def Rigid body
An object the physics engine moves: it has mass, velocity and rotation, and it doesn't deform. Types: **dynamic** (moved by forces and collisions), **fixed** (never moves: floors, walls), **kinematic** (moved by your code, pushes dynamic bodies but isn't pushed back: platforms, doors, robot arms).
:::

:::def Collider
The simplified shape the engine uses for collisions: a box, sphere, capsule, cylinder, **convex hull** (a shrink-wrap around the mesh) or **trimesh** (the exact triangles, for static level geometry). Simple colliders are much faster than the visual mesh.
:::

## Your first physics world

`<Physics>` creates the world (it loads WebAssembly, so it needs `<Suspense>`). Wrap meshes in `<RigidBody>` and colliders are generated automatically:

```jsx run title="Drop, stack and knock things over" level=intermediate height=440
import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import { OrbitControls } from "@react-three/drei";

function Crate({ position, color }) {
  return (
    <RigidBody position={position} colliders="cuboid" restitution={0.2} friction={0.8}>
      <mesh castShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  );
}

export default function App() {
  const [balls, setBalls] = useState([]);
  const [debug, setDebug] = useState(false);
  const throwBall = () => setBalls((b) => [...b, Date.now()]);
  return (
    <>
      <div className="overlay">
        <button className="primary" onClick={throwBall}>Throw ball</button>
        <label><input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> show colliders</label>
      </div>
      <Canvas shadows="percentage" camera={{ position: [6, 5, 9], fov: 45 }}>
        <color attach="background" args={["#e0f2fe"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={2} castShadow shadow-mapSize={[2048, 2048]} />
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]} debug={debug}>
            {/* a pyramid of crates */}
            {[0, 1, 2, 3].flatMap((row) => Array.from({ length: 4 - row }, (_, i) => (
              <Crate key={`${row}-${i}`} position={[(i - (3 - row) / 2) * 0.86, 0.4 + row * 0.81, 0]} color={`hsl(${30 + row * 25}, 70%, 55%)`} />
            )))}
            {/* each thrown ball starts on the left with a velocity towards the pyramid */}
            {balls.map((id) => (
              <RigidBody key={id} position={[-6, 1.5, 0]} colliders="ball" linearVelocity={[14, 2, (Math.random() - 0.5) * 2]} mass={4} restitution={0.4}>
                <mesh castShadow><sphereGeometry args={[0.35, 32, 16]} /><meshStandardMaterial color="#ef4444" /></mesh>
              </RigidBody>
            ))}
            {/* the floor: fixed, with an explicit thin box collider */}
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider args={[12, 0.1, 12]} position={[0, -0.1, 0]} />
              <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[24, 24]} /><meshStandardMaterial color="#cbd5e1" /></mesh>
            </RigidBody>
          </Physics>
        </Suspense>
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>
    </>
  );
}
```

| `<RigidBody>` prop | Meaning |
|---|---|
| `type` | `"dynamic"` (default), `"fixed"`, `"kinematicPosition"`, `"kinematicVelocity"` |
| `colliders` | auto collider shape: `"cuboid"`, `"ball"`, `"hull"`, `"trimesh"`, or `false` to add your own |
| `mass` / `density` | how heavy (mass) or how heavy per volume (density) |
| `restitution` | bounciness, 0 (dead) to 1 (perfect bounce) |
| `friction` | 0 (ice) to 1+ (rubber) |
| `linearDamping` / `angularDamping` | air resistance, slows movement / spinning |
| `linearVelocity` / `angularVelocity` | initial velocities |
| `gravityScale` | 0 = floats, 2 = falls twice as fast |
| `lockRotations`, `enabledRotations={[false, true, false]}` | keep characters upright |
| `ccd` | continuous collision detection: fast objects can't tunnel through thin walls |

:::tip Units matter
Rapier assumes metres, kilograms and seconds, with gravity −9.81. A 100-unit-tall crate falls in slow motion because it's a 100 m crate. Keep the 1 unit = 1 m convention from Module 1 and physics just feels right.
:::

## Pushing things: impulses, forces and velocity

A ref on a `<RigidBody>` gives you Rapier's body API:

| Method | Effect | Typical use |
|---|---|---|
| `applyImpulse({x,y,z}, true)` | instant kick | jumping, explosions, shooting, hitting |
| `addForce(v, true)` / `resetForces()` | continuous push (until reset) | thrusters, wind, magnets |
| `applyTorqueImpulse(v, true)` | instant spin | spinning tops, wheels |
| `setLinvel(v, true)` / `setAngvel(v, true)` | set velocity directly | precise character movement |
| `setTranslation(v, true)` / `setRotation(q, true)` | teleport | respawn, reset |
| `translation()` / `rotation()` / `linvel()` | read state | follow cameras, HUDs |

The second argument (`true`) wakes the body up: resting bodies "sleep" to save CPU and ignore changes unless woken.

## Collision events and sensors

Bodies report collisions through `onCollisionEnter` / `onCollisionExit`, and a collider with `sensor` detects overlap **without** physically blocking anything, which is how goals, checkpoints, pickups and trigger zones work:

```jsx run title="A mini game: impulses, collisions and a goal sensor" level=advanced height=440
import { Suspense, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";

function Ball({ api, resetKey }) {
  return (
    <RigidBody key={resetKey} ref={api} position={[0, 0.4, 3]} colliders="ball" restitution={0.6} ccd
      onCollisionEnter={({ other }) => other.rigidBodyObject?.name === "wall" && console.log("thud!")}>
      <mesh><sphereGeometry args={[0.3, 32, 16]} /><meshStandardMaterial color="#f97316" /></mesh>
    </RigidBody>
  );
}

export default function App() {
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const ball = useRef();                         // the ball's Rapier body, used by the HTML button
  const kick = () => ball.current?.applyImpulse({ x: (Math.random() - 0.5) * 0.6, y: 2.2, z: -3.2 }, true);
  return (
    <>
      {/* HTML lives OUTSIDE the Canvas; it reaches the physics body through a ref */}
      <div className="overlay"><b>Goals: {score}</b><div className="row"><button className="primary" onClick={kick}>Kick</button><button onClick={() => setRound((r) => r + 1)}>Reset ball</button></div></div>
      <Canvas camera={{ position: [0, 3, 8], fov: 45 }}>
        <color attach="background" args={["#14532d"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 8, 5]} intensity={2} />
        <Suspense fallback={null}>
          <Physics>
            <Ball api={ball} resetKey={round} />
            {/* pitch */}
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider args={[5, 0.1, 8]} position={[0, -0.1, 0]} />
              <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[10, 16]} /><meshStandardMaterial color="#16a34a" /></mesh>
            </RigidBody>
            {/* goal frame */}
            <RigidBody type="fixed" name="wall" position={[0, 0, -5]}>
              <mesh position={[-1.5, 0.8, 0]}><boxGeometry args={[0.15, 1.6, 0.15]} /><meshStandardMaterial color="white" /></mesh>
              <mesh position={[1.5, 0.8, 0]}><boxGeometry args={[0.15, 1.6, 0.15]} /><meshStandardMaterial color="white" /></mesh>
              <mesh position={[0, 1.6, 0]}><boxGeometry args={[3.15, 0.15, 0.15]} /><meshStandardMaterial color="white" /></mesh>
              <mesh position={[0, 0.8, -1]}><boxGeometry args={[3, 1.6, 0.05]} /><meshStandardMaterial color="#e5e7eb" transparent opacity={0.5} /></mesh>
            </RigidBody>
            {/* the sensor: an invisible box inside the goal that only REPORTS overlaps */}
            <CuboidCollider sensor args={[1.4, 0.75, 0.45]} position={[0, 0.8, -5.5]}
              onIntersectionEnter={() => { setScore((s) => s + 1); setTimeout(() => setRound((r) => r + 1), 800); }} />
          </Physics>
        </Suspense>
      </Canvas>
    </>
  );
}
```

`other.rigidBodyObject` is the three.js object of the body you hit, so you can check its `name` or `userData` to decide what happened (hit a wall, an enemy, a pickup).

## Kinematic bodies: things you move yourself

Moving platforms, sliding doors, conveyor belts, and **robot arms driven by joint angles** are not pushed around by physics; your code moves them, and they push dynamic objects. That's a **kinematic** body:

```jsx run title="A kinematic paddle pushing dynamic boxes" level=advanced
import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";

function Sweeper() {
  const body = useRef();
  const q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
  useFrame(({ clock }) => {
    q.setFromAxisAngle(axis, clock.elapsedTime * 1.2);
    body.current.setNextKinematicRotation(q);            // physics interpolates and pushes things in the way
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders="cuboid">
      <mesh position={[1.8, 0.3, 0]}><boxGeometry args={[3.6, 0.4, 0.25]} /><meshStandardMaterial color="#f43f5e" /></mesh>
    </RigidBody>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 8, 8], fov: 45 }}>
      <color attach="background" args={["#0f172a"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 8, 5]} intensity={2} />
      <Suspense fallback={null}>
        <Physics>
          <Sweeper />
          {Array.from({ length: 40 }, (_, i) => (
            <RigidBody key={i} position={[(Math.random() - 0.5) * 6, 0.5 + i * 0.3, (Math.random() - 0.5) * 6]} colliders="cuboid">
              <mesh><boxGeometry args={[0.4, 0.4, 0.4]} /><meshStandardMaterial color={`hsl(${i * 9}, 70%, 60%)`} /></mesh>
            </RigidBody>
          ))}
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[4, 0.1, 4]} position={[0, -0.1, 0]} />
            {[[0, 4.1], [0, -4.1], [4.1, 0], [-4.1, 0]].map(([x, z], i) => (
              <CuboidCollider key={i} args={[x ? 0.1 : 4, 0.6, z ? 0.1 : 4]} position={[x, 0.5, z]} />
            ))}
            <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[8.2, 8.2]} /><meshStandardMaterial color="#334155" /></mesh>
          </RigidBody>
        </Physics>
      </Suspense>
    </Canvas>
  );
}
```

`setNextKinematicTranslation` / `setNextKinematicRotation` tell Rapier where the body will be next step, so it computes the velocity and pushes dynamic objects realistically, instead of teleporting through them.

## Joints

Joints connect two bodies and restrict how they move relative to each other:

| Joint hook | Allows | Real-world example |
|---|---|---|
| `useFixedJoint` | nothing (glued) | breakable structures |
| `useSphericalJoint` | rotation in all directions (ball-and-socket) | chains, ropes, ragdolls, pendulums |
| `useRevoluteJoint` | rotation around one axis (hinge), with optional **motor** | doors, wheels, robot joints, flippers |
| `usePrismaticJoint` | sliding along one axis | pistons, drawers, linear actuators |
| `useRopeJoint` | at most a maximum distance | cables, tethers |
| `useSpringJoint` | spring-like pull | suspension, soft connections |

```jsx run title="A chain of spherical joints (grab-free pendulum)" level=advanced
import { Suspense, createRef, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics, RigidBody, useSphericalJoint } from "@react-three/rapier";

const LINKS = 10, LEN = 0.3;

function Joint({ a, b }) {
  // connect the bottom of link a to the top of link b
  useSphericalJoint(a, b, [[0, -LEN / 2, 0], [0, LEN / 2, 0]]);
  return null;
}

export default function App() {
  const refs = useMemo(() => Array.from({ length: LINKS + 1 }, () => createRef()), []);
  return (
    <Canvas camera={{ position: [0, 0.6, 5] }}>
      <color attach="background" args={["#1e1b4b"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={2} />
      <Suspense fallback={null}>
        <Physics>
          <RigidBody ref={refs[0]} type="fixed" position={[0, 2.2, 0]}>
            <mesh><sphereGeometry args={[0.12]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
          </RigidBody>
          {Array.from({ length: LINKS }, (_, i) => (
            <RigidBody key={i} ref={refs[i + 1]} position={[0, 2.2 - LEN / 2 - i * LEN, 0]} colliders="cuboid" linearDamping={0.2}
              linearVelocity={i === LINKS - 1 ? [6, 0, 2] : [0, 0, 0]}>   {/* start hanging, give the end a push */}
              <mesh><boxGeometry args={[0.18, LEN, 0.18]} /><meshStandardMaterial color={i === LINKS - 1 ? "#f472b6" : "#a5b4fc"} /></mesh>
            </RigidBody>
          ))}
          {Array.from({ length: LINKS }, (_, i) => <Joint key={i} a={refs[i]} b={refs[i + 1]} />)}
        </Physics>
      </Suspense>
    </Canvas>
  );
}
```

The chain starts hanging straight down (a pose that already satisfies every joint, so nothing snaps), and the last link gets a push; every link then swings constrained to its neighbours. Starting bodies in a pose that violates their joints makes the solver yank them together violently on the first step. Revolute joints with motors (`joint.current.configureMotorVelocity(speed, damping)` or `configureMotorPosition(angle, stiffness, damping)`) are how you simulate actuated machines such as a robot arm in a physics-based digital twin.

## Thousands of bodies

`<InstancedRigidBodies>` attaches a rigid body to every instance of one `instancedMesh`: hundreds of falling coins, marbles or packages in one draw call. Rapier itself handles thousands of simple bodies at 60 fps on a laptop; for more, reduce collider complexity and let resting bodies sleep.

## Beyond rigid bodies

| Need | Options |
|---|---|
| character controllers (walk, jump, slopes, stairs) | Rapier's `KinematicCharacterController` (exposed via `useRapier`), or the **ecctrl** library |
| vehicles | Rapier's `DynamicRayCastVehicleController`, or revolute-joint wheels with motors |
| cloth, ropes, soft bodies | Verlet/position-based dynamics on the GPU (three.js WebGPU cloth example), or chains of joints |
| fluids | GPU particle simulations (SPH/MPM with WebGPU compute) |
| robotics-grade simulation | physics engines like MuJoCo compiled to WebAssembly, with three.js for rendering |

## Check yourself

```quiz
? Which rigid body type is moved only by your code but still pushes dynamic bodies?
+ Kinematic
- Fixed
- Dynamic
> Use setNextKinematicTranslation/Rotation each frame.

? Why give a fast ball `ccd`?
+ Continuous collision detection stops it tunnelling through thin walls between steps
- It makes it bouncier
- It reduces CPU cost
> Fast objects can skip past thin colliders otherwise.

? How do you detect a ball entering a goal without the goal stopping the ball?
+ A collider with `sensor` and onIntersectionEnter
- onCollisionEnter on the floor
- A raycast every frame
> Sensors report overlaps without generating contacts.

? What does applyImpulse do compared to addForce?
+ applyImpulse is an instant kick; addForce pushes continuously until reset
- They're identical
- addForce only works on kinematic bodies
> Impulse = jump; force = thruster.

? Which joint models a door hinge or a robot joint?
+ Revolute
- Spherical
- Prismatic
> One rotational axis, optionally with a motor.
```

:::exercise Wrecking ball
Hang a heavy ball (`mass={20}`) from a fixed point with a `useRopeJoint` (or a short chain), pull it to the side by giving it an initial `linearVelocity`, and let it smash a wall of crates.
:::

:::solution
```jsx run
import { Suspense, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider, useRopeJoint } from "@react-three/rapier";

function Rope({ a, b }) {
  useRopeJoint(a, b, [[0, 0, 0], [0, 0, 0], 4]);          // anchor A, anchor B, max length
  return null;
}

export default function App() {
  const anchor = useRef(), ball = useRef();
  return (
    <Canvas camera={{ position: [0, 4, 11] }}>
      <color attach="background" args={["#fef3c7"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 8, 6]} intensity={2} />
      <Suspense fallback={null}>
        <Physics>
          <RigidBody ref={anchor} type="fixed" position={[0, 6, 0]}><mesh><sphereGeometry args={[0.1]} /><meshBasicMaterial color="black" /></mesh></RigidBody>
          <RigidBody ref={ball} position={[-4, 6, 0]} colliders="ball" mass={20} linearVelocity={[0, -2, 0]}>
            <mesh><sphereGeometry args={[0.6, 32, 16]} /><meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.3} /></mesh>
          </RigidBody>
          <Rope a={anchor} b={ball} />
          {Array.from({ length: 30 }, (_, i) => (
            <RigidBody key={i} position={[0.4 + (i % 6) * 0.62, 0.3 + Math.floor(i / 6) * 0.61, 0]} colliders="cuboid">   {/* 6 × 5 wall in the swing's path */}
              <mesh><boxGeometry args={[0.6, 0.6, 0.6]} /><meshStandardMaterial color={`hsl(${20 + i * 4}, 80%, 55%)`} /></mesh>
            </RigidBody>
          ))}
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[10, 0.1, 10]} position={[0, -0.1, 0]} />
            <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[20, 20]} /><meshStandardMaterial color="#d6d3d1" /></mesh>
          </RigidBody>
        </Physics>
      </Suspense>
    </Canvas>
  );
}
```
:::

:::keypoints
- `<Physics>` (inside `<Suspense>`) + `<RigidBody>` with auto `colliders`: dynamic, fixed and kinematic bodies.
- Tune `mass`, `restitution`, `friction`, damping; use `ccd` for fast objects; keep units in metres.
- Move things with `applyImpulse`, `addForce`, `setLinvel`; react with `onCollisionEnter`; detect zones with `sensor` colliders.
- Kinematic bodies (`setNextKinematic*`) for platforms, doors and robot arms; joints for chains, hinges, pistons and motors.
- `InstancedRigidBodies` for many bodies; character and vehicle controllers for games.
:::
