---
title: Segment Trees & Fenwick Trees
level: advanced
time: 60
summary: Range queries with updates in O(log n) — the segment tree (build, point update, range query, and the proof that a query touches at most about 4 nodes per level), lazy propagation for range updates, the Fenwick tree (binary indexed tree) and why i & −i works, coordinate compression, and problems like Range Sum Query – Mutable and Count of Smaller Numbers After Self.
---

Prefix sums answer range-sum queries in $O(1)$, but a single update costs $O(n)$. When you need **both updates and range queries**, use a segment tree or a Fenwick tree, which do both in $O(\log n)$.

| Structure | Point update | Range query | Range update | Notes |
|---|---|---|---|---|
| plain array | $O(1)$ | $O(n)$ | $O(n)$ | |
| prefix sums | $O(n)$ | $O(1)$ | $O(n)$ | static data only |
| **Fenwick tree** | $O(\log n)$ | $O(\log n)$ (prefix-based) | $O(\log n)$ with tricks | short; sums or XOR (invertible operations) |
| **Segment tree** | $O(\log n)$ | $O(\log n)$ | $O(\log n)$ with lazy propagation | any associative operation: sum, min, max, gcd… |

## Segment tree

:::def Segment tree
A binary tree where each node stores an aggregate (sum, min, max…) of a **segment** of the array. The root covers `[0, n−1]`. A node covering `[l, r]` has children covering `[l, m]` and `[m+1, r]`. The leaves are single elements. Stored in an array of size about $4n$, with node `i`'s children at `2i` and `2i+1`.
:::

:::flow Range query [ql, qr] at node [l, r]
No overlap | return the identity (0 for sum, +∞ for min)
Full overlap | return the stored value
Partial overlap | recurse into both children and combine
:::

```cpp run level=advanced title="Segment tree: range sum + point update, checked against brute force"
#include <bits/stdc++.h>
using namespace std;

struct SegTree {
    int n; vector<long long> t;
    explicit SegTree(const vector<int>& a) : n(a.size()), t(4 * a.size()) { build(a, 1, 0, n - 1); }
    void build(const vector<int>& a, int node, int l, int r) {
        if (l == r) { t[node] = a[l]; return; }
        int m = (l + r) / 2;
        build(a, 2 * node, l, m); build(a, 2 * node + 1, m + 1, r);
        t[node] = t[2 * node] + t[2 * node + 1];
    }
    void update(int i, int val, int node, int l, int r) {
        if (l == r) { t[node] = val; return; }
        int m = (l + r) / 2;
        if (i <= m) update(i, val, 2 * node, l, m); else update(i, val, 2 * node + 1, m + 1, r);
        t[node] = t[2 * node] + t[2 * node + 1];          // recompute up the path: O(log n)
    }
    long long query(int ql, int qr, int node, int l, int r) const {
        if (qr < l || r < ql) return 0;                    // no overlap
        if (ql <= l && r <= qr) return t[node];            // full overlap
        int m = (l + r) / 2;                               // partial: split
        return query(ql, qr, 2 * node, l, m) + query(ql, qr, 2 * node + 1, m + 1, r);
    }
    void update(int i, int val) { update(i, val, 1, 0, n - 1); }
    long long query(int l, int r) const { return query(l, r, 1, 0, n - 1); }
};

int main() {
    mt19937 rng(5);
    int n = 1000;
    vector<int> a(n);
    for (int& x : a) x = rng() % 100;
    SegTree st(a);
    bool ok = true;
    for (int it = 0; it < 2000; it++) {
        if (rng() % 2) { int i = rng() % n, v = rng() % 100; a[i] = v; st.update(i, v); }
        else {
            int l = rng() % n, r = rng() % n; if (l > r) swap(l, r);
            long long brute = accumulate(a.begin() + l, a.begin() + r + 1, 0LL);
            ok &= brute == st.query(l, r);
        }
    }
    cout << "2000 random operations agree with brute force: " << boolalpha << ok << '\n';
}
```

