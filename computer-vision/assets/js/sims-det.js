/* ==========================================================================
   VisionLab simulators, part 7: object detection.
   iou · nms · apcurve · anchors
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp } = window.VIZ.SIM;
  const C = window.VIZ.SIM.cv;
  const { canvasEl, panel, bindRanges, num, val, chk, slider, place, note, ctrl, mulberry32, gauss, f2 } = C;

  const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const inter = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const iou = (a, b) => { const i = inter(a, b); return i / (area(a) + area(b) - i + 1e-9); };
  const hull = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  const giou = (a, b) => { const u = area(a) + area(b) - inter(a, b), h = area(hull(a, b)); return iou(a, b) - (h - u) / (h + 1e-9); };
  const ctr = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const diou = (a, b) => { const h = hull(a, b), c2 = (h[2] - h[0]) ** 2 + (h[3] - h[1]) ** 2, [ax, ay] = ctr(a), [bx, by] = ctr(b); return iou(a, b) - ((ax - bx) ** 2 + (ay - by) ** 2) / (c2 + 1e-9); };
  const ciou = (a, b) => { const v = (4 / Math.PI ** 2) * (Math.atan((a[2] - a[0]) / (a[3] - a[1])) - Math.atan((b[2] - b[0]) / (b[3] - b[1]))) ** 2, io = iou(a, b), al = v / (1 - io + v + 1e-9); return diou(a, b) - al * v; };

  /* ================================================================ IoU with draggable boxes */
  sim("iou", "Intersection over Union", "boxes", (body, cfg) => {
    const W = 360, H = 240, cv = canvasEl(W, H); cv.style.width = W + "px"; cv.style.cursor = "grab";
    const c = ctrl(`${slider("Predicted box width", "w", 30, 220, 1, 120, "int")}${slider("Predicted box height", "h", 30, 200, 1, 90, "int")}`);
    body.appendChild(c);
    const readout = el(`<div class="cv-readout" style="max-width:420px"></div>`), side = el(`<div class="cv-panel" style="flex:1 1 240px"></div>`); side.appendChild(readout);
    place(body, panel("Drag the red (prediction) box over the green (truth) box", cv), side);
    const gt = [100, 60, 230, 170]; let pc = [210, 140];
    const draw = () => {
      const w = num(c, "w"), h = num(c, "h"), pr = [pc[0] - w / 2, pc[1] - h / 2, pc[0] + w / 2, pc[1] + h / 2], ctx = cv.getContext("2d");
      ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, H);
      const I = [Math.max(gt[0], pr[0]), Math.max(gt[1], pr[1]), Math.min(gt[2], pr[2]), Math.min(gt[3], pr[3])];
      if (I[2] > I[0] && I[3] > I[1]) { ctx.fillStyle = "rgba(250,204,21,.4)"; ctx.fillRect(I[0], I[1], I[2] - I[0], I[3] - I[1]); }
      ctx.lineWidth = 2.5; ctx.strokeStyle = "#4ade80"; ctx.strokeRect(gt[0], gt[1], gt[2] - gt[0], gt[3] - gt[1]); ctx.strokeStyle = "#f43f5e"; ctx.strokeRect(pr[0], pr[1], w, h);
      const i = inter(gt, pr), u = area(gt) + area(pr) - i;
      readout.innerHTML = `Intersection (yellow): <b>${Math.round(i)}</b> px²<br>Union: <b>${Math.round(u)}</b> px²<br><b>IoU = ${iou(gt, pr).toFixed(3)}</b> ${iou(gt, pr) >= 0.5 ? "✓ counts as a hit at the usual 0.5 threshold" : "✗ below 0.5: counts as a miss"}<br><br>GIoU ${giou(gt, pr).toFixed(3)} · DIoU ${diou(gt, pr).toFixed(3)} · CIoU ${ciou(gt, pr).toFixed(3)}<br><br>Move the red box completely away: IoU becomes <b>0</b> everywhere, so as a <i>loss</i> it gives no hint which way to move. GIoU, DIoU and CIoU stay informative (they go negative and keep pulling the boxes together), which is why modern detectors train with them.`;
    };
    let drag = false, off = [0, 0];
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
    cv.addEventListener("pointerdown", (e) => { const p = pos(e); drag = true; off = [pc[0] - p[0], pc[1] - p[1]]; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => { if (!drag) return; const p = pos(e); pc = [clamp(p[0] + off[0], 0, W), clamp(p[1] + off[1], 0, H)]; draw(); });
    cv.addEventListener("pointerup", () => (drag = false));
    bindRanges(c, draw); draw();
  });

  /* ================================================================ non-maximum suppression */
  sim("nms", "Non-maximum suppression", "boxes", (body, cfg) => {
    const c = ctrl(`${slider("IoU threshold", "t", 0.1, 0.9, 0.05, 0.5)}${slider("Score threshold", "s", 0, 0.9, 0.05, 0.15)}<label>Method <select data-k="m"><option value="hard">hard NMS</option><option value="soft">Soft-NMS (Gaussian)</option></select></label><button class="sd-btn" data-a="new">New detections</button>`);
    body.appendChild(c);
    const W = 360, H = 240, a = canvasEl(W, H), b = canvasEl(W, H); a.style.width = b.style.width = W + "px";
    const txt = el(`<div class="cv-readout" style="max-width:560px"></div>`);
    place(body, panel("Raw detections (thickness = score)", a), panel("After NMS", b));
    body.appendChild(el(`<div class="sd-note-line"></div>`)).appendChild(txt);
    let seed = 2, dets = [];
    const build = () => {
      const r = mulberry32(seed), objs = [[70, 60, 150, 150], [210, 50, 300, 120], [180, 150, 290, 215]]; dets = [];
      objs.forEach((o, k) => { const n = 4 + Math.floor(r() * 3); for (let i = 0; i < n; i++) { const j = () => (r() - 0.5) * 22 * (i ? 1 : 0.2); dets.push({ b: [o[0] + j(), o[1] + j(), o[2] + j(), o[3] + j()], s: i ? 0.35 + r() * 0.55 : 0.9 + r() * 0.09, obj: k }); } });
      for (let i = 0; i < 3; i++) { const x = r() * 280, y = r() * 170; dets.push({ b: [x, y, x + 40 + r() * 30, y + 35 + r() * 30], s: 0.05 + r() * 0.2, obj: -1 }); }
    };
    const draw = () => {
      const t = num(c, "t"), st = num(c, "s"), m = val(c, "m");
      let list = dets.map((d) => ({ ...d })).sort((p, q) => q.s - p.s), kept = [];
      if (m === "hard") { const rest = list.filter((d) => d.s >= st); while (rest.length) { const best = rest.shift(); kept.push(best); for (let i = rest.length - 1; i >= 0; i--) if (iou(best.b, rest[i].b) > t) rest.splice(i, 1); } }
      else { let rest = list.slice(); while (rest.length) { rest.sort((p, q) => q.s - p.s); const best = rest.shift(); if (best.s < st) break; kept.push(best); rest.forEach((d) => { d.s *= Math.exp(-(iou(best.b, d.b) ** 2) / 0.5); }); rest = rest.filter((d) => d.s >= st); } }
      const paint = (cv, items, col) => { const ctx = cv.getContext("2d"); ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, H); items.forEach((d) => { ctx.strokeStyle = col(d); ctx.lineWidth = 1 + 3 * d.s; ctx.strokeRect(d.b[0], d.b[1], d.b[2] - d.b[0], d.b[3] - d.b[1]); ctx.fillStyle = "#e2e8f0"; ctx.font = "10px sans-serif"; ctx.fillText(d.s.toFixed(2), d.b[0] + 2, d.b[1] + 11); }); };
      paint(a, dets, (d) => (d.s < st ? "#64748b" : "#f59e0b")); paint(b, kept, () => "#4ade80");
      const real = new Set(kept.filter((d) => d.obj >= 0).map((d) => d.obj)).size, dup = kept.filter((d) => d.obj >= 0).length - real, fp = kept.filter((d) => d.obj < 0).length;
      txt.innerHTML = `${dets.length} raw boxes → <b>${kept.length}</b> kept. Real objects found: <b>${real} of 3</b> · duplicates left: <b>${dup}</b> · false boxes left: <b>${fp}</b>.<br>Hard NMS: take the best box, delete every box that overlaps it by more than the threshold, repeat. A <b>low</b> threshold removes duplicates but can delete a <i>second real object</i> that overlaps the first; a <b>high</b> threshold leaves duplicates. Soft-NMS lowers the neighbours' scores instead of deleting them.`;
    };
    $('[data-a="new"]', c).onclick = () => { seed = (seed * 9 + 1) % 997; build(); draw(); };
    bindRanges(c, draw); build(); draw();
  });

  /* ================================================================ precision-recall curve and AP */
  sim("apcurve", "Average precision from ranked detections", "chart", (body, cfg) => {
    const pattern = "11110110101100100100"; const dets = pattern.split("").map((ch) => ch === "1");
    const c = ctrl(`<label>Number of ground-truth objects <input type="range" min="12" max="30" step="1" value="14" data-k="g"><output>14</output></label><span style="font-size:12.5px;color:var(--muted)">Click a detection to flip it between ✓ true positive and ✗ false positive.</span>`);
    body.appendChild(c);
    const strip = el(`<div class="gl-rank" style="display:flex;flex-wrap:wrap;gap:6px;padding:12px 16px"></div>`); body.appendChild(strip);
    const chart = el(`<div class="cv-chartbox" style="width:300px"></div>`), txt = el(`<div class="cv-readout" style="max-width:420px"></div>`);
    place(body, panel("Precision (y) versus recall (x)", chart), panel("Result", txt));
    const draw = () => {
      const G = num(c, "g"); let tp = 0, fp = 0; const pts = [];
      strip.innerHTML = "";
      dets.forEach((hit, i) => { if (hit) tp++; else fp++; const prec = tp / (tp + fp), rec = Math.min(1, tp / G); pts.push([rec, prec]); const b = el(`<button class="sd-btn ${hit ? "primary" : ""}" style="min-width:64px;flex-direction:column;height:auto;padding:4px 8px"><span>#${i + 1} ${hit ? "✓" : "✗"}</span><small>P ${prec.toFixed(2)} R ${rec.toFixed(2)}</small></button>`); b.onclick = () => { dets[i] = !dets[i]; draw(); }; strip.appendChild(b); });
      // AP: area under the interpolated (monotone) precision envelope, 101 recall points like COCO
      const env = pts.map((p, i) => Math.max(...pts.slice(i).map((q) => q[1]))); let ap = 0;
      for (let k = 0; k <= 100; k++) { const r = k / 100; const idx = pts.findIndex((p) => p[0] >= r - 1e-9); ap += idx >= 0 ? env[idx] : 0; } ap /= 101;
      let raw = "", envp = ""; pts.forEach(([r, p], i) => { raw += `${i ? "L" : "M"}${(20 + r * 260).toFixed(1)},${(100 - p * 90).toFixed(1)}`; envp += `${i ? "L" : "M"}${(20 + r * 260).toFixed(1)},${(100 - env[i] * 90).toFixed(1)}`; });
      chart.innerHTML = `<svg viewBox="0 0 300 118"><rect x="20" y="10" width="260" height="90" fill="none" stroke="var(--border)"/><path d="${raw}" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="4 3"/><path d="${envp}" fill="none" stroke="var(--accent-2)" stroke-width="2.4"/><text x="20" y="114">recall 0 → 1</text></svg>`;
      txt.innerHTML = `Detections are sorted from the highest score to the lowest. After each one: precision = TP / (TP + FP), recall = TP / (number of real objects).<br><b>AP = ${(ap * 100).toFixed(1)}%</b> (area under the solid precision envelope, sampled at 101 recall points as in COCO).<br>Final recall: <b>${(Math.min(1, tp / G) * 100).toFixed(0)}%</b> (${tp} of ${G} objects found). Objects that are never detected cap the recall below 100%, and lower the AP. A false positive with a high score hurts more than one with a low score, because it comes early in the ranking.`;
    };
    bindRanges(c, draw); draw();
  });

  /* ================================================================ anchors */
  sim("anchors", "Anchor boxes and matching", "boxes", (body, cfg) => {
    const c = ctrl(`${slider("Anchor IoU threshold (positive)", "t", 0.2, 0.8, 0.05, 0.5)}<label>Scales <select data-k="sc"><option value="1">1 scale</option><option value="3" selected>3 scales</option></select></label><label>Aspect ratios <select data-k="ar"><option value="1">1 : 1</option><option value="3" selected>1:2, 1:1, 2:1</option></select></label>`);
    body.appendChild(c);
    const W = 360, H = 260, cv = canvasEl(W, H); cv.style.width = W + "px"; cv.style.cursor = "crosshair";
    const txt = el(`<div class="cv-readout" style="max-width:420px"></div>`), side = el(`<div class="cv-panel" style="flex:1 1 240px"></div>`); side.appendChild(txt);
    place(body, panel("Click to place the true box's centre. Green = anchors that match it", cv), side);
    let gc = [190, 120];
    const draw = () => {
      const t = num(c, "t"), scales = val(c, "sc") === "1" ? [64] : [40, 64, 100], ars = val(c, "ar") === "1" ? [1] : [0.5, 1, 2], ctx = cv.getContext("2d"), S = 40;
      ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = "#1e293b"; for (let x = 0; x <= W; x += S) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 0; y <= H; y += S) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      const gt = [gc[0] - 45, gc[1] - 30, gc[0] + 45, gc[1] + 30]; let pos = 0, total = 0, best = 0;
      for (let cy = S / 2; cy < H; cy += S) for (let cx = S / 2; cx < W; cx += S) for (const s of scales) for (const r of ars) {
        const w = s * Math.sqrt(r), h = s / Math.sqrt(r), a = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], v = iou(a, gt); total++; best = Math.max(best, v);
        if (v >= t) { pos++; ctx.strokeStyle = "rgba(74,222,128,.55)"; ctx.lineWidth = 1.2; ctx.strokeRect(a[0], a[1], w, h); }
      }
      ctx.strokeStyle = "#f43f5e"; ctx.lineWidth = 3; ctx.strokeRect(gt[0], gt[1], gt[2] - gt[0], gt[3] - gt[1]);
      txt.innerHTML = `${total} anchors in this small picture (cells of ${S} px × ${scales.length} scale(s) × ${ars.length} ratio(s)). <b>${pos}</b> match the true box with IoU ≥ ${t.toFixed(2)}; the best IoU is <b>${best.toFixed(2)}</b>.<br><br>Training: anchors with IoU above the threshold are <b>positives</b> (they must predict this object and the offsets to its exact box); anchors below a low threshold (about 0.4) are <b>negatives</b> (background); the rest are ignored. With too few scales or ratios, an unusual box matches no anchor well and is learned badly. That is the weakness of anchors, and the reason for anchor-free detectors.`;
    };
    cv.addEventListener("pointerdown", (e) => { const r = cv.getBoundingClientRect(); gc = [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; draw(); });
    bindRanges(c, draw); draw();
  });
})();
