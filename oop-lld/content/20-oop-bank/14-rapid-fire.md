---
title: "OOP interview: rapid fire"
level: easy
time: 25
summary: Fifty-six one-line questions with one-line answers on C++ trivia, library facts and concurrency basics: the quick round at the end of an interview.
---

One line each. If you cannot answer in under ten seconds, mark it for revision.

:::qa Can a constructor be `const`? {level=easy}
No. A constructor has to modify the object to build it.
:::

:::qa Can a static member function be `virtual` or `const`? {level=easy}
Neither: it has no `this`, so no dynamic type and no object to be const.
:::

:::qa Can you overload a function on its return type alone? {level=easy}
No. Overloads must differ in parameters; return type is not part of the overload resolution.
:::

:::qa What is the size of an empty class? {level=easy}
1 byte, so that distinct objects have distinct addresses (it can be 0 with `[[no_unique_address]]` as a member).
:::

:::qa Can a class have a virtual constructor? {level=easy}
No. Use a virtual `clone()` or a factory.
:::

:::qa Can a pure virtual function be defined? {level=easy}
Yes. It can have a body that derived classes call explicitly.
:::

:::qa What happens if you do not define a pure virtual function in a derived class? {level=easy}
The derived class stays abstract and cannot be instantiated.
:::

:::qa Can an abstract class have a constructor? {level=easy}
Yes. Derived constructors call it to initialise the base part.
:::

:::qa Can a destructor be overloaded? {level=easy}
No. It has no parameters, so there is exactly one.
:::

:::qa Is `main` allowed to be recursive in C++? {level=easy}
No. Calling `main` from the program is not allowed (undefined in C++, unlike C).
:::

:::qa What does `const` on a data member imply for assignment? {level=easy}
The class's copy assignment becomes implicitly deleted, since the member cannot be reassigned.
:::

:::qa Can a reference member be reseated? {level=easy}
No. A class with a reference member is not assignable by default and must initialise it in the initialiser list.
:::

:::qa What is the output type of `sizeof`? {level=easy}
`size_t`, an unsigned integer. `sizeof` is evaluated at compile time (except for variable-length arrays in C).
:::

:::qa What is the difference between `struct` padding and packing? {level=easy}
Padding aligns members for speed; packing (`#pragma pack`) removes it and may slow access or crash on some CPUs.
:::

:::qa Does `delete nullptr` crash? {level=easy}
No, deleting a null pointer is safe and does nothing.
:::

:::qa What happens on `delete` of a pointer twice? {level=easy}
Undefined behaviour (usually heap corruption). Set to `nullptr` or use smart pointers.
:::

:::qa What is `nullptr_t`? {level=easy}
The type of `nullptr`. It converts to any pointer type but not to integers.
:::

:::qa Does `new` return null on failure? {level=easy}
No. It throws `std::bad_alloc`. `new (std::nothrow) T` returns null instead.
:::

:::qa What does `explicit` do on a conversion operator? {level=easy}
It stops implicit conversions; only an explicit cast or contextual use (like `if (x)`) works.
:::

:::qa What is `std::move_if_noexcept`? {level=easy}
It returns an rvalue only if the move constructor cannot throw, otherwise an lvalue (copy). `vector` uses it to keep the strong guarantee.
:::

:::qa What is the difference between `std::array` and a C array? {level=easy}
`std::array` knows its size, does not decay to a pointer, and can be copied and compared.
:::

:::qa Can you return an array from a function? {level=easy}
Not a raw array. Return `std::array`, `vector`, or a struct containing one.
:::

:::qa What is the difference between `++i` and `i++` for iterators? {level=easy}
Prefer `++i`: the postfix form makes a copy of the old iterator.
:::

:::qa What is a trivial type / POD? {level=easy}
A type with trivial special members and standard layout, so it can be copied with `memcpy` and shared with C.
:::

:::qa What does `final` do on a virtual function? {level=easy}
Forbids derived classes from overriding it (and allows the compiler to devirtualise calls).
:::

:::qa What does the `override` keyword add? {level=easy}
A compile-time check that the function really overrides a base virtual function.
:::

:::qa Why can't you call a derived-only function through a base pointer? {level=easy}
The static type decides which names are visible. Cast to the derived type (with `dynamic_cast`) or add the function to the base interface.
:::

:::qa What is `typeid(*p)` vs `typeid(p)`? {level=easy}
`typeid(*p)` is the dynamic type of the object a polymorphic pointer points to; `typeid(p)` is just the pointer type.
:::

:::qa Which STL container is best by default? {level=easy}
`std::vector`. It is contiguous, cache-friendly, and fast for most workloads.
:::

:::qa When is `std::list` better than `std::vector`? {level=easy}
Rarely: when you need stable iterators and constant-time insertion or removal in the middle, such as splicing.
:::

