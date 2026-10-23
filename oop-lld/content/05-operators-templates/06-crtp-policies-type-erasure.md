---
title: CRTP, policy-based design and type erasure
level: advanced
time: 40
summary: Three advanced C++ design tools: the Curiously Recurring Template Pattern for static polymorphism and mixins, policy-based design for compile-time strategies, and type erasure for value-semantic polymorphism without a shared base class.
---

These three come up in senior interviews ("how would you get polymorphism without virtual functions?"). They are also how much of the standard library works.

## 1. CRTP: static polymorphism

**CRTP** = Curiously Recurring Template Pattern: a class derives from a template **instantiated with itself**: `class Dog : public Animal<Dog>`. The base can then call derived functions with **no virtual call**, because it knows the exact type at compile time.

```cpp run title="Static polymorphism with CRTP"
#include <iostream>
using namespace std;

template <typename Derived>
class Shape {
public:
    double area() const { return static_cast<const Derived*>(this)->areaImpl(); }   // "virtual" call resolved at compile time
    void describe() const { cout << "area = " << area() << "\n"; }                 // shared code in the base
};

class Circle : public Shape<Circle> {
    double r_;
public:
    explicit Circle(double r) : r_(r) {}
    double areaImpl() const { return 3.14159 * r_ * r_; }
};
class Square : public Shape<Square> {
    double s_;
public:
    explicit Square(double s) : s_(s) {}
    double areaImpl() const { return s_ * s_; }
};

template <typename T>
void report(const Shape<T>& s) { s.describe(); }          // works for any shape, with no vtable

int main() {
    report(Circle(1));
    report(Square(3));
    cout << "sizeof(Circle) = " << sizeof(Circle) << " (no vptr)\n";
}
```

Limitations: `Shape<Circle>` and `Shape<Square>` are **different types**, so you cannot put them in one `vector`. Use CRTP when types are known at compile time and speed matters.

### CRTP as a mixin: add features to any class

```cpp run title="A reusable 'Comparable' and 'instance counter' mixin"
#include <iostream>
using namespace std;

// Give any class the full set of comparison operators, if it defines only operator<
template <typename T>
struct Comparable {
    friend bool operator>(const T& a, const T& b)  { return b < a; }
    friend bool operator<=(const T& a, const T& b) { return !(b < a); }
    friend bool operator>=(const T& a, const T& b) { return !(a < b); }
};

// Count how many objects of each type exist
template <typename T>
struct Counted {
    static inline int alive = 0;
    Counted() { ++alive; }
    Counted(const Counted&) { ++alive; }
    ~Counted() { --alive; }
};

struct Money : Comparable<Money>, Counted<Money> {
    long paise;
    explicit Money(long p) : paise(p) {}
    friend bool operator<(const Money& a, const Money& b) { return a.paise < b.paise; }
};
struct Ticket : Counted<Ticket> {};

int main() {
    Money a(500), b(900);
    cout << boolalpha << (a < b) << (a > b) << (a <= b) << (a >= b) << "\n";
    { Ticket t1, t2, t3; cout << "tickets alive: " << Counted<Ticket>::alive << "\n"; }
    cout << "tickets alive: " << Counted<Ticket>::alive << ", money alive: " << Counted<Money>::alive << "\n";
}
```

Each class gets its **own** `alive` counter because `Counted<Money>` and `Counted<Ticket>` are different classes.

## 2. Policy-based design

A **policy** is a small class that supplies one behaviour, passed as a template parameter. It is the **Strategy** pattern resolved at compile time: no virtual call, and the compiler can inline everything.

```cpp run title="A logger whose output and format are policies"
#include <iostream>
#include <string>
using namespace std;

struct ConsoleOutput { void write(const string& s) const { cout << s << "\n"; } };
struct NullOutput    { void write(const string&) const {} };                 // does nothing: zero cost when logging is off

struct PlainFormat  { string format(const string& m) const { return m; } };
struct LevelFormat  { string format(const string& m) const { return "[INFO] " + m; } };

template <typename Output, typename Format = PlainFormat>
class Logger : private Output, private Format {         // private inheritance gets the empty-base optimisation
public:
    void log(const string& m) const { this->write(this->format(m)); }
};

int main() {
    Logger<ConsoleOutput> a;
    Logger<ConsoleOutput, LevelFormat> b;
    Logger<NullOutput> off;
    a.log("plain message");
    b.log("formatted message");
    off.log("discarded");
    cout << "sizeof(Logger<ConsoleOutput>) = " << sizeof(a) << "\n";       // empty policies take no space
}
```

