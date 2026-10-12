---
title: Bit Manipulation
level: intermediate
time: 45
summary: Binary numbers and two's complement (why −x = ~x + 1), the bitwise operators, masks to set/clear/toggle/test bits, the x & (x−1) and x & −x tricks, popcount builtins, XOR identities behind "Single Number", iterating over subsets with bitmasks (and submasks in 3ⁿ), and bitset.
---

Bits give you **constant-time set operations on up to 64 elements**, O(1)-space tricks, and fast subset enumeration. Interviews love a few classic bit questions, and bitmask DP builds on all of this.

## Binary in one minute

A number is a sum of powers of two: $13 = 8 + 4 + 1 = 1101_2$. Bit $i$ (counting from 0 at the right) is worth $2^i$.

:::def Two's complement
How computers store negative integers. For a $w$-bit integer, $-x$ is stored as $2^w - x$. Two consequences: the top bit means "negative", and **$-x = \sim x + 1$** (flip all bits, add one).
:::

:::derive Why −x = ~x + 1
x + \sim x = 11\ldots1_2 = 2^w - 1 || each bit is 1 in exactly one of x and ~x
\sim x + 1 = 2^w - x || rearrange
! \sim x + 1 \equiv -x \pmod{2^w} || that's exactly how −x is stored
:::

## The operators

| Operator | Meaning | Example (`a = 1100`, `b = 1010`) |
|---|---|---|
| `a & b` | AND: 1 if both are 1 | `1000` |
| `a \| b` | OR: 1 if either is 1 | `1110` |
| `a ^ b` | XOR: 1 if they differ | `0110` |
| `~a` | NOT: flip every bit | `…0011` |
| `a << k` | shift left: × $2^k$ | `1100 << 1 = 11000` |
| `a >> k` | shift right: ÷ $2^k$ (floor, for non-negative values) | `1100 >> 2 = 11` |

:::warn Precedence trap
`==` binds tighter than `&`. So `if (x & 1 == 0)` means `x & (1 == 0)`, which is always 0. Write `if ((x & 1) == 0)`. When in doubt, add parentheses.
:::

:::warn Shift width
`1 << 40` is undefined behaviour, because `1` is a 32-bit `int`. Use `1LL << 40`. Shifting by the type's width or more, or shifting a negative number left, is also undefined.
:::

## Masks: working with single bits

:::syntax
```cpp
(x >> i) & 1        // test bit i
x | (1 << i)        // set bit i
x & ~(1 << i)       // clear bit i
x ^ (1 << i)        // toggle bit i
x & (x - 1)         // clear the lowest set bit
x & (-x)            // keep only the lowest set bit ("lowbit")
(x & (x - 1)) == 0  // x is a power of two (for x > 0)
```
:::

:::proof Why x & (x−1) clears the lowest set bit
Write $x = \ldots 1\,0\cdots0$: some prefix, then the lowest 1, then $k$ zeros. Subtracting 1 borrows through the zeros: $x - 1 = \ldots 0\,1\cdots1$. The prefix is unchanged, and the lowest 1 and the zeros below it are flipped. ANDing keeps the prefix and zeroes the rest. So $x \,\&\, (x-1)$ is $x$ with its lowest set bit removed.
:::

:::proof Why x & −x isolates the lowest set bit
$-x = \sim x + 1$. Flipping turns the trailing zeros into ones and the lowest 1 into 0. Adding 1 carries through those ones and turns that bit back into a 1. So $-x$ agrees with $x$ at the lowest set bit and below, and is the **opposite** of $x$ above it. The AND keeps exactly that one bit. (This is the heart of Fenwick trees.)
:::

```cpp run level=easy title="Bit tricks, printed in binary"
#include <bits/stdc++.h>
using namespace std;

int main() {
    unsigned x = 0b101100;                       // 44
    auto show = [](const char* label, unsigned v) { cout << setw(14) << left << label << bitset<8>(v) << " = " << v << '\n'; };
    show("x", x);
    show("bit 3 set?", (x >> 3) & 1);
    show("set bit 0", x | 1u);
    show("clear bit 2", x & ~(1u << 2));
    show("toggle bit 5", x ^ (1u << 5));
    show("x & (x-1)", x & (x - 1));
    show("x & -x", x & (0u - x));
    cout << "popcount(x) = " << __builtin_popcount(x)
         << ", trailing zeros = " << __builtin_ctz(x)
         << ", leading zeros (32-bit) = " << __builtin_clz(x) << '\n';
    for (unsigned v : {1u, 6u, 16u, 0u}) cout << v << (v && !(v & (v - 1)) ? " is" : " is not") << " a power of two\n";
}
```

