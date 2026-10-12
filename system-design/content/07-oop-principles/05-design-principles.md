---
title: More Design Principles and Code Smells
level: intermediate
time: 45
summary: The principles beyond SOLID that interviewers listen for — DRY, KISS, YAGNI, high cohesion and low coupling, the Law of Demeter, tell-don't-ask, fail fast, immutability and value objects (a Money type in C++ and JavaScript) — plus the common code smells and the refactorings that fix them.
---

SOLID covers how classes relate. A handful of other principles cover everyday decisions: how much to build, how classes talk, where validation goes, what a field's type should be. They're short to state and easy to recognise in an interview, so this lesson pairs each with a concrete example, then lists the **code smells** that signal a principle is being broken.

## DRY — Don't Repeat Yourself

:::def DRY
Every piece of **knowledge** (a business rule, a formula, a validation) should have a single, authoritative representation in the system.
:::

If the GST rate is hard-coded in five places, changing it means finding all five. DRY is about **knowledge**, not text: two pieces of code that look alike but represent different rules (a 7-day return window and a 7-day trial period) should **not** be merged just because the number is the same; they'll change for different reasons.

## KISS — Keep It Simple

Prefer the simplest design that meets the requirements. A `HashMap` beats a hand-rolled skip list; a direct method call beats an event bus for two classes in the same module. Simple code is easier to verify in an interview, and interviewers reward working simplicity over half-finished cleverness.

## YAGNI — You Aren't Gonna Need It

Don't build features, abstractions or extension points for requirements you **imagine** might come. Each speculative interface costs reading time and makes the real change harder when it arrives in a different shape. In an interview: put interfaces at the variation points the requirements **mention**, and say what you'd add later, without building it.

:::tip The balance
OCP says "make it easy to extend"; YAGNI says "don't extend before you need to". The resolution: design **seams** where change is likely (stated in the requirements or obvious in the domain: pricing rules, payment providers, notification channels), and keep everything else concrete.
:::

## High cohesion, low coupling

:::def Cohesion
How closely the responsibilities inside one class (or module) belong together. **High cohesion**: everything in `ShoppingCart` is about the cart.
:::

:::def Coupling
How much one class depends on the internals of others. **Low coupling**: `Checkout` uses a `PaymentGateway` interface and doesn't know about HTTP retries inside the Stripe client.
:::

Aim for **high cohesion, low coupling**. Low cohesion produces god classes; high coupling means one change ripples through many classes.

## Law of Demeter (principle of least knowledge)

:::def Law of Demeter
A method should only call methods on: itself, its parameters, objects it creates, and its direct fields. **"Talk to your friends, not to strangers."** Long call chains like `order.getCustomer().getWallet().getBalance()` reach through other objects' internals.
:::

:::tabs Law of Demeter + tell, don't ask
```js run
// ✗ The paperboy reaches into the customer's wallet
class WalletBad { constructor(b) { this.balance = b; } }
class CustomerBad { constructor(w) { this.wallet = w; } }
function collectBad(customer, amount) {
  if (customer.wallet.balance >= amount) {          // knows Customer has a Wallet, and how Wallet works
    customer.wallet.balance -= amount;
    return true;
  }
  return false;
}

// ✓ Tell the customer what you want; it decides how
class Wallet {
  #balance;
  constructor(b) { this.#balance = b; }
  withdraw(amount) {
    if (amount > this.#balance) return false;
    this.#balance -= amount;
    return true;
  }
  get balance() { return this.#balance; }
}
class Customer {
  #wallet;
  constructor(wallet) { this.#wallet = wallet; }
  pay(amount) { return this.#wallet.withdraw(amount); }   // the wallet could become a card later
}

console.log("bad:", collectBad(new CustomerBad(new WalletBad(50)), 30));
const asha = new Customer(new Wallet(50));
console.log("good:", asha.pay(30), asha.pay(30));          // second payment refused by the wallet itself
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Wallet {
    long balance_;
public:
    explicit Wallet(long b) : balance_(b) {}
    bool withdraw(long amount) {                    // the wallet enforces its own rule
        if (amount > balance_) return false;
        balance_ -= amount;
        return true;
    }
};

class Customer {
    Wallet wallet_;                                 // an internal detail nobody else touches
public:
    explicit Customer(long cash) : wallet_(cash) {}
    bool pay(long amount) { return wallet_.withdraw(amount); }   // tell, don't ask
};

class Paperboy {
public:
    // ✗ would be: if (c.getWallet().getBalance() >= amt) c.getWallet().setBalance(...)
    // ✓ talks only to its direct parameter:
    bool collect(Customer& c, long amount) { return c.pay(amount); }
};

int main() {
    Customer asha(50);
    Paperboy p;
    cout << boolalpha << "first: " << p.collect(asha, 30) << ", second: " << p.collect(asha, 30) << "\n";
}
```
:::

