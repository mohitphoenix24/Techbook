---
title: Build a GPT-Style BPE Tokenizer
level: intermediate
time: 60
icon: code
cover: #6366f1,#06b6d4
tags: tokenization, bpe, nlp, from-scratch
summary: Build the byte-level Byte-Pair Encoding tokenizer that GPT-style models use — training, encoding, decoding, regex pre-tokenization, special tokens and saving — from scratch, in about 120 lines.
---

Every LLM starts with a tokenizer, and most modern ones use **byte-level BPE**. In this project you'll build a complete one: it learns merges from text, encodes any string (any language, any emoji) into token IDs, decodes them back perfectly, and saves itself to disk.

:::note How projects work
Project steps **build on each other** — each step uses what earlier steps defined, like cells in a notebook. Run them in order, or press **▶ Run all steps** at the top.
:::

**What you'll practise:** bytes and UTF-8, dictionaries and `Counter`, greedy algorithms, regex, classes, JSON. **Concepts:** vocabulary, merges, compression ratio, special tokens.

:::flow How the tokenizer works
Text | "Hello 👋"
UTF-8 bytes | 72 101 108 …
Pre-tokenize | split into word-ish chunks
Apply merges | in the order they were learned
Token IDs | [362, 111, 270, …]
:::

## Step 1 — Text is bytes

Byte-level BPE starts from the 256 possible **byte values**, so it can represent *any* text with no unknown tokens.

```python run shared title="Step 1 · bytes"
text = "Hello 👋 नमस्ते"
raw = text.encode("utf-8")
print(len(text), "characters →", len(raw), "bytes")
print(list(raw))
print(bytes(list(raw)).decode("utf-8"))      # bytes round-trip perfectly
```

## Step 2 — Count adjacent pairs and merge them

These two helpers are the heart of BPE.

```python run shared title="Step 2 · pair counting and merging"
from collections import Counter

def count_pairs(ids, counts=None):
    """Count how often each adjacent pair of ids appears."""
    counts = Counter() if counts is None else counts
    for pair in zip(ids, ids[1:]):
        counts[pair] += 1
    return counts

def merge(ids, pair, new_id):
    """Replace every occurrence of `pair` in `ids` with `new_id`."""
    out, i = [], 0
    while i < len(ids):
        if i < len(ids) - 1 and ids[i] == pair[0] and ids[i + 1] == pair[1]:
            out.append(new_id)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return out

ids = list("aaabdaaabac".encode())
print("start:", ids)
pair = count_pairs(ids).most_common(1)[0][0]
print("most common pair:", pair, "=", bytes(pair))
print("after merge:", merge(ids, pair, 256))
```

## Step 3 — Pre-tokenization with a regex

GPT-2-style tokenizers first split text into chunks (words with their leading space, numbers, punctuation) and **never merge across chunk boundaries**. This stops merges like "dog." + " " from wasting vocabulary.

```python run shared title="Step 3 · regex pre-tokenizer"
import re

SPLIT_PATTERN = re.compile(r"""'(?:[sdmt]|ll|ve|re)| ?[A-Za-zÀ-ɏ]+| ?\d{1,3}| ?[^\sA-Za-z\d]+|\s+(?!\S)|\s+""")

print(SPLIT_PATTERN.findall("Hello world! It's 2026, isn't it? 123456"))
```

## Step 4 — The tokenizer class

```python run shared title="Step 4 · BPETokenizer"
import json

class BPETokenizer:
    def __init__(self, pattern=SPLIT_PATTERN):
        self.pattern = pattern
        self.merges = {}                                   # (id_a, id_b) -> new_id, in learning order
        self.vocab = {i: bytes([i]) for i in range(256)}   # id -> bytes
        self.special = {}                                  # "<|endoftext|>" -> id

    # ---------------- training ----------------
    def train(self, text, vocab_size, verbose=False):
        assert vocab_size >= 256
        chunks = [list(c.encode("utf-8")) for c in self.pattern.findall(text)]
        for i in range(vocab_size - 256):
            counts = Counter()
            for ids in chunks:
                count_pairs(ids, counts)
            if not counts:
                break
            pair = max(counts, key=counts.get)
            new_id = 256 + i
            chunks = [merge(ids, pair, new_id) for ids in chunks]
            self.merges[pair] = new_id
            self.vocab[new_id] = self.vocab[pair[0]] + self.vocab[pair[1]]
            if verbose and (i < 10 or i % 50 == 0):
                print(f"merge {i + 1:3d}: {self.vocab[pair[0]]!r} + {self.vocab[pair[1]]!r} -> {self.vocab[new_id]!r}  ({counts[pair]}x)")

    # ---------------- encoding ----------------
    def _encode_chunk(self, ids):
        while len(ids) >= 2:
            pairs = set(zip(ids, ids[1:]))
            pair = min(pairs, key=lambda p: self.merges.get(p, float("inf")))   # earliest-learned merge first
            if pair not in self.merges:
                break
            ids = merge(ids, pair, self.merges[pair])
        return ids

    def encode(self, text, allow_special=True):
        if allow_special and self.special:
            parts = re.split("(" + "|".join(re.escape(s) for s in self.special) + ")", text)
        else:
            parts = [text]
        out = []
        for part in parts:
            if part in self.special:
                out.append(self.special[part])
            elif part:
                for chunk in self.pattern.findall(part):
                    out.extend(self._encode_chunk(list(chunk.encode("utf-8"))))
        return out

    # ---------------- decoding ----------------
    def decode(self, ids):
        inverse_special = {v: k.encode("utf-8") for k, v in self.special.items()}
        data = b"".join(inverse_special.get(i) or self.vocab[i] for i in ids)
        return data.decode("utf-8", errors="replace")

    # ---------------- extras ----------------
    def add_special_tokens(self, tokens):
        for t in tokens:
            self.special[t] = len(self.vocab) + len(self.special)

    @property
    def vocab_size(self):
        return len(self.vocab) + len(self.special)

    def save(self, path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"merges": [[a, b, i] for (a, b), i in self.merges.items()], "special": self.special}, f)

    @classmethod
    def load(cls, path):
        tok = cls()
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for a, b, i in data["merges"]:                     # replay merges in order to rebuild the vocab
            tok.merges[(a, b)] = i
            tok.vocab[i] = tok.vocab[a] + tok.vocab[b]
        tok.special = data["special"]
        return tok

print("BPETokenizer ready")
```

