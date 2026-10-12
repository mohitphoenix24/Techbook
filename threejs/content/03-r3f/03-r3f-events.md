---
title: Pointer Events in R3F
level: intermediate
time: 30
summary: R3F's built-in raycasting events, the event object (point, distance, uv, instanceId, delta), bubbling and occlusion with stopPropagation, pointer capture for dragging, onPointerMissed for deselection, cursors, picking instances, and keeping events fast.
---

In plain three.js you wrote a raycaster, converted mouse coordinates, tracked hover state and ignored drags yourself (Module 1). R3F has all of that built in: any object with an `onClick` or `onPointerOver` prop becomes interactive, and the same handlers work with mouse, touch, pen, and (with `@react-three/xr`) VR controllers and hands.

## The event props

| Prop | Fires when |
|---|---|
| `onClick`, `onDoubleClick`, `onContextMenu` | a click / double click / right-click lands on the object (not after a drag) |
| `onPointerDown`, `onPointerUp` | a button presses or releases over it |
| `onPointerOver`, `onPointerOut` | the pointer enters / leaves the object **or its children** |
| `onPointerEnter`, `onPointerLeave` | enters / leaves the object itself (no bubbling) |
| `onPointerMove` | the pointer moves over it |
| `onWheel` | the wheel scrolls over it |
| `onPointerMissed` | a click hit **nothing** (on an object: the click missed it; on Canvas: missed everything) |

## The event object

Every handler receives a `ThreeEvent`: the DOM pointer event **plus** the raycast result.

| Field | Meaning |
|---|---|
| `e.object` | the mesh that was actually hit |
| `e.eventObject` | the object whose handler is running (differs while bubbling up through groups) |
| `e.point` | world position of the hit (`Vector3`) |
| `e.distance` | distance from the camera |
| `e.face`, `e.faceIndex`, `e.uv` | the triangle and texture coordinate hit |
| `e.instanceId` | which instance of an `InstancedMesh` |
| `e.intersections` | every object under the pointer, nearest first |
| `e.delta` | pixels the pointer moved between down and up (tells clicks from drags) |
| `e.stopPropagation()` | stop bubbling **and** block objects behind this one |
| `e.nativeEvent` | the original DOM event (`shiftKey`, `button`…) |

## Bubbling and occlusion

Events **bubble** from the hit mesh up through its parents, like DOM events. And unlike the DOM, a pointer ray can pass through several objects: without `stopPropagation`, an object **behind** the front one also receives the event. Try it with the checkbox:

```jsx run title="Bubbling, occlusion and stopPropagation" level=intermediate
import { useState } from "react";
import { Canvas } from "@react-three/fiber";

export default function App() {
  const [log, setLog] = useState([]);
  const [stop, setStop] = useState(true);
  const push = (msg) => setLog((l) => [msg, ...l].slice(0, 7));

  return (
    <>
      <div className="overlay">
        <label><input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} /> stopPropagation on the front box</label>
        {log.map((l, i) => <code key={i} style={{ opacity: 1 - i * 0.12 }}>{l}</code>)}
      </div>
      <Canvas camera={{ position: [2.5, 1.5, 4] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 3]} intensity={2} />
        <group onClick={(e) => push(`group heard a click on "${e.object.name}"`)}>
          <mesh name="front" position={[0, 0, 1]} onClick={(e) => { if (stop) e.stopPropagation(); push("front box clicked"); }}>
            <boxGeometry args={[1, 1, 0.3]} />
            <meshStandardMaterial color="#34d399" transparent opacity={0.85} />
          </mesh>
          <mesh name="back" position={[0, 0, -0.5]} onClick={(e) => push("back box clicked (behind!)")}>
            <boxGeometry args={[1.6, 1.6, 0.3]} />
            <meshStandardMaterial color="#818cf8" />
          </mesh>
        </group>
      </Canvas>
    </>
  );
}
```

Click the green box with the checkbox off: the back box and the group both hear it, because the ray continues through. That's occasionally useful (x-ray tools), but in most apps you want **only the front-most object** to react, so call `e.stopPropagation()` in handlers.

## Hover with a cursor

drei's `useCursor(hovered)` switches the CSS cursor to a pointer while true, which is a small detail users notice.

