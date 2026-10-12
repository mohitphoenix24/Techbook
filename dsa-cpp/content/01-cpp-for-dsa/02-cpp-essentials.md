---
title: C++ Essentials for Problem Solving
level: easy
time: 35
summary: The C++ core you'll use in every solution — program skeleton, fast input/output, integer types and overflow, division and modulo rules, pass-by-value vs reference, auto, structured bindings and the size_t trap.
---

Interview C++ is a small, sharp subset of the language. This lesson covers exactly that subset. Get these details right and you'll never lose time (or an offer) to a silly overflow or a slow copy.

## The program skeleton

Almost every solution in this course starts like this:

:::syntax
```cpp
#include <bits/stdc++.h>      // every standard header at once
using namespace std;          // write vector instead of std::vector

int main() {
    ios::sync_with_stdio(false);   // fast I/O (see below)
    cin.tie(nullptr);
    // your code
    return 0;                      // optional in main
}
```
:::

:::def bits/stdc++.h
A GCC header that **includes the entire standard library** in one line. It's standard in competitive programming and accepted in interviews. In real projects, include only what you use (`<vector>`, `<algorithm>` …) because it compiles faster and works on every compiler. Clang on macOS doesn't ship it.
:::

:::warn using namespace std in real code
It's fine for interviews and contests. In header files of real projects it can cause name clashes, so production code writes `std::` explicitly.
:::

## Input and output

`cin >>` reads whitespace-separated values. `cout <<` prints. The two "fast I/O" lines make C++ streams much faster on big inputs.

```cpp run level=easy title="Reading a list and a matrix"
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    cin >> n >> m;                          // dimensions
    vector<vector<int>> grid(n, vector<int>(m));
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++)
            cin >> grid[i][j];

    string name;
    cin >> name;                            // reads one word

    long long total = 0;
    for (auto& row : grid)
        for (int x : row) total += x;
    cout << name << ": " << n << "x" << m << " grid, sum = " << total << '\n';
}
```
```stdin
2 3
1 2 3
4 5 6
matrix
```

:::tip `'\n'` vs `endl`
`endl` prints a newline **and flushes** the output buffer every time. In a loop printing 10⁶ lines that can be 10× slower. Use `'\n'`.
:::

To read a whole line including spaces, use `getline(cin, line)`. After a `cin >> x`, call `cin.ignore()` first, or `getline` reads the leftover newline.

## Integer types and overflow

:::def Overflow
When a computation's true result doesn't fit in its type. For **signed** integers in C++ this is *undefined behaviour*: the program may print garbage, crash, or seem to work and then fail on the judge.
:::

| Type | Size | Range (approx.) | Use for |
|---|---|---|---|
| `int` | 32 bits | $\pm 2.1 \times 10^9$ | indexes, counts, values ≤ 10⁹ |
| `long long` | 64 bits | $\pm 9.2 \times 10^{18}$ | sums, products, anything that might exceed 2·10⁹ |
| `unsigned` / `size_t` | 32 / 64 bits | $0 \ldots$ | bit tricks; `.size()` returns `size_t` |
| `double` | 64 bits | ~15–16 significant digits | geometry, averages (beware rounding) |
| `char` | 8 bits | −128…127 | characters; `c - 'a'` gives 0…25 |

The rule of thumb: **if you add or multiply values that can reach about 10⁵ or more, use `long long`**.

```cpp run level=easy title="Overflow in action"
#include <bits/stdc++.h>
using namespace std;

int main() {
    int a = 100000, b = 100000;
    // long long bad = a * b;   <- int * int overflows BEFORE the assignment (undefined behaviour)
    int wrapped = (int)((unsigned)a * (unsigned)b);   // what 32-bit hardware typically produces
    long long right = 1LL * a * b;                    // promote first, then multiply in 64 bits
    cout << "32-bit result: " << wrapped << "   <- garbage\n";
    cout << "64-bit result: " << right << '\n';
    cout << "INT_MAX = " << INT_MAX << ", LLONG_MAX = " << LLONG_MAX << '\n';
}
```

:::warn The classic bug
`long long x = a * b;` does **not** help if `a` and `b` are `int`. The multiplication happens in `int` and overflows *before* the value is stored. Write `1LL * a * b` or make `a` a `long long`.
:::

A famous example is the midpoint in binary search: `(lo + hi) / 2` overflows when both are near 2·10⁹. Use `lo + (hi - lo) / 2`.

## Division and modulo

