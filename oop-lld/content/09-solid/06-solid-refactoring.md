---
title: A full SOLID refactoring, step by step
level: advanced
time: 40
summary: One messy OrderService that breaks all five principles, refactored in five clear steps (SRP, OCP, LSP, ISP, DIP) into a design that is easy to extend and test, with the code running at every stage.
---

The principles are easiest to learn on a real mess. Here is an `OrderService` that a junior wrote in a hurry. We will fix it one principle at a time.

## The starting point

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

Problems: **SRP** (six responsibilities), **OCP** (three `if/else` chains on strings that grow with every new type), **DIP** (SQL, payment and email all concrete and hard-wired), no way to test without side effects. We refactor in order.

## Step 1: SRP: split the responsibilities

One class per reason to change: `OrderValidator`, `PriceCalculator`, `PaymentProcessor`, `OrderRepository`, `Notifier`. `OrderService` becomes a short **coordinator**.

## Step 2: OCP: replace the type switches with polymorphism

Discounts and payment methods are variation points: make each a small class behind an interface. `enum class`/types replace strings.

## Step 3: LSP: make sure every implementation honours the contract

`PaymentMethod::pay` returns a `bool` (success). **No** implementation may throw "not supported" or return success without paying. We keep the contract simple and identical for all.

## Step 4: ISP: small interfaces

`OrderRepository` only has `save`. `Notifier` only has `notify`. The coordinator that only needs to save depends on the narrow `OrderRepository`, not on a giant "Database" interface.

## Step 5: DIP: inject everything from `main`

`OrderService` takes its collaborators in its constructor as interfaces. `main` is the composition root.

## The result

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

| Change request | Before | After |
|---|---|---|
| Add a "platinum" discount | edit `placeOrder`'s if-chain | add `PlatinumDiscount` |
| Add wallet payments | edit the payment chain | add `WalletPayment` |
| Switch SQL to a REST API | edit and risk the whole method | add `RestOrderRepository`, change one line in `main` |
| Test the order flow | impossible without side effects | pass fakes for `OrderRepository`, `Notifier`, `PaymentMethod` |
| Change the validation rule | scroll through 40 lines | edit `OrderValidator` |

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

No real database, no real email, and the test runs in microseconds. That is the combined payoff of SOLID.

:::interview Walk me through refactoring a messy class
"I first list the responsibilities (SRP) and split them. I look for type switches and extract interfaces (OCP), making sure each implementation keeps the same contract (LSP). I keep interfaces narrow (ISP) and inject them through the constructor so the high-level class depends only on abstractions (DIP). Finally I show how a new requirement and a unit test each touch only one small class."
:::

```quiz
? In the refactoring, which principle removed the `if (paymentType == "card")` chains?
- SRP
+ OCP (polymorphism: one class per payment method)
- ISP
> A new payment method becomes a new class, not an edit.
? Why does `OrderService` take `OrderRepository&` rather than `SqlOrderRepository&`?
- To save memory
+ DIP: depend on the abstraction so the implementation can change and be faked
- Because references are faster
> The high-level class should not know the concrete low-level detail.
```

:::keypoints
- Refactor in order: split responsibilities, replace type switches with polymorphism, keep contracts honest, keep interfaces small, inject dependencies from `main`.
- The payoff: new requirements are new classes, and tests use fakes.
- A coordinator class (`OrderService`) stays short and depends only on abstractions.
:::
