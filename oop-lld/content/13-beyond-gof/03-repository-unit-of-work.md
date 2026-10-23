---
title: Repository, DAO and Unit of Work
level: intermediate
time: 35
summary: Keeping persistence out of business logic: the Repository interface with an in-memory and a pretend-SQL implementation, DAO versus Repository, the service layer, a Unit of Work that commits or rolls back several changes together, and how this makes testing easy.
---

Almost every LLD problem eventually asks "where do the objects get stored?". The answer is not "inside the class": the **domain** classes (Order, Book, User) should not know about databases. Three patterns keep storage separate.

## Repository

:::def Repository
A **collection-like interface** for retrieving and storing domain objects, hiding the storage mechanism. To the business code, a repository looks like an **in-memory collection** of aggregates.
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

The `OrderService` is **identical** for both stores. In tests, use the in-memory version (fast, no setup). In production, swap in SQL, a REST API or a file. That is Dependency Inversion applied to persistence.

## DAO vs Repository

| | DAO (Data Access Object) | Repository |
|---|---|---|
| Level | close to the **table**: CRUD for one table | close to the **domain**: a collection of aggregates |
| Language | `insertRow`, `updateRow`, `selectById` | `add`, `findOverdue`, `findByCustomer` |
| Knows about | database details, mapping | domain concepts; it may use DAOs internally |
| Typical return | rows/DTOs | domain objects |

Rule of thumb: a **Repository** is what the **business code** talks to; **DAOs** (or an ORM) are tools a repository may use inside. In interviews they are often used loosely; state which you mean.

## Unit of Work

:::def Unit of Work
Maintain a list of objects **affected by a business transaction**, and **coordinate writing out the changes together**: all or nothing.
:::

Placing an order changes several things: create the order, reduce stock, update the customer's loyalty points. If the third step fails, the first two must be undone. A Unit of Work collects the changes and applies them in **one commit** (or discards them on error).

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

In order 2 the stock reduction had already been applied when the loyalty step failed, but the rollback restored it. That is the "all or nothing" guarantee.

ORMs (Hibernate, Entity Framework, SQLAlchemy) implement Unit of Work for you via their session objects.

## Layers

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

Dependencies point **downward to abstractions**, and the infrastructure at the bottom *implements* interfaces defined above it (DIP). This arrangement is the heart of "clean", "hexagonal" and "onion" architectures.

## Pitfalls

- **Leaky repository**: exposing SQL fragments or database types in the interface defeats the purpose.
- **Generic repository for everything** (`Repository<T>` with `findAll()`) tempts you to load too much. Add query methods named after real needs.
- **Anemic domain**: if all logic is in services and entities are bags of data, behaviour is not where the data is. Put rules in entities and use services only to coordinate.
- **Forgetting identity**: each loaded object must map to one in-memory instance within a unit of work (an "identity map"), or you get two copies of the same row.

:::interview What is the Repository pattern and why use it?
"A repository gives business code a collection-like interface for storing and loading domain objects, hiding the database. The service depends on the repository interface, so I can use an in-memory implementation in tests and SQL in production, which is Dependency Inversion. A Unit of Work records the changes of a business transaction and commits or rolls them back together. DAOs are table-level access objects a repository may use internally."
:::

```quiz
? What does the service layer depend on?
- The SQL repository class
+ The repository interface
- The database driver
> Interfaces make storage swappable and testable.
? What does a Unit of Work guarantee?
- Faster queries
+ A group of changes is committed together or not at all
- That objects are cached
> It is the transaction boundary for a business operation.
? How do DAO and Repository differ?
- They are identical
+ DAO is table-oriented CRUD; a Repository is a domain-oriented collection that may use DAOs
> Repositories speak the domain's language.
```

:::keypoints
- Repository: a domain-facing, collection-like interface that hides storage; implementations are swappable (memory, SQL, REST).
- DAO = table-level access; Repository = aggregate-level. Services depend on the interface (DIP).
- Unit of Work = collect the changes of one business transaction; commit or roll back as a unit.
- Layer your code: API → service → domain → repository interfaces → infrastructure.
:::
