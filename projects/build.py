#!/usr/bin/env python3
"""Build ProjectLab: bundle the lessons, bundle each project's source code, make the zip downloads.

    python3 build.py                  # bundle lessons + code, verify every runnable python example
    python3 build.py --no-verify      # bundle only (fast)
    python3 build.py --verify-code    # also run each project's own tests (pytest, tsc, vite build, vitest)
    python3 build.py --force          # ignore the caches

Layout:
    content/<NN-module>/_module.md     front matter: title, icon, level, description, kind
    content/<NN-module>/<NN-slug>.md   front matter: title, level, time, summary (+ tags)
    code/<slug>/{backend,frontend}/    the REAL, tested projects the lessons teach
    assets/js/content.js               generated: the lessons          assets/js/code.js    generated: the source files
    downloads/<slug>.zip               generated: one zip per project

Lessons quote real code instead of copying it. A fence like

    ```python src="pocket-chat/backend/app/context.py" region="trim"
    ```

is replaced at build time by the lines between `# region: trim` and `# endregion: trim` in that file
(several regions: region="a,b"; a line range: lines="10-25"; the whole file: no region). For a runnable
block the included code comes first and the fence body (a small driver) is appended after it, so the
reader runs the real module. Region marker lines never appear in the output, the bundle or the zips.

Verification: every ```python run``` block is executed with PL_PYTHON (default: this interpreter, which needs
pydantic installed, the browser runs Pydantic 2 too). `--verify-code` needs PL_PYTHON to be a venv with each
project's requirements installed, and PL_NODE_BIN to point at a Node >= 22.12 `bin` folder if the default node is older.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
CODE = ROOT / "code"
OUT = ROOT / "assets" / "js" / "content.js"
CODE_OUT = ROOT / "assets" / "js" / "code.js"
DOWNLOADS = ROOT / "downloads"
CACHE_DIR = ROOT / ".build-cache"
CACHE = CACHE_DIR / "py.json"
CODE_CACHE = CACHE_DIR / "code.json"
RUN_TIMEOUT = 90
PYTHON = os.environ.get("PL_PYTHON") or sys.executable
NODE_BIN = os.environ.get("PL_NODE_BIN", "")
LEVELS = {"easy", "intermediate", "advanced", "mixed"}

# files that never go into the source viewer or the zip
SKIP_DIRS = {"node_modules", "dist", ".venv", "__pycache__", ".pytest_cache", ".vite", ".build-cache", "coverage", ".git"}
SKIP_FILES = {"package-lock.json", ".env", ".DS_Store"}
SKIP_SUFFIX = (".pyc", ".db", ".sqlite", ".sqlite3", ".log", ".tsbuildinfo")
LANG_BY_EXT = {".py": "python", ".ts": "ts", ".tsx": "tsx", ".js": "js", ".jsx": "jsx", ".css": "css", ".json": "json",
               ".md": "md", ".html": "html", ".yml": "yaml", ".yaml": "yaml", ".sh": "bash", ".txt": "text",
               ".ini": "text", ".toml": "toml", ".example": "bash", ".sql": "sql", ".csv": "text", ".cfg": "text"}

REGION_RE = re.compile(r"^\s*(?:#|//|/\*|--)\s*(region|endregion)\b[:\s]*([\w-]*)\s*(?:\*/)?\s*$")


# ---------------------------------------------------------------------------- front matter, fences
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
    """[(line_no, lang, meta, code)] for fenced blocks."""
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


# ---------------------------------------------------------------------------- source files and regions
def read_source(rel: str) -> str:
    path = (CODE / rel).resolve()
    if CODE.resolve() not in path.parents or not path.is_file():
        raise FileNotFoundError(f"src not found: {rel}")
    return path.read_text(encoding="utf-8")


def strip_markers(text: str) -> str:
    return "\n".join(l for l in text.split("\n") if not REGION_RE.match(l))


def region_text(text: str, names: list[str], rel: str) -> str:
    """Lines between `# region: name` and `# endregion[: name]`, without any marker lines."""
    lines = text.split("\n")
    parts = []
    for name in names:
        start = None
        depth = 0
        picked = []
        for line in lines:
            m = REGION_RE.match(line)
            if start is None:
                if m and m.group(1) == "region" and m.group(2) == name:
                    start, depth = True, 0
                continue
            if m:
                if m.group(1) == "region":
                    depth += 1
                    continue
                if depth == 0 and (not m.group(2) or m.group(2) == name):
                    break
                depth -= 1
                continue
            picked.append(line)
        if start is None:
            raise KeyError(f"region '{name}' not found in {rel}")
        parts.append(textwrap.dedent("\n".join(picked)).strip("\n"))
    return "\n\n".join(parts)


def line_range(text: str, spec: str) -> str:
    a, _, b = spec.partition("-")
    lines = text.split("\n")
    return "\n".join(lines[int(a) - 1: int(b or a)])


RELATIVE_IMPORT = re.compile(r"^\s*(?:from\s+\.+[\w.]*\s+import\s+.*|import\s+.*\s+from\s+[\"']\.{1,2}/[^\"']*[\"'];?)\s*$")


PACKAGE_IMPORT = re.compile(r'^import\s+\{([^}]*)\}\s+from\s+"([^".][^"]*)";?[ \t]*$', re.M)


def merge_package_imports(code: str) -> str:
    """Files joined with `flat` may each import from the same package (react, say). One module cannot declare a name
    twice, so merge the single-line `import { a, b } from "pkg"` statements per package, at the top."""
    found: dict[str, list[str]] = {}
    for m in PACKAGE_IMPORT.finditer(code):
        names = found.setdefault(m.group(2), [])
        names.extend(n.strip() for n in m.group(1).split(",") if n.strip() and n.strip() not in names)
    if not found:
        return code
    body = PACKAGE_IMPORT.sub("", code)
    body = re.sub(r"\n{3,}", "\n\n", body).strip("\n")
    head = "\n".join(f'import {{ {", ".join(names)} }} from "{pkg}";' for pkg, names in found.items())
    return head + "\n\n" + body


def dir_data(spec: str, lang: str = "python") -> str:
    """`dir="slug/path"` hands a lesson's runnable block a folder of real files as `SAMPLE_FILES = {path: text}`, so code that
    analyses source files (a chunker, a search index) can run in the browser on the project's own sample repository."""
    base = (CODE / spec).resolve()
    if CODE.resolve() not in base.parents or not base.is_dir():
        raise FileNotFoundError(f"dir not found: {spec}")
    files = {p.relative_to(base).as_posix(): p.read_text(encoding="utf-8") for p in sorted(base.rglob("*"))
             if p.is_file() and not any(part in SKIP_DIRS for part in p.relative_to(base).parts) and not p.name.endswith(SKIP_SUFFIX)}
    if lang in ("js", "jsx", "ts", "tsx"):
        return "const SAMPLE_FILES: Record<string, string> = " + json.dumps(files, ensure_ascii=False) + ";" if lang in ("ts", "tsx") else "const SAMPLE_FILES = " + json.dumps(files, ensure_ascii=False) + ";"
    return "SAMPLE_FILES = " + repr(files)


