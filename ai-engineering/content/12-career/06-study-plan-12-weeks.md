---
title: A 12-Week Study Plan
level: easy
time: 20
summary: A concrete week-by-week plan that takes you through this course in roughly twelve weeks at eight to ten hours a week, with weekly outputs, checkpoints and a final portfolio. Includes a faster 6-week track for working engineers, a depth track, habits that make learning stick, and a self-assessment checklist with a runnable progress tracker.
---

Courses are finished by people who have **a schedule, weekly outputs and checkpoints**. This plan assumes **8 to 10 hours per week**: about half reading and watching, half hands-on. Adapt it freely: the order matters more than the pace.

## Principles

1. **Build every week.** Each week ends with something that runs.
2. **Evaluate from week 2.** Even tiny eval sets teach more than another tutorial.
3. **Depth over coverage.** If a topic clicks, stay; if it does not, build a small project on it, then move on.
4. **Write it down.** One paragraph per week: what I learned, what surprised me, what is still unclear.
5. **Revisit.** Reread earlier modules in weeks 7 and 12; understanding compounds.

## The 12-week plan

| Week | Focus | Course modules | Hands-on output |
|---|---|---|---|
| **1** | How LLMs work | Foundations (tokens, embeddings, attention, decoding) | run the tokenizer and sampling demos; write a 1-page explanation of next-token prediction in your own words |
| **2** | Talking to models | Foundations (training stages, prompting); LLM APIs (messages, parameters, structured output) | a script that extracts structured JSON from messy text, plus 30 labelled test cases and a field-accuracy score |
| **3** | Tools and cost | LLM APIs (tool calling, streaming, caching, batching, errors) | a tool-using assistant with retries and a per-request cost report |
| **4** | Context and memory | Context engineering and memory | a chat app that manages its context budget (summarise or trim) and remembers user facts |
| **5** | RAG, part 1 | RAG: chunking, embeddings, vector search, hybrid | a cited Q&A system over a corpus you care about, with a retrieval eval (recall@k) |
| **6** | RAG, part 2 | RAG: reranking, query rewriting, evaluation, production | improve week 5 using hybrid search and a reranker; table of before/after metrics |
| **7** | Agents | Agents: loops, workflows, MCP, reliability | a small agent (research or ticket triage) with a step budget, tracing, and an MCP-style tool |
| **8** | Evals and observability | Evals: golden sets, judges, tracing, CI | an eval harness with an LLM judge calibrated on 30 human labels; CI check that fails on regressions |
| **9** | Safety and security | Safety: injection, guardrails, privacy, red-teaming | red-team your own app (20 attacks), add defences, re-measure |
| **10** | Customisation and inference | Fine-tuning and Inference (read in full; build the LoRA and KV-cache projects) | explain, with numbers, when you would fine-tune or self-host; run the sizing calculators on a real scenario |
| **11** | Production and multimodal | LLMOps (architecture, scaling, cost) and Multimodal (VLMs, speech) | add streaming, rate limiting and cost budgets to your best project; try one image or audio feature |
| **12** | Portfolio and interviews | Career + Projects | polish two projects with READMEs, eval tables and case studies; do 10 concept questions and 2 design questions aloud |

### Weekly rhythm (about 9 hours)

| Day | Activity | Time |
|---|---|---|
| Mon | read the lessons, run every example | 2 h |
| Tue | finish lessons, take the quizzes, note questions | 1.5 h |
| Wed | start the build for the week | 1.5 h |
| Thu | build and write small tests or evals | 1.5 h |
| Fri | resources: one paper or long-form post from the lesson links | 1 h |
| Weekend | finish the output, write your weekly paragraph, interview card review | 1.5 h |

## Faster 6-week track (experienced engineers)

If you already ship software and know ML basics, compress:

| Week | Focus |
|---|---|
| 1 | Foundations skim, LLM APIs, structured output, tools, caching |
| 2 | Context engineering and RAG (build with an eval) |
| 3 | Agents and MCP; tracing |
| 4 | Evals, safety and security (red-team your RAG/agent) |
| 5 | Inference, fine-tuning decisions, LLMOps (cost, scaling, CI/CD) |
| 6 | Projects, system-design practice and interviews |

## Depth tracks (after week 12)

Choose one for the next quarter:

- **Evals and quality**: build a reusable evaluation platform, study judge calibration and statistics, publish an eval dataset.
- **Retrieval and knowledge systems**: advanced RAG, graph and multimodal retrieval, document AI pipelines at scale.
- **Agents and tooling**: durable execution, computer use, MCP servers, multi-agent patterns, agent evals.
- **Inference and platform**: serve models with vLLM/SGLang, quantisation, kernel basics, GPU economics, gateways.
- **Training and customisation**: SFT/LoRA/DPO on real data, distillation, reasoning RL with verifiable rewards.
- **Multimodal and voice**: real-time voice agents, VLM pipelines, generative media tools.

## Habits that make it stick

