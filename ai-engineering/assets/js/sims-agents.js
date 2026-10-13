/* ==========================================================================
   GenLab simulators, part 4: agents.
   agentloop · errorcompound
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp, UI } = window.VIZ.SIM;
  const { ctrl, pct, human } = window.VIZ.SIM.gl;
  const tok = (n) => (n >= 1e4 ? Math.round(n / 1e3) + "K" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)));

  /* ================================================================ the agent loop, step by step */
  const SCEN = {
    refund: {
      title: "Support agent: refund request",
      system: 1800,
      steps: [
        { k: "user", t: "Hi, order A-100 arrived broken. I want my money back.", n: 20 },
        { k: "think", t: "I need the order details and the refund policy before deciding. Two independent lookups, so call both.", n: 40 },
        { k: "call", t: 'get_order(order_id="A-100")', n: 25 },
        { k: "call", t: 'search_policy(query="refund for damaged item")', n: 25 },
        { k: "result", t: '{"status": "delivered", "total": 129.00, "delivered_at": "2026-10-05", "customer": "C-77"}  (order record)', n: 600 },
        { k: "result", t: '"Damaged items: full refund within 30 days of delivery, no return required under $200." (3 policy passages)', n: 1800 },
        { k: "think", t: "Delivered 7 days ago, total $129 < $200, so a refund is allowed without a return. Issuing a refund moves money, so it needs approval.", n: 50 },
        { k: "approve", t: "issue_refund(order_id=\"A-100\", amount=129.00) → waiting for human approval…", n: 30 },
        { k: "result", t: '{"approved_by": "agent_supervisor", "refund_id": "R-5521"}', n: 40 },
        { k: "answer", t: "I'm sorry the order arrived damaged. I've refunded $129.00 (refund R-5521); it should reach you in 3–5 business days.", n: 45 },
      ],
    },
    code: {
      title: "Coding agent: fix a failing test",
      system: 3500,
      steps: [
        { k: "user", t: "test_invoice_total is failing. Fix it.", n: 15 },
        { k: "think", t: "Run the test first to see the failure.", n: 20 },
        { k: "call", t: 'run_tests(path="tests/test_invoice.py")', n: 20 },
        { k: "result", t: "FAILED test_invoice_total: assert 108.0 == 118.0  (stack trace, 60 lines)", n: 1400 },
        { k: "think", t: "Total is missing tax on shipping. Find where tax is computed.", n: 30 },
        { k: "call", t: 'grep(pattern="tax_rate", path="src/")', n: 20 },
        { k: "result", t: "src/tax.py:42, src/invoice.py:88, src/cart.py:12 ... (24 matches)", n: 900 },
        { k: "call", t: 'read_file(path="src/tax.py", lines="30-70")', n: 25 },
        { k: "result", t: "def apply_tax(net, rate): return net + net * rate   # (41 lines of code)", n: 1600 },
        { k: "think", t: "Tax is applied to net only; shipping is added afterwards. Apply it to gross.", n: 40 },
        { k: "call", t: 'edit_file(path="src/tax.py", old="net * rate", new="(net + shipping) * rate")', n: 45 },
        { k: "result", t: "edit applied (diff, 6 lines)", n: 120 },
        { k: "call", t: 'run_tests(path="tests/")', n: 15 },
        { k: "result", t: "142 passed in 4.1s", n: 60 },
        { k: "answer", t: "Fixed: tax was computed before shipping was added. The full suite now passes (142 tests).", n: 40 },
      ],
    },
  };
  const ICON = { user: "👤", think: "💭", call: "🔧", result: "📥", approve: "✋", answer: "💬" };
  const LABEL = { user: "User", think: "Model reasons", call: "Model calls a tool", result: "Tool result", approve: "Human approval", answer: "Final answer" };

  sim("agentloop", "Agent loop", "agent", (body, cfg) => {
    const st = { s: cfg.scenario in SCEN ? cfg.scenario : "refund", i: 0, clear: false, timer: null };
    const c = ctrl(`<label>Scenario <select data-k="s">${Object.entries(SCEN).map(([k, v]) => `<option value="${k}" ${k === st.s ? "selected" : ""}>${esc(v.title)}</option>`).join("")}</select></label>
      <button class="sd-btn" data-a="prev">${UI.prev}</button><button class="sd-btn primary" data-a="next">Next step ${UI.next}</button><button class="sd-btn" data-a="play">${UI.play} Play</button><button class="sd-btn" data-a="reset">${UI.reset}</button>
      <label><input type="checkbox" data-k="clear"> clear old tool results (keep the last 2)</label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage gl-loop"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Every step re-sends the whole context to the model, so cost grows much faster than the number of steps. Tick “clear old tool results” to see context editing keep the window small.</div>`));
    const draw = () => {
      const S = SCEN[st.s], shown = S.steps.slice(0, st.i);
      // token size of each message under the current policy
      const results = shown.map((x, idx) => (x.k === "result" ? idx : -1)).filter((x) => x >= 0);
      const keep = new Set(results.slice(-2));
      const sizes = shown.map((x, idx) => (st.clear && x.k === "result" && !keep.has(idx) && x.n > 60 ? 40 : x.n));
      let ctx = S.system, billed = 0; const ctxAt = [];
      sizes.forEach((n, idx) => { const modelCalls = shown[idx].k === "think" || shown[idx].k === "answer"; if (modelCalls) billed += ctx; ctx += n; ctxAt.push(ctx); });
      const maxCtx = Math.max(...ctxAt, S.system) || 1;
      const rows = shown.map((x, idx) => `<div class="gl-step ${x.k}"><span class="ic">${ICON[x.k]}</span><div><b>${LABEL[x.k]}</b> <small>${tok(sizes[idx])} tokens${sizes[idx] !== x.n ? " (cleared, was " + tok(x.n) + ")" : ""}</small><div class="tx">${esc(x.t)}</div></div><div class="bar"><i style="width:${(ctxAt[idx] / maxCtx) * 100}%"></i><em>${tok(ctxAt[idx])}</em></div></div>`).join("");
      stage.innerHTML = `<div class="gl-step system"><span class="ic">📋</span><div><b>System prompt + tool definitions</b> <small>${tok(S.system)} tokens, resent every step</small></div><div class="bar"><i style="width:${(S.system / maxCtx) * 100}%"></i><em>${tok(S.system)}</em></div></div>${rows || '<div class="gl-label" style="padding:10px 2px">Press “Next step” to start the loop.</div>'}`;
      stats.innerHTML = `<div class="sd-stat"><span>step</span><b>${st.i} / ${S.steps.length}</b></div><div class="sd-stat"><span>context size now</span><b>${tok(ctx)}</b></div>
        <div class="sd-stat"><span>input tokens billed so far</span><b>${tok(billed)}</b></div><div class="sd-stat ${st.clear ? "ok" : ""}"><span>model calls so far</span><b>${shown.filter((x) => x.k === "think" || x.k === "answer").length}</b></div>`;
      $('[data-a="prev"]', c).disabled = st.i === 0; $('[data-a="next"]', c).disabled = st.i >= S.steps.length;
    };
    const stop = () => { clearInterval(st.timer); st.timer = null; $('[data-a="play"]', c).innerHTML = `${UI.play} Play`; };
    $('[data-k="s"]', c).onchange = (e) => { stop(); st.s = e.target.value; st.i = 0; draw(); };
    $('[data-k="clear"]', c).onchange = (e) => { st.clear = e.target.checked; draw(); };
    $('[data-a="next"]', c).onclick = () => { stop(); st.i = Math.min(SCEN[st.s].steps.length, st.i + 1); draw(); };
    $('[data-a="prev"]', c).onclick = () => { stop(); st.i = Math.max(0, st.i - 1); draw(); };
    $('[data-a="reset"]', c).onclick = () => { stop(); st.i = 0; draw(); };
    $('[data-a="play"]', c).onclick = () => {
      if (st.timer) return stop();
      if (st.i >= SCEN[st.s].steps.length) st.i = 0;
      $('[data-a="play"]', c).innerHTML = `${UI.pause} Pause`;
      st.timer = setInterval(() => { if (!c.isConnected) return stop(); if (st.i >= SCEN[st.s].steps.length) return stop(); st.i++; draw(); }, 900);
    };
    st.i = +cfg.start || 0;
    draw();
  });

  /* ================================================================ compounding error in multi-step agents */
  sim("errorcompound", "Why long chains fail", "chart", (body, cfg) => {
    const st = { p: +cfg.p || 0.95, steps: +cfg.steps || 20, verify: 0, retries: 0 };
    const c = ctrl(`<label>Per-step success <input type="range" min="0.80" max="0.999" step="0.001" value="${st.p}" data-k="p"><output>${(st.p * 100).toFixed(1)}%</output></label>
      <label>Steps in the task <input type="range" min="1" max="60" value="${st.steps}" data-k="steps"><output>${st.steps}</output></label>
      <label>Verifier catches errors <input type="range" min="0" max="95" step="5" value="0" data-k="verify"><output>0%</output></label>
      <label>Retries per failed step <input type="range" min="0" max="3" value="0" data-k="retries"><output>0</output></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">End-to-end success = (effective per-step success)^steps. A verifier that catches a share of errors, plus retries, raises the effective per-step success: that is why agents check their work between steps. (Assumes independent errors: real errors are often correlated, which is worse.)</div>`));
    // A step succeeds with probability p. A failed attempt is caught with probability v (then the agent may retry,
    // up to `retries` times); an uncaught error ships and the task fails.  f(0) = p;  f(r) = p + (1 - p) * v * f(r - 1).
    const effective = () => { const p = st.p, v = st.verify / 100; let f = p; for (let r = 0; r < st.retries; r++) f = p + (1 - p) * v * f; return f; };
    const draw = () => {
      const pe = Math.max(0, Math.min(1, effective()));
      const W = 640, H = 220, P = 34;
      const xs = Array.from({ length: 61 }, (_, i) => i);
      const line = (pp, col, dash) => `<polyline fill="none" stroke="${col}" stroke-width="2.4" ${dash ? 'stroke-dasharray="5 4"' : ""} points="${xs.map((n) => `${P + (n / 60) * (W - 2 * P)},${H - P - Math.pow(pp, n) * (H - 2 * P)}`).join(" ")}"/>`;
      const x = P + (st.steps / 60) * (W - 2 * P), y = H - P - Math.pow(pe, st.steps) * (H - 2 * P);
      stage.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="gl-ann-svg" style="cursor:default">
        ${[0, 0.25, 0.5, 0.75, 1].map((g) => `<line x1="${P}" x2="${W - P}" y1="${H - P - g * (H - 2 * P)}" y2="${H - P - g * (H - 2 * P)}" stroke="var(--border)"/><text x="${P - 6}" y="${H - P - g * (H - 2 * P) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${g * 100}%</text>`).join("")}
        ${[0, 10, 20, 30, 40, 50, 60].map((n) => `<text x="${P + (n / 60) * (W - 2 * P)}" y="${H - P + 16}" text-anchor="middle" font-size="10" fill="var(--muted)">${n}</text>`).join("")}
        <text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="10.5" fill="var(--muted)">number of steps</text>
        ${line(st.p, "var(--n8)", true)}${line(pe, "var(--n3)", false)}
        <circle cx="${x}" cy="${y}" r="5.5" fill="var(--n7)"/><text x="${Math.min(W - P - 40, x + 8)}" y="${Math.max(16, y - 8)}" font-size="12" font-weight="700" fill="var(--text)">${pct(Math.pow(pe, st.steps), 0)}</text>
      </svg><div class="gl-legend"><span><i style="background:var(--n8)"></i>no checks (raw per-step success)</span><span><i style="background:var(--n3)"></i>with your verifier and retries</span></div>`;
      stats.innerHTML = `<div class="sd-stat"><span>raw per-step</span><b>${pct(st.p, 1)}</b></div><div class="sd-stat"><span>effective per-step</span><b>${pct(pe, 2)}</b></div>
        <div class="sd-stat bad"><span>task success, no checks</span><b>${pct(Math.pow(st.p, st.steps), 1)}</b></div><div class="sd-stat ${Math.pow(pe, st.steps) > 0.8 ? "ok" : "warn"}"><span>task success, with checks</span><b>${pct(Math.pow(pe, st.steps), 1)}</b></div>`;
    };
    $$("input", c).forEach((i) => (i.oninput = () => { st[i.dataset.k] = +i.value; i.nextElementSibling.textContent = i.dataset.k === "p" ? (st.p * 100).toFixed(1) + "%" : i.dataset.k === "verify" ? i.value + "%" : i.value; draw(); }));
    draw();
  });
})();
