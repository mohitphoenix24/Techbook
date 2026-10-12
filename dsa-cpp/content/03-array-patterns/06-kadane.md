---
title: Kadane's Algorithm & Subarray Optimization
level: intermediate
time: 40
summary: The maximum subarray problem solved four ways (brute force, prefix sums, divide and conquer, Kadane), Kadane derived as a one-line dynamic program with its correctness proof, and the classic variants — maximum product subarray, circular subarrays, and stock profit as a maximum subarray of differences.
---

"Find the contiguous subarray with the largest sum" is one of the most famous interview problems. Its best solution, **Kadane's algorithm**, is also the gentlest introduction to dynamic programming.

## Four solutions, from slow to fast

| Approach | Idea | Time |
|---|---|---|
| Brute force | try every `[l, r]`, sum it | $O(n^3)$ |
| Running sums | fix `l`, extend `r` while adding | $O(n^2)$ |
| Divide and conquer | best = max(left half, right half, best crossing the middle) | $O(n \log n)$ |
| **Kadane** | best subarray **ending at each `i`** | $O(n)$ |

## Deriving Kadane

:::def State: best ending here
Let $\text{cur}[i]$ = the largest sum of a subarray that **ends exactly at index $i$**. The overall answer is $\max_i \text{cur}[i]$, because every subarray ends somewhere.
:::

:::derive The recurrence
\text{a subarray ending at } i \text{ is either } [a_i] \text{ alone,} || start fresh at i
\text{or (a subarray ending at } i-1) \text{ extended by } a_i || extend the previous one
\text{cur}[i] = \max\big(a_i,\; \text{cur}[i-1] + a_i\big) || take the better of the two
= a_i + \max(0,\; \text{cur}[i-1]) || a negative prefix only hurts: drop it
! \text{answer} = \max_i \text{cur}[i], \quad O(n) \text{ time, } O(1) \text{ space} || only cur[i−1] is needed
:::

```viz algo=kadane
```

:::proof Why Kadane is correct
By induction on $i$: assume $\text{cur}[i-1]$ is the best sum ending at $i-1$. Any subarray ending at $i$ is either $[i..i]$, with sum $a_i$, or $[j..i]$ for some $j < i$, with sum $(\text{sum of } [j..i-1]) + a_i \le \text{cur}[i-1] + a_i$. So the best ending at $i$ is exactly $\max(a_i, \text{cur}[i-1] + a_i)$. The optimal subarray ends at some index $i^*$, and $\text{cur}[i^*]$ equals its sum, so the overall maximum finds it.
:::

:::tip This is dynamic programming
"Best answer ending at `i`, built from the best answer ending at `i−1`" is exactly the DP mindset: define a **state**, find a **transition**, keep only what you need. You'll see this shape again and again in Module 9.
:::

## Problems

:::problem Maximum Subarray {level=medium lc=maximum-subarray tags="Kadane,dynamic programming,divide and conquer"}
Return the largest sum of a non-empty contiguous subarray.

Example: `[-2,1,-3,4,-1,2,1,-5,4]` → `6` (`[4,-1,2,1]`).

:::hint Hint
For each index, decide: extend the previous run or start fresh here?
:::

:::solution
Kadane, plus the indexes of the best subarray. The divide-and-conquer version is included because interviewers sometimes ask for it as a follow-up.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxSubArray(const vector<int>& a, int& bestL, int& bestR) {
    int cur = a[0], best = a[0], start = 0;
    bestL = bestR = 0;
    for (int i = 1; i < (int)a.size(); i++) {
        if (cur < 0) { cur = a[i]; start = i; }      // the previous run only hurts: restart
        else cur += a[i];
        if (cur > best) { best = cur; bestL = start; bestR = i; }
    }
    return best;
}

// Divide and conquer: T(n) = 2T(n/2) + O(n) = O(n log n)
int dc(const vector<int>& a, int l, int r) {
    if (l == r) return a[l];
    int m = (l + r) / 2;
    int leftBest = INT_MIN, s = 0;
    for (int i = m; i >= l; i--) { s += a[i]; leftBest = max(leftBest, s); }       // best ending at m
    int rightBest = INT_MIN; s = 0;
    for (int i = m + 1; i <= r; i++) { s += a[i]; rightBest = max(rightBest, s); }  // best starting at m+1
    return max({dc(a, l, m), dc(a, m + 1, r), leftBest + rightBest});
}

