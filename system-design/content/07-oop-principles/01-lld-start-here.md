---
title: Low-Level Design — How LLD Interviews Work
level: easy
time: 30
summary: What a low-level design (object-oriented design / machine coding) round asks for, how it's graded, a six-step method from requirements to working code, and a complete mini example — a shopping cart with pluggable discounts — designed and implemented in C++ and JavaScript.
---

High-level design asks "which boxes and arrows?". **Low-level design (LLD)** zooms into one box and asks "which **classes**, with which **responsibilities**, **relationships** and **methods**, and does the code actually work?". It's the round where your ability to write **clean, extensible, correct code** is tested directly. Many companies (Amazon, Uber, Flipkart, Swiggy, Atlassian, Microsoft and most Indian product companies) run a dedicated LLD or **machine coding** round.

## What the round looks like

| Format | Time | You produce |
|---|---|---|
| **OOD discussion** | 45–60 min | requirements, entities, a class diagram, key method signatures, a few core methods in code, discussion of patterns and extensions |
| **Machine coding** | 60–120 min | a **working**, runnable program (often console-based) covering the core requirements, with clean structure, then demonstrated with test inputs |

Classic questions: parking lot, elevator, vending machine, movie ticket booking, Splitwise, LRU cache, chess / tic-tac-toe / snake-and-ladder, logger, rate limiter, library management, ATM, food delivery, ride sharing, task scheduler, in-memory key-value store, pub/sub. The **LLD Interview Problems** module solves twelve of them end to end.

## What interviewers grade

1. **Requirements and scope**: did you clarify what to build, and leave out the rest?
2. **Modelling**: are the entities and their responsibilities sensible? Is each class about one thing?
3. **Extensibility**: can a new vehicle type, payment method or pricing rule be added **without rewriting** existing classes? (This is where SOLID and design patterns earn their keep.)
4. **Correctness**: does the code work, including edge cases (full parking lot, insufficient balance, invalid move)?
5. **Code quality**: naming, small methods, no duplication, clear interfaces, encapsulation.
6. **Concurrency** (for senior roles): what if two users book the same seat at once?
7. **Communication**: thinking aloud, explaining trade-offs, taking hints.

:::warn The most common failure
Starting to type classes immediately and producing 600 lines of tangled code with one god class. Interviewers would much rather see 150 lines of well-structured code that handles the core flow, plus a clear explanation of how you'd extend it.
:::

## A six-step method

:::flow From requirements to running code
Clarify | the features, the actors, the constraints; write them as a short list
Entities | the nouns (Vehicle, Spot, Ticket) and their key attributes
Relationships | has-a, is-a, uses; draw a class diagram
Behaviour | public methods per class; who calls whom (a sequence for the main flow)
Code | interfaces first, then core classes, then the main flow and a driver/test
Extend | patterns for variation points, edge cases, concurrency, what you'd add next
:::

**Step 1, clarify.** Ask until you could write the README: who uses it, the core use cases, and the rules (prices, limits). Explicitly park non-goals ("no payments UI, no persistence").

**Step 2, entities.** Underline the **nouns** in the requirements. Not every noun becomes a class (some are attributes), and some classes appear later (a `PricingStrategy` nobody mentioned).

**Step 3, relationships.** Decide **is-a** (inheritance or interface), **has-a** (composition/aggregation) and **uses** (dependency). The UML lesson covers the notation.

**Step 4, behaviour.** For each class, its public methods; for the main use case, which object calls which. Keep data and the behaviour that uses it in the same class.

**Step 5, code.** Interfaces and core classes first, then the main flow, then a small `main` that demonstrates it. Prefer clarity over cleverness.

**Step 6, extend.** Point out the **variation points** ("pricing changes often, so it's a strategy") and the patterns that support them, the edge cases you handled, and concurrency risks.

## A worked mini example: a shopping cart with discounts

**Requirements** (after clarifying): a cart holds products with quantities; we can add and remove items; the total applies **one** discount chosen at checkout: none, a percentage off, or "buy X get Y free" on one product. New discount types will be added often. Prices are in paise (integers).

**Entities**: `Product` (id, name, price), `CartItem` (product, quantity), `Cart`, `Discount`. The phrase "new discount types will be added often" tells us `Discount` should be an **interface** with one implementation per rule, so adding a rule never touches `Cart`.

