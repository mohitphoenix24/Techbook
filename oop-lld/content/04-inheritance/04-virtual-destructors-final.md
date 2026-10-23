---
title: Virtual destructors, final and covariant returns
level: intermediate
time: 25
summary: Why every polymorphic base class needs a virtual destructor (with the leak shown), what final does for classes and functions, covariant return types, and the checklist for writing a correct polymorphic base class.
---

## The most asked C++ OOP question: why a virtual destructor?

When you `delete` a derived object through a **base pointer**, C++ must call the *derived* destructor first. It can only do that if the base destructor is `virtual`. Otherwise it calls only the base destructor, so the derived part is never cleaned up. That is **undefined behaviour** (and in practice, a leak of whatever the derived class owned).

```cpp title="The bug (display only: the behaviour is undefined)"
struct Base {
    ~Base() { /* not virtual */ }
};
struct Derived : Base {
    int* data = new int[1000];
    ~Derived() { delete[] data; }            // will NOT run when deleted through Base*
};

int main() {
    Base* p = new Derived;
    delete p;                                // calls ~Base only: the 1000 ints leak (and it is UB)
}
```

With AddressSanitizer this program is reported as `new-delete-type-mismatch`. Now the fixed version, with a visible effect:

```cpp run title="With a virtual destructor, both destructors run"
#include <iostream>
#include <memory>
using namespace std;

class Connection {
public:
    virtual ~Connection() { cout << "~Connection\n"; }       // virtual!
    virtual void close() = 0;
};

class DbConnection : public Connection {
    int* buffer_ = new int[256];
public:
    ~DbConnection() override { delete[] buffer_; cout << "~DbConnection: buffer freed\n"; }
    void close() override { cout << "closing db\n"; }
};

int main() {
    Connection* c = new DbConnection;     // base pointer to a derived object
    c->close();
    delete c;                             // ~DbConnection runs first, then ~Connection

    unique_ptr<Connection> u = make_unique<DbConnection>();   // smart pointers rely on the same rule
}
```

:::def Rule: virtual destructor
If a class has **any virtual function**, or is meant to be used as a base class through a pointer, give it a **public virtual destructor** (or a protected non-virtual one, if nobody should delete through the base). `virtual ~Base() = default;` is the usual spelling.
:::

Two follow-ups interviewers like:

- *"Can a destructor be pure virtual?"* Yes, `virtual ~Base() = 0;`, but it **must also have a body** outside the class (`Base::~Base() {}`), because derived destructors call it. It is a trick to make a class abstract when it has no other pure virtual function.
- *"Does making the destructor virtual cost anything?"* Each object gets a vptr (8 bytes) and deletion needs a virtual call. Negligible, and required for correctness.

:::note `shared_ptr` is forgiving, `unique_ptr` is not
`shared_ptr<Base> p = make_shared<Derived>();` remembers the real type at creation and deletes correctly even without a virtual destructor. But do not rely on that: always make the destructor virtual.
:::

## final

`final` stops further inheritance or overriding.

```cpp run title="final on a function and on a class"
#include <iostream>
using namespace std;

class Shape {
public:
    virtual ~Shape() = default;
    virtual const char* name() const { return "shape"; }
};

class Circle : public Shape {
public:
    const char* name() const override final { return "circle"; }   // no further override allowed
};

class Sphere final : public Circle {                               // nobody may derive from Sphere
public:
    // const char* name() const override { ... }                   // error: name() is final in Circle
};

int main() {
    Sphere s;
    const Shape& r = s;
    cout << r.name() << "\n";
}
```

Use `final` when a class is not designed to be extended (most are!). It documents intent and lets the compiler **devirtualise** calls (call the function directly because it knows nothing can override it).

## Covariant return types

An overriding function may return a **more derived** pointer or reference than the base declares. This is the only case where the return type of an override may differ. It is the standard way to write a `clone()` that returns the right type.

```cpp run title="clone() with a covariant return type"
#include <iostream>
#include <memory>
using namespace std;

class Shape {
public:
    virtual ~Shape() = default;
    virtual Shape* clone() const = 0;                 // "virtual copy constructor"
    virtual void print() const = 0;
};

class Circle : public Shape {
    double r_;
public:
    explicit Circle(double r) : r_(r) {}
    Circle* clone() const override { return new Circle(*this); }    // returns Circle*, not Shape*: covariant
    void print() const override { cout << "Circle r=" << r_ << "\n"; }
};

int main() {
    Circle c(2.5);
    Circle* c2 = c.clone();                  // no cast needed
    c2->print();

    const Shape& base = c;
    unique_ptr<Shape> copy(base.clone());    // copy an object when you only know its base type
    copy->print();
    delete c2;
}
```

You cannot write `virtual Shape(const Shape&)`, since constructors cannot be virtual. The **clone idiom** gives you "copy through a base pointer". It is the **Prototype** pattern (module 10).

## Pure virtual destructor example

```cpp run title="Abstract class with only a destructor pure virtual"
#include <iostream>
using namespace std;

class Interface {
public:
    virtual ~Interface() = 0;               // pure: the class is abstract
};
Interface::~Interface() { cout << "~Interface body runs\n"; }   // but a body is REQUIRED

class Impl : public Interface {
public:
    ~Impl() override { cout << "~Impl\n"; }
};

int main() {
    // Interface i;                          // error: abstract
    Impl x;
}
```

## Checklist: writing a polymorphic base class

1. `virtual ~Base() = default;` (public and virtual).
2. Make the interface functions `virtual`, mostly pure (`= 0`).
3. In derived classes mark overrides with `override` (and `final` where appropriate).
4. Delete or protect copying of the base to avoid **slicing** (lesson 8): `Base(const Base&) = delete;`, and offer `clone()` if copies are needed.
5. Keep data out of the interface. No virtual calls in constructors or destructors.

```quiz
? What happens when a derived object is deleted through a base pointer whose destructor is not virtual?
- The derived destructor runs first, then the base
+ Undefined behaviour: typically only the base destructor runs, so the derived part leaks
- A compile error
> The compiler cannot know the real type without the virtual mechanism.
? How can an override return a different type from the base function?
- It cannot
+ If the return types are covariant: pointers or references to classes where the derived one is the more derived type
- Only with templates
> Covariant return types permit `Circle*` where the base returns `Shape*`.
? What must a pure virtual destructor have?
- Nothing
+ A definition (body) outside the class
- The final keyword
> Derived destructors call it, so it needs a body.
```

:::keypoints
- A polymorphic base needs a `virtual` destructor, otherwise deleting through the base is undefined behaviour and leaks.
- `final` forbids further overriding or inheriting; it also helps the compiler devirtualise.
- Covariant returns enable a typed `clone()`; the clone idiom is how you copy through a base pointer.
:::
