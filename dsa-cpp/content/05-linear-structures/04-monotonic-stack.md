---
title: Monotonic Stack
level: advanced
time: 55
summary: A stack kept in sorted order answers "next/previous greater or smaller element" for every index in O(n) total. The four variants and how to pick one, the amortized proof, circular arrays, Largest Rectangle in Histogram (with proof), the contribution technique (Sum of Subarray Minimums), Online Stock Span and Remove K Digits.
---

"For each element, find the **next** element to the right that is **greater**." Doing it naively is $O(n^2)$. A **monotonic stack** does it in $O(n)$, and the same machinery solves histogram, stock span and "remove digits" problems.

:::def Monotonic stack
A stack whose elements (usually **indexes**) are kept in increasing or decreasing order of their values. Before pushing a new element, pop everything that would break the order. **Each popped element has just found its answer**: the element that caused it to be popped.
:::

```viz algo=monotonic-stack
```

## The four variants

| You want, for each `i` | Keep the stack | Pop while | Answer for the popped index |
|---|---|---|---|
| next **greater** to the right | decreasing | `a[top] < a[i]` | `a[i]` (or `i`) |
| next **smaller** to the right | increasing | `a[top] > a[i]` | `a[i]` |
| previous **greater** to the left | decreasing | `a[top] <= a[i]` | after popping, the top is the answer for `i` |
| previous **smaller** to the left | increasing | `a[top] >= a[i]` | after popping, the top is the answer for `i` |

:::tip Remember it as
"I'm looking for something **greater**, so I keep a **decreasing** stack: anything smaller than the new element can never be anyone's 'next greater' again, because the new element blocks it." Store **indexes**, not values: you usually need distances or positions.
:::

:::proof Why it's O(n)
Each index is pushed exactly once and popped at most once. So the total number of pops over the whole run is at most $n$, even though one step may pop many elements. Total work: $O(n)$, amortized $O(1)$ per element.
:::

## Problems

:::problem Daily Temperatures {level=medium lc=daily-temperatures tags="monotonic stack"}
For each day, return how many days you'd wait for a **warmer** temperature (0 if never).

Example: `[73,74,75,71,69,72,76,73]` → `[1,1,4,2,1,1,0,0]`.

:::hint Hint
Next greater element, but the answer is a **distance**, so store indexes.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> dailyTemperatures(const vector<int>& t) {
    int n = t.size();
    vector<int> ans(n, 0), st;                         // st: indexes, temperatures decreasing
    for (int i = 0; i < n; i++) {
        while (!st.empty() && t[st.back()] < t[i]) {
            ans[st.back()] = i - st.back();            // day i is the first warmer day
            st.pop_back();
        }
        st.push_back(i);
    }
    return ans;
}

