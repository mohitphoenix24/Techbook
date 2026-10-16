/* ==========================================================================
   DSA Sheets — the lesson page. Renders one problem's data model into
   sections; the content itself lives in problems/<id>.js, never in this file.
   ========================================================================== */
(function () {
  "use strict";
  const SX = window.SHEETS;
  let lab = null;
  let spy = null;

  SX.teardown = function () {
    if (lab) { lab.destroy(); lab = null; }
    if (spy) { spy.disconnect(); spy = null; }
    document.querySelectorAll(".sh-measure-live").forEach((n) => n.remove());
  };

  const SECTIONS = [
    ["problem", "Problem", "file"], ["think", "Think first", "brain"], ["brute", "Brute force → better", "split"], ["pattern", "Pattern", "puzzle"], ["optimal", "Optimal idea", "bulb"],
    ["lab", "Watch it run", "play"], ["complexity", "Complexity", "chart"], ["edge", "Edge cases", "alert"], ["mistakes", "Mistakes", "flag"], ["followups", "Follow-ups", "message"], ["related", "Related", "network"], ["takeaways", "Takeaways", "key"],
  ];

  const QS = [
    ["find", "What are we trying to find?"], ["beginner", "What would a beginner naturally try?"], ["works", "Why does that work?"], ["slow", "Why is it too slow?"],
    ["repeat", "What are we doing again and again?"], ["remember", "What could we remember so we do not repeat it?"], ["observation", "Which observation removes the unnecessary work?"], ["leads", "How does that lead to the optimal algorithm?"],
  ];

  const human = (n) => (n >= 1e15 ? n.toExponential(1).replace("e+", "×10^") : n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + " billion" : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + " million" : n >= 1e4 ? Math.round(n).toLocaleString("en-IN") : String(Math.round(n)));

  /* ------------------------------------------------------------ the page */
  SX.renderLesson = function (A, p, meta, ctx) {
    SX.teardown();
    const { prev, next } = ctx;
    const esc = A.esc, md = (s) => A.md(s || ""), mi = (s) => A.mdInline(s || "");
    const href = (id) => `#/sheets/${id}`;
    const P = SX.persist;
    const byId = Object.fromEntries(SX.catalog.map((c) => [c.id, c]));
    const done = P.isDone(p.id), marked = P.isMarked(p.id);
    const LVL = { Easy: "easy", Medium: "medium", Hard: "hard" };
    const lc = meta.lc ? `https://leetcode.com/problems/${meta.lc}/` : "";

    const cplx = p.complexity || {};
    const sec = (id, title, icon, body, extra = "") => `<section class="sh-sec2" id="sec-${id}"><h2>${A.icon(icon)} ${esc(title)}${extra}</h2>${body}</section>`;

    /* 1 problem */
    const problem = `<div class="prose sh-prose">${md(p.statement)}
      <div class="ex-list">${p.examples.map((e, i) => `<div class="ex"><div class="ex-h">Example ${i + 1}</div><div class="ex-row"><b>Input</b><code>${esc(e.input)}</code></div><div class="ex-row"><b>Output</b><code>${esc(e.output)}</code></div>${e.explain ? `<div class="ex-row"><b>Why</b><span>${mi(e.explain)}</span></div>` : ""}</div>`).join("")}</div>
      <h3>Constraints</h3><ul class="cons">${p.constraints.map((c) => `<li>${mi(c)}</li>`).join("")}</ul>
      ${p.premiumNote ? `<p class="muted-p">${esc(p.premiumNote)}</p>` : meta.premium ? `<p class="muted-p">This problem is premium on LeetCode. The statement above is written from scratch for this lesson, and the examples and tests are verified by actually running the solutions.</p>` : ""}</div>`;

    /* 2 think first */
    const think = `<p class="lead-p">Try to answer each question yourself <b>before</b> you open it. That small effort is what makes the idea stick. These eight questions are the way a teacher would solve it <i>with</i> you.</p>
      <div class="qa-list">${QS.map(([k, q], i) => p.intuition[k] ? `<details class="qa" ${i === 0 ? "open" : ""}><summary><span class="qn">${i + 1}</span>${esc(q)}</summary><div class="qa-b prose">${md(p.intuition[k])}</div></details>` : "").join("")}</div>`;

    /* 3 brute → better */
    const flowSteps = p.flow || [];
    const FH = ["Brute force", "Why it works", "Why it is slow", "The observation", "A better idea", "Optimal solution"];
    const flow = flowSteps.length ? `<div class="flow bflow" role="list">${flowSteps.map((s, i) => `${i ? `<span class="flow-arrow">${A.icon("right")}</span>` : ""}<div class="flow-step" role="listitem"><span class="n">${i + 1}</span><b>${FH[i] || ""}</b><small>${mi(s)}</small></div>`).join("")}</div>` : "";
    const bruteTabs = `<div class="tabs-lite" data-group="brute">${["cpp", "js"].map((l) => `<button data-l="${l}">${l === "cpp" ? "C++" : "JavaScript"}</button>`).join("")}</div>
      ${["cpp", "js"].map((l) => `<div class="code-card compact sh-static" data-l="${l}"><div class="code-body"><pre class="static"><code>${A.highlight(p.brute.code[l], l)}</code></pre></div></div>`).join("")}`;
    let compare = "";
    const bm = p.brute.measure, om = cplx.measure;
    if (bm && om) {
      const ns = bm.ns || [10, 100, 1000, 10000, 100000, 1000000];
      compare = `<h3>How much work is that, really?</h3><p class="muted-p">The dominant step counted for each approach, for an input of size ${esc(om.label || "n")}. This is plain arithmetic on the formulas, not a measurement.</p>
        <div class="cmp-wrap"><table class="cmp-table"><thead><tr><th>n</th><th>Brute force<br><span>${A.tex(bm.fTex, false)}</span></th><th>Optimal<br><span>${A.tex(om.fTex, false)}</span></th><th>Optimal is faster by</th></tr></thead><tbody>
        ${ns.map((n) => { const b = bm.f(n), o = om.f(n); return `<tr><td>${n.toLocaleString("en-IN")}</td><td class="bad-t">${human(b)}</td><td class="ok-t">${human(o)}</td><td><b>${b / o >= 10 ? "×" + human(b / o) : "×" + (b / o).toFixed(1)}</b></td></tr>`; }).join("")}</tbody></table></div>
        <p class="muted-p">A modern computer does very roughly 10<sup>8</sup>–10<sup>9</sup> simple steps a second. Anything past about 10<sup>8</sup> will not finish in an interview time limit.</p>`;
    }
    const brute = `${flow}<div class="prose sh-prose">${md(p.brute.idea)}</div>${bruteTabs}
      <div class="cplx">${[["Time", p.brute.time, "clock"], ["Space", p.brute.space, "database"]].map(([k, v, ic]) => `<div class="cplx-item"><span class="k">${A.icon(ic)} ${k}</span><span class="v">${A.tex(v, false)}</span></div>`).join("")}</div>
      <div class="box box-warn"><div class="box-head">${A.icon("alert")} Why it is slow</div><div class="box-body prose">${md(p.brute.why)}</div></div>${compare}`;

    /* 4 pattern */
    const pattern = `<div class="pat-head"><span class="pat-chip">${A.icon("puzzle")} ${esc(p.pattern.name)}</span>${meta.patterns.filter((t) => t !== p.pattern.name).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      <div class="prose sh-prose"><h3>Why this problem belongs to this pattern</h3>${md(p.pattern.why)}<h3>How to recognise it in a new problem</h3><ul class="recog">${p.pattern.recognize.map((r) => `<li>${mi(r)}</li>`).join("")}</ul></div>`;

    /* 5 optimal */
    const optimal = `<div class="prose sh-prose">${md(p.optimal.idea)}</div>
      <h3 class="h3s">The algorithm, step by step</h3>
      <ol class="algo">${p.optimal.steps.map((s) => `<li>${mi(s)}</li>`).join("")}</ol>
      <div class="box box-pattern"><div class="box-head">${A.icon("puzzle")} The invariant</div><div class="box-body prose">${md(p.optimal.invariant)}</div></div>
      <div class="box box-proof"><div class="box-head">${A.icon("check")} Why it is correct</div><div class="box-body prose">${md(p.optimal.correct)}</div></div>`;

    /* 6 lab */
    const labSec = `<p class="lead-p">Pick a test case (normal, edge or corner) or type your own. Step through the algorithm, drag the timeline, and edit and <b>Run</b> the code in C++ or JavaScript. Everything on screen (variables, structure, operation, code line) is the same step.</p><div id="sh-lab"></div>`;

    /* 7 complexity */
    const deriveRows = (rows) => `<div class="derive-rows">${rows.map((r, i) => { const fin = r.startsWith("!"); const [m, why] = (fin ? r.slice(1) : r).split("||").map((x) => (x || "").trim()); return `<div class="derive-row ${fin ? "final" : ""}"><span class="n">${fin ? "∴" : i + 1}</span><span class="m">${A.tex("\\displaystyle " + m, false)}</span><span class="why">${why ? mi(why) : ""}</span></div>`; }).join("")}</div>`;
    const cx = (k, label, icon) => {
      const c = cplx[k];
      return `<div class="cx-block"><div class="cplx"><div class="cplx-item"><span class="k">${A.icon(icon)} ${label}</span><span class="v">${A.tex(c.tex, false)}</span><span class="d">${mi(c.short || "")}</span></div></div>
        <div class="derive"><div class="derive-head">${A.icon("chart")} Derivation <span class="sep">·</span><span class="box-title">${esc(c.title || label)}</span></div>${deriveRows(c.derive)}</div>
        <div class="prose sh-prose">${md(c.where)}</div></div>`;
    };
    const complexity = `${cx("time", "Time", "clock")}${cx("space", "Space", "database")}
      ${cplx.limit ? `<div class="box box-note"><div class="box-head">${A.icon("info")} Can it be better?</div><div class="box-body prose">${md(cplx.limit)}</div></div>` : ""}
      ${om ? `<h3 class="h3s">See the maths hold: the doubling experiment</h3><div id="sh-measure"></div>` : ""}`;

    /* 8 edge cases */
    const edgeTests = p.tests.map((t, i) => [t, i]).filter(([t]) => t.kind !== "normal");
    const edge = `<p class="lead-p">An edge case is not just a label. Each one below says <b>why</b> it can break a solution, and you can run it in the lab with one click.</p>
      <div class="edge-grid">${edgeTests.map(([t, i]) => { let out = "";
        try { const r = SX.trace(p, t.input, { countOnly: true }); out = r.hasResult ? SX.fmt(r.result, p.io.ret) : ""; } catch { /* ignore */ }
        return `<div class="edge-card ${t.kind}"><div class="ec-k">${t.kind === "edge" ? "Edge case" : "Corner case"}</div><h4>${esc(t.name)}</h4>
        <div class="ec-in">${(p.io.params || []).map(([n]) => `<div><b>${esc(n)}</b> <code>${esc(JSON.stringify(t.input[n]))}</code></div>`).join("")}${out ? `<div><b>answer</b> <code>${esc(out)}</code></div>` : ""}</div>
        <p><b>Why it matters.</b> ${mi(t.why)}</p><button class="btn ec-run" data-kind="${t.kind}" data-i="${i}">${A.icon("play")} Run this case in the lab</button></div>`; }).join("")}</div>`;

    /* 9 mistakes */
    const mistakes = `<div class="mk-list">${p.mistakes.map((m, i) => `<div class="mk"><div class="mk-n">${i + 1}</div><div class="mk-b"><h4>${mi(m.title)}</h4>
      <dl><dt>What it is</dt><dd>${mi(m.what)}</dd><dt>Why it happens</dt><dd>${mi(m.why)}</dd><dt>What breaks</dt><dd>${mi(m.breaks)}</dd><dt>How to avoid it</dt><dd>${mi(m.avoid)}</dd></dl>${m.example ? `<div class="prose mk-ex">${md(m.example)}</div>` : ""}</div></div>`).join("")}</div>`;

    /* 10 follow-ups */
    const followups = `<div class="qa-list">${p.followUps.map((f, i) => `<details class="qa fu" ${i === 0 ? "open" : ""}><summary><span class="qn">Q${i + 1}</span>${mi(f.q)}</summary><div class="qa-b prose">${md(f.a)}
      ${f.cpp || f.js ? `<div class="tabs-lite" data-group="fu${i}">${f.cpp ? `<button data-l="cpp">C++</button>` : ""}${f.js ? `<button data-l="js">JavaScript</button>` : ""}</div>${["cpp", "js"].filter((l) => f[l]).map((l) => `<div class="code-card compact sh-static" data-l="${l}"><div class="code-body"><pre class="static"><code>${A.highlight(SX.stripTags(f[l]).code, l)}</code></pre></div></div>`).join("")}` : ""}
      ${f.time ? `<div class="fu-cx"><span class="chip">${A.icon("clock")} Time ${A.tex(f.time, false)}</span><span class="chip">${A.icon("database")} Space ${A.tex(f.space || "O(1)", false)}</span></div>` : ""}</div></details>`).join("")}</div>`;

    /* 11 related */
    const related = `<div class="learned"><span>You just learned</span><b>${esc(p.pattern.name)}</b></div><div class="prose sh-prose">${md(p.patternNote)}</div>
      <div class="rel-grid">${p.related.map((r) => { const c = byId[r.id]; if (!c) return `<div class="rel"><b>${esc(r.title || r.id)}</b><p>${mi(r.why)}</p></div>`; return `<a class="rel" href="${href(c.id)}"><div class="rel-top"><b>${esc(c.title)}</b><span class="lvl lvl-${LVL[c.difficulty]}">${c.difficulty}</span></div><p>${mi(r.why)}</p><small>${esc(c.category)} · ${c.patterns.map(esc).join(", ")}</small></a>`; }).join("")}</div>`;

    /* 12 takeaways */
    const takeaways = `<div class="box box-keypoints"><div class="box-head">${A.icon("key")} Key takeaways</div><div class="box-body"><ul>${p.takeaways.map((t) => `<li>${mi(t)}</li>`).join("")}</ul></div></div>`;

    A.main.innerHTML = `<div class="wide sh-lesson">
      <div class="crumbs"><a href="#/sheets">DSA Sheets</a> ${A.icon("chevron")} <span>${esc(meta.category === "Foundation" ? "Warm-up" : meta.category)}</span></div>
      <header class="sh-head"><div class="sh-head-top"><span class="sh-no big">${meta.no ? "#" + meta.no + " of 75" : "Warm-up"}</span><span class="lvl lvl-${LVL[meta.difficulty]}">${meta.difficulty}</span>${meta.premium ? `<span class="sh-prem">premium</span>` : ""}</div>
        <h1>${esc(meta.title)}</h1>
        <div class="sh-head-meta">${meta.patterns.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}<span class="chip">${A.icon("eye")} ${esc(SX.VIZ_NAME[meta.viz] || meta.viz)} visualizer</span></div>
        <div class="sh-head-actions"><button class="btn sh-bm-btn ${marked ? "on" : ""}" id="sh-bm">${A.icon("star")} <span>${marked ? "Bookmarked" : "Bookmark"}</span></button>
          <button class="btn sh-done-btn ${done ? "done" : ""}" id="sh-done">${A.icon("check")} <span>${done ? "Completed" : "Mark as complete"}</span></button>
          ${lc ? `<a class="btn" href="${esc(lc)}" target="_blank" rel="noopener">LeetCode ↗</a>` : ""}</div></header>
      <nav class="sh-secnav" aria-label="Sections">${SECTIONS.map(([id, t, ic]) => `<a href="#/sheets/${esc(p.id)}~sec-${id}" data-s="sec-${id}">${A.icon(ic)}<span>${t}</span></a>`).join("")}</nav>
      ${sec("problem", "The problem", "file", problem)}
      ${sec("think", "Think before you code", "brain", think)}
      ${sec("brute", "Brute force, and why we need better", "split", brute)}
      ${sec("pattern", "The pattern behind it", "puzzle", pattern)}
      ${sec("optimal", "The optimal idea", "bulb", optimal)}
      ${sec("lab", "Watch it run: the interactive lab", "play", labSec)}
      ${sec("complexity", "Time and space, with the maths", "chart", complexity)}
      ${sec("edge", "Edge cases and corner cases", "alert", edge)}
      ${sec("mistakes", "Common mistakes", "flag", mistakes)}
      ${sec("followups", "Interview follow-ups", "message", followups)}
      ${sec("related", "Related problems", "network", related)}
      ${sec("takeaways", "Key takeaways", "key", takeaways)}
      <nav class="pager sh-pager">${prev ? `<a class="prev" href="${href(prev.id)}"><small>← Previous problem</small><b>${esc(prev.title)}</b></a>` : "<span></span>"}${next ? `<a class="next" href="${href(next.id)}"><small>Next problem →</small><b>${esc(next.title)}</b></a>` : ""}</nav>
    </div>`;

    const root = A.main;
    // language tabs in static code (brute force, follow-ups) follow the site-wide choice
    const pref = (() => { try { return localStorage.getItem("techcontent:codetab") === "js" ? "js" : "cpp"; } catch { return "cpp"; } })();
    const setTabs = (lang) => {
      A.$$(".tabs-lite", root).forEach((tl) => {
        const grp = tl.dataset.group;
        const btns = A.$$("button", tl), has = btns.map((b) => b.dataset.l);
        const pick = has.includes(lang) ? lang : has[0];
        btns.forEach((b) => b.classList.toggle("on", b.dataset.l === pick));
        let n = tl.nextElementSibling;
        while (n && n.classList.contains("sh-static")) { n.hidden = n.dataset.l !== pick; n = n.nextElementSibling; }
      });
    };
    setTabs(pref);
    A.$$(".tabs-lite", root).forEach((tl) => (tl.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; try { localStorage.setItem("techcontent:codetab", b.dataset.l); } catch { /* ignore */ } setTabs(b.dataset.l); }));

    // header actions
    A.$("#sh-bm").onclick = () => { const v = P.toggle("bm", p.id); A.$("#sh-bm").classList.toggle("on", v); A.$("#sh-bm span").textContent = v ? "Bookmarked" : "Bookmark"; SX.renderSidebar(p.id); if (v) A.toast("Bookmarked"); };
    A.$("#sh-done").onclick = () => { const v = P.toggle("done", p.id); A.$("#sh-done").classList.toggle("done", v); A.$("#sh-done span").textContent = v ? "Completed" : "Mark as complete"; SX.renderSidebar(p.id); if (v) A.toast(next ? `Done! Up next: ${next.title}` : "Done!"); };

    // the lab
    try { lab = new SX.Lab(A, p, A.$("#sh-lab")); }
    catch (e) { A.$("#sh-lab").innerHTML = `<p class="sh-err">The lab could not start: ${esc(e.message)}</p>`; console.error(e); }
    A.$$(".ec-run", root).forEach((b) => (b.onclick = () => { if (lab) { lab.select(b.dataset.kind, +b.dataset.i); document.getElementById("sec-lab").scrollIntoView({ behavior: "smooth" }); } }));

    if (om) SX.measureUI(A, p, A.$("#sh-measure"));

    // scroll spy on the section nav
    const links = Object.fromEntries(A.$$(".sh-secnav a", root).map((a) => [a.dataset.s, a]));
    if (window.IntersectionObserver) {
      spy = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) { Object.values(links).forEach((a) => a.classList.remove("on")); links[e.target.id] && links[e.target.id].classList.add("on"); } }); }, { rootMargin: "-120px 0px -65% 0px" });
      A.$$(".sh-sec2", root).forEach((s) => spy.observe(s));
    }
    A.$$(".sh-secnav a", root).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const t = document.getElementById(a.dataset.s); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }));
    if (ctx.anchor) setTimeout(() => { const t = document.getElementById(ctx.anchor); if (t) t.scrollIntoView(); }, 40);
  };

  /* ------------------------------------------------------------ complexity: the doubling experiment
     The tracer counts basic steps; we run it on worst-case inputs of growing size and compare with the formula. */
  SX.measureUI = function (A, p, host) {
    const om = p.complexity.measure;
    if (!p.gen) { host.innerHTML = ""; return; }
    const sizes = om.sizes || [4, 8, 16, 32, 64, 128, 256];
    const rows = [];
    for (const n of sizes) {
      let ops;
      try { ops = SX.trace(p, p.gen(n), { countOnly: true }).ops; } catch (e) { console.error(e); continue; }
      rows.push({ n, ops, f: om.f(n) });
    }
    if (rows.length < 3) { host.innerHTML = ""; return; }
    const last = rows[rows.length - 1], c = last.ops / last.f;
    const ratios = rows.map((r, i) => (i ? r.ops / rows[i - 1].ops : null));
    const avg = ratios.slice(1).reduce((s, x) => s + x, 0) / Math.max(1, ratios.length - 1);
    const per = rows.map((r) => r.ops / r.f);
    const spread = Math.max(...per.slice(Math.floor(per.length / 2))) / Math.min(...per.slice(Math.floor(per.length / 2)));
    const kind = om.growth || "";
    const szs = rows.map((r) => r.n), same = (a) => a.every((x) => Math.abs(x - a[0]) < 1e-9);
    const rq = szs.slice(1).map((x, i) => x / szs[i]), dq = szs.slice(1).map((x, i) => x - szs[i]);
    const stepLab = same(rq) ? `T(${Math.round(rq[0] * 100) / 100}n) ÷ T(n)` : same(dq) ? `T(n+${dq[0]}) ÷ T(n)` : "T(next) ÷ T(previous)";
    // chart
    const W = 520, H = 220, pl = 46, pr = 14, pt = 14, pb = 34;
    const xmax = last.n, ymax = Math.max(last.ops, last.f * c) * 1.08;
    const X = (n) => pl + (n / xmax) * (W - pl - pr), Y = (v) => H - pb - (v / ymax) * (H - pt - pb);
    const curve = []; for (let i = 0; i <= 60; i++) { const n = (xmax * i) / 60 || 0.01; curve.push(`${X(n).toFixed(1)},${Y(om.f(Math.max(n, 1)) * c).toFixed(1)}`); }
    const pts = rows.map((r) => `${X(r.n).toFixed(1)},${Y(r.ops).toFixed(1)}`);
    host.innerHTML = `<div class="measure sh-measure-live"><div class="m-table-wrap"><table class="cmp-table m-table"><thead><tr><th>${A.esc(om.label || "n")}</th><th>steps counted<br><span>T(n)</span></th><th>formula<br><span>${A.tex(om.fTex, false)}</span></th><th>T(n) ÷ formula</th><th>${A.esc(stepLab)}</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td>${r.n}</td><td>${r.ops}</td><td>${Math.round(r.f * 100) / 100}</td><td>${(r.ops / r.f).toFixed(2)}</td><td>${ratios[i] ? ratios[i].toFixed(2) : "—"}</td></tr>`).join("")}</tbody></table></div>
      <div class="m-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Measured steps against the formula">
        <line x1="${pl}" y1="${H - pb}" x2="${W - pr}" y2="${H - pb}" stroke="var(--border-2)"/><line x1="${pl}" y1="${pt}" x2="${pl}" y2="${H - pb}" stroke="var(--border-2)"/>
        <polyline points="${curve.join(" ")}" fill="none" stroke="var(--accent-2)" stroke-width="2" stroke-dasharray="6 5"/>
        <polyline points="${pts.join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
        ${rows.map((r) => `<circle cx="${X(r.n).toFixed(1)}" cy="${Y(r.ops).toFixed(1)}" r="4" fill="var(--accent)"/>`).join("")}
        <text x="${W - pr}" y="${H - 8}" text-anchor="end" font-size="11" fill="var(--muted)">${A.esc(om.label || "n")}</text><text x="${pl + 4}" y="${pt + 10}" font-size="11" fill="var(--muted)">steps</text>
        <g font-size="11"><circle cx="${pl + 150}" cy="${pt + 8}" r="4" fill="var(--accent)"/><text x="${pl + 160}" y="${pt + 12}" fill="var(--text-2)">measured by the tracer</text><line x1="${pl + 310}" y1="${pt + 8}" x2="${pl + 336}" y2="${pt + 8}" stroke="var(--accent-2)" stroke-width="2" stroke-dasharray="5 4"/><text x="${pl + 342}" y="${pt + 12}" fill="var(--text-2)">c · formula</text></g></svg></div></div>
      <p class="muted-p"><b>Reading it.</b> The tracer counted the basic steps the algorithm really performs on a worst-case input of each size. Dividing by the formula ${A.tex(om.fTex, false)} gives a nearly constant number (${per[per.length - 1].toFixed(2)} for the largest size, varying by at most ×${spread.toFixed(2)} over the bigger sizes): that constant is the “c” hidden inside the big-O. ${om.reading ? A.mdInline(om.reading) : `Doubling the input multiplied the work by about <b>${avg.toFixed(2)}</b>${kind ? ", which is what " + A.esc(kind) + " growth looks like" : ""}.`}</p>`;
  };
})();
