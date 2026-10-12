---
title: The SOLID Principles
level: intermediate
time: 60
summary: The five principles behind maintainable object-oriented design — Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation and Dependency Inversion — each with the smell it fixes, a before/after refactoring in C++ and JavaScript, and how interviewers probe them.
---

SOLID is five design principles, collected by Robert C. Martin, for writing classes that are easy to change. In LLD interviews they're the vocabulary for **why** your design is good: "pricing is behind an interface, so adding a weekend rate doesn't modify `ParkingLot` (Open/Closed)". This lesson takes each principle, shows the **smell** it addresses, and refactors code to follow it.

| Letter | Principle | One-line version |
|---|---|---|
| **S** | Single Responsibility | a class should have one reason to change |
| **O** | Open/Closed | open for extension, closed for modification |
| **L** | Liskov Substitution | subtypes must be usable wherever their base type is |
| **I** | Interface Segregation | many small, specific interfaces beat one fat one |
| **D** | Dependency Inversion | depend on abstractions, not on concrete classes |

## S — Single Responsibility Principle

:::def Single Responsibility Principle (SRP)
A class should have **one reason to change**: it should serve one actor or one concern. If a change in tax rules, in the email template and in the database schema would all edit the same class, it has three responsibilities.
:::

**Smell:** an `InvoiceService` that calculates totals, formats a PDF, emails it and saves it to the database. Every unrelated change touches it, and none of it can be tested in isolation.

```text
class InvoiceService {             // ✗ four reasons to change
  total()        { …tax rules… }
  renderPdf()    { …layout… }
  email()        { …SMTP… }
  save()         { …SQL… }
}
```

**Refactor:** one class per concern, composed by a small coordinator.

:::tabs SRP: split by reason to change
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct LineItem { string name; long pricePaise; int qty; };
struct Invoice { string number; vector<LineItem> items; };

class InvoiceCalculator {                         // changes when tax/pricing rules change
public:
    long subtotal(const Invoice& inv) const {
        long s = 0;
        for (auto& i : inv.items) s += i.pricePaise * i.qty;
        return s;
    }
    long gst(const Invoice& inv) const { return subtotal(inv) * 18 / 100; }
    long total(const Invoice& inv) const { return subtotal(inv) + gst(inv); }
};

class InvoiceFormatter {                          // changes when the layout changes
public:
    string render(const Invoice& inv, const InvoiceCalculator& calc) const {
        ostringstream out;
        out << "INVOICE " << inv.number << "\n";
        for (auto& i : inv.items) out << "  " << left << setw(14) << i.name << right << setw(3) << i.qty << " x " << i.pricePaise / 100 << "\n";
        out << "  GST 18%: " << calc.gst(inv) / 100 << "\n  TOTAL:   " << calc.total(inv) / 100 << "\n";
        return out.str();
    }
};

class InvoiceMailer {                             // changes when delivery changes (SMTP, provider)
public:
    void send(const string& to, const string& body) const { cout << "[mail to " << to << "]\n" << body; }
};

class InvoiceService {                            // thin coordinator: orchestrates, holds no rules
    InvoiceCalculator calc_; InvoiceFormatter fmt_; InvoiceMailer mailer_;
public:
    void issue(const Invoice& inv, const string& email) const { mailer_.send(email, fmt_.render(inv, calc_)); }
};

int main() {
    Invoice inv{"INV-2026-0042", {{"Keyboard", 249900, 1}, {"Mouse pad", 39900, 2}}};
    InvoiceService().issue(inv, "accounts@acme.in");
}
```
```js run
class InvoiceCalculator {                         // changes when tax/pricing rules change
  subtotal(inv) { return inv.items.reduce((s, i) => s + i.pricePaise * i.qty, 0); }
  gst(inv) { return Math.floor((this.subtotal(inv) * 18) / 100); }
  total(inv) { return this.subtotal(inv) + this.gst(inv); }
}

class InvoiceFormatter {                          // changes when the layout changes
  render(inv, calc) {
    const lines = inv.items.map((i) => `  ${i.name.padEnd(14)}${String(i.qty).padStart(3)} x ${i.pricePaise / 100}`);
    return [`INVOICE ${inv.number}`, ...lines, `  GST 18%: ${calc.gst(inv) / 100}`, `  TOTAL:   ${calc.total(inv) / 100}`].join("\n");
  }
}

