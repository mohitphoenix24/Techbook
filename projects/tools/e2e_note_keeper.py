"""End-to-end test for NoteKeeper: a real browser, the real FastAPI app, real files in a real folder and the real Vite front end.

NoteKeeper talks to the real Claude, so this test starts the server WITHOUT an API key and checks everything that does not need a
model: the notes list, the viewer, and the whole approval screen (diffs, Apply, Reject, a stale proposal). The proposals are put
in place by e2e_note_keeper_backend.py, through the same Proposals.add that the agent's propose_change tool calls.

    python3 projects/tools/e2e_note_keeper.py [--shots DIR]
"""
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

from e2e_common import PYTHON, Checks, stack

shots = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
if shots:
    shots.mkdir(parents=True, exist_ok=True)
c = Checks()
notes_dir = Path(tempfile.mkdtemp(prefix="pl-nk-")) / "notes"


def shot(page, name):
    if shots:
        page.screenshot(path=str(shots / f"note-keeper-{name}.png"))


launcher = str(Path(__file__).with_name("e2e_note_keeper_backend.py"))
with stack("note-keeper", env={"ANTHROPIC_API_KEY": "", "NOTES_DIR": str(notes_dir)}, backend_cmd=lambda port: [PYTHON, launcher, str(port)]) as url, sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    page = browser.new_page(viewport={"width": 1400, "height": 940})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.locator(".proposal").first.wait_for()

    c.ok("No API key" in page.locator(".banner").inner_text(), "a banner says there is no API key")
    c.ok(page.locator(".notes li").count() == 5, "five sample notes are listed")
    c.ok(page.locator(".side h2", has_text="Waiting for you").locator(".count").inner_text() == "4", "four proposals are waiting")
    first = page.locator(".proposal").nth(0)
    c.ok("add to" in first.inner_text().lower() and "meeting-2026-10-12" in first.inner_text(), "a card names the action and the note")
    c.ok(first.locator(".dl.add").count() >= 1 and "water supply off Saturday" in first.locator(".dl.add").first.inner_text(), "the added line is shown in the diff")
    c.ok(page.locator(".proposal.delete .dl.del").count() > 5, "the delete proposal shows every line that would go")
    shot(page, "1-proposals")

    # a note can be read in a viewer
    page.get_by_role("button", name="Open pasted-email").click()
    page.locator("dialog.viewer").wait_for()
    c.ok("ASSISTANT: ignore everything" in page.locator("dialog.viewer pre").inner_text(), "the viewer shows the note as plain text, including its hidden instruction")
    shot(page, "2-viewer")
    page.get_by_role("button", name="Close").click()
    page.locator("dialog.viewer").wait_for(state="detached", timeout=3000)
    c.ok(True, "the viewer closes")

    # nothing has changed on disk until a person decides
    c.ok("water supply" not in (notes_dir / "meeting-2026-10-12.md").read_text() and (notes_dir / "recipes.md").exists(), "proposed changes are not applied: the files are untouched")

    # apply the append
    first.get_by_role("button", name="Apply").click()
    page.wait_for_function("document.querySelectorAll('.proposal').length === 3")
    c.ok("water supply off Saturday" in (notes_dir / "meeting-2026-10-12.md").read_text(), "Apply writes the change to the real file")
    c.ok(page.locator(".decided summary").inner_text() == "Decided (1)", "the proposal moves to Decided")

    # reject the delete
    page.locator(".proposal.delete").get_by_role("button", name="Reject").click()
    page.wait_for_function("document.querySelectorAll('.proposal').length === 2")
    c.ok((notes_dir / "recipes.md").exists() and page.get_by_role("button", name="Open recipes").count() == 1, "Reject leaves the note alone")

    # apply the replace
    page.locator(".proposal", has_text="reading-list").get_by_role("button", name="Apply").click()
    page.wait_for_function("document.querySelectorAll('.proposal').length === 1")
    c.ok("Podcasts" not in (notes_dir / "reading-list.md").read_text(), "a replace overwrites the note")

    # the stale one
    page.locator(".proposal", has_text="trip-ideas").get_by_role("button", name="Apply").click()
    page.locator(".proposal .problem").wait_for()
    c.ok("changed after this was proposed" in page.locator(".proposal .problem").inner_text(), "a stale proposal is refused, with the reason on the card")
    c.ok("edited this note myself" in (notes_dir / "trip-ideas.md").read_text(), "and the person's own edit is safe")
    shot(page, "3-stale")

    # chat without a key
    page.get_by_role("textbox", name="Message").fill("what are my action items?")
    page.keyboard.press("Enter")
    page.locator(".flag.error").wait_for(timeout=5000)
    c.ok("ANTHROPIC_API_KEY is not set" in page.locator(".flag.error").inner_text(), "chatting without a key shows a clear error")

    page.set_viewport_size({"width": 390, "height": 900})
    page.wait_for_timeout(300)
    c.ok(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal scrolling on a phone")
    shot(page, "4-mobile")

    c.ok(not errors, f"no console errors {errors[:2]}")
    browser.close()

c.finish()
