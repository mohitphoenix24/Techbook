---
title: Docs Q&A with RAG + Evaluation
level: advanced
time: 70
icon: search
cover: #0ea5e9,#22c55e
tags: RAG, BM25, hybrid search, citations, query rewriting, evaluation
summary: A complete documentation question-answering system — Markdown loading by headings, BM25 + embedding hybrid retrieval with rank fusion, follow-up question rewriting, grounded answers with citations and an honest "I don't know", plus an evaluation suite that scores retrieval and answers.
---

The project every company wants: **"answer questions about our docs — correctly, with sources, and say when you don't know."** You'll build the whole system with clean interfaces. Here, a small extractive "answerer" stands in for the model so everything runs offline; in production you swap in Claude with document blocks.

:::flow Docs Q&A
Markdown docs | product knowledge base
Sections | split by headings
Hybrid index | BM25 + vectors
Rewrite | resolve follow-ups
Retrieve | RRF top-k
Answer | cite [n] or "I don't know"
Evaluate | hit@k + answer checks
:::

**You'll practise:** interfaces for swappable parts, generics, `Map`-heavy algorithms (BM25), discriminated union results, and building a small evaluation harness.

## The complete system

```ts run level=advanced title="Docs Q&A · complete"
// ======================= 1. documents =======================
const DOCS: Record<string, string> = {
  "pricing.md": `# Pricing
## Plans
Nimbus Notes has three plans. Free includes 3 notebooks and 100 MB storage. Pro costs $8 per month and includes unlimited notebooks and 50 GB storage. Team costs $15 per user per month and adds shared workspaces.
## Discounts
Annual billing saves 20%. Students and teachers get Pro free with a school email address.`,
  "billing.md": `# Billing
## Refunds
You can request a full refund within 30 days of purchase from the Billing page. Refunds reach your original payment method in 5 to 7 business days.
## Cancelling
Cancel anytime from Settings, then Billing. Your plan stays active until the end of the billing period.`,
  "sync.md": `# Sync
## How sync works
Notes sync across all your devices within seconds when you are online. Offline changes are saved locally and synced when you reconnect.
## Conflicts
If the same note is edited on two offline devices, Nimbus keeps both versions and shows a conflict badge.`,
  "ai.md": `# AI features
## Ask your notes
Ask your notes answers questions in plain English using only the notes you include, with links to the notes it used.
## Privacy
Your notes are never used to train models. You can turn AI features off in Settings.`,
};

// ======================= 2. load + chunk by heading =======================
type Section = { id: string; file: string; title: string; text: string };

function loadMarkdown(file: string, md: string): Section[] {
  const sections: Section[] = [];
  let doc = "", heading = "", body: string[] = [];
  const flush = () => { if (body.join(" ").trim()) sections.push({ id: `${file}#${sections.length}`, file, title: `${doc} › ${heading}`, text: body.join(" ").trim() }); body = []; };
  for (const line of md.split("\n")) {
    if (line.startsWith("# ")) doc = line.slice(2);
    else if (line.startsWith("## ")) { flush(); heading = line.slice(3); }
    else body.push(line);
  }
  flush();
  return sections;
}
const sections = Object.entries(DOCS).flatMap(([f, md]) => loadMarkdown(f, md));

// ======================= 3. retrievers (one interface, two implementations) =======================
interface Retriever { rank(query: string): string[] }          // ids, best first

const STOP = new Set("a an the is are of to in on for and or how do does i my can what with it be you your when if get much many there that this after".split(" "));
const tokenize = (s: string) => (s.toLowerCase().match(/[a-z0-9$%]+/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ing|es|s)$/, ""));

class BM25 implements Retriever {
  #docs: { id: string; tf: Map<string, number>; len: number }[];
  #df = new Map<string, number>();
  #avg: number;
  constructor(items: Section[]) {
    this.#docs = items.map((s) => {
      const toks = tokenize(`${s.title} ${s.text}`);
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.#df.set(t, (this.#df.get(t) ?? 0) + 1);
      return { id: s.id, tf, len: toks.length };
    });
    this.#avg = this.#docs.reduce((a, d) => a + d.len, 0) / this.#docs.length;
  }
  rank(query: string): string[] {
    const q = tokenize(query), N = this.#docs.length;
    return this.#docs
      .map((d) => ({ id: d.id, s: q.reduce((sum, t) => {
        const tf = d.tf.get(t) ?? 0, df = this.#df.get(t) ?? 0;
        return tf ? sum + Math.log(1 + (N - df + 0.5) / (df + 0.5)) * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * d.len / this.#avg)) : sum;
      }, 0) }))
      .filter((x) => x.s > 0).toSorted((a, b) => b.s - a.s).map((x) => x.id);
  }
}

