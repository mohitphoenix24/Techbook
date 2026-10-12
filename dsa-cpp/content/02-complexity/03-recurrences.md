---
title: Recurrences & the Master Theorem
level: intermediate
time: 55
summary: How to find the complexity of recursive code — writing the recurrence, unrolling it, the recursion-tree method, proof by substitution (induction), the Master theorem with its derivation, and the recurrences the Master theorem can't handle (Fibonacci's φⁿ, Tower of Hanoi's 2ⁿ, √n recursion).
---

Loops become sums. **Recursive functions become recurrences**: equations that describe $T(n)$ in terms of $T$ on smaller inputs. Solving a recurrence gives you the complexity of merge sort, binary search, tree traversals and every divide-and-conquer algorithm.

## Writing the recurrence

:::def Recurrence relation
An equation that defines $T(n)$ using the value of $T$ on smaller inputs, plus a **base case**. For recursive code: $T(n)$ = (cost of the recursive calls) + (work done in this call, outside the calls).
:::

```cpp
int binarySearch(a, lo, hi, x) {          // T(n) = T(n/2) + O(1)
    if (lo > hi) return -1;                //   one call on half the range,
    int mid = (lo + hi) / 2;               //   constant work here
    ...
}
void mergeSort(a, l, r) {                  // T(n) = 2T(n/2) + O(n)
    mergeSort(left half); mergeSort(right half);  // two calls on halves,
    merge(...);                                   // linear merge
}
long long fib(int n) {                     // T(n) = T(n-1) + T(n-2) + O(1)
    return n < 2 ? n : fib(n-1) + fib(n-2);
}
```

## Method 1: unrolling

Substitute the recurrence into itself until you see the pattern:

:::derive Binary search: T(n) = T(n/2) + c
T(n) = T(n/2) + c || the recurrence
= T(n/4) + c + c || T(n/2) = T(n/4) + c
= T(n/2^k) + k\,c || after k steps
k = \log_2 n \Rightarrow T(n) = T(1) + c\log_2 n || stop when the size reaches 1
! T(n) = \Theta(\log n) ||
:::

:::derive Tower of Hanoi: T(n) = 2T(n−1) + 1, T(0) = 0
T(n) = 2T(n-1) + 1 || move n−1 disks away, move the big disk, move n−1 back
= 4T(n-2) + 2 + 1 || substitute once
= 2^k\,T(n-k) + (2^{k-1} + \cdots + 2 + 1) || after k steps
= 2^n\,T(0) + (2^n - 1) || k = n; geometric sum
! T(n) = 2^n - 1 = \Theta(2^n) || exponential: 64 disks would take 1.8·10¹⁹ moves
:::

## Method 2: the recursion tree

Draw the calls as a tree. Write the non-recursive work at each node, add up each level, then add up the levels.

:::derive Merge sort: T(n) = 2T(n/2) + cn
\text{level } i: \; 2^i \text{ calls, each on } n/2^i \text{ items} || the tree doubles, sizes halve
\text{work at level } i = 2^i \cdot c\frac{n}{2^i} = cn || every level costs the same!
\text{levels} = \log_2 n + 1 || sizes n, n/2, …, 1
! T(n) = cn(\log_2 n + 1) = \Theta(n \log n) ||
:::

```cpp run level=intermediate title="Merge sort really does ~n log₂ n comparisons"
#include <bits/stdc++.h>
using namespace std;

long long comparisons = 0;

void mergeSort(vector<int>& a, int l, int r, vector<int>& tmp) {
    if (r - l <= 1) return;
    int m = (l + r) / 2;
    mergeSort(a, l, m, tmp);
    mergeSort(a, m, r, tmp);
    int i = l, j = m, k = l;
    while (i < m && j < r) { comparisons++; tmp[k++] = a[i] <= a[j] ? a[i++] : a[j++]; }
    while (i < m) tmp[k++] = a[i++];
    while (j < r) tmp[k++] = a[j++];
    copy(tmp.begin() + l, tmp.begin() + r, a.begin() + l);
}

int main() {
    mt19937 rng(42);
    for (int n : {1 << 10, 1 << 14, 1 << 18}) {
        vector<int> a(n), tmp(n);
        for (int& x : a) x = rng();
        comparisons = 0;
        mergeSort(a, 0, n, tmp);
        cout << "n=" << setw(7) << n << "  comparisons " << setw(8) << comparisons
             << "  n*log2(n) = " << setw(8) << (long long)(n * log2(n))
             << "  sorted? " << is_sorted(a.begin(), a.end()) << '\n';
    }
}
```

