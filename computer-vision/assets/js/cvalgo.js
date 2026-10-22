/* ==========================================================================
   cvalgo.js — small, dependency-free image algorithms used by the VisionLab simulators.
   Pure functions on Float32Array grey images (values 0..255, row-major, width w, height h).
   No DOM access, so tools/algo_test.js can compare them with OpenCV in Node.
   ========================================================================== */
(function (root) {
  "use strict";

  const reflect = (i, n) => {                       // BORDER_REFLECT_101: ... 2 1 | 0 1 2 ... n-2 n-1 | n-2 n-3 ...
    if (n === 1) return 0;
    while (i < 0 || i >= n) { if (i < 0) i = -i; if (i >= n) i = 2 * n - 2 - i; }
    return i;
  };

  // correlation with a kw x kh kernel (what OpenCV's filter2D does)
  function convolve(src, w, h, k, kw, kh) {
    const out = new Float32Array(w * h), ax = kw >> 1, ay = kh >> 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < kh; j++) { const yy = reflect(y + j - ay, h) * w; for (let i = 0; i < kw; i++) s += k[j * kw + i] * src[yy + reflect(x + i - ax, w)]; }
      out[y * w + x] = s;
    }
    return out;
  }
  function gaussKernel(sigma, radius) {
    const r = radius ?? Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1);
    let s = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    return k;
  }
  function sepConvolve(src, w, h, kx, ky) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), ax = kx.length >> 1, ay = ky.length >> 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = 0; i < kx.length; i++) s += kx[i] * src[y * w + reflect(x + i - ax, w)]; tmp[y * w + x] = s; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let j = 0; j < ky.length; j++) s += ky[j] * tmp[reflect(y + j - ay, h) * w + x]; out[y * w + x] = s; }
    return out;
  }
  const gaussBlur = (src, w, h, sigma) => (sigma <= 0 ? Float32Array.from(src) : sepConvolve(src, w, h, gaussKernel(sigma), gaussKernel(sigma)));
  function boxBlur(src, w, h, r) { const k = new Float32Array(2 * r + 1).fill(1 / (2 * r + 1)); return sepConvolve(src, w, h, k, k); }

  function median(src, w, h, r) {
    const out = new Float32Array(w * h), n = (2 * r + 1) ** 2, buf = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c = 0;
      for (let j = -r; j <= r; j++) { const yy = Math.min(h - 1, Math.max(0, y + j)) * w; for (let i = -r; i <= r; i++) buf[c++] = src[yy + Math.min(w - 1, Math.max(0, x + i))]; }   // replicate border, like cv2.medianBlur
      buf.sort(); out[y * w + x] = buf[n >> 1];
    }
    return out;
  }
  function bilateral(src, w, h, r, sigmaColor, sigmaSpace) {
    const out = new Float32Array(w * h), gs = [];
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) gs.push(Math.exp(-(i * i + j * j) / (2 * sigmaSpace * sigmaSpace)));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = src[y * w + x]; let s = 0, ws = 0, q = 0;
      for (let j = -r; j <= r; j++) { const yy = reflect(y + j, h) * w; for (let i = -r; i <= r; i++) { const v = src[yy + reflect(x + i, w)], d = v - c, wt = gs[q++] * Math.exp(-(d * d) / (2 * sigmaColor * sigmaColor)); s += wt * v; ws += wt; } }
      out[y * w + x] = s / ws;
    }
    return out;
  }

  const SOBEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1], SOBEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  function sobel(src, w, h) {
    const gx = convolve(src, w, h, SOBEL_X, 3, 3), gy = convolve(src, w, h, SOBEL_Y, 3, 3), mag = new Float32Array(w * h), ang = new Float32Array(w * h);
    for (let i = 0; i < mag.length; i++) { mag[i] = Math.hypot(gx[i], gy[i]); ang[i] = Math.atan2(gy[i], gx[i]); }
    return { gx, gy, mag, ang };
  }

  // Canny: blur, gradient, thin the ridges (non-maximum suppression), then two thresholds with hysteresis
  function canny(src, w, h, sigma, lo, hi) {
    const blur = gaussBlur(src, w, h, sigma), { gx, gy } = sobel(blur, w, h), mag = new Float32Array(w * h), nms = new Float32Array(w * h);
    for (let i = 0; i < mag.length; i++) mag[i] = Math.abs(gx[i]) + Math.abs(gy[i]);           // OpenCV's default (L1) gradient size
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, m = mag[i];
      if (m === 0) continue;
      let a = (Math.atan2(gy[i], gx[i]) * 180) / Math.PI; if (a < 0) a += 180;
      let n1, n2;
      if (a < 22.5 || a >= 157.5) { n1 = mag[i - 1]; n2 = mag[i + 1]; }
      else if (a < 67.5) { n1 = mag[i - w - 1]; n2 = mag[i + w + 1]; }
      else if (a < 112.5) { n1 = mag[i - w]; n2 = mag[i + w]; }
      else { n1 = mag[i - w + 1]; n2 = mag[i + w - 1]; }
      if (m >= n1 && m >= n2) nms[i] = m;
    }
    const edges = new Uint8Array(w * h), stack = [];
    for (let i = 0; i < nms.length; i++) if (nms[i] >= hi) { edges[i] = 2; stack.push(i); }
    while (stack.length) {                                      // grow strong edges through connected weak ones
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!edges[j] && nms[j] >= lo) { edges[j] = 1; stack.push(j); }
      }
    }
    return { blur, mag, nms, edges };                           // edges: 2 = strong, 1 = weak but connected, 0 = none
  }

  function histogram(src) { const h = new Float64Array(256); for (const v of src) h[Math.max(0, Math.min(255, Math.round(v)))]++; return h; }
  function otsu(hist) {
    let total = 0, sum = 0; for (let i = 0; i < 256; i++) { total += hist[i]; sum += i * hist[i]; }
    let wB = 0, sB = 0, best = 0, th = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break;
      sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, between = wB * wF * (mB - mF) ** 2;
      if (between > best) { best = between; th = t; }
    }
    return th;
  }
  function equalizeHist(src) {
    const h = histogram(src), cdf = new Float64Array(256); let c = 0, cmin = 0;
    for (let i = 0; i < 256; i++) { c += h[i]; cdf[i] = c; if (!cmin && c) cmin = c; }
    const n = src.length, lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) lut[i] = n > cmin ? Math.round(((cdf[i] - cmin) / (n - cmin)) * 255) : i;
    return src.map((v) => lut[Math.max(0, Math.min(255, Math.round(v)))]);
  }
  // CLAHE: equalise each tile with a clipped histogram, then blend the four nearest tile mappings
  function clahe(src, w, h, clip, grid) {
    const tw = w / grid, th = h / grid, luts = [];
    for (let ty = 0; ty < grid; ty++) for (let tx = 0; tx < grid; tx++) {
      const x0 = Math.floor(tx * tw), x1 = Math.floor((tx + 1) * tw), y0 = Math.floor(ty * th), y1 = Math.floor((ty + 1) * th), hist = new Float64Array(256);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[Math.max(0, Math.min(255, Math.round(src[y * w + x])))]++;
      const n = (x1 - x0) * (y1 - y0), limit = Math.max(1, (clip * n) / 256); let excess = 0;
      for (let i = 0; i < 256; i++) if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
      for (let i = 0; i < 256; i++) hist[i] += excess / 256;
      const lut = new Float32Array(256); let c = 0;
      for (let i = 0; i < 256; i++) { c += hist[i]; lut[i] = Math.min(255, (c / n) * 255); }
      luts.push(lut);
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = Math.max(0, Math.min(grid - 1.001, x / tw - 0.5)), gy = Math.max(0, Math.min(grid - 1.001, y / th - 0.5));
      const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, v = Math.max(0, Math.min(255, Math.round(src[y * w + x])));
      const a = luts[y0 * grid + x0][v], b = luts[y0 * grid + x0 + 1][v], c = luts[(y0 + 1) * grid + x0][v], d = luts[(y0 + 1) * grid + x0 + 1][v];
      out[y * w + x] = (1 - fy) * ((1 - fx) * a + fx * b) + fy * ((1 - fx) * c + fx * d);
    }
    return out;
  }
  function adaptiveThreshold(src, w, h, r, C, gaussian) {
    const mean = gaussian ? gaussBlur(src, w, h, r / 1.5) : boxBlur(src, w, h, r), out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = src[i] > mean[i] - C ? 1 : 0;
    return out;
  }

  // binary morphology with a square or disc structuring element of radius r
  function morph(mask, w, h, r, op, shape) {
    const offs = [];
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (shape !== "disc" || i * i + j * j <= r * r + r * 0.5) offs.push([i, j]);
    const run = (m, erode) => {
      const out = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = erode ? 1 : 0;
        for (const [i, j] of offs) {
          const xx = x + i, yy = y + j, p = xx < 0 || yy < 0 || xx >= w || yy >= h ? (erode ? 1 : 0) : m[yy * w + xx];
          if (erode && !p) { v = 0; break; } if (!erode && p) { v = 1; break; }
        }
        out[y * w + x] = v;
      }
      return out;
    };
    if (op === "erode") return run(mask, true);
    if (op === "dilate") return run(mask, false);
    if (op === "open") return run(run(mask, true), false);
    if (op === "close") return run(run(mask, false), true);
    if (op === "gradient") { const d = run(mask, false), e = run(mask, true); return d.map((v, i) => (v && !e[i] ? 1 : 0)); }
    return mask;
  }

  // 2-D FFT (sizes must be powers of two). re, im: Float64Array(w*h). In place.
  function fft1(re, im, n, inv) {
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = i + k + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  function fft2(re, im, w, h, inv) {
    const rr = new Float64Array(Math.max(w, h)), ri = new Float64Array(Math.max(w, h));
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) { rr[x] = re[y * w + x]; ri[x] = im[y * w + x]; } fft1(rr, ri, w, inv); for (let x = 0; x < w; x++) { re[y * w + x] = rr[x]; im[y * w + x] = ri[x]; } }
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) { rr[y] = re[y * w + x]; ri[y] = im[y * w + x]; } fft1(rr, ri, h, inv); for (let y = 0; y < h; y++) { re[y * w + x] = rr[y]; im[y * w + x] = ri[y]; } }
  }
  const shift2 = (a, w, h) => { const o = new Float64Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[((y + h / 2) % h) * w + ((x + w / 2) % w)] = a[y * w + x]; return o; };

  // Harris corner response
  function harris(src, w, h, sigma, k) {
    const { gx, gy } = sobel(src, w, h), n = w * h, xx = new Float32Array(n), yy = new Float32Array(n), xy = new Float32Array(n);
    for (let i = 0; i < n; i++) { xx[i] = gx[i] * gx[i]; yy[i] = gy[i] * gy[i]; xy[i] = gx[i] * gy[i]; }
    const a = gaussBlur(xx, w, h, sigma), b = gaussBlur(yy, w, h, sigma), c = gaussBlur(xy, w, h, sigma), r = new Float32Array(n);
    for (let i = 0; i < n; i++) r[i] = a[i] * b[i] - c[i] * c[i] - k * (a[i] + b[i]) ** 2;
    return r;
  }

  // solve A x = b (n x n) by Gaussian elimination with partial pivoting
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c]; if (Math.abs(d) < 1e-12) return null;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  // 3x3 homography (row-major, 9 numbers) that maps four source points to four destination points (DLT, h33 = 1)
  function homography4(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = solve(A, b); return h ? [...h, 1] : null;
  }
  const inv3 = (m) => {
    const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  };
  const mul3 = (p, q) => { const r = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += p[i * 3 + k] * q[k * 3 + j]; return r; };
  // inverse-mapping warp of RGBA ImageData-like data (bilinear). H maps SOURCE -> OUTPUT coordinates. Returns Uint8ClampedArray (outW*outH*4); outside pixels are transparent.
  function warp(srcData, sw, sh, H, outW, outH) {
    const Hi = inv3(H), out = new Uint8ClampedArray(outW * outH * 4);
    if (!Hi) return out;
    for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
      const z = Hi[6] * x + Hi[7] * y + Hi[8], sx = (Hi[0] * x + Hi[1] * y + Hi[2]) / z, sy = (Hi[3] * x + Hi[4] * y + Hi[5]) / z;
      if (!(sx >= 0 && sy >= 0 && sx <= sw - 1 && sy <= sh - 1)) continue;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1), fx = sx - x0, fy = sy - y0, o = (y * outW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = srcData[(y0 * sw + x0) * 4 + c], b = srcData[(y0 * sw + x1) * 4 + c], cc = srcData[(y1 * sw + x0) * 4 + c], d = srcData[(y1 * sw + x1) * 4 + c];
        out[o + c] = (1 - fy) * ((1 - fx) * a + fx * b) + fy * ((1 - fx) * cc + fx * d);
      }
    }
    return out;
  }

  root.CVALGO = { solve, homography4, inv3, mul3, warp, reflect, convolve, gaussKernel, sepConvolve, gaussBlur, boxBlur, median, bilateral, sobel, canny, histogram, otsu, equalizeHist, clahe, adaptiveThreshold, morph, fft1, fft2, shift2, harris, SOBEL_X, SOBEL_Y };
  if (typeof module !== "undefined") module.exports = root.CVALGO;
})(typeof window !== "undefined" ? window : globalThis);
