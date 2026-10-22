#!/usr/bin/env python3
"""Run the python blocks of one lesson the way the browser does: print each block's text output and save every
cvlab.show() picture as a PNG, so you can look at them while writing.

    .venv/bin/python tools/preview.py content/01-pixels/04-how-a-camera-sees.md OUTDIR [block-number ...]

Pictures are saved as OUTDIR/b<block>_<n>.png. `shared` blocks run in one persistent namespace.
"""
import contextlib, io, os, re, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "assets" / "py"))
import cvlab  # noqa: E402

body = Path(sys.argv[1]).read_text(encoding="utf-8")
out_dir = Path(sys.argv[2]); out_dir.mkdir(parents=True, exist_ok=True)
only = {int(a) for a in sys.argv[3:]}
blocks = re.findall(r"```python run([^\n]*)\n(.*?)```", body, re.S)
shared_ns = {"__name__": "__main__"}
for i, (meta, code) in enumerate(blocks, 1):
    if only and i not in only:
        continue
    title = (re.search(r'title="([^"]*)"', meta) or [None, ""])[1]
    ns = shared_ns if " shared" in " " + meta else {"__name__": "__main__"}
    d = out_dir / f"b{i}"
    d.mkdir(exist_ok=True)
    os.environ["CVLAB_OUT"] = str(d)
    buf, t0 = io.StringIO(), time.time()
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(code, f"block{i}", "exec"), ns)
        status = "ok"
    except BaseException as e:
        status = f"ERROR {type(e).__name__}: {e}"
    pics = sorted(p.name for p in d.glob("*.png"))
    print(f"=== block {i} [{title}] {status} ({time.time() - t0:.1f}s) pictures: {len(pics)} in {d}")
    print(buf.getvalue().rstrip())
