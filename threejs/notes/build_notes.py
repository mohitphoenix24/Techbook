#!/usr/bin/env python3
"""Build the ThreeLab Notebook: src/*.md -> notebook.html -> ThreeLab-Notebook.pdf

    python3 build_notes.py            # HTML + PDF (two passes, so the contents get page numbers)
    python3 build_notes.py --html     # HTML only (fast preview in a browser)
    python3 build_notes.py --pages a,b --shots DIR   # also save PNGs of some PDF pages

Markdown extras (see README.md in this folder):
    :::def Term / :::formula Title / :::calc Title / :::intuition / :::tip / :::warn / :::note
    :::deep Title / :::new Title / :::keypoints / :::qa Question {level=...}   ...   :::
    $inline maths$  and  $$display maths$$  (KaTeX, rendered at build time with Node)
    ```js title="three.js"   fenced code, highlighted with Pygments
    @fig(name) Caption        an SVG figure drawn by figs.py
"""
import html
import json
import os
import re
import subprocess
import sys
import tempfile

import markdown
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name

import figs

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
ROOT = os.path.dirname(os.path.dirname(HERE))
KATEX = os.path.join(ROOT, "shared", "vendor", "katex")
OUT_HTML = os.path.join(HERE, "notebook.html")
OUT_PDF = os.path.join(HERE, "ThreeLab-Notebook.pdf")
CHROME = "/usr/bin/google-chrome"

TITLE = "ThreeLab Notebook"
SUBTITLE = "The Technical Study & Interview Guide to Three.js, React Three Fiber & Real-Time 3D"
AUTHOR = "[AUTHOR NAME]"                     # placeholder until the author's details are supplied
EDITION = "First edition · three.js r186 · React Three Fiber 9 · drei 10 · React 19"
FRONT = os.path.join(SRC, "front")
BACK = os.path.join(SRC, "back")
LEVELS = ("foundation", "intermediate", "advanced", "interview")
ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]

# ---------------------------------------------------------------- helpers

LANG_LABEL = {
    "js": "JavaScript", "javascript": "JavaScript", "jsx": "JSX", "tsx": "TSX", "ts": "TypeScript",
    "glsl": "GLSL", "wgsl": "WGSL", "bash": "Shell", "sh": "Shell", "json": "JSON", "html": "HTML",
    "css": "CSS", "text": "Text", "python": "Python", "tsl": "TSL (JavaScript)",
}
LEXER = {"tsl": "js", "text": "text", "sh": "bash"}


def esc(s):
    return html.escape(s, quote=True)


class Ctx:
    """Per-build registry of placeholders (code, maths, figures, boxes)."""

    def __init__(self):
        self.store = {}
        self.n = 0
        self.math = []          # (key, tex, display)
        self.fig_no = {}        # chapter -> count
        self.defs = []          # (term, anchor id, html of the first sentence, chapter)
        self.def_ids = set()
        self.trouble = 0        # running number for troubleshooting cards
        self.fig_label = {}     # figure name -> "13.4"

    def put(self, html_str, kind="B"):
        self.n += 1
        key = f"ZZ{kind}{self.n}ZZ"
        self.store[key] = html_str
        return key


def render_code(ctx, lang, attrs, body):
    m = re.search(r'title="([^"]*)"', attrs or "")
    title = m.group(1) if m else ""
    lang = (lang or "text").lower()
    try:
        lexer = get_lexer_by_name(LEXER.get(lang, lang))
    except Exception:
        lexer = get_lexer_by_name("text")
    code = highlight(body.rstrip("\n"), lexer, HtmlFormatter(nowrap=True))
    label = LANG_LABEL.get(lang, lang.upper())
    flavour = ""
    t = title.lower()
    if "r3f" in t or "react three fiber" in t:
        flavour = " r3f"
    elif "three" in t or "tsl" in t:
        flavour = " three"
    elif lang in ("glsl", "wgsl"):
        flavour = " shader"
    head = f'<div class="code-head"><span class="dots"><i></i><i></i><i></i></span><span class="code-title">{esc(title)}</span><span class="code-lang">{esc(label)}</span></div>'
    if body.count("\n") > 16:          # long blocks may split across pages instead of leaving gaps
        flavour += " long"
    return f'<div class="code{flavour}">{head}<pre><code>{code}</code></pre></div>'


FENCE = re.compile(r"^```([\w+-]*)[ \t]*(.*?)\n(.*?)^```[ \t]*$", re.S | re.M)
INLINE_CODE = re.compile(r"(`+)(.+?)\1", re.S)
DISPLAY_MATH = re.compile(r"\$\$(.+?)\$\$", re.S)
INLINE_MATH = re.compile(r"(?<![\\$\w])\$(?!\s)([^\n$]+?)(?<!\s)\$(?![\w$])")