```viz algo=uml title="Cart with pluggable discounts"
class Product
  + id: string
  + name: string
  + pricePaise: int
class CartItem
  + product: Product
  + quantity: int
class Cart
  - items: map<id, CartItem>
  + add(p: Product, qty: int)
  + remove(productId: string)
  + subtotal(): int
  + total(d: Discount): int
interface Discount
  + amountOff(cart: Cart): int
class NoDiscount
class PercentOff
  - percent: int
class BuyXGetYFree
  - productId: string
  - x: int
  - y: int
Cart *-- CartItem : 0..*
CartItem --> Product
Cart ..> Discount : uses
NoDiscount ..|> Discount
PercentOff ..|> Discount
BuyXGetYFree ..|> Discount
```

:::tabs Implementation
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Product { string id, name; long pricePaise; };
struct CartItem { Product product; int quantity; };

class Cart;                                       // forward declaration for Discount

class Discount {                                  // the variation point: one class per rule
public:
    virtual ~Discount() = default;
    virtual long amountOff(const Cart& cart) const = 0;
    virtual string name() const = 0;
};

class Cart {
    map<string, CartItem> items_;                 // product id -> item (keeps a stable order)
public:
    void add(const Product& p, int qty) {
        if (qty <= 0) throw invalid_argument("quantity must be positive");
        auto [it, inserted] = items_.try_emplace(p.id, CartItem{p, 0});
        it->second.quantity += qty;
    }
    void remove(const string& productId) { items_.erase(productId); }
    const map<string, CartItem>& items() const { return items_; }
    long subtotal() const {
        long sum = 0;
        for (auto& [_, item] : items_) sum += item.product.pricePaise * item.quantity;
        return sum;
    }
    long total(const Discount& d) const { return max(0L, subtotal() - d.amountOff(*this)); }
};

class NoDiscount : public Discount {
public:
    long amountOff(const Cart&) const override { return 0; }
    string name() const override { return "no discount"; }
};

class PercentOff : public Discount {
    int percent_;
public:
    explicit PercentOff(int percent) : percent_(percent) {}
    long amountOff(const Cart& c) const override { return c.subtotal() * percent_ / 100; }
    string name() const override { return to_string(percent_) + "% off"; }
};

class BuyXGetYFree : public Discount {
    string productId_; int x_, y_;
public:
    BuyXGetYFree(string productId, int x, int y) : productId_(std::move(productId)), x_(x), y_(y) {}
    long amountOff(const Cart& c) const override {
        auto it = c.items().find(productId_);
        if (it == c.items().end()) return 0;
        int groups = it->second.quantity / (x_ + y_);          // every x+y items, y are free
        return (long)groups * y_ * it->second.product.pricePaise;
    }
    string name() const override { return "buy " + to_string(x_) + " get " + to_string(y_) + " free"; }
};

string rupees(long paise) { return "Rs " + to_string(paise / 100) + "." + (paise % 100 < 10 ? "0" : "") + to_string(paise % 100); }

int main() {
    Cart cart;
    cart.add({"mug", "Coffee mug", 29900}, 3);
    cart.add({"tea", "Masala tea 250g", 18050}, 2);
    cout << "subtotal: " << rupees(cart.subtotal()) << "\n";

    vector<unique_ptr<Discount>> offers;
    offers.push_back(make_unique<NoDiscount>());
    offers.push_back(make_unique<PercentOff>(10));
    offers.push_back(make_unique<BuyXGetYFree>("mug", 2, 1));
    for (auto& d : offers) cout << left << setw(22) << d->name() << " total " << rupees(cart.total(*d)) << "\n";
}
```
```js run
class Product {
  constructor(id, name, pricePaise) { Object.assign(this, { id, name, pricePaise }); }
}

