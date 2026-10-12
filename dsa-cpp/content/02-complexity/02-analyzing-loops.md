---
title: Analyzing Loops with Sums
level: intermediate
time: 50
summary: Turn any loop nest into a sum and solve it — arithmetic series (Gauss), sums of squares, geometric series, the harmonic series (≈ ln n) and why j += i loops are n log n, halving loops (log n), square-root loops, and amortized two-pointer loops. Every formula is derived and then checked by counting real iterations.
---

To find the complexity of code, **write the number of steps as a sum, then evaluate the sum**. A handful of sums covers almost every loop you'll meet. This lesson derives each one and then checks it by counting what the code actually does.

## The method

:::flow Analyzing a loop nest
Count | how many times does the innermost line run?
Write a sum | one Σ per loop, inner bounds may depend on outer variables
Evaluate | use the standard sums below
Simplify | keep the dominant term → Θ(…)
:::

## 1. Constant-work loops: Σ 1

A loop `for (i = 0; i < n; i++)` with $O(1)$ work inside runs $\sum_{i=0}^{n-1} 1 = n$ times, so it's $\Theta(n)$. Two independent nested loops give $\sum_{i}\sum_{j} 1 = n \cdot m$.

## 2. Dependent nested loops: the arithmetic series

```cpp
for (int i = 0; i < n; i++)
    for (int j = i + 1; j < n; j++)   // every pair (i, j) with i < j
        work();
```

The inner loop runs $n - 1 - i$ times, so the total is $\sum_{i=0}^{n-1} (n-1-i) = 0 + 1 + \cdots + (n-1)$.

:::derive Gauss's sum: 1 + 2 + … + n
S = 1 + 2 + \cdots + (n-1) + n || write the sum forwards
S = n + (n-1) + \cdots + 2 + 1 || and backwards
2S = (n+1) + (n+1) + \cdots + (n+1) || add the two lines column by column: n columns
2S = n(n+1) ||
! S = \sum_{i=1}^{n} i = \frac{n(n+1)}{2} = \Theta(n^2) ||
:::

So the "all pairs" loop runs $\frac{(n-1)n}{2} = \binom{n}{2}$ times, which is $\Theta(n^2)$. Starting the inner loop at `i + 1` halves the work, but it's still quadratic.

```cpp run level=easy title="Checking the arithmetic series"
#include <bits/stdc++.h>
using namespace std;

int main() {
    for (long long n : {10, 100, 1000, 5000}) {
        long long count = 0;
        for (long long i = 0; i < n; i++)
            for (long long j = i + 1; j < n; j++) count++;
        cout << "n=" << setw(5) << n << "  counted " << setw(9) << count
             << "  formula n(n-1)/2 = " << setw(9) << n * (n - 1) / 2 << '\n';
    }
}
```

## 3. Sums of squares and higher powers

Three nested dependent loops (`i < j < k`, all triples) give $\binom{n}{3} = \Theta(n^3)$. A useful general fact:

$$\sum_{i=1}^{n} i^k = \Theta(n^{k+1})$$

:::derive Sum of squares by telescoping
(i+1)^3 - i^3 = 3i^2 + 3i + 1 || expand (i+1)³
\sum_{i=1}^{n}\big[(i+1)^3 - i^3\big] = (n+1)^3 - 1 || telescoping: the middle terms cancel
(n+1)^3 - 1 = 3\sum i^2 + 3\cdot\frac{n(n+1)}{2} + n || sum the right side term by term
! \sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6} = \Theta(n^3) || solve for Σi² and simplify
:::

:::tip The integral shortcut
For an increasing $f$: $\int_{0}^{n} f(x)\,dx \le \sum_{i=1}^{n} f(i) \le \int_{1}^{n+1} f(x)\,dx$. With $f(x) = x^k$ both sides are $\Theta(n^{k+1})$. This is a quick way to get the order of any "smooth" sum.
:::

## 4. Halving and doubling loops: log n

```cpp
for (int i = 1; i < n; i *= 2) work();     // i = 1, 2, 4, 8, ...
for (int i = n; i > 0; i /= 2) work();     // i = n, n/2, n/4, ...
```

