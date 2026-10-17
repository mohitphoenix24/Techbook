from app.config import Settings
from app.llm.mock_client import MockClient
from evals.cases import CASES
from evals.run import evaluate, same_result


# region: eval-test
async def test_the_eval_scores_by_what_the_query_returns(db_path):
    settings = Settings(database_path=db_path, mock_delay_ms=0, _env_file=None)
    report = await evaluate(MockClient(0), settings)
    by_id = {r["id"]: r for r in report["cases"]}

    easy = [c["id"] for c in CASES[:10]]
    assert all(by_id[i]["correct"] for i in easy), [i for i in easy if not by_id[i]["correct"]]
    hard = [c["id"] for c in CASES[10:]]
    assert not any(by_id[i]["correct"] for i in hard)                                         # the eval can tell when the agent is wrong
    assert report["summary"]["execution_accuracy"] == 0.714 and report["summary"]["cases"] == 14


async def test_the_eval_counts_the_errors_an_agent_recovered_from(db_path):
    settings = Settings(database_path=db_path, mock_delay_ms=0, _env_file=None)
    report = await evaluate(MockClient(0), settings, CASES[:10], hints={"simulate_mistake": "wrong_column"})
    assert report["summary"]["execution_accuracy"] == 1.0 and report["summary"]["recovered_from_errors"] == 10
    assert all(r["sql_errors"] == 1 for r in report["cases"])                                 # one mistake each, then fixed


def test_comparison_ignores_column_names_row_order_when_it_does_not_matter_and_float_noise():
    assert same_result([["a", 1.0], ["b", 2.0]], [["b", 2.0001 - 0.0001], ["a", 1.0]], ordered=False)
    assert not same_result([["a", 1.0], ["b", 2.0]], [["b", 2.0], ["a", 1.0]], ordered=True)       # order matters for "top 5"
    assert same_result([["a", 1.0]], [["a", "x", 1.0]], ordered=True)                              # an extra label column is fine
    assert not same_result([["a", 1.0]], [["a", 2.0]], ordered=True)
# endregion: eval-test
