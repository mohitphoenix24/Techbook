/* ==========================================================================
   ScaleLab simulators — interactive ```viz blocks (load balancer, consistent
   hashing, rate limiters, caches, replication, Raft, quorums, ...).
   Each one registers with sim(name, kicker, icon, build(body, cfg, meta)).
   cfg holds "key = value" lines from the viz block.
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, inl, S, $, $$, clamp, UI, reduced } = window.VIZ.SIM;

  /* ---------------------------------------------------------------- formatting helpers */
  const fmtNum = (n, d = 1) => {
    if (!isFinite(n)) return "∞";
    const a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(d).replace(/\.0+$/, "") + " T";
    if (a >= 1e9) return (n / 1e9).toFixed(d).replace(/\.0+$/, "") + " B";
    if (a >= 1e6) return (n / 1e6).toFixed(d).replace(/\.0+$/, "") + " M";
    if (a >= 1e4) return (n / 1e3).toFixed(d).replace(/\.0+$/, "") + " K";
    return (Math.round(n * 10) / 10).toLocaleString("en-US");
  };
  const fmtBytes = (b) => {
    const u = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
    let i = 0;
    while (Math.abs(b) >= 1000 && i < u.length - 1) { b /= 1000; i++; }
    return `${b >= 100 ? Math.round(b) : b >= 10 ? b.toFixed(1).replace(/\.0$/, "") : b.toFixed(2).replace(/\.?0+$/, "")} ${u[i]}`;
  };
  const fmtDur = (sec) => {
    if (sec < 1e-6) return `${+(sec * 1e9).toPrecision(3)} ns`;
    if (sec < 1e-3) return `${+(sec * 1e6).toPrecision(3)} µs`;
    if (sec < 1) return `${+(sec * 1e3).toPrecision(3)} ms`;
    if (sec < 120) return `${+sec.toPrecision(3)} s`;
    if (sec < 7200) return `${+(sec / 60).toPrecision(3)} min`;
    if (sec < 172800) return `${+(sec / 3600).toPrecision(3)} hours`;
    if (sec < 86400 * 365 * 2) return `${+(sec / 86400).toPrecision(3)} days`;
    return `${+(sec / 86400 / 365).toPrecision(3)} years`;
  };
  window.VIZ.SIM.fmt = { fmtNum, fmtBytes, fmtDur };
  const ctrl = (html) => el(`<div class="sd-ctrls">${html}</div>`);

  /* ---------------------------------------------------------------- latency numbers */
  sim("latency", "Latency numbers", "clock", (body) => {
    const ROWS = [
      ["L1 cache reference", 1e-9, "cpu"], ["Branch mispredict", 3e-9, "cpu"], ["L2 cache reference", 4e-9, "cpu"],
      ["Mutex lock / unlock", 17e-9, "cpu"], ["Main memory (RAM) reference", 100e-9, "mem"],
      ["Compress 1 KB (fast codec)", 2e-6, "cpu"], ["Read 1 MB sequentially from RAM", 3e-6, "mem"],
      ["Send 2 KB over a 10 Gbps network", 2e-6, "net"], ["SSD random read (4 KB)", 16e-6, "disk"],
      ["Read 1 MB sequentially from SSD", 49e-6, "disk"], ["Round trip inside one datacenter", 500e-6, "net"],
      ["Read 1 MB sequentially from HDD", 825e-6, "disk"], ["HDD disk seek", 2e-3, "disk"],
      ["Round trip US East ↔ US West", 40e-3, "net"], ["Round trip California ↔ Netherlands", 150e-3, "net"],
    ];
    const c = ctrl(`<div class="sd-seg"><button class="on" data-m="real">Real time</button><button data-m="human">If 1 ns were 1 second</button></div><span class="sd-note-inline" style="font-size:12.5px;color:var(--muted)">Log scale: each grid line is 10× slower.</span>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const col = { cpu: "var(--n3)", mem: "var(--n2)", disk: "var(--n6)", net: "var(--n7)" };
    let mode = "real";
    const draw = () => {
      const lo = Math.log10(1e-9), hi = Math.log10(0.2);
      stage.innerHTML = `<div class="lat-grid">${ROWS.map(([name, t, k]) => {
        const w = ((Math.log10(t) - lo) / (hi - lo)) * 100;
        const label = mode === "real" ? fmtDur(t) : fmtDur(t * 1e9);
        return `<div class="lat-row"><span class="lat-name">${esc(name)}</span><span class="lat-bar"><i style="width:${Math.max(1.5, w)}%;background:${col[k]}"></i></span><span class="lat-val">${label}</span></div>`;
      }).join("")}</div>
      <div class="sd-legend" style="padding:10px 0 0">${[["cpu", "CPU"], ["mem", "memory"], ["disk", "disk"], ["net", "network"]].map(([k, t]) => `<span><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${col[k]}"></i>${t}</span>`).join("")}</div>`;
    };
    $$("button", c).forEach((b) => (b.onclick = () => { mode = b.dataset.m; $$("button", c).forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
    draw();
  });

  /* ---------------------------------------------------------------- back-of-the-envelope estimator */
  sim("estimate", "Estimation calculator", "chart", (body, cfg) => {
    const PRESETS = {
      custom: null,
      twitter: { dau: 200e6, writes: 2, ratio: 100, size: 1000, media: 0.1, msize: 500e3, years: 5, peak: 3 },
      url: { dau: 10e6, writes: 1, ratio: 100, size: 500, media: 0, msize: 0, years: 10, peak: 3 },
      chat: { dau: 500e6, writes: 40, ratio: 1, size: 200, media: 0.05, msize: 200e3, years: 5, peak: 2 },
      video: { dau: 50e6, writes: 0.01, ratio: 1000, size: 2000, media: 1, msize: 300e6, years: 5, peak: 3 },
    };
    const v = {
      dau: +cfg.dau || 100e6, writes: +cfg.writes || 2, ratio: +cfg.ratio || 10, size: +cfg.size || 1000,
      media: +(cfg.media ?? 0), msize: +cfg.msize || 0, years: +cfg.years || 5, peak: +cfg.peak || 2,
    };
    const fields = [
      ["dau", "Daily active users"], ["writes", "Writes per user per day"], ["ratio", "Reads per write"],
      ["size", "Bytes per record"], ["media", "Share of writes with media"], ["msize", "Bytes per media file"],
      ["years", "Keep data for (years)"], ["peak", "Peak ÷ average traffic"],
    ];
    const c = ctrl(`<label>Preset <select data-k="preset">
        <option value="custom">Custom</option><option value="twitter">Twitter-like feed</option><option value="url">URL shortener</option><option value="chat">Chat app</option><option value="video">Video platform</option></select></label>` +
      fields.map(([k, t]) => `<label>${t} <input type="number" data-k="${k}" min="0" step="any" value="${v[k]}"></label>`).join(""));
    body.appendChild(c);
    const out = el(`<div class="sd-stage"></div>`);
    body.appendChild(out);
    const draw = () => {
      const day = 86400;
      const wps = (v.dau * v.writes) / day, rps = wps * v.ratio;
      const textDay = v.dau * v.writes * v.size, mediaDay = v.dau * v.writes * v.media * v.msize;
      const storeDay = textDay + mediaDay, total = storeDay * 365 * v.years;
      const inBw = storeDay / day, outBw = (inBw * v.ratio);
      const row = (k, val, how) => `<tr><td>${k}</td><td class="num"><b>${val}</b></td><td class="how">${how}</td></tr>`;
      out.innerHTML = `<table class="sd-table est"><tbody>
        ${row("Write QPS (average)", fmtNum(wps), `${fmtNum(v.dau)} users × ${v.writes} ÷ 86,400 s`)}
        ${row("Write QPS (peak)", fmtNum(wps * v.peak), `average × ${v.peak}`)}
        ${row("Read QPS (average)", fmtNum(rps), `writes × ${v.ratio}`)}
        ${row("Read QPS (peak)", fmtNum(rps * v.peak), `average × ${v.peak}`)}
        ${row("New data per day", fmtBytes(storeDay), `records ${fmtBytes(textDay)} + media ${fmtBytes(mediaDay)}`)}
        ${row(`Storage for ${v.years} years`, fmtBytes(total), `per day × 365 × ${v.years} (before replication ×3)`)}
        ${row("Ingress bandwidth", fmtBytes(inBw) + "/s", "new data per day ÷ 86,400 s")}
        ${row("Egress bandwidth", fmtBytes(outBw) + "/s", `ingress × ${v.ratio} reads per write`)}
        ${row("App servers (peak reads)", fmtNum(Math.ceil((rps * v.peak) / 1000)), "assuming ~1,000 QPS per server")}
      </tbody></table>`;
    };
    $$("input", c).forEach((inp) => (inp.oninput = () => { v[inp.dataset.k] = Math.max(0, +inp.value || 0); $('[data-k="preset"]', c).value = "custom"; draw(); }));
    $('[data-k="preset"]', c).onchange = (e) => {
      const pr = PRESETS[e.target.value];
      if (!pr) return;
      Object.assign(v, pr);
      $$("input", c).forEach((inp) => (inp.value = v[inp.dataset.k]));
      draw();
    };
    draw();
  });


  // deterministic pseudo-random numbers (Park–Miller), so simulations replay identically
  const rng = (seed = 7) => { let x = seed % 2147483647 || 1; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
  window.VIZ.SIM.rng = rng;

  /* ---------------------------------------------------------------- load balancer */
  sim("lb", "Load balancer simulator", "lb", (body, cfg) => {
    const N = clamp(+cfg.servers || 4, 2, 6);
    const ALGOS = { rr: "Round robin", wrr: "Weighted round robin", least: "Least connections", hash: "IP hash", random: "Random", p2c: "Power of two choices" };
    const st = { algo: cfg.algo || "rr", rate: +cfg.rate || 6, longPct: +(cfg.long ?? 10), running: false };
    const weights = (cfg.weights || "3,1,1,1,1,1").split(",").map(Number).slice(0, N);
    let servers, rnd, tick, rrI, wrrState, log;
    const reset = () => {
      servers = Array.from({ length: N }, (_, i) => ({ i, up: true, healthy: true, active: [], served: 0, w: weights[i] || 1 }));
      rnd = rng(13); tick = 0; rrI = 0; wrrState = servers.map(() => 0); log = [];
    };
    reset();
    const c = ctrl(`<label>Algorithm <select data-k="algo">${Object.entries(ALGOS).map(([k, v]) => `<option value="${k}" ${k === st.algo ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label>Requests / tick <input type="range" min="1" max="14" value="${st.rate}" data-k="rate"><output>${st.rate}</output></label>
      <label>Slow requests <input type="range" min="0" max="40" value="${st.longPct}" data-k="longPct"><output>${st.longPct}%</output></label>
      <button class="sd-btn primary" data-a="run">${UI.play} Run</button><button class="sd-btn" data-a="step">+1 tick</button><button class="sd-btn" data-a="reset">${UI.reset} Reset</button>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"><div class="lb-top"><span class="lb-box">${window.VIZ.SIM.icon("lb")} Load balancer <small></small></span></div><div class="lb-servers"></div></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Click a server to crash or restore it. The health check notices a crash after one tick. Weights (for weighted round robin): ${servers.map((s) => s.w).join(", ")}.</div>`));
    const healthy = () => servers.filter((s) => s.healthy);
    const pick = (clientId) => {
      const hs = healthy();
      if (!hs.length) return null;
      switch (st.algo) {
        case "rr": { const s = hs[rrI % hs.length]; rrI++; return s; }
        case "wrr": {               // smooth weighted round robin (as in Nginx)
          let best = null, total = 0;
          hs.forEach((s) => { wrrState[s.i] += s.w; total += s.w; if (!best || wrrState[s.i] > wrrState[best.i]) best = s; });
          wrrState[best.i] -= total; return best;
        }
        case "least": return hs.reduce((a, b) => (b.active.length < a.active.length ? b : a));
        case "hash": { let h = 2166136261; for (const ch of "client-" + clientId) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return hs[h % hs.length]; }
        case "random": return hs[Math.floor(rnd() * hs.length)];
        case "p2c": { const a = hs[Math.floor(rnd() * hs.length)], b = hs[Math.floor(rnd() * hs.length)]; return a.active.length <= b.active.length ? a : b; }
      }
    };
    let dropped = 0;
    const step = () => {
      tick++;
      servers.forEach((s) => { s.active = s.up ? s.active.map((d) => d - 1).filter((d) => d > 0) : []; });
      for (let k = 0; k < st.rate; k++) {
        const client = Math.floor(Math.pow(rnd(), 2) * 12);              // a few clients are much more active
        const s = pick(client);
        if (!s) { dropped++; continue; }
        if (!s.up) { dropped++; log.unshift({ cls: "bad", t: `tick ${tick}: request sent to crashed server ${s.i + 1} → 502 (health check hasn't noticed yet)` }); continue; }
        const dur = rnd() * 100 < st.longPct ? 12 + Math.floor(rnd() * 10) : 1 + Math.floor(rnd() * 3);
        s.active.push(dur); s.served++;
      }
      servers.forEach((s) => (s.healthy = s.up));          // the health check runs at the end of the tick
      draw();
    };
    const draw = () => {
      const maxA = Math.max(8, ...servers.map((s) => s.active.length));
      $(".lb-servers", stage).innerHTML = servers.map((s) => {
        const load = s.active.length, over = load > 10 * (st.algo === "wrr" ? s.w : 1);
        return `<button class="lb-srv ${s.up ? "" : "down"} ${over ? "hot" : ""}" data-i="${s.i}" title="Click to ${s.up ? "crash" : "restore"} this server">
          <span class="lb-name">${window.VIZ.SIM.icon("server")} Server ${s.i + 1}${st.algo === "wrr" ? ` <small>w=${s.w}</small>` : ""}</span>
          <span class="lb-meter"><i style="height:${(load / maxA) * 100}%"></i></span>
          <span class="lb-num"><b>${s.up ? load : "✕"}</b> ${s.up ? "in flight" : "crashed"}</span>
          <span class="lb-served">${s.served} served</span></button>`;
      }).join("");
      drawStats();
    };
    // server cards are redrawn on every tick: one delegated pointerdown listener survives that
    $(".lb-servers", stage).addEventListener("pointerdown", (e) => {
      const b = e.target.closest(".lb-srv");
      if (!b) return;
      const s = servers[+b.dataset.i];
      s.up = !s.up;
      if (!s.up) { dropped += s.active.length; s.active = []; }   // in-flight requests on it are lost
      else s.healthy = false;                                     // back in rotation after the next health check
      draw();
    });
    const drawStats = () => {
      const loads = servers.filter((s) => s.up).map((s) => s.active.length);
      const served = servers.map((s) => s.served);
      $(".lb-box small", stage).textContent = `${ALGOS[st.algo]} · tick ${tick}`;
      stats.innerHTML = `<div class="sd-stat"><span>busiest now</span><b>${loads.length ? Math.max(...loads) : 0}</b></div>
        <div class="sd-stat"><span>least busy now</span><b>${loads.length ? Math.min(...loads) : 0}</b></div>
        <div class="sd-stat ${dropped ? "bad" : ""}"><span>failed</span><b>${dropped}</b></div>
        <div class="sd-stat"><span>served max ÷ min</span><b>${Math.min(...served) ? (Math.max(...served) / Math.min(...served)).toFixed(2) : "–"}</b></div>`;
    };
    let timer = null;
    const runBtn = $('[data-a="run"]', c);
    const stop = () => { clearInterval(timer); timer = null; runBtn.innerHTML = `${UI.play} Run`; };
    runBtn.onclick = () => { if (timer) return stop(); runBtn.innerHTML = `${UI.pause} Pause`; timer = setInterval(() => { if (!body.isConnected) return stop(); step(); }, 450); };
    $('[data-a="step"]', c).onclick = step;
    $('[data-a="reset"]', c).onclick = () => { stop(); reset(); dropped = 0; draw(); };
    $$("select, input", c).forEach((inp) => (inp.oninput = inp.onchange = () => {
      st[inp.dataset.k] = inp.tagName === "SELECT" ? inp.value : +inp.value;
      if (inp.nextElementSibling && inp.nextElementSibling.tagName === "OUTPUT") inp.nextElementSibling.textContent = inp.value + (inp.dataset.k === "longPct" ? "%" : "");
      if (inp.dataset.k === "algo") { reset(); dropped = 0; }
      draw();
    }));
    for (let i = 0; i < 12; i++) step();
  });

  /* ---------------------------------------------------------------- cache eviction */
  sim("cache", "Cache eviction", "cache", (body, cfg) => {
    const st = { cap: +cfg.capacity || 3, policy: cfg.policy || "LRU", seq: (cfg.sequence || "A B C A D B A E A C F A B").trim() };
    const c = ctrl(`<label>Policy <span class="sd-seg" data-k="policy">${["LRU", "LFU", "FIFO"].map((p) => `<button data-v="${p}" class="${p === st.policy ? "on" : ""}">${p}</button>`).join("")}</span></label>
      <label>Capacity <input type="range" min="2" max="6" value="${st.cap}" data-k="cap"><output>${st.cap}</output></label>
      <label style="flex:1 1 260px">Requests <input type="text" data-k="seq" value="${esc(st.seq)}" style="flex:1;font-family:var(--mono)"></label>
      <button class="sd-btn" data-a="zipf">Skewed workload</button>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"><div class="ce-seq"></div><div class="ce-slots"></div></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    let frames = [];
    const simulate = (seq, cap, policy) => {
      const cache = [];      // {k, freq, t (last use), ins (insert time)}
      const out = [];
      let hits = 0;
      seq.forEach((k, t) => {
        const e = cache.find((x) => x.k === k);
        let evicted = null, hit = !!e;
        if (e) { hits++; e.freq++; e.t = t; }
        else {
          if (cache.length >= cap) {
            let victim;
            if (policy === "LRU") victim = cache.reduce((a, b) => (b.t < a.t ? b : a));
            else if (policy === "LFU") victim = cache.reduce((a, b) => (b.freq < a.freq || (b.freq === a.freq && b.t < a.t) ? b : a));
            else victim = cache.reduce((a, b) => (b.ins < a.ins ? b : a));
            evicted = victim.k;
            cache.splice(cache.indexOf(victim), 1);
          }
          cache.push({ k, freq: 1, t, ins: t });
        }
        out.push({ k, hit, evicted, cache: cache.map((x) => ({ ...x })), hits, n: t + 1 });
      });
      return out;
    };
    let player;
    const order = (cache, policy) => policy === "LRU" ? [...cache].sort((a, b) => b.t - a.t) : policy === "LFU" ? [...cache].sort((a, b) => b.freq - a.freq || b.t - a.t) : [...cache].sort((a, b) => b.ins - a.ins);
    const render = (i) => {
      const seq = st.seq.split(/[\s,]+/).filter(Boolean);
      const f = frames[i < 0 ? frames.length - 1 : i];
      $(".ce-seq", stage).innerHTML = seq.map((k, j) => `<span class="ce-req ${j > (i < 0 ? frames.length - 1 : i) ? "future" : frames[j].hit ? "hit" : "miss"} ${j === i ? "cur" : ""}">${esc(k)}</span>`).join("");
      if (!f) { $(".ce-slots", stage).innerHTML = ""; return ""; }
      const ord = order(f.cache, st.policy);
      const label = st.policy === "LRU" ? ["most recent", "least recent → evicted next"] : st.policy === "LFU" ? ["most used", "least used → evicted next"] : ["newest", "oldest → evicted next"];
      $(".ce-slots", stage).innerHTML = `<span class="ce-end">${label[0]}</span>${ord.map((x) => `<span class="ce-slot ${x.k === f.k ? (f.hit ? "hit" : "new") : ""}"><b>${esc(x.k)}</b><small>${st.policy === "LFU" ? `used ${x.freq}×` : st.policy === "LRU" ? `used t=${x.t + 1}` : `in t=${x.ins + 1}`}</small></span>`).join("")}${Array.from({ length: st.cap - ord.length }, () => `<span class="ce-slot empty">empty</span>`).join("")}<span class="ce-end">${label[1]}</span>`;
      stats.innerHTML = `<div class="sd-stat ok"><span>hits</span><b>${f.hits}</b></div><div class="sd-stat bad"><span>misses</span><b>${f.n - f.hits}</b></div><div class="sd-stat"><span>hit ratio</span><b>${Math.round((f.hits / f.n) * 100)}%</b></div>
        <div class="sd-stat"><span>same requests, all policies</span><b style="font-size:13px">${["LRU", "LFU", "FIFO"].map((p) => { const r = simulate(seq, st.cap, p).at(-1); return `${p} ${Math.round((r.hits / r.n) * 100)}%`; }).join(" · ")}</b></div>`;
      if (i < 0) return `Showing the final state after all ${frames.length} requests. Press ▶ to replay them one at a time.`;
      return `<span class="sd-stepno">${i + 1}</span> GET <b>${esc(f.k)}</b>: ${f.hit ? `<strong>hit</strong>, served from memory.` : `<strong>miss</strong>: load it from the database${f.evicted ? `, and evict <b>${esc(f.evicted)}</b> (${st.policy === "LRU" ? "least recently used" : st.policy === "LFU" ? "least frequently used" : "oldest inserted"}) to make room` : ", and store it (there's a free slot)"}.`}`;
    };
    const rebuild = () => {
      const seq = st.seq.split(/[\s,]+/).filter(Boolean).slice(0, 40);
      frames = simulate(seq, st.cap, st.policy);
      if (player) { player.stop(); player.wrap.remove(); }
      player = window.VIZ.SIM.stepper(body, { count: frames.length, render, autoMs: 900 });
      body.appendChild(stats);
    };
    $$(".sd-seg button", c).forEach((b) => (b.onclick = () => { st.policy = b.dataset.v; $$(".sd-seg button", c).forEach((x) => x.classList.toggle("on", x === b)); rebuild(); }));
    $('[data-k="cap"]', c).oninput = (e) => { st.cap = +e.target.value; e.target.nextElementSibling.textContent = st.cap; rebuild(); };
    $('[data-k="seq"]', c).onchange = (e) => { st.seq = e.target.value.toUpperCase(); rebuild(); };
    $('[data-a="zipf"]', c).onclick = () => {
      const r = rng(Math.floor(Math.random() * 1e6) + 1), keys = "ABCDEFGHIJ";
      // Zipf-like: key k is chosen with probability ∝ 1/(k+1)
      const w = [...keys].map((_, i) => 1 / (i + 1)), tot = w.reduce((a, b) => a + b, 0);
      st.seq = Array.from({ length: 36 }, () => { let x = r() * tot; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return keys[i]; } return "J"; }).join(" ");
      $('[data-k="seq"]', c).value = st.seq;
      rebuild();
    };
    rebuild();
  });

  /* ---------------------------------------------------------------- rate limiter */
  sim("ratelimit", "Rate limiter", "shield", (body, cfg) => {
    const T = 10;                                   // seconds on the timeline
    const ALG = { token: "Token bucket", leaky: "Leaky bucket (queue)", fixed: "Fixed window counter", log: "Sliding window log", sliding: "Sliding window counter" };
    const PATTERNS = {
      steady: () => Array.from({ length: 20 }, (_, i) => 0.25 + i * 0.5),
      bursty: () => [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 3, 3.05, 3.1, 3.15, 3.2, 6.5, 6.55, 6.6, 6.65, 6.7, 6.75, 6.8, 6.85, 8.5, 9],
      edge: () => [1.8, 1.85, 1.9, 1.92, 1.95, 2.02, 2.05, 2.08, 2.1, 2.12, 5, 7],
      flood: () => Array.from({ length: 50 }, (_, i) => i * 0.2 + 0.1),
    };
    const st = { alg: cfg.algo || "token", limit: +cfg.limit || 4, win: +cfg.window || 2, reqs: PATTERNS[cfg.pattern || "bursty"]() };
    const c = ctrl(`<label>Algorithm <select data-k="alg">${Object.entries(ALG).map(([k, v]) => `<option value="${k}" ${k === st.alg ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label>Limit <input type="range" min="1" max="10" value="${st.limit}" data-k="limit"><output>${st.limit}</output></label>
      <label>per <input type="range" min="1" max="5" value="${st.win}" data-k="win"><output>${st.win} s</output></label>
      <label>Traffic <select data-k="pattern"><option value="bursty">Bursty</option><option value="steady">Steady</option><option value="edge">Burst at a window edge</option><option value="flood">Flood</option></select></label>
      <button class="sd-btn" data-a="clear">Clear</button>`);
    body.appendChild(c);
    if (cfg.pattern) $('[data-k="pattern"]', c).value = cfg.pattern;
    const stage = el(`<div class="sd-stage rl-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">Click on the timeline to add a request at that moment. Green = allowed, red = rejected with <code>429</code>${""}, amber = queued (leaky bucket).</div>`));
    const decide = () => {
      const reqs = [...st.reqs].sort((a, b) => a - b);
      const rate = st.limit / st.win;                // tokens or leaks per second
      const out = [], curve = [];
      if (st.alg === "token") {
        let tokens = st.limit, last = 0;
        const sample = (t) => Math.min(st.limit, tokens + (t - last) * rate);
        let ri = 0;
        for (let t = 0; t <= T + 1e-9; t += 0.05) {
          while (ri < reqs.length && reqs[ri] <= t) {
            const r = reqs[ri++];
            tokens = Math.min(st.limit, tokens + (r - last) * rate); last = r;
            if (tokens >= 1) { tokens -= 1; out.push({ t: r, ok: true }); } else out.push({ t: r, ok: false });
          }
          curve.push([t, sample(t)]);
        }
        return { out, curve, max: st.limit, label: "tokens in the bucket" };
      }
      if (st.alg === "leaky") {               // a queue of size `limit` that drains at a constant `rate`
        const q = [];
        let nextLeak = 0, ri = 0;
        for (let t = 0; t <= T + 1e-9; t += 0.05) {
          while (q.length && nextLeak <= t + 1e-9) { q.shift(); nextLeak += 1 / rate; }
          while (ri < reqs.length && reqs[ri] <= t) {
            const at = reqs[ri++];
            if (q.length < st.limit) { if (!q.length && nextLeak < at) nextLeak = at + 1 / rate; q.push(at); out.push({ t: at, ok: true, queued: true }); }
            else out.push({ t: at, ok: false });
          }
          curve.push([t, q.length]);
        }
        return { out, curve, max: st.limit, label: "requests waiting in the queue" };
      }
      if (st.alg === "fixed") {
        const counts = {};
        reqs.forEach((r) => { const w = Math.floor(r / st.win); counts[w] = (counts[w] || 0) + 1; out.push({ t: r, ok: counts[w] <= st.limit }); });
        for (let t = 0; t <= T + 1e-9; t += 0.05) { const w = Math.floor(t / st.win); curve.push([t, Math.min(st.limit + 1, reqs.filter((r) => r <= t && Math.floor(r / st.win) === w).length)]); }
        return { out, curve, max: st.limit + 1, label: "count in the current window", windows: true };
      }
      if (st.alg === "log") {
        const accepted = [];
        reqs.forEach((r) => {
          const inWin = accepted.filter((a) => a > r - st.win).length;
          if (inWin < st.limit) { accepted.push(r); out.push({ t: r, ok: true }); } else out.push({ t: r, ok: false });
        });
        for (let t = 0; t <= T + 1e-9; t += 0.05) curve.push([t, accepted.filter((a) => a <= t && a > t - st.win).length]);
        return { out, curve, max: st.limit, label: "accepted requests in the last window" };
      }
      // sliding window counter: weighted previous window + current window
      const counts = {};
      const est = (r) => { const w = Math.floor(r / st.win), into = (r - w * st.win) / st.win; return (counts[w - 1] || 0) * (1 - into) + (counts[w] || 0); };
      reqs.forEach((r) => {
        const w = Math.floor(r / st.win);
        if (est(r) + 1 <= st.limit) { counts[w] = (counts[w] || 0) + 1; out.push({ t: r, ok: true }); } else out.push({ t: r, ok: false });
      });
      for (let t = 0; t <= T + 1e-9; t += 0.05) curve.push([t, est(t)]);
      return { out, curve, max: st.limit, label: "estimated count (previous × overlap + current)", windows: true };
    };
    const W = 680, H = 204, X0 = 34, X1 = W - 12, Y0 = 26, YB = 62, CY0 = 110, CY1 = 188;
    const xOf = (t) => X0 + (t / T) * (X1 - X0);
    const draw = () => {
      const r = decide();
      const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" class="rl-svg">
        ${r.windows ? Array.from({ length: Math.ceil(T / st.win) }, (_, k) => `<rect x="${xOf(k * st.win)}" y="${Y0 - 14}" width="${xOf(st.win) - X0}" height="${CY1 - Y0 + 14}" class="rl-win ${k % 2 ? "odd" : ""}"/>`).join("") : ""}
        <line x1="${X0}" y1="${YB}" x2="${X1}" y2="${YB}" class="rl-axis"/>
        ${Array.from({ length: T + 1 }, (_, s2) => `<line x1="${xOf(s2)}" x2="${xOf(s2)}" y1="${YB - 4}" y2="${YB + 4}" class="rl-axis"/><text x="${xOf(s2)}" y="${YB + 17}" text-anchor="middle" class="rl-t">${s2}s</text>`).join("")}
        ${r.out.map((o, i) => `<circle cx="${xOf(o.t)}" cy="${YB - 14 - (i % 3) * 7}" r="5" class="rl-req ${o.ok ? (o.queued ? "q" : "ok") : "no"}"/>`).join("")}
        <text x="${X0}" y="${CY0 - 6}" class="rl-t">${esc(r.label)}</text>
        <line x1="${X0}" y1="${CY1}" x2="${X1}" y2="${CY1}" class="rl-axis"/>
        <line x1="${X0}" y1="${CY1 - ((st.alg === "fixed" ? st.limit : r.max) / r.max) * (CY1 - CY0)}" x2="${X1}" y2="${CY1 - ((st.alg === "fixed" ? st.limit : r.max) / r.max) * (CY1 - CY0)}" class="rl-limit"/>
        <path d="${r.curve.map(([t, v], i) => `${i ? "L" : "M"}${xOf(t).toFixed(1)},${(CY1 - (Math.min(v, r.max) / r.max) * (CY1 - CY0)).toFixed(1)}`).join(" ")}" class="rl-curve"/>
        <rect x="${X0}" y="0" width="${X1 - X0}" height="${YB + 6}" fill="transparent" class="rl-hit"/>
      </svg>`;
      stage.innerHTML = svg;
      $(".rl-hit", stage).onclick = (e) => {
        const svgEl = $("svg", stage), pt = svgEl.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svgEl.getScreenCTM().inverse());
        const t = clamp(Math.round(((p.x - X0) / (X1 - X0)) * T * 20) / 20, 0, T);
        st.reqs.push(t); draw();
      };
      const ok = r.out.filter((o) => o.ok).length;
      let worst = 0;                                // max accepted in any window-length interval
      const acc = r.out.filter((o) => o.ok).map((o) => o.t).sort((a, b) => a - b);
      for (let i = 0, j = 0; i < acc.length; i++) { while (acc[i] - acc[j] >= st.win) j++; worst = Math.max(worst, i - j + 1); }
      stats.innerHTML = `<div class="sd-stat ok"><span>allowed</span><b>${ok}</b></div><div class="sd-stat bad"><span>rejected (429)</span><b>${r.out.length - ok}</b></div>
        <div class="sd-stat ${worst > st.limit ? "warn" : ""}"><span>most allowed in any ${st.win}s span</span><b>${worst}${worst > st.limit ? ` (limit ${st.limit}!)` : ""}</b></div>`;
    };
    $$("select, input", c).forEach((inp) => (inp.oninput = inp.onchange = () => {
      const k = inp.dataset.k;
      if (k === "pattern") st.reqs = PATTERNS[inp.value]();
      else st[k] = inp.tagName === "SELECT" ? inp.value : +inp.value;
      if (inp.nextElementSibling && inp.nextElementSibling.tagName === "OUTPUT") inp.nextElementSibling.textContent = inp.value + (k === "win" ? " s" : "");
      draw();
    }));
    $('[data-a="clear"]', c).onclick = () => { st.reqs = []; draw(); };
    draw();
  });


  // FNV-1a 32-bit hash of a string (same as the C++/JS lesson code)
  // FNV-1a + MurmurHash3 finaliser (well-mixed, same as the consistent hashing lesson code)
  const fnv32 = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  };
  window.VIZ.SIM.fnv32 = fnv32;
  const PALETTE = ["var(--n1)", "var(--n7)", "var(--n5)", "var(--n6)", "var(--n2)", "var(--n3)", "var(--n4)", "var(--n8)"];

  /* ---------------------------------------------------------------- replication */
  sim("replication", "Replication", "db", (body, cfg) => {
    const st = { mode: cfg.mode || "async", lag: +cfg.lag || 1500, ryw: false };
    const c = ctrl(`<label>Mode <span class="sd-seg" data-k="mode">${[["async", "Asynchronous"], ["semisync", "Semi-sync"], ["sync", "Synchronous"]].map(([k, v]) => `<button data-v="${k}" class="${k === st.mode ? "on" : ""}">${v}</button>`).join("")}</span></label>
      <label>Replication lag <input type="range" min="100" max="4000" step="100" value="${st.lag}" data-k="lag"><output>${st.lag} ms</output></label>
      <label><input type="checkbox" data-k="ryw"> Read-your-writes (read from primary for 5 s after my write)</label>`);
    body.appendChild(c);
    const acts = el(`<div class="sd-ctrls" style="border-bottom:0;background:none"><button class="sd-btn primary" data-a="write">✎ Write new value</button><button class="sd-btn" data-a="read">Read (load-balanced to a replica)</button><button class="sd-btn danger" data-a="kill">✕ Crash the primary</button><button class="sd-btn" data-a="reset">${UI.reset} Reset</button></div>`);
    body.appendChild(acts);
    const stage = el(`<div class="sd-stage"><svg viewBox="0 0 640 230" class="rep-svg"></svg></div>`);
    body.appendChild(stage);
    const logEl = el(`<div class="sd-log"></div>`);
    body.appendChild(logEl);
    const svg = $("svg", stage);
    let nodes, msgs, version, pendingAck, lastWriteAt, raf, t0;
    const now = () => performance.now() - t0;
    const log = (cls, t) => { logEl.insertAdjacentHTML("afterbegin", `<div class="${cls}">[${(now() / 1000).toFixed(1)}s] ${t}</div>`); };
    const reset = () => {
      t0 = performance.now();
      nodes = [{ name: "Primary", x: 320, y: 50, v: 1, up: true, primary: true }, { name: "Replica A", x: 140, y: 185, v: 1, up: true }, { name: "Replica B", x: 500, y: 185, v: 1, up: true }];
      msgs = []; version = 1; pendingAck = null; lastWriteAt = -1e9; logEl.innerHTML = "";
      log("", "All three nodes hold <b>v1</b> of the user's profile.");
    };
    reset();
    const primary = () => nodes.find((n) => n.primary && n.up);
    const write = () => {
      const p = primary();
      if (!p) return log("bad", "No primary yet: write rejected (failover in progress).");
      if (pendingAck) return log("warn", "Still waiting for the previous write to be acknowledged…");
      version++;
      p.v = version;
      lastWriteAt = now();
      const jitter = () => st.lag * (0.75 + Math.random() * 0.5);
      nodes.filter((n) => n !== p && n.up).forEach((n) => msgs.push({ from: p, to: n, v: version, sent: now(), at: now() + jitter() }));
      if (st.mode === "async") log("hot", `Client wrote <b>v${version}</b>. Primary acknowledged at once; replicas will catch up later.`);
      else { pendingAck = { v: version, need: st.mode === "sync" ? nodes.filter((n) => n !== p && n.up).length : 1, got: 0, start: now() }; log("hot", `Client wrote <b>v${version}</b>. Waiting for ${st.mode === "sync" ? "all replicas" : "one replica"} before acknowledging…`); }
    };
    const read = () => {
      const p = primary();
      const ryw = st.ryw && now() - lastWriteAt < 5000 && p;
      const replicas = nodes.filter((n) => !n.primary && n.up);
      const target = ryw ? p : replicas.length ? replicas[Math.floor(Math.random() * replicas.length)] : p;
      if (!target) return log("bad", "No node available to read from.");
      const stale = target.v < version;
      log(stale ? "bad" : "ok", `Read from <b>${target.name}</b> → v${target.v}${stale ? `  ✕ STALE: you wrote v${version}!` : "  ✓ latest"}${ryw ? " (read-your-writes routed this to the primary)" : ""}`);
    };
    const kill = () => {
      const p = primary();
      if (!p) return;
      p.up = false; p.primary = false;
      const unsent = msgs.filter((m) => m.from === p).length;
      msgs = msgs.filter((m) => m.from !== p);              // changes still in its outgoing buffer die with it
      log("bad", `Primary crashed holding v${p.v}.${unsent ? ` ${unsent} replication message${unsent > 1 ? "s" : ""} never left it.` : ""}`);
      setTimeout(() => {
        if (!body.isConnected) return;
        const cands = nodes.filter((n) => n.up);
        if (!cands.length) return;
        const best = cands.reduce((a, b) => (b.v > a.v ? b : a));
        best.primary = true;
        msgs = msgs.filter((m) => m.from.up);
        const lost = version - best.v;
        log(lost ? "bad" : "ok", `Failover: <b>${best.name}</b> (has v${best.v}) is promoted to primary. ${lost ? `<b>${lost} acknowledged write${lost > 1 ? "s" : ""} LOST</b> (they never reached a replica).` : "No acknowledged write was lost."}`);
        version = best.v;
        if (pendingAck) { log("warn", "The client's pending write failed with a timeout and must be retried."); pendingAck = null; }
      }, 1200);
    };
    $('[data-a="write"]', acts).onclick = write;
    $('[data-a="read"]', acts).onclick = read;
    $('[data-a="kill"]', acts).onclick = kill;
    $('[data-a="reset"]', acts).onclick = reset;
    $$(".sd-seg button", c).forEach((b) => (b.onclick = () => { st.mode = b.dataset.v; $$(".sd-seg button", c).forEach((x) => x.classList.toggle("on", x === b)); }));
    $('[data-k="lag"]', c).oninput = (e) => { st.lag = +e.target.value; e.target.nextElementSibling.textContent = st.lag + " ms"; };
    $('[data-k="ryw"]', c).onchange = (e) => { st.ryw = e.target.checked; };
    const frame = () => {
      if (!body.isConnected) return;
      const t = now();
      msgs = msgs.filter((m) => {
        if (m.at > t) return true;
        if (m.to.up) {
          m.to.v = Math.max(m.to.v, m.v);
          if (pendingAck && m.v === pendingAck.v && ++pendingAck.got >= pendingAck.need) {
            log("ok", `Write v${m.v} acknowledged to the client after <b>${Math.round(t - pendingAck.start)} ms</b> (it waited for replication).`);
            pendingAck = null;
          }
        }
        return false;
      });
      const p = primary();
      svg.innerHTML = nodes.filter((n) => !n.primary || true).map((n) => n === p ? "" : `<line x1="${nodes.find((x) => x.primary)?.x ?? 320}" y1="${(nodes.find((x) => x.primary)?.y ?? 50) + 26}" x2="${n.x}" y2="${n.y - 26}" class="rep-link"/>`).join("") +
        msgs.map((m) => { const k = clamp((t - m.sent) / (m.at - m.sent), 0, 1); return `<circle cx="${m.from.x + (m.to.x - m.from.x) * k}" cy="${m.from.y + 26 + (m.to.y - 26 - m.from.y - 26) * k}" r="7" class="rep-msg"/><text x="${m.from.x + (m.to.x - m.from.x) * k + 10}" y="${m.from.y + 26 + (m.to.y - m.from.y - 52) * k + 4}" class="rep-msg-t">v${m.v}</text>`; }).join("") +
        nodes.map((n) => `<g class="rep-node ${n.up ? "" : "down"} ${n.primary ? "pri" : ""}" transform="translate(${n.x - 78},${n.y - 26})"><rect width="156" height="52" rx="11"/>
          <text x="12" y="21" class="rep-name">${n.name}${n.primary ? " ★" : ""}</text><text x="12" y="40" class="rep-sub">${n.up ? (n.primary ? "accepts writes" : "serves reads") : "crashed"}</text>
          <text x="144" y="34" text-anchor="end" class="rep-v ${n.v < version && n.up ? "stale" : ""}">v${n.v}</text></g>`).join("");
      raf = requestAnimationFrame(frame);
    };
    frame();
  });

  /* ---------------------------------------------------------------- sharding */
  sim("sharding", "Sharding", "db", (body, cfg) => {
    const st = { strat: cfg.strategy || "hash", n: +cfg.shards || 4, hot: false };
    const STRATS = { range_id: "Range by user id", range_name: "Range by name (A–Z)", hash: "Hash(user id) mod N" };
    const r = rng(21);
    const LETTER_W = "SSSSMMMMAAAARRRKKKJJJPPPDDDBBBCCCLLLNNHHGGTTEEVVRRIOWYZFUQX";
    const users = Array.from({ length: 2400 }, (_, i) => ({ id: i + 1, name: LETTER_W[Math.floor(r() * LETTER_W.length)] + "user" + i }));
    const c = ctrl(`<label>Shard key <select data-k="strat">${Object.entries(STRATS).map(([k, v]) => `<option value="${k}" ${k === st.strat ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label>Shards <input type="range" min="2" max="8" value="${st.n}" data-k="n"><output>${st.n}</output></label>
      <label><input type="checkbox" data-k="hot"> A celebrity goes viral (one user gets 30% of all reads)</label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const shardOf = (u, n) => {
      if (st.strat === "hash") return fnv32(String(u.id)) % n;
      if (st.strat === "range_id") return Math.min(n - 1, Math.floor(((u.id - 1) / users.length) * n));
      const L = u.name.charCodeAt(0) - 65; return Math.min(n - 1, Math.floor((L / 26) * n));
    };
    let prevAssign = null, prevN = st.n, prevStrat = st.strat, moveMsg = "";
    const draw = () => {
      const n = st.n;
      const data = Array(n).fill(0), writes = Array(n).fill(0), reads = Array(n).fill(0);
      const assign = users.map((u) => shardOf(u, n));
      users.forEach((u, i) => {
        data[assign[i]]++;
        if (u.id > users.length * 0.9) writes[assign[i]] += 1;                         // the newest 10% of users are the active writers
        reads[assign[i]] += 1;
      });
      if (st.hot) { const celeb = users[37]; reads[shardOf(celeb, n)] += Math.round(users.length * 0.43); }
      if (prevStrat !== st.strat) moveMsg = "";
      else if (prevAssign && prevN !== n) {
        const moved = assign.filter((a, i) => a !== prevAssign[i]).length;
        moveMsg = `<b>Resharding from ${prevN} to ${n} shards moved ${moved} of ${users.length} users (${Math.round((moved / users.length) * 100)}%).</b> `;
      }
      prevAssign = assign; prevN = n; prevStrat = st.strat;
      const bar = (vals, cls, label) => { const mx = Math.max(...vals), avg = vals.reduce((a, b) => a + b, 0) / n; return `<div class="sh-row"><span class="sh-lab">${label}<small>max ÷ average = <b class="${mx / avg > 1.5 ? "bad" : ""}">${(mx / avg).toFixed(2)}×</b></small></span><span class="sh-bars">${vals.map((v, i) => `<span class="sh-col"><i class="${cls}" style="height:${(v / mx) * 100}%"></i><em>${i}</em></span>`).join("")}</span></div>`; };
      stage.innerHTML = bar(data, "d", "Data stored") + bar(writes, "w", "Write load (new sign-ups)") + bar(reads, "r", "Read load") +
        `<div class="sd-note-line" style="padding:8px 0 0">${moveMsg || "Change the number of shards to see how much data has to move. "}${st.strat === "hash" ? "With mod-N hashing almost everything moves; consistent hashing (next lesson) fixes that." : ""}</div>`;
    };
    $$("select, input", c).forEach((inp) => (inp.oninput = inp.onchange = () => {
      const k = inp.dataset.k;
      st[k] = inp.type === "checkbox" ? inp.checked : inp.tagName === "SELECT" ? inp.value : +inp.value;
      if (inp.nextElementSibling && inp.nextElementSibling.tagName === "OUTPUT") inp.nextElementSibling.textContent = inp.value;
      draw();
    }));
    draw();
  });

  /* ---------------------------------------------------------------- consistent hashing ring */
  sim("hashring", "Consistent hashing", "cdn", (body, cfg) => {
    const st = { vnodes: +cfg.vnodes || 1, nodes: (cfg.nodes || "A,B,C").split(",").map((x) => x.trim()), keys: +cfg.keys || 60 };
    const c = ctrl(`<label>Virtual nodes per server <input type="range" min="1" max="64" value="${st.vnodes}" data-k="vnodes"><output>${st.vnodes}</output></label>
      <button class="sd-btn primary" data-a="add">+ Add server</button><button class="sd-btn danger" data-a="remove">− Remove a server</button><button class="sd-btn" data-a="reset">${UI.reset} Reset</button>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage hr-stage"><svg viewBox="0 0 300 300" class="hr-svg"></svg><div class="hr-side"></div></div>`);
    body.appendChild(stage);
    const keys = Array.from({ length: st.keys }, (_, i) => `key${i}`);
    const NAMES = "ABCDEFGH";
    const initial = [...st.nodes];
    let prev = null, msg = "";
    const ring = () => {
      const pts = [];
      st.nodes.forEach((n) => { for (let v = 0; v < st.vnodes; v++) pts.push({ h: fnv32(`${n}#${v}`), n }); });
      return pts.sort((a, b) => a.h - b.h);
    };
    const owner = (pts, h) => { for (const p of pts) if (p.h >= h) return p.n; return pts[0].n; };
    const assign = () => { const pts = ring(); return Object.fromEntries(keys.map((k) => [k, owner(pts, fnv32(k))])); };
    const color = (n) => PALETTE[NAMES.indexOf(n) % PALETTE.length];
    const draw = () => {
      const pts = ring(), own = assign();
      const ang = (h) => (h / 2 ** 32) * Math.PI * 2 - Math.PI / 2;
      const P = (h, rad) => [150 + rad * Math.cos(ang(h)), 150 + rad * Math.sin(ang(h))];
      let svgs = `<circle cx="150" cy="150" r="118" class="hr-ring"/>`;
      // arcs: each key range coloured by its owner
      pts.forEach((p, i) => {
        const prevH = (pts[(i - 1 + pts.length) % pts.length].h) ;
        const a0 = ang(prevH), a1 = ang(p.h) + (p.h < prevH || pts.length === 1 ? Math.PI * 2 : 0);
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const [x0, y0] = [150 + 118 * Math.cos(a0), 150 + 118 * Math.sin(a0)], [x1, y1] = [150 + 118 * Math.cos(a1), 150 + 118 * Math.sin(a1)];
        svgs += `<path d="M${x0},${y0} A118,118 0 ${large} 1 ${x1},${y1}" class="hr-arc" style="stroke:${color(p.n)}"/>`;
      });
      keys.forEach((k) => { const [x, y] = P(fnv32(k), 100); const moved = prev && prev[k] !== own[k]; svgs += `<circle cx="${x}" cy="${y}" r="${moved ? 4.2 : 3}" class="hr-key ${moved ? "moved" : ""}" style="fill:${color(own[k])}"/>`; });
      pts.forEach((p) => { const [x, y] = P(p.h, 118); svgs += `<circle cx="${x}" cy="${y}" r="${st.vnodes > 8 ? 3.5 : 6.5}" class="hr-node" style="fill:${color(p.n)}"/>`; if (st.vnodes <= 3) { const [tx, ty] = P(p.h, 136); svgs += `<text x="${tx}" y="${ty + 4}" text-anchor="middle" class="hr-label">${p.n}${st.vnodes > 1 ? "" : ""}</text>`; } });
      svgs += `<text x="150" y="146" text-anchor="middle" class="hr-center">${keys.length} keys</text><text x="150" y="162" text-anchor="middle" class="hr-center small">${st.nodes.length} servers · ${pts.length} points</text>`;
      $("svg", stage).innerHTML = svgs;
      const counts = Object.fromEntries(st.nodes.map((n) => [n, 0]));
      Object.values(own).forEach((n) => counts[n]++);
      const ideal = keys.length / st.nodes.length;
      $(".hr-side", stage).innerHTML = `<table class="sd-table"><thead><tr><th>Server</th><th class="num">Keys</th><th>Share</th></tr></thead><tbody>${st.nodes.map((n) => `<tr><td><i class="hr-dot" style="background:${color(n)}"></i>${n}</td><td class="num">${counts[n]}</td><td><span class="hr-bar"><i style="width:${Math.min(100, (counts[n] / (ideal * 2)) * 100)}%;background:${color(n)}"></i></span></td></tr>`).join("")}</tbody></table>
        <p class="hr-msg">${msg || "Each key belongs to the first server point found clockwise from the key's position. Add or remove a server and watch which keys move (enlarged dots)."}</p>
        <p class="hr-msg">Busiest server: <b>${(Math.max(...Object.values(counts)) / ideal).toFixed(2)}×</b> its fair share.</p>`;
    };
    const change = (fn) => {
      const before = assign(), nb = st.nodes.length;
      fn();
      const after = assign();
      const moved = keys.filter((k) => before[k] !== after[k]).length;
      // what mod-N hashing would have moved for the same change
      const modMoved = keys.filter((k) => fnv32(k) % nb !== fnv32(k) % st.nodes.length).length;
      msg = `<b>${moved} of ${keys.length} keys moved (${Math.round((moved / keys.length) * 100)}%).</b> With hash mod N, about ${Math.round((modMoved / keys.length) * 100)}% would have moved.`;
      prev = before;
      draw();
    };
    $('[data-a="add"]', c).onclick = () => { const free = [...NAMES].find((x) => !st.nodes.includes(x)); if (free) change(() => st.nodes.push(free)); };
    $('[data-a="remove"]', c).onclick = () => { if (st.nodes.length > 1) change(() => st.nodes.splice(1, 1)); };
    $('[data-a="reset"]', c).onclick = () => { st.nodes = [...initial]; prev = null; msg = ""; draw(); };
    $('[data-k="vnodes"]', c).oninput = (e) => { st.vnodes = +e.target.value; e.target.nextElementSibling.textContent = st.vnodes; prev = null; msg = ""; draw(); };
    draw();
  });


  /* ---------------------------------------------------------------- CAP: a partition between two replicas */
  sim("cap", "CAP theorem", "network", (body, cfg) => {
    const st = { mode: cfg.mode || "CP", part: false };
    const c = ctrl(`<label>When partitioned, choose <span class="sd-seg" data-k="mode"><button data-v="CP" class="${st.mode === "CP" ? "on" : ""}">Consistency (CP)</button><button data-v="AP" class="${st.mode === "AP" ? "on" : ""}">Availability (AP)</button></span></label>
      <button class="sd-btn danger" data-a="part">⚡ Cut the network</button>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage cap-stage">
      <div class="cap-node" data-n="0"><b>Replica A</b><small>Mumbai</small><span class="cap-val"></span><div class="cap-btns"><button class="sd-btn" data-w="0">Write here</button><button class="sd-btn" data-r="0">Read here</button></div></div>
      <div class="cap-link"><span></span></div>
      <div class="cap-node" data-n="1"><b>Replica B</b><small>Frankfurt</small><span class="cap-val"></span><div class="cap-btns"><button class="sd-btn" data-w="1">Write here</button><button class="sd-btn" data-r="1">Read here</button></div></div>
    </div>`);
    body.appendChild(stage);
    const logEl = el(`<div class="sd-log"></div>`);
    body.appendChild(logEl);
    const vals = [{ v: "price=100", t: 0 }, { v: "price=100", t: 0 }];
    let clock = 0, n = 100;
    const log = (cls, t) => logEl.insertAdjacentHTML("afterbegin", `<div class="${cls}">${t}</div>`);
    const draw = () => {
      $$(".cap-node", stage).forEach((nd, i) => { $(".cap-val", nd).textContent = vals[i].v; nd.classList.toggle("diverged", vals[0].v !== vals[1].v); });
      $(".cap-link", stage).classList.toggle("cut", st.part);
      $('[data-a="part"]', c).innerHTML = st.part ? "🔗 Heal the network" : "⚡ Cut the network";
    };
    const write = (i) => {
      n += 10; clock++;
      const val = `price=${n}`;
      if (!st.part) { vals[0] = vals[1] = { v: val, t: clock }; log("ok", `Write <b>${val}</b> at ${i ? "B" : "A"} → replicated to both. ✓ consistent and available.`); }
      else if (st.mode === "CP") {
        if (i === 0) log("bad", `Write <b>${val}</b> at A: <b>rejected</b> (A can't reach B to replicate, so it refuses rather than diverge). CP gives up availability.`);
        else log("bad", `Write <b>${val}</b> at B: <b>rejected</b>, same reason. Clients see errors or time out until the network heals.`);
      } else { vals[i] = { v: val, t: clock }; log("warn", `Write <b>${val}</b> at ${i ? "B" : "A"}: <b>accepted</b> locally. The other replica doesn't know. AP gives up consistency.`); }
      draw();
    };
    const read = (i) => {
      if (st.part && st.mode === "CP") { log("bad", `Read at ${i ? "B" : "A"}: <b>refused</b>. It can't confirm it has the latest value, so it returns an error.`); return; }
      const other = vals[1 - i];
      const stale = st.part && vals[i].t < other.t;
      log(stale ? "warn" : "ok", `Read at ${i ? "B" : "A"} → <b>${vals[i].v}</b>${stale ? " (stale: the other side has a newer value)" : st.part && vals[0].v !== vals[1].v ? " (the replicas disagree right now)" : ""}`);
    };
    $$("[data-w]", stage).forEach((b) => (b.onclick = () => write(+b.dataset.w)));
    $$("[data-r]", stage).forEach((b) => (b.onclick = () => read(+b.dataset.r)));
    $('[data-a="part"]', c).onclick = () => {
      st.part = !st.part;
      if (st.part) log("hot", "⚡ Network partition: A and B can't talk to each other.");
      else {
        if (vals[0].v !== vals[1].v) {
          const win = vals[0].t >= vals[1].t ? 0 : 1;
          log("warn", `🔗 Healed. The replicas disagree: A has ${vals[0].v}, B has ${vals[1].v}. Last-write-wins keeps <b>${vals[win].v}</b>; the other write is silently lost.`);
          vals[1 - win] = { ...vals[win] };
        } else log("ok", "🔗 Healed. Replicas agree.");
      }
      draw();
    };
    $$(".sd-seg button", c).forEach((b) => (b.onclick = () => { st.mode = b.dataset.v; $$(".sd-seg button", c).forEach((x) => x.classList.toggle("on", x === b)); log("", `Mode: ${st.mode === "CP" ? "prefer consistency" : "prefer availability"} during partitions.`); }));
    log("", "Both replicas hold price=100. Write and read on either side, then cut the network.");
    draw();
  });

  /* ---------------------------------------------------------------- quorum (N, W, R) */
  sim("quorum", "Quorum reads & writes", "db", (body, cfg) => {
    const st = { n: +cfg.n || 5, w: +cfg.w || 3, r: +cfg.r || 3, repair: true };
    const c = ctrl(`<label>N replicas <input type="range" min="3" max="7" value="${st.n}" data-k="n"><output>${st.n}</output></label>
      <label>W <input type="range" min="1" max="7" value="${st.w}" data-k="w"><output>${st.w}</output></label>
      <label>R <input type="range" min="1" max="7" value="${st.r}" data-k="r"><output>${st.r}</output></label>
      <label><input type="checkbox" data-k="repair" checked> Read repair</label>`);
    body.appendChild(c);
    const acts = el(`<div class="sd-ctrls" style="border-bottom:0;background:none"><button class="sd-btn primary" data-a="write">✎ Write next version</button><button class="sd-btn" data-a="read">Read</button><span class="q-rule"></span></div>`);
    body.appendChild(acts);
    const stage = el(`<div class="sd-stage"><div class="q-nodes"></div></div>`);
    body.appendChild(stage);
    const logEl = el(`<div class="sd-log"></div>`);
    body.appendChild(logEl);
    body.appendChild(el(`<div class="sd-note-line">Click a replica to take it down or bring it back. A write succeeds only if W replicas acknowledge; a read asks R replicas and returns the highest version.</div>`));
    const r = rng(3);
    let reps, latest, lastW = [], lastR = [];
    const reset = () => { reps = Array.from({ length: 7 }, () => ({ v: 1, up: true })); latest = 1; lastW = []; lastR = []; };
    reset();
    const log = (cls, t) => logEl.insertAdjacentHTML("afterbegin", `<div class="${cls}">${t}</div>`);
    const pickAlive = (k) => {
      const alive = reps.slice(0, st.n).map((x, i) => i).filter((i) => reps[i].up);
      for (let i = alive.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [alive[i], alive[j]] = [alive[j], alive[i]]; }
      return alive.slice(0, k);
    };
    const draw = () => {
      const ok = st.w + st.r > st.n;
      $(".q-rule", acts).innerHTML = `W + R = ${st.w + st.r} ${ok ? ">" : "≤"} N = ${st.n} → ${ok ? `<b class="ok">every read overlaps the latest write</b>` : `<b class="bad">reads can miss the latest write</b>`}`;
      $(".q-nodes", stage).innerHTML = reps.slice(0, st.n).map((x, i) => `<button class="q-node ${x.up ? "" : "down"} ${lastW.includes(i) ? "w" : ""} ${lastR.includes(i) ? "r" : ""}" data-i="${i}"><small>replica ${i + 1}</small><b class="${x.v < latest && x.up ? "stale" : ""}">v${x.v}</b><em>${!x.up ? "down" : lastW.includes(i) && lastR.includes(i) ? "wrote + read" : lastW.includes(i) ? "in write set" : lastR.includes(i) ? "in read set" : ""}</em></button>`).join("");
      $$(".q-node", stage).forEach((b) => (b.onclick = () => { reps[+b.dataset.i].up = !reps[+b.dataset.i].up; draw(); }));
    };
    $('[data-a="write"]', acts).onclick = () => {
      const set = pickAlive(st.n);              // the coordinator sends to all live replicas; some may be slow
      const acked = set.slice(0, st.w);
      if (acked.length < st.w) { lastW = []; log("bad", `Write v${latest + 1} FAILED: only ${acked.length} replicas are up, W = ${st.w}.`); draw(); return; }
      latest++;
      acked.forEach((i) => (reps[i].v = latest));
      lastW = acked; lastR = [];
      log("hot", `Write v${latest} acknowledged by replicas ${acked.map((i) => i + 1).join(", ")} (W = ${st.w}). The others missed it (slow or unlucky).`);
      draw();
    };
    $('[data-a="read"]', acts).onclick = () => {
      const set = pickAlive(st.r);
      if (set.length < st.r) { lastR = []; log("bad", `Read FAILED: only ${set.length} replicas are up, R = ${st.r}.`); draw(); return; }
      const best = Math.max(...set.map((i) => reps[i].v));
      lastR = set;
      const stale = best < latest;
      log(stale ? "bad" : "ok", `Read from replicas ${set.map((i) => i + 1).join(", ")} → versions [${set.map((i) => "v" + reps[i].v).join(", ")}] → returns <b>v${best}</b>${stale ? ` ✕ STALE (latest is v${latest})` : " ✓ latest"}.`);
      if (st.repair) { const fixed = set.filter((i) => reps[i].v < best); fixed.forEach((i) => (reps[i].v = best)); if (fixed.length) log("", `Read repair: replicas ${fixed.map((i) => i + 1).join(", ")} updated to v${best}.`); }
      draw();
    };
    $$("input", c).forEach((inp) => (inp.oninput = inp.onchange = () => {
      const k = inp.dataset.k;
      st[k] = inp.type === "checkbox" ? inp.checked : +inp.value;
      if (k === "n") { st.w = Math.min(st.w, st.n); st.r = Math.min(st.r, st.n); $('[data-k="w"]', c).value = st.w; $('[data-k="r"]', c).value = st.r; $('[data-k="w"]', c).nextElementSibling.textContent = st.w; $('[data-k="r"]', c).nextElementSibling.textContent = st.r; }
      if (k === "w" || k === "r") { st[k] = Math.min(st[k], st.n); inp.value = st[k]; }
      if (inp.nextElementSibling && inp.nextElementSibling.tagName === "OUTPUT") inp.nextElementSibling.textContent = inp.value;
      draw();
    }));
    log("", "All replicas hold v1. Write a few versions, then read, with different W and R.");
    draw();
  });

  /* ---------------------------------------------------------------- Bloom filter */
  sim("bloom", "Bloom filter", "search", (body, cfg) => {
    const st = { m: +cfg.m || 32, k: +cfg.k || 3 };
    let bits, added;
    const reset = () => { bits = new Array(st.m).fill(0); added = []; };
    reset();
    const c = ctrl(`<label>Bits (m) <input type="range" min="16" max="64" step="8" value="${st.m}" data-k="m"><output>${st.m}</output></label>
      <label>Hash functions (k) <input type="range" min="1" max="6" value="${st.k}" data-k="k"><output>${st.k}</output></label>
      <label style="flex:1 1 220px">Word <input type="text" data-k="word" value="apple" style="flex:1"></label>
      <button class="sd-btn primary" data-a="add">Add</button><button class="sd-btn" data-a="test">Check</button><button class="sd-btn" data-a="fill">Add 8 fruits</button><button class="sd-btn" data-a="reset">${UI.reset} Clear</button>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"><div class="bf-bits"></div><div class="bf-result"></div></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    const positions = (w) => { const h1 = fnv32(w), h2 = fnv32(w + "#salt") | 1; return Array.from({ length: st.k }, (_, i) => ((h1 + i * h2) >>> 0) % st.m); };   // double hashing
    let hl = [], hlCls = "";
    const draw = () => {
      $(".bf-bits", stage).innerHTML = bits.map((b, i) => `<span class="bf-bit ${b ? "on" : ""} ${hl.includes(i) ? hlCls : ""}"><b>${b}</b><small>${i}</small></span>`).join("");
      const n = added.length, fp = Math.pow(1 - Math.exp((-st.k * n) / st.m), st.k);
      const kOpt = n ? Math.max(1, Math.round((st.m / n) * Math.LN2)) : "–";
      stats.innerHTML = `<div class="sd-stat"><span>items added (n)</span><b>${n}</b></div><div class="sd-stat"><span>bits set</span><b>${bits.filter(Boolean).length} / ${st.m}</b></div>
        <div class="sd-stat ${fp > 0.1 ? "bad" : fp > 0.02 ? "warn" : "ok"}"><span>false-positive rate</span><b>${(fp * 100).toFixed(1)}%</b></div><div class="sd-stat"><span>best k for this n</span><b>${kOpt}</b></div>`;
    };
    const word = () => $('[data-k="word"]', c).value.trim().toLowerCase();
    const add = (w) => { if (!w) return; positions(w).forEach((i) => (bits[i] = 1)); if (!added.includes(w)) added.push(w); };
    $('[data-a="add"]', c).onclick = () => { const w = word(); add(w); hl = positions(w); hlCls = "set"; $(".bf-result", stage).innerHTML = `Added <b>${esc(w)}</b>: set bits ${hl.join(", ")}.`; draw(); };
    $('[data-a="test"]', c).onclick = () => {
      const w = word(), pos = positions(w), all = pos.every((i) => bits[i]);
      hl = pos; hlCls = all ? "hit" : "miss";
      const truth = added.includes(w);
      $(".bf-result", stage).innerHTML = !all ? `<b class="ok">Definitely not present.</b> Bit${pos.filter((i) => !bits[i]).length > 1 ? "s" : ""} ${pos.filter((i) => !bits[i]).join(", ")} ${pos.filter((i) => !bits[i]).length > 1 ? "are" : "is"} 0. (No false negatives, ever.)`
        : truth ? `<b>Probably present</b>: all ${st.k} bits (${pos.join(", ")}) are 1, and it really was added.` : `<b class="bad">False positive!</b> All ${st.k} bits (${pos.join(", ")}) are 1, set by other words, but <b>${esc(w)}</b> was never added.`;
      draw();
    };
    $('[data-a="fill"]', c).onclick = () => { ["apple", "banana", "cherry", "grape", "lemon", "mango", "peach", "plum"].forEach(add); hl = []; $(".bf-result", stage).innerHTML = `Added 8 fruits: ${added.join(", ")}. Now check words like <code>kiwi</code>, <code>melon</code> or <code>pear</code> and look for false positives.`; draw(); };
    $('[data-a="reset"]', c).onclick = () => { reset(); hl = []; $(".bf-result", stage).textContent = "Empty filter."; draw(); };
    $$('input[type="range"]', c).forEach((inp) => (inp.oninput = () => { st[inp.dataset.k] = +inp.value; inp.nextElementSibling.textContent = inp.value; const old = [...added]; reset(); old.forEach(add); hl = []; draw(); }));
    $(".bf-result", stage).innerHTML = `Type a word and press <b>Add</b> or <b>Check</b>. Each word is hashed ${st.k} times; each hash picks one bit.`;
    draw();
  });

  /* ---------------------------------------------------------------- Raft */
  sim("raft", "Raft consensus", "network", (body, cfg) => {
    const N = 5, HB = 700, ELO = 2000, EHI = 4600, DLO = 180, DHI = 340;
    let nodes, msgs, t, rnd, raf, last, speed = 1, logEl;
    const c = ctrl(`<button class="sd-btn primary" data-a="req">✎ Client request (to the leader)</button><button class="sd-btn" data-a="pause">${UI.pause} Pause</button>
      <label>Speed <select data-k="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><button class="sd-btn" data-a="reset">${UI.reset} Reset</button>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"><svg viewBox="0 0 620 392" class="raft-svg"></svg></div>`);
    body.appendChild(stage);
    logEl = el(`<div class="sd-log"></div>`);
    body.appendChild(logEl);
    body.appendChild(el(`<div class="sd-note-line">Click a node to crash or restart it. The ring around a follower is its election timer: when it runs out, the follower becomes a candidate. Log entries turn solid once committed (stored on a majority).</div>`));
    const svg = $("svg", stage);
    const pos = Array.from({ length: N }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / N; return [310 + 135 * Math.cos(a), 196 + 135 * Math.sin(a)]; });
    const log = (cls, s2) => { logEl.insertAdjacentHTML("afterbegin", `<div class="${cls}">[${(t / 1000).toFixed(1)}s] ${s2}</div>`); while (logEl.children.length > 60) logEl.lastChild.remove(); };
    const reset = () => {
      rnd = rng(9); t = 0; msgs = []; logEl.innerHTML = "";
      nodes = Array.from({ length: N }, (_, i) => ({ id: i, role: "follower", term: 0, votedFor: null, log: [], commit: 0, alive: true, deadline: ELO + rnd() * (EHI - ELO), votes: 0, next: [], match: [], hbAt: 0 }));
      nodes[0].deadline = ELO * 0.8;
      log("", "Five servers start as followers. Nobody is leader yet.");
    };
    const send = (from, to, m) => msgs.push({ from, to, ...m, sent: t, at: t + DLO + rnd() * (DHI - DLO) });
    const lastIdx = (n) => n.log.length, lastTerm = (n) => (n.log.length ? n.log[n.log.length - 1].term : 0);
    const resetTimer = (n) => (n.deadline = t + ELO + rnd() * (EHI - ELO));
    const stepDown = (n, term) => { if (term > n.term) { n.term = term; n.votedFor = null; } if (n.role !== "follower") { n.role = "follower"; } };
    const startElection = (n) => {
      n.role = "candidate"; n.term++; n.votedFor = n.id; n.votes = 1; resetTimer(n);
      log("warn", `S${n.id + 1} timed out → <b>candidate</b> for term ${n.term}, asks for votes.`);
      nodes.forEach((o) => o !== n && send(n.id, o.id, { type: "vote", term: n.term, lastIdx: lastIdx(n), lastTerm: lastTerm(n) }));
    };
    const becomeLeader = (n) => {
      n.role = "leader"; n.next = nodes.map(() => lastIdx(n) + 1); n.match = nodes.map(() => 0); n.hbAt = 0;
      log("ok", `S${n.id + 1} won a majority → <b>leader</b> of term ${n.term}.`);
    };
    const appendTo = (n, o) => {
      const prev = n.next[o.id] - 1;
      send(n.id, o.id, { type: "append", term: n.term, prevIdx: prev, prevTerm: prev > 0 ? n.log[prev - 1].term : 0, entries: n.log.slice(prev), commit: n.commit });
    };
    const handle = (m) => {
      const n = nodes[m.to];
      if (!n.alive) return;
      if (m.term > n.term) stepDown(n, m.term);
      if (m.type === "vote") {
        const upToDate = m.lastTerm > lastTerm(n) || (m.lastTerm === lastTerm(n) && m.lastIdx >= lastIdx(n));
        const grant = m.term === n.term && (n.votedFor === null || n.votedFor === m.from) && upToDate;
        if (grant) { n.votedFor = m.from; resetTimer(n); }
        send(n.id, m.from, { type: "voteR", term: n.term, granted: grant });
      } else if (m.type === "voteR") {
        if (n.role === "candidate" && m.term === n.term && m.granted && ++n.votes > N / 2) becomeLeader(n);
      } else if (m.type === "append") {
        if (m.term < n.term) return send(n.id, m.from, { type: "appendR", term: n.term, ok: false, match: 0 });
        if (n.role !== "follower") n.role = "follower";
        resetTimer(n);
        const okPrev = m.prevIdx === 0 || (n.log.length >= m.prevIdx && n.log[m.prevIdx - 1].term === m.prevTerm);
        if (!okPrev) return send(n.id, m.from, { type: "appendR", term: n.term, ok: false, match: 0 });
        n.log = n.log.slice(0, m.prevIdx).concat(m.entries.map((e) => ({ ...e })));
        n.commit = Math.max(n.commit, Math.min(m.commit, n.log.length));
        send(n.id, m.from, { type: "appendR", term: n.term, ok: true, match: m.prevIdx + m.entries.length });
      } else if (m.type === "appendR") {
        if (n.role !== "leader" || m.term !== n.term) return;
        if (m.ok) {
          n.match[m.from] = Math.max(n.match[m.from], m.match); n.next[m.from] = n.match[m.from] + 1;
          for (let idx = n.log.length; idx > n.commit; idx--) {
            const count = 1 + nodes.filter((o) => o !== n && n.match[o.id] >= idx).length;
            if (count > N / 2 && n.log[idx - 1].term === n.term) { log("ok", `Entry ${idx} ("${n.log[idx - 1].cmd}") is on ${count}/5 servers → <b>committed</b>.`); n.commit = idx; break; }
          }
        } else n.next[m.from] = Math.max(1, n.next[m.from] - 1);
      }
    };
    let cmdN = 0;
    const request = () => {
      const L = nodes.find((n) => n.alive && n.role === "leader");
      if (!L) return log("bad", "No leader right now: the client must retry later.");
      const cmd = `x=${++cmdN}`;
      L.log.push({ term: L.term, cmd });
      log("hot", `Client → leader S${L.id + 1}: append "${cmd}" at index ${L.log.length} (not committed yet).`);
      nodes.forEach((o) => o !== L && appendTo(L, o));
      L.hbAt = t + HB;
    };
    const tick = (dt) => {
      t += dt;
      // take the due messages out first: handling them sends new messages into `msgs`
      const due = msgs.filter((m) => m.at <= t).sort((a, b) => a.at - b.at);
      msgs = msgs.filter((m) => m.at > t);
      due.forEach((m) => { if (nodes[m.from].alive || m.type.endsWith("R")) handle(m); });
      nodes.forEach((n) => {
        if (!n.alive) return;
        if (n.role === "leader") { if (t >= n.hbAt) { nodes.forEach((o) => o !== n && appendTo(n, o)); n.hbAt = t + HB; } }
        else if (t >= n.deadline) startElection(n);
      });
    };
    const draw = () => {
      let h = "";
      msgs.forEach((m) => {
        const [x0, y0] = pos[m.from], [x1, y1] = pos[m.to], k = clamp((t - m.sent) / (m.at - m.sent), 0, 1);
        const cls = m.type === "vote" ? "v" : m.type === "voteR" ? (m.granted ? "vr" : "no") : m.type === "append" ? (m.entries.length ? "ae" : "hb") : "ar";
        h += `<circle cx="${x0 + (x1 - x0) * k}" cy="${y0 + (y1 - y0) * k}" r="${cls === "hb" || cls === "ar" ? 4 : 6}" class="raft-msg ${cls}"/>`;
      });
      nodes.forEach((n, i) => {
        const [x, y] = pos[i];
        const frac = n.role === "leader" || !n.alive ? 0 : clamp((n.deadline - t) / EHI, 0, 1);
        const R = 30, C = 2 * Math.PI * (R + 6);
        h += `<g class="raft-node ${n.role} ${n.alive ? "" : "dead"}" data-i="${i}" transform="translate(${x},${y})">
          <circle r="${R + 6}" class="raft-timer" stroke-dasharray="${C * frac} ${C}" transform="rotate(-90)"/>
          <circle r="${R}" class="raft-body"/>
          <text y="-3" text-anchor="middle" class="raft-name">S${i + 1}</text>
          <text y="13" text-anchor="middle" class="raft-term">${n.alive ? `term ${n.term}` : "crashed"}</text>
          <text y="${-R - 12}" text-anchor="middle" class="raft-role">${n.alive ? n.role : ""}</text>
          ${n.log.slice(-8).map((e, j) => { const idx = n.log.length - Math.min(8, n.log.length) + j + 1; return `<rect x="${-46 + j * 12}" y="${R + 12}" width="10" height="14" rx="2" class="raft-entry ${idx <= n.commit ? "committed" : ""} t${e.term % 4}"/>`; }).join("")}
        </g>`;
      });
      svg.innerHTML = h;
    };
    // the svg is redrawn every frame, so listen once on the svg (pointerdown, not click)
    svg.addEventListener("pointerdown", (e) => {
      const g = e.target.closest(".raft-node");
      if (!g) return;
      const n = nodes[+g.dataset.i];
      n.alive = !n.alive;
      if (!n.alive) { log("bad", `S${n.id + 1} crashed${n.role === "leader" ? " (it was the leader!)" : ""}.`); n.role = "follower"; }
      else { n.role = "follower"; resetTimer(n); log("", `S${n.id + 1} restarted as a follower (term ${n.term}).`); }
    });
    let paused = false;
    const loop = (now) => {
      if (!body.isConnected) return;
      if (last != null && !paused) { let dt = Math.min(100, now - last) * speed; while (dt > 0) { const d = Math.min(20, dt); tick(d); dt -= d; } }
      last = now;
      draw();
      raf = requestAnimationFrame(loop);
    };
    $('[data-a="req"]', c).onclick = request;
    $('[data-a="reset"]', c).onclick = () => { reset(); cmdN = 0; };
    $('[data-a="pause"]', c).onclick = (e) => { paused = !paused; e.currentTarget.innerHTML = paused ? `${UI.play} Resume` : `${UI.pause} Pause`; };
    $('[data-k="speed"]', c).onchange = (e) => (speed = +e.target.value);
    reset();
    raf = requestAnimationFrame(loop);
  });


  // A small line-chart helper: series = [{ name, color, values: [y…], dash }], over x = 0..len-1
  function lineChart({ series, w = 680, h = 210, xLabel = "", yMax, markers = [], hline }) {
    const L = 40, R = 12, T = 14, B = 30, n = Math.max(...series.map((s2) => s2.values.length));
    const max = yMax || Math.max(1, ...series.flatMap((s2) => s2.values)) * 1.1;
    const X = (i) => L + (i / Math.max(1, n - 1)) * (w - L - R), Y = (v) => T + (1 - Math.min(v, max) / max) * (h - T - B);
    const ticks = 4;
    let g = "";
    for (let k = 0; k <= ticks; k++) { const v = (max / ticks) * k; g += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="lc-grid"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="lc-t">${v >= 1000 ? Math.round(v / 100) / 10 + "k" : Math.round(v)}</text>`; }
    markers.forEach(([i, label]) => { g += `<line x1="${X(i)}" x2="${X(i)}" y1="${T}" y2="${h - B}" class="lc-mark"/><text x="${X(i) + 4}" y="${T + 10}" class="lc-t">${label}</text>`; });
    if (hline) g += `<line x1="${L}" x2="${w - R}" y1="${Y(hline.v)}" y2="${Y(hline.v)}" class="lc-hline"/><text x="${w - R}" y="${Y(hline.v) - 5}" text-anchor="end" class="lc-t bad">${hline.label}</text>`;
    series.forEach((s2) => {
      const d = s2.values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
      if (s2.fill) g += `<path d="${d} L${X(s2.values.length - 1).toFixed(1)},${Y(0)} L${X(0)},${Y(0)} Z" style="fill:${s2.color};fill-opacity:.13;stroke:none"/>`;
      g += `<path d="${d}" class="lc-line" style="stroke:${s2.color}${s2.dash ? ";stroke-dasharray:5 4" : ""}"/>`;
    });
    g += `<text x="${(L + w - R) / 2}" y="${h - 6}" text-anchor="middle" class="lc-t">${xLabel}</text>`;
    const legend = `<div class="sd-legend" style="padding:6px 0 0">${series.map((s2) => `<span><i style="display:inline-block;width:16px;height:3px;border-radius:2px;background:${s2.color}"></i>${s2.name}</span>`).join("")}</div>`;
    return `<svg viewBox="0 0 ${w} ${h}" class="lc-svg">${g}</svg>${legend}`;
  }
  window.VIZ.SIM.lineChart = lineChart;

  /* ---------------------------------------------------------------- message queue backlog */
  sim("queue", "Queue simulator", "queue", (body, cfg) => {
    const st = { pattern: cfg.pattern || "spike", consumers: +cfg.consumers || 3, rate: +cfg.rate || 40, auto: false };
    const c = ctrl(`<label>Traffic <select data-k="pattern"><option value="steady">Steady 100/s</option><option value="spike">Spike to 400/s for 20 s</option><option value="daily">Slow rise and fall</option></select></label>
      <label>Consumers <input type="range" min="1" max="12" value="${st.consumers}" data-k="consumers"><output>${st.consumers}</output></label>
      <label>Each handles <input type="range" min="10" max="100" step="5" value="${st.rate}" data-k="rate"><output>${st.rate}/s</output></label>
      <label><input type="checkbox" data-k="auto"> Autoscale consumers on backlog</label>`);
    body.appendChild(c);
    $('[data-k="pattern"]', c).value = st.pattern;
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    const arrivals = (t) => st.pattern === "steady" ? 100 : st.pattern === "spike" ? (t >= 20 && t < 40 ? 400 : 100) : 60 + 240 * Math.sin((Math.PI * t) / 90) ** 2;
    const draw = () => {
      const T = 90;
      let backlog = 0, cons = st.consumers, maxBacklog = 0, maxWait = 0, maxCons = cons;
      const inS = [], outS = [], qS = [], consS = [];
      for (let t = 0; t < T; t++) {
        const a = arrivals(t);
        if (st.auto) {                                           // add a consumer per 300 queued, remove when idle; 5 s to start
          const want = Math.min(20, Math.max(st.consumers, Math.ceil((a + backlog / 10) / st.rate)));
          if (want > cons && t % 5 === 0) cons = Math.min(want, cons + 2); else if (want < cons && backlog === 0) cons = want;
        }
        const capacity = cons * st.rate;
        const processed = Math.min(capacity, backlog + a);
        backlog = backlog + a - processed;
        const wait = backlog / Math.max(1, capacity);
        maxBacklog = Math.max(maxBacklog, backlog); maxWait = Math.max(maxWait, wait); maxCons = Math.max(maxCons, cons);
        inS.push(a); outS.push(processed); qS.push(backlog); consS.push(capacity);
      }
      stage.innerHTML = `<div class="vz-label">Messages per second</div>` + lineChart({ series: [{ name: "arriving", color: "var(--n7)", values: inS }, { name: "processed", color: "var(--n5)", values: outS }, { name: "consumer capacity", color: "var(--muted)", values: consS, dash: true }], xLabel: "time (seconds)" })
        + `<div class="vz-label" style="margin-top:10px">Queue depth (messages waiting)</div>` + lineChart({ series: [{ name: "backlog", color: "var(--n6)", values: qS, fill: true }], h: 150, xLabel: "time (seconds)" });
      stats.innerHTML = `<div class="sd-stat ${maxBacklog > 2000 ? "bad" : maxBacklog > 0 ? "warn" : "ok"}"><span>max backlog</span><b>${Math.round(maxBacklog).toLocaleString("en-US")}</b></div>
        <div class="sd-stat ${maxWait > 30 ? "bad" : maxWait > 5 ? "warn" : "ok"}"><span>max wait in queue</span><b>${maxWait.toFixed(1)} s</b></div>
        <div class="sd-stat"><span>consumers (peak)</span><b>${maxCons}</b></div>
        <div class="sd-stat ok"><span>messages lost</span><b>0</b></div>`;
    };
    $$("select, input", c).forEach((inp) => (inp.oninput = inp.onchange = () => {
      const k = inp.dataset.k;
      st[k] = inp.type === "checkbox" ? inp.checked : inp.tagName === "SELECT" ? inp.value : +inp.value;
      if (inp.nextElementSibling && inp.nextElementSibling.tagName === "OUTPUT") inp.nextElementSibling.textContent = inp.value + (k === "rate" ? "/s" : "");
      draw();
    }));
    draw();
  });

  /* ---------------------------------------------------------------- Kafka: partitions + consumer groups */
  sim("kafka", "Kafka partitions & consumer groups", "stream", (body, cfg) => {
    const st = { parts: +cfg.partitions || 4, cons: +cfg.consumers || 2, group2: false };
    const c = ctrl(`<label>Partitions <input type="range" min="1" max="6" value="${st.parts}" data-k="parts"><output>${st.parts}</output></label>
      <label>Consumers in group "billing" <input type="range" min="1" max="8" value="${st.cons}" data-k="cons"><output>${st.cons}</output></label>
      <label><input type="checkbox" data-k="group2"> Add a second group "analytics"</label>`);
    body.appendChild(c);
    const acts = el(`<div class="sd-ctrls" style="border-bottom:0;background:none"><button class="sd-btn primary" data-a="produce">+ Produce 6 orders</button><button class="sd-btn" data-a="consume">▶ Consumers poll</button><button class="sd-btn" data-a="reset">${UI.reset} Reset</button></div>`);
    body.appendChild(acts);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const note = el(`<div class="sd-note-line"></div>`);
    body.appendChild(note);
    const users = ["asha", "bilal", "chen", "dara", "eli", "farah", "gopal", "hana"];
    let logs, offsets, offsets2, n, ri;
    const reset = () => { logs = Array.from({ length: 6 }, () => []); offsets = {}; offsets2 = {}; n = 0; ri = 0; };
    reset();
    const assign = (P, C) => { const a = Array.from({ length: C }, () => []); for (let p2 = 0; p2 < P; p2++) a[p2 % C].push(p2); return a; };   // round-robin assignment
    const color = (u) => PALETTE[users.indexOf(u) % PALETTE.length];
    const draw = () => {
      const a1 = assign(st.parts, st.cons), a2 = assign(st.parts, 2);
      const ownerOf = (p2, a) => a.findIndex((ps) => ps.includes(p2));
      stage.innerHTML = `<div class="kf-topic"><div class="kf-title">topic <b>orders</b> · key = user id · partition = hash(key) mod ${st.parts}</div>${Array.from({ length: st.parts }, (_, p2) => {
        const off = offsets[p2] || 0, off2 = offsets2[p2] || 0, owner = ownerOf(p2, a1);
        return `<div class="kf-row"><span class="kf-p">P${p2}</span><span class="kf-log">${logs[p2].map((m, i) => `<span class="kf-msg ${i < off ? "read" : ""}" style="--c:${color(m.user)}" title="offset ${i}: ${m.user}"><b>${i}</b><small>${m.user}</small></span>`).join("") || `<span class="kf-empty">empty</span>`}</span>
          <span class="kf-own"><span class="kf-c c${owner}">billing-${owner + 1}</span> offset ${off}${st.group2 ? `<span class="kf-c g2">analytics-${ownerOf(p2, a2) + 1}</span> offset ${off2}` : ""}</span></div>`;
      }).join("")}</div>
      <div class="kf-consumers">${a1.map((ps, i) => `<span class="kf-cons ${ps.length ? "" : "idle"}"><b class="kf-c c${i}">billing-${i + 1}</b> ${ps.length ? `reads P${ps.join(", P")}` : "idle: no partition left"}</span>`).join("")}</div>`;
      note.innerHTML = st.cons > st.parts ? `<b>${st.cons - st.parts} consumer${st.cons - st.parts > 1 ? "s are" : " is"} idle:</b> a partition is read by only one consumer per group, so parallelism is capped by the number of partitions.`
        : `Each partition is read by exactly one consumer of the group, in order. All of one user's orders land in the same partition, so they're processed in order.${st.group2 ? " The analytics group reads the same messages independently, with its own offsets." : ""}`;
    };
    $('[data-a="produce"]', acts).onclick = () => {
      for (let i = 0; i < 6; i++) {
        const user = users[(ri = (ri * 5 + 3) % users.length)];
        logs[fnv32(user) % st.parts].push({ user, n: ++n });
      }
      draw();
    };
    $('[data-a="consume"]', acts).onclick = () => {
      for (let p2 = 0; p2 < st.parts; p2++) { offsets[p2] = Math.min(logs[p2].length, (offsets[p2] || 0) + 2); if (st.group2) offsets2[p2] = Math.min(logs[p2].length, (offsets2[p2] || 0) + 1); }
      draw();
    };
    $('[data-a="reset"]', acts).onclick = () => { reset(); draw(); };
    $$("input", c).forEach((inp) => (inp.oninput = inp.onchange = () => {
      const k = inp.dataset.k;
      st[k] = inp.type === "checkbox" ? inp.checked : +inp.value;
      if (inp.nextElementSibling && inp.nextElementSibling.tagName === "OUTPUT") inp.nextElementSibling.textContent = inp.value;
      if (k === "parts") reset();                    // changing partitions re-keys the topic in this demo
      draw();
    }));
    $('[data-a="produce"]', acts).click();
    $('[data-a="produce"]', acts).click();
  });

  /* ---------------------------------------------------------------- retries: backoff and jitter */
  sim("backoff", "Retry storm", "chart", (body, cfg) => {
    const st = { strat: cfg.strategy || "immediate", clients: +cfg.clients || 1000, outage: +cfg.outage || 4 };
    const STRATS = { immediate: "Retry immediately (every 100 ms)", fixed: "Fixed 1 s delay", exp: "Exponential backoff", jitter: "Exponential backoff + full jitter" };
    const c = ctrl(`<label>Strategy <select data-k="strat">${Object.entries(STRATS).map(([k, v]) => `<option value="${k}" ${k === st.strat ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label>Outage length <input type="range" min="1" max="10" value="${st.outage}" data-k="outage"><output>${st.outage} s</output></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    const draw = () => {
      const r = rng(5), BUCKET = 0.1, T = 20, CAP = 400;           // server can take 400 requests per 100 ms once it's back
      const buckets = new Array(Math.ceil(T / BUCKET)).fill(0);
      let done = 0, totalReq = 0, lastDone = 0;
      // every client's first request hits at t=0 (all were mid-request when the outage started)
      let pending = Array.from({ length: st.clients }, () => ({ at: r() * 0.1, attempt: 0 }));
      for (let b = 0; b < buckets.length && pending.length; b++) {
        const t0 = b * BUCKET, t1 = t0 + BUCKET;
        const now = pending.filter((p2) => p2.at >= t0 && p2.at < t1), later = pending.filter((p2) => p2.at >= t1 || p2.at < t0);
        buckets[b] = now.length; totalReq += now.length;
        const up = t0 >= st.outage;
        let served = 0;
        const next = [];
        for (const p2 of now) {
          if (up && served < CAP) { served++; done++; lastDone = t1; continue; }
          const n2 = p2.attempt + 1;
          const base = 0.1, capD = 8;
          const delay = st.strat === "immediate" ? 0.1 : st.strat === "fixed" ? 1 : st.strat === "exp" ? Math.min(capD, base * 2 ** n2) : r() * Math.min(capD, base * 2 ** n2);
          next.push({ at: p2.at + Math.max(0.1, delay), attempt: n2 });
        }
        pending = later.concat(next);
      }
      stage.innerHTML = `<div class="vz-label">Requests reaching the server per 100 ms</div>` + lineChart({ series: [{ name: "requests", color: "var(--n7)", values: buckets, fill: true }], xLabel: "time (seconds) — the server is down until the dashed line", markers: [[st.outage / BUCKET, "server back"]], hline: { v: CAP, label: "capacity" } });
      const peakAfter = Math.max(...buckets.slice(Math.round(st.outage / BUCKET)));
      stats.innerHTML = `<div class="sd-stat"><span>total requests sent</span><b>${totalReq.toLocaleString("en-US")}</b></div>
        <div class="sd-stat ${peakAfter > CAP ? "bad" : "ok"}"><span>peak after recovery</span><b>${peakAfter} / ${CAP}</b></div>
        <div class="sd-stat"><span>clients served</span><b>${done} / ${st.clients}</b></div>
        <div class="sd-stat"><span>all served by</span><b>${done === st.clients ? lastDone.toFixed(1) + " s" : "> " + T + " s"}</b></div>`;
    };
    $$("select, input", c).forEach((inp) => (inp.oninput = inp.onchange = () => {
      st[inp.dataset.k] = inp.tagName === "SELECT" ? inp.value : +inp.value;
      if (inp.nextElementSibling && inp.nextElementSibling.tagName === "OUTPUT") inp.nextElementSibling.textContent = inp.value + " s";
      draw();
    }));
    draw();
  });


  /* ---------------------------------------------------------------- circuit breaker */
  sim("breaker", "Circuit breaker", "shield", (body, cfg) => {
    const st = { useBreaker: true, depDown: false, threshold: +cfg.threshold || 50, cooldown: +cfg.cooldown || 3 };
    const c = ctrl(`<button class="sd-btn danger" data-a="dep">⚡ Break the dependency</button>
      <label><input type="checkbox" data-k="useBreaker" checked> Circuit breaker on</label>
      <label>Open at failure rate ≥ <input type="range" min="20" max="90" step="10" value="${st.threshold}" data-k="threshold"><output>${st.threshold}%</output></label>
      <label>Cool-down <input type="range" min="1" max="8" value="${st.cooldown}" data-k="cooldown"><output>${st.cooldown} s</output></label>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage"><div class="cb-states"></div><div class="cb-strip"></div><div class="cb-legend"><span><i class="ok"></i>success</span><span><i class="err"></i>failed after a 2 s timeout</span><span><i class="fast"></i>rejected instantly by the open breaker (fallback served)</span><span><i class="trial"></i>trial request (half-open)</span></div></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    const r = rng(8);
    let state = "CLOSED", window_ = [], openedAt = 0, trials = 0, t = 0, strip = [], timer;
    let threadsBusy = 0, waited = 0, served = 0;
    const tick = () => {
      if (!body.isConnected) return clearInterval(timer);
      t += 0.25;
      for (let k = 0; k < 3; k++) {
        let kind;
        const fails = st.depDown ? r() < 0.95 : r() < 0.03;
        if (!st.useBreaker) { kind = fails ? "err" : "ok"; }
        else if (state === "OPEN") {
          if (t - openedAt >= st.cooldown) { state = "HALF_OPEN"; trials = 0; }
          else kind = "fast";
        }
        if (!kind && st.useBreaker && state === "HALF_OPEN") {
          if (trials >= 3) kind = "fast";
          else { trials++; kind = fails ? "trial-err" : "trial"; if (fails) { state = "OPEN"; openedAt = t; } else if (trials >= 3) { state = "CLOSED"; window_ = []; } }
        }
        if (!kind) kind = fails ? "err" : "ok";
        if (st.useBreaker && state === "CLOSED" && (kind === "ok" || kind === "err")) {
          window_.push(kind === "err"); if (window_.length > 20) window_.shift();
          const rate = window_.filter(Boolean).length / window_.length;
          if (window_.length >= 10 && rate * 100 >= st.threshold) { state = "OPEN"; openedAt = t; }
        }
        if (kind === "err" || kind === "trial-err") waited += 2;
        if (kind !== "err" && kind !== "trial-err") served++;
        strip.push(kind);
      }
      threadsBusy = strip.slice(-24).filter((k) => k === "err" || k === "trial-err").length * 2;
      strip = strip.slice(-96);
      draw();
    };
    const draw = () => {
      const S = st.useBreaker ? state : "OFF";
      $(".cb-states", stage).innerHTML = `${["CLOSED", "OPEN", "HALF_OPEN"].map((x) => `<span class="cb-state ${x === S ? "on " + x.toLowerCase() : ""}"><b>${x.replace("_", "-")}</b><small>${x === "CLOSED" ? "requests flow; failures are counted" : x === "OPEN" ? "fail fast; no calls to the dependency" : "a few trial calls test recovery"}</small></span>`).join('<span class="cb-arrow">→</span>')}`;
      $(".cb-strip", stage).innerHTML = strip.map((k) => `<i class="${k.replace("trial-err", "trial err")}"></i>`).join("");
      stats.innerHTML = `<div class="sd-stat"><span>breaker</span><b>${S.replace("_", "-")}</b></div>
        <div class="sd-stat ${threadsBusy > 20 ? "bad" : threadsBusy ? "warn" : "ok"}"><span>threads stuck waiting now</span><b>${threadsBusy}</b></div>
        <div class="sd-stat"><span>time wasted on timeouts</span><b>${waited.toFixed(0)} s</b></div>
        <div class="sd-stat ok"><span>requests answered</span><b>${served}</b></div>`;
      $('[data-a="dep"]', c).innerHTML = st.depDown ? "🔧 Fix the dependency" : "⚡ Break the dependency";
    };
    $('[data-a="dep"]', c).onclick = () => { st.depDown = !st.depDown; draw(); };
    $$("input", c).forEach((inp) => (inp.oninput = inp.onchange = () => {
      const k = inp.dataset.k;
      st[k] = inp.type === "checkbox" ? inp.checked : +inp.value;
      if (k === "useBreaker") { state = "CLOSED"; window_ = []; }
      if (inp.nextElementSibling && inp.nextElementSibling.tagName === "OUTPUT") inp.nextElementSibling.textContent = inp.value + (k === "threshold" ? "%" : " s");
      draw();
    }));
    for (let i = 0; i < 20; i++) tick();
    timer = setInterval(tick, 250);
  });

  /* ---------------------------------------------------------------- geohash */
  const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  function geohashEncode(lat, lng, precision) {
    let latR = [-90, 90], lngR = [-180, 180], hash = "", bit = 0, ch = 0, even = true;
    while (hash.length < precision) {
      const R = even ? lngR : latR, v = even ? lng : lat, mid = (R[0] + R[1]) / 2;
      if (v >= mid) { ch = (ch << 1) | 1; R[0] = mid; } else { ch = ch << 1; R[1] = mid; }
      even = !even;
      if (++bit === 5) { hash += B32[ch]; bit = 0; ch = 0; }
    }
    return hash;
  }
  function geohashBox(hash) {
    let latR = [-90, 90], lngR = [-180, 180], even = true;
    for (const c of hash) { const v = B32.indexOf(c); for (let b = 4; b >= 0; b--) { const R = even ? lngR : latR, mid = (R[0] + R[1]) / 2; if ((v >> b) & 1) R[0] = mid; else R[1] = mid; even = !even; } }
    return { lat: latR, lng: lngR };
  }
  window.VIZ.SIM.geohash = { geohashEncode, geohashBox };
  sim("geohash", "Geohash grid", "map", (body, cfg) => {
    const VIEW = { lat: [12.85, 13.10], lng: [77.45, 77.75] };      // a slice of Bengaluru
    const st = { p: +cfg.precision || 5, click: null };
    const c = ctrl(`<label>Precision (characters) <input type="range" min="4" max="6" value="${st.p}" data-k="p"><output>${st.p}</output></label><span class="gh-size"></span>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage gh-stage"><svg viewBox="0 0 600 500" class="gh-svg"></svg><div class="gh-side"></div></div>`);
    body.appendChild(stage);
    const r = rng(31);
    const drivers = Array.from({ length: 160 }, () => { const cx = r() < 0.5, lat = VIEW.lat[0] + (cx ? 0.35 + r() * 0.3 : r()) * (VIEW.lat[1] - VIEW.lat[0]), lng = VIEW.lng[0] + (cx ? 0.35 + r() * 0.3 : r()) * (VIEW.lng[1] - VIEW.lng[0]); return { lat, lng }; });
    const W = 600, H = 500;
    const X = (lng) => ((lng - VIEW.lng[0]) / (VIEW.lng[1] - VIEW.lng[0])) * W, Y = (lat) => (1 - (lat - VIEW.lat[0]) / (VIEW.lat[1] - VIEW.lat[0])) * H;
    const draw = () => {
      const lngBits = Math.ceil((5 * st.p) / 2), latBits = Math.floor((5 * st.p) / 2);
      const cw = 360 / 2 ** lngBits, chh = 180 / 2 ** latBits;
      let g = "";
      for (let x = Math.floor(VIEW.lng[0] / cw) * cw; x <= VIEW.lng[1]; x += cw) g += `<line x1="${X(x)}" x2="${X(x)}" y1="0" y2="${H}" class="gh-grid"/>`;
      for (let y = Math.floor(VIEW.lat[0] / chh) * chh; y <= VIEW.lat[1]; y += chh) g += `<line y1="${Y(y)}" y2="${Y(y)}" x1="0" x2="${W}" class="gh-grid"/>`;
      let side = `<p>Click anywhere on the map to search for drivers near that point.</p>`;
      if (st.click) {
        const center = geohashEncode(st.click.lat, st.click.lng, st.p);
        const box = geohashBox(center);
        const ccLat = (box.lat[0] + box.lat[1]) / 2, ccLng = (box.lng[0] + box.lng[1]) / 2;
        const cells = [];
        for (const dy of [1, 0, -1]) for (const dx of [-1, 0, 1]) cells.push(geohashEncode(ccLat + dy * chh, ccLng + dx * cw, st.p));
        cells.forEach((h) => { const b = geohashBox(h); g += `<rect x="${X(b.lng[0])}" y="${Y(b.lat[1])}" width="${X(b.lng[1]) - X(b.lng[0])}" height="${Y(b.lat[0]) - Y(b.lat[1])}" class="gh-cell ${h === center ? "center" : ""}"/><text x="${(X(b.lng[0]) + X(b.lng[1])) / 2}" y="${(Y(b.lat[0]) + Y(b.lat[1])) / 2 + 4}" text-anchor="middle" class="gh-label">${h}</text>`; });
        const found = drivers.filter((d) => cells.includes(geohashEncode(d.lat, d.lng, st.p)));
        drivers.forEach((d) => (d.hit = found.includes(d)));
        g += `<circle cx="${X(st.click.lng)}" cy="${Y(st.click.lat)}" r="7" class="gh-me"/>`;
        side = `<p>Rider at <code>${st.click.lat.toFixed(4)}, ${st.click.lng.toFixed(4)}</code></p><p>Geohash: <b class="mono">${center}</b></p>
          <p>Search the cell <b>and its 8 neighbours</b> (a point near an edge has its nearest drivers in the next cell):</p><p class="mono gh-list">${cells.join(" ")}</p>
          <p><b>${found.length}</b> drivers found in 9 cells, out of ${drivers.length} in view. In a database this is 9 prefix lookups: <code>WHERE geohash LIKE '${center}%'</code>, …</p>`;
      } else drivers.forEach((d) => (d.hit = false));
      drivers.forEach((d) => (g += `<circle cx="${X(d.lng)}" cy="${Y(d.lat)}" r="${d.hit ? 4.5 : 3}" class="gh-driver ${d.hit ? "hit" : ""}"/>`));
      $("svg", stage).innerHTML = `<rect width="${W}" height="${H}" class="gh-bg"/>` + g;
      $(".gh-side", stage).innerHTML = side;
      const kmW = cw * 111 * Math.cos((13 * Math.PI) / 180), kmH = chh * 111;
      $(".gh-size", c).textContent = `cell ≈ ${kmW < 1 ? Math.round(kmW * 1000) + " m" : kmW.toFixed(1) + " km"} × ${kmH < 1 ? Math.round(kmH * 1000) + " m" : kmH.toFixed(1) + " km"}`;
    };
    $("svg", stage).addEventListener("pointerdown", (e) => {
      const svg = $("svg", stage), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const q = pt.matrixTransform(svg.getScreenCTM().inverse());
      st.click = { lng: VIEW.lng[0] + (q.x / W) * (VIEW.lng[1] - VIEW.lng[0]), lat: VIEW.lat[0] + (1 - q.y / H) * (VIEW.lat[1] - VIEW.lat[0]) };
      draw();
    });
    $('[data-k="p"]', c).oninput = (e) => { st.p = +e.target.value; e.target.nextElementSibling.textContent = st.p; draw(); };
    st.click = { lat: 12.9716, lng: 77.5946 };
    draw();
  });

  /* ---------------------------------------------------------------- availability ("nines") */
  sim("nines", "Availability calculator", "chart", (body, cfg) => {
    const st = { a: +cfg.a || 99.9, series: +cfg.series || 3, replicas: +cfg.replicas || 2 };
    const c = ctrl(`<label>Availability of one component <select data-k="a">
        ${[99, 99.5, 99.9, 99.95, 99.99, 99.999].map((x) => `<option ${x === st.a ? "selected" : ""} value="${x}">${x}%</option>`).join("")}</select></label>
      <label>Components in series <input type="range" min="1" max="8" value="${st.series}" data-k="series"><output>${st.series}</output></label>
      <label>Replicas of each (parallel) <input type="range" min="1" max="4" value="${st.replicas}" data-k="replicas"><output>${st.replicas}</output></label>`);
    body.appendChild(c);
    const out = el(`<div class="sd-stage"></div>`);
    body.appendChild(out);
    const down = (pct) => {
      const f = 1 - pct / 100;
      return [["per year", f * 365 * 86400], ["per month", f * 30 * 86400], ["per week", f * 7 * 86400], ["per day", f * 86400]];
    };
    const nines = (pct) => (pct >= 100 ? "∞" : (-Math.log10(1 - pct / 100)).toFixed(1));
    const draw = () => {
      const a = st.a / 100;
      const one = 1 - Math.pow(1 - a, st.replicas);             // a component with k replicas
      const sys = Math.pow(one, st.series);                      // the chain
      const chainNoRep = Math.pow(a, st.series);
      const pct = (x) => (x * 100).toFixed(x > 0.99999 ? 6 : 4).replace(/0+$/, "").replace(/\.$/, "") + "%";
      out.innerHTML = `<div class="nines-chain">${Array.from({ length: st.series }, (_, i) => `<div class="nc-col">${Array.from({ length: st.replicas }, () => `<span class="nc-box">${st.a}%</span>`).join("")}<small>step ${i + 1}</small></div>`).join('<span class="nc-arrow">→</span>')}</div>
        <div class="sd-stats" style="padding:12px 0 6px">
          <div class="sd-stat"><span>one step with ${st.replicas} replica${st.replicas > 1 ? "s" : ""}</span><b>${pct(one)}</b></div>
          <div class="sd-stat ${sys < chainNoRep ? "" : "ok"}"><span>whole request path</span><b>${pct(sys)}</b></div>
          <div class="sd-stat bad"><span>same path, no replicas</span><b>${pct(chainNoRep)}</b></div>
          <div class="sd-stat"><span>"nines" of the path</span><b>${nines(sys * 100)}</b></div>
        </div>
        <table class="sd-table"><thead><tr><th>Allowed downtime</th><th class="num">one component (${st.a}%)</th><th class="num">whole path (${pct(sys)})</th></tr></thead><tbody>
          ${down(st.a).map(([k, t], i) => `<tr><td>${k}</td><td class="num">${fmtDur(t)}</td><td class="num"><b>${fmtDur(down(sys * 100)[i][1])}</b></td></tr>`).join("")}
        </tbody></table>`;
    };
    $$("select, input", c).forEach((inp) => (inp.oninput = inp.onchange = () => {
      st[inp.dataset.k] = +inp.value;
      if (inp.nextElementSibling && inp.nextElementSibling.tagName === "OUTPUT") inp.nextElementSibling.textContent = inp.value;
      draw();
    }));
    draw();
  });
})();
