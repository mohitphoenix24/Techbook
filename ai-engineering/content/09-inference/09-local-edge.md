---
title: Local and On-Device Models
level: intermediate
time: 40
summary: Running models on your own laptop, a phone or in the browser. What fits where (a memory calculator), GGUF and the K-quant formats, Ollama, LM Studio, llama.cpp and MLX in practice, small language models and what they are good at, WebGPU and in-browser inference, privacy and offline use cases, hybrid local-plus-cloud designs, and the honest limits.
---

Not every model call needs a data centre. Capable small models now run on a laptop, a phone, or inside a browser tab: private, offline, free per token, with no network latency. Knowing when this is the right design, and how to run it, is a practical skill.

## Why run locally

| Reason | Example |
|---|---|
| **Privacy and data control** | medical, legal and personal notes never leave the device |
| **Offline operation** | field work, aircraft, unreliable networks |
| **Latency** | instant autocomplete, keyboard suggestions, no round trip |
| **Cost** | no per-token charges for high-volume, low-stakes tasks |
| **Customisation and control** | pin an exact model version; fine-tuned adapters; no provider changes |
| **Learning and experimentation** | inspect, quantise, modify models freely |

Limits: smaller models are **less capable** (reasoning, long context, tool use, multilingual quality), your hardware is the ceiling, and you own updates and safety.

## What fits? Memory is the constraint

Memory ≈ **parameters × bytes per weight** + KV cache + overhead. A handy rule: **a Q4_K_M GGUF needs roughly 0.6 GB per billion parameters** (about 4.5–5 bits per weight), plus 1–3 GB for context and runtime.

```python run title="Will this model run on my device?" level=easy
def model_gb(params_b, bits_per_weight=4.85):        # Q4_K_M averages ~4.8-4.9 bits including scales
    return params_b * bits_per_weight / 8

devices = {"phone (8 GB RAM, ~4 GB usable)": 4, "laptop 16 GB (~10 GB usable)": 10, "laptop 32 GB (~24 GB usable)": 24,
           "RTX 4090 (24 GB VRAM)": 22, "Mac Studio 128 GB (~100 GB usable)": 100}
models = {"1B": 1.2, "3B": 3.2, "8B": 8.0, "14B": 14.7, "32B": 32.8, "70B": 70.6}
overhead = 2.0                                        # GB for KV cache (modest context) and runtime
print(f"{'':36}" + "".join(f"{m:>7}" for m in models))
for dev, avail in devices.items():
    row = "".join(f"{('yes' if model_gb(p) + overhead <= avail else 'no'):>7}" for p in models.values())
    print(f"{dev:36}{row}")
print("\napprox. sizes at Q4_K_M:", {m: f"{model_gb(p):.1f} GB" for m, p in models.items()})
```

**Speed** is bandwidth-bound too: tokens/s ≈ memory bandwidth ÷ model bytes. A laptop with ~100 GB/s memory runs an 8B Q4 (~5 GB) at roughly 15–20 tokens/s; an M-series Max/Ultra (400–800 GB/s) is several times faster; a 4090 (1 TB/s) runs it at 100+ tokens/s.

## The tools

