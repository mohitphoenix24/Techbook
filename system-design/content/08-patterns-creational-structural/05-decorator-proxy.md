---
title: Decorator and Proxy
level: intermediate
time: 45
summary: Adding behaviour without subclassing — the Decorator pattern (stackable wrappers for logging, retries, caching and pricing add-ons, in C++ and JavaScript) — and the Proxy pattern for controlling access (caching, lazy loading, protection, remote and rate-limiting proxies), including JavaScript's built-in Proxy object.
---

Both patterns put a wrapper in front of an object that **implements the same interface**, so clients can't tell the difference. The **Decorator** wraps to **add behaviour**; the **Proxy** wraps to **control access**. They show up constantly in LLD (pricing add-ons, cached repositories) and in real infrastructure (middleware, ORMs, RPC stubs).

## Decorator

:::def Decorator
Attaches **additional responsibilities** to an object **dynamically** by wrapping it in an object with the same interface. Decorators can be **stacked**, each adding one behaviour and delegating the rest to the wrapped object.
:::

**Problem:** a coffee shop sells drinks with any combination of add-ons (extra shot, oat milk, whipped cream, caramel). Subclassing every combination (`LatteWithOatMilkAndCaramel`) explodes. Decorators compose them at run time, each adding its cost and description.

```viz algo=uml title="Decorators wrap the same interface"
interface Beverage
  + cost(): int
  + description(): string
class Espresso
class Latte
abstract class AddOn
  # inner: Beverage
class ExtraShot
class OatMilk
class Caramel
Espresso ..|> Beverage
Latte ..|> Beverage
AddOn ..|> Beverage
AddOn o-- Beverage : wraps
ExtraShot --|> AddOn
OatMilk --|> AddOn
Caramel --|> AddOn
```

:::tabs Stackable decorators
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Beverage {
public:
    virtual ~Beverage() = default;
    virtual int cost() const = 0;                       // in rupees
    virtual string description() const = 0;
};
class Espresso : public Beverage { public: int cost() const override { return 120; } string description() const override { return "espresso"; } };
class Latte : public Beverage { public: int cost() const override { return 180; } string description() const override { return "latte"; } };

class AddOn : public Beverage {                         // base decorator: holds and delegates to the wrapped beverage
protected:
    unique_ptr<Beverage> inner_;
public:
    explicit AddOn(unique_ptr<Beverage> inner) : inner_(std::move(inner)) {}
};
class ExtraShot : public AddOn { public: using AddOn::AddOn;
    int cost() const override { return inner_->cost() + 40; }
    string description() const override { return inner_->description() + " + extra shot"; } };
class OatMilk : public AddOn { public: using AddOn::AddOn;
    int cost() const override { return inner_->cost() + 50; }
    string description() const override { return inner_->description() + " + oat milk"; } };
class Caramel : public AddOn { public: using AddOn::AddOn;
    int cost() const override { return inner_->cost() + 30; }
    string description() const override { return inner_->description() + " + caramel"; } };

int main() {
    unique_ptr<Beverage> order = make_unique<Latte>();
    order = make_unique<OatMilk>(std::move(order));         // wrap…
    order = make_unique<ExtraShot>(std::move(order));       // …and wrap again
    order = make_unique<ExtraShot>(std::move(order));       // the same decorator twice is fine
    cout << order->description() << " = Rs " << order->cost() << "\n";

    unique_ptr<Beverage> simple = make_unique<Caramel>(make_unique<Espresso>());
    cout << simple->description() << " = Rs " << simple->cost() << "\n";
}
```
```js run
// Any object with cost() and description() is a Beverage
const espresso = () => ({ cost: () => 120, description: () => "espresso" });
const latte = () => ({ cost: () => 180, description: () => "latte" });

// A decorator takes a beverage and returns a beverage with one behaviour added
const addOn = (name, price) => (inner) => ({
  cost: () => inner.cost() + price,
  description: () => `${inner.description()} + ${name}`,
});
const extraShot = addOn("extra shot", 40);
const oatMilk = addOn("oat milk", 50);
const caramel = addOn("caramel", 30);

const order = extraShot(extraShot(oatMilk(latte())));       // stack them in any order and number
console.log(`${order.description()} = Rs ${order.cost()}`);
const simple = caramel(espresso());
console.log(`${simple.description()} = Rs ${simple.cost()}`);
```
:::

### Decorators for cross-cutting concerns

The most valuable use in real systems is wrapping a **service interface** with infrastructure behaviour, each decorator doing one thing (Single Responsibility), stacked in a chosen order:

:::tabs Logging, retry and caching decorators around one repository interface
```js run
// The interface: getUser(id) → Promise<user>
class DbUserRepository {
  calls = 0;
  async getUser(id) {
    this.calls++;
    if (this.calls === 1) throw new Error("connection reset");   // a transient failure on the first call
    return { id, name: `user-${id}` };
  }
}

