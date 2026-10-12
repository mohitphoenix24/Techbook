---
title: Structs, Classes & Templates
level: intermediate
time: 35
summary: Everything you need to build your own data structures and answer "design a class" questions — structs vs classes, constructors and initializer lists, const methods, operator overloading for sorting and hashing, templates, and RAII.
---

LeetCode's "design" questions (`LRUCache`, `MinStack`, `Trie`) and the Project Lab both ask you to **build a data structure as a class**. This lesson gives you the C++ for that.

## struct vs class

:::def struct / class
Both bundle **data (members)** and **functions (methods)** into a new type. The only difference: members of a `struct` are `public` by default, and members of a `class` are `private` by default. By convention, use `struct` for plain data (a point, an edge) and `class` for types that protect their internals.
:::

:::syntax
```cpp
struct Edge {
    int u, v, w;                                     // public data
    bool operator<(const Edge& o) const { return w < o.w; }   // sort by weight
};

class Counter {
public:
    explicit Counter(int start = 0) : value_(start) {}  // constructor + initializer list
    void inc() { value_++; }
    int get() const { return value_; }               // const: doesn't modify the object
private:
    int value_;                                      // hidden from outside
};
```
:::

```cpp run level=easy title="A struct with a comparator, sorted and in a set"
#include <bits/stdc++.h>
using namespace std;

struct Edge {
    int u, v, w;
    bool operator<(const Edge& o) const {          // lets sort/set/priority_queue compare Edges
        if (w != o.w) return w < o.w;
        return tie(u, v) < tie(o.u, o.v);          // tie() compares field by field
    }
};

int main() {
    vector<Edge> edges = {{0, 1, 7}, {1, 2, 3}, {0, 2, 5}, {2, 3, 3}};
    sort(edges.begin(), edges.end());              // uses operator<
    for (auto& e : edges) cout << e.u << '-' << e.v << " (" << e.w << ")\n";

    set<Edge> s(edges.begin(), edges.end());
    cout << "lightest edge weight: " << s.begin()->w << '\n';
}
```

:::tip `tie(...) < tie(...)`
`std::tie` turns several fields into a tuple of references. Tuples compare lexicographically, so this is the shortest correct way to write a multi-field comparison.
:::

## Constructors and initializer lists

Initialize members in the **initializer list** (after the `:`), not by assigning inside the body. It's required for `const` and reference members, and it avoids constructing things twice.

```cpp run level=easy title="A tree node, the way LeetCode defines it"
#include <bits/stdc++.h>
using namespace std;

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode* l, TreeNode* r) : val(x), left(l), right(r) {}
};

int height(TreeNode* t) { return t ? 1 + max(height(t->left), height(t->right)) : 0; }

int main() {
    // root 1 has children 2 and 3; node 2 has a left child 4
    TreeNode* root = new TreeNode(1, new TreeNode(2, new TreeNode(4), nullptr), new TreeNode(3));
    cout << "height = " << height(root) << '\n';
}
```

## A "design" class from scratch

Here is the shape of a typical interview design answer. It has private state, clear public methods, and a complexity for each method.

```cpp run level=intermediate title="A running-statistics class"
#include <bits/stdc++.h>
using namespace std;

class RunningStats {
public:
    void add(int x) {                         // O(1)
        n_++; sum_ += x;
        mn_ = std::min(mn_, x);               // std:: needed: our own min()/max() methods
        mx_ = std::max(mx_, x);               // hide the global names inside the class
        freq_[x]++;
        if (freq_[x] > bestCount_) { bestCount_ = freq_[x]; mode_ = x; }
    }
    double mean() const { return n_ ? (double)sum_ / n_ : 0.0; }   // O(1)
    int min() const { return mn_; }
    int max() const { return mx_; }
    int mode() const { return mode_; }

private:
    long long n_ = 0, sum_ = 0;               // default member initializers
    int mn_ = INT_MAX, mx_ = INT_MIN;
    unordered_map<int, int> freq_;
    int bestCount_ = 0, mode_ = 0;
};

int main() {
    RunningStats st;
    for (int x : {4, 8, 4, 1, 9, 4, 8}) st.add(x);
    cout << fixed << setprecision(3)
         << "mean " << st.mean() << ", min " << st.min() << ", max " << st.max() << ", mode " << st.mode() << '\n';
}
```

:::interview
For a design question, say the **complexity of each method** before you code ("`add` is O(1), `mean` is O(1)"), and say which data structures you're combining and why. That's most of what's being graded.
:::

## Operator overloading you'll actually use

| Operator | Why |
|---|---|
| `bool operator<(const T&) const` | `sort`, `set`, `map`, `priority_queue` |
| `bool operator==(const T&) const` | `unordered_set/map` keys, `find`, `count` |
| `ostream& operator<<(ostream&, const T&)` | printing with `cout <<` |
| `size_t operator()(const T&) const` in a hash struct | custom hash for `unordered_*` |

```cpp run level=intermediate title="A point usable in unordered_set and printable"
#include <bits/stdc++.h>
using namespace std;

struct Point {
    int x, y;
    bool operator==(const Point& o) const { return x == o.x && y == o.y; }
};
struct PointHash {
    size_t operator()(const Point& p) const { return hash<long long>()(((long long)p.x << 32) ^ (unsigned)p.y); }
};
ostream& operator<<(ostream& os, const Point& p) { return os << '(' << p.x << ", " << p.y << ')'; }

int main() {
    unordered_set<Point, PointHash> seen = {{0, 0}, {1, 2}};
    Point q{1, 2};
    cout << q << (seen.count(q) ? " already seen\n" : " is new\n");
}
```

## Templates

:::def Template
A **blueprint** for a function or class that works with any type. `template <typename T>` introduces a type parameter `T`, and the compiler generates a version for each type you use. All STL containers are templates: `vector<T>`, `map<K, V>`.
:::

