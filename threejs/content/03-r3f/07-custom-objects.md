---
title: Extending R3F — Custom Objects, Shaders & Buffers
level: advanced
time: 40
summary: Registering any three.js class as JSX with extend, reaching deep properties with dash-case, writing shader materials with drei's shaderMaterial and animating their uniforms, building geometry from typed arrays in JSX, and instancing thousands of objects declaratively.
---

R3F knows every class in the `three` namespace out of the box. Everything else (addons like `Sky` and `Water`, community libraries, your own classes) needs one line to become JSX. This lesson covers that, plus the R3F way of doing three advanced things from Module 2: custom shaders, raw buffer geometry, and instancing.

## extend: any class becomes an element

:::syntax
```jsx
import { extend } from "@react-three/fiber";
import { Sky } from "three/addons/objects/Sky.js";

extend({ Sky });               // registers <sky /> (lower-camel-case of the key)
// or, without a global name:
const SkyElement = extend(Sky);  // a component: <SkyElement />
```
:::

Props then work exactly as for built-ins, including **dash-case** for deep properties. `Sky` keeps its settings in `material.uniforms.*.value`, which dash-case can reach directly:

```jsx run title="extend: three.js's Sky addon as JSX" level=intermediate
import { useState } from "react";
import { Canvas, extend } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Sky } from "three/addons/objects/Sky.js";

extend({ Sky });

export default function App() {
  const [elevation, setElevation] = useState(6);
  const [azimuth, setAzimuth] = useState(180);
  const phi = (90 - elevation) * (Math.PI / 180), theta = azimuth * (Math.PI / 180);
  const sun = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
  return (
    <>
      <div className="overlay">
        <label>sun elevation <input type="range" min="-2" max="60" step="0.1" value={elevation} onChange={(e) => setElevation(+e.target.value)} /></label>
        <label>azimuth <input type="range" min="0" max="360" value={azimuth} onChange={(e) => setAzimuth(+e.target.value)} /></label>
      </div>
      <Canvas camera={{ position: [0, 1, 4], fov: 60 }} gl={{ toneMappingExposure: 0.6 }}>
        <sky
          scale={1000}
          material-uniforms-sunPosition-value={sun}          // = sky.material.uniforms.sunPosition.value.set(...sun)
          material-uniforms-turbidity-value={8}
          material-uniforms-rayleigh-value={2}
          material-uniforms-mieCoefficient-value={0.005}
          material-uniforms-mieDirectionalG-value={0.8}
        />
        <directionalLight position={sun.map((v) => v * 10)} intensity={Math.max(0, elevation) / 10 + 0.1} />
        <hemisphereLight args={["#fde68a", "#1c1917", 0.9]} />   {/* warm sky fill so the front isn't a silhouette */}
        <mesh position-y={0.5}><torusKnotGeometry args={[0.5, 0.18, 128, 16]} /><meshStandardMaterial color="#e2e8f0" roughness={0.3} /></mesh>
        <mesh rotation-x={-Math.PI / 2}><circleGeometry args={[30, 64]} /><meshStandardMaterial color="#4d7c0f" /></mesh>
        <OrbitControls target={[0, 0.5, 0]} />
      </Canvas>
    </>
  );
}
```

| Approach | Use when |
|---|---|
| built-in element (`<mesh>`, `<sphereGeometry>`) | any class exported by `three` |
| `extend({ Thing })` → `<thing>` | addons and libraries you use as elements in many places |
| `const Thing = extend(ThingClass)` | libraries (avoids global name clashes), or with TypeScript |
| `<primitive object={instance} />` | an object you already created (a loaded model, an object from a library) |

## Shader materials with drei's shaderMaterial

Writing a `THREE.ShaderMaterial` by hand works in R3F (`<shaderMaterial uniforms={…} vertexShader={…} />`), with one catch: R3F copies the uniforms into the material's own objects, so animate them through a ref (`ref.current.uniforms.uTime.value += dt`), not through the object you passed in. drei's `shaderMaterial()` helper is nicer: it creates a material **class** whose uniforms become **props**, so they can be set declaratively and animated through a ref.

