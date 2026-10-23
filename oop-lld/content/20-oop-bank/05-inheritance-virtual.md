---
title: "OOP interview: inheritance and virtual functions"
level: medium
time: 35
summary: Access in inheritance, virtual functions and the vtable, override and final, slicing, abstract classes, multiple and virtual inheritance, the diamond, RTTI, and covariant returns.
---

## Inheritance basics

:::qa What are public, protected and private inheritance? {level=medium}
- **Public:** "is-a". Base public stays public, protected stays protected.
- **Protected:** base public and protected become protected in the derived class.
- **Private:** "implemented in terms of". Everything from the base becomes private; outside code cannot treat the derived object as a base.

Private inheritance is rare; composition usually reads better.
:::

:::qa What is not inherited from a base class? {level=medium}
Constructors, destructors (they are called, not inherited), assignment operators, friends and private members (inherited in layout, but not accessible). Use `using Base::Base;` to inherit constructors.
:::

:::qa What is object slicing? {level=medium}
Copying a derived object into a base **object** (not a pointer or reference) cuts off the derived part: `Base b = derived;`. The vtable pointer becomes `Base`'s, so virtual calls no longer reach the derived overrides. Avoid by passing and storing polymorphic objects by pointer or reference (`unique_ptr<Base>`).
:::

:::qa What is name hiding in inheritance? {level=hard}
A function in the derived class hides every base function with the same **name**, even those with different parameters. Bring them back with `using Base::f;`.
:::

:::qa What is `protected` for and what is its downside? {level=medium}
It gives derived classes access to base members. The downside: every derived class depends on the base's internals, so changing a protected member breaks them (a second public interface). Prefer private data with protected *functions* if needed.
:::

## Virtual functions

:::qa What is a virtual function? {level=easy}
A member function declared `virtual` that is resolved at **run time** by the object's real type when called through a pointer or reference. It enables dynamic polymorphism.
:::

:::qa How are virtual functions implemented (vtable and vptr)? {level=medium}
Each class with virtual functions has a **vtable**: an array of function pointers, one per virtual function. Each object holds a hidden **vptr** to its class's vtable, set during construction. A virtual call does `obj->vptr[slot](obj)`: one extra memory read and an indirect call. The cost is small but prevents inlining.
:::

:::qa What do `override` and `final` do? {level=easy}
`override` makes the compiler check that you really override a base virtual function (catches typos and signature changes such as a forgotten `const`). `final` on a function forbids further overrides; on a class it forbids deriving. Always write `override`.
:::

:::qa What is a pure virtual function? Can it have a body? {level=medium}
`virtual void f() = 0;` has no required implementation and makes the class abstract. It *can* have a body (callable explicitly as `Base::f()`), which is useful for default behaviour that derived classes may reuse.
:::

:::qa Can you call a virtual function through an object (not a pointer)? Is it dynamic? {level=medium}
Through an object by value the compiler knows the exact type, so the call is resolved statically. Dynamic dispatch needs a pointer or a reference.
:::

:::qa Are default arguments of virtual functions resolved dynamically? {level=hard}
No. The function body is chosen at run time, but default argument values come from the **static** type of the expression. A derived override with a different default still gets the base's default when called through a base pointer. Avoid default arguments on virtual functions.
:::

:::qa Can a private virtual function be overridden? {level=hard}
Yes. Access control applies to the call site, not to overriding. The Non-Virtual Interface (NVI) idiom uses this: a public non-virtual function calls a private virtual hook that derived classes override.
:::

:::qa What is a covariant return type? {level=hard}
An override may return a more derived pointer or reference than the base declares: `Shape* clone()` can be overridden as `Circle* clone() override`. Callers using the derived type avoid a cast.
:::

:::qa What does the compiler do with virtual functions in a class with no virtual destructor? {level=medium}
It compiles, but `delete basePtr` of a derived object is undefined behaviour. Compilers warn with `-Wnon-virtual-dtor`. Make the destructor virtual or the class non-deletable through a base pointer.
:::

:::qa What is the cost of a virtual function? Can you avoid it? {level=medium}
An extra pointer (8 bytes) per object, an indirect call per use, and blocked inlining. If the types are known at compile time use **templates** or **CRTP** (static polymorphism); or `std::variant` + `std::visit` for a closed set of types.
:::

:::qa What is the Non-Virtual Interface idiom? {level=hard}
Public member functions are non-virtual and call private/protected virtual "hooks". The base class keeps control of the invariant checks, logging or locking around the call, and derived classes only customise the steps. It is Template Method expressed as an idiom.
:::

## Multiple and virtual inheritance

:::qa What is the diamond problem? {level=medium}
`D` inherits from `B` and `C`, which both inherit from `A`. `D` then contains **two** `A` subobjects, so `d.a_member` is ambiguous and data is duplicated. Solve with **virtual inheritance**: `class B : virtual public A`, so only one shared `A` exists.
:::

:::qa How does virtual inheritance change construction? {level=hard}
The **most derived class** constructs the virtual base directly (its initialiser list decides the arguments); the intermediate classes' calls to the base constructor are ignored. It also adds pointer overhead to reach the shared base.
:::

:::qa Is multiple inheritance bad? {level=medium}
Not by itself. Inheriting several **interfaces** is common and safe (Java-style). Inheriting multiple classes with state brings ambiguity and the diamond. Prefer one concrete base plus several pure interfaces, or composition.
:::

:::qa What happens to the vptr and `sizeof` with multiple inheritance? {level=hard}
Each base with virtual functions brings its own vptr, so the object has several. A pointer cast from `D*` to the second base may adjust the address (`static_cast` and `dynamic_cast` do the adjustment, a `reinterpret_cast` does not).
:::

## RTTI and casts for classes

:::qa What does `dynamic_cast` do and what is RTTI? {level=medium}
`dynamic_cast<Derived*>(basePtr)` checks at run time that the object really is a `Derived`, returning `nullptr` (or throwing `bad_cast` for references) if not. It needs **RTTI** (run-time type information) and a polymorphic base. Frequent use suggests a design problem; prefer virtual functions or a visitor.
:::

:::qa What does `typeid` do? {level=medium}
Gives the run-time type of a polymorphic object (`typeid(*p).name()`). The name is implementation-defined; compare with `typeid(a) == typeid(b)`.
:::

:::qa When is `static_cast` down a hierarchy unsafe? {level=medium}
`static_cast<Derived*>(base)` does no check. If the object is not really a `Derived`, behaviour is undefined. Use it only when you know the type for sure; otherwise `dynamic_cast`.
:::

:::qa How do you stop a class from being inherited? {level=easy}
Mark it `final`: `class Leaf final : public Node {};`. Before C++11, a private constructor trick.
:::

:::qa What is the Liskov Substitution Principle in one sentence? {level=medium}
Objects of a derived class must be usable wherever the base class is expected, without breaking correctness: derived classes may not demand more (stronger preconditions), nor promise less (weaker postconditions).
:::

```quiz
? Which tells the compiler to verify that you are really overriding a base function?
- virtual
+ override
- final
> A mismatched signature then becomes a compile error.
? Base b = derivedObject; b.speak();  (speak is virtual) calls...
- Derived::speak
+ Base::speak, because the object was sliced
- Neither
> Virtual dispatch needs a pointer or reference.
```

:::keypoints
- vtable/vptr: one extra pointer per object and an indirect call; write `override`; virtual destructor for polymorphic bases.
- Slicing, name hiding and default-argument pitfalls; NVI for control.
- Diamond solved by virtual inheritance; prefer interfaces + composition; `dynamic_cast` needs RTTI.
:::
