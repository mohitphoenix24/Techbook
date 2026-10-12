---
title: STL Algorithms & Lambdas
level: intermediate
time: 40
summary: The <algorithm> functions that replace whole loops — sort with custom comparators (and the strict-weak-ordering rule), lower_bound/upper_bound, accumulate, unique, nth_element, next_permutation — plus lambdas, captures and recursive lambdas.
---

The STL algorithms are tested, optimized loops you don't have to write. Using them makes your interview code shorter, faster to write, and less buggy.

## Iterators in one minute

:::def Iterator
An object that **points at an element** of a container and can move to the next one. `v.begin()` points at the first element. `v.end()` points **one past the last** element. Algorithms work on a half-open range `[first, last)`.
:::

So `sort(v.begin(), v.end())` sorts everything, and `sort(v.begin(), v.begin() + k)` sorts just the first `k` elements.

## Sorting

:::syntax
```cpp
sort(v.begin(), v.end());                       // ascending, O(n log n)
sort(v.begin(), v.end(), greater<int>());       // descending
sort(v.rbegin(), v.rend());                     // descending (reverse iterators)
sort(v.begin(), v.end(), [](const T& a, const T& b) { return /* a goes before b */; });
stable_sort(...);                               // keeps the order of equal elements
```
:::

```cpp run level=easy title="Custom comparators"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<string> words = {"kiwi", "fig", "banana", "apple", "date"};

    // by length, then alphabetically
    sort(words.begin(), words.end(), [](const string& a, const string& b) {
        if (a.size() != b.size()) return a.size() < b.size();
        return a < b;
    });
    for (auto& w : words) cout << w << ' ';
    cout << '\n';

    // intervals by start time
    vector<pair<int, int>> iv = {{5, 8}, {1, 3}, {2, 6}};
    sort(iv.begin(), iv.end());                         // pairs: by first, then second
    for (auto [s, e] : iv) cout << '[' << s << ',' << e << "] ";
    cout << '\n';
}
```

:::def Strict weak ordering
The rule a comparator must follow: `comp(a, a)` must be **false**, and the order must be consistent (transitive). In practice: **use `<`, never `<=`**. A comparator that returns true for equal elements can make `std::sort` read past the end of the array and crash.
:::

:::warn Never `return a <= b;`
With many equal elements, `sort` with a `<=` comparator is undefined behaviour. Real crashes happen on judges. If two items are equal, the comparator must return `false` both ways.
:::

### Partial sorting

| Function | Does | Cost |
|---|---|---|
| `nth_element(b, b + k, e)` | puts the element that *would be* at index `k` in sorted order at `k`; smaller ones to its left, bigger to its right (in no order) | $O(n)$ average |
| `partial_sort(b, b + k, e)` | the first `k` elements become the `k` smallest, sorted | $O(n \log k)$ |

```cpp run level=intermediate title="k-th smallest without sorting everything"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v = {9, 4, 7, 1, 8, 2, 6, 3, 5};
    int k = 4;                                   // 0-based: the 5th smallest
    nth_element(v.begin(), v.begin() + k, v.end());
    cout << "element at k=4 (the median) = " << v[k] << '\n';

    vector<int> w = {9, 4, 7, 1, 8, 2, 6, 3, 5};
    partial_sort(w.begin(), w.begin() + 3, w.end());
    cout << "3 smallest: " << w[0] << ' ' << w[1] << ' ' << w[2] << '\n';
}
```

## Binary search on sorted ranges

These need a **sorted** range and run in $O(\log n)$:

| Function | Returns |
|---|---|
| `lower_bound(b, e, x)` | first position with value **≥ x** |
| `upper_bound(b, e, x)` | first position with value **> x** |
| `binary_search(b, e, x)` | `true` if `x` is present |
| `equal_range(b, e, x)` | the pair (`lower_bound`, `upper_bound`) |

```cpp run level=easy title="Counting and locating with lower/upper_bound"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v = {1, 3, 3, 3, 5, 8, 13};
    auto lo = lower_bound(v.begin(), v.end(), 3);
    auto hi = upper_bound(v.begin(), v.end(), 3);
    cout << "first 3 at index " << lo - v.begin() << ", count of 3 = " << hi - lo << '\n';

    int x = 6;
    int idx = lower_bound(v.begin(), v.end(), x) - v.begin();
    cout << "6 would be inserted at index " << idx << '\n';
    cout << "values < 6: " << idx << ", values >= 6: " << v.size() - idx << '\n';
    cout << boolalpha << "contains 8? " << binary_search(v.begin(), v.end(), 8) << '\n';
}
```

