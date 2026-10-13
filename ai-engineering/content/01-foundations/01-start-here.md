---
title: Start Here — What an AI Engineer Does
level: easy
time: 30
summary: The map for the whole course. What an AI engineer builds, how that differs from a data scientist or ML researcher, the anatomy of an LLM application, the build-evaluate-improve loop, how this course is organised, and a first language model you run in 15 lines.
---

Welcome. This course takes you from "I have used ChatGPT" to "I can design, build, evaluate, secure and ship an AI product, and explain every choice in an interview." It is long on purpose. Read it in order the first time, then use it as a reference.

:::def AI engineer
A software engineer who builds products on top of **pretrained foundation models** (mostly large language models, or LLMs). The job is less about inventing new models and more about **choosing, prompting, connecting, evaluating, securing, running and paying for** them, so that a probabilistic component behaves like reliable software.
:::

:::analogy
A **data scientist** is a chef who invents recipes. A **machine-learning researcher** is a farmer who breeds new ingredients. An **AI engineer** runs the restaurant: the ingredients (models) are bought in, and the work is the menu, the kitchen process, the quality checks, the food-safety rules, the speed during the rush, and the cost per plate.
:::

## What the job really looks like

| Role | Main question | Typical work |
|---|---|---|
| ML researcher | "Can a new method beat the state of the art?" | Architectures, training runs, papers |
| ML engineer | "How do we train and serve our own models reliably?" | Pipelines, GPUs, feature stores, deployment |
| Data scientist | "What does the data tell us?" | Analysis, experiments, classic ML |
| **AI engineer** | "How do we build a dependable product on top of existing models?" | Prompts, RAG, agents, evals, guardrails, cost, latency |

The boundaries blur, and small companies ask one person to do all four. The skills in this course are the **AI-engineer core**, plus enough depth about training and serving that you are never mystified by what is underneath.

## Anatomy of an LLM application

Almost every product you will build is a variation of one picture. Press ▶ to replay a request.

```viz algo=arch title="A typical LLM application" dir=down
user   User | question [user] @0,1
app    Your app | API, auth, session [service] @1,1
ctx    Context builder | prompt + memory [prompt] @2,1
rag    Retriever | search your knowledge [search] @3,0
kb     Vector store | documents, chunks [vector] @4,0
tools  Tools | APIs, code, database [tool] @3,2
llm    LLM | the foundation model [llm] @4,1
guard  Guardrails | check input and output [guard] @2,2.2
obs    Tracing + evals | logs, scores, cost [eval] @1,2.2
--
user -> app : message
app -> ctx
ctx -> rag : query
rag -> kb
ctx -> llm : prompt
llm <-> tools : tool calls
ctx -> guard
app ~> obs : every step traced
--
flow One question
user > app : A user asks: "What is the refund window for the X200?"
app > ctx : Load the session, the user's permissions, and the conversation so far.
ctx > rag : Turn the question into a search query and retrieve the most relevant passages.
rag > kb : Vector + keyword search returns the top chunks from the manuals.
ctx > llm : Assemble system prompt + retrieved chunks + question, within the token budget, and call the model.
llm > tools : If the model needs a live fact (order status), it asks for a tool call; your code runs it and returns the result.
ctx > guard : Check the answer: grounded in the sources? no leaked data? right format?
app > obs : Log the prompt, retrieved chunks, tool calls, tokens, latency and cost. Scores run on a sample.
```

Each box is a module of this course:

:::flow The course in one line
Understand models | tokens, attention, training, sampling
Call them | APIs, prompts, structured output, tools
Give them context | memory, RAG
Let them act | agents, MCP
Prove it works | evals, observability
Keep it safe | injection, guardrails, privacy
Adapt and run it | fine-tuning, inference, serving
Ship it | LLMOps, UX, cost
:::

## The loop that matters most

:::flow Build → Evaluate → Improve
Build a simple version | one prompt, one model call
Write down what "good" means | 20-50 real examples with expected behaviour
Measure | run the examples, look at the failures
Change ONE thing | prompt, model, retrieval, tool, data
Measure again | did it get better, and what got worse?
:::

Beginners spend 90% of their time on step 1 and 0% on steps 2 and 5. Professionals invert that. Almost every lesson here ends by asking: **how would you test that?**

:::tip The one habit that separates good AI engineers
Read your data. Open 50 real conversations, traces or outputs and read them with your own eyes. You will find the real problems faster than any dashboard will.
:::

## Your first language model, in 15 lines

