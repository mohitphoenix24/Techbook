---
title: Build a Search Engine
level: intermediate
time: 60
icon: sort
cover: #4f46e5,#14b8a6
tags: inverted index, BM25, phrase queries, sharding, scatter-gather
summary: Build the core of Elasticsearch and Lucene in C++ — tokenizing, a positional inverted index, AND and phrase queries by intersecting postings, then BM25 relevance ranking and a sharded index with scatter-gather top-k merging, showing how shard-local statistics distort rankings and how global statistics fix them.
---

"Add search" appears in many designs, usually as "put Elasticsearch behind a CDC pipeline". Underneath is a beautifully simple structure, the **inverted index**, plus a ranking formula and a distributed query pattern. You'll build all three and discover a subtle bug that bites real clusters.

:::flow What you'll build
Tokenizer | lowercase, split, drop stop words
Inverted index | term → (doc, positions) postings
Queries | AND by intersection; phrases by positions
BM25 | rank by term frequency, rarity and length
Shards | scatter the query, gather and merge top-k
Global stats | make scores comparable across shards
:::

## Step 1: an inverted index with positions

For each term, store the sorted list of documents containing it (the **postings**) and the positions inside each document. An AND query intersects postings (rarest term first: smallest list); a phrase query also checks that positions are consecutive.

```cpp run title="Inverted index, AND queries and phrase queries"
// Step 1: an inverted index with positions — AND queries and phrase queries
#include <bits/stdc++.h>
using namespace std;

vector<string> tokenize(const string& text) {           // lowercase words; drop very common words
    static const set<string> stop = {"a", "an", "the", "of", "to", "and", "in", "is", "for", "on", "with", "by", "it"};
    vector<string> out; string w;
    for (char c : text + " ") {
        if (isalnum((unsigned char)c)) w += tolower((unsigned char)c);
        else { if (!w.empty() && !stop.count(w)) out.push_back(w); w.clear(); }
    }
    return out;
}

struct Posting { int doc; vector<int> positions; };

class Index {
public:
    vector<string> docs;
    map<string, vector<Posting>> postings;               // term → postings sorted by doc id
    void add(const string& text) {
        int id = docs.size(); docs.push_back(text);
        auto toks = tokenize(text);
        for (int pos = 0; pos < (int)toks.size(); pos++) {
            auto& list = postings[toks[pos]];
            if (list.empty() || list.back().doc != id) list.push_back({id, {}});
            list.back().positions.push_back(pos);
        }
    }
    vector<int> all(const string& query) const {         // AND: intersect postings, rarest term first
        auto terms = tokenize(query);
        vector<const vector<Posting>*> lists;
        for (auto& t : terms) { auto it = postings.find(t); if (it == postings.end()) return {}; lists.push_back(&it->second); }
        sort(lists.begin(), lists.end(), [](auto a, auto b) { return a->size() < b->size(); });
        vector<int> result;
        for (auto& p : *lists[0]) result.push_back(p.doc);
        for (size_t i = 1; i < lists.size(); i++) {
            vector<int> next, other;
            for (auto& p : *lists[i]) other.push_back(p.doc);
            set_intersection(result.begin(), result.end(), other.begin(), other.end(), back_inserter(next));
            result = next;
        }
        return result;
    }
    vector<int> phrase(const string& query) const {     // the terms must appear at consecutive positions
        auto terms = tokenize(query);
        vector<int> out;
        for (int doc : all(query)) {
            auto pos = [&](const string& t) { for (auto& p : postings.at(t)) if (p.doc == doc) return p.positions; return vector<int>{}; };
            for (int start : pos(terms[0])) {
                bool ok = true;
                for (size_t k = 1; k < terms.size() && ok; k++) { auto v = pos(terms[k]); ok = binary_search(v.begin(), v.end(), start + (int)k); }
                if (ok) { out.push_back(doc); break; }
            }
        }
        return out;
    }
};

int main() {
    Index idx;
    for (string d : {
        "Consistent hashing spreads keys across cache servers",
        "A load balancer spreads requests across servers",
        "Cache invalidation is hard: keys expire or are evicted",
        "Hashing passwords with a slow hash protects users",
        "The cache servers use consistent hashing for keys",
        "Servers keep a cache of hot keys, not hashing results"}) idx.add(d);

    auto show = [&](const string& label, const vector<int>& ids) {
        cout << label << ":"; for (int id : ids) cout << " [" << id << "]"; cout << (ids.empty() ? " (none)" : "") << "\n";
    };
    cout << "postings for 'cache':"; for (auto& p : idx.postings["cache"]) { cout << " doc" << p.doc << "@"; for (int x : p.positions) cout << x; } cout << "\n";
    show("AND  cache servers         ", idx.all("cache servers"));
    show("AND  hashing keys          ", idx.all("hashing keys"));
    show("PHRASE \"consistent hashing\"", idx.phrase("consistent hashing"));
    show("PHRASE \"cache servers\"     ", idx.phrase("cache servers"));
    show("PHRASE \"servers cache\"     ", idx.phrase("servers cache"));
}
```

