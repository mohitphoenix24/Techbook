/* ==========================================================================
   GenLab simulators, part 6: inference and serving.
   kvcache · quant · batching · specdec · gpusize
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp, UI } = window.VIZ.SIM;
  const { ctrl, pct, human, fmtGB, mulberry32, PALETTE } = window.VIZ.SIM.gl;
  const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : String(Math.round(n)));

  const MODELS = {
    "Llama-style 8B (GQA)": { params: 8.03e9, layers: 32, heads: 32, kvHeads: 8, headDim: 128 },
    "7B (full multi-head)": { params: 6.74e9, layers: 32, heads: 32, kvHeads: 32, headDim: 128 },
    "70B (GQA)": { params: 70.6e9, layers: 80, heads: 64, kvHeads: 8, headDim: 128 },
    "1B (GQA)": { params: 1.24e9, layers: 16, heads: 32, kvHeads: 8, headDim: 64 },
  };
  const GPUS = {
    "RTX 4090 (24 GB)": { mem: 24, bw: 1.0 }, "L40S (48 GB)": { mem: 48, bw: 0.864 }, "A100 (80 GB)": { mem: 80, bw: 2.0 },
    "H100 (80 GB)": { mem: 80, bw: 3.35 }, "H200 (141 GB)": { mem: 141, bw: 4.8 }, "B200 (192 GB)": { mem: 192, bw: 8.0 },
  };
  window.VIZ.SIM.gl.MODELS_INF = MODELS; window.VIZ.SIM.gl.GPUS = GPUS;
  const kvBytesPerToken = (m, bytes) => 2 * m.layers * m.kvHeads * m.headDim * bytes;

  /* ================================================================ KV cache */
  sim("kvcache", "KV-cache memory", "cache", (body, cfg) => {
    const st = { model: cfg.model in MODELS ? cfg.model : "Llama-style 8B (GQA)", logSeq: Math.log10(+cfg.seq || 8192), batch: 8, kv: 2, w: 2, gpu: "H100 (80 GB)" };
    const c = ctrl(`<label>Model <select data-k="model">${Object.keys(MODELS).map((k) => `<option ${k === st.model ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      <label>Context length <input type="range" min="2.5" max="6.1" step="0.05" value="${st.logSeq}" data-k="logSeq"><output></output></label>
      <label>Concurrent sequences <input type="range" min="1" max="256" value="${st.batch}" data-k="batch"><output>${st.batch}</output></label>
      <label>KV precision <select data-k="kv"><option value="2">16-bit</option><option value="1">8-bit</option><option value="0.5">4-bit</option></select></label>
      <label>GPU <select data-k="gpu">${Object.keys(GPUS).map((k) => `<option ${k === st.gpu ? "selected" : ""}>${k}</option>`).join("")}</select></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">KV cache per token = 2 (keys and values) × layers × KV heads × head dim × bytes. Grouped-query attention (GQA) divides it by heads ÷ KV heads. Weights are held at 16-bit here; the GPU must hold weights + the KV cache of every active sequence.</div>`));
    const draw = () => {
      const M = MODELS[st.model], G = GPUS[st.gpu], seq = Math.round(Math.pow(10, st.logSeq)), perTok = kvBytesPerToken(M, st.kv);
      const kvTotal = perTok * seq * st.batch, weights = M.params * st.w, gpuBytes = G.mem * 1e9;
      const free = Math.max(0, gpuBytes * 0.9 - weights), maxSeqs = Math.floor(free / (perTok * seq));
      const used = weights + kvTotal, fits = used <= gpuBytes * 0.9;
      const tot = Math.max(used, gpuBytes);
      $('[data-k="logSeq"]', c).nextElementSibling.textContent = fmtN(seq) + " tokens";
      stage.innerHTML = `<div class="gl-label">GPU memory (${G.mem} GB): weights + KV cache for ${st.batch} sequence${st.batch > 1 ? "s" : ""} of ${fmtN(seq)} tokens ${fits ? "" : '<b style="color:var(--sd-bad)">· DOES NOT FIT</b>'}</div>
        <div class="gl-stack" style="height:40px"><i style="width:${(weights / tot) * 100}%;background:var(--n2)" title="weights"></i><i style="width:${(kvTotal / tot) * 100}%;background:${fits ? "var(--n6)" : "var(--sd-bad,#ef4444)"}" title="KV cache"></i><i style="flex:1;background:var(--surface-2)"></i></div>
        <div class="gl-legend"><span><i style="background:var(--n2)"></i>weights <b>${fmtGB(weights / 1e9)}</b></span><span><i style="background:var(--n6)"></i>KV cache <b>${fmtGB(kvTotal / 1e9)}</b></span><span>GPU capacity <b>${G.mem} GB</b> (90% usable)</span></div>`;
      stats.innerHTML = `<div class="sd-stat"><span>KV per token</span><b>${(perTok / 1024).toFixed(0)} KB</b></div><div class="sd-stat"><span>KV per sequence</span><b>${fmtGB((perTok * seq) / 1e9)}</b></div>
        <div class="sd-stat ${maxSeqs >= st.batch ? "ok" : "bad"}"><span>max concurrent at this length</span><b>${maxSeqs}</b></div><div class="sd-stat"><span>GQA saving vs full MHA</span><b>${(M.heads / M.kvHeads).toFixed(0)}×</b></div>`;
    };
    $$("[data-k]", c).forEach((inp) => (inp.oninput = inp.onchange = () => { const k = inp.dataset.k; st[k] = inp.tagName === "SELECT" && k !== "model" && k !== "gpu" ? +inp.value : inp.type === "range" ? +inp.value : inp.value; if (k === "batch") inp.nextElementSibling.textContent = st.batch; draw(); }));
    draw();
  });

  /* ================================================================ quantization */
  function gaussSample(n, seed, outliers) {
    const rnd = mulberry32(seed), out = [];
    for (let i = 0; i < n; i++) { const u = Math.max(1e-9, rnd()), v = rnd(); out.push(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.02); }
    if (outliers) { out[7] = 0.31; out[93] = -0.27; out[200] = 0.22; }
    return out;
  }
  function quantise(vals, bits, group) {
    const q = [], qmax = Math.pow(2, bits - 1) - 1;
    for (let s = 0; s < vals.length; s += group) {
      const chunk = vals.slice(s, s + group), scale = Math.max(...chunk.map(Math.abs)) / qmax || 1;
      chunk.forEach((v) => q.push(Math.round(v / scale) * scale));
    }
    return q;
  }
  sim("quant", "Quantization explorer", "gauge", (body) => {
    const N = 256, st = { bits: 4, group: 64, outliers: false };
    const c = ctrl(`<label>Bits per weight <select data-k="bits"><option>16</option><option>8</option><option>6</option><option selected>4</option><option>3</option><option>2</option></select></label>
      <label>Group size <select data-k="group"><option value="256">whole tensor</option><option value="128">128</option><option value="64" selected>64</option><option value="32">32</option></select></label>
      <label><input type="checkbox" data-k="outliers"> add a few outlier weights</label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">256 weights drawn from a bell curve. Each group of weights shares one scale (absmax quantisation): values snap to 2<sup>bits</sup> evenly spaced levels. Smaller groups adapt better; one big outlier forces a coarse grid on everything in its group, which is why outliers hurt and why activation outliers made 8-bit LLM inference hard.</div>`));
    const draw = () => {
      const vals = gaussSample(N, 11, st.outliers), bits = st.bits >= 16 ? 16 : st.bits;
      const q = bits >= 16 ? vals.slice() : quantise(vals, bits, st.group);
      const err = vals.map((v, i) => v - q[i]), mse = err.reduce((s, e) => s + e * e, 0) / N, sigP = vals.reduce((s, v) => s + v * v, 0) / N;
      const snr = 10 * Math.log10(sigP / Math.max(mse, 1e-18)), maxE = Math.max(...err.map(Math.abs));
      const W = 640, H = 170, P = 14, mx = Math.max(...vals.map(Math.abs)) * 1.05;
      const sx = (i) => P + (i / (N - 1)) * (W - 2 * P), sy = (v) => H / 2 - (v / mx) * (H / 2 - 12);
      const bytesPer = bits >= 16 ? 2 : (bits + 16 / st.group) / 8;
      stage.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="gl-ann-svg" style="cursor:default"><line x1="${P}" x2="${W - P}" y1="${H / 2}" y2="${H / 2}" stroke="var(--border)"/>
        ${vals.map((v, i) => `<circle cx="${sx(i)}" cy="${sy(v)}" r="2.3" fill="var(--n8)" opacity=".55"/>`).join("")}
        ${q.map((v, i) => `<circle cx="${sx(i)}" cy="${sy(v)}" r="2.1" fill="var(--n3)"/>`).join("")}</svg>
        <div class="gl-legend"><span><i style="background:var(--n8)"></i>original weights</span><span><i style="background:var(--n3)"></i>after ${bits}-bit quantisation (${bits >= 16 ? "no change" : Math.pow(2, bits) + " levels, group of " + Math.min(st.group, N)})</span></div>`;
      stats.innerHTML = `<div class="sd-stat"><span>bytes per weight</span><b>${bytesPer.toFixed(2)}</b></div><div class="sd-stat"><span>size vs 16-bit</span><b>${pct(bytesPer / 2, 0)}</b></div>
        <div class="sd-stat"><span>mean squared error</span><b>${mse.toExponential(1)}</b></div><div class="sd-stat ${snr > 30 ? "ok" : snr > 15 ? "warn" : "bad"}"><span>signal-to-noise (dB)</span><b>${bits >= 16 ? "∞" : snr.toFixed(1)}</b></div>
        <div class="sd-stat"><span>8B model at this precision</span><b>${fmtGB((8.03e9 * bytesPer) / 1e9)}</b></div>`;
    };
    $$("[data-k]", c).forEach((i) => (i.oninput = i.onchange = () => { st[i.dataset.k] = i.type === "checkbox" ? i.checked : +i.value; draw(); }));
    draw();
  });

  /* ================================================================ batching: static vs continuous */
  sim("batching", "Batching timeline", "list", (body) => {
    const st = { mode: "static", slots: 4 };
    const REQ = [[0, 6], [0, 18], [1, 4], [2, 10], [3, 5], [4, 22], [6, 6], [7, 8], [9, 4], [10, 14], [12, 6], [13, 9]];   // [arrival step, output tokens]
    const c = ctrl(`<div class="sd-seg"><button class="on" data-m="static">Static batching</button><button data-m="continuous">Continuous batching</button></div>
      <label>Batch slots <input type="range" min="2" max="8" value="${st.slots}" data-k="slots"><output>${st.slots}</output></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Each row is a request: grey = waiting, coloured = generating one token per step. Static batching starts a new batch only when the whole previous batch is finished, so short requests wait for the longest one. Continuous batching admits a waiting request the moment any slot frees up.</div>`));
    const run = () => {
      const reqs = REQ.map(([a, n], i) => ({ id: i, arrive: a, need: n, start: null, end: null, left: n })), waiting = [...reqs], running = [];
      let t = 0, busy = 0, steps = 0;
      while (reqs.some((r) => r.end === null)) {
        const canAdmit = st.mode === "continuous" || running.length === 0;
        while (canAdmit && running.length < st.slots && waiting.length && waiting[0].arrive <= t) { const r = waiting.shift(); r.start = t; running.push(r); }
        if (!running.length) { t++; continue; }
        busy += running.length; steps++; t++;
        running.forEach((r) => { if (--r.left === 0) r.end = t; });
        for (let i = running.length - 1; i >= 0; i--) if (running[i].end !== null) running.splice(i, 1);
      }
      return { reqs, total: t, util: busy / (steps * st.slots) };
    };
    const draw = () => {
      const { reqs, total, util } = run();
      const px = 100 / total;
      stage.innerHTML = reqs.map((r) => `<div class="gl-trow"><span class="gl-tl">req ${r.id + 1}<small>${r.need} tok</small></span><div class="gl-ttrack">
        <i class="wait" style="left:${r.arrive * px}%;width:${(r.start - r.arrive) * px}%"></i><i class="run" style="left:${r.start * px}%;width:${(r.end - r.start) * px}%;background:${PALETTE[r.id % PALETTE.length]}"></i></div></div>`).join("") +
        `<div class="gl-axis"><span>0</span><span>decode steps →</span><span>${total}</span></div>`;
      const lat = reqs.map((r) => r.end - r.arrive), tokens = reqs.reduce((s, r) => s + r.need, 0);
      stats.innerHTML = `<div class="sd-stat"><span>total steps to finish</span><b>${total}</b></div><div class="sd-stat"><span>throughput (tokens/step)</span><b>${(tokens / total).toFixed(2)}</b></div>
        <div class="sd-stat ${util > 0.7 ? "ok" : "warn"}"><span>slot utilisation</span><b>${pct(util, 0)}</b></div><div class="sd-stat"><span>mean request latency</span><b>${(lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(1)} steps</b></div>
        <div class="sd-stat"><span>mean queue wait</span><b>${(reqs.reduce((s, r) => s + (r.start - r.arrive), 0) / reqs.length).toFixed(1)} steps</b></div>`;
    };
    $$(".sd-seg button", c).forEach((b) => (b.onclick = () => { st.mode = b.dataset.m; $$(".sd-seg button", c).forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
    $('[data-k="slots"]', c).oninput = (e) => { st.slots = +e.target.value; e.target.nextElementSibling.textContent = st.slots; draw(); };
    draw();
  });

  /* ================================================================ speculative decoding */
  sim("specdec", "Speculative decoding", "zap", (body) => {
    const st = { alpha: 0.8, k: 4, cost: 0.1 };
    const c = ctrl(`<label>Acceptance rate α <input type="range" min="0.3" max="0.99" step="0.01" value="${st.alpha}" data-k="alpha"><output>0.80</output></label>
      <label>Draft length k <input type="range" min="1" max="12" value="${st.k}" data-k="k"><output>4</output></label>
      <label>Draft cost ÷ target cost <input type="range" min="0.02" max="0.5" step="0.01" value="${st.cost}" data-k="cost"><output>0.10</output></label>
      <button class="sd-btn primary" data-a="trace">Show one trace</button>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">A small draft model proposes k tokens; the big model verifies all k in ONE forward pass and keeps the longest accepted prefix, plus one token of its own. The output distribution is exactly the big model's. Expected tokens per big-model step = (1 − α<sup>k+1</sup>) / (1 − α).</div>`));
    let round = 0, trace = null;
    const expTokens = (a, k) => (1 - Math.pow(a, k + 1)) / (1 - a);
    const speed = (a, k, cost) => expTokens(a, k) / (1 + cost * k);
    const draw = () => {
      const W = 640, H = 190, P = 34, ks = Array.from({ length: 12 }, (_, i) => i + 1), curves = [[0.6, "var(--n6)"], [0.8, "var(--n3)"], [0.95, "var(--n5)"]];
      const mx = Math.max(3, ...curves.flatMap(([a]) => ks.map((k) => speed(a, k, st.cost)))) * 1.1;
      const x = (k) => P + ((k - 1) / 11) * (W - 2 * P), y = (v) => H - P - (v / mx) * (H - 2 * P);
      const line = (a, col, w) => `<polyline fill="none" stroke="${col}" stroke-width="${w}" points="${ks.map((k) => `${x(k)},${y(speed(a, k, st.cost))}`).join(" ")}"/>`;
      const sp = speed(st.alpha, st.k, st.cost);
      stage.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="gl-ann-svg" style="cursor:default">
        ${[1, 2, 3, 4].filter((g) => g < mx).map((g) => `<line x1="${P}" x2="${W - P}" y1="${y(g)}" y2="${y(g)}" stroke="var(--border)"/><text x="${P - 6}" y="${y(g) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${g}×</text>`).join("")}
        ${ks.map((k) => `<text x="${x(k)}" y="${H - P + 16}" text-anchor="middle" font-size="10" fill="var(--muted)">${k}</text>`).join("")}<text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="10.5" fill="var(--muted)">draft length k</text>
        ${curves.map(([a, col]) => line(a, col, 1.6) + `<text x="${W - P + 4}" y="${y(speed(a, 12, st.cost)) + 4}" font-size="10" fill="${col}">α=${a}</text>`).join("")}${line(st.alpha, "var(--n7)", 3)}
        <circle cx="${x(st.k)}" cy="${y(sp)}" r="5.5" fill="var(--n7)"/></svg>`
        + (trace ? `<div class="gl-label" style="margin-top:8px">One simulated round (α=${st.alpha.toFixed(2)}): <span class="gl-spec">${trace}</span></div>` : "");
      stats.innerHTML = `<div class="sd-stat"><span>tokens per big-model step</span><b>${expTokens(st.alpha, st.k).toFixed(2)}</b></div><div class="sd-stat ${sp > 1.5 ? "ok" : sp > 1 ? "warn" : "bad"}"><span>wall-clock speedup</span><b>${sp.toFixed(2)}×</b></div>
        <div class="sd-stat"><span>best k for this α</span><b>${ks.reduce((b, k) => (speed(st.alpha, k, st.cost) > speed(st.alpha, b, st.cost) ? k : b), 1)}</b></div>`;
    };
    $$('input[type="range"]', c).forEach((i) => (i.oninput = () => { st[i.dataset.k] = +i.value; i.nextElementSibling.textContent = i.dataset.k === "k" ? i.value : (+i.value).toFixed(2); trace = null; draw(); }));
    $('[data-a="trace"]', c).onclick = () => {
      const rnd = mulberry32(300 + round++); let accepted = 0, parts = [];
      for (let i = 0; i < st.k; i++) { if (rnd() < st.alpha) { accepted++; parts.push(`<b class="ok">✓ d${i + 1}</b>`); } else { parts.push(`<b class="no">✗ d${i + 1}</b>`); break; } }
      parts.push(`<b class="bonus">+1 from the big model</b>`);
      trace = parts.join(" ") + ` → <b>${accepted + 1} token${accepted ? "s" : ""}</b> from one big-model pass`; draw();
    };
    draw();
  });

  /* ================================================================ GPU sizing and decode speed */
  sim("gpusize", "GPU sizing", "gpu", (body, cfg) => {
    const st = { model: "Llama-style 8B (GQA)", bits: 16, gpu: "H100 (80 GB)", n: 1, ctx: 4096, batch: 16 };
    const c = ctrl(`<label>Model <select data-k="model">${Object.keys(MODELS).map((k) => `<option>${k}</option>`).join("")}</select></label>
      <label>Weights <select data-k="bits"><option value="16">16-bit</option><option value="8">8-bit</option><option value="4">4-bit</option></select></label>
      <label>GPU <select data-k="gpu">${Object.keys(GPUS).map((k) => `<option ${k === st.gpu ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      <label>GPUs <select data-k="n"><option>1</option><option>2</option><option>4</option><option>8</option></select></label>
      <label>Context <select data-k="ctx"><option>2048</option><option selected>4096</option><option>16384</option><option>65536</option><option>131072</option></select></label>
      <label>Concurrent requests <input type="range" min="1" max="128" value="${st.batch}" data-k="batch"><output>${st.batch}</output></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Decoding is memory-bandwidth bound: each step must read all the weights (and every sequence's KV cache) from GPU memory, so tokens/s per request ≈ bandwidth ÷ bytes read per step. Batching shares one weight read between many requests, which is why serving throughput scales with batch size until compute or memory runs out. Approximate hardware specs; real systems reach 50–80% of this ceiling.</div>`));
    const draw = () => {
      const M = MODELS[st.model], G = GPUS[st.gpu], bytesW = st.bits / 8;
      const weights = M.params * bytesW, memTotal = G.mem * 1e9 * st.n * 0.9, kvPerSeq = kvBytesPerToken(M, 2) * st.ctx;
      const free = memTotal - weights, maxConc = Math.max(0, Math.floor(free / kvPerSeq)), conc = Math.min(st.batch, Math.max(1, maxConc));
      const bw = G.bw * 1e12 * st.n * 0.7;                                    // 70% achievable (and perfect scaling across GPUs: optimistic)
      const bytesPerStep = weights + conc * kvPerSeq, stepsPerSec = bw / bytesPerStep;
      const perReq = stepsPerSec, agg = stepsPerSec * conc;
      stage.innerHTML = `<div class="gl-label">Memory: weights ${fmtGB(weights / 1e9)} + KV for ${st.batch} requests × ${fmtN(st.ctx)} tokens = ${fmtGB((st.batch * kvPerSeq) / 1e9)} (capacity ${fmtGB(memTotal / 1e9)})</div>
        <div class="gl-stack" style="height:30px"><i style="width:${Math.min(100, (weights / memTotal) * 100)}%;background:var(--n2)"></i><i style="width:${Math.min(100, ((st.batch * kvPerSeq) / memTotal) * 100)}%;background:var(--n6)"></i><i style="flex:1;background:var(--surface-2)"></i></div>
        <div class="gl-legend"><span><i style="background:var(--n2)"></i>weights</span><span><i style="background:var(--n6)"></i>KV cache (requested concurrency)</span></div>`;
      const fits = weights < memTotal;
      stats.innerHTML = `<div class="sd-stat ${fits ? "ok" : "bad"}"><span>weights fit?</span><b>${fits ? "yes" : "NO: add GPUs or quantise"}</b></div><div class="sd-stat ${maxConc >= st.batch ? "ok" : "warn"}"><span>max concurrent at this context</span><b>${fits ? maxConc : 0}</b></div>
        <div class="sd-stat"><span>speed per request (decode)</span><b>${fits ? perReq.toFixed(0) : "–"} tok/s</b></div><div class="sd-stat"><span>aggregate throughput</span><b>${fits ? fmtN(agg) : "–"} tok/s</b></div>
        <div class="sd-stat"><span>tokens per second per GPU</span><b>${fits ? fmtN(agg / st.n) : "–"}</b></div>`;
    };
    $$("[data-k]", c).forEach((i) => (i.oninput = i.onchange = () => { const k = i.dataset.k; st[k] = k === "model" || k === "gpu" ? i.value : +i.value; if (k === "batch") i.nextElementSibling.textContent = st.batch; draw(); }));
    draw();
  });
})();
