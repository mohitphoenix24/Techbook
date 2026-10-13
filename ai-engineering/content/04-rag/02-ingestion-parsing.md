---
title: Ingestion — Turning Messy Files into Clean Knowledge
level: intermediate
time: 45
summary: Garbage in, garbage out starts here. Loading PDFs, HTML, Office files, tables and images; layout-aware parsing and OCR; cleaning boilerplate; extracting the metadata that powers filtering and citations; deduplication; and incremental updates with content hashes. With runnable HTML cleaning, table conversion, near-duplicate detection and change tracking.
---

Most RAG projects that fail, fail **before** retrieval: a PDF parsed into one jumbled line, a table flattened into nonsense, headers repeated 200 times, scanned pages that came out empty. If the text in your index is wrong, no embedding model can save you. **Spend your first week on ingestion.**

## What can go wrong (and how it shows up)

| Source | Typical damage | Symptom in the answers |
|---|---|---|
| **PDF (digital)** | columns read across, headers/footers mixed in, hyphenated words, tables flattened | answers mix unrelated sentences; wrong numbers |
| **PDF (scanned)** | no text layer at all | document "is empty" to search |
| **HTML pages** | menus, cookie banners, ads, footers, duplicated nav text | irrelevant chunks dominate results |
| **Word / PowerPoint / Excel** | tracked changes, speaker notes, merged cells, hidden sheets | stale or contradictory content |
| **Tables** | structure lost | the model cannot tell which number belongs to which column |
| **Images / charts / diagrams** | content is not text | facts in figures are invisible |
| **Code / notebooks** | comments and code mixed, huge files | poor chunk boundaries |
| **Chat / tickets / email** | threads, quoted replies, signatures | the same text repeated many times |

## Tools by job

