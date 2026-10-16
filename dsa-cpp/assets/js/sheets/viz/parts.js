/* ==========================================================================
   DSA Sheets — shared drawing parts used by the specialised visualizers.
   A "part" draws ONE data structure into a Stage using stable ids, and returns
   the geometry other parts need (e.g. where a cell is, to aim an edge at it).

   Colour classes (cell/node state):  cur (current)  cmp (comparing)  ok (accepted / final)
   bad (rejected / error)  hit (found / target)  win (inside window / range)
   dim (inactive)  elim (eliminated: hatched + struck)  ghost / empty (placeholder)
   ========================================================================== */
(function () {
  "use strict";
  const SX = (window.SHEETS = window.SHEETS || {});
  const P = (SX.parts = {});
  SX.viz = SX.viz || {};

  const str = (v) => (v === null || v === undefined ? "∅" : v === Infinity ? "∞" : v === -Infinity ? "−∞" : typeof v === "boolean" ? String(v) : String(v));
  P.str = str;

  /* pointer colours by conventional name */
  const PC = { a: /^(i|idx|k|cur|curr|current|node|x|n|p|t|u|v|row|r0)$/i, b: /^(l|left|lo|low|start|slow|prev|begin|head|front|a|ptr1|buy|s)$/i,
    c: /^(m|mid|middle|j|pivot|best|c|top|tail|mn|min)$/i, d: /^(next|nxt|fast|w|write|wr|nw|end2|dst)$/i, e: /^(r|right|hi|high|end|stop|e|ptr2|sell|rr)$/i, f: /^(bad|err|stop2)$/i };
  P.ptrCls = (name) => { for (const k in PC) if (PC[k].test(name)) return "p" + k; let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return "p" + "abcdef"[h % 5]; };

  /* a heading in small caps */
  P.title = (S, id, x, y, text, cls) => S.label(id, { x, y, text, anchor: "l", cls: "title" + (cls ? " " + cls : "") });

  /* ------------------------------------------------------------ cells: a row of boxes
     o: x y cw ch gap hl{i:cls} keys[] sub(true|array) size shape from{y} z                  */
  P.cells = function (S, pre, vals, o = {}) {
    const cw = o.cw ?? 46, ch = o.ch ?? 46, gap = o.gap ?? 6, step = cw + gap, x = o.x ?? 0, y = o.y ?? 0;
    const g = { pre, x0: x, y, cw, ch, step, n: vals.length, X: (i) => x + i * step, CX: (i) => x + i * step + cw / 2, W: Math.max(0, vals.length * step - gap), id: (i) => `${pre}${o.keys ? o.keys[i] : "c" + i}` };
    vals.forEach((v, i) => {
      const cls = o.hl && o.hl[i] ? o.hl[i] : "";
      S.box(g.id(i), {
        x: g.X(i), y, w: cw, h: ch, text: str(v), cls: (o.shape || "") + " " + cls, shape: o.shape,
        sub: o.sub === true ? i : Array.isArray(o.sub) ? o.sub[i] : undefined, size: o.size, from: o.from ? { x: g.X(i), y: y + o.from.y } : undefined, z: o.z, tip: o.tips ? o.tips[i] : undefined,
      });
    });
    return g;
  };

  /* pointers over/under a cell row. ptrs: { name: idx | {i, side, label} }. Pointers on the same
     cell are merged into one tag ("l · mid") so they never overlap. idx may be -1 or n (just off the ends). */
  P.pointers = function (S, pre, g, ptrs, o = {}) {
    const groups = { top: {}, bottom: {} };
    for (const name in ptrs || {}) {
      let v = ptrs[name];
      if (v === null || v === undefined) continue;
      let side = o.side || "top", label = name;
      if (typeof v === "object") { side = v.side || side; label = v.label || name; v = v.i; }
      (groups[side][v] = groups[side][v] || []).push({ name, label });
    }
    for (const side of ["top", "bottom"]) {
      for (const idx in groups[side]) {
        const names = groups[side][idx];
        const x = g.X(+idx) + g.cw / 2;
        const y = side === "top" ? g.y - 6 + (o.dy || 0) : g.y + g.ch + (g.subbed === false ? 6 : 20) + (o.dy || 0);
        S.ptr(`${pre}p${side[0]}${idx}`, { x, y, dir: side === "top" ? "down" : "up", text: names.map((n) => n.label).join(" · "), cls: P.ptrCls(names[0].name), from: { x, y } });
      }
    }
  };

  /* a dashed range behind cells [from..to]; its label sits above the pointer row so tags never overlap it */
  P.span = function (S, id, g, from, to, cls, label, o = {}) {
    if (from > to || from == null || to == null) return;
    const padY = o.padY ?? 8, x = g.X(from) - 6, w = g.X(to) + g.cw - g.X(from) + 12;
    S.region(id, { x, y: g.y - padY, w, h: g.ch + padY * 2 + (o.down ?? 14), cls, label: "", from: { x, y: g.y - padY, w, h: g.ch + padY * 2 } });
    if (label) S.label(id + ":l", { x: x + 4, y: g.y - 48, text: label, anchor: "l", cls: "title " + String(cls || "").split(" ")[0], from: { x: x + 4, y: g.y - 48 } });
  };

  /* ------------------------------------------------------------ bars (heights ∝ value) */
  P.bars = function (S, pre, vals, o = {}) {
    const bw = o.bw ?? 38, gap = o.gap ?? 8, step = bw + gap, x = o.x ?? 0, y = o.y ?? 0, H = o.H ?? 150;
    const max = Math.max(1, o.max ?? Math.max(...vals.map((v) => Math.abs(v))));
    const g = { pre, x0: x, y, cw: bw, ch: H, step, n: vals.length, base: y + H, maxv: max, X: (i) => x + i * step, CX: (i) => x + i * step + bw / 2, W: vals.length * step - gap, id: (i) => `${pre}c${i}`, top: (i) => y + H - Math.max(8, (Math.abs(vals[i]) / max) * H) };
    vals.forEach((v, i) => {
      const h = Math.max(8, (Math.abs(v) / max) * H);
      S.box(g.id(i), { x: g.X(i), y: y + H - h, w: bw, h, text: str(v), cls: "bar " + ((o.hl && o.hl[i]) || ""), sub: i, from: { x: g.X(i), y: y + H } });
    });
    S.edge(`${pre}axis`, { from: { x: x - 6, y: y + H + 1 }, to: { x: x + g.W + 6, y: y + H + 1 }, arrow: false, cls: "thin plain" });
    return g;
  };

  /* ------------------------------------------------------------ hash map
     map: { entries:[[k,v]…], hl:{key:cls}, view:'buckets'|'table', cap, title, keyLabel, valLabel }
     'buckets' shows h(k) = k mod cap and the chain in each bucket (separate chaining) — illustrative, the
     real unordered_map hashes differently but the idea (bucket → chain) is the same.                         */
  const hashOf = (k, cap) => {
    if (typeof k === "number") return ((k % cap) + cap) % cap;
    let h = 0; for (const ch of String(k)) h += ch.charCodeAt(0);
    return h % cap;
  };
  P.hash = hashOf;
  P.map = function (S, pre, map, o = {}) {
    const x = o.x ?? 0, y = o.y ?? 0;
    const entries = map.entries || [];
    const view = map.view || "table";
    const g = { pre, x, y, rows: {}, entryId: (k) => `${pre}e:${k}`, w: 0, h: 0 };
    P.title(S, pre + "title", x, y + 8, map.title || "hash map");
    if (view === "buckets") {
      const cap = map.cap || 8, rh = 30, ew = o.ew ?? 84;
      const byB = Array.from({ length: cap }, () => []);
      entries.forEach(([k, v]) => byB[hashOf(k, cap)].push([k, v]));
      S.label(pre + "hf", { x: x + 150, y: y + 8, anchor: "l", text: typeof (entries[0] || [0])[0] === "number" || !entries.length ? `bucket = key mod ${cap}` : `bucket = (sum of letters) mod ${cap}`, cls: "muted" });
      for (let b = 0; b < cap; b++) {
        const ry = y + 24 + b * (rh + 4);
        S.box(`${pre}b${b}`, { x, y: ry, w: 28, h: rh, text: b, cls: "flat " + (map.hotBucket === b ? "cmp" : "dim"), size: 12 });
        S.region(`${pre}row${b}`, { x: x + 34, y: ry, w: Math.max(ew + 12, byB[b].length * (ew + 6) + 8), h: rh, cls: map.hotBucket === b ? "cmp solid" : "dim", label: "", z: 0 });
        g.rows[b] = { y: ry, mid: ry + rh / 2 };
        byB[b].forEach(([k, v], j) => {
          S.box(g.entryId(k), { x: x + 40 + j * (ew + 6), y: ry + 3, w: ew, h: rh - 6, text: `${str(k)} → ${str(v)}`, cls: "pill " + ((map.hl && map.hl[k]) || "key"), size: 12, from: { x: x + 40 + j * (ew + 6) + 30, y: ry - 20 } });
        });
      }
      g.w = 34 + 8 * (ew + 6); g.h = 24 + cap * (rh + 4);
    } else {
      const rh = 32, kw = o.kw ?? 54, vw = o.vw ?? 64;
      S.label(pre + "kh", { x: x + kw / 2, y: y + 30, text: map.keyLabel || "key", cls: "muted" });
      S.label(pre + "vh", { x: x + kw + 14 + vw / 2, y: y + 30, text: map.valLabel || "value", cls: "muted" });
      entries.forEach(([k, v], i) => {
        const ry = y + 44 + i * (rh + 5);
        const cls = (map.hl && map.hl[k]) || "";
        S.box(`${pre}k:${k}`, { x, y: ry, w: kw, h: rh, text: str(k), cls: "key " + cls, size: 14, from: { x: x - 30, y: ry } });
        S.edge(`${pre}a:${k}`, { from: `${pre}k:${k}`, to: `${pre}v:${k}`, cls: "thin " + (cls === "hit" ? "hit" : "") });
        S.box(`${pre}v:${k}`, { x: x + kw + 14, y: ry, w: vw, h: rh, text: str(v), cls: "val " + (map.vhl && map.vhl[k] ? map.vhl[k] : cls), size: 14, from: { x: x - 30 + kw + 14, y: ry } });
        g.rows[k] = { y: ry, mid: ry + rh / 2 };
      });
      if (!entries.length) S.label(pre + "empty", { x: x + (kw + vw + 14) / 2, y: y + 64, text: "(empty)", cls: "muted" });
      g.w = kw + vw + 14; g.h = 44 + Math.max(1, entries.length) * (rh + 5);
      g.entryId = (k) => `${pre}k:${k}`;
    }
    return g;
  };

  /* ------------------------------------------------------------ stack (grows upward)
     items: [{t, cls, id?}] bottom → top. Pushed items drop in from above, popped ones are removed.   */
  P.stack = function (S, pre, items, o = {}) {
    const x = o.x ?? 0, y = o.y ?? 0, w = o.w ?? 70, h = o.h ?? 36, slots = Math.max(o.slots ?? 5, items.length + 1), gap = 4;
    const H = slots * (h + gap) + 8;
    const g = { x, y, w, h: H, top: null, itemId: (i) => `${pre}i${i}:${items[i] && (items[i].id ?? items[i].t)}`, Y: (i) => y + H - 6 - (i + 1) * (h + gap) + gap };
    P.title(S, pre + "title", x - 4, y - 14, o.title || "stack");
    S.edge(`${pre}wl`, { from: { x: x - 8, y: y }, to: { x: x - 8, y: y + H }, arrow: false, cls: "plain" });
    S.edge(`${pre}wr`, { from: { x: x + w + 8, y: y }, to: { x: x + w + 8, y: y + H }, arrow: false, cls: "plain" });
    S.edge(`${pre}wb`, { from: { x: x - 8, y: y + H }, to: { x: x + w + 8, y: y + H }, arrow: false, cls: "plain" });
    items.forEach((it, i) => {
      S.box(g.itemId(i), { x, y: g.Y(i), w, h, text: it.t, cls: (it.cls || "") + (i === items.length - 1 ? " top" : ""), size: it.size || 16, from: { x, y: g.Y(items.length) - 70 }, z: 3 });
    });
    if (items.length) {
      g.top = g.itemId(items.length - 1);
      S.label(`${pre}top`, { x: x + w + 20, y: g.Y(items.length - 1) + h / 2, text: "◀ TOP", anchor: "l", cls: "hot", from: { x: x + w + 20, y: g.Y(items.length - 1) + h / 2 } });
    } else S.label(`${pre}empty`, { x: x + w / 2, y: y + H - 24, text: "(empty)", cls: "muted" });
    return g;
  };

  /* ------------------------------------------------------------ queue (front on the left) */
  P.queue = function (S, pre, items, o = {}) {
    const x = o.x ?? 0, y = o.y ?? 0, w = o.w ?? 50, h = o.h ?? 42, gap = 6;
    const g = { x, y, w: Math.max(items.length, 1) * (w + gap), h, itemId: (i) => `${pre}i:${items[i].id ?? items[i].t}`, X: (i) => x + i * (w + gap) };
    P.title(S, pre + "title", x, y - 24, o.title || "queue");
    items.forEach((it, i) => S.box(g.itemId(i), { x: g.X(i), y, w, h, text: it.t, cls: it.cls || "", from: { x: g.X(i) + 40, y }, size: it.size || 15 }));
    if (items.length) {
      S.ptr(`${pre}front`, { x: g.X(0) + w / 2, y: y - 6, dir: "down", text: "FRONT", cls: "pb", from: { x: g.X(0) + w / 2, y: y - 6 } });
      S.ptr(`${pre}back`, { x: g.X(items.length - 1) + w / 2, y: y + h + 6, dir: "up", text: "BACK", cls: "pe", from: { x: g.X(items.length - 1) + w / 2, y: y + h + 6 } });
    } else S.label(`${pre}empty`, { x: x + 60, y: y + h / 2, text: "(empty)", cls: "muted" });
    S.edge(`${pre}tl`, { from: { x: x - 6, y: y - 3 }, to: { x: x + Math.max(items.length, 4) * (w + gap), y: y - 3 }, arrow: false, cls: "plain thin" });
    S.edge(`${pre}bl`, { from: { x: x - 6, y: y + h + 3 }, to: { x: x + Math.max(items.length, 4) * (w + gap), y: y + h + 3 }, arrow: false, cls: "plain thin" });
    return g;
  };

  /* ------------------------------------------------------------ grid (matrix / DP table)
     cells: 2D values; hl {"r,c": cls}; rowHead[], colHead[]; size                                       */
  P.grid = function (S, pre, cells, o = {}) {
    const R = cells.length, C = R ? cells[0].length : 0;
    const cw = o.cw ?? 42, ch = o.ch ?? 40, gap = o.gap ?? 4, x = (o.x ?? 0) + (o.rowHead ? 36 : 0), y = (o.y ?? 0) + (o.colHead ? 26 : 0);
    const g = { pre, R, C, cw, ch, x0: x, y0: y, X: (c) => x + c * (cw + gap), Y: (r) => y + r * (ch + gap), id: (r, c) => `${pre}${r}_${c}`, W: C * (cw + gap) - gap, H: R * (ch + gap) - gap };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const cls = (o.hl && o.hl[r + "," + c]) || "";
      S.box(g.id(r, c), { x: g.X(c), y: g.Y(r), w: cw, h: ch, text: str(cells[r][c]), cls: (o.shape || "") + " " + cls, size: o.size ?? 14, from: o.from ? { x: g.X(c), y: g.Y(r) + o.from.y } : undefined, tip: o.tips ? o.tips[r][c] : undefined });
    }
    if (o.rowHead) o.rowHead.forEach((t, r) => S.label(`${pre}rh${r}`, { x: x - 8, y: g.Y(r) + ch / 2, text: t, anchor: "r", cls: "muted" }));
    if (o.colHead) o.colHead.forEach((t, c) => S.label(`${pre}ch${c}`, { x: g.X(c) + cw / 2, y: y - 14, text: t, cls: "muted" }));
    return g;
  };

  /* ------------------------------------------------------------ binary tree layout
     nodes: { id: {v, l, r} }  root id. Positions are computed from the shape (in-order slots × depth),
     so an inverted tree makes the nodes glide to their mirrored positions.                              */
  P.treeLayout = function (nodes, root, o = {}) {
    const pos = {}, gx = o.gx ?? 56, gy = o.gy ?? 66;
    let slot = 0, maxD = 0;
    const walk = (id, d) => {
      if (id == null || !nodes[id]) return;
      walk(nodes[id].l, d + 1);
      pos[id] = { slot: slot++, d };
      if (d > maxD) maxD = d;
      walk(nodes[id].r, d + 1);
    };
    walk(root, 0);
    const out = {};
    for (const id in pos) out[id] = { x: (o.x ?? 0) + pos[id].slot * gx, y: (o.y ?? 0) + pos[id].d * gy };
    return { pos: out, W: Math.max(0, slot - 1) * gx, H: maxD * gy, n: slot, depth: maxD };
  };
  P.tree = function (S, pre, nodes, root, o = {}) {
    const lay = P.treeLayout(nodes, root, { x: o.x, y: o.y, gx: o.gx, gy: o.gy });
    const r = o.r ?? 20, g = { pre, lay, id: (n) => `${pre}n${n}`, r };
    for (const id in lay.pos) {
      const n = nodes[id], p = lay.pos[id];
      const cls = (o.hl && o.hl[id]) || "";
      S.box(g.id(id), { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2, text: str(n.v), cls: "circle " + cls, size: o.size ?? 14, from: { x: p.x - r, y: p.y - r - 24 }, sub: o.sub ? o.sub[id] : undefined });
      for (const side of ["l", "r"]) {
        const c = n[side];
        if (c != null && nodes[c]) S.edge(`${pre}e${id}${side}`, { from: g.id(id), to: g.id(c), arrow: false, cls: (o.ehl && o.ehl[id + side]) || "", gap: 1 });
      }
    }
    return g;
  };

  /* ------------------------------------------------------------ n-ary tree layout (decision trees, tries, union-find forests)
     nodes: { id: { kids:[ids] } }; leaves take consecutive slots, a parent sits above the middle of its children. */
  P.naryLayout = function (nodes, roots, o = {}) {
    const gx = o.gx ?? 60, gy = o.gy ?? 64, pos = {};
    let slot = 0, maxD = 0;
    const walk = (id, d) => {
      const n = nodes[id]; if (!n) return null;
      if (d > maxD) maxD = d;
      const kids = (n.kids || []).filter((k) => nodes[k]);
      if (!kids.length) { pos[id] = { s: slot++, d }; return pos[id].s; }
      const xs = kids.map((k) => walk(k, d + 1));
      pos[id] = { s: (xs[0] + xs[xs.length - 1]) / 2, d };
      return pos[id].s;
    };
    (Array.isArray(roots) ? roots : [roots]).forEach((r) => { walk(r, 0); slot += o.rootGap ?? 0; });
    const out = {};
    for (const id in pos) out[id] = { x: (o.x ?? 0) + pos[id].s * gx, y: (o.y ?? 0) + pos[id].d * gy };
    return { pos: out, W: Math.max(0, slot - 1) * gx, H: maxD * gy };
  };

  /* ------------------------------------------------------------ bits (a binary number) */
  P.bits = function (S, pre, value, o = {}) {
    const width = o.width ?? 8, cw = o.cw ?? 34, gap = 4, x = o.x ?? 0, y = o.y ?? 0;
    const g = { X: (i) => x + (width - 1 - i) * (cw + gap), CX: (i) => x + (width - 1 - i) * (cw + gap) + cw / 2, y, cw, id: (i) => `${pre}b${i}` };
    const v = BigInt.asUintN(width, BigInt(value));
    for (let i = width - 1; i >= 0; i--) {
      const b = (v >> BigInt(i)) & 1n;
      const cls = (o.hl && o.hl[i]) || (b ? "key" : "");
      S.box(g.id(i), { x: g.X(i), y, w: cw, h: o.ch ?? 38, text: String(b), cls: cls + (b ? "" : " zero"), sub: o.noIdx ? undefined : i, size: 15 });
    }
    return g;
  };
})();
