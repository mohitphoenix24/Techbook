---
title: The Tools and Frameworks Map
level: intermediate
time: 30
summary: A map of the AI engineering ecosystem by layer — model providers, hosting, orchestration and agent frameworks, structured output, vector stores and search, embeddings and rerankers, document parsing, evals and observability, guardrails and security, fine-tuning, inference and local runtimes, gateways, speech and media, and UI toolkits — with links, what each is best at, and a default stack for getting started. All links were checked when this course was built.
---

The ecosystem is crowded and changes monthly. Use this as a **map, not a shopping list**: each layer has a few leading options, and for most projects the right choice is **the simplest thing that works**, kept behind a thin interface so you can swap it. Tools named here are examples of categories; check current docs, licences and maturity before adopting.

## A default starter stack

If you just want to get going, this stack is boring and effective:

| Layer | Default | Why |
|---|---|---|
| Model | one frontier API (Claude, GPT, Gemini) + a small model for easy tasks | best quality and tools; no ops |
| SDK | the provider's official SDK | stable, typed, supports the newest features |
| Orchestration | plain Python or TypeScript functions | easiest to debug; add a framework only when needed |
| Structured output | native structured outputs + Pydantic/Zod validation | reliable and simple |
| Vector store | pgvector in Postgres (or SQLite/FAISS for prototypes) | one less system to run |
| Search | Postgres full-text or Elasticsearch/OpenSearch for BM25 + hybrid | exact-match recall |
| Evals | your own scripts + a small golden set, then promptfoo or Braintrust | start measuring on day one |
| Observability | OpenTelemetry-style traces; Langfuse or similar | see every step |
| Serving the app | FastAPI or a TypeScript server with SSE streaming | async, streaming-friendly |

## Model providers and APIs

