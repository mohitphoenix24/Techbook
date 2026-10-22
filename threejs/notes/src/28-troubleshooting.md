---
title: 50 Common Three.js and R3F Problems
part: Reference
summary: A diagnostic reference. Each problem starts from what you see, names the usual cause, tells you how to confirm it, gives the fix and says how to stop it happening again. Grouped by area, with chapter references for the full explanation.
difficulty: Intermediate
prereqs: Parts II–V
time: Reference
outcome: Recognise the 50 most common three.js and R3F problems from their symptoms and fix them methodically.
---

## How to use this reference

Find the symptom closest to what you see, confirm the cause with the investigation step before changing code, then apply the fix. When several problems look alike, the investigation step is what tells them apart. Add an `AxesHelper` and a `GridHelper` before anything else: half of all "nothing renders" problems become obvious once you can see where the origin is.

## Nothing visible, or the wrong view

:::trouble Blank canvas
Symptom: The canvas is empty or a solid colour.
Cause: `render()` is never called, the canvas has zero size, or the camera looks away from the content.
How to investigate: Check the console; log `renderer.domElement.clientWidth`; add `AxesHelper(5)` at the origin.
Fix: Start the loop with `setAnimationLoop`, size the renderer from its container, and `camera.lookAt` the content.
Prevention: Start every project from a tested shell (Chapter 7) with resize handling and helpers.
:::

:::trouble Object loaded but not visible
Symptom: The loader succeeds, but nothing appears.
Cause: The model is far too large or small (centimetres versus metres), far from the origin, or the camera is inside it.
How to investigate: `new THREE.Box3().setFromObject(model)`; log its size and centre.
Fix: Scale and centre from the bounding box, then frame the camera to the bounding sphere (Chapter 6).
Prevention: Normalise scale and pivot in the asset pipeline (Chapter 16).
:::

:::trouble Object disappears at certain angles or near screen edges
Symptom: Parts vanish when the camera moves, often at the edges.
Cause: Frustum culling with a stale bounding sphere (vertex-shader displacement, edited vertices, skinning far from the bind pose).
How to investigate: Set `mesh.frustumCulled = false`; if the problem disappears, the bounds are wrong.
Fix: `geometry.computeBoundingSphere()` after edits, or enlarge it by the maximum displacement.
Prevention: Recompute bounds whenever vertices change; document shader displacement limits.
:::

:::trouble Far objects or the floor clipped away
Symptom: Distant geometry is cut off, or the ground disappears near the camera.
Cause: `camera.far` too small or `camera.near` too large.
How to investigate: Log the distance to the clipped object and compare it with `near` and `far`.
Fix: Adjust near/far to the scene, then call `updateProjectionMatrix()`.
Prevention: Derive near/far from the scene's bounds when framing.
:::

:::trouble Image stretched after resizing
Symptom: Circles become ellipses when the window changes shape.
Cause: `camera.aspect` not updated, or `updateProjectionMatrix()` not called.
How to investigate: Compare `camera.aspect` with the canvas width ÷ height.
Fix: In the resize handler set the aspect, call `updateProjectionMatrix()` and `renderer.setSize`.
Prevention: Resize from a `ResizeObserver` on the canvas container (R3F does this for you).
:::

