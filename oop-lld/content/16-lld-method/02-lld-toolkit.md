---
title: "The LLD toolkit: building blocks you reuse in every problem"
level: intermediate
time: 35
summary: A small set of ready-to-use C++ pieces that almost every LLD problem needs: typed ids, Money, a time range with overlap check, a Result type, a clock and id generator you can replace, and a small event log. Practise them until you can type them without thinking.
---

Almost every LLD problem needs the same few small helper classes. If you already know them by heart, you save about 10 minutes and avoid many bugs. Think of this as your **toolbox**. Practise typing it until it feels easy.

## 1. Typed ids

If every id is just an `int` or a `string`, you can pass a `UserId` where a `BookId` is expected, and the compiler will not complain. A tiny wrapper type fixes this for free.

```cpp run title="Typed ids with a tag"
#include <functional>
#include <iostream>
#include <string>
#include <unordered_map>
using namespace std;

template <typename Tag>
class Id {
    long v_ = 0;
public:
    Id() = default;
    explicit Id(long v) : v_(v) {}
    long value() const { return v_; }
    bool operator==(const Id&) const = default;
    auto operator<=>(const Id&) const = default;
};
template <typename Tag> struct std::hash<Id<Tag>> { size_t operator()(const Id<Tag>& i) const noexcept { return hash<long>{}(i.value()); } };

struct UserTag {}; struct BookTag {};
using UserId = Id<UserTag>;
using BookId = Id<BookTag>;

void lend(UserId u, BookId b) { cout << "user " << u.value() << " borrows book " << b.value() << "\n"; }

int main() {
    unordered_map<UserId, string> names{{UserId(1), "Asha"}};
    lend(UserId(1), BookId(42));
    // lend(BookId(42), UserId(1));       // compile error: arguments swapped
    cout << names.at(UserId(1)) << "\n";
}
```

## 2. Money

**Never use `double` for money.** Computers cannot store numbers like 0.1 exactly, so small errors add up. Store the smallest unit (paise) in an integer, and give only the operations that make sense.

```cpp run title="Money as integer paise"
#include <iostream>
#include <stdexcept>
#include <string>
using namespace std;

class Money {
    long paise_ = 0;
    explicit Money(long p) : paise_(p) {}
public:
    Money() = default;
    static Money rupees(long r, long paise = 0) { return Money(r * 100 + paise); }
    static Money fromPaise(long p) { return Money(p); }
    long paise() const { return paise_; }
    Money operator+(Money o) const { return Money(paise_ + o.paise_); }
    Money operator-(Money o) const { return Money(paise_ - o.paise_); }
    Money operator*(long n) const { return Money(paise_ * n); }
    Money percent(int pct) const { return Money(paise_ * pct / 100); }          // integer maths: no float drift
    bool operator==(const Money&) const = default;
    auto operator<=>(const Money&) const = default;
    string str() const {
        long p = paise_ < 0 ? -paise_ : paise_;
        return string(paise_ < 0 ? "-" : "") + "Rs " + to_string(p / 100) + "." + (p % 100 < 10 ? "0" : "") + to_string(p % 100);
    }
};

int main() {
    Money price = Money::rupees(499, 50);
    Money total = price * 3 - Money::rupees(100).percent(15);
    cout << price.str() << " x3 minus 15% of Rs 100 = " << total.str() << "\n";
    cout << boolalpha << (Money::rupees(1) < Money::fromPaise(150)) << "\n";
}
```

## 3. TimeRange and the overlap check

Booking, scheduling and calendar problems all ask: "do these two time slots clash?" Write it once. Use **half-open** ranges `[start, end)`, which means the end time is **not included**. So a booking that ends at 10:00 and another that starts at 10:00 do **not** clash.

```cpp run title="TimeRange: half-open interval and overlap"
#include <iostream>
#include <stdexcept>
using namespace std;

class TimeRange {
    long start_, end_;                                       // minutes since midnight, or any monotonic unit
public:
    TimeRange(long start, long end) : start_(start), end_(end) {
        if (end <= start) throw invalid_argument("end must be after start");
    }
    long start() const { return start_; }
    long end() const { return end_; }
    long length() const { return end_ - start_; }
    bool overlaps(const TimeRange& o) const { return start_ < o.end_ && o.start_ < end_; }   // THE overlap test
    bool contains(long t) const { return start_ <= t && t < end_; }
};

int main() {
    TimeRange a(9 * 60, 10 * 60), b(10 * 60, 11 * 60), c(9 * 60 + 30, 10 * 60 + 30);
    cout << boolalpha;
    cout << "9-10 vs 10-11 (back to back): " << a.overlaps(b) << "\n";
    cout << "9-10 vs 9:30-10:30:           " << a.overlaps(c) << "\n";
}
```

Remember this one line. It is used in many problems:

**`a.start < b.end && b.start < a.end`**

In words: "A starts before B ends, and B starts before A ends."

## 4. Result: a value or an error

When failure is a **normal outcome** (booking clash, not enough money), return it instead of throwing an error.

```cpp run title="A tiny Result<T> with an error message"
#include <iostream>
#include <string>
#include <utility>
#include <variant>
using namespace std;

template <typename T>
class Result {
    variant<T, string> v_;
    explicit Result(variant<T, string> v) : v_(move(v)) {}
public:
    static Result ok(T value) { return Result(variant<T, string>(in_place_index<0>, move(value))); }
    static Result fail(string why) { return Result(variant<T, string>(in_place_index<1>, move(why))); }
    bool isOk() const { return v_.index() == 0; }
    explicit operator bool() const { return isOk(); }
    const T& value() const { return get<0>(v_); }
    const string& error() const { return get<1>(v_); }
};

Result<int> divide(int a, int b) {
    if (b == 0) return Result<int>::fail("division by zero");
    return Result<int>::ok(a / b);
}

int main() {
    for (int d : {2, 0}) {
        auto r = divide(10, d);
        if (r) cout << "10 / " << d << " = " << r.value() << "\n";
        else cout << "10 / " << d << " failed: " << r.error() << "\n";
    }
}
```

