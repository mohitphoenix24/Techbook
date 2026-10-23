---
title: Every kind of polymorphism in C++
level: intermediate
time: 30
summary: Compile-time versus run-time polymorphism, overloading versus overriding versus hiding side by side, function templates, std::function, and a guide for choosing between virtual functions, templates and variant.
---

"Polymorphism" is not just virtual functions. C++ has several forms. A strong answer names them all and explains when to use each.

## The map

| Kind | Resolved | Mechanism | Example |
|---|---|---|---|
| **Overloading** (ad-hoc) | compile time | same name, different parameters | `print(int)`, `print(string)` |
| **Operator overloading** | compile time | same as overloading | `a + b` on your `Vector` |
| **Templates** (parametric) | compile time | code generated per type | `max<T>`, `vector<T>` |
| **Virtual functions** (subtype) | **run time** | vtable dispatch | `shape->area()` |
| **Type erasure / std::function** | run time | hidden interface behind a value | `function<void()>` |
| **std::variant + visit** | run time (closed set) | tagged union | `visit(visitor, v)` |

## Compile-time (static) polymorphism

```cpp run title="Overloading and templates: the compiler picks"
#include <iostream>
#include <string>
using namespace std;

void print(int x)           { cout << "int " << x << "\n"; }
void print(const string& s) { cout << "string " << s << "\n"; }

template <class T>
T bigger(T a, T b) { return a > b ? a : b; }          // ONE definition, works for any T with operator>

int main() {
    print(3);
    print(string("hi"));
    cout << bigger(3, 8) << " " << bigger(2.5, 1.5) << " " << bigger(string("pear"), string("apple")) << "\n";
}
```

No run-time cost: each `bigger<T>` is a separate, fully optimised function. The price: the types must be known at compile time, and code size grows.

## Run-time (dynamic) polymorphism

```cpp run title="Virtual functions: the object decides"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

struct Discount {
    virtual ~Discount() = default;
    virtual double apply(double price) const = 0;
};
struct NoDiscount : Discount { double apply(double p) const override { return p; } };
struct Percent : Discount {
    double pct; explicit Percent(double p) : pct(p) {}
    double apply(double p) const override { return p * (1 - pct / 100); }
};
struct Flat : Discount {
    double off; explicit Flat(double o) : off(o) {}
    double apply(double p) const override { return p > off ? p - off : 0; }
};

int main() {
    vector<unique_ptr<Discount>> rules;
    rules.push_back(make_unique<NoDiscount>());
    rules.push_back(make_unique<Percent>(10));
    rules.push_back(make_unique<Flat>(150));           // chosen at run time: could come from a config file
    for (const auto& r : rules) cout << r->apply(1000) << " ";
    cout << "\n";
}
```

The set of types can be decided at run time (user choice, a config file, a plug-in), and new types can be added without touching existing code.

## Overloading vs overriding vs hiding: side by side

```cpp run title="Three similar-looking things"
#include <iostream>
using namespace std;

struct Base {
    virtual void f(int)    { cout << "Base::f(int)\n"; }
    virtual void g()       { cout << "Base::g()\n"; }
    void h()               { cout << "Base::h()\n"; }          // non-virtual
};
struct Derived : Base {
    void f(int) override   { cout << "Derived::f(int)\n"; }     // OVERRIDE: same signature, virtual
    void f(double)         { cout << "Derived::f(double)\n"; }  // OVERLOAD: same name, different parameters
    void h()               { cout << "Derived::h()\n"; }        // HIDES Base::h (not virtual)
};

int main() {
    Derived d;
    Base* b = &d;
    b->f(1);        // run time: Derived::f(int)   (override)
    d.f(1.5);       // compile time: Derived::f(double)   (overload)
    b->h();         // static type is Base*: Base::h()   (hiding, not overriding!)
    d.h();          // Derived::h()
}
```

| | Overload | Override | Hide |
|---|---|---|---|
| Same scope? | yes | no (derived vs base) | no |
| Same signature? | no | **yes** | name only |
| `virtual` needed? | no | **yes** (in base) | no |
| Resolved | compile time | run time | compile time |

## std::function: polymorphism without inheritance

`std::function<R(Args...)>` can hold **any callable** (a function, a lambda, a functor) with a matching signature. The users need no common base class.

```cpp run title="Behaviour as a value"
#include <functional>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    struct Doubler { int operator()(int x) const { return x * 2; } };
    int offset = 10;

    vector<function<int(int)>> steps;
    steps.push_back(Doubler{});                                   // a functor
    steps.push_back([offset](int x) { return x + offset; });     // a lambda with a capture
    steps.push_back([](int x) { return x * x; });                 // another lambda

    int v = 3;
    for (auto& s : steps) { v = s(v); cout << v << " "; }
    cout << "\n";
}
```

This is the lightweight way to implement the **Strategy** and **Command** patterns when the interface is a single function. It costs an indirect call (like a virtual call) and may allocate.

## Choosing

| Choose | When |
|---|---|
| **Virtual functions** | A set of types that grows or is chosen at run time; a clear, stable interface with several operations; objects in one container |
| **Templates** | Types known at compile time; performance critical; algorithms/containers over any type |
| **std::variant** | A **closed**, known set of alternatives (a JSON value, a token, a shape in a small fixed set); you want to add *operations* easily |
| **std::function** | One-function interface; callbacks and strategies |

:::tip Extensible types vs extensible operations
Virtual functions make it easy to **add a new type** (a new class) but hard to add a new operation (edit every class). `variant` + `visit` is the reverse: easy to add operations, hard to add types. This is the "expression problem", and the reason the Visitor pattern exists.
:::

:::interview Compile-time vs run-time polymorphism
"Compile-time: overloading and templates, resolved by the compiler, no run-time cost, types fixed at build time. Run-time: virtual functions via vtable, resolved from the object's actual type, small overhead, supports types chosen while the program runs. I choose templates for performance and generic code, virtual functions for open-ended extensibility."
:::

```quiz
? Which is NOT resolved at compile time?
- Function overloading
- Template instantiation
+ A virtual function call through a base pointer
> Virtual dispatch happens at run time through the vtable.
? In which case is `Derived::h()` called through a `Base*`?
- When h() is non-virtual in Base
+ Only when h() is virtual in Base (and overridden)
- Always
> Without virtual, the pointer's static type chooses the function (hiding, not overriding).
? What lets `std::function` hold unrelated callables?
- Inheritance
+ Type erasure: it stores any callable behind an internal uniform interface
- Macros
> The callers only need a matching call signature, not a common base class.
```

:::keypoints
- C++ offers overloading, templates, virtual functions, type erasure (`std::function`) and `variant`.
- Overload = same scope, different parameters, compile time. Override = virtual, same signature, run time. Hide = non-virtual same name in derived.
- Templates for speed and generic code; virtual functions for open, run-time extension; variant for closed sets.
:::
