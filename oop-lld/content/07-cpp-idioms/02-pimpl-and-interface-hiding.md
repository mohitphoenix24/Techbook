---
title: PIMPL, factories and hiding the implementation
level: advanced
time: 30
summary: The Pointer-to-Implementation idiom for stable interfaces and fast builds, returning interface pointers from factory functions, opaque handles, non-copyable and final classes, and tag dispatch.
---

C++ headers expose the **private members** of a class, because the compiler needs them to know the object's size. That means: changing a private member forces every file that includes the header to recompile, and implementation details leak. Several idioms fix this.

## PIMPL: Pointer to IMPLementation

Put all private data in a separate `Impl` struct, defined only in the `.cpp`. The public class holds just a `unique_ptr<Impl>`.

Here is how it looks across files:

```cpp title="widget.h  (what clients see: no private details)"
#pragma once
#include <memory>
#include <string>

class Widget {
public:
    explicit Widget(std::string name);
    ~Widget();                              // declared here, DEFINED in the .cpp where Impl is complete
    Widget(Widget&&) noexcept;
    Widget& operator=(Widget&&) noexcept;
    void draw() const;
private:
    struct Impl;                            // forward declaration only
    std::unique_ptr<Impl> impl_;
};
```

```cpp title="widget.cpp  (all the details live here)"
#include "widget.h"
#include <iostream>
#include <vector>

struct Widget::Impl {                       // free to change without recompiling clients
    std::string name;
    std::vector<int> cache;
};

Widget::Widget(std::string name) : impl_(std::make_unique<Impl>(Impl{std::move(name), {}})) {}
Widget::~Widget() = default;                // Impl is complete here, so unique_ptr can delete it
Widget::Widget(Widget&&) noexcept = default;
Widget& Widget::operator=(Widget&&) noexcept = default;
void Widget::draw() const { std::cout << "drawing " << impl_->name << "\n"; }
```

The same structure in one file, so you can run it:

```cpp run title="PIMPL, in one file"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

// ---- "header" part ----
class Widget {
public:
    explicit Widget(string name);
    ~Widget();
    Widget(Widget&&) noexcept;
    Widget& operator=(Widget&&) noexcept;
    void draw() const;
private:
    struct Impl;
    unique_ptr<Impl> impl_;
};

// ---- "source" part ----
struct Widget::Impl {
    string name;
    vector<int> cache;
};
Widget::Widget(string name) : impl_(make_unique<Impl>(Impl{move(name), {}})) {}
Widget::~Widget() = default;
Widget::Widget(Widget&&) noexcept = default;
Widget& Widget::operator=(Widget&&) noexcept = default;
void Widget::draw() const { cout << "drawing " << impl_->name << "\n"; }

int main() {
    Widget w("button");
    w.draw();
    Widget w2 = move(w);
    w2.draw();
    cout << "sizeof(Widget) = " << sizeof(Widget) << " (one pointer, whatever Impl holds)\n";
}
```

| Benefit | Cost |
|---|---|
| Changing private members does not recompile clients (faster builds) | one extra heap allocation and indirection |
| Binary-compatible interface (library ABI stays stable) | more boilerplate (special members declared in the header, defined in the .cpp) |
| Hides third-party headers from clients | harder to debug |

The destructor **must be defined where `Impl` is complete**, otherwise `unique_ptr<Impl>`'s deleter cannot compile. That is the usual PIMPL compile error.

## Interface + factory function

Another way to hide implementations: expose only an **abstract interface** and a **factory function** that returns `unique_ptr<Interface>`. Clients never see concrete classes.

