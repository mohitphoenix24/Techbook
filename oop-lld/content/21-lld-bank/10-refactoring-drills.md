---
title: "LLD interview: refactoring drills"
level: hard
time: 40
summary: Six hands-on refactorings with before and after code that give the same output (switch to polymorphism, constructor telescoping to builder, hard-coded dependency to injection, nested ifs to strategy, state flags to State, long method to small functions), and the smells interviewers ask you to spot.
---

A common interview variant: "here is some code, improve the design". Each drill shows the smell, the target design and runnable code proving the behaviour is unchanged.

:::qa Drill 1: replace a type-code `switch` with polymorphism {level=medium}
**Smell:** every new shape edits the `switch` (violates OCP).
```cpp run title="Before and after"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

// BEFORE
enum class Kind { Circle, Rect };
struct ShapeData { Kind kind; double a, b; };
double areaBefore(const ShapeData& s) {
    switch (s.kind) {
        case Kind::Circle: return 3.14 * s.a * s.a;
        case Kind::Rect: return s.a * s.b;
    }
    return 0;
}

// AFTER
struct Shape { virtual ~Shape() = default; virtual double area() const = 0; };
struct Circle : Shape { double r; explicit Circle(double r) : r(r) {} double area() const override { return 3.14 * r * r; } };
struct Rect : Shape { double w, h; Rect(double w, double h) : w(w), h(h) {} double area() const override { return w * h; } };
struct Triangle : Shape { double b, h; Triangle(double b, double h) : b(b), h(h) {} double area() const override { return 0.5 * b * h; } };   // added without touching old code

int main() {
    cout << "before: " << areaBefore({Kind::Circle, 2, 0}) << " " << areaBefore({Kind::Rect, 3, 4}) << "\n";
    vector<unique_ptr<Shape>> shapes;
    shapes.push_back(make_unique<Circle>(2)); shapes.push_back(make_unique<Rect>(3, 4)); shapes.push_back(make_unique<Triangle>(3, 4));
    cout << "after: "; for (auto& s : shapes) cout << s->area() << " "; cout << "\n";
}
```
**Result:** the same numbers for the old shapes, and `Triangle` was added by writing a new class only.
:::

:::qa Drill 2: replace a telescoping constructor with a builder {level=medium}
**Smell:** `Pizza(size, cheese, pepperoni, mushrooms, olives, ...)` with many booleans in a fixed order.
```cpp run title="Builder"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

class Pizza {
    string size_; vector<string> toppings_; bool extraCheese_;
    Pizza(string s, vector<string> t, bool c) : size_(move(s)), toppings_(move(t)), extraCheese_(c) {}
public:
    class Builder {
        string size_ = "medium"; vector<string> toppings_; bool cheese_ = false;
    public:
        Builder& size(string s) { size_ = move(s); return *this; }
        Builder& topping(string t) { toppings_.push_back(move(t)); return *this; }
        Builder& extraCheese() { cheese_ = true; return *this; }
        Pizza build() const {
            if (toppings_.size() > 5) throw invalid_argument("too many toppings");     // validation lives in one place
            return Pizza(size_, toppings_, cheese_);
        }
    };
    string describe() const {
        string s = size_ + " pizza"; for (auto& t : toppings_) s += " + " + t;
        return s + (extraCheese_ ? " + extra cheese" : "");
    }
};

int main() {
    Pizza p = Pizza::Builder().size("large").topping("olives").topping("corn").extraCheese().build();
    cout << p.describe() << "\n";
    cout << Pizza::Builder().build().describe() << "\n";
    try { Pizza::Builder b; for (int i = 0; i < 6; ++i) b.topping("t"); b.build(); } catch (const exception& e) { cout << "error: " << e.what() << "\n"; }
}
```
**Result:** named, order-free arguments, sensible defaults and validation before the object exists.
:::

:::qa Drill 3: replace a hard-coded dependency with injection {level=medium}
**Smell:** `OrderService` creates a `SmtpMailer` itself, so tests send real emails.
```cpp run title="Dependency injection"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct Mailer { virtual ~Mailer() = default; virtual void send(const string& to, const string& body) = 0; };
struct SmtpMailer : Mailer { void send(const string& to, const string& body) override { cout << "[smtp] to " << to << ": " << body << "\n"; } };
struct FakeMailer : Mailer { vector<string> sent; void send(const string& to, const string& body) override { sent.push_back(to + ":" + body); } };

class OrderService {
    Mailer& mailer_;                                    // injected, not created here
public:
    explicit OrderService(Mailer& m) : mailer_(m) {}
    void place(const string& user, int amount) { mailer_.send(user, "order confirmed for " + to_string(amount)); }
};

int main() {
    SmtpMailer real; OrderService prod(real); prod.place("asha", 500);
    FakeMailer fake; OrderService test(fake); test.place("ravi", 100);
    cout << "test captured " << fake.sent.size() << " message: " << fake.sent[0] << "\n";
}
```
**Result:** production uses SMTP; tests inject a fake and assert on what was sent.
:::

:::qa Drill 4: replace nested `if` rules with a Strategy {level=medium}
**Smell:** a pricing function with nested ifs for each customer type and season.
```cpp run title="Strategy replaces if-chains"
#include <functional>
#include <iostream>
#include <map>
#include <string>
using namespace std;

// BEFORE
double priceBefore(const string& type, double amount) {
    if (type == "student") return amount * 0.8;
    else if (type == "senior") return amount * 0.7;
    else return amount;
}

// AFTER: policies are data; new ones are added without editing the function
using Policy = function<double(double)>;
class Pricing {
    map<string, Policy> policies_;
public:
    void add(const string& type, Policy p) { policies_[type] = move(p); }
    double price(const string& type, double amount) const { auto it = policies_.find(type); return it == policies_.end() ? amount : it->second(amount); }
};

int main() {
    Pricing p;
    p.add("student", [](double a) { return a * 0.8; });
    p.add("senior", [](double a) { return a * 0.7; });
    p.add("festival", [](double a) { return a - 50; });          // new rule: no existing code touched
    for (string t : {"student", "senior", "festival", "regular"})
        cout << t << ": before=" << priceBefore(t, 1000) << " after=" << p.price(t, 1000) << "\n";
}
```
**Result:** student and senior match; `festival` exists only in the new design.
:::

