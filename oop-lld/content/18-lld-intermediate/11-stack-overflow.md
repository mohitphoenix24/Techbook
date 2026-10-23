---
title: Design a Q&A Platform (Stack Overflow)
level: intermediate
time: 60
summary: Users, questions, answers and comments, voting with reputation, accepted answers, tags and tag search, reputation changes through events, moderation (close, delete), and the rules that keep the model consistent.
---

:::problem Design a Q&A Platform like Stack Overflow {level=medium tags="domain modelling,Observer,reputation,search,voting"}
Design a question-and-answer site. Users post questions with tags, others answer, anyone can comment. Users vote questions and answers up or down. The asker can accept one answer. Votes and acceptance change the author's reputation, and reputation unlocks privileges (e.g. voting down needs 125 reputation). Support searching by tag and keyword, and moderation (close a question, delete a post).
:::

:::hint Hint
Model the content as a small hierarchy (`Post` with `Question`, `Answer`, `Comment`) and put the **rules** (who may vote, how reputation changes) in services driven by **events**, so reputation logic is not scattered through the post classes.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Entities? | User, Question (title, body, tags), Answer, Comment, Vote, Tag |
| Voting? | up/down on questions and answers; one vote per user per post; you cannot vote on your own post; changing or retracting a vote is allowed |
| Reputation? | question upvote +5, answer upvote +10, downvote −2 (to the author), accepted answer +15 (answer author) and +2 (asker); minimum 1 |
| Privileges? | downvote needs reputation ≥ 125 (configurable thresholds) |
| Accept? | only the asker, one accepted answer per question; changing it moves the bonus |
| Search? | by tag (and combinations), by keyword in the title |
| Moderation? | close/reopen a question (no new answers while closed); delete a post (soft delete) |
| Out of scope | badges, bounties, edits history (mention), full-text search engine |

## Step 2: entities

```viz algo=uml title="Q&A platform"
class Platform
  + ask(user: User, title: string, body: string, tags: string[]): Question
  + answer(user: User, q: Question, body: string): Answer
  + comment(user: User, p: Post, body: string): Comment
  + vote(user: User, p: Post, v: VoteType): Result
  + accept(user: User, a: Answer): Result
  + searchByTags(tags: string[]): Question[]
abstract class Post
  # id: int
  # author: User
  # body: string
  # score: int
  # deleted: bool
  # votes: map<User, VoteType>
  # comments: Comment[]
class Question
  - title: string
  - tags: Tag[]
  - answers: Answer[]
  - accepted: Answer
  - closed: bool
class Answer
  - question: Question
class Comment
class User
  - name: string
  - reputation: int
interface EventListener
  + onEvent(e: Event): void
class ReputationService
class TagIndex
  - byTag: map<string, Question[]>
Question --|> Post
Answer --|> Post
Comment --|> Post
Question *-- Answer
Post *-- Comment
Platform --> ReputationService
Platform --> TagIndex
ReputationService ..|> EventListener
Platform o-- EventListener
```

## Step 3: design decisions

- **`Post` base class** holds what questions, answers (and, simply, comments) share: author, body, votes, score, soft-delete flag, comments. `Question` and `Answer` add their own data. Votes are not on comments in this version (comments just have a score of 0).
- **Votes stored per post** as `map<user id, VoteType>`, which enforces "one vote per user" and makes changing/retracting a vote easy: the score is adjusted by the **difference**.
- **Events + Observer**: the platform publishes `Event{type, actor, post}` (`Upvoted`, `Downvoted`, `VoteRetracted`, `Accepted`, ...). The `ReputationService` subscribes and applies the rules. Badges, notifications and analytics subscribe the same way, without touching the posts.
- **Reputation rules as data** (a table of event type → points), applied by the service, with a floor of 1.
- **Privileges** (`canDownvote`, `canClose`) are checks against thresholds in a `Privileges` policy (a Strategy/lookup), not scattered `if`s.
- **TagIndex** keeps `tag → questions` for fast tag search; tag intersection for multi-tag queries.
- **Soft delete** (flag) preserves history and reputation accounting.

## Step 4: the code