def protect(ctx, text):
    """Swap code fences, maths and inline code for placeholder tokens."""
    text = FENCE.sub(lambda m: "\n\n" + ctx.put(render_code(ctx, m.group(1), m.group(2), m.group(3)), "C") + "\n\n", text)
    spans = {}

    def keep(m):
        k = f"QQIC{len(spans)}QQ"
        spans[k] = m.group(0)
        return k
    text = INLINE_CODE.sub(keep, text)

    def disp(m):
        key = ctx.put("", "M")
        ctx.math.append((key, m.group(1).strip(), True))
        return "\n\n" + key + "\n\n"
    text = DISPLAY_MATH.sub(disp, text)

    def inl(m):
        key = ctx.put("", "I")
        ctx.math.append((key, m.group(1), False))
        return key
    text = INLINE_MATH.sub(inl, text)
    text = text.replace("\\$", "&#36;")
    for k, v in spans.items():
        text = text.replace(k, v)
    return text


BOX = {
    "def": ("Definition", "book"), "formula": ("Formula", "sigma"), "calc": ("Worked example", "calc"),
    "intuition": ("Intuition", "bulb"), "tip": ("Tip", "spark"), "warn": ("Pitfall", "alert"),
    "note": ("Note", "info"), "deep": ("Deep dive", "layers"), "new": ("New in recent three.js", "star"),
    "keypoints": ("Key points", "check"), "qa": ("Interview question", "q"), "recipe": ("Recipe", "code"),
    "perf": ("Performance", "gauge"),
}

# Structured boxes: lines starting with "Field:" open a new labelled field.
FIELD_BOX = {
    "build": ("Build this", "hammer", ["Problem", "Requirements", "Constraints", "Hints", "Relevant APIs", "Expected result"]),
    "apichange": ("API change", "swap", ["Older tutorials", "Current approach", "Why it changed", "Version"]),
    "case": ("Case study", "gauge", ["Before", "Problem", "Investigation", "Fix", "After", "Why it worked"]),
    "lens": ("Senior engineer lens", "eye", ["Junior", "Mid-level", "Senior"]),
    "trouble": ("Problem", "wrench", ["Symptom", "Cause", "How to investigate", "Fix", "Prevention"]),
    "project": ("Project", "flask", ["Brief", "Features", "Architecture", "Milestones", "Key APIs", "Stretch goals"]),
}

ICONS = {
    "book": '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    "sigma": '<path d="M18 5H6l6 7-6 7h12"/>',
    "calc": '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
    "bulb": '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    "spark": '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    "alert": '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    "layers": '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    "star": '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>',
    "check": '<path d="m5 12 4 4 10-10"/>',
    "q": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
    "code": '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
    "hammer": '<path d="m14 6 4 4M3 21l9-9M12.5 7.5 16 4l4 4-3.5 3.5z"/>',
    "swap": '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    "gauge": '<path d="M4 15a8 8 0 1 1 16 0"/><path d="m12 15 4-5"/>',
    "eye": '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
    "wrench": '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-2.5z"/>',
    "flask": '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
}


def icon(name):
    return f'<svg class="ic" viewBox="0 0 24 24">{ICONS[name]}</svg>'


def md(text):
    return markdown.markdown(text, extensions=["tables", "sane_lists", "smarty"], output_format="html5")


def slugify(t):
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


class Chapter:
    def __init__(self, path, num):
        raw = open(path, encoding="utf-8").read()
        fm, body = {}, raw
        if raw.startswith("---"):
            _, head, body = raw.split("---", 2)
            for line in head.strip().splitlines():
                k, _, v = line.partition(":")
                fm[k.strip()] = v.strip()
        self.fm = fm
        self.num = num
        self.title = fm.get("title", "Untitled")
        self.part = fm.get("part")
        self.slug = os.path.splitext(os.path.basename(path))[0]
        self.id = "ch-" + self.slug
        self.body = body
        self.sections = []      # (level, id, title, number)


def render_blocks(ctx, ch, text):
    """Handle ::: boxes (nestable) and @fig lines, then Markdown."""
    lines = text.split("\n")
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^:::(\w+)\s*(.*)$", line)
        if m:
            kind, rest = m.group(1), m.group(2).strip()
            depth, j, inner = 1, i + 1, []
            while j < len(lines):
                if re.match(r"^:::\w+", lines[j]):
                    depth += 1
                elif lines[j].strip() == ":::":
                    depth -= 1
                    if depth == 0:
                        break
                inner.append(lines[j])
                j += 1
            out.append("\n" + ctx.put(render_box(ctx, ch, kind, rest, "\n".join(inner))) + "\n")
            i = j + 1
            continue
        m = re.match(r"^@fig\((\w+)\)\s*(.*)$", line)
        if m:
            out.append("\n" + ctx.put(render_fig(ctx, ch, m.group(1), m.group(2))) + "\n")
            i += 1
            continue
        out.append(line)
        i += 1
    return md("\n".join(out))