def include_code(src: str, meta: dict) -> str:
    """The text for a `src=` fence. Several files may be joined with commas (in that order); `flat` drops the relative
    imports between them, so modules that import each other run as one script in the browser. A file can name its own
    regions: src="a.py#schema+data,b.py" takes only those regions of a.py and all of b.py."""
    paths = [p.strip() for p in src.split(",")]
    if len(paths) > 1 and ("region" in meta or "lines" in meta):
        raise ValueError(f"region/lines cannot be combined with several src files ({src}); name regions per file with a#x+y")
    parts = []
    for item in paths:
        rel, _, names = item.partition("#")
        text = read_source(rel)
        if names:
            code = region_text(text, names.split("+"), rel)
        elif "region" in meta:
            code = region_text(text, [r.strip() for r in str(meta["region"]).split(",")], rel)
        elif "lines" in meta:
            code = textwrap.dedent(line_range(strip_markers(text), str(meta["lines"])))
        else:
            code = strip_markers(text).strip("\n")
        if meta.get("flat"):
            code = "\n".join(l for l in code.split("\n") if not RELATIVE_IMPORT.match(l))
        parts.append(code.strip("\n"))
    joined = "\n\n".join(parts)
    return merge_package_imports(joined) if meta.get("flat") and len(parts) > 1 else joined


