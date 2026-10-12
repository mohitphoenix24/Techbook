---
title: Render Targets, Multiple Views & Screenshots
level: advanced
time: 30
summary: Rendering into textures for in-world monitors and portals, split screens and minimaps with viewports and scissors, live reflections with CubeCamera, and exporting screenshots — techniques behind security-camera views, CAD multi-views and configurator "save image" buttons.
---

So far every frame went straight to the screen. Three.js can also render into an **off-screen image** and then use that image as a texture, or draw several cameras into different rectangles of one canvas. These two abilities power a surprising number of features: a monitor in a control room showing a live camera feed, a minimap, the four views of a CAD tool, mirrors, portals, and the "download a picture of my configuration" button.

:::def Render target
An off-screen image the renderer can draw into (`THREE.WebGLRenderTarget`). Its `.texture` can be used as any material's map in the next draw, so one camera's view becomes a surface in the scene.
:::

## A live camera feed on a monitor

```js run title="Security camera rendered onto a screen" level=advanced
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#cbd5e1");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(-0.5, 3.2, 6.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.5, 1, -1);
scene.add(new THREE.HemisphereLight("#fff", "#64748b", 2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: "#94a3b8" }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// a robot "arm" moving around a work cell, away from the monitor
const cell = new THREE.Group();
cell.position.set(3, 0, -3);
const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 24), new THREE.MeshStandardMaterial({ color: "#f97316" }));
const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2, 0.25).translate(0, 1, 0), new THREE.MeshStandardMaterial({ color: "#fb923c" }));
arm.position.y = 0.2;
cell.add(base, arm);
scene.add(cell);

// the CCTV camera and the image it renders into
const cctv = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 50);
cctv.position.set(1.2, 2.5, -0.6);
cctv.lookAt(cell.position.x, 1, cell.position.z);
scene.add(new THREE.CameraHelper(cctv));
const feed = new THREE.WebGLRenderTarget(512, 288);                 // 16:9, small is fine for a screen

// a monitor in front of the user showing that image
const monitor = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ map: feed.texture }));
monitor.position.set(-2.2, 1.6, 0);
monitor.rotation.y = 0.35;
const bezel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2, 0.1), new THREE.MeshStandardMaterial({ color: "#0f172a" }));
bezel.position.z = -0.06;
monitor.add(bezel);
scene.add(monitor);

const mainBg = scene.background, feedBg = new THREE.Color("#052e16");
renderer.setAnimationLoop((t) => {
  arm.rotation.z = Math.sin(t / 700) * 0.9;
  cell.rotation.y = t / 2000;

  monitor.visible = false;                  // don't render the monitor into its own feed
  scene.background = feedBg;                // give the feed its own "camera" look
  renderer.setRenderTarget(feed);           // 1. draw the CCTV view into the texture
  renderer.render(scene, cctv);
  renderer.setRenderTarget(null);           // 2. back to the screen
  scene.background = mainBg;
  monitor.visible = true;
  renderer.render(scene, camera);           // 3. normal view, monitor shows the feed
});
```

:::warn Feedback loops
A material can't read the render target that's currently being drawn into. If the monitor were visible to the CCTV camera, it would sample its own image while rendering it, which is undefined (black, or a WebGL error). Hide it during that pass, as above.
:::

Uses: control-room screens in digital twins, rear-view mirrors in driving games, picture-in-picture, "magic window" portals (render another scene into a texture on a door), and any effect that needs a scene as an image (refraction, heat haze).

## Split screens and minimaps: viewports and scissors

To draw several views into **one** canvas, set a **viewport** (where to draw) and a **scissor** rectangle (where drawing is allowed), then render each camera. This is how CAD tools show top, front, side and perspective views at once:

```js run title="Four views like a CAD tool" level=advanced
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setScissorTest(true);                         // drawing outside the scissor box is ignored
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight("#fff", "#475569", 2));
const sun = new THREE.DirectionalLight("#fff", 1.5);
sun.position.set(3, 5, 4);
scene.add(sun, new THREE.GridHelper(6, 12, "#94a3b8", "#cbd5e1"));

// a little bracket "part"
const part = new THREE.Group();
const mat = new THREE.MeshStandardMaterial({ color: "#3b82f6", metalness: 0.3, roughness: 0.4 });
part.add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 1.2), mat));
const upright = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.2), mat);
upright.position.set(-0.9, 0.7, 0);
const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.22, 32), new THREE.MeshStandardMaterial({ color: "#0f172a" }));
hole.position.set(0.5, 0.01, 0);
part.add(upright, hole);
part.position.y = 0.1;
scene.add(part);

const ortho = (pos, up = [0, 1, 0]) => {
  const c = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 50);
  c.position.set(...pos);
  c.up.set(...up);
  c.lookAt(0, 0.5, 0);
  return c;
};
const views = [
  { name: "Top", cam: ortho([0, 10, 0], [0, 0, -1]), bg: "#f8fafc" },
  { name: "Front", cam: ortho([0, 0.5, 10]), bg: "#f1f5f9" },
  { name: "Side", cam: ortho([10, 0.5, 0]), bg: "#f1f5f9" },
  { name: "Perspective", cam: new THREE.PerspectiveCamera(45, 1, 0.1, 50), bg: "#e2e8f0" },
];
views[3].cam.position.set(4, 3, 5);
const controls = new OrbitControls(views[3].cam, renderer.domElement);
controls.target.set(0, 0.5, 0);

const labels = views.map((v) => {
  const el = document.createElement("div");
  el.className = "label3d";
  el.style.cssText = "position:absolute";
  el.textContent = v.name;
  document.body.appendChild(el);
  return el;
});

renderer.setAnimationLoop(() => {
  const w = innerWidth / 2, h = innerHeight / 2;
  views.forEach((v, i) => {
    const x = (i % 2) * w, y = i < 2 ? h : 0;            // WebGL's y=0 is the BOTTOM of the canvas
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    scene.background = new THREE.Color(v.bg);
    const aspect = w / h;
    if (v.cam.isOrthographicCamera) { v.cam.left = -2 * aspect; v.cam.right = 2 * aspect; }
    else v.cam.aspect = aspect;
    v.cam.updateProjectionMatrix();
    renderer.render(scene, v.cam);
    labels[i].style.left = `${x + 8}px`;
    labels[i].style.top = `${innerHeight - y - h + 8}px`;
  });
});
```

