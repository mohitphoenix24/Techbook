---
title: Headers, source files and the build
level: easy
time: 20
summary: How a real C++ project splits a class into .h and .cpp, what include guards and forward declarations do, the one-definition rule, and how to keep these examples in one file without confusion.
---

Our examples are single files, so that you can run them here. A real project has many files. Interviewers sometimes ask how you would lay out classes, and C++ questions about "ODR" and "forward declaration" are common. Here is the whole story.

## Declaration vs definition

A **declaration** tells the compiler a name exists. A **definition** gives its body or storage. You can declare many times, but you must define **once** (the **One Definition Rule**, ODR).

```cpp run title="Declare first, define later"
#include <iostream>
using namespace std;

int square(int x);                 // declaration (a promise)

int main() {
    cout << square(7) << "\n";     // the compiler only needs the declaration to compile this call
}

int square(int x) { return x * x; }   // definition (the linker connects the two)
```

## The usual layout of one class

```text
account.h      ← the CLASS DECLARATION: what it is and what it can do (the interface)
account.cpp    ← the DEFINITIONS of its member functions (the implementation)
main.cpp       ← code that uses Account: #include "account.h"
```

```cpp title="account.h"
#pragma once                       // include guard: this header is processed once per file
#include <string>

class Account {
public:
    explicit Account(std::string owner);
    void deposit(double amount);
    double balance() const;
private:
    std::string owner_;
    double balance_ = 0;
};
```

```cpp title="account.cpp"
#include "account.h"

Account::Account(std::string owner) : owner_(std::move(owner)) {}
void Account::deposit(double amount) { balance_ += amount; }
double Account::balance() const { return balance_; }
```

Each `.cpp` file is compiled on its own into an object file (a **translation unit**). The **linker** joins them. Build commands:

```bash
g++ -std=c++20 -c account.cpp -o account.o     # compile
g++ -std=c++20 -c main.cpp -o main.o
g++ account.o main.o -o app                    # link
```

:::def Include guard
Because `#include` pastes a file's text, including the same header twice (directly or through other headers) would define the class twice. `#pragma once` (or the classic `#ifndef ACCOUNT_H / #define ACCOUNT_H / #endif`) prevents this.
:::

## What belongs in a header?

| Goes in the header (.h) | Goes in the source (.cpp) |
|---|---|
| Class declarations | Member function definitions |
| Function declarations | Function bodies |
| `inline` / `constexpr` functions, **templates** (the compiler needs their body at each use) | Private helper functions, in an unnamed namespace |
| `enum class`, small structs, constants | Static data, large tables |

**Templates** must be fully visible where they are used, which is why template code lives in headers.

## Forward declarations break circular dependencies

If `Order` has a `Customer*` and `Customer` has a list of `Order*`, neither can include the other. A **forward declaration** `class Customer;` tells the compiler "this class exists" so that pointers and references to it can be written. It works only because a pointer's size does not depend on the class.

```cpp run title="Two classes that refer to each other"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

class Customer;                          // forward declaration

class Order {
    int id_;
    const Customer* owner_;              // a pointer to an incomplete type is fine
public:
    Order(int id, const Customer* owner) : id_(id), owner_(owner) {}
    void print() const;                  // defined below, after Customer is complete
};

class Customer {
    string name_;
    vector<Order> orders_;
public:
    explicit Customer(string n) : name_(move(n)) {}
    void place(int id) { orders_.emplace_back(id, this); }
    const string& name() const { return name_; }
    size_t orderCount() const { return orders_.size(); }
};

void Order::print() const { cout << "order " << id_ << " belongs to " << owner_->name() << "\n"; }

int main() {
    Customer c("Asha");
    c.place(101);
    c.place(102);
    cout << c.name() << " has " << c.orderCount() << " orders\n";
    Order o(7, &c);
    o.print();
}
```

:::tip Reduce include dependencies
In headers, prefer a forward declaration over `#include` when you only use a pointer or reference to a class. It makes builds faster and avoids circular includes. The **PIMPL idiom** (module 7) takes this to the extreme.
:::

## Linkage: static and inline

```cpp run title="Internal linkage and inline variables"
#include <iostream>
using namespace std;

namespace {                       // unnamed namespace: visible only in THIS file (internal linkage)
    int helperCalls = 0;
    int helper() { return ++helperCalls; }
}

inline constexpr int kMaxSeats = 120;     // inline variable (C++17): safe to define in a header

int main() {
    helper(); helper();
    cout << helperCalls << " " << kMaxSeats << "\n";
}
```

- `static` at file scope (or an unnamed namespace) = **private to this file**.
- `extern` = defined in another file.
- `inline` on a function or variable = "multiple identical definitions across files are fine" (the ODR exception that lets headers hold them).

```quiz
? Why do templates usually live in headers?
- Because templates are slow
+ The compiler must see the whole template body at each place it is used
- Because the linker cannot link templates
> A template is instantiated per use, so its definition must be visible in each translation unit that uses it.
? When is a forward declaration enough?
- When you create an object of the class
+ When you only declare a pointer or reference to it
- When you call its member functions
> Creating objects or calling members needs the full definition (the size and members).
```

:::keypoints
- Header = interface (declarations). Source file = implementation. Guard every header with `#pragma once`.
- ODR: one definition across the program; `inline`, templates and `constexpr` are the exceptions that may repeat.
- Forward-declare to break circular dependencies and cut build times.
- Use an unnamed namespace for file-private helpers.
:::
