---
title: std::variant and std::visit
level: intermediate
time: 30
summary: Modelling a closed set of alternatives without inheritance using std::variant, visiting with overloaded lambdas, a small expression tree and a state machine, and how variant compares to virtual functions and the Visitor pattern.
---

Sometimes the set of types is **fixed and known**: a JSON value is null, bool, number, string, array or object. Using a class hierarchy with virtual functions for this is heavy. **`std::variant`** is a type-safe union: it holds **one** value out of a fixed list of types, and remembers which.

## Basics

```cpp run title="variant holds exactly one of its alternatives"
#include <iostream>
#include <string>
#include <variant>
using namespace std;

int main() {
    variant<int, double, string> v = 42;
    cout << "index " << v.index() << ": " << get<int>(v) << "\n";

    v = string("hello");                                   // now it holds a string
    cout << "index " << v.index() << ": " << get<string>(v) << "\n";

    if (auto* s = get_if<string>(&v)) cout << "it is a string of length " << s->size() << "\n";
    cout << boolalpha << holds_alternative<int>(v) << "\n";

    try { get<int>(v); } catch (const bad_variant_access&) { cout << "wrong alternative: bad_variant_access\n"; }
}
```

## std::visit: do something for each alternative

`std::visit` calls the right overload for whichever type is currently held, and the compiler checks that **every** alternative is handled.

```cpp run title="visit with an overloaded set of lambdas"
#include <iostream>
#include <string>
#include <variant>
#include <vector>
using namespace std;

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };   // the standard helper
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;                 // deduction guide (C++17)

using Value = variant<int, double, string, bool>;

string describe(const Value& v) {
    return visit(overloaded{
        [](int i)           { return "int " + to_string(i); },
        [](double d)        { return "double " + to_string(d); },
        [](const string& s) { return "string '" + s + "'"; },
        [](bool b)          { return string(b ? "bool true" : "bool false"); },
    }, v);
}

int main() {
    vector<Value> values{7, 2.5, string("hi"), true};
    for (const auto& v : values) cout << describe(v) << "\n";
}
```

If you add a new alternative to `Value` and forget a lambda, the program **does not compile**. With a base class and a forgotten override you often find out only at run time.

## Example: a shapes "hierarchy" without inheritance

```cpp run title="Shapes as a variant"
#include <iostream>
#include <variant>
#include <vector>
using namespace std;

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

struct Circle { double r; };
struct Rect   { double w, h; };
struct Tri    { double b, h; };
using Shape = variant<Circle, Rect, Tri>;

double area(const Shape& s) {
    return visit(overloaded{
        [](const Circle& c) { return 3.14159 * c.r * c.r; },
        [](const Rect& r)   { return r.w * r.h; },
        [](const Tri& t)    { return 0.5 * t.b * t.h; },
    }, s);
}
double perimeterHint(const Shape& s) {                          // a NEW operation: no class needs editing
    return visit(overloaded{
        [](const Circle& c) { return 2 * 3.14159 * c.r; },
        [](const Rect& r)   { return 2 * (r.w + r.h); },
        [](const Tri& t)    { return t.b * 3; },                // (rough)
    }, s);
}

int main() {
    vector<Shape> shapes{Circle{1}, Rect{3, 4}, Tri{6, 2}};     // values in a vector: no pointers, no heap
    for (const auto& s : shapes) cout << area(s) << " / " << perimeterHint(s) << "\n";
}
```

The Circle, Rect and Tri are plain structs: no base class, no virtuals. Adding the *operation* `perimeterHint` meant adding one function, without editing any shape.

## Example: a state machine with variant

```cpp run title="A tiny order state machine"
#include <iostream>
#include <string>
#include <variant>
using namespace std;

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

struct Created {};
struct Paid    { string receipt; };
struct Shipped { string tracking; };
struct Cancelled { string reason; };
using State = variant<Created, Paid, Shipped, Cancelled>;

State pay(const State& s) {
    if (holds_alternative<Created>(s)) return Paid{"R-1001"};
    return s;                                                    // invalid transition: stay
}
State ship(const State& s) {
    if (holds_alternative<Paid>(s)) return Shipped{"TRK-77"};
    return s;
}

string show(const State& s) {
    return visit(overloaded{
        [](const Created&)        { return string("created"); },
        [](const Paid& p)         { return "paid (" + p.receipt + ")"; },
        [](const Shipped& x)      { return "shipped (" + x.tracking + ")"; },
        [](const Cancelled& c)    { return "cancelled: " + c.reason; },
    }, s);
}

int main() {
    State s = Created{};
    cout << show(s) << "\n";
    s = ship(s);   cout << "ship too early -> " << show(s) << "\n";
    s = pay(s);    cout << show(s) << "\n";
    s = ship(s);   cout << show(s) << "\n";
}
```

Each state **carries its own data** (a receipt only exists when paid). This is cleaner than one class with optional fields.

## variant vs virtual functions vs Visitor

| | `variant` + `visit` | virtual functions | Visitor pattern |
|---|---|---|---|
| Add a **new type** | edit the `variant` and every visitor (compiler tells you) | add a class only | edit every visitor and the interface |
| Add a **new operation** | add a function only | edit every class | add a visitor class only |
| Heap/pointers needed? | no, values | usually | usually |
| Set of types | **closed** | open | closed |
| Performance | no vtable, contiguous storage | indirect call | double dispatch |

:::interview variant or inheritance?
"If the set of alternatives is closed and I expect to add operations often (an AST, a message type, a state), I use `variant` and `visit`. If the set of types is open (plug-ins, user-supplied implementations) or objects are long-lived and heavy, I use an abstract base class and virtual functions." Mention that `variant` is the modern replacement for many uses of the Visitor pattern.
:::

```quiz
? What does std::variant<int, string> guarantee?
- It holds both an int and a string
+ It holds exactly one of them at any time (and knows which)
- It holds a void*
> It is a type-safe union with a tag.
? What happens if a `visit` call forgets to handle one alternative?
- It crashes at run time
+ It fails to compile
- It handles it silently as null
> The visitor must be callable with every alternative type.
? Which makes adding a NEW OPERATION easiest?
- Virtual functions
+ variant + visit
> A new operation is one new function; no existing type is edited.
```

:::keypoints
- `std::variant<A, B, C>` is a type-safe union; query with `index()`, `holds_alternative`, `get_if`; process with `std::visit`.
- `overloaded{lambdas...}` makes visiting concise; missing cases are compile errors.
- Use variant for closed sets and easy new operations; use virtual functions for open sets and easy new types.
:::
