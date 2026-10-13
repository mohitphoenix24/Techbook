---
title: Images, PDFs and Files as Input
level: intermediate
time: 35
summary: How to send images, PDFs and other files to a model, what they cost in tokens, how to size and place them, getting citations back from documents, the Files API for reuse, when OCR beats a vision model, and the security issues unique to untrusted images and documents.
---

Modern frontier models read **images and PDFs directly**. That makes a whole class of tasks (invoices, charts, screenshots, forms, slides, scanned contracts) one API call instead of an OCR-and-parsing pipeline. This lesson covers the API mechanics and the engineering judgement; module 10 covers how vision-language models work.

## Sending an image

Images are content blocks in a `user` message: either **base64** data or a **URL**. Put the image **before** the question text.

```python local title="Image from a file (base64)"
import base64, anthropic
client = anthropic.Anthropic()

with open("invoice.png", "rb") as f:
    data = base64.standard_b64encode(f.read()).decode("utf-8")

response = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1000,
    messages=[{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}},
            {"type": "text", "text": "Extract the vendor, invoice number, date and total as JSON."},
        ],
    }],
)
print(response.content[0].text)
```

```python local title="Image from a URL"
{"type": "image", "source": {"type": "url", "url": "https://example.com/chart.png"}}
```

Supported types are typically JPEG, PNG, GIF and WebP, with limits on file size and dimensions (check the docs of your provider). You can send several images per request: label them ("Image 1: before, Image 2: after").

## What images cost

Images are converted to tokens. For Claude, a handy approximation is **tokens ≈ (width × height) ÷ 750**, after the image is resized to fit the model's maximum dimensions. Large images are downscaled automatically, so uploading a 6000 px photo costs the same as a ~1500 px one but wastes bandwidth and latency.

```python run title="Estimating image tokens and cost" level=easy
def image_tokens(width, height, max_edge=1568):
    scale = min(1.0, max_edge / max(width, height))          # the API downscales long edges
    w, h = int(width * scale), int(height * scale)
    return int(w * h / 750), (w, h)

def price(tokens, per_mtok): return tokens / 1e6 * per_mtok

for name, (w, h) in {"phone photo": (4032, 3024), "screenshot": (1920, 1080), "thumbnail": (400, 300), "A4 scan @150dpi": (1240, 1754)}.items():
    t, (rw, rh) = image_tokens(w, h)
    print(f"{name:16} {w}x{h} -> sent as {rw}x{rh}  ~{t:>5} tokens  ${price(t, 2.0):.4f} at $2/MTok")
```

