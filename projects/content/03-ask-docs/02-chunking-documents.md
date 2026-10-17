---
title: Chunking: cutting documents into passages
level: intermediate
time: 40
summary: Why a document must be cut up, what makes a good cut, and a chunker that keeps sentences whole, repeats a little context, carries headings, and remembers exactly where each chunk came from. Runs live in your browser.
tags: chunking, overlap, offsets, headings
---

You cannot put a 200-page PDF into a prompt for every question, and you would not want to: the model would drown in text and you would pay for all of it. So we cut each document into **chunks** and search for the few that matter. How you cut decides what the search can find, which makes chunking the quiet foundation of every RAG system.

## The size dilemma

:::def Chunk
A passage of a document that is indexed and retrieved as one unit. A chunk is the smallest piece of text your system can ever show the model, so it must make sense on its own.
:::

| Chunks that are too small | Chunks that are too big |
|---|---|
| "…carried-over days must be used by 31 March." Which days? Which year? The sentence lost its context. | The vector of a 3,000-character chunk is an average of many topics, so it matches none of them well. |
| Many tiny pieces compete; the answer is split across several. | Each retrieved chunk spends your token budget on text that is not relevant. |
| Retrieval returns fragments the model cannot use. | Relevant details are diluted by their neighbours. |

There is no perfect size; a few hundred words is a common starting point, and **you choose by measuring** (lesson 9). AskDocs defaults to **700 characters** (about 120 words) with **120 characters of overlap**.

## The naive way, and why it fails

The simplest chunker slices every N characters. Run this and look at where the cuts fall:

```python run title="Fixed-size slicing" level=easy
text = ("Every full-time employee gets 24 days of paid annual leave per year. "
        "Leave is credited monthly, so a new joiner receives a pro-rated amount. "
        "You can carry over up to 6 unused days into the next year.")

for i in range(0, len(text), 90):
    print(repr(text[i:i + 90]))
```

The first chunk ends in the middle of "paid annual l…" and the next begins with "eave per year". A search for "24 days of annual leave" now matches neither chunk well, and if the answer were "carry over up to 6 days" the cut might land between "6" and "unused". Cutting at fixed positions is blind to meaning.

## A better chunker: pack whole sentences

Our chunker works in three steps, all of them pure functions you can run and test:

1. **Split into units**: sentences, never crossing a paragraph break, remembering each one's character offsets. Markdown headings are noted as context and not treated as content.
2. **Pack units into chunks** up to a size limit, so a chunk always ends at the end of a sentence.
3. **Overlap**: when a new chunk starts, repeat the last sentences of the previous one (up to a budget), so an answer that straddles a boundary still lives whole in at least one chunk.

```python src="ask-docs/backend/app/rag/chunker.py" region="units" title="backend/app/rag/chunker.py: split_units"
```

```python src="ask-docs/backend/app/rag/chunker.py" region="chunk" title="backend/app/rag/chunker.py: chunk_text"
```

Look closely at the details:

- **Offsets.** Every chunk carries `start` and `end`, positions in the original text, and `chunk.text == page_text[start:end]` is always true (a test enforces it). That is what lets the interface point at the exact passage later.
- **Headings are not lost.** `# Leave` is not a sentence, so it does not appear in the text. It is stored as `chunk.heading`, and a **new section always starts a new chunk** (`new_section`), so a chunk never mixes Leave with Expenses.
- **Long units are cut at spaces.** A single "sentence" longer than a whole chunk (a table row, a run-on line) is split by `split_long` instead of producing an oversized chunk.
- **Pages.** Each PDF page is chunked separately, with `page` recorded and ordinals continuing across pages, so citations can say "page 7".

## Play with it

This block runs the real `chunker.py` in your browser on a short handbook with two headings. Change `size` and `overlap`, then run again, and watch how the chunks (and the headings they carry) change.

