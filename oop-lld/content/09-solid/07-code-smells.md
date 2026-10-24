---
title: Code smells and how to fix them
level: intermediate
time: 40
summary: The common signs of bad design (called code smells), each with a small example and a simple cure. Learn to name the smell and say how you would fix it.
---

A **code smell** is a small sign that the design may have a deeper problem. It is called a "smell" because, like a bad smell in the kitchen, it tells you to look closer. It does not always mean the code is wrong.

In an interview, saying *"This is a god class, so I would split it"* shows that you really understand design.

## The list of smells

| Smell | What you see | Which rule it breaks | Simple cure |
|---|---|---|---|
| **God class** | one class with dozens of methods about different things | SRP | split it by job |
| **Long method** | 60+ lines with comments like "now do part 2" | SRP | break into small methods |
| **Switch on type** | the same `switch (type)` in many places | OCP | one class per type |
| **Feature envy** | a method uses another class's data more than its own | cohesion | move the method there |
| **Primitive obsession** | `string` for an email, `int` for money | encapsulation | make small types |
| **Long parameter list** | 6 or more parameters | cohesion | put them in one object |
| **Data clumps** | the same 3 values always travel together | cohesion | make them a class |
| **Shotgun surgery** | one small change means editing many classes | cohesion | put what changes together in one place |
| **Divergent change** | one class changes for many unrelated reasons | SRP | split it |
| **Too friendly** | classes dig into each other's private parts | coupling | hide details, use an interface |
| **Message chain** | `a.getB().getC().getD()` | Law of Demeter | give `a` one method that does it |
| **Duplicate code** | copy and paste | DRY | extract a function or class |
| **Speculative generality** | interfaces nobody uses "just in case" | YAGNI | delete them |
| **Refused bequest** | a child ignores or throws on parent methods | LSP | use composition or restructure |
| **Global mutable state** | singletons and `static` variables used everywhere | testability | pass dependencies in |
| **Magic numbers** | `if (status == 3)` | readability | `enum class` or a named constant |

## Example 1: primitive obsession and data clumps

The smell: an email is just a `string`, money is just an `int`. Nothing stops you from passing a wrong value.

The cure: make small types that check themselves.

```cpp run title="Cure: small value types"
#include <iostream>
#include <stdexcept>
#include <string>
using namespace std;

// BEFORE: every function takes raw strings/doubles that could be anything
//   void book(string email, string phone, double lat, double lon, int rupees);

// AFTER: types that carry rules, created once
class Email {
    string v_;
public:
    explicit Email(string v) : v_(move(v)) { if (v_.find('@') == string::npos) throw invalid_argument("bad email: " + v_); }
    const string& str() const { return v_; }
};
struct GeoPoint { double lat, lon; };                    // lat and lon always travel together: a data clump became a type
class Money {
    long paise_;
public:
    static Money rupees(long r) { return Money(r * 100); }
    long paise() const { return paise_; }
private:
    explicit Money(long p) : paise_(p) {}
};

void book(const Email& e, GeoPoint where, Money fee) {
    cout << "booking for " << e.str() << " at (" << where.lat << ", " << where.lon << ") fee Rs" << fee.paise() / 100 << "\n";
}

int main() {
    book(Email("asha@example.com"), {18.52, 73.85}, Money::rupees(250));
    try { book(Email("not-an-email"), {0, 0}, Money::rupees(1)); }
    catch (const exception& e) { cout << "rejected: " << e.what() << "\n"; }
}
```

## Example 2: feature envy and message chains

The smell: a method keeps reading another object's data (`order.customer.address.city`). It is "envious" of that class.

The cure: move the work to the class that owns the data.

```cpp run title="Cure: move the method to where the data lives"
#include <iostream>
using namespace std;

struct Address { string city; string pin; };
class Customer {
    Address address_{"Pune", "411001"};
public:
    // Message chain exposure:  order.customer().address().city
    const Address& address() const { return address_; }
    // Tell, don't ask: the customer answers the question itself
    bool livesIn(const string& city) const { return address_.city == city; }
};
class Order {
    Customer customer_;
public:
    const Customer& customer() const { return customer_; }
    bool isLocal(const string& city) const { return customer_.livesIn(city); }   // no digging into Address
};

// ENVY: this function wants Order's/Customer's/Address's data more than its own
double shippingBad(const Order& o) { return o.customer().address().city == "Pune" ? 40 : 120; }
// CURE: ask the order a question, in the domain's own words
double shippingGood(const Order& o) { return o.isLocal("Pune") ? 40 : 120; }

int main() {
    Order o;
    cout << shippingBad(o) << " " << shippingGood(o) << "\n";
}
```

