---
title: Your next projects
level: intermediate
time: 35
summary: Ten projects to build next, each with the stack, the parts of this course it reuses, the one new thing it teaches, and a way to measure it. Plus how to scope one so you finish it, and how to present it so that someone else can see what you built and trust it.
tags: portfolio, project ideas, scoping, next steps
---

You have worked through six projects. The best way to make the ideas yours is to build a **seventh that nobody gave you**. This lesson gives you ten starting points, a method for scoping one so you actually finish, and advice on showing it to other people.

## Ten projects

Each reuses parts you have already seen. The "new" column is the one thing it will teach you that the course did not.

| # | Project | Reuses | New | Measure it by |
|---|---|---|---|---|
| 1 | **Meeting notes to action items**: paste a transcript, get decisions, owners and dates, each with the quote it came from | Smart Extractor's schemas, grounding and corrections | long inputs: chunking a transcript and merging partial results | field accuracy on 15 labelled transcripts; every item's quote found in the transcript |
| 2 | **Invoice and receipt reader** with a review screen for low-confidence fields | Smart Extractor's evidence and flags; SupportPilot's approval | images and PDFs: a model that reads pictures, and what to do when it cannot | per-field accuracy; the share a human had to correct |
| 3 | **Study buddy over your course notes**: ask, get cited answers, and get quizzed | AskDocs end to end | generating *questions* and checking they are answerable from the notes | retrieval hit rate; the share of generated questions a person judges answerable |
| 4 | **Spreadsheet analyst**: upload a CSV, ask questions, get a table and a chart | DataPilot's tools, guard and interface | loading unknown data safely into SQLite; guessing column meanings | execution accuracy on questions you labelled |
| 5 | **Email triage assistant** that drafts replies for review | SupportPilot's pipeline, guardrails and workflow | a real mailbox integration, threads, and attachments | triage accuracy, edit rate |
| 6 | **Pull-request reviewer**: summarises a diff and flags risks, with line citations | RepoChat's chunking, citations and viewer | working on *diffs*: new and old line numbers, and git | do reviewers agree with the flagged risks? |
| 7 | **Documentation drift detector**: finds where the docs disagree with the code | RepoChat's retrieval plus Smart Extractor's checks | comparing two sources of truth, and false alarms | precision and recall on seeded inconsistencies |
| 8 | **A support bot that can act**: look up an order, start a return, with approval | SupportPilot plus DataPilot's tool loop | tools with side effects: idempotency, confirmation, undo | policy decision accuracy; zero unapproved actions |
| 9 | **Voice note to structured journal** | Smart Extractor | audio in: transcription as a stage, with its own errors | field accuracy end to end, and the word error rate of the first stage |
| 10 | **An evaluation dashboard** for any of the above: runs, scores, trends, failing cases | the `evals/` folders and SupportPilot's traces | tracking runs over time, and comparing two prompt versions fairly | does it catch a regression you plant on purpose? |

None of these needs anything exotic. Pick one that you would use yourself, because you will know when its answers are wrong.

## Scoping one so that you finish

Most unfinished projects were not too hard; they were too big on day one. A method that works:

1. **Write the one-sentence promise**: "Paste a transcript and get action items, each with its quote." If you need "and" more than once, it is two projects.
2. **Write ten examples first**: inputs with the outputs you want. These are your evaluation, your demo data and your test fixtures.
3. **Build the thinnest vertical slice**: one input to one output, offline, through the real interface, with a test. Then widen.
4. **Choose the boring technology.** The course used SQLite, plain Python and React without a state library on purpose: every extra moving part is a day.
5. **Decide the limits on day one**: input size, time, money, files. A limit is easier to relax than to add.
6. **Name what you will not build**, and write it in the README. "No accounts, one user, in-memory" is a respectable sentence.
7. **Time-box the polish.** When the evaluation number stops moving for two changes in a row, stop.

## Showing it so that people trust it

A repository that says "AI-powered, works great!" is forgettable. A repository that shows evidence is remembered. The same habits used throughout this course make a project convincing:

- **A README with a run command that works**, a screenshot, and the offline mode, so anyone can try it without a key.
- **The evaluation number, with what it measures and what it misses**, and the command that reproduces it. Never quote a number you did not measure.
- **A "what this does not do" section.** It signals judgement, and saves a reviewer from finding the limits for you.
- **Tests that run in CI**, and a badge you earned.
- **One hostile input handled well**: a malicious file, a prompt-injection attempt, a refusal on an unanswerable question. Showing that the system fails *safely* says more than any success demo.
- **A short write-up of one decision**: why a pipeline and not an agent; why keyword search and not embeddings; why a person approves. Decisions show thinking; features show typing.

## Where to read more

The model provider's own documentation is the authority on what the API can do and what it costs, and it changes faster than any course. These pages are the ones this course relied on:

- [API overview](https://platform.claude.com/docs/en/api/overview) for requests, responses, errors and limits
- [Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming) for the event stream behind every answer here
- [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) for JSON that fits a schema
- [Tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) for the loop in DataPilot
- [Pricing](https://platform.claude.com/docs/en/about-claude/pricing) for the numbers behind the cost model
- [Reducing prompt injection and jailbreaks](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks) for the threats in Projects 5 and 6
- [FastAPI tutorial](https://fastapi.tiangolo.com/tutorial/) and [Pydantic](https://docs.pydantic.dev/latest/) for the back end

:::keypoints
- The best next project is one you would use yourself, built from parts you already know plus one new idea.
- Scope by writing the one-sentence promise and ten real examples first; build the thinnest slice offline; choose boring technology; set limits on day one; say what you will not build.
- Trust is earned by evidence: a README that runs, a measured number with its limits, tests in CI, a hostile input handled safely, and a short write-up of one decision.
- Treat the provider's documentation as the authority and re-check prices and limits before you budget.
:::

```quiz
? Which thing makes a portfolio project most convincing?
- The longest feature list
+ A measured evaluation, an offline way to try it, honest limits, and one hostile input handled safely
- The most recent model
> Evidence beats adjectives.
? Why write ten examples before building?
- To fill the README
+ They are simultaneously your evaluation, your demo data and your test fixtures
- Examples are required by the API
> Define "right" before you build, so you can tell when you have it.
? What is a good first slice?
- All the features at 20% each
+ One input to one output, offline, through the real interface, with a test
- The database schema
> A thin vertical slice shows the whole path works.
```

:::exercise Write the promise
Choose one project from the table, or invent your own. Write: the one-sentence promise, ten input and expected-output examples, the three limits you will set on day one, two things you will *not* build, and the evaluation metric with a threshold you would be proud of. Do not write any code yet. If you can do this in an hour, you can build it in a week; if you cannot, the project is not scoped yet.
:::