The recursion tree also handles **uneven splits**:

:::derive T(n) = T(n/3) + T(2n/3) + cn
\text{each full level costs at most } cn || the sizes on a level add up to at most n
\text{shortest path to a leaf: } \log_3 n \text{ levels} || always taking the n/3 branch
\text{longest path: } \log_{3/2} n \text{ levels} || always taking the 2n/3 branch
cn\log_3 n \le T(n) \le cn\log_{3/2} n || full levels at least, all levels at most
! T(n) = \Theta(n \log n) || both bounds are n log n: lopsided splits are still fine
:::

This explains why quicksort stays $O(n \log n)$ even when it splits 10%/90% every time. Only splits that peel off a **constant number** of elements ($T(n-1)$) are bad.

## Method 3: substitution (guess, then prove by induction)

Guess the answer (from a recursion tree), then prove it by induction. This is the rigorous way.

:::proof Merge sort is O(n log n), by substitution
**Claim:** $T(n) \le c\,n \log_2 n$ for all $n \ge 2$, where $T(n) = 2T(n/2) + n$ (take $n$ a power of 2).

**Base case** $n = 2$: $T(2) = 2T(1) + 2$, which is a constant. Choose $c$ large enough that $T(2) \le c \cdot 2 \log_2 2 = 2c$.

**Inductive step:** assume $T(n/2) \le c\frac{n}{2}\log_2\frac{n}{2}$. Then
$T(n) = 2T(n/2) + n \le 2 \cdot c\frac n2 \log_2 \frac n2 + n = cn(\log_2 n - 1) + n = cn\log_2 n - cn + n \le cn\log_2 n$ as long as $c \ge 1$.

So the bound holds for every power of 2 by induction.
:::

:::warn Prove the exact form you guessed
A classic wrong "proof": guess $T(n) = O(n)$ and write $T(n) \le 2(cn/2) + n = cn + n = O(n)$. That's **wrong**: you must show $T(n) \le cn$ with the **same** $c$, and $cn + n > cn$. The constant has grown, so the induction fails.
:::

## Method 4: the Master theorem

For the common divide-and-conquer shape: split into $a$ subproblems, each of size $n/b$, plus $\Theta(n^d)$ work to split and combine.

:::def Master theorem (polynomial form)
If $T(n) = a\,T(n/b) + \Theta(n^d)$ with $a \ge 1$, $b > 1$, $d \ge 0$, let $c^* = \log_b a$. Then
$$T(n) = \begin{cases} \Theta(n^{d}) & \text{if } d > \log_b a \quad\text{(root dominates)}\\ \Theta(n^{d}\log n) & \text{if } d = \log_b a \quad\text{(every level equal)}\\ \Theta(n^{\log_b a}) & \text{if } d < \log_b a \quad\text{(leaves dominate)} \end{cases}$$
:::

### Where it comes from

:::derive Deriving the Master theorem from the recursion tree
\text{level } i: a^i \text{ subproblems of size } n/b^i || each call makes $a$ calls on size $/b$
\text{work at level } i = a^i \left(\frac{n}{b^i}\right)^{d} = n^d \left(\frac{a}{b^d}\right)^{i} || a subproblem of size $m$ costs $m^d$
T(n) = n^d \sum_{i=0}^{\log_b n} r^i, \quad r = \frac{a}{b^d} || a geometric series with ratio r
r < 1 \;(d > \log_b a): \; T = \Theta(n^d) || decreasing series: the first term dominates
r = 1 \;(d = \log_b a): \; T = n^d(\log_b n + 1) = \Theta(n^d \log n) || all log n levels are equal
r > 1 \;(d < \log_b a): \; T = \Theta(n^d r^{\log_b n}) = \Theta(a^{\log_b n}) || increasing series: the last term dominates
! a^{\log_b n} = n^{\log_b a} \;\Rightarrow\; T = \Theta(n^{\log_b a}) || both sides equal $b^{\log_b a \cdot \log_b n}$
:::

