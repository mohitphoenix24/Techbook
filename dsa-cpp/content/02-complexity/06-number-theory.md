---
title: Number Theory for Interviews
level: intermediate
time: 50
summary: Primes by trial division (and why √n is enough), the Sieve of Eratosthenes and its n log log n cost, GCD with Euclid's algorithm (correctness proof and why it's logarithmic), LCM, modular arithmetic rules, fast exponentiation, modular inverses via Fermat, and n-choose-k modulo a prime.
---

A small amount of number theory unlocks a whole class of problems: "count primes", "power modulo 10⁹+7", "GCD of strings", "number of ways modulo a prime". Every result here comes with the reason it works.

## Divisibility and primes

:::def Prime
An integer $p > 1$ whose only positive divisors are $1$ and $p$. Every integer $n > 1$ factors **uniquely** into primes (the Fundamental Theorem of Arithmetic), for example $360 = 2^3 \cdot 3^2 \cdot 5$.
:::

### Trial division: why √n is enough

:::proof A composite n has a divisor ≤ √n
If $n = a \cdot b$ with $1 < a \le b$, then $a \cdot a \le a \cdot b = n$, so $a \le \sqrt n$. So if no number in $[2, \sqrt n]$ divides $n$, then $n$ is prime.
:::

```cpp run level=easy title="Primality test and factorization in O(√n)"
#include <bits/stdc++.h>
using namespace std;

bool isPrime(long long n) {
    if (n < 2) return false;
    for (long long d = 2; d * d <= n; d++)        // d*d avoids floating-point sqrt
        if (n % d == 0) return false;
    return true;
}

vector<pair<long long, int>> factorize(long long n) {
    vector<pair<long long, int>> f;
    for (long long p = 2; p * p <= n; p++) {
        int e = 0;
        while (n % p == 0) { n /= p; e++; }
        if (e) f.push_back({p, e});
    }
    if (n > 1) f.push_back({n, 1});               // whatever is left is a prime > √(original)
    return f;
}

int main() {
    cout << boolalpha << isPrime(97) << ' ' << isPrime(1'000'000'007) << ' ' << isPrime(91) << '\n';
    for (auto [p, e] : factorize(360)) cout << p << '^' << e << ' ';
    cout << '\n';
}
```

## The Sieve of Eratosthenes

To find **all** primes up to $n$, cross out multiples instead of testing each number.

:::flow Sieve
Assume all prime | mark 2…n as prime
Take the next prime p | the smallest unmarked number
Cross out multiples | p², p²+p, p²+2p, … are composite
Repeat while p² ≤ n | what's left is prime
:::

Why start crossing at $p^2$? Any smaller multiple $k \cdot p$ with $k < p$ has a prime factor smaller than $p$, so it was already crossed out.

```cpp run level=easy title="Sieve: all primes up to n"
#include <bits/stdc++.h>
using namespace std;

vector<bool> sieve(int n) {
    vector<bool> isPrime(n + 1, true);
    isPrime[0] = false;
    if (n >= 1) isPrime[1] = false;
    for (long long p = 2; p * p <= n; p++)
        if (isPrime[p])
            for (long long m = p * p; m <= n; m += p) isPrime[m] = false;
    return isPrime;
}

int main() {
    auto pr = sieve(50);
    for (int i = 0; i <= 50; i++) if (pr[i]) cout << i << ' ';
    cout << '\n';
    auto big = sieve(10'000'000);
    cout << "primes below 10^7: " << count(big.begin(), big.end(), true) << '\n';
}
```

:::derive Why the sieve is O(n log log n)
\text{work} = \sum_{p \le \sqrt n,\; p \text{ prime}} \frac{n}{p} || each prime p crosses out about n/p numbers
= n \sum_{p \le \sqrt n} \frac{1}{p} || factor out n
\sum_{p \le x} \frac1p = \ln\ln x + O(1) || Mertens' theorem: the sum of prime reciprocals grows like ln ln
! \text{work} = \Theta(n \log\log n) || for n = 10⁷, log log n ≈ 2.8: practically linear
:::

