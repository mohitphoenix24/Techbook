---
title: "OOP interview: copying, moving and operators"
level: medium
time: 30
summary: Copy constructor and assignment, copy elision, lvalues and rvalues, std::move and forwarding, move semantics pitfalls, and operator overloading rules.
---

## Copying

:::qa What is a copy constructor? When is it called? {level=easy}
`T(const T& other)` builds a new object as a copy of an existing one. It runs when you initialise from another object (`T b = a;`, `T b(a);`), pass or return by value (when not elided), and when containers copy elements.
:::

:::qa Why must the copy constructor take its parameter by reference? {level=medium}
If it took the argument by value, passing the argument would itself need a copy constructor, which would call itself again: infinite recursion. The compiler rejects `T(T)`.
:::

:::qa What is the difference between copy construction and copy assignment? {level=easy}
Construction creates a **new** object (`T b = a;`). Assignment replaces the value of an **existing** object (`b = a;`) so it must release the old resources first and handle self-assignment.
:::

:::qa How do you write a correct copy assignment operator? {level=medium}
Use **copy-and-swap**: take the argument by value, then swap.
```cpp
Buffer& operator=(Buffer other) noexcept {   // copy (or move) happens in the parameter
    swap(other);                              // exchange guts
    return *this;                             // old data dies with 'other'
}
```
It is exception-safe, handles self-assignment, and serves as both copy and move assignment.
:::

:::qa What is self-assignment and how do you guard against it? {level=medium}
`a = a;` (maybe through aliases like `v[i] = v[j]`). A naive operator that frees its data first would destroy the source. Either check `if (this == &other) return *this;` or use copy-and-swap, which is safe without a check.
:::

:::qa What is copy elision and RVO? {level=medium}
The compiler may skip a copy or move by constructing the object directly in its final place. Returning a prvalue (`return T{...};`) is **guaranteed** to be elided since C++17. Returning a local by name (NRVO) is allowed but optional. So do not write `return std::move(local);`: it prevents NRVO.
:::

:::qa Which functions are generated automatically, and when are they suppressed? {level=hard}
- Declaring a destructor, copy constructor or copy assignment suppresses the **move** operations (they fall back to copying).
- Declaring a move operation deletes the copy operations.
- Declaring any constructor suppresses the default constructor.

Hence the advice: follow the Rule of 0 or define all five.
:::

## Move semantics

:::qa What are lvalues and rvalues? {level=medium}
An **lvalue** has a name and an address; you can take `&x` (variables). An **rvalue** is a temporary that is about to disappear (`f()`, `a + b`, `std::move(x)`). Rvalue references (`T&&`) bind to rvalues, so a function can **steal** from them.
:::

:::qa What is move semantics and why was it added? {level=medium}
It transfers a resource from a temporary (or expiring) object to another instead of copying it: a move constructor copies the pointer and nulls the source. Returning big objects and growing containers became cheap, and unique-ownership types became possible.
:::

:::qa What does `std::move` actually do? {level=medium}
Nothing at run time. It is a **cast** to an rvalue reference (`static_cast<T&&>(x)`). The actual stealing happens in the move constructor or assignment that is then selected by overload resolution.
:::

:::qa What state is a moved-from object in? {level=medium}
"Valid but unspecified": you may destroy it or assign to it, but you should not rely on its value. For standard types it is usually empty. Do not use a moved-from object without resetting it.
:::

:::qa Why should move operations be `noexcept`? {level=hard}
`std::vector` uses `std::move_if_noexcept` when growing: if the move constructor may throw, it **copies** instead to keep its strong guarantee. A throwing move turns cheap reallocation into expensive copies. Mark moves `noexcept`.
:::

:::qa What is a universal (forwarding) reference? {level=hard}
In a deduced context like `template<class T> void f(T&& x)` or `auto&& x`, `T&&` can bind to both lvalues and rvalues (reference collapsing makes `T` become `U&` for lvalues). It is not an rvalue reference. Use `std::forward<T>(x)` to pass it on with its original value category.
:::

