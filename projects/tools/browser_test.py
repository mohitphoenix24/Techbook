"""Browser test for the ProjectLab course (needs Playwright + Chrome, and internet for Pyodide, Babel and esm.sh).

Serve the repo root first:   python3 -m http.server 8766   (from TechnicalContent/)
Then:   python3 projects/tools/browser_test.py [lesson-id ... | prefix* | module:<id> | all] [--shots DIR] [--light] [--mobile] [--noruns]

For every lesson it: runs every Python block in Pyodide and compares the output with the local run recorded by
build.py; runs every React block in its sandboxed preview (and clicks the button named by `autoclick="..."`),
reporting errors the preview logged; steps through diagrams; and collects console errors.
It also opens the source explorer. --shots saves a picture of each visual and each React preview.
"""
import hashlib, json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("PL_BASE", "http://localhost:8766/projects/index.html")
argv = sys.argv[1:]
shots = argv[argv.index("--shots") + 1] if "--shots" in argv else None
flags = {a for a in argv if a.startswith("--")}
args = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] != "--shots")]
if shots:
    os.makedirs(shots, exist_ok=True)

CACHE = json.loads((ROOT / ".build-cache" / "py.json").read_text()) if (ROOT / ".build-cache" / "py.json").exists() else {}
key = lambda code, exp=False: hashlib.sha1((code + "\u0000" + ("x" if exp else "")).encode()).hexdigest()[:16]

