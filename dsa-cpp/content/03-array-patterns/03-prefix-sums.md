---
title: Prefix Sums & Difference Arrays
level: intermediate
time: 50
summary: Precompute once, answer range questions in O(1) — 1D prefix sums, 2D prefix sums (with the inclusion–exclusion derivation), difference arrays for range updates, prefix products, and the powerful "prefix sum + hash map" trick for counting subarrays with a given sum.
---

"Sum of `a[l..r]`" can be answered in $O(r - l)$ by looping, or in **$O(1)$** after an $O(n)$ precomputation. The same idea extends to 2D grids, to range **updates**, and to counting subarrays. It's one of the highest-value patterns in interviews.

## 1D prefix sums

:::def Prefix sum array
$P[0] = 0$ and $P[i] = a[0] + a[1] + \cdots + a[i-1]$. So $P$ has $n + 1$ entries, and $P[i]$ is the sum of the first $i$ elements.
:::

:::derive Range sum in O(1)
P[r+1] = a[0] + \cdots + a[l-1] + a[l] + \cdots + a[r] || the first r+1 elements
P[l] = a[0] + \cdots + a[l-1] || the first l elements
P[r+1] - P[l] = a[l] + \cdots + a[r] || the common prefix cancels
! \text{sum}(l, r) = P[r+1] - P[l] || two lookups, any range
:::

```viz algo=prefix-sum
```

:::tip Why the extra 0 at the front?
With $P[0] = 0$, the formula $P[r+1] - P[l]$ works for $l = 0$ too, with no special case. Off-by-one bugs in prefix sums almost always come from skipping this.
:::

```cpp run level=easy title="Build once, query many times"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> a = {3, 1, 4, 1, 5, 9, 2, 6};
    int n = a.size();
    vector<long long> P(n + 1, 0);
    for (int i = 0; i < n; i++) P[i + 1] = P[i] + a[i];

    // in C++ you can also write: partial_sum(a.begin(), a.end(), P.begin() + 1);
    for (auto [l, r] : vector<pair<int, int>>{{0, 7}, {2, 5}, {4, 4}})
        cout << "sum a[" << l << ".." << r << "] = " << P[r + 1] - P[l] << '\n';
}
```

## 2D prefix sums

For a grid, let $S[i][j]$ = the sum of the rectangle from $(0,0)$ to $(i-1, j-1)$, again with an extra row and column of zeros.

:::derive Building S and querying any rectangle (inclusion–exclusion)
S[i+1][j+1] = g[i][j] + S[i][j+1] + S[i+1][j] - S[i][j] || the top-left block got added twice
\text{sum}(r_1..r_2,\,c_1..c_2) = S[r_2{+}1][c_2{+}1] || everything up to the bottom-right corner
\quad - S[r_1][c_2{+}1] - S[r_2{+}1][c_1] || remove the strip above and the strip to the left
! \quad + S[r_1][c_1] || add back the corner, which was removed twice
:::

```cpp run level=intermediate title="2D prefix sums: any rectangle in O(1)"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<vector<int>> g = {{3, 0, 1, 4, 2}, {5, 6, 3, 2, 1}, {1, 2, 0, 1, 5}, {4, 1, 0, 1, 7}, {1, 0, 3, 0, 5}};
    int R = g.size(), C = g[0].size();
    vector<vector<long long>> S(R + 1, vector<long long>(C + 1, 0));
    for (int i = 0; i < R; i++)
        for (int j = 0; j < C; j++)
            S[i + 1][j + 1] = g[i][j] + S[i][j + 1] + S[i + 1][j] - S[i][j];

    auto rect = [&](int r1, int c1, int r2, int c2) {
        return S[r2 + 1][c2 + 1] - S[r1][c2 + 1] - S[r2 + 1][c1] + S[r1][c1];
    };
    cout << rect(2, 1, 4, 3) << ' ' << rect(1, 1, 2, 2) << ' ' << rect(1, 2, 2, 4) << '\n';   // 8 11 12
}
```

## Difference arrays: range updates in O(1)

The reverse problem: **many updates** "add `v` to every element of `a[l..r]`", then read the final array once.

