---
title: The Ω(n log n) Barrier & Linear-Time Sorts
level: advanced
time: 45
summary: Why no comparison sort can beat Ω(n log n) (the decision-tree proof with log₂ n! ≥ (n/2)·log₂(n/2)), and the non-comparison sorts that sidestep it — counting sort, radix sort and bucket sort — plus heap sort, a full comparison table, and which sort to reach for in practice.
---

Merge sort, heapsort and quicksort all top out at $O(n \log n)$. That's not a lack of imagination: it's a **theorem**. Any sort that learns about the data only by comparing elements needs $\Omega(n \log n)$ comparisons. The only way past it is to **not compare**, and instead use the values themselves as indexes.

## The decision-tree lower bound

:::def Comparison sort
A sorting algorithm that gets information about the input **only** by asking "is $a_i < a_j$?". Merge sort, quicksort, heapsort, insertion sort and `std::sort` are all comparison sorts.
:::

Model any comparison sort as a binary **decision tree**: each internal node is a comparison, the two branches are its outcomes, and each leaf is a final answer (a permutation that sorts the input). Running the algorithm on an input is one root-to-leaf path, and the number of comparisons is that path's length.

:::proof Every comparison sort needs Ω(n log n) comparisons in the worst case
The $n!$ possible orderings of distinct inputs each need a **different** leaf. Otherwise two different inputs would be "sorted" by the same permutation, and one of them would come out wrong. So the tree has at least $n!$ leaves. A binary tree of height $h$ has at most $2^h$ leaves, so $2^h \ge n!$, which means $h \ge \log_2(n!)$. The height is the worst-case number of comparisons.
:::

:::derive log₂(n!) = Θ(n log n), without Stirling
\log_2 n! = \sum_{i=1}^{n} \log_2 i || log of a product = sum of logs
\ge \sum_{i=n/2}^{n} \log_2 i || drop the first half of the terms
\ge \frac n2 \log_2 \frac n2 || each of the remaining n/2 terms is ≥ log₂(n/2)
\log_2 n! \le n \log_2 n || each of the n terms is ≤ log₂ n
! \log_2 n! = \Theta(n \log n) \;\Rightarrow\; \text{comparison sorting is } \Omega(n \log n) ||
:::

So merge sort and heapsort are **asymptotically optimal** comparison sorts. The same argument shows that *searching* a sorted array by comparisons needs $\Omega(\log n)$ (there are $n+1$ possible answers), which makes binary search optimal too.

:::note Lower bounds in interviews
"Can you sort faster than n log n?" The answer: "Not with comparisons, by the decision-tree argument. But if the keys are small integers, counting or radix sort runs in linear time." That earns full marks.
:::

## Counting sort: O(n + k)

If the keys are integers in a small range $[0, k)$, **count** how many times each value appears and write them back out in order. No comparisons at all.

```viz algo=counting-sort
```

The **stable** version (needed by radix sort) computes prefix sums of the counts to find where each key's block starts, then places the elements in input order:

```cpp run level=intermediate title="Stable counting sort of records by a small key"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<pair<int, string>> rec = {{3, "dan"}, {1, "amy"}, {3, "bea"}, {0, "cal"}, {1, "eli"}, {2, "fay"}};
    int K = 4;
    vector<int> start(K + 1, 0);
    for (auto& [key, name] : rec) start[key + 1]++;
    for (int k = 0; k < K; k++) start[k + 1] += start[k];          // start[k] = where key k's block begins
    vector<pair<int, string>> out(rec.size());
    for (auto& r : rec) out[start[r.first]++] = r;                  // same-key records keep their input order
    for (auto& [key, name] : out) cout << key << ':' << name << ' ';
    cout << '\n';                                                   // note: dan before bea, amy before eli
}
```

:::complexity
Time | O(n + k) | k = size of the key range
Space | O(n + k) |
:::

It's great when $k = O(n)$, and useless when keys go up to $10^9$ (the count array would be huge).

## Radix sort: O(d · (n + b))

Sort the numbers **digit by digit, starting from the least significant digit**, using a stable counting sort for each digit. After processing digit $t$, the numbers are sorted by their last $t$ digits.

