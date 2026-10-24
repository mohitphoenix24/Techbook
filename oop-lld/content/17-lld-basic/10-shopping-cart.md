---
title: Design a Shopping Cart with pricing rules
level: easy
time: 45
summary: Products, a cart with quantities, a price engine built from swappable rules (bulk discount, coupon, tax by category), exact money handling, a stock check at checkout, and an order with a clear price breakdown.
---

:::problem Design a Shopping Cart {level=easy tags="e-commerce,Strategy,pricing,money,chain of rules"}
Design the shopping cart of an online store. Customers add and remove products, change quantities, apply a coupon and check out. Prices depend on rules that change often: bulk discounts, coupon codes, and taxes that differ by product category. The cart must show a line-by-line breakdown, and it must not sell more than the stock.

:::hint Hint
Pricing rules change more than anything else, so do not put them inside `Cart`. Make each rule a small object, run the rules in order over the cart, and record what each one did. Store money as integers.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Money? | whole paise as integers. One currency |
| Cart actions? | add (increase the quantity), remove, set quantity, clear, show totals |
| Discounts? | **bulk**: 10% off a line when the quantity is 5 or more. **Coupon**: `SAVE100` takes Rs 100 off orders above Rs 1000, `NEW10` gives 10% off once |
| Taxes? | by category: food 5%, books 0%, electronics 18% (after discounts) |
| Order of rules? | line discounts, then cart discounts, then tax |
| Stock? | checked at checkout. Checkout fails if any line is over stock. Stock goes down only on success |
| Output? | price of each line, what each rule did, subtotal, discounts, tax, total |
| Not needed | payment, shipping, user accounts |

## Step 2: Find the classes

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

## Step 3: Design decisions

- **`PriceRule` is a list of strategies.** The engine builds a working `Pricing` object, and each rule adjusts it. The order matters, so the engine runs rules in the order we set. A new rule like "buy 2 get 1 free" or a festival discount is a new class.
- **`Pricing` writes down every change** (name and amount), so the invoice can explain the total. A rule never changes the cart itself.
- **Products never change.** The cart holds `Line {product, qty}`.
- **Money** is a small value type with integer paise (see the toolkit lesson).
- **Checkout is the only place that changes stock.** It checks stock again first, because the cart you saw may be out of date.
- **The rounding rule is written down.** Percentages use integer maths. Discounts round down (good for the customer), tax rounds up.

## Step 4: The code

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

| Case | What happens |
|---|---|
| Quantity set to 0 | the line is removed |
| A coupon with a minimum that is not met | it is noted as "not applicable", so the user sees why |
| A discount bigger than the order | `Pricing` limits it, so a total is never negative (add a final `max(0, ...)` if needed) |
| Stock changed after the cart was built | `placeOrder` checks all lines again before changing anything |
| Rounding | integer maths. Tax rounds up, discounts round down. Say this policy out loud |
| The same product added twice | joins into one line |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Buy 2 get 1 free", "festival sale" | new `PriceRule` classes added in order |
| "Coupons that stack or do not stack" | a `stackable` flag on the coupon rule. The engine applies the best one that does not stack |
| "Different tax for each state" | a `TaxPolicy` strategy chosen from the shipping address |
| "Two buyers want the last item" | lock the stock while checking and taking (one step), or hold the item when added to the cart with a time limit |
| "Save the cart / abandoned cart" | a `CartRepository` interface. The cart is plain data |
| "Show the price history" | save the `Pricing` with the order |
| "Many currencies" | `Money` carries a currency. Conversion is a separate service |

## Short answer to say in an interview

:::interview How do you design the pricing in a shopping cart?
"I keep pricing out of the cart. Each rule, like a bulk discount, a coupon or a tax, is a small strategy object. A price engine runs them in a fixed order over a working pricing object and records what each rule did, so the invoice can explain the total. Money is an integer in paise, and the rounding rule is stated. Checkout first checks stock for all lines and only then changes it, so it is all or nothing."
:::

```quiz
? Why must pricing rules run in a fixed order?
- It looks nicer
+ Tax must use the price after discounts. A different order gives a different total
- Maps are ordered
> The engine applies line discounts, then cart discounts, then tax.
? Why check stock for all lines before reducing any?
- To print one error
+ Checkout must be all or nothing. A failure on line 3 must not leave lines 1 and 2 already reduced
- To make it faster
> Check everything first, then make the changes.
```

:::keypoints
- The cart is plain data. The price engine runs ordered `PriceRule` strategies over a working `Pricing` that records each change.
- Use exact money, state the rounding rule, and make checkout check first, then commit.
- New offers are new rule classes. Taxes, coupons and bulk deals never touch `Cart`.
:::
