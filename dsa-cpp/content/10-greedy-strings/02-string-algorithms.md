---
title: String Algorithms — KMP, Z, Rabin–Karp, Manacher
level: advanced
time: 65
summary: Pattern matching in linear time — the KMP prefix function (with a visualizer and the amortized O(n) proof), the Z-function, Rabin–Karp rolling hashes (and the probability of a collision), Manacher's linear-time palindromes, and five problems: strStr, Repeated Substring Pattern, Longest Happy Prefix, Shortest Palindrome and Longest Duplicate Substring.
---

Naive substring search compares the pattern at every position: $O(nm)$ in the worst case (`"aaaa…ab"` in `"aaaa…a"`). The algorithms here never re-scan characters needlessly, and they find all matches in **$O(n + m)$**. They also answer border, period and palindrome questions that come up in interviews.

## KMP and the prefix function

:::def Border
A **border** of a string is a proper prefix that is also a suffix. `"abab"` has borders `"ab"` and `""`.
:::

:::def Prefix function (π)
`pi[i]` = the length of the longest border of `p[0..i]`. For `"ababaca"`: `[0,0,1,2,3,0,1]`.
:::

When a mismatch happens after matching `k` characters, KMP doesn't restart from scratch. The longest border of the matched part tells it how much is **still matched**: jump to `k = pi[k−1]` and keep going.

```viz algo=kmp
```

:::proof The prefix function is computed in O(m)
In the loop, `k` increases by at most 1 per character (the `k++`). Each fall-back `k = pi[k−1]` strictly **decreases** `k`, and `k` never goes below 0. So the total number of fall-backs across the whole run is at most the total number of increases, which is at most $m$. Total work: $O(m)$. The same argument makes the text scan $O(n)$.
:::

```cpp run level=intermediate title="KMP: prefix function and all matches"
#include <bits/stdc++.h>
using namespace std;

vector<int> prefixFunction(const string& p) {
    vector<int> pi(p.size(), 0);
    for (int i = 1, k = 0; i < (int)p.size(); i++) {
        while (k > 0 && p[i] != p[k]) k = pi[k - 1];     // fall back to a shorter border
        if (p[i] == p[k]) k++;
        pi[i] = k;
    }
    return pi;
}

vector<int> kmpSearch(const string& text, const string& p) {
    vector<int> pi = prefixFunction(p), hits;
    for (int i = 0, k = 0; i < (int)text.size(); i++) {
        while (k > 0 && text[i] != p[k]) k = pi[k - 1];
        if (text[i] == p[k]) k++;
        if (k == (int)p.size()) { hits.push_back(i - k + 1); k = pi[k - 1]; }   // match; keep going for overlaps
    }
    return hits;
}

int main() {
    for (int x : prefixFunction("ababaca")) cout << x << ' ';
    cout << "| matches of \"aba\" in \"abababa\":";
    for (int h : kmpSearch("abababa", "aba")) cout << ' ' << h;
    cout << '\n';
}
```

:::tip The "pattern + # + text" trick
Compute the prefix function of `p + '#' + text` (with a separator that appears in neither). Every position where π equals `|p|` marks a match. One function solves search, border and period problems.
:::

## Z-function

:::def Z-function
`z[i]` = the length of the longest substring starting at `i` that is also a **prefix** of the string. (`z[0]` is usually defined as 0.)
:::

It can also be computed in $O(n)$, by reusing the rightmost match window `[l, r)` found so far. To search, compute `z` of `p + '$' + text`: positions where `z == |p|` are matches.

```cpp run level=advanced title="Z-function in O(n)"
#include <bits/stdc++.h>
using namespace std;

vector<int> zFunction(const string& s) {
    int n = s.size();
    vector<int> z(n, 0);
    for (int i = 1, l = 0, r = 0; i < n; i++) {
        if (i < r) z[i] = min(r - i, z[i - l]);          // reuse what we know inside the window [l, r)
        while (i + z[i] < n && s[z[i]] == s[i + z[i]]) z[i]++;
        if (i + z[i] > r) { l = i; r = i + z[i]; }
    }
    return z;
}

int main() {
    for (int x : zFunction("aabxaab")) cout << x << ' ';
    string p = "ab", t = "abcabdab", s = p + "$" + t;
    auto z = zFunction(s);
    cout << "| \"ab\" occurs at:";
    for (int i = p.size() + 1; i < (int)s.size(); i++) if (z[i] == (int)p.size()) cout << ' ' << i - p.size() - 1;
    cout << '\n';
}
```

## Rabin–Karp: rolling hashes

Treat a string as a number in base $B$ modulo a prime $M$: $h(s) = \sum s_i B^{L-1-i} \bmod M$. Sliding the window by one character updates the hash in $O(1)$:

$$h(s_{i+1..i+L}) = \big(h(s_{i..i+L-1}) - s_i B^{L-1}\big)\cdot B + s_{i+L} \pmod M$$

Comparing hashes takes $O(1)$ instead of $O(L)$. Equal strings always have equal hashes. Different strings **collide** with probability about $\frac{1}{M}$ per comparison (for a random base). With $M \approx 10^9$ and $10^6$ comparisons, that's roughly a 0.1% chance of some collision. Using two moduli (or a 64-bit modulus) makes it negligible, or you can verify each hash match directly.

:::warn Anti-hash tests
With a **fixed** base and the modulus $2^{64}$ (letting `unsigned long long` overflow), specially crafted strings, such as Thue–Morse sequences, always collide. Use a random base and a prime modulus like $2^{61} - 1$.
:::

## Manacher: all palindromes in O(n)

Manacher's algorithm computes, for every centre, the radius of the longest palindrome there, in $O(n)$ total. It reuses a mirror of the rightmost palindrome found so far, the same idea as the Z-function's window. Inserting separators (`#a#b#a#`) handles odd and even lengths together.

```cpp run level=advanced title="Manacher's algorithm"
#include <bits/stdc++.h>
using namespace std;

string longestPalindrome(const string& s) {
    string t = "#";
    for (char c : s) { t += c; t += '#'; }                 // odd and even become the same case
    int n = t.size();
    vector<int> d(n, 0);                                    // d[i] = palindrome radius in t
    for (int i = 0, l = 0, r = -1; i < n; i++) {
        int k = (i > r) ? 1 : min(d[l + r - i], r - i + 1); // mirror inside [l, r]
        while (i - k >= 0 && i + k < n && t[i - k] == t[i + k]) k++;
        d[i] = k--;
        if (i + k > r) { l = i - k; r = i + k; }
    }
    int best = max_element(d.begin(), d.end()) - d.begin();
    int len = d[best] - 1;                                  // the length in the original string
    return s.substr((best - len) / 2, len);
}

int main() { cout << longestPalindrome("babad") << ' ' << longestPalindrome("cbbd") << ' ' << longestPalindrome("forgeeksskeegfor") << '\n'; }
```

## Problems

:::problem Repeated Substring Pattern {level=easy lc=repeated-substring-pattern tags="strings,KMP,period"}
Can `s` be built by repeating one of its substrings several times?

Example: `"abab"` → `true`; `"aba"` → `false`.

:::hint Hint
Let `L = pi[n−1]` (the longest border). The smallest period is `p = n − L`. The string is a repetition exactly when `L > 0` and `n % p == 0`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool repeatedSubstringPattern(const string& s) {
    int n = s.size();
    vector<int> pi(n, 0);
    for (int i = 1, k = 0; i < n; i++) {
        while (k && s[i] != s[k]) k = pi[k - 1];
        if (s[i] == s[k]) k++;
        pi[i] = k;
    }
    int L = pi[n - 1], period = n - L;
    return L > 0 && n % period == 0;
}

