---
title: Visitor
level: advanced
time: 40
summary: Add new operations to a set of classes without editing them. Learn why overloading alone is not enough, what double dispatch means in simple words, a shopping tax example, an expression tree, the main trade-off, and the modern std::variant alternative.
---

:::note This one is a bit harder
Visitor is the trickiest pattern in this module. Read it slowly. If you are short on time, remember the **short answer** at the bottom. That is enough for most interviews.
:::

## What is the Visitor pattern?

Don't memorise the definition yet. Think of it like this:

> "I have a few kinds of objects that never change (Book, Food, Electronics). But I keep getting **new jobs** to do on them: calculate tax, print an invoice, export to JSON. I don't want to open the item classes every time."

:::analogy Think of a tax officer visiting shops
The officer (visitor) visits a bookshop, a restaurant and an electronics shop. At each one, the officer applies **the rule for that kind of shop**. The shops do not change when a new officer type comes (say a fire inspector). A new officer simply visits the same shops.
:::

:::def Visitor
Put a new **operation** in its **own class** (the visitor), and let it **visit** each kind of object. You can add new operations **without changing** the object classes.
:::

## The problem: stable classes, growing list of jobs

`Book`, `Food` and `Electronics` rarely change. But the business keeps asking for new jobs: tax, invoice line, JSON export, shipping check.

If we add each job as a method inside every item class, we must **edit every class** for every new job. The item classes become messy, full of tax code, JSON code, shipping code.

With Visitor, each job gets **its own class**. A new job means a new class. The items stay the same.

## Why not just use overloading?

You might say: "Write `tax(Book&)`, `tax(Food&)` and `tax(Electronics&)`, and let C++ pick." The problem is that C++ picks an overload by the type **written in the code** (the static type), not the real type at run time. With a list of base pointers, it fails:

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

We need the choice to depend on **two things at run time**: which item it is, and which job we are doing. This is called **double dispatch**. ("Dispatch" just means "decide which function to call".)

## How double dispatch works (two steps)

1. The user calls `item.accept(visitor)`. This is a **virtual** call, so it reaches the **real** item class (for example `Book`). *First decision: by the item's type.*
2. Inside `Book::accept`, the code calls `visitor.visit(*this)`. Here `*this` is known to be a `Book`, so the right `visit(Book&)` is chosen. *Second decision: by the visitor's type.*

```viz algo=seq title="Double dispatch"
participant c Client [user]
participant b Book [box]
participant v TaxVisitor [box]
c -> b : accept(visitor) | First virtual call: resolved by the element's real type (Book).
b -> v : visit(Book&) | Inside Book, *this is statically a Book, so the Book overload is chosen.
v --> b : adds 5% tax for books
b --> c : done
```

## The implementation

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

To add a new job (like `ExportJsonVisitor` or `ShippingVisitor`), you write **one new class**. `Book`, `Food` and `Electronics` do not change. All the tax code is in one place, and a visitor can keep a running total while it walks (like `total_`).

## A visitor over an expression tree

Visitors are great for **trees** (maths expressions, documents, file systems) where you need many jobs: calculate, print, check types, optimise.

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

## The main trade-off

| You want to add... | With normal virtual methods | With Visitor |
|---|---|---|
| a new **job** (operation) | edit **every** class | **easy**: one new visitor |
| a new **kind of item** | **easy**: one new class | **hard**: edit the visitor interface and **every** visitor |

So the rule is:

- **Visitor** is good when the **item classes are stable** and the **jobs keep growing** (syntax trees, document types, tax categories).
- **Normal virtual methods** are better when **new item types** come more often than new jobs.

Other costs: items must show enough of their data for visitors to work, and every class needs the `accept` boilerplate.

## The modern way: `std::variant` and `std::visit`

In C++17, if the set of types is **fixed**, `std::variant` with `std::visit` does the same job. It needs no `accept`, no class family, and you get a **compile error** if you forget a case.

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

- Use the classic Visitor when the items are objects behind pointers in a big, open framework.
- Use `variant` when the set of types is **fixed and known**.

## Short answer to say in an interview

:::interview What is Visitor and double dispatch? When is it a bad idea?
"Visitor lets me add new operations to a group of classes without editing them. Each item has accept(visitor), which calls visitor.visit(*this). The first virtual call picks the item type, and the second picks the right visit function. That is double dispatch. It is good when the item types are stable and the jobs keep growing, like a syntax tree. It is a bad idea when new item types come often, because every visitor must change. In modern C++, std::variant with std::visit often replaces it."
:::

```quiz
? Why do we need accept() instead of just overloading visit()?
- To save memory
+ Overloads are chosen by the written type. accept() uses a virtual call to find the real type first
- It is a C++ rule
> That is double dispatch: a virtual accept, then visit(*this).
? What becomes hard with Visitor?
- Adding a new job
+ Adding a new kind of item, because every visitor must change
- Walking a tree
> New jobs are easy. New item types are costly.
? Which modern C++ feature often replaces Visitor for a fixed set of types?
- Macros
+ std::variant with std::visit
- Templates only
> It gives safe dispatch and checks at compile time that every case is handled.
```

:::keypoints
- Visitor adds new operations to stable classes without editing them. It uses double dispatch: `accept`, then `visit(*this)`.
- It is great for syntax trees, documents and file systems. Each job's code stays in one place.
- Trade-off: adding a new item type is costly. `std::variant` with `std::visit` is the modern choice for a fixed set.
:::
