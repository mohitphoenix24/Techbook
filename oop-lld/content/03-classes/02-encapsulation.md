---
title: Encapsulation and access control
level: easy
time: 25
summary: private, protected and public, why data stays private, how to design a small public interface, getters and setters done well (and the "tell, don't ask" alternative), immutability, and the difference between encapsulation, abstraction and information hiding.
---

**Encapsulation** means two things together: (1) bundle data with the code that works on it, and (2) **restrict access** so the outside can touch the data only through a controlled interface.

## The three access levels

| Level | Who can use it |
|---|---|
| `public` | everyone |
| `protected` | the class itself and its derived classes |
| `private` | only the class itself (and its friends) |

```cpp run title="Access control in action"
#include <iostream>
using namespace std;

class Thermostat {
    double celsius_ = 20;                       // private: the stored form is an internal choice
public:
    void setCelsius(double c) {
        if (c < -50 || c > 150) { cout << "rejected " << c << "\n"; return; }   // protect the invariant
        celsius_ = c;
    }
    double celsius() const { return celsius_; }
    double fahrenheit() const { return celsius_ * 9 / 5 + 32; }   // derived value, nothing stored
};

int main() {
    Thermostat t;
    t.setCelsius(25);
    t.setCelsius(900);                          // refused
    cout << t.celsius() << "C = " << t.fahrenheit() << "F\n";
}
```

Why is it good that `celsius_` is private? Tomorrow you may want to store Kelvin instead. Only the class changes. Every caller keeps working because they never touched the field.

:::def Information hiding
Hiding the *decisions that may change* (data layout, algorithm, storage) behind a stable interface, so that a change inside does not ripple outside. Encapsulation is the language mechanism; information hiding is the design goal.
:::

## Getters and setters: use them carefully

A class full of `getX()` and `setX()` for every field is not encapsulated. It is a struct with extra typing. The outside can still do anything with the data.

```cpp run title="Anemic class vs behaviour-rich class"
#include <iostream>
using namespace std;

// BAD: setters expose everything. Rules end up scattered in every caller.
class BadAccount {
    double balance_ = 0;
public:
    double getBalance() const { return balance_; }
    void setBalance(double b) { balance_ = b; }
};

// GOOD: operations that mean something. The rules live in ONE place.
class Account {
    double balance_ = 0;
public:
    void deposit(double amount) { if (amount > 0) balance_ += amount; }
    bool withdraw(double amount) {
        if (amount <= 0 || amount > balance_) return false;
        balance_ -= amount;
        return true;
    }
    double balance() const { return balance_; }
};

int main() {
    BadAccount bad;
    bad.setBalance(bad.getBalance() - 500);       // caller does the arithmetic, and breaks the rule
    cout << "bad: " << bad.getBalance() << "\n";

    Account good;
    cout << "good withdraw: " << good.withdraw(500) << ", balance " << good.balance() << "\n";
}
```

:::def Tell, don't ask
Do not **ask** an object for its data and then decide things outside. **Tell** the object what to do and let it decide: `account.withdraw(500)` instead of `if (account.getBalance() >= 500) account.setBalance(...)`. This keeps rules inside the class and reduces coupling.
:::

Guidelines:

1. Start with **no** getters and setters. Add a getter only when a caller truly needs the value.
2. Name operations after *behaviour* (`deposit`, `cancel`, `ship`), not after fields (`setStatus`).
3. A setter that validates is better than a public field. A method that performs a business action is better than a setter.
4. Return small values by value, and large read-only members by `const&`.

## Immutability: the strongest encapsulation

If an object cannot change after creation, there is nothing to protect and it is automatically thread-safe.

```cpp run title="An immutable value type"
#include <iostream>
#include <stdexcept>
using namespace std;

class Money {
    long paise_;                                   // store as an integer to avoid floating-point errors
public:
    explicit Money(long paise) : paise_(paise) {
        if (paise < 0) throw invalid_argument("negative money");
    }
    Money plus(const Money& o) const { return Money(paise_ + o.paise_); }   // returns a NEW object
    long paise() const { return paise_; }
};

int main() {
    Money a(1050), b(275);
    Money c = a.plus(b);
    cout << a.paise() << " + " << b.paise() << " = " << c.paise() << "\n";
}
```

LLD tip: model identifiers, money, time ranges, coordinates and similar small concepts as **immutable value types**. They remove a whole class of bugs.

## Encapsulation vs abstraction

These two are always confused. Learn the difference once.

| | Encapsulation | Abstraction |
|---|---|---|
| **Question it answers** | *How do I protect data and hide the details?* | *What is the simple view of this thing?* |
| **Level** | implementation (inside a class) | design (the interface) |
| **Tool in C++** | `private`, `protected`, `const` | abstract classes, interfaces, templates, good names |
| **Example** | `balance_` is private | `PaymentMethod::pay()` hides whether it is card or UPI |

Everyday example: a car. *Abstraction*: you know "steering wheel, pedals, gear". *Encapsulation*: the engine is behind the bonnet; you cannot reach in and adjust the fuel injector while driving.

## Breaking encapsulation by accident

```cpp run title="A getter that leaks the internals"
#include <iostream>
#include <vector>
using namespace std;

class Playlist {
    vector<string> songs_;
public:
    void add(const string& s) { songs_.push_back(s); }
    vector<string>& songs() { return songs_; }                 // LEAK: caller gets the real vector
    const vector<string>& view() const { return songs_; }      // read-only view: safe
};

int main() {
    Playlist p;
    p.add("Tum Hi Ho");
    p.songs().clear();                       // anyone can now empty it without p knowing
    cout << p.view().size() << " songs left\n";
}
```

Returning a non-const reference (or pointer) to a private member hands over the keys. Return `const&`, a copy, or a read-only view (`std::span<const T>`).

:::interview Frequently asked
"Is a class with all-private members and public getters and setters properly encapsulated?" Answer: "Not necessarily. If the getters and setters simply expose every field, the class gives no protection. Good encapsulation means exposing *behaviour* that maintains the invariants, and giving access to data only where needed."
:::

```quiz
? Which is the best reason to keep data members private?
- It makes the code run faster
+ So that the class can change its representation and protect its invariants
- Because C++ requires it
> Callers depend only on the public interface, so the inside can change safely.
? What does "tell, don't ask" suggest?
- Always add getters for every field
+ Give objects commands and let them make decisions with their own data
- Use public data
> Instead of reading data and deciding outside, call a method that does the whole job.
```

:::keypoints
- `private` data + a small `public` interface = encapsulation. The goal is information hiding.
- Prefer behaviour methods over getters and setters. Tell, don't ask.
- Never return non-const references to private members.
- Immutable value types (Money, TimeRange, Id) are the safest design tool.
:::
