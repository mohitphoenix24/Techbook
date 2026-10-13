---
title: Cameras and Projection
summary: The pinhole camera, field of view and focal length, the perspective and orthographic projection matrices worked through with numbers, why depth precision is non-linear and how reversed-Z fixes it, frustum culling, converting between screen and world, and orbit-camera maths.
---

## The pinhole camera

A real camera, and our virtual one, works like a pinhole: light from a point in the world travels in a straight line through the pinhole onto the image plane. Objects twice as far away appear half as big. That one rule, **size divides by distance**, is perspective.

:::def Field of view (FOV)
The angle the camera can see. three.js's `PerspectiveCamera(fov, aspect, near, far)` takes the **vertical** FOV in **degrees**; the horizontal FOV follows from the aspect ratio: $\tan\frac{\text{fov}_h}{2} = \text{aspect}\cdot\tan\frac{\text{fov}_v}{2}$. A small FOV (20–30°) looks like a telephoto lens; 50–60° feels natural; above 90° distorts edges.
:::

:::def View frustum
The truncated pyramid of space the camera can see, bounded by six planes: left, right, top, bottom, **near** and **far**. Anything outside it is not drawn. Its shape is fully described by the projection matrix.
:::

@fig(frustum) The perspective view frustum. Points between the near and far planes inside the pyramid are visible. The projection squeezes this pyramid into a cube (NDC).

:::formula Visible size at a distance
$$h = 2\,d\,\tan\frac{\text{fov}}{2}, \qquad w = h\cdot\text{aspect}$$
$h$ and $w$ are the height and width of the slice of the world visible at distance $d$ in front of the camera.
:::

:::calc How much of the world fits on screen?
FOV 50°, camera 10 m from a wall, aspect 16:9.

1. $h = 2\times 10\times\tan 25° = 2\times 10\times 0.4663 = 9.33$ m.
2. $w = 9.33\times 1.778 = 16.58$ m.

A 1 m cube on that wall therefore covers about $1/9.33 \approx 10.7\%$ of the screen height: 116 px on a 1080 px tall canvas.
:::

:::formula Fitting an object in view
For a bounding sphere of radius $r$, the distance at which it just fits the vertical FOV is
$$d = \frac{r}{\sin(\text{fov}/2)}$$
(use the smaller of the vertical and horizontal FOV on narrow screens). Multiply by 1.1–1.3 for a margin.
:::

:::calc Framing a product
A shoe with bounding-sphere radius $r = 0.15$ m and FOV 50°: $d = 0.15 / \sin 25° = 0.15/0.4226 = 0.355$ m; with a 1.2× margin, put the camera $0.43$ m from the shoe's centre. On a portrait phone with aspect 0.5, the horizontal FOV is $2\arctan(0.5\tan 25°) = 26.3°$, so fit to that instead: $d = 0.15/\sin 13.1° = 0.66$ m.
:::

```js title="three.js — frame any object"
function frame(object, camera, controls, margin = 1.2) {
  const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = (sphere.radius / Math.sin(Math.min(vFov, hFov) / 2)) * margin;
  const dir = camera.position.clone().sub(controls.target).normalize();   // keep the current view direction
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  camera.near = dist / 100; camera.far = dist * 100;                    // keep near/far proportional
  camera.updateProjectionMatrix();
  controls.target.copy(sphere.center); controls.update();
}
```

```jsx title="R3F — drei does the same with <Bounds>"
import { Bounds, OrbitControls } from "@react-three/drei";
const Viewer = () => (
  <>
    <Bounds fit clip observe margin={1.2}>   {/* fit on load, adjust near/far, refit on resize */}
      <Shoe />
    </Bounds>
    <OrbitControls makeDefault />
  </>
);
```

### Focal length

Photographers think in **focal length** (mm) instead of FOV. three.js models a 35 mm film (`camera.filmGauge = 35`), and `camera.setFocalLength(mm)` converts: $\text{fov}_v = 2\arctan\left(\frac{h_{\text{film}}/2}{\text{focal}}\right)$, where $h_{\text{film}} = 35/\text{aspect}$ for landscape canvases. A 50 mm lens on a 3:2 canvas gives $2\arctan(11.67/50) = 26.3°$. Matching focal lengths makes three.js views match product photography or Blender cameras.

## The perspective projection matrix

