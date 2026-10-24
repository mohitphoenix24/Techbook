---
title: Repository, DAO and Unit of Work
level: intermediate
time: 35
summary: Keep storage code away from business code. See the Repository interface with a memory and a pretend-SQL version, how DAO differs, a Unit of Work that saves several changes together or none, and how this makes testing easy.
---

Almost every LLD problem asks one question at some point: **"where do the objects get stored?"**

The answer is **not** "inside the class". Your business classes (Order, Book, User) should not know about databases. Three small ideas keep storage separate.

## 1. Repository

Don't memorise the definition yet. Think of it like this:

> "To the business code, the repository looks like a **simple box of objects**: add one, find one, list some. How the box stores them (memory, SQL, a file) is not its problem."

:::def Repository
An interface that **looks like a collection** of your objects (add, find, remove) and **hides how they are stored**.
:::

```viz algo=uml title="Repository"
class OrderService
  - repo: OrderRepository
  + place(o: Order): void
  + cancel(id: int): bool
interface OrderRepository
  + save(o: Order): void
  + findById(id: int): Order
  + findByCustomer(c: string): Order[]
  + remove(id: int): void
class InMemoryOrderRepository
class SqlOrderRepository
class Order
OrderService --> OrderRepository
InMemoryOrderRepository ..|> OrderRepository
SqlOrderRepository ..|> OrderRepository
OrderRepository ..> Order
```

```cpp run title="A repository interface with two implementations"
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>
using namespace std;

// ---- the domain: knows nothing about storage ----
struct Order {
    int id = 0;
    string customer;
    double total = 0;
    bool cancelled = false;
};

// ---- the abstraction the business code depends on (DIP) ----
class OrderRepository {
public:
    virtual ~OrderRepository() = default;
    virtual int save(Order o) = 0;                                   // assigns an id when new
    virtual optional<Order> findById(int id) const = 0;
    virtual vector<Order> findByCustomer(const string& c) const = 0;
};

// ---- implementation 1: memory (tests, prototypes) ----
class InMemoryOrderRepository : public OrderRepository {
    map<int, Order> rows_;
    int nextId_ = 1;
public:
    int save(Order o) override {
        if (o.id == 0) o.id = nextId_++;
        rows_[o.id] = o;
        return o.id;
    }
    optional<Order> findById(int id) const override {
        auto it = rows_.find(id);
        if (it == rows_.end()) return nullopt;
        return it->second;
    }
    vector<Order> findByCustomer(const string& c) const override {
        vector<Order> out;
        for (const auto& [id, o] : rows_) if (o.customer == c) out.push_back(o);
        return out;
    }
};

// ---- implementation 2: pretend SQL (prints the statements it would run) ----
class SqlOrderRepository : public OrderRepository {
    InMemoryOrderRepository fakeDb_;                                  // stands in for a real database connection
public:
    int save(Order o) override {
        int id = fakeDb_.save(o);
        cout << "  SQL: INSERT/UPDATE orders SET customer='" << o.customer << "', total=" << o.total << " WHERE id=" << id << "\n";
        return id;
    }
    optional<Order> findById(int id) const override { cout << "  SQL: SELECT * FROM orders WHERE id=" << id << "\n"; return fakeDb_.findById(id); }
    vector<Order> findByCustomer(const string& c) const override { cout << "  SQL: SELECT * FROM orders WHERE customer='" << c << "'\n"; return fakeDb_.findByCustomer(c); }
};

// ---- the business logic: a service that uses the abstraction ----
class OrderService {
    OrderRepository& repo_;
public:
    explicit OrderService(OrderRepository& r) : repo_(r) {}
    int place(const string& customer, double total) { return repo_.save(Order{0, customer, total, false}); }
    bool cancel(int id) {
        auto o = repo_.findById(id);
        if (!o || o->cancelled) return false;
        o->cancelled = true;
        repo_.save(*o);
        return true;
    }
    double lifetimeSpend(const string& customer) const {
        double sum = 0;
        for (const auto& o : repo_.findByCustomer(customer)) if (!o.cancelled) sum += o.total;
        return sum;
    }
};

int main() {
    cout << "with the in-memory repository:\n";
    InMemoryOrderRepository mem;
    OrderService a(mem);
    int id = a.place("asha", 500); a.place("asha", 300);
    a.cancel(id);
    cout << "  asha spent " << a.lifetimeSpend("asha") << "\n";

    cout << "with the SQL repository (same service code):\n";
    SqlOrderRepository sql;
    OrderService b(sql);
    b.place("ravi", 900);
    double spent = b.lifetimeSpend("ravi");                  // (compute first: it prints the SELECT line)
    cout << "  ravi spent " << spent << "\n";
}
```

`OrderService` is **exactly the same** for both stores. In tests we use the in-memory version (fast, nothing to set up). In real use we swap in SQL, a web service or a file. This is the Dependency Inversion idea (from SOLID) applied to storage.

## DAO vs Repository

| | DAO (Data Access Object) | Repository |
|---|---|---|
| Close to | the **table**: basic create, read, update, delete | the **business**: a collection of business objects |
| Method names | `insertRow`, `updateRow`, `selectById` | `add`, `findOverdue`, `findByCustomer` |
| Knows about | database details | business ideas (it may use DAOs inside) |
| Gives back | rows or simple data objects | business objects |

