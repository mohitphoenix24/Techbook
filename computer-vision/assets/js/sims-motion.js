/* ==========================================================================
   VisionLab simulators, part 5: motion and tracking.
   kalman
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp } = window.VIZ.SIM;
  const C = window.VIZ.SIM.cv;
  const { canvasEl, panel, bindRanges, num, val, chk, slider, place, note, ctrl, mulberry32, gauss, f2 } = C;

  /* small dense matrix helpers (arrays of rows) */
  const mm = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, _, k) => s + A[0].length * 0 + r[k] * B[k][j], 0)));
  const tr = (A) => A[0].map((_, j) => A.map((r) => r[j]));
  const add = (A, B) => A.map((r, i) => r.map((v, j) => v + B[i][j]));
  const sub = (A, B) => A.map((r, i) => r.map((v, j) => v - B[i][j]));
  const eye = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const inv2 = (M) => { const d = M[0][0] * M[1][1] - M[0][1] * M[1][0]; return [[M[1][1] / d, -M[0][1] / d], [-M[1][0] / d, M[0][0] / d]]; };

  sim("kalman", "Kalman filter: smoothing a noisy track", "chart", (body, cfg) => {
    const c = ctrl(`${slider("Measurement noise σ (px)", "r", 1, 25, 1, 8, "int")}${slider("Process noise q (how much the speed may change)", "q", 0.01, 3, 0.01, 0.3)}${slider("Missed detections %", "miss", 0, 70, 5, 20, "int")}<button class="sd-btn" data-a="new">New noise</button>`);
    body.appendChild(c);
    const W = 420, H = 220, cv = canvasEl(W, H); cv.style.width = W + "px";
    const readout = el(`<div class="cv-readout" style="max-width:480px"></div>`), side = el(`<div class="cv-panel" style="flex:1 1 240px"></div>`); side.appendChild(readout);
    place(body, panel("Grey: true path. Red: noisy measurements. Blue: Kalman estimate (circle = uncertainty)", cv), side);
    let seed = 3;
    const run = () => {
      const rnd = mulberry32(seed), rs = num(c, "r"), q = num(c, "q"), miss = num(c, "miss") / 100, N = 60;
      const truth = []; for (let t = 0; t < N; t++) truth.push([25 + (t * (W - 60)) / N, H / 2 + 55 * Math.sin(t / 9) + 0.0]);
      const meas = truth.map(([x, y]) => (rnd() < miss ? null : [x + gauss(rnd) * rs, y + gauss(rnd) * rs]));
      // constant-velocity model: state [x, y, vx, vy]
      const F = [[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], Hm = [[1, 0, 0, 0], [0, 1, 0, 0]], Rm = [[rs * rs, 0], [0, rs * rs]];
      const Q = [[q / 4, 0, q / 2, 0], [0, q / 4, 0, q / 2], [q / 2, 0, q, 0], [0, q / 2, 0, q]];
      let x = [[meas.find((m) => m)?.[0] ?? 0], [meas.find((m) => m)?.[1] ?? 0], [0], [0]], P = [[rs * rs, 0, 0, 0], [0, rs * rs, 0, 0], [0, 0, 100, 0], [0, 0, 0, 100]];
      const est = [], unc = []; let errM = 0, nM = 0, errE = 0;
      for (let t = 0; t < N; t++) {
        x = mm(F, x); P = add(mm(mm(F, P), tr(F)), Q);                                   // predict
        if (meas[t]) {                                                                   // update with a measurement
          const S = add(mm(mm(Hm, P), tr(Hm)), Rm), K = mm(mm(P, tr(Hm)), inv2(S)), y = [[meas[t][0] - x[0][0]], [meas[t][1] - x[1][0]]];
          x = add(x, mm(K, y)); P = mm(sub(eye(4), mm(K, Hm)), P);
        }
        est.push([x[0][0], x[1][0]]); unc.push(Math.sqrt((P[0][0] + P[1][1]) / 2));
        errE += Math.hypot(est[t][0] - truth[t][0], est[t][1] - truth[t][1]) ** 2;
        if (meas[t]) { errM += Math.hypot(meas[t][0] - truth[t][0], meas[t][1] - truth[t][1]) ** 2; nM++; }
      }
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#64748b"; ctx.lineWidth = 2; ctx.beginPath(); truth.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke();
      ctx.fillStyle = "#f43f5e"; meas.forEach((m) => { if (m) { ctx.beginPath(); ctx.arc(m[0], m[1], 2.6, 0, 7); ctx.fill(); } });
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2.2; ctx.beginPath(); est.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke();
      ctx.strokeStyle = "rgba(56,189,248,.35)"; ctx.lineWidth = 1; for (let i = 0; i < N; i += 6) { ctx.beginPath(); ctx.arc(est[i][0], est[i][1], Math.min(60, unc[i] * 2), 0, 7); ctx.stroke(); }
      const rmsM = Math.sqrt(errM / Math.max(1, nM)), rmsE = Math.sqrt(errE / N);
      readout.innerHTML = `Measurement error (RMS): <b>${rmsM.toFixed(1)} px</b><br>Kalman estimate error (RMS): <b>${rmsE.toFixed(1)} px</b><br><br>The filter <b>predicts</b> where the object should be (using its speed), then <b>corrects</b> the prediction with the measurement. It weighs the two by how much it trusts each: the <b>Kalman gain</b>.<br><br>• Raise the <b>measurement noise</b>: the filter trusts the measurements less and smooths more.<br>• Raise <b>q</b>: the filter believes the object can change speed, so it follows the measurements more (and lags less on turns, but is noisier).<br>• Add <b>missed detections</b>: it keeps going on predictions alone, and the circle (uncertainty) grows until the next measurement.`;
    };
    $('[data-a="new"]', c).onclick = () => { seed = (seed * 7 + 5) % 991; run(); };
    bindRanges(c, run); run();
  });
})();