You can already do something real: a **bigram model** learns, from a tiny text, which word tends to follow which, then writes new text by repeatedly picking a likely next word. A real LLM does the same job ("predict the next token") with a vastly better predictor.

```python run title="A language model from counting" level=easy
import numpy as np

text = ("the cat sat on the mat . the dog sat on the log . "
        "the cat saw the dog . the dog saw the cat .").split()

vocab = sorted(set(text))
idx = {w: i for i, w in enumerate(vocab)}

# count how often word B follows word A
counts = np.zeros((len(vocab), len(vocab)))
for a, b in zip(text, text[1:]):
    counts[idx[a], idx[b]] += 1

probs = counts / counts.sum(axis=1, keepdims=True)      # each row sums to 1

print("after 'the':", {w: round(float(p), 2) for w, p in zip(vocab, probs[idx['the']]) if p > 0})

rng = np.random.default_rng(7)
word, out = "the", ["the"]
for _ in range(11):
    word = vocab[rng.choice(len(vocab), p=probs[idx[word]])]
    out.append(word)
print(" ".join(out))
```

Change the text, the seed, or the number of words and run it again. Every lesson in this module is a step toward understanding what replaces that little table of counts: a neural network with billions of parameters that looks at **all** previous tokens instead of only the last one.

## How to use this course

- **Plain English first.** Every idea starts with an analogy and a picture, then the precise definition.
- **Run everything.** Blocks marked ▶ Run execute Python (with NumPy) in your browser. Edit them and break them. Blocks marked *Run locally* call real model APIs and need your own key; copy them into a notebook.
- **Simulators.** Drag the sliders: temperature, chunk size, quantization bits, batch size. You will remember what you saw move.
- **Quick checks and interview questions.** Quizzes confirm you got it. The *Interview Qs* page collects the questions, each with hints.
- **Projects.** The last module builds 14 systems from scratch. Do at least half of them.
- **Go deeper.** Every lesson ends with hand-picked papers, docs and videos, and the *Resource Library* collects courses, books and communities.

:::note Prerequisites
You should be comfortable reading Python: functions, lists, dictionaries, classes. If not, take the first modules of **PyGenAI** (the Python course in this same site) first. No machine-learning background is needed. When we need math (vectors, probability, a derivative) we build it from the ground up.
:::

## About model names and prices

Models are released every few weeks. This course teaches **ideas that stay true** (tokens, attention, retrieval, evals, caching) and uses concrete model names only in code. Examples use Anthropic's `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`; the same patterns work with any provider. Prices and limits in the calculators are **editable examples**, never a promise: always check the provider's pricing page.

```quiz
? Which description best fits an AI engineer?
- Someone who trains new foundation models from scratch every quarter
- Someone who only writes prompts in a chat window
+ Someone who builds reliable products on top of pretrained models: context, tools, evals, safety, cost and latency
- Someone who labels data for other teams
> The job is engineering around a probabilistic component. Prompting is one skill among many, and training from scratch is the researcher's job.

? What is the single most valuable habit when improving an AI system?
- Switching to the newest model every week
+ Defining what good looks like with real examples, measuring, changing one thing, and measuring again
- Making the prompt longer
> Without a measurement loop you cannot tell whether a change helped. The newest model may help, but you need evals to know.

? In the bigram model above, what does the model use to pick the next word?
- The whole sentence so far
- A dictionary of grammar rules
+ Only the previous word, via counted probabilities
> That is exactly the limitation an LLM removes: it conditions on all previous tokens, not just one.
```

:::keypoints
- An AI engineer builds dependable products on top of pretrained models; the craft is context, tools, evals, safety, cost and latency.
- Every LLM app is a variation of: app → context builder → (retriever, tools) → model → guardrails → tracing.
- The core loop is build → define "good" → measure → change one thing → measure again.
- Read real outputs. Evals start from looking at data.
- A language model predicts the next token; an LLM is a very good predictor of it.
:::

:::resources
- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic's clear-eyed guide to what to build and when to keep it simple.
- [AI Engineering (Chip Huyen)](https://www.oreilly.com/library/view/ai-engineering/9781098166298/) — the book most aligned with this course; read it alongside.
- [Latent Space: the rise of the AI Engineer](https://www.latent.space/p/ai-engineer) — the essay that named the role.
- [Hugging Face LLM Course](https://huggingface.co/learn/llm-course) — free, hands-on, a good second path.
- [Andrej Karpathy: Intro to Large Language Models (video)](https://www.youtube.com/watch?v=zjkBMFhNj_g) — one hour, the best mental model of an LLM.
:::