class Cart {
  #items = new Map();                              // product id → { product, quantity }
  add(product, qty) {
    if (qty <= 0) throw new RangeError("quantity must be positive");
    const item = this.#items.get(product.id) ?? { product, quantity: 0 };
    item.quantity += qty;
    this.#items.set(product.id, item);
  }
  remove(productId) { this.#items.delete(productId); }
  item(productId) { return this.#items.get(productId); }
  subtotal() { let sum = 0; for (const { product, quantity } of this.#items.values()) sum += product.pricePaise * quantity; return sum; }
  total(discount) { return Math.max(0, this.subtotal() - discount.amountOff(this)); }
}

// The variation point: every discount implements amountOff(cart). Adding a rule = adding a class.
class NoDiscount { name = "no discount"; amountOff() { return 0; } }

class PercentOff {
  constructor(percent) { this.percent = percent; this.name = `${percent}% off`; }
  amountOff(cart) { return Math.floor((cart.subtotal() * this.percent) / 100); }
}

class BuyXGetYFree {
  constructor(productId, x, y) { Object.assign(this, { productId, x, y, name: `buy ${x} get ${y} free` }); }
  amountOff(cart) {
    const item = cart.item(this.productId);
    if (!item) return 0;
    const groups = Math.floor(item.quantity / (this.x + this.y));   // every x+y items, y are free
    return groups * this.y * item.product.pricePaise;
  }
}

const rupees = (paise) => `Rs ${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;

const cart = new Cart();
cart.add(new Product("mug", "Coffee mug", 29900), 3);
cart.add(new Product("tea", "Masala tea 250g", 18050), 2);
console.log("subtotal:", rupees(cart.subtotal()));
for (const d of [new NoDiscount(), new PercentOff(10), new BuyXGetYFree("mug", 2, 1)])
  console.log(`${d.name.padEnd(22)} total ${rupees(cart.total(d))}`);
```
:::

Notice what makes this a good LLD answer, even though it's small:

- **Each class has one job**: `Cart` manages items and totals; each discount knows one rule.
- **The variation point is an interface**: a "free shipping over Rs 999" discount is a new class, and `Cart` doesn't change (the Open/Closed Principle, coming up in the SOLID lesson; the pattern is called **Strategy**).
- **Money is an integer** (paise), never a float.
- **Invalid input is rejected** (`quantity must be positive`).
- `Cart` hides its internal map; callers use methods (encapsulation).

Natural follow-up questions, and how you'd answer: *stack multiple discounts?* (a `CompositeDiscount` holding a list, the Composite pattern), *discounts that expire?* (a decorator that checks dates, or a validity field), *thread safety if the cart is shared?* (guard mutations with a lock, or keep carts per session).

## C++ and JavaScript in LLD interviews

Both languages are accepted at most companies. Use whichever you write fastest and most correctly. This course shows both, so you can read either:

| Concept | C++ | JavaScript |
|---|---|---|
| Interface | abstract class with pure `virtual … = 0` | a documented method contract (duck typing); optionally a base class that throws |
| Encapsulation | `private:` members | `#private` fields |
| Polymorphism | `virtual` + `override`, called via pointer/reference | any object with the right method |
| Ownership | `unique_ptr` / `shared_ptr`, values | garbage collected |
| Enums | `enum class` | frozen objects or string constants |
| Concurrency | `std::thread`, `mutex`, `atomic` | single-threaded event loop; `async`/`await`, workers |

:::tip Time management for a 90-minute machine-coding round
~10 min requirements and entities, ~10 min class diagram and API, ~50 min code (core flow first, working end to end), ~10 min a driver with test scenarios, ~10 min refactor and discuss extensions. **Get something running early**, then improve it.
:::

```quiz
? In an LLD interview, what's usually more valuable than covering every feature?
+ A clean, working core flow with clear responsibilities and obvious extension points
- Writing as many classes as possible
- Using every design pattern you know
> Interviewers grade structure, correctness and extensibility. Over-engineering is a red flag too.

? The requirements say "new discount types will be added often". What does that suggest?
- Put all discount logic in a big switch statement inside Cart
+ Model discounts behind an interface, with one class per rule, so Cart never changes when a rule is added
- Store discounts as strings
> A known variation point should be an abstraction (here: the Strategy pattern).

? Why store money as integer paise/cents?
+ Floating point can't represent most decimal fractions exactly, so sums drift (0.1 + 0.2 ≠ 0.3)
- Integers use less memory
- It's required by C++
> Use integer minor units (or a decimal type) for money.
```

:::keypoints
- LLD rounds test **modelling, extensibility, correctness and code quality**, as an OOD discussion or a machine-coding round with runnable code.
- Method: **clarify → entities → relationships (class diagram) → behaviour (methods, main flow) → code (interfaces first, core flow, driver) → extend**.
- Find the **variation points** in the requirements and put them behind interfaces; keep each class focused on one job.
- Get a working core flow early; then refactor and discuss extensions, edge cases and concurrency.
:::
