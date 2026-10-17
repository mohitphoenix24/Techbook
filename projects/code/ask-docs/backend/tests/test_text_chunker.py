from app.rag.chunker import chunk_text, split_long, split_units
from app.rag.text import stem, tokenize

DOC = """# Leave

Every full-time employee gets 24 days of paid annual leave per year. Leave is credited monthly. You can carry over up to 6 unused days.

Sick leave is 8 days per year. A doctor's note is needed after 2 days.

# Expenses

Business expenses are reimbursed within 10 working days. A receipt is required above ₹500.
"""


def test_tokenizer_lowercases_drops_stop_words_and_stems():
    assert tokenize("The Leaves are credited monthly!") == ["leav", "credit", "monthly"]
    assert stem("days") == "day" and stem("is") == "is" and stem("bed") == "bed"          # short words are left alone
    assert tokenize("A, the, and of") == []


# region: chunker-tests
def test_every_chunk_is_an_exact_slice_of_the_source():
    chunks = chunk_text(DOC, size=200, overlap=50)
    assert len(chunks) >= 3
    for c in chunks:
        assert DOC[c.start:c.end] == c.text and len(c.text) <= 200
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))


def test_headings_travel_with_their_chunks_and_sections_never_mix():
    chunks = chunk_text(DOC, size=400, overlap=0)
    assert {c.heading for c in chunks} == {"Leave", "Expenses"}
    assert all("Business expenses" not in c.text for c in chunks if c.heading == "Leave")


def test_neighbouring_chunks_overlap_so_an_answer_is_never_cut_in_half():
    text = " ".join(f"Sentence number {i} is here." for i in range(30))
    a, b = chunk_text(text, size=120, overlap=60)[:2]
    assert a.end > b.start and text[b.start:a.end]              # the end of the first chunk is repeated at the start of the next


def test_a_sentence_longer_than_a_chunk_is_cut_at_spaces():
    pieces = split_long((0, 300, ""), "word " * 60, 100)
    assert len(pieces) >= 3 and all(end - start <= 100 for start, end, _ in pieces)
    assert max(len(c.text) for c in chunk_text("word " * 200, size=100, overlap=0)) <= 100
# endregion: chunker-tests


def test_empty_and_heading_only_text_give_no_chunks():
    assert chunk_text("") == [] and chunk_text("# Just a title\n") == []
    assert split_units("One. Two.") != []


def test_page_numbers_and_ordinals_continue_across_pages():
    first = chunk_text("Page one has a sentence.", page=1)
    second = chunk_text("Page two has another.", page=2, first_ordinal=len(first))
    assert (first[0].page, second[0].page, second[0].ordinal) == (1, 2, 1)
