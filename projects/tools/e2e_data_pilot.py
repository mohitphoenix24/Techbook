"""End-to-end test for DataPilot: real browser, real FastAPI (offline planner, real SQLite shop), real Vite.

    python3 projects/tools/e2e_data_pilot.py [--shots DIR]
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
        page.screenshot(path=str(shots / f"data-pilot-{name}.png"))


def ask(page, question, wait_done=True):
    before = page.locator(".turn").count()
    page.get_by_role("textbox", name="Question").fill(question)
    page.keyboard.press("Enter")
    if wait_done:
        page.wait_for_function("(n) => { const t = document.querySelectorAll('.turn'); return t.length === n + 1 && t[n].dataset.status !== 'working'; }", arg=before, timeout=20000)
    return page.locator(".turn").last


with stack("data-pilot", env={"MOCK_DELAY_MS": "6"}) as url, sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    page = browser.new_page(viewport={"width": 1400, "height": 960}, accept_downloads=True)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)

    page.locator(".schema details").first.wait_for()
    c.ok(page.locator(".schema details").count() == 4, "the schema panel lists the four tables")
    c.ok("420 rows" in page.locator(".schema").inner_text(), "with their row counts")
    c.ok("Offline demo model" in page.locator(".pill").inner_text(), "pill says offline demo model")
    shot(page, "1-empty")

    # 1. the full agent run for a top-N question
    page.locator(".chip", has_text="top 5 customers").click()
    page.wait_for_function("document.querySelector('.turn')?.dataset.status === 'done'", timeout=20000)
    turn = page.locator(".turn").last
    c.ok("5 steps" in turn.locator(".steps summary").inner_text(), "the steps fold away and say how many there were")
    turn.locator(".steps summary").click()
    c.ok(turn.locator(".step.ok").count() == 5, "five steps, all successful (3 tables looked at, a query, a chart)")
    c.ok("SELECT" in turn.locator(".step .sql").first.inner_text(), "the SQL of the query step is shown")
    c.ok(turn.locator(".tk-keyword").count() > 5, "SQL is syntax-highlighted")
    c.ok("Arjun Kulkarni" in turn.locator(".answer").inner_text() and "₹2,11,881" in turn.locator(".answer").inner_text(), "the answer names the top customer with Indian number grouping")
    c.ok(turn.locator("tbody tr").count() == 5 and "₹2,11,881" in turn.locator("tbody").inner_text(), "the result table has five rows with formatted money")
    c.ok(turn.locator(".chart svg rect").count() == 5, "a bar chart with five bars")
    c.ok("model calls" in turn.locator(".usage").inner_text(), "tokens and cost are shown")
    shot(page, "2-answer")

    # 2. sorting and CSV
    turn.get_by_role("button", name="revenue").click()
    c.ok(turn.locator("th[aria-sort=ascending]").count() == 1 and "₹" in turn.locator("tbody tr").first.inner_text(), "clicking a header sorts the table")
    first_asc = turn.locator("tbody tr").first.inner_text()
    turn.get_by_role("button", name="revenue").click()
    c.ok(turn.locator("th[aria-sort=descending]").count() == 1 and turn.locator("tbody tr").first.inner_text() != first_asc, "clicking again reverses it")
    with page.expect_download() as d:
        turn.get_by_role("button", name="Download CSV").click()
    csv = Path(d.value.path()).read_text()
    c.ok(csv.splitlines()[0] == "name,city,revenue" and len(csv.splitlines()) == 6, "CSV has a header and five rows")

    # 3. a line chart, and an agent that fixes its own mistake
    page.get_by_label("Simulate a mistake").select_option(label="Wrong column (it fixes it)")
    turn = ask(page, "Show revenue by month")
    turn.locator(".steps summary").click()
    c.ok(turn.locator(".step.failed").count() == 1 and turn.locator(".step.ok").count() >= 4, "one query failed and was corrected")
    c.ok("no such column" in turn.locator(".step.failed .problem").inner_text(), "the error from the database is shown")
    c.ok(turn.locator(".chart svg path[fill=none]").count() == 1 and turn.locator(".chart circle").count() == 12, "a line chart with twelve points")
    shot(page, "3-recovered")

    # 4. a destructive query is blocked
    page.get_by_label("Simulate a mistake").select_option(label="Tries to DELETE (blocked)")
    turn = ask(page, "how many cancelled orders are there")
    turn.locator(".steps summary").click()
    c.ok("read-only" in turn.locator(".step.failed .problem").inner_text(), "a DELETE is refused with a clear reason")
    c.ok("31 cancelled orders" in turn.locator(".answer").inner_text(), "and the agent still answers correctly")
    shot(page, "4-blocked")
    page.get_by_label("Simulate a mistake").select_option(label="None")

    # 5. pie, follow-up, unknown question
    turn = ask(page, "How many orders are there by status?")
    c.ok(turn.locator(".pie li").count() == 4, "a pie chart with four slices and a legend")
    ask(page, "What is our total revenue?")
    turn = ask(page, "And by month?")
    c.ok(turn.locator(".chart circle").count() == 12, "a follow-up ('And by month?') uses the conversation")
    turn = ask(page, "What is the meaning of life?")
    c.ok("could not match" in turn.locator(".answer").inner_text() and turn.locator(".step").count() == 0, "an unfamiliar question is not guessed at")

    # 6. Stop
    page.get_by_role("button", name="Clear chat").click()
    page.evaluate("1")
    page.get_by_role("textbox", name="Question").fill("Show revenue by month")
    page.keyboard.press("Enter")
    page.get_by_role("button", name="Stop").wait_for()
    page.get_by_role("button", name="Stop").click()
    page.locator(".flag", has_text="Stopped").wait_for(timeout=5000)
    c.ok(page.get_by_role("button", name="Ask", exact=True).is_visible(), "Stop ends the run and brings the Ask button back")

    # 7. phone
    page.set_viewport_size({"width": 390, "height": 860})
    page.wait_for_timeout(300)
    c.ok(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal scrolling on a phone")
    shot(page, "5-mobile")

    c.ok(not errors, f"no console errors {errors[:2]}")
    browser.close()

c.finish()
