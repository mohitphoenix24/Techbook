---
title: Why object-oriented programming?
level: easy
time: 20
summary: The problem OOP solves, shown with a bank account written two ways, and a first look at the four pillars (encapsulation, abstraction, inheritance, polymorphism) in one small program.
---

Before the rules, let us see the **problem**. OOP did not appear because someone liked classes. It appeared because large programs became impossible to change safely.

## The problem: data that anyone can break

Here is a bank account written in the old, procedural style: a plain `struct` of data and some free functions.

```cpp run title="Procedural account: nothing protects the data"
#include <iomanip>
#include <iostream>
using namespace std;

struct Account {
    int id;
    double balance;
};

void deposit(Account& a, double amount)  { a.balance += amount; }
void withdraw(Account& a, double amount) { a.balance -= amount; }

int main() {
    cout << fixed << setprecision(2);     // print money with two decimals
    Account acc{1, 100.0};
    withdraw(acc, 250.0);                 // oops: nothing stops this
    cout << "balance = " << acc.balance << "\n";

    acc.balance = 1'000'000;              // any code, anywhere, can do this
    cout << "balance = " << acc.balance << "\n";
}
```

The account now has a **negative balance**, and any line of code can change the balance to any number. In a program with 200 files, you cannot answer "who changed this?" or "which code must I check if I change the balance rules?". The rule "balance never goes below zero" lives nowhere. It is only a hope.

:::def Invariant
A condition that must **always** be true for an object to be valid. Example: "an account's balance is never negative". Good OOP design makes it impossible to break an invariant from outside the class.
:::

## The same account as a class

```cpp run title="A class guards its own invariant"
#include <iostream>
#include <stdexcept>
using namespace std;

class Account {
    int id_;
    double balance_ = 0;                          // private: only Account's functions can change it
public:
    explicit Account(int id, double opening = 0) : id_(id), balance_(opening) {
        if (opening < 0) throw invalid_argument("opening balance cannot be negative");
    }
    void deposit(double amount) {
        if (amount <= 0) throw invalid_argument("deposit must be positive");
        balance_ += amount;
    }
    bool withdraw(double amount) {                // returns false instead of breaking the rule
        if (amount <= 0 || amount > balance_) return false;
        balance_ -= amount;
        return true;
    }
    double balance() const { return balance_; }   // read-only access
};

int main() {
    Account acc(1, 100.0);
    cout << "withdraw 250: " << (acc.withdraw(250) ? "ok" : "refused") << "\n";
    cout << "withdraw 40 : " << (acc.withdraw(40) ? "ok" : "refused") << "\n";
    cout << "balance = " << acc.balance() << "\n";
    // acc.balance_ = 5;   // would not compile: balance_ is private
}
```

Now the rule is written **once**, inside the class, next to the data. The compiler refuses any code outside that tries to cheat. If the bank changes the rule ("allow an overdraft of 500"), you change one place.

:::analogy Think of it like this
An ATM. You cannot reach into the machine and take cash. You can only press buttons: *deposit*, *withdraw*, *check balance*. The machine decides what is allowed. The buttons are the **public interface**. The cash box inside is the **private data**.
:::

## The four pillars, in one program

OOP is usually explained with four ideas. Do not memorise them as words. See them working once, together.

```cpp run title="Encapsulation, abstraction, inheritance, polymorphism"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

// ABSTRACTION: say WHAT a payment method can do, not HOW.
class PaymentMethod {
public:
    virtual ~PaymentMethod() = default;
    virtual bool pay(double amount) = 0;
    virtual string name() const = 0;
};

// INHERITANCE: Card "is a" PaymentMethod and reuses its contract.
class Card : public PaymentMethod {
    double limit_;                       // ENCAPSULATION: hidden state
public:
    explicit Card(double limit) : limit_(limit) {}
    bool pay(double amount) override {
        if (amount > limit_) return false;
        limit_ -= amount;
        return true;
    }
    string name() const override { return "Card"; }
};

class Wallet : public PaymentMethod {
    double balance_;
public:
    explicit Wallet(double b) : balance_(b) {}
    bool pay(double amount) override {
        if (amount > balance_) return false;
        balance_ -= amount;
        return true;
    }
    string name() const override { return "Wallet"; }
};

// POLYMORPHISM: this function works with ANY PaymentMethod, today's and tomorrow's.
void checkout(PaymentMethod& m, double amount) {
    cout << m.name() << " pays " << amount << ": " << (m.pay(amount) ? "success" : "declined") << "\n";
}

int main() {
    vector<unique_ptr<PaymentMethod>> methods;
    methods.push_back(make_unique<Card>(500));
    methods.push_back(make_unique<Wallet>(80));
    for (auto& m : methods) checkout(*m, 120);
}
```

| Pillar | One-line meaning | Where you saw it |
|---|---|---|
| **Encapsulation** | Bundle data with the functions that use it, and hide the data | `limit_` and `balance_` are private |
| **Abstraction** | Show only what matters; hide how it is done | `PaymentMethod` lists `pay` and `name`, nothing else |
| **Inheritance** | A new type reuses and extends an existing one ("is-a") | `Card : public PaymentMethod` |
| **Polymorphism** | One call, different behaviour depending on the real type | `m.pay(amount)` runs Card's or Wallet's code |

Adding a `UpiPayment` class later needs **no change** to `checkout`. That is the real prize of OOP: you extend the program by adding code, not by editing working code.

## OOP is a tool, not a religion

C++ is a **multi-paradigm** language. Good C++ programmers pick the right tool.

| Style | Idea | In C++ | Good for |
|---|---|---|---|
| Procedural | Functions that work on data | free functions, `struct` | small tools, algorithms |
| Object-oriented | Objects that own data and behaviour | classes, virtual functions | long-lived systems with many "kinds of things" |
| Generic | Code that works for any type | templates, concepts | containers, algorithms |
| Functional | Pure functions, values | lambdas, `std::transform` | data pipelines |

:::interview When not to use inheritance?
Interviewers like this question. A strong answer: "When the relationship is *has-a*, or I only want to reuse code, I prefer **composition**. I use inheritance for a true *is-a* relationship where the child can be used anywhere the parent is expected (the Liskov rule)." You will meet this again in the SOLID module.
:::

```quiz
? In the first (procedural) example, what was the main design problem?
- The function names were too long
+ Any code could change the balance, so the "never negative" rule was not protected
- Structs cannot hold doubles
> The data was public and the rule lived nowhere. A class puts the data and the rule together and hides the data.
? Which pillar lets `checkout(PaymentMethod&)` work with a class written next year?
- Encapsulation
+ Polymorphism
- Templates only
> Calls go through the base-class interface, and virtual dispatch picks the real type's code at run time.
? What is an invariant?
- A constant variable
+ A condition that must always hold for a valid object
- A static member
> For example: balance >= 0, or end_time >= start_time. A class constructor and member functions must keep it true.
```

:::keypoints
- OOP exists to **protect invariants** and to **limit the blast radius of change**.
- A class keeps data private and exposes a small public interface.
- The four pillars: encapsulation, abstraction, inheritance, polymorphism. You should be able to show each in a few lines of code.
- Prefer composition when the relation is *has-a*. Use inheritance for real *is-a*.
:::
