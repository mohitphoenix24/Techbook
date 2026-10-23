---
title: Copying objects: copy constructor, assignment and the Rule of Three
level: intermediate
time: 40
summary: When copies happen, what the compiler-generated copy does, why a shallow copy of a pointer member causes double frees, writing a correct deep copy, copy assignment and self-assignment, and deleting copy for unique resources.
---

C++ classes have **value semantics** by default: `b = a` copies. That is powerful, but when a class owns a resource the default copy is wrong. This lesson shows exactly how, and how to fix it.

## When are copies made?

```cpp run title="A class that reports every copy"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Tracer {
    string name;
    explicit Tracer(string n) : name(move(n)) { cout << "  ctor      " << name << "\n"; }
    Tracer(const Tracer& o) : name(o.name + "'") { cout << "  COPY ctor " << name << "\n"; }
    Tracer& operator=(const Tracer& o) { name = o.name + "="; cout << "  COPY assign " << name << "\n"; return *this; }
    ~Tracer() { cout << "  dtor      " << name << "\n"; }
};

void byValue(Tracer t) { cout << "  in byValue: " << t.name << "\n"; }
void byRef(const Tracer& t) { cout << "  in byRef: " << t.name << "\n"; }

int main() {
    cout << "1. initialise from another\n";   Tracer a("a");  Tracer b = a;
    cout << "2. assign\n";                    Tracer c("c");  c = a;
    cout << "3. pass by value\n";             byValue(a);
    cout << "4. pass by const&\n";            byRef(a);
    cout << "5. push_back an lvalue\n";       { vector<Tracer> v; v.reserve(1); v.push_back(a); }
    cout << "end\n";
}
```

Copies occur on: initialising from another object, assignment, **passing by value**, and putting an lvalue into a container. Passing by `const&` makes none. That is why you take big objects by `const&`.

## The compiler's default copy is member-wise ("shallow")

For each member, the default copy constructor copies the member. For an `int` or a `string` that is exactly right. But for a **raw pointer** it copies the *address*, so two objects now point to the **same** memory.

```cpp title="The classic bug (display only: it crashes)"
class Buffer {
    int* data_;
public:
    Buffer(size_t n) : data_(new int[n]) {}
    ~Buffer() { delete[] data_; }
    // no copy constructor written: the compiler's version copies the POINTER
};

int main() {
    Buffer a(10);
    Buffer b = a;          // b.data_ == a.data_ : both point to the same array
}                          // ~b deletes the array, then ~a deletes it AGAIN: double free, crash
```

```text
    a.data_ ──┐
              ├──►  [ the one array ]      ← shallow copy: two owners, one array
    b.data_ ──┘

    a.data_ ───►  [ array 1 ]              ← deep copy: each object owns its own array
    b.data_ ───►  [ array 2 ]
```

Run under AddressSanitizer this program reports `attempting double-free`. The fix is a **deep copy**: allocate new memory and copy the contents.

## The Rule of Three

:::def Rule of Three
If a class needs a **user-written destructor**, a **copy constructor**, or a **copy assignment operator**, it almost certainly needs **all three**. The reason is the same for all of them: the class owns a resource, so the default member-wise behaviour is wrong.
:::