:::derive How many times does i *= 2 run?
i = 2^k \text{ after } k \text{ iterations} || i starts at 1 = 2⁰
\text{loop stops when } 2^k \ge n || the condition i < n fails
k \ge \log_2 n || take log₂ of both sides
! \text{iterations} = \lceil \log_2 n \rceil = \Theta(\log n) ||
:::

This is why binary search, balanced trees and heaps are logarithmic: **every step cuts the problem by a constant factor**. Any constant factor works (`i *= 3`, `n = n * 2 / 3`), because the base of the log doesn't matter.

## 5. Mixed loops: n log n

```cpp
for (int i = 0; i < n; i++)             // n times
    for (int j = 1; j < n; j *= 2)      // log n times each
        work();                         // total: n log n
```

## 6. The harmonic series: j += i

This loop shape appears in sieves and "for every divisor" problems:

```cpp
for (int i = 1; i <= n; i++)
    for (int j = i; j <= n; j += i)     // runs n / i times
        work();
```

The total is $\sum_{i=1}^{n} \frac{n}{i} = n \cdot H_n$, where $H_n = 1 + \frac12 + \frac13 + \cdots + \frac1n$ is the **harmonic number**.

:::derive H_n = Θ(log n), using integrals
\int_{1}^{n+1} \frac{dx}{x} \le H_n \le 1 + \int_{1}^{n} \frac{dx}{x} || compare the bars 1/i with the curve 1/x
\ln(n+1) \le H_n \le 1 + \ln n || ∫ dx/x = ln x
! H_n = \ln n + O(1) = \Theta(\log n) \quad\Rightarrow\quad n H_n = \Theta(n \log n) || the j += i loop is n log n, not n²
:::

```cpp run level=intermediate title="Harmonic loop vs n ln n"
#include <bits/stdc++.h>
using namespace std;

int main() {
    for (long long n : {1000, 100000, 10000000}) {
        long long count = 0;
        for (long long i = 1; i <= n; i++)
            for (long long j = i; j <= n; j += i) count++;
        cout << "n=" << setw(8) << n << "  counted " << setw(10) << count
             << "  n*ln(n) = " << setw(10) << (long long)(n * log(n))
             << "  ratio " << fixed << setprecision(3) << count / (n * log(n)) << '\n';
    }
}
```

