---
title: Design a URL Shortener (class level)
level: easy
time: 40
summary: The classes behind a short-link service. Learn base-62 ids, custom aliases, expiry with a replaceable clock, click counters, a storage interface, thread safety, and how these classes fit into the bigger system design.
---

:::problem Design a URL Shortener {level=easy tags="classic,encoding,repository,expiry,counters"}
Design the classes for a URL shortening service like bit.ly. Given a long URL, it gives back a short code. Visiting the short code gives back the long URL. Support custom names (aliases), optional expiry, and click counts. (This is the **low-level** design. The system-design version adds databases, caches and scale.)

:::hint Hint
Make codes from a **counter** written in base 62, so every code is unique and you never have to check for clashes. Put storage behind an interface. Treat "expired" and "unknown" as two different answers.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Code format? | base 62 (`0-9a-zA-Z`), made from an increasing id. Custom aliases are 4 to 12 characters |
| The same long URL twice? | gives a new code each time (simplest). Reusing the code is an extension |
| Expiry? | optional. An expired link says "gone" |
| Stats? | a click count for each code, and the last access time |
| Checks? | the URL must start with `http://` or `https://`, and be at most 2000 characters |
| Many threads? | yes, both for shortening and for opening |
| Not needed | login, dashboards, abuse protection |

## Step 2: Find the classes

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

## Step 3: Design decisions

- **Counter plus base 62.** Each new id becomes a unique code, so there are **no clashes** and no retry loops. (`Base62::encode(125) = "21"`.) To make codes hard to guess, you can encode a shuffled id, or add random padding.
- **Custom aliases** use the same `save`, which **fails if the code already exists** (an all-in-one "insert if not present").
- **The result of opening a link is an enum plus a value:** `Found(url)`, `NotFound`, `Expired`. The web layer turns these into 301, 404 and 410.
- **A replaceable `Clock` and `IdGenerator`** make tests predictable.
- **A Repository interface** hides storage: memory here, SQL or Redis in real use.
- **Counters** use `atomic<long>` inside `Link`, so counting clicks does not need the repository's lock.

## Step 4: The code

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

| Case | What happens |
|---|---|
| An alias is the same as a code made later | `saveIfAbsent` fails for the generator, which just takes the next id |
| Expired vs unknown | different `Status` values, so the API answers 410 or 404 |
| A very long or bad URL | checked before anything changes |
| Counting clicks with many threads | `atomic<long>` increments |
| The id repeats after a restart | the generator must save its counter (or use a database sequence) |
| Abuse and open redirects | block lists and rate limits (outside this design) |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "The same long URL gives the same code" | a second index `longUrl to code` in the repository (and decide how expiry works) |
| "Codes that cannot be guessed" | encode a shuffled id, or use random 7-character codes and retry on a clash |
| "Links for each user, delete, update" | an `owner` field and ownership checks in the service |
| "Stats by country and time" | opening a link sends a `ClickEvent` to a queue. Consumers add up the numbers (Observer, messaging) |
| "Clean up expired links" | a background sweeper, or delete when the link is opened |
| "Billions of links" | HLD: a key-value store, caches, id ranges for each machine. The classes stay the same |

## Short answer to say in an interview

:::interview Why do you make short codes from a counter in base 62?
"Every new id gives a different code, so there are no clashes to detect and no retries. Base 62 keeps the code short. If I need codes that cannot be guessed, I can encode a shuffled id. Custom aliases go through an insert-if-absent that fails when the name is taken. Opening a link returns found, not found or expired, so the web layer can answer 301, 404 or 410."
:::

```quiz
? Why make codes from a counter written in base 62?
- Base 62 is faster than base 10
+ Each id gives a unique code, so there are no clashes to find and retry
- To make codes random
> The uniqueness comes from the id.
? Why return different results for "expired" and "unknown"?
- Only to be wordy
+ The caller can answer differently (HTTP 410 Gone or 404 Not Found)
- Expiry is not supported
> They are different situations with different meanings.
```

:::keypoints
- Counter and base 62 give unique short codes. Custom aliases use an atomic insert-if-absent.
- Repository, Clock and IdGenerator are passed in. Opening a link returns `Found`, `NotFound` or `Expired`.
- Atomic counters for clicks. The same classes sit inside the large-scale HLD.
:::