The trick `it - v.begin()` turns an iterator into an index. How these work inside, and how to write your own, is the *Binary Search* lesson.

## The everyday toolbox

```cpp run level=easy title="accumulate, iota, min/max, count, reverse, unique"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v(8);
    iota(v.begin(), v.end(), 1);                          // 1 2 3 ... 8
    cout << "sum = " << accumulate(v.begin(), v.end(), 0LL) << '\n';   // note 0LL
    cout << "max = " << *max_element(v.begin(), v.end())
         << " at index " << max_element(v.begin(), v.end()) - v.begin() << '\n';
    cout << "evens = " << count_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; }) << '\n';
    cout << "all positive? " << all_of(v.begin(), v.end(), [](int x) { return x > 0; }) << '\n';

    reverse(v.begin(), v.end());
    cout << "reversed: "; for (int x : v) cout << x << ' '; cout << '\n';

    vector<int> d = {4, 1, 4, 2, 1, 4};
    sort(d.begin(), d.end());
    d.erase(unique(d.begin(), d.end()), d.end());         // dedupe: sort + unique + erase
    cout << "distinct: "; for (int x : d) cout << x << ' '; cout << '\n';

    cout << "max of three: " << max({7, 2, 9}) << ", gcd(12, 18) = " << gcd(12, 18) << '\n';
}
```

:::warn `accumulate(v.begin(), v.end(), 0)` sums in `int`
The **type of the starting value** decides the type of the sum. With `0` the total is an `int` and can overflow. Use `0LL`.
:::

:::def unique
`unique` removes **consecutive** duplicates by moving the unique elements to the front, and returns the new logical end. Sort first to remove all duplicates, then `erase` the tail.
:::

## Permutations

`next_permutation` rearranges a range into the next permutation in lexicographic order, and returns `false` after the last one. Start from sorted order to visit all $n!$ permutations:

```cpp run level=easy title="All permutations"
#include <bits/stdc++.h>
using namespace std;

int main() {
    string s = "abc";                 // must start sorted to see all of them
    int count = 0;
    do {
        cout << s << ' ';
        count++;
    } while (next_permutation(s.begin(), s.end()));
    cout << "\n" << count << " permutations (3! = 6)\n";
}
```

## Lambdas

:::def Lambda
An **unnamed function written inline**: `[capture](params) { body }`. The capture list decides which outside variables the lambda can use: `[&]` by reference, `[=]` by copy, `[&x, y]` for specific ones.
:::

```cpp run level=intermediate title="Captures and a recursive lambda"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int threshold = 5, hits = 0;
    vector<int> v = {3, 8, 1, 9, 5};
    for_each(v.begin(), v.end(), [&](int x) { if (x > threshold) hits++; });   // [&]: modify hits
    cout << "values > " << threshold << ": " << hits << '\n';

    // sort indexes by the values they point at (a very common trick)
    vector<int> idx(v.size());
    iota(idx.begin(), idx.end(), 0);
    sort(idx.begin(), idx.end(), [&](int i, int j) { return v[i] < v[j]; });
    cout << "indexes in value order: "; for (int i : idx) cout << i << ' '; cout << '\n';

    // a recursive lambda: pass the lambda to itself (C++14 generic lambda trick)
    auto fib = [](auto&& self, int n) -> long long { return n < 2 ? n : self(self, n - 1) + self(self, n - 2); };
    cout << "fib(20) = " << fib(fib, 20) << '\n';

    // or std::function (slightly slower, simpler syntax)
    function<int(int)> fact = [&](int n) { return n <= 1 ? 1 : n * fact(n - 1); };
    cout << "5! = " << fact(5) << '\n';
}
```

:::tip Recursive DFS as a lambda
Inside `main` or a solution method, `function<void(int)> dfs = [&](int u) { ... dfs(v); ... };` lets the DFS see your graph and visited arrays without passing them around. You'll see this pattern in the Graphs module.
:::

## Problems

:::problem Largest Number {level=medium lc=largest-number tags="sorting,comparator,string"}
Given non-negative integers, arrange them to form the **largest** number. Return it as a string.

Example: `[3, 30, 34, 5, 9]` → `"9534330"`.

:::hint Hint 1
Sorting by value, or by string, fails: `3` vs `30` — which goes first? Compare the two possible concatenations instead.
:::

:::hint Hint 2
`a` should come before `b` if `a + b > b + a` as strings. Watch out for an answer like `"000"`.
:::

