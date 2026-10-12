---
title: Amortized Analysis
level: advanced
time: 40
summary: Why some operations are "expensive sometimes but cheap on average" — the aggregate, accounting and potential methods, a full proof that vector::push_back is O(1) amortized (and why growing by +k would be O(n²)), the binary counter, multipop stacks, and how this explains two pointers and monotonic stacks.
---

Some data structures have operations that are usually cheap but **occasionally very expensive**: a vector that has to regrow, a hash table that rehashes, a stack that pops many elements at once. Worst-case analysis of a single operation gives a scary bound. Amortized analysis gives the honest one.

:::def Amortized cost
The cost of an operation **averaged over a worst-case sequence of operations**. If any sequence of $m$ operations costs at most $m \cdot c$ in total, each operation has amortized cost $O(c)$, even if one particular operation costs much more.
:::

:::warn Amortized ≠ average case
Average-case analysis assumes **random inputs**: it's about probability. Amortized analysis makes **no** probability assumptions. It's a worst-case guarantee on the **total** cost of a sequence. A `vector` gives you $O(n)$ total for $n$ pushes, every time, on any input.
:::

## The running example: a growing array

A dynamic array (`vector`) with capacity $C$ holds up to $C$ elements. When you `push_back` into a full array, it allocates capacity $2C$, copies the $C$ old elements over, and then writes the new one.

- A normal push costs **1**.
- A push into a full array costs **$C + 1$** (copy $C$ elements, then write).

The worst single push costs $\Theta(n)$. Is `push_back` therefore $O(n)$? No. Let's prove it's $O(1)$ amortized three ways.

## Method 1: aggregate analysis

Add up the total cost of $n$ pushes directly, then divide by $n$.

:::derive Total cost of n pushes with doubling (start at capacity 1)
\text{regrows happen at sizes } 1, 2, 4, \ldots, 2^k \text{ with } 2^k < n || capacity doubles each time
\text{copy cost} = 1 + 2 + 4 + \cdots + 2^k = 2^{k+1} - 1 || geometric series
< 2n || because 2^k < n
\text{total} = \underbrace{n}_{\text{writes}} + \underbrace{(\text{copies})}_{< 2n} < 3n || plus one write per push
! \text{amortized cost per push} < 3 = O(1) ||
:::

## Method 2: the accounting (banker's) method

Charge every push a fixed **amortized price**, say 3 coins. The real cost is paid out of these coins, and any surplus is saved as **credit** on the data structure. If the credit never goes negative, the total real cost is at most the total charged.

:::proof push_back costs 3 coins each
Charge 3 coins per push. Spend 1 on writing the element and put 2 coins **on that element** as savings.

Just after a regrow to capacity $2C$, the array holds $C$ elements with no credit. Before the next regrow, $C$ new elements arrive, each bringing 2 coins: $2C$ coins saved. The next regrow copies $2C$ elements and costs exactly $2C$ coins, so the savings are never negative. Total real cost ≤ $3n$, so each push is $O(1)$ amortized.
:::

## Method 3: the potential method

The most general tool. Define a **potential function** $\Phi$ that measures "stored-up work" in the current state, with $\Phi \ge 0$ and $\Phi_0 = 0$. The amortized cost of an operation is

$$\hat{c}_i = c_i + \Phi_i - \Phi_{i-1}$$

Summed over all operations, the $\Phi$ terms telescope: $\sum \hat c_i = \sum c_i + \Phi_n - \Phi_0 \ge \sum c_i$. So the amortized costs bound the real total.

:::derive Potential for a doubling array: Φ = 2·size − capacity
\text{push, no regrow: } c = 1,\; \Delta\Phi = 2 || size grows by 1, capacity unchanged
\hat c = 1 + 2 = 3 ||
\text{push with regrow (size = cap = C before): } c = C + 1 || copy C, then write
\Phi_{\text{before}} = 2C - C = C, \quad \Phi_{\text{after}} = 2(C+1) - 2C = 2 || new capacity 2C
\hat c = (C + 1) + (2 - C) = 3 || the potential drop pays for the copying
! \text{every push has amortized cost exactly } 3 = O(1) || (and Φ ≥ 0 because the array is always at least half full)
:::

## Why the growth factor matters

What if the vector grew by a **fixed amount** $k$ instead of doubling?

:::derive Growing by +k: regrows at k, 2k, 3k, …
\text{copies} = k + 2k + 3k + \cdots + \tfrac{n}{k}\cdot k || one regrow every k pushes
= k \cdot \frac{(n/k)(n/k + 1)}{2} \approx \frac{n^2}{2k} || arithmetic series
! \text{total} = \Theta(n^2/k) \Rightarrow O(n) \text{ amortized per push for constant } k ||
:::

