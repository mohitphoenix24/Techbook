---
title: Two Pointers
level: intermediate
time: 55
summary: Two indexes that move toward each other or in the same direction — the elimination argument that proves it's correct, the three shapes of the pattern, and seven classic problems including 3Sum, Container With Most Water (with proof), Trapping Rain Water and the Dutch national flag.
---

Two pointers turns many $O(n^2)$ pair searches into $O(n)$ scans. The key is that each step **rules out** a whole set of candidates without checking them one by one.

:::def Two pointers
A technique where two indexes walk through the data (often one from each end, or both from the left), and the data's structure (usually sortedness) tells you **which pointer to move**. Each pointer moves at most $n$ times, so the total is $O(n)$.
:::

## The three shapes

:::flow Two-pointer shapes
Opposite ends | l = 0, r = n−1, move inward (pair sums, palindromes, container)
Same direction | slow/fast or read/write (dedupe, move zeroes, windows)
Two sequences | one pointer per array (merge, subsequence check, intersection)
:::

## Opposite ends on a sorted array

Find a pair that sums to `target` in a **sorted** array:

```viz algo=two-pointers
```

:::proof Why it's safe to move the pointer
Suppose $a[l] + a[r] < \text{target}$. Every pair $(l, j)$ with $l < j \le r$ has $a[l] + a[j] \le a[l] + a[r] < \text{target}$, because the array is sorted. So **no pair using index $l$** can work, and we can discard $l$ with `l++`. The case "greater than target" is symmetric, so we discard $r$. Each step discards one index without missing any solution, so after at most $n - 1$ steps we've either found the pair or proved there isn't one.
:::

This **elimination argument** is how you justify every two-pointer solution. In an interview, say it in one sentence: "If the sum is too small, `a[l]` can't be part of any answer, because even its largest partner isn't enough."

## Same direction: slow and fast

The write-pointer technique from the first lesson is a same-direction two pointer: `fast` reads, `slow` writes. On linked lists, fast moves 2 steps while slow moves 1. That's Floyd's algorithm, covered later.

## The Dutch national flag (three pointers)

Sort an array of 0s, 1s and 2s in **one pass**:

```viz algo=dutch-flag
```

## Problems

:::problem Two Sum II - Input Array Is Sorted {level=medium lc=two-sum-ii-input-array-is-sorted tags="two pointers"}
The array is sorted. Return the **1-indexed** positions of two numbers that add up to `target`, using $O(1)$ extra space.

Example: `[2,7,11,15], 9` → `[1,2]`.

:::hint Hint
Opposite ends. If the sum is too small, which pointer must move?
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> twoSum(const vector<int>& a, int target) {
    int l = 0, r = (int)a.size() - 1;
    while (l < r) {
        int s = a[l] + a[r];
        if (s == target) return {l + 1, r + 1};
        if (s < target) l++; else r--;
    }
    return {};
}

