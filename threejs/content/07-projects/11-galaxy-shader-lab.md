---
title: Galaxy Generator & Shader Lab
level: intermediate
time: 55
icon: sparkles
cover: #7c3aed,#f97316
tags: procedural generation, Points, ShaderMaterial, GLSL, vertex animation, fbm noise, additive blending, bloom, leva
summary: A generative spiral galaxy with hundreds of thousands of stars. Arms, spin, scatter and colours come from a handful of parameters, the GPU animates differential rotation in a custom vertex shader, a noise-based nebula shader fills the sky, and bloom makes it glow. Every value is live-tweakable, and you can randomise to discover new galaxies.
---

Generative art is where many creative developers start: a few parameters, a bit of maths, and an endless variety of results. This project builds the well-loved "galaxy generator" and turns it into a small **shader lab**: positions are generated on the CPU, but motion, sizing, glow and the background nebula all run in **GLSL** on the GPU.

:::flow How it fits together
Parameters | count, radius, branches, spin, randomness, power, colours
Generate | for each star: radius → branch angle + spin × radius → scatter (biased to the arm centre) → colour by radius
GPU motion | vertex shader rotates each star by time ÷ radius: inner stars orbit faster
Look | soft round points, additive blending, a fbm-noise nebula sphere, bloom
Explore | leva controls rebuild or re-tune live; Randomise picks a new galaxy
:::

## Step 1: The galaxy formula

Each star picks a **radius**, the **arm** it belongs to, and is bent along the arm by `spin × radius`. Random offsets raised to a **power** keep most stars near the arm's centre line, with a few outliers:

```js run title="Step 1 · Generating a spiral galaxy on the CPU" height=420
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(3, 3, 4);
new OrbitControls(camera, renderer.domElement);

const P = { count: 60000, radius: 5, branches: 4, spin: 1, randomness: 0.25, power: 3, inside: "#ff8a3d", outside: "#3b5bdb" };
const pos = new Float32Array(P.count * 3), col = new Float32Array(P.count * 3);
const inside = new THREE.Color(P.inside), outside = new THREE.Color(P.outside), c = new THREE.Color();
for (let i = 0; i < P.count; i++) {
  const r = Math.random() * P.radius;
  const branch = ((i % P.branches) / P.branches) * Math.PI * 2;     // which arm
  const spin = r * P.spin;                                           // arms curl more further out
  // random offset, raised to a power: mostly tiny, occasionally large (sign kept)
  const rnd = () => Math.pow(Math.random(), P.power) * (Math.random() < 0.5 ? 1 : -1) * P.randomness * r;
  pos[i * 3] = Math.cos(branch + spin) * r + rnd();
  pos[i * 3 + 1] = rnd() * 0.5;                                      // flatter in y
  pos[i * 3 + 2] = Math.sin(branch + spin) * r + rnd();
  c.copy(inside).lerp(outside, r / P.radius).toArray(col, i * 3);
}
const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
const galaxy = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.02, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(galaxy);

renderer.setAnimationLoop((t) => { galaxy.rotation.y = t * 0.0001; renderer.render(scene, camera); });
```

Rotating the whole object spins the galaxy like a rigid disc. Real galaxies rotate **differentially**: inner stars complete an orbit faster than outer ones. That's a per-star effect, ideal for a vertex shader.

## Step 2: The shader lab

Open the panel on the right to tweak everything; **Randomise** generates a new galaxy.

```jsx run title="Galaxy Generator & Shader Lab · complete app" level=intermediate height=600
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useControls, folder, button } from "leva";

// ---------- shaders ----------
const galaxyVertex = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uSpeed;
  attribute float aScale;
  attribute vec3 aRandom;
  varying vec3 vColor;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // differential rotation: angular speed falls off with distance from the centre
    float dist = length(world.xz);
    float angle = atan(world.z, world.x) + uTime * uSpeed / (dist + 0.4);
    world.x = cos(angle) * dist;
    world.z = sin(angle) * dist;
    world.xyz += aRandom;                       // scatter is applied after rotation so arms stay crisp
    vec4 view = viewMatrix * world;
    gl_Position = projectionMatrix * view;
    gl_PointSize = uSize * aScale / -view.z;    // perspective size attenuation
    vColor = color;
  }`;
const galaxyFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    // soft round sprite: bright core, fast falloff
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float glow = pow(clamp(1.0 - d, 0.0, 1.0), 5.0);
    gl_FragColor = vec4(vColor * glow, 1.0);
    #include <colorspace_fragment>
  }`;

const nebulaVertex = /* glsl */ `
  varying vec3 vDir;
  void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const nebulaFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec3 vDir;
  // cheap 3D value noise + fractal Brownian motion (sum of octaves)
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    vec3 p = vDir * 2.5 + vec3(0.0, uTime * 0.01, 0.0);
    float n = fbm(p + fbm(p * 1.7));                       // domain warping: noise of noise, for wispy shapes
    vec3 col = mix(uColorA, uColorB, smoothstep(0.35, 0.75, n)) * smoothstep(0.3, 0.8, n) * uIntensity;
    float stars = step(0.9985, hash(floor(vDir * 600.0)));  // a sprinkle of distant stars
    gl_FragColor = vec4(col + stars * 0.8, 1.0);
    #include <colorspace_fragment>
  }`;

// ---------- the galaxy ----------
function Galaxy({ p, motion }) {
  const mat = useRef();
  const dpr = useThree((s) => s.viewport.dpr);
  const geo = useMemo(() => {                    // rebuild only when a shape parameter changes
    const n = p.count, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), scale = new Float32Array(n), rand = new Float32Array(n * 3);
    const inside = new THREE.Color(p.inside), outside = new THREE.Color(p.outside), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const r = Math.pow(Math.random(), 1.4) * p.radius;               // denser towards the core
      const branch = ((i % p.branches) / p.branches) * Math.PI * 2;
      pos[i * 3] = Math.cos(branch + r * p.spin) * r;
      pos[i * 3 + 2] = Math.sin(branch + r * p.spin) * r;
      const rnd = () => Math.pow(Math.random(), p.power) * (Math.random() < 0.5 ? 1 : -1) * p.randomness * (r + 0.3);
      rand.set([rnd(), rnd() * 0.4, rnd()], i * 3);
      c.copy(inside).lerp(outside, r / p.radius).toArray(col, i * 3);
      scale[i] = 0.4 + Math.random() * Math.random() * 1.6;            // mostly small, a few bright giants
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));
    g.setAttribute("aRandom", new THREE.BufferAttribute(rand, 3));
    return g;
  }, [p.count, p.radius, p.branches, p.spin, p.randomness, p.power, p.inside, p.outside]);

  useFrame((_, dt) => {                          // R3F copies `uniforms`, so update the material's own objects
    const u = mat.current.uniforms;
    u.uTime.value += dt;
    u.uSize.value = motion.size * dpr;
    u.uSpeed.value = motion.speed;
  });

  return (
    <points geometry={geo}>
      <shaderMaterial ref={mat} vertexShader={galaxyVertex} fragmentShader={galaxyFragment} vertexColors
        transparent depthWrite={false} blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 }, uSize: { value: 30 }, uSpeed: { value: 0.2 } }} />
    </points>
  );
}

function Nebula({ n }) {
  const mat = useRef();
  useFrame((_, dt) => {
    const u = mat.current.uniforms;
    u.uTime.value += dt;
    u.uIntensity.value = n.intensity;
    u.uColorA.value.set(n.colorA);
    u.uColorB.value.set(n.colorB);
  });
  return (
    <mesh scale={60}>
      <sphereGeometry args={[1, 48, 24]} />
      <shaderMaterial ref={mat} side={THREE.BackSide} depthWrite={false} vertexShader={nebulaVertex} fragmentShader={nebulaFragment}
        uniforms={{ uTime: { value: 0 }, uIntensity: { value: 0.5 }, uColorA: { value: new THREE.Color() }, uColorB: { value: new THREE.Color() } }} />
    </mesh>
  );
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const PALETTE = ["#ff8a3d", "#ffd166", "#ef476f", "#f72585", "#ffffff", "#90e0ef", "#3b5bdb", "#7209b7", "#06d6a0", "#4361ee"];

export default function App() {
  const [shape, setShape] = useControls(() => ({
    Galaxy: folder({
      count: { value: 120000, min: 5000, max: 400000, step: 5000 },
      radius: { value: 5, min: 1, max: 10, step: 0.1 },
      branches: { value: 4, min: 1, max: 10, step: 1 },
      spin: { value: 1, min: -3, max: 3, step: 0.01 },
      randomness: { value: 0.22, min: 0, max: 1, step: 0.01 },
      power: { value: 3, min: 1, max: 8, step: 0.1 },
      inside: "#ff8a3d",
      outside: "#3b5bdb",
    }),
  }));
  const motion = useControls("Motion", { speed: { value: 0.25, min: 0, max: 2, step: 0.01 }, size: { value: 28, min: 5, max: 80, step: 1 } });
  const nebula = useControls("Nebula", { intensity: { value: 0.45, min: 0, max: 1.5, step: 0.01 }, colorA: "#1d1b4b", colorB: "#7c3aed" }, { collapsed: true });
  const bloom = useControls("Bloom", { strength: { value: 0.9, min: 0, max: 3, step: 0.05 }, threshold: { value: 0.15, min: 0, max: 1, step: 0.01 } }, { collapsed: true });
  useControls({
    Randomise: button(() => setShape({
      branches: 2 + Math.floor(Math.random() * 6), spin: +(Math.random() * 4 - 2).toFixed(2),
      randomness: +(0.1 + Math.random() * 0.5).toFixed(2), power: +(2 + Math.random() * 3).toFixed(1),
      inside: pick(PALETTE), outside: pick(PALETTE),
    })),
  });

  return (
    <Canvas camera={{ position: [4, 4.5, 6], fov: 55 }} dpr={[1, 2]}>
      <Nebula n={nebula} />
      <Galaxy p={shape} motion={motion} />
      <OrbitControls enableDamping autoRotate autoRotateSpeed={0.3} maxDistance={25} />
      <EffectComposer>
        <Bloom mipmapBlur intensity={bloom.strength} luminanceThreshold={bloom.threshold} />
      </EffectComposer>
    </Canvas>
  );
}
```

