---
title: Factory Patterns — Simple Factory, Factory Method, Abstract Factory
level: intermediate
time: 50
summary: Moving object creation out of business logic — the simple factory (with a registry so it stays open for extension), the Factory Method pattern (subclasses decide what to create), and the Abstract Factory (families of related objects that must match), each with C++ and JavaScript code and the LLD situations where they fit.
---

`new ConcreteClass()` scattered through business code ties that code to specific classes. When the class to create depends on input ("which payment method did the user choose?"), configuration ("SMS provider for this country?") or platform ("dark theme or light?"), creation logic spreads everywhere. **Factories** put it in one place. There are three related patterns, often confused, so this lesson separates them clearly.

| Pattern | In one sentence |
|---|---|
| **Simple factory** | one function/class that decides which concrete class to instantiate, based on a parameter |
| **Factory Method** (GoF) | a base class defines the workflow but leaves "create the product" to an overridable method, so subclasses choose the product |
| **Abstract Factory** (GoF) | an interface for creating **families** of related objects that must be used together |

## Simple factory

Not a GoF pattern, but the most common in practice: one place that maps a type key to a concrete class.

**Problem:** checkout code full of `if (method == "card") new CardPayment(...) else if (method == "upi") …`.

The naive factory is a `switch`, which violates Open/Closed (every new method edits it). The improvement is a **registry**: each implementation registers a creator function under its key, and the factory just looks it up. New payment methods register themselves without touching the factory.

:::tabs A registry-based factory
```cpp run
#include <bits/stdc++.h>
using namespace std;

class PaymentMethod {
public:
    virtual ~PaymentMethod() = default;
    virtual string pay(long paise) = 0;
};
class CardPayment : public PaymentMethod { public: string pay(long p) override { return "charged card Rs " + to_string(p / 100); } };
class UpiPayment : public PaymentMethod { public: string pay(long p) override { return "UPI collect request Rs " + to_string(p / 100); } };
class WalletPayment : public PaymentMethod { public: string pay(long p) override { return "debited wallet Rs " + to_string(p / 100); } };

class PaymentFactory {
    using Creator = function<unique_ptr<PaymentMethod>()>;
    unordered_map<string, Creator> registry_;
public:
    void registerMethod(const string& key, Creator c) { registry_[key] = std::move(c); }
    unique_ptr<PaymentMethod> create(const string& key) const {
        auto it = registry_.find(key);
        if (it == registry_.end()) throw invalid_argument("unsupported payment method: " + key);
        return it->second();
    }
};

int main() {
    PaymentFactory factory;                                    // wired once, at startup
    factory.registerMethod("card", [] { return make_unique<CardPayment>(); });
    factory.registerMethod("upi", [] { return make_unique<UpiPayment>(); });
    factory.registerMethod("wallet", [] { return make_unique<WalletPayment>(); });   // added later: no factory edit

    for (string choice : {"upi", "card", "wallet", "crypto"}) {
        try { cout << choice << ": " << factory.create(choice)->pay(129900) << "\n"; }
        catch (const exception& e) { cout << choice << ": error, " << e.what() << "\n"; }
    }
}
```
```js run
class CardPayment { pay(paise) { return `charged card Rs ${paise / 100}`; } }
class UpiPayment { pay(paise) { return `UPI collect request Rs ${paise / 100}`; } }
class WalletPayment { pay(paise) { return `debited wallet Rs ${paise / 100}`; } }

class PaymentFactory {
  #registry = new Map();
  register(key, creator) { this.#registry.set(key, creator); return this; }
  create(key) {
    const creator = this.#registry.get(key);
    if (!creator) throw new Error(`unsupported payment method: ${key}`);
    return creator();
  }
}

const factory = new PaymentFactory()                       // wired once, at startup
  .register("card", () => new CardPayment())
  .register("upi", () => new UpiPayment())
  .register("wallet", () => new WalletPayment());          // added later: no factory edit

for (const choice of ["upi", "card", "wallet", "crypto"]) {
  try { console.log(`${choice}: ${factory.create(choice).pay(129900)}`); }
  catch (e) { console.log(`${choice}: error, ${e.message}`); }
}
```
:::

## Factory Method

:::def Factory Method
Define an interface for creating an object, but let **subclasses decide which class to instantiate**. The base class contains the general algorithm and calls an abstract `create…()` method at the point where it needs the product.
:::

**Problem:** a logistics app plans deliveries. The planning workflow (create the transport, load it, compute a route, report) is the same for road and sea, but the **transport** differs (truck vs ship). The workflow shouldn't contain `if (road) new Truck() else new Ship()`.

