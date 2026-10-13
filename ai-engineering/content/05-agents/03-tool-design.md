---
title: Designing Tools Agents Can Actually Use
level: advanced
time: 50
summary: Tools are the agent's interface to the world, and they deserve the care you would give a UI. Choosing what to build (not just wrapping your API), naming and describing tools, parameters that prevent mistakes, token-efficient responses, actionable errors, consolidation, evaluating tools with realistic tasks, and a runnable linter that scores tool definitions.
---

An agent is only as good as its tools. A human developer gets an IDE, documentation and years of intuition; a model gets **a name, a description and a schema**. Designing tools for models is closer to **UX design** than to API design, and the stakes are high: a confusing tool wastes tokens, causes wrong calls, and makes the whole agent look unintelligent.

:::def Agent–computer interface (ACI)
The set of tools, their descriptions and their outputs through which an agent perceives and acts on its environment. Like a human–computer interface, it deserves iteration and testing. Anthropic's SWE-bench agent work found that improving the interface (for example requiring absolute file paths) improved results more than prompt tweaks.
:::

## Principle 1: build the right tools, not a wrapper per endpoint

The temptation is to expose every API endpoint as a tool. But agents have **limited context** and **different strengths** than programs. A human does not read every contact in the address book to find a person; they search. A tool that returns all 10,000 records forces the agent to burn tokens reading them.

| Instead of… | Offer… |
|---|---|
| `list_users`, `list_events`, `create_event` separately | `schedule_event(attendees, time_range)` that finds availability **and** books |
| `get_customer`, `get_orders`, `get_tickets` (3 calls) | `get_customer_context(customer_id)` returning the relevant summary in one call |
| `read_logs()` returning 100K lines | `search_logs(query, since, limit)` returning matching lines with context |
| low-level DB access | a few **task-shaped** queries (and a read-only SQL tool with limits if needed) |

Rule of thumb: **tools should match the tasks the agent performs, not your internal architecture.** Fewer, richer tools usually beat many thin ones; but do not merge unrelated actions into one tool with a mode flag.

## Principle 2: names and namespacing

- **Verb-first, specific names**: `search_orders`, `create_ticket`, `get_weather`. Avoid vague names (`handle`, `process`, `data`).
- **Prefix by service or resource** when the tool list is large (`asana_search`, `jira_search`), so the model can pick the right family.
- Names are part of the prompt: read the full tool list aloud and check that no two sound alike.

## Principle 3: descriptions are prompts

Write a tool's description as if explaining it to a **new colleague**: what it does, **when to use it and when not to**, what each parameter means (formats, units, examples), what it returns, and limits.

❌ Weak:

```json
{"name": "search", "description": "Searches things.", "input_schema": {"properties": {"q": {"type": "string"}}}}
```

✅ Strong:

```json
{
  "name": "search_orders",
  "description": "Search a customer's orders. Use this when the user asks about the status, contents or delivery of an order. Do NOT use it for refunds (use issue_refund) or for product questions (use search_docs). Returns at most 10 orders, newest first, each with id, status, total and delivery date.",
  "input_schema": {
    "type": "object",
    "properties": {
      "customer_id": {"type": "string", "description": "Customer id like 'C-1042'. Required."},
      "status": {"type": "string", "enum": ["processing", "shipped", "delivered", "cancelled"], "description": "Optional filter."},
      "since": {"type": "string", "description": "Only orders created on/after this date, ISO format YYYY-MM-DD."}
    },
    "required": ["customer_id"],
    "additionalProperties": false
  }
}
```

Techniques: **use enums** instead of free text; **specify formats** with examples; **say which parameter is required and what default applies**; **make arguments unambiguous** (`user_id` not `user`); add **`strict`** schema enforcement where supported.

## Principle 4: make mistakes hard (poka-yoke)

Design arguments so the wrong call is impossible or obvious.

- **Absolute paths only** instead of relative paths that depend on a working directory the model may lose track of.
- **IDs vs names**: models often confuse opaque ids; return human-readable names *with* ids, and accept the identifier the agent actually has.
- **Idempotent actions** with an idempotency key, so retries are safe.
- **Dry-run mode** for destructive tools (`preview=true` shows what would change).
- **Confirmation tokens** for irreversible actions.

## Principle 5: return the right amount, in the right form

Tool output **goes into the context window**. Size and shape matter.

