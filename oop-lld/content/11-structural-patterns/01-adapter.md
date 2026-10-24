---
title: Adapter
level: intermediate
time: 30
summary: Make a class with a different interface work with your code, without changing it. Learn the object adapter, the class adapter, a payment example, adapters you already use in the standard library, and how Adapter differs from similar patterns.
---

## What is the Adapter pattern?

Don't memorise the definition yet. Think of it like this:

> "I have a class that does the job, but its methods look different from what my code expects. I cannot change that class. So I put a small helper in between that translates."

:::analogy Think of a travel plug adapter
Your laptop charger has a two-pin plug, but the hotel socket has three round holes. You do not rewire your laptop or the hotel wall. You just put a small adapter between them.
:::

:::def Adapter
A small class that **converts one interface into another** that your code expects, so two classes that do not fit can work together.
:::

## The problem

Your code is written for a `PaymentGateway` interface. Now you want to use a **third-party** library. Its class has different method names, different units, and different types. You cannot (or should not) edit that library.

```viz algo=uml title="Object adapter"
interface PaymentGateway
  + pay(rupees: double): bool
class CheckoutService
  + checkout(amount: double): void
class LegacyBankApi
  + makeTransaction(paise: long, currency: string): int
class BankAdapter
  - bank: LegacyBankApi
  + pay(rupees: double): bool
CheckoutService --> PaymentGateway
BankAdapter ..|> PaymentGateway
BankAdapter --> LegacyBankApi : wraps
```

## The object adapter (the usual way)

The adapter **follows our interface** and **holds the third-party object inside**. When we call it, it translates and passes the call on.

```cpp run title="Adapting a legacy API to our interface"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

// ---- what our code expects (the "target" interface) ----
class PaymentGateway {
public:
    virtual ~PaymentGateway() = default;
    virtual bool pay(double rupees) = 0;
};

// ---- the third-party class we cannot modify (the "adaptee") ----
class LegacyBankApi {
public:
    int makeTransaction(long paise, const string& currency) {          // different name, different units, returns a status code
        cout << "  [legacy bank] debit " << paise << " " << currency << "\n";
        return paise > 0 ? 0 : -1;                                    // 0 = success
    }
};

// ---- the adapter: implements OUR interface, delegates to THEIR class ----
class BankAdapter : public PaymentGateway {
    LegacyBankApi bank_;                                              // composition
public:
    bool pay(double rupees) override {
        long paise = static_cast<long>(rupees * 100 + 0.5);           // convert the units
        return bank_.makeTransaction(paise, "INR") == 0;              // convert the result
    }
};

// ---- client code: knows only PaymentGateway ----
class CheckoutService {
    PaymentGateway& gateway_;
public:
    explicit CheckoutService(PaymentGateway& g) : gateway_(g) {}
    void checkout(double amount) {
        bool ok = gateway_.pay(amount);                          // (do the work first, then print the outcome)
        cout << "checkout " << amount << ": " << (ok ? "paid" : "failed") << "\n";
    }
};

int main() {
    BankAdapter adapter;
    CheckoutService svc(adapter);
    svc.checkout(499.50);
    svc.checkout(0);
}
```

Notice that `CheckoutService` does not change at all. It never even hears about `LegacyBankApi`. All the translation (names, units, error styles) lives in **one small class**.

## Many adapters, one interface

```cpp run title="Several third-party gateways behind one interface"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct PaymentGateway { virtual ~PaymentGateway() = default; virtual bool pay(double rupees) = 0; virtual string name() const = 0; };

// Third-party A: takes cents of a dollar as a string
struct StripeLike { string charge(const string& cents) { cout << "  [StripeLike] charge " << cents << " cents\n"; return "OK"; } };
// Third-party B: takes a double and throws on failure
struct UpiLike { void collect(double rupees) { if (rupees > 1000) throw runtime_error("limit"); cout << "  [UpiLike] collect Rs" << rupees << "\n"; } };

class StripeAdapter : public PaymentGateway {
    StripeLike impl_;
public:
    bool pay(double rupees) override { return impl_.charge(to_string(static_cast<long>(rupees * 1.2))) == "OK"; }   // pretend FX rate
    string name() const override { return "stripe"; }
};
class UpiAdapter : public PaymentGateway {
    UpiLike impl_;
public:
    bool pay(double rupees) override {
        try { impl_.collect(rupees); return true; }                      // exception convention -> bool convention
        catch (const exception&) { return false; }
    }
    string name() const override { return "upi"; }
};

int main() {
    vector<unique_ptr<PaymentGateway>> gateways;
    gateways.push_back(make_unique<StripeAdapter>());
    gateways.push_back(make_unique<UpiAdapter>());
    for (auto& g : gateways) {
        bool small = g->pay(500);
        bool big = g->pay(5000);
        cout << g->name() << ": 500 -> " << (small ? "ok" : "declined") << ", 5000 -> " << (big ? "ok" : "declined") << "\n";
    }
}
```

