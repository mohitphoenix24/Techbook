---
title: The Complexity Cheat Sheet
level: mixed
time: 20
summary: Every time and space bound you're expected to know, on one page — data structure operations, C++ STL container costs, sorting and searching, graph algorithms, DP families, common recurrences and sums, and the input-size table.
---

A one-page reference for the night before an interview. Every entry was derived somewhere in this course. If one surprises you, go back and re-read where it came from: knowing *why* matters more than memorizing.

## Data structures

| Structure | Access | Search | Insert | Delete | Notes |
|---|---|---|---|---|---|
| Array / `vector` | $O(1)$ | $O(n)$ | $O(1)^*$ at the end, $O(n)$ in the middle | $O(1)$ at the end, $O(n)$ in the middle | * amortized |
| Sorted array | $O(1)$ | $O(\log n)$ | $O(n)$ | $O(n)$ | binary search |
| Linked list | $O(n)$ | $O(n)$ | $O(1)$ at a known node | $O(1)$ at a known node (doubly) | |
| Stack / queue / deque | top/front $O(1)$ | $O(n)$ | $O(1)$ | $O(1)$ | |
| Hash table | — | $O(1)$ avg, $O(n)$ worst | $O(1)$ avg | $O(1)$ avg | rehashing is amortized |
| Balanced BST (`set`/`map`) | — | $O(\log n)$ | $O(\log n)$ | $O(\log n)$ | ordered, `lower_bound` |
| Binary heap | min/max $O(1)$ | $O(n)$ | $O(\log n)$ | pop $O(\log n)$ | build $O(n)$ |
| Trie | — | $O(L)$ | $O(L)$ | $O(L)$ | L = key length |
| Union-find | — | find $O(\alpha(n))$ | union $O(\alpha(n))$ | — | both optimizations |
| Segment tree | — | range query $O(\log n)$ | point update $O(\log n)$ | — | lazy: range update $O(\log n)$ |
| Fenwick tree | — | prefix query $O(\log n)$ | point update $O(\log n)$ | — | invertible operations |

## C++ STL quick reference

| Call | Cost |
|---|---|
| `sort`, `stable_sort` | $O(n \log n)$ |
| `nth_element` | $O(n)$ average |
| `partial_sort(k)` | $O(n \log k)$ |
| `lower_bound` / `upper_bound` / `binary_search` on a random-access range | $O(\log n)$ |
| `set/map::lower_bound`, `insert`, `erase`, `find` | $O(\log n)$ |
| `unordered_map` `[]`, `find`, `insert`, `erase` | $O(1)$ average |
| `priority_queue` `push`/`pop`, `top` | $O(\log n)$, $O(1)$ |
| `vector::insert/erase` at position `i` | $O(n - i)$ |
| `string::substr(pos, len)`, `s1 + s2` | $O(\text{len})$, $O(\lvert s_1\rvert + \lvert s_2\rvert)$ |
| `reverse`, `accumulate`, `count`, `find`, `unique`, `min_element` | $O(n)$ |
| `next_permutation` | $O(n)$ worst, $O(1)$ amortized |
| `__builtin_popcount`, `gcd` | $O(1)$, $O(\log \min)$ |

## Sorting

| Algorithm | Best | Average | Worst | Space | Stable |
|---|---|---|---|---|---|
| Insertion | $n$ | $n^2$ | $n^2$ | $1$ | yes |
| Selection | $n^2$ | $n^2$ | $n^2$ | $1$ | no |
| Merge | $n \log n$ | $n \log n$ | $n \log n$ | $n$ | yes |
| Quick (random pivot) | $n \log n$ | $n \log n$ | $n^2$ | $\log n$ | no |
| Heap | $n \log n$ | $n \log n$ | $n \log n$ | $1$ | no |
| Counting | $n + k$ | $n + k$ | $n + k$ | $n + k$ | yes |
| Radix (LSD) | $d(n+b)$ | $d(n+b)$ | $d(n+b)$ | $n + b$ | yes |

Comparison-sort lower bound: $\Omega(n \log n)$, from the decision tree, since $\log_2 n! = \Theta(n\log n)$.

## Graph algorithms

| Algorithm | Time | Use |
|---|---|---|
| BFS / DFS | $O(V + E)$ | traversal, unweighted shortest paths, components |
| Topological sort (Kahn / DFS) | $O(V + E)$ | ordering a DAG, cycle detection |
| Dijkstra (binary heap) | $O((V + E) \log V)$ | non-negative weights |
| 0-1 BFS | $O(V + E)$ | weights 0 or 1 |
| Bellman–Ford | $O(VE)$ | negative weights, ≤ k edges, negative cycles |
| Floyd–Warshall | $O(V^3)$ | all pairs |
| Kruskal | $O(E \log E)$ | MST, sparse graphs |
| Prim (heap / array) | $O(E \log V)$ / $O(V^2)$ | MST, dense graphs (array) |
| Tarjan bridges / Kosaraju SCC | $O(V + E)$ | bridges, articulation points, SCCs |
| Hierholzer (Euler path) | $O(E)$ | use every edge once |