Easy way to remember: the **business code talks to a Repository**. A DAO (or an ORM tool) is something the repository may use **inside**. In interviews people use these words loosely, so say which one you mean.

## 2. Unit of Work

Don't memorise the definition yet. Think of it like this:

> "Placing an order changes **three things**. Either all three must happen, or **none**."

:::def Unit of Work
A helper that **collects all the changes** of one business operation and **saves them together** (commit). If something fails, it **discards** them (rollback).
:::

Placing an order does this: create the order, reduce the stock, add loyalty points. If the third step fails, the first two must be undone.

```cpp run title="Collect changes, then commit or roll back"
#include <functional>
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

class Database {                                           // pretend database with transactions
    map<string, int> data_{{"stock:pen", 5}, {"points:asha", 100}};
    map<string, int> backup_;
    bool inTx_ = false;
public:
    void begin() { backup_ = data_; inTx_ = true; cout << "  BEGIN\n"; }
    void commit() { inTx_ = false; cout << "  COMMIT\n"; }
    void rollback() { data_ = backup_; inTx_ = false; cout << "  ROLLBACK\n"; }
    void set(const string& k, int v) { data_[k] = v; }
    int get(const string& k) const { return data_.at(k); }
};

class UnitOfWork {
    Database& db_;
    vector<function<void()>> pending_;                     // changes are recorded, not applied yet
public:
    explicit UnitOfWork(Database& db) : db_(db) {}
    void registerChange(function<void()> change) { pending_.push_back(move(change)); }
    void commit() {
        db_.begin();
        try {
            for (auto& c : pending_) c();                  // apply everything...
            db_.commit();                                  // ...atomically
        } catch (...) {
            db_.rollback();                                // ...or nothing
            throw;
        }
        pending_.clear();
    }
};

void placeOrder(Database& db, int qty, bool loyaltyServiceDown) {
    UnitOfWork uow(db);
    uow.registerChange([&] { if (qty > db.get("stock:pen")) throw runtime_error("not enough stock"); db.set("stock:pen", db.get("stock:pen") - qty); });
    uow.registerChange([&] { if (loyaltyServiceDown) throw runtime_error("loyalty service unavailable"); db.set("points:asha", db.get("points:asha") + qty * 10); });
    try { uow.commit(); cout << "  order OK\n"; }
    catch (const exception& e) { cout << "  order failed: " << e.what() << "\n"; }
    cout << "  stock=" << db.get("stock:pen") << " points=" << db.get("points:asha") << "\n";
}

int main() {
    Database db;
    cout << "order 1 (works):\n";                placeOrder(db, 2, false);
    cout << "order 2 (loyalty down):\n";         placeOrder(db, 1, true);      // the stock change is rolled back
}
```

In order 2, the stock had already been reduced when the loyalty step failed. But the rollback put it back. That is the "all or nothing" promise.

Tools like Hibernate, Entity Framework and SQLAlchemy already give you a Unit of Work through their "session" objects.

## How the layers fit together

```text
 UI / API layer            "POST /orders"
        │
 Service (application) layer      OrderService: use cases, transactions (Unit of Work)
        │
 Domain layer              Order, Customer, rules (no database code)
        │
 Repository interfaces     OrderRepository (abstraction, defined by the domain/service)
        │
 Infrastructure            SqlOrderRepository, RedisCache, EmailClient (implementations)
```

The arrows point **down to interfaces**. The storage at the bottom **follows** interfaces defined above it. This arrangement is the heart of the "clean", "hexagonal" and "onion" architectures you may hear about.

## Mistakes to avoid

- **A leaky repository**: if its interface shows SQL text or database types, it is not hiding anything.
- **One generic repository for everything** (`findAll()` on everything) tempts you to load too much. Add methods with names that match real needs.
- **Empty entities**: if entities are only bags of data and all the logic is in services, the behaviour is away from the data. Keep the rules in the entities, and use services only to coordinate.
- **Two copies of the same row**: inside one operation, one row should map to one object in memory.

## Short answer to say in an interview

:::interview What is the Repository pattern, and why use it?
"A repository gives the business code a simple, collection-like interface to store and load objects, and it hides the database. The service depends on the repository interface, so I can use a memory version in tests and SQL in production. A Unit of Work collects the changes of one business operation and commits them together or rolls them back. A DAO is a table-level helper that a repository may use inside."
:::

```quiz
? What does the service layer depend on?
- The SQL repository class
+ The repository interface
- The database driver
> An interface makes storage easy to swap and easy to test.
? What does a Unit of Work promise?
- Faster queries
+ A group of changes is saved together, or not at all
- That objects are cached
> It marks the boundary of one business transaction.
? How are DAO and Repository different?
- They are the same
+ A DAO works at table level. A Repository works with business objects and may use DAOs inside
> Repositories speak the language of the business.
```

:::keypoints
- Repository = a collection-like interface that hides storage. Implementations are swappable (memory, SQL, web).
- DAO = table-level access. Repository = business-level. Services depend on the interface.
- Unit of Work = collect the changes of one business operation, then commit or roll back together.
- Keep layers: API, service, business objects, repository interfaces, storage.
:::
