---
title: Datasets, Benchmarks, Leaderboards and Communities
level: intermediate
time: 25
summary: Where to find data to build and evaluate with, what each major benchmark actually measures (and how it gets contaminated or saturated), leaderboards worth watching, industry reports for context, and the communities, conferences and open-source projects where practitioners learn together. With a short guide to reading benchmark claims critically.
---

Data and evaluation resources are the raw materials of AI engineering. This lesson lists where to find them, what they measure, and how to avoid being fooled by headline numbers.

## Where to find datasets

- [Hugging Face Datasets](https://huggingface.co/datasets) — the main hub for text, image, audio and preference datasets, with a simple loading API.
- [Kaggle Datasets](https://www.kaggle.com/datasets) — community datasets plus competitions.
- [Common Crawl](https://commoncrawl.org) — the open web crawl behind many pretraining corpora.
- [FineWeb](https://huggingface.co/datasets/HuggingFaceFW/fineweb) — a large, carefully filtered web dataset with documented methodology.
- [MS MARCO](https://microsoft.github.io/msmarco/) — a large passage-ranking dataset for retrieval.
- [SQuAD Explorer](https://rajpurkar.github.io/SQuAD-explorer/) — the classic reading-comprehension dataset.
- [Spider](https://yale-lily.github.io/spider) and [BIRD](https://bird-bench.github.io) — text-to-SQL benchmarks.
- [Anthropic HH-RLHF](https://github.com/anthropics/hh-rlhf) — human preference data on helpfulness and harmlessness.
- [UltraFeedback](https://arxiv.org/abs/2310.01377) — a large synthetic preference dataset used for open preference tuning.

**For your own projects** the best dataset is usually **your own, small, carefully labelled set** built from real usage. Public data is good for learning, baselines and pretraining-style experiments.

## Benchmarks: what they measure

| Benchmark | Measures | Notes |
|---|---|---|
| [MMLU](https://arxiv.org/abs/2009.03300) | broad multiple-choice knowledge across 57 subjects | near saturation for frontier models; contamination concerns |
| [GPQA](https://arxiv.org/abs/2311.12022) | graduate-level science questions designed to be hard to search | harder successor-style test of expert knowledge |
| [GSM8K](https://arxiv.org/abs/2110.14168) | grade-school math word problems | mostly saturated |
| [MATH](https://arxiv.org/abs/2103.03874) | competition mathematics | reasoning models improved scores sharply |
| [HumanEval](https://arxiv.org/abs/2107.03374) | code synthesis from docstrings | small and saturated; real codebase tasks are harder |
| [SWE-bench](https://arxiv.org/abs/2310.06770) | resolving real GitHub issues with tests | the standard coding-agent evaluation |
| [TruthfulQA](https://arxiv.org/abs/2109.07958) | imitation of common falsehoods | probes truthfulness, with caveats |
| [MT-Bench](https://arxiv.org/abs/2306.05685) | multi-turn chat quality judged by an LLM | judge biases apply |
| [AgentBench](https://arxiv.org/abs/2308.03688) | agent performance across interactive environments | breadth of agent tasks |
| [tau-bench](https://arxiv.org/abs/2406.12045) | tool-using agents with simulated users and policies | tests reliability and policy following |
| [Humanity's Last Exam](https://arxiv.org/abs/2501.14249) | very hard expert questions across fields | designed to stay challenging |
| [BEIR](https://arxiv.org/abs/2104.08663) and [MTEB](https://arxiv.org/abs/2210.07316) | retrieval and embedding quality | choose embedding models with these, then test on your data |
| [HELM](https://arxiv.org/abs/2211.09110) | holistic multi-metric evaluation | emphasises breadth and transparency |

## Leaderboards worth watching

- [LMArena](https://lmarena.ai) — crowd-sourced head-to-head human preference rankings.
- [Artificial Analysis](https://artificialanalysis.ai) — independent comparisons of quality, speed and price across providers.
- [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — embedding model rankings.
- [Berkeley Function-Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) — tool-use accuracy.
- [SWE-bench leaderboards](https://www.swebench.com) — coding-agent results.
- [Epoch AI data](https://epoch.ai/data) — trends in compute, training runs and model capabilities.

## Industry reports for context

- [Stanford AI Index](https://hai.stanford.edu/ai-index) — an annual data-rich report on the state of AI.
- [State of AI Report](https://www.stateof.ai) — an annual review of research, industry and policy.
- [Anthropic Economic Index](https://www.anthropic.com/economic-index) — how AI is used in practice.

## Reading benchmark claims critically

Ask these questions before believing a number:

1. **What exactly is measured?** Multiple choice knowledge is not the same as doing your job.
2. **Is it saturated?** If top models score 95 percent or more, differences are noise and the benchmark no longer discriminates.
3. **Contamination?** Was test data in the training set? Newer or private test sets and dynamic benchmarks reduce this risk.
4. **How was the prompt chosen?** Few-shot count, chain of thought, tool access and sampling settings change scores a lot. Compare like with like.
5. **Single run or averaged?** Report variance; small gaps on small test sets are not significant.
6. **Who ran it?** Self-reported numbers are optimistic; independent evaluations are better.
7. **Does it match my task?** Run a **bake-off on your own data**: it is the only evidence that matters for your product.
8. **Cost and latency**: a model that is 1 point better but ten times slower or pricier may be the wrong choice.

## Communities and events

| Where | What you get |
|---|---|
| [Hugging Face forums](https://discuss.huggingface.co) | help with libraries, models and training |
| [MLOps Community](https://mlops.community) | practitioner talks, Slack and reading groups on production ML and LLMs |
| [AI Engineer](https://www.ai.engineer) | conferences and talks for AI engineers |
| [r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/) | news and experiments on running open models locally |
| [EleutherAI](https://www.eleuther.ai) | open research community behind evaluation and open models |
| [Kaggle](https://www.kaggle.com) | competitions, notebooks and discussion |
| GitHub repositories (vLLM, llama.cpp, LangGraph, MCP) | issues and discussions are a masterclass in real problems |
| Conferences: [NeurIPS](https://neurips.cc), [ICML](https://icml.cc), [ACL](https://aclweb.org) | research talks, tutorials and workshops; many recordings are public |
| Local meetups and hackathons | collaborators, feedback and job leads |

**How to participate well**: lurk first, read the pinned guidelines, search before asking, share a **minimal reproducible example** when you ask for help, answer questions you know, and contribute small fixes upstream.

```quiz
? Why can a benchmark score mislead you when choosing a model for a product?
+ It may be saturated, contaminated, measure a different task, or depend on prompt settings
- Benchmarks are always wrong
- Models ignore benchmarks
> Always bake off on your own data.

? Which resource helps compare embedding models?
+ The MTEB leaderboard
- MMLU
- HumanEval
> Then verify on your own retrieval set.

? Which source is best for independent comparisons of model quality, speed and price?
+ Artificial Analysis
- A vendor's launch post
- A random tweet
> Independent measurement beats self-reporting.

? What makes a good help request in a community forum?
+ A minimal reproducible example and what you already tried
- A vague complaint
- Posting in every channel
> It lets others help quickly.
```

:::keypoints
- Hugging Face Datasets, Kaggle, Common Crawl, FineWeb and task-specific sets provide data; your own small labelled set is usually the most valuable.
- Know what each benchmark measures: MMLU and GPQA (knowledge), GSM8K and MATH (math), HumanEval and SWE-bench (code), tau-bench and AgentBench (agents), BEIR and MTEB (retrieval), HELM (holistic).
- Watch independent leaderboards (LMArena, Artificial Analysis, MTEB, BFCL, SWE-bench) and read benchmark claims critically: saturation, contamination, prompt settings, variance.
- Join communities and contribute upstream; share minimal reproducible examples.
:::

:::resources
- [Hugging Face Datasets docs](https://huggingface.co/docs/datasets) — loading and processing datasets.
- [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) — run standard benchmarks yourself.
- [Inspect AI](https://inspect.aisi.org.uk) — build and run your own evals.
- [Epoch AI](https://epoch.ai) — data and analysis on AI progress.
- [Papers: HELM](https://arxiv.org/abs/2211.09110) — why holistic evaluation matters.
- [Your Product Needs Evals (Hamel Husain)](https://hamel.dev/blog/posts/evals/) — evaluating on your own data.
:::