int main() {
    auto r = twoSum({2, 7, 11, 15}, 9);
    cout << r[0] << ' ' << r[1] << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem 3Sum {level=medium lc=3sum tags="two pointers,sorting"}
Return all **unique** triplets `[a, b, c]` with `a + b + c = 0`.

Example: `[-1,0,1,2,-1,-4]` → `[[-1,-1,2],[-1,0,1]]`.

:::hint Hint 1
Sort. Fix the first element `a[i]`, then find pairs summing to `-a[i]` in the rest with two pointers. That's $O(n^2)$ overall.
:::

:::hint Hint 2
To avoid duplicate triplets, skip a value equal to the previous one, both for `i` and after recording a triplet.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> threeSum(vector<int> a) {
    sort(a.begin(), a.end());
    int n = a.size();
    vector<vector<int>> out;
    for (int i = 0; i < n - 2; i++) {
        if (i > 0 && a[i] == a[i - 1]) continue;          // same first value: same triplets
        if (a[i] > 0) break;                              // smallest value positive: no zero sum possible
        int l = i + 1, r = n - 1;
        while (l < r) {
            int s = a[i] + a[l] + a[r];
            if (s < 0) l++;
            else if (s > 0) r--;
            else {
                out.push_back({a[i], a[l], a[r]});
                l++; r--;
                while (l < r && a[l] == a[l - 1]) l++;    // skip duplicate seconds
            }
        }
    }
    return out;
}

int main() {
    for (auto& t : threeSum({-1, 0, 1, 2, -1, -4})) cout << '[' << t[0] << ',' << t[1] << ',' << t[2] << "] ";
    cout << '\n';
    cout << threeSum({0, 0, 0, 0}).size() << " triplet(s) for all zeros\n";
}
```

:::complexity
Time | O(n^2) | n choices of i × O(n) two-pointer scan; sorting is O(n log n)
Space | O(1) | extra, ignoring the output and the sort
:::

**Generalising:** k-Sum = sort + (k−2) nested loops + two pointers = $O(n^{k-1})$. 4Sum is $O(n^3)$.
:::
:::

:::problem Container With Most Water {level=medium lc=container-with-most-water tags="two pointers,greedy"}
`height[i]` is a vertical line at position `i`. Choose two lines that, together with the x-axis, hold the most water. Return the area.

Example: `[1,8,6,2,5,4,8,3,7]` → `49` (lines at index 1 and 8: width 7 × height 7).

:::hint Hint 1
Area = `(r - l) * min(h[l], h[r])`. Start with the widest container, l = 0 and r = n−1.
:::

:::hint Hint 2
Which pointer should move? The shorter line limits the area. Can keeping it ever help?
:::

:::solution
Always move the **shorter** line inward.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxArea(const vector<int>& h) {
    int l = 0, r = (int)h.size() - 1, best = 0;
    while (l < r) {
        best = max(best, (r - l) * min(h[l], h[r]));
        if (h[l] < h[r]) l++; else r--;
    }
    return best;
}

int main() { cout << maxArea({1, 8, 6, 2, 5, 4, 8, 3, 7}) << ' ' << maxArea({1, 1}) << '\n'; }
```

:::proof Why moving the shorter line is safe
Say $h[l] \le h[r]$. Any other container that uses line $l$ is $(l, j)$ with $l < j < r$. Its width is smaller ($j - l < r - l$), and its height is $\min(h[l], h[j]) \le h[l]$. So its area is **less** than the current one, $(r - l) \cdot h[l]$. Line $l$ can't beat what we've already recorded, so we discard it. Each step discards one line, giving $O(n)$.
:::

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Trapping Rain Water {level=hard lc=trapping-rain-water tags="two pointers,prefix max"}
Given bar heights, compute how much rain water is trapped between the bars after it rains.

Example: `[0,1,0,2,1,0,1,3,2,1,2,1]` → `6`.

:::hint Hint 1
The water above bar `i` is `min(maxLeft[i], maxRight[i]) - h[i]`. Precomputing both arrays gives $O(n)$ time and $O(n)$ space.
:::

:::hint Hint 2
For $O(1)$ space, use two pointers. If `leftMax < rightMax`, the water at `l` depends only on `leftMax`: the right side is guaranteed to be at least as tall.
:::

:::solution
Keep `leftMax` (the tallest bar in `h[0..l]`) and `rightMax` (the tallest in `h[r..n-1]`). Process whichever side has the **smaller** max.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int trap(const vector<int>& h) {
    int l = 0, r = (int)h.size() - 1, leftMax = 0, rightMax = 0, water = 0;
    while (l < r) {
        leftMax = max(leftMax, h[l]);
        rightMax = max(rightMax, h[r]);
        if (leftMax < rightMax) water += leftMax - h[l++];   // left side is the bottleneck
        else water += rightMax - h[r--];                     // right side is the bottleneck
    }
    return water;
}

int main() { cout << trap({0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1}) << ' ' << trap({4, 2, 0, 3, 2, 5}) << '\n'; }
```

:::proof Why the smaller side is final
Suppose `leftMax < rightMax` when we process `l`. The true water at `l` is $\min(\text{maxLeft}(l), \text{maxRight}(l)) - h[l]$. Here maxLeft(l) is exactly `leftMax`. And maxRight(l) ≥ `rightMax` (it includes `h[r..]` and more), which is greater than `leftMax`. So the minimum is `leftMax`, which we already know. The water at `l` is final even though we haven't seen the middle bars.
:::

:::complexity
Time | O(n) |
Space | O(1) |
:::

There is also a monotonic-stack solution that fills water layer by layer (see *Monotonic Stack*).
:::
:::

:::problem Sort Colors {level=medium lc=sort-colors tags="two pointers,Dutch national flag"}
Sort an array of 0s, 1s and 2s in place in **one pass**, without a library sort.

:::hint Hint
Three regions: `[0, lo)` holds 0s, `[lo, mid)` holds 1s, `(hi, n)` holds 2s, and `[mid, hi]` is unknown. Look at `a[mid]` and shrink the unknown region.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void sortColors(vector<int>& a) {
    int lo = 0, mid = 0, hi = (int)a.size() - 1;
    while (mid <= hi) {
        if (a[mid] == 0) swap(a[lo++], a[mid++]);
        else if (a[mid] == 1) mid++;
        else swap(a[mid], a[hi--]);          // don't advance mid: the swapped-in value is unchecked
    }
}

int main() {
    vector<int> a = {2, 0, 2, 1, 1, 0};
    sortColors(a);
    for (int x : a) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(n) | each step shrinks the unknown region by one
Space | O(1) |
:::
:::
:::

:::problem Squares of a Sorted Array {level=easy lc=squares-of-a-sorted-array tags="two pointers"}
Given a sorted array (it may contain negatives), return the squares of each number, sorted, in $O(n)$.

Example: `[-4,-1,0,3,10]` → `[0,1,9,16,100]`.

:::hint Hint
The **largest** square is at one of the two ends. Fill the output from the back.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> sortedSquares(const vector<int>& a) {
    int n = a.size(), l = 0, r = n - 1;
    vector<int> out(n);
    for (int k = n - 1; k >= 0; k--) {
        if (abs(a[l]) > abs(a[r])) { out[k] = a[l] * a[l]; l++; }
        else { out[k] = a[r] * a[r]; r--; }
    }
    return out;
}

int main() { for (int x : sortedSquares({-4, -1, 0, 3, 10})) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) | extra, besides the output
:::
:::
:::

:::problem Is Subsequence {level=easy lc=is-subsequence tags="two pointers,strings"}
Return whether `s` is a subsequence of `t`: can you delete characters from `t` (without reordering) to get `s`?

Example: `"abc", "ahbgdc"` → `true`.

:::hint Hint
One pointer per string. Greedily match each character of `s` to its earliest possible position in `t`.
:::

:::solution
Greedy matching is optimal: matching a character as early as possible leaves the most room for the rest.

```cpp run
#include <bits/stdc++.h>
using namespace std;

bool isSubsequence(const string& s, const string& t) {
    int i = 0;
    for (char c : t) if (i < (int)s.size() && s[i] == c) i++;
    return i == (int)s.size();
}

int main() { cout << boolalpha << isSubsequence("abc", "ahbgdc") << ' ' << isSubsequence("axc", "ahbgdc") << '\n'; }
```

:::complexity
Time | O(\lvert t \rvert) |
Space | O(1) |
:::

**Follow-up:** many queries `s₁, s₂, …` against the same `t`? Precompute, for each character, the sorted list of its positions in `t`. Then each step is a `upper_bound` binary search: $O(|s| \log |t|)$ per query.
:::
:::

## Check yourself

```quiz
? In the sorted pair-sum search, the sum is too small. Why can we discard a[l]?
+ Even paired with the largest remaining value a[r], it's too small, so it can't be in any answer
- Because a[l] is the smallest element
- Because l < r
> This is the elimination argument.

? 3Sum with sorting + two pointers runs in…
- O(n log n)
+ O(n²)
- O(n³)
> n fixed first elements × an O(n) scan each.

? In Container With Most Water, why move the shorter line?
+ Any narrower container using the shorter line has smaller width and no greater height, so it can't do better
- Moving the taller line is never allowed
- It's a heuristic without proof
> The limiting line is used up.
```

:::keypoints
- Two pointers = discard candidates without checking them one by one. Prove it with an **elimination argument**.
- Shapes: opposite ends (sorted pairs, containers, palindromes), same direction (read/write, fast/slow), two sequences (merge, subsequence).
- k-Sum: sort, fix k−2 elements, then two pointers: $O(n^{k-1})$. Skip duplicates to keep results unique.
- Three pointers (Dutch flag) partition into three groups in one pass.
:::