Compare this with crossing out multiples of **every** number (not just primes): $\sum n/i = \Theta(n \log n)$, the harmonic series. Skipping composites saves a lot.

## GCD and Euclid's algorithm

:::def Greatest common divisor
$\gcd(a, b)$ is the largest integer that divides both $a$ and $b$. $\gcd(12, 18) = 6$. Also $\gcd(a, 0) = a$.
:::

:::proof gcd(a, b) = gcd(b, a mod b)
Write $a = qb + r$ with $r = a \bmod b$. If $d$ divides both $a$ and $b$, then it divides $r = a - qb$. Conversely, if $d$ divides $b$ and $r$, it divides $a = qb + r$. So $(a, b)$ and $(b, r)$ have **exactly the same common divisors**, and therefore the same greatest one.
:::

```cpp run level=easy title="Euclid's algorithm, gcd and lcm"
#include <bits/stdc++.h>
using namespace std;

long long gcdRec(long long a, long long b) { return b == 0 ? a : gcdRec(b, a % b); }
long long lcmOf(long long a, long long b) { return a / gcdRec(a, b) * b; }   // divide first: no overflow

int main() {
    cout << gcdRec(1071, 462) << ' ' << gcd(1071, 462) << '\n';          // std::gcd (C++17)
    cout << lcmOf(4, 6) << ' ' << lcm(21, 6) << '\n';
    // trace the steps
    long long a = 1071, b = 462;
    while (b) { cout << "gcd(" << a << ", " << b << ") -> "; tie(a, b) = make_pair(b, a % b); }
    cout << a << '\n';
}
```

:::derive Why Euclid takes O(log min(a, b)) steps
\text{if } b \le a/2: \; a \bmod b < b \le a/2 || the remainder is always smaller than b
\text{if } b > a/2: \; a \bmod b = a - b < a/2 || then the quotient is 1
\Rightarrow \text{after two steps, the first argument at least halves} || (a, b) → (b, r) → (r, b mod r)
! \text{steps} \le 2\log_2 \min(a,b) = O(\log \min(a,b)) || the worst case is consecutive Fibonacci numbers (Lamé)
:::

### Extended Euclid

