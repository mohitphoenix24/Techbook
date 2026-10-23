---
title: Object slicing and C++ casts
level: intermediate
time: 35
summary: How copying a derived object into a base object loses data (slicing) and kills polymorphism, how to avoid it, and the four C++ casts (static, dynamic, const, reinterpret), with dynamic_cast and RTTI, and why a lot of dynamic_cast is a design smell.
---

## Object slicing

If you assign or pass a derived object **by value** into a base-class variable, only the base part is copied. The derived data is **sliced off**, and the object is *really* a base object now, so virtual functions go to the base version.

```cpp run title="Slicing: the derived part is cut off"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Animal {
    string name = "animal";
    virtual ~Animal() = default;
    virtual string speak() const { return "..."; }
};
struct Dog : Animal {
    string trick = "roll over";
    Dog() { name = "dog"; }
    string speak() const override { return "Woof"; }
};

void byValue(Animal a)       { cout << "byValue    : " << a.name << " says " << a.speak() << "\n"; }
void byReference(const Animal& a) { cout << "byReference: " << a.name << " says " << a.speak() << "\n"; }

int main() {
    Dog d;
    byValue(d);                       // SLICED: copy-constructs an Animal from the Animal part of d
    byReference(d);                   // no copy: virtual dispatch still works

    vector<Animal> bad;               // a vector of Animal VALUES
    bad.push_back(d);                 // sliced when stored
    cout << "vector<Animal>: " << bad[0].speak() << "\n";
}
```

The slicing is silent: no warning, no error. This is why polymorphic objects must be passed and stored by **reference or pointer**.

How to avoid it:

1. Pass by `const Base&` or `Base&`, never by value.
2. Store polymorphic objects in containers as `vector<unique_ptr<Base>>` (or `shared_ptr`).
3. Make the base class non-copyable (delete copy/move, expose `clone()`), so slicing becomes a **compile error**.

```cpp run expect-error title="Deleting the base's copy operations turns slicing into an error"
#include <iostream>
using namespace std;

struct Shape {
    Shape() = default;
    Shape(const Shape&) = delete;
    Shape& operator=(const Shape&) = delete;
    virtual ~Shape() = default;
};
struct Circle : Shape {};

void take(Shape s) {}                  // pass by value

int main() {
    Circle c;
    take(c);                           // error: use of deleted function: slicing is rejected
}
```

## The four C++ casts

| Cast | What it does | Checked | Typical use |
|---|---|---|---|
| `static_cast<T>(x)` | well-defined conversions: numeric, up/down the hierarchy | compile time | `int`↔`double`, `Base*`→`Derived*` when you are *sure* |
| `dynamic_cast<T>(x)` | safe down-cast using RTTI | **run time** | `Base*`→`Derived*` when you are *not sure* |
| `const_cast<T>(x)` | adds or removes `const` | compile time | calling an old API that forgot const |
| `reinterpret_cast<T>(x)` | reinterpret raw bits | none | low-level code only |

The old **C-style cast** `(T)x` tries several of these in turn, silently, and can do a `reinterpret_cast` by accident. Avoid it.

```cpp run title="static_cast for conversions"
#include <iostream>
using namespace std;

int main() {
    int total = 7, count = 2;
    double avg = static_cast<double>(total) / count;    // without the cast: integer division gives 3
    cout << avg << " vs " << total / count << "\n";

    double pi = 3.99;
    int whole = static_cast<int>(pi);                   // truncates toward zero, visible and intentional
    cout << whole << "\n";
}
```

## dynamic_cast: ask "what are you really?"

`dynamic_cast` checks the real type at run time. For **pointers** it returns `nullptr` on failure; for **references** it throws `std::bad_cast`. The base must be polymorphic.

```cpp run title="dynamic_cast for safe down-casting"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

struct Shape { virtual ~Shape() = default; };
struct Circle : Shape { double r = 2; double radius() const { return r; } };
struct Square : Shape { double s = 3; };

int main() {
    vector<unique_ptr<Shape>> shapes;
    shapes.push_back(make_unique<Circle>());
    shapes.push_back(make_unique<Square>());

    for (const auto& s : shapes) {
        if (auto* c = dynamic_cast<Circle*>(s.get()))      // succeeds only for a real Circle
            cout << "circle with radius " << c->radius() << "\n";
        else
            cout << "not a circle\n";
    }

    Shape& ref = *shapes[1];
    try { (void)dynamic_cast<Circle&>(ref); }              // reference form throws on failure
    catch (const bad_cast&) { cout << "bad_cast thrown\n"; }
}
```

`static_cast<Derived*>(basePtr)` compiles too, but if the object is *not* a `Derived` you get undefined behaviour with no check. Use `dynamic_cast` when unsure, `static_cast` only when your design *guarantees* the type.

:::warn dynamic_cast is often a design smell
A chain of `if (dynamic_cast<A*>) ... else if (dynamic_cast<B*>)` means the base interface is missing a virtual function, and you are doing "switch on type" by hand. Add the virtual function, or use the **Visitor** pattern or `std::variant` (module 5). Use `dynamic_cast` for the rare genuine case, such as querying an optional capability.
:::

## const_cast and reinterpret_cast

```cpp run title="const_cast and reinterpret_cast (rarely needed)"
#include <cstdint>
#include <iostream>
using namespace std;

void legacyPrint(char* s) { cout << s << "\n"; }       // old C-style API that forgot const

int main() {
    const char* msg = "hello";
    legacyPrint(const_cast<char*>(msg));               // OK only because legacyPrint never writes to it
    // Writing through a pointer that was const_cast from a REAL const object is undefined behaviour.

    int x = 0x01020304;
    auto* bytes = reinterpret_cast<unsigned char*>(&x);          // look at the bytes of an int
    cout << "first byte: " << static_cast<int>(bytes[0]) << " (little-endian machine prints 4)\n";
}
```

:::interview static_cast vs dynamic_cast?
"`static_cast` is resolved at compile time and does no runtime check, so a wrong down-cast is undefined behaviour. `dynamic_cast` uses RTTI to verify the real type: it returns null for pointers and throws `bad_cast` for references. It needs a polymorphic base and has a small cost. I prefer designing so that casts are unnecessary."
:::

```quiz
? What is object slicing?
- Splitting a vector
+ Copying a derived object into a base object by value, losing the derived part and virtual behaviour
- A kind of dynamic_cast
> Only the base sub-object is copied, and the result is a plain base object.
? What does `dynamic_cast<Derived*>(basePtr)` return if the object is not a Derived?
- Garbage
+ nullptr
- It throws
> The pointer form returns null; the reference form throws std::bad_cast.
? Which cast should you NOT use for general conversions because it can silently do something dangerous?
- static_cast
+ C-style cast `(T)x`
- dynamic_cast
> It may behave like reinterpret_cast or drop const without telling you.
```

:::keypoints
- Slicing happens when a derived object is copied into a base **value**; pass and store polymorphic objects by reference, pointer or smart pointer.
- `static_cast` for well-defined conversions, `dynamic_cast` for checked down-casts, `const_cast` and `reinterpret_cast` rarely.
- Many `dynamic_cast`s signal a missing virtual function or a case for Visitor/variant.
:::
