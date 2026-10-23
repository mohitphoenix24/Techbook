#!/usr/bin/env python3
"""Bundle the Markdown lessons in content/ into assets/js/content.js
and compile + run every C++ example with g++ (AddressSanitizer + UBSan).

    python3 build.py              # rebuild (compiles only new/changed examples)
    python3 build.py --no-verify  # bundle only, skip compiling
    python3 build.py --watch      # rebuild whenever a lesson changes
    python3 build.py --only=slug  # verify just the lesson files whose path contains "slug"

Layout:
    content/<NN-module>/_module.md     front matter: title, icon, level, description, kind
    content/<NN-module>/<NN-slug>.md   front matter: title, level, time, summary (+ tags, icon, cover)
The lesson id is the file name without its number prefix, so keep slugs unique.

C++ examples
    ```cpp run                 compiled with g++ -std=c++20 + AddressSanitizer/UBSan; must exit 0
    ```cpp run timing          output depends on the machine (benchmarks): compiled -O2, no sanitizers
    ```cpp run expect-error    must FAIL to compile (shows a compiler error on purpose)
    ```cpp run runtime-error   must crash / exit non-zero (shows a runtime error on purpose)
    ```stdin                   (directly after a run block) input fed to the program
Results are cached in .build-cache/cpp.json, keyed by a hash of code + stdin.

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
CACHE = CACHE_DIR / "cpp.json"
CXX = os.environ.get("CXX", "g++")
STD = "-std=c++20"
SAN = ["-O1", "-g", "-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer"]
WARN = ["-Wall", "-Wextra", "-Wno-unused-parameter", "-Wno-unused-variable", "-Wno-unused-but-set-variable"]
RUN_TIMEOUT = 20


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
    """FNV-1a over UTF-16 code units — identical to fnv() in runner-cpp.js."""
    h = 0x811C9DC5
    b = s.encode("utf-16-le")
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}-{len(s)}"


META_RE = re.compile(r'([\w-]+)(?:=(?:"([^"]*)"|(\S+)))?')
FENCE_RE = re.compile(r"^(`{3,})([\w+-]*)\s*(.*)$")


def parse_meta(s: str):
    return {m.group(1): (m.group(2) if m.group(2) is not None else m.group(3) if m.group(3) is not None else True)
            for m in META_RE.finditer(s or "")}


def code_blocks(body: str):
    """Return [line_no, lang, meta, code, stdin] for fenced blocks, mirroring parseBlocks() in app.js."""
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
            blocks.append([start + 1, (m.group(2) or "text").lower(), parse_meta(m.group(3)), "\n".join(code), ""])
        i += 1
    out = []
    for b in blocks:                      # a ```stdin block right after a code block is its input
        if b[1] == "stdin" and out:
            out[-1][4] = b[3]
            continue
        out.append(b)
    return out


def jobs_for(lesson_file: Path, body: str, offset: int):
    for line, lang, meta, code, stdin in code_blocks(body):
        if lang in ("cpp", "c++") and meta.get("run"):
            yield {"file": str(lesson_file.relative_to(ROOT)), "line": line + offset, "meta": meta,
                   "lang": "cpp",
                   "code": code, "stdin": stdin, "key": fnv(code + "\u0000" + stdin)}


def clean_compiler_msg(s: str, src: str) -> str:
    s = s.replace(src, "main.cpp")
    s = re.sub(r"\x1b\[[0-9;]*[mK]", "", s)
    return s.strip()


def compile_and_run(job):
    meta = job["meta"]
    mode = ("error" if meta.get("expect-error") else "crash" if meta.get("runtime-error")
            else "timing" if meta.get("timing") else "normal")
    with tempfile.TemporaryDirectory(prefix="sd-cpp-") as d:
        src = os.path.join(d, "main.cpp")
        exe = os.path.join(d, "main")
        Path(src).write_text(job["code"] + "\n", encoding="utf-8")
        flags = [STD, *WARN] + (["-O2"] if mode in ("timing", "crash", "error") else SAN)
        t0 = time.time()
        cp = subprocess.run([CXX, *flags, src, "-o", exe, "-pthread"], capture_output=True, text=True)
        cmsg = clean_compiler_msg(cp.stderr, src)
        if cp.returncode != 0:
            ok = mode == "error"
            return {"ok": ok, "why": None if ok else "compile error", "detail": cmsg,
                    "res": {"c": cmsg[:4000], "x": None}}
        if mode == "error":
            return {"ok": False, "why": "expected a compile error but it compiled", "detail": ""}
        env = dict(os.environ, ASAN_OPTIONS="detect_leaks=0", UBSAN_OPTIONS="print_stacktrace=1")
        try:
            rp = subprocess.run([exe], input=job["stdin"], capture_output=True, text=True, timeout=RUN_TIMEOUT, env=env)
        except subprocess.TimeoutExpired:
            return {"ok": False, "why": f"timed out after {RUN_TIMEOUT}s", "detail": ""}
        code = rp.returncode
        stdout, stderr = rp.stdout, rp.stderr
        if mode == "crash":
            ok = code != 0
            sig = -code if code < 0 else None
            note = {11: "Program terminated with signal SIGSEGV (11)", 6: "Program terminated with signal SIGABRT (6)",
                    8: "Program terminated with signal SIGFPE (8)"}.get(sig, f"Program exited with code {code}")
            return {"ok": ok, "why": None if ok else "expected a runtime error but it exited 0", "detail": "",
                    "warn": cmsg, "res": {"o": stdout, "e": (stderr.rstrip() + "\n" + note).strip(),
                                          "x": code if code >= 0 else 128 + sig}}
        if code != 0 or "runtime error:" in stderr or "AddressSanitizer" in stderr:
            return {"ok": False, "why": f"exit code {code}",
                    "detail": stdout[-1500:] + "\n--- stderr ---\n" + stderr[-3000:]}
        return {"ok": True, "warn": cmsg, "res": {"o": stdout, "e": stderr, "x": 0, **({"t": 1} if mode == "timing" else {})}}


def verify(all_jobs, only=None):
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE
    cache = json.loads(cache_file.read_text()) if cache_file.exists() else {}
    seen, todo = set(), []
    for j in all_jobs:
        if j["key"] in cache or j["key"] in seen or (only and only not in j["file"]):
            continue
        seen.add(j["key"])
        todo.append(j)
    failures = []
    if todo:
        tool = CXX
        if not shutil.which(tool):
            print(f"! {tool} not found — skipping verification")
            return cache, []
        print(f"compiling {len(todo)} new/changed C++ examples with {tool} …", flush=True)
        workers = max(2, (os.cpu_count() or 4) - 2)
        with cf.ThreadPoolExecutor(workers) as ex:
            futs = {ex.submit(compile_and_run, j): j for j in todo}
            for n, f in enumerate(cf.as_completed(futs), 1):
                j = futs[f]
                r = f.result()
                if r.get("warn") and "warning" in r["warn"]:
                    print(f"  ⚠ warning in {j['file']}:{j['line']}\n" + "\n".join("     " + l for l in r["warn"].splitlines()[:8]))
                if r["ok"]:
                    cache[j["key"]] = r["res"]
                else:
                    failures.append((j, r))
                if n % 25 == 0:
                    print(f"  … {n}/{len(todo)}", flush=True)
        cache_file.write_text(json.dumps(cache, ensure_ascii=False))
    for j, r in sorted(failures, key=lambda x: (x[0]["file"], x[0]["line"])):
        print(f"\n✕ {j['file']}:{j['line']} — {r['why']}\n" + "\n".join("   " + l for l in (r.get("detail") or "").splitlines()[:30]))
    return cache, failures


def build(do_verify=True, only=None):
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
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    if do_verify:
        cache, failures = verify(jobs, only)
    keys = {j["key"] for j in jobs}
    outputs = {k: v for k, v in cache.items() if k in keys}

    payload = json.dumps({"modules": modules, "outputs": outputs, "built": time.strftime("%Y-%m-%d %H:%M")}, ensure_ascii=False)
    OUT.write_text(f"/* generated by build.py — edit the Markdown in content/ instead */\nwindow.COURSE = {payload};\n", encoding="utf-8")
    n = sum(len(m["lessons"]) for m in modules)
    missing = len(keys - set(outputs))
    print(f"built {OUT.relative_to(ROOT)}: {len(modules)} modules, {n} lessons, {len(keys)} C++ examples "
          f"({len(outputs)} verified{f', {missing} unverified' if missing else ''}), {len(payload) // 1024} KB")
    if failures:
        print(f"\n{len(failures)} example(s) FAILED — fix them before publishing.")
    return failures


if __name__ == "__main__":
    only = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)
    fails = build(do_verify="--no-verify" not in sys.argv, only=only)
    if "--watch" in sys.argv:
        stamp = None
        while True:
            s = max(p.stat().st_mtime for p in CONTENT.rglob("*.md"))
            if stamp and s != stamp:
                build(only=only)
            stamp = s
            time.sleep(1)
    sys.exit(1 if fails else 0)
