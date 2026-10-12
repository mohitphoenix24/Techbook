---
title: Creative Development & Award-Winning Sites
level: intermediate
time: 35
summary: How agencies and creative developers build the 3D websites that win Awwwards — the studios, the stack (three.js/R3F, GLSL, GSAP, Lenis, Theatre.js), the process from concept to launch, two signature effects you can reuse (a shader image-hover gallery and a particle morph hero), and how to stay fast and accessible while being spectacular.
---

Brand launches, luxury product microsites, music releases, agency and developer portfolios: this corner of the web competes on **craft**. Awwwards, The FWA and CSS Design Awards showcase hundreds of three.js sites a year, from watchmakers' six-room 3D showcases to real-estate developers' glowing monoliths and portfolios you can drive a car through. The work is done by **creative developers**: engineers with a designer's eye who are fluent in shaders, motion and performance.

## Who builds these

Well-known studios include **Lusion**, **Immersive Garden**, **Unseen Studio**, **Active Theory**, **Dogstudio**, **Merci-Michel**, **Resn**, **Hello Monday**, **14islands**, **Garden Eight** and many independent creative developers whose portfolios double as showreels (Bruno Simon's drivable portfolio, whose source is public, is a famous example). Agencies sell the result as brand experiences; the people behind them are among the most sought-after three.js developers.

## The typical stack

| Layer | Common choices |
|---|---|
| rendering | three.js or R3F; WebGPU + TSL increasingly |
| shaders | GLSL (or TSL), noise libraries (lygia), custom post-processing |
| motion | **GSAP** (timelines, ScrollTrigger), **Theatre.js** (visual keyframe editor for 3D), maath damping |
| scroll | **Lenis** smooth scrolling, drei ScrollControls |
| sound | Web Audio, Howler |
| 3D content | Blender / Houdini / Cinema 4D → glTF; baked lighting; Draco/KTX2 |
| site framework | Next.js, Nuxt, Astro, SvelteKit; a headless CMS for copy |

:::flow From brief to launch
Concept & moodboard | the one idea the site is about
Art direction | style frames in Figma / Blender
Tech prototypes | prove the risky effects early, on phones
Production | 3D assets, shaders, motion, copy, sound
Performance pass | budgets per device, fallbacks, loading strategy
Launch & awards | case study, submission, maintenance
:::

## Signature effect 1: shader image hover

Images that ripple, bulge or bleed colour when you hover them are a staple. The image is a texture on a plane; a fragment shader distorts the UVs around the mouse; a uniform eases the strength in and out:

```jsx run title="Liquid image hover (shader on textured planes)" level=intermediate height=460
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { easing } from "maath";

const EX = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/textures/";
const IMAGES = ["planets/earth_atmos_2048.jpg", "hardwood2_diffuse.jpg", "758px-Canestra_di_frutta_(Caravaggio).jpg"];

const vert = /* glsl */ `
  uniform float uHover; uniform vec2 uMouse;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float d = distance(uv, uMouse);
    p.z += (1.0 - smoothstep(0.0, 0.5, d)) * 0.25 * uHover;        // the plane bulges towards the cursor
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const frag = /* glsl */ `
  uniform sampler2D uMap; uniform float uHover, uTime; uniform vec2 uMouse;
  varying vec2 vUv;
  void main() {
    float d = distance(vUv, uMouse);
    float ripple = sin(d * 40.0 - uTime * 6.0) * 0.012 * uHover * (1.0 - smoothstep(0.0, 0.45, d));
    vec2 uv = vUv + normalize(vUv - uMouse + 0.0001) * ripple;
    // RGB split that grows with hover
    float shift = 0.006 * uHover;
    vec3 col = vec3(texture2D(uMap, uv + shift).r, texture2D(uMap, uv).g, texture2D(uMap, uv - shift).b);
    col = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 0.35 + 0.65 * uHover);   // greyscale until hovered
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

function Card({ url, x }) {
  const map = useLoader(THREE.TextureLoader, EX + url);
  map.colorSpace = THREE.SRGBColorSpace;
  const hovered = useRef(false), material = useRef();
  const uniforms = useMemo(() => ({ uMap: { value: map }, uHover: { value: 0 }, uTime: { value: 0 }, uMouse: { value: new THREE.Vector2(0.5, 0.5) } }), [map]);
  useFrame((_, dt) => {
    const u = material.current.uniforms;              // the material's own uniforms (see the warning below)
    easing.damp(u.uHover, "value", hovered.current ? 1 : 0, 0.25, dt);
    u.uTime.value += dt;
  });
  return (
    <mesh position-x={x}
      onPointerOver={() => (hovered.current = true)} onPointerOut={() => (hovered.current = false)}
      onPointerMove={(e) => material.current.uniforms.uMouse.value.copy(e.uv)}>
      <planeGeometry args={[1.6, 2.1, 48, 48]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vert} fragmentShader={frag} />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 4.2], fov: 45 }}>
      <color attach="background" args={["#0a0a0a"]} />
      {IMAGES.map((url, i) => <Card key={url} url={url} x={(i - 1) * 1.85} />)}
    </Canvas>
  );
}
```

:::warn Update uniforms through the material, not your object
R3F 9 copies the uniforms you pass to `<shaderMaterial uniforms={…}>` into the material's **own** uniform objects (so the material keeps a stable reference across re-renders). Changing your original object afterwards does nothing. Animate `ref.current.uniforms.uX.value` instead, as both examples here do, or create the material yourself (`useMemo(() => new THREE.ShaderMaterial({ uniforms, … }))`) and pass it with `material={…}`. drei's `shaderMaterial` helper avoids the issue by exposing uniforms as properties.
:::

`e.uv` from R3F's event gives the texture coordinate under the cursor, which is exactly the shader's `uMouse`. The same structure (texture on a plane + a damped hover uniform + UV distortion) produces dozens of effects: dissolves, pixelation, displacement maps, page transitions between images.

## Signature effect 2: a particle morph hero

Thousands of particles that flow from one shape into another as you click or scroll is another favourite. Store several target positions per particle as attributes and mix between them in the vertex shader, so the GPU animates everything:

```jsx run title="Particles morphing between shapes" level=advanced height=460
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { easing } from "maath";

const COUNT = 20000;
// sample N points on each shape's surface
function sample(geometry) {
  const pos = geometry.attributes.position, idx = geometry.index;
  const out = new Float32Array(COUNT * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tris = idx ? idx.count / 3 : pos.count / 3;
  for (let i = 0; i < COUNT; i++) {
    const t = Math.floor(Math.random() * tris) * 3;
    const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const p = a.clone().add(b.clone().sub(a).multiplyScalar(u)).add(c.clone().sub(a).multiplyScalar(v));   // uniform point in the triangle
    out.set([p.x, p.y, p.z], i * 3);
  }
  return out;
}

const SHAPES = ["Sphere", "Knot", "Cube"];

function Morph({ target }) {
  const material = useRef();
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sample(new THREE.SphereGeometry(1.5, 64, 32)), 3));
    g.setAttribute("aKnot", new THREE.BufferAttribute(sample(new THREE.TorusKnotGeometry(1.1, 0.35, 200, 32)), 3));
    g.setAttribute("aCube", new THREE.BufferAttribute(sample(new THREE.BoxGeometry(2.2, 2.2, 2.2, 8, 8, 8)), 3));
    g.setAttribute("aRandom", new THREE.BufferAttribute(Float32Array.from({ length: COUNT }, Math.random), 1));
    return g;
  }, []);
  const uniforms = useMemo(() => ({ uKnot: { value: 0 }, uCube: { value: 0 }, uTime: { value: 0 } }), []);
  useFrame((state, dt) => {
    const u = material.current.uniforms;                 // animate the material's uniforms
    easing.damp(u.uKnot, "value", target === 1 ? 1 : 0, 0.5, dt);
    easing.damp(u.uCube, "value", target === 2 ? 1 : 0, 0.5, dt);
    u.uTime.value += dt;
    state.scene.rotation.y += dt * 0.15;
  });
  return (
    <points geometry={geometry}>
      <shaderMaterial ref={material} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending}
        vertexShader={/* glsl */ `
          attribute vec3 aKnot, aCube; attribute float aRandom;
          uniform float uKnot, uCube, uTime;
          varying float vRandom;
          void main() {
            vec3 p = mix(position, aKnot, uKnot);
            p = mix(p, aCube, uCube);
            float transition = uKnot * (1.0 - uKnot) + uCube * (1.0 - uCube);      // peaks mid-morph
            p += normalize(p + 0.001) * sin(uTime * 3.0 + aRandom * 20.0) * transition * 0.6;   // scatter while moving
            vRandom = aRandom;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (2.0 + aRandom * 3.0) * (6.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`}
        fragmentShader={/* glsl */ `
          varying float vRandom;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;                                                   // round points
            vec3 col = mix(vec3(0.13, 0.83, 0.93), vec3(0.93, 0.28, 0.6), vRandom);
            gl_FragColor = vec4(col, (0.5 - d) * 1.6);
          }`} />
    </points>
  );
}

export default function App() {
  const [target, setTarget] = useState(0);
  return (
    <>
      <div className="overlay"><div className="row">{SHAPES.map((s, i) => <button key={s} className={i === target ? "on" : ""} onClick={() => setTarget(i)}>{s}</button>)}</div></div>
      <Canvas camera={{ position: [0, 0, 6] }}>
        <color attach="background" args={["#030014"]} />
        <Morph target={target} />
      </Canvas>
    </>
  );
}
```

Tie the morph target to scroll chapters (Module 4) and you have the hero section of a product launch: particles become the product, then the logo, then a call to action.

## Spectacular and responsible

Award juries also score **usability**, and real visitors use phones on slow networks. The best creative sites:

- **Load progressively**: an intro animation that hides asset loading, with the content usable early.
- **Scale down gracefully**: fewer particles, simpler shaders and no post-processing on low-end devices (detect with `PerformanceMonitor` or a quick GPU benchmark such as `detect-gpu`).
- **Keep text real**: HTML for copy and navigation (SEO, screen readers, translation).
- **Respect `prefers-reduced-motion`** and offer sound **off** by default.
- **Don't hijack scrolling**: smooth it, don't replace it.
- **Measure**: Lighthouse and real-device frame rates are part of the definition of done.

:::ai
AI tools now sit in the creative pipeline: image and video models for moodboards and textures, text-to-3D for props, and coding assistants that draft shaders. The differentiator remains taste and craft: an original concept, cohesive art direction, motion that feels right, and engineering that keeps it all running at 60 fps on a phone.
:::

## Check yourself

```quiz
? What gives the shader its mouse position on the image?
+ R3F's event uv (e.uv), copied into a uniform
- The canvas pixel coordinates
- A raycaster in the shader
> e.uv is the texture coordinate under the pointer.

? Why do particle morphs store target shapes as attributes?
+ So the GPU can mix positions per particle in the vertex shader, animating thousands at once
- Attributes are required for colours
- To save memory compared with uniforms
> One mix() per vertex, zero JavaScript per particle.

? Which tool gives a visual keyframe editor for 3D animation on the web?
+ Theatre.js
- Lenis
- Howler
> It's popular with creative developers for choreographing scenes.

? What should a creative site do on a low-end phone?
+ Scale down effects (fewer particles, no post-processing) while keeping content usable
- Show nothing until the full experience loads
- Force maximum quality
> Graceful degradation keeps everyone in.
```

:::keypoints
- Creative development = engineering + art direction: shaders, motion, scroll and sound, shipped fast.
- Stack: three.js/R3F, GLSL/TSL, GSAP, Theatre.js, Lenis, Blender → glTF; process from concept to performance pass.
- **Image hover**: texture on a plane + damped hover uniform + UV distortion from `e.uv`.
- **Particle morph**: target shapes as attributes, `mix()` in the vertex shader, transitions on click or scroll.
- Be spectacular **and** responsible: progressive loading, graceful degradation, real text, reduced motion.
:::
