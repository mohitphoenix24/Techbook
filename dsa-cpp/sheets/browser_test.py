#!/usr/bin/env python3
"""Browser test for DSA Sheets (Playwright + system Chrome). Serve the repo root first:

    python3 -m http.server 8766        (from the repo root)
    python3 dsa-cpp/sheets/browser_test.py [--only=id,id] [--shots=DIR] [--theme=dark|light] [--mobile]

For every lesson that is ready it: opens the page, plays every frame of every test case
(timeline jumps, so each state is rendered), runs the JS solution and the C++ solution on
every case (C++ output comes from the build-time verified cache, so no network is needed),
checks that the verdict says "Matches", and fails on any console error or page error.
"""
import json, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8766/dsa-cpp/index.html"
args = sys.argv[1:]
opt = lambda n, d=None: next((a.split("=", 1)[1] for a in args if a.startswith("--" + n + "=")), d)
only = opt("only"); only = only.split(",") if only else None
shots = opt("shots")
theme = opt("theme", "dark")
mobile = "--mobile" in args

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 800} if mobile else {"width": 1500, "height": 950})
    pg = ctx.new_page()
    errors = []
    pg.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type in ("error",) else None)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.goto(BASE); pg.evaluate("t=>localStorage.setItem('techcontent:theme',t)", theme)
    pg.goto(BASE + "#/sheets"); pg.reload(); pg.wait_for_timeout(600)
    ready = pg.evaluate("SHEETS.ready")
    if only: ready = [r for r in ready if r in only]
    print(f"{len(ready)} lessons to test ({theme}{', mobile' if mobile else ''})")
    bad = 0
    for pid in ready:
        pg.goto(f"{BASE}#/sheets/{pid}"); pg.wait_for_timeout(500)
        try:
            pg.wait_for_selector(".lab-grid", timeout=8000)
        except Exception:
            print(f"✕ {pid}: lab did not render"); bad += 1; continue
        n_cases = pg.locator(".case-chip").count() - 1
        frames_total = 0
        for ci in range(n_cases):
            pg.locator(".case-chip").nth(ci).click()
            pg.wait_for_timeout(60)
            nframes = pg.evaluate("document.querySelector('.tl-track input').max") 
            nframes = int(nframes) + 1
            frames_total += nframes
            # jump through every frame
            pg.evaluate("""async () => { const r = document.querySelector('.tl-track input'); const N = +r.max; for (let i = 0; i <= N; i++) { r.value = i; r.dispatchEvent(new Event('input')); await new Promise(res => setTimeout(res, 5)); } }""")
            say = pg.locator(".say").inner_text()
            if "viz-error" in (pg.locator(".sx-host").get_attribute("class") or ""):
                print(f"✕ {pid} case {ci}: visualizer error"); bad += 1
            for lang in ("cpp", "js"):
                pg.locator(f".lang-tabs [data-l={lang}]").click()
                pg.locator(".act-run").click()
                pg.wait_for_selector(".run-out .verdict, .run-out .ro-body.err", timeout=15000)
                v = pg.locator(".run-out .verdict").first
                if v.count() == 0 or "ok" not in (v.get_attribute("class") or ""):
                    print(f"✕ {pid} case {ci} ({lang}): {pg.locator('.run-out').inner_text()[:200]!r}"); bad += 1
        if shots:
            pg.locator("#sh-lab").scroll_into_view_if_needed()
            pg.screenshot(path=f"{shots}/{pid}.png")
        print(f"✓ {pid}: {n_cases} cases, {frames_total} frames, JS + C++ matched")
    print(f"\n{len(errors)} console/page errors")
    for e in errors[:20]: print("  ", e)
    b.close()
    sys.exit(1 if bad or errors else 0)
