/* ==========================================================================
   DSA Sheets — visualizers for grids, graphs, DP, intervals and union-find.

   MatrixVisualizer     state { cells[][] | grids[{title,cells,hl,rects,arrows}], hl{"r,c":cls}, valCls{val:cls}, rects[{r0,c0,r1,c1,cls,label}],
                                arrows[{from:[r,c],to:[r,c],cls}], ptr{name:[r,c]}, queue[], arrs[], regs[], note }
   GraphVisualizer      state { nodes[{id,label,x?,y?}], edges[[u,v]], directed, hl{id:cls}, ehl{"u-v":cls}, tags{id:text},
                                queue[{t,cls}] | stack[{t,cls}], arrs[{label,arr,hl}], order[], regs[], note }
   DPTableVisualizer    state { dp | dps[{label,dp,hl,cur,deps,rowHead,colHead}], arrs[{label,arr,hl}], formula, cur, deps[], hl, note }
   IntervalVisualizer   state { lanes[{label,items[{id,s,e,cls,text}]}], axis{min,max}, marks[{x,label,cls}], shades[{s,e,cls,label}], regs[], note }
   UnionFindVisualizer  state { n, parent[], size[], hl{i:cls}, edges[[u,v]], edgeIdx, count, find[], note }
   ========================================================================== */
