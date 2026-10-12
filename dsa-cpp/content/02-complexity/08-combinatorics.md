---
title: Counting, Combinatorics & Probability
level: intermediate
time: 45
summary: The counting tools behind complexity bounds and "number of ways" problems — sum and product rules, permutations and combinations (with derivations), Pascal's rule, the binomial theorem, stars and bars, Catalan numbers, inclusion–exclusion, the pigeonhole principle and linearity of expectation.
---

Counting tells you **how big a search space is**: is $2^{20}$ subsets fine, is $20!$ permutations hopeless? It also directly solves "how many ways…" problems. Each formula below is derived, not just stated.

## The two basic rules

:::def Sum rule
If a choice can be made in **one of two separate ways**, with $a$ options in the first way and $b$ in the second (no overlap), there are $a + b$ options.
:::

:::def Product rule
If a process has **two steps**, with $a$ ways to do step 1 and $b$ ways to do step 2 (whatever happened in step 1), there are $a \cdot b$ ways in total.
:::

Example: passwords of 2 letters followed by 3 digits: $26 \cdot 26 \cdot 10 \cdot 10 \cdot 10 = 676{,}000$.

**Subsets:** each of $n$ elements is either in or out, so there are $2 \cdot 2 \cdots 2 = 2^n$ subsets. This is why "try all subsets" is $O(2^n)$.

## Permutations

:::def Permutation
An ordering of items. There are $n! = n \cdot (n-1) \cdots 1$ orderings of $n$ distinct items: $n$ choices for the first position, $n-1$ for the second, and so on (product rule).
:::

Ordered selections of $k$ items out of $n$: $P(n, k) = \frac{n!}{(n-k)!} = n(n-1)\cdots(n-k+1)$.

| $n$ | $n!$ |
|---|---|
| 5 | 120 |
| 10 | 3,628,800 |
| 12 | 479,001,600 |
| 15 | $1.3 \times 10^{12}$ |
| 20 | $2.4 \times 10^{18}$ |

So brute-forcing permutations is only feasible up to about $n = 10$–$11$.

:::note How fast does n! grow? (Stirling)
$n! \approx \sqrt{2\pi n}\left(\frac{n}{e}\right)^n$, so $\log_2(n!) = \Theta(n \log n)$. That fact proves comparison sorting needs $\Omega(n \log n)$ comparisons (see the Sorting lessons).
:::

## Combinations

:::def Combination ("n choose k")
The number of ways to choose $k$ items from $n$ when **order doesn't matter**:
$$\binom{n}{k} = \frac{n!}{k!\,(n-k)!}$$
:::

:::derive Where the formula comes from
P(n,k) = \frac{n!}{(n-k)!} || count ordered selections of k items
\text{each unordered group appears } k! \text{ times} || once for each ordering of its k items
\binom nk \cdot k! = \frac{n!}{(n-k)!} || ordered = unordered × orderings
! \binom nk = \frac{n!}{k!\,(n-k)!} ||
:::

Useful identities: $\binom n0 = \binom nn = 1$, symmetry $\binom nk = \binom n{n-k}$, and $\binom n2 = \frac{n(n-1)}2$ (the number of pairs, which is why "all pairs" loops are $\Theta(n^2)$).

### Pascal's rule

$$\binom nk = \binom{n-1}{k-1} + \binom{n-1}{k}$$

:::proof Pascal's rule by counting two ways
Fix one special item $x$. Every $k$-subset of the $n$ items either **contains** $x$ (then choose the other $k-1$ from the remaining $n-1$: $\binom{n-1}{k-1}$ ways) or **doesn't** (choose all $k$ from the other $n-1$: $\binom{n-1}{k}$ ways). These cases don't overlap, so by the sum rule the total is their sum.
:::

This gives an $O(n^2)$ DP table without any division, which is handy when there's no prime modulus:

```cpp run level=easy title="Pascal's triangle with the recurrence"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 8;
    vector<vector<long long>> C(n + 1, vector<long long>(n + 1, 0));
    for (int i = 0; i <= n; i++) {
        C[i][0] = C[i][i] = 1;
        for (int k = 1; k < i; k++) C[i][k] = C[i - 1][k - 1] + C[i - 1][k];
    }
    for (int i = 0; i <= n; i++) {
        cout << string((n - i) * 2, ' ');
        for (int k = 0; k <= i; k++) cout << setw(4) << C[i][k];
        cout << '\n';
    }
    long long rowSum = 0;
    for (int k = 0; k <= n; k++) rowSum += C[n][k];
    cout << "row " << n << " sums to " << rowSum << " = 2^" << n << '\n';
}
```

### The binomial theorem

