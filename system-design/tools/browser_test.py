"""Browser test for the ScaleLab course (needs Playwright + Chrome).

Serve the repo root first:   python3 -m http.server 8766   (from TechnicalContent/)
Then:                        python3 system-design/tools/browser_test.py [lesson-id ... | prefix* | all] [--shots DIR] [--light] [--mobile]

For every lesson it runs every runnable block (both tabs), checks C++ blocks report OK,
compares each JS block's browser output with Node's (COURSE.jsOutputs, from build.py),
clicks through diagram steppers, and collects console errors. --shots saves each visual.
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SD_BASE", "http://localhost:8766/system-design/index.html")
argv = sys.argv[1:]
shots = argv[argv.index("--shots") + 1] if "--shots" in argv else None
flags = {a for a in argv if a.startswith("--")}
args = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] != "--shots")]
if shots: os.makedirs(shots, exist_ok=True)

RUN_ALL = """async () => {
  const fnv = window.CppRunner.fnv, out = [];
  for (const c of document.querySelectorAll('.code-card.runnable')) {
    const lang = c.dataset.lang, b = c._block;
    await c._run();
    for (let i = 0; i < 400 && c.querySelector('.out-status') && /Running|Compiling/.test(c.querySelector('.out-status').textContent); i++) await new Promise(r => setTimeout(r, 25));
    const st = c.querySelector('.out-status'), text = c.querySelector('.out-body')?.textContent ?? '';
    let ok = (st && st.classList.contains('ok')) || (b.meta['expect-error'] && st && /expected/.test(st.textContent));
    let why = st ? st.textContent : 'no status', want = null;
    if (lang === 'js' && ok && !b.meta['expect-error']) {
      want = COURSE.jsOutputs[fnv(b.code + '\\u0000')];
      if (want == null) { ok = false; why = 'no node output cached'; }
      else if (want.trimEnd() !== text.trimEnd()) { ok = false; why = 'browser output differs from node'; }
      else want = null;
    }
    out.push({ lang, ok, why, title: b.meta.title || '', got: ok ? '' : text.slice(0, 1500), want: want && want.slice(0, 1500) });
  }
  const diagErr = [...document.querySelectorAll('.box-warn .box-head')].filter(h => /Diagram error/.test(h.textContent)).map(h => h.parentElement.textContent);
  for (const s of document.querySelectorAll('.sd-stepper')) {
    for (let i = 0; i < 3; i++) { s.querySelector('[data-a="next"]').click(); await new Promise(r => setTimeout(r, 30)); }
    s.querySelector('[data-a="reset"]').click();
  }
  return { runs: out, diagErr, viz: document.querySelectorAll('.viz-card').length, tabs: document.querySelectorAll('.code-tabs').length };
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
    ids = page.evaluate("COURSE.modules.flatMap(m => m.lessons.map(l => l.id))")
    if args and args != ["all"]:
        ids = [i for i in ids if i in args or any(a.endswith("*") and i.startswith(a[:-1]) for a in args)]
    bad = 0
    for lid in ids:
        errors.clear()
        page.goto(BASE + "#/l/" + lid); page.wait_for_timeout(700)
        res = page.evaluate(RUN_ALL); page.wait_for_timeout(300)
        fails = [r for r in res["runs"] if not r["ok"]]
        errs = [e for e in errors if "favicon" not in e]
        ok = not fails and not errs and not res["diagErr"]
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} {lid}: {len(res['runs'])} runs, {res['viz']} visuals, {res['tabs']} tab groups")
        for f in fails:
            print(f"   ✕ {f['lang']} {f['title']!r}: {f['why']}")
            if f.get("want"):
                print("     --- browser:\n" + "\n".join("     " + l for l in f["got"].splitlines()[:25]))
                print("     --- node:\n" + "\n".join("     " + l for l in f["want"].splitlines()[:25]))
            elif f["got"]:
                print("\n".join("     " + l for l in f["got"].splitlines()[:15]))
        for e in errs[:10]: print("   ! " + e[:300])
        for d in res["diagErr"]: print("   ! " + d[:300])
        if shots:
            for i, c in enumerate(page.query_selector_all(".viz-card")):
                c.scroll_into_view_if_needed(); page.wait_for_timeout(120)
                c.screenshot(path=f"{shots}/{lid}-{i}.png")
    print(f"\n{len(ids) - bad}/{len(ids)} lessons clean")
    b.close()
    sys.exit(1 if bad else 0)
