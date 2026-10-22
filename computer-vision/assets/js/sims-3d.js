/* ==========================================================================
   VisionLab simulators, part 4: camera geometry and 3-D.
   pinhole · epipolar · stereo
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp } = window.VIZ.SIM;
  const C = window.VIZ.SIM.cv;
  const { canvasEl, panel, bindRanges, num, val, chk, slider, place, note, ctrl, mulberry32, f2 } = C;

  const rotY = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const mulV = (R, p) => [R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2], R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2], R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]];
  const css = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

  /* ================================================================ pinhole camera */
  sim("pinhole", "Pinhole camera: from 3-D to pixels", "camera", (body, cfg) => {
    const c = ctrl(`${slider("Focal length f (pixels)", "f", 80, 900, 10, 300, "int")}${slider("Distance to the box (m)", "d", 2, 14, 0.5, 6)}${slider("Turn the box °", "yaw", 0, 90, 1, 25, "int")}<label><input type="checkbox" data-k="dolly"> dolly zoom</label>`);
    body.appendChild(c);
    const W = 320, H = 240, cv = canvasEl(W, H, "smooth"); cv.style.width = W + "px"; cv.style.background = "#0f172a";
    const readout = el(`<div class="cv-readout"></div>`), side = el(`<div class="cv-panel" style="flex:1 1 240px"></div>`); side.appendChild(readout);
    place(body, panel("What the camera sees (image 320 × 240)", cv), side);
    const cube = []; for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) cube.push([x, y, z]);
    const edges = []; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const d = (i ^ j); if (d === 1 || d === 2 || d === 4) edges.push([i, j]); }
    const f0 = 300, d0 = 6;
    const draw = () => {
      let f = num(c, "f"), D = num(c, "d"); if (chk(c, "dolly")) D = d0 * (f / f0);               // dolly zoom: move the camera so that the box keeps the same size
      const ctx = cv.getContext("2d"), cx = W / 2, cy = H / 2, yaw = (num(c, "yaw") * Math.PI) / 180, R = rotY(yaw);
      ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, H);
      const proj = (p) => { const z = p[2] + D; return z > 0.05 ? [cx + (f * p[0]) / z, cy + (f * (p[1] + 0.9)) / z] : null; };      // box sits on a floor at y = +0.9 (y points down)
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(148,163,184,.55)";                                                                    // floor grid: lines that go away from the camera meet at the horizon
      for (let gx = -6; gx <= 6; gx++) { const a = proj([gx, 0, -D + 0.3]), b = proj([gx, 0, 40]); if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
      for (let gz = 0; gz <= 40; gz += 2) { const a = proj([-8, 0, gz - D]), b = proj([8, 0, gz - D]); if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
      const pts = cube.map((p) => { const q = mulV(R, p); return proj([q[0], q[1] - 0.5, q[2]]); });
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2.2; for (const [i, j] of edges) if (pts[i] && pts[j]) { ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke(); }
      ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill();
      const hor = cy; ctx.strokeStyle = "rgba(250,204,21,.5)"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, hor); ctx.lineTo(W, hor); ctx.stroke(); ctx.setLineDash([]);
      const fov = (2 * Math.atan(W / (2 * f)) * 180) / Math.PI, size = (f * 1) / D;
      readout.innerHTML = `<b>u = f · X / Z + c<sub>x</sub></b>, <b>v = f · Y / Z + c<sub>y</sub></b><br><br>Field of view (horizontal): <b>${fov.toFixed(0)}°</b> = 2·atan(W / 2f)<br>A 1 m box at ${D.toFixed(1)} m is about <b>${size.toFixed(0)}</b> pixels wide.<br><br>• Larger <b>f</b> (zoom in): everything gets bigger and the view narrower.<br>• Larger <b>distance</b>: things get smaller (size ∝ 1/Z).<br>• The yellow dot is the principal point (image centre); the dashed line is the horizon.<br>• Try <b>dolly zoom</b>: the camera moves back while f grows, so the box keeps its size but the background gets squeezed closer, because only <i>depth</i> changes perspective.`;
    };
    bindRanges(c, draw); draw();
  });

  /* ================================================================ epipolar geometry */
  sim("epipolar", "Epipolar lines: click a point", "camera", (body, cfg) => {
    const c = ctrl(`${slider("Baseline (m)", "b", 0.2, 2, 0.05, 0.8)}${slider("Right camera turn °", "yaw", -25, 25, 1, -6, "int")}<button class="sd-btn" data-a="new">New 3-D points</button>`);
    body.appendChild(c);
    const W = 260, H = 190, f = 230, cx = W / 2, cy = H / 2, a = canvasEl(W, H), b = canvasEl(W, H);
    a.style.width = b.style.width = W + "px"; a.style.cursor = "crosshair";
    const readout = el(`<div class="cv-readout" style="max-width:520px"></div>`);
    place(body, panel("Left image: click a point", a), panel("Right image: the match must lie on the line", b));
    body.appendChild(el(`<div class="sd-note-line"></div>`)).appendChild(readout);
    let seed = 4, X = [], sel = 0;
    const build = () => { const r = mulberry32(seed); X = []; for (let i = 0; i < 45; i++) X.push([(r() - 0.5) * 3.2, (r() - 0.5) * 1.8, 3.2 + r() * 2.4]); };
    const cross = (t) => [[0, -t[2], t[1]], [t[2], 0, -t[0]], [-t[1], t[0], 0]];
    const matMul = (A, B) => A.map((row, i) => B[0].map((_, j) => row.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
    const T = (A) => A[0].map((_, j) => A.map((r) => r[j]));
    const draw = () => {
      const base = num(c, "b"), R = rotY((num(c, "yaw") * Math.PI) / 180), t = mulV(R, [-base, 0, 0]);       // x2 = R (X - C2), C2 = (base, 0, 0)
      const K = [[f, 0, cx], [0, f, cy], [0, 0, 1]], Ki = [[1 / f, 0, -cx / f], [0, 1 / f, -cy / f], [0, 0, 1]];
      const E = matMul(cross(t), R), F = matMul(matMul(T(Ki), E), Ki);                                           // F = K^-T [t]x R K^-1
      const p1 = X.map((p) => [cx + (f * p[0]) / p[2], cy + (f * p[1]) / p[2]]);
      const X2 = X.map((p) => mulV(R, [p[0] - base, p[1], p[2]])), p2 = X2.map((p) => [cx + (f * p[0]) / p[2], cy + (f * p[1]) / p[2]]);
      const cA = a.getContext("2d"), cB = b.getContext("2d");
      for (const [cc, pts, col] of [[cA, p1, "#94a3b8"], [cB, p2, "#94a3b8"]]) { cc.fillStyle = "#0f172a"; cc.fillRect(0, 0, W, H); cc.strokeStyle = "#334155"; cc.strokeRect(0.5, 0.5, W - 1, H - 1); cc.fillStyle = col; pts.forEach(([x, y]) => { if (x > 0 && x < W && y > 0 && y < H) { cc.beginPath(); cc.arc(x, y, 3, 0, 7); cc.fill(); } }); }
      const x1 = [p1[sel][0], p1[sel][1], 1], l = [F[0][0] * x1[0] + F[0][1] * x1[1] + F[0][2], F[1][0] * x1[0] + F[1][1] * x1[1] + F[1][2], F[2][0] * x1[0] + F[2][1] * x1[1] + F[2][2]];
      cA.fillStyle = "#f59e0b"; cA.beginPath(); cA.arc(p1[sel][0], p1[sel][1], 5.5, 0, 7); cA.fill();
      cB.strokeStyle = "#f59e0b"; cB.lineWidth = 1.5; cB.beginPath();
      if (Math.abs(l[1]) > 1e-9) { cB.moveTo(0, -l[2] / l[1]); cB.lineTo(W, -(l[2] + l[0] * W) / l[1]); } else { cB.moveTo(-l[2] / l[0], 0); cB.lineTo(-l[2] / l[0], H); } cB.stroke();
      cB.fillStyle = "#38bdf8"; cB.beginPath(); cB.arc(p2[sel][0], p2[sel][1], 5.5, 0, 7); cB.fill();
      const x2 = [p2[sel][0], p2[sel][1], 1], resid = Math.abs(x2[0] * l[0] + x2[1] * l[1] + l[2]) / Math.hypot(l[0], l[1]);
      readout.innerHTML = `Orange = the clicked point and its <b>epipolar line</b>. Blue = the true match (it is on the line, distance <b>${resid.toFixed(3)}</b> px). The line is <b>F·x</b>, and <b>x'ᵀ F x = 0</b> for every correct match. So the search for a match is <b>one-dimensional</b>, not two. Change the baseline or turn the right camera and the lines tilt. With a pure sideways shift and no turn (try yaw 0) the lines become <b>horizontal</b>: that is what <i>rectification</i> achieves.`;
    };
    a.addEventListener("pointerdown", (e) => { const r = a.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H; let best = 1e9; X.forEach((p, i) => { const u = cx + (f * p[0]) / p[2], v = cy + (f * p[1]) / p[2], d = Math.hypot(u - x, v - y); if (d < best) { best = d; sel = i; } }); draw(); });
    $('[data-a="new"]', c).onclick = () => { seed = (seed * 11 + 5) % 991; build(); sel = 0; draw(); };
    bindRanges(c, draw); build(); draw();
  });

  /* ================================================================ stereo depth */
  sim("stereo", "Stereo: disparity and depth", "camera", (body, cfg) => {
    const c = ctrl(`${slider("Baseline B (cm)", "b", 2, 40, 1, 12, "int")}${slider("Focal length f (pixels)", "f", 300, 1400, 10, 700, "int")}${slider("Matching error (pixels)", "e", 0.1, 2, 0.1, 0.5)}`);
    body.appendChild(c);
    const W = 360, H = 120, view = canvasEl(W, H), chart = el(`<div class="cv-chartbox" style="width:360px"></div>`), readout = el(`<div class="cv-readout" style="max-width:520px"></div>`);
    place(body, panel("Left (top) and right (bottom) views of three objects", view), panel("Depth error grows with distance", chart));
    body.appendChild(el(`<div class="sd-note-line"></div>`)).appendChild(readout);
    const objs = [{ Z: 0.8, col: "#38bdf8", x: -0.12 }, { Z: 2, col: "#a3e635", x: 0.05 }, { Z: 5, col: "#f59e0b", x: 0.25 }];
    const draw = () => {
      const B = num(c, "b") / 100, f = num(c, "f"), e = num(c, "e"), ctx = view.getContext("2d");
      ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = "#334155"; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      const rows = [];
      for (const o of objs) {
        const d = (f * B) / o.Z, xl = W / 2 + (f * o.x) / o.Z * 0.35 * 1, size = Math.max(6, 28 / Math.sqrt(o.Z));
        ctx.fillStyle = o.col; ctx.fillRect(xl - size / 2, 12, size, H / 2 - 24); ctx.fillRect(xl - d * 0.35 - size / 2, H / 2 + 12, size, H / 2 - 24);   // the right view: shifted left by the disparity (scaled for display)
        ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xl, H / 2 - 12); ctx.lineTo(xl - d * 0.35, H / 2 + 12); ctx.stroke(); ctx.setLineDash([]);
        rows.push(`<tr><td>${o.Z} m</td><td>${d.toFixed(1)} px</td><td>± ${(((o.Z * o.Z) / (f * B)) * e * 100).toFixed(1)} cm</td></tr>`);
      }
      readout.innerHTML = `<b>Z = f · B / d</b> (depth = focal length × baseline / disparity)<table class="cv-nums" style="margin:8px 0;font:12.5px var(--mono)"><tr><td style="width:auto;padding:2px 10px">depth</td><td style="width:auto;padding:2px 10px">disparity</td><td style="width:auto;padding:2px 10px">depth error from ${e} px matching error</td></tr>${rows.join("")}</table>Near objects move a lot between the two views (large disparity); far objects hardly move. The depth error grows with <b>Z²</b>: a small matching error costs little up close and a lot far away. A <b>longer baseline</b> or a <b>longer focal length</b> improves far-range accuracy.`;
      let path = ""; for (let Z = 0.5; Z <= 10; Z += 0.25) { const err = ((Z * Z) / (f * B)) * e * 100; path += `${Z === 0.5 ? "M" : "L"}${(20 + (Z / 10) * 330).toFixed(1)},${(105 - Math.min(95, err * 0.9)).toFixed(1)}`; }
      chart.innerHTML = `<svg viewBox="0 0 360 120"><path d="${path}" fill="none" stroke="var(--accent-2)" stroke-width="2.4"/><line x1="20" y1="105" x2="350" y2="105" stroke="var(--border-2)"/><text x="20" y="117">0.5 m</text><text x="318" y="117">10 m</text><text x="24" y="14">depth error (cm), clipped at 105</text></svg>`;
    };
    bindRanges(c, draw); draw();
  });
})();