- [Claude API docs](https://docs.claude.com) — Anthropic's models, tools, caching, batch, MCP connector.
- [OpenAI platform docs](https://platform.openai.com/docs) — GPT models, Responses API, tools.
- [Google Gemini API](https://ai.google.dev) — Gemini models with long context and multimodal input.
- [Mistral docs](https://docs.mistral.ai) — Mistral and open-weight models via API.
- [Cohere docs](https://docs.cohere.com) — Command models, embeddings and rerank.
- [Amazon Bedrock](https://docs.aws.amazon.com/bedrock/) — multiple model families behind AWS IAM.
- [Google Vertex AI](https://cloud.google.com/vertex-ai/docs) — Gemini and partner models in Google Cloud.
- [Azure AI Foundry](https://learn.microsoft.com/azure/ai-foundry/) — models and tooling in Azure.

## Open-model hosting and routers

- [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers) — one API over many providers of open models.
- [Together AI docs](https://docs.together.ai) — hosted open models and fine-tuning.
- [Fireworks AI docs](https://docs.fireworks.ai) — fast open-model inference and fine-tuning.
- [Groq docs](https://console.groq.com/docs) — very fast inference on custom hardware.
- [OpenRouter docs](https://openrouter.ai/docs) — one API and billing across many models.

## Orchestration and agent frameworks

| Tool | Best for |
|---|---|
| [LangGraph](https://langchain-ai.github.io/langgraph/) | stateful agent graphs, durable execution, human-in-the-loop |
| [LlamaIndex](https://docs.llamaindex.ai) | data and RAG pipelines, connectors, agents over documents |
| [Haystack](https://docs.haystack.deepset.ai) | modular search/RAG pipelines |
| [DSPy](https://dspy.ai) | programming (not prompting) LLM pipelines with automatic optimisation |
| [Pydantic AI](https://ai.pydantic.dev) | type-safe agents with validated outputs |
| [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) | the agent loop and tools behind Claude Code, for building your own agents |
| [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) | lightweight agents, handoffs and guardrails |
| [CrewAI](https://docs.crewai.com) | role-based multi-agent crews |
| [AutoGen](https://microsoft.github.io/autogen/) | multi-agent conversations |
| [smolagents](https://huggingface.co/docs/smolagents) | minimal code-writing agents |
| [Vercel AI SDK](https://ai-sdk.dev) | TypeScript streaming, tools and UI hooks |
| [Mastra](https://mastra.ai/docs) | TypeScript agent framework with workflows and evals |
| [Model Context Protocol](https://modelcontextprotocol.io) | the open standard for tool and data integration |

**Advice**: build your first agent in plain code to learn the loop; adopt a framework when you need durable state, branching graphs, or a team convention.

## Structured output and constrained decoding

- [Instructor](https://python.useinstructor.com) — structured extraction with Pydantic across providers.
- [Outlines](https://dottxt-ai.github.io/outlines/) — constrained generation for open models.
- [Guidance](https://github.com/guidance-ai/guidance) — interleaving control flow and generation.
- [XGrammar](https://github.com/mlc-ai/xgrammar) — fast grammar-constrained decoding engine used by serving stacks.

## Vector stores and search

- [pgvector](https://github.com/pgvector/pgvector) — vectors inside Postgres.
- [Qdrant](https://qdrant.tech/documentation/) — a Rust vector engine with filtering and hybrid search.
- [Weaviate](https://weaviate.io/developers/weaviate) — vector database with hybrid search and modules.
- [Pinecone](https://docs.pinecone.io) — managed vector database.
- [Chroma](https://docs.trychroma.com) — simple, developer-friendly embedded store.
- [LanceDB](https://lancedb.github.io/lancedb/) — embedded, disk-based vector database for multimodal data.
- [FAISS](https://github.com/facebookresearch/faiss) — the standard similarity-search library.
- [Elasticsearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html) and [OpenSearch](https://opensearch.org/docs/latest/) — mature search engines with BM25 and vectors.

## Embeddings, rerankers and retrieval tooling

- [Sentence Transformers](https://www.sbert.net) — open embedding and cross-encoder models.
- [BGE / FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding) — open embedding and reranker models.
- [Voyage AI docs](https://docs.voyageai.com) — embeddings and rerankers via API.
- [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — compare embedding models.
- [ColPali](https://github.com/illuin-tech/colpali) — visual document retrieval models and code.

## Document parsing

- [Docling](https://github.com/docling-project/docling) — layout-aware document conversion.
- [Unstructured](https://docs.unstructured.io) — partitioning many file types.
- [LlamaParse](https://docs.cloud.llamaindex.ai) — managed parsing for complex documents.
- [Tesseract](https://github.com/tesseract-ocr/tesseract) — classic open-source OCR.

## Evals and observability

- [promptfoo](https://www.promptfoo.dev/docs/intro/) — open-source evals and red teaming in CI.
- [Langfuse](https://langfuse.com/docs) — open-source tracing, datasets, prompt management.
- [LangSmith](https://docs.smith.langchain.com) — tracing and evals for LangChain and beyond.
- [Braintrust](https://www.braintrust.dev/docs) — evals, experiments and datasets platform.
- [Arize Phoenix](https://docs.arize.com/phoenix) — open-source tracing and evals.
- [Inspect AI](https://inspect.aisi.org.uk) — a framework for LLM evaluations from the UK AI Security Institute.
- [Ragas](https://docs.ragas.io) — metrics for RAG evaluation.
- [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) — the standard harness for benchmark evaluation of models.
- [OpenTelemetry GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — vendor-neutral trace schema.

## Guardrails and security

- [NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails) — programmable guardrails for LLM apps.
- [Guardrails AI](https://www.guardrailsai.com/docs) — validators for LLM outputs.
- [Microsoft Presidio](https://microsoft.github.io/presidio/) — PII detection and anonymisation.
- [garak](https://github.com/NVIDIA/garak) — an LLM vulnerability scanner.
- [PyRIT](https://github.com/Azure/PyRIT) — a red-teaming framework for generative AI.
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) — the risk checklist.

## Fine-tuning and training

- [Hugging Face TRL](https://huggingface.co/docs/trl) — SFT, DPO, GRPO and other trainers.
- [Hugging Face PEFT](https://huggingface.co/docs/peft) — LoRA and other parameter-efficient methods.
- [Unsloth](https://docs.unsloth.ai) — fast, memory-efficient fine-tuning.
- [Axolotl](https://docs.axolotl.ai) — config-driven fine-tuning recipes.
- [LLaMA-Factory](https://github.com/hiyouga/LLaMA-Factory) — a unified fine-tuning framework with a UI.
- [torchtune](https://github.com/pytorch/torchtune) — PyTorch-native fine-tuning recipes.

## Inference engines and local runtimes

- [vLLM](https://docs.vllm.ai) — high-throughput serving with PagedAttention and continuous batching.
- [SGLang](https://docs.sglang.ai) — fast serving with structured generation and prefix caching.
- [TensorRT-LLM](https://nvidia.github.io/TensorRT-LLM/) — NVIDIA-optimised inference.
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — efficient CPU/GPU inference with GGUF quantisation.
- [Ollama](https://ollama.com) — easy local model running.
- [LM Studio](https://lmstudio.ai) — desktop app for local models.
- [MLX](https://github.com/ml-explore/mlx) — Apple-silicon machine learning framework.

## Gateways and cost control

- [LiteLLM](https://docs.litellm.ai) — open-source gateway with routing, fallbacks and budgets.
- [Portkey](https://docs.portkey.ai) — AI gateway with observability and guardrails.
- [Helicone](https://docs.helicone.ai) — observability and caching proxy.
- [OpenRouter](https://openrouter.ai/docs) — unified model access.

## Speech, voice and media

- [Whisper](https://github.com/openai/whisper) — open speech recognition.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — a fast reimplementation of Whisper inference.
- [LiveKit Agents](https://docs.livekit.io/agents/) — real-time voice and video agents.
- [Pipecat](https://docs.pipecat.ai) — open framework for voice and multimodal conversational agents.
- [Hugging Face Diffusers](https://huggingface.co/docs/diffusers) — image, video and audio diffusion pipelines.
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) — node-based generative media workflows.

## UI toolkits

- [Gradio](https://www.gradio.app/docs) — quick ML demos in Python.
- [Streamlit](https://docs.streamlit.io) — data apps in Python.
- [Chainlit](https://docs.chainlit.io) — chat interfaces for LLM apps.
- [assistant-ui](https://www.assistant-ui.com/docs) — React components for AI chat.

## How to evaluate a tool before adopting it

| Question | Why it matters |
|---|---|
| **Is the problem real for us?** | avoid adding layers you do not need |
| **How hard is it to remove?** | lock-in and abstraction cost |
| **Is it maintained?** | release cadence, issue response, bus factor |
| **Does it hide the model call?** | black-box prompting makes debugging and evals harder |
| **Can I see and test everything it sends?** | observability and reproducibility |
| **What are the licence and data terms?** | commercial use, telemetry, data retention |
| **Does it run in our environment?** | cloud, region, security review |
| **What does the community say about production use?** | real-world failure reports |

```quiz
? What is a sensible default for orchestration in a first LLM app?
+ Plain Python or TypeScript functions, adding a framework only when the need is clear
- The largest multi-agent framework
- No code
> Simple code is easiest to debug and evaluate.

? When is pgvector a good first choice?
+ When you already run Postgres and your corpus is modest, to avoid another system
- When you have billions of vectors
- When you need GPUs
> It keeps your stack small; revisit at scale.

? Which tool category helps you measure quality in CI?
+ Eval frameworks such as promptfoo, Braintrust or Inspect
- UI toolkits
- Vector stores
> Evals gate changes.

? What is the main risk of heavy framework abstraction?
+ It can hide prompts and calls, making debugging and evaluation harder
- It makes code faster
- It removes the need for tests
> Keep the model call visible.
```

:::keypoints
- Treat the ecosystem as layers: providers, hosting, orchestration, structured output, vector stores, embeddings, parsing, evals, guardrails, fine-tuning, inference, gateways, speech and media, UI.
- Start with a boring default stack: provider SDK, plain code, native structured outputs, pgvector, your own evals and tracing.
- Add frameworks when a concrete need appears; keep model calls visible and tools behind thin interfaces.
- Evaluate tools by problem fit, removal cost, maintenance, transparency and licence terms.
:::

:::resources
- [Model Context Protocol servers](https://github.com/modelcontextprotocol/servers) — reference and community MCP servers.
- [Awesome LLM Apps (GitHub)](https://github.com/Shubhamsaboo/awesome-llm-apps) — a large collection of example applications.
- [Hugging Face Models hub](https://huggingface.co/models) — find open models and adapters.
- [Hugging Face Spaces](https://huggingface.co/spaces) — try demos and leaderboards.
- [Chip Huyen: Building A Generative AI Platform](https://huyenchip.com/2024/07/25/genai-platform.html) — how the pieces fit together.
- [Applied LLMs](https://applied-llms.org) — advice on tools and tactics.
:::
