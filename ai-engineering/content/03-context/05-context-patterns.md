---
title: Context Patterns for Agents
level: advanced
time: 45
summary: The concrete techniques long-running agents use to stay sharp: scratchpads and notes outside the window, just-in-time retrieval, clearing stale tool results, compaction at thresholds, sub-agent isolation with condensed returns, progressive disclosure of instructions (skills), and tool-output design. Includes a simulation of context growth with and without these patterns.
---

A one-shot chatbot has a small, simple context. An **agent** loops: think, call a tool, read the result, think again, for tens or hundreds of steps. Each step adds tokens. Left alone, the context balloons, the cost per step explodes (every step resends everything), and quality drops. These patterns keep agents effective over long horizons.

## See the problem

Tool outputs dominate agent contexts. Here is a simulation of a 40-step research agent where each step adds a reasoning note and a tool result of varying size:

```python run title="Context growth in an agent loop, with and without management" level=intermediate
import random

def simulate(policy, steps=40, seed=7, system=3_000):
    rng = random.Random(seed)
    context = []                                   # each entry: [kind, tokens, step]
    total_input_tokens = 0                         # what you PAY for: the whole context resent at every step
    peak = 0
    for step in range(1, steps + 1):
        total_input_tokens += system + sum(t for _, t, _ in context)
        peak = max(peak, system + sum(t for _, t, _ in context))
        context.append(["thought", 150, step])
        context.append(["tool_result", rng.choice([300, 800, 2_500, 6_000, 12_000]), step])
        if policy == "clear_old_results":
            for item in context:                   # keep only the 3 newest tool results in full; stale ones become a stub
                if item[0] == "tool_result" and item[2] < step - 2 and item[1] > 40:
                    item[1] = 40
        if policy == "compact":
            if system + sum(t for _, t, _ in context) > 40_000:   # threshold compaction into a summary
                context = [["summary", 1_500, step]]
    final = system + sum(t for _, t, _ in context)
    return peak, final, total_input_tokens

for policy in ("none", "clear_old_results", "compact"):
    peak, final, paid = simulate(policy)
    print(f"{policy:18} peak context {peak:>8,}   final {final:>7,}   total input tokens billed {paid:>10,}")
```

Without management, the bill is a quadratic-looking pile of repeated tokens. Even crude clearing or compaction cuts it by multiples, and keeps the model working in a clean window.

## Pattern 1: Notes outside the window (write)

Give the agent a place to **write down what matters**, then trim the window freely.

- A **scratchpad / plan file**: goals, a checklist, what is done, what is next.
- A **notes file** for findings: key facts, file locations, decisions and why.
- **Structured progress files** for very long tasks: a test status list, a `progress.md` that a fresh context can read to resume.

The agent re-reads its notes after a reset or compaction and continues as if nothing happened. This is also how **work spanning multiple context windows** is done: each window starts by reading the notes and ends by updating them.

```python run title="A plan-and-notes scratchpad the agent edits through tools" level=intermediate
class Scratchpad:
    def __init__(self):
        self.plan, self.notes = [], []
    def set_plan(self, steps):                 # tool: set_plan
        self.plan = [{"step": s, "done": False} for s in steps]
    def complete(self, i, note=""):            # tool: complete_step
        self.plan[i]["done"] = True
        if note: self.notes.append(note)
    def render(self):                          # injected into the context every turn (small!)
        lines = ["## Plan"] + [f"- [{'x' if p['done'] else ' '}] {p['step']}" for p in self.plan]
        lines += ["## Notes"] + [f"- {n}" for n in self.notes[-8:]]
        return "\n".join(lines)

pad = Scratchpad()
pad.set_plan(["find the failing test", "locate the bug", "write the fix", "run the full suite"])
pad.complete(0, "test_invoice_total fails: expected 118.00, got 108.00")
pad.complete(1, "bug in tax.py:42 (rate applied to net, should apply to gross)")
print(pad.render())
```

## Pattern 2: Just-in-time context (select)