:::def Merge rank
The order in which merges were learned. When encoding, BPE always applies the **earliest-learned** merge available first — that's why `_encode_chunk` picks the pair with the lowest merge id. Using the same order as training guarantees consistent tokenization.
:::

## Step 5 — Train it

```python run shared title="Step 5 · train on a corpus"
corpus = """
Machine learning models learn patterns from data. Large language models learn patterns from text.
A tokenizer turns text into tokens, and tokens into numbers. The model only ever sees the numbers.
Training a tokenizer means learning which pieces of text appear together most often.
Byte pair encoding merges the most frequent pair of tokens again and again until the vocabulary is full.
Learning, learned, learner and learns share the piece "learn". Tokenization, tokenizer and tokens share "token".
""" * 20

tokenizer = BPETokenizer()
tokenizer.train(corpus, vocab_size=356, verbose=True)
print("\nvocabulary size:", tokenizer.vocab_size)
longest = sorted(tokenizer.vocab.values(), key=len, reverse=True)[:12]
print("longest learned tokens:", [t.decode("utf-8", "replace") for t in longest])
```

## Step 6 — Encode, decode and measure

```python run shared title="Step 6 · encode / decode / compression"
samples = [
    "Large language models learn from text.",
    "Tokenizers are learning machines!",
    "Unseen words like pneumonoultramicroscopic still work.",
    "Emoji 🤖 and Hindi नमस्ते and 日本語 are fine too.",
]
for s in samples:
    ids = tokenizer.encode(s)
    assert tokenizer.decode(ids) == s, "round-trip failed!"
    pieces = [tokenizer.decode([i]) for i in ids]
    ratio = len(s.encode("utf-8")) / len(ids)
    print(f"{len(ids):3d} tokens  ({ratio:.2f} bytes/token)  {pieces}")
```

Pieces printed as `�` are **single bytes** of a multi-byte character (an emoji is 4 bytes, each Devanagari letter 3). On their own they aren't valid UTF-8 — only together do they decode correctly, which is exactly why the full round-trip still succeeds. Our small English corpus never learned merges for those bytes, so they cost one token each.

:::def Compression ratio
Bytes per token. Higher means the tokenizer packs more text into each token — cheaper and faster for the model. Text similar to the training corpus compresses well; unfamiliar text (or other scripts) falls back towards 1 byte per token.
:::

## Step 7 — Special tokens, saving and loading

```python run shared title="Step 7 · special tokens + persistence"
tokenizer.add_special_tokens(["<|endoftext|>", "<|user|>", "<|assistant|>"])
chat = "<|user|>What is a token?<|assistant|>A piece of text.<|endoftext|>"
ids = tokenizer.encode(chat)
print(ids)
print([tokenizer.decode([i]) for i in ids])

tokenizer.save("my_tokenizer.json")
reloaded = BPETokenizer.load("my_tokenizer.json")
test = "Tokenizers learn patterns 🤖 <|endoftext|>"
print("identical after reload:", reloaded.encode(test) == tokenizer.encode(test))
```

## Step 8 — Experiment: vocabulary size vs compression

```python run shared title="Step 8 · vocabulary size experiment"
import matplotlib.pyplot as plt

test_text = "Large language models learn patterns from text and turn tokens into numbers."
sizes, ratios = [], []
for vs in [256, 280, 330, 400]:
    t = BPETokenizer()
    t.train(corpus, vocab_size=vs)
    sizes.append(vs)
    ratios.append(len(test_text.encode()) / len(t.encode(test_text)))

fig, ax = plt.subplots(figsize=(6.5, 3.5))
ax.plot(sizes, ratios, marker="o")
ax.set(xlabel="vocabulary size", ylabel="bytes per token", title="Bigger vocabulary → better compression")
plt.show()
```

Real tokenizers use vocabularies of ~50k–250k tokens trained on huge, diverse corpora, so common words in many languages become single tokens.

:::exercise Extensions
1. Train on a different language and compare compression on English vs that language.
2. Add a `visualize(text)` method that prints tokens separated by `|`.
3. Speed up training by counting pairs per **unique** chunk with its frequency instead of per occurrence.
4. Compare your tokenizer's output with `tiktoken` or Hugging Face's GPT-2 tokenizer on your computer.
:::

:::solution Hint for extension 3
```python
from collections import Counter
chunk_freq = Counter(SPLIT_PATTERN.findall(corpus))          # each distinct chunk once, with its count
chunks = {tuple(c.encode()): n for c, n in chunk_freq.items()}
# when counting pairs, add n for each pair in a chunk instead of 1 — far fewer loops on real text
```
:::

:::keypoints
- Byte-level BPE starts from 256 byte tokens, so **any** text can be encoded — no `<unk>`.
- Training repeatedly **merges the most frequent adjacent pair**; the ordered merge list *is* the tokenizer.
- Encoding applies merges in **learned order**; decoding concatenates token bytes and decodes UTF-8.
- **Regex pre-tokenization** keeps merges within word-like chunks; **special tokens** mark structure.
- Larger vocabularies compress better; unfamiliar text costs more tokens.
:::
