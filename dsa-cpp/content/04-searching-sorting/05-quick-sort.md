---
title: Quick Sort & Quickselect
level: advanced
time: 55
summary: Partitioning (Lomuto and Hoare), quicksort's best/worst cases, the full derivation that randomized quicksort makes about 2n ln n comparisons on average (indicator variables), 3-way partitioning for duplicates, introsort, and quickselect for the k-th element in expected O(n) — with Kth Largest and K Closest Points.
---

Quicksort is the sort most libraries build on. It's in place, cache-friendly and usually faster than merge sort in practice. Its worst case is $O(n^2)$, though, and understanding **why randomization fixes that** is a favourite interview discussion.

## Partitioning

:::def Partition
Rearrange `a[lo..hi]` around a **pivot** value `p` so that everything left of the pivot's final position is `< p` and everything right of it is `≥ p`. The pivot then sits in its **final sorted position** and never moves again.
:::

:::flow Quicksort
Pick a pivot | ideally random
Partition | smaller left, larger right: O(n)
Recurse | on the left part and the right part
No combine step | the array is sorted in place
:::

```viz algo=quick-sort
```

### Lomuto partition (simple)

The invariant during the scan: `a[lo..i−1] < pivot`, `a[i..j−1] ≥ pivot`, and `a[j..hi−1]` hasn't been seen yet.

### Hoare partition (faster)

Two pointers move toward each other and swap pairs that are on the wrong side. It does about 3× fewer swaps than Lomuto and handles many equal keys better. The catch: the pivot doesn't necessarily end up at the returned index, so the recursion becomes `[lo, p]` and `[p+1, hi]`.

```cpp run level=intermediate title="Randomized quicksort with both partition schemes"
#include <bits/stdc++.h>
using namespace std;
mt19937 rng(12345);

int lomuto(vector<int>& a, int lo, int hi) {           // a[lo..hi], pivot = a[hi]
    int p = a[hi], i = lo;
    for (int j = lo; j < hi; j++)
        if (a[j] < p) swap(a[i++], a[j]);
    swap(a[i], a[hi]);
    return i;                                          // pivot's final index
}
void quickLomuto(vector<int>& a, int lo, int hi) {
    if (lo >= hi) return;
    swap(a[lo + rng() % (hi - lo + 1)], a[hi]);        // random pivot moved to the end
    int p = lomuto(a, lo, hi);
    quickLomuto(a, lo, p - 1);
    quickLomuto(a, p + 1, hi);
}

int hoare(vector<int>& a, int lo, int hi) {
    swap(a[lo], a[lo + rng() % (hi - lo + 1)]);       // random pivot moved to the FRONT:
    int p = a[lo];                                    // with pivot = a[lo], Hoare guarantees lo <= j < hi
    int i = lo - 1, j = hi + 1;
    while (true) {
        do i++; while (a[i] < p);
        do j--; while (a[j] > p);
        if (i >= j) return j;                          // a[lo..j] <= p <= a[j+1..hi]
        swap(a[i], a[j]);
    }
}
void quickHoare(vector<int>& a, int lo, int hi) {
    if (lo >= hi) return;
    int p = hoare(a, lo, hi);
    quickHoare(a, lo, p);
    quickHoare(a, p + 1, hi);
}

int main() {
    vector<int> a = {9, 3, 7, 1, 8, 2, 5, 3, 6, 4}, b = a;
    quickLomuto(a, 0, a.size() - 1);
    quickHoare(b, 0, b.size() - 1);
    for (int x : a) cout << x << ' ';
    cout << "| ";
    for (int x : b) cout << x << ' ';
    cout << '\n';
}
```

## Best and worst cases

| Pivot lands… | Recurrence | Result |
|---|---|---|
| exactly in the middle | $T(n) = 2T(n/2) + n$ | $\Theta(n \log n)$ |
| at a constant fraction (10% / 90%) | $T(n) = T(n/10) + T(9n/10) + n$ | $\Theta(n \log n)$ |
| at an end (min or max) every time | $T(n) = T(n-1) + n$ | $\Theta(n^2)$ |

Always choosing the **first or last element** as the pivot hits the worst case on **already sorted** input, which is very common in practice. That's why the pivot should be random (or the median of three samples).

## Why randomized quicksort is O(n log n) on average

This is a beautiful use of indicator variables and linearity of expectation.

