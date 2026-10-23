---
title: Design a Calendar and Meeting Scheduler
level: advanced
time: 70
summary: Events with time ranges, conflict detection with an ordered structure, recurring events expanded lazily, attendees and rooms, finding common free slots across several calendars by merging busy intervals, reminders, and the interval algorithms behind it all.
---

:::problem Design a Calendar and Meeting Scheduler {level=hard tags="intervals,algorithms,recurrence,Strategy,Observer,booking"}
Design a calendar like Google Calendar. Users create events (one-off or recurring), invite attendees, and book meeting rooms. The system must detect conflicts, show a user's events in a date range (expanding recurring events), suggest **free time slots** that work for several people, and send reminders. Keep it extensible: new recurrence rules, working hours, room constraints.
:::

:::hint Hint
Almost everything is **interval arithmetic**. Use half-open ranges `[start, end)`, keep each calendar's events **sorted by start**, find overlaps with a binary search, and find common free time by **merging busy intervals** then scanning the gaps. Recurrence is a **rule that generates occurrences on demand**; never store thousands of copies.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Time? | minutes since a reference midnight (integers); timezones are a presentation layer (store UTC) |
| Events? | title, time range, organiser, attendees, optional room, optional recurrence |
| Conflicts? | a user cannot accept two overlapping events (warn or refuse, by policy); a room cannot host two overlapping events |
| Recurrence? | daily, weekly (on weekdays), with an end date or a count; exceptions (cancel one occurrence) |
| Queries? | `eventsBetween(user, from, to)` including expanded occurrences |
| Find a slot? | given attendees, a duration and a window, return the earliest common free slot(s) within working hours |
| Reminders? | N minutes before start (Observer) |
| Concurrency? | per-calendar locks; booking a room is check-and-insert atomically |
| Out of scope | time zones, RSVP workflows, external calendars (iCal), notifications delivery |

## Step 2: the key interval algorithms

**Overlap**: `a.start < b.end && b.start < a.end`.

**Conflict check in a sorted list**: with events sorted by start and non-overlapping, find the first event with `start >= new.end` (binary search); only its **predecessor** can overlap the new event. O(log n).

**Common free slots** for several people:

```text
person A busy: [9,11) [13,14)
person B busy: [10,12) [15,16)
1) merge all busy intervals (sort by start, combine overlaps):  [9,12) [13,14) [15,16)
2) free gaps within the window [9,17):  [12,13) [14,15) [16,17)
3) keep gaps with length >= desired duration
```

## Step 3: entities

```viz algo=uml title="Calendar"
class CalendarService
  + schedule(e: EventSpec): Result<EventId>
  + cancel(id: EventId): bool
  + eventsBetween(user: string, from: Time, to: Time): Occurrence[]
  + findSlots(users: string[], duration: Minutes, window: TimeRange): TimeRange[]
class UserCalendar
  - events: map<Time, Event>
  - lock: mutex
  + tryAdd(e: Event): bool
  + remove(id: EventId): void
  + busyIn(window: TimeRange): TimeRange[]
class Event
  - id: EventId
  - title: string
  - range: TimeRange
  - attendees: string[]
  - room: string
  - recurrence: RecurrenceRule
class TimeRange
  + overlaps(o: TimeRange): bool
interface RecurrenceRule
  + occurrences(first: TimeRange, window: TimeRange): TimeRange[]
class NoRepeat
class DailyRule
class WeeklyRule
class RoomCalendar
interface ReminderListener
  + onReminder(e: Event, minutesBefore: int): void
CalendarService *-- UserCalendar
CalendarService *-- RoomCalendar
UserCalendar *-- Event
Event --> RecurrenceRule
Event --> TimeRange
NoRepeat ..|> RecurrenceRule
DailyRule ..|> RecurrenceRule
WeeklyRule ..|> RecurrenceRule
CalendarService o-- ReminderListener
```

## Step 4: design decisions

- **`TimeRange`** value type (half-open) with `overlaps`, as in the toolkit.
- **Per-user calendar** keeps events in a `std::map<start, Event>` (ordered): neighbour lookups are O(log n). Recurring events are stored once, with their rule.
- **Recurrence as a Strategy** (`RecurrenceRule::occurrences(first, window)`): returns the occurrence ranges that intersect a query window. `DailyRule(every N days, until)`, `WeeklyRule(weekdays, until)`. New rules (monthly, "second Tuesday") are new classes. **Exceptions** are a set of cancelled occurrence starts on the event.
- **Conflict checking for a recurring event** expands its occurrences within a horizon (say 1 year) and checks each against the calendar. Cheaper alternatives: store recurring events separately and test rule-vs-rule.
- **Atomic booking with multiple calendars**: lock all attendee calendars and the room in a **fixed order** (by id) with `scoped_lock`, check every calendar for conflicts, then insert everywhere; otherwise insert nowhere.
- **Free-slot search**: collect each attendee's busy intervals in the window (expanding recurrences), merge, take the gaps inside **working hours**, filter by duration.
- **Reminders**: a scheduler (see the task scheduler lesson) triggers `onReminder` at `start - N`.

