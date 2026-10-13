"""Browser test for the GenLab course (needs Playwright + Chrome, and internet for Pyodide).

Serve the repo root first:   python3 -m http.server 8766   (from TechnicalContent/)
Then:   python3 ai-engineering/tools/browser_test.py [lesson-id ... | prefix* | module:<id> | all] [--shots DIR] [--light] [--mobile] [--noruns]

For every lesson it: runs every runnable Python block in Pyodide (reports Python errors, and compares each
block's output with the local run recorded by build.py, as a warning if only floats differ), clicks through
diagram steppers and simulator controls, and collects console errors. --shots saves each visual.
"""
import hashlib, json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("GL_BASE", "http://localhost:8766/ai-engineering/index.html")
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
  if (!noruns) for (const c of document.querySelectorAll('.code-card.runnable')) {
    const b = c._block;
    await c._run();
    for (let i = 0; i < 2400 && c.querySelector('.out-status') && /Running|Loading|Installing/.test(c.querySelector('.out-status').textContent); i++) await new Promise(r => setTimeout(r, 25));
    const st = c.querySelector('.out-status'), text = c.querySelector('.out-body')?.textContent ?? '';
    const ok = (st && st.classList.contains('ok')) || (b.meta['expect-error'] && st && /✕/.test(st.textContent));
    out.push({ ok: !!ok, why: st ? st.textContent : 'no status', code: b.code, shared: !!b.meta.shared, title: b.meta.title || '', exp: !!b.meta['expect-error'], text: text.slice(0, 4000) });
  }
  const diagErr = [...document.querySelectorAll('.box-warn .box-head')].filter(h => /Diagram error/.test(h.textContent)).map(h => h.parentElement.textContent);
  for (const s of document.querySelectorAll('.sd-stepper')) {
    for (let i = 0; i < 3; i++) { s.querySelector('[data-a="next"]').click(); await new Promise(r => setTimeout(r, 30)); }
    s.querySelector('[data-a="reset"]').click();
  }
  // poke every simulator: wiggle ranges/selects, press buttons
  let pokes = 0;
  for (const sim of document.querySelectorAll('.sd-sim')) {
    for (const r of sim.querySelectorAll('input[type=range]')) {
      const lo = +r.min, hi = +r.max;
      for (const f of [0.25, 0.75, 0.5]) { r.value = String(lo + (hi - lo) * f); r.dispatchEvent(new Event('input', { bubbles: true })); pokes++; }
    }
    for (const s of sim.querySelectorAll('select')) {
      for (let i = 0; i < s.options.length; i++) { s.selectedIndex = i; s.dispatchEvent(new Event('change', { bubbles: true })); s.dispatchEvent(new Event('input', { bubbles: true })); pokes++; }
    }
    for (const b of sim.querySelectorAll('button:not([disabled])')) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); pokes++; await new Promise(r => setTimeout(r, 20)); }
    for (const cb of sim.querySelectorAll('input[type=checkbox]')) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); pokes++; }
  }
  const simErr = [...document.querySelectorAll('.sd-sim')].filter(s => !s.textContent.trim()).length;
  return { runs: out, diagErr, pokes, simErr, viz: document.querySelectorAll('.viz-card').length, quizzes: document.querySelectorAll('.quiz').length };
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
    for lid in ids:
        errors.clear()
        page.goto(BASE + "#/l/" + lid); page.wait_for_timeout(700)
        res = page.evaluate(RUN_ALL, "--noruns" in flags); page.wait_for_timeout(200)
        fails = [r for r in res["runs"] if not r["ok"]]
        diffs = []
        for r in res["runs"]:
            if r["ok"] and not r["shared"]:
                want = CACHE.get(key(r["code"], r["exp"]))
                if want and want["o"].strip() != r["text"].strip() and r["text"].strip() != "(no output — add a print() to see results)":
                    diffs.append((r, want["o"]))
        errs = [e for e in errors if "favicon" not in e and "fonts.g" not in e]
        ok = not fails and not errs and not res["diagErr"] and not res["simErr"]
        bad += not ok
        warn += bool(diffs)
        print(f"{'OK ' if ok else 'BAD'} {lid}: {len(res['runs'])} runs, {res['viz']} visuals, {res['pokes']} pokes, {res['quizzes']} quizzes" + (f"  [{len(diffs)} output differences]" if diffs else ""))
        for f in fails:
            print(f"   ✕ {f['title']!r}: {f['why']}")
            print("\n".join("     " + l for l in f["text"].splitlines()[-12:]))
        for r, want in diffs[:3]:
            a, bb = r["text"].strip().splitlines(), want.strip().splitlines()
            for i, (x, y) in enumerate(zip(a + [""] * 99, bb + [""] * 99)):
                if x != y:
                    print(f"   ~ {r['title']!r} line {i + 1}: browser {x[:110]!r}  local {y[:110]!r}"); break
                if i > max(len(a), len(bb)): break
        for e in errs[:10]: print("   ! " + e[:300])
        for d in res["diagErr"]: print("   ! " + d[:300])
        if res["simErr"]: print("   ! an empty simulator was rendered")
        if shots:
            for i, c in enumerate(page.query_selector_all(".viz-card")):
                c.scroll_into_view_if_needed(); page.wait_for_timeout(120)
                c.screenshot(path=f"{shots}/{lid}-{i}.png")
    print(f"\n{len(ids) - bad}/{len(ids)} lessons clean, {warn} with output differences (review)")
    b.close()
    sys.exit(1 if bad else 0)