It also finds integers $x, y$ with $ax + by = \gcd(a, b)$ (Bézout's identity). This is useful for modular inverses when the modulus isn't prime.

```cpp run level=advanced title="Extended Euclid"
#include <bits/stdc++.h>
using namespace std;

// returns g = gcd(a, b) and sets x, y so that a*x + b*y = g
long long extgcd(long long a, long long b, long long& x, long long& y) {
    if (b == 0) { x = 1; y = 0; return a; }
    long long x1, y1;
    long long g = extgcd(b, a % b, x1, y1);
    x = y1;                       // from b*x1 + (a - (a/b)*b)*y1 = g
    y = x1 - (a / b) * y1;
    return g;
}

int main() {
    long long x, y;
    long long g = extgcd(240, 46, x, y);
    cout << "gcd = " << g << ", 240*(" << x << ") + 46*(" << y << ") = " << 240 * x + 46 * y << '\n';
}
```

## Modular arithmetic

"Return the answer modulo $10^9+7$" means: compute the exact answer, then take the remainder. Since the exact answer is astronomically large, you reduce **as you go**, which works because:

$$\begin{aligned} (a + b) \bmod m &= ((a \bmod m) + (b \bmod m)) \bmod m \\ (a - b) \bmod m &= ((a \bmod m) - (b \bmod m) + m) \bmod m \\ (a \cdot b) \bmod m &= ((a \bmod m)\cdot(b \bmod m)) \bmod m \end{aligned}$$

:::warn Division doesn't work like that
$(a / b) \bmod m \ne ((a \bmod m)/(b \bmod m)) \bmod m$. Instead you multiply by the **modular inverse** of $b$ (below).
:::

:::tip Why 10⁹+7?
It's prime (so inverses exist), it fits in an `int`, and the product of two values below it ($\approx 10^{18}$) fits in a `long long`. Always multiply as `long long`: `a * b % MOD` with `a, b < MOD`.
:::

## Fast exponentiation

Computing $a^n$ by multiplying $n$ times is $O(n)$. That's hopeless for $n = 10^{18}$. **Exponentiation by squaring** uses the binary representation of $n$:

:::derive a^n by repeated squaring
a^{13} = a^{8} \cdot a^{4} \cdot a^{1} || 13 = 1101 in binary = 8 + 4 + 1
a, a^2, a^4, a^8, \ldots || each is the square of the previous
\text{multiply the powers whose bit is 1 in } n ||
! T(n) = T(n/2) + O(1) = O(\log n) \text{ multiplications} ||
:::

```cpp run level=intermediate title="Modular power, inverse and n choose k"
#include <bits/stdc++.h>
using namespace std;
const long long MOD = 1'000'000'007;

long long power(long long a, long long n, long long m = MOD) {
    long long r = 1;
    a %= m;
    while (n > 0) {
        if (n & 1) r = r * a % m;   // this bit is set: multiply it in
        a = a * a % m;              // a, a^2, a^4, ...
        n >>= 1;
    }
    return r;
}

long long inverse(long long a) { return power(a, MOD - 2); }   // Fermat: a^(p-2) is a^(-1) mod p

int main() {
    cout << "2^10 = " << power(2, 10) << ", 2^(10^18) mod p = " << power(2, 1'000'000'000'000'000'000LL) << '\n';
    long long inv3 = inverse(3);
    cout << "inverse of 3 = " << inv3 << ", check 3*inv mod p = " << 3 * inv3 % MOD << '\n';

    // n choose k mod p with precomputed factorials: O(N) setup, O(1) per query
    const int N = 1'000'000;
    vector<long long> fact(N + 1), inv(N + 1);
    fact[0] = 1;
    for (int i = 1; i <= N; i++) fact[i] = fact[i - 1] * i % MOD;
    inv[N] = inverse(fact[N]);
    for (int i = N; i > 0; i--) inv[i - 1] = inv[i] * i % MOD;     // 1/(i-1)! = i / i!
    auto C = [&](int n, int k) { return (k < 0 || k > n) ? 0 : fact[n] * inv[k] % MOD * inv[n - k] % MOD; };
    cout << "C(10,3) = " << C(10, 3) << ", C(10^6, 5*10^5) mod p = " << C(N, N / 2) << '\n';
}
```

:::proof Fermat's little theorem gives the inverse
For a prime $p$ and $a$ not divisible by $p$: $a^{p-1} \equiv 1 \pmod p$. So $a \cdot a^{p-2} = a^{p-1} \equiv 1$, which means $a^{p-2}$ is the inverse of $a$ modulo $p$. (Fermat's theorem holds because multiplying $\{1, \ldots, p-1\}$ by $a$ only permutes the set modulo $p$. Comparing the products of both sets gives $a^{p-1}(p-1)! \equiv (p-1)!$, and $(p-1)!$ can be cancelled.)
:::

## Problems

:::problem Count Primes {level=medium lc=count-primes tags="math,sieve"}
Return how many primes are **strictly less than** `n` ($0 \le n \le 5 \cdot 10^6$).

Example: `n = 10` → `4` (2, 3, 5, 7).

:::hint Hint
Testing each number with trial division is $O(n\sqrt n)$, too slow. Use the sieve: $O(n \log\log n)$.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int countPrimes(int n) {
    if (n < 3) return 0;
    vector<char> composite(n, 0);               // char is faster than vector<bool> here
    int count = n - 2;                          // candidates 2..n-1
    for (long long p = 2; p * p < n; p++)
        if (!composite[p])
            for (long long m = p * p; m < n; m += p)
                if (!composite[m]) { composite[m] = 1; count--; }
    return count;
}

int main() {
    cout << countPrimes(10) << ' ' << countPrimes(0) << ' ' << countPrimes(5'000'000) << '\n';
}
```

:::complexity
Time | O(n \log\log n) |
Space | O(n) |
:::
:::
:::

:::problem Pow(x, n) {level=medium lc=powx-n tags="math,recursion,binary exponentiation"}
Implement `myPow(double x, int n)`, which returns $x^n$. `n` can be negative, including $-2^{31}$.

Examples: `2.0, 10` → `1024.0`; `2.0, -2` → `0.25`.

:::hint Hint 1
Use squaring for $O(\log |n|)$. For negative `n`, compute $(1/x)^{-n}$.
:::

:::hint Hint 2
`-n` overflows when `n = INT_MIN`. Convert to `long long` first.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

double myPow(double x, int n) {
    long long N = n;                 // avoid overflow of -INT_MIN
    if (N < 0) { x = 1 / x; N = -N; }
    double r = 1;
    while (N > 0) {
        if (N & 1) r *= x;
        x *= x;
        N >>= 1;
    }
    return r;
}

int main() {
    cout << myPow(2.0, 10) << ' ' << myPow(2.0, -2) << ' ' << myPow(2.1, 3) << ' ' << myPow(1.0, INT_MIN) << '\n';
}
```

:::complexity
Time | O(\log \lvert n \rvert) |
Space | O(1) | iterative
:::
:::
:::

:::problem Greatest Common Divisor of Strings {level=easy lc=greatest-common-divisor-of-strings tags="string,math,gcd"}
A string `t` divides `s` if `s` is `t` repeated some number of times. Return the largest string that divides both `str1` and `str2`.

Example: `"ABCABC", "ABC"` → `"ABC"`; `"ABABAB", "ABAB"` → `"AB"`; `"LEET", "CODE"` → `""`.

:::hint Hint
If a common divisor exists, then `str1 + str2 == str2 + str1`. When that holds, the answer's length is the gcd of the two lengths.
:::

:::solution
If both strings are repetitions of the same block `t`, concatenating in either order gives the same string. Conversely, if `s1 + s2 == s2 + s1`, both are powers of a common block (a classic lemma about strings). The largest block has length $\gcd(|s_1|, |s_2|)$.

```cpp run
#include <bits/stdc++.h>
using namespace std;

string gcdOfStrings(const string& a, const string& b) {
    if (a + b != b + a) return "";
    return a.substr(0, gcd(a.size(), b.size()));
}

int main() {
    cout << '"' << gcdOfStrings("ABCABC", "ABC") << "\" \"" << gcdOfStrings("ABABAB", "ABAB")
         << "\" \"" << gcdOfStrings("LEET", "CODE") << "\"\n";
}
```

:::complexity
Time | O(n + m) |
Space | O(n + m) | for the concatenations
:::
:::
:::

## Check yourself

```quiz
? Why does trial division only need to check divisors up to √n?
+ If n = a·b with a ≤ b, then a ≤ √n
- Because primes are rare
- Because √n is always prime
> One factor of every factor pair is at most √n.

? How many multiplications does fast exponentiation use for a^n?
- n
+ O(log n)
- O(√n)
> One squaring per bit of n, plus at most one extra multiply per bit.

? How do you divide by b modulo the prime p = 10⁹+7?
- Compute (a % p) / (b % p)
+ Multiply by b^(p−2) mod p
- Division isn't possible
> Fermat's little theorem gives the inverse.
```

:::keypoints
- Trial division to $\sqrt n$; sieve all primes up to $n$ in $O(n \log\log n)$, crossing out from $p^2$.
- $\gcd(a,b) = \gcd(b, a \bmod b)$ in $O(\log \min)$ steps. For lcm, divide before multiplying.
- Reduce mod $m$ after every `+`, `−` (add $m$) and `×` (in `long long`). Never divide directly.
- Exponentiation by squaring: $O(\log n)$. Inverse modulo a prime: $a^{p-2}$. $\binom nk$ via factorials and inverse factorials.
:::
