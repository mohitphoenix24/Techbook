---
title: Conversation Memory — Truncate, Summarise, Compact
level: intermediate
time: 45
summary: Keeping long conversations inside the window. Sliding windows, token-budgeted trimming that never splits a tool call from its result, rolling summaries, structured state ("facts so far"), server-side compaction and context editing, and how each choice affects cost and cache hits. Implemented and compared on a simulated 60-turn chat.
---

Every turn resends the whole history (the API is stateless). After enough turns the history is too big to fit, too expensive to pay for, and too noisy to help. **Conversation memory management** decides what the model keeps seeing.

## Your options

| Strategy | How it works | Pros | Cons |
|---|---|---|---|
| **Keep everything** | resend all turns | perfect recall, simplest | cost and latency grow; hits the window; context rot |
| **Sliding window** | keep only the last N turns or tokens | trivial, cheap, bounded | forgets early facts ("my name is…") |
| **Summarise old turns** | replace old turns with a summary | keeps the gist, bounded | summaries lose details and can introduce errors; costs a call |
| **Structured state** | maintain a small JSON of facts, goals, decisions, updated each turn | precise, tiny, easy to inspect | needs good extraction; schema design |
| **Retrieve from history** | embed old turns, fetch relevant ones per query | scales to huge histories | retrieval misses; more machinery |
| **Compaction / context editing** (server-side) | the provider summarises or clears old content automatically | little code | less control; provider-specific |

Most real systems **combine** a few: *last N turns verbatim + a rolling summary of older turns + a structured block of pinned facts*.

## Pitfall: never split tool calls from their results

Message lists have structure. An assistant `tool_use` block must be followed by its matching `tool_result`; trimming one without the other produces an API error or confuses the model. Treat each **tool exchange** as one atomic unit when trimming.

```python run title="Budgeted trimming that keeps units together" level=intermediate
def tokens(msg):                      # rough: 1 token per 4 characters
    return max(1, len(str(msg["content"])) // 4)

def group_units(messages):
    """Group messages into atomic units: a plain turn, or an assistant tool_use plus the tool_result that answers it."""
    units, i = [], 0
    while i < len(messages):
        m = messages[i]
        if m.get("kind") == "tool_use" and i + 1 < len(messages) and messages[i + 1].get("kind") == "tool_result":
            units.append([m, messages[i + 1]]); i += 2
        else:
            units.append([m]); i += 1
    return units

def trim_to_budget(messages, budget, keep_first=1):
    """Keep the first N units (the goal), then as many of the most recent units as fit."""
    units = group_units(messages)
    head, tail = units[:keep_first], units[keep_first:]
    used = sum(tokens(m) for u in head for m in u)
    kept = []
    for u in reversed(tail):                                   # walk from newest to oldest
        cost = sum(tokens(m) for m in u)
        if used + cost > budget: break
        kept.insert(0, u); used += cost
    dropped = len(tail) - len(kept)
    return [m for u in head + kept for m in u], dropped, used

history = [
    {"role": "user", "content": "Goal: migrate our billing to Stripe. " * 3},
    {"role": "assistant", "kind": "tool_use", "content": "search_docs(query='stripe migration')"},
    {"role": "user", "kind": "tool_result", "content": "result: " + "long documentation text " * 40},
    {"role": "user", "content": "Ok, what about webhooks?"},
    {"role": "assistant", "content": "Use signed webhooks and idempotent handlers. " * 4},
    {"role": "user", "content": "And refunds?"},
]
trimmed, dropped, used = trim_to_budget(history, budget=150)
print(f"kept {len(trimmed)} of {len(history)} messages, dropped {dropped} unit(s), ~{used} tokens")
for m in trimmed:
    print(f"  {m['role']:9} {m.get('kind', 'text'):11} {str(m['content'])[:50]}")
```

## Rolling summary

Keep the **last few turns verbatim** and fold everything older into a running summary that is updated when the window fills. Write the summarisation prompt carefully: preserve **names, numbers, decisions, open tasks, constraints and user preferences**; drop pleasantries and dead ends.

```python run title="A rolling summary memory (with a stand-in summariser)" level=intermediate
class RollingMemory:
    def __init__(self, summarize, max_recent_tokens=120, keep_recent_turns=4):
        self.summarize, self.max_tokens, self.keep = summarize, max_recent_tokens, keep_recent_turns
        self.summary, self.recent = "", []

    def add(self, role, text):
        self.recent.append((role, text))
        if sum(len(t) // 4 for _, t in self.recent) > self.max_tokens and len(self.recent) > self.keep:
            old, self.recent = self.recent[:-self.keep], self.recent[-self.keep:]
            self.summary = self.summarize(self.summary, old)               # a model call in real life

    def render(self):
        parts = []
        if self.summary: parts.append(f"<summary_of_earlier_conversation>\n{self.summary}\n</summary_of_earlier_conversation>")
        parts += [f"{r}: {t}" for r, t in self.recent]
        return "\n".join(parts)

def fake_summarize(prev, old_turns):
    """Stand-in: keeps lines that mention numbers or names. Real systems prompt an LLM here."""
    keep = [t for _, t in old_turns if any(c.isdigit() for c in t) or "my name" in t.lower()]
    return (prev + " " + " | ".join(keep)).strip()

mem = RollingMemory(fake_summarize)
script = [("user", "Hi, my name is Priya and I run a bakery."), ("assistant", "Nice to meet you, Priya!"),
          ("user", "I sell 120 loaves a day at $4 each."), ("assistant", "That is about $480 per day."),
          ("user", "What should I think about for a second shop?"), ("assistant", "Location, staffing, and margins. " * 5),
          ("user", "Staffing: I would need 3 bakers."), ("assistant", "Budget 3 salaries plus a manager. " * 3),
          ("user", "And what was my daily revenue again?")]
for role, text in script:
    mem.add(role, text)
print(mem.render())
```

