"""Turning code and questions into search terms.

A search engine built for prose sees `backoff_delay` as one strange word. A person asking "where is the backoff delay
calculated?" means the two words it contains. So identifiers are split at underscores and at camelCase boundaries, and
the whole identifier is kept as well, so both a loose question and an exact name find it.
"""
# region: imports
import re
# endregion: imports

# region: split
IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def split_identifier(word: str) -> list[str]:
    """'backoff_delay' -> ['backoff', 'delay'];  'getUserByID' -> ['get', 'user', 'by', 'id'];  'HTTPServerError' -> ['http', 'server', 'error']."""
    word = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", word)           # fooBar -> foo_Bar
    word = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", word)        # HTTPServer -> HTTP_Server
    return [part.lower() for part in word.split("_") if part]
# endregion: split

# region: tokens
STOPWORDS = set(
    "a an and are as at be by can do does for from how i if in is it its of on or our so than that the their then there this to was we what when where which who why will with you your "
    "self cls def class return if else elif for while import from as try except finally with pass raise none true false not and or in is lambda yield async await "
    "happen happens work works use used using get gets got make makes need want way please should would could also any some many much into".split()
)


def stem(word: str) -> str:
    """A very small plural fold so 'retries' and 'retry', 'jobs' and 'job' meet. Not real stemming: just enough."""
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def code_tokens(text: str, *, split: bool = True) -> list[str]:
    """Search terms for a piece of code, a name or a question. With `split` off, identifiers stay whole (the baseline)."""
    out: list[str] = []
    for match in IDENT.finditer(text):
        word = match.group(0)
        parts = split_identifier(word) if split else [word.lower()]
        if split and len(parts) > 1:
            out.append(word.lower().replace("_", ""))              # the whole identifier, so an exact name is a strong match
        out.extend(parts)
    return [stem(t) for t in out if len(t) > 1 and t not in STOPWORDS]
# endregion: tokens
