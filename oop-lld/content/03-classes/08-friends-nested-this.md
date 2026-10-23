---
title: friend, nested classes, this chaining, default and delete
level: intermediate
time: 30
summary: Controlled holes in encapsulation with friend, nested classes and iterators, returning *this for fluent interfaces, = default and = delete on any function, final, and type aliases inside classes.
---

## friend: a deliberate hole in encapsulation

A `friend` function or class can access the private members of the class that declares it. Use it **rarely**, for things that are tightly coupled by design, such as `operator<<`.

```cpp run title="friend operator<< and a friend class"
#include <iostream>
#include <string>
using namespace std;

class Point {
    int x_, y_;
    friend ostream& operator<<(ostream& os, const Point& p);   // a NON-member that may see privates
    friend class PointInspector;                                // a whole class that may see privates
public:
    Point(int x, int y) : x_(x), y_(y) {}
};

ostream& operator<<(ostream& os, const Point& p) { return os << "(" << p.x_ << ", " << p.y_ << ")"; }

class PointInspector {
public:
    static int manhattan(const Point& p) { return abs(p.x_) + abs(p.y_); }
};

int main() {
    Point p(3, -4);
    cout << p << " distance " << PointInspector::manhattan(p) << "\n";
}
```

Facts to remember:

- Friendship is **not** inherited, **not** mutual and **not** transitive. If A befriends B, B can see A's privates, but A cannot see B's.
- `operator<<` must be a non-member (the left operand is `ostream`, not your class), so it is the classic friend.
- A friend is *not* a member: it has no `this`.

:::warn Do not use friend to avoid design thinking
If many friends are needed, the class boundaries are probably wrong. Ask whether a public method would be cleaner.
:::

## Nested classes

A class declared inside another is a **nested class**. It is a good choice for helper types that make sense only within the outer class: nodes, iterators, builders.

```cpp run title="A linked list with a private Node and a public iterator"
#include <iostream>
#include <memory>
using namespace std;

class IntList {
    struct Node {                              // private nested type: hidden from users
        int value;
        unique_ptr<Node> next;
        explicit Node(int v) : value(v) {}
    };
    unique_ptr<Node> head_;
    size_t size_ = 0;
public:
    class Iterator {                           // public nested type: IntList::Iterator
        Node* cur_;
    public:
        explicit Iterator(Node* n) : cur_(n) {}
        int& operator*() const { return cur_->value; }
        Iterator& operator++() { cur_ = cur_->next.get(); return *this; }
        bool operator!=(const Iterator& o) const { return cur_ != o.cur_; }
    };

    void pushFront(int v) {
        auto n = make_unique<Node>(v);
        n->next = move(head_);
        head_ = move(n);
        ++size_;
    }
    Iterator begin() { return Iterator(head_.get()); }
    Iterator end()   { return Iterator(nullptr); }     // range-for needs begin() and end()
    size_t size() const { return size_; }
};

int main() {
    IntList list;
    for (int i = 1; i <= 4; ++i) list.pushFront(i * 10);
    for (int v : list) cout << v << " ";               // the range-for uses our iterator
    cout << "(" << list.size() << " items)\n";
}
```

A nested class has no special access to the outer class's members (and vice versa) except that the nested class can use the outer class's private *types* and static members. The name is scoped: `IntList::Iterator`.

## Returning *this: fluent interfaces

If a member function returns `*this` by reference, calls can be **chained**. This is the heart of the Builder pattern and of `cout << a << b`.

```cpp run title="Method chaining"
#include <iostream>
#include <string>
using namespace std;

class QueryBuilder {
    string table_, where_;
    int limit_ = -1;
public:
    QueryBuilder& from(string t)   { table_ = move(t); return *this; }
    QueryBuilder& where(string w)  { where_ = move(w); return *this; }
    QueryBuilder& limit(int n)     { limit_ = n; return *this; }
    string build() const {
        string q = "SELECT * FROM " + table_;
        if (!where_.empty()) q += " WHERE " + where_;
        if (limit_ >= 0) q += " LIMIT " + to_string(limit_);
        return q;
    }
};

int main() {
    cout << QueryBuilder().from("users").where("age > 18").limit(10).build() << "\n";
}
```

## = default and = delete

`= default` asks the compiler to generate the standard version. `= delete` makes a function **unusable**, and works on *any* function, not only special members.

```cpp run expect-error title="= delete blocks unwanted overloads and conversions"
#include <iostream>
using namespace std;

class Percent {
    int v_;
public:
    explicit Percent(int v) : v_(v) {}
    Percent(double) = delete;               // forbid: Percent(0.5) would silently become 0
    int value() const { return v_; }
};

int main() {
    Percent a(50);                          // fine
    Percent b(0.5);                         // error: use of deleted function
    cout << a.value() << b.value() << "\n";
}
```

Typical uses: delete copy for unique resources; delete overloads that would cause a bad implicit conversion; `= default` to keep a trivial constructor or to restore one that another constructor suppressed.

## final: closing a class or a function

```cpp run title="final on a class"
#include <iostream>
using namespace std;

class Logger final {                      // nobody may inherit from Logger
public:
    void log(const char* m) const { cout << "[log] " << m << "\n"; }
};
// class FancyLogger : public Logger {};  // error: cannot derive from final class

int main() { Logger().log("hello"); }
```

`final` also stops a virtual function from being overridden further (you will use that in the inheritance module). It also lets the compiler call the function directly, which is faster.

## Type aliases and nested enums

```cpp run title="using inside a class, enum class inside a class"
#include <iostream>
#include <string>
#include <unordered_map>
using namespace std;

class Inventory {
public:
    using Sku = string;                         // a name for the concept
    using Stock = unordered_map<Sku, int>;
    enum class Result { Added, Updated };       // used as Inventory::Result::Added

    Result set(const Sku& sku, int qty) {
        auto [it, inserted] = stock_.insert_or_assign(sku, qty);
        (void)it;
        return inserted ? Result::Added : Result::Updated;
    }
    int qty(const Sku& s) const { auto it = stock_.find(s); return it == stock_.end() ? 0 : it->second; }
private:
    Stock stock_;
};

int main() {
    Inventory inv;
    auto r1 = inv.set("pen", 5);
    auto r2 = inv.set("pen", 9);
    cout << (r1 == Inventory::Result::Added) << (r2 == Inventory::Result::Updated) << " " << inv.qty("pen") << "\n";
}
```

```quiz
? A friend function declared in class A can...
- Be inherited by classes derived from A
+ Access A's private members
- Access private members of every class
> Friendship is granted by a class to specific functions or classes; it is not inherited, mutual or transitive.
? What must a method return so that calls can be chained: `b.x(1).y(2)`?
- void
+ A reference to the object (`*this`)
- A copy of the object
> Returning `T&` to `*this` lets the next call act on the same object.
? What does `Percent(double) = delete;` achieve?
- Deletes the object Percent
+ Makes calls that would resolve to that overload a compile error
- Nothing
> It prevents silent narrowing conversions by turning them into errors.
```

:::keypoints
- `friend` grants access to private members: use it sparingly (for example `operator<<`).
- Nested classes are good for nodes, iterators and builders; the helper stays hidden in the outer class.
- Returning `*this` by reference enables fluent chaining.
- `= delete` removes any function (including overloads); `= default` asks for the compiler's version; `final` closes a class or virtual function.
:::
