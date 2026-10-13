---
title: Textures and UV Mapping
summary: How images are wrapped onto surfaces. UV coordinates, wrapping and repeat, magnification and minification filters, mipmaps and anisotropy with the maths of choosing a mip level, GPU memory budgets, every PBR map type, normal mapping and the TBN matrix, compressed KTX2 textures, and special texture types.
---

## UV coordinates

:::def UV coordinates
A 2D coordinate per vertex, $(u, v)$, saying which point of a texture belongs to that vertex. $u$ runs left to right and $v$ bottom to top across the image, from 0 to 1. The rasteriser interpolates UVs across each triangle, and the fragment shader samples the texture at the interpolated UV.
:::

:::def UV unwrapping
Cutting a 3D surface along **seams** and flattening it into the 0–1 square so a 2D image can be painted onto it, like flattening a cardboard box. Done in modelling tools (Blender's UV editor). Seams duplicate vertices (Chapter 8); stretching shows up as distorted textures.
:::

@fig(uv_mapping) A UV map. Each vertex of the mesh points at a location in the texture; the triangle in 3D shows the triangle cut out of the image.

:::note flipY
Images are stored top row first, but WebGL's texture origin is bottom-left. three.js flips images on upload (`texture.flipY = true`) so that $v = 0$ is the bottom of the picture. glTF uses the opposite convention, so `GLTFLoader` sets `flipY = false` on its textures. If you swap a texture on a glTF model by hand and it appears upside down, this is why.
:::

## Wrapping, repeat and transforms

| Property | Values | Effect |
|---|---|---|
| `wrapS`, `wrapT` | `ClampToEdgeWrapping` (default), `RepeatWrapping`, `MirroredRepeatWrapping` | What happens outside 0–1 in $u$ (S) and $v$ (T) |
| `repeat` | `Vector2` | Scales UVs: `repeat.set(4, 4)` tiles the image 4 × 4 (needs `RepeatWrapping`) |
| `offset` | `Vector2` | Shifts UVs (scrolling water, sprite-sheet frames) |
| `rotation`, `center` | radians, `Vector2` | Rotates UVs about `center` |
| `channel` | 0, 1, 2, 3 | Which UV set to use (`uv`, `uv1`, …): light maps often use a second set |

:::formula The UV transform three.js applies
$$\mathbf{uv}' = R(\text{rotation})\,\big((\mathbf{uv} - \mathbf{c})\odot\text{repeat}\big) + \mathbf{c} + \text{offset}$$
(three.js composes this into `texture.matrix`; call `texture.updateMatrix()` if you set `matrixAutoUpdate = false`.)
:::

:::calc Tiling floorboards to real size
A floor plane is 8 m × 6 m and the plank texture shows 2 m × 2 m of real wood. To keep planks the right size: `repeat.set(8/2, 6/2) = (4, 3)` with `RepeatWrapping` on both axes. If the floor is resized to 10 m × 6 m, update repeat to $(5, 3)$, otherwise the planks stretch.
:::

## Filtering: magnification and minification

A texture is a grid of **texels**. They rarely line up one-to-one with screen pixels:

- **Magnification**: one texel covers many pixels (a close-up). `magFilter`: `NearestFilter` (blocky, for pixel art) or `LinearFilter` (bilinear blend of the 4 nearest texels, smooth).
- **Minification**: many texels fall inside one pixel (far away). Sampling just one of them causes **aliasing**: shimmering moiré as the camera moves. The fix is mipmapping.

@fig(filtering) Magnifying a 6×6 texture: nearest filtering keeps hard texel edges (right for pixel art); bilinear filtering blends the four nearest texels (smooth, slightly blurry).

:::def Mipmaps
A chain of pre-shrunk copies of a texture, each half the width and height of the previous one, down to 1 × 1. When a texture is minified, the GPU samples the level whose texel size best matches the pixel size, so each sample already averages the right area. `LinearMipmapLinearFilter` (trilinear, the default `minFilter`) blends bilinear samples from the two nearest levels.
:::

:::formula Choosing a mip level
$$\lambda = \log_2 \rho, \qquad \rho = \max\left(\left\lVert\frac{\partial(u,v)\,s}{\partial x}\right\rVert, \left\lVert\frac{\partial(u,v)\,s}{\partial y}\right\rVert\right)$$
$\rho$ is the number of texels a one-pixel step covers ($s$ is the texture size; the derivatives come from neighbouring pixels in a 2×2 quad). Level $\lambda = 0$ is the full texture, level 1 is half size, and so on.
:::

:::calc Which mip level is used?
A 1024 × 1024 texture on a quad that covers 128 × 128 pixels on screen: each pixel spans $1024/128 = 8$ texels, so $\lambda = \log_2 8 = 3$: the GPU samples the $128\times128$ mip, which is exactly one texel per pixel.
:::

:::formula Mipmap memory
$$\text{total} = \text{base}\cdot\left(1 + \tfrac{1}{4} + \tfrac{1}{16} + \cdots\right) = \tfrac{4}{3}\,\text{base}$$
A full mip chain costs one third more memory.
:::

:::def Anisotropic filtering
Mipmaps assume the pixel's footprint on the texture is square. On surfaces seen at a grazing angle (a road stretching away) the footprint is a long thin ellipse, so trilinear filtering picks a level that is too blurry. Anisotropic filtering takes several samples along the long axis. Set `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()` (usually 16) on ground, road and floor textures; it is cheap on modern GPUs.
:::

:::warn Non-power-of-two textures
WebGL 2 supports mipmaps for any size, but power-of-two sizes (512, 1024, 2048) still mip down cleanly and are required by several compressed formats and block sizes. Keep textures power-of-two and square where possible; three.js resizes images only in specific legacy cases.
:::

## GPU memory budgets

The file size of a PNG or JPEG says nothing about GPU memory: images are **decoded** to raw pixels before upload.

:::calc What a 4K texture really costs
4096 × 4096 RGBA8: $4096^2\times 4$ bytes $= 64$ MiB, with mipmaps $\times 4/3 = 85.3$ MiB. A typical PBR material has base colour, normal and an ORM map: about **256 MiB** for one material. A 2.5 MB JPEG on disk becomes 85 MiB in VRAM.

The same texture in a GPU-compressed format: BC7 or ASTC 4×4 store 1 byte per texel ($16 \to 21.3$ MiB with mips); BC1/ETC1-class formats store 0.5 bytes per texel ($8 \to 10.7$ MiB). That is a **4–8× saving**, and the GPU samples compressed data directly.
:::

| Format | Bytes per texel | Notes |
|---|---|---|
| RGBA8 (PNG/JPEG/WebP decoded) | 4 | Universal, largest |
| RGBA16F (HDR, render targets) | 8 | Linear lighting data |
| BC7 / ASTC 4×4 | 1 | High quality; desktop (BC) / mobile and Apple (ASTC) |
| BC1 / ETC1 / ETC2 RGB | 0.5 | Smaller, lower quality, no or 1-bit alpha |
| KTX2 + Basis Universal | transcodes to the above | One file transcoded at load time to what the GPU supports |

## The PBR texture set

| Map | Material property | Colour space | Channel convention |
|---|---|---|---|
| Base colour (albedo) | `map` | **sRGB** | RGB colour, A alpha |
| Normal | `normalMap` (+ `normalScale`) | Linear (non-colour) | RGB = XYZ in tangent space |
| Roughness | `roughnessMap` | Linear | glTF: **G** channel |
| Metalness | `metalnessMap` | Linear | glTF: **B** channel |
| Ambient occlusion | `aoMap` (+ `aoMapIntensity`) | Linear | glTF: **R** channel (often a separate UV set) |
| Emissive | `emissiveMap` (+ `emissive`, `emissiveIntensity`) | sRGB | RGB glow colour |
| Alpha | `alphaMap` | Linear | G channel |
| Height | `displacementMap` (moves vertices) / `bumpMap` (fakes normals) | Linear | Greyscale |
| Light map | `lightMap` | Linear (HDR) | Baked lighting |
| Environment | `envMap` / `scene.environment` | Linear HDR | Equirect or cube (Chapter 13) |

:::tip ORM packing
glTF packs occlusion, roughness and metalness into one texture's R, G and B channels ("ORM"), and three.js reads roughness from G and metalness from B automatically, so the same texture object can be assigned to `aoMap`, `roughnessMap` and `metalnessMap`. One texture fetch and one third of the memory instead of three textures.
:::

:::warn Colour space mistakes
Only textures that hold **colours a human picked** (base colour, emissive) are sRGB. Data textures (normal, roughness, metalness, AO, height) are linear and must stay `NoColorSpace`. A base colour left as `NoColorSpace` looks washed out and too bright; a normal map marked sRGB gives wrong, bent lighting. `TextureLoader` leaves `colorSpace` as `NoColorSpace` by default, so set it yourself for colour maps. `GLTFLoader` sets it correctly for you.
:::

```js title="three.js — loading a PBR texture set"
const loader = new THREE.TextureLoader();
const load = (url, srgb = false) => {
  const t = loader.load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
};
const orm = load("planks_orm.jpg");
const floorMat = new THREE.MeshStandardMaterial({
  map: load("planks_color.jpg", true),
  normalMap: load("planks_normal.png"),
  aoMap: orm, roughnessMap: orm, metalnessMap: orm,   // R, G, B channels of one texture
});
```

```jsx title="R3F — drei's useTexture"
import { useTexture } from "@react-three/drei";

function Floor() {
  const maps = useTexture(
    { map: "planks_color.jpg", normalMap: "planks_normal.png", roughnessMap: "planks_orm.jpg" },
    (loaded) => {                                     // runs once the textures load
      const list = Array.isArray(loaded) ? loaded : Object.values(loaded);
      for (const t of list) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); }
    }
  );
  maps.map.colorSpace = THREE.SRGBColorSpace;         // colour map only
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[8, 8]} />
      <meshStandardMaterial {...maps} />               {/* the object's keys match material props */}
    </mesh>
  );
}
```

## Normal mapping and tangent space

:::def Normal map
A texture whose RGB values encode a **surface normal** per texel, adding fine detail (bricks, scratches, pores) to lighting without adding triangles. Values are stored in **tangent space**, relative to the surface itself, so the same map works however the surface is oriented or deformed. A flat area is the familiar light blue $(128, 128, 255)$, meaning "straight out of the surface".
:::

:::formula Decoding and transforming a tangent-space normal
$$\mathbf{n}_t = 2\,\mathbf{c} - 1, \qquad \mathbf{n}_{\text{world}} = \text{normalise}\big(\,[\,\hat{\mathbf{T}}\ \ \hat{\mathbf{B}}\ \ \hat{\mathbf{N}}\,]\ \mathbf{n}_t\big)$$
$\mathbf{c}\in[0,1]^3$ is the sampled colour. $\hat{\mathbf{T}}$ (tangent) follows the direction of increasing $u$, $\hat{\mathbf{B}}$ (bitangent) increasing $v$, $\hat{\mathbf{N}}$ is the geometric normal. The **TBN matrix** turns the map's normal into world (or view) space. `normalScale` scales the X and Y components to strengthen or weaken the effect.
:::

@fig(tbn) The tangent frame at a point on a surface. T follows the texture's u direction, B its v direction, N the surface normal. A normal-map texel is a direction in this frame.

:::calc Reading a normal-map texel
Texel colour $(200, 128, 220)$:

1. $\mathbf{c} = (200, 128, 220)/255 = (0.784, 0.502, 0.863)$.
2. $\mathbf{n}_t = 2\mathbf{c} - 1 = (0.569, 0.004, 0.725)$; length $0.922$; normalised $(0.617, 0.004, 0.787)$.
3. The detail normal leans towards $+T$ by $\arccos(0.787) = 38°$: a slope rising along the texture's $u$ direction, the side of a groove.
4. The flat colour $(128, 128, 255)$ decodes to $(0.004, 0.004, 1)$: straight up, no change.
:::

:::warn OpenGL versus DirectX normal maps
There are two conventions for the green channel: OpenGL-style (+Y up, used by three.js, glTF and Blender) and DirectX-style (+Y down, common in game-engine exports). A DirectX map lit in three.js makes bumps look like dents in one direction. Fix it with `material.normalScale.y = -1` or by inverting the green channel of the image.
:::

three.js derives the tangent frame per pixel from screen-space derivatives of the position and UV when the geometry has no `tangent` attribute. For mirrored UVs and skinned meshes, precomputed tangents are more reliable: glTF exporters can include them, or call `geometry.computeTangents()` (needs an index, normals and UVs).

| Technique | Moves geometry | Changes silhouette | Cost | Notes |
|---|---|---|---|---|
| Bump map | No | No | Low | Greyscale height; normals from derivatives |
| Normal map | No | No | Low | Best detail per cost; the standard |
| Parallax / parallax occlusion mapping | No (fakes depth via UV shift) | No | Medium–high | Deep bricks and grates in custom shaders |
| Displacement map | Yes (per vertex) | Yes | Needs many vertices | Terrain, cloth; needs dense geometry |

## Other kinds of textures

| Class | What it is | Typical use |
|---|---|---|
| `DataTexture` | A texture from a typed array you fill | Lookup tables, heightfields, GPGPU data, toon gradients |
| `DataArrayTexture` | Many same-size layers in one texture, sampled with a layer index | Terrain splat layers; per-instance textures with `BatchedMesh` |
| `Data3DTexture` | A true 3D volume | Medical volumes (CT/MRI), 3D noise, clouds |
| `CanvasTexture` | A 2D canvas you draw on | Dynamic labels, charts, signage (set `needsUpdate` after drawing) |
| `VideoTexture` | Frames of a `<video>` | Screens, 360° video, AR feeds |
| `CubeTexture` | Six images forming a cube | Skyboxes, reflections (legacy; HDR equirect + PMREM is preferred) |
| `CompressedTexture` | GPU-compressed blocks | Produced by `KTX2Loader` |
| `DepthTexture` | The depth buffer of a render target | Soft particles, SSAO, fog, outlines |
| `FramebufferTexture` | A copy of the current framebuffer | Refraction and distortion effects |

:::def Texture atlas
Many small images packed into one big texture, with each object's UVs pointing to its own region. Objects that differ only in texture can then share one material, which enables merging, instancing or batching. Leave padding between regions, or mipmapping bleeds neighbouring images together at a distance.
:::

## KTX2 and Basis Universal

:::def KTX2 / Basis Universal
KTX2 is a container format for GPU textures. With **Basis Universal** supercompression, one `.ktx2` file can be transcoded at load time to whatever compressed format the device's GPU supports (BC on desktop, ASTC or ETC on mobile). Two modes: **ETC1S** (very small files, lower quality, good for colour) and **UASTC** (larger, high quality, good for normal maps).
:::

```js title="three.js — KTX2 textures (also used by GLTFLoader)"
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
const ktx2 = new KTX2Loader()
  .setTranscoderPath("https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/basis/")
  .detectSupport(renderer);          // after the renderer exists (await renderer.init() for WebGPU)
const albedo = await ktx2.loadAsync("rock_albedo.ktx2");
albedo.colorSpace = THREE.SRGBColorSpace;
gltfLoader.setKTX2Loader(ktx2);      // glTF files using KHR_texture_basisu now load too
```

:::tip Convert with gltf-transform
`npx @gltf-transform/cli etc1s in.glb out.glb` (or `uastc`, `optimize` for everything) converts all textures in a glTF to KTX2, typically cutting VRAM by 4–8× and download size substantially. Use UASTC for normal maps, which show ETC1S block artefacts badly.
:::

:::keypoints
- UVs map vertices to texture positions; seams and stretching come from the unwrap.
- `RepeatWrapping` + `repeat` to tile; keep real-world scale by matching repeat to size.
- Mip level $\lambda = \log_2(\text{texels per pixel})$; mipmaps add $1/3$ memory; anisotropy fixes grazing-angle blur.
- VRAM = width × height × bytes per texel × 4/3; a 4K RGBA texture is 85 MiB, compressed 11–21 MiB.
- Only colour maps are sRGB; data maps stay linear. `TextureLoader` does not set sRGB for you; `GLTFLoader` does.
- Normal maps store tangent-space normals: $\mathbf{n} = 2\mathbf{c} - 1$, transformed by the TBN matrix.
- KTX2/Basis gives one file that transcodes to each GPU's compressed format.
:::

## Interview questions

:::qa What are mipmaps and why do textures shimmer without them? {level=junior}
Mipmaps are pre-filtered half-size copies of a texture down to 1 × 1. When a textured surface is far away, each pixel covers many texels; sampling only one of them picks an arbitrary texel each frame, causing shimmering and moiré. The GPU instead chooses the mip level where one texel is about one pixel ($\lambda = \log_2\rho$) and samples it, which is already averaged. They cost one third more memory. Anisotropic filtering further improves surfaces seen at grazing angles.
:::

:::qa A texture looks washed out and too bright. Another model's bumps look inverted. What is wrong in each case? {level=mid}
Washed out: a colour (base colour) texture is being treated as linear data. Set `texture.colorSpace = THREE.SRGBColorSpace` so the shader decodes sRGB to linear before lighting. Inverted bumps: the normal map uses the DirectX green-channel convention while three.js expects OpenGL (+Y), so flip it with `material.normalScale.y = -1` (or invert the green channel). Also check that normal maps are not marked sRGB.
:::

:::qa A product page loads ten 4K textures and crashes on older iPhones. What do you do? {level=mid}
Decoded, ten 4K RGBA textures with mips need about 850 MiB of GPU memory, which exceeds what mobile Safari allows. Reduce resolution where the screen size does not need 4K (2K or 1K for most parts), pack ORM channels into one texture, convert to KTX2/Basis (4–8× less VRAM), share textures between materials, dispose textures of variants not on screen, and load progressively (low resolution first). Check with `renderer.info.memory` and the browser's memory tools.
:::

:::qa How does normal mapping work? {level=mid}
Each texel stores a unit normal in the surface's tangent space, encoded as colour ($\mathbf{c} = 0.5\,\mathbf{n} + 0.5$). In the fragment shader the colour is decoded ($\mathbf{n} = 2\mathbf{c} - 1$), scaled by `normalScale`, and transformed to view or world space with the TBN matrix built from the tangent (direction of increasing $u$), bitangent (increasing $v$) and the interpolated normal. The perturbed normal is then used for lighting, so flat triangles light up as if they had detailed relief, but the silhouette does not change.
:::

:::qa What is the difference between a bump map, a normal map and a displacement map? {level=junior}
A bump map is a greyscale height image from which the shader derives perturbed normals using derivatives; a normal map stores the perturbed normals directly (more accurate, the standard). Both change only lighting. A displacement map actually moves vertices along their normals in the vertex shader, changing the silhouette, but only as finely as the mesh is tessellated, so it needs dense geometry.
:::
