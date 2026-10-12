---
title: Text Processing & Tokenization
level: intermediate
time: 30
summary: How text becomes numbers a model can read. Word, character and subword tokenization, how BPE works, special tokens, and why token counts drive the cost, speed and limits of every LLM.
---

Neural networks only understand numbers. The very first step of every language model is to cut text into pieces called **tokens** and map each to an integer ID. How you cut the text affects cost, speed, multilingual quality and even whether the model can spell or do arithmetic.

:::def Token
A piece of text the model treats as one unit — a whole word, part of a word, a single character, or a punctuation mark. In English, one token is roughly **¾ of a word** (≈ 4 characters) on average.
:::

:::def Tokenizer
The component that splits text into tokens and converts them to integer IDs (**encode**), and turns IDs back into text (**decode**). Each model family has its own tokenizer and vocabulary.
:::

:::def Vocabulary
The fixed set of all tokens a tokenizer knows, each with an ID. Modern LLM vocabularies have roughly 30,000–250,000 tokens.
:::

```text
"Tokenization isn't magic!"
      ↓ tokenizer (subword)
["Token", "ization", " isn", "'t", " magic", "!"]
      ↓ vocabulary lookup (IDs below are illustrative)
[ 4421,    2065,      2125,   956,  11204,    0 ]   → these IDs go into the model
```

## Three ways to tokenize

```python run level=easy
import re

text = "Unbelievably, the transformer's attention works!"

word_tokens = re.findall(r"\w+|[^\w\s]", text)           # words + punctuation
char_tokens = list(text)                                   # characters

print("word-level:", word_tokens, f"({len(word_tokens)} tokens)")
print("char-level:", char_tokens[:15], "...", f"({len(char_tokens)} tokens)")
```

| Approach | Vocabulary | Sequence length | Problem |
|---|---|---|---|
| **word** | huge (every word form) | short | unknown words ("out-of-vocabulary"), "run/runs/running" all separate |
| **character** | tiny (~100s) | very long | slow, hard to learn meaning from single letters |
| **subword** (BPE, WordPiece, Unigram) | medium (~32k–250k) | medium | ✅ the sweet spot — used by all modern LLMs |

:::def Subword tokenization
Splitting text into frequent **chunks of characters**: common words stay whole ("the"), rare words split into meaningful pieces ("unbelievably" → "un", "believ", "ably"). Any text can be represented, and the vocabulary stays manageable.
:::

## A tiny word-level tokenizer

```python run level=easy
import re

class WordTokenizer:
    def __init__(self, corpus):
        words = sorted(set(re.findall(r"\w+|[^\w\s]", corpus.lower())))
        self.itos = ["<pad>", "<unk>"] + words            # id -> token
        self.stoi = {t: i for i, t in enumerate(self.itos)}  # token -> id

    def encode(self, text):
        return [self.stoi.get(t, 1) for t in re.findall(r"\w+|[^\w\s]", text.lower())]

    def decode(self, ids):
        return " ".join(self.itos[i] for i in ids)

tok = WordTokenizer("the cat sat on the mat. the dog sat on the log.")
print("vocab size:", len(tok.itos))
ids = tok.encode("The cat sat on the sofa.")
print(ids)
print(tok.decode(ids))          # "sofa" was never seen -> <unk>
```

That `<unk>` is the fatal flaw of word-level tokenizers: unseen words lose all information. Subword tokenizers never need `<unk>`.

## Byte-Pair Encoding (BPE) — the idea

:::def Byte-Pair Encoding (BPE)
A subword algorithm used by GPT, Llama, Claude and many others. Start with single characters (or bytes). Repeatedly find the **most frequent adjacent pair** of tokens in the training text and **merge** it into a new token. Stop when the vocabulary reaches the target size. The list of merges *is* the tokenizer.
:::

