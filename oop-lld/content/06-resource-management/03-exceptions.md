---
title: Exceptions
level: intermediate
time: 35
summary: throw, try and catch, the standard exception hierarchy, writing your own exception classes, catching by const reference, stack unwinding with RAII, rethrowing, noexcept, exceptions in constructors, and when to use exceptions at all.
---

An **exception** is a way to report an error from a place that cannot handle it to a place that can, without every function in between passing error codes. When thrown, C++ **unwinds the stack**: it leaves functions one by one, calling destructors of local objects, until a matching `catch` is found.

## try, throw, catch

```cpp run title="The basics"
#include <iostream>
#include <stdexcept>
#include <string>
using namespace std;

double divide(double a, double b) {
    if (b == 0) throw invalid_argument("division by zero");     // report the problem
    return a / b;
}

int main() {
    try {
        cout << divide(10, 4) << "\n";
        cout << divide(1, 0) << "\n";                           // throws: the rest of this block is skipped
        cout << "never printed\n";
    } catch (const invalid_argument& e) {                       // catch BY CONST REFERENCE
        cout << "caught: " << e.what() << "\n";
    }
    cout << "program continues\n";
}
```

## The standard exception hierarchy

All standard exceptions derive from `std::exception`, which has a virtual `what()` returning a description.

```text
std::exception
 ├─ std::logic_error            (bugs that could have been avoided)
 │    ├─ invalid_argument
 │    ├─ out_of_range           (vector::at)
 │    ├─ length_error
 │    └─ domain_error
 ├─ std::runtime_error          (problems found only at run time)
 │    ├─ range_error
 │    ├─ overflow_error
 │    └─ underflow_error
 ├─ std::bad_alloc              (new failed)
 ├─ std::bad_cast               (dynamic_cast on a reference)
 └─ std::bad_optional_access, bad_variant_access, ...
```

```cpp run title="Catch order matters: specific before general"
#include <iostream>
#include <stdexcept>
#include <vector>
using namespace std;

int main() {
    vector<int> v{1, 2, 3};
    try {
        v.at(10);
    } catch (const out_of_range& e) {                  // most specific first
        cout << "out_of_range: " << e.what() << "\n";
    } catch (const exception& e) {                     // any other standard exception
        cout << "exception: " << e.what() << "\n";
    } catch (...) {                                    // anything at all (last resort)
        cout << "unknown\n";
    }
}
```

**Catch by `const&`.** Catching by value copies the exception and *slices* derived types (you lose the derived message and type). Catching by pointer is old-fashioned.

## Your own exception classes

Derive from `std::exception` (or `runtime_error`) so generic handlers still work, and add the data that callers need.

```cpp run title="A custom exception with data"
#include <iostream>
#include <stdexcept>
#include <string>
using namespace std;

class InsufficientFunds : public runtime_error {
    double needed_;
public:
    InsufficientFunds(double balance, double requested)
        : runtime_error("insufficient funds: balance " + to_string(balance) + ", requested " + to_string(requested)),
          needed_(requested - balance) {}
    double shortBy() const { return needed_; }
};

class Account {
    double balance_ = 100;
public:
    void withdraw(double amount) {
        if (amount > balance_) throw InsufficientFunds(balance_, amount);
        balance_ -= amount;
    }
};

int main() {
    Account a;
    try { a.withdraw(250); }
    catch (const InsufficientFunds& e) { cout << e.what() << "\n" << "short by " << e.shortBy() << "\n"; }
}
```

## Stack unwinding and RAII

When an exception propagates, every **fully constructed local object** on the way is destroyed. This is why RAII makes C++ exception-safe.

```cpp run title="Destructors run while the exception travels"
#include <iostream>
#include <stdexcept>
using namespace std;

struct Guard {
    const char* name;
    explicit Guard(const char* n) : name(n) { cout << "  acquire " << name << "\n"; }
    ~Guard() { cout << "  release " << name << "\n"; }
};

void level3() { Guard g("level3 resource"); throw runtime_error("failure in level3"); }
void level2() { Guard g("level2 resource"); level3(); cout << "  (not reached)\n"; }
void level1() { Guard g("level1 resource"); level2(); }

int main() {
    try { level1(); }
    catch (const exception& e) { cout << "handled: " << e.what() << "\n"; }
}
```

