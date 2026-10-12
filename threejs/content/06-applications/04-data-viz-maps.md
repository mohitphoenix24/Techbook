---
title: Data Visualisation, Globes & Geospatial 3D
level: intermediate
time: 40
summary: When a third dimension helps data and when it hurts, a 3D embedding explorer for AI vectors with hover and filtering, a 3D bar chart with proper axes and tooltips, globes and flight arcs, network graphs, and the geospatial stack (3D Tiles, Google Photorealistic Tiles, Cesium, deck.gl, MapLibre) for city- and planet-scale data.
---

3D data visualisation has a mixed reputation, earned by spinning 3D pie charts. Used well, though, it shows things flat charts can't: the shape of a cloud of AI embeddings, traffic flowing between cities on a globe, how a building's sensors relate to its floors, the terrain under a pipeline. The skill is knowing when the extra dimension carries information and when it's decoration.

## When 3D helps, and when it hurts

| 3D helps when… | 3D hurts when… |
|---|---|
| the data **is spatial** (buildings, terrain, factories, bodies, planets) | comparing exact values (perspective distorts bar heights) |
| there are **three real dimensions** to explore (embeddings, 3D point clouds) | categories could be a flat bar chart |
| **relationships** are the point (networks, flows between places) | the user can't rotate (a static image of a 3D chart) |
| users **explore** rather than read off a number | occlusion hides important data |
| spatial context aids memory (a twin, a campus map) | it's decoration ("3D because we can") |

Mitigations when you do use 3D: let users rotate and reset, add hover tooltips with exact values, use a grid and axis labels, offer a 2D view, and avoid perspective for comparisons (orthographic cameras).

## Exploring AI embeddings in 3D

Language models and image models turn text and images into **embedding vectors** with hundreds of dimensions. Projected to 3D (with UMAP, t-SNE or PCA), similar items cluster together, and a 3D scatter plot lets you fly through those clusters to spot mislabelled data, outliers and topics. This explorer simulates five clusters of document embeddings; hover a point to read it, click a legend entry to filter:

```jsx run title="3D embedding explorer (instanced, hover, filter)" level=intermediate height=520
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";

// pretend output of UMAP on document embeddings: 5 topics, 2,500 points
const TOPICS = [
  { name: "Robotics", color: "#f97316", centre: [2, 1, 0] },
  { name: "Finance", color: "#22c55e", centre: [-2, 0.5, 1] },
  { name: "Medicine", color: "#3b82f6", centre: [0, -1.5, -1.5] },
  { name: "Sports", color: "#e879f9", centre: [-1, 2, -2] },
  { name: "Cooking", color: "#facc15", centre: [1.5, -1, 2] },
];
const WORDS = { Robotics: ["gripper", "kinematics", "LiDAR", "ROS 2", "actuator"], Finance: ["bond yield", "IPO", "hedging", "ledger", "inflation"],
  Medicine: ["MRI", "dosage", "biopsy", "vaccine", "cardiology"], Sports: ["offside", "marathon", "transfer", "playoff", "sprint"], Cooking: ["sourdough", "braise", "umami", "tempering", "risotto"] };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const POINTS = Array.from({ length: 2500 }, (_, i) => {
  const t = TOPICS[i % TOPICS.length];
  const words = WORDS[t.name];
  return {
    topic: t.name, color: new THREE.Color(t.color),
    pos: new THREE.Vector3(t.centre[0] + gauss() * 0.55, t.centre[1] + gauss() * 0.55, t.centre[2] + gauss() * 0.55),
    text: `Doc #${i}: "...${words[i % 5]} and ${words[(i * 7) % 5]}..."`,
  };
});

function Cloud({ visible, onHover }) {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    POINTS.forEach((p, i) => {
      dummy.position.copy(p.pos);
      dummy.scale.setScalar(visible[p.topic] ? 1 : 0);       // hidden topics shrink to nothing
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, p.color);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
  }, [visible, dummy]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, POINTS.length]}
      onPointerMove={(e) => { e.stopPropagation(); onHover(e.instanceId); }} onPointerOut={() => onHover(null)}>
      <sphereGeometry args={[0.035, 8, 6]} />
      <meshStandardMaterial roughness={0.4} />
    </instancedMesh>
  );
}

