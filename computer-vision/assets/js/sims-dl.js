/* ==========================================================================
   VisionLab simulators, part 6: learning and CNNs.
   confusion · receptive · cnnshape
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp } = window.VIZ.SIM;
  const C = window.VIZ.SIM.cv;
  const { canvasEl, panel, bindRanges, num, val, chk, slider, place, note, ctrl, f2 } = C;

  const erf = (x) => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); };
  const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
  const phi = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI));
  const pct = (v) => (v * 100).toFixed(1) + "%";

  /* ================================================================ confusion matrix, ROC and PR */
  sim("confusion", "Threshold, confusion matrix, ROC and PR", "chart", (body, cfg) => {
    const c = ctrl(`${slider("Defect rate in the data %", "prev", 1, 50, 1, 10, "int")}${slider("Separation of the classes", "sep", 0.5, 4, 0.1, 2)}${slider("Decision threshold", "thr", -2, 6, 0.05, 1.5)}`);
    body.appendChild(c);
    const hist = el(`<div class="cv-chartbox" style="width:300px"></div>`), roc = el(`<div class="cv-chartbox" style="width:200px"></div>`), pr = el(`<div class="cv-chartbox" style="width:200px"></div>`), tbl = el(`<div class="cv-mini" style="min-width:230px"></div>`);
    place(body, panel("Model scores: good parts (grey) and defects (red)", hist), panel("ROC curve", roc), panel("Precision-recall curve", pr), panel("Results at this threshold", tbl));
    const draw = () => {
      const prev = num(c, "prev") / 100, sep = num(c, "sep"), t = num(c, "thr"), N = 10000, P = N * prev, Ng = N - P;     // good ~ N(0,1), defect ~ N(sep,1)
      const tpr = (th) => 1 - Phi(th - sep), fpr = (th) => 1 - Phi(th);
      const TP = P * tpr(t), FN = P - TP, FP = Ng * fpr(t), TN = Ng - FP;
      const prec = TP + FP ? TP / (TP + FP) : 1, rec = tpr(t), f1 = prec + rec ? (2 * prec * rec) / (prec + rec) : 0, acc = (TP + TN) / N;
      // histogram
      const X = (v) => 10 + ((v + 3) / 9) * 280, Y = (d) => 100 - d * 190;
      let g = "", r = "";
      for (let v = -3; v <= 6; v += 0.1) { g += `${v === -3 ? "M" : "L"}${X(v).toFixed(1)},${Y((1 - prev) * phi(v, 0, 1)).toFixed(1)}`; r += `${v === -3 ? "M" : "L"}${X(v).toFixed(1)},${Y(prev * phi(v, sep, 1)).toFixed(1)}`; }
      hist.innerHTML = `<svg viewBox="0 0 300 112"><path d="${g}" fill="none" stroke="#94a3b8" stroke-width="2.2"/><path d="${r}" fill="none" stroke="#f43f5e" stroke-width="2.2"/><line x1="${X(t)}" x2="${X(t)}" y1="4" y2="100" stroke="var(--accent-2)" stroke-width="2" stroke-dasharray="4 3"/><text x="${X(t) + 4}" y="12">threshold</text></svg>`;
      // ROC and PR
      let rp = "", pp = "", auc = 0, prev_f = 0, prev_t = 0;
      for (let th = 7; th >= -4; th -= 0.05) { const a = fpr(th), b = tpr(th); rp += `${rp ? "L" : "M"}${(15 + a * 170).toFixed(1)},${(110 - b * 100).toFixed(1)}`; auc += (a - prev_f) * (b + prev_t) / 2; prev_f = a; prev_t = b; const tp = P * b, fp = Ng * a, pr_ = tp + fp ? tp / (tp + fp) : 1; pp += `${pp ? "L" : "M"}${(15 + b * 170).toFixed(1)},${(110 - pr_ * 100).toFixed(1)}`; }
      const box = (inner) => `<svg viewBox="0 0 200 124"><rect x="15" y="10" width="170" height="100" fill="none" stroke="var(--border)"/>${inner}</svg>`;
      roc.innerHTML = box(`<path d="M15,110 L185,10" stroke="var(--border-2)" stroke-dasharray="3 3" fill="none"/><path d="${rp}" fill="none" stroke="var(--accent-2)" stroke-width="2.2"/><circle cx="${15 + fpr(t) * 170}" cy="${110 - tpr(t) * 100}" r="4.5" fill="#f43f5e"/><text x="18" y="122">false positive rate →</text>`);
      pr.innerHTML = box(`<path d="${pp}" fill="none" stroke="var(--accent-2)" stroke-width="2.2"/><circle cx="${15 + rec * 170}" cy="${110 - prec * 100}" r="4.5" fill="#f43f5e"/><line x1="15" x2="185" y1="${110 - prev * 100}" y2="${110 - prev * 100}" stroke="var(--border-2)" stroke-dasharray="3 3"/><text x="18" y="122">recall →</text>`);
      tbl.innerHTML = `<table class="cv-nums" style="margin-bottom:8px"><tr><td style="width:auto;padding:3px 8px"></td><td style="width:auto;padding:3px 8px"><b>says defect</b></td><td style="width:auto;padding:3px 8px"><b>says good</b></td></tr><tr><td style="width:auto;padding:3px 8px"><b>is defect</b></td><td style="width:auto;background:color-mix(in srgb,var(--sd-ok) 20%,transparent)">${Math.round(TP)} TP</td><td style="width:auto;background:color-mix(in srgb,var(--sd-bad) 20%,transparent)">${Math.round(FN)} FN</td></tr><tr><td style="width:auto;padding:3px 8px"><b>is good</b></td><td style="width:auto;background:color-mix(in srgb,var(--sd-bad) 20%,transparent)">${Math.round(FP)} FP</td><td style="width:auto;background:color-mix(in srgb,var(--sd-ok) 20%,transparent)">${Math.round(TN)} TN</td></tr></table>
        Accuracy <b>${pct(acc)}</b><br>Precision <b>${pct(prec)}</b> (of the parts flagged, how many are real defects)<br>Recall <b>${pct(rec)}</b> (of the real defects, how many were caught)<br>F1 <b>${pct(f1)}</b><br>ROC AUC <b>${auc.toFixed(3)}</b><br><br>${acc > 1 - prev - 0.02 && rec < 0.3 ? "<b>Look:</b> accuracy is high but recall is low. With few defects, a model that flags almost nothing still has a high accuracy." : "Move the threshold: a lower threshold catches more defects (recall ↑) but flags more good parts (precision ↓)."}`;
    };
    bindRanges(c, draw); draw();
  });

  /* ================================================================ receptive field */
  const RF_PRESETS = {
    "five 3×3 convs": "conv 3 1\nconv 3 1\nconv 3 1\nconv 3 1\nconv 3 1",
    "3×3 convs with stride-2 pooling (VGG style)": "conv 3 1\nconv 3 1\npool 2 2\nconv 3 1\nconv 3 1\npool 2 2\nconv 3 1\nconv 3 1\npool 2 2\nconv 3 1\nconv 3 1",
    "ResNet-50 style (stem + stages, approx.)": "conv 7 2\npool 3 2\nconv 1 1\nconv 3 1\nconv 1 1\nconv 1 1\nconv 3 2\nconv 1 1\nconv 1 1\nconv 3 1\nconv 1 1\nconv 1 1\nconv 3 2\nconv 1 1\nconv 1 1\nconv 3 1\nconv 1 1\nconv 1 1\nconv 3 2\nconv 1 1",
    "dilated convs (rates 1, 2, 4, 8)": "conv 3 1 1\nconv 3 1 2\nconv 3 1 4\nconv 3 1 8",
    "one 11×11 conv versus ...": "conv 11 1",
  };
  sim("receptive", "Receptive field calculator", "conv", (body, cfg) => {
    const c = ctrl(`<label>Preset <select data-k="p">${Object.keys(RF_PRESETS).map((k) => `<option>${k}</option>`).join("")}</select></label>`);
    body.appendChild(c);
    const ta = el(`<textarea spellcheck="false" style="width:220px;height:190px;font:12.5px var(--mono);border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:8px"></textarea>`);
    const out = el(`<div class="cv-chartbox" style="width:420px"></div>`), txt = el(`<div class="cv-mini" style="max-width:520px"></div>`);
    place(body, panel("Layers: type kernel stride [dilation]", ta), panel("Receptive field after each layer", out));
    body.appendChild(el(`<div class="sd-note-line"></div>`)).appendChild(txt);
    const draw = () => {
      let r = 1, j = 1; const rows = [];
      ta.value.split("\n").map((s) => s.trim()).filter(Boolean).forEach((line, i) => {
        const [type, k, s, d] = line.split(/\s+/); const kk = +k || 1, ss = +s || 1, dd = +d || 1, keff = dd * (kk - 1) + 1;
        r += (keff - 1) * j; j *= ss; rows.push({ i: i + 1, line: `${type} ${kk} ${ss}${dd > 1 ? " d" + dd : ""}`, r, j });
      });
      const mx = Math.max(...rows.map((x) => x.r), 1); let bars = "";
      rows.forEach((x, i) => { const w = (x.r / mx) * 300, y = 6 + i * 16; bars += `<rect x="64" y="${y}" width="${w}" height="11" rx="3" fill="var(--n3)" opacity=".85"/><text x="4" y="${y + 9}">${x.i}: ${x.line}</text><text x="${68 + w}" y="${y + 9}" style="fill:var(--text)">${x.r}</text>`; });
      out.innerHTML = `<svg viewBox="0 0 420 ${rows.length * 16 + 12}">${bars}</svg>`;
      const last = rows[rows.length - 1] || { r: 1, j: 1 };
      txt.innerHTML = `After the last layer one output pixel sees <b>${last.r} × ${last.r}</b> input pixels (receptive field) and neighbouring outputs are <b>${last.j}</b> pixels apart (the "jump" or total stride). <br>Rule: r<sub>new</sub> = r + (k_eff − 1) · jump, jump<sub>new</sub> = jump · stride, with k_eff = d·(k − 1) + 1. <b>Stride</b> and <b>pooling</b> make the field grow fast; <b>dilation</b> grows it without losing resolution. A 224-pixel image needs a receptive field of about 224 to see a whole object at once.`;
    };
    $('[data-k="p"]', c).addEventListener("change", () => { ta.value = RF_PRESETS[val(c, "p")]; draw(); });
    ta.addEventListener("input", draw); ta.value = RF_PRESETS[val(c, "p")]; draw();
  });

  /* ================================================================ conv layer shape, params and cost */
  sim("cnnshape", "Convolution: output size, parameters, cost", "conv", (body, cfg) => {
    const c = ctrl(`${slider("Input size H = W", "n", 8, 256, 1, 56, "int")}${slider("In channels", "ci", 1, 512, 1, 64, "int")}${slider("Out channels", "co", 1, 512, 1, 128, "int")}${slider("Kernel k", "k", 1, 11, 2, 3, "int")}${slider("Stride", "s", 1, 4, 1, 1, "int")}${slider("Padding", "p", 0, 5, 1, 1, "int")}${slider("Dilation", "d", 1, 4, 1, 1, "int")}`);
    body.appendChild(c);
    const tbl = el(`<div class="cv-mini" style="max-width:640px"></div>`); body.appendChild(el(`<div class="sd-note-line"></div>`)).appendChild(tbl);
    const draw = () => {
      const n = num(c, "n"), ci = num(c, "ci"), co = num(c, "co"), k = num(c, "k"), s = num(c, "s"), p = num(c, "p"), d = num(c, "d"), keff = d * (k - 1) + 1;
      const o = Math.floor((n + 2 * p - keff) / s) + 1, ok = o > 0;
      const std = ci * co * k * k, macs = ok ? o * o * std : 0, dw = ci * k * k + ci * co, dwm = ok ? o * o * dw : 0, bott = ci * (co / 4) + (co / 4) * (co / 4) * k * k + (co / 4) * co;
      const h = (v) => (v >= 1e9 ? (v / 1e9).toFixed(2) + " G" : v >= 1e6 ? (v / 1e6).toFixed(2) + " M" : v >= 1e3 ? (v / 1e3).toFixed(1) + " K" : Math.round(v));
      tbl.innerHTML = ok ? `<b>Output size</b> = ⌊(N + 2P − d(k−1) − 1) / S⌋ + 1 = ⌊(${n} + ${2 * p} − ${keff - 1} − 1) / ${s}⌋ + 1 = <b>${o} × ${o}</b> with ${co} channels<br><br>
        <table class="cv-nums" style="font:12.5px var(--mono)"><tr><td style="width:auto;padding:3px 10px"><b>layer type</b></td><td style="width:auto;padding:3px 10px"><b>parameters</b></td><td style="width:auto;padding:3px 10px"><b>multiply-adds</b></td></tr>
        <tr><td style="width:auto;padding:3px 10px">standard ${k}×${k} conv</td><td style="width:auto;padding:3px 10px">${h(std)}</td><td style="width:auto;padding:3px 10px">${h(macs)}</td></tr>
        <tr><td style="width:auto;padding:3px 10px">depthwise ${k}×${k} + 1×1 (MobileNet)</td><td style="width:auto;padding:3px 10px">${h(dw)}</td><td style="width:auto;padding:3px 10px">${h(dwm)} (${(macs / Math.max(dwm, 1)).toFixed(1)}× cheaper)</td></tr>
        <tr><td style="width:auto;padding:3px 10px">1×1 conv only</td><td style="width:auto;padding:3px 10px">${h(ci * co)}</td><td style="width:auto;padding:3px 10px">${h(o * o * ci * co)}</td></tr></table>
        <br>Parameters = C<sub>in</sub> · C<sub>out</sub> · k² (+ C<sub>out</sub> for the bias). Multiply-adds = output pixels × parameters. Note that the cost depends on the <b>output size</b> and the <b>channel counts</b>, and the parameters do <b>not</b> depend on the image size.` : "<b>The kernel is larger than the padded input: no output.</b> Increase the input size or the padding.";
    };
    bindRanges(c, draw); draw();
  });
})();
