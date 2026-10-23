---
title: Smart pointers: unique_ptr, shared_ptr and weak_ptr
level: intermediate
time: 40
summary: Replacing raw new and delete with RAII owners: unique_ptr for sole ownership, shared_ptr with reference counting, weak_ptr to observe without owning, make_unique and make_shared, custom deleters, and how to pass smart pointers to functions.
---

Raw `new`/`delete` is an invitation for leaks, double frees and dangling pointers. **Smart pointers** (from `<memory>`) are RAII classes that own a heap object and delete it for you at the right time. In modern C++ you should almost never write `delete`.

| Pointer | Ownership | Copyable? | Overhead | Typical use |
|---|---|---|---|---|
| `unique_ptr<T>` | **sole** owner | no (move only) | none (same size as a raw pointer) | default choice |
| `shared_ptr<T>` | **shared** among many | yes | control block + atomic reference count | genuinely shared lifetime |
| `weak_ptr<T>` | **none**: observes a shared object | yes | small | break cycles, caches, observers |
| raw `T*` / `T&` | **none**: just uses | yes | none | non-owning access |

## unique_ptr: one owner, automatic cleanup

```cpp run title="unique_ptr basics"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Report {
    string title;
    explicit Report(string t) : title(move(t)) { cout << "  Report(" << title << ") created\n"; }
    ~Report() { cout << "  Report(" << title << ") destroyed\n"; }
    void print() const { cout << "  printing " << title << "\n"; }
};

int main() {
    cout << "scope 1\n";
    {
        auto r = make_unique<Report>("Q1");       // preferred way to create
        r->print();
    }                                              // destroyed here, automatically

    cout << "transfer ownership\n";
    auto a = make_unique<Report>("Q2");
    // auto b = a;                                  // error: a unique_ptr cannot be copied
    auto b = move(a);                               // ownership moves from a to b
    cout << "  a is " << (a ? "valid" : "empty") << ", b is " << (b ? "valid" : "empty") << "\n";

    cout << "reset and release\n";
    b.reset(new Report("Q3"));                      // destroys Q2, takes ownership of Q3
    Report* raw = b.release();                      // gives up ownership WITHOUT deleting
    delete raw;                                     // now it is our job (shown only to explain release)
    cout << "end\n";
}
```

Facts:

- `make_unique<T>(args...)` constructs the object in place. Prefer it to `unique_ptr<T>(new T(...))` (it is exception-safe and shorter).
- `->` and `*` work like a raw pointer. `get()` returns the raw pointer **without** giving up ownership. Use it only to call APIs that need a raw pointer.
- A `unique_ptr` is the same size as a raw pointer and has no overhead. It is a *zero-cost abstraction*.

### Returning and passing unique_ptr

```cpp run title="Factories return unique_ptr; callers choose how to use it"
#include <iostream>
#include <memory>
using namespace std;

struct Widget { int id; explicit Widget(int i) : id(i) {} };

unique_ptr<Widget> makeWidget(int id) { return make_unique<Widget>(id); }   // ownership goes to the caller

void inspect(const Widget& w)        { cout << "inspect " << w.id << "\n"; }       // just uses it: take a reference
void consume(unique_ptr<Widget> w)   { cout << "consumed " << w->id << "\n"; }     // takes ownership: by value
void maybe(const Widget* w)          { cout << (w ? "has widget\n" : "no widget\n"); }   // optional use: raw pointer

int main() {
    auto w = makeWidget(7);
    inspect(*w);                  // lend it
    maybe(w.get());
    consume(move(w));             // hand it over; w is now empty
    maybe(w.get());
}
```

A function that **only uses** an object should take `const T&` (or `T*` when it may be absent), *not* a smart pointer. A function that **takes ownership** takes `unique_ptr<T>` by value. This keeps ownership visible in the signature.

## Custom deleters: not only memory

`unique_ptr` can release any resource, by giving it a deleter.

```cpp run title="A unique_ptr that closes a FILE*"
#include <cstdio>
#include <iostream>
#include <memory>
using namespace std;

struct FileCloser {
    void operator()(FILE* f) const { if (f) { fclose(f); cout << "file closed\n"; } }
};

int main() {
    unique_ptr<FILE, FileCloser> f(fopen("/tmp/ooplab_sp.txt", "w"));
    if (!f) return 1;
    fputs("hello", f.get());
    cout << "file written\n";
}                                    // the deleter runs: fclose is guaranteed
```

## shared_ptr: shared ownership with a reference count

A `shared_ptr` keeps a **reference count** in a small control block. Copying increments it; destroying a copy decrements it. The object is deleted when the count reaches zero.

