/* ==========================================================================
   VisionLab simulators, part 3: geometry of images.
   affine · homography · hough
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp } = window.VIZ.SIM;
  const C = window.VIZ.SIM.cv, A = window.CVALGO;
  const { photo, canvasEl, panel, bindRanges, num, val, chk, slider, place, note, ctrl, photoSelect, scaleTo, imageToCanvas, mulberry32, f2 } = C;

  const loadFit = (name, W) => photo(name).then((p) => {
    const s = Math.min(1, W / p.w), w = Math.round(p.w * s), h = Math.round(p.h * s);
    const c = scaleTo(imageToCanvas(p.data), w, h), im = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h);
    return { w, h, im };
  });
  const matHtml = (m, rows, cols) => {
    let s = '<table class="cv-nums">';
    for (let r = 0; r < rows; r++) { s += "<tr>"; for (let c = 0; c < cols; c++) s += `<td style="width:auto;min-width:52px;padding:2px 6px">${f2(m[r * cols + c])}</td>`; s += "</tr>"; }
    return s + "</table>";
  };
  const drawGrid = (im) => {                                   // overlay a grid so that lines and parallels are easy to follow
    const { width: w, height: h, data } = im, step = 20;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x % step === 0 || y % step === 0) { const k = (y * w + x) * 4; data[k] = 255; data[k + 1] = 230; data[k + 2] = 0; }
  };

  /* ================================================================ affine transforms */
  sim("affine", "Transform a picture", "image", (body, cfg) => {
    const c = ctrl(`${photoSelect(["astronaut", "cat", "coffee", "camera"], cfg.photo || "astronaut")}
      ${slider("Shift x", "tx", -120, 120, 1, 0, "int")}${slider("Shift y", "ty", -120, 120, 1, 0, "int")}${slider("Rotate °", "rot", -180, 180, 1, 0, "int")}
      ${slider("Scale", "sc", 0.3, 2, 0.05, 1)}${slider("Shear", "sh", -0.8, 0.8, 0.05, 0)}${slider("Stretch x", "ar", 0.4, 2, 0.05, 1)}<label><input type="checkbox" data-k="grid" checked> grid</label>`);
    body.appendChild(c);
    const out = canvasEl(10, 10, "smooth"), mat = el(`<div class="cv-mini"></div>`);
    const mp = panel("The 2 × 3 matrix OpenCV would use (3rd row is 0 0 1)", mat);
    place(body, panel("Result (dark = outside the picture)", out), mp);
    const run = () => loadFit(val(c, "photo"), 260).then(({ w, h, im }) => {
      const src = new ImageData(new Uint8ClampedArray(im.data), w, h); if (chk(c, "grid")) drawGrid(src);
      const cx = w / 2, cy = h / 2, th = (num(c, "rot") * Math.PI) / 180, s = num(c, "sc"), ar = num(c, "ar"), sh = num(c, "sh");
      const T1 = [1, 0, -cx, 0, 1, -cy, 0, 0, 1], S = [s * ar, 0, 0, 0, s, 0, 0, 0, 1], Sh = [1, sh, 0, 0, 1, 0, 0, 0, 1];
      const R = [Math.cos(th), -Math.sin(th), 0, Math.sin(th), Math.cos(th), 0, 0, 0, 1], T2 = [1, 0, cx + num(c, "tx"), 0, 1, cy + num(c, "ty"), 0, 0, 1];
      const M = A.mul3(T2, A.mul3(R, A.mul3(Sh, A.mul3(S, T1))));
      const W = Math.round(w * 1.4), H = Math.round(h * 1.4), ox = (W - w) / 2, oy = (H - h) / 2;
      const Mo = A.mul3([1, 0, ox, 0, 1, oy, 0, 0, 1], M);                        // draw in a bigger frame so the result is not cut off
      const data = A.warp(src.data, w, h, Mo, W, H), o = new ImageData(W, H);
      for (let i = 0; i < W * H; i++) { const a = data[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o.data[i * 4 + k] = data[i * 4 + k] * a + 24 * (1 - a); o.data[i * 4 + 3] = 255; }
      out.width = W; out.height = H; out.style.width = W + "px"; const ctx = out.getContext("2d"); ctx.putImageData(o, 0, 0);
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.setLineDash([4, 4]); ctx.strokeRect(ox, oy, w, h);
      mat.innerHTML = matHtml([M[0], M[1], M[2], M[3], M[4], M[5]], 2, 3) + `<div style="margin-top:8px">Affine = 6 numbers. Straight lines stay straight, <b>parallel lines stay parallel</b>, but angles and lengths can change. The dashed frame marks where the original picture was.</div>`;
    });
    bindRanges(c, run); run();
  });

  /* ================================================================ homography (drag the corners) */
  sim("homography", "Perspective warp: drag the corners", "image", (body, cfg) => {
    const c = ctrl(`${photoSelect(["astronaut", "cat", "coffee", "text"], cfg.photo || "text")}<label><input type="checkbox" data-k="grid" checked> grid</label><button class="sd-btn" data-a="reset">Reset corners</button>`);
    body.appendChild(c);
    const cv = canvasEl(10, 10, "smooth"), mat = el(`<div class="cv-mini"></div>`);
    place(body, panel("Drag the four yellow handles", cv), panel("The 3 × 3 homography H", mat));
    let W = 0, Hh = 0, src = null, pts = [];
    const init = () => { pts = [[W * 0.12, Hh * 0.18], [W * 0.88, Hh * 0.05], [W * 0.95, Hh * 0.95], [W * 0.05, Hh * 0.82]]; };
    const draw = () => {
      if (!src) return;
      const s = new ImageData(new Uint8ClampedArray(src.data), W, Hh); if (chk(c, "grid")) drawGrid(s);
      const H = A.homography4([[0, 0], [W - 1, 0], [W - 1, Hh - 1], [0, Hh - 1]], pts);
      const o = new ImageData(W, Hh);
      if (H) { const data = A.warp(s.data, W, Hh, H, W, Hh); for (let i = 0; i < W * Hh; i++) { const a = data[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) o.data[i * 4 + k] = data[i * 4 + k] * a + 24 * (1 - a); o.data[i * 4 + 3] = 255; } }
      const ctx = cv.getContext("2d"); ctx.putImageData(o, 0, 0);
      ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
      pts.forEach(([x, y]) => { ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke(); });
      mat.innerHTML = H ? matHtml(H, 3, 3) + `<div style="margin-top:8px">A homography has <b>8 free numbers</b> (the last entry is fixed to 1). It maps a flat surface seen from one view to another. Four point pairs are exactly enough to find it. <b>Straight lines stay straight, but parallel lines can meet</b>: this is perspective. In OpenCV: <code>H = cv2.getPerspectiveTransform(src4, dst4)</code>.</div>` : "These four points do not make a valid warp (three are in a line).";
    };
    const load = () => loadFit(val(c, "photo"), 300).then(({ w, h, im }) => { W = w; Hh = h; src = im; cv.width = w; cv.height = h; cv.style.width = w + "px"; init(); draw(); });
    let drag = -1;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * Hh]; };
    cv.addEventListener("pointerdown", (e) => { const [x, y] = pos(e); let best = 1e9; pts.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < best && d < 28) { best = d; drag = i; } }); if (drag >= 0) cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => { if (drag < 0) return; const [x, y] = pos(e); pts[drag] = [clamp(x, 0, W), clamp(y, 0, Hh)]; draw(); });
    const up = () => (drag = -1); cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.style.cursor = "grab";
    bindRanges(c, draw); $('[data-k="photo"]', c).addEventListener("change", load);
    $('[data-a="reset"]', c).onclick = () => { init(); draw(); };
    load();
  });

  /* ================================================================ Harris corners */
  sim("harris", "Corners: the Harris response", "image", (body, cfg) => {
    const c = ctrl(`${photoSelect(["coins", "camera", "text", "page", "astronaut", "brick"], cfg.photo || "camera")}${slider("Window σ", "sg", 0.5, 3, 0.25, 1.5)}${slider("k", "k", 0.02, 0.1, 0.01, 0.05)}${slider("Threshold (% of max)", "th", 1, 60, 1, 8, "int")}`);
    body.appendChild(c);
    const a = canvasEl(10, 10, "smooth"), r = canvasEl(10, 10, "smooth");
    place(body, panel("Corners found (red)", a), panel("Harris response (bright = corner-like, dark = edge-like)", r));
    const txt = el(`<div class="cv-readout"></div>`); body.appendChild(txt);
    const run = () => photo(val(c, "photo")).then((p) => {
      const s = Math.min(1, 250 / p.w), w = Math.round(p.w * s), h = Math.round(p.h * s), im = scaleTo(imageToCanvas(p.data), w, h).getContext("2d").getImageData(0, 0, w, h);
      const g = C.toGray(im).d, R = A.harris(g, w, h, num(c, "sg"), num(c, "k")), mx = Math.max(...R), thr = (num(c, "th") / 100) * mx, pts = [];
      for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) { const v = R[y * w + x]; if (v < thr) continue; let ok = true; for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (R[(y + dy) * w + x + dx] > v) { ok = false; break; } if (ok) pts.push([x, y]); }
      C.drawGray(a, { w, h, d: g }); a.style.width = w + "px"; const ctx = a.getContext("2d"); ctx.strokeStyle = "#f43f5e"; ctx.lineWidth = 1.6; for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.stroke(); }
      const mn = Math.min(...R), vis = R.map((v) => (v > 0 ? (v / mx) * 255 : (v / Math.abs(mn)) * 120));          // corners bright, edges negative (dark)
      C.drawGray(r, { w, h, d: Float32Array.from(vis, (v) => v + 128 * (v < 0 ? 1 : 0)) }, { lo: 0, hi: 255 }); r.style.width = w + "px";
      txt.innerHTML = `<b>${pts.length}</b> corners. Flat areas: response near 0. Edges: the response is <b>negative</b>. Corners: strongly <b>positive</b>. Lower the threshold to find more (weaker) corners.`;
    });
    bindRanges(c, run); run();
  });

  /* ================================================================ RANSAC */
  sim("ransac", "RANSAC: line fitting with outliers", "chart", (body, cfg) => {
    const c = ctrl(`${slider("Outliers %", "out", 0, 80, 5, 40, "int")}${slider("Inlier distance", "tol", 2, 20, 1, 6, "int")}<button class="sd-btn primary" data-a="step">Try one random pair</button><button class="sd-btn" data-a="run">Run 30 tries</button><button class="sd-btn" data-a="new">New data</button>`);
    body.appendChild(c);
    const W = 360, H = 260, cv = canvasEl(W, H); cv.style.width = W + "px";
    const readout = el(`<div class="cv-readout"></div>`);
    const side = el(`<div class="cv-panel" style="flex:1 1 220px"></div>`); side.appendChild(readout);
    place(body, panel("Blue = inlier of the best line so far. Grey = outlier", cv), side);
    let seed = 5, pts = [], best = null, tries = 0, cur = null, rnd = mulberry32(1);
    const build = () => {
      const r = mulberry32(seed); pts = []; best = null; tries = 0; cur = null; rnd = mulberry32(seed + 99);
      const n = 70, no = Math.round((n * num(c, "out")) / 100);
      for (let i = 0; i < n - no; i++) { const x = 20 + r() * (W - 40); pts.push([x, 200 - 0.45 * (x - 20) + C.gauss(r) * 4]); }
      for (let i = 0; i < no; i++) pts.push([20 + r() * (W - 40), 20 + r() * (H - 40)]);
    };
    const score = (a, b) => {                                    // line through points a and b: count points closer than tol
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, tol = num(c, "tol"); let n = 0;
      for (const p of pts) if (Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / len <= tol) n++;
      return n;
    };
    const draw = () => {
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, H);
      const line = (l, col, w, dash) => { if (!l) return; const [a, b] = l, dx = b[0] - a[0], dy = b[1] - a[1], k = 600 / (Math.hypot(dx, dy) || 1); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(a[0] - dx * k, a[1] - dy * k); ctx.lineTo(a[0] + dx * k, a[1] + dy * k); ctx.stroke(); ctx.setLineDash([]); };
      line(cur && cur.l, "#f59e0b", 1.5, [5, 4]); line(best && best.l, "#38bdf8", 2.5);
      const tol = num(c, "tol");
      for (const p of pts) { let inl = false; if (best) { const [a, b] = best.l, dx = b[0] - a[0], dy = b[1] - a[1]; inl = Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / (Math.hypot(dx, dy) || 1) <= tol; } ctx.fillStyle = inl ? "#38bdf8" : "#94a3b8"; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill(); }
      if (cur) { ctx.fillStyle = "#f59e0b"; for (const p of cur.l) { ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, 7); ctx.fill(); } }
      const no = Math.round((70 * num(c, "out")) / 100), p = best ? best.n / pts.length : 0;
      const need = Math.ceil(Math.log(1 - 0.99) / Math.log(1 - Math.pow(Math.max(0.01, 1 - num(c, "out") / 100), 2)));
      readout.innerHTML = `Tries so far: <b>${tries}</b><br>Last pair: <b>${cur ? cur.n : "-"}</b> inliers<br>Best so far: <b>${best ? best.n : "-"}</b> of ${pts.length} points (${(p * 100).toFixed(0)}%)<br><br>With ${num(c, "out")}% outliers, the chance that <i>both</i> random points are good is ${(Math.pow(1 - num(c, "out") / 100, 2) * 100).toFixed(0)}%. To be 99% sure that at least one try uses two good points you need about <b>${need}</b> tries: <code>N = log(1-0.99) / log(1-(1-ε)²)</code>.`;
    };
    const step = () => { const i = Math.floor(rnd() * pts.length); let j = Math.floor(rnd() * pts.length); if (j === i) j = (j + 1) % pts.length; const l = [pts[i], pts[j]]; cur = { l, n: score(l[0], l[1]) }; tries++; if (!best || cur.n > best.n) best = cur; draw(); };
    $('[data-a="step"]', c).onclick = step;
    $('[data-a="run"]', c).onclick = () => { for (let k = 0; k < 30; k++) step(); };
    $('[data-a="new"]', c).onclick = () => { seed = (seed * 13 + 7) % 997; build(); draw(); };
    bindRanges(c, () => { build(); draw(); }); build(); draw();
  });

  /* ================================================================ Hough transform */
  sim("hough", "Hough transform: voting for lines", "chart", (body, cfg) => {
    const c = ctrl(`${slider("Lines", "n", 1, 4, 1, 2, "int")}${slider("Noise points", "noise", 0, 600, 10, 150, "int")}${slider("Votes needed", "thr", 10, 120, 1, 45, "int")}<button class="sd-btn" data-a="new">New picture</button>`);
    body.appendChild(c);
    const S = 170, a = canvasEl(S, S), b = canvasEl(10, 10, "smooth"), cc = canvasEl(S, S);
    place(body, panel("Edge points (white) and the lines found (red)", a), panel("Accumulator: x = angle θ 0–179°, y = distance ρ. Bright = many votes", b));
    const txt = el(`<div class="cv-readout"></div>`); body.appendChild(txt);
    let seed = 7;
    const run = () => {
      const rnd = mulberry32(seed), n = num(c, "n"), diag = Math.ceil(Math.hypot(S, S)), pts = [], truth = [];
      for (let i = 0; i < n; i++) {                                                // random true lines as (θ, ρ)
        const th = rnd() * Math.PI, rho = (rnd() - 0.5) * S * 0.9 + (S / 2) * (Math.cos(th) + Math.sin(th));
        truth.push([th, rho]);
        for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) if (Math.abs(x * Math.cos(th) + y * Math.sin(th) - rho) < 0.5 && rnd() < 0.85) pts.push([x, y]);
      }
      for (let i = 0; i < num(c, "noise"); i++) pts.push([Math.floor(rnd() * S), Math.floor(rnd() * S)]);
      const T = 180, R = 2 * diag + 1, acc = new Float32Array(T * R); let max = 0;
      const cs = [], sn = []; for (let t = 0; t < T; t++) { cs.push(Math.cos((t * Math.PI) / T)); sn.push(Math.sin((t * Math.PI) / T)); }
      for (const [x, y] of pts) for (let t = 0; t < T; t++) { const r = Math.round(x * cs[t] + y * sn[t]) + diag; const v = ++acc[t * R + r]; if (v > max) max = v; }
      // draw accumulator (rows = rho, columns = theta)
      b.width = T; b.height = R; b.style.width = "360px"; b.style.height = "240px";
      const bc = b.getContext("2d"), bi = bc.createImageData(T, R);
      for (let t = 0; t < T; t++) for (let r = 0; r < R; r++) { const v = Math.min(1, acc[t * R + r] / Math.max(max, 1)), k = (r * T + t) * 4; bi.data[k] = 255 * Math.min(1, v * 2); bi.data[k + 1] = 255 * Math.max(0, v * 2 - 1); bi.data[k + 2] = 60 * v; bi.data[k + 3] = 255; }
      bc.putImageData(bi, 0, 0);
      // peaks: local maxima above the threshold
      const thr = num(c, "thr"), peaks = [];
      for (let t = 0; t < T; t++) for (let r = 0; r < R; r++) { const v = acc[t * R + r]; if (v < thr) continue; let ok = true; for (let dt = -6; dt <= 6 && ok; dt++) for (let dr = -6; dr <= 6; dr++) { const tt = t + dt, rr = r + dr; if (tt < 0 || tt >= T || rr < 0 || rr >= R) continue; const w = acc[tt * R + rr]; if (w > v || (w === v && (dt < 0 || (dt === 0 && dr < 0)))) { ok = false; break; } } if (ok) peaks.push([t, r, v]); }
      peaks.sort((p, q) => q[2] - p[2]);
      const ctx = a.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, S, S); ctx.fillStyle = "#fff"; for (const [x, y] of pts) ctx.fillRect(x, y, 1.5, 1.5);
      ctx.strokeStyle = "#f43f5e"; ctx.lineWidth = 1.5; bc.strokeStyle = "#38bdf8"; bc.lineWidth = 1;
      for (const [t, r] of peaks.slice(0, 8)) {
        const th = (t * Math.PI) / T, rho = r - diag, ca = Math.cos(th), sa = Math.sin(th); ctx.beginPath();
        if (Math.abs(sa) > 0.5) { ctx.moveTo(0, rho / sa); ctx.lineTo(S, (rho - S * ca) / sa); } else { ctx.moveTo(rho / ca, 0); ctx.lineTo((rho - S * sa) / ca, S); }
        ctx.stroke(); bc.strokeRect(t - 4, r - 4, 8, 8);
      }
      txt.innerHTML = `${pts.length} edge points. Highest vote count: <b>${max}</b>. Lines found above ${thr} votes: <b>${peaks.length}</b> (true lines: ${n}). Every point votes for <i>all</i> the lines that could pass through it; real lines collect many votes in one cell. Too many noise points or too low a threshold gives false lines; too high misses real ones.`;
    };
    $('[data-a="new"]', c).onclick = () => { seed = (seed * 7 + 3) % 1000; run(); };
    bindRanges(c, run); run();
  });
})();
