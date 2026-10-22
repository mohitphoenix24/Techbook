---
title: Agents that use the web
level: easy
time: 35
summary: Two kinds of tool, and why the difference matters. A server tool such as web search is run by Anthropic, so your loop only watches; a client tool such as the calculator is run by you. A tour of ResearchBuddy, what it costs, what you need switched on, and how to run it.
tags: server tools, client tools, web search, citations, cost, setup
---

Every tool in Projects 7 to 9 was a **client tool**: Claude asks, *your* code runs the function. ResearchBuddy adds the other kind.

| | Client tool (TaskPal, NoteKeeper, the calculator) | Server tool (web search) |
|---|---|---|
| Who runs it | **your code** | **Anthropic's servers** |
| What you write | the definition *and* the function | only the *declaration* |
| What arrives in the response | a `tool_use` block that you must answer | the search and its results, already done |
| Who pays and limits | you (your database, your CPU) | the API bills per search; you cap them |
| The loop | you run the tool and send a `tool_result` | you do nothing: the answer comes back with the results inside |

The web search tool lets Claude look things up on the live web, read what it finds and **cite it**. You do not write a search engine, a scraper or a parser. You write about twenty lines that say "the tool exists, and use it at most four times".

## What ResearchBuddy does

You ask something the web can answer: *"What is the latest stable version of Python, and what changed in it?"* or *"What are the biggest cities in India by population? Add up the top three."*

1. Claude decides whether to search, and what to search for. It may search more than once.
2. Anthropic runs the searches and hands Claude the results, *inside the same API call*.
3. Claude writes an answer with **citations**: which page said what.
4. If arithmetic is needed, Claude calls the `calculator` (a client tool of ours) instead of working numbers out in its head.
5. The page shows the answer with small numbered links, a list of **sources** (with the quoted text), and a collapsed trail of every search and calculation.

![ResearchBuddy as it first loads: the search budget, a banner about the API key, a note that each search costs one cent, and four example questions](assets/img/research-buddy-welcome.png)

## What is new to handle

Three things change in the loop and the interface, and the lessons take them in turn:

| New thing | Lesson |
|---|---|
| The response now holds **several kinds of block**: text, a search request, search results, text with citations | 3 |
| Citations must become **numbered links** that a person can check | 4 |
| A model calling a calculator is a **security problem** if you use `eval` | 5 |
| A long search can **pause**; searches can **fail without an error**; a search costs money | 6 |
| Search results contain **URLs from anywhere**, which must not become dangerous links | 7 |

## Costs, in the open

Web search is billed **per search**, on top of the normal tokens. At the time of writing it is **$10 per 1,000 searches**, one cent each, and search results that Claude reads count as input tokens too. So a question that makes three searches costs three cents *plus* the tokens (which are larger than usual, because search results are long).

That is why the app has three brakes, all settings in `.env`:

- `MAX_SEARCHES=4`: the API itself refuses a fifth search, passing an error result to Claude.
- `MAX_STEPS=6`: the loop stops after six model calls.
- The interface says **"Each search costs one cent"** on the first screen and shows the *total* under every answer.

:::note Prices change
The figures here are the ones in Anthropic's documentation when this was written. `pricing.py` keeps them in one place; check the current pricing page before you rely on a number.
:::

## What you need switched on

Web search must be enabled for your organisation. It is **on by default**; an administrator can turn it off in the Claude Console settings. If it is off, any request that includes the tool fails with a `400` that says web search is not enabled, and ResearchBuddy shows that message in its error box. (You will see in lesson 6 that a *search* error inside an otherwise good response is different, and is handled differently.)

As in the other three projects, there is **no offline mode and no fake model**: without a key the page loads, shows a banner and answers honestly with an error.

## Run it

```bash title="Terminal 1: the back end"
cd projects/code/research-buddy/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then edit it: ANTHROPIC_API_KEY=sk-ant-...
uvicorn app.main:app --reload
```

```bash title="Terminal 2: the front end"
cd projects/code/research-buddy/frontend
npm install
npm run dev                     # http://localhost:5173
```

The source is in the [source explorer](#/code/research-buddy), with a zip download. Searches can take ten to forty seconds, because Claude searches, reads and then writes. (The page says "Researching. Searches can take up to a minute…" while it waits. Exercise 1 at the end of the project asks how you would stream progress instead.)

:::keypoints
- A **client tool** is run by your code; a **server tool** is run by Anthropic. For a server tool you only declare it, and the results arrive inside the response.
- Web search lets Claude look things up on the live web and cite sources, with no search code of yours.
- It is billed per search, on top of tokens. Cap it (`max_uses`), cap the loop (`max_steps`), and show the cost.
- It must be enabled for your organisation. A disabled tool is a `400`, not a search error.
:::

```quiz
? Who runs the web search tool?
- Your FastAPI server
+ Anthropic's servers: you only declare it and cap how often it can be used
- The browser
> That is what makes it a server tool.
? What does the `max_uses` setting do?
+ Caps the number of searches for one request; a further search becomes an error result
- Limits the length of the answer
- Limits how many people can use the app
> It is a cost and safety brake.
? A question makes 3 searches. What does it cost?
- Nothing extra
+ 3 cents for the searches plus the tokens, which are larger because search results are long
- 3 dollars
> Searches are billed per search at $10 per 1,000, in addition to token costs.
```

:::exercise Search or no search
For each question, say whether you would *want* the agent to search, and what would go wrong if it did not: (a) "Who is the Prime Minister of India?" (b) "What is 17% of 2,40,000?" (c) "Explain how a binary search tree works." (d) "What did the RBI announce in its last policy meeting?" What sentence could you put in the system prompt to steer it? (Look at the first rule of `prompts.py`.)
:::
