"""cvlab: the small helper module used by the VisionLab course.

It does two jobs so the lessons can stay focused on computer vision:

  1. cvlab.image("astronaut")    gives you a ready-made photo (the browser has no files, so there is no cv2.imread).
  2. cvlab.show(img, "title")    draws pictures in the output panel (the browser has no cv2.imshow).

It also makes small, repeatable test pictures (a chessboard, a road, a photographed page, a stereo pair, ...)
so every example gives the same result on every run.

All pictures are RGB, uint8, shape (height, width, 3). Grey pictures are 2-D: (height, width).
Remember: cv2.imread gives BGR order. cvlab.image gives RGB, so use cv2.COLOR_RGB2GRAY, not BGR2GRAY.
"""
import base64
import json
import os

import cv2
import numpy as np

try:                      # "js" exists only inside the browser (Pyodide)
    import js
except ImportError:       # building and testing on a normal computer
    js = None

_HERE = os.path.dirname(os.path.abspath(__file__))
_DATA = os.environ.get("CVLAB_DATA") or next(
    (p for p in (os.path.join(_HERE, "cvlab_data"), os.path.join(os.path.dirname(_HERE), "img")) if os.path.isdir(p)), _HERE)

NAMES = ["astronaut", "coffee", "cat", "camera", "coins", "page", "rocket", "retina", "moon", "text", "horse", "brick", "gravel", "grass"]
_log = []                 # every picture that show() drew (used by the tests)


# ----------------------------------------------------------------------------- loading
def image(name="astronaut", size=None, gray=False):
    """A sample photo as an RGB uint8 array. Names: see cvlab.NAMES. size=(width, height) resizes it."""
    if name not in NAMES:
        raise ValueError(f"unknown image {name!r}; choose one of {NAMES}")
    for ext in ("jpg", "png"):
        path = os.path.join(_DATA, f"{name}.{ext}")
        if os.path.exists(path):
            break
    else:
        raise FileNotFoundError(f"{name} is missing from {_DATA}")
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img.ndim == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    if size is not None:
        img = cv2.resize(img, tuple(size), interpolation=cv2.INTER_AREA)
    if gray and img.ndim == 3:
        img = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    return img


def data_path(filename):
    """Path of a data file shipped with the course (for example the Haar face model)."""
    for base in (_DATA, os.path.join(os.path.dirname(_HERE), "data"), os.path.join(_HERE, "cvlab_data")):
        p = os.path.join(base, filename)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(filename)


# ----------------------------------------------------------------------------- showing
def _to_uint8(im):
    im = np.asarray(im)
    if im.ndim == 3 and im.shape[2] == 1:
        im = im[:, :, 0]
    if im.ndim == 3 and im.shape[2] == 4:
        im = im[:, :, :3]
    if im.ndim not in (2, 3) or (im.ndim == 3 and im.shape[2] != 3):
        raise ValueError(f"cannot show an array of shape {im.shape}; expected (H, W) or (H, W, 3)")
    if im.dtype == np.uint8:
        return im
    if im.dtype == bool:
        return im.astype(np.uint8) * 255
    im = im.astype(np.float64)
    lo, hi = float(np.nanmin(im)), float(np.nanmax(im))
    if lo >= 0.0 and hi <= 1.0 + 1e-9:
        out = im * 255.0                                  # float pictures in 0..1
    elif hi > lo:
        out = (im - lo) / (hi - lo) * 255.0               # anything else is stretched to fill 0..255
    else:
        out = np.zeros_like(im)
    return np.clip(np.nan_to_num(out), 0, 255).round().astype(np.uint8)