def render_box(ctx, ch, kind, rest, inner):
    if kind == "flow":
        steps = [l.strip() for l in inner.split("\n") if l.strip()]
        items = "".join(f'<li><span class="fn">{i + 1}</span><span class="ft">{md(st)[3:-4]}</span></li>' for i, st in enumerate(steps))
        title = f'<div class="flow-title">{md(rest)[3:-4]}</div>' if rest else ""
        return f'<div class="flow">{title}<ol>{items}</ol></div>'
    if kind in FIELD_BOX:
        return render_field_box(ctx, ch, kind, rest, inner)
    if kind not in BOX:
        raise SystemExit(f"{ch.slug}: unknown box :::{kind}")
    label, ic = BOX[kind]
    attrs = dict(re.findall(r"(\w+)=(\S+)", rest))
    rest = re.sub(r"\{.*?\}", "", rest).strip()
    body = render_blocks(ctx, ch, inner)
    if kind == "def" and rest:
        did = "def-" + slugify(re.sub(r"<[^>]+>|`", "", rest))
        while did in ctx.def_ids:
            did += "-2"
        ctx.def_ids.add(did)
        ctx.defs.append((rest, did, first_sentence(body), ch))
        title = md(rest)[3:-4]
        head = f'<div class="box-head">{icon(ic)}<span class="box-label">{label}</span><span class=box-title>{title}</span></div>'
        return f'<div class="box def" id="{did}">{head}<div class="box-body">{body}</div></div>'
    if kind == "qa":
        lvl = attrs.get("level", "")
        chip = f'<span class="lvl {esc(lvl)}">{esc(lvl)}</span>' if lvl else ""
        q = md(rest)[3:-4]  # strip <p></p>
        long = " long" if len(re.sub(r"<[^>]+>", "", body)) > 650 or "class=\"code" in body else ""
        return f'<div class="qa{long}"><div class="q"><span class="qmark">Q</span><div class="qtext">{q}</div>{chip}</div><div class="a"><span class="amark">A</span><div class="abody">{body}</div></div></div>'
    title = md(rest)[3:-4] if rest else ""
    head = f'<div class="box-head">{icon(ic)}<span class="box-label">{label}</span>{f"<span class=box-title>{title}</span>" if title else ""}</div>'
    limit = 700 if kind in ("calc", "deep") else 900
    long = " long" if len(re.sub(r"<[^>]+>", "", body)) > limit else ""
    return f'<div class="box {kind}{long}">{head}<div class="box-body">{body}</div></div>'


def first_sentence(body_html):
    """First sentence of a definition (for the glossary), keeping inline markup and placeholders."""
    m = re.search(r"<p>(.*?)</p>", body_html, re.S)
    p = m.group(1) if m else body_html
    parts = re.split(r"(?<=[a-z0-9)\]`>])\.\s+(?=[A-Z(<])", p, maxsplit=1)
    out = parts[0].strip()
    return out if out.endswith(".") else out + "."


def render_field_box(ctx, ch, kind, rest, inner):
    label, ic, fields = FIELD_BOX[kind]
    illustrative = "{illustrative}" in rest
    rest = rest.replace("{illustrative}", "").strip()
    names = {f.lower(): f for f in fields}
    blocks, cur = [], None
    for line in inner.split("\n"):
        m = re.match(r"^([A-Za-z][A-Za-z -]+?):\s*(.*)$", line)
        if m and m.group(1).lower() in names:
            cur = [names[m.group(1).lower()], [m.group(2)]]
            blocks.append(cur)
        elif cur is not None:
            cur[1].append(line)
        elif line.strip():
            blocks.append(cur := ["", [line]])
    rows = []
    for name, lines in blocks:
        text = "\n".join(lines).strip()
        if kind == "case" and name in ("Before", "After"):
            items = re.findall(r"^\s*[-*]\s*([^:\n]+):\s*(.+)$", text, re.M)
            chips = "".join(f'<div class="mt"><span>{esc(k.strip())}</span><b>{md(v.strip())[3:-4]}</b></div>' for k, v in items)
            rows.append(f'<div class="metrics {name.lower()}"><div class="mt-h">{name}</div><div class="mt-row">{chips}</div></div>')
            continue
        val = render_blocks(ctx, ch, text)
        cls = slugify(name) or "plain"
        rows.append(f'<div class="fr {cls}"><div class="fl">{esc(name)}</div><div class="fv">{val}</div></div>' if name else f'<div class="fr plain"><div class="fv">{val}</div></div>')
    title = md(rest)[3:-4] if rest else ""
    if kind == "trouble":
        ctx.trouble += 1
        label = f"Problem {ctx.trouble}"
    badge = '<span class="badge">illustrative numbers</span>' if illustrative else ""
    head = f'<div class="box-head">{icon(ic)}<span class="box-label">{label}</span>{f"<span class=box-title>{title}</span>" if title else ""}{badge}</div>'
    long = " long" if len(re.sub(r"<[^>]+>", "", "".join(rows))) > 1000 else ""
    return f'<div class="box fbox {kind}{long}">{head}<div class="fields">{"".join(rows)}</div></div>'