The ratio settles near 1. (It's slightly above 1 because $H_n \approx \ln n + 0.577$.)

## 7. Geometric series: shrinking work adds up to a constant factor

```cpp
for (int size = n; size >= 1; size /= 2)
    for (int j = 0; j < size; j++) work();   // n + n/2 + n/4 + ... 
```

:::derive Geometric series
S = 1 + r + r^2 + \cdots + r^{k} || ratio r
rS = r + r^2 + \cdots + r^{k+1} || multiply by r
S - rS = 1 - r^{k+1} || subtract: everything else cancels
S = \frac{1 - r^{k+1}}{1 - r} < \frac{1}{1-r} \text{ when } 0 < r < 1 || bounded by a constant
! n\left(1 + \tfrac12 + \tfrac14 + \cdots\right) < 2n = \Theta(n) || the loop above is linear, not n log n
:::

The rule of thumb: in a geometric series, **the largest term dominates**. Decreasing ($r < 1$): the total is $\Theta(\text{first term})$. Increasing ($r > 1$): the total is $\Theta(\text{last term})$. That's why $1 + 2 + 4 + \cdots + 2^k = 2^{k+1} - 1 < 2 \cdot 2^k$. It's also why building a heap is $O(n)$ and why vector doubling is cheap.

## 8. Square-root loops

```cpp
for (long long i = 1; i * i <= n; i++) work();   // i goes up to √n
```

It stops when $i^2 > n$, i.e. after $\lfloor\sqrt n\rfloor$ iterations: $\Theta(\sqrt n)$. Trial division for primality and enumerating divisors use this, because divisors come in pairs $(d, n/d)$ with one of them $\le \sqrt n$.

## 9. While loops whose pointers only move forward

Some loops look nested but aren't quadratic:

```cpp
int j = 0;
for (int i = 0; i < n; i++) {
    while (j < n && ok(i, j)) j++;     // j never moves backwards
}
```

The inner `while` can run many times for one `i`, but **`j` only increases and never exceeds `n`**. So across the whole outer loop the inner body runs at most $n$ times in total, and the overall cost is $O(n + n) = O(n)$. This "total movement" argument is the heart of **two pointers**, **sliding window** and **monotonic stacks**. It's a form of *amortized analysis* (next lessons).

:::warn Don't multiply blindly
"There's a loop inside a loop, so it's O(n²)" is a common wrong answer. Ask **how many times the inner body runs in total**, not per outer iteration.
:::

## Cheat sheet

| Loop shape | Sum | Result |
|---|---|---|
| `i < n` | $\sum 1$ | $\Theta(n)$ |
| `i < n`, `j < n` | $n \cdot n$ | $\Theta(n^2)$ |
| `i < n`, `j < i` | $\sum i = \frac{n(n-1)}{2}$ | $\Theta(n^2)$ |
| `i *= 2` or `i /= 2` | $\log_2 n$ | $\Theta(\log n)$ |
| `i < n`, `j *= 2` | $n \log n$ | $\Theta(n \log n)$ |
| `j += i` for each `i` | $n H_n$ | $\Theta(n \log n)$ |
| sizes $n, n/2, n/4, \ldots$ | geometric | $\Theta(n)$ |
| `i * i <= n` | $\sqrt n$ | $\Theta(\sqrt n)$ |
| pointer that only moves forward | total movement $\le n$ | $\Theta(n)$ amortized |

## Practice

:::exercise What's the complexity?
```cpp
// (a)
for (int i = n; i > 0; i /= 2)
    for (int j = 0; j < i; j++) work();

// (b)
for (int i = 1; i <= n; i++)
    for (int j = 1; j <= i * i; j++) work();

// (c)
for (int i = 1; i <= n; i *= 2)
    for (int j = 1; j <= n; j *= 2) work();

// (d)
for (int i = 0; i < n; i++)
    for (int j = 0; j < 1000; j++) work();
```
:::

:::solution
- **(a)** $n + \frac n2 + \frac n4 + \cdots < 2n$: $\Theta(n)$ (geometric).
- **(b)** $\sum_{i=1}^n i^2 = \frac{n(n+1)(2n+1)}{6}$: $\Theta(n^3)$.
- **(c)** $\log n \cdot \log n$: $\Theta(\log^2 n)$.
- **(d)** $1000n$: $\Theta(n)$. 1000 is a constant (but in practice it's a big constant, so mention it).
:::

```cpp run level=intermediate title="Verify the practice answers by counting"
#include <bits/stdc++.h>
using namespace std;

int main() {
    for (long long n : {1 << 10, 1 << 14}) {
        long long a = 0, c = 0;
        for (long long i = n; i > 0; i /= 2) for (long long j = 0; j < i; j++) a++;
        for (long long i = 1; i <= n; i *= 2) for (long long j = 1; j <= n; j *= 2) c++;
        cout << "n=" << n << ": (a) " << a << " vs 2n=" << 2 * n
             << " | (c) " << c << " vs log2(n)^2=" << (long long)pow(log2(n) + 1, 2) << '\n';
    }
    long long m = 2000, b = 0;
    for (long long i = 1; i <= m; i++) b += i * i;
    cout << "(b) for n=2000: " << b << " vs n^3/3=" << m * m * m / 3 << '\n';
}
```

## Check yourself

```quiz
? `for (i = 1; i <= n; i++) for (j = i; j <= n; j += i)` is…
- Θ(n²)
+ Θ(n log n)
- Θ(n)
> The inner loop runs n/i times; Σ n/i = n·H_n ≈ n ln n.

? Total work n + n/2 + n/4 + … + 1 is…
+ Θ(n)
- Θ(n log n)
- Θ(log n)
> A decreasing geometric series is dominated by its first term: less than 2n.

? A for-loop over i with a while-loop inside that advances a pointer j which never moves back and stops at n. The total cost is…
- O(n²) always
+ O(n)
- O(n log n)
> j moves at most n times in total across all iterations of i.
```

:::keypoints
- Translate loops into sums; inner bounds can depend on outer variables.
- $\sum i = \frac{n(n+1)}{2} = \Theta(n^2)$; $\sum i^k = \Theta(n^{k+1})$.
- Halving or doubling: $\Theta(\log n)$. Harmonic $\sum n/i = \Theta(n \log n)$. Geometric: the largest term dominates.
- `i * i <= n` is $\Theta(\sqrt n)$.
- Count **total** inner work: a pointer that only moves forward makes "nested" loops linear.
:::