```jsx run title="A custom shader material as a JSX element" level=advanced
import { useRef } from "react";
import * as THREE from "three";
import { Canvas, extend, useFrame } from "@react-three/fiber";
import { shaderMaterial, OrbitControls } from "@react-three/drei";

const WaveMaterial = shaderMaterial(
  { uTime: 0, uColorA: new THREE.Color("#4f46e5"), uColorB: new THREE.Color("#22d3ee"), uAmp: 0.15 },   // uniforms → props
  /* glsl */ `
    uniform float uTime, uAmp;
    varying vec2 vUv;
    varying float vWave;
    void main() {
      vUv = uv;
      vec3 p = position;
      vWave = sin(p.x * 3.0 + uTime * 2.0) * cos(p.y * 3.0 + uTime * 1.5);
      p.z += vWave * uAmp;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  /* glsl */ `
    uniform vec3 uColorA, uColorB;
    varying vec2 vUv;
    varying float vWave;
    void main() {
      vec3 col = mix(uColorA, uColorB, vWave * 0.5 + 0.5);
      col += smoothstep(0.96, 1.0, fract(vUv.y * 20.0)) * 0.15;     // thin scan lines
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`
);
extend({ WaveMaterial });                                        // → <waveMaterial />

function Flag({ amp }) {
  const mat = useRef();
  useFrame((_, delta) => (mat.current.uTime += delta));          // uniforms are plain properties on the material
  return (
    <mesh rotation-x={-0.4}>
      <planeGeometry args={[4, 2.5, 128, 80]} />
      <waveMaterial ref={mat} uAmp={amp} uColorB="#f472b6" side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0.5, 4] }}>
      <color attach="background" args={["#0b1020"]} />
      <Flag amp={0.2} />
      <OrbitControls />
    </Canvas>
  );
}
```

:::tip Hot reloading shaders
Shader materials are compiled once. During development, add `key={WaveMaterial.key}` to the element so Vite's hot reload recompiles it when you edit the GLSL. For production-grade custom materials that keep three.js lighting, look at **three-custom-shader-material** (`<CustomShaderMaterial baseMaterial={THREE.MeshPhysicalMaterial} vertexShader={…} />`), which patches a built-in material like `onBeforeCompile` but safely.
:::

## Geometry from typed arrays

For data-driven geometry (point clouds, sensor meshes, generated terrain), build a `bufferGeometry` with `bufferAttribute` children. `attach="attributes-position"` uses dash-case to set `geometry.attributes.position`:

```jsx run title="A data-driven point cloud in JSX" level=intermediate
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

function Torus({ count = 40000 }) {
  // compute once: positions and colours for a noisy torus of points
  const [positions, colors] = useMemo(() => {
    const p = new Float32Array(count * 3), c = new Float32Array(count * 3), col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * Math.PI * 2;
      const r = 0.6 + (Math.random() - 0.5) * 0.15;
      p.set([(2 + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (2 + r * Math.cos(v)) * Math.sin(u)], i * 3);
      col.setHSL(u / (Math.PI * 2), 0.8, 0.6);
      c.set([col.r, col.g, col.b], i * 3);
    }
    return [p, c];
  }, [count]);
  const ref = useRef();
  useFrame((_, dt) => (ref.current.rotation.y += dt * 0.2));
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.025} vertexColors sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 3, 6], fov: 50 }}>
      <color attach="background" args={["#020617"]} />
      <Torus />
      <OrbitControls />
    </Canvas>
  );
}
```

`useMemo` matters: without it the arrays would be regenerated on every React render, re-uploading 40,000 points each time.

## Instancing in R3F

Two ways, matching what you learned in Module 2:

| `<instancedMesh>` + ref | drei `<Instances>` + `<Instance>` |
|---|---|
| set matrices imperatively (`setMatrixAt`) | each `<Instance>` is a component with position/rotation/colour props and events |
| fastest; best for thousands to millions | convenient; best for hundreds to a few thousand |
| one handler for all (use `e.instanceId`) | per-instance `onClick`, hover state, React state |

```jsx run title="drei Instances: a forest you can click" level=intermediate
import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Instances, Instance, OrbitControls } from "@react-three/drei";

function Tree({ position, scale }) {
  const [hit, setHit] = useState(false);
  return (
    <Instance
      position={position}
      scale={hit ? [scale * 1.3, scale * 0.4, scale * 1.3] : scale}       // "chopped"
      color={hit ? "#a16207" : "#15803d"}
      onClick={(e) => { e.stopPropagation(); setHit(!hit); }}
    />
  );
}

