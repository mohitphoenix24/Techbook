---
title: Interfaces, Dependency Injection and Testable Design
level: intermediate
time: 45
summary: Programming to interfaces in C++ (abstract classes and C++20 concepts) and JavaScript (duck typing), dependency injection (constructor, setter, method) and the composition root, why service locators and singletons hurt, and how injected clocks, random sources and gateways make LLD code testable with fakes.
---

Dependency Inversion said "depend on abstractions". This lesson is the practical side: **how** to define those abstractions in each language, **how** concrete objects get wired in (dependency injection), and the payoff that interviewers love to probe: "how would you test this?".

## Interfaces in C++: two flavours

**1. Runtime polymorphism**: an abstract class with only pure virtual functions. Swap implementations at run time; costs a virtual call (negligible in LLD problems).

**2. Compile-time polymorphism**: templates constrained by a **C++20 concept**. The "interface" is a set of requirements checked by the compiler; no virtual calls, no base class; the implementation is fixed at compile time.

:::tabs Two kinds of interfaces in C++
```cpp run
#include <bits/stdc++.h>
using namespace std;

// 1) Runtime interface: abstract class
class Clock {
public:
    virtual ~Clock() = default;
    virtual long nowMs() const = 0;
};
class SystemClock : public Clock {
public:
    long nowMs() const override {
        return chrono::duration_cast<chrono::milliseconds>(chrono::system_clock::now().time_since_epoch()).count();
    }
};
class FixedClock : public Clock {                 // for tests
    long t_;
public:
    explicit FixedClock(long t) : t_(t) {}
    long nowMs() const override { return t_; }
};

// 2) Compile-time interface: a concept
template <class T>
concept Hasher = requires(const T& h, const string& s) {
    { h.hash(s) } -> convertible_to<uint64_t>;
};
struct Fnv1a { uint64_t hash(const string& s) const { uint64_t h = 1469598103934665603ULL; for (unsigned char c : s) { h ^= c; h *= 1099511628211ULL; } return h; } };
struct LengthHash { uint64_t hash(const string& s) const { return s.size(); } };   // terrible, but satisfies the concept

template <Hasher H>
size_t bucketFor(const H& hasher, const string& key, size_t buckets) { return hasher.hash(key) % buckets; }

int main() {
    FixedClock testClock(1767225600000);
    const Clock& c = testClock;                   // code depends on Clock, not on a concrete class
    cout << "clock says: " << c.nowMs() << "\n";
    cout << "system clock is later than 2025: " << boolalpha << (SystemClock().nowMs() > 1735689600000) << "\n";

    cout << "bucket via Fnv1a: " << bucketFor(Fnv1a{}, "user:42", 16) << "\n";
    cout << "bucket via LengthHash: " << bucketFor(LengthHash{}, "user:42", 16) << "\n";
    // bucketFor(42, "x", 16);   // compile error: int does not satisfy Hasher
}
```
```js run
// JavaScript has no interface keyword. A contract is "an object with these methods".
// Document it (JSDoc/TypeScript) and, at boundaries, check it.

/** @typedef {{ nowMs(): number }} Clock */
const systemClock = { nowMs: () => Date.now() };
const fixedClock = (t) => ({ nowMs: () => t });          // for tests

function assertImplements(obj, methods, name) {          // a runtime contract check at the boundary
  const missing = methods.filter((m) => typeof obj?.[m] !== "function");
  if (missing.length) throw new TypeError(`${name} is missing: ${missing.join(", ")}`);
  return obj;
}

/** @param {Clock} clock */
function isExpired(expiresAtMs, clock) { return clock.nowMs() >= expiresAtMs; }

console.log("expired (fixed clock)?", isExpired(1_000, fixedClock(1_500)));
console.log("system clock is later than 2025:", systemClock.nowMs() > 1_735_689_600_000);
assertImplements(fixedClock(0), ["nowMs"], "fixedClock");
try { assertImplements({ now: () => 0 }, ["nowMs"], "badClock"); } catch (e) { console.log("error:", e.message); }
```
:::

