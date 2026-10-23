---
title: Types, initialisation and functions
level: easy
time: 25
summary: Fundamental types and their sizes, safe initialisation with braces, auto, functions with overloading and default arguments, constexpr, and namespaces, each with a tiny runnable program.
---

You do not need all of C++ to start OOP. You need a solid base. This lesson is the fast, interview-focused version of that base.

## Fundamental types

```cpp run title="Sizes of the basic types"
#include <iostream>
#include <cstdint>
using namespace std;

int main() {
    cout << "bool      " << sizeof(bool)      << "\n";
    cout << "char      " << sizeof(char)      << "\n";
    cout << "int       " << sizeof(int)       << "\n";
    cout << "long      " << sizeof(long)      << "\n";
    cout << "long long " << sizeof(long long) << "\n";
    cout << "float     " << sizeof(float)     << "\n";
    cout << "double    " << sizeof(double)    << "\n";
    cout << "pointer   " << sizeof(void*)     << "\n";
    cout << "int32_t   " << sizeof(int32_t)   << ", int64_t " << sizeof(int64_t) << "\n";
}
```

These sizes are for a typical 64-bit Linux or macOS machine. The C++ standard only promises minimums (for example, `int` is at least 16 bits), so when the exact size matters (file formats, network data) use the fixed-width types `int32_t`, `uint8_t`, `int64_t` from `<cstdint>`.

:::warn Signed and unsigned do not mix well
`unsigned` arithmetic wraps around, and comparing a signed and an unsigned value converts the signed one. `-1 < 1u` is **false**. Prefer signed types for counts and sizes in your own code. Use `size_t` only where the standard library asks for it.
:::

## Initialisation: use braces

```cpp run title="Brace initialisation catches mistakes"
#include <iostream>
#include <vector>
using namespace std;

int main() {
    int a = 7;            // copy-initialisation
    int b(7);             // direct-initialisation
    int c{7};             // brace (uniform) initialisation: preferred
    int d{};              // value-initialised: 0
    // int e{3.9};        // ERROR: narrowing double -> int is rejected by braces
    int e = 3.9;          // allowed, silently becomes 3
    vector<int> v{1, 2, 3};
    vector<int> w(3, 9);  // careful: () and {} can mean different things
    vector<int> x{3, 9};  // two elements: 3 and 9

    cout << "a b c d e = " << a << " " << b << " " << c << " " << d << " " << e << "\n";
    cout << "v.size=" << v.size() << " w.size=" << w.size() << " x.size=" << x.size() << "\n";
}
```

Braces refuse **narrowing** conversions (a double into an int, a big int into a small one), which catches real bugs. The one trap: for containers, `{}` prefers the initializer-list constructor, so `vector<int>{3, 9}` is two elements, while `vector<int>(3, 9)` is three nines.

:::warn Uninitialised variables
`int n;` inside a function holds garbage. Reading it is **undefined behaviour**. Always write `int n{};` or `int n = 0;`. For class members, give them default values (you will see how in the constructors lesson).
:::

## auto: let the compiler write the type

```cpp run title="auto, and what it does not do"
#include <iostream>
#include <map>
#include <string>
using namespace std;

int main() {
    auto i = 42;                    // int
    auto d = 3.5;                   // double
    auto s = string("hello");       // string
    const auto& ref = s;            // const string&  (auto alone drops const and &)

    map<string, int> stock{{"apple", 3}, {"pear", 5}};
    for (const auto& [name, qty] : stock)       // structured bindings: no long type names
        cout << name << " -> " << qty << "\n";

    cout << i << " " << d << " " << ref << "\n";
}
```

Use `auto` when the type is obvious from the right side or very long (iterators, lambdas). Do **not** use it to hide types that readers need to see, such as `auto x = compute();` where nobody knows what it returns.

## Functions

