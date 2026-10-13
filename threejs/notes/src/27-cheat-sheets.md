---
title: Cheat Sheets and Formula Sheet
summary: The whole notebook compressed for revision. Every key formula on a few pages, the numbers worth memorising, three.js, R3F and TSL quick references, the recent-release changes, a debugging checklist, and the best places to keep learning.
---

## Formula sheet

### Vectors and transforms

| Concept | Formula |
|---|---|
| Length, normalise | $\lVert\mathbf{v}\rVert = \sqrt{v_x^2+v_y^2+v_z^2}$, $\hat{\mathbf{v}} = \mathbf{v}/\lVert\mathbf{v}\rVert$ |
| Dot product | $\mathbf{a}\cdot\mathbf{b} = \sum a_ib_i = \lVert\mathbf{a}\rVert\lVert\mathbf{b}\rVert\cos\theta$ |
| Cross product | $(a_yb_z - a_zb_y,\ a_zb_x - a_xb_z,\ a_xb_y - a_yb_x)$, length $= \lVert\mathbf{a}\rVert\lVert\mathbf{b}\rVert\sin\theta$ |
| Triangle normal, area | $\hat{\mathbf{n}} = \text{norm}((B-A)\times(C-A))$, area $= \dfrac12\lVert(B-A)\times(C-A)\rVert$ |
| Projection onto $\hat{\mathbf{n}}$ / plane | $(\mathbf{v}\cdot\hat{\mathbf{n}})\hat{\mathbf{n}}$ / $\mathbf{v} - (\mathbf{v}\cdot\hat{\mathbf{n}})\hat{\mathbf{n}}$ |
| Reflection | $\mathbf{r} = \mathbf{d} - 2(\mathbf{d}\cdot\hat{\mathbf{n}})\hat{\mathbf{n}}$ |
| Lerp, smoothstep | $a + t(b-a)$; $t^2(3-2t)$ |
| Frame-rate-independent damping | $x \leftarrow \text{lerp}(x, x_t, 1 - e^{-\lambda\Delta t})$ |
| Point–plane distance | $\hat{\mathbf{n}}\cdot\mathbf{p} + d$ |
| Model matrix | $M = T\,R\,S$; world $= M_{\text{parent}}M_{\text{local}}$ |
| Inverse TRS | $S^{-1}R^TT^{-1}$ |
| Normal matrix | $(M_{3\times3}^{-1})^T$ |
| Clip position | $P\,V\,M\,\mathbf{p}$ |

### Rotations

| Concept | Formula |
|---|---|
| Rotation about Y | $R_y = \begin{pmatrix}c&0&s\\0&1&0\\-s&0&c\end{pmatrix}$ |
| Rodrigues | $\mathbf{v}\cos\theta + (\hat{\mathbf{k}}\times\mathbf{v})\sin\theta + \hat{\mathbf{k}}(\hat{\mathbf{k}}\cdot\mathbf{v})(1-\cos\theta)$ |
| Unit quaternion | $q = (\hat{\mathbf{k}}\sin\dfrac\theta2, \cos\dfrac\theta2)$; $q$ and $-q$ equal |
| Product | $(w_1\mathbf{u}_2 + w_2\mathbf{u}_1 + \mathbf{u}_1\times\mathbf{u}_2,\ w_1w_2 - \mathbf{u}_1\cdot\mathbf{u}_2)$ |
| Rotate a vector | $\mathbf{v} + 2w(\mathbf{u}\times\mathbf{v}) + 2\mathbf{u}\times(\mathbf{u}\times\mathbf{v})$ |
| Slerp | $\dfrac{\sin((1-t)\Omega)}{\sin\Omega}q_0 + \dfrac{\sin(t\Omega)}{\sin\Omega}q_1$, $\cos\Omega = q_0\cdot q_1$ |
| Look-at basis | $\hat{\mathbf{z}} = \text{norm}(E - T)$, $\hat{\mathbf{x}} = \text{norm}(\mathbf{up}\times\hat{\mathbf{z}})$, $\hat{\mathbf{y}} = \hat{\mathbf{z}}\times\hat{\mathbf{x}}$ |

