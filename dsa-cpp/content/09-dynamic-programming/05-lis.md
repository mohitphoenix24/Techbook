---
title: Longest Increasing Subsequence
level: advanced
time: 50
summary: LIS two ways — the O(n²) DP (best ending at i) and the O(n log n) patience method with a "tails" array, including the proof that tails stays sorted and that its length is the answer, how to reconstruct the actual sequence, counting LIS, and the 2D variant Russian Doll Envelopes (sort by width ascending, height descending).
---

The **longest increasing subsequence** shows up directly and in disguise: chains of pairs, stacking boxes, scheduling, and nesting envelopes. It also teaches a valuable lesson: a DP can sometimes be sped up by keeping a **cleverer state** plus binary search.

:::def Subsequence
Elements taken from an array **in their original order**, not necessarily next to each other. `[2, 5, 7]` is a subsequence of `[2, 9, 5, 1, 7]`. A *subarray* would have to be contiguous.
:::

## O(n²): best ending at i

:::derive LIS by DP
dp[i] = \text{length of the longest increasing subsequence ending exactly at } i || "ending here", like Kadane
dp[i] = 1 + \max\{\, dp[j] : j < i,\; a[j] < a[i] \,\} \;(\text{or } 1) || extend the best earlier run that a[i] can follow
\text{answer} = \max_i dp[i] || it can end anywhere
! O(n^2) \text{ time, } O(n) \text{ space} || n states × O(n) transition
:::

## O(n log n): patience sorting

Keep `tails[k]` = the **smallest possible last element** of an increasing subsequence of length `k+1` found so far. For each new `x`:
- if `x` is bigger than every tail, **append** it (the longest run gets longer);
- otherwise **replace** the first tail that is ≥ `x` (found with `lower_bound`). A run of that length can now end at a smaller value, which can only help later.

```viz algo=lis
```

:::proof Why tails is sorted, and its length is the LIS length
**Sorted:** if `tails[k] ≥ tails[k+1]`, take the run of length $k+2$ ending at `tails[k+1]`. Its first $k+1$ elements form a run of length $k+1$ ending at a value smaller than `tails[k+1]` ≤ `tails[k]`. That contradicts `tails[k]` being the smallest such ending. So `tails` is strictly increasing, and binary search works on it.
**Length = LIS:** `tails[k]` is always the end of a real increasing subsequence of length $k+1$, so the LIS is at least `tails.size()`. In the other direction, take an increasing subsequence $x_1 < x_2 < \cdots < x_L$ of the input. After $x_1$ is processed some tail is ≤ $x_1$; after $x_2$ there is a tail ≤ $x_2$ at an index at least 1; and in general, after processing $x_j$, `tails[j−1]` exists and is ≤ $x_j$. So `tails.size()` ≥ $L$.
:::

:::warn tails is not the LIS
`tails` holds the right **length**, but its elements may come from different subsequences. In `[3, 4, 1]`, tails ends as `[1, 4]`, which isn't a subsequence. To reconstruct a real LIS, store for each element the index it attached after (its predecessor).
:::

```cpp run level=intermediate title="O(n²) DP vs O(n log n) patience, with reconstruction"
#include <bits/stdc++.h>
using namespace std;

int lisQuadratic(const vector<int>& a) {
    int n = a.size(), best = 0;
    vector<int> dp(n, 1);
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < i; j++) if (a[j] < a[i]) dp[i] = max(dp[i], dp[j] + 1);
        best = max(best, dp[i]);
    }
    return best;
}

vector<int> lisReconstruct(const vector<int>& a) {
    vector<int> tailsVal, tailsIdx, prev(a.size(), -1);
    for (int i = 0; i < (int)a.size(); i++) {
        int k = lower_bound(tailsVal.begin(), tailsVal.end(), a[i]) - tailsVal.begin();
        if (k > 0) prev[i] = tailsIdx[k - 1];          // a[i] extends the run of length k
        if (k == (int)tailsVal.size()) { tailsVal.push_back(a[i]); tailsIdx.push_back(i); }
        else { tailsVal[k] = a[i]; tailsIdx[k] = i; }
    }
    vector<int> seq;
    for (int i = tailsIdx.empty() ? -1 : tailsIdx.back(); i != -1; i = prev[i]) seq.push_back(a[i]);
    reverse(seq.begin(), seq.end());
    return seq;
}

int main() {
    vector<int> a = {10, 9, 2, 5, 3, 7, 101, 18, 4, 19};
    auto seq = lisReconstruct(a);
    cout << "O(n^2): " << lisQuadratic(a) << ", O(n log n): " << seq.size() << ", one LIS:";
    for (int x : seq) cout << ' ' << x;
    cout << '\n';
}
```

## Problems

:::problem Longest Increasing Subsequence {level=medium lc=longest-increasing-subsequence tags="dynamic programming,binary search"}
Return the length of the longest **strictly** increasing subsequence.

Example: `[10,9,2,5,3,7,101,18]` → `4`.

