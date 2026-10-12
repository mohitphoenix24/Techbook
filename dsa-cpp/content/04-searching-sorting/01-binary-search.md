---
title: Binary Search Without the Bugs
level: intermediate
time: 60
summary: Binary search as "find the boundary of a monotone predicate" — loop invariants that make it correct by construction, the closed [lo, hi] and half-open [lo, hi) templates, writing lower_bound/upper_bound yourself, overflow-safe midpoints, the O(log n) proof, and seven classic problems including rotated arrays and peak finding.
---

Binary search is famous for being easy to describe and hard to get exactly right. Off-by-one errors, infinite loops and overflow are all common. The fix is to stop thinking "find the element" and start thinking **"find the boundary"**, with an explicit **invariant**.

## The idea

```viz algo=binary-search
```

Each comparison discards **half** of the remaining range. After $k$ steps at most $n / 2^k$ candidates remain, so there are at most $\lfloor \log_2 n \rfloor + 1$ steps.

:::derive Binary search is O(log n)
\text{size after } k \text{ steps} \le \frac{n}{2^k} || each step keeps at most half
\frac{n}{2^k} < 1 \iff k > \log_2 n || the loop ends when the range is empty
! \text{steps} \le \lfloor \log_2 n \rfloor + 1 = O(\log n) || n = 10⁹ needs only 30 steps
:::

## Think in predicates, not values

:::def Monotone predicate
A yes/no test `P(i)` over the indexes that is **false, false, …, false, true, true, …, true**: once it becomes true, it stays true. Binary search finds the **first true** in $O(\log n)$.
:::

Almost every binary search problem is "find the first index where `P` becomes true":

| Question | Predicate `P(i)` |
|---|---|
| first element ≥ x (`lower_bound`) | `a[i] >= x` |
| first element > x (`upper_bound`) | `a[i] > x` |
| last element ≤ x | (first `a[i] > x`) − 1 |
| minimum in a rotated sorted array | `a[i] <= a.back()` |
| smallest capacity that works | `canShip(capacity)` (next lesson) |

## The template (half-open, "first true")

:::syntax
```cpp
// Returns the first index in [lo, hi) where P is true, or hi if there is none.
// Invariant: everything before lo is false; everything at or after hi is true (or out of range).
int lo = 0, hi = n;
while (lo < hi) {
    int mid = lo + (hi - lo) / 2;      // overflow-safe; mid is in [lo, hi)
    if (P(mid)) hi = mid;              // mid might be the answer: keep it
    else lo = mid + 1;                 // mid is false: the answer is after it
}
return lo;                             // lo == hi == the boundary
```
:::

:::proof Why this template is correct and always terminates
**Invariant:** `P` is false for every index $< lo$, and true for every index $\ge hi$ (treating $n$ as "true"). It holds at the start ($lo = 0$, $hi = n$: nothing below 0, and $n$ counts as true).
**Preserved:** if `P(mid)` is true, monotonicity makes everything from `mid` on true, so `hi = mid` keeps it. If false, everything up to `mid` is false, so `lo = mid + 1` keeps it.
**Progress:** `mid` is in $[lo, hi)$, so each step strictly shrinks $hi - lo$. No infinite loop.
**End:** when $lo = hi$, everything before is false and everything from there on is true, so `lo` is the first true.
:::

:::warn The three classic bugs
1. `int mid = (lo + hi) / 2;` overflows when `lo + hi > 2^{31}-1`. Use `lo + (hi - lo) / 2`.
2. Writing `lo = mid` with `mid = lo + (hi - lo) / 2` can **loop forever** when `hi = lo + 1`, because `mid == lo`. If a branch keeps `mid` on the low side, round the midpoint **up**.
3. Mixing templates: `while (lo <= hi)` goes with `hi = mid - 1`. `while (lo < hi)` goes with `hi = mid`. Pick one style and know its invariant.
:::

### The closed-interval style

The other common style searches for an exact value with `[lo, hi]` inclusive. It's the one in the visualizer above:

```cpp
int lo = 0, hi = n - 1;
while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (a[mid] == x) return mid;
    if (a[mid] < x) lo = mid + 1; else hi = mid - 1;
}
return -1;            // and lo is the insertion point
```

```cpp run level=easy title="lower_bound and upper_bound, written by hand"
#include <bits/stdc++.h>
using namespace std;

int lowerBound(const vector<int>& a, int x) {      // first index with a[i] >= x
    int lo = 0, hi = a.size();
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] >= x) hi = mid; else lo = mid + 1;
    }
    return lo;
}
int upperBound(const vector<int>& a, int x) {      // first index with a[i] > x
    int lo = 0, hi = a.size();
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] > x) hi = mid; else lo = mid + 1;
    }
    return lo;
}

int main() {
    vector<int> a = {1, 2, 4, 4, 4, 7, 9};
    for (int x : {4, 5, 0, 10}) {
        int lb = lowerBound(a, x), ub = upperBound(a, x);
        cout << "x=" << x << "  lower " << lb << " (std " << lower_bound(a.begin(), a.end(), x) - a.begin()
             << ")  upper " << ub << "  count " << ub - lb << '\n';
    }
}
```

