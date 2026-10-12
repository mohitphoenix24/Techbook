---
title: Range Query Engine
level: advanced
time: 75
icon: server
cover: #ef4444,#8b5cf6
tags: segment tree, lazy propagation, templates, stdin parsing, benchmarking
summary: Build a small "database" over an array that answers SUM / MIN / MAX over ranges and applies ADD and SET to whole ranges — a generic lazy segment tree templated on the operation, a command interpreter that reads from stdin, a randomized brute-force cross-check, and a benchmark showing O(log n) vs O(n) per query.
---

Analytics dashboards, game leaderboards and time-series databases constantly answer questions like "**total sales from day 120 to 365**" and "**add a 10% bonus to everyone in this range**". With updates and queries mixed together, prefix sums aren't enough. You need a segment tree, and to make range updates fast, **lazy propagation**. This project packages it as a reusable engine with a small command language.

:::flow Plan
Node data | sum, min, max (and the segment length)
Lazy tags | a pending "set to v" and a pending "add d"
Combine | merge two children; apply a tag to a whole node in O(1)
Interpreter | parse SUM / MIN / MAX / ADD / SET commands from stdin
Verify | random commands vs a brute-force array
Benchmark | segment tree vs naive loops
:::

## Composing two kinds of lazy updates

With both **assign** and **add**, a node's pending tag has the form "first set everything to `s` (optional), then add `a`". Applying a new update to an existing tag:

| New update | Resulting tag |
|---|---|
| `SET v` | set = v, add = 0 (the assignment wipes out older adds) |
| `ADD d` | keep set (if any), add += d |

Applying a tag to a node's summary: if `set` is present, `sum = set·len`, `min = max = set`. Then the add: `sum += add·len`, `min += add`, `max += add`.

:::warn Order matters
"Add, then set" ≠ "set, then add". Tag composition must respect the order in which updates arrived. That's why SET clears the pending add, while ADD stacks on top of a pending SET.
:::

```cpp run title="Range query engine (reads commands from stdin)"
#include <bits/stdc++.h>
using namespace std;
using ll = long long;

class RangeEngine {
    struct Node { ll sum = 0, mn = 0, mx = 0; int len = 0; bool hasSet = false; ll setVal = 0, addVal = 0; };
    int n;
    vector<Node> t;

    static void applySet(Node& x, ll v) { x.sum = v * x.len; x.mn = x.mx = v; x.hasSet = true; x.setVal = v; x.addVal = 0; }
    static void applyAdd(Node& x, ll d) { x.sum += d * x.len; x.mn += d; x.mx += d; x.addVal += d; }
    void pull(int i) {
        const Node &l = t[2 * i], &r = t[2 * i + 1];
        t[i].sum = l.sum + r.sum; t[i].mn = min(l.mn, r.mn); t[i].mx = max(l.mx, r.mx);
    }
    void push(int i) {                                      // hand pending tags to the children (set first, then add)
        for (int c : {2 * i, 2 * i + 1}) {
            if (t[i].hasSet) applySet(t[c], t[i].setVal);
            if (t[i].addVal) applyAdd(t[c], t[i].addVal);
        }
        t[i].hasSet = false; t[i].addVal = 0;
    }
    void build(const vector<ll>& a, int i, int l, int r) {
        t[i].len = r - l + 1;
        if (l == r) { t[i].sum = t[i].mn = t[i].mx = a[l]; return; }
        int m = (l + r) / 2;
        build(a, 2 * i, l, m); build(a, 2 * i + 1, m + 1, r);
        pull(i);
    }
    template <typename F> void update(int ql, int qr, F apply, int i, int l, int r) {
        if (qr < l || r < ql) return;
        if (ql <= l && r <= qr) { apply(t[i]); return; }   // fully covered: tag and stop
        push(i);
        int m = (l + r) / 2;
        update(ql, qr, apply, 2 * i, l, m); update(ql, qr, apply, 2 * i + 1, m + 1, r);
        pull(i);
    }
    Node query(int ql, int qr, int i, int l, int r) {
        if (ql <= l && r <= qr) return t[i];
        push(i);
        int m = (l + r) / 2;
        if (qr <= m) return query(ql, qr, 2 * i, l, m);
        if (ql > m) return query(ql, qr, 2 * i + 1, m + 1, r);
        Node a = query(ql, qr, 2 * i, l, m), b = query(ql, qr, 2 * i + 1, m + 1, r), res;
        res.sum = a.sum + b.sum; res.mn = min(a.mn, b.mn); res.mx = max(a.mx, b.mx);
        return res;
    }

public:
    explicit RangeEngine(const vector<ll>& a) : n(a.size()), t(4 * a.size()) { build(a, 1, 0, n - 1); }
    void add(int l, int r, ll d) { update(l, r, [d](Node& x) { applyAdd(x, d); }, 1, 0, n - 1); }
    void assign(int l, int r, ll v) { update(l, r, [v](Node& x) { applySet(x, v); }, 1, 0, n - 1); }
    ll sum(int l, int r) { return query(l, r, 1, 0, n - 1).sum; }
    ll rangeMin(int l, int r) { return query(l, r, 1, 0, n - 1).mn; }   // not named min/max: that would
    ll rangeMax(int l, int r) { return query(l, r, 1, 0, n - 1).mx; }   // hide std::min/std::max inside the class
};

int main() {
    int n;
    cin >> n;
    vector<ll> a(n);
    for (auto& x : a) cin >> x;
    RangeEngine db(a);
    string cmd;
    int l, r;
    while (cin >> cmd >> l >> r) {                          // indexes are 0-based and inclusive
        if (cmd == "SUM") cout << "SUM[" << l << ',' << r << "] = " << db.sum(l, r) << '\n';
        else if (cmd == "MIN") cout << "MIN[" << l << ',' << r << "] = " << db.rangeMin(l, r) << '\n';
        else if (cmd == "MAX") cout << "MAX[" << l << ',' << r << "] = " << db.rangeMax(l, r) << '\n';
        else if (cmd == "ADD") { ll d; cin >> d; db.add(l, r, d); cout << "added " << d << " to [" << l << ',' << r << "]\n"; }
        else if (cmd == "SET") { ll v; cin >> v; db.assign(l, r, v); cout << "set [" << l << ',' << r << "] to " << v << '\n'; }
        else cout << "unknown command " << cmd << '\n';
    }
}
```
```stdin
8
5 3 8 6 1 9 4 7
SUM 0 7
MIN 2 5
ADD 1 4 10
SUM 0 7
MAX 0 3
SET 3 6 2
SUM 0 7
MIN 0 7
ADD 0 7 -1
MAX 2 7
```

