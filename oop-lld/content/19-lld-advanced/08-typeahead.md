---
title: Design Search Autocomplete (Typeahead)
level: advanced
time: 65
summary: A trie that returns the top-k completions for a prefix, precomputed top-k lists at each node for O(prefix length) queries, frequency updates and decay, ranking strategies and personalisation, a thread-safe design with readers-writer locking, and the batch-rebuild approach used at scale.
---

:::problem Design a Typeahead / Search Autocomplete System {level=hard tags="trie,data structures,ranking,top-k,Strategy,concurrency"}
Design the suggestion box that appears while a user types a search. For a prefix, return the **top k** most relevant completions (for example k = 5) quickly. The ranking is mainly by popularity (how often queries are searched), but must be changeable (recency, personalisation). New searches update the popularity. The design must handle heavy read traffic and concurrent updates.
:::

:::hint Hint
A **trie** maps every prefix to a node. To make queries fast, store at each node the **top-k completions of its subtree** (precomputed), so a query is "walk the prefix, return the node's list". The price is paid at update time: when a query's count changes, refresh the top-k lists along its path.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Latency? | a few milliseconds; the prefix walk plus returning k strings |
| Data? | millions of queries with counts; lowercase ASCII/Unicode letters and spaces (normalised) |
| Results? | top k (default 5) by score, ties by alphabetical |
| Updates? | `record(query)` increments the count; suggestions reflect it (immediately, or after a short delay) |
| Ranking? | popularity; strategy interface for others (recency-weighted, personalised) |
| Typos? | out of scope (mention edit-distance and phonetic matching as extensions) |
| Concurrency? | reads dominate; writes occasional |
| Memory? | trie nodes are expensive; compress (radix tree) or shard by prefix in production |

## Step 2: how it works

```text
queries: "tree"(5)  "trie"(8)  "trip"(3)  "tea"(10)

                    root
                     │ t
                    (t) top2: tea10, trie8
               ┌──────┴───────┐
             e│               │r
            (te) tea10       (tr) top2: trie8, tree5
             │ a           ┌───┴────┐
           (tea)*10      i│        │e
                       (tri) trie8, trip3   (tre) tree5
                       ┌──┴──┐             │ e
                     e│     │p           (tree)*5
                   (trie)*8 (trip)*3

autocomplete("tr") → walk t, r → node (tr).top = [trie 8, tree 5]      (no subtree scan!)
```

Without the cached lists, the query would have to **scan the whole subtree** and sort: far too slow for popular short prefixes ("a", "s").

## Step 3: entities

```viz algo=uml title="Typeahead"
class AutocompleteService
  + suggest(prefix: string, k: int, user: string): string[]
  + record(query: string, user: string): void
class Trie
  - root: Node
  + insert(word: string, score: long): void
  + find(prefix: string): Node
class Node
  - children: map<char, Node>
  - isWord: bool
  - score: long
  - top: Suggestion[]
class Suggestion
  - text: string
  - score: long
interface Ranker
  + score(s: Suggestion, ctx: Context): double
class PopularityRanker
class RecencyRanker
class PersonalisedRanker
class QueryLog
  + record(q: string): void
AutocompleteService --> Trie
AutocompleteService --> Ranker
Trie *-- Node
Node o-- Suggestion
PopularityRanker ..|> Ranker
RecencyRanker ..|> Ranker
PersonalisedRanker ..|> Ranker
AutocompleteService ..> QueryLog
```

## Step 4: design decisions

- **Trie with cached top-k at each node**. A node's `top` holds up to K suggestions (word, score), sorted by score desc then text asc.
- **Update path**: `record(word)` increments the word's score, then walks the path **root → word end**, and for every node on the path updates `top`: insert or bump the word and re-sort (K is small, so O(K log K) per node, O(L · K log K) per update, L = word length).
- **Read path**: normalise the prefix, walk down (O(L)), return `top`. **No locks needed for the walk if the structure is immutable per version** (see "scale" below), otherwise a shared lock.
- **Ranker as a Strategy**: the cached lists contain *popularity* order. A different ranker (personalised, recency) re-ranks a larger candidate set: fetch the top 3k by popularity from the trie, re-rank with the strategy, cut to k. This keeps the trie simple and the policy replaceable.
- **Thread-safety**: `shared_mutex` on the trie (many readers, one writer). Better at scale: **batch updates**: collect counts in a log, and periodically build a fresh trie (or apply the batch under one write lock), then swap an immutable snapshot with an atomic pointer swap (readers never block).
- **Normalisation**: lowercase, collapse spaces, trim.
- **Memory**: a node's `top` stores words by **id/pointer** into a word table instead of copying strings.

## Step 5: the code