def expand_includes(body: str, where: str, problems: list[str]) -> str:
    """Replace every fence that has src="..." by the real file content (see the module docstring)."""
    lines = body.replace("\r\n", "\n").split("\n")
    out, i = [], 0
    while i < len(lines):
        m = FENCE_RE.match(lines[i])
        if not m:
            out.append(lines[i])
            i += 1
            continue
        fence, lang, info = m.group(1), m.group(2) or "text", m.group(3)
        j = i + 1
        inner = []
        while j < len(lines) and not (lines[j].startswith(fence) and re.match(r"^`{3,}\s*$", lines[j])):
            inner.append(lines[j])
            j += 1
        meta = parse_meta(info)
        if "src" not in meta:
            out.extend(lines[i: j + 1])
            i = j + 1
            continue
        rel = meta["src"]
        try:
            code = include_code(str(rel), meta)
        except (FileNotFoundError, KeyError, ValueError) as exc:
            problems.append(f"{where}:{i + 1}: {exc}")
            code = f"# missing: {rel}"
        if meta.get("dir"):
            code = dir_data(str(meta["dir"]), lang) + "\n\n" + code
        driver = "\n".join(inner).strip("\n")
        if driver:
            code = code + "\n\n" + driver
            if meta.get("flat"):
                code = merge_package_imports(code)
        # rebuild the info string without src/region/lines, with a default title
        rest = {k: v for k, v in meta.items() if k not in ("src", "region", "lines", "flat", "dir")}
        rest.setdefault("title", " + ".join((r.split("#")[0].split("/", 1)[1] if "/" in r else r.split("#")[0]) for r in str(rel).split(",")))
        rest["file"] = rel
        info2 = " ".join(f'{k}="{v}"' if (isinstance(v, str) and (" " in v or "·" in v)) else (k if v is True else f"{k}={v}") for k, v in rest.items())
        out.append(f"{fence}{lang} {info2}".rstrip())
        out.extend(code.split("\n"))
        out.append(fence)
        i = j + 1
    return "\n".join(out)


# ---------------------------------------------------------------------------- bundling the source code
def project_files(slug: str):
    base = CODE / slug
    for path in sorted(base.rglob("*")):
        rel = path.relative_to(base)
        if not path.is_file() or any(part in SKIP_DIRS for part in rel.parts):
            continue
        if path.name in SKIP_FILES or path.name.endswith(SKIP_SUFFIX):
            continue
        yield rel.as_posix(), path


