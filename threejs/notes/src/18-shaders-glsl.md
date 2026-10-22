---
title: Shaders and GLSL
part: Shaders and the GPU
summary: Writing your own GPU programs. GLSL types and built-ins, how attributes, uniforms and varyings flow, ShaderMaterial versus RawShaderMaterial, a complete animated shader in three.js and R3F, the classic toolbox (smoothstep, fract, SDFs, smooth minimum, hash and fBm noise, Fresnel rim, dissolve, anti-aliased lines), extending built-in materials, and shader performance.
difficulty: Advanced
prereqs: Chapters 2, 3 and 9
time: 90 minutes
outcome: Write vertex and fragment shaders, use SDFs, noise and anti-aliasing techniques, and extend built-in materials without losing their lighting.
---

## The shader mindset {foundation}

A fragment shader is a function that runs **for every pixel at once**, and cannot see its neighbours' results. You do not draw a circle by looping over pixels; you write, for one pixel, "how far am I from the centre, and therefore what colour am I?". Thinking per pixel (or per vertex) is the whole trick.

:::def GLSL
The OpenGL Shading Language, a C-like language for GPU programs. WebGL 2 uses **GLSL ES 3.00** (`#version 300 es`, `in`/`out` instead of `attribute`/`varying`; three.js adds compatibility defines so `attribute`, `varying` and `gl_FragColor` still work in `ShaderMaterial`). WebGPU uses WGSL; three.js's TSL generates either (Chapter 20).
:::

| Type | Meaning |
|---|---|
| `float`, `int`, `uint`, `bool` | Scalars (write floats with a dot: `1.0`, not `1`) |
| `vec2`, `vec3`, `vec4` (`ivec`, `uvec`, `bvec`) | Vectors; components `.xyzw`, `.rgba` or `.stpq` |
| `mat2`, `mat3`, `mat4` | Column-major matrices; `M * v` |
| `sampler2D`, `samplerCube`, `sampler2DArray`, `sampler3D` | Textures, read with `texture(s, uv)` |

**Swizzling** rearranges components freely: `v.xy`, `v.zyx`, `c.rgb * 0.5`, `vec4(p.xz, 0.0, 1.0)`. Operations are component-wise: `vec3 * vec3` multiplies each component.

| Built-in | Does | Built-in | Does |
|---|---|---|---|
| `mix(a, b, t)` | Lerp | `step(e, x)` | 0 if $x < e$, else 1 |
| `smoothstep(e0, e1, x)` | Smooth 0→1 between edges | `clamp(x, lo, hi)` | Limit |
| `fract(x)` | $x - \lfloor x\rfloor$ (repeat) | `mod(x, y)` | Remainder |
| `length`, `distance`, `dot`, `cross`, `normalize` | Vector maths | `reflect(i, n)`, `refract(i, n, eta)` | Optics |
| `sin`, `cos`, `atan(y, x)`, `pow`, `exp`, `sqrt` | Maths | `dFdx`, `dFdy`, `fwidth` | Screen-space derivatives |

## How data reaches a shader {foundation}

@fig(shader_dataflow) Data flow through a shader program. Attributes are per vertex, uniforms are the same for the whole draw call, varyings carry per-vertex values to the fragment shader (interpolated across the triangle), and textures are sampled anywhere.

:::def Attribute, uniform, varying
An **attribute** is per-vertex input from the geometry (`position`, `normal`, `uv`, your custom ones). A **uniform** is a value constant for a whole draw call, set from JavaScript (time, colours, matrices, textures). A **varying** is written by the vertex shader and read, **interpolated**, by the fragment shader.
:::

| | `ShaderMaterial` | `RawShaderMaterial` |
|---|---|---|
| Built-in declarations | Injected: `position`, `normal`, `uv`, `modelMatrix`, `modelViewMatrix`, `projectionMatrix`, `viewMatrix`, `normalMatrix`, `cameraPosition` | None: declare everything yourself |
| Version and precision | Added for you | You write `#version 300 es` and `precision` |
| Includes (`#include <common>`, fog, tone mapping chunks) | Available | Not available |
| Use | Most custom effects | Full control, minimal overhead |

## A complete shader

```js title="three.js — an animated wave with height-based colour"
const material = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uLow: { value: new THREE.Color("#1e3a8a") },
    uHigh: { value: new THREE.Color("#34d399") },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying float vHeight;
    varying vec2 vUv;
    void main() {
      vec3 p = position;
      float h = sin(p.x * 3.0 + uTime) * 0.15 + sin(p.y * 4.0 + uTime * 1.3) * 0.1;
      p.z += h;                                   // the plane lies in XY before rotation
      vHeight = h;
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uLow, uHigh;
    varying float vHeight;
    varying vec2 vUv;
    void main() {
      float t = smoothstep(-0.25, 0.25, vHeight);
      vec3 col = mix(uLow, uHigh, t);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>        // convert linear → output colour space like built-ins
    }`,
});
const plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4, 128, 128), material);
plane.rotation.x = -Math.PI / 2;
renderer.setAnimationLoop((t) => { material.uniforms.uTime.value = t / 1000; renderer.render(scene, camera); });
```

```jsx title="R3F — drei's shaderMaterial helper"
import { shaderMaterial } from "@react-three/drei";
import { extend, useFrame } from "@react-three/fiber";

