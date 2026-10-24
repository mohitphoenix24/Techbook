---
title: Design a Q&A Platform (Stack Overflow)
level: intermediate
time: 60
summary: Users, questions, answers and comments, voting that changes reputation, accepted answers, tags and search, and moderation. Learn to keep the rules in services that react to events, so the model stays clean.
---

:::problem Design a Q&A Platform like Stack Overflow {level=medium tags="domain modelling,Observer,reputation,search,voting"}
Design a question-and-answer site. Users post questions with tags, others answer, and anyone can comment. Users vote questions and answers up or down. The person who asked can accept one answer. Votes and acceptance change the author's reputation, and reputation unlocks privileges (for example, voting down needs 125 reputation). Support search by tag and by keyword, and moderation (close a question, delete a post).
:::

:::hint Hint
Model the content as a small family (`Post` with `Question`, `Answer`, `Comment`). Put the **rules** (who may vote, how reputation changes) in services that react to **events**, so the reputation logic is not spread across the post classes.
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Main things? | User, Question (title, body, tags), Answer, Comment, Vote, Tag |
| Voting? | up or down on questions and answers. One vote for each user on each post. You cannot vote on your own post. Changing or taking back a vote is allowed |
| Reputation? | question upvote +5, answer upvote +10, downvote −2 (to the author), accepted answer +15 (to the answer's author) and +2 (to the asker). Minimum 1 |
| Privileges? | downvoting needs reputation of at least 125 (the limits can be set) |
| Accepting? | only the asker, one accepted answer for each question. Changing it moves the bonus |
| Search? | by tag (and combinations), and by keyword in the title |
| Moderation? | close or reopen a question (no new answers while closed). Delete a post (a soft delete) |
| Not needed | badges, bounties, edit history (we mention them), a real full-text search engine |

## Step 2: Find the classes

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

## Step 3: Design decisions

- **A `Post` base class** holds what questions, answers (and simply, comments) share: the author, the text, votes, score, a deleted flag and comments. `Question` and `Answer` add their own data. In this version, comments do not get votes.
- **Votes are stored with each post** as `map<user id, VoteType>`. This makes sure there is one vote for each user, and makes it easy to change or take back a vote. The score changes by the **difference**.
- **Events and Observer:** the platform announces `Event{type, actor, post}` (`Upvoted`, `Downvoted`, `VoteRetracted`, `Accepted`, ...). The `ReputationService` listens and applies the rules. Badges, notifications and analytics can listen in the same way, without changing the posts.
- **Reputation rules as data:** a table from event type to points, applied by the service, with a minimum of 1.
- **Privileges** (`canDownvote`, `canClose`) are checks against limits in a `Privileges` policy (a Strategy or lookup), not `if`s spread around.
- **TagIndex** keeps `tag to questions` for fast tag search, and finds the common ones for searches with many tags.
- **Soft delete** (a flag) keeps the history and the reputation records.

## Step 4: The code

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

| Case | What happens |
|---|---|
| Voting the same way twice | takes back the vote (a toggle), with the matching reputation event |
| Changing up to down | undo the old vote, apply the new one |
| Voting on your own post | refused |
| Accepting twice, or changing the accepted answer | remove the old bonus, add the new one |
| Reputation would go below 1 | kept at 1 |
| Deleting an answer that was accepted | announce `AcceptanceRemoved`. The author loses the bonus |
| Many votes at the same time | a lock for each post (or an atomic score and a locked vote map) |
| Tag typos and different names for one tag | a `TagService` with official names and a map of synonyms |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Badges (first answer, 100 upvotes)" | another event listener |
| "Edit history and review queues" | keep revisions for each post (Memento). Reviewers are roles |
| "Bounties" | a `Bounty` on a question, paid through events |
| "Full-text search and ranking" | a `SearchService` interface with an inverted index. Ranking is a strategy (score, recency, relevance) |
| "Finding duplicates" | a similarity service. Closing as a duplicate links to the original |
| "Roles and permissions" | roles (user, moderator, admin) checked by a `PermissionPolicy` |
| "Notifications" | a listener that tells the asker about new answers |
| "Scale: very popular questions" | cache top lists, save copies of scores, update reputation in the background |

## Short answer to say in an interview

:::interview How do you handle votes and reputation in a Q&A site?
"Each post stores its votes in a map from user id to vote type, so there is only one vote for each user, and changing or taking back a vote just adjusts the score by the difference. Reputation is not in the vote code. The platform announces events like Upvoted or Accepted, and a reputation service listens and applies a table of points. Badges and notifications can listen to the same events. Privileges are checks against reputation limits."
:::

```quiz
? Why handle reputation with events and not inside the vote code?
- Events are faster
+ The reputation rules stay in one service, and other features (badges, notifications) can listen without changing the posts
- C++ requires it
> Observer separates "what happened" from "what reacts to it".
? How is "one vote for each user on each post" made sure?
- Only by a unique id in the database
+ The post stores votes by user id. Voting again updates or takes back the vote, and does not add
- By checking the author
> A map keyed by user id makes duplicates impossible.
```

:::keypoints
- A Post family for shared data. Votes keyed by user. The score changes by differences.
- Reputation, badges and notifications are event listeners. Privileges are limit checks.
- A tag index for search. Soft deletes. Clear reasons when an action is refused.
:::