So the theorem just asks: **is the work per level shrinking, constant or growing?** Try it yourself:

```viz algo=master
```

### Worked examples

| Algorithm | Recurrence | $a, b, d$ | $\log_b a$ vs $d$ | Result |
|---|---|---|---|---|
| Binary search | $T(n/2) + 1$ | 1, 2, 0 | $0 = 0$ | $\Theta(\log n)$ |
| Merge sort | $2T(n/2) + n$ | 2, 2, 1 | $1 = 1$ | $\Theta(n \log n)$ |
| Tree traversal (balanced) | $2T(n/2) + 1$ | 2, 2, 0 | $1 > 0$ | $\Theta(n)$ |
| Quickselect (average) | $T(n/2) + n$ | 1, 2, 1 | $0 < 1$ | $\Theta(n)$ |
| Karatsuba multiplication | $3T(n/2) + n$ | 3, 2, 1 | $1.585 > 1$ | $\Theta(n^{1.585})$ |
| Strassen matrix multiplication | $7T(n/2) + n^2$ | 7, 2, 2 | $2.807 > 2$ | $\Theta(n^{2.807})$ |
| Naive matrix D&C | $8T(n/2) + n^2$ | 8, 2, 2 | $3 > 2$ | $\Theta(n^3)$ |

:::note The extended case 2
If the extra work is $\Theta(n^{\log_b a}\log^k n)$, then $T(n) = \Theta(n^{\log_b a}\log^{k+1} n)$. For example, $T(n) = 2T(n/2) + n\log n$ gives $\Theta(n \log^2 n)$.
:::

:::warn When the Master theorem doesn't apply
- Subproblems shrink by **subtraction**, not division: $T(n) = T(n-1) + n$.
- Unequal splits: $T(n/3) + T(2n/3) + n$ (use the recursion tree).
- $a$ isn't a constant, or $f(n)$ isn't polynomial-like (e.g. $n / \log n$).
:::

## Subtract-and-conquer recurrences

| Recurrence | Example | Solution |
|---|---|---|
| $T(n-1) + O(1)$ | recursive sum / linear scan | $\Theta(n)$ |
| $T(n-1) + O(n)$ | selection sort, naive recursion with a loop | $\Theta(n^2)$ (arithmetic series) |
| $2T(n-1) + O(1)$ | Hanoi, all subsets | $\Theta(2^n)$ |
| $T(n-1) + T(n-2) + O(1)$ | naive Fibonacci | $\Theta(\varphi^n) \approx \Theta(1.618^n)$ |
| $T(\sqrt n) + O(1)$ | repeated square roots | $\Theta(\log\log n)$ |

### Why naive Fibonacci is φⁿ

:::derive Solving T(n) = T(n−1) + T(n−2) with the characteristic equation
T(n) \approx x^n || guess an exponential solution
x^n = x^{n-1} + x^{n-2} \Rightarrow x^2 = x + 1 || divide by x^(n−2)
x = \frac{1 \pm \sqrt 5}{2} \Rightarrow \varphi = \frac{1+\sqrt5}{2} \approx 1.618 || the golden ratio is the larger root
T(n) = A\varphi^n + B\psi^n, \; |\psi| < 1 || general solution; the ψⁿ term vanishes
! T(n) = \Theta(\varphi^n) \approx \Theta(1.618^n) || fib(50) makes about 4·10¹⁰ calls
:::

A quicker bound you can do on a whiteboard: $T(n) \le 2T(n-1)$ gives $O(2^n)$. And $T(n) \ge 2T(n-2)$ gives $\Omega(2^{n/2}) = \Omega(1.414^n)$. So it's definitely exponential.

Watch the repeated work, then switch on memoization (type `yes`):

```viz algo=fib-recursion
```

### The √n recurrence

:::derive T(n) = T(√n) + 1 by changing variables
n = 2^m \Rightarrow T(2^m) = T(2^{m/2}) + 1 || let m = log₂ n
S(m) = S(m/2) + 1 || name S(m) = T(2^m)
S(m) = \Theta(\log m) || the binary-search recurrence
! T(n) = \Theta(\log\log n) || substitute back m = log n
:::

