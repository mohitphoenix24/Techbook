---
title: "OOP interview: C++ basics"
level: easy
time: 30
summary: References and pointers, const, static, inline, storage duration, namespaces, enums, strings, initialisation and the small details that interviewers love to probe.
---

## References and pointers

:::qa What is the difference between a pointer and a reference? {level=easy}
| | Pointer | Reference |
|---|---|---|
| Can be null | yes | no (must refer to an object) |
| Can be reseated | yes | no (bound once) |
| Syntax | `*p`, `p->x` | used like the object itself |
| Needs initialisation | no (but should) | yes |
| Arithmetic | yes | no |

A reference is an alias. Use references for parameters that must exist; use pointers when "no object" is a valid answer (or use `std::optional`).
:::

:::qa What is the difference between `const int*`, `int* const` and `const int* const`? {level=medium}
Read right to left.
- `const int* p`: pointer to a **constant int** (cannot change `*p`, can change `p`).
- `int* const p`: **constant pointer** to int (can change `*p`, cannot change `p`).
- `const int* const p`: neither can change.
:::

:::qa What does `const` after a member function mean? {level=easy}
`int get() const;` promises not to modify the object's (non-`mutable`) members. It makes `this` a `const T*`, so the function can be called on const objects. Mark every function that only reads state as `const`.
:::

:::qa What is `mutable`? {level=medium}
A member marked `mutable` can be changed inside `const` member functions. Use it for things that are not part of the logical state: caches, lazy values, mutexes, counters.
:::

:::qa Pass by value, by reference, by const reference, by pointer: when do you use each? {level=easy}
- **const T&** for read-only access to anything bigger than a few bytes (strings, vectors, objects).
- **T&** when the function must modify the caller's object (an out parameter).
- **T** (by value) for small types (`int`, `double`), or when you need your own copy anyway (then `move` it in).
- **T*** when null is meaningful, or for C APIs.
- **T&&** / by value + `std::move` for sink parameters that take ownership.
:::

:::qa What is a dangling reference or pointer? Give an example. {level=medium}
One that refers to an object that no longer exists. Classic: returning a reference to a local variable, keeping a pointer into a `vector` after it reallocates, or holding `string_view` of a temporary string. Using it is undefined behaviour.
:::

:::qa What is the difference between `NULL`, `0` and `nullptr`? {level=easy}
`NULL` is a macro (usually `0`), so `f(NULL)` may call `f(int)` instead of `f(char*)`. `nullptr` has its own type `std::nullptr_t`, converts to any pointer type and never to an integer. Always use `nullptr`.
:::

:::qa What is the difference between stack and heap memory? {level=easy}
The **stack** holds local variables: allocation is just moving a pointer, freed automatically at scope end, size is limited (a few MB). The **heap** (free store) holds objects created with `new`/`make_unique`: flexible size and lifetime, slower, and must be released (RAII). Prefer the stack; use the heap when the size or lifetime is dynamic.
:::

:::qa What are the storage durations in C++? {level=medium}
**Automatic** (locals, destroyed at scope end), **static** (globals, `static` locals, live for the whole program), **dynamic** (created with `new`, live until deleted) and **thread** (`thread_local`, one per thread).
:::

## Keywords and declarations

:::qa What does `static` mean in C++? It has several uses. {level=medium}
1. Local variable: initialised once, keeps its value between calls.
2. Class member: shared by all objects.
3. Free function or global at file scope: **internal linkage** (not visible in other files).
4. Static member function: no `this`.
:::

:::qa What does `inline` really mean today? {level=medium}
It is mostly about the **one definition rule**: an `inline` function or variable may be defined in several translation units (it must be identical), which is why header-only functions are `inline`. Whether the compiler actually expands it is its own decision.
:::

:::qa What is `constexpr`? How is it different from `const`? {level=medium}
`const` means "cannot change after initialisation" (the value may be known only at run time). `constexpr` means "can be evaluated at compile time" and is usable in constant expressions (array sizes, template arguments). A `constexpr` function may also run at run time.
:::

:::qa What is `auto` and when should you use it? {level=easy}
`auto` deduces the type from the initialiser. Use it for long or obvious types (iterators, `make_unique`, lambdas). Do not hide information: `auto x = 5;` is fine, `auto r = compute();` when the type matters for the reader is not. Remember `auto` drops `const` and references; use `const auto&` when you mean it.
:::

:::qa What is `explicit` for? {level=medium}
It stops a constructor (or conversion operator) from being used for **implicit conversions**. Without it, `void f(Buffer b); f(10);` may silently build a `Buffer` from `10`. Mark single-argument constructors `explicit` by default.
:::

