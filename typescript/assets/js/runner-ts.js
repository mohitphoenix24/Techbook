/* ==========================================================================
   TypeScript runner — type-checks code with the real TypeScript compiler
   (6.0, the JavaScript build of the TS 7 type system) and runs it in a
   sandboxed iframe. npm packages load from esm.sh via an import map.

   Features
   • Type errors: listed under the code and underlined in the editor
   • `// ^?` queries: show the type of the thing the caret points at
   • Live checking while you type (after the first run)
   • Node-style console output (objects, Maps, classes, errors, tables…)
   ========================================================================== */
(function () {
  "use strict";

  const BASE = (document.currentScript && document.currentScript.src.replace(/assets\/js\/runner-ts\.js.*$/, "")) || "";
  const TS_URL = BASE + "assets/vendor/ts/typescript.min.js";
  const TYPES_URL = BASE + "assets/vendor/ts/ts-types.js";
  const IMPORTS = {
    "zod": "https://esm.sh/zod@4.6.5",
    "zod/v4": "https://esm.sh/zod@4.6.5/v4",
    "ts-pattern": "https://esm.sh/ts-pattern@5.9.0",
    "hono": "https://esm.sh/hono@4.13.13",
    "hono/": "https://esm.sh/hono@4.13.13/",
  };
  // Real type definitions for zod, hono and ts-pattern are bundled in ts-types.js.
  const AMBIENT = "export {};\n";

  const listeners = [];
  let state = ["idle", "TypeScript: idle"];
  const setState = (s, label) => { state = [s, label]; listeners.forEach((f) => f(s, label)); };
  let loading = null;
  let ts = null;
  let service = null;
  let mainText = "";
  let mainVersion = 0;
  const frames = new Map();

  /* ---------------------------------------------------------------- loading */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Couldn't load " + src.split("/").pop()));
      document.head.appendChild(s);
    });
  }

  function load() {
    if (loading) return loading;
    setState("loading", "Loading TypeScript…");
    loading = Promise.all([window.ts ? null : loadScript(TS_URL), window.TS_TYPES ? null : loadScript(TYPES_URL)])
      .then(() => {
        ts = window.ts;
        service = createService();
        check("export {};");                         // warm up: parses the lib files once
        setState("ready", `TypeScript ${ts.version} ready`);
        return ts;
      })
      .catch((e) => { loading = null; setState("error", "TypeScript failed to load"); throw e; });
    return loading;
  }

  /* ---------------------------------------------------------------- language service */
  const MAIN = "/main.ts";
  function createService() {
    const T = window.TS_TYPES;
    const files = new Map();
    for (const [name, text] of Object.entries(T.libs)) files.set("/lib/" + name, text);
    for (const [p, text] of Object.entries(T.files)) files.set(p, text);
    files.set("/ambient.d.ts", AMBIENT);
    const roots = [...Object.keys(T.libs).map((n) => "/lib/" + n), "/ambient.d.ts", MAIN];
    const dirs = new Set();
    for (const p of files.keys()) { let d = p; while ((d = d.slice(0, d.lastIndexOf("/"))) && !dirs.has(d)) dirs.add(d); }
    dirs.add("/node_modules");

    const options = {
      target: ts.ScriptTarget.ES2025 ?? ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      moduleDetection: ts.ModuleDetectionKind.Force,      // every editor is its own module
      strict: true,
      noLib: true,                                        // libs are passed as root files instead
      skipLibCheck: true,
      noEmit: true,
      types: [],
      allowUnreachableCode: true,
    };
    const snapshots = new Map();
    const host = {
      getCompilationSettings: () => options,
      getScriptFileNames: () => roots,
      getScriptVersion: (f) => (f === MAIN ? String(mainVersion) : "1"),
      getScriptSnapshot: (f) => {
        if (f === MAIN) return ts.ScriptSnapshot.fromString(mainText);
        if (!files.has(f)) return undefined;
        if (!snapshots.has(f)) snapshots.set(f, ts.ScriptSnapshot.fromString(files.get(f)));
        return snapshots.get(f);
      },
      getCurrentDirectory: () => "/",
      getDefaultLibFileName: () => "/lib/lib.d.ts",
      fileExists: (f) => f === MAIN || files.has(f),
      readFile: (f) => (f === MAIN ? mainText : files.get(f)),
      directoryExists: (d) => dirs.has(d.replace(/\/$/, "")),
      getDirectories: (d) => [...dirs].filter((x) => x.startsWith(d.replace(/\/$/, "") + "/") && !x.slice(d.length + 1).includes("/")).map((x) => x.split("/").pop()),
      useCaseSensitiveFileNames: () => true,
    };
    return ts.createLanguageService(host, ts.createDocumentRegistry());
  }

  // Returns { diagnostics: [{line, col, endLine, endCol, message, code}], queries: [{line, text}] }
  function check(code) {
    mainText = code;
    mainVersion++;
    const sf = () => service.getProgram().getSourceFile(MAIN);
    const raw = [...service.getSyntacticDiagnostics(MAIN), ...service.getSemanticDiagnostics(MAIN)];
    const file = sf();
    const diagnostics = raw.map((d) => {
      const start = d.start ?? 0;
      const s = file.getLineAndCharacterOfPosition(start);
      const e = file.getLineAndCharacterOfPosition(start + (d.length || 1));
      return { line: s.line, col: s.character, endLine: e.line, endCol: e.character, code: d.code,
               message: ts.flattenDiagnosticMessageText(d.messageText, "\n") };
    });
    // twoslash-style queries:   const x = 1 + 2;
    //                           //    ^?
    const queries = [];
    const lines = code.split("\n");
    lines.forEach((ln, i) => {
      const m = ln.match(/^(\s*\/\/\s*)\^\?/);
      if (!m || i === 0) return;
      const col = ln.indexOf("^");
      const target = lines[i - 1];
      if (col >= target.length) return;
      const pos = file.getPositionOfLineAndCharacter(i - 1, col);
      const info = service.getQuickInfoAtPosition(MAIN, pos);
      if (info) queries.push({ line: i, col, text: ts.displayPartsToString(info.displayParts) });
    });
    return { diagnostics, queries };
  }

  /* ---------------------------------------------------------------- editor decorations */
  function decorate(card, result) {
    const cm = card._cm;
    if (!cm) return;
    (card._tsMarks || []).forEach((m) => m.clear());
    (card._tsWidgets || []).forEach((w) => w.clear());
    card._tsMarks = [];
    card._tsWidgets = [];
    for (const d of result.diagnostics) {
      let from = { line: d.line, ch: d.col }, to = { line: d.endLine, ch: d.endCol };
      if (from.line === to.line && from.ch === to.ch) to = { line: to.line, ch: to.ch + 1 };
      card._tsMarks.push(cm.markText(from, to, { className: "cm-ts-error", attributes: { title: d.message } }));
    }
    for (const q of result.queries) {
      const w = document.createElement("div");
      w.className = "ts-query";
      w.style.paddingLeft = `calc(${q.col}ch + 4px)`;
      w.textContent = q.text;
      card._tsWidgets.push(cm.addLineWidget(q.line, w, { coverGutter: false, noHScroll: true }));
    }
  }

  function diagBox(card, result) {
    let box = card.querySelector(".ts-diags");
    if (!result.diagnostics.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement("div");
      box.className = "ts-diags";
      const extra = card.querySelector(".card-extra");
      extra.insertBefore(box, extra.firstChild);
    }
    const n = result.diagnostics.length;
    box.innerHTML = `<div class="ts-diags-head">⚠ ${n} type error${n > 1 ? "s" : ""} <span>— TypeScript would refuse to build this</span></div>`;
    for (const d of result.diagnostics) {
      const row = document.createElement("button");
      row.className = "ts-diag";
      row.innerHTML = `<b>Line ${d.line + 1}</b><span></span><code>TS${d.code}</code>`;
      row.querySelector("span").textContent = d.message;
      row.onclick = () => { if (card._cm) { card._cm.focus(); card._cm.setCursor({ line: d.line, ch: d.col }); } };
      box.appendChild(row);
    }
  }

  function typecheck(card, code) {
    const result = check(code);
    decorate(card, result);
    diagBox(card, result);
    card._tsDiagCount = result.diagnostics.length;
    return result;
  }

  /* ---------------------------------------------------------------- sandbox */
  function bridge(id) {
    return `(() => {
      const ID = ${JSON.stringify(id)};
      const send = (type, data) => parent.postMessage(Object.assign({ __tsLab: ID, type }, data), "*");
      const MAXW = 76;
      function inspect(v, depth = 0, seen = new Set(), top = true) {
        const ind = "  ".repeat(depth + 1), indc = "  ".repeat(depth);
        if (v === null) return "null";
        if (v === undefined) return "undefined";
        const t = typeof v;
        if (t === "string") return top ? v : "'" + v.replace(/'/g, "\\\\'").replace(/\\n/g, "\\\\n") + "'";
        if (t === "number") return Object.is(v, -0) ? "-0" : String(v);
        if (t === "bigint") return v + "n";
        if (t === "boolean") return String(v);
        if (t === "symbol") return v.toString();
        if (t === "function") return v.toString().startsWith("class") ? "[class " + (v.name || "(anonymous)") + "]" : "[Function: " + (v.name || "(anonymous)") + "]";
        if (seen.has(v)) return "[Circular]";
        if (v instanceof Error) return (v.name || "Error") + ": " + v.message;
        if (v instanceof Date) return isNaN(v) ? "Invalid Date" : v.toISOString();
        if (v instanceof RegExp) return String(v);
        if (v instanceof Promise) return "Promise { … }";
        if (depth > 3) return Array.isArray(v) ? "[Array]" : "[Object]";
        seen.add(v);
        const wrap = (open, parts, close, prefix = "") => {
          seen.delete(v);
          if (!parts.length) return prefix + open + close;
          const one = prefix + open + " " + parts.join(", ") + " " + close;
          if (one.length <= MAXW && !one.includes("\\n")) return one;
          return prefix + open + "\\n" + parts.map((p) => ind + p).join(",\\n") + "\\n" + indc + close;
        };
        if (Array.isArray(v)) {
          const parts = v.slice(0, 100).map((x) => inspect(x, depth + 1, seen, false));
          if (v.length > 100) parts.push("... " + (v.length - 100) + " more items");
          return wrap("[", parts, "]");
        }
        if (ArrayBuffer.isView(v)) return v.constructor.name + "(" + v.length + ") [ " + Array.from(v.slice(0, 20)).join(", ") + (v.length > 20 ? ", ..." : "") + " ]";
        if (v instanceof Map) return wrap("{", [...v].map(([k, x]) => inspect(k, depth + 1, seen, false) + " => " + inspect(x, depth + 1, seen, false)), "}", "Map(" + v.size + ") ");
        if (v instanceof Set) return wrap("{", [...v].map((x) => inspect(x, depth + 1, seen, false)), "}", "Set(" + v.size + ") ");
        const proto = Object.getPrototypeOf(v);
        const name = proto && proto !== Object.prototype && proto.constructor && proto.constructor.name ? proto.constructor.name + " " : proto === null ? "[Object: null prototype] " : "";
        const keyStr = (k) => /^[A-Za-z_$][\\w$]*$/.test(k) ? k : "'" + k + "'";
        const parts = Object.keys(v).map((k) => keyStr(k) + ": " + inspect(v[k], depth + 1, seen, false));
        for (const s of Object.getOwnPropertySymbols(v)) parts.push("[" + s.toString() + "]: " + inspect(v[s], depth + 1, seen, false));
        return wrap("{", parts, "}", name);
      }
      function format(args) {
        if (typeof args[0] === "string" && /%[sdifoOj]/.test(args[0])) {
          let i = 1;
          const first = args[0].replace(/%([sdifoOj%])/g, (m, c) => {
            if (c === "%") return "%";
            if (i >= args.length) return m;
            const a = args[i++];
            return c === "d" || c === "i" ? String(parseInt(a)) : c === "f" ? String(Number(a)) : c === "s" ? String(a) : inspect(a, 0, new Set(), false);
          });
          args = [first, ...args.slice(i)];
        }
        return args.map((a) => inspect(a)).join(" ");
      }
      let groupDepth = 0;
      const out = (level, args) => send("console", { level, text: "  ".repeat(groupDepth) + format(args) });
      const timers = new Map(), counts = new Map();
      Object.assign(console, {
        log: (...a) => out("log", a), info: (...a) => out("log", a), debug: (...a) => out("log", a),
        warn: (...a) => out("warn", a), error: (...a) => out("error", a),
        dir: (o) => out("log", [o]),
        group: (...a) => { if (a.length) out("log", a); groupDepth++; }, groupCollapsed: (...a) => { if (a.length) out("log", a); groupDepth++; },
        groupEnd: () => { groupDepth = Math.max(0, groupDepth - 1); },
        time: (l = "default") => timers.set(l, performance.now()),
        timeEnd: (l = "default") => { if (timers.has(l)) { out("log", [l + ": " + (performance.now() - timers.get(l)).toFixed(2) + " ms"]); timers.delete(l); } },
        count: (l = "default") => { counts.set(l, (counts.get(l) || 0) + 1); out("log", [l + ": " + counts.get(l)]); },
        assert: (c, ...a) => { if (!c) out("error", ["Assertion failed" + (a.length ? ": " + format(a) : "")]); },
        table: (data) => {
          if (!data || typeof data !== "object") return out("log", [data]);
          const rows = Array.isArray(data) ? data.map((r, i) => [i, r]) : Object.entries(data);
          const cols = [...new Set(rows.flatMap(([, r]) => r && typeof r === "object" ? Object.keys(r) : ["Values"]))];
          const head = ["(index)", ...cols];
          const body = rows.map(([k, r]) => [String(k), ...cols.map((c) => r && typeof r === "object" ? (c in r ? inspect(r[c], 1, new Set(), false) : "") : c === "Values" ? inspect(r, 1, new Set(), false) : "")]);
          const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
          const line = (cells) => "│ " + cells.map((c, i) => c.padEnd(w[i])).join(" │ ") + " │";
          const sep = (l, m, r) => l + w.map((x) => "─".repeat(x + 2)).join(m) + r;
          send("console", { level: "log", text: [sep("┌", "┬", "┐"), line(head), sep("├", "┼", "┤"), ...body.map(line), sep("└", "┴", "┘")].join("\\n") });
        },
      });
      window.__fatal = (e) => {
        const msg = e && e.stack && e.name ? (e.name + ": " + e.message) : (e && e.message) || String(e);
        send("fatal", { text: msg });
      };
      addEventListener("error", (e) => window.__fatal(e.error || e.message));
      addEventListener("unhandledrejection", (e) => window.__fatal(e.reason instanceof Error ? e.reason : "Unhandled promise rejection: " + format([e.reason])));
    })();`;
  }

  function buildDoc(id, js) {
    const safe = js.replace(/<\/script/gi, "<\\/script");
    return `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">${JSON.stringify({ imports: IMPORTS })}</script>
<script>${bridge(id)}</script>
</head><body>
<script type="module" onerror="window.__fatal('Could not load a package from the internet (esm.sh). Check your connection and run again.')">
${safe}
parent.postMessage({ __tsLab: ${JSON.stringify(id)}, type: "done" }, "*");
</script></body></html>`;
  }

  function sandbox() {
    let f = document.getElementById("ts-sandboxes");
    if (!f) { f = document.createElement("div"); f.id = "ts-sandboxes"; f.hidden = true; document.body.appendChild(f); }
    return f;
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || !d.__tsLab) return;
    const entry = frames.get(d.__tsLab);
    if (!entry) return;
    if (d.type === "console") {
      entry.out.write(d.text + "\n", d.level === "error" ? "stderr" : d.level === "warn" ? "warn" : "");
      entry.lines++;
    } else if (d.type === "fatal") {
      entry.out.write("✕ " + d.text + "\n", "stderr");
      entry.out.help(helpFor(d.text));
      entry.errored = true;
      entry.out.status("✕ Runtime error", "err");
    } else if (d.type === "done") {
      entry.done = true;
      entry.ms = Math.round(performance.now() - entry.t0);
    }
  });

  function helpFor(msg) {
    const tips = [
      [/is not a function/, "You called something that isn't a function. Check the spelling, and whether the value could be <code>undefined</code>."],
      [/Cannot read propert(y|ies) of (undefined|null)/, "You used <code>.something</code> on a value that is <code>undefined</code>/<code>null</code>. Optional chaining (<code>?.</code>) or a check first will fix it — and with <code>strict</code> on, TypeScript usually warns you before this happens."],
      [/is not defined/, "That name doesn't exist at runtime. Did you forget to declare or import it? (Types are erased — a <code>type</code> or <code>interface</code> can't be used as a value.)"],
      [/ZodError|Invalid input/i, "A Zod schema rejected the data. Read the <code>issues</code>: each one has a <code>path</code> and a <code>message</code>."],
      [/esm\.sh|Failed to fetch dynamically imported module|Could not load a package/, "A package couldn't be downloaded. Check your internet connection and run again."],
    ];
    const hit = tips.find(([re]) => re.test(msg));
    return hit ? "💡 " + hit[1] : "";
  }

  /* ---------------------------------------------------------------- runner API */
  const debounce = new WeakMap();
  const Runner = {
    name: "TypeScript",
    canRun: (lang) => ["ts", "typescript", "js", "javascript"].includes(lang),
    onStatus(fn) { listeners.push(fn); fn(...state); },
    warm() { return load().catch(() => {}); },

    async run({ code, lang, card, output }) {
      const out = output("Output");
      out.clear();
      out.status("Loading TypeScript…");
      try { await load(); } catch (e) { out.write(e.message + " — check your internet connection.\n", "stderr"); out.status("✕ Failed", "err"); return; }

      const isTS = lang === "ts" || lang === "typescript";
      let result = { diagnostics: [], queries: [] };
      if (isTS) result = typecheck(card, code);
      const nErr = result.diagnostics.length;
      const syntax = result.diagnostics.some((d) => d.code < 2000);

      let js;
      try {
        js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2025 ?? ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleDetection: ts.ModuleDetectionKind.Force }, reportDiagnostics: false }).outputText;
      } catch (e) {
        out.write("Could not compile: " + e.message + "\n", "stderr"); out.status("✕ Syntax error", "err"); return;
      }
      if (syntax) { out.write("Fix the syntax error above, then run again.\n", "stderr"); out.status("✕ Syntax error", "err"); card._tsRun = "syntax"; return; }

      const id = Math.random().toString(36).slice(2);
      const old = card._tsFrame;
      if (old) { frames.delete(old.id); old.el.remove(); }
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.title = "Code sandbox";
      const entry = { out, done: false, errored: false, lines: 0, t0: performance.now(), ms: 0 };
      frames.set(id, entry);
      card._tsFrame = { id, el: frame };
      out.status(nErr ? `⚠ ${nErr} type error${nErr > 1 ? "s" : ""} · running…` : "Running…", nErr ? "warn" : "");
      frame.srcdoc = buildDoc(id, js);
      sandbox().appendChild(frame);

      await new Promise((resolve) => {
        const t0 = Date.now();
        const tick = () => (entry.done || entry.errored || Date.now() - t0 > 20000) ? resolve() : setTimeout(tick, 40);
        tick();
      });
      await new Promise((r) => setTimeout(r, 30));           // let trailing console messages arrive
      if (entry.errored) { card._tsRun = "error"; return; }
      if (!entry.done) { out.status("✕ Timed out (20 s)", "err"); card._tsRun = "timeout"; return; }
      if (!entry.lines && !result.queries.length) out.write("(no output — add console.log(...) to print something)\n", "muted");
      else if (!entry.lines) out.write("(no console output — see the types shown in the editor)\n", "muted");
      card._tsRun = "ok";
      if (nErr) out.status(`⚠ ${nErr} type error${nErr > 1 ? "s" : ""} · ran in ${entry.ms} ms`, "warn");
      else out.status(`✓ ${isTS ? "Type-checked · " : ""}ran in ${entry.ms} ms`, "ok");
    },

    onEdit(ctx) {
      if (!ts || !(ctx.lang === "ts" || ctx.lang === "typescript")) return;
      clearTimeout(debounce.get(ctx.card));
      debounce.set(ctx.card, setTimeout(() => { try { typecheck(ctx.card, ctx.code); } catch (e) { /* ignore while typing */ } }, 350));
    },

    // Called by app.js after a lesson renders: once TypeScript is loaded, show types/errors without running.
    decorateAll(cards) {
      if (!ts) return;
      for (const card of cards) {
        const lang = card._block && card._block.lang;
        if (card._cm && (lang === "ts" || lang === "typescript")) { try { typecheck(card, card._cm.getValue()); } catch (e) { /* ignore */ } }
      }
    },

    onTheme() {},
    cleanup() { frames.clear(); const s = document.getElementById("ts-sandboxes"); if (s) s.innerHTML = ""; },
  };

  window.Runner = Runner;
})();
