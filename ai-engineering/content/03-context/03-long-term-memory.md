---
title: Long-Term Memory for Assistants and Agents
level: intermediate
time: 45
summary: Giving an AI memory that lasts across sessions. The three kinds of memory (semantic, episodic, procedural), memory as files versus a vector store versus a profile, the write path (extract, dedupe, store) and read path (retrieve, rank, inject), forgetting and consolidation, and the privacy duties that come with remembering people. Includes a runnable memory store.
---

A model starts every conversation knowing nothing about you. **Long-term memory** is the engineering you add so an assistant remembers your preferences, your project, what it tried last week, and how you like things done.

:::analogy
Short-term memory is the whiteboard in the meeting room (the context window), wiped at the end. Long-term memory is the **notebook and filing cabinet** that people bring to the next meeting. Good assistants do two jobs: *write things down worth keeping*, and *look up the right page at the right time*.
:::

## Three kinds of memory

| Type | What it holds | Example | Typical form |
|---|---|---|---|
| **Semantic** | facts and preferences | "Priya runs a bakery"; "prefers metric units" | profile fields, key-value store, notes |
| **Episodic** | past events and interactions | "On Tuesday we debugged the payments webhook; the fix was idempotency keys" | timestamped event summaries, searchable |
| **Procedural** | how to do things | "Always run the linter before committing"; the team's coding style | instructions files, skills, learned rules |

Agents with memory usually update **procedural memory from feedback**: when a user corrects the assistant, the lesson is saved as a rule for next time.

## Where memory lives

