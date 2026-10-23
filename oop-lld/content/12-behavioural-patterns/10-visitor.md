---
title: Visitor
level: advanced
time: 40
summary: Adding new operations to a class hierarchy without modifying it, using double dispatch: why overloading alone is not enough, a shopping-cart tax and export example, an expression tree with several visitors, the expression problem, and std::variant with std::visit as the modern alternative.
---

:::def Visitor
Represent an **operation to be performed on the elements of an object structure**. Visitor lets you define a **new operation without changing the classes of the elements** on which it operates.
:::

## The problem: a stable hierarchy, a growing list of operations

You have `Book`, `Food` and `Electronics` item classes that rarely change. But the business keeps asking for new *operations* over them: compute tax, print an invoice line, export to JSON, check shipping eligibility. Adding each operation as a virtual method means **editing every item class** every time (an OCP and SRP problem: items get polluted with tax, JSON and shipping code).

Visitor moves each operation into its **own class**, so a new operation is a new class and the items stay untouched.

## Why not just overload?

A first idea: a `TaxCalculator` with `tax(Book&)`, `tax(Food&)`, `tax(Electronics&)`. Overloads are chosen at **compile time** from the **static** type. With a vector of base pointers, that fails:

```cpp run title="Overloading does not see the dynamic type"
#include <iostream>
#include <memory>
#include <vector>
using namespace std;

struct Item { virtual ~Item() = default; };
struct Book : Item {};
struct Food : Item {};

struct Describer {
    void describe(const Item&) { cout << "  an item\n"; }
    void describe(const Book&) { cout << "  a book\n"; }
    void describe(const Food&) { cout << "  food\n"; }
};

int main() {
    vector<unique_ptr<Item>> cart;
    cart.push_back(make_unique<Book>());
    cart.push_back(make_unique<Food>());
    Describer d;
    for (const auto& item : cart) d.describe(*item);       // static type is Item: always the first overload
}
```

We need the call to depend on **two** dynamic types: the **item** and the **operation**. That is **double dispatch**, and Visitor implements it with two virtual calls.

## How double dispatch works

1. The client calls `item.accept(visitor)`. This is a **virtual** call, so it reaches the real item class (first dispatch: on the element's type).
2. Inside, the item calls `visitor.visit(*this)`. Here `*this` has the item's **exact static type**, so the compiler picks the right `visit` overload (second dispatch: on the visitor's type, because `visit` is virtual).

```viz algo=seq title="Double dispatch"
participant c Client [user]
participant b Book [box]
participant v TaxVisitor [box]
c -> b : accept(visitor) | First virtual call: resolved by the element's real type (Book).
b -> v : visit(Book&) | Inside Book, *this is statically a Book, so the Book overload is chosen.
v --> b : adds 5% tax for books
b --> c : done
```

## Implementation

```viz algo=uml title="Visitor"
interface ItemVisitor
  + visit(b: Book): void
  + visit(f: Food): void
  + visit(e: Electronics): void
interface Item
  + accept(v: ItemVisitor): void
class Book
class Food
class Electronics
class TaxVisitor
class InvoiceVisitor
Book ..|> Item
Food ..|> Item
Electronics ..|> Item
TaxVisitor ..|> ItemVisitor
InvoiceVisitor ..|> ItemVisitor
Item ..> ItemVisitor
```