Each provider gets its own small adapter. The rest of the code stays the same.

## The class adapter (using inheritance)

Another way is to **inherit** from the third-party class. It also works, but it is tied closely to that one class, so people use it less.

```cpp run title="Class adapter with multiple inheritance"
#include <iostream>
using namespace std;

struct Target { virtual ~Target() = default; virtual int sizeInCm() const = 0; };
struct Adaptee { int widthInInches() const { return 10; } };

class ClassAdapter : public Target, private Adaptee {          // implements Target, reuses Adaptee privately
public:
    int sizeInCm() const override { return static_cast<int>(widthInInches() * 2.54); }
};

int main() { ClassAdapter a; cout << a.sizeInCm() << " cm\n"; }
```

**Prefer the object adapter.** It uses composition, works with any child of the third-party class, and does not show the third-party methods to others.

## You already use adapters

| Adapter | What it adapts | Into |
|---|---|---|
| `std::stack<T, Container>` | a `deque` or `vector` | a "last in, first out" stack |
| `std::queue`, `std::priority_queue` | `deque`, `vector` | a queue, a heap |
| `std::back_inserter(c)` | `push_back` | something algorithms can write into |
| `std::function` / lambdas | any callable thing | one standard call shape |
| `std::string_view` | a block of characters | a read-only string-like view |
| `std::reverse_iterator` | an iterator | the same data, backwards |

```cpp run title="stack adapts a vector"
#include <iostream>
#include <stack>
#include <vector>
using namespace std;

int main() {
    stack<int, vector<int>> s;           // the adapter hides vector's interface and shows only push/pop/top
    s.push(1); s.push(2); s.push(3);
    cout << s.top() << " " << s.size() << "\n";
    // s[0];                              // not available: the adapter narrowed the interface
}
```

## Adapter vs similar patterns

| Pattern | What it does | Does the interface change? |
|---|---|---|
| **Adapter** | makes an **existing** interface fit a **different** one | yes, that is the point |
| **Facade** | gives a **simpler** interface to a whole group of classes | yes, a new simpler one |
| **Decorator** | adds behaviour | no, same interface |
| **Proxy** | controls access | no, same interface |
| **Bridge** | lets two things grow separately (planned from the start) | designed, not patched |

Quick memory trick: Adapter is usually used **after** the fact (to join something that already exists). Bridge is planned **at the start**.

## When to use it

- You use a third-party or old library and cannot change its interface.
- You want your code to depend only on **your** interface, so you can swap the vendor later.
- Several classes do similar work with different interfaces, and you want one common way to use them.

## Short answer to say in an interview

:::interview What is the difference between an object adapter and a class adapter?
"Both follow the interface my code expects. A class adapter inherits from the third-party class, so it is tied to that one class. An object adapter holds the third-party object as a member and passes calls to it. This is composition, so it works with child classes too and hides the original methods. I prefer the object adapter."
:::

```quiz
? What does the Adapter pattern change?
- The behaviour of an object
+ The interface: it translates calls from the one we expect into the one that exists
- The number of objects
> It lets two things that do not fit work together without editing either.
? Which form do we prefer in C++?
- Class adapter using inheritance
+ Object adapter using composition
> Composition is more flexible and hides the other class's insides.
? std::stack is an example of...
- Factory
+ Adapter
- Singleton
> It adapts a container into a stack interface.
```

:::keypoints
- Adapter translates one interface into the one your code expects. It follows your interface and holds the other object.
- Prefer the object adapter. Keep all translation in the adapter.
- Use it to wrap third-party and old code, so the rest of your system depends only on your interface.
:::
