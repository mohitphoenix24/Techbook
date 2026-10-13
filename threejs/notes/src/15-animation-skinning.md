---
title: Animation and Skinning
summary: Keyframes and interpolation, easing curves, three.js's AnimationClip/Mixer/Action system with blending and cross-fades, skeletal animation and the linear blend skinning formula worked by hand, springs and two-bone IK for procedural motion, and R3F's useAnimations.
---

## Kinds of animation

| Kind | What changes | Where it runs | Examples |
|---|---|---|---|
| Procedural | Transforms or uniforms computed from time or input | JavaScript (`useFrame`) or shaders | Spinning logos, bobbing, wind, followers |
| Tweens | A property from A to B over a duration with easing | JavaScript (GSAP, react-spring, `MathUtils.damp`) | UI transitions, camera moves, configurator swaps |
| Keyframe clips | Many properties sampled from keyframes | three.js animation system | Doors, machines, cut-scenes from Blender |
| Skeletal | Bones drive a skinned mesh | Bones on CPU, skinning on GPU | Characters, creatures, robot arms |
| Morph targets | Vertex offsets blended by weights | GPU | Faces, lip sync, muscles |
| Physics | Forces and collisions | Physics engine (Chapter 17) | Falling, ragdolls, vehicles |
| Shader | Vertex or fragment maths over time | GPU | Water, flags, particles, dissolve |

## Keyframes and interpolation

:::def Keyframe track
A list of times and the values a property has at those times. Between keys the value is **interpolated**. In three.js a track names its target property with a path such as `"Arm.quaternion"` or `".material.opacity"`: `VectorKeyframeTrack`, `QuaternionKeyframeTrack` (interpolated with slerp), `NumberKeyframeTrack`, `ColorKeyframeTrack`, `BooleanKeyframeTrack` and `StringKeyframeTrack` (stepped).
:::

| Interpolation | three.js | Behaviour |
|---|---|---|
| Step (discrete) | `InterpolateDiscrete` | Holds a value until the next key |
| Linear | `InterpolateLinear` (default) | Straight lines between keys (slerp for quaternions) |
| Smooth (cubic) | `InterpolateSmooth` | A smooth curve through the keys (Catmull–Rom-like) |
| Cubic spline with tangents | glTF `CUBICSPLINE` | Hermite curve with stored in/out tangents per key |

:::calc Sampling a track
Times $[0, 1, 2]$ s, values $y = [0, 2, 1]$. At $t = 1.25$ s the segment is from key 1 to key 2, $\alpha = (1.25 - 1)/(2 - 1) = 0.25$, so linear interpolation gives $y = 2 + 0.25\,(1 - 2) = 1.75$. With step interpolation it would still be 2.
:::

### Easing

:::def Easing function
A curve $e(t)$ that maps linear progress $t\in[0,1]$ to eased progress, so motion speeds up and slows down instead of starting and stopping abruptly. Objects in the real world have inertia, so eased motion feels physical.
:::

:::formula Common easings
$$\text{easeInQuad}(t) = t^2,\qquad \text{easeOutQuad}(t) = 1 - (1-t)^2,\qquad \text{easeInOutCubic}(t) = \begin{cases}4t^3 & t < 0.5\\ 1 - \frac{(2 - 2t)^3}{2} & t \ge 0.5\end{cases}$$
Apply as $\text{value} = \text{lerp}(a, b, e(t))$ with $t = \text{elapsed}/\text{duration}$ clamped to $[0,1]$.
:::

@fig(easing) Easing curves. The slope is the speed: ease-in starts slowly, ease-out ends slowly, ease-in-out does both. A spring overshoots and settles.

:::calc Ease-in-out cubic at quarters
$e(0.25) = 4\times0.25^3 = 0.0625$; $e(0.5) = 0.5$; $e(0.75) = 1 - 0.5^3/2 = 0.9375$. A quarter of the way through the time, the object has covered only 6% of the distance: a gentle start.
:::

## The three.js animation system

:::def AnimationClip, AnimationMixer, AnimationAction
An **AnimationClip** is a named, reusable set of tracks (for example "Walk"). An **AnimationMixer** plays clips on one object hierarchy (the "root"). An **AnimationAction** is one clip scheduled on a mixer, with its own time, speed (`timeScale`), weight, loop mode and fades. Call `mixer.update(delta)` every frame.
:::