```python run src="ask-docs/backend/app/rag/chunker.py" title="Chunk a document (the real chunker)" level=intermediate
DOC = """# Leave

Every full-time employee gets 24 days of paid annual leave per year. Leave is credited monthly, so a new joiner receives a pro-rated amount. You can carry over up to 6 unused days into the next year, and carried-over days must be used by 31 March or they lapse.

Sick leave is 8 days per year. A doctor's note is needed if you are away for more than 2 consecutive days. Maternity leave is 26 weeks on full pay.

# Expenses

Business expenses are reimbursed within 10 working days when you submit them in the portal. A receipt is required for any single item above ₹500.
"""

SIZE, OVERLAP = 220, 60                     # try 400 / 100, or 120 / 0

chunks = chunk_text(DOC, size=SIZE, overlap=OVERLAP)
for c in chunks:
    assert DOC[c.start:c.end] == c.text     # every chunk is an exact slice of the document
    print(f"#{c.ordinal}  [{c.heading}]  chars {c.start}-{c.end}  ({len(c.text)} long)")
    print("   " + c.text.replace("\n", " ") + "\n")
print(len(chunks), "chunks")
```

Things to notice and try:

- Both the `Leave` chunks and the `Expenses` chunk carry their heading.
- With `OVERLAP = 0` the carried-over sentence appears in only one chunk; with overlap, the end of one chunk is repeated at the start of the next.
- With a very small size, sentences are still kept whole as far as possible, and only oversized sentences are broken at spaces.

## What gets embedded: the heading travels with the text

A chunk like "You can carry over up to 6 unused days…" is ambiguous on its own. The heading "Leave" disambiguates it. So we embed (and keyword-index) the **heading plus the text**, and show the model the heading too:

```python src="ask-docs/backend/app/ingest.py" region="chunk-pages" title="backend/app/ingest.py: titles, pages to chunks, embedding text"
```

This is a simple form of what is often called **contextual chunking**: give every chunk the context a human reader would have from its position in the document. A more advanced version asks a model to write a one-line summary of where each chunk sits in the whole document and prepends that; the heading is the cheap version.

## Tests

```python src="ask-docs/backend/tests/test_text_chunker.py" region="chunker-tests" title="backend/tests/test_text_chunker.py"
```

Four properties are pinned down: every chunk is an exact slice and within the size limit; headings travel and sections never mix; neighbours overlap; oversized sentences are cut at spaces.

:::warn Chunking is where RAG quietly goes wrong
If answers are bad, look at the **chunks** before you blame the model or the embeddings. Typical faults: a table cut into meaningless rows, a numbered list split from the sentence that introduces it, headers and footers repeated on every page (so every chunk matches "Confidential"), and scanned PDFs with no text at all. Print ten random chunks and read them; it is the cheapest debugging you will ever do.
:::

:::keypoints
- A chunk is the smallest piece of text the system can retrieve, so it must make sense on its own.
- Too small loses context; too big dilutes meaning and wastes tokens. Choose the size by measuring.
- Cut at sentence boundaries, repeat a little overlap, never mix sections, and cut oversized sentences at spaces.
- Remember offsets and page numbers: that is what makes citations possible.
- Embed the heading with the text; when answers are bad, read your chunks first.
:::

```quiz
? Why does the chunker repeat the end of one chunk at the start of the next?
- To make the database larger
+ So an answer that straddles a boundary still appears whole in at least one chunk
- Because sentences must be repeated
> Overlap is insurance against cutting a fact in half.
? What does `chunk.start` and `chunk.end` make possible?
- Faster search
+ Pointing at the exact passage in the source, which citations and highlighting need
- Smaller chunks
> Offsets connect a retrieved passage back to its place in the original page.
? Why is a heading stored on the chunk instead of inside its text?
- Headings are not important
+ It keeps the text clean for the model while still letting us embed and show the heading as context
- Markdown cannot be stored
> The heading disambiguates a short passage ("Leave" tells you what '6 unused days' refers to), so it travels with the chunk.
```

:::exercise Chunk a table
Markdown tables are lines that start with `|`. Add a rule to `split_units` so that a table (consecutive lines starting with `|`) is kept as **one unit** (and `split_long` cuts it by rows if it is too big, not at arbitrary spaces). Write a test with a three-row table and a size of 80. Why would a row-by-row split lose the column headings, and how might you repeat the header row in each piece?
:::
