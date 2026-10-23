---
title: Storing objects in containers
level: intermediate
time: 35
summary: Putting polymorphic objects in vectors with unique_ptr, move-only elements, registries in unordered_map, emplace versus push_back, sorting with comparators and projections, the erase-remove idiom, iterator invalidation rules, and deep-copying a polymorphic container with clone().
---

LLD solutions are full of containers of objects: a parking lot holds spots, a library holds books, an elevator holds requests. This lesson covers the patterns and the traps.

## A container of polymorphic objects

Plain `vector<Shape>` **slices**. Store pointers: `vector<unique_ptr<Shape>>` (sole owner) is the standard choice.

```cpp run title="vector<unique_ptr<Base>>"
#include <algorithm>
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

struct Shape {
    virtual ~Shape() = default;
    virtual double area() const = 0;
    virtual string name() const = 0;
};
struct Circle : Shape {
    double r; explicit Circle(double r) : r(r) {}
    double area() const override { return 3.14159 * r * r; }
    string name() const override { return "circle"; }
};
struct Rect : Shape {
    double w, h; Rect(double w, double h) : w(w), h(h) {}
    double area() const override { return w * h; }
    string name() const override { return "rect"; }
};

int main() {
    vector<unique_ptr<Shape>> shapes;
    shapes.push_back(make_unique<Circle>(1));
    shapes.push_back(make_unique<Rect>(3, 4));
    shapes.push_back(make_unique<Circle>(2));

    // sort by area, largest first: the comparator dereferences the pointers
    sort(shapes.begin(), shapes.end(), [](const unique_ptr<Shape>& a, const unique_ptr<Shape>& b) { return a->area() > b->area(); });
    for (const auto& s : shapes) cout << s->name() << " " << s->area() << "\n";

    // vector<unique_ptr<Shape>> copy = shapes;     // error: unique_ptr is not copyable, so neither is the vector
    auto moved = std::move(shapes);                 // moving the whole vector is fine and cheap
    cout << "moved " << moved.size() << ", original now " << shapes.size() << "\n";
}
```

## Registries: finding objects by key

```cpp run title="unordered_map<string, unique_ptr<T>> as a registry"
#include <iostream>
#include <memory>
#include <string>
#include <unordered_map>
using namespace std;

struct Handler {
    virtual ~Handler() = default;
    virtual string handle(const string& req) const = 0;
};
struct EchoHandler : Handler { string handle(const string& r) const override { return "echo:" + r; } };
struct UpperHandler : Handler {
    string handle(const string& r) const override { string u = r; for (char& c : u) c = toupper(c); return u; }
};

class Router {
    unordered_map<string, unique_ptr<Handler>> routes_;
public:
    void add(const string& path, unique_ptr<Handler> h) { routes_[path] = std::move(h); }
    string dispatch(const string& path, const string& req) const {
        auto it = routes_.find(path);
        if (it == routes_.end()) return "404";
        return it->second->handle(req);                  // the map owns the handlers
    }
};

int main() {
    Router r;
    r.add("/echo", make_unique<EchoHandler>());
    r.add("/up", make_unique<UpperHandler>());
    cout << r.dispatch("/echo", "hi") << " " << r.dispatch("/up", "hi") << " " << r.dispatch("/x", "hi") << "\n";
}
```

## push_back vs emplace_back

`push_back(x)` takes an **object** (building a temporary if needed). `emplace_back(args...)` constructs the element **in place** from the arguments, avoiding a temporary.

```cpp run title="emplace_back avoids a temporary"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Item {
    string name; int qty;
    Item(string n, int q) : name(move(n)), qty(q) { cout << "  construct " << name << "\n"; }
    Item(const Item& o) : name(o.name), qty(o.qty) { cout << "  COPY " << name << "\n"; }
    Item(Item&& o) noexcept : name(move(o.name)), qty(o.qty) { cout << "  move " << name << "\n"; }
};

int main() {
    vector<Item> v;
    v.reserve(4);                                   // avoid reallocation noise in the output
    cout << "push_back(Item(...)):\n";   v.push_back(Item("pen", 2));       // construct a temporary, then MOVE it in
    cout << "emplace_back(args):\n";     v.emplace_back("book", 1);         // construct directly in the vector
}
```

## Sorting: comparators and multiple keys

```cpp run title="Sort by several keys; stable_sort keeps ties in order"
#include <algorithm>
#include <iostream>
#include <string>
#include <tuple>
#include <vector>
using namespace std;

struct Player { string name; int score; int age; };

int main() {
    vector<Player> ps{{"asha", 90, 25}, {"ravi", 90, 22}, {"meera", 75, 30}, {"kiran", 90, 22}};

    sort(ps.begin(), ps.end(), [](const Player& a, const Player& b) {
        // score descending, then age ascending, then name: tuple comparison does the chain for us
        return tie(b.score, a.age, a.name) < tie(a.score, b.age, b.name);
    });
    for (const auto& p : ps) cout << p.name << "(" << p.score << "," << p.age << ") ";
    cout << "\n";

    stable_sort(ps.begin(), ps.end(), [](const Player& a, const Player& b) { return a.age < b.age; });   // ties keep previous order
    for (const auto& p : ps) cout << p.name << " ";
    cout << "\n";
}
```