```js title="three.js — playing and blending clips from a glTF"
const gltf = await new GLTFLoader().loadAsync("robot.glb");
scene.add(gltf.scene);
const mixer = new THREE.AnimationMixer(gltf.scene);
const clip = (name) => THREE.AnimationClip.findByName(gltf.animations, name);
const actions = {
  idle: mixer.clipAction(clip("Idle")),
  walk: mixer.clipAction(clip("Walk")),
  wave: mixer.clipAction(clip("Wave")),
};
actions.idle.play();

function switchTo(next, current, duration = 0.3) {
  next.reset().setEffectiveWeight(1).play();
  current.crossFadeTo(next, duration, true);   // true = warp time scales so the gaits stay in step
}
actions.wave.setLoop(THREE.LoopOnce, 1);
actions.wave.clampWhenFinished = true;         // hold the last frame
mixer.addEventListener("finished", (e) => { if (e.action === actions.wave) switchTo(actions.idle, actions.wave); });

renderer.setAnimationLoop((t) => { timer.update(t); mixer.update(timer.getDelta()); renderer.render(scene, camera); });
```

:::calc Weights during a cross-fade
A 0.3 s cross-fade from Idle to Walk. three.js fades weights linearly, so after 0.1 s Idle has weight $1 - 0.1/0.3 = 0.667$ and Walk $0.333$. Each bone's final pose is the weighted blend: positions and scales lerped, rotations combined with weighted quaternion blending. The weights always sum to 1 during a plain cross-fade.
:::

:::def Additive animation
A clip stored as the **difference** from a reference pose (`AnimationUtils.makeClipAdditive(clip)` and `blendMode = AdditiveAnimationBlendMode`). Additive layers are added on top of whatever else plays: a "breathing" or "look-left" layer over any walk, a recoil over any pose.
:::

| Action API | Effect |
|---|---|
| `play()`, `stop()`, `reset()` | Start, stop, rewind |
| `timeScale`, `setDuration(s)` | Speed (negative plays backwards) |
| `setLoop(LoopRepeat / LoopOnce / LoopPingPong, reps)` | Looping |
| `fadeIn(d)`, `fadeOut(d)`, `crossFadeTo(other, d, warp)` | Smooth weight changes |
| `setEffectiveWeight(w)`, `enabled` | Blend weight; disable without stopping |
| `clampWhenFinished` | Freeze on the last frame |
| `AnimationUtils.subclip(clip, name, startFrame, endFrame, fps)` | Cut a long clip into pieces |

## Skeletal animation

:::def Skeleton and bones
A **skeleton** is a hierarchy of **bones** (each an `Object3D`, so they have positions, rotations and parents). A `SkinnedMesh`'s vertices are attached to up to **four** bones each, with **weights** that sum to 1 (`skinIndex` and `skinWeight` attributes). Animating the bones deforms the mesh.
:::

:::def Bind pose and inverse bind matrices
The **bind pose** is the pose in which the mesh was attached to the skeleton (usually a T- or A-pose). For each bone, the **inverse bind matrix** $B_i^{-1}$ moves a vertex from model space into that bone's local space as it was at bind time. The bone's current world matrix $M_i$ then carries the vertex to where the bone is now.
:::

:::formula Linear blend skinning (LBS)
$$\mathbf{v}' = \sum_{i=1}^{4} w_i\; M_i\,B_i^{-1}\,\mathbf{v}, \qquad \sum w_i = 1$$
Each influencing bone moves the vertex rigidly; the results are averaged by weight. three.js computes $M_iB_i^{-1}$ for every bone on the CPU each frame (`skeleton.update()`), uploads them in a bone texture, and the vertex shader does the weighted sum.
:::

@fig(skinning) Linear blend skinning at an elbow. A vertex near the joint is moved by both bones; averaging their positions pulls it inwards, which is why bent elbows and twisted wrists lose volume.

:::calc Skinning a vertex by hand
An elbow joint at $\mathbf{j} = (1, 0, 0)$. Vertex $\mathbf{v} = (1.2, 0, 0)$ with weights 0.5 (upper arm, not moving) and 0.5 (forearm, rotated 90° about Z around the joint).

1. Upper arm: $M_AB_A^{-1} = I$, so it gives $(1.2, 0, 0)$.
2. Forearm: rotate the offset from the joint: $R_z(90°)(0.2, 0, 0) = (0, 0.2, 0)$; add the joint: $(1, 0.2, 0)$.
3. Blend: $0.5\,(1.2, 0, 0) + 0.5\,(1, 0.2, 0) = (1.1, 0.1, 0)$.
4. Its distance from the joint is $\sqrt{0.1^2 + 0.1^2} = 0.141$ instead of 0.2: the skin has shrunk by 30% at the bend. Twisting 180° makes it collapse to the joint entirely (the "candy wrapper" artefact). Fixes: more bones and weight painting, corrective blend shapes, or dual-quaternion skinning (not built into three.js).
:::

