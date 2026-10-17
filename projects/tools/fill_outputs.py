"""Fill every ```output block that contains just "@@" with what the python block before it really prints.

    PL_PYTHON=/path/to/venv/bin/python python3 projects/tools/fill_outputs.py <lesson-file-fragment>

Write the block, put `@@` in the output block after it, run this once, then read the result before you trust it.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build  # noqa: E402

fragment = sys.argv[1]
for mdir in sorted(p for p in build.CONTENT.iterdir() if p.is_dir()):
    for f in sorted(mdir.glob("*.md")):
        if f.name.startswith("_") or fragment not in f.name:
            continue
        raw = f.read_text(encoding="utf-8")
        meta, body = build.parse_front_matter(raw)
        expanded = build.expand_includes(body, str(f), [])
        outputs = []
        for job in build.jobs_for(f, expanded, 0):
            if job["expect"] is None or job["expect"].strip() != "@@":
                continue
            job["expect"] = None
            res = build.run_py(job)
            if not res["ok"]:
                sys.exit(f"{f.name}:{job['line']} failed: {res['why']}\n{res['detail']}")
            outputs.append(res["res"]["o"].rstrip("\n"))
        parts = re.split(r"```output\n@@\n```", raw)
        if len(parts) - 1 != len(outputs):
            sys.exit(f"{f.name}: {len(parts) - 1} placeholders but {len(outputs)} blocks to fill")
        filled = parts[0]
        for out, rest in zip(outputs, parts[1:]):
            filled += f"```output\n{out}\n```" + rest
        f.write_text(filled, encoding="utf-8")
        print(f"{f.name}: filled {len(outputs)} output block(s)")
