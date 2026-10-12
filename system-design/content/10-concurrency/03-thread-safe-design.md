---
title: Thread-Safe Design — Deadlocks, Granularity, CAS and Booking Races
level: advanced
time: 55
summary: Designing classes that stay correct under concurrency — the four deadlock conditions and how to break them (lock ordering, scoped_lock, timeouts), coarse vs fine-grained vs striped locking, optimistic concurrency with compare-and-swap, a double-booking-proof seat reservation system in C++ and JavaScript, and a checklist for LLD answers.
---

The previous lessons covered the tools. This one is about **design decisions**: how to lock without deadlocking, how much to lock, when to avoid locks altogether, and how to make the classic LLD race ("two users book the same seat") impossible.

## Deadlock

:::def Deadlock
Two or more tasks each wait for a resource held by another, so none can ever proceed. Thread 1 holds lock A and waits for B; thread 2 holds B and waits for A.
:::

A deadlock needs **all four** of the Coffman conditions:

1. **Mutual exclusion**: resources can't be shared (locks).
2. **Hold and wait**: a task holds one resource while waiting for another.
3. **No preemption**: resources can't be taken away.
4. **Circular wait**: a cycle of tasks, each waiting for the next.

Break **any one** and deadlock is impossible. The practical techniques:

| Technique | Breaks | Example |
|---|---|---|
| **Global lock ordering**: always acquire locks in the same order (e.g. by account id) | circular wait | transfer(a, b) locks min(id) first |
| **Acquire all at once** (`std::scoped_lock(m1, m2)`) | hold and wait | locks both or neither, internally deadlock-free |
| **Try-lock with timeout**, back off and retry | hold and wait / no preemption | `try_lock_for`; release everything on failure |
| **One lock** (coarser) or **no locks** (single-writer, messages, immutability) | mutual exclusion | an actor or queue owns the state |

:::tabs Transfers that can't deadlock
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Account { int id; long balance; mutex m; Account(int i, long b) : id(i), balance(b) {} };

// ✗ Deadlock-prone: transfer(a,b) locks a then b; a concurrent transfer(b,a) locks b then a.
// void transferBad(Account& from, Account& to, long amt) { lock_guard l1(from.m); lock_guard l2(to.m); ... }

// ✓ Option 1: scoped_lock acquires both mutexes with a deadlock-avoidance algorithm
bool transfer(Account& from, Account& to, long amount) {
    if (&from == &to) return false;
    scoped_lock lock(from.m, to.m);
    if (from.balance < amount) return false;
    from.balance -= amount;
    to.balance += amount;
    return true;
}

// ✓ Option 2: a global order (lowest id first), the approach that also works across systems
bool transferOrdered(Account& from, Account& to, long amount) {
    if (&from == &to) return false;
    Account& first = from.id < to.id ? from : to;
    Account& second = from.id < to.id ? to : from;
    lock_guard l1(first.m);
    lock_guard l2(second.m);
    if (from.balance < amount) return false;
    from.balance -= amount;
    to.balance += amount;
    return true;
}

