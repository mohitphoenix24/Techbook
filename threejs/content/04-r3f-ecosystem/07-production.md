---
title: Shipping 3D to Production
level: advanced
time: 35
summary: Everything between "it works on my laptop" and a 3D feature real customers rely on — asset pipelines and budgets, loading strategy, bundle size, hosting and caching, graceful fallbacks and WebGL context loss, accessibility, SEO and sharing, analytics, security of user-uploaded models, browser support and a launch checklist.
---

A beautiful scene that takes 20 seconds to load on a phone, crashes on an older iPad, can't be used with a keyboard and shows a blank rectangle to search engines is not a finished product. This lesson collects the engineering that turns a 3D prototype into something you can put in front of customers.

## 1. Assets: the biggest lever

Most 3D apps are dominated by asset size, not code. Treat models and textures like images on a performance-conscious website: budget them, compress them, and automate it.

| Asset | Target (mobile-friendly product page) | Tools |
|---|---|---|
| hero model | < 3–5 MB, < 300k triangles | glTF-Transform `optimize`, gltfjsx `--transform`, Blender Decimate |
| textures | ≤ 2K, KTX2 (ETC1S for colour, UASTC for normals) or WebP | `gltf-transform etc1s/uastc/webp`, `toktx` |
| environment | 1K HDR or Ultra HDR JPEG (≈ 0.5 MB) | Poly Haven, `UltraHDRLoader` |
| fonts | one woff subset for `<Text>` | glyphhanger / subset fonts |
| decoders | Draco, Basis, Meshopt self-hosted | copy from `three/examples/jsm/libs/` |

:::flow An automated asset pipeline
Source (Blender/CAD) in Git LFS | never edit exported files by hand
CI step: gltf-transform | prune, weld, simplify, Meshopt, KTX2
Budget check | fail the build if a file exceeds its size/triangle budget
gltfjsx --types | regenerate typed components when part names change
Upload to CDN | content-hashed file names, long cache lifetimes
:::

## 2. Loading strategy

- **Poster first.** Render a static image of the default view at build time and show it instantly; swap to the live canvas when ready. Users see something in < 1 s and search engines index it.
- **Interactive before perfect.** Load a low-poly / low-res version first, then upgrade (or load detail only when the user zooms in).
- **Lazy-load the 3D bundle.** three.js + R3F + drei is a few hundred KB of JavaScript; don't block the page for it. Use `React.lazy` / `next/dynamic` and start loading when the canvas scrolls into view (`IntersectionObserver`).
- **Preload what comes next.** `useGLTF.preload()` the variants the user is likely to pick; `renderer.compileAsync()` / `<Preload all />` to avoid first-interaction stutter.
- **Progress you can trust.** A real progress bar (`useProgress`) instead of an endless spinner.

## 3. Bundle size

| Technique | Saves |
|---|---|
| import only what you use from drei (tree-shaking) | tens to hundreds of KB |
| `three/addons/…` deep imports instead of whole helper libraries | varies |
| self-host decoders and load them on demand | ~300 KB off the main bundle |
| split routes so non-3D pages don't load three.js | the whole 3D bundle |
| analyse with `vite-bundle-visualizer` / `source-map-explorer` | finds surprises |

## 4. Hosting and caching

Any static host or CDN works (Vercel, Netlify, Cloudflare Pages, S3 + CloudFront, GitHub Pages). For 3D specifically:

- Serve `.glb`, `.ktx2`, `.hdr` and `.wasm` with **Brotli/gzip** (`.glb` with Meshopt compresses well further) and correct MIME types (`model/gltf-binary`, `application/wasm`).
- Use **content-hashed file names** + `Cache-Control: public, max-age=31536000, immutable`, so returning visitors load nothing.
- If models live on another domain, configure **CORS** (`Access-Control-Allow-Origin`), or loaders will fail.
- WebXR and some sensors need **HTTPS** (localhost is exempt during development).
- Large catalogues: store models in object storage with a CDN in front; generate optimised variants on upload.

## 5. Graceful failure: no WebGL, lost context, crashes

Some users have WebGL disabled, blocklisted GPUs, or run out of GPU memory (mobile Safari can kill the context when a tab uses too much). Plan for it:

