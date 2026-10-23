---
title: Conversions, streams, hashing and user-defined literals
level: intermediate
time: 30
summary: Making your types work with the standard library: stream input and output, conversion operators and explicit operator bool, custom keys for set, map and unordered_map (hash specialisation), and user-defined literals.
---

A well-designed class should work with `cout`, with `if (x)`, as a key in `map` and `unordered_map`, and sometimes with a nice literal like `5_km`. This lesson shows each hook.

## Streams: << and >>

```cpp run title="Output and input operators"
#include <iostream>
#include <sstream>
#include <string>
using namespace std;

struct Point { int x = 0, y = 0; };

ostream& operator<<(ostream& os, const Point& p) { return os << "(" << p.x << "," << p.y << ")"; }
istream& operator>>(istream& is, Point& p) {            // reads "x y"
    int x, y;
    if (is >> x >> y) p = {x, y};                         // only assign on success
    return is;                                            // return the stream so reads can chain and be tested
}

int main() {
    Point p;
    istringstream in("3 4  10 20");                       // an in-memory input stream
    while (in >> p) cout << "read " << p << "\n";

    ostringstream out;                                    // an in-memory output stream: handy for to_string()
    out << p << " and " << Point{7, 8};
    cout << out.str() << "\n";
}
```

Return the **same stream by reference** so calls chain (`cout << a << b`) and the stream's error state can be tested (`while (in >> p)`).

## Conversion operators

`operator T()` converts your object **to** another type. It is the opposite of a converting constructor.

```cpp run title="explicit operator bool and a conversion to double"
#include <iostream>
#include <memory>
using namespace std;

class Celsius {
    double v_;
public:
    explicit Celsius(double v) : v_(v) {}
    operator double() const { return v_; }                 // implicit: Celsius -> double
};

class Handle {
    unique_ptr<int> p_;
public:
    explicit Handle(int v) : p_(make_unique<int>(v)) {}
    Handle() = default;
    explicit operator bool() const { return p_ != nullptr; }   // usable in if(), but not in accidental arithmetic
};

int main() {
    Celsius t(36.6);
    double d = t + 1;                                       // converts implicitly: 37.6
    cout << d << "\n";

    Handle ok(5), empty;
    if (ok) cout << "ok is valid\n";
    if (!empty) cout << "empty is invalid\n";
    // int n = ok + 1;                                       // error, thanks to `explicit`
}
```

Make conversion operators **explicit** unless the conversion is lossless and natural. `explicit operator bool()` is the classic: it works in `if`, `while` and `!`, without letting a `Handle` silently become an integer.

## Custom types as keys

### In std::map and std::set: operator<

Ordered containers need `<` (or a comparator). The easiest way is `operator<=>`.

```cpp run title="A struct as a map key"
#include <compare>
#include <iostream>
#include <map>
#include <string>
using namespace std;

struct Seat {
    char row;
    int number;
    auto operator<=>(const Seat&) const = default;
};

int main() {
    map<Seat, string> booked;
    booked[{'B', 4}] = "Asha";
    booked[{'A', 12}] = "Ravi";
    booked[{'A', 3}] = "Meera";
    for (const auto& [seat, who] : booked)                  // iteration is in sorted order
        cout << seat.row << seat.number << "=" << who << " ";
    cout << "\n";
}
```

### In std::unordered_map: operator== and a hash

Hash containers need `==` and a `std::hash<T>` specialisation.

```cpp run title="A struct as an unordered_map key"
#include <functional>
#include <iostream>
#include <string>
#include <unordered_map>
using namespace std;

struct Seat {
    char row;
    int number;
    bool operator==(const Seat&) const = default;
};

template <>
struct std::hash<Seat> {                                      // specialise std::hash for our type
    size_t operator()(const Seat& s) const noexcept {
        size_t h1 = hash<char>{}(s.row);
        size_t h2 = hash<int>{}(s.number);
        return h1 ^ (h2 + 0x9e3779b9 + (h1 << 6) + (h1 >> 2));      // the usual way to combine hashes
    }
};

int main() {
    unordered_map<Seat, string> booked;
    booked[{'B', 4}] = "Asha";
    booked[{'A', 12}] = "Ravi";
    cout << booked.at({'A', 12}) << " " << booked.count({'Z', 1}) << " size=" << booked.size() << "\n";
}
```

Rule: if `a == b` then `hash(a)` must equal `hash(b)`. A bad hash (for example, returning `0` always) still works, but turns the table into a linked list, O(n).

## User-defined literals

```cpp run title="Literals like 5_km and 90_min"
#include <iostream>
using namespace std;

class Distance {
    double metres_;
public:
    constexpr explicit Distance(double m) : metres_(m) {}
    constexpr double metres() const { return metres_; }
    constexpr Distance operator+(Distance o) const { return Distance(metres_ + o.metres_); }
};

constexpr Distance operator""_km(long double v) { return Distance(static_cast<double>(v) * 1000); }
constexpr Distance operator""_m(long double v)  { return Distance(static_cast<double>(v)); }

int main() {
    auto total = 1.5_km + 250.0_m;
    cout << total.metres() << " m\n";
}
```

`std::chrono` uses this everywhere: `using namespace std::chrono_literals; auto t = 90s + 5min;`. Literal suffixes you define yourself must start with `_`.

:::interview Why `explicit operator bool`?
"A non-explicit `operator bool` lets the object convert to `bool` and then to `int` silently, so `obj + 1` or `a == b` between different handle types compiles. `explicit operator bool` is still used for contextual conversions: `if (obj)`, `while (obj)`, `!obj`, `&&`, `||`. That is the safe-bool behaviour we want."
:::

```quiz
? What should `operator<<` return?
- void
+ The stream, by reference
- A string
> Returning the stream allows chaining and keeps the error state testable.
? What must a custom type provide to be a key in `unordered_map`?
- operator<
+ operator== and a std::hash specialisation
- A virtual function
> The table hashes keys to buckets and compares equal-hash keys with ==.
? Why make `operator bool` explicit?
- It runs faster
+ To allow `if (x)` but prevent silent conversions to integers
- It is required for constexpr
> Contextual conversion still works, but accidental arithmetic does not.
```

:::keypoints
- `operator<<` / `>>` are non-members returning the stream. Use `ostringstream` to build strings.
- Make conversion operators `explicit` (especially `operator bool`).
- Map/set keys need `<` (or `<=>`); unordered keys need `==` and `std::hash`.
- User-defined literals (`_km`) make units readable.
:::
