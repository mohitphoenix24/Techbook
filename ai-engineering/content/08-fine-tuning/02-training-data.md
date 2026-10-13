---
title: Training Data for Fine-Tuning
level: intermediate
time: 50
summary: Data decides the outcome of fine-tuning. Formats (instruction pairs, chat JSONL, preference pairs), chat templates and why you mask the loss to assistant tokens, where examples come from (experts, logs, synthetic, distillation), cleaning, deduplication, quality filtering, diversity and coverage, decontamination from your eval set, splits and mixing, and a runnable pipeline that builds, masks and filters a dataset.
---

In fine-tuning, **the dataset is the specification**. The model will learn to produce whatever the examples show: the good habits, the typos, the inconsistent formatting, the leaked secrets. Practitioners consistently report that most of the effort, and most of the gain, is in the data.

## Formats

| Format | Shape | Used for |
|---|---|---|
| **Instruction pairs** | `{"instruction": ..., "input": ..., "output": ...}` | simple SFT |
| **Chat / messages** (the standard) | `{"messages": [{"role": "system"...}, {"role": "user"...}, {"role": "assistant"...}]}` | chat models, multi-turn, tool use |
| **Preference pairs** | `{"prompt": ..., "chosen": ..., "rejected": ...}` | DPO and reward modelling |
| **Prompt + verifier** | `{"prompt": ..., "answer": ..., "checker": ...}` | RL with verifiable rewards |
| **Raw text** | documents | continued pretraining |

Store datasets as **JSON Lines** (one JSON object per line), versioned.

```text
{"messages": [{"role": "system", "content": "You are a support classifier. Reply with one label."},
              {"role": "user", "content": "I was charged twice for March"},
              {"role": "assistant", "content": "billing"}]}
```

## Chat templates and loss masking

Models expect conversations rendered with **their own template** (special tokens marking roles). **Always use the model's official template** (the tokenizer's `apply_chat_template`); a mismatched template silently degrades quality.

For SFT you usually compute the loss **only on the assistant's tokens**. The prompt (system and user) is context, not something to imitate: training on it wastes capacity and can teach the model to generate user text.

:::def Loss masking
Setting the training label of non-target tokens to a special ignore value (commonly −100) so they contribute **no gradient**. Only the assistant response tokens (and the end-of-turn token) are learned.
:::

```python run title="Render a chat, tokenise, and mask the loss to assistant tokens" level=intermediate
IGNORE = -100

def render(messages):
    """A simplified ChatML-style template. Returns (text_segments) as (text, is_trainable)."""
    segs = []
    for m in messages:
        header = f"<|im_start|>{m['role']}\n"
        body = m["content"] + "<|im_end|>\n"
        if m["role"] == "assistant":
            segs.append((header, False))          # the role header is context (generation starts after it)
            segs.append((body, True))             # the response and end token are trained
        else:
            segs.append((header + body, False))
    return segs

def tokenize(text):                               # toy tokenizer: split on spaces, keep special tokens whole
    out = []
    for piece in text.replace("\n", " \n ").split(" "):
        if piece: out.append(piece)
    return out

def build_example(messages, vocab):
    input_ids, labels = [], []
    for text, trainable in render(messages):
        for tok in tokenize(text):
            tid = vocab.setdefault(tok, len(vocab))
            input_ids.append(tid)
            labels.append(tid if trainable else IGNORE)
    return input_ids, labels

vocab = {}
msgs = [{"role": "system", "content": "Reply with one label."},
        {"role": "user", "content": "I was charged twice"},
        {"role": "assistant", "content": "billing"}]
ids, labels = build_example(msgs, vocab)
inv = {v: k for k, v in vocab.items()}
print(f"{'token':16} {'input_id':>8} {'label':>6}")
for i, l in zip(ids, labels):
    print(f"{inv[i]!r:16} {i:>8} {('IGNORE' if l == IGNORE else l):>6}")
print(f"\ntrained tokens: {sum(l != IGNORE for l in labels)} of {len(labels)}")
```

Only `billing` and the end marker carry loss. In multi-turn data you can train on **all** assistant turns, or only the last one; be deliberate.

## Where examples come from

| Source | Pros | Cons |
|---|---|---|
| **Expert-written** | highest quality; encodes your standards | slow, costly |
| **Production logs (curated)** | real distribution and phrasing | contains errors; privacy; needs filtering and correction |
| **Human corrections of model outputs** | efficient: edit rather than write; targets real failures | needs a review tool |
| **Existing artefacts** (tickets with resolutions, macros, docs) | cheap | noisy, inconsistent |
| **Synthetic from a strong model** (distillation) | scalable, controllable | inherits the teacher's errors; licence terms; sameness |
| **Rejection sampling** | generate many, keep those passing a checker or judge | needs a verifier |
| **Public datasets** | free | rarely match your task; licences; contamination |