const withLogging = (repo, log) => ({
  async getUser(id) { log.push(`→ getUser(${id})`); const u = await repo.getUser(id); log.push(`← ${u.name}`); return u; },
});
const withRetry = (repo, attempts = 3) => ({
  async getUser(id) {
    for (let i = 1; ; i++) {
      try { return await repo.getUser(id); }
      catch (e) { if (i >= attempts) throw e; }              // (backoff omitted for brevity)
    }
  },
});
const withCache = (repo) => {
  const cache = new Map();
  return { async getUser(id) { if (!cache.has(id)) cache.set(id, await repo.getUser(id)); return cache.get(id); } };
};

const db = new DbUserRepository(), log = [];
const repo = withCache(withLogging(withRetry(db), log));      // order matters: cache → log → retry → db
await repo.getUser(7);
await repo.getUser(7);                                        // served from cache: no log, no DB call
console.log(log.join("  "));
console.log("database calls:", db.calls, "(1 failed + 1 retried; the second getUser hit the cache)");
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct User { int id; string name; };
struct UserRepository { virtual ~UserRepository() = default; virtual User getUser(int id) = 0; };

class DbUserRepository : public UserRepository {
public:
    int calls = 0;
    User getUser(int id) override {
        if (++calls == 1) throw runtime_error("connection reset");   // transient failure on the first call
        return {id, "user-" + to_string(id)};
    }
};

class LoggingRepo : public UserRepository {
    UserRepository& inner_; vector<string>& log_;
public:
    LoggingRepo(UserRepository& i, vector<string>& l) : inner_(i), log_(l) {}
    User getUser(int id) override {
        log_.push_back("-> getUser(" + to_string(id) + ")");
        User u = inner_.getUser(id);
        log_.push_back("<- " + u.name);
        return u;
    }
};
class RetryingRepo : public UserRepository {
    UserRepository& inner_; int attempts_;
public:
    RetryingRepo(UserRepository& i, int a) : inner_(i), attempts_(a) {}
    User getUser(int id) override {
        for (int i = 1;; i++) {
            try { return inner_.getUser(id); }
            catch (const exception&) { if (i >= attempts_) throw; }
        }
    }
};
class CachingRepo : public UserRepository {
    UserRepository& inner_; unordered_map<int, User> cache_;
public:
    explicit CachingRepo(UserRepository& i) : inner_(i) {}
    User getUser(int id) override {
        auto it = cache_.find(id);
        if (it != cache_.end()) return it->second;
        return cache_.emplace(id, inner_.getUser(id)).first->second;
    }
};

int main() {
    DbUserRepository db;
    vector<string> log;
    RetryingRepo retry(db, 3);
    LoggingRepo logging(retry, log);
    CachingRepo repo(logging);                      // cache -> log -> retry -> db
    repo.getUser(7);
    repo.getUser(7);                                // served from cache
    for (auto& l : log) cout << l << "  ";
    cout << "\ndatabase calls: " << db.calls << " (1 failed + 1 retried; the second getUser hit the cache)\n";
}
```
:::

This is exactly how **HTTP middleware** (Express, ASP.NET, Go handlers), **Java I/O streams** (`BufferedInputStream(new FileInputStream(…))`), Python's `@decorators`, and gRPC interceptors work.

:::tip Decorator vs inheritance
Decorators add behaviour at **run time** and **combine freely** (N decorators, any subset, any order); subclasses fix behaviour at compile time and multiply (2ᴺ combinations). The trade-off: many small wrapper objects, and debugging through layers of delegation. Order matters too: caching **outside** retry means cache hits skip retries; logging outside caching would log cache hits too.
:::

## Proxy

:::def Proxy
A substitute object with the **same interface** as the real one, which **controls access** to it: deciding when the real object is created, whether a call is allowed, whether a cached answer can be returned, or how the call reaches a remote machine.
:::

Common kinds:

| Proxy | Controls | Example |
|---|---|---|
| **Virtual (lazy) proxy** | when the expensive real object is created | load a 50 MB image only when it's first displayed |
| **Protection proxy** | whether the caller may perform the operation | only admins may call `deleteUser` |
| **Caching proxy** | whether the real object must be called at all | memoised results of a slow service |
| **Remote proxy** | how the call reaches another process/machine | gRPC/RPC client stubs, Java RMI |
| **Smart reference** | extra bookkeeping on access | reference counting (`shared_ptr`), access logging, rate limiting |

:::tabs Lazy and protection proxies
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Document {                                  // the subject interface
    virtual ~Document() = default;
    virtual string read() = 0;
    virtual void erase() = 0;
};

class RealDocument : public Document {             // expensive to create
    string name_, content_;
public:
    explicit RealDocument(string name) : name_(std::move(name)) {
        cout << "  (loading " << name_ << " from storage: slow)\n";
        content_ = "contents of " + name_;
    }
    string read() override { return content_; }
    void erase() override { cout << "  " << name_ << " erased\n"; }
};

class DocumentProxy : public Document {            // same interface: lazy + protection
    string name_, role_;
    unique_ptr<RealDocument> real_;                // created on first use
    RealDocument& real() { if (!real_) real_ = make_unique<RealDocument>(name_); return *real_; }
public:
    DocumentProxy(string name, string role) : name_(std::move(name)), role_(std::move(role)) {}
    string read() override { return real().read(); }
    void erase() override {
        if (role_ != "admin") throw runtime_error("permission denied: " + role_ + " can't erase");
        real().erase();
    }
};

int main() {
    vector<unique_ptr<Document>> docs;
    for (int i = 1; i <= 3; i++) docs.push_back(make_unique<DocumentProxy>("report-" + to_string(i) + ".pdf", "viewer"));
    cout << "3 proxies created, nothing loaded yet\n";
    cout << docs[1]->read() << "\n";               // only this one is loaded
    cout << docs[1]->read() << "\n";               // already loaded
    try { docs[1]->erase(); } catch (const exception& e) { cout << e.what() << "\n"; }
    DocumentProxy adminView("report-1.pdf", "admin");
    adminView.erase();
}
```
```js run
// JavaScript has a built-in Proxy object that intercepts property access and calls.
function guardedService(target, { role, cacheFor = [] }) {
  const cache = new Map();
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args) => {
        if (prop.startsWith("delete") && role !== "admin") throw new Error(`permission denied: ${role} can't call ${prop}`);
        if (cacheFor.includes(prop)) {                         // caching proxy for selected methods
          const key = `${prop}:${JSON.stringify(args)}`;
          if (!cache.has(key)) cache.set(key, value.apply(obj, args));
          return cache.get(key);
        }
        return value.apply(obj, args);
      };
    },
  });
}

