---
title: The Knapsack Family
level: advanced
time: 60
summary: 0/1 knapsack from the take-or-skip recurrence to a 1D array (and why the capacity loop must run backwards), unbounded knapsack (forwards), why O(n·W) is only pseudo-polynomial, and the many problems that are knapsack in disguise — Partition Equal Subset Sum, Target Sum, Last Stone Weight II, and 2D-capacity Ones and Zeroes.
---

"Choose a subset of items, within a budget, to maximize value or hit a target exactly" is the **knapsack** pattern. Once you recognise it, a surprising number of problems become one recurrence and two loops.

## 0/1 knapsack

$n$ items with weights $w_i$ and values $v_i$, and a capacity $W$. Each item is taken **at most once**. Maximize the total value.

:::derive The recurrence
dp[i][c] = \text{best value using items } 1..i \text{ with capacity } c || the state
\text{skip item } i: \; dp[i-1][c] || same capacity, one fewer item
\text{take item } i \;(w_i \le c): \; dp[i-1][c - w_i] + v_i || pay its weight, gain its value
dp[i][c] = \max\big(dp[i-1][c],\; dp[i-1][c-w_i] + v_i\big) || take the better choice
! \text{answer } dp[n][W], \quad O(nW) \text{ time} || base: dp[0][c] = 0
:::

```viz algo=knapsack
```

### Going from 2D to 1D: iterate the capacity backwards

Row `i` only reads row `i−1`. With one array, update `c` from **high to low**. Then `dp[c − w]` still holds the **previous row's** value, so the item is used at most once.

```cpp run level=intermediate title="0/1 knapsack: 2D table vs 1D backwards"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> w = {3, 4, 6}, v = {5, 6, 9};
    int W = 8, n = w.size();                          // 0/1 best: items 3+4 -> value 11

    vector<vector<int>> dp2(n + 1, vector<int>(W + 1, 0));
    for (int i = 1; i <= n; i++)
        for (int c = 0; c <= W; c++) {
            dp2[i][c] = dp2[i - 1][c];
            if (w[i - 1] <= c) dp2[i][c] = max(dp2[i][c], dp2[i - 1][c - w[i - 1]] + v[i - 1]);
        }

    vector<int> dp(W + 1, 0);
    for (int i = 0; i < n; i++)
        for (int c = W; c >= w[i]; c--)                 // BACKWARDS: dp[c - w] is still from the old row
            dp[c] = max(dp[c], dp[c - w[i]] + v[i]);

    vector<int> wrong(W + 1, 0);
    for (int i = 0; i < n; i++)
        for (int c = w[i]; c <= W; c++)                 // forwards: dp[c - w] may already include item i
            wrong[c] = max(wrong[c], wrong[c - w[i]] + v[i]);

    cout << "2D: " << dp2[n][W] << ", 1D backwards: " << dp[W] << ", 1D forwards (wrong for 0/1): " << wrong[W] << '\n';
}
```

:::warn The direction is the whole difference
Forwards, `dp[c − w]` may already include the current item, so the item can be used again and again. That's **unbounded** knapsack. Backwards, every item is used at most once: **0/1** knapsack. Getting this wrong is the #1 knapsack bug.
:::

## Unbounded knapsack

Each item can be used **any number of times**: same code, but **forwards**. Coin Change (fewest coins) and Coin Change II (count combinations) are unbounded knapsacks.

## Why O(nW) is "pseudo-polynomial"

:::def Pseudo-polynomial time
A running time that is polynomial in the **numeric value** of the input (here $W$), but exponential in its **size in bits**. $W$ takes only $\log_2 W$ bits to write down, so $O(nW) = O(n \cdot 2^{\text{bits}})$.
:::

So knapsack is fast when $W$ is small (up to ~$10^6$–$10^7$), and hopeless when $W = 10^{18}$. 0/1 knapsack is **NP-hard** in general: no known algorithm is polynomial in the bit size of the input. Mentioning this in an interview signals real depth.

## Recognising knapsack in disguise

| Problem | Items | Capacity | Question |
|---|---|---|---|
| Partition Equal Subset Sum | numbers | total / 2 | can a subset hit it exactly? (boolean) |
| Target Sum | numbers | derived target | how many sign choices? (count) |
| Last Stone Weight II | stones | total / 2 | the closest reachable subset sum |
| Ones and Zeroes | strings | (zeros, ones) | max items within a **2D** capacity |
| Coin Change | coins (unlimited) | amount | min count (unbounded) |

## Problems

:::problem Partition Equal Subset Sum {level=medium lc=partition-equal-subset-sum tags="knapsack,subset sum"}
Can the array be split into two subsets with equal sums?

Example: `[1,5,11,5]` → `true` (`{1,5,5}` and `{11}`).

:::hint Hint
If the total is odd, no. Otherwise: is there a subset summing to `total/2`? That's a boolean 0/1 knapsack, so iterate the capacity backwards.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool canPartition(const vector<int>& a) {
    int total = accumulate(a.begin(), a.end(), 0);
    if (total % 2) return false;
    int T = total / 2;
    vector<bool> can(T + 1, false);
    can[0] = true;
    for (int x : a)
        for (int s = T; s >= x; s--)               // 0/1: backwards
            if (can[s - x]) can[s] = true;
    return can[T];
}

