---
title: Object-Oriented Programming in C++ and JavaScript
level: easy
time: 50
summary: The four pillars — encapsulation, abstraction, inheritance and polymorphism — shown side by side in C++ and JavaScript, plus composition, constructors and invariants, virtual destructors and override, const-correctness, JavaScript's prototypes and private fields, and the language traps that cost marks in LLD rounds.
---

Every LLD answer is built from objects. This lesson makes sure the fundamentals are solid in **both** languages, because interviewers notice immediately when a class leaks its data, an override silently doesn't override, or inheritance is used where composition belongs.

:::def Object and class
A **class** is a blueprint: the data an object holds (**state**, fields) and the operations it supports (**behaviour**, methods). An **object** is an instance of a class with its own state. Good objects keep their state valid at all times and expose behaviour, not raw data.
:::

## Pillar 1: Encapsulation

:::def Encapsulation
Bundling data with the methods that operate on it, and **hiding** the data so it can only change through those methods. The class guarantees its **invariants** (rules that must always hold, like "balance never negative").
:::

Compare a "bag of data" with a real object:

:::tabs Encapsulation: the class protects its invariants
```cpp run
#include <bits/stdc++.h>
using namespace std;

// ✗ A bag of public data: anyone can break the rules
struct LeakyAccount { string owner; long balance; };

// ✓ An encapsulated account: state is private, changes go through validated methods
class BankAccount {
    string owner_;
    long balance_ = 0;                 // invariant: never negative
    vector<string> history_;
public:
    explicit BankAccount(string owner) : owner_(std::move(owner)) {}

    void deposit(long amount) {
        if (amount <= 0) throw invalid_argument("deposit must be positive");
        balance_ += amount;
        history_.push_back("+" + to_string(amount));
    }
    void withdraw(long amount) {
        if (amount <= 0) throw invalid_argument("withdrawal must be positive");
        if (amount > balance_) throw runtime_error("insufficient funds");
        balance_ -= amount;
        history_.push_back("-" + to_string(amount));
    }
    long balance() const { return balance_; }                      // read-only access
    const vector<string>& history() const { return history_; }     // const reference: can't be modified
};

int main() {
    LeakyAccount leaky{"asha", 100};
    leaky.balance = -5000;             // compiles happily: the invariant is broken
    cout << "leaky balance: " << leaky.balance << "\n";

    BankAccount acc("asha");
    acc.deposit(500);
    acc.withdraw(200);
    try { acc.withdraw(10'000); } catch (const exception& e) { cout << "rejected: " << e.what() << "\n"; }
    cout << "balance: " << acc.balance() << ", history:";
    for (auto& h : acc.history()) cout << " " << h;
    cout << "\n";
    // acc.balance_ = -5000;           // compile error: 'balance_' is private
}
```
```js run
// ✗ A bag of public data: anyone can break the rules
const leaky = { owner: "asha", balance: 100 };
leaky.balance = -5000;
console.log("leaky balance:", leaky.balance);

// ✓ An encapsulated account: #private state, changes go through validated methods
class BankAccount {
  #owner;
  #balance = 0;                          // invariant: never negative
  #history = [];
  constructor(owner) { this.#owner = owner; }

  deposit(amount) {
    if (amount <= 0) throw new RangeError("deposit must be positive");
    this.#balance += amount;
    this.#history.push(`+${amount}`);
  }
  withdraw(amount) {
    if (amount <= 0) throw new RangeError("withdrawal must be positive");
    if (amount > this.#balance) throw new Error("insufficient funds");
    this.#balance -= amount;
    this.#history.push(`-${amount}`);
  }
  get balance() { return this.#balance; }           // read-only property (no setter)
  get history() { return [...this.#history]; }      // return a copy so callers can't mutate ours
}

const acc = new BankAccount("asha");
acc.deposit(500);
acc.withdraw(200);
try { acc.withdraw(10_000); } catch (e) { console.log("rejected:", e.message); }
try { acc.balance = -5000; } catch (e) { console.log("can't assign balance:", e.name); }   // no setter: a TypeError in strict mode
console.log("balance:", acc.balance, "history:", acc.history.join(" "));
// acc.#balance = -5000;                 // SyntaxError: private field
```
:::

Rules of thumb: fields **private** by default; expose **behaviour** (`withdraw`) rather than setters (`setBalance`); return **copies or read-only views** of internal collections; validate in the constructor so no object ever exists in an invalid state.

:::note "Tell, don't ask"
Instead of asking an object for its data and making decisions outside (`if (acc.getBalance() >= x) acc.setBalance(acc.getBalance() - x)`), **tell** the object what to do (`acc.withdraw(x)`) and let it enforce its own rules.
:::

## Pillar 2: Abstraction

:::def Abstraction
Exposing **what** an object does through a simple interface while hiding **how** it does it. Callers depend on the interface, not the implementation details.
:::

