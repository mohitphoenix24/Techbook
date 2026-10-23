---
title: Structs, enums, optional and tuples
level: easy
time: 25
summary: struct vs class, aggregate and designated initialisation, enum class for safe constants, std::optional for "maybe a value", pair and tuple with structured bindings. The small types LLD code is built from.
---

LLD solutions use a lot of small **value types**: a `Money`, a `Seat`, a `Status`. This lesson covers the C++ tools for them.

## struct vs class

```cpp run title="The only language difference: default access"
#include <iostream>
using namespace std;

struct S { int x = 1; };     // members are PUBLIC by default
class  C { int x = 1; };     // members are PRIVATE by default

int main() {
    S s;
    cout << s.x << "\n";
    C c;
    // cout << c.x;          // error: x is private
    (void)c;
}
```

That is the **only** difference (it also affects default inheritance: `struct D : B` inherits publicly, `class D : B` privately). By convention: use `struct` for plain bundles of data with no invariant, and `class` when there are private members and rules to protect.

## Aggregate and designated initialisation

```cpp run title="Initialising structs clearly (C++20)"
#include <iostream>
#include <string>
using namespace std;

struct Address {
    string city;
    int pin;
    string country = "India";           // default value
};

int main() {
    Address a{"Pune", 411001};                          // by position
    Address b{.city = "Delhi", .pin = 110001};          // designated: order must match declaration
    cout << a.city << " " << a.pin << " " << a.country << "\n";
    cout << b.city << " " << b.pin << " " << b.country << "\n";
}
```

## enum class: named constants that cannot be confused

Old-style `enum` leaks its names into the surrounding scope and converts to `int` silently. **Prefer `enum class`.**

```cpp run title="enum vs enum class"
#include <iostream>
using namespace std;

enum Colour { RED, GREEN };               // old: RED and GREEN are now global names
enum class Light { Red, Green, Yellow };  // scoped: Light::Red

const char* name(Light l) {
    switch (l) {
        case Light::Red:    return "red";
        case Light::Green:  return "green";
        case Light::Yellow: return "yellow";
    }
    return "?";
}

int main() {
    int c = RED;                                  // old enum converts to int
    // int d = Light::Red;                        // error: enum class does not
    int d = static_cast<int>(Light::Yellow);      // explicit cast when you really need the number
    cout << c << " " << d << " " << name(Light::Green) << "\n";
}
```

:::tip Let the compiler check your switch
With `-Wall`, a `switch` over an `enum class` without a `default:` warns when you forget a case. When you add a new enum value later, every switch that needs updating is flagged. Do not add `default:` just to silence it.
:::

You can choose the underlying type: `enum class Status : uint8_t { Active, Blocked };` (useful for compact storage and for forward-declaring the enum).

## std::optional: a value that may be missing

Returning `-1` or `nullptr` to mean "not found" is easy to misuse. `std::optional<T>` says it in the type.

```cpp run title="optional"
#include <iostream>
#include <map>
#include <optional>
#include <string>
using namespace std;

optional<int> findAge(const map<string, int>& m, const string& who) {
    auto it = m.find(who);
    if (it == m.end()) return nullopt;        // "no value"
    return it->second;
}

int main() {
    map<string, int> ages{{"asha", 30}, {"ravi", 41}};
    if (auto a = findAge(ages, "asha")) cout << "asha is " << *a << "\n";
    cout << "meera is " << findAge(ages, "meera").value_or(-1) << "\n";   // default when empty
    cout << boolalpha << findAge(ages, "zed").has_value() << "\n";
}
```

## pair, tuple and structured bindings

```cpp run title="Returning several values"
#include <iostream>
#include <string>
#include <tuple>
#include <utility>
using namespace std;

pair<bool, string> validate(const string& pw) {
    if (pw.size() < 8) return {false, "too short"};
    return {true, "ok"};
}

tuple<int, int, int> hms(int seconds) { return {seconds / 3600, seconds % 3600 / 60, seconds % 60}; }

int main() {
    auto [ok, msg] = validate("abc");                // structured bindings
    cout << ok << " " << msg << "\n";
    auto [h, m, s] = hms(3725);
    cout << h << ":" << m << ":" << s << "\n";
}
```

:::tip Prefer a named struct over a pair or tuple for public APIs
`result.first` tells nobody anything. `struct ValidationResult { bool ok; string message; };` documents itself. Use `pair` and `tuple` for short-lived, local values.
:::

```quiz
? Why prefer `enum class` over plain `enum`?
- It is faster
+ Names are scoped and there is no silent conversion to int
- It uses less memory
> Scoped enums avoid name clashes and accidental arithmetic with unrelated constants.
? What does `std::optional<int>` express?
- An int stored on the heap
+ Either an int or "no value"
- A nullable pointer to int
> It makes absence part of the type, instead of a magic value such as -1.
```

:::keypoints
- `struct` and `class` differ only in default access. Use `class` when there is an invariant to protect.
- `enum class` for safe named constants; let the compiler check `switch` completeness.
- `std::optional` for "maybe a value"; `std::pair`/`tuple` with structured bindings for local multiple returns.
- Designated initialisers (C++20) make aggregate construction readable.
:::