Instead of preloading everything that might be relevant, give the agent **lightweight handles** (file paths, ids, URLs, search tools) and let it **load details on demand**.

- Return `{"path": "src/tax.py", "lines": 210}` and a `read_file(path, start, end)` tool, not the full file.
- Let it run `grep`, `glob`, `head`/`tail`, or targeted queries, the way a developer explores a codebase.
- Folder structure, names and timestamps are free signals the agent can use.

**Progressive disclosure**: the model discovers context layer by layer, holding only what it needs. The trade-off is more tool calls and slower exploration, so a **hybrid** (a few key files preloaded, the rest by search) is common.

## Pattern 3: Clear stale tool results (compress)

Once a tool result has been used, its raw payload rarely needs to remain. Replace it with a short stub, or remove it, keeping the **tool call** (so the model remembers it searched) and a **one-line outcome**. Providers offer automatic **context editing** for this; you can also do it yourself.

```python run title="Replace old tool results with stubs, keep the structure" level=intermediate
def clear_old_results(messages, keep_last=2, min_size=200):
    """Messages are dicts with role/kind/content. Keep the newest `keep_last` tool results verbatim."""
    idx = [i for i, m in enumerate(messages) if m.get("kind") == "tool_result"]
    for i in idx[:-keep_last] if keep_last else idx:
        m = messages[i]
        if len(m["content"]) > min_size:
            m["content"] = f"[cleared: {len(m['content'])} chars. Re-run the tool if you need this again.]"
    return messages

msgs = []
for n in range(5):
    msgs.append({"role": "assistant", "kind": "tool_use", "content": f"read_file('src/mod{n}.py')"})
    msgs.append({"role": "user", "kind": "tool_result", "content": "def f(): pass\n" * 60})
clear_old_results(msgs, keep_last=2)
for m in msgs:
    print(f"{m['kind']:12} {m['content'][:60].replace(chr(10), ' ')!r}")
```

The agent can still see that it read those files and can re-read if needed, but it no longer pays for 5 full files at every step.

## Pattern 4: Compaction at thresholds (compress)

When the window nears a limit, summarise the whole conversation into a compact "state of the world" and **restart the context from that summary**. Quality depends on the summary prompt: preserve architectural decisions, unresolved issues, the current plan and key identifiers; discard redundant output. Start with high recall (keep too much), then trim. Tune on traces of real long runs.

## Pattern 5: Sub-agents with clean contexts (isolate)

A parent agent delegates a focused subtask ("find every place the old API is called") to a **sub-agent** that works in its own fresh window, possibly using tens of thousands of tokens. It returns a **condensed result** (a list of file paths and a short explanation, typically 1–2K tokens). The parent never sees the exploration.

```viz algo=arch title="Sub-agents isolate context" dir=down
parent Lead agent | plan, synthesise [agent] @1,0
sa1    Sub-agent A | explores topic 1 [agent] @0,1.5
sa2    Sub-agent B | explores topic 2 [agent] @1,1.5
sa3    Sub-agent C | explores topic 3 [agent] @2,1.5
web    Tools | search, read, code [tool] @1,3
--
parent -> sa1 : task + goal
parent -> sa2 : task + goal
parent -> sa3 : task + goal
sa1 -> web
sa2 -> web
sa3 -> web
--
flow Delegation
parent > sa2 : The lead agent hands a self-contained subtask to a sub-agent with its own clean context window.
sa2 > web : The sub-agent searches and reads widely (tens of thousands of tokens of raw material).
web > sa2 : Raw tool results fill the sub-agent's window, not the lead's.
sa2 > parent : Only a short, structured findings summary returns, so the lead's context stays small.
```

Benefits: parallelism, focus, and clean parent context. Costs: more total tokens (multi-agent systems commonly use several times the tokens of a single chat), coordination complexity, and the risk that important detail is lost in the summary. Use for **breadth-first, parallelisable** work (research, codebase exploration), not for tightly coupled tasks. Module 5 returns to this.