$$(x + y)^n = \sum_{k=0}^{n} \binom nk x^k y^{n-k}$$

With $x = y = 1$: $\sum_k \binom nk = 2^n$, the number of subsets counted by size. With $x = 2, y = 1$: $\sum_k \binom nk 2^k = 3^n$, the submask count from the bits lesson.

## Stars and bars

:::def Stars and bars
The number of ways to write $n$ as an **ordered** sum of $k$ non-negative integers, $x_1 + \cdots + x_k = n$, is $\binom{n + k - 1}{k - 1}$.
:::

:::proof Arrange stars and dividers
Draw $n$ stars and $k-1$ bars in a row, for example `★★|★||★★★` for $2+1+0+3$. Every arrangement corresponds to exactly one solution: the bars cut the stars into $k$ groups. There are $n + k - 1$ positions, and we choose which $k-1$ of them are bars: $\binom{n+k-1}{k-1}$.
:::

Example: distribute 10 identical cookies among 4 kids: $\binom{13}{3} = 286$ ways. If each kid must get at least one, give each kid 1 cookie first, then distribute the remaining 6: $\binom{9}{3} = 84$.

## Catalan numbers

$$C_n = \frac{1}{n+1}\binom{2n}{n} = 1, 1, 2, 5, 14, 42, 132, 429, \ldots$$

They count a surprising number of interview-relevant things:

- valid strings of $n$ pairs of parentheses (*Generate Parentheses*),
- **structurally different BSTs** with $n$ keys (*Unique Binary Search Trees*),
- ways to triangulate a polygon with $n+2$ sides,
- monotone lattice paths that never cross the diagonal.

They satisfy the recurrence $C_0 = 1$, $C_{n} = \sum_{i=0}^{n-1} C_i \, C_{n-1-i}$. Choose what goes first (a root, or the first matched pair), then the left part has $i$ items and the right part has the remaining $n-1-i$. They grow like $\frac{4^n}{n^{3/2}\sqrt\pi}$, so exponentially.

## Inclusion–exclusion

When you count a union, you over-count the overlaps:

$$|A \cup B| = |A| + |B| - |A \cap B|, \qquad |A \cup B \cup C| = |A|+|B|+|C| - |A\cap B| - |A\cap C| - |B\cap C| + |A\cap B\cap C|$$

```cpp run level=easy title="Numbers ≤ 1000 divisible by 2, 3 or 5"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int N = 1000;
    int brute = 0;
    for (int i = 1; i <= N; i++) if (i % 2 == 0 || i % 3 == 0 || i % 5 == 0) brute++;
    // inclusion-exclusion over the primes {2, 3, 5}
    int ie = N/2 + N/3 + N/5 - N/6 - N/10 - N/15 + N/30;
    cout << "brute force " << brute << ", inclusion-exclusion " << ie << '\n';
}
```

## The pigeonhole principle

:::def Pigeonhole principle
If you put $n + 1$ items into $n$ boxes, at least one box gets **two or more** items.
:::

It sounds obvious, but it proves things algorithms rely on:

- An array of $n + 1$ values from $[1, n]$ **must** contain a duplicate (*Find the Duplicate Number*).
- In any $n + 1$ prefix sums taken modulo $n$, two are equal, so some non-empty subarray has a sum divisible by $n$.
- In a sequence on a finite state space (like $x \to f(x)$), some state must repeat, so there's a cycle. That's why Floyd's cycle detection always terminates.

## Probability and expectation

:::def Expected value
The weighted average outcome: $E[X] = \sum_x x \cdot P(X = x)$. A fair die has $E = \frac{1+2+3+4+5+6}{6} = 3.5$.
:::

:::def Linearity of expectation
$E[X + Y] = E[X] + E[Y]$, **always**, even when $X$ and $Y$ are dependent. This is the most useful fact in algorithm analysis.
:::

The trick is to write a complicated count as a sum of **indicator variables** (1 if some event happens, else 0) and add up their probabilities.

:::derive Expected number of fixed points of a random permutation
X = \sum_{i=1}^{n} X_i, \; X_i = [\pi(i) = i] || indicator: position i keeps its own value
E[X_i] = P(\pi(i) = i) = \frac1n || i is equally likely to land anywhere
E[X] = \sum_{i=1}^{n} \frac1n || linearity: no need to worry about dependence
! E[X] = 1 || for every n, surprisingly
:::

