---
title: Interview Concept Questions (Rapid Fire)
level: mixed
time: 70
summary: Around forty concept questions with model answers, grouped by topic — LLM fundamentals, prompting and APIs, RAG, agents, evals, fine-tuning, inference, safety and production. Try to answer aloud before opening each solution. Good answers are short, correct, and mention a trade-off or a failure mode.
---

How to use this page: **cover the solution, answer aloud in under 60 seconds, then compare.** Strong answers have four parts: a one-line definition, how it works, when it matters (or fails), and a trade-off or example. Difficulty tags (easy, medium, hard) show the depth interviewers might push to.

## LLM fundamentals

:::problem What is a token, and why do tokens (not words) matter for engineers? {level=easy tags="tokens,fundamentals"}
Think cost, limits, and weird failures.

:::solution Model answer
A token is a unit of text produced by a tokenizer (often byte-pair-encoding subwords). Models read and write tokens, so **context limits, latency and price are all measured in tokens**, not words. Tokenisation explains odd behaviours: poor character-level tasks (counting letters), uneven cost across languages (non-English text often needs more tokens), and sensitivity to whitespace and formatting. Engineers count tokens to budget context, estimate cost, and chunk documents.
:::
:::

:::problem Explain self-attention in plain terms. Why is it quadratic, and how is that mitigated? {level=medium tags="attention,transformer"}
Queries, keys, values, and the cost.

:::solution Model answer
Each token produces a **query**, **key** and **value** vector. A token's output is a weighted average of all values, with weights from a softmax over query·key similarities, so every token can pull information from every other token. Computing all pairwise scores costs **O(n²)** time and memory in sequence length n. Mitigations: **FlashAttention** (exact, avoids materialising the n×n matrix in slow memory), **KV caching** at inference (reuse past keys and values), **grouped/multi-query attention** (smaller KV cache), **sliding-window or sparse attention**, and long-context training tricks. Cost in practice is dominated by memory movement, not just FLOPs.
:::
:::

:::problem What do temperature, top-p and top-k do? When would you set temperature to 0? {level=easy tags="decoding,sampling"}
Describe the effect on the distribution.

:::solution Model answer
The model outputs a probability distribution over next tokens. **Temperature** rescales logits before softmax (low = sharper, more deterministic; high = flatter, more random). **Top-k** keeps only the k most likely tokens; **top-p (nucleus)** keeps the smallest set whose cumulative probability exceeds p. Use low temperature for extraction, classification, code and tool arguments where consistency matters; higher for creative tasks. Even at temperature 0 outputs can vary slightly across runs (hardware non-determinism, batching), and some newest models restrict sampling parameters, so do not rely on bit-exact repeatability.
:::
:::

:::problem What are the training stages of a modern assistant model? {level=medium tags="training,rlhf"}
Pretraining through preference and reasoning training.

:::solution Model answer
**Pretraining** on huge text corpora with next-token prediction gives knowledge and language ability. **Supervised fine-tuning (instruction tuning)** teaches the assistant format and following instructions from curated demonstrations. **Preference optimisation** (RLHF, DPO and relatives) shapes helpfulness, tone and safety from human or AI preference data. Newer **reinforcement learning on verifiable rewards** (math, code) trains reasoning behaviour, producing models that think before answering. Afterwards come safety training, evals and red-teaming. Each stage changes behaviour differently: pretraining adds knowledge, later stages mainly steer how it is used.
:::
:::

:::problem Why do LLMs hallucinate, and what reduces it? {level=medium tags="hallucination,reliability"}
Cause first, then mitigations.

:::solution Model answer
Models are trained to produce plausible continuations, not to verify truth, and they have no built-in notion of "I don't know" unless trained for it. Hallucinations rise when knowledge is missing, outdated, rare, or when prompts invite guessing. Mitigations: **ground answers in retrieved sources** and require citations, give the model **permission to say it does not know**, constrain output with schemas, **verify with code or tools** (calculators, search, databases), use stronger models for hard facts, add **groundedness checks** and evals, and keep humans in the loop for high-stakes decisions. You cannot eliminate hallucination, so design the system to detect and contain it.
:::
:::