```cpp run title="Trie with cached top-k, updates and a pluggable ranker"
#include <algorithm>
#include <cctype>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>
using namespace std;

struct Suggestion { string text; long score; };
bool better(const Suggestion& a, const Suggestion& b) { return a.score != b.score ? a.score > b.score : a.text < b.text; }

class Trie {
    static constexpr size_t K = 5;                            // cached suggestions per node
    struct Node { map<char, unique_ptr<Node>> next; vector<Suggestion> top; };
    Node root_;
    unordered_map<string, long> counts_;
    static void offer(vector<Suggestion>& top, const string& word, long score) {
        auto it = find_if(top.begin(), top.end(), [&](const Suggestion& s) { return s.text == word; });
        if (it != top.end()) it->score = score; else top.push_back({word, score});
        sort(top.begin(), top.end(), better);
        if (top.size() > K) top.resize(K);                    // keep only the best K
    }
public:
    void add(const string& word, long delta = 1) {            // insert or bump a word, refreshing the path
        long score = counts_[word] += delta;
        Node* n = &root_;
        offer(n->top, word, score);
        for (char c : word) {
            auto& child = n->next[c];
            if (!child) child = make_unique<Node>();
            n = child.get();
            offer(n->top, word, score);                       // every prefix node learns the new score
        }
    }
    vector<Suggestion> suggest(const string& prefix, size_t k) const {
        const Node* n = &root_;
        for (char c : prefix) { auto it = n->next.find(c); if (it == n->next.end()) return {}; n = it->second.get(); }
        vector<Suggestion> out = n->top;
        if (out.size() > k) out.resize(k);
        return out;
    }
    long countOf(const string& w) const { auto it = counts_.find(w); return it == counts_.end() ? 0 : it->second; }
    size_t words() const { return counts_.size(); }
};

string normalise(const string& s) {
    string out; bool lastSpace = true;
    for (char c : s) { if (isspace(static_cast<unsigned char>(c))) { if (!lastSpace) out += ' '; lastSpace = true; } else { out += static_cast<char>(tolower(static_cast<unsigned char>(c))); lastSpace = false; } }
    if (!out.empty() && out.back() == ' ') out.pop_back();
    return out;
}

struct Ranker { virtual ~Ranker() = default; virtual double score(const Suggestion& s, const string& user) const = 0; };
struct PopularityRanker : Ranker { double score(const Suggestion& s, const string&) const override { return static_cast<double>(s.score); } };
class PersonalisedRanker : public Ranker {                    // boosts queries this user searched before
    map<string, map<string, int>> history_;
public:
    void record(const string& user, const string& q) { ++history_[user][q]; }
    double score(const Suggestion& s, const string& user) const override {
        double boost = 0;
        auto u = history_.find(user);
        if (u != history_.end()) { auto q = u->second.find(s.text); if (q != u->second.end()) boost = 1000.0 * q->second; }
        return static_cast<double>(s.score) + boost;
    }
    friend class AutocompleteService;
};

class AutocompleteService {
    Trie trie_; mutable shared_mutex m_; const Ranker& ranker_; PersonalisedRanker* personal_;
public:
    AutocompleteService(const Ranker& r, PersonalisedRanker* p = nullptr) : ranker_(r), personal_(p) {}
    void record(const string& query, const string& user = "") {
        string q = normalise(query); if (q.empty()) return;
        { unique_lock l(m_); trie_.add(q); }
        if (personal_ && !user.empty()) personal_->record(user, q);
    }
    vector<string> suggest(const string& prefix, size_t k, const string& user = "") const {
        string p = normalise(prefix);
        vector<Suggestion> cands;
        { shared_lock l(m_); cands = trie_.suggest(p, 3 * k); }                         // over-fetch candidates, then re-rank with the strategy
        stable_sort(cands.begin(), cands.end(), [&](const Suggestion& a, const Suggestion& b) { return ranker_.score(a, user) > ranker_.score(b, user); });
        vector<string> out; for (auto& s : cands) { if (out.size() == k) break; out.push_back(s.text); }
        return out;
    }
    size_t words() const { shared_lock l(m_); return trie_.words(); }
};

void show(const char* label, const vector<string>& v) { cout << "  " << label << ":"; for (auto& s : v) cout << " [" << s << "]"; if (v.empty()) cout << " (none)"; cout << "\n"; }

int main() {
    PopularityRanker popularity;
    AutocompleteService svc(popularity);
    for (auto [q, n] : vector<pair<string, int>>{{"tea", 10}, {"trie", 8}, {"tree", 5}, {"trip", 3}, {"travel", 7}, {"train timetable", 9}, {"tree house", 2}, {"tv", 6}})
        for (int i = 0; i < n; ++i) svc.record(q);

    show("suggest 't'  (k=3)", svc.suggest("t", 3));
    show("suggest 'tr' (k=3)", svc.suggest("tr", 3));
    show("suggest 'tri'", svc.suggest("tri", 5));
    show("suggest 'tree'", svc.suggest("tree", 5));
    show("suggest 'zzz'", svc.suggest("zzz", 5));
    show("normalised input '  TR  '", svc.suggest("  TR  ", 2));

    cout << "after 'trip' becomes popular (6 more searches):\n";
    for (int i = 0; i < 6; ++i) svc.record("trip");
    show("suggest 'tr' (k=3)", svc.suggest("tr", 3));

    cout << "personalisation: ravi keeps searching 'tree house'\n";
    PersonalisedRanker personal;
    AutocompleteService p2(personal, &personal);
    for (auto [q, n] : vector<pair<string, int>>{{"tree", 5}, {"trie", 8}, {"tree house", 2}})
        for (int i = 0; i < n; ++i) p2.record(q);              // global counts (anonymous)
    p2.record("tree house", "ravi");
    show("anonymous, 'tre'", p2.suggest("tre", 3));
    show("ravi, 'tre'", p2.suggest("tre", 3, "ravi"));

    cout << "threads: 4 writers x 500 searches while 4 readers query\n";
    AutocompleteService busy(popularity);
    vector<thread> ts; atomic<int> reads{0};
    for (int w = 0; w < 4; ++w) ts.emplace_back([&, w] { for (int i = 0; i < 500; ++i) busy.record("query" + to_string((w * 7 + i) % 40)); });
    for (int r = 0; r < 4; ++r) ts.emplace_back([&] { for (int i = 0; i < 500; ++i) { auto v = busy.suggest("query", 5); reads += v.size() <= 5 ? 1 : 0; } });
    for (auto& t : ts) t.join();
    cout << "  distinct queries: " << busy.words() << " (expected 40), all reads returned at most k results: " << boolalpha << (reads == 2000) << "\n";
}
```

