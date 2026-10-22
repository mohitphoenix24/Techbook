---
title: Colour, HDR and Tone Mapping
summary: Why lighting must be computed in linear light, the exact sRGB transfer function, three.js colour management, high dynamic range and exposure, the Reinhard, ACES, AgX and Neutral tone mappers compared with numbers and pictures, banding and dithering, and the R3F defaults.
difficulty: Intermediate
prereqs: Chapter 9
time: 45–60 minutes
outcome: Run a correct linear workflow, convert between sRGB and linear values, and choose a tone mapper for games or for accurate product colours.
---

## Light is linear, displays are not {foundation}

Physical light adds up: two identical lamps give exactly twice the light of one. Lighting maths (sums of light contributions, blending, blurring, antialiasing) is only correct on numbers **proportional to light energy**, called **linear** values.

Human vision, however, is far more sensitive to differences between dark tones than between bright ones. Image files and displays therefore store colour **non-linearly** to spend their limited bits where the eye can see them: that encoding is the **sRGB transfer function**.

:::def Colour space
A colour space is defined by three choices: its **primaries** (which red, green and blue), its **white point** (sRGB uses D65), and its **transfer function** (how numbers map to light). *sRGB* and *Linear-sRGB* share primaries and white point and differ only in the transfer function: Linear-sRGB is proportional to light, sRGB is perceptually encoded.
:::

:::formula The sRGB transfer functions
$$\text{encode}(L) = \begin{cases} 12.92\,L & L \le 0.0031308 \\ 1.055\,L^{1/2.4} - 0.055 & \text{otherwise} \end{cases}\qquad \text{decode}(V) = \begin{cases} V/12.92 & V \le 0.04045 \\ \left(\dfrac{V + 0.055}{1.055}\right)^{2.4} & \text{otherwise}\end{cases}$$
$L$ is linear light, $V$ the encoded value, both in $[0,1]$. The curve is close to a power of 2.2, which is why it is loosely called "gamma", a term the three.js documentation avoids because it is ambiguous.
:::

@fig(srgb_curve) The sRGB transfer function. Half the light (linear 0.5) is stored as 0.735; the stored value 0.5 means only 21% of full light. Encoding spends more of the 256 levels on dark tones.

:::calc Mid-grey is not 0.5
1. Linear $0.5$ (half the light of white) encodes to $1.055\times0.5^{1/2.4} - 0.055 = 0.735$, the hex value `#BCBCBC`.
2. The hex colour `#808080` (encoded $128/255 = 0.502$) decodes to linear $0.216$: only about a fifth of white's light.
3. Photographic "18% grey" (linear $0.18$) encodes to $0.461$, close to the middle of the 0–255 range. That is the point of the encoding: perceptually even steps.
:::

:::calc Why blending must be linear
An edge pixel half covered by a white line on a black background should emit half the light.

- In linear space: $(0 + 1)/2 = 0.5$ linear, displayed as encoded $0.735$. Correct.
- Averaging the encoded values: $(0 + 1)/2 = 0.5$ encoded, which displays only $0.214$ linear light. Edges look too dark and thin; gradients between colours pass through muddy, dark midpoints.
:::

## Colour management in three.js

three.js follows a **linear workflow**: convert every input to linear, compute everything in linear, convert once at the end.

| Role | Colour space | three.js setting |
|---|---|---|
| Input: colour textures (base colour, emissive), CSS/hex colours | sRGB | `texture.colorSpace = SRGBColorSpace`; hex/CSS converted automatically |
| Input: data textures (normal, roughness, metalness, AO) | none (linear data) | `NoColorSpace` (default) |
| Input: HDR environment maps, EXR | Linear-sRGB | set by `HDRLoader`/`EXRLoader` |
| Working space (lighting, blending, render targets) | Linear-sRGB | `THREE.ColorManagement.workingColorSpace` |
| Output to the canvas | sRGB | `renderer.outputColorSpace = SRGBColorSpace` (default) |

:::def ColorManagement
`THREE.ColorManagement.enabled` (true by default) makes `Color` setters convert sRGB inputs (hex numbers, CSS strings) to the linear working space, and getters convert back. So `new THREE.Color(0x808080).r` is $0.2159$, while `getHex()` returns `0x808080` again. Plain `color.r = 0.5` is taken as already linear.
:::

:::apichange Encodings → colour spaces
Older tutorials: `renderer.outputEncoding = THREE.sRGBEncoding;` and `texture.encoding = THREE.sRGBEncoding;`
Current approach: `renderer.outputColorSpace = THREE.SRGBColorSpace` (already the default) and `texture.colorSpace = THREE.SRGBColorSpace` for colour textures only. `THREE.LinearEncoding` became `THREE.LinearSRGBColorSpace`.
Why it changed: "encoding" mixed up transfer functions and colour spaces; the colour-space API describes both and made colour management on by default (`ColorManagement.enabled = true`).
Version: r152.
:::


```js title="three.js — colours in and out"
const c = new THREE.Color("#808080");      // sRGB input, stored linear
console.log(c.r.toFixed(4));               // "0.2159"
console.log(c.getHexString());             // "808080" (converted back to sRGB)
c.setRGB(0.5, 0.5, 0.5, THREE.SRGBColorSpace);   // say explicitly which space the numbers are in
```

