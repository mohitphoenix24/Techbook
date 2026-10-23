---
title: Designing for testability: seams, fakes and mocks
level: intermediate
time: 40
summary: Why hard-to-test code is badly designed code, the seams that make behaviour replaceable, test doubles (dummy, stub, fake, spy, mock), injecting time and randomness, a 20-line test harness you can run here, and how to test concurrency deterministically.
---

"How would you test this?" is a standard LLD follow-up. A design that is easy to test is almost always a design with **low coupling and clear dependencies**. Testability is not an extra: it is a **review of your design**.

## What makes code hard to test

| Smell | Why it blocks testing |
|---|---|
| `new ConcreteDependency` inside the class | you cannot replace it |
| Singletons and global state | tests influence each other |
| Reading the real clock (`now()`), `rand()`, files, network | results change from run to run, or tests are slow |
| Long methods doing many things | one test must set up everything |
| Private logic you can only reach through huge public flows | you cannot target one rule |

The cure is always the same: **find the seams**, the places where you can substitute behaviour **without editing the code under test**, and use **dependency injection** (the DIP lesson) to open them.

## Test doubles: the vocabulary

| Double | What it does | Example |
|---|---|---|
| **Dummy** | fills a parameter, never used | `NullLogger` passed but never called |
| **Stub** | returns **canned answers** | a `Clock` that always says 10:00 |
| **Fake** | a **working simplified** implementation | in-memory repository instead of SQL |
| **Spy** | records how it was called, so the test can inspect afterwards | a mailer that stores sent messages |
| **Mock** | has **expectations** built in and fails if they are not met | "`send` must be called exactly once with this text" |

Prefer **fakes and stubs** (state-based testing: check the result) over mocks (interaction-based: check the calls). Over-mocking ties tests to the implementation, so they break when you refactor.

## A 20-line test harness

You do not need a framework to get started. Here is one that fits in a few lines; real projects use GoogleTest, Catch2 or doctest.

```cpp run title="A tiny test runner"
#include <functional>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct TestCase { string name; function<void()> body; };
vector<TestCase>& registry() { static vector<TestCase> r; return r; }

struct Register { Register(string n, function<void()> f) { registry().push_back({move(n), move(f)}); } };

#define TEST(name) void name(); static Register reg_##name(#name, name); void name()
#define CHECK(cond) do { if (!(cond)) throw runtime_error(string("CHECK failed: ") + #cond); } while (0)

// ---- code under test ----
int add(int a, int b) { return a + b; }

TEST(add_positive_numbers) { CHECK(add(2, 3) == 5); }
TEST(add_negative_numbers) { CHECK(add(-2, -3) == -5); }
TEST(add_zero_is_identity) { CHECK(add(7, 0) == 7); }
TEST(this_one_fails_on_purpose) { CHECK(add(2, 2) == 5); }

int main() {
    int failed = 0;
    for (auto& t : registry()) {
        try { t.body(); cout << "  PASS " << t.name << "\n"; }
        catch (const exception& e) { ++failed; cout << "  FAIL " << t.name << ": " << e.what() << "\n"; }
    }
    cout << registry().size() - failed << " passed, " << failed << " failed\n";
}
```

## Injecting time

Code that calls `system_clock::now()` directly cannot be tested ("expire after 30 minutes" would take 30 minutes). Inject a **Clock**.

```cpp run title="A session store tested without waiting"
#include <iostream>
#include <map>
#include <memory>
#include <string>
using namespace std;

struct Clock { virtual ~Clock() = default; virtual long nowSeconds() const = 0; };
struct SystemClock : Clock { long nowSeconds() const override { return 1700000000; } };   // (stand-in for the real clock)
struct FakeClock : Clock {
    long t = 0;
    long nowSeconds() const override { return t; }
    void advance(long s) { t += s; }
};

class SessionStore {
    const Clock& clock_;
    long ttl_;
    map<string, long> expiresAt_;
public:
    SessionStore(const Clock& c, long ttlSeconds) : clock_(c), ttl_(ttlSeconds) {}
    void login(const string& user) { expiresAt_[user] = clock_.nowSeconds() + ttl_; }
    bool isActive(const string& user) const {
        auto it = expiresAt_.find(user);
        return it != expiresAt_.end() && clock_.nowSeconds() < it->second;
    }
};

int main() {
    FakeClock clock;
    SessionStore sessions(clock, 1800);                       // 30-minute sessions
    sessions.login("asha");
    cout << "just after login: " << boolalpha << sessions.isActive("asha") << "\n";
    clock.advance(1799);
    cout << "after 29m59s:     " << sessions.isActive("asha") << "\n";
    clock.advance(2);
    cout << "after 30m01s:     " << sessions.isActive("asha") << "\n";       // we "waited" 30 minutes in microseconds
}
```

The same trick works for randomness (inject a `RandomSource` that returns a fixed sequence), IDs (an `IdGenerator`), file systems and network calls.