export default function App() {
  const [visible, setVisible] = useState(Object.fromEntries(TOPICS.map((t) => [t.name, true])));
  const [hover, setHover] = useState(null);
  const p = hover != null ? POINTS[hover] : null;
  return (
    <>
      <div className="overlay">
        <b>Topics</b>
        {TOPICS.map((t) => (
          <label key={t.name}><input type="checkbox" checked={visible[t.name]} onChange={() => setVisible((v) => ({ ...v, [t.name]: !v[t.name] }))} />
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: t.color }} /> {t.name}</label>
        ))}
        <span className="muted">{POINTS.length.toLocaleString()} documents · 1 draw call</span>
      </div>
      <Canvas camera={{ position: [6, 4, 7], fov: 45 }}>
        <color attach="background" args={["#020617"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 4]} intensity={1.5} />
        <Cloud visible={visible} onHover={setHover} />
        {p && (
          <Html position={p.pos} center style={{ pointerEvents: "none" }}>
            <div className="label3d" style={{ transform: "translateY(-24px)" }}><b>{p.topic}</b> · {p.text}</div>
          </Html>
        )}
        <axesHelper args={[1.5]} />
        <OrbitControls autoRotate={hover == null} autoRotateSpeed={0.4} />
      </Canvas>
    </>
  );
}
```

In a real tool, the points come from your vector database (with a UMAP projection computed in Python or with `umap-js`), clicking a point opens the source document, and colours can switch between topic, label, model confidence or "flagged by reviewers". Teams use exactly this to audit training data and retrieval systems (RAG).

## A 3D bar chart done properly

When the data is a grid (region × month, floor × zone), 3D bars can work, **if** there's a grid, labels and exact values on hover:

```jsx run title="Sales by region and month, with axes and tooltips" level=intermediate
import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, Html, Grid } from "@react-three/drei";

const REGIONS = ["North", "South", "East", "West", "Central"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export default function App() {
  const data = useMemo(() => REGIONS.map((_, r) => MONTHS.map((_, m) => Math.round(40 + 60 * Math.abs(Math.sin(r * 1.7 + m * 0.6)) + m * 8))), []);
  const max = Math.max(...data.flat());
  const [hover, setHover] = useState(null);
  return (
    <Canvas camera={{ position: [7, 6, 8], fov: 40 }}>
      <color attach="background" args={["#f8fafc"]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 8, 5]} intensity={1.5} />
      <group position={[-(MONTHS.length - 1) / 2, 0, -(REGIONS.length - 1) / 2]}>
        {data.map((row, r) => row.map((v, m) => {
          const h = (v / max) * 3, isHover = hover?.r === r && hover?.m === m;
          return (
            <mesh key={`${r}-${m}`} position={[m, h / 2, r]}
              onPointerOver={(e) => { e.stopPropagation(); setHover({ r, m, v }); }} onPointerOut={() => setHover(null)}>
              <boxGeometry args={[0.6, h, 0.6]} />
              <meshStandardMaterial color={isHover ? "#f97316" : `hsl(${200 + r * 25}, 60%, ${45 + m * 4}%)`} />
            </mesh>
          );
        }))}
        {MONTHS.map((name, m) => <Text key={name} position={[m, 0.01, REGIONS.length]} rotation-x={-Math.PI / 2} fontSize={0.28} color="#334155">{name}</Text>)}
        {REGIONS.map((name, r) => <Text key={name} position={[-1.1, 0.01, r]} rotation-x={-Math.PI / 2} fontSize={0.28} color="#334155" anchorX="right">{name}</Text>)}
        {hover && (
          <Html position={[hover.m, (hover.v / max) * 3 + 0.4, hover.r]} center>
            <div className="label3d"><b>{REGIONS[hover.r]}, {MONTHS[hover.m]}</b>: {hover.v}k units</div>
          </Html>
        )}
      </group>
      <Grid args={[10, 10]} cellColor="#e2e8f0" sectionColor="#cbd5e1" position-y={0.001} />
      <OrbitControls maxPolarAngle={1.4} />
    </Canvas>
  );
}
```

## Globes, arcs and networks

| Need | Library / technique |
|---|---|
| data on a globe: points, arcs, hexbins, choropleths | **globe.gl / three-globe** (three.js-based), or hand-rolled as in Module 2's flight-arcs example |
| network / knowledge graphs in 3D | **3d-force-graph** (three.js + d3-force-3d), or instanced spheres + Line2 edges |
| flows and trajectories | animated `TubeGeometry` draw ranges, particles along curves |
| big tabular data (millions of points) | instancing, `THREE.Points`, GPU picking; **deck.gl** for map-centric analytics |

## City- and planet-scale geospatial

Real-world maps are too big to load at once. **3D Tiles** (an OGC standard) streams city models, terrain, photogrammetry and point clouds as a hierarchy of tiles, loading only what the camera needs at the detail it needs.

| Tool | What it is |
|---|---|
| **3DTilesRendererJS** (NASA-AMMOS) | a 3D Tiles renderer for three.js and R3F, used on NASA's Mars rover missions; streams Cesium Ion tilesets, **Google Photorealistic 3D Tiles**, quantized-mesh terrain, Potree point clouds, map tiles and GeoJSON overlays |
| **three-geospatial** (Takram) | atmosphere, clouds and sky for realistic planet-scale three.js scenes |
| **CesiumJS** | a complete geospatial engine (its own renderer) for globes and terrain |
| **deck.gl** | GPU data layers (arcs, hexagons, point clouds) over web maps |
| **MapLibre GL / Mapbox GL** | vector maps; custom three.js layers can render inside the map's camera |
| **Giro3D** | heterogeneous GIS data in 2D, 2.5D and 3D |

```jsx
// R3F: stream Google's photorealistic city tiles (needs a Google Maps API key)
import { TilesRenderer, TilesPlugin, GlobeControls } from "3d-tiles-renderer/r3f";
import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/plugins";