int main() { for (int x : dailyTemperatures({73, 74, 75, 71, 69, 72, 76, 73})) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::
:::
:::

:::problem Next Greater Element II {level=medium lc=next-greater-element-ii tags="monotonic stack,circular array"}
The array is **circular**: after the last element comes the first. Return the next greater value for each element, or −1.

Example: `[1,2,1]` → `[2,-1,2]`.

:::hint Hint
Loop over the indexes **twice** (`i` from 0 to 2n−1, using `i % n`). The second pass lets elements near the end see elements at the start. Only push during the first pass.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> nextGreaterElements(const vector<int>& a) {
    int n = a.size();
    vector<int> ans(n, -1), st;
    for (int i = 0; i < 2 * n; i++) {
        int x = a[i % n];
        while (!st.empty() && a[st.back()] < x) { ans[st.back()] = x; st.pop_back(); }
        if (i < n) st.push_back(i);
    }
    return ans;
}

int main() { for (int x : nextGreaterElements({1, 2, 3, 4, 3})) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::
:::
:::

:::problem Largest Rectangle in Histogram {level=hard lc=largest-rectangle-in-histogram tags="monotonic stack"}
Bars have width 1 and the given heights. Return the area of the largest rectangle that fits inside the histogram.

Example: `[2,1,5,6,2,3]` → `10` (heights 5 and 6, width 2).

:::hint Hint 1
The best rectangle's height is the height of some bar `i`, extended left and right while the bars are at least `h[i]`. So you need the previous smaller and next smaller element of every bar.
:::

:::hint Hint 2
With an **increasing** stack, when bar `i` pops bar `t`, then `i` is t's next smaller bar, and the new stack top is t's previous smaller bar. So you get the width immediately.
:::

:::solution
Add a sentinel bar of height 0 at the end so every bar gets popped.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int largestRectangleArea(vector<int> h) {
    h.push_back(0);                                        // sentinel: flushes the stack
    vector<int> st;                                        // indexes with increasing heights
    int best = 0;
    for (int i = 0; i < (int)h.size(); i++) {
        while (!st.empty() && h[st.back()] >= h[i]) {
            int height = h[st.back()]; st.pop_back();
            int left = st.empty() ? -1 : st.back();        // previous smaller bar
            best = max(best, height * (i - left - 1));     // i is the next smaller bar
        }
        st.push_back(i);
    }
    return best;
}

int main() { cout << largestRectangleArea({2, 1, 5, 6, 2, 3}) << ' ' << largestRectangleArea({2, 4}) << ' ' << largestRectangleArea({3, 3, 3}) << '\n'; }
```

:::proof Why every optimal rectangle gets measured
Take an optimal rectangle. Its height equals the height of its shortest bar $t$ (otherwise it could be taller). It can't extend past $t$'s previous smaller bar $L$ or next smaller bar $R$, and it should reach both (to be widest), so its width is $R - L - 1$. When the scan reaches $R$, bar $t$ is popped, the stack top below it is exactly $L$, and the code computes $h[t] \cdot (R - L - 1)$, which is that rectangle. With equal heights (`>=`), one of the tied bars computes the full width.
:::

:::complexity
Time | O(n) |
Space | O(n) |
:::

**Maximal Rectangle** (LeetCode 85, the largest rectangle of 1s in a binary matrix) is this problem run once per row, on column heights of consecutive 1s: $O(RC)$.
:::
:::

:::problem Sum of Subarray Minimums {level=medium lc=sum-of-subarray-minimums tags="monotonic stack,contribution technique"}
Return the sum of `min(subarray)` over **all** contiguous subarrays, modulo $10^9+7$.

Example: `[3,1,2,4]` → `17`.

:::hint Hint 1
There are $O(n^2)$ subarrays, too many to enumerate. Flip the question: for each element `a[i]`, in **how many subarrays is it the minimum**?
:::

:::hint Hint 2
If `L` is the distance to the previous smaller element and `R` the distance to the next smaller element, `a[i]` is the minimum of `L × R` subarrays. To count ties once, use "strictly smaller" on one side and "smaller or equal" on the other.
:::

:::solution
**Contribution technique:** $\text{answer} = \sum_i a[i] \cdot \text{left}[i] \cdot \text{right}[i]$.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int sumSubarrayMins(const vector<int>& a) {
    const long long MOD = 1e9 + 7;
    int n = a.size();
    vector<int> left(n), right(n), st;
    for (int i = 0; i < n; i++) {                            // previous STRICTLY smaller
        while (!st.empty() && a[st.back()] >= a[i]) st.pop_back();
        left[i] = st.empty() ? i + 1 : i - st.back();
        st.push_back(i);
    }
    st.clear();
    for (int i = n - 1; i >= 0; i--) {                       // next smaller OR EQUAL (counts ties once)
        while (!st.empty() && a[st.back()] > a[i]) st.pop_back();
        right[i] = st.empty() ? n - i : st.back() - i;
        st.push_back(i);
    }
    long long ans = 0;
    for (int i = 0; i < n; i++) ans = (ans + (long long)a[i] * left[i] % MOD * right[i]) % MOD;
    return ans;
}

int main() { cout << sumSubarrayMins({3, 1, 2, 4}) << ' ' << sumSubarrayMins({11, 81, 94, 43, 3}) << ' ' << sumSubarrayMins({2, 2, 2}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::

The contribution technique ("how much does each element add to the total?") is a powerful general idea. Variants: sum of subarray ranges (max − min), sum of all subarray sums ($a[i] \cdot (i+1)(n-i)$).
:::
:::

:::problem Online Stock Span {level=medium lc=online-stock-span tags="monotonic stack,design,online"}
Prices arrive one per day. For each, return its **span**: the number of consecutive days up to and including today with a price ≤ today's.

Example: prices `100,80,60,70,60,75,85` → spans `1,1,1,2,1,4,6`.

:::hint Hint
Previous greater element, online. Keep a decreasing stack of `(price, span)`. When a new price is ≥ the top, absorb the top's span and pop it.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

class StockSpanner {
public:
    int next(int price) {
        int span = 1;
        while (!st.empty() && st.back().first <= price) { span += st.back().second; st.pop_back(); }
        st.push_back({price, span});
        return span;
    }
private:
    vector<pair<int, int>> st;            // (price, span), prices strictly decreasing
};

int main() {
    StockSpanner s;
    for (int p : {100, 80, 60, 70, 60, 75, 85}) cout << s.next(p) << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(1) | amortized per call
Space | O(n) |
:::
:::
:::

:::problem Remove K Digits {level=medium lc=remove-k-digits tags="monotonic stack,greedy"}
Remove `k` digits from the number string `num` to make the **smallest** possible number. Strip leading zeros, and return `"0"` if nothing is left.

Example: `"1432219", k=3` → `"1219"`.

:::hint Hint
A smaller digit **earlier** matters more than anything after it. While the previous digit is bigger than the current one and you still have removals left, remove the previous digit.
:::

:::solution
Greedy with an increasing stack. If removals are left at the end, cut from the back (the stack is non-decreasing there).

```cpp run
#include <bits/stdc++.h>
using namespace std;

string removeKdigits(const string& num, int k) {
    string st;
    for (char c : num) {
        while (k > 0 && !st.empty() && st.back() > c) { st.pop_back(); k--; }
        st.push_back(c);
    }
    st.resize(st.size() - min<size_t>(k, st.size()));     // remaining removals from the end
    size_t nz = st.find_first_not_of('0');
    return nz == string::npos ? "0" : st.substr(nz);
}

int main() { cout << removeKdigits("1432219", 3) << ' ' << removeKdigits("10200", 1) << ' ' << removeKdigits("10", 2) << ' ' << removeKdigits("112", 1) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::

**Why the greedy is right:** if `num[i] > num[i+1]`, removing `num[i]` makes position `i` smaller, and that beats any change further right. If the digits are non-decreasing, removing the last digit is best.
:::
:::

## Check yourself

```quiz
? To find the next GREATER element, keep the stack…
+ Decreasing (pop while the top is smaller than the new element)
- Increasing
- Sorted by index only
> Smaller elements are blocked by the new, larger one and can't be anyone's answer later.

? Why is the monotonic stack O(n) despite the inner while loop?
+ Each index is pushed once and popped at most once
- The while loop runs at most twice
- Because the stack is sorted
> Amortized analysis: total pops ≤ n.

? In Largest Rectangle in Histogram, when bar t is popped by bar i, its width is…
+ i − (new top) − 1
- i − t
- t − (new top)
> The new top is the previous smaller bar, and i is the next smaller bar.
```

:::keypoints
- Monotonic stack = "next/previous greater/smaller" for all elements in $O(n)$; each index is pushed and popped once.
- Looking for greater → decreasing stack; smaller → increasing. Store indexes. Use sentinels or a second pass for circular arrays.
- Histogram: popping gives both boundaries at once. Maximal rectangle = a histogram per row.
- Contribution technique: element × (#subarrays where it's the min/max), with one strict and one non-strict side for ties.
- Greedy digit removal = an increasing stack.
:::
