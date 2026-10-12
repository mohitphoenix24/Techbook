/* ==========================================================================
   C++ runner
   • Unchanged examples: show the output that build.py verified with g++
     (instant, works offline).
   • Edited code (or edited input): compiled and run live with GCC on
     Compiler Explorer (godbolt.org); Wandbox (wandbox.org) is the fallback.
   • Compile errors are listed under the code and underlined in the editor.
   • Crashes (segfault, abort, timeouts…) come with a plain-English hint.
   ========================================================================== */
(function () {
  "use strict";

  const GODBOLT = "https://godbolt.org/api/compiler/g152/compile";       // x86-64 gcc 15.2
  const WANDBOX = "https://wandbox.org/api/compile.json";
  const FLAGS = "-std=c++20 -O2 -Wall";
  const OUTPUTS = (window.COURSE && window.COURSE.outputs) || {};

  const listeners = [];
  let state = ["idle", "C++: ready"];
  const setState = (s, label) => { state = [s, label]; listeners.forEach((f) => f(s, label)); };

  // FNV-1a over UTF-16 code units — identical to fnv() in build.py
  function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0") + "-" + s.length;
  }
  const stripAnsi = (s) => String(s || "").replace(/\x1b\[[0-9;]*[mK]/g, "");

  /* ---------------------------------------------------------------- compilers */
  async function postJSON(url, body, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // Normalised result: { compiled, diags:[{line,col,sev,msg}], compilerText, stdout, stderr, exit, timedOut, ms, via }
  async function viaGodbolt(code, stdin) {
    const t0 = performance.now();
    const d = await postJSON(GODBOLT, {
      source: code,
      options: {
        userArguments: FLAGS,
        executeParameters: { args: [], stdin },
        compilerOptions: { executorRequest: true, skipAsm: true },
        filters: { execute: true },
        tools: [], libraries: [],
      },
      lang: "c++", allowStoreCodeDebug: false,
    }, 40000);
    const b = d.buildResult || {};
    const lines = (b.stderr || []).map((x) => ({ text: stripAnsi(x.text).replace(/<source>/g, "main.cpp"), tag: x.tag }));
    const diags = lines.filter((x) => x.tag && x.tag.line).map((x) => ({
      line: x.tag.line, col: x.tag.column || 1, sev: x.tag.severity >= 3 ? "error" : "warning",
      msg: stripAnsi(x.tag.text).replace(/^(error|warning|note):\s*/, ""),
    })).filter((x) => !/^note/.test(x.msg));
    const compiled = (b.code ?? 0) === 0 && d.code !== -1;
    const join = (arr) => (arr || []).map((x) => x.text).join("\n");
    let stderr = join(d.stderr);
    if (!compiled) stderr = "";
    return {
      compiled, diags, compilerText: lines.map((x) => x.text).join("\n"),
      stdout: compiled ? join(d.stdout) + ((d.stdout || []).length ? "\n" : "") : "",
      stderr, exit: compiled ? d.code : null, timedOut: !!d.timedOut,
      ms: Math.round(performance.now() - t0), via: "GCC 15.2 · Compiler Explorer",
    };
  }

  async function viaWandbox(code, stdin) {
    const t0 = performance.now();
    const d = await postJSON(WANDBOX, { code, compiler: "gcc-13.2.0", options: "", "compiler-option-raw": FLAGS.split(" ").join("\n"), stdin }, 45000);
    const ctext = stripAnsi(d.compiler_error || d.compiler_message || "").replace(/prog\.cc/g, "main.cpp");
    const diags = [];
    ctext.split("\n").forEach((l) => {
      const m = l.match(/^main\.cpp:(\d+):(\d+):\s*(error|warning):\s*(.*)$/);
      if (m) diags.push({ line: +m[1], col: +m[2], sev: m[3], msg: m[4] });
    });
    const compiled = !diags.some((x) => x.sev === "error") && !/error:/.test(ctext);
    const sig = d.signal || "";
    return {
      compiled, diags, compilerText: ctext,
      stdout: d.program_output || "", stderr: (d.program_error || "") + (sig ? `Program terminated with signal ${sig}` : ""),
      exit: compiled ? (sig ? (/SEGV/.test(sig) ? 139 : /ABRT/.test(sig) ? 134 : /FPE/.test(sig) ? 136 : /KILL/.test(sig) ? 137 : 1) : +(d.status || 0)) : null,
      timedOut: /KILL|XCPU/.test(sig), ms: Math.round(performance.now() - t0), via: "GCC 13.2 · Wandbox",
    };
  }

  async function compileRun(code, stdin) {
    setState("loading", "Compiling with GCC…");
    try {
      const r = await viaGodbolt(code, stdin);
      setState("ready", "GCC 15 · online");
      return r;
    } catch (e1) {
      try {
        const r = await viaWandbox(code, stdin);
        setState("ready", "GCC 13 · online (fallback)");
        return r;
      } catch (e2) {
        setState("error", "Compiler unreachable");
        throw new Error("offline");
      }
    }
  }

  /* ---------------------------------------------------------------- explanations */
  function helpFor(res) {
    const all = (res.stderr || "") + "\n" + (res.compilerText || "");
    if (res.timedOut) return "⏱ <b>Time limit exceeded.</b> The program ran too long. Check for an infinite loop (a loop variable that never changes, or a recursion with no base case). It may also be an algorithm that is too slow for the input size, such as O(n²) on 10⁶ items.";
    const tips = [
      [/out_of_range/, "<code>.at(i)</code> found an index outside the container. Valid indexes are <code>0 … size()-1</code>. Check the loop bounds, especially <code>&lt;=</code> versus <code>&lt;</code>."],
      [/bad_alloc/, "Out of memory. A container grew too big. Check for a loop that keeps pushing, or a huge <code>vector</code> size."],
      [/SIGSEGV|signal 11|Segmentation/i, "<b>Segmentation fault.</b> The program touched memory it doesn't own. Common causes: <code>v[i]</code> with <code>i</code> out of range, reading through a <code>nullptr</code> (like <code>node-&gt;next</code> when <code>node</code> is null), using an iterator after <code>erase</code>, or recursion so deep it overflows the stack."],
      [/SIGFPE|signal 8|Floating point exception/i, "<b>Arithmetic error.</b> Usually an integer division or <code>%</code> by zero."],
      [/SIGABRT|signal 6|terminate called|Assertion/i, "<b>The program aborted.</b> An exception wasn't caught, or an <code>assert</code> failed. Read the <code>what():</code> line above for the reason."],
      [/was not declared in this scope|has not been declared/, "A name the compiler doesn't know. Check for a typo, a variable used outside the block where it was declared, or a missing <code>#include</code>. Functions must be declared before they are called."],
      [/expected [^\n]*(';'|'\)'|'\}'|'\]')|expected (primary-expression|unqualified-id)/, "A punctuation mistake. Look at the end of the line <b>before</b> the one reported. A missing <code>;</code> is the usual cause."],
      [/no match for 'operator</, "The compiler can't compare these values with <code>&lt;</code>. To sort or put your own type in a <code>set</code>/<code>map</code>/<code>priority_queue</code>, give it an <code>operator&lt;</code> or pass a comparator."],
      [/no match for call|no matching function/, "No function matches the arguments you passed. Check the argument types and count, and <code>const</code>-ness (a <code>const&amp;</code> can't be passed to a function that takes a non-const reference)."],
      [/cannot convert|invalid conversion/, "A value of one type is used where another type is needed. Check the types on both sides of the <code>=</code>, or the parameter types."],
      [/discards qualifiers|passing 'const/, "You're changing something through a <code>const</code> reference, or calling a non-<code>const</code> method on a <code>const</code> object."],
      [/hash|unordered_(map|set).*(pair|vector)/, "<code>unordered_map</code>/<code>unordered_set</code> have no built-in hash for <code>pair</code> or <code>vector</code>. Use <code>map</code>/<code>set</code>, or write a custom hash."],
    ];
    const hit = tips.find(([re]) => re.test(all));
    return hit ? "💡 " + hit[1] : "";
  }

  /* ---------------------------------------------------------------- editor marks + diagnostics */
  function clearMarks(card) {
    (card._ccMarks || []).forEach((m) => m.clear());
    card._ccMarks = [];
    const box = card.querySelector(".cc-diags");
    if (box) box.remove();
  }

  function showDiags(card, diags) {
    clearMarks(card);
    if (!diags.length) return;
    const cm = card._cm;
    const errs = diags.filter((d) => d.sev === "error"), warns = diags.filter((d) => d.sev !== "error");
    if (cm) for (const d of diags.slice(0, 40)) {
      const ln = Math.max(0, d.line - 1);
      if (ln >= cm.lineCount()) continue;
      const text = cm.getLine(ln);
      let from = Math.max(0, d.col - 1);
      let to = from + Math.max(1, (text.slice(from).match(/^[\w:.<>~]+|^./) || ["x"])[0].length);
      if (from >= text.length) { from = Math.max(0, text.length - 1); to = text.length; }
      card._ccMarks.push(cm.markText({ line: ln, ch: from }, { line: ln, ch: to }, { className: d.sev === "error" ? "cm-cc-error" : "cm-cc-warn", attributes: { title: d.msg } }));
    }
    const box = document.createElement("div");
    box.className = "cc-diags" + (errs.length ? "" : " only-warn");
    const n = errs.length || warns.length;
    box.innerHTML = errs.length
      ? `<div class="cc-diags-head">✕ ${errs.length} compile error${errs.length > 1 ? "s" : ""} <span>— fix the first one first; later errors are often caused by it</span></div>`
      : `<div class="cc-diags-head warn">⚠ ${n} warning${n > 1 ? "s" : ""} <span>— the code compiled, but the compiler thinks something looks wrong</span></div>`;
    for (const d of [...errs, ...warns].slice(0, 12)) {
      const row = document.createElement("button");
      row.className = "cc-diag " + d.sev;
      row.innerHTML = `<b>Line ${d.line}</b><span></span><code>${d.sev}</code>`;
      row.querySelector("span").textContent = d.msg;
      row.onclick = () => { if (cm) { cm.focus(); cm.setCursor({ line: d.line - 1, ch: Math.max(0, d.col - 1) }); } };
      box.appendChild(row);
    }
    const extra = card.querySelector(".card-extra");
    const stdinBox = extra.querySelector(".stdin-box");
    extra.insertBefore(box, stdinBox ? stdinBox.nextSibling : extra.firstChild);
  }

  function parseLocalDiags(text) {
    const out = [];
    String(text || "").split("\n").forEach((l) => {
      const m = l.match(/^main\.cpp:(\d+):(\d+):\s*(error|warning):\s*(.*)$/);
      if (m) out.push({ line: +m[1], col: +m[2], sev: m[3], msg: m[4] });
    });
    return out;
  }

  /* ---------------------------------------------------------------- rendering a result */
  function exitText(code) {
    return { 139: "Segmentation fault (SIGSEGV)", 134: "Aborted (SIGABRT)", 136: "Arithmetic error (SIGFPE)", 137: "Killed (SIGKILL)", 143: "Killed — time limit" }[code] || `exited with code ${code}`;
  }

  function present(out, card, res, { cached, meta }) {
    if (!res.compiled) {
      showDiags(card, res.diags);
      out.write(res.compilerText.trim() + "\n", "stderr");
      out.help(meta["expect-error"] ? "✅ <b>This error is on purpose</b>. Read the message, then fix the code and run it again." : helpFor(res));
      out.status(meta["expect-error"] ? "✕ Compile error (expected)" : "✕ Compile error", "err");
      return "compile";
    }
    showDiags(card, res.diags.filter((d) => d.sev !== "error"));
    if (res.stdout) out.write(res.stdout);
    if (res.stderr && res.stderr.trim()) out.write((res.stdout && !res.stdout.endsWith("\n") ? "\n" : "") + res.stderr.trimEnd() + "\n", "stderr");
    if (!res.stdout && !(res.stderr || "").trim()) out.write("(no output: print something with cout << … )\n", "muted");
    const bad = res.timedOut || (res.exit !== 0 && res.exit != null);
    if (bad) {
      out.help(meta["runtime-error"] ? "✅ <b>This crash is on purpose</b>. " + helpFor(res).replace(/^💡 /, "") : helpFor(res));
      out.status(res.timedOut ? "✕ Time limit exceeded" : "✕ " + exitText(res.exit) + (meta["runtime-error"] ? " (expected)" : ""), "err");
      return "error";
    }
    const warn = res.diags.filter((d) => d.sev !== "error").length;
    if (cached) out.status(meta.timing ? "✓ Sample output from the build machine · timings on yours will differ" : "✓ Verified output · compiled with g++ -std=c++20", "ok");
    else out.status(`✓ Compiled & ran in ${(res.ms / 1000).toFixed(1)} s · ${res.via}${warn ? ` · ${warn} warning${warn > 1 ? "s" : ""}` : ""}`, warn ? "warn" : "ok");
    return "ok";
  }

  /* ---------------------------------------------------------------- runner API */
  const Runner = {
    name: "C++",
    canRun: (lang) => lang === "cpp" || lang === "c++",
    onStatus(fn) { listeners.push(fn); fn(...state); },
    fnv,

    async run({ code, lang, meta, card, output, stdin }) {
      const out = output("Output");
      out.clear();
      clearMarks(card);
      const block = card._block;
      const origIn = block.stdin || "";
      stdin = stdin ?? origIn;
      const cached = OUTPUTS[fnv(block.code + "\u0000" + origIn)];

      if (code === block.code && stdin === origIn && cached) {
        out.status("Running…");
        await new Promise((r) => setTimeout(r, 120));
        const res = cached.c != null
          ? { compiled: false, diags: parseLocalDiags(cached.c), compilerText: cached.c }
          : { compiled: true, diags: [], stdout: cached.o || "", stderr: cached.e || "", exit: cached.x, timedOut: false };
        card._ccRun = present(out, card, res, { cached: true, meta });
        return;
      }

      out.status("Compiling with GCC… (online, usually 2–6 s)");
      let res;
      try { res = await compileRun(code, stdin); }
      catch (e) {
        out.write("Couldn't reach the online compiler (godbolt.org / wandbox.org).\n", "stderr");
        out.help("📡 Edited code is compiled online, so you need an internet connection. Unchanged examples still work offline. You can also run it on your computer:<br><code>g++ -std=c++20 -O2 main.cpp -o main &amp;&amp; ./main</code>");
        out.status("✕ Offline", "err");
        card._ccRun = "offline";
        return;
      }
      card._ccRun = present(out, card, res, { cached: false, meta });
    },

    onEdit(ctx) { if (ctx.card._ccMarks && ctx.card._ccMarks.length) clearMarks(ctx.card); },
    onTheme() {},
    cleanup() {},
  };

  window.Runner = Runner;
})();
