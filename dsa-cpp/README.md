# AlgoLab — DSA in C++ for Interviews

An interactive course that takes you from "I know some C++" to interview-ready in data structures and algorithms. Every topic is explained in plain English first, then made precise with definitions, proofs and step-by-step math derivations (Big-O, recurrences, the Master theorem, amortized analysis, correctness proofs). Every example is real C++ you can edit and run. Step-by-step visualizers show the algorithms moving.

## Open it

Open the site from the repo root (`../index.html`) and pick this course, or open this folder's `index.html` directly. No server or install is needed.

If your browser blocks local files, serve the folder instead:

```bash
python3 -m http.server 8000      # from the repo root, then open http://localhost:8000
```

## How running C++ works

- **Unchanged examples** show output that was produced by really compiling and running them with `g++ -std=c++20` (under AddressSanitizer + UBSan) when the course was built. This is instant and works offline.
- **Edited code (or edited input)** is compiled and run live with **GCC 15.2 on [Compiler Explorer](https://godbolt.org)**, with Wandbox (GCC 13) as a fallback. This needs an internet connection. Only the code you run is sent there.
- **Compile errors** are listed under the editor and underlined in the code. **Crashes** (segfaults, aborts, timeouts) come with a plain-English hint.
- **Input:** programs that read with `cin` have an **Input** box (the Input button on every runnable card).
- Press **▶ Run** or `Ctrl` + `Enter`.

Examples use `#include <bits/stdc++.h>` (standard in interviews and contests). To run them on macOS with Clang, replace it with the specific headers.

## What's inside

| Module | Lessons |
|---|---|
| 1. C++ for DSA | start here, essentials (types, overflow, I/O, references), pointers & memory, vector & string, STL containers, STL algorithms & lambdas, structs/classes/templates |
| 2. Complexity & the Math Behind It | Big-O/Ω/Θ with proofs, analyzing loops with sums, recurrences & the Master theorem, amortized analysis, space complexity, number theory, bit manipulation, combinatorics & probability |
| 3. Arrays, Strings & Hashing Patterns | in-place techniques, hashing, prefix sums & difference arrays, two pointers, sliding window, Kadane, matrices, intervals & sweep line |
| 4. Searching & Sorting | binary search (invariants), binary search on the answer, elementary sorts, merge sort, quick sort & quickselect, the Ω(n log n) bound & linear sorts |
| 5. Linked Lists, Stacks & Queues | linked lists, fast/slow pointers (Floyd, with proof), stacks, monotonic stack, queues/deques/monotonic deque |
| 6. Recursion, Backtracking & D&C | thinking recursively, the backtracking template, N-Queens/Sudoku/Word Search, divide and conquer (Karatsuba, closest pair) |
| 7. Trees & Heaps | binary trees & traversals, iterative/Morris traversals & serialization, tree DFS patterns, BSTs & balancing (AVL proof), heaps, tries, segment & Fenwick trees |
| 8. Graphs | representations, BFS/DFS, grid problems, topological sort & cycles & bipartite, Dijkstra/Bellman–Ford/Floyd–Warshall/0-1 BFS, union-find, MST, bridges/SCC/Euler paths |
| 9. Dynamic Programming | foundations & the 5-step framework, 1D, grids, knapsack, LIS, string DP, interval DP, tree/state-machine/bitmask/digit DP |
| 10. Greedy & String Algorithms | greedy with exchange-argument proofs, KMP / Z / Rabin–Karp / Manacher |
| 11. Interview Playbook | a 7-step method with a worked mock interview, pattern recognition, the complexity cheat sheet, C++ pitfalls, a 12-week study plan |
| Project Lab (10) | your own `vector`, a hash map (chaining + probing, benchmarked), LRU & LFU caches, an indexed priority queue, search autocomplete, a route planner (BFS/Dijkstra/A*), a `diff` tool, Huffman compression, a maze generator & solver, a range-query engine |

Totals: **68 lessons + 10 projects**, **269 interview problems** (each with hints, a full solution, its complexity and a LeetCode link), **39 visualizers**, **393 runnable C++ examples** (all verified).

Other features: the **Problems** page (a tracker with difficulty and status filters, saved in your browser), Ctrl+K search over lessons, problems and definitions, a glossary of every definition, progress tracking, quizzes, light/dark themes, and a mobile layout.

## DSA Sheets: an interactive Blind 75 (`#/sheets`)

Open **Sheets** in the top bar (or `dsa-cpp/index.html#/sheets`). It is a separate, fully interactive platform inside AlgoLab: the **75 Blind 75 problems** plus *Binary Search* as a warm-up (76 lessons), each with C++ **and** JavaScript solutions.

Every problem page has 12 sections: the statement; guided "think first" questions; brute force, why it is slow, the key observation and the optimal solution; the pattern and how to recognise it; the algorithm with its invariant and correctness argument; a **test lab**; the time and space complexity **derived with mathematics** and checked by a doubling experiment; common mistakes; interview follow-ups with code; related problems; takeaways.

The **test lab** is the heart of it:

- **723 test cases** (normal, edge and corner), each with a "why this case matters" note, plus a *Custom* input with friendly validation.
- **20 specialised visualizers** (array, sliding window, two pointers, binary search, hash map, stack, queue, linked list, tree, recursion with call stack, graph, heap, DP table, matrix, backtracking, trie, interval, bit, greedy, union-find) with spring animation, a timeline scrubber, play/pause/step/speed, keyboard control, and **code line ↔ variables ↔ structure ↔ explanation** kept in sync. The player (variables, picture and controls) stays pinned in the window while you step.
- The animation is the trace of the **reference algorithm** on your input (clearly labelled). The **Run** button executes your code for real: JavaScript in a Web Worker, C++ through the verified-output cache or Compiler Explorer. Program output and the educational trace are always shown separately.
- A dashboard with progress, bookmarks, search, filters (category, pattern, difficulty, status), recently viewed, and a sidebar. Everything is saved in your browser.

### How it is verified

`node dsa-cpp/sheets/build.mjs` is the gate every lesson passes (`--only=id1,id2`, `--no-cpp`, `--fuzz=N`): the data model and placeholders, the tracer against the JS solution, the C++ solution (`g++ -std=c++20`, AddressSanitizer + UBSan) and both brute forces on every test, random fuzzing against the brute force, every animation frame rendered on a mock stage, every test input accepted by the lesson's own input check, the claimed complexity against the measured step counts, and the follow-up code (compiled or parsed). It writes `assets/js/sheets/ready.js` and `verified.js`.

`python3 dsa-cpp/sheets/browser_test.py` (Playwright + Chrome, with the site served on port 8766) then plays every frame of every case in a real browser and runs both languages on all cases (`--only=ids`, `--shots=DIR`, `--theme=light`, `--mobile`).

### Adding a problem

Copy `assets/js/sheets/problems/two-sum.js`, fill in the fields (statement, intuition, brute, pattern, optimal, `cpp`/`js` with `//@tag` markers, tests, `trace`, `fuzz`, `gen`, complexity, mistakes, follow-ups), list it in `assets/js/sheets/catalog.js` and run the build.

## Editing content

Lessons are Markdown files in `content/`. After editing, rebuild:

```bash
python3 build.py              # bundle + compile/run every NEW or CHANGED C++ example (cached)
python3 build.py --no-verify  # bundle only
python3 build.py --only=08-graphs   # verify only matching lesson files
python3 build.py --watch      # rebuild on save
```

The build fails loudly if any example doesn't compile, crashes, trips a sanitizer, or times out. Results are cached in `.build-cache/cpp.json`.

Extra Markdown syntax:

| Syntax | Renders as |
|---|---|
| ```` ```cpp run ```` | an editable, runnable C++ example (`level=easy`, `title="..."`) |
| ```` ```cpp run timing ```` | a benchmark: compiled `-O2` without sanitizers; output is labelled as machine-dependent |
| ```` ```cpp run expect-error ```` / ```` runtime-error ```` | an example that is **meant** to fail to compile / to crash |
| ```` ```stdin ```` right after a run block | the program's input (editable in the page) |
| ```` ```viz algo=dijkstra ```` | a step-by-step visualizer (optional `key = value` lines override the default input) |
| `$…$`, `$$…$$` | KaTeX math |
| `:::derive Title` | a step-by-step derivation: one `TeX \|\| reason` per line; a leading `!` marks the result |
| `:::complexity` | complexity tiles: `Time \| O(n \log n) \| why` per line |
| `:::problem Name {level=medium lc=slug tags="a,b"}` | a problem card (added to the Problems page); nest `:::hint` and `:::solution` inside |
| `:::proof`, `:::pattern`, `:::interview`, `:::edge` | proof, pattern, interview-tip and edge-case boxes |
| `:::def Term` … `:::` | a definition card (also added to the Glossary) |
| `:::syntax`, `:::tip`, `:::warn`, `:::note`, `:::analogy`, `:::keypoints`, `:::exercise`, `:::flow`, `:::formula` | as in the other courses |
| ```` ```quiz ```` | a quiz: `? question`, `- wrong`, `+ right`, `> explanation` |

Visualizers live in `assets/js/viz.js`. Each algorithm is a function that turns an input into a list of frames (array / bars / tree / graph / grid / linked-list views + the current code line + variables + an explanation).

## Folder layout

This course is one part of the combined site (see `../README.md`). The design system (`style.css`), the engine (`app.js`), CodeMirror, marked and KaTeX are shared from `../shared/`; the course catalogue is `../courses.js`.

```text
index.html                 the site shell + config
build.py                   bundles content/ and compiles/verifies every C++ example
content/                   all lessons and projects (Markdown)
assets/css/dsa.css         additions: math, derivations, problems, visualizers, compile diagnostics
assets/js/runner-cpp.js    verified-output cache, live compile (Compiler Explorer / Wandbox), diagnostics
assets/js/viz.js           39 algorithm visualizers + growth chart + Master-theorem calculator
assets/js/sheets/          DSA Sheets: engine (core, stage, lab, lesson, pages), viz/*.js, catalog.js, problems/*.js (76)
assets/css/sheets.css      DSA Sheets styles
sheets/                    build.mjs (verifier) and browser_test.py (real-browser test) for DSA Sheets
```