// A toy "semantic" retriever: maps words to shared concepts (a stand-in for real embeddings)
const CONCEPTS: Record<string, string> = { money: "refund", reimburse: "refund", back: "refund", price: "cost", cheap: "cost", cheaper: "cost", free: "cost", cost: "cost", $8: "cost", long: "timing", arrive: "timing", day: "timing", until: "timing", happen: "plan", student: "education", teacher: "education", school: "education", offline: "connectivity", online: "connectivity", internet: "connectivity", train: "privacy", data: "privacy", privacy: "privacy", quit: "cancel", stop: "cancel" };
class ConceptRetriever implements Retriever {
  #items: { id: string; concepts: Set<string> }[];
  constructor(items: Section[]) { this.#items = items.map((s) => ({ id: s.id, concepts: this.#conceptsOf(`${s.title} ${s.text}`) })); }
  #conceptsOf(text: string) { return new Set(tokenize(text).map((w) => CONCEPTS[w] ?? w)); }
  rank(query: string): string[] {
    const q = this.#conceptsOf(query);
    return this.#items.map((it) => ({ id: it.id, s: [...q].filter((c) => it.concepts.has(c)).length / Math.sqrt(it.concepts.size) }))
      .filter((x) => x.s > 0).toSorted((a, b) => b.s - a.s).map((x) => x.id);
  }
}

function fuse(rankings: string[][], k = 60): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const r of rankings) r.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)));
  return [...scores].map(([id, score]) => ({ id, score })).toSorted((a, b) => b.score - a.score);
}

const retrievers: Retriever[] = [new BM25(sections), new ConceptRetriever(sections)];
const byId = new Map(sections.map((s) => [s.id, s]));
const retrieve = (q: string, k = 3) => fuse(retrievers.map((r) => r.rank(q))).slice(0, k).map((h) => ({ ...h, section: byId.get(h.id)! }));

// ======================= 4. follow-up rewriting =======================
function rewrite(question: string, history: string[]): string {
  const last = history.at(-1);
  if (!last || !/\b(it|that|this|they|those)\b|^(and|what about)\b/i.test(question)) return question;
  return `${question} (context: ${last})`;             // with a real model: ask Claude to rewrite the question
}

// ======================= 5. answering (extractive stand-in for Claude) =======================
type Answer = { kind: "answer"; text: string; citations: { n: number; title: string }[] } | { kind: "unknown"; reason: string };

const conceptsOf = (text: string) => new Set(tokenize(text).map((w) => CONCEPTS[w] ?? w));

function answer(question: string, hits: ReturnType<typeof retrieve>): Answer {
  const q = conceptsOf(question);
  const need = Math.min(2, q.size);
  // 1. is a retrieved section really about this question? (enough shared concepts)
  const relevant = hits.map((h, i) => ({ ...h, n: i + 1 }))
    .filter((h) => [...q].filter((c) => conceptsOf(`${h.section.title} ${h.section.text}`).has(c)).length >= need);
  if (!relevant.length || need === 0) return { kind: "unknown", reason: "The documentation doesn't seem to cover that." };
  // 2. pick the sentences from relevant sections that share the most concepts with the question
  const scored = relevant.flatMap((h) => (h.section.text.match(/[^.]+\./g) ?? []).map((sentence) => ({
    sentence: sentence.trim(), n: h.n, title: h.section.title,
    overlap: [...conceptsOf(sentence)].filter((c) => q.has(c)).length,
  })));
  const ranked = scored.toSorted((a, b) => b.overlap - a.overlap || a.n - b.n);      // ties → higher-ranked section first
  const top = ranked[0]?.overlap ?? 0;
  const best = ranked.filter((s) => s.overlap >= Math.max(1, top - 1)).slice(0, 2);    // drop weakly related sentences
  if (!best.length) return { kind: "unknown", reason: "The documentation doesn't seem to cover that." };
  return { kind: "answer", text: best.map((b) => `${b.sentence} [${b.n}]`).join(" "), citations: [...new Map(best.map((b) => [b.n, { n: b.n, title: b.title }])).values()] };
}

function ask(question: string, history: string[] = []): Answer {
  const standalone = rewrite(question, history);        // use the rewritten question for BOTH retrieval and answering
  return answer(standalone, retrieve(standalone));
}
const show = (a: Answer) => a.kind === "answer" ? `${a.text}\n   sources: ${a.citations.map((c) => `[${c.n}] ${c.title}`).join("; ")}` : `🤷 ${a.reason}`;