:::warn Custom shaders and render targets
`ShaderMaterial` writes whatever your fragment shader outputs. To get the renderer's tone mapping and sRGB conversion, add `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` at the end of `main()`. Render targets stay linear: the sRGB conversion must happen exactly **once**, at the final output (with post-processing that is the `OutputPass`, or automatically in `RenderPipeline`). Converting twice gives a washed-out image; forgetting gives a dark, contrasty one.
:::

## High dynamic range

:::def High dynamic range (HDR)
Light values that are not limited to $[0, 1]$. Real scenes span huge ranges: a sunlit sky can be thousands of times brighter than a shadowed corner. Rendering in HDR (float buffers, values above 1) keeps that information: bright highlights stay distinguishable, bloom can find what is truly bright, and exposure can be adjusted afterwards.
:::

HDR sources in three.js: `.hdr` (RGBE, `HDRLoader`, called `RGBELoader` before r180), `.exr` (`EXRLoader`), Ultra HDR JPEGs with gain maps (`UltraHDRLoader`, small files with HDR range), and half-float render targets (`HalfFloatType`) for post-processing.

### Exposure

:::formula Exposure in stops
$$L_{\text{exposed}} = L\cdot 2^{\,\text{EV}}$$
Each **stop** (EV) doubles or halves the light, as on a camera. three.js applies `renderer.toneMappingExposure` as the multiplier before the tone curve, so `toneMappingExposure = 2` is +1 stop and `0.5` is −1 stop.
:::

## Tone mapping

A display can only show $[0, 1]$. **Tone mapping** compresses the open HDR range into it with a smooth curve, instead of clipping everything above 1 to flat white.

:::def Tone mapping
A function $T: [0, \infty) \to [0, 1)$ applied to each linear HDR colour before sRGB encoding. Good tone mappers keep mid-tones roughly where they were, roll highlights off smoothly so detail survives, and (ideally) avoid shifting hues when bright saturated colours approach white.
:::

| Operator | three.js constant | Character | Use for |
|---|---|---|---|
| None | `NoToneMapping` | Values clip at 1 | UI, unlit scenes, when post-processing tone-maps later |
| Linear | `LinearToneMapping` | Exposure scaling only, clips | Debugging |
| Reinhard | `ReinhardToneMapping` | $x/(1+x)$: soft but flat and greyish | Simple, predictable |
| Cineon | `CineonToneMapping` | Film-like | Stylised |
| ACES Filmic | `ACESFilmicToneMapping` | Contrasty, saturated, cinematic; bright colours skew (blue → purple, red → orange) | Games, cinematic scenes; R3F's default |
| AgX | `AgXToneMapping` | Desaturates bright highlights gracefully, no hue skew; flatter | Scenes with bright saturated lights; Blender's default since 4.0 |
| Neutral (Khronos PBR Neutral) | `NeutralToneMapping` | Keeps base colours almost exact below the highlights | E-commerce and product configurators where colour accuracy matters |
| Custom | `CustomToneMapping` | Your own GLSL | Special looks |

:::formula Two classic curves
$$T_{\text{Reinhard}}(x) = \frac{x}{1 + x} \qquad T_{\text{ACES fit}}(x) = \frac{x\,(2.51x + 0.03)}{x\,(2.43x + 0.59) + 0.14}$$
The second is Krzysztof Narkowicz's popular approximation of the ACES filmic curve (it expects input pre-scaled by about 0.6). three.js uses a closer fit of the ACES reference transforms, but the shape is the same: a toe that deepens shadows and a shoulder that rolls off highlights.
:::

@fig(tonemap_curves) Tone-mapping curves for grey values (input on a log axis). Clipping loses everything above 1; Reinhard compresses gently but lowers mid-tones; ACES adds contrast; Neutral leaves values below about 0.76 almost untouched.

:::calc Mapping a few HDR values
| Linear input | Reinhard | ACES fit (×0.6 pre-scale) |
|---|---|---|
| 0.18 (mid-grey) | 0.153 | 0.140 |
| 1.0 | 0.500 | 0.673 |
| 2.0 | 0.667 | 0.840 |
| 4.0 | 0.800 | 0.934 |
| 10.0 | 0.909 | 0.993 |

Reinhard maps 1.0 (paper white) to only 0.5, which is why Reinhard scenes look dim unless exposure is raised. ACES pushes 4.0 to 0.93: highlights are bright yet still not clipped.
:::

@fig(tonemap_spheres) The same HDR render (a strong warm key light and a saturated blue rim light) through four tone mappers, computed per pixel. Without tone mapping the bright side clips to a flat yellow-white; Reinhard keeps detail but looks greyish and dim; ACES adds contrast and deep shadows; Neutral keeps the warm base colour most faithfully.

:::tip Choosing a tone mapper
For a product configurator, use **Neutral**: a sofa's fabric colour on screen should match the swatch. For games and cinematic scenes, **ACES** or **AgX** (AgX if you have bright coloured lights or neon). Whatever you choose, pick it early: artists tune materials and lights *through* the tone mapper, and switching later changes everything.
:::

