/* ==========================================================================
   JSLab visuals — diagrams for ```viz blocks (copied from system-design/ plus JS-specific ones).
   app.js calls VIZ.mount(container, algo, source, meta) for every ```viz block.

   Diagrams (text DSLs, documented in ../README.md):
     algo=arch   architecture diagram, auto-laid-out, with animated request flows
     algo=seq    sequence diagram you can step through
     algo=uml    UML class diagram
     algo=state  state machine diagram you can step through
     algo=eventloop  call stack + APIs + microtask/task queues, stepped (JS)
     algo=chain      boxes with rows joined by arrows: prototype/scope chains, closures, heap graphs (JS)
     algo=timeline   bars on lanes against a time axis: sequential vs parallel, debounce, throttle (JS)
   Simulators register themselves further down with sim("name", fn).
   ========================================================================== */
(function () {
  "use strict";

  const REG = {};
  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inl = (s) => (window.marked ? window.marked.parseInline(String(s || "")) : esc(s));
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const $ = (s, r) => r.querySelector(s);
  const $$ = (s, r) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function S(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // text width with the page font (canvas), cached
  const _mc = document.createElement("canvas").getContext("2d");
  const _mw = {};
  function textW(s, font) {
    const k = font + "|" + s;
    if (_mw[k] == null) { _mc.font = font; _mw[k] = _mc.measureText(s).width; }
    return _mw[k];
  }
  const F_LABEL = '600 13px Inter, system-ui, sans-serif';
  const F_SUB = '400 11.5px Inter, system-ui, sans-serif';
  const F_MONO = '400 12px "JetBrains Mono", ui-monospace, monospace';
  const F_MONO_B = '700 12.5px "JetBrains Mono", ui-monospace, monospace';
  const F_EDGE = '500 11.5px Inter, system-ui, sans-serif';

  /* ---------------------------------------------------------------- icons (24×24, stroke) */
  const IC = {
    loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    network: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 6h9M6.5 8l4 8M17.5 8l-4 8"/>',
    client: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
    mobile: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a6.5 6.5 0 0 1 3.5 6.5"/>',
    lb: '<circle cx="5" cy="12" r="2.2"/><path d="M7.2 12h4M11 12l7-6M11 12h7M11 12l7 6"/><circle cx="19.5" cy="6" r="1.5"/><circle cx="19.5" cy="12" r="1.5"/><circle cx="19.5" cy="18" r="1.5"/>',
    gateway: '<path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-7h6v7"/>',
    service: '<rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/><path d="M7 6.5h.01M7 17.5h.01"/>',
    server: '<rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/><path d="M7 6.5h.01M7 17.5h.01"/>',
    db: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    cache: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    queue: '<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M7 7v10M11.5 7v10M16 7v10"/>',
    stream: '<path d="M3 7c3-3 6 3 9 0s6 3 9 0M3 12c3-3 6 3 9 0s6 3 9 0M3 17c3-3 6 3 9 0s6 3 9 0"/>',
    storage: '<path d="M3 7h18v13H3z"/><path d="M2 3h20v4H2zM10 11h4"/>',
    cdn: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    dns: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2.5"/>',
    worker: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    fn: '<path d="M10 20c2 0 2.5-2 3-5l1.5-8c.5-2.5 1.5-4 3.5-4"/><path d="M8 10h9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    cloud: '<path d="M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
    ai: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
    mail: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21h4"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
    pay: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    filter: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    gpu: '<rect x="3" y="6" width="18" height="12" rx="2"/><rect x="7" y="9" width="6" height="6"/><path d="M16 10h2M16 14h2M6 18v3M10 18v3M14 18v3M18 18v3"/>',
  };
  // node type → icon + colour slot (colour slots are CSS variables in sd.css)
  const TYPES = {
    client: ["client", "c1"], browser: ["browser", "c1"], mobile: ["mobile", "c1"], user: ["user", "c1"], users: ["users", "c1"],
    lb: ["lb", "c2"], gateway: ["gateway", "c2"], proxy: ["gateway", "c2"], dns: ["dns", "c2"], cdn: ["cdn", "c2"],
    service: ["service", "c3"], server: ["server", "c3"], app: ["service", "c3"], fn: ["fn", "c3"], ai: ["ai", "c3"], gpu: ["gpu", "c3"],
    worker: ["worker", "c4"], scheduler: ["clock", "c4"], cron: ["clock", "c4"], clock: ["clock", "c4"],
    db: ["db", "c5"], sql: ["db", "c5"], nosql: ["db", "c5"], search: ["search", "c5"], storage: ["storage", "c5"], blob: ["storage", "c5"], file: ["file", "c5"],
    cache: ["cache", "c6"], lock: ["lock", "c6"], key: ["key", "c6"], filter: ["filter", "c6"],
    queue: ["queue", "c7"], stream: ["stream", "c7"], kafka: ["stream", "c7"], bell: ["bell", "c7"], mail: ["mail", "c7"],
    monitor: ["chart", "c8"], chart: ["chart", "c8"], ext: ["cloud", "c8"], cloud: ["cloud", "c8"], shield: ["shield", "c8"], map: ["map", "c8"], video: ["video", "c8"], pay: ["pay", "c8"], list: ["list", "c8"], phone: ["phone", "c1"], image: ["image", "c5"], box: ["box", "c8"],
  };
  const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${IC[name] || IC.box}</svg>`;
  const UI = {
    play: '<svg class="icon" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
    pause: '<svg class="icon" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
    prev: '<svg class="icon" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    next: '<svg class="icon" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    reset: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
  };

  // Diagrams render at natural size (never upscaled), shrink to the column width on
  // desktop, and keep a readable minimum width on phones (the canvas scrolls).
  const FIT = 700;
  function fit(svg, W) {
    svg.style.maxWidth = "100%";
    svg.style.height = "auto";
    svg.style.minWidth = Math.min(W, 520) + "px";
  }

  function fitToContent(svg, pad = 12) {
    try {
      const bb = svg.getBBox();
      if (!bb.width) return;
      const x = Math.min(0, bb.x - pad), y = Math.min(0, bb.y - pad);
      const vb = svg.viewBox.baseVal;
      const W = Math.max(vb.x + vb.width, bb.x + bb.width + pad) - x, H = Math.max(vb.y + vb.height, bb.y + bb.height + pad) - y;
      svg.setAttribute("viewBox", `${x} ${y} ${W} ${H}`);
      svg.setAttribute("width", W); svg.setAttribute("height", H);
      fit(svg, W);
    } catch { /* not rendered yet: keep the computed box */ }
  }

  /* ---------------------------------------------------------------- card shell */
  function shell(container, { kicker, title, ic, cls }) {
    const card = el(`<div class="viz-card sd-viz ${cls || ""}" tabindex="-1">
      <div class="viz-head"><span class="viz-kicker">${icon(ic || "box")} ${esc(kicker)}</span>${title ? `<span class="viz-title">${inl(title)}</span>` : ""}</div>
      <div class="sd-body"></div></div>`);
    container.appendChild(card);
    return { card, body: $(".sd-body", card) };
  }
  function errorCard(container, msg) {
    container.appendChild(el(`<div class="box box-warn"><div class="box-head">Diagram error</div><div class="box-body"><p>${esc(msg)}</p></div></div>`));
  }

  // Step player shared by diagrams: prev / play / next / reset + a caption.
  function stepper(host, { count, render, label, autoMs = 1500, startAt = count }) {
    const wrap = el(`<div class="sd-stepper">
      <div class="viz-msg sd-cap"></div>
      <div class="viz-controls">
        <button class="vbtn" data-a="reset" title="Back to the full picture">${UI.reset}</button>
        <button class="vbtn" data-a="prev" title="Previous step (←)">${UI.prev}</button>
        <button class="vbtn primary" data-a="play" title="Play the steps">${UI.play}</button>
        <button class="vbtn" data-a="next" title="Next step (→)">${UI.next}</button>
        <span class="v-count"></span>
      </div></div>`);
    host.appendChild(wrap);
    let i = startAt, timer = null;
    const playBtn = $('[data-a="play"]', wrap);
    const draw = () => {
      $(".v-count", wrap).textContent = i >= count || i < 0 ? `${count} steps` : `${i + 1} / ${count}`;
      $(".sd-cap", wrap).innerHTML = render(i >= count ? -1 : i) || "";
    };
    const stop = () => { clearInterval(timer); timer = null; playBtn.innerHTML = UI.play; };
    const go = (n) => { i = n; draw(); };
    $('[data-a="prev"]', wrap).onclick = () => { stop(); go(i >= count ? count - 1 : Math.max(0, i - 1)); };
    $('[data-a="next"]', wrap).onclick = () => { stop(); go(i >= count ? 0 : Math.min(count - 1, i + 1)); };
    $('[data-a="reset"]', wrap).onclick = () => { stop(); go(count); };
    playBtn.onclick = () => {
      if (timer) return stop();
      if (i >= count - 1) go(0); else go(i + 1);
      playBtn.innerHTML = UI.pause;
      timer = setInterval(() => { if (!wrap.isConnected) return stop(); if (i >= count - 1) { stop(); return; } go(i + 1); }, reduced() ? autoMs * 1.5 : autoMs);
    };
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); $('[data-a="next"]', wrap).click(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); $('[data-a="prev"]', wrap).click(); }
    });
    draw();
    return { go, stop, get i() { return i; }, wrap, setLabel: label };
  }

  // Arrow markers, one set per svg (ids must be unique per page)
  let MID = 0;
  function defs(svg) {
    const id = "m" + ++MID;
    const d = S("defs", {}, svg);
    const mk = (name, path, cls, w = 10, h = 10, refX = 9, filled = true) => {
      const m = S("marker", { id: `${id}-${name}`, viewBox: `0 0 ${w} ${h}`, refX, refY: h / 2, markerWidth: w * 0.85, markerHeight: h * 0.85, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" }, d);
      S("path", { d: path, class: cls + (filled ? "" : " hollow") }, m);
    };
    mk("arrow", "M0,1 L9,5 L0,9 z", "mk");
    mk("arrow-on", "M0,1 L9,5 L0,9 z", "mk on");
    mk("open", "M0,1 L9,5 L0,9", "mk-line", 10, 10, 9, false);
    mk("tri", "M1,1 L13,8 L1,15 z", "mk-tri", 14, 16, 13, false);
    mk("dia", "M1,6 L8,1 L15,6 L8,11 z", "mk-dia", 16, 12, 15);
    mk("odia", "M1,6 L8,1 L15,6 L8,11 z", "mk-dia hollow", 16, 12, 15, false);
    return (name) => `url(#${id}-${name})`;
  }

  /* ================================================================ ARCHITECTURE
     node lines:   id  Label | optional sub-label  [type]  [type*3]  @col,row
     edges:        a -> b : label     a <-> b     a ~> b (async, dashed)     a -- b (no arrow)
     groups:       group Name: id1, id2, ...
     flows:        flow Name           then step lines:  a > b : caption
     options:      dir=down (meta) · caption: text
  */
  function parseArch(src) {
    const nodes = [], byId = {}, edges = [], groups = [], flows = [];
    let flow = null, caption = "", section = "nodes";
    const lines = String(src || "").split("\n");
    for (let raw of lines) {
      const line = raw.replace(/\s+#\s.*$/, "").trim();
      if (!line || line.startsWith("//")) continue;
      if (line === "--") { section = section === "nodes" ? "edges" : "flows"; continue; }
      let m;
      if ((m = line.match(/^caption:\s*(.+)$/i))) { caption = m[1]; continue; }
      if ((m = line.match(/^group\s+(.+?):\s*(.+)$/i))) { groups.push({ label: m[1].replace(/^"|"$/g, ""), ids: m[2].split(",").map((s) => s.trim()).filter(Boolean) }); continue; }
      if ((m = line.match(/^flow\s+(.+)$/i))) { flow = { name: m[1].trim(), steps: [] }; flows.push(flow); section = "flows"; continue; }
      if (section === "flows" && flow && (m = line.match(/^([\w.-]+)\s*>\s*([\w.-]+)\s*(?::\s*(.*))?$/))) { flow.steps.push({ a: m[1], b: m[2], text: m[3] || "" }); continue; }
      if ((m = line.match(/^([\w.-]+)\s*(<->|<-->|->|-->|~>|--|=>)\s*([\w.-]+)\s*(?::\s*(.*))?$/))) {
        edges.push({ a: m[1], b: m[3], kind: m[2], label: (m[4] || "").trim() });
        continue;
      }
      if ((m = line.match(/^([\w.-]+)\s+(.+)$/))) {
        let rest = m[2], type = "service", count = 1, pos = null;
        rest = rest.replace(/\[([\w-]+)(?:\*(\d+))?\]/, (x, t, n) => { type = t.toLowerCase(); count = n ? +n : 1; return ""; });
        rest = rest.replace(/@\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/, (x, c, r) => { pos = [+c, +r]; return ""; });
        const [label, sub] = rest.split("|").map((s) => s.trim());
        const n = { id: m[1], label: label || m[1], sub: sub || "", type, count, pos };
        nodes.push(n); byId[n.id] = n;
        continue;
      }
      if ((m = line.match(/^([\w.-]+)$/))) { const n = { id: m[1], label: m[1], sub: "", type: "service", count: 1 }; nodes.push(n); byId[n.id] = n; }
    }
    // nodes mentioned only in edges / flows get created on the fly
    const ensure = (id) => { if (!byId[id]) { const n = { id, label: id, sub: "", type: "service", count: 1 }; nodes.push(n); byId[id] = n; } };
    edges.forEach((e) => { ensure(e.a); ensure(e.b); });
    flows.forEach((f) => f.steps.forEach((s) => { ensure(s.a); ensure(s.b); }));
    return { nodes, byId, edges, groups, flows, caption };
  }

  function layoutArch(g, down) {
    const { nodes, byId, edges } = g;
    // columns = hop distance from the sources (BFS). Then an edge whose two ends
    // landed in the same column pushes its target one column further, unless
    // that would create a cycle. Edges pointing "back" are drawn as curves.
    const succ = {}, hasIn = {};
    nodes.forEach((n) => { succ[n.id] = []; });
    edges.forEach((e) => { if (e.a !== e.b) { succ[e.a].push(e.b); hasIn[e.b] = true; } });   // layout reads every edge as a → b
    // Hop distance from EACH source, keeping the maximum, so a secondary source (a cron
    // worker writing to the DB) can't pull the DB up next to itself.
    const col = {};
    const sources = nodes.filter((n) => !hasIn[n.id]).map((n) => n.id);
    if (!sources.length && nodes.length) sources.push(nodes[0].id);
    sources.forEach((src) => {
      const d = { [src]: 0 }, q = [src];
      while (q.length) {
        const id = q.shift();
        succ[id].forEach((b) => { if (d[b] == null) { d[b] = d[id] + 1; q.push(b); } });
      }
      for (const id in d) col[id] = Math.max(col[id] ?? 0, d[id]);
    });
    nodes.forEach((n) => { if (col[n.id] == null) col[n.id] = 0; });
    // then pull each secondary source down to just above its nearest target
    sources.forEach((src) => {
      const targets = succ[src].map((b) => col[b]).filter((c) => c > 0);
      if (targets.length && src !== sources[0]) col[src] = Math.max(0, Math.min(...targets) - 1);
    });
    const reach = (from, to) => {               // is there a path from → to?
      const seen = new Set([from]), st = [from];
      while (st.length) { const x = st.pop(); if (x === to) return true; succ[x].forEach((y) => { if (!seen.has(y)) { seen.add(y); st.push(y); } }); }
      return false;
    };
    for (let it = 0; it < nodes.length; it++) {
      let moved = false;
      edges.forEach((e) => {
        if (e.a === e.b || e.kind === "<->" || e.kind === "<-->" || e.kind === "--") return;   // symmetric edges may stay side by side
        if (col[e.a] === col[e.b] && !reach(e.b, e.a)) { col[e.b] = col[e.a] + 1; moved = true; }
      });
      if (!moved) break;
    }
    nodes.forEach((n) => { if (n.pos) col[n.id] = n.pos[0]; });
    // node sizes
    nodes.forEach((n) => {
      const lw = textW(n.label, F_LABEL), sw = n.sub ? textW(n.sub, F_SUB) : 0;
      n.w = Math.ceil(Math.max(lw, sw) + 58);
      n.w = clamp(n.w, 104, 230);
      n.h = n.sub ? 54 : 44;
    });
    // rows: group by column, order by barycenter of predecessors
    const cols = {};
    nodes.forEach((n) => (cols[col[n.id]] = cols[col[n.id]] || []).push(n));
    const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
    const rowPos = {};
    colKeys.forEach((c) => {
      const list = cols[c];
      list.forEach((n, i) => {
        const preds = edges.filter((e) => e.b === n.id && rowPos[e.a] != null).map((e) => rowPos[e.a]);
        n._bary = n.pos ? n.pos[1] : preds.length ? preds.reduce((s, x) => s + x, 0) / preds.length : i;
        n._i = i;
      });
      list.sort((a, b) => (a.pos && b.pos ? a.pos[1] - b.pos[1] : a._bary - b._bary || a._i - b._i));
      list.forEach((n, i) => (rowPos[n.id] = n.pos ? n.pos[1] : i));
    });
    // coordinates
    const GAP_MAIN = down ? 64 : 92, GAP_CROSS = down ? 28 : 26, PAD = 26;
    let cursor = PAD;
    const colSpan = {};
    colKeys.forEach((c) => {
      const list = cols[c];
      const thick = Math.max(...list.map((n) => (down ? n.h : n.w)));
      colSpan[c] = { at: cursor, thick };
      cursor += thick + GAP_MAIN;
    });
    const mainSize = cursor - GAP_MAIN + PAD;
    const groupOf = {};
    g.groups.forEach((gr, gi) => gr.ids.forEach((id) => (groupOf[id] = gi)));
    const extra = (list, i) => (i > 0 && groupOf[list[i].id] !== groupOf[list[i - 1].id] && (groupOf[list[i].id] != null || groupOf[list[i - 1].id] != null) ? 34 : 0);
    const crossLen = (list) => list.reduce((s, n, i) => s + (down ? n.w : n.h) + (n.count > 1 ? 8 : 0) + extra(list, i), 0) + GAP_CROSS * (list.length - 1);
    const maxCross = Math.max(...colKeys.map((c) => crossLen(cols[c])));
    // explicit @layer,row positions: top-down rows share one pitch (the widest placed node), so columns line up
    const pitch = down ? Math.max(0, ...nodes.filter((n) => n.pos).map((n) => n.w)) + GAP_CROSS : 44 + GAP_CROSS;
    colKeys.forEach((c) => {
      const list = cols[c];
      const explicit = list.some((n) => n.pos);
      let at = PAD + (maxCross - crossLen(list)) / 2;
      list.forEach((n, i) => {
        at += extra(list, i);
        const cs = colSpan[c];
        const main = cs.at + (cs.thick - (down ? n.h : n.w)) / 2;
        let cross = at;
        if (explicit && n.pos) cross = PAD + n.pos[1] * pitch + (down ? (pitch - GAP_CROSS - n.w) / 2 : 0);
        if (down) { n.x = cross; n.y = main; } else { n.x = main; n.y = cross; }
        at += (down ? n.w : n.h) + GAP_CROSS + (n.count > 1 ? 8 : 0);
      });
    });
    let W = down ? maxCross + PAD * 2 : mainSize, H = down ? mainSize : maxCross + PAD * 2;
    nodes.forEach((n) => { W = Math.max(W, n.x + n.w + PAD); H = Math.max(H, n.y + n.h + PAD); });
    // groups expand the canvas a bit
    if (g.groups.length) H += 10;
    return { W, H, col };
  }

  function anchor(n, toward, down) {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    const tx = toward.x + toward.w / 2, ty = toward.y + toward.h / 2;
    const dx = tx - cx, dy = ty - cy;
    // choose the side facing the other node
    if (Math.abs(dx) * (down ? 0.6 : 1.4) > Math.abs(dy) || (!down && Math.abs(dx) > n.w / 2 + 10)) {
      return dx >= 0 ? { x: n.x + n.w, y: cy, side: "r" } : { x: n.x, y: cy, side: "l" };
    }
    return dy >= 0 ? { x: cx, y: n.y + n.h + (n.count > 1 ? 8 : 0), side: "b" } : { x: cx, y: n.y, side: "t" };
  }
  function edgePath(p, q) {
    const k = (s, d) => ({ r: [d, 0], l: [-d, 0], b: [0, d], t: [0, -d] }[s]);
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    const d = Math.min(70, Math.max(24, dist * 0.4));
    const [ax, ay] = k(p.side, d), [bx, by] = k(q.side, d);
    return `M${p.x},${p.y} C${p.x + ax},${p.y + ay} ${q.x + bx},${q.y + by} ${q.x},${q.y}`;
  }

  function drawArch(container, src, meta) {
    const g = parseArch(src);
    if (!g.nodes.length) return errorCard(container, "This architecture diagram has no nodes.");
    // Left-to-right reads best, but a deep graph gets shrunk in the ~700px column;
    // then a top-down layout keeps the text bigger. dir=right|down forces one.
    let down = meta.dir === "down";
    let L = layoutArch(g, down);
    if (!meta.dir && L.W > FIT) {
      const lr = Math.min(1, FIT / L.W);
      const D = layoutArch(g, true);
      if (Math.min(1, FIT / D.W) > lr + 0.08) { down = true; L = D; } else L = layoutArch(g, false);
    }
    const { card, body } = shell(container, { kicker: meta.kicker || "Architecture", title: meta.title || "", ic: "network", cls: "sd-arch" });
    const wrap = el(`<div class="sd-canvas"></div>`);
    body.appendChild(wrap);
    const svg = S("svg", { viewBox: `0 0 ${L.W} ${L.H}`, width: L.W, height: L.H, class: "sd-svg", role: "img", "aria-label": meta.title || "Architecture diagram" }, wrap);
    fit(svg, L.W);
    const mk = defs(svg);
    // groups (drawn first, behind)
    g.groups.forEach((gr) => {
      const ns = gr.ids.map((id) => g.byId[id]).filter(Boolean);
      if (!ns.length) return;
      const x0 = Math.min(...ns.map((n) => n.x)) - 14, y0 = Math.min(...ns.map((n) => n.y)) - 24;
      const x1 = Math.max(...ns.map((n) => n.x + n.w)) + 14, y1 = Math.max(...ns.map((n) => n.y + n.h + (n.count > 1 ? 8 : 0))) + 12;
      S("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 14, class: "sd-group" }, svg);
      const t = S("text", { x: x0 + 12, y: y0 + 15, class: "sd-group-t" }, svg);
      t.textContent = gr.label;
    });
    // edges
    const edgeEls = [];
    const eLayer = S("g", {}, svg);
    const labelLayer = S("g", {}, svg);
    // spread the edges that leave the same side of a node over "ports", ordered
    // by where the other end is, so lines and their labels don't pile up
    // An edge whose straight line would cut through another node is drawn as an arc that
    // leaves and enters on the same side (above/below in left-to-right layouts), alternating sides.
    const sidePt = (n, side) => ({ r: { x: n.x + n.w, y: n.y + n.h / 2 }, l: { x: n.x, y: n.y + n.h / 2 }, t: { x: n.x + n.w / 2, y: n.y }, b: { x: n.x + n.w / 2, y: n.y + n.h + (n.count > 1 ? 8 : 0) } }[side]);
    const crosses = (p, q, self) => g.nodes.some((n) => {
      if (self.includes(n)) return false;
      for (let k = 1; k < 20; k++) {
        const x = p.x + ((q.x - p.x) * k) / 20, y = p.y + ((q.y - p.y) * k) / 20;
        if (x > n.x - 4 && x < n.x + n.w + 4 && y > n.y - 4 && y < n.y + n.h + 4) return true;
      }
      return false;
    });
    const route = {};
    let arcs = 0;
    g.edges.forEach((e, i) => {
      const A = g.byId[e.a], B = g.byId[e.b];
      if (A === B) return;
      const p = anchor(A, B, down), q = anchor(B, A, down);
      if (crosses(p, q, [A, B])) {
        const side = arcs++ % 2 === 0 ? (down ? "l" : "t") : (down ? "r" : "b");
        route[i] = { arc: true, pSide: side, qSide: side, dir: side === "t" || side === "l" ? -1 : 1 };
      } else route[i] = { arc: false, pSide: p.side, qSide: q.side };
    });
    const ends = [];
    g.edges.forEach((e, i) => {
      const A = g.byId[e.a], B = g.byId[e.b];
      if (A === B) return;
      const r = route[i];
      ends.push({ i, node: A, other: B, pt: { ...sidePt(A, r.pSide), side: r.pSide }, end: "p" }, { i, node: B, other: A, pt: { ...sidePt(B, r.qSide), side: r.qSide }, end: "q" });
    });
    const sides = {};
    ends.forEach((x) => (sides[x.node.id + x.pt.side] = sides[x.node.id + x.pt.side] || []).push(x));
    const port = {};
    Object.values(sides).forEach((list) => {
      const horiz = list[0].pt.side === "t" || list[0].pt.side === "b";
      list.sort((a, b) => (horiz ? a.other.x - b.other.x : a.other.y - b.other.y));
      const n = list[0].node, len = horiz ? n.w : n.h;
      const step = list.length > 1 ? Math.min(horiz ? 34 : 14, (len * 0.7) / (list.length - 1)) : 0;
      list.forEach((x, k) => {
        const off = (k - (list.length - 1) / 2) * step;
        port[x.i + x.end] = horiz ? { ...x.pt, x: x.pt.x + off } : { ...x.pt, y: x.pt.y + off };
      });
    });
    const placed = g.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
    g.edges.forEach((e, i) => {
      const A = g.byId[e.a], B = g.byId[e.b];
      if (A === B) return;
      const p = port[i + "p"], q = port[i + "q"], r = route[i];
      let d = edgePath(p, q);
      if (r.arc) {
        const h = 46 + 0.12 * Math.hypot(q.x - p.x, q.y - p.y);
        d = down ? `M${p.x},${p.y} C${p.x + r.dir * h},${p.y} ${q.x + r.dir * h},${q.y} ${q.x},${q.y}`
                 : `M${p.x},${p.y} C${p.x},${p.y + r.dir * h} ${q.x},${q.y + r.dir * h} ${q.x},${q.y}`;
      }
      const path = S("path", { d, class: `sd-edge ${e.kind === "~>" || e.kind === "-->" ? "async" : ""}` }, eLayer);
      if (e.kind !== "--") path.setAttribute("marker-end", mk("arrow"));
      if (e.kind === "<->" || e.kind === "<-->") path.setAttribute("marker-start", mk("arrow"));
      edgeEls.push({ e, path });
      if (e.label) {
        // slide the label along its edge until it overlaps no other label or node
        const len = path.getTotalLength ? path.getTotalLength() : 0;
        const w = textW(e.label, F_EDGE) + 12;
        const hits = (r) => placed.some((o) => r.x < o.x + o.w + 8 && o.x < r.x + r.w + 8 && r.y < o.y + o.h + 2 && o.y < r.y + r.h + 2);
        let best = null;
        const short = len < w + 24, horiz = p.side === "l" || p.side === "r";
        const hh = Math.max(A.h, B.h) / 2 + 13;
        const tries = short ? (horiz ? [[0.5, 0, -hh], [0.5, 0, hh]] : [[0.5, w / 2 + 8, 0], [0.5, -w / 2 - 8, 0]])
          : [0.5, 0.62, 0.38, 0.72, 0.28, 0.8, 0.2].map((t) => [t, 0, 0]);
        for (const [t, dx, dy] of tries) {
          let pt = len ? path.getPointAtLength(len * t) : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
          pt = { x: pt.x + dx, y: pt.y + dy };
          const r = { x: pt.x - w / 2, y: pt.y - 9.5, w, h: 19, pt };
          if (!best) best = r;
          if (!hits(r)) { best = r; break; }
        }
        placed.push(best);
        const gl = S("g", { class: "sd-elabel" }, labelLayer);
        S("rect", { x: best.x, y: best.y, width: w, height: 19, rx: 9.5 }, gl);
        const t = S("text", { x: best.pt.x, y: best.pt.y + 4, "text-anchor": "middle" }, gl);
        t.textContent = e.label;
      }
    });
    // nodes
    const nodeEls = {};
    g.nodes.forEach((n) => {
      const [ic, slot] = TYPES[n.type] || TYPES.service;
      const gN = S("g", { class: `sd-node ${slot}`, transform: `translate(${n.x},${n.y})` }, svg);
      for (let k = Math.min(n.count, 3) - 1; k >= 1; k--) S("rect", { x: k * 4, y: k * 4, width: n.w, height: n.h, rx: 11, class: "sd-stack" }, gN);
      S("rect", { width: n.w, height: n.h, rx: 11, class: "sd-box" }, gN);
      S("rect", { x: 8, y: n.h / 2 - 14, width: 28, height: 28, rx: 8, class: "sd-chip" }, gN);
      const ig = S("g", { transform: `translate(${12},${n.h / 2 - 10}) scale(${20 / 24})`, class: "sd-ic" }, gN);
      ig.innerHTML = IC[ic] || IC.box;
      const t = S("text", { x: 44, y: n.sub ? n.h / 2 - 3 : n.h / 2 + 4.5, class: "sd-nl" }, gN);
      t.textContent = n.label;
      if (n.sub) { const s2 = S("text", { x: 44, y: n.h / 2 + 13, class: "sd-ns" }, gN); s2.textContent = n.sub; }
      if (n.count > 1) { const b = S("text", { x: n.w - 8, y: 14, class: "sd-count", "text-anchor": "end" }, gN); b.textContent = `×${n.count}`; }
      nodeEls[n.id] = gN;
    });
    svg.appendChild(labelLayer);
    fitToContent(svg);
    if (g.caption) body.appendChild(el(`<div class="sd-caption">${inl(g.caption)}</div>`));

    // flows
    if (!g.flows.length) return;
    const packet = S("circle", { r: 6.5, class: "sd-packet", opacity: 0 }, svg);
    const tmpPath = S("path", { class: "sd-edge temp", opacity: 0 }, eLayer);
    tmpPath.setAttribute("marker-end", mk("arrow-on"));
    let flowIdx = 0, anim = null;
    const tabs = el(`<div class="sd-flowtabs">${g.flows.map((f, i) => `<button class="${i ? "" : "on"}" data-i="${i}">${esc(f.name)}</button>`).join("")}</div>`);
    if (g.flows.length > 1) body.appendChild(tabs);
    const clearHL = () => {
      edgeEls.forEach(({ e, path }) => { path.classList.remove("on"); if (e.kind !== "--") path.setAttribute("marker-end", mk("arrow")); });
      Object.values(nodeEls).forEach((n) => n.classList.remove("on", "dim", "src"));
      tmpPath.setAttribute("opacity", 0);
      packet.setAttribute("opacity", 0);
      if (anim) cancelAnimationFrame(anim);
    };
    const findEdge = (a, b) => edgeEls.find(({ e }) => (e.a === a && e.b === b) || ((e.kind === "<->" || e.kind === "<-->" || e.kind === "--") && e.a === b && e.b === a)) || edgeEls.find(({ e }) => e.a === b && e.b === a);
    const showStep = (i) => {
      clearHL();
      const f = g.flows[flowIdx];
      if (i < 0) return g.flows.length ? `<strong>${esc(f.name)}</strong>: press ▶ to follow the request step by step, or use ← →.` : "";
      const st = f.steps[i];
      const A = g.byId[st.a], B = g.byId[st.b];
      Object.entries(nodeEls).forEach(([id, n]) => n.classList.add(id === st.a || id === st.b ? "on" : "dim"));
      nodeEls[st.a].classList.add("src");
      let path;
      const hit = findEdge(st.a, st.b);
      const reverse = hit && hit.e.a !== st.a;
      if (hit) { path = hit.path; path.classList.add("on"); if (path.getAttribute("marker-end")) path.setAttribute("marker-end", mk("arrow-on")); }
      else {
        const p = anchor(A, B, down), q = anchor(B, A, down);
        tmpPath.setAttribute("d", edgePath(p, q));
        tmpPath.setAttribute("opacity", 1);
        path = tmpPath;
      }
      // move a packet along the path
      const len = path.getTotalLength();
      const t0 = performance.now(), dur = reduced() ? 0 : 750;
      packet.setAttribute("opacity", 1);
      const tick = (now) => {
        const k = dur ? Math.min(1, (now - t0) / dur) : 1;
        const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const pt = path.getPointAtLength((reverse ? 1 - ease : ease) * len);
        packet.setAttribute("cx", pt.x); packet.setAttribute("cy", pt.y);
        if (k < 1) anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
      return `<span class="sd-stepno">${i + 1}</span> <strong>${esc(A.label)} → ${esc(B.label)}</strong>${st.text ? ` · ${inl(st.text)}` : ""}`;
    };
    let player = stepper(body, { count: g.flows[0].steps.length, render: showStep, autoMs: 1700 });
    $$("button", tabs).forEach((b) => (b.onclick = () => {
      flowIdx = +b.dataset.i;
      $$("button", tabs).forEach((x) => x.classList.toggle("on", x === b));
      player.stop(); player.wrap.remove(); clearHL();
      player = stepper(body, { count: g.flows[flowIdx].steps.length, render: showStep, autoMs: 1700 });
    }));
  }
  REG.arch = drawArch;

  /* ================================================================ SEQUENCE
     participant id Label [type]        (optional; otherwise created on first use)
     A -> B : message | explanation     sync call      A --> B : reply (dashed)
     A ->> B : async message            A -> A : self call
     note A : text      note A,B : text      == Section ==
  */
  function drawSeq(container, src, meta) {
    const parts = [], byId = {}, rows = [];
    const add = (id, label, type) => { if (!byId[id]) { const p = { id, label: label || id, type: type || "" }; byId[id] = p; parts.push(p); } return byId[id]; };
    for (const raw of String(src || "").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//")) continue;
      let m;
      if ((m = line.match(/^participants?:\s*(.+)$/i))) { m[1].split(",").forEach((s) => add(s.trim())); continue; }
      if ((m = line.match(/^participant\s+([\w.-]+)\s*(.*?)\s*(?:\[([\w-]+)\])?\s*$/i))) { const p = add(m[1], m[2] || m[1], m[3]); p.label = m[2] || m[1]; if (m[3]) p.type = m[3]; continue; }
      if ((m = line.match(/^==\s*(.+?)\s*==$/))) { rows.push({ kind: "sec", text: m[1] }); continue; }
      if ((m = line.match(/^note\s+([\w.-]+)(?:\s*,\s*([\w.-]+))?\s*:\s*(.+)$/i))) { add(m[1]); if (m[2]) add(m[2]); rows.push({ kind: "note", a: m[1], b: m[2] || m[1], text: m[3] }); continue; }
      if ((m = line.match(/^([\w.-]+)\s*(->>|-->|->|-x)\s*([\w.-]+)\s*(?::\s*(.*))?$/))) {
        add(m[1]); add(m[3]);
        const [label, why] = (m[4] || "").split(/\s\|\s/);
        rows.push({ kind: "msg", a: m[1], b: m[3], arrow: m[2], text: (label || "").trim(), why: (why || "").trim() });
        continue;
      }
    }
    if (!parts.length) return errorCard(container, "This sequence diagram has no participants.");
    const { body } = shell(container, { kicker: meta.kicker || "Sequence", title: meta.title || "", ic: "stream", cls: "sd-seq" });
    const colW = parts.map((p) => Math.max(110, textW(p.label, F_LABEL) + 40));
    // each gap between neighbouring lifelines must fit the messages that cross it;
    // a message spanning k gaps spreads its width over all k
    const idx = Object.fromEntries(parts.map((p, i) => [p.id, i]));
    const gap = parts.map((p, i) => (i ? Math.max(120, (colW[i - 1] + colW[i]) / 2 + 16) : 0));
    rows.forEach((r) => {
      if (r.kind !== "msg" || r.a === r.b) return;
      const i = Math.min(idx[r.a], idx[r.b]), j = Math.max(idx[r.a], idx[r.b]);
      const need = (textW(r.text, F_MONO) + 30) / (j - i);
      for (let k = i + 1; k <= j; k++) gap[k] = Math.max(gap[k], Math.min(360, need));
    });
    let x = 20 + colW[0] / 2;
    parts.forEach((p, i) => { if (i) x += gap[i]; p.x = x; });
    const noteW = (r) => { const A = byId[r.a], B = byId[r.b]; return Math.max(Math.abs(A.x - B.x) + 120, textW(r.text, F_EDGE) + 24); };
    const selfW = Math.max(0, ...rows.filter((r) => r.kind === "msg" && r.a === r.b).map((r) => byId[r.a].x + 56 + textW(r.text, F_MONO)));
    const noteR = Math.max(0, ...rows.filter((r) => r.kind === "note").map((r) => (byId[r.a].x + byId[r.b].x) / 2 + noteW(r) / 2));
    const W = Math.max(x + colW[parts.length - 1] / 2 + 20, selfW + 16, noteR + 8);
    const HEAD = 52, ROW = 44;
    let y = HEAD + 28;
    rows.forEach((r) => { r.y = y; y += r.kind === "sec" ? 34 : r.kind === "note" ? 40 : r.a === r.b ? 54 : ROW; });
    const H = y + 10;
    const wrap = el(`<div class="sd-canvas"></div>`);
    body.appendChild(wrap);
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "sd-svg" }, wrap);
    fit(svg, W);
    const mk = defs(svg);
    parts.forEach((p, i) => {
      S("line", { x1: p.x, y1: HEAD, x2: p.x, y2: H - 6, class: "sd-life" }, svg);
      const [ic, slot] = TYPES[p.type] || [null, "c3"];
      const gH = S("g", { class: `sd-node ${slot}`, transform: `translate(${p.x - colW[i] / 2},8)` }, svg);
      S("rect", { width: colW[i], height: 38, rx: 10, class: "sd-box" }, gH);
      const t = S("text", { x: colW[i] / 2 + (ic ? 10 : 0), y: 24, class: "sd-nl", "text-anchor": "middle" }, gH);
      t.textContent = p.label;
      if (ic) { const ig = S("g", { transform: `translate(${colW[i] / 2 - textW(p.label, F_LABEL) / 2 - 14},${11}) scale(${16 / 24})`, class: "sd-ic plain" }, gH); ig.innerHTML = IC[ic]; }
    });
    const rowEls = [];
    rows.forEach((r) => {
      const gR = S("g", { class: "sd-row" }, svg);
      if (r.kind === "sec") {
        S("line", { x1: 10, x2: W - 10, y1: r.y, y2: r.y, class: "sd-sec" }, gR);
        const w = textW(r.text, F_EDGE) + 18;
        S("rect", { x: W / 2 - w / 2, y: r.y - 10, width: w, height: 20, rx: 10, class: "sd-sec-pill" }, gR);
        const t = S("text", { x: W / 2, y: r.y + 4, "text-anchor": "middle", class: "sd-sec-t" }, gR); t.textContent = r.text;
      } else if (r.kind === "note") {
        const A = byId[r.a], B = byId[r.b];
        const w = noteW(r), cx = clamp((A.x + B.x) / 2, w / 2 + 4, W - w / 2 - 4);
        S("rect", { x: cx - w / 2, y: r.y - 14, width: w, height: 28, rx: 6, class: "sd-note" }, gR);
        const t = S("text", { x: cx, y: r.y + 4, "text-anchor": "middle", class: "sd-note-t" }, gR); t.textContent = r.text;
      } else {
        const A = byId[r.a], B = byId[r.b];
        const dashed = r.arrow === "-->";
        if (A === B) {
          S("path", { d: `M${A.x},${r.y - 8} h44 v22 h-44`, class: `sd-msg ${dashed ? "async" : ""}`, "marker-end": mk("arrow") }, gR);
          const t = S("text", { x: A.x + 52, y: r.y + 6, class: "sd-msg-t" }, gR); t.textContent = r.text;
        } else {
          const dir = B.x > A.x ? 1 : -1;
          S("line", { x1: A.x + dir * 3, y1: r.y, x2: B.x - dir * 4, y2: r.y, class: `sd-msg ${dashed ? "async" : ""} ${r.arrow === "-x" ? "lost" : ""}`, "marker-end": r.arrow === "->>" ? mk("open") : mk("arrow") }, gR);
          const t = S("text", { x: (A.x + B.x) / 2, y: r.y - 7, "text-anchor": "middle", class: "sd-msg-t" }, gR); t.textContent = r.text;
        }
      }
      rowEls.push(gR);
    });
    const msgs = rows.map((r, i) => i).filter((i) => rows[i].kind !== "sec");
    if (msgs.length < 2) return;
    stepper(body, {
      count: msgs.length, autoMs: 1600,
      render: (k) => {
        rowEls.forEach((g, j) => { g.classList.toggle("future", k >= 0 && j > msgs[k]); g.classList.toggle("on", k >= 0 && j === msgs[k]); });
        if (k < 0) return `Press ▶ to replay the conversation one message at a time.`;
        const r = rows[msgs[k]];
        if (r.kind === "note") return `<span class="sd-stepno">${k + 1}</span> ${inl(r.text)}`;
        return `<span class="sd-stepno">${k + 1}</span> <strong>${esc(byId[r.a].label)} → ${esc(byId[r.b].label)}</strong>: <code>${esc(r.text)}</code>${r.why ? ` — ${inl(r.why)}` : ""}`;
      },
    });
  }
  REG.seq = drawSeq;

  /* ================================================================ UML CLASS DIAGRAM
     class Name | abstract class Name | interface Name | enum Name    (then indented members)
       + field: Type        + method(arg: T): R        (+ public, - private, # protected)
     relations:  Child --|> Parent   Impl ..|> Iface   Whole *-- Part   Whole o-- Part
                 A --> B   A ..> B   (any may end with ": label" and use "1" / "*" multiplicities)
  */
  function drawUml(container, src, meta) {
    const classes = [], byName = {}, rels = [];
    let cur = null;
    const lines = String(src || "").split("\n");
    for (const raw of lines) {
      if (!raw.trim() || raw.trim().startsWith("//")) continue;
      const indented = /^\s/.test(raw);
      const line = raw.trim();
      let m;
      if (!indented && (m = line.match(/^(abstract\s+class|class|interface|enum)\s+([\w<>, ]+?)\s*$/))) {
        cur = { name: m[2].trim(), kind: m[1].replace(/\s+class/, ""), fields: [], methods: [] };
        classes.push(cur); byName[cur.name] = cur;
        continue;
      }
      if (!indented && (m = line.match(/^([\w]+)\s*(?:"([^"]*)")?\s*(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|-->|<--|\.\.>|<\.\.|--)\s*(?:"([^"]*)")?\s*([\w]+)\s*(?::\s*(.+))?$/))) {
        let [, a, ma, op, mb, b, label] = m;
        // normalise so that "from" is the dependent/child/part side's partner as drawn
        const flip = { "<|--": "--|>", "<|..": "..|>", "--*": "*--", "--o": "o--", "<--": "-->", "<..": "..>" };
        if (flip[op]) { [a, b] = [b, a]; [ma, mb] = [mb, ma]; op = flip[op]; }
        rels.push({ a, b, op, ma: ma || "", mb: mb || "", label: label || "" });
        cur = null;
        continue;
      }
      if (cur && indented) {
        const isMethod = /\(/.test(line);
        (isMethod ? cur.methods : cur.fields).push(line);
      }
    }
    const ensure = (n) => { if (!byName[n]) { const c = { name: n, kind: "class", fields: [], methods: [] }; classes.push(c); byName[n] = c; } };
    rels.forEach((r) => { ensure(r.a); ensure(r.b); });
    if (!classes.length) return errorCard(container, "This class diagram has no classes.");
    // sizes
    classes.forEach((c) => {
      const stereo = c.kind === "interface" ? "«interface»" : c.kind === "abstract" ? "«abstract»" : c.kind === "enum" ? "«enum»" : "";
      c.stereo = stereo;
      const ws = [textW(c.name, F_MONO_B) + 28, stereo ? textW(stereo, F_SUB) + 20 : 0, ...c.fields.concat(c.methods).map((s) => textW(s, F_MONO) + 22)];
      c.w = Math.ceil(clamp(Math.max(...ws), 120, 340));
      c.headH = stereo ? 40 : 30;
      c.h = c.headH + (c.fields.length ? c.fields.length * 18 + 10 : 6) + (c.methods.length ? c.methods.length * 18 + 10 : 6);
    });
    // layers: parents/wholes/users above children/parts/used
    const above = (r) => (r.op === "--|>" || r.op === "..|>" ? [r.b, r.a] : [r.a, r.b]);   // [upper, lower]
    const layer = {};
    classes.forEach((c) => (layer[c.name] = 0));
    for (let it = 0; it < classes.length; it++) {
      let changed = false;
      rels.forEach((r) => {
        const [u, l] = above(r);
        if (u !== l && layer[l] < layer[u] + 1 && layer[u] + 1 < classes.length) { layer[l] = layer[u] + 1; changed = true; }
      });
      if (!changed) break;
    }
    const L = {};
    classes.forEach((c) => (L[layer[c.name]] = L[layer[c.name]] || []).push(c));
    const keys = Object.keys(L).map(Number).sort((a, b) => a - b);
    // order within a layer by barycenter of connected nodes in the layer above (2 sweeps)
    const xIndex = {};
    keys.forEach((k) => L[k].forEach((c, i) => (xIndex[c.name] = i)));
    for (let sweep = 0; sweep < 2; sweep++) keys.forEach((k, ki) => {
      if (!ki) return;
      L[k].forEach((c) => {
        const nb = rels.filter((r) => r.a === c.name || r.b === c.name).map((r) => (r.a === c.name ? r.b : r.a)).filter((n) => layer[n] === keys[ki - 1]);
        c._b = nb.length ? nb.reduce((s, n) => s + xIndex[n], 0) / nb.length : xIndex[c.name];
      });
      L[k].sort((p, q) => p._b - q._b);
      L[k].forEach((c, i) => (xIndex[c.name] = i));
    });
    const GX = 36, GY = 64, PAD = 20;
    const rowW = keys.map((k) => L[k].reduce((s, c) => s + c.w, 0) + GX * (L[k].length - 1));
    const W = Math.max(...rowW) + PAD * 2;
    let y = PAD;
    keys.forEach((k, ki) => {
      let x = PAD + (W - PAD * 2 - rowW[ki]) / 2;
      const rh = Math.max(...L[k].map((c) => c.h));
      L[k].forEach((c) => { c.x = x; c.y = y; x += c.w + GX; });
      y += rh + GY;
    });
    const H = y - GY + PAD + 4;
    const { body } = shell(container, { kicker: meta.kicker || "Class diagram", title: meta.title || "", ic: "box", cls: "sd-uml" });
    const wrap = el(`<div class="sd-canvas"></div>`);
    body.appendChild(wrap);
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "sd-svg" }, wrap);
    fit(svg, W);
    const mk = defs(svg);
    const clip = (c, tx, ty) => {            // point on c's border towards (tx, ty)
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2, dx = tx - cx, dy = ty - cy;
      if (!dx && !dy) return { x: cx, y: cy };
      const s = Math.min(Math.abs((c.w / 2) / (dx || 1e-9)), Math.abs((c.h / 2) / (dy || 1e-9)));
      return { x: cx + dx * s, y: cy + dy * s };
    };
    // edges
    const pairCount = {};
    rels.forEach((r) => {
      const A = byName[r.a], B = byName[r.b];
      if (!A || !B || A === B) return;
      const key = [r.a, r.b].sort().join("|");
      const nth = (pairCount[key] = (pairCount[key] || 0) + 1) - 1;
      const off = nth * 14;
      const p = clip(A, B.x + B.w / 2 + off, B.y + B.h / 2), q = clip(B, A.x + A.w / 2 + off, A.y + A.h / 2);
      const dashed = r.op.startsWith("..");
      const line = S("line", { x1: p.x + off, y1: p.y, x2: q.x + off, y2: q.y, class: `sd-rel ${dashed ? "dashed" : ""}` }, svg);
      if (r.op === "--|>" || r.op === "..|>") line.setAttribute("marker-end", mk("tri"));
      else if (r.op === "*--") line.setAttribute("marker-start", mk("dia"));
      else if (r.op === "o--") line.setAttribute("marker-start", mk("odia"));
      else if (r.op === "-->" || r.op === "..>") line.setAttribute("marker-end", mk("open"));
      const mid = { x: (p.x + q.x) / 2 + off, y: (p.y + q.y) / 2 };
      if (r.label) {
        const w = textW(r.label, F_EDGE) + 10;
        S("rect", { x: mid.x - w / 2, y: mid.y - 9, width: w, height: 18, rx: 9, class: "sd-rel-pill" }, svg);
        const t = S("text", { x: mid.x, y: mid.y + 4, "text-anchor": "middle", class: "sd-rel-t" }, svg); t.textContent = r.label;
      }
      const mult = (pt, other, txt) => {
        if (!txt) return;
        const dx = other.x - pt.x, dy = other.y - pt.y, d = Math.hypot(dx, dy) || 1;
        const t = S("text", { x: pt.x + off + (dx / d) * 16 + (dy / d) * 10, y: pt.y + (dy / d) * 16 - (dx / d) * 10 + 4, "text-anchor": "middle", class: "sd-mult" }, svg);
        t.textContent = txt;
      };
      mult(p, q, r.ma); mult(q, p, r.mb);
    });
    // classes
    classes.forEach((c) => {
      const gC = S("g", { class: `sd-class ${c.kind}`, transform: `translate(${c.x},${c.y})` }, svg);
      S("rect", { width: c.w, height: c.h, rx: 8, class: "sd-cbox" }, gC);
      S("path", { d: `M0,${c.headH} H${c.w}`, class: "sd-csep" }, gC);
      S("rect", { width: c.w, height: c.headH, rx: 8, class: "sd-chead" }, gC);
      S("rect", { y: c.headH - 8, width: c.w, height: 8, class: "sd-chead flat" }, gC);
      if (c.stereo) { const st = S("text", { x: c.w / 2, y: 15, "text-anchor": "middle", class: "sd-cstereo" }, gC); st.textContent = c.stereo; }
      const t = S("text", { x: c.w / 2, y: c.stereo ? 32 : 20, "text-anchor": "middle", class: "sd-cname" }, gC); t.textContent = c.name;
      let yy = c.headH + 17;
      c.fields.forEach((f) => { const tt = S("text", { x: 10, y: yy, class: "sd-cmem" }, gC); tt.textContent = f; yy += 18; });
      if (c.fields.length) yy += 10;
      else yy += 6;
      if (c.methods.length) { S("path", { d: `M0,${yy - 14} H${c.w}`, class: "sd-csep" }, gC); }
      c.methods.forEach((f) => { const tt = S("text", { x: 10, y: yy, class: "sd-cmem m" }, gC); tt.textContent = f; yy += 18; });
    });
    if (meta.legend !== "off" && rels.length) {
      const sw = (marker, dashed, start) => `<svg width="40" height="14" viewBox="0 0 40 14" aria-hidden="true"><line x1="${start ? 12 : 2}" y1="7" x2="${start ? 38 : 28}" y2="7" class="sd-rel${dashed ? " dashed" : ""}"/>${marker}</svg>`;
      const items = [
        ["--|>", sw('<path d="M28,1.5 L38,7 L28,12.5 z" class="mk-tri"/>'), "inherits (is-a)"],
        ["..|>", sw('<path d="M28,1.5 L38,7 L28,12.5 z" class="mk-tri"/>', true), "implements"],
        ["*--", sw('<path d="M1,7 L6.5,3 L12,7 L6.5,11 z" class="mk-dia"/>', false, true), "composition (owns, same lifetime)"],
        ["o--", sw('<path d="M1,7 L6.5,3 L12,7 L6.5,11 z" class="mk-dia hollow"/>', false, true), "aggregation (has, shared)"],
        ["-->", sw('<path d="M30,2 L38,7 L30,12" class="mk-line"/>'), "association (uses)"],
        ["..>", sw('<path d="M30,2 L38,7 L30,12" class="mk-line"/>', true), "dependency (temporarily uses)"],
      ].filter(([op]) => rels.some((r) => r.op === op));
      body.appendChild(el(`<div class="sd-legend">${items.map(([, svgS, t]) => `<span>${svgS}${t}</span>`).join("")}</div>`));
    }
  }
  REG.uml = drawUml;

  /* ================================================================ STATE MACHINE
     state Name "Label"  [initial] [final]  @col,row
     A -> B : event [guard] / action          (self-loops allowed)
     play: event1, event2, ...                (optional: a stepper that walks the machine)
     States are laid out left to right in breadth-first order from the initial state.
  */
  function drawState(container, src, meta) {
    const states = [], byName = {}, edges = [];
    let play = [];
    for (const raw of String(src || "").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//")) continue;
      let m;
      if ((m = line.match(/^play\s*:\s*(.+)$/i))) { play = m[1].split(",").map((x) => x.trim()).filter(Boolean); continue; }
      if ((m = line.match(/^state\s+(\w+)\s*(?:"([^"]*)")?\s*((?:\[\w+\]\s*)*)(?:@(\d+)\s*,\s*(\d+))?\s*$/i))) {
        const st = { name: m[1], label: m[2] || m[1], initial: /\[initial\]/i.test(m[3]), final: /\[final\]/i.test(m[3]), col: m[4] != null ? +m[4] : null, row: m[5] != null ? +m[5] : null };
        states.push(st); byName[st.name] = st;
        continue;
      }
      if ((m = line.match(/^(\w+)\s*->\s*(\w+)\s*(?::\s*(.*))?$/))) { edges.push({ a: m[1], b: m[2], label: (m[3] || "").trim() }); continue; }
    }
    edges.forEach((e) => [e.a, e.b].forEach((n) => { if (!byName[n]) { const st = { name: n, label: n }; states.push(st); byName[n] = st; } }));
    if (!states.length) return errorCard(container, "This state diagram has no states.");
    const start = states.find((x) => x.initial) || states[0];
    // breadth-first layers from the initial state
    const layer = { [start.name]: 0 };
    const queue = [start.name];
    while (queue.length) {
      const n = queue.shift();
      edges.filter((e) => e.a === n && layer[e.b] == null).forEach((e) => { layer[e.b] = layer[n] + 1; queue.push(e.b); });
    }
    let maxL = Math.max(0, ...Object.values(layer));
    states.forEach((x) => { if (layer[x.name] == null) layer[x.name] = ++maxL; });
    const cols = {};
    states.forEach((x) => { const c = x.col != null ? x.col : layer[x.name]; (cols[c] = cols[c] || []).push(x); layer[x.name] = c; });
    const { body } = shell(container, { kicker: meta.kicker || "State machine", title: meta.title || "", ic: "clock", cls: "sd-state" });
    states.forEach((x) => { x.w = Math.max(96, Math.ceil(textW(x.label, F_LABEL)) + 32); x.h = 40; });
    const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
    const colW = {}; colKeys.forEach((c) => (colW[c] = Math.max(...cols[c].map((x) => x.w))));
    const GX = 92, GY = 74, PADX = 40, PADY = 58;
    let x0 = PADX; const colX = {};
    colKeys.forEach((c) => { colX[c] = x0; x0 += colW[c] + GX; });
    const maxRows = Math.max(...colKeys.map((c) => cols[c].length));
    colKeys.forEach((c) => cols[c].forEach((x, i) => {
      const r = x.row != null ? x.row : i + (maxRows - cols[c].length) / 2;
      x.x = colX[c] + (colW[c] - x.w) / 2; x.y = PADY + r * GY;
    }));
    const W = x0 - GX + PADX;
    const H = Math.max(...states.map((x) => x.y + x.h)) + PADY;
    const wrap = el(`<div class="sd-canvas"></div>`);
    body.appendChild(wrap);
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "sd-svg" }, wrap);
    fit(svg, W);
    const mk = defs(svg);
    const cx = (x) => x.x + x.w / 2, cy = (x) => x.y + x.h / 2;
    const clip = (n, tx, ty) => {
      const dx = tx - cx(n), dy = ty - cy(n);
      if (!dx && !dy) return { x: cx(n), y: cy(n) };
      const k = Math.min(Math.abs((n.w / 2 + 3) / (dx || 1e-9)), Math.abs((n.h / 2 + 3) / (dy || 1e-9)));
      return { x: cx(n) + dx * k, y: cy(n) + dy * k };
    };
    const edgeEls = [];
    edges.forEach((e) => {
      const A = byName[e.a], B = byName[e.b];
      const g = S("g", { class: "sd-st-edge" }, svg);
      let d, lx, ly;
      if (A === B) {
        const x1 = cx(A) - 14, x2 = cx(A) + 14, y = A.y;
        d = `M${x1},${y} C${x1 - 14},${y - 38} ${x2 + 14},${y - 38} ${x2},${y}`;
        lx = cx(A); ly = y - 33;
      } else {
        const hasRev = edges.some((o) => o.a === e.b && o.b === e.a);
        const backward = layer[e.b] <= layer[e.a];
        const skip = Math.abs(layer[e.b] - layer[e.a]) > 1 || (layer[e.b] === layer[e.a]);
        const off = (hasRev ? 20 : 0) + (backward && !hasRev ? 34 : 0) + (skip && !hasRev && !backward ? 30 : 0);
        const p0 = clip(A, cx(B), cy(B)), q0 = clip(B, cx(A), cy(A));
        const dx = q0.x - p0.x, dy = q0.y - p0.y, len = Math.hypot(dx, dy) || 1;
        const nx = dy / len, ny = -dx / len;
        const mx = (p0.x + q0.x) / 2, my = (p0.y + q0.y) / 2;
        const c = { x: mx + nx * off * 2, y: my + ny * off * 2 };
        const p = clip(A, c.x, c.y), q = clip(B, c.x, c.y);
        d = off ? `M${p.x},${p.y} Q${c.x},${c.y} ${q.x},${q.y}` : `M${p0.x},${p0.y} L${q0.x},${q0.y}`;
        lx = off ? 0.25 * p.x + 0.5 * c.x + 0.25 * q.x : mx; ly = off ? 0.25 * p.y + 0.5 * c.y + 0.25 * q.y : my;
      }
      const path = S("path", { d, class: "sd-st-line", fill: "none", "marker-end": mk("arrow") }, g);
      if (e.label) {
        const w = textW(e.label, F_EDGE) + 12;
        S("rect", { x: lx - w / 2, y: ly - 9, width: w, height: 18, rx: 9, class: "sd-rel-pill" }, g);
        const t = S("text", { x: lx, y: ly + 4, "text-anchor": "middle", class: "sd-rel-t" }, g); t.textContent = e.label;
      }
      e.el = g; e.path = path;
      edgeEls.push(g);
    });
    states.forEach((x) => {
      const g = S("g", { class: "sd-st-node" + (x.final ? " final" : ""), transform: `translate(${x.x},${x.y})` }, svg);
      S("rect", { width: x.w, height: x.h, rx: 14, class: "sd-st-box" }, g);
      if (x.final) S("rect", { x: 4, y: 4, width: x.w - 8, height: x.h - 8, rx: 10, class: "sd-st-inner" }, g);
      const t = S("text", { x: x.w / 2, y: x.h / 2 + 4.5, "text-anchor": "middle", class: "sd-st-t" }, g); t.textContent = x.label;
      x.el = g;
    });
    // entry arrow into the initial state
    const sx = start.x, sy = cy(start);
    S("circle", { cx: sx - 34, cy: sy, r: 5, class: "sd-st-init" }, svg);
    S("line", { x1: sx - 29, y1: sy, x2: sx - 2, y2: sy, class: "sd-st-line", "marker-end": mk("arrow") }, svg);

    if (!play.length) return;
    // walk the machine: event k fires the first outgoing transition of the current state with that label
    const trail = [];
    let cur = start.name;
    play.forEach((ev) => {
      const key = ev.toLowerCase();
      const e = edges.find((t) => t.a === cur && t.label.toLowerCase().split(/\s*[\[/]/)[0].trim() === key) || edges.find((t) => t.a === cur && t.label.toLowerCase().startsWith(key));
      trail.push({ ev, from: cur, edge: e || null, to: e ? e.b : cur });
      if (e) cur = e.b;
    });
    stepper(body, {
      count: trail.length, autoMs: 1500,
      render: (k) => {
        states.forEach((x) => x.el.classList.toggle("on", k < 0 ? x === start : x.name === trail[k].to));
        edges.forEach((e) => e.el.classList.toggle("on", k >= 0 && trail[k].edge === e));
        if (k < 0) return `Press ▶ to feed the events <code>${play.map(esc).join("</code>, <code>")}</code> into the machine. It starts in <strong>${esc(start.label)}</strong>.`;
        const t = trail[k];
        return t.edge
          ? `<span class="sd-stepno">${k + 1}</span> In <strong>${esc(byName[t.from].label)}</strong>, event <code>${esc(t.ev)}</code> → moves to <strong>${esc(byName[t.to].label)}</strong>`
          : `<span class="sd-stepno">${k + 1}</span> In <strong>${esc(byName[t.from].label)}</strong>, event <code>${esc(t.ev)}</code> is <strong>not allowed</strong>: the machine stays where it is.`;
      },
    });
  }
  REG.state = drawState;

  /* ================================================================ simulators */
  // Helpers for small interactive widgets: a card with controls + a stage.
  function sim(name, kicker, ic, build) {
    REG[name] = (container, src, meta) => {
      const cfg = {};
      String(src || "").split("\n").forEach((l) => { const m = l.match(/^\s*([\w-]+)\s*[=:]\s*(.+?)\s*$/); if (m) cfg[m[1]] = m[2]; });
      const { card, body } = shell(container, { kicker, title: meta.title || "", ic, cls: "sd-sim sd-" + name });
      build(body, cfg, meta, card);
    };
  }
  const SIM = { sim, el, esc, inl, S, $, $$, clamp, icon, UI, textW, reduced, stepper, defs, TYPES, IC };

  /* ================================================================ JSLab visuals */
  // Split "a, f(b, c), d" on top-level commas only
  function splitTop(s, sep = ",") {
    const out = []; let depth = 0, cur = "", q = "";
    for (const ch of String(s)) {
      if (q) { cur += ch; if (ch === q) q = ""; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { q = ch; cur += ch; continue; }
      if ("([{".includes(ch)) depth++;
      if (")]}".includes(ch)) depth--;
      if (ch === sep && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.filter((x) => x !== "");
  }

  /* ---------------------------------------------------------------- eventloop
     algo=eventloop — step through how the call stack, the Web/Node APIs and the two queues cooperate.
       phase: timers, pending, poll, check, close      (optional; draws the Node phase ribbon)
       step | stack: main, log("A") | apis: setTimeout(cb) | micro: - | macro: cb | print: A | note: Plain English caption
     A field you leave out keeps its value from the step before. "-" empties it.
     "stack" is listed bottom → top. Queues are listed front → back.  "phase:" in a step highlights that Node phase.  */
  function drawEventLoop(container, src, meta) {
    const phases = []; const steps = [];
    let labels = { stack: "Call stack", apis: "Web / Node APIs", micro: "Microtask queue", macro: "Task queue" };
    String(src).split("\n").forEach((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith("#")) return;
      let m;
      if ((m = line.match(/^phases:\s*(.+)$/i))) { splitTop(m[1]).forEach((p) => phases.push(p)); return; }
      if ((m = line.match(/^label\s+(stack|apis|micro|macro):\s*(.+)$/i))) { labels[m[1].toLowerCase()] = m[2].trim(); return; }
      if (/^step\b/i.test(line)) {
        const st = {};
        line.replace(/^step\s*\|?/i, "").split(/\s\|\s/).forEach((part) => {
          const mm = part.trim().match(/^(stack|apis|micro|macro|print|note|phase|warn):\s*(.*)$/i);
          if (mm) st[mm[1].toLowerCase()] = mm[2].trim();
        });
        steps.push(st);
      }
    });
    if (!steps.length) return errorCard(container, "This event-loop diagram has no steps.");
    // carry values forward
    const state = []; let cur = { stack: [], apis: [], micro: [], macro: [], out: [], phase: "", note: "" };
    steps.forEach((st) => {
      const next = { ...cur, note: st.note || "", print: null };
      ["stack", "apis", "micro", "macro"].forEach((k) => { if (k in st) next[k] = st[k] === "-" ? [] : splitTop(st[k]); });
      if ("phase" in st) next.phase = st.phase === "-" ? "" : st.phase;
      if (st.print != null && st.print !== "-") { next.out = cur.out.concat(splitTop(st.print)); next.print = splitTop(st.print); }
      next.warn = !!st.warn;
      state.push(next); cur = next;
    });
    const { body } = shell(container, { kicker: meta.kicker || "Event loop", title: meta.title || "", ic: "loop", cls: "js-el" });
    const grid = el(`<div class="el-grid">
      <div class="el-p el-stack"><div class="el-h">${esc(labels.stack)}</div><div class="el-body" data-k="stack"></div></div>
      <div class="el-p el-apis"><div class="el-h">${esc(labels.apis)}</div><div class="el-body" data-k="apis"></div></div>
      <div class="el-p el-micro"><div class="el-h">${esc(labels.micro)} <small>runs first</small></div><div class="el-body el-q" data-k="micro"></div></div>
      <div class="el-p el-macro"><div class="el-h">${esc(labels.macro)} <small>runs one at a time</small></div><div class="el-body el-q" data-k="macro"></div></div>
      <div class="el-p el-out"><div class="el-h">Console</div><div class="el-body" data-k="out"></div></div>
    </div>`);
    if (phases.length) body.appendChild(el(`<div class="el-phases">${phases.map((p, i) => `<span class="el-ph" data-p="${esc(p.toLowerCase())}">${esc(p)}</span>${i < phases.length - 1 ? '<i>→</i>' : '<i class="loop">↻</i>'}`).join("")}</div>`));
    body.appendChild(grid);
    const prevItems = {};
    stepper(body, {
      count: state.length, autoMs: 1700, startAt: 0,
      render: (k) => {
        const s = k < 0 ? state[state.length - 1] : state[k];
        const before = k > 0 ? state[k - 1] : null;
        ["stack", "apis", "micro", "macro"].forEach((key) => {
          const box = $(`[data-k="${key}"]`, grid);
          const items = key === "stack" ? s[key].slice().reverse() : s[key];
          const old = before ? before[key] : [];
          box.innerHTML = items.length ? items.map((t, i) => {
            const isNew = k >= 0 && !old.includes(t);
            const top = key === "stack" && i === 0;
            return `<div class="el-item${isNew ? " new" : ""}${top ? " top" : ""}"><code>${esc(t)}</code></div>`;
          }).join("") : '<div class="el-empty">empty</div>';
        });
        const o = $('[data-k="out"]', grid);
        o.innerHTML = s.out.length ? s.out.map((t, i) => `<div class="el-line${s.print && i >= s.out.length - s.print.length ? " new" : ""}">${esc(t)}</div>`).join("") : '<div class="el-empty">nothing printed yet</div>';
        $$(".el-ph", body).forEach((p) => p.classList.toggle("on", !!s.phase && p.dataset.p === s.phase.toLowerCase()));
        if (k < 0) return "Press ▶ to run the program one step at a time. Watch the <strong>call stack</strong>, the two <strong>queues</strong> and the <strong>console</strong>.";
        return `<span class="sd-stepno">${k + 1}</span> ${inl(s.note || "")}`;
      },
    });
  }
  REG.eventloop = drawEventLoop;

  /* ---------------------------------------------------------------- chain
     algo=chain — boxes with rows, joined by labelled arrows (prototype chains, scope chains, closures, heap graphs).
       node id "Title" @col,row [hl|ok|bad|dim|fn]
         key: value
       link a -> b : label   [dashed] [bad]
     Nodes are placed on a grid (@col,row, default: left to right in order). */
  function drawChain(container, src, meta) {
    const nodes = [], byId = {}, links = [];
    let curN = null, auto = 0;
    String(src).split("\n").forEach((raw) => {
      if (!raw.trim() || raw.trim().startsWith("#")) return;
      let m;
      if ((m = raw.match(/^node\s+([\w.$-]+)\s*(?:"([^"]*)")?\s*((?:@\d+\s*,\s*\d+)?)\s*((?:\[\w+\]\s*)*)\s*$/i))) {
        const n = { id: m[1], title: m[2] != null ? m[2] : m[1], rows: [], kinds: (m[4] || "").match(/\w+/g) || [] };
        if (m[3]) { const [c, r] = m[3].slice(1).split(",").map(Number); n.col = c; n.row = r; } else { n.col = auto++; n.row = 0; }
        nodes.push(n); byId[n.id] = n; curN = n; return;
      }
      if ((m = raw.match(/^link\s+([\w.$-]+)\s*(?:\.(\d+))?\s*->\s*([\w.$-]+)\s*(?::\s*(.*?))?\s*((?:\[\w+\]\s*)*)$/i))) {
        links.push({ a: m[1], b: m[3], row: m[2] != null ? +m[2] : null, label: (m[4] || "").trim(), kinds: (m[5] || "").match(/\w+/g) || [] });
        curN = null; return;
      }
      if (curN && /^\s+\S/.test(raw)) {
        const t = raw.trim(); const mm = t.match(/^([^:]+?):\s*(.*)$/);
        curN.rows.push(mm ? { k: mm[1], v: mm[2] } : { k: "", v: t });
      }
    });
    if (!nodes.length) return errorCard(container, "This diagram has no nodes.");
    const ROWH = 22, HEADH = 30, PADX = 14, GX = 76, GY = 44;
    nodes.forEach((n) => {
      const kw = Math.max(0, ...n.rows.map((r) => (r.k ? textW(r.k + ":", F_MONO) + 8 : 0)));
      n.kw = kw;
      n.w = Math.ceil(Math.max(textW(n.title, F_LABEL) + 28, ...n.rows.map((r) => kw + textW(r.v, F_MONO) + 2 * PADX), 120));
      n.h = HEADH + Math.max(0, n.rows.length) * ROWH + (n.rows.length ? 10 : 0);
    });
    const maxCol = Math.max(...nodes.map((n) => n.col)), maxRow = Math.max(...nodes.map((n) => n.row));
    const colW = [], rowH = [];
    for (let c = 0; c <= maxCol; c++) colW[c] = Math.max(0, ...nodes.filter((n) => n.col === c).map((n) => n.w));
    for (let r = 0; r <= maxRow; r++) rowH[r] = Math.max(0, ...nodes.filter((n) => n.row === r).map((n) => n.h));
    const colX = [], rowY = []; let x = 16, y = 16;
    for (let c = 0; c <= maxCol; c++) { colX[c] = x; x += colW[c] + GX; }
    for (let r = 0; r <= maxRow; r++) { rowY[r] = y; y += rowH[r] + GY; }
    nodes.forEach((n) => { n.x = colX[n.col] + (colW[n.col] - n.w) / 2; n.y = rowY[n.row]; });
    const W = x - GX + 16, H = y - GY + 16;
    const { body } = shell(container, { kicker: meta.kicker || "Diagram", title: meta.title || "", ic: "network", cls: "js-chain" });
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "sd-svg", role: "img" });
    const mk = defs(svg);
    body.appendChild(svg);
    const g = S("g", {}, svg);
    // links first (under nodes)
    links.forEach((l) => {
      const A = byId[l.a], B = byId[l.b];
      if (!A || !B) return;
      const ay = l.row != null ? A.y + HEADH + l.row * ROWH + ROWH / 2 : A.y + A.h / 2;
      let p, q, d, lx, ly;
      if (A === B) {
        p = { x: A.x + A.w, y: ay }; q = { x: A.x + A.w, y: ay + 18 };
        d = `M${p.x},${p.y} C${p.x + 38},${p.y - 6} ${p.x + 38},${q.y + 6} ${q.x},${q.y}`; lx = p.x + 40; ly = (p.y + q.y) / 2;
      } else if (A.col === B.col) {
        const down = B.y > A.y;
        p = { x: A.x + A.w / 2, y: down ? A.y + A.h : A.y }; q = { x: B.x + B.w / 2, y: down ? B.y : B.y + B.h };
        d = `M${p.x},${p.y} L${q.x},${q.y}`; lx = p.x; ly = (p.y + q.y) / 2;
      } else {
        const right = B.x > A.x;
        p = { x: right ? A.x + A.w : A.x, y: l.row != null ? ay : A.y + A.h / 2 }; q = { x: right ? B.x : B.x + B.w, y: B.y + Math.min(B.h / 2, 16 + 4) };
        if (l.row == null) q.y = B.y + B.h / 2;
        const mx = (p.x + q.x) / 2;
        d = `M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}`; lx = mx; ly = (p.y + q.y) / 2;
      }
      const cls = "js-link" + (l.kinds.includes("dashed") ? " dashed" : "") + (l.kinds.includes("bad") ? " bad" : "");
      S("path", { d, class: cls, fill: "none", "marker-end": mk("arrow") }, g);
      if (l.label) {
        const w = textW(l.label, F_EDGE) + 14;
        S("rect", { x: lx - w / 2, y: ly - 9, width: w, height: 18, rx: 9, class: "sd-rel-pill" }, g);
        const t = S("text", { x: lx, y: ly + 4, "text-anchor": "middle", class: "sd-rel-t" }, g); t.textContent = l.label;
      }
    });
    nodes.forEach((n) => {
      const kind = n.kinds.map((k) => k.toLowerCase());
      const ng = S("g", { class: "js-node " + kind.join(" "), transform: `translate(${n.x},${n.y})` }, g);
      S("rect", { width: n.w, height: n.h, rx: 10, class: "js-node-box" }, ng);
      S("path", { d: `M0,${HEADH} V10 a10,10 0 0 1 10,-10 H${n.w - 10} a10,10 0 0 1 10,10 V${HEADH} z`, class: "js-node-head" }, ng);
      const t = S("text", { x: 12, y: 20, class: "js-node-t" }, ng); t.textContent = n.title;
      n.rows.forEach((r, i) => {
        const yy = HEADH + 6 + i * ROWH + 15;
        if (r.k) { const k = S("text", { x: PADX, y: yy, class: "js-row-k" }, ng); k.textContent = r.k + ":"; }
        const v = S("text", { x: PADX + n.kw, y: yy, class: "js-row-v" }, ng); v.textContent = r.v;
      });
    });
    fit(svg, W);
  }
  REG.chain = drawChain;

  /* ---------------------------------------------------------------- timeline
     algo=timeline — bars on lanes against a time axis (sequential vs parallel, debounce, throttle, backpressure).
       scale: 0-900 ms
       lane Name | 0-300 | label | wait|run|ok|bad
       dot  Name | 150 | label                    (an event marker on a lane)
       mark 900 | label                           (vertical line across all lanes)  */
  function drawTimeline(container, src, meta) {
    let t0 = 0, t1 = 0, unit = "ms"; const lanes = [], marks = []; const order = [];
    String(src).split("\n").forEach((raw) => {
      const line = raw.trim(); let m;
      if (!line || line.startsWith("#")) return;
      if ((m = line.match(/^scale:\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*(\w*)/i))) { t0 = +m[1]; t1 = +m[2]; if (m[3]) unit = m[3]; return; }
      const parts = line.split("|").map((x) => x.trim());
      const head = parts[0].match(/^(lane|dot|mark)\s*(.*)$/i);
      if (!head) return;
      const kind = head[1].toLowerCase();
      if (kind === "mark") { marks.push({ at: +head[2], label: parts[1] || "" }); return; }
      const name = head[2];
      if (!lanes.find((l) => l.name === name)) { lanes.push({ name, bars: [], dots: [] }); }
      const lane = lanes.find((l) => l.name === name);
      if (kind === "lane") { const mm = parts[1].match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/); if (mm) lane.bars.push({ a: +mm[1], b: +mm[2], label: parts[2] || "", kind: (parts[3] || "run").toLowerCase() }); }
      else lane.dots.push({ at: +parts[1], label: parts[2] || "" });
    });
    if (!t1) t1 = Math.max(1, ...lanes.flatMap((l) => l.bars.map((b) => b.b).concat(l.dots.map((d) => d.at))), ...marks.map((m) => m.at));
    const span = t1 - t0 || 1;
    const pct = (v) => ((v - t0) / span * 100).toFixed(3) + "%";
    const { body } = shell(container, { kicker: meta.kicker || "Timeline", title: meta.title || "", ic: "clock", cls: "js-tl" });
    const ticks = []; const step = span / 6;
    for (let i = 0; i <= 6; i++) ticks.push(t0 + Math.round(step * i * 100) / 100);
    const nameW = Math.max(60, ...lanes.map((l) => Math.min(150, textW(l.name, F_LABEL) + 18)));
    const html = `<div class="tl" style="--nw:${Math.ceil(nameW)}px">
      <div class="tl-axis"><span class="tl-name"></span><div class="tl-track">${ticks.map((t) => `<i style="left:${pct(t)}"><b>${esc(String(t))}</b></i>`).join("")}</div></div>
      ${lanes.map((l) => `<div class="tl-lane"><span class="tl-name">${esc(l.name)}</span><div class="tl-track">
        ${marks.map((mk) => `<i class="tl-mark" style="left:${pct(mk.at)}"></i>`).join("")}
        ${l.bars.map((b) => `<div class="tl-bar ${esc(b.kind)}" style="left:${pct(b.a)};width:calc(${pct(b.b)} - ${pct(b.a)})" title="${esc(b.label)} (${b.a}–${b.b} ${esc(unit)})"><span>${esc(b.label)}</span></div>`).join("")}
        ${l.dots.map((d) => `<div class="tl-dot" style="left:${pct(d.at)}" title="${esc(d.label)} @ ${d.at} ${esc(unit)}"><b></b>${d.label ? `<em>${esc(d.label)}</em>` : ""}</div>`).join("")}
      </div></div>`).join("")}
      ${marks.length ? `<div class="tl-axis tl-marks"><span class="tl-name"></span><div class="tl-track">${marks.map((mk) => `<i class="tl-mlabel" style="left:${pct(mk.at)}">${esc(mk.label)}</i>`).join("")}</div></div>` : ""}
      <div class="tl-unit">time in ${esc(unit)}</div></div>`;
    body.appendChild(el(html));
  }
  REG.timeline = drawTimeline;

  function mount(container, name, src, meta = {}) {
    const fn = REG[name];
    if (!fn) return errorCard(container, `Unknown visual "${name}".`);
    try { fn(container, src, meta); }
    catch (e) { console.error(e); errorCard(container, `Couldn't draw "${name}": ${e.message}`); }
  }

  window.VIZ = { mount, has: (n) => !!REG[n], names: () => Object.keys(REG), SIM };
})();
