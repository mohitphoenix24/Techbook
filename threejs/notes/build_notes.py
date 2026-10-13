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

EDITION = "Edition 1 · October 2026 · three.js r186 · React Three Fiber 9"

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
}


def icon(name):
    return f'<svg class="ic" viewBox="0 0 24 24">{ICONS[name]}</svg>'


def md(text):
    return markdown.markdown(text, extensions=["tables", "sane_lists", "smarty"], output_format="html5")


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
    if kind not in BOX:
        raise SystemExit(f"{ch.slug}: unknown box :::{kind}")
    label, ic = BOX[kind]
    attrs = dict(re.findall(r"(\w+)=(\S+)", rest))
    rest = re.sub(r"\{.*?\}", "", rest).strip()
    body = render_blocks(ctx, ch, inner)
    if kind == "qa":
        lvl = attrs.get("level", "")
        chip = f'<span class="lvl {esc(lvl)}">{esc(lvl)}</span>' if lvl else ""
        q = md(rest)[3:-4]  # strip <p></p>
        long = " long" if len(re.sub(r"<[^>]+>", "", body)) > 650 or "class=\"code" in body else ""
        return f'<div class="qa{long}"><div class="q"><span class="qmark">Q</span><div class="qtext">{q}</div>{chip}</div><div class="a"><span class="amark">A</span><div class="abody">{body}</div></div></div>'
    title = md(rest)[3:-4] if rest else ""
    head = f'<div class="box-head">{icon(ic)}<span class="box-label">{label}</span>{f"<span class=box-title>{title}</span>" if title else ""}</div>'
    long = " long" if len(re.sub(r"<[^>]+>", "", body)) > 900 else ""
    return f'<div class="box {kind}{long}">{head}<div class="box-body">{body}</div></div>'


def render_fig(ctx, ch, name, caption):
    if name not in figs.FIGS:
        raise SystemExit(f"{ch.slug}: unknown figure {name}")
    n = ctx.fig_no.get(ch.num, 0) + 1
    ctx.fig_no[ch.num] = n
    svg = figs.FIGS[name]()
    cap = md(caption)[3:-4] if caption else ""
    return f'<figure class="fig" id="fig-{name}">{svg}<figcaption><b>Figure {ch.num}.{n}</b> {cap}</figcaption></figure>'


def number_headings(ch, body_html):
    sec = [0]
    sub = [0]

    def rep(m):
        level, inner = int(m.group(1)), m.group(2)
        text = re.sub(r"<[^>]+>", "", inner)
        if level == 2:
            sec[0] += 1
            sub[0] = 0
            num = f"{ch.num}.{sec[0]}"
        else:
            sub[0] += 1
            num = f"{ch.num}.{sec[0]}.{sub[0]}"
        hid = f"s-{num.replace('.', '-')}"
        ch.sections.append((level, hid, html.unescape(text), num))
        return f'<h{level} id="{hid}"><span class="hn">{num}</span> {inner}</h{level}>'
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
    return f'''<section class="cover">
  <div class="cover-art">{figs.cover_art()}</div>
  <div class="cover-text">
    <div class="cover-kicker">ThreeLab · the complete notebook</div>
    <div class="cover-title">Three.js, R3F<br>&amp; <span>3D</span> <span>Graphics</span></div>
    <p class="cover-sub">Concepts, definitions, the mathematics with worked calculations, three.js and React Three Fiber implementations, modern GPU techniques, and a full interview question bank, in one study notebook.</p>
    <div class="cover-tags"><span>Maths</span><span>Rendering</span><span>PBR</span><span>Shaders</span><span>WebGPU · TSL</span><span>R3F</span><span>Performance</span><span>Interviews</span></div>
    <div class="cover-ed">{EDITION}</div>
  </div>
</section>'''


