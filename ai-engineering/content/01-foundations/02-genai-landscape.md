---
title: The GenAI Landscape — From Word Vectors to Agents
level: easy
time: 30
summary: A guided timeline of how we got here (word2vec, the Transformer, GPT, ChatGPT, reasoning models, agents), the vocabulary that gets thrown around (AI vs ML vs DL vs GenAI vs LLM vs foundation model), and the map of model types and providers.
---

Before details, get the big picture. The field moves quickly, but the **story has only a few turning points**, and knowing them makes every new announcement easy to place.

## The nesting dolls

:::def Artificial intelligence (AI)
Any technique that makes computers do things we associate with intelligence. A very wide umbrella: from chess search to chatbots.
:::

:::def Machine learning (ML)
AI where the rules are **learned from data** instead of written by hand. You show examples; an algorithm finds the pattern.
:::

:::def Deep learning (DL)
ML using **neural networks with many layers**. It took over because it scales: more data and compute keep improving it.
:::

:::def Generative AI (GenAI)
Models that **produce new content** (text, images, audio, video, code) rather than only classify or predict a number.
:::

:::def Large language model (LLM)
A very large neural network, trained on a huge amount of text (and often images, audio and code), whose core skill is **predicting the next token**. From that single skill come summarising, translating, coding and answering questions.
:::

:::def Foundation model
A large model trained once on broad data and then **adapted to many tasks** by prompting, retrieval, or fine-tuning. LLMs, image models and speech models can all be foundation models.
:::

So: **AI ⊃ ML ⊃ DL ⊃ GenAI ⊃ LLMs**. This course is mostly about LLMs and the systems around them, with a module on image, speech and video models.

## A timeline of the turning points

