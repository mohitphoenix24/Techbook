---
title: String DP — LCS, Edit Distance, Palindromes
level: advanced
time: 65
summary: The two-string DP table dp[i][j] over prefixes — Longest Common Subsequence (with table walk-back), Edit Distance and what each neighbouring cell means, palindromic subsequences (LPS = LCS with the reverse), longest palindromic substring by expanding around centres, Distinct Subsequences, and Regular Expression Matching with '.' and '*'.
---

When a problem compares or transforms **two strings** (or one string with itself), the state is almost always:

$$dp[i][j] = \text{answer for the prefixes } A[0..i) \text{ and } B[0..j)$$

and each transition looks at the **last characters**, `A[i−1]` and `B[j−1]`: do they match, and what happens if one of them is dropped?

:::pattern
Each cell depends on its neighbours:
- ↖ `dp[i−1][j−1]`: use both last characters (match / replace)
- ↑ `dp[i−1][j]`: drop the last character of A (delete)
- ← `dp[i][j−1]`: drop the last character of B (insert)

Row 0 and column 0 are the "one string is empty" base cases. Fill row by row. Keep two rows for $O(\min)$ space.
:::

## Longest Common Subsequence

```viz algo=lcs
```

:::derive LCS recurrence
dp[i][0] = dp[0][j] = 0 || an empty string shares nothing
A[i-1] = B[j-1] \Rightarrow dp[i][j] = dp[i-1][j-1] + 1 || matching last characters: use both
A[i-1] \ne B[j-1] \Rightarrow dp[i][j] = \max(dp[i-1][j],\, dp[i][j-1]) || one of the two last characters isn't in the LCS
! O(nm) \text{ time; walk back from } dp[n][m] \text{ to recover the sequence} ||
:::

:::proof Why taking a matching pair is always safe
If $A[i-1] = B[j-1] = c$, take any LCS $Z$ of the two prefixes. If $Z$ doesn't end with this pair of $c$'s, we can change it so it does: whatever $Z$'s last matched pair is, swapping it for $(A[i-1], B[j-1])$, or simply appending the pair if $Z$ uses neither, gives a common subsequence at least as long. So some LCS uses the pair, and $dp[i][j] = dp[i-1][j-1] + 1$.
:::

## Problems

:::problem Longest Common Subsequence {level=medium lc=longest-common-subsequence tags="string DP,2D"}
Return the length of the longest common subsequence of two strings.

Example: `"abcde", "ace"` → `3`.

:::hint Hint
The recurrence above. Two rolling rows are enough for the length alone.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int lcs(const string& a, const string& b, string* seq = nullptr) {
    int n = a.size(), m = b.size();
    vector<vector<int>> dp(n + 1, vector<int>(m + 1, 0));
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++)
            dp[i][j] = a[i - 1] == b[j - 1] ? dp[i - 1][j - 1] + 1 : max(dp[i - 1][j], dp[i][j - 1]);
    if (seq) {                                           // walk back to recover one LCS
        int i = n, j = m;
        while (i && j) {
            if (a[i - 1] == b[j - 1]) { *seq += a[i - 1]; i--; j--; }
            else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
            else j--;
        }
        reverse(seq->begin(), seq->end());
    }
    return dp[n][m];
}

int main() {
    string s;
    cout << lcs("abcde", "ace") << ' ' << lcs("abc", "def") << ' ' << lcs("AGGTAB", "GXTXAYB", &s) << " (" << s << ")\n";
}
```

:::complexity
Time | O(nm) |
Space | O(nm) | O(min(n, m)) if you only need the length
:::
:::
:::

:::problem Edit Distance {level=medium lc=edit-distance tags="string DP,Levenshtein"}
Return the minimum number of insertions, deletions and replacements that turn `word1` into `word2`.

Example: `"horse" → "ros"` = `3`.

:::hint Hint
`dp[i][j]` = the edits to turn `A[0..i)` into `B[0..j)`. If the last characters match, it's free (↖). Otherwise it's 1 + the min of delete (↑), insert (←) and replace (↖).
:::

:::solution
```viz algo=edit-distance
```

```cpp run
#include <bits/stdc++.h>
using namespace std;