- **Return what is needed for the next decision**, not the whole record. Prefer semantic fields (`name`, `status`, `file_name`) over cryptic low-level ones (`uuid`, `mime_type`, `256px_image_url`).
- **Pagination, filtering and truncation with sensible defaults** (for example 20 results, `next_page_token`), and say so in the output: `"showing 20 of 340 results; refine the query or request page 2"`.
- A **`response_format` parameter** (`"concise"` vs `"detailed"`) lets the agent choose.
- **Prefer natural-language-friendly formats**: compact JSON or Markdown tables. Avoid huge nested objects and base64 blobs.
- **Truncate long text** with an indicator and a way to fetch more (`read_file(path, start_line, end_line)`).

```python run title="Same information, very different token cost" level=easy
import json

record = {"uuid": "9f0c4b1e-1b9d-4c2e-8a7f-0d2f5e6a1c33", "created_at_epoch_ms": 1759651200000, "mime_type": "application/json",
          "metadata": {"schema_version": 7, "shard": "eu-west-3b", "etag": "W/\"a1b2c3d4\""},
          "name": "Acme renewal", "status": "open", "owner": {"id": 4411, "display_name": "Dana Ortiz"}, "amount_cents": 1250000}

concise = {"name": record["name"], "status": record["status"], "owner": record["owner"]["display_name"], "amount": "$12,500"}

tokens = lambda s: len(s) // 4
full, small = json.dumps(record), json.dumps(concise)
print(f"full record : ~{tokens(full)} tokens\nconcise     : ~{tokens(small)} tokens")
print("\nconcise ->", small)

# a list tool: always bound the output
rows = [f"row {i}: customer {i} ..." for i in range(340)]
page = rows[:20]
print(f"\nshowing {len(page)} of {len(rows)} results; ask for page 2 or refine the query")
```

## Principle 6: errors that teach

An error is the agent's feedback signal. **Make it actionable.**

| ❌ Unhelpful | ✅ Helpful |
|---|---|
| `Error 422` | `Invalid date '12/31/26'. Use ISO format YYYY-MM-DD, for example 2026-12-31.` |
| `Not found` | `No order 'A-1000'. Order ids look like 'A-1042'. Use search_orders with the customer id to find it.` |
| stack trace | a one-line cause + the suggested next step |
| `Permission denied` | `You can only access orders for the signed-in customer (C-1042).` |

Never leak secrets or internals in errors, and distinguish **retryable** (rate limit, timeout) from **non-retryable** (bad input) errors.

## Principle 7: keep the tool set small and distinct

Every tool definition costs tokens on **every request** and competes for the model's attention. Symptoms of too many tools: wrong tool selection, ignored tools, long prompts. Remedies: **merge overlapping tools**, remove rarely used ones, **load tools on demand** (tool search / progressive disclosure), or **route** to sub-agents each with a focused toolset. Test with the full list, not one tool at a time.

## Principle 8: iterate with evaluations

Treat tools as products and **measure** them:

1. Write **realistic multi-step tasks** that require your tools (not toy single calls): "Find the customer who bought X last month and check if their warranty is valid."
2. Give each task a **verifiable outcome** (the right ids, the right final state).
3. Run the agent; collect **transcripts and metrics**: success rate, number of calls, tokens, errors, wrong-tool choices.
4. **Read the transcripts.** Look for confusion: redundant calls (pagination issues), invalid-parameter errors (descriptions unclear), tools never used (not discoverable), tools overused (too tempting).
5. Change **one thing** (a description, a name, an output format), rerun, compare. You can even have a model analyse transcripts and propose tool-description fixes, then re-evaluate.

## A linter for tool definitions

Catching the basics automatically keeps a team consistent:

```python run title="Lint a tool definition" level=intermediate
import re

def lint_tool(tool):
    issues = []
    name, desc, schema = tool.get("name", ""), tool.get("description", ""), tool.get("input_schema", {})
    props = schema.get("properties", {})
    if not re.fullmatch(r"[a-z][a-z0-9]*(_[a-z0-9]+)+", name):
        issues.append(f"name '{name}' should be verb_noun in snake_case (e.g. search_orders)")
    if len(desc.split()) < 15:
        issues.append("description is too short: say what it does, when to use it, and what it returns")
    if not re.search(r"\b(use|when|if)\b", desc, re.I):
        issues.append("description never says WHEN to use the tool")
    if not re.search(r"\b(return|returns|result)\b", desc, re.I):
        issues.append("description does not say what the tool returns")
    if schema.get("additionalProperties") is not False:
        issues.append("set additionalProperties: false (and strict where supported)")
    for p, spec in props.items():
        if "description" not in spec and "enum" not in spec:
            issues.append(f"parameter '{p}' has no description")
        if spec.get("type") == "string" and p in ("date", "since", "until") and "format" not in spec.get("description", "").lower() and "iso" not in spec.get("description", "").lower():
            issues.append(f"date parameter '{p}' should state its format (ISO YYYY-MM-DD)")
    if not set(schema.get("required", [])) <= set(props):
        issues.append("required lists a parameter that is not defined")
    return issues

bad = {"name": "search", "description": "Searches things.", "input_schema": {"type": "object", "properties": {"q": {"type": "string"}, "since": {"type": "string"}}}}
good = {"name": "search_orders",
        "description": "Search a customer's orders. Use this when the user asks about order status or delivery. Returns up to 10 orders, newest first, with id, status and total.",
        "input_schema": {"type": "object", "properties": {"customer_id": {"type": "string", "description": "Customer id like 'C-1042'."},
                                                           "since": {"type": "string", "description": "ISO date YYYY-MM-DD; only newer orders."}},
                         "required": ["customer_id"], "additionalProperties": False}}
for label, t in (("bad", bad), ("good", good)):
    problems = lint_tool(t)
    print(f"{label}: {'passes' if not problems else ''}")
    for p in problems: print("   -", p)
```

## Special cases

- **Code execution / shell tools** are powerful (they replace dozens of narrow tools) but need a **sandbox**: container, no network by default, resource limits, no secrets in the environment, timeouts.
- **Web fetch / browsing**: return cleaned text (not raw HTML), cap size, and treat content as untrusted.
- **Search tools**: return titles, snippets and ids so the agent can decide what to read next ("progressive disclosure").
- **File editing tools**: exact string replacement (`old_str` → `new_str`, failing if not unique) is far more reliable for models than line-number diffs.
- **Human-handoff tools** (`ask_user`, `escalate`) give the agent a legitimate way out instead of guessing.

```quiz
? Why not expose every API endpoint as a separate tool?
- APIs are too fast
+ Tool definitions consume context and agents work better with task-shaped tools than with many thin wrappers
- Models cannot call APIs
> Match tools to tasks, not to your internal architecture.

? What is the most important part of a tool for correct selection?
- The implementation language
+ The description (and name): when to use it, what it returns, parameter formats
- The function body
> The model chooses tools by reading descriptions.

? A tool returns a 5,000-line log. What should you change?
+ Add search/filter/pagination and truncate by default, saying what was omitted
- Increase the context window
- Nothing
> Return only what the next decision needs, with a way to ask for more.

? What makes an error message useful to an agent?
+ It states what was wrong and what to do next, in plain language
- A numeric code only
- A full stack trace
> Errors are feedback: make them actionable.
```

:::problem Your agent has 45 tools and often calls the wrong one. Walk through the redesign. {level=hard tags="tools,aci"}
Be concrete about measurement.

:::solution Model answer
Measure first: build ~30 realistic tasks with expected tool sequences and record **tool-selection accuracy**, wrong-call types and token cost. Cluster the confusions (which tools get mixed up). Then: **consolidate** overlapping tools into task-shaped ones; **rename** with consistent verb_noun + service prefixes; rewrite descriptions with explicit "use when / don't use when"; add enums and format examples; shorten outputs. Reduce exposure: **tool search** (load definitions on demand) or **route** by task to sub-agents with 5–10 tools each. Add a few examples of correct usage in the system prompt for ambiguous pairs. Re-run the same tasks, compare accuracy, calls and tokens; keep only changes that help.
:::
:::

:::keypoints
- Design tools like a UI for a model: task-shaped, clearly named, with descriptions that say when and when not to use them.
- Make mistakes hard: enums, absolute paths, idempotency, dry runs, readable ids.
- Return concise, relevant outputs with pagination, filtering and truncation; let the agent choose detail.
- Errors must be actionable; keep the tool set small and distinct; load tools on demand when many.
- Evaluate tools with realistic multi-step tasks and read the transcripts; iterate one change at a time.
:::

:::resources
- [Anthropic: Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — the main reference for this lesson.
- [Claude docs: Tool use overview](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview) — definitions, best practices, tool choice.
- [Anthropic: Building effective agents, Appendix 2](https://www.anthropic.com/engineering/building-effective-agents) — "Prompt engineering your tools".
- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) — letting agents call tools through code to save context.
- [Berkeley Function-Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) — benchmark for tool use.
- [SWE-agent](https://github.com/SWE-agent/SWE-agent) — a research project built around the agent-computer interface idea.
:::
