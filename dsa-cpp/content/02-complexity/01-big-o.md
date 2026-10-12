---
title: Big-O, Big-Ω and Big-Θ — Measuring Growth
level: intermediate
time: 45
summary: Why we count steps instead of seconds, the formal definitions of O, Ω, Θ (with constants c and n₀) and how to prove them, the limit test, the growth hierarchy, rules for simplifying, best/worst/average case, and the input-size → required-complexity table every interviewer expects you to know.
---

"What's the time complexity?" comes up in every single interview. This lesson gives you the **intuition**, the **precise definition**, and the **practical rules**, so you can answer quickly and defend the answer if pushed.

## Why not just measure seconds?

Seconds depend on the machine, the compiler, the language and what else is running. What we want to know is **how the running time grows as the input grows**. Twice the data: twice the time? Four times? Barely more?

:::def Time complexity
A function $T(n)$ that counts the **number of basic steps** an algorithm takes on an input of size $n$, described by its **growth rate** as $n$ gets large.
:::

:::def Basic step (the RAM model)
We pretend each simple operation (arithmetic, comparison, reading or writing one memory cell, a function call) costs **1 unit**. It isn't exactly true, but it's close enough to compare algorithms. A loop that runs $n$ times doing constant work costs about $c \cdot n$ units.
:::

Play with $n$ and watch how the functions pull apart. The table shows how long each would take at roughly $10^8$ simple operations per second, a good estimate for C++:

```viz algo=growth
```

At $n = 10$ everything is instant. Drag $n$ to $10^5$: $n^2$ needs about 100 ms, but $2^n$ needs longer than the age of the universe. **The growth rate dominates everything else.**

## Big-O: an upper bound

:::def Big-O
$f(n) = O(g(n))$ means: there exist constants $c > 0$ and $n_0$ such that
$$0 \le f(n) \le c \cdot g(n) \quad \text{for all } n \ge n_0.$$
In words: **from some point on, $f$ grows no faster than a constant times $g$.**
:::

The constants are the whole point. $c$ lets us ignore constant factors (a $3n$ algorithm and a $100n$ algorithm are both $O(n)$). $n_0$ lets us ignore small inputs.

:::derive Prove that 3n² + 5n + 2 = O(n²)
3n^2 + 5n + 2 \le 3n^2 + 5n^2 + 2n^2 || for n ≥ 1: n ≤ n² and 1 ≤ n²
= 10n^2 || add the coefficients
! 3n^2 + 5n + 2 \le 10 \cdot n^2 \text{ for all } n \ge 1 || so c = 10, n₀ = 1 works
:::

Any $c$ and $n_0$ that make the inequality true are enough. You don't need the smallest ones.

:::warn O is an upper bound, not "exactly"
Technically $5n = O(n^2)$ is **true**, because $n^2$ bounds it from above. It's just not a useful statement. In interviews, "the complexity is O(…)" means the **tightest** bound you can give. Say $O(n)$, not $O(n^2)$.
:::

## Big-Ω and Big-Θ

:::def Big-Omega (lower bound)
$f(n) = \Omega(g(n))$ if there exist $c > 0$ and $n_0$ with $f(n) \ge c \cdot g(n) \ge 0$ for all $n \ge n_0$. **$f$ grows at least as fast as $g$.**
:::

:::def Big-Theta (tight bound)
$f(n) = \Theta(g(n))$ if $f(n) = O(g(n))$ **and** $f(n) = \Omega(g(n))$. In other words, there are constants $c_1, c_2 > 0$ and $n_0$ with
$$c_1 \, g(n) \le f(n) \le c_2 \, g(n) \quad \text{for all } n \ge n_0.$$
**$f$ and $g$ grow at the same rate.**
:::

:::derive Prove that n²/2 − 3n = Θ(n²)
\tfrac{1}{2}n^2 - 3n \le \tfrac{1}{2}n^2 || upper bound: c₂ = ½ for all n ≥ 1
\tfrac{1}{2}n^2 - 3n \ge \tfrac{1}{4}n^2 \iff \tfrac{1}{4}n^2 \ge 3n || lower bound: try c₁ = ¼
\iff n \ge 12 || divide by n/4 (n > 0)
! \tfrac14 n^2 \le \tfrac12 n^2 - 3n \le \tfrac12 n^2 \text{ for } n \ge 12 || c₁ = ¼, c₂ = ½, n₀ = 12
:::

There are also strict versions: $f = o(g)$ ("little-o") means $f$ grows **strictly slower** ($f/g \to 0$), and $f = \omega(g)$ means strictly faster.

