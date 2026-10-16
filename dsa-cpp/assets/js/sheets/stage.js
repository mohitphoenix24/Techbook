/* ==========================================================================
   DSA Sheets — the animation stage.

   A Stage is a keyed scene: every frame, a visualizer "puts" items (boxes, labels,
   edges, regions, pointers) into it by a STABLE id. Items that already exist glide
   to their new position with a spring; new items pop in; items that are no longer
   put fade out. Because ids are stable, a swap really moves the two cells, an arrow
   really swings round, and a heap node really travels up the tree.

   Edges are attached to items, so they follow the nodes while those are moving.
   Everything is drawn from the algorithm's state; the stage only knows geometry.

   Motion: critically/under-damped springs on x, y, w, h, opacity, scale (one rAF
   loop that stops when everything has settled). prefers-reduced-motion snaps.
   ========================================================================== */
(function () {
  "use strict";
  const SX = (window.SHEETS = window.SHEETS || {});
  const NS = "http://www.w3.org/2000/svg";
  const SPRING = { cv: [200, 26], x: [260, 24], y: [260, 24], w: [300, 30], h: [300, 30], o: [300, 34.6], s: [320, 26] };   // [stiffness, damping]

  const reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  class Stage {
    constructor(host, opts = {}) {
      this.host = host;
      this.opts = opts;
      this.items = new Map();
      this.zoom = 1;
      this.userZoom = false;
      this.bounds = { w: 200, h: 120 };
      this.raf = 0;
      this.last = 0;
      this.frameNo = 0;
      host.classList.add("sx-stage");
      host.innerHTML = `<div class="sx-viewport"><div class="sx-canvas"><svg class="sx-edges" aria-hidden="true"></svg></div></div>
        <div class="sx-tools" role="group" aria-label="Zoom">
          <button type="button" class="sx-tool" data-z="in" title="Zoom in" aria-label="Zoom in">+</button>
          <button type="button" class="sx-tool" data-z="out" title="Zoom out" aria-label="Zoom out">−</button>
          <button type="button" class="sx-tool" data-z="fit" title="Fit to width" aria-label="Fit to width">⤢</button>
        </div>`;
      this.vp = host.querySelector(".sx-viewport");
      this.canvas = host.querySelector(".sx-canvas");
      this.svg = host.querySelector(".sx-edges");
      host.querySelector(".sx-tools").addEventListener("click", (e) => {
        const b = e.target.closest("[data-z]");
        if (!b) return;
        if (b.dataset.z === "fit") { this.userZoom = false; this._layout(); return; }
        this.userZoom = true;
        this.zoom = Math.max(0.4, Math.min(2.2, this.zoom * (b.dataset.z === "in" ? 1.2 : 1 / 1.2)));
        this._layout();
      });
      // drag to pan when the content is wider than the viewport
      let drag = null;
      this.vp.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".sx-tools") || this.vp.scrollWidth <= this.vp.clientWidth + 2 && this.vp.scrollHeight <= this.vp.clientHeight + 2) return;
        drag = { x: e.clientX, y: e.clientY, sl: this.vp.scrollLeft, st: this.vp.scrollTop };
        this.vp.setPointerCapture(e.pointerId);
        this.vp.classList.add("panning");
      });
      this.vp.addEventListener("pointermove", (e) => {
        if (!drag) return;
        this.vp.scrollLeft = drag.sl - (e.clientX - drag.x);
        this.vp.scrollTop = drag.st - (e.clientY - drag.y);
      });
      const up = () => { drag = null; this.vp.classList.remove("panning"); };
      this.vp.addEventListener("pointerup", up);
      this.vp.addEventListener("pointercancel", up);
      this.vp.addEventListener("wheel", (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.userZoom = true;
        this.zoom = Math.max(0.4, Math.min(2.2, this.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
        this._layout();
      }, { passive: false });
      if (window.ResizeObserver) {
        this.ro = new ResizeObserver(() => { if (!this.userZoom) this._layout(); });
        this.ro.observe(this.vp);
      }
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      if (this.ro) this.ro.disconnect();
      this.items.clear();
    }

    /* ----------------------------------------------------------- frame API */
    begin() {
      this.frameNo++;
      this.minX = this.minY = Infinity;
      this.maxX = this.maxY = -Infinity;
    }

    _get(kind, id, make) {
      let it = this.items.get(id);
      if (it && it.kind !== kind) { this._kill(id); it = null; }
      if (!it) {
        it = { kind, id, el: make(), p: {}, fresh: true, dead: false, text: null, cls: null, meta: {} };
        this.items.set(id, it);
        (kind === "edge" ? this.svg : this.canvas).appendChild(it.el);
      }
      it.dead = false;
      it.seen = this.frameNo;
      return it;
    }
    _kill(id) {
      const it = this.items.get(id);
      if (!it) return;
      it.el.remove();
      this.items.delete(id);
    }

    _target(it, name, val, from) {
      let p = it.p[name];
      if (!p) { p = it.p[name] = { c: from !== undefined ? from : val, v: 0, t: val }; }
      else p.t = val;
      if (this.snap) { p.c = val; p.v = 0; }
    }

    _grow(x, y, w, h) {
      if (x < this.minX) this.minX = x;
      if (y < this.minY) this.minY = y;
      if (x + w > this.maxX) this.maxX = x + w;
      if (y + h > this.maxY) this.maxY = y + h;
    }

    _setCls(it, base, cls) {
      const c = base + (cls ? " " + cls : "");
      if (it.cls !== c) { it.el.setAttribute("class", c); it.cls = c; }
    }

    /* a cell / node. o: x y w h text sub cls shape from tip */
    box(id, o) {
      const it = this._get("box", id, () => document.createElement("div"));
      if (it.fresh) { it.el.innerHTML = `<span class="t"></span><i class="sub"></i>`; it.tEl = it.el.firstChild; it.sEl = it.el.lastChild; }
      const w = o.w ?? 44, h = o.h ?? o.w ?? 44;
      this._setCls(it, "sx-box" + (o.shape ? " " + o.shape : ""), o.cls);
      const text = o.text == null ? "" : String(o.text);
      if (it.text !== text) {
        it.tEl.textContent = text;
        if (!it.fresh) { it.el.classList.remove("pop"); void it.el.offsetWidth; it.el.classList.add("pop"); }
        it.text = text;
      }
      const sub = o.sub == null ? "" : String(o.sub);
      if (it.sub !== sub) { it.sEl.textContent = sub; it.sub = sub; }
      if (o.size) it.el.style.fontSize = o.size + "px"; else if (it.el.style.fontSize) it.el.style.fontSize = "";
      if (o.tip !== undefined && it.tip !== o.tip) { it.el.title = o.tip || ""; it.tip = o.tip; }
      it.el.style.zIndex = o.z ?? 2;
      const f = o.from || {};
      this._target(it, "x", o.x, f.x);
      this._target(it, "y", o.y, f.y);
      this._target(it, "w", w);
      this._target(it, "h", h);
      this._target(it, "o", o.o ?? 1, it.fresh ? 0 : undefined);
      this._target(it, "s", o.s ?? 1, it.fresh ? 0.6 : undefined);
      this._grow(o.x, o.y, w, h);
      it.fresh = false;
      return it;
    }

    /* free text. o: x y text cls anchor('c'|'l'|'r') */
    label(id, o) {
      const it = this._get("label", id, () => { const d = document.createElement("div"); d.innerHTML = `<span class="lt"></span>`; return d; });
      this._setCls(it, "sx-label a-" + (o.anchor || "c"), o.cls);
      const text = o.text == null ? "" : String(o.text);
      if (it.text !== text) { it.el.firstChild.textContent = text; it.text = text; }
      if (o.size) it.el.style.fontSize = o.size + "px";
      if (o.w) it.el.style.width = o.w + "px";
      it.el.style.zIndex = o.z ?? 3;
      this._target(it, "x", o.x, o.from && o.from.x);
      this._target(it, "y", o.y, o.from && o.from.y);
      this._target(it, "w", o.w || 0);
      this._target(it, "h", 0);
      this._target(it, "o", o.o ?? 1, it.fresh ? 0 : undefined);
      this._target(it, "s", 1);
      const bw = o.w || (it.text.length * (o.size ? o.size * 0.62 : /\bbig\b/.test(o.cls || "") ? 12.4 : 7.4));
      this._grow((o.anchor === "l" ? o.x : o.anchor === "r" ? o.x - bw : o.x - bw / 2), o.y - 8, bw, 20);
      it.fresh = false;
      return it;
    }

    /* dashed rounded rectangle behind the data: windows, search ranges, groups */
    region(id, o) {
      const it = this._get("region", id, () => { const d = document.createElement("div"); d.innerHTML = `<span class="rl"></span>`; return d; });
      this._setCls(it, "sx-region", o.cls);
      const rl = it.el.firstChild;
      const text = o.label == null ? "" : String(o.label);
      if (it.text !== text) { rl.textContent = text; it.text = text; }
      it.el.style.zIndex = o.z ?? 1;
      this._target(it, "x", o.x, o.from && o.from.x);
      this._target(it, "y", o.y, o.from && o.from.y);
      this._target(it, "w", o.w, o.from && o.from.w);
      this._target(it, "h", o.h, o.from && o.from.h);
      this._target(it, "o", o.o ?? 1, it.fresh ? 0 : undefined);
      this._target(it, "s", 1);
      this._grow(o.x, o.y, o.w, o.h);
      it.fresh = false;
      return it;
    }

    /* pointer marker. o: x (centre) y (the point it indicates) dir('down' label above / 'up' label below) text cls */
    ptr(id, o) {
      const it = this._get("ptr", id, () => { const d = document.createElement("div"); d.innerHTML = `<b></b><i></i>`; return d; });
      this._setCls(it, "sx-ptr " + (o.dir === "up" ? "up" : "down"), o.cls);
      const text = o.text == null ? "" : String(o.text);
      if (it.text !== text) { it.el.firstChild.textContent = text; it.text = text; }
      it.el.style.zIndex = o.z ?? 4;
      this._target(it, "x", o.x, o.from && o.from.x);
      this._target(it, "y", o.y, o.from && o.from.y);
      this._target(it, "w", 0);
      this._target(it, "h", 0);
      this._target(it, "o", o.o ?? 1, it.fresh ? 0 : undefined);
      this._target(it, "s", 1);
      const bw = Math.max(26, text.length * 7 + 10);
      if (o.dir === "up") this._grow(o.x - bw / 2, o.y, bw, 40);
      else this._grow(o.x - bw / 2, o.y - 40, bw, 40);
      it.fresh = false;
      return it;
    }

    /* edge between two items (ids) or fixed points ({x,y}).
       o: from to cls arrow(bool) curve(px) label port:'c'|'rl'|'tb'… dash */
    edge(id, o) {
      const it = this._get("edge", id, () => {
        const g = document.createElementNS(NS, "g");
        g.innerHTML = `<path class="ln"></path><path class="hd"></path><text class="lb" text-anchor="middle"></text>`;
        return g;
      });
      this._setCls(it, "sx-edge" + (o.dash ? " dash" : ""), o.cls);
      it.meta = { from: o.from, to: o.to, arrow: o.arrow !== false && o.arrow !== 0, fp: o.fromPort || "c", tp: o.toPort || "c", gap: o.gap ?? 2 };
      this._target(it, "cv", o.curve || 0);
      const lb = it.el.querySelector(".lb");
      const text = o.label == null ? "" : String(o.label);
      if (it.text !== text) { lb.textContent = text; it.text = text; }
      it.el.style.pointerEvents = "none";
      for (const k of ["from", "to"]) {
        const v = o[k];
        if (v && typeof v === "object") { this._target(it, k + "x", v.x); this._target(it, k + "y", v.y); }
      }
      this._target(it, "o", o.o ?? 1, it.fresh ? 0 : undefined);
      this._target(it, "s", 1);
      it.fresh = false;
      return it;
    }

    /* finish the frame: drop what was not put, resize, start the springs */
    end() {
      for (const it of this.items.values()) {
        if (it.seen !== this.frameNo && !it.dead) {
          it.dead = true;
          this._target(it, "o", 0);
          if (it.kind !== "edge") this._target(it, "s", 0.6);
        }
      }
      if (this.minX === Infinity) { this.minX = 0; this.minY = 0; this.maxX = 200; this.maxY = 80; }
      const pad = 14;
      this.ox = pad - Math.min(0, this.minX);       // everything is shifted so nothing is cut off on the left/top
      this.oy = pad - Math.min(0, this.minY);
      this.bounds = { w: Math.max(this.maxX, 0) + this.ox + pad, h: Math.max(this.maxY, 0) + this.oy + pad };
      this._layout();
      this._kick();
    }

    /* jump (no animation) — used when switching test case / problem */
    snapNext() { this.snap = true; }

    _layout() {
      const vw = this.vp.clientWidth || 600;
      let z = this.zoom;
      // tallest the stage may be (it must stay in the viewport); a change under 4px is ignored so that rounding cannot make the height flicker
      const want = Math.max(120, typeof this.opts.maxH === "function" ? this.opts.maxH() : this.opts.maxH || 560);
      if (this._mh === undefined || Math.abs(want - this._mh) >= 4) this._mh = want;
      const mh = this._mh;
      if (!this.userZoom) z = this.zoom = Math.max(0.5, Math.min(1, (vw - 4) / this.bounds.w, (mh - 2) / this.bounds.h));
      this.canvas.style.width = this.bounds.w + "px";
      this.canvas.style.height = this.bounds.h + "px";
      this.canvas.style.transform = z === 1 ? "" : `scale(${z})`;
      this.vp.style.height = Math.min(mh, Math.max(this.opts.minH || 150, this.bounds.h * z + 2)) + "px";
      this.canvas.style.marginBottom = "0";
      const sizer = this.vp;
      sizer.dataset.zoom = z.toFixed(2);
    }

    /* ----------------------------------------------------------- the spring loop */
    _kick() {
      if (this.raf) return;
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this._tick(t));
    }

    _step(p, name, dt) {
      const [k, d] = SPRING[name] || SPRING.x;
      const a = k * (p.t - p.c) - d * p.v;
      p.v += a * dt;
      p.c += p.v * dt;
      if (Math.abs(p.t - p.c) < 0.04 && Math.abs(p.v) < 0.08) { p.c = p.t; p.v = 0; return false; }
      return true;
    }

    _tick(now) {
      this.raf = 0;
      let dt = Math.min(0.033, (now - this.last) / 1000 || 0.016);
      this.last = now;
      if (reduceMotion() || this.snap) dt = 10;
      this.snap = false;
      let busy = false;
      const n = Math.max(1, Math.ceil(dt / 0.008));
      const h = Math.min(dt, 0.2) / n;
      for (const it of this.items.values()) {
        for (const name in it.p) {
          const p = it.p[name];
          if (p.c === p.t && p.v === 0) continue;
          if (dt >= 1) { p.c = p.t; p.v = 0; continue; }
          let moving = false;
          for (let i = 0; i < n; i++) moving = this._step(p, name, h);
          if (moving) busy = true;
        }
      }
      if (this._paint(dt)) busy = true;
      for (const [id, it] of this.items) {
        if (it.dead && it.p.o.c <= 0.02) this._kill(id);
      }
      if (busy) { this.raf = requestAnimationFrame((t) => this._tick(t)); }
    }

    _cur(it, name) { return it.p[name] ? it.p[name].c : 0; }

    _anchor(spec, port, towards, it, k) {
      // returns {x,y} where an edge touches `spec` (item id or point), heading to `towards`
      if (spec && typeof spec === "object") return { x: this._cur(it, k + "x") + this.ox, y: this._cur(it, k + "y") + this.oy };
      const t = this.items.get(spec);
      if (!t) return null;
      const x = this._cur(t, "x") + this.ox, y = this._cur(t, "y") + this.oy, w = this._cur(t, "w"), h = this._cur(t, "h");
      const s = this._cur(t, "s") || 1;
      const cx = x + w / 2, cy = y + h / 2;
      if (port === "r") return { x: x + w, y: cy };
      if (port === "l") return { x, y: cy };
      if (port === "t") return { x: cx, y };
      if (port === "b") return { x: cx, y: y + h };
      if (!towards) return { x: cx, y: cy };
      const dx = towards.x - cx, dy = towards.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      if (t.el.classList.contains("circle")) { const r = (Math.min(w, h) / 2) * s; return { x: cx + (dx / len) * r, y: cy + (dy / len) * r }; }
      const tx = Math.abs(dx) < 1e-6 ? Infinity : (w / 2) / Math.abs(dx);
      const ty = Math.abs(dy) < 1e-6 ? Infinity : (h / 2) / Math.abs(dy);
      const m = Math.min(tx, ty, 1);
      return { x: cx + dx * m, y: cy + dy * m };
    }

    _centre(spec, it, k) {
      if (spec && typeof spec === "object") return { x: this._cur(it, k + "x") + this.ox, y: this._cur(it, k + "y") + this.oy };
      const t = this.items.get(spec);
      if (!t) return null;
      return { x: this._cur(t, "x") + this.ox + this._cur(t, "w") / 2, y: this._cur(t, "y") + this.oy + this._cur(t, "h") / 2 };
    }

    _paint(dt) {
      const ox = this.ox || 0, oy = this.oy || 0;
      let busy = false;
      const k = dt >= 1 || this.snap ? 1 : 1 - Math.exp(-dt * 16);          // how fast an edge end chases its target
      const chase = (cur, tgt) => {
        if (!cur) return { x: tgt.x, y: tgt.y };
        cur.x += (tgt.x - cur.x) * k; cur.y += (tgt.y - cur.y) * k;
        if (Math.abs(tgt.x - cur.x) > 0.25 || Math.abs(tgt.y - cur.y) > 0.25) busy = true; else { cur.x = tgt.x; cur.y = tgt.y; }
        return cur;
      };
      for (const it of this.items.values()) {
        const o = this._cur(it, "o");
        if (it.kind === "edge") {
          const m = it.meta;
          const ca = this._centre(m.from, it, "from"), cb = this._centre(m.to, it, "to");
          if (!ca || !cb) { it.el.style.opacity = 0; continue; }
          const a0 = this._anchor(m.from, m.fp, cb, it, "from"), b0 = this._anchor(m.to, m.tp, ca, it, "to");
          const a = (it.ea = chase(it.ea, a0)), b = (it.eb = chase(it.eb, b0));
          const ab = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const ux = (b.x - a.x) / ab, uy = (b.y - a.y) / ab;
          const gap = m.gap;
          const A = { x: a.x + ux * gap, y: a.y + uy * gap }, B = { x: b.x - ux * (m.arrow ? gap + 1 : gap), y: b.y - uy * (m.arrow ? gap + 1 : gap) };
          const ln = it.el.querySelector(".ln"), hd = it.el.querySelector(".hd"), lb = it.el.querySelector(".lb");
          const curve = this._cur(it, "cv");
          let d, tx = B.x - A.x, ty = B.y - A.y, mid;
          if (Math.abs(curve) > 0.5) {
            const nx = -uy, ny = ux;
            const cx = (A.x + B.x) / 2 + nx * curve, cy = (A.y + B.y) / 2 + ny * curve;
            d = `M${A.x.toFixed(1)} ${A.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}`;
            tx = B.x - cx; ty = B.y - cy;
            mid = { x: (A.x + 2 * cx + B.x) / 4, y: (A.y + 2 * cy + B.y) / 4 };
          } else {
            d = `M${A.x.toFixed(1)} ${A.y.toFixed(1)} L${B.x.toFixed(1)} ${B.y.toFixed(1)}`;
            mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
          }
          ln.setAttribute("d", d);
          if (m.arrow) {
            const tl = Math.hypot(tx, ty) || 1, hx = tx / tl, hy = ty / tl, L = 9, W = 4.6;
            hd.setAttribute("d", `M${(B.x + hx * 1.5).toFixed(1)} ${(B.y + hy * 1.5).toFixed(1)} L${(B.x - hx * L - hy * W).toFixed(1)} ${(B.y - hy * L + hx * W).toFixed(1)} L${(B.x - hx * L + hy * W).toFixed(1)} ${(B.y - hy * L - hx * W).toFixed(1)} Z`);
          } else hd.setAttribute("d", "");
          lb.setAttribute("x", mid.x.toFixed(1));
          lb.setAttribute("y", (mid.y - 5).toFixed(1));
          it.el.style.opacity = o.toFixed(3);
          continue;
        }
        const x = this._cur(it, "x") + ox, y = this._cur(it, "y") + oy;
        const s = this._cur(it, "s");
        const st = it.el.style;
        if (it.kind === "box") {
          st.width = this._cur(it, "w").toFixed(1) + "px";
          st.height = this._cur(it, "h").toFixed(1) + "px";
          st.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
        } else if (it.kind === "region") {
          st.width = Math.max(0, this._cur(it, "w")).toFixed(1) + "px";
          st.height = Math.max(0, this._cur(it, "h")).toFixed(1) + "px";
          st.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
        } else {
          st.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
        }
        st.opacity = o.toFixed(3);
      }
      return busy;
    }
  }

  SX.Stage = Stage;
})();