## Problems

:::problem Binary Search {level=easy lc=binary-search tags="binary search"}
Return the index of `target` in a sorted array of distinct integers, or `-1`.

:::hint Hint
Use lower_bound, then check whether the element there equals the target.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int search(const vector<int>& a, int target) {
    int lo = 0, hi = a.size();
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] >= target) hi = mid; else lo = mid + 1;
    }
    return (lo < (int)a.size() && a[lo] == target) ? lo : -1;
}

int main() { cout << search({-1, 0, 3, 5, 9, 12}, 9) << ' ' << search({-1, 0, 3, 5, 9, 12}, 2) << '\n'; }
```

:::complexity
Time | O(\log n) |
Space | O(1) |
:::
:::
:::

:::problem Search Insert Position {level=easy lc=search-insert-position tags="binary search"}
Return the index of `target` if it's present, otherwise the index where it would be inserted to keep the array sorted.

:::hint Hint
That's exactly lower_bound.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int searchInsert(const vector<int>& a, int target) {
    return lower_bound(a.begin(), a.end(), target) - a.begin();
}

int main() { cout << searchInsert({1, 3, 5, 6}, 5) << ' ' << searchInsert({1, 3, 5, 6}, 2) << ' ' << searchInsert({1, 3, 5, 6}, 7) << '\n'; }
```

:::complexity
Time | O(\log n) |
Space | O(1) |
:::

In an interview, offer the one-liner, then write the loop if they ask. Knowing that it **is** lower_bound is the insight.
:::
:::

:::problem Find First and Last Position of Element in Sorted Array {level=medium lc=find-first-and-last-position-of-element-in-sorted-array tags="binary search"}
Return `[first, last]` indexes of `target` in a sorted array, or `[-1, -1]`, in $O(\log n)$.

Example: `[5,7,7,8,8,10], 8` → `[3,4]`.

:::hint Hint
first = lower_bound(target); last = upper_bound(target) − 1. Two binary searches.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> searchRange(const vector<int>& a, int t) {
    int first = lower_bound(a.begin(), a.end(), t) - a.begin();
    if (first == (int)a.size() || a[first] != t) return {-1, -1};
    int last = upper_bound(a.begin(), a.end(), t) - a.begin() - 1;
    return {first, last};
}

int main() {
    for (int t : {8, 6, 5}) { auto r = searchRange({5, 7, 7, 8, 8, 10}, t); cout << '[' << r[0] << ',' << r[1] << "] "; }
    cout << '\n';
}
```

:::complexity
Time | O(\log n) |
Space | O(1) |
:::

Why not find one occurrence and then scan left and right? If all $n$ elements equal the target, the scan is $O(n)$.
:::
:::

:::problem Find Minimum in Rotated Sorted Array {level=medium lc=find-minimum-in-rotated-sorted-array tags="binary search,rotated array"}
A sorted array of distinct values was rotated at an unknown pivot (`[0,1,2,4,5,6,7]` → `[4,5,6,7,0,1,2]`). Return its minimum in $O(\log n)$.

:::hint Hint 1
Compare with the **last** element. Elements of the "left part" (before the rotation point) are all > `a.back()`, and elements of the "right part" are all ≤ `a.back()`.
:::

:::hint Hint 2
So `P(i) = a[i] <= a.back()` is monotone (false…false, true…true), and the minimum is the first true.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findMin(const vector<int>& a) {
    int lo = 0, hi = (int)a.size() - 1;              // the answer is in [lo, hi]
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] > a[hi]) lo = mid + 1;            // mid is in the left part: the min is to the right
        else hi = mid;                               // mid is in the right part: it might be the min
    }
    return a[lo];
}

int main() { cout << findMin({3, 4, 5, 1, 2}) << ' ' << findMin({4, 5, 6, 7, 0, 1, 2}) << ' ' << findMin({11, 13, 15, 17}) << '\n'; }
```

:::complexity
Time | O(\log n) |
Space | O(1) |
:::

With **duplicates** (LeetCode 154), `a[mid] == a[hi]` gives no information. Do `hi--` in that case. The worst case becomes $O(n)$, and that's unavoidable: think of `[1,1,1,0,1,1,1]`.
:::
:::

:::problem Search in Rotated Sorted Array {level=medium lc=search-in-rotated-sorted-array tags="binary search,rotated array"}
Search for `target` in a rotated sorted array of distinct values, in $O(\log n)$. Return its index or `-1`.

Example: `[4,5,6,7,0,1,2], 0` → `4`.

