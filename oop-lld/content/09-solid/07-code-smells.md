---
title: Code smells and how to fix them
level: intermediate
time: 40
summary: A catalogue of the design smells interviewers expect you to name (god class, long method, switch on type, feature envy, primitive obsession, shotgun surgery and more), each with a small example, the principle it breaks, and the refactoring that cures it.
---

A **code smell** is a surface sign that a deeper design problem may exist. Naming a smell and its cure is a strong signal in a design interview ("I would refactor this because...").

## The catalogue

| Smell | What you see | Principle broken | Cure |
|---|---|---|---|
| **God class** | one class with dozens of methods and unrelated fields | SRP | split by responsibility |
| **Long method** | 60+ lines, many comments marking "sections" | SRP | extract methods |
| **Switch on type** | `switch (type)` repeated in many places | OCP | polymorphism / strategy |
| **Feature envy** | a method uses another object's data more than its own | cohesion | move the method |
| **Primitive obsession** | `string` for emails, `int` for money, `double` for coordinates | encapsulation | small value types |
| **Long parameter list** | 6+ parameters | cohesion | parameter object, builder |
| **Data clumps** | the same 3 fields travel together everywhere | cohesion | extract a class |
| **Shotgun surgery** | one change edits many classes | cohesion | move together what changes together |
| **Divergent change** | one class edited for many unrelated reasons | SRP | split |
| **Inappropriate intimacy** | classes dig into each other's private details | coupling, Demeter | hide, extract interface |
| **Message chains** | `a.getB().getC().getD()` | Demeter | delegate: `a.doIt()` |
| **Duplicated code** | copy-paste blocks | DRY | extract function / class |
| **Speculative generality** | interfaces and hooks nobody uses | YAGNI | delete them |
| **Refused bequest** | subclass ignores or throws on inherited methods | LSP | composition / restructure |
| **Global/static mutable state** | Singletons and `static` variables touched everywhere | coupling, testability | inject dependencies |
| **Magic numbers/strings** | `if (status == 3)` | readability | `enum class`, named constants |

## Example 1: primitive obsession and data clumps

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

## Example 2: feature envy and a message chain

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

## Example 3: long parameter list

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

## A diagnosis drill

For each snippet, name the smell and the cure.

:::exercise Name the smell
1. `if (user.getAccount().getWallet().getBalance() > price) { ... }`
2. A class `Util` with `parseDate`, `sendEmail`, `calcTax`, `hashPassword`.
3. Eight functions all start with `switch (shape.kind)`.
4. A `Square` class whose `setHeight` throws "not supported".
5. Every time the tax law changes, you edit `Invoice`, `Cart`, `Quote`, `Report` and `Refund`.
:::

:::solution Answers
1. **Message chain** (Law of Demeter): add `user.canAfford(price)`.
2. **God/utility class** with low cohesion (SRP): split into parser, mailer, tax and security services.
3. **Switch on type** (OCP): give `Shape` virtual methods (or use `variant`/visitor).
4. **Refused bequest** (LSP): do not inherit; restructure with a shared interface or siblings.
5. **Shotgun surgery**: extract a single `TaxPolicy` that all five use.
:::

:::interview How do you decide when to refactor?
"I refactor when a smell is costing me: when a new requirement touches many places (shotgun surgery), when tests are hard to write (hidden dependencies), or when I keep misunderstanding a class (god class, long method). I do it in small steps with tests passing between each, and I name the smell and the target design so the team understands the change."
:::

```quiz
? A method uses getters of another class ten times and little of its own data. What is the smell?
- Long method
+ Feature envy (the method belongs in the other class)
- Singleton
> Move the behaviour to where the data lives.
? Which cure fits "switch on type repeated in many functions"?
- Extract method
+ Polymorphism: one subclass or strategy per case
- A global variable
> This is an OCP violation; polymorphism puts each case in its own class.
? What does primitive obsession mean?
- Using too many pointers
+ Using raw strings/ints for domain concepts (emails, money) instead of small types
- Using primitive containers
> Value types carry validation and meaning, and prevent argument mix-ups.
```

:::keypoints
- Learn the vocabulary: god class, long method, switch on type, feature envy, primitive obsession, long parameter list, data clumps, shotgun surgery, message chains, refused bequest, global state.
- Each smell points to a principle (SRP, OCP, LSP, DIP, Demeter, DRY) and a standard refactoring.
- Refactor in small steps, driven by real pain, and always protected by tests.
:::
