---
title: Divide and Conquer
level: advanced
time: 50
summary: The divide → conquer → combine paradigm beyond sorting — Karatsuba multiplication (three multiplications instead of four, n^1.585), the closest pair of points in O(n log n) with the "at most 7 neighbours in the strip" proof, and D&C problems like Different Ways to Add Parentheses and Beautiful Array.
---

You've already used divide and conquer: binary search, merge sort, quicksort, fast exponentiation. This lesson shows the paradigm on problems where the **combine step** holds a clever idea. That's where the speedups come from.

:::flow Divide and conquer
Divide | split into smaller subproblems of the same kind
Conquer | solve them recursively (base case: tiny inputs)
Combine | merge the sub-answers into the answer
:::

The complexity follows from the recurrence $T(n) = aT(n/b) + f(n)$ and the **Master theorem**. Reducing $a$ (fewer subproblems) or $f(n)$ (a cheaper combine step) is how D&C algorithms get faster.

## Karatsuba: multiplying with three products instead of four

Split two $n$-digit numbers in half: $x = x_1 B + x_0$ and $y = y_1 B + y_0$, where $B = 10^{n/2}$. The schoolbook method needs 4 half-size products:

$$xy = x_1y_1 B^2 + (x_1y_0 + x_0y_1)B + x_0y_0 \quad\Rightarrow\quad T(n) = 4T(n/2) + O(n) = O(n^2)$$

:::derive Karatsuba's trick
(x_1 + x_0)(y_1 + y_0) = x_1y_1 + x_1y_0 + x_0y_1 + x_0y_0 || one extra product
x_1y_0 + x_0y_1 = (x_1+x_0)(y_1+y_0) - x_1y_1 - x_0y_0 || the middle term from products we already have
\text{only 3 multiplications: } x_1y_1,\; x_0y_0,\; (x_1+x_0)(y_1+y_0) || plus additions, which are O(n)
T(n) = 3T(n/2) + O(n) || Master theorem: log₂3 ≈ 1.585 > 1
! T(n) = \Theta(n^{\log_2 3}) \approx \Theta(n^{1.585}) || for a million digits: about 2000× fewer digit operations
:::

```cpp run level=advanced title="Karatsuba on big numbers (digit vectors), checked against schoolbook"
#include <bits/stdc++.h>
using namespace std;
using Big = vector<int>;   // little-endian decimal digits

Big add(const Big& a, const Big& b) { Big r(max(a.size(), b.size()) + 1, 0); for (size_t i = 0; i + 1 < r.size(); i++) { r[i] += (i < a.size() ? a[i] : 0) + (i < b.size() ? b[i] : 0); r[i + 1] += r[i] / 10; r[i] %= 10; } while (r.size() > 1 && !r.back()) r.pop_back(); return r; }
Big sub(Big a, const Big& b) { for (size_t i = 0; i < a.size(); i++) { a[i] -= (i < b.size() ? b[i] : 0); if (a[i] < 0) { a[i] += 10; a[i + 1]--; } } while (a.size() > 1 && !a.back()) a.pop_back(); return a; }
Big shift(Big a, int k) { if (a.size() == 1 && a[0] == 0) return a; a.insert(a.begin(), k, 0); return a; }
Big school(const Big& a, const Big& b) { Big r(a.size() + b.size(), 0); for (size_t i = 0; i < a.size(); i++) for (size_t j = 0; j < b.size(); j++) r[i + j] += a[i] * b[j]; for (size_t i = 0; i + 1 < r.size(); i++) { r[i + 1] += r[i] / 10; r[i] %= 10; } while (r.size() > 1 && !r.back()) r.pop_back(); return r; }

Big karatsuba(const Big& x, const Big& y) {
    if (x.size() < 32 || y.size() < 32) return school(x, y);          // small: the schoolbook method is faster
    int m = max(x.size(), y.size()) / 2;
    Big x0(x.begin(), x.begin() + min<size_t>(m, x.size())), x1(x.begin() + min<size_t>(m, x.size()), x.end());
    Big y0(y.begin(), y.begin() + min<size_t>(m, y.size())), y1(y.begin() + min<size_t>(m, y.size()), y.end());
    if (x1.empty()) x1 = {0};
    if (y1.empty()) y1 = {0};
    Big z2 = karatsuba(x1, y1), z0 = karatsuba(x0, y0);
    Big z1 = sub(sub(karatsuba(add(x0, x1), add(y0, y1)), z2), z0);   // the middle term from 3 products
    return add(add(shift(z2, 2 * m), shift(z1, m)), z0);
}

int main() {
    mt19937 rng(3);
    Big a(600), b(600);
    for (auto& d : a) d = rng() % 10;
    for (auto& d : b) d = rng() % 10;
    a.back() = b.back() = 7;
    Big k = karatsuba(a, b), s = school(a, b);
    cout << "600-digit product has " << k.size() << " digits, matches schoolbook: " << boolalpha << (k == s) << '\n';
    cout << "last 20 digits: ";
    for (int i = 19; i >= 0; i--) cout << k[i];
    cout << '\n';
}
```