:::def Difference array
$D[i] = a[i] - a[i-1]$ (with $D[0] = a[0]$). The prefix sums of $D$ rebuild $a$. Adding $v$ to $a[l..r]$ changes only **two** entries: $D[l] \mathrel{+}= v$ and $D[r+1] \mathrel{-}= v$.
:::

Why it works: the prefix sum carries the `+v` from position `l` onwards, and the `-v` at `r+1` cancels it after the range ends. So $k$ updates on an array of size $n$ cost $O(k + n)$ instead of $O(k \cdot n)$.

```cpp run level=intermediate title="1000s of range updates, one pass to apply them"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 10;
    vector<long long> D(n + 1, 0);
    vector<array<int, 3>> updates = {{1, 4, 10}, {3, 8, 5}, {0, 9, 1}, {6, 6, 100}};   // (l, r, v)
    for (auto [l, r, v] : updates) { D[l] += v; D[r + 1] -= v; }

    vector<long long> a(n);
    long long run = 0;
    for (int i = 0; i < n; i++) { run += D[i]; a[i] = run; }      // prefix sums of D
    for (auto x : a) cout << x << ' ';
    cout << '\n';
}
```

This is called a **sweep line** when the indexes are times: "+1 when a meeting starts, −1 when it ends". The running sum is the number of meetings in progress. You'll use it in the Intervals lesson.

## Prefix sum + hash map: counting subarrays

The most important variation. To **count** subarrays with sum exactly `k`:

$$\text{sum}(l..r) = k \iff P[r+1] - P[l] = k \iff P[l] = P[r+1] - k$$

So for each end `r`, the number of good subarrays ending at `r` equals **how many earlier prefix sums equal $P[r+1] - k$**. Store prefix-sum counts in a hash map as you go.

:::warn Sliding window fails here
With **negative** numbers, growing a window doesn't always increase its sum, so sliding window doesn't apply. The prefix-sum + hash-map method works for any integers.
:::

## Problems

:::problem Range Sum Query - Immutable {level=easy lc=range-sum-query-immutable tags="prefix sum,design"}
Design a class that is built from an array and answers `sumRange(left, right)` many times.

:::hint Hint
Precompute the prefix sums in the constructor.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

class NumArray {
public:
    NumArray(const vector<int>& a) : P(a.size() + 1, 0) {
        for (int i = 0; i < (int)a.size(); i++) P[i + 1] = P[i] + a[i];
    }
    int sumRange(int l, int r) const { return P[r + 1] - P[l]; }
private:
    vector<int> P;
};

int main() {
    NumArray na({-2, 0, 3, -5, 2, -1});
    cout << na.sumRange(0, 2) << ' ' << na.sumRange(2, 5) << ' ' << na.sumRange(0, 5) << '\n';
}
```

:::complexity
Time | O(1) | per query; O(n) to build
Space | O(n) |
:::

If the array also gets **updated**, prefix sums break (one update changes O(n) prefixes). Use a Fenwick tree or segment tree instead: $O(\log n)$ for both operations.
:::
:::

:::problem Find Pivot Index {level=easy lc=find-pivot-index tags="prefix sum"}
Return the leftmost index where the sum of the elements to its left equals the sum of the elements to its right, or `-1`.

Example: `[1,7,3,6,5,6]` → `3`.

:::hint Hint
With `total` known, the right sum is `total - leftSum - a[i]`. No array needed: keep a running left sum.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int pivotIndex(const vector<int>& a) {
    long long total = accumulate(a.begin(), a.end(), 0LL), left = 0;
    for (int i = 0; i < (int)a.size(); i++) {
        if (left == total - left - a[i]) return i;
        left += a[i];
    }
    return -1;
}

int main() { cout << pivotIndex({1, 7, 3, 6, 5, 6}) << ' ' << pivotIndex({1, 2, 3}) << ' ' << pivotIndex({2, 1, -1}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Subarray Sum Equals K {level=medium lc=subarray-sum-equals-k tags="prefix sum,hash map"}
Count the contiguous subarrays whose sum equals `k`. The values can be **negative**.

Example: `[1,1,1], k=2` → `2`; `[1,2,3], k=3` → `2`.

:::hint Hint 1
Brute force: all $O(n^2)$ subarrays with running sums. Why doesn't a sliding window work?
:::

:::hint Hint 2
`sum(l..r) = P[r+1] - P[l]`. For each `r`, count the earlier prefixes equal to `P[r+1] - k` with a hash map. Start the map with `{0: 1}`, the empty prefix.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int subarraySum(const vector<int>& nums, int k) {
    unordered_map<long long, int> seen;     // prefix sum -> how many times seen
    seen[0] = 1;                            // empty prefix: lets subarrays start at index 0
    long long prefix = 0;
    int count = 0;
    for (int x : nums) {
        prefix += x;
        auto it = seen.find(prefix - k);
        if (it != seen.end()) count += it->second;
        seen[prefix]++;                     // add AFTER querying (the subarray must be non-empty)
    }
    return count;
}

int main() {
    cout << subarraySum({1, 1, 1}, 2) << ' ' << subarraySum({1, 2, 3}, 3) << ' ' << subarraySum({1, -1, 0}, 0) << '\n';
}
```

