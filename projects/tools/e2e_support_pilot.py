"""End-to-end test for SupportPilot: real browser, real FastAPI (offline model, real SQLite), real Vite.

    python3 projects/tools/e2e_support_pilot.py [--shots DIR]
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
        page.screenshot(path=str(shots / f"support-pilot-{name}.png"))


def shot_of(locator, name):
    if shots:
        locator.screenshot(path=str(shots / f"support-pilot-{name}.png"))


def sign_in(page, label):
    page.get_by_role("button", name=label).click()
    page.locator(".topbar .who").wait_for()


def open_ticket(page, text):
    page.locator(".inbox .row", has_text=text).first.click()
    page.locator(".ticket > header h2").wait_for()


def process(page, simulate=None):
    if simulate:
        page.get_by_label("Simulate").select_option(label=simulate)
    page.get_by_role("button", name="Draft a reply", exact=True).or_(page.get_by_role("button", name="Draft again", exact=True)).click()
    page.wait_for_selector(".pipeline[data-phase=done], .pipeline[data-phase=error]", timeout=20000)
    page.wait_for_timeout(250)


def status_of(page):
    return page.locator(".ticket > header .badge").inner_text()


with stack("support-pilot", env={"MOCK_DELAY_MS": "4"}) as url, sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    page = browser.new_page(viewport={"width": 1400, "height": 960})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)

    # 1. signing in
    c.ok(page.get_by_role("button", name="Asha, support agent").is_visible() and page.locator(".inbox").count() == 0, "an anonymous visitor sees only the sign-in screen")
    shot(page, "1-login")
    sign_in(page, "Asha, support agent")
    page.locator(".inbox .row").first.wait_for()
    c.ok("Asha (agent)" in page.locator(".who").inner_text() and page.get_by_role("button", name="Metrics", exact=True).count() == 0, "an agent is signed in and has no Metrics tab")
    c.ok(page.locator(".inbox .row").count() == 18 and "Offline demo model" in page.locator(".pill").inner_text(), "the demo inbox has 18 tickets, and the pill says offline demo model")
    c.ok(page.evaluate("sessionStorage.getItem('supportpilot-token') === 'agent-demo-token'") and not page.evaluate("localStorage.length"), "the token is kept in sessionStorage, not localStorage")

    # 2. the happy path: draft, approve, send
    open_ticket(page, "Headphones not what I expected")
    c.ok(status_of(page) == "New" and page.get_by_role("button", name="Approve", exact=True).count() == 0, "a new ticket has nothing to approve yet")
    process(page)
    stages = page.locator(".pipeline .stage").all_inner_texts()
    c.ok(len(stages) >= 7 and any("Hide personal data" in s for s in stages) and any("Apply the policy" in s for s in stages), "the pipeline shows each stage as it ran")
    page.get_by_test_id("draft-text").wait_for()
    draft = page.get_by_test_id("draft-text").inner_text()
    c.ok("₹4,499" in draft and page.locator(".draft .cite").count() >= 1, "the draft quotes the policy amount and cites help articles as chips")
    c.ok("all clear" in page.locator(".checks h3").inner_text() and page.locator(".checks li.fail").count() == 0, "the guardrail checks all pass")
    c.ok("Refund ₹4,499" in page.locator(".draft .policy").inner_text(), "the policy decision is shown beside the draft")
    c.ok(status_of(page) == "Draft ready" and page.get_by_role("button", name="Send to customer", exact=True).count() == 0, "a draft is ready, and nothing can be sent before it is approved")
    shot(page, "2-draft")
    page.get_by_role("button", name="Approve", exact=True).click()
    page.get_by_role("button", name="Send to customer", exact=True).wait_for()
    c.ok(status_of(page) == "Approved", "approving moves the ticket to Approved")
    page.get_by_role("button", name="Send to customer", exact=True).click()
    page.locator("section.sent").wait_for()
    c.ok(status_of(page) == "Sent" and "₹4,499" in page.locator("section.sent").inner_text(), "sending records the reply and the ticket is Sent")
    page.locator(".audit summary").click()
    c.ok(page.locator(".audit li").count() == 3 and "Asha (agent)" in page.locator(".audit").inner_text(), "the audit trail has three entries, with who did each")

    # 3. a large refund: the agent cannot approve, a team lead can
    open_ticket(page, "Smart watch screen is cracked")
    process(page)
    page.get_by_test_id("draft-text").wait_for()
    c.ok("hidden from the model" in page.locator(".message").inner_text(), "personal details in the ticket are reported as hidden from the model")
    c.ok("Team lead must approve" in page.locator(".draft .policy").inner_text() and status_of(page) == "Needs team lead", "a refund over the limit is flagged for a team lead")
    c.ok(page.get_by_role("button", name="Approve", exact=True).count() == 0 and "team lead has to approve" in page.locator(".draft .note").inner_text(), "the agent has no Approve button and is told why")
    shot_of(page.locator(".draft"), "3-needs-lead")
    page.get_by_role("button", name="Sign out", exact=True).click()
    sign_in(page, "Ravi, team lead")
    c.ok(page.get_by_role("button", name="Metrics", exact=True).is_visible(), "a team lead sees the Metrics tab")
    open_ticket(page, "Smart watch screen is cracked")
    page.get_by_role("button", name="Approve", exact=True).click()
    page.wait_for_function("document.querySelector('.ticket > header .badge')?.textContent === 'Approved'")
    c.ok(True, "the team lead can approve the large refund")

    # 4. a ticket that needs a person
    open_ticket(page, "Order delay!!!")
    process(page)
    c.ok(status_of(page) == "Needs a person" and page.get_by_test_id("draft-text").count() == 0, "a legal threat is escalated, and no draft is written")
    c.ok("did not draft" in page.locator(".ticket .note").inner_text() and page.get_by_role("button", name="Close ticket", exact=True).is_visible(), "the lead is told why and can close it")
    page.get_by_role("button", name="Close ticket", exact=True).click()
    page.wait_for_function("document.querySelector('.ticket > header .badge')?.textContent === 'Closed'")
    c.ok(True, "closing the ticket works")
    open_ticket(page, "Refund request")
    process(page)
    c.ok(status_of(page) == "Needs a person", "text that tries to give the assistant orders is escalated, not obeyed")

    # 5. a draft that stays wrong: guardrails block approval until a person fixes it
    open_ticket(page, "Return face serum")
    process(page, "Draft stays wrong (a person must fix it)")
    page.get_by_test_id("draft-text").wait_for()
    c.ok(page.locator(".checks li.fail").count() >= 2 and "blocking" in page.locator(".checks h3").inner_text(), "the guardrails flag the bad draft")
    c.ok(page.get_by_role("button", name="Approve", exact=True).count() == 0 and "guardrail check is failing" in page.locator(".draft .note").inner_text(), "approval is blocked until the draft is fixed")
    shot_of(page.locator(".draft"), "4-blocked")
    page.get_by_role("button", name="Edit", exact=True).click()
    page.get_by_label("Edit the draft").fill("Hi Tara, order AUR-1012 was delivered on 2026-09-28, which is outside our window, so we cannot offer a refund [kb:returns]. If the item is faulty, please tell us [kb:damaged].")
    page.get_by_role("button", name="Save and re-check", exact=True).click()
    page.get_by_role("button", name="Approve", exact=True).wait_for()
    c.ok("edited by" in page.locator(".draft header").inner_text() and page.locator(".checks li.fail").count() == 0, "after a person edits the draft, the checks pass and Approve returns")
    page.get_by_role("button", name="Reject", exact=True).click()
    page.get_by_label("Reason for rejecting").fill("Not needed, handling by phone")
    page.get_by_role("button", name="Reject draft", exact=True).click()
    page.wait_for_function("document.querySelector('.ticket > header .badge')?.textContent === 'Rejected'")
    c.ok(True, "a draft can be rejected, with a reason for the audit log")

    # 6. a provider that fails: retried, and visible in the trace
    open_ticket(page, "Where is my order?")
    process(page, "Provider hiccups (retries)")
    c.ok("took 3 tries" in page.locator(".pipeline").inner_text(), "a flaky provider is retried by the gateway, and the pipeline says so")
    page.locator(".tracebox summary").click()
    page.locator(".trace li").first.wait_for()
    c.ok(page.locator(".trace li").count() >= 8 and "3 tries" in page.locator(".trace").inner_text(), "the trace waterfall lists every step, including the retries")
    shot(page, "5-trace")

    # 7. metrics
    page.get_by_role("button", name="Metrics", exact=True).click()
    page.locator(".metrics .card").first.wait_for()
    c.ok("Tickets" in page.locator(".metrics").inner_text() and "Model calls" in page.locator(".metrics").inner_text(), "the team lead's metrics show the queue, the copilot and the gateway")
    shot(page, "6-metrics")

    # 8. the customer's side
    page.get_by_role("button", name="Customer form", exact=True).click()
    page.get_by_label("Your email").fill("new.customer@example.com")
    page.get_by_label("Subject").fill("Parcel not received yet")
    page.get_by_label("How can we help?").fill("Order AUR-1003 has not arrived, please check what is going on.")
    page.get_by_role("button", name="Send", exact=True).click()
    page.get_by_role("status").wait_for()
    c.ok("Thank you" in page.get_by_role("status").inner_text(), "a customer can submit a ticket through the public form")
    page.get_by_role("button", name="Inbox", exact=True).click()
    page.get_by_placeholder("Search subject or email").fill("Parcel not received")
    page.locator(".inbox .row").first.wait_for()
    c.ok(page.locator(".inbox .row").count() == 1 and "New" in page.locator(".inbox .row").first.inner_text(), "the new ticket appears in the inbox")

    # 9. a phone
    page.set_viewport_size({"width": 390, "height": 860})
    page.wait_for_timeout(300)
    c.ok(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no horizontal scrolling on a phone")
    page.get_by_role("button", name="← Inbox", exact=True).click()                       # a ticket was still open: go back to the list
    c.ok(page.locator(".pane").is_hidden() and page.locator(".inbox .row").first.is_visible(), "on a phone the list and a ticket take turns on the screen")
    page.locator(".inbox .row").first.click()
    page.get_by_role("button", name="← Inbox", exact=True).wait_for()
    c.ok(page.locator(".inbox").is_hidden(), "a ticket opens full-screen with a way back")
    shot(page, "7-mobile")

    # 10. an expired or wrong token sends you back to sign in
    page.evaluate("sessionStorage.setItem('supportpilot-token', 'wrong')")
    page.reload()
    page.get_by_role("button", name="Asha, support agent").wait_for()
    c.ok(page.evaluate("sessionStorage.getItem('supportpilot-token')") is None, "a wrong token is discarded and the sign-in screen returns")

    c.ok(not errors, f"no console errors {errors[:2]}")
    browser.close()

c.finish()
