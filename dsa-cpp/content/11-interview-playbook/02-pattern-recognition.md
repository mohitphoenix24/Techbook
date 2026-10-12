---
title: Pattern Recognition — From Problem Statement to Technique
level: mixed
time: 30
summary: A field guide for the first five minutes of any problem — constraints → target complexity, keywords → patterns, a decision path through the main techniques, and a catalogue linking every pattern in this course to its lesson and signature problems.
---

Most interview problems are variations of about 20 patterns. This page is the map: given a problem statement, which pattern should you **try first**? Bookmark it and review it before interviews.

## Step 1: the constraints tell you the complexity

| $n$ up to | Target | Usually means |
|---|---|---|
| 10–12 | $O(n!)$, $O(n^n)$ | permutations, brute force |
| 20–25 | $O(2^n \cdot n)$ | subsets, bitmask DP, meet in the middle |
| 100–500 | $O(n^3)$ | Floyd–Warshall, interval DP, triple loops |
| $10^3$–$5 \cdot 10^3$ | $O(n^2)$ | 2D DP, all pairs |
| $10^5$–$10^6$ | $O(n \log n)$ or $O(n)$ | sorting, heaps, binary search, two pointers, hashing, segment trees |
| $10^9$+ (a value, not a length) | $O(\log n)$ | binary search on the answer, math, fast exponentiation |

## Step 2: keywords → patterns

| If the problem says… | Think… | Lesson |
|---|---|---|
| sorted array, find a pair/triple | **two pointers** or binary search | Two Pointers |
| contiguous subarray/substring, longest/shortest with a condition | **sliding window** | Sliding Window |
| subarray **sum equals k** (negatives possible) | **prefix sum + hash map** | Prefix Sums |
| range sum queries, no updates | **prefix sums** | Prefix Sums |
| range queries **with updates** | **Fenwick / segment tree** | Segment Trees |
| "have I seen…", count frequencies, find pairs | **hash map / set** | Hashing |
| k-th largest, top k, closest k, merge k | **heap** (or quickselect) | Heaps, Quick Sort |
| running median | **two heaps** | Heaps |
| next greater/smaller element, histogram, span | **monotonic stack** | Monotonic Stack |
| window max/min | **monotonic deque** | Queues & Deques |
| matching brackets, nesting, undo | **stack** | Stacks |
| sorted + search / "minimum X such that…" | **binary search** (on the index or the answer) | Binary Search |
| minimize the maximum / maximize the minimum | **binary search on the answer** | Binary Search on Answer |
| all subsets / permutations / combinations | **backtracking** | Backtracking |
| place items satisfying constraints (queens, sudoku) | **backtracking + pruning** | Backtracking Classics |
| linked list cycle / middle / k-th from end | **fast/slow pointers** | Fast & Slow Pointers |
| reverse / reorder a linked list | **pointer re-wiring + dummy node** | Linked Lists |
| tree: height, balanced, diameter, path sums | **DFS returning values** | Tree DFS Patterns |
| tree: level by level, nearest, right view | **BFS** | Binary Trees |
| BST: k-th, validate, range | **inorder / ranges** | BSTs |
| prefix search, autocomplete, word games | **trie** | Tries |
| grid: islands, regions, flood fill | **DFS/BFS on the grid** | Grid Problems |
| shortest path, unweighted / fewest moves | **BFS** (multi-source if several starts) | BFS & DFS |
| shortest path, weighted non-negative | **Dijkstra** | Shortest Paths |
| prerequisites, ordering, dependencies | **topological sort** | Topological Sort |
| connected? merge groups? does this edge make a cycle? | **union-find** | Union-Find |
| connect everything at minimum cost | **MST** | MST |
| count ways / min-max cost over choices, overlapping subproblems | **DP** | Dynamic Programming |
| two strings: compare, transform, match | **2D string DP** | String DP |
| choose items within a budget | **knapsack DP** | Knapsack |
| intervals: merge / schedule / rooms | **sort by start or end, sweep line, heap** | Intervals |
| "always pick the best local option" and it can be proved | **greedy** | Greedy |
| pattern in text, borders, periods | **KMP / Z / rolling hash** | String Algorithms |
| "single number", XOR, subsets of ≤ 20 elements | **bit manipulation** | Bit Manipulation |
| "modulo 10⁹+7", counting arrangements | **combinatorics + modular arithmetic** | Number Theory, Combinatorics |

## Step 3: a quick decision path

:::flow Ask in this order
Is the input sorted, or can I sort it? | two pointers, binary search, greedy by order
Is it about contiguous pieces? | sliding window, prefix sums, Kadane, monotonic stack/deque
Do I need fast lookups or counts? | a hash map or set
Do I need the best element repeatedly? | a heap, or a set for ordered access
Is it a graph, grid, tree or dependency? | BFS / DFS / topological sort / union-find / Dijkstra
Does it ask for all possibilities? | backtracking
Optimal value with overlapping choices? | DP (or greedy if provable)
:::

## Step 4: sanity-check the idea

Before coding, answer three questions out loud:

1. **Why is it correct?** An invariant, an exchange argument, or a recurrence.
2. **What does it cost?** Time and space, measured against the constraints.
3. **What breaks it?** Empty input, duplicates, negatives, overflow, cycles.

:::interview
Interviewers love hearing pattern reasoning: "Contiguous plus 'longest' suggests a sliding window, but the values can be negative, so the window isn't monotone. I'll switch to prefix sums with a map of first occurrences." That's exactly the thinking they're testing for.
:::

## Practice: identify the pattern

```quiz
? "Given meeting times, find the minimum number of rooms." Pattern?
+ Sort + min-heap of end times (or a sweep line)
- Sliding window
- Union-find
> It's the peak overlap of intervals.

? "Find the smallest divisor such that the sum of ceil(a[i]/d) ≤ threshold." Pattern?
+ Binary search on the answer
- Two pointers
- DP
> The predicate is monotone in d.

? "Count subarrays whose sum is divisible by k." Pattern?
+ Prefix sums mod k + a hash map of counts
- Sliding window
- Heap
> Equal prefix remainders give subarrays divisible by k.

? "Minimum number of moves for a knight from A to B on an infinite board." Pattern?
+ BFS on an implicit graph
- Dijkstra with weights
- DP over rows
> All moves cost 1: fewest moves = BFS.

? "For each day, how many days until a warmer temperature?" Pattern?
+ Monotonic stack
- Binary search
- Two heaps
> Next greater element.

? "Ways to decode a digit string into letters." Pattern?
+ 1D DP
- Backtracking only
- Greedy
> Counting with overlapping subproblems.
```

:::keypoints
- Constraints → target complexity → candidate patterns.
- The keyword table covers the large majority of interview questions. Review it often.
- Decide in order: sorted? contiguous? lookups? best-so-far? graph? all possibilities? optimal choices?
- Before coding: why it's correct, what it costs, what breaks it.
:::