`std::vector<T, Allocator>` and `std::map<K, V, Compare>` are policy-based: the allocator and comparator are policies.

## 3. Type erasure: polymorphism as a value

Virtual functions force every type to inherit from a common base. **Type erasure** gives you a uniform interface to **unrelated** types, with value semantics, by hiding an internal interface behind a template constructor. `std::function` and `std::any` work this way.

```cpp run title="A hand-made 'AnyShape' that accepts unrelated types"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

// Unrelated types: no common base class, no virtual functions.
struct Circle { double r; double area() const { return 3.14159 * r * r; } };
struct Rect   { double w, h; double area() const { return w * h; } };

class AnyShape {
    struct Concept {                                              // the hidden interface
        virtual ~Concept() = default;
        virtual double area() const = 0;
        virtual unique_ptr<Concept> clone() const = 0;
    };
    template <typename T>
    struct Model : Concept {                                      // wraps one concrete type
        T value;
        explicit Model(T v) : value(std::move(v)) {}
        double area() const override { return value.area(); }
        unique_ptr<Concept> clone() const override { return make_unique<Model>(*this); }
    };
    unique_ptr<Concept> impl_;
public:
    template <typename T>
    AnyShape(T v) : impl_(make_unique<Model<T>>(std::move(v))) {}   // accepts ANY T that has area()
    AnyShape(const AnyShape& o) : impl_(o.impl_->clone()) {}        // value semantics: copy copies
    AnyShape(AnyShape&&) noexcept = default;
    double area() const { return impl_->area(); }
};

int main() {
    vector<AnyShape> shapes{Circle{1}, Rect{3, 4}, Circle{2}};     // one container, unrelated types, no pointers
    double total = 0;
    for (const auto& s : shapes) total += s.area();
    cout << "total area " << total << "\n";
    auto copy = shapes;                                            // deep copy for free
    cout << "copy has " << copy.size() << " shapes\n";
}
```

Compare with inheritance: `Circle` and `Rect` know nothing about `AnyShape`. You can wrap types from a library you cannot modify. The container holds **values**, not pointers.

| Approach | Common base class? | Run-time types? | Value semantics | Best for |
|---|---|---|---|---|
| Virtual inheritance | yes | yes | no (pointers) | clear hierarchies you own |
| CRTP / templates | no | no (compile time) | yes | speed, mixins |
| Type erasure | no | yes | yes | wrapping third-party types, callbacks (`std::function`) |

:::interview How would you get polymorphism without virtual functions?
"Compile-time: templates with concepts, or CRTP. Run-time without a common base: type erasure (`std::function`, `std::any`, or a hand-written wrapper with an internal virtual interface), or `std::variant` for a closed set of types. I choose by whether the set of types is open or closed, and by whether performance or flexibility matters most."
:::

```quiz
? What does CRTP achieve?
- Run-time dispatch through a vtable
+ Static polymorphism: a base class calls derived functions without virtual calls
- Multiple inheritance
> The base is templated on the derived type, so the call is resolved at compile time.
? What is a "policy" in policy-based design?
- A security rule
+ A small class passed as a template parameter that supplies one behaviour
- A virtual function
> It is the compile-time version of the Strategy pattern.
? Why can a type-erased wrapper hold unrelated classes?
- Because they share a base
+ The wrapper stores each in an internal template class that implements a hidden interface
- Because it uses void*
> The erasure hides the concrete type behind a uniform interface.
```

:::keypoints
- CRTP: `class D : public Base<D>` gives virtual-like behaviour with no vtable, plus reusable mixins.
- Policies: behaviour as template parameters: fast, inlineable Strategy.
- Type erasure: one uniform value-type interface over unrelated types (`std::function`, `std::any`).
:::
