/* ==========================================================================
   DSA Sheets — visualizers for linked structures and trees.

   LinkedListVisualizer  state { nodes[{id,val,slot,row,sub}], next{id:id|null}, ptr{name:id|null}, hl{id:cls},
                                  ehl{id:cls}, nullRow, label, note, rows[] (extra labelled lists) }
                         Arrows are drawn from `next`; when a link changes the arrow SWINGS to its new target.
   TreeVisualizer        state { nodes{id:{v,l,r}}, root, hl, ehl, sub, ptr{name:id}, label, note,
                                  trees[{label,nodes,root,hl}], out{label,items}, arrs[{label,arr,hl,ptr}], map }
   RecursionVisualizer   = TreeVisualizer + calls[{id,fn,args,locals,pending,ret,cls}]   (the call stack)
   QueueVisualizer       = TreeVisualizer + queue[{id,t,cls}]  + out
   BacktrackingVisualizer state { dtree{nodes{id:{v,kids,cls}},root}, cur, path[], hl, grid{cells,hl}, calls, note }
   TrieVisualizer        state { nodes{id:{ch,kids{c:id},end}}, root, hl, word, i, found[], grid }
   HeapVisualizer        state { heaps[{name,min,items[{id,v}],hl}], arr, ptr, regs, lists, out, levels, note }
   ========================================================================== */
