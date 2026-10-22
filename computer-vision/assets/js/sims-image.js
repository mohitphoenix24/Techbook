/* ==========================================================================
   VisionLab simulators, part 1: pixels, colour and cameras.
   Shared helpers live in window.VIZ.SIM.cv (photo loading, grey conversion, drawing, colour spaces),
   so the other sims-*.js files can use them.
   Sims: pixels · channels · hsvmask · bayer · gamma
   ========================================================================== */
(function () {
  "use strict";
  const { sim, el, esc, $, $$, clamp } = window.VIZ.SIM;

  /* ---------------------------------------------------------------- shared helpers */
  const BASE = new URL("assets/img/", document.baseURI).href;
  const EXT = { page: "png", text: "png", horse: "png" };
  const PHOTOS = ["astronaut", "coffee", "cat", "camera", "coins", "rocket", "retina", "moon", "text", "page", "brick", "gravel", "grass"];
  const cache = new Map();

  function photo(name) {
    if (!cache.has(name)) {
      cache.set(name, new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement("canvas");
          c.width = im.naturalWidth; c.height = im.naturalHeight;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(im, 0, 0);
          resolve({ name, w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height) });
        };
        im.onerror = () => reject(new Error("could not load photo " + name));
        im.src = BASE + name + "." + (EXT[name] || "jpg");
      }));
    }
    return cache.get(name);
  }
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (rnd) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
  const ctrl = (html) => el(`<div class="sd-ctrls">${html}</div>`);
  const photoSelect = (names, sel) => `<label>Photo <select data-k="photo">${(names || PHOTOS).map((n) => `<option value="${n}"${n === sel ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
  const f2 = (v) => (Math.round(v * 100) / 100).toString();

  // grey image as Float32Array (0..255) from ImageData
  function toGray(img) {
    const { width: w, height: h, data } = img, d = new Float32Array(w * h);
    for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    return { w, h, d };
  }
  // resize ImageData-like {w,h,data} to a new width (area-ish, bilinear is enough for demos)
  function scaleTo(canvasSrc, w, h, smooth = true) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingEnabled = smooth;
    x.drawImage(canvasSrc, 0, 0, w, h);
    return c;
  }
  function imageToCanvas(img) {
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    c.getContext("2d").putImageData(img, 0, 0);
    return c;
  }
  // draw a grey Float32 image (or three-channel [r,g,b] Float32 arrays) onto a canvas
  function drawGray(canvas, g, { lo = 0, hi = 255, auto = false } = {}) {
    if (auto) { lo = Infinity; hi = -Infinity; for (const v of g.d) { if (v < lo) lo = v; if (v > hi) hi = v; } if (hi <= lo) hi = lo + 1; }
    canvas.width = g.w; canvas.height = g.h;
    const ctx = canvas.getContext("2d"), out = ctx.createImageData(g.w, g.h), s = 255 / (hi - lo);
    for (let i = 0, j = 0; i < g.d.length; i++, j += 4) { const v = clamp((g.d[i] - lo) * s, 0, 255); out.data[j] = out.data[j + 1] = out.data[j + 2] = v; out.data[j + 3] = 255; }
    ctx.putImageData(out, 0, 0);
  }
  function drawRGBA(canvas, img) { canvas.width = img.width; canvas.height = img.height; canvas.getContext("2d").putImageData(img, 0, 0); }
  function drawMask(canvas, m, w, h, rgb = [255, 255, 255]) {       // Uint8 mask (0/1) -> white on black
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d"), out = ctx.createImageData(w, h);
    for (let i = 0, j = 0; i < m.length; i++, j += 4) { const on = m[i] ? 1 : 0; out.data[j] = rgb[0] * on; out.data[j + 1] = rgb[1] * on; out.data[j + 2] = rgb[2] * on; out.data[j + 3] = 255; }
    ctx.putImageData(out, 0, 0);
  }
  function canvasEl(w, h, cls = "") { const c = document.createElement("canvas"); c.width = w; c.height = h; c.className = "cv-canvas " + cls; return c; }
  const panel = (title, node, extra = "") => { const p = el(`<div class="cv-panel"><div class="cv-cap">${title}</div></div>`); p.appendChild(node); if (extra) p.insertAdjacentHTML("beforeend", extra); return p; };
  function bindRanges(root, fn) {
    $$('input[type="range"]', root).forEach((r) => { r.addEventListener("input", () => { const o = r.nextElementSibling; if (o && o.tagName === "OUTPUT") o.textContent = r.dataset.fmt === "int" ? Math.round(+r.value) : f2(+r.value); fn(); }); });
    $$("select,input[type=checkbox]", root).forEach((s) => s.addEventListener("change", fn));
  }
  const num = (root, k) => +$(`[data-k="${k}"]`, root).value;
  const val = (root, k) => $(`[data-k="${k}"]`, root).value;
  const chk = (root, k) => $(`[data-k="${k}"]`, root).checked;
  const slider = (label, k, min, max, step, v, fmt) => `<label>${label} <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-k="${k}"${fmt ? ` data-fmt="${fmt}"` : ""}><output>${fmt === "int" ? Math.round(v) : f2(v)}</output></label>`;
  const place = (body, ...nodes) => { const stage = el(`<div class="cv-stage"></div>`); nodes.forEach((n) => stage.appendChild(n)); body.appendChild(stage); return stage; };
  const note = (body, html) => body.appendChild(el(`<div class="sd-note-line">${html}</div>`));
  const whenPhoto = (name, fn) => photo(name).then(fn).catch((e) => console.error(e));

  /* ---- colour spaces (OpenCV 8-bit conventions) ---- */
  function rgb2hsv(r, g, b) {                  // H 0..179, S 0..255, V 0..255
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) {
      if (mx === r) h = (60 * (g - b)) / d; else if (mx === g) h = 120 + (60 * (b - r)) / d; else h = 240 + (60 * (r - g)) / d;
      if (h < 0) h += 360;
    }
    return [h / 2, mx ? (d / mx) * 255 : 0, mx];
  }
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  function rgb2lab(r, g, b) {                  // L 0..255 (L*2.55), a, b offset by 128
    const R = lin(r), G = lin(g), B = lin(b);
    let X = (0.412453 * R + 0.35758 * G + 0.180423 * B) / 0.950456, Y = 0.212671 * R + 0.71516 * G + 0.072169 * B, Z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / 1.088754;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(X), fy = f(Y), fz = f(Z);
    const L = Y > 0.008856 ? 116 * fy - 16 : 903.3 * Y;
    return [(L * 255) / 100, 500 * (fx - fy) + 128, 200 * (fy - fz) + 128];
  }
  function rgb2ycrcb(r, g, b) { const y = 0.299 * r + 0.587 * g + 0.114 * b; return [y, (r - y) * 0.713 + 128, (b - y) * 0.564 + 128]; }
  const SPACES = {
    RGB: { names: ["R (red)", "G (green)", "B (blue)"], conv: (r, g, b) => [r, g, b], note: "Each channel is how much of that colour of light there is. The three channels look alike because brightness is mixed into all three." },
    HSV: { names: ["H (hue: which colour)", "S (saturation: how pure)", "V (value: how bright)"], conv: rgb2hsv, note: "Hue is the colour itself, on a circle (red is both 0 and 179). Saturation is how far from grey. Value is brightness. Lighting changes mostly V, so HSV is good for picking colours." },
    Lab: { names: ["L (lightness)", "a (green ↔ red)", "b (blue ↔ yellow)"], conv: rgb2lab, note: "Lab separates lightness (L) from colour (a, b). Distances in Lab match how different two colours look to people, so it is used for colour comparison." },
    YCrCb: { names: ["Y (brightness)", "Cr (red difference)", "Cb (blue difference)"], conv: rgb2ycrcb, note: "Y is the grey picture. Cr and Cb hold the colour. JPEG and video store Y sharply and Cr/Cb at lower resolution because eyes notice brightness detail more than colour detail." },
  };

  window.VIZ.SIM.cv = { photo, PHOTOS, toGray, scaleTo, imageToCanvas, drawGray, drawRGBA, drawMask, canvasEl, panel, bindRanges, num, val, chk, slider, place, note, whenPhoto, ctrl, photoSelect, mulberry32, gauss, f2, rgb2hsv, rgb2lab, rgb2ycrcb, SPACES, BASE };

  /* ================================================================ pixel inspector */
  sim("pixels", "Pixel inspector", "image", (body, cfg) => {
    const c = ctrl(`${photoSelect(["camera", "astronaut", "coffee", "cat", "coins", "rocket", "text"], cfg.photo || "camera")}
      <label>Numbers <select data-k="mode"><option value="grey">grey value</option><option value="rgb">R, G, B</option></select></label>`);
    body.appendChild(c);
    const main = canvasEl(10, 10, "smooth pick"), zoom = canvasEl(10, 10), read = el(`<div class="cv-readout">Move over the picture (or tap it).</div>`);
    place(body, panel("Picture (hover or tap)", main), panel("The 9 × 9 pixels around the pointer", zoom), el(`<div class="cv-panel" style="flex:1 1 200px"></div>`)).lastElementChild.appendChild(read);
    const N = 9, CELL = 38;
    zoom.width = zoom.height = N * CELL; zoom.style.width = "min(100%, 342px)";
    let ph = null, cx = 0, cy = 0;
    const drawZoom = () => {
      if (!ph) return;
      const ctx = zoom.getContext("2d"), grey = val(c, "mode") === "grey";
      ctx.clearRect(0, 0, zoom.width, zoom.height);
      ctx.font = `600 ${grey ? 12 : 9}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = cx + i - 4, y = cy + j - 4;
        if (x < 0 || y < 0 || x >= ph.w || y >= ph.h) { ctx.fillStyle = "#222"; ctx.fillRect(i * CELL, j * CELL, CELL, CELL); continue; }
        const k = (y * ph.w + x) * 4, r = ph.data.data[k], g = ph.data.data[k + 1], b = ph.data.data[k + 2];
        ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(i * CELL, j * CELL, CELL, CELL);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        ctx.fillStyle = lum > 140 ? "#000" : "#fff";
        if (grey) ctx.fillText(Math.round(lum), i * CELL + CELL / 2, j * CELL + CELL / 2);
        else { ctx.fillText(r, i * CELL + CELL / 2, j * CELL + 11); ctx.fillText(g, i * CELL + CELL / 2, j * CELL + 21); ctx.fillText(b, i * CELL + CELL / 2, j * CELL + 31); }
      }
      ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 3; ctx.strokeRect(4 * CELL + 1, 4 * CELL + 1, CELL - 2, CELL - 2);
      const k = (cy * ph.w + cx) * 4, r = ph.data.data[k], g = ph.data.data[k + 1], b = ph.data.data[k + 2];
      read.innerHTML = `row <b>${cy}</b>, column <b>${cx}</b> &nbsp;(x = ${cx}, y = ${cy})<br>R <b>${r}</b> G <b>${g}</b> B <b>${b}</b><br>grey = 0.299·R + 0.587·G + 0.114·B = <b>${(0.299 * r + 0.587 * g + 0.114 * b).toFixed(1)}</b>`;
      const m = main.getContext("2d"); drawRGBA(main, ph.data); m.strokeStyle = "#f43f5e"; m.lineWidth = 2; m.strokeRect(cx - 4.5, cy - 4.5, 9, 9);
    };
    const move = (e) => {
      if (!ph) return;
      const r = main.getBoundingClientRect(), p = e.touches ? e.touches[0] : e;
      cx = clamp(Math.floor(((p.clientX - r.left) / r.width) * ph.w), 0, ph.w - 1); cy = clamp(Math.floor(((p.clientY - r.top) / r.height) * ph.h), 0, ph.h - 1);
      drawZoom();
    };
    main.addEventListener("pointermove", move); main.addEventListener("pointerdown", move);
    const load = () => whenPhoto(val(c, "photo"), (p) => { ph = p; main.style.width = Math.min(p.w, 380) + "px"; cx = Math.floor(p.w / 2); cy = Math.floor(p.h / 2); drawRGBA(main, p.data); drawZoom(); });
    bindRanges(c, drawZoom);
    $('[data-k="photo"]', c).addEventListener("change", load);
    load();
  });

  /* ================================================================ colour channels */
  sim("channels", "Colour spaces", "image", (body, cfg) => {
    const c = ctrl(`${photoSelect(["astronaut", "coffee", "cat", "rocket", "retina"], cfg.photo || "astronaut")}
      <label>Space <select data-k="space">${Object.keys(SPACES).map((s) => `<option>${s}</option>`).join("")}</select></label>`);
    body.appendChild(c);
    const orig = canvasEl(10, 10, "smooth"), chans = [0, 1, 2].map(() => canvasEl(10, 10, "smooth"));
    const caps = [0, 1, 2].map(() => el(`<span></span>`));
    const stage = place(body, panel("Photo", orig), ...chans.map((cv, i) => { const p = panel("", cv); $(".cv-cap", p).appendChild(caps[i]); return p; }));
    const txt = el(`<div class="sd-note-line"></div>`); body.appendChild(txt);
    const draw = () => whenPhoto(val(c, "photo"), (p) => {
      const sp = SPACES[val(c, "space")], W = Math.min(p.w, 220), s = W / p.w, w = Math.round(p.w * s), h = Math.round(p.h * s);
      const small = scaleTo(imageToCanvas(p.data), w, h), im = small.getContext("2d").getImageData(0, 0, w, h);
      orig.width = w; orig.height = h; orig.getContext("2d").drawImage(small, 0, 0); orig.style.width = w + "px";
      const out = chans.map(() => new Float32Array(w * h));
      for (let i = 0; i < w * h; i++) { const q = sp.conv(im.data[i * 4], im.data[i * 4 + 1], im.data[i * 4 + 2]); for (let k = 0; k < 3; k++) out[k][i] = q[k]; }
      chans.forEach((cv, k) => { drawGray(cv, { w, h, d: out[k] }); cv.style.width = w + "px"; caps[k].innerHTML = `<b>${sp.names[k]}</b>`; });
      txt.innerHTML = sp.note;
    });
    bindRanges(c, draw); draw();
  });

  /* ================================================================ HSV colour picking */
  sim("hsvmask", "Pick a colour with HSV", "image", (body, cfg) => {
    const c = ctrl(`${photoSelect(["rocket", "astronaut", "coffee", "cat", "retina"], cfg.photo || "rocket")}
      ${slider("Hue from", "h0", 0, 179, 1, 95, "int")}${slider("Hue to", "h1", 0, 179, 1, 125, "int")}
      ${slider("Min saturation", "s0", 0, 255, 1, 90, "int")}${slider("Min brightness", "v0", 0, 255, 1, 60, "int")}`);
    body.appendChild(c);
    const a = canvasEl(10, 10, "smooth"), m = canvasEl(10, 10, "smooth"), r = canvasEl(10, 10, "smooth");
    place(body, panel("Photo", a), panel("Mask (white = inside the range)", m), panel("Only the picked pixels", r));
    const txt = el(`<div class="sd-note-line"></div>`); body.appendChild(txt);
    let tick = 0;
    const draw = () => whenPhoto(val(c, "photo"), (p) => {
      const W = Math.min(p.w, 250), s = W / p.w, w = Math.round(p.w * s), h = Math.round(p.h * s);
      const im = scaleTo(imageToCanvas(p.data), w, h).getContext("2d").getImageData(0, 0, w, h);
      const h0 = num(c, "h0"), h1 = num(c, "h1"), s0 = num(c, "s0"), v0 = num(c, "v0");
      const mask = new Uint8Array(w * h), out = new ImageData(w, h); let n = 0;
      for (let i = 0; i < w * h; i++) {
        const [H, S, V] = rgb2hsv(im.data[i * 4], im.data[i * 4 + 1], im.data[i * 4 + 2]);
        const inH = h0 <= h1 ? H >= h0 && H <= h1 : H >= h0 || H <= h1;           // a range that wraps around the circle (red)
        const on = inH && S >= s0 && V >= v0;
        mask[i] = on ? 1 : 0; n += on ? 1 : 0;
        for (let k = 0; k < 3; k++) out.data[i * 4 + k] = on ? im.data[i * 4 + k] : 0; out.data[i * 4 + 3] = 255;
      }
      drawRGBA(a, im); drawMask(m, mask, w, h); drawRGBA(r, out);
      [a, m, r].forEach((x) => (x.style.width = w + "px"));
      txt.innerHTML = `<b>${((n / (w * h)) * 100).toFixed(1)}%</b> of the pixels are inside the range. In OpenCV this is <code>cv2.inRange(hsv, (${h0}, ${s0}, ${v0}), (${h1}, 255, 255))</code>. Hue runs 0–179 in OpenCV. Red is near 0 <i>and</i> near 179, orange about 10–20, green about 60, blue about 120. If "Hue from" is bigger than "Hue to", the range wraps around the circle.`;
    });
    bindRanges(c, draw); draw();
  });

  /* ================================================================ Bayer sensor */
  sim("bayer", "From sensor to picture", "camera", (body, cfg) => {
    const c = ctrl(`${photoSelect(["astronaut", "coffee", "cat", "rocket"], cfg.photo || "cat")}
      <label>Show <select data-k="stage"><option value="mosaic">1. What the sensor records (one colour per pixel)</option><option value="demosaic">2. After demosaicing (guess the missing colours)</option><option value="orig">3. The true picture</option></select></label>
      <label>Zoom <input type="checkbox" data-k="zoom"> pixel view</label>`);
    body.appendChild(c);
    const cv = canvasEl(10, 10, "smooth"), zoomed = canvasEl(10, 10);
    place(body, panel("Result", cv), panel("Zoom on a 24 × 16 patch", zoomed));
    const txt = el(`<div class="sd-note-line">A colour sensor puts a tiny red, green or blue filter over every pixel (the <b>Bayer pattern</b>: 50% green, 25% red, 25% blue). Each pixel measures only one colour. <b>Demosaicing</b> guesses the other two colours from the neighbours. Look at the zoomed patch and you can see why sharp coloured edges sometimes get colour fringes.</div>`);
    body.appendChild(txt);
    const draw = () => whenPhoto(val(c, "photo"), (p) => {
      const W = Math.min(p.w, 300), s = W / p.w, w = Math.round(p.w * s) & ~1, h = Math.round(p.h * s) & ~1;
      const im = scaleTo(imageToCanvas(p.data), w, h).getContext("2d").getImageData(0, 0, w, h), D = im.data;
      const ch = (x, y) => (y % 2 === 0 ? (x % 2 === 0 ? 0 : 1) : (x % 2 === 0 ? 1 : 2));         // RGGB
      const mosaic = new Uint8ClampedArray(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mosaic[y * w + x] = D[(y * w + x) * 4 + ch(x, y)];
      const out = new ImageData(w, h), stage = val(c, "stage");
      if (stage === "orig") out.data.set(D);
      else for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        if (stage === "mosaic") { const q = ch(x, y); out.data[k] = out.data[k + 1] = out.data[k + 2] = 0; out.data[k + q] = mosaic[y * w + x]; out.data[k + 3] = 255; continue; }
        const sum = [0, 0, 0], cnt = [0, 0, 0];                                                       // average the same-colour pixels in the 3x3 window
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = clamp(x + dx, 0, w - 1), yy = clamp(y + dy, 0, h - 1), q = ch(xx, yy); sum[q] += mosaic[yy * w + xx]; cnt[q]++;
        }
        for (let q = 0; q < 3; q++) out.data[k + q] = cnt[q] ? sum[q] / cnt[q] : 0; out.data[k + 3] = 255;
      }
      drawRGBA(cv, out); cv.style.width = w + "px";
      const px = Math.floor(w / 2) - 12, py = Math.floor(h / 2) - 8, Z = 12;
      zoomed.width = 24 * Z; zoomed.height = 16 * Z; zoomed.style.width = Math.min(24 * Z, 288) + "px";
      const zc = zoomed.getContext("2d");
      for (let j = 0; j < 16; j++) for (let i = 0; i < 24; i++) { const k = ((py + j) * w + px + i) * 4; zc.fillStyle = `rgb(${out.data[k]},${out.data[k + 1]},${out.data[k + 2]})`; zc.fillRect(i * Z, j * Z, Z, Z); }
      zoomed.parentElement.style.display = chk(c, "zoom") ? "" : "none";
    });
    bindRanges(c, draw); draw();
  });

  /* ================================================================ gamma */
  sim("gamma", "Gamma and brightness", "chart", (body, cfg) => {
    const c = ctrl(`${photoSelect(["camera", "astronaut", "coffee", "moon"], cfg.photo || "moon")}${slider("Gamma γ", "g", 0.3, 3, 0.05, 1)}${slider("Gain (multiply)", "a", 0.3, 2, 0.05, 1)}${slider("Offset (add)", "b", -100, 100, 1, 0, "int")}`);
    body.appendChild(c);
    const a = canvasEl(10, 10, "smooth"), b = canvasEl(10, 10, "smooth"), curve = el(`<div class="cv-chartbox" style="width:230px"></div>`);
    place(body, panel("Original", a), panel("Result", b), panel("Curve: output vs input (0–255)", curve));
    const txt = el(`<div class="sd-note-line"></div>`); body.appendChild(txt);
    const draw = () => whenPhoto(val(c, "photo"), (p) => {
      const g = num(c, "g"), A = num(c, "a"), B = num(c, "b");
      const W = Math.min(p.w, 250), s = W / p.w, w = Math.round(p.w * s), h = Math.round(p.h * s);
      const im = scaleTo(imageToCanvas(p.data), w, h).getContext("2d").getImageData(0, 0, w, h), out = new ImageData(w, h);
      const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = A * 255 * Math.pow(v / 255, g) + B;
      for (let i = 0; i < w * h * 4; i++) out.data[i] = i % 4 === 3 ? 255 : lut[im.data[i]];
      drawRGBA(a, im); drawRGBA(b, out); a.style.width = b.style.width = w + "px";
      let path = ""; for (let v = 0; v < 256; v += 4) path += `${v ? "L" : "M"}${(v * 0.85 + 22).toFixed(1)},${(214 - lut[v] * 0.85).toFixed(1)}`;
      curve.innerHTML = `<svg viewBox="0 0 240 236"><rect x="22" y="${214 - 217}" width="217" height="217" fill="none" stroke="var(--border)"/><path d="M22,214 L239,-3" stroke="var(--border-2)" stroke-dasharray="4 4" fill="none"/><path d="${path}" fill="none" stroke="var(--accent-2)" stroke-width="2.4"/><text x="22" y="230">0</text><text x="214" y="230">255</text></svg>`;
      txt.innerHTML = g < 1 ? "γ &lt; 1 <b>brightens</b> the dark parts a lot (good for dark photos, but it washes out contrast in the highlights)." : g > 1 ? "γ &gt; 1 <b>darkens</b> the middle tones and keeps the highlights." : "γ = 1: a straight line, nothing changes except gain and offset. Cameras store brightness with γ ≈ 1/2.2 so that dark tones get more of the 256 levels, because our eyes see small changes in dark areas better.";
    });
    bindRanges(c, draw); draw();
  });
})();