def how_to_page():
    return '''<section class="front" id="how-to-use">
<h1 class="front-h">How to use this notebook</h1>
<p class="lead">This is a study notebook, not a tutorial. Each chapter explains one idea from first principles: what it is, why it exists, the maths behind it with numbers worked out, and then how to build it in plain three.js and in React Three Fiber. Read it front to back once, then use it as a reference and a revision guide before interviews.</p>
<div class="legend">
  <div class="lg def"><b>Definition</b><span>The precise meaning of a term. Learn these word for word.</span></div>
  <div class="lg formula"><b>Formula</b><span>The equation, with every symbol explained.</span></div>
  <div class="lg calc"><b>Worked example</b><span>The same formula with real numbers, step by step.</span></div>
  <div class="lg intuition"><b>Intuition</b><span>A picture or analogy that makes the idea stick.</span></div>
  <div class="lg tip"><b>Tip</b><span>What experienced developers do in practice.</span></div>
  <div class="lg warn"><b>Pitfall</b><span>A common bug and how to avoid it.</span></div>
  <div class="lg deep"><b>Deep dive</b><span>Extra depth for advanced readers. Safe to skip at first.</span></div>
  <div class="lg new"><b>New in recent three.js</b><span>Changes from r180 to r186 that older tutorials miss.</span></div>
  <div class="lg qa"><b>Interview question</b><span>A question you may be asked, with a model answer.</span></div>
</div>
<h2 class="front-h2">Conventions</h2>
<ul class="conv">
<li><b>Coordinates.</b> three.js is right-handed with <b>+Y up</b>; the camera looks down its own <b>−Z</b>. One unit is treated as one metre.</li>
<li><b>Vectors and matrices.</b> Bold lower-case letters are vectors ($\\mathbf{v}$), capitals are matrices ($M$). Vectors are columns, so a matrix transforms a point as $M\\mathbf{p}$ and transforms read <b>right to left</b>.</li>
<li><b>Angles.</b> three.js uses <b>radians</b> everywhere except <code>PerspectiveCamera.fov</code>, which is in degrees.</li>
<li><b>Code.</b> Code labelled <span class="pill three">three.js</span> is plain JavaScript with <code>import * as THREE from "three"</code>. Code labelled <span class="pill r3f">R3F</span> is a React component inside a <code>&lt;Canvas&gt;</code>. Shader code is labelled GLSL, WGSL or TSL.</li>
<li><b>Versions.</b> Written against three.js r186, React Three Fiber 9, drei 10 and React 19. Where an API changed recently, a <i>New in recent three.js</i> box says so.</li>
</ul>
<p class="small muted">Companion to the ThreeLab course, where every idea here has a live, editable 3D example. Notebook text is in Indian English; API names keep their original spelling (for example <code>color</code>).</p>
</section>'''


def toc(chapters, pages):
    rows = []
    for ch in chapters:
        if ch.part:
            rows.append(f'<div class="toc-part">{esc(ch.part)}</div>')
        pg = pages.get(ch.id, "000")
        rows.append(f'<a class="toc-ch" href="#{ch.id}"><span class="toc-n">{ch.num:02d}</span><span class="toc-t">{esc(ch.title)}</span><span class="toc-p">{pg}</span></a>')
    return f'<section class="front toc" id="contents"><h1 class="front-h">Contents</h1><div class="toc-list">{"".join(rows)}</div></section>'


def chapter_html(ctx, ch):
    body = protect(ctx, ch.body)
    inner = render_blocks(ctx, ch, body)
    inner = number_headings(ch, inner)
    secs = "".join(f'<li><span>{num}</span>{esc(t)}</li>' for lvl, _, t, num in ch.sections if lvl == 2)
    part = f'<div class="part-page" id="part-{ch.num}"><div class="part-kicker">Part</div><div class="part-title">{esc(ch.part)}</div><div class="part-art">{figs.part_art(ch.num)}</div></div>' if ch.part else ""
    summary = ch.fm.get("summary", "")
    opener = f'''<header class="ch-open" id="{ch.id}">
  <div class="ch-num">{ch.num:02d}</div>
  <h1 class="ch-title">{esc(ch.title)}</h1>
  <p class="ch-sum">{esc(summary)}</p>
  <div class="ch-in"><div class="ch-in-h">In this chapter</div><ol>{secs}</ol></div>
</header>'''
    return f'{part}<article class="chapter" data-ch="{ch.num}">{opener}<div class="ch-body">{inner}</div></article>'


