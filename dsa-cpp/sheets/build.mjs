#!/usr/bin/env node
/* ==========================================================================
   DSA Sheets — build and verify.

     node sheets/build.mjs                  verify every problem, then write ready.js + verified.js
     node sheets/build.mjs --only=two-sum   just these (comma separated)
     node sheets/build.mjs --no-cpp         skip compiling C++ (fast loop while writing)
     node sheets/build.mjs --fuzz=300       random inputs per problem against the brute force (default 150)

   What "verified" means here (every item is a hard failure):
     • the lesson has every part of the data model, and no placeholder text
     • the tracer, the JS solution, the C++ solution (g++, ASan+UBSan) and the brute force
       (JS and C++) print the SAME answer on every test case
     • the tracer, the JS solution and the brute force agree on random inputs
     • every trace frame points at a //@tag that exists in both solutions
     • every frame renders in its visualizer (no exceptions, finite coordinates, edges join real items)
     • measured step counts grow like the claimed complexity
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const JS = path.join(ROOT, "assets/js/sheets");
const CACHE_DIR = path.join(ROOT, ".build-cache");
const CACHE = path.join(CACHE_DIR, "sheets.json");
const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith("--" + n + "="))?.split("=")[1];
const only = flag("only") ? flag("only").split(",") : null;
const NO_CPP = args.includes("--no-cpp");
const FUZZ = +(flag("fuzz") || 150);
const QUIET = args.includes("--quiet");

/* ------------------------------------------------------------ sandbox with the browser-free parts of the engine */
function loadEngine() {
  const sb = { console, performance, setTimeout, clearTimeout, Math, JSON, BigInt };
  sb.window = sb;
  vm.createContext(sb);
  for (const f of ["catalog.js", "core.js", "kit.js", "viz/parts.js", "viz/linear.js", "viz/nonlinear.js", "viz/more.js"]) {
    const p = path.join(JS, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, "utf8"), sb, { filename: f });
  }
  return sb;
}

const log = (...a) => { if (!QUIET) console.log(...a); };
const errors = [];
const fail = (id, msg) => { errors.push(`${id}: ${msg}`); };

/* ------------------------------------------------------------ helpers */
const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function runJsSolution(SX, p, code, input) {
  const src = SX.jsRunner(p, code, SX.argsOf(p, input));
  const box = { console: { log() {} }, Math, JSON, Map, Set, Array, Object, Number, String, parseInt, Infinity, Symbol, BigInt, Uint32Array, Int32Array };
  return String(vm.runInNewContext(src, box, { timeout: 5000 }));
}

function sh(cmd, argv, opts = {}) {
  return new Promise((resolve) => {
    const ch = spawn(cmd, argv, { stdio: ["pipe", "pipe", "pipe"], ...opts });
    let out = "", err = "";
    ch.stdout.on("data", (d) => (out += d));
    ch.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => { ch.kill("SIGKILL"); }, opts.timeout || 60000);
    ch.on("close", (code, sig) => { clearTimeout(t); resolve({ code, sig, out, err }); });
    if (opts.input !== undefined) ch.stdin.end(opts.input); else ch.stdin.end();
  });
}

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { /* fresh */ }
const saveCache = () => { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache)); };

const CXX = process.env.CXX || "g++";
const FLAGS = ["-std=c++20", "-O1", "-g", "-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer", "-w"];
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sheets-"));

// compile one C++ program and run it on every stdin; results are cached by content
async function runCpp(SX, p, code, stdins, tag) {
  const prog = SX.cppProgram(p, code);
  const keys = stdins.map((s) => SX.fnv(prog + "\u0000" + s));
  if (keys.every((k) => k in cache)) return stdins.map((s, i) => ({ out: cache[keys[i]], key: keys[i] }));
  const dir = path.join(TMP, p.id + "-" + tag);
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, "main.cpp"), bin = path.join(dir, "main");
  fs.writeFileSync(src, prog);
  const c = await sh(CXX, [...FLAGS, src, "-o", bin], { timeout: 180000 });
  if (c.code !== 0) throw new Error(`g++ failed (${tag}):\n${c.err.split("\n").slice(0, 14).join("\n")}`);
  const res = [];
  for (let i = 0; i < stdins.length; i++) {
    const r = await sh(bin, [], { input: stdins[i], timeout: 20000, env: { ...process.env, ASAN_OPTIONS: "detect_leaks=0" } });
    if (r.code !== 0) throw new Error(`C++ ${tag} crashed on test ${i} (exit ${r.code}${r.sig ? " " + r.sig : ""}):\n${(r.err || "").split("\n").slice(0, 10).join("\n")}`);
    const out = r.out.trim();
    cache[keys[i]] = out;
    res.push({ out, key: keys[i] });
  }
  saveCache();
  return res;
}

