---
title: The Annotated Reading List — Papers That Matter
level: advanced
time: 45
summary: Around eighty landmark papers grouped by track (foundations, scaling and training, alignment, prompting and reasoning, retrieval, agents and tools, fine-tuning, inference, evaluation, safety, multimodal), each with a one-line note on why it matters and the order to read them. Every arXiv id was verified against arXiv when this course was built.
---

You do **not** need to read papers to build products, but reading a handful of the right ones makes you faster at judging new work and better in interviews. Start with the **core ten**, then follow the track for what you are building. Each entry says **why it matters**, not only what it is. Use the three-pass method from the "Staying current" lesson: skim first, deepen only what pays off.

## The core ten (read these first)

1. [Attention Is All You Need](https://arxiv.org/abs/1706.03762) — the Transformer architecture that everything builds on.
2. [Language Models are Few-Shot Learners (GPT-3)](https://arxiv.org/abs/2005.14165) — in-context learning at scale; the start of the prompting era.
3. [Scaling Laws for Neural Language Models](https://arxiv.org/abs/2001.08361) — loss falls predictably with compute, data and parameters.
4. [Training Compute-Optimal Large Language Models (Chinchilla)](https://arxiv.org/abs/2203.15556) — data matters as much as parameters; reshaped training budgets.
5. [Training language models to follow instructions with human feedback (InstructGPT)](https://arxiv.org/abs/2203.02155) — the recipe that turned base models into assistants.
6. [Chain-of-Thought Prompting Elicits Reasoning](https://arxiv.org/abs/2201.11903) — letting models "think out loud" improves reasoning.
7. [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401) — the original RAG paper.
8. [ReAct: Synergizing Reasoning and Acting](https://arxiv.org/abs/2210.03629) — interleaving reasoning and tool use; the root of modern agents.
9. [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) — cheap fine-tuning by training small low-rank updates.
10. [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685) — the case for, and limits of, model-based evaluation.

## Foundations and architecture

| Paper | Why it matters |
|---|---|
| [BERT](https://arxiv.org/abs/1810.04805) | bidirectional pretraining; the backbone of embedding and classification models |
| [RoFormer: Rotary Position Embedding](https://arxiv.org/abs/2104.09864) | RoPE, the position encoding used by most modern open LLMs |
| [GQA: Grouped-Query Attention](https://arxiv.org/abs/2305.13245) | shrinks the KV cache with little quality loss; standard in current models |
| [Switch Transformers](https://arxiv.org/abs/2101.03961) | simple, scalable mixture-of-experts routing |
| [Mixtral of Experts](https://arxiv.org/abs/2401.04088) | an open mixture-of-experts model showing sparse efficiency |
| [Mamba](https://arxiv.org/abs/2312.00752) | selective state-space models as an alternative to attention |
| [Llama 2](https://arxiv.org/abs/2307.09288) | detailed open recipe for pretraining and chat fine-tuning |
| [The Llama 3 Herd of Models](https://arxiv.org/abs/2407.21783) | a very detailed report on data, scaling, post-training and infrastructure at frontier scale |
| [A Survey of Large Language Models](https://arxiv.org/abs/2303.18223) | a broad survey to orient yourself |
| [Textbooks Are All You Need](https://arxiv.org/abs/2306.11644) | data quality can beat quantity; small models trained on curated data |

## Alignment and post-training

| Paper | Why it matters |
|---|---|
| [Learning to summarize from human feedback](https://arxiv.org/abs/2009.01325) | the RLHF pipeline in an early, readable form |
| [Constitutional AI](https://arxiv.org/abs/2212.08073) | using written principles and AI feedback for harmlessness |
| [Direct Preference Optimization (DPO)](https://arxiv.org/abs/2305.18290) | preference tuning without a separate reward model or RL loop |
| [Tulu 3](https://arxiv.org/abs/2411.15124) | a fully open post-training recipe with data, code and evals |
| [DeepSeekMath](https://arxiv.org/abs/2402.03300) | introduces GRPO, a simple RL algorithm for reasoning |
| [DeepSeek-R1](https://arxiv.org/abs/2501.12948) | reasoning behaviour emerging from RL with verifiable rewards |

## Prompting and reasoning

| Paper | Why it matters |
|---|---|
| [Self-Consistency](https://arxiv.org/abs/2203.11171) | sample several reasoning paths and vote |
| [Tree of Thoughts](https://arxiv.org/abs/2305.10601) | search over reasoning steps instead of one chain |
| [Lost in the Middle](https://arxiv.org/abs/2307.03172) | models use information at the start and end of long context better than the middle |
| [Toolformer](https://arxiv.org/abs/2302.04761) | models learning when to call tools |

## Retrieval and RAG

| Paper | Why it matters |
|---|---|
| [Dense Passage Retrieval (DPR)](https://arxiv.org/abs/2004.04906) | dense retrievers beat BM25 for open-domain QA |
| [ColBERT](https://arxiv.org/abs/2004.12832) | late interaction (MaxSim) for accurate, efficient retrieval |
| [BEIR](https://arxiv.org/abs/2104.08663) | zero-shot retrieval benchmark across many domains |
| [MTEB: Massive Text Embedding Benchmark](https://arxiv.org/abs/2210.07316) | how embedding models are compared |
| [HyDE: Hypothetical Document Embeddings](https://arxiv.org/abs/2212.10496) | query expansion by generating a fake answer to embed |
| [Self-RAG](https://arxiv.org/abs/2310.11511) | the model decides when to retrieve and critiques its own output |
| [RAG for LLMs: A Survey](https://arxiv.org/abs/2312.10997) | an organised overview of modern RAG techniques |
| [ColPali](https://arxiv.org/abs/2407.01449) | visual document retrieval using page images |

## Agents and tools

| Paper | Why it matters |
|---|---|
| [Reflexion](https://arxiv.org/abs/2303.11366) | learning from verbal self-feedback across attempts |
| [Generative Agents](https://arxiv.org/abs/2304.03442) | memory, reflection and planning in simulated agents |
| [Voyager](https://arxiv.org/abs/2305.16291) | an agent that builds a skill library and keeps learning |
| [SWE-bench](https://arxiv.org/abs/2310.06770) | resolving real GitHub issues; the standard coding-agent benchmark |

## Fine-tuning and efficiency

| Paper | Why it matters |
|---|---|
| [QLoRA](https://arxiv.org/abs/2305.14314) | fine-tuning large models on one GPU via 4-bit quantisation plus LoRA |
| [Distilling the Knowledge in a Neural Network](https://arxiv.org/abs/1503.02531) | the foundation of distillation |
| [DistilBERT](https://arxiv.org/abs/1910.01108) | practical distillation of a language model |
| [LLM.int8()](https://arxiv.org/abs/2208.07339) | handling outlier features for 8-bit inference |
| [GPTQ](https://arxiv.org/abs/2210.17323) | accurate post-training weight quantisation |
| [AWQ](https://arxiv.org/abs/2306.00978) | activation-aware weight quantisation |

## Inference systems

| Paper | Why it matters |
|---|---|
| [FlashAttention](https://arxiv.org/abs/2205.14135) | IO-aware exact attention; the key efficiency breakthrough |
| [FlashAttention-2](https://arxiv.org/abs/2307.08691) | better parallelism and work partitioning |
| [PagedAttention / vLLM](https://arxiv.org/abs/2309.06180) | virtual-memory style KV cache management for high-throughput serving |
| [Fast Inference via Speculative Decoding](https://arxiv.org/abs/2211.17192) | draft-and-verify decoding without changing the distribution |
| [Medusa](https://arxiv.org/abs/2401.10774) | multiple decoding heads for faster generation |

## Evaluation

| Paper | Why it matters |
|---|---|
| [HELM: Holistic Evaluation of Language Models](https://arxiv.org/abs/2211.09110) | broad, multi-metric evaluation methodology |
| [MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685) | LLM-as-judge and human preference arenas |
| [SWE-bench](https://arxiv.org/abs/2310.06770) | execution-based evaluation of coding agents |

## Safety and security

| Paper | Why it matters |
|---|---|
| [Not what you've signed up for](https://arxiv.org/abs/2302.12173) | indirect prompt injection in LLM-integrated applications |
| [Universal and Transferable Adversarial Attacks](https://arxiv.org/abs/2307.15043) | automated jailbreak suffixes that transfer across models |
| [Constitutional AI](https://arxiv.org/abs/2212.08073) | principle-based safety training |

## Multimodal and generative media

| Paper | Why it matters |
|---|---|
| [An Image is Worth 16x16 Words (ViT)](https://arxiv.org/abs/2010.11929) | transformers for images |
| [CLIP](https://arxiv.org/abs/2103.00020) | joint image-text embeddings via contrastive training |
| [Visual Instruction Tuning (LLaVA)](https://arxiv.org/abs/2304.08485) | the open VLM recipe |
| [DDPM](https://arxiv.org/abs/2006.11239) | denoising diffusion probabilistic models |
| [Latent Diffusion](https://arxiv.org/abs/2112.10752) | diffusion in latent space; the basis of Stable Diffusion |
| [DiT](https://arxiv.org/abs/2212.09748) | diffusion with Transformers |
| [Flow Matching](https://arxiv.org/abs/2210.02747) | a simple training objective behind many modern generators |
| [Whisper](https://arxiv.org/abs/2212.04356) | robust speech recognition via large-scale weak supervision |

## Reading orders

**Beginner path (about 8 papers):** Attention Is All You Need, GPT-3, InstructGPT, Chain-of-Thought, RAG, ReAct, LoRA, MT-Bench. Read the abstract, introduction and figures; skim the rest.

**RAG builder path:** RAG, DPR, ColBERT, BEIR and MTEB, HyDE, Lost in the Middle, Self-RAG, the RAG survey.

**Agent builder path:** ReAct, Toolformer, Reflexion, Generative Agents, Voyager, SWE-bench, then the injection paper.

**Inference and platform path:** GQA, FlashAttention, PagedAttention, speculative decoding, quantisation papers (LLM.int8, GPTQ, AWQ), Mixtral.

**Alignment and training path:** Scaling laws, Chinchilla, InstructGPT, Constitutional AI, DPO, DeepSeekMath, DeepSeek-R1, Tulu 3, Llama 3.

## Reading tips

- Read the **abstract, figures and conclusion first**; decide whether to continue.
- **Search for ablations** to see which ideas actually matter.
- Pair a paper with a **blog post or video explaining it** if it is dense.
- **Implement a tiny version** of one idea per month (attention, a LoRA layer, a retrieval metric).
- Keep a note per paper: problem, idea, evidence, limits, "would I use it?".

```quiz
? Which paper introduced the Transformer?
+ Attention Is All You Need
- BERT
- LoRA
> Everything else in this list builds on it.

? Which paper showed that smaller models trained on more data can be compute-optimal?
+ Training Compute-Optimal Large Language Models (Chinchilla)
- Mixtral of Experts
- ColBERT
> It revised how parameters and tokens should be balanced.

? Which paper is the best entry point for understanding efficient LLM serving?
+ PagedAttention (vLLM), together with FlashAttention
- Tree of Thoughts
- CLIP
> They explain KV-cache memory management and fast attention.

? What does DPO remove from the RLHF pipeline?
+ The separate reward model and online RL loop
- The need for data
- The base model
> It optimises preferences directly with a simple loss.
```

:::keypoints
- Start with the core ten, then follow the reading path for your track (RAG, agents, inference, alignment).
- Papers matter for ideas that persist: Transformers, scaling laws, instruction tuning, chain-of-thought, RAG, ReAct, LoRA, FlashAttention, PagedAttention, DPO.
- Read for the problem, the idea, the evidence and the limits; look at ablations; implement small versions.
- Pair dense papers with explainers, and keep notes per paper.
:::

:::resources
- [Hugging Face Daily Papers](https://huggingface.co/papers) — new and trending papers.
- [arXiv cs.CL](https://arxiv.org/list/cs.CL/recent) — latest computation and language preprints.
- [arXiv cs.LG](https://arxiv.org/list/cs.LG/recent) — machine learning preprints.
- [Lilian Weng's blog](https://lilianweng.github.io) — readable summaries of many of these papers.
- [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) — read before the original paper.
- [Sebastian Raschka: Ahead of AI](https://magazine.sebastianraschka.com) — paper analyses and architecture comparisons.
:::