const WaveMaterial = shaderMaterial(
  { uTime: 0, uLow: new THREE.Color("#1e3a8a"), uHigh: new THREE.Color("#34d399") },
  vertexShaderSource,        // the same GLSL strings as above
  fragmentShaderSource
);
extend({ WaveMaterial });    // now usable as <waveMaterial />

function Wave() {
  const mat = useRef();
  useFrame((_, dt) => { mat.current.uTime += dt; });   // uniforms become properties
  return (
    <mesh rotation-x={-Math.PI / 2}>
      <planeGeometry args={[4, 4, 128, 128]} />
      <waveMaterial ref={mat} key={WaveMaterial.key} />   {/* key: hot-reload when the shader changes */}
    </mesh>
  );
}
```

:::warn The wave and the raycaster disagree
The displaced surface exists only on the GPU. Clicks hit the flat plane, and frustum culling uses the flat plane's bounding sphere (Chapter 14 and Chapter 6). Enlarge `geometry.boundingSphere` by the maximum displacement if edges disappear.
:::

## The shader toolbox

### Shaping with step and smoothstep

:::formula smoothstep
$$\text{smoothstep}(e_0, e_1, x) = t^2(3 - 2t),\qquad t = \text{clamp}\!\left(\frac{x - e_0}{e_1 - e_0}, 0, 1\right)$$
A soft threshold. `step` is the hard version and produces aliased (jagged) edges; `smoothstep` over about one pixel gives anti-aliased edges.
:::

:::calc smoothstep(0.4, 0.6, x)
At $x = 0.45$: $t = 0.25$, so $0.25^2(3 - 0.5) = 0.156$. At $x = 0.5$: $t = 0.5$, result $0.5$. At $x \ge 0.6$: 1.
:::

### Repetition with fract

`fract(uv * 10.0)` turns one 0–1 square into ten repeated squares; `floor(uv * 10.0)` gives each cell an integer ID (to randomise per cell). Combined with a shape function this gives grids, tiles, dots and stripes in one line each.

### Signed distance functions

:::def Signed distance function (SDF)
A function returning the distance from a point to a shape's surface: negative inside, positive outside, zero on the boundary. Shapes become formulas; combining shapes becomes `min` (union), `max` (intersection) and `max(a, -b)` (subtraction). A smooth edge comes from `smoothstep` on the distance.
:::

:::formula Basic 2D SDFs and smooth union
$$d_{\text{circle}}(\mathbf{p}) = \lVert\mathbf{p}\rVert - r \qquad d_{\text{box}}(\mathbf{p}) = \lVert\max(\mathbf{q}, 0)\rVert + \min(\max(q_x, q_y), 0),\quad \mathbf{q} = |\mathbf{p}| - \mathbf{b}$$
$$\text{smin}(a, b, k) = \min(a, b) - \frac{h^2 k}{4},\qquad h = \frac{\max(k - |a - b|, 0)}{k}$$
$\mathbf{b}$ is the box's half size. The smooth minimum (Inigo Quilez's polynomial version) blends two shapes like melted wax within distance $k$.
:::

@fig(sdf_shapes) Signed distance fields rendered per pixel: a circle, a box, their hard union, and their smooth union. Bands show distance contours; the white line is the zero contour (the surface).

:::calc Distances by hand
Circle of radius $0.25$ at the origin, point $(0.3, 0.4)$: $d = 0.5 - 0.25 = 0.25$ (outside by 0.25). Smooth union of distances $a = 0.05$ and $b = 0.08$ with $k = 0.1$: $h = (0.1 - 0.03)/0.1 = 0.7$, so $\text{smin} = 0.05 - 0.49\times0.1/4 = 0.0378$: the blended surface bulges towards the point.
:::

```glsl title="GLSL — an anti-aliased SDF badge"
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }

void main() {
  vec2 p = vUv * 2.0 - 1.0;                         // centre the coordinates
  float d = smin(sdCircle(p - vec2(-0.3, 0.0), 0.35), sdBox(p - vec2(0.35, 0.0), vec2(0.25)), 0.2);
  float aa = fwidth(d);                             // one pixel's worth of distance
  float shape = 1.0 - smoothstep(-aa, aa, d);       // crisp at any zoom
  gl_FragColor = vec4(mix(vec3(0.05), vec3(0.2, 0.83, 0.6), shape), 1.0);
}
```

### Noise

:::def Hash, value noise, gradient noise and fBm
A **hash** turns a coordinate into a pseudo-random number (`fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453)` is the classic one-liner). **Value noise** interpolates random values at grid points; **gradient (Perlin/simplex) noise** interpolates random gradients and looks less blocky. **Fractal Brownian motion (fBm)** sums several octaves of noise, each at double the frequency and half the amplitude, giving natural detail: clouds, terrain, marble, fire.
:::

:::formula fBm
$$\text{fbm}(\mathbf{p}) = \sum_{i=0}^{N-1} a^i\,\text{noise}\!\left(\lambda^i\mathbf{p}\right)$$
Usually gain $a = 0.5$ and lacunarity $\lambda = 2$. With 4 octaves the amplitudes are $1 + 0.5 + 0.25 + 0.125 = 1.875$, so divide by 1.875 to keep the result in range.
:::

@fig(noise_fbm) From white noise to fBm. Random values per cell (blocky), smoothly interpolated value noise, and four octaves of fBm with natural multi-scale detail.

### Fresnel rim and dissolve

:::formula Fresnel-style rim light
$$\text{rim} = \big(1 - \max(0, \hat{\mathbf{n}}\cdot\hat{\mathbf{v}})\big)^p$$
Bright where the surface turns away from the viewer: holograms, force fields, x-ray and selection highlights. With $\hat{\mathbf{n}}\cdot\hat{\mathbf{v}} = 0.2$ (near the silhouette) and $p = 3$: $0.8^3 = 0.51$.
:::

```glsl title="GLSL — rim glow and noise dissolve (fragment)"
uniform float uProgress;           // 0 = solid, 1 = fully dissolved
varying vec3 vNormal;              // view-space normal from the vertex shader
varying vec3 vViewDir;             // view-space direction to the camera
void main() {
  float n = fbm(vUv * 6.0);
  if (n < uProgress) discard;                                     // burn away
  float edge = 1.0 - smoothstep(0.0, 0.05, n - uProgress);         // glowing edge band
  float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 3.0);
  vec3 col = vec3(0.1, 0.12, 0.2) + rim * vec3(0.3, 0.6, 1.0) + edge * vec3(1.0, 0.5, 0.1) * 4.0;
  gl_FragColor = vec4(col, 1.0);
}
```

### Derivatives and anti-aliasing

:::def Screen-space derivatives
`dFdx(v)` and `dFdy(v)` give how much a value changes from one pixel to the next horizontally and vertically (the GPU shades pixels in 2×2 quads and differences neighbours). `fwidth(v) = |dFdx(v)| + |dFdy(v)|` is "one pixel's worth of `v`". Using it as the width of a `smoothstep` edge gives lines and shapes that stay one pixel soft at any distance.
:::

```glsl title="GLSL — an infinite anti-aliased grid"
vec2 g = abs(fract(vWorldPos.xz - 0.5) - 0.5) / fwidth(vWorldPos.xz);   // distance to nearest line, in pixels
float line = 1.0 - min(min(g.x, g.y), 1.0);                             // 1 on a line, fading over 1 px
```

## Extending built-in materials

Writing lighting yourself is a lot of work. Often you only want to change one thing (bend vertices, tint by height) and keep three.js's PBR lighting and shadows.

```js title="three.js — onBeforeCompile (WebGLRenderer)"
const mat = new THREE.MeshStandardMaterial({ color: "#3b7d4f" });
const uTime = { value: 0 };
mat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uTime;
  shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader.replace(
    "#include <begin_vertex>",
    `#include <begin_vertex>
     transformed.x += sin(uTime * 2.0 + position.y * 3.0) * 0.05 * position.y;   // sway grass by height`
  );
};
mat.customProgramCacheKey = () => "grass-sway";   // so three.js does not mix it up with plain Standard materials
```

:::tip CustomShaderMaterial and node materials
The `three-custom-shader-material` library extends any built-in material with your own GLSL in a supported way (and has an R3F component). On `WebGPURenderer`, the equivalent is assigning TSL nodes to `positionNode`, `colorNode`, `normalNode`, `emissiveNode` and friends of a node material; `onBeforeCompile` is not supported there.
:::

## Shader performance

| Cost | Why | What to do |
|---|---|---|
| Fragment work × pixels | Runs for every covered pixel, including overdraw | Cheaper maths, lower resolution passes, fewer full-screen layers |
| Texture fetches | Memory bandwidth and latency | Pack channels, fewer lookups, mipmaps for cache efficiency |
| Divergent branches | A GPU runs groups of threads in lockstep; if neighbours take different branches, both run | Prefer `mix`/`step` arithmetic over `if` when cheap; branch on uniforms freely |
| `discard` / writing depth | Can disable early depth testing | Use only where needed (cut-outs, dissolve) |
| Precision | `highp` everywhere costs on some mobile GPUs | `mediump` for colours on mobile; `highp` for positions and UVs of large textures |
| Compile time | Big shaders stall the first frame they appear | `renderer.compile()`/`compileAsync()` during loading |

:::tip Debugging shaders
Output intermediate values as colour: `gl_FragColor = vec4(vec3(vHeight * 0.5 + 0.5), 1.0);`, or normals as `n * 0.5 + 0.5`. Compile errors appear in the browser console with the full generated source and line numbers. Spector.js captures a frame and shows every draw call, its shader and its uniforms.
:::

:::keypoints
- Think per pixel/vertex: compute a value from position, never loop over neighbours.
- Attributes per vertex, uniforms per draw, varyings interpolated vertex → fragment.
- `ShaderMaterial` injects three.js built-ins; `RawShaderMaterial` gives you nothing.
- Add `#include <tonemapping_fragment>` and `<colorspace_fragment>` to match built-in output.
- Toolbox: `smoothstep` edges, `fract` repetition, SDFs with `min`/`max`/`smin`, hash/noise/fBm, Fresnel rims, `discard` dissolves, `fwidth` anti-aliasing.
- Extend built-ins with `onBeforeCompile` (WebGL) or node slots (WebGPU/TSL).
- Performance: pixels × instructions; avoid overdraw, divergent branches and unnecessary `discard`.
:::