class InvoiceMailer {                             // changes when delivery changes (SMTP, provider)
  send(to, body) { console.log(`[mail to ${to}]\n${body}`); }
}

class InvoiceService {                            // thin coordinator: orchestrates, holds no rules
  #calc = new InvoiceCalculator(); #fmt = new InvoiceFormatter(); #mailer = new InvoiceMailer();
  issue(inv, email) { this.#mailer.send(email, this.#fmt.render(inv, this.#calc)); }
}

new InvoiceService().issue({ number: "INV-2026-0042", items: [{ name: "Keyboard", pricePaise: 249900, qty: 1 }, { name: "Mouse pad", pricePaise: 39900, qty: 2 }] }, "accounts@acme.in");
```
:::

:::warn SRP doesn't mean "one method per class"
A class with one responsibility can have many methods. Splitting everything into tiny classes is its own smell (shotgun surgery: one change touches ten files). Group by **reason to change**.
:::

## O — Open/Closed Principle

:::def Open/Closed Principle (OCP)
Software entities should be **open for extension** but **closed for modification**: you add new behaviour by adding new code (a new class), not by editing working code.
:::

**Smell:** a `switch`/`if-else` on a type code that grows with every new case, spread across the codebase.

```text
long fee(VehicleType t, int hours) {          // ✗ every new vehicle type edits this function
  switch (t) { case BIKE: return 20 * hours; case CAR: return 50 * hours; case TRUCK: return 100 * hours; }
}
```

**Refactor:** put the varying behaviour behind an interface; each case becomes a class. Adding an electric-vehicle rate means adding a class, and `ParkingLot` is untouched.

:::tabs OCP: extend by adding classes
```cpp run
#include <bits/stdc++.h>
using namespace std;

class PricingRule {                                    // the extension point
public:
    virtual ~PricingRule() = default;
    virtual long fee(int hours) const = 0;
    virtual string name() const = 0;
};

class HourlyRate : public PricingRule {
    string name_; long perHour_;
public:
    HourlyRate(string n, long perHour) : name_(std::move(n)), perHour_(perHour) {}
    long fee(int hours) const override { return perHour_ * hours; }
    string name() const override { return name_; }
};

// Added later — no existing class was modified:
class FirstHourFree : public PricingRule {
    unique_ptr<PricingRule> inner_;
public:
    explicit FirstHourFree(unique_ptr<PricingRule> inner) : inner_(std::move(inner)) {}
    long fee(int hours) const override { return inner_->fee(max(0, hours - 1)); }
    string name() const override { return inner_->name() + " (first hour free)"; }
};

class ParkingLot {                                     // closed for modification
public:
    long checkout(const PricingRule& rule, int hours) const { return rule.fee(hours); }
};

int main() {
    vector<unique_ptr<PricingRule>> rules;
    rules.push_back(make_unique<HourlyRate>("bike", 20));
    rules.push_back(make_unique<HourlyRate>("car", 50));
    rules.push_back(make_unique<HourlyRate>("truck", 100));
    rules.push_back(make_unique<FirstHourFree>(make_unique<HourlyRate>("EV", 40)));
    ParkingLot lot;
    for (auto& r : rules) cout << left << setw(26) << r->name() << " 3h = Rs " << lot.checkout(*r, 3) << "\n";
}
```
```js run
// The extension point: any object with fee(hours) and name
class HourlyRate {
  constructor(name, perHour) { Object.assign(this, { name, perHour }); }
  fee(hours) { return this.perHour * hours; }
}

// Added later — no existing class was modified:
class FirstHourFree {
  constructor(inner) { this.inner = inner; this.name = `${inner.name} (first hour free)`; }
  fee(hours) { return this.inner.fee(Math.max(0, hours - 1)); }
}

class ParkingLot {                                     // closed for modification
  checkout(rule, hours) { return rule.fee(hours); }
}

const lot = new ParkingLot();
const rules = [new HourlyRate("bike", 20), new HourlyRate("car", 50), new HourlyRate("truck", 100), new FirstHourFree(new HourlyRate("EV", 40))];
for (const r of rules) console.log(`${r.name.padEnd(26)} 3h = Rs ${lot.checkout(r, 3)}`);
```
:::

OCP is the principle behind most design patterns: **Strategy**, **Decorator** (the `FirstHourFree` wrapper above is one), **Observer**, **Factory**. In interviews, identify the **variation points** in the requirements and close the rest of the design against them. Don't add extension points nobody asked for (that's speculative generality, see YAGNI next lesson).

## L — Liskov Substitution Principle

:::def Liskov Substitution Principle (LSP)
If S is a subtype of T, objects of type T may be replaced with objects of type S **without breaking the program**. A subclass must honour the base class's **contract**: accept at least the same inputs, give at least the same guarantees, and not throw surprises.
:::

**The classic violation:** `Square extends Rectangle`. Mathematically a square is a rectangle, but a `Rectangle` promises that `setWidth` doesn't change the height. A square must change both, so code written for rectangles breaks:

:::tabs LSP: a subtype that breaks its parent's contract
```js run
class Rectangle {
  constructor(w, h) { this.w = w; this.h = h; }
  setWidth(w) { this.w = w; }
  setHeight(h) { this.h = h; }
  area() { return this.w * this.h; }
}
class Square extends Rectangle {                  // ✗ "is-a" in maths, not in behaviour
  setWidth(w) { this.w = this.h = w; }
  setHeight(h) { this.w = this.h = h; }
}

// Code written against Rectangle's contract
function stretch(rect) {
  rect.setWidth(5);
  rect.setHeight(4);
  return rect.area();                            // a Rectangle guarantees 20
}
console.log("Rectangle:", stretch(new Rectangle(1, 1)));
console.log("Square:   ", stretch(new Square(1, 1)), "← substitution broke the caller");

// ✓ Fix: don't inherit; share only what's truly common (an immutable Shape with area())
class Rect { constructor(w, h) { this.w = w; this.h = h; } area() { return this.w * this.h; } }
class Sq { constructor(s) { this.s = s; } area() { return this.s ** 2; } }
console.log("areas:", [new Rect(5, 4), new Sq(4)].map((s) => s.area()));
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Rectangle {
public:
    Rectangle(int w, int h) : w_(w), h_(h) {}
    virtual ~Rectangle() = default;
    virtual void setWidth(int w) { w_ = w; }
    virtual void setHeight(int h) { h_ = h; }
    int area() const { return w_ * h_; }
protected:
    int w_, h_;
};
class Square : public Rectangle {                // ✗ "is-a" in maths, not in behaviour
public:
    explicit Square(int s) : Rectangle(s, s) {}
    void setWidth(int w) override { w_ = h_ = w; }
    void setHeight(int h) override { w_ = h_ = h; }
};

int stretch(Rectangle& r) {                      // written against Rectangle's contract
    r.setWidth(5);
    r.setHeight(4);
    return r.area();                             // a Rectangle guarantees 20
}

// ✓ Fix: no inheritance between them; both implement an immutable Shape
struct Shape { virtual ~Shape() = default; virtual int area() const = 0; };
struct Rect : Shape { int w, h; Rect(int w, int h) : w(w), h(h) {} int area() const override { return w * h; } };
struct Sq : Shape { int s; explicit Sq(int s) : s(s) {} int area() const override { return s * s; } };

int main() {
    Rectangle r(1, 1);
    Square s(1);
    cout << "Rectangle: " << stretch(r) << "\n";
    cout << "Square:    " << stretch(s) << "  <- substitution broke the caller\n";
    vector<unique_ptr<Shape>> shapes;
    shapes.push_back(make_unique<Rect>(5, 4));
    shapes.push_back(make_unique<Sq>(4));
    cout << "areas:";
    for (auto& sh : shapes) cout << " " << sh->area();
    cout << "\n";
}
```
:::

LSP violations to watch for in LLD answers:

- A subclass method that **throws "not supported"** (`Penguin.fly()`, `ReadOnlyList.add()`): the hierarchy is wrong. Split the interface (`FlyingBird`) or use composition.
- A subclass that **requires more** (stricter preconditions) or **promises less** (weaker postconditions) than its parent.
- `instanceof` / `dynamic_cast` checks in calling code to special-case a subtype: a sign the abstraction doesn't fit.

## I — Interface Segregation Principle

:::def Interface Segregation Principle (ISP)
Clients should not be forced to depend on methods they don't use. Prefer several **small, role-specific interfaces** over one large "fat" interface.
:::

**Smell:** a `Machine` interface with `print()`, `scan()`, `fax()` and `staple()`. A basic printer must implement `fax()` by throwing (an LSP violation too), and every client depends on everything.

:::tabs ISP: small interfaces, combined as needed
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Printer { virtual ~Printer() = default; virtual void print(const string& doc) = 0; };
struct Scanner { virtual ~Scanner() = default; virtual string scan() = 0; };
struct Fax { virtual ~Fax() = default; virtual void fax(const string& doc, const string& to) = 0; };

class BasicPrinter : public Printer {             // implements only what it can do
public:
    void print(const string& doc) override { cout << "BasicPrinter prints: " << doc << "\n"; }
};

class OfficeMachine : public Printer, public Scanner, public Fax {
public:
    void print(const string& doc) override { cout << "OfficeMachine prints: " << doc << "\n"; }
    string scan() override { return "scanned-page.png"; }
    void fax(const string& doc, const string& to) override { cout << "faxing " << doc << " to " << to << "\n"; }
};

// Each client asks only for the role it needs
void printReport(Printer& p) { p.print("Q3 report"); }
void archive(Scanner& s) { cout << "archived " << s.scan() << "\n"; }

int main() {
    BasicPrinter basic;
    OfficeMachine office;
    printReport(basic);
    printReport(office);
    archive(office);
    // archive(basic);   // compile error: a BasicPrinter isn't a Scanner — exactly right
}
```
```js run
// In JavaScript, "interfaces" are capabilities: small sets of methods checked by duck typing.
const canPrint = (o) => typeof o.print === "function";
const canScan = (o) => typeof o.scan === "function";

class BasicPrinter { print(doc) { console.log(`BasicPrinter prints: ${doc}`); } }
class OfficeMachine {
  print(doc) { console.log(`OfficeMachine prints: ${doc}`); }
  scan() { return "scanned-page.png"; }
  fax(doc, to) { console.log(`faxing ${doc} to ${to}`); }
}

function printReport(printer) { printer.print("Q3 report"); }       // needs only print()
function archive(scanner) {                                          // needs only scan()
  if (!canScan(scanner)) throw new TypeError(`${scanner.constructor.name} can't scan`);
  console.log(`archived ${scanner.scan()}`);
}

