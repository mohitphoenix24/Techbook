"""End-to-end test for Pocket Chat: real browser, real FastAPI (offline mock model), real Vite.

    python3 projects/tools/e2e_pocket_chat.py [--shots DIR]
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
        page.screenshot(path=str(shots / f"pocket-chat-{name}.png"))


with stack("pocket-chat") as url, sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    page = browser.new_page(viewport={"width": 1280, "height": 820})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)

    page.get_by_role("heading", name="How can I help?").wait_for()
    c.ok(page.locator(".chip").count() == 4, "empty state shows four suggestions")
    c.ok(page.locator(".persona select option").count() == 4, "persona picker is filled from the API")
    shot(page, "1-empty")

    # 1. send a message and watch it stream
    page.get_by_role("textbox", name="Message").fill("Hello!")
    page.get_by_role("button", name="Send message").click()
    page.locator(".msg.assistant .caret").wait_for(timeout=5000)
    c.ok(True, "caret appears while streaming")
    page.locator(".msg.assistant .meta .usage").wait_for(timeout=10000)
    text = page.locator(".msg.assistant .prose").inner_text()
    c.ok("offline demo mode" in text, "assistant reply arrived and is complete")
    c.ok(page.locator(".msg.assistant .caret").count() == 0, "caret disappears when done")
    c.ok("in ·" in page.locator(".usage").inner_text(), "usage and cost are shown")
    c.ok(page.locator(".sidebar li").count() == 1, "conversation appears in the sidebar")
    c.ok("Offline demo mode" in page.locator(".provider-pill").inner_text(), "provider pill says offline demo mode")
    shot(page, "2-first-reply")

    # 2. markdown: code block + copy button
    page.get_by_role("textbox", name="Message").fill("write a python function")
    page.keyboard.press("Enter")
    page.locator(".code-block").wait_for(timeout=10000)
    page.locator(".msg.assistant").nth(1).locator(".usage").wait_for(timeout=10000)
    c.ok("def greet" in page.locator(".code-block pre").inner_text(), "markdown code block rendered")
    c.ok(page.locator(".code-head span").first.inner_text() == "python", "code block shows its language")
    shot(page, "3-code")

    # 3. table rendering
    page.get_by_role("textbox", name="Message").fill("compare react and fastapi in a table")
    page.keyboard.press("Enter")
    page.locator(".prose table").wait_for(timeout=10000)
    page.locator(".msg.assistant").nth(2).locator(".usage").wait_for(timeout=10000)
    c.ok(page.locator(".prose table th").count() == 2, "markdown table rendered")

    # 4. stop button keeps the partial answer
    page.get_by_role("textbox", name="Message").fill("give me a plan please")
    page.keyboard.press("Enter")
    page.get_by_role("button", name="Stop generating").wait_for()
    page.wait_for_timeout(120)
    page.get_by_role("button", name="Stop generating").click()
    page.locator(".flag", has_text="Stopped").wait_for(timeout=5000)
    c.ok(True, "Stop marks the answer as partial")
    c.ok(page.get_by_role("button", name="Send message").is_visible(), "send button comes back after stop")
    shot(page, "4-stopped")

    # 5. regenerate replaces the last answer
    before = page.locator(".msg.assistant").count()
    page.get_by_role("button", name="↻ Regenerate").click()
    page.locator(".msg.assistant .usage").last.wait_for(timeout=10000)
    page.wait_for_timeout(300)
    c.ok(page.locator(".msg.assistant").count() == before, "regenerate does not add a second answer")
    c.ok("Stopped" not in page.locator(".msg.assistant").last.inner_text(), "regenerated answer is complete")

    # 6. history persists: reload, open the conversation
    page.reload()
    page.locator(".sidebar li .conv").first.click()
    page.locator(".msg.assistant").first.wait_for()
    c.ok(page.locator(".msg").count() >= 8, f"conversation reloads from the database ({page.locator('.msg').count()} messages)")
    c.ok(page.locator(".msg.assistant .usage").count() >= 3, "stored usage is shown after reload")

    # 7. persona + history memory
    page.get_by_role("button", name="New chat").click()
    page.locator(".persona select").select_option("tutor")
    page.locator(".chip").nth(0).click()
    page.locator(".msg.assistant .usage").wait_for(timeout=10000)
    c.ok("What do you think happens next?" in page.locator(".msg.assistant .prose").inner_text(), "tutor persona changes the system prompt")
    page.get_by_role("textbox", name="Message").fill("do you remember what I said earlier?")
    page.keyboard.press("Enter")
    page.locator(".msg.assistant .usage").nth(1).wait_for(timeout=10000)
    c.ok("Earlier you wrote" in page.locator(".msg.assistant").nth(1).inner_text(), "the server sends earlier messages as context")
    shot(page, "5-tutor")

    # 8. delete
    count = page.locator(".sidebar li").count()
    page.locator(".sidebar li").first.hover()
    page.locator(".sidebar li .del").first.click()
    page.wait_for_timeout(500)
    c.ok(page.locator(".sidebar li").count() == count - 1, "delete removes the conversation")

    # 9. mobile layout
    page.set_viewport_size({"width": 390, "height": 800})
    page.get_by_role("button", name="Show conversations").click()
    page.wait_for_timeout(300)
    c.ok(page.locator(".sidebar").bounding_box()["x"] >= 0, "sidebar slides in on a phone")
    shot(page, "6-mobile")

    c.ok(not errors, f"no console errors {errors[:2]}")
    browser.close()

c.finish()
