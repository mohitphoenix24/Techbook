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
```