## Step 2: ranking and sharding

Matching isn't enough; results must be **ranked**. **BM25** rewards documents that contain a query term often (with diminishing returns), terms that are **rare** in the collection (high IDF), and **shorter** documents. A large index is split into **shards**; a query is sent to all shards, each returns its top-k, and a coordinator merges them. But each shard computes IDF from **its own** documents:

```cpp run title="BM25 on one index vs three shards (local and global IDF)"
// Step 2: BM25 ranking, a sharded index, and why shards need global statistics
#include <bits/stdc++.h>
using namespace std;

vector<string> tokenize(const string& text) {
    static const set<string> stop = {"a", "an", "the", "of", "to", "and", "in", "is", "for", "on", "with", "by", "it", "are", "as", "be", "that", "or"};
    vector<string> out; string w;
    for (char c : text + " ") {
        if (isalnum((unsigned char)c)) w += tolower((unsigned char)c);
        else { if (!w.empty() && !stop.count(w)) out.push_back(w); w.clear(); }
    }
    return out;
}

struct Stats { long docs = 0, totalLen = 0; map<string, long> df; };   // what BM25 needs about the collection

class Shard {
public:
    map<int, vector<string>> docTokens;                  // global doc id → tokens
    map<string, vector<pair<int, int>>> postings;        // term → (doc, term frequency)
    void add(int id, const string& text) {
        auto toks = tokenize(text); docTokens[id] = toks;
        map<string, int> tf; for (auto& t : toks) tf[t]++;
        for (auto& [t, f] : tf) postings[t].push_back({id, f});
    }
    Stats localStats() const {
        Stats s; s.docs = docTokens.size();
        for (auto& [id, t] : docTokens) s.totalLen += t.size();
        for (auto& [t, list] : postings) s.df[t] = list.size();
        return s;
    }
    // BM25: idf(t) × tf·(k1+1) / (tf + k1·(1 − b + b·len/avgLen))
    vector<pair<double, int>> search(const string& q, const Stats& st, int k) const {
        const double k1 = 1.2, b = 0.75, avg = (double)st.totalLen / st.docs;
        map<int, double> score;
        for (auto& t : tokenize(q)) {
            auto it = postings.find(t); if (it == postings.end()) continue;
            double df = st.df.count(t) ? st.df.at(t) : 0;
            double idf = log(1 + (st.docs - df + 0.5) / (df + 0.5));
            for (auto [doc, tf] : it->second) {
                double len = docTokens.at(doc).size();
                score[doc] += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * len / avg));
            }
        }
        vector<pair<double, int>> top;
        for (auto [d, s] : score) top.push_back({s, d});
        sort(top.begin(), top.end(), [](auto& x, auto& y) { return x.first != y.first ? x.first > y.first : x.second < y.second; });
        if ((int)top.size() > k) top.resize(k);
        return top;
    }
};

int main() {
    vector<string> docs = {
        "Kafka stores events in partitions of an append-only log",
        "Kafka consumer groups split partitions between consumers",
        "Kafka retention deletes old log segments",
        "Kafka replication keeps partition replicas in sync",
        "A cache stores hot keys in memory to reduce database load",
        "Redis is an in-memory cache and data structure server",
        "Cache invalidation: delete the cache key when the database changes",
        "Consistent hashing maps keys to cache servers with little movement",
        "Database replication copies data from a leader to followers",
        "Sharding splits a database by key across many servers",
        "A load balancer spreads requests across healthy servers",
        "Rate limiting protects servers from too many requests",
        "Raft elects a leader and replicates a log to followers",
        "Quorum reads and writes keep replicas consistent",
        "Event sourcing stores state changes as an append-only log of events",
        "A message queue decouples producers from consumers",
        "Kafka is a distributed log used for event streaming",
        "Search engines build an inverted index of terms",
        "BM25 ranks documents by term frequency and rarity",
        "A CDN caches static content close to users",
    };
    Shard single; for (int i = 0; i < (int)docs.size(); i++) single.add(i, docs[i]);
    vector<Shard> shards(3);
    for (int i = 0; i < (int)docs.size(); i++) shards[i < 4 ? 0 : i % 3].add(i, docs[i]);   // the early Kafka docs land together

    auto print = [&](const string& label, const vector<pair<double, int>>& top) {
        cout << "  " << label; for (auto [s, d] : top) cout << " #" << d << "(" << fixed << setprecision(2) << s << ")"; cout << "\n";
    };
    for (string q : {"kafka log", "cache database"}) {
        cout << "query: \"" << q << "\"\n";
        print("single index        :", single.search(q, single.localStats(), 4));

        auto gather = [&](bool global) {                 // scatter to shards, merge their top-k (scores must be comparable!)
            Stats g;
            if (global) for (auto& sh : shards) { auto s = sh.localStats(); g.docs += s.docs; g.totalLen += s.totalLen; for (auto& [t, n] : s.df) g.df[t] += n; }
            vector<pair<double, int>> all;
            for (auto& sh : shards) for (auto& hit : sh.search(q, global ? g : sh.localStats(), 4)) all.push_back(hit);
            sort(all.begin(), all.end(), [](auto& x, auto& y) { return x.first != y.first ? x.first > y.first : x.second < y.second; });
            all.resize(min<size_t>(4, all.size()));
            return all;
        };
        print("3 shards, local IDF :", gather(false));
        print("3 shards, global IDF:", gather(true));
    }
}
```

