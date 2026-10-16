/* ==========================================================================
   DSA Sheets — helpers for writing tracers (SHEETS.K, passed to trace(input, T, K)).
   Pure data helpers, no DOM, so they run in the browser and in the Node build.
   ========================================================================== */
(function () {
  "use strict";
  const SX = (window.SHEETS = window.SHEETS || {});
  const K = (SX.K = SX.K || {});

  /* level-order array (null = missing) → { nodes:{id:{v,l,r}}, root }. ids are "t<index in the array>" */
  K.tree = function (arr) {
    const nodes = {};
    if (!arr || !arr.length || arr[0] === null) return { nodes, root: null };
    const ids = arr.map((v, i) => (v === null ? null : "t" + i));
    ids.forEach((id, i) => { if (id) nodes[id] = { v: arr[i], l: null, r: null }; });
    const q = [ids[0]]; let h = 0, i = 1;
    while (h < q.length && i < arr.length) {
      const id = q[h++];
      if (i < arr.length) { nodes[id].l = ids[i]; if (ids[i]) q.push(ids[i]); i++; }
      if (i < arr.length) { nodes[id].r = ids[i]; if (ids[i]) q.push(ids[i]); i++; }
    }
    return { nodes, root: ids[0] };
  };

  /* nodes → level-order array with nulls (trailing nulls trimmed): the format the problems print */
  K.treeArr = function (nodes, root) {
    const out = [];
    if (root == null) return out;
    const q = [root]; let h = 0;
    while (h < q.length) {
      const id = q[h++];
      if (id == null) { out.push(null); continue; }
      out.push(nodes[id].v);
      q.push(nodes[id].l == null ? null : nodes[id].l, nodes[id].r == null ? null : nodes[id].r);
    }
    while (out.length && out[out.length - 1] === null) out.pop();
    return out;
  };

  /* a random binary tree with n nodes, as a level-order array (for fuzzing) */
  K.randomTree = function (rnd, n, lo = 0, hi = 9, distinct = false) {
    if (n <= 0) return [];
    const vals = [];
    if (distinct) { const s = new Set(); while (s.size < n) s.add(lo + Math.floor(rnd() * (hi - lo + 1))); vals.push(...s); }
    else for (let i = 0; i < n; i++) vals.push(lo + Math.floor(rnd() * (hi - lo + 1)));
    const nodes = [{ v: vals[0], l: -1, r: -1 }];
    for (let i = 1; i < n; i++) {
      for (;;) {
        const p = Math.floor(rnd() * nodes.length), side = rnd() < 0.5 ? "l" : "r";
        if (nodes[p][side] === -1) { nodes[p][side] = nodes.length; nodes.push({ v: vals[i], l: -1, r: -1 }); break; }
      }
    }
    const out = [], q = [0]; let h = 0;
    while (h < q.length) {
      const i = q[h++];
      if (i === -1) { out.push(null); continue; }
      out.push(nodes[i].v); q.push(nodes[i].l, nodes[i].r);
    }
    while (out.length && out[out.length - 1] === null) out.pop();
    return out;
  };

  /* a left-leaning chain with n nodes (the deepest, most unbalanced tree) as a level-order array */
  K.chain = function (n, side = "l") {
    const a = [1];
    for (let i = 2; i <= n; i++) { if (side === "l") a.push(i, null); else a.push(null, i); }
    if (side === "l") { /* [1,2,null,3,null,...] */ } else a.splice(1, 0);
    return trimNulls(a);
  };
  function trimNulls(a) { while (a.length && a[a.length - 1] === null) a.pop(); return a; }

  /* a perfect-ish balanced tree with n nodes: 1..n in level order */
  K.balanced = function (n) { return Array.from({ length: n }, (_, i) => i + 1); };

  /* a call stack that can be snapshotted into frames for the recursion visualizer */
  K.callStack = function () {
    const frames = []; let id = 0;
    return {
      push(fn, args, locals, pending) { const f = { id: id++, fn, args, locals: locals || "", pending: pending || "", ret: undefined }; frames.push(f); return f; },
      pop() { return frames.pop(); },
      top() { return frames[frames.length - 1]; },
      depth() { return frames.length; },
      snapshot() { return frames.map((f) => ({ id: f.id, fn: f.fn, args: f.args, locals: f.locals, pending: f.pending, ret: f.ret === undefined ? null : f.ret, cls: f.cls })); },
    };
  };

  K.range = (n, from = 0) => Array.from({ length: n }, (_, i) => from + i);
  K.fillArr = (n, v) => Array.from({ length: n }, () => v);
  K.gcd = (a, b) => (b ? K.gcd(b, a % b) : a);
})();