| Builtin (GCC/Clang) | Returns | 64-bit version |
|---|---|---|
| `__builtin_popcount(x)` | number of 1 bits | `__builtin_popcountll` |
| `__builtin_ctz(x)` | trailing zeros (x ≠ 0) | `__builtin_ctzll` |
| `__builtin_clz(x)` | leading zeros (x ≠ 0) | `__builtin_clzll` |
| C++20 `std::popcount`, `std::countr_zero`, `std::bit_width` | portable versions | in `<bit>` |

## XOR: the magic operator

XOR has three properties that solve a whole family of problems:

$$a \oplus a = 0, \qquad a \oplus 0 = a, \qquad \oplus \text{ is commutative and associative}$$

So if you XOR a list where every number appears twice except one, **the pairs cancel** and only the single number is left.

```cpp run level=easy title="XOR cancels pairs"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v = {4, 1, 2, 1, 2};
    int x = 0;
    for (int a : v) x ^= a;
    cout << "the unpaired number is " << x << '\n';

    int a = 5, b = 9;                    // swap without a temporary (a party trick, not faster)
    a ^= b; b ^= a; a ^= b;
    cout << "swapped: a=" << a << " b=" << b << '\n';
}
```

## Subsets as bitmasks

A set of up to ~20–25 elements fits in an integer: bit $i$ = "element $i$ is in the set". Then:

| Set operation | Bitmask |
|---|---|
| union | `A \| B` |
| intersection | `A & B` |
| difference | `A & ~B` |
| contains `i` | `(A >> i) & 1` |
| size | `__builtin_popcount(A)` |
| all subsets of $\{0..n-1\}$ | `for (mask = 0; mask < (1 << n); mask++)` |

```cpp run level=intermediate title="All subsets with bitmasks, and submask enumeration"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<char> items = {'a', 'b', 'c'};
    int n = items.size();
    for (int mask = 0; mask < (1 << n); mask++) {           // 2^n subsets
        cout << '{';
        for (int i = 0; i < n; i++) if (mask >> i & 1) cout << items[i];
        cout << "} ";
    }
    cout << '\n';

    // every submask of a mask: sub = (sub - 1) & mask walks them in decreasing order
    int mask = 0b1011;
    cout << "submasks of 1011:";
    for (int sub = mask; ; sub = (sub - 1) & mask) {
        cout << ' ' << bitset<4>(sub);
        if (sub == 0) break;
    }
    cout << '\n';
}
```

:::derive Enumerating all submasks of all masks is 3ⁿ, not 4ⁿ
\sum_{\text{mask}} 2^{\text{popcount(mask)}} || each mask with k set bits has 2^k submasks
= \sum_{k=0}^{n} \binom{n}{k} 2^k || group masks by popcount
= (1 + 2)^n || binomial theorem
! = 3^n || each element is: not in mask, in mask but not sub, or in both
:::

For $n = 15$ that's $1.4 \cdot 10^7$, which is fine. $4^{15} \approx 10^9$ would not be. This comes up in bitmask DP.

## bitset

`bitset<N>` packs $N$ booleans into $N/64$ machine words. Operations like `&`, `|`, `^`, shifts and `count()` process **64 bits per instruction**: an $O(N/64)$ speedup. It's great for reachability, subset-sum feasibility and set intersections.

```cpp run level=advanced title="Subset sum with a bitset: which sums are reachable?"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> w = {3, 5, 9, 14};
    bitset<64> can;            // can[s] = some subset sums to s
    can[0] = 1;
    for (int x : w) can |= can << x;      // either skip x, or add x to every reachable sum
    cout << "reachable sums:";
    for (int s = 0; s < 64; s++) if (can[s]) cout << ' ' << s;
    cout << "\ncount = " << can.count() << '\n';
}
```

## Problems

:::problem Single Number {level=easy lc=single-number tags="bit manipulation,xor"}
Every element appears twice except one. Find it in $O(n)$ time and $O(1)$ space.

Example: `[4,1,2,1,2]` → `4`.

:::hint Hint
What does `a ^ a` equal? What about `a ^ 0`?
:::

:::solution
XOR everything: pairs cancel to 0, and `0 ^ single = single`.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int singleNumber(const vector<int>& nums) {
    int x = 0;
    for (int a : nums) x ^= a;
    return x;
}

