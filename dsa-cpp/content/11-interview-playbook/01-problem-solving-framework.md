---
title: A Repeatable Method for Any Interview Problem
level: mixed
time: 35
summary: The step-by-step process strong candidates follow in a 45-minute coding interview — clarify, examples, brute force, optimize with a named pattern, state the complexity, code cleanly, test with a dry run and edge cases — what to say at each step, how to get unstuck, and a full worked mock interview.
---

Knowing algorithms is half of the job. The other half is **performing** in 45 minutes while someone watches. Strong candidates aren't faster thinkers. They follow a **process** that keeps them calm, keeps the interviewer informed, and catches bugs before the interviewer does.

## The process

:::flow The 7 steps
1 · Clarify | restate the problem, ask about inputs, limits, edge cases
2 · Examples | work 1–2 small examples by hand, including a tricky one
3 · Brute force | say the simplest correct idea and its complexity
4 · Optimize | find the bottleneck; match a pattern; aim for the target complexity
5 · Plan | outline the approach and its time and space before typing
6 · Code | clean, named, modular; talk while you type
7 · Test | dry-run an example; check edge cases; fix; restate the complexity
:::

### Suggested timing (45-minute round)

| Minutes | Step |
|---|---|
| 0–5 | clarify + examples |
| 5–15 | brute force → optimized idea, agree on the plan |
| 15–35 | code |
| 35–42 | test, debug, complexity |
| 42–45 | follow-ups and your questions |

## Step 1: clarify (never skip it)

Questions worth asking, chosen for the problem:

- **Input:** sizes? (This decides the target complexity.) Value ranges? Negative numbers? Duplicates? Sorted? Empty input allowed?
- **Output:** return indices or values? Any valid answer, or a specific one? What if there's no answer?
- **Constraints:** can I modify the input? Memory limits? Is the data streamed?

:::interview
Restate the problem in your own words first: "So I get an unsorted array of up to 10⁵ integers, possibly negative, and I return the length of the longest subarray summing to k, or 0 if none exists. Is that right?" Misunderstanding the problem is the most expensive mistake you can make.
:::

## Steps 3–4: from brute force to optimal

Always **say** the brute force, even if you instantly see something better. It proves you can solve the problem, gives a baseline, and often points straight at the optimization.

To optimize, ask:

1. **What is the brute force repeating?** Recomputed sums lead to prefix sums. Repeated lookups lead to a hash map. Repeated subproblems lead to DP.
2. **What does the target complexity suggest?** $n \le 10^5$ means $O(n \log n)$: sorting, a heap, binary search. $O(n)$: hashing, two pointers, a window, a stack.
3. **Which pattern fits?** (See the *Pattern Recognition* lesson.) Sorted → two pointers or binary search. Contiguous → window or prefix sums. "Top k" → a heap. "All combinations" → backtracking. "Min/max over choices" → DP or greedy.
4. **Would a different data structure make the slow step fast?** Faster min → heap. Sorted with inserts → `set`. Membership → hash set. Range queries → prefix sums or a segment tree.

## Step 6: code like a professional

- Meaningful names (`left`, `windowSum`, `seen`), not `a`, `b`, `x2`.
- Helper functions for sub-steps (`isValid(r, c)`, `expand(l, r)`).
- Handle the edge cases at the top (`if (nums.empty()) return 0;`).
- **Narrate:** "I'm keeping a map from prefix sum to its first index, because I want the longest subarray…"
- Don't go silent for more than about a minute. If you're thinking, say what you're thinking about.

## Step 7: test before the interviewer does

Dry-run your code (not your idea) on a small example, line by line, tracking the variables. Then check the **edge-case checklist**:

| Category | Try |
|---|---|
| empty / tiny | `[]`, one element, two elements |
| extremes | all equal, all negative, already sorted, reversed |
| boundaries | answer at index 0, at the last index, no answer at all |
| overflow | values near $\pm 2^{31}$, products, sums of $10^5$ values up to $10^9$ |
| duplicates | repeated values, repeated answers |
| graphs and trees | disconnected, cycles, a single node, a skewed tree |

## When you're stuck

:::tip Unsticking strategies (try them in order)
1. **Solve a smaller case by hand** and watch what *you* do. That's your algorithm.
2. **Simplify the problem:** no duplicates, sorted input, one dimension. Solve that, then add the complexity back.
3. **Go through the pattern list:** could a hash map, two pointers, sorting, a heap, BFS, binary search on the answer or DP help?
4. **Work backwards** from the desired output, or look at the problem from the end (burst-last thinking).
5. **Ask for a hint gracefully:** "I'm deciding between X and Y. Am I on the right track?" Taking a hint and running with it is a positive signal.
:::

## A worked mock interview

> **Interviewer:** Given an array of integers and an integer `k`, return the length of the longest contiguous subarray whose sum equals `k`.

**Clarify:** "Can values be negative?" Yes. "n up to?" $2 \cdot 10^5$. "Return 0 if there's none?" Yes.

**Examples:** `[1, -1, 5, -2, 3], k = 3` → `[1, -1, 5, -2]` has sum 3 and length 4. Another one: `[-2, -1, 2, 1], k = 1` → `[-1, 2]`, length 2.

**Brute force:** "Every start, extend the end with a running sum: $O(n^2)$, which is about $4 \cdot 10^{10}$ steps, too slow."

**Optimize:** "Negative values rule out a sliding window, since a bigger window isn't always a bigger sum. Subarray sums are differences of prefix sums: $\text{sum}(l..r) = P[r+1] - P[l]$. For each `r` I want the **earliest** `l` with $P[l] = P[r+1] - k$. So I keep a map from prefix sum to the first index where it appeared: $O(n)$ time, $O(n)$ space."

**Code:**

```cpp run title="The final answer from the mock interview"
#include <bits/stdc++.h>
using namespace std;

int maxSubArrayLen(const vector<int>& nums, int k) {
    unordered_map<long long, int> firstIndex;      // prefix sum -> earliest index where it occurred
    firstIndex[0] = -1;                            // the empty prefix, so subarrays can start at 0
    long long prefix = 0;
    int best = 0;
    for (int i = 0; i < (int)nums.size(); i++) {
        prefix += nums[i];
        auto it = firstIndex.find(prefix - k);
        if (it != firstIndex.end()) best = max(best, i - it->second);
        firstIndex.emplace(prefix, i);             // emplace keeps the FIRST index (no overwrite)
    }
    return best;
}

int main() {
    cout << maxSubArrayLen({1, -1, 5, -2, 3}, 3) << ' ' << maxSubArrayLen({-2, -1, 2, 1}, 1) << ' '
         << maxSubArrayLen({1, 2, 3}, 7) << ' ' << maxSubArrayLen({}, 0) << '\n';
}
```

**Test:** a dry run on `[1, -1, 5, -2, 3], k = 3`. Prefix sums 1, 0, 5, 3, 6. At i = 3 the prefix is 3 and 3 − 3 = 0 was first seen at index −1, giving length 4. ✓ Edge cases: an empty array gives 0, no answer gives 0, and the sums are `long long` so they can't overflow.

**Complexity:** "$O(n)$ average time and $O(n)$ space. With an ordered map it would be $O(n \log n)$ worst case, if adversarial hashing is a concern."

:::keypoints
- Follow the same 7 steps every time: clarify → examples → brute force → optimize → plan → code → test.
- Read the constraints to choose the target complexity. Name the pattern you're using.
- Talk continuously, write clean, modular code, and dry-run your actual code.
- Use the edge-case checklist. If stuck: shrink the problem, simplify it, try the pattern list, or ask a focused question.
:::
