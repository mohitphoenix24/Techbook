---
title: Lights and Shadows
summary: Every three.js light type, physical light units and the exact attenuation and spot-cone formulas three.js uses, then shadow mapping from first principles, shadow-camera fitting, acne and peter-panning, PCF and VSM filtering, cascaded shadows with the new SunLight, and cheaper alternatives.
---

## The light types

| Light | Models | Casts shadows | Unit of `intensity` | Notes |
|---|---|---|---|---|
| `AmbientLight` | Uniform light from everywhere | No | — | Flattens shapes; prefer hemisphere or an environment map |
| `HemisphereLight` | Sky colour from above, ground colour from below | No | — | Cheap outdoor fill |
| `DirectionalLight` | Parallel rays from far away (the sun) | Yes (orthographic shadow camera) | lux-like | Direction = from `position` to `target.position` |
| `PointLight` | A bulb radiating in all directions | Yes (6 renders: cube) | candela | `power` = intensity × 4π lumens |
| `SpotLight` | A cone (torch, stage light) | Yes (perspective shadow camera) | candela | `power` = intensity × π; `angle`, `penumbra`, `map` (gobo) |
| `RectAreaLight` | A glowing rectangle (window, softbox) | No | nits (cd/m²) | Needs `RectAreaLightUniformsLib.init()`; Standard/Physical materials only |
| `LightProbe` | Spherical-harmonic ambient light | No | — | From `LightProbeGenerator` or baked |
| `SunLight` (addon, r186) | A sun with automatic **cascaded** shadows | Yes (2 cascades) | lux-like | Fits shadows to the view; no shadow-camera tuning |
| `scene.environment` | Image-based lighting from an HDR | No (but see contact/AO) | — | The main light source for PBR (Chapter 13) |

:::def Physically based light units
Since r155 three.js uses physical light units by default (the legacy mode was removed in r165). Point and spot lights take **luminous intensity in candela**, `RectAreaLight` takes **luminance in nits**, and you can set `light.power` in **lumens** instead. Absolute values only matter relative to the renderer's exposure (`toneMappingExposure`), but keeping real ratios (a 60 W-equivalent bulb is about 800 lm) makes mixed lighting believable.
:::

:::calc Real bulbs in three.js units
An 800 lumen household bulb as a `PointLight`: $I = 800/(4\pi) = 63.7$ cd, so `new THREE.PointLight("#ffd9a0", 63.7)` or `light.power = 800`. Conversely a point light of intensity 50 cd has `power` $= 50\times4\pi = 628$ lm.
:::

## Attenuation: how light fades with distance