(function () {
  "use strict";
  const SX = window.SHEETS, P = SX.parts, V = SX.viz;
  const str = P.str;

  function regsRow(S, regs, y, x0 = 18) {
    (regs || []).forEach((r, i) => {
      S.label(`reg${i}:k`, { x: x0 + i * 140, y: y + 6, text: r.k, anchor: "l", cls: "title" });
      S.box(`reg${i}`, { x: x0 + i * 140, y: y + 18, w: 124, h: 38, text: str(r.v), cls: "flat " + (r.cls || ""), size: 15 });
    });
    return regs && regs.length ? y + 68 : y;
  }
  function arrRows(S, arrs, y, x0 = 18) {
    (arrs || []).forEach((a, k) => {
      S.label(`ar${k}:k`, { x: x0, y: y + 6, text: a.label, anchor: "l", cls: "title" });
      const g = P.cells(S, `ar${k}`, a.arr, { x: x0, y: y + 34, hl: a.hl, sub: true, cw: a.cw ?? 40, ch: 36, size: a.size });
      g.subbed = true;
      P.pointers(S, `arp${k}`, g, a.ptr, { side: "top" });
      y += 92;
    });
    return y;
  }

  /* ------------------------------------------------------------ matrix */
  V.matrix = {
    label: "Matrix", legend: [["cur", "current cell"], ["cmp", "neighbour being checked"], ["ok", "visited / done"], ["bad", "blocked / zeroed"], ["win", "frontier"], ["hit", "result"], ["dim", "water / empty"]],
    render(S, st) {
      const grids = st.grids || [{ title: st.title || "grid", cells: st.cells, hl: st.hl, rects: st.rects, arrows: st.arrows, rowHead: st.rowHead, colHead: st.colHead }];
      let x = 18, bottom = 0;
      const cw = st.cw ?? (grids[0].cells[0] && grids[0].cells[0].length > 7 ? 34 : 42), ch = st.ch ?? cw - 2;
      grids.forEach((G, k) => {
        P.title(S, `gt${k}`, x, 16, G.title || "");
        const hl = {};
        const vc = st.valCls || {};
        G.cells.forEach((row, r) => row.forEach((v, c) => { const key = r + "," + c; hl[key] = (G.hl && G.hl[key]) || vc[String(v)] || ""; }));
        const g = P.grid(S, `g${k}_`, G.cells, { x, y: 24, cw, ch, hl, size: st.size ?? 14, rowHead: G.rowHead || (st.numbered ? G.cells.map((_, i) => i) : null), colHead: G.colHead || (st.numbered ? G.cells[0].map((_, i) => i) : null) });
        (G.rects || []).forEach((rc, i) => S.region(`g${k}rc${i}`, { x: g.X(rc.c0) - 5, y: g.Y(rc.r0) - 5, w: g.X(rc.c1) + cw - g.X(rc.c0) + 10, h: g.Y(rc.r1) + ch - g.Y(rc.r0) + 10, cls: rc.cls || "win solid", label: rc.label || "", from: { x: g.X(rc.c0) - 5, y: g.Y(rc.r0) - 5, w: g.X(rc.c1) + cw - g.X(rc.c0) + 10, h: g.Y(rc.r1) + ch - g.Y(rc.r0) + 10 } }));
        (G.arrows || []).forEach((a, i) => S.edge(`g${k}ar${i}`, { from: g.id(a.from[0], a.from[1]), to: g.id(a.to[0], a.to[1]), cls: a.cls || "hot", curve: a.curve ?? 0, label: a.label || "" }));
        for (const name in (k === 0 ? st.ptr : null) || {}) {
          const p = st.ptr[name]; if (!p) continue;
          const px = g.X(p[1]) + cw / 2, py = g.Y(p[0]) - 3;
          S.ptr(`mp:${name}`, { x: px, y: py, dir: "down", text: name, cls: P.ptrCls(name), from: { x: px, y: py } });
        }
        x += g.W + (G.rowHead || st.numbered ? 36 : 0) + 56;
        bottom = Math.max(bottom, 24 + (G.colHead || st.numbered ? 26 : 0) + g.H + 24);
      });
      const px = x + 4;
      if (st.queue) P.queue(S, "q", st.queue, { x: px, y: 60, w: 50, h: 40, title: st.queueTitle || "queue" });
      if (st.stack) P.stack(S, "s", st.stack, { x: px + 20, y: 50, title: st.stackTitle || "stack" });
      let y = bottom + 8;
      y = arrRows(S, st.arrs, y);
      y = regsRow(S, st.regs, y);
      if (st.note) S.label("note", { x: 18, y: y + 4, text: st.note, anchor: "l", cls: "muted" });
    },
  };

  /* ------------------------------------------------------------ graph */
  function layoutGraph(nodes, edges) {
    if (!nodes.length) return { pos: {}, W: 240, H: 90 };
    if (nodes.every((n) => n.x != null)) return { pos: Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }])), W: Math.max(...nodes.map((n) => n.x)) + 40, H: Math.max(...nodes.map((n) => n.y)) + 40 };
    const ids = nodes.map((n) => n.id), adj = Object.fromEntries(ids.map((i) => [i, []]));
    edges.forEach(([u, v]) => { if (adj[u] && adj[v]) { adj[u].push(v); adj[v].push(u); } });
    const depth = {}, cols = {};
    let xoff = 0, maxD = 0;
    const pos = {};
    for (const s of ids) {
      if (depth[s] != null) continue;
      depth[s] = 0; const q = [s], order = [s];
      while (q.length) { const u = q.shift(); for (const v of adj[u]) if (depth[v] == null) { depth[v] = depth[u] + 1; q.push(v); order.push(v); } }
      const byD = {};
      order.forEach((i) => (byD[depth[i]] = byD[depth[i]] || []).push(i));
      const width = Math.max(...Object.values(byD).map((a) => a.length));
      Object.keys(byD).forEach((d) => byD[d].forEach((i, k) => { pos[i] = { x: 40 + xoff + (k + (width - byD[d].length) / 2) * 84, y: 46 + d * 84 }; maxD = Math.max(maxD, +d); }));
      xoff += width * 84 + 30;
    }
    return { pos, W: Math.max(...Object.values(pos).map((p) => p.x)) + 44, H: 46 + maxD * 84 + 44 };
  }
  V.graph = {
    label: "Graph", legend: [["cur", "current node"], ["win", "in the frontier"], ["ok", "visited / done"], ["cmp", "neighbour"], ["bad", "problem"], ["dim", "not yet reached"]],
    render(S, st) {
      const lay = layoutGraph(st.nodes, st.edges);
      P.title(S, "t0", 18, 16, st.label || "graph");
      const r = 20;
      st.nodes.forEach((n) => {
        const p = lay.pos[n.id], cls = (st.hl && st.hl[n.id]) || "";
        S.box(`n${n.id}`, { x: p.x - r + 18, y: p.y - r + 22, w: r * 2, h: r * 2, text: str(n.label ?? n.id), cls: "circle " + cls, size: 14, sub: st.tags && st.tags[n.id] != null ? st.tags[n.id] : undefined, from: { x: p.x - r + 18, y: p.y - r + 22 - 20 } });
      });
      st.edges.forEach(([u, v, dir], i) => {
        const key = `${u}-${v}`, key2 = `${v}-${u}`;
        const arrow = !!st.directed || dir === true;
        const cls = (st.ehl && (st.ehl[key] || (!arrow && st.ehl[key2]))) || "";
        S.edge(`e${key}`, { from: `n${u}`, to: `n${v}`, arrow, cls: cls + (arrow ? "" : " plain"), curve: (st.curves && st.curves[key]) || 0, gap: 1 });
      });
      let px = lay.W + 54;
      if (st.queue) P.queue(S, "q", st.queue, { x: px, y: 56, w: 46, h: 40, title: st.queueTitle || "queue" });
      if (st.stack) P.stack(S, "s", st.stack, { x: px + 20, y: 46, title: st.stackTitle || "stack" });
      let y = lay.H + 24 + 20;
      y = arrRows(S, st.arrs, y);
      if (st.order) {
        S.label("ord:k", { x: 18, y: y + 6, text: st.orderLabel || "visit order", anchor: "l", cls: "title" });
        st.order.forEach((v, k) => S.box(`ord${k}`, { x: 18 + k * 44, y: y + 18, w: 36, h: 32, text: str(v), cls: "pill ok", size: 13, from: { x: 18 + k * 44, y: y } }));
        if (!st.order.length) S.label("ord:none", { x: 18, y: y + 34, text: "(nothing yet)", anchor: "l", cls: "muted" });
        y += 62;
      }
      y = regsRow(S, st.regs, y);
      if (st.note) S.label("note", { x: 18, y: y + 4, text: st.note, anchor: "l", cls: "muted" });
    },
  };

  /* ------------------------------------------------------------ dynamic programming table */
  V.dp = {
    label: "DP table", legend: [["cur", "cell being computed"], ["cmp", "cells it depends on"], ["ok", "already computed"], ["hit", "the answer"], ["empty", "not computed yet"]],
    render(S, st) {
      let y = 12, maxW = 0;
      y = arrRows(S, st.arrs, y);
      const tabs = st.dps || [{ label: st.label || "dp", dp: st.dp, hl: st.hl, cur: st.cur, deps: st.deps, rowHead: st.rowHead, colHead: st.colHead, depLabels: st.depLabels }];
      tabs.forEach((T, k) => {
        const is2 = Array.isArray(T.dp[0]);
        S.label(`dp${k}:k`, { x: 18, y: y + 6, text: T.label || "dp", anchor: "l", cls: "title" });
        const ids = [];
        if (!is2) {
          const g = P.cells(S, `dp${k}`, T.dp.map((v) => (v === null || v === undefined ? "·" : v)), { x: 18, y: y + 84, hl: Object.assign(Object.fromEntries(T.dp.map((v, i) => [i, v === null || v === undefined ? "empty" : "ok"])), T.hl || {}), sub: T.colHead || true, cw: T.dp.length > 14 ? 36 : 44, ch: 40, size: 14 });
          g.subbed = true;
          const cur = T.cur;
          (T.deps || []).forEach((d, i) => { if (d == null || cur == null || d === cur) return; S.edge(`dp${k}d${i}`, { from: g.id(d), to: g.id(cur), fromPort: "t", toPort: "t", curve: -Math.min(70, 14 + Math.abs(cur - d) * 9), cls: "cmp", label: T.depLabels ? T.depLabels[i] : "" }); });
          maxW = Math.max(maxW, g.W + 36);
          y += 84 + 40 + 56;
        } else {
          const R = T.dp.length, C = T.dp[0].length;
          const hl = {};
          T.dp.forEach((row, r) => row.forEach((v, c) => { hl[r + "," + c] = v === null || v === undefined ? "empty" : "ok"; }));
          Object.assign(hl, T.hl || {});
          const g = P.grid(S, `dp${k}`, T.dp.map((row) => row.map((v) => (v === null || v === undefined ? "·" : v))), { x: 18, y: y + 20, cw: C > 9 ? 36 : 44, ch: 38, hl, rowHead: T.rowHead, colHead: T.colHead, size: 14 });
          const cur = T.cur;
          (T.deps || []).forEach((d, i) => { if (!d || !cur) return; S.edge(`dp${k}d${i}`, { from: g.id(d[0], d[1]), to: g.id(cur[0], cur[1]), cls: "cmp", curve: 0, label: T.depLabels ? T.depLabels[i] : "" }); });
          maxW = Math.max(maxW, g.W + 80);
          y += 20 + (T.colHead ? 26 : 0) + g.H + 30;
        }
      });
      if (st.formula) {
        S.label("formula:k", { x: 18, y: y + 4, text: "recurrence, with this step's numbers", anchor: "l", cls: "title" });
        S.label("formula", { x: 18, y: y + 30, text: st.formula, anchor: "l", cls: "hot", size: 14 });
        y += 56;
      }
      y = regsRow(S, st.regs, y);
      if (st.note) S.label("note", { x: 18, y: y + 4, text: st.note, anchor: "l", cls: "muted" });
    },
  };

  /* ------------------------------------------------------------ intervals on a number line */
  V.interval = {
    label: "Intervals", legend: [["cur", "interval being processed"], ["cmp", "overlap check"], ["ok", "kept / merged result"], ["bad", "removed / conflict"], ["win", "sorted input"], ["hit", "newly inserted"], ["dim", "not yet reached"]],
    render(S, st) {
      const lanes = st.lanes, axis = st.axis;
      const lo = axis.min, hi = axis.max, span = Math.max(1, hi - lo);
      const x0 = 120, scale = Math.max(14, Math.min(44, 600 / span)), LH = 40, gap = 10;
      const X = (v) => x0 + (v - lo) * scale;
      P.title(S, "t0", 18, 16, st.label || "number line");
      for (let v = lo; v <= hi; v += Math.max(1, Math.ceil(span / 24))) {
        S.label(`tick${v}`, { x: X(v), y: 34, text: String(v), cls: "muted" });
        S.edge(`tg${v}`, { from: { x: X(v), y: 46 }, to: { x: X(v), y: 52 + lanes.length * (LH + gap) }, arrow: false, cls: "thin plain dim" });
      }
      (st.shades || []).forEach((sh, i) => S.region(`sh${i}`, { x: X(sh.s), y: 48, w: Math.max(6, (sh.e - sh.s) * scale), h: lanes.length * (LH + gap) + 8, cls: sh.cls || "cmp", label: sh.label || "", z: 0, from: { x: X(sh.s), y: 48, w: Math.max(6, (sh.e - sh.s) * scale), h: lanes.length * (LH + gap) + 8 } }));
      lanes.forEach((L, r) => {
        const ly = 56 + r * (LH + gap);
        S.label(`ln${r}`, { x: x0 - 14, y: ly + LH / 2, text: L.label || "", anchor: "r", cls: "muted" });
        L.items.forEach((it) => {
          const w = Math.max(24, (it.e - it.s) * scale);
          S.box(`iv${it.id}`, { x: X(it.s), y: ly, w, h: LH, text: it.text ?? `[${it.s}, ${it.e}]`, cls: "flat " + (it.cls || "win"), size: 12, from: { x: X(it.s), y: ly - 12 } });
        });
      });
      (st.marks || []).forEach((m, i) => {
        S.edge(`mk${i}`, { from: { x: X(m.x), y: 44 }, to: { x: X(m.x), y: 54 + lanes.length * (LH + gap) }, arrow: false, cls: m.cls || "hot" });
        S.label(`mkl${i}`, { x: X(m.x), y: 60 + lanes.length * (LH + gap), text: m.label, cls: m.cls === "bad" ? "bad" : "hot" });
      });
      let y = 56 + lanes.length * (LH + gap) + 30;
      y = arrRows(S, st.arrs, y);
      y = regsRow(S, st.regs, y);
      if (st.note) S.label("note", { x: 18, y: y + 4, text: st.note, anchor: "l", cls: "muted" });
    },
  };

  /* ------------------------------------------------------------ union-find forest */
  V.unionfind = {
    label: "Union-Find", legend: [["cur", "node being looked at"], ["win", "root"], ["ok", "joined"], ["bad", "already connected (cycle)"], ["cmp", "on the find path"]],
    render(S, st) {
      const n = st.parent.length, parent = st.parent;
      const nodes = {};
      for (let i = 0; i < n; i++) nodes[i] = { kids: [] };
      const roots = [];
      for (let i = 0; i < n; i++) { if (parent[i] === i) roots.push(i); else nodes[parent[i]].kids.push(i); }
      let y = 12;
      if (st.edges) {
        S.label("el:k", { x: 18, y: y + 6, text: st.edgesLabel || "edges to process", anchor: "l", cls: "title" });
        st.edges.forEach((e, k) => S.box(`ed${k}`, { x: 18 + k * 74, y: y + 18, w: 66, h: 32, text: `${e[0]}–${e[1]}`, cls: "pill " + (k < st.edgeIdx ? "ok" : k === st.edgeIdx ? "cur" : "dim"), size: 13 }));
        y += 66;
      }
      P.title(S, "ft", 18, y + 6, "the forest  (each arrow points to a parent; a root points to itself)");
      const lay = P.naryLayout(nodes, roots, { x: 40, y: y + 44, gx: 58, gy: 62, rootGap: 0.7 });
      for (let i = 0; i < n; i++) {
        const p = lay.pos[i]; if (!p) continue;
        const cls = (st.hl && st.hl[i]) || (parent[i] === i ? "win" : "");
        S.box(`u${i}`, { x: p.x - 18, y: p.y - 18, w: 36, h: 36, text: i, cls: "circle " + cls, size: 14 });
        if (parent[i] === i && st.size) S.label(`usz${i}`, { x: p.x + 24, y: p.y, text: `size ${st.size[i]}`, anchor: "l", cls: "muted" });
        if (parent[i] !== i) S.edge(`pe${i}`, { from: `u${i}`, to: `u${parent[i]}`, cls: (st.find && st.find.includes(i)) ? "cmp" : "", gap: 1 });
      }
      y = y + 44 + lay.H + 64;
      y = regsRow(S, st.count != null ? [{ k: "components", v: st.count, cls: "hit" }].concat(st.regs || []) : st.regs, y);
      if (st.note) S.label("note", { x: 18, y: y + 4, text: st.note, anchor: "l", cls: "muted" });
    },
  };
})();
