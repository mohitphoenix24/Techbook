from app.rag.chunker import chunk_file, chunk_lines, chunk_markdown, chunk_python, chunk_repo, whole_file_chunks
from app.rag.ingest import SourceFile

from .conftest import make_zip  # noqa: F401


def by_name(chunks):
    return {c.name: c for c in chunks}


# region: chunker-tests
def test_every_function_and_method_becomes_its_own_chunk_with_exact_lines(sample):
    worker = [c for c in sample.chunks if c.path == "jobq/worker.py"]
    names = by_name(worker)
    failure = names["Worker._handle_failure"]
    source = sample.files["jobq/worker.py"].splitlines()
    assert failure.kind == "method" and failure.text == "\n".join(source[failure.start - 1:failure.end])
    assert failure.signature.startswith("def _handle_failure(self, job: Job, error: Exception)")
    assert "retry and giving up" in failure.doc and {"should_retry", "backoff_delay"} <= {c.split(".")[-1] for c in failure.calls}


def test_a_long_class_is_split_into_a_header_and_its_methods_and_a_short_one_is_not(sample):
    storage = [c.name for c in sample.chunks if c.path == "jobq/storage.py"]
    assert "Storage" in storage and "Storage.claim_next" in storage and "Storage.requeue_stale" in storage
    assert [c.kind for c in sample.chunks if c.name == "Metrics"] == ["class"]                       # short: one piece, methods inside it
    assert not any(c.name.startswith("Metrics.") for c in sample.chunks)


def test_the_header_of_a_split_class_does_not_claim_its_methods_calls(sample):
    header = next(c for c in sample.chunks if c.name == "Worker")
    assert header.calls == () and header.end < next(c for c in sample.chunks if c.name == "Worker.__init__").start


def test_chunks_never_overlap_and_cover_all_the_code_in_a_python_file(sample):
    for path in ("jobq/worker.py", "jobq/storage.py", "jobq/config.py"):
        chunks = [c for c in sample.chunks if c.path == path]
        for a, b in zip(chunks, chunks[1:]):
            assert a.end < b.start, (path, a.id, b.id)


def test_decorators_belong_to_the_function_they_decorate():
    code = "import functools\n\n@functools.cache\ndef slow(n):\n    return n\n"
    [func] = chunk_python(SourceFile("a.py", code))                    # one import line is too little to be a chunk of its own
    assert func.start == 3 and func.name == "slow"


def test_code_that_does_not_parse_is_still_searchable():
    chunks = chunk_file(SourceFile("broken.py", "def f(:\n    pass\n" * 3))
    assert chunks and chunks[0].kind == "code"


def test_markdown_is_cut_by_heading_and_named_by_its_heading_path(sample):
    names = [c.name for c in sample.chunks if c.path == "README.md"]
    assert "README.md > jobq > How retries work" in names and "README.md > jobq > Crash recovery" in names


def test_a_heading_with_nothing_under_it_and_text_inside_code_fences_are_handled():
    text = "# Title\n\n## Empty\n\n## Real\nSome text\n\n```bash\n# not a heading\nls\n```\n"
    names = [c.name for c in chunk_markdown(SourceFile("d.md", text))]
    assert names == ["d.md > Title > Real"] and "Empty" not in " ".join(names)


def test_other_languages_fall_back_to_windows_cut_at_blank_lines():
    code = "\n".join(f"line {i}" if i % 15 else "" for i in range(1, 101))
    chunks = chunk_lines(SourceFile("a.js", code), size=30)
    assert len(chunks) >= 3 and all(c.end - c.start < 30 for c in chunks) and chunks[0].start == 1
    assert all(chunks[i].end + 1 == chunks[i + 1].start for i in range(len(chunks) - 1))


def test_the_naive_baseline_is_one_chunk_per_file(sample):
    files = [type("F", (), {"path": p, "text": t}) for p, t in sample.files.items()]
    assert len(whole_file_chunks(files)) == len(sample.files)
# endregion: chunker-tests
