---
title: "OOP interview: templates, STL and lambdas"
level: medium
time: 30
summary: Function and class templates, specialisation, SFINAE and concepts, CRTP, STL containers and their complexity, iterators, algorithms, lambdas and std::function.
---

## Templates

:::qa What is a template and how is it different from a macro? {level=easy}
A template is a blueprint the compiler instantiates for each type used. Unlike a macro it is type-checked, scoped and understands C++ syntax. The cost: every instantiation produces code (code bloat), and error messages can be long.
:::

:::qa Why are template definitions usually in headers? {level=medium}
The compiler must see the full definition when it instantiates the template for a type. If the body is in a `.cpp` file, other files cannot instantiate it and the linker reports undefined references, unless you instantiate explicitly there.
:::

:::qa What is template specialisation? Full vs partial? {level=medium}
A special version for particular types. **Full:** `template<> struct Hash<string> {...}` for exactly that type. **Partial:** `template<class T> struct Hash<T*> {...}` for a family of types (class templates only). Function templates cannot be partially specialised; use overloading.
:::

:::qa What is the difference between `typename` and `class` in a template parameter? {level=easy}
None in `template<class T>` / `template<typename T>`. But `typename` is required to tell the compiler a dependent name is a type: `typename T::value_type x;`.
:::

:::qa What is a variadic template? {level=hard}
A template with a **parameter pack**: `template<class... Args> void f(Args... args)`. Expand it with `args...`, recursion, or a C++17 fold expression: `(cout << ... << args);`. It is how `make_unique`, `tuple` and `printf`-like functions are built.
:::

:::qa What are C++20 concepts? {level=medium}
Named constraints on template parameters: `template<std::integral T> T twice(T x)` or `requires requires(T t) { t.draw(); }`. They give readable errors ("T does not satisfy integral") and replace most SFINAE tricks.
:::

:::qa What is SFINAE? {level=hard}
"Substitution Failure Is Not An Error": if substituting types into a function template's signature produces an invalid type, that overload is quietly dropped rather than causing a compile error. `enable_if` uses this to enable overloads by trait. Concepts and `if constexpr` are the modern, readable alternatives.
:::

:::qa What is `if constexpr`? {level=medium}
A compile-time `if`: the branch not taken is not even compiled for that instantiation. It lets one template body handle different types (`if constexpr (is_integral_v<T>) ... else ...`) without SFINAE.
:::

:::qa What is CRTP? {level=hard}
The Curiously Recurring Template Pattern: `class Derived : public Base<Derived>`. The base can call derived functions with `static_cast<Derived&>(*this)`, giving **static polymorphism** with no vtable and full inlining. Used for mixins (counting instances, comparison operators) and performance-critical interfaces.
:::

:::qa What is the difference between static and dynamic polymorphism? {level=medium}
Static: resolved at compile time via templates/overloading/CRTP: fast, inlinable, but types are fixed at compile time and code is duplicated. Dynamic: resolved at run time via virtual functions: flexible (plugins, heterogeneous containers), slower and requires inheritance.
:::

:::qa What is type erasure? {level=hard}
Hiding a concrete type behind a uniform interface without inheritance from the user's side. `std::function`, `std::any` and `shared_ptr`'s deleter store an object of any callable/type behind a small virtual interface created inside the template constructor.
:::

:::qa What are `decltype` and `auto` return types good for? {level=medium}
`decltype(expr)` gives the exact type of an expression. Together they let templates compute return types: `template<class A, class B> auto add(A a, B b) -> decltype(a + b)`; in C++14, plain `auto` return deduction is enough.
:::

## STL containers and algorithms

:::qa Compare `vector`, `list`, `deque`, `array` and when to use each. {level=easy}
| Container | Memory | Strong points | Cost |
|---|---|---|---|
| `vector` | contiguous | default choice; fast iteration; amortised O(1) `push_back` | insert/erase in the middle O(n) |
| `deque` | chunks | O(1) at both ends | slower iteration |
| `list` | nodes | O(1) insert/erase with an iterator, stable iterators | poor cache locality, no random access |
| `array` | contiguous, fixed | no heap, constexpr | size fixed |

Start with `vector`; measure before choosing anything else.
:::

:::qa `map` vs `unordered_map`: differences and complexities? {level=easy}
`map` is a balanced tree (red-black): sorted by key, O(log n) operations, needs `<`. `unordered_map` is a hash table: O(1) average (O(n) worst), unsorted, needs `hash` and `==`. Use `map` when you need ordering or range queries, otherwise `unordered_map`.
:::

:::qa Why does `map::operator[]` sometimes surprise people? {level=medium}
It **inserts** a default-constructed value if the key is missing (and so needs a default constructor, and cannot be used on a `const map`). Use `find`, `at` (throws) or `contains` (C++20) to only look.
:::

