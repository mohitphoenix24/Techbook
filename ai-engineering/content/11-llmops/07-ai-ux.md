---
title: Designing AI Product Experiences
level: easy
time: 30
summary: UX patterns that make probabilistic software feel trustworthy. Setting expectations, streaming and progress, showing sources and uncertainty, human-in-the-loop controls, editing and undo, handling errors and refusals gracefully, onboarding and prompt suggestions, choosing chat versus other interfaces, accessibility, and measuring product success beyond model quality.
---

A great model in a poor interface feels broken; a decent model in a well-designed interface feels magical. Because LLM output is **probabilistic, sometimes wrong and slow**, the interface has to do jobs that classic software never needed: set expectations, show evidence, let people steer, and recover gracefully from mistakes. This lesson is a pattern library for engineers who also own the front end of their AI features.

## Principles

1. **Be honest about what it is.** Label AI content, explain capabilities and limits, avoid pretending to be human.
2. **Keep the human in control.** Suggestions, not silent actions; easy accept, edit, reject, undo.
3. **Show your work.** Sources, steps and reasoning summaries earn trust and let users verify.
4. **Design for being wrong.** Errors are normal; make them cheap to spot and cheap to fix.
5. **Respect time.** Stream, show progress, allow interruption.
6. **Fit the task.** Chat is one interface, not the only one.

## Pick the right interaction pattern

| Pattern | Examples | Best when |
|---|---|---|
| **Chat** | assistants, support bots | open-ended questions, exploration, multi-turn clarification |
| **Inline suggestions / autocomplete** | code completion, email smart compose | the user is already working; low friction, accept with a key |
| **Command / slash actions on selection** | "rewrite", "summarise this", "explain" | well-defined transformations of existing content |
| **Generate then edit (canvas/document)** | drafting, design, code artifacts | outputs the user will refine; side-by-side editing |
| **Forms with AI assist** | auto-fill, extraction with review | structured data entry; verification of each field |
| **Background agents** | triage, research, monitoring | long tasks; needs status, notifications and review before effects |
| **Search with generated answers** | cited summaries over results | information seeking where sources matter |
| **Voice/multimodal** | assistants, camera search | hands-free or visual contexts |

Many successful products avoid a blank chat box: they put AI **where the work already happens**, with context pre-filled.

## Setting expectations and onboarding

- A short, concrete statement of what it can do ("Ask questions about your invoices") beats a vague "Ask me anything".
- Provide **starter prompts and examples** tied to the user's context; people do not know what to type.
- Show **capabilities and limits** in the empty state; link to feedback and help.
- Explain data use plainly (what is sent where, retention) at the point of need.

## Latency, streaming and progress

- **Stream tokens**; the first words appearing quickly matters more than total time.
- For multi-step work, show **named steps** ("Searching documentation… Reading 3 pages… Drafting answer…"). Progress that matches reality builds trust; fake spinners do not.
- Allow **stop** and **regenerate**; never trap users in a long generation.
- For long jobs, **run in the background** and notify, with the ability to leave and return.
- Use **optimistic UI** and partial results where safe; avoid layout jumping while streaming (reserve space, scroll gently).

## Trust: sources, confidence and uncertainty

- **Citations** next to claims, linking to the exact source passage (opening a highlighted excerpt is better than a bare URL). Make citations real: verify that cited text supports the claim (see the RAG and safety modules).
- Express uncertainty in **plain language** and only when calibrated: "I could not find this in your documents" is more useful than a probability. Avoid decorative confidence scores that are not calibrated.
- Show **what the model used** (files, pages, time range) so users can correct the scope.
- Distinguish **generated** from **retrieved or user-supplied** content visually.
- Offer **verification affordances** for high stakes: compare to source, show the calculation, link to the record.

## Control, correction and recovery

| Need | Pattern |
|---|---|
| Fix a small mistake | direct edit of the output; keep the rest |
| Change direction | follow-up instruction, regenerate with tweaks, branching versions |
| Undo effects | undo/revert for actions the AI took; version history |
| Approve risky actions | confirmation with a clear, human-readable summary and diff before sending, deleting, paying |
| Teach preferences | "remember this", visible and editable memory |
| Hand off | easy path to a human with full context transferred |

For agents, a good default is **plan, show, approve, act, report**: preview the plan or the diff, act on approval, and summarise exactly what changed.

## Errors, refusals and edge cases

