---
title: Binary Search on the Answer
level: advanced
time: 55
summary: When the answer is a number and "is X good enough?" is monotone, binary-search over the answer itself — the recipe, how to pick bounds, feasibility checks, searching on real numbers, and six classic problems from Sqrt(x) and Koko Eating Bananas to Split Array Largest Sum and Median of Two Sorted Arrays.
---

Some of the hardest-looking problems ("minimize the maximum…", "the smallest capacity such that…") have a surprisingly simple solution: **guess the answer and check it**. If checking is cheap and the answer space is monotone, binary search finds the best guess in $O(\log(\text{range}))$ checks.

## The recipe

:::flow Binary search on the answer
Spot it | "minimize the max" / "maximize the min" / "smallest X such that…"
Feasibility check | write `ok(x)`: can we achieve the goal with value x? usually a greedy O(n) pass
Monotone? | if x works, does every bigger x work too? (or every smaller one)
Bounds | lo = a value that's surely too small or just right, hi = one that surely works
Search | find the first x with ok(x) = true
:::

:::def Feasibility function
A function `ok(x)` that answers "can the task be done if the answer is `x`?". If `ok` is monotone (false…false, true…true), the optimal answer is the boundary, which binary search finds.
:::

:::pattern
Signals in the problem statement:
- "**minimum** possible **maximum**" or "**maximum** possible **minimum**"
- "smallest speed / capacity / days / size such that…"
- The answer is an integer in a huge range (up to $10^9$), but checking one candidate is easy.
- Constraints of about $n \le 10^5$, with values up to $10^9$: about $n \log(\text{range}) \approx 3 \cdot 10^6$ operations.
:::

The total complexity is $O(\text{cost of ok} \times \log(hi - lo))$. With `ok` in $O(n)$ and a range of $10^9$, that's about $30n$.

## Problems

:::problem Sqrt(x) {level=easy lc=sqrtx tags="binary search on answer,math"}
Return $\lfloor \sqrt{x} \rfloor$ for a non-negative int `x`, without library functions.

:::hint Hint
Find the **last** `k` with `k*k <= x`, i.e. (the first `k` with `k*k > x`) − 1. Use `long long` for `k*k`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int mySqrt(int x) {
    long long lo = 0, hi = (long long)x + 1;          // first k with k*k > x lies in [0, x+1]
    while (lo < hi) {
        long long mid = lo + (hi - lo) / 2;
        if (mid * mid > x) hi = mid; else lo = mid + 1;
    }
    return lo - 1;
}

int main() { for (int x : {0, 1, 4, 8, 15, 16, INT_MAX}) cout << mySqrt(x) << ' '; cout << '\n'; }
```

:::complexity
Time | O(\log x) |
Space | O(1) |
:::

Newton's method, $k \leftarrow (k + x/k)/2$, converges even faster (quadratically). It's a good thing to mention.
:::
:::

:::problem Koko Eating Bananas {level=medium lc=koko-eating-bananas tags="binary search on answer"}
There are piles of bananas, and Koko has `h` hours. Each hour she picks one pile and eats up to `k` bananas from it. Find the **minimum** integer speed `k` that lets her finish everything within `h` hours.

Example: `piles=[3,6,7,11], h=8` → `4`.

:::hint Hint 1
At speed `k`, a pile `p` takes `ceil(p / k)` hours. Faster never takes longer, so `ok(k)` is monotone.
:::

:::hint Hint 2
Bounds: `k = 1` is the slowest; `k = max(piles)` always works (one hour per pile).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minEatingSpeed(const vector<int>& piles, int h) {
    auto ok = [&](int k) {
        long long hours = 0;
        for (int p : piles) hours += (p + k - 1) / k;     // ceil(p / k)
        return hours <= h;
    };
    int lo = 1, hi = *max_element(piles.begin(), piles.end());
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (ok(mid)) hi = mid; else lo = mid + 1;
    }
    return lo;
}

int main() { cout << minEatingSpeed({3, 6, 7, 11}, 8) << ' ' << minEatingSpeed({30, 11, 23, 4, 20}, 5) << ' ' << minEatingSpeed({30, 11, 23, 4, 20}, 6) << '\n'; }
```

:::complexity
Time | O(n \log M) | M = max pile
Space | O(1) |
:::
:::
:::

:::problem Capacity To Ship Packages Within D Days {level=medium lc=capacity-to-ship-packages-within-d-days tags="binary search on answer,greedy"}
Packages must be shipped **in the given order**. Each day the ship loads packages up to its capacity. Find the minimum capacity that ships everything within `days` days.

Example: `[1,2,3,4,5,6,7,8,9,10], days=5` → `15`.

