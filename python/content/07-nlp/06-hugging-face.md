---
title: Hugging Face Transformers
level: intermediate
time: 30
summary: Use thousands of pretrained open models in a few lines — pipelines for common tasks, tokenizers and models directly, text generation with chat templates, sentence embeddings, datasets, and running models locally.
---

**Hugging Face** is the "GitHub of AI models": a hub with hundreds of thousands of open models and datasets, plus the `transformers` library to use them. When you want to run a model **yourself** — for privacy, cost, offline use, or fine-tuning — this is where you start.

:::note Run these on your computer or Colab
These libraries download models (hundreds of MB to many GB) and need PyTorch, so the examples are marked **Run locally**. Free Google Colab notebooks work great.

```bash
pip install transformers torch accelerate sentence-transformers datasets
```
:::

:::def Pretrained model
A model already trained on a large dataset, published so others can **reuse** it — either directly, or as a starting point for fine-tuning on their own task. This "transfer learning" saves enormous compute.
:::

:::def Model Hub / checkpoint
The Hugging Face Hub hosts models by name like `"distilbert-base-uncased-finetuned-sst-2-english"`. A **checkpoint** is a saved set of trained weights you can download by that name.
:::

## Pipelines: one line per task

:::def pipeline()
The highest-level API: give it a task name (and optionally a model), and it handles tokenization, the model and post-processing for you.
:::

```python local title="Common pipelines"
from transformers import pipeline

sentiment = pipeline("sentiment-analysis")
print(sentiment(["I love this course!", "The audio quality is terrible."]))
# [{'label': 'POSITIVE', 'score': 0.9998}, {'label': 'NEGATIVE', 'score': 0.9995}]

zero_shot = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
print(zero_shot("My invoice was charged twice", candidate_labels=["billing", "bug report", "feature request"]))

ner = pipeline("ner", aggregation_strategy="simple")
print(ner("Ada Lovelace worked with Charles Babbage in London."))

summarizer = pipeline("summarization", model="facebook/bart-large-cnn")
qa = pipeline("question-answering")
print(qa(question="Who created Python?", context="Python was created by Guido van Rossum in 1991."))
```

| Task name | Does |
|---|---|
| `sentiment-analysis` / `text-classification` | label a text |
| `zero-shot-classification` | label with categories you invent on the fly |
| `ner` | find names, places, organisations |
| `question-answering` | extract an answer span from a context |
| `summarization`, `translation` | seq2seq text tasks |
| `text-generation` | continue / chat with an LLM |
| `feature-extraction` | get embeddings |
| `automatic-speech-recognition` | speech → text (e.g. Whisper) |
| `image-classification`, `image-to-text` | vision tasks |

## Tokenizer + model directly

For control, load the two pieces yourself. This is the pattern behind every pipeline.

```python local title="AutoTokenizer + AutoModel"
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

name = "distilbert-base-uncased-finetuned-sst-2-english"
tokenizer = AutoTokenizer.from_pretrained(name)
model = AutoModelForSequenceClassification.from_pretrained(name)

batch = tokenizer(["What a great day!", "This is awful."], padding=True, truncation=True, return_tensors="pt")
print(batch["input_ids"].shape)            # (2, sequence_length)
print(batch["attention_mask"])             # 1 = real token, 0 = padding

with torch.no_grad():
    logits = model(**batch).logits         # (2, 2)
probs = logits.softmax(dim=-1)
for p in probs:
    print({model.config.id2label[i]: round(float(v), 4) for i, v in enumerate(p)})
```

:::def Attention mask
A 0/1 tensor telling the model which positions are real tokens (1) and which are padding (0), so padding is ignored by attention — exactly the padding mask you built in the attention lesson.
:::

:::tip The Auto classes
`AutoTokenizer`, `AutoModel`, `AutoModelForCausalLM`, `AutoModelForSequenceClassification`… read the checkpoint's config and build the right architecture automatically. Pick the `AutoModelFor<Task>` that matches what you want to do.
:::

## Running an open LLM locally

```python local title="Chat with a small open model"
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

model_id = "Qwen/Qwen2.5-0.5B-Instruct"            # small instruct model; pick any chat model from the Hub
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype="auto", device_map="auto")

messages = [
    {"role": "system", "content": "You are a concise assistant."},
    {"role": "user", "content": "Explain attention in one sentence."},
]
inputs = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt").to(model.device)

output = model.generate(inputs, max_new_tokens=80, do_sample=True, temperature=0.7, top_p=0.9)
reply = tokenizer.decode(output[0][inputs.shape[-1]:], skip_special_tokens=True)
print(reply)
```

Every concept here is one you have built: `apply_chat_template` adds the **special tokens** for roles; `generate` runs the **autoregressive loop** with **temperature/top-p sampling** and a **KV cache**.

