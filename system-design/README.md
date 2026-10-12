# ScaleLab — System Design for Interviews

An interactive course that takes you from "what happens when I type a URL?" to interview-ready in both **high-level design (HLD)** and **low-level design (LLD)**. Every idea is explained in plain English first, then shown in an animated architecture diagram, a sequence diagram or a live simulator, and then built in real code. LLD examples come in **C++ and JavaScript** side by side (a tab switch remembers your language); the HLD case studies and projects use runnable JavaScript and C++ simulations.

## Open it

Open the site from the repo root (`../index.html`) and pick ScaleLab, or open this folder's `index.html` directly. If your browser blocks local files, serve the repo root:

```bash
python3 -m http.server 8000      # from the repo root, then open http://localhost:8000/system-design/
```

## How running code works

- **JavaScript** examples run in a Web Worker in your browser (with a `console.log` formatter that matches Node). The output shown before you edit was produced by Node 22 at build time, and the browser test checks that both agree.
- **C++** examples show output produced by compiling them with `g++ -std=c++20 -pthread` under AddressSanitizer + UBSan at build time. Edited C++ is compiled live with GCC on [Compiler Explorer](https://godbolt.org) (Wandbox as a fallback), so it needs an internet connection.
- Press **▶ Run** or `Ctrl` + `Enter`.

## What's inside

| Module | Lessons |
|---|---|
| 1. Foundations | start here, how the web works, networking, API design, real-time protocols, estimation, non-functional requirements, the scaling journey |
| 2. Traffic, Load Balancing & Caching | DNS & CDN, load balancing, proxies & gateways, caching strategies, caching at scale, rate limiting |
| 3. Databases & Storage | SQL & ACID, NoSQL, indexes & storage engines, replication, sharding, consistent hashing, blob storage, data modelling |
| 4. Distributed Systems Core | CAP/PACELC, consistency models, time & ordering, Raft, quorums & gossip, distributed transactions, unique IDs, probabilistic structures, locks & leader election |
| 5. Messaging, Streams & Async Work | message queues, Kafka & the log, event-driven architecture, batch vs stream, background jobs |
| 6. Architecture, Reliability & Operations | monolith vs microservices, resilience patterns, observability, security, deployment, multi-region & DR, search, geospatial |
| 7. OOP & Design Principles (LLD) | how LLD interviews work, OOP in C++ and JS, UML relationships, SOLID, DRY/KISS/YAGNI & friends, interfaces & dependency injection |
| 8. Design Patterns I | singleton, factories, builder & prototype, adapter & facade, decorator & proxy, composite, bridge & flyweight |
| 9. Design Patterns II | strategy, observer, command & memento, state, template method & chain of responsibility, iterator, mediator & visitor |
| 10. Concurrency for LLD | threads, locks & atomics; producer–consumer, pools, read–write locks; thread-safe class design |
| 11. LLD Interview Problems | parking lot, LRU/LFU cache, elevator, ATM, movie booking, Splitwise, tic-tac-toe, logger, KV store with TTL, pub/sub, task scheduler, ride sharing |
| 12. The HLD Interview Method | the 45-minute framework, the trade-offs cheat sheet, an annotated mock interview (Pastebin) |
| 13. Case Studies I | URL shortener, distributed rate limiter, Dynamo-style KV store, web crawler, notifications, news feed, chat, typeahead, Instagram, leaderboard & top-k |
| 14. Case Studies II | YouTube, Dropbox, Uber, Yelp, Ticketmaster, payments, Google Docs, metrics & monitoring, distributed job scheduler, LLM serving |
| 15. Interview Playbook | the final cheat sheet, an 8-week study plan and readiness checklist |
| Project Lab (12) | mini Redis, load balancer + autoscaler, Dynamo-style KV store, Raft, mini Kafka, URL shortener service, LSM storage engine, event-sourced bank, ride-matching engine, CRDT editor, search engine, job scheduler |

Totals: **102 lessons + 12 projects**, **43 interview questions** (each with hints, in the Questions tracker), **141 diagrams** (77 animated architecture diagrams with request flows, 35 sequence diagrams, 29 UML class diagrams), **18 interactive simulators**, **354 quiz questions**, and **239 runnable examples** (92 C++ + 147 JavaScript), all verified.

## Editing content

Lessons are Markdown files in `content/`. After editing, rebuild:

```bash
python3 build.py              # bundle + verify every NEW or CHANGED C++ and JS example (cached)
python3 build.py --no-verify  # bundle only
```

The build fails if an example doesn't compile, crashes, trips a sanitizer, prints a warning, or times out. Results are cached in `.build-cache/cpp.json` and `.build-cache/js.json`.

To check the pages in a real browser (serve the repo root on port 8766 first):

```bash
python3 tools/browser_test.py all                        # every lesson: runs examples, steps diagrams, collects console errors
python3 tools/browser_test.py chat-system --shots DIR    # one lesson, with screenshots of every visual
python3 tools/browser_test.py all --light --mobile       # light theme / phone viewport
```

Extra Markdown syntax (on top of the shared boxes such as `:::def`, `:::tip`, `:::flow`, `:::keypoints`, quizzes):

| Syntax | Renders as |
|---|---|
| ```` ```cpp run ```` / ```` ```js run ```` | an editable, runnable example (`title="..."`; `expect-error` for code meant to fail) |
| `:::tabs Title` around several code blocks | C++ / JavaScript tabs; the chosen language is remembered |
| ```` ```viz algo=arch ```` | an architecture diagram: node lines `id Label \| sub [type*count] @layer,row`, then `--` and edges (`a -> b : label`, `~>` async, `<->`), then `flow Name` steps (`a > b : caption`) that animate a request |
| ```` ```viz algo=seq ```` | a sequence diagram: `participant id Label [type]`, `A -> B : msg \| why`, `-->` replies, `note`, `== section ==` |
| ```` ```viz algo=uml ```` | a UML class diagram: `class` / `interface` / `abstract class` / `enum` with members, relations `--\|>`, `..\|>`, `*--`, `o--`, `-->`, `..>` |
| ```` ```viz algo=cache ```` (and 17 others) | an interactive simulator; `key = value` lines set its starting parameters |
| `:::problem Name {level=medium tags="a,b"}` | an interview question card (listed on the Questions page); nest `:::hint` and `:::solution` |
| `:::derive Title` | a step-by-step derivation: `TeX \|\| reason` per line, `!` marks the result |
| `:::analogy`, `:::interview`, `:::edge` | analogy, interview-tip and edge-case boxes |

Simulators: `latency`, `estimate`, `nines`, `lb`, `cache`, `ratelimit`, `replication`, `sharding`, `hashring`, `cap`, `quorum`, `bloom`, `raft`, `queue`, `kafka`, `backoff`, `breaker`, `geohash`.

## Folder layout

This course is one part of the combined site (see `../README.md`). The design system, the engine, CodeMirror, marked and KaTeX are shared from `../shared/`.

```text
index.html                 the site shell + SITE config
build.py                   bundles content/ and verifies every C++ (g++) and JS (Node) example
content/                   all lessons and projects (Markdown)
assets/css/sd.css          diagrams, simulators, code tabs, problem cards
assets/js/runner-cpp.js    verified-output cache + live C++ compile (Compiler Explorer / Wandbox)
assets/js/runner-js.js     JS in a Web Worker with a Node-compatible console
assets/js/viz-sd.js        architecture / sequence / UML diagram engines
assets/js/sims-sd.js       the 18 simulators
tools/browser_test.py      Playwright checks: runs examples, clicks through visuals, screenshots
```