int main() {
    Account a{1, 1000}, b{2, 1000};
    vector<thread> ts;
    for (int i = 0; i < 4; i++) {
        ts.emplace_back([&] { for (int k = 0; k < 2000; k++) transfer(a, b, 1); });          // a -> b
        ts.emplace_back([&] { for (int k = 0; k < 2000; k++) transferOrdered(b, a, 1); });   // b -> a, opposite direction
    }
    for (auto& t : ts) t.join();
    cout << "finished without deadlock; total money conserved: " << a.balance + b.balance << " (a=" << a.balance << ", b=" << b.balance << ")\n";
}
```
```js run
// Async code deadlocks too: two tasks each holding one async lock and awaiting the other.
// The fix is the same: acquire per-key locks in a global order.
class KeyedMutex {                                         // one async lock per key
  #tails = new Map();
  async lock(key) {
    const prev = this.#tails.get(key) ?? Promise.resolve();
    let release;
    const mine = new Promise((r) => (release = r));
    this.#tails.set(key, prev.then(() => mine));
    await prev;
    return () => { release(); if (this.#tails.get(key) === mine) this.#tails.delete(key); };
  }
}

const locks = new KeyedMutex();
const accounts = { A: 1000, B: 1000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function transfer(from, to, amount) {
  const [first, second] = [from, to].sort();               // global order: alphabetical
  const r1 = await locks.lock(first);
  try {
    await sleep(1);                                        // some async work while holding the first lock
    const r2 = await locks.lock(second);
    try {
      if (accounts[from] < amount) return false;
      accounts[from] -= amount;
      accounts[to] += amount;
      return true;
    } finally { r2(); }
  } finally { r1(); }
}

const jobs = [];
for (let i = 0; i < 50; i++) jobs.push(transfer("A", "B", 7), transfer("B", "A", 5));
await Promise.all(jobs);
console.log(`finished without deadlock; total = ${accounts.A + accounts.B} (A=${accounts.A}, B=${accounts.B})`);
```
:::

Related hazards: **livelock** (tasks keep reacting to each other and retrying without progress, fixed with randomised backoff) and **starvation** (a task never gets the lock because others always win, fixed with fair queues).

## How much to lock: granularity

| Strategy | Example | Pros | Cons |
|---|---|---|---|
| **Coarse**: one lock for the whole structure | one mutex around the entire parking lot | simple, obviously correct | no parallelism: every operation waits |
| **Fine**: one lock per item | one mutex per parking spot / seat / account | high parallelism | more memory, deadlock risk across items |
| **Striped**: N locks, item → lock by `hash(key) % N` | 64 locks for a million seats | bounded memory, good parallelism | occasional false contention |
| **Lock-free**: atomics / CAS | an atomic counter, a CAS on a seat's owner | no blocking at all | hard to get right beyond simple cases |

Start coarse and correct; make it finer only where contention is real. In an interview, saying "one lock per show, since bookings for different shows never conflict" is the kind of reasoning that impresses.

## Optimistic concurrency: compare-and-swap

Locks are **pessimistic**: they assume conflicts and prevent them. **Optimistic** concurrency assumes conflicts are rare: read, compute, then **commit only if nothing changed**, retrying otherwise.

:::def Compare-and-swap (CAS)
An atomic operation: "set X to `new` **only if** X still equals `expected`; tell me whether it worked". It's the hardware primitive behind atomics and lock-free structures (C++ `compare_exchange_weak/strong`), and the same idea as SQL's `UPDATE … WHERE version = ?`.
:::

## The classic: no double booking

**Requirement:** a show has seats; many users try to book concurrently; a seat must never be sold twice; booking several seats is all-or-nothing.

Below, the C++ version uses **CAS per seat** (lock-free) with rollback for multi-seat bookings; the JavaScript version uses a **per-show async lock**, which is what you'd do when booking involves awaits (payment holds, DB calls):

:::tabs A seat booking system that can't double-book
```cpp run
#include <bits/stdc++.h>
using namespace std;

class Show {
    vector<atomic<int>> seatOwner_;                       // 0 = free, otherwise the user id
public:
    explicit Show(int seats) : seatOwner_(seats) { for (auto& s : seatOwner_) s.store(0); }

    // All-or-nothing booking of several seats, lock-free with compare-and-swap
    bool book(int user, const vector<int>& seats) {
        vector<int> taken;
        for (int s : seats) {
            int expected = 0;
            if (seatOwner_[s].compare_exchange_strong(expected, user)) taken.push_back(s);   // claim if still free
            else {                                                                           // someone else got it
                for (int t : taken) seatOwner_[t].store(0);                                  // roll back our claims
                return false;
            }
        }
        return true;
    }
    int owner(int s) const { return seatOwner_[s].load(); }
    int size() const { return seatOwner_.size(); }
};

int main() {
    Show show(10);
    atomic<int> successes{0};
    vector<thread> users;
    for (int u = 1; u <= 40; u++)                          // 40 users race for 10 seats, each wanting a pair
        users.emplace_back([&, u] {
            int s = (u * 7) % 9;                           // popular pairs overlap heavily
            if (show.book(u, {s, s + 1})) successes++;
        });
    for (auto& t : users) t.join();

    map<int, int> seatsPerUser;
    for (int s = 0; s < show.size(); s++) if (show.owner(s)) seatsPerUser[show.owner(s)]++;
    bool pairsOnly = all_of(seatsPerUser.begin(), seatsPerUser.end(), [](auto& p) { return p.second == 2; });
    cout << "successful bookings: " << successes << ", seats sold: " << 2 * successes
         << ", every winner holds exactly a pair: " << boolalpha << pairsOnly << "\n";
    cout << "no seat sold twice (each seat has at most one owner by construction)\n";
}
```
```js run
class KeyedMutex {
  #tails = new Map();
  async run(key, fn) {
    const prev = this.#tails.get(key) ?? Promise.resolve();
    let release;
    const mine = new Promise((r) => (release = r));
    this.#tails.set(key, prev.then(() => mine));
    await prev;
    try { return await fn(); } finally { release(); }
  }
}

class BookingService {
  #seats = new Map();                                     // showId → Map(seat → userId)
  #locks = new KeyedMutex();
  constructor(paymentHold) { this.paymentHold = paymentHold; }
  async book(showId, userId, seats) {
    return this.#locks.run(showId, async () => {          // bookings for the SAME show are serialized
      const taken = this.#seats.get(showId) ?? new Map();
      if (seats.some((s) => taken.has(s))) return { ok: false, reason: "seat already taken" };
      const held = await this.paymentHold(userId, seats.length * 250);   // an await inside the critical section
      if (!held) return { ok: false, reason: "payment hold failed" };
      for (const s of seats) taken.set(s, userId);
      this.#seats.set(showId, taken);
      return { ok: true };
    });
  }
  owners(showId) { return [...(this.#seats.get(showId) ?? new Map())].sort((a, b) => a[0] - b[0]); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const svc = new BookingService(async (user, amount) => { await sleep(2); return user !== "u13"; });

// 20 users race for overlapping seat pairs in one show
const attempts = Array.from({ length: 20 }, (_, i) => {
  const s = (i * 7) % 9;
  return svc.book("show-1", `u${i + 1}`, [s, s + 1]).then((r) => ({ user: `u${i + 1}`, seats: [s, s + 1], ...r }));
});
const results = await Promise.all(attempts);
const winners = results.filter((r) => r.ok);
console.log("winners:", winners.map((w) => `${w.user}→${w.seats.join("+")}`).join("  "));
const counts = {};
for (const [, u] of svc.owners("show-1")) counts[u] = (counts[u] ?? 0) + 1;
console.log("seats per winner:", counts, "→ no seat sold twice, every booking all-or-nothing");
```
:::

In production the source of truth is a **database**, and the same guarantees come from it: a unique constraint on `(show_id, seat_id)` in a `bookings` table, or `UPDATE seats SET held_by = ?, held_until = now() + interval '10 min' WHERE show_id = ? AND seat_id IN (…) AND held_by IS NULL`, checking that the affected row count equals the number of seats (inside a transaction for all-or-nothing). Seat **holds with expiry** (TCC style) let users pay without blocking others forever. You'll see this in the movie booking LLD and the Ticketmaster case study.

## Designing a thread-safe class: checklist

1. **Identify shared mutable state.** If there is none (immutable objects, thread-confined data), you're done.
2. **Define the invariants** (a seat has at most one owner; balance ≥ 0) and the **operations** that must be atomic with respect to them.
3. **Choose the mechanism**: an atomic for a single value; a mutex for compound updates; per-key or striped locks for independent items; CAS for low-contention optimistic updates; a single-writer queue/actor to avoid sharing.
4. **Encapsulate the synchronisation inside the class**: callers shouldn't need to lock anything. Don't expose internal collections.
5. **Order locks globally** if an operation needs more than one; never call unknown code (callbacks, observers, I/O) while holding a lock.
6. **Make check-then-act atomic**: `if (!map.contains(k)) map.insert(k)` must happen under one lock (or use `try_emplace` / `insert` return values).
7. **Test it**: many threads hammering the same keys, asserting invariants afterwards; run with ThreadSanitizer (`-fsanitize=thread`).

:::interview The concurrency paragraph for any LLD answer
*"The shared state is the spot map. Parking and leaving touch one spot, so I use one lock per floor (finer than the whole lot, coarse enough to keep it simple), and `findAndReserveSpot` is a single critical section so two cars can't take the same spot. The ticket counter is an `atomic`. In a distributed version, the reservation becomes a conditional update in the database."*
:::

```quiz
? transfer(a, b) locks a then b, while transfer(b, a) locks b then a, at the same time. What can happen, and what's the simplest fix?
+ A deadlock; acquire both locks in a global order (e.g. by account id) or with std::scoped_lock
- Lost updates; add more threads
- Nothing, mutexes prevent this
> Circular wait is one of the four deadlock conditions; a global order or all-at-once acquisition breaks it.

? Bookings for different shows never conflict. What lock granularity fits a booking service?
+ One lock (or queue) per show, so different shows proceed in parallel
- One global lock for all bookings
- No locks at all
> Lock at the level where conflicts can actually happen.

? What does compare-and-swap do?
+ Atomically sets a value only if it still equals an expected value, reporting whether it succeeded
- Swaps two variables unconditionally
- Compares two threads' speed
> CAS is the basis of optimistic concurrency and lock-free updates.

? Why is `if (!seats.has(s)) seats.set(s, user)` unsafe in a multi-threaded C++ map, even if each call is individually thread-safe?
+ Check-then-act: another thread can take the seat between the check and the set; both steps must be one atomic operation
- Maps can't hold strings
- set() is always atomic, so it's safe
> Compound actions need one critical section (or an atomic primitive like CAS / insert-if-absent).
```

:::keypoints
- **Deadlock** needs mutual exclusion, hold-and-wait, no preemption and circular wait; break one: **global lock order**, `scoped_lock`, try-lock with backoff, or no shared locks.
- Choose **granularity** deliberately: coarse (simple) → per-item or **striped** (parallel) → lock-free (CAS) only where needed.
- **Optimistic concurrency** with **CAS** (or SQL version checks) suits low-contention updates; retry on conflict.
- No double booking: per-seat CAS with rollback, or a per-show lock; in production, unique constraints / conditional updates plus expiring holds.
- Encapsulate synchronisation, make **check-then-act** atomic, never call unknown code under a lock, and test with many threads (and TSan).
:::
