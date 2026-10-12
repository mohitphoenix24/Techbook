---
title: Chat with Your PDFs
level: advanced
time: 75
icon: file
cover: #f59e0b,#ef4444
tags: rag, pdf, chromadb, claude, streamlit
summary: A full "ask your documents" app — extract PDF text page by page, chunk with page numbers, embed into a persistent vector store, answer with page-level citations via Claude, and wrap it in a Streamlit UI. Plus when to skip RAG and send the whole PDF.
---

"Upload your contracts / manuals / research papers and ask questions" is one of the most requested AI features. This project builds it end to end. The page-aware core (chunking, retrieval, citation formatting) runs here; the full app with real PDFs, embeddings, Chroma and Claude runs on your computer.

:::flow Architecture
Upload PDFs | contracts, manuals, papers
Extract | text per page (pypdf)
Chunk | with file + page metadata
Embed + store | Chroma (persistent)
Ask | retrieve top chunks
Answer | Claude cites [file p.N]
:::

## Step 1 — Pages as the unit of truth

PDF text extraction gives you **text per page**. Keep the page number all the way through — it's what makes citations useful ("see page 14").

```python run shared title="Step 1 · extracted pages (simulated)"
# What pypdf would give you for two documents (on your computer this comes from real PDFs — see Step 6)
PAGES = [
    {"file": "lease.pdf", "page": 1, "text": "RESIDENTIAL LEASE AGREEMENT. This lease is between Maple Homes Ltd (Landlord) and A. Lovelace (Tenant) for the flat at 12 River Street. The term starts on 1 March 2026 and lasts 12 months."},
    {"file": "lease.pdf", "page": 2, "text": "RENT. Monthly rent is 1,450 euros, due on the 1st of each month. A late fee of 50 euros applies after the 5th. The security deposit is two months' rent and is returned within 30 days of move-out, minus documented damages."},
    {"file": "lease.pdf", "page": 3, "text": "PETS AND SUBLETTING. One cat or small dog is allowed with written approval. Subletting is not permitted. TERMINATION. Either party may terminate with 60 days' written notice after the first 6 months."},
    {"file": "lease.pdf", "page": 4, "text": "MAINTENANCE. The landlord repairs heating, plumbing and electrical faults within 7 days of notice. The tenant replaces light bulbs and keeps drains clear."},
    {"file": "insurance.pdf", "page": 1, "text": "HOME CONTENTS INSURANCE POLICY. Policyholder: A. Lovelace. Cover limit: 25,000 euros. Excess: 150 euros per claim. Policy period: 1 March 2026 to 28 February 2027."},
    {"file": "insurance.pdf", "page": 2, "text": "COVERED EVENTS. Fire, theft with forced entry, water leaks and storm damage. NOT COVERED: wear and tear, mould, items left in unlocked vehicles, and damage caused by pets."},
    {"file": "insurance.pdf", "page": 3, "text": "MAKING A CLAIM. Report theft to the police within 48 hours and to us within 7 days. Keep receipts. Claims are usually paid within 14 days of approval."},
]
print(len(PAGES), "pages from", len({p["file"] for p in PAGES}), "files")
```

## Step 2 — Page-aware chunking

```python run shared title="Step 2 · chunks that remember their page"
import re

def chunk_pages(pages, max_chars=220, overlap_sentences=1):
    chunks = []
    for p in pages:
        sentences = re.split(r"(?<=[.!?])\s+", p["text"])
        current = []
        for s in sentences:
            if current and len(" ".join(current + [s])) > max_chars:
                chunks.append({**{k: p[k] for k in ("file", "page")}, "text": " ".join(current)})
                current = current[-overlap_sentences:]
            current.append(s)
        if current:
            chunks.append({**{k: p[k] for k in ("file", "page")}, "text": " ".join(current)})
    for i, c in enumerate(chunks):
        c["id"] = f"{c['file']}#p{c['page']}-{i}"
    return chunks

CHUNKS = chunk_pages(PAGES)
for c in CHUNKS[:4]:
    print(f"{c['id']:<20} {c['text'][:70]}…")
print(len(CHUNKS), "chunks")
```

## Step 3 — Retrieval with metadata filters

