#!/usr/bin/env python3
"""Rewrite lesson prose without touching code.

    python3 tools/skel.py extract <lesson-path-substring> [--out DIR]   # writes DIR/<name>.skel.md and DIR/<name>.blocks.json, prints the skeleton
    python3 tools/skel.py apply   <lesson-path-substring> [--out DIR]   # reads DIR/<name>.new.md, restores the blocks, writes the lesson

Fenced blocks (cpp, viz, text, ...) except ```quiz are replaced by @@B1@@, @@B2@@ ... placeholders.
`apply` refuses to write unless every placeholder appears exactly once, in the same order.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FENCE = re.compile(r"^(```+)([^\n]*)\n(.*?)^\1[ \t]*$", re.S | re.M)


def find(sub):
    hits = [p for p in sorted((ROOT / "content").rglob("*.md")) if sub in str(p) and p.name != "_module.md"]
    if len(hits) != 1:
        sys.exit(f"{sub!r} matches {len(hits)} files: {[str(h.relative_to(ROOT)) for h in hits]}")
    return hits[0]


def split(text):
    blocks = []
    def rep(m):
        info = m.group(2).strip()
        if info.startswith("quiz"):
            return m.group(0)
        blocks.append(m.group(0))
        return f"@@B{len(blocks)}@@"
    return FENCE.sub(rep, text), blocks


def main(argv):
    mode, sub = argv[0], argv[1]
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else Path("/tmp/claude-1000/-mnt-d6b3a8b1-cdee-4056-bce2-fd0287ba747b-Gen-AI-TechnicalContent/2ebeee72-e5cd-42c1-9b3c-7ca9f2b98596/scratchpad/skel")
    out.mkdir(parents=True, exist_ok=True)
    f = find(sub)
    name = f.stem
    if mode == "extract":
        skel, blocks = split(f.read_text(encoding="utf-8"))
        (out / f"{name}.skel.md").write_text(skel, encoding="utf-8")
        (out / f"{name}.blocks.json").write_text(json.dumps(blocks), encoding="utf-8")
        print(f"# {f.relative_to(ROOT)}  ({len(blocks)} blocks)\n")
        print(skel)
        print("\n--- what each block contains (not part of the skeleton) ---")
        for i, b in enumerate(blocks, 1):
            lines = b.splitlines()
            body = [l for l in lines[1:-1] if l.strip()]
            print(f"@@B{i}@@ {lines[0].strip()}  [{len(lines)-2} lines]  e.g. {' | '.join(l.strip()[:70] for l in body[:3])}")
    elif mode == "apply":
        blocks = json.loads((out / f"{name}.blocks.json").read_text(encoding="utf-8"))
        new = (out / f"{name}.new.md").read_text(encoding="utf-8")
        found = re.findall(r"@@B(\d+)@@", new)
        want = [str(i + 1) for i in range(len(blocks))]
        if found != want:
            sys.exit(f"placeholder mismatch: found {found}, want {want}")
        for i, b in enumerate(blocks):
            new = new.replace(f"@@B{i+1}@@", b, 1)
        # a quiz must stay well-formed: lines start with ?, -, +, >
        f.write_text(new if new.endswith("\n") else new + "\n", encoding="utf-8")
        print(f"wrote {f.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1:])