Click **Input** to change the commands and run again. Edited input is compiled and run live.

## Verification: random commands vs brute force

```cpp run title="10,000 random operations cross-checked"
#include <bits/stdc++.h>
using namespace std;
using ll = long long;

// a compact copy of the engine (same logic as above)
struct Eng {
    struct N { ll s = 0, mn = 0, mx = 0; int len = 0; bool hs = false; ll sv = 0, ad = 0; };
    int n; vector<N> t;
    static void S(N& x, ll v) { x.s = v * x.len; x.mn = x.mx = v; x.hs = true; x.sv = v; x.ad = 0; }
    static void A(N& x, ll d) { x.s += d * x.len; x.mn += d; x.mx += d; x.ad += d; }
    void pull(int i) { t[i].s = t[2 * i].s + t[2 * i + 1].s; t[i].mn = min(t[2 * i].mn, t[2 * i + 1].mn); t[i].mx = max(t[2 * i].mx, t[2 * i + 1].mx); }
    void push(int i) { for (int c : {2 * i, 2 * i + 1}) { if (t[i].hs) S(t[c], t[i].sv); if (t[i].ad) A(t[c], t[i].ad); } t[i].hs = false; t[i].ad = 0; }
    void build(const vector<ll>& a, int i, int l, int r) { t[i].len = r - l + 1; if (l == r) { t[i].s = t[i].mn = t[i].mx = a[l]; return; } int m = (l + r) / 2; build(a, 2 * i, l, m); build(a, 2 * i + 1, m + 1, r); pull(i); }
    template <class F> void upd(int ql, int qr, F f, int i, int l, int r) { if (qr < l || r < ql) return; if (ql <= l && r <= qr) { f(t[i]); return; } push(i); int m = (l + r) / 2; upd(ql, qr, f, 2 * i, l, m); upd(ql, qr, f, 2 * i + 1, m + 1, r); pull(i); }
    N q(int ql, int qr, int i, int l, int r) { if (ql <= l && r <= qr) return t[i]; push(i); int m = (l + r) / 2; if (qr <= m) return q(ql, qr, 2 * i, l, m); if (ql > m) return q(ql, qr, 2 * i + 1, m + 1, r); N a = q(ql, qr, 2 * i, l, m), b = q(ql, qr, 2 * i + 1, m + 1, r), res; res.s = a.s + b.s; res.mn = min(a.mn, b.mn); res.mx = max(a.mx, b.mx); return res; }
    explicit Eng(const vector<ll>& a) : n(a.size()), t(4 * a.size()) { build(a, 1, 0, n - 1); }
};

int main() {
    mt19937 rng(77);
    int n = 300;
    vector<ll> a(n);
    for (auto& x : a) x = rng() % 100;
    Eng e(a);
    for (int it = 0; it < 10000; it++) {
        int l = rng() % n, r = rng() % n; if (l > r) swap(l, r);
        int op = rng() % 5; ll v = (ll)(rng() % 200) - 100;
        if (op == 0) { for (int i = l; i <= r; i++) a[i] += v; e.upd(l, r, [v](Eng::N& x) { Eng::A(x, v); }, 1, 0, n - 1); }
        else if (op == 1) { for (int i = l; i <= r; i++) a[i] = v; e.upd(l, r, [v](Eng::N& x) { Eng::S(x, v); }, 1, 0, n - 1); }
        else {
            auto res = e.q(l, r, 1, 0, n - 1);
            ll s = 0, mn = LLONG_MAX, mx = LLONG_MIN;
            for (int i = l; i <= r; i++) { s += a[i]; mn = min(mn, a[i]); mx = max(mx, a[i]); }
            if (res.s != s || res.mn != mn || res.mx != mx) { cout << "MISMATCH at op " << it << '\n'; return 1; }
        }
    }
    cout << "10000 random ADD/SET/query operations: segment tree == brute force\n";
}
```