:::formula Inverse-square law with a smooth cut-off (three.js)
$$\text{falloff}(d) = \frac{1}{\max(d^{\,\text{decay}},\ 0.01)}\cdot\begin{cases} \text{saturate}\!\left(1 - (d/d_{\max})^4\right)^2 & d_{\max} > 0\\ 1 & d_{\max} = 0\end{cases}$$
$d$ is the distance to the light, `decay` defaults to 2 (physically correct inverse square), and `distance` ($d_{\max}$) is an optional range after which the light is forced smoothly to zero (based on Frostbite's windowing function). The illuminance reaching a surface is $I\cdot\text{falloff}(d)$, then multiplied by $\hat{\mathbf{n}}\cdot\hat{\mathbf{l}}$.
:::

:::calc A lamp over a table
`PointLight` with intensity 50 cd, decay 2.

- At 2 m: $50/2^2 = 12.5$. At 4 m: $50/16 = 3.125$. Doubling distance quarters the light.
- With `distance = 5`: at 4 m the window factor is $(1 - 0.8^4)^2 = (1 - 0.4096)^2 = 0.349$, so $3.125\times0.349 = 1.09$; at 5 m and beyond, exactly 0.

The window lets three.js (and clustered lighting) skip the light entirely beyond $d_{\max}$, at the price of a slightly unphysical fade.
:::

### The spotlight cone

:::formula Spot attenuation
$$\text{spot}(\theta) = \text{smoothstep}\big(\cos(\text{angle}),\ \cos(\text{angle}\cdot(1-\text{penumbra})),\ \cos\theta\big)$$
$\theta$ is the angle between the spot's axis and the direction to the shaded point. Inside the inner cone the factor is 1, outside the outer cone 0, with a smooth edge between. `angle` is the half-angle of the cone in radians (maximum $\pi/2$).
:::

:::calc A soft-edged spotlight
`angle` = 30°, `penumbra` = 0.5, so the outer cosine is $\cos 30° = 0.8660$ and the inner cosine $\cos 15° = 0.9659$. A point 20° off-axis: $\cos 20° = 0.9397$.

$t = (0.9397 - 0.8660)/(0.9659 - 0.8660) = 0.737$; smoothstep $= 3t^2 - 2t^3 = 0.829$. The point receives 83% of the beam.
:::

```js title="three.js — lights you will use most"
scene.add(new THREE.HemisphereLight("#cfe8ff", "#3b2f2f", 0.8));

const sun = new THREE.DirectionalLight("#fff4e0", 3);
sun.position.set(8, 12, 5);           // direction = position → target (default target at the origin)
scene.add(sun, sun.target);           // add the target if you move it

const spot = new THREE.SpotLight("#ffffff", 120, 0, THREE.MathUtils.degToRad(30), 0.5, 2);
spot.position.set(0, 4, 0);
spot.target.position.set(0, 0, 0);
scene.add(spot, spot.target);
```

```jsx title="R3F — the same lights"
const Lights = () => (
  <>
    <hemisphereLight args={["#cfe8ff", "#3b2f2f", 0.8]} />
    <directionalLight position={[8, 12, 5]} intensity={3} color="#fff4e0" />
    <spotLight position={[0, 4, 0]} angle={THREE.MathUtils.degToRad(30)} penumbra={0.5} intensity={120} />
  </>
);
```

## Shadow mapping

Lighting formulas only ask "does this surface face the light?". They do not know whether something is **in the way**. Shadow mapping answers that with a second render, from the light's point of view.

:::def Shadow map
A depth texture rendered from the light's viewpoint. Each texel stores the distance from the light to the nearest surface in that direction. When shading a point, compare its own distance from the light with the stored value: if it is farther, something closer to the light blocks it, so it is in shadow.
:::

@fig(shadow_map) Shadow mapping in two passes. Pass 1 stores the nearest depth seen from the light. In pass 2, point A's depth matches the stored depth (lit), while point B is farther than the stored depth (the box is in the way), so it is in shadow.

:::formula The shadow test
For a fragment at world position $\mathbf{p}$:
$$\mathbf{q} = P_L\,V_L\,\mathbf{p},\qquad (u, v, z) = \tfrac{1}{2}\left(\frac{\mathbf{q}_{xyz}}{q_w}\right) + \tfrac{1}{2},\qquad \text{lit} = \big[\,z - \text{bias} \le \text{shadowMap}(u, v)\,\big]$$
$P_L V_L$ is the light camera's projection and view (orthographic for directional lights, perspective for spots, six cube faces for point lights). three.js stores this matrix per light as `light.shadow.matrix`.
:::

### Fitting the shadow camera

A directional light's shadow camera is an **orthographic box**. Everything outside the box casts and receives no shadow; everything inside shares the map's resolution. The tighter the box, the sharper the shadows.

:::calc Shadow texel size
`mapSize` 2048 × 2048.

- Box 40 m wide: $40/2048 = 0.0195$ m: each shadow texel covers about **2 cm**. A 1 cm cable casts a broken, blocky shadow.
- Box 10 m wide: $10/2048 = 0.0049$ m: about **5 mm** per texel, four times sharper.
- Memory: $2048^2\times 4$ bytes $= 16.8$ MB per shadow map (32-bit depth). A 4096 map is 67 MB, and every shadow-casting point light needs six faces.
:::

```js title="three.js — a well-fitted directional shadow"
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;      // soft PCF (r182+); VSMShadowMap is the other option
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const cam = sun.shadow.camera;                      // an OrthographicCamera
cam.left = -6; cam.right = 6; cam.top = 6; cam.bottom = -6;   // just around the area of interest
cam.near = 1; cam.far = 30;
sun.shadow.bias = -0.0005;                          // depth bias in shadow-map depth units
sun.shadow.normalBias = 0.02;                       // offset along the normal, in world units
cam.updateProjectionMatrix();
scene.add(new THREE.CameraHelper(cam));             // always look at the box while tuning
model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
```

### Artefacts and how to fix them

| Artefact | Looks like | Cause | Fix |
|---|---|---|---|
| Shadow acne | Stripes or moiré on lit surfaces | A surface compares against its own rounded depth and shadows itself | Small negative `bias`, or `normalBias` around one texel size |
| Peter-panning | Shadows detached from the object's base | Too much bias pushes the shadow away | Reduce bias; make thin objects thicker; prefer `normalBias` |
| Blocky edges | Stair-stepped shadow outlines | Too few texels per metre | Tighter shadow box, larger `mapSize`, cascades |
| Missing shadows | Some parts unshadowed | Objects outside the shadow box, or `castShadow`/`receiveShadow` not set | `CameraHelper`, set flags with `traverse` |
| Shimmering | Edges crawl as the camera moves | Shadow box moves by sub-texel amounts | Snap the box to texel increments; cascades do this |

@fig(shadow_acne) Shadow acne. The surface is sampled at texel centres, so on a sloped surface half the samples lie slightly below the stored depth and are wrongly shadowed. A bias moves the comparison just above the surface.

:::new Shadows in r182–r186
`PCFShadowMap` became soft in r182, so `PCFSoftShadowMap` was deprecated and then removed in r186 (renderers now warn and fall back to PCF). `WebGPURenderer`'s shadows improved in r183, so old projects should **reduce** their bias values after upgrading.
:::

### Soft shadows: PCF and VSM

:::def Percentage-closer filtering (PCF)
Instead of one depth comparison, take several comparisons around the lookup point and average the **results** (not the depths). The fraction that passes is the percentage of light, which blurs the shadow edge by the kernel's width.
:::

:::calc A 3×3 PCF kernel
Nine neighbouring texels are compared with the fragment's depth; 4 say "lit" and 5 say "blocked". Light factor $= 4/9 = 0.44$: the fragment lies in the penumbra and is drawn 44% lit.
:::

:::def Variance shadow maps (VSM)
Store the mean depth $\mu$ and the mean squared depth $E[d^2]$, which can be blurred like an ordinary image. At lookup, Chebyshev's inequality gives an upper bound on the lit fraction. Soft and smooth at any blur size, but prone to "light bleeding" where several occluders overlap.
:::

:::formula Chebyshev's bound (VSM)
$$\sigma^2 = E[d^2] - \mu^2,\qquad p_{\max}(t) = \frac{\sigma^2}{\sigma^2 + (t - \mu)^2}\quad (t > \mu)$$
$t$ is the receiver's depth; if $t \le \mu$ the point is fully lit.
:::

:::calc VSM at a shadow edge
Blurred moments $\mu = 10$, $E[d^2] = 100.25$, so $\sigma^2 = 0.25$. A receiver at $t = 11$: $p_{\max} = 0.25/(0.25 + 1) = 0.20$: 20% lit. At $t = 10.2$: $0.25/(0.25+0.04) = 0.86$.
:::

### Cascaded shadow maps and SunLight

One shadow map cannot cover a large outdoor scene sharply: near the camera you need centimetre texels, far away metres are fine. **Cascaded shadow maps** (CSM) split the view frustum into depth slices and give each slice its own shadow map, fitted tightly around it.

:::formula The practical split scheme
For $N$ cascades between near $n$ and far $f$, the $i$-th split distance blends logarithmic and uniform splits with $\lambda\in[0,1]$:
$$z_i = \lambda\, n\left(\frac{f}{n}\right)^{i/N} + (1-\lambda)\left(n + (f-n)\frac{i}{N}\right)$$
$\lambda = 1$ matches perspective's precision falloff; $\lambda \approx 0.5$ is a common compromise.
:::

:::calc Four cascades out to 100 m
$n = 0.5$, $f = 100$, $\lambda = 0.5$: logarithmic splits $1.88,\ 7.07,\ 26.6,\ 100$; uniform $25.4,\ 50.3,\ 75.1,\ 100$; blended $z_1 = 13.6$, $z_2 = 28.7$, $z_3 = 50.9$, $z_4 = 100$ m. The first cascade covers only the nearest 13.6 m, so its 2048 texels give sub-centimetre shadows where the player looks.
:::

@fig(cascades) Cascaded shadows split the view frustum into slices; each slice gets its own shadow map fitted to it, so texel density is high near the camera and coarse far away.

```js title="three.js — SunLight (r186 addon), cascades without tuning"
import { SunLight } from "three/addons/lights/SunLight.js";

const sun = new SunLight(0xfff2e3, 3);
sun.position.set(1, 1, 1);                 // direction towards the sun
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);        // per cascade (default 1024); two cascades in one atlas
scene.add(sun);
// WebGPURenderer (r186): register its node once
// import { SunLightNode } from "three/addons/lights/SunLightNode.js";
// renderer.library.addLight(SunLightNode, SunLight);
```

:::tip When not to use cascades
Cascades fit the **view frustum**, not the scene. On a small, bounded stage (a product on a turntable) a single hand-fitted shadow box gives denser texels for less memory; the three.js maintainers switched their small-scene examples back to plain directional lights for this reason. Use `SunLight` (or the older `CSM` addon) for large worlds where the camera roams.
:::

## Cheaper ways to get shadows

| Technique | Cost | Quality | Use when |
|---|---|---|---|
| Baked lightmaps (`aoMap`, `lightMap` from Blender) | Free at runtime | Excellent, soft, with bounce light | Static scenes: architecture, rooms |
| Blob shadow (a dark radial texture on a plane) | Tiny | Stylised | Characters in casual games |
| drei `<ContactShadows>` | One extra depth render, blurred | Soft grounding shadow | Products on a floor, configurators |
| drei `<AccumulativeShadows>` + `<RandomizedLight>` | Accumulates over many frames, then stops | Very soft, ray-traced look | Static product shots |
| `ShadowMaterial` on a plane | One plane | Receives real shadows only | AR, compositing over HTML |
| SSAO / GTAO (Chapter 19) | Post-process | Contact darkening, not cast shadows | Adds depth to any scene |

:::tip Static shadows do not need re-rendering
If the light and the shadow casters do not move, render the shadow map once: `renderer.shadowMap.autoUpdate = false`, then set `renderer.shadowMap.needsUpdate = true` whenever something changes. Each shadow-casting light otherwise re-renders the casters every frame (point lights six times).
:::

```jsx title="R3F — shadows with drei helpers"
<Canvas shadows camera={{ position: [3, 2, 5], fov: 40 }}>
  <directionalLight castShadow position={[5, 8, 3]} intensity={3}
    shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} shadow-normalBias={0.02}
    shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} />
  <mesh castShadow position-y={0.5}><boxGeometry /><meshStandardMaterial /></mesh>
  <mesh receiveShadow rotation-x={-Math.PI / 2}><planeGeometry args={[20, 20]} /><meshStandardMaterial /></mesh>
  <ContactShadows position-y={0.001} opacity={0.6} scale={10} blur={2.5} far={4} />
</Canvas>
```

:::keypoints
- Directional (sun), point (bulb, candela), spot (cone, candela), rect-area (nits), hemisphere and environment lighting.
- three.js falloff: $1/d^{\text{decay}}$ with an optional smooth window to zero at `distance`.
- Spot factor: smoothstep between $\cos(\text{angle})$ and $\cos(\text{angle}(1-\text{penumbra}))$.
- Shadow mapping: render depth from the light, then compare each fragment's light-space depth with the map.
- Texel size = shadow box width ÷ `mapSize`: fit the box tightly; a 2048 map costs about 17 MB.
- Acne → bias / `normalBias`; too much bias → peter-panning.
- PCF averages comparisons; VSM uses moments + Chebyshev; cascades split the frustum; `SunLight` (r186) automates two cascades.
- Static scenes: bake lighting, or render the shadow map once with `autoUpdate = false`.
:::

## Interview questions

:::qa Explain how shadow mapping works. {level=mid}
Two passes. First, render the scene's depth from the light's point of view into a texture (orthographic for a directional light, perspective for a spot, a cube for a point light). Second, when shading each fragment from the camera, transform its world position into the light's clip space, look up the stored depth at that position, and compare: if the fragment is farther from the light than the stored depth (plus a small bias), an occluder is in between and it is in shadow. Filtering (PCF, VSM) softens the edges.
:::

:::qa Your shadows look striped on lit surfaces. After adding bias, they float away from the objects. What is going on? {level=mid}
The stripes are shadow acne: limited shadow-map resolution and depth precision make a surface compare against its own rounded depth and partially shadow itself, especially at grazing light angles. A large constant bias removes acne but separates shadows from their casters (peter-panning). Use a small bias plus `normalBias` (offsets the lookup along the surface normal, scaling naturally with slope), tighten the shadow camera so texels are smaller, and avoid paper-thin geometry. Tune with a `CameraHelper` on the shadow camera.
:::

:::qa How would you get good shadows for a large open world? {level=senior}
Use cascaded shadow maps: split the view frustum into several depth ranges (logarithmic/uniform blend), fit a light-space orthographic box around each, render a shadow map per cascade and pick (and blend) the right one per fragment. Stabilise each cascade by snapping its box to texel increments to stop shimmering. In three.js r186 `SunLight` does this with two cascades for both renderers; the `CSM` addon offers more control. Add baked or screen-space AO for contact detail, and limit shadow casters (skip small objects, use layers) to keep the extra renders cheap.
:::

:::qa A point light with shadows makes the scene much slower. Why, and what are the alternatives? {level=mid}
A point light's shadow needs depth renders in six directions (a cube map), so every shadow caster is drawn six extra times per frame, plus memory for six faces. Alternatives: use a spot light if the light only needs to cover a cone (one render), disable `castShadow` on small objects, lower `mapSize`, render the shadow once (`autoUpdate = false`) when nothing moves, or bake the lighting into lightmaps for static scenes.
:::

:::qa What is the difference between `light.shadow.bias` and `light.shadow.normalBias`? {level=senior}
`bias` is a constant offset added to the depth comparison in the shadow map's depth units: simple, but the right value depends on the slope of the surface relative to the light and on depth range, so one value rarely fits everywhere. `normalBias` moves the lookup position along the surface normal in world units before projecting into the shadow map; because the required offset grows with the slope, offsetting along the normal handles grazing angles much better and causes less peter-panning. A typical setup uses a tiny negative `bias` and a `normalBias` close to one shadow texel's world size.
:::
