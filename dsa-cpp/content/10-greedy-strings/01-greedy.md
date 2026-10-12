---
title: Greedy Algorithms & How to Prove Them
level: advanced
time: 60
summary: When the locally best choice is globally optimal — the greedy-choice property, the two proof techniques (exchange argument and "greedy stays ahead"), classic counterexamples (coins, 0/1 vs fractional knapsack), and eight problems with proofs: Assign Cookies, Jump Game I & II, Gas Station, Partition Labels, Hand of Straights, Candy and Boats to Save People.
---

A greedy algorithm makes the choice that looks best **right now** and never reconsiders it. When it works, it's usually the simplest and fastest solution. When it doesn't, it's confidently wrong. The difference is **proof**, and interviewers often ask "why does greedy work here?"

:::def Greedy algorithm
An algorithm that builds a solution step by step, at each step taking the option that is best by some **local** rule (largest, earliest-ending, cheapest…), without ever undoing a choice.
:::

:::def Greedy-choice property
Some optimal solution contains the greedy first choice. Together with **optimal substructure** (the rest of the problem is the same kind of problem), this makes greedy optimal.
:::

## When greedy fails

| Problem | Tempting greedy | Counterexample |
|---|---|---|
| Fewest coins, coins `{1, 3, 4}` | always the biggest coin | amount 6: greedy 4+1+1 (3 coins), best 3+3 (2) |
| 0/1 knapsack | best value/weight ratio first | `W=50`, items (w10,v60), (w20,v100), (w30,v120): greedy takes 60+100 = 160, best is 100+120 = 220 |
| Longest path | always the heaviest edge | easy to trap |

**Fractional** knapsack (items can be split) *is* solved by the ratio greedy: fill with the best ratio first, and split the last item. The ability to split is what makes the greedy choice safe.

## Proof technique 1: the exchange argument

:::flow Exchange argument
Take any optimal solution OPT | that differs from the greedy solution G
Find the first difference | where OPT made another choice than G
Swap in G's choice | show OPT' is still valid and no worse
Repeat | OPT turns into G without getting worse, so G is optimal
:::

You've already seen it for interval scheduling (keep the earliest-ending interval) and for MSTs (the cut property).

## Proof technique 2: greedy stays ahead

Show that **after every step**, the greedy solution is at least as good as any other solution after the same number of steps, by some measure (how far it reaches, how many it has done). It then can't finish behind.

:::interview
When you propose a greedy, **test it on a tricky small case first** (try to break it). Then state the proof idea in one sentence: "Exchange argument: swapping any other choice for the earliest-ending one never makes things worse." If you can't find either, consider DP.
:::

## Problems

:::problem Assign Cookies {level=easy lc=assign-cookies tags="greedy,sorting,two pointers"}
Child `i` is content with a cookie of size ≥ `g[i]`. Each child gets at most one cookie. Maximize the number of content children.

:::hint Hint
Sort both lists. Give each child (smallest greed first) the **smallest cookie that satisfies them**.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int findContentChildren(vector<int> g, vector<int> s) {
    sort(g.begin(), g.end()); sort(s.begin(), s.end());
    int child = 0;
    for (int cookie = 0; cookie < (int)s.size() && child < (int)g.size(); cookie++)
        if (s[cookie] >= g[child]) child++;               // smallest cookie that fits this child
    return child;
}

