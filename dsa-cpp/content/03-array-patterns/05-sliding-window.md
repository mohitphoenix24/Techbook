---
title: Sliding Window
level: intermediate
time: 60
summary: Maintain a contiguous window [L, R] and update it incrementally instead of recomputing — the fixed-size and variable-size templates, why it's O(n) (amortized), when it fails (negative numbers), the "exactly k = atMost(k) − atMost(k−1)" trick, and seven classic problems up to Minimum Window Substring.
---

Whenever a problem says **"contiguous subarray"** or **"substring"** and asks for the longest, shortest, or a count with some property, think *sliding window*. Instead of checking all $O(n^2)$ windows, you slide one window across the array in $O(n)$.

:::def Sliding window
A contiguous range `[L, R]` that you keep updated as you move through the data. Moving `R` right **adds** an element and moving `L` right **removes** one. The window's summary (sum, counts, distinct letters…) is updated in $O(1)$ per move instead of being recomputed.
:::

## Fixed-size windows

The window always has size `k`. Add the element entering on the right, remove the one leaving on the left.

:::syntax
```cpp
long long sum = 0;
for (int R = 0; R < n; R++) {
    sum += a[R];                          // enter
    if (R >= k) sum -= a[R - k];          // leave (the window is a[R-k+1 .. R])
    if (R >= k - 1) best = max(best, sum);
}
```
:::

## Variable-size windows

The window grows with `R`, and shrinks from `L` **while it's invalid** (or while it's still valid, for "shortest" problems):

:::syntax
```cpp
// LONGEST valid window
int L = 0;
for (int R = 0; R < n; R++) {
    add(a[R]);
    while (!valid()) remove(a[L++]);      // shrink until valid again
    best = max(best, R - L + 1);
}

// SHORTEST valid window
int L = 0;
for (int R = 0; R < n; R++) {
    add(a[R]);
    while (valid()) {                     // shrink while still valid, recording each candidate
        best = min(best, R - L + 1);
        remove(a[L++]);
    }
}
```
:::

Watch a variable window find the longest substring without repeated characters:

```viz algo=sliding-window
```

:::proof Why sliding window is O(n)
`R` moves from 0 to n−1: $n$ steps. `L` only ever moves right, and never past `R`, so across the **whole run** it moves at most $n$ steps. Each move does $O(1)$ work (for hash-map counts, $O(1)$ average). Total: $O(n)$, even though there's a `while` inside a `for`.
:::

## When does it work?

Sliding window needs **monotonicity**: if a window is valid, every smaller window inside it must be valid too (for "longest" problems). Equivalently, extending an invalid window never makes it valid.

:::warn Negative numbers break "sum ≥ k" windows
With all positive numbers, growing a window increases its sum, so "shrink while the sum is too big" is correct. With negatives, a bigger window can have a **smaller** sum, monotonicity fails, and the method gives wrong answers. Use **prefix sums + hash map** (exact sum), or a monotonic deque over prefix sums (shortest subarray with sum ≥ k).
:::

## Counting windows: the "at most" trick

"How many subarrays have **exactly** k distinct values?" isn't monotone. But "**at most** k" is:

$$\text{exactly}(k) = \text{atMost}(k) - \text{atMost}(k-1)$$

And for "at most", every valid window `[L, R]` contributes `R - L + 1` subarrays ending at `R` (all its suffixes are valid too).

## Problems

:::problem Maximum Average Subarray I {level=easy lc=maximum-average-subarray-i tags="sliding window,fixed size"}
Find the contiguous subarray of length `k` with the maximum average.

Example: `[1,12,-5,-6,50,3], k=4` → `12.75`.

:::hint Hint
Fixed window: maximise the sum, then divide by k at the end.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

double findMaxAverage(const vector<int>& a, int k) {
    long long sum = 0, best = LLONG_MIN;
    for (int R = 0; R < (int)a.size(); R++) {
        sum += a[R];
        if (R >= k) sum -= a[R - k];
        if (R >= k - 1) best = max(best, sum);
    }
    return (double)best / k;
}