:::proof Why LSD radix sort works (stability is essential)
By induction on the number of digits processed. Suppose the array is sorted by its last $t$ digits. We now stably sort by digit $t+1$. Numbers with different digit $t+1$ end up ordered by that digit, which is correct, because it is more significant. Numbers with the same digit $t+1$ keep their relative order thanks to stability, and that order was already correct by the last $t$ digits. So now the array is sorted by the last $t+1$ digits.
:::

```cpp run level=advanced title="LSD radix sort on 32-bit unsigned keys (base 256)"
#include <bits/stdc++.h>
using namespace std;

void radixSort(vector<uint32_t>& a) {
    vector<uint32_t> tmp(a.size());
    for (int shift = 0; shift < 32; shift += 8) {              // 4 passes of one byte each
        array<int, 257> cnt{};
        for (uint32_t x : a) cnt[((x >> shift) & 255) + 1]++;
        for (int b = 0; b < 256; b++) cnt[b + 1] += cnt[b];
        for (uint32_t x : a) tmp[cnt[(x >> shift) & 255]++] = x;   // stable placement
        swap(a, tmp);
    }
}

int main() {
    vector<uint32_t> a = {170, 45, 75, 90, 802, 24, 2, 66, 4000000000u, 7};
    radixSort(a);
    for (auto x : a) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(d (n + b)) | d digits in base b; here d = 4, b = 256
Space | O(n + b) |
:::

For 32-bit integers that's 4 linear passes. That's genuinely faster than `std::sort` for large $n$, though it's rarely needed in interviews.

## Bucket sort

If values are spread **uniformly** over a range, split the range into $n$ equal buckets, sort each bucket (it holds about 1 element on average), and concatenate. Expected $O(n)$, but the worst case (everything in one bucket) is that of the inner sort. The **pigeonhole** idea behind buckets solves the *Maximum Gap* problem below.

## Heap sort (preview)

Build a max-heap in $O(n)$, then repeatedly swap the maximum to the end and restore the heap: $O(n \log n)$ worst case, in place, not stable. How heaps work is in the Trees module, but you can watch it here:

```viz algo=heap-sort
```

## The big comparison

| Algorithm | Best | Average | Worst | Extra space | Stable | Notes |
|---|---|---|---|---|---|---|
| Insertion | $n$ | $n^2$ | $n^2$ | $1$ | ✅ | small or nearly sorted input |
| Merge | $n\log n$ | $n\log n$ | $n\log n$ | $n$ | ✅ | `stable_sort`, linked lists, external sorting |
| Quick (random) | $n\log n$ | $n\log n$ | $n^2$ (very unlikely) | $\log n$ | ❌ | fastest in practice |
| Heap | $n\log n$ | $n\log n$ | $n\log n$ | $1$ | ❌ | guaranteed and in place |
| Introsort (`std::sort`) | $n\log n$ | $n\log n$ | $n\log n$ | $\log n$ | ❌ | quick + heap + insertion |
| Counting | $n+k$ | $n+k$ | $n+k$ | $n+k$ | ✅ | small integer keys |
| Radix (LSD) | $d(n+b)$ | $d(n+b)$ | $d(n+b)$ | $n+b$ | ✅ | fixed-width integers or strings |

## Problems

:::problem Sort Characters By Frequency {level=medium lc=sort-characters-by-frequency tags="counting sort,hash map"}
Sort the characters of a string by decreasing frequency (ties in any order).

Example: `"tree"` → `"eert"` (or `"eetr"`).

:::hint Hint
Count with an array of 128. Then either sort the 128 (count, char) pairs, or bucket the characters by frequency: frequencies are at most n.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

string frequencySort(const string& s) {
    array<int, 128> cnt{};
    for (char c : s) cnt[c]++;
    vector<string> bucket(s.size() + 1);                 // bucket[f] = chars with frequency f
    for (int c = 0; c < 128; c++) if (cnt[c]) bucket[cnt[c]] += string(cnt[c], (char)c);
    string out;
    for (int f = s.size(); f >= 1; f--) out += bucket[f];
    return out;
}

int main() { cout << frequencySort("tree") << ' ' << frequencySort("cccaaa") << ' ' << frequencySort("Aabb") << '\n'; }
```

:::complexity
Time | O(n) | counting + bucketing
Space | O(n) |
:::
:::
:::

:::problem H-Index {level=medium lc=h-index tags="counting sort"}
`citations[i]` is the number of citations of paper `i`. The h-index is the largest `h` such that at least `h` papers have at least `h` citations each.