int main() { cout << findContentChildren({1, 2, 3}, {1, 1}) << ' ' << findContentChildren({1, 2}, {1, 2, 3}) << '\n'; }
```

:::complexity
Time | O(n \log n + m \log m) |
Space | O(1) |
:::

**Exchange argument:** if an optimal assignment gives the least greedy child a bigger cookie, swap it for the smallest cookie that still fits. Nobody becomes unhappy, and bigger cookies stay free for greedier children.
:::
:::

:::problem Jump Game {level=medium lc=jump-game tags="greedy"}
`nums[i]` is the maximum jump length from index `i`. Starting at index 0, can you reach the last index?

Example: `[2,3,1,1,4]` → `true`; `[3,2,1,0,4]` → `false`.

:::hint Hint
Track the **farthest** index reachable so far. If you ever stand on an index beyond it, you're stuck.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool canJump(const vector<int>& a) {
    int reach = 0;
    for (int i = 0; i < (int)a.size(); i++) {
        if (i > reach) return false;               // i can't be reached at all
        reach = max(reach, i + a[i]);
    }
    return true;
}

int main() { cout << boolalpha << canJump({2, 3, 1, 1, 4}) << ' ' << canJump({3, 2, 1, 0, 4}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::

**Why:** the set of reachable indexes is always a prefix `[0, reach]`, because if you can reach `j` you can also stop anywhere before it. So one number describes it completely.
:::
:::

:::problem Jump Game II {level=medium lc=jump-game-ii tags="greedy,BFS levels"}
Return the **minimum number of jumps** to reach the last index (it's always reachable).

Example: `[2,3,1,1,4]` → `2`.

:::hint Hint
Think of BFS levels: all indexes reachable with `k` jumps form a contiguous range. The next range ends at the farthest point reachable from the current one.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int jump(const vector<int>& a) {
    int jumps = 0, curEnd = 0, farthest = 0;
    for (int i = 0; i + 1 < (int)a.size(); i++) {
        farthest = max(farthest, i + a[i]);
        if (i == curEnd) {                         // we've used up this jump's range: jump again
            jumps++;
            curEnd = farthest;
        }
    }
    return jumps;
}

int main() { cout << jump({2, 3, 1, 1, 4}) << ' ' << jump({2, 3, 0, 1, 4}) << ' ' << jump({0}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::

**Greedy stays ahead:** after $k$ jumps, `curEnd` is the farthest index **any** strategy can reach with $k$ jumps. By induction, no strategy reaches the end in fewer jumps.
:::
:::

:::problem Gas Station {level=medium lc=gas-station tags="greedy,proof"}
Stations are in a circle. Station `i` has `gas[i]`, and driving to the next one costs `cost[i]`. Return the start index from which you can drive all the way around, or −1. (If an answer exists it's unique.)

Example: `gas=[1,2,3,4,5], cost=[3,4,5,1,2]` → `3`.

:::hint Hint 1
If the total gas < the total cost, it's impossible. Otherwise a solution exists.
:::

:::hint Hint 2
Drive from a candidate start, keeping a running tank. If the tank goes negative at station `i`, **no station between the start and `i`** can be the start either. Restart from `i + 1`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int canCompleteCircuit(const vector<int>& gas, const vector<int>& cost) {
    int total = 0, tank = 0, start = 0;
    for (int i = 0; i < (int)gas.size(); i++) {
        int diff = gas[i] - cost[i];
        total += diff; tank += diff;
        if (tank < 0) { start = i + 1; tank = 0; }   // nothing in [start, i] works
    }
    return total >= 0 ? start : -1;
}

int main() { cout << canCompleteCircuit({1, 2, 3, 4, 5}, {3, 4, 5, 1, 2}) << ' ' << canCompleteCircuit({2, 3, 4}, {3, 4, 3}) << '\n'; }
```

:::proof Both steps of the argument
**Skipping:** suppose we start at $s$ and the tank first goes negative at $i$. Any start $s'$ with $s < s' \le i$ would arrive at $s'$ with an empty tank, which is no better than arriving with the non-negative amount we actually had there. So it would also fail by $i$. All of $[s, i]$ can be skipped.
**Existence:** if the total is ≥ 0, the final start $s$ survives to the end of the array, with tank $T \ge 0$. The skipped prefix had a total deficit $D \le 0$, and $T + D$ = the total ≥ 0. So the tank, $T$, covers the prefix's deficit, and the trip wraps around successfully.
:::

:::complexity
Time | O(n) |
Space | O(1) |
:::
:::
:::

:::problem Partition Labels {level=medium lc=partition-labels tags="greedy,intervals"}
Split the string into as many parts as possible so that each letter appears in **at most one part**. Return the part sizes.

Example: `"ababcbacadefegdehijhklij"` → `[9,7,8]`.

:::hint Hint
Record the last occurrence of each letter. Extend the current part's end to the max last-occurrence of the letters seen so far. When the index reaches that end, close the part.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> partitionLabels(const string& s) {
    array<int, 26> last{};
    for (int i = 0; i < (int)s.size(); i++) last[s[i] - 'a'] = i;
    vector<int> out;
    int start = 0, end = 0;
    for (int i = 0; i < (int)s.size(); i++) {
        end = max(end, last[s[i] - 'a']);          // this part must reach at least here
        if (i == end) { out.push_back(end - start + 1); start = i + 1; }
    }
    return out;
}

