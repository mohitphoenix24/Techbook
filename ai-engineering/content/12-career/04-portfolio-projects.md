---
title: Building a Portfolio That Gets Interviews
level: easy
time: 25
summary: How to choose, build and present projects that prove you can ship AI products. What makes a project convincing, twelve project ideas by difficulty, the evidence checklist (eval results, failure analysis, cost numbers), writing a short case study, README and demo tips, contributing to open source, resume and LinkedIn phrasing, and how to talk about your work in interviews.
---

In AI engineering, **a small, honest, well-measured project beats a long list of tools**. Anyone can wire a chat UI to an API in an afternoon, so employers look for the things that are hard to fake: **evaluation, failure analysis, cost and latency awareness, and judgement**. This lesson shows how to build projects that demonstrate them.

## What makes a project convincing

| Signal | What to show |
|---|---|
| **A real problem** | a user, a task and why it matters, ideally with real (or realistic) data |
| **Measured quality** | an eval set with results (even 30 to 50 cases) and a before/after table |
| **Failure analysis** | where it breaks and why, with examples, and what you did about it |
| **Engineering** | clean structure, tests, error handling, config, one-command run |
| **Production thinking** | cost per request, latency, rate limits, logging/tracing, security notes |
| **Decisions explained** | why this model, chunking, framework, and what you rejected |
| **Finish** | deployed demo or screen recording, README, honest limitations |

A project with **one clear idea, finished and measured** is worth more than three half-built "platforms".

## Twelve project ideas

| Level | Project | Skills shown |
|---|---|---|
| Easy | **Cited Q&A over a document set you care about** (a textbook, a legal code, game rules) | RAG, citations, retrieval eval |
| Easy | **Structured extraction from messy text** (job posts, receipts, emails) with a schema and a labelled set | structured outputs, validation, field-level metrics |
| Easy | **Prompt regression suite** for a task with CI | evals, judges, thresholds |
| Medium | **Support-ticket triage and reply drafter** with human-in-the-loop UI | workflows, retrieval, feedback capture |
| Medium | **Research agent** that searches, reads and writes a sourced report | tool use, agent loop, budgets, tracing |
| Medium | **Code-review assistant** for pull requests (GitHub app) | integrations, prompting, evaluation on real PRs |
| Medium | **Text-to-SQL analytics assistant** over a sample warehouse | semantic layer, validation, execution accuracy |
| Medium | **Voice assistant** (streaming ASR, LLM, TTS) with latency numbers | multimodal, real-time systems |
| Hard | **LLM gateway** with routing, caching, budgets and tracing | systems design, reliability |
| Hard | **Fine-tune a small model** for a narrow task and compare to a prompted large model on cost and quality | SFT/LoRA, evals, distillation |
| Hard | **Serve an open model** with vLLM, load test it and write up throughput/cost | inference, benchmarking |
| Hard | **Multi-tenant RAG service** with permission-aware retrieval and isolation tests | security, architecture |

The Projects module in this course gives you fourteen guided builds you can extend; make them yours by applying them to a real dataset and adding your own evals.

## The project recipe

1. **Pick a narrow task** and write a one-paragraph spec: users, inputs, outputs, what "good" means.
2. **Build the simplest baseline** (single prompt) and save its outputs.
3. **Create a small eval set** early (30 to 100 cases from real or realistic data). Include hard and adversarial cases.
4. **Iterate with evidence**: change one thing at a time (prompt, chunking, model, retrieval) and record the metric.
5. **Look at failures** by hand; categorise them; fix the biggest category.
6. **Measure cost and latency** per request and per task.
7. **Harden**: validation, retries, timeouts, injection and privacy checks, logging.
8. **Package**: README, demo, tests, one-command run, deploy if feasible.
9. **Write it up** (a short case study, below).

## Present it: README skeleton

```text
# Project name: one-line value statement

## Problem and users
Who is it for, what task, why it is hard.

## Demo
GIF or link, plus 2-3 example inputs and outputs.

## How it works
Architecture diagram (boxes), key design decisions and alternatives rejected.

## Results
Table: baseline vs improvements on the eval set (quality, cost, latency).
Method: dataset size, how it was labelled, metrics, judge calibration.

## Failure analysis
Top failure modes with examples and what is still open.

## Run it
Setup in 3 commands. Environment variables (no secrets committed).

## Production notes
Cost per request, scaling, security and privacy considerations, monitoring.

## What I would do next
```

### The one-page case study

Many hiring managers read only this, so keep it tight:

1. **Context** (2 sentences): the problem and who has it.
2. **Approach** (3 to 4 sentences): architecture and the key decisions.
3. **Evidence**: a small table of results, one chart if useful.
4. **What went wrong and what I learned**: honest and specific.
5. **Impact or next steps**.

