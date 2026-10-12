---
title: Models in R3F — useGLTF, gltfjsx & Animations
level: intermediate
time: 40
summary: Loading glTF with useGLTF and Suspense, loading screens with useProgress, turning models into editable JSX with gltfjsx, swapping materials and colours per part, glTF material variants, playing clips with useAnimations, many copies with Clone, and preloading.
---

In plain three.js a loaded model is a black box you `traverse`. In R3F it can become a **component tree** you edit like any React code: change one part's material with a prop, hide a component based on state, attach an `onClick` to the left door. This lesson covers both styles and when to use each.

## useGLTF + Suspense

drei's `useGLTF(url)` wraps `GLTFLoader` with Draco and Meshopt decoders pre-configured, caches by URL, and suspends while loading. The quickest way to show a model is `<primitive object={scene} />`:

```jsx run title="useGLTF, a loading screen and <primitive>" level=intermediate
import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useProgress, OrbitControls, Environment, Center } from "@react-three/drei";

const URL = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf";

function Helmet() {
  const { scene } = useGLTF(URL);                       // suspends until loaded, cached afterwards
  return <primitive object={scene} />;
}

// A normal DOM overlay OUTSIDE the Canvas: useProgress is a global store, so it works anywhere
function LoadingScreen() {
  const { active, progress, item } = useProgress();
  if (!active) return null;
  return (
    <div className="overlay" style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 220 }}>
      <b>Loading {progress.toFixed(0)}%</b>
      <div style={{ height: 6, background: "var(--border)", borderRadius: 3 }}>
        <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)", borderRadius: 3, transition: "width .2s" }} />
      </div>
      <small className="muted">{item.split("/").pop()}</small>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Canvas camera={{ position: [0, 0, 4], fov: 40 }}>
        <color attach="background" args={["#1e293b"]} />
        <Suspense fallback={null}>
          <Center><Helmet /></Center>                  {/* Center: move the model's bounding-box centre to the origin */}
          <Environment preset="city" />
        </Suspense>
        <OrbitControls autoRotate autoRotateSpeed={0.8} />
      </Canvas>
      <LoadingScreen />
    </>
  );
}

useGLTF.preload(URL);                                   // start the download as soon as this module loads
```