int main() { cout << boolalpha << repeatedSubstringPattern("abab") << ' ' << repeatedSubstringPattern("aba") << ' ' << repeatedSubstringPattern("abcabcabcabc") << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::

There's also a cute trick: `s` is a repetition iff `s` occurs inside `(s + s)` with the first and last characters removed.
:::
:::

:::problem Longest Happy Prefix {level=hard lc=longest-happy-prefix tags="strings,prefix function"}
Return the longest proper prefix that is also a suffix (the longest border).

Example: `"level"` → `"l"`; `"ababab"` → `"abab"`.

:::hint Hint
That's exactly `pi[n−1]`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

string longestPrefix(const string& s) {
    int n = s.size();
    vector<int> pi(n, 0);
    for (int i = 1, k = 0; i < n; i++) {
        while (k && s[i] != s[k]) k = pi[k - 1];
        if (s[i] == s[k]) k++;
        pi[i] = k;
    }
    return s.substr(0, pi[n - 1]);
}

int main() { cout << '"' << longestPrefix("level") << "\" \"" << longestPrefix("ababab") << "\" \"" << longestPrefix("abc") << "\"\n"; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::
:::
:::

:::problem Shortest Palindrome {level=hard lc=shortest-palindrome tags="strings,KMP,palindromes"}
Add characters **in front of** `s` to make it the shortest possible palindrome.

Example: `"aacecaaa"` → `"aaacecaaa"`; `"abcd"` → `"dcbabcd"`.

:::hint Hint
Find the longest palindromic **prefix** of `s`. Then reverse the remaining suffix and put it in front. The longest palindromic prefix is the longest border of `s + '#' + reverse(s)`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

string shortestPalindrome(const string& s) {
    string rev(s.rbegin(), s.rend()), t = s + "#" + rev;
    vector<int> pi(t.size(), 0);
    for (int i = 1, k = 0; i < (int)t.size(); i++) {
        while (k && t[i] != t[k]) k = pi[k - 1];
        if (t[i] == t[k]) k++;
        pi[i] = k;
    }
    int palPrefix = pi.back();                       // the longest palindromic prefix of s
    return rev.substr(0, s.size() - palPrefix) + s;
}

int main() { cout << shortestPalindrome("aacecaaa") << ' ' << shortestPalindrome("abcd") << ' ' << shortestPalindrome("") << "|\n"; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::

**Why the border works:** a prefix of `s` that equals a suffix of `reverse(s)` is a prefix that reads the same backwards, which is a palindrome. The `#` stops a border from crossing between the two halves.
:::
:::

:::problem Longest Duplicate Substring {level=hard lc=longest-duplicate-substring tags="binary search,rolling hash"}
Return any longest substring that occurs **at least twice** (the occurrences may overlap), or `""`.

Example: `"banana"` → `"ana"`.

:::hint Hint 1
If a duplicate of length L exists, one of length L − 1 also exists: that's monotone, so **binary-search the length**.
:::

:::hint Hint 2
For a fixed L, hash every window of length L with a rolling hash and look for a repeated hash (then verify the actual strings to rule out collisions). That's $O(n)$ per length, $O(n \log n)$ in total.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
using ull = unsigned long long;

const ull MOD = (1ULL << 61) - 1;
ull mulmod(ull a, ull b) { return (ull)((__uint128_t)a * b % MOD); }

string longestDupSubstring(const string& s) {
    int n = s.size();
    mt19937_64 rng(2024);
    ull B = rng() % (MOD - 1000) + 256;                          // random base: no anti-hash surprises
    vector<ull> pw(n + 1, 1), pre(n + 1, 0);
    for (int i = 0; i < n; i++) { pw[i + 1] = mulmod(pw[i], B); pre[i + 1] = (mulmod(pre[i], B) + (unsigned char)s[i]) % MOD; }
    auto hashOf = [&](int i, int len) { return (pre[i + len] + MOD - mulmod(pre[i], pw[len])) % MOD; };   // s[i..i+len)

    auto findDup = [&](int len) -> int {                          // a start index of a repeated window, or -1
        unordered_map<ull, vector<int>> seen;
        for (int i = 0; i + len <= n; i++) {
            ull h = hashOf(i, len);
            auto it = seen.find(h);
            if (it != seen.end())
                for (int j : it->second) if (s.compare(j, len, s, i, len) == 0) return i;   // verify: no false positives
            seen[h].push_back(i);
        }
        return -1;
    };
    int lo = 0, hi = n - 1, bestStart = 0, bestLen = 0;           // binary search on the length
    while (lo < hi) {
        int mid = lo + (hi - lo + 1) / 2;
        int at = findDup(mid);
        if (at >= 0) { lo = mid; bestStart = at; bestLen = mid; } else hi = mid - 1;
    }
    return s.substr(bestStart, bestLen);
}

int main() { cout << '"' << longestDupSubstring("banana") << "\" \"" << longestDupSubstring("abcd") << "\" \"" << longestDupSubstring("aaaaa") << "\"\n"; }
```

:::complexity
Time | O(n \log n) | expected
Space | O(n) |
:::

A **suffix array + LCP array** solves it deterministically in $O(n \log n)$. A suffix automaton does it in $O(n)$. Both are beyond typical interviews, but worth naming.
:::
:::

## Check yourself

```quiz
? pi[i] in KMP is…
+ The length of the longest proper prefix of p[0..i] that is also its suffix
- The number of matches ending at i
- The index of the next mismatch
> The longest border.

? Why is KMP's inner while loop O(n) in total?
+ k rises by at most 1 per step and every fall-back lowers it, so total fall-backs ≤ total rises
- The while loop runs at most once
- Because the alphabet is small
> Amortized analysis again.

? A string has length n and longest border L. Its smallest period is…
+ n − L
- L
- n / L
> A border of length L means the string shifted by n − L matches itself.
```

:::keypoints
- KMP: prefix function (longest border) + fall-backs, giving $O(n + m)$ search. The `p + '#' + text` trick turns search into a border computation.
- Z-function: longest prefix match at each position, $O(n)$, reusing the `[l, r)` window.
- Rolling hash: $O(1)$ window updates. Use a random base and a large prime modulus, and verify matches if collisions matter.
- Manacher: all palindrome radii in $O(n)$.
- Borders give periods (`n − pi[n−1]`), shortest palindromes and repetition checks. Binary search + hashing finds the longest repeats.
:::
