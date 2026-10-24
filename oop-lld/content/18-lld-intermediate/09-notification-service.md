---
title: Design a Notification Service
level: intermediate
time: 60
summary: A service that sends messages to users by email, SMS and push. Learn templates, user preferences and quiet hours, priorities, retry with waiting time between tries, limits against spam, removing duplicates, and sending on worker threads.
---

:::problem Design a Notification Service {level=medium tags="Strategy,Chain of Responsibility,async,retry,Observer,infrastructure"}
Design a service that other systems call to notify users (order shipped, OTP, offers). It must support several channels (email, SMS, push), message templates, user preferences (channels turned off, quiet hours), priorities (an OTP before an offer), retries when a channel fails, and protection against spamming a user. Sending happens in the background. The caller gets a notification id and can ask for its status later.
:::

:::hint Hint
Think in two layers. First **accept and decide** (check the request, apply preferences, limit, remove duplicates: a chain of checks). Then **deliver** (a priority queue and workers that call the channels, with retry). Channels and templates are the parts that can be extended.
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Channels? | email, SMS, push. More later |
| What starts it? | an API call: `send(userId, templateId, params, priority)` |
| Templates? | text with `{placeholders}` for each channel |
| Preferences? | for each user: which channels are allowed for each type of message, and quiet hours (for offers only) |
| Priority? | HIGH (OTP, security) ignores quiet hours and limits. NORMAL. LOW (offers) |
| If it fails? | retry up to 3 times, waiting longer each time. Then mark FAILED, or try another channel |
| Spam control? | at most N messages for each user in an hour (not for HIGH) |
| Duplicates? | the same `dedupKey` within 10 minutes is dropped |
| Status? | Queued, Sent, Failed, Dropped (with a reason). Can be asked by id |
| Many threads? | worker threads take messages from a priority queue |

## Step 2: The pipeline

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

## Step 3: Find the classes

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

## Step 4: Design decisions

- **Filters are a Chain of Responsibility:** duplicate check, then preferences, then rate limit. Each says `Accept` or `Drop(reason)`. A new rule (blocked sender, legal hours) is a new filter.
- **Channel is a Strategy.** The user's preferred order of channels decides where to try first, with a list of backups.
- **TemplateEngine** replaces `{name}` placeholders. Templates are data.
- **A priority queue and worker threads** (a blocking queue ordered by `(priority high first, sequence old first)`): HIGH always goes before LOW, and the order inside one priority is first come, first served.
- **Retry with waiting time** is done by the worker. The delay uses a clock we pass in. The demo uses a pretend clock so it is instant and predictable.
- **A status store** keyed by id answers `status()`. States: Queued, then Sent, Failed or Dropped.
- **Safe repeats:** the duplicate key stops double delivery when callers repeat their API call.

## Step 5: The code

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

| Case | What happens |
|---|---|
| Unknown template | dropped with a reason when accepted (fail early) |
| All channels fail | marked Failed after the retry limit. Optionally try the next channel (a chain of backups) |
| The same API call twice | the duplicate key catches it within the time window |
| Quiet hours that cross midnight | the hour comparison handles the wrap |
| A worker crashes during delivery | a durable queue and at-least-once delivery. Channels must handle duplicates (an idempotency key) |
| Huge bursts | a limited queue that pushes back. Drop LOW priority first |
| Time zones | quiet hours use the user's zone (save an offset) |
| Template injection | escape the values for the channel (HTML for email) |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Add WhatsApp or Slack" | a new `Channel` class and one registration |
| "Scheduled and repeating messages" | a scheduler (a priority queue by time) that feeds the queue |
| "A daily summary instead of many messages" | an aggregator filter that holds LOW messages and sends one summary |
| "Delivery and read receipts" | channels call back, and the status becomes Delivered or Read (Observer) |
| "Many customers (tenants) with quotas" | a tenant id in the request, and limit filters for each tenant |
| "Millions of messages each minute" | split the queue by user id, workers with no state, Kafka as the durable queue (HLD) |
| "If a provider is down" | a `ResilientChannel` decorator with a circuit breaker and a second provider |
| "Audit and rules" | a log of every decision and every delivery |

## Short answer to say in an interview

:::interview How do you design a notification service?
"I split it into two layers. The first layer accepts and decides: a chain of filters checks for duplicates, user preferences and rate limits, and drops a message with a reason if it fails. The second layer delivers: messages go into a priority queue so OTPs go before offers, and worker threads send them through channel strategies, with retries and increasing waiting times. Templates are data. Status can be asked by id. Delivery is at-least-once, so channels must handle duplicates."
:::

```quiz
? Why make the checks a chain of filters?
- It is shorter
+ Each rule is separate, a new rule is a new filter, and the first refusal drops the request with a reason
- Chains are faster
> Open for adding, with clear rules that are easy to test.
? Why does HIGH priority skip quiet hours and rate limits?
- By mistake
+ Security messages like OTPs must always arrive at once
- Because they are short
> Priority is part of the promise.
```

:::keypoints
- Accept (filters: duplicates, preferences, rate limit), then deliver (priority queue, workers, retries with waiting time).
- Channels and templates can be extended. Status can be asked by id. Duplicates are dropped by a key.
- At-least-once delivery needs safe repeats. To scale, split the queue.
:::
