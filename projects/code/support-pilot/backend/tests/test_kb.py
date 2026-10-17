import pytest

from app.kb import ARTICLE_BY_ID, ARTICLES, INDEX, tokens


# region: kb-tests
@pytest.mark.parametrize("question,expected", [
    ("How long do refunds take to reach my UPI account?", "refunds-timeline"),
    ("can I return something I bought last week", "returns"),
    ("my package says delivered but I did not get it", "tracking"),
    ("I was charged twice", "payment-failed"),
    ("I forgot my password", "account-password"),
    ("item arrived broken and damaged", "damaged"),
    ("how do I cancel before it ships", "cancellation"),
    ("do you have a GST invoice", "invoice-gst"),
])
def test_the_right_article_comes_first(question, expected):
    hits = INDEX.search(question, k=3)
    assert hits and hits[0][0].id == expected


def test_a_question_the_articles_do_not_cover_returns_nothing_rather_than_a_guess():
    assert INDEX.search("does the air fryer have a timer", k=3) == []


def test_plurals_and_stop_words_do_not_matter():
    assert tokens("Refunds are taking the longest") == tokens("refund taking longest")
# endregion: kb-tests


def test_every_article_has_a_unique_id_and_some_text():
    assert len({a.id for a in ARTICLES}) == len(ARTICLES) == len(ARTICLE_BY_ID) and all(len(a.text) > 40 for a in ARTICLES)