:::qa What is the difference between `set`, `multiset`, `map` and `multimap`? {level=easy}
`set`: unique sorted keys. `multiset`: duplicates allowed. `map`: unique keys with values. `multimap`: duplicate keys with values. Unordered variants use hashing.
:::

:::qa What is a `priority_queue` and how does it work? {level=easy}
A container adaptor over a vector that keeps a **binary heap**: `top()` is the largest element (O(1)), `push`/`pop` O(log n). For a min-heap pass `greater<T>`: `priority_queue<int, vector<int>, greater<int>>`.
:::

:::qa How does `vector` grow? What is `reserve`? {level=medium}
When full, it allocates a bigger block (typically 1.5x or 2x), moves/copies elements, and frees the old block, so `push_back` is amortised O(1). `reserve(n)` allocates capacity up front (no size change), avoiding reallocations and keeping iterators valid.
:::

:::qa What are the iterator categories? {level=medium}
Input, output, forward, bidirectional, random-access (and contiguous in C++20). Algorithms require a minimum category: `sort` needs random access (so not `list`; use `list::sort`), `reverse` needs bidirectional.
:::

:::qa What is the erase-remove idiom? {level=medium}
`std::remove` only shifts the kept elements forward and returns the new logical end; it does not shrink the container. Combine: `v.erase(remove(v.begin(), v.end(), x), v.end());` (C++20: `std::erase(v, x)`).
:::

:::qa What do you need to use a custom class as a key in `map` and `unordered_map`? {level=medium}
`map`: a strict weak ordering (`operator<` or a comparator). `unordered_map`: `operator==` and a `std::hash<T>` specialisation (or a hash functor as a template argument).
:::

:::qa `sort` is not stable. What do you use when you need stability? {level=medium}
`std::stable_sort`. Plain `sort` is introsort (O(n log n) worst case) and may reorder equal elements. Also the comparator must be a strict weak ordering: `<=` as comparison is undefined behaviour.
:::

:::qa What is the complexity of `find` in `vector` vs `set`? {level=easy}
`std::find` on a vector: O(n). On a sorted vector use `binary_search`/`lower_bound`: O(log n). `set::find`: O(log n). `unordered_set::find`: O(1) average.
:::

## Lambdas and callables

:::qa What is a lambda? Explain the capture list. {level=easy}
An anonymous function object defined in place: `[captures](params) -> ret { body }`. Captures: `[=]` copy all used variables, `[&]` reference all, `[x]` copy x, `[&x]` reference x, `[this]` the object pointer, `[x = move(y)]` init-capture. Prefer explicit captures.
:::

:::qa What is the danger of capturing by reference? {level=medium}
If the lambda outlives the variable (returned from a function, stored in a thread or callback), the reference dangles. Capture by value for anything that escapes. Likewise `[this]` can dangle if the object dies first.
:::

:::qa Why can't a normal lambda modify a by-value capture? {level=medium}
The lambda's `operator()` is `const` by default, so captured copies are read-only. Add `mutable` to modify the lambda's own copy: `[n]() mutable { return ++n; }` (the original is untouched).
:::

:::qa `std::function` vs a lambda vs a function pointer? {level=medium}
A function pointer holds only plain functions. A lambda has a unique, unnamed type and can hold state (fast, inlinable). `std::function<R(Args...)>` can hold **any** callable of that signature (type-erased), at the cost of a possible heap allocation and an indirect call. Use templates/`auto` parameters for speed, `std::function` for storing heterogeneous callbacks.
:::

:::qa What are generic lambdas? {level=medium}
Lambdas with `auto` parameters (C++14): `[](auto a, auto b) { return a + b; }` is a template under the hood. C++20 adds explicit `template<class T>` syntax.
:::

:::qa What is `std::bind` and why is it mostly replaced? {level=medium}
`bind` builds a callable with some arguments fixed. Lambdas do the same more readably (`[=](int y) { return f(5, y); }`) and inline better, so prefer lambdas.
:::

:::qa How do you sort a vector of objects by two fields? {level=easy}
```cpp
sort(people.begin(), people.end(), [](const Person& a, const Person& b) {
    return tie(a.age, a.name) < tie(b.age, b.name);       // tuple comparison
});
```
:::

```quiz
? Which container gives O(1) average lookup by key?
- map
+ unordered_map
- list
> Hashing; map is a tree with O(log n).
? A lambda captures a local by reference and is returned from the function. What happens when it is called?
- Works fine
+ Undefined behaviour: the reference dangles
- Compile error
> Capture by value for anything that escapes.
```

:::keypoints
- Templates: header definitions, specialisation, concepts replace SFINAE, CRTP = static polymorphism.
- Default to `vector`; `map` is ordered O(log n), `unordered_map` O(1) average; erase-remove idiom.
- Lambdas: explicit captures, never let by-reference captures escape; `std::function` costs, templates do not.
:::