const basic = new BasicPrinter(), office = new OfficeMachine();
printReport(basic);
printReport(office);
archive(office);
try { archive(basic); } catch (e) { console.log("error:", e.message); }
console.log("capabilities:", { basic: [canPrint(basic), canScan(basic)], office: [canPrint(office), canScan(office)] });
```
:::

## D — Dependency Inversion Principle

:::def Dependency Inversion Principle (DIP)
High-level modules (business logic) should not depend on low-level modules (databases, email providers, HTTP clients). **Both should depend on abstractions**, and the abstraction is owned by the high-level side.
:::

**Smell:** `OrderService` constructs `new MySqlOrderRepository()` and `new SmtpMailer()` inside itself. It can't be tested without a database and a mail server, and switching providers means editing business logic.

**Refactor:** `OrderService` depends on `OrderRepository` and `Notifier` interfaces, and receives implementations from outside (**dependency injection**, covered in depth in the last lesson of this module). Tests pass in fakes.

:::tabs DIP: business logic depends on interfaces
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Order { string id; long amount; };

// Abstractions owned by the business layer
struct OrderRepository { virtual ~OrderRepository() = default; virtual void save(const Order&) = 0; virtual size_t count() const = 0; };
struct Notifier { virtual ~Notifier() = default; virtual void notify(const string& msg) = 0; };

class OrderService {                                 // high-level policy: knows nothing about SQL or SMTP
    OrderRepository& repo_;
    Notifier& notifier_;
public:
    OrderService(OrderRepository& r, Notifier& n) : repo_(r), notifier_(n) {}
    void place(const Order& o) {
        if (o.amount <= 0) throw invalid_argument("amount must be positive");
        repo_.save(o);
        notifier_.notify("order " + o.id + " placed");
    }
};

// Low-level details implement the abstractions
class InMemoryOrderRepository : public OrderRepository {
    vector<Order> rows_;
public:
    void save(const Order& o) override { rows_.push_back(o); }
    size_t count() const override { return rows_.size(); }
};
class ConsoleNotifier : public Notifier {
public:
    void notify(const string& msg) override { cout << "notify: " << msg << "\n"; }
};
class RecordingNotifier : public Notifier {           // a test double
public:
    vector<string> sent;
    void notify(const string& msg) override { sent.push_back(msg); }
};

int main() {
    InMemoryOrderRepository repo;
    ConsoleNotifier console;
    OrderService prod(repo, console);                // "production" wiring
    prod.place({"o-1", 1299});

    RecordingNotifier spy;                           // test wiring: no console, no mail server
    OrderService underTest(repo, spy);
    underTest.place({"o-2", 450});
    cout << "test: orders saved = " << repo.count() << ", notifications captured = " << spy.sent.size()
         << " ('" << spy.sent[0] << "')\n";
}
```
```js run
// Abstractions (contracts): repository.save(order), repository.count(), notifier.notify(msg)
class OrderService {                                 // high-level policy: knows nothing about SQL or SMTP
  constructor(repository, notifier) { this.repository = repository; this.notifier = notifier; }
  place(order) {
    if (order.amount <= 0) throw new RangeError("amount must be positive");
    this.repository.save(order);
    this.notifier.notify(`order ${order.id} placed`);
  }
}

// Low-level details implement the contracts
class InMemoryOrderRepository { #rows = []; save(o) { this.#rows.push(o); } count() { return this.#rows.length; } }
class ConsoleNotifier { notify(msg) { console.log(`notify: ${msg}`); } }
class RecordingNotifier { sent = []; notify(msg) { this.sent.push(msg); } }   // a test double

const repo = new InMemoryOrderRepository();
new OrderService(repo, new ConsoleNotifier()).place({ id: "o-1", amount: 1299 });   // "production" wiring

const spy = new RecordingNotifier();                                               // test wiring
new OrderService(repo, spy).place({ id: "o-2", amount: 450 });
console.log(`test: orders saved = ${repo.count()}, notifications captured = ${spy.sent.length} ('${spy.sent[0]}')`);
```
:::

