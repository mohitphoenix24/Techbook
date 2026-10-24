---
title: "OOP interview: copying, moving and operators"
level: medium
time: 30
summary: Simple answers on copy constructor and assignment, copy elision, lvalues and rvalues, std::move and forwarding, common move mistakes, and the rules for operator overloading.
---

## Copying

:::qa What is a copy constructor? When is it called? {level=easy}
**Say this:** "`T(const T& other)` builds a new object as a copy of an existing one."

**In simple words:** It runs when you write `T b = a;` or `T b(a);`, when you pass or return by value (if not skipped), and when containers copy their items.
:::

:::qa Why must the copy constructor take its parameter by reference? {level=medium}
**Say this:** "If it took the parameter by value, passing it would need a copy, which would need a copy constructor, and so on forever."

**In simple words:** The compiler refuses `T(T)`.
:::

:::qa What is the difference between copy construction and copy assignment? {level=easy}
**Say this:** "Construction makes a new object. Assignment replaces the value of an existing one."

**In simple words:** `T b = a;` is construction. `b = a;` is assignment, so it must free the old resource first and handle `a = a`.
:::

:::qa How do you write a correct copy assignment operator? {level=medium}
**Say this:** "Use copy-and-swap: take the argument by value, then swap."

```cpp
Buffer& operator=(Buffer other) noexcept {   // copy (or move) happens in the parameter
    swap(other);                              // exchange guts
    return *this;                             // old data dies with 'other'
}
```
**In simple words:** The copy happens in the parameter. We swap with it, and the old data goes away with the temporary. It handles errors and self-assignment safely.
:::

:::qa What is self-assignment and how do you guard against it? {level=medium}
**Say this:** "It is `a = a;`, maybe through two names for the same object. Either check `this == &other`, or use copy-and-swap."

**In simple words:** A naive operator frees its data first, and then copies from the data it just freed.
:::

:::qa What is copy elision and RVO? {level=medium}
**Say this:** "The compiler may skip a copy or move by building the object directly in its final place."

**In simple words:** Since C++17, returning a temporary (`return T{...};`) is **guaranteed** to skip the copy. Returning a named local is often optimised too. So do not write `return std::move(local);`, because it stops that.
:::

:::qa Which functions are generated automatically, and when are they suppressed? {level=hard}
**Say this:** "Writing a destructor or a copy operation stops the compiler from writing the moves. Writing a move deletes the copies. Writing any constructor removes the default one."

**In simple words:** That is why you either write none (Rule of Zero) or all five.
:::

## Move semantics

:::qa What are lvalues and rvalues? {level=medium}
**Say this:** "An lvalue has a name and an address. An rvalue is a temporary that is about to disappear."

**In simple words:** A variable `x` is an lvalue. `f()`, `a + b` and `std::move(x)` are rvalues. A `T&&` reference can bind to an rvalue, so a function can safely **take** its contents.
:::

:::qa What is move semantics and why was it added? {level=medium}
**Say this:** "Moving transfers a resource from a temporary to another object instead of copying it."

**In simple words:** A move constructor copies the pointer and sets the source to null. Returning big objects and growing vectors became cheap.
:::

:::qa What does std::move actually do? {level=medium}
**Say this:** "Nothing at run time. It only casts to an rvalue reference."

**In simple words:** The real moving is done by the move constructor or move assignment that gets chosen after the cast.
:::

:::qa What state is a moved-from object in? {level=medium}
**Say this:** "Valid but unspecified. I can destroy it or assign to it, but I should not rely on its value."

**In simple words:** For standard types it is usually empty. Reset it before using it again.
:::

:::qa Why should move operations be noexcept? {level=hard}
**Say this:** "`vector` copies instead of moving when growing if the move could throw."

**In simple words:** A move that may throw turns cheap growth into slow copies. So mark moves `noexcept`.
:::

:::qa What is a universal (forwarding) reference? {level=hard}
**Say this:** "In `template<class T> void f(T&& x)`, `T&&` can bind to both lvalues and rvalues. It is not an rvalue reference."

**In simple words:** Use `std::forward<T>(x)` to pass it on exactly as it came.
:::

:::qa What is perfect forwarding, and where is it used? {level=hard}
**Say this:** "Passing arguments through a wrapper so the inner function sees them exactly as the caller gave them."

