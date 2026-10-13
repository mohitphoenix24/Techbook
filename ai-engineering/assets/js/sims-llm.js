/* ==========================================================================
   GenLab simulators, part 1: how LLMs work.
   tokenizer · embedding · attention · sampling · scaling
   Each registers with sim(name, kicker, icon, build(body, cfg, meta)).
   cfg holds "key = value" lines from the ```viz block.
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp, UI } = window.VIZ.SIM;

  /* ---------------------------------------------------------------- shared helpers */
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const softmax = (z) => { const m = Math.max(...z); const e = z.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); };
  const ctrl = (html) => el(`<div class="sd-ctrls">${html}</div>`);
  const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";
  const fmtGB = (g) => (g >= 1000 ? (g / 1000).toFixed(1) + " TB" : g >= 10 ? Math.round(g) + " GB" : g.toFixed(1) + " GB");
  const human = (n) => {
    const a = Math.abs(n);
    if (a >= 1e12) return +(n / 1e12).toPrecision(3) + " T";
    if (a >= 1e9) return +(n / 1e9).toPrecision(3) + " B";
    if (a >= 1e6) return +(n / 1e6).toPrecision(3) + " M";
    if (a >= 1e3) return +(n / 1e3).toPrecision(3) + " K";
    return String(Math.round(n * 100) / 100);
  };
  const PALETTE = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#84cc16"];
  window.VIZ.SIM.gl = { mulberry32, softmax, ctrl, pct, human, fmtGB, PALETTE };

  /* ================================================================ BPE tokenizer */
  function trainBpe(text, nMerges) {
    let words = new Map();
    text.split(/\s+/).filter(Boolean).forEach((w) => { const k = [...w, "</w>"].join("\u0001"); words.set(k, (words.get(k) || 0) + 1); });
    const merges = [];
    for (let m = 0; m < nMerges; m++) {
      const pairs = new Map();
      words.forEach((f, k) => { const s = k.split("\u0001"); for (let i = 0; i < s.length - 1; i++) { const p = s[i] + "\u0002" + s[i + 1]; pairs.set(p, (pairs.get(p) || 0) + f); } });
      if (!pairs.size) break;
      let best = null, bf = -1;
      pairs.forEach((f, p) => { if (f > bf || (f === bf && p > best)) { best = p; bf = f; } });      // same tie-break as the Python lesson
      const [a, b] = best.split("\u0002");
      merges.push({ a, b, freq: bf });
      const nw = new Map();
      words.forEach((f, k) => {
        const s = k.split("\u0001"), out = [];
        for (let i = 0; i < s.length; i++) { if (i < s.length - 1 && s[i] === a && s[i + 1] === b) { out.push(a + b); i++; } else out.push(s[i]); }
        nw.set(out.join("\u0001"), f);
      });
      words = nw;
    }
    return merges;
  }
  function encodeWord(word, merges) {
    let s = [...word, "</w>"];
    for (const { a, b } of merges) {
      const out = [];
      for (let i = 0; i < s.length; i++) { if (i < s.length - 1 && s[i] === a && s[i + 1] === b) { out.push(a + b); i++; } else out.push(s[i]); }
      s = out;
    }
    return s;
  }

  sim("tokenizer", "Tokenizer", "list", (body, cfg) => {
    const st = { merges: +cfg.merges || 10 };
    const corpus = cfg.text || "low low low low low lower lower newest newest newest newest newest newest widest widest widest";
    const c = ctrl(`<label>Merges learned <input type="range" min="0" max="30" value="${st.merges}" data-k="merges"><output>${st.merges}</output></label>
      <label style="flex:1 1 260px">Text to tokenize <input type="text" data-k="input" value="lowest newer widest slowest xyz" style="flex:1"></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage gl-tok"></div>`);
    body.appendChild(stage);
    body.appendChild(el(`<div class="sd-note-line">Training text (the tokenizer learns its vocabulary from this): <code>${esc(corpus)}</code></div>`));
    const draw = () => {
      const merges = trainBpe(corpus, st.merges);
      const input = $('[data-k="input"]', c).value;
      const color = new Map();
      const tokens = [];
      input.split(/\s+/).filter(Boolean).forEach((w, wi) => { encodeWord(w, merges).forEach((t) => tokens.push({ t, w: wi })); });
      const chips = tokens.map((k) => {
        if (!color.has(k.t)) color.set(k.t, PALETTE[color.size % PALETTE.length]);
        const col = color.get(k.t);
        return `<span class="gl-chip" style="--c:${col}">${esc(k.t.replace("</w>", "·"))}</span>`;
      }).join("");
      const chars = input.replace(/\s+/g, " ").trim().length;
      stage.innerHTML = `<div class="gl-label">Tokens (<code>·</code> marks the end of a word)</div><div class="gl-chips">${chips || "<i>type something</i>"}</div>
        <div class="sd-stats" style="padding:12px 0 6px"><div class="sd-stat"><span>tokens</span><b>${tokens.length}</b></div><div class="sd-stat"><span>characters</span><b>${chars}</b></div>
        <div class="sd-stat"><span>chars per token</span><b>${tokens.length ? (chars / tokens.length).toFixed(2) : "–"}</b></div><div class="sd-stat"><span>vocabulary size</span><b>${new Set(corpus.replace(/\s+/g, "").split("")).size + 1 + merges.length}</b></div></div>
        <div class="gl-label" style="margin-top:8px">Merges, in the order learned</div>
        <div class="gl-merges">${merges.length ? merges.map((m, i) => `<span class="gl-merge"><b>${i + 1}</b> ${esc(m.a.replace("</w>", "·"))} + ${esc(m.b.replace("</w>", "·"))} <small>×${m.freq}</small></span>`).join("") : "<i>no merges yet: every character is its own token</i>"}</div>`;
    };
    $('[data-k="merges"]', c).oninput = (e) => { st.merges = +e.target.value; e.target.nextElementSibling.textContent = st.merges; draw(); };
    $('[data-k="input"]', c).oninput = draw;
    draw();
  });

  /* ================================================================ embeddings */
  const WORDS = {
    //            animal food royal vehicle tech male young
    cat:      [0.9, 0, 0, 0, 0, 0, 0.3], kitten:  [0.9, 0, 0, 0, 0, 0, 0.9], dog: [0.9, 0, 0, 0, 0, 0.2, 0.3], puppy: [0.9, 0, 0, 0, 0, 0.2, 0.9], lion: [0.8, 0, 0.2, 0, 0, 0.5, 0],
    pizza:    [0, 0.9, 0, 0, 0.1, 0, 0], pasta:   [0, 0.85, 0, 0, 0, 0, 0.1], apple: [0, 0.8, 0, 0, 0.3, 0, 0], banana: [0, 0.9, 0, 0, 0, 0, 0.1],
    king:     [0, 0, 0.9, 0, 0, 0.9, 0], queen:   [0, 0, 0.9, 0, 0, -0.9, 0], prince: [0, 0, 0.7, 0, 0, 0.9, 0.7], princess: [0, 0, 0.7, 0, 0, -0.9, 0.7],
    man:      [0, 0, 0.05, 0, 0, 0.9, 0], woman:  [0, 0, 0.05, 0, 0, -0.9, 0], boy: [0, 0, 0, 0, 0, 0.9, 0.8], girl: [0, 0, 0, 0, 0, -0.9, 0.8],
    car:      [0, 0, 0, 0.9, 0.2, 0, 0], truck:   [0, 0, 0, 0.9, 0.1, 0.1, 0], bike: [0, 0, 0, 0.8, 0, 0, 0.2], bus: [0, 0, 0, 0.85, 0.1, 0, 0],
    laptop:   [0, 0, 0, 0, 0.9, 0, 0], phone:   [0, 0, 0, 0.1, 0.9, 0, 0], code: [0, 0, 0, 0, 0.8, 0, 0],
  };
  const DIMS = ["animal", "food", "royal", "vehicle", "tech", "male", "young"];
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const norm = (a) => Math.sqrt(dot(a, a));
  const cosine = (a, b) => { const d = norm(a) * norm(b); return d ? dot(a, b) / d : 0; };

  // A fixed, readable 2-D projection: the five topics sit on a circle; "male" nudges right, "young" nudges up.
  function project2(names) {
    return names.map((n) => {
      const v = WORDS[n]; let x = 0, y = 0;
      for (let i = 0; i < 5; i++) { const th = (i / 5) * 2 * Math.PI - Math.PI / 2; x += v[i] * Math.cos(th); y += v[i] * Math.sin(th); }
      return [x + 0.28 * v[5], y + 0.28 * v[6]];
    });
  }

  sim("embedding", "Embedding space", "embed", (body) => {
    const names = Object.keys(WORDS);
    const xy = project2(names);
    const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const W = 640, H = 340, P = 34;
    const px = (v) => P + ((v - minX) / (maxX - minX || 1)) * (W - 2 * P), py = (v) => H - P - ((v - minY) / (maxY - minY || 1)) * (H - 2 * P);
    const group = (n) => { const v = WORDS[n]; return v.slice(0, 5).indexOf(Math.max(...v.slice(0, 5))); };
    const gcol = ["#06b6d4", "#f59e0b", "#a855f7", "#10b981", "#ef4444"];
    let sel = "king";
    const opts = names.map((n) => `<option>${n}</option>`).join("");
    const c = ctrl(`<div class="sd-seg"><button class="on" data-m="near">Nearest neighbours</button><button data-m="ana">Analogy: a − b + c</button></div>
      <span data-pane="near" style="font-size:13px;color:var(--muted)">Click any word in the map.</span>
      <span data-pane="ana" hidden style="display:none;gap:8px;align-items:center"><select data-k="a">${opts}</select> − <select data-k="b">${opts}</select> + <select data-k="c">${opts}</select></span>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage gl-emb"><svg viewBox="0 0 ${W} ${H}" class="gl-emb-svg"></svg><div class="gl-emb-side"></div></div>`);
    body.appendChild(stage);
    body.appendChild(el(`<div class="sd-note-line">A 7-number toy embedding (dimensions: ${DIMS.join(", ")}) drawn on a 2-D map (the five topics sit on a circle; “male” nudges a word right and “young” nudges it up). Real embeddings have hundreds or thousands of learned dimensions with no human-readable names.</div>`));
    const svg = $("svg", stage), side = $(".gl-emb-side", stage);
    let mode = "near", hl = null;
    $('[data-k="a"]', c).value = "king"; $('[data-k="b"]', c).value = "man"; $('[data-k="c"]', c).value = "woman";
    const nearest = (vec, exclude = []) => names.filter((n) => !exclude.includes(n)).map((n) => [n, cosine(vec, WORDS[n])]).sort((a, b) => b[1] - a[1]);
    const draw = () => {
      let rows, title, target = null;
      if (mode === "near") { rows = nearest(WORDS[sel], [sel]).slice(0, 6); title = `Closest to <b>${sel}</b> by cosine similarity`; hl = [sel, ...rows.slice(0, 3).map((r) => r[0])]; }
      else {
        const a = $('[data-k="a"]', c).value, b = $('[data-k="b"]', c).value, cc = $('[data-k="c"]', c).value;
        target = WORDS[a].map((v, i) => v - WORDS[b][i] + WORDS[cc][i]);
        rows = nearest(target, [a, b, cc]).slice(0, 6); title = `<b>${a} − ${b} + ${cc}</b> lands closest to`; hl = [a, b, cc, rows[0][0]];
      }
      svg.innerHTML = names.map((n, i) => {
        const on = hl.includes(n), x = px(xy[i][0]), y = py(xy[i][1]);
        return `<g class="gl-pt ${on ? "on" : ""}" data-w="${n}" transform="translate(${x},${y})"><circle r="${on ? 7 : 5}" fill="${gcol[group(n)]}" opacity="${on ? 1 : 0.7}"/><text y="-10" text-anchor="middle">${n}</text></g>`;
      }).join("");
      side.innerHTML = `<div class="gl-label">${title}</div>` + rows.map(([n, s]) => `<div class="gl-bar-row"><span>${n}</span><i style="width:${Math.max(2, ((s + 1) / 2) * 100)}%;background:${gcol[group(n)]}"></i><b>${s.toFixed(2)}</b></div>`).join("");
    };
    svg.addEventListener("pointerdown", (e) => { const g = e.target.closest(".gl-pt"); if (g) { sel = g.dataset.w; if (mode === "ana") return; draw(); } });
    $$(".sd-seg button", c).forEach((b) => (b.onclick = () => {
      mode = b.dataset.m; $$(".sd-seg button", c).forEach((x) => x.classList.toggle("on", x === b));
      const n = $('[data-pane="near"]', c), a = $('[data-pane="ana"]', c);
      n.hidden = mode !== "near"; n.style.display = mode === "near" ? "" : "none"; a.hidden = mode !== "ana"; a.style.display = mode === "ana" ? "inline-flex" : "none"; draw();
    }));
    $$("select", c).forEach((s) => (s.onchange = draw));
    draw();
  });

  /* ================================================================ attention */
  const SENT = {
    pronoun: {
      label: "The animal didn't cross the street because it was too tired",
      tokens: ["The", "animal", "didn't", "cross", "the", "street", "because", "it", "was", "too", "tired"],
      heads: {
        "Pronoun resolution": [[7, 1, 6], [7, 5, 1.5], [10, 7, 3], [10, 1, 3.5], [8, 7, 3], [2, 1, 3], [3, 1, 2.5], [1, 0, 2]],
        "Previous token": null,
        "Subject → verb": [[2, 1, 4], [3, 1, 4], [8, 7, 3.5], [10, 8, 3], [6, 3, 2.5], [5, 3, 3], [4, 5, 0]],
        "Attention sink (first token)": "sink",
      },
    },
    trophy: {
      label: "The trophy didn't fit in the suitcase because it was too big",
      tokens: ["The", "trophy", "didn't", "fit", "in", "the", "suitcase", "because", "it", "was", "too", "big"],
      heads: {
        "Pronoun resolution": [[8, 1, 6], [8, 6, 2], [11, 8, 3], [11, 1, 3], [9, 8, 3], [2, 1, 3], [3, 1, 3], [6, 4, 3]],
        "Previous token": null,
        "Subject → verb": [[2, 1, 4], [3, 1, 4], [9, 8, 3.5], [11, 9, 3], [6, 3, 3], [5, 6, 0]],
        "Attention sink (first token)": "sink",
      },
    },
    code: {
      label: "def add ( a , b ) : return a + b",
      tokens: ["def", "add", "(", "a", ",", "b", ")", ":", "return", "a", "+", "b"],
      heads: {
        "Variable binding": [[9, 3, 6], [11, 5, 6], [10, 9, 3], [10, 11, 1], [8, 1, 2], [6, 2, 4], [3, 2, 2], [5, 4, 2], [1, 0, 3]],
        "Previous token": null,
        "Bracket matching": [[6, 2, 6], [7, 6, 3], [4, 3, 3], [5, 4, 3], [3, 2, 3]],
        "Attention sink (first token)": "sink",
      },
    },
  };

  function attnMatrix(sentence, headName, causal) {
    const toks = sentence.tokens, n = toks.length, spec = sentence.heads[headName];
    const A = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(n).fill(0);
      row[i] += 1;
      if (spec === null) { if (i > 0) row[i - 1] += 5; }
      else if (spec === "sink") { row[0] += 4; }
      else spec.forEach(([a, b, w]) => { if (a === i) row[b] += w; });
      for (let j = 0; j < n; j++) if (causal && j > i) row[j] = -Infinity;
      A.push(softmax(row));
    }
    return A;
  }

  sim("attention", "Attention explorer", "ai", (body) => {
    const st = { s: "pronoun", head: 0, causal: false, tok: 7 };
    const c = ctrl(`<label>Sentence <select data-k="s">${Object.entries(SENT).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("")}</select></label>
      <label>Head <select data-k="head"></select></label>
      <label><input type="checkbox" data-k="causal"> causal mask (GPT-style)</label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage gl-att"></div>`);
    body.appendChild(stage);
    body.appendChild(el(`<div class="sd-note-line">Click a token to see where it looks. The weights are hand-crafted to illustrate patterns real heads learn; a trained model's heads are messier. Each row of the matrix sums to 100%.</div>`));
    const fillHeads = () => { const sel = $('[data-k="head"]', c); sel.innerHTML = Object.keys(SENT[st.s].heads).map((h, i) => `<option value="${i}">${h}</option>`).join(""); sel.value = st.head; };
    const draw = () => {
      const S = SENT[st.s], names = Object.keys(S.heads), hname = names[st.head] || names[0];
      const A = attnMatrix(S, hname, st.causal), n = S.tokens.length;
      st.tok = Math.min(st.tok, n - 1);
      const row = A[st.tok];
      const chips = S.tokens.map((t, j) => {
        const w = row[j], isSel = j === st.tok;
        return `<button class="gl-att-tok ${isSel ? "sel" : ""}" data-i="${j}"><span class="gl-att-w" style="height:${Math.round(w * 64)}px;opacity:${0.25 + w * 0.75}"></span><span class="gl-att-t">${esc(t)}</span><small>${w >= 0.005 ? pct(w, 0) : ""}</small></button>`;
      }).join("");
      const heat = A.map((r, i) => `<tr><th class="${i === st.tok ? "sel" : ""}">${esc(S.tokens[i])}</th>${r.map((w) => `<td style="background:color-mix(in srgb,var(--accent-2) ${Math.round(w * 100)}%,transparent)" title="${(w * 100).toFixed(0)}%"></td>`).join("")}</tr>`).join("");
      stage.innerHTML = `<div class="gl-label">Query: <b>${esc(S.tokens[st.tok])}</b> looks at…</div><div class="gl-att-row">${chips}</div>
        <div class="gl-label" style="margin-top:14px">Full attention matrix (rows = who is looking, columns = who is looked at)</div>
        <div class="gl-heat-wrap"><table class="gl-heat"><thead><tr><th></th>${S.tokens.map((t) => `<th class="c"><span>${esc(t)}</span></th>`).join("")}</tr></thead><tbody>${heat}</tbody></table></div>`;
    };
    stage.addEventListener("pointerdown", (e) => { const b = e.target.closest(".gl-att-tok"); if (b) { st.tok = +b.dataset.i; draw(); } });
    $('[data-k="s"]', c).onchange = (e) => { st.s = e.target.value; st.head = 0; st.tok = SENT[st.s].tokens.length > 8 ? (st.s === "code" ? 9 : 7) : 0; fillHeads(); draw(); };
    $('[data-k="head"]', c).onchange = (e) => { st.head = +e.target.value; draw(); };
    $('[data-k="causal"]', c).onchange = (e) => { st.causal = e.target.checked; draw(); };
    fillHeads(); draw();
  });

  /* ================================================================ sampling */
  const SCEN = {
    capital: { prompt: "The capital of France is", tokens: ["Paris", "Lyon", "France", "the", "a", "Berlin", "located", "Marseille", "banana", "Rome"], logits: [8.0, 4.4, 3.6, 3.3, 2.6, 2.4, 2.0, 1.8, -2.0, 1.2] },
    color: { prompt: "My favourite colour is", tokens: ["blue", "green", "red", "purple", "black", "yellow", "orange", "teal", "pink", "beige"], logits: [3.2, 3.0, 2.7, 2.4, 2.0, 1.6, 1.5, 1.3, 1.2, 0.2] },
    story: { prompt: "Once upon a time, there was a", tokens: ["little", "young", "king", "dragon", "princess", "poor", "wizard", "girl", "fox", "toaster"], logits: [3.0, 2.8, 2.7, 2.6, 2.5, 2.3, 2.2, 2.1, 1.9, -1.0] },
  };

  sim("sampling", "Decoding playground", "chart", (body, cfg) => {
    const st = { scen: "capital", T: 1.0, k: 10, p: 1.0, minp: 0 };
    let drawn = null, round = 0;
    const c = ctrl(`<label>Prompt <select data-k="scen">${Object.entries(SCEN).map(([k, v]) => `<option value="${k}">${esc(v.prompt)}</option>`).join("")}</select></label>
      <label>Temperature <input type="range" min="0.05" max="2.5" step="0.05" value="1" data-k="T"><output>1.00</output></label>
      <label>Top-k <input type="range" min="1" max="10" step="1" value="10" data-k="k"><output>10</output></label>
      <label>Top-p <input type="range" min="0.05" max="1" step="0.05" value="1" data-k="p"><output>1.00</output></label>
      <label>Min-p <input type="range" min="0" max="0.5" step="0.01" value="0" data-k="minp"><output>0.00</output></label>
      <button class="sd-btn primary" data-a="draw">Sample 30</button><button class="sd-btn" data-a="reset">${UI.reset} Reset</button>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage gl-samp"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Order applied: temperature → top-k → top-p → min-p → renormalise → sample. Some hosted models no longer allow you to set these; open-weight servers (vLLM, llama.cpp, Ollama) do.</div>`));

    const compute = () => {
      const S = SCEN[st.scen], z = S.logits.map((l) => l / st.T), base = softmax(S.logits), p0 = softmax(z);
      const order = p0.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
      const keep = new Array(p0.length).fill(false);
      let cum = 0;
      order.forEach(([p, i], rank) => {
        const okK = rank < st.k, okP = cum < st.p || rank === 0, okM = p >= st.minp * order[0][0];
        if (okK && okP && okM) keep[i] = true;
        cum += p;
      });
      let tot = 0; p0.forEach((p, i) => { if (keep[i]) tot += p; });
      const final = p0.map((p, i) => (keep[i] ? p / tot : 0));
      return { S, base, p0, keep, final };
    };
    const draw = () => {
      const { S, base, p0, keep, final } = compute();
      const rows = S.tokens.map((t, i) => ({ t, i, b: base[i], p: p0[i], f: final[i], keep: keep[i] })).sort((a, b) => b.p - a.p);
      const maxv = Math.max(...rows.map((r) => Math.max(r.f, r.b)), 0.01);
      stage.innerHTML = `<div class="gl-label">Next-token probabilities for “${esc(S.prompt)}…” <span class="gl-key"><i class="o"></i>original (T=1) <i class="f"></i>after your settings <i class="d"></i>sampled</span></div>` + rows.map((r) => {
        const cnt = drawn ? drawn.counts[r.i] : 0;
        return `<div class="gl-srow ${r.keep ? "" : "cut"}"><span class="gl-st">${esc(r.t)}</span><div class="gl-sbar"><i class="o" style="width:${(r.b / maxv) * 100}%"></i><i class="f" style="width:${(r.f / maxv) * 100}%"></i></div><b>${r.keep ? pct(r.f) : "cut"}</b><span class="gl-dots">${drawn ? Array.from({ length: cnt }, () => '<u></u>').join("") : ""}</span></div>`;
      }).join("");
      const ent = -final.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
      const kept = keep.filter(Boolean).length;
      stats.innerHTML = `<div class="sd-stat"><span>tokens still possible</span><b>${kept} / ${S.tokens.length}</b></div><div class="sd-stat"><span>top token chance</span><b>${pct(Math.max(...final))}</b></div>
        <div class="sd-stat"><span>entropy (bits)</span><b>${ent.toFixed(2)}</b></div><div class="sd-stat ${final[S.tokens.length - 1] > 0.02 && S.tokens[S.tokens.length - 1] === "toaster" ? "bad" : ""}"><span>${drawn ? "sampled most often" : "style"}</span><b>${drawn ? esc(S.tokens[drawn.counts.indexOf(Math.max(...drawn.counts))]) : st.T < 0.3 ? "near-greedy" : st.T > 1.5 ? "very random" : "balanced"}</b></div>`;
    };
    const sample = () => {
      const { final, S } = compute(), rnd = mulberry32(1000 + round++), counts = new Array(S.tokens.length).fill(0);
      for (let n = 0; n < 30; n++) { let r = rnd(), acc = 0; for (let i = 0; i < final.length; i++) { acc += final[i]; if (r <= acc) { counts[i]++; break; } } }
      drawn = { counts };
    };
    $$('input[type="range"]', c).forEach((inp) => (inp.oninput = () => { st[inp.dataset.k] = +inp.value; inp.nextElementSibling.textContent = inp.dataset.k === "k" ? inp.value : (+inp.value).toFixed(2); drawn = null; draw(); }));
    $('[data-k="scen"]', c).onchange = (e) => { st.scen = e.target.value; drawn = null; draw(); };
    $('[data-a="draw"]', c).onclick = () => { sample(); draw(); };
    $('[data-a="reset"]', c).onclick = () => { Object.assign(st, { T: 1, k: 10, p: 1, minp: 0 }); $$('input[type="range"]', c).forEach((i) => { i.value = st[i.dataset.k]; i.nextElementSibling.textContent = i.dataset.k === "k" ? i.value : (+i.value).toFixed(2); }); drawn = null; draw(); };
    draw();
  });

  /* ================================================================ scaling / compute budget */
  sim("scaling", "Training compute calculator", "gauge", (body, cfg) => {
    const GPUS = { a100: ["A100", 3.12e14], h100: ["H100", 9.9e14], b200: ["B200", 2.25e15] };
    const st = { logC: Math.log10(+cfg.compute || 1e24), r: 20, gpu: "h100", mfu: 40, n: 4096, price: 2.5 };
    const c = ctrl(`<label>Compute budget <input type="range" min="19" max="26.5" step="0.1" value="${st.logC}" data-k="logC"><output></output></label>
      <label>Tokens per parameter <input type="range" min="2" max="2000" step="1" value="${st.r}" data-k="r"><output></output></label>
      <label>GPU <select data-k="gpu">${Object.entries(GPUS).map(([k, v]) => `<option value="${k}" ${k === st.gpu ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
      <label>Utilisation <input type="range" min="10" max="60" step="1" value="${st.mfu}" data-k="mfu"><output>${st.mfu}%</output></label>
      <label>GPUs <input type="number" min="8" max="100000" step="8" value="${st.n}" data-k="n"></label>
      <label>$ / GPU-hour <input type="number" min="0.5" max="10" step="0.1" value="${st.price}" data-k="price"></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Uses C ≈ 6·N·D. “Tokens per parameter” 20 is the Chinchilla compute-optimal rule of thumb; production models are often trained at 100–2000 so the model is smaller and cheaper to serve. Peak FLOP/s are approximate dense BF16 numbers; prices are examples.</div>`));
    const draw = () => {
      const C = Math.pow(10, st.logC), r = st.r, N = Math.sqrt(C / (6 * r)), D = r * N;
      const [gname, peak] = GPUS[st.gpu], eff = peak * (st.mfu / 100);
      const gpuSec = C / eff, gpuHours = gpuSec / 3600, days = gpuSec / st.n / 86400, cost = gpuHours * st.price;
      const serveGB = (N * 2) / 1e9, serveGB4 = (N * 0.5) / 1e9;
      $('[data-k="logC"]', c).nextElementSibling.textContent = "10^" + st.logC.toFixed(1);
      $('[data-k="r"]', c).nextElementSibling.textContent = st.r;
      $('[data-k="mfu"]', c).nextElementSibling.textContent = st.mfu + "%";
      // compare with the compute-optimal point
      const Nopt = Math.sqrt(C / (6 * 20));
      const bars = [[`Compute-optimal (20 tok/param)`, Nopt, "var(--n3)"], [`Your setting (${r} tok/param)`, N, "var(--n7)"]];
      const mx = Math.max(Nopt, N);
      stage.innerHTML = `<div class="gl-label">Model size for this compute budget</div>` + bars.map(([t, v, col]) => `<div class="gl-bar-row wide"><span>${t}</span><i style="width:${Math.max(1, (v / mx) * 100)}%;background:${col}"></i><b>${human(v)} params</b></div>`).join("") +
        `<div class="gl-note">${r > 40 ? "Overtrained: a smaller model fed far more tokens. It costs more to train per unit of quality, but is cheaper to serve every day after." : r < 15 ? "Undertrained: a big model that saw few tokens. Poor use of compute." : "Close to the Chinchilla compute-optimal balance."}</div>`;
      stats.innerHTML = `<div class="sd-stat"><span>parameters (N)</span><b>${human(N)}</b></div><div class="sd-stat"><span>training tokens (D)</span><b>${human(D)}</b></div>
        <div class="sd-stat"><span>GPU-hours</span><b>${human(gpuHours)}</b></div><div class="sd-stat"><span>wall-clock on ${human(st.n).replace(" ", "")} ${gname}s</span><b>${days < 1 ? (days * 24).toFixed(1) + " h" : days.toFixed(days < 10 ? 1 : 0) + " days"}</b></div>
        <div class="sd-stat ${cost > 5e7 ? "bad" : cost > 1e6 ? "warn" : ""}"><span>rental cost (compute only)</span><b>$${human(cost)}</b></div><div class="sd-stat"><span>weights: 16-bit / 4-bit</span><b>${fmtGB(serveGB)} / ${fmtGB(serveGB4)}</b></div>`;
    };
    $$("input,select", c).forEach((inp) => (inp.oninput = inp.onchange = () => { st[inp.dataset.k] = inp.tagName === "SELECT" ? inp.value : +inp.value; draw(); }));
    draw();
  });
})();
