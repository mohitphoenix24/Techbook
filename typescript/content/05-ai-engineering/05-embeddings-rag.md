---
title: Embeddings & RAG in TypeScript
level: advanced
time: 45
summary: Build retrieval-augmented generation end to end — typed embedding clients (Voyage), chunking with overlap, Float32Array vectors and cosine similarity, a generic vector store interface, hybrid keyword + vector search with rank fusion, and grounded answers with citations using Claude's document blocks.
---

**RAG** (retrieval-augmented generation) lets a model answer from *your* documents: find the passages most related to the question, put them in the prompt, and ask the model to answer only from them — with citations. Each step is plain, typed TypeScript.

:::def Embedding
A list of numbers (a vector) that represents the **meaning** of a text. Texts with similar meanings get vectors pointing in similar directions, so "how do I get my money back?" lands near "refund policy" even with no shared words.
:::

:::flow RAG pipeline
Documents | markdown, PDFs, pages
Chunk | ~300–800 tokens, overlap
Embed + index | vectors + metadata
Retrieve | hybrid search, top-k
Generate | answer with citations
:::

## A typed embedding client (Voyage AI)

Anthropic doesn't provide an embedding model; **Voyage AI** is the recommended provider. Its HTTP API is easy to wrap with a typed, validated client:

```ts
import { z } from "zod";

const VoyageResponse = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()), index: z.number() })),
  usage: z.object({ total_tokens: z.number() }),
});

export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[], kind: "document" | "query"): Promise<Float32Array[]>;
}

export class VoyageEmbedder implements Embedder {
  readonly dimensions = 1024;
  readonly #apiKey: string;
  constructor(apiKey = process.env.VOYAGE_API_KEY ?? "") { this.#apiKey = apiKey; }

  async embed(texts: string[], kind: "document" | "query"): Promise<Float32Array[]> {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.#apiKey}` },
      body: JSON.stringify({ model: "voyage-4", input: texts, input_type: kind }),
    });
    if (!res.ok) throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
    const { data } = VoyageResponse.parse(await res.json());
    return data.toSorted((a, b) => a.index - b.index).map((d) => Float32Array.from(d.embedding));
  }
}
```

:::tip query vs document
Embedding APIs often embed **questions** and **passages** slightly differently (`input_type`). Use `"document"` when indexing and `"query"` when searching — it measurably improves retrieval.
:::

## The whole pipeline, runnable

Below is a complete RAG pipeline that runs here. A small **hashing embedder** stands in for Voyage (same `Embedder` interface — swap one line in production). Look at how the types connect each stage.

```ts run level=advanced
// ---------------- types ----------------
type Chunk = { id: string; docId: string; title: string; text: string };
type Hit = { chunk: Chunk; score: number };

interface Embedder { readonly dimensions: number; embed(texts: string[], kind: "document" | "query"): Promise<Float32Array[]> }

interface VectorStore<M> {
  add(items: { id: string; vector: Float32Array; meta: M }[]): void;
  search(query: Float32Array, k: number, filter?: (meta: M) => boolean): { id: string; score: number; meta: M }[];
}

// ---------------- 1. chunking: pack whole sentences, overlap by one sentence ----------------
function chunkDocument(docId: string, title: string, text: string, maxWords = 30): Chunk[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()) ?? [text];
  const wordCount = (parts: string[]) => parts.join(" ").split(/\s+/).length;
  const chunks: Chunk[] = [];
  let current: string[] = [];
  const flush = () => chunks.push({ id: `${docId}#${chunks.length}`, docId, title, text: current.join(" ") });
  for (const sentence of sentences) {
    if (current.length && wordCount([...current, sentence]) > maxWords) {
      flush();
      current = current.length > 1 ? [current.at(-1)!] : [];       // overlap: repeat the last sentence
    }
    current.push(sentence);
  }
  if (current.length) flush();
  return chunks;
}