The first four documents (all about Kafka) landed on the same shard, where "kafka" looks **common**, so its IDF is low and those documents are under-scored; meanwhile a different shard over-scores its single Kafka document. The merged ranking changes. Collecting **global** document frequencies first (Elasticsearch's `dfs_query_then_fetch`) makes shard scores comparable and reproduces the single-index result exactly. With large, randomly distributed shards the distortion is usually small, which is why the cheaper local mode is the default.

## How it works

| Piece | Here | In Lucene / Elasticsearch |
|---|---|---|
| Tokenizer | lowercase + stop words | analyzers: tokenizers, stemming, synonyms, per-language rules |
| Postings | `map<term, vector<doc, positions>>` | compressed (delta + varint/bit-packing), skip lists for fast intersection |
| AND / phrase | sorted intersection, position check | conjunction iterators with skipping; positional postings |
| Ranking | BM25 (k1 = 1.2, b = 0.75) | BM25 by default, plus boosts, function scores, learning-to-rank |
| Updates | rebuild | immutable segments + merges (like an LSM tree); near-real-time refresh |
| Sharding | scatter-gather top-k | the same; `query_then_fetch` (local stats) or `dfs_query_then_fetch` (global) |

:::exercise Extend it
1. Add an **OR** query that ranks documents matching more terms higher.
2. Add **stemming** (strip "s", "ing", "ed" naively) and check how "partition" now matches "partitions".
3. Compress postings with **delta encoding + varints** and report bytes per posting.
4. Implement **WAND / max-score** pruning: skip documents that can't enter the top-k, and count postings scored.
5. Add **typo tolerance**: find terms within edit distance 1 of a misspelled query term using a sorted term dictionary.
:::

:::keypoints
- An **inverted index** maps each term to postings (documents + positions); AND = intersection (rarest first), phrases = consecutive positions.
- **BM25** ranks by term frequency (saturating), inverse document frequency and document length.
- Large indexes are **sharded**; queries **scatter-gather** and merge per-shard top-k.
- Shard-local IDF can **distort rankings** when data is unevenly distributed; global statistics fix it at the cost of an extra round trip.
:::
