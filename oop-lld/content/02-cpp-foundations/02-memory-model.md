---
title: Memory: stack, heap, pointers and lifetime
level: easy
time: 30
summary: Where objects live (stack, heap, static storage), what a pointer is, new and delete, dangling pointers and leaks, array vs pointer, padding and alignment: the memory picture that every later OOP rule depends on.
---

Almost every confusing C++ rule (destructors, copy constructors, smart pointers, virtual functions) comes from one thing: **where an object lives and how long it lives**. Learn this picture once.

## The three places an object can live

| Region | Lives until | Created by | Speed | Size |
|---|---|---|---|---|
| **Stack** | the end of the enclosing `{ }` block | local variables | very fast | small (about 1 to 8 MB) |
| **Heap** (free store) | you free it (`delete`), or a smart pointer does | `new`, `make_unique` | slower | large |
| **Static** | the whole program | globals, `static` variables | n/a | fixed at compile time |

```text
  high addresses
  ┌───────────────────────┐
  │ Stack                 │  ← grows downward: main()'s locals, then each call's locals
  │  (function frames)    │
  ├───────────────────────┤
  │          ↓ free ↑     │
  ├───────────────────────┤
  │ Heap                  │  ← grows upward: new, make_unique, vector's buffer
  ├───────────────────────┤
  │ Static / global data  │  ← globals, static members
  ├───────────────────────┤
  │ Code (text)           │  ← your compiled functions
  └───────────────────────┘
  low addresses
```

:::analogy Think of it like this
The **stack** is a pile of plates: you add one when a function starts and take it off when it ends, strictly last in, first out. The **heap** is a big warehouse: you can rent space for as long as you like, but you must remember to give it back.
:::

## Lifetime on the stack: the destructor runs at the closing brace

```cpp run title="Objects die at the end of their scope, in reverse order"
#include <iostream>
#include <string>
using namespace std;

struct Noisy {
    string name;
    explicit Noisy(string n) : name(move(n)) { cout << "  create " << name << "\n"; }
    ~Noisy()                                 { cout << "  destroy " << name << "\n"; }
};

int main() {
    cout << "start\n";
    Noisy a("a");
    {
        cout << "inner block\n";
        Noisy b("b");
        Noisy c("c");
    }                                   // c is destroyed first, then b
    cout << "end\n";
}                                       // a is destroyed here
```

Remember this output. **Objects are destroyed in the reverse order of creation.** This single rule explains RAII, scope guards, locks and smart pointers.

## Pointers

A **pointer** is a variable that stores the *address* of another object. A **reference** is another name for an existing object (next lesson).

```cpp run title="Pointer basics"
#include <iostream>
using namespace std;

int main() {
    int x = 10;
    int* p = &x;                    // p holds the address of x
    cout << "*p = " << *p << "\n";  // * follows the pointer to the value
    *p = 25;                        // changes x
    cout << "x  = " << x << "\n";

    int* none = nullptr;            // points to nothing: ALWAYS use nullptr, not 0 or NULL
    if (!none) cout << "none is null\n";

    int arr[3] = {5, 6, 7};
    int* q = arr;                   // an array name decays to a pointer to its first element
    cout << *(q + 2) << " " << q[1] << "\n";   // pointer arithmetic: q + 2 is arr[2]
}
```

## The heap: new and delete

```cpp run title="new and delete, done by hand"
#include <iostream>
using namespace std;

int main() {
    int* p = new int(42);           // allocate one int on the heap
    cout << *p << "\n";
    delete p;                       // give it back. Exactly once.
    p = nullptr;                    // so that a later "if (p)" is safe

    int* arr = new int[4]{1, 2, 3, 4};   // an array of 4 ints
    cout << arr[0] + arr[3] << "\n";
    delete[] arr;                   // arrays need delete[], not delete
}
```

:::warn The four classic heap bugs
1. **Leak**: `new` without `delete`. The memory is never returned.
2. **Double free**: `delete p;` twice on the same pointer. Crash or corruption.
3. **Dangling pointer**: using a pointer after the object is gone.
4. **Mismatch**: `new[]` freed with `delete`, or `malloc` freed with `delete`. Undefined behaviour.

Modern C++ avoids all four by never writing `new` and `delete` in application code. Smart pointers and containers do it for you. That is the **RAII** idea of the destructor lesson.
:::

## A dangling pointer

The next program is **wrong on purpose** (so it is not a Run block). It returns a pointer to a local variable.

```cpp title="Dangling pointer: do not do this"
int* makeNumber() {
    int local = 99;
    return &local;               // local dies when the function returns
}

int main() {
    int* p = makeNumber();
    return *p;                   // undefined behaviour: reads a dead variable
}
```

The compiler even warns: `address of local variable 'local' returned`. At run time the result is *undefined*: it might read 99, read garbage, or crash. Undefined behaviour is the worst kind of bug, because it can pass every test and fail in production. If you compile with `-fsanitize=address`, the tool stops the program and says `stack-use-after-return`, which is how we catch such bugs. The fix: return by value (`int`), or return a heap object owned by a smart pointer.

## Size, padding and alignment

The compiler adds invisible **padding** bytes so that each member sits at an address that suits the CPU. Member order therefore affects the size of a class.

```cpp run title="Padding makes some structs bigger"
#include <iostream>
using namespace std;

struct Bad  { char a; double b; char c; };    // a, 7 padding, b, c, 7 padding
struct Good { double b; char a; char c; };    // b, a, c, 6 padding
struct Empty {};                              // an object must have an address: size 1

int main() {
    cout << "sizeof(Bad)   = " << sizeof(Bad)   << "  alignof = " << alignof(Bad)   << "\n";
    cout << "sizeof(Good)  = " << sizeof(Good)  << "\n";
    cout << "sizeof(Empty) = " << sizeof(Empty) << "\n";
}
```

:::interview Why is sizeof(Empty) 1, not 0?
Every object needs a unique address, so two empty objects cannot share one. (An empty **base class** can be optimised to take no space: the "empty base optimisation".)
:::

## Stack or heap for my object?

```cpp run title="Same class, two places"
#include <iostream>
#include <memory>
using namespace std;

struct Point { int x, y; };

int main() {
    Point a{1, 2};                          // on the stack: simple, fast, automatic cleanup
    auto b = make_unique<Point>(3, 4);      // on the heap, owned by a smart pointer
    cout << a.x + a.y << " " << b->x + b->y << "\n";
}                                           // a is popped, b's destructor frees the heap memory
```

Default to the **stack**. Use the heap when the object must outlive the function, when its size is only known at run time, or when you need polymorphism through a base pointer.

```quiz
? In what order are local objects destroyed?
- In the order they were created
+ In the reverse order of creation
- In random order
> Like a stack of plates: the last one placed is the first one removed.
? What does `delete[]` match?
- `new`
+ `new[]`
- `malloc`
> Always pair `new` with `delete`, `new[]` with `delete[]`, and `malloc` with `free`.
? `int* p = makeNumber();` where makeNumber returns the address of one of its locals. This is...
- fine
+ undefined behaviour (dangling pointer)
- a compile error
> The local variable is destroyed when the function returns. The pointer now refers to dead memory.
```

:::keypoints
- Stack objects die at the closing brace, in reverse order. Heap objects live until freed.
- A pointer holds an address; use `nullptr` for "nothing".
- Leak, double free, dangling pointer and `new[]`/`delete` mismatch are the classic memory bugs. Smart pointers prevent them.
- Padding can make a struct bigger than the sum of its members; order members from large to small.
:::
