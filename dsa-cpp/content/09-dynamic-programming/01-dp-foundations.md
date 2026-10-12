---
title: Dynamic Programming — The Core Idea
level: intermediate
time: 55
summary: What makes a problem a DP problem (overlapping subproblems + optimal substructure), Fibonacci four ways (naive → memoized → tabulated → O(1) space) with a recursion-tree visualizer, the 5-step framework for any DP (state, transition, base case, order, answer), how to count DP complexity, top-down vs bottom-up, and the first classic problems.
---

Dynamic programming has a scary reputation, but the idea is simple: **if you're solving the same subproblem again and again, solve it once and remember the answer**. The real skill is choosing **what** to remember: the *state*. This module teaches a repeatable way to do that.

## When does DP apply?

:::def Overlapping subproblems
A naive recursive solution solves the **same smaller problems many times**. Naive Fibonacci computes `fib(3)` over and over.
:::

:::def Optimal substructure
The optimal answer for the whole problem can be **built from optimal answers to subproblems**. The shortest path to X through Y uses a shortest path to Y.
:::

:::def Dynamic programming
Solving a problem that has both properties by **storing each subproblem's answer** (in a table or a memo) so each one is computed only once.
:::

## Fibonacci, four ways

```viz algo=fib-recursion
```

Switch "Use memo?" to `yes` and watch the tree collapse from exponential to linear. Here are all four versions:

```cpp run level=easy title="Naive → memoized → tabulated → O(1) space"
#include <bits/stdc++.h>
using namespace std;

long long calls = 0;
long long naive(int n) { calls++; return n < 2 ? n : naive(n - 1) + naive(n - 2); }        // O(φ^n)

vector<long long> memo;
long long topDown(int n) {                                                               // O(n) time, O(n) space
    if (n < 2) return n;
    if (memo[n] != -1) return memo[n];                       // already solved: reuse
    return memo[n] = topDown(n - 1) + topDown(n - 2);
}

long long bottomUp(int n) {                                                              // O(n) time, O(n) space
    vector<long long> dp(max(2, n + 1));
    dp[0] = 0; dp[1] = 1;
    for (int i = 2; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2];   // smaller subproblems first
    return dp[n];
}

long long rolling(int n) {                                                               // O(n) time, O(1) space
    long long a = 0, b = 1;
    for (int i = 0; i < n; i++) { long long c = a + b; a = b; b = c; }
    return a;
}

int main() {
    int n = 32;
    long long r1 = naive(n);
    memo.assign(n + 1, -1);
    cout << "naive:     " << r1 << "  (" << calls << " calls!)\n";
    cout << "top-down:  " << topDown(n) << "  (" << n + 1 << " distinct subproblems)\n";
    cout << "bottom-up: " << bottomUp(n) << '\n';
    cout << "rolling:   " << rolling(n) << "  and fib(90) = " << rolling(90) << '\n';
}
```

| | Top-down (memoization) | Bottom-up (tabulation) |
|---|---|---|
| how | recursion + a cache | loops filling a table in dependency order |
| pros | easy to write from the recurrence; only computes the states you need | no recursion depth limit; faster; easy to reduce space |
| cons | recursion overhead; stack overflow on deep chains | you must work out a valid fill order |

:::tip In interviews
Start top-down: it follows the recurrence directly and is hard to get wrong. Then offer to convert it to bottom-up and save space. Interviewers love seeing that progression.
:::

## The 5-step DP framework

:::flow Solving any DP problem
1 · State | what does dp[i] (or dp[i][j]) mean? say it in words
2 · Transition | how does a state come from smaller states? (the recurrence)
3 · Base cases | the smallest states, answered directly
4 · Order | fill so dependencies are ready (or recurse + memo)
5 · Answer | which state (or max/min over states) is the result?
:::

### How to find the state

Ask: **"What do I need to know about the part I've already processed to make the rest of the decisions?"** Keep only that.

| Problem shape | Typical state |
|---|---|
| sequence / array, prefix decisions | `dp[i]` = best answer for the first `i` elements (or ending at `i`) |
| two sequences | `dp[i][j]` = answer for prefixes `a[0..i)`, `b[0..j)` |
| grid | `dp[r][c]` = answer for reaching cell `(r, c)` |
| capacity / budget | `dp[i][c]` = best using the first `i` items with capacity `c` |
| intervals | `dp[l][r]` = answer for the substring or subarray `[l..r]` |
| subsets (small n) | `dp[mask]` = answer for the set of chosen elements |
| extra situation | add a dimension: `dp[i][holding?]`, `dp[i][k transactions left]` |