```viz algo=uml title="Factory Method"
abstract class Logistics
  + planDelivery(cargo): string
  # createTransport(): Transport  «factory method»
class RoadLogistics
  # createTransport(): Transport
class SeaLogistics
  # createTransport(): Transport
interface Transport
  + deliver(cargo): string
class Truck
class Ship
RoadLogistics --|> Logistics
SeaLogistics --|> Logistics
Truck ..|> Transport
Ship ..|> Transport
Logistics ..> Transport : creates via factory method
```

:::tabs Factory Method
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Transport {
public:
    virtual ~Transport() = default;
    virtual string deliver(const string& cargo) const = 0;
    virtual int days(int km) const = 0;
};
class Truck : public Transport {
public:
    string deliver(const string& c) const override { return "truck drives " + c + " by road"; }
    int days(int km) const override { return (km + 599) / 600; }
};
class Ship : public Transport {
public:
    string deliver(const string& c) const override { return "ship carries " + c + " in a container"; }
    int days(int km) const override { return (km + 899) / 900 + 2; }   // + port handling
};

class Logistics {                                   // the creator
public:
    virtual ~Logistics() = default;
    string planDelivery(const string& cargo, int km) const {          // the shared workflow
        auto t = createTransport();                                    // ← the factory method
        return t->deliver(cargo) + ", " + to_string(km) + " km, ~" + to_string(t->days(km)) + " days";
    }
protected:
    virtual unique_ptr<Transport> createTransport() const = 0;
};
class RoadLogistics : public Logistics {
protected:
    unique_ptr<Transport> createTransport() const override { return make_unique<Truck>(); }
};
class SeaLogistics : public Logistics {
protected:
    unique_ptr<Transport> createTransport() const override { return make_unique<Ship>(); }
};

int main() {
    RoadLogistics road;
    SeaLogistics sea;
    cout << road.planDelivery("200 laptops", 1400) << "\n";
    cout << sea.planDelivery("20 t of tea", 5200) << "\n";
}
```
```js run
class Truck {
  deliver(cargo) { return `truck drives ${cargo} by road`; }
  days(km) { return Math.ceil(km / 600); }
}
class Ship {
  deliver(cargo) { return `ship carries ${cargo} in a container`; }
  days(km) { return Math.ceil(km / 900) + 2; }                     // + port handling
}

class Logistics {                                    // the creator
  planDelivery(cargo, km) {                          // the shared workflow
    const t = this.createTransport();                // ← the factory method
    return `${t.deliver(cargo)}, ${km} km, ~${t.days(km)} days`;
  }
  createTransport() { throw new Error("subclasses must implement createTransport()"); }
}
class RoadLogistics extends Logistics { createTransport() { return new Truck(); } }
class SeaLogistics extends Logistics { createTransport() { return new Ship(); } }

console.log(new RoadLogistics().planDelivery("200 laptops", 1400));
console.log(new SeaLogistics().planDelivery("20 t of tea", 5200));
```
:::

Factory Method is the creational cousin of **Template Method** (the Behavioral module): the base class owns the algorithm; a subclass fills in one step, which here is "what to create".

## Abstract Factory

:::def Abstract Factory
An interface for creating **families of related or dependent objects** without naming their concrete classes. Each concrete factory produces one consistent family, so products from different families are never mixed.
:::

**Problem:** a cross-platform UI toolkit needs buttons, checkboxes and dialogs. On macOS all three must be the Mac versions; on Windows, all three the Windows versions. A Windows checkbox inside a Mac dialog is a bug. The application code should create "a button" without knowing which platform it's on.

```viz algo=uml title="Abstract Factory: consistent product families"
interface UiFactory
  + createButton(): Button
  + createCheckbox(): Checkbox
class MacFactory
class WindowsFactory
interface Button
  + render(): string
interface Checkbox
  + render(): string