```cpp run title="Reference counting in action"
#include <iostream>
#include <memory>
using namespace std;

struct Resource {
    Resource()  { cout << "  Resource created\n"; }
    ~Resource() { cout << "  Resource destroyed\n"; }
};

int main() {
    shared_ptr<Resource> a = make_shared<Resource>();     // count = 1
    cout << "count = " << a.use_count() << "\n";
    {
        shared_ptr<Resource> b = a;                         // count = 2
        auto c = a;                                         // count = 3
        cout << "count = " << a.use_count() << "\n";
    }                                                       // b and c die: count = 1
    cout << "count = " << a.use_count() << "\n";
    a.reset();                                              // count = 0: the Resource is destroyed NOW
    cout << "after reset\n";
}
```

`make_shared<T>()` allocates the object and the control block in **one** allocation: faster, and exception-safe. Always prefer it.

:::warn Never create two shared_ptr owners from one raw pointer
```cpp
Widget* raw = new Widget;
shared_ptr<Widget> a(raw);
shared_ptr<Widget> b(raw);     // WRONG: two separate control blocks, double delete
```
Create the first with `make_shared`, and make further owners by **copying** the `shared_ptr`.
:::

:::tip Default to unique_ptr
A `unique_ptr` can always be converted to a `shared_ptr` later (`shared_ptr<T> s = move(u);`). Start with sole ownership and widen only if a design truly needs shared lifetime. `shared_ptr` costs an atomic increment/decrement on every copy, and makes ownership harder to reason about.
:::

## weak_ptr: observing without owning

A `weak_ptr` points to a `shared_ptr`-managed object **without** increasing the count. Before use you call `lock()`, which returns a `shared_ptr` if the object is still alive, or empty if it is gone. Its two jobs: **breaking cycles** (next lesson) and **safe observers/caches**.

```cpp run title="weak_ptr knows whether the object is still alive"
#include <iostream>
#include <memory>
using namespace std;

int main() {
    weak_ptr<int> observer;
    {
        auto owner = make_shared<int>(42);
        observer = owner;                                   // no ownership, count stays 1
        cout << "inside: expired? " << boolalpha << observer.expired() << ", use_count=" << owner.use_count() << "\n";
        if (auto sp = observer.lock()) cout << "value via weak_ptr: " << *sp << "\n";   // temporarily owns it
    }
    cout << "outside: expired? " << observer.expired() << "\n";
    if (auto sp = observer.lock()) cout << "still alive\n"; else cout << "object is gone, lock() returned empty\n";
}
```

## Which pointer should this member be?

```text
Does this class OWN the object (is responsible for its lifetime)?
 ├─ Yes, and nobody else shares it     → unique_ptr<T>  (or just a T member, if no polymorphism and size is known)
 ├─ Yes, shared with others            → shared_ptr<T>
 └─ No, it only refers to it
      ├─ always valid while I live     → T& or T*  (a reference/raw pointer is fine as an observer)
      └─ may die before me             → weak_ptr<T>
```

:::interview unique_ptr vs shared_ptr vs raw pointer
"`unique_ptr` is sole ownership, move-only, no overhead. `shared_ptr` is shared ownership via an atomic reference count; the last owner deletes. `weak_ptr` observes a shared object without owning it, and breaks reference cycles. A raw pointer or reference is a non-owning view, which is fine as long as the owner outlives it. I default to `unique_ptr`, and I never call `new` or `delete` directly."
:::

```quiz
? Why can't you copy a unique_ptr?
- It would be slow
+ It represents sole ownership; copying would give two owners and a double delete
- It has no copy constructor by accident
> Only move transfers ownership, which keeps exactly one owner.
? What does `make_shared<T>()` do better than `shared_ptr<T>(new T)`?
- Nothing
+ One allocation for object and control block, and it is exception-safe
- It avoids reference counting
> Fewer allocations and no leak if another argument's evaluation throws.
? When is `weak_ptr::lock()` empty?
- Never
+ When the object has already been destroyed (the strong count reached zero)
- When the weak count is zero
> lock() succeeds only while at least one shared_ptr owner is alive.
```

:::keypoints
- `unique_ptr` is the default owner; `shared_ptr` only for truly shared lifetime; `weak_ptr` to observe or break cycles.
- Create with `make_unique` / `make_shared`; never two `shared_ptr` from one raw pointer.
- Functions that only use an object take `T&` / `const T&`; functions that take ownership take `unique_ptr<T>` by value.
- Custom deleters make smart pointers manage files, sockets and handles too.
:::