:::proof A range query visits O(log n) nodes
Look at one level of the tree. Its segments are disjoint and contiguous, and the query range $[q_l, q_r]$ is contiguous too. Only the (at most) two nodes containing the endpoints $q_l$ and $q_r$ can **partially** overlap the range. Every other node at that level is either fully inside (returns immediately) or fully outside (returns immediately). Only partial nodes recurse, so each level has at most 2 partial nodes and their at most 4 children are visited at the next level. With $\lceil\log_2 n\rceil + 1$ levels, that's $O(4\log n) = O(\log n)$ nodes.
:::

:::tip Why 4n space?
The tree has height $\lceil\log_2 n\rceil$, so it has fewer than $2 \cdot 2^{\lceil \log_2 n\rceil} \le 4n$ nodes. Allocating `4n` is always enough with 1-based indexing.
:::

### Lazy propagation: range updates

"Add `v` to every element of `[l, r]`" would touch $O(n)$ leaves. Instead, store a **pending update** (a lazy tag) at the $O(\log n)$ nodes that fully cover the range, and push it down to the children only when a later operation needs to go inside that node.

```cpp run level=advanced title="Lazy segment tree: range add + range sum"
#include <bits/stdc++.h>
using namespace std;

struct LazySeg {
    int n; vector<long long> sum, lazy;
    explicit LazySeg(int n) : n(n), sum(4 * n), lazy(4 * n) {}
    void apply(int node, int l, int r, long long v) { sum[node] += v * (r - l + 1); lazy[node] += v; }
    void push(int node, int l, int r) {                         // hand the pending add to the children
        if (!lazy[node]) return;
        int m = (l + r) / 2;
        apply(2 * node, l, m, lazy[node]); apply(2 * node + 1, m + 1, r, lazy[node]);
        lazy[node] = 0;
    }
    void add(int ql, int qr, long long v, int node, int l, int r) {
        if (qr < l || r < ql) return;
        if (ql <= l && r <= qr) { apply(node, l, r, v); return; }   // fully covered: tag it and stop
        push(node, l, r);
        int m = (l + r) / 2;
        add(ql, qr, v, 2 * node, l, m); add(ql, qr, v, 2 * node + 1, m + 1, r);
        sum[node] = sum[2 * node] + sum[2 * node + 1];
    }
    long long query(int ql, int qr, int node, int l, int r) {
        if (qr < l || r < ql) return 0;
        if (ql <= l && r <= qr) return sum[node];
        push(node, l, r);
        int m = (l + r) / 2;
        return query(ql, qr, 2 * node, l, m) + query(ql, qr, 2 * node + 1, m + 1, r);
    }
    void add(int l, int r, long long v) { add(l, r, v, 1, 0, n - 1); }
    long long query(int l, int r) { return query(l, r, 1, 0, n - 1); }
};

int main() {
    LazySeg st(10);
    st.add(0, 9, 1);       // all ones
    st.add(2, 5, 10);      // +10 on [2, 5]
    st.add(4, 8, -3);
    cout << st.query(0, 9) << ' ' << st.query(4, 5) << ' ' << st.query(6, 6) << '\n';   // 35 16 -2
}
```

## Fenwick tree (binary indexed tree)

A Fenwick tree stores prefix sums in a clever overlapping way. Using **1-based** indexes, `bit[i]` holds the sum of the range `(i − lowbit(i), i]`, where `lowbit(i) = i & -i` is the lowest set bit of `i` (see the Bit Manipulation lesson).

:::derive Why query and update are O(log n)
\text{query}(i) = \text{bit}[i] + \text{query}(i - \text{lowbit}(i)) || bit[i] covers (i − lowbit(i), i]
i \to i - (i \,\&\, {-i}) \text{ clears the lowest set bit} || so at most log₂ i steps until i = 0
\text{update}(i): \; i \to i + (i \,\&\, {-i}) || jump to the next range that also covers i
\text{each jump moves the lowest set bit at least one position up} || so at most log₂ n steps
! \text{both } O(\log n), \text{ about 10 lines of code} ||
:::

