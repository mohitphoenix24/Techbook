"""Turn an uploaded file into plain text. The text is shown to the user BEFORE extraction, so they can fix it."""
import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError


class UnsupportedFile(Exception):
    pass


# region: text-from-file
def text_from_upload(filename: str, content: bytes) -> tuple[str, dict]:
    """Return (text, info). Supports .txt, .md and text-based PDFs. Scanned PDFs have no text layer (they need OCR)."""
    name = (filename or "").lower()
    if name.endswith((".txt", ".md", ".csv")):
        try:
            return content.decode("utf-8"), {"kind": "text"}
        except UnicodeDecodeError:
            return content.decode("latin-1"), {"kind": "text", "note": "decoded as Latin-1"}
    if name.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            pages = [(page.extract_text() or "").strip() for page in reader.pages]
        except (PdfReadError, ValueError) as exc:
            raise UnsupportedFile("That PDF could not be read.") from exc
        text = "\n\n".join(p for p in pages if p)
        if not text:
            raise UnsupportedFile("This PDF has no text layer (it looks like a scan). Run OCR on it first, or paste the text.")
        return text, {"kind": "pdf", "pages": len(pages)}
    raise UnsupportedFile("Upload a .txt, .md or .pdf file.")
# endregion: text-from-file
