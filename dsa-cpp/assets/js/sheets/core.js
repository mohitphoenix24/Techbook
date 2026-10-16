/* ==========================================================================
   DSA Sheets — core (no DOM). Runs in the browser AND in Node (the build).

   SHEETS.define(problem)   registers a problem (one file per problem)
   SHEETS.trace(problem, input) → { frames, result, ops }   deterministic trace builder
   SHEETS.parseInput / formatValue / harnesses for C++ and JS

   A trace is a list of frames:
     { tag, line:{cpp,js}, vars, state, say, op, act, why, phase, work }
   - tag   : a name that exists as a `//@tag` marker in BOTH solutions (build checks it)
   - vars  : the algorithm's variables at this step (shown as chips)
   - state : data for the problem's visualizer (full snapshot, so any step can be jumped to)
   - say   : one sentence about WHAT happens and WHY
   - op    : the comparison / operation being evaluated, e.g. "nums[mid] < target"
   - act   : an ACTION label, e.g. MOVE_RIGHT
   - why   : { title, text } optional overlay shown at decisions
   - phase : stage name for multi-stage problems (shown on the timeline)
   ========================================================================== */
(function () {
  "use strict";
  const SX = (window.SHEETS = window.SHEETS || {});
  const problems = (SX.problems = SX.problems || {});

  /* ------------------------------------------------------------ small utils */
  const clone = (x) => {
    if (x === null || typeof x !== "object") return x;
    if (Array.isArray(x)) { const a = new Array(x.length); for (let i = 0; i < x.length; i++) a[i] = clone(x[i]); return a; }
    const o = {};
    for (const k in x) o[k] = clone(x[k]);
    return o;
  };
  SX.clone = clone;
  SX.fnv = function (s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0") + "-" + s.length;
  };

  /* ------------------------------------------------------------ code markers
     Solutions are written with trailing `//@tag` markers. They are removed from the
     displayed code; their line numbers become the tag → line map. */
  function stripTags(src) {
    const lines = String(src).replace(/^\n/, "").replace(/\s+$/, "").split("\n");
    const map = {};
    const out = lines.map((l, i) => {
      const m = l.match(/^(.*?)\s*\/\/@([\w ,-]+)\s*$/);
      if (!m) return l;
      m[2].split(/[ ,]+/).filter(Boolean).forEach((t) => { if (!(t in map)) map[t] = i + 1; });
      return m[1];
    });
    return { code: out.join("\n"), map };
  }
  SX.stripTags = stripTags;

  /* ------------------------------------------------------------ define */
  SX.define = function (p) {
    if (!p || !p.id) throw new Error("SHEETS.define: problem needs an id");
    const c = stripTags(p.cpp || ""), j = stripTags(p.js || "");
    p.code = { cpp: c.code, js: j.code };
    p.lines = { cpp: c.map, js: j.map };
    if (p.brute) {
      const bc = stripTags(p.brute.cpp || ""), bj = stripTags(p.brute.js || "");
      p.brute.code = { cpp: bc.code, js: bj.code };
    }
    p.tests = (p.tests || []).map((t, i) => Object.assign({ id: `${p.id}#${i}`, kind: "normal" }, t));
    problems[p.id] = p;
    if (SX.onDefine) SX.onDefine(p);
    return p;
  };

  /* ------------------------------------------------------------ types & parsing
     io: { fn, params:[[name,type],...], ret }
     types: int, long, bool, str, char, double, int[], str[], char[], int[][], char[][], str[][],
            list (linked list as int[]), tree (level-order with null), graph (adjacency list int[][]),
            ops (design problems: two arrays — method names and arguments)            */
  const TYPE_HINT = {
    int: "an integer, e.g. 7", long: "an integer, e.g. 7", bool: "true or false", str: 'a string in quotes, e.g. "abc"', char: 'one character in quotes, e.g. "a"', double: "a number",
    "int[]": "an array of integers, e.g. [1,2,3]", "str[]": 'an array of strings, e.g. ["a","b"]', "char[]": 'an array of one-character strings, e.g. ["a","b"]',
    "int[][]": "an array of integer arrays, e.g. [[1,2],[3,4]]", "char[][]": 'a grid of one-character strings, e.g. [["a","b"],["c","d"]]', "str[][]": 'an array of string arrays, e.g. [["a"],["b"]]',
    list: "a linked list written as an array, e.g. [1,2,3] (use [] for empty)", tree: "a binary tree in level order with null for gaps, e.g. [3,9,20,null,null,15,7]",
    graph: "an adjacency list, e.g. [[2,4],[1,3],[2,4],[1,3]] (node i+1 has the neighbours in row i)", ops: "an array of method names",
    any: "a JSON value, e.g. [[],[\"apple\"],[\"app\"]]", lists: "an array of linked lists, each written as an array, e.g. [[1,4,5],[1,3,4],[2,6]]", node: "the value of a node that exists in the tree above",
  };
  SX.TYPE_HINT = TYPE_HINT;

  function parseValue(text, type, name) {
    let v;
    const t = String(text ?? "").trim();
    const bad = (why) => { throw new Error(`${name || "value"}: ${why || "expected " + TYPE_HINT[type]}`); };
    if (t === "") bad("this field is empty");
    try { v = JSON.parse(t); } catch { bad(`could not read “${t.length > 40 ? t.slice(0, 40) + "…" : t}” — expected ${TYPE_HINT[type]}`); }
    const isInt = (x) => typeof x === "number" && Number.isInteger(x);
    const arr = (x) => Array.isArray(x);
    const chk = {
      int: () => isInt(v), long: () => isInt(v), bool: () => typeof v === "boolean", str: () => typeof v === "string", char: () => typeof v === "string" && v.length === 1, double: () => typeof v === "number",
      "int[]": () => arr(v) && v.every(isInt), "str[]": () => arr(v) && v.every((x) => typeof x === "string"), "char[]": () => arr(v) && v.every((x) => typeof x === "string" && x.length === 1),
      "int[][]": () => arr(v) && v.every((r) => arr(r) && r.every(isInt)), "char[][]": () => arr(v) && v.every((r) => arr(r) && r.every((x) => typeof x === "string" && x.length === 1)),
      "str[][]": () => arr(v) && v.every((r) => arr(r) && r.every((x) => typeof x === "string")),
      list: () => arr(v) && v.every(isInt), tree: () => arr(v) && v.every((x) => x === null || isInt(x)), graph: () => arr(v) && v.every((r) => arr(r) && r.every(isInt)),
      ops: () => arr(v) && v.every((x) => typeof x === "string"),
      lists: () => arr(v) && v.every((r) => arr(r) && r.every(isInt)), node: () => isInt(v),
      any: () => true,
    };
    if (!(chk[type] || chk.any)()) bad();
    if (type === "tree") {
      // level-order validity: a null node cannot have children listed for it
      if (v.length && v[0] === null) bad("the root cannot be null");
    }
    return v;
  }
  SX.parseValue = parseValue;

  // canonical text for outputs (identical in C++, JS and the page)
  const fmtDouble = (x) => { let s = Number(x).toFixed(5); if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, ".0"); return s; };
  function fmt(v, type) {
    if (type === "double") return fmtDouble(v);
    if (v === undefined) return "null";
    // a double inside a larger result is written {__dbl: x} by tracers, and printed like the programs print it
    return JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) && "__dbl" in x ? "__D:" + fmtDouble(x.__dbl) : x)).replace(/"__D:([^"]+)"/g, "$1");
  }
  SX.fmt = fmt;
  SX.dbl = (x) => ({ __dbl: x });

  /* ------------------------------------------------------------ the trace builder
     trace(input, T, K):  input = object by param name; T emits frames.
       T.step(tag, { vars, state, say, op, act, why, phase, w })
         state may be a function (not called in count-only mode)
       T.result(value)    the answer the reference algorithm computed
       T.work(n)          count extra units of work without a frame                   */
  function makeTracer(countOnly) {
    const T = {
      frames: [], ops: 0, res: undefined, hasRes: false, _phase: "",
      step(tag, f) {
        f = f || {};
        T.ops += f.w === undefined ? 1 : f.w;
        if (countOnly) return;
        if (f.phase) T._phase = f.phase;
        const st = typeof f.state === "function" ? f.state() : f.state;
        T.frames.push({
          tag, vars: clone(f.vars || {}), state: clone(st || {}), say: f.say || "", op: f.op || "", act: f.act || "",
          why: f.why ? { title: f.why.title || f.why[0], text: f.why.text || f.why[1] } : null, phase: T._phase, work: T.ops,
        });
      },
      work(n) { T.ops += n === undefined ? 1 : n; },
      result(v) { T.res = clone(v); T.hasRes = true; },
      phase(name) { T._phase = name; },
      count: countOnly,
    };
    return T;
  }
  SX.trace = function (p, input, opts) {
    const T = makeTracer(!!(opts && opts.countOnly));
    p.trace(clone(input), T, SX.K || {});
    return { frames: T.frames, result: T.res, ops: T.ops, hasResult: T.hasRes };
  };

  /* ------------------------------------------------------------ C++ harness
     The learner edits only the solution. We wrap it: prelude + solution + main().
     `#line 1` makes compiler diagnostics refer to the learner's own line numbers. */
  const CPP_PRELUDE = String.raw`#include <bits/stdc++.h>
using namespace std;

// ---- tiny JSON reader/printer used by the test harness (not part of the solution) ----
struct J { int k = 0; long long i = 0; double d = 0; string s; vector<J> a; };   // 0 null, 1 int, 2 str, 3 arr, 4 bool, 5 double
static J jparse(const string& t, size_t& p) {
    auto ws = [&]() { while (p < t.size() && isspace((unsigned char)t[p])) p++; };
    ws(); J r;
    if (t[p] == '[') { r.k = 3; p++; ws(); if (t[p] == ']') { p++; return r; } for (;;) { r.a.push_back(jparse(t, p)); ws(); if (t[p] == ',') { p++; continue; } p++; break; } return r; }
    if (t[p] == '"') { r.k = 2; p++; while (t[p] != '"') { if (t[p] == '\\') { p++; char c = t[p]; r.s += c == 'n' ? '\n' : c == 't' ? '\t' : c; } else r.s += t[p]; p++; } p++; return r; }
    if (t.compare(p, 4, "null") == 0) { p += 4; return r; }
    if (t.compare(p, 4, "true") == 0) { p += 4; r.k = 4; r.i = 1; return r; }
    if (t.compare(p, 5, "false") == 0) { p += 5; r.k = 4; r.i = 0; return r; }
    size_t q = p; while (q < t.size() && (isdigit((unsigned char)t[q]) || t[q] == '-' || t[q] == '+' || t[q] == '.' || t[q] == 'e' || t[q] == 'E')) q++;
    string num = t.substr(p, q - p); p = q;
    if (num.find_first_of(".eE") != string::npos) { r.k = 5; r.d = stod(num); } else { r.k = 1; r.i = stoll(num); }
    return r;
}
static J readJ() { string line; getline(cin, line); size_t p = 0; return jparse(line, p); }
static void pj(const J& j, string& o) {
    if (j.k == 0) o += "null"; else if (j.k == 1) o += to_string(j.i); else if (j.k == 4) o += j.i ? "true" : "false";
    else if (j.k == 2) { o += '"'; for (char c : j.s) { if (c == '"' || c == '\\') o += '\\'; if (c == '\n') o += "\\n"; else o += c; } o += '"'; }
    else if (j.k == 5) { char b[64]; snprintf(b, sizeof b, "%.5f", j.d); string s = b; while (s.size() > 1 && s.back() == '0') s.pop_back(); if (s.back() == '.') s += '0'; o += s; }
    else { o += '['; for (size_t i = 0; i < j.a.size(); i++) { if (i) o += ','; pj(j.a[i], o); } o += ']'; }
}
`;

  function cppTypeInfo(type) {
    return {
      int: "int", long: "long long", bool: "bool", str: "string", char: "char", double: "double",
      "int[]": "vector<int>", "str[]": "vector<string>", "char[]": "vector<char>", "int[][]": "vector<vector<int>>", "char[][]": "vector<vector<char>>", "str[][]": "vector<vector<string>>",
      list: "ListNode*", tree: "TreeNode*", graph: "Node*", ops: "vector<string>", any: "J", lists: "vector<ListNode*>", node: "TreeNode*",
    }[type];
  }

  // C++ conversion helpers, emitted only when a problem needs them
  const CPP_CONV = {
    base: String.raw`
template <class T> struct Cv;
template <> struct Cv<int> { static int get(const J& j) { return (int)j.i; } static J put(int v) { J r; r.k = 1; r.i = v; return r; } };
template <> struct Cv<long long> { static long long get(const J& j) { return j.i; } static J put(long long v) { J r; r.k = 1; r.i = v; return r; } };
template <> struct Cv<bool> { static bool get(const J& j) { return j.i != 0; } static J put(bool v) { J r; r.k = 4; r.i = v; return r; } };
template <> struct Cv<double> { static double get(const J& j) { return j.k == 1 ? (double)j.i : j.d; } static J put(double v) { J r; r.k = 5; r.d = v; return r; } };
template <> struct Cv<string> { static string get(const J& j) { return j.s; } static J put(const string& v) { J r; r.k = 2; r.s = v; return r; } };
template <> struct Cv<char> { static char get(const J& j) { return j.s.empty() ? ' ' : j.s[0]; } static J put(char v) { J r; r.k = 2; r.s = string(1, v); return r; } };
template <class T> struct Cv<vector<T>> {
    static vector<T> get(const J& j) { vector<T> v; for (auto& x : j.a) v.push_back(Cv<T>::get(x)); return v; }
    static J put(const vector<T>& v) { J r; r.k = 3; for (auto& x : v) r.a.push_back(Cv<T>::put(x)); return r; }
};
`,
    list: String.raw`
struct ListNode { int val; ListNode* next; ListNode() : val(0), next(nullptr) {} ListNode(int x) : val(x), next(nullptr) {} ListNode(int x, ListNode* n) : val(x), next(n) {} };
static ListNode* mkList(const J& j) { ListNode d; ListNode* t = &d; for (auto& x : j.a) { t->next = new ListNode((int)x.i); t = t->next; } return d.next; }
static J listJ(ListNode* h, int cap = 100000) { J r; r.k = 3; while (h && cap--) { r.a.push_back(Cv<int>::put(h->val)); h = h->next; } return r; }
`,
    tree: String.raw`
struct TreeNode { int val; TreeNode *left, *right; TreeNode() : val(0), left(nullptr), right(nullptr) {} TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} TreeNode(int x, TreeNode* l, TreeNode* r) : val(x), left(l), right(r) {} };
static TreeNode* mkTree(const J& j) {
    if (j.a.empty() || j.a[0].k == 0) return nullptr;
    TreeNode* root = new TreeNode((int)j.a[0].i); queue<TreeNode*> q; q.push(root); size_t i = 1;
    while (!q.empty() && i < j.a.size()) { TreeNode* n = q.front(); q.pop();
        if (i < j.a.size() && j.a[i].k != 0) { n->left = new TreeNode((int)j.a[i].i); q.push(n->left); } i++;
        if (i < j.a.size() && j.a[i].k != 0) { n->right = new TreeNode((int)j.a[i].i); q.push(n->right); } i++; }
    return root;
}
static J treeJ(TreeNode* root) {
    J r; r.k = 3; if (!root) return r; queue<TreeNode*> q; q.push(root);
    while (!q.empty()) { TreeNode* n = q.front(); q.pop(); if (!n) { r.a.push_back(J()); continue; } r.a.push_back(Cv<int>::put(n->val)); q.push(n->left); q.push(n->right); }
    while (!r.a.empty() && r.a.back().k == 0) r.a.pop_back();
    return r;
}
static TreeNode* findNode(TreeNode* n, int v) { if (!n) return nullptr; if (n->val == v) return n; TreeNode* l = findNode(n->left, v); return l ? l : findNode(n->right, v); }
`,
    graph: String.raw`
class Node { public: int val; vector<Node*> neighbors; Node() : val(0) {} Node(int v) : val(v) {} Node(int v, vector<Node*> n) : val(v), neighbors(n) {} };
static Node* mkGraph(const J& j) {
    if (j.a.empty()) return nullptr; vector<Node*> ns; for (size_t i = 0; i < j.a.size(); i++) ns.push_back(new Node((int)i + 1));
    for (size_t i = 0; i < j.a.size(); i++) for (auto& x : j.a[i].a) ns[i]->neighbors.push_back(ns[x.i - 1]);
    return ns[0];
}
static J graphJ(Node* s, const set<Node*>& original) {
    J r; r.k = 3; if (!s) return r; map<int, Node*> seen; queue<Node*> q; q.push(s); seen[s->val] = s; bool shared = false;
    while (!q.empty()) { Node* n = q.front(); q.pop(); if (original.count(n)) shared = true; for (Node* m : n->neighbors) if (!seen.count(m->val)) { seen[m->val] = m; q.push(m); } }
    if (shared) { J e; e.k = 2; e.s = "NOT A DEEP COPY: the result shares nodes with the input"; return e; }
    for (auto& [v, n] : seen) { J row; row.k = 3; for (Node* m : n->neighbors) row.a.push_back(Cv<int>::put(m->val)); r.a.push_back(row); }
    return r;
}
static set<Node*> graphNodes(Node* s) { set<Node*> r; if (!s) return r; queue<Node*> q; q.push(s); r.insert(s); while (!q.empty()) { Node* n = q.front(); q.pop(); for (Node* m : n->neighbors) if (!r.count(m)) { r.insert(m); q.push(m); } } return r; }
`,
  };
  SX.CPP_CONV = CPP_CONV;

  SX.cppHarness = function (p) {
    const io = p.io;
    const needs = new Set();
    (io.params || []).forEach(([, t]) => needs.add(t));
    needs.add(io.ret);
    let pre = CPP_PRELUDE + CPP_CONV.base;
    if (needs.has("list") || needs.has("lists") || p.needsList) pre += CPP_CONV.list;
    if (needs.has("tree") || needs.has("node") || p.needsTree) pre += CPP_CONV.tree;
    if (needs.has("graph")) pre += CPP_CONV.graph;
    const prelude = pre;
    let main;
    if (io.design) {
      main = io.design.cpp;                         // problem-specific driver for class-design problems
    } else {
      const lines = [];
      const names = [];
      let lastTree = null;
      (io.params || []).forEach(([n, t]) => {
        const T = cppTypeInfo(t);
        if (t === "list") lines.push(`    ListNode* ${n} = mkList(readJ());`);
        else if (t === "lists") lines.push(`    vector<ListNode*> ${n}; { J j = readJ(); for (auto& x : j.a) ${n}.push_back(mkList(x)); }`);
        else if (t === "tree") { lines.push(`    TreeNode* ${n} = mkTree(readJ());`); lastTree = n; }
        else if (t === "node") lines.push(`    TreeNode* ${n} = findNode(${lastTree}, (int)readJ().i);`);
        else if (t === "any") lines.push(`    J ${n} = readJ();`);
        else if (t === "graph") lines.push(`    Node* ${n} = mkGraph(readJ()); set<Node*> orig = graphNodes(${n});`);
        else lines.push(`    ${T} ${n} = Cv<${T}>::get(readJ());`);
        names.push(n);
      });
      if (io.setup) lines.push(io.setup.cpp);
      const call = `Solution().${io.fn}(${(io.args || names).join(", ")})`;
      let put;
      if (io.ret === "list") put = "listJ(r)";
      else if (io.ret === "tree") put = "treeJ(r)";
      else if (io.ret === "nodeval") put = "Cv<int>::put(r ? r->val : -1)";
      else if (io.ret === "graph") put = "graphJ(r, orig)";
      else if (io.ret === "void") put = null;
      else put = `Cv<${cppTypeInfo(io.ret)}>::put(r)`;
      if (io.ret === "void") {
        // functions that modify an argument in place: print that argument afterwards
        const tgt = io.inplace || names[0];
        const pt = (io.params.find(([n]) => n === tgt) || [])[1];
        lines.push(`    ${call};`);
        const conv = pt === "list" ? `listJ(${tgt})` : pt === "tree" ? `treeJ(${tgt})` : `Cv<${cppTypeInfo(pt)}>::put(${tgt})`;
        lines.push(`    string o; pj(${conv}, o); cout << o << "\\n";`);
      } else {
        lines.push(`    auto r = ${call};`);
        if (io.canon === "sort") lines.push(`    auto J0 = ${put}; sort(J0.a.begin(), J0.a.end(), [](const J& x, const J& y) { string a, b; pj(x, a); pj(y, b); return a < b; });`);
        lines.push(`    string o; pj(${io.canon === "sort" ? "J0" : put}, o); cout << o << "\\n";`);
      }
      main = `\nint main() {\n${lines.join("\n")}\n}\n`;
    }
    return { prelude, main };
  };

  SX.cppProgram = function (p, code) {
    const h = SX.cppHarness(p);
    return `${h.prelude}\n#line 1 "main.cpp"\n${code}\n#line 1 "harness.cpp"\n${h.main}`;
  };

  /* ------------------------------------------------------------ JS harness
     The learner's JS solution defines the function(s); this wrapper feeds the parsed
     input and returns the canonical text. Shared by the Worker (browser) and Node (build). */
  SX.jsHelpers = String.raw`
function ListNode(val, next) { this.val = val === undefined ? 0 : val; this.next = next === undefined ? null : next; }
function TreeNode(val, left, right) { this.val = val === undefined ? 0 : val; this.left = left === undefined ? null : left; this.right = right === undefined ? null : right; }
function Node(val, neighbors) { this.val = val === undefined ? 0 : val; this.neighbors = neighbors === undefined ? [] : neighbors; }
function __findNode(root, v) { if (!root) return null; if (root.val === v) return root; return __findNode(root.left, v) || __findNode(root.right, v); }
function __mkList(a) { const d = new ListNode(0); let t = d; for (const x of a) { t.next = new ListNode(x); t = t.next; } return d.next; }
function __listJ(h) { const r = []; let n = 0; while (h && n++ < 100000) { r.push(h.val); h = h.next; } return r; }
function __mkTree(a) {
  if (!a.length || a[0] === null) return null;
  const root = new TreeNode(a[0]); const q = [root]; let i = 1, h = 0;
  while (h < q.length && i < a.length) { const n = q[h++];
    if (i < a.length && a[i] !== null) { n.left = new TreeNode(a[i]); q.push(n.left); } i++;
    if (i < a.length && a[i] !== null) { n.right = new TreeNode(a[i]); q.push(n.right); } i++; }
  return root;
}
function __treeJ(root) {
  const r = []; if (!root) return r; const q = [root]; let h = 0;
  while (h < q.length) { const n = q[h++]; if (!n) { r.push(null); continue; } r.push(n.val); q.push(n.left); q.push(n.right); }
  while (r.length && r[r.length - 1] === null) r.pop();
  return r;
}
function __mkGraph(adj) { if (!adj.length) return null; const ns = adj.map((_, i) => new Node(i + 1)); adj.forEach((row, i) => row.forEach((x) => ns[i].neighbors.push(ns[x - 1]))); return ns[0]; }
function __graphNodes(s) { const r = new Set(); if (!s) return r; const q = [s]; r.add(s); while (q.length) { const n = q.shift(); for (const m of n.neighbors) if (!r.has(m)) { r.add(m); q.push(m); } } return r; }
function __graphJ(s, orig) {
  if (!s) return []; const seen = new Map(); const q = [s]; seen.set(s.val, s); let shared = false;
  while (q.length) { const n = q.shift(); if (orig.has(n)) shared = true; for (const m of n.neighbors) if (!seen.has(m.val)) { seen.set(m.val, m); q.push(m); } }
  if (shared) return "NOT A DEEP COPY: the result shares nodes with the input";
  return [...seen.keys()].sort((a, b) => a - b).map((k) => seen.get(k).neighbors.map((m) => m.val));
}
function __canonSort(v) { return "[" + v.map((x) => JSON.stringify(x)).sort().join(",") + "]"; }
function __canonDeep(v) { return "[" + v.map((g) => (Array.isArray(g) ? g.map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x)) : g)).map((x) => JSON.stringify(x)).sort().join(",") + "]"; }
function __fmt(v, type) {
  if (type === "double") { let s = Number(v).toFixed(5); if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, ".0"); return s; }
  return JSON.stringify(v === undefined ? null : v);
}
`;

  // JS source that evaluates `code` (learner's JS) on parsed args and returns canonical text. Used in Worker/Node.
  SX.jsRunner = function (p, code, argsJson) {
    const io = p.io;
    if (io.design) return `${SX.jsHelpers}\n${code}\n${io.design.js(argsJson)}`;
    const names = (io.params || []).map(([n]) => n);
    let lastTree = null;
    const conv = (io.params || []).map(([n, t], i) => {
      const a = `__a[${i}]`;
      if (t === "list") return `const ${n} = __mkList(${a});`;
      if (t === "lists") return `const ${n} = ${a}.map(__mkList);`;
      if (t === "tree") { lastTree = n; return `const ${n} = __mkTree(${a});`; }
      if (t === "node") return `const ${n} = __findNode(${lastTree}, ${a});`;
      if (t === "graph") return `const ${n} = __mkGraph(${a}); const __orig = __graphNodes(${n});`;
      return `let ${n} = ${a};`;
    }).join("\n");
    let tail;
    const callExpr = `${io.fn}(${(io.args || names).join(", ")})`;
    const out = (expr, type) => type === "list" ? `__listJ(${expr})` : type === "tree" ? `__treeJ(${expr})` : type === "graph" ? `__graphJ(${expr}, __orig)` : expr;
    if (io.ret === "void") {
      const tgt = io.inplace || names[0];
      const pt = (io.params.find(([n]) => n === tgt) || [])[1];
      tail = `${callExpr}; return __fmt(${out(tgt, pt)}, ${JSON.stringify(pt)});`;
    } else {
      let r = `const __r = ${callExpr};`;
      if (io.canon === "sort" || io.canon === "deep") r += ` return ${io.canon === "deep" ? "__canonDeep" : "__canonSort"}(${out("__r", io.ret)});`;
      else if (io.ret === "nodeval") r += ` return JSON.stringify(__r ? __r.val : -1);`;
      else r += ` return __fmt(${out("__r", io.ret)}, ${JSON.stringify(io.ret)});`;
      tail = r;
    }
    return `${SX.jsHelpers}\n${code}\n;(function () {\nconst __a = ${argsJson};\n${conv}\n${io.setup ? io.setup.js : ""}\n${tail}\n})()`;
  };

  // order-insensitive canonical form for answers that may legitimately come back in another order
  SX.canonOut = function (p, text) {
    const c = p.io.canon;
    if (c !== "sort" && c !== "deep") return text;
    try {
      let v = JSON.parse(text);
      if (!Array.isArray(v)) return text;
      if (c === "deep") v = v.map((g) => (Array.isArray(g) ? g.map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x)) : g));
      return "[" + v.map((x) => JSON.stringify(x)).sort().join(",") + "]";
    } catch { /* ignore */ }
    return text;
  };

  /* method-style design problems (Trie, MedianFinder …): input = [method names] + [argument lists], like LeetCode.
     spec = { cls, ctor: [types], methods: { name: { args: [types], ret: type|"void" } } }  →  { cpp, js } drivers */
  SX.design = function (spec) {
    const ctorT = spec.ctor || [];
    const get = (t, e) => (t === "list" ? `mkList(${e})` : `Cv<${cppTypeInfo(t)}>::get(${e})`);
    const argList = (types) => types.map((t, i) => get(t, `a.a[${i}]`)).join(", ");
    const lines = [];
    lines.push("int main() {", "    J ops = readJ(), args = readJ();", `    ${spec.cls}* obj = nullptr; J out; out.k = 3;`,
      "    for (size_t i = 0; i < ops.a.size(); i++) {", "        const string& op = ops.a[i].s; const J& a = args.a[i]; (void)a;");
    lines.push(`        if (op == "${spec.cls}") { obj = new ${spec.cls}(${argList(ctorT)}); out.a.push_back(J()); }`);
    for (const [m, d] of Object.entries(spec.methods)) {
      const call = `obj->${m}(${argList(d.args)})`;
      if (d.ret === "void") lines.push(`        else if (op == "${m}") { ${call}; out.a.push_back(J()); }`);
      else lines.push(`        else if (op == "${m}") out.a.push_back(Cv<${cppTypeInfo(d.ret)}>::put(${call}));`);
    }
    lines.push("    }", '    string o; pj(out, o); cout << o << "\\n";', "}");
    const rets = {}; for (const [m, d] of Object.entries(spec.methods)) rets[m] = d.ret;
    const js = (argsJson) => `(function () {
const [__ops, __args] = ${argsJson}; const __rets = ${JSON.stringify(rets)}; let o; const out = [];
for (let i = 0; i < __ops.length; i++) {
  const op = __ops[i], a = __args[i];
  if (op === ${JSON.stringify(spec.cls)}) { o = new ${spec.cls}(...a); out.push("null"); continue; }
  const r = o[op](...a);
  out.push(__rets[op] === "void" ? "null" : __rets[op] === "double" ? __fmt(r, "double") : JSON.stringify(r));
}
return "[" + out.join(",") + "]";
})()`;
    return { cpp: "\n" + lines.join("\n") + "\n", js: (a) => `${js(a)}` };
  };

  /* input object → stdin text / args JSON */
  SX.stdinOf = function (p, input) {
    return (p.io.params || []).map(([n]) => JSON.stringify(input[n])).join("\n") + "\n";
  };
  SX.argsOf = function (p, input) {
    return "[" + (p.io.params || []).map(([n]) => JSON.stringify(input[n])).join(",") + "]";
  };
  SX.inputFromText = function (p, texts) {
    const input = {};
    for (const [n, t] of p.io.params || []) input[n] = parseValue(texts[n], t, n);
    return input;
  };
  SX.textFromInput = function (p, input) {
    const o = {};
    for (const [n] of p.io.params || []) o[n] = JSON.stringify(input[n]);
    return o;
  };
})();