### Streaming tokens as they are generated

```python local
from threading import Thread
from transformers import TextIteratorStreamer

streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
Thread(target=model.generate, kwargs=dict(inputs=inputs, max_new_tokens=120, streamer=streamer)).start()
for piece in streamer:                     # a generator of text pieces — like an API stream
    print(piece, end="", flush=True)
```

### Fitting bigger models: quantization

:::def Quantization
Storing model weights with fewer bits (8-bit, 4-bit instead of 16-bit). A 7B model shrinks from ~14 GB to ~4 GB at 4-bit, usually with a small quality loss — so it fits on a laptop or a single consumer GPU.
:::

```python local title="Load a model in 4-bit (NVIDIA GPU)"
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
import torch

quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16)
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B-Instruct", quantization_config=quant, device_map="auto")
```

:::tip Easier local LLMs
For simply *running* open models on a laptop, tools like **Ollama**, **LM Studio** and **llama.cpp** are the easiest path (they use quantized GGUF files). For high-throughput serving, **vLLM** and **SGLang** are standard. Many of them expose an HTTP API you can call from Python.
:::

```python run level=intermediate
# How much memory do model weights need? (weights only — activations and KV cache are extra)
def weight_gb(params_billion, bits):
    return params_billion * 1e9 * bits / 8 / 1e9

print(f"{'model':<8}{'fp16':>8}{'int8':>8}{'int4':>8}  (GB)")
for size in [0.5, 3, 8, 70]:
    print(f"{size:>5}B  " + "".join(f"{weight_gb(size, b):8.1f}" for b in (16, 8, 4)))
```

## Sentence embeddings

```python local title="sentence-transformers"
from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer("BAAI/bge-small-en-v1.5")
docs = ["Reset your password from Settings.", "Invoices are sent monthly.", "Export data as CSV."]
doc_emb = model.encode(docs, normalize_embeddings=True)
query_emb = model.encode("I forgot my login", normalize_embeddings=True)
print(util.cos_sim(query_emb, doc_emb))    # highest score: the password document
```

## Datasets

```python local title="datasets library"
from datasets import load_dataset

ds = load_dataset("imdb", split="train[:1%]")      # a slice of the IMDB reviews dataset
print(ds)
print(ds[0]["text"][:200], ds[0]["label"])

ds = ds.map(lambda ex: {"n_words": len(ex["text"].split())})   # add a column
short = ds.filter(lambda ex: ex["n_words"] < 150)
print(len(ds), "->", len(short))
```

## Choosing a model

| Need | Look for |
|---|---|
| quick classification of short texts | a small fine-tuned encoder (DistilBERT/RoBERTa) |
| embeddings for search/RAG | a model high on the MTEB leaderboard that fits your latency budget |
| local chat / private data | an instruct LLM of a size your hardware supports (quantized) |
| best possible quality, no infrastructure | a hosted frontier model API (e.g. Claude) |

Check each model card for: **licence** (commercial use?), **languages**, **context length**, **intended use and limitations**, and **benchmarks**.

:::ai Open models vs API models
- **APIs (Claude, etc.)**: strongest capabilities, no GPUs to manage, pay per token, data leaves your machine (under the provider's data policies).
- **Open models (Hugging Face)**: full control, can run offline and on-premises, fine-tunable, fixed infrastructure costs — but you operate them and they're typically less capable than frontier APIs.

Many production systems mix both: a small local model for embeddings or classification, a frontier API for reasoning and generation.
:::

## Check yourself

```quiz
? What does `tokenizer.apply_chat_template` do?
+ Formats a list of role/content messages into the model's expected text with special tokens
- Translates the messages
- Trains the tokenizer
> Each chat model has its own template.

? Why might you quantize a model to 4-bit?
+ To cut memory use roughly 4× vs fp16 so it fits on smaller hardware
- To make it more accurate
- To increase the context window
> Usually a small quality loss for a big memory win.

? What is the attention_mask returned by a tokenizer for?
+ Marking real tokens (1) vs padding (0) so attention ignores padding
- Hiding the future tokens
- Removing stop words
> The causal mask is separate and handled inside the model.
```

:::keypoints
- `pipeline("task")` gives one-line access to pretrained models.
- `AutoTokenizer` + `AutoModelFor<Task>` give full control; tokenizers return `input_ids` + `attention_mask`.
- Chat with open LLMs via `apply_chat_template` + `generate` (sampling, streaming, KV cache built in).
- **Quantization** (8/4-bit) makes large models fit; Ollama/llama.cpp/vLLM make running them easy.
- `sentence-transformers` for embeddings, `datasets` for data. Always read the model card and licence.
:::
