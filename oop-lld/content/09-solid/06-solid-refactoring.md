---
title: A full SOLID refactoring, step by step
level: intermediate
time: 40
summary: One messy OrderService that breaks all five SOLID rules, cleaned up in five easy steps. The code runs after every stage.
---

SOLID is easiest to learn on a real mess. Below is an `OrderService` written in a hurry by a beginner. We will clean it up **one rule at a time**.

## Where we start

```cpp run title="Step 0: the messy version"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Item { string name; double price; int qty; };

class OrderService {
public:
    // validates, prices, applies discounts, takes payment, saves, and notifies: all in one
    void placeOrder(const string& customer, const vector<Item>& items, const string& paymentType,
                    const string& customerType, const string& notifyBy) {
        // validation
        if (items.empty()) { cout << "  empty order\n"; return; }

        // pricing
        double total = 0;
        for (const auto& i : items) total += i.price * i.qty;

        // discount by customer type (switch on a string)
        if (customerType == "gold") total *= 0.90;
        else if (customerType == "silver") total *= 0.95;

        // payment by type (another switch)
        if (paymentType == "card") cout << "  charging card " << total << "\n";
        else if (paymentType == "upi") cout << "  collecting UPI " << total << "\n";
        else { cout << "  unknown payment type\n"; return; }

        // persistence (hard-wired)
        cout << "  INSERT INTO orders VALUES ('" << customer << "', " << total << ")\n";

        // notification (another switch)
        if (notifyBy == "email") cout << "  emailing " << customer << "\n";
        else if (notifyBy == "sms") cout << "  texting " << customer << "\n";
    }
};

int main() {
    OrderService svc;
    svc.placeOrder("asha", {{"pen", 10, 3}, {"book", 200, 1}}, "upi", "gold", "email");
}
```

What is wrong? Let's list it in simple words:

- **SRP**: one class does six jobs (checks the order, calculates the price, takes payment, saves, sends email, prints).
- **OCP**: there are `if / else` chains on strings. Every new discount or payment type means editing this class.
- **DIP**: the database, payment and email are all fixed inside. They cannot be replaced.
- It is **impossible to test** without really charging and emailing.

Now we fix it step by step.

## Step 1 (SRP): give each job its own class

We make one class per job: `OrderValidator`, `PriceCalculator`, `PaymentProcessor`, `OrderRepository`, `Notifier`.

`OrderService` becomes short. It just **coordinates**: it calls the others in order.

## Step 2 (OCP): replace the `if` chains with classes

Discounts and payment methods are things that **change**. So each one becomes a small class behind an interface. We also use an `enum class` instead of strings.

Now a new discount is a **new class**, not an edit.

## Step 3 (LSP): every class must keep the same promise

`PaymentMethod::pay` returns `true` or `false`. **No** payment class is allowed to throw "not supported" or to say "success" without really paying. Everyone follows the same simple promise, so any of them can replace any other.

## Step 4 (ISP): keep interfaces small

`OrderRepository` has only `save`. `Notifier` has only `notify`. The coordinator asks only for what it needs. It does not ask for a giant "Database" interface with 30 methods.

## Step 5 (DIP): pass everything in from `main`

`OrderService` gets its helpers through the constructor, as interfaces. `main` is the only place that knows the real classes.

## The final result

```cpp run title="Step 5: the SOLID version"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

struct Item { string name; double price; int qty; };
struct Order { string customer; vector<Item> items; };

// ---------- small, focused abstractions (ISP) ----------
struct DiscountPolicy  { virtual ~DiscountPolicy() = default;  virtual double apply(double total) const = 0; };
struct PaymentMethod   { virtual ~PaymentMethod() = default;   virtual bool pay(double amount) = 0; };
struct OrderRepository { virtual ~OrderRepository() = default; virtual void save(const Order& o, double total) = 0; };
struct Notifier        { virtual ~Notifier() = default;        virtual void notify(const string& customer, const string& text) = 0; };

// ---------- implementations (each can change or be added independently: OCP) ----------
struct NoDiscount     : DiscountPolicy { double apply(double t) const override { return t; } };
struct GoldDiscount   : DiscountPolicy { double apply(double t) const override { return t * 0.90; } };
struct SilverDiscount : DiscountPolicy { double apply(double t) const override { return t * 0.95; } };

struct CardPayment : PaymentMethod { bool pay(double a) override { cout << "  charging card " << a << "\n"; return true; } };
struct UpiPayment  : PaymentMethod { bool pay(double a) override { cout << "  collecting UPI " << a << "\n"; return true; } };

struct SqlOrderRepository : OrderRepository {
    void save(const Order& o, double total) override { cout << "  INSERT INTO orders VALUES ('" << o.customer << "', " << total << ")\n"; }
};
struct EmailNotifier : Notifier { void notify(const string& c, const string& t) override { cout << "  emailing " << c << ": " << t << "\n"; } };
struct SmsNotifier   : Notifier { void notify(const string& c, const string& t) override { cout << "  texting " << c << ": " << t << "\n"; } };

// ---------- single-purpose helpers (SRP) ----------
class OrderValidator {
public:
    bool valid(const Order& o) const { return !o.items.empty(); }
};
class PriceCalculator {
public:
    double subtotal(const Order& o) const { double t = 0; for (const auto& i : o.items) t += i.price * i.qty; return t; }
};

// ---------- the coordinator depends only on abstractions (DIP) ----------
class OrderService {
    OrderValidator validator_;
    PriceCalculator prices_;
    OrderRepository& repo_;
    Notifier& notifier_;
public:
    OrderService(OrderRepository& r, Notifier& n) : repo_(r), notifier_(n) {}

    bool place(const Order& o, const DiscountPolicy& discount, PaymentMethod& payment) {
        if (!validator_.valid(o)) { cout << "  empty order\n"; return false; }
        double total = discount.apply(prices_.subtotal(o));
        if (!payment.pay(total)) { cout << "  payment failed\n"; return false; }
        repo_.save(o, total);
        notifier_.notify(o.customer, "order confirmed, total " + to_string(static_cast<int>(total)));
        return true;
    }
};

int main() {
    SqlOrderRepository repo;
    EmailNotifier email;
    SmsNotifier sms;
    OrderService byEmail(repo, email), bySms(repo, sms);

    Order o{"asha", {{"pen", 10, 3}, {"book", 200, 1}}};
    GoldDiscount gold; UpiPayment upi; CardPayment card; NoDiscount none;

    cout << "order 1 (gold, UPI, email):\n"; byEmail.place(o, gold, upi);
    cout << "order 2 (no discount, card, sms):\n"; bySms.place(o, none, card);
    cout << "order 3 (empty):\n"; byEmail.place(Order{"ravi", {}}, none, card);
}
```

