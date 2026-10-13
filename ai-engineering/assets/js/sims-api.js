/* ==========================================================================
   GenLab simulators, part 2: working with LLM APIs.
   ctxbudget · cost · promptcache
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp, UI } = window.VIZ.SIM;
  const { ctrl, pct, human } = window.VIZ.SIM.gl;
  const usd = (x) => (x >= 100 ? "$" + Math.round(x).toLocaleString("en-US") : x >= 1 ? "$" + x.toFixed(2) : x >= 0.01 ? "$" + x.toFixed(3) : "$" + x.toFixed(5));
  const tok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "K" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)));
  const TIERS = {
    small: { name: "Small tier", in: 0.1, out: 0.5, cache: 0.01 },
    balanced: { name: "Balanced tier", in: 2, out: 10, cache: 0.2 },
    frontier: { name: "Frontier tier", in: 4, out: 20, cache: 0.4 },
  };
  window.VIZ.SIM.gl.TIERS = TIERS;
  window.VIZ.SIM.gl.usd = usd; window.VIZ.SIM.gl.tok = tok;

  /* ================================================================ context budget */
  sim("ctxbudget", "Context budget", "layers", (body, cfg) => {
    const PRESETS = {
      chatbot: { system: 800, tools: 0, examples: 0, history: 3000, docs: 0, user: 200, output: 600 },
      rag: { system: 1200, tools: 400, examples: 600, history: 2000, docs: 6000, user: 150, output: 800 },
      agent: { system: 2500, tools: 6000, examples: 0, history: 60000, docs: 20000, user: 300, output: 4000 },
      docqa: { system: 600, tools: 0, examples: 0, history: 1000, docs: 120000, user: 100, output: 1500 },
    };
    const st = { window: +cfg.window || 200000, tier: "balanced", cache: false, ...PRESETS.rag };
    const PARTS = [["system", "System prompt", "#6366f1"], ["tools", "Tool definitions", "#8b5cf6"], ["examples", "Few-shot examples", "#06b6d4"], ["history", "Conversation history", "#f59e0b"], ["docs", "Retrieved documents", "#10b981"], ["user", "User message", "#ec4899"], ["output", "Reserved for output", "#94a3b8"]];
    const c = ctrl(`<label>Preset <select data-k="preset"><option value="rag">RAG chatbot</option><option value="chatbot">Plain chatbot</option><option value="agent">Long-running agent</option><option value="docqa">Whole-document Q&A</option></select></label>
      <label>Window <select data-k="window"><option value="8000">8K</option><option value="32000">32K</option><option value="128000">128K</option><option value="200000" selected>200K</option><option value="1000000">1M</option></select></label>
      <label>Model <select data-k="tier">${Object.entries(TIERS).map(([k, v]) => `<option value="${k}" ${k === st.tier ? "selected" : ""}>${v.name}</option>`).join("")}</select></label>
      <label><input type="checkbox" data-k="cache"> cache the static part</label>`);
    body.appendChild(c);
    const sliders = el(`<div class="sd-ctrls gl-sliders">${PARTS.map(([k, t]) => `<label>${t} <input type="range" min="0" max="100" data-p="${k}"><output></output></label>`).join("")}</div>`);
    body.appendChild(sliders);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Sliders are logarithmic. “Static” (system, tools, examples) can be prompt-cached; history, documents and the question change per request.</div>`));
    // log-scale slider: 0..100 -> 0..window
    const toTokens = (v) => (v === 0 ? 0 : Math.round(Math.pow(10, (v / 100) * Math.log10(1e6)) / 10) * 10);
    const fromTokens = (n) => (n <= 0 ? 0 : Math.round((Math.log10(Math.max(n, 1)) / Math.log10(1e6)) * 100));
    const setSliders = () => PARTS.forEach(([k]) => { const s = $(`[data-p="${k}"]`, sliders); s.value = fromTokens(st[k]); s.nextElementSibling.textContent = tok(st[k]); });
    const draw = () => {
      const total = PARTS.reduce((s, [k]) => s + st[k], 0), T = TIERS[st.tier];
      const over = total > st.window, shown = Math.max(total, st.window);
      const inputTok = total - st.output, stat = st.system + st.tools + st.examples;
      const cost = st.cache ? ((inputTok - stat) * T.in + stat * T.cache + st.output * T.out) / 1e6 : (inputTok * T.in + st.output * T.out) / 1e6;
      const base = (inputTok * T.in + st.output * T.out) / 1e6;
      stage.innerHTML = `<div class="gl-label">Window: <b>${tok(st.window)}</b> tokens ${over ? '<b style="color:var(--sd-bad)">OVER by ' + tok(total - st.window) + " tokens: the request would be rejected</b>" : `· free: <b>${tok(st.window - total)}</b>`}</div>
        <div class="gl-stack">${PARTS.map(([k, t, col]) => st[k] ? `<i style="width:${(st[k] / shown) * 100}%;background:${col}" title="${t}: ${tok(st[k])}"></i>` : "").join("")}${over ? "" : `<i style="flex:1;background:var(--surface-2)"></i>`}</div>
        <div class="gl-legend">${PARTS.map(([k, t, col]) => `<span><i style="background:${col}"></i>${t} <b>${tok(st[k])}</b> <small>${pct(st[k] / st.window, 1)}</small></span>`).join("")}</div>`;
      stats.innerHTML = `<div class="sd-stat ${over ? "bad" : total / st.window > 0.8 ? "warn" : "ok"}"><span>window used</span><b>${pct(total / st.window, 0)}</b></div>
        <div class="sd-stat"><span>input tokens</span><b>${tok(inputTok)}</b></div>
        <div class="sd-stat"><span>cost per request</span><b>${usd(cost)}</b></div>
        <div class="sd-stat"><span>per 100K requests</span><b>${usd(cost * 1e5)}</b></div>
        <div class="sd-stat ${st.cache ? "ok" : ""}"><span>${st.cache ? "saved by caching" : "static share of input"}</span><b>${st.cache ? pct(1 - cost / base, 0) : pct(stat / Math.max(1, inputTok), 0)}</b></div>`;
    };
    $('[data-k="preset"]', c).onchange = (e) => { Object.assign(st, PRESETS[e.target.value]); setSliders(); draw(); };
    $('[data-k="window"]', c).onchange = (e) => { st.window = +e.target.value; draw(); };
    $('[data-k="tier"]', c).onchange = (e) => { st.tier = e.target.value; draw(); };
    $('[data-k="cache"]', c).onchange = (e) => { st.cache = e.target.checked; draw(); };
    $$("input[data-p]", sliders).forEach((s) => (s.oninput = () => { st[s.dataset.p] = toTokens(+s.value); s.nextElementSibling.textContent = tok(st[s.dataset.p]); draw(); }));
    setSliders(); draw();
  });

  /* ================================================================ monthly cost calculator */
  sim("cost", "Cost calculator", "chart", (body, cfg) => {
    const st = { requests: +cfg.requests || 50000, inTok: +cfg.input || 3000, outTok: +cfg.output || 300, cached: +cfg.cached || 0, batch: +cfg.batch || 0, retries: 5 };
    const c = ctrl(`<label>Requests / day <input type="number" min="1" step="1000" value="${st.requests}" data-k="requests"></label>
      <label>Input tokens <input type="number" min="1" step="100" value="${st.inTok}" data-k="inTok"></label>
      <label>Output tokens <input type="number" min="1" step="50" value="${st.outTok}" data-k="outTok"></label>
      <label>Cached share of input <input type="range" min="0" max="95" value="${st.cached}" data-k="cached"><output>${st.cached}%</output></label>
      <label>Batchable share <input type="range" min="0" max="100" value="${st.batch}" data-k="batch"><output>${st.batch}%</output></label>
      <label>Retries / failures <input type="range" min="0" max="30" value="${st.retries}" data-k="retries"><output>${st.retries}%</output></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    body.appendChild(el(`<div class="sd-note-line">Example list prices per million tokens (input / output / cached read): small 0.10 / 0.50 / 0.01, balanced 2 / 10 / 0.20, frontier 4 / 20 / 0.40. Batch requests get 50% off. Retries re-pay the call. Always check the provider's live prices.</div>`));
    const draw = () => {
      const rows = Object.entries(TIERS).map(([k, T]) => {
        const cachedTok = st.inTok * st.cached / 100, freshTok = st.inTok - cachedTok;
        const perReq = (freshTok * T.in + cachedTok * T.cache + st.outTok * T.out) / 1e6;
        const eff = perReq * (1 - 0.5 * st.batch / 100) * (1 + st.retries / 100);
        const noOpt = ((st.inTok * T.in + st.outTok * T.out) / 1e6) * (1 + st.retries / 100);
        return { k, T, perReq: eff, day: eff * st.requests, month: eff * st.requests * 30, noOpt: noOpt * st.requests * 30 };
      });
      const mx = Math.max(...rows.map((r) => r.noOpt));
      stage.innerHTML = `<table class="sd-table est"><thead><tr><th>Model tier</th><th class="num">per request</th><th class="num">per day</th><th class="num">per month</th><th class="num">per year</th><th>vs no optimisation</th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${r.T.name}</b></td><td class="num">${usd(r.perReq)}</td><td class="num">${usd(r.day)}</td><td class="num"><b>${usd(r.month)}</b></td><td class="num">${usd(r.month * 12)}</td>
        <td><div class="gl-minibar"><i style="width:${(r.noOpt / mx) * 100}%;background:var(--n8);opacity:.5"></i><i style="width:${(r.month / mx) * 100}%;background:var(--n3)"></i></div><small>${r.noOpt > r.month ? "saves " + pct(1 - r.month / r.noOpt, 0) : "no savings yet"}</small></td></tr>`).join("")}</tbody></table>`;
    };
    $$("input", c).forEach((i) => (i.oninput = () => { st[i.dataset.k] = +i.value; if (i.type === "range") i.nextElementSibling.textContent = i.value + "%"; draw(); }));
    draw();
  });

  /* ================================================================ prompt cache explorer */
  sim("promptcache", "Prompt cache explorer", "cache", (body) => {
    const st = { ts: "none", user: false, shuffle: false, edit: false };
    const c = ctrl(`<label>Timestamp <select data-k="ts"><option value="none">none</option><option value="top">at the very top of the system prompt</option><option value="end">after the static part (end)</option></select></label>
      <label><input type="checkbox" data-k="user"> user name inside system prompt</label>
      <label><input type="checkbox" data-k="shuffle"> tool order changes each request</label>
      <label><input type="checkbox" data-k="edit"> an old chat message is rewritten each time</label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Three consecutive requests. A cache breakpoint sits after the earlier chat turns (everything before it must be identical to hit). Green = read from cache (cheap), amber = written to cache (premium), grey = ordinary input. Prices: normal input 1.0×, cache write 1.25×, cache read 0.1×.</div>`));
    const SIZE = { tools: 1500, system: 2000, examples: 1500, ts: 20, uname: 10, history: 1200, docs: 3000, question: 60 };
    const build = (n) => {
      // each segment is [id, label, tokens, contentSignature]; the signature decides prefix equality
      const segs = [];
      const tools = st.shuffle ? `tools-order-${n}` : "tools";
      segs.push(["tools", "Tool definitions", SIZE.tools, tools]);
      if (st.ts === "top") segs.push(["ts", "Timestamp", SIZE.ts, `ts-${n}`]);
      segs.push(["system", "System prompt" + (st.user ? " + user name" : ""), SIZE.system + (st.user ? SIZE.uname : 0), st.user ? `system-user-${n % 2}` : "system"]);
      segs.push(["examples", "Few-shot examples", SIZE.examples, "examples"]);
      segs.push(["history", "Earlier chat turns", SIZE.history, st.edit ? `history-${n}` : "history"]);
      const staticEnd = segs.length;                       // the cache breakpoint: everything before it is the cacheable prefix
      if (st.ts === "end") segs.push(["ts", "Timestamp", SIZE.ts, `ts-${n}`]);
      segs.push(["docs", "Retrieved documents", SIZE.docs, `docs-${n}`]);
      segs.push(["question", "User question", SIZE.question, `q-${n}`]);
      return { segs, staticEnd };
    };
    const draw = () => {
      let prevReq = null, totalCost = 0, totalBase = 0, html = "", cacheState = null;
      const store = [];                                    // list of cached prefixes (arrays of signatures) with their token counts
      for (let n = 0; n < 3; n++) {
        const { segs, staticEnd } = build(n);
        let matched = 0, matchedTokens = 0;
        // longest cached prefix, measured in segments up to the breakpoint
        for (const prev of store) {
          let m = 0, t = 0;
          while (m < prev.sig.length && m < segs.length && prev.sig[m] === segs[m][3] && m < staticEnd) { t += segs[m][2]; m++; }
          if (m === prev.sig.length && m > 0 && t > matchedTokens) { matched = m; matchedTokens = t; }
        }
        const cachedUpTo = matched;
        const cells = segs.map((s, i) => {
          let cls = "plain";
          if (i < cachedUpTo) cls = "read";
          else if (i < staticEnd) cls = "write";
          return { s, cls };
        });
        const prefixSig = segs.slice(0, staticEnd).map((s) => s[3]);
        if (cachedUpTo < staticEnd) store.push({ sig: prefixSig });   // write: remember this static prefix
        const tokens = (cls) => cells.filter((x) => x.cls === cls).reduce((a, x) => a + x.s[2], 0);
        const read = tokens("read"), write = tokens("write"), plain = tokens("plain");
        const cost = (read * 0.1 + write * 1.25 + plain * 1.0) / 1e6 * 2;       // $2 / MTok balanced-tier input
        const base = (read + write + plain) * 2 / 1e6;
        totalCost += cost; totalBase += base;
        html += `<div class="gl-req"><div class="gl-req-h"><b>Request ${n + 1}</b><span>${tok(read + write + plain)} tokens · cache read ${tok(read)} · write ${tok(write)} · fresh ${tok(plain)} · input cost ${usd(cost)}</span></div>
          <div class="gl-pc">${cells.map(({ s, cls }) => `<div class="gl-seg ${cls}" style="flex:${Math.max(s[2], 260)}" title="${esc(s[1])}: ${s[2]} tokens"><span>${esc(s[1])}</span><small>${tok(s[2])}</small></div>`).join("")}</div></div>`;
      }
      stage.innerHTML = html;
      const saved = 1 - totalCost / totalBase;
      stats.innerHTML = `<div class="sd-stat"><span>input cost, 3 requests</span><b>${usd(totalCost)}</b></div><div class="sd-stat"><span>without caching</span><b>${usd(totalBase)}</b></div>
        <div class="sd-stat ${saved > 0.3 ? "ok" : saved < 0 ? "bad" : "warn"}"><span>${saved < 0 ? "extra cost (cache writes never read)" : "saved"}</span><b>${pct(Math.abs(saved), 0)}</b></div>`;
    };
    $$("[data-k]", c).forEach((i) => (i.onchange = () => { st[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value; draw(); }));
    draw();
  });
})();
