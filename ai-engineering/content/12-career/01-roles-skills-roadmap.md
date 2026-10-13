---
title: AI Engineering Roles, Skills and Roadmap
level: easy
time: 25
summary: What an AI engineer actually does, how the role differs from ML engineer, data scientist, research scientist and software engineer, the skills that matter (and the ones that do not), a skill ladder from junior to staff, what hiring managers look for, and a map from this course's modules to job requirements.
---

"AI engineer" is a young title and companies use it loosely. This lesson gives you a clear picture of the work, the neighbouring roles, and what to learn so you can get hired and then grow.

## What an AI engineer does

An AI engineer **builds products and systems on top of foundation models**. The model is mostly a service or an open-weight artifact you adapt, not something you train from scratch. A typical week mixes:

- Turning a vague product idea into a **measurable task** and a first working prototype.
- **Prompting, context engineering, retrieval and tool use** to make the model reliable on that task.
- **Building evals** and looking at data to find failure modes.
- Shipping: APIs, streaming, queues, caching, cost and latency work, observability.
- **Safety, privacy and security** hardening.
- Sometimes **fine-tuning or distilling** a model, or deploying open models.
- Talking to users, product managers, domain experts and other engineers.

It is **software engineering with a probabilistic component**. The best AI engineers are strong engineers who have learned the habits that non-deterministic systems demand: measure everything, expect surprises, and design for failure.

## How it differs from neighbouring roles

| Role | Core focus | Typical tools | Overlap with AI engineering |
|---|---|---|---|
| **AI engineer** | products and systems on foundation models | model APIs, RAG, agents, evals, serving, TypeScript/Python | the subject of this course |
| **ML engineer** | training and deploying custom models, pipelines, MLOps | PyTorch, feature stores, training infra, Kubernetes | fine-tuning, serving, evals |
| **Data scientist / analyst** | analysis, experimentation, classical modelling, insight | SQL, notebooks, statistics, scikit-learn | evaluation, experiment design, data analysis |
| **Research scientist / engineer** | new methods, models, training at scale | PyTorch/JAX, distributed training, papers | deep understanding of models; less product work |
| **Software engineer (product/backend)** | applications, services, reliability | languages, databases, cloud | the foundation AI engineers build on |
| **Data engineer** | data pipelines and platforms | Spark, warehouses, orchestration | ingestion for RAG, feedback data |
| **Prompt engineer** (title fading) | writing and testing prompts | playgrounds, eval tools | one skill inside AI engineering |
| **Applied scientist** | applied modelling with research flavour | mix of the above | evals, fine-tuning, ranking |
| **AI product manager / designer** | what to build and how it feels | user research, metrics | UX, evals, scoping |

Most job postings blend these. Read the **responsibilities**, not the title.

## The skill map

```viz algo=arch title="The AI engineer's skill stack" dir=down
sw    Software engineering | Python/TypeScript, APIs, testing, Git, cloud [service] @0,1
llm   LLM fundamentals | tokens, attention, decoding, training stages [llm] @1,0
api   API and prompting | structured output, tools, caching, streaming [prompt] @1,1
data  Data and retrieval | embeddings, search, chunking, pipelines [vector] @1,2
ag    Agents and workflows | tool loops, MCP, orchestration [agent] @2,0
ev    Evals and observability | datasets, judges, tracing [eval] @2,1
sf    Safety and security | injection, privacy, guardrails [guard] @2,2
ops   Production | scaling, cost, latency, CI/CD [monitor] @3,1
prod  Product sense | UX, metrics, scoping, communication [user] @4,1
--
sw -> api
llm -> api
data -> ag
api -> ag
api -> ev
ag -> ev
ev -> ops
sf -> ops
ops -> prod
```

### What matters most

1. **Solid software engineering.** Clean code, APIs, async, testing, version control, debugging, databases, cloud basics. Most failures in AI products are engineering failures.
2. **Evaluation skills.** Defining success, building datasets, reading traces, error analysis, metrics, judge calibration. This is the highest-leverage and most under-learned skill.
3. **Retrieval and context engineering.** Most real applications are really about getting the right information to the model.
4. **Systems thinking.** Latency, cost, reliability, rate limits, caching, queues.
5. **Product sense and communication.** Choosing problems where AI helps, explaining limits to stakeholders, designing safe UX.
6. **Fundamentals of how models work.** Enough to reason about behaviour: tokenisation, attention, context, sampling, training stages, fine-tuning trade-offs.
7. **Security and responsible-AI awareness.** Injection, privacy, bias, regulation basics.

### What matters less than people think

- Deriving backpropagation by hand (understand it conceptually; you will rarely implement it).
- Memorising every new model name or benchmark (learn how to **evaluate on your own task** instead).
- Using the newest framework (frameworks come and go; the patterns persist).
- A PhD (helpful for research roles, not required for most AI engineering).

### Maths you actually need

Probability (distributions, expectation, softmax and cross-entropy), linear algebra basics (vectors, dot products, matrix multiplication, cosine similarity), a little calculus (gradients, intuition for optimisation), and **statistics for evals** (sampling error, confidence intervals, A/B tests). The foundations module covers the intuition with runnable code.

## Skill ladder