## Step 5: the code

```cpp run title="Conflict detection, recurrence, and common free slots"
#include <algorithm>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <set>
#include <string>
#include <vector>
using namespace std;

using Time = long;                                           // minutes since the start of day 0
constexpr Time kDay = 24 * 60;

class TimeRange {
    Time s_, e_;
public:
    TimeRange(Time s, Time e) : s_(s), e_(e) { if (e <= s) throw invalid_argument("end must be after start"); }
    Time start() const { return s_; } Time end() const { return e_; } Time length() const { return e_ - s_; }
    bool overlaps(const TimeRange& o) const { return s_ < o.e_ && o.s_ < e_; }
};
string clockStr(Time t) { long d = t / kDay, m = t % kDay; return "d" + to_string(d) + " " + (m / 60 < 10 ? "0" : "") + to_string(m / 60) + ":" + (m % 60 < 10 ? "0" : "") + to_string(m % 60); }
string str(const TimeRange& r) { return "[" + clockStr(r.start()) + " - " + clockStr(r.end()) + ")"; }

// ---------- recurrence ----------
struct RecurrenceRule {
    virtual ~RecurrenceRule() = default;
    virtual vector<TimeRange> occurrences(const TimeRange& first, const TimeRange& window) const = 0;     // those that intersect the window
};
struct NoRepeat : RecurrenceRule {
    vector<TimeRange> occurrences(const TimeRange& first, const TimeRange& w) const override { return first.overlaps(w) ? vector<TimeRange>{first} : vector<TimeRange>{}; }
};
struct DailyRule : RecurrenceRule {
    int everyDays; int count;                                // `count` occurrences in total
    DailyRule(int e, int c) : everyDays(e), count(c) {}
    vector<TimeRange> occurrences(const TimeRange& first, const TimeRange& w) const override {
        vector<TimeRange> out;
        for (int i = 0; i < count; ++i) { TimeRange r(first.start() + i * everyDays * kDay, first.end() + i * everyDays * kDay); if (r.start() >= w.end()) break; if (r.overlaps(w)) out.push_back(r); }
        return out;
    }
};
struct WeeklyRule : RecurrenceRule {
    set<int> weekdays; int weeks;                            // weekdays 0..6 relative to the first event's day 0 = Monday (demo), for `weeks` weeks
    WeeklyRule(set<int> d, int w) : weekdays(move(d)), weeks(w) {}
    vector<TimeRange> occurrences(const TimeRange& first, const TimeRange& w) const override {
        vector<TimeRange> out; Time firstDay = first.start() / kDay;
        for (int wk = 0; wk < weeks; ++wk) for (int wd : weekdays) {
            Time day = (firstDay / 7) * 7 + wk * 7 + wd;
            if (day < firstDay) continue;
            Time shift = (day - firstDay) * kDay;
            TimeRange r(first.start() + shift, first.end() + shift);
            if (r.start() >= w.end()) continue;
            if (r.overlaps(w)) out.push_back(r);
        }
        sort(out.begin(), out.end(), [](auto& a, auto& b) { return a.start() < b.start(); });
        return out;
    }
};

struct Event { int id; string title; TimeRange first; set<string> attendees; string room; shared_ptr<RecurrenceRule> rule; set<Time> cancelled; };

const Time kHorizon = 30 * kDay;                             // conflict checks look 30 days ahead (demo)

class UserCalendar {
    map<int, Event> events_;
    mutable mutex m_;
public:
    mutex& lock() const { return m_; }
    // caller holds the lock
    vector<TimeRange> busyLocked(const TimeRange& window) const {
        vector<TimeRange> out;
        for (auto& [id, e] : events_) for (auto& r : e.rule->occurrences(e.first, window)) if (!e.cancelled.count(r.start())) out.push_back(r);
        sort(out.begin(), out.end(), [](auto& a, auto& b) { return a.start() < b.start(); });
        return out;
    }
    bool conflictsLocked(const Event& e) const {
        TimeRange horizon(e.first.start(), e.first.start() + kHorizon);
        auto mine = e.rule->occurrences(e.first, horizon);
        auto busy = busyLocked(horizon);
        for (auto& m : mine) for (auto& b : busy) if (m.overlaps(b)) return true;       // (a production version would binary-search a sorted index)
        return false;
    }
    void addLocked(const Event& e) { events_.emplace(e.id, e); }
    void removeLocked(int id) { events_.erase(id); }
    vector<TimeRange> busy(const TimeRange& w) const { lock_guard l(m_); return busyLocked(w); }
};

struct ReminderListener { virtual ~ReminderListener() = default; virtual void onReminder(const Event& e, int minutesBefore) = 0; };

class CalendarService {
    map<string, UserCalendar> users_; map<string, UserCalendar> rooms_;
    int nextId_ = 1;
public:
    UserCalendar& user(const string& n) { return users_[n]; }
    UserCalendar& room(const string& n) { return rooms_[n]; }

    // atomically book: every attendee and the room must be free, otherwise nothing changes
    optional<int> schedule(string title, TimeRange first, set<string> attendees, string roomName, shared_ptr<RecurrenceRule> rule, string& why) {
        Event e{nextId_, move(title), first, move(attendees), move(roomName), move(rule), {}};
        vector<pair<string, UserCalendar*>> cals;
        for (auto& a : e.attendees) cals.push_back({"user:" + a, &users_[a]});
        if (!e.room.empty()) cals.push_back({"room:" + e.room, &rooms_[e.room]});
        sort(cals.begin(), cals.end(), [](auto& a, auto& b) { return a.first < b.first; });                      // fixed lock order: no deadlock
        vector<unique_lock<mutex>> locks; for (auto& [n, c] : cals) locks.emplace_back(c->lock());
        for (auto& [n, c] : cals) if (c->conflictsLocked(e)) { why = "conflict for " + n; return nullopt; }
        for (auto& [n, c] : cals) c->addLocked(e);
        return nextId_++;
    }

    // earliest slots where everybody is free, inside daily working hours
    vector<TimeRange> findSlots(const vector<string>& people, Time duration, const TimeRange& window, Time workStart, Time workEnd) {
        vector<TimeRange> busy;
        for (auto& p : people) { auto b = users_[p].busy(window); busy.insert(busy.end(), b.begin(), b.end()); }
        sort(busy.begin(), busy.end(), [](auto& a, auto& b) { return a.start() < b.start(); });
        vector<TimeRange> merged;                            // 1) merge overlapping busy intervals
        for (auto& b : busy) { if (!merged.empty() && b.start() <= merged.back().end()) { if (b.end() > merged.back().end()) merged.back() = TimeRange(merged.back().start(), b.end()); } else merged.push_back(b); }
        vector<TimeRange> slots;
        for (Time day = window.start() / kDay; day * kDay < window.end(); ++day) {      // 2) the gaps inside working hours of each day
            Time cursor = day * kDay + workStart, limit = day * kDay + workEnd;
            for (auto& m : merged) {
                if (m.end() <= cursor || m.start() >= limit) continue;
                if (m.start() - cursor >= duration) slots.push_back(TimeRange(cursor, m.start()));
                cursor = max(cursor, m.end());
            }
            if (limit - cursor >= duration) slots.push_back(TimeRange(cursor, limit));
        }
        return slots;
    }
};

int main() {
    CalendarService cal; string why;
    auto h = [](int hour, int min = 0) { return static_cast<Time>(hour * 60 + min); };
    auto mk = [&](Time day, int h1, int h2) { return TimeRange(day * kDay + h1 * 60, day * kDay + h2 * 60); };

    auto id1 = cal.schedule("Design review", mk(0, 10, 11), {"asha", "ravi"}, "Room A", make_shared<NoRepeat>(), why);
    cout << "design review (asha, ravi, Room A) 10:00-11:00: " << (id1 ? "scheduled" : why) << "\n";
    auto id2 = cal.schedule("1:1", mk(0, 10, 11) , {"meera", "ravi"}, "", make_shared<NoRepeat>(), why);
    cout << "meera+ravi 10:00-11:00: " << (id2 ? "scheduled" : "refused: " + why) << "\n";
    auto id3 = cal.schedule("Interview", mk(0, 10, 11), {"kiran"}, "Room A", make_shared<NoRepeat>(), why);
    cout << "kiran in Room A 10:00-11:00: " << (id3 ? "scheduled" : "refused: " + why) << "\n";
    auto id4 = cal.schedule("Back to back", mk(0, 11, 12), {"ravi"}, "", make_shared<NoRepeat>(), why);
    cout << "ravi 11:00-12:00 (starts when the review ends): " << (id4 ? "scheduled" : why) << "\n";

    cout << "recurring: daily stand-up for asha, 5 days (days 1-5) at 9:30-10:00\n";
    auto id5 = cal.schedule("Stand-up", TimeRange(1 * kDay + h(9, 30), 1 * kDay + h(10)), {"asha"}, "", make_shared<DailyRule>(1, 5), why);
    cout << "  " << (id5 ? "scheduled" : why) << "\n";
    auto clash = cal.schedule("Dentist", TimeRange(3 * kDay + h(9, 45), 3 * kDay + h(10, 30)), {"asha"}, "", make_shared<NoRepeat>(), why);
    cout << "  asha's dentist on day 3 at 9:45 (hits the 3rd stand-up): " << (clash ? "scheduled" : "refused: " + why) << "\n";

    cout << "asha's busy time on days 0-2:\n";
    for (auto& r : cal.user("asha").busy(TimeRange(0, 3 * kDay))) cout << "  " << str(r) << "\n";

    cout << "find a 60-minute slot for asha, ravi and meera on day 0, working hours 9:00-17:00:\n";
    cal.schedule("Meera's workshop", mk(0, 13, 15), {"meera"}, "", make_shared<NoRepeat>(), why);
    for (auto& s : cal.findSlots({"asha", "ravi", "meera"}, 60, TimeRange(0, kDay), h(9), h(17))) cout << "  free: " << str(s) << "\n";

    cout << "weekly meeting, Mon and Wed for 3 weeks (days 0..): conflicts are checked across the horizon\n";
    auto w = cal.schedule("Sync", TimeRange(14 * kDay + h(15), 14 * kDay + h(16)), {"kiran"}, "", make_shared<WeeklyRule>(set<int>{0, 2}, 3), why);
    cout << "  " << (w ? "scheduled" : why) << ", occurrences:\n";
    for (auto& r : cal.user("kiran").busy(TimeRange(14 * kDay, 40 * kDay))) cout << "    " << str(r) << "\n";
}
```