def render_fig(ctx, ch, name, caption):
    if name not in figs.FIGS:
        raise SystemExit(f"{ch.slug}: unknown figure {name}")
    n = ctx.fig_no.get(ch.num, 0) + 1
    ctx.fig_no[ch.num] = n
    ctx.fig_label[name] = f"{ch.num}.{n}"
    svg = figs.FIGS[name]()
    cap = md(caption)[3:-4] if caption else ""
    if not ch.num:
        return f'<figure class="fig plain" id="fig-{name}">{svg}{f"<figcaption>{cap}</figcaption>" if cap else ""}</figure>'
    return f'<figure class="fig" id="fig-{name}">{svg}<figcaption><b>Figure {ch.num}.{n}</b> {cap}</figcaption></figure>'


def number_headings(ch, body_html):
    sec = [0]
    sub = [0]

    def rep(m):
        level, inner = int(m.group(1)), m.group(2)
        tag = ""
        t = re.search(r"\s*\{(%s)\}\s*$" % "|".join(LEVELS), inner)
        if t:
            tag, inner = t.group(1), inner[:t.start()]
        text = re.sub(r"<[^>]+>", "", inner)
        if level == 2 and text.strip().lower() == "interview questions":
            tag = "interview"
        if level == 2:
            sec[0] += 1
            sub[0] = 0
            num = f"{ch.num}.{sec[0]}"
        else:
            sub[0] += 1
            num = f"{ch.num}.{sec[0]}.{sub[0]}"
        hid = f"s-{num.replace('.', '-')}"
        ch.sections.append((level, hid, html.unescape(text), num, tag))
        dtag = f' data-tag="{tag}"' if tag else ""
        return f'<h{level} id="{hid}"{dtag}><span class="hn">{num}</span> {inner}</h{level}>'
    return re.sub(r"<h([23])>(.*?)</h\1>", rep, body_html)


def render_math(ctx):
    if not ctx.math:
        return
    with tempfile.TemporaryDirectory() as td:
        inp = os.path.join(td, "in.json")
        json.dump([[k, t, d] for k, t, d in ctx.math], open(inp, "w"))
        js = (
            "const katex=require(%s);const fs=require('fs');const items=JSON.parse(fs.readFileSync(%s,'utf8'));"
            "const out={};const bad=[];for(const [k,t,d] of items){try{out[k]=katex.renderToString(t,{displayMode:d,throwOnError:true,strict:false,trust:true})}catch(e){bad.push([t,String(e.message)]);out[k]='<span class=mathbad>'+t+'</span>'}}"
            "process.stdout.write(JSON.stringify({out,bad}))"
        ) % (json.dumps(os.path.join(KATEX, "katex.min.js")), json.dumps(inp))
        res = subprocess.run(["node", "-e", js], capture_output=True, text=True)
        if res.returncode:
            raise SystemExit(res.stderr)
        data = json.loads(res.stdout)
    for t, err in data["bad"]:
        print("  ! KaTeX:", err, "in:", t[:80])
    for k, h in data["out"].items():
        disp = any(k == kk and d for kk, _, d in ctx.math)
        ctx.store[k] = f'<div class="math">{h}</div>' if disp else h
    return len(data["bad"])


def fill(ctx, s):
    for _ in range(4):  # nested placeholders (boxes inside boxes)
        s2 = re.sub(r"<p>(ZZ[BCMF]\d+ZZ)</p>", lambda m: ctx.store[m.group(1)], s)
        s2 = re.sub(r"ZZ[BCMIF]\d+ZZ", lambda m: ctx.store[m.group(0)], s2)
        if s2 == s:
            break
        s = s2
    return s


# ---------------------------------------------------------------- page assembly

def cover():
    return f"""<section class="cover">
  <div class="cover-art">{figs.cover_art()}</div>
  <div class="cover-text">
    <div class="cover-kicker">The technical study &amp; interview guide</div>
    <div class="cover-title">ThreeLab <span>Note</span><span>book</span></div>
    <div class="cover-subtitle">Three.js · React Three Fiber · Real-Time 3D</div>
    <p class="cover-sub">Learn the mathematics. Understand the rendering pipeline. Build with three.js and React Three Fiber. Optimise real-time 3D applications. Prepare for technical interviews.</p>
    <div class="cover-tags"><span>Maths</span><span>Rendering pipeline</span><span>PBR</span><span>Shaders</span><span>WebGPU · TSL</span><span>R3F</span><span>Performance</span><span>WebXR</span><span>Interviews</span></div>
    <div class="cover-ed">{esc(AUTHOR)} · {esc(EDITION)}</div>
  </div>
</section>"""


