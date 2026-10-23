---
title: Design a Web Crawler
level: advanced
time: 75
summary: A concurrent crawler with a URL frontier, normalisation and de-duplication, politeness per host with rate limiting, robots rules, depth limits, pluggable fetch and parse stages, a thread-safe termination protocol, and how the design scales into a distributed crawler.
---

:::problem Design a Web Crawler {level=hard tags="concurrency,BFS,rate limiting,pipeline,Strategy,distributed"}
Design a crawler that starts from seed URLs, downloads pages, extracts links and follows them, up to a depth limit. It must not fetch the same page twice, must be polite (limit the request rate per host and obey robots rules), must use many threads for speed, must terminate cleanly when no work remains, and must be easy to extend (different page processors, storage, URL filters).
:::

:::hint Hint
Crawling is **BFS over a graph** (pages = nodes, links = edges), but the graph is discovered on the fly. The **frontier** (queue of URLs to visit) is the heart. Add: canonical URLs, a visited set, per-host politeness, and a rule for when the crawl is *finished*: the queue is empty **and** no worker is still processing a page (which could add more URLs).
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Input/output? | seed URLs in; a set of crawled pages with their links and titles out (via a storage interface) |
| Scope? | follow only same-domain links (a URL filter); depth limit D |
| Duplicates? | never fetch the same canonical URL twice |
| Politeness? | at most one request per host per `delay` (simulated clock) and obey a robots rule (disallowed path prefixes) |
| Concurrency? | N worker threads sharing a frontier |
| Failures? | fetch errors are recorded and optionally retried a limited number of times |
| Termination? | stop when the frontier is empty and no page is in flight; or on a page budget |
| Pluggable parts? | `Fetcher`, `LinkExtractor`, `UrlFilter`, `PageStore`, `RobotsPolicy` |
| Out of scope | real HTTP, JavaScript rendering, content deduplication by simhash (mention) |

## Step 2: the pipeline

```viz algo=seq title="What one worker does for one URL"
participant w Worker [worker]
participant f Frontier [queue]
participant r Robots [shield]
participant p Politeness [clock]
participant fe Fetcher [cloud]
participant x Extractor [filter]
participant s Store [db]
w -> f : next() | Blocks until a URL is available, or the crawl is finished.
f --> w : url (depth d)
w -> r : allowed(url)? | Skip disallowed paths.
w -> p : waitForSlot(host) | Politeness: at most one request per host per delay.
w -> fe : fetch(url)
fe --> w : page (html, status)
w -> x : links(page) | Extract, resolve relative links, normalise.
w -> s : save(url, title, links)
w -> f : add(new URLs, depth d+1) | Filter, de-duplicate with the visited set, respect the depth limit.
```

## Step 3: entities

```viz algo=uml title="Web crawler"
class Crawler
  + crawl(seeds: string[], maxDepth: int): CrawlResult
class Frontier
  - queue: deque<Task>
  - visited: set<string>
  - inFlight: int
  + push(url: string, depth: int): bool
  + pop(): Task
  + done(): void
class UrlNormaliser
  + normalise(url: string, base: string): string
interface Fetcher
  + fetch(url: string): Page
interface LinkExtractor
  + links(html: string): string[]
interface UrlFilter
  + accept(url: string): bool
interface RobotsPolicy
  + allowed(url: string): bool
class PolitenessGate
  + wait(host: string): void
interface PageStore
  + save(p: Page): void
Crawler --> Frontier
Crawler --> Fetcher
Crawler --> LinkExtractor
Crawler --> UrlFilter
Crawler --> RobotsPolicy
Crawler --> PolitenessGate
Crawler --> PageStore
Frontier ..> UrlNormaliser
```

## Step 4: design decisions

