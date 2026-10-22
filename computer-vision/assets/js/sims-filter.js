/* ==========================================================================
   VisionLab simulators, part 2: image processing.
   convolve · blur · gradient · canny · threshold · histeq · morph · fourier
   (the algorithms are in cvalgo.js and are checked against OpenCV by tools/algo_test.py)
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp } = window.VIZ.SIM;
  const C = window.VIZ.SIM.cv, A = window.CVALGO;
  const { photo, drawGray, drawRGBA, drawMask, canvasEl, panel, bindRanges, num, val, chk, slider, place, note, ctrl, photoSelect, scaleTo, imageToCanvas, toGray, mulberry32, gauss, f2 } = C;

  // a grey, resized copy of a photo: { w, h, g: Float32Array }
  function grayPhoto(name, W) {
    return photo(name).then((p) => {
      const s = Math.min(1, W / p.w), w = Math.max(8, Math.round(p.w * s)), h = Math.max(8, Math.round(p.h * s));
      const im = scaleTo(imageToCanvas(p.data), w, h).getContext("2d").getImageData(0, 0, w, h);
      return { w, h, g: toGray(im).d, rgba: im };
    });
  }
  const showGray = (cv, w, h, d, opt) => { drawGray(cv, { w, h, d }, opt); cv.style.width = w + "px"; };
  const noisy = (g, w, h, kind, amount, seed = 3) => {
    const r = mulberry32(seed), out = Float32Array.from(g);
    if (kind === "gaussian") for (let i = 0; i < out.length; i++) out[i] = clamp(out[i] + gauss(r) * amount, 0, 255);
    else if (kind === "salt") for (let i = 0; i < out.length; i++) { const u = r(); if (u < amount / 200) out[i] = 0; else if (u < amount / 100) out[i] = 255; }
    return out;
  };

  /* ================================================================ convolution playground */
  const KERNELS = {
    identity: [0, 0, 0, 0, 1, 0, 0, 0, 0],
    "box blur": new Array(9).fill(1 / 9),
    "gaussian blur": [1 / 16, 2 / 16, 1 / 16, 2 / 16, 4 / 16, 2 / 16, 1 / 16, 2 / 16, 1 / 16],
    sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
    "edges (Laplacian)": [0, 1, 0, 1, -4, 1, 0, 1, 0],
    "outline": [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    "Sobel x (vertical edges)": [-1, 0, 1, -2, 0, 2, -1, 0, 1],
    "Sobel y (horizontal edges)": [-1, -2, -1, 0, 0, 0, 1, 2, 1],
    emboss: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
    "shift right by 1": [0, 0, 0, 0, 0, 1, 0, 0, 0],
  };
  sim("convolve", "Convolution playground", "conv", (body, cfg) => {
    const c = ctrl(`${photoSelect(["camera", "coins", "astronaut", "text", "moon"], cfg.photo || "camera")}
      <label>Kernel <select data-k="preset">${Object.keys(KERNELS).map((k) => `<option>${k}</option>`).join("")}</select></label>
      <label>Show <select data-k="mode"><option value="auto">stretched to fit</option><option value="abs">absolute value</option><option value="mid">add 128 (grey = zero)</option><option value="clamp">clamped 0–255</option></select></label>`);
    body.appendChild(c);
    const kernelBox = el(`<div class="cv-kernel" style="grid-template-columns:repeat(3,56px)"></div>`);
    const inputs = [];
    for (let i = 0; i < 9; i++) { const inp = el(`<input type="text" inputmode="decimal" value="0">`); inputs.push(inp); kernelBox.appendChild(inp); }
    const src = canvasEl(10, 10, "smooth pick"), out = canvasEl(10, 10, "smooth"), probe = el(`<div class="cv-mini">Move over the left picture (or tap it) to see the sum for one pixel.</div>`);
    const kp = panel("Kernel (type your own numbers)", kernelBox); kp.appendChild(probe);
    place(body, panel("Input (grey)", src), kp, panel("Output", out));
    let G = null;
    const kernel = () => inputs.map((i) => { const v = parseFloat(i.value.replace(",", ".")); return Number.isFinite(v) ? v : 0; });
    const render = () => {
      if (!G) return;
      const k = kernel(), r = A.convolve(G.g, G.w, G.h, k, 3, 3), mode = val(c, "mode"), d = new Float32Array(r.length);
      for (let i = 0; i < d.length; i++) d[i] = mode === "abs" ? Math.abs(r[i]) : mode === "mid" ? r[i] + 128 : r[i];
      showGray(out, G.w, G.h, d, mode === "auto" ? { auto: true } : mode === "abs" ? { lo: 0, hi: 255 } : { lo: 0, hi: 255 });
      const sum = k.reduce((a, b) => a + b, 0);
      $(".cv-mini", kp).dataset.sum = sum.toFixed(2);
    };
    const probeAt = (e) => {
      if (!G) return;
      const r = src.getBoundingClientRect(), p = e.touches ? e.touches[0] : e;
      const x = clamp(Math.floor(((p.clientX - r.left) / r.width) * G.w), 1, G.w - 2), y = clamp(Math.floor(((p.clientY - r.top) / r.height) * G.h), 1, G.h - 2);
      const k = kernel(); let s = 0, rows = [];
      for (let j = -1; j <= 1; j++) { const cells = []; for (let i = -1; i <= 1; i++) { const v = G.g[(y + j) * G.w + x + i], kv = k[(j + 1) * 3 + i + 1]; s += v * kv; cells.push(`${Math.round(v)}×${f2(kv)}`); } rows.push(cells.join("  ")); }
      probe.innerHTML = `pixel (x=${x}, y=${y})<br>${rows.join("<br>")}<br><b>sum = ${f2(s)}</b>`;
      drawGray(src, { w: G.w, h: G.h, d: G.g }); const ctx = src.getContext("2d"); ctx.strokeStyle = "#f43f5e"; ctx.lineWidth = 1.5; ctx.strokeRect(x - 1, y - 1, 3, 3);
    };
    src.addEventListener("pointermove", probeAt); src.addEventListener("pointerdown", probeAt);
    const setPreset = () => { KERNELS[val(c, "preset")].forEach((v, i) => (inputs[i].value = String(+v.toFixed(4)))); render(); };
    inputs.forEach((i) => i.addEventListener("input", render));
    const load = () => grayPhoto(val(c, "photo"), 210).then((g) => { G = g; showGray(src, g.w, g.h, g.g); render(); });
    $('[data-k="preset"]', c).addEventListener("change", setPreset); $('[data-k="mode"]', c).addEventListener("change", render); $('[data-k="photo"]', c).addEventListener("change", load);
    setPreset(); load();
    note(body, "The kernel is a small table of weights. For each pixel we multiply the 3 × 3 pixels around it by the weights and add them up. That sum becomes the new pixel. Try <b>edges</b>: the kernel adds to zero, so flat areas turn black. Try <b>sharpen</b> and <b>shift right</b>.");
  });

  /* ================================================================ blur and denoise comparison */
  sim("blur", "Remove noise: which filter?", "filter", (body, cfg) => {
    const c = ctrl(`${photoSelect(["camera", "coins", "astronaut", "cat"], cfg.photo || "camera")}
      <label>Noise <select data-k="noise"><option value="gaussian">Gaussian (grain)</option><option value="salt">Salt and pepper (dots)</option></select></label>${slider("Noise amount", "amt", 5, 60, 1, 25, "int")}
      <label>Filter <select data-k="filter"><option value="gauss">Gaussian blur</option><option value="box">Box blur</option><option value="median">Median</option><option value="bilateral">Bilateral</option></select></label>${slider("Strength", "s", 1, 4, 1, 2, "int")}`);
    body.appendChild(c);
    const a = canvasEl(10, 10, "smooth"), b = canvasEl(10, 10, "smooth"), d = canvasEl(10, 10, "smooth");
    place(body, panel("Clean photo", a), panel("Noisy photo", b), panel("After the filter", d));
    const stats = el(`<div class="cv-readout"></div>`); body.appendChild(stats);
    const run = () => grayPhoto(val(c, "photo"), 170).then((G) => {
      const { w, h } = G, amt = num(c, "amt"), s = num(c, "s"), kind = val(c, "noise"), f = val(c, "filter");
      const nz = noisy(G.g, w, h, kind, kind === "salt" ? amt / 2 : amt);
      const out = f === "gauss" ? A.gaussBlur(nz, w, h, s * 0.8) : f === "box" ? A.boxBlur(nz, w, h, s) : f === "median" ? A.median(nz, w, h, s) : A.bilateral(nz, w, h, s + 1, 20 + amt, 1.5 * s);
      showGray(a, w, h, G.g); showGray(b, w, h, nz); showGray(d, w, h, out);
      const psnr = (x) => { let m = 0; for (let i = 0; i < x.length; i++) m += (x[i] - G.g[i]) ** 2; m /= x.length; return 10 * Math.log10((255 * 255) / Math.max(m, 1e-6)); };
      stats.innerHTML = `PSNR (higher is closer to the clean photo): noisy <b>${psnr(nz).toFixed(1)} dB</b> → filtered <b>${psnr(out).toFixed(1)} dB</b>`;
    });
    bindRanges(c, run); run();
    note(body, "Try <b>Salt and pepper</b> with <b>Gaussian blur</b>: the dots only get smeared. Now choose <b>Median</b>: the dots vanish. Then look at the edges with <b>Bilateral</b>: it smooths flat areas but keeps the outlines sharp.");
  });

  /* ================================================================ gradients */
  sim("gradient", "Image gradient", "chart", (body, cfg) => {
    const c = ctrl(`${photoSelect(["camera", "coins", "astronaut", "rocket"], cfg.photo || "camera")}${slider("Pre-blur σ", "sg", 0, 3, 0.25, 1)}`);
    body.appendChild(c);
    const cv = [0, 1, 2, 3].map(() => canvasEl(10, 10, "smooth"));
    const caps = ["Grey photo", "Gx: change left → right", "Gy: change top → bottom", "Strength √(Gx² + Gy²), direction as colour"];
    place(body, ...cv.map((x, i) => panel(caps[i], x)));
    const run = () => grayPhoto(val(c, "photo"), 170).then((G) => {
      const { w, h } = G, g = A.gaussBlur(G.g, w, h, num(c, "sg")), s = A.sobel(g, w, h);
      showGray(cv[0], w, h, g); showGray(cv[1], w, h, s.gx.map((v) => v / 8 + 128)); showGray(cv[2], w, h, s.gy.map((v) => v / 8 + 128));
      cv[3].width = w; cv[3].height = h; cv[3].style.width = w + "px";
      const ctx = cv[3].getContext("2d"), im = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const m = Math.min(1, s.mag[i] / 200), hue = ((s.ang[i] + Math.PI) / (2 * Math.PI)) * 360, k = i * 4;
        const [r, gg, b] = hsl(hue, 0.9, m * 0.55); im.data[k] = r; im.data[k + 1] = gg; im.data[k + 2] = b; im.data[k + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
    });
    function hsl(h, s, l) { const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0) * 255, f(8) * 255, f(4) * 255]; }
    bindRanges(c, run); run();
    note(body, "The gradient says, at every pixel, <b>how fast</b> the brightness changes and <b>in which direction</b>. Grey in Gx/Gy means no change; white and black mean a jump one way or the other. In the last picture, bright means a strong edge and the colour tells the direction that edge faces.");
  });

  /* ================================================================ Canny step by step */
  sim("canny", "Canny, step by step", "filter", (body, cfg) => {
    const c = ctrl(`${photoSelect(["camera", "coins", "astronaut", "rocket"], cfg.photo || "coins")}${slider("Blur σ", "sg", 0.5, 3, 0.25, 1.25)}${slider("Low threshold", "lo", 5, 200, 1, 40, "int")}${slider("High threshold", "hi", 10, 400, 1, 100, "int")}`);
    body.appendChild(c);
    const cv = [0, 1, 2, 3].map(() => canvasEl(10, 10, "smooth"));
    const caps = ["1. Blur", "2. Gradient strength", "3. Thin ridges (non-max suppression)", "4. Two thresholds"];
    place(body, ...cv.map((x, i) => panel(caps[i], x)));
    const txt = el(`<div class="cv-readout"></div>`); body.appendChild(txt);
    const run = () => grayPhoto(val(c, "photo"), 170).then((G) => {
      const { w, h } = G; let lo = num(c, "lo"), hi = num(c, "hi"); if (lo > hi) lo = hi;
      const r = A.canny(G.g, w, h, num(c, "sg"), lo, hi);
      showGray(cv[0], w, h, r.blur); showGray(cv[1], w, h, r.mag, { lo: 0, hi: 300 }); showGray(cv[2], w, h, r.nms, { lo: 0, hi: 300 });
      cv[3].width = w; cv[3].height = h; cv[3].style.width = w + "px";
      const ctx = cv[3].getContext("2d"), im = ctx.createImageData(w, h); let strong = 0, weak = 0;
      for (let i = 0; i < w * h; i++) { const e = r.edges[i], k = i * 4; const v = e === 2 ? [255, 255, 255] : e === 1 ? [250, 160, 40] : [0, 0, 0]; im.data[k] = v[0]; im.data[k + 1] = v[1]; im.data[k + 2] = v[2]; im.data[k + 3] = 255; if (e === 2) strong++; if (e === 1) weak++; }
      ctx.putImageData(im, 0, 0);
      txt.innerHTML = `White = strong edge (above the high threshold): <b>${strong}</b> pixels. Orange = weak pixels that were kept because they touch a strong edge: <b>${weak}</b>. Everything else is dropped. Lower the high threshold to see more edges and more noise.`;
    });
    bindRanges(c, run); run();
  });

  /* ================================================================ thresholding */
  sim("threshold", "Thresholding", "filter", (body, cfg) => {
    const c = ctrl(`${photoSelect(["coins", "text", "page", "camera", "moon"], cfg.photo || "coins")}
      <label>Method <select data-k="m"><option value="global">Global (one number)</option><option value="otsu">Otsu (chosen for you)</option><option value="adaptive">Adaptive (local mean)</option></select></label>
      ${slider("Threshold", "t", 0, 255, 1, 120, "int")}${slider("Block radius", "r", 3, 40, 1, 15, "int")}${slider("Offset C", "cc", 0, 30, 1, 8, "int")}`);
    body.appendChild(c);
    const a = canvasEl(10, 10, "smooth"), b = canvasEl(10, 10, "smooth"), hist = el(`<div class="cv-chartbox" style="width:260px"></div>`);
    place(body, panel("Grey photo", a), panel("Result (white = 1)", b), panel("Histogram and threshold", hist));
    const txt = el(`<div class="cv-readout"></div>`); body.appendChild(txt);
    const run = () => grayPhoto(val(c, "photo"), 230).then((G) => {
      const { w, h } = G, m = val(c, "m"), hs = A.histogram(G.g); let t = num(c, "t");
      const o = A.otsu(hs); if (m === "otsu") t = o;
      let mask;
      if (m === "adaptive") mask = A.adaptiveThreshold(G.g, w, h, num(c, "r"), num(c, "cc"), true);
      else { mask = new Uint8Array(w * h); for (let i = 0; i < mask.length; i++) mask[i] = G.g[i] > t ? 1 : 0; }
      showGray(a, w, h, G.g); drawMask(b, mask, w, h); b.style.width = w + "px";
      const mx = Math.max(...hs); let bars = "";
      for (let i = 0; i < 256; i++) bars += `<rect x="${10 + i * 0.9}" y="${105 - (hs[i] / mx) * 95}" width="1" height="${(hs[i] / mx) * 95}" fill="var(--n3)"/>`;
      hist.innerHTML = `<svg viewBox="0 0 250 125">${bars}${m !== "adaptive" ? `<line x1="${10 + t * 0.9}" x2="${10 + t * 0.9}" y1="5" y2="108" stroke="var(--sd-bad)" stroke-width="2"/>` : ""}<text x="10" y="120">0</text><text x="215" y="120">255</text></svg>`;
      txt.innerHTML = m === "global" ? `Every pixel brighter than <b>${t}</b> becomes white. (Otsu would choose ${o}.)` : m === "otsu" ? `Otsu looked at the histogram and chose <b>${o}</b>, the value that best separates two groups.` : `Each pixel is compared with the average of its own neighbourhood (radius ${num(c, "r")}) minus ${num(c, "cc")}. This copes with uneven light. Try the <b>page</b> photo.`;
    });
    bindRanges(c, run); run();
  });

  /* ================================================================ histogram equalisation */
  sim("histeq", "Contrast: equalise and CLAHE", "chart", (body, cfg) => {
    const c = ctrl(`${photoSelect(["moon", "camera", "astronaut", "retina", "coffee"], cfg.photo || "moon")}
      <label>Method <select data-k="m"><option value="eq">Equalise (global)</option><option value="clahe">CLAHE (local)</option></select></label>${slider("Clip limit", "cl", 1, 8, 0.5, 3)}${slider("Tile grid", "grid", 2, 8, 1, 4, "int")}`);
    body.appendChild(c);
    const a = canvasEl(10, 10, "smooth"), b = canvasEl(10, 10, "smooth"), ha = el(`<div class="cv-chartbox" style="width:200px"></div>`), hb = el(`<div class="cv-chartbox" style="width:200px"></div>`);
    const pa = panel("Before", a); pa.appendChild(ha); const pb = panel("After", b); pb.appendChild(hb);
    place(body, pa, pb);
    const bars = (hs) => { const mx = Math.max(...hs, 1); let s = ""; for (let i = 0; i < 256; i++) s += `<rect x="${i * 0.78}" y="${60 - (hs[i] / mx) * 56}" width="0.9" height="${(hs[i] / mx) * 56}" fill="var(--n3)"/>`; return `<svg viewBox="0 0 200 66">${s}</svg>`; };
    const run = () => grayPhoto(val(c, "photo"), 220).then((G) => {
      const { w, h } = G, m = val(c, "m"), out = m === "eq" ? A.equalizeHist(G.g) : A.clahe(G.g, w, h, num(c, "cl"), num(c, "grid"));
      showGray(a, w, h, G.g); showGray(b, w, h, out); ha.innerHTML = bars(A.histogram(G.g)); hb.innerHTML = bars(A.histogram(out));
    });
    bindRanges(c, run); run();
    note(body, "Equalising spreads the brightness values so the histogram fills the whole range. It lifts hidden detail, but it can also blow up noise. <b>CLAHE</b> does it in small tiles and limits how much any value can be boosted, which looks more natural.");
  });

  /* ================================================================ morphology */
  sim("morph", "Morphology", "filter", (body, cfg) => {
    const c = ctrl(`<label>Picture <select data-k="src"><option value="coins">coins (thresholded)</option><option value="text">text (thresholded)</option><option value="horse">horse silhouette</option></select></label>
      <label>Operation <select data-k="op"><option>erode</option><option>dilate</option><option selected>open</option><option>close</option><option>gradient</option></select></label>
      ${slider("Size (radius)", "r", 1, 6, 1, 2, "int")}<label>Shape <select data-k="sh"><option value="square">square</option><option value="disc">disc</option></select></label><label><input type="checkbox" data-k="noise" checked> add speckles and holes</label>`);
    body.appendChild(c);
    const a = canvasEl(10, 10), b = canvasEl(10, 10);
    place(body, panel("Binary input", a), panel("Result", b));
    const run = () => grayPhoto(val(c, "src"), 210).then((G) => {
      const { w, h } = G, name = val(c, "src");
      let t = A.otsu(A.histogram(G.g)); const m = new Uint8Array(w * h);
      for (let i = 0; i < m.length; i++) m[i] = name === "text" ? (G.g[i] < t ? 1 : 0) : name === "horse" ? (G.g[i] < 128 ? 1 : 0) : (G.g[i] > t ? 1 : 0);
      if (chk(c, "noise")) { const r = mulberry32(5); for (let i = 0; i < m.length; i++) { const u = r(); if (u < 0.015) m[i] = 1; else if (u > 0.985) m[i] = 0; } }
      const out = A.morph(m, w, h, num(c, "r"), val(c, "op"), val(c, "sh"));
      drawMask(a, m, w, h); a.style.width = w + "px"; drawMask(b, out, w, h); b.style.width = w + "px";
    });
    bindRanges(c, run); run();
    note(body, "<b>Erode</b> shrinks white shapes (specks disappear). <b>Dilate</b> grows them (holes fill). <b>Open</b> = erode then dilate: removes small white specks and keeps big shapes the same size. <b>Close</b> = dilate then erode: fills small holes. <b>Gradient</b> = the outline.");
  });

  /* ================================================================ Fourier */
  sim("fourier", "Frequencies of an image", "chart", (body, cfg) => {
    const c = ctrl(`${photoSelect(["camera", "astronaut", "coins", "text", "brick"], cfg.photo || "camera")}
      <label>Filter <select data-k="m"><option value="low">Low-pass (keep slow changes)</option><option value="high">High-pass (keep fast changes)</option><option value="band">Band-pass (ring)</option><option value="none">None</option></select></label>${slider("Radius", "rad", 2, 60, 1, 14, "int")}`);
    body.appendChild(c);
    const a = canvasEl(10, 10, "smooth"), s = canvasEl(10, 10, "smooth"), b = canvasEl(10, 10, "smooth");
    place(body, panel("Picture 128 × 128", a), panel("Spectrum (centre = slow, edges = fast). Red = kept", s), panel("After the filter", b));
    const N = 128;
    const run = () => photo(val(c, "photo")).then((p) => {
      const side = Math.min(p.w, p.h), cx = (p.w - side) >> 1, cy = (p.h - side) >> 1, tmp = document.createElement("canvas"); tmp.width = tmp.height = N;
      tmp.getContext("2d", { willReadFrequently: true }).drawImage(imageToCanvas(p.data), cx, cy, side, side, 0, 0, N, N);
      const g = toGray(tmp.getContext("2d").getImageData(0, 0, N, N)).d, re = Float64Array.from(g), im = new Float64Array(N * N);
      A.fft2(re, im, N, N, false);
      const R = num(c, "rad"), m = val(c, "m"), keep = new Uint8Array(N * N), mag = new Float64Array(N * N);
      const fr = new Float64Array(N * N), fi = new Float64Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = ((x + N / 2) % N) - N / 2, v = ((y + N / 2) % N) - N / 2, d = Math.hypot(u, v), i = y * N + x;
        const k = m === "none" ? 1 : m === "low" ? d <= R : m === "high" ? d >= R : Math.abs(d - R) <= Math.max(3, R * 0.25);
        keep[i] = k ? 1 : 0; fr[i] = k ? re[i] : 0; fi[i] = k ? im[i] : 0; mag[i] = Math.log(1 + Math.hypot(re[i], im[i]));
      }
      A.fft2(fr, fi, N, N, true);
      showGray(a, N, N, g); showGray(b, N, N, Float32Array.from(fr), { lo: 0, hi: 255 });
      a.style.width = "200px"; b.style.width = "200px";
      const sh = A.shift2(mag, N, N), keepS = A.shift2(Float64Array.from(keep), N, N), mx = Math.max(...sh);
      s.width = N; s.height = N; s.style.width = "200px";
      const ctx = s.getContext("2d"), img = ctx.createImageData(N, N);
      for (let i = 0; i < N * N; i++) { const v = (sh[i] / mx) * 255, k = i * 4, on = keepS[i]; img.data[k] = on ? v * 0.6 + 100 : v * 0.35; img.data[k + 1] = on ? v * 0.6 : v * 0.35; img.data[k + 2] = on ? v * 0.6 : v * 0.35; img.data[k + 3] = 255; }
      ctx.putImageData(img, 0, 0);
    });
    bindRanges(c, run); run();
    note(body, "Any picture is a sum of waves. <b>Slow</b> waves (the centre of the spectrum) hold the big shapes and smooth shading. <b>Fast</b> waves (the outside) hold edges and fine detail. <b>Low-pass</b> blurs the picture. <b>High-pass</b> leaves only the edges (it looks dark because the average brightness is removed).");
  });
})();