## Open source and public work

- **Contribute to tools you use** (LlamaIndex, LangChain, vLLM, Hugging Face libraries, MCP servers, eval tools). Start with documentation fixes, bug reproductions and small PRs; they are accepted quickly and teach you the codebase.
- **Publish a useful MCP server, evaluation script, dataset or prompt library**, even a small one.
- **Write** about what you learned (blog, newsletter, thread): debugging stories and eval results are valuable. Teaching forces clarity.
- **Participate**: answer questions in communities, join hackathons, enter Kaggle-style competitions on LLM tasks.

## Resume and profile phrasing

Weak: "Built a chatbot using LangChain and OpenAI."

Strong: "Built a RAG assistant over 12K support articles; created a 120-question eval set; raised answer correctness from 61% to 84% via hybrid search and reranking; cut cost per answer 42% with prompt caching and a smaller model for easy queries."

Pattern: **action + system + scale + measured result**. Use numbers you can defend. Link to the repo and the case study.

## Talking about projects in interviews

Prepare a **three-minute story**: problem, your approach, a surprising failure, how you measured improvement, what you would change. Expect probes:

- "How do you know it works?" → eval set, metrics, slices.
- "What failed?" → specific example and root cause.
- "Why this design?" → alternatives and trade-offs.
- "What would you do at 100× scale?" → cost, latency, reliability, security.
- "What did you personally build?" → be precise about your contribution.

Do not exaggerate. Interviewers dig into details, and honest limits ("it fails on scanned tables; here is why") build credibility.

## Common mistakes

- Only demos with cherry-picked examples and no evals.
- Tutorial clones with a new name.
- Hiding a failing area instead of analysing it.
- Giant scope that never finishes.
- Committing API keys.
- No README, so nobody can run or understand it.
- Claiming metrics without describing the data and method.

```quiz
? What makes an AI portfolio project stand out most?
+ A measured evaluation with failure analysis and clear decisions
- Using the newest framework
- A long list of tools
> Evidence of judgement is hard to fake.

? How big should an initial eval set be for a portfolio project?
+ Even 30 to 100 realistic cases is enough to show method and compare changes
- Millions of examples
- None; screenshots are enough
> Small but honest beats none.

? Which resume bullet is strongest?
+ "Raised answer correctness from 61% to 84% on a 120-question eval by adding hybrid search and reranking"
- "Worked with AI"
- "Used LangChain"
> Action, system and measured result.

? Why contribute small PRs to open-source AI tools?
+ They teach the codebase, are visible proof of skills and build relationships
- They guarantee a job
- They replace projects
> Visible, reviewed work is strong evidence.
```

:::problem Pick one project idea and outline, in ten lines, how you would make it interview-ready within two weeks. {level=easy tags="portfolio,planning"}
Choose scope carefully.

:::solution Model answer
Example: "cited Q&A over a public dataset (such as a state's tax code)". Days 1 to 2: ingest and chunk, baseline RAG. Day 3: write 50 questions with reference answers and source passages. Days 4 to 6: measure retrieval (recall@k), try hybrid search and a reranker, record gains. Day 7: add citation checks and an "I don't know" path; evaluate unanswerable questions. Day 8: analyse failures and fix the top category. Day 9: measure cost and latency; add caching. Day 10: tracing, error handling, tests. Day 11: README, architecture diagram, results table. Day 12: simple UI and deployed demo. Day 13: one-page case study. Day 14: rehearse a three-minute story and anticipate questions.
:::
:::

:::keypoints
- Employers look for evidence that is hard to fake: evals, failure analysis, cost and latency awareness, and clear decisions.
- Build narrow, finished, measured projects; start with a baseline and an eval set, then iterate with evidence.
- Present with a README (problem, demo, architecture, results, failures, run, production notes) and a one-page case study.
- Contribute to open source and write publicly; use measured, specific resume bullets.
- In interviews tell an honest three-minute story and be ready to discuss failures and trade-offs.
:::

:::resources
- [Hugging Face: Open-source AI cookbook](https://huggingface.co/learn/cookbook) — project-style recipes to extend.
- [vLLM: contributing guide](https://docs.vllm.ai/en/latest/contributing/) — how to start contributing to a major inference engine.
- [Model Context Protocol servers](https://github.com/modelcontextprotocol/servers) — reference servers and a catalogue to extend.
- [Kaggle competitions](https://www.kaggle.com/competitions) — structured practice with leaderboards.
- [Eugene Yan: Writing](https://eugeneyan.com/writing/) — essays on applied ML, including how to write and share technical work.
- [Latent Space: AI Engineer community](https://www.latent.space) — talks and events for practitioners.
:::
