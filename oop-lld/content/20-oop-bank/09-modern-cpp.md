---
title: "OOP interview: modern C++ (11 to 23)"
level: medium
time: 25
summary: What changed in C++11, 14, 17, 20 and 23 that interviewers expect you to know: move semantics, smart pointers, lambdas, structured bindings, optional and variant, string_view, concepts, ranges, coroutines and modules.
---

:::qa What are the most important features added in C++11? {level=easy}
`auto`, range-based `for`, move semantics (`&&`), smart pointers, lambdas, `nullptr`, `constexpr`, `override`/`final`, `enum class`, variadic templates, `std::thread`/`mutex`/`atomic`, `unordered_*` containers, `= default`/`= delete`, uniform (brace) initialisation, `static_assert`.
:::

:::qa What was added in C++14 and C++17? {level=medium}
**C++14:** generic lambdas, `make_unique`, return type deduction, variable templates, binary literals and digit separators (`1'000'000`).
**C++17:** structured bindings, `if` with initialiser, `optional`/`variant`/`any`, `string_view`, `if constexpr`, fold expressions, `std::filesystem`, parallel algorithms, guaranteed copy elision, `inline` variables, class template argument deduction (`pair p{1, 2.0};`).
:::

:::qa What are the big features of C++20? {level=medium}
**Concepts**, **ranges**, **coroutines**, **modules**, the three-way comparison `<=>`, `std::span`, `constexpr` improvements, designated initialisers, `std::jthread`, calendar and time zones, `std::format`, `consteval`.
:::

:::qa What is new in C++23 that is worth mentioning? {level=medium}
`std::expected` (value or error), `std::print`/`println`, `std::mdspan`, `std::flat_map`, deducing `this` ("explicit object parameter"), `std::generator`, `if consteval`, `std::stacktrace`, and more `constexpr` support.
:::

:::qa What are structured bindings? {level=easy}
Unpack tuples, pairs, arrays and simple structs into named variables: `auto [name, age] = person;` or `for (auto& [key, value] : map)`. They bind names to the members, not new copies when you write `auto&`.
:::

:::qa What is `std::optional` vs `std::variant` vs `std::any`? {level=medium}
`optional<T>`: a T or nothing. `variant<A, B, C>`: exactly one of a **fixed set** of types, type-safe (`std::visit`). `any`: one value of **any** type, checked at run time (`any_cast`), type-erased and slower. Prefer variant when the set is known.
:::

:::qa What is `std::string_view`? Name the main risk. {level=medium}
A non-owning view (pointer + length) of characters, cheap to copy and substring. The risk is **lifetime**: a view of a temporary string or one that gets modified or freed dangles.
:::

:::qa What is `std::span`? {level=medium}
A non-owning view over a contiguous sequence (`vector`, array, C array), with size: `void f(std::span<const int> data)`. It replaces `(pointer, length)` pairs safely.
:::

:::qa What is the ranges library? {level=medium}
C++20 composable, lazy views over sequences with a pipe syntax: `v | views::filter(even) | views::transform(square)`. Algorithms accept whole containers (`ranges::sort(v)`), and no temporary vectors are made for the intermediate steps.
:::

:::qa What are coroutines in C++20? {level=hard}
Functions that can **suspend and resume** (`co_await`, `co_yield`, `co_return`). The compiler turns them into state machines stored in a heap frame. They are the base for generators, lazy sequences and async I/O frameworks; the standard supplies only the mechanism, libraries supply the types.
:::

:::qa What are modules? {level=hard}
A C++20 replacement for header files: `import std;` or `import mylib;`. Compiled once, no textual inclusion, no macro leaks, faster builds. Tool and library support is still maturing.
:::

:::qa What is `consteval` vs `constexpr`? {level=hard}
`constexpr` functions *may* run at compile time (or run time). `consteval` ("immediate") functions *must* run at compile time; every call is evaluated by the compiler. `constinit` guarantees a variable is initialised at compile time but may stay mutable.
:::

:::qa What is class template argument deduction (CTAD)? {level=medium}
Since C++17 you can omit template arguments when the compiler can deduce them from constructor arguments: `std::vector v{1, 2, 3};` is a `vector<int>`; `std::pair p{1, 2.5};` is `pair<int, double>`.
:::

:::qa What is a designated initialiser? {level=easy}
C++20 lets you name aggregate members in order: `Point p{.x = 1, .y = 2};`. It makes initialisation self-documenting.
:::

:::qa What are the "attributes" you should know? {level=medium}
`[[nodiscard]]` (warn if the result is ignored: use on error codes and factories), `[[maybe_unused]]`, `[[deprecated("use g")]]`, `[[fallthrough]]`, `[[likely]]`/`[[unlikely]]`, `[[noreturn]]`.
:::

:::qa What is `std::jthread` and `stop_token`? {level=hard}
C++20's `jthread` is a `thread` that **joins on destruction** and supports cooperative cancellation through a `stop_token` (`request_stop()`), removing two of `std::thread`'s classic mistakes.
:::

:::qa How do you decide which C++ standard to teach or use in a project? {level=medium}
Use the newest standard that all your compilers and platforms support. In interviews, write C++17 baseline (it is safe everywhere), mention C++20 features (concepts, ranges, `<=>`) where they help, and say that you would check the project's constraints.
:::

```quiz
? Which type safely holds one value out of a fixed set of types?
- union
- std::any
+ std::variant
> variant tracks the active alternative; any allows any type with run-time checks.
? A string_view of a temporary std::string is dangerous because...
- It is slow
+ It does not own the characters and may dangle
- It cannot be compared
> Keep the owner alive as long as the view.
```

:::keypoints
- C++11 = the big shift; 14/17 polish and vocabulary types (`optional`, `variant`, `string_view`); 20 = concepts, ranges, coroutines, modules, `<=>`.
- Views (`string_view`, `span`, ranges) do not own: watch lifetimes.
- Know one-line definitions of each new feature; show the 17 baseline.
:::
