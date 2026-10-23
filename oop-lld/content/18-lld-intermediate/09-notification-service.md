---
title: Design a Notification Service
level: intermediate
time: 60
summary: A multi-channel notification platform with templates, user preferences and quiet hours, priorities, retry with exponential backoff, per-user rate limits, de-duplication, asynchronous delivery with worker threads, and delivery status tracking.
---

:::problem Design a Notification Service {level=medium tags="Strategy,Chain of Responsibility,async,retry,Observer,infrastructure"}
Design a service that other systems call to notify users (order shipped, OTP, promotions). It must support several channels (email, SMS, push), message templates, user preferences (opted-out channels, quiet hours), priorities (OTP before promotions), retries when a channel fails, and protection against spamming a user. Delivery is asynchronous; callers get a notification id and can query its status.
:::

:::hint Hint
Think in two layers. **Accept and decide** (validate, apply preferences, rate limits, de-duplicate: a chain of checks) and **deliver** (a priority queue and workers that call channels with retry). Channels and templates are the extension points.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Channels? | email, SMS, push; more later |
| Trigger? | an API call: `send(userId, templateId, params, priority)` |
| Templates? | text with `{placeholders}` per channel |
| Preferences? | per user: channels allowed per category, quiet hours (promotions only) |
| Priority? | HIGH (OTP, security) bypasses quiet hours and rate limits; NORMAL; LOW (promotions) |
| Reliability? | failures retried up to 3 times with exponential backoff; then marked FAILED, or fall back to another channel |
| Spam control? | max N notifications per user per hour (not for HIGH) |
| De-dup? | the same `dedupKey` within 10 minutes is dropped |
| Status? | Queued, Sent, Failed, Dropped(reason) queryable by id |
| Concurrency? | worker threads drain a priority queue |

## Step 2: the pipeline

```viz algo=seq title="From API call to delivery"
participant c Caller [user]
participant s NotificationService [service]
participant f Filters [filter]
participant q PriorityQueue [queue]
participant w Worker [worker]
participant ch Channel [mail]
c -> s : send(user, "otp", params, HIGH)
s -> f : checks: dedup, preferences, rate limit | A chain: any filter may DROP the request with a reason.
f --> s : accepted
s -> q : enqueue(Notification) | Ordered by priority, then arrival.
s --> c : notification id (status Queued)
w -> q : pop highest priority
w -> ch : send(rendered message)
ch --> w : failure | Retry with backoff: 1s, 2s, 4s, then mark FAILED.
w -> ch : send again
ch --> w : ok
```

## Step 3: entities

```viz algo=uml title="Notification service"
class NotificationService
  + send(req: Request): Id
  + status(id: Id): Status
class Request
  - user: string
  - template: string
  - params: map
  - priority: Priority
  - dedupKey: string
interface Filter
  + check(r: Request, now: long): Decision
class DedupFilter
class PreferenceFilter
class RateLimitFilter
interface Channel
  + type(): ChannelType
  + deliver(user: string, text: string): bool
class EmailChannel
class SmsChannel
class PushChannel
class TemplateEngine
  + render(t: string, params: map): string
class DeliveryWorker
  + run(): void
interface RetryPolicy
  + delayFor(attempt: int): long
class ExponentialBackoff
NotificationService --> Filter
NotificationService --> Channel
NotificationService ..> TemplateEngine
NotificationService --> DeliveryWorker
DedupFilter ..|> Filter
PreferenceFilter ..|> Filter
RateLimitFilter ..|> Filter
EmailChannel ..|> Channel
SmsChannel ..|> Channel
PushChannel ..|> Channel
DeliveryWorker --> RetryPolicy
ExponentialBackoff ..|> RetryPolicy
```

## Step 4: design decisions