:::trouble Blurry canvas on high-DPI screens
Symptom: Edges and text look soft on a laptop or phone.
Cause: The drawing buffer uses CSS pixels; the pixel ratio is not set.
How to investigate: Compare `renderer.domElement.width` with `clientWidth × devicePixelRatio`.
Fix: `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
Prevention: Include the capped pixel ratio in your renderer shell; in R3F use `dpr={[1, 2]}`.
:::

:::trouble Planes visible from one side only
Symptom: A plane or leaf disappears when seen from behind.
Cause: Back-face culling (`side: FrontSide`).
How to investigate: Temporarily set `side: THREE.DoubleSide`.
Fix: Use `DoubleSide` for thin open surfaces only, or model thickness.
Prevention: Agree with artists which meshes are single-sided; check normals in the modelling tool.
:::

## Colour and materials

:::trouble Model renders black
Symptom: The model's shape is visible but it is black or nearly so.
Cause: A lit material with no lights and no environment; metals with no environment to reflect.
How to investigate: Swap in `MeshNormalMaterial`; if shading appears, lighting is the issue.
Fix: Add `scene.environment` (an HDR or `RoomEnvironment`) and a key light.
Prevention: Always light PBR scenes with an environment map (Chapter 13).
:::

:::trouble Colours washed out
Symptom: Textures look pale and low-contrast.
Cause: A colour texture treated as linear data, or a double sRGB conversion with post-processing.
How to investigate: Check `texture.colorSpace` on colour maps; count the output conversions in the pipeline.
Fix: `SRGBColorSpace` on base-colour and emissive maps only; convert to sRGB once (`OutputPass` / `RenderPipeline`).
Prevention: Load colour textures through one helper that sets the colour space (Chapter 12).
:::

:::trouble Image too dark and contrasty
Symptom: Midtones look crushed and highlights clip.
Cause: Missing output conversion (custom shader without `colorspace_fragment`, `linear` canvas), or no tone mapping.
How to investigate: Compare with a `MeshStandardMaterial` in the same scene.
Fix: Add `#include <tonemapping_fragment>` and `#include <colorspace_fragment>`, or choose a tone mapper.
Prevention: Pick tone mapping and output space at project start and never change them per object.
:::

:::trouble Product colours don't match the swatch
Symptom: A brand colour looks shifted or oversaturated.
Cause: ACES Filmic tone mapping changes hues and contrast.
How to investigate: Render a flat colour chart with each tone mapper.
Fix: Use `NeutralToneMapping` and a neutral studio environment.
Prevention: Set colour-accuracy requirements before the art direction is locked.
:::

:::trouble Changing a material property does nothing
Symptom: Adding a map or toggling `flatShading` at runtime has no visible effect.
Cause: The change needs a new shader program.
How to investigate: Check whether the property changes defines (maps, vertex colours, flat shading, fog).
Fix: Set `material.needsUpdate = true`, or swap to a pre-created material.
Prevention: Create material variants up front and compile them during loading.
:::

:::trouble Opacity setting ignored
Symptom: `opacity = 0.5` changes nothing.
Cause: `transparent` is false.
How to investigate: Log `material.transparent`.
Fix: Set `transparent: true` (and usually `depthWrite: false`).
Prevention: Use `alphaTest` or `alphaHash` for cut-outs instead of blending where possible.
:::

:::trouble Transparent objects draw in the wrong order
Symptom: Glass hides objects behind it, or flickers as the camera moves.
Cause: Per-object back-to-front sorting fails for intersecting or concave transparent meshes; transparent materials write depth.
How to investigate: Set `depthWrite: false` and watch whether it changes.
Fix: `depthWrite: false`, `renderOrder`, split meshes, or order-independent transparency (Chapter 24).
Prevention: Keep transparent surfaces few, simple and non-intersecting.
:::

## Lights and shadows

:::trouble No shadows at all
Symptom: Lights work, but nothing casts a shadow.
Cause: One of the four switches is off: `renderer.shadowMap.enabled`, `light.castShadow`, `mesh.castShadow`, `mesh.receiveShadow`.
How to investigate: Check each flag; add a `CameraHelper` for the light's shadow camera.
Fix: Enable all four; place casters and receivers inside the shadow camera.
Prevention: Set shadow flags with one `traverse` after loading.
:::

:::trouble Stripes on lit surfaces (shadow acne)
Symptom: Moiré or stripes on surfaces facing the light.
Cause: Surfaces shadowing themselves through depth rounding.
How to investigate: Increase `shadow.normalBias` slightly; acne should fade.
Fix: Small negative `bias`, `normalBias` near one texel, tighter shadow camera.
Prevention: Fit shadow cameras tightly; re-tune bias after upgrades (WebGPU shadows changed in r183).
:::

:::trouble Shadows detached from objects
Symptom: A gap between an object and its shadow (peter-panning).
Cause: Too much bias.
How to investigate: Reduce `bias` and watch the gap close.
Fix: Prefer `normalBias` over large constant bias; thicken paper-thin geometry.
Prevention: Tune bias with a `CameraHelper` and a test scene.
:::