```cpp run title="Posts, votes, reputation by events, accept, tags, close"
#include <algorithm>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <vector>
using namespace std;

struct User { int id; string name; int reputation = 1; };

enum class VoteType { Up = 1, Down = -1 };
enum class EventType { QuestionUpvoted, AnswerUpvoted, Downvoted, UpvoteRetracted, DownvoteRetracted, AnswerAccepted, AcceptanceRemoved };
struct Event { EventType type; User* actor; User* subject; };       // subject = whose reputation may change

struct EventListener { virtual ~EventListener() = default; virtual void onEvent(const Event& e) = 0; };

class Post {
protected:
    static inline int nextId_ = 1;
    int id_; User* author_; string body_; int score_ = 0; bool deleted_ = false;
    map<int, VoteType> votes_;                                // user id -> vote
public:
    Post(User* a, string b) : id_(nextId_++), author_(a), body_(move(b)) {}
    virtual ~Post() = default;
    int id() const { return id_; }
    User* author() const { return author_; }
    int score() const { return score_; }
    bool deleted() const { return deleted_; }
    void softDelete() { deleted_ = true; }
    virtual bool isQuestion() const { return false; }
    // returns the previous vote (if any) and the new one, so the caller can raise the right events
    pair<optional<VoteType>, optional<VoteType>> castVote(User* voter, VoteType v) {
        auto it = votes_.find(voter->id);
        optional<VoteType> prev = it == votes_.end() ? nullopt : optional<VoteType>(it->second);
        if (prev && *prev == v) {                             // voting the same way again retracts the vote
            score_ -= static_cast<int>(v); votes_.erase(voter->id);
            return {prev, nullopt};
        }
        if (prev) score_ -= static_cast<int>(*prev);          // switching: undo the old vote first
        votes_[voter->id] = v; score_ += static_cast<int>(v);
        return {prev, v};
    }
};

class Answer;
class Question : public Post {
    string title_; set<string> tags_; vector<Answer*> answers_; Answer* accepted_ = nullptr; bool closed_ = false;
public:
    Question(User* a, string title, string body, set<string> tags) : Post(a, move(body)), title_(move(title)), tags_(move(tags)) {}
    const string& title() const { return title_; }
    const set<string>& tags() const { return tags_; }
    bool isQuestion() const override { return true; }
    bool closed() const { return closed_; }
    void setClosed(bool c) { closed_ = c; }
    void addAnswer(Answer* a) { answers_.push_back(a); }
    Answer* accepted() const { return accepted_; }
    void setAccepted(Answer* a) { accepted_ = a; }
    size_t answerCount() const { return answers_.size(); }
};
class Answer : public Post {
    Question* question_;
public:
    Answer(User* a, Question* q, string body) : Post(a, move(body)), question_(q) {}
    Question* question() const { return question_; }
};

// Reputation rules live HERE, driven by events
class ReputationService : public EventListener {
    static int delta(EventType t) {
        switch (t) {
            case EventType::QuestionUpvoted: return 5;   case EventType::AnswerUpvoted: return 10;
            case EventType::Downvoted: return -2;        case EventType::UpvoteRetracted: return -10;   // (simplified: retraction of an answer upvote)
            case EventType::DownvoteRetracted: return 2; case EventType::AnswerAccepted: return 15;
            case EventType::AcceptanceRemoved: return -15;
        }
        return 0;
    }
public:
    void onEvent(const Event& e) override {
        e.subject->reputation = max(1, e.subject->reputation + delta(e.type));
        cout << "    [reputation] " << e.subject->name << " now has " << e.subject->reputation << "\n";
    }
};

struct Privileges { static constexpr int kDownvote = 125; static bool canDownvote(const User& u) { return u.reputation >= kDownvote; } };

class Platform {
    vector<unique_ptr<User>> users_;
    vector<unique_ptr<Post>> posts_;
    map<string, vector<Question*>> byTag_;
    vector<EventListener*> listeners_;
    void emit(Event e) { for (auto* l : listeners_) l->onEvent(e); }
public:
    void subscribe(EventListener* l) { listeners_.push_back(l); }
    User* addUser(string name, int rep = 1) { users_.push_back(make_unique<User>(User{static_cast<int>(users_.size()) + 1, move(name), rep})); return users_.back().get(); }

    Question* ask(User* u, string title, string body, set<string> tags) {
        auto q = make_unique<Question>(u, move(title), move(body), tags);
        Question* raw = q.get(); posts_.push_back(move(q));
        for (auto& t : tags) byTag_[t].push_back(raw);
        return raw;
    }
    Answer* answer(User* u, Question* q, string body, string& why) {
        if (q->closed()) { why = "the question is closed"; return nullptr; }
        auto a = make_unique<Answer>(u, q, move(body));
        Answer* raw = a.get(); posts_.push_back(move(a)); q->addAnswer(raw);
        return raw;
    }
    bool vote(User* voter, Post* p, VoteType v, string& why) {
        if (p->deleted()) { why = "the post was deleted"; return false; }
        if (p->author() == voter) { why = "you cannot vote on your own post"; return false; }
        if (v == VoteType::Down && !Privileges::canDownvote(*voter)) { why = "downvoting needs " + to_string(Privileges::kDownvote) + " reputation"; return false; }
        auto [prev, now] = p->castVote(voter, v);
        // translate the vote change into events
        if (prev) emit({*prev == VoteType::Up ? EventType::UpvoteRetracted : EventType::DownvoteRetracted, voter, p->author()});
        if (now) emit({*now == VoteType::Up ? (p->isQuestion() ? EventType::QuestionUpvoted : EventType::AnswerUpvoted) : EventType::Downvoted, voter, p->author()});
        return true;
    }
    bool accept(User* u, Answer* a, string& why) {
        Question* q = a->question();
        if (q->author() != u) { why = "only the asker can accept an answer"; return false; }
        if (Answer* old = q->accepted()) emit({EventType::AcceptanceRemoved, u, old->author()});
        q->setAccepted(a);
        emit({EventType::AnswerAccepted, u, a->author()});
        return true;
    }
    void close(Question* q) { q->setClosed(true); }
    vector<Question*> searchByTags(const vector<string>& tags) const {            // intersection of the tag lists
        vector<Question*> out;
        if (tags.empty()) return out;
        auto it = byTag_.find(tags[0]);
        if (it == byTag_.end()) return out;
        for (Question* q : it->second)
            if (!q->deleted() && all_of(tags.begin(), tags.end(), [&](const string& t) { return q->tags().count(t) > 0; })) out.push_back(q);
        return out;
    }
};

int main() {
    Platform site; ReputationService rep; site.subscribe(&rep);
    User* asha = site.addUser("asha"); User* ravi = site.addUser("ravi", 200); User* meera = site.addUser("meera");
    string why;

    Question* q = site.ask(asha, "Why does my vector reallocate?", "...", {"c++", "vector"});
    site.ask(ravi, "What is RAII?", "...", {"c++", "idioms"});
    Answer* a1 = site.answer(ravi, q, "Because push_back exceeded capacity.", why);
    Answer* a2 = site.answer(meera, q, "Call reserve().", why);

    cout << "meera upvotes the question:\n";            site.vote(meera, q, VoteType::Up, why);
    cout << "asha upvotes ravi's answer:\n";            site.vote(asha, a1, VoteType::Up, why);
    cout << "meera (reputation low) tries to downvote:\n"; if (!site.vote(meera, a1, VoteType::Down, why)) cout << "    refused: " << why << "\n";
    cout << "ravi (reputation 200+) downvotes meera's answer:\n"; site.vote(ravi, a2, VoteType::Down, why);
    cout << "asha votes on her own question: "; if (!site.vote(asha, q, VoteType::Up, why)) cout << "refused: " << why << "\n";
    cout << "asha accepts meera's answer, then changes her mind to ravi's:\n";
    site.accept(asha, a2, why); site.accept(asha, a1, why);
    cout << "ravi tries to accept: "; if (!site.accept(ravi, a2, why)) cout << "refused: " << why << "\n";

    cout << "search tag c++ AND vector: " << site.searchByTags({"c++", "vector"}).size() << " question(s); tag c++ alone: " << site.searchByTags({"c++"}).size() << "\n";
    site.close(q);
    cout << "answering a closed question: "; if (!site.answer(meera, q, "late", why)) cout << "refused: " << why << "\n";
    cout << "scores: question " << q->score() << ", ravi's answer " << a1->score() << ", meera's answer " << a2->score() << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Voting twice the same way | retracts the vote (toggle), with the matching reputation event |
| Switching up to down | undo the old vote, apply the new one |
| Voting on own post | refused |
| Accepting twice / changing the accepted answer | remove the old bonus, add the new one |
| Reputation below 1 | floored at 1 |
| Deleting an answer that was accepted | emit `AcceptanceRemoved`; the author loses the bonus |
| Rapid concurrent votes | a per-post lock (or atomic score + a locked vote map) |
| Tag typos and synonyms | a `TagService` with canonical names and synonym mapping |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Badges (first answer, 100 upvotes)" | another event listener |
| "Edit history and moderation queues" | revisions stored per post (Memento); reviewers as roles |
| "Bounties" | a `Bounty` on a question; paid via events |
| "Full-text search and ranking" | a `SearchService` interface with an inverted index; ranking Strategy (score, recency, relevance) |
| "Duplicate detection" | a similarity service; closing as duplicate links to the original |
| "Roles and permissions" | roles (user, moderator, admin) checked by a `PermissionPolicy` |
| "Notifications" | listener that notifies the asker of new answers |
| "Scale: hot questions" | cache top lists, denormalise scores, async reputation updates |

```quiz
? Why handle reputation through events instead of inside the vote code?
- Events are faster
+ The reputation rules stay in one service, and other features (badges, notifications) subscribe without changing the posts
- C++ requires it
> Observer decouples what happened from what reacts to it.
? How is "one vote per user per post" enforced?
- By a unique id in the database only
+ The post stores votes by user id; casting again updates or retracts instead of adding
- By checking the author
> The map keyed by user id makes duplicates impossible.
```

:::keypoints
- Post hierarchy for shared state; votes keyed by user; score adjusted by differences.
- Reputation, badges and notifications are event listeners; privileges are threshold checks.
- Tag index for search; soft deletes; clear refusal reasons for invalid actions.
:::
