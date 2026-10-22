"""SVG figures for the ThreeLab Notebook.

Every figure is a function registered with @fig("name") that returns an <svg> string.
Chapters place them with a line `@fig(name) Caption`. Sizes are in CSS px (96 per inch),
so a 640-wide figure prints about 169 mm wide.
"""
import math

FIGS = {}

# palette (matches notebook.css)
EM, IN, PK, AM, CY, RD, VI, SKY = "#34d399", "#818cf8", "#f472b6", "#fbbf24", "#22d3ee", "#fb7185", "#c084fc", "#60a5fa"
TXT, SOFT, MUTED, GRID, LINE, CARD = "#e6ebf6", "#aeb8d0", "#7f8bab", "#1f2a46", "#33405f", "#141c33"


def fig(name):
    def deco(fn):
        FIGS[name] = fn
        return fn
    return deco


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


class S:
    def __init__(self, w, h):
        self.w, self.h, self.p = w, h, []

    def add(self, s):
        self.p.append(s)
        return self

    def line(self, x1, y1, x2, y2, c=LINE, w=1.5, dash=None, op=1, cap="round"):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        return self.add(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{c}" stroke-width="{w}" stroke-linecap="{cap}" opacity="{op}"{d}/>')

    def arrow(self, x1, y1, x2, y2, c=EM, w=2, head=9, dash=None, op=1):
        ang = math.atan2(y2 - y1, x2 - x1)
        bx, by = x2 - head * 0.8 * math.cos(ang), y2 - head * 0.8 * math.sin(ang)
        self.line(x1, y1, bx, by, c, w, dash, op)
        a1, a2 = ang + 2.7, ang - 2.7
        pts = [(x2, y2), (x2 + head * math.cos(a1), y2 + head * math.sin(a1)), (x2 + head * math.cos(a2), y2 + head * math.sin(a2))]
        return self.poly(pts, fill=c, stroke="none", op=op)

    def circle(self, cx, cy, r, fill="none", stroke=LINE, w=1.5, op=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        return self.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" opacity="{op}"{d}/>')

    def ellipse(self, cx, cy, rx, ry, fill="none", stroke=LINE, w=1.5, op=1, dash=None, rot=0):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        return self.add(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" transform="rotate({rot} {f(cx)} {f(cy)})" fill="{fill}" stroke="{stroke}" stroke-width="{w}" opacity="{op}"{d}/>')

    def rect(self, x, y, w, h, fill=CARD, stroke=LINE, sw=1.2, rx=8, op=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        return self.add(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" opacity="{op}"{d}/>')

    def text(self, x, y, s, c=TXT, size=12, anchor="middle", weight=500, italic=False, mono=False, op=1, disp=False):
        fam = "JetBrains Mono, monospace" if mono else ("Space Grotesk, Inter, sans-serif" if disp else "Inter, sans-serif")
        st = ' font-style="italic"' if italic else ""
        if mono:
            s = s.replace(" ", "\u00a0")       # keep indentation and spacing in code-like text
        return self.add(f'<text x="{f(x)}" y="{f(y)}" fill="{c}" font-size="{size}" font-family="{fam}" font-weight="{weight}" text-anchor="{anchor}" opacity="{op}"{st}>{s}</text>')

    def poly(self, pts, fill="none", stroke=LINE, w=1.5, op=1, close=True, dash=None):
        tag = "polygon" if close else "polyline"
        d = f' stroke-dasharray="{dash}"' if dash else ""
        ps = " ".join(f"{f(x)},{f(y)}" for x, y in pts)
        return self.add(f'<{tag} points="{ps}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" stroke-linejoin="round" opacity="{op}"{d}/>')

    def path(self, d, fill="none", stroke=LINE, w=1.5, op=1, dash=None):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        return self.add(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" opacity="{op}"{da}/>')

    def grid(self, x0, y0, x1, y1, step, c=GRID, w=1):
        x = x0
        while x <= x1 + 0.01:
            self.line(x, y0, x, y1, c, w)
            x += step
        y = y0
        while y <= y1 + 0.01:
            self.line(x0, y, x1, y, c, w)
            y += step
        return self

    def dot(self, x, y, c=EM, r=4):
        return self.circle(x, y, r, fill=c, stroke="none")

    def label(self, x, y, s, c=TXT, size=11.5, anchor="middle", weight=600, pad=5, bg="#0c1222"):
        wdt = len(_strip(s)) * size * 0.56 + pad * 2
        x0 = x - wdt / 2 if anchor == "middle" else (x if anchor == "start" else x - wdt)
        self.rect(x0, y - size - 1, wdt, size + 8, fill=bg, stroke="none", rx=4, op=0.85)
        return self.text(x, y + 1, s, c, size, anchor, weight)

    def box(self, x, y, w, h, title, sub=None, c=EM, fill=CARD, size=12.5):
        self.rect(x, y, w, h, fill=fill, stroke=c, sw=1.4, rx=9)
        if sub:
            self.text(x + w / 2, y + h / 2 - 2, title, TXT, size, weight=650, disp=True)
            self.text(x + w / 2, y + h / 2 + 14, sub, SOFT, 10)
        else:
            self.text(x + w / 2, y + h / 2 + 4.5, title, TXT, size, weight=650, disp=True)
        return self

    def svg(self, extra_defs=""):
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}">{extra_defs}{"".join(self.p)}</svg>'


def _strip(s):
    import re
    return re.sub(r"<[^>]+>", "", s)


# ---------------------------------------------------------------- 3D helpers

def rot(p, ax=0.0, ay=0.0, az=0.0):
    x, y, z = p
    c, s = math.cos(ax), math.sin(ax)
    y, z = y * c - z * s, y * s + z * c
    c, s = math.cos(ay), math.sin(ay)
    x, z = x * c + z * s, -x * s + z * c
    c, s = math.cos(az), math.sin(az)
    x, y = x * c - y * s, x * s + y * c
    return (x, y, z)


def persp(p, cx, cy, scale, dist=4.0):
    x, y, z = p
    k = dist / (dist - z)
    return (cx + x * scale * k, cy - y * scale * k, k)


def iso(x, y, z, ox, oy, s=40):
    """Simple oblique projection for textbook 3D sketches (x right, y up, z towards viewer-left)."""
    return (ox + s * (x - 0.5 * z * 0.9), oy - s * (y - 0.38 * z * 0.9))


def icosphere(sub=1):
    t = (1 + 5 ** 0.5) / 2
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    v = [tuple(c / math.sqrt(sum(a * a for a in p)) for c in p) for p in v]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
             (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(sub):
        cache, nf = {}, []

        def mid(a, b):
            key = tuple(sorted((a, b)))
            if key not in cache:
                p = [(v[a][i] + v[b][i]) / 2 for i in range(3)]
                n = math.sqrt(sum(c * c for c in p))
                v.append(tuple(c / n for c in p))
                cache[key] = len(v) - 1
            return cache[key]
        for a, b, c in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = nf
    return v, faces


def edges_of(faces):
    e = set()
    for fc in faces:
        for i in range(3):
            a, b = fc[i], fc[(i + 1) % 3]
            e.add((min(a, b), max(a, b)))
    return sorted(e)


def torus(R=1.0, r=0.38, nu=36, nv=14):
    pts, edges = [], []
    for i in range(nu):
        for j in range(nv):
            u, v = 2 * math.pi * i / nu, 2 * math.pi * j / nv
            pts.append(((R + r * math.cos(v)) * math.cos(u), r * math.sin(v), (R + r * math.cos(v)) * math.sin(u)))
            a = i * nv + j
            edges.append((a, ((i + 1) % nu) * nv + j))
            edges.append((a, i * nv + (j + 1) % nv))
    return pts, edges


GRAD = '''<defs>
<linearGradient id="{id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34d399"/><stop offset=".55" stop-color="#818cf8"/><stop offset="1" stop-color="#f472b6"/></linearGradient>
<radialGradient id="{id}g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#818cf8" stop-opacity=".35"/><stop offset="1" stop-color="#818cf8" stop-opacity="0"/></radialGradient>
</defs>'''


def wire(s, pts, edges, cx, cy, scale, ax, ay, stroke, base_w=1.3, dist=4.2, nodes=False):
    P = [persp(rot(p, ax, ay), cx, cy, scale, dist) for p in pts]
    R = [rot(p, ax, ay) for p in pts]
    order = sorted(edges, key=lambda e: R[e[0]][2] + R[e[1]][2])
    for a, b in order:
        depth = (R[a][2] + R[b][2]) / 2  # -1 back .. +1 front
        op = 0.18 + 0.75 * (depth + 1) / 2
        s.line(P[a][0], P[a][1], P[b][0], P[b][1], stroke, base_w * (0.6 + 0.6 * (depth + 1) / 2), op=round(op, 2))
    if nodes:
        for i, p in enumerate(P):
            if R[i][2] > 0.2:
                s.circle(p[0], p[1], 2.2, fill="#e0e7ff", stroke="none", op=round(0.4 + 0.5 * R[i][2], 2))


def cover_art(small=False):
    if small:
        s = S(300, 300)
        s.circle(150, 150, 140, fill="url(#bkg)", stroke="none")
        v, fcs = icosphere(1)
        wire(s, v, edges_of(fcs), 150, 150, 105, 0.35, 0.6, "url(#bk)", 1.4, nodes=True)
        return s.svg(GRAD.replace('id="{id}"', 'id="bk"').replace('id="{id}g"', 'id="bkg"'))
    W, H = 794, 1123
    s = S(W, H)
    # perspective floor grid
    vy, vx = 560, 520
    for i in range(-14, 15):
        x = vx + i * 120
        s.line(vx + i * 14, vy, x, H + 40, "#1d2a4d", 1, op=0.8)
    for k in range(1, 16):
        y = vy + (H - vy) * (k / 15) ** 2.2
        s.line(-20, y, W + 20, y, "#1d2a4d", 1, op=0.8)
    s.add(f'<rect x="0" y="{vy - 4}" width="{W}" height="140" fill="url(#fade)"/>')
    # glow + icosphere + torus
    s.circle(520, 330, 300, fill="url(#cvg)", stroke="none")
    v, fcs = icosphere(2)
    wire(s, v, edges_of(fcs), 520, 320, 215, 0.42, 0.75, "url(#cv)", 1.25, nodes=True)
    tp, te = torus(1.0, 0.18, 48, 10)
    wire(s, tp, te, 520, 330, 300, 1.15, 0.3, "#34d399", 0.7)
    # axes gizmo
    ox, oy = 120, 170
    s.arrow(ox, oy, ox + 70, oy + 18, RD, 2.2)
    s.arrow(ox, oy, ox, oy - 75, EM, 2.2)
    s.arrow(ox, oy, ox - 42, oy + 42, SKY, 2.2)
    s.text(ox + 82, oy + 26, "x", RD, 15, weight=700, italic=True)
    s.text(ox, oy - 84, "y", EM, 15, weight=700, italic=True)
    s.text(ox - 52, oy + 58, "z", SKY, 15, weight=700, italic=True)
    # floating formula marks
    s.text(690, 90, "M = T · R · S", "#6b7bb0", 13, mono=True, op=0.9)
    s.text(70, 420, "q = (x, y, z, w)", "#6b7bb0", 12, mono=True, anchor="start", op=0.8)
    s.text(720, 600, "f(l,v) = DFG / 4(n·l)(n·v)", "#6b7bb0", 12, mono=True, anchor="end", op=0.8)
    defs = GRAD.replace('id="{id}"', 'id="cv"').replace('id="{id}g"', 'id="cvg"')
    defs = defs.replace("</defs>", f'<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070a14" stop-opacity="1"/><stop offset="1" stop-color="#070a14" stop-opacity="0"/></linearGradient></defs>')
    return s.svg(defs)


def part_art(n):
    W, H = 794, 1123
    s = S(W, H)
    gid = f"pa{n}"
    s.circle(560, 330, 260, fill=f"url(#{gid}g)", stroke="none")
    kind = n % 4
    if kind == 0:
        tp, te = torus(1.0, 0.42, 40, 16)
        wire(s, tp, te, 560, 320, 190, 0.9 + n * 0.1, 0.4, f"url(#{gid})", 1.1)
    elif kind == 1:
        v, fcs = icosphere(1)
        wire(s, v, edges_of(fcs), 560, 320, 210, 0.3 + n * 0.07, 0.5, f"url(#{gid})", 1.4, nodes=True)
    elif kind == 2:
        pts, ed = [], []
        N = 7
        for i in range(N):
            for j in range(N):
                for k in range(N):
                    pts.append(((i - 3) / 3, (j - 3) / 3, (k - 3) / 3))
        idx = lambda i, j, k: (i * N + j) * N + k
        for i in range(N):
            for j in range(N):
                for k in range(N):
                    if i + 1 < N: ed.append((idx(i, j, k), idx(i + 1, j, k)))
                    if j + 1 < N: ed.append((idx(i, j, k), idx(i, j + 1, k)))
                    if k + 1 < N: ed.append((idx(i, j, k), idx(i, j, k + 1)))
        wire(s, pts, ed, 560, 320, 150, 0.5, 0.7, f"url(#{gid})", 0.8)
    else:
        pts, ed = [], []
        N = 26
        for i in range(N):
            for j in range(N):
                x, z = (i - N / 2) / (N / 2), (j - N / 2) / (N / 2)
                y = 0.25 * math.sin(3 * x + 1) * math.cos(3 * z) + 0.1 * math.sin(7 * x * z)
                pts.append((x * 1.4, y, z * 1.4))
                if i + 1 < N: ed.append((i * N + j, (i + 1) * N + j))
                if j + 1 < N: ed.append((i * N + j, i * N + j + 1))
        wire(s, pts, ed, 540, 330, 200, 0.55, 0.6, f"url(#{gid})", 0.9)
    return s.svg(GRAD.replace('id="{id}"', f'id="{gid}"').replace('id="{id}g"', f'id="{gid}g"'))


# =====================================================================
# Chapter figures are appended below, grouped by chapter.
# =====================================================================


# ---------------------------------------------------------------- ch01

@fig("frame_budget")
def _():
    s = S(640, 190)
    x0, x1 = 70, 610
    ms = lambda t: x0 + (x1 - x0) * t / 16.67
    s.text(20, 62, "CPU", SOFT, 12, "start", 700, disp=True)
    s.text(20, 112, "GPU", SOFT, 12, "start", 700, disp=True)
    segs = [(0, 2.0, "input", SKY), (2.0, 4.5, "update", IN), (4.5, 7.0, "draw calls", VI)]
    for a, b, t, c in segs:
        s.rect(ms(a), 44, ms(b) - ms(a) - 2, 28, fill=c, stroke="none", rx=5, op=0.85)
        s.text((ms(a) + ms(b)) / 2, 63, t, "#0a0e1a", 11, weight=700)
    s.rect(ms(7.0), 44, ms(16.67) - ms(7.0), 28, fill="none", stroke=LINE, rx=5, dash="4 4")
    s.text((ms(7) + ms(16.67)) / 2, 63, "idle: waiting for the next vsync", MUTED, 11)
    s.rect(ms(0), 94, ms(4.5) - ms(0) - 2, 28, fill="none", stroke=LINE, rx=5, dash="4 4")
    s.text(ms(2.2), 113, "previous frame", MUTED, 10.5)
    s.rect(ms(4.6), 94, ms(9.0) - ms(4.6) - 2, 28, fill=EM, stroke="none", rx=5, op=0.85)
    s.text((ms(4.6) + ms(9)) / 2, 113, "vertex", "#0a0e1a", 11, weight=700)
    s.rect(ms(9.0), 94, ms(14.2) - ms(9.0) - 2, 28, fill=AM, stroke="none", rx=5, op=0.9)
    s.text((ms(9) + ms(14.2)) / 2, 113, "fragment", "#0a0e1a", 11, weight=700)
    s.line(ms(16.67), 30, ms(16.67), 140, RD, 2, dash="5 4")
    s.text(ms(16.67), 24, "vsync · 16.67 ms", RD, 11, "end", 700)
    for t in range(0, 17, 2):
        s.line(ms(t), 140, ms(t), 146, MUTED, 1)
        s.text(ms(t), 160, f"{t}", MUTED, 10)
    s.text(340, 182, "time within one 60 Hz frame (ms)", MUTED, 10.5)
    return s.svg()


@fig("coord_system")
def _():
    s = S(640, 300)
    ox, oy = 250, 170
    s.grid(40, 40, 460, 280, 30, GRID)
    s.arrow(ox, oy, ox + 170, oy, RD, 3)
    s.arrow(ox, oy, ox, oy - 140, EM, 3)
    s.arrow(ox, oy, ox - 95, oy + 95, SKY, 3)
    s.label(ox + 185, oy + 5, "+X right", RD, 12)
    s.label(ox, oy - 150, "+Y up", EM, 12)
    s.label(ox - 110, oy + 112, "+Z towards you", SKY, 12)
    s.circle(ox, oy, 5, fill=TXT, stroke="none")
    s.text(ox + 12, oy - 10, "origin (0,0,0)", SOFT, 10.5, "start")
    # rotation arrow around y
    s.path(f"M {ox-40} {oy-95} A 40 12 0 1 0 {ox+40} {oy-95}", stroke=AM, w=2)
    s.poly([(ox + 40, oy - 95), (ox + 31, oy - 101), (ox + 33, oy - 90)], fill=AM, stroke="none")
    s.text(ox + 52, oy - 112, "+rotation.y", AM, 11, "start", 600)
    # camera
    cx, cy = 545, 150
    s.rect(cx - 30, cy - 22, 60, 44, fill=CARD, stroke=IN, rx=8)
    s.poly([(cx - 30, cy - 12), (cx - 52, cy - 24), (cx - 52, cy + 24), (cx - 30, cy + 12)], fill=CARD, stroke=IN)
    s.text(cx, cy + 5, "camera", IN, 11, weight=700)
    s.arrow(cx - 55, cy, cx - 120, cy, IN, 2, dash="6 4")
    s.text(cx - 8, cy + 46, "looks down its −Z", IN, 11)
    s.text(cx - 8, cy + 62, "(default camera at +Z)", MUTED, 10)
    return s.svg()


@fig("spaces_chain")
def _():
    s = S(660, 200)
    names = [("Local", "model space", EM), ("World", "scene space", EM), ("View", "camera space", IN), ("Clip", "homogeneous 4D", VI), ("NDC", "−1 … 1 cube", PK), ("Screen", "pixels", AM)]
    mats = ["M", "V", "P", "÷ w", "viewport"]
    w, gap, y = 88, 26, 50
    for i, (n, sub, c) in enumerate(names):
        x = 10 + i * (w + gap)
        s.box(x, y, w, 62, n, sub, c, size=13)
        if i < 5:
            s.arrow(x + w + 3, y + 31, x + w + gap - 3, y + 31, SOFT, 1.8, head=7)
            s.text(x + w + gap / 2, y - 8, mats[i], AM if i < 3 else PK, 12, weight=700, mono=True)
    s.text(10, 150, "matrixWorld", EM, 10.5, "start", mono=True)
    s.text(124, 150, "matrixWorldInverse", IN, 10.5, "start", mono=True)
    s.text(254, 150, "projectionMatrix", VI, 10.5, "start", mono=True)
    s.text(380, 150, "GPU fixed function", PK, 10.5, "start", mono=True)
    s.line(10, 165, 360, 165, LINE, 1)
    s.text(185, 185, "your vertex shader outputs  gl_Position = P · V · M · p", SOFT, 11, mono=True)
    s.line(380, 165, 650, 165, LINE, 1)
    s.text(515, 185, "hardware: divide, clip, rasterise", SOFT, 11)
    return s.svg()


# ---------------------------------------------------------------- ch02

@fig("pipeline")
def _():
    s = S(660, 270)
    stages = [("Vertex data", "buffers + index", SOFT, False), ("Vertex shader", "per vertex", EM, True), ("Clip + ÷w", "primitive assembly", SOFT, False),
              ("Viewport + cull", "NDC → pixels", SOFT, False), ("Rasterise", "fragments", SOFT, False), ("Fragment shader", "per fragment", PK, True),
              ("Depth / stencil", "tests", SOFT, False), ("Blend", "→ framebuffer", SOFT, False)]
    w, h = 140, 58
    for i, (t, sub, c, prog) in enumerate(stages):
        row, col = divmod(i, 4)
        x = 20 + col * 160 if row == 0 else 20 + (3 - col) * 160
        y = 40 + row * 120
        fill = "#13261f" if c == EM else ("#2a1424" if c == PK else CARD)
        s.rect(x, y, w, h, fill=fill, stroke=c if prog else LINE, sw=2 if prog else 1.2, rx=10)
        s.text(x + w / 2, y + 25, t, TXT, 13, weight=650, disp=True)
        s.text(x + w / 2, y + 43, sub, SOFT if not prog else c, 10.5)
        if i < 7:
            if row == 0 and col < 3:
                s.arrow(x + w + 2, y + h / 2, x + 158, y + h / 2, SOFT, 1.8, head=7)
            elif row == 0 and col == 3:
                s.arrow(x + w / 2, y + h + 2, x + w / 2, y + 118, SOFT, 1.8, head=7)
            else:
                s.arrow(x - 2, y + h / 2, x - 18, y + h / 2, SOFT, 1.8, head=7)
    s.rect(20, 240, 14, 14, fill="#13261f", stroke=EM, sw=2, rx=3)
    s.text(42, 251, "programmable (you write it: GLSL / WGSL / TSL)", SOFT, 11, "start")
    s.rect(370, 240, 14, 14, fill=CARD, stroke=LINE, sw=1.2, rx=3)
    s.text(392, 251, "fixed function (configured by render state)", SOFT, 11, "start")
    s.text(330, 20, "one draw call", MUTED, 11, weight=600)
    return s.svg()


@fig("barycentric")
def _():
    s = S(620, 270)
    A, B, C, P = (60, 240), (300, 240), (150, 40), (165, 175)
    s.poly([P, B, C], fill="#3b1d2a", stroke="none")
    s.poly([A, P, C], fill="#13304a", stroke="none")
    s.poly([A, B, P], fill="#173a2c", stroke="none")
    s.poly([A, B, C], stroke=TXT, w=2)
    for q in (A, B, C):
        s.line(P[0], P[1], q[0], q[1], SOFT, 1.2, dash="4 3")
    s.circle(*A, 7, fill=RD, stroke="none"); s.text(A[0] - 14, A[1] + 18, "A", RD, 14, weight=700)
    s.circle(*B, 7, fill=EM, stroke="none"); s.text(B[0] + 14, B[1] + 18, "B", EM, 14, weight=700)
    s.circle(*C, 7, fill=SKY, stroke="none"); s.text(C[0], C[1] - 14, "C", SKY, 14, weight=700)
    s.circle(*P, 5, fill=TXT, stroke="none"); s.text(P[0] + 12, P[1] - 6, "p", TXT, 14, weight=700, italic=True)
    s.text(205, 170, "λA", PK, 12, weight=700)
    s.text(120, 160, "λB", SKY, 12, weight=700)
    s.text(175, 222, "λC", EM, 12, weight=700)
    x = 360
    s.text(x, 70, "λA = area(pBC) / area(ABC)", TXT, 12.5, "start", mono=True)
    s.text(x, 96, "λB = area(ApC) / area(ABC)", TXT, 12.5, "start", mono=True)
    s.text(x, 122, "λC = area(ABp) / area(ABC)", TXT, 12.5, "start", mono=True)
    s.text(x, 160, "inside ⇔ all λ in [0, 1]", EM, 12.5, "start", mono=True)
    s.text(x, 186, "λA + λB + λC = 1", SOFT, 12.5, "start", mono=True)
    s.text(x, 222, "colour(p) = λA·cA + λB·cB + λC·cC", AM, 12, "start", mono=True)
    s.text(150 - 50, 262, "(each sub-triangle is opposite its vertex)", MUTED, 10.5, "start")
    return s.svg()


@fig("zbuffer")
def _():
    s = S(640, 250)
    s.text(150, 22, "draw order: far blue, then near orange", SOFT, 11.5, weight=600)
    # two triangles side view as overlapping quads on a pixel grid
    gx, gy, cs = 30, 40, 22
    depth = {}
    for i in range(10):
        for j in range(8):
            v = None
            if 1 <= i <= 8 and 1 <= j <= 6:
                v = ("b", 0.7)
            if 3 <= i <= 9 and 2 <= j <= 7 and (i - 3) + (7 - j) <= 9:
                v = ("o", 0.3)
            depth[(i, j)] = v
            col = "#0f1528" if v is None else ("#1d4ed8" if v[0] == "b" else "#ea580c")
            s.rect(gx + i * cs, gy + j * cs, cs - 2, cs - 2, fill=col, stroke="none", rx=3, op=0.9)
            if v:
                s.text(gx + i * cs + cs / 2 - 1, gy + j * cs + 15, f"{v[1]:.1f}", "#e5e7eb", 8.5, mono=True)
    s.text(140, 232, "colour buffer + depth values (smaller = nearer)", MUTED, 10.5)
    x0 = 300
    s.text(x0, 60, "for each fragment (x, y, z):", TXT, 12, "start", mono=True)
    s.text(x0 + 18, 86, "if z < depth[x][y]:", EM, 12, "start", mono=True)
    s.text(x0 + 36, 110, "depth[x][y] = z      // depthWrite", SOFT, 12, "start", mono=True)
    s.text(x0 + 36, 134, "color[x][y] = shade() // passes", SOFT, 12, "start", mono=True)
    s.text(x0 + 18, 158, "else: discard", RD, 12, "start", mono=True)
    s.rect(x0, 178, 320, 50, fill="#2a1424", stroke=RD, rx=8, op=0.9)
    s.text(x0 + 160, 199, "z-fighting: two depths round to the", TXT, 11)
    s.text(x0 + 160, 216, "same stored value → flicker", TXT, 11)
    return s.svg()


# ---------------------------------------------------------------- ch03

@fig("dot_projection")
def _():
    s = S(620, 250)
    O = (60, 200)
    s.line(30, 200, 590, 200, LINE, 1.2)
    b = (440, 200)
    a = (300, 60)
    s.arrow(*O, *b, IN, 3)
    s.text(450, 222, "b̂ (unit direction)", IN, 12, "start", 600)
    s.arrow(*O, *a, EM, 3)
    s.text(a[0] + 10, a[1] - 6, "a", EM, 15, "start", 700, italic=True)
    s.line(a[0], a[1], a[0], 200, SOFT, 1.4, dash="5 4")
    s.rect(a[0] - 12, 188, 12, 12, fill="none", stroke=SOFT, sw=1, rx=0)
    s.line(O[0], 214, a[0], 214, AM, 3)
    s.text((O[0] + a[0]) / 2, 236, "a · b̂  = |a| cos θ  (the shadow of a on b̂)", AM, 12, weight=600)
    s.path(f"M {O[0]+48} 200 A 48 48 0 0 0 {O[0]+48*math.cos(math.atan2(140,240))} {200-48*math.sin(math.atan2(140,240))}", stroke=PK, w=2)
    s.text(O[0] + 62, 186, "θ", PK, 14, "start", 700, italic=True)
    s.text(520, 70, "dot > 0 : same side", EM, 11.5, weight=600)
    s.text(520, 92, "dot = 0 : perpendicular", SOFT, 11.5, weight=600)
    s.text(520, 114, "dot < 0 : opposite side", RD, 11.5, weight=600)
    return s.svg()


@fig("cross_product")
def _():
    s = S(620, 265)
    O = iso(0, 0, 0, 200, 175, 70)
    A = iso(2.4, 0, 0, 200, 175, 70)
    B = iso(0, 0, 2.2, 200, 175, 70)
    AB = iso(2.4, 0, 2.2, 200, 175, 70)
    N = iso(0, 2.3, 0, 200, 175, 70)
    s.poly([O, A, AB, B], fill="#14304a", stroke=SKY, w=1.2, op=0.9)
    s.poly([O, A, B], fill="#173a2c", stroke="none", op=0.9)
    s.arrow(*O, *A, AM, 3)
    s.arrow(*O, *B, EM, 3)
    s.arrow(*O, *N, PK, 3.2)
    s.text(A[0] + 8, A[1] + 18, "b", AM, 15, "start", 700, italic=True)
    s.text(B[0] - 18, B[1] + 2, "a", EM, 15, "start", 700, italic=True)
    s.text(N[0] + 10, N[1] + 4, "a × b", PK, 14, "start", 700)
    s.text((O[0] + A[0] + B[0]) / 3 + 10, (O[1] + A[1] + B[1]) / 3 + 4, "½|a×b|", TXT, 11, weight=600)
    s.text(AB[0] + 12, AB[1] + 4, "|a×b| = parallelogram area", SKY, 11, "start")
    x = 410
    s.text(x, 70, "a × b ⟂ a  and  ⟂ b", TXT, 12.5, "start", mono=True)
    s.text(x, 98, "|a × b| = |a||b| sin θ", TXT, 12.5, "start", mono=True)
    s.text(x, 126, "b × a = −(a × b)", RD, 12.5, "start", mono=True)
    s.text(x, 154, "x̂ × ŷ = ẑ (right-handed)", SOFT, 12.5, "start", mono=True)
    return s.svg()


@fig("reflection")
def _():
    s = S(620, 240)
    s.rect(40, 170, 540, 26, fill="#1a2440", stroke="none", rx=4)
    s.line(40, 170, 580, 170, SOFT, 1.5)
    P = (310, 170)
    s.arrow(P[0], P[1], P[0], 60, EM, 2.5)
    s.text(P[0] + 10, 70, "n̂", EM, 15, "start", 700)
    s.arrow(170, 60, P[0] - 3, P[1] - 3, AM, 3)
    s.text(150, 52, "d (incoming)", AM, 12, "middle", 600)
    s.arrow(P[0], P[1], 450, 60, PK, 3)
    s.text(470, 52, "r = d − 2(d·n̂)n̂", PK, 12.5, "middle", 700)
    s.arrow(P[0], P[1] + 1, 450, P[1] + 1, CY, 2.5, dash="6 4")
    s.text(520, 160, "slide = d − (d·n̂)n̂", CY, 11.5, "middle", 600)
    s.text(P[0], 220, "surface", MUTED, 11)
    return s.svg()


@fig("damping")
def _():
    s = S(620, 250)
    x0, y0, x1, y1 = 60, 30, 590, 210
    s.line(x0, y1, x1, y1, LINE, 1.2)
    s.line(x0, y0, x0, y1, LINE, 1.2)
    X = lambda t: x0 + (x1 - x0) * t / 1.0
    Y = lambda v: y1 - (y1 - y0) * v
    s.line(x0, Y(1), x1, Y(1), GRID, 1, dash="4 4")
    s.text(x0 - 8, Y(1) + 4, "target", MUTED, 10, "end")
    for hz, c in ((30, SKY), (60, AM), (120, RD)):
        pts, v = [], 0.0
        for k in range(int(hz) + 1):
            pts.append((X(k / hz), Y(v)))
            v += (1 - v) * 0.1
        s.poly(pts, stroke=c, w=1.8, close=False, dash="5 4")
        ly = {30: 150, 60: 132, 120: 114}[hz]
        s.line(330, ly - 4, 360, ly - 4, c, 1.8, dash="5 4")
        s.text(368, ly, f"lerp(…, 0.1) per frame @ {hz} Hz", c, 10.5, "start", 600)
    pts = [(X(t / 200), Y(1 - math.exp(-5 * t / 200))) for t in range(201)]
    s.poly(pts, stroke=EM, w=3.2, close=False)
    s.line(330, 168, 360, 168, EM, 3.2)
    s.text(368, 172, "damp: t = 1 − e^(−λΔt), λ = 5 (any rate)", EM, 10.5, "start", 700)
    s.text((x0 + x1) / 2, 236, "time (s)", MUTED, 10.5)
    for t in (0, 0.25, 0.5, 0.75, 1):
        s.text(X(t), y1 + 14, f"{t:g}", MUTED, 10)
    return s.svg()


# ---------------------------------------------------------------- ch04

@fig("basis_transform")
def _():
    s = S(640, 260)
    def panel(ox, oy, sc, M, title):
        tr = lambda x, y: (ox + sc * (M[0][0] * x + M[0][1] * y), oy - sc * (M[1][0] * x + M[1][1] * y))
        for k in range(-3, 4):
            a, b = tr(k, -3), tr(k, 3)
            s.line(*a, *b, GRID, 1)
            a, b = tr(-3, k), tr(3, k)
            s.line(*a, *b, GRID, 1)
        s.poly([tr(0, 0), tr(1, 0), tr(1, 1), tr(0, 1)], fill="#1c2b52", stroke="none", op=0.9)
        s.arrow(*tr(0, 0), *tr(1, 0), RD, 3)
        s.arrow(*tr(0, 0), *tr(0, 1), EM, 3)
        s.text(ox, 24, title, TXT, 12.5, weight=650, disp=True)
    s.add('<clipPath id="bt1"><rect x="20" y="36" width="270" height="214"/></clipPath><clipPath id="bt2"><rect x="350" y="36" width="270" height="214"/></clipPath>')
    s.add('<g clip-path="url(#bt1)">'); panel(155, 160, 34, [[1, 0], [0, 1]], ""); s.add('</g>')
    s.add('<g clip-path="url(#bt2)">'); panel(485, 160, 34, [[1.5, -0.5], [0.5, 1.0]], ""); s.add('</g>')
    s.text(155, 24, "identity: columns (1,0) and (0,1)", TXT, 12, weight=650)
    s.text(485, 24, "M = [ 1.5  −0.5 ; 0.5  1 ]", TXT, 12, weight=650, mono=True)
    s.text(205, 175, "x̂", RD, 13, weight=700); s.text(140, 115, "ŷ", EM, 13, weight=700)
    s.text(548, 140, "M x̂ = (1.5, 0.5)", RD, 11.5, "start", 700)
    s.text(380, 100, "M ŷ = (−0.5, 1)", EM, 11.5, "start", 700)
    s.arrow(300, 140, 340, 140, SOFT, 2)
    return s.svg()


@fig("trs_order")
def _():
    s = S(640, 250)
    def axes(ox, oy):
        s.line(ox - 10, oy, ox + 250, oy, LINE, 1.2)
        s.line(ox, oy + 10, ox, oy - 170, LINE, 1.2)
        s.circle(ox, oy, 3, fill=SOFT, stroke="none")
        s.text(ox - 6, oy + 16, "origin", MUTED, 10, "end")
    # left: T·R
    ox, oy = 40, 210
    axes(ox, oy)
    s.text(150, 22, "T · R  (rotate, then move)", EM, 12.5, weight=700)
    s.rect(ox + 150 - 22, oy - 90 - 12, 44, 24, fill="none", stroke=SOFT, sw=1.2, rx=3, dash="3 3")
    s.add(f'<rect x="{ox+150-22}" y="{oy-90-12}" width="44" height="24" rx="3" fill="{EM}" opacity=".85" transform="rotate(-45 {ox+150} {oy-90})"/>')
    s.arrow(ox + 20, oy - 10, ox + 140, oy - 82, SOFT, 1.5, dash="5 4")
    s.text(ox + 150, oy - 120, "spins in place", EM, 11)
    # right: R·T
    ox2 = 360
    axes(ox2, oy)
    s.text(470, 22, "R · T  (move, then rotate)", RD, 12.5, weight=700)
    s.rect(ox2 + 180 - 22, oy - 12, 44, 24, fill="none", stroke=SOFT, sw=1.2, rx=3, dash="3 3")
    cx, cy = ox2 + 180 * math.cos(math.radians(45)), oy - 180 * math.sin(math.radians(45))
    s.add(f'<rect x="{cx-22:.1f}" y="{cy-12:.1f}" width="44" height="24" rx="3" fill="{RD}" opacity=".85" transform="rotate(-45 {cx:.1f} {cy:.1f})"/>')
    s.path(f"M {ox2+180} {oy} A 180 180 0 0 0 {cx:.1f} {cy:.1f}", stroke=AM, w=2, dash="6 4")
    s.text(ox2 + 200, oy - 70, "swings around", AM, 11, "start")
    s.text(ox2 + 200, oy - 56, "the origin", AM, 11, "start")
    return s.svg()


@fig("scene_graph")
def _():
    s = S(640, 250)
    nodes = {"Scene": (320, 34, SOFT), "Sun": (320, 96, AM), "Earth orbit (Group)": (190, 158, SKY), "Mercury": (470, 158, PK), "Earth": (120, 218, EM), "Moon orbit (Group)": (300, 218, SKY)}
    edges = [("Scene", "Sun"), ("Sun", "Earth orbit (Group)"), ("Sun", "Mercury"), ("Earth orbit (Group)", "Earth"), ("Earth orbit (Group)", "Moon orbit (Group)")]
    for a, b in edges:
        s.line(nodes[a][0], nodes[a][1] + 14, nodes[b][0], nodes[b][1] - 14, LINE, 1.5)
    for n, (x, y, c) in nodes.items():
        w = len(n) * 7.4 + 24
        s.rect(x - w / 2, y - 14, w, 28, fill=CARD, stroke=c, sw=1.4, rx=14)
        s.text(x, y + 4.5, n, TXT, 11.5, weight=600)
    s.line(372, 218, 418, 218, LINE, 1.5)
    s.rect(418, 204, 60, 28, fill=CARD, stroke=SOFT, sw=1.4, rx=14)
    s.text(448, 222.5, "Moon", TXT, 11.5, weight=600)
    s.text(470, 98, "M_world(Moon) =", SOFT, 11, "start", mono=True)
    s.text(470, 116, "  M_sun · M_earthOrbit", SOFT, 11, "start", mono=True)
    s.text(470, 134, "  · M_moonOrbit · M_moon", SOFT, 11, "start", mono=True)
    return s.svg()


@fig("normal_matrix")
def _():
    s = S(640, 240)
    def shape(ox, sx, label):
        # a 45° surface (a diamond) scaled in x
        pts = [(ox + sx * x * 70, 130 - y * 70) for x, y in [(0, 1), (1, 0), (0, -1), (-1, 0)]]
        s.poly(pts, fill="#16213d", stroke=SOFT, w=1.5)
        s.text(ox, 230, label, TXT, 12, weight=650)
        return pts
    shape(150, 1, "before: square rotated 45°")
    s.arrow(150 + 35, 130 - 35, 150 + 35 + 40, 130 - 35 - 40, EM, 3)
    s.text(150 + 85, 50, "n", EM, 14, "start", 700, italic=True)
    shape(460, 2, "after scale.x = 2")
    mid = (460 + 70, 95)
    s.arrow(*mid, mid[0] + 2 * 40 / math.hypot(2, 1) * 1.2, mid[1] - 1 * 40 / math.hypot(2, 1) * 1.2, RD, 3)
    s.text(mid[0] + 30, mid[1] + 24, "M·n (wrong)", RD, 11.5, "start", 700)
    k = 50 / math.hypot(0.5, 1)
    s.arrow(*mid, mid[0] + 0.5 * k, mid[1] - 1 * k, EM, 3)
    s.text(mid[0] + 18, mid[1] - 58, "(M⁻¹)ᵀ·n (right)", EM, 11.5, "start", 700)
    return s.svg()


# ---------------------------------------------------------------- ch05

def _ring(s, cx, cy, R, ax, ay, c, w=3, n=90):
    pts = [persp(rot((R * math.cos(2 * math.pi * i / n), R * math.sin(2 * math.pi * i / n), 0), ax, ay), cx, cy, 1, 900) for i in range(n + 1)]
    s.poly([(p[0], p[1]) for p in pts], stroke=c, w=w, close=False)


@fig("gimbal")
def _():
    s = S(640, 270)
    for ox, locked, title in ((165, False, "free: three independent axes"), (480, True, "locked: middle ring at 90°")):
        cy = 140
        # outer ring (yaw, about Y): circle in XZ plane -> rotate about X by 90°
        _ring(s, ox, cy, 105, math.pi / 2 + 0.25, 0.35, AM, 3.2)
        # middle ring (pitch, about X)
        _ring(s, ox, cy, 82, 0.25, math.pi / 2 + (0 if locked else 0.35) + 0.35, SKY, 3.2)
        # inner ring (roll, about Z)
        inner_ax = (math.pi / 2 + 0.25) if locked else 0.25
        _ring(s, ox, cy, 60, inner_ax, 0.35 if locked else 0.35 + 0.0, PK, 3.2)
        s.circle(ox, cy, 10, fill=EM, stroke="none")
        s.text(ox, 258, title, TXT, 12, weight=650)
    s.text(40, 34, "yaw", AM, 11.5, "start", 700); s.text(40, 52, "pitch", SKY, 11.5, "start", 700); s.text(40, 70, "roll", PK, 11.5, "start", 700)
    s.text(560, 40, "outer + inner rings", RD, 11, weight=700)
    s.text(560, 56, "now share one axis", RD, 11, weight=700)
    return s.svg()


@fig("slerp")
def _():
    s = S(620, 250)
    O = (310, 225)
    R = 190
    a0, a1 = math.radians(150), math.radians(30)
    s.path(f"M {O[0]+R*math.cos(a0):.1f} {O[1]-R*math.sin(a0):.1f} A {R} {R} 0 0 1 {O[0]+R*math.cos(a1):.1f} {O[1]-R*math.sin(a1):.1f}", stroke=EM, w=3)
    P0 = (O[0] + R * math.cos(a0), O[1] - R * math.sin(a0))
    P1 = (O[0] + R * math.cos(a1), O[1] - R * math.sin(a1))
    s.line(*P0, *P1, AM, 2.2, dash="6 5")
    s.arrow(*O, *P0, SOFT, 1.6); s.arrow(*O, *P1, SOFT, 1.6)
    s.text(P0[0] - 14, P0[1] + 4, "q₀", TXT, 14, "end", 700)
    s.text(P1[0] + 14, P1[1] + 4, "q₁", TXT, 14, "start", 700)
    for k in range(1, 6):
        t = k / 6
        a = a0 + (a1 - a0) * t
        s.circle(O[0] + R * math.cos(a), O[1] - R * math.sin(a), 4.5, fill=EM, stroke="none")
        x, y = P0[0] + (P1[0] - P0[0]) * t, P0[1] + (P1[1] - P0[1]) * t
        s.circle(x, y, 4, fill=AM, stroke="none")
        L = math.hypot(x - O[0], y - O[1])
        s.line(O[0], O[1], O[0] + (x - O[0]) * R / L, O[1] + (y - O[1]) * R / L, AM, 1, op=0.35, dash="2 4")
    s.text(310, 22, "slerp: equal angles per step (on the arc)", EM, 12, weight=700)
    s.label(310, 160, "lerp: equal steps on the chord → uneven angles", AM, 11.5)
    s.text(310, 246, "Ω = arccos(q₀ · q₁)", SOFT, 11.5, mono=True)
    return s.svg()


@fig("lookat")
def _():
    s = S(620, 250)
    E = (250, 150)
    T = (540, 120)
    s.line(*E, *T, SOFT, 1.5, dash="6 4")
    s.circle(*T, 9, fill=AM, stroke="none"); s.text(T[0], T[1] - 16, "target T", AM, 12, "middle", 700)
    s.arrow(*E, 120, 163, SKY, 3); s.text(112, 168, "ẑ = norm(E − T)", SKY, 11.5, "end", 700)
    s.arrow(*E, 205, 212, RD, 3); s.text(200, 232, "x̂ = norm(up × ẑ)", RD, 11.5, "middle", 700)
    s.arrow(*E, 250, 45, EM, 3); s.text(260, 50, "ŷ = ẑ × x̂", EM, 11.5, "start", 700)
    s.rect(E[0] - 22, E[1] - 15, 44, 30, fill=CARD, stroke=IN, rx=6)
    s.text(E[0], E[1] + 4, "eye E", IN, 10.5, weight=700)
    s.arrow(330, 142, 400, 135, IN, 2)
    s.text(375, 160, "looks along −ẑ", IN, 11, weight=600)
    s.text(470, 205, "R = [ x̂  ŷ  ẑ ]", TXT, 13, "middle", 700, mono=True)
    s.text(470, 232, "breaks when (T − E) ∥ up", RD, 11.5, weight=600)
    return s.svg()


# ---------------------------------------------------------------- ch06

@fig("frustum")
def _():
    s = S(640, 260)
    E = (70, 150)
    n = [(190, 112), (190, 188)]
    nT = [(215, 98), (215, 174)]
    f = [(470, 40), (470, 250)]
    fT = [(560, 10), (560, 200)]
    # far plane quad and near plane quad
    farq = [(470, 50), (590, 20), (590, 190), (470, 230)]
    nearq = [(190, 118), (222, 108), (222, 168), (190, 180)]
    for p in farq + nearq:
        pass
    for a, b in zip(nearq, farq):
        s.line(*a, *b, SKY, 1.3, op=0.8)
    for a in nearq:
        s.line(*E, *a, SOFT, 1, dash="3 4", op=0.6)
    s.poly(farq, fill="#14304a", stroke=SKY, w=1.6, op=0.85)
    s.poly(nearq, fill="#1b2c55", stroke=IN, w=1.6)
    s.rect(E[0] - 26, E[1] - 16, 40, 32, fill=CARD, stroke=IN, rx=6)
    s.text(E[0] - 6, E[1] + 4, "cam", IN, 10.5, weight=700)
    s.text(206, 200, "near", IN, 11.5, weight=700)
    s.text(530, 248, "far", SKY, 11.5, weight=700)
    s.circle(380, 120, 14, fill=EM, stroke="none"); s.text(380, 100, "visible", EM, 10.5, weight=600)
    s.circle(400, 236, 12, fill="none", stroke=RD, w=2, dash="3 3"); s.text(430, 240, "culled", RD, 10.5, "start", 600)
    s.path(f"M 130 150 A 60 60 0 0 0 {E[0]+60*math.cos(math.radians(-15)):.0f} {E[1]+60*math.sin(math.radians(-15)):.0f}", stroke=AM, w=1.6)
    s.text(140, 128, "fov", AM, 11, weight=700)
    return s.svg()


@fig("depth_curve")
def _():
    s = S(640, 250)
    x0, y0, x1, y1 = 70, 26, 600, 210
    import math as m
    X = lambda d: x0 + (x1 - x0) * (m.log10(d) + 1) / 4      # log scale 0.1 .. 1000
    Y = lambda v: y1 - (y1 - y0) * v
    s.line(x0, y1, x1, y1, LINE, 1.2); s.line(x0, y0, x0, y1, LINE, 1.2)
    for d in (0.1, 1, 10, 100, 1000):
        s.line(X(d), y1, X(d), y1 + 5, MUTED, 1); s.text(X(d), y1 + 18, f"{d:g} m", MUTED, 10)
    for v in (0, 0.5, 0.9, 1):
        s.line(x0 - 5, Y(v), x0, Y(v), MUTED, 1); s.text(x0 - 8, Y(v) + 4, f"{v:g}", MUTED, 10, "end")
    n, f = 0.1, 1000
    pts = []
    for i in range(201):
        d = 10 ** (-1 + 4 * i / 200)
        z = ((f + n) * d - 2 * f * n) / ((f - n) * d)
        pts.append((X(d), Y((z + 1) / 2)))
    s.poly(pts, stroke=RD, w=3, close=False)
    pts2 = [(X(10 ** (-1 + 4 * i / 200)), Y(n / (10 ** (-1 + 4 * i / 200)))) for i in range(201)]
    s.poly(pts2, stroke=EM, w=3, close=False)
    s.text(X(4), Y(0.78), "standard: 90% of the range used by 1 m", RD, 11.5, "start", 700)
    s.text(X(0.25), Y(0.18), "reversed-Z: depth = n / d (1 at near, → 0 far)", EM, 11.5, "start", 700)
    s.text((x0 + x1) / 2, 246, "distance from camera (log scale)", MUTED, 10.5)
    s.line(X(1), y1, X(1), Y(0.9), AM, 1.2, dash="4 4"); s.line(x0, Y(0.9), X(1), Y(0.9), AM, 1.2, dash="4 4")
    return s.svg()


@fig("ndc_mouse")
def _():
    s = S(640, 230)
    s.rect(30, 30, 250, 150, fill="#121a31", stroke=SOFT, rx=4)
    s.text(155, 22, "canvas pixels", TXT, 12, weight=650)
    s.text(36, 46, "(0,0)", MUTED, 10, "start"); s.text(276, 194, "(w,h)", MUTED, 10, "end")
    s.arrow(40, 52, 90, 52, SOFT, 1.5, head=6); s.arrow(40, 52, 40, 92, SOFT, 1.5, head=6)
    s.text(95, 56, "x", SOFT, 10, "start"); s.text(44, 104, "y↓", SOFT, 10, "start")
    s.circle(217, 67, 6, fill=PK, stroke="none"); s.text(217, 88, "(1440, 270)", PK, 10.5, weight=600)
    s.arrow(295, 105, 345, 105, AM, 2)
    s.text(320, 96, "×2−1", AM, 10.5, weight=700, mono=True)
    s.rect(360, 30, 250, 150, fill="#121a31", stroke=SOFT, rx=4)
    s.text(485, 22, "NDC", TXT, 12, weight=650)
    s.line(360, 105, 610, 105, LINE, 1); s.line(485, 30, 485, 180, LINE, 1)
    s.text(366, 118, "−1", MUTED, 10, "start"); s.text(604, 118, "+1", MUTED, 10, "end")
    s.text(491, 42, "+1", MUTED, 10, "start"); s.text(491, 176, "−1", MUTED, 10, "start")
    s.circle(547.5, 67.5, 6, fill=PK, stroke="none"); s.text(547, 88, "(0.5, 0.5)", PK, 10.5, weight=600)
    s.text(320, 214, "y is flipped: DOM y grows downwards, NDC y grows upwards", SOFT, 11)
    return s.svg()


@fig("spherical")
def _():
    s = S(620, 260)
    O = (250, 170)
    s.ellipse(O[0], O[1], 150, 42, stroke=LINE, w=1.2, dash="4 4")
    s.ellipse(O[0], O[1] - 60, 120, 120, stroke=GRID, w=1)
    s.arrow(*O, O[0], 40, EM, 2); s.text(O[0] + 8, 44, "+Y", EM, 11, "start", 700)
    s.arrow(*O, O[0] - 90, O[1] + 40, SKY, 2); s.text(O[0] - 100, O[1] + 56, "+Z", SKY, 11, "middle", 700)
    C = (O[0] + 110, O[1] - 95)
    G = (O[0] + 110, O[1] + 16)
    s.line(*O, *C, AM, 2.5); s.text((O[0] + C[0]) / 2 + 8, (O[1] + C[1]) / 2 + 2, "r", AM, 13, "start", 700, italic=True)
    s.line(*C, *G, SOFT, 1.2, dash="4 3"); s.line(*O, *G, SOFT, 1.2, dash="4 3")
    s.rect(C[0] - 18, C[1] - 13, 36, 26, fill=CARD, stroke=IN, rx=5); s.text(C[0], C[1] + 4, "cam", IN, 10, weight=700)
    s.path(f"M {O[0]} {O[1]-50} A 50 50 0 0 1 {O[0]+31} {O[1]-27}", stroke=PK, w=2)
    s.text(O[0] + 12, O[1] - 60, "φ", PK, 14, "start", 700, italic=True)
    s.path(f"M {O[0]-60} {O[1]+27} A 70 20 0 0 0 {O[0]+62} {O[1]+10}", stroke=CY, w=2)
    s.text(O[0] + 6, O[1] + 44, "θ", CY, 14, "start", 700, italic=True)
    s.circle(*O, 5, fill=TXT, stroke="none"); s.text(O[0] - 10, O[1] - 6, "target", SOFT, 10, "end")
    x = 430
    s.text(x, 90, "x = r sin φ sin θ", TXT, 12.5, "start", mono=True)
    s.text(x, 116, "y = r cos φ", TXT, 12.5, "start", mono=True)
    s.text(x, 142, "z = r sin φ cos θ", TXT, 12.5, "start", mono=True)
    s.text(x, 184, "drag ↔ θ, drag ↕ φ, wheel r", SOFT, 11.5, "start")
    return s.svg()


# ---------------------------------------------------------------- ch07

@fig("fixed_timestep")
def _():
    s = S(640, 210)
    x0, x1 = 78, 615
    T = 100.0
    X = lambda t: x0 + (x1 - x0) * t / T
    s.text(20, 62, "render", SOFT, 11.5, "start", 700)
    s.text(20, 132, "physics", SOFT, 11.5, "start", 700)
    frames = [0, 9, 21, 46, 55, 71, 83, 97]
    for a, b in zip(frames, frames[1:]):
        s.rect(X(a) + 1, 44, X(b) - X(a) - 2, 26, fill=IN, stroke="none", rx=4, op=0.8)
        s.text((X(a) + X(b)) / 2, 61, f"{b-a}", "#0a0e1a", 10, weight=700)
    h = 16.67
    k = 0
    while (k + 1) * h <= T:
        s.rect(X(k * h) + 1, 114, X((k + 1) * h) - X(k * h) - 2, 26, fill=EM, stroke="none", rx=4, op=0.85)
        s.text((X(k * h) + X((k + 1) * h)) / 2, 131, "h", "#0a0e1a", 11, weight=700, italic=True)
        k += 1
    for f_ in frames[1:]:
        s.line(X(f_), 72, X(f_), 112, SOFT, 1, dash="2 3", op=0.6)
    s.line(X(46), 150, X(50.0), 150, AM, 3)
    s.text(X(48), 168, "α = acc / h", AM, 11, weight=700)
    s.text(320, 26, "frame times vary (ms)", IN, 11, weight=600)
    s.text(320, 196, "the simulation always advances in fixed steps h = 16.67 ms", EM, 11, weight=600)
    return s.svg()


# ---------------------------------------------------------------- ch08

@fig("indexed_quad")
def _():
    s = S(640, 240)
    def quad(ox, labels, title):
        P = [(ox, 190), (ox + 150, 190), (ox + 150, 60), (ox, 60)]
        s.poly([P[0], P[1], P[2]], fill="#173a2c", stroke=EM, w=1.5)
        s.poly([P[0], P[2], P[3]], fill="#14304a", stroke=SKY, w=1.5)
        for (x, y), l in zip(P, labels):
            s.circle(x, y, 13, fill=CARD, stroke=AM, w=1.6)
            s.text(x, y + 4.5, l, AM, 10.5, weight=700)
        s.text(ox + 75, 30, title, TXT, 12, weight=650)
    quad(40, ["0", "1", "2", "3"], "indexed: 4 vertices")
    s.text(115, 222, "index = [0,1,2,  0,2,3]", SOFT, 11.5, mono=True)
    quad(360, ["0,3", "1", "2,4", "5"], "non-indexed: 6 vertices")
    s.text(435, 222, "vertices 0 & 3 and 2 & 4 are copies", SOFT, 11.5)
    return s.svg()


@fig("flat_smooth")
def _():
    s = S(640, 230)
    def corner(ox, smooth):
        A, B, C = (ox, 170), (ox + 110, 120), (ox + 220, 170)
        s.poly([(ox - 10, 200), A, B], fill="#1b2c55", stroke="none", op=0.9)
        s.poly([B, C, (ox + 230, 200)], fill="#14304a", stroke="none", op=0.9)
        s.line(*A, *B, SOFT, 2.5); s.line(*B, *C, SOFT, 2.5)
        if smooth:
            s.arrow(*B, B[0], B[1] - 75, EM, 3)
            s.circle(*B, 6, fill=EM, stroke="none")
            s.text(B[0], 30, "one shared vertex, averaged normal", EM, 11.5, weight=700)
            s.text(B[0], 222, "smooth: lighting blends across the edge", SOFT, 11)
        else:
            dx, dy = 50 / math.hypot(50, 110), 110 / math.hypot(50, 110)
            s.arrow(B[0] - 3, B[1], B[0] - 3 - 70 * dx, B[1] - 70 * dy, PK, 3)
            s.arrow(B[0] + 3, B[1], B[0] + 3 + 70 * dx, B[1] - 70 * dy, PK, 3)
            s.circle(B[0] - 4, B[1], 5, fill=PK, stroke="none"); s.circle(B[0] + 4, B[1], 5, fill=PK, stroke="none")
            s.text(B[0], 30, "two vertices at one position", PK, 11.5, weight=700)
            s.text(B[0], 222, "flat: a crisp edge (face normals)", SOFT, 11)
    corner(40, False)
    corner(370, True)
    return s.svg()


# ---------------------------------------------------------------- raster helpers (per-pixel rendered figures)

def _png_b64(arr):
    import base64, io
    from PIL import Image
    import numpy as np
    img = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype("uint8"), "RGBA" if arr.shape[-1] == 4 else "RGB")
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def srgb_encode(c):
    import numpy as np
    c = np.clip(c, 0, None)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def aces_fit(x):
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return (x * (a * x + b)) / (x * (c * x + d) + e)


def sphere_render(shade, size=150, bg=(0.055, 0.075, 0.13), tonemap=True):
    """shade(N, V, P) -> linear rgb array (h,w,3); N,V unit vectors per pixel (h,w,3)."""
    import numpy as np
    ys, xs = np.mgrid[0:size, 0:size]
    x = (xs + 0.5) / size * 2 - 1
    y = 1 - (ys + 0.5) / size * 2
    r2 = x * x + y * y
    inside = r2 <= 0.98
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    N = np.stack([x, y, z], -1)
    V = np.zeros_like(N); V[..., 2] = 1
    col = shade(N, V)
    if tonemap:
        col = aces_fit(col * 0.9)
    col = srgb_encode(col)
    edge = np.clip((0.985 - r2) / 0.02, 0, 1)[..., None]
    return np.concatenate([col, edge], -1)    # RGBA: transparent outside the sphere


def img_tag(arr, x, y, w, h):
    return f'<image x="{x}" y="{y}" width="{w}" height="{h}" href="data:image/png;base64,{_png_b64(arr)}"/>'


def _dot(a, b):
    import numpy as np
    return np.sum(a * b, -1, keepdims=True)


def _norm(v):
    import numpy as np
    return v / np.linalg.norm(v)


# ---------------------------------------------------------------- ch09

@fig("shading_vectors")
def _():
    s = S(620, 240)
    s.path("M 60 200 Q 310 150 560 200", stroke=SOFT, w=2)
    P = (310, 175)
    s.arrow(*P, 310, 50, EM, 3); s.text(318, 52, "n", EM, 15, "start", 700, italic=True)
    s.circle(140, 62, 12, fill=AM, stroke="none", op=0.9)
    s.arrow(*P, 150, 70, AM, 3); s.text(122, 66, "l (to light)", AM, 12, "end", 700)
    s.arrow(*P, 520, 125, SKY, 3); s.text(528, 122, "v (to eye)", SKY, 12, "start", 700)
    lx, ly = 150 - 310, 70 - 175
    L = math.hypot(lx, ly); lx, ly = lx / L, ly / L
    nx, ny = 0, -1
    d = lx * nx + ly * ny
    rx, ry = 2 * d * nx - lx, 2 * d * ny - ly
    s.arrow(*P, P[0] + rx * 150, P[1] + ry * 150, PK, 2.5, dash="6 4"); s.text(P[0] + rx * 150 + 8, P[1] + ry * 150 + 16, "r", PK, 14, "start", 700, italic=True)
    vx, vy = 520 - 310, 125 - 175; V = math.hypot(vx, vy); vx, vy = vx / V, vy / V
    hx, hy = lx + vx, ly + vy; H = math.hypot(hx, hy); hx, hy = hx / H, hy / H
    s.arrow(*P, P[0] + hx * 110, P[1] + hy * 110, VI, 2.5); s.text(P[0] + hx * 110 + 8, P[1] + hy * 110 - 2, "h", VI, 14, "start", 700, italic=True)
    s.circle(*P, 5, fill=TXT, stroke="none")
    s.text(310, 228, "all vectors are unit length and point away from the surface", MUTED, 11)
    return s.svg()


@fig("lambert_cosine")
def _():
    s = S(640, 230)
    def panel(ox, tilt, label):
        # beam: parallel rays from above of width 80
        for k in range(6):
            x = ox + 30 + k * 16
            s.arrow(x, 30, x, 150 + (x - ox - 70) * math.tan(tilt), AM, 1.6, head=6)
        # surface line through (ox+70,150) with tilt
        x1, x2 = ox - 20, ox + 160
        s.line(x1, 150 + (x1 - ox - 70) * math.tan(tilt), x2, 150 + (x2 - ox - 70) * math.tan(tilt), SOFT, 3)
        lit0 = ox + 30; lit1 = ox + 110
        s.line(lit0, 150 + (lit0 - ox - 70) * math.tan(tilt) + 8, lit1, 150 + (lit1 - ox - 70) * math.tan(tilt) + 8, EM, 4)
        s.text(ox + 70, 215, label, TXT, 12, weight=650)
    panel(60, 0, "facing the light: area A, full brightness")
    panel(380, math.radians(35), "tilted by θ: area A / cos θ, so cos θ as bright")
    s.text(320, 120, "→", SOFT, 22)
    return s.svg()


@fig("shading_spheres")
def _():
    import numpy as np
    L = _norm(np.array([-0.5, 0.6, 0.62]))
    kd = np.array([0.85, 0.32, 0.14])
    amb = 0.04

    def lam(N, V):
        return kd * (amb + np.clip(_dot(N, L), 0, None) * 1.05)

    def phong(N, V):
        R = 2 * _dot(N, L) * N - L
        sp = np.power(np.clip(_dot(R, V), 0, None), 32) * (_dot(N, L) > 0)
        return lam(N, V) + 0.9 * sp

    def blinn(N, V):
        H = (L + V); H = H / np.linalg.norm(H, axis=-1, keepdims=True)
        sp = np.power(np.clip(_dot(N, H), 0, None), 32) * (_dot(N, L) > 0)
        return lam(N, V) + 0.9 * sp

    def toon(N, V):
        d = np.clip(_dot(N, L), 0, 0.999)
        q = np.floor(d * 3) / 2
        return kd * (0.10 + q * 0.95)

    s = S(640, 215)
    names = [("Lambert", lam), ("Phong (α = 32)", phong), ("Blinn–Phong (α = 32)", blinn), ("Toon (3 bands)", toon)]
    for i, (n, fn) in enumerate(names):
        x = 12 + i * 158
        s.add(img_tag(sphere_render(fn, 300), x, 8, 150, 150))
        s.text(x + 75, 182, n, TXT, 12, weight=650)
    s.text(320, 206, "same light, same albedo; only the shading formula changes", MUTED, 10.5)
    return s.svg()


# ---------------------------------------------------------------- ch10

@fig("shadow_map")
def _():
    s = S(640, 260)
    Lp = (90, 40)
    s.circle(*Lp, 16, fill=AM, stroke="none"); s.text(Lp[0], Lp[1] + 34, "light", AM, 11, weight=700)
    s.line(30, 220, 610, 220, SOFT, 2)
    s.text(600, 238, "ground", MUTED, 10.5, "end")
    s.rect(250, 150, 70, 70, fill="#1b2c55", stroke=IN, sw=1.6, rx=3)
    s.text(285, 190, "box", IN, 11, weight=700)
    A = (200, 220)
    B = (430, 220)
    s.line(*Lp, *A, AM, 1.6, dash="5 4")
    hit = (250 + 0, 150 + (250 - 90) * 0)  # placeholder
    # ray to B hits the box top-right corner region
    t = (250 - Lp[0]) / (B[0] - Lp[0])
    yb = Lp[1] + t * (B[1] - Lp[1])
    s.line(Lp[0], Lp[1], 320, Lp[1] + (320 - Lp[0]) / (B[0] - Lp[0]) * (B[1] - Lp[1]), AM, 1.6)
    s.line(320, Lp[1] + (320 - Lp[0]) / (B[0] - Lp[0]) * (B[1] - Lp[1]), *B, RD, 1.6, dash="3 4")
    s.circle(*A, 6, fill=EM, stroke="none"); s.text(A[0], A[1] + 20, "A: lit", EM, 11.5, weight=700)
    s.circle(*B, 6, fill=RD, stroke="none"); s.text(B[0], B[1] + 20, "B: in shadow", RD, 11.5, weight=700)
    s.poly([(320, 220), (320, 150), (560, 220)], fill="#000", stroke="none", op=0.35)
    x = 450
    s.text(x, 50, "pass 1: depth from the light", TXT, 12, "start", 700)
    s.text(x, 72, "stored(B dir) = distance to box", SOFT, 11, "start")
    s.text(x, 104, "pass 2: compare per fragment", TXT, 12, "start", 700)
    s.text(x, 126, "d(B) > stored → shadow", RD, 11, "start", mono=True)
    s.text(x, 146, "d(A) ≈ stored → lit", EM, 11, "start", mono=True)
    return s.svg()


@fig("shadow_acne")
def _():
    s = S(640, 240)
    x0, y0, x1, y1 = 40, 200, 600, 50
    slope = (y1 - y0) / (x1 - x0)
    s.line(x0, y0, x1, y1, SOFT, 2.5)
    w = 112
    for i in range(5):
        xa = x0 + i * w
        xc = xa + w / 2
        yc = y0 + slope * (xc - x0)
        s.rect(xa + 1, yc, w - 2, 6, fill=AM, stroke="none", rx=1, op=0.85)
        for k in range(6):
            xf = xa + 10 + k * 18.4
            yf = y0 + slope * (xf - x0)
            c = RD if yf > yc + 1 else EM
            s.circle(xf, yf, 5, fill=c, stroke="#0a0e1a", w=1)
    s.text(40, 30, "amber bars: the depth stored for each shadow texel (one value per texel)", AM, 11.5, "start", 700)
    s.text(600, 226, "red: fragments farther than their texel's stored depth → wrongly shadowed", RD, 11, "end", 600)
    return s.svg()


@fig("cascades")
def _():
    s = S(640, 240)
    E = (40, 112)
    splits = [(70, 140, EM), (140, 260, SKY), (260, 430, IN), (430, 610, VI)]
    def half(x):
        return 12 + (x - 40) * 0.13
    for a, b, c in splits:
        ha, hb = half(a), half(b)
        s.poly([(a, E[1] - ha), (b, E[1] - hb), (b, E[1] + hb), (a, E[1] + ha)], fill=c, stroke=c, w=1.2, op=0.25)
        s.poly([(a, E[1] - ha), (b, E[1] - hb), (b, E[1] + hb), (a, E[1] + ha)], stroke=c, w=1.6)
    s.rect(E[0] - 24, E[1] - 14, 34, 28, fill=CARD, stroke=TXT, rx=5); s.text(E[0] - 7, E[1] + 4, "cam", TXT, 9.5, weight=700)
    labels = ["cascade 0: tiny box, sharp", "1", "2", "cascade 3: huge box, coarse"]
    s.text(105, 210, "cascade 0", EM, 11, weight=700); s.text(105, 224, "small box · sharp", SOFT, 9.5)
    s.text(200, 210, "cascade 1", SKY, 11, weight=700)
    s.text(345, 214, "cascade 2", IN, 11, weight=700)
    s.text(520, 218, "cascade 3", VI, 11, weight=700); s.text(520, 232, "big box · coarse", SOFT, 9.5)
    return s.svg()


# ---------------------------------------------------------------- ch11

def _checker_img(n=8, px=200):
    import numpy as np
    ys, xs = np.mgrid[0:px, 0:px]
    u, v = xs / px, ys / px
    cx, cy = (u * n).astype(int), (v * n).astype(int)
    a = ((cx + cy) % 2)[..., None]
    c1 = np.array([0.20, 0.83, 0.60]); c2 = np.array([0.09, 0.12, 0.25])
    img = c1 * a + c2 * (1 - a)
    # draw a red diagonal stripe as a "feature"
    return img


@fig("uv_mapping")
def _():
    import numpy as np
    s = S(640, 250)
    img = _checker_img(8, 200)
    s.add(img_tag(img, 380, 25, 200, 200))
    s.rect(380, 25, 200, 200, fill="none", stroke=SOFT, sw=1.2, rx=0)
    s.text(372, 230, "(0,0)", MUTED, 10, "end"); s.text(588, 22, "(1,1)", MUTED, 10, "start")
    s.text(480, 246, "u →", MUTED, 10.5); s.text(600, 128, "v ↑", MUTED, 10.5, "start")
    uv = [(0.15, 0.2), (0.85, 0.3), (0.5, 0.9)]
    T = [(380 + u * 200, 225 - v * 200) for u, v in uv]
    s.poly(T, fill="none", stroke=AM, w=3)
    for (x, y), c, l in zip(T, (RD, EM, SKY), ("A", "B", "C")):
        s.circle(x, y, 6, fill=c, stroke="none"); s.text(x + 9, y - 6, l, c, 12, "start", 700)
    M = [(60, 200), (300, 170), (170, 50)]
    s.poly(M, fill="#16213d", stroke=AM, w=3)
    for (x, y), c, l in zip(M, (RD, EM, SKY), ("A", "B", "C")):
        s.circle(x, y, 6, fill=c, stroke="none"); s.text(x - 10, y - 8, l, c, 12, "end", 700)
    s.text(180, 236, "triangle in 3D (each vertex stores a uv)", SOFT, 11)
    s.arrow(320, 120, 365, 120, SOFT, 1.6)
    return s.svg()


@fig("filtering")
def _():
    import numpy as np
    from PIL import Image
    rng = np.random.default_rng(3)
    base = np.zeros((6, 6, 3))
    pal = [np.array(c) for c in ([0.20, 0.83, 0.60], [0.51, 0.55, 0.97], [0.96, 0.45, 0.71], [0.98, 0.75, 0.14], [0.09, 0.12, 0.25])]
    for i in range(6):
        for j in range(6):
            base[i, j] = pal[(i * 2 + j * 3 + (i * j) % 3) % 5]
    im = Image.fromarray((base * 255).astype("uint8"))
    near = np.asarray(im.resize((180, 180), Image.NEAREST)) / 255
    lin = np.asarray(im.resize((180, 180), Image.BILINEAR)) / 255
    s = S(640, 230)
    s.add(img_tag(np.asarray(im.resize((60, 60), Image.NEAREST)) / 255, 40, 80, 60, 60))
    s.text(70, 160, "6 × 6 texture", SOFT, 11)
    s.arrow(115, 110, 165, 110, SOFT, 1.6)
    s.add(img_tag(near, 180, 20, 180, 180)); s.text(270, 220, "NearestFilter", TXT, 12, weight=650)
    s.add(img_tag(lin, 420, 20, 180, 180)); s.text(510, 220, "LinearFilter (bilinear)", TXT, 12, weight=650)
    return s.svg()


@fig("tbn")
def _():
    s = S(620, 240)
    s.poly([(80, 190), (360, 160), (540, 210), (260, 240)], fill="#14304a", stroke=SKY, w=1.4, op=0.9)
    for k in range(1, 6):
        a = (80 + (260 - 80) * k / 6, 190 + (240 - 190) * k / 6)
        b = (360 + (540 - 360) * k / 6, 160 + (210 - 160) * k / 6)
        s.line(*a, *b, "#1d4e7a", 1)
    P = (310, 196)
    s.arrow(*P, 450, 180, RD, 3); s.text(458, 178, "T (u →)", RD, 12, "start", 700)
    s.arrow(*P, 255, 228, EM, 3); s.text(240, 238, "B (v →)", EM, 12, "end", 700)
    s.arrow(*P, 310, 70, SKY, 3); s.text(318, 72, "N", SKY, 13, "start", 700)
    s.arrow(*P, 390, 92, PK, 3, dash="6 4"); s.text(398, 92, "n from the map", PK, 12, "start", 700)
    s.text(110, 60, "n_world = normalize([T B N] · (2c − 1))", TXT, 12.5, "start", mono=True)
    return s.svg()


# ---------------------------------------------------------------- ch12

def _plot_frame(s, x0, y0, x1, y1, xt, yt, xl, yl):
    s.line(x0, y1, x1, y1, LINE, 1.2); s.line(x0, y0, x0, y1, LINE, 1.2)
    for v, lab in xt:
        s.line(v, y1, v, y1 + 5, MUTED, 1); s.text(v, y1 + 17, lab, MUTED, 10)
    for v, lab in yt:
        s.line(x0 - 5, v, x0, v, MUTED, 1); s.text(x0 - 8, v + 4, lab, MUTED, 10, "end")
    s.text((x0 + x1) / 2, y1 + 34, xl, MUTED, 10.5)
    s.add(f'<text x="{x0-34}" y="{(y0+y1)/2}" fill="{MUTED}" font-size="10.5" font-family="Inter, sans-serif" text-anchor="middle" transform="rotate(-90 {x0-34} {(y0+y1)/2})">{yl}</text>')


@fig("srgb_curve")
def _():
    s = S(620, 260)
    x0, y0, x1, y1 = 80, 20, 360, 210
    X = lambda v: x0 + (x1 - x0) * v
    Y = lambda v: y1 - (y1 - y0) * v
    _plot_frame(s, x0, y0, x1, y1, [(X(v), f"{v:g}") for v in (0, 0.25, 0.5, 0.75, 1)], [(Y(v), f"{v:g}") for v in (0, 0.5, 1)], "linear light L", "stored value V")
    enc = lambda c: 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    s.poly([(X(i / 200), Y(enc(i / 200))) for i in range(201)], stroke=EM, w=3, close=False)
    s.line(X(0), Y(0), X(1), Y(1), MUTED, 1.2, dash="4 4")
    s.line(X(0.5), Y(0), X(0.5), Y(enc(0.5)), AM, 1.4, dash="4 3"); s.line(X(0), Y(enc(0.5)), X(0.5), Y(enc(0.5)), AM, 1.4, dash="4 3")
    s.circle(X(0.5), Y(enc(0.5)), 5, fill=AM, stroke="none"); s.text(X(0.5) + 8, Y(enc(0.5)) + 16, "(0.5, 0.735)", AM, 11, "start", 700)
    s.circle(X(0.214), Y(0.5), 5, fill=PK, stroke="none"); s.text(X(0.214) + 8, Y(0.5) + 16, "(0.214, 0.5)", PK, 11, "start", 700)
    import numpy as np
    w = 220
    lin = np.linspace(0, 1, w)
    ramp = lambda vals: np.tile(np.stack([vals] * 3, -1)[None], (26, 1, 1))
    s.text(390, 46, "even steps of light energy (linear)", TXT, 11, "start", 650)
    s.add(img_tag(ramp(np.array([enc(v) for v in lin])), 390, 56, w, 26))
    s.text(390, 98, "looks bright almost at once", MUTED, 10.5, "start")
    s.text(390, 136, "even steps of stored sRGB value", TXT, 11, "start", 650)
    s.add(img_tag(ramp(lin), 390, 146, w, 26))
    s.text(390, 188, "looks perceptually even", MUTED, 10.5, "start")
    return s.svg()


def tm_reinhard(x):
    return x / (1 + x)


def tm_aces(x):
    return aces_fit(0.6 * x)


def tm_neutral(c):
    """Khronos PBR Neutral, c: (...,3) array."""
    import numpy as np
    c = np.array(c, dtype=float)
    start = 0.8 - 0.04
    desat = 0.15
    x = c.min(-1, keepdims=True)
    offset = np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    c = c - offset
    peak = c.max(-1, keepdims=True)
    d = 1 - start
    newpeak = 1 - d * d / (peak + d - start)
    comp = c * np.where(peak < start, 1, newpeak / np.maximum(peak, 1e-6))
    g = 1 - 1 / (desat * (peak - newpeak) + 1)
    out = np.where(peak < start, c, comp * (1 - g) + newpeak * g)
    return out


@fig("tonemap_curves")
def _():
    import numpy as np
    s = S(620, 260)
    x0, y0, x1, y1 = 80, 20, 430, 210
    X = lambda v: x0 + (x1 - x0) * (math.log10(v) + 2) / 3.0      # 0.01 .. 10
    Y = lambda v: y1 - (y1 - y0) * v
    _plot_frame(s, x0, y0, x1, y1, [(X(v), f"{v:g}") for v in (0.01, 0.1, 1, 10)], [(Y(v), f"{v:g}") for v in (0, 0.5, 1)], "linear HDR input (log scale)", "display value (before sRGB)")
    xs = [10 ** (-2 + 3 * i / 300) for i in range(301)]
    curves = [("clip", lambda v: min(v, 1), MUTED), ("Reinhard", tm_reinhard, SKY), ("ACES fit", tm_aces, PK), ("Neutral", lambda v: float(tm_neutral(np.array([[v, v, v]]))[0, 0]), EM)]
    for k, (name, fn, c) in enumerate(curves):
        s.poly([(X(v), Y(fn(v))) for v in xs], stroke=c, w=2.6 if name != "clip" else 1.6, close=False, dash=None if name != "clip" else "5 4")
        s.line(460, 50 + k * 26, 490, 50 + k * 26, c, 3)
        s.text(498, 54 + k * 26, name, c, 12, "start", 700)
    s.line(X(1), y0, X(1), y1, GRID, 1, dash="3 3")
    s.text(X(1) + 4, y0 + 10, "paper white", MUTED, 9.5, "start")
    return s.svg()


@fig("tonemap_spheres")
def _():
    import numpy as np
    key = _norm(np.array([-0.45, 0.55, 0.7])); rim = _norm(np.array([0.85, 0.15, -0.2]))
    kd = np.array([0.75, 0.62, 0.5])

    def hdr(N, V):
        k = np.clip(_dot(N, key), 0, None) * np.array([3.6, 2.4, 1.3])
        r = np.clip(_dot(N, rim), 0, None) ** 1.5 * np.array([0.25, 0.7, 4.0])
        H = key + V; H = H / np.linalg.norm(H, axis=-1, keepdims=True)
        sp = np.power(np.clip(_dot(N, H), 0, None), 60) * 6
        return kd * (k + r + 0.03) + sp

    ops = [("none (clipped)", lambda c: np.clip(c, 0, 1)), ("Reinhard", tm_reinhard), ("ACES filmic", tm_aces), ("Neutral", tm_neutral)]
    s = S(640, 215)
    for i, (name, fn) in enumerate(ops):
        img = sphere_render(lambda N, V: fn(hdr(N, V)), 300, tonemap=False)
        x = 12 + i * 158
        s.add(img_tag(img, x, 8, 150, 150))
        s.text(x + 75, 182, name, TXT, 12, weight=650)
    s.text(320, 206, "identical linear HDR input; only the tone-mapping curve differs", MUTED, 10.5)
    return s.svg()


# ---------------------------------------------------------------- ch13

@fig("microfacets")
def _():
    import random
    s = S(640, 220)
    rnd = random.Random(4)
    def surface(ox, rough, title):
        pts = [(ox, 150)]
        x = ox
        while x < ox + 260:
            x += 16
            pts.append((x, 150 - (rnd.uniform(-1, 1) * 22 * rough)))
        s.poly(pts + [(pts[-1][0], 190), (ox, 190)], fill="#14304a", stroke=SKY, w=1.6)
        for (x1, y1), (x2, y2) in zip(pts[:-1], pts[1:]):
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            dx, dy = x2 - x1, y2 - y1
            L = math.hypot(dx, dy); nx, ny = dy / L, -dx / L
            s.line(mx, my, mx + nx * 26, my + ny * 26, EM, 1.4, op=0.85)
        s.text(ox + 130, 212, title, TXT, 12, weight=650)
    surface(30, 0.15, "smooth: normals agree → sharp highlight")
    surface(350, 1.0, "rough: normals spread → broad highlight")
    s.circle(60, 40, 10, fill=AM, stroke="none"); s.text(76, 44, "light", AM, 11, "start", 700)
    s.text(330, 40, "each green tick = one microfacet normal", MUTED, 10.5)
    return s.svg()


def _ggx(nh, r):
    a2 = (r * r) ** 2
    return a2 / (math.pi * (nh * nh * (a2 - 1) + 1) ** 2)


@fig("ggx_curves")
def _():
    s = S(620, 250)
    x0, y0, x1, y1 = 80, 20, 430, 200
    X = lambda deg: x0 + (x1 - x0) * (deg + 60) / 120
    Y = lambda v: y1 - (y1 - y0) * min(v, 6) / 6
    _plot_frame(s, x0, y0, x1, y1, [(X(d), f"{d}°") for d in (-60, -30, 0, 30, 60)], [(Y(v), f"{v:g}") for v in (0, 2, 4, 6)], "angle between h and n", "D (facet density)")
    for k, (r, c) in enumerate(((0.3, PK), (0.5, AM), (0.7, EM), (0.9, SKY))):
        pts = [(X(d), Y(_ggx(math.cos(math.radians(d)), r))) for d in range(-60, 61)]
        s.poly(pts, stroke=c, w=2.6, close=False)
        s.line(460, 50 + 26 * k, 490, 50 + 26 * k, c, 3); s.text(498, 54 + 26 * k, f"roughness {r}", c, 11.5, "start", 700)
    s.text(X(0) + 6, Y(6) + 12, f"r = 0.3 peaks at {_ggx(1, 0.3):.1f} (clipped)", PK, 9.5, "start")
    return s.svg()


@fig("fresnel_curve")
def _():
    s = S(620, 250)
    x0, y0, x1, y1 = 80, 20, 430, 200
    X = lambda deg: x0 + (x1 - x0) * deg / 90
    Y = lambda v: y1 - (y1 - y0) * v
    _plot_frame(s, x0, y0, x1, y1, [(X(d), f"{d}°") for d in (0, 30, 60, 90)], [(Y(v), f"{v:g}") for v in (0, 0.5, 1)], "angle from the normal (0° = head-on)", "reflectance F")
    sch = lambda f0, d: f0 + (1 - f0) * (1 - math.cos(math.radians(d))) ** 5
    for k, (name, f0, c) in enumerate((("water 0.02", 0.02, SKY), ("glass 0.04", 0.04, EM), ("diamond 0.17", 0.17, VI), ("gold (G channel) 0.71", 0.71, AM))):
        s.poly([(X(d), Y(sch(f0, d))) for d in range(0, 91)], stroke=c, w=2.6, close=False)
        s.line(460, 50 + 26 * k, 490, 50 + 26 * k, c, 3); s.text(498, 54 + 26 * k, name, c, 11.5, "start", 700)
    return s.svg()


def _cook_torrance_sphere(base, metal, rough):
    import numpy as np
    L = _norm(np.array([-0.4, 0.55, 0.73]))
    def shade(N, V):
        a = max(rough, 0.03) ** 2; a2 = a * a
        H = L + V; H = H / np.linalg.norm(H, axis=-1, keepdims=True)
        nl = np.clip(_dot(N, L), 0, 1); nv = np.clip(_dot(N, V), 1e-4, 1); nh = np.clip(_dot(N, H), 0, 1); vh = np.clip(_dot(V, H), 0, 1)
        D = a2 / (np.pi * (nh * nh * (a2 - 1) + 1) ** 2)
        Vis = 0.5 / (nv * np.sqrt(nl * nl * (1 - a2) + a2) + nl * np.sqrt(nv * nv * (1 - a2) + a2) + 1e-5)
        f0 = 0.04 * (1 - metal) + np.array(base) * metal
        F = f0 + (1 - f0) * (1 - vh) ** 5
        diff = np.array(base) * (1 - metal) / np.pi * (1 - F)
        direct = (diff + D * Vis * F) * nl * 3.2
        # simple environment: sky gradient blurred by roughness
        R = 2 * _dot(N, V) * N - V
        sky = np.array([0.55, 0.7, 1.0]) * 0.9; ground = np.array([0.18, 0.15, 0.12])
        t = np.clip(R[..., 1:2] * (1 - 0.6 * rough) * 2 + 0.5, 0, 1)
        envspec = ground * (1 - t) + sky * t
        fenv = f0 + (np.maximum(1 - rough, f0) - f0) * (1 - nv) ** 5
        tn = np.clip(N[..., 1:2] * 0.5 + 0.5, 0, 1)
        irr = (ground * (1 - tn) + sky * tn) * 0.6
        amb = np.array(base) * (1 - metal) * irr + fenv * envspec * (1 - 0.5 * rough)
        return direct + amb
    return shade


@fig("pbr_grid")
def _():
    s = S(640, 250)
    roughs = [0.05, 0.3, 0.55, 0.8, 1.0]
    for row, (metal, base, label) in enumerate(((0.0, [0.75, 0.2, 0.15], "metalness 0"), (1.0, [1.0, 0.71, 0.29], "metalness 1"))):
        s.text(94, 70 + row * 112, label, TXT, 11, "end", 700)
        for i, r in enumerate(roughs):
            img = sphere_render(_cook_torrance_sphere(base, metal, r), 220)
            s.add(img_tag(img, 104 + i * 106, 14 + row * 112, 100, 100))
    for i, r in enumerate(roughs):
        s.text(154 + i * 106, 246, f"roughness {r:g}", SOFT, 10.5)
    return s.svg()


@fig("pmrem_chain")
def _():
    import numpy as np
    from PIL import Image, ImageFilter
    W, H = 256, 128
    ys, xs = np.mgrid[0:H, 0:W]
    v = ys / H
    sky = np.array([0.35, 0.55, 0.95]); hor = np.array([0.95, 0.75, 0.55]); gr = np.array([0.15, 0.13, 0.12])
    img = np.where(v[..., None] < 0.5, sky * (1 - v[..., None] * 2) + hor * (v[..., None] * 2), gr + (hor - gr) * np.clip(1.5 - v[..., None] * 2.2, 0, 1) * 0.4)
    sun = np.exp(-(((xs - 70) ** 2 + (ys - 40) ** 2) / 60.0))[..., None] * 3
    win = ((xs > 160) & (xs < 200) & (ys > 30) & (ys < 70))[..., None] * 1.5
    img = img + sun + win
    img = np.clip(img / (1 + img) * 1.6, 0, 1)
    base = Image.fromarray((img * 255).astype("uint8"))
    s = S(640, 170)
    for i, (r, blur) in enumerate(((0.0, 0), (0.25, 3), (0.5, 8), (0.75, 16), (1.0, 30))):
        im = base.filter(ImageFilter.GaussianBlur(blur)) if blur else base
        s.add(img_tag(np.asarray(im) / 255, 14 + i * 124, 20, 116, 58))
        s.text(72 + i * 124, 100, f"roughness {r:g}", TXT, 11, weight=650)
        s.text(72 + i * 124, 116, f"mip level {i}", MUTED, 10)
    s.text(320, 150, "one PMREM texture holds every level; the shader picks the level from roughness", SOFT, 11)
    return s.svg()


# ---------------------------------------------------------------- ch14

@fig("ray_sphere")
def _():
    s = S(620, 230)
    O = (40, 150)
    C = (330, 120); R = 70
    s.circle(*C, R, fill="#14304a", stroke=SKY, w=2)
    s.circle(*C, 4, fill=SKY, stroke="none"); s.text(C[0] + 8, C[1] - 6, "c", SKY, 13, "start", 700, italic=True)
    s.arrow(*O, 590, 150, AM, 2.4); s.text(O[0], O[1] + 22, "o", AM, 13, weight=700, italic=True)
    s.text(560, 172, "d̂", AM, 13, weight=700)
    dy = 150 - C[1]; half = math.sqrt(R * R - dy * dy)
    t1, t2 = (C[0] - half, 150), (C[0] + half, 150)
    s.circle(*t1, 6, fill=EM, stroke="none"); s.circle(*t2, 6, fill=PK, stroke="none")
    s.text(t1[0] - 4, 172, "t₁ (entry)", EM, 11, "end", 700); s.text(t2[0] + 4, 172, "t₂ (exit)", PK, 11, "start", 700)
    s.line(C[0], C[1], C[0], 150, SOFT, 1.4, dash="4 3")
    s.text(C[0] + 6, 140, "closest approach", MUTED, 10, "start")
    s.text(40, 34, "b² − c < 0: miss   ·   = 0: graze   ·   > 0: two hits", TXT, 12, "start", 650)
    s.text(40, 214, "t = −b ± √(b² − c),   b = m·d̂,   c = m·m − r²,   m = o − c", SOFT, 11.5, "start", mono=True)
    return s.svg()


@fig("slab")
def _():
    s = S(620, 240)
    X = lambda x: 60 + x * 100
    Y = lambda y: 190 - y * 100
    s.rect(X(2), Y(1.2), 200, 120, fill="#1b2c55", stroke=IN, sw=2, rx=0)
    s.rect(X(2), 20, 200, 200, fill=IN, stroke="none", rx=0, op=0.08)
    s.rect(30, Y(1.2), 560, 120, fill=EM, stroke="none", rx=0, op=0.08)
    s.line(X(2), 20, X(2), 220, IN, 1, dash="4 4"); s.line(X(4), 20, X(4), 220, IN, 1, dash="4 4")
    s.line(30, Y(1.2), 590, Y(1.2), EM, 1, dash="4 4"); s.line(30, Y(0), 590, Y(0), EM, 1, dash="4 4")
    s.text(X(3), 34, "x slab", IN, 11, weight=700); s.text(560, Y(0.6), "y slab", EM, 11, "end", 700)
    o = (X(0), Y(0.1)); d = (1, 0.42)
    end = (X(5.2), Y(0.1 + 0.42 * 5.2))
    s.arrow(*o, *end, AM, 2.4)
    for t, c, lab in ((2, IN, "enter x"), (4, IN, "exit x"), (-0.1 / 0.42 + 0.0001, EM, ""), ((1.2 - 0.1) / 0.42, EM, "exit y")):
        if t <= 0: continue
        p = (X(t), Y(0.1 + 0.42 * t))
        s.circle(*p, 5, fill=c, stroke="none"); s.text(p[0] + 6, p[1] + 16, lab, c, 10.5, "start", 700)
    s.text(300, 232, "inside the box = inside every slab: t from max(entries) to min(exits)", SOFT, 11)
    return s.svg()


@fig("bvh")
def _():
    import random
    s = S(640, 260)
    rnd = random.Random(7)
    tris = []
    for cx, cy in ((90, 80), (120, 170), (210, 90), (250, 180), (370, 80), (400, 170), (500, 90), (540, 180)):
        for k in range(3):
            x, y = cx + rnd.uniform(-22, 22), cy + rnd.uniform(-18, 18)
            tris.append([(x, y - 9), (x + 10, y + 7), (x - 10, y + 7)])
    s.rect(50, 34, 530, 192, fill="none", stroke=SOFT, sw=1.5, rx=6)
    s.text(56, 28, "root (hit)", SOFT, 10.5, "start", 600)
    # left subtree: missed entirely
    s.rect(56, 40, 250, 180, fill="none", stroke=MUTED, sw=1.2, rx=5, dash="5 4")
    s.text(181, 238, "missed → 12 triangles skipped", MUTED, 10.5, weight=600)
    # right subtree: hit
    s.rect(324, 40, 250, 180, fill=VI, stroke=VI, sw=1.8, rx=5, op=0.10)
    s.rect(324, 40, 250, 180, fill="none", stroke=VI, sw=1.8, rx=5)
    s.rect(332, 48, 110, 164, fill=VI, stroke=VI, sw=1.4, rx=4, op=0.16)
    s.rect(332, 48, 110, 164, fill="none", stroke=VI, sw=1.4, rx=4)
    s.rect(458, 48, 110, 164, fill="none", stroke=MUTED, sw=1.2, rx=4, dash="5 4")
    s.text(387, 238, "hit → test 6 triangles", VI, 10.5, weight=700)
    s.text(513, 238, "missed", MUTED, 10.5, weight=600)
    for t in tris:
        s.poly(t, fill="#2a3a66", stroke=SOFT, w=0.8)
    s.arrow(372, 8, 408, 252, AM, 2.6)
    s.text(380, 18, "ray", AM, 11, "start", 700)
    return s.svg()


# ---------------------------------------------------------------- ch15

@fig("easing")
def _():
    s = S(620, 250)
    x0, y0, x1, y1 = 70, 26, 400, 210
    X = lambda t: x0 + (x1 - x0) * t
    Y = lambda v: y1 - (y1 - y0) * v / 1.15
    _plot_frame(s, x0, y0, x1, y1, [(X(v), f"{v:g}") for v in (0, 0.5, 1)], [(Y(v), f"{v:g}") for v in (0, 0.5, 1)], "time t", "progress e(t)")
    sp = lambda t: 1 - math.exp(-6 * t) * math.cos(9 * t) if t > 0 else 0
    fns = [("linear", lambda t: t, MUTED), ("ease-in (t²)", lambda t: t * t, SKY), ("ease-out", lambda t: 1 - (1 - t) ** 2, AM),
           ("ease-in-out cubic", lambda t: 4 * t ** 3 if t < 0.5 else 1 - (2 - 2 * t) ** 3 / 2, EM), ("spring (underdamped)", sp, PK)]
    for k, (n, f_, c) in enumerate(fns):
        s.poly([(X(i / 200), Y(f_(i / 200))) for i in range(201)], stroke=c, w=2.6 if n != "linear" else 1.6, close=False, dash="5 4" if n == "linear" else None)
        s.line(430, 50 + 26 * k, 460, 50 + 26 * k, c, 3); s.text(468, 54 + 26 * k, n, c, 11.5, "start", 700)
    return s.svg()


@fig("skinning")
def _():
    s = S(640, 230)
    def arm(ox, bent, title):
        J = (ox + 120, 140)
        s.line(ox, 140, J[0], 140, SKY, 10, cap="round"); s.circle(*J, 9, fill=AM, stroke="none")
        o = 48
        if bent:
            s.line(J[0], 140, J[0], 30, PK, 10, cap="round")
            s.circle(J[0] + o, 140, 7, fill="none", stroke=SKY, w=2, dash="3 3")
            s.circle(J[0], 140 - o, 7, fill="none", stroke=PK, w=2, dash="3 3")
            s.line(J[0] + o, 140, J[0], 140 - o, SOFT, 1, dash="2 3")
            s.circle(J[0] + o / 2, 140 - o / 2, 8, fill=RD, stroke="none")
            s.path(f"M {J[0]+o} 140 A {o} {o} 0 0 0 {J[0]} {140-o}", stroke=MUTED, w=1, dash="2 3")
            s.text(J[0] + o + 10, 158, "bone A's answer", SKY, 10.5, "start", 600)
            s.text(J[0] - 12, 140 - o + 4, "bone B's answer", PK, 10.5, "end", 600)
            s.text(J[0] + o / 2 + 14, 140 - o / 2 - 8, "blend: closer to the joint", RD, 10.5, "start", 700)
            s.text(J[0] + o / 2 + 14, 140 - o / 2 + 8, "(0.141 instead of 0.2)", RD, 10, "start", 600)
        else:
            s.line(J[0], 140, J[0] + 120, 140, PK, 10, cap="round")
            s.circle(J[0] + o, 140, 8, fill=EM, stroke="none")
            s.text(J[0] + o, 170, "vertex: 50% A, 50% B", EM, 10.5, weight=700)
        s.text(ox + 120, 210, title, TXT, 12, weight=650)
        s.text(ox + 50, 128, "bone A", SKY, 10.5, weight=700)
    arm(40, False, "bind pose")
    arm(330, True, "forearm rotated 90°")
    return s.svg()


@fig("two_bone_ik")
def _():
    s = S(620, 240)
    S0 = (110, 190); a, b, d = 0.30, 0.25, 0.40; sc = 520
    T = (S0[0] + d * sc, S0[1])
    A = math.acos((a * a + d * d - b * b) / (2 * a * d))
    E = (S0[0] + a * sc * math.cos(A), S0[1] - a * sc * math.sin(A))
    s.line(*S0, *T, SOFT, 1.4, dash="5 4")
    s.line(*S0, *E, SKY, 8, cap="round"); s.line(*E, *T, PK, 8, cap="round")
    s.circle(*S0, 8, fill=TXT, stroke="none"); s.circle(*E, 8, fill=AM, stroke="none"); s.circle(*T, 9, fill=EM, stroke="none")
    s.text(S0[0] - 12, S0[1] + 22, "shoulder", TXT, 11, "middle", 700)
    s.text(E[0], E[1] - 16, "elbow 92.9°", AM, 11, "middle", 700)
    s.text(T[0] + 12, T[1] + 22, "target", EM, 11, "middle", 700)
    s.text((S0[0] + E[0]) / 2 - 14, (S0[1] + E[1]) / 2, "a = 0.30", SKY, 11, "end", 700)
    s.text((E[0] + T[0]) / 2 + 14, (E[1] + T[1]) / 2, "b = 0.25", PK, 11, "start", 700)
    s.text((S0[0] + T[0]) / 2, S0[1] + 22, "d = 0.40", SOFT, 11, "middle", 600)
    s.path(f"M {S0[0]+50} {S0[1]} A 50 50 0 0 0 {S0[0]+50*math.cos(A):.1f} {S0[1]-50*math.sin(A):.1f}", stroke=TXT, w=1.6)
    s.text(S0[0] + 58, S0[1] - 14, "38.6°", TXT, 10.5, "start", 600)
    s.text(470, 60, "cos C = (a² + b² − d²) / 2ab", TXT, 11.5, "middle", mono=True)
    s.text(470, 84, "cos A = (a² + d² − b²) / 2ad", TXT, 11.5, "middle", mono=True)
    return s.svg()


# ---------------------------------------------------------------- ch16

@fig("gltf_structure")
def _():
    s = S(640, 270)
    def b(x, y, t, c, w=100):
        s.rect(x, y, w, 30, fill=CARD, stroke=c, sw=1.5, rx=8); s.text(x + w / 2, y + 19.5, t, TXT, 11.5, weight=650)
        return (x, y, w)
    def link(a, c, col=SOFT):
        (x1, y1, w1), (x2, y2, w2) = a, c
        s.arrow(x1 + w1 / 2, y1 + 30, x2 + w2 / 2, y2 - 2, col, 1.4, head=6)
    scene = b(20, 20, "scene", SOFT)
    node = b(20, 80, "nodes (TRS)", SOFT)
    mesh = b(140, 140, "mesh", EM)
    prim = b(140, 200, "primitives", EM)
    acc = b(280, 200, "accessors", SKY)
    bv = b(400, 200, "bufferViews", SKY)
    buf = b(520, 200, "buffers (.bin)", SKY, 110)
    mat = b(280, 140, "material", PK)
    tex = b(400, 140, "textures", PK)
    img = b(520, 140, "images", PK, 110)
    skin = b(140, 80, "skin", AM)
    anim = b(280, 20, "animations", AM, 110)
    cam = b(20, 140, "camera / light", VI, 110)
    link(scene, node); link(mesh, prim)
    s.arrow(70, 112, 70, 138, VI, 1.4, head=6)
    s.arrow(120, 112, 180, 138, SOFT, 1.4, head=6)
    s.arrow(122, 95, 138, 95, AM, 1.4, head=6)
    s.arrow(240, 215, 278, 215, SKY, 1.4, head=6); s.arrow(380, 215, 398, 215, SKY, 1.4, head=6); s.arrow(500, 215, 518, 215, SKY, 1.4, head=6)
    s.arrow(200, 200, 300, 172, PK, 1.4, head=6); s.arrow(380, 155, 398, 155, PK, 1.4, head=6); s.arrow(500, 155, 518, 155, PK, 1.4, head=6)
    s.arrow(330, 50, 330, 198, AM, 1.2, head=6, dash="4 3"); s.text(338, 110, "times & values", AM, 10, "start")
    s.arrow(278, 35, 122, 82, AM, 1.2, head=6, dash="4 3"); s.text(200, 50, "targets nodes", AM, 10, "middle")
    s.text(320, 258, "JSON describes structure; heavy data lives in binary buffers (one .glb file)", MUTED, 10.5)
    return s.svg()


# ---------------------------------------------------------------- ch17

@fig("integrators")
def _():
    s = S(640, 250)
    def run(semi, n=48, h=0.12):
        x, v, pts = 1.0, 0.0, []
        for _ in range(n):
            if semi:
                v += -x * h; x += v * h
            else:
                x, v = x + v * h, v - x * h
            pts.append((x, v))
        return pts
    for ox, semi, title, c in ((160, False, "explicit Euler: energy grows", RD), (480, True, "semi-implicit Euler: stays bounded", EM)):
        s.line(ox - 120, 120, ox + 120, 120, GRID, 1); s.line(ox, 15, ox, 225, GRID, 1)
        s.circle(ox, 120, 60, stroke=MUTED, w=1, dash="4 4")
        pts = run(semi)
        s.poly([(ox + x * 60, 120 - v * 60) for x, v in pts], stroke=c, w=1.8, close=False)
        s.circle(ox + 60, 120, 4, fill=TXT, stroke="none")
        s.text(ox, 244, title, c, 12, weight=700)
        s.text(ox + 118, 134, "x", MUTED, 10, "end"); s.text(ox + 6, 24, "v", MUTED, 10, "start")
    s.text(320, 14, "a spring (x'' = −x) in phase space, step h = 0.12, 48 steps; dashed = exact orbit", SOFT, 10.5)
    return s.svg()


# ---------------------------------------------------------------- ch18

@fig("shader_dataflow")
def _():
    s = S(640, 230)
    s.box(20, 30, 130, 50, "attributes", "per vertex", EM)
    s.box(20, 150, 130, 50, "uniforms", "per draw call", AM)
    s.box(230, 30, 150, 50, "vertex shader", "gl_Position", EM)
    s.box(230, 150, 150, 50, "rasteriser", "interpolates", SOFT)
    s.box(460, 90, 160, 50, "fragment shader", "colour", PK)
    s.arrow(152, 55, 228, 55, EM, 2)
    s.arrow(152, 170, 230, 70, AM, 1.6, dash="5 4")
    s.arrow(152, 180, 458, 125, AM, 1.6, dash="5 4")
    s.arrow(305, 82, 305, 148, SKY, 2); s.text(312, 120, "varyings", SKY, 11, "start", 700)
    s.arrow(382, 170, 458, 125, SKY, 2)
    s.box(460, 170, 160, 40, "textures", None, VI, size=12)
    s.arrow(540, 168, 540, 142, VI, 1.6)
    s.text(320, 222, "uniforms and textures can be read by both stages", MUTED, 10.5)
    return s.svg()


def _sdf_img(fn, px=150):
    import numpy as np
    ys, xs = np.mgrid[0:px, 0:px]
    x = (xs + 0.5) / px * 2 - 1; y = 1 - (ys + 0.5) / px * 2
    d = fn(x, y)
    inside = np.array([0.20, 0.83, 0.60]); outside = np.array([0.38, 0.55, 0.98])
    base = np.where(d[..., None] < 0, inside, outside)
    bands = 0.55 + 0.45 * np.cos(d * 60)[..., None]
    col = base * bands * np.exp(-np.abs(d) * 2.2)[..., None]
    line = np.clip(1 - np.abs(d) / 0.012, 0, 1)[..., None]
    return col * (1 - line) + line


@fig("sdf_shapes")
def _():
    import numpy as np
    circ = lambda x, y: np.sqrt((x + 0.25) ** 2 + y ** 2) - 0.4
    def box(x, y):
        qx, qy = np.abs(x - 0.3) - 0.3, np.abs(y) - 0.3
        return np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0)
    def smin(a, b, k=0.3):
        h = np.maximum(k - np.abs(a - b), 0) / k
        return np.minimum(a, b) - h * h * k * 0.25
    items = [("circle", circ), ("box", box), ("min (union)", lambda x, y: np.minimum(circ(x, y), box(x, y))), ("smooth min, k = 0.3", lambda x, y: smin(circ(x, y), box(x, y)))]
    s = S(640, 200)
    for i, (n, f_) in enumerate(items):
        s.add(img_tag(_sdf_img(f_), 12 + i * 158, 8, 150, 150))
        s.text(87 + i * 158, 180, n, TXT, 12, weight=650)
    return s.svg()


def _value_noise(px, freq, seed=1):
    import numpy as np
    rng = np.random.default_rng(seed)
    g = rng.random((freq + 2, freq + 2))
    ys, xs = np.mgrid[0:px, 0:px] / px * freq
    x0, y0 = xs.astype(int), ys.astype(int)
    fx, fy = xs - x0, ys - y0
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = g[y0, x0], g[y0, x0 + 1], g[y0 + 1, x0], g[y0 + 1, x0 + 1]
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


@fig("noise_fbm")
def _():
    import numpy as np
    px = 160
    rng = np.random.default_rng(5)
    cells = rng.random((8, 8))
    white = np.kron(cells, np.ones((px // 8, px // 8)))
    vn = _value_noise(px, 8, 2)
    fb = sum(0.5 ** i * _value_noise(px, 4 * 2 ** i, 10 + i) for i in range(4)) / 1.875
    def tint(a):
        a = (a - a.min()) / (a.max() - a.min())
        return np.stack([0.06 + 0.3 * a, 0.1 + 0.75 * a, 0.25 + 0.7 * a], -1)
    s = S(640, 210)
    for i, (n, a) in enumerate((("random value per cell", white), ("value noise (smoothed)", vn), ("fBm, 4 octaves", fb))):
        s.add(img_tag(tint(a), 40 + i * 200, 8, 160, 160))
        s.text(120 + i * 200, 190, n, TXT, 12, weight=650)
    return s.svg()


# ---------------------------------------------------------------- ch19

@fig("postfx_pipeline")
def _():
    s = S(660, 190)
    steps = [("Scene", "render once", EM), ("HDR target", "half float + depth", SKY), ("AO", "uses depth", IN), ("Bloom", "bright + blur", PK), ("AA", "SMAA / TAA", VI), ("Output", "tone map + sRGB", AM)]
    w, gap = 92, 17
    for i, (t, sub, c) in enumerate(steps):
        x = 10 + i * (w + gap)
        s.box(x, 50, w, 56, t, sub, c, size=12.5)
        if i < len(steps) - 1:
            s.arrow(x + w + 2, 78, x + w + gap - 2, 78, SOFT, 1.6, head=6)
    s.text(10, 34, "linear HDR all the way", SKY, 11, "start", 700)
    s.line(10, 40, 545, 40, SKY, 1.5, dash="5 4")
    s.text(655, 34, "display sRGB", AM, 11, "end", 700)
    s.text(330, 150, "every pass reads and writes the full screen: merge passes, run blurry effects at half resolution", SOFT, 11)
    return s.svg()


@fig("bloom_chain")
def _():
    import numpy as np
    from PIL import Image, ImageFilter
    W, H = 160, 100
    ys, xs = np.mgrid[0:H, 0:W]
    img = np.zeros((H, W, 3))
    ring = np.abs(np.hypot(xs - 55, ys - 50) - 22) < 2.5
    bar = (np.abs(ys - 50) < 2) & (xs > 95) & (xs < 140)
    img[ring] = [3.0, 0.8, 2.6]; img[bar] = [0.6, 2.4, 3.0]
    bright = np.clip(img - 1.0, 0, None)
    def blur(a, r):
        im = Image.fromarray(np.clip(a / 3 * 255, 0, 255).astype("uint8"))
        return np.asarray(im.filter(ImageFilter.GaussianBlur(r))) / 255 * 3
    s = S(660, 200)
    tm = lambda a: srgb_encode(a / (1 + a))
    s.add(img_tag(tm(img), 10, 30, 120, 75)); s.text(70, 124, "HDR scene", TXT, 11, weight=650)
    s.add(img_tag(tm(bright), 150, 30, 120, 75)); s.text(210, 124, "bright pass (> 1)", TXT, 11, weight=650)
    levels = [blur(bright, r) for r in (2, 5, 10)]
    for i, (lv, sz) in enumerate(zip(levels, (96, 72, 48))):
        x = 290 + i * 100
        s.add(img_tag(tm(lv * 2), x, 30 + (75 - sz * 0.625) / 2, sz, sz * 0.625))
        s.text(x + sz / 2, 124, ["½", "¼", "⅛"][i] + " res blur", TXT, 11, weight=650)
    final = img + sum(levels) * 0.9
    s.add(img_tag(tm(final), 560, 30, 96, 60)); s.text(608, 124, "sum + add", TXT, 11, weight=650)
    for x0, x1 in ((132, 148), (272, 288)):
        s.arrow(x0, 67, x1, 67, SOFT, 1.5, head=6)
    s.text(330, 170, "smaller levels cover larger screen distances for the same cost", SOFT, 11)
    return s.svg()


# ---------------------------------------------------------------- ch20

@fig("webgpu_objects")
def _():
    s = S(660, 250)
    s.box(10, 20, 110, 44, "adapter", "the GPU", SOFT, size=12)
    s.box(10, 100, 110, 44, "device", "creates all", EM, size=12)
    s.arrow(65, 66, 65, 98, SOFT, 1.5, head=6)
    s.text(150, 20, "created once (validated here)", EM, 11, "start", 700)
    items = [("buffers", SKY), ("textures", SKY), ("bind groups", IN), ("render pipeline", PK), ("compute pipeline", VI)]
    for i, (t, c) in enumerate(items):
        x = 150 + i * 102
        s.rect(x, 30, 94, 34, fill=CARD, stroke=c, sw=1.4, rx=8); s.text(x + 47, 51, t, TXT, 10.5, weight=650)
        s.arrow(122, 122, x + 47, 66, SOFT, 1, head=5, op=0.5)
    s.text(150, 150, "every frame (cheap)", AM, 11, "start", 700)
    s.box(150, 162, 150, 50, "command encoder", "record passes", AM, size=12)
    s.box(330, 162, 140, 50, "render / compute", "pass: set + draw", AM, size=12)
    s.box(500, 162, 140, 50, "queue.submit()", "GPU runs it", EM, size=12)
    s.arrow(302, 187, 328, 187, SOFT, 1.5, head=6); s.arrow(472, 187, 498, 187, SOFT, 1.5, head=6)
    s.arrow(503, 66, 420, 160, PK, 1.2, head=6, dash="4 3")
    s.text(330, 240, "three.js creates and caches pipelines per material variant; you never touch these objects directly", MUTED, 10.5)
    return s.svg()


@fig("compute_flow")
def _():
    s = S(660, 200)
    s.box(10, 70, 120, 56, "JavaScript", "set uniforms", AM, size=12.5)
    s.box(180, 20, 150, 56, "compute pass", "update kernel", VI, size=12.5)
    s.box(180, 120, 150, 56, "render pass", "draw instances", PK, size=12.5)
    s.rect(390, 55, 250, 86, fill="#14243f", stroke=SKY, sw=1.6, rx=10)
    s.text(515, 82, "storage buffer", SKY, 12.5, weight=700, disp=True)
    s.text(515, 102, "positions · velocities · colours", SOFT, 10.5)
    s.text(515, 120, "stays in GPU memory", SOFT, 10.5)
    s.arrow(132, 90, 178, 52, AM, 1.6, head=6); s.arrow(132, 106, 178, 146, AM, 1.6, head=6)
    s.arrow(332, 40, 400, 70, VI, 2, head=7); s.text(370, 42, "read + write", VI, 10.5, "start", 700)
    s.arrow(400, 130, 332, 150, PK, 2, head=7); s.text(368, 168, "read as instance data", PK, 10.5, "start", 700)
    s.text(70, 160, "no per-particle", MUTED, 10.5); s.text(70, 174, "CPU work", MUTED, 10.5)
    return s.svg()


# ---------------------------------------------------------------- ch21

@fig("r3f_reconciler")
def _():
    s = S(660, 250)
    s.rect(10, 20, 190, 170, fill=CARD, stroke=IN, sw=1.4, rx=10)
    s.text(105, 42, "React components (JSX)", IN, 12, weight=700)
    jsx = ["<Canvas>", "  <Car>", "    <mesh>", "      <boxGeometry />", "      <meshStandardMaterial />", "  <directionalLight />"]
    for i, l in enumerate(jsx):
        s.text(24, 68 + i * 19, l.replace("<", "&lt;").replace(">", "&gt;"), SOFT, 10.5, "start", mono=True)
    s.box(240, 70, 160, 64, "reconciler", "create / update / remove", EM, size=13)
    s.arrow(202, 102, 238, 102, SOFT, 1.8)
    s.rect(440, 20, 210, 170, fill=CARD, stroke=AM, sw=1.4, rx=10)
    s.text(545, 42, "three.js objects", AM, 12, weight=700)
    objs = ["Scene", "  Group (Car)", "    Mesh", "      .geometry = BoxGeometry", "      .material = MeshStandard…", "  DirectionalLight"]
    for i, l in enumerate(objs):
        s.text(454, 68 + i * 19, l, SOFT, 10.5, "start", mono=True)
    s.arrow(402, 102, 438, 102, SOFT, 1.8)
    s.text(320, 160, "only when props or state change", MUTED, 10.5)
    s.rect(240, 200, 410, 40, fill="#2a1424", stroke=PK, sw=1.4, rx=8)
    s.text(445, 225, "every frame: useFrame callbacks → gl.render(scene, camera)", PK, 11.5, weight=700)
    s.arrow(545, 192, 545, 199, PK, 1.4, head=5)
    return s.svg()


# ---------------------------------------------------------------- ch24

@fig("clustered")
def _():
    import random
    rnd = random.Random(11)
    s = S(640, 250)
    E = (30, 125)
    slices = [60, 140, 250, 400, 600]
    rows = 4
    half = lambda x: 10 + (x - 30) * 0.19
    lights = [(rnd.uniform(90, 590), rnd.uniform(-1, 1)) for _ in range(12)]
    target = (2, 1)  # slice index, row index
    for si in range(len(slices) - 1):
        x0, x1 = slices[si], slices[si + 1]
        for r in range(rows):
            def y(x, rr): return E[1] - half(x) + 2 * half(x) * rr / rows
            poly = [(x0, y(x0, r)), (x1, y(x1, r)), (x1, y(x1, r + 1)), (x0, y(x0, r + 1))]
            hit = (si, r) == target
            s.poly(poly, fill=AM if hit else "#121a31", stroke=LINE, w=1, op=0.35 if hit else 1)
            if hit:
                s.poly(poly, stroke=AM, w=2)
    s.rect(E[0] - 22, E[1] - 13, 32, 26, fill=CARD, stroke=TXT, rx=5); s.text(E[0] - 6, E[1] + 4, "cam", TXT, 9.5, weight=700)
    for lx, ly in lights:
        yy = E[1] + ly * half(lx) * 0.9
        inside = 250 < lx < 400 and (E[1] - half(lx) + 2 * half(lx) * 1 / rows) < yy < (E[1] - half(lx) + 2 * half(lx) * 2 / rows)
        s.circle(lx, yy, 5.5, fill=PK if inside else SKY, stroke="none")
    for lx, f_ in ((285, 0.3), (330, 0.55), (372, 0.8)):
        top = E[1] - half(lx) + 2 * half(lx) / rows; bot = E[1] - half(lx) + 4 * half(lx) / rows
        s.circle(lx, top + (bot - top) * f_, 6, fill=PK, stroke="none")
    # move three lights into the highlighted cluster region
    s.text(320, 240, "the amber cluster's light list holds only the pink lights that reach it", SOFT, 11)
    return s.svg()


@fig("fog_curves")
def _():
    s = S(620, 240)
    x0, y0, x1, y1 = 70, 20, 420, 195
    X = lambda d: x0 + (x1 - x0) * d / 60
    Y = lambda v: y1 - (y1 - y0) * v
    _plot_frame(s, x0, y0, x1, y1, [(X(d), f"{d}") for d in (0, 20, 40, 60)], [(Y(v), f"{v:g}") for v in (0, 0.5, 1)], "distance (m)", "fog factor f")
    lin = lambda d: min(max((d - 10) / 40, 0), 1)
    e2 = lambda d: 1 - math.exp(-(0.05 * d) ** 2)
    ph = lambda d: 1 - math.exp(-0.05 * d)
    for k, (n, f_, c) in enumerate((("Fog(10, 50) linear", lin, SKY), ("FogExp2(0.05)", e2, PK), ("1 − e^(−σd), σ = 0.05", ph, EM))):
        s.poly([(X(d / 4), Y(f_(d / 4))) for d in range(241)], stroke=c, w=2.6, close=False)
        s.line(445, 50 + 26 * k, 475, 50 + 26 * k, c, 3); s.text(483, 54 + 26 * k, n, c, 11, "start", 700)
    s.line(X(20), Y(0), X(20), Y(0.632), MUTED, 1, dash="3 3")
    return s.svg()


@fig("sphere_tracing")
def _():
    s = S(640, 230)
    obs = [("c", 200, 62, 34), ("c", 330, 196, 40), ("c", 520, 118, 58)]
    s.add('<clipPath id="stclip"><rect x="0" y="0" width="640" height="215"/></clipPath><g clip-path="url(#stclip)">')
    for k, x, y, r in obs:
        last = (x, y) == (520, 118)
        s.circle(x, y, r, fill="#173a2c" if last else "#1b2c55", stroke=EM if last else IN, w=2)
    O = (30, 118)
    s.arrow(*O, 630, 118, AM, 1.4, dash="6 4")
    def sdf(x, y):
        return min(math.hypot(x - ox, y - oy) - r for _, ox, oy, r in obs)
    t = 0
    for i in range(12):
        x, y = O[0] + t, O[1]
        d = sdf(x, y)
        if d < 1.0: break
        s.circle(x, y, d, stroke=SKY, w=1.3, op=0.75)
        s.circle(x, y, 3.5, fill=AM, stroke="none")
        t += d
    s.add('</g>')
    s.circle(O[0] + t, O[1], 6, fill=RD, stroke="none")
    s.text(O[0] + t - 8, O[1] - 10, "hit", RD, 11.5, "end", 700)
    s.text(320, 226, "each step = distance to the nearest surface in any direction: steps shrink near obstacles", SOFT, 11)
    return s.svg()


def _mc_ao(spp, W=150, H=105, seed=0):
    import numpy as np
    rng = np.random.default_rng(seed)
    cam = np.array([0.0, 1.5, 4.2]); look = np.array([0.0, 0.75, 0.0])
    fwd = look - cam; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right); up = np.cross(right, fwd)
    ys, xs = np.mgrid[0:H, 0:W]
    u = (xs + 0.5) / W * 2 - 1; v = 1 - (ys + 0.5) / H * 2
    t = math.tan(math.radians(22))
    dirs = fwd + u[..., None] * t * (W / H) * right + v[..., None] * t * up
    dirs /= np.linalg.norm(dirs, axis=-1, keepdims=True)
    C = np.array([0.0, 1.0, 0.0]); R = 1.0
    def hit_sphere(o, d):
        m = o - C; b = np.sum(m * d, -1); c = np.sum(m * m, -1) - R * R
        disc = b * b - c
        tt = -b - np.sqrt(np.maximum(disc, 0))
        return np.where((disc > 0) & (tt > 1e-3), tt, np.inf)
    def hit_plane(o, d):
        tt = -o[..., 1] / np.where(np.abs(d[..., 1]) < 1e-6, -1e-6, d[..., 1])
        return np.where(tt > 1e-3, tt, np.inf)
    O = np.broadcast_to(cam, dirs.shape)
    ts, tp = hit_sphere(O, dirs), hit_plane(O, dirs)
    tmin = np.minimum(ts, tp)
    P = O + dirs * np.where(np.isfinite(tmin), tmin, 0)[..., None]
    N = np.where((ts < tp)[..., None], (P - C) / R, np.array([0.0, 1.0, 0.0]))
    acc = np.zeros((H, W))
    for k in range(spp):
        r1, r2 = rng.random((H, W)), rng.random((H, W))
        phi = 2 * np.pi * r1; sr = np.sqrt(r2)
        local = np.stack([np.cos(phi) * sr, np.sin(phi) * sr, np.sqrt(1 - r2)], -1)
        a = np.where(np.abs(N[..., 0:1]) > 0.9, np.array([0.0, 1.0, 0.0]), np.array([1.0, 0.0, 0.0]))
        T = np.cross(a, N); T /= np.linalg.norm(T, axis=-1, keepdims=True); B = np.cross(N, T)
        d = local[..., 0:1] * T + local[..., 1:2] * B + local[..., 2:3] * N
        o = P + N * 1e-3
        occ = (hit_sphere(o, d) < 2.5) | (hit_plane(o, d) < 2.5)
        acc += ~occ
    ao = acc / spp
    img = np.stack([ao * 0.85, ao * 0.9, ao], -1)
    img[~np.isfinite(tmin)] = [0.06, 0.08, 0.14]
    return srgb_encode(img * 0.9)


@fig("monte_carlo")
def _():
    s = S(640, 150)
    for i, n in enumerate((1, 4, 16, 64)):
        s.add(img_tag(_mc_ao(n, seed=i), 10 + i * 158, 6, 150, 105))
        s.text(85 + i * 158, 132, f"{n} sample{'s' if n > 1 else ''} / pixel", TXT, 11.5, weight=650)
    return s.svg()


@fig("splat_blend")
def _():
    import numpy as np
    rng = np.random.default_rng(21)
    W, H = 300, 170
    ys, xs = np.mgrid[0:H, 0:W]
    img = np.zeros((H, W, 3)); img[:] = [0.04, 0.05, 0.1]
    T = np.ones((H, W))
    splats = []
    for k in range(260):
        cx, cy = rng.uniform(20, 280), rng.uniform(15, 155)
        ang = rng.uniform(0, np.pi); sx, sy = rng.uniform(4, 22), rng.uniform(2, 7)
        depth = rng.random()
        hue = (cx / 300) * 0.7 + 0.15
        col = np.array([0.5 + 0.5 * np.cos(6.28 * (hue + 0.0)), 0.5 + 0.5 * np.cos(6.28 * (hue + 0.33)), 0.5 + 0.5 * np.cos(6.28 * (hue + 0.67))])
        splats.append((depth, cx, cy, ang, sx, sy, rng.uniform(0.4, 0.9), col))
    splats.sort(key=lambda t: t[0])           # front to back
    for depth, cx, cy, ang, sx, sy, op, col in splats:
        c, sn = np.cos(ang), np.sin(ang)
        dx, dy = xs - cx, ys - cy
        u = (c * dx + sn * dy) / sx; v = (-sn * dx + c * dy) / sy
        a = op * np.exp(-0.5 * (u * u + v * v))
        img += (T * a)[..., None] * col
        T *= (1 - a)
    img += T[..., None] * np.array([0.04, 0.05, 0.1])
    s = S(640, 200)
    s.add(img_tag(np.clip(img, 0, 1), 20, 10, 300, 170))
    x = 350
    s.text(x, 40, "each splat: position, scale + rotation,", TXT, 11.5, "start", 600)
    s.text(x, 58, "opacity, colour (SH)", TXT, 11.5, "start", 600)
    s.text(x, 92, "C = Σ cᵢ αᵢ Π(1 − αⱼ)", AM, 12.5, "start", 700, mono=True)
    s.text(x, 126, "sorted front to back;", SOFT, 11, "start")
    s.text(x, 144, "stop when transmittance ≈ 0", SOFT, 11, "start")
    s.text(x, 178, "260 splats, rendered per pixel", MUTED, 10, "start")
    return s.svg()


# ---------------------------------------------------------------- book edition: roadmap

@fig("roadmap")
def _():
    stages = [
        ("Foundations", "Ch 1–6", "3D mental model · GPU pipeline · vectors · matrices · quaternions · projection", EM),
        ("three.js", "Ch 7–13", "scene & renderer · geometry · materials · lights & shadows · textures · colour · PBR", "#2dd4bf"),
        ("Motion & interaction", "Ch 14–17", "raycasting & picking · animation & skinning · glTF assets · physics", CY),
        ("Shaders & GPU", "Ch 18–20", "GLSL · render targets & post-processing · WebGPU · TSL · compute", SKY),
        ("React Three Fiber", "Ch 21–22", "reconciler · hooks · events · state · drei ecosystem · app architecture", IN),
        ("Production & performance", "Ch 23–24", "profiling · draw calls · LOD · memory · advanced rendering techniques", VI),
        ("WebXR", "Ch 25", "VR & AR sessions · controllers & hands · hit testing · comfort budgets", "#e879f9"),
        ("Projects", "Ch 26", "capstone briefs: configurator · digital twin · data globe · game · XR", PK),
        ("Interview preparation", "Ch 27", "30-minute, 2-hour & 7-day plans · question bank · system design", "#fb923c"),
        ("Reference", "Ch 28–30 · Glossary", "50 common problems · decision guides · formula & API sheets", AM),
    ]
    W, step = 660, 70
    H = 30 + step * len(stages)
    s = S(W, H)
    x0 = 62
    s.line(x0, 40, x0, H - 44, LINE, 2)
    for i, (name, chs, topics, c) in enumerate(stages):
        y = 30 + i * step
        s.circle(x0, y + 25, 16, fill="#0c1222", stroke=c, w=2.5)
        s.text(x0, y + 30, f"{i + 1:02d}", c, 11.5, weight=700, disp=True)
        s.rect(96, y, 544, 54, fill=CARD, stroke=c, sw=1.3, rx=10, op=1)
        s.add(f'<rect x="96" y="{y}" width="5" height="54" rx="2" fill="{c}"/>')
        s.text(116, y + 22, name.upper(), c, 12.5, "start", 700, disp=True)
        s.text(624, y + 22, chs, SOFT, 10.5, "end", 600, mono=True)
        s.text(116, y + 41, topics, TXT, 10.5, "start", 500)
    return s.svg()


# ---------------------------------------------------------------- book edition: decision trees

def _wrap(text, max_chars):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) > max_chars:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}" if cur else w
    if cur:
        lines.append(cur)
    return lines


def decision_tree(tree, W=660):
    """tree = (question, [(condition, node), ...]); node = (title, detail) for a leaf or a subtree.
    Laid out left to right: questions in amber, answers in emerald, conditions on the connectors."""
    def is_leaf(n):
        return isinstance(n[1], str)

    def depth(n):
        return 0 if is_leaf(n) else 1 + max(depth(c) for _, c in n[1])

    def leaves(n):
        return 1 if is_leaf(n) else sum(leaves(c) for _, c in n[1])

    D = depth(tree)
    row = 50 if D == 1 else 58
    H = leaves(tree) * row + 16
    s = S(W, H)
    qw = 132 if D == 1 else 112    # question box width
    gap = 150 if D == 1 else 104   # horizontal space for the condition labels
    cond_chars = 24 if D == 1 else 17
    leaf_x = 8 + D * (qw + gap)
    leaf_w = W - leaf_x - 6
    counter = [0]

    def place(n, d):
        x = 8 + d * (qw + gap)
        if is_leaf(n):
            y = 8 + counter[0] * row + row / 2
            counter[0] += 1
            return y, x
        ys = []
        for cond, c in n[1]:
            cy, cx = place(c, d + 1)
            ys.append((cond, c, cy, cx))
        y = (ys[0][2] + ys[-1][2]) / 2
        # question box
        lines = _wrap(n[0], 19)
        h = 18 + 13 * len(lines)
        s.rect(x, y - h / 2, qw, h, fill="#2a2210", stroke=AM, sw=1.4, rx=9)
        for i, l in enumerate(lines):
            s.text(x + qw / 2, y - h / 2 + 17 + 13 * i, l, "#fde68a", 10.5, weight=650, disp=True)
        # connectors
        for cond, c, cy, cx in ys:
            x1, xm = x + qw, x + qw + 14
            s.path(f"M {x1} {y} H {xm} V {cy} H {cx - 3}", stroke=LINE, w=1.4)
            s.poly([(cx - 3, cy - 3.5), (cx + 1, cy), (cx - 3, cy + 3.5)], fill=LINE, stroke="none")
            cl = _wrap(cond, cond_chars)
            for i, l in enumerate(cl):
                s.text(xm + 6, cy - 4 - 11 * (len(cl) - 1 - i), l, SOFT, 9.5, "start", 500)
        return y, x

    def leaves_draw(n, d):
        if is_leaf(n):
            return
        for cond, c in n[1]:
            if is_leaf(c):
                pass
            else:
                leaves_draw(c, d + 1)

    place(tree, 0)
    # draw leaves (second pass so boxes sit on top of connectors)
    counter[0] = 0

    def draw_leaves(n):
        if is_leaf(n):
            y = 8 + counter[0] * row + row / 2
            counter[0] += 1
            title, detail = n
            dl = _wrap(detail, int((leaf_w - 16) / 5.0))
            bh = 26 + 12 * len(dl)
            s.rect(leaf_x, y - bh / 2, leaf_w, bh, fill="#0f2a22", stroke=EM, sw=1.3, rx=8)
            s.text(leaf_x + 10, y - bh / 2 + 16, title, "#a7f3d0", 11, "start", 700, disp=True)
            for i, l in enumerate(dl):
                s.text(leaf_x + 10, y - bh / 2 + 30 + 12 * i, l, SOFT, 9.4, "start", 500)
            return
        for _, c in n[1]:
            draw_leaves(c)

    draw_leaves(tree)
    return s.svg()


TREES = {
    "tree_animation": ("What needs to move?", [
        ("continuous, procedural motion", ("useFrame + delta", "spin, bob, follow; damp with MathUtils.damp / maath")),
        ("UI-style transition on state change", ("react-spring or easing", "open/closed, hover, configurator swaps")),
        ("choreographed sequence or scroll story", ("GSAP timeline / ScrollControls", "keyframed camera moves, story beats")),
        ("authored in Blender", ("AnimationMixer clips", "glTF animations, cross-fades, additive layers")),
        ("a character's body", ("skeletal animation (+ IK)", "SkinnedMesh, two-bone IK for feet and hands")),
        ("faces, lip sync, shape keys", ("morph targets", "morphTargetInfluences by name")),
        ("thousands of things at once", ("vertex shader or compute", "particles, grass, crowds on the GPU")),
    ]),
    "tree_many_objects": ("How should I draw many objects?", [
        ("a few dozen, all different", ("separate meshes", "share materials and geometries")),
        ("same geometry, many copies", ("InstancedMesh", "one draw call; per-instance matrix and colour")),
        ("different shapes, one material, must move", ("BatchedMesh", "one multi-draw; per-instance culling")),
        ("static, never moves", ("merge geometries", "mergeGeometries; one draw call")),
        ("millions of points", ("Points + GPU", "point clouds, compute particles, octree LOD")),
    ]),
    "tree_perf": ("Where is the frame time going?", [
        ("CPU-bound (resolution change does not help)", ("What is the CPU doing?", [
            ("many draw calls", ("instance, batch, merge", "share materials; fewer shadow casters")),
            ("React renders every frame", ("refs + transient store", "no setState in useFrame")),
            ("JS simulation or parsing", ("workers, WASM, fixed step", "physics and loading off the main thread")),
            ("regular hitches", ("stop per-frame allocation", "reuse vectors and matrices")),
        ])),
        ("GPU-bound (half resolution is much faster)", ("What is the GPU doing?", [
            ("too many pixels", ("cap DPR, adapt quality", "PerformanceMonitor, upscaling")),
            ("overdraw and heavy shaders", ("reduce layers, simplify", "alphaTest, cheaper materials")),
            ("too many vertices", ("LOD and culling", "Detailed, impostors, smaller far meshes")),
            ("post-processing and shadows", ("merge passes, half res", "bake, fewer casters, autoUpdate off")),
        ])),
    ]),
    "tree_physics": ("What kind of motion or collision?", [
        ("smooth follow or settle", ("damping or a spring", "no physics engine needed")),
        ("projectiles without collisions", ("integrate it yourself", "semi-implicit Euler, fixed step")),
        ("simple hits: ground, walls, pick", ("raycasts and shape tests", "Ray, Box3, Sphere, three-mesh-bvh")),
        ("stacking, joints, many contacts", ("a physics engine", "Rapier (@react-three/rapier), Jolt")),
        ("a player character", ("kinematic character controller", "slides on walls, climbs steps")),
        ("cloth, rope, soft bodies", ("Verlet / position-based", "distance constraints, or GPU compute")),
    ]),
    "tree_renderer": ("Which renderer?", [
        ("existing app with ShaderMaterial / EffectComposer", ("WebGLRenderer", "stable; migrate when there is a reason")),
        ("new project", ("WebGPURenderer", "automatic WebGL 2 fallback; profile both")),
        ("needs compute (particles, simulation)", ("WebGPURenderer + TSL", "storage buffers, renderer.compute()")),
        ("relies on @react-three/postprocessing", ("WebGLRenderer", "or rebuild effects with RenderPipeline")),
    ]),
    "tree_shadows": ("What kind of shadows?", [
        ("static scene and lights", ("bake lightmaps and AO", "free at runtime, includes bounce light")),
        ("a product on a floor", ("ContactShadows / Accumulative", "soft grounding, no shadow camera")),
        ("large world, roaming camera", ("SunLight (cascades)", "two cascades fitted to the view")),
        ("small bounded stage", ("fitted DirectionalLight", "tight box, normalBias, 1–2K map")),
        ("an indoor lamp", ("SpotLight, not PointLight", "one shadow render instead of six")),
        ("stylised or casual game", ("blob shadow", "a dark radial texture on a plane")),
    ]),
    "tree_transparency": ("What is see-through?", [
        ("cut-outs: leaves, fences, hair cards", ("alphaTest (or alphaHash)", "no sorting, depth works")),
        ("glass, liquid, gems", ("MeshPhysicalMaterial transmission", "costs an extra pass")),
        ("fading objects, ghosts, UI", ("opacity + transparent", "depthWrite: false; renderOrder")),
        ("many overlapping layers", ("alphaHash + TAA, or OIT", "order-independent results")),
        ("glowing particles", ("AdditiveBlending", "depthWrite: false; order does not matter")),
    ]),
    "tree_post": ("Which post-processing stack?", [
        ("WebGLRenderer + React Three Fiber", ("@react-three/postprocessing", "merged effects, EffectComposer in JSX")),
        ("WebGLRenderer, vanilla three.js", ("EffectComposer + OutputPass", "RenderPass, effects, then OutputPass")),
        ("WebGPURenderer", ("RenderPipeline + TSL nodes", "pass(), bloom(), MRT; colour transform built in")),
        ("only need tone mapping", ("no post-processing", "renderer.toneMapping is enough")),
    ]),
    "tree_state": ("Where should this R3F state live?", [
        ("changes every frame", ("refs, typed arrays or the GPU", "mutate in useFrame; never setState")),
        ("shared, changes occasionally", ("zustand with selectors", "only subscribed slices re-render")),
        ("changes elsewhere, read every frame", ("store + getState()", "transient read inside useFrame")),
        ("local and rare", ("useState", "menus, toggles, selection")),
    ]),
    "tree_assets": ("How should I ship this asset?", [
        ("big static geometry, download dominates", ("glTF + Draco", "smallest geometry, slower decode")),
        ("animated or mobile-first", ("glTF + Meshopt", "fast decode, stays quantised")),
        ("textures", ("KTX2 / Basis", "ETC1S for colour, UASTC for normals")),
        ("scans and point clouds", ("PLY / LAS + octree LOD", "stream by screen-space error")),
        ("photoreal capture of a place", ("Gaussian splats", "GaussianSplat (r186) or Spark")),
    ]),
}

for _name, _tree in TREES.items():
    FIGS[_name] = (lambda t: (lambda: decision_tree(t)))(_tree)


# ---------------------------------------------------------------- book edition: extra teaching diagrams

@fig("cpu_gpu_drawcalls")
def _():
    s = S(660, 250)
    s.text(165, 20, "1,000 meshes → 1,000 draw calls", RD, 12, weight=700)
    s.text(495, 20, "1 InstancedMesh → 1 draw call", EM, 12, weight=700)
    for side, ox, n, col in ((0, 20, 9, RD), (1, 350, 1, EM)):
        s.rect(ox, 34, 290, 60, fill=CARD, stroke=SOFT, sw=1.2, rx=8)
        s.text(ox + 10, 52, "CPU (JavaScript + driver)", SOFT, 10.5, "start", 650)
        for k in range(n):
            w = 26 if n > 1 else 270
            x = ox + 10 + k * 30
            s.rect(x, 60, w, 24, fill=col, stroke="none", rx=4, op=0.85)
            s.text(x + w / 2, 76, "draw" if n > 1 else "draw(1,000 instances)", "#0a0e1a", 9.5 if n > 1 else 11, weight=700)
        s.rect(ox, 150, 290, 70, fill=CARD, stroke=SOFT, sw=1.2, rx=8)
        s.text(ox + 10, 168, "GPU (thousands of cores)", SOFT, 10.5, "start", 650)
        if n > 1:
            for k in range(9):
                s.rect(ox + 10 + k * 30, 178, 26, 30, fill=col, stroke="none", rx=4, op=0.35)
            s.text(ox + 145, 236, "busy with set-up, idle in between", RD, 10.5, weight=600)
        else:
            s.rect(ox + 10, 178, 270, 30, fill=col, stroke="none", rx=4, op=0.75)
            s.text(ox + 145, 236, "one submission keeps every core busy", EM, 10.5, weight=600)
        s.arrow(ox + 145, 96, ox + 145, 146, SOFT, 1.6)
        s.text(ox + 152, 124, "command buffer", MUTED, 10, "start")
    return s.svg()


@fig("perspective_divide")
def _():
    s = S(640, 230)
    E = (60, 170)
    s.circle(*E, 5, fill=TXT, stroke="none"); s.text(E[0], E[1] + 20, "eye", SOFT, 11, weight=600)
    s.line(E[0], E[1], 610, E[1], LINE, 1.4)
    s.text(612, E[1] + 16, "−z (view direction)", MUTED, 10, "end")
    xp, xo = 200, 520
    s.line(xp, 30, xp, 200, IN, 2); s.text(xp, 22, "image plane (distance f)", IN, 10.5, weight=700)
    P = (xo, 50)
    s.line(xo, E[1], xo, P[1], AM, 2.2, dash="5 4")
    s.circle(*P, 6, fill=AM, stroke="none"); s.text(P[0] + 10, P[1] + 4, "point (y, z)", AM, 11, "start", 700)
    s.line(*E, *P, SOFT, 1.4)
    yp = E[1] - (E[1] - P[1]) * (xp - E[0]) / (xo - E[0])
    s.circle(xp, yp, 5.5, fill=PK, stroke="none"); s.text(xp + 10, yp - 6, "projected y′", PK, 11, "start", 700)
    s.text(xo + 8, (E[1] + P[1]) / 2, "y", AM, 12, "start", 700, italic=True)
    s.text((E[0] + xo) / 2 + 40, E[1] + 20, "z (distance)", SOFT, 11)
    s.text((E[0] + xp) / 2, E[1] + 20, "f", IN, 12, weight=700, italic=True)
    s.rect(360, 92, 250, 52, fill=CARD, stroke=LINE, sw=1, rx=8)
    s.text(485, 113, "y′ = f · y / z", TXT, 13, weight=700, mono=True)
    s.text(485, 133, "similar triangles: divide by distance", SOFT, 10.5)
    return s.svg()


@fig("pbr_pipeline")
def _():
    s = S(660, 270)
    inputs = [("base colour", EM), ("metalness", SKY), ("roughness", VI), ("normal map", PK)]
    for i, (t, c) in enumerate(inputs):
        s.rect(10, 22 + i * 52, 104, 36, fill=CARD, stroke=c, sw=1.4, rx=8)
        s.text(62, 44 + i * 52, t, TXT, 11, weight=650)
    s.box(150, 40, 130, 52, "F0 & diffuse", "mix(0.04, base, m)", AM, size=12)
    s.box(150, 132, 130, 52, "α = roughness²", "shading normal", VI, size=12)
    for i in range(4):
        s.arrow(116, 40 + i * 52, 148, 66 if i < 2 else 158, SOFT, 1.2, head=6)
    s.box(318, 16, 150, 58, "direct lights", "Σ BRDF·E·(n·l)", SKY, size=12)
    s.box(318, 96, 150, 58, "diffuse IBL", "irradiance", CY, size=12)
    s.box(318, 176, 150, 58, "specular IBL", "PMREM × (F0·A + B)", CY, size=12)
    for y in (45, 125, 205):
        s.arrow(282, 66, 316, y, SOFT, 1.2, head=6)
        s.arrow(282, 158, 316, y, SOFT, 1.2, head=6, op=0.6)
    s.box(500, 96, 66, 58, "Σ", "linear HDR", EM, size=16)
    for y in (45, 125, 205):
        s.arrow(470, y, 498, 125, SOFT, 1.4, head=6)
    s.box(586, 70, 68, 44, "tone map", None, AM, size=11)
    s.box(586, 136, 68, 44, "→ sRGB", None, PK, size=11)
    s.arrow(568, 118, 584, 92, SOFT, 1.2, head=5)
    s.arrow(620, 116, 620, 134, SOFT, 1.2, head=5)
    s.text(330, 262, "everything left of the tone mapper is linear light; the conversion to sRGB happens once", MUTED, 10.5)
    return s.svg()


@fig("texture_pipeline")
def _():
    s = S(660, 200)
    steps = [("file", "PNG · JPEG · KTX2", SOFT, "download size"), ("decode", "worker / transcoder", SKY, "CPU time"),
             ("upload", "to VRAM", IN, "VRAM: w·h·bpp·4/3"), ("mipmaps", "½ · ¼ · ⅛ …", VI, "+1/3 memory"),
             ("sample", "filter · anisotropy", EM, "bandwidth per pixel")]
    w, gap = 112, 17
    for i, (t, sub, c, cost) in enumerate(steps):
        x = 8 + i * (w + gap)
        s.box(x, 40, w, 58, t, sub, c, size=13)
        s.text(x + w / 2, 124, cost, AM, 10.5, weight=650)
        if i < len(steps) - 1:
            s.arrow(x + w + 2, 69, x + w + gap - 2, 69, SOFT, 1.6, head=6)
    s.text(330, 22, "what a texture costs at each step", TXT, 12, weight=650)
    s.text(330, 160, "PNG/JPEG are decoded to raw RGBA (4 bytes per texel) before upload;", SOFT, 11)
    s.text(330, 178, "KTX2/Basis is transcoded to a GPU format and stays compressed in VRAM (0.5–1 byte per texel)", SOFT, 11)
    return s.svg()


@fig("tsl_pipeline")
def _():
    s = S(660, 220)
    s.rect(8, 40, 150, 120, fill=CARD, stroke=AM, sw=1.4, rx=9)
    s.text(83, 60, "TSL in JavaScript", AM, 11.5, weight=700)
    for i, l in enumerate(["colorNode =", "  mix(a, b,", "    uv().y)", "positionNode = …"]):
        s.text(18, 84 + i * 16, l, SOFT, 10, "start", mono=True)
    s.box(190, 60, 120, 80, "node graph", "built once, lazily", VI, size=12.5)
    s.arrow(160, 100, 188, 100, SOFT, 1.6)
    s.box(342, 60, 120, 80, "NodeBuilder", "per backend", IN, size=12.5)
    s.arrow(312, 100, 340, 100, SOFT, 1.6)
    s.box(494, 22, 158, 64, "WGSL", "WebGPU backend", EM, size=13)
    s.box(494, 114, 158, 64, "GLSL ES 3.0", "WebGL 2 fallback", SKY, size=13)
    s.arrow(464, 92, 492, 56, SOFT, 1.6); s.arrow(464, 108, 492, 144, SOFT, 1.6)
    s.text(330, 206, "the same material source compiles to either shading language; pipelines are cached per material variant", MUTED, 10.5)
    return s.svg()