def build_html(page_map=None):
    files = sorted(f for f in os.listdir(SRC) if re.match(r"\d\d-.*\.md$", f))
    chapters = [Chapter(os.path.join(SRC, f), i + 1) for i, f in enumerate(files)]
    ctx = Ctx()
    bodies = [chapter_html(ctx, ch) for ch in chapters]
    bad = render_math(ctx) or 0
    body = "".join(bodies)
    body = fill(ctx, body)
    body = re.sub(r"<table>((?:(?!</table>).)*)</table>", lambda m: m.group(0) if m.group(1).count("<tr>") <= 9 else '<table class="long">' + m.group(1) + "</table>", body, flags=re.S)
    left = re.findall(r"ZZ[A-Z]\d+ZZ", body)
    if left:
        print("  ! unreplaced placeholders:", left[:5])
    # front-matter maths ($...$) is tiny: render it through the same path
    front = how_to_page()
    front = render_front_math(front)
    css = open(os.path.join(HERE, "notebook.css"), encoding="utf-8").read()
    doc = f'''<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ThreeLab Notebook — Three.js, R3F &amp; 3D Graphics</title>
<link rel="stylesheet" href="fonts/fonts.css">
<link rel="stylesheet" href="../../shared/vendor/katex/katex.min.css">
<style>{css}</style></head>
<body>
{cover()}
{front}
{toc(chapters, page_map or {})}
{body}
<section class="back"><div class="back-art">{figs.cover_art(small=True)}</div><p>ThreeLab Notebook · {EDITION}</p><p class="muted">Part of the Techbook ThreeLab course. Study it, scribble on it, and build things.</p></section>
</body></html>'''
    open(OUT_HTML, "w", encoding="utf-8").write(doc)
    words = len(re.sub(r"<[^>]+>", " ", body).split())
    STATS.update(figures=sum(ctx.fig_no.values()), questions=body.count('class="qa'), words=words)
    print(f"  html: {len(chapters)} chapters, {sum(ctx.fig_no.values())} figures, {len(ctx.math)} maths, ~{words:,} words, {bad} KaTeX errors")
    return chapters


STATS = {}


def render_front_math(s):
    ctx = Ctx()
    s = INLINE_MATH.sub(lambda m: (ctx.math.append((ctx.put("", "I"), m.group(1), False)) or ctx.math[-1][0]), s)
    render_math(ctx)
    return fill(ctx, s)


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


def fix_outline(path, chapters):
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
    for t in ("How to use this notebook", "Contents"):
        add(t, pages.get(key(t)))
    part_item, missing = None, 0
    for ch in chapters:
        cpage = pages.get(key(ch.title))
        missing += cpage is None
        if ch.part:
            part_item = add(f"Part: {ch.part}", (cpage or 2) - 1)
        ch_item = add(f"{ch.num}. {ch.title}", cpage, part_item)
        sec_item = None
        for level, hid, title, num in ch.sections:
            pg = pages.get(key(f"{num}{title}"))
            missing += pg is None
            if level == 2:
                sec_item = add(f"{num} {title}", pg, ch_item)
            else:
                add(f"{num} {title}", pg, sec_item or ch_item)
    writer.page_mode = "/UseOutlines"          # open with the bookmarks panel where viewers support it
    with open(path, "wb") as fh:
        writer.write(fh)
    return missing


def main():
    args = sys.argv[1:]
    print("Building ThreeLab Notebook")
    chapters = build_html()
    if "--html" in args:
        return
    tmp = OUT_PDF + ".pass1.pdf"
    print_pdf(tmp)
    outl = outline_pages(tmp)
    titles = {}
    for level, title, page in outl:
        titles.setdefault(re.sub(r"\s+", "", title), page)
    pages = {}
    for ch in chapters:
        pages[ch.id] = titles.get(re.sub(r"\s+", "", ch.title)) or "?"
    missing = [c.title for c in chapters if pages[c.id] == "?"]
    if missing:
        print("  ! no page found for:", missing)
    build_html(pages)
    print_pdf(OUT_PDF)
    os.remove(tmp)
    chapters = build_html(pages)              # same structure; refreshes the section lists for the outline
    miss = fix_outline(OUT_PDF, chapters)
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
