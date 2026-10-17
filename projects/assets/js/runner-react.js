/* ==========================================================================
   React runner — compiles JSX/TSX in the browser with Babel and renders it live
   inside a sandboxed iframe. React and friends load from esm.sh via an import map.
   ========================================================================== */
(function () {
  "use strict";

  const BABEL_URL = "https://cdn.jsdelivr.net/npm/@babel/standalone@7.29.9/babel.min.js";
  const R = "19.3.0";
  const IMPORTS = {
    "react": `https://esm.sh/react@${R}`,
    "react/jsx-runtime": `https://esm.sh/react@${R}/jsx-runtime`,
    "react/jsx-dev-runtime": `https://esm.sh/react@${R}/jsx-dev-runtime`,
    "react-dom": `https://esm.sh/react-dom@${R}?external=react`,
    "react-dom/client": `https://esm.sh/react-dom@${R}/client?external=react,react-dom`,
    "zustand": "https://esm.sh/zustand@5.0.15?external=react",
    "zustand/middleware": "https://esm.sh/zustand@5.0.15/middleware?external=react",
    "zustand/react/shallow": "https://esm.sh/zustand@5.0.15/react/shallow?external=react",
    "zustand/shallow": "https://esm.sh/zustand@5.0.15/shallow?external=react",
    "@tanstack/react-query": "https://esm.sh/@tanstack/react-query@5.104.1?external=react",
    "zod": "https://esm.sh/zod@4.6.5",
    "react-markdown": "https://esm.sh/react-markdown@10.1.0?external=react",
    "remark-gfm": "https://esm.sh/remark-gfm@4.0.1",
    "clsx": "https://esm.sh/clsx@2.1.1",
    "immer": "https://esm.sh/immer@11.1.21",
    "react-router": "https://esm.sh/react-router@8.4.0?external=react,react-dom",
    "react-router/dom": "https://esm.sh/react-router@8.4.0/dom?external=react,react-dom",
  };

  // Default look inside every preview, so examples look good with zero styling.
  const BASE_CSS = `
    :root { --bg:#ffffff; --fg:#141824; --muted:#6b7591; --border:#e2e6ee; --card:#f6f7fb; --accent:#0891b2; --accent-2:#6366f1; --danger:#dc2626; --ok:#16a34a; color-scheme: light; }
    :root[data-theme="dark"] { --bg:#0f1420; --fg:#e7eaf3; --muted:#8a93ad; --border:#263049; --card:#161d2d; --accent:#22d3ee; --accent-2:#818cf8; --danger:#f87171; --ok:#4ade80; color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    body { padding: 16px; }
    h1, h2, h3 { line-height: 1.25; margin: 0 0 10px; }
    p { margin: 0 0 10px; }
    button { font: inherit; cursor: pointer; border: 1px solid var(--border); background: var(--card); color: var(--fg); padding: 7px 14px; border-radius: 9px; transition: border-color .15s, transform .05s; }
    button:hover { border-color: var(--accent); }
    button:active { transform: translateY(1px); }
    button:disabled { opacity: .55; cursor: not-allowed; }
    button.primary { background: var(--accent); border-color: transparent; color: #fff; }
    input, textarea, select { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--border); border-radius: 9px; padding: 8px 11px; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
    input[type="checkbox"], input[type="radio"], input[type="range"] { accent-color: var(--accent); }
    ul { padding-left: 20px; }
    code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: .9em; background: var(--card); padding: 1px 5px; border-radius: 5px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .stack { display: flex; flex-direction: column; gap: 8px; }
    .muted { color: var(--muted); }
    .error { color: var(--danger); }
    button:focus-visible, a:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    pre { font: 13px/1.5 "JetBrains Mono", ui-monospace, monospace; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; overflow: auto; margin: 0 0 10px; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; font-size: 14px; }
    th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border); }
    dialog { background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; max-width: min(420px, 92vw); }
    dialog::backdrop { background: rgb(0 0 0 / .45); }
    .cursor { display: inline-block; margin-left: 1px; color: var(--accent); animation: blink 1s steps(2) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .cursor { animation: none; } }
    #__overlay { position: fixed; inset: auto 8px 8px 8px; padding: 10px 12px; border-radius: 10px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; font: 12.5px/1.5 ui-monospace, monospace; white-space: pre-wrap; max-height: 45%; overflow: auto; z-index: 99999; }
  `;

  const ICON = {
    eye: '<svg class="icon" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    reload: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    term: '<svg class="icon" viewBox="0 0 24 24"><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>',
  };

  let babel = null;
  const listeners = [];
  let state = ["idle", "React: idle"];
  const setState = (s, label) => { state = [s, label]; listeners.forEach((f) => f(s, label)); };
  const theme = () => document.documentElement.getAttribute("data-theme") || "light";
  const frames = new Map();          // id -> { card, panel }

  function loadBabel() {
    if (babel) return babel;
    setState("loading", "Loading compiler…");
    babel = new Promise((resolve, reject) => {
      if (window.Babel) return resolve(window.Babel);
      const s = document.createElement("script");
      s.src = BABEL_URL;
      s.onload = () => { setState("ready", `React ${R} ready`); resolve(window.Babel); };
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

  function compile(B, code, lang) {
    let src = code;
    const mounts = /createRoot\s*\(/.test(src);
    const component = mounts ? null : findComponent(src);
    if (component) {
      src += `\n\nimport { createRoot as __createRoot } from "react-dom/client";\n` +
             `__createRoot(document.getElementById("root"), { onUncaughtError: (e) => window.__showError(e) }).render(<${component} />);\n`;
    }
    const tsx = lang === "tsx" || lang === "ts";
    const presets = [["react", { runtime: "automatic" }]];
    if (tsx) presets.unshift(["typescript", { isTSX: true, allExtensions: true }]);
    const out = B.transform(src, { presets, filename: tsx ? "App.tsx" : "App.jsx", sourceType: "module" }).code;
    return { js: out, hasUI: !!component || mounts };
  }


  // A tiny fake backend for lessons: `mockServer({ "POST /api/chat": (req) => sse(...) })` replaces fetch() for those
  // routes, so a React component can be developed against the real API contract with no server running.
  const MOCK = `
    (() => {
      const realFetch = window.fetch.bind(window);
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const enc = new TextEncoder();
      const abortError = () => new DOMException("The operation was aborted.", "AbortError");

      // json(data, { status, delay }) -> a normal JSON response
      window.json = (data, { status = 200, delay = 0 } = {}) => ({ __kind: "json", data, status, delay });
      // sse(events, { delay, chunk }) -> a streaming response. events: [[name, data], ...] or an async generator function.
      // chunk: cut the bytes into pieces of this size, to show that network chunks ignore event boundaries.
      window.sse = (events, { delay = 40, chunk = 0, status = 200 } = {}) => ({ __kind: "sse", events, delay, chunk, status });

      function toResponse(spec, signal) {
        if (spec instanceof Response) return spec;
        if (spec && spec.__kind === "json") {
          return sleep(spec.delay).then(() => new Response(JSON.stringify(spec.data), { status: spec.status, headers: { "Content-Type": "application/json" } }));
        }
        if (spec && spec.__kind === "sse") {
          let timer, closed = false;
          const body = new ReadableStream({
            async start(controller) {
              const fail = () => { if (!closed) { closed = true; controller.error(abortError()); } };
              if (signal) signal.addEventListener("abort", fail);
              try {
                const source = typeof spec.events === "function" ? spec.events() : spec.events;
                for await (const [name, data] of source) {
                  await sleep(spec.delay);
                  if (closed) return;
                  const text = "event: " + name + "\\ndata: " + JSON.stringify(data) + "\\n\\n";
                  const bytes = enc.encode(text);
                  if (spec.chunk) for (let i = 0; i < bytes.length; i += spec.chunk) controller.enqueue(bytes.slice(i, i + spec.chunk));
                  else controller.enqueue(bytes);
                }
                if (!closed) { closed = true; controller.close(); }
              } catch (e) { if (!closed) { closed = true; controller.error(e); } }
            },
            cancel() { closed = true; },
          });
          return new Response(body, { status: spec.status, headers: { "Content-Type": "text/event-stream" } });
        }
        return new Response(JSON.stringify(spec), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      function match(pattern, method, path) {
        const [m, p] = pattern.includes(" ") ? pattern.split(" ") : ["GET", pattern];
        if (m !== method) return null;
        const names = [];
        const re = new RegExp("^" + p.replace(/:(\\w+)/g, (_, n) => { names.push(n); return "([^/]+)"; }) + "$");
        const hit = path.match(re);
        return hit ? Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(hit[i + 1])])) : null;
      }

      window.mockServer = (routes, { log = true } = {}) => {
        window.fetch = async (input, init = {}) => {
          const req = input instanceof Request ? input : null;
          const url = new URL(req ? req.url : String(input), /^https?:/.test(location.href) ? location.href : "http://app.local/");   // a srcdoc iframe has no usable base URL
          const method = (init.method || (req && req.method) || "GET").toUpperCase();
          const signal = init.signal || (req && req.signal);
          if (signal && signal.aborted) throw abortError();
          for (const [pattern, handler] of Object.entries(routes)) {
            const params = match(pattern, method, url.pathname);
            if (!params) continue;
            let body;
            const raw = init.body ?? (req ? await req.text() : undefined);
            try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
            if (log) console.log("→ " + method + " " + url.pathname + (body ? "  " + JSON.stringify(body) : ""));
            const spec = typeof handler === "function" ? await handler({ method, url, path: url.pathname, params, query: Object.fromEntries(url.searchParams), body, signal }) : handler;
            return toResponse(spec, signal);
          }
          return realFetch(input, init);
        };
      };
    })();
  `;

  function bridge(id) {
    return `(() => {
      const ID = ${JSON.stringify(id)};
      const send = (type, data) => parent.postMessage(Object.assign({ __reactLab: ID, type }, data), "*");
      const fmt = (v) => {
        if (v instanceof Error) return v.message;
        if (typeof v === "string") return v;
        if (typeof v === "function") return "ƒ " + (v.name || "anonymous") + "()";
        if (v instanceof Map) v = Object.fromEntries(v);
        if (v instanceof Set) v = [...v];
        try { return JSON.stringify(v, (k, x) => typeof x === "bigint" ? x.toString() : x, 2) ?? String(v); } catch { return String(v); }
      };
      for (const level of ["log", "info", "warn", "error"]) {
        const orig = console[level].bind(console);
        console[level] = (...args) => {
          const text = args.map(fmt).join(" ");
          if (level === "error" && /^%s/.test(text)) return orig(...args);        // React's dev-only formatting noise
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
      ${MOCK}
      addEventListener("unhandledrejection", (e) => window.__showError("Unhandled promise rejection: " + ((e.reason && e.reason.message) || e.reason)));
      addEventListener("message", (e) => { if (e.data && e.data.__theme) document.documentElement.dataset.theme = e.data.__theme; });
      const report = () => send("height", { h: Math.ceil(document.documentElement.getBoundingClientRect().height) });
      addEventListener("DOMContentLoaded", () => { new ResizeObserver(report).observe(document.documentElement); report(); });
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
<script type="module" onerror="window.__showError('Could not load React from the internet (esm.sh). Check your connection and press Reload.')">
${safe}
parent.postMessage({ __reactLab: ${JSON.stringify(id)}, type: "done" }, "*");
</script></body></html>`;
  }

  function ensurePanel(card) {
    let panel = card.querySelector(".preview-wrap");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.className = "preview-wrap";
    panel.innerHTML = `
      <div class="preview">
        <div class="out-head">${ICON.eye} Preview <span class="out-status"></span>
          <button class="btn ghost act-reload" title="Re-run">${ICON.reload}<span class="lbl-sm">Reload</span></button>
          <button class="btn ghost act-console" title="Show console">${ICON.term}<span class="lbl-sm">Console</span> <span class="console-count"></span></button>
        </div>
        <iframe title="Live preview" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"></iframe>
      </div>
      <div class="console" hidden><div class="out-head">${ICON.term} Console <button class="btn ghost act-clear">Clear</button></div><div class="out-body"></div></div>`;
    card.querySelector(".card-extra").appendChild(panel);
    panel.querySelector(".act-console").onclick = () => { const c = panel.querySelector(".console"); c.hidden = !c.hidden; };
    panel.querySelector(".act-clear").onclick = () => { panel.querySelector(".console .out-body").innerHTML = ""; panel.querySelector(".console-count").textContent = ""; };
    panel.querySelector(".act-reload").onclick = () => card._run && card._run();
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
    body.scrollTop = body.scrollHeight;
    const count = body.children.length;
    panel.querySelector(".console-count").textContent = count ? `(${count})` : "";
    if (level === "error" || panel.dataset.ui === "0") panel.querySelector(".console").hidden = false;
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || !d.__reactLab) return;
    const entry = frames.get(d.__reactLab);
    if (!entry) return;
    const { panel } = entry;
    if (d.type === "height") {
      const iframe = panel.querySelector("iframe");
      if (panel.dataset.ui === "1") iframe.style.height = Math.min(Math.max(d.h, 60), 680) + "px";
    } else if (d.type === "console") {
      log(panel, d.level, d.text);                        // console.error is just logged (e.g. errors a boundary caught)
    } else if (d.type === "fatal") {
      log(panel, "error", d.text);                        // uncaught errors: the preview is broken
      status(panel, "✕ Error — see console", "err");
      entry.errored = true;
    } else if (d.type === "done") {
      entry.done = true;
      if (!entry.errored) status(panel, panel.dataset.ui === "1" ? "✓ Live" : "✓ Ran", "ok");
    }
  });

  const debounce = new WeakMap();

  const Runner = {
    name: "React",
    canRun: (lang) => ["jsx", "tsx", "js", "javascript", "ts"].includes(lang),
    onStatus(fn) { listeners.push(fn); fn(...state); },
    warm() { loadBabel().catch(() => {}); },

    async run({ code, lang, card }) {
      const panel = ensurePanel(card);
      const old = panel.dataset.frameId;
      if (old) frames.delete(old);
      panel.querySelector(".console .out-body").innerHTML = "";
      panel.querySelector(".console-count").textContent = "";
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
      if (!compiled.hasUI) panel.querySelector(".console").hidden = false;
      status(panel, "Loading React…");
      iframe.srcdoc = buildDoc(id, compiled.js);
      card._previewed = true;
      // resolve when the module finished (or errored), so "Run all" and tests can await it
      await new Promise((resolve) => {
        const t0 = Date.now();
        const tick = () => (entry.done || entry.errored || Date.now() - t0 > 20000) ? resolve() : setTimeout(tick, 60);
        tick();
      });
      if (!entry.done && !entry.errored) status(panel, "✕ Timed out loading React", "err");
    },

    onEdit(ctx) {
      if (!ctx.card._previewed) return;
      clearTimeout(debounce.get(ctx.card));
      debounce.set(ctx.card, setTimeout(() => Runner.run(ctx), 700));
    },

    onTheme(t) {
      document.querySelectorAll(".preview iframe").forEach((f) => { try { f.contentWindow.postMessage({ __theme: t }, "*"); } catch { /* ignore */ } });
    },

    cleanup() { frames.clear(); },
  };

  window.ReactRunner = Runner;
})();