int main() { cout << singleNumber({4, 1, 2, 1, 2}) << ' ' << singleNumber({1}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Number of 1 Bits {level=easy lc=number-of-1-bits tags="bit manipulation"}
Return the number of set bits in a 32-bit unsigned integer (its *Hamming weight*). Do it without the builtin as well.

:::hint Hint
`n & (n - 1)` removes one set bit at a time. Count how many times you can do that before `n` is 0.
:::

:::solution
Brian Kernighan's trick loops once per **set** bit, not once per bit position.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int hammingWeight(uint32_t n) {
    int c = 0;
    while (n) { n &= n - 1; c++; }
    return c;
}

int main() {
    for (uint32_t n : {11u, 128u, 4294967293u})
        cout << n << " -> " << hammingWeight(n) << " (builtin: " << __builtin_popcount(n) << ")\n";
}
```

:::complexity
Time | O(\text{popcount}) | at most 32
Space | O(1) |
:::
:::
:::

:::problem Counting Bits {level=easy lc=counting-bits tags="bit manipulation,dynamic programming"}
For every `i` in `0..n`, return the number of 1 bits in `i`, in **O(n)** total.

Example: `n = 5` → `[0,1,1,2,1,2]`.

:::hint Hint
`i >> 1` has the same bits as `i` except the last one, and it's smaller, so you've already computed it.
:::

:::solution
`bits[i] = bits[i >> 1] + (i & 1)`. (Or `bits[i] = bits[i & (i-1)] + 1`.) This is a tiny dynamic program.

```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> countBits(int n) {
    vector<int> b(n + 1, 0);
    for (int i = 1; i <= n; i++) b[i] = b[i >> 1] + (i & 1);
    return b;
}

int main() { for (int x : countBits(10)) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) | the output
:::
:::
:::

:::problem Missing Number {level=easy lc=missing-number tags="bit manipulation,math"}
`nums` holds `n` distinct numbers from `[0, n]`. Exactly one is missing. Find it in $O(n)$ time and $O(1)$ space.

:::hint Hint
XOR all indexes `0..n` with all values. Everything present appears twice.
:::

:::solution
Two O(1)-space ideas. XOR (shown below), or the sum formula $\frac{n(n+1)}{2} - \sum \text{nums}$ in `long long` so it can't overflow.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int missingNumber(const vector<int>& nums) {
    int x = nums.size();                     // start with n (the index that doesn't exist)
    for (int i = 0; i < (int)nums.size(); i++) x ^= i ^ nums[i];
    return x;
}

int main() { cout << missingNumber({3, 0, 1}) << ' ' << missingNumber({9, 6, 4, 2, 3, 5, 7, 0, 1}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Sum of Two Integers {level=medium lc=sum-of-two-integers tags="bit manipulation"}
Add two integers **without** using `+` or `-`.

:::hint Hint
`a ^ b` adds without carrying. `(a & b) << 1` is exactly the carry. Repeat until there's no carry left.
:::

:::solution
This is a ripple-carry adder in software. Using `unsigned` arithmetic avoids undefined behaviour when shifting negative numbers.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int getSum(int a, int b) {
    unsigned x = a, y = b;
    while (y) {
        unsigned carry = (x & y) << 1;
        x ^= y;            // sum without carries
        y = carry;         // carries to add next round
    }
    return (int)x;
}

int main() { cout << getSum(1, 2) << ' ' << getSum(-7, 3) << ' ' << getSum(-1, -1) << '\n'; }
```

:::complexity
Time | O(1) | at most 32 rounds
Space | O(1) |
:::
:::
:::

## Check yourself

```quiz
? What does `x & (x - 1)` do?
+ Clears the lowest set bit
- Clears the highest set bit
- Checks whether x is odd
> The borrow flips the lowest 1 and everything below it.

? `if (x & 1 == 0)` is buggy because…
+ `==` binds tighter than `&`
- & doesn't work on ints
- It checks for odd numbers
> Write ((x & 1) == 0).

? How many (mask, submask) pairs are there for n bits?
- 2ⁿ
+ 3ⁿ
- 4ⁿ
> Each element has three states.

? Which expression safely builds 2⁴⁰?
- 1 << 40
+ 1LL << 40
- pow(2, 40)
> int is 32 bits. pow returns a double, which may round.
```

:::keypoints
- $-x = \sim x + 1$ (two's complement). Watch precedence (`==` before `&`) and shift widths (`1LL << k`).
- Masks: test `(x>>i)&1`, set `|`, clear `& ~`, toggle `^`. `x&(x-1)` drops the lowest 1; `x&-x` keeps only it; power of two ⇔ `x && !(x&(x-1))`.
- XOR cancels pairs, so it finds the unpaired element.
- Bitmasks represent subsets: $2^n$ subsets, $3^n$ (mask, submask) pairs; `bitset` gives a 64× speedup on boolean arrays.
:::
