---
title: Materials and Classic Lighting Models
summary: What a material really is, the three.js material family and its cost, the Lambert, Phong, Blinn–Phong, hemisphere and toon lighting models derived and calculated by hand, and the material settings (side, transparency, depth, blending) that cause most visual bugs.
difficulty: Intermediate
prereqs: Chapters 3 and 8
time: 60 minutes
outcome: Compute Lambert and Blinn–Phong lighting by hand, choose the right material, and fix the material settings behind most visual bugs.
---

## What a material is

:::def Material
The description of how a surface looks: a **shader program** (vertex + fragment code) plus the **parameters** it reads (colour, roughness, textures, flags). three.js generates the shader from the material type and its settings; two materials of the same type with the same features share one compiled program and differ only in uniforms.
:::

| Material | Lighting | Typical use | Relative cost |
|---|---|---|---|
| `MeshBasicMaterial` | None (unlit) | UI, flat colour, baked lighting, video screens | Lowest |
| `MeshLambertMaterial` | Diffuse only, per fragment | Matte stylised scenes, low-end mobile | Low |
| `MeshPhongMaterial` | Diffuse + Blinn–Phong specular | Shiny plastic look, legacy content | Low–medium |
| `MeshToonMaterial` | Stepped diffuse (gradient map) | Cartoon / cel shading | Low |
| `MeshStandardMaterial` | PBR metal–roughness | The default for realistic scenes and glTF | Medium |
| `MeshPhysicalMaterial` | PBR + clearcoat, sheen, transmission, iridescence, anisotropy… | Car paint, glass, fabric, gems | High (transmission highest) |
| `MeshMatcapMaterial` | Lighting baked in a sphere image | Sculpting previews, stylised looks, no lights needed | Low |
| `MeshNormalMaterial`, `MeshDepthMaterial` | Debug views of normals and depth | Debugging, depth pre-passes | Low |
| `ShadowMaterial` | Only receives shadows (transparent elsewhere) | Shadow catchers under AR or product models | Low |
| `ShaderMaterial` / `RawShaderMaterial` | Whatever you write (GLSL) | Custom effects on `WebGLRenderer` | Varies |
| `Mesh*NodeMaterial` | Node/TSL based | Custom effects on `WebGPURenderer` (and WebGL since r184) | Varies |

:::warn "My model is black"
Lit materials (`Lambert`, `Phong`, `Standard`, `Physical`, `Toon`) need light. With no lights and no environment map they render black. Add lights, or set `scene.environment` to an environment map (Chapter 13), which is how glTF models are meant to be lit. Metallic surfaces (metalness 1) show almost nothing **but** reflections, so they look black without an environment even when lights exist.
:::

## How light meets a surface

Classic real-time shading splits the light leaving a surface point into parts, each a simple formula:

- **Emission**: light the surface gives off by itself (screens, lamps): `emissive`.
- **Ambient**: a constant guess for light bouncing around the room.
- **Diffuse**: light scattered equally in all directions (matte surfaces). Depends on the light direction only.
- **Specular**: the shiny highlight, a blurred reflection of the light. Depends on the light **and** the viewer.

All of them use the same unit vectors at the shaded point: the normal $\hat{\mathbf{n}}$, the direction **to** the light $\hat{\mathbf{l}}$, the direction **to** the viewer $\hat{\mathbf{v}}$, and derived vectors.

@fig(shading_vectors) The vectors of local lighting: normal n, light direction l, view direction v, the mirror reflection r of l, and the half vector h halfway between l and v.

## Lambert diffuse

:::formula Lambert's cosine law
$$L_{\text{diffuse}} = k_d\, E_L\, \max(0,\ \hat{\mathbf{n}}\cdot\hat{\mathbf{l}})$$
$k_d$ is the surface's diffuse colour (albedo), $E_L$ the light's colour times intensity. A physically based version divides by $\pi$ (Chapter 13); three.js folds that constant into its light units.
:::

Why a cosine? A beam of light of fixed width hitting a surface at an angle spreads over a larger area, so each unit of area receives less. The spread grows as $1/\cos\theta$, so the energy per area falls as $\cos\theta = \hat{\mathbf{n}}\cdot\hat{\mathbf{l}}$.

@fig(lambert_cosine) A tilted surface catches the same beam over a larger area, so it is lit more dimly in proportion to cos θ.

