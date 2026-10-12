/* ==========================================================================
   JavaScript runner + the course's combined Runner
   • ```js run blocks execute live in a throw-away Web Worker (instant, offline).
     console.log output is formatted the way Node prints it (util.inspect rules
     for arrays, objects, Maps, Sets and class instances), so what you see here
     matches `node main.js` on your computer.
   • Top-level await, timers, Promises, classes, crypto.randomUUID() work.
     There is no DOM and no require() — examples are plain, portable JS.
   • ```cpp run blocks go to window.CppRunner (runner-cpp.js).
   ========================================================================== */
(function () {
  "use strict";

  const TIME_LIMIT = 10000;
  const Cpp = window.CppRunner;

  /* ------------------------------------------------------------------ worker
     Everything below is serialised into the worker as source code. */
  function workerPrelude() {
    const BREAK = 80, DEPTH = 2;
    const send = (t, s) => postMessage({ t, s });
    const isIdent = (k) => /^[A-Za-z_$][\w$]*$/.test(k);
    function quote(s) {
      const q = !s.includes("'") ? "'" : !s.includes('"') ? '"' : !s.includes("`") && !s.includes("${") ? "`" : "'";
      const body = s.replace(/[\\\n\t\r\b\f\v\0]/g, (c) => ({ "\\": "\\\\", "\n": "\\n", "\t": "\\t", "\r": "\\r", "\b": "\\b", "\f": "\\f", "\v": "\\v", "\0": "\\x00" }[c]));
      return q + (q === "'" ? body.replace(/'/g, "\\'") : body) + q;
    }
    function fnName(f) {
      const src = Function.prototype.toString.call(f);
      if (/^class\b/.test(src)) {
        const sup = Object.getPrototypeOf(f);
        return `[class ${f.name || "(anonymous)"}${sup && sup.name ? ` extends ${sup.name}` : ""}]`;
      }
      const kind = /^async\s/.test(src) ? (/^async\s*function\s*\*/.test(src) ? "AsyncGeneratorFunction" : "AsyncFunction") : /^function\s*\*/.test(src) ? "GeneratorFunction" : "Function";
      return `[${kind}${f.name ? ": " + f.name : " (anonymous)"}]`;
    }
    function ctorName(v) {
      const p = Object.getPrototypeOf(v);
      if (p === null) return null;
      const c = p.constructor;
      return c && typeof c === "function" ? c.name : "Object";
    }
    function groupArray(ctx, output, value) {
      let total = 0, maxLen = 0;
      let outLen = output.length;
      if (value && value.length > 100) outLen--;
      const sep = 2, dataLen = new Array(outLen);
      for (let i = 0; i < outLen; i++) { const l = output[i].length; dataLen[i] = l; total += l + sep; if (maxLen < l) maxLen = l; }
      const actualMax = maxLen + sep;
      if (actualMax * 3 + ctx.indent < BREAK && (total / actualMax > 5 || maxLen <= 6)) {
        const averageBias = Math.sqrt(actualMax - total / output.length);
        const biasedMax = Math.max(actualMax - 3 - averageBias, 1);
        const columns = Math.min(Math.round(Math.sqrt(2.5 * biasedMax * outLen) / biasedMax), Math.floor((BREAK - ctx.indent) / actualMax), 12, 15);
        if (columns <= 1) return output;
        const tmp = [], maxLine = [];
        for (let i = 0; i < columns; i++) {
          let ll = 0;
          for (let j = i; j < output.length; j += columns) if (dataLen[j] > ll) ll = dataLen[j];
          maxLine.push(ll + sep);
        }
        let padStart = true;
        if (value !== undefined) for (let i = 0; i < output.length; i++) if (typeof value[i] !== "number" && typeof value[i] !== "bigint") { padStart = false; break; }
        for (let i = 0; i < outLen; i += columns) {
          const max = Math.min(i + columns, outLen);
          let str = "", j = i;
          for (; j < max - 1; j++) { const s = `${output[j]}, `; str += padStart ? s.padStart(maxLine[j - i], " ") : s.padEnd(maxLine[j - i], " "); }
          str += padStart ? output[j].padStart(maxLine[j - i] - sep, " ") : output[j];
          tmp.push(str);
        }
        if (value && value.length > 100) tmp.push(output[outLen]);
        return tmp;
      }
      return output;
    }
    function reduce(ctx, output, base, braces, isArray, depth, value) {
      const entries = output.length;
      if (isArray && entries > 6) output = groupArray(ctx, output, value);
      if (ctx.cur - depth < 3 && entries === output.length) {
        const start = output.length + ctx.indent + braces[0].length + base.length + 10;
        let total = output.length + start, fits = total + output.length <= BREAK;
        for (let i = 0; fits && i < output.length; i++) { total += output[i].length; if (total > BREAK) fits = false; }
        if (fits) {
          const joined = output.join(", ");
          if (!joined.includes("\n")) return `${base ? base + " " : ""}${braces[0]} ${joined} ${braces[1]}`;
        }
      }
      const ind = "\n" + " ".repeat(ctx.indent);
      return `${base ? base + " " : ""}${braces[0]}${ind}  ${output.join(`,${ind}  `)}${ind}${braces[1]}`;
    }
    function fmtKey(k) { return typeof k === "symbol" ? `[${k.toString()}]` : isIdent(k) ? k : quote(k); }
    function fmt(ctx, v, depth, top) {
      if (v === null) return "null";
      switch (typeof v) {
        case "undefined": return "undefined";
        case "string": return top ? v : quote(v);
        case "number": return Object.is(v, -0) ? "-0" : String(v);
        case "bigint": return `${v}n`;
        case "boolean": return String(v);
        case "symbol": return v.toString();
        case "function": {
          const keys = Object.keys(v);
          if (!keys.length) return fnName(v);
          break;
        }
      }
      if (v instanceof Date) return isNaN(v) ? "Invalid Date" : v.toISOString();
      if (v instanceof RegExp) return String(v);
      if (v instanceof Error) {
        const s = v.stack && v.stack.includes(v.message) ? `${v.name}: ${v.message}` : String(v);
        return ctx.seen.length ? `[${s}]` : s;
      }
      if (v instanceof Promise) return "Promise { <pending> }";
      if (v instanceof WeakMap || v instanceof WeakSet) return `${v instanceof WeakMap ? "WeakMap" : "WeakSet"} { <items unknown> }`;
      if (ctx.seen.includes(v)) return "[Circular *1]";
      const cn = typeof v === "function" ? null : ctorName(v);
      const isArr = Array.isArray(v);
      const typed = ArrayBuffer.isView(v) && !(v instanceof DataView);
      const own = typeof v === "function" ? Object.keys(v) : Object.keys(v).concat(Object.getOwnPropertySymbols(v).filter((s) => Object.getOwnPropertyDescriptor(v, s).enumerable));
      let kind, prefix = "", base = "";
      if (isArr || typed) {
        kind = "arr";
        prefix = isArr && cn === "Array" ? "" : `${cn}(${v.length}) `;
        if (v.length === 0 && own.length === 0) return `${prefix}[]`;
      } else if (v instanceof Map || v instanceof Set) {
        kind = v instanceof Map ? "map" : "set";
        const nm = kind === "map" ? "Map" : "Set";
        prefix = `${cn === nm ? nm : `${cn} [${nm}]`}(${v.size}) `;
        if (v.size === 0 && !own.length) return `${prefix}{}`;
      } else {
        kind = "obj";
        if (typeof v === "function") base = fnName(v);
        else if (cn === null) prefix = "[Object: null prototype] ";
        else if (cn !== "Object") prefix = `${cn || "Object"} `;
        const tag = typeof v !== "function" && v[Symbol.toStringTag];
        if (tag && typeof tag === "string" && tag !== cn) prefix = `${cn || "Object"} [${tag}] `;
        if (!own.length) return base || `${prefix}{}`;
      }
      if (depth > DEPTH) return `[${isArr ? (cn === "Array" ? "Array" : cn) : cn === null ? "Object: null prototype" : cn || "Object"}]`;
      ctx.seen.push(v);
      ctx.cur = depth;
      const output = [];
      let braces;
      const isArray = kind === "arr";
      const prop = (k) => {
        const d = Object.getOwnPropertyDescriptor(v, k);
        let val;
        if (d.get || d.set) val = d.get && d.set ? "[Getter/Setter]" : d.get ? "[Getter]" : "[Setter]";
        else { ctx.indent += 2; val = fmt(ctx, d.value, depth + 1); ctx.indent -= 2; }
        return `${fmtKey(k)}: ${val}`;
      };
      if (kind === "arr") {
        braces = [`${prefix}[`, "]"];
        const n = Math.min(v.length, 100);
        let holes = 0;
        for (let i = 0; i < n; i++) {
          if (!(i in v)) { holes++; continue; }
          if (holes) { output.push(`<${holes} empty item${holes > 1 ? "s" : ""}>`); holes = 0; }
          ctx.indent += 2; output.push(fmt(ctx, v[i], depth + 1)); ctx.indent -= 2;
        }
        if (holes) output.push(`<${holes} empty item${holes > 1 ? "s" : ""}>`);
        if (v.length > 100) output.push(`... ${v.length - 100} more item${v.length - 100 > 1 ? "s" : ""}`);
        own.filter((k) => typeof k !== "string" || !/^\d+$/.test(k)).forEach((k) => output.push(prop(k)));
      } else if (kind === "map") {
        braces = [`${prefix}{`, "}"];
        ctx.indent += 2;
        for (const [k, val] of v) output.push(`${fmt(ctx, k, depth + 1)} => ${fmt(ctx, val, depth + 1)}`);
        ctx.indent -= 2;
        own.forEach((k) => output.push(prop(k)));
      } else if (kind === "set") {
        braces = [`${prefix}{`, "}"];
        ctx.indent += 2;
        for (const val of v) output.push(fmt(ctx, val, depth + 1));
        ctx.indent -= 2;
        own.forEach((k) => output.push(prop(k)));
      } else {
        braces = [`${prefix}{`, "}"];
        own.forEach((k) => output.push(prop(k)));
      }
      const res = reduce(ctx, output, base, braces, isArray, depth, isArray ? v : undefined);
      ctx.seen.pop();
      return res;
    }
    const inspect = (v, top) => fmt({ indent: 0, seen: [], cur: 0 }, v, 0, top);
    function format(args) {
      if (!args.length) return "";
      let first = args[0], rest = args.slice(1), out = "";
      if (typeof first === "string" && rest.length && /%[sdifjoOc%]/.test(first)) {
        out = first.replace(/%([sdifjoOc%])/g, (m, c) => {
          if (c === "%") return "%";
          if (!rest.length) return m;
          const a = rest.shift();
          switch (c) {
            case "s": return typeof a === "string" ? a : typeof a === "bigint" ? `${a}n` : typeof a === "object" && a !== null ? inspect(a) : String(a);
            case "d": case "i": return typeof a === "bigint" ? `${a}n` : String(c === "i" ? parseInt(a) : Number(a));
            case "f": return String(parseFloat(a));
            case "j": try { return JSON.stringify(a); } catch { return "[Circular]"; }
            case "c": return "";
            default: return inspect(a);
          }
        });
        return [out, ...rest.map((a) => inspect(a, true))].join(" ");
      }
      return args.map((a) => inspect(a, true)).join(" ");
    }
    let groupIndent = "";
    const line = (t, args) => send(t, (groupIndent ? format(args).split("\n").map((l) => groupIndent + l).join("\n") : format(args)) + "\n");
    self.console = {
      log: (...a) => line("o", a), info: (...a) => line("o", a), debug: (...a) => line("o", a),
      error: (...a) => line("e", a), warn: (...a) => line("e", a), trace: (...a) => line("e", a),
      dir: (v) => line("o", [v]),
      table: (v) => line("o", [v]),
      group: (...a) => { if (a.length) line("o", a); groupIndent += "  "; },
      groupEnd: () => { groupIndent = groupIndent.slice(2); },
      assert: (c, ...a) => { if (!c) line("e", ["Assertion failed" + (a.length ? ":" : ""), ...a]); },
      time: (l = "default") => { (self.__timers || (self.__timers = {}))[l] = performance.now(); },
      timeEnd: (l = "default") => { const t = (self.__timers || {})[l]; if (t != null) line("o", [`${l}: ${(performance.now() - t).toFixed(3)}ms`]); },
      count: (l = "default") => { const c = (self.__counts || (self.__counts = {})); c[l] = (c[l] || 0) + 1; line("o", [`${l}: ${c[l]}`]); },
    };
    // Node-compatible bits that portable examples sometimes use
    self.global = self;
    self.process = { stdout: { write: (s) => { send("o", String(s)); return true; } }, stderr: { write: (s) => { send("e", String(s)); return true; } }, env: {}, argv: ["node", "main.js"], exitCode: 0, nextTick: (f, ...a) => queueMicrotask(() => f(...a)), hrtime: { bigint: () => BigInt(Math.round(performance.now() * 1e6)) } };
    // Track timers so we know when the program has really finished
    let pending = 0;
    const live = new Set();
    const _st = self.setTimeout, _ct = self.clearTimeout, _si = self.setInterval, _ci = self.clearInterval;
    self.setTimeout = (f, ms, ...a) => { pending++; const id = _st(() => { live.delete(id); pending--; f(...a); }, ms); live.add(id); return id; };
    self.clearTimeout = (id) => { if (live.delete(id)) pending--; _ct(id); };
    self.setInterval = (f, ms, ...a) => { pending++; const id = _si(() => f(...a), ms); live.add(id); return id; };
    self.clearInterval = (id) => { if (live.delete(id)) pending--; _ci(id); };
    self.setImmediate = (f, ...a) => self.setTimeout(f, 0, ...a);
    self.clearImmediate = self.clearTimeout;
    self.__finish = () => {
      const tick = () => (pending === 0 ? _st(() => (pending === 0 ? send("done", "") : tick()), 0) : _st(tick, 5));
      tick();
    };
    self.__fail = (e) => {
      const msg = e && e.stack ? e.stack : String(e);
      send("err", JSON.stringify({ name: (e && e.name) || "Error", message: (e && e.message) || String(e), stack: msg }));
    };
    self.addEventListener("unhandledrejection", (ev) => { ev.preventDefault(); self.__fail(ev.reason); });
    self.addEventListener("error", (ev) => { ev.preventDefault(); self.__fail(ev.error || ev.message); });
  }

  const PRELUDE = `(${workerPrelude.toString()})();\n`;
  const HEAD = `${PRELUDE}(async () => { "use strict";\n`;
  const OFFSET = HEAD.split("\n").length - 1;           // user code starts on this line
  const TAIL = `\n})().then(() => self.__finish(), (e) => self.__fail(e));\n`;

  /* ------------------------------------------------------------------ helpers */
  function userLine(stack) {
    const m = String(stack || "").match(/blob:[^\s)]*?:(\d+):(\d+)/);
    if (!m) return null;
    const ln = +m[1] - OFFSET;
    return ln >= 1 ? ln : null;
  }

  function helpFor(name, message) {
    const tips = [
      [/is not defined/, "A name JavaScript doesn't know. Check the spelling, and make sure it is declared (with <code>const</code>, <code>let</code>, <code>function</code> or <code>class</code>) before you use it."],
      [/Cannot read properties of (undefined|null)/, "You used <code>.something</code> on a value that is <code>undefined</code> or <code>null</code>. Log the value just before that line. Optional chaining (<code>obj?.prop</code>) helps when the value may be missing."],
      [/is not a function/, "You called something that isn't a function. It may be a typo in the method name, or a property that holds a value rather than a function."],
      [/is not a constructor/, "<code>new</code> was used on something that isn't a class. Check the name and that the class is declared above."],
      [/before initialization/, "A <code>let</code>/<code>const</code>/<code>class</code> was used before the line that declares it. Move the declaration up."],
      [/Maximum call stack/, "Infinite recursion. A function keeps calling itself without reaching its base case."],
      [/Unexpected token|Unexpected end|missing \)|Invalid or unexpected/, "A syntax mistake: a missing bracket, brace, comma or quote. Look at the reported line and the one before it."],
      [/Assignment to constant/, "You re-assigned a <code>const</code>. Use <code>let</code> if the variable must change."],
    ];
    const hit = tips.find(([re]) => re.test(`${name}: ${message}`));
    return hit ? "💡 " + hit[1] : "";
  }

  let active = null;                      // the worker currently running, so cleanup() can stop it
  function runJS(code, onOut) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(new Blob([HEAD + code + TAIL], { type: "text/javascript" }));
      const w = new Worker(url);
      const t0 = performance.now();
      let finished = false;
      const end = (res) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        w.terminate();
        URL.revokeObjectURL(url);
        if (active === w) active = null;
        resolve({ ...res, ms: Math.round(performance.now() - t0) });
      };
      const timer = setTimeout(() => end({ timedOut: true }), TIME_LIMIT);
      w.onmessage = (e) => {
        const { t, s } = e.data;
        if (t === "o" || t === "e") onOut(s, t === "e");
        else if (t === "done") end({ ok: true });
        else if (t === "err") end({ error: JSON.parse(s) });
      };
      w.onerror = (e) => {                // syntax errors surface here, before any code runs
        e.preventDefault();
        end({ error: { name: /SyntaxError/.test(e.message) ? "SyntaxError" : "Error", message: String(e.message || "").replace(/^Uncaught\s+(\w*Error:\s*)?/, ""), line: e.lineno ? e.lineno - OFFSET : null } });
      };
      active = w;
    });
  }

  async function runJsCard({ code, meta, output }) {
    const out = output("Output");
    out.clear();
    out.status("Running…");
    let wrote = false, lastNL = true;
    const res = await runJS(code, (s, isErr) => { wrote = true; lastNL = s.endsWith("\n"); out.write(s, isErr ? "stderr" : ""); });
    if (res.error) {
      const e = res.error;
      const ln = e.line || userLine(e.stack);
      out.write(`${lastNL ? "" : "\n"}Uncaught ${e.name}: ${e.message}${ln ? `  (line ${ln})` : ""}\n`, "stderr");
      out.help(meta["expect-error"] ? "✅ <b>This error is on purpose.</b> Read the message, then fix the code and run it again." : helpFor(e.name, e.message));
      out.status(meta["expect-error"] ? "✕ Threw an error (expected)" : `✕ ${e.name}`, "err");
      return;
    }
    if (res.timedOut) {
      out.write(`${lastNL ? "" : "\n"}Stopped after ${TIME_LIMIT / 1000} s.\n`, "stderr");
      out.help("⏱ <b>Time limit.</b> The program kept running: an infinite loop, a <code>setInterval</code> that is never cleared, or a Promise that never settles.");
      out.status("✕ Time limit", "err");
      return;
    }
    if (!wrote) out.write("(no output: print something with console.log(…) )\n", "muted");
    out.status(`✓ Ran in ${res.ms} ms · JavaScript in your browser`, "ok");
  }

  /* ------------------------------------------------------------------ combined Runner */
  const listeners = [];
  window.Runner = {
    name: "C++ · JavaScript",
    canRun: (lang) => lang === "js" || lang === "javascript" || (Cpp && Cpp.canRun(lang)),
    onStatus(fn) { listeners.push(fn); if (Cpp) Cpp.onStatus(fn); else fn("idle", "JS ready"); },
    async run(ctx) {
      if (ctx.lang === "js" || ctx.lang === "javascript") return runJsCard(ctx);
      return Cpp.run(ctx);
    },
    onEdit(ctx) { if (Cpp && ctx.lang !== "js") Cpp.onEdit(ctx); },
    onTheme() {},
    cleanup() { if (active) { active.terminate(); active = null; } },
    runJS,                                   // used by the test harness
  };
})();