## Example 3: a long list of parameters

The smell: `createUser(name, email, age, city, pin, phone, ...)`. It is easy to mix up the order.

The cure: put the related values in one object (or use a builder).

```cpp run title="Cure: parameter object (or builder)"
#include <iostream>
#include <string>
using namespace std;

// BEFORE: void sendMail(string from, string to, string subject, string body, bool html, bool highPriority, int retries);
struct MailOptions {
    bool html = false;
    bool highPriority = false;
    int retries = 3;
};
struct Mail { string from, to, subject, body; };

void sendMail(const Mail& m, const MailOptions& opt = {}) {
    cout << "mail to " << m.to << " '" << m.subject << "' html=" << opt.html << " high=" << opt.highPriority << " retries=" << opt.retries << "\n";
}

int main() {
    sendMail({"a@x.com", "b@y.com", "Hi", "Hello"});
    sendMail({"a@x.com", "b@y.com", "Urgent", "Server down"}, {.html = true, .highPriority = true});   // C++20 designated init
}
```

## Example 4: global state (the Singleton smell)

The smell: a class quietly uses a global object inside. You cannot see it from outside, and you cannot replace it in tests.

The cure: pass the helper in.

```cpp run title="Cure: inject the dependency"
#include <iostream>
#include <string>
using namespace std;

// BEFORE: Logger::instance().log("..."): hidden global dependency, hard to test, hard to change
// AFTER: the dependency is a parameter, visible and replaceable
struct Logger { virtual ~Logger() = default; virtual void log(const string& s) = 0; };
struct ConsoleLogger : Logger { void log(const string& s) override { cout << "  [console] " << s << "\n"; } };
struct SilentLogger : Logger { void log(const string&) override {} };           // for tests

class Checkout {
    Logger& log_;
public:
    explicit Checkout(Logger& l) : log_(l) {}
    void pay(int amount) { log_.log("paying " + to_string(amount)); }
};

int main() {
    ConsoleLogger c; SilentLogger s;
    Checkout(c).pay(100);
    Checkout(s).pay(100);                  // tests use the silent one
    cout << "done\n";
}
```

## Practice: name the smell

Try to answer first, then read the answers.

:::exercise Name the smell
1. `if (user.getAccount().getWallet().getBalance() > price) { ... }`
2. A class `Util` with `parseDate`, `sendEmail`, `calcTax`, `hashPassword`.
3. Eight functions that all start with `switch (shape.kind)`.
4. A `Square` class where `setHeight` throws "not supported".
5. Every time the tax law changes, you edit `Invoice`, `Cart`, `Quote`, `Report` and `Refund`.
:::

:::solution Answers
1. **Message chain.** Add `user.canAfford(price)`.
2. **God or utility class.** Split it into a parser, a mailer, a tax service and a security service.
3. **Switch on type.** Give `Shape` its own methods, one class per kind.
4. **Refused bequest.** Do not inherit. Use a shared interface or make them siblings.
5. **Shotgun surgery.** Create one `TaxPolicy` that all five use.
:::

## When should you refactor?

Not every smell must be fixed at once. Fix it when it **hurts**:

- a new feature must touch many places,
- tests are hard to write,
- you keep getting confused reading one class.

Do it in **small steps**, and run the tests after each step.

## Short answer to say in an interview

:::interview When do you refactor, and how?
"I refactor when a smell is causing pain. For example, when one change touches many classes, or when I cannot write a test easily. I take small steps and keep the tests passing after each step. I also name the smell and the design I am moving to, so the team understands the change."
:::

```quiz
? A method uses another class's getters ten times and hardly uses its own data. What is the smell?
- Long method
+ Feature envy. The method belongs in the other class
- Singleton
> Move the work to where the data lives.
? Which cure fits "the same switch on type in many functions"?
- Extract a method
+ One class per case (polymorphism)
- Use a global variable
> This breaks OCP. Putting each case in its own class fixes it.
? What is primitive obsession?
- Using too many pointers
+ Using plain strings and ints for real ideas like email or money
- Using simple containers
> Small types add checks and meaning, and stop mix-ups.
```

:::keypoints
- Learn the names: god class, long method, switch on type, feature envy, primitive obsession, long parameter list, data clumps, shotgun surgery, message chain, refused bequest, global state.
- Each smell points to a rule (SRP, OCP, LSP, DIP, Demeter, DRY) and a simple fix.
- Refactor in small steps, only where it hurts, with tests running.
:::
