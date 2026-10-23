---
title: Design a Shopping Cart with pricing rules
level: easy
time: 45
summary: Products, a cart with quantities, a pricing engine built from pluggable rules (bulk discount, coupon, category tax), exact money arithmetic, stock checks at checkout, and an order with a clear price breakdown.
---

:::problem Design a Shopping Cart {level=easy tags="e-commerce,Strategy,pricing,money,chain of rules"}
Design the shopping cart of an online store. Customers add and remove products, change quantities, apply a coupon and check out. Prices depend on rules that change often: bulk discounts, coupon codes, taxes that differ per product category. The cart must show an itemised breakdown and must not sell more than the stock.

:::hint Hint
The pricing rules change more than anything else, so do not put them in `Cart`. Model each as a small rule object, run them in order over the cart, and record what each did. Store money as integers.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Money? | integer paise; single currency |
| Cart operations? | add (increase qty), remove, set quantity, clear, view totals |
| Discounts? | **bulk**: 10% off a line when quantity ≥ 5; **coupon**: `SAVE100` takes Rs 100 off orders over Rs 1000, `NEW10` 10% off once |
| Taxes? | by category: food 5%, books 0%, electronics 18% (applied after discounts) |
| Rule order? | line discounts → cart discounts → tax |
| Stock? | checked at checkout; checkout fails if any line is over stock; stock is reduced on success |
| Output? | per-line price, each rule's effect, subtotal, discounts, tax, total |
| Out of scope | payment, shipping, user accounts |

## Step 2: entities

```viz algo=uml title="Shopping cart"
class Cart
  - lines: map<string, Line>
  + add(p: Product, qty: int): void
  + setQuantity(sku: string, qty: int): void
  + remove(sku: string): void
class Product
  - sku: string
  - name: string
  - price: Money
  - category: Category
class Line
  - product: Product
  - qty: int
class PricingEngine
  - rules: PriceRule[]
  + price(c: Cart): Pricing
interface PriceRule
  + apply(p: Pricing): void
class BulkDiscount
class CouponRule
class CategoryTax
class Pricing
  - lines: LinePrice[]
  - adjustments: Adjustment[]
  + total(): Money
class Checkout
  + placeOrder(c: Cart): Result<Order>
Cart *-- Line
Line --> Product
PricingEngine o-- PriceRule
BulkDiscount ..|> PriceRule
CouponRule ..|> PriceRule
CategoryTax ..|> PriceRule
PricingEngine ..> Pricing
Checkout ..> PricingEngine
```

## Step 3: design decisions

- **`PriceRule` is a Strategy list.** The engine builds a mutable `Pricing` working object and each rule adjusts it. Order matters, so the engine runs rules in the order configured. Adding "buy 2 get 1 free" or a festival discount is a new class.
- **`Pricing` records every adjustment** (name, amount) so the invoice can explain the total. A rule never mutates the cart.
- **Immutable products**; the cart holds `Line {product, qty}`.
- **Money** is a small value type with integer paise (see the toolkit lesson).
- **Checkout** is the only place that changes stock, and it re-checks stock first (the cart view may be stale).
- **Rounding policy** is explicit: percentages computed with integer maths, truncating toward zero in the customer's favour for discounts, rounding up for tax.

## Step 4: the code