Growing by any **constant factor** (×1.5, ×2) gives $O(1)$ amortized. Growing by a **constant amount** gives $O(n)$ amortized. Let's measure:

```cpp run level=intermediate title="Doubling vs ×1.5 vs +1000"
#include <bits/stdc++.h>
using namespace std;

// simulate n pushes and count element copies under a growth policy
long long copiesFor(long long n, function<long long(long long)> grow) {
    long long cap = 1, size = 0, copies = 0;
    for (long long i = 0; i < n; i++) {
        if (size == cap) { copies += size; cap = grow(cap); }
        size++;
    }
    return copies;
}

int main() {
    for (long long n : {10'000LL, 1'000'000LL, 10'000'000LL}) {
        long long d = copiesFor(n, [](long long c) { return 2 * c; });
        long long h = copiesFor(n, [](long long c) { return max(c + 1, c * 3 / 2); });
        long long a = copiesFor(n, [](long long c) { return c + 1000; });
        cout << "n=" << setw(9) << n << "  x2: " << fixed << setprecision(2) << (double)d / n
             << " copies/push   x1.5: " << (double)h / n
             << "   +1000: " << (double)a / n << '\n';
    }
}
```

With a constant factor, copies per push stay flat (below 2 for doubling, below 3 for ×1.5). With +1000, they **grow linearly with $n$**.

:::note Why does shrinking need care?
If a vector halved its capacity as soon as it became half full, alternating push/pop exactly at the boundary would regrow and shrink every time, costing $\Theta(n)$ per operation. The safe rule is to shrink to half when the array becomes **a quarter** full. (`std::vector` simply never shrinks automatically. Call `shrink_to_fit()` yourself.)
:::

## Example: incrementing a binary counter

Add 1 to a $k$-bit counter, $n$ times. A single increment can flip many bits (`0111 → 1000`), up to $k$.

:::derive Aggregate count of bit flips
\text{bit 0 flips every increment: } n \text{ times} ||
\text{bit 1 flips every 2nd increment: } n/2 \text{ times} ||
\text{bit } i \text{ flips } \lfloor n/2^i \rfloor \text{ times} ||
\text{total} \le n\left(1 + \tfrac12 + \tfrac14 + \cdots\right) < 2n || geometric series
! O(1) \text{ amortized flips per increment} ||
:::

## Example: stack with multipop

Operations: `push(x)`, `pop()`, and `multipop(k)`, which pops $k$ elements. One `multipop` can cost $n$, but **every element is pushed once and popped at most once**. So $n$ operations of any mix cost $O(n)$ in total, which is $O(1)$ amortized. (Potential: $\Phi$ = number of elements on the stack.)

## Where you'll use this in interviews

That "each element enters once, leaves once" argument is everywhere:

| Technique | Why the total is O(n) |
|---|---|
| Two pointers / sliding window | each pointer moves forward at most $n$ times in total |
| Monotonic stack | each index is pushed once and popped at most once |
| Monotonic deque | each index enters and leaves the deque at most once |
| BFS / DFS | each vertex is processed once, each edge looked at once or twice |
| Union-find | path compression makes later finds faster (amortized $O(\alpha(n))$) |
| `vector::push_back`, `unordered_map` rehashing | geometric growth |

```viz algo=monotonic-stack
```

The inner `while` loop above sometimes pops several elements, but the total number of pops can never exceed the number of pushes, which is $n$.

## Check yourself

```quiz
? n push_backs into a doubling vector cause how many element copies in total?
+ Fewer than 2n
- About n log n
- About n²/2
> 1 + 2 + 4 + … + 2^k < 2n.

? A vector grows its capacity by +100 each time. n push_backs take…
- O(n)
- O(n log n)
+ O(n²)
> Copies ≈ n²/200: quadratic.

? What is the key difference between amortized and average-case analysis?
+ Amortized is a worst-case bound on the total of a sequence; average case assumes random inputs
- They're the same thing
- Amortized only applies to vectors
> Amortized bounds involve no probability.

? In the potential method, why must Φ never go below its starting value?
+ So that the sum of amortized costs is an upper bound on the sum of real costs
- So that operations are fast
- It's a convention with no purpose
> Σ ĉ = Σ c + Φ_end − Φ_start ≥ Σ c when Φ_end ≥ Φ_start.
```

:::keypoints
- Amortized = worst-case **total** over a sequence, divided by its length. No randomness involved.
- Aggregate: sum everything. Accounting: overcharge cheap operations and bank credit. Potential: $\hat c = c + \Delta\Phi$.
- Doubling (any constant factor) → $O(1)$ amortized `push_back`; constant-amount growth → $O(n)$.
- "Each element is pushed/visited/moved at most once" proves that two pointers, monotonic stacks and BFS are linear.
:::