```cpp run title="Interface and factory"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
using namespace std;

// ---- the public header: interface + factory declaration ----
class Storage {
public:
    virtual ~Storage() = default;
    virtual void save(const string& key, const string& value) = 0;
    virtual string load(const string& key) const = 0;
};
unique_ptr<Storage> makeStorage(const string& kind);

// ---- the private implementation file: concrete classes nobody else can name ----
namespace {
class MemoryStorage : public Storage {
    string lastKey_, lastValue_;
public:
    void save(const string& k, const string& v) override { lastKey_ = k; lastValue_ = v; cout << "  [memory] saved " << k << "\n"; }
    string load(const string& k) const override { return k == lastKey_ ? lastValue_ : ""; }
};
class NullStorage : public Storage {
public:
    void save(const string&, const string&) override {}
    string load(const string&) const override { return ""; }
};
}
unique_ptr<Storage> makeStorage(const string& kind) {
    if (kind == "memory") return make_unique<MemoryStorage>();
    if (kind == "null") return make_unique<NullStorage>();
    throw invalid_argument("unknown storage: " + kind);
}

int main() {
    auto s = makeStorage("memory");
    s->save("lang", "C++");
    cout << s->load("lang") << "\n";
}
```

This is the **Factory** pattern, and it is the main way to apply the Dependency Inversion Principle in C++ (SOLID module).

## Making classes non-copyable, non-movable, or final

| Goal | Write |
|---|---|
| Not copyable (unique resource) | `T(const T&) = delete; T& operator=(const T&) = delete;` |
| Neither copyable nor movable (a mutex-like object, a Singleton) | delete copy **and** move |
| Cannot be inherited from | `class T final { ... };` |
| Cannot be created except through a factory | make constructors `private`/`protected` + a `static` create function |
| Cannot be created on the heap | `static void* operator new(size_t) = delete;` |

```cpp run title="A non-copyable, non-movable class with a static factory"
#include <iostream>
#include <memory>
using namespace std;

class Session {
    int id_;
    explicit Session(int id) : id_(id) {}                  // private: only create() can build one
public:
    static unique_ptr<Session> create(int id) { return unique_ptr<Session>(new Session(id)); }
    Session(const Session&) = delete;
    Session& operator=(const Session&) = delete;
    Session(Session&&) = delete;
    Session& operator=(Session&&) = delete;
    int id() const { return id_; }
};

int main() {
    auto s = Session::create(5);
    cout << "session " << s->id() << "\n";
    // Session x(3);              // error: constructor is private
    // auto y = *s;               // error: copy is deleted
}
```

## Tag dispatch: choosing an overload by type

A **tag** is an empty type used only to select an overload. The standard library uses it all the time (`std::in_place`, `std::nothrow`, iterator categories).

```cpp run title="Tag dispatch"
#include <iostream>
#include <string>
using namespace std;

struct FromMetres {};
struct FromFeet {};

class Length {
    double metres_;
public:
    Length(double v, FromMetres) : metres_(v) {}
    Length(double v, FromFeet)   : metres_(v * 0.3048) {}      // overload chosen by the tag type, no flag, no ambiguity
    double metres() const { return metres_; }
};

int main() {
    Length a(10, FromMetres{}), b(10, FromFeet{});
    cout << a.metres() << " " << b.metres() << "\n";
}
```

:::interview What is the PIMPL idiom and why use it?
"PIMPL hides a class's private members behind a pointer to an incomplete `Impl` type defined in the source file. Clients then do not depend on private details, so changing them does not trigger recompilation, the header stays light, and the library ABI stays stable. The cost is an extra allocation and indirection. The destructor and special members must be defined where `Impl` is complete."
:::

```quiz
? Why must a PIMPL class define its destructor in the .cpp file?
- Destructors cannot be inline
+ unique_ptr<Impl> needs the complete Impl type to delete it, and Impl is only complete in the .cpp
- To make it virtual
> If the compiler generates the destructor in the header, it tries to delete an incomplete type.
? What is the main advantage of returning `unique_ptr<Interface>` from a factory?
- It is faster
+ Clients depend only on the interface; concrete classes stay hidden and swappable
- It avoids virtual functions
> This is the Factory pattern and supports dependency inversion.
```

:::keypoints
- PIMPL: `unique_ptr<Impl>` with `Impl` defined in the .cpp. Fewer rebuilds, stable ABI, at the cost of an indirection.
- Interface + factory hides concrete classes entirely.
- Use `= delete`, `final`, private constructors and static factories to state exactly how a class may be used.
- Tag types select overloads cleanly.
:::