```jsx run title="Hover highlights, cursor and deselect on miss" level=easy
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useCursor, OrbitControls } from "@react-three/drei";

function Part({ id, position, selected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  return (
    <mesh
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); onSelect(id); }}
      scale={hovered ? 1.08 : 1}
    >
      <cylinderGeometry args={[0.45, 0.45, 1.2, 32]} />
      <meshStandardMaterial color={selected ? "#f59e0b" : hovered ? "#94a3b8" : "#64748b"} />
    </mesh>
  );
}

export default function App() {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <div className="overlay"><span>Selected: <b>{selected ?? "nothing"}</b></span><span className="muted">click empty space to deselect</span></div>
      <Canvas camera={{ position: [0, 3, 6] }} onPointerMissed={() => setSelected(null)}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 2]} intensity={2} />
        {["Tank A", "Tank B", "Tank C", "Tank D"].map((id, i) => (
          <Part key={id} id={id} position={[(i - 1.5) * 1.3, 0.6, 0]} selected={selected === id} onSelect={setSelected} />
        ))}
        <gridHelper args={[8, 8]} />
        <OrbitControls />
      </Canvas>
    </>
  );
}
```

Orbit by dragging: R3F doesn't fire `onClick` after a drag (it checks `e.delta`), so orbiting never selects anything by accident, a bug you had to handle yourself in plain three.js.

## Dragging with pointer capture

Dragging needs every move event even when the pointer slips off the object. **Pointer capture** routes all of the pointer's events to the capturing object until release. Combine it with a ray–plane intersection to slide objects across the floor:

```jsx run title="Drag objects across the floor" level=intermediate
import { useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

function Draggable({ start, color, onDragChange }) {
  const ref = useRef();
  const offset = useRef(new THREE.Vector3());
  const [dragging, setDragging] = useState(false);
  return (
    <mesh
      ref={ref}
      position={start}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.target.setPointerCapture(e.pointerId);              // keep receiving events while dragging
        e.ray.intersectPlane(floor, hit);
        offset.current.subVectors(ref.current.position, hit);
        setDragging(true); onDragChange(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        e.ray.intersectPlane(floor, hit);                     // e.ray: the pointer's ray in world space
        ref.current.position.x = hit.x + offset.current.x;
        ref.current.position.z = hit.z + offset.current.z;
      }}
      onPointerUp={(e) => {
        e.target.releasePointerCapture(e.pointerId);
        setDragging(false); onDragChange(false);
      }}
    >
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial color={dragging ? "#ffffff" : color} />
    </mesh>
  );
}

export default function App() {
  const [dragging, setDragging] = useState(false);
  return (
    <Canvas camera={{ position: [0, 6, 7] }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={2} />
      {["#ef4444", "#22c55e", "#3b82f6"].map((c, i) => (
        <Draggable key={c} start={[(i - 1) * 1.6, 0.4, 0]} color={c} onDragChange={setDragging} />
      ))}
      <gridHelper args={[10, 10]} />
      <OrbitControls enabled={!dragging} />                   {/* don't orbit while dragging */}
    </Canvas>
  );
}
```

For production, `@react-three/handle` (from the pmndrs XR team) and drei's `<DragControls>` and `<PivotControls>` provide complete drag, rotate and scale interactions that also work with VR controllers.

## Picking instances and placing objects

Events on an `<instancedMesh>` report `e.instanceId`, and a click on a floor gives `e.point`. Together they cover heat maps, seat pickers, inventory grids and "click to build":

```jsx run title="Instance hover + click-to-place" level=intermediate
import { useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";

const N = 12, dummy = new THREE.Object3D(), color = new THREE.Color();
const values = Array.from({ length: N * N }, () => Math.random());      // e.g. occupancy per parking bay

function Grid() {
  const ref = useRef();
  const [hover, setHover] = useState(null);
  useLayoutEffect(() => {
    values.forEach((v, i) => {
      dummy.position.set((i % N) - N / 2 + 0.5, v / 2, Math.floor(i / N) - N / 2 + 0.5);
      dummy.scale.set(0.85, v + 0.05, 0.85);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, color.setHSL(0.33 - v * 0.33, 0.7, 0.5));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
  }, []);
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, N * N]}
        onPointerMove={(e) => { e.stopPropagation(); setHover(e.instanceId); }}
        onPointerOut={() => setHover(null)}>
        <boxGeometry />
        <meshStandardMaterial />
      </instancedMesh>
      {hover !== null && (
        <Html position={[(hover % N) - N / 2 + 0.5, values[hover] + 0.4, Math.floor(hover / N) - N / 2 + 0.5]} center>
          <div className="label3d">Bay {hover + 1}: {Math.round(values[hover] * 100)}%</div>
        </Html>
      )}
    </>
  );
}

function Placer() {
  const [pins, setPins] = useState([]);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} onDoubleClick={(e) => setPins((p) => [...p, e.point.clone()])}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {pins.map((p, i) => (
        <mesh key={i} position={[p.x, 1.2, p.z]}>
          <coneGeometry args={[0.2, 0.6, 16]} />
          <meshStandardMaterial color="#f472b6" />
        </mesh>
      ))}
    </>
  );
}

export default function App() {
  return (
    <>
      <div className="overlay">Hover a bay · double-click the floor outside the grid to drop a pin</div>
      <Canvas camera={{ position: [0, 11, 12], fov: 45 }}>
        <color attach="background" args={["#0f172a"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={2} />
        <Grid />
        <Placer />
        <OrbitControls />
      </Canvas>
    </>
  );
}
```