| Year | Event | Why it mattered |
|---|---|---|
| 2013 | **word2vec** ([paper](https://arxiv.org/abs/1301.3781)) | Words become vectors; meaning becomes geometry. The seed of embeddings. |
| 2014–15 | **Attention** for translation ([Bahdanau](https://arxiv.org/abs/1409.0473)); **BPE** subwords ([Sennrich](https://arxiv.org/abs/1508.07909)) | Models learn *where to look*; text splits into reusable pieces. |
| 2017 | **The Transformer** ([Attention Is All You Need](https://arxiv.org/abs/1706.03762)) | Parallel training, no recurrence. The architecture behind nearly everything since. |
| 2018 | **BERT** ([paper](https://arxiv.org/abs/1810.04805)) and **GPT** | Pretrain on raw text, then adapt. Transfer learning arrives for language. |
| 2020 | **GPT-3** ([paper](https://arxiv.org/abs/2005.14165)) and **scaling laws** ([paper](https://arxiv.org/abs/2001.08361)) | Bigger models learn to follow examples in the prompt ("in-context learning"). Loss falls predictably with scale. |
| 2020 | **RAG** ([paper](https://arxiv.org/abs/2005.11401)) | Combine a model with retrieval over external documents. |
| 2022 | **InstructGPT** ([paper](https://arxiv.org/abs/2203.02155)), **chain-of-thought** ([paper](https://arxiv.org/abs/2201.11903)), **Chinchilla** ([paper](https://arxiv.org/abs/2203.15556)), **latent diffusion** ([paper](https://arxiv.org/abs/2112.10752)) | Human feedback makes models follow instructions; "think step by step" boosts reasoning; train on more tokens for a given size; text-to-image goes mainstream. |
| Nov 2022 | **ChatGPT** | A chat interface on an instruction-tuned model reaches a mass audience in days. |
| 2023 | **Open weights** (Llama 2: [paper](https://arxiv.org/abs/2307.09288), Mistral 7B: [paper](https://arxiv.org/abs/2310.06825)), **function calling**, **vector DB boom**, **DPO** ([paper](https://arxiv.org/abs/2305.18290)), **LoRA/QLoRA** ([QLoRA](https://arxiv.org/abs/2305.14314)) | Anyone can run and fine-tune capable models; apps start using tools and retrieval. |
| 2023–24 | **Long context** (Gemini 1.5: [report](https://arxiv.org/abs/2403.05530)), **MoE** ([Mixtral](https://arxiv.org/abs/2401.04088)), **multimodal** everything | Context windows of 100K–1M+ tokens; images, audio and video as inputs. |
| 2024 | **Reasoning models** trained with reinforcement learning (o1-style; open recipe: [DeepSeek-R1](https://arxiv.org/abs/2501.12948)) | Models that "think" before answering; test-time compute becomes a new scaling axis ([paper](https://arxiv.org/abs/2408.03314)). |
| Nov 2024 | **Model Context Protocol (MCP)** | A standard way to plug tools and data into any model or agent. |
| 2025–26 | **Agents**, computer use, coding agents, **context engineering**, adaptive-thinking models | Models run for minutes to hours, calling tools in a loop. The engineering challenge shifts to context, evals and safety. |

:::note Dates are approximate
Each of these developed over months. The point is the **order of ideas**: representation (vectors) → architecture (Transformer) → scale → alignment (human feedback) → tools and retrieval → reasoning → autonomy.
:::

## What changed for engineers

Until about 2020, using machine learning meant *collecting data and training your own model* for each task. A foundation model flips that: **one model, many tasks, specified in English**. That created the AI-engineer role. The cost is new problems: outputs are non-deterministic, prompts are fragile, and "correct" is fuzzy.

```python run title="Old way vs new way, in miniature" level=easy
# OLD: a hand-trained classifier needs labelled data and a training step per task.
# NEW: one general model; the "program" is a prompt.

def build_prompt(task, text):
    return f"""You are a careful assistant.
Task: {task}
Text: {text}
Answer with one word."""

for task, text in [("Is the sentiment positive or negative?", "The battery died in a day. Awful."),
                   ("Which language is this?", "Ceci n'est pas une pipe.")]:
    print(build_prompt(task, text))
    print("-" * 40)
```

The same function now powers sentiment, language detection, routing, extraction, and more, just by changing the text.

## The map of model types

```viz algo=arch title="Model families you will meet" dir=down
fm     Foundation models | trained on broad data [llm] @1,0
llm    Text LLMs | GPT / Claude / Gemini / Llama / Qwen [llm] @0,1
vlm    Vision-language | image + text in, text out [image] @1,1
img    Image & video generators | diffusion, flow [video] @2,1
sp     Speech | ASR, TTS, realtime [phone] @3,1
emb    Embedding models | text to vectors [embed] @0,2
rr     Rerankers | score query/doc pairs [filter] @1,2
rm     Reasoning models | think before answering [agent] @2,2
--
fm -> llm
fm -> vlm
fm -> img
fm -> sp
llm -> emb : retrieval
llm -> rr
llm -> rm
```

| Type | Input → output | You use it for |
|---|---|---|
| Chat / instruct LLM | text (and images) → text | assistants, extraction, coding, agents |
| Reasoning model | text → hidden "thinking" → text | maths, code, planning, hard multi-step tasks |
| Embedding model | text → vector | search, RAG, clustering, recommendations |
| Reranker | (query, document) → relevance score | precision step after retrieval |
| Vision-language model | image + text → text | OCR, charts, screenshots, documents |
| Image / video generator | text → pixels | creative tools, design, marketing |
| Speech models | audio ↔ text | transcription, voice agents, dubbing |
| Small / on-device model | text → text, cheaply | privacy, offline, latency, cost |

## Who provides what

- **Frontier labs with APIs:** Anthropic (Claude), OpenAI (GPT), Google (Gemini), plus xAI and others. Strongest capabilities; you pay per token.
- **Open-weight model families:** Llama (Meta), Qwen (Alibaba), DeepSeek, Mistral, Gemma (Google), Phi (Microsoft), and many more. You can download, run and fine-tune them, subject to each licence.
- **Clouds and inference hosts:** AWS Bedrock, Google Vertex AI, Microsoft Foundry, Together, Fireworks, Groq, Baseten, Modal and others host open and closed models behind APIs.
- **Tooling:** Hugging Face (models, datasets, libraries), LangChain / LlamaIndex / PydanticAI (frameworks), vector databases, eval and observability platforms.

:::warn "Open source" is not always open
Most "open" LLMs are **open-weight**: you get the trained weights but often not the training data or full recipe, and the licence may restrict use. Read the licence before building a product on one.
:::

```quiz
? What is the relationship between deep learning and generative AI?
- They are unrelated
- Generative AI is older and deep learning is a type of it
+ Modern generative AI is built mostly on deep learning, which is a subset of machine learning
> Today's text, image, audio and video generators are deep neural networks, so GenAI sits inside deep learning in the nesting.

? Which paper introduced the architecture used by almost every modern LLM?
- BERT
+ Attention Is All You Need (the Transformer)
- word2vec
> The 2017 Transformer paper replaced recurrence with attention, enabling parallel training at scale.

? What does "open-weight" mean?
- The training data and the code are fully public
+ The trained model weights can be downloaded, though data and licence terms may be restricted
- The model is free to call through an API
> Open-weight is not necessarily open-source. Always check the licence.
```

:::keypoints
- AI ⊃ ML ⊃ DL ⊃ GenAI ⊃ LLMs; a foundation model is trained once and adapted many ways.
- The story: vectors (word2vec) → Transformer → scale → instruction tuning and RLHF → open weights → tools and retrieval → reasoning models → agents.
- The big shift: one general model specified by a prompt replaces one trained model per task.
- Different model types play different roles: chat, reasoning, embedding, reranker, vision, speech, generators.
- You choose between hosted frontier APIs and open-weight models you run yourself, a trade-off we revisit in the model-landscape lesson.
:::

:::resources
- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) — the paper; skim it after the attention lesson.
- [A Survey of Large Language Models](https://arxiv.org/abs/2303.18223) — a broad academic map of the field.
- [The Illustrated Transformer (Jay Alammar)](https://jalammar.github.io/illustrated-transformer/) — the classic visual explanation.
- [Karpathy: Deep Dive into LLMs like ChatGPT (video)](https://www.youtube.com/watch?v=7xTGNNLPyMI) — three hours, the full story from data to assistant.
- [Epoch AI](https://epoch.ai) — data on models, compute and trends.
:::