/* ------------------------------------------------------------ mock stage: render every frame, check the geometry */
function mockStage(sb) {
  const items = new Map();
  const S = {
    items,
    begin() { items.clear(); S.bad = []; },
    end() {
      for (const [id, it] of items) if (it.kind === "edge") {
        for (const k of ["from", "to"]) { const v = it.o[k]; if (typeof v === "string" && !items.has(v)) S.bad.push(`edge ${id} ${k}→"${v}" is not an item in this frame`); else if (v && typeof v === "object" && !(Number.isFinite(v.x) && Number.isFinite(v.y))) S.bad.push(`edge ${id} has a non-finite ${k} point`); }
      }
    },
    snapNext() {},
  };
  const add = (kind) => (id, o) => {
    if (items.has(id)) S.bad.push(`duplicate item id "${id}"`);
    for (const k of ["x", "y", "w", "h"]) if (o[k] !== undefined && !Number.isFinite(o[k])) S.bad.push(`${kind} "${id}" has non-finite ${k} (${o[k]})`);
    if (kind === "box" && (o.x === undefined || o.y === undefined)) S.bad.push(`box "${id}" has no position`);
    items.set(id, { kind, o });
    return {};
  };
  S.box = add("box"); S.label = add("label"); S.region = add("region"); S.ptr = add("ptr"); S.edge = add("edge");
  return S;
}

/* ------------------------------------------------------------ validation of the data model */
const PLACEHOLDER = /\b(TODO|FIXME|lorem ipsum|coming soon|placeholder|to be written|tbd)\b/i;
function collectText(o, out = []) {
  if (typeof o === "string") out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => collectText(x, out));
  else if (o && typeof o === "object") for (const k in o) if (typeof o[k] !== "function") collectText(o[k], out);
  return out;
}