### Cameras and projection

| Concept | Formula |
|---|---|
| Visible height at distance $d$ | $h = 2d\tan(\text{fov}/2)$, $w = h\cdot\text{aspect}$ |
| Fit a sphere | $d = r/\sin(\text{fov}/2)$ |
| Horizontal FOV | $\tan\dfrac{\text{fov}_h}{2} = \text{aspect}\tan\dfrac{\text{fov}_v}{2}$ |
| Perspective $P$ | $\text{diag}(s/a, s)$, $z$ row $\left(\dfrac{f+n}{n-f}, \dfrac{2fn}{n-f}\right)$, $w = -z$, $s = 1/\tan(\text{fov}/2)$ |
| NDC depth | $z_{\text{ndc}} = \dfrac{(f+n)d - 2fn}{(f-n)d}$ (hyperbolic) |
| Pointer → NDC | $x = 2u - 1$, $y = 1 - 2v$ |
| Spherical coordinates | $(r\sin\phi\sin\theta,\ r\cos\phi,\ r\sin\phi\cos\theta)$ |
| On-screen size | $h_{\text{px}} \approx rH/(d\tan(\text{fov}/2))$ |

### Rasterisation and colour

| Concept | Formula |
|---|---|
| Barycentrics | $\lambda_i$ = opposite sub-triangle area / total area |
| Perspective-correct varying | $\dfrac{\sum\lambda_i a_i/w_i}{\sum\lambda_i/w_i}$ |
| Alpha blending | $\alpha C_s + (1-\alpha)C_d$ |
| sRGB encode | $1.055L^{1/2.4} - 0.055$ ($12.92L$ below 0.0031308) |
| Exposure | $L\cdot2^{\text{EV}}$ |
| Reinhard | $x/(1+x)$ |
| Mip level | $\log_2(\text{texels per pixel})$ |
| Texture VRAM | $w\cdot h\cdot\text{bytes}\cdot\dfrac43$ |
| Normal map decode | $\mathbf{n} = 2\mathbf{c} - 1$, world $= [T\ B\ N]\,\mathbf{n}$ |

### Lighting and PBR

