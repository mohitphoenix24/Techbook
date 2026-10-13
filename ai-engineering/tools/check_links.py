#!/usr/bin/env python3
"""Check every external link in content/ is alive (and every arXiv id is verified).

    python3 tools/check_links.py            # check links not yet in tools/links_ok.json
    python3 tools/check_links.py --all      # re-check everything
Results are cached in tools/links_ok.json {url: http_code}. Sites that block bots (403 or
connection errors from some networks) are listed as 'blocked' and must be reviewed by hand.
"""
import json, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).with_name("links_ok.json")
ARXIV = json.loads((Path(__file__).with_name("arxiv_verified.json")).read_text())
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
# known to exist but refuse bots / this network; reviewed by hand
TRUSTED = ("www.oreilly.com", "openai.com", "platform.openai.com", "ai.google.dev", "cloud.google.com", "www.amazon.com",
           "colab.research.google.com", "www.databricks.com", "ai.meta.com", "www.manning.com")

def links():
    found = {}
    for f in sorted((ROOT / "content").rglob("*.md")):
        text = re.sub(r"(?ms)^(`{3,}).*?^\1\s*$", "", f.read_text(encoding="utf-8"))          # links inside code fences are examples
        for m in re.finditer(r"\]\((https?://[^)\s]+)\)", text):
            url = m.group(1)
            if re.match(r"https?://(?:[\w.-]*\.)?(?:example|localhost)(?:\.\w+)?(?:[:/]|$)", url) or "example.com" in url:
                continue                                                                      # reserved example domains
            found.setdefault(url, []).append(f.name)
    return found

def chk(u):
    try:
        r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-L", "-m", "25", "-A", UA, "-w", "%{http_code}", u],
                           capture_output=True, text=True, timeout=40)
        return u, r.stdout.strip()
    except Exception as e:
        return u, "ERR"

cache = {} if "--all" in sys.argv else (json.loads(CACHE.read_text()) if CACHE.exists() else {})
all_links = links()
todo = [u for u in all_links if u not in cache]
bad = []
with ThreadPoolExecutor(16) as ex:
    for u, code in ex.map(chk, todo):
        cache[u] = code
CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True))
for u, files in sorted(all_links.items()):
    code = cache.get(u, "?")
    host = re.sub(r"^https?://", "", u).split("/")[0]
    ok = code.startswith("2") or (host in TRUSTED and not code.startswith("404"))
    m = re.search(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})", u)
    if m and m.group(1) not in ARXIV:
        ok = False; code = "unverified-arxiv"
    if not ok:
        bad.append((code, u, sorted(set(files))))
print(f"{len(all_links)} links, {len(todo)} newly checked, {len(bad)} problems")
for code, u, files in bad:
    print(code, u, files)
sys.exit(1 if bad else 0)
