---
title: Adapter
level: intermediate
time: 30
summary: Making an incompatible interface fit the one your code expects, with an object adapter (composition) and a class adapter (inheritance), a payment-gateway example, adapters in the standard library, and how Adapter differs from Facade, Bridge and Proxy.
---

:::def Adapter
Convert the interface of a class into **another interface that clients expect**. Adapter lets classes work together that could not otherwise, because of incompatible interfaces.
:::

:::analogy Think of it like this
A travel plug adapter. Your laptop charger has a two-pin plug; the hotel socket has three round holes. You do not rewire the laptop or the wall. You put a small adapter in between.
:::

## The problem

Your code is written against `PaymentGateway`. You need to use a **third-party** library whose class has different method names, units and types. You cannot (or should not) change the library.

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

## Object adapter (composition): the usual choice

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

The client, `CheckoutService`, is unchanged and never sees `LegacyBankApi`. A different provider gets its own small adapter. All the translation (units, names, error conventions) lives in **one** place.

## Two adapters, one interface

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

## Class adapter (inheritance)

A *class* adapter inherits from the adaptee (privately) and implements the target interface. It can override adaptee behaviour, but couples tightly and cannot adapt subclasses of the adaptee.

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

Prefer the **object adapter**: it favours composition, can wrap any subclass of the adaptee, and does not expose the adaptee.

## Adapters in the standard library

You have used adapters without noticing:

| Adapter | Adapts | To |
|---|---|---|
| `std::stack<T, Container>` | `deque`/`vector` | a LIFO interface |
| `std::queue`, `std::priority_queue` | `deque`, `vector` | FIFO / heap interfaces |
| `std::back_inserter(c)` | `push_back` | an output-iterator interface |
| `std::function` / lambdas | any callable | a uniform call signature |
| `std::string_view` | contiguous chars | a read-only string-like view |
| `std::reverse_iterator` | an iterator | the same sequence backwards |

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

| Pattern | Intent | Does the interface change? |
|---|---|---|
| **Adapter** | make an **existing** interface match a **different one expected** | yes: that is the whole point |
| **Facade** | a **simpler** interface over a whole subsystem | new, simpler interface |
| **Decorator** | add behaviour, **same interface** | no |
| **Proxy** | control access, **same interface** | no |
| **Bridge** | vary abstraction and implementation **independently** (designed up front) | designed, not retrofitted |

Adapter is usually applied **after the fact** (integrating something that exists). Bridge is designed **up front**.

## When to use it

- Integrating a third-party library or legacy code whose interface you cannot change.
- Isolating your code from a vendor API so it can be swapped (an **anti-corruption layer**).
- Making several classes with similar behaviour but different interfaces usable through one.

:::interview Object adapter vs class adapter?
"Both implement the target interface. A class adapter inherits the adaptee (multiple inheritance in C++), so it is tied to one concrete adaptee and can override its behaviour. An object adapter holds the adaptee as a member and delegates, which follows 'composition over inheritance': it works with the adaptee and its subclasses and hides the adaptee's interface. I prefer the object adapter."
:::

```quiz
? What does the Adapter pattern change?
- The behaviour of an object
+ The interface: it translates calls from the expected interface to the existing one
- The number of instances
> It lets incompatible interfaces work together without modifying either.
? Which form is generally preferred in C++?
- Class adapter via inheritance
+ Object adapter via composition
> Composition is more flexible and does not expose or depend on the adaptee's internals.
? `std::stack` is an example of...
- Factory
+ Adapter
- Singleton
> It adapts a sequence container to a stack interface.
```

:::keypoints
- Adapter translates one interface into the one clients expect. The adapter implements the target and holds (or inherits) the adaptee.
- Prefer the object adapter. Keep all translation (units, names, errors) in the adapter.
- Use it to wrap third-party and legacy code so the rest of your system depends only on your interface.
:::