RUN_ALL = """async (noruns) => {
  const out = [];
  const busy = /Running|Loading|Installing|Compiling|Starting/;
  if (!noruns) for (const c of document.querySelectorAll('.code-card.runnable')) {
    const b = c._block;
    const isReact = ['jsx', 'tsx'].includes(b.lang);
    await c._run();
    for (let i = 0; i < 2400 && c.querySelector('.out-status') && busy.test(c.querySelector('.out-status').textContent); i++) await new Promise(r => setTimeout(r, 25));
    let clicked = '';
    if (isReact && b.meta.autoclick) {
      const doc = c.querySelector('iframe')?.contentDocument;
      let btn = null;
      for (let i = 0; i < 160 && !btn; i++) {                 // the button may appear after a loading state
        btn = doc && [...doc.querySelectorAll('button:not([disabled])')].find(x => x.textContent.trim().startsWith(b.meta.autoclick));
        if (!btn) await new Promise(r => setTimeout(r, 25));
      }
      if (btn) { btn.click(); clicked = b.meta.autoclick; await new Promise(r => setTimeout(r, +(b.meta.wait || 2500))); }
      else clicked = 'MISSING:' + b.meta.autoclick;
    }
    const st = c.querySelector('.out-status');
    const consoleLines = [...c.querySelectorAll('.console .out-body > div')].map(d => d.textContent);
    const text = isReact ? (c.querySelector('iframe')?.contentDocument?.body?.innerText ?? '') : (c.querySelector('.out-body')?.textContent ?? '');
    const ok = ((st && st.classList.contains('ok')) || (b.meta['expect-error'] && st && /✕/.test(st.textContent))) && !clicked.startsWith('MISSING') && !consoleLines.some(l => l.startsWith('✕'));
    out.push({ ok: !!ok, why: st ? st.textContent : 'no status', code: b.code, react: isReact, shared: !!b.meta.shared, title: b.meta.title || '', exp: !!b.meta['expect-error'], text: text.slice(0, 4000), clicked, errs: consoleLines.filter(l => l.startsWith('✕')) });
  }
  const diagErr = [...document.querySelectorAll('.box-warn .box-head')].filter(h => /Diagram error/.test(h.textContent)).map(h => h.parentElement.textContent);
  for (const s of document.querySelectorAll('.sd-stepper')) {
    for (let i = 0; i < 3; i++) { s.querySelector('[data-a="next"]').click(); await new Promise(r => setTimeout(r, 30)); }
    s.querySelector('[data-a="reset"]').click();
  }
  // quizzes: click the first option of each question, to make sure they respond
  for (const q of document.querySelectorAll('.quiz-q')) q.querySelector('.quiz-opt')?.click();
  return { runs: out, diagErr, viz: document.querySelectorAll('.viz-card').length, quizzes: document.querySelectorAll('.quiz').length, tabs: document.querySelectorAll('.code-tabs').length };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    vp = {"width": 390, "height": 860} if "--mobile" in flags else {"width": 1360, "height": 900}
    ctx = b.new_context(viewport=vp)
    ctx.add_init_script(f"try{{localStorage.setItem('techcontent:theme','{'light' if '--light' in flags else 'dark'}')}}catch(e){{}}")
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(BASE + "#/"); page.wait_for_timeout(800)
    mods = page.evaluate("COURSE.modules.map(m => [m.id, m.lessons.map(l => l.id)])")
    ids = [i for _, ls in mods for i in ls]
    if args and args != ["all"]:
        sel = []
        for a in args:
            if a.startswith("module:"):
                sel += [i for m, ls in mods if m == a[7:] for i in ls]
            elif a.endswith("*"):
                sel += [i for i in ids if i.startswith(a[:-1])]
            else:
                sel += [a]
        ids = [i for i in ids if i in sel]

    bad = warn = 0
    # ---- the home page and the source explorer
    if not args or args == ["all"]:
        errors.clear()
        page.goto(BASE + "#/"); page.wait_for_timeout(500)
        home_ok = page.locator(".mod-card").count() >= 6 and page.locator(".stat").count() == 4
        page.goto(BASE + "#/code"); page.wait_for_timeout(400)
        index_ok = page.locator(".proj-card").count() >= 1
        slug = page.evaluate("Object.keys(PROJECT_CODE)[0]")
        page.goto(BASE + f"#/code/{slug}"); page.wait_for_timeout(500)
        tree_ok = page.locator(".ex-file").count() > 5 and page.locator(".ex-src code").count() + page.locator(".ex-md").count() == 1
        first = page.locator(".ex-file:visible").nth(2); first.click(); page.wait_for_timeout(300)
        view_ok = page.locator(".ex-src code").count() == 1 and len(page.locator(".ex-ln").inner_text().split("\n")) > 3
        errs = [e for e in errors if "favicon" not in e and "fonts.g" not in e and "can escape its sandboxing" not in e]
        ok = home_ok and index_ok and tree_ok and view_ok and not errs
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} home + source explorer (home {home_ok}, index {index_ok}, tree {tree_ok}, file view {view_ok})")
        for e in errs[:5]: print("   ! " + e[:200])
        if shots:
            page.screenshot(path=f"{shots}/explorer.png")
            page.goto(BASE + "#/"); page.wait_for_timeout(600); page.screenshot(path=f"{shots}/home.png")

    for lid in ids:
        errors.clear()
        page.goto(BASE + "#/l/" + lid); page.wait_for_timeout(700)
        res = page.evaluate(RUN_ALL, "--noruns" in flags); page.wait_for_timeout(200)
        fails = [r for r in res["runs"] if not r["ok"]]
        diffs = []
        for r in res["runs"]:
            if r["ok"] and not r["shared"] and not r["react"]:
                want = CACHE.get(key(r["code"], r["exp"]))
                if want and want["o"].strip() != r["text"].strip() and r["text"].strip() != "(no output — add a print() to see results)":
                    diffs.append((r, want["o"]))
        errs = [e for e in errors if "favicon" not in e and "fonts.g" not in e and "esm.sh" not in e and "can escape its sandboxing" not in e]
        ok = not fails and not errs and not res["diagErr"]
        bad += not ok
        warn += bool(diffs)
        nreact = sum(1 for r in res["runs"] if r["react"])
        print(f"{'OK ' if ok else 'BAD'} {lid}: {len(res['runs'])} runs ({nreact} react), {res['viz']} diagrams, {res['quizzes']} quizzes" + (f"  [{len(diffs)} output differences]" if diffs else ""))
        for f in fails:
            print(f"   ✕ {f['title']!r}: {f['why']} {f['clicked']}")
            print("\n".join("     " + l for l in (f["errs"] or f["text"].splitlines()[-12:])))
        for r, want in diffs[:3]:
            a, bb = r["text"].strip().splitlines(), want.strip().splitlines()
            for i, (x, y) in enumerate(zip(a + [""] * 99, bb + [""] * 99)):
                if x != y:
                    print(f"   ~ {r['title']!r} line {i + 1}: browser {x[:110]!r}  local {y[:110]!r}"); break
                if i > max(len(a), len(bb)): break
        for e in errs[:10]: print("   ! " + e[:300])
        for d in res["diagErr"]: print("   ! " + d[:300])
        if shots:
            for i, c in enumerate(page.query_selector_all(".viz-card, .preview-wrap")):
                c.scroll_into_view_if_needed(); page.wait_for_timeout(150)
                c.screenshot(path=f"{shots}/{lid}-{i}.png")
    print(f"\n{len(ids) - bad}/{len(ids)} lessons clean, {warn} with output differences (review)")
    b.close()
    sys.exit(1 if bad else 0)