class MacButton
class WinButton
class MacCheckbox
class WinCheckbox
MacFactory ..|> UiFactory
WindowsFactory ..|> UiFactory
MacButton ..|> Button
WinButton ..|> Button
MacCheckbox ..|> Checkbox
WinCheckbox ..|> Checkbox
```

:::tabs Abstract Factory
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Button { virtual ~Button() = default; virtual string render() const = 0; };
struct Checkbox { virtual ~Checkbox() = default; virtual string render() const = 0; };

struct UiFactory {                                   // creates a whole family
    virtual ~UiFactory() = default;
    virtual unique_ptr<Button> createButton(const string& label) const = 0;
    virtual unique_ptr<Checkbox> createCheckbox(const string& label) const = 0;
};

struct MacButton : Button { string l; explicit MacButton(string s) : l(std::move(s)) {} string render() const override { return "( " + l + " )"; } };
struct MacCheckbox : Checkbox { string l; explicit MacCheckbox(string s) : l(std::move(s)) {} string render() const override { return "◉ " + l; } };
struct WinButton : Button { string l; explicit WinButton(string s) : l(std::move(s)) {} string render() const override { return "[ " + l + " ]"; } };
struct WinCheckbox : Checkbox { string l; explicit WinCheckbox(string s) : l(std::move(s)) {} string render() const override { return "[x] " + l; } };

struct MacFactory : UiFactory {
    unique_ptr<Button> createButton(const string& l) const override { return make_unique<MacButton>(l); }
    unique_ptr<Checkbox> createCheckbox(const string& l) const override { return make_unique<MacCheckbox>(l); }
};
struct WindowsFactory : UiFactory {
    unique_ptr<Button> createButton(const string& l) const override { return make_unique<WinButton>(l); }
    unique_ptr<Checkbox> createCheckbox(const string& l) const override { return make_unique<WinCheckbox>(l); }
};

string renderLoginForm(const UiFactory& ui) {        // application code: no platform-specific classes
    return ui.createCheckbox("Remember me")->render() + "   " + ui.createButton("Sign in")->render();
}

int main() {
    unique_ptr<UiFactory> factory;
    for (string os : {"macos", "windows"}) {
        if (os == "macos") factory = make_unique<MacFactory>();      // chosen ONCE, at startup
        else factory = make_unique<WindowsFactory>();
        cout << os << ": " << renderLoginForm(*factory) << "\n";
    }
}
```
```js run
const MacFactory = {                                  // one family
  createButton: (label) => ({ render: () => `( ${label} )` }),
  createCheckbox: (label) => ({ render: () => `◉ ${label}` }),
};
const WindowsFactory = {                              // another family, same interface
  createButton: (label) => ({ render: () => `[ ${label} ]` }),
  createCheckbox: (label) => ({ render: () => `[x] ${label}` }),
};

function renderLoginForm(ui) {                        // application code: no platform-specific classes
  return `${ui.createCheckbox("Remember me").render()}   ${ui.createButton("Sign in").render()}`;
}

const factories = { macos: MacFactory, windows: WindowsFactory };
for (const os of ["macos", "windows"]) {
  const ui = factories[os];                           // chosen ONCE, at startup
  console.log(`${os}: ${renderLoginForm(ui)}`);
}
```
:::

LLD examples where an abstract factory fits: **payment providers per country** (each provides a matching `PaymentClient` + `RefundClient` + `WebhookVerifier`), **database backends** (a `Connection` + `QueryBuilder` + `Migrator` per database), **game themes** (matching enemies, terrain and music per level).

## Choosing

| Situation | Use |
|---|---|
| Pick one class from a key at run time (user choice, config, message type) | **simple factory** with a registry |
| A base workflow where subclasses decide which product to create | **Factory Method** |
| Several related objects that must come from the same family | **Abstract Factory** |
| One object with many optional parts | **Builder** (next lesson) |
| Creating copies of a configured object | **Prototype** (next lesson) |

:::interview Where factories appear in LLD problems
*Parking lot*: a `VehicleFactory` or `SpotFactory` from a type. *Notification system*: `NotifierFactory.create(channel)`. *Chess*: creating pieces from a board layout. *Vending machine*: a `PaymentFactory`. Say why: "creation logic lives in one place; adding a vehicle type means registering a new class, without touching the parking logic."
:::

```quiz
? A `switch` over a type string inside a factory must be edited for every new type. How do you keep the factory closed for modification?
+ Use a registry: map keys to creator functions and let new types register themselves
- Add more cases to the switch
- Use a Singleton instead
> The registry turns "add a type" into "register a creator", leaving the factory unchanged.

? What distinguishes Abstract Factory from Factory Method?
+ Abstract Factory creates families of related objects that must match; Factory Method lets subclasses choose one product inside a base workflow
- Abstract Factory is always a Singleton
- They are the same pattern
> One is about consistent families (an object with several create methods), the other about deferring one creation step to subclasses.

? A UI must never mix macOS and Windows widgets. Which pattern guarantees consistency?
- Prototype
+ Abstract Factory
- Simple factory per widget
> Each concrete factory produces only its own family of widgets.
```

:::keypoints
- Factories move `new ConcreteClass()` out of business logic into one place.
- **Simple factory** + **registry** maps keys to creators; new types register without editing the factory (OCP).
- **Factory Method**: the base class owns the workflow and calls an overridable `create…()`; subclasses choose the product.
- **Abstract Factory**: one factory per **family** of related products, guaranteeing they match.
- Choose the factory when creation depends on input, configuration or platform, and say which variation point it isolates.
:::
