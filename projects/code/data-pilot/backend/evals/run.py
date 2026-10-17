"""Run the golden questions through the REAL agent and score them by execution accuracy.

    python -m evals.run                    # whichever model your settings choose (the offline model without a key)
    python -m evals.run --fail-under 0.8   # exit with an error below 80%: use it in CI

A text-to-SQL agent is judged by what its query RETURNS, not by how the query is written.
"""
import argparse
import asyncio
import sys

from app.agent import run_agent
from app.config import Settings
from app.llm import LLMClient, build_llm
from app.main import ensure_database
from app.sqlguard import run_query
from app.tools import ToolBox

from .cases import CASES


# region: compare
def normalise_rows(rows: list[list], ordered: bool) -> list:
    """Make results comparable: round numbers, and (unless the order matters) ignore the order of rows."""
    cleaned = [tuple(round(v, 2) if isinstance(v, float) else v for v in row) for row in rows]
    return cleaned if ordered else sorted(cleaned, key=repr)


def same_result(golden: list[list], got: list[list], ordered: bool) -> bool:
    """Same values in the same cells. Column NAMES and extra columns are ignored: only the data must match."""
    if len(golden) != len(got):
        return False
    want, have = normalise_rows(golden, ordered), normalise_rows(got, ordered)
    if want == have:
        return True
    # the agent may have returned extra columns (a chart needs a label): accept if every golden column appears in it
    if golden and got and len(got[0]) > len(golden[0]):
        columns = list(zip(*got))
        return all(any(normalise_rows([[v] for v in col], ordered) == normalise_rows([[v] for v in gcol], ordered) for col in columns) for gcol in zip(*golden))
    return False
# endregion: compare


# region: evaluate
async def evaluate(llm: LLMClient, settings: "Settings", cases: list[dict] = CASES, hints: dict | None = None) -> dict:
    rows, correct, steps, tokens, recovered = [], 0, 0, 0, 0
    for case in cases:
        golden = run_query(settings.database_path, case["golden"], 500).rows
        toolbox, last, turns, errors, usage = ToolBox(settings.database_path, 500), None, 0, 0, 0
        async for event in run_agent(llm, toolbox, case["question"], [], max_steps=settings.max_steps, hints=hints):
            if event["type"] == "turn":
                turns += 1
            elif event["type"] == "tool_result" and event["name"] == "run_sql":
                if event["ok"]:
                    last = event["ui"]["rows"]
                else:
                    errors += 1
            elif event["type"] == "done":
                usage = event["usage"]["input_tokens"] + event["usage"]["output_tokens"]
        ok = last is not None and same_result(golden, last, case["ordered"])
        correct += ok
        steps += turns
        tokens += usage
        recovered += ok and errors > 0
        rows.append({"id": case["id"], "correct": ok, "answered": last is not None, "turns": turns, "sql_errors": errors, "tokens": usage})
    n = len(cases)
    return {"summary": {"cases": n, "execution_accuracy": round(correct / n, 3), "answered": round(sum(r["answered"] for r in rows) / n, 3),
                        "avg_turns": round(steps / n, 1), "avg_tokens": round(tokens / n), "recovered_from_errors": recovered}, "cases": rows}
# endregion: evaluate


def print_report(report: dict) -> None:
    print(f"{'case':<22}{'correct':<9}{'turns':<7}{'sql errors':<12}tokens")
    for r in report["cases"]:
        print(f"{r['id']:<22}{('yes' if r['correct'] else 'NO' if r['answered'] else 'no answer'):<9}{r['turns']:<7}{r['sql_errors']:<12}{r['tokens']}")
    s = report["summary"]
    print(f"\n{s['cases']} questions | execution accuracy {s['execution_accuracy']:.0%} | answered {s['answered']:.0%} | "
          f"avg {s['avg_turns']} turns, {s['avg_tokens']} tokens | recovered from errors: {s['recovered_from_errors']}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fail-under", type=float, default=0.0)
    args = parser.parse_args()
    settings = Settings()
    ensure_database(settings.database_path)
    llm = build_llm(settings)
    print(f"model: {llm.name}/{llm.model}\n")
    report = asyncio.run(evaluate(llm, settings))
    print_report(report)
    if report["summary"]["execution_accuracy"] < args.fail_under:
        sys.exit(1)


if __name__ == "__main__":
    main()