### Complexity of a DP

$$\text{time} = (\text{number of states}) \times (\text{work per transition}), \qquad \text{space} = \text{number of states stored}$$

Fibonacci: $n$ states × $O(1)$ = $O(n)$. Edit distance: $nm$ states × $O(1)$ = $O(nm)$. LIS (simple version): $n$ states × $O(n)$ transition = $O(n^2)$.

## Problems

:::problem Climbing Stairs {level=easy lc=climbing-stairs tags="dynamic programming,1D"}
You can climb 1 or 2 steps at a time. How many distinct ways are there to reach step `n`?

Example: `n=3` → `3` (1+1+1, 1+2, 2+1).

:::hint Hint
State: `ways[i]` = the number of ways to reach step i. The last move was either 1 step (from i−1) or 2 steps (from i−2). Sound familiar?
:::

:::solution
1. **State:** `ways[i]` = the number of ways to reach step `i`.
2. **Transition:** `ways[i] = ways[i−1] + ways[i−2]` (the last move was 1 or 2 steps; these cases don't overlap).
3. **Base:** `ways[0] = 1` (do nothing), `ways[1] = 1`.
4. **Order:** increasing `i`.
5. **Answer:** `ways[n]`. It's Fibonacci shifted by one!

```cpp run
#include <bits/stdc++.h>
using namespace std;

int climbStairs(int n) {
    int a = 1, b = 1;                          // ways[0], ways[1]
    for (int i = 2; i <= n; i++) { int c = a + b; a = b; b = c; }
    return b;
}

int main() { for (int n : {1, 2, 3, 5, 10, 45}) cout << climbStairs(n) << ' '; cout << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Min Cost Climbing Stairs {level=easy lc=min-cost-climbing-stairs tags="dynamic programming,1D"}
`cost[i]` is the price of stepping on stair `i`. You can start on stair 0 or 1, and climb 1 or 2 steps at a time. Return the minimum cost to reach the top (just past the last stair).

Example: `[10,15,20]` → `15`.

:::hint Hint
`dp[i]` = the minimum cost to **arrive** at position i. You arrive from i−1 (paying `cost[i−1]`) or from i−2 (paying `cost[i−2]`).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minCostClimbingStairs(const vector<int>& cost) {
    int n = cost.size(), a = 0, b = 0;           // dp[0] = dp[1] = 0: starting there is free
    for (int i = 2; i <= n; i++) {
        int c = min(b + cost[i - 1], a + cost[i - 2]);
        a = b; b = c;
    }
    return b;
}

int main() { cout << minCostClimbingStairs({10, 15, 20}) << ' ' << minCostClimbingStairs({1, 100, 1, 1, 1, 100, 1, 1, 100, 1}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem N-th Tribonacci Number {level=easy lc=n-th-tribonacci-number tags="dynamic programming"}
`T0 = 0, T1 = 1, T2 = 1`, and `T(n+3) = T(n) + T(n+1) + T(n+2)`. Return `T(n)`.

:::hint Hint
Roll three variables forward.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int tribonacci(int n) {
    if (n == 0) return 0;
    int a = 0, b = 1, c = 1;
    for (int i = 3; i <= n; i++) { int d = a + b + c; a = b; b = c; c = d; }
    return c;
}

int main() { cout << tribonacci(4) << ' ' << tribonacci(25) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

## Check yourself

```quiz
? Which two properties make a problem suitable for DP?
+ Overlapping subproblems and optimal substructure
- Sorted input and small n
- Recursion and a hash map
> Repeated subproblems + optimal answers built from optimal sub-answers.

? A DP has n·m states and each transition loops over k options. Its time is…
+ O(n·m·k)
- O(n + m + k)
- O(n·m)
> States × work per transition.

? An advantage of bottom-up over top-down is…
+ No recursion depth limit, and it's easier to reduce space
- It always computes fewer states
- It's always easier to write
> Top-down only computes the reachable states, which can be fewer.
```

:::keypoints
- DP = recursion with overlapping subproblems + caching. Exponential becomes polynomial.
- The 5 steps: **state, transition, base cases, order, answer**. Say the state in words.
- Complexity = #states × transition cost. Space can often shrink to the last row or the last few values.
- Write it top-down from the recurrence first, then convert to bottom-up if needed.
:::
