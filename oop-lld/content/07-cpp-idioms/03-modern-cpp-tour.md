---
title: A tour of modern C++ for designers
level: intermediate
time: 35
summary: The C++11 to C++20 features that change how classes are designed: auto and range-for, structured bindings, optional and variant, string_view and span, constexpr, enum class, ranges, chrono, and [[nodiscard]], each with a short demo.
---

You do not need every new feature. You need the ones that make your **designs** safer and shorter. Here they are, in order of how often they appear in interviews.

## Quick wins

```cpp run title="Range-for, auto, structured bindings, init-statements"
#include <iostream>
#include <map>
#include <string>
#include <vector>
using namespace std;

int main() {
    vector<string> langs{"C++", "Rust", "Go"};
    for (const auto& l : langs) cout << l << " ";                    // range-for: no index, no iterator
    cout << "\n";

    map<string, int> year{{"C++", 1985}, {"Rust", 2010}, {"Go", 2009}};
    for (const auto& [name, y] : year) cout << name << "=" << y << " ";     // structured bindings (C++17)
    cout << "\n";

    if (auto it = year.find("Go"); it != year.end())                 // variable scoped to the if (C++17)
        cout << "Go is from " << it->second << "\n";
}
```

## nullptr, enum class, override, final, = default, = delete

These are the C++11 "make the compiler help you" features. You have met them all: `nullptr` (not `0`/`NULL`), `enum class`, `override`/`final`, `= default`/`= delete`, `explicit`. Use them *always*.

## constexpr: compute at compile time

```cpp run title="constexpr functions and classes"
#include <array>
#include <iostream>
using namespace std;

constexpr int factorial(int n) { return n <= 1 ? 1 : n * factorial(n - 1); }

class Point {
    int x_, y_;
public:
    constexpr Point(int x, int y) : x_(x), y_(y) {}
    constexpr int manhattan() const { return (x_ < 0 ? -x_ : x_) + (y_ < 0 ? -y_ : y_); }
};

int main() {
    constexpr int f5 = factorial(5);                  // computed by the compiler
    static_assert(f5 == 120);
    constexpr Point p(3, -4);
    static_assert(p.manhattan() == 7);                // an object built and used at compile time
    array<int, factorial(4)> table{};                 // 24 elements
    cout << f5 << " " << p.manhattan() << " " << table.size() << "\n";
}
```

`constexpr` values are checked **at compile time**, cost nothing at run time, and are the modern replacement for `#define`. `consteval` (C++20) forces compile time, and `constinit` forces constant initialisation of a static.

## string_view and span: non-owning views

```cpp run title="Pass views, not copies"
#include <iostream>
#include <span>
#include <string>
#include <string_view>
#include <vector>
using namespace std;

bool isShout(string_view s) {                          // accepts string, const char*, substrings: no copy, no allocation
    for (char c : s) if (c >= 'a' && c <= 'z') return false;
    return !s.empty();
}

int sum(span<const int> xs) {                          // accepts vector, array, C array: pointer + length
    int t = 0;
    for (int x : xs) t += x;
    return t;
}

int main() {
    string s = "HELLO";
    cout << isShout(s) << isShout("hello") << isShout(string_view(s).substr(0, 3)) << "\n";
    vector<int> v{1, 2, 3, 4};
    int arr[] = {10, 20};
    cout << sum(v) << " " << sum(arr) << " " << sum(span(v).subspan(1, 2)) << "\n";
}
```

Use them for **function parameters** you only read. Do not store them in a class unless the owner is guaranteed to outlive them.

## optional, variant, any (a reminder)

- `optional<T>`: a value or nothing. `variant<A,B>`: one of several types. `any`: one value of *any* type (type-erased, runtime-checked; rarely the right choice).

## Ranges and views (C++20)

```cpp run title="Composable pipelines"
#include <iostream>
#include <ranges>
#include <vector>
using namespace std;

int main() {
    vector<int> v{1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    auto result = v
        | views::filter([](int x) { return x % 2 == 0; })        // keep even numbers
        | views::transform([](int x) { return x * x; })           // square them
        | views::take(3);                                         // only the first three
    for (int x : result) cout << x << " ";                        // lazy: computed as we iterate
    cout << "\n";
}
```

## chrono: types for time

Never pass "seconds" as a bare `int` or `double`. Use `std::chrono` types so the compiler checks the units.

```cpp run title="Durations with units"
#include <chrono>
#include <iostream>
using namespace std;
using namespace std::chrono_literals;

chrono::seconds timeout() { return 90s; }

int main() {
    auto t = timeout() + 5min;                                          // different units combine correctly
    cout << t.count() << " seconds\n";
    cout << chrono::duration_cast<chrono::minutes>(t).count() << " whole minutes\n";
    chrono::milliseconds ms = 2s;                                       // lossless conversion is implicit
    cout << ms.count() << " ms\n";
    // chrono::seconds s = 1500ms;                                       // error: would lose precision: needs duration_cast
}
```

## [[nodiscard]] and other attributes

```cpp run title="[[nodiscard]] makes ignoring a result a warning"
#include <iostream>
using namespace std;

[[nodiscard]] bool tryConnect() { return true; }
[[nodiscard("check the error code")]] int save() { return 0; }

struct [[nodiscard]] Error { int code; };           // every function returning Error must have its result used
Error check() { return {0}; }

int main() {
    if (tryConnect()) cout << "connected\n";
    int rc = save();
    (void)check();                                  // explicitly ignoring is allowed and visible
    cout << rc << "\n";
}
```

## Which standard should I use?

| Standard | Headline features for design |
|---|---|
| C++11 | move semantics, `auto`, lambdas, `unique_ptr`/`shared_ptr`, `nullptr`, `enum class`, `override`, `constexpr`, threads |
| C++14 | generic lambdas, `make_unique`, return type deduction |
| C++17 | `optional`, `variant`, `string_view`, structured bindings, `if constexpr`, guaranteed elision, `inline` variables, fold expressions |
| C++20 | concepts, ranges, `<=>`, `span`, `jthread`, coroutines, `consteval`, designated initialisers |
| C++23 | `std::expected`, `std::print`, `std::mdspan`, deducing `this` |

In interviews, state the standard you assume (usually C++17 or C++20), and mention that you know the safer modern alternative to an older construct.

```quiz
? When is `string_view` a good choice?
- As a data member that stores a name
+ As a read-only function parameter that avoids copying
- To modify a string
> It is a non-owning view; storing it risks a dangling reference to a destroyed string.
? What does `constexpr` give you?
- Nothing at run time
+ Values and functions that can be evaluated at compile time and checked there
- Faster compile
> It replaces macros with typed, scoped, compile-time values.
? Why prefer `std::chrono::seconds` over `int timeoutSeconds`?
- Shorter code
+ The compiler checks units, preventing seconds/milliseconds mix-ups
- Better formatting
> Unit errors become compile errors.
```

:::keypoints
- Always use `nullptr`, `enum class`, `override`, `= default`/`= delete`, structured bindings, range-for.
- `constexpr` replaces macros; `string_view`/`span` for read-only parameters; `chrono` for time.
- `optional`, `variant`, concepts, ranges and `<=>` express intent in the type system.
- Mention which C++ standard you assume.
:::