| Notation | Read as | Like |
|---|---|---|
| $f = O(g)$ | $f$ grows no faster than $g$ | $\le$ |
| $f = \Omega(g)$ | $f$ grows no slower than $g$ | $\ge$ |
| $f = \Theta(g)$ | same growth rate | $=$ |
| $f = o(g)$ | strictly slower | $<$ |
| $f = \omega(g)$ | strictly faster | $>$ |

## The limit test (the fastest way to compare)

When the limit exists:

$$\lim_{n\to\infty} \frac{f(n)}{g(n)} = \begin{cases} 0 & \Rightarrow f = o(g) \text{ (so also } O(g)) \\ c,\ 0 < c < \infty & \Rightarrow f = \Theta(g) \\ \infty & \Rightarrow f = \omega(g) \text{ (so also } \Omega(g)) \end{cases}$$

:::derive Is n log n = O(n^1.5)?
\lim_{n\to\infty} \frac{n \log n}{n^{1.5}} = \lim_{n\to\infty} \frac{\log n}{n^{0.5}} || cancel one n
= \lim_{n\to\infty} \frac{1/(n \ln 2)}{0.5\, n^{-0.5}} || L'Hôpital: differentiate top and bottom
= \lim_{n\to\infty} \frac{2}{\ln 2 \cdot \sqrt{n}} = 0 || simplify
! n \log n = o(n^{1.5}) \subseteq O(n^{1.5}) || logs lose to any positive power
:::

## The growth hierarchy

From slowest to fastest growing:

$$1 \;<\; \log n \;<\; \sqrt{n} \;<\; n \;<\; n \log n \;<\; n^2 \;<\; n^3 \;<\; 2^n \;<\; n! \;<\; n^n$$

Two facts behind it, worth remembering:

- **Any power beats any log:** $(\log n)^k = o(n^\varepsilon)$ for every $k$ and every $\varepsilon > 0$.
- **Any exponential beats any power:** $n^k = o(a^n)$ for every $k$ and every $a > 1$.

### Why the base of a logarithm doesn't matter

:::derive Change of base
\log_a n = \frac{\log_b n}{\log_b a} || the change-of-base formula
= \underbrace{\frac{1}{\log_b a}}_{\text{a constant}} \cdot \log_b n || a and b are fixed numbers
! \log_a n = \Theta(\log_b n) || constants disappear inside Θ
:::

So we just write $O(\log n)$. In algorithms it's almost always $\log_2$: halving $n$ until it reaches 1 takes $\log_2 n$ steps.

## Rules for simplifying

| Rule | Example |
|---|---|
| Drop constant factors | $5n^2 \to O(n^2)$ |
| Keep only the dominant term | $n^2 + 1000n + 10^6 \to O(n^2)$ |
| **Sequential** code adds | `loop n; loop m` → $O(n + m)$ |
| **Nested** code multiplies | `loop n { loop m }` → $O(n \cdot m)$ |
| Different inputs keep different letters | two arrays of sizes $n, m$ → $O(n + m)$, **not** $O(n)$ |
| A call costs what the function costs | `sort` inside a loop of $n$ → $O(n \cdot n \log n)$ |

```cpp run level=easy title="Counting steps to confirm the rules"
#include <bits/stdc++.h>
using namespace std;

int main() {
    for (int n : {10, 100, 1000}) {
        long long a = 0, b = 0, c = 0;
        for (int i = 0; i < n; i++) a++;                          // O(n)
        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) b++;  // O(n^2)
        for (int i = 0; i < n; i++) c++;                           // sequential with the
        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) c++;  // nested loop: n + n^2
        cout << "n=" << setw(4) << n << "  single " << setw(4) << a << "  nested " << setw(7) << b
             << "  both " << setw(7) << c << "  (n^2 dominates: " << fixed << setprecision(3) << (double)c / b << "x)\n";
    }
}
```

As $n$ grows, the $n$ term becomes noise next to $n^2$. That's why we keep only the dominant term.

## Best, worst and average case

The same algorithm can take different time on different inputs of the same size. Take linear search for `x` in an array:

| Case | Input | Steps |
|---|---|---|
| Best | `x` is the first element | $\Theta(1)$ |
| Worst | `x` is last or missing | $\Theta(n)$ |
| Average | `x` equally likely anywhere | $\frac{n+1}{2} = \Theta(n)$ |

:::note Which one do interviewers mean?
By default, **worst case**. It's a guarantee. Mention average case when it differs in an important way: quicksort is $O(n \log n)$ on average but $O(n^2)$ in the worst case, and hash maps are $O(1)$ average but $O(n)$ worst.
:::