## Problems

:::problem Fibonacci Number {level=easy lc=fibonacci-number tags="recursion,math,memoization"}
Compute `F(n)` where `F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2)`. Then answer the follow-up: how fast can you make it?

:::hint Hint
The naive recursion is $\Theta(\varphi^n)$. Each value only depends on the previous two, so you can go up to O(n) time and O(1) space. For the follow-up, think about raising a 2×2 matrix to the n-th power by repeated squaring.
:::

:::solution
Three versions, from slow to fast:

1. **Naive recursion:** $T(n) = T(n-1)+T(n-2)+1 = \Theta(\varphi^n)$.
2. **Iterative:** keep the last two values. $\Theta(n)$ time, $O(1)$ space.
3. **Matrix power:** $\begin{pmatrix}1&1\\1&0\end{pmatrix}^n = \begin{pmatrix}F_{n+1}&F_n\\F_n&F_{n-1}\end{pmatrix}$. Computing the power by squaring is $T(n) = T(n/2) + O(1) = \Theta(\log n)$.

```cpp run
#include <bits/stdc++.h>
using namespace std;
using M = array<array<long long, 2>, 2>;
const long long MOD = 1'000'000'007;

long long fibNaive(int n) { return n < 2 ? n : fibNaive(n - 1) + fibNaive(n - 2); }

long long fibIter(int n) {
    long long a = 0, b = 1;               // F(0), F(1)
    for (int i = 0; i < n; i++) { long long c = (a + b) % MOD; a = b; b = c; }
    return a;
}

M mul(const M& x, const M& y) {
    M r{};
    for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) for (int k = 0; k < 2; k++)
        r[i][j] = (r[i][j] + x[i][k] * y[k][j]) % MOD;
    return r;
}
long long fibMatrix(long long n) {
    M result = {{{1, 0}, {0, 1}}}, base = {{{1, 1}, {1, 0}}};
    while (n > 0) {                        // exponentiation by squaring
        if (n & 1) result = mul(result, base);
        base = mul(base, base);
        n >>= 1;
    }
    return result[0][1];
}

int main() {
    cout << "naive  F(30) = " << fibNaive(30) << '\n';
    cout << "iter   F(30) = " << fibIter(30) << '\n';
    cout << "matrix F(30) = " << fibMatrix(30) << '\n';
    cout << "matrix F(10^18) mod 1e9+7 = " << fibMatrix(1'000'000'000'000'000'000LL) << "  (60 squarings)\n";
}
```

:::complexity
Time | O(\log n) | matrix version; O(n) iterative; O(φⁿ) naive
Space | O(1) |
:::
:::
:::

## Check yourself

```quiz
? T(n) = 4T(n/2) + n² is…
- Θ(n²)
+ Θ(n² log n)
- Θ(n³)
> log₂4 = 2 = d: every level does equal work (case 2).

? T(n) = 2T(n/4) + √n is…
- Θ(√n)
+ Θ(√n log n)
- Θ(n)
> log₄2 = ½ = d.

? T(n) = T(n−1) + n is…
- Θ(n log n)
+ Θ(n²)
- Θ(2ⁿ)
> Unrolling gives n + (n−1) + … + 1. The Master theorem doesn't apply to subtraction.

? Why is T(n) = T(n/10) + T(9n/10) + n still Θ(n log n)?
+ Every level costs at most n, and the depth is log base 10/9 of n, which is still O(log n)
- Because 10 + 9 > 10
- It isn't; it's Θ(n²)
> Lopsided constant-fraction splits only change the log's base.
```

:::keypoints
- Recurrence = cost of the recursive calls + the work done in this call, plus a base case.
- Unroll for simple ones; draw a recursion tree (sum per level, count levels) for the rest; prove by induction with the **same** constant.
- Master theorem: compare $d$ with $\log_b a$. The root dominates, all levels are equal ($n^d \log n$), or the leaves dominate ($n^{\log_b a}$). It's a geometric series in disguise.
- Subtracting: $T(n-1)+1 = n$, $T(n-1)+n = n^2$, $2T(n-1)+1 = 2^n$, Fibonacci $= \varphi^n$.
- Constant-fraction splits, even lopsided ones, give $\log n$ depth.
:::
