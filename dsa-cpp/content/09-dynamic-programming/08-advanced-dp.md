---
title: Advanced DP — Trees, State Machines, Bitmasks, Digits
level: advanced
time: 65
summary: DP beyond arrays — DP on trees (returning a tuple of states per node: House Robber III), state-machine DP for buy/sell problems (cooldown, k transactions), bitmask DP over subsets (the O(n²·2ⁿ) Travelling Salesman, Partition to K Equal Sum Subsets), and a gentle introduction to digit DP.
---

The DP mindset stays the same (state, transition, base, order, answer). What changes is **where the states live**: on tree nodes, in a small set of "modes", inside the bits of an integer, or in the digits of a number.

## DP on trees

The state is attached to each **node**, and the transitions come from its **children**. That's a postorder (bottom-up) traversal. Often a node returns **several values**, one for each situation the parent needs to know about.

:::problem House Robber III {level=medium lc=house-robber-iii tags="tree DP"}
Houses form a binary tree. Robbing two **directly linked** houses (parent and child) alerts the police. Maximize the loot.

Example: `[3,2,3,null,3,null,1]` → `7` (3 + 3 + 1).

:::hint Hint
Each node returns a pair: (best if this node is **robbed**, best if it's **not robbed**). If robbed, its children must not be. If not, each child picks its own better option.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;
struct TreeNode { int val; TreeNode *left, *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };
const int N = INT_MIN;
TreeNode* build(const vector<int>& v) { if (v.empty() || v[0] == N) return nullptr; TreeNode* r = new TreeNode(v[0]); queue<TreeNode*> q; q.push(r); for (size_t i = 1; i < v.size(); i += 2) { TreeNode* c = q.front(); q.pop(); if (v[i] != N) q.push(c->left = new TreeNode(v[i])); if (i + 1 < v.size() && v[i + 1] != N) q.push(c->right = new TreeNode(v[i + 1])); } return r; }

pair<int, int> dfs(TreeNode* t) {                       // {rob this node, skip this node}
    if (!t) return {0, 0};
    auto [lRob, lSkip] = dfs(t->left);
    auto [rRob, rSkip] = dfs(t->right);
    int rob = t->val + lSkip + rSkip;                    // children must be skipped
    int skip = max(lRob, lSkip) + max(rRob, rSkip);      // children are free to choose
    return {rob, skip};
}
int rob(TreeNode* root) { auto [a, b] = dfs(root); return max(a, b); }

int main() { cout << rob(build({3, 2, 3, N, 3, N, 1})) << ' ' << rob(build({3, 4, 5, 1, 3, N, 1})) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(h) |
:::

The same "return a small tuple of states" approach solves Binary Tree Cameras, maximum independent set on trees, tree diameter with weights, and many more.
:::
:::

## State-machine DP

When each step can be in one of a few **modes** (holding a stock or not, in cooldown or not, k transactions left), make the mode part of the state and draw the transitions between modes.

:::flow Stock with cooldown: states per day
hold | own a share (bought earlier, or buy today)
sold | sold today, so tomorrow is a cooldown day
rest | own nothing, free to buy tomorrow
:::

:::problem Best Time to Buy and Sell Stock with Cooldown {level=medium lc=best-time-to-buy-and-sell-stock-with-cooldown tags="state machine DP"}
Unlimited transactions, but after you sell you must wait one day before buying again. Maximize the profit.

Example: `[1,2,3,0,2]` → `3` (buy, sell, cooldown, buy, sell).

:::hint Hint
Three states per day: `hold`, `sold`, `rest`. hold = max(hold, rest − price); sold = hold + price; rest = max(rest, sold). Update them from **yesterday's** values.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxProfit(const vector<int>& prices) {
    int hold = INT_MIN / 2, sold = 0, rest = 0;            // yesterday's best in each state
    for (int p : prices) {
        int newHold = max(hold, rest - p);                   // keep holding, or buy (only from rest)
        int newSold = hold + p;                              // sell what we hold
        int newRest = max(rest, sold);                       // stay out, or finish a cooldown
        hold = newHold; sold = newSold; rest = newRest;
    }
    return max(sold, rest);
}

int main() { cout << maxProfit({1, 2, 3, 0, 2}) << ' ' << maxProfit({1}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Best Time to Buy and Sell Stock IV {level=hard lc=best-time-to-buy-and-sell-stock-iv tags="state machine DP"}
At most `k` transactions (a buy plus a sell each). Maximize the profit.

Example: `k=2, [3,2,6,5,0,3]` → `7`.

:::hint Hint
`buy[j]` = the best balance after the j-th buy and `sell[j]` = the best balance after the j-th sell. For each price, update j = 1..k: `buy[j] = max(buy[j], sell[j−1] − p)`, `sell[j] = max(sell[j], buy[j] + p)`. If `k ≥ n/2` the limit doesn't matter: take every rise.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int maxProfit(int k, const vector<int>& prices) {
    int n = prices.size();
    if (2 * k >= n) {                                    // effectively unlimited
        int s = 0;
        for (int i = 1; i < n; i++) s += max(0, prices[i] - prices[i - 1]);
        return s;
    }
    vector<int> buy(k + 1, INT_MIN / 2), sell(k + 1, 0);
    for (int p : prices)
        for (int j = 1; j <= k; j++) {
            buy[j] = max(buy[j], sell[j - 1] - p);       // the j-th buy happens after the (j−1)-th sell
            sell[j] = max(sell[j], buy[j] + p);
        }
    return sell[k];
}

int main() { cout << maxProfit(2, {2, 4, 1}) << ' ' << maxProfit(2, {3, 2, 6, 5, 0, 3}) << ' ' << maxProfit(1, {7, 1, 5, 3, 6, 4}) << '\n'; }
```

:::complexity
Time | O(nk) |
Space | O(k) |
:::

The whole stock family (I, II, III, IV, cooldown, transaction fee) is one state machine with different constraints. Draw the states before you code.
:::
:::

## Bitmask DP

When $n \le$ ~20 and the state is "**which subset has been used**", encode the subset as the bits of an integer: `dp[mask]` or `dp[mask][last]`. There are $2^n$ masks, so $2^{20} \approx 10^6$ states is fine.

:::problem Travelling Salesman (shortest Hamiltonian cycle) {level=hard id=travelling-salesman tags="bitmask DP,classic"}
Given an `n × n` distance matrix (n ≤ 16), find the shortest tour that starts at city 0, visits **every** city exactly once and returns to 0. (A classic, not on LeetCode. *Find the Shortest Superstring* and *Shortest Path Visiting All Nodes* use the same DP.)

:::hint Hint
`dp[mask][j]` = the shortest path that starts at 0, visits exactly the cities in `mask`, and ends at `j`. Extend it by going from `j` to an unvisited city `k`. This is the **Held–Karp** algorithm.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<vector<int>> d = {{0, 10, 15, 20, 7}, {10, 0, 35, 25, 14}, {15, 35, 0, 30, 9}, {20, 25, 30, 0, 18}, {7, 14, 9, 18, 0}};
    int n = d.size(), FULL = 1 << n;
    const int INF = 1e9;
    vector<vector<int>> dp(FULL, vector<int>(n, INF));
    dp[1][0] = 0;                                          // only city 0 visited, standing at 0
    for (int mask = 1; mask < FULL; mask++)
        for (int j = 0; j < n; j++) {
            if (dp[mask][j] == INF || !(mask >> j & 1)) continue;
            for (int k = 0; k < n; k++) {
                if (mask >> k & 1) continue;               // already visited
                int nm = mask | 1 << k;
                dp[nm][k] = min(dp[nm][k], dp[mask][j] + d[j][k]);
            }
        }
    int best = INF;
    for (int j = 1; j < n; j++) best = min(best, dp[FULL - 1][j] + d[j][0]);   // close the cycle
    cout << "shortest tour = " << best << '\n';

    vector<int> perm(n - 1); iota(perm.begin(), perm.end(), 1);           // brute-force check: (n-1)! tours
    int brute = INF;
    do {
        int cost = d[0][perm[0]] + d[perm.back()][0];
        for (int i = 0; i + 1 < (int)perm.size(); i++) cost += d[perm[i]][perm[i + 1]];
        brute = min(brute, cost);
    } while (next_permutation(perm.begin(), perm.end()));
    cout << "brute force   = " << brute << '\n';
}
```

:::complexity
Time | O(n^2 \cdot 2^n) | n = 16: about 1.7·10⁷, versus 15! ≈ 1.3·10¹² tours
Space | O(n \cdot 2^n) |
:::

TSP is NP-hard, so exponential time is expected. Bitmask DP turns $n!$ into $n^2 2^n$, which is the difference between impossible and instant for $n = 16$.
:::
:::

:::problem Partition to K Equal Sum Subsets {level=medium lc=partition-to-k-equal-sum-subsets tags="bitmask DP,backtracking"}
Can the array be split into `k` non-empty subsets with equal sums? (n ≤ 16)

Example: `[4,3,2,3,5,2,1], k=4` → `true`.

:::hint Hint
`dp[mask]` = the sum of the **current, partially filled** bucket after using exactly the elements in `mask` (or −1 if that state is unreachable). Add element i only if it doesn't overflow the target. A bucket that hits the target wraps around to 0.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool canPartitionKSubsets(vector<int> a, int k) {
    int total = accumulate(a.begin(), a.end(), 0);
    if (total % k) return false;
    int target = total / k, n = a.size();
    sort(a.begin(), a.end());
    if (a.back() > target) return false;
    vector<int> dp(1 << n, -1);
    dp[0] = 0;
    for (int mask = 0; mask < (1 << n); mask++) {
        if (dp[mask] < 0) continue;
        for (int i = 0; i < n; i++) {
            if (mask >> i & 1) continue;
            if (dp[mask] + a[i] > target) break;          // sorted: larger elements overflow too
            dp[mask | 1 << i] = (dp[mask] + a[i]) % target; // a full bucket wraps to 0
        }
    }
    return dp[(1 << n) - 1] == 0;
}

int main() { cout << boolalpha << canPartitionKSubsets({4, 3, 2, 3, 5, 2, 1}, 4) << ' ' << canPartitionKSubsets({1, 2, 3, 4}, 3) << '\n'; }
```

:::complexity
Time | O(n \cdot 2^n) |
Space | O(2^n) |
:::

Why does one number per mask suffice? The elements in `mask` already fill some number of complete buckets, plus a partial one, and the partial bucket's sum is just `sum(mask) mod target`. All that matters for the future is which elements are left.
:::
:::

## Digit DP (a glimpse)

"Count the integers in `[0, N]` whose digits satisfy some property" is solved digit by digit from the left, with the state **(position, tight, extra info)**. `tight` records whether the digits so far equal N's prefix (which limits the next digit). The number of states is about $(\#\text{digits}) \times 2 \times (\text{extra})$, so it's tiny.

```cpp run level=advanced title="Digit DP: count numbers in [1, N] with no two equal adjacent digits"
#include <bits/stdc++.h>
using namespace std;

string S;
long long memo[20][11][2][2];                        // pos, previous digit (10 = none), tight, started
bool seen[20][11][2][2];

long long go(int pos, int prev, bool tight, bool started) {
    if (pos == (int)S.size()) return started;        // count only real (non-empty) numbers
    long long& res = memo[pos][prev][tight][started];
    if (seen[pos][prev][tight][started]) return res;
    seen[pos][prev][tight][started] = true;
    res = 0;
    int limit = tight ? S[pos] - '0' : 9;
    for (int d = 0; d <= limit; d++) {
        if (started && d == prev) continue;          // the property: adjacent digits differ
        bool nowStarted = started || d != 0;
        res += go(pos + 1, nowStarted ? d : 10, tight && d == limit, nowStarted);
    }
    return res;
}

long long countUpTo(long long N) {
    S = to_string(N);
    memset(seen, 0, sizeof seen);
    return go(0, 10, true, false);
}

int main() {
    long long N = 1000;
    int brute = 0;
    for (int x = 1; x <= N; x++) { string t = to_string(x); bool ok = true; for (size_t i = 1; i < t.size(); i++) ok &= t[i] != t[i - 1]; brute += ok; }
    cout << "digit DP: " << countUpTo(N) << ", brute force: " << brute << ", up to 10^18: " << countUpTo(1'000'000'000'000'000'000LL) << '\n';
}
```

## Check yourself

```quiz
? In House Robber III, each node returns…
+ Two values: the best if it's robbed and the best if it's skipped
- One value: the best total
- The height of the subtree
> The parent needs both to respect the adjacency rule.

? Bitmask DP for TSP on n cities runs in…
+ O(n²·2ⁿ)
- O(n!)
- O(n³)
> 2ⁿ masks × n endpoints × n next cities.

? In the cooldown stock problem, why can't you buy directly from the "sold" state?
+ The day after selling is a mandatory cooldown, so buying must start from "rest"
- Because sold has zero profit
- Because the price is unknown
> The transitions encode the rules of the problem.
```

:::keypoints
- **Tree DP:** postorder; each node returns a small tuple of states (rob/skip, covered/not).
- **State machine:** add the "mode" to the state (hold/sold/rest, transactions left). Update from the previous step's values.
- **Bitmask DP:** `dp[mask]` or `dp[mask][last]` for n ≤ 20. TSP in $O(n^2 2^n)$ instead of $n!$.
- **Digit DP:** (position, tight, extra) states to count numbers ≤ N with a digit property.
:::