def _pack(im, title=None, width=None):
    u = _to_uint8(im)
    h, w = u.shape[:2]
    top = max(h, w)
    if width:
        s = width / w
        u = cv2.resize(u, (width, max(1, round(h * s))), interpolation=cv2.INTER_NEAREST if s > 1 else cv2.INTER_AREA)
    elif top < 160:                                       # tiny pictures: blow up with hard pixel edges so you can see the pixels
        k = int(np.ceil(224 / top))
        u = cv2.resize(u, (w * k, h * k), interpolation=cv2.INTER_NEAREST)
    elif top > 520:
        s = 520 / top
        u = cv2.resize(u, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    arr = cv2.cvtColor(u, cv2.COLOR_RGB2BGR) if u.ndim == 3 else u
    ok, buf = cv2.imencode(".png", arr)
    if not ok:
        raise RuntimeError("could not encode the picture")
    return {"src": "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode(), "title": title or "",
            "w": int(w), "h": int(h), "shape": list(np.asarray(im).shape), "dtype": str(np.asarray(im).dtype)}


def show(*items, titles=None, width=None):
    """Draw one or more pictures in the output panel.

        cvlab.show(img)                                  one picture
        cvlab.show(a, "Before", b, "After")              a short text after a picture is its title
        cvlab.show(a, b, c, titles=["x", "y", "z"])      or give the titles as a list
        cvlab.show(img, width=300)                       fix the displayed width in pixels
    Float pictures between 0 and 1 are shown as they are; other floats and 16-bit pictures are stretched to 0..255.
    """
    pics, names = [], []
    for it in items:
        if isinstance(it, str) and pics and names[-1] is None:
            names[-1] = it
        else:
            pics.append(it)
            names.append(None)
    if titles is not None:
        names = [titles[i] if i < len(titles) else n for i, n in enumerate(names)]
    packed = [_pack(p, n, width) for p, n in zip(pics, names)]
    _log.extend(packed)
    if js is not None and hasattr(js.window, "__cvlabShow"):
        js.window.__cvlabShow(json.dumps(packed))
    elif os.environ.get("CVLAB_OUT"):
        os.makedirs(os.environ["CVLAB_OUT"], exist_ok=True)
        for k, p in enumerate(packed):
            n = len(os.listdir(os.environ["CVLAB_OUT"]))
            with open(os.path.join(os.environ["CVLAB_OUT"], f"{n:03d}.png"), "wb") as f:
                f.write(base64.b64decode(p["src"].split(",", 1)[1]))


def side_by_side(*images, gap=6, bg=255):
    """Glue pictures into one wide picture (handy for cv2.imwrite or for comparing results)."""
    u = [_to_uint8(i) for i in images]
    u = [cv2.cvtColor(i, cv2.COLOR_GRAY2RGB) if i.ndim == 2 else i for i in u]
    h = max(i.shape[0] for i in u)
    parts = []
    for i in u:
        pad = np.full((h - i.shape[0], i.shape[1], 3), bg, np.uint8)
        parts += [np.vstack([i, pad]), np.full((h, gap, 3), bg, np.uint8)]
    return np.hstack(parts[:-1])


# ----------------------------------------------------------------------------- noise
def noisy(img, sigma=20, seed=0):
    """Add Gaussian noise (standard deviation sigma, in grey levels) to a uint8 picture."""
    rng = np.random.default_rng(seed)
    out = img.astype(np.float64) + rng.normal(0, sigma, img.shape)
    return np.clip(out, 0, 255).astype(np.uint8)


def salt_pepper(img, amount=0.05, seed=0):
    """Turn a fraction `amount` of the pixels pure black or pure white."""
    rng = np.random.default_rng(seed)
    out = img.copy()
    r = rng.random(img.shape[:2])
    out[r < amount / 2] = 0
    out[(r >= amount / 2) & (r < amount)] = 255
    return out


# ----------------------------------------------------------------------------- test pictures
def checkerboard(rows=6, cols=9, square=40, border=40):
    """A chessboard with `rows` x `cols` squares and a white border. (cols-1, rows-1) inner corners."""
    h, w = rows * square + 2 * border, cols * square + 2 * border
    img = np.full((h, w), 255, np.uint8)
    for r in range(rows):
        for c in range(cols):
            if (r + c) % 2 == 0:
                y, x = border + r * square, border + c * square
                img[y:y + square, x:x + square] = 0
    return img


def shapes(size=256, seed=0):
    """A clean picture of coloured circles, rectangles and a triangle on a plain background (good for contours)."""
    rng = np.random.default_rng(seed)
    img = np.full((size, size, 3), 235, np.uint8)
    cols = [(220, 60, 60), (60, 120, 220), (60, 180, 90), (225, 140, 20), (150, 80, 200)]
    s = size / 256
    cv2.circle(img, (int(60 * s), int(60 * s)), int(38 * s), cols[0], -1, cv2.LINE_AA)
    cv2.rectangle(img, (int(130 * s), int(30 * s)), (int(225 * s), int(95 * s)), cols[1], -1)
    cv2.fillConvexPoly(img, (np.array([[40, 228], [100, 140], [160, 228]]) * s).astype(np.int32), cols[2], cv2.LINE_AA)
    cv2.ellipse(img, (int(208 * s), int(178 * s)), (int(36 * s), int(21 * s)), 25, 0, 360, cols[3], -1, cv2.LINE_AA)
    cv2.circle(img, (int(112 * s), int(104 * s)), int(14 * s), cols[4], -1, cv2.LINE_AA)
    return img


def scene(n=5, size=(320, 240), seed=0):
    """A little picture of coloured objects with known boxes: returns (img, boxes).
    boxes is a list of (x1, y1, x2, y2, label); labels are 'box', 'ball' and 'cone'."""
    rng = np.random.default_rng(seed)
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    base = (205 + 25 * (yy / h))[..., None] * np.ones((1, 1, 3))
    img = np.clip(base + rng.normal(0, 3, (h, w, 3)), 0, 255).astype(np.uint8)
    boxes, tries = [], 0
    palette = {"box": (200, 70, 60), "ball": (50, 120, 210), "cone": (240, 170, 30)}
    while len(boxes) < n and tries < 300:
        tries += 1
        label = ["box", "ball", "cone"][int(rng.integers(0, 3))]
        bw, bh = int(rng.integers(36, 80)), int(rng.integers(36, 80))
        if label == "ball":
            bh = bw
        x1, y1 = int(rng.integers(4, w - bw - 4)), int(rng.integers(4, h - bh - 4))
        b = (x1, y1, x1 + bw, y1 + bh)
        if any(not (b[2] + 6 < o[0] or o[2] + 6 < b[0] or b[3] + 6 < o[1] or o[3] + 6 < b[1]) for o in boxes):
            continue
        col = tuple(int(c) for c in np.clip(np.array(palette[label]) + rng.integers(-25, 25, 3), 0, 255))
        if label == "box":
            cv2.rectangle(img, (b[0], b[1]), (b[2], b[3]), col, -1)
        elif label == "ball":
            cv2.circle(img, ((b[0] + b[2]) // 2, (b[1] + b[3]) // 2), bw // 2, col, -1, cv2.LINE_AA)
        else:
            cv2.fillConvexPoly(img, np.array([[b[0], b[3]], [(b[0] + b[2]) // 2, b[1]], [b[2], b[3]]], np.int32), col, cv2.LINE_AA)
        boxes.append(b + (label,))
    return img, boxes


def warped_pair(name="coffee", angle=18, scale=0.85, shift=(25, 15), persp=(2e-4, 1e-4), darker=0.8, noise=3, seed=0):
    """Two views of the same flat scene: the photo, and the same photo turned, shrunk, shifted, seen at a slight angle,
    a little darker and noisier. Returns (a, b, H) where H is the true 3x3 matrix taking points of a to points of b."""
    a = image(name)
    h, w = a.shape[:2]
    c = np.array([w / 2, h / 2])
    ang = np.deg2rad(angle)
    R = np.array([[np.cos(ang) * scale, -np.sin(ang) * scale, 0], [np.sin(ang) * scale, np.cos(ang) * scale, 0], [0, 0, 1]])
    T1 = np.array([[1, 0, -c[0]], [0, 1, -c[1]], [0, 0, 1]], float)
    T2 = np.array([[1, 0, c[0] + shift[0]], [0, 1, c[1] + shift[1]], [0, 0, 1]], float)
    P = np.array([[1, 0, 0], [0, 1, 0], [persp[0], persp[1], 1]], float)
    H = T2 @ P @ R @ T1
    b = cv2.warpPerspective(a, H, (w, h), borderMode=cv2.BORDER_REFLECT)
    b = noisy((b.astype(np.float64) * darker).astype(np.uint8), noise, seed)
    return a, b, H


def video(n=60, size=(320, 240), noise=3, seed=0):
    """A short synthetic video from a fixed camera: a red ball, a blue box and a yellow ellipse move across a textured
    background. The ball and the ellipse cross around frame 30 (the ellipse passes in front).
    Returns (frames, tracks): frames is a list of n RGB pictures; tracks maps an id ('ball', 'box', 'ellipse') to a list of
    n true boxes (x1, y1, x2, y2), or None when the object is fully outside the picture."""
    rng = np.random.default_rng(seed)
    w, h = size
    tex = cv2.resize(image("gravel"), (w, h)).astype(np.float64)
    grad = np.linspace(150, 110, h)[:, None]
    bg = np.clip(0.35 * tex + 0.65 * grad, 0, 255)[..., None] * np.array([1.0, 1.02, 1.05])
    bg = cv2.GaussianBlur(bg.astype(np.float32), (0, 0), 1.2)
    frames, tracks = [], {"ball": [], "box": [], "ellipse": []}
    for t in range(n):
        f = bg.copy()
        bx, by = 20 + 4.2 * t, 70 + 20 * np.sin(t / 8)
        kx, ky = 300 - 3.0 * t, 175
        ex, ey = 146 + (30 - t) * 4.4, 58 + (30 - t) * 1.5
        cv2.rectangle(f, (int(kx - 18), int(ky - 14)), (int(kx + 18), int(ky + 14)), (60, 90, 200), -1)
        cv2.circle(f, (int(bx), int(by)), 14, (215, 55, 55), -1, cv2.LINE_AA)
        cv2.ellipse(f, (int(ex), int(ey)), (22, 12), 0, 0, 360, (235, 200, 60), -1, cv2.LINE_AA)
        f = np.clip(f + rng.normal(0, noise, f.shape), 0, 255).astype(np.uint8)
        frames.append(f)
        for name, (cx, cy, hw, hh) in {"ball": (bx, by, 14, 14), "box": (kx, ky, 18, 14), "ellipse": (ex, ey, 22, 12)}.items():
            box = (cx - hw, cy - hh, cx + hw, cy + hh)
            inside = box[2] > 0 and box[0] < w and box[3] > 0 and box[1] < h
            tracks[name].append(tuple(float(v) for v in box) if inside else None)
    return frames, tracks


def discs(cols=4, rows=3, seed=0, size=(320, 240)):
    """Bright, round, coin-like discs of slightly different sizes on a dark background, in a staggered grid.
    Neighbours touch, so a plain threshold glues them into one blob. Returns (img, count)."""
    rng = np.random.default_rng(seed)
    w, h = size
    img = rng.normal(35, 4, (h, w))
    s = min(w / (cols + 0.5), h / ((rows - 1) * 0.87 + 1.3))            # distance between neighbouring centres
    x0 = (w - ((cols - 1) * s + s / 2)) / 2
    y0 = (h - (rows - 1) * 0.87 * s) / 2
    yy, xx = np.ogrid[:h, :w]
    count = 0
    for r in range(rows):
        for c in range(cols):
            cx = x0 + c * s + (s / 2 if r % 2 else 0) + rng.uniform(-2, 2)
            cy = y0 + r * 0.87 * s + rng.uniform(-2, 2)
            rad = s * rng.uniform(0.46, 0.53)
            d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
            shade = 175 + 30 * (1 - d / rad) - 12 * (yy - cy) / rad
            img = np.where(d <= rad, shade + rng.normal(0, 4, (h, w)), img)
            count += 1
    return cv2.GaussianBlur(np.clip(img, 0, 255).astype(np.uint8), (0, 0), 1.0), count


def road(w=640, h=360, curve=0.0, noise=6, seed=0):
    """A synthetic road seen from a car: sky, tarmac, two solid edge lines and a dashed centre line.
    curve bends the road to the right (positive) or left (negative); try -1.5 .. 1.5."""
    rng = np.random.default_rng(seed)
    hy = int(h * 0.42)                                                    # horizon row
    img = np.zeros((h, w, 3), np.uint8)
    for y in range(hy):
        img[y] = (np.array([120, 170, 230]) * (0.75 + 0.25 * y / hy)).astype(np.uint8)
    img[hy:] = (70, 110, 70)                                              # grass
    ts = np.linspace(0, 1, 60)
    ys = (h - ts * (h - hy)).astype(np.float64)
    cx = w / 2 + curve * ts ** 2 * w * 0.28
    hw = (w * 0.46) * (1 - ts) + 2
    poly = np.concatenate([np.stack([cx - hw, ys], 1), np.stack([cx + hw, ys], 1)[::-1]]).astype(np.int32)
    cv2.fillPoly(img, [poly], (88, 88, 92), cv2.LINE_AA)

    def line(off, thick0, dashed=False, col=(240, 240, 240)):
        for i in range(len(ts) - 1):
            if dashed and (i // 3) % 2:
                continue
            p = (int(cx[i] + off * hw[i]), int(ys[i])), (int(cx[i + 1] + off * hw[i + 1]), int(ys[i + 1]))
            cv2.line(img, p[0], p[1], col, max(1, int(thick0 * (1 - ts[i]) + 0.5)), cv2.LINE_AA)
    line(-0.9, 7)
    line(0.9, 7)
    line(0.0, 6, dashed=True, col=(240, 215, 70))
    g = np.linspace(0.85, 1.1, h)[:, None, None]
    img = np.clip(img * g + rng.normal(0, noise, img.shape), 0, 255).astype(np.uint8)
    return img


def document(seed=0, size=(640, 480)):
    """A photographed sheet of paper lying on a wooden desk, at an angle.
    Returns (photo, corners): corners are the four paper corners in the photo, ordered top-left, top-right, bottom-right, bottom-left."""
    rng = np.random.default_rng(seed)
    pw, ph = 300, 400
    page = np.full((ph, pw, 3), 246, np.uint8)
    cv2.rectangle(page, (24, 26), (pw - 24, 62), (60, 60, 70), -1)
    y = 84
    while y < ph - 40:
        n = int(rng.integers(14, 28))
        xs = 24
        for _ in range(n):
            wlen = int(rng.integers(8, 30))
            if xs + wlen > pw - 24:
                break
            cv2.line(page, (xs, y), (xs + wlen, y), (70, 70, 75), 3)
            xs += wlen + 5
        y += 16
    cv2.circle(page, (pw - 70, ph - 60), 24, (200, 70, 60), 3)
    W, H = size
    desk = np.zeros((H, W, 3), np.float64)
    streak = rng.normal(0, 1, (1, W)).repeat(H, 0)
    streak = cv2.GaussianBlur(streak, (0, 0), 3)
    desk[:] = np.array([150, 105, 70]) + 12 * streak[..., None]
    desk += rng.normal(0, 4, desk.shape)
    desk = np.clip(desk, 0, 255).astype(np.uint8)
    src = np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]])
    jit = rng.uniform(-18, 18, (4, 2))
    dst = (np.float32([[150, 50], [470, 80], [520, 420], [110, 440]]) + jit).astype(np.float32) * np.float32([W / 640, H / 480])
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(page, M, (W, H))
    mask = cv2.warpPerspective(np.full((ph, pw), 255, np.uint8), M, (W, H))
    shadow = cv2.GaussianBlur(cv2.warpPerspective(np.full((ph, pw), 255, np.uint8), M, (W, H), borderValue=0), (0, 0), 9)
    shadow = np.roll(shadow, (8, 8), (0, 1)).astype(np.float64) / 255
    out = desk * (1 - 0.45 * shadow[..., None])
    out = np.where(mask[..., None] > 0, warped, out)
    out = np.clip(out + rng.normal(0, 2.5, out.shape), 0, 255).astype(np.uint8)
    return out, dst


def stereo_pair(w=320, h=240, seed=0):
    """Two views of a made-up scene, like the left and right eye, plus the true disparity (in pixels).
    Returns (left, right, disparity). Near things move more between the two pictures than far things."""
    rng = np.random.default_rng(seed)
    tex = image("coffee", size=(w, h)).astype(np.float64)
    grit = cv2.resize(image("gravel"), (w, h)).astype(np.float64)[..., None]          # the gravel photo is grey: it adds fine texture
    tex = 0.6 * tex + 0.4 * grit
    tex += rng.normal(0, 6, tex.shape)
    left = np.clip(tex, 0, 255).astype(np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]
    disp = 6 + 10 * (yy / h)                                              # a ground plane: the lower, the closer
    disp = disp.astype(np.float64)
    disp[int(h * .30):int(h * .80), int(w * .12):int(w * .38)] = 30
    r2 = (xx - w * 0.68) ** 2 + (yy - h * 0.45) ** 2
    disp[r2 < (h * 0.2) ** 2] = 22
    d = np.round(disp).astype(int)
    order = np.argsort(d, axis=None, kind="stable")                      # far first, near last: near things win overlaps
    ys, xs = yy.ravel()[order], xx.ravel()[order]
    tx = xs - d.ravel()[order]
    keep = tx >= 0
    right = np.zeros_like(left)
    filled = np.zeros((h, w), np.uint8)
    right[ys[keep], tx[keep]] = left[ys[keep], xs[keep]]
    filled[ys[keep], tx[keep]] = 255
    right = cv2.inpaint(right, 255 - filled, 3, cv2.INPAINT_TELEA)
    return left, right, disp.astype(np.float32)


__all__ = ["image", "show", "side_by_side", "data_path", "noisy", "salt_pepper", "checkerboard", "shapes", "discs", "video", "warped_pair", "scene", "road", "document", "stereo_pair", "NAMES"]