```jsx run title="Fallbacks: no WebGL, render errors and context loss" level=advanced
import { Component, useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

// 1) catch errors thrown while rendering the 3D tree (bad model, shader error…)
class SceneBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("3D view failed:", error.message); /* report to Sentry etc. */ }
  render() {
    return this.state.error ? <Fallback reason="The 3D view hit an error." /> : this.props.children;
  }
}

function Fallback({ reason }) {
  return (
    <div className="overlay" style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
      <b>3D preview unavailable</b>
      <span className="muted">{reason} Here's a photo instead.</span>
      <div style={{ width: 220, height: 120, borderRadius: 10, background: "linear-gradient(135deg, #10b981, #4f46e5)" }} />
    </div>
  );
}

// 2) WebGL context loss: the GPU dropped our context (memory pressure, driver reset)
function ContextWatcher({ onLost }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (e) => { e.preventDefault(); onLost(true); };     // preventDefault allows restoring later
    const restored = () => onLost(false);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => { canvas.removeEventListener("webglcontextlost", lost); canvas.removeEventListener("webglcontextrestored", restored); };
  }, [gl, onLost]);
  return null;
}

function Simulate() {
  const gl = useThree((s) => s.gl);
  // a button that forces context loss so you can see the fallback (WEBGL_lose_context is a debug extension)
  useEffect(() => {
    window.__loseContext = () => gl.getContext().getExtension("WEBGL_lose_context")?.loseContext();
    window.__restoreContext = () => gl.getContext().getExtension("WEBGL_lose_context")?.restoreContext();
  }, [gl]);
  return null;
}

function Broken() {
  throw new Error("Model failed to parse");   // simulates a crash inside the scene
}

export default function App() {
  const [lost, setLost] = useState(false);
  const [crash, setCrash] = useState(false);
  return (
    <>
      <SceneBoundary key={crash ? "crash" : "ok"}>
        <Canvas camera={{ position: [0, 0, 4] }} fallback={<Fallback reason="Your browser doesn't support WebGL." />}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[2, 3, 4]} intensity={2} />
          <mesh><torusKnotGeometry args={[0.8, 0.28, 160, 24]} /><meshStandardMaterial color="#10b981" /></mesh>
          <OrbitControls />
          <ContextWatcher onLost={setLost} />
          <Simulate />
          {crash && <Broken />}
        </Canvas>
      </SceneBoundary>
      {lost && <Fallback reason="The graphics context was lost." />}
      <div className="overlay bottom">
        <div className="row">
          <button onClick={() => window.__loseContext?.()}>Simulate context loss</button>
          <button onClick={() => window.__restoreContext?.()}>Restore</button>
          <button onClick={() => setCrash(!crash)}>{crash ? "Recover" : "Simulate crash"}</button>
        </div>
      </div>
    </>
  );
}
```

