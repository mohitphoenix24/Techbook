"""Browser test for the JSLab course (needs Playwright + Chrome).

Serve the repo root first:   python3 -m http.server 8766   (from TechnicalContent/)
Then:   python3 javascript/tools/browser_test.py [lesson-id ... | prefix* | module:<id> | all] [--shots DIR] [--light] [--mobile] [--live] [--show]

For every lesson it opens the page, opens every Q&A answer, runs every runnable block
(unchanged blocks must show the Node-recorded output with a green status), steps through
diagrams, and collects console errors. --live also runs each block's code in the in-browser
worker and compares the result with the Node-recorded output (blocks marked node/cjs/nondet/timing are skipped).
--shots saves each diagram / event-loop simulator.
"""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("JS_BASE", "http://localhost:8766/javascript/index.html")
argv = sys.argv[1:]
shots = argv[argv.index("--shots") + 1] if "--shots" in argv else None
flags = {a for a in argv if a.startswith("--")}
args = [a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] != "--shots")]
if shots: os.makedirs(shots, exist_ok=True)

RUN_ALL = """async (live) => {
  const out = [], diffs = [];
  for (const d of document.querySelectorAll('details.qa')) { d.open = true; d._fill && d._fill(); }
  await new Promise(r => setTimeout(r, 200));
  for (const c of document.querySelectorAll('.code-card.runnable')) {
    const b = c._block;
    await c._run();
    for (let i = 0; i < 400 && c.querySelector('.out-status') && /Running/.test(c.querySelector('.out-status').textContent); i++) await new Promise(r => setTimeout(r, 25));
    const st = c.querySelector('.out-status'), text = c.querySelector('.out-body')?.textContent ?? '';
    const isErr = st && st.classList.contains('err');
    const ok = (st && st.classList.contains('ok')) || (b.meta['expect-error'] && isErr);
    out.push({ ok: !!ok, why: st ? st.textContent : 'no status', title: b.meta.title || '', lang: b.lang, got: ok ? '' : text.slice(0, 1200), shown: b.lang === 'html' ? text.slice(0, 1500) : '' });
    if (live && (b.lang === 'js' || b.lang === 'javascript') && !b.meta.node && !b.meta.cjs && !b.meta.esm && !b.meta.nondet && !b.meta.timing) {
      const exp = (window.COURSE.outputs[Runner.fnv(b.code)] || {});
      const want = (exp.c || []).map(x => x[1]).join('');
      let got = '';
      const res = await Runner.runJS(b.code, (s) => { got += s; }, { sloppy: !!b.meta.sloppy });
      const werr = exp.err ? exp.err.name + ': ' + exp.err.message : '';
      const gerr = res.error ? res.error.name + ': ' + res.error.message : '';
      const norm = (s) => s.replace(/\\s+$/g, '');
      if (norm(got) !== norm(want) || (!!werr !== !!gerr) || res.timedOut) diffs.push({ title: b.meta.title || b.code.slice(0, 50), want: want.slice(0, 600) + (werr ? '\\n>>' + werr : ''), got: got.slice(0, 600) + (gerr ? '\\n>>' + gerr : '') + (res.timedOut ? '\\n(timed out)' : '') });
    }
  }
  const diagErr = [...document.querySelectorAll('.box-warn .box-head')].filter(h => /Diagram error/.test(h.textContent)).map(h => h.parentElement.textContent);
  for (const s of document.querySelectorAll('.sd-stepper')) {
    for (let i = 0; i < 3; i++) { s.querySelector('[data-a="next"]').click(); await new Promise(r => setTimeout(r, 30)); }
    s.querySelector('[data-a="reset"]').click();
  }
  return { runs: out, diffs, diagErr, viz: document.querySelectorAll('.viz-card').length, qa: document.querySelectorAll('details.qa').length };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
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
        mods = page.evaluate("Object.fromEntries(COURSE.modules.map(m => [m.id, m.lessons.map(l => l.id)]))")
        sel = []
        for a in args:
            if a.startswith("module:"): sel += mods.get(a[7:], [])
            else: sel += [i for i in ids if i == a or (a.endswith("*") and i.startswith(a[:-1]))]
        ids = [i for i in ids if i in sel]
    bad = 0
    for lid in ids:
        errors.clear()
        page.goto(BASE + "#/l/" + lid); page.wait_for_timeout(700)
        res = page.evaluate(RUN_ALL, "--live" in flags); page.wait_for_timeout(300)
        fails = [r for r in res["runs"] if not r["ok"]]
        errs = [e for e in errors if "favicon" not in e and "fonts.g" not in e]
        ok = not fails and not errs and not res["diagErr"] and not res["diffs"]
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} {lid}: {len(res['runs'])} runs, {res['viz']} visuals, {res['qa']} Q&As")
        if "--show" in flags:
            for r in res["runs"]:
                if r.get("shown"): print(f"   [html output] {r['title']!r}:\n" + "\n".join("      " + l for l in r["shown"].splitlines()))
        for f in fails:
            print(f"   ✕ {f['title']!r}: {f['why']}")
            if f["got"]: print("\n".join("     " + l for l in f["got"].splitlines()[:12]))
        for d in res["diffs"]:
            print(f"   ≠ live run differs from Node: {d['title']!r}")
            print("     want: " + d["want"].replace("\n", "\n           "))
            print("     got:  " + d["got"].replace("\n", "\n           "))
        for e in errs[:10]: print("   ! " + e[:300])
        for d in res["diagErr"]: print("   ! " + d[:300])
        if shots:
            for i, c in enumerate(page.query_selector_all(".viz-card")):
                c.scroll_into_view_if_needed(); page.wait_for_timeout(120)
                c.screenshot(path=f"{shots}/{lid}-{i}.png")
    print(f"\n{len(ids)} lessons, {bad} with problems")
    b.close()
    sys.exit(1 if bad else 0)