<Canvas camera={{ near: 1, far: 1e8 }}>
  <TilesRenderer>
    <TilesPlugin plugin={GoogleCloudAuthPlugin} args={{ apiToken: GOOGLE_KEY }} />
    <GlobeControls />
  </TilesRenderer>
</Canvas>
```

:::warn Precision at planet scale
GPU floats have about 7 significant digits. Placing objects at Earth-scale coordinates (millions of metres) makes them jitter. Geospatial libraries render **relative to the camera** or re-centre the world near the area of interest; when building your own, keep coordinates local (metres from a site origin) and convert from latitude/longitude with a proper projection.
:::

:::ai
Embedding explorers are one of the most practical 3D tools for AI teams: auditing a RAG corpus, spotting near-duplicate training data, checking how a fine-tuned model separates classes, or visualising an agent's memory. Combine the projection with metadata (source, date, label, model score) in colour, size and filters, and link each point back to the raw item.
:::

## Check yourself

```quiz
? When is a 3D bar chart a poor choice?
+ When users need to compare exact values and can't rotate or hover
- When data has three real spatial dimensions
- When showing a building's floors
> Perspective distorts heights; add tooltips and a 2D option if you use one.

? Why project embeddings with UMAP or t-SNE before plotting?
+ They reduce hundreds of dimensions to 3 while keeping similar items close together
- To make the vectors smaller on disk
- three.js can't draw vectors
> The projection preserves neighbourhoods so clusters are visible.

? What does 3D Tiles provide?
+ Streaming of huge 3D datasets (cities, terrain, point clouds) in a level-of-detail hierarchy
- A tiled texture format
- A UI layout system
> Only tiles the camera needs are loaded.

? Why do planet-scale scenes jitter if you use raw Earth coordinates?
+ 32-bit floats lack precision at millions of metres
- WebGL limits scene size
- The camera's far plane is too small
> Keep coordinates local or render relative to the camera.

? How do you keep 2,500 hoverable points fast?
+ One InstancedMesh with instanceId for hover
- 2,500 separate meshes with their own handlers
- 2,500 HTML elements
> One draw call, one raycast target.
```

:::keypoints
- Use 3D when data is spatial, three-dimensional or relational, and support it with rotation, hover values, grids and a 2D fallback.
- **Embedding explorers** (UMAP/t-SNE → instanced points) are a high-value AI tool.
- Grid charts need axes, labels and tooltips; globes and networks have mature three.js libraries (globe.gl, 3d-force-graph).
- Geospatial at scale streams **3D Tiles** (3DTilesRendererJS, Google Photorealistic Tiles, Cesium) and must handle float precision.
:::
