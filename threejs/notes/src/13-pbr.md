---
title: Physically Based Rendering
summary: The rendering equation, BRDFs and energy conservation, the Cook–Torrance microfacet model term by term (GGX distribution, Smith geometry, Schlick Fresnel) evaluated by hand, the metal–roughness workflow, image-based lighting with PMREM and the split-sum approximation, and every MeshPhysicalMaterial feature.
difficulty: Advanced
prereqs: Chapters 9, 11 and 12
time: 90 minutes
outcome: Evaluate the Cook–Torrance BRDF by hand, set metalness and roughness plausibly, light scenes with HDR environments and use MeshPhysicalMaterial features.
---

## Why physically based? {foundation}

Classic models (Chapter 9) are tuned by eye: a Phong material that looks right under one light looks wrong under another. **Physically based rendering (PBR)** describes surfaces with measurable properties and follows the physics of light (energy conservation, Fresnel reflection, microscopic roughness), so one material looks correct under any lighting. That is what makes glTF assets portable between Blender, three.js, Unity and Unreal, and why `MeshStandardMaterial` is the default for realistic work.

:::def Physically based rendering (PBR)
A family of shading models built on (1) the rendering equation, (2) energy-conserving BRDFs, (3) microfacet theory for specular reflection, (4) Fresnel effects, and (5) real-world-like light units and environment lighting. Materials are described by a few intuitive, measurable parameters: base colour, metalness and roughness.
:::

@fig(pbr_pipeline) The PBR shading pipeline this chapter builds, from material inputs to the displayed pixel. Each box is a section of the chapter.


## The rendering equation

:::formula The rendering equation (Kajiya, 1986)
$$L_o(\mathbf{p}, \boldsymbol{\omega}_o) = L_e(\mathbf{p}, \boldsymbol{\omega}_o) + \int_{\Omega} f_r(\mathbf{p}, \boldsymbol{\omega}_i, \boldsymbol{\omega}_o)\, L_i(\mathbf{p}, \boldsymbol{\omega}_i)\,(\hat{\mathbf{n}}\cdot\boldsymbol{\omega}_i)\, d\boldsymbol{\omega}_i$$
The light $L_o$ leaving point $\mathbf{p}$ towards the viewer is the light it emits ($L_e$) plus, summed over every incoming direction $\boldsymbol{\omega}_i$ on the hemisphere $\Omega$ above the surface, the incoming light $L_i$ weighted by the cosine term and by the **BRDF** $f_r$.
:::

Real-time renderers approximate the integral in two parts: a **sum over punctual lights** (each light is one direction, so the integral collapses to one term per light) plus **image-based lighting** for light arriving from the whole environment.

:::formula The punctual-light form used in shaders
$$L_o = \sum_{k} f_r(\boldsymbol{\omega}_k, \boldsymbol{\omega}_o)\; E_k\; (\hat{\mathbf{n}}\cdot\boldsymbol{\omega}_k) \;+\; L_{\text{IBL}}$$
$E_k$ is light $k$'s colour × intensity × attenuation (Chapter 10).
:::

:::def BRDF
The **bidirectional reflectance distribution function** $f_r(\boldsymbol{\omega}_i, \boldsymbol{\omega}_o)$: the ratio of light reflected towards $\boldsymbol{\omega}_o$ to the light arriving from $\boldsymbol{\omega}_i$. A physically plausible BRDF is non-negative, symmetric in its two directions (Helmholtz reciprocity) and **energy conserving**: it never reflects more light than it receives, $\int_\Omega f_r\,(\hat{\mathbf{n}}\cdot\boldsymbol{\omega}_o)\,d\boldsymbol{\omega}_o \le 1$.
:::

### The Lambert BRDF and the mysterious π

:::formula Lambertian diffuse BRDF
$$f_{\text{diffuse}} = \frac{\mathbf{c}_{\text{diff}}}{\pi}$$
:::