export default function App() {
  const trees = useMemo(() => Array.from({ length: 1500 }, () => {
    const r = 3 + Math.random() * 30, a = Math.random() * Math.PI * 2;
    return { position: [Math.cos(a) * r, 0.75, Math.sin(a) * r], scale: 0.6 + Math.random() * 0.8 };
  }), []);
  return (
    <>
      <div className="overlay">1,500 trees in one draw call · click one to chop it</div>
      <Canvas camera={{ position: [0, 9, 16], fov: 50 }}>
        <color attach="background" args={["#bae6fd"]} />
        <fog attach="fog" args={["#bae6fd", 15, 45]} />
        <hemisphereLight args={["#e0f2fe", "#365314", 1.5]} />
        <directionalLight position={[10, 15, 5]} intensity={1.5} />
        <Instances limit={trees.length}>
          <coneGeometry args={[0.6, 1.5, 7]} />
          <meshStandardMaterial flatShading />
          {trees.map((t, i) => <Tree key={i} {...t} />)}
        </Instances>
        <mesh rotation-x={-Math.PI / 2}><circleGeometry args={[40, 64]} /><meshStandardMaterial color="#4d7c0f" /></mesh>
        <OrbitControls maxPolarAngle={1.4} />
      </Canvas>
    </>
  );
}
```

For a glTF model made of several meshes, drei's `<Merged meshes={{ Trunk, Leaves }}>` creates one instanced mesh per part and gives you a component per model copy.

## Check yourself

```quiz
? You want to use three.js's `Water` addon as <water /> in JSX. What do you do?
+ extend({ Water }) after importing it from three/addons
- Nothing, it's built in
- Wrap it in <primitive> every time
> Only classes in the three namespace are automatic.

? What does `material-uniforms-sunPosition-value={[0, 1, 0]}` set?
+ object.material.uniforms.sunPosition.value (via .set for vectors)
- A uniform called material-uniforms
- The material's colour
> Dash-case walks into nested properties.

? How do you animate a uniform of a drei shaderMaterial each frame?
+ Mutate it through a ref in useFrame: mat.current.uTime += delta
- Pass a new uTime prop with setState every frame
- Recreate the material
> Uniforms are exposed as properties on the material.

? Why wrap generated Float32Arrays in useMemo?
+ So they aren't regenerated (and re-uploaded) on every React render
- Typed arrays require useMemo
- To make them reactive
> Expensive data should be computed once.

? When is drei's <Instances>/<Instance> preferable to raw <instancedMesh>?
+ For hundreds to a few thousand objects that need per-instance props, state and events
- For millions of particles
- Never; it's always slower
> Convenience vs. raw speed.
```

:::exercise Uniform from the UI
Add a slider to the shader example that controls `uAmp` (0 to 0.5) from React state, and a colour input for `uColorA`. Note which updates are fine as props (user-driven changes) and which must stay in `useFrame` (time).
:::

:::solution
```jsx run
import { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, extend, useFrame } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";

const WaveMaterial = shaderMaterial(
  { uTime: 0, uColorA: new THREE.Color("#4f46e5"), uColorB: new THREE.Color("#22d3ee"), uAmp: 0.15 },
  `uniform float uTime, uAmp; varying float vWave;
   void main() { vec3 p = position; vWave = sin(p.x * 3.0 + uTime * 2.0) * cos(p.y * 3.0 + uTime); p.z += vWave * uAmp;
     gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  `uniform vec3 uColorA, uColorB; varying float vWave;
   void main() { gl_FragColor = vec4(mix(uColorA, uColorB, vWave * 0.5 + 0.5), 1.0);
     #include <colorspace_fragment>
   }`
);
extend({ WaveMaterial });

function Flag({ amp, colorA }) {
  const mat = useRef();
  useFrame((_, dt) => (mat.current.uTime += dt));            // per-frame: ref
  return (
    <mesh rotation-x={-0.4}>
      <planeGeometry args={[4, 2.5, 128, 80]} />
      <waveMaterial ref={mat} uAmp={amp} uColorA={colorA} side={THREE.DoubleSide} />   {/* user-driven: props */}
    </mesh>
  );
}

export default function App() {
  const [amp, setAmp] = useState(0.15);
  const [colorA, setColorA] = useState("#4f46e5");
  return (
    <>
      <div className="overlay">
        <label>amplitude <input type="range" min="0" max="0.5" step="0.01" value={amp} onChange={(e) => setAmp(+e.target.value)} /></label>
        <label>colour A <input type="color" value={colorA} onChange={(e) => setColorA(e.target.value)} /></label>
      </div>
      <Canvas camera={{ position: [0, 0.5, 4] }}>
        <color attach="background" args={["#0b1020"]} />
        <Flag amp={amp} colorA={colorA} />
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- `extend({ Class })` turns any class into `<class>`; `extend(Class)` returns a component; `<primitive>` inserts existing objects.
- **Dash-case** reaches deep properties, even `material-uniforms-x-value`.
- drei's `shaderMaterial(uniforms, vert, frag)` + `extend` → a JSX material whose uniforms are props; animate via a ref in `useFrame`.
- Build data geometry with `<bufferGeometry>` + `<bufferAttribute attach="attributes-position" args={[array, 3]} />`, memoised.
- Instancing: raw `<instancedMesh>` for scale, drei `<Instances>`/`<Instance>` for convenience and per-instance events.
:::