:::derive Expected number of comparisons
z_1 < z_2 < \cdots < z_n \text{ are the elements in sorted order} || name them by rank
X = \sum_{i<j} X_{ij}, \quad X_{ij} = [z_i \text{ and } z_j \text{ are ever compared}] || each pair is compared at most once
z_i, z_j \text{ are compared} \iff \text{the first pivot chosen from } \{z_i, \ldots, z_j\} \text{ is } z_i \text{ or } z_j || a pivot strictly between them separates them forever
P(X_{ij} = 1) = \frac{2}{j - i + 1} || each of the j−i+1 elements is equally likely to be picked first
E[X] = \sum_{i<j} \frac{2}{j-i+1} = \sum_{i=1}^{n-1}\sum_{d=2}^{n-i+1} \frac{2}{d} || substitute d = j − i + 1
\le \sum_{i=1}^{n} 2(H_n - 1) < 2n H_n || a harmonic sum for each i
! E[X] \approx 2n\ln n \approx 1.39\, n\log_2 n = O(n \log n) || only about 39% more comparisons than merge sort
:::

This is a guarantee **over the random pivot choices**, for **every** input. No input is consistently bad. The probability of hitting $\Theta(n^2)$ is astronomically small.

```cpp run level=intermediate title="Measuring it: random pivot vs last-element pivot on sorted input"
#include <bits/stdc++.h>
using namespace std;
long long comps;
mt19937 rng(7);

void qs(vector<int>& a, int lo, int hi, bool randomPivot) {
    while (lo < hi) {                                     // recurse on the smaller side, loop on the larger: O(log n) stack
        if (randomPivot) swap(a[lo + rng() % (hi - lo + 1)], a[hi]);
        int p = a[hi], i = lo;
        for (int j = lo; j < hi; j++) { comps++; if (a[j] < p) swap(a[i++], a[j]); }
        swap(a[i], a[hi]);
        if (i - lo < hi - i) { qs(a, lo, i - 1, randomPivot); lo = i + 1; }
        else { qs(a, i + 1, hi, randomPivot); hi = i - 1; }
    }
}

int main() {
    for (int n : {1000, 4000}) {
        vector<int> sorted(n); iota(sorted.begin(), sorted.end(), 0);
        auto a = sorted; comps = 0; qs(a, 0, n - 1, false); long long bad = comps;
        auto b = sorted; comps = 0; qs(b, 0, n - 1, true);  long long good = comps;
        cout << "n=" << n << "  last-element pivot: " << bad << " (n^2/2 = " << (long long)n * n / 2 << ")"
             << "   random pivot: " << good << " (2n ln n = " << (long long)(2 * n * log(n)) << ")\n";
    }
}
```

:::tip Recursion depth
Recursing into the **smaller** part and looping on the larger one (as above) keeps the stack at $O(\log n)$ even in bad cases. Without it, the worst case recurses $n$ deep.
:::

## Duplicates: 3-way partitioning

If many elements equal the pivot, 2-way partitions don't shrink the problem well (all-equal input is $O(n^2)$ with Lomuto). **3-way partitioning** (the Dutch flag again) splits the range into `< p | == p | > p`, and recursion skips the whole middle block.

## What std::sort really does: introsort

`std::sort` uses **introsort**: quicksort with a median-of-three pivot, switching to **heapsort** if the recursion gets deeper than about $2\log_2 n$ (which guarantees $O(n \log n)$ worst case), and to **insertion sort** for small ranges. It is **not stable**. Use `std::stable_sort` (merge sort) when you need stability.

## Quickselect: the k-th smallest in expected O(n)

Partition once and you know the pivot's final index `p`. If `k == p` you're done; otherwise recurse into **only one side**.

:::derive Expected cost of quickselect
\text{a random pivot lands in the middle half with probability } \tfrac12 || between the 25th and 75th percentile
\text{then the remaining side has at most } \tfrac34 n \text{ elements} ||
E[T(n)] \le n + \tfrac12 E[T(\tfrac34 n)] + \tfrac12 E[T(n)] || pessimistically, a bad pivot makes no progress at all
E[T(n)] \le 2n + E[T(\tfrac34 n)] || rearrange
! E[T(n)] \le 2n\left(1 + \tfrac34 + (\tfrac34)^2 + \cdots\right) = 8n = O(n) || geometric series
:::

