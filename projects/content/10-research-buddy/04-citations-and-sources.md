---
title: Citations and sources
level: easy
time: 40
summary: An answer you cannot check is only an opinion. Turn the citations Claude attaches to its text into numbered markers and a numbered source list, in order of first use, with the quoted passage. The renderer runs here on a real-shaped response, and you will see why you must show them.
tags: citations, sources, grounding, trust, rendering, hallucination
---

A research agent that answers without showing where the facts came from is a confident stranger. The whole value of ResearchBuddy is that every claim can be **checked**: a number beside the sentence leads to a source with the exact passage Claude relied on.

The web search tool does the hard part. When Claude writes text based on search results, the API **attaches citations to the text blocks**, with no extra prompting from you. Your job is to turn them into something a person can use.

## What a cited block looks like

```json title="A text block with citations"
{ "type": "text",
  "text": "Claude Shannon was born on April 30, 1916, in Petoskey, Michigan",
  "citations": [ { "type": "web_search_result_location",
                   "url": "https://en.wikipedia.org/wiki/Claude_Shannon",
                   "title": "Claude Shannon - Wikipedia",
                   "cited_text": "Claude Elwood Shannon (April 30, 1916 – February 24, 2001) was an American mathematician...",
                   "encrypted_index": "Eo8B..." } ] }
```

Notice what a citation is attached **to**: a *fragment* of the answer, not the whole of it. A paragraph usually arrives as several text blocks, some cited, some not ("Based on the search results, " has none), and a block may carry more than one citation. `cited_text` is up to 150 characters of the page.

:::note The docs ask you to show them
Anthropic's documentation says that when you display the API's output to end users, the citations must be shown to the original source. If you change or combine the output with your own material, take advice about how to display them. Showing the sources is both the honest design and the expected one.
:::

## From blocks to numbered markers

```python src="research-buddy/backend/app/research.py" region="render" title="backend/app/research.py"
```

`render_answer` walks the answer's text blocks and builds two things:

- **The text with `[1]`, `[2]` markers** after each cited fragment. The marker goes right after the words, *before* any trailing space, so you read "Michigan[1]. He is called..." and not "Michigan [1] ."
- **The numbered source list**: each distinct URL gets a number **the first time it is cited**, so the markers read 1, 2, 3 in order down the page. Each source keeps its title, URL and the quoted passage (cut to 200 characters).

Three rules in the code are worth saying out loud:

1. **The same URL is always the same number**, even when cited many times (`numbers.get(url)`).
2. **Two citations to one source in a single block** give one marker, not two (`if f"[{n}]" not in marks`).
3. **Only `web_search_result_location` citations count**, and only with a URL. Other citation kinds (other tools use different shapes) are ignored rather than guessed at.

## Try it

```python run src="research-buddy/backend/app/research.py,research-buddy/backend/tests/shapes.py" flat title="Blocks to markers and sources" level=easy
narration, answer_blocks = split_turn(SHANNON["content"])

print("the raw answer, block by block:")
for b in answer_blocks:
    n = len(b.get("citations", []))
    print(f"   {b['text']!r:<75} {n} citation(s)")

rendered, sources = render_answer(answer_blocks)
print("\nrendered answer:")
print("  ", rendered)
print("\nsources:")
for s in sources:
    print(f"  [{s['n']}] {s['title']}  ({domain_of(s['url'])})")
    print(f"      “{s['quote'][:70]}...”")

print("\nedge cases:")
print("  one source cited twice in a block ->", render_answer([text("Fact", (WIKI, "W", "q"), (WIKI, "W", "q2"))]))
print("  no citations at all              ->", render_answer([text("Plain.")]))
print("  a space before the marker is fixed ->", repr(render_answer([text("First claim ", (WIKI, "W", "q")), text("second.")])[0]))
```

```output
the raw answer, block by block:
   'Based on the search results, '                                             0 citation(s)
   'Claude Shannon was born on April 30, 1916, in Petoskey, Michigan'          1 citation(s)
   '. He is called the father of information theory'                           2 citation(s)
   '.'                                                                         0 citation(s)

rendered answer:
   Based on the search results, Claude Shannon was born on April 30, 1916, in Petoskey, Michigan[1]. He is called the father of information theory[2][1].

sources:
  [1] Claude Shannon - Wikipedia  (en.wikipedia.org)
      “Claude Elwood Shannon (April 30, 1916 – February 24, 2001) was an Amer...”
  [2] Claude Shannon | Britannica  (britannica.com)
      “American mathematician and electrical engineer who laid the theoretica...”

edge cases:
  one source cited twice in a block -> ('Fact[1]', [{'n': 1, 'title': 'W', 'url': 'https://en.wikipedia.org/wiki/Claude_Shannon', 'quote': 'q'}])
  no citations at all              -> ('Plain.', [])
  a space before the marker is fixed -> 'First claim[1] second.'
```

Look at the second sentence in the output: "He is called the father of information theory[2][1]". It cited Britannica *and* Wikipedia, and Wikipedia was already number 1 from the earlier sentence, so the order of markers is `[2][1]`, in the order Claude gave them.

## Why this protects the reader

Citations turn "trust me" into "check me". They also change what *you* can notice as a developer:

- A claim with **no marker** is a claim Claude made from memory, not from a source. A good system prompt asks for sources for every fact, and a missing marker on a number is worth a second look.
- A source whose `cited_text` does not support the sentence beside it is a **mis-citation**. It is rarer than a made-up fact, but it happens. The quote on the source card is what lets a reader catch it.
- Sources that are all one blog, or all old, tell you something the answer does not.

:::warn Citations are a help, not a proof
A citation shows that Claude *read* a page and *quoted* it. It does not prove the page is right, current or neutral. The system prompt asks for primary sources and for attention to a page's age, and the interface shows the domain beside each link so a person can judge. A source list is evidence to evaluate, not a stamp of truth.
:::

## The tests

```python src="research-buddy/backend/tests/test_research.py" region="render-tests" title="backend/tests/test_research.py"
```

The first test pins the whole rendering of the Shannon answer, markers and all: first-use numbering, a source cited again, the `[2][1]` order. The others cover duplicates, trailing spaces, an over-long quote and other citation kinds. When output has a precise format that a person reads, **test the exact string**.

:::keypoints
- The web search tool attaches citations to text blocks automatically. Your job is to render them.
- A citation belongs to a *fragment* of text, so an answer is several blocks, some cited, some not.
- Number each source on first use; the same URL keeps its number; put the marker right after the words.
- Keep the quoted passage (`cited_text`) and show the domain: they let a reader check the claim and judge the source.
- Show the sources. A claim with no marker deserves a second look.
:::

```quiz
? In what order are sources numbered?
- Alphabetically
+ In order of first citation in the answer
- By page age
> So the markers read 1, 2, 3 down the page.
? A text block cites the same URL twice. How many markers appear?
- Two
+ One
- None
> The marker is added once per source per block.
? What does a citation prove?
- That the page is correct
+ That Claude read the page and quoted it; the reader still judges whether the source is good
- Nothing
> It makes claims checkable, not automatically true.
```

:::exercise Flag the uncited
Write `uncited_numbers(answer_blocks)` that finds numbers (digits) in text blocks that have **no** citations, and return them. Add the check to `done` as a `warnings` list, and show a small "not from a source" badge in the interface. What are the false positives (a year in a sentence, a list number), and why is a *warning* better than a refusal here?
:::