```python run level=intermediate
from collections import Counter

corpus = "low lower lowest newer newest wider widest " * 3
words = [list(w) + ["</w>"] for w in corpus.split()]      # characters + end-of-word marker

def most_common_pair(words):
    pairs = Counter()
    for w in words:
        for a, b in zip(w, w[1:]):
            pairs[(a, b)] += 1
    return pairs.most_common(1)[0] if pairs else None

def merge(words, pair):
    out = []
    for w in words:
        i, new = 0, []
        while i < len(w):
            if i < len(w) - 1 and (w[i], w[i + 1]) == pair:
                new.append(w[i] + w[i + 1]); i += 2
            else:
                new.append(w[i]); i += 1
        out.append(new)
    return out

for step in range(1, 9):
    (pair, count) = most_common_pair(words)
    words = merge(words, pair)
    print(f"merge {step}: {pair[0]!r} + {pair[1]!r} -> {pair[0] + pair[1]!r}  (seen {count}x)")

print("\nfinal tokens for each word:")
for w in sorted({" ".join(w) for w in words}):
    print("  ", w.split())
```

Frequent pieces like `est</w>`, `low` and `er` became tokens automatically — the algorithm discovered English suffixes by counting. You will build a full, byte-level BPE tokenizer in the **Project Lab**.

## Tokens in practice

### Token counts drive cost, speed and limits

:::def Context window
The maximum number of tokens (input + output) a model can handle in one request. Current frontier models offer context windows of hundreds of thousands to a million tokens.
:::

```python run level=intermediate
def rough_tokens(text: str) -> int:
    """A rough estimate for English: ~4 characters per token. Use the real tokenizer for exact counts."""
    return max(1, round(len(text) / 4))

docs = {
    "tweet": "Just shipped my first RAG app 🚀",
    "email": "Hi team, please find attached the quarterly report. " * 6,
    "book chapter": "word " * 6000,
}
price_per_million = 4.00
for name, text in docs.items():
    t = rough_tokens(text)
    print(f"{name:<13} ~{t:>6,} tokens   ≈ ${t * price_per_million / 1e6:.4f} as input")
```

:::warn Token ≠ word ≠ character
Never estimate limits by counting words or characters in production. Use the provider's token counter — for Claude, the `messages.count_tokens` API endpoint gives the exact count for a request before you send it.
:::

```python local title="Exact token counting with the Claude API"
import anthropic

client = anthropic.Anthropic()
count = client.messages.count_tokens(
    model="claude-opus-5-5",
    messages=[{"role": "user", "content": "How many tokens is this sentence?"}],
)
print(count.input_tokens)
```

### Language and format affect token counts

```python run level=intermediate
samples = {
    "English": "The weather is nice today.",
    "German": "Das Wetter ist heute schön.",
    "Hindi": "आज मौसम अच्छा है।",
    "Japanese": "今日は天気がいいです。",
    "JSON": '{"weather": "nice", "day": "today"}',
    "Python": "def f(x):\n    return x * 2",
}
for name, s in samples.items():
    print(f"{name:<9} {len(s):3d} chars  {len(s.encode('utf-8')):3d} UTF-8 bytes")
```

Byte-level BPE tokenizers start from **UTF-8 bytes**, so scripts that need more bytes per character (like Hindi or Japanese) often need more tokens for the same meaning — costing more and using more of the context window. Newer tokenizers with larger, more multilingual vocabularies reduce this gap.

### Why LLMs struggle with spelling and counting letters

```python run level=intermediate
# A model sees token IDs, not letters. Suppose the tokenizer splits like this:
tokens = ["str", "aw", "berry"]
word = "".join(tokens)
print(f"The model sees {len(tokens)} tokens: {tokens}")
print(f"Number of 'r' in {word!r}: {word.count('r')} — but no single token tells the model that directly!")
```

## Special tokens

:::def Special tokens
Reserved tokens with a structural meaning rather than text: beginning/end of sequence (`<bos>`, `<eos>`), padding (`<pad>`), separators, and markers for chat roles. Chat models use them to know where the system prompt, user turn and assistant turn begin and end.
:::

```python run level=intermediate
def apply_chat_template(messages):
    """A made-up chat template — every open model defines its own format like this."""
    out = "<|begin|>"
    for m in messages:
        out += f"<|{m['role']}|>\n{m['content']}<|end|>\n"
    return out + "<|assistant|>\n"            # the model continues from here

msgs = [{"role": "system", "content": "You are concise."},
        {"role": "user", "content": "What is a token?"}]
print(apply_chat_template(msgs))
```

When you call an API like Claude's, the provider applies the template for you — you just send the list of messages. With open models in Hugging Face you call `tokenizer.apply_chat_template(...)`.

