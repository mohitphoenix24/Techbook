---
title: Design a URL Shortener (class level)
level: easy
time: 40
summary: The object design behind a short-link service: base-62 ids, custom aliases, expiry with an injected clock, click counters, a repository abstraction, thread-safety, and how the same classes scale into the high-level design.
---

:::problem Design a URL Shortener {level=easy tags="classic,encoding,repository,expiry,counters"}
Design the classes for a URL shortening service like bit.ly. Given a long URL it returns a short code; visiting the short code returns the long URL. Support optional custom aliases, optional expiry, and click statistics. (This is the **low-level** design; the system-design version adds databases, caches and scale.)

:::hint Hint
Generate codes from a **counter** encoded in base 62, so codes are unique without collision checks. Put storage behind an interface. Treat "expired" and "unknown" as different answers.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Code format? | base-62 (`0-9a-zA-Z`); generated from an auto-increment id; custom aliases 4 to 12 chars |
| Same long URL twice? | returns a new code each time (simplest) unless dedupe is requested (extension) |
| Expiry? | optional; expired links return "gone" |
| Stats? | click count per code; last access time |
| Validation? | URL must start with `http://` or `https://`, max 2000 chars |
| Concurrency? | many threads shorten and resolve |
| Out of scope | auth, analytics dashboards, abuse protection |

## Step 2: entities

```viz algo=uml title="URL shortener"
class UrlShortener
  + shorten(url: string, alias: string, ttl: long): Result<string>
  + resolve(code: string): Resolution
  + stats(code: string): LinkStats
class Link
  - code: string
  - longUrl: string
  - createdAt: long
  - expiresAt: long
  - clicks: long
interface LinkRepository
  + save(l: Link): bool
  + find(code: string): Link
class InMemoryLinkRepository
class Base62
  + encode(n: long): string
  + decode(s: string): long
interface IdGenerator
  + next(): long
interface Clock
  + now(): long
UrlShortener --> LinkRepository
UrlShortener --> IdGenerator
UrlShortener --> Clock
UrlShortener ..> Base62
InMemoryLinkRepository ..|> LinkRepository
UrlShortener ..> Link
```

## Step 3: design decisions

- **Counter + base 62**: each new id maps to a unique code, so there are **no collisions** and no retry loops. (`Base62::encode(125) = "21"`.) To avoid guessable sequences you could encode a permuted/shuffled id, or add random padding.
- **Custom aliases** go through the same `save`, which **fails if the code exists** (atomic `insert-if-absent`).
- **Resolution result is an enum + value**: `Found(url)`, `NotFound`, `Expired`. A caller (HTTP layer) maps these to 301, 404, 410.
- **Injectable `Clock` and `IdGenerator`** make tests deterministic.
- **Repository interface** isolates storage: in memory here, SQL/Redis in production.
- **Counters** use `atomic<long>` inside `Link`, so clicks do not need the repository lock.

## Step 4: the code

