---
title: C++ Pitfalls That Cost Interviews
level: intermediate
time: 35
summary: The bugs that turn a correct idea into a failed submission — integer overflow, unsigned underflow, division and modulo of negatives, iterator invalidation, map's operator[], bad comparators, recursion depth, accidental copies, priority_queue direction, floating-point equality, INT_MIN edge cases — each shown with a runnable demo, plus a pre-submit checklist.
---

You can have the right algorithm and still fail on a C++ detail. Here are the traps that bite most often, each with a demo you can run, and the habit that avoids it.

## 1. Integer overflow

```cpp run level=easy title="Products and sums of ints overflow quietly"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int a = 200000, b = 300000;
    long long good = 1LL * a * b;                  // promote BEFORE multiplying
    cout << "1LL * a * b = " << good << '\n';
    vector<int> v(100000, 1'000'000'000);
    long long sum = accumulate(v.begin(), v.end(), 0LL);   // 0LL: accumulate in 64 bits
    cout << "sum = " << sum << '\n';
    int lo = 2'000'000'000, hi = 2'100'000'000;
    cout << "safe mid = " << lo + (hi - lo) / 2 << '\n';    // (lo + hi) / 2 would overflow
}
```

**Habit:** use `long long` for sums, products, and anything above about $2 \cdot 10^9$. Write `1LL *` before products and `0LL` in `accumulate`.

## 2. Unsigned underflow with `.size()`

`v.size() - 1` on an empty vector is about $1.8 \times 10^{19}$, not −1. Loops like `for (int i = 0; i < v.size() - 1; i++)` then run far past the end.

**Habit:** `int n = v.size();` once, then use `n`.

## 3. Division and modulo with negatives

`-7 / 2 == -3` (truncation toward zero) and `-7 % 3 == -1`. For a mathematical modulo use `((x % m) + m) % m`. For floor division of possibly negative numbers, don't trust `/`.

## 4. Iterator and reference invalidation

```cpp run level=intermediate title="Growing a vector invalidates references into it" runtime-error
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v = {1, 2, 3};
    int& first = v[0];                  // a reference into the vector's buffer
    for (int i = 0; i < 100; i++) v.push_back(i);   // reallocation moves the buffer
    cout << "first = " << first << '\n';           // use-after-free: undefined behaviour
    // AddressSanitizer would report heap-use-after-free here. Without it, it may print garbage.
    return first == 1 ? 1 : 2;                      // non-zero exit either way, to flag the bug
}
```

**Rules:** `push_back`/`insert` may invalidate **all** iterators, pointers and references into a `vector`. `erase` invalidates everything from the erased position on. Never modify a container while iterating over it with a range-for. Collect the changes and apply them afterwards (or use the erase–remove idiom).

## 5. `map[key]` inserts

`if (m[key] == 0)` silently **creates** `key`, which can change sizes, iteration and later logic. Use `m.count(key)`, `m.find(key)` or `m.contains(key)` (C++20).

## 6. Comparators must be strict

```cpp run level=intermediate title="Why <= is not a valid comparator"
#include <bits/stdc++.h>
using namespace std;

int main() {
    auto bad  = [](int a, int b) { return a <= b; };
    auto good = [](int a, int b) { return a < b; };
    cout << boolalpha;
    cout << "bad(7, 7)  = " << bad(7, 7) << "   -> claims 7 must come before 7: breaks strict weak ordering\n";
    cout << "good(7, 7) = " << good(7, 7) << '\n';
    // sort(v.begin(), v.end(), bad) is undefined behaviour: with many equal elements, libstdc++'s
    // unguarded partition loop relies on comp(x, x) == false and can run past the end of the array.
    vector<int> v(200, 7);
    sort(v.begin(), v.end(), good);
    cout << "sorted safely with <: " << is_sorted(v.begin(), v.end()) << '\n';
}
```