:::problem What is the context window and what problems come from filling it? {level=medium tags="context,long-context"}
Cost, latency, and quality.

:::solution Model answer
The context window is the maximum number of tokens (input plus output) a model can attend to in one call. Filling it raises **cost and latency** (prefill scales with input), and quality can degrade: models may miss information buried in the middle ("lost in the middle"), get distracted by irrelevant text, or suffer **context rot** as the window fills. Good practice: put only relevant content in, order it sensibly, use retrieval and summarisation, cache stable prefixes, and test long-context behaviour with your own data.
:::
:::

## Prompting and APIs

:::problem How do you make an LLM return reliable JSON? {level=easy tags="structured-output,api"}
Go from weakest to strongest techniques.

:::solution Model answer
Weakest: ask nicely in the prompt. Better: provide a schema and examples, then **validate and retry** with the error message. Best: use **structured outputs / constrained decoding** supported by the API (schema-enforced), plus semantic validation in code (ranges, enums, cross-field checks). Keep schemas simple, make fields optional where the data may be missing, and handle refusals and truncation (`max_tokens`) explicitly.
:::
:::

:::problem Explain tool calling. What happens on each turn? {level=medium tags="tools,agents"}
Who runs the tool?

:::solution Model answer
You send tool definitions (name, description, JSON schema). The model may respond with a **tool-use request** (tool name and arguments) instead of final text. **Your code** validates and executes the tool, then sends the result back as a tool-result message; the model continues, possibly calling more tools, until it answers. The model never executes anything itself. Important details: tool descriptions act as prompts, arguments must be validated, errors should be returned in a structured way, and risky actions need permission checks and confirmation.
:::
:::

:::problem What is prompt caching and how do you structure prompts to benefit? {level=medium tags="caching,cost"}
Prefix matching.

:::solution Model answer
Providers can cache the processed form of a **prompt prefix** so repeated requests with the same prefix skip recomputation: cheaper cached input tokens and lower time to first token. The prefix must match exactly, so put **stable content first** (system prompt, tool definitions, reference documents) and **variable content last** (user message, timestamps, ids). Watch cache lifetimes, minimum sizes, and avoid inserting changing values early. Monitor the cache hit rate.
:::
:::

:::problem Few-shot prompting versus fine-tuning: how do you decide? {level=medium tags="prompting,fine-tuning"}
Think cost, volume, and stability.

:::solution Model answer
Start with prompting (instructions plus a few good examples): fast to iterate and needs no training. Move to **fine-tuning** when you have a stable, narrow, high-volume task where prompts are long and expensive, you need a consistent style or format, latency matters, or a small model must match a big one (distillation). Fine-tuning teaches behaviour, not new facts; use retrieval for knowledge. Decide with evals: if prompting plus retrieval meets quality at acceptable cost, stop.
:::
:::

## Retrieval-augmented generation

:::problem Describe the components of a RAG system and its main failure points. {level=medium tags="rag,design"}
Ingestion through generation.

:::solution Model answer
Offline: **ingest** documents, **parse and clean**, **chunk**, **embed**, and **index** with metadata. Online: **rewrite** the query, **retrieve** (dense, sparse or hybrid), **rerank**, build the **prompt with citations**, **generate**, and **verify**. Failure points: bad parsing (tables, PDFs), poor chunking (split context), retrieval misses (wrong embedding model, no hybrid search), irrelevant or too many chunks, stale index, permission leaks, the model ignoring context or hallucinating anyway. Debug by checking retrieval first (is the right chunk in the top-k?), then generation.
:::
:::

:::problem How do you choose chunk size and overlap? {level=medium tags="rag,chunking"}
There is no universal answer.