:::calc Where the π comes from
A perfectly matte white surface reflects all light it receives, equally in every direction: $f = \rho$ constant. Energy conservation requires $\int_\Omega \rho\cos\theta\,d\omega = 1$. In spherical coordinates
$$\int_0^{2\pi}\!\!\int_0^{\pi/2}\cos\theta\sin\theta\,d\theta\,d\phi = 2\pi\cdot\tfrac{1}{2} = \pi,$$
so $\rho\,\pi = 1$ and $\rho = 1/\pi$. A white Lambertian BRDF is $1/\pi \approx 0.318$, not 1.
:::

## Microfacet theory

:::def Microfacets
At a microscopic scale every surface is a landscape of tiny perfect mirrors (microfacets) facing in slightly different directions. **Roughness** describes how spread out their orientations are. Only facets whose normal equals the half vector $\hat{\mathbf{h}}$ reflect light from $\hat{\mathbf{l}}$ into $\hat{\mathbf{v}}$; some of those are hidden by neighbouring bumps (shadowing and masking); and each reflects a fraction given by Fresnel.
:::

@fig(microfacets) A smooth surface has facets aligned with the normal (a sharp highlight); a rough surface has facets pointing in many directions, so reflections spread into a broad, dim highlight. Bumps also block incoming light (shadowing) and outgoing light (masking).

:::formula Cook–Torrance specular BRDF
$$f_{\text{spec}}(\hat{\mathbf{l}}, \hat{\mathbf{v}}) = \frac{D(\hat{\mathbf{h}})\;F(\hat{\mathbf{v}}, \hat{\mathbf{h}})\;G(\hat{\mathbf{l}}, \hat{\mathbf{v}})}{4\,(\hat{\mathbf{n}}\cdot\hat{\mathbf{l}})\,(\hat{\mathbf{n}}\cdot\hat{\mathbf{v}})}$$
- $D$: the **normal distribution function**, the density of facets aligned with $\hat{\mathbf{h}}$ (size and shape of the highlight).
- $F$: **Fresnel**, the fraction of light each facet reflects (rises at grazing angles).
- $G$: **geometry (shadowing–masking)**, the fraction of those facets visible to both light and viewer.
- The denominator converts from facet space to the macro surface. It is often merged with $G$ into a **visibility** term $V = G / (4\,(\hat{\mathbf{n}}\cdot\hat{\mathbf{l}})(\hat{\mathbf{n}}\cdot\hat{\mathbf{v}}))$, so $f_{\text{spec}} = D\,V\,F$.
:::

### D: the GGX (Trowbridge–Reitz) distribution

:::formula GGX normal distribution
$$D_{\text{GGX}}(\hat{\mathbf{h}}) = \frac{\alpha^2}{\pi\,\big((\hat{\mathbf{n}}\cdot\hat{\mathbf{h}})^2(\alpha^2 - 1) + 1\big)^2}, \qquad \alpha = \text{roughness}^2$$
Squaring the artist-facing roughness ($\alpha = r^2$, as three.js, glTF and Unreal do) makes the slider feel perceptually linear. GGX has a long "tail" that gives highlights a soft glow, matching measured materials better than Blinn–Phong.
:::

@fig(ggx_curves) GGX distributions for several roughness values. Smooth surfaces concentrate facets around the normal (a tall, narrow peak: a small bright highlight); rough surfaces spread them out (a low, wide hump: a large dim highlight).

:::calc How peaked is the highlight?
Roughness $0.5$: $\alpha = 0.25$, $\alpha^2 = 0.0625$.

- At the centre ($\hat{\mathbf{n}}\cdot\hat{\mathbf{h}} = 1$): $D = 0.0625/(\pi\cdot0.0625^2) = 1/(0.0625\pi) = 5.09$.
- Slightly off ($\hat{\mathbf{n}}\cdot\hat{\mathbf{h}} = 0.95$, about 18°): denominator $(0.9025\times(-0.9375) + 1)^2 = 0.1539^2 = 0.0237$, so $D = 0.0625/(\pi\times0.0237) = 0.84$.

Moving the half vector 18° off the normal drops the facet density by a factor of six: that is the highlight's falloff.
:::

### G: Smith shadowing–masking

