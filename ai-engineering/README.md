# GenLab — AI Engineering, Start to End

An interactive course that takes you from "I have used ChatGPT" to "I can design, build, evaluate, secure and ship an AI product, and explain every choice in an interview". Every idea is explained in plain English, shown in a diagram or a live simulator, and then built in runnable Python. Every lesson ends with a **Go deeper** box of real, link-checked resources (courses, papers, docs, blogs).

## Open it

Open the site from the repo root (`../index.html`) and pick GenLab, or open this folder's `index.html` directly. If your browser blocks local files, serve the repo root:

```bash
python3 -m http.server 8000      # from the repo root, then open http://localhost:8000/ai-engineering/
```

## How running code works

- ` ```python run ` examples run in your browser with **Pyodide** (Python + NumPy). Press **▶ Run** or `Ctrl` + `Enter`; you can edit the code. The first run downloads the runtime (about 10 MB).
- ` ```python local ` examples show real API code (Claude SDK, sentence-transformers) that needs a key or a model download, so they are displayed but not run.
- Projects use ` ```python run shared ` blocks, which share one namespace from step to step.
- The browser has no threads, sockets or subprocesses: examples use `asyncio` and simulated providers.

## What's inside

| Module | Lessons |
|---|---|
| 1. How LLMs Work | tokens, embeddings, attention, the Transformer, training to assistant, decoding, scaling, limits |
| 2. Building with LLM APIs | messages, parameters, prompting, structured output, tool calling, streaming, caching, batching, errors and costs |
| 3. Context Engineering & Memory | context budgets, long context, summarisation, memory systems |
| 4. Retrieval-Augmented Generation | chunking, embeddings, vector search, hybrid search, reranking, query rewriting, evaluation, production RAG |
| 5. AI Agents | agent loops, workflows, MCP, multi-agent, frameworks, reliability, ecosystem |
| 6. Evals & Observability | golden sets, graders, LLM judges, tracing, online evals, CI |
| 7. Safety, Security & Responsible AI | OWASP LLM risks, prompt injection, guardrails, hallucination, privacy and the EU AI Act, red-teaming |
| 8. Fine-tuning & Adaptation | SFT, LoRA/QLoRA, preference tuning, reasoning RL, distillation, infrastructure |
| 9. Inference & Serving | prefill and decode, KV cache, quantisation, FlashAttention, batching, speculative decoding, serving stacks, GPU sizing, local models |
| 10. Multimodal & Generative Media | vision-language models, diffusion, speech and voice, video and audio generation, document AI, multimodal search |
| 11. LLMOps & Production | architecture, scaling and rate limits, cost and latency, data and feedback loops, security and multi-tenancy, CI/CD, AI UX, build vs buy, GenAI system design |
| 12. Career & Interview Prep | roles and skills, 40 rapid-fire concept questions, coding rounds, portfolio, staying current, a 12-week plan |
| 13. Resource Library | courses and books, an annotated paper list, blogs and channels, a tools map, datasets and communities |
| Project Lab (14) | BPE tokenizer, tiny language model, sampling lab, hybrid search engine, RAG chatbot with citations, vector database, agent framework, eval harness, constrained decoding, prompt-injection firewall, LLM gateway, inference scheduler, LoRA from scratch, MCP server and client |

Totals: **114 lessons + 14 projects**, **132 interview questions** (with hints and model answers, in the Interview Qs tracker), **447 quiz questions**, **372 runnable examples**, **59 diagrams**, **21 interactive simulators**, and about **500 external links**.

## Interactive simulators

`tokenizer` (BPE), `embedding`, `attention`, `sampling`, `scaling`, `ctxbudget`, `cost`, `promptcache`, `chunking`, `ann`, `hybrid`, `retrievalmetrics`, `agentloop`, `errorcompound`, `lora`, `kvcache`, `quant`, `batching`, `specdec`, `gpusize` and `diffusion`. Use one in a lesson with a fence such as ` ```viz algo=sampling `; flags in the fence (for example `merges=12`) configure it.

## Writing lessons

Lessons are Markdown files in `content/NN-module/NN-lesson.md` with front matter (`title`, `level` easy|intermediate|advanced|mixed, `time`, `summary`). Besides standard Markdown the engine supports `:::def`, `:::formula`, `:::flow`, `:::analogy`, `:::tip`, `:::warn`, `:::note`, `:::keypoints`, `:::problem` (with nested `:::hint` and `:::solution`), `:::exercise` and **`:::resources`** (link lists), quizzes (` ```quiz `), and diagrams (` ```viz algo=arch|seq|uml `).

## Build and verify

```bash
cd ai-engineering
python3 -m venv .venv && .venv/bin/pip install numpy          # numpy 2.x, like the browser runtime
python3 build.py                  # bundle content, run every python example locally, lint
python3 build.py --no-verify      # bundle only (fast)
python3 tools/check_links.py      # curl every external link (results cached in tools/links_ok.json)
python3 tools/verify_arxiv.py 2401.04088 ...   # add arXiv ids after checking them against the arXiv API
.venv/bin/python tools/preview.py content/14-projects/01-bpe-tokenizer.md   # print each python block's output
python3 -m http.server 8766       # from the repo root, in another terminal
python3 tools/browser_test.py [--light|--mobile] [module:<id>] [--shots <dir>]   # real browser: runs every example and pokes every simulator
```

`build.py` also lints: lesson levels, quiz format (one `+`, at least one `-`), internal `#/l/` links, viz names and arch node types, browser-incompatible imports (threads, sockets, subprocess), and arXiv ids that were not verified. Use single backslashes in lesson Python, and never put literal triple backticks inside a Python block.
