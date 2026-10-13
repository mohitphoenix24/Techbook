/* ==========================================================================
   GenLab simulators, part 5: fine-tuning.
   lora
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp } = window.VIZ.SIM;
  const { ctrl, pct, human, fmtGB } = window.VIZ.SIM.gl;

  const MODELS = {
    "1B": { d: 2048, L: 16, ffn: 8192, kv: 512, params: 1.24e9 },
    "8B": { d: 4096, L: 32, ffn: 14336, kv: 1024, params: 8.03e9 },
    "70B": { d: 8192, L: 80, ffn: 28672, kv: 1024, params: 70.6e9 },
  };
  const MODS = {
    q: (m) => [m.d, m.d], k: (m) => [m.d, m.kv], v: (m) => [m.d, m.kv], o: (m) => [m.d, m.d],
    gate: (m) => [m.d, m.ffn], up: (m) => [m.d, m.ffn], down: (m) => [m.ffn, m.d],
  };
  const PRESETS = { "q, v (the original LoRA paper)": ["q", "v"], "all attention (q, k, v, o)": ["q", "k", "v", "o"], "all linear layers": ["q", "k", "v", "o", "gate", "up", "down"] };

  sim("lora", "LoRA calculator", "wand", (body, cfg) => {
    const st = { model: cfg.model in MODELS ? cfg.model : "8B", r: +cfg.rank || 16, preset: "all linear layers", mode: "lora" };
    const c = ctrl(`<label>Base model <select data-k="model">${Object.keys(MODELS).map((k) => `<option ${k === st.model ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      <label>Rank r <input type="range" min="1" max="256" value="${st.r}" data-k="r"><output>${st.r}</output></label>
      <label>Apply to <select data-k="preset">${Object.keys(PRESETS).map((k) => `<option ${k === st.preset ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      <div class="sd-seg"><button class="on" data-m="lora">LoRA (16-bit base)</button><button data-m="qlora">QLoRA (4-bit base)</button></div>`);
    body.appendChild(c);
    const stage = el(`<div class="sd-stage gl-lora"></div>`);
    body.appendChild(stage);
    const stats = el(`<div class="sd-stats"></div>`);
    body.appendChild(stats);
    body.appendChild(el(`<div class="sd-note-line">The adapter learns ΔW = B·A (B is d×r, A is r×d) instead of updating the full d×d matrix W. Memory is an estimate for weights, gradients and Adam state only: activations, KV and framework overhead add several GB (reduced by gradient checkpointing).</div>`));
    const draw = () => {
      const M = MODELS[st.model], mods = PRESETS[st.preset], r = st.r;
      let adapter = 0; mods.forEach((k) => { const [i, o] = MODS[k](M); adapter += r * (i + o) * M.L; });
      const full = M.params, GB = 1e9;
      const fullMem = (full * 16) / GB;                               // 2 (weights) + 2 (grads) + 4 (fp32 master) + 8 (Adam m, v)
      const baseBytes = st.mode === "qlora" ? 0.56 : 2;                // 4-bit weights + quantisation constants vs bf16
      const loraMem = (full * baseBytes + adapter * 16) / GB;
      // picture: a big square W and the two thin matrices
      const d = M.d, big = 150, thin = Math.max(3, (r / d) * big * 4);   // thin width exaggerated x4 for visibility
      const svg = `<svg viewBox="0 0 520 190" class="gl-lora-svg">
        <g transform="translate(10,20)"><rect width="${big}" height="${big}" rx="6" class="w"/><text x="${big / 2}" y="${big / 2 + 4}" text-anchor="middle">W (d × d)</text><text x="${big / 2}" y="${big + 16}" text-anchor="middle" class="sub">frozen: ${human(d * d)} numbers</text></g>
        <text x="${big + 28}" y="104" font-size="22" fill="var(--text-2)">+</text>
        <g transform="translate(${big + 52},20)"><rect width="${thin}" height="${big}" rx="3" class="b"/><text x="${thin / 2}" y="${big + 16}" text-anchor="middle" class="sub">B</text></g>
        <text x="${big + 62 + thin}" y="104" font-size="20" fill="var(--text-2)">×</text>
        <g transform="translate(${big + 84 + thin},20)"><rect width="${big}" height="${thin}" rx="3" class="a"/><text x="${big / 2}" y="${thin + 16}" text-anchor="middle" class="sub">A</text></g>
        <text x="${big + 84 + thin}" y="${thin + 52}" class="sub">trainable: ${human(2 * d * r)} numbers (r = ${r})</text>
        <text x="${big + 84 + thin}" y="${thin + 70}" class="sub">that is ${pct((2 * d * r) / (d * d), 2)} of W</text></svg>`;
      stage.innerHTML = svg + `<div class="gl-bar-row wide"><span>Full fine-tuning (16 B/param)</span><i style="width:100%;background:var(--n7)"></i><b>${fmtGB(fullMem)}</b></div>
        <div class="gl-bar-row wide"><span>${st.mode === "qlora" ? "QLoRA" : "LoRA"} (frozen base + adapter)</span><i style="width:${Math.max(2, (loraMem / fullMem) * 100)}%;background:var(--n3)"></i><b>${fmtGB(loraMem)}</b></div>`;
      stats.innerHTML = `<div class="sd-stat"><span>trainable parameters</span><b>${human(adapter)}</b></div><div class="sd-stat"><span>share of the model</span><b>${pct(adapter / full, 2)}</b></div>
        <div class="sd-stat"><span>adapter file (16-bit)</span><b>${fmtGB((adapter * 2) / GB)}</b></div><div class="sd-stat ${loraMem < 24 ? "ok" : loraMem < 80 ? "warn" : "bad"}"><span>GPU memory, weights + opt</span><b>${fmtGB(loraMem)}</b></div>
        <div class="sd-stat"><span>vs full fine-tuning</span><b>${(fullMem / loraMem).toFixed(1)}× less</b></div>`;
    };
    $('[data-k="model"]', c).onchange = (e) => { st.model = e.target.value; draw(); };
    $('[data-k="r"]', c).oninput = (e) => { st.r = +e.target.value; e.target.nextElementSibling.textContent = st.r; draw(); };
    $('[data-k="preset"]', c).onchange = (e) => { st.preset = e.target.value; draw(); };
    $$(".sd-seg button", c).forEach((b) => (b.onclick = () => { st.mode = b.dataset.m; $$(".sd-seg button", c).forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
    draw();
  });
})();