```python run shared title="Step 3 · retriever (TF-IDF here, embeddings in the real app)"
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

class Retriever:
    def __init__(self, chunks):
        self.chunks = chunks
        self.vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
        self.X = self.vec.fit_transform(c["text"] for c in chunks)

    def search(self, query, k=3, file=None):
        scores = (self.X @ self.vec.transform([query]).T).toarray().ravel()
        if file:
            scores = np.where([c["file"] == file for c in self.chunks], scores, -1)
        order = [i for i in np.argsort(-scores) if scores[i] > 0][:k]
        return [(self.chunks[i], round(float(scores[i]), 3)) for i in order]

retriever = Retriever(CHUNKS)
for q, f in [("how much is the late fee", None), ("is mould covered", None), ("notice period to end the lease", "lease.pdf")]:
    print(f"\n❓ {q}" + (f"  (only {f})" if f else ""))
    for c, s in retriever.search(q, file=f):
        print(f"   {s:.3f}  [{c['file']} p.{c['page']}] {c['text'][:60]}…")
```

## Step 4 — Prompt with page citations

```python run shared title="Step 4 · prompt + citation formatting"
SYSTEM = """You answer questions about the user's documents.
Use ONLY the excerpts provided. After each fact, cite its source like [lease.pdf p.2].
If the excerpts don't answer the question, say so plainly — never guess about legal or financial terms."""

def build_prompt(question, results):
    excerpts = "\n\n".join(f'<excerpt source="{c["file"]} p.{c["page"]}">\n{c["text"]}\n</excerpt>' for c, _ in results)
    return f"<excerpts>\n{excerpts}\n</excerpts>\n\n<question>{question}</question>"

def citations(answer):
    return sorted(set(re.findall(r"\[([\w.-]+\.pdf) p\.(\d+)\]", answer)), key=lambda x: (x[0], int(x[1])))

print(build_prompt("What is the late fee?", retriever.search("late fee", k=2)))
example_answer = "The late fee is 50 euros, charged after the 5th of the month [lease.pdf p.2]."
print("\ncited pages:", citations(example_answer))
```

## Step 5 — A stand-in answerer (so the whole loop runs here)

```python run shared title="Step 5 · ask()"
def extractive_answer(question, results):
    """Stand-in for Claude: return the best-matching sentence with its citation."""
    q = set(re.findall(r"[a-z0-9]+", question.lower())) - {"the", "is", "a", "what", "how", "to", "of", "my", "i", "do", "are"}
    best = (0, None, None)
    for c, _ in results:
        for s in re.split(r"(?<=[.!?])\s+", c["text"]):
            overlap = len(q & set(re.findall(r"[a-z0-9]+", s.lower())))
            if overlap > best[0]:
                best = (overlap, s, c)
    if best[0] < 2:
        return "The documents I have don't answer that."
    return f"{best[1]} [{best[2]['file']} p.{best[2]['page']}]"

def ask(question, file=None, answerer=extractive_answer):
    results = retriever.search(question, k=3, file=file)
    answer = answerer(question, results)
    print(f"❓ {question}\n💬 {answer}\n")
    return answer

ask("What is the late fee for rent?")
ask("Is damage caused by pets covered?")
ask("How much notice do I need to give to terminate?")
ask("Within how many days must I report theft to the police?")
ask("Can I install solar panels?")
```

## Step 6 — The real app (run locally)

```text title="requirements.txt"
anthropic>=1.0
pypdf>=5.0
chromadb>=1.0
sentence-transformers>=3.0
streamlit>=1.40
```

```python local title="ingest.py — PDFs → chunks → embeddings → Chroma"
from pathlib import Path
import chromadb
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

embedder = SentenceTransformer("BAAI/bge-small-en-v1.5")
db = chromadb.PersistentClient(path="./pdf_index")
collection = db.get_or_create_collection("docs", metadata={"hnsw:space": "cosine"})

def extract_pages(path: Path):
    reader = PdfReader(str(path))
    for number, page in enumerate(reader.pages, start=1):
        text = " ".join((page.extract_text() or "").split())
        if text:
            yield {"file": path.name, "page": number, "text": text}

def ingest(folder="pdfs"):
    pages = [p for pdf in sorted(Path(folder).glob("*.pdf")) for p in extract_pages(pdf)]
    chunks = chunk_pages(pages, max_chars=1200, overlap_sentences=2)           # from Step 2
    vectors = embedder.encode([c["text"] for c in chunks], normalize_embeddings=True, batch_size=32)
    collection.upsert(
        ids=[c["id"] for c in chunks],
        embeddings=vectors.tolist(),
        documents=[c["text"] for c in chunks],
        metadatas=[{"file": c["file"], "page": c["page"]} for c in chunks],
    )
    print(f"indexed {len(chunks)} chunks from {len({c['file'] for c in chunks})} PDFs")

if __name__ == "__main__":
    ingest()
```