```cpp run level=intermediate title="Check E[fixed points] = 1 by simulation"
#include <bits/stdc++.h>
using namespace std;

int main() {
    mt19937 rng(7);
    for (int n : {3, 10, 1000}) {
        vector<int> p(n);
        long long total = 0;
        const int trials = 20000;
        for (int t = 0; t < trials; t++) {
            iota(p.begin(), p.end(), 0);
            shuffle(p.begin(), p.end(), rng);
            for (int i = 0; i < n; i++) total += (p[i] == i);
        }
        cout << "n=" << setw(4) << n << "  average fixed points = " << fixed << setprecision(3) << (double)total / trials << '\n';
    }
}
```

The same indicator technique proves that randomized quicksort makes about $2n \ln n$ comparisons on average. You'll see it in the Quick Sort lesson.

## Problems

:::problem Pascal's Triangle {level=easy lc=pascals-triangle tags="math,array"}
Return the first `numRows` rows of Pascal's triangle.

Example: `5` → `[[1],[1,1],[1,2,1],[1,3,3,1],[1,4,6,4,1]]`.

:::hint Hint
Each inner entry is the sum of the two entries above it (Pascal's rule). The ends are always 1.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> generate(int numRows) {
    vector<vector<int>> t;
    for (int i = 0; i < numRows; i++) {
        vector<int> row(i + 1, 1);
        for (int k = 1; k < i; k++) row[k] = t[i - 1][k - 1] + t[i - 1][k];
        t.push_back(row);
    }
    return t;
}

int main() {
    for (auto& r : generate(5)) { for (int x : r) cout << x << ' '; cout << '\n'; }
}
```

:::complexity
Time | O(n^2) | the output itself has n(n+1)/2 numbers
Space | O(n^2) | the output
:::
:::
:::

:::problem Unique Binary Search Trees {level=medium lc=unique-binary-search-trees tags="math,catalan,dynamic programming"}
How many structurally different BSTs store the keys `1..n`?

Example: `n = 3` → `5`.

:::hint Hint 1
Pick the root `r`. Then the keys `1..r-1` form the left subtree and `r+1..n` the right subtree, and the two choices are independent (product rule).
:::

:::hint Hint 2
Let `G[n]` be the answer. Sum over the root: `G[n] = Σ G[r-1] · G[n-r]`. These are the Catalan numbers.
:::

:::solution
A direct DP on the Catalan recurrence, $O(n^2)$. The closed form $C_n = \binom{2n}{n}/(n+1)$ gives $O(n)$ (compute it with a careful product to avoid overflow).

```cpp run
#include <bits/stdc++.h>
using namespace std;

long long numTrees(int n) {
    vector<long long> G(n + 1, 0);
    G[0] = 1;                                   // the empty tree
    for (int m = 1; m <= n; m++)
        for (int root = 1; root <= m; root++)
            G[m] += G[root - 1] * G[m - root];   // left size × right size
    return G[n];
}

long long catalanClosed(int n) {                // C(2n, n) / (n + 1), built step by step
    long long c = 1;
    for (int i = 0; i < n; i++) c = c * 2 * (2 * i + 1) / (i + 2);   // C_{i+1} = C_i * 2(2i+1)/(i+2)
    return c;
}

int main() {
    for (int n = 1; n <= 10; n++) cout << numTrees(n) << (numTrees(n) == catalanClosed(n) ? " " : "! ");
    cout << '\n';
}
```

:::complexity
Time | O(n^2) | DP; O(n) with the closed form
Space | O(n) |
:::
:::
:::

## Check yourself

```quiz
? How many 3-element subsets does a 10-element set have?
- 720
+ 120
- 1000
> C(10,3) = 10·9·8 / 3! = 120. The 720 counts ordered selections.

? x₁ + x₂ + x₃ = 5 with xᵢ ≥ 0 has how many solutions?
- 15
+ 21
- 10
> Stars and bars: C(5+2, 2) = 21.

? Why must an array of n+1 numbers from [1, n] contain a duplicate?
+ Pigeonhole: n+1 items, only n possible values
- Because the array is sorted
- It doesn't have to
> More items than boxes forces a collision.

? E[X + Y] = E[X] + E[Y] holds…
- Only if X and Y are independent
+ Always
- Only for indicator variables
> Linearity of expectation needs no independence.
```

:::keypoints
- Product rule → $2^n$ subsets, $n!$ orderings; feasible brute force is about $n \le 20$ for subsets and $n \le 10$ for permutations.
- $\binom nk = \frac{n!}{k!(n-k)!}$; Pascal $\binom nk = \binom{n-1}{k-1} + \binom{n-1}k$; $\sum_k \binom nk = 2^n$.
- Stars and bars: $\binom{n+k-1}{k-1}$. Catalan numbers count parentheses and BST shapes.
- Inclusion–exclusion fixes over-counting; pigeonhole proves duplicates and cycles exist.
- Linearity of expectation + indicator variables make average-case analysis easy.
:::
