#!/usr/bin/env python3
"""Check the JavaScript image algorithms in assets/js/cvalgo.js against OpenCV.   .venv/bin/python tools/algo_test.py"""
import json, subprocess, sys, tempfile
from pathlib import Path
import cv2, numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "assets" / "py"))
import cvlab

g = cvlab.image("camera", size=(96, 96), gray=True)
f = g.astype(np.float32)
exp = {
    "gauss": cv2.GaussianBlur(f, (0, 0), 1.5, borderType=cv2.BORDER_REFLECT_101),
    "box": cv2.blur(f, (5, 5), borderType=cv2.BORDER_REFLECT_101),
    "sobel": np.hypot(cv2.Sobel(f, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(f, cv2.CV_32F, 0, 1, ksize=3)),
    "median": cv2.medianBlur(g, 5).astype(np.float32),
    "equalize": cv2.equalizeHist(g).astype(np.float32),
    "otsu": np.float32([cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[0]]),
    "canny": cv2.Canny(cv2.GaussianBlur(g, (0, 0), 1.4), 40, 100).astype(np.float32),
}
data = {"w": 96, "h": 96, "d": f.ravel().tolist(), "exp": {k: v.ravel().tolist() for k, v in exp.items()}}
js = r"""
const A = require(process.argv[2] + "/assets/js/cvalgo.js"); const D = JSON.parse(require("fs").readFileSync(process.argv[3], "utf8"));
const src = Float32Array.from(D.d), w = D.w, h = D.h, out = {};
const maxdiff = (a, b) => { let m = 0; for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
out.gauss = maxdiff(A.gaussBlur(src, w, h, 1.5), D.exp.gauss);
out.box = maxdiff(A.boxBlur(src, w, h, 2), D.exp.box);
out.sobel = maxdiff(A.sobel(src, w, h).mag, D.exp.sobel);
out.median = maxdiff(A.median(src, w, h, 2), D.exp.median);
out.equalize = maxdiff(A.equalizeHist(src), D.exp.equalize);
out.otsu = Math.abs(A.otsu(A.histogram(src)) - D.exp.otsu[0]);
const c = A.canny(src, w, h, 1.4, 40, 100).edges; let both = 0, a1 = 0, b1 = 0; for (let i = 0; i < c.length; i++) { const A1 = c[i] > 0, B1 = D.exp.canny[i] > 0; a1 += A1; b1 += B1; both += A1 && B1; } out.cannyEdgePixels = [a1, b1, both];
console.log(JSON.stringify(out));
"""
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "in.json").write_text(json.dumps(data)); (Path(d) / "t.js").write_text(js)
    r = subprocess.run(["node", str(Path(d) / "t.js"), str(ROOT), str(Path(d) / "in.json")], capture_output=True, text=True)
    print(r.stdout or r.stderr)