C++ integer division **truncates toward zero**, and `%` keeps the sign of the left operand:

```cpp run level=easy title="Division rules you must know"
#include <bits/stdc++.h>
using namespace std;

int main() {
    cout << " 7 / 2 = " <<  7 / 2  << ",   7 % 2 = " <<  7 % 2 << '\n';
    cout << "-7 / 2 = " << -7 / 2  << ",  -7 % 2 = " << -7 % 2 << "   <- negative!\n";

    int m = 5, x = -7;
    int safeMod = ((x % m) + m) % m;            // always in [0, m)
    cout << "safe (-7 mod 5) = " << safeMod << '\n';

    int a = 17, b = 5;
    cout << "ceil(17/5) = " << (a + b - 1) / b << '\n';   // for positive a, b
    cout << "7 / 2.0 = " << 7 / 2.0 << '\n';                // a double operand gives real division
}
```

:::def Modulo arithmetic (for big answers)
When a problem says "return the answer modulo $10^9 + 7$", take `% MOD` after **every** addition and multiplication. Because $(a + b) \bmod m = ((a \bmod m) + (b \bmod m)) \bmod m$, the final result is the same and nothing overflows. More in the Number Theory lesson.
:::

## Functions: value, reference, const reference

How you pass arguments decides whether the computer **copies** them:

:::syntax
```cpp
void byValue(vector<int> v);          // copies the whole vector: O(n) time + memory
void byRef(vector<int>& v);           // no copy; the function CAN modify the caller's vector
void byConstRef(const vector<int>& v);// no copy; the function can only read it
```
:::

```cpp run level=easy title="Copies are slow and changes are lost"
#include <bits/stdc++.h>
using namespace std;

void addOneCopy(vector<int> v) { for (int& x : v) x++; }   // changes a copy
void addOneRef(vector<int>& v)  { for (int& x : v) x++; }   // changes the original

long long sumConst(const vector<int>& v) {                  // read-only and no copy
    long long s = 0;
    for (int x : v) s += x;
    return s;
}

int main() {
    vector<int> a = {1, 2, 3};
    addOneCopy(a);
    cout << "after copy version: " << a[0] << a[1] << a[2] << '\n';
    addOneRef(a);
    cout << "after ref version:  " << a[0] << a[1] << a[2] << '\n';
    cout << "sum = " << sumConst(a) << '\n';
}
```

:::warn Passing big containers by value in recursion
`void dfs(int u, vector<int> visited)` copies `visited` on **every call**. That can turn an O(n) algorithm into O(n²) and blow the memory limit. Pass by reference.
:::

The same applies to range-for loops: `for (auto x : v)` copies each element (fine for `int`, slow for `string` or `vector`). Use `for (const auto& x : v)` to read and `for (auto& x : v)` to modify.

## Modern conveniences

```cpp run level=intermediate title="auto, structured bindings, pairs, initializer lists"
#include <bits/stdc++.h>
using namespace std;

pair<int, int> minMax(const vector<int>& v) {
    return {*min_element(v.begin(), v.end()), *max_element(v.begin(), v.end())};
}

int main() {
    auto nums = vector<int>{5, 2, 9, 1, 7};        // auto deduces vector<int>
    auto [lo, hi] = minMax(nums);                   // structured binding unpacks the pair
    cout << "min " << lo << ", max " << hi << '\n';

    map<string, int> age = {{"ana", 31}, {"bo", 25}};
    for (const auto& [name, a] : age)               // unpack each key/value
        cout << name << " is " << a << '\n';

    const int MOD = 1'000'000'007;                  // ' is a digit separator
    constexpr int N = 1 << 20;                      // compile-time constant: 2^20
    cout << MOD << ' ' << N << '\n';
}
```

## The size_t trap

`v.size()` returns an **unsigned** `size_t`. Unsigned numbers can't be negative, so `0 - 1` wraps around to about $1.8 \times 10^{19}$:

```cpp run level=intermediate title="Why (int)v.size() is a good habit"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v;                                  // empty!
    cout << "v.size() - 1 = " << v.size() - 1 << "   <- not -1\n";

    // BUG: for (size_t i = 0; i < v.size() - 1; i++) would loop ~forever.
    int n = (int)v.size();                          // convert once, then use n
    for (int i = 0; i < n - 1; i++) cout << "never runs\n";
    cout << "safe loop finished\n";
}
```