:::build Hologram and dissolve shader
Problem: Write a material that shows a model as a scan-line hologram with a Fresnel rim, and dissolves it with a glowing edge when triggered.
Requirements:
- Rim from the view-space normal; scan lines from world-space height.
- Dissolve driven by noise and a progress uniform, with an emissive edge band.
- A TSL version of the same effect for `WebGPURenderer`.
Constraints: anti-aliased edges at any zoom.
Hints: `pow(1.0 - dot(n, v), p)` for the rim; `fwidth` for edge width; `discard` only below the threshold.
Relevant APIs: `ShaderMaterial` (or `onBeforeCompile`), `uniforms`, `smoothstep`, `fwidth`, TSL `Fn`, `positionWorld`, `normalView`.
Expected result: a convincing hologram that burns away smoothly from one side, identical in GLSL and TSL.
:::

## Interview questions

:::qa What is the difference between attributes, uniforms and varyings? {level=junior}
Attributes are per-vertex inputs read by the vertex shader from geometry buffers (position, normal, uv). Uniforms are constants for a whole draw call, set from JavaScript (time, colours, matrices, textures), readable in both shaders. Varyings are outputs of the vertex shader that the rasteriser interpolates across each triangle and passes to the fragment shader (UVs, normals, world positions).
:::

:::qa How would you animate 50,000 grass blades swaying in the wind? {level=mid}
One `InstancedMesh` of a blade geometry (one draw call) with per-instance transforms, and the sway computed in the vertex shader from a time uniform, the instance's world position (so neighbours move together) and the vertex height (so roots stay fixed), for example a sum of sines or noise. Keep lighting by extending `MeshStandardMaterial` with `onBeforeCompile` or CustomShaderMaterial (or `positionNode` in TSL). The CPU only updates one uniform per frame.
:::

:::qa Why are edges drawn with step() jagged, and how do you fix it? {level=mid}
`step` switches from 0 to 1 between two adjacent pixels, so every pixel is either fully in or out: aliasing. Replace it with `smoothstep(-w, w, d)` where `w = fwidth(d)` is about one pixel's change of the distance value, giving a one-pixel soft edge at any zoom level. MSAA does not help here because it only antialiases triangle edges, not edges computed inside a fragment shader.
:::

:::qa What is a signed distance function and why are SDFs useful? {level=mid}
A function giving the distance from a point to a shape's surface, negative inside and positive outside. Shapes become small formulas; boolean operations become `min`/`max`; rounding, outlines, glows and shadows come from thresholds on the distance; smooth unions blend shapes organically; and the distance gives perfect resolution-independent anti-aliasing. In 3D, SDFs are rendered by raymarching (sphere tracing), and SDF text (MSDF fonts, troika-three-text) renders crisp text at any size.
:::

:::qa Your custom shader looks darker and more contrasty than the built-in materials next to it. Why? {level=junior}
It outputs linear colour directly to an sRGB canvas, skipping the renderer's tone mapping and output colour-space conversion that built-in materials apply. Add `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` at the end of the fragment shader (or set `toneMapped: false` deliberately), and make sure input colours from `THREE.Color` uniforms are already linear (they are, with colour management on).
:::
