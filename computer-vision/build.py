#!/usr/bin/env python3
"""Bundle the Markdown lessons in content/ into assets/js/content.js and verify every Python example (VisionLab).

    python3 build.py                 # bundle + verify every NEW or CHANGED ```python run``` block (cached)
    python3 build.py --no-verify     # bundle only
    python3 build.py --only=canny    # verify only lessons whose path contains "canny"
    python3 build.py --read          # also list long sentences (the course aims for short, simple sentences)
    python3 build.py --force         # ignore the cache and re-run everything
    python3 build.py --watch         # rebuild whenever a lesson changes (bundle only)

Layout:
    content/<NN-module>/_module.md     front matter: title, icon, level, description, kind
    content/<NN-module>/<NN-slug>.md   front matter: title, level, time, summary (+ tags, icon, cover)
The lesson id is the file name without its number prefix, so keep slugs unique.

Verification: each ```python run``` block is executed with .venv/bin/python (NumPy 2, OpenCV 4.11, scikit-image, SciPy,
scikit-learn, matplotlib: the same libraries the browser runner, Pyodide, ships) with assets/py on the path, so `import cvlab`
works. Blocks marked `shared` build on the earlier `shared` blocks of the same page. `expect-error` blocks must fail.
Blocks written as ```python local check``` are PyTorch examples that are only shown in the course (they do not run in the
browser); here they are executed with the system python3 (which has torch + torchvision) so that every PyTorch snippet in the
course has really run. The build also lints the content: levels, quizzes, internal links, viz names and duplicate ids.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
OUT = ROOT / "assets" / "js" / "content.js"
CACHE_DIR = ROOT / ".build-cache"
CACHE = CACHE_DIR / "py.json"
RUN_TIMEOUT = 90
# The browser runs NumPy 2.x + OpenCV 4.11 (Pyodide), so verify with a matching interpreter: computer-vision/.venv
#   python3 -m venv .venv && .venv/bin/pip install "numpy>=2.2,<2.3" opencv-python-headless==4.11.0.86 scikit-image scipy scikit-learn matplotlib pillow
_VENV = ROOT / ".venv" / "bin" / "python"
PYTHON = os.environ.get("CV_PYTHON") or (str(_VENV) if _VENV.exists() else sys.executable)
TORCH_PYTHON = os.environ.get("CV_TORCH_PYTHON") or "python3"          # needs torch + torchvision (for ```python local check``` blocks)
PYPATH = str(ROOT / "assets" / "py")
LEVELS = {"easy", "intermediate", "advanced", "mixed"}


def parse_front_matter(text: str):
    meta = {}
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            for line in text[3:end].strip().splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip().strip('"')
            text = text[end + 4:].lstrip("\n")
    return meta, text


def strip_number(name: str) -> str:
    return re.sub(r"^\d+[-_]", "", name)


def fnv(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:16]


META_RE = re.compile(r'([\w-]+)(?:=(?:"([^"]*)"|(\S+)))?')
FENCE_RE = re.compile(r"^(`{3,})([\w+-]*)\s*(.*)$")


def parse_meta(s: str):
    return {m.group(1): (m.group(2) if m.group(2) is not None else m.group(3) if m.group(3) is not None else True)
            for m in META_RE.finditer(s or "")}


def code_blocks(body: str):
    """[(line_no, lang, meta, code)] for fenced blocks (``` and longer fences)."""
    lines = body.replace("\r\n", "\n").split("\n")
    out, i = [], 0
    while i < len(lines):
        m = FENCE_RE.match(lines[i])
        if m:
            fence, start, code = m.group(1), i, []
            i += 1
            while i < len(lines) and not (lines[i].startswith(fence) and re.match(r"^`{3,}\s*$", lines[i])):
                code.append(lines[i])
                i += 1
            out.append((start + 1, (m.group(2) or "text").lower(), parse_meta(m.group(3)), "\n".join(code)))
        i += 1
    return out


def jobs_for(lesson_file: Path, body: str, offset: int):
    """Runnable python blocks of one lesson; `shared` blocks are prefixed with the earlier shared ones."""
    prefix = tprefix = ""
    for line, lang, meta, code in code_blocks(body):
        if lang not in ("python", "py"):
            continue
        if meta.get("local") and meta.get("check"):                       # PyTorch example: executed here, shown (not run) in the browser
            full = code
            if meta.get("shared"):                                        # `shared` local blocks continue from the earlier `shared` local blocks
                full = tprefix + "\n" + code if tprefix else code
                tprefix = full
            yield {"file": str(lesson_file.relative_to(ROOT)), "line": line + offset, "meta": meta, "torch": True,
                   "code": full, "key": fnv("torch\u0000" + full)}
            continue
        if not meta.get("run"):
            continue
        full = code
        if meta.get("shared"):
            full = prefix + "\n" + code if prefix else code
            prefix = full
        if meta.get("skiplocal"):
            continue
        yield {"file": str(lesson_file.relative_to(ROOT)), "line": line + offset, "meta": meta,
               "code": full, "key": fnv(full + "\u0000" + ("x" if meta.get("expect-error") else ""))}


def run_py(job):
    expect_err = bool(job["meta"].get("expect-error"))
    torch = bool(job.get("torch"))
    with tempfile.TemporaryDirectory(prefix="cv-py-") as d:
        src = os.path.join(d, "main.py")
        Path(src).write_text(job["code"] + "\n", encoding="utf-8")
        env = dict(os.environ, PYTHONHASHSEED="0", PYTHONIOENCODING="utf-8", MPLBACKEND="Agg", OMP_NUM_THREADS="1", PYTHONPATH=PYPATH)
        limit = 300 if torch else RUN_TIMEOUT
        try:
            rp = subprocess.run([TORCH_PYTHON if torch else PYTHON, src], capture_output=True, text=True, timeout=limit, cwd=d, env=env, input="")
        except subprocess.TimeoutExpired:
            return {"ok": False, "why": f"timed out after {limit}s", "detail": ""}
        err = rp.stderr.replace(src, "main.py")
        if expect_err:
            if rp.returncode == 0:
                return {"ok": False, "why": "expected an error but it exited 0", "detail": rp.stdout[-1500:]}
            return {"ok": True, "res": {"o": rp.stdout, "e": err, "x": rp.returncode}}
        if rp.returncode != 0:
            return {"ok": False, "why": f"exit code {rp.returncode}", "detail": rp.stdout[-1500:] + "\n--- stderr ---\n" + err[-3000:]}
        warn = [l for l in err.splitlines() if "Warning" in l and not (torch and ("UserWarning" in l or "FutureWarning" in l or "weights" in l))]
        if warn:
            return {"ok": False, "why": "printed a warning", "detail": "\n".join(warn[:5])}
        return {"ok": True, "res": {"o": rp.stdout, "e": err, "x": 0}}


def verify(all_jobs, only=None, force=False):
    cache = {}
    if CACHE.exists() and not force:
        try:
            cache = json.loads(CACHE.read_text(encoding="utf-8"))
        except ValueError:
            cache = {}
    todo = [j for j in all_jobs if j["key"] not in cache and (not only or only in j["file"])]
    fails = []
    if todo:
        print(f"verifying {len(todo)} python example(s) ({len(all_jobs) - len(todo)} cached)…")
        workers = min(6, os.cpu_count() or 4)
        with ThreadPoolExecutor(workers) as ex:
            for job, res in zip(todo, ex.map(run_py, todo)):
                if res["ok"]:
                    cache[job["key"]] = res["res"]
                else:
                    fails.append((job, res))
    CACHE_DIR.mkdir(exist_ok=True)
    live = {j["key"] for j in all_jobs}
    CACHE.write_text(json.dumps({k: v for k, v in cache.items() if k in live}, ensure_ascii=False), encoding="utf-8")
    for job, res in fails:
        print(f"\n✗ {job['file']}:{job['line']}  {job['meta'].get('title', '')}  — {res['why']}")
        if res["detail"].strip():
            print("   " + res["detail"].strip().replace("\n", "\n   ")[-1800:])
    return fails


def known_viz():
    names = set()
    for f in (ROOT / "assets" / "js").glob("*.js"):
        if f.name == "content.js":
            continue
        t = f.read_text(encoding="utf-8")
        names |= set(re.findall(r'\bsim\(\s*"([\w-]+)"', t))
        names |= set(re.findall(r"\bREG\.(\w+)\s*=", t))
    return names


def lint(modules, ids):
    problems = []
    viz = known_viz()
    tm = re.search(r"const TYPES = \{(.*?)\n  \};", (ROOT / "assets" / "js" / "viz-cv.js").read_text(), re.S)
    node_types = set(re.findall(r"(\w+): \[", tm.group(1))) if tm else set()
    arxiv_file = ROOT / "tools" / "arxiv_verified.json"
    arxiv = json.loads(arxiv_file.read_text()) if arxiv_file.exists() else {}
    for m in modules:
        if m["level"] not in LEVELS:
            problems.append(f"module {m['id']}: unknown level '{m['level']}'")
        for l in m["lessons"]:
            where = f"{m['id']}/{l['id']}"
            if l.get("level") and l["level"] not in LEVELS:
                problems.append(f"{where}: unknown level '{l['level']}' (use easy|intermediate|advanced|mixed)")
            for need in ("level", "time", "summary"):
                if not l.get(need):
                    problems.append(f"{where}: missing front matter '{need}'")
            body = l["body"]
            for target in re.findall(r"\]\(#/l/([\w-]+)\)", body):
                if target not in ids:
                    problems.append(f"{where}: link to unknown lesson '{target}'")
            for line, lang, meta, code in code_blocks(body):
                if lang in ("python", "py") and meta.get("run"):
                    heavy = re.search(r"^\s*(?:import|from)\s+(torch|torchvision|tensorflow|ultralytics|transformers|onnxruntime|open3d|mediapipe)\b", code, re.M)
                    if heavy:
                        problems.append(f"{where}:{line}: '{heavy.group(1)}' is not available in the browser: show this block as ```python local check``` instead")
                    bad = re.search(r"^\s*(?:import|from)\s+(threading|multiprocessing|subprocess|socket|requests|httpx|http\.client)\b|ThreadPoolExecutor|ProcessPoolExecutor|os\.system|time\.sleep\(\s*[1-9]", code, re.M)
                    if bad:
                        problems.append(f"{where}:{line}: '{bad.group(0).strip()}' does not work (or blocks) in the browser runner (Pyodide has no threads, processes or sockets; use asyncio)")
                if lang == "viz":
                    algo = meta.get("algo")
                    if algo not in viz:
                        problems.append(f"{where}:{line}: unknown viz algo '{algo}'")
                    if algo == "arch":
                        for t in re.findall(r"\[(\w+)\]\s*(?:@|$)", code, re.M):
                            if t not in node_types:
                                problems.append(f"{where}:{line}: unknown arch node type '{t}' (renders as a plain box)")
                if lang == "quiz":
                    qs = [q for q in re.split(r"(?m)^\? ", code) if q.strip()]
                    for q in qs:
                        plus = len(re.findall(r"(?m)^\+ ", q))
                        minus = len(re.findall(r"(?m)^- ", q))
                        if plus != 1 or minus < 1:
                            problems.append(f"{where}:{line}: quiz question needs exactly one '+' and at least one '-': {q.strip()[:50]!r}")
            for aid in sorted(set(re.findall(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})", body))):
                if aid not in arxiv:
                    problems.append(f"{where}: arXiv id {aid} is not in tools/arxiv_verified.json (run tools/verify_arxiv.py {aid})")
            for line, lang, meta, code in code_blocks(body):
                if lang in ("python", "py") and meta.get("local") and not meta.get("check"):
                    problems.append(f"{where}:{line}: a ```python local``` block has no 'check' flag (every PyTorch example must be executed by the build)")
            if body.count(":::") % 2:
                problems.append(f"{where}: unbalanced ::: boxes")
    return problems


def readability(modules, limit=34):
    """Print sentences that are too long. The course is written in short, simple sentences."""
    total = 0
    for m in modules:
        for l in m["lessons"]:
            prose = re.sub(r"```.*?```", " ", l["body"], flags=re.S)
            prose = re.sub(r"\$\$.*?\$\$|\$[^$\n]+\$|`[^`\n]+`|\[([^\]]+)\]\([^)]*\)|^:::.*$|^[#|>*+\-]+ ?", lambda x: x.group(1) or " ", prose, flags=re.S | re.M)
            for s in re.split(r"(?<=[.!?])\s+|\n{2,}", prose):
                n = len(s.split())
                if n > limit:
                    total += 1
                    print(f"  long ({n} words) {m['id']}/{l['id']}: {s.strip()[:110]}…")
    print(f"{total} sentence(s) over {limit} words")


def build(do_verify=True, only=None, force=False):
    modules, ids, jobs = [], set(), []
    for mdir in sorted(p for p in CONTENT.iterdir() if p.is_dir()):
        mod_file = mdir / "_module.md"
        if not mod_file.exists():
            continue
        meta, desc = parse_front_matter(mod_file.read_text(encoding="utf-8"))
        module = {
            "id": strip_number(mdir.name),
            "title": meta.get("title", mdir.name),
            "icon": meta.get("icon", "book"),
            "level": meta.get("level", "mixed"),
            "kind": meta.get("kind", "learn"),
            "description": meta.get("description", desc.strip()),
            "lessons": [],
        }
        for f in sorted(mdir.glob("*.md")):
            if f.name.startswith("_"):
                continue
            text = f.read_text(encoding="utf-8")
            lmeta, body = parse_front_matter(text)
            offset = text[: len(text) - len(body)].count("\n")
            lid = strip_number(f.stem)
            if lid in ids:
                raise SystemExit(f"Duplicate lesson id '{lid}' ({f})")
            ids.add(lid)
            lesson = {"id": lid, "title": lmeta.get("title", lid), "body": body}
            for k in ("level", "time", "summary", "tags", "icon", "cover"):
                if k in lmeta:
                    lesson[k] = lmeta[k]
            module["lessons"].append(lesson)
            jobs.extend(jobs_for(f, body, offset))
        modules.append(module)

    problems = lint(modules, ids)
    for p in problems:
        print("lint:", p)

    payload = json.dumps({"modules": modules, "built": time.strftime("%Y-%m-%d %H:%M")}, ensure_ascii=False)
    OUT.write_text(f"/* generated by build.py — edit the Markdown in content/ instead */\nwindow.COURSE = {payload};\n", encoding="utf-8")
    n = sum(len(m["lessons"]) for m in modules)
    print(f"built {OUT.relative_to(ROOT)}: {len(modules)} modules, {n} lessons, {len(jobs)} runnable examples, {len(payload) // 1024} KB")
    if do_verify:
        ver = subprocess.run([PYTHON, "-c", "import numpy;print(numpy.__version__)"], capture_output=True, text=True).stdout.strip()
        print(f"verifying with {PYTHON} (numpy {ver or 'MISSING'})")
        if not ver.startswith(("2.", "3.")):
            print("warning: the browser runs NumPy 2.x; outputs may differ with NumPy 1.x (see .venv note in build.py)")
    fails = verify(jobs, only=only, force=force) if do_verify else []
    if do_verify and not fails:
        print("all python examples verified ✓")
    return fails, problems


if __name__ == "__main__":
    only = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)
    fails, problems = build(do_verify="--no-verify" not in sys.argv, only=only, force="--force" in sys.argv)
    if "--read" in sys.argv:
        mods = json.loads(OUT.read_text(encoding="utf-8").split("window.COURSE = ", 1)[1].rsplit(";", 1)[0])["modules"]
        readability(mods)
    if "--watch" in sys.argv:
        stamp = None
        while True:
            s = max(p.stat().st_mtime for p in CONTENT.rglob("*.md"))
            if stamp and s != stamp:
                build(do_verify=False)
            stamp = s
            time.sleep(1)
    sys.exit(1 if fails or problems else 0)
