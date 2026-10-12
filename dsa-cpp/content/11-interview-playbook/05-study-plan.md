---
title: Your 12-Week Study Plan
level: mixed
time: 20
summary: A realistic week-by-week plan through this course (about 10–12 hours a week), the daily practice loop, spaced repetition for problems, how to run mock interviews, how to track progress with the Problems page, and what to do in interview week.
---

Consistency beats intensity. One focused hour a day for twelve weeks makes you far stronger than a two-week cram. This plan follows the course modules and assumes about **10–12 hours per week**. Stretch it to 16 weeks if your schedule is tighter, or compress it if you already know C++ well.

## The 12 weeks

| Week | Learn | Practice focus | Problems |
|---|---|---|---|
| 1 | C++ for DSA (Module 1) | STL fluency: write every container from memory | ~8 |
| 2 | Complexity & math (Module 2) | derive Big-O for code you read; recurrences | ~10 |
| 3 | Arrays, hashing, prefix sums | hash-map and prefix-sum patterns | ~15 |
| 4 | Two pointers, sliding window, Kadane, intervals | explain the invariant out loud for each | ~18 |
| 5 | Binary search + sorting (Module 4) | write binary search from scratch daily | ~15 |
| 6 | Linked lists, stacks, queues (Module 5) | draw pointer diagrams; monotonic stacks | ~15 |
| 7 | Recursion & backtracking (Module 6) | the template from memory; count tree sizes | ~12 |
| 8 | Trees I: traversals, DFS patterns, BST | pick the bottom-up, top-down or global-answer shape | ~18 |
| 9 | Trees II: heaps, tries, segment/Fenwick trees | top-k, two heaps, range queries | ~14 |
| 10 | Graphs (Module 8) | BFS/DFS/topo/Dijkstra/DSU from memory | ~20 |
| 11 | Dynamic programming (Module 9) | the 5 steps written out for each problem | ~20 |
| 12 | Greedy, strings, review + mocks | mixed sets under time pressure; 2–3 mocks | ~15 |

That's roughly **180–200 problems**: every problem in this course, plus a few repeats. That's comparable to the well-known curated lists (Blind 75, NeetCode 150) and covers the same patterns.

## The daily loop (60–90 minutes)

:::flow One session
Warm-up 10 min | re-solve one old problem from memory (spaced repetition)
Learn 20–30 min | read a lesson section, run the code, watch the visualizer
Solve 30–40 min | 1–2 new problems, timed, no hints for the first 20 minutes
Review 10 min | read the official solution; write a 3-line note: pattern, key insight, mistake
:::

:::tip The 3-line note
For every problem, write down: **(1) the pattern** ("prefix sum + first-index map"), **(2) the insight** ("negatives break the window"), and **(3) your mistake** ("forgot the empty prefix"). Re-reading these notes is the highest-value review you can do before an interview.
:::

## Spaced repetition

Solving a problem once doesn't mean you can solve it in an interview. Re-solve problems **from scratch** at growing intervals:

| When | What |
|---|---|
| same day | solved with help? Re-type it from memory before you stop |
| +3 days | re-solve without looking |
| +1 week | re-solve, timed |
| +1 month | re-solve, timed, explaining out loud |

If you fail a re-solve, reset that problem's schedule. Use the **Problems** page to track what you've solved: tick problems off as you go, and filter by **To do** for review sessions.

## Mock interviews

From week 6 onwards, do at least **one mock per week**:

- Use a friend, a peer platform, or record yourself with a timer and a problem you haven't seen.
- **Speak the whole time.** Use the 7-step method from the *Problem-Solving Framework*.
- Afterwards, score yourself: did I clarify? Say the brute force? State the complexity? Test before I declared it done?

## Difficulty mix

| Phase | Easy | Medium | Hard |
|---|---|---|---|
| Weeks 1–4 | 50% | 50% | 0% |
| Weeks 5–9 | 20% | 70% | 10% |
| Weeks 10–12 | 10% | 65% | 25% |

Most real interview questions are **medium**. Hards are worth doing to stretch your pattern recognition, but don't let them eat your schedule.

## Interview week

:::flow The last 7 days
Days 7–4 | re-solve your 3-line-note problems, one per pattern
Days 3–2 | 2 timed mocks; review the cheat sheet and the pitfalls list
Day 1 | light review only; sleep well; test your setup (editor, camera)
Interview day | clarify, brute force, optimize, code, test, and talk the whole time
:::

:::keypoints
- About 1 hour a day for 12 weeks, module by module, ~180–200 problems in total.
- Daily: warm-up re-solve → learn → timed new problems → a 3-line note.
- Spaced repetition (3 days, 1 week, 1 month) turns "I've seen it" into "I can do it".
- Weekly mock interviews from week 6; mostly medium problems; track everything on the Problems page.
:::