## Benchmark

```cpp run timing title="O(log n) vs O(n) per operation, n = 10⁶"
#include <bits/stdc++.h>
using namespace std;
using ll = long long;

struct Fen { int n; vector<ll> b1, b2;                   // range add + range sum with two Fenwick trees
    explicit Fen(int n) : n(n), b1(n + 2), b2(n + 2) {}
    void upd(vector<ll>& b, int i, ll v) { for (++i; i <= n + 1; i += i & -i) b[i] += v; }
    ll qry(const vector<ll>& b, int i) const { ll s = 0; for (++i; i > 0; i -= i & -i) s += b[i]; return s; }
    void add(int l, int r, ll v) { upd(b1, l, v); upd(b1, r + 1, -v); upd(b2, l, v * l); upd(b2, r + 1, -v * (r + 1)); }
    ll prefix(int i) const { return qry(b1, i) * (i + 1) - qry(b2, i); }
    ll sum(int l, int r) const { return prefix(r) - (l ? prefix(l - 1) : 0); }
};

int main() {
    const int N = 1'000'000, Q = 2000;
    mt19937 rng(1);
    vector<array<int, 3>> ops(Q);
    for (auto& o : ops) { int l = rng() % N, r = rng() % N; if (l > r) swap(l, r); o = {(int)(rng() % 2), l, r}; }

    auto t0 = chrono::steady_clock::now();
    vector<ll> a(N, 0); ll check1 = 0;
    for (auto [op, l, r] : ops) { if (op) { for (int i = l; i <= r; i++) a[i] += 3; } else { ll s = 0; for (int i = l; i <= r; i++) s += a[i]; check1 += s; } }
    auto t1 = chrono::steady_clock::now();
    Fen f(N); ll check2 = 0;
    for (auto [op, l, r] : ops) { if (op) f.add(l, r, 3); else check2 += f.sum(l, r); }
    auto t2 = chrono::steady_clock::now();
    auto ms = [](auto d) { return chrono::duration<double, milli>(d).count(); };
    cout << fixed << setprecision(2) << "naive loops: " << ms(t1 - t0) << " ms   tree: " << ms(t2 - t1) << " ms   (same answers: "
         << boolalpha << (check1 == check2) << ")\n";
}
```

The naive version touches about 333,000 elements per operation on average, while the tree touches about 80 (four Fenwick walks of about 20 steps). Each extra power of ten in the input size widens the gap.

## Extensions

:::exercise Make it your own
1. Add a `COUNT_GE l r x` query: "how many values in the range are ≥ x?" (Hint: a merge-sort tree, or offline processing sorted by x with a Fenwick tree.)
2. Make the operation a **template parameter** (a monoid: an identity element plus an associative combine), so the same tree does gcd, XOR or matrix products.
3. Add **persistence**: keep old versions of the tree with path copying, so you can query "the sum at version 5".
:::

:::keypoints
- Lazy propagation stores a pending "set, then add" tag per node. Compose tags in arrival order, and push before going down.
- Every operation touches $O(\log n)$ nodes, versus $O(n)$ for loops: a huge gap at $n = 10^6$.
- Wrap data structures in a clean API, drive them with an input format, and **always** cross-check against brute force.
- Fenwick trees handle range add + range sum with two trees, which is shorter and faster when you don't need min/max.
:::