:::solution
Sort the numbers as strings with the comparator `a + b > b + a`. This comparator is a valid strict weak ordering: it can be shown to be transitive. If the biggest "digit string" is `"0"`, everything is zero, so return `"0"`.

```cpp run
#include <bits/stdc++.h>
using namespace std;

string largestNumber(const vector<int>& nums) {
    vector<string> s;
    for (int x : nums) s.push_back(to_string(x));
    sort(s.begin(), s.end(), [](const string& a, const string& b) { return a + b > b + a; });
    if (s[0] == "0") return "0";
    string out;
    for (auto& t : s) out += t;
    return out;
}

int main() {
    cout << largestNumber({3, 30, 34, 5, 9}) << '\n'
         << largestNumber({10, 2}) << '\n'
         << largestNumber({0, 0}) << '\n';
}
```

:::complexity
Time | O(n \log n \cdot k) | k = max digits; each comparison builds strings of length ≤ 2k
Space | O(nk) |
:::
:::
:::

:::problem Next Permutation {level=medium lc=next-permutation tags="array,two pointers"}
Rearrange the array into the next permutation in lexicographic order, **in place**. If it's the last permutation, wrap around to the first (sorted ascending). Implement it yourself, without `std::next_permutation`.

Examples: `[1,2,3] → [1,3,2]`, `[3,2,1] → [1,2,3]`, `[1,1,5] → [1,5,1]`.

:::hint Hint 1
Look from the right. The longest suffix that is **non-increasing** is already at its "maximum". You can't make it bigger by rearranging only those elements.
:::

:::hint Hint 2
Let `i` be the index just before that suffix. Swap `a[i]` with the smallest suffix element that is **bigger** than `a[i]`. Then make the suffix as small as possible: reverse it.
:::

:::solution
1. Find the largest `i` with `a[i] < a[i+1]`. If there is none, the array is the last permutation: reverse it all.
2. Find the largest `j > i` with `a[j] > a[i]`, and swap them.
3. Reverse `a[i+1..]`. It was non-increasing, so reversing makes it the smallest arrangement.

```cpp run
#include <bits/stdc++.h>
using namespace std;

void nextPermutation(vector<int>& a) {
    int n = a.size(), i = n - 2;
    while (i >= 0 && a[i] >= a[i + 1]) i--;            // 1. find the pivot
    if (i >= 0) {
        int j = n - 1;
        while (a[j] <= a[i]) j--;                      // 2. rightmost element bigger than the pivot
        swap(a[i], a[j]);
    }
    reverse(a.begin() + i + 1, a.end());               // 3. smallest suffix
}

int main() {
    for (auto v : vector<vector<int>>{{1, 2, 3}, {3, 2, 1}, {1, 1, 5}, {1, 3, 2}}) {
        nextPermutation(v);
        for (int x : v) cout << x << ' ';
        cout << '\n';
    }
}
```

:::complexity
Time | O(n) | at most two scans and one reverse
Space | O(1) |
:::
:::
:::

## Check yourself

```quiz
? Why must a sort comparator never return true for equal elements?
+ It breaks strict weak ordering, and std::sort may run out of bounds and crash
- It makes sort slower but still correct
- It sorts in descending order
> Use `<`, not `<=`.

? `lower_bound(v.begin(), v.end(), x) - v.begin()` on a sorted vector gives…
+ The number of elements smaller than x (= the index of the first element ≥ x)
- The index of the last x
- The count of x
> Everything before that position is < x.

? How do you remove all duplicates from a vector?
- unique(v.begin(), v.end())
+ sort, then v.erase(unique(v.begin(), v.end()), v.end())
- v.dedupe()
> unique only removes adjacent duplicates and doesn't shrink the vector.

? Which capture lets a lambda modify a local counter?
+ [&]
- [=]
- []
> Capture by reference.
```

:::keypoints
- Algorithms work on half-open ranges `[begin, end)`; `it - v.begin()` turns an iterator into an index.
- Comparators: `a` before `b` → `return true`. Use `<`, **never** `<=`.
- `nth_element` finds the k-th smallest in $O(n)$ average; `partial_sort` gives the top-k sorted.
- `lower_bound` (≥ x) and `upper_bound` (> x) on sorted data in $O(\log n)$.
- `accumulate(..., 0LL)`, dedupe with sort + unique + erase, `next_permutation` from sorted order.
- Lambdas: `[&]` to capture by reference; recursive lambdas via `std::function` or `auto&& self`.
:::
