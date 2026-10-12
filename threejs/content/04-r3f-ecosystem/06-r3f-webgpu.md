---
title: WebGPU & TSL in React Three Fiber
level: advanced
time: 35
summary: Running R3F on three.js's WebGPURenderer with an async gl factory, registering node materials as JSX, writing TSL materials as props, GPU compute simulations driven from useFrame, post-processing with RenderPipeline, and what works (and doesn't yet) across the ecosystem.
---

Module 2 introduced `WebGPURenderer`, TSL node materials and compute shaders in plain three.js. R3F 9 supports them too: the `gl` prop accepts an **async factory**, so the renderer can finish its asynchronous initialisation before the first frame. Everything else (components, hooks, events) works as usual.

## Switching the renderer

:::syntax
```jsx
import * as THREE from "three/webgpu";            // classes incl. WebGPURenderer and node materials
import { Canvas, extend } from "@react-three/fiber";

extend(THREE);                                     // register node materials etc. as JSX elements

<Canvas
  shadows={{ enabled: false, type: THREE.PCFShadowMap }}   // avoid R3F's PCFSoftShadowMap default (see below)
  gl={async (props) => {
    const renderer = new THREE.WebGPURenderer(props);   // props include the canvas
    await renderer.init();                              // WebGPU, or WebGL 2 fallback
    return renderer;
  }}
>
  <mesh>
    <boxGeometry />
    <meshStandardNodeMaterial color="hotpink" />
  </mesh>
</Canvas>
```
:::

:::warn The PCFSoftShadowMap warning
R3F 9 sets `PCFSoftShadowMap` on the renderer by default (even when shadows are off), and three r186's `WebGPURenderer` warns because that type was removed. Pass an explicit config to silence it: `shadows={{ enabled: false, type: THREE.PCFShadowMap }}`, or `shadows={{ enabled: true, type: THREE.PCFShadowMap }}` when you want shadows. The examples below do this.
:::

`extend(THREE)` with the `three/webgpu` namespace makes elements such as `<meshStandardNodeMaterial>`, `<meshBasicNodeMaterial>`, `<spriteNodeMaterial>` and `<pointsNodeMaterial>` available.

## TSL materials as props

TSL expressions are just objects, so they can be passed as props. Build them in `useMemo` so they're created once, and drive them with `uniform()` nodes you update from `useFrame` or React state:

```jsx run title="WebGPU Canvas with TSL node materials" level=advanced
import { useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import { color, mix, uv, sin, time, positionLocal, normalLocal, uniform, mx_noise_float, vec3 } from "three/tsl";
import { Canvas, extend, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

extend(THREE);

function Blob() {
  const ref = useRef();
  const { colorNode, positionNode, amp } = useMemo(() => {
    const amp = uniform(0.25);
    // 3D noise moving over time, sampled at each vertex
    const n = mx_noise_float(positionLocal.mul(1.5).add(vec3(0, time.mul(0.4), 0)));
    return {
      amp,
      positionNode: positionLocal.add(normalLocal.mul(n.mul(amp))),     // displace along the normal
      colorNode: mix(color("#4f46e5"), color("#22d3ee"), n.mul(0.5).add(0.5)),
    };
  }, []);
  useFrame(({ clock }) => {
    amp.value = 0.2 + Math.sin(clock.elapsedTime) * 0.1;              // uniforms update without recompiling
    ref.current.rotation.y += 0.003;
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1.2, 64]} />
      <meshStandardNodeMaterial colorNode={colorNode} positionNode={positionNode} roughness={0.35} metalness={0.1} />
    </mesh>
  );
}

function Floor() {
  // a procedural grid drawn entirely by the fragment shader
  const colorNode = useMemo(() => {
    const g = uv().mul(20).fract().sub(0.5).abs();
    const line = g.x.min(g.y).smoothstep(0.0, 0.04).oneMinus();
    return mix(color("#0f172a"), color("#334155"), line);
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-1.6}>
      <planeGeometry args={[20, 20]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas
      camera={{ position: [0, 0.6, 4.5] }}
      shadows={{ enabled: false, type: THREE.PCFShadowMap }}   // see the note below
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer(props);
        await renderer.init();
        console.log("backend:", renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL 2 fallback");
        return renderer;
      }}
    >
      <color attach="background" args={["#020617"]} />
      <hemisphereLight args={["#c7d2fe", "#020617", 1.5]} />
      <directionalLight position={[3, 4, 2]} intensity={2} />
      <Blob />
      <Floor />
      <OrbitControls />
    </Canvas>
  );
}
```

## GPU compute from useFrame