:::calc Lighting one pixel by hand
Albedo $k_d = (0.8, 0.3, 0.2)$ (terracotta). White light of intensity 2, so $E_L = (2, 2, 2)$, coming from $\hat{\mathbf{l}} = \text{normalise}(1, 2, 2) = (0.333, 0.667, 0.667)$. Normal $\hat{\mathbf{n}} = (0, 1, 0)$ (floor).

1. $\hat{\mathbf{n}}\cdot\hat{\mathbf{l}} = 0.667$ (the light is about 48° from straight overhead).
2. $L = (0.8, 0.3, 0.2)\times 2\times 0.667 = (1.067, 0.400, 0.267)$.
3. Red is above 1.0: in linear HDR that is fine; tone mapping (Chapter 12) maps it into displayable range rather than clipping.
4. For a wall facing away ($\hat{\mathbf{n}} = (0,0,-1)$): $\hat{\mathbf{n}}\cdot\hat{\mathbf{l}} = -0.667$, clamped to 0: no direct light.
:::

## Phong and Blinn–Phong specular

:::formula Phong specular
$$\hat{\mathbf{r}} = 2(\hat{\mathbf{n}}\cdot\hat{\mathbf{l}})\hat{\mathbf{n}} - \hat{\mathbf{l}}, \qquad L_{\text{spec}} = k_s\, E_L\, \max(0,\ \hat{\mathbf{r}}\cdot\hat{\mathbf{v}})^{\alpha}$$
$\hat{\mathbf{r}}$ is the light direction mirrored about the normal. The highlight is brightest when you look straight along the reflection; the **shininess** exponent $\alpha$ sets how fast it falls off (10 = broad and dull, 200 = tight and glossy).
:::