| Concept | Formula |
|---|---|
| Lambert | $k_d E\max(0, \hat{\mathbf{n}}\cdot\hat{\mathbf{l}})$; BRDF $= c/\pi$ |
| Phong / Blinn–Phong | $(\hat{\mathbf{r}}\cdot\hat{\mathbf{v}})^\alpha$ / $(\hat{\mathbf{n}}\cdot\hat{\mathbf{h}})^{\alpha'}$, $\hat{\mathbf{h}} = \text{norm}(\hat{\mathbf{l}}+\hat{\mathbf{v}})$ |
| Rendering equation | $L_o = L_e + \int_\Omega f_r L_i(\hat{\mathbf{n}}\cdot\boldsymbol\omega_i)d\boldsymbol\omega_i$ |
| Cook–Torrance | $\dfrac{DFG}{4(\hat{\mathbf{n}}\cdot\hat{\mathbf{l}})(\hat{\mathbf{n}}\cdot\hat{\mathbf{v}})}$ |
| GGX | $\dfrac{\alpha^2}{\pi((\hat{\mathbf{n}}\cdot\hat{\mathbf{h}})^2(\alpha^2-1)+1)^2}$, $\alpha = r^2$ |
| Schlick Fresnel | $F_0 + (1-F_0)(1 - \hat{\mathbf{v}}\cdot\hat{\mathbf{h}})^5$, $F_0 = \left(\dfrac{n-1}{n+1}\right)^2$ |
| Metal–roughness | $F_0 = \text{mix}(0.04, \text{base}, m)$, diffuse $= \text{base}(1-m)$ |
| Point-light falloff (three.js) | $1/d^{\text{decay}}$ × $\text{saturate}(1-(d/d_{\max})^4)^2$ |
| Spot cone | $\text{smoothstep}(\cos a, \cos(a(1-p)), \cos\theta)$ |
| Hemisphere light | mix(ground, sky, $\dfrac12 n_y + \dfrac12$) |
| VSM (Chebyshev) | $\sigma^2/(\sigma^2 + (t-\mu)^2)$ |
| CSM split | $\lambda n(f/n)^{i/N} + (1-\lambda)(n + (f-n)i/N)$ |
| Fog | linear $\dfrac{d-\text{near}}{\text{far}-\text{near}}$; exp² $1 - e^{-(\rho d)^2}$; Beer–Lambert $e^{-\sigma d}$ |

### Intersections, physics and animation

| Concept | Formula |
|---|---|
| Ray–plane | $t = -(\hat{\mathbf{n}}\cdot\mathbf{o} + d)/(\hat{\mathbf{n}}\cdot\hat{\mathbf{d}})$ |
| Ray–sphere | $t = -b\pm\sqrt{b^2 - c}$, $b = \mathbf{m}\cdot\hat{\mathbf{d}}$, $c = \mathbf{m}\cdot\mathbf{m} - r^2$ |
| Slab test | $t_{\text{near}} = \max\min(t_1,t_2)$, $t_{\text{far}} = \min\max(t_1,t_2)$ |
| Möller–Trumbore | $u = \dfrac{\mathbf{s}\cdot\mathbf{p}}{\det}$, $v = \dfrac{\hat{\mathbf{d}}\cdot\mathbf{q}}{\det}$, $t = \dfrac{\mathbf{e}_2\cdot\mathbf{q}}{\det}$ |
| Semi-implicit Euler | $v \mathrel{+}= a\,h$; $x \mathrel{+}= v\,h$ |
| Collision impulse | $j = \dfrac{(1+e)v_n}{1/m_1 + 1/m_2}$ |
| Torque | $\boldsymbol\tau = \mathbf{r}\times\mathbf{F}$ |
| Spring | $\ddot x = -k(x - x_t) - c\dot x$, critical $c = 2\sqrt k$ |
| Linear blend skinning | $\sum w_iM_iB_i^{-1}\mathbf{v}$ |
| Two-bone IK | $\cos C = \dfrac{a^2+b^2-d^2}{2ab}$ |
| Teleport arc | $\mathbf{p}_0 + \mathbf{v}t + \dfrac12\mathbf{g}t^2$ |
| Monte Carlo error | $\propto 1/\sqrt N$ |
| Splat blending | $\sum c_i\alpha_i\prod_{j<i}(1-\alpha_j)$ |

## Numbers to remember

| Number | Meaning |
|---|---|
| 16.67 / 11.11 / 8.33 ms | Frame budget at 60 / 90 / 120 Hz |
| 1 unit = 1 m | three.js, glTF, WebXR and physics convention |
| 0.04 | $F_0$ of most dielectrics (IOR 1.5) |
| 0.214 / 0.735 | sRGB 0.5 → linear; linear 0.5 → sRGB |
| 1/π ≈ 0.318 | White Lambertian BRDF |
| 4/3 | Mipmap memory factor |
| 85 MiB | A 4K RGBA texture with mips |
| 16.8 MB | A 2048² shadow map |
| 4 | Max bone influences per vertex |
| 24 | Vertices in a `BoxGeometry` |
| 64 | Default compute workgroup size in three.js |
| ≈16 | Live WebGL contexts per page (typical limit) |
| 100–200 | Draw calls per frame on a mid-range phone |
| ≤ 2 | Sensible device pixel ratio cap |
| 63 mm | Typical interpupillary distance |
| 1° ≈ 2.6 cm at 1.5 m | Visual-angle sizing in VR |
| 9 × 3 | L2 spherical-harmonic coefficients (RGB) |
| 2⁻²³ × 2ᵉ | Float32 spacing at magnitude 2ᵉ |

## three.js quick reference

| Task | Code |
|---|---|
| Renderer | `new THREE.WebGLRenderer({ antialias: true })`; `setPixelRatio(Math.min(devicePixelRatio, 2))`; `setAnimationLoop(fn)` |
| WebGPU | `import * as THREE from "three/webgpu"`; `new THREE.WebGPURenderer()`; `await renderer.init()` |
| Camera | `new THREE.PerspectiveCamera(fov, aspect, near, far)`; `updateProjectionMatrix()` after changes |
| Time | `const timer = new THREE.Timer(); timer.update(t); timer.getDelta()` |
| Mesh | `new THREE.Mesh(geometry, material)`; `castShadow`, `receiveShadow` |
| Environment | `scene.environment = hdrTexture` (equirect + `EquirectangularReflectionMapping`) |
| Load glTF | `new GLTFLoader().setDRACOLoader(d).setKTX2Loader(k).setMeshoptDecoder(M).loadAsync(url)` |
| Animation | `const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); mixer.update(dt)` |
| Raycast | `raycaster.setFromCamera(ndc, camera); raycaster.intersectObjects(list, true)` |
| Instancing | `new THREE.InstancedMesh(geo, mat, n); setMatrixAt(i, m); instanceMatrix.needsUpdate = true` |
| Batching | `new THREE.BatchedMesh(maxInst, maxVerts, maxIdx, mat); addGeometry; addInstance; setMatrixAt` |
| Shadows | `renderer.shadowMap.enabled = true; light.castShadow = true; light.shadow.mapSize.set(2048, 2048)` |
| Colour space | `texture.colorSpace = THREE.SRGBColorSpace` (colour maps only) |
| Tone mapping | `renderer.toneMapping = THREE.ACESFilmicToneMapping` / `AgXToneMapping` / `NeutralToneMapping` |
| Post (WebGL) | `EffectComposer` + `RenderPass` + effects + `OutputPass` |
| Post (WebGPU) | `new THREE.RenderPipeline(renderer); pipeline.outputNode = pass(scene, camera)…` |
| Dispose | `geometry.dispose(); material.dispose(); texture.dispose(); renderTarget.dispose()` |
| Stats | `renderer.info.render.calls` / `.triangles`; `renderer.info.memory` |

## R3F quick reference

| Task | Code |
|---|---|
| Canvas | `<Canvas camera={{ position: [0, 1, 5], fov: 50 }} dpr={[1, 2]} shadows frameloop="demand">` |
| Element | `<mesh position={[x, y, z]} rotation-y={a} scale={2}>` |
| Constructor args | `<boxGeometry args={[1, 1, 1]} />` (changing args re-creates) |
| Attach | `<color attach="background" args={["#000"]} />` |
| Existing object | `<primitive object={gltf.scene} />` |
| Custom class | `extend({ MyThing })` → `<myThing />` |
| Per frame | `useFrame((state, delta) => { ref.current.rotation.y += delta; })` |
| Store | `const camera = useThree((s) => s.camera)` |
| Loading | `useGLTF(url)`, `useTexture(url)`, `useLoader(Loader, url)` in `<Suspense>` |
| Events | `onClick`, `onPointerOver`, `onPointerMissed`; `e.stopPropagation()`; `e.point`, `e.instanceId` |
| Manual render | `useFrame(() => pipeline.render(), 1)` |
| WebGPU | `gl={async (props) => { const r = new THREE.WebGPURenderer(props); await r.init(); return r; }}` |
| Types (v9) | `ThreeElements["mesh"]`, `ThreeElement<typeof X>` |

## TSL quick reference

| Task | TSL |
|---|---|
| Imports | `import { float, vec3, color, uniform, uv, time, mix, sin, Fn, If, Loop } from "three/tsl"` |
| Maths | `a.add(b).mul(c).sub(d).div(e)`, `.pow()`, `.clamp()`, `.length()`, `.normalize()` |
| Uniform | `const u = uniform(0); u.value = 1` |
| Material slots | `colorNode`, `positionNode`, `normalNode`, `emissiveNode`, `opacityNode`, `outputNode` |
| Built-ins | `positionLocal`, `positionWorld`, `normalWorld`, `uv()`, `time`, `cameraPosition`, `screenUV`, `instanceIndex` |
| Function | `const f = Fn(([a, b]) => a.mul(b))` |
| Compute | `const k = Fn(() => {…})().compute(count); renderer.compute(k)` |
| Storage | `instancedArray(count, "vec3")`, `.element(instanceIndex)`, `.toAttribute()` |

## What changed recently (r180–r186)

| Release | Change |
|---|---|
| r179 | `Timer` moved into core |
| r180 | `RGBELoader` → `HDRLoader`; `RGBMLoader` removed; new DOF node |
| r181 | Better PBR energy conservation (rough materials brighter); `renderAsync` family deprecated; `PI2` → `TWO_PI` |
| r182 | `PCFShadowMap` soft; `PCFSoftShadowMap` deprecated; `colorBufferType` → `outputBufferType` |
| r183 | `PostProcessing` → `RenderPipeline`; `Clock` deprecated; reversed depth on WebGPU; improved WebGPU shadows |
| r184 | Node materials/TSL on `WebGLRenderer`; FSR 1 and TAAU nodes; `compileAsync` non-blocking; env rotation aligned |
| r185 | Clustered lighting; WebXR on WebGPU; premultiplied-alpha change; `positionLocal` excludes skinning in `positionNode` |
| r186 | `SunLight` with cascaded shadows; Gaussian splats; `compileComputeAsync`; reworked energy conservation; `retroreflectivity`; `PCFSoftShadowMap` removed; `Object3D.dispose()`; `Source` → `TextureSource`; minified builds removed |

## Debugging checklist

:::flow When the scene looks wrong
Is anything rendering? Add `AxesHelper` and `GridHelper`, check console errors and canvas size
Is the camera looking at it? Log positions; frame the object with its bounding box
Is it lit? Lights and `scene.environment`; check normals with `MeshNormalMaterial`
Are colours right? sRGB on colour maps only; one output conversion; tone mapping chosen
Is it sorted and depth-tested correctly? Transparency settings, `renderOrder`, near/far
Are shadows configured end to end? Renderer, light, caster, receiver, shadow camera box
Is it fast enough? `renderer.info`, GPU timer, resolution test, draw-call test
Is memory stable? Dispose and watch `renderer.info.memory` over time
:::

## Where to keep learning

| Resource | Why |
|---|---|
| three.js documentation, manual and examples: threejs.org/docs, /manual, /examples | The reference; examples show every feature in working code |
| three.js migration guide (GitHub wiki) | Exactly what changed in each release |
| threejs.org/llms.txt | Up-to-date docs for AI coding assistants |
| React Three Fiber docs: r3f.docs.pmnd.rs; drei: drei.docs.pmnd.rs; XR: pmndrs.github.io/xr/docs | The R3F ecosystem |
| discourse.threejs.org | The official forum |
| LearnOpenGL (learnopengl.com), especially the PBR chapters | Clear graphics theory with code |
| *Physically Based Rendering* (pbr-book.org) | The definitive free book on rendering theory |
| SIGGRAPH 2013 "Physically Based Shading" course (blog.selfshadow.com) | Where the real-time PBR model comes from |
| Inigo Quilez's articles (iquilezles.org) | SDFs, noise, raymarching |
| The Book of Shaders (thebookofshaders.com) | Learning fragment shaders step by step |
| NVIDIA "Visualizing Depth Precision" | Depth buffers and reversed-Z |
| glTF (khronos.org/gltf) and gltf-transform (gltf-transform.dev) | The asset format and its pipeline |
| three-mesh-bvh, Rapier (rapier.rs), Spark (sparkjs.dev) | Key libraries for raycasting, physics and splats |
| WebGPU (w3.org/TR/webgpu) and WebXR (immersive-web.github.io/webxr) specifications | The platform itself |

:::keypoints
- Revise the formula sheet until you can derive each line, not just recite it.
- Memorise the numbers: frame budgets, F0 = 0.04, sRGB 0.214/0.735, 4/3 mip factor, DPR ≤ 2.
- Know what changed from r180 to r186; interviewers check whether you use current APIs.
- Work through the debugging checklist in order; most bugs are found in the first four steps.
:::