## Classic DP families

| Problem | States | Transition | Time |
|---|---|---|---|
| Fibonacci / stairs / robber | $n$ | $O(1)$ | $O(n)$ |
| Coin change (amount A, c coins) | $A$ | $O(c)$ | $O(Ac)$ |
| 0/1 knapsack | $n \times W$ | $O(1)$ | $O(nW)$ (pseudo-polynomial) |
| LIS | $n$ | $O(n)$ / binary search | $O(n^2)$ / $O(n \log n)$ |
| LCS / edit distance | $n \times m$ | $O(1)$ | $O(nm)$ |
| Grid paths | $R \times C$ | $O(1)$ | $O(RC)$ |
| Interval DP (matrix chain, balloons) | $n^2$ | $O(n)$ | $O(n^3)$ |
| Bitmask DP (TSP) | $2^n \times n$ | $O(n)$ | $O(n^2 2^n)$ |
| Tree DP | $n$ | children | $O(n)$ |

## Searching and other building blocks

| Technique | Time |
|---|---|
| Binary search | $O(\log n)$ |
| Binary search on the answer | $O(\text{check} \cdot \log \text{range})$ |
| Two pointers / sliding window | $O(n)$ |
| Monotonic stack / deque | $O(n)$ amortized |
| Prefix sums | build $O(n)$, query $O(1)$ |
| Quickselect | $O(n)$ average |
| KMP / Z / Manacher | $O(n + m)$ / $O(n)$ / $O(n)$ |
| Backtracking: subsets / permutations | $O(n 2^n)$ / $O(n \cdot n!)$ |
| GCD / fast power | $O(\log n)$ |
| Sieve of Eratosthenes | $O(n \log\log n)$ |

## Recurrences and sums

| Recurrence | Solution | Example |
|---|---|---|
| $T(n) = T(n/2) + O(1)$ | $O(\log n)$ | binary search |
| $T(n) = T(n/2) + O(n)$ | $O(n)$ | quickselect (average) |
| $T(n) = 2T(n/2) + O(1)$ | $O(n)$ | tree traversal |
| $T(n) = 2T(n/2) + O(n)$ | $O(n \log n)$ | merge sort |
| $T(n) = 2T(n/2) + O(n \log n)$ | $O(n \log^2 n)$ | |
| $T(n) = 3T(n/2) + O(n)$ | $O(n^{1.585})$ | Karatsuba |
| $T(n) = T(n-1) + O(1)$ | $O(n)$ | linear recursion |
| $T(n) = T(n-1) + O(n)$ | $O(n^2)$ | selection sort |
| $T(n) = 2T(n-1) + O(1)$ | $O(2^n)$ | Hanoi, subsets |
| $T(n) = T(n-1) + T(n-2)$ | $O(\varphi^n)$ | naive Fibonacci |

| Sum | Value |
|---|---|
| $1 + 2 + \cdots + n$ | $\frac{n(n+1)}{2} = \Theta(n^2)$ |
| $1^2 + \cdots + n^2$ | $\frac{n(n+1)(2n+1)}{6} = \Theta(n^3)$ |
| $1 + 2 + 4 + \cdots + 2^k$ | $2^{k+1} - 1$ |
| $1 + \frac12 + \frac14 + \cdots$ | $< 2$ |
| $1 + \frac12 + \frac13 + \cdots + \frac1n$ | $\ln n + O(1)$ |
| $\log_2 n!$ | $\Theta(n \log n)$ |
| $\sum_{k} \binom nk$ | $2^n$ |

## Input size → complexity

| $n$ | ≤ 11 | ≤ 20 | ≤ 500 | ≤ 5000 | ≤ $10^6$ | ≤ $10^8$ | larger |
|---|---|---|---|---|---|---|---|
| target | $n!$ | $2^n$ | $n^3$ | $n^2$ | $n \log n$ | $n$ | $\log n$ / $O(1)$ |

About $10^8$ simple C++ operations per second. A 256 MB memory limit fits about $6 \times 10^7$ ints.

:::keypoints
- Know these tables cold, but always be ready to **derive** a bound (loops → sums, recursion → recurrences).
- Say average vs worst case when they differ (hash tables, quicksort, quickselect).
- Use the input-size table to pick the target complexity before you design anything.
:::
