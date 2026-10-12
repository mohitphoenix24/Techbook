---
title: Interval DP
level: advanced
time: 55
summary: DP over subarrays dp[l][r], filled by increasing length — matrix-chain multiplication (the classic, with its O(n³) recurrence), Burst Balloons (the "last one to burst" trick), Minimum Cost to Cut a Stick, Palindrome Partitioning II, and Predict the Winner as a two-player minimax interval DP.
---

Some problems are about **merging, splitting or removing parts of a sequence**, where the best way to handle a segment depends on how you split it. The state is the segment itself:

$$dp[l][r] = \text{best answer for the subarray (or substring) } [l..r]$$

:::pattern
- **Transition:** try every split point $k$ in $[l, r]$: $dp[l][r] = \min/\max_k \big(dp[l][k] \oplus dp[k+1][r] \oplus \text{cost}(l, k, r)\big)$.
- **Order:** by **increasing length**, so both sub-intervals are already solved. (Or `l` from high to low with `r` from low to high.)
- **Complexity:** $O(n^2)$ states × $O(n)$ split points = $O(n^3)$, so it's fine for $n \le$ ~500.
:::

## Matrix-chain multiplication (the classic)

Multiplying a $p \times q$ matrix by a $q \times r$ matrix costs $pqr$ scalar multiplications. Matrix multiplication is associative, but **the order changes the cost hugely**. With dimensions `d = [10, 30, 5, 60]`: $(AB)C$ costs $10\cdot30\cdot5 + 10\cdot5\cdot60 = 4500$, while $A(BC)$ costs $30\cdot5\cdot60 + 10\cdot30\cdot60 = 27000$.

:::derive Matrix-chain recurrence
\text{matrix } i \text{ has shape } d_{i} \times d_{i+1} || n matrices, n+1 dimensions
dp[i][i] = 0 || a single matrix: nothing to multiply
dp[i][j] = \min_{i \le k < j} \Big( dp[i][k] + dp[k+1][j] + d_i\, d_{k+1}\, d_{j+1} \Big) || the LAST multiplication splits at k
! O(n^3) \text{ time, } O(n^2) \text{ space} || fill by increasing chain length
:::

```cpp run level=intermediate title="Matrix-chain order, with the optimal parenthesization"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<long long> d = {40, 20, 30, 10, 30};        // 4 matrices: 40x20, 20x30, 30x10, 10x30
    int n = d.size() - 1;
    vector<vector<long long>> dp(n, vector<long long>(n, 0));
    vector<vector<int>> split(n, vector<int>(n, 0));
    for (int len = 2; len <= n; len++)                  // by increasing length
        for (int i = 0; i + len - 1 < n; i++) {
            int j = i + len - 1;
            dp[i][j] = LLONG_MAX;
            for (int k = i; k < j; k++) {
                long long cost = dp[i][k] + dp[k + 1][j] + d[i] * d[k + 1] * d[j + 1];
                if (cost < dp[i][j]) { dp[i][j] = cost; split[i][j] = k; }
            }
        }
    function<string(int, int)> paren = [&](int i, int j) -> string {
        if (i == j) return string(1, char('A' + i));
        return "(" + paren(i, split[i][j]) + paren(split[i][j] + 1, j) + ")";
    };
    cout << "min cost " << dp[0][n - 1] << " with order " << paren(0, n - 1) << '\n';
}
```

## Problems

:::problem Burst Balloons {level=hard lc=burst-balloons tags="interval DP"}
Bursting balloon `i` earns `nums[left] * nums[i] * nums[right]`, where left and right are its **current** neighbours (treat the outside as 1). Maximize the total coins.

Example: `[3,1,5,8]` → `167`.

:::hint Hint 1
Choosing which balloon to burst **first** is hard, because the neighbours change. Flip it: choose which balloon in `(l, r)` to burst **last**.
:::

:::hint Hint 2
Add 1s at both ends. If `k` is the last balloon burst strictly between `l` and `r`, then at that moment its neighbours are exactly `l` and `r`. So `dp[l][r] = max over k of dp[l][k] + dp[k][r] + v[l]·v[k]·v[r]`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxCoins(const vector<int>& nums) {
    vector<int> v = {1};
    v.insert(v.end(), nums.begin(), nums.end());
    v.push_back(1);
    int n = v.size();
    vector<vector<int>> dp(n, vector<int>(n, 0));        // dp[l][r]: best for the open interval (l, r)
    for (int len = 2; len < n; len++)
        for (int l = 0; l + len < n; l++) {
            int r = l + len;
            for (int k = l + 1; k < r; k++)              // k = the LAST balloon burst in (l, r)
                dp[l][r] = max(dp[l][r], dp[l][k] + dp[k][r] + v[l] * v[k] * v[r]);
        }
    return dp[0][n - 1];
}