## How it works

| Feature | Technique |
|---|---|
| generation | CPU loop filling typed arrays: base position on the arm, a separate **random offset** attribute, colour by radius, per-star size; `useMemo` rebuilds only when a shape parameter changes |
| arms | `branch angle + spin × radius`: a logarithmic-looking spiral from one multiplication |
| scatter | `random^power × sign`: high powers pull stars tightly to the arm, with rare outliers |
| differential rotation | in the vertex shader, `angle += time × speed / (radius + 0.4)`; scatter is added **after** rotating so arms don't smear |
| point size | `uSize × aScale / −viewZ` for perspective, multiplied by the device pixel ratio so it looks the same on retina screens |
| soft stars | `gl_PointCoord` radial falloff to the 5th power; additive blending + `depthWrite: false` so overlapping stars accumulate light |
| nebula | an inside-out sphere whose fragment shader evaluates **fbm** value noise with **domain warping** (noise of noise) along the view direction, plus hashed pinpoint stars |
| colour management | `#include <colorspace_fragment>` at the end of custom shaders converts to the output colour space, like built-in materials |
| glow | `@react-three/postprocessing` `Bloom` with a low threshold: the bright galaxy core blooms, the dim nebula doesn't |
| controls | leva folders; `useControls(() => …)` returns a setter so the Randomise button can update the shape parameters |

:::tip Performance budget for particles
A few hundred thousand points is comfortable on desktop GPUs; on phones aim for under 100k and lower `dpr`. Fill rate (big, overlapping, blended sprites) usually costs more than vertex count, so keep point sizes modest. For millions of animated particles, move the simulation itself to the GPU: **GPGPU** with render targets (WebGL) or **compute shaders** (WebGPU / TSL, see Lesson 2.9).
:::

:::exercise Extend it
1. Add a **black hole**: a dark sphere at the centre plus a ring of bright, fast-orbiting stars, and bend nearby stars' paths in the vertex shader.
2. Make stars **twinkle**: add a per-star random phase attribute and modulate brightness with `sin(uTime * rate + phase)`.
3. **Collide two galaxies**: generate two point sets with opposite spins and animate their centres towards each other.
4. Add **audio reactivity**: analyse a music track with `AnalyserNode` and drive `uSize` and bloom from the bass energy.
5. Port the galaxy to **WebGPU + TSL** (`PointsNodeMaterial`) and compare frame times at 1 million stars.
:::

:::keypoints
- Procedural generation is **parameters → loop → typed arrays → BufferGeometry**; rebuild only when shape parameters change.
- Put per-element motion in the **vertex shader**: millions of independent movements cost the CPU nothing.
- Soft additive sprites, **fbm noise** and **bloom** are the core of space and particle aesthetics.
- End custom fragment shaders with `#include <colorspace_fragment>` so colours match the rest of the scene.
- leva makes any project a playground; expose the parameters that matter.
:::
