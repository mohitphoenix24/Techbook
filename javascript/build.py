#!/usr/bin/env python3
"""Bundle the Markdown lessons in content/ into assets/js/content.js
and run every JavaScript example with real Node.js (the output you see in the lessons is what Node printed).

    python3 build.py              # rebuild (runs only new/changed examples)
    python3 build.py --no-verify  # bundle only, skip running
    python3 build.py --force      # ignore the cache and re-run everything
    python3 build.py --watch      # rebuild whenever a lesson changes
    python3 build.py --only=slug  # verify just the lesson files whose path contains "slug"

Layout:
    content/<NN-module>/_module.md     front matter: title, icon, level, description, kind
    content/<NN-module>/<NN-slug>.md   front matter: title, level, time, summary (+ tags, icon, cover)
The lesson id is the file name without its number prefix, so keep slugs unique.

JavaScript examples (```js run ...), all executed by Node 22:
    ```js run                  a strict async function body (identical in the browser): top-level await, require(), `this` undefined;
                               single-line `import x from "node:y"` lines are hoisted out of the wrapper
    ```js run sloppy           sloppy mode (non-module): for `this`, hoisting and implicit-global demos
    ```js run cjs              a raw CommonJS file: module.exports, __dirname (Node only)
    ```js run esm              a raw ES module file: top-level import/export (Node only)
    ```js run node             needs real Node (fs, streams, worker_threads, nextTick order): the recorded output is shown
    ```js run expect-error     must end with an uncaught error (shown on purpose)
    ```js run nondet           output differs on every run (timings, random): recorded, not checked for stability
    ```html run                runs in an iframe in the browser; not executed here
Each example is run twice and the two outputs must match (unless `nondet`).
Results are cached in .build-cache/js.json, keyed by a hash of the code.
"""
import concurrent.futures as cf
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
OUT = ROOT / "assets" / "js" / "content.js"
CACHE_DIR = ROOT / ".build-cache"
CACHE = CACHE_DIR / "js.json"
HOOK = ROOT / "tools" / "node_hook.cjs"
NODE = os.environ.get("NODE", "node")
RUN_TIMEOUT = 30


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
    """FNV-1a over UTF-16 code units — identical to fnv() in runner-js.js."""
    h = 0x811C9DC5
    b = s.encode("utf-16-le", "surrogatepass")
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}-{len(s.encode('utf-16-le', 'surrogatepass')) // 2}"


META_RE = re.compile(r'([\w-]+)(?:=(?:"([^"]*)"|(\S+)))?')
FENCE_RE = re.compile(r"^(`{3,})([\w+-]*)\s*(.*)$")


def parse_meta(s: str):
    return {m.group(1): (m.group(2) if m.group(2) is not None else m.group(3) if m.group(3) is not None else True)
            for m in META_RE.finditer(s or "")}


def code_blocks(body: str):
    """Return [line_no, lang, meta, code] for fenced blocks, mirroring parseBlocks() in app.js."""
    lines = body.replace("\r\n", "\n").split("\n")
    blocks = []
    i = 0
    while i < len(lines):
        m = FENCE_RE.match(lines[i])
        if m:
            fence, start = m.group(1), i
            code = []
            i += 1
            while i < len(lines) and not (lines[i].startswith(fence) and re.match(r"^`{3,}\s*$", lines[i])):
                code.append(lines[i])
                i += 1
            blocks.append([start + 1, (m.group(2) or "text").lower(), parse_meta(m.group(3)), "\n".join(code)])
        i += 1
    return blocks


def jobs_for(lesson_file: Path, body: str, offset: int):
    for line, lang, meta, code in code_blocks(body):
        if lang in ("js", "javascript") and meta.get("run"):
            yield {"file": str(lesson_file.relative_to(ROOT)), "line": line + offset, "meta": meta,
                   "code": code, "key": fnv(code)}


ERR_RE = re.compile(r"^((?:[A-Z]\w*)?(?:Error|Exception))(?: \[[\w_]+\])?: (.*)$", re.M)


def parse_error(text: str):
    m = ERR_RE.search(text)
    if m:
        return {"name": m.group(1), "message": m.group(2).strip()}
    m = re.search(r"^Uncaught (.+)$", text, re.M)
    if m:
        return {"name": "Error", "message": m.group(1)}
    return {"name": "Error", "message": (text.strip().splitlines() or ["error"])[-1]}


def run_once(job, workdir: str, tag: str):
    meta = job["meta"]
    cjs = bool(meta.get("cjs"))
    sloppy = bool(meta.get("sloppy"))
    if cjs:
        name, text = f"main{tag}.cjs", job["code"] + "\n"
    elif meta.get("esm"):                                   # a raw ES module file (import/export at top level)
        name = f"main{tag}.mjs"
        text = job["code"] + "\n"                           # exactly as written: no require, no __dirname
    elif sloppy:
        name = f"main{tag}.cjs"
        text = ("(async function () {\n" + job["code"] +
                "\n}).call(undefined).catch((e) => setTimeout(() => { throw e; }));\n")
    else:                                                   # default: strict async function body, like the browser runner
        name = f"main{tag}.mjs"
        imports, rest = [], []
        for ln in job["code"].split("\n"):
            (imports if re.match(r"^import\s.*from\s*['\"][^'\"]+['\"]\s*;?\s*$", ln) else rest).append(ln)
        text = ('import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);\n'
                + "\n".join(imports) + '\nawait (async function () { "use strict";\n' + "\n".join(rest)
                + "\n}).call(undefined);\n")
    path = os.path.join(workdir, name)
    Path(path).write_text(text, encoding="utf-8")
    logf = os.path.join(workdir, f"log{tag}.json")
    env = dict(os.environ, JSLAB_LOG=logf, NO_COLOR="1", FORCE_COLOR="0", NODE_DISABLE_COLORS="1",
               NODE_NO_WARNINGS="1")
    env.pop("NODE_OPTIONS", None)
    try:
        rp = subprocess.run([NODE, "--expose-gc", "-r", str(HOOK), path], cwd=workdir, env=env,
                            capture_output=True, text=True, timeout=RUN_TIMEOUT)
    except subprocess.TimeoutExpired:
        return {"ok": False, "why": f"timed out after {RUN_TIMEOUT}s"}
    chunks = []
    if os.path.exists(logf):
        for k, s in json.loads(Path(logf).read_text(encoding="utf-8")):
            s = s.replace(workdir, "")
            s = s.encode("utf-16", "surrogatepass").decode("utf-16", "replace")        # a lone surrogate prints as U+FFFD, like a terminal
            if chunks and chunks[-1][0] == k:
                chunks[-1][1] += s
            else:
                chunks.append([k, s])
    raw_err = rp.stderr.replace(workdir, "")
    return {"ok": True, "code": rp.returncode, "chunks": chunks, "stderr": raw_err}


MODE_FLAGS = ("sloppy", "cjs", "esm", "node", "expect-error", "nondet", "timing")


def mode_of(job):
    """The flags that change how a block is executed: a cached result is valid only for the same mode."""
    return ",".join(sorted(k for k in job["meta"] if k in MODE_FLAGS))


def run_job(job):
    meta = job["meta"]
    expect_err = bool(meta.get("expect-error"))
    nondet = bool(meta.get("nondet") or meta.get("timing"))
    with tempfile.TemporaryDirectory(prefix="jslab-") as d:
        r1 = run_once(job, d, "a")
        if not r1["ok"]:
            return {"ok": False, "why": r1["why"], "detail": ""}
        failed = r1["code"] != 0
        if expect_err and not failed:
            return {"ok": False, "why": "expected an uncaught error but the program exited 0", "detail": ""}
        if not expect_err and failed:
            return {"ok": False, "why": f"exit code {r1['code']}",
                    "detail": "".join(s for _, s in r1["chunks"])[-1200:] + "\n--- stderr ---\n" + r1["stderr"][-2000:]}
        if not nondet:
            r2 = run_once(job, d, "b")
            if r2["ok"] and (r2["chunks"] != r1["chunks"] or r2["code"] != r1["code"]):
                a = "".join(s for _, s in r1["chunks"])
                b = "".join(s for _, s in r2["chunks"])
                return {"ok": False, "why": "output is not stable between two runs (add `nondet` or make it deterministic)",
                        "detail": "run 1:\n" + a[-700:] + "\nrun 2:\n" + b[-700:]}
        res = {"c": r1["chunks"], "x": r1["code"], "m": mode_of(job)}
        if failed:
            res["err"] = parse_error(r1["stderr"])
        return {"ok": True, "res": res}


def load_cache():
    try:
        return json.loads(CACHE.read_text()) if CACHE.exists() else {}
    except (ValueError, OSError):
        return {}


def verify(all_jobs, only=None, force=False):
    CACHE_DIR.mkdir(exist_ok=True)
    cache = {} if force else load_cache()
    seen, todo = set(), []
    for j in all_jobs:
        if (j["key"] in cache and cache[j["key"]].get("m") == mode_of(j)) or j["key"] in seen or (only and only not in j["file"]):
            continue
        seen.add(j["key"])
        todo.append(j)
    failures = []
    if todo:
        if not shutil.which(NODE):
            print(f"! {NODE} not found — skipping verification")
            return cache, []
        print(f"running {len(todo)} new/changed JavaScript examples with node {subprocess.run([NODE, '-v'], capture_output=True, text=True).stdout.strip()} …", flush=True)
        workers = max(2, (os.cpu_count() or 4) - 2)
        with cf.ThreadPoolExecutor(workers) as ex:
            futs = {ex.submit(run_job, j): j for j in todo}
            for n, f in enumerate(cf.as_completed(futs), 1):
                j = futs[f]
                r = f.result()
                if r["ok"]:
                    cache[j["key"]] = r["res"]
                else:
                    failures.append((j, r))
                if n % 50 == 0:
                    print(f"  … {n}/{len(todo)}", flush=True)
        CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    for j, r in sorted(failures, key=lambda x: (x[0]["file"], x[0]["line"])):
        print(f"\n✕ {j['file']}:{j['line']} — {r['why']}\n" + "\n".join("   " + l for l in (r.get("detail") or "").splitlines()[:30]))
    return cache, failures


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
            raw = f.read_text(encoding="utf-8")
            lmeta, body = parse_front_matter(raw)
            lid = strip_number(f.stem)
            if lid in ids:
                raise SystemExit(f"Duplicate lesson id '{lid}' ({f})")
            ids.add(lid)
            lesson = {"id": lid, "title": lmeta.get("title", lid), "body": body}
            for k in ("level", "time", "summary", "tags", "icon", "cover"):
                if k in lmeta:
                    lesson[k] = lmeta[k]
            module["lessons"].append(lesson)
            offset = raw[: len(raw) - len(body)].count("\n")
            jobs.extend(jobs_for(f, body, offset))
        modules.append(module)

    failures = []
    cache = load_cache()
    if do_verify:
        cache, failures = verify(jobs, only, force)
    keys = {j["key"] for j in jobs}
    outputs = {k: v for k, v in cache.items() if k in keys}

    payload = json.dumps({"modules": modules, "outputs": outputs, "built": time.strftime("%Y-%m-%d %H:%M")}, ensure_ascii=False)
    OUT.write_text(f"/* generated by build.py — edit the Markdown in content/ instead */\nwindow.COURSE = {payload};\n", encoding="utf-8")
    n = sum(len(m["lessons"]) for m in modules)
    missing = len(keys - set(outputs))
    print(f"built {OUT.relative_to(ROOT)}: {len(modules)} modules, {n} lessons, {len(keys)} JS examples "
          f"({len(outputs)} verified{f', {missing} unverified' if missing else ''}), {len(payload) // 1024} KB")
    if failures:
        print(f"\n{len(failures)} example(s) FAILED — fix them before publishing.")
    return failures


if __name__ == "__main__":
    only = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)
    fails = build(do_verify="--no-verify" not in sys.argv, only=only, force="--force" in sys.argv)
    if "--watch" in sys.argv:
        stamp = None
        while True:
            s = max(p.stat().st_mtime for p in CONTENT.rglob("*.md"))
            if stamp and s != stamp:
                build(only=only)
            stamp = s
            time.sleep(1)
    sys.exit(1 if fails else 0)