## Edge cases

| Case | Handling |
|---|---|
| Back-to-back events | half-open ranges: no conflict |
| Recurring event with an exception | `cancelled` set holds skipped occurrence starts |
| "Infinite" recurrence | store the rule; always query with a window; conflict checks use a horizon |
| Event spanning midnight or multiple days | ranges are absolute times; the day grid is only for display |
| Daylight saving and time zones | store UTC; expand recurrence in the **organiser's local time**, then convert |
| Overlapping busy intervals when merging | use `b.start <= last.end` and extend the end |
| Booking race on the same room | locks acquired in a fixed order; all checks before any insert |
| Editing a single occurrence or "this and following" | split the series: add an exception and create a new event with its own rule |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Suggest the best slot, not just any" | rank slots with a `SlotScorer` (prefer mornings, minimise gaps, avoid lunch) |
| "Find a room with capacity and equipment" | a `RoomFinder` with constraints (Specification) |
| "Working hours and time zones per user" | `Availability` per user; intersect |
| "RSVP states and delegation" | `Attendance` per attendee (Accepted/Declined/Tentative); a declined event does not block |
| "Reminders and notifications" | scheduler + `ReminderListener` (Observer) |
| "iCal import/export, external calendars" | adapters (Adapter pattern) |
| "Scale to millions of users" | calendars sharded by user; busy-time index; free/busy as a cached aggregate |
| "Fast conflict check" | an interval tree or sorted vector with binary search instead of scanning |
| "Overbooking policies" | a `ConflictPolicy` (refuse / warn / allow) |

```quiz
? How do you find common free time for several people?
- Compare calendars day by day by hand
+ Merge everyone's busy intervals, then take the gaps (inside working hours) that are long enough
- Sort events alphabetically
> Merging intervals turns many calendars into one busy list.
? Why store a recurring event as a rule instead of many copies?
- It is easier to print
+ The series can be unbounded, and one edit to the rule or an exception changes all occurrences
- Copies are not allowed
> Occurrences are generated on demand for a window.
```

:::keypoints
- Half-open `TimeRange`, sorted per-user storage, overlap test; recurrence as a rule strategy with exceptions.
- Atomic multi-calendar booking: lock in a fixed order, check all, then insert all.
- Free slots = merge busy intervals + scan gaps inside working hours; extend with scoring, room constraints and sharding.
:::
