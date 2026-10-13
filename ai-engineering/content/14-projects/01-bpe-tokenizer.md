---
title: Build a BPE Tokenizer
level: intermediate
time: 45
icon: scissors
cover: #f43f5e,#f59e0b
tags: tokenization, bpe, bytes, unicode
summary: Train a byte-level byte-pair-encoding tokenizer from scratch — pre-tokenisation, merge learning, encoding, decoding, special tokens and a save/load round trip — then measure compression and see why numbers, spaces and non-English text behave oddly.
---

Every LLM starts by chopping text into tokens, and almost every modern tokenizer is a variant of **byte-pair encoding (BPE)**. Building one yourself makes the strange behaviours of real models (odd spacing, expensive numbers, costlier non-English text) suddenly obvious. It is about 60 lines of code.

**What you'll build:** a byte-level BPE tokenizer that never fails on any input, with `train`, `encode`, `decode`, special tokens and `save`/`load`.

:::flow The pipeline
Text | any unicode string
Pre-tokenize | split into words and spaces
Bytes | UTF-8, so nothing is unknown
Merge | most frequent pair becomes a token
Encode | replay merges in learned order
Decode | bytes back to text
:::

:::def Byte-level BPE
Start with a vocabulary of the 256 possible byte values, so **any** text can be represented. Then repeatedly find the most frequent adjacent pair of tokens in the training data and merge it into a new token. After N merges you have a vocabulary of 256 + N tokens, where common words and word pieces are single tokens.
:::

## Step 1 — A training corpus and pre-tokenisation

BPE is learned **inside words**: first a regular expression splits text into chunks (a word with its leading space, a number, punctuation, whitespace), so merges never cross word boundaries and whitespace stays attached to the word that follows it.

```python run shared title="Step 1 · corpus and pre-tokenizer"
import re
from collections import Counter

CORPUS = """
The transformer reads tokens, not words. A token is a piece of text such as a word, part of a word, or a single character.
Language models predict the next token. Training a language model means adjusting billions of numbers so that the next token
becomes easier to predict. The tokenizer decides how text becomes tokens, and the tokens decide what the model can see.
Token counts matter because they set the cost and the context limit. A longer prompt uses more tokens and costs more money.
Common words like the, and, of, to are single tokens. Rare words are split into several pieces. Numbers such as 2026 or 3.14159
are often split digit by digit. Code is full of repeated patterns like def, return, import and self, which merge into single tokens.
Embeddings turn each token into a vector. Attention lets each token look at every other token in the context window.
The model then predicts a probability for every token in the vocabulary and samples one. Sampling with a low temperature
picks likely tokens, while a high temperature picks more surprising tokens. Retrieval augmented generation adds documents to the
prompt, so chunking and token budgets matter. Agents call tools, read results, and decide the next step. Evaluation tells you
whether a change made the system better. Tokenization, training, inference, retrieval and evaluation are the building blocks.
"""

# a GPT-2 style pattern using only ASCII classes (so it also works in the browser): contractions, words, numbers, symbols, spaces
PATTERN = re.compile(r"'(?:s|t|re|ve|m|ll|d)| ?[A-Za-zÀ-ɏ]+| ?\d+| ?[^\sA-Za-z\dÀ-ɏ]+|\s+(?!\S)|\s+")

def pretokenize(text):
    return PATTERN.findall(text)

print(pretokenize("Hello, world! It's 2026 and tokens cost  money."))
print("unique words in the corpus:", len(set(pretokenize(CORPUS))), "| total chunks:", len(pretokenize(CORPUS)))
```

Notice that `" world"` keeps its leading space. That is why, in real tokenizers, `"world"` and `" world"` are **different tokens**.

## Step 2 — Learn the merges

```python run shared title="Step 2 · train the tokenizer"
def get_pair_counts(words):
    """words: dict {tuple_of_token_ids: frequency}"""
    pairs = Counter()
    for word, freq in words.items():
        for a, b in zip(word, word[1:]):
            pairs[(a, b)] += freq
    return pairs

def merge_word(word, pair, new_id):
    out, i = [], 0
    while i < len(word):
        if i < len(word) - 1 and (word[i], word[i + 1]) == pair:
            out.append(new_id); i += 2
        else:
            out.append(word[i]); i += 1
    return tuple(out)

def apply_merge(words, pair, new_id):
    merged = Counter()
    for w, f in words.items():
        merged[merge_word(w, pair, new_id)] += f
    return merged

def train_bpe(text, num_merges):
    # every chunk becomes a tuple of byte values (0..255); identical chunks are counted once with a frequency
    words = Counter(tuple(chunk.encode("utf-8")) for chunk in pretokenize(text))
    merges = {}                                              # (id_a, id_b) -> new id, in the order learned
    for step in range(num_merges):
        pairs = get_pair_counts(words)
        if not pairs: break
        best = max(pairs, key=lambda p: (pairs[p], -p[0], -p[1]))     # most frequent; ties broken deterministically
        new_id = 256 + len(merges)
        merges[best] = new_id
        words = apply_merge(words, best, new_id)
    return merges

merges = train_bpe(CORPUS, num_merges=120)
print("learned", len(merges), "merges -> vocabulary size", 256 + len(merges))
```

