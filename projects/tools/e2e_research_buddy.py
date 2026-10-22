"""End-to-end test for ResearchBuddy: a real browser, the real FastAPI app and the real Vite front end.

ResearchBuddy talks to the real Claude and to Anthropic's web search, so this test starts the server WITHOUT an API key and checks
everything that does not need them: the page, the 'no key' banner, and the honest error when you try to ask anyway. (The code that
reads search results and builds the cited answer is tested by the back end's own tests.)

    python3 projects/tools/e2e_research_buddy.py [--shots DIR]
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
        page.screenshot(path=str(shots / f"research-buddy-{name}.png"))


with stack("research-buddy", env={"ANTHROPIC_API_KEY": ""}) as url, sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    page = browser.new_page(viewport={"width": 1280, "height": 860})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.locator(".banner").wait_for()

    c.ok("No API key" in page.locator(".banner").inner_text(), "a banner says there is no API key and what to do")
    c.ok("claude-opus-5-5" in page.locator(".pill").first.inner_text(), "the model name is shown")
    c.ok("4 searches per question" in page.locator(".topbar").inner_text(), "the search budget is shown")
    c.ok("one cent" in page.locator(".welcome").inner_text(), "the cost of a search is stated up front")
    c.ok(page.locator(".welcome .chip").count() == 4, "four example questions")
    shot(page, "1-welcome")

    page.get_by_role("textbox", name="Question").fill("who won the match?")
    page.keyboard.press("Enter")
    page.locator(".flag.error").wait_for(timeout=5000)
    c.ok("ANTHROPIC_API_KEY is not set" in page.locator(".flag.error").inner_text(), "asking without a key shows a clear error, not a pretend answer")
    c.ok(page.locator(".exchange .question").inner_text() == "who won the match?", "the question stays in the thread")
    c.ok(page.locator(".sources").count() == 0 and page.locator(".answer").count() == 0, "no answer or sources appear from nowhere")
    c.ok(page.get_by_role("button", name="Ask", exact=True).is_visible() and page.get_by_role("textbox", name="Question").input_value() == "", "the composer is ready again")
    shot(page, "2-no-key-error")

    page.get_by_role("button", name="Clear chat").click()
    page.locator(".chip").nth(3).click()
    page.locator(".flag.error").wait_for(timeout=5000)
    c.ok(page.locator(".exchange .question").inner_text() == "Who won the most recent Cricket World Cup?", "an example chip sends its own text")

    page.set_viewport_size({"width": 390, "height": 860})
    page.wait_for_timeout(300)
    c.ok(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal scrolling on a phone")
    shot(page, "3-mobile")

    c.ok(not errors, f"no console errors {errors[:2]}")
    browser.close()

c.finish()
