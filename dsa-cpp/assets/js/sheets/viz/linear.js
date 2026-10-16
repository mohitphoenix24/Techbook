/* ==========================================================================
   DSA Sheets — specialised visualizers for linear structures.

   Every visualizer is { label, legend, render(S, state, ctx) }. `state` is the
   `state` field of a trace frame (a full snapshot), `ctx = { frame, prev, problem }`.

   ArrayVisualizer        state { arr, keys, hl{i:cls}, ptr{name:i}, spans[{from,to,cls,label}], bars,
                                  rows[{label,arr,hl,ptr}], regs[{k,v,cls}], note, label }
   TwoPointerVisualizer   state { arr, l, r, hl, label, bars, water, sum, target, regs, discard }
   SlidingWindowVisualizer state { arr, l, r, freq{entries,hl}, best, regs, bad }
   BinarySearchVisualizer state { arr, lo, hi, mid, target, hl, sizes[], sortedHalf[a,b], n }
   HashMapVisualizer      state { arr, hl, ptr, map{entries,hl,view,cap,title}, probe{key,from,res}, calc }
   StackVisualizer        state { input[], i, hl, stack[{t,cls}], cmp{res,text}, table }
   BitVisualizer          state { rows[{label,value,width,hl,note}], ptr{name:bit}, note }
   ========================================================================== */