:::warn Cloning skinned meshes
`model.clone()` copies the meshes but the clones still point at the **original** skeleton's bones, so every copy moves with the first one. Use `SkeletonUtils.clone(model)` from `three/addons/utils/SkeletonUtils.js`, which rebuilds bone references; drei's `useGLTF` + `<Clone>` or `useMemo(() => SkeletonUtils.clone(scene), [scene])` do the same in R3F. Each clone also needs its own `AnimationMixer`.
:::

:::tip Crowds
`InstancedMesh` cannot skin per instance. Dozens of characters: separate `SkinnedMesh` clones (share geometry and materials). Hundreds or thousands: bake the animation into a texture (a **vertex animation texture**, VAT) and play it in a custom instanced vertex shader, or use the `InstancedMesh` + morph texture approach; add LOD and update far characters' mixers less often.
:::

## Procedural animation

### Springs

:::formula Damped spring
$$\ddot{x} = -k\,(x - x_{\text{target}}) - c\,\dot{x}$$
$k$ is stiffness, $c$ damping (unit mass). Critical damping $c = 2\sqrt{k}$ reaches the target as fast as possible without overshoot; less damping overshoots and wobbles. Integrate with **semi-implicit Euler**: update velocity first, then position with the new velocity (much more stable than explicit Euler).
:::

:::calc Three spring steps
$k = 100$, critical $c = 2\sqrt{100} = 20$, $\Delta t = 1/60$, starting at $x = 1$, $v = 0$, target 0.

1. $a = -100(1) - 20(0) = -100$; $v = -1.667$; $x = 1 - 1.667/60 = 0.972$.
2. $a = -97.2 + 33.3 = -63.9$; $v = -2.732$; $x = 0.927$.
3. $v = -3.366$; $x = 0.871$, smoothly accelerating towards 0 and then settling without overshoot.
:::

```js title="three.js — a springy follower (semi-implicit Euler)"
const k = 120, c = 2 * Math.sqrt(k) * 0.6;       // 0.6 × critical: a little overshoot feels lively
const vel = new THREE.Vector3(), acc = new THREE.Vector3();
function updateSpring(obj, target, dt) {
  acc.subVectors(target, obj.position).multiplyScalar(k).addScaledVector(vel, -c);
  vel.addScaledVector(acc, dt);
  obj.position.addScaledVector(vel, dt);
}
```

### Inverse kinematics

:::def Inverse kinematics (IK)
Forward kinematics computes where a hand ends up from joint angles. **Inverse** kinematics finds joint angles that put the hand (the end effector) on a target: feet on uneven ground, a hand on a door handle, a robot gripper on a part. Two-bone chains have an exact answer from the law of cosines; longer chains use iterative solvers such as CCD or FABRIK (three.js ships `CCDIKSolver`).
:::

:::formula Two-bone IK (law of cosines)
Upper bone length $a$, lower bone length $b$, distance from shoulder to target $d$ (clamped to $|a - b| \le d \le a + b$):
$$\cos\theta_{\text{elbow}} = \frac{a^2 + b^2 - d^2}{2ab},\qquad \cos\theta_{\text{shoulder}} = \frac{a^2 + d^2 - b^2}{2ad}$$
$\theta_{\text{elbow}}$ is the interior angle at the elbow; $\theta_{\text{shoulder}}$ is how far the upper bone turns away from the line to the target. A pole vector chooses which way the elbow bends.
:::

@fig(two_bone_ik) Two-bone IK. The triangle formed by the two bones and the shoulder–target line has known side lengths, so its angles follow from the law of cosines.

:::calc Reaching for a cup
Upper arm $a = 0.30$ m, forearm $b = 0.25$ m, target $d = 0.40$ m away.

- $\cos\theta_{\text{elbow}} = (0.09 + 0.0625 - 0.16)/(2\times0.3\times0.25) = -0.0075/0.15 = -0.05$, so $\theta_{\text{elbow}} = 92.9°$.
- $\cos\theta_{\text{shoulder}} = (0.09 + 0.16 - 0.0625)/(2\times0.3\times0.4) = 0.78125$, so the upper arm points $38.6°$ off the shoulder–cup line, towards the pole.
:::

## Animation in React Three Fiber

