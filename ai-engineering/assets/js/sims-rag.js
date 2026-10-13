/* ==========================================================================
   GenLab simulators, part 3: retrieval and RAG.
   chunking · ann · hybrid · retrievalmetrics
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp, UI } = window.VIZ.SIM;
  const { ctrl, pct, mulberry32, PALETTE } = window.VIZ.SIM.gl;

  /* ================================================================ chunking */
  const DOC = `# Washing machine X200: user guide

## Programs
The X200 has 12 programs. The Quick Wash program takes 30 minutes and is meant for lightly soiled clothes. The Eco program saves 40% energy but takes 3 hours. Use Eco for everyday loads, and Quick Wash when you are short on time.

## Maintenance
To descale the machine, run the Clean program once a month with an empty drum. Wipe the door seal after each wash to prevent mould. Clean the filter behind the front-left panel every three months.

## Errors
Error E21 means the drain is blocked. Switch the machine off, open the filter behind the front-left panel, remove any lint or coins, and close it firmly. Error E35 means the door is not closed properly. Open it, check that nothing is trapped in the seal, and close it again until it clicks.

## Warranty
The warranty lasts 2 years and covers the motor for 10 years. Damage from misuse, limescale or unauthorised repairs is not covered. Keep your receipt as proof of purchase.`;
  const QUESTIONS = {
    e21: { q: "What does error E21 mean and how do I fix it?", needle: "Error E21 means the drain is blocked. Switch the machine off, open the filter behind the front-left panel, remove any lint or coins, and close it firmly." },
    warranty: { q: "How long is the motor warranty?", needle: "The warranty lasts 2 years and covers the motor for 10 years." },
    eco: { q: "How long does the Eco program take?", needle: "The Eco program saves 40% energy but takes 3 hours." },
  };

  function splitFixed(text, size, overlap) {
    const out = [], step = Math.max(1, size - overlap);
    for (let i = 0; i < text.length; i += step) { out.push([i, Math.min(text.length, i + size)]); if (i + size >= text.length) break; }
    return out;
  }
  function sentences(text) {            // [start,end] spans of sentences (and heading lines)
    const spans = [], re = /[^.!?\n]+[.!?]*\s*|\n+/g; let m;
    while ((m = re.exec(text))) if (m[0].trim()) spans.push([m.index, m.index + m[0].length]);
    return spans;
  }
  function splitSentences(text, size, overlapChars) {
    const sp = sentences(text), out = []; let cur = [];
    const flush = () => { if (cur.length) out.push([cur[0][0], cur[cur.length - 1][1]]); };
    for (const s of sp) {
      const len = (cur.length ? s[1] - cur[0][0] : s[1] - s[0]);
      if (cur.length && len > size) {
        flush();
        let keep = []; let tot = 0;                      // overlap: carry over trailing sentences up to overlapChars
        for (let i = cur.length - 1; i >= 0 && tot < overlapChars; i--) { keep.unshift(cur[i]); tot += cur[i][1] - cur[i][0]; }
        cur = overlapChars ? keep : [];
      }
      cur.push(s);
    }
    flush(); return out;
  }
  function splitStructure(text, size) {          // split at markdown headings, then pack sentences inside a section
    const idx = [...text.matchAll(/^#{1,3} .*$/gm)].map((m) => m.index), out = [];
    idx.push(text.length);
    for (let i = 0; i < idx.length - 1; i++) {
      const a = idx[i], b = idx[i + 1], sec = text.slice(a, b);
      if (b - a <= size) out.push([a, b]);
      else splitSentences(sec, size, 0).forEach(([x, y]) => out.push([a + x, a + y]));
    }
    return out;
  }
  const STRATS = { fixed: "Fixed size (characters)", sentence: "Pack whole sentences", structure: "Structure-aware (headings first)" };

  sim("chunking", "Chunking lab", "list", (body) => {
    const st = { s: "fixed", size: 300, overlap: 0, q: "e21" };
    const c = ctrl(`<label>Strategy <select data-k="s">${Object.entries(STRATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
      <label>Chunk size <input type="range" min="120" max="900" step="20" value="${st.size}" data-k="size"><output>${st.size}</output></label>
      <label>Overlap <input type="range" min="0" max="50" step="5" value="0" data-k="overlap"><output>0%</output></label>
      <label>Question <select data-k="q">${Object.entries(QUESTIONS).map(([k, v]) => `<option value="${k}">${esc(v.q)}</option>`).join("")}</select></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage gl-chunk"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Each coloured band is one chunk; striped text is overlap shared by two chunks. The answer sentence for the selected question is underlined. If no single chunk contains the whole answer, retrieval can never give the model the complete fact.</div>`));
    const draw = () => {
      const ov = Math.round((st.size * st.overlap) / 100);
      const chunks = st.s === "fixed" ? splitFixed(DOC, st.size, ov) : st.s === "sentence" ? splitSentences(DOC, st.size, ov) : splitStructure(DOC, st.size);
      const Q = QUESTIONS[st.q], n0 = DOC.indexOf(Q.needle), n1 = n0 + Q.needle.length;
      // paint characters: for every char, which chunks cover it
      const cover = new Array(DOC.length).fill(0).map(() => []);
      chunks.forEach(([a, b], i) => { for (let k = a; k < b; k++) cover[k].push(i); });
      let html = "", i = 0;
      while (i < DOC.length) {
        let j = i; const key = cover[i].join(",") + "|" + (i >= n0 && i < n1 ? 1 : 0);
        while (j < DOC.length && cover[j].join(",") + "|" + (j >= n0 && j < n1 ? 1 : 0) === key) j++;
        const owners = cover[i], underline = i >= n0 && i < n1;
        const col = owners.length ? PALETTE[owners[owners.length - 1] % PALETTE.length] : "transparent";
        html += `<span class="gl-ck ${owners.length > 1 ? "ov" : ""} ${underline ? "ans" : ""}" style="--c:${col}">${esc(DOC.slice(i, j))}</span>`;
        i = j;
      }
      const whole = chunks.filter(([a, b]) => a <= n0 && b >= n1).length;
      const mid = chunks.filter(([a, b]) => b < DOC.length && !/[.!?\n]\s*$/.test(DOC.slice(Math.max(a, b - 2), b))).length;
      const sizes = chunks.map(([a, b]) => b - a);
      stage.innerHTML = `<pre class="gl-doc">${html}</pre>`;
      stats.innerHTML = `<div class="sd-stat"><span>chunks</span><b>${chunks.length}</b></div><div class="sd-stat"><span>avg / min / max chars</span><b>${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)} / ${Math.min(...sizes)} / ${Math.max(...sizes)}</b></div>
        <div class="sd-stat ${mid > chunks.length / 2 ? "warn" : ""}"><span>chunks ending mid-sentence</span><b>${mid}</b></div>
        <div class="sd-stat ${whole ? "ok" : "bad"}"><span>chunks holding the whole answer</span><b>${whole}${whole ? "" : "  (split!)"}</b></div>`;
    };
    $$("[data-k]", c).forEach((inp) => (inp.oninput = inp.onchange = () => {
      st[inp.dataset.k] = inp.type === "range" ? +inp.value : inp.value;
      if (inp.dataset.k === "size") inp.nextElementSibling.textContent = st.size;
      if (inp.dataset.k === "overlap") inp.nextElementSibling.textContent = st.overlap + "%";
      draw();
    }));
    draw();
  });

  /* ================================================================ approximate nearest neighbour (IVF) */
  function dist2(a, b) { const dx = a[0] - b[0], dy = a[1] - b[1]; return dx * dx + dy * dy; }
  function kmeans(pts, k, seed) {
    const rnd = mulberry32(seed);
    let cents = [pts[Math.floor(rnd() * pts.length)].slice()];
    while (cents.length < k) {                       // k-means++ seeding
      const d = pts.map((p) => Math.min(...cents.map((c) => dist2(p, c)))), tot = d.reduce((a, b) => a + b, 0);
      let r = rnd() * tot, i = 0; while (r > d[i] && i < d.length - 1) { r -= d[i]; i++; }
      cents.push(pts[i].slice());
    }
    let assign = new Array(pts.length).fill(0);
    for (let it = 0; it < 12; it++) {
      assign = pts.map((p) => { let b = 0, bd = Infinity; cents.forEach((c, i) => { const d = dist2(p, c); if (d < bd) { bd = d; b = i; } }); return b; });
      cents = cents.map((c, i) => { const m = pts.filter((_, j) => assign[j] === i); return m.length ? [m.reduce((s, p) => s + p[0], 0) / m.length, m.reduce((s, p) => s + p[1], 0) / m.length] : c; });
    }
    return { cents, assign };
  }

  sim("ann", "Vector search: exact vs IVF", "search", (body, cfg) => {
    const rnd = mulberry32(5), N = 400, W = 640, H = 340;
    const centers = Array.from({ length: 7 }, () => [60 + rnd() * (W - 120), 50 + rnd() * (H - 100)]);
    const pts = Array.from({ length: N }, () => { const c = centers[Math.floor(rnd() * centers.length)]; return [clamp(c[0] + (rnd() + rnd() + rnd() - 1.5) * 90, 8, W - 8), clamp(c[1] + (rnd() + rnd() + rnd() - 1.5) * 70, 8, H - 8)]; });
    const st = { nlist: 8, nprobe: 1, k: 5, q: [W * 0.45, H * 0.5] };
    let km = kmeans(pts, st.nlist, 3);
    const c = ctrl(`<label>Cells (nlist) <select data-k="nlist"><option>4</option><option selected>8</option><option>16</option><option>32</option></select></label>
      <label>Cells searched (nprobe) <input type="range" min="1" max="8" value="1" data-k="nprobe"><output>1</output></label>
      <label>Top-k <input type="range" min="1" max="15" value="5" data-k="k"><output>5</output></label><button class="sd-btn" data-a="rand">Random query</button>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage gl-ann"><svg viewBox="0 0 ${W} ${H}" class="gl-ann-svg"></svg></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Click the map to move the query (✚). Exact search compares the query with all ${N} vectors. IVF first finds the nearest cell centres, then scans only the points in the <b>nprobe</b> closest cells. Ringed points are the true top-k; filled green = found by IVF; red ✕ = missed.</div>`));
    const svg = $("svg", stage);
    const draw = () => {
      const exact = pts.map((p, i) => [dist2(p, st.q), i]).sort((a, b) => a[0] - b[0]).slice(0, st.k).map((x) => x[1]);
      const order = km.cents.map((cc, i) => [dist2(cc, st.q), i]).sort((a, b) => a[0] - b[0]).slice(0, st.nprobe).map((x) => x[1]);
      const probed = new Set(order);
      const cand = pts.map((p, i) => i).filter((i) => probed.has(km.assign[i]));
      const found = cand.map((i) => [dist2(pts[i], st.q), i]).sort((a, b) => a[0] - b[0]).slice(0, st.k).map((x) => x[1]);
      const fset = new Set(found), eset = new Set(exact);
      const hit = exact.filter((i) => fset.has(i)).length;
      svg.innerHTML = pts.map((p, i) => {
        const col = PALETTE[km.assign[i] % PALETTE.length], inProbe = probed.has(km.assign[i]);
        const isE = eset.has(i), isF = fset.has(i);
        return `<circle cx="${p[0]}" cy="${p[1]}" r="${isE || isF ? 5.5 : 3}" fill="${isF ? "#10b981" : col}" opacity="${inProbe ? 0.95 : 0.22}" ${isE ? `stroke="${isF ? "#10b981" : "#ef4444"}" stroke-width="2.2"` : ""}/>${isE && !isF ? `<path d="M${p[0] - 4},${p[1] - 4}l8,8m0,-8l-8,8" stroke="#ef4444" stroke-width="2"/>` : ""}`;
      }).join("") + km.cents.map((cc, i) => `<rect x="${cc[0] - 5}" y="${cc[1] - 5}" width="10" height="10" rx="2" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="2" ${probed.has(i) ? "" : 'opacity=".4"'}/>`).join("")
        + `<g transform="translate(${st.q[0]},${st.q[1]})"><circle r="9" fill="none" stroke="var(--text)" stroke-width="2"/><path d="M-13,0h26M0,-13v26" stroke="var(--text)" stroke-width="2"/></g>`;
      const scanned = cand.length + km.cents.length;
      stats.innerHTML = `<div class="sd-stat ${hit === st.k ? "ok" : hit / st.k >= 0.6 ? "warn" : "bad"}"><span>recall@${st.k}</span><b>${pct(hit / st.k, 0)}</b></div><div class="sd-stat"><span>distance computations</span><b>${scanned} <small style="font-weight:500;color:var(--muted)">vs ${N} exact</small></b></div>
        <div class="sd-stat"><span>work vs exact search</span><b>${pct(scanned / N, 0)}</b></div><div class="sd-stat"><span>cells scanned</span><b>${st.nprobe} / ${st.nlist}</b></div>`;
    };
    svg.addEventListener("pointerdown", (e) => { const r = svg.getBoundingClientRect(); st.q = [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; draw(); });
    $('[data-k="nlist"]', c).onchange = (e) => { st.nlist = +e.target.value; km = kmeans(pts, st.nlist, 3); const np = $('[data-k="nprobe"]', c); np.max = st.nlist; if (+np.value > st.nlist) np.value = st.nlist; st.nprobe = +np.value; np.nextElementSibling.textContent = np.value; draw(); };
    $('[data-k="nprobe"]', c).oninput = (e) => { st.nprobe = +e.target.value; e.target.nextElementSibling.textContent = st.nprobe; draw(); };
    $('[data-k="k"]', c).oninput = (e) => { st.k = +e.target.value; e.target.nextElementSibling.textContent = st.k; draw(); };
    let seed = 20; $('[data-a="rand"]', c).onclick = () => { const r = mulberry32(seed++); st.q = [30 + r() * (W - 60), 30 + r() * (H - 60)]; draw(); };
    draw();
  });

  /* ================================================================ hybrid search: BM25 + dense + RRF */
  const HDOCS = [
    "Error E21 means the drain is blocked. Clean the filter behind the front-left panel.",
    "Error E35 means the door is not closed properly. Close the door until it clicks.",
    "Our refund policy: you can return the machine within 30 days for a full refund.",
    "Money-back guarantee applies to unused products returned in original packaging.",
    "The Eco program saves 40% energy but takes 3 hours to complete.",
    "To descale the machine run the Clean program monthly with an empty drum.",
    "The warranty lasts 2 years and covers the motor for 10 years.",
    "Shipping takes three to five business days within the country.",
  ];
  const HQUERIES = {
    code: "error E21",
    para: "can I get my money back",
    both: "how do I remove limescale",
    mix: "drain filter blocked error",
  };
  const CONCEPTS = [["refund", "money", "back", "return", "guarantee", "reimburse"], ["descale", "limescale", "scale", "clean", "calcium"], ["blocked", "clogged", "drain", "filter", "stuck"], ["energy", "power", "eco", "electricity"], ["warranty", "guarantee", "coverage", "covered"], ["shipping", "delivery", "arrive", "deliver"], ["error", "fault", "code"], ["door", "closed", "latch"]];
  const toks = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []);
  function bm25Scores(query, docs) {
    const D = docs.map(toks), avg = D.reduce((s, d) => s + d.length, 0) / D.length, k1 = 1.5, b = 0.75;
    const df = {}; D.forEach((d) => new Set(d).forEach((t) => (df[t] = (df[t] || 0) + 1)));
    return D.map((d) => toks(query).reduce((s, t) => { const f = d.filter((x) => x === t).length; if (!f) return s; const idf = Math.log(1 + (D.length - df[t] + 0.5) / (df[t] + 0.5)); return s + (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg)); }, 0));
  }
  function conceptVec(text) { const v = new Array(CONCEPTS.length).fill(0), t = toks(text); CONCEPTS.forEach((c, i) => c.forEach((w) => { if (t.includes(w)) v[i] += 1; })); return v; }
  function denseScores(query, docs) {          // a stand-in for a semantic model: synonyms map to shared "concepts"
    const q = conceptVec(query), qn = Math.hypot(...q) || 1;
    return docs.map((d) => { const v = conceptVec(d), n = Math.hypot(...v) || 1; return q.reduce((s, x, i) => s + x * v[i], 0) / (qn * n); });
  }
  const ranks = (scores) => { const o = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]), r = new Array(scores.length); o.forEach(([, i], pos) => (r[i] = pos + 1)); return r; };

  sim("hybrid", "Hybrid search", "search", (body) => {
    const st = { q: "code", mode: "rrf", alpha: 0.5, k: 60 };
    const c = ctrl(`<label>Query <select data-k="q">${Object.entries(HQUERIES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      <div class="sd-seg"><button class="on" data-m="rrf">Reciprocal rank fusion</button><button data-m="weighted">Weighted scores</button></div>
      <label data-wrap="alpha" hidden style="display:none">Dense weight <input type="range" min="0" max="1" step="0.05" value="0.5" data-k="alpha"><output>0.50</output></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage gl-hyb"></div>`);
    body.appendChild(stage);
    body.appendChild(el(`<div class="sd-note-line">Keyword search (BM25) nails exact codes like “E21” but misses paraphrases; the stand-in “dense” search understands that “money back” means “refund” but is vague on exact tokens. Fusion usually beats both. RRF score = Σ 1/(k + rank).</div>`));
    const draw = () => {
      const query = HQUERIES[st.q], bm = bm25Scores(query, HDOCS), de = denseScores(query, HDOCS);
      const rb = ranks(bm), rd = ranks(de);
      const norm = (a) => { const m = Math.max(...a, 1e-9); return a.map((x) => x / m); };
      const nb = norm(bm), nd = norm(de);
      const fused = HDOCS.map((_, i) => (st.mode === "rrf" ? 1 / (st.k + rb[i]) + 1 / (st.k + rd[i]) : (1 - st.alpha) * nb[i] + st.alpha * nd[i]));
      const col = (title, sc, extra) => { const o = sc.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]); return `<div class="gl-hcol"><div class="gl-label"><b>${title}</b></div>${o.map(([s, i], pos) => `<div class="gl-hdoc ${pos < 3 ? "top" : ""}"><span class="r">${pos + 1}</span><span class="t">${esc(HDOCS[i])}</span><small>${extra(s, i)}</small></div>`).join("")}</div>`; };
      stage.innerHTML = `<div class="gl-label">Query: <b>“${esc(query)}”</b></div><div class="gl-hgrid">${col("BM25 (keywords)", bm, (s) => s.toFixed(2))}${col("Dense (meaning)", de, (s) => s.toFixed(2))}${col(st.mode === "rrf" ? "Fused (RRF)" : "Fused (weighted)", fused, (s) => s.toFixed(3))}</div>`;
    };
    $('[data-k="q"]', c).onchange = (e) => { st.q = e.target.value; draw(); };
    $('[data-k="alpha"]', c).oninput = (e) => { st.alpha = +e.target.value; e.target.nextElementSibling.textContent = st.alpha.toFixed(2); draw(); };
    $$(".sd-seg button", c).forEach((b) => (b.onclick = () => { st.mode = b.dataset.m; $$(".sd-seg button", c).forEach((x) => x.classList.toggle("on", x === b)); const w = $('[data-wrap="alpha"]', c); w.hidden = st.mode !== "weighted"; w.style.display = st.mode === "weighted" ? "inline-flex" : "none"; draw(); }));
    draw();
  });

  /* ================================================================ retrieval metrics */
  sim("retrievalmetrics", "Retrieval metrics", "chart", (body, cfg) => {
    const N = 12;
    const st = { k: 5, rel: new Set([1, 4, 7]), sys: "A" };
    const SYS = { A: [1, 0, 4, 2, 3, 7, 5, 6, 8, 9, 10, 11], B: [3, 0, 2, 1, 8, 4, 9, 7, 5, 6, 10, 11] };   // document ids in ranked order
    const c = ctrl(`<label>System <select data-k="sys"><option value="A">System A</option><option value="B">System B</option></select></label>
      <label>k <input type="range" min="1" max="12" value="5" data-k="k"><output>5</output></label><span style="font-size:13px;color:var(--muted)">Click a result to toggle whether it is truly relevant.</span>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    const draw = () => {
      const list = SYS[st.sys], R = st.rel.size, top = list.slice(0, st.k), hits = top.filter((d) => st.rel.has(d)).length;
      const prec = hits / st.k, rec = R ? hits / R : 0;
      const firstRel = list.findIndex((d) => st.rel.has(d)), rr = firstRel >= 0 ? 1 / (firstRel + 1) : 0;
      const dcg = top.reduce((s, d, i) => s + (st.rel.has(d) ? 1 / Math.log2(i + 2) : 0), 0);
      const idcg = Array.from({ length: Math.min(R, st.k) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
      let ap = 0, seen = 0; list.slice(0, st.k).forEach((d, i) => { if (st.rel.has(d)) { seen++; ap += seen / (i + 1); } }); ap = R ? ap / Math.min(R, st.k) : 0;
      stage.innerHTML = `<div class="gl-rank">${list.map((d, i) => `<button class="gl-rk ${st.rel.has(d) ? "rel" : ""} ${i < st.k ? "in" : "out"}" data-d="${d}"><small>#${i + 1}</small><b>doc ${d}</b><span>${st.rel.has(d) ? "relevant" : "not relevant"}</span></button>`).join("")}</div>
        <div class="gl-label" style="margin-top:8px">The first ${st.k} results (solid) are what the model would receive. ${R} document${R === 1 ? " is" : "s are"} truly relevant.</div>`;
      stats.innerHTML = `<div class="sd-stat"><span>precision@${st.k}</span><b>${pct(prec, 0)}</b></div><div class="sd-stat"><span>recall@${st.k}</span><b>${pct(rec, 0)}</b></div><div class="sd-stat"><span>MRR</span><b>${rr.toFixed(2)}</b></div>
        <div class="sd-stat"><span>nDCG@${st.k}</span><b>${idcg ? (dcg / idcg).toFixed(2) : "–"}</b></div><div class="sd-stat"><span>average precision</span><b>${ap.toFixed(2)}</b></div>`;
    };
    stage.addEventListener("pointerdown", (e) => { const b = e.target.closest(".gl-rk"); if (!b) return; const d = +b.dataset.d; st.rel.has(d) ? st.rel.delete(d) : st.rel.add(d); draw(); });
    $('[data-k="sys"]', c).onchange = (e) => { st.sys = e.target.value; draw(); };
    $('[data-k="k"]', c).oninput = (e) => { st.k = +e.target.value; e.target.nextElementSibling.textContent = st.k; draw(); };
    draw();
  });
})();