### Synthetic data done well

1. Define **dimensions of variation** (topic, difficulty, persona, format, edge cases) and sample across them.
2. Use a **strong teacher** with detailed instructions and few-shot seeds from real examples.
3. **Filter hard**: automatic checks (format, length, constraints), a judge for quality, **deduplication**, and **human review of a sample** (a few hundred, not just a handful).
4. **Verify answers** where possible (execute code, check maths, validate against sources).
5. Keep **provenance** (which model, prompt, date), and respect the **teacher model's terms of use**.
6. Beware **model collapse / homogenisation**: training repeatedly on a model's own outputs narrows diversity and can amplify errors; mix in real data.

## Quality: the dominant factor

Signs of good data: **correct**, **consistent** (the same input type gets the same style of output), **representative** of production inputs, **concise** (no filler the model will then imitate), **diverse**, and **free of leakage and private data**.

Signs of bad data: contradictory labels, inconsistent tone, unwanted preambles ("Sure! Here is..."), wrong answers, duplicates, truncated outputs, test-set leakage.

Practical tips:

- **Read a random sample of 100 examples** before training. Every time.
- Write **guidelines** and measure **inter-annotator agreement**.
- **Remove what you do not want the model to say** (apologies, disclaimers, boilerplate).
- Prefer **fewer, better** examples to many mediocre ones.

## Cleaning and filtering pipeline

```python run title="Dedupe, filter and report on a raw dataset" level=intermediate
import re, json
from collections import Counter

raw = [
    {"messages": [{"role": "user", "content": "I was charged twice"}, {"role": "assistant", "content": "billing"}]},
    {"messages": [{"role": "user", "content": "i was charged twice!"}, {"role": "assistant", "content": "billing"}]},      # near-duplicate
    {"messages": [{"role": "user", "content": "App crashes on login"}, {"role": "assistant", "content": "Sure! Here is the label: bug"}]},   # filler
    {"messages": [{"role": "user", "content": "Please add dark mode"}, {"role": "assistant", "content": "feature"}]},
    {"messages": [{"role": "user", "content": "refund my order, my email is bob@example.com"}, {"role": "assistant", "content": "billing"}]},  # PII
    {"messages": [{"role": "user", "content": "???"}, {"role": "assistant", "content": ""}]},                              # empty output
    {"messages": [{"role": "user", "content": "How do I reset my password?"}, {"role": "assistant", "content": "other"}]},
]
LABELS = {"billing", "bug", "feature", "other"}

def norm(s): return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()

def check(ex):
    user = ex["messages"][0]["content"]; out = ex["messages"][-1]["content"]
    if not out.strip():                         return "empty output"
    if out not in LABELS:                       return "output is not exactly one label"
    if re.search(r"[\w.+-]+@[\w-]+\.\w+", user): return "contains an email address"
    return None

seen, kept, dropped = set(), [], Counter()
for ex in raw:
    key = norm(ex["messages"][0]["content"])
    reason = check(ex) or ("duplicate" if key in seen else None)
    if reason: dropped[reason] += 1; continue
    seen.add(key); kept.append(ex)

print(f"kept {len(kept)} of {len(raw)}")
for reason, n in dropped.items(): print(f"  dropped {n}: {reason}")
print("label balance:", Counter(ex['messages'][-1]['content'] for ex in kept))
```

Add: **length filters** (too short or too long), **language** detection, **toxicity** and **PII** filters, **near-duplicate** detection (MinHash/embedding clustering), **quality scoring** (a judge or a classifier trained on "good" vs "bad" examples), and **balance checks** (class and topic distributions).

## Diversity and coverage

A model generalises only within the **span of its examples**. Check coverage along the axes that matter to you:

- **Intent / label distribution** (and rare classes).
- **Input style**: short and long, formal and sloppy, multilingual, with typos.
- **Difficulty**: include hard and ambiguous cases, with the **right** behaviour (ask a question, abstain, escalate).
- **Negative and refusal cases** (out-of-scope requests handled as you want).
- **Edge formats**: empty input, very long input, adversarial text.

If you teach the model to always answer, it will answer even when it should not. Include **"I can't help with that" and "I need more information"** examples where appropriate.

## Decontamination and splits

- **Never train on your eval set.** Deduplicate training data against evaluation data (exact and near-duplicate), including paraphrases and translated versions.
- Keep a **held-out validation set** (to watch overfitting during training) and a separate **test set** (final comparison).
- Split by **source or conversation** (not by random message) so near-identical examples do not straddle train and validation.
- **Time-split** when the future differs from the past.