The projection matrix maps view-space positions into **clip space**. After the GPU divides by $w$, the visible frustum becomes the NDC cube. three.js (WebGL convention) maps $x, y, z$ to $[-1, 1]$.

:::formula Perspective matrix (three.js / OpenGL convention)
With $s = 1/\tan(\text{fov}/2)$, aspect $a$, near $n$ and far $f$:
$$P = \begin{pmatrix} s/a & 0 & 0 & 0 \\ 0 & s & 0 & 0 \\ 0 & 0 & \dfrac{f+n}{n-f} & \dfrac{2fn}{n-f} \\ 0 & 0 & -1 & 0 \end{pmatrix}$$
The bottom row copies $-z_{\text{view}}$ (the distance in front of the camera) into $w$. Dividing by $w$ is what makes far things small.
:::

:::calc Projecting a point all the way to a pixel
FOV 60°, 1920×1080 canvas ($a = 1.778$), $n = 0.1$, $f = 100$. A point in view space $(1, 0.5, -5)$: 5 m in front, 1 m right, 0.5 m up.

1. $s = 1/\tan 30° = 1.732$; $s/a = 0.974$.
2. Clip: $x_c = 0.974$, $y_c = 1.732\times 0.5 = 0.866$, $z_c = \frac{100.1}{-99.9}(-5) + \frac{20}{-99.9} = 5.010 - 0.200 = 4.810$, $w_c = 5$.
3. NDC (divide by $w$): $(0.195,\ 0.173,\ 0.962)$. All within $[-1, 1]$, so it is visible.
4. Pixels: $x_{px} = \frac{0.195 + 1}{2}\times 1920 = 1147$; $y_{px} = \frac{1 - 0.173}{2}\times 1080 = 446$ (measured from the top).
:::

:::note WebGPU uses a 0 to 1 depth range
WebGPU (and Direct3D, Metal, Vulkan) put NDC $z$ in $[0, 1]$, not $[-1, 1]$. three.js handles this: each camera has a `coordinateSystem` (`WebGLCoordinateSystem` or `WebGPUCoordinateSystem`) that `WebGPURenderer` sets, and `makePerspective` builds the matching matrix. Remember it when you reconstruct positions from a depth texture in custom shaders.
:::

## Depth precision is not linear

:::formula NDC depth as a function of distance
For a point at distance $d$ in front of the camera:
$$z_{\text{ndc}}(d) = \frac{(f+n)\,d - 2fn}{(f-n)\,d}, \qquad \text{stored depth} = \frac{z_{\text{ndc}} + 1}{2}$$
This is a **hyperbola** in $d$: it changes quickly near the camera and hardly at all far away. Almost all of the depth buffer's resolution is spent close to the near plane.
:::

@fig(depth_curve) Stored depth against distance for near = 0.1 m and far = 1000 m. Ninety per cent of the range is used up in the first metre. Reversed-Z with a floating-point buffer spreads precision almost evenly by placing the dense part of float precision where the curve is flat.

:::calc Where did the precision go?
$n = 0.1$, $f = 1000$:

| Distance | $z_{\text{ndc}}$ | Stored depth |
|---|---|---|
| 0.1 m | −1.000 | 0.0000 |
| 1 m | 0.8002 | 0.9001 |
| 10 m | 0.9802 | 0.9901 |
| 100 m | 0.9982 | 0.9991 |
| 500 m | 0.9998 | 0.9999 |

Everything from 1 m to 1 km shares the last 10% of the range. A 24-bit depth buffer has about 16.8 million steps, but only about 15,000 of them are left between 100 m and 1000 m, and about 1,700 between 500 m and 1000 m: one step every 30 cm, so distant surfaces close together z-fight. Increasing $n$ from 0.1 to 1 helps far more than reducing $f$, because the curve is controlled mostly by $n$.
:::

:::def Reversed-Z
Mapping the near plane to depth 1 and the far plane to 0, combined with a 32-bit **floating-point** depth buffer. Floats are densest near 0, which is exactly where the hyperbola is flattest (far away), so the two effects cancel and precision becomes nearly uniform. NVIDIA's analysis shows near-zero depth errors with float reversed-Z, even with an infinite far plane.
:::

