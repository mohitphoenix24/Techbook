---
title: Concepts and constraints (C++20)
level: advanced
time: 25
summary: Saying what a template parameter must be able to do, with requires clauses and named concepts, the standard concepts, how concepts replace the interface idea at compile time, and better error messages.
---

A plain template accepts **any** type and fails deep inside with a wall of errors if the type lacks something. A **concept** states the requirements up front: "T must be comparable", "T must have `draw()`". It is a compile-time **interface**.

## The problem concepts solve

```cpp run expect-error title="Unconstrained templates give bad errors"
#include <iostream>
#include <string>
using namespace std;

struct Plain {};                        // has no operator<

template <typename T>
T smaller(T a, T b) { return (b < a) ? b : a; }

int main() {
    smaller(Plain{}, Plain{});     // the error points INSIDE the template body, not at this call
}
```

## Constraining a template

```cpp run title="requires, and the standard concepts"
#include <concepts>
#include <iostream>
#include <string>
using namespace std;

template <totally_ordered T>                          // the type must support <, >, ==, etc.
T smaller(T a, T b) { return (b < a) ? b : a; }

template <typename T>
    requires integral<T>                              // another spelling: a requires clause
T half(T x) { return x / 2; }

auto twice(integral auto x) { return x * 2; }         // shortest: a constrained auto parameter

int main() {
    cout << smaller(3, 2) << " " << smaller(string("b"), string("a")) << " " << half(9) << " " << twice(21) << "\n";
    // half(2.5);         // error: constraint 'integral<double>' not satisfied: a clear message
}
```

## Writing your own concept

A concept is a named list of requirements. The `requires` expression lists the **operations** a type must support.

```cpp run title="A Drawable concept"
#include <concepts>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

template <typename T>
concept Drawable = requires(const T& t) {
    { t.draw() } -> same_as<void>;                    // must have: void draw() const
    { t.name() } -> convertible_to<string>;           // must have: something convertible to string
};

struct Circle { void draw() const { cout << "O\n"; } string name() const { return "circle"; } };
struct Square { void draw() const { cout << "[]\n"; } const char* name() const { return "square"; } };
struct Rock   { };                                    // no draw(): NOT Drawable

template <Drawable D>
void render(const D& d) { cout << d.name() << ": "; d.draw(); }

int main() {
    render(Circle{});
    render(Square{});
    // render(Rock{});     // error: the required expression 't.draw()' is invalid: clear and short
    static_assert(Drawable<Circle> && !Drawable<Rock>);
}
```

Notice that `Circle` and `Square` have **no common base class**. A type "implements the interface" simply by having the right members. This is **structural typing** (compile-time duck typing), in contrast to `virtual` which is **nominal** (you must say `: public Shape`).

## Overloading with concepts

Constraints let you provide different implementations for different kinds of type.

```cpp run title="Choose an implementation by capability"
#include <concepts>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

template <typename T>
concept HasSize = requires(const T& t) { { t.size() } -> convertible_to<size_t>; };

template <HasSize C>
string info(const C& c) { return "container with " + to_string(c.size()) + " items"; }

template <integral I>
string info(I v) { return "integer " + to_string(v); }

int main() {
    cout << info(vector<int>{1, 2, 3}) << "\n" << info(string("hello")) << "\n" << info(42) << "\n";
}
```

## Concepts vs inheritance: when to use which

| | Inheritance + virtual | Concepts + templates |
|---|---|---|
| Binding | run time | compile time |
| Overhead | vptr, indirect call | none, can inline |
| Types need a common base? | yes | **no** |
| Heterogeneous container (`vector<Shape*>`) | yes, natural | no: one type per container |
| Add a new type | write a class deriving from the base | write a class with the right members |
| Errors | at link or run time if wrong | at compile time, with a clear message |

Use **concepts** for generic algorithms and performance-critical code where the type is known at compile time. Use **virtual** when different types must live together at run time.

:::interview What problem do concepts solve?
"Before C++20, template requirements were only implied by the template body, and a wrong type produced long errors from deep inside. Concepts make the requirements explicit in the signature, give short readable errors, and let you overload on capabilities. They are a compile-time interface: any type with the right operations satisfies them, with no inheritance."
:::

```quiz
? What is the main benefit of a concept on a template parameter?
- Faster compile
+ The requirements are stated in the signature and violations give clear errors
- It makes the function virtual
> It documents and checks what T must support, before the body is instantiated.
? Do two types that satisfy `Drawable` need a common base class?
- Yes
+ No, they just need the required operations
- Only if they are templates
> This is structural typing, unlike virtual inheritance.
```

:::keypoints
- A concept names a set of requirements on a type; use it as `template <Concept T>`, with `requires`, or `Concept auto`.
- Standard concepts: `integral`, `floating_point`, `totally_ordered`, `same_as`, `convertible_to`, `invocable`, ...
- Concepts are compile-time interfaces: no base class, no overhead, and good error messages.
:::