`cart.total(discount)` is an abstraction: the caller doesn't know about maps, loops, or discount maths. In LLD, abstraction mostly shows up as **interfaces** (C++ abstract classes, JS method contracts) that let you swap implementations: a `PaymentGateway` interface with Razorpay and Stripe implementations, a `NotificationChannel` with email and SMS.

## Pillar 3: Inheritance

:::def Inheritance
A class (the **subclass**) is defined as a specialisation of another (the **base class**), inheriting its fields and methods and adding or overriding behaviour. It models an **is-a** relationship: a `Truck` is a `Vehicle`.
:::

## Pillar 4: Polymorphism

:::def Polymorphism
"Many forms": code written against a base type works with any subtype, and the **right method runs for the actual object** at run time (dynamic dispatch).
:::

Inheritance and polymorphism together, with notification channels:

:::tabs Inheritance + polymorphism: one loop, many behaviours
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Notifier {                                     // abstract base class (an interface + shared code)
public:
    explicit Notifier(string recipient) : recipient_(std::move(recipient)) {}
    virtual ~Notifier() = default;                   // ALWAYS virtual when deleting through a base pointer
    void notify(const string& msg) const {           // shared behaviour (template)
        cout << "[" << channel() << "] to " << recipient_ << ": " << format(msg) << "\n";
    }
protected:
    virtual string channel() const = 0;              // pure virtual: subclasses must implement
    virtual string format(const string& msg) const { return msg; }   // default, may be overridden
    string recipient_;
};

class EmailNotifier : public Notifier {
public:
    using Notifier::Notifier;                        // inherit the constructor
protected:
    string channel() const override { return "email"; }
    string format(const string& msg) const override { return "Subject: Update\n          " + msg; }
};

class SmsNotifier : public Notifier {
public:
    using Notifier::Notifier;
protected:
    string channel() const override { return "sms"; }
    string format(const string& msg) const override { return msg.size() > 20 ? msg.substr(0, 17) + "..." : msg; }
};

class PushNotifier : public Notifier {
public:
    using Notifier::Notifier;
protected:
    string channel() const override { return "push"; }    // keeps the default format
};

int main() {
    vector<unique_ptr<Notifier>> channels;
    channels.push_back(make_unique<EmailNotifier>("asha@example.com"));
    channels.push_back(make_unique<SmsNotifier>("+91-98450-00000"));
    channels.push_back(make_unique<PushNotifier>("device-7f2a"));
    for (const auto& n : channels) n->notify("Your order #501 has shipped!");   // dynamic dispatch
}
```
```js run
class Notifier {
  constructor(recipient) {
    if (new.target === Notifier) throw new TypeError("Notifier is abstract");
    this.recipient = recipient;
  }
  notify(msg) { console.log(`[${this.channel()}] to ${this.recipient}: ${this.format(msg)}`); }   // shared behaviour
  channel() { throw new Error(`${this.constructor.name} must implement channel()`); }          // "abstract"
  format(msg) { return msg; }                                                                    // default, may be overridden
}

class EmailNotifier extends Notifier {
  channel() { return "email"; }
  format(msg) { return `Subject: Update\n          ${msg}`; }
}
class SmsNotifier extends Notifier {
  channel() { return "sms"; }
  format(msg) { return msg.length > 20 ? msg.slice(0, 17) + "..." : msg; }
}
class PushNotifier extends Notifier {
  channel() { return "push"; }                       // keeps the default format
}

const channels = [new EmailNotifier("asha@example.com"), new SmsNotifier("+91-98450-00000"), new PushNotifier("device-7f2a")];
for (const n of channels) n.notify("Your order #501 has shipped!");   // the right method runs for each object

try { new Notifier("x"); } catch (e) { console.log("error:", e.message); }
```
:::

### C++ details that matter

- **`virtual`** enables dynamic dispatch. Without it, `base->method()` calls the base version even on a subclass object.
- **`override`** makes the compiler check that you really override something. A typo or a missing `const` otherwise silently creates a **new** method:

```cpp run expect-error title="override catches a signature mismatch"
#include <string>
struct Base { virtual std::string name() const { return "base"; } virtual ~Base() = default; };
struct Derived : Base {
    std::string name() override { return "derived"; }   // missing const: does NOT override Base::name
};
int main() {}
```

- A **virtual destructor** in any base class used polymorphically: deleting a `Derived` through a `Base*` without it is undefined behaviour (the derived part isn't destroyed).
- **Object slicing**: copying a `Derived` into a `Base` *value* chops off the derived part. Store polymorphic objects by pointer or reference (`unique_ptr<Base>`), not by value.
- **const-correctness**: mark methods that don't modify state `const`; take large arguments by `const&`.
- **Rule of zero**: hold resources in RAII members (`string`, `vector`, `unique_ptr`) so you never write copy constructors or destructors by hand.

### JavaScript details that matter

- `class` is syntax over **prototypes**: methods live on `Class.prototype`, shared by all instances; dispatch is always dynamic.
- **`#private` fields** are truly private (since ES2022); the `_underscore` convention is not.
- There are no interfaces or abstract classes in the language: use **duck typing** (any object with the right method works), a base class whose methods throw, `new.target` checks, or TypeScript interfaces.
- Beware **`this` binding**: passing `obj.method` as a callback loses `this`; use arrow functions or `.bind`.
- Use `Object.freeze` for constants/enums; use `static` for class-level members.

