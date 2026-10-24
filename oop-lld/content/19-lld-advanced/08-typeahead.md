---
title: Design Search Autocomplete (Typeahead)
level: advanced
time: 65
summary: The suggestion box that appears while you type. Learn a trie, how to keep the best k suggestions at each node so answers are fast, how to update counts, how to rank in different ways, how to make it safe for many threads, and how it works at a big scale.
---

:::problem Design a Typeahead / Search Autocomplete System {level=hard tags="trie,data structures,ranking,top-k,Strategy,concurrency"}
Design the suggestion box that appears while a user types a search. For a prefix (the first letters), return the **top k** most useful completions (for example k = 5) very quickly. The ranking is mainly by popularity (how often a query is searched), but it must be changeable (recent searches, personal results). New searches update the popularity. The design must handle a lot of reading and updates at the same time.
:::

:::hint Hint
A **trie** (a tree of letters) maps every prefix to a node. To make queries fast, store at each node the **top-k completions of everything below it**, worked out in advance. Then a query is just "walk down the prefix and return the list at that node". The cost moves to the update: when a query's count changes, refresh the lists along its path.
:::

## What is a trie?

A trie is a tree where each step down is one letter. The words "tea", "tree" and "trie" share the start "t" and some share "tr". The path from the root to a node spells a prefix.

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Speed? | a few milliseconds: walk the prefix and return k strings |
| Data? | millions of queries with counts. Lowercase letters and spaces (cleaned up first) |
| Results? | the top k (default 5) by score. Ties are broken alphabetically |
| Updates? | `record(query)` adds to the count. Suggestions show it (at once, or after a short delay) |
| Ranking? | popularity. A strategy interface for others (recent, personal) |
| Typos? | not needed (we mention edit distance and sound-alike matching as extensions) |
| Many threads? | mostly reads, with occasional writes |
| Memory? | trie nodes are costly. In real use, compress (a radix tree) or split by prefix |

## Step 2: How it works

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

Without the saved lists, a query would have to **scan the whole subtree** and sort it. That is far too slow for popular short prefixes like "a" or "s".

## Step 3: Find the classes

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

## Step 4: Design decisions

- **A trie with the top-k saved at each node.** A node's `top` holds up to K suggestions (word, score), sorted by score high first, then text.
- **Update path:** `record(word)` adds to the word's score. Then it walks the path **from the root to the end of the word**, and at every node on the path it updates `top`: insert or raise the word and sort again (K is small, so O(K log K) for each node, and O(L · K log K) for one update, where L is the word length).
- **Read path:** clean up the prefix, walk down (O(L)), and return `top`. **No lock is needed for the walk if the structure never changes in a version** (see "scale" below). Otherwise use a shared lock.
- **The ranker is a Strategy.** The saved lists are in *popularity* order. A different ranker (personal, recent) re-ranks a bigger set of candidates: take the top 3k by popularity from the trie, re-rank with the strategy, and cut to k. This keeps the trie simple and the rule easy to swap.
- **Threads:** a `shared_mutex` on the trie (many readers, one writer). Better at a big scale: **batch the updates.** Collect counts in a log, and now and then build a fresh trie (or apply the batch under one write lock), and then swap an unchangeable snapshot with an atomic pointer swap, so readers never wait.
- **Cleaning up input:** lowercase, join repeated spaces, trim.
- **Memory:** a node's `top` keeps words by **id or pointer** into a word table, instead of copying strings.

## Step 5: The code

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

## Cost

| Action | Cost |
|---|---|
| `suggest(prefix)` | O(L) to walk, plus O(k) to copy. It does not depend on how many words share the prefix |
| `record(word)` (update) | O(L · K log K): refresh the top-K at each node on the path (K is small) |
| Memory | O(total letters × branching), plus K entries for each node. Compress with a radix tree |

## Edge cases

| Case | What happens |
|---|---|
| An empty prefix | return the overall top-k (the root's list) |
| A prefix that does not exist | an empty result |
| Capital letters and extra spaces | cleaned up before looking up |
| Ties | broken alphabetically for a steady output |
| A word in the top-K whose score drops (decay) | work out that node's list again from its children when needed |
| Very frequent updates | batch them: apply counts in bulk and rebuild offline |
| Offensive or blocked queries | a filter (Chain of Responsibility) when returning results |
| Unicode | normalise to NFC and use code points, or a byte-wise trie with UTF-8 |

## Making it big (the HLD view)

| Worry | Approach |
|---|---|
| Millions of queries every second | serve from memory. Split the trie by first letters or by a hash of the prefix |
| Updates | **log the queries**, add up counts in batches (every hour or day), build a new trie **offline**, and swap it in at once (snapshots that never change). Readers never lock |
| Fresh results | a small "trending" structure for the last few minutes, joined when reading |
| Caching | cache popular prefixes (`a`, `s`, `th`) at the edge. The answer changes slowly |
| Personal results | join the global results with the user's recent searches (a ranker) |
| Typos | fuzzy search with edit distance over candidates, or n-gram indexes |
| Memory | a radix tree, words stored once in an array, nodes keep indexes |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Popularity that fades with time" | keep (score, last update time) and fade it when reading: `score * 2^(-Δt/halfLife)` |
| "Many words and matches in the middle of a word" | an inverted index of n-grams or tokens next to the trie |
| "Other languages, emoji" | cleaning up input and a trie on code points |
| "Delete or ban a query" | remove it from the counts and refresh the top-k lists on its path |
| "Trending now" | a counter over a sliding window (a count-min sketch) for the last N minutes |
| "Test different rankers" | choose a `Ranker` for each request by an experiment id |
| "No delay on mobile" | send a small trie to the phone |

## Short answer to say in an interview

:::interview How do you make autocomplete fast?
"I use a trie, and at every node I save the top k completions of its whole subtree. A query walks down the prefix, which is O(length), and returns that node's list. It does not matter how many words share the prefix. The cost moves to updates: when a count changes, I refresh the lists on the path from the root to that word. At a big scale, I log queries, build a new trie offline in batches, and swap it in as an unchangeable snapshot, so readers never lock. For personal ranking I fetch more candidates than k and re-rank them with a strategy."
:::

```quiz
? Why store the top-k list at every trie node?
- To save memory
+ A query walks the prefix and returns a ready list, instead of scanning the whole subtree
- Tries require it
> It trades extra work at update time and more memory for very fast reads.
? How do you add personal ranking without changing the trie?
- Build a trie for each user
+ Fetch more candidates than k from the trie and re-rank them with a Ranker strategy
- Sort the dictionary
> The trie gives the candidates. The strategy decides the final order.
```

:::keypoints
- A trie where each node saves the top-k of its subtree. Reads are O(prefix length). Writes refresh the path.
- Ranking is a strategy applied to a bigger candidate list. Use a shared lock for readers and one writer.
- At a big scale: batch counting, snapshots swapped at once, caches for popular prefixes, radix compression.
:::
