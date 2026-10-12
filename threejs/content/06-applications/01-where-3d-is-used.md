---
title: Where 3D on the Web Is Used
level: easy
time: 25
summary: A map of the industries that build with three.js, R3F and WebXR, what each one gets out of 3D, the typical stack and team for each, the roles and skills companies hire for, and a live tour of five industry scenes built from the same engine.
---

Three.js runs on well over a hundred thousand production websites, from car makers and banks to robotics start-ups, museums and indie game studios. The same handful of techniques you've learned (load a model, light it, let people interact, keep it fast) shows up everywhere; what changes is **why** each industry wants 3D and **what** it connects the 3D view to. This module walks through the major fields; this first lesson is the map.

## Same engine, different jobs

Switch between five miniature scenes. Each is a few dozen lines, built from techniques in Modules 1–4, and each stands for a whole industry:

```jsx run title="One engine, five industries" level=easy height=460
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Float, Text, Instances, Instance } from "@react-three/drei";

function Product() {        // e-commerce: a configurable product
  const [c, setC] = useState(0);
  const colors = ["#ef4444", "#10b981", "#3b82f6", "#f59e0b"];
  return (
    <Float speed={2} floatIntensity={0.3}>
      <mesh onClick={() => setC((c + 1) % colors.length)} position-y={0.6}>
        <torusKnotGeometry args={[0.45, 0.16, 160, 24]} />
        <meshPhysicalMaterial color={colors[c]} clearcoat={1} roughness={0.25} />
      </mesh>
      <Text position={[0, -0.2, 0.8]} fontSize={0.12} color="#334155">click to change colour</Text>
    </Float>
  );
}

function Twin() {           // manufacturing / robotics: live machine state
  const refs = useRef([]);
  useFrame(({ clock }) => refs.current.forEach((m, i) => {
    const load = (Math.sin(clock.elapsedTime * 0.8 + i * 1.7) + 1) / 2;
    m.material.color.setHSL(0.33 - load * 0.33, 0.8, 0.5);        // green → red as load rises
    m.scale.y = 0.4 + load;
  }));
  return Array.from({ length: 6 }, (_, i) => (
    <mesh key={i} ref={(m) => (refs.current[i] = m)} position={[(i % 3 - 1) * 0.9, 0.4, Math.floor(i / 3) * 0.9 - 0.45]}>
      <boxGeometry args={[0.6, 0.8, 0.6]} /><meshStandardMaterial />
    </mesh>
  ));
}

function DataGlobe() {      // data & geospatial: points on a planet
  const ref = useRef();
  useFrame((_, dt) => (ref.current.rotation.y += dt * 0.2));
  const pts = useMemo(() => Array.from({ length: 300 }, () => new THREE.Vector3().randomDirection().multiplyScalar(0.8)), []);
  return (
    <group ref={ref} position-y={0.8}>
      <mesh><sphereGeometry args={[0.78, 48, 24]} /><meshStandardMaterial color="#1e3a8a" /></mesh>
      <Instances limit={pts.length}>                          {/* 300 data points, one draw call */}
        <sphereGeometry args={[0.015, 6, 4]} /><meshBasicMaterial color="#fbbf24" />
        {pts.map((p, i) => <Instance key={i} position={p} />)}
      </Instances>
    </group>
  );
}

function Game() {           // games: a character, a goal, motion
  const ball = useRef();
  useFrame(({ clock }) => { const t = clock.elapsedTime; ball.current.position.set(Math.sin(t) * 1.2, 0.2 + Math.abs(Math.sin(t * 3)) * 0.6, Math.cos(t) * 0.6); });
  return (
    <>
      <mesh ref={ball}><sphereGeometry args={[0.2, 24, 12]} /><meshStandardMaterial color="#f97316" /></mesh>
      {[-1, 0, 1].map((x) => <mesh key={x} position={[x * 1.1, 0.3, -0.6]}><boxGeometry args={[0.3, 0.6, 0.3]} /><meshStandardMaterial color="#8b5cf6" /></mesh>)}
    </>
  );
}

function Building() {       // architecture / real estate: a building you can walk around
  return (
    <group>
      {[0, 1, 2, 3].map((f) => (
        <mesh key={f} position-y={0.15 + f * 0.32}><boxGeometry args={[1.6 - f * 0.15, 0.28, 1.1 - f * 0.1]} />
          <meshStandardMaterial color={f % 2 ? "#e2e8f0" : "#cbd5e1"} /></mesh>
      ))}
      <mesh position={[0, 0.15, 0.56]}><boxGeometry args={[0.3, 0.28, 0.02]} /><meshStandardMaterial color="#0ea5e9" /></mesh>
    </group>
  );
}

const SCENES = { "E-commerce": Product, "Digital twin": Twin, "Data & maps": DataGlobe, Games: Game, Architecture: Building };

export default function App() {
  const [name, setName] = useState("E-commerce");
  const Scene = SCENES[name];
  return (
    <>
      <div className="overlay"><div className="row">{Object.keys(SCENES).map((n) => <button key={n} className={n === name ? "on" : ""} onClick={() => setName(n)}>{n}</button>)}</div></div>
      <Canvas camera={{ position: [2.2, 1.8, 3], fov: 45 }}>
        <color attach="background" args={["#f1f5f9"]} />
        <Scene key={name} />
        <ContactShadows opacity={0.4} blur={2} scale={6} />
        <Environment preset="city" />
        <OrbitControls target={[0, 0.5, 0]} />
      </Canvas>
    </>
  );
}
```