## A spy and a stub together

```cpp run title="Testing a service with a spy mailer and a stub price list"
#include <iostream>
#include <string>
#include <vector>
using namespace std;

struct PriceList { virtual ~PriceList() = default; virtual double priceOf(const string& sku) const = 0; };
struct Mailer { virtual ~Mailer() = default; virtual void send(const string& to, const string& body) = 0; };

class CheckoutService {
    const PriceList& prices_;
    Mailer& mailer_;
public:
    CheckoutService(const PriceList& p, Mailer& m) : prices_(p), mailer_(m) {}
    double checkout(const string& customer, const vector<string>& skus) {
        double total = 0;
        for (const auto& s : skus) total += prices_.priceOf(s);
        if (total > 0) mailer_.send(customer, "Your total is " + to_string(static_cast<int>(total)));
        return total;
    }
};

// stub: canned prices
struct StubPrices : PriceList { double priceOf(const string& sku) const override { return sku == "pen" ? 10 : 100; } };
// spy: remembers what was sent
struct SpyMailer : Mailer {
    vector<pair<string, string>> sent;
    void send(const string& to, const string& body) override { sent.emplace_back(to, body); }
};

int main() {
    StubPrices prices; SpyMailer mail;
    CheckoutService svc(prices, mail);

    double total = svc.checkout("asha", {"pen", "pen", "book"});
    bool ok1 = total == 120 && mail.sent.size() == 1 && mail.sent[0].first == "asha" && mail.sent[0].second == "Your total is 120";
    cout << (ok1 ? "PASS" : "FAIL") << ": total and one email\n";

    double empty = svc.checkout("ravi", {});
    bool ok2 = empty == 0 && mail.sent.size() == 1;           // still only the first email
    cout << (ok2 ? "PASS" : "FAIL") << ": an empty cart sends nothing\n";
}
```

## What to test

| Test | Example |
|---|---|
| **Happy path** | a valid booking succeeds |
| **Boundaries** | exactly at capacity, zero items, the 15-minute free period |
| **Invalid input** | negative amount, unknown id |
| **State transitions** | cancel after ship is refused |
| **Invariants** | total money is constant after any transfer |
| **Concurrency** | N threads book the last seat: exactly one wins |

## Testing concurrency

Concurrency tests are hard because failures are timing-dependent. Tactics:

1. **Test the logic single-threaded first.** Most bugs are not about threads.
2. **Stress tests**: many threads, many iterations, then check **invariants** (no overselling, totals add up). A race may fail only 1 in 10,000 runs, so repeat.
3. **ThreadSanitizer** (`-fsanitize=thread`) reports data races even if the output was right.
4. **Make time and scheduling injectable** (a fake clock, a manual executor that runs queued tasks on demand) so tests are deterministic.

```cpp run title="A stress test with an invariant check"
#include <atomic>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
using namespace std;

class SeatMap {
    mutex m_;
    vector<bool> taken_;
public:
    explicit SeatMap(size_t n) : taken_(n, false) {}
    bool book(size_t seat) { lock_guard l(m_); if (taken_[seat]) return false; taken_[seat] = true; return true; }
};

int main() {
    const int kRounds = 200;
    bool allGood = true;
    for (int round = 0; round < kRounds && allGood; ++round) {
        SeatMap seats(1);                                     // ONE seat, many buyers
        atomic<int> winners{0};
        vector<thread> buyers;
        for (int b = 0; b < 8; ++b) buyers.emplace_back([&] { if (seats.book(0)) ++winners; });
        for (auto& t : buyers) t.join();
        allGood = winners == 1;                               // the invariant: exactly one winner
    }
    cout << (allGood ? "PASS" : "FAIL") << ": " << kRounds << " rounds, exactly one winner each time\n";
}
```

:::interview How do you make your design testable?
"I pass dependencies in through constructors as interfaces, so a test can substitute a fake or stub. I inject the clock, random source and id generator instead of calling them directly, and I avoid global state and Singletons. I prefer state-based tests with fakes to heavy mocking. For concurrency I test the logic single-threaded, add stress tests that check invariants, and run ThreadSanitizer."
:::

```quiz
? Which test double returns canned answers?
- Spy
+ Stub
- Mock
> A stub supplies fixed responses; a spy records calls; a mock verifies expectations.
? Why inject a Clock instead of calling now()?
- It is faster
+ Tests can control time deterministically
- Clocks are not thread-safe
> You can advance a fake clock by 30 minutes instantly.
? What is a "seam"?
- A bug
+ A place where behaviour can be substituted without editing the code under test
- A mutex
> Constructor-injected interfaces are the common seam.
```

:::keypoints
- Hard-to-test code usually has hidden dependencies; open seams with dependency injection.
- Doubles: dummy, stub, fake, spy, mock. Prefer fakes/stubs and state-based assertions.
- Inject time, randomness and IDs. Test concurrency with invariants, stress and ThreadSanitizer.
:::
