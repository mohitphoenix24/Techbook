---
title: Access in inheritance: public, protected and private
level: intermediate
time: 20
summary: What public, protected and private inheritance mean, the access table for each, when private inheritance ("implemented-in-terms-of") is used, and how it differs from composition.
---

The word before the base class name is the **inheritance access**: `class D : public B`, `: protected B`, or `: private B`. It sets the **maximum visibility** of the base's members inside `D`.

## The access table

| Member in Base | `public` inheritance | `protected` inheritance | `private` inheritance |
|---|---|---|---|
| `public` | public in D | protected in D | private in D |
| `protected` | protected in D | protected in D | private in D |
| `private` | inaccessible | inaccessible | inaccessible |

Private members of the base are *always* inaccessible in the derived class, whatever the inheritance kind. And only `public` inheritance means **is-a**: outside code can convert a `D*` to a `B*`.

```cpp run title="The three inheritance kinds, compared"
#include <iostream>
using namespace std;

class Base {
public:    void pub()  { cout << "pub\n"; }
protected: void prot() { cout << "prot\n"; }
private:   void priv() { cout << "priv\n"; }
};

class PublicD : public Base {
public:
    void test() { pub(); prot(); /* priv(); error */ }
};
class ProtectedD : protected Base {
public:
    void test() { pub(); prot(); }
};
class PrivateD : private Base {
public:
    void test() { pub(); prot(); }
};

int main() {
    PublicD a;     a.pub();               // OK: still public
    ProtectedD b;  b.test();              // b.pub() would NOT compile from outside
    PrivateD c;    c.test();              // c.pub() would NOT compile from outside
    Base* p = &a;                         // OK: public inheritance means is-a
    // Base* q = &b;                      // error: conversion is inaccessible
    (void)p;
}
```

## Private inheritance means "implemented-in-terms-of"

With `private` inheritance, `D` *uses* `B`'s code internally, but outside code cannot treat a `D` as a `B`. It is an implementation detail, not an is-a. Almost always **composition** does the same job more clearly.

```cpp run title="Private inheritance vs composition"
#include <iostream>
#include <vector>
using namespace std;

// Version 1: private inheritance. Stack is implemented IN TERMS OF vector, but is not a vector.
class StackA : private vector<int> {
public:
    void push(int x) { push_back(x); }
    int pop() { int v = back(); pop_back(); return v; }
    using vector<int>::size;               // choose what to re-expose
};

// Version 2: composition. Clearer, and usually preferred.
class StackB {
    vector<int> items_;
public:
    void push(int x) { items_.push_back(x); }
    int pop() { int v = items_.back(); items_.pop_back(); return v; }
    size_t size() const { return items_.size(); }
};

int main() {
    StackA a; a.push(1); a.push(2);
    StackB b; b.push(1); b.push(2);
    cout << a.pop() << " " << a.size() << " | " << b.pop() << " " << b.size() << "\n";
    // a.push_back(9);                      // error: vector's interface is NOT exposed
}
```

Reasons to choose private inheritance over composition are rare: you need to **override a virtual function** of the base, or access its **protected** members, or the **empty base optimisation**. Otherwise use a member.

:::interview public vs private inheritance
"Public inheritance models *is-a*: a `Derived` can be used wherever a `Base` is expected. Private inheritance models *implemented-in-terms-of*: no conversion is allowed outside, and the base's interface is hidden. Composition is usually cleaner than private inheritance, unless I must override a virtual function or reach protected members."
:::

## The default if you write nothing

`class D : B` inherits **privately**. `struct D : B` inherits **publicly**. A very common beginner bug is writing `class Dog : Animal` and wondering why `Animal*` conversion fails. Always write the keyword.

```cpp run expect-error title="The default for class is private inheritance"
#include <iostream>
using namespace std;

struct Animal { virtual ~Animal() = default; };
class Dog : Animal {};                          // forgot 'public'

int main() {
    Dog d;
    Animal* a = &d;                             // error: 'Animal' is an inaccessible base of 'Dog'
    (void)a;
}
```

```quiz
? Which inheritance kind models is-a?
- private
- protected
+ public
> Only public inheritance allows converting a Derived* to a Base* anywhere, which is what substitutability means.
? What does `class D : B {}` (no keyword) mean?
- public inheritance
+ private inheritance
- protected inheritance
> For `class` the default is private; for `struct` it is public.
```

:::keypoints
- Inheritance access caps the visibility of base members in the derived class; private base members are never accessible.
- Only public inheritance is *is-a*. Private means "implemented in terms of"; composition is usually better.
- Always write `public` explicitly: `class D : public B`.
:::
