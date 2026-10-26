#!/usr/bin/env python3
"""Show the recorded Node output of every ```js run block in the lessons whose path contains the argument.

    python3 tools/outputs.py closures-basics            # all run blocks of that lesson
    python3 tools/outputs.py closures-basics --code     # also print the code
    python3 tools/outputs.py 03-closures -n 12          # first 12 output lines per block

Read this after writing a lesson: the prose must agree with what the program really prints.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build  # noqa: E402


def main(argv):
    pats = [a for a in argv if not a.startswith("-") and not a.isdigit()]
    show_code = "--code" in argv
    limit = int(argv[argv.index("-n") + 1]) if "-n" in argv else 40
    cache = json.loads(build.CACHE.read_text()) if build.CACHE.exists() else {}
    for f in sorted(build.CONTENT.rglob("*.md")):
        if pats and not any(p in str(f) for p in pats):
            continue
        raw = f.read_text(encoding="utf-8")
        meta, body = build.parse_front_matter(raw)
        offset = raw[: len(raw) - len(body)].count("\n")
        for job in build.jobs_for(f, body, offset):
            res = cache.get(job["key"])
            print(f"\n=== {f.relative_to(ROOT)}:{job['line']}  {' '.join(k for k in job['meta'] if k != 'run')}")
            if show_code:
                print(job["code"])
                print("--- output ---")
            if res is None:
                print("   (not built yet: run python3 build.py)")
                continue
            lines = []
            for k, s in res["c"]:
                for l in s.rstrip("\n").split("\n"):
                    lines.append(("   " if k == "o" else "  !") + l)
            print("\n".join(lines[:limit]))
            if len(lines) > limit:
                print(f"   … ({len(lines) - limit} more lines)")
            if res.get("err"):
                print(f"   >>> Uncaught {res['err']['name']}: {res['err']['message']}")


if __name__ == "__main__":
    main(sys.argv[1:])