```cpp run title="Cart, pricing rules, coupon and checkout"
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>
using namespace std;

class Money {
    long p_ = 0;
public:
    constexpr Money() = default;
    explicit constexpr Money(long paise) : p_(paise) {}
    static constexpr Money rupees(long r) { return Money(r * 100); }
    constexpr long paise() const { return p_; }
    Money operator+(Money o) const { return Money(p_ + o.p_); }
    Money operator-(Money o) const { return Money(p_ - o.p_); }
    Money operator*(long n) const { return Money(p_ * n); }
    Money percent(int pct) const { return Money(p_ * pct / 100); }
    Money percentUp(int pct) const { return Money((p_ * pct + 99) / 100); }          // rounds up (used for tax)
    bool operator<(Money o) const { return p_ < o.p_; }
    string str() const { long a = p_ < 0 ? -p_ : p_; return string(p_ < 0 ? "-" : "") + "Rs " + to_string(a / 100) + "." + (a % 100 < 10 ? "0" : "") + to_string(a % 100); }
};

enum class Category { Food, Book, Electronics };
struct Product { string sku, name; Money price; Category category; };

struct Line { Product product; int qty; };

class Cart {
    map<string, Line> lines_;
public:
    void add(const Product& p, int qty) { if (qty <= 0) return; auto it = lines_.find(p.sku); if (it == lines_.end()) lines_.emplace(p.sku, Line{p, qty}); else it->second.qty += qty; }
    void setQuantity(const string& sku, int qty) { if (qty <= 0) lines_.erase(sku); else if (auto it = lines_.find(sku); it != lines_.end()) it->second.qty = qty; }
    void remove(const string& sku) { lines_.erase(sku); }
    const map<string, Line>& lines() const { return lines_; }
    bool empty() const { return lines_.empty(); }
    optional<string> couponCode;                           // at most one coupon
};

// ---------- the working object the rules adjust ----------
struct LinePrice { const Line* line; Money gross; Money discount; Money tax; };
struct Adjustment { string rule; Money amount; };           // negative = discount, positive = tax
struct Pricing {
    vector<LinePrice> lines;
    vector<Adjustment> adjustments;
    Money cartDiscount;
    Money subtotal() const { Money s; for (auto& l : lines) s = s + l.gross; return s; }
    Money lineDiscounts() const { Money s; for (auto& l : lines) s = s + l.discount; return s; }
    Money taxTotal() const { Money s; for (auto& l : lines) s = s + l.tax; return s; }
    Money total() const { return subtotal() - lineDiscounts() - cartDiscount + taxTotal(); }
};

struct PriceRule { virtual ~PriceRule() = default; virtual void apply(Pricing& p, const Cart& c) const = 0; };

struct BulkDiscount : PriceRule {                          // 10% off a line with 5 or more units
    void apply(Pricing& p, const Cart&) const override {
        for (auto& lp : p.lines) if (lp.line->qty >= 5) { Money d = lp.gross.percent(10); lp.discount = lp.discount + d; p.adjustments.push_back({"bulk 10% on " + lp.line->product.name, Money() - d}); }
    }
};
struct CouponRule : PriceRule {
    void apply(Pricing& p, const Cart& c) const override {
        if (!c.couponCode) return;
        Money base = p.subtotal() - p.lineDiscounts();
        if (*c.couponCode == "SAVE100" && !(base < Money::rupees(1000))) { p.cartDiscount = p.cartDiscount + Money::rupees(100); p.adjustments.push_back({"coupon SAVE100", Money() - Money::rupees(100)}); }
        else if (*c.couponCode == "NEW10") { Money d = base.percent(10); p.cartDiscount = p.cartDiscount + d; p.adjustments.push_back({"coupon NEW10", Money() - d}); }
        else p.adjustments.push_back({"coupon " + *c.couponCode + " not applicable", Money()});
    }
};
struct CategoryTax : PriceRule {                           // tax is computed on the price AFTER discounts
    static int rate(Category c) { return c == Category::Food ? 5 : c == Category::Electronics ? 18 : 0; }
    void apply(Pricing& p, const Cart&) const override {
        Money subtotalAfterLine = p.subtotal() - p.lineDiscounts();
        for (auto& lp : p.lines) {
            Money net = lp.gross - lp.discount;
            if (subtotalAfterLine.paise() > 0) net = net - Money(p.cartDiscount.paise() * net.paise() / subtotalAfterLine.paise());   // share of the cart discount
            lp.tax = net.percentUp(rate(lp.line->product.category));
            if (lp.tax.paise() > 0) p.adjustments.push_back({"tax " + to_string(rate(lp.line->product.category)) + "% on " + lp.line->product.name, lp.tax});
        }
    }
};

class PricingEngine {
    vector<unique_ptr<PriceRule>> rules_;                   // ORDER MATTERS: line discounts, cart discounts, then tax
public:
    PricingEngine& add(unique_ptr<PriceRule> r) { rules_.push_back(move(r)); return *this; }
    Pricing price(const Cart& c) const {
        Pricing p;
        for (const auto& [sku, line] : c.lines()) p.lines.push_back({&line, line.product.price * line.qty, Money(), Money()});
        for (const auto& r : rules_) r->apply(p, c);
        return p;
    }
};

void printPricing(const Pricing& p) {
    for (auto& lp : p.lines) cout << "    " << lp.line->product.name << " x" << lp.line->qty << "  " << lp.gross.str() << "\n";
    for (auto& a : p.adjustments) cout << "    " << a.rule << ": " << a.amount.str() << "\n";
    cout << "    TOTAL " << p.total().str() << "\n";
}

class Inventory {
    map<string, int> stock_;
public:
    void set(const string& sku, int q) { stock_[sku] = q; }
    int get(const string& sku) const { auto it = stock_.find(sku); return it == stock_.end() ? 0 : it->second; }
    void take(const string& sku, int q) { stock_[sku] -= q; }
};

class Checkout {
    const PricingEngine& engine_; Inventory& inv_;
public:
    Checkout(const PricingEngine& e, Inventory& i) : engine_(e), inv_(i) {}
    optional<Pricing> placeOrder(const Cart& c, string& error) {
        if (c.empty()) { error = "the cart is empty"; return nullopt; }
        for (const auto& [sku, line] : c.lines())
            if (line.qty > inv_.get(sku)) { error = line.product.name + ": only " + to_string(inv_.get(sku)) + " in stock"; return nullopt; }   // check ALL first
        Pricing p = engine_.price(c);
        for (const auto& [sku, line] : c.lines()) inv_.take(sku, line.qty);                                                                           // then change stock
        return p;
    }
};

int main() {
    Product rice{"P1", "Basmati rice", Money::rupees(120), Category::Food};
    Product novel{"P2", "Godaan (novel)", Money::rupees(250), Category::Book};
    Product phone{"P3", "Phone charger", Money::rupees(800), Category::Electronics};

    PricingEngine engine;
    engine.add(make_unique<BulkDiscount>()).add(make_unique<CouponRule>()).add(make_unique<CategoryTax>());
    Inventory inv; inv.set("P1", 20); inv.set("P2", 3); inv.set("P3", 10);
    Checkout checkout(engine, inv);

    Cart cart;
    cart.add(rice, 6); cart.add(novel, 2); cart.add(phone, 1);
    cout << "cart without a coupon:\n"; printPricing(engine.price(cart));

    cart.couponCode = "SAVE100";
    cout << "with coupon SAVE100:\n"; printPricing(engine.price(cart));

    cart.couponCode = "BOGUS";
    cout << "with an unknown coupon:\n"; printPricing(engine.price(cart));

    cart.couponCode = "SAVE100";
    string error;
    cout << "checkout: " << (checkout.placeOrder(cart, error) ? "order placed" : error) << "; stock of novels left " << inv.get("P2") << "\n";
    Cart greedy; greedy.add(novel, 5);
    cout << "checkout of 5 novels: " << (checkout.placeOrder(greedy, error) ? "order placed" : error) << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Quantity set to 0 | the line is removed |
| Coupon below the minimum | recorded as "not applicable" so the user sees why |
| Discount larger than the order | `Pricing` clamps; totals never negative (add a final `max(0, ...)` if needed) |
| Stock changed since the cart was built | `placeOrder` re-checks all lines before changing anything |
| Rounding | integer maths; tax rounds up, discounts truncate; state the policy |
| Same product added twice | merges into one line |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Buy 2 get 1 free" or "festival sale" | new `PriceRule` classes; registered in order |
| "Stackable vs exclusive coupons" | a coupon rule with a `stackable` flag; the engine applies the best exclusive one |
| "Different tax by state" | `TaxPolicy` Strategy chosen from the shipping address |
| "Concurrent checkouts for the last item" | lock the inventory for check-and-take (one critical section), or reserve at add-to-cart with a timeout |
| "Save the cart / abandoned cart" | a `CartRepository` interface; the cart is plain data |
| "Show price history/audit" | persist the `Pricing` with the order |
| "Multiple currencies" | `Money` carries a currency; conversion is a service |

```quiz
? Why must pricing rules run in a defined order?
- It looks nicer
+ Tax must use the price after discounts; a different order gives a different total
- Because maps are ordered
> The engine applies line discounts, then cart discounts, then tax.
? Why check stock for all lines before reducing any?
- To print one error
+ Checkout must be all-or-nothing: a failure on line 3 must not leave lines 1 and 2 already deducted
- To speed up
> Validate first, then commit changes.
```

:::keypoints
- Cart is plain data; the PricingEngine runs ordered `PriceRule` strategies over a working `Pricing` that records each adjustment.
- Use exact money, state the rounding policy, and make checkout validate-then-commit.
- New promotions are new rule classes; taxes, coupons and bulk deals never touch `Cart`.
:::