```cpp run level=intermediate title="Fenwick tree: prefix sums with updates"
#include <bits/stdc++.h>
using namespace std;

struct Fenwick {
    int n; vector<long long> bit;
    explicit Fenwick(int n) : n(n), bit(n + 1, 0) {}
    void add(int i, long long v) { for (++i; i <= n; i += i & -i) bit[i] += v; }       // 0-based index in
    long long prefix(int i) const { long long s = 0; for (++i; i > 0; i -= i & -i) s += bit[i]; return s; }   // sum a[0..i]
    long long range(int l, int r) const { return prefix(r) - (l ? prefix(l - 1) : 0); }
};

int main() {
    vector<int> a = {5, 2, 9, -3, 6, 1};
    Fenwick f(a.size());
    for (int i = 0; i < (int)a.size(); i++) f.add(i, a[i]);
    cout << f.range(0, 5) << ' ' << f.range(1, 3) << ' ';
    f.add(3, 10);                                  // a[3] += 10
    cout << f.range(1, 3) << '\n';
}
```

## Coordinate compression

Segment and Fenwick trees index by **position**. If the values go up to $10^9$ but there are only $n$ distinct ones, map them to ranks `0..n−1` first: sort, remove duplicates, then `lower_bound` each value. This is the standard first step in "count pairs with value conditions" problems.

## Problems

:::problem Range Sum Query - Mutable {level=medium lc=range-sum-query-mutable tags="segment tree,Fenwick tree"}
Support `update(i, val)` and `sumRange(l, r)` on an array, both fast.

:::hint Hint
A Fenwick tree with point add: to **set** `a[i] = val`, add `val − a[i]` and remember the new value.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

class NumArray {
public:
    explicit NumArray(const vector<int>& nums) : a(nums), bit(nums.size() + 1, 0) {
        for (int i = 0; i < (int)a.size(); i++) add(i, a[i]);
    }
    void update(int i, int val) { add(i, val - a[i]); a[i] = val; }
    int sumRange(int l, int r) const { return prefix(r) - prefix(l - 1); }
private:
    vector<int> a, bit;
    void add(int i, int v) { for (++i; i < (int)bit.size(); i += i & -i) bit[i] += v; }
    int prefix(int i) const { int s = 0; for (++i; i > 0; i -= i & -i) s += bit[i]; return s; }
};

int main() {
    NumArray na({1, 3, 5});
    cout << na.sumRange(0, 2) << ' ';
    na.update(1, 2);
    cout << na.sumRange(0, 2) << '\n';
}
```

:::complexity
Time | O(\log n) | per operation; O(n log n) to build (O(n) is possible)
Space | O(n) |
:::
:::
:::

:::problem Count of Smaller Numbers After Self (Fenwick) {level=hard id=count-smaller-fenwick lc=count-of-smaller-numbers-after-self tags="Fenwick tree,coordinate compression"}
For each `nums[i]`, count the smaller elements to its right. (Solved with merge sort earlier. Now use a Fenwick tree.)

:::hint Hint
Scan from the **right**. The Fenwick tree counts how many of each (compressed) value has been seen so far. For `nums[i]`, ask how many seen values are strictly smaller (a prefix sum), then add `nums[i]`.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<int> countSmaller(const vector<int>& nums) {
    vector<int> vals(nums);
    sort(vals.begin(), vals.end());
    vals.erase(unique(vals.begin(), vals.end()), vals.end());          // coordinate compression
    int m = vals.size();
    vector<int> bit(m + 1, 0), out(nums.size());
    for (int i = (int)nums.size() - 1; i >= 0; i--) {
        int r = lower_bound(vals.begin(), vals.end(), nums[i]) - vals.begin();   // rank, 0-based
        int s = 0;
        for (int j = r; j > 0; j -= j & -j) s += bit[j];                // count of ranks < r
        out[i] = s;
        for (int j = r + 1; j <= m; j += j & -j) bit[j]++;              // record nums[i]
    }
    return out;
}

int main() { for (int x : countSmaller({5, 2, 6, 1})) cout << x << ' '; cout << "| "; for (int x : countSmaller({-1, -1})) cout << x << ' '; cout << '\n'; }
```

