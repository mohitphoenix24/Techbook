from app.config import Settings
from app.llm.mock_client import MockClient
from evals.cases import CASES, HARD_CASES
from evals.run import evaluate


# region: eval-tests
def settings(tmp_path):
    return Settings(llm_provider="mock", mock_delay_ms=0, database_path=str(tmp_path / "x.db"), _env_file=None)


async def test_the_eval_scores_the_whole_pipeline_and_can_tell_when_it_is_wrong(tmp_path):
    report = await evaluate(MockClient(0), settings(tmp_path))
    by_subject = {r["subject"]: r for r in report["cases"]}
    easy = [c["subject"] for c in CASES[: len(CASES) - len(HARD_CASES)]]
    assert all(by_subject[s]["category_ok"] and by_subject[s]["decision_ok"] for s in easy)                 # the demo inbox is solved
    hard = [by_subject[c["subject"]] for c in HARD_CASES]
    assert sum(r["category_ok"] and r["priority_ok"] and r["escalation_ok"] for r in hard) < len(hard)       # the harder ones expose the limits
    assert report["summary"]["cases"] == len(CASES) and report["summary"]["pii_leaks"] == 0


async def test_a_copilot_that_breaks_the_rules_shows_up_in_the_numbers(tmp_path):
    clean = (await evaluate(MockClient(0), settings(tmp_path), CASES[:12]))["summary"]
    stubborn = (await evaluate(MockClient(0), settings(tmp_path), CASES[:12], simulate="stubborn"))["summary"]
    assert clean["drafts_passing_checks"] == 1.0 and clean["revised"] == 0
    assert stubborn["drafts_passing_checks"] < 0.2 and stubborn["revised"] >= 9                             # the guardrails caught what the model wrote
    assert stubborn["pii_leaks"] > 0                                                                        # and the eval counts the leaks that reached a draft
# endregion: eval-tests