```js title="three.js — options for large scenes"
// 1) Reversed depth (needs the EXT_clip_control extension on WebGL; named reversedDepthBuffer since r179)
const renderer = new THREE.WebGLRenderer({ antialias: true, reversedDepthBuffer: true });
// 2) Logarithmic depth: writes gl_FragDepth per fragment, which disables early-z (slower)
const renderer2 = new THREE.WebGLRenderer({ logarithmicDepthBuffer: true });
// 3) Usually enough: a sensible near/far ratio
camera.near = 0.5; camera.far = 2000;      // ratio 4000:1 instead of 10,000,000:1
```

## The orthographic camera

:::def Orthographic projection
A projection with no perspective: parallel lines stay parallel and size does not change with distance. The frustum is a box. Used for 2D games, UI overlays, CAD and architectural drawings, isometric games, and **shadow maps of directional lights**.
:::

:::formula Orthographic matrix
For a box with left $l$, right $r$, top $t$, bottom $b$, near $n$, far $f$:
$$P_{\text{ortho}} = \begin{pmatrix} \frac{2}{r-l} & 0 & 0 & -\frac{r+l}{r-l} \\ 0 & \frac{2}{t-b} & 0 & -\frac{t+b}{t-b} \\ 0 & 0 & \frac{-2}{f-n} & -\frac{f+n}{f-n} \\ 0&0&0&1 \end{pmatrix}$$
$w$ stays 1, so there is no perspective divide, and depth is **linear** in distance.
:::

```js title="three.js — an orthographic camera that keeps 10 m of height visible"
const H = 10;
const a = innerWidth / innerHeight;
const ortho = new THREE.OrthographicCamera(-H * a / 2, H * a / 2, H / 2, -H / 2, 0.1, 100);
ortho.position.set(10, 10, 10); ortho.lookAt(0, 0, 0);   // a classic isometric-style view
ortho.zoom = 2; ortho.updateProjectionMatrix();          // zoom scales the box, not the position
```

```jsx title="R3F — orthographic canvas"
<Canvas orthographic camera={{ zoom: 80, position: [10, 10, 10] }}>   {/* zoom = pixels per unit */}
  <Scene />
</Canvas>
```

## Frustum culling

Drawing an object that is off-screen wastes a draw call and all its vertex work. three.js tests every object's **bounding sphere** against the six frustum planes each frame, and skips it if it is entirely outside any plane.

:::formula Sphere–frustum test
Each plane is $\hat{\mathbf{n}}\cdot\mathbf{x} + d = 0$ with its normal pointing **into** the frustum. A sphere (centre $\mathbf{c}$, radius $r$) is outside if, for any plane,
$$\hat{\mathbf{n}}\cdot\mathbf{c} + d < -r$$
The six planes can be read straight from the combined matrix $P V$ (rows $\mathbf{r}_1..\mathbf{r}_4$): left $= \mathbf{r}_4 + \mathbf{r}_1$, right $= \mathbf{r}_4 - \mathbf{r}_1$, bottom $= \mathbf{r}_4 + \mathbf{r}_2$, top $= \mathbf{r}_4 - \mathbf{r}_2$, near $= \mathbf{r}_4 + \mathbf{r}_3$, far $= \mathbf{r}_4 - \mathbf{r}_3$ (the Gribb–Hartmann method). `Frustum.setFromProjectionMatrix` does this.
:::

:::calc Is the rock culled?
Camera at the origin looking down −Z; the far plane at 100 m has normal $(0, 0, 1)$ (pointing back towards the camera, into the frustum) and $d = 100$. A rock's bounding sphere: centre $(3, 0, -104)$, radius $5$.

$\hat{\mathbf{n}}\cdot\mathbf{c} + d = -104 + 100 = -4$. Since $-4 > -5$, the sphere still pokes 1 m inside the far plane, so it is **not** culled (and the GPU clips the part beyond). At centre $z = -106$: $-6 < -5$, culled.
:::

:::warn When culling goes wrong
Culling uses the geometry's **bounding sphere** computed from the original vertices. If a vertex shader moves vertices (wind, waves, GPU particles, morph targets, skinning far from rest pose), the sphere is out of date and objects vanish near the screen edges. Fix: enlarge `geometry.boundingSphere` manually, or set `mesh.frustumCulled = false` for that object. After editing positions on the CPU, call `geometry.computeBoundingSphere()`.
:::

## From screen to world and back