:::trouble Blocky or shimmering shadow edges
Symptom: Stair-stepped edges that crawl as the camera moves.
Cause: Too few shadow texels per metre; the shadow box moves by sub-texel amounts.
How to investigate: Compute texel size = shadow box width ÷ `mapSize` (Chapter 10).
Fix: Tighten the box, raise `mapSize`, or use `SunLight` cascades for large scenes.
Prevention: Size shadow boxes from the area the camera can see.
:::

:::trouble Lights from an old project far too dim
Symptom: After upgrading, point and spot lights barely light anything.
Cause: Physical light units and inverse-square falloff are now the only mode.
How to investigate: Check whether the project predates r155.
Fix: Raise intensities (candela for point and spot lights) or set `power` in lumens.
Prevention: Author lights in physical units with real ratios.
:::

:::trouble Point-light shadows destroy the frame rate
Symptom: Adding one shadowed point light halves the frame rate.
Cause: Six shadow renders per frame (a cube).
How to investigate: Compare `renderer.info.render.calls` with the shadow on and off.
Fix: Use a spot light, fewer casters, `shadowMap.autoUpdate = false`, or bake.
Prevention: Budget shadow-casting lights per device class.
:::

## Textures

:::trouble Texture upside down
Symptom: A replacement texture on a glTF model is flipped vertically.
Cause: glTF textures use `flipY = false`; `TextureLoader` defaults to `true`.
How to investigate: Compare `flipY` on the original and the new texture.
Fix: Set `texture.flipY = false` for textures applied to glTF UVs.
Prevention: Load all model textures through one helper.
:::

:::trouble Texture blurry at an angle
Symptom: Floors and roads smear in the distance.
Cause: Trilinear filtering on anisotropic pixel footprints.
How to investigate: Set `anisotropy` to the maximum and compare.
Fix: `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()`.
Prevention: Enable anisotropy on all ground textures by default.
:::

:::trouble Shimmering textures in motion
Symptom: Fine patterns sparkle as the camera moves.
Cause: Minification without mipmaps, or high-frequency detail.
How to investigate: Check `generateMipmaps` and `minFilter`.
Fix: Keep mipmaps and `LinearMipmapLinearFilter`; reduce detail in far textures.
Prevention: Use power-of-two textures with full mip chains.
:::

:::trouble Bumps look inverted
Symptom: Normal-mapped details look like dents lit from the wrong side.
Cause: DirectX-style normal map (green channel inverted), or a normal map marked sRGB.
How to investigate: Check the source tool's convention and `texture.colorSpace`.
Fix: `material.normalScale.y = -1`; keep normal maps in `NoColorSpace`.
Prevention: Agree on OpenGL-style normal maps in the asset pipeline.
:::

:::trouble Page crashes or reloads on iPhone
Symptom: The tab reloads after models load.
Cause: Texture VRAM: decoded 4K RGBA textures cost about 85 MiB each.
How to investigate: Sum width × height × 4 × 4/3 for every texture; watch memory in Safari's Web Inspector.
Fix: Resize, convert to KTX2, pack ORM channels, dispose unused variants.
Prevention: Enforce texture budgets in the asset pipeline (Chapter 23 case studies).
:::

## Geometry and transforms

:::trouble Object orbits instead of spinning
Symptom: Rotating an object swings it around the scene origin.
Cause: Rotation applied after translation (a parent at the origin, an off-centre geometry).
How to investigate: Show `AxesHelper` on the object and its parent.
Fix: Rotate the object itself, or move the pivot with `geometry.center()` or a pivot group.
Prevention: Fix pivots in the modelling tool or the asset pipeline.
:::

:::trouble Object jumps when re-parented
Symptom: Moving an object under a new parent teleports it.
Cause: `add()` keeps the local transform.
How to investigate: Compare world positions before and after.
Fix: Use `parent.attach(child)` to keep the world transform.
Prevention: Use `attach` for grabbing, dropping and moving between groups.
:::

:::trouble Flickering where surfaces overlap
Symptom: Two surfaces fight, showing stripes that change every frame.
Cause: Z-fighting from coplanar surfaces or poor depth precision.
How to investigate: Check the near/far ratio and whether the surfaces are coplanar.
Fix: Raise `near`, offset geometry, `polygonOffset`, or reversed depth (Chapter 6).
Prevention: Keep near/far ratios sensible; model decals with a small offset.
:::

## Performance

