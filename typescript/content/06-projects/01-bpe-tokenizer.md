---
title: BPE Tokenizer from Scratch
level: intermediate
time: 45
icon: puzzle
cover: #0ea5e9,#8b5cf6
tags: tokenization, Map, classes, algorithms, token counting
summary: Build the algorithm every LLM uses to turn text into tokens — byte-pair encoding — in typed TypeScript. Train merges on a corpus, encode and decode text, measure compression, and see why token counts differ from word counts.
---

Models don't read words or characters — they read **tokens**. Claude's tokenizer, like most, is based on **byte-pair encoding (BPE)**. Building a small one yourself explains why "tokenization" costs fewer tokens than you'd guess, why rare words are expensive, and why counting characters/4 is only a rough estimate.

:::def Byte-pair encoding (BPE)
A tokenizer training algorithm: start with single characters, then repeatedly **merge the most frequent adjacent pair** into a new token. After thousands of merges, common words and word-pieces become single tokens, while rare words split into several.
:::

:::flow How BPE works
Corpus | training text
Split | words → characters
Count pairs | most frequent adjacent pair
Merge | add it to the vocabulary
Repeat | until vocab size reached
:::

**You'll practise:** classes with private state, `Map` and `Set` with typed keys, tuples, readonly arrays, and pure functions you can test.

## Step 1 — Counting pairs

```ts run level=intermediate title="Step 1 · pair counting"
type Word = readonly string[];                 // a word as a list of current tokens

function countPairs(words: Map<string, number>): Map<string, number> {
  const pairs = new Map<string, number>();
  for (const [word, freq] of words) {
    const symbols = word.split(" ");
    for (let i = 0; i < symbols.length - 1; i++) {
      const pair = `${symbols[i]} ${symbols[i + 1]}`;
      pairs.set(pair, (pairs.get(pair) ?? 0) + freq);
    }
  }
  return pairs;
}

// words are stored as space-separated symbols, with a word-end marker
const words = new Map<string, number>([["l o w </w>", 5], ["l o w e r </w>", 2], ["n e w e s t </w>", 6], ["w i d e s t </w>", 3]]);
const pairs = countPairs(words);
const top = [...pairs].toSorted((a, b) => b[1] - a[1]).slice(0, 5);
console.log(top);
const example: Word = ["l", "o", "w"];
console.log(example.join("|"));
```

`"e s"` and `"s t"` appear 9 times (in *newest* and *widest*), so BPE's first merge will create the token `es`.

## Step 2 — The complete tokenizer