## Complexity

| Operation | Cost |
|---|---|
| `suggest(prefix)` | O(L) to walk + O(k) to copy: independent of how many words share the prefix |
| `record(word)` (update) | O(L · K log K): refresh the top-K at each node on the path (K small) |
| Memory | O(total characters · branching) plus K entries per node; compress with a radix tree |

## Edge cases

| Case | Handling |
|---|---|
| Empty prefix | return global top-k (the root's list) |
| Prefix not present | empty result |
| Uppercase and extra spaces | normalised before lookup |
| Ties | broken alphabetically for stable output |
| A word in the top-K whose score drops (decay) | recompute that node's list from its children when needed |
| Very frequent updates | batch them: apply counts in bulk and rebuild offline |
| Offensive or blocked queries | a filter (Chain of Responsibility) when returning results |
| Unicode | normalise to NFC and use code points or a byte-wise trie with UTF-8 |

## Scaling it up (the HLD view)

| Concern | Approach |
|---|---|
| Millions of queries/second | serve from memory; shard the trie by first letters or hash of prefix |
| Updates | **log queries**, aggregate counts in batches (hourly/daily), build a new trie **offline** and swap it in atomically (immutable snapshots): readers never lock |
| Freshness | a small "trending" structure for the last few minutes, merged at read time |
| Caching | cache hot prefixes (`a`, `s`, `th`) at the edge; the answer changes slowly |
| Personalisation | merge global results with the user's recent searches (a ranker) |
| Typos | fuzzy search with edit distance over candidates, or n-gram indexes |
| Memory | radix tree, store words once in an array, nodes keep indexes |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Time-decayed popularity" | store (score, last update) and decay lazily at read: `score * 2^(-Δt/halfLife)` |
| "Multi-word queries and mid-word matches" | an inverted index of n-grams or tokens next to the trie |
| "Language support, emoji" | normalisation and a code-point trie |
| "Deleting or banning a query" | remove from counts and refresh the path's top-k lists |
| "Trending now" | a sliding-window counter (count-min sketch) for the last N minutes |
| "A/B test rankers" | `Ranker` selected per request by an experiment id |
| "Zero-latency mobile" | ship a compact trie to the client |

```quiz
? Why store the top-k list at every trie node?
- To save memory
+ So a query is answered by walking the prefix and returning a precomputed list, instead of scanning the whole subtree
- Because tries require it
> It trades update cost and memory for very fast reads.
? How do you add personalised ranking without changing the trie?
- Build a trie per user
+ Fetch more candidates than k from the trie and re-rank them with a Ranker strategy
- Sort the dictionary
> The trie provides candidates; the strategy decides the final order.
```

:::keypoints
- Trie where each node caches its subtree's top-k: reads are O(prefix length), writes refresh the path.
- Ranking is a strategy applied to an over-fetched candidate list; use a shared lock for readers and one writer.
- At scale: batch aggregation, immutable snapshots swapped atomically, hot-prefix caches, radix compression.
:::