(function () {
  "use strict";
  const SX = window.SHEETS, P = SX.parts, V = SX.viz;
  const LEG = {
    std: [["cur", "current"], ["cmp", "comparing"], ["ok", "accepted"], ["bad", "rejected"], ["hit", "found"], ["win", "in range"], ["elim", "eliminated"]],
  };

  /* ------------------------------------------------------------ shared: array + extra rows + registers */
  function arrayBase(S, st, o = {}) {
    const hasRows = !!(st.rows && st.rows.length);
    const labelW = hasRows || st.labelW ? (st.labelW ?? 92) : 0;
    const x = 18 + labelW;
    const hasSpanLabel = (st.spans || []).some((sp) => sp.label);
    let y = 58 + (hasSpanLabel ? 24 : 0);
    const n = st.arr.length;
    P.title(S, "t0", 18, 16, st.label || "array");
    let g;
    if (st.bars) {
      const H = st.H ?? 132;
      y = 30 + 20 + (hasSpanLabel ? 24 : 0);
      g = P.bars(S, "a", st.arr, { x, y: y + 22, H, hl: st.hl, bw: st.bw ?? Math.max(28, Math.min(44, 520 / Math.max(n, 1) - 8)), max: st.max });
      g.y = y + 22; g.ch = H; g.subbed = true;
    } else {
      g = P.cells(S, "a", st.arr, { x, y, hl: st.hl, keys: st.keys, sub: st.idx === false ? undefined : true, cw: st.cw ?? (n > 12 ? 38 : 46), ch: st.ch ?? (n > 12 ? 38 : 46), size: st.size, from: st.fromY ? { y: st.fromY } : undefined });
      g.subbed = st.idx !== false;
    }
    if (labelW && !st.bars) S.label("a:name", { x: x - 12, y: y + g.ch / 2, text: st.label2 || "", anchor: "r", cls: "muted" });
    (st.spans || []).forEach((sp, i) => P.span(S, "sp" + i, g, sp.from, sp.to, sp.cls, sp.label, { down: 16 }));
    (st.arcs || []).forEach((a, k) => {
      if (a.from == null || a.to == null || a.from === a.to) return;
      const d = Math.abs(a.to - a.from);
      S.edge(`arc${k}:${a.from}>${a.to}`, { from: g.id(a.from), to: g.id(a.to), fromPort: a.below ? "b" : "t", toPort: a.below ? "b" : "t", curve: (a.below ? 1 : -1) * Math.min(80, 16 + d * 9), cls: a.cls || "hot", label: a.label || "" });
    });
    P.pointers(S, "pa", g, st.ptr, { side: st.ptrSide || (st.bars ? "bottom" : "top") });
    const hasBottomPtr = Object.values(st.ptr || {}).some((v) => v && typeof v === "object" && v.side === "bottom") || ((st.ptrSide || (st.bars ? "bottom" : "top")) === "bottom" && Object.keys(st.ptr || {}).length);
    let bottom = y + g.ch + (st.bars ? 30 : 34) + (hasBottomPtr ? 30 : 0);
    // extra rows (prefix / suffix / result / dp …)
    (st.rows || []).forEach((row, k) => {
      const ry = bottom + 28;
      S.label(`r${k}:name`, { x: x - 12, y: ry + 22, text: row.label, anchor: "r", cls: "hot" });
      const rg = P.cells(S, `r${k}`, row.arr, { x, y: ry, hl: row.hl, sub: true, cw: g.cw, ch: g.ch, size: st.size, keys: row.keys });
      rg.subbed = true;
      P.pointers(S, `pr${k}`, rg, row.ptr, { side: "bottom" });
      bottom = ry + rg.ch + 20;
      if (row.note) S.label(`r${k}:note`, { x: x + rg.W + 14, y: ry + 22, text: row.note, anchor: "l", cls: "muted" });
    });
    // pills: a growing list of results (e.g. the triplets found so far)
    if (st.pills) {
      const py = bottom + 22;
      S.label("pills:k", { x: 18, y: py, text: st.pills.label || "found so far", anchor: "l", cls: "title" });
      if (!st.pills.items.length) S.label("pills:none", { x: 18, y: py + 26, text: "(nothing yet)", anchor: "l", cls: "muted" });
      st.pills.items.forEach((t, k) => S.box(`pill${t}`, { x: 18 + k * 118, y: py + 12, w: 108, h: 32, text: t, cls: "pill ok", size: 12, from: { x: 18 + k * 118, y: py - 14 } }));
      bottom = py + 56;
    }
    // registers
    if (st.regs && st.regs.length) {
      const ry = bottom + 24;
      st.regs.forEach((rg, i) => {
        const rx = 18 + i * 176;
        S.label(`reg${i}:k`, { x: rx, y: ry, text: rg.k, anchor: "l", cls: "title" });
        S.box(`reg${i}`, { x: rx, y: ry + 12, w: 160, h: 42, text: P.str(rg.v), cls: "flat " + (rg.cls || ""), size: 18 });
      });
      bottom = ry + 60;
    }
    if (st.decision) {
      const d = st.decision, dy = bottom + 18;
      S.label("dec:k", { x: 18, y: dy, text: "greedy decision", anchor: "l", cls: "title" });
      S.box("dec:cand", { x: 18, y: dy + 12, w: 200, h: 40, text: d.cand, cls: "flat cmp", size: 13 });
      S.label("dec:arrow", { x: 232, y: dy + 32, text: "→", cls: "hot big" });
      S.box("dec:verdict", { x: 246, y: dy + 12, w: 150, h: 40, text: d.verdict, cls: "flat " + (d.cls || "ok"), size: 14 });
      S.label("dec:why", { x: 18, y: dy + 66, text: d.because || "", anchor: "l", cls: "muted" });
      bottom = dy + 82;
    }
    if (st.note) { S.label("note", { x: 18, y: bottom + 6, text: st.note, anchor: "l", cls: "muted" }); bottom += 22; }
    return { g, bottom };
  }

  P.arrayBase = arrayBase;
  V.array = {
    label: "Array", legend: LEG.std,
    render(S, st) { return arrayBase(S, st); },
  };
  V.greedy = {
    label: "Greedy", legend: [["cur", "current candidate"], ["ok", "taken / reachable"], ["bad", "rejected"], ["win", "frontier"], ["dim", "not considered"]],
    render(S, st) { return arrayBase(S, st); },
  };

  /* ------------------------------------------------------------ two pointers
     With `water: true` the array is drawn as bars and the water between the pointers is shaded (Container With Most Water). */
  V.twopointer = {
    label: "Two pointers", legend: [["cur", "pointer"], ["cmp", "comparing"], ["ok", "match"], ["elim", "already ruled out"], ["win", "still possible"]],
    render(S, st) {
      const n = st.arr.length;
      const hl = Object.assign({}, st.hl || {});
      if (st.discard !== false && st.l != null && st.r != null) {
        for (let i = 0; i < n; i++) if ((i < st.l || i > st.r) && !hl[i]) hl[i] = st.bars ? "dim" : "elim";
      }
      const ptr = Object.assign({}, st.ptr || {});
      if (st.l != null) ptr[st.lName || "l"] = st.l;
      if (st.r != null) ptr[st.rName || "r"] = st.r;
      const spans = (st.spans || []).slice();
      if (st.l != null && st.r != null && st.l <= st.r && st.discard !== false && !st.noSpan) spans.push({ from: st.l, to: st.r, cls: "win", label: `still possible [${st.l}..${st.r}]` });
      const regs = (st.regs || []).slice();
      const out = arrayBase(S, Object.assign({}, st, { hl, ptr, spans, regs }));
      if (st.bars && st.water && st.l != null && st.r != null && st.l < st.r) {
        const g = out.g, hL = st.arr[st.l], hR = st.arr[st.r], h = Math.min(hL, hR), max = g.maxv;
        const top = g.base - (h / max) * g.ch;
        S.region("water", { x: g.X(st.l), y: top, w: g.X(st.r) + g.cw - g.X(st.l), h: g.base - top, cls: "hit solid", label: `water: min(${hL}, ${hR}) × ${st.r - st.l} = ${h * (st.r - st.l)}`, from: { x: g.X(st.l), y: top, w: g.X(st.r) + g.cw - g.X(st.l), h: g.base - top } });
      }
      return out;
    },
  };

  /* ------------------------------------------------------------ sliding window */
  V.sliding = {
    label: "Sliding window", legend: [["win", "inside window"], ["cur", "just added"], ["bad", "violates the rule"], ["ok", "best window"], ["dim", "outside"]],
    render(S, st) {
      const n = st.arr.length, hl = Object.assign({}, st.hl || {});
      for (let i = 0; i < n; i++) if (!hl[i]) hl[i] = st.l != null && st.r != null && i >= st.l && i <= st.r ? (st.bad ? "bad" : "win") : st.l != null && st.r != null && st.r >= st.l ? "dim" : "";
      const ptr = Object.assign({}, st.ptr || {});
      if (st.l != null) ptr[st.lName || "left"] = { i: st.l, side: "top" };
      if (st.r != null) ptr[st.rName || "right"] = { i: st.r, side: "bottom" };
      const spans = (st.spans || []).slice();
      if (st.l != null && st.r != null && st.r >= st.l) spans.push({ from: st.l, to: st.r, cls: st.bad ? "bad solid" : "win solid", label: `window  size ${st.r - st.l + 1}` });
      const out = arrayBase(S, Object.assign({}, st, { hl, ptr, spans, ptrSide: "top", labelW: 0 }));
      const g = out.g;
      let y = out.bottom + 34;
      // frequency map beside the window
      if (st.freq) {
        const m = P.map(S, "f", Object.assign({ title: "window counts", keyLabel: "char", valLabel: "count" }, st.freq), { x: 18, y });
        y += m.h;
      }
      if (st.best) {
        const bx = Math.max(300, g.W + 90);
        S.label("best:k", { x: 290, y: out.bottom + 34 + 8, text: st.best.label || "best window so far", anchor: "l", cls: "title" });
        S.box("best", { x: 290, y: out.bottom + 34 + 22, w: Math.max(120, 22 + 10 * String(st.best.text).length), h: 44, text: st.best.text, cls: "flat ok", size: 16 });
      }
      return out;
    },
  };

  /* ------------------------------------------------------------ binary search */
  V.binary = {
    label: "Binary search", legend: [["win", "search space"], ["cmp", "mid (probe)"], ["elim", "eliminated"], ["hit", "found"], ["ok", "sorted half"]],
    render(S, st) {
      const n = st.arr.length;
      const hl = {};
      const lo = st.lo, hi = st.hi, mid = st.mid;
      for (let i = 0; i < n; i++) {
        if (lo != null && hi != null && (i < lo || i > hi)) hl[i] = "elim";
        else hl[i] = "win";
      }
      if (st.sortedHalf) for (let i = st.sortedHalf[0]; i <= st.sortedHalf[1]; i++) if (hl[i] !== "elim") hl[i] = "ok";
      if (mid != null && mid >= 0 && mid < n) hl[mid] = st.found ? "hit" : "cmp";
      Object.assign(hl, st.hl || {});
      const ptr = {};
      if (lo != null) ptr.lo = { i: lo, side: "top" };
      if (hi != null) ptr.hi = { i: hi, side: "top" };
      if (mid != null && mid >= 0 && mid < n) ptr.mid = { i: mid, side: "bottom" };
      const spans = [];
      if (lo != null && hi != null && lo <= hi && !st.found) spans.push({ from: lo, to: hi, cls: "win", label: `search space: ${hi - lo + 1} left` });
      const out = arrayBase(S, Object.assign({}, st, { hl, ptr, spans, label: st.label || "sorted array" }));
      const g = out.g;
      let y = out.bottom + 24;
      if (st.target !== undefined) {
        S.label("tgt:k", { x: 18, y, text: "target", anchor: "l", cls: "title" });
        S.box("tgt", { x: 18, y: y + 10, w: 76, h: 40, text: P.str(st.target), cls: "flat hit", size: 17 });
      }
      // the shrinking search space: one bar per probe, so O(log n) is visible
      if (st.sizes && st.sizes.length) {
        const bx = 120, full = Math.max(220, Math.min(g.W, 420)), n0 = st.sizes[0];
        S.label("lad:k", { x: bx, y, text: "search space after each probe", anchor: "l", cls: "title" });
        st.sizes.forEach((sz, i) => {
          const w = Math.max(6, (sz / Math.max(1, n0)) * full);
          S.box(`lad${i}`, { x: bx, y: y + 10 + i * 20, w, h: 14, text: "", cls: "flat " + (i === st.sizes.length - 1 && !st.found ? "win" : "dim"), from: { x: bx, y: y + 10 + i * 20 } });
          S.label(`lad${i}:t`, { x: bx + w + 8, y: y + 17 + i * 20, text: `${sz}`, anchor: "l", cls: "mono muted" });
        });
        const nn = st.n ?? n0;
        S.label("lad:log", { x: bx, y: y + 20 + st.sizes.length * 20 + 6, text: `n = ${nn}  →  at most ⌊log₂ ${nn}⌋ + 1 = ${Math.floor(Math.log2(Math.max(1, nn))) + 1} probes`, anchor: "l", cls: "hot" });
      }
      return out;
    },
  };

  /* ------------------------------------------------------------ hash map (with the array it reads) */
  V.hashmap = {
    label: "Hash map", legend: [["cur", "current"], ["cmp", "looking up"], ["hit", "found"], ["bad", "missing"], ["ok", "stored"], ["key", "map entry"]],
    render(S, st) {
      let bottom = 0;
      let g = null;
      if (st.arr) {
        const out = arrayBase(S, Object.assign({}, st, { label: st.label || "input", rows: st.rows, regs: undefined, note: undefined }));
        g = out.g; bottom = out.bottom;
        if (st.calc) { S.label("calc", { x: 18, y: bottom + 2, text: st.calc, anchor: "l", cls: "hot" }); bottom += 26; }
      }
      const my = bottom + 18;
      const mp = st.map ? P.map(S, "m", st.map, { x: 18, y: my, kw: st.map.kw, vw: st.map.vw }) : null;
      if (mp && st.probe) {
        const pr = st.probe;
        const view = st.map.view || "table";
        const cap = st.map.cap || 8;
        let to;
        if (view === "buckets") to = `mb${P.hash(pr.key, cap)}`; else to = pr.res === "found" ? `mk:${pr.key}` : null;
        const entryHit = pr.res === "found" ? mp.entryId(pr.key) : null;
        if (g && pr.from != null) {
          const target = view === "buckets" ? (entryHit || to) : (entryHit || null);
          if (target) S.edge("probe", { from: `${g.pre}c${pr.from}`, to: target, fromPort: "b", toPort: view === "buckets" && !entryHit ? "l" : "t", curve: 40, cls: pr.res === "found" ? "ok" : pr.res === "miss" ? "bad" : "cmp", label: pr.res === "found" ? `found ${pr.key}` : pr.res === "miss" ? `${pr.key}? not there` : `look up ${pr.key}` });
          else if (view === "table") S.label("probe:miss", { x: 18 + 150, y: my + 30, text: `${pr.key}? not in the map`, anchor: "l", cls: "bad" });
        }
      }
      if (st.note) S.label("note", { x: 18, y: my + (mp ? mp.h : 0) + 14, text: st.note, anchor: "l", cls: "muted" });
      return { g, bottom };
    },
  };

  /* ------------------------------------------------------------ stack */
  V.stack = {
    label: "Stack", legend: [["cur", "current character"], ["cmp", "comparing with TOP"], ["ok", "matched"], ["bad", "mismatch"], ["key", "opening bracket"]],
    render(S, st) {
      const input = st.input, n = input.length;
      P.title(S, "t0", 18, 16, st.label || "input");
      const g = P.cells(S, "in", input, { x: 150, y: 46, hl: st.hl, sub: true, cw: 42, ch: 42 });
      g.subbed = true;
      P.pointers(S, "pin", g, st.i != null ? { i: st.i } : {}, { side: "top" });
      const sx = 40, sy = 130;
      const sg = P.stack(S, "st", st.stack, { x: sx, y: sy, w: 64, h: 34, slots: Math.max(5, st.slots || 5), title: "stack" });
      // current character ↔ stack top comparison, drawn as a connector
      if (st.cmp && st.i != null && sg.top) {
        S.edge("cmp", { from: `in${"c" + st.i}`, to: sg.top, fromPort: "b", toPort: "r", curve: -30, cls: st.cmp.res === "ok" ? "ok" : st.cmp.res === "bad" ? "bad" : "cmp", label: st.cmp.text || "" });
      }
      if (st.table) {
        const tx = 260, ty = 140;
        P.title(S, "tb", tx, ty - 12, "matching pairs");
        st.table.forEach(([a, b], k) => {
          S.box(`tb${k}a`, { x: tx + k * 90, y: ty + 6, w: 34, h: 34, text: a, cls: "flat " + ((st.tableHl && st.tableHl === a) ? "cmp" : "") });
          S.label(`tb${k}m`, { x: tx + k * 90 + 45, y: ty + 23, text: "↔", cls: "muted" });
          S.box(`tb${k}b`, { x: tx + k * 90 + 56, y: ty + 6, w: 34, h: 34, text: b, cls: "flat key" });
        });
      }
      if (st.result !== undefined && st.result !== null) {
        S.box("res", { x: 260, y: 214, w: 150, h: 46, text: String(st.result), cls: "flat " + (st.result === "valid" || st.result === true ? "ok" : st.result === "invalid" || st.result === false ? "bad" : "hit"), size: 18 });
        S.label("res:k", { x: 260, y: 204, text: "answer", anchor: "l", cls: "title" });
      }
      if (st.note) S.label("note", { x: 260, y: 160 + (st.table ? 66 : 0), text: st.note, anchor: "l", cls: "muted" });
    },
  };

  /* ------------------------------------------------------------ bits */
  V.bit = {
    label: "Bits", legend: [["cur", "bit being examined"], ["cmp", "operand"], ["ok", "set in result"], ["bad", "cleared / carried"], ["key", "1 bit"]],
    render(S, st) {
      const rows = st.rows || [];
      const width = st.width ?? Math.max(...rows.map((r) => r.width || 8), 8);
      const cw = width > 16 ? 22 : width > 8 ? 30 : 38, gap = 4;
      const x0 = 120;
      let y = 44;
      P.title(S, "t0", 18, 16, st.label || "binary representation");
      rows.forEach((row, k) => {
        const W = row.width || width;
        S.label(`bl${k}`, { x: x0 - 14, y: y + 19, text: row.label, anchor: "r", cls: "hot" });
        const g = P.bits(S, `bits${k}`, row.value, { x: x0, y, width: W, cw, hl: row.hl, noIdx: k > 0 });
        S.label(`bv${k}`, { x: x0 + W * (cw + gap) + 8, y: y + 19, text: `= ${W >= 32 && row.signed === false ? (row.value >>> 0) : row.value}`, anchor: "l", cls: row.cls || "" });
        if (row.note) S.label(`bn${k}`, { x: x0 + W * (cw + gap) + 8, y: y + 38, text: row.note, anchor: "l", cls: "muted" });
        if (k === 0 && st.ptr) {
          for (const name in st.ptr) if (st.ptr[name] != null) S.ptr(`bp${name}`, { x: g.CX(st.ptr[name]), y: y - 6, dir: "down", text: name, cls: P.ptrCls(name), from: { x: g.CX(st.ptr[name]), y: y - 6 } });
        }
        y += 84;
      });
      if (st.opText) { S.label("op", { x: 18, y: y - 8, text: st.opText, anchor: "l", cls: "hot big" }); y += 22; }
      if (st.arr) {
        S.label("barr:k", { x: 18, y: y + 6, text: st.arrLabel || "array", anchor: "l", cls: "title" });
        const ag = P.cells(S, "barr", st.arr, { x: 18, y: y + 38, cw: 40, ch: 38, hl: st.arrHl, sub: true });
        ag.subbed = true;
        P.pointers(S, "barrp", ag, st.arrPtr, { side: "top" });
        (st.arrArcs || []).forEach((a, k) => S.edge(`barc${k}`, { from: ag.id(a.from), to: ag.id(a.to), fromPort: "b", toPort: "b", curve: 28 + Math.abs(a.to - a.from) * 4, cls: a.cls || "cmp", label: a.label || "" }));
        y += 38 + 38 + 40;
      }
      if (st.note) S.label("note", { x: 18, y: y + 6, text: st.note, anchor: "l", cls: "muted" });
    },
  };
})();