All three resources are released, innermost first, with no `finally` and no cleanup code at all.

## Rethrow, and exceptions in constructors

```cpp run title="Add context, then rethrow; constructors may throw"
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
using namespace std;

struct Part {
    explicit Part(const char* n) : name(n) { cout << "  Part " << name << " built\n"; }
    ~Part() { cout << "  Part " << name << " destroyed\n"; }
    const char* name;
};

class Machine {
    Part a_{"A"};
    Part b_{"B"};
public:
    Machine() { cout << "  Machine body\n"; throw runtime_error("cannot start machine"); }
    ~Machine() { cout << "  ~Machine (never runs: construction did not finish)\n"; }
};

void load() {
    try { Machine m; }
    catch (const exception& e) {
        cout << "load: " << e.what() << ", adding context and rethrowing\n";
        throw;                                           // rethrow the SAME exception object
    }
}

int main() {
    try { load(); } catch (const exception& e) { cout << "main caught: " << e.what() << "\n"; }
}
```

If a constructor throws, the object never existed, so its destructor does not run. But the members and bases that were **already built** are destroyed. That is why holding resources in members (RAII) makes constructors safe, and holding raw pointers does not.

## noexcept

`noexcept` promises a function will not throw. If it does anyway, the program calls `std::terminate`. It lets the compiler optimise, and lets containers pick moves over copies.

```cpp run title="noexcept and the operator"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

int safeAdd(int a, int b) noexcept { return a + b; }
int mayThrow(int a) { return a; }

int main() {
    cout << boolalpha;
    cout << "safeAdd noexcept? " << noexcept(safeAdd(1, 2)) << "\n";
    cout << "mayThrow noexcept? " << noexcept(mayThrow(1)) << "\n";
    cout << "string move noexcept? " << is_nothrow_move_constructible_v<string> << "\n";
    cout << "vector move noexcept? " << is_nothrow_move_constructible_v<vector<int>> << "\n";
}
```

Mark as `noexcept`: destructors (the default), move constructors and move assignment, `swap`, and simple getters. Do not sprinkle it everywhere. A false promise is a crash.

## When to use exceptions

| Use exceptions for | Do not use them for |
|---|---|
| Errors the caller usually cannot handle locally | Ordinary control flow (a loop ending, "not found" in a search) |
| Failures in constructors | Hot paths where an error is *expected* often |
| Violated preconditions or unrecoverable states | Signalling success/failure of a normal query (`optional`, `bool` is better) |
| Resource failures (out of memory, I/O) | Code compiled without exceptions (embedded, some game engines) |

Throwing is slow (microseconds). Not throwing is free. So exceptions are for *exceptional* situations.

:::interview Commonly asked
- *Why catch by const reference?* Avoids slicing and copying, and preserves the dynamic type.
- *What happens if a destructor throws during stack unwinding?* `std::terminate`.
- *What happens to an object if its constructor throws?* The destructor does not run; fully built members and bases are destroyed.
- *What is stack unwinding?* The process of leaving scopes and destroying locals while an exception propagates.
:::

```quiz
? How should you catch exceptions?
- By value
- By pointer
+ By const reference
> It avoids copies and slicing, and keeps the real exception type.
? If a constructor throws, does that object's destructor run?
- Yes
+ No; but already-constructed members and bases are destroyed
- Only for stack objects
> The object was never fully constructed.
? Which is a good use of exceptions?
- Ending a loop when the search finds an item
+ Reporting that a file could not be opened inside a constructor
- Returning from a function early
> Exceptions are for errors the immediate caller usually cannot handle, not for normal control flow.
```

:::keypoints
- `throw` unwinds the stack, destroying locals; `catch (const T& e)` handles it. Specific handlers first.
- Derive custom exceptions from `std::exception` or `runtime_error` and carry useful data.
- RAII makes cleanup automatic during unwinding. Constructors may throw; their destructors then do not run.
- Use `noexcept` for moves, swap and destructors. Use exceptions for exceptional errors only.
:::
