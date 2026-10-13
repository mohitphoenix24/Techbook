---
title: Tokens and Tokenization
level: easy
time: 40
summary: Models read tokens, not words. Learn byte-pair encoding by training one yourself, see how text splits in an interactive tokenizer, and learn why tokenization explains odd behaviour (counting letters, arithmetic, other languages) and your bill.
---

A language model cannot read letters or words directly. It reads **tokens**: integer IDs for chunks of text. Everything you pay for, every limit you hit, and a surprising number of "AI is dumb" moments trace back to tokenization.

:::def Token
A chunk of text the model treats as one unit. It might be a whole common word (`" the"`), part of a word (`"un"`, `"believ"`, `"able"`), a single character, punctuation, or even a raw byte. A rough rule for English: **1 token ≈ 4 characters ≈ ¾ of a word**.
:::

:::def Tokenizer
The program that converts text to a list of token IDs (**encode**) and back (**decode**). It is fixed, trained before the model, and must match the model: the same text produces different IDs in different model families.
:::

:::analogy
LEGO bricks. A word-level vocabulary would need one custom brick for every possible word, including every typo and name. Instead, build from a smaller set of reusable bricks: common words are single big bricks; rare words are assembled from smaller pieces; anything at all can be built from the tiny single-byte bricks.
:::

## Why not just characters or words?

| Unit | Vocabulary size | Problem |
|---|---|---|
| Characters / bytes | ~256 | Sequences get very long (slow, expensive); each unit carries little meaning |
| Whole words | 500K+ | Cannot handle new words, typos, code identifiers; huge embedding table |
| **Subwords (BPE etc.)** | 30K–250K | A balance: common words are 1 token, rare words split, nothing is "unknown" |

## Byte-pair encoding (BPE), the idea

BPE learns its vocabulary from data by greedily **merging the most frequent adjacent pair** of symbols, again and again.

:::flow Training BPE
Start | every character (or byte) is its own token
Count pairs | which two adjacent tokens appear together most often?
Merge | replace that pair everywhere with one new token
Repeat | until the vocabulary reaches the target size
Encode | apply the learned merges, in order, to new text
:::

Try it yourself: this simulator trains BPE on a small text, and you choose how many merges to learn. Type your own text to see how it splits.

```viz algo=tokenizer title="BPE playground" merges=12
text = low lower lowest newer newest wider widest low low newer
```

## BPE from scratch

```python run title="Train a BPE tokenizer in 25 lines" level=intermediate
from collections import Counter

def get_pairs(words):
    pairs = Counter()
    for symbols, freq in words.items():
        for a, b in zip(symbols, symbols[1:]):
            pairs[(a, b)] += freq
    return pairs

def merge(words, pair):
    out = {}
    for symbols, freq in words.items():
        new, i = [], 0
        while i < len(symbols):
            if i < len(symbols) - 1 and (symbols[i], symbols[i + 1]) == pair:
                new.append(symbols[i] + symbols[i + 1]); i += 2
            else:
                new.append(symbols[i]); i += 1
        out[tuple(new)] = freq
    return out

def train_bpe(text, n_merges):
    words = Counter(tuple(w) + ("</w>",) for w in text.split())     # </w> marks a word boundary
    merges = []
    for _ in range(n_merges):
        pairs = get_pairs(words)
        if not pairs:
            break
        best = max(pairs, key=lambda p: (pairs[p], p))                 # ties broken deterministically
        words = merge(words, best)
        merges.append(best)
    return merges

def encode(word, merges):
    symbols = tuple(word) + ("</w>",)
    for pair in merges:                                                # apply merges in the order learned
        symbols = merge({symbols: 1}, pair).popitem()[0]
    return list(symbols)

text = "low " * 5 + "lower " * 2 + "newest " * 6 + "widest " * 3        # the classic toy corpus
merges = train_bpe(text, 10)
print("learned merges:", [a + b for a, b in merges])
for w in ["lowest", "newer", "slowest", "xyz"]:
    print(f"{w:>7} -> {encode(w, merges)}")
```