:::warn Case ≠ bound
"Best case" and "Big-Ω" are different ideas. Ω is a bound on a **function**. Best/worst case picks **which function** (which inputs) we're talking about. You can give an $O$ bound on the best case, or an $\Omega$ bound on the worst case.
:::

## From constraints to complexity

A modern judge does about $10^8$–$10^9$ simple operations per second, and limits are usually 1–2 seconds. So the input size in the problem statement **tells you which complexity they expect**:

| Max $n$ | Allowed complexity | Typical algorithm |
|---|---|---|
| $n \le 10$ | $O(n!)$, $O(n^6)$ | all permutations |
| $n \le 20$ | $O(2^n \cdot n)$ | subsets, bitmask DP |
| $n \le 500$ | $O(n^3)$ | Floyd–Warshall, interval DP |
| $n \le 5000$ | $O(n^2)$ | pairs, 2D DP |
| $n \le 10^5$–$10^6$ | $O(n \log n)$ | sorting, heaps, binary search, segment trees |
| $n \le 10^8$ | $O(n)$ | one pass, two pointers |
| $n > 10^8$ | $O(\log n)$ or $O(1)$ | binary search on the answer, math |

:::interview
Read the constraints **before** thinking about an algorithm. "$n \le 10^5$" quietly says "O(n²) will time out; find O(n log n) or better". Saying this out loud ("with 10⁵ elements, a quadratic solution is 10¹⁰ steps, so I'm aiming for n log n") impresses interviewers.
:::

## Practice

:::exercise Classify these
Give the tightest Θ bound:

1. $f(n) = 7n^3 + n^2 \log n$
2. $f(n) = 2^{n+3}$
3. $f(n) = \log(n^5)$
4. $f(n) = n + \sqrt{n} \log^2 n$
5. $f(n) = 2^{2n}$. Is it $\Theta(2^n)$?
:::

:::solution
1. $\Theta(n^3)$: $n^2 \log n = o(n^3)$.
2. $\Theta(2^n)$: $2^{n+3} = 8 \cdot 2^n$, a constant factor.
3. $\Theta(\log n)$: $\log(n^5) = 5 \log n$.
4. $\Theta(n)$: $\sqrt{n} \log^2 n = o(n)$, since logs lose to powers.
5. **No.** $2^{2n} = 4^n$, and $\frac{4^n}{2^n} = 2^n \to \infty$. Constants **in the exponent** are not constant factors.
:::

:::exercise Prove it
Prove from the definition that $n^2 \ne O(n)$.
:::

:::solution
Suppose $n^2 \le c \cdot n$ for all $n \ge n_0$. Dividing by $n > 0$ gives $n \le c$ for all $n \ge n_0$. That's false for $n = \max(n_0, \lceil c \rceil + 1)$. Contradiction, so no constants work and $n^2 \ne O(n)$.
:::

## Check yourself

```quiz
? Which statement is TRUE?
- 2^(n+1) is not O(2^n)
+ log₂ n and log₁₀ n are Θ of each other
- n log n = O(n)
> Logs of different bases differ by a constant factor.

? An algorithm does n² operations when n is even and n operations when n is odd. Its worst-case complexity is…
+ Θ(n²)
- Θ(n)
- Θ(n^1.5)
> Worst case takes the maximum over inputs of each size.

? The constraint is n ≤ 2·10⁵. Which complexity is the safest target?
- O(n²)
+ O(n log n)
- O(2ⁿ)
> n² = 4·10¹⁰ is too slow; n log n ≈ 3.5·10⁶ is fast.

? What does the constant n₀ in the Big-O definition allow?
+ Ignoring small inputs, where lower-order terms might still dominate
- Ignoring constant factors
- Choosing a different log base
> c handles constant factors; n₀ handles "for large enough n".
```

:::keypoints
- $O$ = upper bound ($\le$), $\Omega$ = lower bound ($\ge$), $\Theta$ = tight ($=$), each up to constants $c$ and beyond some $n_0$.
- Prove bounds by finding $c, n_0$; compare quickly with the limit of $f/g$.
- Hierarchy: $1 < \log n < \sqrt n < n < n\log n < n^2 < 2^n < n!$. Log base doesn't matter; constants in exponents do.
- Sequential code adds, nested code multiplies; drop constants and lower-order terms; keep separate input sizes separate.
- Default to worst case. Use constraints to choose the target complexity ($10^8$ operations ≈ 1 second).
:::