| Tool | What it is | Good for |
|---|---|---|
| **Ollama** ([site](https://ollama.com)) | CLI + local server; `ollama run model`; pulls GGUF models; OpenAI-compatible API on port 11434; Modelfiles for custom prompts/adapters | the easiest start for developers |
| **LM Studio** ([site](https://lmstudio.ai)) | desktop GUI with a model browser, chat, local server | non-technical users, quick comparison |
| **llama.cpp** ([repo](https://github.com/ggml-org/llama.cpp)) | the C/C++ engine behind many tools; CPU, CUDA, Metal, Vulkan; `llama-cli`, `llama-server`; GGUF quantisation tools | maximum control and portability |
| **MLX / mlx-lm** ([repo](https://github.com/ml-explore/mlx)) | Apple's array framework; fast on Apple silicon; LoRA fine-tuning on a Mac | Mac users |
| **Open WebUI / Jan** | friendly UIs over local backends | team or home deployments |
| **Transformers.js / WebLLM / WebGPU** | run models in the **browser** | zero-install demos, privacy-preserving web apps |
| **ExecuTorch, MediaPipe LLM, Core ML, ONNX Runtime, MLC LLM** | mobile and embedded deployment | on-device apps (iOS/Android) |

```bash
# Ollama: run and serve a local model
ollama pull qwen3:8b
ollama run qwen3:8b "Summarise the benefits of KV caching in one sentence."
curl http://localhost:11434/api/generate -d '{"model": "qwen3:8b", "prompt": "Hello", "stream": false}'

# llama.cpp server with GPU offload
llama-server -m Qwen3-8B-Q4_K_M.gguf -c 8192 -ngl 99 --port 8080
```

```python local title="The same OpenAI-style client works against local servers"
from openai import OpenAI
client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")            # Ollama's compatible endpoint
r = client.chat.completions.create(model="qwen3:8b", messages=[{"role": "user", "content": "Name three uses of a local LLM."}])
print(r.choices[0].message.content)
```

## GGUF and quantisation choices

**GGUF** is llama.cpp's single-file model format (weights, tokenizer, metadata). Choose the quantisation by memory and quality:

| Quant | Approx. bits | When |
|---|---|---|
| **Q8_0** | 8.5 | near-lossless; plenty of memory |
| **Q6_K / Q5_K_M** | 6.6 / 5.7 | high quality with modest savings |
| **Q4_K_M** | ~4.9 | the default sweet spot |
| **Q3_K_M / IQ3** | ~3.9 | tight memory; some quality loss |
| **Q2_K / IQ2** | ~2.6–3.2 | last resort for big models on small devices |

Importance-matrix (**imatrix**) quantisations improve low-bit quality. Prefer **bigger model at lower bits** over smaller at higher bits, within reason (a 14B Q4 usually beats a 7B Q8).

## Small language models (SLMs)

Models of **0.5–4B** parameters have become useful: Qwen, Llama 3.2, Gemma, Phi, SmolLM and others. Good at: classification, extraction, routing, rewriting, short summarisation, autocomplete, simple Q&A with retrieval, structured output, and as **draft models for speculative decoding**. Weaker at: complex multi-step reasoning, broad world knowledge, long-context accuracy, reliable tool use at scale. They shine **after fine-tuning for one narrow task** and with **RAG** supplying the facts.

Design pattern: **small local model first, escalate to a large cloud model** when confidence is low, the task is hard, or privacy rules allow.

```python run title="A local-first router with cloud escalation" level=intermediate
def local_model(prompt):
    """Stand-in for a small local model returning (answer, confidence)."""
    simple = len(prompt.split()) < 12 and "why" not in prompt.lower() and "compare" not in prompt.lower()
    return ("local answer to: " + prompt[:30], 0.9 if simple else 0.4)

def cloud_model(prompt): return "cloud answer to: " + prompt[:30]

def handle(prompt, contains_private_data, allow_cloud_for_private=False, threshold=0.7):
    answer, conf = local_model(prompt)
    if conf >= threshold:
        return "local", answer
    if contains_private_data and not allow_cloud_for_private:
        return "local (low confidence, private data must stay on device)", answer + " [flagged for review]"
    return "cloud", cloud_model(prompt)

for p, priv in [("Fix the typo in: helo wrld", False), ("Compare these two contracts and explain why clause 4 differs", False),
                ("Compare my medical notes and explain why the dosage changed", True)]:
    route, ans = handle(p, priv)
    print(f"{route:55} | {ans}")
```

## In the browser

**WebGPU** lets pages run neural networks on the user's GPU. **WebLLM** ([site](https://webllm.mlc.ai)) and **Transformers.js** ([docs](https://huggingface.co/docs/transformers.js)) run quantised small models entirely client-side: no server, no data leaving the page, instant scalability (each user's device is the compute). Constraints: **initial download** of hundreds of MB to a few GB (cache it), device variance, memory limits, and smaller models. Good for privacy-preserving features (summarise this page, local search, grammar help) and demos.

## On phones and edge devices

- **Hardware**: NPUs and GPUs in phones; Apple Neural Engine; Qualcomm/MediaTek NPUs; smaller RAM budgets (a few GB for the model).
- **Models**: 1–4B parameters at 4-bit; **platform-provided models** (system-level on-device models on recent phones and OSes) via APIs: use them when available, since they are optimised and shared.
- **Constraints**: **battery and thermal limits**, app size and download, memory pressure, background restrictions.
- **Techniques**: quantisation (INT4/INT8), pruning, distillation, speculative decoding with tiny drafts, KV-cache limits, shorter contexts.
- **Frameworks**: ExecuTorch (PyTorch), Core ML (Apple), LiteRT/MediaPipe (Google), ONNX Runtime Mobile, MLC LLM.

## Privacy: be precise

"On-device" improves privacy but is not magic: logs, crash reports, analytics, prompts sent to a cloud fallback, and synced chat history can still leak. Decide what data may ever leave the device, enforce it in code (the router above), and be honest in your privacy notice.

## When local is the wrong choice

- You need **frontier-level reasoning**, huge context or the best tool-use reliability.
- The device population is **diverse and weak** (you cannot guarantee RAM or GPU).
- You need **centralised control**, rapid model updates, or fleet-wide audit logs.
- The task is rare and bursty: paying per token beats shipping and updating multi-GB models.

```quiz
? Roughly how much memory does a 8B model need at Q4_K_M?
+ about 5 GB for weights, plus 1–3 GB for context and runtime
- 1 GB
- 32 GB
> About 4.9 bits per weight: 8 × 4.9 / 8 ≈ 4.9 GB.

? What mainly determines local generation speed?
+ Memory bandwidth relative to model size in bytes
- CPU clock speed alone
- The chat UI
> Decode is memory-bound on every device.

? What is a sound pattern for combining local and cloud models?
+ Try a small local model first, escalate to a larger cloud model when confidence is low, and keep private data local by policy
- Always call the cloud
- Never use local models
> Route by difficulty and data sensitivity.

? Why is "it runs on-device" not a complete privacy guarantee?
+ Logs, telemetry, cloud fallbacks and synced history can still move data off the device
- Devices cannot store data
- Local models cannot be inspected
> Enforce and document what can leave.
```

:::problem Design an offline-capable note-taking app with a "summarise my notes" feature that must work on phones and laptops without a network, but can use the cloud when online and the user permits. {level=medium tags="local,edge,design"}
Outline the architecture.

:::solution Model answer
Ship a **small instruct model (1–3B, 4-bit)** via platform on-device APIs where available, falling back to a bundled GGUF/ExecuTorch model downloaded once (with progress, checksum, storage limits). Run summarisation locally with chunking for long notes (limited context), prompt tuned for the small model, and a fine-tuned LoRA if quality needs it. A **router** checks connectivity, user consent, note sensitivity and local confidence; with permission and network, it escalates long/complex notes to a larger cloud model (redacting PII). Cache summaries, manage battery (run on charge for batch jobs), version models with rollback, evaluate on a golden set per device class, and keep logs local or opt-in.
:::
:::

:::keypoints
- Local models give privacy, offline use, latency and zero per-token cost, at the price of capability and hardware limits.
- Memory fit ≈ parameters × bits ÷ 8 (Q4_K_M ≈ 0.6 GB per billion parameters) plus context overhead; speed ≈ memory bandwidth ÷ model bytes.
- Tools: Ollama, LM Studio, llama.cpp (GGUF), MLX on Macs, WebLLM/Transformers.js in the browser, ExecuTorch/Core ML/MediaPipe on mobile.
- Small models excel at narrow, fine-tuned tasks with RAG; use local-first routing with cloud escalation for hard or low-confidence cases.
- Be precise about privacy: telemetry and fallbacks can leak; decide and enforce what leaves the device.
:::

:::resources
- [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), [llama.cpp](https://github.com/ggml-org/llama.cpp) — the main local runtimes.
- [MLX](https://github.com/ml-explore/mlx) — Apple silicon inference and fine-tuning.
- [Transformers.js](https://huggingface.co/docs/transformers.js) — run models in JavaScript, in the browser or Node.
- [Phi-3 Technical Report](https://arxiv.org/abs/2404.14219) — a small model designed to run on a phone.
- [Hugging Face smol course](https://github.com/huggingface/smol-course) — building with small models.
- [Hugging Face Hub: models](https://huggingface.co/models) — filter by size and GGUF availability.
:::