The fix is usually **tell, don't ask**: instead of pulling data out of objects to make decisions, ask the object that owns the data to do the work. That keeps rules next to the data they protect (encapsulation) and lets the internals change freely.

## Fail fast

Validate inputs and invariants **at the boundary**, as early as possible, and throw a clear error, instead of letting bad data flow deep into the system where it causes confusing failures later. Constructors are the most important place: **an object should never exist in an invalid state**.

## Immutability and value objects

:::def Value object
A small object defined entirely by its **value**, not an identity (Money, DateRange, Email, Coordinates). It's **immutable**: operations return new objects. Two value objects with the same fields are equal.
:::

**Primitive obsession** is the smell of representing domain concepts with raw primitives: `long amount` (rupees or paise? which currency?), `string email` (validated where?). A value object puts the rules in one place:

:::tabs A Money value object
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Money {                                       // immutable value object
    long minor_;                                    // paise, cents… never floating point
    string currency_;
public:
    Money(long minor, string currency) : minor_(minor), currency_(std::move(currency)) {
        if (currency_.size() != 3) throw invalid_argument("currency must be an ISO code like INR");
    }
    static Money of(double major, const string& cur) { return Money(llround(major * 100), cur); }

    Money operator+(const Money& o) const { check(o); return Money(minor_ + o.minor_, currency_); }
    Money operator-(const Money& o) const { check(o); return Money(minor_ - o.minor_, currency_); }
    Money times(int qty) const { return Money(minor_ * qty, currency_); }
    // split without losing a paisa: the remainder goes to the first shares
    vector<Money> allocate(int parts) const {
        vector<Money> out;
        for (int i = 0; i < parts; i++) out.emplace_back(minor_ / parts + (i < minor_ % parts ? 1 : 0), currency_);
        return out;
    }
    bool operator==(const Money& o) const { return minor_ == o.minor_ && currency_ == o.currency_; }
    string str() const {
        ostringstream s;
        s << currency_ << " " << minor_ / 100 << "." << setw(2) << setfill('0') << abs(minor_ % 100);
        return s.str();
    }
private:
    void check(const Money& o) const { if (o.currency_ != currency_) throw invalid_argument("currency mismatch"); }
};