- **Failures** (timeout, rate limit, tool error): say what happened and offer a retry or alternative, never a raw stack trace or silent empty response.
- **Refusals**: short, non-judgemental, explain what you cannot do and what you can instead.
- **Out-of-scope or unknown**: say so and route to help; do not bluff.
- **Empty or low-quality input**: ask a clarifying question instead of guessing when a wrong guess is costly.
- **Sensitive topics**: use appropriate resources and escalation paths (safety module).
- Test the **ugly states**: long outputs, non-English input, mid-stream disconnects, concurrent edits.

## Accessibility and inclusion

Keyboard operation, screen-reader announcements for streaming content (use polite live regions and avoid announcing every token), sufficient contrast, motion preferences, readable text size, **plain language**, support for multiple languages and right-to-left scripts, and voice alternatives. Test with real users, including those who use assistive technology.

## Measuring product success

Model benchmark scores are not product metrics. Track:

| Layer | Metrics |
|---|---|
| **Adoption** | activation, weekly active users, feature reach |
| **Usage quality** | acceptance rate of suggestions, edit distance after acceptance, regenerate rate, abandonment, conversation length by outcome |
| **Outcomes** | task completion, time saved, tickets deflected or resolved, error rates downstream, conversion |
| **Trust** | thumbs, complaints, escalations, citation clicks, overrides |
| **Cost and latency** | cost per successful task, TTFT, p95 latency |
| **Safety** | policy violations, incident counts |

Run **qualitative reviews** of real conversations regularly (error analysis) alongside dashboards. Interview users: they often use features differently from your assumptions.

```quiz
? Why is a blank chat box often a weak UX for an AI feature?
+ Users do not know what to ask or what the system can do; embedding AI in the workflow with context and starter actions works better
- Chat is always forbidden
- It costs more
> Meet users where the work happens.

? Which is the best way to show progress for a multi-step agent task?
+ Named, truthful steps that reflect what the system is actually doing
- A fake spinner
- Hiding all progress until done
> Honest progress builds trust.

? What should happen before an AI agent sends an email or deletes data?
+ Show a human-readable summary or diff and get confirmation
- Act immediately to save time
- Ask the model if it is sure
> Confirmation protects against costly errors.

? Which metric best reflects whether a drafting assistant is useful?
+ Acceptance rate and how much users edit accepted drafts, plus task outcomes
- Number of tokens generated
- Benchmark score of the model
> Product metrics capture real value.
```

:::problem Redesign the experience of a support-reply assistant that currently drafts a full reply and auto-sends it. Agents complain about wrong answers reaching customers. Propose UX and metrics changes. {level=easy tags="ux,product"}
Think control, evidence and measurement.

:::solution Model answer
Stop auto-sending: show the draft **inside the agent's reply box** for review, with **sources** (knowledge-base articles and the customer's order data) displayed beside it, uncertainty flagged ("no policy found for this case"), and one-click **edit, regenerate with guidance, or discard**. Highlight claims that depend on data (refund amount, dates) for verification. Allow auto-send only for narrow, low-risk categories after proving accuracy, with sampling audits. Capture edits and rejections as feedback. Metrics: acceptance rate, edit distance, handle time, customer satisfaction, reopen rate, escalations, and an error-rate audit of sent replies; compare against a control group.
:::
:::

:::keypoints
- AI UX must handle probabilistic, sometimes wrong, sometimes slow output: set expectations, show sources, keep humans in control, and make errors cheap to fix.
- Choose the pattern that fits the task (inline suggestions, selection actions, canvases, forms, agents, search), not just chat.
- Stream, show truthful progress, support stop and regenerate, and run long tasks in the background.
- Cite sources precisely, express calibrated uncertainty in plain language, and require confirmation for risky actions.
- Design refusals, failures and edge cases deliberately, and make interfaces accessible.
- Measure adoption, acceptance, outcomes, trust, cost and safety, not benchmark scores.
:::

:::resources
- [Google PAIR: People + AI Guidebook](https://pair.withgoogle.com/guidebook/) — design patterns for human-centred AI.
- [Microsoft: Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/) — 18 research-backed guidelines.
- [Apple Human Interface Guidelines: Machine learning](https://developer.apple.com/design/human-interface-guidelines/machine-learning) — platform guidance for ML features.
- [Nielsen Norman Group: AI UX articles](https://www.nngroup.com/topic/ai/) — usability research on generative AI.
- [Vercel AI SDK UI docs](https://ai-sdk.dev/docs/ai-sdk-ui) — building streaming chat UIs.
- [Anthropic: Economic Index](https://www.anthropic.com/economic-index) — data on how people actually use AI assistants.
:::