int minDistance(const string& a, const string& b) {
    int n = a.size(), m = b.size();
    vector<int> prev(m + 1), cur(m + 1);
    iota(prev.begin(), prev.end(), 0);                  // row 0: insert j characters
    for (int i = 1; i <= n; i++) {
        cur[0] = i;                                      // column 0: delete i characters
        for (int j = 1; j <= m; j++)
            cur[j] = a[i - 1] == b[j - 1] ? prev[j - 1]
                                          : 1 + min({prev[j],        // delete a[i-1]
                                                     cur[j - 1],     // insert b[j-1]
                                                     prev[j - 1]});  // replace
        swap(prev, cur);
    }
    return prev[m];
}

int main() { cout << minDistance("horse", "ros") << ' ' << minDistance("intention", "execution") << ' ' << minDistance("", "abc") << '\n'; }
```

:::complexity
Time | O(nm) |
Space | O(m) |
:::

Edit distance powers spell checkers, DNA alignment (with custom costs) and `diff` tools (see the *Text Diff* project).
:::
:::

:::problem Longest Palindromic Subsequence {level=medium lc=longest-palindromic-subsequence tags="string DP,interval DP"}
Return the length of the longest subsequence of `s` that's a palindrome.

Example: `"bbbab"` → `4` (`"bbbb"`).

:::hint Hint
LPS(s) = LCS(s, reverse(s)). Or use an interval DP: `dp[l][r]` = `dp[l+1][r−1] + 2` if `s[l] == s[r]`, else `max(dp[l+1][r], dp[l][r−1])`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int longestPalindromeSubseq(const string& s) {
    int n = s.size();
    vector<vector<int>> dp(n, vector<int>(n, 0));
    for (int l = n - 1; l >= 0; l--) {                  // l goes down, so dp[l+1][*] is ready
        dp[l][l] = 1;
        for (int r = l + 1; r < n; r++)
            dp[l][r] = s[l] == s[r] ? dp[l + 1][r - 1] + 2 : max(dp[l + 1][r], dp[l][r - 1]);
    }
    return dp[0][n - 1];
}

int main() { cout << longestPalindromeSubseq("bbbab") << ' ' << longestPalindromeSubseq("cbbd") << ' ' << longestPalindromeSubseq("character") << '\n'; }
```

:::complexity
Time | O(n^2) |
Space | O(n^2) | O(n) with rolling rows
:::
:::
:::

:::problem Longest Palindromic Substring {level=medium lc=longest-palindromic-substring tags="strings,expand around center,DP"}
Return the longest **contiguous** palindromic substring.

Example: `"babad"` → `"bab"` (or `"aba"`).

:::hint Hint
Every palindrome has a centre: a character (odd length) or a gap between two characters (even length). Expand outwards from each of the 2n − 1 centres while the ends match.
:::

:::solution
Expanding around centres is $O(n^2)$ time with $O(1)$ space, simpler than the $O(n^2)$-space DP. Manacher's algorithm does it in $O(n)$ (see *String Algorithms*).

```cpp run
#include <bits/stdc++.h>
using namespace std;

string longestPalindrome(const string& s) {
    int bestL = 0, bestLen = 0, n = s.size();
    auto expand = [&](int l, int r) {
        while (l >= 0 && r < n && s[l] == s[r]) { l--; r++; }
        if (r - l - 1 > bestLen) { bestLen = r - l - 1; bestL = l + 1; }
    };
    for (int c = 0; c < n; c++) { expand(c, c); expand(c, c + 1); }   // odd and even centres
    return s.substr(bestL, bestLen);
}

int main() { cout << longestPalindrome("babad") << ' ' << longestPalindrome("cbbd") << ' ' << longestPalindrome("forgeeksskeegfor") << '\n'; }
```

:::complexity
Time | O(n^2) |
Space | O(1) |
:::
:::
:::

:::problem Distinct Subsequences {level=hard lc=distinct-subsequences tags="string DP,counting"}
Count the distinct ways `t` occurs as a subsequence of `s`.

