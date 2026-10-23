---
title: Operator overloading
level: intermediate
time: 40
summary: Giving +, -, ==, <, <=>, [], (), ++ and compound assignment meaning for your own types, member versus non-member operators, the prefix and postfix forms, which operators to leave alone, and a complete Fraction class.
---

**Operator overloading** lets `a + b`, `a == b` or `v[i]` work on your own classes. An operator is just a function with a special name: `operator+`. Used well, it makes code read like mathematics. Used badly, it hides surprising behaviour.

:::analogy Think of it like this
`+` already means three different things: adding integers, adding doubles, joining strings. Operator overloading just lets you teach it a fourth meaning (adding two `Money` values, or two `Vector3` objects).
:::

## A first example: Vec2

```cpp run title="Arithmetic operators on a 2D vector"
#include <iostream>
using namespace std;

struct Vec2 {
    double x = 0, y = 0;

    Vec2& operator+=(const Vec2& o) { x += o.x; y += o.y; return *this; }   // modifies *this
    Vec2& operator-=(const Vec2& o) { x -= o.x; y -= o.y; return *this; }
    Vec2& operator*=(double k)      { x *= k;   y *= k;   return *this; }
    Vec2 operator-() const          { return {-x, -y}; }                    // unary minus
};

// Binary operators as NON-members, built from the compound ones (keeps them consistent)
Vec2 operator+(Vec2 a, const Vec2& b) { return a += b; }       // 'a' is a copy: we modify and return it
Vec2 operator-(Vec2 a, const Vec2& b) { return a -= b; }
Vec2 operator*(Vec2 v, double k)      { return v *= k; }
Vec2 operator*(double k, const Vec2& v) { return v * k; }      // so that 2 * v also works

bool operator==(const Vec2& a, const Vec2& b) { return a.x == b.x && a.y == b.y; }

ostream& operator<<(ostream& os, const Vec2& v) { return os << "(" << v.x << ", " << v.y << ")"; }

int main() {
    Vec2 a{1, 2}, b{3, 5};
    cout << a + b << " " << b - a << " " << a * 3 << " " << 2 * a << " " << -a << "\n";
    a += b;
    cout << a << " equal to (4,7)? " << boolalpha << (a == Vec2{4, 7}) << "\n";
}
```

Two good habits are visible here:

1. Write the **compound assignment** (`+=`) as a member, and build `+` from it. Then they can never disagree.
2. Make binary operators **non-members** when the left operand might not be your class. A member `operator*(double)` allows `v * 2` but not `2 * v`, because the left side of `2 * v` is an `int`, and members need the left operand to be the class.

## Member or non-member?

