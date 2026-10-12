---
title: Array Fundamentals & In-Place Techniques
level: easy
time: 45
summary: How arrays work in memory and what each operation costs, then the core in-place techniques — running best-so-far, the write pointer (compaction), merging from the back, and Boyer–Moore voting (with proof) — applied to six classic interview problems.
---

Arrays are the most common interview data structure. Most array questions are solved by a handful of **techniques**. This lesson covers the basic ones. The next lessons each cover one bigger pattern.

## Arrays in memory

:::def Array
A fixed number of elements of the same type, stored **contiguously** (back to back) in memory. Element `i` lives at address `base + i × sizeof(element)`, so reading or writing any element by index takes $O(1)$.
:::

| Operation | Cost | Notes |
|---|---|---|
| read/write `a[i]` | $O(1)$ | random access |
| scan everything | $O(n)$ | very fast in practice (cache-friendly) |
| insert/delete at the end (`vector`) | $O(1)$ amortized | |
| insert/delete at position `i` | $O(n - i)$ | shift the tail |
| search unsorted | $O(n)$ | |
| search sorted | $O(\log n)$ | binary search |

## Technique 1: carry a running "best so far"

Many "find the best X" questions need just **one pass** that remembers the best value seen so far. The question to ask yourself is: *if I know the answer for the first `i` elements, what do I need to remember to update it with element `i`?*

## Technique 2: the write pointer (compaction)

To remove or filter elements **in place**, keep a `write` index. Read every element with `read`, and copy only the keepers to `a[write++]`. Everything before `write` is the finished result.

:::syntax
```cpp
int write = 0;
for (int read = 0; read < n; read++)
    if (keep(a[read])) a[write++] = a[read];
// a[0 .. write-1] is the answer; write = its length
```
:::

The invariant: **`a[0..write)` holds exactly the kept elements seen so far, in order.** Since `write ≤ read`, we never overwrite an element we haven't read yet.

## Technique 3: fill from the back

When merging into an array that has free space **at the end**, fill from the back. Writing the largest elements first never overwrites anything you still need.

## Problems

:::problem Best Time to Buy and Sell Stock {level=easy lc=best-time-to-buy-and-sell-stock tags="array,running min"}
`prices[i]` is a stock's price on day `i`. Choose one day to buy and a **later** day to sell. Return the maximum profit, or 0 if no profit is possible.

Example: `[7,1,5,3,6,4]` → `5` (buy at 1, sell at 6).

:::hint Hint 1
Brute force: try every pair (buy day < sell day). That's $O(n^2)$.
:::

:::hint Hint 2
If you sell on day `i`, the best buy day is the **cheapest day before `i`**. Keep track of that minimum as you scan.
:::

:::solution
For each sell day, the best profit is `price - (minimum price so far)`. Keep a running minimum and a running best.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxProfit(const vector<int>& prices) {
    int minSoFar = INT_MAX, best = 0;
    for (int p : prices) {
        minSoFar = min(minSoFar, p);      // cheapest buy up to today
        best = max(best, p - minSoFar);   // sell today
    }
    return best;
}

int main() {
    cout << maxProfit({7, 1, 5, 3, 6, 4}) << ' ' << maxProfit({7, 6, 4, 3, 1}) << '\n';
}
```

:::complexity
Time | O(n) | one pass
Space | O(1) |
:::

**Why it's correct:** the optimal answer sells on some day `j` and buys at the minimum of `prices[0..j]`. When the loop reaches day `j`, `minSoFar` is exactly that minimum, so `best` sees the optimal profit.
:::
:::

:::problem Move Zeroes {level=easy lc=move-zeroes tags="array,two pointers,in-place"}
Move all `0`s to the end of the array **in place**, keeping the relative order of the non-zero elements.

Example: `[0,1,0,3,12]` → `[1,3,12,0,0]`.

:::hint Hint
Use a write pointer for the non-zero elements, then fill the rest with zeros. (Or swap as you go, so zeros are written exactly once.)
:::

:::solution
Swapping `a[write]` with `a[read]` whenever `a[read] != 0` keeps the non-zeros in order and pushes the zeros back, in one pass.

```cpp run
#include <bits/stdc++.h>
using namespace std;

void moveZeroes(vector<int>& a) {
    int write = 0;
    for (int read = 0; read < (int)a.size(); read++)
        if (a[read] != 0) swap(a[write++], a[read]);
}