```cpp run title="A correct deep-copying Buffer (Rule of Three)"
#include <algorithm>
#include <iostream>
using namespace std;

class Buffer {
    int* data_;
    size_t size_;
public:
    explicit Buffer(size_t n) : data_(new int[n]{}), size_(n) {}

    ~Buffer() { delete[] data_; }                                   // 1. destructor

    Buffer(const Buffer& o) : data_(new int[o.size_]), size_(o.size_) {   // 2. copy constructor: DEEP copy
        copy(o.data_, o.data_ + size_, data_);
    }

    Buffer& operator=(const Buffer& o) {                            // 3. copy assignment
        if (this == &o) return *this;                               //    self-assignment guard
        int* fresh = new int[o.size_];                              //    allocate first, so a failure leaves *this untouched
        copy(o.data_, o.data_ + o.size_, fresh);
        delete[] data_;
        data_ = fresh;
        size_ = o.size_;
        return *this;
    }

    int& operator[](size_t i) { return data_[i]; }
    int operator[](size_t i) const { return data_[i]; }
    size_t size() const { return size_; }
};

int main() {
    Buffer a(3);
    a[0] = 1; a[1] = 2; a[2] = 3;

    Buffer b = a;                // copy constructor
    b[0] = 99;                   // changes only b's own array
    cout << "a[0]=" << a[0] << " b[0]=" << b[0] << "\n";

    Buffer c(1);
    c = a;                       // copy assignment (frees c's old array first)
    a = a;                       // self-assignment is safe
    cout << "c.size=" << c.size() << " c[2]=" << c[2] << "\n";
}                                // three destructors, three separate arrays: no double free
```

Why the details matter:

- **Self-assignment guard** (`this == &o`): without it, `a = a` would delete the data and then copy from the deleted data.
- **Allocate before you delete** keeps the object valid if `new` throws (the "strong guarantee"). The even cleaner way is *copy-and-swap*, shown in module 7.
- Return `*this` by reference so that `a = b = c` works.

## Copy constructor vs copy assignment

| | Copy constructor | Copy assignment |
|---|---|---|
| Called when | a **new** object is created from an existing one | an **existing** object gets a new value |
| Looks like | `Buffer b = a;`  `Buffer b(a);`  passing by value | `b = a;` |
| Old resources to free? | no, the object is brand new | yes, free the old ones first |
| Self-assignment problem? | no | yes |

A classic trap: `Buffer b = a;` is a **copy constructor** even though it contains `=`.

## Forbidding copies

Some objects must never be copied: a mutex, a file handle, a unique connection, a thread. Delete the copy operations. The compiler then rejects any attempt.

```cpp run expect-error title="= delete makes copying a compile error"
#include <iostream>
using namespace std;

class Connection {
public:
    Connection() = default;
    Connection(const Connection&) = delete;
    Connection& operator=(const Connection&) = delete;
};

int main() {
    Connection a;
    Connection b = a;      // error: use of deleted function
}
```

(You can still make such a type **movable**: that is the next lesson.)

## Use the standard library instead

Most of the time you should not write any of this. A `std::vector<int>` or `std::string` member copies itself correctly. Write the Rule of Three only when you directly own a raw resource. Better still, wrap the resource in a class that does it once, and then follow the **Rule of Zero** (lesson 9).

:::interview What is the difference between shallow and deep copy?
"A shallow copy duplicates the pointer, so two objects share one resource, leading to double free and aliasing bugs. A deep copy allocates a separate resource and copies the contents, so each object owns its own. The compiler's default copy is shallow for raw pointers, so a class that owns a raw pointer must define the copy constructor, copy assignment and destructor: the Rule of Three."
:::

```quiz
? When is the copy constructor (not assignment) called?
- `b = a;` where b already exists
+ `Buffer b = a;` and when passing an object by value
- When an object is destroyed
> A new object is being created from an existing one. Assignment is for an existing object.
? Why do we write `if (this == &o) return *this;` in copy assignment?
- To make it faster
+ So that self-assignment does not free the data we are about to copy from
- It is required by the standard
> `a = a` would delete the array and then copy from deleted memory without the guard.
? A class has a user-written destructor that calls delete[]. What else should you write?
- Nothing
+ Copy constructor and copy assignment (or delete them)
- A static member
> This is the Rule of Three: the default copies would copy the pointer and cause a double free.
```

:::keypoints
- Copies happen on initialisation from another object, assignment, pass-by-value, and container insertion of lvalues.
- The default copy is member-wise; for a raw owning pointer that is a **shallow** copy and a double free.
- Rule of Three: destructor, copy constructor, copy assignment come together. Guard against self-assignment.
- Use `= delete` for types that must not be copied, and prefer standard types so you write none of this.
:::