:::hint Hint
At every `mid`, **one of the two halves is sorted**: check which one by comparing `a[lo]` with `a[mid]`. If the target lies within the sorted half's range, search there; otherwise search the other half.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int search(const vector<int>& a, int t) {
    int lo = 0, hi = (int)a.size() - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == t) return mid;
        if (a[lo] <= a[mid]) {                        // the left half [lo, mid] is sorted
            if (a[lo] <= t && t < a[mid]) hi = mid - 1;
            else lo = mid + 1;
        } else {                                      // the right half [mid, hi] is sorted
            if (a[mid] < t && t <= a[hi]) lo = mid + 1;
            else hi = mid - 1;
        }
    }
    return -1;
}

int main() { cout << search({4, 5, 6, 7, 0, 1, 2}, 0) << ' ' << search({4, 5, 6, 7, 0, 1, 2}, 3) << ' ' << search({1}, 0) << ' ' << search({3, 1}, 1) << '\n'; }
```

:::complexity
Time | O(\log n) |
Space | O(1) |
:::

An alternative that's easier to get right: find the rotation point with the previous problem, then run an ordinary binary search on the correct sorted half.
:::
:::

:::problem Find Peak Element {level=medium lc=find-peak-element tags="binary search"}
A peak is an element strictly greater than its neighbours, with `a[-1] = a[n] = −∞`. Neighbouring elements are never equal. Return the index of **any** peak in $O(\log n)$.

Example: `[1,2,1,3,5,6,4]` → `5` (or `1`).

:::hint Hint
The array isn't sorted, but look at the **slope** at `mid`. If `a[mid] < a[mid+1]`, you're going uphill, and a peak must exist to the right.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findPeakElement(const vector<int>& a) {
    int lo = 0, hi = (int)a.size() - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < a[mid + 1]) lo = mid + 1;   // uphill: a peak exists in (mid, hi]
        else hi = mid;                            // downhill: a peak exists in [lo, mid]
    }
    return lo;
}

int main() { cout << findPeakElement({1, 2, 3, 1}) << ' ' << findPeakElement({1, 2, 1, 3, 5, 6, 4}) << '\n'; }
```

:::proof Why a peak always lies in the kept half
If `a[mid] < a[mid+1]`, walk right from `mid+1`: either the values keep increasing until the last index, which is then a peak because $a[n] = -\infty$, or at some point they go down, and the element just before that drop is a peak. Either way there's a peak in `(mid, hi]`. The other case is symmetric. The kept range always contains a peak, and it shrinks every step.
:::

:::complexity
Time | O(\log n) |
Space | O(1) |
:::

This is the key lesson: binary search needs a **monotone question** ("is there a peak to my right?"), not a sorted array.
:::
:::

:::problem Search a 2D Matrix {level=medium lc=search-a-2d-matrix tags="binary search,matrix"}
Each row is sorted, and each row's first value is greater than the previous row's last value. Search for `target` in $O(\log(RC))$.

:::hint Hint
The matrix read row by row is one sorted array of length `R*C`. Map a 1D index `k` to `(k / C, k % C)`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool searchMatrix(const vector<vector<int>>& m, int t) {
    int R = m.size(), C = m[0].size(), lo = 0, hi = R * C;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (m[mid / C][mid % C] >= t) hi = mid; else lo = mid + 1;
    }
    return lo < R * C && m[lo / C][lo % C] == t;
}

int main() {
    vector<vector<int>> m = {{1, 3, 5, 7}, {10, 11, 16, 20}, {23, 30, 34, 60}};
    cout << boolalpha << searchMatrix(m, 3) << ' ' << searchMatrix(m, 13) << '\n';
}
```

:::complexity
Time | O(\log(RC)) |
Space | O(1) |
:::
:::
:::

## Check yourself

```quiz
? Why `mid = lo + (hi − lo) / 2` instead of `(lo + hi) / 2`?
+ lo + hi can overflow int when both are large
- It rounds better
- It's required by the standard
> The difference hi − lo never overflows.

? In the `while (lo < hi)` template, the true branch sets…
+ hi = mid
- hi = mid − 1
- lo = mid
> mid could be the first true, so keep it in range.

? Binary search needs the array to be sorted.
- Always true
+ False: it needs a monotone predicate, like the slope in Find Peak Element
- True except for strings
> Monotonicity of the question is what matters.

? How many iterations does binary search need for n = 10⁶?
- About 1000
+ About 20
- About 6
> log₂(10⁶) ≈ 19.9.
```

:::keypoints
- Frame every binary search as **the first index where a monotone predicate becomes true**.
- Half-open template: `lo = 0, hi = n; while (lo < hi) { mid = lo + (hi-lo)/2; P(mid) ? hi = mid : lo = mid + 1; }`. Know its invariant.
- lower_bound (≥ x), upper_bound (> x), count = upper − lower, last ≤ x = upper − 1.
- Rotated arrays: compare with an endpoint. Peaks: follow the slope.
- At most $\lfloor\log_2 n\rfloor + 1$ steps: 30 for $10^9$.
:::