The weakness is visible: summaries lose detail, so facts the user may ask about later (here the daily revenue) should be **pinned** in structured state rather than trusted to a summary.

## Structured state: the "facts so far" block

For task-oriented chats and agents, maintain a compact object the model reads every turn and updates through a tool or structured output:

```json
{
  "user": {"name": "Priya", "business": "bakery"},
  "facts": {"loaves_per_day": 120, "price_usd": 4},
  "goal": "evaluate opening a second shop",
  "decisions": ["needs 3 bakers"],
  "open_questions": ["location"]
}
```

Advantages: **precise** (no paraphrase drift), **tiny**, **auditable** (you can show it to the user, or let them edit it), and **cacheable if append-only**.

## Cost and caching interplay

Prompt caching matches **prefixes**. A pure append-only history caches beautifully: each turn reuses the previous turns' cache. But:

- **Sliding windows rewrite the start** of the prompt every turn, so the cache never hits.
- **Rewriting the summary** every turn changes the prefix.

Two practical patterns:

1. **Compact in big steps** rather than every turn: let history grow append-only (cache hits) until you cross a threshold (say 60% of the window), then compact once, accept one cache miss, and carry on.
2. **Keep the stable prefix stable**: put the summary right after the system prompt but only change it at compaction events.

```python run title="Cache-aware compaction: per-turn trimming vs threshold compaction" level=advanced
def simulate(strategy, turns=60, tokens_per_turn=300, window=12_000, system=2_000):
    cached_prev, total_fresh, total_cached = 0, 0, 0
    history = 0
    for t in range(turns):
        history += tokens_per_turn
        if strategy == "sliding" and history > 4_000:
            history = 4_000                                  # trim every turn: the prefix changes -> no cache reuse
            prefix_stable = 0
        elif strategy == "threshold" and system + history > 0.6 * window:
            history = 1_500                                  # compact once into a summary; cache restarts
            prefix_stable = 0
        else:
            prefix_stable = cached_prev                      # append-only: previous prompt is a valid prefix
        prompt = system + history
        cached = min(prefix_stable, prompt)
        total_cached += cached; total_fresh += prompt - cached
        cached_prev = prompt
    cost = (total_fresh * 1.0 + total_cached * 0.1) / 1e6 * 2.0       # $2/M input, cached at 10%
    return total_fresh, total_cached, cost

for s in ("sliding", "threshold"):
    fresh, cached, cost = simulate(s)
    print(f"{s:10} fresh input {fresh:>9,}  cached {cached:>9,}  input cost ${cost:.3f}")
```

The "obvious" strategy (trim each turn) can cost several times more than doing less, less often.

## Server-side options

Providers now offer help: **compaction** (the server summarises earlier context when a threshold is reached, and you pass the returned compaction block back on later turns) and **context editing** (automatically clearing old tool results or thinking blocks). They save code, but know their semantics: you must preserve any compaction blocks returned, and you give up some control over what is kept. For critical facts, still pin them in structured state.

## Choosing a strategy

| Situation | Suggested approach |
|---|---|
| Short chats (< 20 turns) | keep everything |
| Customer-support or companion chat | recent turns + pinned profile/facts + rolling summary |
| Task-oriented agent | structured state + notes file + clear old tool results |
| Very long, searchable history (months) | store turns, retrieve relevant ones (long-term memory lesson) |
| Cost-sensitive at scale | append-only + threshold compaction + caching |

```quiz
? Why must you not drop only the tool_result from a tool exchange?
- It saves tokens
+ A tool_use must be followed by its result; splitting them breaks the message structure and confuses the model
- Tool results are never needed
> Treat a tool call and its result as one atomic unit when trimming.

? Why is a fresh summary risky for exact facts?
- Summaries are always wrong
+ Summaries paraphrase and lose details, so exact numbers and constraints should be pinned in structured state
- They cost nothing
> Use structured state for facts that must survive verbatim.

? Why can trimming the history every turn raise your bill?
- It adds tokens
+ It changes the prompt prefix each turn, so the provider's cache never hits
- It slows the network
> Append-only history caches well; compact in rare, large steps.

? What does a structured state block give you over a prose summary?
+ Precision, small size and inspectability
- Longer context
- Automatic safety
> Facts stay exact, and you can show or edit them.
```

:::keypoints
- Options: keep all, sliding window, summarise, structured state, retrieve, server-side compaction; real systems combine them.
- Trim by atomic units: never separate a tool call from its result.
- Rolling summaries lose details: pin critical facts in a structured state block.
- Append-only history is cache-friendly: compact in infrequent big steps, not every turn.
- Test long conversations in evals; log what was kept, summarised and dropped.
:::

:::resources
- [Claude docs: Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) — why prefix stability matters.
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — compaction and note-taking.
- [LangGraph docs](https://langchain-ai.github.io/langgraph/) — state and memory in graph-based agents.
- [Generative Agents (Park et al.)](https://arxiv.org/abs/2304.03442) — a memory stream with reflection and retrieval.
- [Chip Huyen: Agents](https://huyenchip.com/2025/01/07/agents.html) — memory systems in agents.
:::
