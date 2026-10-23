---
title: Destructors and RAII
level: easy
time: 30
summary: What a destructor does, when it runs, why resources (memory, files, locks) are tied to object lifetime, the RAII idiom that makes C++ safe without a garbage collector, scope guards, and why destructors must not throw.
---

A **destructor** is the opposite of a constructor. It runs automatically when an object's life ends: at the closing brace for a stack object, at `delete` for a heap object, or when the owning object dies. Its name is `~ClassName`, with no parameters and no return type.

## When does a destructor run?

```cpp run title="Every way an object can die"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

struct Tracer {
    int id;
    explicit Tracer(int i) : id(i) { cout << "  +" << id << "\n"; }
    ~Tracer()                      { cout << "  -" << id << "\n"; }
};

Tracer global(0);                                    // static storage: destroyed after main returns

int main() {
    cout << "stack object:\n";
    { Tracer t(1); }                                 // destroyed at the closing brace

    cout << "heap object with delete:\n";
    Tracer* p = new Tracer(2);
    delete p;                                        // destroyed here

    cout << "unique_ptr:\n";
    { auto u = make_unique<Tracer>(3); }             // destroyed when u goes out of scope

    cout << "a temporary:\n";
    Tracer(4);                                       // destroyed at the end of this statement

    cout << "members of a vector:\n";
    { vector<Tracer> v; v.reserve(2); v.emplace_back(5); v.emplace_back(6); }   // elements die in order

    cout << "end of main\n";
}
```

Read the output top to bottom and match each `-` line to its cause. Notice that the global `0` is created *before* `main` starts and destroyed *after* `main` ends.

## Why destructors matter: resources

A destructor exists to **release resources**: heap memory, open files, network sockets, locks, database connections, GPU buffers. If your class acquires something in its constructor, it should give it back in its destructor.

```cpp run title="A class that owns a heap array"
#include <iostream>
using namespace std;

class IntArray {
    int* data_;
    size_t size_;
public:
    explicit IntArray(size_t n) : data_(new int[n]{}), size_(n) { cout << "allocated " << n << " ints\n"; }
    ~IntArray() { delete[] data_; cout << "freed " << size_ << " ints\n"; }   // no leak
    int& operator[](size_t i) { return data_[i]; }
    size_t size() const { return size_; }

    IntArray(const IntArray&) = delete;               // copying would need care: see the next lesson
    IntArray& operator=(const IntArray&) = delete;
};

int main() {
    IntArray a(3);
    a[0] = 10; a[2] = 30;
    cout << a[0] + a[2] << "\n";
}                                                    // ~IntArray runs here: automatic cleanup
```

You wrote `delete[]` **once**, in the destructor. Every user of `IntArray` is now leak-free without remembering anything. That is the magic.

## RAII: Resource Acquisition Is Initialisation

:::def RAII
**Tie the life of a resource to the life of an object.** Acquire the resource in the constructor; release it in the destructor. Because C++ guarantees destructors run when a scope exits (normally, by `return`, **or by an exception**), cleanup is automatic and safe. It is the single most important idiom in C++ and the reason C++ has no `finally` and no garbage collector.
:::

:::analogy Think of it like this
A hotel key card. The card (object) is issued at check-in (constructor) and when you hand it back (destructor) the room is released. Even if you rush out through the fire door (exception), the front desk deactivates the card. You do not need to remember a separate "release the room" step.
:::

### Example: a lock that cannot be forgotten

```cpp run title="RAII for a mutex: lock_guard"
#include <iostream>
#include <mutex>
#include <stdexcept>
using namespace std;

mutex m;
int counter = 0;

void risky(bool fail) {
    lock_guard<mutex> guard(m);               // locks in the constructor
    ++counter;
    if (fail) throw runtime_error("boom");    // leaves the function early...
}                                             // ...but the destructor still unlocks m

int main() {
    risky(false);
    try { risky(true); } catch (const exception& e) { cout << "caught: " << e.what() << "\n"; }
    risky(false);                             // would deadlock if the lock had not been released
    cout << "counter = " << counter << "\n";
}
```

