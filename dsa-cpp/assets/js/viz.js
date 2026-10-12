/* ==========================================================================
   Algorithm visualizers
   In a lesson:   ```viz algo=binary-search
                  arr = 1 3 5 7 9 11 13
                  target = 11
                  ```
   Each algorithm turns its input into a list of frames. The player shows one
   frame at a time: the data views, the current C++ line, variables, and a
   sentence explaining the step.

   frame = { line, msg, vars: {...}, views: [view, ...] }
   view types:
     array  { items:[v|{v,id}], cls:{i:"cmp"}, ptr:{i:["lo"]}, range:[a,b], bars, label, idx }
     grid   { rows:[[v]], cls:{"r,c":"cls"}, rowHead:[], colHead:[], label }
     tree   { nodes:{id:{v,l,r}}, root, cls:{id:"cls"}, label, tags:{id:"txt"} }
     graph  { nodes:[{id,x,y,label}], edges:[[u,v,w]], directed, cls:{id:"cls"}, ecls:{"u-v":"cls"}, tags:{id:"txt"}, label }
     list   { nodes:[{id,v}], next:{id:id|null}, ptr:{id:["curr"]}, cls:{id:"cls"}, label }
     kv     { items:[[k,v]], label }      (small table: hash map, stack contents…)
   classes: cmp (comparing), swap, active, done (final/sorted), found, dim, win (window), pivot, bad
   ========================================================================== */