```cpp run level=intermediate title="A generic function and a generic stack"
#include <bits/stdc++.h>
using namespace std;

template <typename T>
T clampValue(T x, T lo, T hi) { return max(lo, min(x, hi)); }

template <typename T>
class Stack {                                   // a tiny stack on top of vector
public:
    void push(const T& x) { data_.push_back(x); }
    void pop() { if (data_.empty()) throw runtime_error("pop on empty stack"); data_.pop_back(); }
    const T& top() const { return data_.back(); }
    bool empty() const { return data_.empty(); }
    size_t size() const { return data_.size(); }
private:
    vector<T> data_;
};

int main() {
    cout << clampValue(15, 0, 10) << ' ' << clampValue(2.5, 0.0, 1.0) << '\n';

    Stack<string> s;
    for (string w : {"to", "be", "or"}) s.push(w);
    while (!s.empty()) { cout << s.top() << ' '; s.pop(); }
    cout << '\n';
    try { s.pop(); } catch (const exception& e) { cout << "caught: " << e.what() << '\n'; }
}
```

## RAII and the rule of zero

:::def RAII
"Resource Acquisition Is Initialization": an object **acquires** a resource in its constructor and **releases** it in its destructor. When the object goes out of scope, cleanup happens automatically. `vector`, `string` and `unique_ptr` all work this way.
:::

**Rule of zero:** if your class stores its data in RAII members (`vector`, `string`, `unique_ptr`, other containers), you don't need to write a destructor, copy constructor or assignment operator. The defaults do the right thing. You only need the "rule of five" when you manage raw memory yourself. The *Dynamic Array* project does exactly that, so you see both sides.

## Problems

:::problem Design Parking System {level=easy lc=design-parking-system tags="design,class"}
A parking lot has a fixed number of `big`, `medium` and `small` slots. Implement `ParkingSystem(big, medium, small)` and `bool addCar(int carType)`, where carType 1/2/3 means big/medium/small. A car can only park in a slot of its own type. Return whether it parked.

:::hint Hint
Three counters are enough. An array indexed by `carType` keeps the code free of if-chains.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

class ParkingSystem {
public:
    ParkingSystem(int big, int medium, int small) : free_{0, big, medium, small} {}
    bool addCar(int carType) {                     // O(1)
        if (free_[carType] == 0) return false;
        free_[carType]--;
        return true;
    }
private:
    array<int, 4> free_;                           // index 0 unused
};

int main() {
    ParkingSystem p(1, 1, 0);
    cout << boolalpha << p.addCar(1) << ' ' << p.addCar(2) << ' ' << p.addCar(3) << ' ' << p.addCar(1) << '\n';
}
```

:::complexity
Time | O(1) | per call
Space | O(1) |
:::
:::
:::

:::problem Design Underground System {level=medium lc=design-underground-system tags="design,hash map"}
Implement:
- `checkIn(id, station, t)`: customer `id` enters at `station` at time `t`.
- `checkOut(id, station, t)`: customer `id` leaves at `station` at time `t`.
- `getAverageTime(start, end)`: the average time of all completed trips from `start` to `end`.

:::hint Hint
You need two maps: one for customers currently travelling (`id → (station, time)`), and one for route statistics (`"start→end" → (total time, count)`).
:::

:::solution
Each method is O(1) on average. Route keys combine both station names with a separator that can't appear in a name.

```cpp run
#include <bits/stdc++.h>
using namespace std;

class UndergroundSystem {
public:
    void checkIn(int id, const string& station, int t) { active_[id] = {station, t}; }
    void checkOut(int id, const string& station, int t) {
        auto [from, t0] = active_[id];
        active_.erase(id);
        auto& [total, count] = routes_[from + "->" + station];
        total += t - t0;
        count++;
    }
    double getAverageTime(const string& a, const string& b) {
        auto& [total, count] = routes_[a + "->" + b];
        return (double)total / count;
    }
private:
    unordered_map<int, pair<string, int>> active_;
    unordered_map<string, pair<long long, int>> routes_;
};

int main() {
    UndergroundSystem u;
    u.checkIn(45, "Leyton", 3);  u.checkIn(32, "Paradise", 8);  u.checkIn(27, "Leyton", 10);
    u.checkOut(45, "Waterloo", 15); u.checkOut(27, "Waterloo", 20); u.checkOut(32, "Cambridge", 22);
    cout << u.getAverageTime("Paradise", "Cambridge") << ' ' << u.getAverageTime("Leyton", "Waterloo") << '\n';
}
```

:::complexity
Time | O(1) | average per call (plus O(L) to build the string key)
Space | O(P + R) | P travelling passengers, R distinct routes
:::
:::
:::

## Check yourself

```quiz
? What's the only language difference between struct and class?
+ Default access: public for struct, private for class
- Classes can have methods, structs can't
- Structs live on the stack, classes on the heap
> Everything else is identical.

? Why mark `int get() const`?
+ It promises not to change the object, so it can be called on const objects and const references
- It makes the function faster
- It returns a constant
> Methods called through `const T&` must be const.

? To use your own struct as a key in `unordered_set`, you need…
- operator<
+ operator== and a hash function
- a destructor
> Hash containers need equality and hashing; ordered ones need operator<.
```

:::keypoints
- `struct` (public by default) for plain data, `class` (private by default) for encapsulated types.
- Initialize members in the initializer list. Mark read-only methods `const`.
- Overload `operator<` (ordering), `operator==` + a hash (unordered keys), `operator<<` (printing). Compare multiple fields with `tie(...)`.
- Templates (`template <typename T>`) make one class work for every type.
- RAII + rule of zero: store data in containers or smart pointers and let them clean up.
:::