**In simple words:** Used in `make_unique`, `emplace_back` and `std::thread`:

```cpp
template<class T, class... A> unique_ptr<T> make(A&&... a) { return unique_ptr<T>(new T(std::forward<A>(a)...)); }
```
:::

:::qa push_back vs emplace_back: what is the difference? {level=medium}
**Say this:** "`push_back` needs an existing object. `emplace_back` builds the element in place from the arguments."

**In simple words:** `emplace_back` saves a temporary. But it can use `explicit` constructors by accident.
:::

:::qa Should you return by const value or by reference from a function? {level=medium}
**Say this:** "Return by value for new objects. Return a reference only to something that outlives the call."

**In simple words:** A `const` return value blocks moves, so do not use it.
:::

:::qa What is the "moved-from member" mistake in a move constructor? {level=hard}
**Say this:** "Forgetting to reset the source, or forgetting `std::move` on the members."

**In simple words:** A named `T&&` parameter is an lvalue inside the function, so a member needs `std::move(o.member)`, or it is silently copied.
:::

:::qa What does std::swap do and how can you make it fast for your class? {level=medium}
**Say this:** "The default does a move and two move-assignments. For my class, I write a `noexcept` `swap` that swaps the members."

**In simple words:** Call it as `using std::swap; swap(a, b);` so that the compiler finds my version.
:::

## Operator overloading

:::qa Which operators cannot be overloaded? {level=easy}
**Say this:** "`::`, `.`, `.*`, `?:`, `sizeof`, `typeid` and the cast operators."

**In simple words:** You also cannot invent new operators or change precedence.
:::

:::qa Member or non-member: how do you decide for an operator? {level=medium}
**Say this:** "`=`, `[]`, `()` and `->` must be members. Symmetric ones like `+` and `==` are better as non-members. `<<` must be a non-member."

**In simple words:** Operators that change the object (`+=`, `++`) are good as members. `<<` is a non-member because the left side is the stream.
:::

:::qa How do you overload the pre-increment and post-increment operators? {level=medium}
**Say this:** "Prefix has no parameter. Postfix has a dummy `int` parameter and returns the old value."

```cpp
Counter& operator++()    { ++n; return *this; }                       // ++c
Counter  operator++(int) { Counter old = *this; ++n; return old; }    // c++ (dummy int)
```
:::

:::qa How do you overload operator<< for output? {level=easy}
**Say this:** "As a non-member (a friend if it needs private data) that takes the stream by reference and returns it."

```cpp
ostream& operator<<(ostream& os, const Point& p) { return os << '(' << p.x << ", " << p.y << ')'; }
```
:::

:::qa What is the spaceship operator <=>? {level=medium}
**Say this:** "C++20's three-way comparison. `auto operator<=>(const T&) const = default;` gives all of `<`, `<=`, `>`, `>=`."

**In simple words:** With a defaulted `operator==`, you also get `==` and `!=`. It removes pages of repeated code.
:::

:::qa What is a functor? {level=easy}
**Say this:** "An object that can be called like a function, because it defines `operator()`."

**In simple words:** It can keep data between calls. A lambda is a functor that the compiler writes.
:::

:::qa What is a conversion operator and a risk of it? {level=medium}
**Say this:** "`operator double() const` lets an object turn into another type. Hidden conversions can cause surprises."

**In simple words:** Mark it `explicit`. `explicit operator bool()` is the usual safe one.
:::

:::qa Why should operator&& and operator|| not be overloaded? {level=hard}
**Say this:** "The built-in ones skip the right side when the left decides. Overloaded ones always evaluate both sides."

**In simple words:** The same warning applies to the comma operator.
:::

```quiz
? Returning a local variable: which is best?
- return std::move(local);
+ return local;
- return &local;
> Plain `return local;` allows copy elision and moves otherwise.
? std::move(x) on its own...
- Moves the data of x
+ Casts x to an rvalue reference. A move constructor or assignment does the real moving
- Deletes x
> Only the function that receives it takes the contents.
```

:::keypoints
- Copy-and-swap gives safe assignment. Prefer the Rule of Zero.
- `std::move` is a cast. `noexcept` moves keep `vector` fast. A moved-from object is valid but unspecified.
- Symmetric operators as non-members. `<<` is a non-member. Do not overload `&&`, `||` or `,`.
:::
