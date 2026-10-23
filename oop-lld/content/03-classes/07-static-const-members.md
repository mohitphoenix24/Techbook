---
title: static, const and mutable members
level: intermediate
time: 30
summary: Class-wide data and functions with static, ID generators and counters, constexpr class constants, const member functions and overloads, mutable for caches and locks, and the static initialisation order trap.
---

## static data members: shared by all objects

A normal data member exists once **per object**. A `static` data member exists **once per class**, shared by every object. It lives in static storage, not inside the object.

```cpp run title="A static counter and an ID generator"
#include <iostream>
#include <string>
using namespace std;

class Ticket {
    static inline int nextId_ = 1000;        // C++17 'inline static': defined right here, no .cpp line needed
    static inline int alive_ = 0;
    int id_;
    string passenger_;
public:
    explicit Ticket(string p) : id_(nextId_++), passenger_(move(p)) { ++alive_; }
    ~Ticket() { --alive_; }
    Ticket(const Ticket& o) : id_(nextId_++), passenger_(o.passenger_) { ++alive_; }   // a copy gets a NEW id

    int id() const { return id_; }
    static int aliveCount() { return alive_; }        // static member function: no 'this'
};

int main() {
    Ticket a("Asha"), b("Ravi");
    cout << a.id() << " " << b.id() << " alive=" << Ticket::aliveCount() << "\n";   // call through the CLASS name
    {
        Ticket c = a;
        cout << c.id() << " alive=" << Ticket::aliveCount() << "\n";
    }
    cout << "alive=" << Ticket::aliveCount() << "\n";
}
```

Notes:

- Before C++17 you had to *declare* the static in the class and *define* it once in a `.cpp` file: `int Ticket::nextId_ = 1000;`. With `inline static` you define it in the class.
- A **static member function** has no `this`. It can touch only static members and its parameters. It cannot be `const` or `virtual`.
- Call it with the class name: `Ticket::aliveCount()`.
- Static counters like `nextId_` are *shared mutable state*. With threads you need `std::atomic<int>` or a mutex. We fix that in the concurrency module.

## Class constants

```cpp run title="constexpr static for class-wide constants"
#include <array>
#include <iostream>
using namespace std;

class Board {
public:
    static constexpr int kSize = 3;                     // known at compile time, usable as an array size
    static constexpr char kEmpty = '.';
private:
    array<array<char, kSize>, kSize> cells_{};
public:
    Board() { for (auto& row : cells_) row.fill(kEmpty); }
    void print() const {
        for (const auto& row : cells_) { for (char c : row) cout << c; cout << "\n"; }
    }
};

int main() {
    cout << "board size " << Board::kSize << "\n";
    Board().print();
}
```

Prefer `static constexpr` constants to `#define` macros. They have types, scope and show up in the debugger.

## const member functions

A `const` member function promises **not to change the object's observable state**. It can be called on `const` objects and through `const` references and pointers.

```cpp run title="const overloads: one for const objects, one for non-const"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

class Names {
    vector<string> v_{"asha", "ravi"};
public:
    string& at(size_t i)             { cout << "[non-const at] "; return v_.at(i); }
    const string& at(size_t i) const { cout << "[const at] ";     return v_.at(i); }
};

int main() {
    Names n;
    n.at(0) = "meera";                  // non-const object: picks the first overload, can modify
    cout << n.at(0) << "\n";

    const Names& view = n;
    cout << view.at(1) << "\n";         // const view: picks the const overload, cannot modify
}
```

This is exactly how `std::vector::operator[]` works: two overloads, one for each constness.

## mutable: logically const, physically changing

Sometimes a function is *logically* read-only but updates a hidden detail: a cache, a hit counter, a mutex. Mark that member `mutable` so a `const` function may change it.

```cpp run title="mutable cache and mutex in a const function"
#include <iostream>
#include <mutex>
using namespace std;

class Circle {
    double r_;
    mutable double areaCache_ = -1;          // computed lazily
    mutable int computations_ = 0;
    mutable mutex m_;                        // locking does not change the logical value
public:
    explicit Circle(double r) : r_(r) {}
    double area() const {                    // const, yet updates the cache
        lock_guard<mutex> lock(m_);
        if (areaCache_ < 0) { areaCache_ = 3.14159 * r_ * r_; ++computations_; }
        return areaCache_;
    }
    int computations() const { return computations_; }
};

int main() {
    const Circle c(2);
    cout << c.area() << " " << c.area() << " " << c.area() << "\n";
    cout << "computed " << c.computations() << " time(s)\n";
}
```

Use `mutable` sparingly. Valid uses: caches, lazy values, counters for statistics, and mutexes. Never to bypass `const` for real state changes.

## const data members and what they cost

```cpp run title="const members make a class non-assignable"
#include <iostream>
#include <type_traits>
using namespace std;

struct Fixed { const int id; int value; };      // id never changes after construction
struct Loose { int id; int value; };

int main() {
    cout << boolalpha;
    cout << "Fixed copy-assignable? " << is_copy_assignable_v<Fixed> << "\n";
    cout << "Loose copy-assignable? " << is_copy_assignable_v<Loose> << "\n";
}
```

A `const` (or reference) member deletes the compiler's assignment operator. So such a class cannot be assigned or sorted in a vector. A common design choice is therefore: keep members non-const but private, and offer no setter.

## static local variables and the initialisation order trap

Static objects at namespace scope in **different files** are initialised in an unspecified order. If one uses another during construction you get the *static initialisation order fiasco*. The cure is a **function-local static**, which is created the first time control passes through it (and, since C++11, thread-safely).

```cpp run title="Function-local static (the Meyers trick)"
#include <iostream>
#include <string>
using namespace std;

struct Registry {
    Registry() { cout << "Registry created\n"; }
    void add(const string& s) { cout << "registered " << s << "\n"; }
};

Registry& registry() {
    static Registry instance;       // built on the first call, once, thread-safe
    return instance;
}

int main() {
    cout << "start\n";
    registry().add("A");
    registry().add("B");            // same object: no second "created" line
}
```

This is exactly how the **Singleton** pattern is written in modern C++ (module 10).

```quiz
? Where does a static data member live?
- Inside each object
+ In static storage, once for the whole class
- On the heap
> It is shared by all objects and exists even when there are no objects.
? Why can a static member function not be const?
- It can, there is no rule
+ It has no this pointer, so there is no object to be const
- Because it is inline
> `const` on a member function qualifies `this`. A static function has no `this`.
? Which is a legitimate use of mutable?
- Making a member writable from anywhere
+ A cache or mutex that a const function must update
- Replacing a setter
> Mutable is for details that do not change the logical value of the object.
```

:::keypoints
- `static` data is shared by the whole class; `static` functions have no `this`. Use `inline static` or `static constexpr` in the class.
- `const` member functions allow use on const objects. Provide const and non-const overloads when returning references.
- `mutable` is for caches, counters and mutexes inside const functions.
- A function-local static avoids the static-initialisation-order problem and is the basis of the Meyers Singleton.
:::
