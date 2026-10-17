"""Run labelled tickets through the REAL pipeline and score the result.

    python -m evals.run                    # whichever model your settings choose (the offline model without a key)
    python -m evals.run --fail-under 0.8   # exit with an error below 80% on the headline score: use it in CI

It measures the whole copilot, not only the model: triage, escalation, the policy decision, the guardrails and the cost.
"""
import argparse
import asyncio
import os
import re
import sys
import tempfile

from app.auth import Principal
from app.config import Settings
from app.gateway import Clock
from app.llm.base import LLMClient
from app.llm.factory import build_gateway
from app.pipeline import Deps, process_ticket
from app.redact import find_personal_data
from app.seed import ORDERS
from app.store import Store

from .cases import CASES


# region: score
def score_case(case: dict, events: list[dict]) -> dict:
    """Compare what the pipeline did with what a careful human would conclude."""
    expect = case["expect"]
    stages = {e["name"]: e for e in events if e["type"] == "stage" and e["status"] == "done"}
    triage = stages["triage"]["triage"] if "triage" in stages else {}
    decision = stages["decide"]["decision"] if "decide" in stages else None
    draft = next((e["draft"] for e in events if e["type"] == "draft"), None)
    done = next((e for e in events if e["type"] == "done"), None)
    cited = re.findall(r"\[kb:([a-z0-9-]+)\]", draft["text"]) if draft else []
    return {
        "subject": case["subject"],
        "category_ok": triage.get("category") == expect["category"],
        "priority_ok": triage.get("priority") == expect["priority"],
        "escalation_ok": triage.get("needs_human") == expect["needs_human"],
        "decision_ok": True if expect["needs_human"] else bool(decision) and (decision["action"], decision["amount"], decision["needs_lead"]) == (expect["action"], expect["amount"], expect["needs_lead"]),
        "drafted": draft is not None,
        "checks_ok": None if draft is None else not any(not c["ok"] and c["severity"] == "block" for c in draft["checks"]),
        "citations_ok": None if draft is None else all(c in draft["sources"] for c in cited),
        "pii_leaks": len(find_personal_data(draft["text"])) if draft else 0,
        "revised": any(e["type"] == "stage" and e["name"] == "revise" for e in events),
        "error": next((e["code"] for e in events if e["type"] == "error"), None),
        "cost_usd": done["trace"]["cost_usd"] if done else 0.0, "tokens": done["trace"]["tokens"] if done else 0, "ms": done["trace"]["duration_ms"] if done else 0,
    }
# endregion: score


# region: evaluate
async def evaluate(llm: LLMClient, settings: "Settings", cases: list[dict] = CASES, simulate: str = "none") -> dict:
    """A fresh database per run, so the eval never touches the desk's real tickets."""
    path = os.path.join(tempfile.mkdtemp(), "eval.db")
    store = Store(path)
    store.init(ORDERS, [])
    deps = Deps(store, llm, settings, Clock())
    results = []
    for case in cases:
        ticket_id = store.add_ticket(case["from_email"], case["subject"], case["body"], case.get("channel", "email"))
        events = [e async for e in process_ticket(store.get_ticket(ticket_id), deps, Principal("eval", "agent"), simulate)]
        results.append(score_case(case, events))
    n = len(results)
    ratio = lambda key: round(sum(bool(r[key]) for r in results) / n, 3)
    drafted = [r for r in results if r["drafted"]]
    return {"summary": {
        "cases": n, "category_accuracy": ratio("category_ok"), "priority_accuracy": ratio("priority_ok"), "escalation_accuracy": ratio("escalation_ok"),
        "decision_accuracy": ratio("decision_ok"), "drafts": len(drafted),
        "drafts_passing_checks": round(sum(bool(r["checks_ok"]) for r in drafted) / len(drafted), 3) if drafted else None,
        "pii_leaks": sum(r["pii_leaks"] for r in results), "revised": sum(r["revised"] for r in results), "errors": sum(r["error"] is not None for r in results),
        "avg_cost_usd": round(sum(r["cost_usd"] for r in results) / n, 6), "avg_ms": round(sum(r["ms"] for r in results) / n),
    }, "cases": results}
# endregion: evaluate


def print_report(report: dict) -> None:
    print(f"{'ticket':<34}{'cat':<5}{'prio':<6}{'human':<7}{'policy':<8}{'checks'}")
    mark = lambda ok: "yes" if ok else "NO"
    for r in report["cases"]:
        print(f"{r['subject'][:32]:<34}{mark(r['category_ok']):<5}{mark(r['priority_ok']):<6}{mark(r['escalation_ok']):<7}{mark(r['decision_ok']):<8}{'-' if r['checks_ok'] is None else mark(r['checks_ok'])}")
    s = report["summary"]
    print(f"\n{s['cases']} tickets | category {s['category_accuracy']:.0%} | priority {s['priority_accuracy']:.0%} | escalation {s['escalation_accuracy']:.0%} | "
          f"policy decision {s['decision_accuracy']:.0%}\n{s['drafts']} drafts | passing the guardrails {s['drafts_passing_checks']:.0%} | personal data leaked: {s['pii_leaks']} | "
          f"revised by the copilot: {s['revised']} | pipeline errors: {s['errors']} | avg ${s['avg_cost_usd']} and {s['avg_ms']} ms per ticket")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fail-under", type=float, default=0.0, help="exit with an error if the policy-decision accuracy is below this")
    args = parser.parse_args()
    settings = Settings()
    gateway = build_gateway(settings, per_minute=100_000, daily_budget_usd=1e9)      # an eval must not be throttled by the desk's own limits
    print(f"model: {gateway.providers[0].name}/{gateway.model}\n")
    report = asyncio.run(evaluate(gateway.bind("eval"), settings))
    print_report(report)
    if report["summary"]["decision_accuracy"] < args.fail_under or report["summary"]["pii_leaks"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