```ts run level=intermediate title="BPE tokenizer · complete"
type Merge = readonly [left: string, right: string];

class BPETokenizer {
  #merges: Merge[] = [];
  #vocab = new Map<string, number>();          // token → id
  #reverse: string[] = [];                      // id → token

  train(corpus: string, vocabSize: number): this {
    // 1. word frequencies, each word split into characters + an end-of-word marker
    const words = new Map<string, number>();
    for (const w of corpus.toLowerCase().match(/[a-z']+|[^\sa-z']/g) ?? []) {
      const key = [...w, "</w>"].join(" ");
      words.set(key, (words.get(key) ?? 0) + 1);
    }
    // 2. base vocabulary: every single character
    for (const key of words.keys()) for (const s of key.split(" ")) this.#add(s);

    // 3. merge the most frequent pair until the vocabulary is big enough
    while (this.#vocab.size < vocabSize) {
      const pairs = new Map<string, number>();
      for (const [key, freq] of words) {
        const s = key.split(" ");
        for (let i = 0; i < s.length - 1; i++) pairs.set(s[i] + " " + s[i + 1], (pairs.get(s[i] + " " + s[i + 1]) ?? 0) + freq);
      }
      const best = [...pairs].reduce<[string, number] | null>((a, b) => (!a || b[1] > a[1] ? b : a), null);
      if (!best || best[1] < 2) break;                       // nothing worth merging
      const [left, right] = best[0].split(" ") as [string, string];
      this.#merges.push([left, right]);
      this.#add(left + right);
      // apply the merge to every word
      const merged = new Map<string, number>();
      for (const [key, freq] of words) merged.set(BPETokenizer.#applyMerge(key.split(" "), left, right).join(" "), freq);
      words.clear();
      for (const [k, v] of merged) words.set(k, v);
    }
    return this;
  }

  encode(text: string): number[] {
    const ids: number[] = [];
    for (const w of text.toLowerCase().match(/[a-z']+|[^\sa-z']/g) ?? []) {
      let symbols = [...w, "</w>"];
      for (const [left, right] of this.#merges) symbols = BPETokenizer.#applyMerge(symbols, left, right);   // merges in training order
      for (const s of symbols) ids.push(this.#vocab.get(s) ?? this.#add(s));                                   // unknown chars get new ids
    }
    return ids;
  }

  decode(ids: readonly number[]): string {
    return ids.map((id) => this.#reverse[id] ?? "�").join("").replaceAll("</w>", " ").trim();
  }

  tokens(text: string): string[] {
    return this.encode(text).map((id) => this.#reverse[id].replace("</w>", "▁"));
  }

  get vocabSize() { return this.#vocab.size; }
  get mergeCount() { return this.#merges.length; }

  #add(token: string): number {
    if (!this.#vocab.has(token)) { this.#vocab.set(token, this.#reverse.length); this.#reverse.push(token); }
    return this.#vocab.get(token)!;
  }

  static #applyMerge(symbols: string[], left: string, right: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < symbols.length; i++) {
      if (i < symbols.length - 1 && symbols[i] === left && symbols[i + 1] === right) { out.push(left + right); i++; }
      else out.push(symbols[i]);
    }
    return out;
  }
}

// ---------------- train on a small corpus ----------------
const corpus = `
Retrieval augmented generation retrieves relevant documents and generates grounded answers.
Tokenization splits text into tokens. Tokens are the units that language models read and generate.
Embeddings represent tokens and documents as vectors. Retrieval uses embeddings to find relevant documents.
The model generates tokens one at a time. Generation is faster when prompts are shorter.
Agents call tools, read results, and generate the next step. Tools return results to the model.
`.repeat(3);

const tok = new BPETokenizer().train(corpus, 180);
console.log(`vocab: ${tok.vocabSize} tokens after ${tok.mergeCount} merges\n`);

for (const text of ["retrieval generates tokens", "tokenization", "the models read documents", "quantum chromodynamics"]) {
  const ids = tok.encode(text);
  console.log(`${text.padEnd(28)} → ${String(ids.length).padStart(2)} tokens  ${tok.tokens(text).join(" | ")}`);
}

const sample = "Agents read documents and generate grounded answers.";
const ids = tok.encode(sample);
console.log("\ndecoded:", tok.decode(ids), "  (punctuation is its own word in this simple tokenizer)");
console.log(`chars/4 estimate: ${Math.ceil(sample.length / 4)} | words: ${sample.split(/\s+/).length} | real BPE tokens: ${ids.length}`);
```

Look at the results: words that appeared often in training ("retrieval", "tokens", "documents") became one or two tokens, while "quantum chromodynamics" — never seen — splits into many small pieces. That's exactly why unusual words, code identifiers and non-English text cost more tokens with real models.

## How it works

| Part | Technique |
|---|---|
| words as symbol lists | a `Map<string, number>` of space-separated symbols → frequency |
| finding the best pair | count adjacent pairs, `reduce` to the most frequent |
| merges | stored in order as readonly tuples `[left, right]`; encoding replays them in the same order |
| vocabulary | `Map<token, id>` plus an array for `id → token` |
| private state | `#merges`, `#vocab` and the static `#applyMerge` helper can't be touched from outside |

## Making it real

You don't train your own tokenizer for Claude — use the API to count tokens exactly:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const { input_tokens } = await client.messages.countTokens({
  model: "claude-opus-5-5",
  messages: [{ role: "user", content: "Agents read documents and generate grounded answers." }],
});
console.log(input_tokens);
```

:::exercise Extend it
1. Work at the **byte** level (`new TextEncoder().encode(word)`) so any Unicode text, including emoji, can be encoded.
2. Speed up encoding with a merge-rank `Map<string, number>` and repeatedly merging the lowest-rank pair (how production BPE works).
3. Save and load the tokenizer as JSON (`{ merges, vocab }`) with a Zod schema for loading.
4. Plot compression (characters per token) as the vocabulary grows from 100 to 1,000.
:::

:::keypoints
- BPE starts from characters and repeatedly merges the most frequent adjacent pair.
- Frequent words become single tokens; rare words split into many — which is why token counts vary.
- Encoding replays merges in training order; decoding maps ids back and restores spaces.
- For Claude, count tokens exactly with `client.messages.countTokens`.
:::