```cpp run title="URL shortener: shorten, resolve, expire, count"
#include <algorithm>
#include <atomic>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>
using namespace std;

struct Clock { virtual ~Clock() = default; virtual long now() const = 0; };
struct ManualClock : Clock { long t = 1000; long now() const override { return t; } };
struct IdGenerator { virtual ~IdGenerator() = default; virtual long next() = 0; };
class CounterIds : public IdGenerator { atomic<long> n_; public: explicit CounterIds(long start) : n_(start) {} long next() override { return n_++; } };

class Base62 {
    static constexpr const char* kAlphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
public:
    static string encode(long n) {
        if (n == 0) return "0";
        string s;
        while (n > 0) { s += kAlphabet[n % 62]; n /= 62; }
        reverse(s.begin(), s.end());
        return s;
    }
    static long decode(const string& s) {
        long n = 0;
        for (char c : s) n = n * 62 + string(kAlphabet).find(c);
        return n;
    }
};

struct Link {
    string code, longUrl;
    long createdAt, expiresAt;                               // 0 = never expires
    atomic<long> clicks{0};
    atomic<long> lastAccess{0};
    Link(string c, string u, long created, long exp) : code(move(c)), longUrl(move(u)), createdAt(created), expiresAt(exp) {}
};

class LinkRepository {
public:
    virtual ~LinkRepository() = default;
    virtual bool saveIfAbsent(shared_ptr<Link> l) = 0;       // false if the code is taken
    virtual shared_ptr<Link> find(const string& code) const = 0;
};
class InMemoryLinkRepository : public LinkRepository {
    mutable mutex m_;
    map<string, shared_ptr<Link>> links_;
public:
    bool saveIfAbsent(shared_ptr<Link> l) override { lock_guard lock(m_); return links_.emplace(l->code, move(l)).second; }
    shared_ptr<Link> find(const string& code) const override { lock_guard lock(m_); auto it = links_.find(code); return it == links_.end() ? nullptr : it->second; }
};

enum class Status { Found, NotFound, Expired };
struct Resolution { Status status; string url; };

class UrlShortener {
    LinkRepository& repo_; IdGenerator& ids_; const Clock& clock_;
    static bool validUrl(const string& u) { return u.size() <= 2000 && (u.rfind("http://", 0) == 0 || u.rfind("https://", 0) == 0); }
    static bool validAlias(const string& a) { return a.size() >= 4 && a.size() <= 12 && all_of(a.begin(), a.end(), [](char c) { return isalnum(static_cast<unsigned char>(c)); }); }
public:
    UrlShortener(LinkRepository& r, IdGenerator& i, const Clock& c) : repo_(r), ids_(i), clock_(c) {}

    // returns the code, or an error message
    pair<optional<string>, string> shorten(const string& url, const string& alias = "", long ttlSeconds = 0) {
        if (!validUrl(url)) return {nullopt, "invalid URL"};
        if (!alias.empty() && !validAlias(alias)) return {nullopt, "invalid alias (4-12 letters or digits)"};
        long now = clock_.now(), exp = ttlSeconds > 0 ? now + ttlSeconds : 0;
        if (!alias.empty()) {
            if (!repo_.saveIfAbsent(make_shared<Link>(alias, url, now, exp))) return {nullopt, "alias already taken"};
            return {alias, ""};
        }
        for (;;) {                                           // a generated code could (rarely) collide with a custom alias: just take the next id
            string code = Base62::encode(ids_.next());
            if (repo_.saveIfAbsent(make_shared<Link>(code, url, now, exp))) return {code, ""};
        }
    }
    Resolution resolve(const string& code) {
        auto link = repo_.find(code);
        if (!link) return {Status::NotFound, ""};
        long now = clock_.now();
        if (link->expiresAt != 0 && now >= link->expiresAt) return {Status::Expired, ""};
        ++link->clicks;
        link->lastAccess = now;
        return {Status::Found, link->longUrl};
    }
    long clicks(const string& code) const { auto l = repo_.find(code); return l ? l->clicks.load() : -1; }
};

int main() {
    InMemoryLinkRepository repo; CounterIds ids(125); ManualClock clock;
    UrlShortener svc(repo, ids, clock);

    auto a = svc.shorten("https://example.com/a/very/long/path?x=1");
    cout << "short code: " << *a.first << " (id 125 in base 62), decoded back: " << Base62::decode(*a.first) << "\n";
    auto b = svc.shorten("https://example.com/promo", "diwali", 3600);
    cout << "custom alias: " << *b.first << "\n";
    cout << "taken alias: " << svc.shorten("https://other.com", "diwali").second << "\n";
    cout << "bad URL: " << svc.shorten("ftp://nope").second << "\n";

    auto r = svc.resolve(*a.first);
    cout << "resolve -> " << r.url << "\n";
    svc.resolve(*a.first);
    cout << "clicks: " << svc.clicks(*a.first) << "\n";
    cout << "unknown code: " << (svc.resolve("zzzzzz").status == Status::NotFound ? "not found" : "?") << "\n";

    clock.t += 3601;                                         // an hour passes
    cout << "after an hour the alias is " << (svc.resolve("diwali").status == Status::Expired ? "expired" : "still live") << "\n";

    vector<thread> ts; vector<string> codes(8);
    for (int t = 0; t < 8; ++t) ts.emplace_back([&, t] { for (int i = 0; i < 100; ++i) { auto c = svc.shorten("https://example.com/" + to_string(t * 100 + i)); if (i == 0) codes[t] = *c.first; } });
    for (auto& t : ts) t.join();
    sort(codes.begin(), codes.end());
    cout << "800 concurrent shortens; first codes unique: " << boolalpha << (adjacent_find(codes.begin(), codes.end()) == codes.end()) << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Alias equals a generated code later | `saveIfAbsent` fails for the generator, which simply takes the next id |
| Expired vs unknown | different `Status` values so the API returns 410 vs 404 |
| Extremely long or invalid URL | validated before any state changes |
| Click counting under concurrency | `atomic<long>` increments |
| Reusing an id after restart | the generator must persist its counter (or use a DB sequence) |
| Open redirect/abuse | blocklists and rate limits (outside this design) |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Same long URL → same code" | a second index `longUrl → code` in the repository (and decide TTL semantics) |
| "Unguessable codes" | encode a Feistel-permuted id, or random 7-char codes with a retry on collision |
| "Per-user links, delete, update" | `owner` field and ownership checks in the service |
| "Analytics by country/time" | resolve emits a `ClickEvent` to a queue; consumers aggregate (Observer / messaging) |
| "Expiry cleanup" | a background sweeper (or lazy deletion on access) |
| "Scale to billions" | HLD: key-value store, caching, ID ranges per node (the classes stay the same) |

```quiz
? Why generate codes from a counter encoded in base 62?
- Because base 62 is faster than base 10
+ Each id maps to a unique code, so there are no collisions to detect and retry
- To make codes random
> Uniqueness comes from the id.
? Why return different results for "expired" and "unknown"?
- Only to be verbose
+ The caller can respond differently (HTTP 410 Gone vs 404 Not Found)
- Expiry is not supported
> They are different situations with different meanings.
```

:::keypoints
- Counter → base 62 gives unique short codes; custom aliases use an atomic insert-if-absent.
- Repository, Clock and IdGenerator are injected; resolve returns `Found/NotFound/Expired`.
- Atomic counters for clicks; the same classes sit inside the large-scale HLD.
:::