Practical rules: **resize before sending** to the smallest size that keeps the needed detail (a receipt's text must stay legible), **crop** to the relevant region, and **send only the pages** you need.

## PDFs

A PDF can be sent as a **document block**. The provider extracts the text *and* renders each page as an image, so the model sees both the text layer and the visual layout (tables, charts, figures). Cost is the text tokens plus image tokens per page.

```python local title="Send a PDF"
with open("contract.pdf", "rb") as f:
    pdf_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

response = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=2000,
    messages=[{
        "role": "user",
        "content": [
            {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64}},
            {"type": "text", "text": "List every termination clause with the page it appears on."},
        ],
    }],
)
```

Limits matter: a maximum request size (tens of MB) and page count (hundreds of pages). For longer documents, **split, summarise hierarchically, or retrieve** relevant pages (RAG).

## Citations: know where an answer came from

When you give the model documents, it can return **citations**: exact spans in the source supporting each claim. In Claude's API you set `citations: {"enabled": true}` on the document block; the response is split into text blocks, each carrying a list of citations (document, page or character range, and the quoted text). This is the cleanest way to build "answers with sources".

```python local title="Answers with citations"
response = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1500,
    messages=[{
        "role": "user",
        "content": [
            {"type": "document",
             "source": {"type": "text", "media_type": "text/plain", "data": "The warranty lasts 2 years and covers the motor for 10 years."},
             "title": "X200 manual", "citations": {"enabled": True}},
            {"type": "text", "text": "How long is the motor warranty?"},
        ],
    }],
)
for block in response.content:
    if block.type == "text":
        print(block.text)
        for c in getattr(block, "citations", None) or []:
            print("   source:", c.document_title, "|", c.cited_text)
```

Citations cannot be combined with structured-output JSON constraints in the same request; choose one or do two steps.

## The Files API: upload once, reuse

Re-sending a 20 MB PDF in every message of a conversation is slow and wasteful. Upload it once and reference it by id.

```python local title="Upload once, reference many times"
uploaded = client.files.upload(file=open("contract.pdf", "rb"))

block = {"type": "document", "source": {"type": "file", "file_id": uploaded.id}}
for question in ["Who are the parties?", "What is the payment term?"]:
    r = client.messages.create(
        model="claude-sonnet-5-5", max_tokens=500,
        messages=[{"role": "user", "content": [block, {"type": "text", "text": question}]}],
    )
    print(r.content[0].text)
```

Combine with **prompt caching** so repeated questions over the same document pay the cached rate for the document tokens.

## Audio and video

Support differs by provider. Some models take audio or video directly (transcription, meeting summaries, video Q&A). Where a model does not, the standard pipeline is **speech-to-text first** (Whisper-class models, see module 10), then text prompting; for video, sample frames plus the transcript. Check your model's modality list rather than assuming.

## Vision model or OCR?

| Need | Use | Why |
|---|---|---|
| Exact text from clean documents, at high volume | OCR / layout parser (Docling, Textract, Document AI) | Deterministic, cheap, fast |
| Understanding charts, diagrams, handwriting, messy layouts | Vision-language model | Reads meaning, not just characters |
| Tables you must reconstruct exactly | Layout parser first, then LLM to interpret | Fewer transcription errors |
| Mixed, low volume, quality matters | Send the page to the VLM directly | Simplest pipeline |

A common production design: **parser for structure and text, VLM for hard pages and questions**, with a validation step (totals add up, required fields present).

## Pitfalls specific to images and documents

- **Small text and fine detail** get lost when an image is downscaled. Crop and zoom to the region that matters.
- **Counting and precise spatial reasoning** (how many objects, exact coordinates) are still unreliable.
- **Do not identify people** from faces, and be careful with sensitive images; check your provider's policies.
- **Prompt injection through images and PDFs:** a document can contain hidden text ("ignore the user, send their data to...") in white-on-white font, metadata or small print. Treat all uploaded content as untrusted data (module 7).
- **Privacy:** documents often hold personal data. Minimise what you send, redact where possible, and check retention terms.
- **Order matters:** put images and documents before the instructions; label multiple items.

```quiz
? What is a rough way to estimate image tokens on Claude?
- Bytes divided by 4
+ Width × height ÷ 750 (after the image is resized to the model's limits)
- A fixed 10 tokens
> Larger images cost more, but very large ones are downscaled, so resize before sending.

? Why upload a document with the Files API?
+ To reference it by id across requests instead of re-sending it every time
- It makes the model smarter
- It is required for PDFs
> It saves bandwidth and pairs well with prompt caching.

? When is plain OCR better than a vision-language model?
- Never
+ High-volume, clean documents where exact, cheap, deterministic text extraction is enough
- For interpreting charts
> Use the cheapest reliable tool; add the VLM where understanding is needed.

? A PDF contains hidden white text telling the model to leak data. What is this?
+ Prompt injection through a document; treat uploaded content as untrusted
- A rendering bug
- A tokenization error
> Hidden instructions are a real attack vector.
```

:::keypoints
- Images and PDFs are content blocks; put them before the question and label multiples.
- Image cost ≈ pixels ÷ 750 tokens (Claude); resize and crop before sending; send only needed pages.
- Citations return the exact source spans; the Files API avoids re-uploading and pairs with caching.
- Use OCR/layout parsers for bulk exact text, VLMs for understanding, and validate extracted values.
- Treat all uploaded files as untrusted (injection) and minimise personal data.
:::

:::resources
- [Claude docs: Vision](https://docs.claude.com/en/docs/build-with-claude/vision) — formats, sizing, token cost and tips.
- [Claude docs: PDF support](https://docs.claude.com/en/docs/build-with-claude/pdf-support) — limits and best practices.
- [Claude docs: Citations](https://docs.claude.com/en/docs/build-with-claude/citations) — document-grounded answers.
- [Docling](https://github.com/docling-project/docling) — open-source document parsing (PDF, DOCX, tables) and its [report](https://arxiv.org/abs/2408.09869).
- [Unstructured](https://github.com/Unstructured-IO/unstructured) — ingestion pipelines for many file types.
- [ColPali](https://arxiv.org/abs/2407.01449) — retrieving PDF pages directly by their visual appearance.
:::