- **Retrieval practice**: after each lesson, close it and write three things you remember; then check. Use the quizzes and interview cards.
- **Spaced review**: revisit each module after one week and one month.
- **Build in public**: share a weekly note or repo; accountability helps.
- **Pair or form a study group**: explaining and debugging together doubles learning speed.
- **Keep a failure log**: every model failure you hit is a future interview story.
- **Protect your time**: fixed slots beat "when I have time".

## Self-assessment checklist

Rate yourself honestly (0 = never, 1 = with help, 2 = confidently):

| Skill | 0-2 |
|---|---|
| Explain tokenisation, attention and sampling to a non-expert | |
| Call an LLM API with streaming, tools and structured output | |
| Count tokens and estimate cost and latency for a feature | |
| Build a RAG pipeline and measure recall@k | |
| Debug a bad RAG answer to its root cause | |
| Design and run an eval with a calibrated judge | |
| Build a tool-using agent with budgets and tracing | |
| Describe prompt injection and three mitigations | |
| Decide between prompting, RAG and fine-tuning with evidence | |
| Explain KV cache, quantisation and continuous batching | |
| Design rate limiting, retries and fallbacks | |
| Sketch a system-design answer with numbers | |
| Present a project with results and failure analysis | |

Anything below 2 after week 12 is your next learning goal.

```python run title="A tiny progress tracker: turn your self-assessment into a study queue" level=easy
scores = {
    "Tokenisation, attention, sampling": 2,
    "APIs: streaming, tools, structured output": 2,
    "Token and cost estimation": 1,
    "RAG pipeline and recall@k": 1,
    "Debugging bad RAG answers": 0,
    "Evals with calibrated judges": 0,
    "Agents with budgets and tracing": 1,
    "Prompt injection and mitigations": 2,
    "Prompt vs RAG vs fine-tune decision": 1,
    "KV cache, quantisation, batching": 0,
    "Rate limiting, retries, fallbacks": 1,
    "System-design answers with numbers": 0,
}
total = sum(scores.values()); maximum = 2 * len(scores)
print(f"overall readiness: {total}/{maximum} = {total / maximum:.0%}")
queue = sorted(scores, key=lambda k: scores[k])
print("study next (lowest scores first):")
for skill in queue[:5]:
    print(f"  [{scores[skill]}] {skill}")
print("rule: pick the top item, read the lesson, build a small thing, retest in a week")
```

```quiz
? What should every study week end with?
+ Something that runs, plus a short written note of what you learned
- Only a list of videos watched
- A new framework installed
> Output makes learning concrete.

? When is the best time to start building evals?
+ In the first weeks, even with a tiny set
- After finishing all modules
- Never; use benchmarks
> Evals shape every later decision.

? How should you use the self-assessment?
+ Find the lowest-scoring skills and make them the next learning targets
- Aim for all 2s before building anything
- Ignore it
> Gaps guide the next steps.

? Which habit supports long-term retention?
+ Retrieval practice and spaced review of earlier modules
- Rereading once
- Skipping quizzes
> Testing yourself beats passive review.
```

:::problem You only have 4 hours a week. How would you adapt the plan? {level=easy tags="planning,study"}
Prioritise ruthlessly.

:::solution Model answer
Stretch to about 24 weeks and prioritise the core path: Foundations (skim), LLM APIs, RAG, Evals, Agents, Safety, LLMOps cost and scaling. Treat Fine-tuning, Inference internals and Multimodal as optional deep dives. Each fortnight: one module's lessons plus one small output (a script, an eval, a tool). Keep the weekly 30-minute writing habit, do interview cards in short bursts, and select just two projects to polish for your portfolio instead of many.
:::
:::

:::keypoints
- A schedule with weekly hands-on outputs beats passive consumption; evaluate from week 2.
- The 12-week plan runs from model fundamentals and APIs through RAG, agents, evals, safety, customisation, production and multimodal to portfolio and interviews.
- Experienced engineers can follow a 6-week track; afterwards pick a depth track.
- Use retrieval practice, spaced review, a failure log, study groups and fixed time slots.
- Self-assess honestly and let the lowest scores drive your next steps.
:::

:::resources
- [Hugging Face LLM Course](https://huggingface.co/learn/llm-course) — a free parallel curriculum.
- [DeepLearning.AI short courses](https://www.deeplearning.ai/short-courses/) — brief, hands-on courses on RAG, agents and evals.
- [Andrej Karpathy: Neural Networks, Zero to Hero](https://karpathy.ai/zero-to-hero.html) — build the fundamentals from scratch.
- [Anthropic Courses (GitHub)](https://github.com/anthropics/courses) — API fundamentals, prompt engineering and tool use notebooks.
- [Full Stack LLM Bootcamp materials](https://fullstackdeeplearning.com/llm-bootcamp/) — an application-focused curriculum.
- [Learning How to Learn (Coursera)](https://www.coursera.org/learn/learning-how-to-learn) — evidence-based study techniques.
:::
