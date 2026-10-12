# PyGenAI — Python for Generative AI

A complete, interactive learning site for Python as it's used in AI, Machine Learning, Deep Learning and Generative AI. Every lesson explains ideas in plain English, gives clear definitions and syntax, and has examples you can **edit and run in the browser** (real Python 3.14 via [Pyodide](https://pyodide.org) — numpy, pandas, scikit-learn, matplotlib and pydantic included).

## Open it

Open the site from the repo root (`../index.html`) and pick this course, or open this folder's `index.html` directly. No server or install is needed.

The first time you press **▶ Run**, the browser downloads Python (~10 MB, cached afterwards), so you need an internet connection for running code. Reading works offline.

If your browser blocks local files, serve the folder instead:

```bash
python3 -m http.server 8000      # from the repo root, then open http://localhost:8000
```

## What's inside

| Module | Lessons |
|---|---|
| 1. Python Foundations | variables, strings, lists, dicts, control flow, functions, comprehensions, errors, files & JSON |
| 2. Intermediate Python | classes, dataclasses & typing, generators, decorators, context managers, standard library, regex, environments |
| 3. Advanced Python for AI Engineering | async, Pydantic, advanced typing, performance, testing & logging |
| 4. Data & Math Toolkit | NumPy, linear algebra, pandas, data cleaning, matplotlib, probability & statistics |
| 5. Machine Learning | core concepts, gradient descent, scikit-learn, classification metrics, trees & ensembles, clustering & PCA |
| 6. Deep Learning | neurons, backprop & autograd from scratch, PyTorch, training techniques, CNNs & RNNs |
| 7. NLP & Transformers | tokenization, embeddings, attention, the Transformer, language models & sampling, Hugging Face |
| 8. Generative AI Engineering | LLM APIs (Claude), prompting, streaming & memory, structured output & tools, RAG, vector DBs, agents, evals & guardrails, fine-tuning & LoRA, deployment, MCP, multimodal & diffusion |
| Project Lab (12 projects) | BPE tokenizer · spam detector · digit recognizer · hybrid search engine · RAG chatbot · tiny GPT from scratch · research agent · recommender · sentiment dashboard · production chat API · chat with PDFs · invoice extractor |

Features: Ctrl+K search, a glossary of every definition, progress tracking, quizzes, exercises with hidden solutions, light/dark themes, and a mobile layout.

Code marked **Run locally** needs your own computer (PyTorch, Hugging Face models, or an `ANTHROPIC_API_KEY`). LLM examples use the official `anthropic` SDK with `claude-opus-5-5` as the default model.

## Editing content

Lessons are Markdown files in `content/`. After editing, rebuild the bundle:

```bash
python3 build.py            # regenerates assets/js/content.js
python3 build.py --watch    # rebuild automatically on save
python3 build.py --test     # also runs every runnable Python example locally
```

Extra Markdown syntax used in lessons:

| Syntax | Renders as |
|---|---|
| ```` ```python run ```` | an editable code block with a ▶ Run button (add `level=easy`, `title="..."`) |
| ```` ```python run shared ```` | a project step that shares variables with the other steps of that page |
| ```` ```python local ```` | code to run on your own machine |
| ```` ```quiz ```` | a quiz: `? question`, `- wrong`, `+ right`, `> explanation` |
| `:::def Term` … `:::` | a definition card (also added to the Glossary) |
| `:::syntax`, `:::tip`, `:::warn`, `:::note`, `:::ai`, `:::analogy`, `:::keypoints` | callout boxes |
| `:::exercise` / `:::solution` | practice task with a collapsible solution |
| `:::flow Title` | a step diagram (one step per line, `Title \| detail`) |
| `:::formula Caption` | a formula box |

Each module folder has a `_module.md` with its title, icon, level and description.

## Folder layout

This course is one part of the combined site (see `../README.md`). The design system (`style.css`), the engine (`app.js`), CodeMirror, marked and KaTeX are shared from `../shared/`; the course catalogue is `../courses.js`.

```text
index.html               the site shell + config
build.py                 bundles content/ → assets/js/content.js (and tests snippets)
content/                 all lessons and projects (Markdown)
assets/js/runner-python.js   Pyodide runner (stdout, plots, tables, friendly errors)
```