## Pattern 6: Progressive disclosure of instructions (skills)

Rather than stuffing every procedure into the system prompt, keep **short descriptions** of capabilities in context and load the **full instructions only when relevant**. Anthropic's *Agent Skills* use this: each skill is a folder with a `SKILL.md`; only its name and description sit in the prompt, and the agent reads the rest when the task matches. The same idea works for tool catalogues (**tool search**: expose a search tool and load tool definitions on demand).

## Pattern 7: Shape tool outputs

Many "context problems" are tool-design problems.

- **Paginate** and **cap** outputs; return `"showing 20 of 340, call again with page=2"`.
- **Filter server-side**: return the matching rows, not the whole table.
- **Summarise** noisy outputs (logs, HTML) into the parts that matter before returning.
- Prefer **human-readable identifiers** over opaque ids; return **only the fields needed**.
- Offer a **`response_format` parameter** (concise vs detailed) so the agent chooses.
- Make errors **actionable** in a sentence.

## Putting it together

:::flow A well-managed agent turn
Re-read notes | plan and progress file (small)
Think | decide the next step
Act | tool call with targeted arguments
Observe | capped, filtered result
Update notes | record the outcome in a line
Prune | clear stale results; compact if over threshold
:::

```quiz
? What is the main purpose of an agent's scratchpad or notes file?
- To make the prompt longer
+ To keep plans and findings outside the window so the context can be trimmed without losing progress
- To store the API key
> Written notes survive clearing and compaction and let a fresh context resume.

? Why does a sub-agent return a short summary to its parent?
+ So the parent's context is not filled by the sub-agent's raw exploration
- Because summaries are always accurate
- To save the sub-agent's tokens
> This is context isolation: details stay in the child.

? What does "just-in-time context" mean?
- Loading everything up front
+ Giving the agent handles (paths, ids, search tools) and letting it load details when needed
- Caching prompts
> Progressive discovery keeps the window small.

? Which is a good fix when a tool returns 12,000-token results the agent barely uses?
+ Paginate, filter and cap the output, and clear it after use
- Increase the context window
- Use a longer system prompt
> Shape tool outputs and clear stale results.
```

:::problem Design the context management for a coding agent that works for two hours on a large repository. {level=hard tags="agents,context,design"}
List the mechanisms and what each protects against.

:::solution Model answer
(1) **Instruction file** (`AGENTS.md`/`CLAUDE.md`) loaded at start: stable conventions, commands, architecture (procedural memory; cache it). (2) **Just-in-time exploration**: `glob`/`grep`/`read_file(range)`, never dump whole directories. (3) A **plan/progress file** the agent updates (done, next, failing tests) so any fresh window can resume. (4) **Tool-output caps** and filtering (test output trimmed to failures). (5) **Clearing stale tool results** after use, keeping calls and one-line outcomes. (6) **Threshold compaction** with a prompt that preserves decisions, open bugs, file/line references. (7) **Sub-agents** for broad searches or reviews, returning condensed findings. (8) **Cache-friendly layout** (static prefix; compact rarely). (9) Evals on long traces: success rate, tokens per task, regressions after compaction.
:::
:::

:::keypoints
- Agent contexts grow every step and are resent each time: manage them or pay quadratically and lose quality.
- Patterns: notes outside the window, just-in-time retrieval, clearing stale tool results, threshold compaction, sub-agent isolation, progressive disclosure (skills, tool search), shaped tool outputs.
- Keep plans and findings in files so work survives resets across windows.
- Sub-agents buy focus and parallelism at the cost of more total tokens and summary loss.
- Evaluate on long runs, not just short ones.
:::

:::resources
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — compaction, structured notes and sub-agent architectures.
- [Anthropic: Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — token-efficient tool responses.
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — isolation and its costs.
- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) — loading tools and processing data in code to save context.
- [Claude docs: Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) — progressive disclosure of instructions.
- [Claude Code docs](https://docs.claude.com/en/docs/claude-code/overview) — a working example of memory files, sub-agents and compaction.
:::