```python run title="Check for train/eval leakage with n-gram overlap" level=intermediate
def ngrams(text, n=5):
    w = text.lower().split()
    return {" ".join(w[i:i + n]) for i in range(max(1, len(w) - n + 1))}

train = ["Reset a forgotten password from the login page by choosing 'Forgot password' and following the emailed link.",
         "To update your billing address open Settings, then Billing, then click Edit address."]
eval_set = ["Reset a forgotten password from the login page by choosing Forgot password and following the emailed link now.",
            "How do I cancel my subscription after the trial ends?"]

train_grams = set().union(*(ngrams(t) for t in train))
for q in eval_set:
    overlap = len(ngrams(q) & train_grams) / len(ngrams(q))
    print(f"overlap {overlap:>4.0%}  {'LEAK: remove from train or eval' if overlap > 0.3 else 'ok'}  | {q[:60]}")
```

## Mixing data

Pure task data can cause **forgetting** of general behaviour. A common remedy is to **mix** in general instruction data (a small percentage, for example 5–20%) or to use **LoRA** with a modest learning rate. When combining sources, set **sampling weights**, shuffle, and watch per-source metrics.

## Size, epochs and the "enough" test

Fine-tune on a growing subset (10%, 25%, 50%, 100%) and plot eval scores. If quality plateaus early, more data of the same kind will not help: improve **quality or coverage** instead. If it is still climbing, collect more.

## Privacy and licensing

Training data may be **memorised and regurgitated**. Remove personal and confidential data, check **licences** of datasets and **teacher-model terms** (some providers prohibit using outputs to train competing models), and keep a **datasheet** (source, collection method, filters, known issues).

```quiz
? Why mask the loss to assistant tokens in SFT?
+ The prompt is context, not behaviour to imitate; training on it wastes capacity and can teach the model to generate user text
- To speed up tokenization
- Because system prompts are secret
> Only the response tokens should carry loss.

? What is the most important habit before training?
+ Reading a random sample of the dataset (and checking labels, tone, duplicates, leakage)
- Doubling the dataset size
- Picking the largest GPU
> Data problems are the most common cause of disappointing fine-tunes.

? Why is training on a model's own synthetic outputs risky at scale?
+ It can narrow diversity and amplify errors (collapse); mix real data and filter hard
- It is illegal
- It makes models faster
> Use verification, diversity and real examples.

? What does decontamination protect?
+ The honesty of your evaluation: no eval examples (or paraphrases) in the training data
- Network security
- Model size
> Leakage inflates scores and hides real quality.
```

:::problem You have 20,000 raw support conversations. Describe how you turn them into a fine-tuning dataset for a reply-drafting model. {level=medium tags="data,pipeline"}
Include selection, cleaning, labelling and evaluation.

:::solution Model answer
Filter to **resolved, high-satisfaction conversations** handled by top agents; remove PII; split threads into (customer message → agent reply) turns. **Cluster by intent** and sample for coverage. **Clean replies**: strip signatures, boilerplate, outdated policy; have experts **rewrite or approve** a subset, then use them as seeds to improve the rest (judge + rules for policy compliance). Deduplicate, balance intents, include hard and escalation cases. Apply the model's chat template with loss on assistant turns. Hold out a **time-split test set** and a human-reviewed golden set; ensure no overlap. Train a small LoRA, compare against the prompted baseline on the golden set and on safety/policy checks, and review outputs by hand before rollout.
:::
:::

:::keypoints
- The dataset is the specification: quality, consistency and coverage matter more than size.
- Use JSONL chat data, the model's own chat template, and loss masking so only assistant tokens are learned.
- Sources: experts, curated logs, corrections, existing artefacts, filtered synthetic data (watch licences and collapse).
- Clean aggressively: dedupe, filter filler, PII and bad labels; check balance and coverage, including refusals and edge cases.
- Decontaminate against evals, split by source or time, mix in general data to limit forgetting, and test whether more data still helps.
:::

:::resources
- [LIMA: Less Is More for Alignment](https://arxiv.org/abs/2305.11206) — a small, curated set goes a long way.
- [Self-Instruct](https://arxiv.org/abs/2212.10560) — bootstrapping instruction data from a model.
- [Textbooks Are All You Need](https://arxiv.org/abs/2306.11644) — data quality as a driver.
- [Tulu 3](https://arxiv.org/abs/2411.15124) — a documented open recipe with data mixes and decontamination.
- [Hugging Face Datasets docs](https://huggingface.co/docs/datasets) — loading, mapping, filtering and sharing data.
- [Hugging Face TRL docs](https://huggingface.co/docs/trl) — dataset formats for SFT, DPO and more.
:::
