---
title: Design a Calendar and Meeting Scheduler
level: advanced
time: 70
summary: Events with time ranges, finding clashes quickly, events that repeat, attendees and rooms, finding free time that suits several people by merging busy times, reminders, and the simple interval ideas behind it all.
---

:::problem Design a Calendar and Meeting Scheduler {level=hard tags="intervals,algorithms,recurrence,Strategy,Observer,booking"}
Design a calendar like Google Calendar. Users create events (one time or repeating), invite people, and book meeting rooms. The system must find clashes, show a user's events in a date range (including repeating ones), suggest **free time slots** that work for several people, and send reminders. Keep it easy to extend: new repeat rules, working hours, room rules.
:::

:::hint Hint
Almost everything here is **work with time ranges**. Use ranges that include the start but not the end, `[start, end)`. Keep each calendar's events **sorted by start**. Find clashes with a binary search. Find common free time by **merging busy ranges** and then looking at the gaps. A repeating event is a **rule that makes occurrences when asked**. Never store thousands of copies.
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Time? | minutes from a fixed midnight (integers). Time zones are only for showing times (store UTC) |
| Events? | title, time range, organiser, attendees, an optional room, an optional repeat rule |
| Clashes? | a user cannot accept two events that overlap (warn or refuse, by policy). A room cannot have two overlapping events |
| Repeating? | daily, weekly (on chosen weekdays), with an end date or a count. Exceptions (cancel one occurrence) |
| Questions to answer? | `eventsBetween(user, from, to)` including the repeats |
| Find a slot? | for some attendees, a length of time and a window, give the earliest free slot (or slots) that suits all of them, inside working hours |
| Reminders? | N minutes before the start (Observer) |
| Many threads? | a lock for each calendar. Booking a room checks and saves in one step |
| Not needed | time zones, RSVP steps, outside calendars (iCal), how messages are sent |

## Step 2: The key ideas about time ranges

**Overlap test**: `a.start < b.end && b.start < a.end`.

**Finding a clash in a sorted list.** If events are sorted by start and do not overlap, find the first event whose `start >= new.end` using a binary search. Only the event **just before it** can overlap the new event. This is O(log n).

**Finding common free time** for several people:

```text
person A busy: [9,11) [13,14)
person B busy: [10,12) [15,16)
1) merge all busy intervals (sort by start, combine overlaps):  [9,12) [13,14) [15,16)
2) free gaps within the window [9,17):  [12,13) [14,15) [16,17)
3) keep gaps with length >= desired duration
```

## Step 3: Find the classes

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

## Step 4: Design decisions

- **`TimeRange`** is a small value (it includes the start, not the end) with `overlaps`, like in the toolkit.
- **Each user's calendar** keeps events in a `std::map<start, Event>` (ordered), so finding neighbours is O(log n). A repeating event is stored once, with its rule.
- **Repeating is a Strategy** (`RecurrenceRule::occurrences(first, window)`): it returns the occurrence ranges that touch a query window. `DailyRule(every N days, until)` and `WeeklyRule(weekdays, until)`. New rules (monthly, "second Tuesday") are new classes. **Exceptions** are a set of cancelled occurrence start times on the event.
- **Clash check for a repeating event:** list its occurrences within a horizon (say 1 year) and check each against the calendar. A cheaper way is to keep repeating events apart and compare rule against rule.
- **Safe booking across many calendars:** lock all attendee calendars and the room **in a fixed order** (by id) with `scoped_lock`, check every calendar for clashes, then save everywhere. If any check fails, save nowhere.
- **Free slot search:** collect each attendee's busy ranges in the window (expanding repeats), merge them, take the gaps inside **working hours**, and keep those that are long enough.
- **Reminders:** a scheduler (see the task scheduler lesson) calls `onReminder` at `start - N`.

## Step 5: The code

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

| Case | What happens |
|---|---|
| Events one after the other | the end is not included, so there is no clash |
| A repeating event with an exception | the `cancelled` set holds the start times of skipped occurrences |
| A repeat with no end | store the rule. Always ask with a window. Clash checks use a horizon |
| An event that crosses midnight or lasts many days | ranges are absolute times. The day grid is only for showing |
| Daylight saving and time zones | store UTC. Expand repeats in the **organiser's local time**, then convert |
| Busy ranges that overlap when merging | use `b.start <= last.end` and extend the end |
| A race to book the same room | locks are taken in a fixed order. All checks come before any save |
| Changing one occurrence, or "this and the following" | split the series: add an exception and make a new event with its own rule |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "Suggest the best slot, not just any" | rank slots with a `SlotScorer` (prefer mornings, fewer gaps, avoid lunch) |
| "Find a room with the right size and equipment" | a `RoomFinder` with conditions (Specification) |
| "Working hours and time zones for each user" | an `Availability` for each user. Take the common part |
| "RSVP states and delegates" | an `Attendance` for each attendee (Accepted, Declined, Tentative). A declined event does not block |
| "Reminders and messages" | a scheduler and a `ReminderListener` (Observer) |
| "iCal import and export, outside calendars" | adapters (Adapter pattern) |
| "Millions of users" | split calendars by user, keep an index of busy time, cache free and busy summaries |
| "Fast clash check" | an interval tree, or a sorted vector with binary search, instead of scanning |
| "Double-booking rules" | a `ConflictPolicy` (refuse, warn, allow) |

## Short answer to say in an interview

:::interview How do you find a free slot for several people?
"I take each person's busy ranges in the window, expanding repeating events, and merge them into one busy list: sort by start and join the ones that overlap. Then I look at the gaps between the merged ranges, limited to working hours, and keep the gaps that are long enough for the meeting. Ranges include the start and not the end, so back-to-back meetings do not clash. For booking, I lock all the calendars in a fixed order, check each for a clash, and then save in all of them or in none."
:::

```quiz
? How do you find common free time for several people?
- Compare calendars day by day by hand
+ Merge everyone's busy ranges, then take the gaps (inside working hours) that are long enough
- Sort events by name
> Merging ranges turns many calendars into one busy list.
? Why store a repeating event as a rule and not as many copies?
- It is easier to print
+ The series can go on for ever, and one change to the rule or one exception changes all occurrences
- Copies are not allowed
> Occurrences are made when asked, for a window.
```

:::keypoints
- A `TimeRange` that includes the start but not the end. Sorted storage for each user. The overlap test. Repeats as a rule strategy with exceptions.
- Safe booking over many calendars: lock in a fixed order, check all, then save all.
- Free slots = merge the busy ranges and look at the gaps in working hours. Extend with scoring, room rules and splitting by user.
:::
