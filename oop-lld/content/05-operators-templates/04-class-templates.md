---
title: Function and class templates
level: intermediate
time: 40
summary: Writing generic functions and classes with templates, template argument deduction, specialisation, non-type parameters, variadic templates with fold expressions, if constexpr, and the rules of thumb for readable template code.
---

A **template** is a recipe for making classes or functions. The compiler stamps out a real version for each type you use. It is how `vector<int>`, `vector<string>` and `vector<Employee>` all come from one definition.

## Function templates

```cpp run title="One definition, many types"
#include <iostream>
#include <string>
using namespace std;

template <typename T>
T maxOf(T a, T b) { return (a < b) ? b : a; }          // needs only operator< on T

template <typename T, typename U>
auto add(T a, U b) { return a + b; }                   // return type deduced

int main() {
    cout << maxOf(3, 9) << " " << maxOf(2.5, 1.5) << " " << maxOf<string>("pear", "apple") << "\n";
    cout << add(1, 2.5) << " " << add(string("a"), "b") << "\n";
    // maxOf(3, 2.5);          // error: T deduced as int AND double. Be explicit: maxOf<double>(3, 2.5)
}
```

The compiler **deduces** `T` from the arguments. If deduction is ambiguous, say it yourself: `maxOf<double>(3, 2.5)`.

## Class templates

```cpp run title="A generic Stack"
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

template <typename T>
class Stack {
    vector<T> items_;
public:
    void push(T value) { items_.push_back(std::move(value)); }
    T pop();                                           // defined outside, below
    const T& top() const { return items_.back(); }
    bool empty() const { return items_.empty(); }
    size_t size() const { return items_.size(); }
};

template <typename T>                                  // out-of-class definitions repeat the template header
T Stack<T>::pop() {
    if (items_.empty()) throw underflow_error("pop from empty stack");
    T v = std::move(items_.back());
    items_.pop_back();
    return v;
}

int main() {
    Stack<int> a;
    a.push(1); a.push(2); a.push(3);
    cout << a.pop() << a.pop() << " size=" << a.size() << "\n";

    Stack<string> s;
    s.push("hello");
    cout << s.top() << "\n";

    try { Stack<double> d; d.pop(); } catch (const underflow_error& e) { cout << "error: " << e.what() << "\n"; }
}
```

Since C++17 the compiler can deduce class template arguments from constructors (**CTAD**): `vector v{1, 2, 3};` is a `vector<int>`, and `pair p{1, "a"};` a `pair<int, const char*>`.

## Specialisation: a special version for one type

```cpp run title="Full and partial specialisation"
#include <iostream>
#include <string>
using namespace std;

template <typename T>
struct Describe { static string name() { return "something"; } };          // the general version

template <>
struct Describe<int> { static string name() { return "an int"; } };         // FULL specialisation for int

template <typename T>
struct Describe<T*> { static string name() { return "a pointer to " + Describe<T>::name(); } };   // PARTIAL: any pointer

int main() {
    cout << Describe<double>::name() << "\n";
    cout << Describe<int>::name() << "\n";
    cout << Describe<int*>::name() << "\n";
    cout << Describe<string**>::name() << "\n";
}
```

The famous real example is `std::vector<bool>`, a specialisation that packs bits (and, famously, does not behave like other vectors, so many consider it a mistake).

## Non-type template parameters

Templates can take **values**, not only types. The value must be known at compile time.

```cpp run title="Fixed-size containers and matrices"
#include <array>
#include <iostream>
using namespace std;

template <typename T, size_t R, size_t C>
class Matrix {
    array<T, R * C> data_{};
public:
    T& at(size_t r, size_t c) { return data_[r * C + c]; }
    constexpr size_t rows() const { return R; }
    constexpr size_t cols() const { return C; }

    template <size_t K>                                               // member template: result is R x K
    Matrix<T, R, K> multiply(Matrix<T, C, K>& o) {
        Matrix<T, R, K> out;
        for (size_t i = 0; i < R; ++i)
            for (size_t j = 0; j < K; ++j)
                for (size_t k = 0; k < C; ++k) out.at(i, j) += at(i, k) * o.at(k, j);
        return out;
    }
};

int main() {
    Matrix<int, 2, 3> a;
    Matrix<int, 3, 2> b;
    for (size_t i = 0; i < 2; ++i) for (size_t j = 0; j < 3; ++j) { a.at(i, j) = int(i + j); b.at(j, i) = int(i * j + 1); }
    auto c = a.multiply(b);                                           // 2x3 times 3x2 = 2x2, checked at compile time
    cout << c.rows() << "x" << c.cols() << ": " << c.at(0, 0) << " " << c.at(0, 1) << " " << c.at(1, 0) << " " << c.at(1, 1) << "\n";
    // a.multiply(a);   // compile error: the dimensions do not match. A bug caught before running.
}
```