| | Abstract class (virtual) | Concept / template | JS duck typing |
|---|---|---|---|
| Chosen | at run time | at compile time | at run time |
| Heterogeneous collection (`vector<unique_ptr<Shape>>`) | ✓ | ✗ (one type per instantiation) | ✓ |
| Error when the contract isn't met | compile time | compile time (clear with concepts) | run time |
| Typical LLD use | strategies, plugins, mocks | generic containers and algorithms | everything |

For LLD interviews, **abstract classes** are the default in C++ because they map directly to the class diagram and allow swapping strategies at run time.

## Dependency injection

:::def Dependency injection (DI)
Instead of an object **creating** its collaborators (`new SmtpMailer()` inside the class), they're **passed in** from outside. The object declares what it needs; someone else decides which implementation it gets.
:::

Three forms:

1. **Constructor injection** (the default): required dependencies are constructor parameters. The object is complete and valid from birth, and dependencies are visible in the signature.
2. **Setter injection**: optional dependencies set after construction (`setLogger(…)`). Risk: a half-configured object.
3. **Method injection**: a dependency passed to the one method that needs it (`report.render(formatter)`).

### The composition root

All the wiring happens in **one place**, near the program's entry point (`main`, or the app's bootstrap), called the **composition root**. Everywhere else, classes just receive what they need. Large applications use a **DI container** (Spring, .NET's built-in container, NestJS, InversifyJS) to automate the wiring; in interviews, plain manual wiring in `main` is clearer.

## A testable design, end to end

A coupon service: a coupon can be redeemed once per user, only before it expires. Time, storage and notifications are all **injected**, so the test can freeze time and inspect what happened:

:::tabs Constructor injection + fakes in a test
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Clock { virtual ~Clock() = default; virtual long nowMs() const = 0; };
struct RedemptionStore {
    virtual ~RedemptionStore() = default;
    virtual bool tryRecord(const string& coupon, const string& user) = 0;   // false if already recorded
};
struct Notifier { virtual ~Notifier() = default; virtual void send(const string& user, const string& msg) = 0; };

struct Coupon { string code; long expiresAtMs; int percentOff; };

class CouponService {
    const Clock& clock_; RedemptionStore& store_; Notifier& notifier_;
public:
    CouponService(const Clock& c, RedemptionStore& s, Notifier& n) : clock_(c), store_(s), notifier_(n) {}
    string redeem(const Coupon& c, const string& user) {
        if (clock_.nowMs() >= c.expiresAtMs) return "rejected: expired";
        if (!store_.tryRecord(c.code, user)) return "rejected: already used";
        notifier_.send(user, to_string(c.percentOff) + "% off applied");
        return "ok";
    }
};

// ---- test doubles ----
struct FakeClock : Clock { long t = 0; long nowMs() const override { return t; } };
struct InMemoryStore : RedemptionStore {
    set<pair<string, string>> used;
    bool tryRecord(const string& c, const string& u) override { return used.insert({c, u}).second; }
};
struct SpyNotifier : Notifier {
    vector<string> sent;
    void send(const string& u, const string& m) override { sent.push_back(u + ": " + m); }
};

int main() {                                      // the "test": the composition root wires fakes
    FakeClock clock; InMemoryStore store; SpyNotifier spy;
    CouponService svc(clock, store, spy);
    Coupon diwali{"DIWALI20", 1'000'000, 20};

    clock.t = 500'000;
    auto check = [](const string& got, const string& want) { cout << (got == want ? "PASS " : "FAIL ") << got << "\n"; };
    check(svc.redeem(diwali, "asha"), "ok");
    check(svc.redeem(diwali, "asha"), "rejected: already used");
    clock.t = 1'000'000;                          // time travel, no sleeping
    check(svc.redeem(diwali, "bilal"), "rejected: expired");
    cout << "notifications sent: " << spy.sent.size() << " (" << spy.sent[0] << ")\n";
}
```
```js run
class CouponService {
  constructor({ clock, store, notifier }) {          // constructor injection (named, for clarity)
    Object.assign(this, { clock, store, notifier });
  }
  redeem(coupon, user) {
    if (this.clock.nowMs() >= coupon.expiresAtMs) return "rejected: expired";
    if (!this.store.tryRecord(coupon.code, user)) return "rejected: already used";
    this.notifier.send(user, `${coupon.percentOff}% off applied`);
    return "ok";
  }
}

// ---- test doubles ----
const fakeClock = { t: 0, nowMs() { return this.t; } };
const inMemoryStore = { used: new Set(), tryRecord(c, u) { const k = `${c}|${u}`; if (this.used.has(k)) return false; this.used.add(k); return true; } };
const spyNotifier = { sent: [], send(u, m) { this.sent.push(`${u}: ${m}`); } };

// the "test": the composition root wires fakes
const svc = new CouponService({ clock: fakeClock, store: inMemoryStore, notifier: spyNotifier });
const diwali = { code: "DIWALI20", expiresAtMs: 1_000_000, percentOff: 20 };
const check = (got, want) => console.log(`${got === want ? "PASS" : "FAIL"} ${got}`);

fakeClock.t = 500_000;
check(svc.redeem(diwali, "asha"), "ok");
check(svc.redeem(diwali, "asha"), "rejected: already used");
fakeClock.t = 1_000_000;                             // time travel, no sleeping
check(svc.redeem(diwali, "bilal"), "rejected: expired");
console.log(`notifications sent: ${spyNotifier.sent.length} (${spyNotifier.sent[0]})`);
```
:::

The same code runs in production with a system clock, a database-backed store (whose `tryRecord` is an `INSERT` guarded by a unique constraint, which is also what makes it safe under concurrency) and a real notifier: only `main` changes.

:::def Test doubles
**Fake**: a working lightweight implementation (an in-memory store). **Stub**: returns canned answers. **Spy**: records how it was called. **Mock**: pre-programmed with expectations that the test verifies. All of them require that the class under test accepts its dependencies from outside.
:::

## Things that fight testability

- **Hidden dependencies**: `new` inside methods, static calls (`Database.query(…)`), reading the system clock or `Math.random()` directly. Inject a `Clock` and a `Random` instead.
- **Singletons and global state**: every test shares them, so tests interfere with each other, and dependencies are invisible in constructor signatures. (The Singleton lesson discusses when they're acceptable.)
- **Service locator**: `ServiceLocator.get("mailer")` inside a class. It looks like DI, but the dependency is hidden and resolved at run time; prefer explicit constructor parameters.
- **Doing work in constructors** (network calls, file I/O): construction should only wire and validate.

:::interview "How would you test this?"
Point at the seams: *"Time, randomness, persistence and external services are injected through interfaces, so the tests use a fake clock, an in-memory repository and a spy notifier. That covers the business rules without a database. Separately, integration tests check the real repository against a test database."* For concurrency-sensitive logic, add: *"and a test that runs N threads redeeming the same coupon and asserts exactly one success."*
:::

```quiz
? A `TokenService` checks expiry with `Date.now()` directly. Why is that a testing problem, and what's the fix?
+ Tests can't control time; inject a Clock dependency and use a fixed/fake clock in tests
- Date.now() is too slow
- It isn't a problem; tests can just sleep until tokens expire
> Hidden dependencies on time (or randomness) make behaviour untestable without waiting. Inject them.

? What's the main advantage of constructor injection over setter injection?
+ Required dependencies are explicit, and the object is fully valid as soon as it's constructed
- It uses less memory
- It allows changing dependencies at run time
> Setter injection risks half-configured objects; constructor injection makes requirements visible.

? When is a C++20 concept preferable to an abstract base class?
- When you need a vector of mixed implementations chosen at run time
+ For generic code where the implementation is known at compile time and you want no virtual calls and clear compile-time errors
- Never; concepts are only for documentation
> Concepts constrain templates (static polymorphism). Abstract classes serve runtime polymorphism.

? Where should objects be wired together in a DI-based design?
+ In one composition root near the entry point (main/bootstrap)
- Inside every class, with `new`
- Through a global service locator
> One place builds the object graph; everything else receives dependencies.
```

:::keypoints
- C++ interfaces: **abstract classes** (runtime polymorphism, the LLD default) or **concepts + templates** (compile-time). JavaScript: **duck typing**, documented contracts, boundary checks.
- **Dependency injection**: collaborators are passed in (constructor injection by default), wired in one **composition root**.
- Inject **time, randomness, persistence and external services** so tests can use fakes, stubs, spies and mocks.
- Avoid hidden dependencies: `new` in methods, static/global calls, singletons, service locators, work in constructors.
- Answer "how would you test this?" by pointing at the seams.
:::