**Habit:** comparators use `<` (or `>`), never `<=`. For multiple keys: `tie(a.x, a.y) < tie(b.x, b.y)`.

## 7. Recursion depth

A recursive DFS on a path-shaped graph or a 1000×1000 grid can go $10^6$ frames deep and overflow the stack. **Use BFS or an explicit stack** when the depth can reach about $10^5$.

## 8. Accidental copies

`void dfs(vector<int> path)` copies on every call. `for (auto s : strings)` copies every string. `auto row = grid[r];` copies the row. **Use `const&`** for reading and `&` for modifying.

## 9. `priority_queue` is a max-heap

`priority_queue<int>` pops the **largest** element. For a min-heap: `priority_queue<int, vector<int>, greater<int>>`. For custom types, the comparator returns true when `a` has **lower** priority than `b`. That's the opposite of `sort`'s convention.

## 10. Floating-point comparisons

```cpp run level=easy title="Never compare doubles with =="
#include <bits/stdc++.h>
using namespace std;

int main() {
    double x = 0.1 + 0.2;
    cout << boolalpha << "0.1 + 0.2 == 0.3? " << (x == 0.3) << '\n';
    cout << setprecision(17) << "0.1 + 0.2 = " << x << '\n';
    const double EPS = 1e-9;
    cout << "within 1e-9? " << (fabs(x - 0.3) < EPS) << '\n';
    // Better still: stay in integers. Compare a/b < c/d as a*d < c*b (with long long and positive b, d).
}
```

## 11. `INT_MIN` and `abs`

`-INT_MIN` and `abs(INT_MIN)` overflow (there's no $+2^{31}$ in an `int`). Convert to `long long` first: `llabs((long long)x)`. The same goes for `n = -n` in `myPow`.

## 12. Slow I/O and `endl`

For about $10^6$ lines, `endl` (which flushes every time) and unsynchronised streams can be 10× slower. Use `ios::sync_with_stdio(false); cin.tie(nullptr);` and `'\n'`.

## 13. Uninitialised variables and stale globals

Local `int count;` holds garbage. Always initialise. Global arrays are zeroed, but when a judge calls your function several times, **reset your state** each time.

## 14. `string` building in loops

`s = s + c` is $O(n)$ per step, so $O(n^2)$ overall. Use `s += c` or `s.push_back(c)`. `s.substr(...)` inside a loop also copies every time. Pass indexes or a `string_view` instead.

## The pre-submit checklist

:::flow Before you say "done"
Overflow? | sums and products in long long; safe mid
Edge cases? | empty, single, all equal, negatives, no answer
Off-by-one? | < vs <=, the half-open vs closed template, the last index
Containers? | no map[] lookups by accident, no invalidated iterators
Complexity? | matches the constraints; no hidden O(n) inside the loop
:::

## Check yourself

```quiz
? `vector<int> v; for (size_t i = 0; i < v.size() - 1; i++)` does what?
+ Loops (nearly) forever, because v.size() − 1 wraps around to a huge unsigned number
- Doesn't execute
- Compile error
> Convert the size to int first.

? Which statement is true about `std::map` m?
+ `m[k]` inserts k with a default value if k is missing
- `m[k]` throws if k is missing
- `m.count(k)` inserts k
> Use find/count/contains to test membership.

? How do you get a min-heap of ints?
+ priority_queue<int, vector<int>, greater<int>>
- priority_queue<int>
- priority_queue<int, less<int>>
> The default is a max-heap.
```

:::keypoints
- Overflow: `long long`, `1LL *`, `0LL`, `lo + (hi − lo) / 2`, and careful `INT_MIN`.
- `.size()` is unsigned; `%` can be negative; never compare doubles with `==`.
- Don't modify containers while iterating; `vector` growth invalidates references; `map[]` inserts.
- Strict comparators only; `priority_queue` is a max-heap.
- Avoid deep recursion, accidental copies, `s = s + c`, and `endl` in hot loops.
:::