- **Filters as a Chain of Responsibility**: dedup → preferences → rate limit. Each returns `Accept` or `Drop(reason)`. A new rule (blocked sender, legal hours) is a new filter.
- **Channel as a Strategy**; the user's preferred channel order decides where to try first, with a fallback list.
- **TemplateEngine** replaces `{name}` placeholders; templates are data.
- **Priority queue + worker threads** (a blocking queue ordered by `(priority desc, sequence asc)`): HIGH always overtakes LOW; FIFO inside a priority.
- **Retry with backoff** handled by the worker; the delay uses an injected clock/scheduler. The demo uses a logical clock so it is deterministic and instant.
- **Status store** keyed by id for the `status()` query; transitions: Queued → Sent | Failed | Dropped.
- **Idempotency**: the dedup key prevents duplicate deliveries when callers retry their API call.

## Step 5: the code

```cpp run title="Filters, templates, priority queue, retries with backoff"
#include <algorithm>
#include <condition_variable>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <queue>
#include <set>
#include <string>
#include <thread>
#include <vector>
using namespace std;

enum class Priority { Low = 0, Normal = 1, High = 2 };
enum class ChannelType { Email, Sms, Push };
enum class Status { Queued, Sent, Failed, Dropped };
const char* name(Status s) { static const char* n[] = {"Queued", "Sent", "Failed", "Dropped"}; return n[static_cast<int>(s)]; }
const char* name(ChannelType c) { static const char* n[] = {"email", "sms", "push"}; return n[static_cast<int>(c)]; }

struct Request { string user, templateId; map<string, string> params; Priority priority; string dedupKey; };

// ---------- templates ----------
string render(string text, const map<string, string>& params) {
    for (const auto& [k, v] : params) {
        string token = "{" + k + "}";
        for (size_t pos = text.find(token); pos != string::npos; pos = text.find(token, pos + v.size())) text.replace(pos, token.size(), v);
    }
    return text;
}

// ---------- filters (chain of responsibility) ----------
struct Decision { bool ok; string reason; };
struct Filter { virtual ~Filter() = default; virtual Decision check(const Request& r, long now) = 0; };

class DedupFilter : public Filter {
    map<string, long> seen_; long window_;
public:
    explicit DedupFilter(long window) : window_(window) {}
    Decision check(const Request& r, long now) override {
        if (r.dedupKey.empty()) return {true, ""};
        auto it = seen_.find(r.dedupKey);
        if (it != seen_.end() && now - it->second < window_) return {false, "duplicate within " + to_string(window_) + "s"};
        seen_[r.dedupKey] = now;
        return {true, ""};
    }
};
struct Preferences { set<ChannelType> blocked; int quietStart = -1, quietEnd = -1; };      // hours of the day
class PreferenceFilter : public Filter {
    map<string, Preferences> prefs_;
public:
    void set(const string& user, Preferences p) { prefs_[user] = move(p); }
    const Preferences* get(const string& u) const { auto it = prefs_.find(u); return it == prefs_.end() ? nullptr : &it->second; }
    Decision check(const Request& r, long now) override {
        if (r.priority == Priority::High) return {true, ""};                                // security messages always go
        auto p = get(r.user);
        if (!p || p->quietStart < 0) return {true, ""};
        int hour = static_cast<int>((now / 3600) % 24);
        bool quiet = p->quietStart <= p->quietEnd ? (hour >= p->quietStart && hour < p->quietEnd) : (hour >= p->quietStart || hour < p->quietEnd);
        return quiet ? Decision{false, "quiet hours"} : Decision{true, ""};
    }
};
class RateLimitFilter : public Filter {
    map<string, vector<long>> sent_; int perHour_;
public:
    explicit RateLimitFilter(int perHour) : perHour_(perHour) {}
    Decision check(const Request& r, long now) override {
        if (r.priority == Priority::High) return {true, ""};
        auto& v = sent_[r.user];
        v.erase(remove_if(v.begin(), v.end(), [&](long t) { return now - t >= 3600; }), v.end());
        if (static_cast<int>(v.size()) >= perHour_) return {false, "rate limit (" + to_string(perHour_) + "/hour)"};
        v.push_back(now);
        return {true, ""};
    }
};

// ---------- channels (strategy) ----------
struct Channel {
    virtual ~Channel() = default;
    virtual ChannelType type() const = 0;
    virtual bool deliver(const string& user, const string& text) = 0;
};
struct FlakyChannel : Channel {                              // fails the first `failures` attempts, to demonstrate retries
    ChannelType t; int failures; int calls = 0;
    FlakyChannel(ChannelType t, int f) : t(t), failures(f) {}
    ChannelType type() const override { return t; }
    bool deliver(const string& user, const string& text) override { ++calls; cout << "    [" << name(t) << " -> " << user << "] " << text << (calls <= failures ? "   (FAILED)\n" : "   (ok)\n"); return calls > failures; }
};

// ---------- retry policy ----------
struct RetryPolicy { virtual ~RetryPolicy() = default; virtual int maxAttempts() const = 0; virtual long delayFor(int attempt) const = 0; };
struct ExponentialBackoff : RetryPolicy { int maxAttempts() const override { return 4; } long delayFor(int attempt) const override { return 1L << (attempt - 1); } };   // 1s, 2s, 4s

struct Notification { long id; Request req; string text; ChannelType channel; Status status = Status::Queued; string note; int attempts = 0; long seq; };

class NotificationService {
    map<string, string> templates_;
    vector<unique_ptr<Filter>> filters_;
    map<ChannelType, unique_ptr<Channel>> channels_;
    map<long, Notification> store_;
    unique_ptr<RetryPolicy> retry_;
    mutex m_; long nextId_ = 1; long clock_ = 0;             // a logical clock in seconds keeps the demo deterministic
    struct Cmp { bool operator()(const Notification* a, const Notification* b) const { return a->req.priority != b->req.priority ? a->req.priority < b->req.priority : a->seq > b->seq; } };
    priority_queue<Notification*, vector<Notification*>, Cmp> queue_;
public:
    explicit NotificationService(unique_ptr<RetryPolicy> r) : retry_(move(r)) {}
    void addTemplate(string id, string text) { templates_[move(id)] = move(text); }
    void addFilter(unique_ptr<Filter> f) { filters_.push_back(move(f)); }
    void addChannel(unique_ptr<Channel> c) { auto t = c->type(); channels_[t] = move(c); }
    void setTime(long t) { lock_guard l(m_); clock_ = t; }

    long send(const Request& r, ChannelType preferred) {
        lock_guard l(m_);
        Notification n{nextId_++, r, "", preferred, Status::Queued, "", 0, 0};
        n.seq = n.id;
        auto tpl = templates_.find(r.templateId);
        if (tpl == templates_.end()) { n.status = Status::Dropped; n.note = "unknown template"; }
        else {
            n.text = render(tpl->second, r.params);
            for (auto& f : filters_) { Decision d = f->check(r, clock_); if (!d.ok) { n.status = Status::Dropped; n.note = d.reason; break; } }       // first filter to refuse wins
        }
        long id = n.id;
        store_.emplace(id, move(n));
        if (store_.at(id).status == Status::Queued) queue_.push(&store_.at(id));
        return id;
    }
    // A worker drains the queue. (Run on threads in production; called inline here for a deterministic demo.)
    void processAll() {
        for (;;) {
            Notification* n;
            { lock_guard l(m_); if (queue_.empty()) return; n = queue_.top(); queue_.pop(); }
            Channel& ch = *channels_.at(n->channel);
            for (int attempt = 1; attempt <= retry_->maxAttempts(); ++attempt) {
                n->attempts = attempt;
                if (ch.deliver(n->req.user, n->text)) { n->status = Status::Sent; break; }
                if (attempt == retry_->maxAttempts()) { n->status = Status::Failed; n->note = "gave up after " + to_string(attempt) + " attempts"; break; }
                cout << "    retry in " << retry_->delayFor(attempt) << "s\n";                        // a real worker would schedule or sleep
            }
        }
    }
    string statusOf(long id) { lock_guard l(m_); auto& n = store_.at(id); return string(name(n.status)) + (n.note.empty() ? "" : " (" + n.note + ")") + (n.attempts > 1 ? " after " + to_string(n.attempts) + " attempts" : ""); }
};

int main() {
    NotificationService svc(make_unique<ExponentialBackoff>());
    svc.addTemplate("otp", "Your OTP is {code}. It expires in 5 minutes.");
    svc.addTemplate("promo", "Hi {name}, {offer}!");
    svc.addTemplate("shipped", "Order {order} has shipped.");

    auto prefs = make_unique<PreferenceFilter>();
    prefs->set("asha", Preferences{{}, 22, 7});                                   // asha: quiet hours 22:00 to 07:00
    svc.addFilter(make_unique<DedupFilter>(600));
    svc.addFilter(move(prefs));
    svc.addFilter(make_unique<RateLimitFilter>(2));                               // at most 2 normal/low messages per hour

    svc.addChannel(make_unique<FlakyChannel>(ChannelType::Sms, 2));               // SMS fails twice, then works
    svc.addChannel(make_unique<FlakyChannel>(ChannelType::Email, 0));

    svc.setTime(23 * 3600);                                                       // 11 pm
    long a = svc.send({"asha", "promo", {{"name", "Asha"}, {"offer", "20% off"}}, Priority::Low, ""}, ChannelType::Email);
    long b = svc.send({"asha", "otp", {{"code", "482913"}}, Priority::High, "otp-1"}, ChannelType::Sms);
    long c = svc.send({"asha", "otp", {{"code", "482913"}}, Priority::High, "otp-1"}, ChannelType::Sms);        // a caller retry: same dedup key
    svc.setTime(10 * 3600);                                                       // 10 am
    long d = svc.send({"ravi", "shipped", {{"order", "#42"}}, Priority::Normal, ""}, ChannelType::Email);
    long e = svc.send({"ravi", "promo", {{"name", "Ravi"}, {"offer", "free delivery"}}, Priority::Low, ""}, ChannelType::Email);
    long f = svc.send({"ravi", "promo", {{"name", "Ravi"}, {"offer", "new arrivals"}}, Priority::Low, ""}, ChannelType::Email);   // third in an hour: rate limited

    cout << "processing the queue (high priority first, then FIFO):\n";
    svc.processAll();

    cout << "statuses:\n";
    for (auto [label, id] : vector<pair<string, long>>{{"promo to asha at 11pm", a}, {"otp to asha", b}, {"otp retried by caller", c}, {"shipped to ravi", d}, {"promo 1 to ravi", e}, {"promo 2 to ravi", f}})
        cout << "  " << label << ": " << svc.statusOf(id) << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Unknown template | dropped with a reason at accept time (fail fast) |
| All channels fail | marked Failed after the retry limit; optionally try the next channel (fallback chain) |
| Duplicate API call | de-dup by key within a window |
| Quiet hours across midnight | the hour comparison handles wrap-around |
| Worker crash mid-delivery | durable queue + at-least-once delivery; channels must tolerate duplicates (idempotency key) |
| Huge bursts | bounded queue with back-pressure; shed LOW priority first |
| Time zones | quiet hours use the user's zone (store an offset) |
| Template injection | escape parameters according to the channel (HTML for email) |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Add WhatsApp or Slack" | a new `Channel` class and registration |
| "Scheduled and recurring notifications" | a scheduler (priority queue by time) feeding the queue |
| "Batch / digest (daily summary)" | an aggregator filter that holds LOW messages and emits one digest |
| "Delivery receipts and read tracking" | channels call back; status becomes Delivered/Read (Observer) |
| "Multi-tenant with quotas" | tenant id in the request; per-tenant rate filters |
| "Scale: millions per minute" | partition the queue by user id; stateless workers; Kafka as the durable queue (HLD) |
| "Provider failover" | a `ResilientChannel` decorator with circuit breaker and secondary provider |
| "Audit and compliance" | event log of every decision and delivery |

```quiz
? Why implement the checks as a chain of filters?
- It is shorter
+ Each rule is independent and a new rule is a new filter; the first refusal drops the request with a reason
- Chains are faster
> Open for extension, with clear, testable rules.
? Why does the HIGH priority skip quiet hours and rate limits?
- By mistake
+ Security messages like OTPs must always arrive immediately
- Because they are short
> Priority semantics are part of the contract.
```

:::keypoints
- Accept (filters: dedup, preferences, rate limit) then deliver (priority queue, workers, retries with backoff).
- Channels and templates are extension points; status is queryable by id; duplicates are dropped by key.
- At-least-once delivery means idempotent channels; scale by partitioning the queue.
:::