:::trouble Low FPS with few triangles
Symptom: A simple-looking scene runs slowly.
Cause: Too many draw calls (separate meshes, cloned materials, shadow passes).
How to investigate: `renderer.info.render.calls`; halve the resolution and see if FPS changes (if not, CPU-bound).
Fix: Share materials, instance, batch or merge (Chapter 23).
Prevention: Track draw calls in development with r3f-perf or stats-gl.
:::

:::trouble High GPU time on phones
Symptom: Frame time scales with screen size; desktop is fine.
Cause: Fragment cost: high DPR, heavy materials, overdraw, post-processing.
How to investigate: Render at half resolution; if FPS doubles, you are fragment-bound.
Fix: Cap DPR, simplify shaders, reduce transparency and post passes.
Prevention: Adaptive quality with `PerformanceMonitor`.
:::

:::trouble Stutter when something first appears
Symptom: A hitch the first time a model, material or effect is shown.
Cause: Shader compilation and texture upload on first use.
How to investigate: Look for long "compile" or upload tasks in the Performance panel.
Fix: `renderer.compileAsync(scene, camera)` during loading; drei `<Preload all />`.
Prevention: Create all variants up front; avoid runtime feature toggles.
:::

:::trouble Periodic hitches every few seconds
Symptom: Smooth on average, but regular stutters.
Cause: Garbage collection from per-frame allocations.
How to investigate: Look for "GC" blocks lined up with the stutters in the Performance panel.
Fix: Reuse vectors, matrices and arrays created once.
Prevention: No `new` inside `useFrame` or the animation loop.
:::

:::trouble Hover or picking makes the app sluggish
Symptom: Moving the mouse over a complex model drops frames.
Cause: Raycasting tests every triangle.
How to investigate: Time `intersectObjects` with the profiler.
Fix: three-mesh-bvh (`<Bvh>` in R3F), `firstHitOnly`, raycast proxies, one raycast per frame.
Prevention: Build BVHs for any mesh over about 50k triangles that is pickable.
:::

:::trouble Post-processing halves the frame rate
Symptom: Effects look good but the frame time doubles.
Cause: Many full-screen passes at full resolution.
How to investigate: Toggle each pass and record GPU time.
Fix: Merge effects (pmndrs postprocessing), half-resolution blur, fewer passes.
Prevention: Budget post passes per device class.
:::

:::trouble Fast frame rate, laptop gets hot
Symptom: Fans spin even when the scene is static.
Cause: Rendering 60–120 frames per second when nothing changes.
How to investigate: Check whether anything actually moves between frames.
Fix: Render on demand (`frameloop="demand"`, `invalidate()`).
Prevention: Use demand rendering for viewers, maps and dashboards.
:::

## Memory and lifecycle

:::trouble Memory grows on every navigation
Symptom: GPU memory and `renderer.info.memory` rise each time content changes.
Cause: Removed objects not disposed.
How to investigate: Log `renderer.info.memory` before and after a round trip.
Fix: Dispose geometries, materials, textures and render targets (Chapter 7).
Prevention: A memory test that navigates repeatedly and asserts a stable count.
:::

:::trouble WebGL context lost
Symptom: The canvas goes blank; the console reports a lost context.
Cause: Too many contexts, GPU reset or memory pressure.
How to investigate: Count canvases; listen for `webglcontextlost`.
Fix: One renderer with `View`s or scissoring; handle `webglcontextrestored`.
Prevention: Never create a canvas per thumbnail or route.
:::

## Assets and animation

:::trouble Draco or KTX2 model fails to load
Symptom: Loader errors mentioning a decoder or transcoder.
Cause: Decoder path missing or version mismatch; `detectSupport` not called.
How to investigate: Check the network panel for decoder requests.
Fix: Set `setDecoderPath` / `setTranscoderPath` to matching versions; call `detectSupport(renderer)` after initialisation.
Prevention: Self-host decoders pinned to your three.js version.
:::

:::trouble Several clones animate together
Symptom: Clones of a character all move with the first one.
Cause: `clone()` keeps references to the original skeleton.
How to investigate: Compare `skeleton.bones[0]` across clones.
Fix: `SkeletonUtils.clone()` and one `AnimationMixer` per clone.
Prevention: Use drei `<Clone>` or a clone helper everywhere.
:::