### Where tone mapping happens

- **Without post-processing**, three.js applies tone mapping and sRGB conversion at the end of each material's fragment shader, but only when rendering to the canvas (not into render targets).
- **With post-processing**, the scene renders linear HDR into a half-float target, effects run in linear space, and tone mapping + sRGB happen once at the end: `OutputPass` for `EffectComposer`, built into `RenderPipeline` (its `outputColorTransform`) for WebGPU.
- Set `material.toneMapped = false` for things that must show their exact colour: UI panels, video screens, colour pickers.

## Banding and dithering

An 8-bit output has 256 levels per channel. A slow gradient (a dark sky, fog, a vignette) that spans only a few levels shows visible **bands**. **Dithering** adds a tiny amount of noise before quantisation so the bands break up into an even texture the eye averages away. Enable it with `material.dithering = true`, or add noise in a final post-processing pass. Rendering into half-float targets keeps intermediate steps free of banding.

:::deep Wide gamut: Display P3
Many phones, Macs and iPads can show colours outside sRGB's gamut (Display P3). three.js supports P3 through `ColorManagement` definitions in the addons (`DisplayP3ColorSpace`, `LinearDisplayP3ColorSpace` in `three/addons/math/ColorSpaces.js`), and WebGPU canvases can be configured for P3 output. For most web 3D work sRGB remains the safe target; P3 matters for brand colours and premium product imagery.
:::

```jsx title="R3F — colour defaults and how to change them"
// R3F defaults: outputColorSpace = SRGBColorSpace, toneMapping = ACESFilmicToneMapping
const ProductViewer = () => (                          // accurate colours for products
  <Canvas gl={{ toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.1 }}><Scene /></Canvas>
);
const FlatScene = () => <Canvas flat><Scene /></Canvas>;      // NoToneMapping: UI-like scenes, or post-processing tone-maps
const LinearOutput = () => <Canvas linear><Scene /></Canvas>; // no sRGB output conversion: only if you handle it yourself
```

:::keypoints
- Lighting, blending and filtering must use linear values; files and displays use sRGB encoding.
- sRGB: linear 0.5 ↔ encoded 0.735; encoded 0.5 ↔ linear 0.214.
- three.js: colour textures `SRGBColorSpace`, data textures `NoColorSpace`, working space Linear-sRGB, output sRGB.
- HDR keeps values above 1; exposure multiplies by $2^{\text{EV}}$ before tone mapping.
- Reinhard $x/(1+x)$; ACES filmic for contrast; AgX for bright saturated light; Neutral for accurate product colours.
- Convert to sRGB exactly once; with post-processing, at the very end (`OutputPass` / `RenderPipeline`).
- Dither or use float targets to fight banding.
:::

## Interview questions

:::qa What is a linear workflow and why does it matter? {level=mid}
All colour inputs are converted to linear light (sRGB textures decoded, hex colours converted), all lighting, blending and filtering is done in linear space where values are proportional to energy, and the result is tone-mapped and encoded to sRGB once for display. It matters because the maths of light is additive only in linear space; working in sRGB makes lighting too contrasty, falloffs wrong, blends and antialiased edges dark, and PBR materials incorrect.
:::

:::qa My scene looks washed out after adding post-processing. What happened? {level=mid}
Usually a double conversion: the scene was converted to sRGB (or tone-mapped) when rendering into the composer's target, and again by the final pass. With `EffectComposer` the scene should render linear HDR into a half-float target, and only the final `OutputPass` should apply tone mapping and sRGB conversion. The opposite symptom, a too dark and contrasty image, means the conversion is missing entirely.
:::

:::qa Which tone mapping would you choose for an e-commerce configurator and why? {level=mid}
`NeutralToneMapping` (Khronos PBR Neutral). It was designed so that base colours under neutral lighting come out almost exactly as specified, with highlights compressed only near the top of the range. ACES Filmic adds contrast and shifts hues of bright, saturated colours, which would misrepresent a product's colour compared with its swatch or photograph. I would also use a neutral environment map and keep exposure fixed.
:::

:::qa What does `new THREE.Color(0x808080).r` return and why? {level=junior}
About 0.216, not 0.5. Hex and CSS colours are sRGB-encoded, and with `ColorManagement.enabled` (the default) three.js converts them into its linear working colour space when you set them. `getHex()` converts back and returns `0x808080`. To store raw numbers without conversion, set components directly or pass `LinearSRGBColorSpace` to the setter.
:::

:::qa What is the difference between ACES and AgX? {level=senior}
Both are filmic curves with a toe and a shoulder. ACES Filmic (as approximated in real-time engines) is contrasty and saturated, but bright saturated colours skew in hue as they approach white (blues towards purple, reds towards orange or yellow) and can clip harshly. AgX compresses in a way that desaturates highlights smoothly towards white without hue skews, at the cost of a flatter, less punchy default look. AgX suits scenes with intense coloured lights; ACES suits a classic cinematic look. three.js supports both.
:::
