from evals.cases import CASES
from evals.run import run_evals
from app.llm.mock_client import MockClient


# region: eval-test
async def test_the_eval_separates_easy_cases_from_hard_ones():
    report = await run_evals(MockClient())
    by_id = {r["id"]: r for r in report["cases"]}

    easy = [c["id"] for c in CASES[:7]]
    assert all(by_id[i]["accuracy"] == 1.0 and by_id[i]["valid"] for i in easy)        # the documents the mock was built for
    hard = [c["id"] for c in CASES[7:]]
    assert all(by_id[i]["accuracy"] < 1.0 for i in hard)                                 # the eval notices when the model is wrong

    s = report["summary"]
    assert s["cases"] == 10 and 0.7 < s["field_accuracy"] < 0.95 and s["exact_match"] == 0.7
    assert not by_id["invoice-prose-layout"]["valid"]                                    # no line items found: invalid after retries
# endregion: eval-test