## Text normalization and cleaning

```python run level=intermediate
import unicodedata
import re

raw = "Ｃａｆé   naïve résumé —  “smart quotes”  and  ﬁ ligature"

nfkc = unicodedata.normalize("NFKC", raw)               # unify look-alike characters
ascii_only = unicodedata.normalize("NFKD", nfkc).encode("ascii", "ignore").decode()
collapsed = re.sub(r"\s+", " ", nfkc).strip()

print("raw:      ", raw)
print("NFKC:     ", nfkc)
print("collapsed:", collapsed)
print("ascii:    ", ascii_only)
```

:::tip Don't over-clean for LLMs
Classic NLP pipelines lowercased everything and removed punctuation and "stop words". For LLMs and embeddings, **keep the text natural** — casing and punctuation carry meaning. Only remove real junk (HTML, boilerplate, broken characters) and normalize whitespace and Unicode.
:::

## Real tokenizers (run locally)

```python local title="Hugging Face tokenizers"
from transformers import AutoTokenizer      # pip install transformers

tok = AutoTokenizer.from_pretrained("gpt2")
ids = tok.encode("Tokenization isn't magic!")
print(ids)
print(tok.convert_ids_to_tokens(ids))       # ['Token', 'ization', 'Ġisn', "'t", 'Ġmagic', '!']
print(tok.decode(ids))
print("vocab size:", tok.vocab_size)        # 50257
```

The `Ġ` symbol marks a token that begins with a **space** — byte-level BPE keeps spaces attached to the following word.

```python local title="tiktoken (OpenAI's fast BPE library)"
import tiktoken                              # pip install tiktoken

enc = tiktoken.get_encoding("o200k_base")
ids = enc.encode("Hello, world! 👋")
print(len(ids), ids)
print([enc.decode([i]) for i in ids])
```

:::ai
Tokenization explains many LLM behaviours: why prices and limits are in **tokens**, why non-English text costs more, why models are shaky at **letter-counting and character-level tasks**, why numbers like `1234567` may be split oddly (hurting arithmetic), and why chunking for RAG should be measured in **tokens**, not characters.
:::

## Check yourself

```quiz
? Why do modern LLMs use subword tokenization?
+ It handles any word (no unknown tokens) with a manageable vocabulary size
- It produces the shortest possible sequences
- It's the only method that works with GPUs
> Common words stay whole; rare words split into known pieces.

? In BPE training, what gets merged at each step?
+ The most frequent adjacent pair of tokens
- The two longest words
- Random characters
> Merging frequent pairs builds up common subwords.

? Roughly how many tokens is 1,000 words of English?
+ about 1,300–1,400
- about 250
- about 4,000
> ~¾ word per token → ~1.33 tokens per word.

? Why might a Hindi sentence use more tokens than its English translation?
+ Byte-level tokenizers trained mostly on English need more pieces for scripts with multi-byte characters
- Hindi has more words
- Tokenizers ignore Hindi
> Vocabularies with less coverage of a script split it into smaller pieces.
```

:::exercise Character-level tokenizer
Build a character-level tokenizer from the text `"hello world"`: a sorted vocabulary of unique characters, `encode(text)` → list of ids, `decode(ids)` → text. Check that `decode(encode("hello")) == "hello"` and print the vocabulary size.
:::

:::solution
```python run
text = "hello world"
chars = sorted(set(text))
stoi = {c: i for i, c in enumerate(chars)}
itos = {i: c for c, i in stoi.items()}

encode = lambda s: [stoi[c] for c in s]
decode = lambda ids: "".join(itos[i] for i in ids)

print("vocab:", chars, "size", len(chars))
print(encode("hello"))
print(decode(encode("hello")) == "hello")
```
:::

:::keypoints
- Models read **token IDs**; a tokenizer encodes text → IDs and decodes IDs → text.
- **Subword** tokenizers (BPE, WordPiece, Unigram) balance vocabulary size and sequence length; BPE merges frequent pairs.
- Tokens drive **cost, latency and context limits** — count them with the real tokenizer or API.
- **Special tokens** and **chat templates** mark roles and boundaries.
- Keep text natural for LLMs; normalize Unicode and whitespace, remove junk.
:::
