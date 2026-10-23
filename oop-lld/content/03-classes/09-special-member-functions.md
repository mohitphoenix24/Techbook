---
title: The special member functions
level: intermediate
time: 35
summary: The six functions the compiler may write for you, exactly when it generates or suppresses each one (with a program that shows it), initialisation and destruction order with bases and members, and a checklist for deciding Rule of 0, 3 or 5.
---

C++ has six **special member functions**. The compiler can generate them. Knowing the *exact* rules for when it does is a favourite interview topic.

| # | Function | Signature | Runs when |
|---|---|---|---|
| 1 | Default constructor | `T()` | `T t;` |
| 2 | Destructor | `~T()` | object dies |
| 3 | Copy constructor | `T(const T&)` | `T b = a;` |
| 4 | Copy assignment | `T& operator=(const T&)` | `b = a;` |
| 5 | Move constructor | `T(T&&)` | `T b = std::move(a);` |
| 6 | Move assignment | `T& operator=(T&&)` | `b = std::move(a);` |

## What does the compiler do for each case?

We can watch it work. `Loud` is a member that announces copies and moves. Each class below contains a `Loud`, so we see which operation the compiler really uses.

```cpp run title="Which special functions get generated?"
#include <iostream>
#include <utility>
using namespace std;

struct Loud {
    Loud() = default;
    Loud(const Loud&) { cout << "copy "; }
    Loud(Loud&&) noexcept { cout << "move "; }
    Loud& operator=(const Loud&) { cout << "copy= "; return *this; }
    Loud& operator=(Loud&&) noexcept { cout << "move= "; return *this; }
};

struct NothingDeclared { Loud m; };                                   // everything generated
struct HasDestructor   { Loud m; ~HasDestructor() {} };                // user destructor: NO move generated
struct HasCopyCtor     { Loud m; HasCopyCtor() = default; HasCopyCtor(const HasCopyCtor& o) : m(o.m) {} };   // NO move generated
struct HasMoveCtor     { Loud m; HasMoveCtor() = default; HasMoveCtor(HasMoveCtor&&) = default; };           // copy DELETED

template <class T> void test(const char* name) {
    cout << name << ":\n  construct from rvalue -> ";
    T a;
    T b(std::move(a));                      // asks for a move
    cout << "\n  assign from rvalue    -> ";
    T c;
    if constexpr (is_move_assignable_v<T>) c = std::move(a);
    cout << "\n";
    (void)b; (void)c;
}

int main() {
    test<NothingDeclared>("NothingDeclared");
    test<HasDestructor>("HasDestructor");
    test<HasCopyCtor>("HasCopyCtor");
    cout << boolalpha;
    cout << "HasMoveCtor copyable? " << is_copy_constructible_v<HasMoveCtor>
         << ", copy-assignable? " << is_copy_assignable_v<HasMoveCtor> << "\n";
}
```

Read the output carefully. In `HasDestructor` and `HasCopyCtor`, the request to move quietly became a **copy**: no move operations exist, and an rvalue can bind to `const T&`, so the copy constructor is used instead. No error, just a hidden slowdown. This is the reason for the Rule of Five.

## The rules, in one table

| You declare... | Default ctor | Destructor | Copy ctor | Copy assign | Move ctor | Move assign |
|---|---|---|---|---|---|---|
| **nothing** | generated | generated | generated | generated | generated | generated |
| any constructor | **not generated** | generated | generated | generated | generated | generated |
| destructor | generated | yours | generated (deprecated) | generated (deprecated) | **not generated** | **not generated** |
| copy ctor or copy assign | generated | generated | yours / generated | yours / generated | **not generated** | **not generated** |
| move ctor or move assign | generated | generated | **deleted** | **deleted** | yours | yours / not gen. |

Memorise the shape: *declaring a destructor or a copy operation switches off the moves; declaring a move operation switches off the copies.*

## Rule of 0 / 3 / 5: choosing

```text
Do I directly own a raw resource (raw new, FILE*, socket, handle)?
 ├─ No  → RULE OF ZERO: write none. Use string, vector, unique_ptr as members.
 └─ Yes → Wrap it. If you must write it yourself:
           ├─ Only copy is needed (no efficient move)   → RULE OF THREE
           └─ Move matters (it nearly always does)      → RULE OF FIVE
                (and mark moves noexcept; = delete anything you do not support)
```

## Order of construction and destruction

When an object has a base class and members, the order is fixed and worth memorising:

```cpp run title="Construction and destruction order"
#include <iostream>
using namespace std;

struct Part {
    const char* n;
    explicit Part(const char* name) : n(name) { cout << "  Part(" << n << ")\n"; }
    ~Part() { cout << "  ~Part(" << n << ")\n"; }
};
struct Base {
    Base()  { cout << "  Base()\n"; }
    ~Base() { cout << "  ~Base()\n"; }
};
struct Derived : Base {
    Part first{"first"};            // members are built in DECLARATION order...
    Part second{"second"};
    Derived()  { cout << "  Derived() body\n"; }
    ~Derived() { cout << "  ~Derived() body\n"; }
};

int main() {
    cout << "create:\n";
    {
        Derived d;
        cout << "alive\n";
    }
    cout << "gone\n";
}
```

**Construction:** base class first, then members in declaration order, then the constructor body.
**Destruction:** the exact reverse: the destructor body, then members in reverse order, then the base class.

## Temporaries and when they die

A temporary lives until the end of the **full expression** that created it (the `;`), unless bound to a const reference, which extends it.

```cpp run title="Lifetime of temporaries"
#include <iostream>
using namespace std;

struct T {
    int id;
    explicit T(int i) : id(i) { cout << "  +T" << id << "\n"; }
    ~T() { cout << "  -T" << id << "\n"; }
    int get() const { return id; }
};

int main() {
    cout << "statement 1:\n";
    int x = T(1).get() + T(2).get();          // both temporaries live until the ';'
    cout << "x = " << x << "\n";
    cout << "statement 2 (bound to const&):\n";
    const T& r = T(3);                         // lifetime extended to the end of main
    cout << "after statement 2\n";
    (void)r;
}
```

:::interview Which special member functions does the compiler generate for an empty class?
"The default constructor, destructor, copy constructor, copy assignment, move constructor and move assignment, all trivial and implicitly inline. If I write a destructor, the moves are no longer generated. If I write a move operation, the copies are deleted." Then draw the table.
:::

```quiz
? A class declares a destructor and nothing else. What happens on `T b = std::move(a);`?
- The move constructor is called
+ The copy constructor is called, because no move constructor was generated
- Compile error
> A user-declared destructor suppresses the implicit move operations; the rvalue binds to the copy constructor.
? In what order are the parts of a Derived object destroyed?
- Base, then members
+ Derived body, then members in reverse declaration order, then Base
- Members in declaration order, then Derived body
> Destruction is the exact reverse of construction.
? What happens to the copy constructor if you declare a move constructor?
- It is still generated
+ It is implicitly deleted
- It becomes private
> Declaring a move operation signals ownership transfer, so copies are deleted unless you define them.
```

:::keypoints
- Six special members; the compiler writes them according to strict rules. Destructor or copy declared → moves not generated. Move declared → copies deleted.
- A suppressed move silently becomes a copy: slow, not wrong.
- Construction: base → members (declaration order) → body. Destruction is the reverse.
- Aim for the Rule of Zero. If you own a raw resource, apply the Rule of Five.
:::