| Store | How it works | Good for | Watch out |
|---|---|---|---|
| **Instruction files** (`CLAUDE.md`, `AGENTS.md`, project notes) | text files loaded into context at start | stable project knowledge, team conventions | keep short; they cost tokens every time |
| **Profile / key-value** | a structured record per user | preferences, settings, identity | schema design; staleness |
| **Notes the model writes** (memory tool, a `notes/` directory) | the agent creates, reads, edits files | task progress, long-running work | needs tooling and clean-up |
| **Vector store of memories** | each memory embedded; retrieve top-k by similarity | many small facts; large histories | irrelevant recalls; no structure |
| **Knowledge graph** | entities and relations | relationship-heavy domains | extraction complexity |
| **Provider memory features** | built into the product or API (for example Claude's memory tool, ChatGPT memory) | quick start | less control; check data policies |

A common production design: a **small profile** and **instruction file** always loaded, plus a **searchable store** of episodic memories fetched by relevance.

## The write path: what is worth remembering?

```viz algo=arch title="Memory write and read paths" dir=down
conv   Conversation | turn ends [list] @0,0
ext    Extractor | LLM: what is worth saving? [llm] @1,0
dedupe Dedupe + merge | update or add [filter] @2,0
store  Memory store | facts, episodes, rules [vector] @3,0
q      New request | next session [user] @0,1.6
ret    Retrieve + rank | similarity, recency, importance [search] @1,1.6
ctx    Context builder | inject top memories [prompt] @2,1.6
llm    LLM | answers with memory [llm] @3,1.6
--
conv -> ext
ext -> dedupe
dedupe -> store
q -> ret
store -> ret
ret -> ctx
ctx -> llm
--
flow Write
conv > ext : After a conversation (or every few turns), ask a model: which stable facts, preferences, decisions or lessons appeared?
ext > dedupe : Compare with what is already stored: update a changed fact, merge duplicates, drop trivia.
dedupe > store : Save the memory with text, type, timestamp, importance, source, and an embedding.
flow Read
q > ret : A new message arrives. Embed it and search the store, combining similarity with recency and importance.
ret > ctx : Pick the few best memories (a strict token budget) and format them clearly.
ctx > llm : The model sees "Relevant memories" next to the question and answers with them in mind.
```

Extraction prompt sketch:

```text
From the conversation below, list facts worth remembering for FUTURE conversations:
stable preferences, personal or project facts, decisions, and corrections to your behaviour.
Ignore chit-chat and one-off details. Return JSON: [{"memory": "...", "type": "semantic|episodic|procedural", "importance": 1-5}]
If nothing is worth saving, return [].
```

## The read path: retrieve, rank, inject

Plain similarity retrieves *related* memories but not necessarily *useful* ones. The Generative Agents paper ([Park et al.](https://arxiv.org/abs/2304.03442)) scored memories by a blend of **recency**, **importance** and **relevance**; the same recipe works well today.

:::formula Memory score
\text{score} = w_r \cdot \text{relevance} + w_t \cdot \text{recency} + w_i \cdot \text{importance}
:::

```python run title="A memory store: add, dedupe, retrieve with recency and importance" level=intermediate
import numpy as np, re, zlib, math

DIM = 192
def embed(text):
    v = np.zeros(DIM)
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        for i in range(max(1, len(w) - 2)):
            h = zlib.crc32(w[i:i + 3].encode()); v[h % DIM] += 1 if (h >> 8) & 1 else -1
    n = np.linalg.norm(v); return v / n if n else v

class MemoryStore:
    def __init__(self, half_life_days=30, dup_threshold=0.75):
        self.items, self.half_life, self.dup = [], half_life_days, dup_threshold

    def add(self, text, kind="semantic", importance=3, day=0):
        e = embed(text)
        for it in self.items:                                   # dedupe: update instead of adding near-duplicates
            if float(it["e"] @ e) >= self.dup:
                it.update(text=text, e=e, day=day, importance=max(it["importance"], importance))
                return "updated"
        self.items.append(dict(text=text, e=e, kind=kind, importance=importance, day=day))
        return "added"

    def search(self, query, today, k=3, w=(0.6, 0.25, 0.15)):
        q = embed(query); out = []
        for it in self.items:
            rel = max(0.0, float(it["e"] @ q))
            rec = 0.5 ** ((today - it["day"]) / self.half_life)         # exponential decay
            imp = it["importance"] / 5
            out.append((w[0] * rel + w[1] * rec + w[2] * imp, rel, it["text"]))
        return sorted(out, reverse=True)[:k]

m = MemoryStore()
facts = [("User runs a bakery that sells 120 loaves a day", "semantic", 4, 0),
         ("User prefers answers in metric units", "semantic", 3, 2),
         ("We fixed the payment webhook with idempotency keys", "episodic", 4, 40),
         ("User runs a bakery selling about 150 loaves a day", "semantic", 4, 55),     # near-duplicate: should update
         ("Always show prices in euros", "procedural", 5, 58)]
for text, kind, imp, day in facts:
    print(m.add(text, kind, imp, day), "->", text)
print()
for q in ["how many loaves does the user sell", "what currency should prices use", "how did we fix webhooks"]:
    print(q)
    for score, rel, text in m.search(q, today=60, k=2):
        print(f"   {score:.2f} (rel {rel:.2f})  {text}")
```

## Injecting memory safely

- Put retrieved memories in a **labelled block** after the system prompt: `<memories>` with a note that they may be outdated and must not override the user's current instructions.
- Include **timestamps** so the model can judge staleness.
- Keep it **short**: 3–10 items. More memory is not better memory.
- **Never** let memory content act as instructions from a privileged source. A saved "memory" could have originated in an attacker's document ("memory poisoning"); treat it as data.

## Forgetting is a feature

Memory that only grows becomes noise, cost and risk.

- **Decay** unimportant, untouched memories.
- **Consolidate** many episodes into a summary lesson ("Priya's bakery: expansion discussions in March; decided to hire 3 bakers").
- **Resolve contradictions**: newer facts replace older ones (keep history if you need audit).
- **Let users see, edit and delete** their memories. This is also what privacy law expects.

## Privacy and trust

Remembering people brings obligations:

1. **Consent and transparency**: tell users what is remembered and why; offer an off switch.
2. **Minimise**: do not store sensitive data (health, finance, secrets, credentials) unless necessary; never store passwords or API keys.
3. **Isolate by user/tenant** at the storage layer with access control, not in the prompt.
4. **Right to erasure**: deleting a memory must remove it from the vectors, backups and logs on your retention schedule.
5. **Security**: memory stores are valuable targets and prompt-injection persistence channels.

## Memory with the Claude API

Anthropic offers a **memory tool** (`memory_20250818`): the model reads and writes files in a `/memories` directory that **you** implement and host (view, create, str_replace, insert, delete, rename). The SDK ships helper base classes for implementing the backend. The model decides what to save; you control storage, access and deletion.

```python local title="Declare the memory tool (you implement the file operations)"
response = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=2000,
    tools=[{"type": "memory_20250818", "name": "memory"}],
    messages=[{"role": "user", "content": "Remember that my preferred language is Python."}],
)
# Claude emits tool_use blocks like {"command": "create", "path": "/memories/preferences.md", ...}
# Your handler applies them to storage you control and returns the result.
```

```quiz
? Which memory type stores "how we do things" such as coding conventions?
- Semantic
- Episodic
+ Procedural
> Procedural memory holds rules and skills; it often updates from user corrections.

? Why combine similarity with recency and importance when retrieving memories?
+ The most similar memory is not always the most useful or current one
- To make retrieval slower
- It is required by vector databases
> Blended scoring (as in the Generative Agents paper) surfaces what matters now.

? What should a near-duplicate new memory ("150 loaves") do to an existing one ("120 loaves")?
- Be added alongside it
+ Update or replace it, so the store does not hold contradictory facts
- Be ignored
> Dedupe and resolve contradictions on write.

? Why can stored memories be a security risk?
+ Poisoned content can persist and later be treated as trusted context
- They use too much disk
- Memories are always encrypted
> Treat memory as untrusted data, and let users inspect and delete it.
```

:::keypoints
- Memory types: semantic (facts), episodic (events), procedural (rules and skills).
- Stores: instruction files, profiles, agent-written notes, vector stores, graphs, provider features; combine a small always-on set with a searchable store.
- Write path: extract, dedupe/merge, store with metadata. Read path: retrieve, rank by relevance + recency + importance, inject a few labelled items.
- Forget deliberately: decay, consolidate, resolve contradictions, give users control.
- Privacy and security: consent, minimisation, tenant isolation, erasure, and treat memory as untrusted input.
:::

:::resources
- [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442) — the memory stream, reflection and retrieval-scoring paper.
- [Claude docs: Tool use overview](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview) — see the memory tool section.
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — structured note-taking and agent memory.
- [Lilian Weng: LLM Powered Autonomous Agents](https://lilianweng.github.io/posts/2023-06-23-agent/) — memory types (sensory, short-term, long-term) mapped to LLM systems.
- [Voyager](https://arxiv.org/abs/2305.16291) — an agent that builds a growing library of reusable skills (procedural memory).
- [AGENTS.md](https://agents.md) — the shared convention for project instructions that coding agents read.
:::