:::qa Why is `vector<bool>` special? {level=easy}
It is bit-packed and its `operator[]` returns a proxy, not a `bool&`. Use `deque<bool>` or `vector<char>` when you need real references.
:::

:::qa What is a `const_iterator`? {level=easy}
An iterator that does not allow modifying the element. Use `cbegin()/cend()` to get one.
:::

:::qa What is amortised O(1)? {level=easy}
Most operations are O(1), the rare expensive one (a reallocation) is spread over many cheap ones, so the average per operation is constant.
:::

:::qa What is a strict weak ordering? {level=easy}
A comparison `a < b` that is irreflexive, asymmetric, transitive and gives transitive equivalence. Needed by `sort` and `map`.
:::

:::qa Is `unordered_map` iteration order stable? {level=easy}
No. It depends on hashing and rehashing; never rely on it.
:::

:::qa What are the three main kinds of `std::mutex` locking helpers? {level=easy}
`lock_guard` (simple scope lock), `unique_lock` (movable, unlockable, works with condition variables), `scoped_lock` (several mutexes without deadlock).
:::

:::qa What does `std::atomic` guarantee? {level=easy}
Operations on that variable are indivisible and ordered according to the memory order you choose (sequentially consistent by default).
:::

:::qa What is a condition variable used for? {level=easy}
Letting a thread wait until another thread signals that a condition is true. Always wait with a predicate to handle spurious wakeups.
:::

:::qa What is a deadlock's four conditions? {level=easy}
Mutual exclusion, hold and wait, no pre-emption, circular wait. Break any one (usually lock ordering).
:::

:::qa What is the difference between `std::async` and `std::thread`? {level=easy}
`async` returns a `future` for the result (and may run lazily); `thread` is a bare thread with no result channel.
:::

:::qa What is RAII for locks? {level=easy}
`lock_guard`/`scoped_lock` lock in the constructor and unlock in the destructor, so exceptions cannot leave a mutex locked.
:::

:::qa What are the SOLID principles in one line each? {level=easy}
Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion.
:::

:::qa Define dependency injection in one sentence. {level=easy}
An object receives its collaborators from outside (constructor parameters) instead of creating them, so they can be replaced and tested.
:::

:::qa What is a header guard for? {level=easy}
Preventing multiple inclusion of the same header in one translation unit.
:::

:::qa What is forward declaration? {level=easy}
Declaring a class (`class A;`) without defining it, so you can use pointers or references to it and reduce include dependencies.
:::

:::qa What is the difference between a shallow and a deep `const`? {level=easy}
`const` on a pointer member does not make the pointee const. `const` member functions are only shallow for raw pointers.
:::

:::qa What is the `explicit` copy constructor effect? {level=easy}
Copy initialisation (`T b = a;`, passing by value) fails; only direct initialisation works.
:::

:::qa What is a trailing return type? {level=easy}
`auto f(int) -> int`. It is needed when the return type depends on the parameters or for lambdas with explicit returns.
:::

:::qa What is the difference between `std::endl` and `'\n'`? {level=easy}
`endl` writes a newline **and flushes** the stream, which is slow in loops. Use `'\n'`.
:::

:::qa What does `std::ios::sync_with_stdio(false)` do? {level=easy}
Decouples C++ streams from C stdio, making `cin`/`cout` much faster (do not mix with `printf` afterwards).
:::

:::qa How do you print a pointer's address? {level=easy}
`cout << static_cast<const void*>(p);` (a `char*` would print as a string).
:::

:::qa What is an lvalue reference to const useful for? {level=easy}
It binds to anything (lvalues, rvalues, temporaries) and extends a temporary's life: ideal for read-only parameters.
:::

:::qa What is a `using` alias vs `typedef`? {level=easy}
Same meaning, `using` is clearer and works with templates: `template<class T> using Vec = std::vector<T>;`.
:::

:::qa What is Argument-Dependent Lookup (ADL)? {level=easy}
Unqualified function calls also search the namespaces of the argument types. It is why `swap(a, b)` finds your own `swap` and `cout << x` finds `operator<<`.
:::

:::qa What is the order of evaluation of function arguments? {level=easy}
Unspecified (each argument is evaluated fully before the call, but in any order). Do not write `f(i++, i++)`.
:::

:::qa Is `main` required to return a value? {level=easy}
No, falling off the end of `main` returns 0 implicitly.
:::

```quiz
? Which smart pointer would you choose by default for a single owner?
- shared_ptr
+ unique_ptr
- weak_ptr
> It costs nothing extra and shows exclusive ownership.
```

:::keypoints
- Short, exact answers win the quick round: state the rule, then the one-word reason.
- Review the ones you hesitated on again tomorrow.
:::
