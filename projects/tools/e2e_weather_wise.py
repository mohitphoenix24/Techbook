"""End-to-end test for WeatherWise: a real browser, the real FastAPI app and the real Vite front end.

WeatherWise talks to the real Claude, so this test starts the server WITHOUT an API key and checks everything that does not
need a model: the page, the 'no key' banner, and the honest error when you try to ask anyway. (The weather tools themselves
are tested against the real Open-Meteo service by the back end's own tests.)

    python3 projects/tools/e2e_weather_wise.py [--shots DIR]
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from e2e_common import Checks, stack

shots = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
if shots:
    shots.mkdir(parents=True, exist_ok=True)
c = Checks()


def shot(page, name):
    if shots:
        page.screenshot(path=str(shots / f"weather-wise-{name}.png"))


with stack("weather-wise", env={"ANTHROPIC_API_KEY": ""}) as url, sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    page = browser.new_page(viewport={"width": 1280, "height": 860})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.locator(".banner").wait_for()

    c.ok("No API key" in page.locator(".banner").inner_text(), "a banner says there is no API key and what to do")
    c.ok("claude-opus-5-5" in page.locator(".pill").first.inner_text(), "the model name is shown")
    c.ok("Open-Meteo" in page.locator(".topbar").inner_text(), "the weather source is credited")
    c.ok(page.locator(".welcome .chip").count() == 4, "four example questions")
    shot(page, "1-welcome")

    page.get_by_role("textbox", name="Message").fill("Do I need an umbrella in Pune?")
    page.keyboard.press("Enter")
    page.locator(".flag.error").wait_for(timeout=5000)
    c.ok("ANTHROPIC_API_KEY is not set" in page.locator(".flag.error").inner_text(), "asking without a key shows a clear error, not a pretend answer")
    c.ok(page.locator(".exchange .question").inner_text() == "Do I need an umbrella in Pune?", "the question stays in the thread")
    c.ok(page.locator(".forecast").count() == 0, "no forecast card appears from nowhere")
    c.ok(page.get_by_role("button", name="Ask", exact=True).is_visible() and page.get_by_role("textbox", name="Message").input_value() == "", "the composer is ready again")
    shot(page, "2-no-key-error")

    page.get_by_role("button", name="Clear chat").click()
    page.locator(".chip").nth(1).click()
    page.locator(".flag.error").wait_for(timeout=5000)
    c.ok(page.locator(".exchange .question").inner_text() == "Compare Mumbai and Delhi for the weekend", "an example chip sends its own text")

    page.set_viewport_size({"width": 390, "height": 860})
    page.wait_for_timeout(300)
    c.ok(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal scrolling on a phone")
    shot(page, "3-mobile")

    c.ok(not errors, f"no console errors {errors[:2]}")
    browser.close()

c.finish()