int main() { cout << boolalpha << canPartition({1, 5, 11, 5}) << ' ' << canPartition({1, 2, 3, 5}) << '\n'; }
```

:::complexity
Time | O(n \cdot S) | S = sum / 2
Space | O(S) | a bitset version (OR-shift by x) runs about 64× faster
:::
:::
:::

:::problem Target Sum {level=medium lc=target-sum tags="knapsack,counting,math"}
Put `+` or `−` in front of each number. Count the expressions that evaluate to `target`.

Example: `[1,1,1,1,1], target=3` → `5`.

:::hint Hint
Let P be the sum of the `+` numbers and N the sum of the `−` numbers. Then P − N = target and P + N = total, so P = (total + target) / 2. Count the subsets with sum P.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findTargetSumWays(const vector<int>& a, int target) {
    int total = accumulate(a.begin(), a.end(), 0);
    if (abs(target) > total || (total + target) % 2) return 0;
    int P = (total + target) / 2;
    vector<int> ways(P + 1, 0);
    ways[0] = 1;
    for (int x : a)
        for (int s = P; s >= x; s--) ways[s] += ways[s - x];    // counting 0/1 knapsack
    return ways[P];
}

int main() { cout << findTargetSumWays({1, 1, 1, 1, 1}, 3) << ' ' << findTargetSumWays({1}, 1) << ' ' << findTargetSumWays({0, 0, 1}, 1) << '\n'; }
```

:::derive Turning signs into a subset sum
P - N = \text{target} || the + group minus the − group
P + N = \text{total} || every number is in one group
2P = \text{total} + \text{target} || add the two equations
! P = \frac{\text{total} + \text{target}}{2} \text{ (must be an integer} \ge 0) || count the subsets that sum to P
:::

:::complexity
Time | O(n \cdot P) |
Space | O(P) |
:::

Zeros are handled correctly: each zero doubles the count, because it can join either group.
:::
:::

:::problem Last Stone Weight II {level=medium lc=last-stone-weight-ii tags="knapsack,subset sum"}
Smash stones in pairs: two stones x ≤ y become y − x. Return the smallest possible weight of the final stone (0 if none is left).

Example: `[2,7,4,1,8,1]` → `1`.

:::hint Hint
However you smash them, the final weight equals |S1 − S2| for some split of the stones into two groups (one group gets +, the other −). So minimize |total − 2·S1|: find the reachable subset sum closest to total/2.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int lastStoneWeightII(const vector<int>& s) {
    int total = accumulate(s.begin(), s.end(), 0), half = total / 2;
    vector<bool> can(half + 1, false);
    can[0] = true;
    for (int x : s) for (int t = half; t >= x; t--) if (can[t - x]) can[t] = true;
    for (int t = half; t >= 0; t--) if (can[t]) return total - 2 * t;
    return total;
}

int main() { cout << lastStoneWeightII({2, 7, 4, 1, 8, 1}) << ' ' << lastStoneWeightII({31, 26, 33, 21, 40}) << '\n'; }
```

:::complexity
Time | O(n \cdot S) |
Space | O(S) |
:::
:::
:::

:::problem Ones and Zeroes {level=medium lc=ones-and-zeroes tags="knapsack,2D capacity"}
Each binary string costs (#zeros, #ones). Choose the largest number of strings using at most `m` zeros and `n` ones in total.

Example: `["10","0001","111001","1","0"], m=5, n=3` → `4`.

:::hint Hint
0/1 knapsack with a **two-dimensional** capacity: `dp[z][o]`. Value = 1 per string. Iterate both capacities backwards.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findMaxForm(const vector<string>& strs, int m, int n) {
    vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0));
    for (auto& s : strs) {
        int z = count(s.begin(), s.end(), '0'), o = s.size() - z;
        for (int i = m; i >= z; i--)                        // both backwards: 0/1
            for (int j = n; j >= o; j--)
                dp[i][j] = max(dp[i][j], dp[i - z][j - o] + 1);
    }
    return dp[m][n];
}

int main() { cout << findMaxForm({"10", "0001", "111001", "1", "0"}, 5, 3) << ' ' << findMaxForm({"10", "0", "1"}, 1, 1) << '\n'; }
```

:::complexity
Time | O(L \cdot m \cdot n) | L strings
Space | O(m \cdot n) |
:::
:::
:::

## Check yourself

```quiz
? In 1D 0/1 knapsack, why must the capacity loop go from high to low?
+ So dp[c − w] still holds the previous item's row, and the item isn't reused
- To make it faster
- Because the weights are sorted
> Forwards would allow unlimited copies (unbounded knapsack).

? Why is O(n·W) called pseudo-polynomial?
+ It's polynomial in W's value but exponential in the number of bits needed to write W
- Because it uses DP
- Because n and W are both inputs
> W = 2^bits.

? Target Sum reduces to counting subsets with sum…
+ (total + target) / 2
- target / 2
- total − target
> From P − N = target and P + N = total.
```

:::keypoints
- 0/1 knapsack: `dp[c] = max(dp[c], dp[c−w] + v)` with c going **down**. Unbounded: the same with c going **up**.
- The state is (items considered, capacity). Boolean, count, min and max versions all share the same loops.
- $O(nW)$ is pseudo-polynomial; general 0/1 knapsack is NP-hard.
- Disguises: equal partition, target sum (sign algebra), closest split (stones), multi-dimensional capacities.
:::