The compute pattern from Module 2 maps naturally onto R3F: create the buffers and compute nodes once in `useMemo`, run the init pass when the renderer is ready, and dispatch the update pass every frame from `useFrame` with `gl.compute()`:

```jsx run title="50,000 compute-shader particles in R3F" level=advanced
import { useEffect, useMemo } from "react";
import * as THREE from "three/webgpu";
import { Fn, uniform, float, vec3, hash, instancedArray, instanceIndex, shapeCircle, mix, color, sin, time } from "three/tsl";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

extend(THREE);
const COUNT = 50000;

function Swarm() {
  const gl = useThree((s) => s.gl);
  const { init, update, material, attractor } = useMemo(() => {
    const pos = instancedArray(COUNT, "vec3"), vel = instancedArray(COUNT, "vec3");
    const attractor = uniform(new THREE.Vector3());
    const init = Fn(() => {
      const p = pos.element(instanceIndex);
      p.assign(vec3(hash(instanceIndex), hash(instanceIndex.add(1)), hash(instanceIndex.add(2))).sub(0.5).mul(8));
    })().compute(COUNT);
    const update = Fn(() => {
      const p = pos.element(instanceIndex), v = vel.element(instanceIndex);
      const toTarget = attractor.sub(p);
      v.addAssign(toTarget.normalize().mul(0.0025).div(toTarget.length().max(0.5)));   // pulled towards the attractor
      v.mulAssign(0.985);                                                             // drag
      p.addAssign(v);
    })().compute(COUNT);
    const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    material.positionNode = pos.toAttribute();
    material.scaleNode = float(0.035);
    material.colorNode = mix(color("#22d3ee"), color("#f472b6"), vel.element(instanceIndex).length().mul(25).clamp(0, 1));
    material.opacityNode = shapeCircle().mul(0.8);
    return { init, update, material, attractor };
  }, []);

  useEffect(() => { gl.compute(init); }, [gl, init]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    attractor.value.set(Math.sin(t * 0.7) * 3, Math.cos(t * 1.1) * 1.5, Math.sin(t * 0.5) * 3);   // a moving target
    gl.compute(update);                                                                    // simulate on the GPU
  });
  return <sprite count={COUNT} material={material} frustumCulled={false} />;
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 2, 9] }} shadows={{ enabled: false, type: THREE.PCFShadowMap }} gl={async (props) => { const r = new THREE.WebGPURenderer(props); await r.init(); return r; }}>
      <color attach="background" args={["#020617"]} />
      <Swarm />
      <OrbitControls />
    </Canvas>
  );
}
```

## Post-processing with RenderPipeline

With WebGPU, post-processing is a `RenderPipeline` whose output is a TSL node graph. In R3F, build it in `useMemo` and take over rendering with a **positive `useFrame` priority**, which tells R3F not to render the scene itself:

```jsx run title="TSL bloom with RenderPipeline in R3F" level=advanced
import { useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

extend(THREE);

function Bloom({ strength = 1.2 }) {
  const { gl, scene, camera } = useThree();
  const pipeline = useMemo(() => {
    const p = new THREE.RenderPipeline(gl);
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode("output");
    p.outputNode = sceneColor.add(bloom(sceneColor, strength, 0.4, 0.7));
    return p;
  }, [gl, scene, camera, strength]);
  useFrame(() => pipeline.render(), 1);        // priority 1: we render, R3F doesn't
  return null;
}

function Rings() {
  const group = useRef();
  useFrame((_, dt) => (group.current.rotation.y += dt * 0.4));
  return (
    <group ref={group}>
      {["#22d3ee", "#e879f9", "#facc15"].map((c, i) => (
        <mesh key={c} rotation={[i * 0.9, i * 0.5, 0]}>
          <torusGeometry args={[1.4 - i * 0.3, 0.04, 16, 128]} />
          <meshStandardMaterial color="#000000" emissive={c} emissiveIntensity={3} />
        </mesh>
      ))}
    </group>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 5] }} shadows={{ enabled: false, type: THREE.PCFShadowMap }} gl={async (props) => { const r = new THREE.WebGPURenderer(props); await r.init(); return r; }}>
      <color attach="background" args={["#05060f"]} />
      <Rings />
      <Bloom />
      <OrbitControls />
    </Canvas>
  );
}
```

## Ecosystem compatibility (late 2026)

