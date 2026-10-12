---
title: VR Art Gallery
level: advanced
time: 70
icon: vr
cover: #b45309,#1c1917
tags: "@react-three/xr, teleport, XROrigin, spot lighting, texture colour space, 3D UI panels, guided tour, speech synthesis"
summary: A virtual museum room with eight public-domain masterpieces, each framed, spot-lit and labelled. It works on desktop and in VR. Click or point at a painting to open a 3D info panel, follow a guided tour that walks you from work to work, teleport around in VR, and listen to an audio guide read by the browser's speech synthesis.
---

Virtual galleries are one of the most popular WebXR use cases: museums extend their collections online, artists show work without renting a space, and schools take classes on trips. A good one feels calm and legible: proper lighting, readable labels, comfortable movement, and the same experience on a laptop and in a headset.

:::flow How it fits together
Collection | eight works with title, artist, year, museum, description and image URL
Room | walls, floor, ceiling; slots on the walls with a facing direction
Artwork | frame + canvas (texture with the image's aspect) + plaque + its own spotlight
Interaction | click/trigger → info panel with Listen / Next / Close buttons in 3D
Navigation | desktop: camera flights between slots; VR: move the `XROrigin`, teleport anywhere on the floor
:::

## Step 1: Hanging one painting correctly

Two details make or break a gallery. Use the image's **real aspect ratio** (read it from the loaded texture), and mark colour images as **sRGB**. Without that, three.js treats the pixel values as linear light and every painting looks washed out. Toggle it and compare:

```jsx run title="Step 1 · Aspect ratio and colour space" height=420
import { Suspense, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";

const SRC = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/960px-Tsunami_by_hokusai_19th_century.jpg";

function Painting({ srgb }) {
  const tex = useTexture(SRC);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;                                       // colour space is baked in at upload
  const aspect = tex.image.width / tex.image.height, h = 1.4, w = h * aspect;
  return (
    <group position-y={1.5}>
      <mesh position-z={-0.03}><boxGeometry args={[w + 0.14, h + 0.14, 0.05]} /><meshStandardMaterial color="#3f2d1e" /></mesh>
      <mesh><planeGeometry args={[w, h]} /><meshStandardMaterial map={tex} roughness={0.85} /></mesh>
    </group>
  );
}

export default function App() {
  const [srgb, setSrgb] = useState(true);
  return (
    <>
      <div className="overlay"><button className={srgb ? "on" : ""} onClick={() => setSrgb(!srgb)}>sRGB colour space: {srgb ? "on" : "off"}</button></div>
      <Canvas camera={{ position: [0, 1.5, 3.2], fov: 45 }}>
        <color attach="background" args={["#ece7df"]} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[1, 3, 3]} intensity={1.5} />
        <Suspense fallback={null}><Painting srgb={srgb} /></Suspense>
        <OrbitControls target={[0, 1.5, 0]} />
      </Canvas>
    </>
  );
}
```

## Step 2: The gallery

**Desktop**: click a painting or use **Next** to take the guided tour; drag to look around. **VR**: press *Enter VR*, point and pull the trigger on a painting, use the panel's buttons, or push the thumbstick forward to teleport.

```jsx run title="VR Art Gallery · complete app" level=advanced height=620
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { CameraControls, Text } from "@react-three/drei";
import { XR, createXRStore, XROrigin, TeleportTarget, IfInSessionMode, useXR } from "@react-three/xr";

const store = createXRStore({ emulate: { inject: true }, controller: { teleportPointer: true }, hand: { teleportPointer: true } });

// ---------- the collection (public-domain images from Wikimedia Commons) ----------
const WM = "https://upload.wikimedia.org/wikipedia/commons/thumb/";
const ART = [
  { title: "Wanderer above the Sea of Fog", artist: "Caspar David Friedrich", year: "c. 1818", where: "Hamburger Kunsthalle", aspect: 0.781,
    src: WM + "b/b9/Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg/960px-Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg",
    text: "A lone figure, seen from behind, faces a landscape dissolving into fog. It became the defining image of German Romanticism." },
  { title: "The Starry Night", artist: "Vincent van Gogh", year: "1889", where: "Museum of Modern Art, New York", aspect: 1.263,
    src: WM + "e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/960px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
    text: "Painted from memory of the view from his window at the asylum in Saint-Rémy: a swirling sky above a quiet village." },
  { title: "Girl with a Pearl Earring", artist: "Johannes Vermeer", year: "c. 1665", where: "Mauritshuis, The Hague", aspect: 0.844,
    src: WM + "0/0f/1665_Girl_with_a_Pearl_Earring.jpg/960px-1665_Girl_with_a_Pearl_Earring.jpg",
    text: "A study of a face rather than a portrait of a known sitter, famous for its soft light and the girl's direct gaze." },
  { title: "The Birth of Venus", artist: "Sandro Botticelli", year: "c. 1485", where: "Uffizi Gallery, Florence", aspect: 1.592,
    src: WM + "0/0b/Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg/960px-Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg",
    text: "The goddess arrives at the shore on a shell, blown in by the winds: a landmark of the Italian Renaissance." },
  { title: "The Great Wave off Kanagawa", artist: "Katsushika Hokusai", year: "c. 1831", where: "Woodblock print, many collections", aspect: 1.488,
    src: WM + "a/a5/Tsunami_by_hokusai_19th_century.jpg/960px-Tsunami_by_hokusai_19th_century.jpg",
    text: "A towering wave dwarfs three boats while Mount Fuji sits small in the distance. One of the most reproduced images in art." },
  { title: "Impression, Sunrise", artist: "Claude Monet", year: "1872", where: "Musée Marmottan Monet, Paris", aspect: 1.285,
    src: WM + "5/54/Claude_Monet%2C_Impression%2C_soleil_levant.jpg/960px-Claude_Monet%2C_Impression%2C_soleil_levant.jpg",
    text: "The harbour of Le Havre at dawn, sketched in quick strokes. A critic mocked its title, and the name Impressionism stuck." },
  { title: "The Kiss", artist: "Gustav Klimt", year: "1907–08", where: "Belvedere, Vienna", aspect: 1.0,
    src: WM + "f/f3/Gustav_Klimt_016.jpg/960px-Gustav_Klimt_016.jpg",
    text: "Two lovers wrapped in patterned robes, painted with real gold leaf: the high point of Klimt's golden period." },
  { title: "Sunflowers", artist: "Vincent van Gogh", year: "1888", where: "National Gallery, London", aspect: 0.787,
    src: WM + "f/fe/Vincent_van_Gogh_-_Sunflowers_%281888%2C_National_Gallery_London%29.jpg/960px-Vincent_van_Gogh_-_Sunflowers_%281888%2C_National_Gallery_London%29.jpg",
    text: "Painted to decorate the room of his friend Gauguin in Arles, in an almost single-colour symphony of yellows." },
];

// wall slots in tour order: left wall (front → back), back wall, right wall (back → front); n = facing direction
const SLOTS = [
  { pos: [-6.95, 1.6, 3], n: [1, 0, 0] }, { pos: [-6.95, 1.6, 0], n: [1, 0, 0] }, { pos: [-6.95, 1.6, -3], n: [1, 0, 0] },
  { pos: [-3, 1.6, -4.95], n: [0, 0, 1] }, { pos: [3, 1.6, -4.95], n: [0, 0, 1] },
  { pos: [6.95, 1.6, -3], n: [-1, 0, 0] }, { pos: [6.95, 1.6, 0], n: [-1, 0, 0] }, { pos: [6.95, 1.6, 3], n: [-1, 0, 0] },
];
const facing = (n) => Math.atan2(n[0], n[2]);         // rotation.y that turns +z (or a viewer's −z) towards n

const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");

function speak(art) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`${art.title}, by ${art.artist}, ${art.year}. ${art.text}`);
    u.rate = 0.95;
    speechSynthesis.speak(u);
  } catch { /* no speech support: ignore */ }
}

// ---------- room ----------
function Room() {
  const wall = <meshStandardMaterial color="#ece7df" roughness={0.95} />;
  return (
    <group>
      {[[0, 2, -5.05, 14.2, 4, 0.1], [0, 2, 5.05, 14.2, 4, 0.1], [-7.05, 2, 0, 0.1, 4, 10], [7.05, 2, 0, 0.1, 4, 10]].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]}><boxGeometry args={[w, h, d]} />{wall}</mesh>
      ))}
      <mesh position-y={4} rotation-x={Math.PI / 2}><planeGeometry args={[14, 10]} /><meshStandardMaterial color="#f5f5f4" /></mesh>
      {/* a bench in the middle: not part of the teleport floor */}
      <mesh position={[0, 0.22, 0]}><boxGeometry args={[2.4, 0.44, 0.6]} /><meshStandardMaterial color="#57534e" roughness={0.6} /></mesh>
    </group>
  );
}

// ---------- one artwork: frame, canvas, plaque, spotlight, optional info panel ----------
function Artwork({ art, slot, selected, onSelect, onNext, onClose }) {
  const tex = useMemo(() => {
    const t = loader.load(art.src);              // returns immediately; the image streams in
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [art.src]);
  let h = 1.3, w = h * art.aspect;
  if (w > 2.2) { w = 2.2; h = w / art.aspect; }
  const light = useRef();
  useEffect(() => {                               // aim the spot at the painting (target lives outside the scene)
    light.current.target.position.set(...slot.pos);
    light.current.target.updateMatrixWorld();
  }, [slot]);

  return (
    <group position={slot.pos} rotation-y={facing(slot.n)}>
      {/* frame's front face 5 mm behind the canvas: coplanar faces would z-fight */}
      <mesh position-z={-0.03}><boxGeometry args={[w + 0.14, h + 0.14, 0.05]} /><meshStandardMaterial color={selected ? "#b45309" : "#3f2d1e"} roughness={0.5} /></mesh>
      <mesh onClick={(e) => { e.stopPropagation(); onSelect(); }}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.85} color="#d6d3d1" />
      </mesh>
      <group position={[0, -h / 2 - 0.2, 0]}>
        <mesh><planeGeometry args={[0.72, 0.15]} /><meshStandardMaterial color="#fafaf9" /></mesh>
        <Text position-z={0.002} fontSize={0.038} maxWidth={0.68} textAlign="center" color="#1c1917" anchorY="middle">{`${art.title}\n${art.artist}, ${art.year}`}</Text>
      </group>
      <spotLight ref={light} position={[0, 1.8, 1.4]} angle={0.55} penumbra={0.7} intensity={14} decay={2} distance={7} color="#fff1dc" />
      {selected && <InfoPanel art={art} x={w / 2 + 0.68} onNext={onNext} onClose={onClose} />}
    </group>
  );
}

// ---------- 3D info panel (works with mouse, controllers and hands alike) ----------
function Btn({ label, x, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <group position={[x, -0.53, 0.01]}>
      <mesh onClick={(e) => { e.stopPropagation(); onClick(); }} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
        <planeGeometry args={[0.27, 0.1]} />
        <meshBasicMaterial color={hover ? "#059669" : "#44403c"} />
      </mesh>
      <Text position-z={0.005} fontSize={0.04} color="#ffffff">{label}</Text>
    </group>
  );
}
function InfoPanel({ art, x, onNext, onClose }) {
  return (
    <group position={[x, 0, 0.06]}>
      <mesh><planeGeometry args={[1.0, 1.28]} /><meshBasicMaterial color="#1c1917" transparent opacity={0.93} /></mesh>
      <Text position={[-0.45, 0.58, 0.01]} anchorX="left" anchorY="top" fontSize={0.058} maxWidth={0.9} color="#fafaf9">{art.title}</Text>
      <Text position={[-0.45, 0.4, 0.01]} anchorX="left" anchorY="top" fontSize={0.042} maxWidth={0.9} color="#fbbf24">{`${art.artist}, ${art.year}`}</Text>
      <Text position={[-0.45, 0.3, 0.01]} anchorX="left" anchorY="top" fontSize={0.038} maxWidth={0.9} lineHeight={1.4} color="#e7e5e4">{art.text}</Text>
      <Text position={[-0.45, -0.36, 0.01]} anchorX="left" anchorY="top" fontSize={0.032} maxWidth={0.9} color="#a8a29e">{art.where}</Text>
      <Btn label="Listen" x={-0.31} onClick={() => speak(art)} />
      <Btn label="Next" x={0} onClick={onNext} />
      <Btn label="Close" x={0.31} onClick={onClose} />
    </group>
  );
}

// ---------- moving the visitor: camera flight on desktop, origin jump in VR ----------
function Guide({ index, controls, origin }) {
  const mode = useXR((s) => s.mode);
  useEffect(() => {
    if (index < 0) return;
    const { pos, n } = SLOTS[index];
    const r = [n[2], -n[0]];                                            // the visitor's right when facing the work
    const cx = pos[0] + r[0] * 0.5, cz = pos[2] + r[1] * 0.5;           // centre between painting and info panel
    const sx = cx + n[0] * 3.4, sz = cz + n[2] * 3.4;                   // stand 3.4 m back
    if (mode === "immersive-vr") {
      origin.current.position.set(sx, 0, sz);
      origin.current.rotation.y = facing(n);
    } else {
      controls.current?.setLookAt(sx, 1.65, sz, cx, 1.5, cz, true);
    }
  }, [index, mode]);
  return null;
}

export default function App() {
  const [index, setIndex] = useState(-1);         // selected artwork (= tour position), −1 = none
  const controls = useRef(), origin = useRef();
  const next = (d = 1) => setIndex((i) => (i + d + ART.length) % ART.length);

  return (
    <>
      <div className="overlay" style={{ width: 240 }}>
        <div className="row">
          <button onClick={() => next(-1)}>◀ Prev</button>
          <button className="primary" onClick={() => next(1)}>{index < 0 ? "Start tour" : "Next ▶"}</button>
          {index >= 0 && <button onClick={() => speak(ART[index])}>Listen</button>}
        </div>
        <div style={{ fontSize: 13 }}>{index < 0 ? "Click a painting, or start the guided tour." : <><b>{index + 1}/{ART.length} · {ART[index].title}</b><br /><span className="muted">{ART[index].artist}, {ART[index].year}</span></>}</div>
        <div className="muted" style={{ fontSize: 10.5 }}>Images: Wikimedia Commons, public domain</div>
      </div>
      <div className="xr-buttons"><button className="primary" onClick={() => store.enterVR()}>Enter VR</button></div>

      <Canvas camera={{ position: [0, 1.7, 4.4], fov: 55 }}>
        <XR store={store}>
          <color attach="background" args={["#292524"]} />
          <ambientLight intensity={0.35} />
          <hemisphereLight args={["#fffaf0", "#57534e", 0.6]} />
          <XROrigin ref={origin} position={[0, 0, 4]} />
          <TeleportTarget onTeleport={(p) => origin.current.position.copy(p)}>
            <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[14, 10]} /><meshStandardMaterial color="#8b6b4a" roughness={0.7} /></mesh>
          </TeleportTarget>
          <Room />
          {ART.map((art, i) => (
            <Artwork key={art.title} art={art} slot={SLOTS[i]} selected={index === i}
              onSelect={() => setIndex(i)} onNext={() => next(1)} onClose={() => setIndex(-1)} />
          ))}
          <Guide index={index} controls={controls} origin={origin} />
          <IfInSessionMode deny={["immersive-vr", "immersive-ar"]}>
            <CameraControls minDistance={0.5} maxDistance={6} smoothTime={0.6}
              ref={(c) => { if (c && !controls.current) c.setLookAt(0, 1.7, 4.4, 0, 1.5, -1, false); controls.current = c; }} />
          </IfInSessionMode>
        </XR>
      </Canvas>
    </>
  );
}
```

## How it works

| Feature | Technique |
|---|---|
| collection | an array of plain objects: add a work by adding a row; the image aspect is stored so frames can be sized before images arrive |
| loading | `TextureLoader.load()` returns a texture immediately and fills it when the image arrives, so no Suspense waterfall and the room is usable at once; `colorSpace = SRGBColorSpace`, `anisotropy` for crisp viewing at angles |
| slots | position + facing normal; `rotation.y = atan2(n.x, n.z)` turns a plane's front (+z) to face into the room; artworks hang 5 cm off the wall to avoid z-fighting |
| lighting | low ambient/hemisphere light plus a warm **spotlight per artwork**; the spot's `target` isn't in the scene, so its position is set and `updateMatrixWorld()` called once |
| 3D UI | the info panel and its buttons are meshes with `onClick` / `onPointerOver`, which work identically for mouse, controller rays and hand pinches |
| tour | one index in state; a `Guide` component turns it into `CameraControls.setLookAt(…, true)` on desktop or moves/rotates the `XROrigin` in VR |
| teleport | the floor is a `TeleportTarget`; the bench isn't, so you can't land on it |
| audio guide | the Web Speech API (`speechSynthesis`) reads the label text: zero assets, many languages |

:::tip Comfort and quality in VR galleries
Keep text at least about 1.5° tall at reading distance (our 3.8 cm text is comfortable at about 1.2 m), put labels at eye height, never move the user without their action (the tour moves only on a button press), and prefer instant teleports over smooth flights in VR. For a real museum, use high-resolution images with mipmaps (KTX2), bake lighting into the room with lightmaps, and stream works as the visitor approaches.
:::

:::exercise Extend it
1. Load the collection from a **museum API** (for example, the Art Institute of Chicago's `api.artic.edu` search with `is_public_domain=true`), and lay out however many works come back across the walls.
2. Add **zoom-to-inspect**: on desktop, a double-click flies the camera to 0.6 m from the canvas; in VR, a grab pulls a floating copy of the painting into your hands.
3. Add **multi-user visits**: share each visitor's head position over a WebSocket and show simple avatars (see Lesson 5.8 for networking notes).
4. Add **room acoustics**: positional audio (`PositionalAudio`) for a narration at each painting that you only hear nearby.
5. Make the room **curatable**: a desktop editor mode where you drag works between slots and save the layout.
:::

:::keypoints
- Size artworks from their **real aspect ratio** and mark colour textures as **sRGB**.
- Hang content slightly off walls, light each work with a **spotlight**, and keep ambient light low for a gallery mood.
- Build UI from **meshes with pointer events**: the same code works with a mouse, controllers and hands.
- Drive navigation from one piece of state: **camera flights** on desktop, **origin moves** and **teleport** in VR.
- The Web Speech API gives you a free, multilingual **audio guide**.
:::