Try the buttons. After **Simulate crash** the error still appears in the console (and this site's error banner): React reports errors even when a boundary catches them, which is what you want for monitoring. Users see only the fallback.

| Failure | Detection | Response |
|---|---|---|
| no WebGL | `<Canvas fallback={…}>` | static images, 360° photo spin, or a video |
| render error | React error boundary | fallback + error reporting |
| context lost | `webglcontextlost` event | show fallback, release memory, try to restore or reload the view |
| too slow | `PerformanceMonitor` | lower quality, disable effects |
| asset 404 / CORS | loader error inside Suspense → error boundary | friendly message + retry |

## 6. Accessibility

3D content is easy to make inaccessible. Minimum bar:

- **Everything clickable in 3D is also reachable another way**: a list of parts, keyboard shortcuts for preset views, a regular HTML form for configuration options. The 3D view enhances; it shouldn't be the only path.
- **Keyboard**: arrow keys to rotate, +/- to zoom, Tab through hotspots (drei `<Html>` hotspots are real, focusable buttons). `@react-three/a11y` adds focus, roles and screen-reader descriptions to meshes.
- **Text alternatives**: an `aria-label`/description of what the canvas shows, and real text for all information.
- **Motion**: honour `prefers-reduced-motion` (no auto-rotate, no camera swoops, instant transitions).
- **Contrast and size**: hotspots big enough for touch (44 px), labels readable on any background.
- **Don't trap scroll**: canvases inside pages shouldn't hijack the wheel; use `OrbitControls enableZoom={false}` or require a modifier/click to activate.

## 7. SEO, sharing and analytics

- Search engines and link previews don't run WebGL: provide the **poster image**, real HTML text, `og:image` (a render of the product), and structured data (e.g. `Product` schema).
- Google supports **3D/AR models in search** for products via `<model-viewer>`-style markup and Merchant Center 3D assets; keep a `.glb` (and `.usdz` for iOS Quick Look) of hero products.
- **Analytics** that matter for 3D: time to first render, % of sessions where 3D loaded vs. fell back, interactions (rotations, variant changes, AR launches), and conversion compared with users who saw images only. Throttle events (don't log every orbit frame).

## 8. Security and privacy

- **User-uploaded models** (configurators, marketplaces, CAD viewers) are untrusted input: validate with the Khronos glTF Validator on the server, cap file size and triangle counts, strip unexpected extensions, and serve from a separate domain. Malformed files can freeze or crash tabs.
- **Content-Security-Policy**: WebAssembly decoders need `'wasm-unsafe-eval'`; workers (Draco, KTX2) need `worker-src blob:` if created from blobs; allow your asset CDN in `connect-src`/`img-src`.
- **Camera and sensors** (AR, face tracking): request only when needed, explain why, process on device where possible.
- **Asset licences**: check every model, texture and HDRI licence for commercial use (CC0 vs. CC-BY vs. editorial-only), and keep a record.

## 9. Browser and device support

| Target | Notes |
|---|---|
| Chrome / Edge / Firefox desktop | everything, WebGPU included |
| Safari macOS / iOS | WebGL 2 and WebGPU; watch memory limits on iPhone (big textures can crash the tab); no WebXR on iPhone — use AR Quick Look (USDZ) |
| Android Chrome | WebGL 2, WebGPU, WebXR AR (ARCore) |
| Meta Quest Browser, Vision Pro Safari, Android XR Chrome | WebXR VR (and AR on Quest / Android XR) |
| low-end Android, old iPads | test! reduce DPR, effects and texture sizes |

Test on real devices regularly. Remote debugging (`chrome://inspect` for Android and Quest, Safari Web Inspector for iOS/visionOS) shows real frame times and memory.

## 10. Launch checklist

:::keypoints
- **Assets** optimised in CI against budgets (size, triangles, texture resolution); decoders self-hosted.
- **Loading**: poster image, lazy 3D bundle, progress UI, preload next variants, shaders warmed up.
- **Hosting**: Brotli, correct MIME types, hashed names + immutable caching, CORS and HTTPS configured.
- **Resilience**: `Canvas fallback`, error boundary, context-loss handling, adaptive quality.
- **Accessibility**: non-3D paths to every action, keyboard support, reduced motion, real text.
- **SEO/sharing**: poster, `og:image`, structured data; analytics for load success and engagement.
- **Security**: validate uploads, CSP for WASM/workers, licences recorded.
- **Testing**: real devices, visual regression screenshots, performance budgets in CI.
:::

## Check yourself

```quiz
? What should users and search engines see before the 3D view is ready?
+ A poster image of the default view, plus real HTML content
- A spinner only
- Nothing until WebGL loads
> It's instant feedback and what crawlers index.

? Which event tells you the GPU dropped your WebGL context?
+ webglcontextlost on the canvas
- error on window
- visibilitychange
> preventDefault() lets you try to restore it.

? A configurator lets users upload their own models. What's essential?
+ Validate size, triangle count and structure server-side and serve from a separate domain
- Load them directly with GLTFLoader
- Convert them to PNG
> Uploaded models are untrusted input.

? What do WebAssembly decoders need in a Content-Security-Policy?
+ 'wasm-unsafe-eval' (and worker-src blob: if workers are created from blobs)
- Nothing special
- unsafe-inline styles
> Otherwise Draco/Basis/Rapier fail to start.

? How should you cache content-hashed .glb files?
+ Long-lived and immutable (max-age one year)
- no-store
- Five minutes
> The hash changes when the file changes.
```

:::exercise Reduced motion
Make the fallback example respect `prefers-reduced-motion`: read it with `window.matchMedia("(prefers-reduced-motion: reduce)").matches` and, when true, render `OrbitControls` without auto-rotation and with `enableDamping={false}`; otherwise auto-rotate.
:::

:::solution
```jsx run
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function App() {
  return (
    <>
      <div className="overlay">Reduced motion: {String(reduceMotion)}</div>
      <Canvas camera={{ position: [0, 0, 4] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 4]} intensity={2} />
        <mesh><torusKnotGeometry args={[0.8, 0.28, 160, 24]} /><meshStandardMaterial color="#10b981" /></mesh>
        <OrbitControls autoRotate={!reduceMotion} enableDamping={!reduceMotion} />
      </Canvas>
    </>
  );
}
```
:::