int main() { for (int x : partitionLabels("ababcbacadefegdehijhklij")) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(1) |
:::

Closing a part **as early as possible** maximizes the count. Any valid part containing index `start` must extend at least to `end`, so the greedy cut is forced.
:::
:::

:::problem Hand of Straights {level=medium lc=hand-of-straights tags="greedy,ordered map"}
Can the cards be rearranged into groups of `groupSize` **consecutive** values?

Example: `[1,2,3,6,2,3,4,7,8], 3` → `true` (`[1,2,3],[2,3,4],[6,7,8]`).

:::hint Hint
The **smallest** remaining card must start a group, since nothing smaller is left to go before it. Use an ordered map of counts: always take its smallest key and remove one copy each of that key and the next `groupSize − 1` values.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

bool isNStraightHand(const vector<int>& hand, int k) {
    if (hand.size() % k) return false;
    map<int, int> cnt;
    for (int x : hand) cnt[x]++;
    while (!cnt.empty()) {
        int first = cnt.begin()->first;              // the smallest card must start a group
        for (int v = first; v < first + k; v++) {
            auto it = cnt.find(v);
            if (it == cnt.end()) return false;
            if (--it->second == 0) cnt.erase(it);
        }
    }
    return true;
}

int main() { cout << boolalpha << isNStraightHand({1, 2, 3, 6, 2, 3, 4, 7, 8}, 3) << ' ' << isNStraightHand({1, 2, 3, 4, 5}, 4) << '\n'; }
```

:::complexity
Time | O(n \log n) |
Space | O(n) |
:::
:::
:::

:::problem Candy {level=hard lc=candy tags="greedy,two passes"}
Children stand in a line with ratings. Each child gets at least one candy, and a child with a higher rating than a **neighbour** must get more candy than that neighbour. Minimize the total.

Example: `[1,0,2]` → `5` (2,1,2).

:::hint Hint
Two separate constraints: left neighbours and right neighbours. A left-to-right pass satisfies "more than the left neighbour if rated higher", and a right-to-left pass does the same for the right side. At each position, take the max of the two.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int candy(const vector<int>& r) {
    int n = r.size();
    vector<int> c(n, 1);
    for (int i = 1; i < n; i++) if (r[i] > r[i - 1]) c[i] = c[i - 1] + 1;            // left rule
    for (int i = n - 2; i >= 0; i--) if (r[i] > r[i + 1]) c[i] = max(c[i], c[i + 1] + 1);   // right rule
    return accumulate(c.begin(), c.end(), 0);
}

int main() { cout << candy({1, 0, 2}) << ' ' << candy({1, 2, 2}) << ' ' << candy({1, 3, 4, 5, 2}) << '\n'; }
```

:::complexity
Time | O(n) |
Space | O(n) |
:::

**Why it's minimal:** after the first pass, `c[i]` is the length of the increasing run that ends at i, which is a lower bound forced by the left neighbours. The second pass computes the same bound from the right. The max of two lower bounds is still a lower bound, and it satisfies both rules, so it's optimal.
:::
:::

:::problem Boats to Save People {level=medium lc=boats-to-save-people tags="greedy,two pointers"}
Each boat carries at most **two** people, with total weight ≤ `limit`. Return the minimum number of boats.

Example: `people=[3,2,2,1], limit=3` → `3`.

:::hint Hint
Sort. The heaviest person needs a boat anyway. Pair them with the **lightest** person if they fit; otherwise they ride alone.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int numRescueBoats(vector<int> p, int limit) {
    sort(p.begin(), p.end());
    int i = 0, j = p.size() - 1, boats = 0;
    while (i <= j) {
        if (p[i] + p[j] <= limit) i++;    // the lightest rides with the heaviest
        j--;                               // the heaviest always leaves
        boats++;
    }
    return boats;
}

int main() { cout << numRescueBoats({1, 2}, 3) << ' ' << numRescueBoats({3, 2, 2, 1}, 3) << ' ' << numRescueBoats({3, 5, 3, 4}, 5) << '\n'; }
```

:::complexity
Time | O(n \log n) |
Space | O(1) |
:::

**Exchange argument:** if the heaviest person can share a boat with anyone, they can share with the lightest. Swapping partners never breaks another boat, because the lightest person fits wherever the swapped-out person did.
:::
:::

## Check yourself

```quiz
? Why does the value/weight greedy solve FRACTIONAL knapsack but not 0/1 knapsack?
+ Splitting lets you always fill capacity with the best ratio; in 0/1, a high-ratio item can waste space
- Because 0/1 knapsack has more items
- It solves both
> The counterexample: W=50 with weights 10/20/30.

? The core move of an exchange argument is…
+ Turning an optimal solution into the greedy one step by step without making it worse
- Trying all possible exchanges
- Sorting the input
> If OPT can become G without loss, G is optimal.

? In Gas Station, the tank goes negative at i after starting at s. What can we conclude?
+ No start in [s, i] works, so restart at i + 1
- Station i is the answer
- The trip is impossible
> Starting later in the segment only arrives at each station with less fuel.
```

:::keypoints
- Greedy = an irrevocable locally best choice. It's correct only with the greedy-choice property + optimal substructure.
- Prove it with an **exchange argument** or **greedy stays ahead**. Break it with small counterexamples first.
- Classic greedy rules: earliest end (intervals), smallest that fits (cookies, boats), farthest reach (jumps), smallest remaining starts a group (straights).
- Two passes handle two-sided constraints (Candy). If no greedy proof is in sight, use DP.
:::