int main() { cout << findMaxAverage({1, 12, -5, -6, 50, 3}, 4) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Longest Substring Without Repeating Characters {level=medium lc=longest-substring-without-repeating-characters tags="sliding window,hash map"}
Return the length of the longest substring with no repeated characters.

Example: `"abcabcbb"` → `3` (`"abc"`); `"pwwkew"` → `3` (`"wke"`).

:::hint Hint 1
A variable window where "valid" means all characters are distinct. When `s[R]` is already in the window, move `L`.
:::

:::hint Hint 2
Remember the last index of each character. You can jump `L` straight past the previous occurrence instead of moving it one step at a time.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int lengthOfLongestSubstring(const string& s) {
    vector<int> last(256, -1);                    // last index of each byte
    int best = 0, L = 0;
    for (int R = 0; R < (int)s.size(); R++) {
        unsigned char c = s[R];
        if (last[c] >= L) L = last[c] + 1;        // repeat inside the window: jump past it
        last[c] = R;
        best = max(best, R - L + 1);
    }
    return best;
}

int main() {
    for (string s : {"abcabcbb", "bbbbb", "pwwkew", "", "abba"}) cout << '"' << s << "\" -> " << lengthOfLongestSubstring(s) << '\n';
}
```

:::complexity
Time | O(n) |
Space | O(\Sigma) | Σ = alphabet size (256 here)
:::

`"abba"` catches a common bug: when you reach the last `a`, its previous index (0) is **before** `L` (2). Without the `last[c] >= L` check, `L` would jump backwards.
:::
:::

:::problem Minimum Size Subarray Sum {level=medium lc=minimum-size-subarray-sum tags="sliding window,positive numbers"}
Given **positive** integers and `target`, return the minimal length of a contiguous subarray with sum **≥ target**, or 0 if there is none.

Example: `target=7, [2,3,1,2,4,3]` → `2` (`[4,3]`).

:::hint Hint
"Shortest valid window": grow with R, then shrink from L while the sum is still ≥ target, recording each candidate length.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minSubArrayLen(int target, const vector<int>& a) {
    int L = 0, best = INT_MAX;
    long long sum = 0;
    for (int R = 0; R < (int)a.size(); R++) {
        sum += a[R];
        while (sum >= target) {
            best = min(best, R - L + 1);
            sum -= a[L++];
        }
    }
    return best == INT_MAX ? 0 : best;
}

int main() { cout << minSubArrayLen(7, {2, 3, 1, 2, 4, 3}) << ' ' << minSubArrayLen(4, {1, 4, 4}) << ' ' << minSubArrayLen(11, {1, 1, 1, 1}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::

The **positive** values are what make this correct (monotonicity). With negatives you'd need prefix sums + a monotonic deque (LeetCode 862).
:::
:::

:::problem Longest Repeating Character Replacement {level=medium lc=longest-repeating-character-replacement tags="sliding window,counting"}
You may replace at most `k` characters. Return the length of the longest substring that can be made of **one repeated letter** (uppercase A–Z).

Example: `"AABABBA", k=1` → `4`.

:::hint Hint 1
A window can be made uniform if `(window length) − (count of its most frequent letter) ≤ k`.
:::

:::hint Hint 2
You don't have to decrease `maxCount` when shrinking. The answer only improves when `maxCount` grows, so a stale (too high) value never produces a wrong larger answer.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int characterReplacement(const string& s, int k) {
    int cnt[26] = {0}, L = 0, maxCount = 0, best = 0;
    for (int R = 0; R < (int)s.size(); R++) {
        maxCount = max(maxCount, ++cnt[s[R] - 'A']);
        while ((R - L + 1) - maxCount > k) cnt[s[L++] - 'A']--;   // too many replacements: shrink
        best = max(best, R - L + 1);
    }
    return best;
}

int main() { cout << characterReplacement("ABAB", 2) << ' ' << characterReplacement("AABABBA", 1) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) | 26 counters
:::
:::
:::

:::problem Permutation in String {level=medium lc=permutation-in-string tags="sliding window,fixed size,counting"}
Return whether `s2` contains a permutation of `s1` as a substring.

Example: `s1="ab", s2="eidbaooo"` → `true` (`"ba"`).

:::hint Hint
A fixed window of size `|s1|` over `s2`. Compare letter counts. Track how many of the 26 letters currently match, so each slide costs O(1).
:::

:::solution
`matches` counts the letters whose window count equals their count in `s1`. A slide changes only two letters, so update `matches` for those two.

```cpp run
#include <bits/stdc++.h>
using namespace std;

bool checkInclusion(const string& s1, const string& s2) {
    int n = s1.size(), m = s2.size();
    if (n > m) return false;
    array<int, 26> need{}, win{};
    for (char c : s1) need[c - 'a']++;
    int matches = 0;
    auto update = [&](int c, int delta) {
        if (win[c] == need[c]) matches--;
        win[c] += delta;
        if (win[c] == need[c]) matches++;
    };
    for (int c = 0; c < 26; c++) if (win[c] == need[c]) matches++;   // letters absent from both
    for (int R = 0; R < m; R++) {
        update(s2[R] - 'a', +1);
        if (R >= n) update(s2[R - n] - 'a', -1);
        if (matches == 26) return true;
    }
    return false;
}

int main() { cout << boolalpha << checkInclusion("ab", "eidbaooo") << ' ' << checkInclusion("ab", "eidboaoo") << '\n'; }
```

:::complexity
Time | O(n + m) |
Space | O(1) |
:::

The same code with "collect every start index" solves **Find All Anagrams in a String** (LeetCode 438).
:::
:::

:::problem Minimum Window Substring {level=hard lc=minimum-window-substring tags="sliding window,hash map"}
Return the shortest substring of `s` that contains every character of `t` (including duplicates), or `""`.

Example: `s="ADOBECODEBANC", t="ABC"` → `"BANC"`.

:::hint Hint 1
"Shortest valid window". Valid means: for each character, the window count ≥ its count in `t`.
:::

:::hint Hint 2
Keep `missing` = how many characters of `t` (with multiplicity) the window still lacks. The window is valid when `missing == 0`. Update it in O(1) per move.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

string minWindow(const string& s, const string& t) {
    vector<int> need(128, 0);
    for (char c : t) need[c]++;
    int missing = t.size(), L = 0, bestL = 0, bestLen = INT_MAX;
    for (int R = 0; R < (int)s.size(); R++) {
        if (need[s[R]]-- > 0) missing--;            // this char was still needed
        while (missing == 0) {                      // valid: try to shrink
            if (R - L + 1 < bestLen) { bestLen = R - L + 1; bestL = L; }
            if (++need[s[L]] > 0) missing++;        // we just dropped a needed char
            L++;
        }
    }
    return bestLen == INT_MAX ? "" : s.substr(bestL, bestLen);
}

int main() {
    cout << '"' << minWindow("ADOBECODEBANC", "ABC") << "\" \"" << minWindow("a", "a") << "\" \"" << minWindow("a", "aa") << "\"\n";
}
```

The trick: `need[c]` can go **negative**, meaning the window has more `c` than required. Only when it rises back above 0 did we lose a required character.

:::complexity
Time | O(\lvert s \rvert + \lvert t \rvert) |
Space | O(\Sigma) |
:::
:::
:::

:::problem Subarrays with K Different Integers {level=hard lc=subarrays-with-k-different-integers tags="sliding window,at most trick"}
Count the subarrays that contain **exactly** `k` distinct integers.

Example: `[1,2,1,2,3], k=2` → `7`.

:::hint Hint
"Exactly k" isn't monotone, but "at most k" is. Count `atMost(k) − atMost(k−1)`. In `atMost`, each valid window `[L, R]` adds `R − L + 1` subarrays.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

long long atMost(const vector<int>& a, int k) {
    unordered_map<int, int> cnt;
    long long total = 0;
    int L = 0;
    for (int R = 0; R < (int)a.size(); R++) {
        if (cnt[a[R]]++ == 0) k--;                 // a new distinct value
        while (k < 0) if (--cnt[a[L++]] == 0) k++;
        total += R - L + 1;                         // every subarray ending at R that starts in [L, R]
    }
    return total;
}

int subarraysWithKDistinct(const vector<int>& a, int k) { return atMost(a, k) - atMost(a, k - 1); }

int main() { cout << subarraysWithKDistinct({1, 2, 1, 2, 3}, 2) << ' ' << subarraysWithKDistinct({1, 2, 1, 3, 4}, 3) << '\n'; }
```

:::complexity
Time | O(n) | two linear passes
Space | O(n) |
:::
:::
:::

## Check yourself

```quiz
? Why is a sliding window with an inner while loop still O(n)?
+ L only moves forward and never passes R, so it moves at most n times in total
- The while loop runs at most once per iteration
- Because of hashing
> Count total pointer movement, not per-iteration movement.

? Which problem can NOT be solved with a plain sliding window?
- Longest substring with at most 2 distinct characters
+ Count subarrays with sum exactly k when values can be negative
- Minimum size subarray with sum ≥ target (positive values)
> Negatives break monotonicity. Use prefix sums + a hash map.

? How do you count subarrays with exactly k distinct values?
+ atMost(k) − atMost(k − 1)
- atMost(k) + atMost(k − 1)
- A single window that keeps exactly k
> "At most" is monotone and countable with R − L + 1.
```

:::keypoints
- Contiguous + longest/shortest/count → try a sliding window. Total pointer movement ≤ 2n, so it's $O(n)$.
- Fixed window: add `a[R]`, remove `a[R−k]`. Variable: grow with R, shrink with L while invalid (longest) or while valid (shortest).
- It requires monotonicity. Negative numbers usually break it (switch to prefix sums).
- Track counts with arrays or maps plus a "matches"/"missing" counter so each move is $O(1)$.
- Exactly k = atMost(k) − atMost(k−1); each window `[L, R]` contributes `R − L + 1` subarrays.
:::
