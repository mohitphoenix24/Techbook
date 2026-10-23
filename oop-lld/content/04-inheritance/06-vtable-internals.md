---
title: How virtual functions work: vptr and vtable
level: advanced
time: 35
summary: The mechanism behind dynamic dispatch, shown by building a vtable by hand in plain structs, plus object size with virtual functions, the cost of a virtual call, vptr changes during construction, and the typeid/RTTI link.
---

This is the "how does polymorphism *really* work?" question, asked in interviews to see whether you understand C++ below the syntax.

## The mechanism

For every class that has virtual functions, the compiler makes a **vtable**: one array of function pointers, one entry per virtual function, filled with the address of the *most derived* version for that class. Every **object** of such a class gets a hidden pointer, the **vptr**, pointing to its class's vtable. The constructor sets the vptr.

```text
   Animal* a = new Dog;

   a ──► ┌───────────────────┐         Dog's vtable (one per class, read-only)
         │ vptr ─────────────┼───────► ┌───────────────────────────┐
         │ Animal data...    │         │ [0] &Dog::~Dog            │
         │ Dog data...       │         │ [1] &Dog::speak           │   ← overrides Animal::speak
         └───────────────────┘         │ [2] &Animal::legs         │   ← not overridden: inherited
            the Dog OBJECT             └───────────────────────────┘

   a->speak()   becomes:   (a->vptr[1])(a)      one extra pointer load + an indirect call
```

## Proof 1: virtual functions add a pointer to each object

```cpp run title="sizeof shows the hidden vptr"
#include <iostream>
using namespace std;

struct Plain      { int x; void f() {} };
struct WithVirtual { int x; virtual void f() {} };
struct TwoVirtuals { int x; virtual void f() {} virtual void g() {} };   // still ONE vptr per object

int main() {
    cout << "Plain       : " << sizeof(Plain) << "\n";
    cout << "WithVirtual : " << sizeof(WithVirtual) << "\n";
    cout << "TwoVirtuals : " << sizeof(TwoVirtuals) << "\n";
}
```

An `int` is 4 bytes. A pointer is 8. The class with a virtual function is 16: 8 for the vptr, 4 for `x`, 4 bytes of padding. Adding more virtual functions adds entries to the **vtable**, not to the objects.

## Proof 2: build the vtable ourselves

Here is the same mechanism in plain C-style code, with no `virtual` keyword. This is roughly what the compiler generates.

```cpp run title="Dynamic dispatch by hand"
#include <iostream>
using namespace std;

struct Animal;                                   // forward
struct VTable {                                  // the vtable layout: a struct of function pointers
    void (*speak)(const Animal*);
    const char* (*name)(const Animal*);
};
struct Animal { const VTable* vptr; int age; };  // every object starts with the vptr

// "Dog" and "Cat" implementations
void dogSpeak(const Animal*) { cout << "Woof\n"; }
const char* dogName(const Animal*) { return "Dog"; }
void catSpeak(const Animal*) { cout << "Meow\n"; }
const char* catName(const Animal*) { return "Cat"; }

// one vtable per class, shared by all its objects
const VTable dogVTable{dogSpeak, dogName};
const VTable catVTable{catSpeak, catName};

// the "virtual call": load the function from the vtable and call it
void speakTo(const Animal* a) {
    cout << a->vptr->name(a) << " says: ";
    a->vptr->speak(a);
}

int main() {
    Animal d{&dogVTable, 3};                     // "constructing a Dog" = setting the vptr
    Animal c{&catVTable, 5};
    speakTo(&d);
    speakTo(&c);
    cout << "same function speakTo() works for both: that is polymorphism\n";
}
```

That is all dynamic dispatch is: an array of function pointers chosen by what the constructor stored in the object. Derived classes simply get their own table with some entries replaced.

## Proof 3: the vptr changes while the object is being built

This explains why a virtual call in a constructor runs the base version (lesson 3). While `Base`'s constructor runs, the vptr points to **Base's vtable**. Only after `Derived`'s constructor starts does it switch to Derived's vtable. The compiler emits the vptr assignment at the top of each constructor.

```text
  new Derived:
     1. allocate memory
     2. Base::Base()       sets vptr = &Base_vtable     virtual calls now go to Base's functions
     3. Derived::Derived() sets vptr = &Derived_vtable  virtual calls now go to Derived's functions
  delete (reverse):
     ~Derived() runs with vptr = Derived's table, then sets vptr = Base's table, then ~Base() runs
```

## What does a virtual call cost?

| Cost | Detail |
|---|---|
| One extra load | read the vptr, then the function slot (usually cached) |
| An **indirect call** | the CPU cannot easily predict or inline it |
| **No inlining** | the compiler cannot inline through a virtual call unless it can prove the type (`final`, or a local object whose type is known: "devirtualisation") |
| Memory | one vptr per object, one vtable per class |

In most programs this is a few nanoseconds and irrelevant. It matters in tight inner loops over millions of objects, which is why game engines and high-performance code use data-oriented design, `final`, or **static polymorphism** (templates and CRTP, module 5).

## RTTI: typeid and the vtable

A vtable usually also stores a pointer to a `type_info` object. That is how `typeid(*p)` and `dynamic_cast` find the real type at run time. It works **only for polymorphic types** (classes with at least one virtual function).

```cpp run title="typeid on a polymorphic type"
#include <iostream>
#include <typeinfo>
using namespace std;

struct Base { virtual ~Base() = default; };
struct Derived : Base {};
struct NotPolymorphic {};
struct AlsoNot : NotPolymorphic {};

int main() {
    Derived d;
    Base& b = d;
    cout << boolalpha;
    cout << "typeid(b) == typeid(Derived)? " << (typeid(b) == typeid(Derived)) << "\n";      // dynamic type
    AlsoNot n;
    NotPolymorphic& np = n;
    cout << "typeid(np) == typeid(AlsoNot)? " << (typeid(np) == typeid(AlsoNot)) << "\n";   // static type only!
}
```

:::interview Explain virtual functions to me as if I knew only C
"Each polymorphic class has a table of function pointers, the vtable, built at compile time. Each object has a hidden pointer, the vptr, to its class's table, set in the constructor. A virtual call loads the function address from the table through the vptr and calls it indirectly. So the function chosen depends on the object, not on the pointer's declared type. It costs one pointer per object, one table per class, and one indirect call." You can offer to sketch the struct-of-function-pointers version.
:::

```quiz
? Where is the vptr stored?
- In the vtable
+ Inside every object of a class that has virtual functions
- In the compiler
> Each object has its own vptr; the vtable itself is shared and read-only.
? You add three more virtual functions to a class. How does `sizeof(object)` change?
- Grows by 24 bytes
+ It does not change
- Doubles
> Objects hold a single vptr. The extra functions add entries to the class's vtable.
? Why does a virtual call inside a base constructor not reach the derived override?
- Because it is a compile error
+ Because the vptr points to the base's vtable until the derived constructor starts
- Because the call is inlined
> The object's dynamic type changes as construction proceeds.
```

:::keypoints
- vtable = per-class array of function pointers; vptr = per-object pointer to it, set by the constructor.
- A virtual call = load vptr, load slot, indirect call. Costs memory (one pointer per object) and prevents inlining.
- The vptr is switched as construction (and destruction) moves through the hierarchy.
- RTTI (`typeid`, `dynamic_cast`) works only for polymorphic types.
:::