(function () {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const md = (s) => (window.marked ? window.marked.parseInline(String(s || "")) : esc(s));
  const nums = (s) => String(s).split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => !Number.isNaN(x));
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const randArr = (n, a = 1, b = 40) => Array.from({ length: n }, () => rnd(a, b));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const ALGOS = {};

  /* ======================================================================
     helpers used by the algorithms
     ====================================================================== */
  // keyed items so swaps animate: [{v, id}]
  const keyed = (a) => a.map((v, i) => ({ v, id: "k" + i }));
  const arrView = (items, extra = {}) => Object.assign({ type: "array", items: clone(items) }, extra);
  function Frames() {
    const list = [];
    return { list, add(f) { list.push(clone(f)); } };
  }

  // tree helpers (nodes = {id: {v, l, r}})
  function bstFromValues(vals) {
    const nodes = {};
    let root = null, n = 0;
    for (const v of vals) {
      const id = "n" + n++;
      nodes[id] = { v, l: null, r: null };
      if (root == null) { root = id; continue; }
      let cur = root;
      for (;;) {
        const side = v < nodes[cur].v ? "l" : "r";
        if (nodes[cur][side] == null) { nodes[cur][side] = id; break; }
        cur = nodes[cur][side];
      }
    }
    return { nodes, root };
  }
  // level-order array (null = missing) → nodes
  function treeFromLevel(arr) {
    const nodes = {};
    if (!arr.length || arr[0] == null) return { nodes, root: null };
    const ids = arr.map((v, i) => (v == null ? null : "t" + i));
    ids.forEach((id, i) => { if (id) nodes[id] = { v: arr[i], l: null, r: null }; });
    let q = [ids[0]], i = 1;
    while (q.length && i < arr.length) {
      const nq = [];
      for (const id of q) {
        if (i < arr.length) { nodes[id].l = ids[i]; if (ids[i]) nq.push(ids[i]); i++; }
        if (i < arr.length) { nodes[id].r = ids[i]; if (ids[i]) nq.push(ids[i]); i++; }
      }
      q = nq;
    }
    return { nodes, root: ids[0] };
  }
  const parseTreeList = (s) => String(s).split(/[\s,]+/).filter(Boolean).map((x) => (/^(null|#|-)$/i.test(x) ? null : Number(x)));

  // graph helpers: "A-B:4, B-C:1" → edges
  function parseEdges(s) {
    return String(s).split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean).map((t) => {
      const m = t.match(/^(\w+)\s*(?:-|->|>)\s*(\w+)(?:\s*:\s*(-?\d+))?$/);
      return m ? [m[1], m[2], m[3] != null ? +m[3] : 1] : null;
    }).filter(Boolean);
  }
  // simple circle / layered layout
  function layoutNodes(ids, edges, directed) {
    const n = ids.length;
    // layered layout by BFS depth from first node for nicer pictures
    const adj = Object.fromEntries(ids.map((i) => [i, []]));
    edges.forEach(([u, v]) => { adj[u] && adj[u].push(v); if (!directed && adj[v]) adj[v].push(u); });
    const depth = {};
    const order = [];
    for (const s of ids) {
      if (depth[s] != null) continue;
      depth[s] = 0;
      const q = [s];
      while (q.length) {
        const u = q.shift();
        order.push(u);
        for (const v of adj[u]) if (depth[v] == null) { depth[v] = depth[u] + 1; q.push(v); }
      }
    }
    const maxD = Math.max(0, ...Object.values(depth));
    if (maxD === 0 || n > 12) {
      return ids.map((id, i) => ({ id, label: id, x: 0.5 + 0.42 * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: 0.5 + 0.42 * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) }));
    }
    const byD = {};
    order.forEach((id) => (byD[depth[id]] = byD[depth[id]] || []).push(id));
    const pos = {};
    Object.entries(byD).forEach(([d, list]) => list.forEach((id, i) => {
      pos[id] = { x: (+d + 0.5) / (maxD + 1), y: (i + 0.5) / list.length };
    }));
    return ids.map((id) => ({ id, label: id, x: 0.06 + pos[id].x * 0.88, y: 0.08 + pos[id].y * 0.84 }));
  }
  function graphInput(cfg, directed) {
    const edges = parseEdges(cfg.edges);
    const ids = [];
    edges.forEach(([u, v]) => { if (!ids.includes(u)) ids.push(u); if (!ids.includes(v)) ids.push(v); });
    (cfg.nodes ? String(cfg.nodes).split(/[\s,]+/).filter(Boolean) : []).forEach((x) => { if (!ids.includes(x)) ids.push(x); });
    ids.sort((a, b) => (isNaN(a) || isNaN(b) ? a.localeCompare(b) : a - b));
    return { ids, edges, nodes: layoutNodes(ids, edges, directed) };
  }

  /* ======================================================================
     ALGORITHMS
     ====================================================================== */
  const def = (name, d) => (ALGOS[name] = d);

  /* ---------- searching ---------- */
  def("binary-search", {
    title: "Binary search",
    inputs: [{ key: "arr", label: "Sorted array", value: "2 5 8 12 16 23 38 56 72 91" }, { key: "target", label: "Target", value: "23" }],
    random: () => { const a = [...new Set(randArr(11, 1, 99))].sort((x, y) => x - y); return { arr: a.join(" "), target: String(Math.random() < 0.75 ? a[rnd(0, a.length - 1)] : rnd(1, 99)) }; },
    code: ["int lo = 0, hi = n - 1;", "while (lo <= hi) {", "    int mid = lo + (hi - lo) / 2;", "    if (a[mid] == target) return mid;", "    if (a[mid] < target) lo = mid + 1;", "    else hi = mid - 1;", "}", "return -1;   // not found"],
    run(cfg) {
      const a = nums(cfg.arr).sort((x, y) => x - y), t = +cfg.target, F = Frames();
      let lo = 0, hi = a.length - 1, steps = 0;
      const v = (cls, ptr, range) => arrView(a, { cls, ptr, range, idx: true });
      F.add({ line: 0, msg: `Search for **${t}**. The answer, if it exists, is somewhere in [lo, hi] = [0, ${hi}].`, vars: { lo, hi }, views: [v({}, { [lo]: ["lo"], [hi]: ["hi"] }, [lo, hi])] });
      while (lo <= hi) {
        const mid = lo + Math.floor((hi - lo) / 2); steps++;
        const ptr = {}; [[lo, "lo"], [hi, "hi"], [mid, "mid"]].forEach(([i, n]) => (ptr[i] = ptr[i] || []).push(n));
        F.add({ line: 2, msg: `mid = ${lo} + (${hi} − ${lo}) / 2 = **${mid}**. Look at a[${mid}] = ${a[mid]}.`, vars: { lo, hi, mid, "a[mid]": a[mid], comparisons: steps }, views: [v({ [mid]: "cmp" }, ptr, [lo, hi])] });
        if (a[mid] === t) { F.add({ line: 3, msg: `a[${mid}] == ${t}. **Found** at index ${mid} after ${steps} comparisons. A linear scan would have needed ${mid + 1}.`, vars: { lo, hi, mid, comparisons: steps }, views: [v({ [mid]: "found" }, ptr, [lo, hi])] }); return F.list; }
        if (a[mid] < t) { lo = mid + 1; F.add({ line: 4, msg: `${a[mid]} < ${t}, so the target can't be at mid or to its left. Discard the left half: lo = ${lo}.`, vars: { lo, hi, mid, comparisons: steps }, views: [v({ [mid]: "bad" }, { [lo]: ["lo"], [hi]: ["hi"] }, [lo, hi])] }); }
        else { hi = mid - 1; F.add({ line: 5, msg: `${a[mid]} > ${t}, so the target can't be at mid or to its right. Discard the right half: hi = ${hi}.`, vars: { lo, hi, mid, comparisons: steps }, views: [v({ [mid]: "bad" }, { [lo]: ["lo"], [hi]: ["hi"] }, [lo, hi])] }); }
      }
      F.add({ line: 7, msg: `lo (${lo}) > hi (${hi}). The range is empty, so **${t} is not in the array**. Also, lo = ${lo} is exactly where ${t} *would be inserted* (this is what lower_bound returns).`, vars: { lo, hi, comparisons: steps }, views: [v({}, { [Math.min(lo, a.length - 1)]: ["lo"] }, null)] });
      return F.list;
    },
  });

  def("two-pointers", {
    title: "Two pointers: pair with target sum (sorted array)",
    inputs: [{ key: "arr", label: "Sorted array", value: "1 3 4 6 8 11 14 17" }, { key: "target", label: "Target sum", value: "20" }],
    random: () => { const a = [...new Set(randArr(9, 1, 30))].sort((x, y) => x - y); return { arr: a.join(" "), target: String(a[rnd(0, 3)] + a[rnd(4, a.length - 1)]) }; },
    code: ["int l = 0, r = n - 1;", "while (l < r) {", "    int sum = a[l] + a[r];", "    if (sum == target) return {l, r};", "    if (sum < target) l++;   // need bigger", "    else r--;                // need smaller", "}", "return {-1, -1};"],
    run(cfg) {
      const a = nums(cfg.arr).sort((x, y) => x - y), t = +cfg.target, F = Frames();
      let l = 0, r = a.length - 1;
      const v = (cls) => arrView(a, { cls, ptr: l === r ? { [l]: ["l", "r"] } : { [l]: ["l"], [r]: ["r"] }, range: [l, r], idx: true });
      F.add({ line: 0, msg: "Start with the smallest (l) and the largest (r) values.", vars: { l, r }, views: [v({})] });
      while (l < r) {
        const s = a[l] + a[r];
        F.add({ line: 2, msg: `sum = a[${l}] + a[${r}] = ${a[l]} + ${a[r]} = **${s}**`, vars: { l, r, sum: s, target: t }, views: [v({ [l]: "cmp", [r]: "cmp" })] });
        if (s === t) { F.add({ line: 3, msg: `${s} == ${t}. **Found the pair** (${a[l]}, ${a[r]}).`, vars: { l, r, sum: s }, views: [v({ [l]: "found", [r]: "found" })] }); return F.list; }
        if (s < t) { F.add({ line: 4, msg: `${s} < ${t}. a[l] = ${a[l]} is too small even with the biggest partner, so it can't be in any answer. Move l right.`, vars: { l, r, sum: s }, views: [v({ [l]: "bad" })] }); l++; }
        else { F.add({ line: 5, msg: `${s} > ${t}. a[r] = ${a[r]} is too big even with the smallest partner, so it can't be in any answer. Move r left.`, vars: { l, r, sum: s }, views: [v({ [r]: "bad" })] }); r--; }
      }
      F.add({ line: 7, msg: "The pointers met: **no pair** adds up to the target. Each step removed one element, so there were at most n − 1 steps: **O(n)**.", vars: { l, r }, views: [v({})] });
      return F.list;
    },
  });

  def("sliding-window", {
    title: "Sliding window: longest substring without repeating characters",
    inputs: [{ key: "s", label: "String", value: "abcabcbbxyz" }],
    random: () => ({ s: Array.from({ length: 12 }, () => "abcdef"[rnd(0, 5)]).join("") }),
    code: ["unordered_map<char,int> last;   // char -> last index", "int best = 0, L = 0;", "for (int R = 0; R < n; R++) {", "    if (last.count(s[R]) && last[s[R]] >= L)", "        L = last[s[R]] + 1;      // jump past the repeat", "    last[s[R]] = R;", "    best = max(best, R - L + 1);", "}"],
    run(cfg) {
      const s = String(cfg.s || "").slice(0, 18).split(""), F = Frames();
      const last = {}; let best = 0, L = 0, bestL = 0, bestR = -1;
      const v = (R, cls = {}) => arrView(s, { cls: Object.assign(Object.fromEntries(s.map((_, i) => [i, i >= L && i <= R ? "win" : ""])), cls), ptr: L === R ? { [L]: ["L", "R"] } : { [L]: ["L"], [R]: ["R"] }, idx: true });
      const kv = () => ({ type: "kv", label: "last seen index", items: Object.entries(last) });
      F.add({ line: 1, msg: "The window s[L..R] always holds **distinct** characters. R grows the window, L shrinks it.", vars: { L, best }, views: [arrView(s, { idx: true }), kv()] });
      for (let R = 0; R < s.length; R++) {
        const c = s[R];
        if (last[c] != null && last[c] >= L) {
          F.add({ line: 3, msg: `'${c}' is already in the window (index ${last[c]}). The window must start after it.`, vars: { L, R, best }, views: [v(R, { [R]: "bad", [last[c]]: "bad" }), kv()] });
          L = last[c] + 1;
          F.add({ line: 4, msg: `L jumps to ${L}. L never moves left, so the whole scan is **O(n)**.`, vars: { L, R, best }, views: [v(R), kv()] });
        }
        last[c] = R;
        if (R - L + 1 > best) { best = R - L + 1; bestL = L; bestR = R; }
        F.add({ line: 6, msg: `Window "${s.slice(L, R + 1).join("")}" has length ${R - L + 1}. Best so far: **${best}**.`, vars: { L, R, best }, views: [v(R, { [R]: "cmp" }), kv()] });
      }
      F.add({ line: 7, msg: `Done. The longest substring without repeats is "${s.slice(bestL, bestR + 1).join("")}" (length **${best}**).`, vars: { best }, views: [arrView(s, { cls: Object.fromEntries(s.map((_, i) => [i, i >= bestL && i <= bestR ? "found" : "dim"])), idx: true }), kv()] });
      return F.list;
    },
  });

  def("kadane", {
    title: "Kadane's algorithm: maximum subarray sum",
    inputs: [{ key: "arr", label: "Array", value: "-2 1 -3 4 -1 2 1 -5 4" }],
    random: () => ({ arr: randArr(10, -9, 9).join(" ") }),
    code: ["int cur = a[0], best = a[0];", "for (int i = 1; i < n; i++) {", "    // extend the previous run, or start fresh at i", "    cur = max(a[i], cur + a[i]);", "    best = max(best, cur);", "}"],
    run(cfg) {
      const a = nums(cfg.arr), F = Frames();
      let cur = a[0], best = a[0], start = 0, bs = 0, be = 0;
      const v = (i, extra = {}) => arrView(a, { cls: Object.assign(Object.fromEntries(a.map((_, k) => [k, k >= start && k <= i ? "win" : ""])), extra), ptr: { [i]: ["i"] }, idx: true });
      F.add({ line: 0, msg: "cur = best sum of a subarray that **ends at i**. best = best seen anywhere.", vars: { cur, best }, views: [v(0)] });
      for (let i = 1; i < a.length; i++) {
        const ext = cur + a[i];
        if (a[i] > ext) { start = i; F.add({ line: 3, msg: `Extending gives ${cur} + ${a[i]} = ${ext}, starting fresh gives ${a[i]}. The previous run only hurts, so **restart** at i = ${i}.`, vars: { i, cur: a[i], best }, views: [v(i, { [i]: "cmp" })] }); cur = a[i]; }
        else { F.add({ line: 3, msg: `Extend: cur = ${cur} + ${a[i]} = **${ext}** (beats starting fresh with ${a[i]}).`, vars: { i, cur: ext, best }, views: [v(i, { [i]: "cmp" })] }); cur = ext; }
        if (cur > best) { best = cur; bs = start; be = i; F.add({ line: 4, msg: `New best = **${best}** (subarray [${bs}..${be}]).`, vars: { i, cur, best }, views: [v(i, { [i]: "found" })] }); }
      }
      F.add({ line: 5, msg: `Maximum subarray sum = **${best}**, from index ${bs} to ${be}. One pass: O(n) time, O(1) space.`, vars: { best }, views: [arrView(a, { cls: Object.fromEntries(a.map((_, k) => [k, k >= bs && k <= be ? "found" : "dim"])), idx: true })] });
      return F.list;
    },
  });

  def("prefix-sum", {
    title: "Prefix sums: O(1) range-sum queries",
    inputs: [{ key: "arr", label: "Array", value: "3 1 4 1 5 9 2 6" }, { key: "query", label: "Query l r (0-based, inclusive)", value: "2 5" }],
    random: () => { const a = randArr(8, 0, 9); const l = rnd(0, 5); return { arr: a.join(" "), query: `${l} ${rnd(l, 7)}` }; },
    code: ["vector<long long> P(n + 1, 0);   // P[i] = a[0] + … + a[i-1]", "for (int i = 0; i < n; i++)", "    P[i + 1] = P[i] + a[i];", "", "// sum of a[l..r] in O(1):", "long long sum = P[r + 1] - P[l];"],
    run(cfg) {
      const a = nums(cfg.arr), [l, r] = nums(cfg.query), F = Frames();
      const P = [0];
      F.add({ line: 0, msg: "P has n + 1 entries. P[0] = 0 is the sum of the empty prefix.", vars: {}, views: [arrView(a, { label: "a", idx: true }), arrView(P, { label: "P", idx: true })] });
      for (let i = 0; i < a.length; i++) {
        P.push(P[i] + a[i]);
        F.add({ line: 2, msg: `P[${i + 1}] = P[${i}] + a[${i}] = ${P[i]} + ${a[i]} = **${P[i + 1]}**`, vars: { i }, views: [arrView(a, { label: "a", cls: { [i]: "cmp" }, idx: true }), arrView(P, { label: "P", cls: { [i]: "cmp", [i + 1]: "found" }, idx: true })] });
      }
      if (l >= 0 && r < a.length && l <= r) {
        const cls = Object.fromEntries(a.map((_, k) => [k, k >= l && k <= r ? "win" : ""]));
        F.add({ line: 5, msg: `sum(a[${l}..${r}]) = P[${r + 1}] − P[${l}] = ${P[r + 1]} − ${P[l]} = **${P[r + 1] - P[l]}**. Two lookups, not ${r - l + 1} additions.`, vars: { l, r, sum: P[r + 1] - P[l] }, views: [arrView(a, { label: "a", cls, idx: true }), arrView(P, { label: "P", cls: { [r + 1]: "found", [l]: "bad" }, idx: true })] });
      }
      return F.list;
    },
  });

  /* ---------- sorting ---------- */
  const sortInputs = [{ key: "arr", label: "Array (≤ 16 numbers)", value: "29 10 14 37 13 5 42 21 8" }];
  const sortRandom = () => ({ arr: randArr(10, 2, 50).join(" ") });
  const bars = (items, cls, extra = {}) => arrView(items, Object.assign({ cls, bars: true }, extra));

  def("bubble-sort", {
    title: "Bubble sort", inputs: sortInputs, random: sortRandom,
    code: ["for (int i = 0; i < n - 1; i++) {", "    bool swapped = false;", "    for (int j = 0; j < n - 1 - i; j++)", "        if (a[j] > a[j + 1]) {", "            swap(a[j], a[j + 1]); swapped = true;", "        }", "    if (!swapped) break;   // already sorted: best case O(n)", "}"],
    run(cfg) {
      const a = keyed(nums(cfg.arr).slice(0, 16)), n = a.length, F = Frames();
      const done = new Set(); let cmp = 0, sw = 0;
      const cl = (x = {}) => Object.assign(Object.fromEntries([...done].map((k) => [k, "done"])), x);
      F.add({ line: 0, msg: "Each pass bubbles the largest remaining value to the end.", vars: { comparisons: 0, swaps: 0 }, views: [bars(a, cl())] });
      for (let i = 0; i < n - 1; i++) {
        let swapped = false;
        for (let j = 0; j < n - 1 - i; j++) {
          cmp++;
          F.add({ line: 3, msg: `Compare a[${j}] = ${a[j].v} and a[${j + 1}] = ${a[j + 1].v}.`, vars: { i, j, comparisons: cmp, swaps: sw }, views: [bars(a, cl({ [j]: "cmp", [j + 1]: "cmp" }), { ptr: { [j]: ["j"] } })] });
          if (a[j].v > a[j + 1].v) { [a[j], a[j + 1]] = [a[j + 1], a[j]]; sw++; swapped = true; F.add({ line: 4, msg: "Out of order, so swap.", vars: { i, j, comparisons: cmp, swaps: sw }, views: [bars(a, cl({ [j]: "swap", [j + 1]: "swap" }))] }); }
        }
        done.add(n - 1 - i);
        if (!swapped) { for (let k = 0; k < n; k++) done.add(k); F.add({ line: 6, msg: "No swaps in this pass, so the array is sorted. Stop early.", vars: { comparisons: cmp, swaps: sw }, views: [bars(a, cl())] }); return F.list; }
        F.add({ line: 0, msg: `Pass ${i + 1} done: position ${n - 1 - i} holds its final value.`, vars: { i, comparisons: cmp, swaps: sw }, views: [bars(a, cl())] });
      }
      done.add(0);
      F.add({ line: 7, msg: `Sorted with ${cmp} comparisons and ${sw} swaps. Worst case n(n−1)/2 = ${(n * (n - 1)) / 2} comparisons: **O(n²)**.`, vars: { comparisons: cmp, swaps: sw }, views: [bars(a, cl())] });
      return F.list;
    },
  });

  def("selection-sort", {
    title: "Selection sort", inputs: sortInputs, random: sortRandom,
    code: ["for (int i = 0; i < n - 1; i++) {", "    int mn = i;", "    for (int j = i + 1; j < n; j++)", "        if (a[j] < a[mn]) mn = j;", "    swap(a[i], a[mn]);   // put the minimum in place", "}"],
    run(cfg) {
      const a = keyed(nums(cfg.arr).slice(0, 16)), n = a.length, F = Frames(); let cmp = 0;
      const cl = (i, x = {}) => Object.assign(Object.fromEntries(a.map((_, k) => [k, k < i ? "done" : ""])), x);
      for (let i = 0; i < n - 1; i++) {
        let mn = i;
        F.add({ line: 1, msg: `Find the smallest value in a[${i}..${n - 1}]. Start with mn = ${i}.`, vars: { i, mn, comparisons: cmp }, views: [bars(a, cl(i, { [i]: "pivot" }), { ptr: { [i]: ["i"] } })] });
        for (let j = i + 1; j < n; j++) {
          cmp++;
          const better = a[j].v < a[mn].v;
          F.add({ line: 3, msg: `a[${j}] = ${a[j].v} ${better ? "<" : "≥"} a[mn] = ${a[mn].v}${better ? `, so mn = ${j}` : ""}.`, vars: { i, j, mn: better ? j : mn, comparisons: cmp }, views: [bars(a, cl(i, { [mn]: "pivot", [j]: "cmp" }), { ptr: { [i]: ["i"], [j]: ["j"] } })] });
          if (better) mn = j;
        }
        [a[i], a[mn]] = [a[mn], a[i]];
        F.add({ line: 4, msg: `Swap the minimum (${a[i].v}) into position ${i}.`, vars: { i, mn, comparisons: cmp }, views: [bars(a, cl(i, { [i]: "swap", [mn]: "swap" }))] });
      }
      F.add({ line: 5, msg: `Sorted. Always n(n−1)/2 = ${cmp} comparisons, even on sorted input, but at most n − 1 swaps.`, vars: { comparisons: cmp }, views: [bars(a, cl(n))] });
      return F.list;
    },
  });

  def("insertion-sort", {
    title: "Insertion sort", inputs: sortInputs, random: sortRandom,
    code: ["for (int i = 1; i < n; i++) {", "    int key = a[i], j = i - 1;", "    while (j >= 0 && a[j] > key) {", "        a[j + 1] = a[j];   // shift right", "        j--;", "    }", "    a[j + 1] = key;", "}"],
    run(cfg) {
      const a = keyed(nums(cfg.arr).slice(0, 16)), n = a.length, F = Frames(); let shifts = 0;
      const cl = (i, x = {}) => Object.assign(Object.fromEntries(a.map((_, k) => [k, k <= i ? "done" : ""])), x);
      F.add({ line: 0, msg: "The left part a[0..i−1] is always sorted. Insert a[i] into it, like sorting playing cards in your hand.", vars: {}, views: [bars(a, cl(0))] });
      for (let i = 1; i < n; i++) {
        let j = i;
        F.add({ line: 1, msg: `key = a[${i}] = ${a[i].v}. Walk it left past every bigger value.`, vars: { i, key: a[i].v, shifts }, views: [bars(a, cl(i - 1, { [i]: "pivot" }), { ptr: { [i]: ["key"] } })] });
        while (j > 0 && a[j - 1].v > a[j].v) {
          [a[j - 1], a[j]] = [a[j], a[j - 1]]; shifts++; j--;
          F.add({ line: 3, msg: `${a[j + 1].v} > ${a[j].v}, so shift ${a[j + 1].v} one place right.`, vars: { i, j, shifts }, views: [bars(a, cl(i, { [j]: "pivot", [j + 1]: "swap" }))] });
        }
        F.add({ line: 6, msg: `${a[j].v} is in place at index ${j}. a[0..${i}] is sorted.`, vars: { i, shifts }, views: [bars(a, cl(i, { [j]: "found" }))] });
      }
      F.add({ line: 7, msg: `Sorted with ${shifts} shifts. Shifts = number of **inversions**, which is 0 for sorted input (O(n)) and n(n−1)/2 for reversed input (O(n²)).`, vars: { shifts }, views: [bars(a, cl(n))] });
      return F.list;
    },
  });

  def("merge-sort", {
    title: "Merge sort", inputs: sortInputs, random: sortRandom,
    code: ["void mergeSort(vector<int>& a, int l, int r) {", "    if (l >= r) return;                 // 0 or 1 element", "    int m = (l + r) / 2;", "    mergeSort(a, l, m); mergeSort(a, m + 1, r);", "    // merge the sorted halves a[l..m] and a[m+1..r]", "    vector<int> tmp; int i = l, j = m + 1;", "    while (i <= m && j <= r) tmp.push_back(a[i] <= a[j] ? a[i++] : a[j++]);", "    /* copy leftovers, then tmp back into a[l..r] */", "}"],
    run(cfg) {
      const a = keyed(nums(cfg.arr).slice(0, 16)), n = a.length, F = Frames(); let depth = 0;
      const range = (l, r, x = {}) => Object.assign(Object.fromEntries(a.map((_, k) => [k, k >= l && k <= r ? "win" : "dim"])), x);
      function ms(l, r) {
        if (l >= r) { F.add({ line: 1, msg: `[${l}..${r}] has one element, so it is already sorted.`, vars: { l, r, depth }, views: [bars(a, range(l, r, { [l]: "done" }))] }); return; }
        const m = (l + r) >> 1;
        F.add({ line: 2, msg: `Split [${l}..${r}] into [${l}..${m}] and [${m + 1}..${r}].`, vars: { l, m, r, depth }, views: [bars(a, range(l, r), { ptr: { [l]: ["l"], [m]: ["m"], [r]: ["r"] } })] });
        depth++; ms(l, m); ms(m + 1, r); depth--;
        const left = a.slice(l, m + 1), right = a.slice(m + 1, r + 1), out = [];
        let i = 0, j = 0;
        while (i < left.length && j < right.length) {
          const takeL = left[i].v <= right[j].v;
          F.add({ line: 6, msg: `Compare ${left[i].v} and ${right[j].v}: take **${takeL ? left[i].v : right[j].v}**${takeL && left[i].v === right[j].v ? " (left first on ties, which keeps it stable)" : ""}.`, vars: { l, m, r, depth }, views: [bars(a, range(l, r, { [l + i]: "cmp", [m + 1 + j]: "cmp" })), arrView(out.map((x) => x.v).concat([]), { label: "tmp" })] });
          out.push(takeL ? left[i++] : right[j++]);
        }
        while (i < left.length) out.push(left[i++]);
        while (j < right.length) out.push(right[j++]);
        for (let k = 0; k < out.length; k++) a[l + k] = out[k];
        F.add({ line: 7, msg: `Merged: [${l}..${r}] is now sorted. Merging costs O(r − l + 1).`, vars: { l, r, depth }, views: [bars(a, range(l, r, Object.fromEntries(out.map((_, k) => [l + k, "found"]))))] });
      }
      ms(0, n - 1);
      F.add({ line: 8, msg: "Sorted. There are log₂n levels of splitting and each level does O(n) merge work, so **O(n log n)** time and O(n) extra space.", vars: {}, views: [bars(a, Object.fromEntries(a.map((_, k) => [k, "done"])))] });
      return F.list;
    },
  });

  def("quick-sort", {
    title: "Quick sort (Lomuto partition)", inputs: sortInputs, random: sortRandom,
    code: ["int partition(vector<int>& a, int lo, int hi) {", "    int pivot = a[hi], i = lo;          // a[lo..i-1] < pivot", "    for (int j = lo; j < hi; j++)", "        if (a[j] < pivot) swap(a[i++], a[j]);", "    swap(a[i], a[hi]);                  // pivot to its final place", "    return i;", "}", "void quickSort(a, lo, hi) { if (lo < hi) { int p = partition(a, lo, hi);", "    quickSort(a, lo, p - 1); quickSort(a, p + 1, hi); } }"],
    run(cfg) {
      const a = keyed(nums(cfg.arr).slice(0, 16)), n = a.length, F = Frames();
      const fixed = new Set();
      const cl = (lo, hi, x = {}) => Object.assign(Object.fromEntries(a.map((_, k) => [k, fixed.has(k) ? "done" : k >= lo && k <= hi ? "" : "dim"])), x);
      function qs(lo, hi) {
        if (lo > hi) return;
        if (lo === hi) { fixed.add(lo); F.add({ line: 7, msg: `[${lo}..${hi}] has one element, so it is in place.`, vars: { lo, hi }, views: [bars(a, cl(lo, hi))] }); return; }
        const pv = a[hi].v; let i = lo;
        F.add({ line: 1, msg: `Partition [${lo}..${hi}] around pivot **${pv}** (the last element).`, vars: { lo, hi, pivot: pv, i }, views: [bars(a, cl(lo, hi, { [hi]: "pivot" }), { ptr: { [lo]: ["i"] } })] });
        for (let j = lo; j < hi; j++) {
          const small = a[j].v < pv;
          F.add({ line: 3, msg: `a[${j}] = ${a[j].v} ${small ? "< pivot, so swap it into the \"small\" zone" : "≥ pivot, so leave it"}.`, vars: { lo, hi, pivot: pv, i, j }, views: [bars(a, cl(lo, hi, Object.assign(Object.fromEntries(Array.from({ length: i - lo }, (_, k) => [lo + k, "win"])), { [hi]: "pivot", [j]: "cmp" })), { ptr: i === j ? { [i]: ["i", "j"] } : { [i]: ["i"], [j]: ["j"] } })] });
          if (small) { [a[i], a[j]] = [a[j], a[i]]; i++; }
        }
        [a[i], a[hi]] = [a[hi], a[i]]; fixed.add(i);
        F.add({ line: 4, msg: `Pivot ${pv} goes to index ${i}. Everything left of it is smaller and everything right is ≥, so it never moves again.`, vars: { lo, hi, p: i }, views: [bars(a, cl(lo, hi, { [i]: "found" }))] });
        qs(lo, i - 1); qs(i + 1, hi);
      }
      qs(0, n - 1);
      F.add({ line: 8, msg: "Sorted. Balanced splits give O(n log n). Always picking the min or max as pivot (like on sorted input here) gives **O(n²)**, which is why real code uses a random pivot.", vars: {}, views: [bars(a, Object.fromEntries(a.map((_, k) => [k, "done"])))] });
      return F.list;
    },
  });

  // heap helpers: array (0-based) shown as a tree too
  function heapTree(arr, cls = {}, size = arr.length) {
    const nodes = {};
    arr.forEach((x, i) => { if (i < size) nodes["h" + x.id] = { v: x.v, l: 2 * i + 1 < size ? "h" + arr[2 * i + 1].id : null, r: 2 * i + 2 < size ? "h" + arr[2 * i + 2].id : null }; });
    const tcls = {};
    Object.entries(cls).forEach(([i, c]) => { if (+i < size) tcls["h" + arr[+i].id] = c; });
    return { type: "tree", nodes, root: size ? "h" + arr[0].id : null, cls: tcls };
  }

  def("heap-sort", {
    title: "Heap sort", inputs: sortInputs, random: sortRandom,
    code: ["void siftDown(vector<int>& a, int i, int n) {", "    while (2 * i + 1 < n) {", "        int c = 2 * i + 1;                       // left child", "        if (c + 1 < n && a[c + 1] > a[c]) c++;   // bigger child", "        if (a[i] >= a[c]) break;", "        swap(a[i], a[c]); i = c;", "    } }", "for (int i = n / 2 - 1; i >= 0; i--) siftDown(a, i, n);   // build max-heap O(n)", "for (int end = n - 1; end > 0; end--) { swap(a[0], a[end]); siftDown(a, 0, end); }"],
    run(cfg) {
      const a = keyed(nums(cfg.arr).slice(0, 15)), n = a.length, F = Frames();
      const done = new Set();
      const cl = (x = {}) => Object.assign(Object.fromEntries([...done].map((k) => [k, "done"])), x);
      const show = (size, x, msg, line, vars = {}) => F.add({ line, msg, vars, views: [heapTree(a, x, size), arrView(a, { cls: cl(x), idx: true })] });
      function sift(i, size) {
        while (2 * i + 1 < size) {
          let c = 2 * i + 1;
          if (c + 1 < size && a[c + 1].v > a[c].v) c++;
          if (a[i].v >= a[c].v) { show(size, { [i]: "found" }, `${a[i].v} ≥ its bigger child ${a[c].v}, so the heap property holds here.`, 4, { i, size }); return; }
          show(size, { [i]: "cmp", [c]: "cmp" }, `${a[i].v} < child ${a[c].v}, so swap them (sift down).`, 5, { i, child: c, size });
          [a[i], a[c]] = [a[c], a[i]]; i = c;
        }
      }
      show(n, {}, "Read the array as a complete binary tree: the children of i are 2i+1 and 2i+2.", 7);
      for (let i = (n >> 1) - 1; i >= 0; i--) { show(n, { [i]: "pivot" }, `Build heap: sift down index ${i} (value ${a[i].v}).`, 7, { i }); sift(i, n); }
      show(n, { 0: "found" }, `It's now a **max-heap**: every parent ≥ its children, so the maximum (${a[0].v}) is at the root.`, 7);
      for (let end = n - 1; end > 0; end--) {
        [a[0], a[end]] = [a[end], a[0]]; done.add(end);
        show(end, {}, `Swap the max (${a[end].v}) to index ${end}, its final place. The heap shrinks to size ${end}.`, 8, { end });
        sift(0, end);
      }
      done.add(0);
      show(0, {}, "Sorted in place: O(n) to build the heap + n × O(log n) sifts = **O(n log n)**, O(1) extra space. It is not stable.", 8);
      return F.list;
    },
  });

  def("counting-sort", {
    title: "Counting sort", inputs: [{ key: "arr", label: "Small non-negative integers (0–9)", value: "4 2 2 8 3 3 1 7 4 2" }], random: () => ({ arr: randArr(11, 0, 9).join(" ") }),
    code: ["int K = *max_element(a.begin(), a.end()) + 1;", "vector<int> cnt(K, 0);", "for (int x : a) cnt[x]++;                  // O(n)", "int pos = 0;", "for (int v = 0; v < K; v++)                // O(K)", "    while (cnt[v]--) a[pos++] = v;"],
    run(cfg) {
      const a = nums(cfg.arr).map((x) => Math.max(0, Math.min(20, Math.floor(x)))).slice(0, 16), F = Frames();
      const K = Math.max(...a) + 1, cnt = Array(K).fill(0);
      F.add({ line: 1, msg: `Values are in [0, ${K - 1}], so make ${K} counters. No comparisons at all!`, vars: { K }, views: [arrView(a, { label: "a", idx: true }), arrView(cnt, { label: "cnt", idx: true })] });
      a.forEach((x, i) => { cnt[x]++; F.add({ line: 2, msg: `a[${i}] = ${x}, so cnt[${x}]++ → ${cnt[x]}`, vars: { i }, views: [arrView(a, { label: "a", cls: { [i]: "cmp" }, idx: true }), arrView(cnt, { label: "cnt", cls: { [x]: "found" }, idx: true })] }); });
      const out = []; const c2 = cnt.slice();
      for (let v = 0; v < K; v++) while (c2[v] > 0) { c2[v]--; out.push(v); F.add({ line: 5, msg: `Write ${v} (${cnt[v] - c2[v]} of ${cnt[v]}).`, vars: { v }, views: [arrView(out, { label: "output", cls: { [out.length - 1]: "found" }, idx: true }), arrView(c2, { label: "cnt left", cls: { [v]: "cmp" }, idx: true })] }); }
      F.add({ line: 5, msg: `Sorted in **O(n + K)**. That beats the Ω(n log n) bound for comparison sorts, but only works when K (the value range) is small.`, vars: {}, views: [arrView(out, { label: "output", cls: Object.fromEntries(out.map((_, i) => [i, "done"])), idx: true })] });
      return F.list;
    },
  });

  def("dutch-flag", {
    title: "Dutch national flag (sort 0s, 1s, 2s in one pass)",
    inputs: [{ key: "arr", label: "Array of 0, 1, 2", value: "2 0 2 1 1 0 1 2 0 0" }], random: () => ({ arr: randArr(11, 0, 2).join(" ") }),
    code: ["int lo = 0, mid = 0, hi = n - 1;", "// a[0..lo-1]=0, a[lo..mid-1]=1, a[mid..hi]=unknown, a[hi+1..]=2", "while (mid <= hi) {", "    if (a[mid] == 0) swap(a[lo++], a[mid++]);", "    else if (a[mid] == 1) mid++;", "    else swap(a[mid], a[hi--]);   // don't move mid: new a[mid] unseen", "}"],
    run(cfg) {
      const a = keyed(nums(cfg.arr).map((x) => Math.max(0, Math.min(2, x)))), F = Frames();
      let lo = 0, mid = 0, hi = a.length - 1;
      const v = (x = {}) => arrView(a, { cls: Object.assign(Object.fromEntries(a.map((e, k) => [k, k < lo ? "c0" : k < mid ? "c1" : k > hi ? "c2" : ""])), x), ptr: (() => { const p = {}; [[lo, "lo"], [mid, "mid"], [hi, "hi"]].forEach(([i, nm]) => { if (i >= 0 && i < a.length) (p[i] = p[i] || []).push(nm); }); return p; })(), idx: true });
      F.add({ line: 1, msg: "Four zones: 0s | 1s | unknown | 2s. Each step shrinks the unknown zone by one.", vars: { lo, mid, hi }, views: [v()] });
      while (mid <= hi) {
        const x = a[mid].v;
        if (x === 0) { F.add({ line: 3, msg: "a[mid] = 0: swap it into the 0-zone. lo++, mid++.", vars: { lo, mid, hi }, views: [v({ [mid]: "cmp", [lo]: "cmp" })] }); [a[lo], a[mid]] = [a[mid], a[lo]]; lo++; mid++; }
        else if (x === 1) { F.add({ line: 4, msg: "a[mid] = 1: it's already in the right zone. mid++.", vars: { lo, mid, hi }, views: [v({ [mid]: "cmp" })] }); mid++; }
        else { F.add({ line: 5, msg: "a[mid] = 2: swap it to the end. hi--. mid stays, because the value we swapped in hasn't been checked yet.", vars: { lo, mid, hi }, views: [v({ [mid]: "cmp", [hi]: "cmp" })] }); [a[mid], a[hi]] = [a[hi], a[mid]]; hi--; }
      }
      F.add({ line: 6, msg: "Sorted in one pass: **O(n)** time, O(1) space.", vars: { lo, mid, hi }, views: [v()] });
      return F.list;
    },
  });

  /* ---------- stacks & queues ---------- */
  def("monotonic-stack", {
    title: "Monotonic stack: next greater element",
    inputs: [{ key: "arr", label: "Array", value: "2 1 2 4 3 1 5 0" }], random: () => ({ arr: randArr(9, 1, 9).join(" ") }),
    code: ["vector<int> ans(n, -1);", "stack<int> st;               // indices; their values decrease bottom→top", "for (int i = 0; i < n; i++) {", "    while (!st.empty() && a[st.top()] < a[i]) {", "        ans[st.top()] = a[i];    // a[i] is the next greater for top", "        st.pop();", "    }", "    st.push(i);", "}"],
    run(cfg) {
      const a = nums(cfg.arr).slice(0, 14), n = a.length, ans = Array(n).fill(-1), st = [], F = Frames();
      const v = (x = {}, i) => [arrView(a, { label: "a", cls: Object.assign(Object.fromEntries(st.map((k) => [k, "win"])), x), ptr: i != null ? { [i]: ["i"] } : {}, idx: true }), arrView(st.map((k) => `${a[k]}`), { label: "stack (bottom → top)" }), arrView(ans, { label: "ans", idx: true })];
      F.add({ line: 1, msg: "The stack holds indices still **waiting** for a bigger value. Their values decrease from bottom to top.", vars: {}, views: v() });
      for (let i = 0; i < n; i++) {
        F.add({ line: 2, msg: `Look at a[${i}] = ${a[i]}.`, vars: { i }, views: v({ [i]: "cmp" }, i) });
        while (st.length && a[st[st.length - 1]] < a[i]) {
          const t = st.pop(); ans[t] = a[i];
          F.add({ line: 4, msg: `${a[i]} > ${a[t]}, so the next greater element of index ${t} is **${a[i]}**. Pop it.`, vars: { i, popped: t }, views: v({ [i]: "cmp", [t]: "found" }, i) });
        }
        st.push(i);
        F.add({ line: 7, msg: `Push index ${i}. It now waits for something bigger than ${a[i]}.`, vars: { i }, views: v({}, i) });
      }
      F.add({ line: 8, msg: "Indices left on the stack have no greater element (-1). Each index is pushed once and popped at most once, so the total is **O(n)** even with the inner while loop.", vars: {}, views: v() });
      return F.list;
    },
  });

  def("sliding-window-max", {
    title: "Monotonic deque: sliding window maximum",
    inputs: [{ key: "arr", label: "Array", value: "1 3 -1 -3 5 3 6 7" }, { key: "k", label: "Window size k", value: "3" }],
    random: () => ({ arr: randArr(10, -5, 9).join(" "), k: String(rnd(2, 4)) }),
    code: ["deque<int> dq;                 // indices, values decreasing front→back", "for (int i = 0; i < n; i++) {", "    if (!dq.empty() && dq.front() <= i - k) dq.pop_front();   // left the window", "    while (!dq.empty() && a[dq.back()] <= a[i]) dq.pop_back(); // can never be max", "    dq.push_back(i);", "    if (i >= k - 1) out.push_back(a[dq.front()]);", "}"],
    run(cfg) {
      const a = nums(cfg.arr).slice(0, 14), k = Math.max(1, +cfg.k || 3), dq = [], out = [], F = Frames();
      const v = (i, x = {}) => [arrView(a, { label: "a", cls: Object.assign(Object.fromEntries(a.map((_, j) => [j, j > i - k && j <= i ? "win" : ""])), x), ptr: { [i]: ["i"] }, idx: true }), arrView(dq.map((j) => `${a[j]} @${j}`), { label: "deque (front → back)" }), arrView(out, { label: "max of each window" })];
      for (let i = 0; i < a.length; i++) {
        if (dq.length && dq[0] <= i - k) { const g = dq.shift(); F.add({ line: 2, msg: `Index ${g} has slid out of the window, so pop it from the front.`, vars: { i }, views: v(i, { [g]: "bad" }) }); }
        while (dq.length && a[dq[dq.length - 1]] <= a[i]) { const g = dq.pop(); F.add({ line: 3, msg: `a[${g}] = ${a[g]} ≤ a[${i}] = ${a[i]}. ${a[g]} is older *and* not bigger, so it can never be a window max again. Drop it.`, vars: { i }, views: v(i, { [g]: "bad", [i]: "cmp" }) }); }
        dq.push(i);
        if (i >= k - 1) { out.push(a[dq[0]]); F.add({ line: 5, msg: `Window [${i - k + 1}..${i}]: the max is at the front = **${a[dq[0]]}**.`, vars: { i }, views: v(i, { [dq[0]]: "found" }) }); }
        else F.add({ line: 4, msg: `Push index ${i}. The window isn't full yet.`, vars: { i }, views: v(i) });
      }
      F.add({ line: 6, msg: "Each index enters and leaves the deque at most once, so this is **O(n)**, not O(nk).", vars: {}, views: [arrView(a, { label: "a", idx: true }), arrView(out, { label: "answer" })] });
      return F.list;
    },
  });

  /* ---------- linked lists ---------- */
  def("reverse-list", {
    title: "Reverse a linked list (iterative)",
    inputs: [{ key: "list", label: "List values", value: "1 2 3 4 5" }], random: () => ({ list: randArr(rnd(4, 6), 1, 9).join(" ") }),
    code: ["ListNode* prev = nullptr; ListNode* curr = head;", "while (curr) {", "    ListNode* nxt = curr->next;   // 1. remember the rest", "    curr->next = prev;            // 2. flip the arrow", "    prev = curr;                  // 3. advance prev", "    curr = nxt;                   // 4. advance curr", "}", "return prev;   // new head"],
    run(cfg) {
      const vals = nums(cfg.list).slice(0, 8), F = Frames();
      const nodes = vals.map((v, i) => ({ id: "n" + i, v }));
      const next = Object.fromEntries(nodes.map((nd, i) => [nd.id, i + 1 < nodes.length ? nodes[i + 1].id : null]));
      let prev = null, curr = nodes.length ? "n0" : null, nxt = null;
      const view = (cls = {}) => { const ptr = {}; const add = (id, nm) => { if (id) (ptr[id] = ptr[id] || []).push(nm); }; add(prev, "prev"); add(curr, "curr"); add(nxt, "nxt"); return { type: "list", nodes, next: clone(next), ptr, cls, nullPtrs: [prev == null ? "prev" : null, curr == null ? "curr" : null].filter(Boolean) }; };
      F.add({ line: 0, msg: "Walk through the list and flip each arrow to point backwards.", vars: {}, views: [view()] });
      while (curr) {
        nxt = next[curr];
        F.add({ line: 2, msg: "Save curr->next before we overwrite it, or we'd lose the rest of the list.", vars: {}, views: [view({ [curr]: "cmp" })] });
        next[curr] = prev;
        F.add({ line: 3, msg: `Flip: node ${nodes.find((x) => x.id === curr).v} now points to ${prev ? nodes.find((x) => x.id === prev).v : "null"}.`, vars: {}, views: [view({ [curr]: "swap" })] });
        prev = curr; curr = nxt;
        F.add({ line: 5, msg: "Move prev and curr one step forward.", vars: {}, views: [view({ [prev]: "done" })] });
      }
      nxt = null;
      F.add({ line: 7, msg: "curr is null, so we're done. **prev is the new head**. O(n) time, O(1) extra space.", vars: {}, views: [view(Object.fromEntries(nodes.map((x) => [x.id, "done"])))] });
      return F.list;
    },
  });

  def("floyd-cycle", {
    title: "Floyd's cycle detection (tortoise & hare)",
    inputs: [{ key: "n", label: "Number of nodes", value: "9" }, { key: "pos", label: "Tail connects to index (-1 = no cycle)", value: "3" }],
    random: () => { const n = rnd(6, 10); return { n: String(n), pos: String(rnd(-1, n - 2)) }; },
    code: ["ListNode *slow = head, *fast = head;", "while (fast && fast->next) {", "    slow = slow->next; fast = fast->next->next;", "    if (slow == fast) {              // they met inside the cycle", "        slow = head;                 // phase 2: find the entry", "        while (slow != fast) { slow = slow->next; fast = fast->next; }", "        return slow; } }", "return nullptr;   // fast fell off: no cycle"],
    run(cfg) {
      const n = Math.max(2, Math.min(12, +cfg.n || 8)), pos = Math.min(n - 1, +cfg.pos), F = Frames();
      const nodes = Array.from({ length: n }, (_, i) => ({ id: "n" + i, v: i }));
      const next = Object.fromEntries(nodes.map((nd, i) => [nd.id, i + 1 < n ? "n" + (i + 1) : pos >= 0 ? "n" + pos : null]));
      let slow = 0, fast = 0, step = 0;
      const view = (cls = {}) => { const ptr = {}; (ptr["n" + slow] = ptr["n" + slow] || []).push("slow 🐢"); if (fast != null) (ptr["n" + fast] = ptr["n" + fast] || []).push("fast 🐇"); return { type: "list", nodes, next, ptr, cls }; };
      const nx = (i) => (next["n" + i] ? +next["n" + i].slice(1) : null);
      F.add({ line: 0, msg: `slow moves 1 step and fast moves 2 steps. ${pos >= 0 ? `The tail links back to node ${pos}.` : "There is no cycle."}`, vars: { step }, views: [view()] });
      while (fast != null && nx(fast) != null) {
        slow = nx(slow); fast = nx(nx(fast)); step++;
        F.add({ line: 2, msg: `Step ${step}: slow → ${slow}, fast → ${fast ?? "null"}.`, vars: { step, slow, fast: fast ?? "null" }, views: [view()] });
        if (fast != null && slow === fast) {
          F.add({ line: 3, msg: `**They met at node ${slow}**, so there is a cycle. Inside the cycle the gap shrinks by 1 every step, so they must meet.`, vars: { step }, views: [view({ ["n" + slow]: "found" })] });
          slow = 0;
          F.add({ line: 4, msg: "Phase 2: move slow back to head. Now advance both one step at a time.", vars: {}, views: [view()] });
          while (slow !== fast) { slow = nx(slow); fast = nx(fast); F.add({ line: 5, msg: `slow → ${slow}, fast → ${fast}`, vars: {}, views: [view()] }); }
          F.add({ line: 6, msg: `They meet at **node ${slow}, the start of the cycle**. Why: the distance from head to the start equals the distance from the meeting point to the start, plus whole laps.`, vars: {}, views: [view({ ["n" + slow]: "found" })] });
          return F.list;
        }
      }
      F.add({ line: 7, msg: "fast reached the end (null), so **there is no cycle**. O(n) time, O(1) space.", vars: {}, views: [view()] });
      return F.list;
    },
  });

  /* ---------- trees ---------- */
  def("tree-traversal", {
    title: "Binary tree traversals",
    inputs: [{ key: "tree", label: "Level order (null = empty)", value: "1 2 3 4 5 null 6 null null 7" }, { key: "order", label: "Order: pre / in / post / level", value: "in" }],
    random: () => ({ tree: "8 4 12 2 6 10 14 1 3 null 7", order: ["pre", "in", "post", "level"][rnd(0, 3)] }),
    code: ["void inorder(TreeNode* node) {", "    if (!node) return;", "    // preorder:  visit(node) here", "    inorder(node->left);", "    // inorder:   visit(node) here", "    inorder(node->right);", "    // postorder: visit(node) here", "}", "// level order: BFS with a queue"],
    run(cfg) {
      const { nodes, root } = treeFromLevel(parseTreeList(cfg.tree)), F = Frames();
      const order = String(cfg.order || "in").toLowerCase().slice(0, 2);
      const out = [], visited = new Set(), path = [];
      const view = (cur, x = {}) => ({ type: "tree", nodes, root, cls: Object.assign(Object.fromEntries([...visited].map((id) => [id, "done"])), Object.fromEntries(path.map((id) => [id, "win"])), cur ? { [cur]: "cmp" } : {}, x) });
      const outv = () => arrView(out, { label: "visit order" });
      const visit = (id, line) => { visited.add(id); out.push(nodes[id].v); F.add({ line, msg: `**Visit ${nodes[id].v}**.`, vars: { stackDepth: path.length }, views: [view(id, { [id]: "found" }), outv()] }); };
      if (order === "le") {
        const q = root ? [root] : [];
        let level = 0;
        while (q.length) {
          const sz = q.length;
          F.add({ line: 8, msg: `Level ${level}: the queue holds ${sz} node(s).`, vars: { level }, views: [view(null, Object.fromEntries(q.map((id) => [id, "win"]))), outv()] });
          for (let k = 0; k < sz; k++) { const id = q.shift(); visit(id, 8); if (nodes[id].l) q.push(nodes[id].l); if (nodes[id].r) q.push(nodes[id].r); }
          level++;
        }
      } else {
        (function dfs(id) {
          if (!id) return;
          path.push(id);
          F.add({ line: 0, msg: `Call on node ${nodes[id].v}. The call stack holds ${path.length} frame(s).`, vars: { depth: path.length }, views: [view(id), outv()] });
          if (order === "pr") visit(id, 2);
          dfs(nodes[id].l);
          if (order === "in") visit(id, 4);
          dfs(nodes[id].r);
          if (order === "po") visit(id, 6);
          path.pop();
        })(root);
      }
      const name = { pr: "Preorder (root, left, right)", in: "Inorder (left, root, right)", po: "Postorder (left, right, root)", le: "Level order (BFS)" }[order];
      F.add({ line: 7, msg: `${name}: **${out.join(", ")}**. Every node is visited once: O(n) time. Recursion uses O(h) stack space.`, vars: {}, views: [view(null), outv()] });
      return F.list;
    },
  });

  def("bst", {
    title: "Binary search tree: insert & search",
    inputs: [{ key: "insert", label: "Insert in this order", value: "50 30 70 20 40 60 80 35" }, { key: "find", label: "Then search for", value: "35" }],
    random: () => ({ insert: [...new Set(randArr(9, 1, 99))].join(" "), find: String(rnd(1, 99)) }),
    code: ["TreeNode* insert(TreeNode* node, int x) {", "    if (!node) return new TreeNode(x);", "    if (x < node->val) node->left = insert(node->left, x);", "    else node->right = insert(node->right, x);", "    return node; }", "bool search(TreeNode* node, int x) {", "    while (node && node->val != x)", "        node = x < node->val ? node->left : node->right;", "    return node != nullptr; }"],
    run(cfg) {
      const vals = nums(cfg.insert).slice(0, 15), x = +cfg.find, F = Frames();
      const nodes = {}; let root = null;
      vals.forEach((v, k) => {
        const id = "b" + k;
        if (!root) { nodes[id] = { v, l: null, r: null }; root = id; F.add({ line: 1, msg: `Insert ${v}: the tree is empty, so ${v} becomes the root.`, vars: {}, views: [{ type: "tree", nodes: clone(nodes), root, cls: { [id]: "found" } }] }); return; }
        let cur = root;
        for (;;) {
          const side = v < nodes[cur].v ? "l" : "r";
          F.add({ line: side === "l" ? 2 : 3, msg: `Insert ${v}: ${v} ${side === "l" ? "<" : "≥"} ${nodes[cur].v}, so go ${side === "l" ? "left" : "right"}.`, vars: {}, views: [{ type: "tree", nodes: clone(nodes), root, cls: { [cur]: "cmp" } }] });
          if (nodes[cur][side] == null) { nodes[id] = { v, l: null, r: null }; nodes[cur][side] = id; break; }
          cur = nodes[cur][side];
        }
        F.add({ line: 1, msg: `Found an empty spot, so attach ${v} there.`, vars: {}, views: [{ type: "tree", nodes: clone(nodes), root, cls: { [id]: "found" } }] });
      });
      let cur = root, steps = 0;
      while (cur && nodes[cur].v !== x) {
        steps++;
        F.add({ line: 7, msg: `Search ${x}: compare with ${nodes[cur].v}, go ${x < nodes[cur].v ? "left" : "right"}.`, vars: { steps }, views: [{ type: "tree", nodes, root, cls: { [cur]: "cmp" } }] });
        cur = x < nodes[cur].v ? nodes[cur].l : nodes[cur].r;
      }
      F.add({ line: 8, msg: cur ? `**Found ${x}** after ${steps} step(s). Searching costs O(h), the height of the tree.` : `${x} is **not in the tree**: we fell off at a null child. O(h) steps.`, vars: { steps }, views: [{ type: "tree", nodes, root, cls: cur ? { [cur]: "found" } : {} }] });
      return F.list;
    },
  });

  def("heap-ops", {
    title: "Binary min-heap: push & pop",
    inputs: [{ key: "push", label: "Push in order", value: "7 3 9 1 5 8 2" }, { key: "pops", label: "Then pop how many", value: "3" }],
    random: () => ({ push: randArr(8, 1, 50).join(" "), pops: String(rnd(1, 4)) }),
    code: ["void push(int x) {", "    h.push_back(x); int i = h.size() - 1;", "    while (i > 0 && h[(i - 1) / 2] > h[i]) {   // sift up", "        swap(h[i], h[(i - 1) / 2]); i = (i - 1) / 2; } }", "int pop() {", "    int top = h[0]; h[0] = h.back(); h.pop_back();", "    siftDown(0);                                 // restore the order", "    return top; }"],
    run(cfg) {
      const vals = nums(cfg.push).slice(0, 15), pops = Math.max(0, +cfg.pops || 0), h = [], F = Frames(); let uid = 0;
      const show = (x, msg, line) => F.add({ line, msg, vars: { size: h.length }, views: [heapTree(h, x), arrView(h, { idx: true, cls: x })] });
      for (const v of vals) {
        h.push({ v, id: uid++ }); let i = h.length - 1;
        show({ [i]: "pivot" }, `Push ${v} at the end (index ${i}).`, 1);
        while (i > 0 && h[(i - 1) >> 1].v > h[i].v) { const p = (i - 1) >> 1; show({ [i]: "cmp", [p]: "cmp" }, `Parent ${h[p].v} > ${h[i].v}, so swap them (sift up).`, 2); [h[i], h[p]] = [h[p], h[i]]; i = p; }
        show({ [i]: "found" }, `${v} is in place. The cost is the tree height: **O(log n)**.`, 3);
      }
      for (let k = 0; k < pops && h.length; k++) {
        const top = h[0].v;
        show({ 0: "found" }, `Pop: the minimum is always at the root: **${top}**.`, 5);
        const last = h.pop();
        if (h.length) { h[0] = last; show({ 0: "pivot" }, `Move the last element (${last.v}) to the root, then sift it down.`, 5); }
        let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l].v < h[m].v) m = l; if (r < h.length && h[r].v < h[m].v) m = r; if (m === i) break; show({ [i]: "cmp", [m]: "cmp" }, `${h[i].v} > smaller child ${h[m].v}, so swap.`, 6); [h[i], h[m]] = [h[m], h[i]]; i = m; }
        show({}, `Heap restored after popping ${top}. O(log n).`, 7);
      }
      return F.list;
    },
  });

  /* ---------- graphs ---------- */
  const gView = (G, cls = {}, ecls = {}, tags = {}, directed = false) => ({ type: "graph", nodes: G.nodes, edges: G.edges, directed, cls: clone(cls), ecls: clone(ecls), tags: clone(tags) });
  const ek = (u, v) => `${u}-${v}`;

  function adjOf(G, directed) {
    const adj = Object.fromEntries(G.ids.map((i) => [i, []]));
    G.edges.forEach(([u, v, w]) => { adj[u].push([v, w]); if (!directed) adj[v].push([u, w]); });
    Object.values(adj).forEach((l) => l.sort((a, b) => (isNaN(a[0]) ? a[0].localeCompare(b[0]) : a[0] - b[0])));
    return adj;
  }
  const defaultGraph = "A-B, A-C, B-D, C-D, C-E, D-F, E-F, F-G";

  def("bfs", {
    title: "Breadth-first search (BFS)",
    inputs: [{ key: "edges", label: "Edges (undirected)", value: defaultGraph }, { key: "start", label: "Start", value: "A" }],
    code: ["vector<int> dist(n, -1); queue<int> q;", "dist[s] = 0; q.push(s);", "while (!q.empty()) {", "    int u = q.front(); q.pop();", "    for (int v : adj[u])", "        if (dist[v] == -1) {          // first time we see v", "            dist[v] = dist[u] + 1; q.push(v);", "        }", "}"],
    run(cfg) {
      const G = graphInput(cfg, false), adj = adjOf(G, false), s = cfg.start in adj ? cfg.start : G.ids[0], F = Frames();
      const dist = {}, cls = {}, ecls = {}; const q = [s]; dist[s] = 0; cls[s] = "win";
      const tags = () => Object.fromEntries(Object.entries(dist).map(([k, d]) => [k, "d=" + d]));
      const qv = () => arrView(q, { label: "queue (front → back)" });
      F.add({ line: 1, msg: `Start at ${s} with distance 0. The queue holds the frontier.`, vars: {}, views: [gView(G, cls, ecls, tags()), qv()] });
      while (q.length) {
        const u = q.shift(); cls[u] = "cmp";
        F.add({ line: 3, msg: `Take ${u} from the queue (distance ${dist[u]}).`, vars: { u }, views: [gView(G, cls, ecls, tags()), qv()] });
        for (const [v] of adj[u]) {
          if (dist[v] == null) { dist[v] = dist[u] + 1; q.push(v); cls[v] = "win"; ecls[ek(u, v)] = ecls[ek(v, u)] = "tree"; F.add({ line: 6, msg: `${v} hasn't been seen yet: dist[${v}] = ${dist[v]}. Push it.`, vars: { u, v }, views: [gView(G, cls, ecls, tags()), qv()] }); }
          else F.add({ line: 5, msg: `${v} was already discovered, so skip it.`, vars: { u, v }, views: [gView(G, Object.assign({}, cls, { [v]: cls[v] === "done" ? "done" : "win" }), Object.assign({}, ecls, { [ek(u, v)]: ecls[ek(u, v)] || "dim" }), tags()), qv()] });
        }
        cls[u] = "done";
      }
      F.add({ line: 8, msg: "BFS visits nodes in order of distance, so **dist[] holds the shortest number of edges** from the start. The highlighted edges form the BFS tree. O(V + E).", vars: {}, views: [gView(G, cls, ecls, tags()), qv()] });
      return F.list;
    },
  });

  def("dfs", {
    title: "Depth-first search (DFS)",
    inputs: [{ key: "edges", label: "Edges (undirected)", value: defaultGraph }, { key: "start", label: "Start", value: "A" }],
    code: ["void dfs(int u) {", "    visited[u] = true;", "    for (int v : adj[u])", "        if (!visited[v]) dfs(v);   // go deep first", "}   // returning = backtracking"],
    run(cfg) {
      const G = graphInput(cfg, false), adj = adjOf(G, false), s = cfg.start in adj ? cfg.start : G.ids[0], F = Frames();
      const cls = {}, ecls = {}, order = [], stack = [];
      const sv = () => arrView(stack, { label: "call stack (bottom → top)" });
      (function dfs(u) {
        cls[u] = "cmp"; stack.push(u); order.push(u);
        F.add({ line: 1, msg: `Visit ${u} (number ${order.length}).`, vars: { u, depth: stack.length }, views: [gView(G, cls, ecls, Object.fromEntries(order.map((x, i) => [x, "#" + (i + 1)]))), sv()] });
        for (const [v] of adj[u]) {
          if (!cls[v]) { ecls[ek(u, v)] = ecls[ek(v, u)] = "tree"; cls[u] = "win"; F.add({ line: 3, msg: `${v} is unvisited, so go deeper from ${u} to ${v}.`, vars: { u, v }, views: [gView(G, cls, ecls, Object.fromEntries(order.map((x, i) => [x, "#" + (i + 1)]))), sv()] }); dfs(v); cls[u] = "cmp"; }
        }
        cls[u] = "done"; stack.pop();
        F.add({ line: 4, msg: `All neighbours of ${u} are done, so backtrack.`, vars: { u }, views: [gView(G, cls, ecls, Object.fromEntries(order.map((x, i) => [x, "#" + (i + 1)]))), sv()] });
      })(s);
      F.add({ line: 4, msg: `DFS order: **${order.join(" → ")}**. O(V + E) time, O(V) stack in the worst case.`, vars: {}, views: [gView(G, cls, ecls, Object.fromEntries(order.map((x, i) => [x, "#" + (i + 1)]))), sv()] });
      return F.list;
    },
  });

  def("dijkstra", {
    title: "Dijkstra's shortest paths",
    inputs: [{ key: "edges", label: "Edges with weights (undirected)", value: "A-B:4, A-C:2, B-C:1, B-D:5, C-D:8, C-E:10, D-E:2, D-F:6, E-F:3" }, { key: "start", label: "Source", value: "A" }],
    code: ["vector<long long> dist(n, INF); dist[s] = 0;", "priority_queue<pair<ll,int>, vector<pair<ll,int>>, greater<>> pq;", "pq.push({0, s});", "while (!pq.empty()) {", "    auto [d, u] = pq.top(); pq.pop();", "    if (d > dist[u]) continue;            // stale entry", "    for (auto [v, w] : adj[u])", "        if (dist[u] + w < dist[v]) {      // relax", "            dist[v] = dist[u] + w; pq.push({dist[v], v}); }", "}"],
    run(cfg) {
      const G = graphInput(cfg, false), adj = adjOf(G, false), s = cfg.start in adj ? cfg.start : G.ids[0], F = Frames();
      const dist = Object.fromEntries(G.ids.map((i) => [i, Infinity])), par = {}, cls = {}, ecls = {}; dist[s] = 0;
      let pq = [[0, s]];
      const tags = () => Object.fromEntries(G.ids.map((i) => [i, dist[i] === Infinity ? "∞" : String(dist[i])]));
      const pqv = () => arrView(pq.slice().sort((a, b) => a[0] - b[0]).map(([d, u]) => `${u}:${d}`), { label: "priority queue (min first)" });
      F.add({ line: 2, msg: `dist[${s}] = 0 and every other distance is ∞.`, vars: {}, views: [gView(G, cls, ecls, tags()), pqv()] });
      while (pq.length) {
        pq.sort((a, b) => a[0] - b[0]); const [d, u] = pq.shift();
        if (d > dist[u]) { F.add({ line: 5, msg: `(${u}, ${d}) is stale: we already found ${dist[u]}. Skip it.`, vars: { u, d }, views: [gView(G, cls, ecls, tags()), pqv()] }); continue; }
        cls[u] = "cmp";
        F.add({ line: 4, msg: `Pop ${u} with the smallest tentative distance, ${d}. **Its distance is now final**: any other route would pass through a node that is already ≥ ${d} away.`, vars: { u, d }, views: [gView(G, cls, ecls, tags()), pqv()] });
        for (const [v, w] of adj[u]) {
          if (cls[v] === "done") continue;
          if (dist[u] + w < dist[v]) {
            const old = dist[v]; dist[v] = dist[u] + w;
            if (par[v]) { ecls[ek(par[v], v)] = ecls[ek(v, par[v])] = ""; }
            par[v] = u; ecls[ek(u, v)] = ecls[ek(v, u)] = "tree"; pq.push([dist[v], v]);
            F.add({ line: 8, msg: `Relax ${u}→${v}: ${d} + ${w} = ${dist[v]} < ${old === Infinity ? "∞" : old}, so update dist[${v}].`, vars: { u, v, w }, views: [gView(G, Object.assign({}, cls, { [v]: "win" }), ecls, tags()), pqv()] });
          } else F.add({ line: 7, msg: `${u}→${v}: ${d} + ${w} = ${d + w} is not better than ${dist[v]}.`, vars: { u, v, w }, views: [gView(G, cls, Object.assign({}, ecls, { [ek(u, v)]: ecls[ek(u, v)] || "dim" }), tags()), pqv()] });
        }
        cls[u] = "done";
      }
      F.add({ line: 9, msg: "Done. The highlighted edges form the **shortest-path tree**. O((V + E) log V) with a binary heap. Needs non-negative weights.", vars: {}, views: [gView(G, cls, ecls, tags()), pqv()] });
      return F.list;
    },
  });

  def("topo-sort", {
    title: "Topological sort (Kahn's algorithm)",
    inputs: [{ key: "edges", label: "Directed edges (u>v means u before v)", value: "shirt>tie, tie>jacket, pants>shoes, pants>belt, belt>jacket, shirt>belt, socks>shoes" }],
    code: ["vector<int> indeg(n, 0);", "for (auto& [u, v] : edges) indeg[v]++;", "queue<int> q; for (int u = 0; u < n; u++) if (indeg[u] == 0) q.push(u);", "while (!q.empty()) {", "    int u = q.front(); q.pop(); order.push_back(u);", "    for (int v : adj[u]) if (--indeg[v] == 0) q.push(v);", "}", "if (order.size() < n) /* there is a cycle */;"],
    run(cfg) {
      const G = graphInput(cfg, true), adj = adjOf(G, true), F = Frames();
      const indeg = Object.fromEntries(G.ids.map((i) => [i, 0])); G.edges.forEach(([, v]) => indeg[v]++);
      const q = G.ids.filter((i) => indeg[i] === 0), order = [], cls = {}, ecls = {};
      const tags = () => Object.fromEntries(G.ids.map((i) => [i, "in:" + indeg[i]]));
      q.forEach((i) => (cls[i] = "win"));
      F.add({ line: 2, msg: `In-degree = number of things that must come first. Nodes with in-degree 0 (${q.join(", ")}) can go first.`, vars: {}, views: [gView(G, cls, ecls, tags(), true), arrView(q, { label: "queue" }), arrView(order, { label: "order" })] });
      while (q.length) {
        const u = q.shift(); order.push(u); cls[u] = "done";
        F.add({ line: 4, msg: `Output **${u}**. Remove its outgoing edges.`, vars: { u }, views: [gView(G, cls, ecls, tags(), true), arrView(q, { label: "queue" }), arrView(order, { label: "order" })] });
        for (const [v] of adj[u]) { indeg[v]--; ecls[ek(u, v)] = "dim"; if (indeg[v] === 0) { q.push(v); cls[v] = "win"; } F.add({ line: 5, msg: `in-degree of ${v} is now ${indeg[v]}${indeg[v] === 0 ? ". It's free, so queue it." : "."}`, vars: { u, v }, views: [gView(G, cls, ecls, tags(), true), arrView(q, { label: "queue" }), arrView(order, { label: "order" })] }); }
      }
      F.add({ line: 7, msg: order.length === G.ids.length ? `A valid order: **${order.join(" → ")}**. O(V + E).` : "Some nodes never reached in-degree 0, so **there is a cycle** and no order exists.", vars: {}, views: [gView(G, cls, ecls, tags(), true), arrView(order, { label: "order" })] });
      return F.list;
    },
  });

  def("union-find", {
    title: "Union-Find (disjoint set union)",
    inputs: [{ key: "n", label: "Elements 0..n-1", value: "8" }, { key: "ops", label: "Unions (a-b, …)", value: "0-1, 2-3, 1-3, 4-5, 6-7, 5-7, 3-7" }],
    code: ["int find(int x) {", "    return parent[x] == x ? x : parent[x] = find(parent[x]);   // path compression", "}", "bool unite(int a, int b) {", "    a = find(a); b = find(b);", "    if (a == b) return false;            // already connected", "    if (sz[a] < sz[b]) swap(a, b);       // union by size", "    parent[b] = a; sz[a] += sz[b]; return true; }"],
    run(cfg) {
      const n = Math.max(2, Math.min(12, +cfg.n || 8)), F = Frames();
      const parent = Array.from({ length: n }, (_, i) => i), sz = Array(n).fill(1);
      const forest = (cls = {}) => {
        const nodes = {}; const roots = [];
        for (let i = 0; i < n; i++) nodes["u" + i] = { v: i, kids: [] };
        for (let i = 0; i < n; i++) if (parent[i] !== i) nodes["u" + parent[i]].kids.push("u" + i); else roots.push("u" + i);
        return { type: "forest", nodes, roots, cls };
      };
      const pv = (x = {}) => arrView(parent, { label: "parent", idx: true, cls: x });
      F.add({ line: 0, msg: "Each element starts in its own set: it is its own root.", vars: {}, views: [forest(), pv()] });
      const find = (x, trail) => { trail.push(x); if (parent[x] === x) return x; const r = find(parent[x], trail); parent[x] = r; return r; };
      for (const [a0, b0] of parseEdges(cfg.ops).map(([a, b]) => [+a, +b]).filter(([a, b]) => a < n && b < n)) {
        const ta = [], tb = [];
        const before = forest(Object.fromEntries([a0, b0].map((x) => ["u" + x, "cmp"])));
        const a = find(a0, ta), b = find(b0, tb);
        F.add({ line: 4, msg: `unite(${a0}, ${b0}): find(${a0}) = ${a}, find(${b0}) = ${b}. Path compression points every node on the way straight at its root.`, vars: { a0, b0, rootA: a, rootB: b }, views: [before, pv()] });
        if (a === b) { F.add({ line: 5, msg: `Same root, so ${a0} and ${b0} are **already connected**. (With edges, this means the edge closes a cycle.)`, vars: {}, views: [forest({ ["u" + a]: "bad" }), pv()] }); continue; }
        let r = a, c = b; if (sz[r] < sz[c]) [r, c] = [c, r];
        parent[c] = r; sz[r] += sz[c];
        F.add({ line: 7, msg: `Attach the smaller tree (root ${c}, size ${sz[c]}) under the bigger one (root ${r}, size now ${sz[r]}). This keeps the trees shallow.`, vars: {}, views: [forest({ ["u" + r]: "found", ["u" + c]: "cmp" }), pv({ [c]: "found" })] });
      }
      F.add({ line: 7, msg: "With both tricks, each operation is O(α(n)) amortized. α is the inverse Ackermann function, which is at most 4 for any realistic n.", vars: {}, views: [forest(), pv()] });
      return F.list;
    },
  });

  def("kruskal", {
    title: "Kruskal's minimum spanning tree",
    inputs: [{ key: "edges", label: "Weighted edges", value: "A-B:7, A-D:5, B-C:8, B-D:9, B-E:7, C-E:5, D-E:15, D-F:6, E-F:8, E-G:9, F-G:11" }],
    code: ["sort(edges.begin(), edges.end());          // by weight", "DSU dsu(n); long long total = 0;", "for (auto [w, u, v] : edges)", "    if (dsu.unite(u, v)) {                    // different components?", "        total += w; mst.push_back({u, v});    // safe edge (cut property)", "    }                                         // else: would form a cycle"],
    run(cfg) {
      const G = graphInput(cfg, false), F = Frames();
      const sorted = G.edges.slice().sort((a, b) => a[2] - b[2]);
      const comp = Object.fromEntries(G.ids.map((i) => [i, i])); const find = (x) => (comp[x] === x ? x : (comp[x] = find(comp[x])));
      const ecls = {}; let total = 0, taken = 0;
      F.add({ line: 0, msg: "Sort the edges by weight. Take each edge unless it would make a cycle.", vars: {}, views: [gView(G, {}, ecls), arrView(sorted.map(([u, v, w]) => `${u}${v}:${w}`), { label: "edges by weight" })] });
      sorted.forEach(([u, v, w], k) => {
        const lst = arrView(sorted.map(([a, b, c]) => `${a}${b}:${c}`), { label: "edges by weight", cls: Object.assign(Object.fromEntries(sorted.map((_, j) => [j, j < k ? "dim" : ""])), { [k]: "cmp" }) });
        if (find(u) !== find(v)) { comp[find(u)] = find(v); total += w; taken++; ecls[ek(u, v)] = ecls[ek(v, u)] = "tree"; F.add({ line: 4, msg: `${u}–${v} (${w}) joins two different components, so **take it**. Total = ${total}.`, vars: { total, edges: taken }, views: [gView(G, { [u]: "cmp", [v]: "cmp" }, ecls), lst] }); }
        else { ecls[ek(u, v)] = ecls[ek(v, u)] = "bad"; F.add({ line: 5, msg: `${u} and ${v} are already connected, so ${u}–${v} would close a cycle. **Skip it**.`, vars: { total, edges: taken }, views: [gView(G, { [u]: "bad", [v]: "bad" }, ecls), lst] }); ecls[ek(u, v)] = ecls[ek(v, u)] = "dim"; }
      });
      F.add({ line: 5, msg: `MST weight = **${total}** using ${taken} = V − 1 edges. O(E log E) for the sort, plus near-O(1) per DSU operation.`, vars: { total }, views: [gView(G, {}, ecls)] });
      return F.list;
    },
  });

  def("grid-bfs", {
    title: "Shortest path in a grid (BFS)",
    inputs: [{ key: "grid", label: "Grid (S start, E end, # wall), rows split by /", value: "S..#..../.#.#.##./.#...#../.##.#..#/...#..#E" }],
    random: () => { const R = 6, C = 9; const g = Array.from({ length: R }, () => Array.from({ length: C }, () => (Math.random() < 0.25 ? "#" : "."))); g[0][0] = "S"; g[R - 1][C - 1] = "E"; return { grid: g.map((r) => r.join("")).join("/") }; },
    code: ["queue<pair<int,int>> q; q.push(start); dist[start] = 0;", "int dr[] = {1,-1,0,0}, dc[] = {0,0,1,-1};", "while (!q.empty()) {", "    auto [r, c] = q.front(); q.pop();", "    for (int k = 0; k < 4; k++) {", "        int nr = r + dr[k], nc = c + dc[k];", "        if (inside(nr, nc) && grid[nr][nc] != '#' && dist[nr][nc] == -1) {", "            dist[nr][nc] = dist[r][c] + 1; par[nr][nc] = {r, c}; q.push({nr, nc}); }", "    } }"],
    run(cfg) {
      const g = String(cfg.grid).split("/").map((r) => r.split("")).slice(0, 10), R = g.length, C = Math.max(...g.map((r) => r.length)), F = Frames();
      let S = [0, 0], E = [R - 1, C - 1];
      g.forEach((row, r) => row.forEach((ch, c) => { if (ch === "S") S = [r, c]; if (ch === "E") E = [r, c]; }));
      const dist = g.map((row) => row.map(() => -1)), par = {};
      const view = (cur, extra = {}) => {
        const cls = {};
        g.forEach((row, r) => row.forEach((ch, c) => { if (ch === "#") cls[`${r},${c}`] = "wall"; else if (dist[r][c] >= 0) cls[`${r},${c}`] = "done"; }));
        cls[`${S[0]},${S[1]}`] = "pivot"; cls[`${E[0]},${E[1]}`] = "pivot";
        if (cur) cls[cur] = "cmp";
        Object.assign(cls, extra);
        return { type: "grid", rows: g.map((row, r) => row.map((ch, c) => (ch === "#" ? "" : ch === "S" || ch === "E" ? ch : dist[r][c] >= 0 ? dist[r][c] : ""))), cls };
      };
      const q = [S]; dist[S[0]][S[1]] = 0;
      F.add({ line: 0, msg: "BFS spreads out in rings: every cell at distance d is reached before any cell at distance d + 1.", vars: {}, views: [view()] });
      let found = false, level = -1;
      while (q.length) {
        const [r, c] = q.shift();
        if (dist[r][c] !== level) { level = dist[r][c]; F.add({ line: 3, msg: `Reaching cells at distance **${level}**.`, vars: { level, queued: q.length + 1 }, views: [view(`${r},${c}`)] }); }
        if (r === E[0] && c === E[1]) { found = true; break; }
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nc >= 0 && nr < R && nc < C && g[nr][nc] && g[nr][nc] !== "#" && dist[nr][nc] === -1) { dist[nr][nc] = dist[r][c] + 1; par[`${nr},${nc}`] = `${r},${c}`; q.push([nr, nc]); }
        }
      }
      if (found) {
        const path = {}; let k = `${E[0]},${E[1]}`; while (k) { path[k] = "found"; k = par[k]; }
        F.add({ line: 7, msg: `Reached E at distance **${dist[E[0]][E[1]]}**. Follow the parent pointers back to S to get the path. O(R × C).`, vars: { distance: dist[E[0]][E[1]] }, views: [view(null, path)] });
      } else F.add({ line: 8, msg: "The queue ran empty before reaching E, so **there is no path**.", vars: {}, views: [view()] });
      return F.list;
    },
  });

  /* ---------- dynamic programming ---------- */
  def("lcs", {
    title: "Longest common subsequence (DP table)",
    inputs: [{ key: "a", label: "String A", value: "ABCBDAB" }, { key: "b", label: "String B", value: "BDCABA" }],
    random: () => ({ a: Array.from({ length: 6 }, () => "ABCD"[rnd(0, 3)]).join(""), b: Array.from({ length: 6 }, () => "ABCD"[rnd(0, 3)]).join("") }),
    code: ["// dp[i][j] = LCS length of A[0..i) and B[0..j)", "for (int i = 1; i <= n; i++)", "    for (int j = 1; j <= m; j++)", "        if (A[i-1] == B[j-1]) dp[i][j] = dp[i-1][j-1] + 1;   // ↖ + 1", "        else dp[i][j] = max(dp[i-1][j], dp[i][j-1]);        // ↑ or ←", "return dp[n][m];"],
    run(cfg) {
      const A = String(cfg.a).slice(0, 9), B = String(cfg.b).slice(0, 9), n = A.length, m = B.length, F = Frames();
      const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
      const filled = (i0, j0) => dp.map((row, i) => row.map((x, j) => (i === 0 || j === 0 || i < i0 || (i === i0 && j <= j0) ? x : "")));
      const view = (i0, j0, cls) => ({ type: "grid", rows: filled(i0, j0), rowHead: ["∅", ...A], colHead: ["∅", ...B], cls });
      F.add({ line: 0, msg: "Row 0 and column 0 are 0: an empty string shares nothing with anything.", vars: {}, views: [view(0, m, {})] });
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
        if (A[i - 1] === B[j - 1]) { dp[i][j] = dp[i - 1][j - 1] + 1; F.add({ line: 3, msg: `A[${i - 1}] = B[${j - 1}] = '${A[i - 1]}'. Match! dp = diagonal + 1 = **${dp[i][j]}**.`, vars: { i, j }, views: [view(i, j, { [`${i},${j}`]: "found", [`${i - 1},${j - 1}`]: "cmp" })] }); }
        else { dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]); F.add({ line: 4, msg: `'${A[i - 1]}' ≠ '${B[j - 1]}'. Skip one of them: max(up ${dp[i - 1][j]}, left ${dp[i][j - 1]}) = **${dp[i][j]}**.`, vars: { i, j }, views: [view(i, j, { [`${i},${j}`]: "active", [`${i - 1},${j}`]: "cmp", [`${i},${j - 1}`]: "cmp" })] }); }
      }
      const path = {}; let i = n, j = m, s = "";
      while (i > 0 && j > 0) { if (A[i - 1] === B[j - 1]) { path[`${i},${j}`] = "found"; s = A[i - 1] + s; i--; j--; } else if (dp[i - 1][j] >= dp[i][j - 1]) { path[`${i},${j}`] = "win"; i--; } else { path[`${i},${j}`] = "win"; j--; } }
      F.add({ line: 5, msg: `LCS length = **${dp[n][m]}** ("${s}"). Walk back from the bottom-right corner, taking a character at each diagonal match. O(n·m) time and space.`, vars: {}, views: [view(n, m, path)] });
      return F.list;
    },
  });

  def("knapsack", {
    title: "0/1 knapsack (DP table)",
    inputs: [{ key: "w", label: "Weights", value: "1 3 4 5" }, { key: "v", label: "Values", value: "1 4 5 7" }, { key: "cap", label: "Capacity W", value: "7" }],
    random: () => ({ w: randArr(4, 1, 5).join(" "), v: randArr(4, 1, 9).join(" "), cap: String(rnd(5, 9)) }),
    code: ["// dp[i][c] = best value using the first i items with capacity c", "for (int i = 1; i <= n; i++)", "    for (int c = 0; c <= W; c++) {", "        dp[i][c] = dp[i-1][c];                                   // skip item i", "        if (w[i-1] <= c)", "            dp[i][c] = max(dp[i][c], dp[i-1][c - w[i-1]] + v[i-1]); // take it", "    }"],
    run(cfg) {
      const w = nums(cfg.w).slice(0, 6), v = nums(cfg.v).slice(0, w.length), W = Math.min(12, +cfg.cap || 7), n = w.length, F = Frames();
      const dp = Array.from({ length: n + 1 }, () => Array(W + 1).fill(0));
      const filled = (i0, c0) => dp.map((row, i) => row.map((x, c) => (i === 0 || i < i0 || (i === i0 && c <= c0) ? x : "")));
      const view = (i0, c0, cls) => ({ type: "grid", rows: filled(i0, c0), rowHead: ["none", ...w.map((x, i) => `#${i + 1} w${x} v${v[i]}`)], colHead: Array.from({ length: W + 1 }, (_, c) => c), cls });
      F.add({ line: 0, msg: "Columns are capacities 0..W. Row i answers: what's the best value if I may only use the first i items?", vars: {}, views: [view(0, W, {})] });
      for (let i = 1; i <= n; i++) for (let c = 0; c <= W; c++) {
        dp[i][c] = dp[i - 1][c];
        if (w[i - 1] <= c && dp[i - 1][c - w[i - 1]] + v[i - 1] > dp[i][c]) {
          dp[i][c] = dp[i - 1][c - w[i - 1]] + v[i - 1];
          F.add({ line: 5, msg: `Capacity ${c}: take item ${i} (w=${w[i - 1]}, v=${v[i - 1]}) → ${dp[i - 1][c - w[i - 1]]} + ${v[i - 1]} = **${dp[i][c]}**, better than skipping it (${dp[i - 1][c]}).`, vars: { i, c }, views: [view(i, c, { [`${i},${c}`]: "found", [`${i - 1},${c - w[i - 1]}`]: "cmp", [`${i - 1},${c}`]: "dim" })] });
        } else if (c > 0) F.add({ line: 3, msg: w[i - 1] > c ? `Capacity ${c}: item ${i} (w=${w[i - 1]}) doesn't fit, so copy from above: ${dp[i][c]}.` : `Capacity ${c}: taking item ${i} gives ${dp[i - 1][c - w[i - 1]] + v[i - 1]}, which doesn't beat skipping it (${dp[i][c]}).`, vars: { i, c }, views: [view(i, c, { [`${i},${c}`]: "active", [`${i - 1},${c}`]: "cmp" })] });
      }
      const take = {}; let c = W; for (let i = n; i > 0; i--) if (dp[i][c] !== dp[i - 1][c]) { take[`${i},${c}`] = "found"; c -= w[i - 1]; }
      F.add({ line: 6, msg: `Best value = **${dp[n][W]}**. The highlighted cells are the items taken. O(n·W): this is *pseudo-polynomial*, because W is a number, not a length.`, vars: {}, views: [view(n, W, take)] });
      return F.list;
    },
  });

  def("lis", {
    title: "Longest increasing subsequence in O(n log n) (patience)",
    inputs: [{ key: "arr", label: "Array", value: "10 9 2 5 3 7 101 18 4 19" }], random: () => ({ arr: randArr(11, 1, 30).join(" ") }),
    code: ["vector<int> tails;   // tails[k] = smallest tail of an increasing run of length k+1", "for (int x : a) {", "    auto it = lower_bound(tails.begin(), tails.end(), x);", "    if (it == tails.end()) tails.push_back(x);   // extends the longest run", "    else *it = x;                                // better (smaller) tail", "}", "return tails.size();"],
    run(cfg) {
      const a = nums(cfg.arr).slice(0, 14), tails = [], F = Frames();
      F.add({ line: 0, msg: "tails stays sorted, so we can binary search it. **tails is not itself an LIS**, but its length is the answer.", vars: {}, views: [arrView(a, { label: "a", idx: true }), arrView(tails, { label: "tails" })] });
      a.forEach((x, i) => {
        let lo = 0, hi = tails.length; while (lo < hi) { const m = (lo + hi) >> 1; if (tails[m] < x) lo = m + 1; else hi = m; }
        if (lo === tails.length) { tails.push(x); F.add({ line: 3, msg: `${x} is bigger than every tail, so it **extends** the longest run. Length = ${tails.length}.`, vars: { i, x }, views: [arrView(a, { label: "a", cls: { [i]: "cmp" }, idx: true }), arrView(tails, { label: "tails", cls: { [lo]: "found" } })] }); }
        else { const old = tails[lo]; tails[lo] = x; F.add({ line: 4, msg: `lower_bound(${x}) is at position ${lo}: replace ${old} with ${x}. A run of length ${lo + 1} can now end at the smaller value ${x}.`, vars: { i, x }, views: [arrView(a, { label: "a", cls: { [i]: "cmp" }, idx: true }), arrView(tails, { label: "tails", cls: { [lo]: "swap" } })] }); }
      });
      F.add({ line: 6, msg: `LIS length = **${tails.length}**. n binary searches: O(n log n).`, vars: {}, views: [arrView(a, { label: "a", idx: true }), arrView(tails, { label: "tails", cls: Object.fromEntries(tails.map((_, k) => [k, "done"])) })] });
      return F.list;
    },
  });

  def("coin-change", {
    title: "Coin change: fewest coins (1D DP)",
    inputs: [{ key: "coins", label: "Coins", value: "1 3 4" }, { key: "amount", label: "Amount", value: "6" }],
    random: () => ({ coins: [...new Set([1, ...randArr(2, 2, 7)])].join(" "), amount: String(rnd(6, 13)) }),
    code: ["vector<int> dp(amount + 1, INF); dp[0] = 0;", "for (int x = 1; x <= amount; x++)", "    for (int c : coins)", "        if (c <= x && dp[x - c] != INF)", "            dp[x] = min(dp[x], dp[x - c] + 1);   // last coin is c", "return dp[amount] == INF ? -1 : dp[amount];"],
    run(cfg) {
      const coins = nums(cfg.coins).filter((c) => c > 0), A = Math.min(20, +cfg.amount || 6), F = Frames();
      const dp = Array(A + 1).fill(Infinity); dp[0] = 0;
      const show = (cls) => arrView(dp.map((x) => (x === Infinity ? "∞" : x)), { label: "dp[x] = fewest coins to make x", idx: true, cls });
      F.add({ line: 0, msg: `${coins.join(", ")}: greedy (always the biggest coin) can fail, but DP tries every possible last coin. dp[0] = 0.`, vars: {}, views: [show({})] });
      for (let x = 1; x <= A; x++) {
        for (const c of coins) if (c <= x && dp[x - c] !== Infinity) {
          const cand = dp[x - c] + 1, better = cand < dp[x];
          F.add({ line: 4, msg: `x = ${x}, last coin ${c}: dp[${x - c}] + 1 = ${cand}${better ? ` < ${dp[x] === Infinity ? "∞" : dp[x]}, so update` : ` (no better than ${dp[x]})`}.`, vars: { x, c }, views: [show({ [x]: better ? "found" : "active", [x - c]: "cmp" })] });
          if (better) dp[x] = cand;
        }
      }
      F.add({ line: 5, msg: dp[A] === Infinity ? `Amount ${A} can't be made: answer -1.` : `Fewest coins for ${A} = **${dp[A]}**. O(amount × coins).`, vars: {}, views: [show({ [A]: "found" })] });
      return F.list;
    },
  });

  def("edit-distance", {
    title: "Edit distance (Levenshtein)",
    inputs: [{ key: "a", label: "From", value: "horse" }, { key: "b", label: "To", value: "ros" }],
    code: ["// dp[i][j] = edits to turn A[0..i) into B[0..j)", "dp[i][0] = i; dp[0][j] = j;          // delete all / insert all", "if (A[i-1] == B[j-1]) dp[i][j] = dp[i-1][j-1];   // free", "else dp[i][j] = 1 + min({ dp[i-1][j],     // delete A[i-1]", "                          dp[i][j-1],     // insert B[j-1]", "                          dp[i-1][j-1] }); // replace"],
    run(cfg) {
      const A = String(cfg.a).slice(0, 9), B = String(cfg.b).slice(0, 9), n = A.length, m = B.length, F = Frames();
      const dp = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
      const filled = (i0, j0) => dp.map((row, i) => row.map((x, j) => (i === 0 || j === 0 || i < i0 || (i === i0 && j <= j0) ? x : "")));
      const view = (i0, j0, cls) => ({ type: "grid", rows: filled(i0, j0), rowHead: ["∅", ...A], colHead: ["∅", ...B], cls });
      F.add({ line: 1, msg: "First row and column: turning a prefix into the empty string takes that many deletions (or insertions).", vars: {}, views: [view(0, m, {})] });
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
        if (A[i - 1] === B[j - 1]) { dp[i][j] = dp[i - 1][j - 1]; F.add({ line: 2, msg: `'${A[i - 1]}' = '${B[j - 1]}', so no edit is needed: copy the diagonal (${dp[i][j]}).`, vars: { i, j }, views: [view(i, j, { [`${i},${j}`]: "found", [`${i - 1},${j - 1}`]: "cmp" })] }); }
        else { dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]); F.add({ line: 3, msg: `'${A[i - 1]}' ≠ '${B[j - 1]}': 1 + min(delete ${dp[i - 1][j]}, insert ${dp[i][j - 1]}, replace ${dp[i - 1][j - 1]}) = **${dp[i][j]}**.`, vars: { i, j }, views: [view(i, j, { [`${i},${j}`]: "active", [`${i - 1},${j}`]: "cmp", [`${i},${j - 1}`]: "cmp", [`${i - 1},${j - 1}`]: "cmp" })] }); }
      }
      F.add({ line: 5, msg: `Edit distance("${A}", "${B}") = **${dp[n][m]}**. O(n·m).`, vars: {}, views: [view(n, m, { [`${n},${m}`]: "found" })] });
      return F.list;
    },
  });

  def("fib-recursion", {
    title: "Fibonacci: plain recursion vs memoization",
    inputs: [{ key: "n", label: "n (≤ 6)", value: "5" }, { key: "memo", label: "Use memo? yes / no", value: "no" }],
    code: ["long long fib(int n) {", "    if (n <= 1) return n;", "    if (memo[n] != -1) return memo[n];     // (memo version only)", "    return memo[n] = fib(n - 1) + fib(n - 2);", "}"],
    run(cfg) {
      const N = Math.max(1, Math.min(6, +cfg.n || 5)), useMemo = /^y/i.test(cfg.memo), F = Frames();
      const nodes = {}; let uid = 0, calls = 0; const memo = {};
      const cls = {};
      const view = () => ({ type: "tree", nodes: clone(nodes), root: "f0", cls: clone(cls), small: true });
      function fib(n, id) {
        calls++;
        nodes[id] = { v: `f(${n})`, l: null, r: null };
        cls[id] = "cmp";
        F.add({ line: 0, msg: `Call fib(${n}). Calls so far: ${calls}.`, vars: { calls }, views: [view()] });
        if (n <= 1) { cls[id] = "done"; nodes[id].v = `f(${n})=${n}`; return n; }
        if (useMemo && memo[n] != null) { cls[id] = "found"; nodes[id].v = `f(${n})=${memo[n]}`; F.add({ line: 2, msg: `fib(${n}) is already in the memo, so return ${memo[n]} at once. **No subtree!**`, vars: { calls }, views: [view()] }); return memo[n]; }
        const l = "f" + ++uid; nodes[id].l = l; const a = fib(n - 1, l);
        const r = "f" + ++uid; nodes[id].r = r; const b = fib(n - 2, r);
        memo[n] = a + b; cls[id] = "done"; nodes[id].v = `f(${n})=${a + b}`;
        F.add({ line: 3, msg: `fib(${n}) = ${a} + ${b} = ${a + b}.`, vars: { calls }, views: [view()] });
        return a + b;
      }
      fib(N, "f0");
      F.add({ line: 4, msg: useMemo ? `With memo: **${calls} calls**, one new computation per n: O(n).` : `Without memo: **${calls} calls**. The same subproblems are solved again and again. That grows like φⁿ ≈ 1.618ⁿ, which is exponential.`, vars: { calls }, views: [view()] });
      return F.list;
    },
  });

  /* ---------- backtracking ---------- */
  def("n-queens", {
    title: "N-Queens (backtracking)",
    inputs: [{ key: "n", label: "Board size n (4–6)", value: "4" }],
    code: ["void solve(int r) {", "    if (r == n) { count++; return; }      // placed all queens", "    for (int c = 0; c < n; c++) {", "        if (col[c] || d1[r + c] || d2[r - c + n]) continue;   // attacked", "        place(r, c);                          // choose", "        solve(r + 1);                         // explore", "        remove(r, c);                         // un-choose (backtrack)", "    } }"],
    run(cfg) {
      const n = Math.max(4, Math.min(6, +cfg.n || 4)), F = Frames(); const q = Array(n).fill(-1); let sols = 0, tries = 0;
      const view = (r, c, kind) => {
        const cls = {}; const rows = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (q[i] === j ? "♛" : "")));
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) cls[`${i},${j}`] = "dark";
        q.forEach((j, i) => { if (j >= 0) cls[`${i},${j}`] = "found"; });
        if (r != null && c != null) cls[`${r},${c}`] = kind;
        return { type: "grid", rows, cls, board: true };
      };
      const ok = (r, c) => q.every((j, i) => i >= r || (j !== c && Math.abs(j - c) !== r - i));
      let stop = false;
      (function solve(r) {
        if (stop) return;
        if (r === n) { sols++; F.add({ line: 1, msg: `**Solution #${sols}!** Every row has a queen and none attack each other.`, vars: { solutions: sols, tries }, views: [view()] }); if (sols >= 2) stop = true; return; }
        for (let c = 0; c < n && !stop; c++) {
          tries++;
          if (!ok(r, c)) { F.add({ line: 3, msg: `(${r}, ${c}) is attacked, so skip it.`, vars: { row: r, col: c, tries }, views: [view(r, c, "bad")] }); continue; }
          q[r] = c; F.add({ line: 4, msg: `Place a queen at (${r}, ${c}). Move on to row ${r + 1}.`, vars: { row: r, col: c, tries }, views: [view(r, c, "found")] });
          solve(r + 1);
          if (stop) return;
          q[r] = -1; F.add({ line: 6, msg: `Back at row ${r}: remove the queen from (${r}, ${c}) and try the next column.`, vars: { row: r, col: c, tries }, views: [view(r, c, "cmp")] });
        }
      })(0);
      F.add({ line: 7, msg: `Pruning skips whole subtrees: ${tries} placements tried instead of nⁿ = ${n ** n} blind boards.`, vars: { solutions: sols, tries }, views: [view()] });
      return F.list;
    },
  });

  def("subsets", {
    title: "Subsets: the include / exclude decision tree",
    inputs: [{ key: "arr", label: "Elements (≤ 4)", value: "1 2 3" }],
    code: ["void backtrack(int i, vector<int>& cur) {", "    if (i == n) { all.push_back(cur); return; }", "    cur.push_back(a[i]); backtrack(i + 1, cur);   // include a[i]", "    cur.pop_back();      backtrack(i + 1, cur);   // exclude a[i]", "}"],
    run(cfg) {
      const a = nums(cfg.arr).slice(0, 4), n = a.length, F = Frames();
      const nodes = {}, cls = {}; let uid = 0; const out = [];
      const view = () => ({ type: "tree", nodes: clone(nodes), root: "s0", cls: clone(cls), small: true });
      (function bt(i, cur, id) {
        nodes[id] = { v: `{${cur.join(",")}}`, l: null, r: null }; cls[id] = "cmp";
        F.add({ line: i === n ? 1 : 0, msg: i === n ? `Leaf: record subset **{${cur.join(", ")}}**.` : `Decide whether to include a[${i}] = ${a[i]}. Current: {${cur.join(", ")}}.`, vars: { i, found: out.length + (i === n ? 1 : 0) }, views: [view(), arrView(out.map((s) => `{${s}}`).concat(i === n ? [`{${cur.join(",")}}`] : []), { label: "subsets found" })] });
        if (i === n) { out.push(cur.join(",")); cls[id] = "found"; return; }
        cls[id] = "win";
        const l = "s" + ++uid; nodes[id].l = l; bt(i + 1, [...cur, a[i]], l);
        const r = "s" + ++uid; nodes[id].r = r; bt(i + 1, cur, r);
        cls[id] = "done";
      })(0, [], "s0");
      F.add({ line: 4, msg: `2^${n} = ${2 ** n} leaves = ${2 ** n} subsets. Each takes O(n) to copy, so the total is **O(n · 2ⁿ)**.`, vars: {}, views: [view(), arrView(out.map((s) => `{${s}}`), { label: "subsets found" })] });
      return F.list;
    },
  });

  /* ---------- strings ---------- */
  def("kmp", {
    title: "KMP prefix function (failure table)",
    inputs: [{ key: "p", label: "Pattern", value: "ababaca" }],
    code: ["vector<int> pi(m, 0);   // pi[i] = longest proper prefix of p[0..i] that is also a suffix", "for (int i = 1, k = 0; i < m; i++) {", "    while (k > 0 && p[i] != p[k]) k = pi[k - 1];   // fall back", "    if (p[i] == p[k]) k++;", "    pi[i] = k;", "}"],
    run(cfg) {
      const p = String(cfg.p).slice(0, 14).split(""), m = p.length, pi = Array(m).fill(0), F = Frames();
      const v = (i, k, x = {}) => [arrView(p, { label: "pattern", idx: true, cls: x, ptr: i === k ? { [i]: ["i", "k"] } : { [i]: ["i"], [k]: ["k"] } }), arrView(pi.map((x, j) => (j <= i ? x : "")), { label: "pi", idx: true })];
      let k = 0;
      F.add({ line: 0, msg: "pi[0] = 0. k is the length of the current matched prefix.", vars: { k }, views: v(0, 0) });
      for (let i = 1; i < m; i++) {
        while (k > 0 && p[i] !== p[k]) { const nk = pi[k - 1]; F.add({ line: 2, msg: `p[${i}] = '${p[i]}' ≠ p[${k}] = '${p[k]}'. Fall back: k = pi[${k - 1}] = ${nk}. Reuse the previous matches; never restart from zero.`, vars: { i, k: nk }, views: v(i, k, { [i]: "bad", [k]: "bad" }) }); k = nk; }
        if (p[i] === p[k]) { k++; F.add({ line: 3, msg: `p[${i}] = p[${k - 1}] = '${p[i]}', so extend: k = ${k}.`, vars: { i, k }, views: v(i, k - 1, { [i]: "found", [k - 1]: "found" }) }); }
        pi[i] = k;
        F.add({ line: 4, msg: `pi[${i}] = ${k}: "${p.slice(0, k).join("")}" is both a prefix and a suffix of "${p.slice(0, i + 1).join("")}".`, vars: { i, k }, views: v(i, Math.max(0, k - 1), {}) });
      }
      F.add({ line: 5, msg: "k goes up by at most 1 per step and every fall-back lowers it, so the total work is **O(m)**. Matching against a text works the same way in O(n + m).", vars: {}, views: [arrView(p, { label: "pattern", idx: true }), arrView(pi, { label: "pi", idx: true, cls: Object.fromEntries(pi.map((_, j) => [j, "done"])) })] });
      return F.list;
    },
  });

  def("trie", {
    title: "Trie: insert & prefix search",
    inputs: [{ key: "words", label: "Words to insert", value: "cat car cart dog do" }, { key: "prefix", label: "Prefix to search", value: "car" }],
    code: ["struct Node { Node* ch[26] = {}; bool end = false; };", "void insert(const string& w) {", "    Node* cur = root;", "    for (char c : w) {", "        if (!cur->ch[c - 'a']) cur->ch[c - 'a'] = new Node();", "        cur = cur->ch[c - 'a']; }", "    cur->end = true; }", "bool startsWith(const string& p) { /* same walk; fail on a missing child */ }"],
    run(cfg) {
      const words = String(cfg.words).toLowerCase().split(/[\s,]+/).filter(Boolean).slice(0, 7), pre = String(cfg.prefix || "").toLowerCase(), F = Frames();
      const nodes = { r: { v: "•", kids: [], end: false } }; let uid = 0; const cls = {};
      const child = (id, c) => nodes[id].kids.find((k) => nodes[k].ch === c);
      const view = (x = {}) => ({ type: "forest", nodes: Object.fromEntries(Object.entries(nodes).map(([k, nd]) => [k, { v: nd.v + (nd.end ? "✓" : ""), kids: nd.kids }])), roots: ["r"], cls: Object.assign(clone(cls), x) });
      for (const w of words) {
        let cur = "r";
        for (const c of w) {
          let nx = child(cur, c);
          if (!nx) { nx = "t" + uid++; nodes[nx] = { v: c, ch: c, kids: [], end: false }; nodes[cur].kids.push(nx); F.add({ line: 4, msg: `insert("${w}"): '${c}' is missing, so create a node.`, vars: { word: w }, views: [view({ [nx]: "found" })] }); }
          else F.add({ line: 5, msg: `insert("${w}"): '${c}' already exists. **Shared prefix**, so just walk down.`, vars: { word: w }, views: [view({ [nx]: "cmp" })] });
          cur = nx;
        }
        nodes[cur].end = true;
        F.add({ line: 6, msg: `Mark the end of "${w}" (✓). A word is a path from the root that ends at a ✓ node.`, vars: { word: w }, views: [view({ [cur]: "done" })] });
      }
      let cur = "r"; const path = {};
      for (const c of pre) { const nx = child(cur, c); if (!nx) { F.add({ line: 7, msg: `startsWith("${pre}"): there is no '${c}' child, so **no word has this prefix**.`, vars: {}, views: [view(path)] }); return F.list; } path[nx] = "win"; cur = nx; F.add({ line: 7, msg: `startsWith("${pre}"): follow '${c}'.`, vars: {}, views: [view(path)] }); }
      const under = []; (function col(id, s) { if (nodes[id].end) under.push(s); nodes[id].kids.forEach((k) => col(k, s + nodes[k].ch)); })(cur, pre);
      F.add({ line: 7, msg: `Prefix "${pre}" found in O(${pre.length}) steps. Words with it: **${under.join(", ") || "(none)"}**. The cost depends on the word length, not on how many words are stored.`, vars: {}, views: [view(path)] });
      return F.list;
    },
  });

  /* ---------- special (non-frame) widgets ---------- */
  const SPECIAL = {};

  SPECIAL.growth = function (root) {
    const fns = [
      ["1", () => 1, "O(1)"], ["log n", (n) => Math.log2(n), "O(log n)"], ["√n", (n) => Math.sqrt(n), "O(√n)"], ["n", (n) => n, "O(n)"],
      ["n log n", (n) => n * Math.log2(n), "O(n log n)"], ["n²", (n) => n * n, "O(n²)"], ["n³", (n) => n ** 3, "O(n³)"], ["2ⁿ", (n) => 2 ** n, "O(2ⁿ)"], ["n!", (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }, "O(n!)"],
    ];
    const COLORS = ["#94a3b8", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#f59e0b", "#f97316", "#ef4444", "#be123c"];
    root.innerHTML = `<div class="viz-growth">
      <div class="g-plot"><svg viewBox="0 0 600 300" preserveAspectRatio="none" aria-label="Growth of common complexity functions"></svg></div>
      <div class="g-side"><label class="g-n">n = <b>10</b><input type="range" min="1" max="7" step="0.01" value="1"></label>
      <table class="g-table"><thead><tr><th>Complexity</th><th>operations</th><th>time at 10⁸ ops/s</th></tr></thead><tbody></tbody></table></div></div>`;
    const svg = root.querySelector("svg"), range = root.querySelector("input"), nOut = root.querySelector(".g-n b"), tb = root.querySelector("tbody");
    const fmtT = (ops) => { const s = ops / 1e8; if (!isFinite(s) || s > 3.15e7 * 1e6) return "longer than the universe"; if (s < 1e-6) return "< 1 µs"; if (s < 1e-3) return (s * 1e6).toFixed(0) + " µs"; if (s < 1) return (s * 1e3).toFixed(0) + " ms"; if (s < 120) return s.toFixed(1) + " s"; if (s < 7200) return (s / 60).toFixed(0) + " min"; if (s < 172800) return (s / 3600).toFixed(0) + " h"; if (s < 3.15e7 * 2) return (s / 86400).toFixed(0) + " days"; return (s / 3.15e7).toExponential(1) + " years"; };
    const fmtN = (x) => (!isFinite(x) ? "∞" : x < 1e6 ? Math.round(x).toLocaleString() : x.toExponential(2).replace("e+", " × 10^"));
    function draw() {
      const n = Math.round(10 ** +range.value);
      nOut.textContent = n.toLocaleString();
      const W = 600, H = 300, X = 40;
      let html = "";
      for (let k = 0; k <= 4; k++) html += `<line x1="0" x2="${W}" y1="${(H * k) / 4}" y2="${(H * k) / 4}" class="g-grid"/>`;
      fns.forEach(([name, f], i) => {
        let d = "";
        for (let x = 1; x <= X; x += 0.25) { const y = f(x); const py = H - Math.min(H + 5, (y / (X * X / 1.5)) * H); d += (d ? "L" : "M") + ((x / X) * W).toFixed(1) + "," + py.toFixed(1); }
        html += `<path d="${d}" stroke="${COLORS[i]}" class="g-line"/>`;
      });
      svg.innerHTML = html;
      tb.innerHTML = fns.map(([name, f, label], i) => { const ops = f(n); return `<tr><td><i style="background:${COLORS[i]}"></i>${label}</td><td>${fmtN(ops)}</td><td class="${ops / 1e8 > 1 ? "slow" : ""}">${fmtT(ops)}</td></tr>`; }).join("");
    }
    range.oninput = draw; draw();
  };

  SPECIAL.master = function (root) {
    root.innerHTML = `<div class="viz-master"><div class="m-form">T(n) = <input data-k="a" value="2" size="2"> · T(n / <input data-k="b" value="2" size="2">) + Θ(n^<input data-k="d" value="1" size="3">)</div><div class="m-out"></div></div>`;
    const out = root.querySelector(".m-out");
    const k = (key) => parseFloat(root.querySelector(`[data-k="${key}"]`).value);
    const tex = (s) => (window.katex ? window.katex.renderToString(s, { throwOnError: false }) : esc(s));
    function draw() {
      const a = k("a"), b = k("b"), d = k("d");
      if (!(a >= 1) || !(b > 1) || !(d >= 0)) { out.innerHTML = `<p class="m-bad">Need a ≥ 1, b > 1, d ≥ 0.</p>`; return; }
      const c = Math.log(a) / Math.log(b), cs = (Math.round(c * 1000) / 1000).toString();
      const ratio = a / b ** d;
      let kase, res, why;
      if (Math.abs(c - d) < 1e-9) { kase = 2; res = d === 0 ? "\\Theta(\\log n)" : `\\Theta(n^{${d}} \\log n)`; why = "Every level of the recursion tree does the same work, and there are log_b n levels."; }
      else if (d < c) { kase = 1; res = `\\Theta(n^{${cs}})`; why = "The work grows from level to level, so the leaves (aⁱ subproblems) dominate."; }
      else { kase = 3; res = `\\Theta(n^{${d}})`; why = "The work shrinks from level to level, so the root's own work dominates."; }
      const levels = Array.from({ length: 6 }, (_, i) => ratio ** i);
      const mx = Math.max(...levels);
      out.innerHTML = `<div class="m-row"><span class="ml">critical exponent</span>${tex(`\\log_b a = \\log_{${b}} ${a} = ${cs}`)}</div>
        <div class="m-row"><span class="ml">compare with d = ${d}</span><b>Case ${kase}</b> ${tex(kase === 1 ? `d < \\log_b a` : kase === 2 ? `d = \\log_b a` : `d > \\log_b a`)}</div>
        <div class="m-row big"><span class="ml">result</span>${tex("T(n) = " + res)}</div>
        <p class="m-why">${why} Work per level is ${tex(`n^d \\cdot (a/b^d)^i`)} with ratio ${tex(`a/b^d = ${Math.round(ratio * 1000) / 1000}`)}:</p>
        <div class="m-levels">${levels.map((x, i) => `<div><span>level ${i}</span><i style="width:${Math.max(2, (x / mx) * 100)}%"></i></div>`).join("")}</div>`;
    }
    root.querySelectorAll("input").forEach((i) => (i.oninput = draw));
    draw();
  };

  /* ======================================================================
     RENDERING
     ====================================================================== */
  function renderArray(v, prev) {
    const n = v.items.length;
    const cw = v.bars ? Math.max(18, Math.min(44, Math.floor(620 / Math.max(1, n)) - 6)) : Math.max(34, Math.min(52, Math.floor(640 / Math.max(1, n)) - 6));
    const gap = 6;
    const vals = v.items.map((x) => (x && typeof x === "object" ? x.v : x));
    const maxV = Math.max(1, ...vals.map((x) => Math.abs(+x) || 0));
    const H = v.bars ? 150 : 46;
    const el = document.createElement("div");
    el.className = "vz-array" + (v.bars ? " bars" : "");
    const width = n * (cw + gap) - gap;
    let html = `${v.label ? `<div class="vz-label">${esc(v.label)}</div>` : ""}<div class="vz-track" style="width:${Math.max(width, 10)}px;height:${H + (v.idx ? 18 : 0) + (v.ptr && Object.keys(v.ptr).length ? 34 : 6)}px">`;
    if (v.range && v.range[0] <= v.range[1]) html += `<div class="vz-range" style="left:${v.range[0] * (cw + gap) - 3}px;width:${(v.range[1] - v.range[0] + 1) * (cw + gap) - gap + 6}px;height:${H + 6}px"></div>`;
    v.items.forEach((x, i) => {
      const id = x && typeof x === "object" && x.id != null ? x.id : "i" + i;
      const val = vals[i];
      const cls = (v.cls && v.cls[i]) || "";
      const left = i * (cw + gap);
      if (v.bars) {
        const h = Math.max(6, (Math.abs(+val) / maxV) * (H - 22));
        html += `<div class="vz-cell bar ${cls}" data-id="${esc(id)}" style="left:${left}px;width:${cw}px;height:${h}px;top:${H - h}px"><span>${esc(val)}</span></div>`;
      } else {
        html += `<div class="vz-cell ${cls}" data-id="${esc(id)}" style="left:${left}px;width:${cw}px;height:${H}px;top:0"><span>${esc(val)}</span></div>`;
      }
      if (v.idx) html += `<div class="vz-idx" style="left:${left}px;width:${cw}px;top:${H + 2}px">${i}</div>`;
    });
    if (v.ptr) Object.entries(v.ptr).forEach(([i, names]) => {
      if (+i < 0 || +i >= Math.max(n, 1)) return;
      html += `<div class="vz-ptr" style="left:${+i * (cw + gap)}px;width:${cw}px;top:${H + (v.idx ? 18 : 4)}px">▲<b>${names.map(esc).join(" ")}</b></div>`;
    });
    if (!n) html += `<div class="vz-empty">empty</div>`;
    html += "</div>";
    el.innerHTML = html;
    return el;
  }

  function layoutTree(nodes, root) {
    const pos = {}; let x = 0, maxD = 0;
    (function walk(id, d) { if (!id || !nodes[id]) return; walk(nodes[id].l, d + 1); pos[id] = { x: x++, d }; maxD = Math.max(maxD, d); walk(nodes[id].r, d + 1); })(root, 0);
    return { pos, count: x, maxD };
  }
  function layoutForest(nodes, roots) {
    const pos = {}; let x = 0, maxD = 0;
    (function place(list, d) { list.forEach((id) => { const kids = nodes[id].kids || []; if (!kids.length) { pos[id] = { x: x++, d }; } else { place(kids, d + 1); pos[id] = { x: (pos[kids[0]].x + pos[kids[kids.length - 1]].x) / 2, d }; } maxD = Math.max(maxD, d); }); })(roots, 0);
    return { pos, count: Math.max(1, x), maxD };
  }

  function renderTreeLike(v) {
    const isForest = v.type === "forest";
    const { pos, count, maxD } = isForest ? layoutForest(v.nodes, v.roots) : layoutTree(v.nodes, v.root);
    const small = v.small || count > 12;
    const R = small ? 17 : 20, dx = small ? 46 : 54, dy = small ? 56 : 64;
    const W = Math.max(120, count * dx), H = (maxD + 1) * dy;
    const el = document.createElement("div");
    el.className = "vz-tree";
    const X = (id) => pos[id].x * dx + dx / 2, Y = (id) => pos[id].d * dy + R + 6;
    let lines = "";
    Object.entries(v.nodes).forEach(([id, nd]) => {
      if (!pos[id]) return;
      const kids = isForest ? nd.kids || [] : [nd.l, nd.r].filter(Boolean);
      kids.forEach((k) => { if (pos[k]) lines += `<line x1="${X(id)}" y1="${Y(id)}" x2="${X(k)}" y2="${Y(k)}" class="vz-edge ${v.cls && v.cls[k] ? "e-" + v.cls[k] : ""}"/>`; });
    });
    let html = `${v.label ? `<div class="vz-label">${esc(v.label)}</div>` : ""}<div class="vz-tree-wrap" style="width:${W}px;height:${H + 8}px"><svg width="${W}" height="${H + 8}">${lines}</svg>`;
    Object.entries(v.nodes).forEach(([id, nd]) => {
      if (!pos[id]) return;
      const txt = String(nd.v);
      html += `<div class="vz-node ${(v.cls && v.cls[id]) || ""} ${txt.length > 3 ? "wide" : ""}" data-id="${esc(id)}" style="left:${X(id)}px;top:${Y(id)}px;--r:${R}px"><span>${esc(txt)}</span>${v.tags && v.tags[id] ? `<em>${esc(v.tags[id])}</em>` : ""}</div>`;
    });
    if (!Object.keys(pos).length) html += `<div class="vz-empty">empty tree</div>`;
    el.innerHTML = html + "</div>";
    return el;
  }

  function renderGraph(v) {
    const W = 560, H = 300, R = 19;
    const P = Object.fromEntries(v.nodes.map((n) => [n.id, { x: 30 + n.x * (W - 60), y: 24 + n.y * (H - 48) }]));
    const el = document.createElement("div");
    el.className = "vz-graph";
    let s = `<svg viewBox="0 0 ${W} ${H}" class="vz-gsvg"><defs><marker id="vzarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="vz-arrowhead"/></marker></defs>`;
    v.edges.forEach(([u, w2, wt]) => {
      const a = P[u], b = P[w2]; if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      const x1 = a.x + (dx / L) * R, y1 = a.y + (dy / L) * R, x2 = b.x - (dx / L) * (R + (v.directed ? 3 : 0)), y2 = b.y - (dy / L) * (R + (v.directed ? 3 : 0));
      const c = (v.ecls && (v.ecls[`${u}-${w2}`] || (!v.directed && v.ecls[`${w2}-${u}`]))) || "";
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="vz-gedge ${c}" ${v.directed ? 'marker-end="url(#vzarrow)"' : ""}/>`;
      const hasW = v.edges.some((e) => e[2] !== 1);
      if (hasW) { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; s += `<g class="vz-wt ${c}"><rect x="${mx - 11}" y="${my - 9}" width="22" height="17" rx="5"/><text x="${mx}" y="${my + 4}">${esc(wt)}</text></g>`; }
    });
    v.nodes.forEach((n) => {
      const p = P[n.id], c = (v.cls && v.cls[n.id]) || "";
      s += `<g class="vz-gnode ${c}"><circle cx="${p.x}" cy="${p.y}" r="${R}"/><text x="${p.x}" y="${p.y + 4.5}">${esc(n.label.length > 4 ? n.label.slice(0, 4) : n.label)}</text>${v.tags && v.tags[n.id] != null ? `<text class="vz-gtag" x="${p.x}" y="${p.y - R - 6}">${esc(v.tags[n.id])}</text>` : ""}</g>`;
    });
    el.innerHTML = s + "</svg>";
    return el;
  }

  function renderGrid(v) {
    const el = document.createElement("div");
    el.className = "vz-grid-wrap" + (v.board ? " board" : "");
    const R = v.rows.length, C = Math.max(...v.rows.map((r) => r.length));
    let html = `${v.label ? `<div class="vz-label">${esc(v.label)}</div>` : ""}<table class="vz-grid"><tbody>`;
    if (v.colHead) html += `<tr><th></th>${v.colHead.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
    for (let r = 0; r < R; r++) {
      html += "<tr>" + (v.rowHead ? `<th class="rh">${esc(v.rowHead[r])}</th>` : "");
      for (let c = 0; c < C; c++) html += `<td class="${(v.cls && v.cls[`${r},${c}`]) || ""}">${esc(v.rows[r][c] ?? "")}</td>`;
      html += "</tr>";
    }
    el.innerHTML = html + "</tbody></table>";
    return el;
  }

  function renderList(v) {
    const el = document.createElement("div");
    el.className = "vz-list";
    const n = v.nodes.length, cw = 46, gap = 34, H = 120;
    const W = n * (cw + gap) + 30;
    const X = Object.fromEntries(v.nodes.map((nd, i) => [nd.id, i * (cw + gap) + 4]));
    const y = 44;
    let svg = `<svg width="${W}" height="${H}"><defs><marker id="vzla" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="vz-arrowhead"/></marker></defs>`;
    v.nodes.forEach((nd) => {
      const to = v.next[nd.id];
      const x0 = X[nd.id];
      if (to == null) { svg += `<text x="${x0 + cw + 6}" y="${y + 23}" class="vz-null">${v.nodes.indexOf(nd) === n - 1 || true ? "" : ""}</text>`; return; }
      const x1 = X[to];
      if (x1 > x0) svg += `<path d="M${x0 + cw},${y + 18} L${x1 - 2},${y + 18}" class="vz-larrow" marker-end="url(#vzla)"/>`;
      else svg += `<path d="M${x0 + cw / 2},${y + 36} C${x0 + cw / 2},${y + 75} ${x1 + cw / 2},${y + 75} ${x1 + cw / 2},${y + 38}" class="vz-larrow back" marker-end="url(#vzla)"/>`;
    });
    svg += "</svg>";
    let html = `${v.label ? `<div class="vz-label">${esc(v.label)}</div>` : ""}<div class="vz-list-wrap" style="width:${W}px;height:${H}px">${svg}`;
    v.nodes.forEach((nd) => {
      html += `<div class="vz-lnode ${(v.cls && v.cls[nd.id]) || ""}" data-id="${esc(nd.id)}" style="left:${X[nd.id]}px;top:${y}px;width:${cw}px">${esc(nd.v)}</div>`;
      if (v.next[nd.id] == null) html += `<div class="vz-lnull" style="left:${X[nd.id] + cw + 4}px;top:${y + 8}px">∅</div>`;
      const p = v.ptr && v.ptr[nd.id];
      if (p) html += `<div class="vz-lptr" style="left:${X[nd.id]}px;top:${y - 30}px;width:${cw}px"><b>${p.map(esc).join(" ")}</b>▼</div>`;
    });
    if (v.nullPtrs && v.nullPtrs.length) html += `<div class="vz-lnullptr">${v.nullPtrs.map((p) => `${esc(p)} = nullptr`).join(" · ")}</div>`;
    el.innerHTML = html + "</div>";
    return el;
  }

  function renderKV(v) {
    const el = document.createElement("div");
    el.className = "vz-kv";
    el.innerHTML = `${v.label ? `<div class="vz-label">${esc(v.label)}</div>` : ""}<div class="vz-kv-items">${v.items.length ? v.items.map(([k, x]) => `<span><b>${esc(k)}</b>${esc(x)}</span>`).join("") : '<span class="vz-empty-kv">empty</span>'}</div>`;
    return el;
  }

  function renderView(v) {
    if (v.type === "array") return renderArray(v);
    if (v.type === "tree" || v.type === "forest") return renderTreeLike(v);
    if (v.type === "graph") return renderGraph(v);
    if (v.type === "grid") return renderGrid(v);
    if (v.type === "list") return renderList(v);
    if (v.type === "kv") return renderKV(v);
    return document.createElement("div");
  }

  // Re-render each frame, then FLIP-animate keyed elements (same data-id) from where they were.
  function patchStage(stage, views, animate) {
    const before = {};
    if (animate) stage.querySelectorAll(".vz-view [data-id]").forEach((n) => { before[n.closest(".vz-view").dataset.vi + ":" + n.dataset.id] = n.getBoundingClientRect(); });
    const keepH = stage.offsetHeight;
    stage.style.minHeight = keepH ? keepH + "px" : "";
    stage.innerHTML = "";
    views.forEach((v, i) => { const f = renderView(v); f.classList.add("vz-view"); f.dataset.vi = i; stage.appendChild(f); });
    stage.style.minHeight = "";
    if (!animate) return;
    const moved = [];
    stage.querySelectorAll(".vz-view [data-id]").forEach((n) => {
      const b = before[n.closest(".vz-view").dataset.vi + ":" + n.dataset.id];
      if (!b) return;
      const a = n.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) { n.style.transition = "none"; n.style.transform = `translate(${dx}px, ${dy}px)`; moved.push(n); }
    });
    if (moved.length) { void stage.offsetWidth; moved.forEach((n) => { n.style.transition = ""; n.style.transform = ""; }); }
  }

  function highlightCpp(code) {
    if (!window.CodeMirror || !CodeMirror.runMode) return esc(code);
    let html = "";
    CodeMirror.runMode(code, "text/x-c++src", (text, style) => { html += style ? `<span class="${style.split(" ").map((s) => "tk-" + s).join(" ")}">${esc(text)}</span>` : esc(text); });
    return html;
  }

  const ICON = {
    first: '<path d="M18 6 9 12l9 6V6z"/><path d="M6 6v12"/>', prev: '<path d="m15 18-6-6 6-6"/>', next: '<path d="m9 18 6-6-6-6"/>',
    last: '<path d="m6 6 9 6-9 6V6z"/><path d="M18 6v12"/>', play: '<polygon points="7 4 20 12 7 20 7 4"/>', pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/><circle cx="15.5" cy="8.5" r="1.2"/><circle cx="8.5" cy="15.5" r="1.2"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  };
  const ico = (n) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

  function mount(container, algoName, cfgText, meta = {}) {
    const card = document.createElement("div");
    card.className = "viz-card";
    if (SPECIAL[algoName]) {
      card.innerHTML = `<div class="viz-head"><span class="viz-kicker">${ico("eye")} Visualizer</span><span class="viz-title">${esc(meta.title || (algoName === "growth" ? "How fast do functions grow?" : "Master theorem calculator"))}</span></div><div class="viz-special"></div>`;
      container.appendChild(card);
      SPECIAL[algoName](card.querySelector(".viz-special"));
      return card;
    }
    const algo = ALGOS[algoName];
    if (!algo) { card.innerHTML = `<div class="viz-head">Unknown visualizer: ${esc(algoName)}</div>`; container.appendChild(card); return card; }
    const cfg = {};
    algo.inputs.forEach((i) => (cfg[i.key] = i.value));
    String(cfgText || "").split("\n").forEach((line) => { const m = line.match(/^\s*([\w-]+)\s*[=:]\s*(.*)$/); if (m) cfg[m[1]] = m[2].trim(); });

    card.innerHTML = `
      <div class="viz-head"><span class="viz-kicker">${ico("eye")} Visualizer</span><span class="viz-title">${esc(meta.title || algo.title)}</span></div>
      <div class="viz-inputs">${algo.inputs.map((i) => `<label><span>${esc(i.label)}</span><input data-k="${esc(i.key)}" value="${esc(cfg[i.key])}" spellcheck="false" autocomplete="off"></label>`).join("")}
        <div class="viz-in-btns"><button class="btn viz-apply">Apply</button>${algo.random ? `<button class="btn ghost viz-rand" title="Random input">${ico("dice")}<span class="lbl-sm">Random</span></button>` : ""}</div></div>
      <div class="viz-stage-wrap"><div class="viz-stage"></div></div>
      <div class="viz-msg" aria-live="polite"></div>
      <div class="viz-controls">
        <button class="vbtn v-first" title="First step">${ico("first")}</button>
        <button class="vbtn v-prev" title="Previous step (←)">${ico("prev")}</button>
        <button class="vbtn v-play primary" title="Play / pause (space)">${ico("play")}</button>
        <button class="vbtn v-next" title="Next step (→)">${ico("next")}</button>
        <button class="vbtn v-last" title="Last step">${ico("last")}</button>
        <input type="range" class="v-scrub" min="0" value="0" aria-label="Step">
        <span class="v-count"></span>
        <select class="v-speed" title="Speed"><option value="1600">0.5×</option><option value="900" selected>1×</option><option value="450">2×</option><option value="180">4×</option></select>
      </div>
      <div class="viz-bottom"><pre class="viz-code"></pre><div class="viz-vars"></div></div>`;
    container.appendChild(card);

    const $ = (s) => card.querySelector(s);
    const stage = $(".viz-stage"), msg = $(".viz-msg"), codeEl = $(".viz-code"), varsEl = $(".viz-vars"), scrub = $(".v-scrub"), count = $(".v-count"), playBtn = $(".v-play"), speed = $(".v-speed");
    const codeLines = algo.code.map((l) => `<span class="vl">${highlightCpp(l) || " "}</span>`);
    codeEl.innerHTML = codeLines.join("");
    let frames = [], k = 0, timer = null;

    function build() {
      const input = {};
      card.querySelectorAll(".viz-inputs input").forEach((i) => (input[i.dataset.k] = i.value));
      try { frames = algo.run(input) || []; }
      catch (e) { frames = [{ msg: "Couldn't run with that input: " + e.message, views: [] }]; }
      if (!frames.length) frames = [{ msg: "Nothing to show for that input.", views: [] }];
      stage.innerHTML = "";
      scrub.max = frames.length - 1;
      show(0);
    }
    function show(i) {
      const prevK = k;
      k = Math.max(0, Math.min(frames.length - 1, i));
      const f = frames[k];
      patchStage(stage, f.views || [], Math.abs(k - prevK) === 1);
      msg.innerHTML = md(f.msg || "");
      codeEl.querySelectorAll(".vl").forEach((n, j) => n.classList.toggle("on", j === f.line));
      const vars = Object.entries(f.vars || {});
      varsEl.innerHTML = vars.length ? vars.map(([a, b]) => `<span><b>${esc(a)}</b>${esc(b)}</span>`).join("") : `<span class="muted">—</span>`;
      scrub.value = k;
      count.textContent = `${k + 1} / ${frames.length}`;
      if (k === frames.length - 1) stop();
    }
    function stop() { clearInterval(timer); timer = null; playBtn.innerHTML = ico("play"); card.classList.remove("playing"); }
    function play() {
      if (timer) return stop();
      if (k >= frames.length - 1) show(0);
      playBtn.innerHTML = ico("pause"); card.classList.add("playing");
      timer = setInterval(() => (k < frames.length - 1 ? show(k + 1) : stop()), +speed.value);
    }
    $(".v-first").onclick = () => { stop(); show(0); };
    $(".v-prev").onclick = () => { stop(); show(k - 1); };
    $(".v-next").onclick = () => { stop(); show(k + 1); };
    $(".v-last").onclick = () => { stop(); show(frames.length - 1); };
    playBtn.onclick = play;
    scrub.oninput = () => { stop(); show(+scrub.value); };
    speed.onchange = () => { if (timer) { stop(); play(); } };
    $(".viz-apply").onclick = () => { stop(); build(); };
    card.querySelectorAll(".viz-inputs input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") { stop(); build(); } }));
    if (algo.random) $(".viz-rand").onclick = () => { stop(); const r = algo.random(); Object.entries(r).forEach(([key, val]) => { const inp = card.querySelector(`.viz-inputs input[data-k="${key}"]`); if (inp) inp.value = val; }); build(); };
    card.tabIndex = 0;
    card.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "ArrowRight") { stop(); show(k + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { stop(); show(k - 1); e.preventDefault(); }
      else if (e.key === " ") { play(); e.preventDefault(); }
    });
    build();
    card._stop = stop;
    return card;
  }

  window.VIZ = { mount, names: () => Object.keys(ALGOS).concat(Object.keys(SPECIAL)), has: (n) => !!(ALGOS[n] || SPECIAL[n]) };
})();