:::qa What is a namespace and why use one? {level=easy}
A named scope that prevents name clashes between libraries. Avoid `using namespace std;` in headers (it pollutes everyone who includes the file). In `.cpp` files it is acceptable in small programs.
:::

:::qa What is the difference between `enum` and `enum class`? {level=easy}
Plain `enum` values leak into the enclosing scope and convert implicitly to `int`. `enum class` is scoped (`Color::Red`) and does not convert implicitly, which prevents mistakes. Prefer `enum class`; you can choose the underlying type: `enum class Level : uint8_t`.
:::

:::qa What is the difference between `#define` and `const`/`constexpr`? {level=easy}
`#define` is text replacement by the preprocessor: no type, no scope, surprising with expressions (`#define SQ(x) x*x` breaks on `SQ(a+1)`). `constexpr` values and functions are typed, scoped and debuggable. Use macros only for conditional compilation and include guards.
:::

:::qa What are include guards and `#pragma once`? {level=easy}
They stop a header from being included twice in one translation unit, which would redefine classes. Classic guard: `#ifndef X_H / #define X_H / ... / #endif`. `#pragma once` does the same in one line and is supported by all major compilers.
:::

:::qa What is the difference between declaration and definition? {level=easy}
A declaration introduces a name and its type (`int f(int);`, `extern int x;`, `class A;`). A definition also creates the entity (the function body, the variable's storage, the class members). You may declare many times but define once (the One Definition Rule).
:::

:::qa What is a translation unit and what does the linker do? {level=medium}
A translation unit is one `.cpp` file after the preprocessor has pasted its includes. Each is compiled separately into an object file. The **linker** joins object files, matches declarations with definitions and reports "undefined reference" or "multiple definition" errors.
:::

## Initialisation and strings

:::qa What are the different ways to initialise a variable? Which is safest? {level=medium}
`int a = 5;` (copy), `int b(5);` (direct), `int c{5};` (brace/uniform), `int d = {5};`. **Brace initialisation** is safest because it forbids narrowing (`int x{3.5};` is an error) and works everywhere. Caveat: `vector<int> v{5, 1}` picks the initializer-list constructor (two elements), not "5 copies of 1".
:::

:::qa What is the difference between `std::string`, `const char*` and `std::string_view`? {level=medium}
`const char*` is a raw pointer to characters, with no length or ownership. `std::string` owns and manages its buffer. `std::string_view` is a **non-owning** pointer plus length: cheap to pass, but it must not outlive the text it views.
:::

:::qa What is the Small String Optimisation (SSO)? {level=hard}
Most `std::string` implementations store short strings (about 15 to 22 characters) inside the string object itself, with no heap allocation. It makes short strings fast, and is why moving a short string is really a copy of its bytes.
:::

:::qa What are uninitialised variables and why are they dangerous? {level=easy}
A local `int x;` has an **indeterminate** value; reading it is undefined behaviour. Globals and statics are zero-initialised. Always initialise: `int x{};` gives zero.
:::

:::qa What is undefined behaviour? Give three examples. {level=medium}
The standard places no requirements on what happens: the program may crash, give wrong answers, or seem fine. Examples: out-of-bounds access, dereferencing null or a dangling pointer, signed integer overflow, reading an uninitialised variable, data races, deleting twice. The compiler may assume UB never happens and optimise accordingly.
:::

:::qa What is the difference between `++i` and `i++`? Which is faster? {level=easy}
`++i` increments and returns the **new** value (by reference); `i++` returns the **old** value (a copy). For ints the compiler makes them equal, but for iterators and class types, prefer `++i` to avoid the copy.
:::

:::qa What is the difference between `==` on `const char*` and on `std::string`? {level=easy}
On `const char*` it compares **addresses**, not text (use `strcmp`). On `std::string` it compares the contents.
:::

:::qa What is `size_t` and what is the classic pitfall with it? {level=medium}
`size_t` is an unsigned type for sizes and indexes. `for (size_t i = n - 1; i >= 0; --i)` never ends because an unsigned value cannot be negative, and `v.size() - 1` wraps around to a huge number for an empty vector. Compare carefully, or use signed `ptrdiff_t`/`ssize` where subtraction occurs.
:::

```quiz
? Which declaration lets you change the pointed-to value but not the pointer itself?
- const int* p
+ int* const p
- const int* const p
> `int* const` is a constant pointer to a modifiable int.
? What does `explicit` on a constructor prevent?
- Copying
+ Implicit conversions from the argument type
- Inheritance
> It stops `f(10)` from silently creating an object.
```

:::keypoints
- References are non-null aliases; pointers can be null and reseated.
- `const` everywhere it applies; `constexpr` for compile-time; `explicit` for single-argument constructors.
- Know UB, dangling references and the unsigned-size pitfall.
:::