The perspective view (bottom right) orbits; the three orthographic views are fixed engineering projections. Because OrbitControls listens to the whole canvas, a real tool would forward pointer events only from the matching quadrant (drei's `<View>` in R3F handles this for you).

## Live reflections: CubeCamera

A static environment map reflects a fixed photo. For a chrome object that reflects **moving** things around it, a `CubeCamera` renders the scene from the object's position in six directions into a cube render target each frame:

```js run title="A chrome ball reflecting moving objects" level=advanced
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0f172a");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2, 7);
new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight("#fff", "#1e293b", 2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: "#334155" }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.2;
scene.add(floor);

const cubeTarget = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const cubeCamera = new THREE.CubeCamera(0.1, 50, cubeTarget);
const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial({ envMap: cubeTarget.texture, metalness: 1, roughness: 0.05 }));
scene.add(ball, cubeCamera);

const orbiters = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7"].map((c, i) => {
  const m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.25, 0.08, 64, 8), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3 }));
  scene.add(m);
  return m;
});

let frame = 0;
renderer.setAnimationLoop((t) => {
  orbiters.forEach((m, i) => {
    const a = t / 1500 + (i / orbiters.length) * Math.PI * 2;
    m.position.set(Math.cos(a) * 2.6, Math.sin(a * 2) * 0.6, Math.sin(a) * 2.6);
    m.rotation.x = a * 2;
  });
  if (frame++ % 2 === 0) {                 // update reflections every other frame: half the cost
    ball.visible = false;                  // the ball must not reflect its own inside
    cubeCamera.position.copy(ball.position);
    cubeCamera.update(renderer, scene);    // 6 renders into the cube target
    ball.visible = true;
  }
  renderer.render(scene, camera);
});
```

A CubeCamera costs **six extra scene renders** per update, so use small resolutions (128–256), update less often, or only when something changes. Flat mirrors are cheaper with `Reflector` (`three/addons/objects/Reflector.js`), which renders the scene once from a mirrored camera.

## Exporting a screenshot

Configurators and design tools need a "save image" button. The canvas is an ordinary canvas, so `toBlob` / `toDataURL` work, with one catch: WebGL clears its drawing buffer after showing a frame. Either create the renderer with `preserveDrawingBuffer: true` (slightly slower) or **render and capture in the same task**:

```js run title="Download a PNG of the current view" level=intermediate
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#f8fafc");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(2.5, 1.5, 3);
new OrbitControls(camera, renderer.domElement);
const product = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.25, 200, 32), new THREE.MeshPhysicalMaterial({ color: "#7c3aed", clearcoat: 1, roughness: 0.3 }));
scene.add(product);

const ui = document.createElement("div");
ui.className = "overlay";
ui.innerHTML = `<label>Colour <input type="color" value="#7c3aed"></label><button class="primary">Save image (2×)</button><img style="width:140px;border-radius:8px;display:none">`;
document.body.appendChild(ui);
ui.querySelector("input").oninput = (e) => product.material.color.set(e.target.value);
ui.querySelector("button").onclick = () => {
  const old = renderer.getPixelRatio();
  renderer.setPixelRatio(old * 2);                 // export at double resolution for print/marketing
  renderer.render(scene, camera);                  // render…
  renderer.domElement.toBlob((blob) => {           // …and capture before the browser clears the buffer
    const url = URL.createObjectURL(blob);
    const img = ui.querySelector("img");
    img.src = url;
    img.style.display = "block";
    const a = Object.assign(document.createElement("a"), { href: url, download: "configuration.png" });
    a.click();                                     // triggers a download in a normal page
  }, "image/png");
  renderer.setPixelRatio(old);
};

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

## Check yourself

```quiz
? How do you make a texture that shows what a second camera sees?
+ Render that camera into a WebGLRenderTarget and use renderTarget.texture as a map
- Set material.map = camera
- Use a VideoTexture
> setRenderTarget(target) → render → setRenderTarget(null).

? Why hide the monitor while rendering the CCTV feed?
+ A material can't sample the render target it's being drawn into (feedback loop)
- To save draw calls only
- The monitor would be upside down
> Reading and writing the same texture at once is undefined.

? What do setViewport and setScissor do together?
+ Restrict rendering to a rectangle of the canvas, so several cameras can share one canvas
- Crop the final image file
- Change the camera's field of view
> Viewport maps the image; scissor clips drawing to the rectangle.

? Why is CubeCamera expensive?
+ Each update renders the scene six times (one per cube face)
- It needs a physics engine
- It downloads an HDR
> Use small sizes and update rarely.

? A screenshot comes out blank. A likely fix?
+ Render and call toBlob in the same task, or use preserveDrawingBuffer: true
- Use a larger canvas
- Disable antialias
> The drawing buffer is cleared after compositing.
```

:::exercise Picture-in-picture
Add a small **top-down minimap** in the bottom-right corner of the bounce-ball or solar-system scene from earlier lessons: after rendering the main view full-size, set a 200×200 viewport + scissor in the corner, render an `OrthographicCamera` looking straight down, then reset the scissor test.
:::

:::solution
```js run
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#05070f");
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3, 9);
camera.lookAt(0, 0, 0);
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: "#fbbf24" })));
scene.add(new THREE.PointLight("#fff", 60, 0, 1.5), new THREE.AmbientLight("#fff", 0.2));
const orbit = new THREE.Group();
const planet = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), new THREE.MeshStandardMaterial({ color: "#3b82f6" }));
planet.position.x = 4;
orbit.add(planet);
scene.add(orbit);

const top = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 50);
top.position.set(0, 20, 0);
top.lookAt(0, 0, 0);

renderer.setAnimationLoop((t) => {
  orbit.rotation.y = t / 2000;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.render(scene, camera);                         // main view
  const S = 180;
  renderer.setScissorTest(true);
  renderer.setScissor(innerWidth - S - 10, 10, S, S);
  renderer.setViewport(innerWidth - S - 10, 10, S, S);
  renderer.render(scene, top);                            // minimap on top, bottom-right corner
});
```
:::

:::keypoints
- `WebGLRenderTarget` = render into a texture: monitors, mirrors, portals, effects. Avoid feedback loops.
- `setViewport` + `setScissor` (+ `setScissorTest(true)`) draw multiple cameras into one canvas: CAD views, minimaps, split screens.
- `CubeCamera` gives live reflections at the cost of six renders per update; `Reflector` handles flat mirrors.
- Screenshots: render then `toBlob` immediately (or `preserveDrawingBuffer`), optionally at a higher pixel ratio.
:::
