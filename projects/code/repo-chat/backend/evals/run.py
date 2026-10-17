"""Measure retrieval on labelled questions, and show what each idea in the pipeline is worth.

    python -m evals.run            # the sample repository, every configuration side by side

Retrieval is measured, not the answer text: if the right code is not among what the model is shown, no prompt can save
the answer. Hit@k asks "is a right chunk in the first k?", MRR rewards finding it earlier.
"""
import argparse
from pathlib import Path

from app.rag.chunker import chunk_repo, whole_file_chunks
from app.rag.graph import CallGraph
from app.rag.index import CodeIndex
from app.rag.ingest import SourceFile, read_directory
from app.rag.retrieve import retrieve
from app.repos import SAMPLE_DIR

from .cases import CASES, HELD_OUT


# region: relevant
def relevant(chunk, names: list[str], files_of: dict[str, set[str]]) -> bool:
    """Is this chunk one the question's label asks for? A whole-file chunk counts if the file contains one of the right names."""
    if chunk.name in names:
        return True
    return chunk.kind == "file" and any(chunk.path in files_of.get(n, set()) for n in names)
# endregion: relevant


# region: evaluate
LINE_BUDGET = 120                 # roughly what a person reads before deciding a search result was useless


def evaluate(files: list[SourceFile], cases: list[dict] = CASES, *, whole_files: bool = False, split: bool = True, symbol_boost: bool = True,
             expand: bool = True, k: int = 5) -> dict:
    """Run every question through retrieval with one configuration, and score where the right chunk appears."""
    chunks = whole_file_chunks(files) if whole_files else chunk_repo(files)
    index, graph = CodeIndex(chunks, split_identifiers=split), CallGraph(chunks)
    reference = chunk_repo(files)
    files_of: dict[str, set[str]] = {}
    for c in reference:
        files_of.setdefault(c.name, set()).add(c.path)

    ranks, refused, answerable, budgeted, lines_shown = [], 0, 0, 0, []
    for case in cases:
        result = retrieve(index, graph, case["question"], k=k, expand=expand and not whole_files, symbol_boost=symbol_boost)
        found = result.context
        if not case["names"]:
            refused += not found                          # for an unanswerable question, finding nothing is the right answer
            continue
        answerable += 1
        position = next((i for i, h in enumerate(found, start=1) if relevant(h.chunk, case["names"], files_of)), None)
        ranks.append(position)
        sizes = [h.chunk.end - h.chunk.start + 1 for h in found]
        lines_shown.append(sum(sizes))
        # the model's attention is a budget: was the right chunk found within the first LINE_BUDGET lines of code shown?
        budgeted += position is not None and sum(sizes[:position]) <= LINE_BUDGET
    n = answerable
    hit = lambda cut: round(sum(r is not None and r <= cut for r in ranks) / n, 3)
    return {"questions": n, "hit_at_1": hit(1), "hit_at_3": hit(3), "hit_at_5": hit(5),
            "mrr": round(sum(1 / r for r in ranks if r) / n, 3), "hit_in_budget": round(budgeted / n, 3), "avg_lines": round(sum(lines_shown) / n),
            "missed": [c["question"] for c, r in zip([c for c in cases if c["names"]], ranks) if r is None],
            "refused_correctly": refused, "unanswerable": len(cases) - n, "chunks": len(chunks)}
# endregion: evaluate


# region: ablation
CONFIGURATIONS = [
    ("A. whole files, plain words", dict(whole_files=True, split=False, symbol_boost=False, expand=False)),
    ("B. chunk by function and class", dict(whole_files=False, split=False, symbol_boost=False, expand=False)),
    ("C. + split identifiers", dict(split=True, symbol_boost=False, expand=False)),
    ("D. + a named symbol comes first", dict(split=True, symbol_boost=True, expand=False)),
    ("E. + bring in the call graph", dict(split=True, symbol_boost=True, expand=True)),
]


def ablation(files: list[SourceFile], cases: list[dict] = CASES) -> list[dict]:
    """The same questions, with one more idea switched on each time: a fair way to see what each idea is worth."""
    return [{"name": name, **evaluate(files, cases, **options)} for name, options in CONFIGURATIONS]
# endregion: ablation


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--distractors", help="a folder of other source files to add to the repository, to see how search copes with a bigger one")
    parser.add_argument("--held-out", action="store_true", help="use the questions that were never used to tune the search")
    args = parser.parse_args(argv)
    files = read_directory(Path(SAMPLE_DIR)).files
    if args.distractors:
        extra = [SourceFile(f"extra/{f.path}", f.text) for f in read_directory(Path(args.distractors)).files if f.path.endswith(".py")]
        files = files + extra
        print(f"{len(files)} files ({len(extra)} of them distractors)")
    rows = ablation(files, HELD_OUT if args.held_out else CASES)
    print(f"{'configuration':<36}{'chunks':>7}{'hit@1':>8}{'hit@3':>8}{'hit@5':>8}{'MRR':>7}{'in 120 lines':>14}{'lines shown':>13}{'refused':>9}")
    for r in rows:
        print(f"{r['name']:<36}{r['chunks']:>7}{r['hit_at_1']:>8.0%}{r['hit_at_3']:>8.0%}{r['hit_at_5']:>8.0%}{r['mrr']:>7.2f}{r['hit_in_budget']:>14.0%}{r['avg_lines']:>13}{r['refused_correctly']:>6}/{r['unanswerable']}")
    print("\nStill missed with everything on:", rows[-1]["missed"] or "nothing")


if __name__ == "__main__":
    main()