## 5. Clock and IdGenerator (that you can replace)

If your code calls the real clock directly, you cannot test it. So we pass in a `Clock` and an `IdGenerator`. In tests we use fake ones.

```cpp run title="Injectable time and ids"
#include <atomic>
#include <iostream>
#include <string>
using namespace std;

struct Clock { virtual ~Clock() = default; virtual long now() const = 0; };       // minutes, seconds: your choice
struct ManualClock : Clock { long t = 0; long now() const override { return t; } void advance(long d) { t += d; } };

class IdGenerator {
    atomic<long> next_{1};
    string prefix_;
public:
    explicit IdGenerator(string prefix) : prefix_(move(prefix)) {}
    string next() { return prefix_ + "-" + to_string(next_++); }                 // thread-safe, predictable for tests
};

int main() {
    ManualClock clock;
    IdGenerator tickets("TKT");
    string a = tickets.next();
    clock.advance(90);
    string b = tickets.next();
    cout << a << " " << b << " at t=" << clock.now() << "\n";
}
```

## 6. A tiny event log (Observer in a few lines)

Useful for audits, notifications, and for tests that ask "what happened?".

```cpp run title="EventLog: record and replay"
#include <functional>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

class EventLog {
    vector<string> events_;
    vector<function<void(const string&)>> listeners_;
public:
    void subscribe(function<void(const string&)> f) { listeners_.push_back(move(f)); }
    void record(const string& e) { events_.push_back(e); for (auto& l : listeners_) l(e); }
    const vector<string>& all() const { return events_; }
};

int main() {
    EventLog log;
    log.subscribe([](const string& e) { cout << "  [notify] " << e << "\n"; });
    log.record("order placed");
    log.record("payment received");
    cout << log.all().size() << " events recorded\n";
}
```

## All the pieces working together

A small room-booking example using typed ids, `Money`, `TimeRange`, `Result`, a clock and an id generator.

```cpp run title="A room booking kit-in-action"
#include <iostream>
#include <map>
#include <optional>
#include <string>
#include <vector>
using namespace std;

class Money { long p_; public: explicit Money(long p = 0) : p_(p) {} long paise() const { return p_; } Money operator*(long n) const { return Money(p_ * n); } };
class TimeRange {
    long s_, e_;
public:
    TimeRange(long s, long e) : s_(s), e_(e) {}
    bool overlaps(const TimeRange& o) const { return s_ < o.e_ && o.s_ < e_; }
    long length() const { return e_ - s_; }
};
template <typename T> struct Result {
    bool ok; optional<T> value; string error;               // optional: T need not be default-constructible
    static Result good(T v) { return {true, move(v), ""}; }
    static Result bad(string e) { return {false, nullopt, move(e)}; }
};

struct Booking { string id; string room; TimeRange when; Money cost; };

class Bookings {
    vector<Booking> all_;
    int next_ = 1;
    Money hourly_{25000};                                    // Rs 250.00 per hour, in paise
public:
    Result<Booking> book(const string& room, TimeRange when) {
        for (const auto& b : all_)
            if (b.room == room && b.when.overlaps(when)) return Result<Booking>::bad("room " + room + " is already booked then");
        Booking b{"B-" + to_string(next_++), room, when, hourly_ * (when.length() / 60)};
        all_.push_back(b);
        return Result<Booking>::good(b);
    }
};

int main() {
    Bookings svc;
    auto show = [](const Result<Booking>& r) {
        if (r.ok) cout << "  booked " << r.value->id << " cost Rs " << r.value->cost.paise() / 100 << "\n";
        else cout << "  refused: " << r.error << "\n";
    };
    show(svc.book("A1", TimeRange(9 * 60, 11 * 60)));
    show(svc.book("A1", TimeRange(10 * 60, 12 * 60)));       // overlaps
    show(svc.book("A1", TimeRange(11 * 60, 12 * 60)));       // back to back: fine
    show(svc.book("B2", TimeRange(10 * 60, 11 * 60)));       // another room
}
```

:::tip Do not build the whole toolbox every time
In an interview, write only the pieces the problem needs. Money for a payment problem, TimeRange for a booking problem. Say "I would use a typed id here" and show it once. The toolbox is a **vocabulary**, not code to paste everywhere.
:::

## Short answer to say in an interview

:::interview Why do you store money as an integer?
"Floating-point numbers cannot store decimal values like 0.10 exactly, so sums slowly drift. I store the smallest unit, like paise, in an integer. Then the arithmetic is exact, and I can wrap it in a small Money type that allows only sensible operations."
:::

```quiz
? Why store money as integer paise?
- Integers print nicer
+ Floating-point cannot store decimal fractions exactly, so sums drift
- It uses less memory
> Integer arithmetic is exact.
? What is the overlap test for half-open ranges?
- a.start == b.start
+ a.start < b.end && b.start < a.end
- a.end == b.start
> Ranges that touch at the end (end == start) do not overlap.
? Why pass in a Clock?
- Faster code
+ Tests can control time, and the results are the same every run
- C++ requires it
> A manual clock lets you test expiry without waiting.
```

:::keypoints
- The toolbox: typed `Id<Tag>`, `Money` in paise, `TimeRange` with `a.start < b.end && b.start < a.end`, `Result<T>`, replaceable `Clock` and `IdGenerator`, and an `EventLog`.
- Use only what the problem needs, and name each piece as you use it.
- Typed values turn many bugs into compile errors.
:::