def title_page():
    return f"""<section class="title-page">
  <div class="tp-art">{figs.cover_art(small=True)}</div>
  <h1 class="tp-title">{TITLE}</h1>
  <div class="tp-sub">{esc(SUBTITLE)}</div>
  <div class="tp-rule"></div>
  <div class="tp-author">{esc(AUTHOR)}</div>
  <div class="tp-ed">{esc(EDITION)}</div>
</section>"""


class Page:
    """A front- or back-matter page written in Markdown (src/front, src/back)."""

    def __init__(self, path):
        raw = open(path, encoding="utf-8").read()
        _, head, body = raw.split("---", 2)
        self.fm = {k.strip(): v.strip() for k, _, v in (l.partition(":") for l in head.strip().splitlines())}
        self.title = self.fm.get("title", "")
        self.id = self.fm.get("id", slugify(self.title))
        self.cls = self.fm.get("class", "")
        self.toc = self.fm.get("toc", "yes") == "yes"
        self.body = body
        self.num, self.slug, self.sections = 0, self.id, []


def load_pages(folder):
    if not os.path.isdir(folder):
        return []
    return [Page(os.path.join(folder, f)) for f in sorted(os.listdir(folder)) if f.endswith(".md")]


def page_html(ctx, pg, extra=""):
    inner = render_blocks(ctx, pg, protect(ctx, pg.body))
    inner = re.sub(r"<h2>", '<h2 class="front-h2">', inner)
    h = f'<h1 class="front-h">{esc(pg.title)}</h1>' if pg.fm.get("heading", "yes") == "yes" else ""
    return f'<section class="front {pg.cls}" id="{pg.id}">{h}{inner}{extra}</section>'


def toc(front, chapters, back, pages):
    rows = []
    fr = "".join(f'<a class="toc-fm" href="#{p.id}"><span class="toc-t">{esc(p.title)}</span><span class="toc-p">{pages.get(p.id, "000")}</span></a>' for p in front if p.toc)
    rows.append(f'<div class="toc-front">{fr}</div>')
    part_no = 0
    for ch in chapters:
        if ch.part:
            part_no += 1
            rows.append(f'<div class="toc-part"><span>Part {ROMAN[part_no]}</span> {esc(ch.part)}</div>')
        pg = pages.get(ch.id, "000")
        rows.append(f'<a class="toc-ch" href="#{ch.id}"><span class="toc-n">{ch.num:02d}</span><span class="toc-t">{esc(ch.title)}</span><span class="toc-p">{pg}</span></a>')
    rows.append('<div class="toc-part"><span>Back matter</span></div>')
    rows += [f'<a class="toc-fm" href="#{p.id}"><span class="toc-t">{esc(p.title)}</span><span class="toc-p">{pages.get(p.id, "000")}</span></a>' for p in back if p.toc]
    return f'<section class="front toc" id="contents"><h1 class="front-h">Contents</h1><div class="toc-list">{"".join(rows)}</div></section>'


def dashboard(ch):
    fm = ch.fm
    learn = "".join(f'<li><span>{num}</span>{esc(t)}</li>' for lvl, _, t, num, tag in ch.sections if lvl == 2 and tag != "interview")
    diff = fm.get("difficulty", "")
    meta = ""
    if diff:
        meta = f"""<div class="dash-meta">
      <div><span>Difficulty</span><b class="dlv {slugify(diff.split()[0])}">{esc(diff)}</b></div>
      <div><span>Prerequisites</span><b>{md(fm.get("prereqs", "None"))[3:-4]}</b></div>
      <div><span>Study time</span><b>{esc(fm.get("time", ""))}</b></div></div>"""
    end = f'<div class="dash-end"><div class="ch-in-h">By the end</div><p>{md(fm["outcome"])[3:-4]}</p></div>' if fm.get("outcome") else ""
    return f'{meta}<div class="dash-grid"><div class="ch-in"><div class="ch-in-h">You will learn</div><ol>{learn}</ol></div>{end}</div>'


def chapter_html(ctx, ch, part_no):
    body = protect(ctx, ch.body)
    inner = render_blocks(ctx, ch, body)
    inner = number_headings(ch, inner)
    part = ""
    if ch.part:
        part = f'<div class="part-page" id="part-{ch.num}"><div class="part-kicker">Part {ROMAN[part_no]}</div><div class="part-title">{esc(ch.part)}</div><div class="part-art">{figs.part_art(ch.num)}</div></div>'
    opener = f"""<header class="ch-open" id="{ch.id}">
  <div class="ch-kicker">Chapter {ch.num:02d}</div>
  <div class="ch-num">{ch.num:02d}</div>
  <h1 class="ch-title">{esc(ch.title)}</h1>
  <p class="ch-sum">{esc(ch.fm.get("summary", ""))}</p>
  {dashboard(ch)}
</header>"""
    return f'{part}<article class="chapter" data-ch="{ch.num}">{opener}<div class="ch-body">{inner}</div></article>'