:::trouble Animation does not play
Symptom: `action.play()` is called but nothing moves.
Cause: `mixer.update(delta)` not called each frame, or the clip targets different node names.
How to investigate: Log `mixer.time`; compare track names with node names.
Fix: Update the mixer every frame; re-export with matching names.
Prevention: Use `useAnimations` in R3F, which updates the mixer for you.
:::

:::trouble Model enters the scene lying on its side
Symptom: An imported model is rotated 90°.
Cause: Z-up source data (FBX, CAD, some exporters).
How to investigate: Check the exporter's axis settings.
Fix: Export glTF (Y-up), or rotate once at load; `FBXLoader` converts Z-up since r184.
Prevention: Standardise on glTF exports from Blender.
:::

## React Three Fiber

:::trouble Component re-renders every frame
Symptom: React DevTools shows constant renders; the frame rate drops.
Cause: `setState` in `useFrame`, fast pointer events, or a store subscription to fast-changing values.
How to investigate: The React Profiler; highlight updates.
Fix: Mutate refs in `useFrame`; read stores transiently with `getState()`.
Prevention: Keep per-frame data out of React state by convention (Chapter 21).
:::

:::trouble Geometry rebuilt constantly
Symptom: Memory churn and hitches while a slider moves.
Cause: Changing `args` re-creates the object.
How to investigate: Log in a geometry constructor or watch `renderer.info.memory.geometries`.
Fix: Animate `scale` or properties; memoise `args`.
Prevention: Treat `args` as constructor-time only.
:::

:::trouble Clicks hit objects behind the target
Symptom: Clicking a front object also triggers handlers on objects behind it.
Cause: R3F events pass through every intersected object.
How to investigate: Log `e.intersections`.
Fix: `e.stopPropagation()` in foreground handlers.
Prevention: Stop propagation by default in interactive components.
:::

:::trouble Hooks error outside the Canvas
Symptom: "Hooks can only be used within the Canvas component".
Cause: `useThree` or `useFrame` called in a DOM component.
How to investigate: Check where the component is rendered.
Fix: Move it inside `<Canvas>`, or share data through a store.
Prevention: Separate scene components from DOM components in the folder structure.
:::

:::trouble Scene renders twice per frame
Symptom: Double the expected GPU time; effects flicker.
Cause: A manual `render()` (post-processing) plus R3F's own render.
How to investigate: Count renders per frame with a breakpoint or `renderer.info`.
Fix: Give the manual render a `useFrame` priority above 0.
Prevention: One owner of rendering per canvas.
:::

:::trouble Same model only appears once
Symptom: Rendering `<primitive object={scene} />` twice shows one copy.
Cause: An object can have only one parent.
How to investigate: Check whether both places share the same `scene` object.
Fix: drei `<Clone>`, or a gltfjsx component that reuses geometry and materials.
Prevention: Never mount the same `Object3D` twice.
:::

## WebXR

:::trouble Moving the camera does nothing in VR
Symptom: Setting `camera.position` has no effect in a session.
Cause: The headset overwrites the camera pose every frame.
How to investigate: Check whether the code runs inside an XR session.
Fix: Move a parent rig (or `XROrigin`) instead.
Prevention: Design locomotion around a rig from the start.
:::

:::trouble Users feel sick in VR
Symptom: Testers report discomfort after a few minutes.
Cause: Smooth artificial motion, rotation, dropped frames or wrong scale.
How to investigate: Check frame timing on the headset and the locomotion method.
Fix: Teleport and snap turning, steady frame rate, real-world scale.
Prevention: Comfort review as part of every XR milestone.
:::

:::trouble XR scene drops frames
Symptom: Judder and reprojection artefacts on a standalone headset.
Cause: Desktop-level content rendered twice at headset resolution.
How to investigate: Profile on the device; check draw calls and fill rate.
Fix: Multiview, foveation, lower `framebufferScaleFactor`, baked lighting, fewer draw calls.
Prevention: Budget XR content like mobile content (Chapter 25).
:::

:::keypoints
- Confirm the cause before fixing: the investigation step separates look-alike problems.
- Most visibility problems are bounds, scale or camera problems; most colour problems are colour-space problems.
- Most performance problems are draw calls (CPU) or pixels × shader cost (GPU).
- Most leaks are missing `dispose()` calls; most R3F slowdowns are per-frame React state.
:::