## The map

| Field | Why 3D | What it connects to | Typical stack |
|---|---|---|---|
| **E-commerce & retail** | fewer returns, higher conversion, every variant without photoshoots | product catalogue, pricing, cart, AR | R3F + drei, glTF pipeline, model-viewer for AR |
| **Automotive** | configure paint, wheels, trims; launch campaigns | dealer stock, pricing, lead forms | three.js/R3F, high-end materials, sometimes pixel streaming |
| **Manufacturing & digital twins** | see state where it physically is; faster diagnosis | sensors, PLCs, MES/ERP, MQTT, historians | three.js/R3F, WebSockets, time-series DBs |
| **Robotics & autonomy** | understand what robots sense and plan | ROS 2, LiDAR, cameras, logs (MCAP) | three.js (Foxglove uses it), urdf-loader, point clouds |
| **Architecture, construction, real estate** | understand space before it's built | BIM/IFC models, floor plans, listings | That Open (IFC), xeokit, Speckle, Gaussian splats |
| **Data & geospatial** | spatial patterns, networks, scale | analytics, GIS, map tiles | three-globe, deck.gl, 3D Tiles (NASA's renderer), Cesium |
| **Healthcare & life science** | anatomy, scans, molecules, training | DICOM, PDB, simulations | vtk.js, Cornerstone3D, three.js, WebXR |
| **Education & training** | learning by doing, safe practice | LMS, assessments | three.js/R3F, WebXR, physics |
| **Games & entertainment** | play that starts from a link | backends, multiplayer, stores | three.js/R3F, Rapier, PlayCanvas, Babylon, Needle |
| **Marketing & brand** | memorable launches, award-winning sites | CMS, campaigns | three.js/R3F, GSAP, shaders, Theatre.js |
| **AI & generative 3D** | create, explain and control 3D with models | LLMs, vision models, 3D generators | three.js + model APIs, Gaussian splats |

## Who builds this: roles and skills

| Role | Focus | Key skills from this course |
|---|---|---|
| **Creative developer** | award-winning marketing sites, interactive stories | shaders, animation, scroll, post-processing, performance |
| **3D web / product engineer** | configurators, viewers, dashboards inside real products | R3F, state management, loaders, testing, accessibility |
| **Graphics engineer** | rendering features, engines, performance | shaders, WebGPU/TSL, render targets, profiling |
| **XR developer** | VR/AR apps, training, teleoperation | WebXR, interaction, locomotion, spatial UI, performance |
| **Technical artist** | the bridge between art and code | Blender, PBR, baking, glTF pipelines, materials |
| **Robotics / simulation engineer** | visualisation and twins for robots | point clouds, URDF, transforms, real-time data |

:::tip A portfolio that gets interviews
Three or four focused, polished projects beat twenty demos: one product configurator (shows product thinking and performance), one data or twin dashboard (shows real-time data handling), one shader or scroll piece (shows craft), and, if you target XR, one WebXR experience. Show the code, measure the performance, and write up the decisions. The Project Lab gives you a starting point for each.
:::

## Check yourself

```quiz
? What do most industry 3D apps have in common beyond rendering?
+ They connect the 3D view to real data or business systems (catalogues, sensors, BIM, analytics)
- They all use VR
- They all use custom engines
> The 3D is the interface; the value comes from what it's connected to.

? Which field typically connects 3D views to ROS 2, LiDAR and MCAP logs?
+ Robotics and autonomy
- Marketing
- E-commerce
> Tools like Foxglove render this data with three.js.

? Which role focuses on award-winning marketing sites with shaders and scroll animation?
+ Creative developer
- Robotics engineer
- Graphics engineer
> Craft, motion and performance on campaign sites.

? Why do retailers invest in 3D configurators?
+ Fewer returns, higher conversion, every variant without photographing it
- Because 3D loads faster than images
- Search engines require it
> Configurable products are expensive to photograph in every combination.
```

:::keypoints
- The same three.js/R3F/WebXR skills apply across e-commerce, automotive, manufacturing, robotics, AEC, data, health, education, games, marketing and AI.
- Industries differ in **why** they use 3D and **what** the 3D view connects to.
- Roles: creative developer, 3D product engineer, graphics engineer, XR developer, technical artist, robotics/simulation engineer.
- Build a small, focused portfolio aligned to the field you want; the next lessons go deep into each field.
:::
