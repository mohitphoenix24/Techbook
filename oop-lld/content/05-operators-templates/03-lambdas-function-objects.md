---
title: Function objects and lambdas
level: intermediate
time: 35
summary: Objects that behave like functions (functors), lambda syntax and captures by value, by reference and by move, mutable and generic lambdas, passing callables as template parameters or std::function, and the dangling-capture trap.
---

A **function object** (or functor) is an object you can call with `()`. Because it is an object, it can carry **state** between calls. A **lambda** is a short way to write one on the spot.

## A functor, written by hand

```cpp run title="A functor remembers state"
#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

class GreaterThan {
    int limit_;
public:
    explicit GreaterThan(int limit) : limit_(limit) {}
    bool operator()(int x) const { return x > limit_; }     // makes the object callable
};

int main() {
    GreaterThan above10(10);
    cout << boolalpha << above10(5) << " " << above10(50) << "\n";

    vector<int> v{3, 12, 7, 25, 18};
    cout << count_if(v.begin(), v.end(), above10) << " items above 10\n";   // algorithms accept any callable
}
```

## The same thing as a lambda

```cpp run title="Lambda syntax"
#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    int limit = 10;
    auto above = [limit](int x) { return x > limit; };
    //           ^capture      ^parameters  ^body        (the return type is deduced)
    vector<int> v{3, 12, 7, 25, 18};
    cout << count_if(v.begin(), v.end(), above) << "\n";
    cout << count_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; }) << " even\n";

    auto add = [](int a, int b) -> int { return a + b; };       // explicit return type when you want one
    cout << add(2, 3) << "\n";
}
```

The compiler turns a lambda into an unnamed class with an `operator()`, and the **captures** become its data members. A lambda is a functor you did not have to write.

## Captures

| Capture | Meaning |
|---|---|
| `[]` | captures nothing |
| `[x]` | captures `x` by **copy** |
| `[&x]` | captures `x` by **reference** |
| `[=]` | copies every used local (avoid: hides what is captured) |
| `[&]` | references every used local (avoid in anything that outlives the scope) |
| `[this]` | captures the object pointer (to use members) |
| `[x = std::move(y)]` | **init capture**: move or compute a value into the lambda (C++14) |

```cpp run title="Value vs reference capture, and mutable"
#include <iostream>
using namespace std;

int main() {
    int n = 1;
    auto byValue = [n]() { return n; };               // copy made NOW
    auto byRef   = [&n]() { return n; };              // sees later changes
    n = 100;
    cout << byValue() << " " << byRef() << "\n";      // 1 100

    int counter = 0;
    auto tick = [counter]() mutable { return ++counter; };    // mutable: may change ITS OWN copy
    cout << tick() << tick() << tick() << " outer counter=" << counter << "\n";
}
```

By default a lambda's `operator()` is `const`, so it cannot change by-value captures. `mutable` lifts that. The outer variable is untouched.

## Generic lambdas and init captures

```cpp run title="auto parameters and move capture"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

int main() {
    auto show = [](const auto& x) { cout << "[" << x << "] "; };    // works for any type: a template inside
    show(42); show(3.5); show(string("hi"));
    cout << "\n";

    auto owner = make_unique<string>("resource");
    auto task = [p = move(owner)]() { return *p + " used"; };      // unique_ptr cannot be copied, so MOVE it in
    cout << task() << ", owner is " << (owner ? "still here" : "empty") << "\n";
}
```

## Storing and passing callables

| How | Cost | Use when |
|---|---|---|
| Template parameter `template <class F> void run(F f)` | zero overhead, can inline | most algorithms and internal helpers |
| `std::function<R(Args)>` | type-erased: indirect call, may allocate | store callbacks of different types in one container or member |
| Function pointer `R(*)(Args)` | small, plain | C APIs, non-capturing only |

```cpp run title="Template parameter vs std::function"
#include <functional>
#include <iostream>
#include <vector>
using namespace std;

template <class F>
void repeatT(int n, F f) { for (int i = 0; i < n; ++i) f(i); }          // fast: compiler sees the exact lambda

class Button {
    function<void()> onClick_;                                             // must hold ANY callable: use std::function
public:
    void setOnClick(function<void()> f) { onClick_ = move(f); }
    void click() const { if (onClick_) onClick_(); }
};

int main() {
    repeatT(3, [](int i) { cout << i << " "; });
    cout << "\n";

    int clicks = 0;
    Button b;
    b.setOnClick([&clicks] { ++clicks; cout << "clicked " << clicks << "\n"; });
    b.click(); b.click();
}
```

Using functions or lambdas as callbacks is the lightweight form of the **Observer**, **Strategy** and **Command** patterns.

## Returning lambdas and recursion

```cpp run title="A function that builds functions"
#include <functional>
#include <iostream>
using namespace std;

auto makeMultiplier(int k) {
    return [k](int x) { return x * k; };              // captures k by copy: safe to return
}

int main() {
    auto triple = makeMultiplier(3);
    cout << triple(7) << "\n";

    function<int(int)> fact = [&fact](int n) { return n <= 1 ? 1 : n * fact(n - 1); };   // recursion needs a name
    cout << fact(5) << "\n";
}
```

## The dangling-capture trap

```cpp title="Display only: a reference capture that outlives its variable"
function<int()> makeCounter() {
    int count = 0;
    return [&count] { return ++count; };      // BUG: count is destroyed when makeCounter returns
}
// calling the returned function reads a dead variable: undefined behaviour
```

Rule: a lambda that **escapes** its scope (returned, stored in a member, run on another thread) must capture by **value** (or by move). Reference captures are for lambdas used immediately, such as inside `sort` or `count_if`.

```quiz
? What does a lambda really compile into?
- A function pointer
+ An unnamed class with operator(); captures become data members
- A macro
> That is why a lambda can carry state, and why it has a type you cannot write.
? When is `mutable` needed on a lambda?
- To capture by reference
+ To modify a by-value capture inside the lambda
- To make it generic
> The call operator is const by default; mutable removes const so the copied capture can be changed.
? A lambda is returned from a function and captures a local variable by reference. What happens?
- It works
+ It dangles: undefined behaviour when called
- A compile error
> The local is destroyed when the function returns. Capture by value instead.
```

:::keypoints
- A functor is an object with `operator()`; a lambda is a compact way to write one. Captures become members.
- Capture by value for lambdas that escape; by reference only for immediate use. `[x = std::move(y)]` moves ownership in.
- Use template parameters for speed, `std::function` when you must store different callables.
- Lambdas are the building block for light Strategy, Command and Observer implementations.
:::
