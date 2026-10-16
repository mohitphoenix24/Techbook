/* ==========================================================================
   DSA Sheets — pages: dashboard (#/sheets), problem (#/sheets/<id>), sidebar,
   progress / bookmarks / recent (localStorage), Ctrl+K search.
   Registers itself on window.EXT before app.js starts the router.
   ========================================================================== */
(function () {
  "use strict";
  const SX = (window.SHEETS = window.SHEETS || {});
  const EXT = (window.EXT = window.EXT || {});
  const catalog = SX.catalog;
  const byId = Object.fromEntries(catalog.map((p) => [p.id, p]));
  const BASE = (document.currentScript && document.currentScript.src.replace(/pages\.js.*$/, "")) || "assets/js/sheets/";
  let A = null;                                    // TechApp API (given by app.js on first route)

  /* ------------------------------------------------------------ persistence */
  const S = {
    get: (k, d) => (A ? A.store.get("sh:" + k, d) : d),
    set: (k, v) => A && A.store.set("sh:" + k, v),
  };
  const state = {
    done: () => S.get("done", {}),
    marks: () => S.get("bm", {}),
    recent: () => S.get("recent", []),
  };
  const isDone = (id) => !!state.done()[id];
  const isMarked = (id) => !!state.marks()[id];
  function toggle(kind, id) {
    const m = kind === "done" ? state.done() : state.marks();
    if (m[id]) delete m[id]; else m[id] = Date.now();
    S.set(kind === "done" ? "done" : "bm", m);
    return !!m[id];
  }
  function pushRecent(id) {
    const r = state.recent().filter((x) => x !== id);
    r.unshift(id);
    S.set("recent", r.slice(0, 8));
    S.set("last", id);
  }
  SX.persist = { isDone, isMarked, toggle, pushRecent, state, S };

  const ready = () => new Set(SX.ready || []);
  const isReady = (id) => ready().has(id);
  const LVL = { Easy: "easy", Medium: "medium", Hard: "hard" };
  const lvl = (d) => `<span class="lvl lvl-${LVL[d]}">${d}</span>`;
  const href = (id) => `#/sheets/${id}`;

  /* ------------------------------------------------------------ lazy loading of a lesson */
  SX.load = function (id) {
    if (SX.problems[id]) return Promise.resolve(SX.problems[id]);
    if (SX._loading && SX._loading[id]) return SX._loading[id];
    SX._loading = SX._loading || {};
    return (SX._loading[id] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${BASE}problems/${id}.js?v=${SX.version || 1}`;
      s.onload = () => (SX.problems[id] ? resolve(SX.problems[id]) : reject(new Error("The lesson file loaded, but it did not define the problem.")));
      s.onerror = () => { delete SX._loading[id]; reject(new Error("Could not load this lesson.")); };
      document.head.appendChild(s);
    }));
  };

  /* ------------------------------------------------------------ sidebar */
  function renderSidebar(activeId) {
    const sb = A.sidebar();
    const rd = ready();
    const done = state.done(), marks = state.marks();
    const total = catalog.length;
    const dn = catalog.filter((p) => done[p.id]).length;
    const open = new Set(S.get("openCats", []));
    const act = byId[activeId];
    if (act) open.add(act.category);
    sb.innerHTML = `
      <div class="side-progress"><div class="row"><span>DSA Sheets</span><span>${dn}/${total}</span></div><div class="bar"><i style="width:${(dn / total) * 100}%"></i></div></div>
      <div class="side-module sh-home"><a class="sh-side-home ${activeId ? "" : "active"}" href="#/sheets">${A.icon("sheet")}<span>Dashboard</span></a></div>
      ${SX.categories.map((c) => {
        const ps = catalog.filter((p) => p.category === c);
        const d = ps.filter((p) => done[p.id]).length;
        return `<div class="side-module ${open.has(c) ? "open" : ""}" data-mod="${A.esc(c)}">
          <button aria-expanded="${open.has(c)}"><span class="m-icon">${A.icon(SX.catIcon[c] || "list")}</span><span class="m-title">${A.esc(c === "Foundation" ? "Warm-up" : c)}</span><span class="m-count">${d}/${ps.length}</span>${A.icon("chevron", "chev")}</button>
          <ul class="side-lessons">${ps.map((p) => `<li><a href="${href(p.id)}" class="${p.id === activeId ? "active" : ""} ${done[p.id] ? "done" : ""} ${rd.has(p.id) ? "" : "soon"}"><span class="done-dot">✓</span><span class="t">${A.esc(p.title)}</span>${marks[p.id] ? `<span class="sh-bm" title="Bookmarked">★</span>` : ""}</a></li>`).join("")}</ul>
        </div>`;
      }).join("")}`;
    A.$$(".side-module > button", sb).forEach((btn) => {
      btn.onclick = () => {
        const mod = btn.parentElement;
        mod.classList.toggle("open");
        btn.setAttribute("aria-expanded", mod.classList.contains("open"));
        S.set("openCats", A.$$(".side-module.open", sb).map((x) => x.dataset.mod).filter(Boolean));
      };
    });
    const a = A.$(".side-lessons a.active", sb);
    if (a) { const r = a.getBoundingClientRect(); if (r.top < 80 || r.bottom > innerHeight - 40) a.scrollIntoView({ block: "center" }); }
  }
  SX.renderSidebar = renderSidebar;

  /* ------------------------------------------------------------ dashboard */
  const F0 = { q: "", cat: "all", lvl: "all", st: "all", sort: "list", pat: "all" };

  function dashboard() {
    A.setLayout({ sidebar: true });
    A.setActiveNav("sheets");
    renderSidebar(null);
    document.title = `DSA Sheets — ${A.SITE.name}`;
    const f = Object.assign({}, F0, S.get("filters", {}));
    const rd = ready();
    const blind = catalog.filter((p) => p.category !== "Foundation");
    const done = state.done(), marks = state.marks();
    const dn = blind.filter((p) => done[p.id]).length;
    const nReady = catalog.filter((p) => rd.has(p.id)).length;
    const pct = Math.round((dn / blind.length) * 100);
    const lastId = S.get("last", null);
    const patterns = [...new Set(catalog.flatMap((p) => p.patterns))].sort();

    A.main.innerHTML = `<div class="wide sh-dash">
      <div class="page-hero"><div class="kicker">DSA Sheets · Blind 75</div><h1>The Blind 75, as an interactive course</h1>
        <p>Every problem is a lesson: the intuition, the brute force and why it is slow, the key observation, then the optimal algorithm that you can <b>watch run</b> step by step, in C++ and JavaScript, on normal, edge, corner and your own test cases, with the time and space worked out in maths.</p></div>

      <div class="sh-top">
        <div class="sh-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-3)" stroke-width="10"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="url(#shg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * 52}" stroke-dashoffset="${2 * Math.PI * 52 * (1 - dn / blind.length)}" transform="rotate(-90 60 60)" style="transition:stroke-dashoffset .5s"/>
          <defs><linearGradient id="shg"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient></defs>
          <text x="60" y="58" text-anchor="middle" font-family="Space Grotesk" font-weight="700" font-size="26" fill="var(--text)">${dn}</text>
          <text x="60" y="78" text-anchor="middle" font-size="12" fill="var(--muted)">of ${blind.length}</text></svg><div class="lbl">${pct}% of Blind 75 done</div></div>
        <div class="sh-bars">${["Easy", "Medium", "Hard"].map((d) => { const all = blind.filter((p) => p.difficulty === d), c = all.filter((p) => done[p.id]).length; return `<div class="pt-bar ${LVL[d]}"><div class="row"><span>${d}</span><span>${c} / ${all.length}</span></div><div class="bar"><i style="width:${all.length ? (c / all.length) * 100 : 0}%"></i></div></div>`; }).join("")}
          <div class="sh-actions">${lastId && byId[lastId] ? `<a class="btn btn-lg primary" href="${href(lastId)}">${A.icon("play")} Continue: ${A.esc(byId[lastId].title)}</a>` : `<a class="btn btn-lg primary" href="${href("two-sum")}">${A.icon("rocket")} Start with Two Sum</a>`}
            <a class="btn btn-lg" href="${href("binary-search")}">${A.icon("target")} Warm up: Binary Search</a></div></div>
        <div class="sh-facts">
          <div><b>${blind.length}</b><span>Blind 75 problems</span></div>
          <div><b>${new Set(patterns).size}</b><span>DSA patterns</span></div>
          <div><b>2</b><span>languages: C++ &amp; JS</span></div>
          <div><b>${Object.keys(marks).length}</b><span>bookmarked</span></div>
        </div>
      </div>

      ${nReady < catalog.length ? `<div class="sh-build" role="status"><div class="sh-build-head">${A.icon("flame")} <b>Being built live</b> <span>${nReady} of ${catalog.length} lessons are ready. The rest are being written right now: refresh to see new ones appear.</span></div><div class="bar"><i style="width:${(nReady / catalog.length) * 100}%"></i></div></div>` : ""}

      <div id="sh-extra"></div>

      <div class="sh-tools">
        <input class="gl-input" id="sh-q" placeholder="Search problems, patterns or categories… (e.g. binary, window, dp)" autocomplete="off" value="${A.esc(f.q)}" aria-label="Search problems">
        <select id="sh-cat" class="sh-sel" aria-label="Category"><option value="all">All categories</option>${SX.categories.map((c) => `<option ${f.cat === c ? "selected" : ""}>${c}</option>`).join("")}</select>
        <select id="sh-pat" class="sh-sel" aria-label="Pattern"><option value="all">All patterns</option>${patterns.map((c) => `<option ${f.pat === c ? "selected" : ""}>${A.esc(c)}</option>`).join("")}</select>
        <div class="seg" id="sh-lvl">${["all", "Easy", "Medium", "Hard"].map((x) => `<button data-v="${x}" class="${f.lvl === x ? "on" : ""}">${x === "all" ? "All" : x}</button>`).join("")}</div>
        <div class="seg" id="sh-st">${[["all", "Any"], ["todo", "To do"], ["done", "Done"], ["bm", "★ Saved"]].map(([x, t]) => `<button data-v="${x}" class="${f.st === x ? "on" : ""}">${t}</button>`).join("")}</div>
        <select id="sh-sort" class="sh-sel" aria-label="Sort"><option value="list" ${f.sort === "list" ? "selected" : ""}>Sort: sheet order</option><option value="easy" ${f.sort === "easy" ? "selected" : ""}>Easiest first</option><option value="hard" ${f.sort === "hard" ? "selected" : ""}>Hardest first</option><option value="az" ${f.sort === "az" ? "selected" : ""}>A → Z</option></select>
      </div>
      <div id="sh-out"></div>
    </div>`;

    const card = (p) => `<a class="sh-card ${done[p.id] ? "done" : ""} ${rd.has(p.id) ? "" : "soon"}" href="${href(p.id)}">
        <div class="sh-card-top"><span class="sh-no">${p.no ? "#" + p.no : "★"}</span>${lvl(p.difficulty)}<button class="sh-bmbtn ${marks[p.id] ? "on" : ""}" data-id="${p.id}" aria-label="${marks[p.id] ? "Remove bookmark" : "Bookmark"}" title="Bookmark">${marks[p.id] ? "★" : "☆"}</button></div>
        <h3>${A.esc(p.title)}</h3>
        <div class="sh-card-meta"><span class="sh-cat">${A.icon(SX.catIcon[p.category] || "list")} ${A.esc(p.category === "Foundation" ? "Warm-up" : p.category)}</span>${p.premium ? `<span class="sh-prem" title="Premium on LeetCode: the statement here is written from scratch">premium</span>` : ""}</div>
        <div class="tags">${p.patterns.map((t) => `<span class="tag">${A.esc(t)}</span>`).join("")}</div>
        <div class="sh-card-foot"><span class="sh-viz">${A.icon("eye")} ${A.esc(VIZ_NAME[p.viz] || p.viz)}</span><span class="sh-status">${done[p.id] ? "✓ Done" : rd.has(p.id) ? "Open lesson →" : "Being written…"}</span></div></a>`;

    const extra = () => {
      const rec = state.recent().filter((id) => byId[id]).slice(0, 4);
      const bm = catalog.filter((p) => marks[p.id]);
      const dn2 = catalog.filter((p) => done[p.id]);
      const sec = (title, icon, items) => items.length ? `<section class="sh-sec"><h2>${A.icon(icon)} ${title}</h2><div class="sh-grid sm">${items.map(card).join("")}</div></section>` : "";
      return sec("Recently viewed", "history", rec.map((i) => byId[i])) + sec("Bookmarked", "star", bm) + (dn2.length ? `<section class="sh-sec"><h2>${A.icon("check")} Completed <small>${dn2.length}</small></h2><div class="sh-chips">${dn2.map((p) => `<a href="${href(p.id)}">✓ ${A.esc(p.title)}</a>`).join("")}</div></section>` : "");
    };
    A.$("#sh-extra").innerHTML = extra();

    function draw() {
      const q = f.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let list = catalog.filter((p) => (f.cat === "all" || p.category === f.cat) && (f.lvl === "all" || p.difficulty === f.lvl) && (f.pat === "all" || p.patterns.includes(f.pat)) &&
        (f.st === "all" || (f.st === "done" && done[p.id]) || (f.st === "todo" && !done[p.id]) || (f.st === "bm" && marks[p.id])) &&
        q.every((t) => (p.title + " " + p.patterns.join(" ") + " " + p.category + " " + (VIZ_NAME[p.viz] || "")).toLowerCase().includes(t)));
      const rank = { Easy: 0, Medium: 1, Hard: 2 };
      if (f.sort === "easy") list = list.slice().sort((a, b) => rank[a.difficulty] - rank[b.difficulty] || a.order - b.order);
      else if (f.sort === "hard") list = list.slice().sort((a, b) => rank[b.difficulty] - rank[a.difficulty] || a.order - b.order);
      else if (f.sort === "az") list = list.slice().sort((a, b) => a.title.localeCompare(b.title));
      const out = A.$("#sh-out");
      if (!list.length) { out.innerHTML = `<p class="sh-empty">No problems match these filters.</p>`; return; }
      if (f.sort === "list" && f.cat === "all" && !q.length) {
        out.innerHTML = SX.categories.map((c) => {
          const ps = list.filter((p) => p.category === c);
          if (!ps.length) return "";
          const d = ps.filter((p) => done[p.id]).length;
          return `<section class="sh-sec"><h2>${A.icon(SX.catIcon[c] || "list")} ${c === "Foundation" ? "Warm-up" : A.esc(c)} <small>${d}/${ps.length}</small></h2><div class="sh-grid">${ps.map(card).join("")}</div></section>`;
        }).join("");
      } else out.innerHTML = `<div class="sh-grid">${list.map(card).join("")}</div>`;
      A.$$(".sh-bmbtn", out).forEach((b) => (b.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        toggle("bm", b.dataset.id);
        dashboard();
      }));
    }
    const save = () => { S.set("filters", f); draw(); };
    A.$("#sh-q").oninput = (e) => { f.q = e.target.value; save(); };
    A.$("#sh-cat").onchange = (e) => { f.cat = e.target.value; save(); };
    A.$("#sh-pat").onchange = (e) => { f.pat = e.target.value; save(); };
    A.$("#sh-sort").onchange = (e) => { f.sort = e.target.value; save(); };
    for (const [id, key] of [["#sh-lvl", "lvl"], ["#sh-st", "st"]]) A.$$(id + " button").forEach((b) => (b.onclick = () => { f[key] = b.dataset.v; A.$$(id + " button").forEach((x) => x.classList.toggle("on", x === b)); save(); }));
    draw();
  }

  const VIZ_NAME = {
    array: "Array", sliding: "Sliding Window", twopointer: "Two Pointers", binary: "Binary Search", hashmap: "Hash Map", stack: "Stack", queue: "Queue", list: "Linked List",
    tree: "Tree", recursion: "Recursion", graph: "Graph", heap: "Heap", dp: "DP Table", matrix: "Matrix", backtracking: "Backtracking", trie: "Trie", interval: "Intervals",
    bit: "Bits", greedy: "Greedy", unionfind: "Union-Find",
  };
  SX.VIZ_NAME = VIZ_NAME;

  /* ------------------------------------------------------------ problem page */
  async function problemPage(id, anchor) {
    const meta = byId[id];
    if (!meta) { A.reroute; dashboardMissing(id); return; }
    A.setLayout({ sidebar: true });
    A.setActiveNav("sheets");
    renderSidebar(id);
    document.title = `${meta.title} — DSA Sheets — ${A.SITE.name}`;
    pushRecent(id);
    const i = catalog.indexOf(meta), prev = catalog[i - 1], next = catalog[i + 1];
    if (!isReady(id) && !SX.problems[id]) {
      A.main.innerHTML = `<div class="page no-toc"><article class="article">
        <div class="crumbs"><a href="#/sheets">DSA Sheets</a> ${A.icon("chevron")} <span>${A.esc(meta.category)}</span></div>
        <div class="lesson-head"><h1>${A.esc(meta.title)}</h1><div class="meta-row">${lvl(meta.difficulty)}${meta.patterns.map((t) => `<span class="tag">${A.esc(t)}</span>`).join("")}</div>
        <p class="summary">This lesson is being written right now. Refresh in a little while, or open one that is ready from the <a href="#/sheets">dashboard</a>.</p></div>
        <nav class="pager">${prev ? `<a class="prev" href="${href(prev.id)}"><small>← Previous</small><b>${A.esc(prev.title)}</b></a>` : "<span></span>"}${next ? `<a class="next" href="${href(next.id)}"><small>Next →</small><b>${A.esc(next.title)}</b></a>` : ""}</nav></article></div>`;
      return;
    }
    A.main.innerHTML = `<div class="page no-toc"><article class="article"><p class="sh-loading">${A.icon("loader", "spin")} Loading ${A.esc(meta.title)}…</p></article></div>`;
    try {
      const p = await SX.load(id);
      if (location.hash.split("~")[0] !== `#/sheets/${id}`) return;           // user already moved on
      SX.renderLesson(A, p, meta, { prev, next, anchor, i });
    } catch (e) {
      A.main.innerHTML = `<div class="page no-toc"><article class="article"><div class="lesson-head"><h1>${A.esc(meta.title)}</h1><p class="summary sh-err">${A.esc(e.message)}</p><a class="btn" href="#/sheets">Back to the dashboard</a></div></article></div>`;
      console.error(e);
    }
  }
  function dashboardMissing(id) {
    A.setLayout({ sidebar: true });
    renderSidebar(null);
    A.main.innerHTML = `<div class="page no-toc"><article class="article"><div class="lesson-head"><h1>No such problem</h1><p class="summary">“${A.esc(id)}” is not in the sheet.</p><a class="btn" href="#/sheets">${A.icon("sheet")} DSA Sheets</a></div></article></div>`;
  }

  /* ------------------------------------------------------------ registration */
  EXT.pages = EXT.pages || {};
  EXT.pages.sheets = function (parts, anchor, api) {
    A = api;
    if (!parts.length) dashboard();
    else problemPage(parts[0], anchor);
  };
  EXT.leave = function (first) {
    if (first !== "sheets" && SX.teardown) SX.teardown();
  };
  EXT.searchLabel = "DSA Sheets";
  EXT.search = function (terms) {
    return catalog.filter((p) => terms.every((t) => (p.title + " " + p.patterns.join(" ") + " " + p.category + " " + (VIZ_NAME[p.viz] || "")).toLowerCase().includes(t))).slice(0, 8)
      .map((p) => ({ title: p.title, sub: `${p.category} · ${p.patterns.join(", ")}`, href: href(p.id), icon: "sheet", lvl: LVL[p.difficulty] }));
  };
  EXT.icons = Object.assign(EXT.icons || {}, {});
})();