int main() { cout << maxCoins({3, 1, 5, 8}) << ' ' << maxCoins({1, 5}) << '\n'; }
```

:::complexity
Time | O(n^3) |
Space | O(n^2) |
:::

"**Think about the last action instead of the first**" is a powerful reframing whenever a choice changes its neighbours. It makes the two sides independent.
:::
:::

:::problem Minimum Cost to Cut a Stick {level=hard lc=minimum-cost-to-cut-a-stick tags="interval DP"}
A stick of length `n` must be cut at the given positions, in any order. Each cut costs the length of the piece being cut. Minimize the total.

Example: `n=7, cuts=[1,3,4,5]` → `16`.

:::hint Hint
Sort the cuts and add the endpoints 0 and n. `dp[i][j]` = the min cost to make all the cuts strictly between `c[i]` and `c[j]`. Choosing cut `k` first costs `c[j] − c[i]`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minCost(int n, vector<int> cuts) {
    cuts.push_back(0); cuts.push_back(n);
    sort(cuts.begin(), cuts.end());
    int m = cuts.size();
    vector<vector<int>> dp(m, vector<int>(m, 0));
    for (int len = 2; len < m; len++)
        for (int i = 0; i + len < m; i++) {
            int j = i + len;
            dp[i][j] = INT_MAX;
            for (int k = i + 1; k < j; k++)
                dp[i][j] = min(dp[i][j], dp[i][k] + dp[k][j] + cuts[j] - cuts[i]);
        }
    return dp[0][m - 1];
}

int main() { cout << minCost(7, {1, 3, 4, 5}) << ' ' << minCost(9, {5, 6, 1, 4, 2}) << '\n'; }
```

:::complexity
Time | O(c^3) | c = number of cuts
Space | O(c^2) |
:::
:::
:::

:::problem Palindrome Partitioning II {level=hard lc=palindrome-partitioning-ii tags="DP,palindromes"}
Return the minimum number of cuts so that every piece of `s` is a palindrome.

Example: `"aab"` → `1` (`"aa" | "b"`).

:::hint Hint
Precompute `pal[i][j]` with an interval DP. Then `cuts[i]` = the min cuts for `s[0..i]`: it's 0 if the whole prefix is a palindrome, otherwise `min(cuts[j−1] + 1)` over every `j` where `s[j..i]` is a palindrome.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int minCut(const string& s) {
    int n = s.size();
    vector<vector<bool>> pal(n, vector<bool>(n, false));
    vector<int> cuts(n);
    for (int i = 0; i < n; i++) {
        cuts[i] = i;                                          // worst case: cut between every character
        for (int j = 0; j <= i; j++)
            if (s[j] == s[i] && (i - j < 2 || pal[j + 1][i - 1])) {
                pal[j][i] = true;                             // s[j..i] is a palindrome
                cuts[i] = (j == 0) ? 0 : min(cuts[i], cuts[j - 1] + 1);
            }
    }
    return cuts[n - 1];
}

int main() { cout << minCut("aab") << ' ' << minCut("a") << ' ' << minCut("ab") << ' ' << minCut("banana") << '\n'; }
```

:::complexity
Time | O(n^2) |
Space | O(n^2) |
:::
:::
:::

:::problem Predict the Winner {level=medium lc=predict-the-winner tags="interval DP,game theory,minimax"}
Two players take turns removing a number from **either end** of the array, adding it to their score. Both play optimally. Can player 1 win (ties count as a win)?

Example: `[1,5,2]` → `false`; `[1,5,233,7]` → `true`.

:::hint Hint
`dp[l][r]` = the best **score difference** (current player minus opponent) on `nums[l..r]`. Taking the left end gives `nums[l] − dp[l+1][r]`, because the opponent then plays optimally on the rest.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool predictTheWinner(const vector<int>& a) {
    int n = a.size();
    vector<vector<int>> dp(n, vector<int>(n, 0));
    for (int i = 0; i < n; i++) dp[i][i] = a[i];
    for (int len = 2; len <= n; len++)
        for (int l = 0; l + len - 1 < n; l++) {
            int r = l + len - 1;
            dp[l][r] = max(a[l] - dp[l + 1][r], a[r] - dp[l][r - 1]);   // my gain minus the opponent's best difference
        }
    return dp[0][n - 1] >= 0;
}

int main() { cout << boolalpha << predictTheWinner({1, 5, 2}) << ' ' << predictTheWinner({1, 5, 233, 7}) << '\n'; }
```

:::complexity
Time | O(n^2) |
Space | O(n^2) |
:::

Storing the **difference** turns a two-player minimax into a one-line recurrence. The same idea solves Stone Game and many "optimal play" problems. (For Stone Game with an even number of piles, player 1 can always win, by a parity argument!)
:::
:::

## Check yourself

```quiz
? In what order must an interval DP fill its table?
+ By increasing interval length (so shorter sub-intervals are ready)
- Row by row from the top
- Any order
> Every dp[l][r] needs strictly shorter intervals.

? Why choose the LAST balloon to burst in Burst Balloons?
+ Then its neighbours are fixed (the interval boundaries) and the two sides become independent
- Because the last balloon has the most coins
- To get O(n²)
> Choosing the first one leaves the neighbours unknown.

? Typical interval DP complexity for n elements?
+ O(n³)
- O(n log n)
- O(2ⁿ)
> O(n²) intervals × O(n) split points.
```

:::keypoints
- `dp[l][r]` over segments, filled by increasing length; try every split point → usually $O(n^3)$.
- Matrix chain: $dp[i][j] = \min_k dp[i][k] + dp[k+1][j] + d_i d_{k+1} d_{j+1}$.
- "Last action" thinking (burst last, cut first) makes the sub-intervals independent.
- Two-player optimal games: store the score **difference**: `max(a[l] − dp[l+1][r], a[r] − dp[l][r−1])`.
:::