int main() {
    vector<int> a = {0, 1, 0, 3, 12};
    moveZeroes(a);
    for (int x : a) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Remove Duplicates from Sorted Array {level=easy lc=remove-duplicates-from-sorted-array tags="array,two pointers,in-place"}
Given a **sorted** array, remove duplicates in place so each value appears once. Return the new length `k`. The first `k` elements must hold the unique values in order.

Example: `[0,0,1,1,1,2,2,3,3,4]` → `k = 5`, `[0,1,2,3,4,…]`.

:::hint Hint
Because the array is sorted, duplicates are next to each other. Keep an element if it differs from the **last element you kept**.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int removeDuplicates(vector<int>& a) {
    if (a.empty()) return 0;
    int write = 1;                                 // a[0] is always kept
    for (int read = 1; read < (int)a.size(); read++)
        if (a[read] != a[write - 1]) a[write++] = a[read];
    return write;
}

int main() {
    vector<int> a = {0, 0, 1, 1, 1, 2, 2, 3, 3, 4};
    int k = removeDuplicates(a);
    cout << "k = " << k << ":";
    for (int i = 0; i < k; i++) cout << ' ' << a[i];
    cout << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(1) |
:::

**Variant (LeetCode 80):** allow each value **at most twice**. Compare with `a[write - 2]` instead of `a[write - 1]`. The same idea works for "at most k".
:::
:::

:::problem Merge Sorted Array {level=easy lc=merge-sorted-array tags="array,two pointers"}
`nums1` has length `m + n`: its first `m` elements are sorted values and the last `n` are free space. `nums2` holds `n` sorted values. Merge `nums2` into `nums1` in place, so that `nums1` is sorted.

Example: `[1,2,3,0,0,0], m=3`, `[2,5,6], n=3` → `[1,2,2,3,5,6]`.

:::hint Hint
Merging from the front would overwrite values of `nums1` you haven't used yet. Where is the free space?
:::

:::solution
Fill from the back. At each step, place the larger of the two last elements at position `k`. This is safe: `k` is always at or beyond the current end of `nums1`'s unread data.

```cpp run
#include <bits/stdc++.h>
using namespace std;

void merge(vector<int>& a, int m, const vector<int>& b, int n) {
    int i = m - 1, j = n - 1, k = m + n - 1;
    while (j >= 0) {                                  // once b is used up, a's prefix is already in place
        if (i >= 0 && a[i] > b[j]) a[k--] = a[i--];
        else a[k--] = b[j--];
    }
}

int main() {
    vector<int> a = {1, 2, 3, 0, 0, 0};
    merge(a, 3, {2, 5, 6}, 3);
    for (int x : a) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(m + n) |
Space | O(1) |
:::
:::
:::

:::problem Majority Element {level=easy lc=majority-element tags="array,Boyer-Moore,counting"}
Return the element that appears **more than ⌊n/2⌋ times** (it's guaranteed to exist). Follow-up: $O(n)$ time and $O(1)$ space.

Example: `[2,2,1,1,1,2,2]` → `2`.

:::hint Hint 1
A hash map of counts is $O(n)$ space. Sorting and taking the middle element is $O(n \log n)$. Can you do better?
:::

:::hint Hint 2
Pair up each occurrence of the majority with a **different** element and cancel both. Because the majority is more than half, some copies of it must survive.
:::

:::solution
**Boyer–Moore voting.** Keep a `candidate` and a `count`. A matching element increments the count, a different one decrements it, and when the count is 0 the next element becomes the new candidate.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int majorityElement(const vector<int>& a) {
    int candidate = 0, count = 0;
    for (int x : a) {
        if (count == 0) candidate = x;
        count += (x == candidate) ? 1 : -1;
    }
    return candidate;
}

int main() {
    cout << majorityElement({2, 2, 1, 1, 1, 2, 2}) << ' ' << majorityElement({3, 2, 3}) << '\n';
}
```

:::proof Why Boyer–Moore finds the majority
**Invariant:** after processing a prefix, that prefix can be split into (1) **pairs of two different values** that cancelled each other, and (2) `count` copies of `candidate` that are still unmatched. A match grows part (2). A mismatch pairs the new element with one unmatched copy of the candidate, which is a pair of different values. When `count` is 0, part (2) is empty and a new candidate starts.

At the end, each pair contains **at most one** copy of the majority value $m$, and there are $(n - 	ext{count})/2$ pairs. If the final candidate were not $m$, every copy of $m$ would be inside a pair. Then $m$ would appear at most $(n - 	ext{count})/2 \le n/2$ times, contradicting that $m$ appears more than $n/2$ times. So the final candidate is $m$.
:::

:::complexity
Time | O(n) |
Space | O(1) |
:::

If a majority isn't **guaranteed**, do a second pass to count the candidate and verify it.
:::
:::

:::problem Find the Index of the First Occurrence in a String {level=easy lc=find-the-index-of-the-first-occurrence-in-a-string tags="string,brute force"}
Return the index of the first occurrence of `needle` in `haystack`, or `-1`.

Example: `"sadbutsad", "sad"` → `0`.

:::hint Hint
Try every starting position and compare character by character. What's the worst case?
:::

:::solution
The brute force is $O(n \cdot m)$ in the worst case (e.g. `haystack = "aaaa…a"`, `needle = "aa…ab"`). For interviews this is usually accepted, but mention that **KMP** gives $O(n + m)$ (see *String Algorithms*).

```cpp run
#include <bits/stdc++.h>
using namespace std;

int strStr(const string& h, const string& nd) {
    int n = h.size(), m = nd.size();
    for (int i = 0; i + m <= n; i++) {
        int j = 0;
        while (j < m && h[i + j] == nd[j]) j++;
        if (j == m) return i;
    }
    return -1;
}

int main() {
    cout << strStr("sadbutsad", "sad") << ' ' << strStr("leetcode", "leeto") << ' ' << strStr("abc", "") << '\n';
}
```

:::complexity
Time | O(n \cdot m) | worst case; usually much faster
Space | O(1) |
:::
:::
:::

## Check yourself

```quiz
? What invariant does the write-pointer technique maintain?
+ a[0..write) holds exactly the kept elements seen so far, in order
- a is always sorted
- write always equals read
> And since write ≤ read, unread data is never overwritten.

? Why merge from the back in "Merge Sorted Array"?
+ The free space is at the end, so writing large elements there never overwrites unread values
- It's faster
- Arrays can only be written backwards
> Writing from the front would clobber nums1's own data.

? Boyer–Moore voting needs how much extra space?
+ O(1)
- O(n)
- O(log n)
> Just a candidate and a counter.
```

:::keypoints
- Arrays give $O(1)$ indexing and cheap scans; inserting in the middle costs $O(n)$.
- **Running best:** ask what state you must remember to extend the answer by one element.
- **Write pointer:** `a[write++] = a[read]` filters in place in $O(n)$.
- **Fill from the back** when the free space is at the end.
- **Boyer–Moore voting** finds a majority element in $O(n)$ time and $O(1)$ space.
:::