Example: `[3,0,6,1,5]` → `3`.

:::hint Hint
`h` is at most `n`. Count papers by citations, capping at `n`. Then walk `h` down from `n`, keeping a running count of papers with ≥ h citations.
:::

:::solution
Sorting gives $O(n \log n)$. Counting sort with the cap gives $O(n)$.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int hIndex(const vector<int>& c) {
    int n = c.size();
    vector<int> cnt(n + 1, 0);
    for (int x : c) cnt[min(x, n)]++;              // anything above n counts as n
    int atLeast = 0;
    for (int h = n; h >= 0; h--) {
        atLeast += cnt[h];                          // papers with >= h citations
        if (atLeast >= h) return h;
    }
    return 0;
}

int main() { cout << hIndex({3, 0, 6, 1, 5}) << ' ' << hIndex({1, 3, 1}) << ' ' << hIndex({100}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::
:::
:::

:::problem Maximum Gap {level=hard lc=maximum-gap tags="bucket sort,pigeonhole"}
Return the maximum difference between successive elements in **sorted** order, in $O(n)$ time and space.

Example: `[3,6,9,1]` → `3`.

:::hint Hint 1
Sorting is $O(n \log n)$. With $n$ values spanning $[\min, \max]$, the largest gap is at least $\lceil (\max-\min)/(n-1) \rceil$. Why?
:::

:::hint Hint 2
Use buckets of that width. The maximum gap can't be **inside** a bucket, so it must be between buckets. You only need each bucket's min and max.
:::

:::solution
**Pigeonhole:** $n-1$ gaps add up to $\max - \min$, so the largest is at least the average gap $(\max-\min)/(n-1)$. With buckets narrower than that, no two elements in the same bucket can form the maximum gap. So compare each non-empty bucket's min with the previous non-empty bucket's max.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int maximumGap(const vector<int>& a) {
    int n = a.size();
    if (n < 2) return 0;
    int lo = *min_element(a.begin(), a.end()), hi = *max_element(a.begin(), a.end());
    if (lo == hi) return 0;
    int width = max(1, (hi - lo) / (n - 1));                  // bucket width ≤ the average gap
    int B = (hi - lo) / width + 1;
    vector<int> bmin(B, INT_MAX), bmax(B, INT_MIN);
    for (int x : a) {
        int b = (x - lo) / width;
        bmin[b] = min(bmin[b], x);
        bmax[b] = max(bmax[b], x);
    }
    int best = 0, prevMax = lo;
    for (int b = 0; b < B; b++) {
        if (bmin[b] == INT_MAX) continue;                     // empty bucket
        best = max(best, bmin[b] - prevMax);
        prevMax = bmax[b];
    }
    return best;
}

int main() { cout << maximumGap({3, 6, 9, 1}) << ' ' << maximumGap({10}) << ' ' << maximumGap({1, 10000000}) << ' ' << maximumGap({1, 1, 1, 5, 5}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::
:::
:::

## Check yourself

```quiz
? Why must a comparison sort's decision tree have at least n! leaves?
+ Each of the n! input orderings needs a different output permutation
- Because there are n! comparisons
- Because the tree is balanced
> Two orderings sharing a leaf means one of them comes out unsorted.

? log₂(n!) is…
- Θ(n)
+ Θ(n log n)
- Θ(n²)
> It's between (n/2)log(n/2) and n log n.

? Why does LSD radix sort need a STABLE sort for each digit?
+ So ties on the current digit keep the order established by the less significant digits
- To use less memory
- It doesn't need stability
> Stability carries the earlier passes' work forward.

? Counting sort is a poor choice when…
+ The keys range up to 10⁹
- n is large
- Stability is needed
> Its O(n + k) time and space depend on the key range k.
```

:::keypoints
- Comparison sorts need $\Omega(n \log n)$: the decision tree has $\ge n!$ leaves and $\log_2 n! = \Theta(n\log n)$. Merge sort and heapsort are optimal.
- Beat it only by not comparing: counting sort $O(n+k)$, radix sort $O(d(n+b))$ (stable passes, least significant digit first), bucket sort expected $O(n)$.
- Pigeonhole + buckets solves Maximum Gap in linear time.
- In practice: `std::sort` (introsort), `stable_sort` when stability matters, counting sort for small keys.
:::