def running_heads(chapters):
    """Named pages give every chapter its own running header (Chrome supports @page names)."""
    css = []
    for ch in chapters:
        label = f"{ch.num:02d} · {ch.title}".replace('"', '\\"')
        css.append(f'.chapter[data-ch="{ch.num}"] {{ page: c{ch.num}; }}\n@page c{ch.num} {{ @top-right {{ content: "{label}"; }} }}')
    return "\n".join(css)


def link_xrefs(body, chapters):
    """Turn 'Chapter N' in running text into links (not inside code, headings or existing links)."""
    ids = {ch.num: ch.id for ch in chapters}
    out, skip = [], 0
    for part in re.split(r"(<[^>]+>)", body):
        if part.startswith("<"):
            m = re.match(r"<(/?)(code|pre|a|h1|h2|h3|svg|figcaption)\b", part)
            if m:
                skip += -1 if m.group(1) else 1
            out.append(part)
        elif skip <= 0:
            def linkset(m):
                return re.sub(r"\d+", lambda d: f'<a class="xref" href="#{ids[int(d.group(0))]}">{d.group(0)}</a>' if int(d.group(0)) in ids else d.group(0), m.group(0))
            out.append(re.sub(r"\bChapters? \d+(?:(?:, | and | or | to |–)\d+)*\b", linkset, part))
        else:
            out.append(part)
    return "".join(out)


def glossary_html(ctx, extra_path):
    entries = {}
    for term, did, sent, ch in ctx.defs:
        name = re.sub(r"<[^>]+>|`", "", md(term)[3:-4])
        entries.setdefault(name.lower(), (name, f'<a href="#{did}">{md(term)[3:-4]}</a>', sent, f'<a class="gl-ch" href="#{ch.id}">Ch. {ch.num}</a>'))
    if os.path.exists(extra_path):
        for line in open(extra_path, encoding="utf-8"):
            m = re.match(r"^- \*\*(.+?)\*\*(?: \((\d+)\))?:\s*(.+)$", line.strip())
            if not m:
                continue
            name, chn, text = m.groups()
            if name.lower() in entries:
                continue
            ref = f'<a class="gl-ch" href="#{[c.id for c in CHAPTERS if c.num == int(chn)][0]}">Ch. {chn}</a>' if chn else ""
            entries[name.lower()] = (name, f"<b>{esc(name)}</b>", md(protect(ctx, text))[3:-4], ref)
    groups = {}
    for k in sorted(entries, key=lambda k: re.sub(r"^[^a-z0-9]+", "", k)):
        name, head, sent, ref = entries[k]
        letter = (re.sub(r"^[^A-Za-z0-9]+", "", name)[:1] or "#").upper()
        letter = letter if letter.isalpha() else "#"
        groups.setdefault(letter, []).append(f'<div class="gl-e"><div class="gl-t">{head} {ref}</div><div class="gl-d">{sent}</div></div>')
    return "".join(f'<div class="gl-g"><div class="gl-l">{L}</div>{"".join(v)}</div>' for L, v in groups.items()), len(entries)


CHAPTERS = []


def build_html(page_map=None):
    global CHAPTERS
    files = sorted(f for f in os.listdir(SRC) if re.match(r"\d\d-.*\.md$", f))
    chapters = [Chapter(os.path.join(SRC, f), i + 1) for i, f in enumerate(files)]
    CHAPTERS = chapters
    front, back = load_pages(FRONT), load_pages(BACK)
    ctx = Ctx()
    front_html = "".join(page_html(ctx, p) for p in front)
    bodies, part_no = [], 0
    for ch in chapters:
        part_no += bool(ch.part)
        bodies.append(chapter_html(ctx, ch, part_no))
    gl, n_gl = glossary_html(ctx, os.path.join(BACK, "glossary-extra.txt"))
    back_html = "".join(page_html(ctx, p, extra=f'<div class="glossary">{gl}</div>' if p.id == "glossary" else "") for p in back)
    bad = render_math(ctx) or 0
    body = fill(ctx, "".join(bodies))
    front_html, back_html = fill(ctx, front_html), fill(ctx, back_html)
    body = re.sub(r"<table>((?:(?!</table>).)*)</table>", lambda m: m.group(0) if m.group(1).count("<tr>") <= 9 else '<table class="long">' + m.group(1) + "</table>", body, flags=re.S)
    body = re.sub(r"\[(MUST|SHOULD|DEEP)\]", lambda m: f'<span class="kl {m.group(1).lower()}">{m.group(1)}</span>', body)
    body = link_xrefs(body, chapters)
    def figref(m):
        lab = ctx.fig_label.get(m.group(1))
        if not lab:
            print("  ! unknown figure reference:", m.group(1))
            return m.group(0)
        return f'<a class="xref" href="#fig-{m.group(1)}">Figure {lab}</a>'
    body = re.sub(r"\[\[fig:(\w+)\]\]", figref, body)
    left = re.findall(r"ZZ[A-Z]\d+ZZ", body + front_html + back_html)
    if left:
        print("  ! unreplaced placeholders:", left[:5])
    css = open(os.path.join(HERE, "notebook.css"), encoding="utf-8").read() + "\n" + running_heads(chapters)
    doc = f"""<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{TITLE}: {esc(SUBTITLE)}</title>
<meta name="author" content="{esc(AUTHOR)}">
<link rel="stylesheet" href="fonts/fonts.css">
<link rel="stylesheet" href="../../shared/vendor/katex/katex.min.css">
<style>{css}</style></head>
<body>
{cover()}
{title_page()}
{front_html_with_toc(front, front_html, chapters, back, page_map or {})}
{body}
{back_html}
<section class="back"><div class="back-art">{figs.cover_art(small=True)}</div><p>{TITLE}</p><p class="muted">{esc(SUBTITLE)}</p></section>
</body></html>"""
    open(OUT_HTML, "w", encoding="utf-8").write(doc)
    words = len(re.sub(r"<[^>]+>", " ", body + front_html + back_html).split())
    STATS.update(figures=sum(ctx.fig_no.values()), questions=body.count('class="qa'), words=words, glossary=n_gl)
    print(f"  html: {len(chapters)} chapters, {len(front)}+{len(back)} front/back pages, {sum(ctx.fig_no.values())} figures, "
          f"{len(ctx.math)} maths, {n_gl} glossary terms, ~{words:,} words, {bad} KaTeX errors")
    return chapters, front, back


