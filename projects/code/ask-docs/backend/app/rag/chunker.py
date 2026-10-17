"""Cut a document into chunks that are small enough to be specific and big enough to make sense.

Pure functions: text in, chunks out, each chunk remembering exactly where it came from (offsets and page), so an
answer can point back to the source.
"""
import re
from dataclasses import dataclass


@dataclass
class Chunk:
    text: str
    start: int                 # offset of the first character in the page text
    end: int                   # offset just after the last character
    page: int
    ordinal: int               # position in the document, starting at 0
    heading: str = ""          # the nearest Markdown heading above the chunk, if any


# region: units
HEADING = re.compile(r"^(#{1,4})\s+(.*\S)\s*$")
SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"“(])")


def split_units(text: str) -> list[tuple[int, int, str]]:
    """Cut text into (start, end, heading) units: one per sentence, never crossing a paragraph break.

    A unit is the smallest piece we are willing to keep together. Chunks are built by packing units.
    """
    units: list[tuple[int, int, str]] = []
    heading = ""
    for para in re.finditer(r"[^\n]+(?:\n(?!\s*\n)[^\n]+)*", text):         # a paragraph: lines up to a blank line
        block, offset = para.group(), para.start()
        m = HEADING.match(block)
        if m:                                                               # a heading is context, not content
            heading = m.group(2)
            continue
        pos = 0
        for s in SENTENCE_END.finditer(block):
            units.append((offset + pos, offset + s.start(), heading))
            pos = s.end()
        units.append((offset + pos, offset + len(block.rstrip()), heading))
    return [u for u in units if u[1] > u[0]]
# endregion: units


def split_long(unit: tuple[int, int, str], text: str, size: int) -> list[tuple[int, int, str]]:
    """A single "sentence" longer than a whole chunk (a table row, a run-on line) is cut at spaces."""
    start, end, heading = unit
    pieces = []
    while end - start > size:
        cut = text.rfind(" ", start, start + size)
        cut = cut if cut > start else start + size
        pieces.append((start, cut, heading))
        start = cut + 1
    pieces.append((start, end, heading))
    return pieces


# region: chunk
def chunk_text(text: str, size: int = 700, overlap: int = 120, page: int = 1, first_ordinal: int = 0) -> list[Chunk]:
    """Pack consecutive units into chunks of at most `size` characters, repeating about `overlap` characters between
    neighbours so that an answer that straddles a boundary still lives whole in one chunk.

    A chunk never mixes two headings: a new section starts a new chunk.
    """
    units = [piece for u in split_units(text) for piece in split_long(u, text, size)]
    chunks: list[Chunk] = []
    current: list[tuple[int, int, str]] = []

    def flush():
        if current:
            start, end = current[0][0], current[-1][1]
            chunks.append(Chunk(text[start:end], start, end, page, first_ordinal + len(chunks), current[0][2]))

    for unit in units:
        too_big = current and unit[1] - current[0][0] > size
        new_section = current and unit[2] != current[0][2]
        if too_big or new_section:
            flush()
            keep: list[tuple[int, int, str]] = []                         # carry the tail of the last chunk over
            if not new_section:
                length = 0
                for u in reversed(current):
                    if length + (u[1] - u[0]) > overlap:
                        break
                    keep.insert(0, u)
                    length += u[1] - u[0]
            current = keep
        current.append(unit)
    flush()
    return chunks
# endregion: chunk