function validateModel(SX, p, meta) {
  const id = p.id;
  const need = (cond, msg) => { if (!cond) fail(id, msg); };
  need(meta, "not in catalog.js");
  need(typeof p.statement === "string" && p.statement.length > 40, "statement too short");
  need(Array.isArray(p.examples) && p.examples.length >= 1 && p.examples.every((e) => e.input && e.output), "examples missing input/output");
  need(Array.isArray(p.constraints) && p.constraints.length >= 1, "constraints missing");
  const Q = ["find", "beginner", "works", "slow", "repeat", "remember", "observation", "leads"];
  need(p.intuition && Q.every((k) => typeof p.intuition[k] === "string" && p.intuition[k].length > 25), "intuition needs all 8 answers: " + Q.join(", "));
  need(Array.isArray(p.flow) && p.flow.length === 6, "flow needs exactly 6 steps");
  need(p.brute && p.brute.idea && p.brute.why && p.brute.time && p.brute.space && p.brute.cpp && p.brute.js, "brute needs idea, why, time, space, cpp, js");
  need(p.pattern && p.pattern.name && p.pattern.why && Array.isArray(p.pattern.recognize) && p.pattern.recognize.length >= 3, "pattern needs name, why, 3+ recognise bullets");
  need(p.optimal && p.optimal.idea && Array.isArray(p.optimal.steps) && p.optimal.steps.length >= 3 && p.optimal.invariant && p.optimal.correct, "optimal needs idea, steps, invariant, correct");
  need(p.cpp && p.js, "needs cpp and js solutions");
  need(Array.isArray(p.tests) && p.tests.length >= 5, "needs at least 5 test cases");
  need(p.tests.some((t) => t.kind === "normal"), "needs a normal test");
  need(p.tests.some((t) => t.kind === "edge"), "needs an edge test");
  need(p.tests.some((t) => t.kind === "corner"), "needs a corner test");
  if (p.check) p.tests.forEach((t) => { const msg = p.check(JSON.parse(JSON.stringify(t.input))); if (msg) fail(id, `test “${t.name}” is refused by the lesson's own check(): ${msg}`); });
  p.tests.forEach((t) => { if (t.kind !== "normal") need(t.why && t.why.length > 30, `test “${t.name}” needs a why-it-matters explanation`); });
  need(typeof p.trace === "function", "needs trace()");
  need(typeof p.gen === "function", "needs gen(n) for the complexity experiment");
  const c = p.complexity || {};
  for (const k of ["time", "space"]) need(c[k] && c[k].tex && Array.isArray(c[k].derive) && c[k].derive.length >= (k === "time" ? 3 : 2) && c[k].where, `complexity.${k} needs tex, derive (${k === "time" ? 3 : 2}+ rows), where`);
  need(c.measure && typeof c.measure.f === "function" && c.measure.fTex, "complexity.measure needs f and fTex");
  need(Array.isArray(p.mistakes) && p.mistakes.length >= 3 && p.mistakes.every((m) => m.title && m.what && m.why && m.breaks && m.avoid), "needs 3+ mistakes with title/what/why/breaks/avoid");
  need(Array.isArray(p.followUps) && p.followUps.length >= 2 && p.followUps.every((f) => f.q && f.a && f.a.length > 60), "needs 2+ follow-ups with real answers");
  need(Array.isArray(p.related) && p.related.length >= 3 && p.related.every((r) => r.why), "needs 3+ related problems");
  (p.related || []).forEach((r) => need(SX.catalog.some((x) => x.id === r.id), `related id “${r.id}” is not in the catalog`));
  need(p.patternNote && Array.isArray(p.takeaways) && p.takeaways.length >= 3, "needs patternNote and 3+ takeaways");
  const txt = collectText({ ...p, cpp: "", js: "", code: "" }).join("\n");
  const m = txt.match(PLACEHOLDER);
  if (m) fail(id, `placeholder text found: “${m[0]}”`);
  if (/\s[–—]\s/.test(txt.replace(/`[^`]*`/g, "")) && false) fail(id, "dash style");
}

/* ------------------------------------------------------------ one problem */
async function checkProblem(sb, SX, p, meta) {
  const id = p.id;
  const t0 = Date.now();
  validateModel(SX, p, meta);
  if (errors.some((e) => e.startsWith(id + ":"))) return;
  const viz = SX.viz[p.viz];
  if (!viz) { fail(id, `visualizer “${p.viz}” does not exist (SHEETS.viz)`); return; }
  if (meta && meta.viz !== p.viz) fail(id, `catalog says viz “${meta.viz}” but the lesson uses “${p.viz}”`);

  const used = new Set();
  const cases = [];
  // 1. trace + JS solution + brute JS on every test
  for (const t of p.tests) {
    let tr;
    try { tr = SX.trace(p, t.input); } catch (e) { fail(id, `trace crashed on “${t.name}”: ${e.stack.split("\n").slice(0, 3).join(" | ")}`); continue; }
    if (!tr.frames.length) { fail(id, `trace has no frames on “${t.name}”`); continue; }
    if (tr.frames.length > 1500) fail(id, `trace for “${t.name}” has ${tr.frames.length} frames (max 1500)`);
    if (!tr.hasResult) { fail(id, `trace never called T.result on “${t.name}”`); continue; }
    const expected = SX.fmt(tr.result, p.io.ret);
    tr.frames.forEach((f, k) => {
      used.add(f.tag);
      if (!p.lines.cpp[f.tag]) fail(id, `frame ${k} of “${t.name}”: tag “${f.tag}” is not marked in the C++ solution`);
      if (!p.lines.js[f.tag]) fail(id, `frame ${k} of “${t.name}”: tag “${f.tag}” is not marked in the JS solution`);
      if (!f.say || f.say.length < 8) fail(id, `frame ${k} of “${t.name}” has no explanation (say)`);
      if (!f.state || typeof f.state !== "object") fail(id, `frame ${k} of “${t.name}” has no state`);
    });
    // render every frame on a mock stage
    const S = mockStage(sb);
    tr.frames.forEach((f, k) => {
      S.begin();
      try { viz.render(S, f.state, { frame: f, prev: tr.frames[k - 1] || null, problem: p }); } catch (e) { fail(id, `visualizer crashed on frame ${k} of “${t.name}”: ${e.message}`); return; }
      S.end();
      if (S.bad.length) fail(id, `frame ${k} of “${t.name}”: ${S.bad[0]}`);
      if (!S.items.size) fail(id, `frame ${k} of “${t.name}” drew nothing`);
    });
    let jsOut, bruteOut;
    try { jsOut = runJsSolution(SX, p, p.code.js, t.input); } catch (e) { fail(id, `JS solution crashed on “${t.name}”: ${e.message}`); continue; }
    const same = (a, b) => (p.judge ? p.judge(t.input, a, b).ok : SX.canonOut(p, a) === SX.canonOut(p, b));
    if (!t.noBrute) {
      try { bruteOut = runJsSolution(SX, p, p.brute.code.js, t.input); } catch (e) { fail(id, `JS brute force crashed on “${t.name}”: ${e.message}`); continue; }
      if (!same(bruteOut, expected)) fail(id, `“${t.name}”: JS brute force printed ${bruteOut} but the tracer answered ${expected}`);
    }
    if (!same(jsOut, expected)) fail(id, `“${t.name}”: JS solution printed ${jsOut} but the tracer answered ${expected}`);
    cases.push({ t, expected, stdin: SX.stdinOf(p, t.input) });
  }
  // every tag in the code should be used by some frame (so highlighting never silently misses a line)
  for (const l of ["cpp", "js"]) for (const tag in p.lines[l]) if (!used.has(tag) && args.includes("--verbose")) log(`   note: ${id}: ${l} tag “${tag}” is never used by a frame`);
  for (const tag in p.lines.cpp) if (!(tag in p.lines.js)) fail(id, `tag “${tag}” is in the C++ code but not in the JS code`);
  for (const tag in p.lines.js) if (!(tag in p.lines.cpp)) fail(id, `tag “${tag}” is in the JS code but not in the C++ code`);

  // 2. fuzz: tracer vs JS solution vs brute force on random inputs
  if (typeof p.fuzz === "function") {
    const rnd = rngOf(1234567);
    let bad = 0;
    for (let k = 0; k < FUZZ && bad < 3; k++) {
      let input;
      try { input = p.fuzz(rnd, k); } catch (e) { fail(id, `fuzz generator crashed: ${e.message}`); break; }
      let tr, a, b;
      try { tr = SX.trace(p, input); a = runJsSolution(SX, p, p.code.js, input); b = runJsSolution(SX, p, p.brute.code.js, input); } catch (e) { fail(id, `fuzz #${k} crashed: ${e.message} on ${JSON.stringify(input).slice(0, 200)}`); bad++; continue; }
      const exp = SX.fmt(tr.result, p.io.ret);
      const same = (x, y) => (p.judge ? p.judge(input, x, y).ok : SX.canonOut(p, x) === SX.canonOut(p, y));
      if (!same(a, exp) || !same(b, exp) || (p.judge ? false : false)) { fail(id, `fuzz #${k} disagreement on ${JSON.stringify(input).slice(0, 200)}: JS=${a} brute=${b} tracer=${exp}`); bad++; }
      if (tr.frames.length > 1500 && k < 30) { /* big random inputs are fine: the lab refuses to animate them */ }
    }
  } else fail(id, "needs a fuzz(rnd) generator (random inputs checked against the brute force)");

  // 3. complexity claim: measured steps against the formula
  try {
    const m = p.complexity.measure, sizes = m.sizes || [8, 16, 32, 64, 128, 256];
    const rows = sizes.map((n) => ({ n, ops: SX.trace(p, p.gen(n), { countOnly: true }).ops, f: m.f(n) }));
    const ratios = rows.map((r) => r.ops / r.f).slice(Math.floor(rows.length / 2));
    const spread = Math.max(...ratios) / Math.min(...ratios);
    if (!(spread < 2.2)) fail(id, `measured steps do not follow the claimed formula (T/f varies ×${spread.toFixed(2)} over the larger sizes: ${rows.map((r) => (r.ops / r.f).toFixed(2)).join(", ")})`);
    if (!m.constant && rows[rows.length - 1].ops <= rows[0].ops) fail(id, "gen(n) does not produce growing work");
  } catch (e) { fail(id, `complexity experiment crashed: ${e.message}`); }

  // 4. C++: the solution and the brute force, compiled with g++ and run on every test
  if (!NO_CPP) {
    try {
      const sol = await runCpp(SX, p, p.code.cpp, cases.map((c) => c.stdin), "sol");
      sol.forEach((r, i) => {
        const c = cases[i], same = p.judge ? p.judge(c.t.input, r.out, c.expected).ok : SX.canonOut(p, r.out) === SX.canonOut(p, c.expected);
        if (!same) fail(id, `“${c.t.name}”: C++ solution printed ${r.out} but the tracer answered ${c.expected}`);
        verified[r.key] = { o: r.out };
      });
      const bc = cases.filter((c) => !c.t.noBrute);
      const br = await runCpp(SX, p, p.brute.code.cpp, bc.map((c) => c.stdin), "brute");
      br.forEach((r, i) => {
        const c = bc[i], same = p.judge ? p.judge(c.t.input, r.out, c.expected).ok : SX.canonOut(p, r.out) === SX.canonOut(p, c.expected);
        if (!same) fail(id, `“${c.t.name}”: C++ brute force printed ${r.out} but the tracer answered ${c.expected}`);
      });
      // follow-up snippets are shown, so make sure they at least compile as C++ where they are complete functions
    } catch (e) { fail(id, e.message); }
  }
  // 5. the code shown in the follow-ups must at least compile (C++, -fsyntax-only) / parse (JS)
  for (const [k, f] of (p.followUps || []).entries()) {
    if (f.js) { try { new vm.Script(SX.stripTags(f.js).code, { filename: `${id}#followUp${k}.js` }); } catch (e) { fail(id, `follow-up ${k + 1} (JS) does not parse: ${e.message}`); } }
    if (f.cpp && !NO_CPP && !p.io.design) {
      try {
        const h = SX.cppHarness(p);
        const fn = p.io.fn;
        const prog = `${h.prelude}\n#line 1 "solution"\n${p.code.cpp}\ntemplate <class... A> auto ${fn}(A&&... a) { return Solution().${fn}(std::forward<A>(a)...); }\n#line 1 "followup"\n${SX.stripTags(f.cpp).code}\n`;
        const dir = path.join(TMP, `${id}-fu${k}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "f.cpp"), prog);
        const c = await sh(CXX, ["-std=c++20", "-fsyntax-only", "-w", path.join(dir, "f.cpp")], { timeout: 60000 });
        if (c.code !== 0) fail(id, `follow-up ${k + 1} (C++) does not compile:\n${c.err.split("\n").slice(0, 8).join("\n")}`);
      } catch (e) { fail(id, `follow-up ${k + 1}: ${e.message}`); }
    }
  }
  log(`   ${id}: ${p.tests.length} tests, ${cases.length ? "ok" : "no cases"} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

/* ------------------------------------------------------------ main */
const verified = {};
const sb = loadEngine();
const SX = sb.SHEETS;
const dir = path.join(JS, "problems");
let files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort();
const all = files.map((f) => f.replace(/\.js$/, ""));
if (only) files = files.filter((f) => only.includes(f.replace(/\.js$/, "")));

const meta = Object.fromEntries(SX.catalog.map((c) => [c.id, c]));
// load previously verified outputs so a partial run keeps the others
const vPath = path.join(JS, "verified.js");
try { const t = fs.readFileSync(vPath, "utf8"); const i = t.indexOf("SHEETS.verified = "); Object.assign(verified, JSON.parse(t.slice(i + 18, t.lastIndexOf("}") + 1))); } catch { /* none yet */ }

console.log(`DSA Sheets: checking ${files.length} of ${all.length} lessons${NO_CPP ? " (C++ skipped)" : ""}`);
const queue = files.slice();
const checked = [];
async function worker() {
  while (queue.length) {
    const f = queue.shift();
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    const id = f.replace(/\.js$/, "");
    try {
      // each problem file in its own context copy of SHEETS.define
      vm.runInContext(src, sb, { filename: f });
    } catch (e) { fail(id, `could not load: ${e.message}`); continue; }
    const p = SX.problems[id];
    if (!p) { fail(id, "file did not define a problem with the same id as its file name"); continue; }
    await checkProblem(sb, SX, p, meta[id]);
    checked.push(id);
  }
}
await Promise.all(Array.from({ length: Math.min(NO_CPP ? 1 : 6, Math.max(1, files.length)) }, worker));

fs.writeFileSync(path.join(JS, "ready.js"), `/* generated by sheets/build.mjs: which lessons exist and passed their checks */\nwindow.SHEETS = window.SHEETS || {}; window.SHEETS.ready = ${JSON.stringify(all.filter((id) => !errors.some((e) => e.startsWith(id + ":"))).sort((a, b) => SX.catalog.findIndex((c) => c.id === a) - SX.catalog.findIndex((c) => c.id === b)))}; window.SHEETS.version = ${Date.now()};\n`);
fs.writeFileSync(vPath, `/* generated by sheets/build.mjs: output of the shipped C++ solutions, compiled with g++ -std=c++20 (ASan+UBSan) */\nwindow.SHEETS = window.SHEETS || {}; window.SHEETS.verified = ${JSON.stringify(verified)};\n`);

fs.rmSync(TMP, { recursive: true, force: true });
if (errors.length) {
  console.error(`\n✕ ${errors.length} problem(s):\n` + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(`✓ ${checked.length} lessons verified (${all.length}/${SX.catalog.length} written)`);