def bundle_code():
    projects, zips = {}, []
    DOWNLOADS.mkdir(exist_ok=True)
    for pdir in sorted(p for p in CODE.iterdir() if p.is_dir()):
        slug = pdir.name
        files = []
        for rel, path in project_files(slug):
            raw = path.read_text(encoding="utf-8")
            text = strip_markers(raw) if path.suffix in (".py", ".ts", ".tsx", ".css", ".js") else raw
            lang = LANG_BY_EXT.get(path.suffix, "text")
            if path.name == "Dockerfile" or path.name == "Makefile":
                lang = "bash"
            if path.name == ".gitignore":
                lang = "text"
            files.append({"path": rel, "lang": lang, "text": text})
        projects[slug] = {"files": files}
        zpath = DOWNLOADS / f"{slug}.zip"
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
            for f in files:
                info = zipfile.ZipInfo(f"{slug}/{f['path']}", date_time=(2026, 10, 17, 0, 0, 0))
                info.external_attr = 0o644 << 16
                z.writestr(info, f["text"])
        zips.append((slug, len(files), zpath.stat().st_size // 1024))
    payload = json.dumps(projects, ensure_ascii=False)
    CODE_OUT.write_text(f"/* generated by build.py — edit the files in code/ instead */\nwindow.PROJECT_CODE = {payload};\n", encoding="utf-8")
    return zips, len(payload) // 1024


# ---------------------------------------------------------------------------- verifying python examples
def jobs_for(lesson_file: Path, body: str, offset: int):
    """Python blocks to execute locally: ```python run``` (also runs in the browser) and ```python local verify```
    (needs FastAPI or similar, so it only runs here). `shared` blocks are prefixed with the earlier shared ones.
    If an ```output block follows directly, the real stdout must match it."""
    prefix = ""
    blocks = code_blocks(body)
    for i, (line, lang, meta, code) in enumerate(blocks):
        if lang not in ("python", "py") or not (meta.get("run") or meta.get("verify")):
            continue
        full = code
        if meta.get("shared"):
            full = prefix + "\n" + code if prefix else code
            prefix = full
        if meta.get("skiplocal"):
            continue
        expect = blocks[i + 1][3] if i + 1 < len(blocks) and blocks[i + 1][1] == "output" else None
        yield {"file": str(lesson_file.relative_to(ROOT)), "line": line + offset, "meta": meta, "code": full, "expect": expect,
               "key": fnv(full + "\u0000" + ("x" if meta.get("expect-error") else "") + "\u0000" + (expect or ""))}


def run_py(job):
    expect_err = bool(job["meta"].get("expect-error"))
    with tempfile.TemporaryDirectory(prefix="pl-py-") as d:
        src = os.path.join(d, "main.py")
        code = job["code"]
        if job["meta"].get("cwd"):                    # run against a project's real package: `cwd="pocket-chat/backend"`
            root = (CODE / job["meta"]["cwd"]).resolve()
            code = f"import sys\nsys.path.insert(0, {str(root)!r})\n" + code
        Path(src).write_text(code + "\n", encoding="utf-8")
        env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
        env.update(PYTHONHASHSEED="0", PYTHONIOENCODING="utf-8", PYTHONNOUSERSITE="1", OMP_NUM_THREADS="1")
        try:
            rp = subprocess.run([PYTHON, "-I", src], capture_output=True, text=True, timeout=RUN_TIMEOUT, cwd=d, env=env, input="")
        except subprocess.TimeoutExpired:
            return {"ok": False, "why": f"timed out after {RUN_TIMEOUT}s", "detail": ""}
        err = rp.stderr.replace(src, "main.py")
        if expect_err:
            if rp.returncode == 0:
                return {"ok": False, "why": "expected an error but it exited 0", "detail": rp.stdout[-1500:]}
            return {"ok": True, "res": {"o": rp.stdout, "e": err, "x": rp.returncode}}
        if rp.returncode != 0:
            return {"ok": False, "why": f"exit code {rp.returncode}", "detail": rp.stdout[-1500:] + "\n--- stderr ---\n" + err[-3000:]}
        warn = [l for l in err.splitlines() if "Warning" in l]
        if warn:
            return {"ok": False, "why": "printed a warning", "detail": "\n".join(warn[:5])}
        if job.get("expect") is not None and rp.stdout.strip() != job["expect"].strip():
            return {"ok": False, "why": "the ```output block does not match what the code prints",
                    "detail": "expected:\n" + job["expect"].strip() + "\n--- actual ---\n" + rp.stdout.strip()}
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
        with ThreadPoolExecutor(min(8, os.cpu_count() or 4)) as ex:
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


# ---------------------------------------------------------------------------- verifying the projects themselves
def tree_hash(slug: str) -> str:
    h = hashlib.sha1()
    for rel, path in project_files(slug):
        h.update(rel.encode())
        h.update(path.read_bytes())
    return h.hexdigest()


def sh(cmd, cwd, env=None, timeout=900):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)


def verify_code(force=False):
    """Run each project's backend tests and frontend type-check, build and unit tests."""
    cache = json.loads(CODE_CACHE.read_text()) if CODE_CACHE.exists() and not force else {}
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    env["PYTHONNOUSERSITE"] = "1"
    if NODE_BIN:
        env["PATH"] = NODE_BIN + os.pathsep + env["PATH"]
    failed = []
    for pdir in sorted(p for p in CODE.iterdir() if p.is_dir()):
        slug = pdir.name
        key = tree_hash(slug)
        if cache.get(slug) == key:
            print(f"  ✓ {slug}: unchanged since the last passing run")
            continue
        steps = []
        if (pdir / "backend" / "pytest.ini").exists():
            steps.append(("pytest", [PYTHON, "-m", "pytest", "-q", "-x"], pdir / "backend"))
        if (pdir / "frontend" / "package.json").exists():
            fe = pdir / "frontend"
            if not (fe / "node_modules").exists():
                steps.append(("npm install", ["npm", "install", "--no-audit", "--no-fund"], fe))
            steps.append(("tsc + vite build", ["npm", "run", "build"], fe))
            if '"test"' in (fe / "package.json").read_text():
                steps.append(("vitest", ["npm", "test"], fe))
        ok = True
        for label, cmd, cwd in steps:
            rp = sh(cmd, cwd, env)
            tail = (rp.stdout + rp.stderr).strip().splitlines()[-1:] or [""]
            if rp.returncode:
                ok = False
                failed.append(f"{slug}: {label}")
                print(f"  ✗ {slug}: {label} failed\n" + "\n".join("    " + l for l in (rp.stdout + rp.stderr).strip().splitlines()[-25:]))
                break
            print(f"  ✓ {slug}: {label} — {tail[0][:90]}")
        if ok:
            cache[slug] = key
    CACHE_DIR.mkdir(exist_ok=True)
    CODE_CACHE.write_text(json.dumps(cache))
    return failed


# ---------------------------------------------------------------------------- lint
def lint(modules, ids):
    problems = []
    slugs = {p.name for p in CODE.iterdir() if p.is_dir()}
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
            for target in re.findall(r"\]\(#/code/([\w-]+)", body):
                if target not in slugs:
                    problems.append(f"{where}: link to unknown project source '{target}'")
            for line, lang, meta, code in code_blocks(body):
                if lang in ("python", "py") and meta.get("run"):
                    bad = re.search(r"^(?:import|from)\s+(multiprocessing|subprocess|socket|requests|httpx|http\.client|fastapi|uvicorn|anthropic|sqlalchemy)\b|ThreadPoolExecutor|ProcessPoolExecutor|os\.system|time\.sleep\(\s*[1-9]", code, re.M)
                    if bad:
                        problems.append(f"{where}:{line}: '{bad.group(0).strip()}' does not work in the browser runner (Pyodide has no threads, sockets or these packages; show it as a plain or `local` block)")
                    if re.search(r"^\s*from\s+(app|\.)[\w.]*\s+import", code, re.M):
                        problems.append(f"{where}:{line}: a runnable block imports from the project's own package; include the module with src= instead")
                if lang in ("jsx", "tsx") and meta.get("run") and re.search(r"^\s*import\s+(?!type\b).*from\s+['\"]\.", code, re.M):
                    problems.append(f"{where}:{line}: a runnable jsx block imports a relative file; it must be self-contained")
                if lang == "quiz":
                    for q in [q for q in re.split(r"(?m)^\? ", code) if q.strip()]:
                        plus = len(re.findall(r"(?m)^\+ ", q))
                        minus = len(re.findall(r"(?m)^- ", q))
                        if plus != 1 or minus < 1:
                            problems.append(f"{where}:{line}: quiz question needs exactly one '+' and at least one '-': {q.strip()[:50]!r}")
            if body.count(":::") % 2:
                problems.append(f"{where}: unbalanced ::: boxes")
            prose = re.sub(r"```.*?```|`[^`]*`", "", body, flags=re.S)       # identifiers inside code keep their spelling
            bad = sorted(set(re.findall(r"\b(colors?|centers?|behaviors?|normalize[ds]?|optimize[ds]?|analyze[ds]?)\b", prose)))
            if bad:
                problems.append(f"{where}: American spelling in prose ({', '.join(bad)}); use colour/centre/behaviour/normalise/optimise/analyse")
    return problems


# ---------------------------------------------------------------------------- build
def build(do_verify=True, only=None, force=False):
    modules, ids, jobs, include_problems = [], set(), [], []
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
        if "project" in meta:
            module["project"] = meta["project"]
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
            if re.search(r'^`{3,}\w+[^\n]*\bsrc="[^"]*"[^\n]*\blines="', body, re.M):
                include_problems.append(f"{f.relative_to(ROOT)}: an include uses lines=...; line numbers break when the file changes, add a region instead")
            body = expand_includes(body, str(f.relative_to(ROOT)), include_problems)
            lesson = {"id": lid, "title": lmeta.get("title", lid), "body": body}
            for k in ("level", "time", "summary", "tags", "icon", "cover"):
                if k in lmeta:
                    lesson[k] = lmeta[k]
            module["lessons"].append(lesson)
            jobs.extend(jobs_for(f, body, offset))
        modules.append(module)

    problems = include_problems + lint(modules, ids)
    for p in problems:
        print("lint:", p)

    payload = json.dumps({"modules": modules, "built": time.strftime("%Y-%m-%d %H:%M")}, ensure_ascii=False)
    OUT.write_text(f"/* generated by build.py — edit the Markdown in content/ instead */\nwindow.COURSE = {payload};\n", encoding="utf-8")
    n = sum(len(m["lessons"]) for m in modules)
    print(f"built {OUT.relative_to(ROOT)}: {len(modules)} modules, {n} lessons, {len(jobs)} runnable python examples, {len(payload) // 1024} KB")

    zips, kb = bundle_code()
    print(f"built {CODE_OUT.relative_to(ROOT)}: {len(zips)} projects, {kb} KB; zips: " + ", ".join(f"{s} ({n} files, {k} KB)" for s, n, k in zips))

    fails = verify(jobs, only=only, force=force) if do_verify else []
    if do_verify and not fails:
        print("all python examples verified ✓")
    return fails, problems


if __name__ == "__main__":
    only = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)
    fails, problems = build(do_verify="--no-verify" not in sys.argv, only=only, force="--force" in sys.argv)
    code_failed = []
    if "--verify-code" in sys.argv:
        print("verifying the projects' own tests…")
        code_failed = verify_code(force="--force" in sys.argv)
        print("all projects verified ✓" if not code_failed else f"project checks failed: {code_failed}")
    sys.exit(1 if fails or problems or code_failed else 0)