// ======================= 6. try it =======================
console.log(`indexed ${sections.length} sections\n`);
for (const q of ["How do I get my money back?", "Do students get a discount?", "Are my notes used to train models?", "Who won the World Cup?"]) {
  console.log(`Q: ${q}\nA: ${show(ask(q))}\n`);
}
console.log("Q: How do I cancel?  →  then: and what happens to my plan after that?");
console.log("A:", show(ask("and what happens to my plan after that?", ["How do I cancel?"])));

// ======================= 7. evaluation =======================
type EvalCase = { question: string; expectFile: string | null; mustContain?: string };
const evalSet: EvalCase[] = [
  { question: "How much is Pro?", expectFile: "pricing.md", mustContain: "$8" },
  { question: "How long until a refund arrives?", expectFile: "billing.md", mustContain: "5 to 7" },
  { question: "What happens if I edit a note on two devices without internet?", expectFile: "sync.md", mustContain: "both versions" },
  { question: "Can I switch off the AI features?", expectFile: "ai.md", mustContain: "turn AI features off" },
  { question: "Is there a cheaper price for teachers?", expectFile: "pricing.md", mustContain: "free" },
  { question: "What is the capital of France?", expectFile: null },
];

let hit = 0, correct = 0;
for (const c of evalSet) {
  const hits = retrieve(c.question);
  const a = answer(c.question, hits);
  const retrievedOk = c.expectFile === null || hits.some((h) => h.section.file === c.expectFile);
  const answerOk = c.expectFile === null ? a.kind === "unknown" : a.kind === "answer" && a.text.toLowerCase().includes(c.mustContain!.toLowerCase());
  hit += +retrievedOk; correct += +answerOk;
  console.log(`${retrievedOk ? "✅" : "❌"} retrieval  ${answerOk ? "✅" : "❌"} answer   ${c.question}`);
}
console.log(`\nhit@3: ${(hit / evalSet.length * 100).toFixed(0)}%   answer accuracy: ${(correct / evalSet.length * 100).toFixed(0)}%`);
```

The eval at the end is the most important part: change the chunking, the stopwords or the fusion and re-run it to see whether quality really improved.

## How it works

| Stage | Technique |
|---|---|
| loading | Markdown split by `##` headings; each section keeps "Doc › Heading" as its title |
| retrieval | two `Retriever` implementations (BM25 + concept matching) fused with reciprocal rank fusion |
| follow-ups | pronoun detection → add the previous question as context (a real system asks Claude to rewrite) |
| answering | a section must share enough concepts with the question to count; then its best sentences are cited. Result is a typed `Answer` union: `answer` with citations, or `unknown` — never a made-up answer |
| evaluation | per-question retrieval check (hit@3) + answer check (expected text, or "unknown" for out-of-scope) |

## Making it real

Swap the toy parts for real ones — the pipeline shape stays the same:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
type Section = { title: string; text: string };

export async function answerWithClaude(question: string, sections: Section[]) {
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    system: "Answer only from the provided documents. If they don't contain the answer, reply exactly: I don't know.",
    messages: [{
      role: "user",
      content: [
        ...sections.map((s): Anthropic.DocumentBlockParam => ({
          type: "document",
          source: { type: "text", media_type: "text/plain", data: s.text },
          title: s.title,
          citations: { enabled: true },
        })),
        { type: "text", text: question },
      ],
    }],
  });
  return response.content;     // text blocks carry .citations pointing at the exact sentences used
}
```

Replace `ConceptRetriever` with real embeddings (the `VoyageEmbedder` from Module 5) and keep BM25 — hybrid search is still the strongest default.

:::exercise Extend it
1. Add a **reranking** step: score the top 10 fused results with a cross-check (e.g. Claude Haiku rating relevance 1–5) and keep the best 3.
2. Grow the eval set to 30 questions, including paraphrases and multi-hop questions, and track scores over time.
3. Rewrite follow-ups with Claude (`"Rewrite the question so it stands alone: …"`) and compare eval scores.
4. Store sections and BM25 statistics in SQLite so indexing runs once.
:::

:::keypoints
- Split docs by structure (headings) and keep titles with chunks.
- Hybrid retrieval: BM25 + semantic, fused with RRF, behind one `Retriever` interface.
- Answers are a typed union — `answer` with citations or `unknown` — so "I don't know" is a first-class result.
- An evaluation suite (retrieval hit@k + answer checks) is how you know a change helped.
:::
