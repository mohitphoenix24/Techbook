"""Run the golden cases through the real pipeline and report how well it does.

    python -m evals.run                    # use whatever model the settings pick (offline mock without a key)
    python -m evals.run --fail-under 0.9   # exit with an error if field accuracy is below 90%: use it in CI
    python -m evals.run --json             # machine-readable output
    python -m evals.run --cases mine.jsonl # your own cases, exported from the app after people review results

Run it before and after every change to a prompt, a schema or a model. If the number drops, you found a regression
before your users did.
"""
import argparse
import asyncio
import json
import sys

from app.config import Settings
from app.doctypes import DOC_TYPES
from app.extract import extract_document
from app.llm import LLMClient, build_llm
from app.scoring import score_case, summarise

from .cases import CASES


# region: run
async def run_evals(llm: LLMClient, cases: list[dict] = CASES, max_repairs: int = 2) -> dict:
    rows, scores = [], []
    for case in cases:
        result = await extract_document(llm, DOC_TYPES[case["doc_type"]], case["text"], max_repairs=max_repairs)
        score = score_case(case["expected"], result.data, ignore=DOC_TYPES[case["doc_type"]].free_text)
        scores.append(score)
        rows.append({
            "id": case["id"], "valid": result.valid, "attempts": result.attempts, "accuracy": round(score.accuracy, 3),
            "ungrounded": sum(1 for e in result.grounding.values() if e["status"] == "missing"),
            "wrong": [{"path": p, "expected": want, "got": got} for p, want, got in score.wrong],
        })
    summary = summarise(scores)
    summary["valid_rate"] = round(sum(r["valid"] for r in rows) / len(rows), 4)
    summary["first_try_rate"] = round(sum(r["attempts"] == 1 and r["valid"] for r in rows) / len(rows), 4)
    return {"summary": summary, "cases": rows}
# endregion: run


def print_report(report: dict) -> None:
    print(f"{'case':<26}{'valid':<7}{'tries':<7}{'accuracy':<10}{'ungrounded':<11}wrong fields")
    for r in report["cases"]:
        wrong = ", ".join(w["path"] for w in r["wrong"][:4]) + (" ..." if len(r["wrong"]) > 4 else "")
        print(f"{r['id']:<26}{str(r['valid']):<7}{r['attempts']:<7}{r['accuracy']:<10.0%}{r['ungrounded']:<11}{wrong}")
    s = report["summary"]
    print(f"\n{s['cases']} cases | field accuracy {s['field_accuracy']:.1%} | exact match {s['exact_match']:.0%} | "
          f"valid {s['valid_rate']:.0%} | right first time {s['first_try_rate']:.0%}")


def load_cases(path: str) -> list[dict]:
    """Cases exported from the app (GET /api/export/eval-cases): one JSON object per line."""
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fail-under", type=float, default=0.0)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--cases", help="a .jsonl file exported from the app; default: the built-in golden cases")
    args = parser.parse_args()
    llm = build_llm(Settings())
    report = asyncio.run(run_evals(llm, load_cases(args.cases) if args.cases else CASES))
    print(json.dumps(report, indent=2, ensure_ascii=False) if args.json else f"model: {llm.name}/{llm.model}\n")
    if not args.json:
        print_report(report)
    if report["summary"]["field_accuracy"] < args.fail_under:
        sys.exit(1)


if __name__ == "__main__":
    main()