const userService = {
  lookups: 0,
  getUser(id) { this.lookups++; return { id, name: `user-${id}` }; },
  deleteUser(id) { return `deleted ${id}`; },
};

const asViewer = guardedService(userService, { role: "viewer", cacheFor: ["getUser"] });
console.log(asViewer.getUser(1), asViewer.getUser(1));
console.log("real lookups:", userService.lookups, "(second call served by the caching proxy)");
try { asViewer.deleteUser(1); } catch (e) { console.log(e.message); }
console.log(guardedService(userService, { role: "admin" }).deleteUser(1));
```
:::

**Where proxies appear:** ORM lazy loading (Hibernate proxies load a related entity on first access), RPC/gRPC client stubs, Vue 3 and MobX reactivity (JavaScript `Proxy` tracks property reads and writes), `shared_ptr`, access-controlled services, and at the infrastructure level **reverse proxies** and **sidecars** (the same idea at network scale).

## Decorator or Proxy?

They look identical in code; the difference is **intent and who decides**:

- A **decorator** is usually composed **by the client** to add behaviour, and is designed to be **stacked**.
- A **proxy** usually **manages the real object's lifecycle or access**, is often created by the framework, and the client may not even know it's there.

In interviews, naming the intent correctly ("a caching proxy in front of the pricing service", "logging and retry decorators around the repository") is what matters.

```quiz
? A pizza can have any combination of 12 toppings, each changing price and description. Which pattern avoids thousands of subclasses?
+ Decorator: wrap the base pizza in one decorator per topping
- Singleton
- Abstract Factory
> Decorators combine at run time, so N toppings need N classes, not 2ᴺ.

? An image viewer creates 500 image objects but only displays 20; loading each image file is slow. Which pattern helps?
- Facade
+ A virtual (lazy) proxy that loads the real image only when first displayed
- Prototype
> The proxy has the same interface and defers creating the expensive real object.

? A caching decorator is placed OUTSIDE a retry decorator. What does that mean for cache hits?
+ Cache hits return immediately without going through the retry logic or the real service
- Every call is retried
- The cache is never used
> The outermost wrapper sees the call first; ordering decorators is a design decision.

? What do Decorator and Proxy have in common?
+ Both wrap an object behind the same interface it already has
- Both convert one interface into another
- Both create families of objects
> They differ in intent: adding behaviour vs controlling access.
```

:::keypoints
- **Decorator**: same interface, adds one responsibility, **stackable** at run time; avoids subclass explosions. Great for cross-cutting concerns (logging, retry, caching, metrics) and add-on pricing. Order matters.
- **Proxy**: same interface, **controls access**: lazy creation, protection, caching, remote calls, reference counting. JavaScript's built-in `Proxy` intercepts property access.
- Same shape, different intent: decorators add behaviour (client-composed); proxies manage access or lifecycle (often transparent).
:::