## Keeping events fast

R3F raycasts against every object that has an event handler, on every pointer move. With detailed models that adds up:

| Technique | How |
|---|---|
| fewer interactive objects | put handlers on a parent group, or on one `instancedMesh` |
| cheap hit tests | `raycast={meshBounds}` (from drei) tests the bounding sphere instead of triangles |
| invisible proxies | a simple invisible box with the handlers around a detailed model |
| BVH acceleration | drei's `<Bvh>` wraps children with three-mesh-bvh for much faster raycasts on big meshes |
| stop early | `e.stopPropagation()` so objects behind aren't processed |
| `pointerEvents="none"`-style | omit handlers on decorative objects entirely |

## Check yourself

```quiz
? What does `e.stopPropagation()` do in R3F?
+ Stops bubbling to parents and prevents objects behind from receiving the event
- Prevents the browser's default action only
- Cancels the click after a drag
> Without it, the ray's later hits also get the event.

? How do you deselect when the user clicks empty space?
+ onPointerMissed on the Canvas
- onClick on the scene
- onPointerOut on every mesh
> It fires when a click hits no object.

? Which field tells you which instance of an InstancedMesh was hit?
- e.object
+ e.instanceId
- e.face
> Map it back to your data array.

? Why use pointer capture when dragging?
+ To keep receiving move events even when the pointer leaves the object
- To make the object transparent
- To disable OrbitControls automatically
> Fast drags often outrun the object.

? Why doesn't R3F fire onClick after an orbit drag?
+ It compares the pointer movement (e.delta) and ignores clicks that moved too far
- OrbitControls cancels all events
- Clicks only work on double-click
> A built-in click-vs-drag check.
```

:::exercise Multi-select with Shift
Change the "Tank" example so that **Shift-click** adds or removes a tank from a selection set (`e.nativeEvent.shiftKey`), while a plain click selects only that tank. Show the selected names in the overlay.
:::

:::solution
```jsx run
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";

function Tank({ id, x, selected, onPick }) {
  const [hover, setHover] = useState(false);
  useCursor(hover);
  return (
    <mesh position={[x, 0.6, 0]} onPointerOver={(e) => { e.stopPropagation(); setHover(true); }} onPointerOut={() => setHover(false)}
      onClick={(e) => { e.stopPropagation(); onPick(id, e.nativeEvent.shiftKey); }}>
      <cylinderGeometry args={[0.45, 0.45, 1.2, 32]} />
      <meshStandardMaterial color={selected ? "#f59e0b" : hover ? "#94a3b8" : "#64748b"} />
    </mesh>
  );
}

export default function App() {
  const [sel, setSel] = useState(new Set());
  const pick = (id, add) => setSel((prev) => {
    if (!add) return new Set([id]);
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  return (
    <>
      <div className="overlay"><span>Selected: <b>{[...sel].join(", ") || "none"}</b></span><span className="muted">Shift-click to add/remove</span></div>
      <Canvas camera={{ position: [0, 3, 6] }} onPointerMissed={() => setSel(new Set())}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 2]} intensity={2} />
        {["A", "B", "C", "D"].map((id, i) => <Tank key={id} id={id} x={(i - 1.5) * 1.3} selected={sel.has(id)} onPick={pick} />)}
      </Canvas>
    </>
  );
}
```
:::

:::keypoints
- Add `onClick`, `onPointerOver`, `onPointerMove`… to any object; R3F raycasts for you, for mouse, touch and XR.
- The event has `object`, `point`, `distance`, `uv`, `instanceId`, `ray`, `delta` and the native event.
- Events **bubble** to parents and pass **through** to objects behind: call `e.stopPropagation()`.
- `onPointerMissed` deselects; `useCursor` shows a pointer; clicks after drags are ignored automatically.
- Drag with **pointer capture** + `e.ray.intersectPlane`; disable orbit controls meanwhile.
- Keep events fast with fewer handlers, `meshBounds`, proxies or `<Bvh>`.
:::