```jsx title="R3F — drei useAnimations"
import { useGLTF, useAnimations } from "@react-three/drei";

function Robot({ action = "Idle" }) {
  const group = useRef();
  const { scene, animations } = useGLTF("/robot.glb");
  const { actions } = useAnimations(animations, group);   // creates and updates the mixer for you
  useEffect(() => {
    const a = actions[action];
    a.reset().fadeIn(0.3).play();
    return () => a.fadeOut(0.3);                         // cross-fade when `action` changes
  }, [action, actions]);
  return <primitive ref={group} object={scene} />;
}
```

```jsx title="R3F — springs with @react-spring/three"
import { useSpring, animated } from "@react-spring/three";
function Card({ open }) {
  const { rotation } = useSpring({ rotation: open ? [0, Math.PI, 0] : [0, 0, 0], config: { tension: 170, friction: 26 } });
  return <animated.mesh rotation={rotation}><boxGeometry args={[1, 1.4, 0.02]} /><meshStandardMaterial /></animated.mesh>;
}
```

:::tip Which tool for which job
`useFrame` + damping for continuous follow behaviour; react-spring or `maath` easing for state-driven UI motion (open/closed, hover); GSAP timelines for choreographed sequences and scroll-driven stories; three.js clips for anything authored in Blender; shaders for thousands of moving things.
:::

:::keypoints
- Tracks store (time, value) keys; quaternion tracks slerp; glTF clips map to `AnimationClip`s.
- Easing maps linear time to eased progress: $4t^3$ / $1 - (2-2t)^3/2$ for ease-in-out cubic.
- Mixer per character, `clipAction` per clip, `crossFadeTo` with warp for gait changes, `mixer.update(dt)` every frame.
- LBS: $\mathbf{v}' = \sum w_i M_iB_i^{-1}\mathbf{v}$; blending rotations linearly loses volume at bends.
- Clone skinned models with `SkeletonUtils.clone`; crowds need VATs or similar.
- Springs: semi-implicit Euler, critical damping $c = 2\sqrt{k}$.
- Two-bone IK solves with the law of cosines; longer chains with CCD/FABRIK.
:::

## Interview questions

:::qa How do you play and blend animations from a glTF in three.js? {level=junior}
Create an `AnimationMixer` on the loaded scene, get an `AnimationAction` per clip with `mixer.clipAction(clip)` (find clips with `AnimationClip.findByName(gltf.animations, "Walk")`), call `play()`, and update the mixer every frame with the delta time. Blend with `fadeIn`/`fadeOut` or `crossFadeTo(next, duration, true)`, adjust `timeScale` for speed, and use `setLoop(LoopOnce)` plus `clampWhenFinished` for one-shot actions. In R3F, drei's `useAnimations` creates and updates the mixer for you.
:::

:::qa Explain linear blend skinning and its main artefact. {level=senior}
Each vertex is influenced by up to four bones with weights summing to one. For each bone, the inverse bind matrix takes the vertex from the bind pose into the bone's local space, and the bone's current matrix takes it to the animated position; the final position is the weighted sum of these rigidly transformed positions. Averaging positions (equivalently, linearly blending rotation matrices) does not preserve length, so at strongly bent or twisted joints vertices are pulled towards the joint: the elbow-collapse and "candy wrapper" artefacts. Remedies are better weights and extra twist bones, corrective morph targets, or dual-quaternion skinning.
:::

:::qa I cloned a character five times and they all play the same animation in sync, in the same place. Why? {level=mid}
`Object3D.clone()` does not remap a `SkinnedMesh`'s skeleton: all clones still reference the original bones, so they all deform with the first character. Use `SkeletonUtils.clone()`, which clones the bone hierarchy and rebinds each skinned mesh to its own bones, and create one `AnimationMixer` per clone. Geometry and materials can still be shared.
:::

:::qa How would you make a camera smoothly follow a target with a little bounce? {level=mid}
Use a damped spring on the camera position (and possibly its look-at target): acceleration $= k(\text{target} - x) - c\,v$, integrated with semi-implicit Euler using the frame delta, with $c$ somewhat below the critical value $2\sqrt{k}$ for a slight overshoot. Clamp large deltas after tab switches. For no bounce, exponential damping (`MathUtils.damp`, maath `easing.damp3`) is simpler and frame-rate independent.
:::

:::qa How do you place a character's feet correctly on uneven ground? {level=senior}
Foot IK: each frame, raycast down from each foot's animated position to find the ground height and normal; move the foot target to the hit point (plus ankle height) and align the foot to the normal; solve two-bone IK (hip–knee–ankle) with the law of cosines and a pole vector in front of the knee; lower the pelvis by the larger foot offset so the legs can reach; blend the IK weight with the animation's foot contact curve so feet only stick when planted.
:::