(function () {
  "use strict";
  const SX = window.SHEETS, P = SX.parts, V = SX.viz;
  const str = P.str;

  /* ------------------------------------------------------------ linked list */
  V.list = {
    label: "Linked list", legend: [["cur", "curr / current"], ["cmp", "compared"], ["ok", "done / in place"], ["bad", "problem"], ["win", "other list"], ["dim", "not yet reached"]],
    render(S, st) {
      const nodes = st.nodes, next = st.next || {};
      const off = st.nullLeft ? 1 : 0;
      const X = (slot) => 34 + (slot + off) * 98, rowGap = st.rowGap ?? 118, Y = (row) => 70 + row * rowGap;
      const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
      const maxSlot = Math.max(0, ...nodes.map((n) => n.slot));
      const rows = [...new Set(nodes.map((n) => n.row || 0))].sort((a, b) => a - b);
      P.title(S, "t0", 18, 16, st.label || "linked list");
      (st.rowLabels || []).forEach((t, r) => S.label(`rl${r}`, { x: 18, y: Y(r) - 34, text: t, anchor: "l", cls: "title" }));
      nodes.forEach((n) => {
        S.box(`n${n.id}`, { x: X(n.slot), y: Y(n.row || 0), w: 58, h: 40, text: str(n.val), cls: "flat " + ((st.hl && st.hl[n.id]) || ""), sub: n.sub, from: { x: X(n.slot), y: Y(n.row || 0) - 26 }, size: 15 });
      });
      if (!st.noNull) rows.filter((r) => !st.nullRows || st.nullRows.includes(r)).forEach((r) => S.box(`nul${r}`, { x: X(maxSlot + 1), y: Y(r) + 4, w: 48, h: 32, text: "null", cls: "ghost pill", size: 12 }));
      if (st.nullLeft) S.box("nulL", { x: X(-1), y: Y(0) + 4, w: 48, h: 32, text: "null", cls: "ghost pill", size: 12 });
      nodes.forEach((n) => {
        if (!(n.id in next)) return;
        const t = next[n.id], a = n, ra = n.row || 0;
        const cls = (st.ehl && st.ehl[n.id]) || "";
        if (t === "nullL") { S.edge(`e${n.id}`, n.slot === 0 ? { from: `n${n.id}`, to: "nulL", fromPort: "l", toPort: "r", cls } : { from: `n${n.id}`, to: "nulL", fromPort: "b", toPort: "b", curve: 30 + n.slot * 8, cls }); return; }
        if (t === null || t === undefined) { if (!st.noNull && (!st.nullRows || st.nullRows.includes(ra))) S.edge(`e${n.id}`, { from: `n${n.id}`, to: `nul${ra}`, fromPort: "r", toPort: "l", cls }); return; }
        const b = byId[t]; if (!b) return;
        const rb = b.row || 0;
        let o = { from: `n${n.id}`, to: `n${t}`, cls };
        if (ra === rb && b.slot === a.slot + 1) Object.assign(o, { fromPort: "r", toPort: "l", curve: 0 });
        else if (ra === rb && b.slot > a.slot + 1) Object.assign(o, { fromPort: "t", toPort: "t", curve: -(24 + (b.slot - a.slot) * 7) });
        else if (ra === rb && b.slot === a.slot) {
          // a node linked to itself: a small loop at its lower right corner
          const px = X(a.slot), py = Y(ra);
          Object.assign(o, { from: { x: px + 58, y: py + 10 }, to: { x: px + 42, y: py + 40 }, curve: -50 });
        }
        else if (ra === rb) Object.assign(o, { fromPort: "b", toPort: "b", curve: -(30 + (a.slot - b.slot) * 6) });   // going back: swing below the row
        else Object.assign(o, { curve: 0 });
        S.edge(`e${n.id}`, o);
      });
      // pointers: one marker per NAME (so they glide), stacked when they share a node
      const stacks = {};
      for (const name in st.ptr || {}) {
        let t = st.ptr[name];
        if (t === undefined) continue;
        const bottom = /^(next|nxt|fast|tmp|after|second|r)$/i.test(name) || (st.ptrBottom || []).includes(name);
        let x, y0, w;
        if (t === "nullL") { x = X(-1) + 24; y0 = Y(0); }
        else if (t === null) { const r = st.nullRow ?? rows[0] ?? 0; x = X(maxSlot + 1) + 24; y0 = Y(r); }
        else { const n = byId[t]; if (!n) continue; x = X(n.slot) + 29; y0 = Y(n.row || 0); }
        const key = (bottom ? "b" : "t") + Math.round(x) + "_" + Math.round(y0);
        const k = (stacks[key] = (stacks[key] || 0) + 1) - 1;
        const y = bottom ? y0 + 40 + 20 + (st.ptrDrop || 0) + k * 24 : y0 - 6 - k * 24;
        S.ptr(`lp:${name}`, { x, y, dir: bottom ? "up" : "down", text: name, cls: P.ptrCls(name), from: { x, y } });
      }
      const bottomY = Y(rows[rows.length - 1] || 0) + 92 + (st.ptrDrop || 0);
      if (st.note) S.label("note", { x: 18, y: bottomY, text: st.note, anchor: "l", cls: "muted" });
      if (st.out) {
        const g = P.cells(S, "out", st.out.items, { x: 120, y: bottomY + 22, cw: 40, ch: 36, hl: st.out.hl, sub: true });
        S.label("out:k", { x: 108, y: bottomY + 40, text: st.out.label || "result", anchor: "r", cls: "hot" });
      }
    },
  };

  /* ------------------------------------------------------------ tree family */
  function callStack(S, calls, x, y) {
    const fh = 54, fw = 214, gap = 6, slots = Math.max(4, calls.length + 1), H = slots * (fh + gap);
    P.title(S, "cs:t", x, y - 10, "call stack  (top = running)");
    S.edge("cs:wl", { from: { x: x - 8, y }, to: { x: x - 8, y: y + H }, arrow: false, cls: "plain" });
    S.edge("cs:wr", { from: { x: x + fw + 8, y }, to: { x: x + fw + 8, y: y + H }, arrow: false, cls: "plain" });
    S.edge("cs:wb", { from: { x: x - 8, y: y + H }, to: { x: x + fw + 8, y: y + H }, arrow: false, cls: "plain" });
    calls.forEach((c, i) => {
      const top = i === calls.length - 1;
      const fy = y + H - (i + 1) * (fh + gap) + gap / 2;
      const l2 = c.ret !== undefined && c.ret !== null ? `returns ${str(c.ret)}` : c.pending || "";
      S.box(`call${c.id}`, { x, y: fy, w: fw, h: fh, text: `${c.fn}(${c.args})\n${c.locals ? c.locals + "  " : ""}${l2 ? "→ " + l2 : ""}`, cls: "flat " + (c.cls || (c.ret !== undefined && c.ret !== null ? "ok" : top ? "cur" : "")), size: 12, from: { x, y: fy - 80 }, z: 3 });
    });
    return { x, y, w: fw, h: H, id: (c) => `call${c.id}` };
  }

  function treeBase(S, st, o = {}) {
    const trees = st.trees || [{ label: st.label, nodes: st.nodes, root: st.root, hl: st.hl, ehl: st.ehl, sub: st.sub }];
    let x = 24, bottom = 60, treeRight = 0, firstG = null;
    trees.forEach((tr, k) => {
      P.title(S, `tl${k}`, x - 6, 16, tr.label || (k === 0 ? "binary tree" : ""));
      const g = P.tree(S, `t${k}`, tr.nodes, tr.root, { x: x + 12, y: 52, hl: tr.hl, ehl: tr.ehl, sub: tr.sub, r: 19, gx: st.gx ?? 50, gy: st.gy ?? 64 });
      if (!firstG) firstG = g;
      const w = Math.max(80, g.lay.W + 40);
      if (!Object.keys(tr.nodes || {}).length) S.label(`te${k}`, { x: x + 40, y: 70, text: "(empty tree)", cls: "muted" });
      // pointers on nodes (p, q, node …)
      for (const name in (tr.ptr || st.ptr || {})) {
        const id = (tr.ptr || st.ptr)[name]; if (id == null || !g.lay.pos[id]) continue;
        const pos = g.lay.pos[id];
        S.ptr(`tp${k}:${name}`, { x: pos.x, y: pos.y - 24, dir: "down", text: name, cls: P.ptrCls(name), from: { x: pos.x, y: pos.y - 24 } });
      }
      x += w + 36;
      treeRight = Math.max(treeRight, x);
      bottom = Math.max(bottom, 52 + g.lay.H + 40 + 14);
    });
    if (st.treeNote) S.label("tnote", { x: 24, y: bottom - 6, text: st.treeNote, anchor: "l", cls: "hot" });
    const px = Math.max(treeRight + 30, 330);
    if (st.calls) callStack(S, st.calls, px, 44);
    let y = bottom + 24;
    if (st.queue) {
      const q = P.queue(S, "q", st.queue, { x: 24, y: y + 14, w: 46, h: 40, title: st.queueTitle || "queue" });
      y += 102;
    }
    if (st.out) {
      S.label("out:k", { x: 24, y: y + 8, text: st.out.label || "output", anchor: "l", cls: "title" });
      const items = st.out.items || [];
      if (st.out.nested) {
        items.forEach((row, r) => { P.cells(S, `outr${r}`, row, { x: 24, y: y + 22 + r * 46, cw: 36, ch: 34, hl: {} }); });
        y += 22 + Math.max(1, items.length) * 46;
      } else { P.cells(S, "out", items, { x: 24, y: y + 22, cw: st.out.cw ?? 40, ch: 36, hl: st.out.hl, size: st.out.size }); y += 74; }
    }
    (st.arrs || []).forEach((a, k) => {
      S.label(`ar${k}:k`, { x: 24, y: y + 8, text: a.label, anchor: "l", cls: "title" });
      const g = P.cells(S, `ar${k}`, a.arr, { x: 24, y: y + 38, hl: a.hl, sub: true, cw: 40, ch: 38 });
      g.subbed = true;
      P.pointers(S, `arp${k}`, g, a.ptr, { side: "top" });
      if (a.spans) a.spans.forEach((sp, j) => P.span(S, `ars${k}_${j}`, g, sp.from, sp.to, sp.cls, sp.label, { down: 14 }));
      y += 100;
    });
    if (st.map) { const m = P.map(S, "mp", st.map, { x: 24, y: y + 4 }); y += m.h + 10; }
    if (st.note) S.label("note", { x: 24, y: y + 6, text: st.note, anchor: "l", cls: "muted" });
    return { y };
  }

  const TREE_LEG = [["cur", "current node"], ["cmp", "comparing"], ["ok", "finished"], ["bad", "violation"], ["hit", "found"], ["win", "in range / visiting"], ["dim", "not visited"]];
  V.tree = { label: "Binary tree", legend: TREE_LEG, render(S, st) { return treeBase(S, st); } };
  V.recursion = { label: "Recursion", legend: [["cur", "node being processed"], ["ok", "returned a value"], ["win", "on the call path"], ["dim", "not visited"], ["bad", "violation"]], render(S, st) { return treeBase(S, st); } };
  V.queue = { label: "Queue", legend: [["cur", "node just dequeued"], ["win", "in the queue"], ["ok", "visited"], ["dim", "not reached"]], render(S, st) { return treeBase(S, st); } };

  /* ------------------------------------------------------------ backtracking: the decision tree */
  V.backtracking = {
    label: "Backtracking", legend: [["cur", "choose / explore"], ["ok", "success"], ["bad", "dead end: undo"], ["win", "on the current path"], ["dim", "tried, abandoned"]],
    render(S, st) {
      const d = st.dtree;
      let x0 = 24, y0 = 44;
      let leftW = 0;
      if (st.grid) {
        P.title(S, "gt", 18, 16, st.grid.title || "board");
        const g = P.grid(S, "g", st.grid.cells, { x: 18, y: 26, cw: 38, ch: 36, hl: st.grid.hl, size: 15 });
        leftW = g.W + 50; y0 = 44;
        if (st.grid.note) S.label("gnote", { x: 18, y: g.Y(g.R - 1) + g.ch + 22, text: st.grid.note, anchor: "l", cls: "muted" });
      }
      const hdrX = x0 + leftW;
      P.title(S, "dt", hdrX - 6, 16, st.treeLabel || "decision tree  (each node = one call)");
      const nodes = {};
      Object.keys(d.nodes).forEach((id) => { nodes[id] = d.nodes[id]; });
      const lay = P.naryLayout(nodes, d.root, { x: hdrX + 14, y: 56, gx: st.gx ?? 46, gy: st.gy ?? 58 });
      for (const id in lay.pos) {
        const n = nodes[id], p = lay.pos[id], cls = (st.hl && st.hl[id]) || n.cls || "";
        S.box(`d${id}`, { x: p.x - 17, y: p.y - 17, w: 34, h: 34, text: str(n.v), cls: "circle " + cls, size: 12, from: { x: p.x - 17, y: p.y - 40 }, sub: n.sub });
        (n.kids || []).forEach((k) => { if (nodes[k]) S.edge(`de${id}>${k}`, { from: `d${id}`, to: `d${k}`, arrow: false, cls: (st.ehl && st.ehl[k]) || (st.hl && st.hl[k] && st.hl[k] !== "dim" ? "hot" : ""), label: nodes[k].via != null ? String(nodes[k].via) : "", gap: 1 }); });
      }
      const bottom = 56 + lay.H + 44;
      let y = Math.max(bottom, st.grid ? 56 + st.grid.cells.length * 40 + 40 : 0);
      if (st.path) {
        S.label("path:k", { x: 18, y: y + 8, text: st.pathLabel || "current path", anchor: "l", cls: "title" });
        P.cells(S, "path", st.path.length ? st.path : ["∅"], { x: 18, y: y + 22, cw: 42, ch: 34, hl: st.path.length ? Object.fromEntries(st.path.map((_, i) => [i, "win"])) : { 0: "empty" } });
        y += 70;
      }
      if (st.regs) st.regs.forEach((r, i) => { S.label(`reg${i}:k`, { x: 18 + i * 140, y: y + 6, text: r.k, anchor: "l", cls: "title" }); S.box(`reg${i}`, { x: 18 + i * 140, y: y + 18, w: 124, h: 38, text: str(r.v), cls: "flat " + (r.cls || ""), size: 15 }); });
      if (st.regs) y += 66;
      if (st.calls) callStack(S, st.calls, Math.max(hdrX + lay.W + 90, 420), 44);
      if (st.note) S.label("note", { x: 18, y: y + 4, text: st.note, anchor: "l", cls: "muted" });
    },
  };

  /* ------------------------------------------------------------ trie */
  V.trie = {
    label: "Trie", legend: [["cur", "node being visited"], ["win", "prefix matched so far"], ["ok", "end of a word"], ["bad", "no such child"], ["hit", "found"], ["dim", "not on this path"]],
    render(S, st) {
      const nodes = {};
      for (const id in st.nodes) { const n = st.nodes[id]; nodes[id] = { kids: Object.keys(n.kids || {}).sort().map((c) => n.kids[c]) }; }
      let leftW = 0, y0 = 0;
      if (st.word != null) {
        P.title(S, "wt", 18, 16, st.wordLabel || "word");
        const chars = String(st.word).split("");
        const wg = P.cells(S, "w", chars.length ? chars : ["·"], { x: 18, y: 28, cw: 34, ch: 34, hl: st.whl, sub: true });
        wg.subbed = true;
        if (st.i != null) P.pointers(S, "wp", wg, { i: st.i }, { side: "top" });
        y0 = 70;
      }
      if (st.grid) {
        P.title(S, "gt", 18, y0 + 14, st.grid.title || "board");
        const g = P.grid(S, "g", st.grid.cells, { x: 18, y: y0 + 24, cw: 34, ch: 32, hl: st.grid.hl, size: 14 });
        leftW = g.W + 54;
      }
      const hx = 24 + leftW;
      P.title(S, "tt", hx - 6, 16 + (st.word != null && !st.grid ? 76 : 0), "trie  (edges are letters)");
      const lay = P.naryLayout(nodes, st.root, { x: hx + 20, y: 62 + (st.word != null && !st.grid ? 48 : 0), gx: st.gx ?? 40, gy: 56 });
      for (const id in lay.pos) {
        const n = st.nodes[id], p = lay.pos[id];
        const cls = (st.hl && st.hl[id]) || (n.end ? "ok" : "");
        S.box(`n${id}`, { x: p.x - 15, y: p.y - 15, w: 30, h: 30, text: id === st.root ? "•" : n.ch, cls: "circle " + cls + (n.end ? " end" : ""), size: 13, sub: n.end ? "★ word" : undefined, from: { x: p.x - 15, y: p.y - 40 } });
        Object.keys(n.kids || {}).sort().forEach((c) => {
          const k = n.kids[c];
          S.edge(`e${id}>${k}`, { from: `n${id}`, to: `n${k}`, arrow: false, cls: (st.ehl && st.ehl[k]) || ((st.hl && (st.hl[k] === "win" || st.hl[k] === "cur" || st.hl[k] === "hit")) ? "hot" : ""), label: c, gap: 1 });
        });
      }
      let y = 62 + lay.H + 60 + (st.word != null && !st.grid ? 48 : 0);
      if (st.grid) y = Math.max(y, y0 + 24 + st.grid.cells.length * 36 + 30);
      if (st.found) {
        S.label("fd:k", { x: 18, y: y + 4, text: st.foundLabel || "words found", anchor: "l", cls: "title" });
        if (st.found.length) st.found.forEach((w, k) => S.box(`fd${w}`, { x: 18 + k * 96, y: y + 16, w: 88, h: 34, text: w, cls: "pill ok", size: 13, from: { x: 18 + k * 96, y: y - 10 } })); else S.label("fd:none", { x: 18, y: y + 34, text: "none yet", anchor: "l", cls: "muted" });
        y += 62;
      }
      if (st.note) S.label("note", { x: 18, y: y + 6, text: st.note, anchor: "l", cls: "muted" });
    },
  };

  /* ------------------------------------------------------------ heap: tree + the array it lives in */
  function heapShape(S, pre, h, x, y, o = {}) {
    const items = h.items, n = items.length;
    const levels = Math.max(h.levels || 3, n ? Math.floor(Math.log2(n)) + 1 : 1);
    const gx = o.gx ?? 44, W = Math.pow(2, levels - 1) * gx;
    const pos = (i) => { const d = Math.floor(Math.log2(i + 1)), k = i + 1 - Math.pow(2, d); const slots = Math.pow(2, d), cell = W / slots; return { x: x + (k + 0.5) * cell, y: y + 34 + d * 58 }; };
    P.title(S, pre + "t", x, y + 4, (h.name || "heap") + (/heap/i.test(h.name || "heap") ? "" : h.min === false ? "  (max-heap)" : "  (min-heap)"));
    const hl = h.hl || {};
    items.forEach((it, i) => {
      const p = pos(i);
      S.box(`${pre}n${it.id}`, { x: p.x - 18, y: p.y - 18, w: 36, h: 36, text: str(it.t != null ? it.t : it.v), cls: "circle " + (hl[it.id] || (i === 0 ? "cmp" : "")), size: String(it.t != null ? it.t : it.v).length > 3 ? 10.5 : 13, from: { x: p.x - 18, y: p.y - 40 } });
      if (i > 0) S.edge(`${pre}e${it.id}`, { from: `${pre}n${items[Math.floor((i - 1) / 2)].id}`, to: `${pre}n${it.id}`, arrow: false, cls: hl[it.id] === "cur" || hl[it.id] === "cmp" ? "hot" : "", gap: 1 });
    });
    if (!n) S.label(pre + "empty", { x: x + W / 2, y: y + 50, text: "(empty)", cls: "muted" });
    const ay = y + 34 + (levels - 1) * 58 + 44;
    const cw = Math.min(40, Math.max(30, W / Math.max(4, n)));
    S.label(pre + "ak", { x, y: ay + 6, text: "as an array", anchor: "l", cls: "muted" });
    const g = P.cells(S, pre + "a", items.map((it) => (it.t != null ? it.t : it.v)), { x, y: ay + 18, cw, ch: 32, hl: Object.fromEntries(items.map((it, i) => [i, hl[it.id] || ""])), keys: items.map((it) => it.id), sub: true, size: 12 });
    g.subbed = true;
    return { w: Math.max(W, g.W), h: ay + 18 + 32 + 24 - y };
  }

  V.heap = {
    label: "Heap", legend: [["cur", "node being sifted"], ["cmp", "compared with it / root (min)"], ["ok", "settled"], ["bad", "removed"], ["win", "in the heap"], ["dim", "waiting in its list"]],
    render(S, st) {
      let x = 20, y = 14, maxH = 0;
      if (st.lists) {
        // k sorted lists feeding the heap (Merge K Sorted Lists)
        P.title(S, "ll", x, y + 4, st.listsLabel || "the sorted lists");
        st.lists.forEach((L, r) => {
          const ry = y + 24 + r * 56;
          S.label(`L${r}:k`, { x, y: ry + 18, text: `list ${r + 1}`, anchor: "l", cls: "muted" });
          L.vals.forEach((v, k) => {
            const cls = (L.hl && L.hl[k]) || (k < L.taken ? "dim" : k === L.taken ? "cmp" : "");
            S.box(`L${r}_${k}`, { x: x + 56 + k * 60, y: ry, w: 44, h: 36, text: str(v), cls: "flat " + cls, size: 14 });
            if (k < L.vals.length - 1) S.edge(`Le${r}_${k}`, { from: `L${r}_${k}`, to: `L${r}_${k + 1}`, fromPort: "r", toPort: "l", cls: k < L.taken ? "dim" : "thin" });
          });
        });
        x += 56 + Math.max(0, ...st.lists.map((L) => L.vals.length)) * 60 + 36;
        x = Math.max(x, 250);                        // keep clear of the title of the lists
        maxH = Math.max(maxH, 24 + st.lists.length * 56);
      }
      if (st.arr) {
        P.title(S, "ia", 20, y + 4, st.arrLabel || "input stream");
        const g = P.cells(S, "ia", st.arr, { x: 20, y: y + 22, cw: 40, ch: 36, hl: st.hl, sub: true });
        g.subbed = true;
        P.pointers(S, "iap", g, st.ptr, { side: "top" });
        y += 90;
      }
      let top = y;
      (st.heaps || []).forEach((h, k) => {
        const r = heapShape(S, `h${k}`, h, x, top, {});
        x += r.w + 50; maxH = Math.max(maxH, r.h);
      });
      let by = top + maxH + 14;
      if (st.out) {
        S.label("out:k", { x: 20, y: by + 8, text: st.out.label || "merged list", anchor: "l", cls: "title" });
        const items = st.out.items;
        items.forEach((v, k) => {
          S.box(`o${k}`, { x: 20 + k * 58, y: by + 22, w: 44, h: 36, text: str(v), cls: "flat ok", size: 14, from: { x: 20 + k * 58, y: by - 30 } });
          if (k) S.edge(`oe${k}`, { from: `o${k - 1}`, to: `o${k}`, fromPort: "r", toPort: "l", cls: "ok" });
        });
        if (!items.length) S.label("out:none", { x: 20, y: by + 40, text: "(nothing yet)", anchor: "l", cls: "muted" });
        by += 72;
      }
      if (st.map) { const m = P.map(S, "mp", st.map, { x: 20, y: by }); by += m.h + 6; }
      if (st.regs) {
        st.regs.forEach((r, i) => { S.label(`reg${i}:k`, { x: 20 + i * 150, y: by + 8, text: r.k, anchor: "l", cls: "title" }); S.box(`reg${i}`, { x: 20 + i * 150, y: by + 20, w: 130, h: 40, text: str(r.v), cls: "flat " + (r.cls || ""), size: 16 }); });
        by += 70;
      }
      if (st.note) S.label("note", { x: 20, y: by + 6, text: st.note, anchor: "l", cls: "muted" });
    },
  };
})();
