---
title: Space Complexity & Memory Trade-offs
level: intermediate
time: 30
summary: Measuring memory the way interviewers do — auxiliary vs total space, the hidden cost of recursion (stack depth), in-place algorithms, fitting into memory limits, and the classic trade of space for time (and back). Includes O(1)-space tricks like index marking and cyclic sort.
---

Interviewers ask "and the space complexity?" right after time. Often the follow-up is "**can you do it in O(1) extra space?**" This lesson gives you the vocabulary and the tricks.

## What counts

:::def Space complexity
The amount of **memory an algorithm uses** as a function of the input size $n$, in Big-O.
:::

:::def Auxiliary space
The **extra** memory used beyond the input itself. This is what interviewers almost always mean by "space complexity". Reversing an array in place uses $O(1)$ auxiliary space, even though the array itself is $O(n)$.
:::

Things that use space:

| Source | Example | Cost |
|---|---|---|
| New containers | a copy of the input, a hash map, a DP table | their size |
| **The recursion stack** | each active call keeps its locals and return address | $O(\text{max depth})$ |
| The output | returning all subsets | often excluded, but say so |
| Fixed-size helpers | `int cnt[26]`, a few variables | $O(1)$ |

## The hidden cost: recursion depth

```cpp run level=easy title="Same answer, different space"
#include <bits/stdc++.h>
using namespace std;

long long sumRec(const vector<int>& a, int i) {     // O(n) stack frames alive at the deepest point
    if (i == (int)a.size()) return 0;
    return a[i] + sumRec(a, i + 1);
}

long long sumIter(const vector<int>& a) {          // O(1) auxiliary space
    long long s = 0;
    for (int x : a) s += x;
    return s;
}

int main() {
    vector<int> a(10000, 3);
    cout << sumRec(a, 0) << ' ' << sumIter(a) << '\n';
}
```

Both are $O(n)$ time. The recursive one also uses $O(n)$ **stack space**. With $n = 10^7$ it would overflow the default stack (typically 1–8 MB) and crash.

:::tip Recursion depth by structure
- Linear recursion (`f(n-1)`): depth $n$.
- Balanced divide and conquer (`f(n/2)` twice): depth $\log n$. Merge sort's recursion stack is only $O(\log n)$; its $O(n)$ space comes from the merge buffer.
- Tree DFS: depth = **height** $h$. That's $O(\log n)$ for a balanced tree but $O(n)$ for a skewed one (a "linked list" tree).
:::

## Memory limits in practice

A typical limit is 256 MB. Quick math:

| Type | Bytes | How many fit in 256 MB |
|---|---|---|
| `bool` / `char` | 1 | ~2.7·10⁸ |
| `int` | 4 | ~6.7·10⁷ |
| `long long` / `double` | 8 | ~3.3·10⁷ |
| `vector<bitset>` bit | 1/8 | ~2·10⁹ bits |

So a $10^4 \times 10^4$ `int` table (400 MB) **doesn't fit**, but $5000 \times 5000$ (100 MB) does. A DP over $n \times m$ states might need the rolling-array trick: keep only the last row, and $O(nm)$ memory becomes $O(m)$. You'll see that in the DP module.

## In-place algorithms

:::def In-place
An algorithm that transforms its input using only $O(1)$ (sometimes $O(\log n)$) extra memory, by **overwriting the input**.
:::

Common in-place techniques:

- **Swap from both ends:** reversing, partitioning.
- **Write pointer:** compact the "kept" elements to the front (remove duplicates, move zeros).
- **Reuse the input as a hash table:** mark visits by negating `a[x]`, or put each value `x` at index `x`.
- **Store extra info in unused bits** or in the first row/column of a matrix.

```cpp run level=intermediate title="Rotate an array by k in O(1) extra space (three reversals)"
#include <bits/stdc++.h>
using namespace std;

void rotateRight(vector<int>& a, int k) {
    int n = a.size();
    k %= n;
    reverse(a.begin(), a.end());              // [7 6 5 4 3 2 1]
    reverse(a.begin(), a.begin() + k);        // [5 6 7 | 4 3 2 1]
    reverse(a.begin() + k, a.end());          // [5 6 7 | 1 2 3 4]
}

int main() {
    vector<int> a = {1, 2, 3, 4, 5, 6, 7};
    rotateRight(a, 3);
    for (int x : a) cout << x << ' ';
    cout << '\n';
}
```

:::proof Why three reversals rotate the array
Write the array as $A\,B$, where $B$ is the last $k$ elements. We want $B\,A$. Reversing everything gives $(A\,B)^R = B^R A^R$. Reversing each part separately turns $B^R$ back into $B$ and $A^R$ into $A$, giving $B\,A$. Each element moves a constant number of times: $O(n)$ time, $O(1)$ space.
:::

## Trading space for time (and back)