## Removing elements: the erase-remove idiom

`remove_if` only **moves** the kept elements to the front and returns the new logical end; `erase` then actually shrinks the vector. (C++20 adds `std::erase_if(v, pred)` that does both.)

```cpp run title="Removing from a vector"
#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> v{1, 2, 3, 4, 5, 6};
    v.erase(remove_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; }), v.end());    // classic
    for (int x : v) cout << x << " ";
    cout << "\n";

    vector<int> w{10, 20, 30, 40};
    erase_if(w, [](int x) { return x > 25; });                                            // C++20
    for (int x : w) cout << x << " ";
    cout << "\n";

    // WRONG in a loop: erasing while iterating with a for-each invalidates the iterator
    // for (auto it = w.begin(); it != w.end(); ++it) if (*it == 10) w.erase(it);   // undefined behaviour
}
```

## Iterator invalidation: the table to remember

| Container | Insert | Erase |
|---|---|---|
| `vector` | invalidates **all** if it reallocates; otherwise from the insertion point on | from the erased element on |
| `deque` | invalidates all iterators (but references to elements stay valid for push at the ends) | all (except erasing at the ends) |
| `list`, `forward_list` | **none** | only the erased element |
| `map`, `set` (ordered) | **none** | only the erased element |
| `unordered_map`, `unordered_set` | all iterators if **rehash** happens (references stay valid) | only the erased element |

`erase` returns the iterator to the next element, which is the safe way to erase in a loop:

```cpp run title="Safe erase in a loop"
#include <iostream>
#include <map>
#include <string>
using namespace std;

int main() {
    map<string, int> stock{{"pen", 0}, {"book", 4}, {"bag", 0}, {"lamp", 7}};
    for (auto it = stock.begin(); it != stock.end(); ) {
        if (it->second == 0) it = stock.erase(it);       // erase returns the next valid iterator
        else ++it;
    }
    for (const auto& [k, v] : stock) cout << k << "=" << v << " ";
    cout << "\n";
}
```

## Deep-copying a polymorphic container

Because `unique_ptr` is not copyable, copying `vector<unique_ptr<Shape>>` takes a loop and the **clone idiom**.

```cpp run title="Deep copy with clone()"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

struct Shape {
    virtual ~Shape() = default;
    virtual unique_ptr<Shape> clone() const = 0;
    virtual double side() const = 0;
};
struct Square : Shape {
    double s; explicit Square(double s) : s(s) {}
    unique_ptr<Shape> clone() const override { return make_unique<Square>(*this); }
    double side() const override { return s; }
};

class Drawing {
    vector<unique_ptr<Shape>> shapes_;
public:
    Drawing() = default;
    Drawing(const Drawing& o) { for (const auto& s : o.shapes_) shapes_.push_back(s->clone()); }   // deep copy
    Drawing(Drawing&&) noexcept = default;
    Drawing& operator=(Drawing o) noexcept { shapes_.swap(o.shapes_); return *this; }              // copy-and-swap
    void add(unique_ptr<Shape> s) { shapes_.push_back(move(s)); }
    double total() const { double t = 0; for (const auto& s : shapes_) t += s->side(); return t; }
};

int main() {
    Drawing a;
    a.add(make_unique<Square>(2));
    a.add(make_unique<Square>(5));
    Drawing b = a;                       // independent copy: new Square objects
    b.add(make_unique<Square>(10));
    cout << a.total() << " " << b.total() << "\n";
}
```

:::interview Why `vector<unique_ptr<Base>>` and not `vector<Base>`?
"`vector<Base>` stores base objects by value, so putting a derived object in it slices it, and the derived part and virtual behaviour are lost. A vector of `unique_ptr<Base>` stores pointers, so each element keeps its real derived type, and `unique_ptr` makes the vector the clear owner so everything is freed automatically."
:::

```quiz
? What is the problem with `vector<Shape>` where Shape is a polymorphic base?
- Nothing
+ Elements are stored by value, so derived objects are sliced
- vector cannot hold classes
> Use `vector<unique_ptr<Shape>>` to preserve the dynamic types.
? Why can't you copy a `vector<unique_ptr<T>>`?
- vector forbids it
+ unique_ptr is move-only, so copying the elements is impossible
- It is too slow
> You can move the vector or deep-copy element by element with clone().
? What does `remove_if` alone (without erase) do?
- Shrinks the vector
+ Moves kept elements to the front and returns the new logical end; the size is unchanged
- Deletes elements and frees memory
> You must call `erase` with that end iterator, or use `std::erase_if` in C++20.
```

:::keypoints
- Polymorphic elements go in `vector<unique_ptr<Base>>`. Registries: `unordered_map<Key, unique_ptr<T>>`.
- Prefer `emplace_back`. Use `tie` for multi-key comparators and `stable_sort` to keep ties.
- Use erase-remove or `erase_if`; in loops use `it = c.erase(it)`. Know the invalidation rules.
- Deep-copy polymorphic collections with `clone()` and copy-and-swap.
:::
