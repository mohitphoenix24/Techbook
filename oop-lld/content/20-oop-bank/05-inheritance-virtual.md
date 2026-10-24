---
title: "OOP interview: inheritance and virtual functions"
level: medium
time: 35
summary: Simple answers on inheritance access, virtual functions and the vtable, override and final, slicing, abstract classes, multiple and virtual inheritance, the diamond problem, RTTI and covariant returns.
---

## Inheritance basics

:::qa What are public, protected and private inheritance? {level=medium}
**Say this:** "Public is 'is a'. Protected and private mean 'implemented in terms of', and hide the base from outsiders."

**In simple words:**
- **Public:** the base's public stays public. This is the normal one.
- **Protected:** the base's public becomes protected.
- **Private:** everything from the base becomes private, so outsiders cannot treat the child as a base.

Private inheritance is rare. Composition usually reads better.
:::

:::qa What is not inherited from a base class? {level=medium}
**Say this:** "Constructors, assignment operators, friends and private members (they are there, but not accessible)."

**In simple words:** Use `using Base::Base;` to inherit constructors.
:::

:::qa What is object slicing? {level=medium}
**Say this:** "Copying a child object into a base **object** cuts off the child part."

**In simple words:** `Base b = derived;` keeps only the base part, and the virtual calls no longer reach the child. Avoid it by using pointers or references (`unique_ptr<Base>`).
:::

:::qa What is name hiding in inheritance? {level=hard}
**Say this:** "A function in the child hides **all** base functions with the same name, even with different parameters."

**In simple words:** Bring them back with `using Base::f;`.
:::

:::qa What is protected for and what is its downside? {level=medium}
**Say this:** "It gives child classes access to base members. The downside: children depend on the base's insides."

**In simple words:** Changing a protected member can break every child. Prefer private data, with protected functions if needed.
:::

## Virtual functions

:::qa What is a virtual function? {level=easy}
**Say this:** "A function that is chosen at run time by the object's real type, when called through a pointer or reference."

**In simple words:** It is how dynamic polymorphism works.
:::

:::qa How are virtual functions implemented (vtable and vptr)? {level=medium}
**Say this:** "Each class with virtual functions has a vtable, an array of function pointers. Each object has a hidden pointer (vptr) to its class's vtable."

**In simple words:** A virtual call does: look at the vptr, find the function in the table, call it. It costs one extra memory read and blocks inlining.
:::

:::qa What do override and final do? {level=easy}
**Say this:** "`override` makes the compiler check that I really override a base function. `final` forbids further overriding or deriving."

**In simple words:** Always write `override`. It catches typos and a forgotten `const`.
:::

:::qa What is a pure virtual function? Can it have a body? {level=medium}
**Say this:** "`virtual void f() = 0;` has no required body and makes the class abstract. It can still have a body."

**In simple words:** The body can be called explicitly as `Base::f()`, for default behaviour that children may reuse.
:::

:::qa Can you call a virtual function through an object (not a pointer)? Is it dynamic? {level=medium}
**Say this:** "Through an object by value the type is known, so the call is decided at compile time. Dynamic calls need a pointer or reference."
:::

:::qa Are default arguments of virtual functions resolved dynamically? {level=hard}
**Say this:** "No. The function is chosen at run time, but the default value comes from the type written in the code."

**In simple words:** So never give virtual functions default arguments.
:::

:::qa Can a private virtual function be overridden? {level=hard}
**Say this:** "Yes. Access control applies where it is called, not where it is overridden."

**In simple words:** The Non-Virtual Interface idiom uses this: a public non-virtual function calls a private virtual step.
:::

:::qa What is a covariant return type? {level=hard}
**Say this:** "An override may return a more specific pointer or reference than the base declares."

**In simple words:** `Shape* clone()` can be overridden as `Circle* clone() override`.
:::

:::qa What does the compiler do with virtual functions in a class with no virtual destructor? {level=medium}
**Say this:** "It compiles, but deleting a child through a base pointer is undefined behaviour."

**In simple words:** The compiler warns with `-Wnon-virtual-dtor`. Make the destructor virtual.
:::

:::qa What is the cost of a virtual function? Can you avoid it? {level=medium}
**Say this:** "An extra pointer in each object, an indirect call, and no inlining. I can avoid it with templates, CRTP, or `std::variant`."

**In simple words:** Use these when the types are known at compile time.
:::

:::qa What is the Non-Virtual Interface idiom? {level=hard}
**Say this:** "Public functions are non-virtual and call private virtual steps. The base keeps control, and children change only the steps."

**In simple words:** The base can add checks, logging or locking around each step. It is Template Method written as an idiom.
:::

## Multiple and virtual inheritance

:::qa What is the diamond problem? {level=medium}
**Say this:** "`D` inherits from `B` and `C`, which both inherit from `A`. Then `D` has two `A` parts. Virtual inheritance fixes this."

**In simple words:** `class B : virtual public A` makes only one shared `A` exist.
:::

:::qa How does virtual inheritance change construction? {level=hard}
**Say this:** "The most derived class builds the virtual base directly."

**In simple words:** The calls to the base constructor in the middle classes are ignored. Virtual inheritance also costs extra pointers.
:::

:::qa Is multiple inheritance bad? {level=medium}
**Say this:** "No. Inheriting several interfaces is safe. Inheriting several classes with data causes trouble."

**In simple words:** Prefer one real base class plus several interfaces, or composition.
:::

:::qa What happens to the vptr and sizeof with multiple inheritance? {level=hard}
**Say this:** "Each base with virtual functions brings its own vptr, and a pointer cast may change the address."

**In simple words:** `static_cast` and `dynamic_cast` adjust the address. `reinterpret_cast` does not.
:::

## RTTI and casts for classes

:::qa What does dynamic_cast do and what is RTTI? {level=medium}
**Say this:** "`dynamic_cast<Derived*>(basePtr)` checks at run time that the object really is a `Derived`. It returns `nullptr` if not."

**In simple words:** RTTI is run-time type information. It needs a polymorphic base. Using it a lot suggests a design problem. Prefer virtual functions or a visitor.
:::

:::qa What does typeid do? {level=medium}
**Say this:** "It gives the real type of a polymorphic object: `typeid(*p).name()`."

**In simple words:** The name text depends on the compiler. Compare two with `typeid(a) == typeid(b)`.
:::

:::qa When is static_cast down a hierarchy unsafe? {level=medium}
**Say this:** "It does no check. If the object is not really that child, the behaviour is undefined."

**In simple words:** Use it only when I am sure. Otherwise use `dynamic_cast`.
:::

:::qa How do you stop a class from being inherited? {level=easy}
**Say this:** "Mark it `final`: `class Leaf final : public Node {};`."
:::

:::qa What is the Liskov Substitution Principle in one sentence? {level=medium}
**Say this:** "If I replace a parent with a child, the program should still work correctly, and the child should not surprise the code using the parent."

**In simple words:** The child must not ask for more, and must not give less.
:::

```quiz
? Which tells the compiler to check that you really override a base function?
- virtual
+ override
- final
> A wrong signature becomes a compile error.
? Base b = derivedObject; b.speak(); (speak is virtual) calls...
- Derived::speak
+ Base::speak, because the object was sliced
- Neither
> Virtual dispatch needs a pointer or reference.
```

:::keypoints
- vtable and vptr: an extra pointer in each object and an indirect call. Write `override`. Virtual destructor for base classes.
- Slicing, name hiding and default arguments are traps. NVI gives control.
- The diamond is solved by virtual inheritance. Prefer interfaces and composition. `dynamic_cast` needs RTTI.
:::