The same "fewer subproblems" idea gives **Strassen's** matrix multiplication: 7 instead of 8 half-size products, $\Theta(n^{\log_2 7}) \approx n^{2.807}$.

## Closest pair of points in O(n log n)

Given $n$ points in the plane, find the two closest ones. Brute force checks all $\binom n2$ pairs, which is $O(n^2)$.

:::flow Closest pair
Sort by x | once, O(n log n)
Split | a vertical line through the median x
Recurse | δ = min(best on the left, best on the right)
Combine | only check pairs in the strip of width 2δ around the line
:::

:::proof Only O(1) neighbours per point need checking in the strip
Sort the strip's points by $y$. For a point $p$, any point within distance $\delta$ of it has $y$ in $[p_y, p_y + \delta]$, which is inside a $2\delta \times \delta$ rectangle. Split that rectangle into 8 squares of side $\delta/2$. Each square lies entirely on one side of the line, and any two points inside one square are at most $\frac{\delta}{\sqrt 2} < \delta$ apart. But points on the same side are all at least $\delta$ apart. So each square holds **at most one point**, the rectangle holds at most 8 points including $p$, and checking the **next 7** points in $y$-order is enough. The combine step is $O(n)$ (with merge-sort-style y ordering), so $T(n) = 2T(n/2) + O(n) = O(n \log n)$.
:::

```cpp run level=advanced title="Closest pair, checked against brute force"
#include <bits/stdc++.h>
using namespace std;
using P = pair<double, double>;

double dist(const P& a, const P& b) { return hypot(a.first - b.first, a.second - b.second); }

// pts sorted by x; returns the best distance and leaves pts[l..r) sorted by y (merge-sort style)
double rec(vector<P>& pts, int l, int r) {
    if (r - l <= 3) {
        double best = 1e18;
        for (int i = l; i < r; i++) for (int j = i + 1; j < r; j++) best = min(best, dist(pts[i], pts[j]));
        sort(pts.begin() + l, pts.begin() + r, [](const P& a, const P& b) { return a.second < b.second; });
        return best;
    }
    int m = (l + r) / 2;
    double midX = pts[m].first;
    double d = min(rec(pts, l, m), rec(pts, m, r));
    inplace_merge(pts.begin() + l, pts.begin() + m, pts.begin() + r, [](const P& a, const P& b) { return a.second < b.second; });
    vector<P> strip;
    for (int i = l; i < r; i++) {
        if (fabs(pts[i].first - midX) >= d) continue;
        for (int j = (int)strip.size() - 1; j >= 0 && pts[i].second - strip[j].second < d; j--)   // at most ~7 checks
            d = min(d, dist(pts[i], strip[j]));
        strip.push_back(pts[i]);
    }
    return d;
}

int main() {
    mt19937 rng(11);
    vector<P> pts(2000);
    for (auto& p : pts) p = {rng() % 100000 / 10.0, rng() % 100000 / 10.0};
    double brute = 1e18;
    for (size_t i = 0; i < pts.size(); i++) for (size_t j = i + 1; j < pts.size(); j++) brute = min(brute, dist(pts[i], pts[j]));
    sort(pts.begin(), pts.end());
    cout << fixed << setprecision(4) << "divide & conquer: " << rec(pts, 0, pts.size()) << "   brute force: " << brute << '\n';
}
```

## Problems

:::problem Different Ways to Add Parentheses {level=medium lc=different-ways-to-add-parentheses tags="divide and conquer,memoization"}
Given an expression like `"2*3-4*5"`, return the results of **all** possible ways to fully parenthesise it.