:::solution Model answer
Chunks must be **small enough to be specific and fit the budget**, **large enough to carry meaning**. Start with structure-aware chunking (headings, paragraphs, code blocks) around 200 to 800 tokens with modest overlap, attach metadata (title, section path, source), and sometimes **retrieve small chunks but return the parent section**. Tune with a retrieval eval (recall@k, nDCG) on real queries. Different content types (FAQs, contracts, code, tables) need different strategies.
:::
:::

:::problem Why use hybrid search and a reranker? {level=medium tags="rag,retrieval"}
Different strengths of sparse and dense.

:::solution Model answer
**Dense embeddings** capture meaning and paraphrase but can miss exact terms (IDs, rare names, error codes). **BM25/sparse search** nails exact keywords but misses synonyms. **Hybrid search** merges both (for example with reciprocal rank fusion) for higher recall. A **cross-encoder reranker** then scores query-passage pairs jointly on the top 50 to 100 candidates for much better precision, at extra latency and cost. Evaluate each addition by recall@k and end-to-end answer quality.
:::
:::

:::problem Your RAG answers are wrong in production. How do you debug? {level=hard tags="rag,debugging"}
Isolate retrieval from generation.

:::solution Model answer
Collect failing cases with traces. For each, check: (1) **Was the answer in the corpus?** If not, it is a content or ingestion issue. (2) **Was the right chunk retrieved in the top-k?** If not, examine chunking, embedding model, query rewriting, hybrid search, filters, reranking. (3) **Was it in the prompt but ignored?** Look at ordering, context length, conflicting chunks, prompt wording, or a weaker model. (4) **Was the generation unfaithful?** Add citation requirements, groundedness checks. Fix the root cause, add the case to a regression eval set, and measure retrieval and generation separately from then on.
:::
:::

:::problem How would you evaluate a RAG system offline? {level=hard tags="rag,evals"}
Retrieval metrics plus answer metrics.

:::solution Model answer
Build a dataset of realistic questions with reference answers and the supporting passages. Measure **retrieval** (recall@k, MRR, nDCG, context precision) and **generation** (faithfulness/groundedness to retrieved context, answer correctness vs reference, citation accuracy, refusal behaviour when no answer exists) with deterministic checks plus **calibrated LLM judges**. Slice by question type and source. Include unanswerable and adversarial questions. Track cost and latency. Validate judges against human labels, and keep the set fresh with production samples.
:::
:::

## Agents

:::problem What is the difference between a workflow and an agent, and which should you start with? {level=medium tags="agents,workflows"}
Who controls the flow?

:::solution Model answer
In a **workflow**, code defines the sequence of LLM calls and tools (prompt chaining, routing, parallelisation, evaluator loops); in an **agent**, the model decides the next step in a loop using tools until it reaches a goal. Start with the simplest thing that works: a single call, then a workflow; use agents only when the path cannot be predetermined. Agents are more flexible but costlier, slower, harder to evaluate and more prone to compounding errors, so add step limits, budgets, logging and human approval for risky actions.
:::
:::

:::problem What is MCP and why does it exist? {level=easy tags="mcp,tools"}
Standardising tool integration.

:::solution Model answer
The **Model Context Protocol** is an open standard for connecting AI applications to tools, data and prompts through servers that expose capabilities in a uniform way. It replaces bespoke integrations per app and per tool: build a server once, use it from any compatible client. Security considerations matter: servers are code you run, tool descriptions can be poisoned, and permissions and authentication must be handled carefully.
:::
:::

:::problem Why do agents fail on long tasks, and how do you improve reliability? {level=hard tags="agents,reliability"}
Compounding errors and context.

:::solution Model answer
Per-step errors compound (95% per step is about 60% over ten steps), context fills with noise, plans drift, tools return unexpected results, and loops can repeat. Improve with: clear tool design and descriptions, **smaller scoped steps**, explicit plans and **checkpoints**, validation after each step, **memory and context management** (summarise, store notes externally), retries with different strategies, **step and cost limits**, human approval at risky points, strong evals on full trajectories, and tracing to find where runs go wrong.
:::
:::