:::tip Loading screens belong outside the Canvas
A DOM overlay driven by `useProgress` (or drei's ready-made `<Loader />`) is more robust than 3D content inside a `Suspense` fallback, it can cover the whole page, and it shows up even before the WebGL context exists. Inside the Canvas, keep fallbacks simple: `null`, or a lightweight placeholder mesh.
:::

:::warn `<primitive>` doesn't clone
`<primitive object={scene} />` inserts **the same object** every time. Render two `<Helmet />`s and the model jumps between them, because one object can only have one parent. For multiple copies use drei's `<Clone object={scene} />` (which also handles skinned characters correctly) or the gltfjsx approach below.
:::

## gltfjsx: models as JSX

:::def gltfjsx
A command-line tool from pmndrs that reads a glTF file and **generates a React component** that rebuilds it declaratively: one `<mesh>` per part with its geometry and material, inside `<group>`s that keep the hierarchy. With `--transform` it also optimises the file (Draco/Meshopt, texture resize, WebP) in the same step.
:::

```bash
npx gltfjsx public/shoe.glb --transform --types     # → Shoe.tsx + shoe-transformed.glb
```

The generated component looks like this, and from then on it's **your code**:

```jsx
export function Shoe(props) {
  const { nodes, materials } = useGLTF("/shoe-transformed.glb");
  return (
    <group {...props} dispose={null}>
      <mesh geometry={nodes.laces.geometry} material={materials.laces} />
      <mesh geometry={nodes.sole.geometry} material={materials.sole} />
      <mesh geometry={nodes.upper.geometry} material={materials.upper} />
    </group>
  );
}
useGLTF.preload("/shoe-transformed.glb");
```

`nodes` maps each object's **name** to the object, and `materials` maps material names to materials. gltfjsx also reproduces every node's `position`, `rotation` and `scale`, **including parent groups**; if you build components by hand from `nodes.X.geometry`, keep those transforms too, or parts appear at the wrong size and place. The example below does it explicitly: this shoe's root node scales everything by 0.149. Now each part is an ordinary element you can give props, state and events. A colour-per-part configurator becomes trivial:

```jsx run title="Per-part materials from a gltfjsx-style component" level=intermediate
import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment, ContactShadows, useCursor } from "@react-three/drei";

const URL = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/MaterialsVariantsShoe/glTF/MaterialsVariantsShoe.gltf";

function Shoe({ tint, onPick }) {
  const { nodes, materials } = useGLTF(URL);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const base = materials[Object.keys(materials)[0]];          // the shoe's original material
  return (
    <group dispose={null} scale={8} position-y={-0.6}>
      {/* the file's root node "Shoe.obj" (named Shoeobj after sanitising) carries a scale and offset: keep it, like gltfjsx does */}
      <group position={nodes.Shoeobj.position} scale={nodes.Shoeobj.scale}>
        <mesh
          geometry={nodes.Shoe.geometry}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={() => setHovered(false)}
          onClick={(e) => { e.stopPropagation(); onPick(e.point); }}
        >
          {/* reuse the original textures, override what the user configures */}
          <meshStandardMaterial map={base.map} normalMap={base.normalMap} roughnessMap={base.roughnessMap}
            color={tint} roughness={1} emissive={hovered ? "#ffffff" : "#000000"} emissiveIntensity={0.06} />
        </mesh>
      </group>
    </group>
  );
}

const TINTS = { Original: "#ffffff", Coral: "#fb7185", Mint: "#6ee7b7", Sky: "#7dd3fc", Graphite: "#64748b" };

export default function App() {
  const [tint, setTint] = useState("#ffffff");
  const [last, setLast] = useState(null);
  return (
    <>
      <div className="overlay">
        <div className="row">{Object.entries(TINTS).map(([name, c]) => <button key={name} className={tint === c ? "on" : ""} onClick={() => setTint(c)}>{name}</button>)}</div>
        {last && <span className="muted">clicked at ({last.x.toFixed(2)}, {last.y.toFixed(2)}, {last.z.toFixed(2)})</span>}
      </div>
      <Canvas camera={{ position: [0.9, 0.7, 2.8], fov: 40 }}>
        <color attach="background" args={["#f1f5f9"]} />
        <Suspense fallback={null}>
          <Shoe tint={tint} onPick={setLast} />
          <Environment preset="city" />
        </Suspense>
        <ContactShadows position-y={-0.6} opacity={0.5} blur={2} scale={3} />
        <OrbitControls target={[0, 0, 0]} minDistance={1} maxDistance={4} />
      </Canvas>
    </>
  );
}
```

Choosing between the styles:

| `<primitive object={scene} />` | gltfjsx components |
|---|---|
| zero setup, any model, including user uploads | needs a build step per model |
| edit by traversing (`scene.traverse`) | edit by changing JSX and props |
| one instance (or `<Clone>`) | reusable component, many instances |
| good for viewers and CMS-driven content | good for configurators and hand-crafted scenes |

## glTF material variants

Some models ship several complete looks inside one file via the `KHR_materials_variants` extension (shoes in different colourways, furniture in different fabrics). The variants share geometry, so switching is instant and the file stays small. This model has three:

```jsx run title="Switching KHR_materials_variants" level=advanced
import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment, ContactShadows } from "@react-three/drei";

const URL = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/MaterialsVariantsShoe/glTF/MaterialsVariantsShoe.gltf";

// Swap every mesh's material to the one mapped to `name` (or back to the original)
async function selectVariant(gltf, name) {
  const variants = gltf.userData.gltfExtensions.KHR_materials_variants.variants.map((v) => v.name);
  const index = variants.indexOf(name);
  const jobs = [];
  gltf.scene.traverse((o) => {
    const ext = o.isMesh && o.userData.gltfExtensions?.KHR_materials_variants;
    if (!ext) return;
    o.userData.originalMaterial ??= o.material;
    const mapping = ext.mappings.find((m) => m.variants.includes(index));
    jobs.push(mapping
      ? gltf.parser.getDependency("material", mapping.material).then((mat) => { o.material = mat; gltf.parser.assignFinalMaterial(o); })
      : Promise.resolve((o.material = o.userData.originalMaterial)));
  });
  await Promise.all(jobs);
}

function Shoe({ variant, onVariants }) {
  const gltf = useGLTF(URL);
  useEffect(() => onVariants(gltf.userData.gltfExtensions.KHR_materials_variants.variants.map((v) => v.name)), [gltf]);
  useEffect(() => { if (variant) selectVariant(gltf, variant); }, [gltf, variant]);
  return <primitive object={gltf.scene} scale={8} position-y={-0.6} />;
}

export default function App() {
  const [variants, setVariants] = useState([]);
  const [variant, setVariant] = useState(null);
  return (
    <>
      <div className="overlay"><b>Variants in the file</b><div className="row">{variants.map((v) => <button key={v} className={v === variant ? "on" : ""} onClick={() => setVariant(v)}>{v}</button>)}</div></div>
      <Canvas camera={{ position: [0.9, 0.7, 2.8], fov: 40 }}>
        <color attach="background" args={["#f8fafc"]} />
        <Suspense fallback={null}>
          <Shoe variant={variant} onVariants={setVariants} />
          <Environment preset="city" />
        </Suspense>
        <ContactShadows position-y={-0.6} opacity={0.5} blur={2} scale={3} />
        <OrbitControls autoRotate />
      </Canvas>
    </>
  );
}
```

## Animations: useAnimations

drei's `useAnimations(clips, root)` creates the mixer, updates it every frame, and returns `actions` keyed by clip name. And `<Clone>` makes independent copies of a skinned character, so a whole crowd can come from one file:

```jsx run title="useAnimations + Clone: a team of robots" level=intermediate
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const URL = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/RobotExpressive/RobotExpressive.glb";

function Robot({ position, clip }) {
  const { scene, animations } = useGLTF(URL);
  const copy = useMemo(() => SkeletonUtils.clone(scene), [scene]);   // own skeleton per robot
  const ref = useRef();
  const { actions } = useAnimations(animations, ref);                 // mixer updated for you
  useEffect(() => {
    actions[clip]?.reset().fadeIn(0.4).play();
    return () => actions[clip]?.fadeOut(0.4);                          // fade out when the clip changes
  }, [clip, actions]);
  return <primitive ref={ref} object={copy} position={position} scale={0.4} />;
}

const CLIPS = ["Idle", "Walking", "Dance", "Wave", "ThumbsUp"];

export default function App() {
  const [clips, setClips] = useState(["Idle", "Dance", "Wave"]);
  return (
    <>
      <div className="overlay">
        {clips.map((c, i) => (
          <label key={i}>Robot {i + 1}
            <select value={c} onChange={(e) => setClips((l) => l.map((x, j) => (j === i ? e.target.value : x)))}>
              {CLIPS.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        ))}
      </div>
      <Canvas camera={{ position: [0, 1.6, 5], fov: 45 }}>
        <color attach="background" args={["#e0f2fe"]} />
        <Suspense fallback={null}>
          {clips.map((c, i) => <Robot key={i} position={[(i - 1) * 1.5, 0, 0]} clip={c} />)}
          <Environment preset="park" />
        </Suspense>
        <ContactShadows opacity={0.4} blur={2} scale={8} />
        <OrbitControls target={[0, 0.9, 0]} />
      </Canvas>
    </>
  );
}
```

`<Clone object={scene} />` is the drop-in alternative when you don't need per-copy animation control; here each robot needs its own mixer bound to its own skeleton, so it clones with `SkeletonUtils` directly.

## Preloading and code splitting

- `useGLTF.preload(url)` at module level starts downloads before the component renders, removing the "pop-in" delay.
- Put large models behind `React.lazy` routes so they don't download on pages that don't show them.
- Nested `<Suspense>` boundaries let the scene appear progressively: environment and floor first, hero model second, details last.
- drei's `<Preload all />` compiles every material in the scene up front (like `renderer.compileAsync`), avoiding first-interaction stutter.

## Check yourself

```quiz
? What does useGLTF return?
+ The loaded glTF (scene, nodes, materials, animations…), suspending until ready
- A promise you must await
- A React component
> nodes and materials are maps keyed by name.

? You render <primitive object={scene} /> twice. What happens?
+ Only one shows: the same object can't have two parents
- Two copies appear
- It throws an error and crashes
> Use <Clone> or gltfjsx for copies.

? What does gltfjsx produce?
+ A React component that rebuilds the model as <mesh>/<group> JSX, optionally with an optimised file
- A compressed .glb only
- TypeScript types for three.js
> From then on, each part is editable JSX.

? What does useAnimations give you?
+ A mixer bound to your object and `actions` keyed by clip name, updated every frame
- A list of bones
- A GSAP timeline
> actions.Walk.play(), fadeIn, crossFadeTo…

? Why are glTF material variants efficient for colourways?
+ All variants share the geometry; only materials switch
- They are pre-rendered images
- They use instancing
> One download, instant switching.
```

:::exercise Click a robot to wave
In the robots example, make each robot clickable: clicking plays a one-shot `Wave` (`LoopOnce`, `clampWhenFinished`), then returns to its selected clip when the mixer fires `finished`. Hint: `useAnimations` returns `mixer` too.
:::

:::solution
```jsx run
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useAnimations, Environment, useCursor } from "@react-three/drei";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const URL = "https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/models/gltf/RobotExpressive/RobotExpressive.glb";

function Robot({ x }) {
  const { scene, animations } = useGLTF(URL);
  const copy = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const ref = useRef();
  const { actions, mixer } = useAnimations(animations, ref);
  const [hover, setHover] = useState(false);
  useCursor(hover);
  useEffect(() => {
    actions.Idle.play();
    actions.Wave.setLoop(THREE.LoopOnce, 1);
    actions.Wave.clampWhenFinished = true;
    const back = (e) => { if (e.action === actions.Wave) { actions.Idle.reset().play(); actions.Wave.crossFadeTo(actions.Idle, 0.3, false); } };
    mixer.addEventListener("finished", back);
    return () => mixer.removeEventListener("finished", back);
  }, [actions, mixer]);
  const wave = () => { actions.Wave.reset().play(); actions.Idle.crossFadeTo(actions.Wave, 0.2, false); };
  return <primitive ref={ref} object={copy} position-x={x} scale={0.4} onClick={(e) => { e.stopPropagation(); wave(); }}
    onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)} />;
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 1.6, 5], fov: 45 }}>
      <color attach="background" args={["#e0f2fe"]} />
      <Suspense fallback={null}>
        {[-1.5, 0, 1.5].map((x) => <Robot key={x} x={x} />)}
        <Environment preset="park" />
      </Suspense>
    </Canvas>
  );
}
```
:::

:::keypoints
- `useGLTF(url)` loads (with Draco/Meshopt), caches and suspends; `useProgress` drives loading screens; `useGLTF.preload` starts early.
- `<primitive>` inserts the original object once; `<Clone>` or `SkeletonUtils.clone` for copies.
- **gltfjsx** turns a model into an editable component (`nodes.X.geometry`, `materials.Y`) and can optimise the file.
- Per-part props make configurators simple; **KHR_materials_variants** ships colourways in one file.
- `useAnimations(clips, ref)` → `actions[name]` with fades and cross-fades.
:::
