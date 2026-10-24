---
title: Design a Social Media News Feed
level: intermediate
time: 60
summary: Users who follow each other, posts and likes, and how to build a feed. Learn pull and push (fan-out) strategies, ranking as a strategy, pagination with a cursor, and the trade-off between work at write time and work at read time.
---

:::problem Design a Social Media News Feed (Twitter/Instagram) {level=medium tags="feed,fan-out,Strategy,Observer,pagination,graph"}
Design the core of a social network feed. Users follow other users and publish posts. A user's feed shows recent posts from the people they follow, newest first (or ranked). Support likes and comments, a feed that is split into pages, and follow and unfollow. Think about what happens when someone has millions of followers.
:::

:::hint Hint
There are two ways to build a feed. **Pull:** when the user opens the feed, collect the recent posts of everyone they follow and merge them. **Push:** when someone posts, copy the post id into the feed list of each follower. Make the feed builder a **strategy**, so both fit behind one interface. Use a stable **cursor** for the pages.
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Main things? | User, Post (author, text, time), Follow, Like, Comment |
| The feed? | posts from the people you follow, newest first. Your own posts are included |
| Pages? | a page of N posts with a cursor (the last post seen), not a page number |
| Ranking? | normally by time. The ranking can be swapped (a score that uses likes) |
| Actions? | follow, unfollow, post, like and unlike, comment, getFeed(user, cursor, limit) |
| Celebrities? | users with huge numbers of followers must not make posting slow |
| Consistency? | feeds can be a little late (eventual). Likes are counted safely |
| Not needed | pictures, search, notification screens, ads |

## Step 2: The two ways to build a feed

| | Pull (work when reading) | Push (work when posting) |
|---|---|---|
| When posting | O(1): just store the post | O(followers): add the post id to every follower's feed |
| When reading | O(people you follow × recent posts): fetch, merge, sort | O(1): read a ready list |
| Storage | small | the same ids are copied for each follower |
| Good for | users who follow few people, and for celebrities | most users, when there are many more reads than writes |
| Problem | slow reads for people who follow many | **a storm for celebrities**: 10 million inserts for one post |

Real systems use a **mix**: push for normal users, pull for celebrities, and merge the two when reading.

## Step 3: Find the classes

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

## Step 4: Design decisions

- **`FeedStrategy`** is an interface with `onPost` (called when a post is made) and `build` (called when a feed is asked for). `PullFeed.onPost` does nothing. `PushFeed.onPost` copies ids to followers. `HybridFeed` pushes, unless the author has more followers than a limit.
- **Cursor pages** use the post id (it only grows with time): "give me N posts with id less than the cursor". It stays steady when new posts arrive, unlike page numbers.
- **`PostStore`** is the only owner of posts (id to Post). Feeds keep **ids only**.
- **Ranker** orders the candidates. Time order is just `score = id`. A ranker that uses likes mixes likes and age.
- **SocialGraph** keeps both `following` and `followers` maps, for fast copying to followers and fast reads.
- **Likes** use a set of user ids (liking twice does nothing new). The count is the size of the set.
- **Threads:** one mutex for each structure in this sketch. A real system splits by user id.

## Step 5: The code

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

| Case | What happens |
|---|---|
| Unfollow | pull sees it at once. A push feed keeps old posts (filter by who you follow now when reading, or remove slowly) |
| A deleted post | feeds hold ids only, so `find` returns null and the id is skipped |
| A user who follows nobody | the feed shows only their own posts |
| New posts while paging | a cursor by id: newer posts show on page 1 next time, and do not shift into page 2 |
| Repeated ids when merging in the mix | `unique` after sorting |
| Quick like and unlike | set rules make them safe to repeat |
| Celebrity posts | not pushed in the mix. They are merged when reading |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Real ranking (a learned score, closeness)" | a `Ranker` that uses features (closeness to the author, age, likes). Candidates still come from the feed strategy |
| "Notifications for likes and follows" | Observer events |
| "Mute, block, private accounts" | filters when building the feed (Chain of Responsibility) |
| "Trending topics" | an aggregator that listens to post events and counts in a sliding window |
| "Stories that expire" | a time to live on posts, filtered when read |
| "Scale" | split feeds by user id, keep push inboxes in a cache (a Redis list for each user), and copy to followers in the background through a queue |
| "Pictures and big files" | store references, and use a CDN (HLD) |
| "Consistency" | feeds can be late. When reading, also merge the user's own latest posts so "my post is missing" does not happen |

## Short answer to say in an interview

:::interview What is the difference between fan-out on write and fan-out on read?
"With fan-out on write (push), when someone posts, I copy the post id into every follower's feed list. Reading is then very fast, but a celebrity with millions of followers causes millions of inserts for one post. With fan-out on read (pull), I only store the post, and when a user opens the feed, I collect and merge the recent posts of everyone they follow. Writes are cheap, but reads are slower. Real systems mix them: push for normal users, pull for celebrities, merged when reading."
:::

```quiz
? Why is fan-out on write a problem for celebrities?
- It is not
+ One post from an account with millions of followers causes millions of inserts
- Because feeds are sorted
> A mixed design pulls celebrities' posts when reading.
? Why use a cursor instead of a page number?
- Cursors are shorter
+ New posts do not shift items between pages, so users do not see repeats or miss posts
- Page numbers are not supported in C++
> A cursor is a steady position in a list ordered by time.
```

:::keypoints
- Building a feed is a strategy: pull (merge when reading), push (copy when posting), or a mix (push for normal users, pull for celebrities).
- Posts live in one store. Feeds hold ids. Cursor pages. Ranking is a separate strategy.
- To scale: split by user, use caches, and copy to followers in the background.
:::