:::problem What is prompt injection and why can it not be fully solved by prompting? {level=medium tags="security,injection"}
Instructions and data share one channel.

:::solution Model answer
Prompt injection hides instructions in content the model processes (a web page, email, document, tool result), causing it to deviate from the developer's or user's intent. Because models receive instructions and data in the same token stream and cannot reliably distinguish them, prompt defences reduce but do not remove the risk. Defence in depth: treat untrusted content as data, **least-privilege tools**, separate read from write capabilities, human confirmation for consequential actions, output filtering, sandboxing, and breaking the "lethal trifecta" (private data + untrusted content + external communication) in the same agent.
:::
:::

## Evaluation

:::problem How do you evaluate an LLM feature with no ground-truth labels? {level=medium tags="evals,judge"}
Start by looking at data.

:::solution Model answer
Read real examples and write down failure modes (error analysis), then turn them into **criteria and test cases**. Use **reference-free checks** (format validity, groundedness to context, policy rules), **pairwise comparisons** between versions, and **LLM-as-judge** with explicit rubrics, calibrated on a small human-labelled set (measure agreement). Add human review for samples, and online signals (acceptance, edits). Treat the eval set as a living artifact fed from production failures.
:::
:::

:::problem What are the pitfalls of LLM-as-judge? {level=medium tags="evals,judge"}
Biases and drift.