// ---------------- 2. a toy embedder (stand-in for Voyage) ----------------
const SYNONYMS: Record<string, string> = { money: "refund", reimburse: "refund", cancel: "cancellation", price: "cost", pricing: "cost", cost: "cost", costs: "cost", fee: "cost", sync: "sync", synchronise: "sync" };
class HashingEmbedder implements Embedder {
  readonly dimensions = 256;
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => {
      const v = new Float32Array(this.dimensions);
      for (const raw of t.toLowerCase().match(/[a-z]+/g) ?? []) {
        const w = SYNONYMS[raw] ?? raw.replace(/(ing|ed|s)$/, "");
        let h = 2166136261;
        for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
        v[(h >>> 0) % this.dimensions] += 1;
      }
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  }
}

// ---------------- 3. an in-memory vector store ----------------
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };   // vectors are normalised → dot = cosine

class MemoryStore<M> implements VectorStore<M> {
  #items: { id: string; vector: Float32Array; meta: M }[] = [];
  add(items: { id: string; vector: Float32Array; meta: M }[]) { this.#items.push(...items); }
  search(query: Float32Array, k: number, filter?: (meta: M) => boolean) {
    return this.#items
      .filter((it) => !filter || filter(it.meta))
      .map((it) => ({ id: it.id, score: dot(query, it.vector), meta: it.meta }))
      .toSorted((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

// ---------------- 4. keyword search + reciprocal rank fusion ----------------
const STOPWORDS = new Set(["the", "and", "for", "you", "your", "are", "does", "what", "how", "can", "with", "from", "get"]);
function keywordRank(query: string, chunks: Chunk[]): string[] {
  const terms = new Set((query.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOPWORDS.has(w)));
  return chunks
    .map((c) => ({ id: c.id, s: (c.text.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => terms.has(w)).length }))
    .filter((x) => x.s > 0).toSorted((a, b) => b.s - a.s).map((x) => x.id);
}
function rrf(rankings: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) ranking.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1)));
  return scores;
}

// ---------------- 5. index + retrieve ----------------
const docs = [
  { id: "refunds", title: "Refund policy", text: "You can request a full refund within 30 days of purchase from the Billing page. Refunds are returned to the original payment method within 5 to 7 business days. After 30 days, refunds are not available, but you can cancel to stop future charges." },
  { id: "pricing", title: "Plans and pricing", text: "The Free plan includes 3 notebooks. Pro costs 8 dollars per month and includes unlimited notebooks and 50 GB of storage. Team costs 15 dollars per user per month and adds shared workspaces." },
  { id: "sync", title: "Sync", text: "Notes sync across your devices within seconds when you are online. Offline edits are saved locally and sync when you reconnect. Conflicting edits keep both versions." },
];

const embedder: Embedder = new HashingEmbedder();          // ← production: new VoyageEmbedder()
const chunks = docs.flatMap((d) => chunkDocument(d.id, d.title, d.text));
const store = new MemoryStore<Chunk>();
const vectors = await embedder.embed(chunks.map((c) => `${c.title}. ${c.text}`), "document");
store.add(chunks.map((c, i) => ({ id: c.id, vector: vectors[i], meta: c })));
console.log(`indexed ${chunks.length} chunks from ${docs.length} documents`);
for (const c of chunks) console.log(`  ${c.id.padEnd(10)} ${c.text}`);

async function retrieve(question: string, k = 3): Promise<Hit[]> {
  const [q] = await embedder.embed([question], "query");
  const vectorHits = store.search(q, 10);
  const fused = rrf([vectorHits.map((h) => h.id), keywordRank(question, chunks)]);
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return [...fused].toSorted((a, b) => b[1] - a[1]).slice(0, k).map(([id, score]) => ({ chunk: byId.get(id)!, score }));
}

// ---------------- 6. build the grounded prompt ----------------
function buildPrompt(question: string, hits: Hit[]): string {
  const sources = hits.map((h, i) => `<source id="${i + 1}" title="${h.chunk.title}">\n${h.chunk.text}\n</source>`).join("\n");
  return `Answer the question using ONLY the sources. Cite sources like [1]. If the sources don't contain the answer, say you don't know.\n\n${sources}\n\nQuestion: ${question}`;
}

for (const question of ["How do I get my money back?", "What does the Pro plan cost?"]) {
  const hits = await retrieve(question);
  console.log(`\nQ: ${question}`);
  for (const h of hits) console.log(`  ${h.score.toFixed(4)}  ${h.chunk.id.padEnd(10)} ${h.chunk.text.slice(0, 60)}…`);
}
console.log("\n" + buildPrompt("How do I get my money back?", await retrieve("How do I get my money back?", 2)).slice(0, 400) + "…");
```

Notice "How do I get my money back?" finds the refund policy even though it shares almost no words with it — the (toy) embedding maps *money* → *refund*. Real embedding models learn thousands of such relationships.

:::def Reciprocal rank fusion (RRF)
A simple way to combine rankings from different searches: each result scores `1 / (60 + rank)` in every list it appears in, and the scores are added. It rewards results that rank well in **both** keyword and vector search, without having to compare their raw scores.
:::

## Grounded answers with Claude's document blocks

Claude can take retrieved passages as **document** content blocks and return **citations** that point at the exact text used:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
type Hit = { chunk: { title: string; text: string } };

export async function answer(question: string, hits: Hit[]) {
  const documents: Anthropic.DocumentBlockParam[] = hits.map((h) => ({
    type: "document",
    source: { type: "text", media_type: "text/plain", data: h.chunk.text },
    title: h.chunk.title,
    citations: { enabled: true },
  }));

  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    system: "Answer only from the provided documents. If they don't contain the answer, say you don't know.",
    messages: [{ role: "user", content: [...documents, { type: "text", text: question }] }],
  });

  for (const block of response.content) {
    if (block.type !== "text") continue;
    const cited = block.citations?.map((c) => (c.type === "char_location" ? `"${c.cited_text}"` : c.type)).join(", ");
    console.log(block.text, cited ? `\n   ↳ cited: ${cited}` : "");
  }
}
```

:::tip Typed vectors
Use `Float32Array` for embeddings: half the memory of `number[]`, faster math, and the type makes "this is a vector" explicit. Keep **dimensions** in your `Embedder` type so a store can reject vectors of the wrong size.
:::

:::ai
Most RAG quality problems are retrieval problems: chunks too big or too small, no overlap, missing titles, pure vector search missing exact terms (product codes, error numbers). Hybrid search + good chunking fix most of them. The `Embedder` and `VectorStore` interfaces let you swap the toy pieces above for Voyage and a real vector database (pgvector, Qdrant, Pinecone, Turbopuffer…) without touching the pipeline.
:::

## Check yourself

```quiz
? Why use input_type "query" for questions and "document" for passages?
+ The embedding model encodes them slightly differently, which improves retrieval
- Queries are shorter
- It's required to save money
> Asymmetric embeddings match questions to answers better.

? What does reciprocal rank fusion combine?
+ Rankings from different searches (e.g. keyword and vector), by rank position
- Two embedding vectors
- Several prompts
> Rank-based fusion avoids comparing incompatible scores.

? Why define Embedder and VectorStore as interfaces?
+ So toy/test implementations and production services are interchangeable
- Interfaces are faster
- The SDK requires them
> Program to interfaces; swap implementations freely.
```

:::keypoints
- RAG = chunk → embed → index → retrieve → generate with citations.
- Wrap embedding APIs in a typed, validated client; use `Float32Array` vectors.
- Chunk with overlap and keep titles/metadata; normalise vectors so dot product = cosine.
- Hybrid search (keyword + vector) with **RRF** is a strong default.
- Pass passages as `document` blocks with `citations: { enabled: true }` for grounded, cited answers.
:::