:::complexity
Time | O(n \log n) |
Space | O(n) |
:::
:::
:::

:::problem Range Minimum Query {level=medium id=range-minimum-query tags="segment tree,classic"}
Support `update(i, v)` and `minRange(l, r)`. (A classic problem, not on LeetCode as such.) A Fenwick tree can't do range **min** with updates easily. Why not, and what can?

:::hint Hint
Fenwick trees compute a range from **prefixes** by subtraction: `prefix(r) − prefix(l−1)`. Min has no inverse operation, so you can't subtract. A segment tree only needs the operation to be **associative**.
:::

:::solution
An iterative (bottom-up) segment tree: leaves at `n..2n−1`, and parent `i` = min of `2i` and `2i+1`. It's short and fast.

```cpp run
#include <bits/stdc++.h>
using namespace std;

struct MinSeg {
    int n; vector<int> t;
    explicit MinSeg(const vector<int>& a) : n(a.size()), t(2 * a.size()) {
        for (int i = 0; i < n; i++) t[n + i] = a[i];
        for (int i = n - 1; i > 0; i--) t[i] = min(t[2 * i], t[2 * i + 1]);
    }
    void update(int i, int v) { for (t[i += n] = v; i > 1; i /= 2) t[i / 2] = min(t[i], t[i ^ 1]); }
    int query(int l, int r) const {                       // inclusive [l, r]
        int res = INT_MAX;
        for (l += n, r += n + 1; l < r; l /= 2, r /= 2) {
            if (l & 1) res = min(res, t[l++]);
            if (r & 1) res = min(res, t[--r]);
        }
        return res;
    }
};

int main() {
    MinSeg s({5, 3, 8, 6, 1, 9, 4});
    cout << s.query(0, 3) << ' ' << s.query(2, 6) << ' ';
    s.update(4, 7);
    cout << s.query(2, 6) << '\n';
}
```

:::complexity
Time | O(\log n) | per operation
Space | O(n) |
:::

For **static** arrays, a *sparse table* answers range-min queries in $O(1)$ after $O(n \log n)$ preprocessing (overlapping power-of-two ranges are fine, because min is idempotent).
:::
:::

## Check yourself

```quiz
? Which structure handles range-min queries with point updates in O(log n)?
- Prefix sums
- Fenwick tree
+ Segment tree
> Fenwick needs an invertible operation (like +); a segment tree only needs associativity.

? What does `i & -i` compute?
+ The lowest set bit of i
- The highest set bit of i
- i mod 2
> Fenwick ranges have length lowbit(i).

? Why does a segment tree range query visit only O(log n) nodes?
+ Each level has at most 2 partially overlapping nodes; the others return immediately
- The tree is a heap
- Queries only go down one path
> Only the boundary nodes recurse.

? What is lazy propagation for?
+ Range updates in O(log n), by delaying the work at fully covered nodes
- Making queries O(1)
- Reducing memory to O(n)
> Pending updates are pushed down only when needed.
```

:::keypoints
- Need updates **and** range queries → segment tree or Fenwick tree, $O(\log n)$ each.
- Segment tree: no / full / partial overlap; about 4 nodes per level; works for any associative operation; `4n` array.
- Lazy propagation: tag fully covered nodes, push down on demand → range updates in $O(\log n)$.
- Fenwick: `bit[i]` covers `(i − lowbit(i), i]`; `i -= i&-i` to query, `i += i&-i` to update. Short and fast for sums.
- Coordinate-compress large values to ranks before indexing.
:::