def front_html_with_toc(front, front_html, chapters, back, pages):
    """Insert the contents right after the pages flagged 'before-toc' (copyright)."""
    secs = re.split(r'(?=<section class="front)', front_html)
    secs = [x for x in secs if x.strip()]
    before = [x for x, p in zip(secs, front) if p.fm.get("before_toc") == "yes"]
    after = [x for x, p in zip(secs, front) if p.fm.get("before_toc") != "yes"]
    return "".join(before) + toc(front, chapters, back, pages) + "".join(after)


STATS = {}


# ---------------------------------------------------------------- PDF

def print_pdf(path):
    import asyncio
    from playwright.async_api import async_playwright

    async def go():
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=CHROME)
            pg = await b.new_page(viewport={"width": 794, "height": 1123})   # A4 at 96 dpi
            await pg.goto("file://" + OUT_HTML, wait_until="load")
            await pg.evaluate("document.fonts.ready")
            # Anything wider than the page makes Chrome shrink EVERY page to fit, silently.
            await pg.emulate_media(media="print")
            wide = await pg.evaluate("""() => { const W = document.documentElement.clientWidth, out = [];
              for (const e of document.querySelectorAll('body *')) {
                if ((e.closest('svg') && e.tagName !== 'svg') || e.closest('.katex-mathml')) continue;
                const r = e.getBoundingClientRect();
                if (r.width && r.right > W + 1) out.push(e.tagName + ': ' + (e.textContent || '').slice(0, 70));
              } return [document.documentElement.scrollWidth, W, out.slice(0, 5)]; }""")
            if wide[0] > wide[1]:
                print(f"  ! page content is {wide[0]}px wide (> {wide[1]}px): the PDF would be scaled down. Culprits:", *wide[2], sep="\n    ")
            await pg.pdf(path=path, print_background=True, prefer_css_page_size=True, outline=True, tagged=True)
            await b.close()
    asyncio.run(go())


def outline_pages(path):
    """Map heading ids (chapters) to page numbers using the PDF outline."""
    from pdfminer.pdfdocument import PDFDocument
    from pdfminer.pdfpage import PDFPage
    from pdfminer.pdfparser import PDFParser
    from pdfminer.pdftypes import resolve1
    fp = open(path, "rb")
    doc = PDFDocument(PDFParser(fp))
    objid = {p.pageid: i + 1 for i, p in enumerate(PDFPage.create_pages(doc))}
    res = []
    for level, title, dest, a, se in doc.get_outlines():
        d = resolve1(dest) if dest else None
        if d is None and a:
            a = resolve1(a)
            d = resolve1(a.get("D")) if isinstance(a, dict) else None
        if isinstance(d, bytes) or isinstance(d, str):
            d = resolve1(doc.get_dest(d))
        if isinstance(d, dict):
            d = resolve1(d.get("D"))
        page = None
        if isinstance(d, list) and d:
            ref = d[0]
            page = objid.get(getattr(ref, "objid", None))
        res.append((level, title, page))
    fp.close()
    return res