Each merge is a small, concrete rule: "whenever token A is followed by token B, replace the pair with the new token C". Let us look at the first and last rules we learned, and build the vocabulary that maps every token id to its bytes.

```python run shared title="Step 2b · inspect the vocabulary"
vocab = {i: bytes([i]) for i in range(256)}
for (a, b), new_id in merges.items():
    vocab[new_id] = vocab[a] + vocab[b]

def show(tok_id):
    return repr(vocab[tok_id].decode("utf-8", errors="replace"))

print("first 12 merges (most frequent pairs in the corpus):")
for (a, b), new_id in list(merges.items())[:12]:
    print(f"  {show(a):>8} + {show(b):<8} -> {show(new_id)}")
print("\nlast 6 merges (rarer, longer pieces):")
for (a, b), new_id in list(merges.items())[-6:]:
    print(f"  {show(a):>8} + {show(b):<8} -> {show(new_id)}")
```

## Step 3 — Encode and decode

Encoding replays the merges **in the order they were learned**: for each chunk, repeatedly merge the pair with the lowest rank (earliest learned) until no learned pair is left.

```python run shared title="Step 3 · encode and decode"
rank = {pair: new_id for pair, new_id in merges.items()}      # new ids grow with learning order, so a smaller id = earlier merge

def encode_chunk(chunk):
    ids = list(chunk.encode("utf-8"))
    while len(ids) >= 2:
        pairs = set(zip(ids, ids[1:]))
        best = min(pairs, key=lambda p: rank.get(p, float("inf")))
        if best not in rank: break                              # nothing left to merge
        ids = list(merge_word(tuple(ids), best, rank[best]))
    return ids

def encode(text):
    ids = []
    for chunk in pretokenize(text):
        ids.extend(encode_chunk(chunk))
    return ids

def decode(ids):
    return b"".join(vocab[i] for i in ids).decode("utf-8", errors="replace")

text = "The tokenizer decides how text becomes tokens."
ids = encode(text)
print(ids)
print([show(i) for i in ids])
print("round trip ok:", decode(ids) == text)
```

### Test it hard

A tokenizer must be **lossless**: `decode(encode(x)) == x` for every possible string, including ones it never saw.

```python run shared title="Step 3b · round-trip tests"
tests = [
    "", " ", "   leading and trailing   ", "line one\nline two\n\nline four\ttabbed",
    "naïve café résumé", "日本語のテキスト", "emoji 🚀🔥 work too", "numbers 3.14159 and 2026",
    "def tokenize(self, text): return text.split()", "mixed العربية and English",
]
for t in tests:
    assert decode(encode(t)) == t, f"round trip failed for {t!r}"
print(f"all {len(tests)} round trips are lossless (bytes guarantee there is no unknown token)")
```

## Step 4 — A proper class with special tokens, save and load