Example: `s="rabbbit", t="rabbit"` → `3`.

:::hint Hint
`dp[i][j]` = the ways to form `t[0..j)` from `s[0..i)`. Either skip `s[i−1]`, or, if `s[i−1] == t[j−1]`, also use it to match `t[j−1]`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int numDistinct(const string& s, const string& t) {
    int m = t.size();
    vector<unsigned long long> dp(m + 1, 0);
    dp[0] = 1;                                      // the empty t can be formed one way
    for (char c : s)
        for (int j = m; j >= 1; j--)                // backwards: use each s-character once per step (0/1 style)
            if (c == t[j - 1]) dp[j] += dp[j - 1];
    return (int)dp[m];
}

int main() { cout << numDistinct("rabbbit", "rabbit") << ' ' << numDistinct("babgbag", "bag") << '\n'; }
```

:::complexity
Time | O(nm) |
Space | O(m) |
:::
:::
:::

:::problem Regular Expression Matching {level=hard lc=regular-expression-matching tags="string DP"}
Implement matching with `.` (any single character) and `*` (zero or more of the **preceding** element). The pattern must match the **whole** string.

Examples: `"aa", "a*"` → `true`; `"ab", ".*"` → `true`; `"mississippi", "mis*is*p*."` → `false`.

:::hint Hint 1
`dp[i][j]` = whether `s[0..i)` matches `p[0..j)`. The difficult case is `p[j−1] == '*'`, which applies to `p[j−2]`.
:::

:::hint Hint 2
For `x*`: either use it **zero** times (`dp[i][j−2]`), or, if `s[i−1]` matches `x`, use it **one more time** (`dp[i−1][j]`: stay on the same pattern position).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool isMatch(const string& s, const string& p) {
    int n = s.size(), m = p.size();
    vector<vector<bool>> dp(n + 1, vector<bool>(m + 1, false));
    dp[0][0] = true;
    for (int j = 2; j <= m; j++) if (p[j - 1] == '*') dp[0][j] = dp[0][j - 2];   // "a*b*" matches ""
    auto same = [&](int i, int j) { return p[j - 1] == '.' || p[j - 1] == s[i - 1]; };
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++) {
            if (p[j - 1] == '*')
                dp[i][j] = dp[i][j - 2]                                  // x* matches nothing
                        || (same(i, j - 1) && dp[i - 1][j]);             // x* eats one more s character
            else
                dp[i][j] = same(i, j) && dp[i - 1][j - 1];
        }
    return dp[n][m];
}

int main() {
    cout << boolalpha;
    for (auto [s, p] : vector<pair<string, string>>{{"aa", "a"}, {"aa", "a*"}, {"ab", ".*"}, {"aab", "c*a*b"}, {"mississippi", "mis*is*p*."}})
        cout << isMatch(s, p) << ' ';
    cout << '\n';
}
```

:::complexity
Time | O(nm) |
Space | O(nm) |
:::
:::
:::

## Check yourself

```quiz
? In Edit Distance, the ↑ neighbour dp[i−1][j] corresponds to…
+ Deleting A[i−1]
- Inserting B[j−1]
- Replacing A[i−1]
> Use A's first i−1 characters to build all of B[0..j).

? The Longest Palindromic SUBSEQUENCE of s equals…
+ LCS(s, reverse(s))
- The longest palindromic substring
- LCS(s, s)
> A palindromic subsequence reads the same in both strings.

? How many centres does expand-around-centre check for a string of length n?
+ 2n − 1
- n
- n²
> n character centres + n − 1 gaps between characters.
```

:::keypoints
- Two strings → `dp[i][j]` over prefixes. Look at the last characters: ↖ match/replace, ↑ delete, ← insert.
- LCS: match +1 diagonally, else the max of up/left. Walk back to reconstruct.
- Edit distance: 0 on a match, else 1 + min(delete, insert, replace). Two rows are enough.
- Palindromes: LPS via an interval DP or LCS with the reverse; substrings by expanding around 2n−1 centres.
- Wildcards and regex: model `*` as "zero more" (skip the pattern element) or "one more" (consume a character, keep the pattern).
:::