```cpp run title="Overloading, default arguments, inline and constexpr"
#include <iostream>
#include <string>
using namespace std;

// Overloading: same name, different parameter lists
int area(int side)            { return side * side; }
int area(int w, int h)        { return w * h; }
double area(double radius)    { return 3.14159 * radius * radius; }

// Default arguments: filled in by the CALLER's compiler
string tag(const string& text, const string& wrap = "b") {
    return "<" + wrap + ">" + text + "</" + wrap + ">";
}

// constexpr: may be evaluated at compile time
constexpr int square(int x) { return x * x; }
static_assert(square(12) == 144, "computed while compiling");

int main() {
    cout << area(4) << " " << area(3, 5) << " " << area(2.0) << "\n";
    cout << tag("hello") << " " << tag("hello", "i") << "\n";
    int arr[square(3)] = {};                    // array size from a constexpr call
    cout << "array has " << sizeof(arr) / sizeof(arr[0]) << " ints\n";
}
```

- **Overload resolution** looks at the *arguments*, not the return type. You cannot overload on the return type alone.
- A default argument must come at the **end** of the parameter list.
- `area(2.0)` picks the `double` overload and `area(2)` picks the `int` one. If no overload fits exactly, C++ tries conversions, which sometimes gives surprises.

:::interview Overloading vs overriding
Overloading = same name, different parameters, chosen at **compile time**, in one scope. Overriding = a derived class replaces a `virtual` function, chosen at **run time**. People mix these up. You will meet overriding in the inheritance module.
:::

## Passing arguments: value, reference, pointer

| You write | Meaning | Use when |
|---|---|---|
| `void f(T x)` | a **copy** is made | small types (int, double), or when you need your own copy |
| `void f(const T& x)` | no copy, read-only | big types you only read (string, vector, your classes) |
| `void f(T& x)` | no copy, may modify caller's object | output parameters |
| `void f(T* p)` | may be null; address passed | optional objects, C-style APIs |

```cpp run title="Value vs reference parameters"
#include <iostream>
#include <string>
using namespace std;

void byValue(string s)       { s += "!"; }             // changes only the copy
void byRef(string& s)        { s += "!"; }             // changes the caller's string
size_t length(const string& s) { return s.size(); }    // read-only, no copy

int main() {
    string name = "hi";
    byValue(name);  cout << name << "\n";
    byRef(name);    cout << name << "\n";
    cout << length(name) << "\n";
}
```

## Namespaces

A **namespace** groups names so that two libraries can both have a function called `parse`.

```cpp run title="Namespaces"
#include <iostream>
using namespace std;

namespace shapes {
    double area(double r) { return 3.14159 * r * r; }
}
namespace physics {
    double area(double w, double h) { return w * h; }
    namespace units { const char* name() { return "metres"; } }       // nested
}

int main() {
    cout << shapes::area(1.0) << " " << physics::area(2, 3) << " " << physics::units::name() << "\n";
    using physics::area;                       // bring ONE name into scope
    cout << area(4, 5) << "\n";
}
```

:::tip Never write `using namespace std;` in a header
It pollutes every file that includes the header. In `.cpp` files and in these small examples it is fine, and it keeps the code short. In headers, write `std::string`.
:::

```quiz
? What does `int x{3.9};` do?
- Sets x to 3
- Sets x to 4
+ Fails to compile: braces reject narrowing conversions
> Brace initialisation forbids a lossy conversion like double to int. `int x = 3.9;` would compile and truncate.
? Which parameter style is best for a read-only large object?
- `void f(T x)`
- `void f(T& x)`
+ `void f(const T& x)`
> It avoids a copy and promises not to modify the object.
? Can you overload two functions that differ only in return type?
- Yes
+ No
> Overload resolution uses the argument list only.
```

:::keypoints
- Use fixed-width types when the size matters; prefer braces `{}` for initialisation; never leave locals uninitialised.
- `auto` is for obvious or long types. Overloading is resolved at compile time on the arguments.
- Pass big read-only objects as `const T&`; pass small types by value.
- Namespaces prevent name clashes. Do not put `using namespace std;` in headers.
:::
