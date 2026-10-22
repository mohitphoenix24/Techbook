"""Build assets/img/* (small JPEG/PNG sample photos) from the public-domain / CC0 images shipped with scikit-image.

Run once with any Python that has scikit-image + OpenCV:   python3 tools/make_images.py
Licences (from scikit-image's docs): astronaut = NASA, public domain · camera, chelsea, coffee, horse = CC0 ·
coins, text = no known restrictions · rocket = SpaceX, public domain · brick, gravel, grass = CC0 textures (cc0textures.com) ·
retina = CC0 · page = scikit-image sample · moon = public domain.
"""
import json
from pathlib import Path

import cv2
import numpy as np
from skimage import data

OUT = Path(__file__).resolve().parent.parent / "assets" / "img"
OUT.mkdir(parents=True, exist_ok=True)


def fit(img, side):
    h, w = img.shape[:2]
    s = side / max(h, w)
    return img if s >= 1 else cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)


def save(name, img, side=420, ext="jpg"):
    img = fit(img, side)
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR) if img.ndim == 3 else img
    path = OUT / f"{name}.{ext}"
    cv2.imwrite(str(path), bgr, [cv2.IMWRITE_JPEG_QUALITY, 90] if ext == "jpg" else [cv2.IMWRITE_PNG_COMPRESSION, 9])
    return {"name": name, "file": path.name, "shape": list(img.shape)}


items = []
items.append(save("astronaut", data.astronaut(), 384))
items.append(save("coffee", data.coffee(), 420))
items.append(save("cat", data.chelsea(), 420))
items.append(save("camera", data.camera(), 400))
items.append(save("coins", data.coins(), 400))
items.append(save("page", data.page(), 420, "png"))
items.append(save("rocket", data.rocket(), 420))
items.append(save("retina", data.retina(), 360))
items.append(save("moon", data.moon(), 300))
items.append(save("text", data.text(), 450, "png"))
items.append(save("horse", (data.horse().astype(np.uint8) * 255), 330, "png"))
items.append(save("brick", data.brick(), 256))
items.append(save("gravel", data.gravel(), 256))
items.append(save("grass", data.grass(), 256))
(OUT / "manifest.json").write_text(json.dumps(items, indent=1))
for it in items:
    print(it["file"], it["shape"], (OUT / it["file"]).stat().st_size)
print("total KB", sum((OUT / i["file"]).stat().st_size for i in items) // 1024)