:::formula Pointer position to NDC
$$x_{\text{ndc}} = \frac{p_x - \text{rect.left}}{\text{rect.width}}\cdot 2 - 1, \qquad y_{\text{ndc}} = -\left(\frac{p_y - \text{rect.top}}{\text{rect.height}}\cdot 2 - 1\right)$$
$y$ is flipped because the DOM measures from the top while NDC $y$ points up. Use the canvas's `getBoundingClientRect()`, not the window size, so it works when the canvas is not full-screen.
:::

@fig(ndc_mouse) Pixel coordinates (origin top-left, y down) map to NDC (origin centre, y up). A ray from the camera through the NDC point is what the Raycaster casts.

:::calc Clicking on a 1920×1080 canvas
Click at $(1440, 270)$ px: $x = 1440/1920\cdot 2 - 1 = 0.5$; $y = -(270/1080\cdot 2 - 1) = -(0.5 - 1) = 0.5$. The click is half-way to the right edge and half-way to the top edge, in NDC $(0.5, 0.5)$.
:::

```js title="three.js — world → screen (HTML labels) and screen → world (rays)"
const v = new THREE.Vector3();
function toScreen(object, camera, canvas) {
  object.getWorldPosition(v).project(camera);              // world → NDC (applies V then P, divides by w)
  const behind = v.z > 1;                                  // beyond far / behind the camera
  return { x: (v.x + 1) / 2 * canvas.clientWidth, y: (1 - v.y) / 2 * canvas.clientHeight, behind };
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
canvas.addEventListener("pointerdown", (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);                    // origin = camera, direction through the pixel
  const hits = raycaster.intersectObjects(scene.children, true);
  if (hits.length) console.log(hits[0].object.name, hits[0].point);
});
```

## Orbit cameras and spherical coordinates

:::formula Spherical coordinates (three.js `Spherical`)
A point at radius $r$, polar angle $\phi$ measured from +Y, and azimuth $\theta$ measured around Y from +Z:
$$x = r\sin\phi\sin\theta,\qquad y = r\cos\phi,\qquad z = r\sin\phi\cos\theta$$
`OrbitControls` stores the camera's offset from its target this way; dragging changes $\theta$ and $\phi$, scrolling changes $r$, and it clamps $\phi$ to avoid the poles.
:::

@fig(spherical) An orbit camera rides on a sphere around its target. Horizontal drags change θ (azimuth), vertical drags change φ (polar angle), the wheel changes r.

:::calc Placing an orbit camera
$r = 5$, $\phi = 60°$, $\theta = 45°$: $x = 5\sin 60°\sin 45° = 3.06$, $y = 5\cos 60° = 2.5$, $z = 3.06$. The camera sits at $(3.06, 2.5, 3.06)$ relative to the target, 30° above the horizon, looking diagonally down at it.
:::

| Control | Feels like | Typical use |
|---|---|---|
| `OrbitControls` | Turntable around a target, Y always up | Product viewers, configurators, editors |
| `MapControls` | Pan with left drag, top-down | Maps, strategy games, floor plans |
| `TrackballControls` | Free tumble, no fixed up | Molecules, CAD inspection |
| `PointerLockControls` | Mouse-look first person | Walkthroughs, FPS games |
| `FlyControls` | Six degrees of freedom | Space scenes, drones |
| drei `CameraControls` (yomotsu) | Orbit with smooth transitions, `fitToBox`, `setLookAt` | Guided tours, animated camera moves |

:::warn Damping needs update()
With `controls.enableDamping = true`, call `controls.update()` every frame (in the animation loop), otherwise the camera stops abruptly or drifts. In R3F, drei's `<OrbitControls enableDamping makeDefault />` does it for you; `makeDefault` also registers the controls in the store so other drei helpers (`Bounds`, `CameraShake`) can find them.
:::

```jsx title="R3F — cameras with drei"
import { PerspectiveCamera, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";

function Rig() {
  const camera = useThree((s) => s.camera);       // the current default camera
  return (
    <>
      <PerspectiveCamera makeDefault fov={40} position={[4, 2, 6]} near={0.1} far={200} />
      <OrbitControls makeDefault enableDamping minPolarAngle={0.2} maxPolarAngle={Math.PI / 2.1} minDistance={2} maxDistance={20} />
    </>
  );
}
```

:::deep The dolly zoom (Vertigo effect)
Move the camera towards a subject while widening the FOV so the subject's on-screen size stays fixed: keep $d\cdot\tan(\text{fov}/2)$ constant. If the subject is 10 m away at FOV 30° ($10\tan 15° = 2.68$), at 5 m you need $\tan(\text{fov}/2) = 0.536$, so FOV $= 56.4°$. The background appears to rush away. It is a neat demonstration that FOV controls perspective distortion while distance controls framing.
:::