:::hint Hint 1
Given a capacity, greedily fill each day as much as possible. Does that give the minimum number of days?
:::

:::hint Hint 2
Bounds: the capacity must be at least `max(w)` (the heaviest package must fit) and never needs more than `sum(w)` (ship everything in one day).
:::

:::solution
Greedy packing is optimal for a fixed capacity: delaying a package to the next day never helps. So `daysNeeded(cap)` is exact, and it's non-increasing in `cap`.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int shipWithinDays(const vector<int>& w, int days) {
    auto daysNeeded = [&](int cap) {
        int d = 1, load = 0;
        for (int x : w) {
            if (load + x > cap) { d++; load = 0; }
            load += x;
        }
        return d;
    };
    int lo = *max_element(w.begin(), w.end()), hi = accumulate(w.begin(), w.end(), 0);
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (daysNeeded(mid) <= days) hi = mid; else lo = mid + 1;
    }
    return lo;
}

int main() { cout << shipWithinDays({1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, 5) << ' ' << shipWithinDays({3, 2, 2, 4, 1, 4}, 3) << ' ' << shipWithinDays({1, 2, 3, 1, 1}, 4) << '\n'; }
```

:::complexity
Time | O(n \log S) | S = sum of weights
Space | O(1) |
:::
:::
:::

:::problem Split Array Largest Sum {level=hard lc=split-array-largest-sum tags="binary search on answer,greedy"}
Split `nums` (non-negative) into `k` non-empty contiguous subarrays so that the **largest subarray sum is as small as possible**. Return that minimized largest sum.

Example: `[7,2,5,10,8], k=2` → `18` (`[7,2,5] | [10,8]`).

:::hint Hint
"Minimize the maximum" is the signal. Guess the max sum `S`: greedily cut whenever the running sum would exceed `S`, and count the pieces. Fewer than or equal to `k` pieces means `S` is achievable. It's the same as the shipping problem.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int splitArray(const vector<int>& a, int k) {
    auto pieces = [&](long long S) {
        int p = 1; long long cur = 0;
        for (int x : a) { if (cur + x > S) { p++; cur = 0; } cur += x; }
        return p;
    };
    long long lo = *max_element(a.begin(), a.end()), hi = accumulate(a.begin(), a.end(), 0LL);
    while (lo < hi) {
        long long mid = lo + (hi - lo) / 2;
        if (pieces(mid) <= k) hi = mid; else lo = mid + 1;
    }
    return (int)lo;
}

int main() { cout << splitArray({7, 2, 5, 10, 8}, 2) << ' ' << splitArray({1, 2, 3, 4, 5}, 2) << ' ' << splitArray({1, 4, 4}, 3) << '\n'; }
```

:::complexity
Time | O(n \log S) |
Space | O(1) |
:::

Why is "≤ k pieces" enough when we need **exactly** k? Any split into fewer pieces can be refined, by splitting a piece further, without increasing the maximum (all values are non-negative and each piece stays non-empty as long as $k \le n$). This problem also has an $O(k n^2)$ DP solution. Binary search on the answer is far faster.
:::
:::

:::problem Minimum Number of Days to Make m Bouquets {level=medium lc=minimum-number-of-days-to-make-m-bouquets tags="binary search on answer"}
`bloomDay[i]` is the day flower `i` blooms. A bouquet needs `k` **adjacent** bloomed flowers. Return the minimum day on which you can make `m` bouquets, or `-1`.

Example: `bloomDay=[1,10,3,10,2], m=3, k=1` → `3`.

:::hint Hint
On day `D`, scan left to right, counting runs of bloomed flowers (`bloomDay[i] ≤ D`). Each full run of `k` makes one bouquet. Waiting longer never hurts, so `ok(D)` is monotone.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minDays(const vector<int>& bloom, int m, int k) {
    if ((long long)m * k > (long long)bloom.size()) return -1;
    auto ok = [&](int D) {
        int bouquets = 0, run = 0;
        for (int b : bloom) {
            run = (b <= D) ? run + 1 : 0;
            if (run == k) { bouquets++; run = 0; }
        }
        return bouquets >= m;
    };
    int lo = *min_element(bloom.begin(), bloom.end()), hi = *max_element(bloom.begin(), bloom.end());
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (ok(mid)) hi = mid; else lo = mid + 1;
    }
    return lo;
}

