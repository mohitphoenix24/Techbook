---
title: Relational Databases, Transactions and ACID
level: intermediate
time: 50
summary: The relational model in a nutshell, what each letter of ACID really guarantees, transactions, the isolation levels and the anomalies they prevent (dirty reads, lost updates, write skew, phantoms), locking vs MVCC, and when a relational database is the right choice.
---

Relational databases (PostgreSQL, MySQL, Oracle, SQL Server) have been the default way to store business data for 50 years, and they still are. In interviews you'll often say "Postgres" for the core data. To defend that choice, and to know when it breaks, you need to understand what a relational database actually promises: **ACID transactions**.

## The relational model in two minutes

Data lives in **tables** (relations) of **rows** with fixed **columns**. Each row has a **primary key**. Rows reference rows in other tables with **foreign keys**, and queries combine tables with **joins**.

```text
users                         orders
id | name   | email           id  | user_id | total_cents | status   | created_at
---+--------+--------------   ----+---------+-------------+----------+---------------------
1  | Asha   | asha@ex.com     501 | 1       | 129900      | PAID     | 2026-03-01 10:22:31
2  | Bilal  | bilal@ex.com    502 | 1       | 4500        | SHIPPED  | 2026-03-04 18:01:07
                              503 | 2       | 89900       | PENDING  | 2026-03-05 09:13:44

SELECT u.name, SUM(o.total_cents) AS spent
FROM users u JOIN orders o ON o.user_id = u.id
WHERE o.status <> 'CANCELLED'
GROUP BY u.name;
```

Strengths that matter in design:

- **Schema**: the database enforces types, `NOT NULL`, `UNIQUE`, foreign keys and `CHECK` constraints. Bad data is rejected at the door.
- **Flexible queries**: joins, aggregations and ad-hoc reporting over data you didn't plan for.
- **Transactions** with ACID guarantees, the main topic of this lesson.
- **Maturity**: decades of tooling, backups, replication, and engineers who know it.

## Transactions

:::def Transaction
A group of reads and writes that the database treats as **one unit**: either all of it happens, or none of it does, and concurrent transactions don't see each other's half-finished work.
:::

The classic example is a money transfer:

```text
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 'alice';
UPDATE accounts SET balance = balance + 100 WHERE id = 'bob';
COMMIT;      -- or ROLLBACK if anything failed
```

Without a transaction, a crash between the two updates destroys 100 rupees. With one, it's impossible.

## ACID, letter by letter

