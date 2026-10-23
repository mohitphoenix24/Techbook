---
title: Error-handling strategies beyond exceptions
level: intermediate
time: 30
summary: Error codes, bool and optional returns, a Result type built with std::variant (like std::expected), assertions and preconditions, making illegal states unrepresentable, and how to choose the right strategy for an LLD solution.
---

Exceptions are one tool. Many codebases ban them (for speed or predictability), and many LLD interviews want to see that you **think about failure** in a clear, consistent way. Know the options.

## 1. Return a bool or an error code

```cpp run title="bool and out parameter vs enum error code"
#include <iostream>
#include <string>
using namespace std;

enum class WithdrawResult { Ok, InsufficientFunds, AccountFrozen, InvalidAmount };

const char* text(WithdrawResult r) {
    switch (r) {
        case WithdrawResult::Ok:                return "ok";
        case WithdrawResult::InsufficientFunds: return "insufficient funds";
        case WithdrawResult::AccountFrozen:     return "account frozen";
        case WithdrawResult::InvalidAmount:     return "invalid amount";
    }
    return "?";
}

class Account {
    double balance_ = 100;
    bool frozen_ = false;
public:
    WithdrawResult withdraw(double x) {
        if (x <= 0) return WithdrawResult::InvalidAmount;
        if (frozen_) return WithdrawResult::AccountFrozen;
        if (x > balance_) return WithdrawResult::InsufficientFunds;
        balance_ -= x;
        return WithdrawResult::Ok;
    }
};

int main() {
    Account a;
    cout << text(a.withdraw(30)) << ", " << text(a.withdraw(500)) << ", " << text(a.withdraw(-1)) << "\n";
}
```

An `enum class` of outcomes is clear and cheap. The weakness: callers can **ignore** the return value. Mark such functions `[[nodiscard]]` so the compiler warns when the result is dropped.

## 2. std::optional: "maybe a value"

Best when the only failure is "nothing found", with no need to say why.

```cpp run title="optional for lookups"
#include <iostream>
#include <map>
#include <optional>
#include <string>
using namespace std;

class UserDirectory {
    map<int, string> names_{{1, "asha"}, {2, "ravi"}};
public:
    [[nodiscard]] optional<string> find(int id) const {
        auto it = names_.find(id);
        if (it == names_.end()) return nullopt;
        return it->second;
    }
};

int main() {
    UserDirectory d;
    cout << d.find(1).value_or("unknown") << " " << d.find(9).value_or("unknown") << "\n";
    if (auto n = d.find(2)) cout << "found " << *n << "\n";
}
```

## 3. A Result type: a value or an error

When you need to know **why** it failed, but do not want exceptions, return either a value or an error. C++23 has `std::expected<T, E>`. We build a tiny version with `std::variant`, which works today.

```cpp run title="A minimal Result<T, E>"
#include <iostream>
#include <string>
#include <utility>
#include <variant>
using namespace std;

template <typename T, typename E>
class Result {
    variant<T, E> v_;
    explicit Result(variant<T, E> v) : v_(move(v)) {}
public:
    static Result ok(T value)  { return Result(variant<T, E>(in_place_index<0>, move(value))); }
    static Result err(E error) { return Result(variant<T, E>(in_place_index<1>, move(error))); }
    bool isOk() const { return v_.index() == 0; }
    const T& value() const { return get<0>(v_); }
    const E& error() const { return get<1>(v_); }
};

enum class ParseError { Empty, NotANumber, OutOfRange };

Result<int, ParseError> parseAge(const string& s) {
    if (s.empty()) return Result<int, ParseError>::err(ParseError::Empty);
    for (char c : s) if (c < '0' || c > '9') return Result<int, ParseError>::err(ParseError::NotANumber);
    int n = stoi(s);
    if (n > 150) return Result<int, ParseError>::err(ParseError::OutOfRange);
    return Result<int, ParseError>::ok(n);
}

int main() {
    for (const char* in : {"42", "", "4x", "999"}) {
        auto r = parseAge(in);
        if (r.isOk()) cout << "'" << in << "' -> age " << r.value() << "\n";
        else cout << "'" << in << "' -> error code " << static_cast<int>(r.error()) << "\n";
    }
}
```