| Works with WebGPURenderer | Needs care / WebGL-only |
|---|---|
| R3F core: Canvas, hooks, events, `extend` | `@react-three/postprocessing` (WebGL `EffectComposer`): use TSL `RenderPipeline` instead |
| Built-in materials (converted to node materials automatically) | GLSL `ShaderMaterial` and drei `shaderMaterial`: rewrite in TSL |
| drei helpers that only create objects or control the camera (controls, `Text`, `Html`, `Float`, `Center`, loaders) | drei helpers that inject GLSL or use WebGL render targets internally (some shadow, reflector and transmission materials) |
| `@react-three/xr` (WebXR on WebGPU since three r185) | `onBeforeCompile`-based libraries |

:::note R3F v10
R3F's next major version (in alpha) is built around WebGPU, with a new frame scheduler and first-class TSL support, and drei is migrating helpers to TSL. For production today, choose per project: WebGPU for compute-heavy and effect-heavy work, WebGL where you depend on GLSL-based helpers.
:::

## Check yourself

```quiz
? How do you make R3F use WebGPURenderer?
+ Pass an async factory to the gl prop that creates the renderer and awaits init()
- Set <Canvas webgpu />
- Import Canvas from three/webgpu
> R3F waits for the promise before the first frame.

? Why call extend(THREE) with the three/webgpu namespace?
+ To register node materials like meshStandardNodeMaterial as JSX elements
- To enable WebGPU in the browser
- It's required for OrbitControls
> Only classes known to R3F can be used as elements.

? Where should TSL node graphs be created in a component?
+ In useMemo, so they're built once; update uniform().value per frame
- Inside useFrame
- In the JSX directly on every render
> Rebuilding nodes recompiles shaders.

? How do you take over rendering for a RenderPipeline?
+ useFrame(() => pipeline.render(), 1) — a positive priority
- Set frameloop="never"
- Call gl.render twice
> Positive priority tells R3F you render.

? Which library needs replacing when moving to WebGPU?
+ @react-three/postprocessing (use TSL RenderPipeline)
- @react-three/drei OrbitControls
- zustand
> The WebGL EffectComposer doesn't run on WebGPURenderer.
```

:::exercise Wobble on hover
In the blob example, make the noise amplitude jump to 0.5 while the pointer is over the blob and settle back to 0.2 when it leaves. Keep the TSL graph in `useMemo` and only change `amp.value` (damp it in `useFrame` towards a target set by `onPointerOver`/`onPointerOut`).
:::

:::solution
```jsx run
import { useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import { color, mix, time, positionLocal, normalLocal, uniform, mx_noise_float, vec3 } from "three/tsl";
import { Canvas, extend, useFrame } from "@react-three/fiber";

extend(THREE);

function Blob() {
  const target = useRef(0.2);
  const { colorNode, positionNode, amp } = useMemo(() => {
    const amp = uniform(0.2);
    const n = mx_noise_float(positionLocal.mul(1.5).add(vec3(0, time.mul(0.4), 0)));
    return { amp, positionNode: positionLocal.add(normalLocal.mul(n.mul(amp))), colorNode: mix(color("#4f46e5"), color("#22d3ee"), n.mul(0.5).add(0.5)) };
  }, []);
  useFrame((_, dt) => { amp.value = THREE.MathUtils.damp(amp.value, target.current, 6, dt); });
  return (
    <mesh onPointerOver={() => (target.current = 0.5)} onPointerOut={() => (target.current = 0.2)}>
      <icosahedronGeometry args={[1.2, 64]} />
      <meshStandardNodeMaterial colorNode={colorNode} positionNode={positionNode} />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 4.5] }} shadows={{ enabled: false, type: THREE.PCFShadowMap }} gl={async (props) => { const r = new THREE.WebGPURenderer(props); await r.init(); return r; }}>
      <color attach="background" args={["#020617"]} />
      <hemisphereLight args={["#c7d2fe", "#020617", 1.5]} />
      <directionalLight position={[3, 4, 2]} intensity={2} />
      <Blob />
    </Canvas>
  );
}
```
:::

:::keypoints
- `<Canvas gl={async (props) => { const r = new WebGPURenderer(props); await r.init(); return r; }}>` runs R3F on WebGPU (with WebGL 2 fallback).
- `extend(THREE)` from `three/webgpu` exposes node materials as JSX; pass TSL graphs as `colorNode`/`positionNode` props, built in `useMemo`.
- Compute: build `instancedArray` + `Fn().compute()` once, `gl.compute(init)` once, `gl.compute(update)` in `useFrame`.
- Post-processing: `RenderPipeline` + `pass()` + effect nodes, rendered from `useFrame(…, 1)`.
- Check ecosystem compatibility: replace GLSL-based helpers and `@react-three/postprocessing` with TSL equivalents.
:::