Example: `"2-1-1"` → `[0, 2]` (`(2-1)-1` and `2-(1-1)`).

:::hint Hint
Every operator could be the **last** one evaluated. Split there, recursively get every value of the left part and of the right part, and combine each pair. Memoize by substring.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

unordered_map<string, vector<int>> memo;

vector<int> ways(const string& e) {
    if (memo.count(e)) return memo[e];
    vector<int> res;
    for (int i = 0; i < (int)e.size(); i++) {
        char op = e[i];
        if (op != '+' && op != '-' && op != '*') continue;
        vector<int> L = ways(e.substr(0, i)), R = ways(e.substr(i + 1));   // divide at operator i
        for (int a : L) for (int b : R)                                    // combine every pair
            res.push_back(op == '+' ? a + b : op == '-' ? a - b : a * b);
    }
    if (res.empty()) res.push_back(stoi(e));                               // a plain number
    return memo[e] = res;
}

int main() {
    auto r = ways("2*3-4*5");
    sort(r.begin(), r.end());
    for (int x : r) cout << x << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(C_n \cdot n) | the number of results grows like the Catalan numbers
Space | O(C_n \cdot n) |
:::
:::
:::

:::problem Beautiful Array {level=medium lc=beautiful-array tags="divide and conquer,constructive"}
Return any permutation of `1..n` such that for every `i < k < j`, `2 * a[k] != a[i] + a[j]` (no element is the average of two elements on either side of it).

Example: `n=4` → `[2,1,4,3]` (or `[1,3,2,4]`).

:::hint Hint 1
If the left part is all odd and the right part is all even, then `a[i] + a[j]` is odd, so it can never equal the even number `2·a[k]` for any pair crossing the middle.
:::

:::hint Hint 2
Affine maps keep the property: if `A` is beautiful, so are `2A − 1` (all odd) and `2A` (all even). Recurse: `beautiful(n) = [2x−1 for x in beautiful((n+1)/2)] + [2x for x in beautiful(n/2)]`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> beautifulArray(int n) {
    if (n == 1) return {1};
    vector<int> out;
    for (int x : beautifulArray((n + 1) / 2)) out.push_back(2 * x - 1);   // odds on the left
    for (int x : beautifulArray(n / 2)) out.push_back(2 * x);             // evens on the right
    return out;
}

bool check(const vector<int>& a) {
    for (size_t i = 0; i < a.size(); i++) for (size_t k = i + 1; k < a.size(); k++) for (size_t j = k + 1; j < a.size(); j++)
        if (2 * a[k] == a[i] + a[j]) return false;
    return true;
}

int main() {
    for (int x : beautifulArray(10)) cout << x << ' ';
    cout << "\nvalid for n=1..60? ";
    bool ok = true;
    for (int n = 1; n <= 60; n++) ok &= check(beautifulArray(n));
    cout << boolalpha << ok << '\n';
}
```

:::complexity
Time | O(n \log n) | T(n) = 2T(n/2) + O(n)
Space | O(n \log n) | O(n) with memoization
:::
:::
:::

## Check yourself

```quiz
? Karatsuba's recurrence is T(n) = 3T(n/2) + O(n), so T(n) is…
- Θ(n²)
+ Θ(n^log₂3) ≈ Θ(n^1.585)
- Θ(n log n)
> Leaves dominate: log₂3 > 1.

? In closest pair, why check only about 7 points after each point in the strip?
+ A δ × 2δ box can contain at most 8 points that are pairwise ≥ δ apart on each side
- Because the strip is sorted by x
- 7 is a heuristic
> A packing argument with 8 squares of side δ/2.

? A D&C algorithm usually gets faster by…
+ Making fewer subproblems or a cheaper combine step
- Using more recursion
- Making the base case bigger
> Both change the terms of the Master theorem.
```

:::keypoints
- D&C = divide, conquer, combine. Analyse it with the Master theorem.
- Fewer subproblems is a big win: Karatsuba (3 products, $n^{1.585}$), Strassen (7 products, $n^{2.807}$).
- Smart combine steps: the closest-pair strip has only $O(1)$ candidates per point, giving $O(n \log n)$.
- "Try every split point, combine all left × right results" + memoization covers many expression and tree-counting problems.
:::
