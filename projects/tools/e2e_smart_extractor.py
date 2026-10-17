"""End-to-end test for Smart Extractor: real browser, real FastAPI (offline model), real Vite.

    python3 projects/tools/e2e_smart_extractor.py [--shots DIR]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "code" / "smart-extractor" / "backend"))
from playwright.sync_api import sync_playwright

from e2e_common import Checks, stack

shots = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
if shots:
    shots.mkdir(parents=True, exist_ok=True)
c = Checks()


def shot(page, name):
    if shots:
        page.screenshot(path=str(shots / f"smart-extractor-{name}.png"))


def load_sample(page, title):
    page.get_by_label("Load a sample").select_option(label=title)


with stack("smart-extractor") as url, sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    page = browser.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    errors = []
    # 422 and 415 are expected: the test deliberately sends a rule-breaking review and an unsupported file
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)

    page.get_by_role("heading", name="Smart Extractor").wait_for()
    page.locator(".types button").first.wait_for()
    c.ok(page.locator(".types button").count() == 3, "three document types from the API")
    c.ok("Offline demo model" in page.locator(".pill").inner_text(), "pill says offline demo model")
    c.ok(page.get_by_role("button", name="Extract", exact=True).is_disabled(), "Extract is disabled with no text")
    shot(page, "1-empty")

    # 1. a clean extraction
    load_sample(page, "Stationery invoice (INR, GST)")
    c.ok("Sharma Stationers" in page.get_by_label("Document text").input_value(), "sample fills the textarea")
    page.get_by_role("button", name="Extract", exact=True).click()
    page.locator(".banner.ok").wait_for(timeout=10000)
    c.ok("Right first time" in page.locator(".banner").inner_text(), "banner: valid, right first time")
    c.ok(page.get_by_label("Vendor").input_value() == "Sharma Stationers Pvt Ltd", "vendor field filled")
    c.ok(page.get_by_label("Invoice number").input_value() == "INV-2026-0042", "invoice number filled")
    c.ok(page.get_by_label("Invoice date").input_value() == "2026-10-14", "date field is an ISO date input")
    c.ok(page.get_by_label("Total", exact=True).input_value() == "4861.6", "total filled")
    c.ok(page.locator(".list .item").count() == 3, "three line items")
    c.ok(page.locator(".chip.found").count() > 10, "values are marked 'in the document'")
    shot(page, "2-valid")

    # 2. evidence view
    page.get_by_role("tab", name="Evidence").click()
    c.ok(page.locator("mark").count() > 10, "evidence tab highlights the found values")
    page.get_by_label("Invoice number").hover()
    page.wait_for_timeout(200)
    c.ok(page.locator("mark.focus").count() == 1 and page.locator("mark.focus").inner_text() == "INV-2026-0042", "hovering a field highlights its evidence")
    shot(page, "3-evidence")
    page.get_by_role("tab", name="Text").click()

    # 3. a model mistake that breaks a rule is repaired automatically
    page.get_by_label("Simulate a mistake").select_option(label="Breaks a rule (repaired)")
    page.get_by_role("button", name="Extract", exact=True).click()
    page.locator(".banner.ok", has_text="Fixed automatically").wait_for(timeout=10000)
    c.ok(page.get_by_label("Total", exact=True).input_value() == "4861.6", "the repaired total is correct")

    # 4. an invented value is flagged by grounding
    page.get_by_label("Simulate a mistake").select_option(label="Invents a value (flagged)")
    page.get_by_role("button", name="Extract", exact=True).click()
    page.locator(".banner.warn").wait_for(timeout=10000)
    c.ok("1 value not found" in page.locator(".banner").inner_text(), "banner counts the ungrounded value")
    c.ok(page.locator(".field.warning .chip.warning", has_text="Not in the document").count() == 1, "the invented field is flagged")
    c.ok(page.get_by_label("Invoice number").input_value() == "INV-9999-X", "the invented value is shown, flagged")
    shot(page, "4-flagged")
    page.get_by_label("Simulate a mistake").select_option(label="None")

    # 5. edit, break a rule, get the server's message next to the field, then fix and save
    page.get_by_role("button", name="Extract", exact=True).click()
    page.locator(".banner.ok").wait_for(timeout=10000)
    page.get_by_label("Total", exact=True).fill("1")
    page.get_by_role("button", name="Save corrections").click()
    page.locator(".panel.result-panel .msg.error", has_text="subtotal + tax is 4861.60 but total is 1.00").wait_for(timeout=5000)
    c.ok(True, "a rule that spans several fields is reported for the whole document")
    page.get_by_label("Total", exact=True).fill("4861.6")
    page.get_by_label("Vendor").fill("Sharma Stationers")
    page.get_by_role("button", name="Save corrections").click()
    page.get_by_role("button", name="✓ Review saved").wait_for(timeout=5000)
    c.ok(True, "corrections are saved once they pass the rules")

    # 6. list editing
    page.get_by_role("button", name="Remove Line items 3").click()
    c.ok(page.locator(".list .item").count() == 2, "a line item can be removed")
    page.get_by_role("button", name="＋ Add line item").click()
    c.ok(page.locator(".list .item").count() == 3, "a blank line item can be added")

    # 7. downloads
    with page.expect_download() as d:
        page.get_by_role("button", name="Download CSV").click()
    csv = Path(d.value.path()).read_text()
    c.ok(csv.splitlines()[0].startswith("vendor,invoice_number") and "line_items.description" in csv.splitlines()[0], "CSV has one header row with line item columns")

    # 8. history survives a reload and reopens with the corrections
    page.reload()
    page.locator(".history li").first.wait_for()
    c.ok(page.locator(".history li").count() >= 4, "history lists the extractions")
    c.ok(page.locator(".history em.ok", has_text="reviewed").count() == 1, "the reviewed one is marked")
    page.locator(".history .open", has_text="reviewed").click()
    page.locator(".banner").wait_for()
    c.ok(page.get_by_label("Vendor").input_value() == "Sharma Stationers", "reopening shows the corrected data")
    c.ok(page.get_by_role("button", name="✓ Review saved").is_visible(), "and the saved state")

    # 9. upload a PDF
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "code" / "smart-extractor" / "backend" / "tests"))
    from helpers import make_pdf
    page.set_input_files("input[type=file]", {"name": "inv.pdf", "mimeType": "application/pdf", "buffer": make_pdf(["Invoice No: INV-1", "Total: 100.00"])})
    page.wait_for_function("document.querySelector('textarea.source') && document.querySelector('textarea.source').value.includes('INV-1')", timeout=5000)
    c.ok(True, "a PDF upload fills the text box")
    page.set_input_files("input[type=file]", {"name": "x.exe", "mimeType": "application/octet-stream", "buffer": b"MZ"})
    page.locator(".msg.error", has_text="Upload a .txt").wait_for(timeout=5000)
    c.ok(True, "an unsupported file gets a clear message")

    # 10. other document types
    page.get_by_role("button", name="Meeting notes").click()
    load_sample(page, "Product sync")
    page.get_by_role("button", name="Extract", exact=True).click()
    page.locator(".banner.ok").wait_for(timeout=10000)
    c.ok(page.locator("section[aria-label='Attendees'] .item").count() == 4, "meeting: four attendees")
    c.ok(page.locator("section[aria-label='Action items'] .item").count() == 3, "meeting: three action items")
    c.ok(page.locator("#f-meeting_date").input_value() == "2026-10-12", "meeting: date")
    shot(page, "5-meeting")

    page.get_by_role("button", name="Support email").click()
    load_sample(page, "Charged twice (angry)")
    page.get_by_role("button", name="Extract", exact=True).click()
    page.locator(".banner.ok").wait_for(timeout=10000)
    c.ok(page.locator("#f-category").input_value() == "billing" and page.locator("#f-priority").input_value() == "urgent", "ticket: enums are selects with the right value")
    c.ok(page.locator("#f-sentiment").input_value() == "negative", "ticket: sentiment")
    page.locator("#f-order_id").fill("")
    page.get_by_role("button", name="Clear Customer email").click()
    c.ok("Not in the document" in page.locator(".field", has=page.locator("label", has_text="Customer email")).inner_text(), "clearing a nullable field sets it to null")

    # 11. phone layout
    page.set_viewport_size({"width": 390, "height": 900})
    page.wait_for_timeout(300)
    c.ok(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal scrolling on a phone")
    shot(page, "6-mobile")

    c.ok(not errors, f"no console errors {errors[:2]}")
    browser.close()

c.finish()