def fix_outline(path, chapters, front=(), back=()):
    """Rebuild the PDF bookmarks with clean titles and a Part > Chapter > Section tree.

    Chrome derives bookmarks from headings but drops the space at every line wrap
    ("the Frame" becomes "theFrame"). We keep Chrome's page targets, matched by
    whitespace-free text, and write our own titles.
    """
    from pypdf import PdfReader, PdfWriter
    key = lambda t: re.sub(r"\s+", "", t)
    pages = {}
    for level, title, page in outline_pages(path):
        pages.setdefault(key(title), page)
    reader = PdfReader(path)
    writer = PdfWriter(clone_from=reader)
    if "/Outlines" in writer._root_object:
        del writer._root_object["/Outlines"]
    add = lambda title, pg, parent=None: writer.add_outline_item(title, max(0, (pg or 1) - 1), parent=parent)
    add("Cover", 1)
    add("Title page", 2)
    order = [p for p in front if p.fm.get("before_toc") == "yes"] + ["Contents"] + [p for p in front if p.fm.get("before_toc") != "yes"]
    for p in order:
        t = p if isinstance(p, str) else p.title
        add(t, pages.get(key(t)))
    part_item, missing, part_no = None, 0, 0
    for ch in chapters:
        cpage = pages.get(key(ch.title))
        missing += cpage is None
        if ch.part:
            part_no += 1
            part_item = add(f"Part {ROMAN[part_no]}: {ch.part}", (cpage or 2) - 1)
        ch_item = add(f"{ch.num}. {ch.title}", cpage, part_item)
        sec_item = None
        for level, hid, title, num, tag in ch.sections:
            pg = pages.get(key(f"{num}{title}"))
            if pg is None:          # headings with a generated label: match on the prefix
                pg = next((v for k, v in pages.items() if k.startswith(key(f"{num}{title}"))), None)
            missing += pg is None
            if level == 2:
                sec_item = add(f"{num} {title}", pg, ch_item)
            else:
                add(f"{num} {title}", pg, sec_item or ch_item)
    for p in back:
        if p.toc:
            add(p.title, pages.get(key(p.title)))
    writer.add_metadata({"/Title": f"{TITLE}: {SUBTITLE}", "/Author": AUTHOR, "/Subject": SUBTITLE,
                         "/Keywords": "three.js, React Three Fiber, R3F, WebGL, WebGPU, TSL, 3D graphics, PBR, shaders, WebXR, interview"})
    writer.page_mode = "/UseOutlines"          # open with the bookmarks panel where viewers support it
    with open(path, "wb") as fh:
        writer.write(fh)
    return missing


def main():
    args = sys.argv[1:]
    print("Building ThreeLab Notebook")
    chapters, front, back = build_html()
    if "--html" in args:
        return
    tmp = OUT_PDF + ".pass1.pdf"
    print_pdf(tmp)
    outl = outline_pages(tmp)
    titles = {}
    for level, title, page in outl:
        titles.setdefault(re.sub(r"\s+", "", title), page)
    pages = {}
    for ch in list(chapters) + list(front) + list(back):
        pages[ch.id] = titles.get(re.sub(r"\s+", "", ch.title)) or "?"
    missing = [c.title for c in list(chapters) + [p for p in list(front) + list(back) if p.toc] if pages[c.id] == "?"]
    if missing:
        print("  ! no page found for:", missing)
    build_html(pages)
    print_pdf(OUT_PDF)
    os.remove(tmp)
    chapters, front, back = build_html(pages)   # same structure; refreshes the section lists for the outline
    miss = fix_outline(OUT_PDF, chapters, front, back)
    print(f"  bookmarks rebuilt ({miss} headings without a page)")
    n = subprocess.run(["pdfinfo", OUT_PDF], capture_output=True, text=True).stdout
    pcount = re.search(r"Pages:\s+(\d+)", n).group(1)
    size = os.path.getsize(OUT_PDF) / 1e6
    print(f"  pdf: {pcount} pages, {size:.1f} MB -> {os.path.relpath(OUT_PDF, ROOT)}")
    import time
    meta = {"version": time.strftime("%Y%m%d%H%M%S"), "built": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "pages": int(pcount), "sizeMB": round(size, 1), **STATS,
            "chapters": [{"n": c.num, "title": c.title, "part": c.part, "page": pages.get(c.id), "summary": c.fm.get("summary", "")} for c in chapters]}
    with open(os.path.join(HERE, "notebook-meta.js"), "w", encoding="utf-8") as fh:
        fh.write("// generated by build_notes.py\nwindow.NOTEBOOK = " + json.dumps(meta, indent=1, ensure_ascii=False) + ";\n")
    if "--shots" in args:
        d = args[args.index("--shots") + 1]
        os.makedirs(d, exist_ok=True)
        sel = args[args.index("--pages") + 1] if "--pages" in args else "1-6"
        for part in sel.split(","):
            a, _, b = part.partition("-")
            subprocess.run(["pdftoppm", "-r", "70", "-png", "-f", a, "-l", b or a, OUT_PDF, os.path.join(d, "p")])


if __name__ == "__main__":
    main()