:::complexity
Time | O(n) | average
Space | O(n) |
:::

**Pattern variants:** "longest subarray with sum k" (store the **first** index of each prefix sum instead of a count); "subarray sum divisible by k" (key = `((prefix % k) + k) % k`); "equal number of 0s and 1s" (treat 0 as −1, look for sum 0, see below).
:::
:::

:::problem Product of Array Except Self {level=medium lc=product-of-array-except-self tags="prefix product"}
Return `out` where `out[i]` is the product of every element except `nums[i]`. Don't use division, and run in $O(n)$.

Example: `[1,2,3,4]` → `[24,12,8,6]`.

:::hint Hint
`out[i]` = (product of everything to the left of `i`) × (product of everything to the right of `i`). Compute prefix products and suffix products.
:::

:::solution
Two passes. Store the left products in `out`, then multiply in the right products on the way back. This needs $O(1)$ space beyond the output.

```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> productExceptSelf(const vector<int>& a) {
    int n = a.size();
    vector<int> out(n, 1);
    for (int i = 1; i < n; i++) out[i] = out[i - 1] * a[i - 1];      // left products
    int right = 1;
    for (int i = n - 1; i >= 0; i--) { out[i] *= right; right *= a[i]; }   // times right products
    return out;
}

int main() {
    for (int x : productExceptSelf({1, 2, 3, 4})) cout << x << ' ';
    cout << "| ";
    for (int x : productExceptSelf({-1, 1, 0, -3, 3})) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(1) | extra, not counting the output
:::

Why not divide the total product by `nums[i]`? Zeros break it, and the problem forbids it anyway. Saying this shows you thought about edge cases.
:::
:::

:::problem Contiguous Array {level=medium lc=contiguous-array tags="prefix sum,hash map"}
Given a binary array, return the length of the longest subarray with an **equal number of 0s and 1s**.

Example: `[0,1,0]` → `2`.

:::hint Hint
Replace every 0 with −1. "Equal counts" becomes "sum is 0". The longest subarray with sum 0 is between two **equal** prefix sums that are as far apart as possible.
:::

:::solution
Store the **first** index where each prefix sum appears. Later occurrences give longer subarrays.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int findMaxLength(const vector<int>& nums) {
    unordered_map<int, int> first;     // prefix sum -> first index where it appeared
    first[0] = -1;                     // empty prefix "before index 0"
    int sum = 0, best = 0;
    for (int i = 0; i < (int)nums.size(); i++) {
        sum += nums[i] ? 1 : -1;
        auto it = first.find(sum);
        if (it != first.end()) best = max(best, i - it->second);
        else first[sum] = i;
    }
    return best;
}

int main() { cout << findMaxLength({0, 1}) << ' ' << findMaxLength({0, 1, 0}) << ' ' << findMaxLength({0, 0, 1, 0, 0, 0, 1, 1}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) | (prefix sums lie in [−n, n], so an array of size 2n+1 also works)
:::
:::
:::

:::problem Corporate Flight Bookings {level=medium lc=corporate-flight-bookings tags="difference array"}
There are `n` flights numbered 1..n. Each booking `[first, last, seats]` reserves `seats` on every flight from `first` to `last`. Return the total seats reserved on each flight.

Example: `[[1,2,10],[2,3,20],[2,5,25]], n = 5` → `[10,55,45,25,25]`.

:::hint Hint
Range updates, one final read: a difference array.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> corpFlightBookings(const vector<vector<int>>& bookings, int n) {
    vector<int> D(n + 1, 0);                          // 0-indexed flights 0..n-1, plus one guard slot
    for (auto& b : bookings) { D[b[0] - 1] += b[2]; D[b[1]] -= b[2]; }
    vector<int> out(n);
    int run = 0;
    for (int i = 0; i < n; i++) out[i] = (run += D[i]);
    return out;
}

int main() {
    for (int x : corpFlightBookings({{1, 2, 10}, {2, 3, 20}, {2, 5, 25}}, 5)) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(n + k) | k bookings
Space | O(n) |
:::
:::
:::

:::problem Range Sum Query 2D - Immutable {level=medium lc=range-sum-query-2d-immutable tags="prefix sum,matrix"}
Answer `sumRegion(r1, c1, r2, c2)` queries on a fixed matrix in $O(1)$ each.

:::hint Hint
2D prefix sums with an extra zero row and column, then inclusion–exclusion.
:::

:::solution
Exactly the 2D construction above, wrapped in a class.

```cpp run
#include <bits/stdc++.h>
using namespace std;

