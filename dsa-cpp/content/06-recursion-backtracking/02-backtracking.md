---
title: Backtracking — Subsets, Permutations, Combinations
level: intermediate
time: 60
summary: The choose → explore → un-choose template and the state-space tree it walks, how to count its cost (n·2ⁿ, n·n!, C(n,k)), the "sort and skip equal siblings" rule for duplicates, the start-index vs used-array distinction, and pruning — through seven essential problems.
---

Backtracking is **organised brute force**: build a solution one choice at a time, and as soon as a partial solution can't lead anywhere (or once it's complete), undo the last choice and try the next one. It generates every subset, permutation and combination, and it solves constraint puzzles.

:::def Backtracking
A depth-first search over a tree of **partial solutions** (the *state-space tree*). At each node you **choose** an option, **explore** recursively, then **un-choose** it (restore the state) before trying the next option.
:::

## The template

:::syntax
```cpp
void backtrack(State& state, ...) {
    if (isComplete(state)) { record(state); return; }
    for (auto choice : choicesFrom(state)) {
        if (!isValid(state, choice)) continue;   // pruning
        apply(state, choice);                     // 1. choose
        backtrack(state, ...);                    // 2. explore
        undo(state, choice);                      // 3. un-choose (backtrack)
    }
}
```
:::

:::warn The most common backtracking bug
Forgetting to **undo** (the `pop_back()`, `used[i] = false`, `board[r][c] = '.'`). The state then "leaks" into sibling branches. A useful habit: write the undo line straight after the choose line, then put the recursive call between them.
:::

## The state-space tree of subsets

Each element is either **in** or **out**: a binary decision at each level, $2^n$ leaves.

```viz algo=subsets
```

## Counting the cost

The running time is roughly **(number of nodes in the tree) × (work per node)**.

| Problem | Leaves | Cost per leaf | Total |
|---|---|---|---|
| all subsets of $n$ | $2^n$ | $O(n)$ to copy | $O(n \cdot 2^n)$ |
| all permutations of $n$ | $n!$ | $O(n)$ | $O(n \cdot n!)$ |
| all $k$-combinations of $n$ | $\binom nk$ | $O(k)$ | $O(k \binom nk)$ |

:::derive Why the permutation tree has about e·n! nodes (not much more than n!)
\text{level } d \text{ has } n(n-1)\cdots(n-d+1) = \frac{n!}{(n-d)!} \text{ nodes} || d choices made
\text{total} = \sum_{d=0}^{n} \frac{n!}{(n-d)!} = n! \sum_{j=0}^{n} \frac{1}{j!} || substitute j = n − d
< n! \cdot e || since Σ 1/j! = e ≈ 2.718
! \text{nodes} = \Theta(n!) \Rightarrow \text{time } O(n \cdot n!) ||
:::

With $n = 10$: $10! \approx 3.6 \cdot 10^6$, fine. With $n = 12$: $4.8 \cdot 10^8$, too slow. That matches the constraints table in the Big-O lesson.

## Two ways to avoid re-using elements