:::formula Blinn–Phong specular
$$\hat{\mathbf{h}} = \text{normalise}(\hat{\mathbf{l}} + \hat{\mathbf{v}}), \qquad L_{\text{spec}} = k_s\, E_L\, \max(0,\ \hat{\mathbf{n}}\cdot\hat{\mathbf{h}})^{\alpha'}$$
The **half vector** $\hat{\mathbf{h}}$ lies halfway between the light and view directions. When the surface normal lines up with it, the surface acts like a mirror between the light and the eye. It is cheaper than computing $\hat{\mathbf{r}}$, behaves better at grazing angles, and is what `MeshPhongMaterial` uses. Roughly $\alpha' \approx 4\alpha$ gives a similar highlight size.
:::

@fig(shading_spheres) The same sphere and light rendered with four classic models, computed per pixel from the formulas in this chapter. Blinn–Phong's highlight is broader than Phong's at the same exponent; toon shading quantises n·l into bands.

:::calc A highlight by hand
$\hat{\mathbf{n}} = (0, 1, 0)$, light $\hat{\mathbf{l}} = (0.6, 0.8, 0)$, viewer $\hat{\mathbf{v}} = (-0.6, 0.8, 0)$ (the mirror position), shininess 32.

- Phong: $\hat{\mathbf{n}}\cdot\hat{\mathbf{l}} = 0.8$, $\hat{\mathbf{r}} = 2(0.8)(0,1,0) - (0.6, 0.8, 0) = (-0.6, 0.8, 0)$, so $\hat{\mathbf{r}}\cdot\hat{\mathbf{v}} = 1$ and the specular term is $1^{32} = 1$: full highlight.
- Move the viewer to $\hat{\mathbf{v}} = (0, 1, 0)$: $\hat{\mathbf{r}}\cdot\hat{\mathbf{v}} = 0.8$, and $0.8^{32} = 0.00079$. Almost gone: shininess 32 is a tight highlight.
- Blinn–Phong for that second viewer: $\hat{\mathbf{h}} = \text{normalise}((0.6, 1.8, 0)) = (0.316, 0.949, 0)$; $\hat{\mathbf{n}}\cdot\hat{\mathbf{h}} = 0.949$; $0.949^{32} = 0.186$. Much broader at the same exponent, hence the $\approx 4\times$ rule ($0.949^{128} = 0.0012$).
:::

```js title="three.js — classic materials"
const matte = new THREE.MeshLambertMaterial({ color: "#c2410c" });
const plastic = new THREE.MeshPhongMaterial({ color: "#2563eb", specular: "#ffffff", shininess: 80 });
const toon = new THREE.MeshToonMaterial({ color: "#f59e0b", gradientMap: threeTone });  // a 3-pixel DataTexture
threeTone.minFilter = threeTone.magFilter = THREE.NearestFilter;   // keep the bands hard-edged
```

## Ambient and hemisphere light

:::formula Hemisphere lighting
$$L_{\text{ambient}} = k_d\cdot\text{mix}\!\left(C_{\text{ground}},\ C_{\text{sky}},\ \tfrac{1}{2}\hat{\mathbf{n}}_y + \tfrac{1}{2}\right)$$
Surfaces facing up get the sky colour, surfaces facing down the ground colour, and vertical ones a 50/50 mix. It is a two-colour approximation of an environment and much more convincing than a flat `AmbientLight`.
:::

:::calc Sky blue, grass green
Sky $(0.6, 0.75, 1.0)$, ground $(0.25, 0.35, 0.15)$. A wall ($n_y = 0$) gets $t = 0.5$: $(0.425, 0.55, 0.575)$. A roof ($n_y = 1$) gets the full sky colour. An overhang's underside ($n_y = -1$) gets the green bounce.
:::

## Toon shading

Toon (cel) shading replaces the smooth $\hat{\mathbf{n}}\cdot\hat{\mathbf{l}}$ ramp with a few flat bands. `MeshToonMaterial` looks up $\hat{\mathbf{n}}\cdot\hat{\mathbf{l}}$ in a small `gradientMap` texture; with nearest filtering each texel becomes one band. Add an outline (the inverted-hull trick, a back-face-only scaled copy drawn in black, or the `OutlineEffect` addon) for the classic cartoon look.

:::formula Quantised diffuse
$$d = \frac{\lfloor (\hat{\mathbf{n}}\cdot\hat{\mathbf{l}})\cdot N \rfloor}{N - 1}$$
for $N$ bands (with $\hat{\mathbf{n}}\cdot\hat{\mathbf{l}}$ clamped to $[0, 1)$). With $N = 3$, $\hat{\mathbf{n}}\cdot\hat{\mathbf{l}} = 0.55$ gives $\lfloor 1.65\rfloor/2 = 0.5$: the middle band.
:::

## Material settings that cause most bugs

| Setting | Default | What it controls | Common mistake |
|---|---|---|---|
| `side` | `FrontSide` | Which faces render (`BackSide`, `DoubleSide`) | Planes vanish when seen from behind; `DoubleSide` doubles fragment work on closed meshes |
| `transparent` | false | Puts the object in the sorted transparent list and enables blending | Setting `opacity` without `transparent: true` does nothing |
| `opacity` | 1 | Alpha multiplier | |
| `alphaTest` | 0 | Discard fragments with alpha below the threshold | Use for foliage/fences instead of `transparent` (no sorting problems) |
| `alphaHash` | false | Stochastic (dithered) transparency, no sorting needed | Noisy without TAA or multisampling |
| `depthWrite` | true | Write to the depth buffer | Transparent objects writing depth hide what is behind them |
| `depthTest` | true | Test against the depth buffer | Turn off for always-on-top gizmos |
| `blending` | `NormalBlending` | Additive, multiply, custom | Glows need `AdditiveBlending` + `depthWrite: false` |
| `vertexColors` | false | Multiply by the `color` attribute | Forgetting it, so vertex colours are ignored |
| `flatShading` | false | Per-face normals in the shader | |
| `toneMapped` | true | Apply the renderer's tone mapping | UI or emissive screens look washed out: set false |
| `polygonOffset` | false | Nudge depth to avoid z-fighting | Decals and outlines on surfaces |
| `wireframe` | false | Draw triangle edges | |

:::warn Changing features after the first render
Some changes alter the **shader program** itself, not just a uniform: adding or removing a texture (`map` from null to a texture), switching `flatShading`, `vertexColors`, `fog`, or the number of lights in the scene. After such a change set `material.needsUpdate = true` (three.js detects many cases itself), and expect a one-off compile hitch. Swapping between pre-created materials (`mesh.material = variantB`) avoids recompiling.
:::

```jsx title="R3F — materials as JSX and shared materials"
// props map to material properties; changing them later just sets the property
<mesh>
  <sphereGeometry args={[1, 64, 32]} />
  <meshPhongMaterial color="#2563eb" shininess={80} transparent opacity={0.85} side={THREE.DoubleSide} />
</mesh>

// one material shared by many meshes (one program, fewer state changes)
const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0.05, thickness: 0.5 }), []);
return items.map((it) => <mesh key={it.id} geometry={it.geometry} material={glass} position={it.position} />);

// multi-material mesh: attach into the material array
<mesh>
  <boxGeometry />
  <meshStandardMaterial attach="material-0" color="red" />
  <meshStandardMaterial attach="material-1" color="green" />
  {/* … material-2 to material-5 for the other faces */}
</mesh>
```

:::deep Extending built-in materials
With `WebGLRenderer` you can inject GLSL into a built-in material through `material.onBeforeCompile = (shader) => { shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "…") }`, keeping all of three.js's lighting while adding, for example, wind sway. The `three-custom-shader-material` library does this more robustly. With `WebGPURenderer`, `onBeforeCompile` is not supported; instead you assign TSL nodes to slots such as `positionNode`, `colorNode` or `normalNode` of a node material (Chapter 20).
:::

:::keypoints
- A material = generated shader program + parameters; same type + same features = shared program.
- Diffuse (Lambert) $\propto \max(0, \hat{\mathbf{n}}\cdot\hat{\mathbf{l}})$: cosine because a tilted surface spreads the beam.
- Phong uses $(\hat{\mathbf{r}}\cdot\hat{\mathbf{v}})^\alpha$; Blinn–Phong uses $(\hat{\mathbf{n}}\cdot\hat{\mathbf{h}})^{\alpha'}$ with $\hat{\mathbf{h}} = \text{norm}(\hat{\mathbf{l}}+\hat{\mathbf{v}})$, $\alpha'\approx4\alpha$.
- Hemisphere light mixes ground and sky colours by $n_y$; toon shading quantises $\hat{\mathbf{n}}\cdot\hat{\mathbf{l}}$.
- Black models: no light or environment. Metal needs an environment.
- `transparent` + `opacity` for blending, `alphaTest`/`alphaHash` for cut-outs, `depthWrite: false` for glows.
- Changes that alter the program need `needsUpdate`; prefer swapping pre-built materials.
:::

## Interview questions

:::qa What is the difference between MeshBasic, MeshLambert, MeshPhong and MeshStandard materials? {level=junior}
Basic is unlit: it shows its colour/texture regardless of lights. Lambert computes diffuse lighting only (matte). Phong adds a Blinn–Phong specular highlight controlled by `shininess` and `specular` (shiny plastic). Standard is physically based (metalness/roughness, energy conserving, works with environment maps and glTF), the default for realistic content. Cost rises in that order; Physical adds clearcoat, sheen, transmission and more on top of Standard.
:::

:::qa Explain the half vector in Blinn–Phong and why it is used. {level=mid}
$\hat{\mathbf{h}} = \text{normalise}(\hat{\mathbf{l}} + \hat{\mathbf{v}})$ is the normal a perfect mirror would need to reflect the light into the eye. Specular intensity is $(\hat{\mathbf{n}}\cdot\hat{\mathbf{h}})^{\alpha}$: brightest when the surface normal matches it. It avoids computing the reflection vector, does not cut off abruptly when the angle between $\hat{\mathbf{r}}$ and $\hat{\mathbf{v}}$ exceeds 90°, and matches measured highlights better (it is the basis of microfacet models, where $\hat{\mathbf{h}}$ is the microfacet normal that reflects light to the viewer).
:::

:::qa Leaves of a tree show black or white halos and sort incorrectly. How do you fix it? {level=mid}
The leaves use `transparent: true`, so they go through back-to-front object sorting and blending, which fails within a single mesh and causes sorting artefacts; halos come from straight-alpha colour bleeding at texture edges. Use `alphaTest: 0.5` (cut-out: fragments are kept or discarded, depth works normally, no sorting needed), or `alphaHash` with antialiasing, and keep `transparent: false`. Premultiplied alpha or padded texture edges (dilation) remove the halos.
:::

:::qa Why is `side: THREE.DoubleSide` not free? {level=mid}
Back-face culling normally discards about half the triangles of a closed mesh before rasterisation. With `DoubleSide` they are rasterised and shaded too, doubling fragment work in the worst case and causing overdraw; lighting on back faces also needs flipped normals (three.js handles it). Use it only for thin open surfaces (leaves, cloth, paper); model thickness or use two one-sided meshes otherwise.
:::

:::qa What is a matcap and when is it a good choice? {level=junior}
A "material capture": an image of a lit sphere. The shader looks up the colour using the view-space normal's x and y, so lighting and reflections are baked into the image. It needs no lights and is very cheap, so it suits sculpting previews, stylised products, medical or CAD viewers and low-end devices. Its limitation: the lighting moves with the camera (it is view-locked) and does not respond to scene lights or shadows.
:::
