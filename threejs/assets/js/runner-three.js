/* ==========================================================================
   Three.js runner — compiles JS / JSX / TSX in the browser with Babel and runs it
   inside a sandboxed iframe with a full-size canvas. three.js, React Three Fiber,
   drei, @react-three/xr and friends load from esm.sh through an import map.

   Plain ```js run blocks are vanilla three.js modules (they create their own renderer
   and append its canvas to document.body). ```jsx run blocks mount the component
   named App (or the default export) into #root, like the React course.
   ========================================================================== */
(function () {
  "use strict";

  const BABEL_URL = "https://cdn.jsdelivr.net/npm/@babel/standalone@7.29.9/babel.min.js";
  const THREE_V = "0.186.1";
  const R = "19.3.0";
  const T = `https://esm.sh/three@${THREE_V}`;
  // every package that touches three/react must share ONE copy of each, so they are external
  const X = "external=react,react-dom,three,@react-three/fiber";
  const IMPORTS = {
    "three": T,
    "three/webgpu": `${T}/webgpu`,
    "three/tsl": `${T}/tsl`,
    "three/addons/": `${T}/examples/jsm/`,
    "three/examples/jsm/": `${T}/examples/jsm/`,
    "three/": `${T}/`,
    // some transitive deps import an unversioned three straight from esm.sh: pin those to the same copy
    "https://esm.sh/three?target=es2022": T,
    "https://esm.sh/three/": `${T}/`,
    "react": `https://esm.sh/react@${R}`,
    "react/jsx-runtime": `https://esm.sh/react@${R}/jsx-runtime`,
    "react/jsx-dev-runtime": `https://esm.sh/react@${R}/jsx-dev-runtime`,
    "react-dom": `https://esm.sh/react-dom@${R}?external=react`,
    "react-dom/client": `https://esm.sh/react-dom@${R}/client?external=react,react-dom`,
    "@react-three/fiber": "https://esm.sh/@react-three/fiber@9.8.1?external=react,react-dom,three",
    "@react-three/drei": `https://esm.sh/@react-three/drei@10.7.9?${X}`,
    "@react-three/xr": `https://esm.sh/@react-three/xr@6.6.31?${X}`,
    "@react-three/handle": `https://esm.sh/@react-three/handle@6.6.31?${X}`,
    "@react-three/rapier": `https://esm.sh/@react-three/rapier@2.2.0?${X}`,
    "@react-three/postprocessing": `https://esm.sh/@react-three/postprocessing@3.1.3?${X},postprocessing`,
    "postprocessing": "https://esm.sh/postprocessing@6.39.5?external=three",
    // uikit registers components by class name, so its builds must keep names un-minified (pmndrs/uikit#259)
    "@react-three/uikit": `https://esm.sh/@react-three/uikit@1.0.76?${X}&keep-names`,
    "https://esm.sh/@pmndrs/uikit@^1.0.76?external=three&target=es2022": "https://esm.sh/@pmndrs/uikit@1.0.76?external=three&keep-names",
    "@react-spring/three": `https://esm.sh/@react-spring/three@10.1.2?${X}`,
    "leva": "https://esm.sh/leva@0.10.1?external=react,react-dom",
    "zustand": "https://esm.sh/zustand@5.0.15?external=react",
    "zustand/middleware": "https://esm.sh/zustand@5.0.15/middleware?external=react",
    "maath": "https://esm.sh/maath@0.10.8?external=three",
    "maath/easing": "https://esm.sh/maath@0.10.8/easing?external=three",
    "maath/random": "https://esm.sh/maath@0.10.8/random?external=three",
    "gsap": "https://esm.sh/gsap@3.15.0",
    "lil-gui": "https://esm.sh/lil-gui@0.21.0",
    "iwer": "https://esm.sh/iwer@2.5.0",
    "@iwer/devui": "https://esm.sh/@iwer/devui@2.5.0?external=three",
    "@dimforge/rapier3d-compat": "https://esm.sh/@dimforge/rapier3d-compat@0.21.0",
    "zod": "https://esm.sh/zod@4.6.5",
    "urdf-loader": "https://esm.sh/urdf-loader@0.13.1?external=three",
  };

  // Default look inside every preview: a full-size canvas plus small helpers for HTML overlays.
  const BASE_CSS = `
    :root { --bg:#f4f6fb; --fg:#141824; --muted:#6b7591; --border:#d9dee9; --card:rgba(255,255,255,.86); --accent:#059669; --accent-2:#4f46e5; --danger:#dc2626; color-scheme: light; }
    :root[data-theme="dark"] { --bg:#0b1020; --fg:#e7eaf3; --muted:#8a93ad; --border:#2a3550; --card:rgba(17,23,38,.84); --accent:#34d399; --accent-2:#818cf8; --danger:#f87171; color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; overflow: hidden; background: var(--bg); color: var(--fg); font: 14px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    #root { position: relative; width: 100%; height: 100%; }
    #root:empty { display: none; }
    canvas { display: block; touch-action: none; }
    body > canvas { width: 100%; height: 100%; }
    button { font: inherit; cursor: pointer; border: 1px solid var(--border); background: var(--card); color: var(--fg); padding: 6px 12px; border-radius: 9px; backdrop-filter: blur(6px); transition: border-color .15s; }
    button:hover { border-color: var(--accent); }
    button.primary, button.on { background: var(--accent); border-color: transparent; color: #fff; }
    input, select { font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 5px 8px; }
    input[type="range"], input[type="checkbox"], input[type="radio"], input[type="color"] { accent-color: var(--accent); padding: 0; }
    label { display: flex; align-items: center; gap: 8px; }
    code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: .9em; }
    .overlay { position: absolute; top: 10px; left: 10px; z-index: 10; display: flex; flex-direction: column; gap: 8px; max-width: min(320px, calc(100% - 20px)); padding: 10px 12px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); backdrop-filter: blur(8px); }
    .overlay.right { left: auto; right: 10px; }
    .overlay.bottom { top: auto; bottom: 10px; }
    .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .muted { color: var(--muted); }
    .xr-buttons { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 8px; }
    .label3d { padding: 3px 8px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); font-size: 12px; white-space: nowrap; pointer-events: none; }
    #__overlay { position: fixed; inset: auto 8px 8px 8px; padding: 10px 12px; border-radius: 10px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; font: 12.5px/1.5 ui-monospace, monospace; white-space: pre-wrap; max-height: 45%; overflow: auto; z-index: 99999; }
  `;

  const ICON = {
    cube: '<svg class="icon" viewBox="0 0 24 24"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
    reload: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    term: '<svg class="icon" viewBox="0 0 24 24"><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>',
    full: '<svg class="icon" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    stop: '<svg class="icon" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  };

  const MAX_LIVE = 6;                 // live WebGL previews at once; browsers cap contexts (~16)
  let babel = null;
  const listeners = [];
  let state = ["idle", "3D: idle"];
  const setState = (s, label) => { state = [s, label]; listeners.forEach((f) => f(s, label)); };
  const theme = () => document.documentElement.getAttribute("data-theme") || "light";
  const frames = new Map();           // id -> { card, panel, done, errored }
  const live = [];                    // panels with a running preview, oldest first

  function loadBabel() {
    if (babel) return babel;
    setState("loading", "Loading compiler…");
    babel = new Promise((resolve, reject) => {
      if (window.Babel) { setState("ready", `three r${THREE_V.split(".")[1]} ready`); return resolve(window.Babel); }
      const s = document.createElement("script");
      s.src = BABEL_URL;
      s.onload = () => { setState("ready", `three r${THREE_V.split(".")[1]} ready`); resolve(window.Babel); };
      s.onerror = () => { babel = null; setState("error", "Compiler failed to load"); reject(new Error("Couldn't download the JSX compiler. Check your internet connection.")); };
      document.head.appendChild(s);
    });
    return babel;
  }

  function findComponent(code) {
    const m = code.match(/export\s+default\s+function\s+([A-Z]\w*)/)
      || code.match(/export\s+default\s+([A-Z]\w*)\s*;?\s*$/m)
      || code.match(/^(?:export\s+)?(?:function|const|let|class)\s+(App)\b/m);
    return m ? m[1] : null;
  }

  const usesXR = (code) => /@react-three\/xr|from\s+["']iwer["']|XRButton|VRButton|ARButton/.test(code);

  function compile(B, code, lang) {
    let src = code;
    const isReact = lang !== "js" && lang !== "javascript" || /from\s+["']react/.test(code);
    const mounts = /createRoot\s*\(/.test(src);
    const component = isReact && !mounts ? findComponent(src) : null;
    if (usesXR(src)) src = "await window.__xrReady;\n" + src;
    if (component) {
      src += `\n\nimport { createRoot as __createRoot } from "react-dom/client";\n` +
             `__createRoot(document.getElementById("root"), { onUncaughtError: (e) => window.__showError(e) }).render(<${component} />);\n`;
    }
    const tsx = lang === "tsx" || lang === "ts";
    const presets = [["react", { runtime: "automatic" }]];
    if (tsx) presets.unshift(["typescript", { isTSX: true, allExtensions: true }]);
    const out = B.transform(src, { presets, filename: tsx ? "App.tsx" : "App.jsx", sourceType: "module" }).code;
    const hasUI = !!component || mounts || /document\.|Renderer\s*\(|canvas/i.test(code);
    return { js: out, hasUI };
  }

  function bridge(id) {
    return `(() => {
      const ID = ${JSON.stringify(id)};
      const send = (type, data) => parent.postMessage(Object.assign({ __threeLab: ID, type }, data), "*");
      const fmt = (v) => {
        if (v instanceof Error) return v.message;
        if (typeof v === "string") return v;
        if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(+v.toFixed(4));
        if (typeof v === "function") return "ƒ " + (v.name || "anonymous") + "()";
        if (v && v.isVector2) return "Vector2(" + [v.x, v.y].map((n) => +n.toFixed(3)).join(", ") + ")";
        if (v && v.isVector3) return "Vector3(" + [v.x, v.y, v.z].map((n) => +n.toFixed(3)).join(", ") + ")";
        if (v && v.isQuaternion) return "Quaternion(" + [v.x, v.y, v.z, v.w].map((n) => +n.toFixed(3)).join(", ") + ")";
        if (v && v.isEuler) return "Euler(" + [v.x, v.y, v.z].map((n) => +n.toFixed(3)).join(", ") + ", " + v.order + ")";
        if (v && v.isColor) return "Color(#" + v.getHexString() + ")";
        if (v && v.isMatrix4) { const e = v.elements; return "Matrix4[\\n" + [0, 1, 2, 3].map((r) => "  " + [0, 4, 8, 12].map((c) => (+e[r + c].toFixed(2)).toString().padStart(6)).join(" ")).join("\\n") + " ]"; }
        if (v && v.isObject3D) return (v.type || "Object3D") + (v.name ? ' "' + v.name + '"' : "");
        if (v instanceof Map) v = Object.fromEntries(v);
        if (v instanceof Set) v = [...v];
        try { return JSON.stringify(v, (k, x) => typeof x === "bigint" ? x.toString() : (typeof x === "number" && !Number.isInteger(x) ? +x.toFixed(4) : x), 2) ?? String(v); } catch { return String(v); }
      };
      // known library noise, not caused by the learner's code:
      //  - R3F 9 still uses THREE.Clock, which three r186 deprecates in favour of THREE.Timer
      //  - Rapier's WebAssembly bootstrap (wasm-bindgen) warns about its own init signature
      //  - @react-three/xr still uses zustand 4's \`create\` internally; IWER logs its frame rate;
      //    the XR teleport arc and controller models log harmless warnings
      const noise = /THREE\\.Clock: This module has been deprecated|using deprecated parameters for the initialization function|Use \`createWithEqualityFn\` instead of \`create\`|Nominal frame rate updated|Could not find \\w+ in the model|parameter 'resolution' has value of undefined|^%s|Download the React DevTools|^\\[\\$updateSource\\]|^IntersectionObserver fired|^A-Frame Version|^THREE Version \\(https/;
      for (const level of ["log", "info", "warn", "error"]) {
        const orig = console[level].bind(console);
        console[level] = (...args) => {
          const text = args.map(fmt).join(" ");
          if (noise.test(text)) return orig(...args);
          send("console", { level, text });
          orig(...args);
        };
      }
      window.__showError = (e) => {
        const msg = (e && e.message) || String(e);
        send("fatal", { text: msg });
        let o = document.getElementById("__overlay");
        if (!o) { o = document.createElement("div"); o.id = "__overlay"; document.body.appendChild(o); }
        o.textContent = "⚠ " + msg;
      };
      addEventListener("error", (e) => window.__showError(e.error || e.message));
      addEventListener("unhandledrejection", (e) => window.__showError("Unhandled promise rejection: " + ((e.reason && e.reason.message) || e.reason)));

      // Pause the render loop while the preview is scrolled out of view (saves GPU + battery).
      // three's setAnimationLoop and R3F both call window.requestAnimationFrame at call time.
      const raf = window.requestAnimationFrame.bind(window);
      let paused = false;
      const queued = [];
      window.requestAnimationFrame = (cb) => { if (paused) { queued.push(cb); return 0; } return raf(cb); };
      addEventListener("message", (e) => {
        const d = e.data || {};
        if (d.__theme) document.documentElement.dataset.theme = d.__theme;
        if ("__pause" in d) {
          paused = !!d.__pause;
          if (!paused) queued.splice(0).forEach((cb) => raf(cb));
        }
      });

      // WebXR emulation: when the browser has navigator.xr but no headset (desktop Chrome),
      // hide it so the emulator (IWER) can install itself. Real headsets keep native WebXR.
      window.__xrReady = (async () => {
        try {
          if (!navigator.xr) return;
          const vr = await navigator.xr.isSessionSupported("immersive-vr").catch(() => false);
          const ar = await navigator.xr.isSessionSupported("immersive-ar").catch(() => false);
          if (!vr && !ar) delete Navigator.prototype.xr;
        } catch { /* keep native */ }
      })();
    })();`;
  }

  function buildDoc(id, js) {
    const safe = js.replace(/<\/script/gi, "<\\/script");
    return `<!doctype html><html data-theme="${theme()}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="importmap">${JSON.stringify({ imports: IMPORTS })}</script>
<style>${BASE_CSS}</style>
<script>${bridge(id)}</script>
</head><body><div id="root"></div>
<script type="module" onerror="window.__showError('Could not load three.js from the internet (esm.sh). Check your connection and press Reload.')">
${safe}
parent.postMessage({ __threeLab: ${JSON.stringify(id)}, type: "done" }, "*");
</script></body></html>`;
  }

  // pause previews that are scrolled off-screen
  const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const f = en.target;
      if (document.fullscreenElement === f) return;
      try { f.contentWindow.postMessage({ __pause: !en.isIntersecting }, "*"); } catch { /* ignore */ }
    });
  }, { rootMargin: "120px" }) : null;

  function stopPanel(panel, reason) {
    const iframe = panel.querySelector(".preview iframe");
    const i = live.indexOf(panel);
    if (i >= 0) live.splice(i, 1);
    if (io) io.unobserve(iframe);
    iframe.removeAttribute("srcdoc");
    iframe.src = "about:blank";
    iframe.style.display = "none";
    const ph = panel.querySelector(".preview-stopped");
    ph.hidden = false;
    ph.querySelector("span").textContent = reason;
    status(panel, "■ Stopped");
    const old = panel.dataset.frameId;
    if (old) frames.delete(old);
  }

  function ensurePanel(card, meta) {
    let panel = card.querySelector(".preview-wrap");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.className = "preview-wrap";
    panel.innerHTML = `
      <div class="preview">
        <div class="out-head">${ICON.cube} Scene <span class="out-status"></span>
          <button class="btn ghost act-full" title="Fullscreen">${ICON.full}<span class="lbl-sm">Fullscreen</span></button>
          <button class="btn ghost act-stop" title="Stop this preview">${ICON.stop}<span class="lbl-sm">Stop</span></button>
          <button class="btn ghost act-reload" title="Re-run">${ICON.reload}<span class="lbl-sm">Reload</span></button>
          <button class="btn ghost act-console" title="Show console">${ICON.term}<span class="lbl-sm">Console</span> <span class="console-count"></span></button>
        </div>
        <iframe title="Live 3D preview" allow="xr-spatial-tracking; fullscreen; gyroscope; accelerometer; autoplay" allowfullscreen sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-pointer-lock allow-downloads"></iframe>
        <div class="preview-stopped" hidden>${ICON.cube}<span></span><button class="btn act-restart">Run again</button></div>
      </div>
      <div class="console" hidden><div class="out-head">${ICON.term} Console <button class="btn ghost act-clear">Clear</button></div><div class="out-body"></div></div>`;
    card.querySelector(".card-extra").appendChild(panel);
    const iframe = panel.querySelector("iframe");
    iframe.style.height = (parseInt(meta && meta.height, 10) || 400) + "px";
    panel.querySelector(".act-console").onclick = () => { const c = panel.querySelector(".console"); c.hidden = !c.hidden; };
    panel.querySelector(".act-clear").onclick = () => { panel.querySelector(".console .out-body").innerHTML = ""; panel.querySelector(".console-count").textContent = ""; };
    panel.querySelector(".act-reload").onclick = () => card._run && card._run();
    panel.querySelector(".act-restart").onclick = () => card._run && card._run();
    panel.querySelector(".act-stop").onclick = () => stopPanel(panel, "Preview stopped.");
    panel.querySelector(".act-full").onclick = () => { if (iframe.requestFullscreen) iframe.requestFullscreen().catch(() => {}); };
    return panel;
  }

  function status(panel, text, kind) {
    const s = panel.querySelector(".out-status");
    s.textContent = text;
    s.className = "out-status " + (kind || "");
  }

  function log(panel, level, text) {
    const body = panel.querySelector(".console .out-body");
    const line = document.createElement("div");
    line.className = level === "error" ? "stderr" : level === "warn" ? "warn" : "";
    line.textContent = (level === "error" ? "✕ " : level === "warn" ? "⚠ " : "› ") + text;
    body.appendChild(line);
    while (body.children.length > 400) body.firstChild.remove();
    body.scrollTop = body.scrollHeight;
    const count = body.children.length;
    panel.querySelector(".console-count").textContent = count ? `(${count})` : "";
    if (level === "error" || panel.dataset.ui === "0") panel.querySelector(".console").hidden = false;
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || !d.__threeLab) return;
    const entry = frames.get(d.__threeLab);
    if (!entry) return;
    const { panel } = entry;
    if (d.type === "console") {
      log(panel, d.level, d.text);
    } else if (d.type === "fatal") {
      log(panel, "error", d.text);
      status(panel, "✕ Error — see console", "err");
      entry.errored = true;
    } else if (d.type === "done") {
      entry.done = true;
      if (!entry.errored) status(panel, panel.dataset.ui === "1" ? "✓ Live" : "✓ Ran", "ok");
    }
  });

  const debounce = new WeakMap();

  const Runner = {
    name: "Three.js",
    canRun: (lang) => ["jsx", "tsx", "js", "javascript", "ts"].includes(lang),
    onStatus(fn) { listeners.push(fn); fn(...state); },
    warm() { return loadBabel().catch(() => {}); },

    async run({ code, lang, card, meta }) {
      const panel = ensurePanel(card, meta);
      const old = panel.dataset.frameId;
      if (old) frames.delete(old);
      panel.querySelector(".console .out-body").innerHTML = "";
      panel.querySelector(".console-count").textContent = "";
      panel.querySelector(".preview-stopped").hidden = true;
      status(panel, "Compiling…");
      let B;
      try { B = await loadBabel(); } catch (e) { status(panel, "✕ " + e.message, "err"); return; }
      let compiled;
      try {
        compiled = compile(B, code, lang);
      } catch (e) {
        panel.dataset.ui = "0";
        panel.querySelector(".preview iframe").style.display = "none";
        log(panel, "error", (e.message || String(e)).replace(/^\/?App\.[jt]sx:\s*/, "Syntax error: "));
        status(panel, "✕ Syntax error", "err");
        return;
      }
      const id = Math.random().toString(36).slice(2);
      panel.dataset.frameId = id;
      panel.dataset.ui = compiled.hasUI ? "1" : "0";
      const entry = { card, panel, done: false, errored: false };
      frames.set(id, entry);
      const iframe = panel.querySelector(".preview iframe");
      iframe.style.display = compiled.hasUI ? "block" : "none";
      panel.querySelector(".act-full").hidden = !compiled.hasUI;
      panel.querySelector(".act-stop").hidden = !compiled.hasUI;
      if (!compiled.hasUI) panel.querySelector(".console").hidden = false;

      // keep at most MAX_LIVE WebGL previews running: stop the oldest
      const i = live.indexOf(panel);
      if (i >= 0) live.splice(i, 1);
      if (compiled.hasUI) {
        live.push(panel);
        while (live.length > MAX_LIVE) stopPanel(live[0], "Paused to free the GPU — too many live scenes on this page.");
        if (io) io.observe(iframe);
      }

      status(panel, "Loading three.js…");
      iframe.removeAttribute("src");
      iframe.srcdoc = buildDoc(id, compiled.js);
      card._previewed = true;
      await new Promise((resolve) => {
        const t0 = Date.now();
        const tick = () => (entry.done || entry.errored || Date.now() - t0 > 30000) ? resolve() : setTimeout(tick, 60);
        tick();
      });
      if (!entry.done && !entry.errored) status(panel, "✕ Timed out loading three.js", "err");
    },

    onEdit(ctx) {
      if (!ctx.card._previewed) return;
      clearTimeout(debounce.get(ctx.card));
      debounce.set(ctx.card, setTimeout(() => Runner.run(ctx), 900));
    },

    onTheme(t) {
      document.querySelectorAll(".preview iframe").forEach((f) => { try { f.contentWindow.postMessage({ __theme: t }, "*"); } catch { /* ignore */ } });
    },

    cleanup() { frames.clear(); live.length = 0; if (io) io.disconnect(); },
  };

  window.Runner = Runner;
})();