| Operator | Member or non-member? |
|---|---|
| `=`, `[]`, `()`, `->` | **must** be members |
| `+=`, `-=`, `++`, `--` (change the object) | members |
| `+`, `-`, `*`, `/`, `==`, `<` (symmetric, don't change) | non-members (or friends) |
| `<<`, `>>` for streams | **non-members** (left side is the stream) |

## Increment and decrement: prefix vs postfix

```cpp run title="Prefix and postfix ++"
#include <iostream>
using namespace std;

class Counter {
    int n_ = 0;
public:
    Counter& operator++() { ++n_; return *this; }              // prefix:  ++c  returns the NEW value, by reference
    Counter operator++(int) { Counter old = *this; ++n_; return old; }   // postfix: c++ returns the OLD value, by copy
    int value() const { return n_; }
};

int main() {
    Counter c;
    cout << (++c).value() << " ";        // 1
    cout << (c++).value() << " ";        // 1: the old value
    cout << c.value() << "\n";           // 2
}
```

The dummy `int` parameter is only a marker to tell postfix from prefix. Postfix must make a **copy**, so in loops over iterators prefer `++it` (a reason why `for (auto it = ...; ...; ++it)` is the habit).

## Subscript and call operators

```cpp run title="operator[] and operator()"
#include <iostream>
#include <stdexcept>
#include <vector>
using namespace std;

class Matrix {
    size_t rows_, cols_;
    vector<double> data_;
public:
    Matrix(size_t r, size_t c) : rows_(r), cols_(c), data_(r * c, 0.0) {}
    // operator() takes several arguments: perfect for m(row, col)
    double& operator()(size_t r, size_t c) {
        if (r >= rows_ || c >= cols_) throw out_of_range("matrix index");
        return data_[r * cols_ + c];
    }
    double operator()(size_t r, size_t c) const { return data_[r * cols_ + c]; }
    size_t rows() const { return rows_; }
    size_t cols() const { return cols_; }
};

int main() {
    Matrix m(2, 3);
    for (size_t r = 0; r < m.rows(); ++r)
        for (size_t c = 0; c < m.cols(); ++c)
            m(r, c) = static_cast<double>(r * 10 + c);
    cout << m(1, 2) << " " << m(0, 1) << "\n";
    try { m(5, 5); } catch (const out_of_range& e) { cout << "caught: " << e.what() << "\n"; }
}
```

Before C++23, `operator[]` takes exactly one argument, so a matrix uses `operator()`. A class with `operator()` is a **function object** (functor), covered in the next-but-one lesson.

## Comparison operators and the spaceship

C++20 can generate all six comparisons from one `operator<=>` ("spaceship"), and often you can ask the compiler to write it.

```cpp run title="= default for <=> (C++20)"
#include <compare>
#include <iostream>
#include <set>
#include <string>
using namespace std;

struct Version {
    int major = 0, minor = 0, patch = 0;
    auto operator<=>(const Version&) const = default;       // compares member by member, in order
    bool operator==(const Version&) const = default;
};

int main() {
    Version a{1, 2, 3}, b{1, 10, 0};
    cout << boolalpha << (a < b) << " " << (a == b) << " " << (a >= b) << "\n";

    set<Version> versions{{2, 0, 0}, {1, 9, 9}, {1, 10, 0}};      // set needs operator<
    for (const auto& v : versions) cout << v.major << "." << v.minor << "." << v.patch << " ";
    cout << "\n";
}
```

For a custom order (for example "sort by price, then name") write `operator<=>` by hand or give the container a comparator.

## A complete example: Fraction

```cpp run title="A Fraction class with a proper operator set"
#include <iostream>
#include <numeric>
#include <stdexcept>
using namespace std;

class Fraction {
    long num_, den_;
    void normalise() {
        if (den_ < 0) { num_ = -num_; den_ = -den_; }
        long g = gcd(num_ < 0 ? -num_ : num_, den_);
        if (g > 1) { num_ /= g; den_ /= g; }
    }
public:
    Fraction(long n = 0, long d = 1) : num_(n), den_(d) {
        if (d == 0) throw invalid_argument("zero denominator");
        normalise();
    }
    Fraction& operator+=(const Fraction& o) { num_ = num_ * o.den_ + o.num_ * den_; den_ *= o.den_; normalise(); return *this; }
    Fraction& operator*=(const Fraction& o) { num_ *= o.num_; den_ *= o.den_; normalise(); return *this; }
    friend Fraction operator+(Fraction a, const Fraction& b) { return a += b; }
    friend Fraction operator*(Fraction a, const Fraction& b) { return a *= b; }
    friend bool operator==(const Fraction& a, const Fraction& b) { return a.num_ == b.num_ && a.den_ == b.den_; }
    friend bool operator<(const Fraction& a, const Fraction& b) { return a.num_ * b.den_ < b.num_ * a.den_; }
    friend ostream& operator<<(ostream& os, const Fraction& f) {
        return f.den_ == 1 ? os << f.num_ : os << f.num_ << "/" << f.den_;
    }
};

int main() {
    Fraction a(1, 2), b(1, 3), c(2, 4);
    cout << a << " + " << b << " = " << a + b << "\n";
    cout << a << " * " << b << " = " << a * b << "\n";
    cout << boolalpha << (a == c) << " " << (b < a) << " " << a + a << " " << Fraction(3) + a << "\n";
}
```

Note `Fraction(3) + a`: the converting constructor `Fraction(long n = 0, long d = 1)` lets integers take part, and because `operator+` is a non-member the left side can be converted too.

## Operators you should not overload (or only carefully)

| Operator | Why not |
|---|---|
| `&&`, `||` | overloads lose short-circuit evaluation (both sides are always evaluated) |
| `,` (comma) | surprises everybody |
| unary `&` (address-of) | breaks code that assumes `&x` is the real address |
| `->`, `*` | only for smart-pointer-like or iterator-like classes |

Cannot be overloaded at all: `::`, `.`, `.*`, `?:`, `sizeof`, `typeid`.

:::tip Principle of least astonishment
Overload an operator only when its meaning is **obvious and conventional** for your type. `Money + Money` is good. `Employee + Employee` is not. When in doubt, use a named function (`merge`, `add`).
:::

:::interview Common questions
- *Why is `operator<<` a non-member?* The left operand is the `ostream`, which you do not own, so it cannot be a member of your class.
- *Prefix vs postfix `++`: which is faster and why?* Prefix. Postfix must copy the old value to return it.
- *Can `operator=` be a non-member?* No, it must be a member.
- *Which operators cannot be overloaded?* `::`, `.`, `.*`, `?:` and `sizeof`.
:::

```quiz
? Why should `operator+` usually be a non-member?
- It is faster
+ So that implicit conversions apply to the left operand too (2 * v works)
- Members cannot take two arguments
> A member needs the left operand to be the class itself, so `2 * v` would fail.
? What does postfix `c++` return?
- A reference to the new value
+ A copy of the old value
- void
> It saves the old value, increments, and returns the saved copy.
? Which can you NOT overload?
- `[]`
- `<<`
+ `.` (member access)
> The operators `::`, `.`, `.*`, `?:` and `sizeof` cannot be overloaded.
```

:::keypoints
- Write `+=` as a member and `+` as a non-member built on it. Return `*this` by reference from compound assignment.
- Prefix `++` returns a reference; postfix `++(int)` returns a copy of the old value.
- Use `operator<=>` `= default` (C++20) for comparisons. `[]`, `()`, `=`, `->` must be members.
- Overload only when the meaning is conventional; never `&&`, `||` or `,`.
:::