:::formula Smith G with the Schlick–GGX approximation
$$G(\hat{\mathbf{l}}, \hat{\mathbf{v}}) = G_1(\hat{\mathbf{l}})\,G_1(\hat{\mathbf{v}}),\qquad G_1(\hat{\mathbf{x}}) = \frac{\hat{\mathbf{n}}\cdot\hat{\mathbf{x}}}{(\hat{\mathbf{n}}\cdot\hat{\mathbf{x}})(1-k) + k},\qquad k = \frac{(r+1)^2}{8}$$
This version (from Unreal's 2013 course notes, also in LearnOpenGL) is the easiest to learn. three.js uses the more accurate **height-correlated** Smith visibility directly:
$$V = \frac{0.5}{(\hat{\mathbf{n}}\cdot\hat{\mathbf{v}})\sqrt{(\hat{\mathbf{n}}\cdot\hat{\mathbf{l}})^2(1-\alpha^2) + \alpha^2} + (\hat{\mathbf{n}}\cdot\hat{\mathbf{l}})\sqrt{(\hat{\mathbf{n}}\cdot\hat{\mathbf{v}})^2(1-\alpha^2) + \alpha^2}}$$
:::

### F: Fresnel and the Schlick approximation

Look at a lake: straight down you see the bottom, at a shallow angle you see a mirror of the sky. All materials reflect more at grazing angles. This is the **Fresnel effect**.

:::formula Schlick's Fresnel approximation
$$F(\hat{\mathbf{v}}, \hat{\mathbf{h}}) = F_0 + (1 - F_0)\,(1 - \hat{\mathbf{v}}\cdot\hat{\mathbf{h}})^5$$
$F_0$ is the reflectance looking straight at the surface. For a dielectric with index of refraction $n$ (in air), $F_0 = \left(\frac{n - 1}{n + 1}\right)^2$. At grazing angles every material approaches 100% reflection.
:::

@fig(fresnel_curve) Schlick Fresnel against viewing angle. Water and glass reflect only 2–4% head-on but most of the light at grazing angles; gold reflects strongly at every angle and tints its reflections.

:::calc Fresnel for glass and water
- Glass, $n = 1.5$: $F_0 = (0.5/2.5)^2 = 0.04$. Water, $n = 1.33$: $F_0 = (0.33/2.33)^2 = 0.020$.
- Glass at a grazing view with $\hat{\mathbf{v}}\cdot\hat{\mathbf{h}} = 0.1$: $F = 0.04 + 0.96\times0.9^5 = 0.04 + 0.96\times0.590 = 0.607$, about fifteen times the head-on reflection.
:::

### Putting it together: one pixel by hand

:::calc Cook–Torrance for a plastic surface
Surface normal $\hat{\mathbf{n}} = (0,1,0)$, light from $\hat{\mathbf{l}} = (0.707, 0.707, 0)$ with $E = 3$, viewer at $\hat{\mathbf{v}} = (-0.6, 0.8, 0)$. Material: base colour $0.8$ (grey plastic), roughness $0.5$, metalness $0$ (so $F_0 = 0.04$).

1. Half vector $\hat{\mathbf{h}} = \text{normalise}(\hat{\mathbf{l}} + \hat{\mathbf{v}}) = (0.071, 0.997, 0)$. Dots: $\hat{\mathbf{n}}\cdot\hat{\mathbf{l}} = 0.707$, $\hat{\mathbf{n}}\cdot\hat{\mathbf{v}} = 0.800$, $\hat{\mathbf{n}}\cdot\hat{\mathbf{h}} = 0.997$, $\hat{\mathbf{v}}\cdot\hat{\mathbf{h}} = 0.755$.
2. $D$ with $\alpha^2 = 0.0625$: $D = 4.40$ (near the peak of 5.09, since $\hat{\mathbf{h}}$ is close to $\hat{\mathbf{n}}$).
3. $V$ (height-correlated): $\frac{0.5}{0.583 + 0.576} = 0.432$.
4. $F = 0.04 + 0.96\,(1 - 0.755)^5 = 0.0408$.
5. Specular BRDF $= D\,V\,F = 4.40\times0.432\times0.0408 = 0.0776$.
6. Diffuse BRDF $= (1 - F)\cdot 0.8/\pi = 0.959\times0.2546 = 0.244$.
7. $L_o = (0.244 + 0.078)\times E\times(\hat{\mathbf{n}}\cdot\hat{\mathbf{l}}) = 0.322\times3\times0.707 = 0.683$.

The same geometry with **gold** (metalness 1, $F_0 = (1.00, 0.71, 0.29)$, no diffuse): $F \approx (1.00, 0.71, 0.29)$, specular $\approx (1.90, 1.35, 0.55)$, so $L_o \approx (4.03, 2.86, 1.17)$: a bright, gold-tinted highlight that tone mapping then compresses.
:::

## The metal–roughness workflow {foundation}

| Parameter | Range | Meaning |
|---|---|---|
| `color` / `map` (base colour) | sRGB colour | Albedo for dielectrics; **reflectance colour ($F_0$)** for metals |
| `metalness` | 0 or 1 (in between only for transitions like rust or dust) | Dielectric (plastic, wood, skin, stone) vs conductor (metal) |
| `roughness` | 0 (mirror) to 1 (chalk) | Microfacet spread; the most important artistic control |
| `ior` (Physical) | 1.0–2.333, default 1.5 | Sets $F_0$ for dielectrics |
| `emissive` | colour × intensity | Self-illumination, added after lighting |

:::formula How three.js derives the BRDF inputs
$$F_0 = \text{mix}\big(0.04,\ \text{baseColor},\ \text{metalness}\big),\qquad \mathbf{c}_{\text{diff}} = \text{baseColor}\cdot(1 - \text{metalness})$$
Dielectrics: white-ish 4% specular and coloured diffuse. Metals: **no diffuse at all**, coloured specular. (With `MeshPhysicalMaterial`, $F_0$ also follows `ior`, `specularIntensity` and `specularColor`.)
:::

| Material | $F_0$ (linear) | Notes |
|---|---|---|
| Water | 0.02 | |
| Plastic, glass, most dielectrics | 0.04–0.05 | Grey; colour comes from diffuse |
| Diamond | 0.17 | High IOR (2.42) |
| Iron | (0.56, 0.57, 0.58) | |
| Aluminium | (0.91, 0.92, 0.92) | |
| Silver | (0.95, 0.93, 0.88) | |
| Gold | (1.00, 0.71, 0.29) | |
| Copper | (0.95, 0.64, 0.54) | |

@fig(pbr_grid) A metalness × roughness grid rendered per pixel with the Cook–Torrance formulas of this chapter (GGX, height-correlated Smith, Schlick Fresnel) under one light and a simple sky environment. Top row: dielectric (metalness 0); bottom row: metal (gold base colour).

:::tip Plausible values
Real albedos are never pure black or white: charcoal is about 0.04 and fresh snow about 0.9 (linear). Keep base colours roughly between 0.03 and 0.9 linear (about 50–240 in sRGB). Keep metalness at exactly 0 or 1 for clean materials. Most variety in real surfaces lives in the **roughness** map (fingerprints, scratches, wear), so spend texture effort there.
:::

:::apichange Behaviour change: energy conservation in PBR materials
Older tutorials: screenshots and tuned values from before r181, where rough materials (roughness above 0.5) lost energy and looked darker.
Current approach: three.js compensates for multiple scattering between microfacets, so rough materials are a little brighter. Re-check exposure and roughness values against reference screenshots after upgrading.
Why it changed: a single-scattering microfacet BRDF ignores light that bounces between facets more than once; compensation restores that energy and is more physically correct.
Version: improved in r181; diffuse, sheen and multiple-scattering terms reworked again in r186.
:::

## Image-based lighting

Point lights produce highlights only in a few directions. Real surfaces reflect **everything around them**: the sky, walls, windows. **Image-based lighting (IBL)** uses a panoramic HDR image of the surroundings as a light source from every direction.

:::def Environment map
A 360° image of the surroundings, usually an HDR equirectangular panorama (2:1) or a cube map, used both as the background and as light. In three.js, assigning it to `scene.environment` lights every PBR material; `scene.background` displays it.
:::

The IBL integral splits into a diffuse and a specular part, each precomputed so the shader needs only a texture lookup.

:::def Irradiance (diffuse IBL)
The cosine-weighted average of all incoming light around a normal: a very blurred version of the environment. three.js stores it in the lowest-detail levels of the PMREM (or as spherical harmonics in a `LightProbe`).
:::

:::def PMREM (prefiltered mipmapped radiance environment map)
A version of the environment pre-blurred for a range of roughness values and packed into one texture. A mirror (roughness 0) samples the sharp level, a rough surface a blurrier one. `PMREMGenerator` builds it on the GPU; three.js does it automatically when you assign an equirectangular texture to `scene.environment`.
:::

:::formula The split-sum approximation
$$\int_\Omega L_i\, f_{\text{spec}}\, (\hat{\mathbf{n}}\cdot\boldsymbol{\omega}_i)\,d\boldsymbol{\omega}_i \;\approx\; \underbrace{\text{prefiltered}(\hat{\mathbf{r}}, \text{roughness})}_{\text{PMREM lookup}}\;\cdot\; \underbrace{\big(F_0\cdot A + B\big)}_{\text{BRDF lookup}}$$
Brian Karis (Unreal, 2013) split the specular integral into a product of two separately precomputable integrals: the environment blurred by roughness (looked up along the reflection vector $\hat{\mathbf{r}}$), and the BRDF's response, which depends only on $\hat{\mathbf{n}}\cdot\hat{\mathbf{v}}$ and roughness and reduces to a scale $A$ and bias $B$ on $F_0$. three.js computes $A$ and $B$ with a fast analytic fit instead of a lookup texture.
:::

@fig(pmrem_chain) The environment pre-blurred for increasing roughness. A shader picks the level matching its roughness and samples it in the reflection direction.

```js title="three.js — HDR environment lighting"
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";     // named RGBELoader before r180
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const hdr = await new HDRLoader().loadAsync("studio_small_08_2k.hdr");
hdr.mapping = THREE.EquirectangularReflectionMapping;   // three.js builds the PMREM automatically
scene.environment = hdr;                                // lights every PBR material
scene.background = hdr;                                 // optional
scene.backgroundBlurriness = 0.4;                       // blur only the background
scene.environmentIntensity = 1.0;                       // global IBL strength
scene.environmentRotation.y = Math.PI / 4;              // rotate the lighting (matches object rotation since r184)

// no HDR file? a procedural neutral studio:
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
```

:::apichange RGBELoader → HDRLoader
Older tutorials: `import { RGBELoader } from "three/addons/loaders/RGBELoader.js"`.
Current approach: `import { HDRLoader } from "three/addons/loaders/HDRLoader.js"` with the same `load`/`loadAsync` usage. `RGBMLoader` was removed; use `HDRLoader`, `EXRLoader`, `HDRCubeTextureLoader` or `UltraHDRLoader`.
Why it changed: renamed after the `.hdr` (Radiance RGBE) files it loads; behaviour is unchanged.
Version: r180.
:::


```jsx title="R3F — drei Environment"
import { Environment, Lightformer } from "@react-three/drei";

// three alternatives: use one per scene
const City = () => <Environment preset="city" />;   // downloads a small HDR from a CDN
const Studio = () => <Environment files="/hdr/studio.hdr" background backgroundBlurriness={0.4} environmentIntensity={1} />;
const Custom = () => (
  <Environment resolution={256}>                   {/* build your own studio from glowing cards */}
    <Lightformer form="rect" intensity={4} position={[0, 3, -2]} scale={[6, 2, 1]} />
    <Lightformer form="ring" intensity={2} color="#ffd" position={[-3, 1, 2]} scale={2} />
  </Environment>
);
```

:::warn Metals need an environment
A metal has no diffuse colour; everything you see is reflection. Under only punctual lights a mirror-like metal is black except for tiny highlights. Always give PBR scenes an environment map, even a dim neutral one; for product shots it is the single biggest quality improvement.
:::

## MeshPhysicalMaterial

`MeshPhysicalMaterial` extends `MeshStandardMaterial` with layers that model specific real materials. Each feature costs shader time, so enable only what you need (three.js only compiles the enabled features into the program).

| Property | Models | Typical values / notes | glTF extension |
|---|---|---|---|
| `clearcoat`, `clearcoatRoughness`, `clearcoatNormalMap` | A thin varnish layer | Car paint, lacquered wood, carbon fibre | `KHR_materials_clearcoat` |
| `sheen`, `sheenColor`, `sheenRoughness` | Velvety back-scattering at grazing angles | Fabric, velvet, peach skin | `KHR_materials_sheen` |
| `transmission`, `thickness`, `attenuationColor`, `attenuationDistance` | Light passing through (refraction, absorption) | Glass, liquids, gems; renders a transmission pass | `KHR_materials_transmission`, `_volume` |
| `ior` | Index of refraction | 1.0–2.333; glass 1.5, water 1.33, diamond 2.42 | `KHR_materials_ior` |
| `dispersion` | Wavelength-dependent refraction (rainbow fringes) | Diamonds, prisms | `KHR_materials_dispersion` |
| `iridescence`, `iridescenceIOR`, `iridescenceThicknessRange` | Thin-film interference | Soap bubbles, oil slicks, beetle shells | `KHR_materials_iridescence` |
| `anisotropy`, `anisotropyRotation` | Stretched highlights along a direction | Brushed metal, hair, vinyl records | `KHR_materials_anisotropy` |
| `specularIntensity`, `specularColor` | Override dielectric $F_0$ strength and tint | Fine-tuning skin, fabric | `KHR_materials_specular` |
| `retroreflectivity` (r186) | Light reflected back towards its source (0–1) | Road signs, safety vests, cat's eyes | — |

:::calc Thickness and absorption of tinted glass
`attenuationColor` is the colour white light becomes after travelling `attenuationDistance` through the material (Beer–Lambert absorption $T = c^{\,d/d_0}$ per channel). With `attenuationColor = (0.6, 0.9, 0.7)` and `attenuationDistance = 0.1` m, light crossing 0.2 m of glass keeps $(0.6^2, 0.9^2, 0.7^2) = (0.36, 0.81, 0.49)$: thick parts look a deeper green than thin edges, which is what makes glass look solid.
:::

:::warn Transmission is expensive
`transmission > 0` makes three.js render the opaque scene into an extra render target every frame (and blur it by roughness) so transmissive objects can sample what is behind them. Several glass objects do not see each other through themselves. For many small glass items consider `opacity`-based fakes, or drei's `MeshTransmissionMaterial`, which adds chromatic aberration and supports seeing other transmissive objects at a further cost.
:::

```jsx title="R3F — physical materials"
const Showcase = () => (
  <>
    <mesh>  {/* car paint */}
      <sphereGeometry args={[1, 64, 32]} />
      <meshPhysicalMaterial color="#8b0000" metalness={0.6} roughness={0.35} clearcoat={1} clearcoatRoughness={0.05} />
    </mesh>
    <mesh position-x={2.5}>  {/* tinted glass */}
      <torusKnotGeometry args={[0.6, 0.2, 200, 32]} />
      <meshPhysicalMaterial transmission={1} roughness={0.05} thickness={0.4} ior={1.5}
        attenuationColor="#9fe8c8" attenuationDistance={0.5} />
    </mesh>
  </>
);
```

:::keypoints
- Rendering equation: outgoing = emitted + ∫ BRDF × incoming × cosθ; real time = sum of lights + IBL.
- Lambert BRDF = albedo/π (the π makes it energy conserving).
- Cook–Torrance specular = $DFG/(4\,(\hat{\mathbf{n}}\cdot\hat{\mathbf{l}})(\hat{\mathbf{n}}\cdot\hat{\mathbf{v}}))$ with GGX $D$, Smith $G$, Schlick $F$; $\alpha = \text{roughness}^2$.
- $F_0 = 0.04$ for most dielectrics ($((n-1)/(n+1))^2$); metals use their base colour as $F_0$ and have no diffuse.
- IBL = irradiance (diffuse) + PMREM (prefiltered specular) × BRDF scale/bias (split sum).
- Always give PBR scenes an environment; metals depend on it.
- Physical extras (clearcoat, sheen, transmission, iridescence, anisotropy, dispersion) map to glTF `KHR_materials_*` extensions; transmission costs an extra pass.
:::

:::build PBR material lab
Problem: Recreate the metalness × roughness grid of [[fig:pbr_grid]] in three.js, then add clearcoat, sheen and transmission spheres beside it.
Requirements:
- An HDR environment with a background blur slider and an environment rotation slider.
- Tone mapping selectable between ACES, AgX and Neutral.
- Base colours in a plausible range (no pure black or white).
Constraints: one material per sphere, created once; no recompiles while sliders move.
Hints: change uniforms (`roughness`, `metalness`) rather than features; transmission adds a render pass, so keep only one transmissive sphere.
Relevant APIs: `HDRLoader`, `scene.environment`, `scene.backgroundBlurriness`, `scene.environmentRotation`, `MeshPhysicalMaterial`, `renderer.toneMapping`.
Expected result: rough metals that are bright enough, glass that reads as glass, and a clear sense of how each tone mapper changes the same scene.
:::

## Interview questions

:::qa What does "physically based" mean, and what makes MeshStandardMaterial physically based? {level=mid}
It means shading follows real light physics: energy conservation (never reflect more than received), a microfacet specular model (GGX distribution, Smith shadowing, Fresnel), Lambertian diffuse scaled so diffuse plus specular stays within the incoming energy, and physically meaningful parameters (base colour, metalness, roughness). `MeshStandardMaterial` implements exactly this Cook–Torrance metal–roughness model, the same as glTF's core material, so assets look consistent across engines and under any lighting.
:::

:::qa Explain the D, F and G terms of the Cook–Torrance BRDF. {level=senior}
$D$ (GGX) is the statistical density of microfacets whose normal equals the half vector, the ones that can reflect light into the eye; its width is set by roughness and it shapes the highlight. $F$ (Fresnel, Schlick's approximation) is how much of the light each facet reflects, rising from $F_0$ head-on to 1 at grazing angles; $F_0$ is about 0.04 for dielectrics and the base colour for metals. $G$ (Smith) is the fraction of those facets not shadowed from the light or masked from the viewer by neighbouring bumps; it darkens rough surfaces at grazing angles. The $4(\hat{\mathbf{n}}\cdot\hat{\mathbf{l}})(\hat{\mathbf{n}}\cdot\hat{\mathbf{v}})$ denominator converts facet-space quantities to the macro surface.
:::

:::qa Why do metals look black in my scene? {level=junior}
In the metal–roughness model a metal has no diffuse component: its base colour becomes the specular reflectance. With only punctual lights it shows tiny highlights and otherwise reflects nothing, which reads as black. Give the scene an environment map (`scene.environment` with an HDR or `RoomEnvironment`, or drei's `<Environment>`), so the metal has a world to reflect.
:::

:::qa What is the split-sum approximation? {level=senior}
The specular IBL integral of environment radiance times the BRDF over the hemisphere is too expensive per pixel. Karis's split sum approximates it as the product of two integrals: (1) the environment convolved with the GGX lobe for a given roughness, precomputed per roughness level into a prefiltered mip chain (PMREM) and sampled along the reflection vector; and (2) the integral of the BRDF itself, which depends only on $\hat{\mathbf{n}}\cdot\hat{\mathbf{v}}$ and roughness, giving a scale and bias applied to $F_0$ (a 2D lookup table, or an analytic fit as in three.js). The approximation assumes $\hat{\mathbf{n}} = \hat{\mathbf{v}} = \hat{\mathbf{r}}$ when prefiltering, which loses the stretched reflections at grazing angles.
:::

:::qa How would you make convincing glass in three.js, and what does it cost? {level=mid}
Use `MeshPhysicalMaterial` with `transmission: 1`, low `roughness`, `ior` 1.5, a `thickness` (and `attenuationColor`/`attenuationDistance` for tint), plus an environment map for reflections, since Fresnel makes glass mostly reflective at grazing angles. The cost: three.js renders the opaque scene into an extra transmission render target each frame and samples it blurred by roughness, and transmissive objects do not refract each other. For many glass objects or a stylised look, drei's `MeshTransmissionMaterial` or cheaper fakes (environment-mapped reflection with low opacity) may be better.
:::
