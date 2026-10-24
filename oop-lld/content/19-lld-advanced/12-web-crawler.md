---
title: Design a Web Crawler
level: advanced
time: 75
summary: A program that visits web pages and follows links. Learn the queue of URLs to visit, cleaning URLs and skipping repeats, being polite to each website, robots rules, depth limits, swappable parts, how to know when the crawl is finished, and how it grows into a crawler on many machines.
---

:::problem Design a Web Crawler {level=hard tags="concurrency,BFS,rate limiting,pipeline,Strategy,distributed"}
Design a crawler that starts from some seed URLs, downloads pages, takes out the links and follows them, down to a depth limit. It must not fetch the same page twice, must be polite (limit the request rate for each website and follow robots rules), must use many threads for speed, must stop cleanly when no work is left, and must be easy to extend (different page handlers, storage, URL filters).
:::

:::hint Hint
Crawling is **BFS over a graph** (pages are nodes, links are edges), but you find the graph while walking it. The **frontier** (the queue of URLs to visit) is the heart. Add: clean URLs, a set of visited URLs, politeness for each host, and a rule for when the crawl is *finished*: the queue is empty **and** no worker is still busy with a page (which could add more URLs).
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Input and output? | seed URLs go in. A set of crawled pages with their links and titles comes out (through a storage interface) |
| Which links? | follow only links on the same website (a URL filter). A depth limit D |
| Repeats? | never fetch the same clean URL twice |
| Politeness? | at most one request to a host for each `delay` (a pretend clock), and follow a robots rule (path prefixes that are not allowed) |
| Many threads? | N worker threads share one frontier |
| Failures? | fetch errors are recorded, and can be retried a few times |
| When to stop? | when the frontier is empty and no page is being worked on. Or when a page limit is reached |
| Swappable parts? | `Fetcher`, `LinkExtractor`, `UrlFilter`, `PageStore`, `RobotsPolicy` |
| Not needed | real HTTP, JavaScript pages, finding near-duplicate content (we mention it) |

## Step 2: The pipeline

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

## Step 3: Find the classes

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

## Step 4: Design decisions

- **The frontier = a thread-safe BFS queue + a set of visited URLs.** `push` cleans the URL and adds it to `visited` **in the same step as adding to the queue** (one lock). So two workers who find the same link cannot both add it.
- **Knowing when to stop:** keep a counter `pending` = URLs in the queue + URLs being worked on. A worker adds 1 when it puts a URL in the queue, and subtracts 1 after it finishes a URL (after it has put that page's links in the queue). When `pending` becomes 0, the crawl is done. The waiting workers are woken (`notify_all`) and leave. If we only checked "queue is empty", the crawl could stop while another worker is about to add links.
- **Politeness:** a map of "next allowed time" for each host, under a mutex. A worker finds its slot (`max(now, next[host])`), reserves it by moving `next[host] += delay`, and then waits outside the lock. (Here, a pretend clock records the reserved times, so the demo shows the spacing without real waiting.)
- **Cleaning URLs:** lowercase the scheme and host, drop the fragment (`#...`), resolve relative paths, remove default ports and trailing slashes in one way, and drop or sort tracking parameters (a policy).
- **Strategy interfaces** for the fetcher (real HTTP, or a fake web in tests), extractor, filter, robots and store.
- **Depth** travels with each task. BFS gives the shortest link distance, so a depth limit is natural.
- **Back-pressure:** a limited frontier size, or a queue for each host, stops memory from growing without limit.

## Step 5: The code

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

## Why the stop rule is tricky

```text
Worker A: pops the LAST URL in the queue → queue is now empty
Worker B: sees an empty queue ... if B exits now, and A then discovers 20 new links, nobody is left to crawl them!

Correct: B keeps waiting while pending > 0, where `pending` counts queued + in-flight URLs.
         A calls done() only AFTER pushing its page's links, so pending cannot reach 0 too early.
```

## Edge cases

| Case | What happens |
|---|---|
| Loops in the links | the visited set stops the repeats |
| One page under many URLs (`/a`, `/a/`, `/a#x`, `?utm=...`) | clean the URL before the visited check. Support the canonical `<link rel=canonical>` |
| Redirect loops | follow at most N redirects. Record the final URL |
| Spider traps (a calendar with endless pages) | a depth limit, a page limit for each host, limits on URL length and patterns |
| Slow websites | a queue for each host, so one slow host does not block the others |
| Fetch failures | a retry limit with waiting time. Record the error |
| Huge pages | a size limit and a content-type filter |
| robots.txt | fetch it once for each host, keep it for a while, and follow `Crawl-delay` |
| The same content on different pages | a fingerprint of the content (hash or simhash) to skip near-duplicates |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Visit the important pages first" | a priority frontier (a page-rank estimate, freshness, depth) instead of first-in-first-out |
| "Visit again to stay fresh" | schedule revisits by how often a page changes (the cron and scheduler lessons) |
| "Store at a big scale" | a `PageStore` that writes to an object store and a link graph database |
| "Memory for billions of URLs" | a Bloom filter for the visited set (a rare false yes skips a few pages), and a frontier saved on disk |
| "A crawler on many machines" | split URLs by a **hash of the host** over the machines, so politeness stays in one place. Workers pass new URLs through a message queue. A shared frontier service coordinates |
| "Follow `nofollow`, sitemaps" | the extractor and the seed sources are strategies |
| "Pages that need JavaScript" | a headless-browser fetcher behind the same `Fetcher` interface |
| "Watching it" | counters: pages per second, queue size, errors for each host |

## Short answer to say in an interview

:::interview How does a web crawler know when it is finished?
"The queue being empty is not enough, because a worker that is still working on a page may be about to add new links. So I keep a pending counter that counts URLs in the queue plus URLs being processed. A worker adds one when it queues a URL, and subtracts one after it finishes a URL, and only after it has queued that page's links. When pending reaches zero, the crawl is finished, and the waiting workers are woken up to leave. The visited set is updated in the same locked step as adding to the queue, so no page is queued twice."
:::

```quiz
? Why is "queue empty" not enough to end the crawl?
- Queues are never empty
+ A worker still working on a page may be about to add new links. The crawl ends only when queued plus in-progress work is zero
- It is enough
> The pending counter covers both queued and in-progress URLs.
? Why split a crawler on many machines by host?
- Hosts are random
+ All requests to one host then come from one machine, so politeness and robots rules stay simple
- To balance by URL length
> Rate limits for a host must be kept in one place.
```

:::keypoints
- A frontier (a BFS queue and an atomic visited set), URL cleaning, a depth limit, robots and politeness gates, and swappable fetch, extract and store parts.
- Stop when queued plus in-progress equals 0. Add a page's links before marking its URL done.
- To scale: split hosts over crawlers, use priority frontiers, Bloom filters and content fingerprints.
:::