class NumMatrix {
public:
    NumMatrix(const vector<vector<int>>& g) {
        int R = g.size(), C = R ? g[0].size() : 0;
        S.assign(R + 1, vector<int>(C + 1, 0));
        for (int i = 0; i < R; i++)
            for (int j = 0; j < C; j++)
                S[i + 1][j + 1] = g[i][j] + S[i][j + 1] + S[i + 1][j] - S[i][j];
    }
    int sumRegion(int r1, int c1, int r2, int c2) const {
        return S[r2 + 1][c2 + 1] - S[r1][c2 + 1] - S[r2 + 1][c1] + S[r1][c1];
    }
private:
    vector<vector<int>> S;
};

int main() {
    NumMatrix m({{3, 0, 1, 4, 2}, {5, 6, 3, 2, 1}, {1, 2, 0, 1, 5}, {4, 1, 0, 1, 7}, {1, 0, 3, 0, 5}});
    cout << m.sumRegion(2, 1, 4, 3) << ' ' << m.sumRegion(1, 1, 2, 2) << ' ' << m.sumRegion(1, 2, 2, 4) << '\n';
}
```

:::complexity
Time | O(1) | per query; O(RC) to build
Space | O(RC) |
:::
:::
:::

## Check yourself

```quiz
? With P[0] = 0 and P[i+1] = P[i] + a[i], the sum of a[l..r] is…
- P[r] − P[l]
+ P[r+1] − P[l]
- P[r+1] − P[l−1]
> P[r+1] covers a[0..r]; subtract a[0..l−1] = P[l].

? Why initialize the map with {0: 1} in Subarray Sum Equals K?
+ It represents the empty prefix, so subarrays starting at index 0 are counted
- To avoid division by zero
- It's not needed
> sum(0..r) = k needs an earlier prefix equal to 0.

? Adding v to a[l..r] using a difference array means…
+ D[l] += v and D[r+1] −= v
- Adding v to every D[i] in [l, r]
- D[l] += v only
> The prefix sum starts carrying v at l and stops after r.
```

:::keypoints
- $P[i+1] = P[i] + a[i]$, $\text{sum}(l..r) = P[r+1] - P[l]$; keep the leading zero.
- 2D: build and query with inclusion–exclusion (add two strips, subtract the double-counted corner).
- Difference arrays turn range updates into two point updates; the prefix sum rebuilds the array.
- Counting subarrays with a target sum (any signs): prefix sum + hash map. Store counts, or first indexes for "longest".
- Prefix/suffix products solve "product except self" without division.
:::
