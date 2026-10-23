---
title: Design a Social Media News Feed
level: intermediate
time: 60
summary: Users, follow relationships, posts and likes, building a feed with pull and push (fan-out) strategies, ranking as a strategy, cursor pagination, and the trade-offs between fan-out on write and fan-out on read.
---

:::problem Design a Social Media News Feed (Twitter/Instagram) {level=medium tags="feed,fan-out,Strategy,Observer,pagination,graph"}
Design the core of a social network feed. Users follow other users and publish posts. A user's feed shows recent posts from the people they follow, newest first (or ranked). Support likes and comments, paginated feeds, and follow/unfollow. Think about what happens when someone has millions of followers.
:::

:::hint Hint
Two ways to build a feed: **pull** (at read time, gather recent posts of everyone you follow and merge) and **push** (at write time, copy each new post id into each follower's feed list). Make the feed builder a **strategy** so both fit behind one interface. Use a stable **cursor** for pagination.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Entities? | User, Post (author, text, time), Follow, Like, Comment |
| Feed? | posts from followed users, newest first; own posts included |
| Pagination? | page size N with a cursor (the last seen post), not an offset |
| Ranking? | default chronological; ranking strategy pluggable (engagement-weighted) |
| Operations? | follow, unfollow, post, like/unlike, comment, getFeed(user, cursor, limit) |
| Celebrities? | users with huge follower counts must not make posting slow |
| Consistency? | eventual for feeds is fine; likes counted atomically |
| Out of scope | media, search, notifications UI, ads |

## Step 2: the two feed strategies

| | Pull (fan-out on read) | Push (fan-out on write) |
|---|---|---|
| Post time | O(1): store the post | O(followers): insert the post id into every follower's feed |
| Read time | O(following x recent posts): query + merge + sort | O(1): read a precomputed list |
| Storage | small | duplicates ids per follower |
| Good for | users following few; celebrities | most users; read-heavy systems |
| Problem | slow reads for heavy followers | **celebrity write storm**: 10M inserts per post |

Real systems use a **hybrid**: push for normal users, pull for celebrities, merged at read time.

## Step 3: entities

```viz algo=uml title="News feed"
class FeedService
  + follow(a: User, b: User): void
  + post(u: User, text: string): Post
  + like(u: User, p: Post): void
  + feed(u: User, cursor: PostId, limit: int): Page
class Post
  - id: long
  - author: int
  - text: string
  - time: long
  - likes: set<int>
class SocialGraph
  - following: map<int, set<int>>
  - followers: map<int, set<int>>
interface FeedStrategy
  + onPost(p: Post): void
  + build(u: int, cursor: long, limit: int): Post[]
class PullFeed
class PushFeed
class HybridFeed
interface Ranker
  + score(p: Post, now: long): double
class ChronologicalRanker
class EngagementRanker
class PostStore
FeedService --> SocialGraph
FeedService --> FeedStrategy
FeedService --> PostStore
PullFeed ..|> FeedStrategy
PushFeed ..|> FeedStrategy
HybridFeed ..|> FeedStrategy
FeedStrategy --> Ranker
ChronologicalRanker ..|> Ranker
EngagementRanker ..|> Ranker
```

## Step 4: design decisions

- **`FeedStrategy`** interface with `onPost` (called when a post is created) and `build` (called when a feed is requested). `PullFeed.onPost` does nothing; `PushFeed.onPost` fans out ids; `HybridFeed` pushes unless the author has more than a threshold of followers.
- **Cursor pagination** uses the post id (monotonic, time-ordered): "give me N posts with id < cursor". It stays stable when new posts arrive, unlike offsets.
- **`PostStore`** is the single owner of posts (id → Post). Feeds store **ids only**.
- **Ranker** orders candidates; chronological is just `score = id`. An engagement ranker mixes likes and recency.
- **SocialGraph** holds both `following` and `followers` maps for fast fan-out and reads.
- **Likes** use a set of user ids (idempotent like/unlike); counts are the set size.
- **Thread-safety**: one mutex per structure in this sketch; a real system shards by user id.

## Step 5: the code

```cpp run title="Pull, push and hybrid feeds with cursor pagination"
#include <algorithm>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <vector>
using namespace std;

using UserId = int;
using PostId = long;
struct Post { PostId id; UserId author; string text; set<UserId> likes; };

class PostStore {
    map<PostId, Post> posts_; PostId next_ = 1; mutable mutex m_;
public:
    Post& create(UserId a, string text) { lock_guard l(m_); PostId id = next_++; return posts_.emplace(id, Post{id, a, move(text), {}}).first->second; }
    const Post* find(PostId id) const { lock_guard l(m_); auto it = posts_.find(id); return it == posts_.end() ? nullptr : &it->second; }
    // recent posts of one author, newest first, older than the cursor
    vector<PostId> recentBy(UserId a, PostId before, size_t limit) const {
        lock_guard l(m_); vector<PostId> out;
        for (auto it = posts_.rbegin(); it != posts_.rend() && out.size() < limit; ++it) if (it->first < before && it->second.author == a) out.push_back(it->first);
        return out;
    }
    void like(PostId id, UserId u, bool on) { lock_guard l(m_); auto& p = posts_.at(id); if (on) p.likes.insert(u); else p.likes.erase(u); }
    size_t likes(PostId id) const { lock_guard l(m_); return posts_.at(id).likes.size(); }
};

class SocialGraph {
    map<UserId, set<UserId>> following_, followers_; mutable mutex m_;
public:
    void follow(UserId a, UserId b) { if (a == b) return; lock_guard l(m_); following_[a].insert(b); followers_[b].insert(a); }
    void unfollow(UserId a, UserId b) { lock_guard l(m_); following_[a].erase(b); followers_[b].erase(a); }
    set<UserId> following(UserId u) const { lock_guard l(m_); auto it = following_.find(u); return it == following_.end() ? set<UserId>{} : it->second; }
    set<UserId> followers(UserId u) const { lock_guard l(m_); auto it = followers_.find(u); return it == followers_.end() ? set<UserId>{} : it->second; }
};

struct Ranker { virtual ~Ranker() = default; virtual double score(const Post& p, size_t likes) const = 0; };
struct ChronologicalRanker : Ranker { double score(const Post& p, size_t) const override { return static_cast<double>(p.id); } };
struct EngagementRanker : Ranker { double score(const Post& p, size_t likes) const override { return static_cast<double>(p.id) + 3.0 * static_cast<double>(likes); } };   // each like is worth 3 "ticks" of recency

struct FeedStrategy {
    virtual ~FeedStrategy() = default;
    virtual void onPost(const Post& p) = 0;
    virtual vector<PostId> build(UserId u, PostId cursor, size_t limit) = 0;
};

class PullFeed : public FeedStrategy {
    PostStore& posts_; SocialGraph& graph_;
public:
    PullFeed(PostStore& p, SocialGraph& g) : posts_(p), graph_(g) {}
    void onPost(const Post&) override {}                                      // nothing to do at write time
    vector<PostId> build(UserId u, PostId cursor, size_t limit) override {
        vector<PostId> all;
        auto authors = graph_.following(u); authors.insert(u);
        for (UserId a : authors) { auto r = posts_.recentBy(a, cursor, limit); all.insert(all.end(), r.begin(), r.end()); }    // gather at read time
        sort(all.rbegin(), all.rend());                                       // merge: newest first
        if (all.size() > limit) all.resize(limit);
        return all;
    }
};

class PushFeed : public FeedStrategy {
    SocialGraph& graph_;
    map<UserId, vector<PostId>> inbox_;                                       // precomputed feed (newest at the back)
public:
    explicit PushFeed(SocialGraph& g) : graph_(g) {}
    void onPost(const Post& p) override {
        inbox_[p.author].push_back(p.id);
        for (UserId f : graph_.followers(p.author)) inbox_[f].push_back(p.id);     // fan-out on write: O(followers)
    }
    vector<PostId> build(UserId u, PostId cursor, size_t limit) override {
        vector<PostId> out; auto& box = inbox_[u];
        for (auto it = box.rbegin(); it != box.rend() && out.size() < limit; ++it) if (*it < cursor) out.push_back(*it);
        return out;
    }
    size_t fanOutWrites = 0;
};

class HybridFeed : public FeedStrategy {                                      // push for normal users, pull for celebrities
    PostStore& posts_; SocialGraph& graph_; size_t celebrityThreshold_;
    PushFeed push_; PullFeed pull_;
public:
    HybridFeed(PostStore& p, SocialGraph& g, size_t t) : posts_(p), graph_(g), celebrityThreshold_(t), push_(g), pull_(p, g) {}
    void onPost(const Post& p) override { if (graph_.followers(p.author).size() <= celebrityThreshold_) push_.onPost(p); }   // celebrities are NOT pushed
    vector<PostId> build(UserId u, PostId cursor, size_t limit) override {
        vector<PostId> merged = push_.build(u, cursor, limit);                  // precomputed part
        for (UserId f : graph_.following(u))                                    // pull the celebrities you follow
            if (graph_.followers(f).size() > celebrityThreshold_) { auto r = posts_.recentBy(f, cursor, limit); merged.insert(merged.end(), r.begin(), r.end()); }
        sort(merged.rbegin(), merged.rend());
        merged.erase(unique(merged.begin(), merged.end()), merged.end());
        if (merged.size() > limit) merged.resize(limit);
        return merged;
    }
};

class FeedService {
    PostStore& posts_; SocialGraph& graph_; FeedStrategy& strategy_; const Ranker& ranker_;
public:
    FeedService(PostStore& p, SocialGraph& g, FeedStrategy& s, const Ranker& r) : posts_(p), graph_(g), strategy_(s), ranker_(r) {}
    PostId post(UserId u, string text) { Post& p = posts_.create(u, move(text)); strategy_.onPost(p); return p.id; }
    struct Page { vector<const Post*> posts; PostId nextCursor; };
    Page feed(UserId u, PostId cursor, size_t limit) {
        auto ids = strategy_.build(u, cursor, limit * 2);                       // over-fetch a little, then rank
        vector<const Post*> items; for (PostId id : ids) items.push_back(posts_.find(id));
        stable_sort(items.begin(), items.end(), [&](const Post* a, const Post* b) { return ranker_.score(*a, posts_.likes(a->id)) > ranker_.score(*b, posts_.likes(b->id)); });
        if (items.size() > limit) items.resize(limit);
        PostId next = 0; for (auto* p : items) next = next == 0 ? p->id : min(next, p->id);          // the next page continues below the smallest id shown
        return {items, next};
    }
};

void show(const char* label, const FeedService::Page& pg) {
    cout << "  " << label << ":"; for (auto* p : pg.posts) cout << " [" << p->id << ": " << p->text << "]"; cout << "  next cursor=" << pg.nextCursor << "\n";
}

int main() {
    const UserId asha = 1, ravi = 2, meera = 3, star = 4;
    for (int mode = 0; mode < 3; ++mode) {
        PostStore posts; SocialGraph graph;
        PullFeed pull(posts, graph); PushFeed push(graph); HybridFeed hybrid(posts, graph, 2);
        FeedStrategy* strategy = mode == 0 ? static_cast<FeedStrategy*>(&pull) : mode == 1 ? static_cast<FeedStrategy*>(&push) : &hybrid;
        ChronologicalRanker chrono;
        FeedService svc(posts, graph, *strategy, chrono);
        cout << (mode == 0 ? "PULL" : mode == 1 ? "PUSH" : "HYBRID (celebrity threshold: 2 followers)") << ":\n";
        graph.follow(asha, ravi); graph.follow(asha, star); graph.follow(meera, star); graph.follow(ravi, star);       // the star has 3 followers
        svc.post(ravi, "ravi: hello"); svc.post(star, "star: big news"); svc.post(meera, "meera: lunch"); svc.post(ravi, "ravi: cricket"); svc.post(star, "star: new song");
        auto page1 = svc.feed(asha, 1'000'000, 2);
        show("asha's feed, page 1", page1);
        show("asha's feed, page 2", svc.feed(asha, page1.nextCursor, 2));
    }

    cout << "ranking by engagement:\n";
    PostStore posts; SocialGraph graph; PullFeed pull(posts, graph); EngagementRanker engaged;
    FeedService svc(posts, graph, pull, engaged);
    graph.follow(asha, ravi);
    PostId old = svc.post(ravi, "ravi: old but loved");
    svc.post(ravi, "ravi: fresh"); svc.post(ravi, "ravi: fresher");
    for (UserId u : {10, 11, 12, 13}) posts.like(old, u, true);
    show("asha's feed", svc.feed(asha, 1'000'000, 3));
}
```

## Edge cases

| Case | Handling |
|---|---|
| Unfollow | pull sees it immediately; a push feed keeps old posts (filter by current follows at read time, or remove lazily) |
| Deleted post | feeds hold ids only; `find` returns null and the id is skipped |
| User with no follows | feed shows only their own posts |
| Pagination during new posts | cursor by id: newer posts appear on page 1 next time, not shifted into page 2 |
| Duplicate ids in hybrid merge | `unique` after sorting |
| Rapid like/unlike | set semantics make them idempotent |
| Celebrity posts | not pushed in hybrid; merged on read |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Real ranking (ML score, affinity)" | a `Ranker` using features (affinity with the author, age, engagement); candidates still come from the feed strategy |
| "Notifications for likes and follows" | Observer events |
| "Mute, block, private accounts" | filters applied when building the feed (Chain of Responsibility) |
| "Trending topics" | an aggregator listening to post events with sliding-window counts |
| "Stories (expiring posts)" | a TTL on posts; lazy filtering |
| "Scale" | shard feeds by user id; a cache (Redis list per user) for push inboxes; async fan-out workers on a queue |
| "Media and large objects" | store references; a CDN (HLD) |
| "Consistency" | feeds are eventually consistent; reads can merge in the user's own latest posts to avoid "my post is missing" |

```quiz
? Why is fan-out on write a problem for celebrities?
- It is not
+ One post by an account with millions of followers causes millions of inserts
- Because feeds are sorted
> Hybrid designs pull celebrities' posts at read time instead.
? Why paginate with a cursor instead of an offset?
- Cursors are shorter
+ New posts do not shift items between pages, so users do not see duplicates or skip posts
- Offsets are unsupported in C++
> A cursor is a stable position in a time-ordered list.
```

:::keypoints
- Feed building is a strategy: pull (read-time merge), push (write-time fan-out), hybrid (push normal users, pull celebrities).
- Posts live in one store; feeds hold ids; cursor pagination; ranking is a separate strategy.
- Scale with sharding, caches and asynchronous fan-out workers.
:::