:::tip Habit
At the top of a function write `int n = nums.size();` and use `n` everywhere. Signed arithmetic behaves the way you expect.
:::

## Problems

:::problem Reverse Integer {level=medium lc=reverse-integer tags="math,overflow"}
Given a signed 32-bit integer `x`, return `x` with its digits reversed. If reversing makes the value go outside the 32-bit range $[-2^{31}, 2^{31}-1]$, return `0`.

Examples: `123 → 321`, `-120 → -21`, `1534236469 → 0` (9646324351 doesn't fit).

:::hint Hint 1
Peel off digits with `x % 10` and `x / 10`. Build the answer as `rev = rev * 10 + digit`. Note that `%` keeps the sign, so negative numbers just work.
:::

:::hint Hint 2
The only danger is `rev * 10 + digit` overflowing. Either do the math in `long long` and check the range at the end, or check **before** multiplying: `rev > INT_MAX / 10` means the next step overflows.
:::

:::solution
Build the reversed number in a 64-bit variable, so the intermediate value can't overflow. Then check whether it fits in 32 bits.

```cpp run
#include <bits/stdc++.h>
using namespace std;

int reverseInt(int x) {
    long long rev = 0;
    while (x != 0) {
        rev = rev * 10 + x % 10;        // x % 10 is negative for negative x: fine
        x /= 10;
    }
    if (rev > INT_MAX || rev < INT_MIN) return 0;
    return (int)rev;
}

int main() {
    for (int x : {123, -120, 0, 1534236469, INT_MIN})
        cout << x << " -> " << reverseInt(x) << '\n';
}
```

:::complexity
Time | O(\log_{10} \lvert x \rvert) | one step per digit, at most 10
Space | O(1) |
:::

**Follow-up:** "What if 64-bit integers aren't allowed?" Check before each step: if `rev > INT_MAX / 10` (or equals it and the digit is `> 7`), the next step would overflow.
:::
:::

:::problem Plus One {level=easy lc=plus-one tags="array,math"}
A large integer is stored as a vector of digits, most significant first: `[1,2,9]` means 129. Return the digits of the number plus one.

Examples: `[1,2,9] → [1,3,0]`, `[9,9] → [1,0,0]`.

:::hint Hint
Add from the back, like on paper. A `9` becomes `0` and the carry continues. If every digit was a 9, you need one extra digit at the front.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> plusOne(vector<int> d) {
    for (int i = (int)d.size() - 1; i >= 0; i--) {
        if (d[i] < 9) { d[i]++; return d; }   // no carry: done
        d[i] = 0;                             // 9 + 1 = 10: write 0, carry on
    }
    d.insert(d.begin(), 1);                   // all digits were 9
    return d;
}

int main() {
    for (auto v : vector<vector<int>>{{1, 2, 9}, {9, 9}, {0}}) {
        for (int x : plusOne(v)) cout << x;
        cout << '\n';
    }
}
```

:::complexity
Time | O(n) | worst case `999…9`; usually stops early
Space | O(1) | O(n) only when a new digit is added
:::
:::
:::

## Check yourself

```quiz
? `int a = 50000, b = 50000; long long c = a * b;` What happens?
- c = 2500000000 correctly
+ The multiplication overflows in int before it's stored
- Compile error
> The type of `a * b` is int. Write `1LL * a * b`.

? What is `-7 % 3` in C++?
- 2
+ -1
- 1
> % keeps the sign of the left operand. Use `((x % m) + m) % m` for a non-negative result.

? Which signature reads a big vector without copying and without letting the function change it?
- void f(vector<int> v)
- void f(vector<int>& v)
+ void f(const vector<int>& v)
> A const reference: no copy, read-only.

? Why can `for (size_t i = 0; i < v.size() - 1; i++)` misbehave?
+ If v is empty, v.size() - 1 wraps around to a huge number
- size_t is too small
- It always skips the last element
> Unsigned subtraction wraps around. Convert to int first.
```

:::keypoints
- Skeleton: `bits/stdc++.h`, `using namespace std`, fast I/O lines, `'\n'` instead of `endl`.
- `int` holds about ±2.1·10⁹. Use `long long` for sums and products, and promote **before** multiplying (`1LL * a * b`).
- Division truncates toward zero, and `%` can be negative: `((x % m) + m) % m`. Ceil division: `(a + b - 1) / b`.
- Pass containers by `const&` (read) or `&` (modify), never by value in hot paths or recursion.
- `.size()` is unsigned. Store it in an `int n` first.
:::