- **Frontier = thread-safe BFS queue + visited set.** `push` normalises the URL and inserts it into `visited` **atomically with the enqueue** (one lock), so two workers discovering the same link cannot both enqueue it.
- **Termination detection**: keep a counter `pending` = URLs queued + URLs being processed. A worker increments it when it enqueues a URL and decrements it after finishing a URL (after it has enqueued that page's links). When `pending` reaches 0 the crawl is complete; waiting workers are woken (`notify_all`) and exit. Checking only "queue empty" would end the crawl while another worker is about to add links.
- **Politeness**: per-host "next allowed time" in a map under a mutex. A worker computes its slot (`max(now, next[host])`), reserves it by advancing `next[host] += delay`, then sleeps outside the lock. (Here a simulated clock records the reserved times, so the demo shows spacing without real sleeping.)
- **URL normalisation**: lowercase the scheme and host, drop the fragment (`#...`), resolve relative paths, remove default ports and trailing slashes consistently, sort or drop tracking parameters (policy).
- **Strategy interfaces** for fetcher (real HTTP vs a fake web in tests), extractor, filter, robots, store.
- **Depth** travels with each task: BFS gives the shortest link distance, so depth-limited crawling is natural.
- **Back-pressure**: a bounded frontier size or per-host queues prevent unbounded memory.

## Step 5: the code

```cpp run title="Concurrent crawler over a fake web, with dedup, depth, robots and politeness"
#include <atomic>
#include <condition_variable>
#include <deque>
#include <iostream>
#include <map>
#include <mutex>
#include <set>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
using namespace std;

struct Page { string url; int status; string title; vector<string> rawLinks; };

// ---------- URL helpers ----------
struct UrlParts { string scheme, host, path; };
UrlParts split(const string& url) {
    UrlParts u; size_t s = url.find("://"); u.scheme = url.substr(0, s); size_t h = s + 3, p = url.find('/', h);
    u.host = url.substr(h, p == string::npos ? string::npos : p - h); u.path = p == string::npos ? "/" : url.substr(p);
    return u;
}
string normalise(const string& link, const string& base) {
    string url = link;
    if (url.rfind("http", 0) != 0) {                          // a relative link: resolve against the page's URL
        UrlParts b = split(base);
        if (!url.empty() && url[0] == '/') url = b.scheme + "://" + b.host + url;
        else { string dir = b.path.substr(0, b.path.rfind('/') + 1); url = b.scheme + "://" + b.host + dir + url; }
    }
    if (size_t hash = url.find('#'); hash != string::npos) url.erase(hash);                      // fragments are not different pages
    UrlParts u = split(url);
    for (char& c : u.scheme) c = static_cast<char>(tolower(c));
    for (char& c : u.host) c = static_cast<char>(tolower(c));
    if (u.path.size() > 1 && u.path.back() == '/') u.path.pop_back();                            // /a/ == /a
    return u.scheme + "://" + u.host + u.path;
}

// ---------- pluggable parts ----------
struct Fetcher { virtual ~Fetcher() = default; virtual Page fetch(const string& url) = 0; };
class FakeWeb : public Fetcher {                              // an in-memory "internet"
    map<string, Page> pages_; mutex m_; map<string, int> fetchCount_;
public:
    void add(const string& url, string title, vector<string> links) { pages_[url] = {url, 200, move(title), move(links)}; }
    Page fetch(const string& url) override { { lock_guard l(m_); ++fetchCount_[url]; } auto it = pages_.find(url); return it == pages_.end() ? Page{url, 404, "", {}} : it->second; }
    int timesFetched(const string& url) { lock_guard l(m_); return fetchCount_[url]; }
    int totalFetches() { lock_guard l(m_); int n = 0; for (auto& [u, c] : fetchCount_) n += c; return n; }
};
struct UrlFilter { virtual ~UrlFilter() = default; virtual bool accept(const string& url) const = 0; };
struct SameHostFilter : UrlFilter { string host; explicit SameHostFilter(string h) : host(move(h)) {} bool accept(const string& u) const override { return split(u).host == host; } };
struct RobotsPolicy { virtual ~RobotsPolicy() = default; virtual bool allowed(const string& url) const = 0; };
struct PrefixRobots : RobotsPolicy { vector<string> disallowed; bool allowed(const string& u) const override { string p = split(u).path; for (auto& d : disallowed) if (p.rfind(d, 0) == 0) return false; return true; } };
struct PageStore { virtual ~PageStore() = default; virtual void save(const Page& p, int depth) = 0; };
class MemoryStore : public PageStore {
    mutex m_; map<string, pair<string, int>> pages_;
public:
    void save(const Page& p, int depth) override { lock_guard l(m_); pages_[p.url] = {p.title, depth}; }
    map<string, pair<string, int>> all() { lock_guard l(m_); return pages_; }
};

// ---------- politeness: at most one request per host per `delay` (simulated time) ----------
class PolitenessGate {
    long delay_; map<string, long> nextFree_; mutex m_;
public:
    explicit PolitenessGate(long d) : delay_(d) {}
    long reserve(const string& host, long now) { lock_guard l(m_); long slot = max(now, nextFree_[host]); nextFree_[host] = slot + delay_; return slot; }       // returns the time at which we may fetch
};

// ---------- the frontier ----------
struct Task { string url; int depth; };
class Frontier {
    deque<Task> q_; set<string> visited_; mutex m_; condition_variable cv_; int pending_ = 0;
public:
    bool push(const string& url, int depth) {
        lock_guard l(m_);
        if (!visited_.insert(url).second) return false;       // already seen: never enqueue twice
        q_.push_back({url, depth}); ++pending_; cv_.notify_one();
        return true;
    }
    // blocks until a task is available, or returns false when the crawl is finished
    bool pop(Task& out) {
        unique_lock l(m_);
        cv_.wait(l, [&] { return !q_.empty() || pending_ == 0; });
        if (q_.empty()) return false;
        out = q_.front(); q_.pop_front();
        return true;
    }
    void done() { lock_guard l(m_); if (--pending_ == 0) cv_.notify_all(); }     // called AFTER the page's links were pushed
    size_t seen() { lock_guard l(m_); return visited_.size(); }
};

struct Stats { atomic<int> fetched{0}, skippedRobots{0}, notFound{0}, filtered{0}; };

class Crawler {
    Fetcher& fetcher_; const UrlFilter& filter_; const RobotsPolicy& robots_; PageStore& store_; PolitenessGate& gate_;
public:
    Crawler(Fetcher& f, const UrlFilter& u, const RobotsPolicy& r, PageStore& s, PolitenessGate& g) : fetcher_(f), filter_(u), robots_(r), store_(s), gate_(g) {}

    void crawl(const vector<string>& seeds, int maxDepth, int threads, Stats& stats, map<string, vector<long>>& schedule, mutex& scheduleM) {
        Frontier frontier;
        for (auto& s : seeds) frontier.push(normalise(s, s), 0);
        vector<thread> workers;
        for (int i = 0; i < threads; ++i) workers.emplace_back([&] {
            Task t;
            while (frontier.pop(t)) {
                if (!robots_.allowed(t.url)) ++stats.skippedRobots;
                else {
                    long slot = gate_.reserve(split(t.url).host, 0);                                       // politeness reservation (simulated clock starts at 0)
                    { lock_guard l(scheduleM); schedule[split(t.url).host].push_back(slot); }
                    Page p = fetcher_.fetch(t.url);
                    if (p.status != 200) ++stats.notFound;
                    else {
                        ++stats.fetched; store_.save(p, t.depth);
                        if (t.depth < maxDepth)
                            for (auto& raw : p.rawLinks) { string link = normalise(raw, t.url); if (filter_.accept(link)) frontier.push(link, t.depth + 1); else ++stats.filtered; }
                    }
                }
                frontier.done();                                                                            // finished this URL (its links are already queued)
            }
        });
        for (auto& w : workers) w.join();
    }
};

int main() {
    FakeWeb web;
    const string H = "http://site.test";
    web.add(H + "/", "Home", {"/about", "/blog/", "/blog/post1", "http://other.test/x", "/private/secret"});
    web.add(H + "/about", "About", {"/", "team", "/blog"});                                            // links back to the home page (a cycle), and a relative link
    web.add(H + "/team", "Team", {"/about#members", "/about"});                                       // fragments are the same page
    web.add(H + "/blog", "Blog", {"/blog/post1", "/blog/post2", "/blog/post1/"});                     // trailing slash is the same page
    web.add(H + "/blog/post1", "Post 1", {"/blog/post2", "/missing"});
    web.add(H + "/blog/post2", "Post 2", {"/blog/post3"});
    web.add(H + "/blog/post3", "Post 3", {"/blog/post4"});                                            // deeper than the limit
    web.add(H + "/blog/post4", "Post 4", {});
    web.add(H + "/private/secret", "Secret", {});

    SameHostFilter sameHost("site.test");
    PrefixRobots robots; robots.disallowed = {"/private"};
    MemoryStore store; PolitenessGate gate(2);                // one request per host every 2 time units
    Crawler crawler(web, sameHost, robots, store, gate);
    map<string, vector<long>> schedule; mutex scheduleM;

    Stats s; crawler.crawl({H + "/"}, 3, 4, s, schedule, scheduleM);
    cout << "pages saved (url: title, depth), crawled with 4 threads and depth limit 3:\n";
    for (auto& [url, info] : store.all()) cout << "  " << url << ": " << info.first << " (depth " << info.second << ")\n";
    cout << "fetched ok: " << s.fetched << ", 404s: " << s.notFound << ", blocked by robots: " << s.skippedRobots << ", links filtered out (other hosts): " << s.filtered << "\n";
    cout << "every URL fetched at most once: " << boolalpha << (web.timesFetched(H + "/about") == 1 && web.timesFetched(H + "/blog/post1") == 1 && web.timesFetched(H + "/") == 1) << ", total fetch calls: " << web.totalFetches() << "\n";
    cout << "post4 is beyond the depth limit, so it was not fetched: " << (web.timesFetched(H + "/blog/post4") == 0) << "\n";

    vector<long> slots = schedule["site.test"]; sort(slots.begin(), slots.end());
    cout << "politeness: reserved fetch times for site.test:"; for (long t : slots) cout << " " << t; cout << "  (always at least 2 apart)\n";
}
```

## Why the termination rule is subtle

```text
Worker A: pops the LAST URL in the queue → queue is now empty
Worker B: sees an empty queue ... if B exits now, and A then discovers 20 new links, nobody is left to crawl them!

Correct: B keeps waiting while pending > 0, where `pending` counts queued + in-flight URLs.
         A calls done() only AFTER pushing its page's links, so pending cannot reach 0 too early.
```

## Edge cases

| Case | Handling |
|---|---|
| Cycles in the link graph | the visited set stops repetition |
| Same page under several URLs (`/a`, `/a/`, `/a#x`, `?utm=...`) | normalise before the visited check; canonical `<link rel=canonical>` support |
| Redirect loops | follow at most N redirects; record the final URL |
| Spider traps (calendars with infinite pages) | depth limit, per-host page budget, URL length/pattern limits |
| Slow hosts | per-host queues so one slow host does not block the rest |
| Fetch failures | retry limit with backoff; record the error |
| Large pages | size limit, content-type filter |
| robots.txt | fetch once per host, cache with an expiry, honour `Crawl-delay` |
| Duplicate content | content fingerprint (hash or simhash) to skip near-duplicates |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Prioritise important pages" | a priority frontier (page rank estimate, freshness, depth) instead of FIFO |
| "Recrawl for freshness" | schedule revisits by change frequency (the cron/scheduler lessons) |
| "Store at scale" | a `PageStore` writing to an object store and a link graph database |
| "Memory for billions of URLs" | a Bloom filter for the visited set (rare false positives skip a few pages), persisted frontier on disk |
| "Distributed crawler" | partition URLs by **host hash** across machines so politeness stays local; workers exchange discovered URLs through a message queue; coordination via a shared frontier service |
| "Respect `nofollow`, sitemaps" | extractor and seed sources as strategies |
| "JavaScript-heavy sites" | a headless-browser fetcher behind the same `Fetcher` interface |
| "Monitoring" | counters: pages/second, queue depth, errors by host |

```quiz
? Why is "queue empty" not enough to end the crawl?
- Queues are never empty
+ A worker still processing a page may be about to enqueue new links; the crawl ends only when queued + in-flight work is zero
- It is enough
> The pending counter covers both queued and in-flight URLs.
? Why partition a distributed crawler by host?
- Hosts are random
+ All requests to one host then come from one machine, which keeps politeness and robots handling simple
- To balance by URL length
> Host-level rate limits must be enforced in one place.
```

:::keypoints
- Frontier (BFS queue + atomic visited set), normalisation, depth limit, robots and politeness gates, pluggable fetch/extract/store.
- Termination = queued + in-flight == 0; push links before marking a URL done.
- Scale by partitioning hosts across crawlers, priority frontiers, Bloom filters and content fingerprints.
:::