```python run shared title="Step 4 · the Tokenizer class"
import json

class BPETokenizer:
    def __init__(self, merges=None, special_tokens=None):
        self.merges = dict(merges or {})
        self.special = dict(special_tokens or {})                # e.g. {"<|endoftext|>": 1000}
        self.vocab = {i: bytes([i]) for i in range(256)}
        for (a, b), new_id in self.merges.items():
            self.vocab[new_id] = self.vocab[a] + self.vocab[b]
        for tok, i in self.special.items():
            self.vocab[i] = tok.encode("utf-8")

    @classmethod
    def train(cls, text, num_merges, special=("<|endoftext|>",)):
        m = train_bpe(text, num_merges)
        base = 256 + len(m)
        return cls(m, {tok: base + i for i, tok in enumerate(special)})

    def _encode_plain(self, text):
        out = []
        for chunk in pretokenize(text):
            ids = list(chunk.encode("utf-8"))
            while len(ids) >= 2:
                best = min(set(zip(ids, ids[1:])), key=lambda p: self.merges.get(p, float("inf")))
                if best not in self.merges: break
                ids = list(merge_word(tuple(ids), best, self.merges[best]))
            out.extend(ids)
        return out

    def encode(self, text):
        if not self.special:
            return self._encode_plain(text)
        pattern = "(" + "|".join(re.escape(t) for t in self.special) + ")"     # special tokens are matched first, never split
        ids = []
        for part in re.split(pattern, text):
            if part in self.special: ids.append(self.special[part])
            elif part: ids.extend(self._encode_plain(part))
        return ids

    def decode(self, ids):
        return b"".join(self.vocab[i] for i in ids).decode("utf-8", errors="replace")

    def save(self):
        return json.dumps({"merges": [[a, b, i] for (a, b), i in self.merges.items()], "special": self.special})

    @classmethod
    def load(cls, blob):
        d = json.loads(blob)
        return cls({(a, b): i for a, b, i in d["merges"]}, d["special"])

tok = BPETokenizer.train(CORPUS, num_merges=150)
s = "Hello token world!<|endoftext|>The model predicts the next token."
ids = tok.encode(s)
print(ids)
print("special token id:", tok.special["<|endoftext|>"], "| decoded:", repr(tok.decode(ids)))
restored = BPETokenizer.load(tok.save())
assert restored.encode(s) == ids
print("save/load round trip: identical encoding;", len(tok.save()), "characters of JSON")
```

## Step 5 — What do the numbers tell us?

```python run shared title="Step 5 · compression, spaces, numbers and other languages"
def stats(text, tokenizer):
    ids = tokenizer.encode(text)
    n_bytes = len(text.encode("utf-8"))
    return len(ids), n_bytes, n_bytes / max(len(ids), 1)

print("how compression grows with the number of merges (on text from the training corpus):")
sample = CORPUS[:400]
for m in (0, 20, 60, 150):
    t = BPETokenizer.train(CORPUS, num_merges=m) if m else BPETokenizer({}, {})
    n, b, ratio = stats(sample, t)
    print(f"  {m:>4} merges -> {n:>4} tokens for {b} bytes  ({ratio:.2f} bytes per token)")

print("\nspaces and numbers:")
for s in ("token", " token", "tokens", " 2026", "20260101"):
    print(f"  {s!r:>12} -> {[show(i) for i in tok.encode(s)]}")

print("\nthe same idea in different languages (a tokenizer trained on English text):")
for label, s in (("English", "The model predicts the next token."), ("French", "Le modèle prédit le prochain jeton."), ("Japanese", "モデルは次のトークンを予測します。")):
    n, b, ratio = stats(s, tok)
    print(f"  {label:9} {n:>3} tokens for {len(s):>2} characters ({ratio:.2f} bytes per token)")
```

You should see three things that real tokenizers share:

- **More merges means fewer tokens** for text that looks like the training data, with diminishing returns.
- **A leading space changes the token**, and numbers are chopped into small pieces because each digit sequence is rare.
- **Text in languages that were rare in the training data uses many more tokens**: close to one token per byte. That is why non-English prompts can cost more and fit less in a context window.

## How it works

| Piece | Purpose |
|---|---|
| Byte-level start (256 tokens) | any string can be encoded; no `<unk>` token |
| Pre-tokenisation regex | prevents merges across words; keeps spaces attached to the next word |
| Merge table (ordered) | the whole "model": a list of rules learned from frequency |
| Encode = replay merges by rank | deterministic; same text, same tokens |
| Special tokens | matched before splitting, so they are never broken apart |
| `vocab` mapping | token id to bytes, for decoding |

:::exercise Extend it
1. Print the 20 longest tokens in your vocabulary and guess why they were learned.
2. Train on a larger text (for example this lesson's own Markdown) and plot tokens-per-word against vocabulary size.
3. Add a `count_tokens(text)` helper and use it to estimate the cost of a prompt at $2 per million tokens.
4. Make encoding faster by caching `encode_chunk` results per chunk (what hit rate do you get?).
5. Compare with a real tokenizer on your machine (`pip install tiktoken`) and see where yours differs.
:::

:::keypoints
- Byte-level BPE starts from 256 byte tokens and learns merges of frequent pairs, so any text is encodable.
- A pre-tokenisation regex keeps merges inside words and attaches spaces to the following word.
- The merge list is the model; encoding replays merges in learned order and is deterministic and lossless.
- Compression improves with more merges; rare scripts and numbers fragment into many tokens, which costs money and context.
- Special tokens must be matched before splitting.
:::
