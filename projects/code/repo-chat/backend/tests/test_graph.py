from app.rag.chunker import Chunk
from app.rag.graph import CallGraph
from app.rag.index import Hit
from app.rag.retrieve import retrieve


def names(ids, graph):
    return sorted(graph.chunks[i].name for i in ids)


def chunk(name, calls=(), path="a.py", kind="function", start=1):
    return Chunk(f"{path}:{start}-{start + 1}", path, kind, name, start, start + 1, "x", calls=tuple(calls))


# region: graph-tests
def test_calls_between_functions_and_methods_become_edges(sample):
    graph = sample.graph
    failure = next(c for c in sample.chunks if c.name == "Worker._handle_failure")
    assert {"should_retry", "backoff_delay"} <= set(names(graph.calls[failure.id], graph))
    run_once = next(c for c in sample.chunks if c.name == "Worker.run_once")
    assert {"Worker._execute", "Worker._handle_failure", "Storage.claim_next", "Storage.requeue_stale"} <= set(names(graph.calls[run_once.id], graph))
    assert run_once.id in graph.called_by[failure.id]


def test_self_calls_resolve_inside_the_same_class_only():
    graph = CallGraph([chunk("A.run", ["self.step"], kind="method", start=1), chunk("A.step", kind="method", start=5), chunk("B.step", kind="method", start=9)])
    assert names(graph.calls["a.py:1-2"], graph) == ["A.step"]


def test_names_too_generic_to_trust_are_not_followed():
    graph = CallGraph([chunk("caller", ["handlers.get", "items.append"]), chunk("Storage.get", kind="method", start=5), chunk("append", start=9)])
    assert graph.calls["a.py:1-2"] == []


def test_expansion_adds_neighbours_of_the_best_hits_with_a_lower_score_and_a_reason(sample):
    result = retrieve(sample.index, sample.graph, "What does Worker._handle_failure do?", k=3)
    assert result.hits[0].chunk.name == "Worker._handle_failure"
    added = {h.chunk.name: h for h in result.expanded}
    assert {"should_retry", "backoff_delay"} <= set(added)
    assert all(h.expanded and h.score < result.hits[0].score and h.reasons[0] == "called by Worker._handle_failure" for n, h in added.items() if n in ("should_retry", "backoff_delay"))


def test_tests_are_not_pulled_in_as_neighbours_unless_the_question_is_about_tests(sample):
    assert not any(h.chunk.path.startswith("tests/") for h in retrieve(sample.index, sample.graph, "Where is the retry delay calculated?").expanded)
    assert any(h.chunk.path.startswith("tests/") for h in retrieve(sample.index, sample.graph, "Which tests check the retry delay?").context)


def test_expansion_can_be_switched_off(sample):
    assert retrieve(sample.index, sample.graph, "What does Worker._handle_failure do?", expand=False).expanded == []
# endregion: graph-tests