The sizes are part of the type, so multiplying incompatible matrices is a **compile error**, not a run-time bug. That is the power of templates.

## Variadic templates and fold expressions

A **parameter pack** (`Args...`) accepts any number of arguments. A **fold expression** applies an operator across them.

```cpp run title="Any number of arguments"
#include <iostream>
#include <string>
using namespace std;

template <typename... Args>
auto sum(Args... args) { return (args + ...); }                   // fold: a1 + a2 + a3 ...

template <typename... Args>
void printAll(const Args&... args) {
    ((cout << args << " "), ...);                                  // comma fold: print each
    cout << "\n";
}

template <typename... Args>
bool allPositive(Args... args) { return ((args > 0) && ...); }     // && fold

int main() {
    cout << sum(1, 2, 3, 4) << " " << sum(1.5, 2.5) << "\n";
    printAll("id", 42, 3.14, string("ok"));
    cout << boolalpha << allPositive(1, 2, 3) << " " << allPositive(1, -2, 3) << "\n";
}
```

Variadic templates power `std::make_unique<T>(args...)`, `emplace_back(args...)`, `std::tuple` and `printf`-like functions that are type safe.

## if constexpr: different code for different types

```cpp run title="Choosing code at compile time"
#include <iostream>
#include <string>
#include <type_traits>
using namespace std;

template <typename T>
string describe(const T& v) {
    if constexpr (is_integral_v<T>)            return "integer " + to_string(v);
    else if constexpr (is_floating_point_v<T>) return "float " + to_string(v);
    else if constexpr (is_same_v<T, string>)   return "string '" + v + "'";
    else                                        return "something else";
}

int main() {
    cout << describe(7) << "\n" << describe(2.5) << "\n" << describe(string("hi")) << "\n" << describe('x') << "\n";
}
```

Unlike a normal `if`, the branches that are not taken are **not compiled** for that `T`. A normal `if` would fail to compile for `string` calling `to_string`.

## Templates in the interview: what to remember

| Topic | Key point |
|---|---|
| Where does the code live? | In headers: the compiler needs the body at every use |
| Compile errors | Long and cryptic: read the **first** error and the "required from here" line |
| Code bloat | Each instantiation is separate code. Not a problem in practice, but know it |
| `typename` | Needed before a **dependent type**: `typename T::value_type x;` |
| Specialisation | Full (all arguments) and partial (class templates only, not functions) |
| Templates vs virtual | Compile time and no overhead vs run time and open set of types |

:::interview Template vs macro?
"A macro is text substitution before the compiler sees the code: it has no types, no scope, evaluates arguments more than once (`MAX(a++, b)`) and gives poor error messages. A template is type-checked, scoped, and instantiated by the compiler. I use templates, `constexpr` and `inline`, not macros."
:::

```quiz
? What does the compiler do with `maxOf<int>(1, 2)` and `maxOf<double>(1.0, 2.0)`?
- Uses one shared function with type checks at run time
+ Generates two separate functions, one per type
- Reports an error
> Each distinct set of template arguments produces its own code (an instantiation).
? Why can `Matrix<int,2,3>::multiply(Matrix<int,2,3>&)` be a compile-time error?
- Because templates do not support multiplication
+ The dimensions are template parameters, so the types do not match
- It is not an error
> Sizes are part of the type; a mismatch is a type error.
? What does `if constexpr` do?
- Runs the condition at run time
+ Discards the non-matching branches at compile time, so they need not compile for that type
- Declares a constant
> That is what lets one template handle types with different operations.
```

:::keypoints
- Templates generate code per type at compile time: type-safe, zero overhead, and defined in headers.
- Deduction usually works; CTAD helps for classes. Specialise for special types.
- Non-type parameters put values (sizes) into types. Variadic templates plus fold expressions handle "any number of arguments".
- `if constexpr` chooses code by type at compile time.
:::