:::def Atomicity
**All or nothing.** If a transaction fails halfway (crash, constraint violation, explicit `ROLLBACK`), every change it made is undone. You never see "money left Alice but didn't reach Bob". (It's about aborting, not about concurrency.)
:::

:::def Consistency
The transaction moves the database from one **valid** state to another: constraints, foreign keys and your application's invariants (balances never negative, every order has a user) hold before and after. It's partly the database's job (constraints) and partly the application's (correct transactions).
:::

:::def Isolation
**Concurrent transactions don't interfere.** Ideally the result is the same as if they ran one after another (serializable). In practice databases offer weaker **isolation levels** for speed, and each allows certain anomalies (below).
:::

:::def Durability
Once `COMMIT` returns, the data **survives crashes**. Databases achieve this with a **write-ahead log** (WAL): the change is appended to a log on disk (and `fsync`ed) before the commit is acknowledged; after a crash, the log is replayed.
:::

:::warn The C in ACID is not the C in CAP
"Consistency" means two different things. **ACID consistency** = data satisfies your rules and constraints. **CAP consistency** (coming in the Distributed Systems module) = every replica returns the latest write (linearizability). Interviewers notice if you mix them up.
:::

## Isolation levels and their anomalies

Perfect isolation (serializability) is expensive, so databases let you choose. To choose well, you need to know the anomalies.

### Dirty read

Reading data another transaction **hasn't committed yet**. If that transaction rolls back, you acted on data that never existed.

### Non-repeatable read

Reading the same row twice in one transaction and getting **different values**, because another transaction committed a change in between.

### Phantom read

Running the same **query** twice and getting a **different set of rows**, because another transaction inserted or deleted matching rows.

### Lost update

Two transactions read the same value, both compute a new value, and both write. **One update silently disappears.** This is the most common real-world concurrency bug:

```viz algo=seq title="A lost update: two purchases, one decrement"
participant t1 Checkout A [service]
participant db Database [db]
participant t2 Checkout B [service]
t1 -> db : SELECT stock FROM items WHERE id = 7 → 5
t2 -> db : SELECT stock FROM items WHERE id = 7 → 5
t1 -> db : UPDATE items SET stock = 4 WHERE id = 7 | A computed 5 − 1 = 4.
t2 -> db : UPDATE items SET stock = 4 WHERE id = 7 | B also computed 5 − 1 = 4.
note db : 2 items sold, stock went 5 → 4. One sale was "lost".
```

### Write skew

Two transactions read the **same data**, make a decision based on it, and write to **different rows**, together breaking a rule neither broke alone. Classic example: a hospital requires at least one doctor on call. Two doctors both check "are 2 on call? yes", and both take themselves off call. Now zero are on call. Booking systems hit the same problem ("the room is free" read by two people, each inserting their own booking).

### The standard levels

| Isolation level | Dirty read | Non-repeatable read | Phantom | Lost update | Write skew |
|---|---|---|---|---|---|
| Read uncommitted | possible | possible | possible | possible | possible |
| **Read committed** (Postgres default) | ✓ prevented | possible | possible | possible | possible |
| **Repeatable read** / snapshot isolation (MySQL InnoDB default) | ✓ | ✓ | mostly ✓ | depends on the DB* | possible |
| **Serializable** | ✓ | ✓ | ✓ | ✓ | ✓ |

\* PostgreSQL's repeatable read detects the conflict and aborts one transaction; MySQL's doesn't, unless you lock.

:::tip The practical takeaway
Most apps run on **read committed** and protect the few critical spots explicitly. Know the three standard tools below, and when an interviewer asks "what if two users book the last seat at the same time?", reach for one of them.
:::

## Three ways to prevent lost updates

**1. Atomic updates**: let the database do the read-modify-write in one statement, with the condition inside:

```text
UPDATE items SET stock = stock - 1 WHERE id = 7 AND stock > 0;
-- check "rows affected": 1 = sold, 0 = sold out
```

This is the simplest and fastest. Use it whenever the change can be expressed as one statement.

**2. Pessimistic locking**: lock the row while you work on it, so others wait:

```text
BEGIN;
SELECT stock FROM items WHERE id = 7 FOR UPDATE;   -- others block here until we commit
-- … complex logic …
UPDATE items SET stock = 3 WHERE id = 7;
COMMIT;
```

It's safe for complex logic, but holding locks hurts throughput, and lock ordering mistakes cause **deadlocks** (the database detects them and kills one transaction).

**3. Optimistic concurrency control**: don't lock; instead, detect conflicts at write time with a **version number**, and retry if someone else got there first:

```text
SELECT stock, version FROM items WHERE id = 7;          -- stock 5, version 12
UPDATE items SET stock = 4, version = 13 WHERE id = 7 AND version = 12;
-- rows affected = 0  →  someone changed it: re-read and retry
```

It's ideal when conflicts are **rare** (most edits to most rows), and it's also how you avoid lost updates across services and HTTP requests (with `ETag` / `If-Match` headers). Here it is in code:

:::tabs Optimistic locking with a version number
```js run
// A row store that supports "compare-and-set" on a version number,
// like UPDATE … WHERE id = ? AND version = ?
class Table {
  rows = new Map();
  read(id) { return { ...this.rows.get(id) }; }
  updateIfVersion(id, expectedVersion, changes) {
    const row = this.rows.get(id);
    if (row.version !== expectedVersion) return false;      // someone else won
    Object.assign(row, changes, { version: row.version + 1 });
    return true;
  }
}

const items = new Table();
items.rows.set(7, { stock: 5, version: 1 });

function buyWithRetry(buyer, tbl, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const item = tbl.read(7);
    if (item.stock === 0) return `${buyer}: sold out`;
    // … imagine some slow business logic here, during which others may write …
    if (tbl.updateIfVersion(7, item.version, { stock: item.stock - 1 }))
      return `${buyer}: bought (attempt ${attempt}), stock now ${item.stock - 1}`;
  }
  return `${buyer}: gave up after ${maxRetries} conflicts`;
}

// Simulate the race: A and B both read version 1 before either writes.
const a = items.read(7), b = items.read(7);
console.log("A writes:", items.updateIfVersion(7, a.version, { stock: a.stock - 1 }));   // true
console.log("B writes:", items.updateIfVersion(7, b.version, { stock: b.stock - 1 }));   // false: stale version
console.log("after the race:", items.read(7), "← no lost update");
console.log(buyWithRetry("B (retrying)", items));
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Item { int stock; int version; };

// A row store that supports "compare-and-set" on a version number,
// like UPDATE … WHERE id = ? AND version = ?
class Table {
    unordered_map<int, Item> rows_;
public:
    void insert(int id, Item it) { rows_[id] = it; }
    Item read(int id) const { return rows_.at(id); }
    bool updateStockIfVersion(int id, int expectedVersion, int newStock) {
        Item& row = rows_.at(id);
        if (row.version != expectedVersion) return false;   // someone else won
        row.stock = newStock;
        row.version++;
        return true;
    }
};

string buyWithRetry(const string& buyer, Table& t, int maxRetries = 3) {
    for (int attempt = 1; attempt <= maxRetries; attempt++) {
        Item item = t.read(7);
        if (item.stock == 0) return buyer + ": sold out";
        if (t.updateStockIfVersion(7, item.version, item.stock - 1))
            return buyer + ": bought (attempt " + to_string(attempt) + "), stock now " + to_string(item.stock - 1);
    }
    return buyer + ": gave up after conflicts";
}

int main() {
    Table items;
    items.insert(7, {5, 1});
    // Simulate the race: A and B both read version 1 before either writes.
    Item a = items.read(7), b = items.read(7);
    cout << boolalpha;
    cout << "A writes: " << items.updateStockIfVersion(7, a.version, a.stock - 1) << "\n";
    cout << "B writes: " << items.updateStockIfVersion(7, b.version, b.stock - 1) << "\n";
    Item now = items.read(7);
    cout << "after the race: stock " << now.stock << ", version " << now.version << "  <- no lost update\n";
    cout << buyWithRetry("B (retrying)", items) << "\n";
}
```
:::

For **write skew** (the on-call doctors, double bookings), atomic updates and row versions aren't enough, because the transactions write different rows. Options: `SERIALIZABLE` isolation, locking the rows you **read** (`SELECT … FOR UPDATE`), or turning the rule into a **constraint** the database enforces (a unique index on `(room_id, slot)` makes the second booking fail).

## How databases implement isolation: locks vs MVCC

- **Two-phase locking (2PL)**: readers take shared locks, writers take exclusive locks, held until commit. Correct, but readers block writers and vice versa.
- **MVCC (multi-version concurrency control)**, used by PostgreSQL, MySQL InnoDB, Oracle: each write creates a **new version** of the row; each transaction reads from a consistent **snapshot** of committed versions. **Readers never block writers, and writers never block readers.** Old versions are cleaned up later (Postgres `VACUUM`).

MVCC is why a long analytics query can run on Postgres without stalling all the writes, and why "snapshot isolation" is the practical sweet spot most databases offer.

## When to choose a relational database

Choose SQL when you have:

- **Structured data with relationships** (users, orders, products, payments).
- **Invariants that need transactions** (money, inventory, bookings).
- **Varied query patterns** that aren't all known up front (joins, reports, admin tools).
- **Moderate scale**: a single well-tuned Postgres/MySQL primary handles tens of thousands of transactions per second and several TB. With read replicas and good indexing, that covers most companies.

Its limits appear with **very high write volumes**, **data beyond one machine** (sharding a relational DB is possible but painful, as the sharding lesson shows), and **flexible or rapidly changing schemas**. That's where the NoSQL families in the next lesson come in. Distributed SQL databases (Google Spanner, CockroachDB, YugabyteDB, TiDB) offer SQL and ACID across many machines, at the cost of higher write latency.

:::interview A sentence that works in most designs
*"I'll store users, orders and payments in PostgreSQL, because they're relational and need transactions. Purchases use a conditional update (`stock > 0`) so we can't oversell, and payments are recorded in the same transaction as the order status change."* It names the store, justifies it with requirements, and shows you know how to prevent the classic race.
:::

```quiz
? A transfer debits Alice, then the server crashes before crediting Bob. Which ACID property ensures Alice's debit is undone?
+ Atomicity
- Consistency
- Isolation
- Durability
> Atomicity is all-or-nothing: an incomplete transaction is rolled back.

? Two users buy the last item at the same moment, and stock becomes −1 or a sale is lost. What's the simplest robust fix?
- Run the query twice
+ A single conditional statement: `UPDATE … SET stock = stock - 1 WHERE id = ? AND stock > 0`, and check rows affected
- Increase the isolation level to read uncommitted
> The database performs the check and the write atomically, so two buyers can't both take the last unit.

? Optimistic locking is a good fit when…
+ conflicts are rare, so retries are cheap and nothing waits on locks
- conflicts are constant on the same row
- you need to block other readers
> With frequent conflicts, optimistic transactions keep failing and retrying. Then pessimistic locks or a queue may be better.

? What is the main benefit of MVCC?
- It compresses data
+ Readers and writers don't block each other, since each transaction reads a consistent snapshot of committed versions
- It makes all transactions serializable for free
> MVCC keeps multiple row versions so reads use a snapshot instead of locks.
```

:::keypoints
- Relational databases store rows in tables with schemas, constraints and joins, and offer **ACID transactions**.
- **Atomicity** = all or nothing; **Consistency** = rules hold; **Isolation** = concurrent transactions don't interfere; **Durability** = committed data survives crashes (WAL).
- Isolation levels trade safety for speed. Know the anomalies: dirty read, non-repeatable read, phantom, **lost update**, **write skew**.
- Prevent lost updates with **atomic conditional updates**, **pessimistic locks** (`SELECT … FOR UPDATE`), or **optimistic versioning**. Use constraints or serializable isolation for write skew.
- **MVCC** lets readers and writers proceed without blocking each other.
- Choose SQL for relational data, invariants and flexible queries at moderate scale; look elsewhere (or at distributed SQL) for massive write volume and data size.
:::