:::keypoints
- `PerspectiveCamera(fovVerticalDegrees, aspect, near, far)`; visible height at distance $d$ is $2d\tan(\text{fov}/2)$.
- Fit a sphere: $d = r/\sin(\text{fov}/2)$ using the smaller of the vertical and horizontal FOV.
- The projection matrix puts distance into $w$; dividing by $w$ creates perspective; NDC is $[-1,1]^3$ in WebGL, $z\in[0,1]$ in WebGPU.
- Depth is hyperbolic: precision lives near the near plane; raise `near` first, then consider reversed-Z or logarithmic depth.
- Frustum culling tests bounding spheres against six planes; shader-displaced geometry needs larger bounds or `frustumCulled = false`.
- Pointer → NDC: $x = 2u - 1$, $y = 1 - 2v$; `vector.project(camera)` goes the other way.
- Call `updateProjectionMatrix()` after changing `fov`, `aspect`, `near`, `far` or `zoom`.
:::

## Interview questions

:::qa What is the difference between a perspective and an orthographic camera, and when would you use each? {level=junior}
A perspective camera divides by distance, so far objects look smaller and parallel lines converge; it matches human vision and suits most 3D scenes. An orthographic camera projects along parallel lines, so size is independent of distance; use it for 2D and isometric games, UI layers, CAD and architectural views, technical diagrams, and the shadow cameras of directional lights. Orthographic depth is linear; perspective depth is hyperbolic.
:::

:::qa Distant objects flicker where they overlap. The camera has near = 0.001 and far = 100000. What is happening? {level=mid}
Z-fighting caused by depth precision. Perspective depth is proportional to $1/d$, so precision is concentrated near the near plane; with a near:far ratio of $10^8$, almost no precision is left for distant surfaces. The fix is to raise `near` (it matters far more than `far`), for example to 0.1 or 1 depending on the scene, and lower `far` to what is needed. For huge scenes (planets, cities) use `reversedDepthBuffer` (float reversed-Z) or `logarithmicDepthBuffer`, accepting the latter's cost of disabling early depth testing.
:::

:::qa How do you convert a mouse click to a 3D ray? {level=junior}
Convert the pointer to NDC relative to the canvas rectangle ($x = 2u - 1$, $y = 1 - 2v$), then `raycaster.setFromCamera(ndc, camera)`. Internally, for a perspective camera, the ray origin is the camera position and the direction is the unprojected NDC point (`vector.set(x, y, 0.5).unproject(camera)`) minus the camera position, normalised. For an orthographic camera all rays are parallel, so the origin moves and the direction is the camera's forward axis.
:::

:::qa Objects near the edge of the screen disappear when a vertex shader animates them. Why? {level=mid}
Frustum culling uses the geometry's bounding sphere, computed from the CPU-side vertex positions. A vertex shader that displaces vertices (waves, wind, GPU particles) moves the visible shape outside that sphere, so three.js decides the object is off-screen and skips it. Fix by enlarging `geometry.boundingSphere` to cover the maximum displacement, or set `frustumCulled = false` on that mesh (accepting the cost of always drawing it).
:::

:::qa How would you place an HTML label over a 3D object? {level=mid}
Each frame take the object's world position, call `vector.project(camera)` to get NDC, convert to pixels ($x_{px} = (x+1)/2\cdot w$, $y_{px} = (1-y)/2\cdot h$) and position the element with a CSS transform. Hide it if NDC $z > 1$ (behind the camera or beyond far), and optionally raycast to hide labels behind other geometry. three.js's `CSS2DRenderer` and drei's `<Html>` component do exactly this (drei can also occlude labels).
:::

:::qa Derive the visible height of the scene at distance d and use it to size a full-screen plane. {level=mid}
The vertical FOV forms a triangle with the camera at its apex: half the visible height is $d\tan(\text{fov}/2)$, so $h = 2d\tan(\text{fov}/2)$ and $w = h\cdot\text{aspect}$. A plane of size $w\times h$ placed $d$ units in front of the camera (and parented to it) exactly fills the screen. R3F exposes this as `useThree((s) => s.viewport)`, which gives the width and height in world units at the target distance (via `viewport.getCurrentViewport(camera, target)`).
:::