## Composition over inheritance

:::def Composition
Building an object out of other objects that it **has** (fields), and delegating work to them, instead of inheriting behaviour from a parent.
:::

Inheritance is the tightest coupling there is: subclasses depend on the base's internals, and deep hierarchies explode combinatorially. Imagine `Car`, `ElectricCar`, `SelfDrivingCar`, `ElectricSelfDrivingCar`… Composition handles each dimension separately:

:::tabs Composition: combine behaviours instead of multiplying subclasses
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Engine { virtual ~Engine() = default; virtual string start() const = 0; };
struct PetrolEngine : Engine { string start() const override { return "vroom (petrol)"; } };
struct ElectricMotor : Engine { string start() const override { return "hum (electric)"; } };

struct Driver { virtual ~Driver() = default; virtual string drive() const = 0; };
struct HumanDriver : Driver { string drive() const override { return "a human steers"; } };
struct Autopilot : Driver { string drive() const override { return "autopilot steers"; } };

class Car {                                        // a Car HAS an engine and a driver
    string name_;
    unique_ptr<Engine> engine_;
    unique_ptr<Driver> driver_;
public:
    Car(string name, unique_ptr<Engine> e, unique_ptr<Driver> d)
        : name_(std::move(name)), engine_(std::move(e)), driver_(std::move(d)) {}
    void go() const { cout << name_ << ": " << engine_->start() << ", " << driver_->drive() << "\n"; }
    void setDriver(unique_ptr<Driver> d) { driver_ = std::move(d); }   // behaviour can even change at run time
};

int main() {
    Car taxi("taxi", make_unique<PetrolEngine>(), make_unique<HumanDriver>());
    Car robotaxi("robotaxi", make_unique<ElectricMotor>(), make_unique<Autopilot>());
    taxi.go();
    robotaxi.go();
    robotaxi.setDriver(make_unique<HumanDriver>());   // safety driver takes over
    robotaxi.go();
}
```
```js run
// Each dimension is its own small object; a Car HAS one of each.
const petrol = { start: () => "vroom (petrol)" };
const electric = { start: () => "hum (electric)" };
const human = { drive: () => "a human steers" };
const autopilot = { drive: () => "autopilot steers" };

class Car {
  constructor(name, engine, driver) { Object.assign(this, { name, engine, driver }); }
  go() { console.log(`${this.name}: ${this.engine.start()}, ${this.driver.drive()}`); }
}

const taxi = new Car("taxi", petrol, human);
const robotaxi = new Car("robotaxi", electric, autopilot);
taxi.go();
robotaxi.go();
robotaxi.driver = human;              // behaviour can change at run time
robotaxi.go();
// 2 engines × 2 drivers = 4 combinations from 4 small objects, not 4 subclasses
```
:::

**When inheritance is right:** a genuine, stable **is-a** relationship where the subclass can be used anywhere the base is expected without surprises (that's the Liskov principle, in the SOLID lesson), usually shallow (one level), often implementing an interface. **Default to composition** otherwise.

```quiz
? A C++ base class `Shape` has `virtual double area() const;`. A subclass declares `double area();` (no const). What happens when calling `shapePtr->area()` on that subclass?
- The subclass method runs
+ The base method runs, because the subclass method has a different signature and doesn't override it (`override` would have caught this)
- It doesn't compile without override
> Missing `const` makes it a new, unrelated method. Always write `override`.

? Why must a polymorphic C++ base class have a virtual destructor?
+ Deleting a derived object through a base pointer otherwise skips the derived destructor (undefined behaviour, leaks)
- To make the class abstract
- It's only needed with multiple inheritance
> `virtual ~Base() = default;` makes delete through a base pointer destroy the full object.

? Which design best fits "vehicles can be petrol, diesel or electric, and manual or self-driving"?
- Six subclasses, one per combination
+ A Vehicle composed of an Engine and a Driver, each with its own implementations
- One class with a big if/else for every combination
> Composition handles independent dimensions without a combinatorial class explosion.

? In JavaScript, how do you make a field truly inaccessible from outside a class?
- Prefix it with an underscore
+ Declare it as a `#private` field
- Use Object.freeze on the instance
> `#field` is enforced by the language; `_field` is only a convention.
```

:::keypoints
- **Encapsulation**: private state, validated methods, invariants that always hold; "tell, don't ask".
- **Abstraction**: callers use interfaces, not implementation details.
- **Inheritance** models stable **is-a** relationships; **polymorphism** runs the right method for the actual object.
- C++: `virtual`, **`override`**, virtual destructors, no slicing (use pointers), const-correctness, rule of zero.
- JavaScript: classes over prototypes, **`#private`**, duck-typed interfaces, careful `this` binding.
- Prefer **composition over inheritance** for independent dimensions of variation.
:::