## SOLID in an LLD interview

You rarely recite the principles; you **apply** them and name them when explaining:

- *"`ParkingLot` only coordinates; fee calculation is in `PricingStrategy`, ticket printing in `TicketPrinter`"* → **SRP**.
- *"New vehicle types or rates are new classes; nothing existing changes"* → **OCP**.
- *"`ElectricCar` can go anywhere a `Car` can; charging is a separate `Chargeable` capability, not an override that throws"* → **LSP + ISP**.
- *"The lot depends on a `PaymentGateway` interface, injected in the constructor"* → **DIP**.

:::warn Don't over-apply them
Ten interfaces for a 100-line program is a red flag too. Apply the principles at the **variation points** the requirements reveal, and keep the rest simple.
:::

```quiz
? A `ReportService` computes figures, renders HTML and uploads files to S3. Which principle does it violate most directly?
+ Single Responsibility: it has three different reasons to change
- Liskov Substitution
- Interface Segregation
> Calculation rules, presentation and storage change for different reasons and should be separate.

? Adding a new payment method requires editing a large `if/else` in `CheckoutService`. Which principle is violated, and what's the usual fix?
- LSP; use inheritance more
+ OCP; put payment methods behind an interface (one class per method) so checkout doesn't change
- DIP; use a static factory
> New behaviour should arrive as new code, not edits to working code.

? `class Ostrich extends Bird { fly() { throw new Error("can't fly"); } }` breaks which principle?
- Single Responsibility
+ Liskov Substitution: code that calls fly() on any Bird breaks when given an Ostrich
- Open/Closed
> The subclass doesn't honour the base contract. Split the capability (FlyingBird) instead.

? `OrderService` creates `new PostgresOrderRepository()` in its constructor. What does DIP suggest?
+ Depend on an OrderRepository interface and receive the implementation from outside (dependency injection)
- Make PostgresOrderRepository a subclass of OrderService
- Use a global variable for the repository
> Business logic should depend on abstractions it owns; concrete infrastructure is plugged in.
```

:::keypoints
- **SRP**: one reason to change per class; group by concern, not by method count.
- **OCP**: add behaviour by adding classes behind an interface (Strategy, Decorator…), not by growing switches.
- **LSP**: subtypes must honour the base contract; "not supported" overrides and type checks are warning signs.
- **ISP**: small role interfaces; clients depend only on what they use.
- **DIP**: business logic depends on abstractions; infrastructure is injected, which also makes testing easy.
- Apply them at the **variation points** of the requirements, and name them when explaining your design.
:::
