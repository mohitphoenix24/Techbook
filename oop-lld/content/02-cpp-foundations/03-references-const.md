---
title: References, const and value categories
level: easy
time: 30
summary: References as aliases, the three kinds of const pointers, const correctness, why a const reference can bind to a temporary, lvalues and rvalues (the base for move semantics), and the danger of returning references.
---

## A reference is another name

A **reference** is an alias for an existing object. It is not a new object and it cannot be null. It must be bound when it is created, and it can never be re-bound to something else.

```cpp run title="References are aliases"
#include <iostream>
using namespace std;

int main() {
    int x = 10;
    int& r = x;               // r IS x (another name)
    r = 20;
    cout << "x = " << x << "\n";

    int y = 99;
    r = y;                    // NOT re-binding! It copies y's value INTO x.
    cout << "x = " << x << ", y = " << y << "\n";

    cout << boolalpha << (&r == &x) << "\n";   // same address: same object
}
```

| | Pointer | Reference |
|---|---|---|
| Can be null | yes | no |
| Can change what it refers to | yes | no |
| Must be initialised | no | yes |
| Syntax to use | `*p`, `p->m` | just `r`, `r.m` |
| Typical use | optional, owning, arrays, C APIs | parameters, return values, aliases |

## const: promises the compiler checks

```cpp run title="Three flavours of const with pointers"
#include <iostream>
using namespace std;

int main() {
    int a = 1, b = 2;

    const int* p1 = &a;       // pointer to const int: cannot change *p1, CAN re-point p1
    p1 = &b;
    // *p1 = 5;               // error

    int* const p2 = &a;       // const pointer to int: CAN change *p2, cannot re-point p2
    *p2 = 5;
    // p2 = &b;               // error

    const int* const p3 = &a; // neither
    cout << *p1 << " " << *p2 << " " << *p3 << "\n";
}
```

Read declarations **right to left**: `const int* p` is "p is a pointer to an int that is const". `int* const p` is "p is a const pointer to an int".

:::def const correctness
Marking everything that should not change as `const`: parameters you only read, member functions that do not modify the object, and variables that are set once. The compiler then enforces your promises, and your code can be used with `const` objects.
:::

## const and classes

```cpp run title="A const object can only call const member functions"
#include <iostream>
using namespace std;

class Counter {
    int n_ = 0;
public:
    void increment() { ++n_; }               // changes the object: NOT const
    int value() const { return n_; }         // promises not to change it
};

void show(const Counter& c) {                // we only read it, so take const&
    cout << "value = " << c.value() << "\n";
    // c.increment();                        // error: c is const
}

int main() {
    Counter c;
    c.increment();
    c.increment();
    show(c);
}
```

If `value()` were not marked `const`, then `show(const Counter&)` could not call it, and the whole program would fail to compile. That is why *every getter must be `const`*. It is the number-one "small" mistake interviewers notice in class design.

## A const reference can bind to a temporary

```cpp run title="const& extends the life of a temporary"
#include <iostream>
#include <string>
using namespace std;

string make() { return "temporary"; }

int main() {
    const string& r = make();       // the temporary lives as long as r does
    cout << r << "\n";
    // string& bad = make();        // error: a non-const reference cannot bind to a temporary
}
```

This is why `void f(const std::string&)` accepts `f("hello")` and `f(name + "x")` while `void f(std::string&)` does not.

## lvalues and rvalues: the idea behind move semantics

- An **lvalue** has a name and an address: `x`, `v[0]`, `*p`. You can take `&x`.
- An **rvalue** is a temporary without a name: `5`, `a + b`, `make()`. It is about to disappear.

```cpp run title="Overloading on lvalue vs rvalue"
#include <iostream>
#include <string>
using namespace std;

void take(const string& s) { cout << "lvalue overload: " << s << "\n"; }
void take(string&& s)      { cout << "rvalue overload: " << s << "\n"; }   // s binds to temporaries

int main() {
    string a = "named";
    take(a);                       // a has a name: lvalue
    take(string("temp"));          // temporary: rvalue
    take(a + "!");                 // result of +: rvalue
    take(move(a));                 // std::move casts a to an rvalue (it does NOT move anything by itself)
}
```

An rvalue reference `T&&` says: "this object is about to be destroyed, so you may steal its insides instead of copying". That is the whole idea of **move semantics** (module 3). For now just remember the table:

| Expression | Value category | Binds to `T&` | Binds to `const T&` | Binds to `T&&` |
|---|---|---|---|---|
| `x` (a variable) | lvalue | yes | yes | no |
| `5`, `f()`, `a+b` | rvalue | no | yes | yes |
| `std::move(x)` | rvalue | no | yes | yes |

## Returning references: a classic trap

```cpp run title="Returning a reference to a member is fine; to a local is not"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

class Team {
    vector<string> names_{"asha", "ravi", "meera"};
public:
    const string& first() const { return names_.front(); }   // OK: the member outlives the call
    string& at(size_t i)        { return names_.at(i); }      // OK, lets the caller modify
    // const string& bad() { string s = "x"; return s; }       // DANGLING: s dies at the }
};

int main() {
    Team t;
    t.at(1) = "rahul";                       // modifies through the returned reference
    cout << t.first() << " " << t.at(1) << "\n";
}
```

**Rule:** never return a reference or pointer to a local variable or to a temporary. A reference to a *member* is fine as long as the object itself is still alive when the caller uses it.

```quiz
? What does `const int* const p` mean?
- p can be re-pointed, *p can be changed
+ Neither p nor *p can be changed
- Only p cannot be changed
> The first const protects the int, the second protects the pointer itself.
? Why must a getter be marked `const`?
- It makes the program faster
+ Otherwise it cannot be called on a const object or through a const reference
- It is required for virtual functions
> A const object only allows const member functions. Missing const makes your class hard to use.
? Which can bind to a temporary like `std::string("x")`?
- `std::string&`
+ `const std::string&` and `std::string&&`
- Neither
> Non-const lvalue references cannot bind to temporaries.
```

:::interview Pointer vs reference
Say: "A reference is a non-null alias bound once; a pointer can be null and re-pointed. I use references for parameters that must exist, and pointers (or `std::optional`, or smart pointers) when absence or ownership matters." Then mention `const T&` for read-only parameters.
:::

:::keypoints
- A reference is an alias: no null, no re-binding. A pointer can be null and re-pointed.
- Read const from right to left. Mark getters `const` and pass big read-only parameters as `const T&`.
- `const T&` can bind to temporaries; `T&&` binds only to rvalues and is the basis of move semantics.
- Never return a reference or pointer to a local variable.
:::