:::hint Hint
Start with the $O(n^2)$ DP, then improve it to $O(n \log n)$ with tails + `lower_bound`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int lengthOfLIS(const vector<int>& a) {
    vector<int> tails;
    for (int x : a) {
        auto it = lower_bound(tails.begin(), tails.end(), x);    // strictly increasing: lower_bound
        if (it == tails.end()) tails.push_back(x);
        else *it = x;
    }
    return tails.size();
}

int main() { cout << lengthOfLIS({10, 9, 2, 5, 3, 7, 101, 18}) << ' ' << lengthOfLIS({0, 1, 0, 3, 2, 3}) << ' ' << lengthOfLIS({7, 7, 7, 7}) << '\n'; }
```

:::complexity
Time | O(n \log n) |
Space | O(n) |
:::

For the longest **non-decreasing** subsequence, use `upper_bound` instead (equal values can extend a run).
:::
:::

:::problem Number of Longest Increasing Subsequence {level=medium lc=number-of-longest-increasing-subsequence tags="dynamic programming,counting"}
Return **how many** longest strictly increasing subsequences there are.

Example: `[1,3,5,4,7]` → `2` (`1,3,4,7` and `1,3,5,7`).

:::hint Hint
Alongside `len[i]` (the LIS ending at i), keep `cnt[i]` = how many subsequences achieve that length. When `len[j]+1 > len[i]`, replace the count; when it's equal, add to it.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findNumberOfLIS(const vector<int>& a) {
    int n = a.size(), best = 0;
    vector<int> len(n, 1), cnt(n, 1);
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < i; j++) {
            if (a[j] >= a[i]) continue;
            if (len[j] + 1 > len[i]) { len[i] = len[j] + 1; cnt[i] = cnt[j]; }   // a strictly better run
            else if (len[j] + 1 == len[i]) cnt[i] += cnt[j];                      // another way to tie
        }
        best = max(best, len[i]);
    }
    int total = 0;
    for (int i = 0; i < n; i++) if (len[i] == best) total += cnt[i];
    return total;
}

int main() { cout << findNumberOfLIS({1, 3, 5, 4, 7}) << ' ' << findNumberOfLIS({2, 2, 2, 2, 2}) << '\n'; }
```

:::complexity
Time | O(n^2) | (O(n log n) is possible with a Fenwick tree over (length, count) pairs)
Space | O(n) |
:::
:::
:::

:::problem Russian Doll Envelopes {level=hard lc=russian-doll-envelopes tags="LIS,sorting,2D"}
An envelope fits inside another if **both** its width and height are strictly smaller. What's the maximum number of envelopes you can nest?

Example: `[[5,4],[6,4],[6,7],[2,3]]` → `3` (`[2,3] → [5,4] → [6,7]`).

:::hint Hint 1
Sort by width, then find the LIS of the heights. But two envelopes with the **same width** can't nest, and the LIS might still pick both.
:::

:::hint Hint 2
Sort by width ascending and, **for equal widths, by height descending**. Then equal widths can never both appear in a strictly increasing run of heights.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxEnvelopes(vector<vector<int>> e) {
    sort(e.begin(), e.end(), [](const vector<int>& a, const vector<int>& b) {
        return a[0] != b[0] ? a[0] < b[0] : a[1] > b[1];      // width up; for equal widths, height DOWN
    });
    vector<int> tails;
    for (auto& x : e) {
        auto it = lower_bound(tails.begin(), tails.end(), x[1]);
        if (it == tails.end()) tails.push_back(x[1]); else *it = x[1];
    }
    return tails.size();
}

int main() { cout << maxEnvelopes({{5, 4}, {6, 4}, {6, 7}, {2, 3}}) << ' ' << maxEnvelopes({{1, 1}, {1, 1}, {1, 1}}) << ' ' << maxEnvelopes({{4, 5}, {4, 6}, {6, 7}, {2, 3}, {1, 1}}) << '\n'; }
```

:::complexity
Time | O(n \log n) |
Space | O(n) |
:::

This **sort one dimension, LIS on the other** trick solves many 2D chain problems: box stacking, Maximum Length of Pair Chain (sort by end, then greedy), and the "Russian doll" family.
:::
:::

## Check yourself

```quiz
? In the patience LIS algorithm, tails[k] is…
+ The smallest possible ending value of an increasing subsequence of length k+1
- The k-th element of the LIS
- The number of subsequences of length k
> Small tails leave the most room to extend.

? For the longest NON-decreasing subsequence, use…
- lower_bound
+ upper_bound
- binary_search
> Equal values may extend a run, so replace the first element strictly greater.

? In Russian Doll Envelopes, why sort equal widths by height DESCENDING?
+ So two envelopes with the same width can't both be in a strictly increasing height sequence
- To make the LIS longer
- Because of stability
> Their heights then appear in decreasing order, which a strictly increasing run can't use twice.
```

:::keypoints
- LIS DP: `dp[i] = 1 + max dp[j]` over `j < i` with `a[j] < a[i]`. $O(n^2)$.
- Patience: keep `tails` sorted. Append, or replace with `lower_bound`. $O(n\log n)$. `upper_bound` for non-decreasing.
- `tails` gives the length, not the sequence. Store predecessors to reconstruct.
- Count LIS with `(len, cnt)` pairs. For 2D nesting: sort width ↑ and height ↓, then LIS on the heights.
:::
