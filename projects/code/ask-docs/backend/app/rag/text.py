"""Turning text into tokens. Shared by keyword search, the built-in embedder and the offline model."""
import re

# region: tokenise
STOPWORDS = frozenset("""a an the to of and or in on for with is are was were be been it its your you we our can if at by from this that
these those as when then do does did i my me what how which who whom many much any all about into than so such not no yes will would
should could may might there their they them he she his her has have had also just only more most other some up out over under again""".split())

WORD = re.compile(r"[a-z0-9]+(?:[.'-][a-z0-9]+)*")


def stem(word: str) -> str:
    """A very small stemmer: leave -> leav, leaves -> leav, days -> day. Good enough to match singular and plural."""
    for suffix in ("ing", "ed", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def tokenize(text: str, keep_stopwords: bool = False) -> list[str]:
    """Lower-case words, with stop words removed and a light stem applied."""
    words = WORD.findall(text.lower())
    return [stem(w) for w in words if keep_stopwords or w not in STOPWORDS]
# endregion: tokenise