:::qa Drill 5: replace state flags with the State pattern {level=hard}
**Smell:** booleans like `isPaid`, `isShipped`, `isCancelled` checked in every method; impossible combinations are possible.
```cpp run title="State instead of flags"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

class Order;
struct State {
    virtual ~State() = default;
    virtual const char* name() const = 0;
    virtual unique_ptr<State> pay() const { cout << "  cannot pay in state " << name() << "\n"; return nullptr; }
    virtual unique_ptr<State> ship() const { cout << "  cannot ship in state " << name() << "\n"; return nullptr; }
    virtual unique_ptr<State> cancel() const { cout << "  cannot cancel in state " << name() << "\n"; return nullptr; }
};
struct Shipped : State { const char* name() const override { return "Shipped"; } };
struct Cancelled : State { const char* name() const override { return "Cancelled"; } };
struct Paid : State {
    const char* name() const override { return "Paid"; }
    unique_ptr<State> ship() const override { return make_unique<Shipped>(); }
    unique_ptr<State> cancel() const override { return make_unique<Cancelled>(); }
};
struct Created : State {
    const char* name() const override { return "Created"; }
    unique_ptr<State> pay() const override { return make_unique<Paid>(); }
    unique_ptr<State> cancel() const override { return make_unique<Cancelled>(); }
};

class Order {
    unique_ptr<State> s_ = make_unique<Created>();
    void apply(unique_ptr<State> next) { if (next) s_ = move(next); }
public:
    void pay() { apply(s_->pay()); }
    void ship() { apply(s_->ship()); }
    void cancel() { apply(s_->cancel()); }
    const char* state() const { return s_->name(); }
};

int main() {
    Order o;
    cout << "start: " << o.state() << "\n";
    o.ship();                      // illegal: not paid yet
    o.pay();    cout << "after pay: " << o.state() << "\n";
    o.pay();                       // illegal: already paid
    o.ship();   cout << "after ship: " << o.state() << "\n";
    o.cancel();                    // illegal: already shipped
}
```
**Result:** illegal transitions are rejected by the state itself, and no flag combination can be inconsistent.
:::

:::qa Drill 6: split a long method (Extract Method) {level=easy}
**Smell:** one 80-line `process()` mixing validation, calculation and printing.
```cpp run title="Long method to small functions"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Item { string name; double price; int qty; };

// AFTER: each function does one thing and has a name that says it
bool valid(const Item& i) { return i.qty > 0 && i.price >= 0; }
double lineTotal(const Item& i) { return i.price * i.qty; }
double discount(double subtotal) { return subtotal > 1000 ? subtotal * 0.1 : 0; }
void printLine(const Item& i) { cout << "  " << i.name << " x" << i.qty << " = " << lineTotal(i) << "\n"; }

double checkout(const vector<Item>& items) {
    double subtotal = 0;
    for (auto& i : items) { if (!valid(i)) { cout << "  skipped invalid item " << i.name << "\n"; continue; } printLine(i); subtotal += lineTotal(i); }
    double d = discount(subtotal);
    cout << "  subtotal " << subtotal << ", discount " << d << "\n";
    return subtotal - d;
}

int main() {
    double total = checkout({{"pen", 10, 5}, {"bag", 900, 2}, {"bad", 5, 0}});
    cout << "total = " << total << "\n";
}
```
**Result:** each function is testable on its own and `checkout` reads like the requirement.
:::

:::qa Which code smells should you spot in a review, and what is the usual fix? {level=medium}
| Smell | Fix |
|---|---|
| Long method | Extract Method |
| Large class (God class) | Extract Class; split by responsibility |
| Switch on type | Polymorphism / Strategy |
| Long parameter list | Parameter object / Builder |
| Duplicated code | Extract function or class (only for real shared knowledge) |
| Feature envy | Move Method to the class whose data it uses |
| Data clumps (always together) | Introduce a value object (`Address`, `DateRange`) |
| Primitive obsession | Strong types (`Money`, `UserId`) |
| Shotgun surgery | Group the changing code into one module |
| Global mutable state | Pass dependencies in; make state local |
:::

:::qa How do you refactor safely? {level=medium}
Have tests first (characterisation tests if none), change in **small steps** that keep the program working, run the tests after each step, commit often, and do not mix refactoring with adding features in one change.
:::

:::qa What is "Replace inheritance with delegation"? {level=hard}
When a subclass uses only part of its base or breaks the contract, make the base a **member** and forward only the needed calls. `Stack` should hold a `vector`, not inherit from it (inheriting exposes `insert` in the middle).
:::

:::qa What is the difference between refactoring and rewriting? {level=easy}
Refactoring changes structure without changing behaviour, in small verified steps. A rewrite replaces the code wholesale and often loses hidden behaviour. Prefer refactoring unless the design is unsalvageable.
:::

```quiz
? Which refactoring removes a `switch (type)` that grows with every new type?
- Extract Method
+ Replace conditional with polymorphism
- Inline Variable
> Each type implements the behaviour in its own class.
```

:::keypoints
- Name the smell, name the refactoring, prove behaviour is unchanged.
- Switch→polymorphism, telescoping→builder, new→injection, if-chain→strategy, flags→State, long method→extract.
- Small steps with tests.
:::