`std::nth_element` does exactly this. (A worst-case $O(n)$ algorithm exists, "median of medians", but it's mostly of theoretical interest.)

## Problems

:::problem Kth Largest Element in an Array {level=medium lc=kth-largest-element-in-an-array tags="quickselect,heap,sorting"}
Return the `k`-th largest element (the k-th in sorted order from the top, not the k-th distinct).

Example: `[3,2,1,5,6,4], k=2` → `5`.

:::hint Hint 1
Sorting is $O(n \log n)$. A min-heap of size `k` is $O(n \log k)$.
:::

:::hint Hint 2
The k-th largest is the element at index `n − k` in sorted order. Quickselect finds it in expected $O(n)$.
:::

:::solution
Quickselect with a random pivot and 3-way partitioning (so that arrays of equal values don't go quadratic). The heap version is shown too.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int findKthLargest(vector<int> a, int k) {
    mt19937 rng(42);
    int target = a.size() - k, lo = 0, hi = a.size() - 1;
    while (true) {
        int p = a[lo + rng() % (hi - lo + 1)];
        int lt = lo, i = lo, gt = hi;                   // 3-way: [lo,lt) < p, [lt,i) == p, (gt,hi] > p
        while (i <= gt) {
            if (a[i] < p) swap(a[lt++], a[i++]);
            else if (a[i] > p) swap(a[i], a[gt--]);
            else i++;
        }
        if (target < lt) hi = lt - 1;
        else if (target > gt) lo = gt + 1;
        else return p;                                  // target lies in the == block
    }
}

int kthLargestHeap(const vector<int>& a, int k) {
    priority_queue<int, vector<int>, greater<int>> pq; // the k largest seen so far, min on top
    for (int x : a) { pq.push(x); if ((int)pq.size() > k) pq.pop(); }
    return pq.top();
}

int main() {
    cout << findKthLargest({3, 2, 1, 5, 6, 4}, 2) << ' ' << findKthLargest({3, 2, 3, 1, 2, 4, 5, 5, 6}, 4) << ' '
         << kthLargestHeap({3, 2, 3, 1, 2, 4, 5, 5, 6}, 4) << '\n';
}
```

:::complexity
Time | O(n) | expected for quickselect; O(n log k) for the heap
Space | O(1) | quickselect works in place; the heap needs O(k)
:::

In an interview: mention all three (sort, heap, quickselect) and their trade-offs. The heap version also works on a **stream**.
:::
:::

:::problem K Closest Points to Origin {level=medium lc=k-closest-points-to-origin tags="quickselect,heap"}
Return the `k` points closest to `(0, 0)`, in any order.

Example: `[[1,3],[-2,2]], k=1` → `[[-2,2]]`.

:::hint Hint
Compare squared distances (no `sqrt` needed). Then use `nth_element` (quickselect) to put the k smallest first.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> kClosest(vector<vector<int>> pts, int k) {
    auto d = [](const vector<int>& p) { return 1LL * p[0] * p[0] + 1LL * p[1] * p[1]; };
    nth_element(pts.begin(), pts.begin() + k, pts.end(),
                [&](const vector<int>& a, const vector<int>& b) { return d(a) < d(b); });
    pts.resize(k);
    return pts;
}

int main() {
    for (auto& p : kClosest({{3, 3}, {5, -1}, {-2, 4}}, 2)) cout << '[' << p[0] << ',' << p[1] << "] ";
    cout << '\n';
}
```

:::complexity
Time | O(n) | expected
Space | O(1) | extra
:::
:::
:::

## Check yourself

```quiz
? Quicksort with "last element as pivot" on an already sorted array takes…
- Θ(n log n)
+ Θ(n²)
- Θ(n)
> Every partition is maximally unbalanced: T(n) = T(n−1) + n.

? Two elements zᵢ < zⱼ are compared by randomized quicksort exactly when…
+ One of them is the first pivot chosen from zᵢ … zⱼ
- They are adjacent in the input
- Always
> A pivot strictly between them separates them forever.

? Expected running time of quickselect?
+ O(n)
- O(n log n)
- O(log n)
> It recurses into one side only: a geometric series.

? Why does std::sort switch to heapsort sometimes?
+ To guarantee O(n log n) when the recursion gets too deep
- Because heapsort is stable
- To save memory on small inputs
> That's introsort's safety net.
```

:::keypoints
- Partition puts the pivot in its final place. Lomuto is simple; Hoare does fewer swaps.
- Balanced splits (even 10/90) give $n \log n$; end pivots give $n^2$. **Randomize the pivot.**
- Expected comparisons $= \sum_{i<j} \frac{2}{j-i+1} \approx 2n\ln n$, from indicator variables.
- 3-way partitioning handles duplicates. Recurse into the smaller side for an $O(\log n)$ stack.
- Quickselect / `nth_element`: the k-th element in expected $O(n)$. `std::sort` = introsort (not stable).
:::