| Problem | Low space | Fast |
|---|---|---|
| Find a duplicate | compare all pairs: $O(n^2)$ time, $O(1)$ space | hash set: $O(n)$ time, $O(n)$ space |
| Range sums | recompute: $O(n)$ per query, $O(1)$ space | prefix sums: $O(1)$ per query, $O(n)$ space |
| Fibonacci | recompute: exponential | memo table: $O(n)$ time and space → rolling: $O(n)$ time, $O(1)$ space |

:::interview
When asked to optimise, be explicit about which resource you're trading: "I can make this O(n) time if I spend O(n) memory on a hash set. If memory is tight, sorting first gives O(n log n) time with O(1) extra space." Showing that you see the trade-off is worth more than the trick itself.
:::

## Problems

:::problem Find All Numbers Disappeared in an Array {level=easy lc=find-all-numbers-disappeared-in-an-array tags="array,in-place,O(1) space"}
`nums` has length `n` and every value is in `[1, n]`. Some values appear twice and others are missing. Return all missing values, using **O(1) extra space** (the output list doesn't count).

Example: `[4,3,2,7,8,2,3,1]` → `[5,6]`.

:::hint Hint 1
With a hash set it's easy, but that's O(n) space. The values themselves are valid indexes. Can the array remember "I've seen value v" somewhere?
:::

:::hint Hint 2
For each value `v`, make `nums[v-1]` negative. Afterwards, the indexes still holding positive numbers are the missing values. Use `abs()` when reading, since some entries are already negated.
:::

:::solution
The sign bit of each position works as a free boolean "seen" flag.

```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> findDisappearedNumbers(vector<int> nums) {
    for (int x : nums) {
        int i = abs(x) - 1;                 // the index this value points to
        if (nums[i] > 0) nums[i] = -nums[i];  // mark as seen
    }
    vector<int> missing;
    for (int i = 0; i < (int)nums.size(); i++)
        if (nums[i] > 0) missing.push_back(i + 1);
    return missing;
}

int main() {
    for (int x : findDisappearedNumbers({4, 3, 2, 7, 8, 2, 3, 1})) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(n) | two passes
Space | O(1) | extra; the sign bits of the input are reused (restore them with abs() if you must)
:::
:::
:::

:::problem First Missing Positive {level=hard lc=first-missing-positive tags="array,cyclic sort,O(1) space"}
Given an unsorted integer array, return the smallest **positive** integer that isn't in it. You must use $O(n)$ time and $O(1)$ extra space.

Examples: `[1,2,0]` → `3`, `[3,4,-1,1]` → `2`, `[7,8,9,11,12]` → `1`.

:::hint Hint 1
The answer is always in $[1, n+1]$: an array of $n$ numbers can't contain all of $1 \ldots n+1$.
:::

:::hint Hint 2
**Cyclic sort**: try to put every value `v` in `[1, n]` at index `v-1` by swapping. Afterwards, the first index `i` with `nums[i] != i+1` gives the answer `i+1`.
:::

:::solution
Each swap puts at least one value in its final home, so there are at most $n$ swaps in total. The `while` loop is amortized $O(n)$, not $O(n^2)$.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int firstMissingPositive(vector<int> a) {
    int n = a.size();
    for (int i = 0; i < n; i++)
        // keep swapping a[i] into its home while it's in range and the home doesn't already hold it
        while (a[i] >= 1 && a[i] <= n && a[a[i] - 1] != a[i])
            swap(a[i], a[a[i] - 1]);
    for (int i = 0; i < n; i++)
        if (a[i] != i + 1) return i + 1;
    return n + 1;
}

int main() {
    cout << firstMissingPositive({1, 2, 0}) << ' ' << firstMissingPositive({3, 4, -1, 1}) << ' '
         << firstMissingPositive({7, 8, 9, 11, 12}) << ' ' << firstMissingPositive({1, 1}) << '\n';
}
```

:::complexity
Time | O(n) | amortized: each swap places one value permanently
Space | O(1) |
:::

The check `a[a[i]-1] != a[i]` (not `a[i] != i+1`) is what stops an infinite loop on duplicates like `[1, 1]`.
:::
:::

## Check yourself

```quiz
? What is the auxiliary space of recursive DFS on a skewed tree with n nodes?
- O(1)
- O(log n)
+ O(n)
> The recursion depth equals the height, which is n for a skewed tree.

? Merge sort's extra space is…
- O(1)
- O(log n) only
+ O(n), from the merge buffer (the recursion stack is O(log n))
> The temporary array dominates.

? A 10⁴ × 10⁴ table of long long needs about…
- 80 MB
+ 800 MB
- 8 GB
> 10⁸ × 8 bytes = 800 MB, too much for a typical 256 MB limit.
```

:::keypoints
- Interview "space complexity" means **auxiliary** space; say whether you count the output.
- Recursion costs $O(\text{depth})$ stack space, which is easy to forget.
- Memory math: 256 MB ≈ 6.7·10⁷ ints. Use rolling arrays or bitsets when tables get big.
- In-place tricks: two ends, write pointer, sign marking, cyclic sort, reversals.
- Most optimisations trade space for time. Say which way you're trading.
:::
