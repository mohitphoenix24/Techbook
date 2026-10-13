---
title: Context Engineering — Designing What the Model Sees
level: intermediate
time: 45
summary: The discipline that replaced "prompt engineering" for serious systems. The model can only use what is in its context window, so your job is to assemble the right information, in the right order, within a budget. The anatomy of a context, the four ways it goes wrong, the four strategies (write, select, compress, isolate), and a budgeted context assembler.
---

Prompt engineering asks, "How should I word this instruction?" **Context engineering** asks the bigger question: **"What is the smallest, most useful set of information I can put in front of the model at this moment?"**

:::def Context engineering
The practice of deciding what goes into the model's context window on each call (instructions, tools, retrieved knowledge, memory, conversation, tool results, examples), in what **form**, in what **order**, and what to **leave out or remove**, so the model has what it needs and nothing that misleads or distracts it.
:::

:::analogy
The context window is the model's **desk**. Whatever is on the desk is what it can work with. A tidy desk with the right three documents beats a desk buried under two hundred. It also cannot see the filing cabinet unless you fetch a folder and put it on the desk. Context engineering is the assistant who prepares the desk before each task.
:::

## Why this became the central skill

- Models are good enough that **failures are mostly context failures**: missing information, wrong information, too much information, or confusing information.
- Agents run **many steps**, so the context grows with every tool call and result. Without management, they drown in their own history.
- Window size is not the answer. Bigger windows cost more, slow down, and models use long contexts unevenly (information in the middle is used less reliably, [paper](https://arxiv.org/abs/2307.03172)). Practitioners also talk about **context rot**: as the window fills with low-value tokens, accuracy on what matters drops.

## The anatomy of a context

```viz algo=arch title="What competes for space in the window" dir=down
sys    System prompt | role, rules, style [prompt] @0,0
tools  Tool definitions | names, schemas [tool] @1,0
ex     Examples | few-shot [docs] @2,0
mem    Memory | profile, past facts [vector] @0,1.4
rag    Retrieved knowledge | documents, search [search] @1,1.4
hist   Conversation | turns so far [list] @2,1.4
tr     Tool results | outputs of earlier calls [tool] @1,2.8
win    Context window | a fixed budget [llm] @3,1.4
--
sys -> win
tools -> win
ex -> win
mem -> win
rag -> win
hist -> win
tr -> win
```

| Component | Lifetime | Typical problem |
|---|---|---|
| System prompt, tools, examples | static | too long, vague, or contradictory |
| Long-term memory | across sessions | stale or irrelevant facts injected |
| Retrieved knowledge | per request | too many chunks, wrong chunks |
| Conversation history | grows | old turns crowd out useful content |
| Tool results | grows fast | huge raw payloads (whole web pages, large JSON, logs) |

## Four ways context goes wrong

| Failure | What happens | Example |
|---|---|---|
| **Poisoning** | An error or hallucination enters the context and is treated as fact in later steps | The agent "remembers" a wrong API name it invented |
| **Distraction** | The model over-focuses on accumulated context instead of the task | A long history makes it repeat past actions |
| **Confusion** | Irrelevant material (such as 40 tool definitions or unrelated documents) pulls the answer off course | The wrong tool is chosen because many look similar |
| **Clash** | Parts of the context contradict each other | An old instruction says one thing, a newer message another |

Each has a cure in the strategies below.

## Four strategies: write, select, compress, isolate

:::flow Context engineering toolbox
Write | save information OUTSIDE the window (notes, files, memory) so it survives and can be reloaded
Select | pull in only what is relevant now (retrieval, tool search, memory lookup)
Compress | shrink what is already there (summarise, clear old tool results, trim)
Isolate | split work across separate contexts (sub-agents) so each stays focused
:::

1. **Write**: a scratchpad or notes file holds the plan and key facts; long-term memory persists across sessions.
2. **Select**: RAG is *selection*. So is choosing only the relevant tools, or the few memories that matter for this request.
3. **Compress**: summarise old turns, drop stale tool outputs, replace big objects by references (ids, file paths, summaries).
4. **Isolate**: a sub-agent explores in its own window and returns a **short result**, keeping the parent clean. A typed schema between parts is also a form of isolation.

The next lessons implement each of these.

## Build a budgeted context assembler

A practical pattern: represent each context item with a **priority**, a **token cost**, and whether it is **required**; then fill the window greedily, always including required items, preferring higher priority per token.

```python run title="Assemble context under a token budget" level=intermediate
from dataclasses import dataclass

@dataclass
class Item:
    name: str
    tokens: int
    priority: float          # higher = more important
    required: bool = False

def assemble(items, budget):
    chosen = [i for i in items if i.required]
    used = sum(i.tokens for i in chosen)
    if used > budget:
        raise ValueError(f"required items alone ({used}) exceed the budget ({budget})")
    optional = sorted((i for i in items if not i.required), key=lambda i: i.priority / i.tokens, reverse=True)
    skipped = []
    for item in optional:
        if used + item.tokens <= budget:
            chosen.append(item); used += item.tokens
        else:
            skipped.append(item)
    return chosen, skipped, used

items = [
    Item("system prompt", 800, 10, required=True),
    Item("user question", 120, 10, required=True),
    Item("tool defs (12 tools)", 2400, 6),
    Item("chunk: refund policy", 700, 9),
    Item("chunk: shipping policy", 650, 4),
    Item("chunk: old FAQ", 900, 1),
    Item("last 6 turns", 1500, 8),
    Item("turns 7-30 (summary)", 400, 5),
    Item("user profile memory", 200, 7),
]
chosen, skipped, used = assemble(items, budget=5_000)
print(f"budget 5,000 -> used {used:,}")
print("in  :", [i.name for i in chosen])
print("out :", [i.name for i in skipped])
```

Two lessons from even this toy: be explicit about what is **required**, and treat the context as a **portfolio** where each item must earn its tokens. Log what you included on each call, because "what did the model see?" is the first debugging question.

## Principles that hold up

1. **Smallest high-signal set.** Include what the model needs to do the task, not everything that might be relevant.
2. **Put instructions where they are used.** Rules that matter for a tool belong in that tool's description.
3. **Structure and label.** Use headings or XML-style tags for each source, with ids and titles, so the model (and you, debugging) can tell sources apart and cite them.
4. **Order for attention.** Static first (cacheable), long documents next, the question and key reminders last.
5. **Prefer references to payloads.** Return a file path or id and let the model fetch details on demand ("just-in-time" context), rather than pasting the whole object.
6. **Make removal a first-class operation.** Old tool results and abandoned approaches should be cleared or summarised.
7. **Test with realistic contexts.** A prompt that works on an empty history may fail when the window is 70% full.
8. **Measure.** Track tokens per component, and run evals at typical and worst-case context sizes.

## The model does not know what you left out

Missing context produces confident wrong answers, not errors. Make the assembler **tell the model what is missing** ("No policy documents were found for this question"), and give it a tool or a rule to ask for more.

```quiz
? What is the best description of context engineering?
- Writing longer prompts
+ Deciding what information goes into the model's window, in what form and order, and what to remove, under a budget
- Choosing the biggest model
> It is the system around the prompt: retrieval, memory, history management and tool outputs.

? Which failure is caused by an early hallucination being treated as fact later?
- Distraction
+ Poisoning
- Clash
> Errors that enter the context persist and compound.

? Which strategy does a sub-agent that returns a short summary represent?
- Select
+ Isolate
- Write
> It does the messy exploration in its own window and keeps the parent context clean.

? Why prefer returning a file path or id from a tool over the full content?
+ The model can fetch details on demand, keeping the window small
- Paths are more accurate
- It avoids permissions
> Just-in-time context keeps tokens for what matters.
```

:::problem Your support agent works in short chats but gets confused and repetitive after 40 turns. Diagnose and fix. {level=medium tags="context,agents"}
Give a likely cause and at least three changes.

:::solution Model answer
Likely **context rot / distraction**: the window is full of stale turns and long tool outputs, so the system prompt and the current goal are diluted, and the model imitates earlier patterns. Fixes: **clear or truncate old tool results** (keep a one-line summary); **summarise older turns** into a rolling summary while keeping the last few verbatim; keep key facts in a **structured notes/state block** re-injected each turn; put critical rules **near the end** again; **retrieve** policies on demand instead of keeping them all; cap **tool output size**; add an eval that runs 40+ turn conversations.
:::
:::

:::keypoints
- Context engineering = choosing what is in the window, its form and order, and what to remove, under a budget.
- Failures: poisoning, distraction, confusion, clash; larger windows do not remove them (context rot).
- Strategies: write (save outside), select (retrieve), compress (shrink), isolate (split across contexts).
- Treat context as a budgeted portfolio with required and optional items; label sources; log what the model saw.
- Prefer references and just-in-time retrieval to dumping payloads.
:::

:::resources
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — the reference piece for this lesson.
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) — how position affects use of long context.
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — context isolation in practice.
- [Lilian Weng: LLM Powered Autonomous Agents](https://lilianweng.github.io/posts/2023-06-23-agent/) — memory and planning components.
- [Claude docs: Context windows and editing](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview) — see the sections on long-context prompting.
- [Chip Huyen: Agents](https://huyenchip.com/2025/01/07/agents.html) — memory and context in agent design.
:::