int main() {
    Money price = Money::of(499.99, "INR");
    Money total = price.times(3) + Money::of(40, "INR");          // three items + delivery
    cout << "total: " << total.str() << "\n";
    cout << "split 3 ways:";
    for (auto& m : Money(1000, "INR").allocate(3)) cout << " " << m.str();
    cout << "\n";
    cout << boolalpha << "equal by value: " << (Money::of(10, "INR") == Money(1000, "INR")) << "\n";
    try { total + Money::of(5, "USD"); } catch (const exception& e) { cout << "error: " << e.what() << "\n"; }
    cout << "0.1 + 0.2 as doubles = " << setprecision(17) << 0.1 + 0.2 << "  (why money isn't a double)\n";
}
```
```js run
class Money {                                       // immutable value object
  #minor; #currency;
  constructor(minor, currency) {
    if (!Number.isInteger(minor)) throw new TypeError("amount must be an integer number of minor units");
    if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError("currency must be an ISO code like INR");
    this.#minor = minor; this.#currency = currency;
    Object.freeze(this);
  }
  static of(major, currency) { return new Money(Math.round(major * 100), currency); }
  #check(o) { if (o.#currency !== this.#currency) throw new Error("currency mismatch"); }
  plus(o) { this.#check(o); return new Money(this.#minor + o.#minor, this.#currency); }
  minus(o) { this.#check(o); return new Money(this.#minor - o.#minor, this.#currency); }
  times(qty) { return new Money(this.#minor * qty, this.#currency); }
  allocate(parts) {                                  // split without losing a paisa
    const base = Math.trunc(this.#minor / parts), rem = this.#minor % parts;
    return Array.from({ length: parts }, (_, i) => new Money(base + (i < rem ? 1 : 0), this.#currency));
  }
  equals(o) { return o instanceof Money && o.#minor === this.#minor && o.#currency === this.#currency; }
  toString() { return `${this.#currency} ${Math.trunc(this.#minor / 100)}.${String(Math.abs(this.#minor % 100)).padStart(2, "0")}`; }
}

const total = Money.of(499.99, "INR").times(3).plus(Money.of(40, "INR"));   // three items + delivery
console.log("total:", total.toString());
console.log("split 3 ways:", new Money(1000, "INR").allocate(3).map(String).join(" "));
console.log("equal by value:", Money.of(10, "INR").equals(new Money(1000, "INR")));
try { total.plus(Money.of(5, "USD")); } catch (e) { console.log("error:", e.message); }
console.log("0.1 + 0.2 as numbers =", 0.1 + 0.2, " (why money isn't a float)");
```
:::

Immutable objects are also **thread-safe for free** (nothing to lock), easy to cache and share, and impossible to corrupt through an alias.

## Code smells and their refactorings

:::def Code smell
A surface symptom in code that usually indicates a deeper design problem. Not a bug, but a hint to refactor.
:::

| Smell | What it looks like | Principle hurt | Typical refactoring |
|---|---|---|---|
| **God class** | one class with 40 methods doing everything (`ParkingSystemManager`) | SRP, cohesion | extract classes by responsibility |
| **Long method** | a 150-line method with comments separating "sections" | KISS | extract methods with good names |
| **Switch on type** | `if (type == CAR) … else if (type == BIKE) …` repeated | OCP | replace conditional with polymorphism (Strategy/State) |
| **Primitive obsession** | `double price`, `String status`, `int[] coords` | encapsulation | value objects, enums |
| **Feature envy** | a method that mostly uses another object's data | tell-don't-ask | move the method to the data's owner |
| **Message chains** | `a.getB().getC().doD()` | Law of Demeter | hide the delegate behind a method on `a` |
| **Shotgun surgery** | one change requires edits in 10 classes | cohesion, DRY | move the related code together |
| **Data class** | only fields + getters/setters, logic lives elsewhere | encapsulation | move behaviour into it |
| **Speculative generality** | interfaces and hooks no requirement needs | YAGNI | inline and delete |
| **Refused bequest** | a subclass that doesn't want inherited methods (throws) | LSP | composition or a different hierarchy |
| **Magic numbers** | `if (hours > 3) fee *= 0.9` | DRY, clarity | named constants, configuration |

:::interview Use the vocabulary while you code
Narrating small decisions earns credit: *"I'll make `Money` a value object so we never mix currencies or use floats"*, *"this method envies `Booking`'s data, so it belongs on `Booking`"*, *"I won't add a plugin system for now (YAGNI), but pricing is a strategy since the requirements say rates change."*
:::

```quiz
? Two methods both compute `price * 1.18` for GST. What's the DRY fix?
+ Put the tax rule in one place (a TaxCalculator or a constant) and reuse it
- Copy the line into a comment for documentation
- Nothing; two copies are fine
> The tax rule is one piece of knowledge and should have one representation.

? `order.getCustomer().getAddress().getCity()` in a shipping calculator violates which principle?
- KISS
+ The Law of Demeter
- Liskov Substitution
> The calculator reaches through several objects. Ask the order (or pass the city in) instead.

? What best describes a value object?
+ An immutable object defined by its values (like Money), compared by value, with its rules inside it
- An object with a database id
- Any object with only public fields
> Value objects replace primitives with types that validate and behave correctly.

? A team adds a generic plugin framework "in case we need it", though no requirement mentions plugins. Which principle does this ignore?
- DRY
+ YAGNI
- Dependency inversion
> Building for imagined requirements adds cost now and often doesn't fit the real need later.
```

:::keypoints
- **DRY**: one representation per piece of knowledge (not per similar-looking text). **KISS**: the simplest design that works. **YAGNI**: don't build for imagined requirements.
- Aim for **high cohesion, low coupling**.
- **Law of Demeter** + **tell, don't ask**: talk to direct collaborators; let the data's owner do the work.
- **Fail fast**: validate at boundaries; objects are never constructed invalid.
- **Value objects** (Money, Email, DateRange): immutable, validated, compared by value; money in integer minor units.
- Recognise the **code smells** (god class, switch on type, primitive obsession, feature envy, message chains…) and their refactorings.
:::