With manual `m.lock(); ... m.unlock();` the early `throw` would skip the `unlock` and the next call would hang forever. RAII removes the problem.

### Example: your own RAII class (a scope timer and a file)

```cpp run title="Your own RAII wrappers"
#include <cstdio>
#include <iostream>
#include <string>
using namespace std;

// Owns a C FILE*. Closes it no matter how the scope is left.
class File {
    FILE* f_;
public:
    File(const char* path, const char* mode) : f_(fopen(path, mode)) {
        if (!f_) throw runtime_error(string("cannot open ") + path);
    }
    ~File() { if (f_) fclose(f_); cout << "file closed\n"; }
    File(const File&) = delete;
    File& operator=(const File&) = delete;
    void write(const string& s) { fputs(s.c_str(), f_); }
};

// A tiny "scope guard": runs a callback when the scope ends.
template <class F>
class ScopeGuard {
    F onExit_;
public:
    explicit ScopeGuard(F f) : onExit_(move(f)) {}
    ~ScopeGuard() { onExit_(); }
};

int main() {
    try {
        File out("/tmp/ooplab_demo.txt", "w");
        ScopeGuard done([] { cout << "leaving the block\n"; });
        out.write("hello\n");
        throw runtime_error("something failed halfway");
    } catch (const exception& e) {
        cout << "error handled: " << e.what() << "\n";
    }
}
```

Both objects are cleaned up during **stack unwinding** (when the exception travels up), in reverse order: the guard first, then the file. Standard-library types that are RAII classes: `string`, `vector`, `unique_ptr`, `shared_ptr`, `lock_guard`, `fstream`.

## Destructors and exceptions

Destructors are `noexcept` by default. If a destructor throws while another exception is already unwinding the stack, the program calls `std::terminate`. So:

- **Never let an exception escape a destructor.** Catch and log inside it.
- If closing can fail (flushing a file), provide an explicit `close()` that can report the error, and let the destructor do a best-effort cleanup.

## Virtual destructors (preview)

If you delete a derived object through a base pointer and the base destructor is not `virtual`, the derived part is **not destroyed**. That is undefined behaviour and a favourite interview question. It is covered in the inheritance module. The rule: **a base class meant for polymorphic use must have a `virtual` destructor.**

:::interview What is RAII and why is it important?
"RAII ties a resource's lifetime to an object's. The constructor acquires it, the destructor releases it. Since destructors run on every exit path, including exceptions, we get automatic, exception-safe cleanup for memory, files, locks and sockets. Examples: `unique_ptr`, `lock_guard`, `fstream`, `vector`." Add: "It is why C++ has no `finally`."
:::

```quiz
? When does the destructor of a local (stack) object run?
- When the program ends
+ When control leaves the scope it was declared in, even through an exception
- Only when you call it
> Stack unwinding calls destructors of all fully-constructed locals in reverse order.
? What is RAII?
- A way to allocate memory faster
+ Binding a resource's lifetime to an object: acquire in constructor, release in destructor
- A kind of garbage collector
> It is deterministic cleanup based on scope, not a collector that runs later.
? Should a destructor throw?
- Yes, to report cleanup errors
+ No: it can cause std::terminate during stack unwinding
- Only if it is virtual
> Handle or log errors inside the destructor, or offer a separate close() that can fail.
```

:::keypoints
- Destructors run on scope exit, `delete`, and when the owner dies, in reverse order of construction.
- RAII: acquire in the constructor, release in the destructor. It makes cleanup automatic and exception-safe.
- Use `lock_guard`, `unique_ptr`, containers and your own small wrappers instead of manual release calls.
- Destructors must not throw. A polymorphic base class needs a virtual destructor.
:::
