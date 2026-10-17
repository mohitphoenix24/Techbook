"""Print what each python block of a lesson really outputs, so you can paste it into the ```output block after it.

    PL_PYTHON=/path/to/venv/bin/python python3 projects/tools/show_outputs.py <lesson-file-fragment>
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build  # noqa: E402

fragment = sys.argv[1]
for mdir in sorted(p for p in build.CONTENT.iterdir() if p.is_dir()):
    for f in sorted(mdir.glob("*.md")):
        if f.name.startswith("_") or fragment not in f.name:
            continue
        text = f.read_text(encoding="utf-8")
        meta, body = build.parse_front_matter(text)
        body = build.expand_includes(body, str(f), [])
        for job in build.jobs_for(f, body, 0):
            job["expect"] = None
            res = build.run_py(job)
            print(f"--- {f.name}:{job['line']} {job['meta'].get('title', '')}")
            print(res["res"]["o"].rstrip() if res["ok"] else f"FAILED: {res['why']}\n{res['detail']}")