```cpp run title="Two operations added without touching the items"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Book; class Food; class Electronics;

class ItemVisitor {                                         // one visit() per element type
public:
    virtual ~ItemVisitor() = default;
    virtual void visit(const Book&) = 0;
    virtual void visit(const Food&) = 0;
    virtual void visit(const Electronics&) = 0;
};

class Item {
public:
    virtual ~Item() = default;
    virtual void accept(ItemVisitor& v) const = 0;          // the ONLY operation items must have
};

class Book : public Item {
public:
    string title; double price;
    Book(string t, double p) : title(move(t)), price(p) {}
    void accept(ItemVisitor& v) const override { v.visit(*this); }
};
class Food : public Item {
public:
    string name; double price; bool perishable;
    Food(string n, double p, bool per) : name(move(n)), price(p), perishable(per) {}
    void accept(ItemVisitor& v) const override { v.visit(*this); }
};
class Electronics : public Item {
public:
    string model; double price; int warrantyYears;
    Electronics(string m, double p, int w) : model(move(m)), price(p), warrantyYears(w) {}
    void accept(ItemVisitor& v) const override { v.visit(*this); }
};

// ---- operation 1: tax ----
class TaxVisitor : public ItemVisitor {
    double total_ = 0;
public:
    void visit(const Book& b) override { total_ += b.price * 0.00; }          // books: no tax
    void visit(const Food& f) override { total_ += f.price * 0.05; }
    void visit(const Electronics& e) override { total_ += e.price * 0.18; }
    double total() const { return total_; }
};
// ---- operation 2: invoice lines ----
class InvoiceVisitor : public ItemVisitor {
public:
    void visit(const Book& b) override { cout << "  BOOK  " << b.title << "  Rs" << b.price << "\n"; }
    void visit(const Food& f) override { cout << "  FOOD  " << f.name << "  Rs" << f.price << (f.perishable ? "  (keep cold)" : "") << "\n"; }
    void visit(const Electronics& e) override { cout << "  TECH  " << e.model << "  Rs" << e.price << "  warranty " << e.warrantyYears << "y\n"; }
};

int main() {
    vector<unique_ptr<Item>> cart;
    cart.push_back(make_unique<Book>("Godaan", 250));
    cart.push_back(make_unique<Food>("milk", 60, true));
    cart.push_back(make_unique<Electronics>("phone", 20000, 2));

    InvoiceVisitor invoice;
    TaxVisitor tax;
    for (const auto& item : cart) { item->accept(invoice); item->accept(tax); }
    cout << "total tax: Rs" << tax.total() << "\n";
}
```

A third operation (`ExportJsonVisitor`, `ShippingVisitor`) is **one new class** and no change to `Book`, `Food` or `Electronics`. Related code (everything about tax) sits in one place instead of being scattered across three item classes. A visitor can also **accumulate state** while walking (like `total_`).

## A visitor over an expression tree

Visitors suit **tree structures** (ASTs, documents, file systems) with many operations: evaluate, print, type-check, optimise, compile.

```cpp run title="Evaluate and print the same tree with different visitors"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Num; struct Add; struct Mul;
struct ExprVisitor {
    virtual ~ExprVisitor() = default;
    virtual void visit(const Num&) = 0;
    virtual void visit(const Add&) = 0;
    virtual void visit(const Mul&) = 0;
};
struct Expr { virtual ~Expr() = default; virtual void accept(ExprVisitor&) const = 0; };

struct Num : Expr { double v; explicit Num(double v) : v(v) {} void accept(ExprVisitor& x) const override { x.visit(*this); } };
struct Add : Expr { unique_ptr<Expr> l, r; Add(unique_ptr<Expr> a, unique_ptr<Expr> b) : l(move(a)), r(move(b)) {} void accept(ExprVisitor& x) const override { x.visit(*this); } };
struct Mul : Expr { unique_ptr<Expr> l, r; Mul(unique_ptr<Expr> a, unique_ptr<Expr> b) : l(move(a)), r(move(b)) {} void accept(ExprVisitor& x) const override { x.visit(*this); } };

class Evaluator : public ExprVisitor {
    double result_ = 0;
public:
    double evaluate(const Expr& e) { e.accept(*this); return result_; }
    void visit(const Num& n) override { result_ = n.v; }
    void visit(const Add& a) override { double l = evaluate(*a.l), r = evaluate(*a.r); result_ = l + r; }
    void visit(const Mul& m) override { double l = evaluate(*m.l), r = evaluate(*m.r); result_ = l * r; }
};
class Printer : public ExprVisitor {
    string out_;
public:
    string print(const Expr& e) { out_.clear(); e.accept(*this); return out_; }
    void visit(const Num& n) override { out_ += to_string(static_cast<int>(n.v)); }
    void visit(const Add& a) override { out_ += "("; a.l->accept(*this); out_ += " + "; a.r->accept(*this); out_ += ")"; }
    void visit(const Mul& m) override { m.l->accept(*this); out_ += " * "; m.r->accept(*this); }
};
class DepthCounter : public ExprVisitor {                  // a third operation: tree height
    int depth_ = 0;
public:
    int depth(const Expr& e) { e.accept(*this); return depth_; }
    void visit(const Num&) override { depth_ = 1; }
    void visit(const Add& a) override { int l = depth(*a.l), r = depth(*a.r); depth_ = 1 + max(l, r); }
    void visit(const Mul& m) override { int l = depth(*m.l), r = depth(*m.r); depth_ = 1 + max(l, r); }
};

int main() {
    auto tree = make_unique<Mul>(make_unique<Add>(make_unique<Num>(2), make_unique<Num>(3)), make_unique<Num>(4));
    cout << Printer().print(*tree) << " = " << Evaluator().evaluate(*tree) << ", depth " << DepthCounter().depth(*tree) << "\n";
}
```

