"""End-to-end test for AskDocs: real browser, real FastAPI (offline model, built-in embedder), real Vite.

    python3 projects/tools/e2e_ask_docs.py [--shots DIR]
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
        page.screenshot(path=str(shots / f"ask-docs-{name}.png"))


def ask(page, question):
    before = page.locator(".turn").count()
    page.get_by_role("textbox", name="Question").fill(question)
    page.keyboard.press("Enter")
    page.wait_for_function("(n) => { const t = document.querySelectorAll('.turn'); return t.length === n + 1 && t[n].dataset.status === 'done'; }", arg=before, timeout=15000)


with stack("ask-docs", env={"MOCK_DELAY_MS": "5"}) as url, sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)

    page.get_by_role("button", name="Load sample documents").wait_for()
    c.ok(page.get_by_role("textbox", name="Question").is_disabled(), "the question box is disabled with no documents")
    shot(page, "1-empty")

    # 1. samples: queued -> embedding -> ready (the list polls itself)
    page.get_by_role("button", name="Load sample documents").click()
    page.locator(".library li").first.wait_for()
    c.ok(page.locator(".library li").count() == 3, "three sample documents appear")
    page.wait_for_function("document.querySelectorAll('.library li.ready').length === 3", timeout=30000)
    c.ok("passages" in page.locator(".library li.ready .meta").first.inner_text(), "each document ends 'ready' with its passage count")
    c.ok("3 documents ready" in page.locator(".topbar").inner_text(), "the header counts ready documents")
    c.ok("hash-1024" in page.locator(".foot").inner_text(), "the footer names the embedder")

    # 2. an answerable question, with clickable citations
    page.locator(".chip", has_text="How many days of annual leave").click()
    page.locator(".answer .cite").first.wait_for(timeout=15000)
    page.get_by_role("button", name="Ask", exact=True).wait_for()
    answer = page.locator(".answer").first.inner_text()
    c.ok("24 days" in answer, "the answer contains the fact")
    c.ok(page.locator(".answer .cite").count() >= 1, "the answer has citation buttons")
    c.ok(page.locator(".source").count() >= 3, "the sources are listed")
    c.ok(page.locator(".source.cited").count() >= 1, "cited sources are marked")
    c.ok(page.locator(".source mark").count() > 3, "question words are highlighted inside the sources")
    shot(page, "2-answer")

    # 3. a citation scrolls to its source; a source opens in context
    page.locator(".answer .cite").first.click()
    c.ok(page.locator(".source.flash").count() == 1, "clicking a citation flashes its source")
    page.locator(".source.cited").first.get_by_role("button", name="Open in context").click()
    page.get_by_role("dialog").wait_for()
    c.ok("24 days of paid annual leave" in page.locator(".dialog .focus").inner_text(), "the dialog shows the passage")
    c.ok(page.locator(".dialog .dim").count() >= 1, "and the text around it")
    shot(page, "3-context")
    page.keyboard.press("Escape")
    c.ok(page.get_by_role("dialog").count() == 0, "Escape closes the dialog")

    # 4. retrieval details
    page.get_by_label("Retrieval details").check()
    c.ok("vector #" in page.locator(".scores").first.inner_text() and "keyword #" in page.locator(".scores").first.inner_text(), "retrieval details show both ranks")
    shot(page, "4-details")
    page.get_by_label("Retrieval details").uncheck()

    # 5. follow-up question is rewritten
    ask(page, "And sick leave?")
    c.ok("Searched for:" in page.locator(".rewrite").last.inner_text() and "annual leave" in page.locator(".rewrite").last.inner_text(), "a follow-up shows what was really searched for")
    c.ok("8 days per year" in page.locator(".answer").last.inner_text(), "and the follow-up is answered")

    # 6. out of scope is refused, honestly
    ask(page, "What is the capital of France?")
    last = page.locator(".turn").last
    c.ok("couldn't find that in your documents" in last.inner_text(), "an unrelated question is refused")
    c.ok(last.locator(".source").count() == 0 and last.locator(".cite").count() == 0, "with no sources and no citations")
    shot(page, "5-refused")

    # 7. limit the search to chosen documents
    page.locator(".library li", has_text="Employee Handbook").get_by_role("checkbox").uncheck()
    ask(page, "How many days of annual leave do I get?")
    c.ok("couldn't find that" in page.locator(".turn").last.inner_text(), "with the handbook switched off, its facts are not found")
    page.locator(".library li", has_text="Employee Handbook").get_by_role("checkbox").check()
    ask(page, "How many days of annual leave do I get?")
    c.ok("24 days" in page.locator(".answer").last.inner_text(), "switching it back on finds them again")

    # 8. search modes
    page.locator(".options select").select_option("keyword")
    ask(page, "How long does the battery last?")
    c.ok("8 hours" in page.locator(".answer").last.inner_text(), "keyword mode answers")
    page.locator(".options select").select_option("hybrid")

    # 9. upload your own document
    page.set_input_files("input[type=file]", {"name": "pet-policy.md", "mimeType": "text/markdown",
                                              "buffer": b"# Pet policy\n\nDogs are allowed in the office on Fridays. Cats are allowed every day. All pets must be vaccinated."})
    page.wait_for_function("document.querySelectorAll('.library li.ready').length === 4", timeout=20000)
    c.ok(page.locator(".library li", has_text="Pet policy").count() == 1, "an uploaded document appears with its own title")
    ask(page, "Must pets be vaccinated?")
    c.ok("All pets must be vaccinated" in page.locator(".answer").last.inner_text(), "and it can be asked about at once")
    page.locator(".library li", has_text="Pet policy").get_by_role("button", name="Delete Pet policy").click()
    page.wait_for_function("document.querySelectorAll('.library li').length === 3")
    ask(page, "Must pets be vaccinated?")
    c.ok("couldn't find that" in page.locator(".turn").last.inner_text(), "deleting a document removes its knowledge")

    # 10. a bad upload
    page.set_input_files("input[type=file]", {"name": "x.exe", "mimeType": "application/octet-stream", "buffer": b"MZ"})
    page.locator(".library .flag.error").wait_for(timeout=5000)
    c.ok("Upload a .pdf" in page.locator(".library .flag.error").inner_text() or "Upload a" in page.locator(".library .flag.error").inner_text(), "an unsupported file gets a clear message")

    # 11. phone
    page.set_viewport_size({"width": 390, "height": 860})
    page.wait_for_timeout(300)
    c.ok(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal scrolling on a phone")
    page.get_by_role("button", name="Show documents").click()
    page.wait_for_timeout(300)
    shot(page, "6-mobile")

    c.ok(not errors, f"no console errors {errors[:2]}")
    browser.close()

c.finish()