| Kind of problem | Mechanism | Why |
|---|---|---|
| **Subsets / combinations** (order doesn't matter) | a `start` index: only choose from `i ≥ start` | `{1,2}` and `{2,1}` are the same set, so only generate increasing index order |
| **Permutations** (order matters) | a `used[]` array: any unused element can go next | every ordering is distinct |

## Handling duplicate inputs

If the input contains duplicates (`[1,2,2]`), the plain template produces duplicate outputs. Fix: **sort the input**, then **skip a choice equal to the previous sibling choice at the same level**:

```cpp
for (int i = start; i < n; i++) {
    if (i > start && a[i] == a[i - 1]) continue;   // same value already tried at this level
    ...
}
```

For permutations, the rule is `if (i > 0 && a[i] == a[i-1] && !used[i-1]) continue;`: use equal values only in their left-to-right order.

## Problems

:::problem Subsets {level=medium lc=subsets tags="backtracking,bitmask"}
Return all subsets of an array of **distinct** integers.

Example: `[1,2,3]` → `[[],[1],[1,2],[1,2,3],[1,3],[2],[2,3],[3]]`.

:::hint Hint
Every node of the recursion tree (not just the leaves) is a valid subset when you use the `start`-index formulation. Record `cur` at the start of each call.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void dfs(const vector<int>& a, int start, vector<int>& cur, vector<vector<int>>& out) {
    out.push_back(cur);                              // every partial choice is a subset
    for (int i = start; i < (int)a.size(); i++) {
        cur.push_back(a[i]);                         // choose
        dfs(a, i + 1, cur, out);                     // explore: only later elements
        cur.pop_back();                              // un-choose
    }
}

vector<vector<int>> subsets(const vector<int>& a) {
    vector<vector<int>> out; vector<int> cur;
    dfs(a, 0, cur, out);
    return out;
}

int main() {
    for (auto& s : subsets({1, 2, 3})) { cout << '['; for (int x : s) cout << x; cout << "] "; }
    cout << '\n';
}
```

:::complexity
Time | O(n \cdot 2^n) |
Space | O(n) | recursion and cur, excluding the output
:::

**Alternative:** iterate over the bitmasks `0 … 2ⁿ−1` (Bit Manipulation lesson). That's no recursion and the same complexity.
:::
:::

:::problem Subsets II {level=medium lc=subsets-ii tags="backtracking,duplicates"}
Same, but the input **may contain duplicates**, and the output must not.

Example: `[1,2,2]` → `[[],[1],[1,2],[1,2,2],[2],[2,2]]`.

:::hint Hint
Sort, then skip `a[i]` if `i > start && a[i] == a[i-1]`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void dfs(const vector<int>& a, int start, vector<int>& cur, vector<vector<int>>& out) {
    out.push_back(cur);
    for (int i = start; i < (int)a.size(); i++) {
        if (i > start && a[i] == a[i - 1]) continue;   // the same value at the same level: skip
        cur.push_back(a[i]);
        dfs(a, i + 1, cur, out);
        cur.pop_back();
    }
}

int main() {
    vector<int> a = {2, 1, 2};
    sort(a.begin(), a.end());
    vector<vector<int>> out; vector<int> cur;
    dfs(a, 0, cur, out);
    for (auto& s : out) { cout << '['; for (int x : s) cout << x; cout << "] "; }
    cout << '\n';
}
```

:::complexity
Time | O(n \cdot 2^n) |
Space | O(n) |
:::

**Why `i > start` and not `i > 0`?** Taking a second `2` **after** the first one (deeper in the tree) is fine: it builds `[2,2]`. What we skip is choosing a *different copy* of the same value **as the same position** of the subset, which happens between siblings at one level.
:::
:::

:::problem Permutations {level=medium lc=permutations tags="backtracking"}
Return all permutations of distinct integers.

Example: `[1,2,3]` → 6 permutations.

:::hint Hint
At each position, try every **unused** element. Track them with a `used[]` array.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void dfs(const vector<int>& a, vector<bool>& used, vector<int>& cur, vector<vector<int>>& out) {
    if (cur.size() == a.size()) { out.push_back(cur); return; }
    for (int i = 0; i < (int)a.size(); i++) {
        if (used[i]) continue;
        used[i] = true;  cur.push_back(a[i]);        // choose
        dfs(a, used, cur, out);                      // explore
        cur.pop_back();  used[i] = false;            // un-choose
    }
}

int main() {
    vector<int> a = {1, 2, 3};
    vector<bool> used(a.size());
    vector<vector<int>> out; vector<int> cur;
    dfs(a, used, cur, out);
    for (auto& p : out) { for (int x : p) cout << x; cout << ' '; }
    cout << "\n" << out.size() << " permutations\n";
}
```

:::complexity
Time | O(n \cdot n!) |
Space | O(n) |
:::

The **swap** version avoids `used[]`: for position `i`, swap each `a[j]` (j ≥ i) into position `i`, recurse on `i+1`, then swap back.
:::
:::

:::problem Permutations II {level=medium lc=permutations-ii tags="backtracking,duplicates"}
Return all **unique** permutations of an array that may contain duplicates.

Example: `[1,1,2]` → `[[1,1,2],[1,2,1],[2,1,1]]`.

:::hint Hint
Sort. Skip `a[i]` if `a[i] == a[i-1]` and `a[i-1]` is **not** used. Equal values are then always used in their left-to-right order, so each distinct arrangement is generated exactly once.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void dfs(const vector<int>& a, vector<bool>& used, vector<int>& cur, vector<vector<int>>& out) {
    if (cur.size() == a.size()) { out.push_back(cur); return; }
    for (int i = 0; i < (int)a.size(); i++) {
        if (used[i]) continue;
        if (i > 0 && a[i] == a[i - 1] && !used[i - 1]) continue;   // take duplicates in order only
        used[i] = true; cur.push_back(a[i]);
        dfs(a, used, cur, out);
        cur.pop_back(); used[i] = false;
    }
}

int main() {
    vector<int> a = {1, 2, 1};
    sort(a.begin(), a.end());
    vector<bool> used(a.size());
    vector<vector<int>> out; vector<int> cur;
    dfs(a, used, cur, out);
    for (auto& p : out) { for (int x : p) cout << x; cout << ' '; }
    cout << '\n';
}
```

:::complexity
Time | O(n \cdot n!) | worst case (all distinct)
Space | O(n) |
:::
:::
:::

:::problem Combinations {level=medium lc=combinations tags="backtracking,pruning"}
Return all combinations of `k` numbers chosen from `1..n`.

Example: `n=4, k=2` → `[[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]]`.

:::hint Hint
`start`-index recursion that stops at size `k`. Pruning: if fewer numbers remain than you still need, stop the loop early.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void dfs(int n, int k, int start, vector<int>& cur, vector<vector<int>>& out) {
    if ((int)cur.size() == k) { out.push_back(cur); return; }
    int need = k - cur.size();
    for (int i = start; i <= n - need + 1; i++) {       // pruning: leave room for the rest
        cur.push_back(i);
        dfs(n, k, i + 1, cur, out);
        cur.pop_back();
    }
}

int main() {
    vector<vector<int>> out; vector<int> cur;
    dfs(4, 2, 1, cur, out);
    for (auto& c : out) cout << '[' << c[0] << ',' << c[1] << "] ";
    cout << "\nC(20,10) combinations: ";
    out.clear(); dfs(20, 10, 1, cur, out);
    cout << out.size() << '\n';
}
```

:::complexity
Time | O(k \binom nk) |
Space | O(k) |
:::
:::
:::

:::problem Combination Sum {level=medium lc=combination-sum tags="backtracking,pruning"}
Given distinct positive `candidates` and a `target`, return all unique combinations that sum to `target`. Each number may be used **any number of times**.

Example: `[2,3,6,7], 7` → `[[2,2,3],[7]]`.

:::hint Hint
`start`-index recursion, but recurse with `i` (not `i + 1`) so the same number can be reused. Sort the candidates and stop as soon as one is bigger than the remaining target.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void dfs(const vector<int>& c, int start, int remain, vector<int>& cur, vector<vector<int>>& out) {
    if (remain == 0) { out.push_back(cur); return; }
    for (int i = start; i < (int)c.size() && c[i] <= remain; i++) {    // sorted: prune the rest
        cur.push_back(c[i]);
        dfs(c, i, remain - c[i], cur, out);           // i, not i + 1: reuse allowed
        cur.pop_back();
    }
}

int main() {
    vector<int> c = {2, 3, 6, 7};
    sort(c.begin(), c.end());
    vector<vector<int>> out; vector<int> cur;
    dfs(c, 0, 7, cur, out);
    for (auto& v : out) { cout << '['; for (int x : v) cout << x << ' '; cout << "] "; }
    cout << '\n';
}
```

:::complexity
Time | O(N^{T/m + 1}) | N candidates, target T, smallest candidate m: an exponential bound on the tree size
Space | O(T/m) | recursion depth
:::

If you only need the **count** of combinations, not the lists, this becomes the "coin change II" DP and runs in $O(N \cdot T)$.
:::
:::

:::problem Combination Sum II {level=medium lc=combination-sum-ii tags="backtracking,duplicates,pruning"}
Same, but each candidate may be used **once**, and the candidates may contain **duplicates**. There should be no duplicate combinations.

Example: `[10,1,2,7,6,1,5], 8` → `[[1,1,6],[1,2,5],[1,7],[2,6]]`.

:::hint Hint
Combine both rules: recurse with `i + 1` (single use) and skip equal siblings (`i > start && c[i] == c[i-1]`).
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

void dfs(const vector<int>& c, int start, int remain, vector<int>& cur, vector<vector<int>>& out) {
    if (remain == 0) { out.push_back(cur); return; }
    for (int i = start; i < (int)c.size() && c[i] <= remain; i++) {
        if (i > start && c[i] == c[i - 1]) continue;
        cur.push_back(c[i]);
        dfs(c, i + 1, remain - c[i], cur, out);
        cur.pop_back();
    }
}

int main() {
    vector<int> c = {10, 1, 2, 7, 6, 1, 5};
    sort(c.begin(), c.end());
    vector<vector<int>> out; vector<int> cur;
    dfs(c, 0, 8, cur, out);
    for (auto& v : out) { cout << '['; for (int x : v) cout << x << ' '; cout << "] "; }
    cout << '\n';
}
```

:::complexity
Time | O(n \cdot 2^n) | worst case
Space | O(n) |
:::
:::
:::

## Check yourself

```quiz
? What must happen after the recursive call in backtracking?
+ Undo the choice so sibling branches start from the same state
- Return immediately
- Clear all the results
> Choose → explore → un-choose.

? Subsets/combinations use a start index; permutations use a used[] array. Why?
+ Sets ignore order (generate each in increasing index order); permutations need every order
- Permutations are faster with used[]
- It's arbitrary
> {1,2} = {2,1} as sets, but they're different permutations.

? Input [1,2,2]. The duplicate-skip condition is `i > start && a[i] == a[i−1]`. What does it skip?
+ Choosing the second 2 as an alternative to the first 2 at the same level
- Ever using two 2s together
- All subsets containing 2
> [2,2] is still generated, by going deeper.

? Time to generate all permutations of n distinct items?
- O(2ⁿ)
+ O(n · n!)
- O(n²)
> n! leaves, O(n) to copy each.
```

:::keypoints
- Template: base case records → loop over choices → **choose, explore, un-choose**.
- Cost ≈ nodes × work per node: subsets $n2^n$, permutations $n \cdot n!$, combinations $k\binom nk$.
- `start` index for order-free selections; `used[]` for orderings; `i` instead of `i+1` for unlimited reuse.
- Duplicates: sort + skip equal **siblings** (`i > start && a[i] == a[i-1]`).
- Prune early (sorted candidates, not enough elements left) to cut whole subtrees.
:::