int main() {
    vector<int> a = {-2, 1, -3, 4, -1, 2, 1, -5, 4};
    int L, R;
    cout << "Kadane: " << maxSubArray(a, L, R) << " on [" << L << ".." << R << "]\n";
    cout << "D&C:    " << dc(a, 0, a.size() - 1) << '\n';
    vector<int> neg = {-3, -1, -2};
    cout << "all negative: " << maxSubArray(neg, L, R) << " (the least negative single element)\n";
}
```

:::complexity
Time | O(n) | Kadane; O(n log n) divide and conquer
Space | O(1) |
:::

:::warn Don't start best at 0
Initializing `best = 0` returns 0 for an all-negative array, but the subarray must be **non-empty**. Start from `a[0]`.
:::
:::
:::

:::problem Maximum Product Subarray {level=medium lc=maximum-product-subarray tags="Kadane,dynamic programming"}
Return the largest product of a contiguous subarray.

Example: `[2,3,-2,4]` → `6`; `[-2,3,-4]` → `24`.

:::hint Hint 1
A negative number turns the **smallest** (most negative) product into the largest one. So tracking only the maximum isn't enough.
:::

:::hint Hint 2
Track both `maxEnd` and `minEnd` (the largest and smallest product ending here). When `a[i] < 0`, they swap roles.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxProduct(const vector<int>& a) {
    long long hi = a[0], lo = a[0], best = a[0];
    for (int i = 1; i < (int)a.size(); i++) {
        long long x = a[i];
        if (x < 0) swap(hi, lo);                 // multiplying by a negative flips max and min
        hi = max(x, hi * x);
        lo = min(x, lo * x);
        best = max(best, hi);
    }
    return (int)best;
}

int main() { cout << maxProduct({2, 3, -2, 4}) << ' ' << maxProduct({-2, 0, -1}) << ' ' << maxProduct({-2, 3, -4}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::

A zero resets both to the fresh start `x = 0`, which correctly splits the array into independent pieces.
:::
:::

:::problem Maximum Sum Circular Subarray {level=medium lc=maximum-sum-circular-subarray tags="Kadane"}
The array is circular: the end wraps around to the start. Return the maximum sum of a non-empty subarray.

Example: `[5,-3,5]` → `10` (`5 + 5`, wrapping around).

:::hint Hint 1
The best subarray either doesn't wrap (plain Kadane) or does wrap. A wrapping subarray is the **whole array minus a middle part**.
:::

:::hint Hint 2
Max wrapping sum = total − (minimum subarray sum). Watch out: if every number is negative, the "minimum subarray" is the whole array, and that would leave an empty subarray.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxSubarraySumCircular(const vector<int>& a) {
    int total = 0, curMax = 0, bestMax = INT_MIN, curMin = 0, bestMin = INT_MAX;
    for (int x : a) {
        total += x;
        curMax = max(x, curMax + x); bestMax = max(bestMax, curMax);
        curMin = min(x, curMin + x); bestMin = min(bestMin, curMin);
    }
    if (bestMax < 0) return bestMax;                 // all negative: wrapping would be empty
    return max(bestMax, total - bestMin);
}

int main() { cout << maxSubarraySumCircular({1, -2, 3, -2}) << ' ' << maxSubarraySumCircular({5, -3, 5}) << ' ' << maxSubarraySumCircular({-3, -2, -3}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Best Time to Buy and Sell Stock (as Kadane) {level=easy id=stock-kadane lc=best-time-to-buy-and-sell-stock tags="Kadane,reduction"}
Re-solve the stock problem from the Array Fundamentals lesson by **reducing it** to maximum subarray.

:::hint Hint
The profit of buying on day `i` and selling on day `j` is $\sum_{t=i+1}^{j} (p_t - p_{t-1})$: a subarray sum of the **daily differences**.
:::

:::solution
Run Kadane on the differences, with the empty subarray allowed (profit 0).

```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxProfit(const vector<int>& p) {
    int cur = 0, best = 0;
    for (int i = 1; i < (int)p.size(); i++) {
        cur = max(0, cur + p[i] - p[i - 1]);   // best "run of differences" ending today
        best = max(best, cur);
    }
    return best;
}

int main() { cout << maxProfit({7, 1, 5, 3, 6, 4}) << ' ' << maxProfit({7, 6, 4, 3, 1}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::

Recognizing a **reduction** ("this is just X in disguise") is a top interview skill. Telescoping sums turn price pairs into subarrays.
:::
:::

## Check yourself

```quiz
? Kadane's state cur[i] means…
+ The best sum of a subarray that ends exactly at index i
- The best sum of any subarray within a[0..i]
- The sum of a[0..i]
> "Ends here" is what makes the transition simple.

? For maximum PRODUCT subarray, why track the minimum too?
+ A negative number turns the most negative product into the largest
- To handle zeros only
- It isn't needed
> max and min swap roles when multiplying by a negative.

? All numbers are negative. Kadane (initialized from a[0]) returns…
+ The largest (least negative) single element
- 0
- The sum of the array
> The subarray must be non-empty.
```

:::keypoints
- Kadane: $\text{cur} = \max(a_i, \text{cur} + a_i)$, $\text{best} = \max(\text{best}, \text{cur})$, giving $O(n)$ time and $O(1)$ space. Initialize from `a[0]`.
- It's a DP with state "best ending at i". The proof is a one-line induction.
- Product: track max and min. Circular: max(Kadane, total − min subarray), with the all-negative guard.
- Many problems reduce to maximum subarray (stock profit = max subarray of differences).
:::
