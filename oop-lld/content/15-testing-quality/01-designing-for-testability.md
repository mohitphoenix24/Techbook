---
title: "Designing for testability: seams, fakes and mocks"
level: intermediate
time: 40
summary: Why code that is hard to test is usually badly designed, how to make parts replaceable, the kinds of test doubles (dummy, stub, fake, spy, mock), how to control time and randomness, a tiny test runner you can run here, and how to test threads.
---

"How would you test this?" is a very common LLD follow-up question.

Here is the key idea: **code that is easy to test is usually well designed**. Hard-to-test code usually has tight coupling and hidden dependencies. So testability is not an extra. It is a **check on your design**.

## What makes code hard to test?

| Warning sign | Why it blocks testing |
|---|---|
| `new ConcreteHelper` inside the class | you cannot replace the helper |
| Singletons and global state | tests affect each other |
| Using the real clock (`now()`), `rand()`, files or network | results change each run, or the test is slow |
| Long methods that do many things | one test must set up everything |
| Rules hidden inside huge flows | you cannot test one rule alone |

The cure is always the same:

1. Find the **seams**. A seam is a place where you can **swap in different behaviour without editing the code you are testing**.
2. Open the seams with **dependency injection** (pass helpers in through the constructor, as you learnt in SOLID).

## Test doubles: fake helpers for tests

A **test double** is a stand-in used instead of the real helper. (Like a stunt double in a film.) There are five kinds:

| Double | What it does | Example |
|---|---|---|
| **Dummy** | fills a parameter, never really used | a logger that is passed but never called |
| **Stub** | gives **ready-made answers** | a clock that always says 10:00 |
| **Fake** | a **simple but working** version | an in-memory repository instead of SQL |
| **Spy** | **remembers** how it was called, so the test can check later | a mailer that keeps the sent messages |
| **Mock** | knows what it **expects**, and fails if that does not happen | "`send` must be called exactly once with this text" |

Prefer **fakes and stubs**, and check the **result** (state-based testing). Be careful with mocks that check every call, because those tests break whenever you refactor.

## A tiny test runner

You do not need a library to start. Here is a small one. Real projects use GoogleTest, Catch2 or doctest.

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

## Control time

If code calls `system_clock::now()` directly, you cannot test "the session expires after 30 minutes" without waiting 30 minutes. So **pass in a Clock**.

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

The same idea works for random numbers (pass in a `RandomSource` that gives a fixed list), ids (an `IdGenerator`), files and network calls.

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

## What should you test?

| Kind of test | Example |
|---|---|
| **Normal case** | a valid booking works |
| **Edges** | exactly at capacity, zero items, exactly the 15-minute free period |
| **Bad input** | negative amount, unknown id |
| **State changes** | cancelling after shipping is refused |
| **Rules that must always hold** | the total money stays the same after any transfer |
| **Many threads** | N threads try to book the last seat, and exactly one wins |

## Testing threads

Thread bugs depend on timing, so they are hard to test. Some tricks:

1. **Test the logic with one thread first.** Most bugs have nothing to do with threads.
2. **Stress test**: many threads, many repeats, then check the **rules** (no overselling, totals add up). A race may show up only once in 10,000 runs, so repeat a lot.
3. **ThreadSanitizer** (`-fsanitize=thread`) reports races even when the answer looked right.
4. **Control time and scheduling** (a fake clock, an executor that runs tasks when you say), so tests give the same result every time.

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

## Short answer to say in an interview

:::interview How do you make your design testable?
"I pass helpers into classes through the constructor as interfaces, so a test can use a fake or a stub. I pass in the clock, random numbers and id generator instead of calling them directly, and I avoid global state and Singletons. I prefer checking results with fakes over heavy mocking. For threads, I test the logic with one thread, add stress tests that check the rules, and run ThreadSanitizer."
:::

```quiz
? Which test double gives ready-made answers?
- Spy
+ Stub
- Mock
> A stub gives fixed answers. A spy remembers calls. A mock checks expectations.
? Why pass in a Clock instead of calling now()?
- It is faster
+ The test can control time exactly
- Clocks are not thread-safe
> You can move a fake clock forward by 30 minutes instantly.
? What is a seam?
- A bug
+ A place where behaviour can be swapped without editing the code under test
- A mutex
> An interface passed in through the constructor is the usual seam.
```

:::keypoints
- Code that is hard to test usually has hidden helpers. Open seams with dependency injection.
- Doubles: dummy, stub, fake, spy, mock. Prefer fakes and stubs, and check results.
- Pass in time, randomness and ids. Test threads with rule checks, stress tests and ThreadSanitizer.
:::