:::solution Model answer
Judges show **position bias**, **verbosity bias**, **self-preference** (favouring their own model's style), inconsistent scoring, and sensitivity to prompt wording. Mitigate with clear rubrics, pairwise comparison with order swapping, structured outputs, multiple samples or judges, calibration against human labels, using a different (and strong) model family as judge, and spot-checking. Re-validate when the judge model or rubric changes.
:::
:::

:::problem Why are public benchmarks not enough to pick a model for your product? {level=easy tags="evals,benchmarks"}
Distribution mismatch and contamination.

:::solution Model answer
Benchmarks measure general abilities on public tasks; your product has its own inputs, constraints, languages, tone and failure costs. Scores can be inflated by **training contamination** or by prompt tuning to the benchmark, and they ignore latency, cost and operational behaviour. Use benchmarks to shortlist, then run a **bake-off on your own golden set**, sliced by task type, and measure cost, latency and failure modes.
:::
:::

## Fine-tuning and inference

:::problem Explain LoRA and why it is popular. {level=medium tags="lora,fine-tuning"}
Low-rank updates.

:::solution Model answer
Instead of updating a large weight matrix W, LoRA freezes it and learns a low-rank update **ΔW = B·A**, where A and B are small matrices of rank r. Only A and B are trained, so **trainable parameters, optimiser memory and checkpoint size drop by orders of magnitude**, adapters are easy to swap per task or customer, and quality is often close to full fine-tuning. **QLoRA** also quantises the frozen base to 4-bit to fit large models on small GPUs. Trade-offs: capacity limits for large behavioural shifts, and hyperparameters (rank, alpha, target modules) matter.
:::
:::

:::problem Explain the KV cache and why decoding is memory-bound. {level=hard tags="inference,kv-cache"}
Prefill versus decode.

:::solution Model answer
During generation, each new token attends to all previous tokens' keys and values. The **KV cache** stores them so they are not recomputed, turning per-step work from quadratic to linear in length. **Prefill** (processing the prompt) is compute-bound and parallel; **decode** generates one token at a time and must read all model weights and the KV cache from GPU memory for each step, so it is **memory-bandwidth-bound**. KV cache size grows with batch size, sequence length, layers and heads, limiting concurrency; remedies include grouped-query attention, quantised or paged KV caches (PagedAttention), continuous batching, and prefix caching.
:::
:::

:::problem What does quantisation do and what are the trade-offs? {level=medium tags="inference,quantization"}
Precision versus size.

:::solution Model answer
Quantisation stores weights (and sometimes activations or KV cache) in fewer bits (for example 8-bit or 4-bit instead of 16-bit), shrinking memory and often speeding memory-bound decoding. Trade-offs: some accuracy loss (small at 8-bit, more at 4-bit and below, worse for small models and sensitive tasks), hardware and kernel support, and calibration effort. Always evaluate the quantised model on your tasks.
:::
:::

:::problem What is continuous batching and why does it matter? {level=medium tags="inference,batching"}
Static batching wastes capacity.

:::solution Model answer
With static batching, a batch waits for its slowest sequence, leaving GPU slots idle when short outputs finish early. **Continuous (in-flight) batching** schedules at the token level: finished sequences leave immediately and new requests join, keeping the GPU busy and greatly improving throughput and latency under mixed loads. It underlies servers such as vLLM, SGLang and TensorRT-LLM, often together with paged KV memory.
:::
:::

:::problem What is speculative decoding? {level=hard tags="inference,latency"}
Draft and verify.

:::solution Model answer
A small **draft model** proposes several tokens; the large model **verifies them in one parallel pass**, accepting the longest correct prefix (with a rejection scheme that preserves the large model's output distribution). Since verification of k tokens costs about one decode step, you get multiple tokens per large-model pass when the draft is often right, reducing latency without changing the output distribution. Gains depend on acceptance rate and workload; variants include self-speculation and multi-token prediction heads.
:::
:::

## Safety and production

:::problem How do you handle PII in an LLM application? {level=medium tags="privacy,safety"}
Minimise, redact, control.

:::solution Model answer
**Minimise** what you send, **detect and redact** PII before logging or sending to third parties (pattern matching plus NER or classifiers), tokenise identifiers when the model needs consistency, enforce **retention limits** and access control, honour deletion requests across logs, caches and datasets, choose providers with appropriate data terms (zero retention, regional processing), and add output filters. Document data flows for compliance (GDPR and others).
:::
:::

:::problem Provider calls start returning 429s and timeouts during a traffic spike. What do you do? {level=medium tags="scaling,reliability"}
Short term and long term.

:::solution Model answer
Immediate: **retry with exponential backoff and jitter**, honour retry-after, shed load or degrade (cheaper path, shorter responses), and prioritise interactive traffic. Structural: a **token-aware client-side rate limiter and queue**, per-tenant quotas, caching, routing to a **fallback model/provider** with a circuit breaker, moving batch work to the batch API, capacity or tier increases, and monitoring (429 rate, queue depth, tokens per minute, p95 latency). Run a load test with realistic token sizes.
:::
:::

:::problem Your costs doubled after a prompt change that improved quality. How do you respond? {level=medium tags="cost,evals"}
Do not just revert.

:::solution Model answer
Break the cost down (input tokens, output tokens, number of calls, retries, cache hit rate). Common culprits: longer prompts, extra retrieval, verbose outputs, lost cache hits (prefix changed), or added judge/tool calls. Optimise with evals as a guard: restore cache-friendly prefix ordering, trim context, constrain output length, route easy cases to a smaller model with a verifier, and cache repeated work. Compare cost per successful task before and after and decide with product owners whether the quality gain justifies the remaining cost.
:::
:::

:::problem What would you log for an LLM application and why? {level=easy tags="observability,logging"}
Reproducibility.

:::solution Model answer
Per request: trace id, user/tenant (pseudonymised), prompt template version, model and parameters, inputs, retrieved chunk ids, tool calls and results, raw and parsed outputs, token counts, cache hits, latency breakdown, retries, guardrail verdicts, user feedback and downstream outcomes, and cost. This enables debugging, evaluation, cost attribution and incident response. Redact sensitive data and set retention limits.
:::
:::

:::problem Explain the EU AI Act in one minute as an engineer. {level=medium tags="compliance,regulation"}
Risk tiers and obligations.

:::solution Model answer
The EU AI Act regulates AI by **risk tier**: some practices are prohibited; **high-risk** uses (for example hiring, credit, education, critical infrastructure) face obligations such as risk management, data governance, documentation, human oversight, accuracy and robustness, and logging; **limited-risk** systems (chatbots, synthetic media) face transparency duties (tell users they interact with AI, label generated content); general-purpose model providers have their own obligations. Engineers should classify their use case, keep documentation and logs, design human oversight, and involve legal early.
:::
:::

## Scenario questions

:::problem The CEO asks: "Can we just fine-tune a model on all our documents so it knows everything?" How do you respond? {level=easy tags="communication,rag"}
Be clear and constructive.

:::solution Model answer
Fine-tuning mostly changes **behaviour and style**; it is a poor, expensive way to add facts, and it cannot cite sources, enforce permissions or update when documents change. The right approach for company knowledge is **retrieval-augmented generation** with access control, citations and a freshness pipeline; we can add fine-tuning later if evals show behavioural gaps (format, tone, domain jargon). I would start with a pilot on one document set, measure quality on real questions, and expand.
:::
:::

:::problem A stakeholder says "the model got it wrong once, so it is not reliable". How do you frame quality? {level=easy tags="communication,evals"}
Rates, severity and mitigations.

:::solution Model answer
No probabilistic system is perfect, so we define **acceptable error rates by severity** with the business, measure them on a representative eval set, and design mitigations for the costly errors: validation, citations, confidence routing, human review for high-stakes cases, and easy correction for users. We compare against the current process (humans also err), track the error rate over time, and show the trend with evidence.
:::
:::

:::problem Two engineers disagree: one wants a multi-agent framework, the other wants a single prompt with tools. How do you decide? {level=medium tags="agents,judgement"}
Evidence over opinion.

:::solution Model answer
Define the task and success metrics, build the **simplest baseline** (single call with tools or a fixed workflow), and evaluate on a shared golden set for quality, cost, latency and debuggability. Add multi-agent complexity only if it demonstrably improves results on tasks where decomposition or parallelism matters (research, large code changes), and then check the gain exceeds the extra cost and failure surface. Decide by the numbers and revisit as models improve.
:::
:::

:::problem Walk through what you do in your first week on a legacy LLM feature that nobody trusts. {level=medium tags="judgement,process"}
Understand, measure, then change.

:::solution Model answer
Read recent traces and complaints to understand real usage; interview users and owners; list failure modes; build a small **golden set** from real cases with labels; baseline quality, cost and latency; add basic tracing if missing; identify the highest-impact, lowest-risk fixes (prompt clarity, retrieval, validation, caching); run them through the eval gate; report findings and a plan with metrics. Avoid a rewrite until the data shows what is actually wrong.
:::
:::

:::keypoints
- Good interview answers are short and structured: definition, mechanism, where it matters or fails, and a trade-off.
- Be fluent in the core pieces: tokens, attention cost, sampling, training stages, hallucination, context limits.
- For RAG, separate retrieval from generation when debugging, and know hybrid search, reranking, chunking and evaluation.
- For agents, prefer workflows first; know compounding errors, MCP, injection and least privilege.
- For evals, start from error analysis, use calibrated judges, and prefer your own golden set over public benchmarks.
- For inference and production, know KV cache, quantisation, batching, caching, rate limits, cost breakdowns and what to log.
:::

:::resources
- [Chip Huyen: Introduction to AI Engineering interview prep material](https://huyenchip.com/ml-interviews-book/) — a broad bank of ML/AI interview questions.
- [Applied LLMs](https://applied-llms.org) — practitioner-level answers to many of these topics.
- [Hamel Husain: LLM evals FAQ](https://hamel.dev/blog/posts/evals-faq/) — practical answers on evals.
- [Lilian Weng's blog](https://lilianweng.github.io) — deep, readable explanations (agents, prompting, hallucination, diffusion).
- [Anthropic Engineering blog](https://www.anthropic.com/engineering) — how Anthropic builds agents, tools and evals.
- [Hugging Face LLM Course](https://huggingface.co/learn/llm-course) — refresh fundamentals.
:::
