#!/usr/bin/env python3
"""Run the python blocks of one lesson the way the browser does and print each block's output.

    .venv/bin/python tools/preview.py content/14-projects/01-bpe-tokenizer.md

`shared` blocks run in one persistent namespace (like the browser runner); other blocks run alone.
Use it while writing a lesson to check that every printed number matches what the text claims.
"""
import contextlib, io, re, sys, time
from pathlib import Path

body = Path(sys.argv[1]).read_text(encoding="utf-8")
blocks = re.findall(r"```python run([^\n]*)\n(.*?)```", body, re.S)
shared_ns = {"__name__": "__main__"}
for i, (meta, code) in enumerate(blocks, 1):
    title = (re.search(r'title="([^"]*)"', meta) or [None, ""])[1]
    ns = shared_ns if " shared" in " " + meta else {"__name__": "__main__"}
    buf, t0 = io.StringIO(), time.time()
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(code, f"block{i}", "exec"), ns)
        status = "ok"
    except BaseException as e:
        status = f"ERROR {type(e).__name__}: {e}"
    print(f"=== block {i} [{title}] {status} ({time.time() - t0:.1f}s)")
    print(buf.getvalue().rstrip())