| Level | Scope | Evidence of readiness |
|---|---|---|
| **Junior** | implements well-specified features with guidance | builds RAG or tool-calling prototypes, writes basic evals, reads traces, ships small improvements |
| **Mid** | owns a feature end to end | designs the eval set, picks retrieval and prompt strategy, handles cost and latency, runs experiments, communicates trade-offs |
| **Senior** | owns a system and sets technical direction | architecture across services, reliability and safety plans, build-vs-buy calls, mentors, ties work to business metrics |
| **Staff+** | shapes platform, strategy and standards across teams | eval and gateway platforms, org-wide practices, hard ambiguous problems, influence |

Progress comes from **owning outcomes** (a measured improvement in a real product), not from collecting tools.

## What hiring managers look for

- **Evidence you shipped something**: a deployed demo, an open-source contribution, a real internal tool. Working systems beat certificates.
- **Judgement about quality**: can you say how you would know it works, and show an eval?
- **Honesty about failure modes**: you know where LLMs break and how to design around it.
- **Engineering fundamentals**: readable code, tests, version control, debugging.
- **Cost and latency awareness**.
- **Clear communication**: explaining trade-offs to non-experts.

Red flags: "just prompt it" with no evals, framework name-dropping without understanding, ignoring security and privacy, no evidence of finishing projects.

## Paths in

| Background | Fast path |
|---|---|
| **Software engineer** | ship an AI feature at work, build the projects in this course, learn evals deeply; the shortest path |
| **Data scientist / ML engineer** | strengthen software engineering and production skills (APIs, async, deployment); add RAG, agents, evals |
| **New graduate or career changer** | strong Python and engineering basics first, then 3 to 4 portfolio projects with evals and writeups; contribute to open source |
| **Researcher** | practise product delivery: reliability, UX, cost, communication |
| **Domain expert** (law, medicine, finance, ops) | pair domain knowledge with engineering skills; domain-specific AI products are a strong niche |

## Map: this course to the job

| Job requirement | Modules |
|---|---|
| "Experience with LLM APIs" | Foundations, LLM APIs |
| "Build RAG pipelines" | Context, RAG |
| "Agentic systems, tool use, MCP" | Agents |
| "Evaluation frameworks" | Evals |
| "Responsible AI, security" | Safety, LLMOps |
| "Fine-tuning and open models" | Fine-tuning, Inference |
| "Multimodal applications" | Multimodal |
| "Production and scale" | LLMOps |
| "Portfolio and interviews" | Projects, Career |

```quiz
? Which skill is described as the highest leverage and most under-learned for AI engineers?
+ Building evaluations and doing error analysis on real data
- Memorising model names
- Deriving gradients by hand
> Evals tell you whether anything you do actually works.

? How does an AI engineer mainly differ from an ML engineer?
+ AI engineers build products on foundation models; ML engineers focus on training and deploying custom models
- AI engineers never write code
- ML engineers never use Python
> The roles overlap in fine-tuning, serving and evaluation.

? What counts as the strongest evidence for hiring managers?
+ A shipped project with an eval and an honest account of its failure modes
- A list of certificates
- Knowing every framework
> Evidence of judgement and delivery beats credentials.

? Which maths is most directly useful day to day?
+ Probability, vectors and cosine similarity, and basic statistics for evaluation
- Differential geometry
- Number theory
> Intuition for softmax, embeddings and confidence intervals covers most needs.
```

:::problem A friend with five years of backend experience asks how to become an AI engineer in six months while employed. What would you tell them to do? {level=easy tags="career,roadmap"}
Give a plan with concrete outputs.

:::solution Model answer
Start from their strength (backend). Month 1: foundations and APIs (tokens, context, prompting, structured output, tool calling) with small scripts. Month 2: RAG with their own data; build an eval set. Month 3: agents and workflows with one real tool integration; add tracing. Month 4: safety, cost and latency work; deploy something behind an API with streaming. Month 5: pick one deeper area (fine-tuning/inference or multimodal). Month 6: polish two portfolio projects with write-ups, evals and a short demo; apply the skills at work if possible (internal tools are the fastest route to real experience), then interview with the system-design and concept practice from this course. Output each month: a working project, not just notes.
:::
:::

:::keypoints
- AI engineers build products and systems on foundation models: prompting, context and retrieval, tools, evals, shipping, safety, sometimes fine-tuning.
- The role overlaps with ML engineering, data science, research and software engineering; read responsibilities, not titles.
- Highest-value skills: software engineering, evals, retrieval and context engineering, systems thinking, product sense, and enough model fundamentals to reason about behaviour.
- You need practical probability, vectors, and statistics for evals; not heavy theory.
- Hiring managers want shipped projects, evaluation judgement, honesty about failure modes and engineering fundamentals.
- Choose a path based on your background; progress by owning measurable outcomes.
:::

:::resources
- [The Rise of the AI Engineer (swyx)](https://www.latent.space/p/ai-engineer) — the essay that named the role.
- [Chip Huyen: AI Engineering (book page)](https://huyenchip.com/books/) — the most complete book on the discipline.
- [Hugging Face LLM Course](https://huggingface.co/learn/llm-course) — free, practical.
- [DeepLearning.AI short courses](https://www.deeplearning.ai/short-courses/) — hands-on courses with industry partners.
- [Hamel Husain's blog](https://hamel.dev/blog/) — eval-focused practitioner writing.
- [Latent Space podcast](https://www.latent.space) — conversations with AI engineers.
:::
