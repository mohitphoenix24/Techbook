"""End-to-end test for TaskPal: a real browser, the real FastAPI app, a real SQLite file and the real Vite front end.

TaskPal talks to the real Claude, so this test starts the server WITHOUT an API key. It checks everything that does not
need a model: the task board, the tick-boxes, the 'no key' banner and the honest error when you try to chat anyway.

    python3 projects/tools/e2e_task_pal.py [--shots DIR]
"""
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

from e2e_common import CODE, Checks, stack

sys.path.insert(0, str(CODE / "task-pal" / "backend"))
from app.store import TaskStore  # noqa: E402  (the project's own store, to seed the database)

shots = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
if shots:
    shots.mkdir(parents=True, exist_ok=True)
c = Checks()


def shot(page, name):
    if shots:
        page.screenshot(path=str(shots / f"task-pal-{name}.png"))


db = str(Path(tempfile.mkdtemp(prefix="pl-tp-")) / "tasks.db")
store = TaskStore(db)
today = date.today()
iso = lambda d: d.isoformat()
store.add("Pay the electricity bill", iso(today - timedelta(days=2)), "high")
store.add("Book train tickets", iso(today))
store.add("Call mum", iso(today + timedelta(days=3)))
store.add("Buy milk")
store.add("Renew passport", iso(today - timedelta(days=30)), "low")
store.update(5, done=True)

with stack("task-pal", env={"DATABASE_PATH": db, "ANTHROPIC_API_KEY": ""}) as url, sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    page = browser.new_page(viewport={"width": 1280, "height": 860})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.locator(".task").first.wait_for()

    c.ok("No API key" in page.locator(".banner").inner_text(), "a banner says there is no API key and what to do")
    c.ok("claude-opus-5-5" in page.locator(".pill").inner_text(), "the model name is shown")
    groups = [h.text_content().rsplit(" ", 1)[0].strip() for h in page.locator(".group h3").all()]
    c.ok(groups == ["Overdue", "Today", "Upcoming", "No date", "Done"], f"the board is grouped by date: {groups}")
    c.ok(page.locator(".group.overdue .task").count() == 1 and "Pay the electricity bill" in page.locator(".group.overdue").inner_text(), "the overdue task is in Overdue")
    c.ok(page.locator(".group.overdue .late").count() == 1, "its date is flagged as late")
    c.ok(page.locator(".group.overdue .flag-high").count() == 1, "a high priority is flagged")
    c.ok("Tomorrow" not in page.locator(".group.today").inner_text() and "Today" in page.locator(".group.today .meta").inner_text(), "today's task says Today")
    c.ok(page.locator(".group.done .task.is-done").count() == 1, "the finished task is struck through in Done")
    shot(page, "1-board-no-key")

    # tick-box: the same store the agent uses
    page.get_by_role("checkbox", name='Mark "Buy milk" done').click()
    page.locator(".group.done .task", has_text="Buy milk").wait_for()
    c.ok(page.locator(".group.someday").count() == 0, "ticking a task moves it to Done (the No date section disappears)")
    page.reload()
    page.locator(".task").first.wait_for()
    c.ok(page.locator(".group.done .task").count() == 2, "and it is still done after a reload")
    page.get_by_role("checkbox", name='Mark "Buy milk" not done').click()
    page.locator(".group.someday .task", has_text="Buy milk").wait_for()
    c.ok(True, "unticking brings it back")

    # chatting without a key: an honest error, not a pretend answer
    page.get_by_role("textbox", name="Message").fill("add a task to water the plants")
    page.keyboard.press("Enter")
    page.locator(".flag.error").wait_for(timeout=5000)
    c.ok("ANTHROPIC_API_KEY is not set" in page.locator(".flag.error").inner_text(), "chatting without a key shows a clear error")
    c.ok(page.locator(".exchange .question").inner_text() == "add a task to water the plants", "the question is kept in the thread")
    c.ok(page.get_by_role("button", name="Send").is_visible() and page.get_by_role("textbox", name="Message").input_value() == "", "the composer is ready again")
    c.ok(page.locator(".task", has_text="water the plants").count() == 0, "nothing was added behind our back")
    shot(page, "2-no-key-error")
    page.get_by_role("button", name="Clear chat").click()
    c.ok(page.locator(".welcome .chip").count() == 5, "Clear chat brings back the examples")
    page.locator(".chip").first.click()
    page.locator(".flag.error").wait_for(timeout=5000)
    c.ok(True, "an example chip sends its text")

    # a phone
    page.set_viewport_size({"width": 390, "height": 860})
    page.wait_for_timeout(300)
    c.ok(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal scrolling on a phone")
    shot(page, "3-mobile")

    c.ok(not errors, f"no console errors {errors[:2]}")
    browser.close()

c.finish()