## What did we gain?

| If someone asks for... | Before | After |
|---|---|---|
| A "platinum" discount | edit the `if` chain in `placeOrder` | add a `PlatinumDiscount` class |
| Wallet payment | edit the payment chain | add a `WalletPayment` class |
| Switch from SQL to a web API | edit the big method and risk breaking it | add a `RestOrderRepository` and change one line in `main` |
| Test the order flow | impossible without side effects | pass fakes |
| Change the validation rule | search in 40 lines | edit `OrderValidator` |

## A test for the new design

```cpp run title="Testing OrderService with fakes"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct Item { string name; double price; int qty; };
struct Order { string customer; vector<Item> items; };

struct DiscountPolicy  { virtual ~DiscountPolicy() = default;  virtual double apply(double total) const = 0; };
struct PaymentMethod   { virtual ~PaymentMethod() = default;   virtual bool pay(double amount) = 0; };
struct OrderRepository { virtual ~OrderRepository() = default; virtual void save(const Order& o, double total) = 0; };
struct Notifier        { virtual ~Notifier() = default;        virtual void notify(const string& c, const string& t) = 0; };

class OrderService {
    OrderRepository& repo_; Notifier& notifier_;
public:
    OrderService(OrderRepository& r, Notifier& n) : repo_(r), notifier_(n) {}
    bool place(const Order& o, const DiscountPolicy& d, PaymentMethod& p) {
        if (o.items.empty()) return false;
        double sub = 0; for (const auto& i : o.items) sub += i.price * i.qty;
        double total = d.apply(sub);
        if (!p.pay(total)) return false;
        repo_.save(o, total);
        notifier_.notify(o.customer, "confirmed");
        return true;
    }
};

// fakes
struct FakeRepo : OrderRepository { int saves = 0; double lastTotal = 0; void save(const Order&, double t) override { ++saves; lastTotal = t; } };
struct FakeNotifier : Notifier { int sent = 0; void notify(const string&, const string&) override { ++sent; } };
struct DecliningPayment : PaymentMethod { bool pay(double) override { return false; } };
struct AcceptingPayment : PaymentMethod { bool pay(double) override { return true; } };
struct TenPercent : DiscountPolicy { double apply(double t) const override { return t * 0.9; } };

int main() {
    Order o{"asha", {{"pen", 10, 5}}};          // subtotal 50
    {
        FakeRepo repo; FakeNotifier note; OrderService svc(repo, note);
        AcceptingPayment ok; TenPercent d;
        bool placed = svc.place(o, d, ok);
        cout << (placed && repo.saves == 1 && repo.lastTotal == 45 && note.sent == 1 ? "PASS" : "FAIL") << ": success path\n";
    }
    {
        FakeRepo repo; FakeNotifier note; OrderService svc(repo, note);
        DecliningPayment no; TenPercent d;
        bool placed = svc.place(o, d, no);
        cout << (!placed && repo.saves == 0 && note.sent == 0 ? "PASS" : "FAIL") << ": declined payment saves nothing and sends nothing\n";
    }
}
```

No real database, no real email, and the test is very fast. This is the real reward of SOLID.

## Short answer to say in an interview

:::interview How would you refactor a messy class?
"First I list its jobs and split them (SRP). Then I look for if-else chains on a type and turn them into an interface with one class per case (OCP). I make sure every class keeps the same promise (LSP), keep interfaces small (ISP), and pass the helpers in through the constructor (DIP). At the end I can show that a new feature adds one class, and a test uses simple fakes."
:::

```quiz
? Which rule removed the if (paymentType == "card") chains?
- SRP
+ OCP, by making one class per payment method
- ISP
> A new payment method becomes a new class, not an edit.
? Why does OrderService take OrderRepository& and not SqlOrderRepository&?
- To save memory
+ DIP: depend on the interface, so the real thing can be replaced or faked
- References are faster
> The coordinator should not know the real detail.
```

:::keypoints
- Refactor in this order: split the jobs, replace type switches with classes, keep promises equal, keep interfaces small, pass helpers in.
- The reward: new features are new classes, and tests use fakes.
- Keep the coordinator class short. It should depend only on interfaces.
:::
