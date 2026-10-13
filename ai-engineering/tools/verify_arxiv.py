#!/usr/bin/env python3
"""Add arXiv ids to tools/arxiv_verified.json after checking them against the arXiv API.

    python3 tools/verify_arxiv.py 2401.04088 2305.14314 ...     # prints id, year, title
build.py warns about any arxiv.org/abs/<id> link in the lessons that is not in the JSON file,
so a typo'd id can never ship silently. Compare the printed title with the link text!
"""
import json, re, sys, time, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path

FILE = Path(__file__).with_name("arxiv_verified.json")
known = json.loads(FILE.read_text()) if FILE.exists() else {}
ids = [i for i in sys.argv[1:] if i not in known]
ns = {"a": "http://www.w3.org/2005/Atom"}
for k in range(0, len(ids), 40):
    chunk = ids[k:k + 40]
    url = "http://export.arxiv.org/api/query?max_results=%d&id_list=%s" % (len(chunk), ",".join(chunk))
    root = ET.fromstring(urllib.request.urlopen(url, timeout=40).read())
    for e in root.findall("a:entry", ns):
        eid = re.sub(r"v\d+$", "", e.find("a:id", ns).text.split("/abs/")[-1])
        known[eid] = [e.find("a:published", ns).text[:4], " ".join(e.find("a:title", ns).text.split())]
    time.sleep(3)
FILE.write_text(json.dumps(known, indent=1))
for i in sys.argv[1:]:
    print(i, known.get(i, "NOT FOUND"))
