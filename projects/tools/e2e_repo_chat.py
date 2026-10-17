"""End-to-end test for RepoChat: real browser, real FastAPI (offline summariser), real Vite.

    python3 projects/tools/e2e_repo_chat.py [--shots DIR]
"""
import io
import sys
import tempfile
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

from e2e_common import Checks, stack

shots = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
if shots:
    shots.mkdir(parents=True, exist_ok=True)
c = Checks()


def shot(page, name):
    if shots:
        page.screenshot(path=str(shots / f"repo-chat-{name}.png"))


def make_zip(files: dict[str, str]) -> str:
    path = Path(tempfile.mkdtemp()) / "payments.zip"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        for name, text in files.items():
            z.writestr(name, text)
    path.write_bytes(buffer.getvalue())
    return str(path)


def ask(page, question):
    before = page.locator(".turn").count()
    page.get_by_role("textbox", name="Question").fill(question)
    page.keyboard.press("Enter")
    page.wait_for_function("(n) => { const t = document.querySelectorAll('.turn'); return t.length === n + 1 && t[n].dataset.status !== 'working'; }", arg=before, timeout=20000)
    return page.locator(".turn").last


with stack("repo-chat", env={"MOCK_DELAY_MS": "6"}) as url, sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)

    # 1. the built-in repository
    page.get_by_test_id("repo-stats").wait_for()
    c.ok("14 files" in page.get_by_test_id("repo-stats").inner_text() and "chunks" in page.get_by_test_id("repo-stats").inner_text(), "the sample repository is indexed and its size is shown")
    c.ok(page.get_by_role("button", name="jobq", exact=False).count() >= 1 or page.locator(".tree .folder").count() >= 3, "the file tree lists the folders")
    c.ok("Offline demo model" in page.locator(".pill").inner_text(), "the pill says offline demo model")
    shot(page, "1-start")

    # 2. an answer with clickable citations
    page.locator(".chip", has_text="retry delay").click()
    page.wait_for_function("document.querySelector('.turn')?.dataset.status === 'done'", timeout=20000)
    turn = page.locator(".turn").last
    answer = turn.get_by_test_id("answer").inner_text()
    c.ok("backoff_delay" in answer, "the answer names the function that computes the delay")
    c.ok(turn.locator(".cite.valid").count() >= 1 and turn.locator(".cite.no_such_file, .cite.bad_lines").count() == 0, "every citation is checked and valid")
    turn.locator(".retrieval summary").click()
    c.ok("backoff_delay" in turn.locator(".retrieval li").first.inner_text() and "matches: retry, delay" in turn.locator(".retrieval li").first.inner_text(), "the evidence panel shows the best match and why it matched")
    c.ok(turn.locator(".retrieval li").count() >= 5, "the evidence panel lists every piece of code the model was shown")
    shot(page, "2-answer")

    # 3. a citation opens the code with the cited lines highlighted
    turn.locator(".cite.valid").first.click()
    page.get_by_test_id("code").wait_for()
    c.ok("retry.py" in page.locator(".viewer header").inner_text(), "clicking a citation opens that file")
    hot = page.locator(".line.hot")
    c.ok(hot.count() == 10 and hot.first.get_attribute("data-line") == "20" and hot.last.get_attribute("data-line") == "29", "exactly the cited lines 20 to 29 are highlighted")
    c.ok("def backoff_delay" in hot.first.inner_text(), "and the first highlighted line is the function's definition")
    c.ok(page.locator(".tree .file.on").inner_text().startswith("retry.py"), "the file tree marks the open file")
    shot(page, "3-code")

    # 4. the call graph
    turn = ask(page, "What does Worker._handle_failure do?")
    turn.locator(".retrieval summary").click()
    c.ok("Worker._handle_failure" in turn.locator(".retrieval li").first.inner_text() and "named in the question" in turn.locator(".retrieval li").first.inner_text(), "a named symbol comes first")
    c.ok(turn.locator(".retrieval li.expanded").count() >= 1 and "from the call graph" in turn.locator(".retrieval").inner_text(), "functions it calls are brought in, labelled 'from the call graph'")
    page.get_by_label("include the code it calls").uncheck()
    turn = ask(page, "What does Worker._handle_failure do?")
    turn.locator(".retrieval summary").click()
    c.ok(turn.locator(".retrieval li.expanded").count() == 0, "switching the call graph off removes them")
    page.get_by_label("include the code it calls").check()
    shot(page, "4-graph")

    # 5. nothing relevant: it says so and never calls the model
    turn = ask(page, "What is the airspeed velocity of an unladen swallow?")
    c.ok("could not find anything" in turn.get_by_test_id("answer").inner_text() and turn.locator(".retrieval").count() == 0 and turn.locator(".usage").count() == 0, "an unanswerable question gets an honest answer, no evidence panel and no model cost")

    # 6. an answer that cites code that does not exist is flagged
    page.get_by_label("Simulate").select_option(label="An answer that cites code that does not exist")
    turn = ask(page, "Where is the retry delay calculated?")
    c.ok(turn.locator(".cite.no_such_file").count() == 1 and turn.locator(".cite.bad_lines").count() == 1, "citations to a missing file and to missing lines are drawn in red")
    c.ok("could not be verified" in turn.locator(".flag").inner_text(), "and a warning says how many could not be verified")
    c.ok(turn.locator(".cite.no_such_file").is_disabled(), "a citation to a file that does not exist cannot be clicked")
    shot(page, "5-flagged")
    page.get_by_label("Simulate").select_option(label="Nothing")

    # 7. open a file from the tree
    folder = page.locator(".tree .folder", has_text="jobq").first
    if folder.get_attribute("aria-expanded") != "true":                    # opening a citation already revealed this folder
        folder.click()
    page.locator(".tree .file", has_text="worker.py").click()
    page.wait_for_function("document.querySelector('.viewer header')?.textContent.includes('worker.py')")
    c.ok(page.locator(".line.hot").count() == 0 and page.locator(".line").count() > 70, "a file opened from the tree is shown whole, with nothing highlighted")

    # 8. upload your own repository
    zip_path = make_zip({"app/payments.py": 'def charge_card(amount):\n    """Charge the customer\'s card for `amount` rupees."""\n    return amount\n', "app/refunds.py": "def refund(order):\n    return order\n", "README.md": "# Payments\nTakes payments."})
    page.get_by_label("Upload a repository ZIP").set_input_files(zip_path)
    page.wait_for_function("document.querySelector('select[aria-label=Repository]')?.selectedOptions[0]?.textContent === 'payments'", timeout=10000)
    c.ok("3 files" in page.get_by_test_id("repo-stats").inner_text(), "an uploaded repository is indexed and selected")
    turn = ask(page, "Where do we charge the card?")
    c.ok("charge_card" in turn.get_by_test_id("answer").inner_text() and turn.locator(".cite.valid").count() >= 1, "questions about the uploaded repository cite its own code")
    turn.locator(".cite.valid", has_text="payments.py:1-3").click()
    page.locator(".line.hot").first.wait_for()                              # the file has loaded and the cited lines are marked
    c.ok(page.locator(".line.hot").count() == 3, "and open its own file with the lines highlighted")
    page.get_by_role("button", name="Remove").click()
    page.wait_for_function("document.querySelector('select[aria-label=Repository]')?.selectedOptions[0]?.textContent === 'jobq (sample)'", timeout=10000)
    c.ok(True, "an uploaded repository can be removed")

    # 9. a hostile ZIP is refused with a clear message
    evil = make_zip({"../../etc/cron.d/evil.py": "boom"})
    page.get_by_label("Upload a repository ZIP").set_input_files(evil)
    page.get_by_role("alert").wait_for()
    c.ok("Unsafe file path" in page.get_by_role("alert").inner_text(), "a ZIP with a path that escapes its folder is refused")
    c.ok(page.locator("select[aria-label=Repository] option").count() == 1, "and nothing was added")

    # 10. phone
    page.set_viewport_size({"width": 390, "height": 860})
    page.wait_for_timeout(300)
    c.ok(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal scrolling on a phone")
    c.ok(page.get_by_role("button", name="Files").is_visible(), "panels become tabs on a phone")
    page.get_by_role("button", name="Files").click()
    page.locator(".tree .file", has_text="README.md").click()
    c.ok(page.locator(".viewer").is_visible(), "opening a file switches to the code tab")
    shot(page, "6-mobile")

    c.ok(not errors, f"no console errors {errors[:2]}")
    browser.close()

c.finish()