| Job | Options |
|---|---|
| General document parsing with layout, tables, reading order | **Docling** ([repo](https://github.com/docling-project/docling)), **Unstructured** ([repo](https://github.com/Unstructured-IO/unstructured)), **LlamaParse** ([repo](https://github.com/run-llama/llama_parse)), cloud services (Textract, Document AI, Azure Document Intelligence) |
| Simple digital PDFs | PyMuPDF, pdfplumber, pypdf |
| OCR for scans | Tesseract, PaddleOCR, cloud OCR, or a **vision-language model** that reads the page image |
| HTML to clean text | trafilatura, readability-style extractors, BeautifulSoup |
| Tables | layout parsers, or send the page image to a VLM and ask for Markdown/JSON |
| Skip text entirely | **visual retrieval** (ColPali-style) embeds page images directly ([paper](https://arxiv.org/abs/2407.01449)) |

A modern shortcut for hard PDFs: send the **page image or PDF to a vision-capable model** and ask for clean Markdown with tables preserved. It costs more per page than a parser but handles messy layouts well. Use it where parsers fail, and validate.

## Clean HTML: runnable example

HTML pages are mostly boilerplate. Strip scripts, styles and navigation; keep headings and body text. The standard library's `html.parser` is enough for a demonstration.

```python run title="Extract readable text from HTML (skip scripts, nav, footers)" level=intermediate
from html.parser import HTMLParser

SKIP = {"script", "style", "nav", "footer", "header", "aside", "form", "noscript"}

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip_depth, self.parts = 0, []
    def handle_starttag(self, tag, attrs):
        if tag in SKIP: self.skip_depth += 1
        elif tag in ("h1", "h2", "h3") and not self.skip_depth: self.parts.append("\n\n" + "#" * int(tag[1]) + " ")
        elif tag in ("p", "li", "br") and not self.skip_depth: self.parts.append("\n")
    def handle_endtag(self, tag):
        if tag in SKIP: self.skip_depth = max(0, self.skip_depth - 1)
    def handle_data(self, data):
        if not self.skip_depth and data.strip(): self.parts.append(data.strip() + " ")

html = """
<html><body>
<nav><a href="/">Home</a> <a href="/shop">Shop</a> <a href="/login">Log in</a></nav>
<h1>Returns and refunds</h1>
<p>You can return unused products within <b>30 days</b> of delivery.</p>
<h2>How to start a return</h2>
<ul><li>Open your order page.</li><li>Click "Return item".</li></ul>
<script>trackPageView();</script>
<footer>© 2026 Acme Inc. Cookie settings. Privacy. Terms.</footer>
</body></html>
"""
p = TextExtractor(); p.feed(html)
text = "".join(p.parts)
print(text.strip())
```

## Tables: preserve the structure

A flattened table like `Plan Price Seats Basic 10 1 Pro 25 5` is unreadable. Convert tables to **Markdown or JSON** (or a sentence per row) so each value stays attached to its column.

```python run title="Make table rows self-contained" level=easy
rows = [["Plan", "Price (USD/mo)", "Seats"], ["Basic", "10", "1"], ["Pro", "25", "5"], ["Team", "60", "20"]]

def to_markdown(rows):
    head, body = rows[0], rows[1:]
    lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    lines += ["| " + " | ".join(r) + " |" for r in body]
    return "\n".join(lines)

def row_sentences(rows, caption):
    head = rows[0]
    return [f"{caption}: " + ", ".join(f"{h} = {v}" for h, v in zip(head, r)) + "." for r in rows[1:]]

print(to_markdown(rows))
print()
for s in row_sentences(rows, "Pricing table"):
    print(s)
```

The second form is excellent for retrieval: each row becomes a chunk that carries its own column names and caption. If you only index the Markdown, a chunk may contain half the table and lose the header.

## Metadata: the quiet superpower

Attach structured metadata to **every chunk**. It enables filtering, access control, citations, freshness and debugging.

| Field | Used for |
|---|---|
| `doc_id`, `source_uri`, `title` | citations, "open the source" links |
| `section` / heading path | context ("Returns > International") and citation |
| `page`, `line range` | precise references |
| `author`, `created`, `updated`, `version` | freshness ranking, "latest policy wins" |
| `doc_type`, `product`, `language`, `region` | filters (only the X200 manual) |
| `acl` (groups or users who may read) | **security**: permission filtering at query time |
| `hash` of content | change detection, deduplication |

```python run title="A document record with metadata and a content hash" level=easy
import hashlib, json

def make_record(doc_id, title, text, **meta):
    return {
        "doc_id": doc_id, "title": title, "text": text,
        "hash": hashlib.sha256(text.encode()).hexdigest()[:12],
        **meta,
    }

rec = make_record("pol-7", "Refund policy", "Refunds are issued within 30 days of delivery.",
                  source="https://example.com/policy", updated="2026-09-01", doc_type="policy",
                  product="X200", acl=["support", "sales"], version=3)
print(json.dumps(rec, indent=2))
```

## Cleaning and deduplication

- **Remove boilerplate** that repeats on every page (headers, footers, legal text, nav) before chunking; otherwise it is embedded hundreds of times and pollutes results.
- **Normalise**: fix encodings, collapse whitespace, de-hyphenate line-broken words (`inter-\nnational` → `international`), standardise bullets and dates.
- **Remove duplicates and near-duplicates**: the same FAQ copied across pages, old versions of a policy, email quote chains. Duplicates crowd out diverse results and give the model conflicting or repeated text.

Near-duplicate detection with **shingling and Jaccard similarity** (MinHash and SimHash are the scalable versions):

```python run title="Find near-duplicate documents with shingles" level=intermediate
import re

def shingles(text, n=3):
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}

def jaccard(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0

docs = {
    "faq-v1": "Returns are accepted within 30 days of delivery. Items must be unused and in original packaging.",
    "faq-v2": "Returns are accepted within 30 days of delivery. Items must be unused and in their original packaging.",
    "shipping": "Standard shipping takes three to five business days. Express shipping arrives next day.",
}
S = {k: shingles(v) for k, v in docs.items()}
names = list(docs)
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        sim = jaccard(S[names[i]], S[names[j]])
        print(f"{names[i]:9} vs {names[j]:9} jaccard={sim:.2f}", "<- near-duplicate" if sim > 0.5 else "")
```

## Incremental updates with content hashes

Re-embedding a whole corpus on every change is slow and costly. Track a **hash per document** and only reprocess what changed; delete vectors for removed documents.

```python run title="Detect added, changed and deleted documents" level=intermediate
import hashlib

def sha(s): return hashlib.sha256(s.encode()).hexdigest()[:10]

indexed = {"a.md": sha("Refund window is 30 days."), "b.md": sha("Shipping takes 3-5 days."), "c.md": sha("Old promo.")}   # what the index currently holds
current = {"a.md": "Refund window is 14 days.",        # changed
           "b.md": "Shipping takes 3-5 days.",         # unchanged
           "d.md": "New: warranty is 2 years."}        # added   (c.md was deleted)

added   = [k for k in current if k not in indexed]
changed = [k for k in current if k in indexed and sha(current[k]) != indexed[k]]
deleted = [k for k in indexed if k not in current]
print("to embed (added):  ", added)
print("to re-embed (changed):", changed)
print("to delete from index: ", deleted)
```

When a document changes, **replace all of its chunks atomically** (delete old chunk ids, insert new) so queries never see a mix of old and new versions.

## Ingestion checklist

1. **Look at the parsed output** for 20 representative documents. Open the actual text, not the file.
2. Check **reading order** in multi-column PDFs, **tables**, **headings preserved**, special characters, languages.
3. Remove boilerplate and **duplicates**.
4. Capture **metadata**, especially source, section, date and **ACLs**.
5. Decide how to handle **images and charts** (caption with a VLM, OCR, or visual embeddings).
6. Use **content hashes** for incremental sync, with deletion handling.
7. Keep the **raw originals** so you can re-parse when your parser improves.
8. Add **tests**: a golden set of documents whose parsed output you compare after each parser change.

```quiz
? Why can a flattened table hurt RAG?
- It is larger
+ The model cannot tell which value belongs to which column
- It cannot be embedded
> Keep headers attached to values: use Markdown, JSON, or one sentence per row.

? What is the benefit of metadata like section, date and ACL on every chunk?
+ Filtering, access control, citations and freshness handling
- Faster embeddings
- Smaller indexes
> Metadata turns a pile of text into a governed knowledge base.

? Why remove repeated headers and footers before chunking?
- They are ugly
+ They are embedded many times and pollute retrieval with irrelevant matches
- The parser requires it
> Boilerplate crowds results and wastes tokens.

? How do you avoid re-embedding the entire corpus after one document changes?
- You cannot
+ Store a content hash per document and re-process only added or changed documents, deleting removed ones
- Use a bigger GPU
> Incremental ingestion keeps costs and latency low.
```

:::problem Users report that the bot quotes old prices. The new price list was uploaded last week. What do you investigate? {level=medium tags="ingestion,freshness"}
List causes along the pipeline.

:::solution Model answer
(1) **Sync**: was the new file detected (hash/mtime) and ingested? check the ingestion logs and the index's `updated` metadata. (2) **Replacement**: were the old document's chunks deleted, or do old and new versions coexist (the old one may rank higher or equal)? (3) **Duplicates**: another page (FAQ, PDF, wiki) still contains the old price. (4) **Parsing**: the new PDF's table may have parsed badly, so the new numbers are not in the text. (5) **Caching**: response or retrieval caches may serve stale answers. (6) **Ranking**: no recency signal; add version/date metadata and prefer the latest. Fix and add a freshness test (known question → expected new price) to CI.
:::
:::

:::keypoints
- Ingestion quality sets the ceiling of your RAG system; inspect parsed text with your own eyes.
- Use layout-aware parsers, OCR or VLMs for hard documents; keep tables structured; extract clean text from HTML.
- Attach rich metadata (source, section, dates, type, ACL, hash) to every chunk.
- Remove boilerplate and (near-)duplicates; version documents.
- Use content hashes for incremental sync, and replace a document's chunks atomically.
:::

:::resources
- [Docling](https://github.com/docling-project/docling) and its [technical report](https://arxiv.org/abs/2408.09869) — open-source document conversion with layout and tables.
- [Unstructured](https://github.com/Unstructured-IO/unstructured) — ingestion for dozens of file types.
- [LlamaParse](https://github.com/run-llama/llama_parse) — LLM-powered parsing for complex documents.
- [ColPali](https://arxiv.org/abs/2407.01449) — retrieve over page images directly, skipping parsing.
- [Claude docs: PDF support](https://docs.claude.com/en/docs/build-with-claude/pdf-support) — send PDFs straight to the model.
- [NirDiamant/RAG_Techniques](https://github.com/NirDiamant/RAG_Techniques) — includes many ingestion and chunking recipes.
:::