Notice `lowest` was never in the training text but still tokenizes into known pieces (`low` + `est</w>`), `slowest` reuses them after a stray `s`, and `xyz` falls back to single characters. (The `</w>` marker means "end of word".) **Nothing is ever "unknown".** Production tokenizers (GPT-style, Llama-style) work on raw **bytes** so even emoji and unusual scripts are covered, and they add smart pre-splitting rules (so digits, spaces and punctuation behave consistently).

## Real tokenizers

- **tiktoken** (OpenAI) and **HF `tokenizers`** implement byte-level BPE efficiently. **SentencePiece** ([paper](https://arxiv.org/abs/1808.06226)) treats text as a raw stream, used by Llama-family and T5. Vocabulary sizes range from about 32K to over 200K.
- Special tokens such as `<|im_start|>`, `<eos>` and `<tool_call>` are reserved IDs with meaning for the chat format.

```python local title="See real tokens (run on your machine)"
# pip install tiktoken
import tiktoken
enc = tiktoken.get_encoding("o200k_base")
for text in ["Hello world", "indivisibility", "2 + 2 = 4", "नमस्ते दुनिया", " the", "the"]:
    ids = enc.encode(text)
    print(f"{text!r:22} {len(ids):>2} tokens: {[enc.decode([i]) for i in ids]}")
```

:::tip Always count tokens with the model's own tokenizer
Estimates like "4 characters per token" are fine for napkin math, never for limits or billing. Providers expose a token-counting call (for Claude: `client.messages.count_tokens`). Counts differ between model generations too.
:::

## Consequences you will actually meet

1. **Cost and limits are in tokens.** Context windows, rate limits and prices are all token counts. Text in some languages (Hindi, Thai, Arabic, many others) can take **2–4× more tokens** than the same English text, which means higher cost and less room in the window.
2. **Spelling and counting letters.** "How many r's in strawberry?" is hard because the model sees `straw` + `berry`, not letters. Fix: have it write the word letter by letter, or use code.
3. **Arithmetic.** Numbers split inconsistently (`12345` might be `123` + `45`), so digit-level reasoning is harder. Use tools (a calculator or code) for exact maths.
4. **Whitespace and case matter.** `" the"` (with a space) and `"the"` are different tokens; `"Hello"` and `"hello"` differ. Trailing spaces in prompts can change behaviour.
5. **Rare strings fragment.** Random IDs, hashes, long numbers and unusual names turn into many tokens. A UUID can cost 20+ tokens.
6. **Glitch tokens.** Strings that were in the tokenizer's data but almost absent from the model's training text can produce strange behaviour.
7. **Prompt formatting changes tokens.** Verbose JSON with long keys costs more than compact formats; pretty-printed indentation costs tokens too.

```python run title="Why cost depends on tokens, not characters" level=easy
# A crude stand-in: count how many pieces text splits into with a tiny hand-made vocabulary.
vocab = ["the", " the", "ing", "tion", "un", "believ", "able", "hello", " world", "data", "set"]

def greedy_tokenize(text):
    tokens, i = [], 0
    while i < len(text):
        for piece in sorted(vocab, key=len, reverse=True):          # longest match first
            if text.startswith(piece, i):
                tokens.append(piece); i += len(piece); break
        else:
            tokens.append(text[i]); i += 1                           # fall back to one character
    return tokens

for t in ["the dataset", "unbelievable", "qzxvwk"]:
    toks = greedy_tokenize(t)
    print(f"{t!r:15} chars={len(t):2}  tokens={len(toks):2}  {toks}")
```

Gibberish costs far more tokens per character than natural text.

## Prices and the token meter

```python run title="Estimating cost from tokens" level=easy
def estimate_cost(input_tokens, output_tokens, price_in_per_m, price_out_per_m):
    return input_tokens / 1e6 * price_in_per_m + output_tokens / 1e6 * price_out_per_m

# Example prices in USD per million tokens (edit them; always check the provider's current page)
models = {"small": (0.10, 0.50), "medium": (2.00, 10.00), "large": (4.00, 20.00)}
in_tok, out_tok = 3_000, 500            # a RAG request: long prompt, short answer
for name, (pi, po) in models.items():
    c = estimate_cost(in_tok, out_tok, pi, po)
    print(f"{name:7} ${c:.5f} per request   ${c * 100_000:,.0f} per 100K requests")
```

Output tokens usually cost several times more than input tokens, and they are also slower (generated one by one). Both facts shape how you design prompts; see the token-economics lesson.

```quiz
? Why do modern LLMs use subword tokens instead of whole words?
- Subwords are easier for humans to read
+ They give a manageable vocabulary while still handling rare words, typos and new names
- Whole words are not possible in code
> Subwords balance sequence length against vocabulary size and never produce an unknown token.

? In BPE training, what happens in each step?
- A random pair of tokens is merged
+ The most frequent adjacent pair is merged into a new token
- The longest word is split in two
> BPE greedily merges the most common pair, repeating until it reaches the target vocabulary size.

? Why might a model miscount the letters in a word?
- It cannot do arithmetic
+ It sees tokens (chunks), not individual letters
- It was trained only on numbers
> Letter-level questions need a different representation; have the model spell it out or use code.

? Two models give different token counts for the same text. What should you use for budgeting?
- Either one, they are interchangeable
+ The token counter of the specific model you call
- Character count divided by four
> Tokenizers differ between families and generations; use the model's own counter.
```

:::problem Your app is 40% more expensive in India than in the US for the same features. Why, and what can you do? {level=medium tags="tokenization,cost"}
Give the likely cause and three mitigations.

:::hint Hint
Think about how tokenizers were trained and what you pay for.
:::

:::solution Model answer
Tokenizers are trained mostly on English-heavy text, so Indic and many other scripts split into **more tokens per word**, raising both cost and context usage. Mitigations: (1) measure tokens per language with the real tokenizer and price accordingly; (2) choose a model whose tokenizer is more efficient for your languages; (3) reduce tokens: shorter system prompts, prompt caching for the static part, trimming retrieved context, or translating internally only if quality testing shows it helps; (4) cap output length. Always confirm with evals, because translation can lose nuance.
:::
:::

:::keypoints
- Models read tokens (subword chunks), not words or letters; cost, limits and speed are all measured in tokens.
- BPE builds a vocabulary by repeatedly merging the most frequent adjacent pair; byte-level BPE means nothing is ever unknown.
- Roughly 1 token ≈ ¾ word in English, but many languages, numbers and random strings cost far more.
- Tokenization explains quirks: letter counting, arithmetic, whitespace sensitivity. Use tools for those jobs.
- Count tokens with the model's own tokenizer, never by character estimates.
:::

:::resources
- [Karpathy: Let's build the GPT Tokenizer (video)](https://www.youtube.com/watch?v=zduSFxRajkE) — builds BPE from scratch and explains every quirk.
- [Neural Machine Translation of Rare Words with Subword Units](https://arxiv.org/abs/1508.07909) — the BPE-for-NLP paper.
- [SentencePiece paper](https://arxiv.org/abs/1808.06226) and [repo](https://github.com/google/sentencepiece) — language-independent tokenization.
- [Tiktokenizer](https://tiktokenizer.vercel.app) — paste text, see tokens for many model families.
- [tiktoken](https://github.com/openai/tiktoken) and [HF tokenizers](https://github.com/huggingface/tokenizers) — the fast libraries.
- [HF LLM Course: tokenizers](https://huggingface.co/learn/llm-course) — chapter on tokenization algorithms (BPE, WordPiece, Unigram).
:::
