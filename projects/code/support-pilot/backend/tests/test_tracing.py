import pytest

from app.gateway import FakeClock
from app.tracing import Tracer


# region: tracing-tests
def test_spans_nest_and_measure_their_own_duration():
    clock = FakeClock()
    tracer = Tracer(clock)
    with tracer.span("pipeline"):
        clock.advance(0.010)
        with tracer.span("triage", model="m") as s:
            clock.advance(0.250)
            s.set(input_tokens=100, output_tokens=20, cost_usd=0.0004)
        clock.advance(0.040)
    spans = {s["name"]: s for s in tracer.to_list()}
    assert spans["triage"]["parent"] == spans["pipeline"]["id"] and spans["pipeline"]["parent"] is None
    assert spans["triage"]["start_ms"] == 10 and spans["triage"]["duration_ms"] == 250 and spans["pipeline"]["duration_ms"] == 300
    assert tracer.summary() == {"spans": 2, "duration_ms": 300.0, "cost_usd": 0.0004, "tokens": 120, "errors": 0, "stages": ["pipeline"]}


def test_an_error_is_recorded_on_the_span_and_still_raised():
    tracer = Tracer(FakeClock())
    with pytest.raises(ValueError):
        with tracer.span("draft"):
            raise ValueError("model unavailable")
    assert tracer.spans[0].status == "error" and tracer.spans[0].attrs["error"] == "model unavailable" and tracer.summary()["errors"] == 1
# endregion: tracing-tests