Because success and failure are in the **type**, the caller cannot forget to look (as with an ignored error code). This style is common in Rust (`Result`), Go and modern C++ codebases.

## 4. Assertions and preconditions: for programmer errors

Some "errors" are **bugs**: calling `pop()` on an empty stack, an index out of range in internal code. Do not report these as recoverable errors. **Assert** them.

```cpp run title="assert and static_assert"
#include <cassert>
#include <iostream>
#include <vector>
using namespace std;

static_assert(sizeof(int) >= 4, "this code assumes at least 32-bit int");     // checked while compiling

class Stack {
    vector<int> items_;
public:
    void push(int x) { items_.push_back(x); }
    int pop() {
        assert(!items_.empty() && "pop() precondition: stack must not be empty");   // checked in debug builds
        int v = items_.back(); items_.pop_back(); return v;
    }
};

int main() {
    Stack s;
    s.push(5);
    cout << s.pop() << "\n";
    // s.pop();   // would abort in a debug build with the message above; assert is removed when NDEBUG is defined
}
```

| Tool | Checked when | For |
|---|---|---|
| `static_assert` | compile time | type sizes, template requirements |
| `assert` | run time, debug builds only | **bugs**: violated preconditions/invariants inside your own code |
| Exception / error return | run time, always | **expected failures**: bad user input, I/O, network |

Rule of thumb: validate **input from outside** the program (users, files, network) with real checks; assume **internal contracts** hold and `assert` them.

## 5. Make illegal states unrepresentable

The best error handling is a design where the error **cannot happen**. Use types to carry the rules.

```cpp run title="Types that cannot be wrong"
#include <iostream>
#include <stdexcept>
#include <string>
using namespace std;

// Weak: any int could be passed, and the checks are scattered
//   void setAge(int a);

// Strong: a type whose every value is valid. Check ONCE, at creation.
class Age {
    int v_;
public:
    explicit Age(int v) : v_(v) { if (v < 0 || v > 150) throw invalid_argument("age out of range"); }
    int value() const { return v_; }
};
void register_(const string& name, Age age) { cout << name << " registered, age " << age.value() << "\n"; }   // no check needed here

enum class Light { Red, Green, Yellow };                 // an enum cannot hold "purple"; a string could

int main() {
    register_("Asha", Age(30));
    try { register_("Zed", Age(-5)); } catch (const exception& e) { cout << "rejected: " << e.what() << "\n"; }
    Light l = Light::Green;
    cout << (l == Light::Green) << "\n";
}
```

## Choosing a strategy

| Situation | Best tool |
|---|---|
| "Not found" is normal | `std::optional<T>` |
| Several different failure reasons, caller should decide | `Result<T,E>` / `std::expected`, or an `enum class` result |
| Failure in a constructor | exception (or a factory returning optional/Result) |
| Rare, unrecoverable failure deep in the call stack | exception |
| Broken internal contract (a bug) | `assert` / `static_assert` |
| Invalid user input | validate and return an error value; do not throw for ordinary typos |

In an LLD interview, say which you chose and **why**, and use it consistently. "I will return `bool` or an enum from the public operations and keep exceptions for programmer errors" is a perfectly good policy.

```quiz
? Which tool should check "pop() was called on an empty stack" in internal code?
- A try/catch around every pop
+ An assertion: it is a bug in the caller, not a recoverable runtime condition
- Returning -1
> Assertions document and check contracts that should never be broken.
? When is `std::optional<T>` the right return type?
- When the function can fail for many different reasons
+ When the only failure is "no value", and the reason is not needed
- When you need exceptions
> If the caller needs to know why it failed, use a Result or an error enum.
? What does `[[nodiscard]]` do?
- Prevents copying
+ Makes the compiler warn if the return value is ignored
- Marks a function deprecated
> It stops callers from silently dropping error codes.
```

:::keypoints
- Options: error enums/bools, `optional`, `Result<T,E>`/`expected`, exceptions, assertions. Pick by whether failure is expected, whether the reason matters, and who can handle it.
- `[[nodiscard]]` stops ignored results. `assert` is for bugs; real checks are for outside input.
- Best of all: types that make invalid states impossible (`Age`, `enum class`, immutable value types).
:::