int main() { cout << minDays({1, 10, 3, 10, 2}, 3, 1) << ' ' << minDays({1, 10, 3, 10, 2}, 3, 2) << ' ' << minDays({7, 7, 7, 7, 12, 7, 7}, 2, 3) << '\n'; }
```

:::complexity
Time | O(n \log D) | D = max bloom day
Space | O(1) |
:::
:::
:::

:::problem Median of Two Sorted Arrays {level=hard lc=median-of-two-sorted-arrays tags="binary search,partition"}
Return the median of two sorted arrays `A` (size m) and `B` (size n) in $O(\log(\min(m, n)))$.

Example: `[1,3], [2]` → `2.0`; `[1,2], [3,4]` → `2.5`.

:::hint Hint 1
The median splits the combined array into two halves of equal size, with every element on the left ≤ every element on the right. Choose how many elements `i` come from `A` for the left half. Then `j = (m + n + 1)/2 − i` come from `B`.
:::

:::hint Hint 2
A partition is valid when `A[i-1] ≤ B[j]` and `B[j-1] ≤ A[i]`. If `A[i-1] > B[j]`, then `i` is too big. Binary-search `i` over `[0, m]`, using the smaller array as `A`.
:::

:::solution
Binary search over the **partition point** in the shorter array. Use ±∞ sentinels for empty sides.

```cpp run
#include <bits/stdc++.h>
using namespace std;

double findMedianSortedArrays(const vector<int>& A0, const vector<int>& B0) {
    const vector<int>& A = A0.size() <= B0.size() ? A0 : B0;
    const vector<int>& B = A0.size() <= B0.size() ? B0 : A0;
    int m = A.size(), n = B.size(), half = (m + n + 1) / 2;
    int lo = 0, hi = m;
    while (lo <= hi) {
        int i = lo + (hi - lo) / 2, j = half - i;             // i from A, j from B on the left
        int Aleft  = i > 0 ? A[i - 1] : INT_MIN, Aright = i < m ? A[i] : INT_MAX;
        int Bleft  = j > 0 ? B[j - 1] : INT_MIN, Bright = j < n ? B[j] : INT_MAX;
        if (Aleft <= Bright && Bleft <= Aright) {             // a valid partition
            if ((m + n) % 2) return max(Aleft, Bleft);
            return (max(Aleft, Bleft) + (double)min(Aright, Bright)) / 2.0;
        }
        if (Aleft > Bright) hi = i - 1;                       // took too many from A
        else lo = i + 1;                                      // took too few from A
    }
    return 0;                                                 // unreachable for valid input
}

int main() {
    cout << findMedianSortedArrays({1, 3}, {2}) << ' ' << findMedianSortedArrays({1, 2}, {3, 4}) << ' '
         << findMedianSortedArrays({}, {1}) << ' ' << findMedianSortedArrays({1, 2, 3, 4, 5}, {6, 7}) << '\n';
}
```

:::complexity
Time | O(\log \min(m, n)) |
Space | O(1) |
:::

The simpler $O(m + n)$ merge-and-count solution is a fine first answer in an interview. Then explain that the partition idea gets the logarithmic bound.
:::
:::

## Binary search on real numbers

When the answer is a real number (a geometric distance, a ratio), you can't search for the "first true" exactly. **Run a fixed number of iterations** instead (100 halvings shrink any range below double precision):

```cpp run level=intermediate title="Cube root by bisection"
#include <bits/stdc++.h>
using namespace std;

int main() {
    double x = 10.0, lo = 0, hi = max(1.0, x);
    for (int it = 0; it < 100; it++) {               // no while (hi - lo > eps): rounding can make it loop forever
        double mid = (lo + hi) / 2;
        if (mid * mid * mid < x) lo = mid; else hi = mid;
    }
    cout << fixed << setprecision(10) << "cbrt(10) = " << lo << "  (std::cbrt: " << cbrt(x) << ")\n";
}
```

## Check yourself

```quiz
? Which phrase most strongly suggests binary search on the answer?
+ "Minimize the largest sum"
- "Count all subarrays"
- "Return all permutations"
> Minimize the maximum / maximize the minimum.

? In Capacity To Ship Packages, why is lo = max(weights)?
+ Any smaller capacity can't carry the heaviest package
- It's an arbitrary safe choice
- Because the answer is always the maximum
> Bounds must contain the answer: lo might work, hi surely works.

? ok(x) costs O(n) and the answer range is up to 10⁹. The total is about…
+ 30·n
- n·10⁹
- n²
> log₂(10⁹) ≈ 30 iterations.
```

:::keypoints
- If "can we achieve it with value x?" is monotone in x, binary-search x. Cost = $O(\text{check} \cdot \log \text{range})$.
- Feasibility checks are usually greedy linear passes (pack, cut, count).
- Choose bounds that bracket the answer: the smallest conceivable value and one that surely works.
- Real-valued answers: a fixed number of iterations, not an epsilon loop.
- Median of two sorted arrays: binary-search the partition of the shorter array.
:::