:::qa What is perfect forwarding, and where is it used? {level=hard}
Passing arguments through a wrapper so the callee sees the same lvalue/rvalue-ness as the original call. Used in `make_unique`, `emplace_back`, `std::thread` and decorator-style wrappers:
```cpp
template<class T, class... A> unique_ptr<T> make(A&&... a) { return unique_ptr<T>(new T(std::forward<A>(a)...)); }
```
:::

:::qa `push_back` vs `emplace_back`: what is the difference? {level=medium}
`push_back(x)` needs an existing object (copied or moved in). `emplace_back(args...)` **constructs the element in place** from the arguments, saving a temporary. Often equal in speed with moves, but `emplace_back` can use `explicit` constructors by accident.
:::

:::qa Should you return by `const` value or by reference from a function? {level=medium}
Return by **value** for new objects (cheap thanks to elision and moves). Return a reference only to something that outlives the call (a member, a static). Returning a `const` value blocks moves, so do not.
:::

:::qa What is the "moved-from member" mistake in a move constructor? {level=hard}
Forgetting to **reset the source** (leaving two owners of one pointer: double free) or forgetting `std::move` on member sub-objects, which silently copies them (a named `T&&` parameter is an lvalue inside the function).
:::

:::qa What does `std::swap` do and how can you make it fast for your class? {level=medium}
The generic version does a move-construct and two move-assigns. For your class, provide a `noexcept` member `swap` and a friend `swap(a, b)` that swaps the members; call it with `using std::swap; swap(a, b);` so ADL finds yours.
:::

## Operator overloading

:::qa Which operators cannot be overloaded? {level=easy}
`::` (scope), `.` (member access), `.*`, `?:` (ternary), `sizeof`, `typeid` and the cast operators (`static_cast` and others). Also you cannot invent new operators or change precedence.
:::

:::qa Member or non-member: how do you decide for an operator? {level=medium}
`=`, `[]`, `()`, `->` **must** be members. Operators that change the object (`+=`, `++`) are best as members. Symmetric operators (`+`, `==`, `<`) as **non-members** (often `friend`) so conversions apply to both operands. Stream operators `<<`, `>>` must be non-members because the left operand is the stream.
:::

:::qa How do you overload the pre-increment and post-increment operators? {level=medium}
```cpp
Counter& operator++()    { ++n; return *this; }                       // ++c
Counter  operator++(int) { Counter old = *this; ++n; return old; }    // c++ (dummy int)
```
:::

:::qa How do you overload `operator<<` for output? {level=easy}
As a non-member (friend if it needs privates) that takes the stream by reference and returns it:
```cpp
ostream& operator<<(ostream& os, const Point& p) { return os << '(' << p.x << ", " << p.y << ')'; }
```
:::

:::qa What is the spaceship operator `<=>`? {level=medium}
C++20's three-way comparison. `auto operator<=>(const T&) const = default;` generates all of `<`, `<=`, `>`, `>=` (and `==` with a defaulted `operator==`) by comparing members in order. It removes pages of boilerplate.
:::

:::qa What is a functor? {level=easy}
An object that can be called like a function because its class defines `operator()`. It can hold state between calls, unlike a plain function. Lambdas are compiler-generated functors.
:::

:::qa What is a conversion operator and a risk of it? {level=medium}
`operator double() const` lets an object convert to another type. Implicit conversions can cause surprising overloads and comparisons; mark them `explicit` (`explicit operator bool()` is the usual safe case).
:::

:::qa Why should `operator&&` and `operator||` not be overloaded? {level=hard}
The built-in versions short-circuit (the right side is not evaluated if the left decides). Overloaded versions are ordinary functions, so **both operands are always evaluated** and their order is unspecified. The same caution applies to the comma operator.
:::

```quiz
? Returning a local variable: which is best?
- return std::move(local);
+ return local;
- return &local;
> Plain `return local;` allows copy elision (NRVO) and moves otherwise.
? std::move(x) on its own...
- Moves the data of x
+ Casts x to an rvalue reference; a move constructor/assignment does the actual moving
- Deletes x
> Only the receiving function steals.
```

:::keypoints
- Copy-and-swap gives exception-safe assignment; prefer the Rule of 0.
- `std::move` is a cast; `noexcept` moves keep `vector` fast; moved-from = valid but unspecified.
- Symmetric operators as non-members; `<<` is a non-member; do not overload `&&`, `||`, `,`.
:::