## The trade-off: the expression problem

| You want to add... | With virtual methods in the classes | With Visitor |
|---|---|---|
| a new **operation** | edit **every** class | **easy**: write a new visitor |
| a new **element type** | **easy**: add a class | **hard**: edit the visitor interface and **every** visitor |

So: use **Visitor when the element hierarchy is stable** and operations vary and grow (AST nodes, document types, tax categories). Use **plain virtual methods** when new types are more likely than new operations.

Other costs:

- Elements must expose enough of their state for visitors to work (weakens encapsulation).
- The `accept`/`visit` boilerplate in every class.
- Circular dependency between the element and visitor headers (use forward declarations as above).
- Return values need a stateful visitor or a template (`visit` returns `void` above).

## The modern alternative: std::variant and std::visit

In C++17, for a **closed** set of types, `std::variant` + `std::visit` gives you the same capability with no `accept`, no class hierarchy, and a **compile error** if a visitor forgets a case.

```cpp run title="The same idea with variant and visit"
#include <iostream>
#include <string>
#include <variant>
#include <vector>
using namespace std;

template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

struct Book { string title; double price; };
struct Food { string name; double price; };
struct Electronics { string model; double price; };
using Item = variant<Book, Food, Electronics>;

double tax(const Item& i) {
    return visit(overloaded{
        [](const Book&) { return 0.0; },
        [](const Food& f) { return f.price * 0.05; },
        [](const Electronics& e) { return e.price * 0.18; },
    }, i);
}

int main() {
    vector<Item> cart{Book{"Godaan", 250}, Food{"milk", 60}, Electronics{"phone", 20000}};
    double total = 0;
    for (const auto& i : cart) total += tax(i);
    cout << "total tax: Rs" << total << "\n";
}
```

Choose classic Visitor when elements are **polymorphic objects** in an open-ended framework or live behind pointers; choose `variant` when the set of types is **fixed and known**.

:::interview Explain Visitor and double dispatch. When is it a bad idea?
"Visitor lets you add operations to a hierarchy without editing it. Each element has `accept(Visitor&)` that calls `visitor.visit(*this)`; the first virtual call dispatches on the element's type, and the second, on the visitor, picks the right `visit` overload, which is double dispatch. It is great when the element types are stable and operations keep growing, such as an AST. It is bad when new element types are added often, because every visitor must change. In modern C++, `std::variant` with `std::visit` often replaces it for closed sets."
:::

```quiz
? Why do we need `accept()` instead of just overloading `visit()`?
- To save memory
+ Overloads are resolved by static type; accept() uses a virtual call to recover the element's real type first
- It is a C++ rule
> That is double dispatch: virtual accept, then a statically chosen visit(*this).
? What becomes hard when using Visitor?
- Adding a new operation
+ Adding a new element type (every visitor must change)
- Traversing a tree
> New operations are easy; new element types are expensive.
? What modern C++ feature often replaces Visitor for a closed set of types?
- Macros
+ std::variant with std::visit
- Templates only
> It gives type-safe dispatch with a compile-time check that all cases are handled.
```

:::keypoints
- Visitor adds new operations to a stable class hierarchy without editing it, via double dispatch (`accept` then `visit(*this)`).
- Great for ASTs, documents, file systems; keeps each operation's code together and lets visitors accumulate state.
- Trade-off: adding a new element type is costly (the expression problem). `std::variant` + `std::visit` is the modern alternative for closed sets.
:::