```python local title="qa.py — retrieve + answer with Claude"
import anthropic

client = anthropic.Anthropic()

def retrieve(question: str, k: int = 5, file: str | None = None):
    q = embedder.encode([question], normalize_embeddings=True)[0].tolist()
    res = collection.query(query_embeddings=[q], n_results=k, where={"file": file} if file else None)
    return [({"text": d, **m}, 1 - dist) for d, m, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0])]

def answer(question: str, file: str | None = None) -> str:
    results = retrieve(question, file=file)
    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=2048,
        system=SYSTEM,                                                  # from Step 4
        messages=[{"role": "user", "content": build_prompt(question, results)}],
    )
    if response.stop_reason == "refusal":
        return "I can't help with that request."
    return "".join(b.text for b in response.content if b.type == "text")
```

```python local title="app.py — Streamlit UI (streamlit run app.py)"
import streamlit as st
from pathlib import Path

st.set_page_config(page_title="Chat with your PDFs", page_icon="📄")
st.title("📄 Chat with your PDFs")

with st.sidebar:
    uploads = st.file_uploader("Upload PDFs", type="pdf", accept_multiple_files=True)
    if uploads and st.button("Index documents"):
        Path("pdfs").mkdir(exist_ok=True)
        for f in uploads:
            Path("pdfs", f.name).write_bytes(f.getbuffer())
        with st.spinner("Reading and embedding…"):
            ingest("pdfs")
        st.success("Done!")
    files = sorted({m["file"] for m in collection.get(include=["metadatas"])["metadatas"]})
    only = st.selectbox("Search in", ["All documents"] + files)

if "chat" not in st.session_state:
    st.session_state.chat = []
for role, text in st.session_state.chat:
    st.chat_message(role).write(text)

if question := st.chat_input("Ask about your documents"):
    st.chat_message("user").write(question)
    with st.chat_message("assistant"):
        with st.spinner("Thinking…"):
            reply = answer(question, None if only == "All documents" else only)
        st.write(reply)
    st.session_state.chat += [("user", question), ("assistant", reply)]
```

## Step 7 — Or skip RAG: send the whole PDF

For **one or a few** documents that fit in the context window, you can send the PDF itself. Claude reads the text **and** visuals (tables, charts, scans) — no chunking or vector store needed. Use **prompt caching** so follow-up questions about the same PDF are cheap.

```python local title="Whole-document Q&A with native PDF support"
import base64
import anthropic

client = anthropic.Anthropic()
pdf_data = base64.standard_b64encode(open("lease.pdf", "rb").read()).decode()

def ask_pdf(question: str) -> str:
    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=2048,
        messages=[{"role": "user", "content": [
            {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_data},
             "cache_control": {"type": "ephemeral"}},                      # cache the PDF for follow-up questions
            {"type": "text", "text": f"{question}\nCite page numbers."},
        ]}],
    )
    return response.content[0].text

print(ask_pdf("Summarise the tenant's obligations."))
print(ask_pdf("What happens to the deposit when I move out?"))
```

| | RAG (this project) | Whole PDF in context |
|---|---|---|
| number of documents | many / large libraries | one or a few |
| setup | ingestion pipeline + vector DB | none |
| cost per question | small (only top chunks) | larger (whole document; caching helps a lot) |
| tables, charts, scans | text only (unless you add OCR/vision) | understood natively |
| access control per document | easy (metadata filters) | per request |

:::exercise Extensions
1. Add a **"Sources"** expander in the Streamlit UI showing each cited excerpt.
2. Handle scanned PDFs: if a page has no extractable text, render it to an image and send it to Claude for OCR.
3. Add hybrid search (BM25 + embeddings) from Project 4 and measure retrieval recall on 10 test questions.
4. Store a hash of each PDF and skip re-ingesting unchanged files.
:::

:::keypoints
- Extract text **per page** and carry `file` + `page` metadata through chunking, storage and answers.
- Persistent vector stores (Chroma) + sentence embeddings make libraries of PDFs searchable.
- Prompt for **citations like [file p.N]** and refuse to guess on legal/financial details.
- Streamlit turns the pipeline into a usable app in ~40 lines.
- For a handful of documents, sending the **whole PDF** (with prompt caching) can beat RAG.
:::
