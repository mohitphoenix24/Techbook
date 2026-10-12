---
title: Data Modeling for Scale
level: intermediate
time: 40
summary: How to design schemas in an interview — start from entities and access patterns, normalise for correctness then denormalise for reads, model one-to-many and many-to-many relationships, counters, soft deletes and time-ordered keys, and design NoSQL tables (partition and sort keys) query-first.
---

After the API, the next thing to write in an HLD interview is the **data model**: the main entities, their fields, how they relate, and which store holds them. A good data model makes the important queries cheap. A careless one creates the bottleneck you'll spend the deep dive fixing.

## Start from access patterns

The single most important rule: **design the data around the queries**, not the other way round. Before drawing tables, list the operations and how often they run:

| # | Access pattern | Frequency |
|---|---|---|
| 1 | Get a post by id (with author name and avatar) | very high |
| 2 | List a user's posts, newest first, paginated | high |
| 3 | Show the like count on each post | very high |
| 4 | Has the current user liked this post? | very high |
| 5 | Like / unlike a post | high |
| 6 | List the followers of a user | medium |

Every table, index and denormalised field should be justified by a row in this list.

## Normalise first

:::def Normalisation
Organising data so each fact is stored **once**: a user's name lives only in `users`, and posts refer to it by `user_id`. It prevents update anomalies (changing a name in one place but not another) and keeps writes simple and correct.
:::

A normalised schema for the patterns above:

```text
users     (id PK, username UNIQUE, name, avatar_url, created_at)
posts     (id PK, author_id FK→users, caption, media_key, created_at)
          INDEX (author_id, created_at DESC)                       -- pattern 2
likes     (post_id FK, user_id FK, created_at, PRIMARY KEY (post_id, user_id))   -- patterns 4, 5
          INDEX (user_id, created_at)                              -- "posts I liked"
follows   (follower_id, followee_id, created_at, PRIMARY KEY (follower_id, followee_id))
          INDEX (followee_id, follower_id)                         -- pattern 6
```

Relationship patterns to recognise:

- **One-to-many** (a user has many posts): a foreign key on the "many" side (`posts.author_id`) plus an index on it.
- **Many-to-many** (users like many posts; posts are liked by many users): a **join table** (`likes`) whose primary key is the pair, which also enforces "one like per user per post".
- **Self-referencing** many-to-many (users follow users): a join table with two user ids, indexed in both directions.

## Then denormalise where reads need it

Normalised data is correct, but some reads get expensive. Pattern 3, `SELECT COUNT(*) FROM likes WHERE post_id = ?`, scans thousands of rows on every page view of a popular post. Pattern 1 needs a join to show the author's name.

:::def Denormalisation
Deliberately storing **redundant copies or precomputed results** (a `like_count` column, the author's name copied into the post) to make reads cheap, at the cost of more complex writes and the risk of copies drifting apart.
:::

```text
posts (…, like_count INT DEFAULT 0, comment_count INT DEFAULT 0)

-- the like write path keeps the counter in sync, in one transaction
BEGIN;
INSERT INTO likes (post_id, user_id) VALUES (9, 42);       -- fails on duplicate: idempotent
UPDATE posts SET like_count = like_count + 1 WHERE id = 9;
COMMIT;
```

Common denormalisations, and how they're kept consistent:

| Denormalisation | Keeps reads cheap for | Kept in sync by |
|---|---|---|
| Counters (`like_count`, `follower_count`) | showing counts on every view | the same transaction, or an async counter service |
| Copied fields (author name inside a post document) | rendering without a join | async update on change (or accept staleness) |
| Precomputed lists (a user's feed, top-10 lists) | instant feed / leaderboard | fan-out workers (news feed case study) |
| Materialised views / read models | complex aggregations | the database or a stream processor (CQRS) |

:::warn Very hot counters need special care
A single `like_count` row on a viral post receives thousands of increments per second, and row locks serialise them. Solutions: **sharded counters** (10 rows per post, add them up when reading), **buffering** increments in Redis (`INCR`) and flushing to the database every few seconds (write-back), or approximate counting. Displaying "1.2M likes" never needs exact real-time precision.
:::

## Patterns you'll use again and again

**Time-ordered ids.** Feed and history queries sort by time. If your ids are time-sortable (Snowflake ids, UUIDv7, ULID), the primary key itself gives you creation order and cursor pagination for free (`WHERE id < :cursor ORDER BY id DESC LIMIT 20`). The ID generation lesson covers this.

**Soft deletes.** Instead of `DELETE`, set `deleted_at = now()`. You can undo, keep audit history, and avoid breaking references. The cost: every query must filter `deleted_at IS NULL` (a partial index helps), and data protection laws may still require real deletion later.

**Status columns and state machines.** Orders, payments and rides move through states (`CREATED → PAID → SHIPPED`). Store the current state plus timestamps or a history table, and enforce valid transitions with conditional updates (`UPDATE … SET status='SHIPPED' WHERE id=? AND status='PAID'`).

**Append-only event tables.** For money and audit trails, never update balances blindly. Record immutable entries (`ledger_entries`) and derive the balance (double-entry bookkeeping; see the payment system case study).

**JSON columns** for genuinely variable attributes (product specs), while keeping the fields you filter and join on as real columns.

**Avoid unbounded rows and arrays.** Storing all of a celebrity's 50 M followers in one document or one array field breaks every database. Model the relationship as rows (`follows`) that can be paginated and partitioned.

## Modelling for NoSQL: query-first tables

In wide-column and key-value stores (Cassandra, DynamoDB), there are no joins and only the **primary key** is efficiently queryable. You design **one table per access pattern**, choosing:

- the **partition key**: which data lives together on one node (and must be given in every query);
- the **sort / clustering key**: the order within the partition, enabling range queries and pagination.

```text
-- Cassandra: pattern 2, "a user's posts, newest first"
CREATE TABLE posts_by_user (
  user_id    bigint,
  created_at timestamp,
  post_id    bigint,
  caption    text,
  media_key  text,
  PRIMARY KEY ((user_id), created_at, post_id)
) WITH CLUSTERING ORDER BY (created_at DESC);

-- pattern 4: "has user X liked post Y?"  → one row lookup
CREATE TABLE likes_by_post ( post_id bigint, user_id bigint, created_at timestamp,
  PRIMARY KEY ((post_id), user_id) );
```

The same post may be written to several tables (one per query). Duplication is the normal price of fast reads at scale.

DynamoDB users often go further with **single-table design**: several entity types share one table, with generic `PK`/`SK` attributes shaped so that one query fetches an entity and its related items together:

```js run title="Single-table design: one query returns a user and their orders"
// Items in one DynamoDB-style table. PK groups related items; SK orders them.
const table = [
  { PK: "USER#42", SK: "PROFILE",                  name: "Asha", plan: "pro" },
  { PK: "USER#42", SK: "ORDER#2026-03-01#501",     total: 1299, status: "PAID" },
  { PK: "USER#42", SK: "ORDER#2026-03-04#502",     total: 45, status: "SHIPPED" },
  { PK: "USER#7",  SK: "PROFILE",                  name: "Bilal", plan: "free" },
  { PK: "USER#7",  SK: "ORDER#2026-02-11#377",     total: 899, status: "PAID" },
  { PK: "ORDER#501", SK: "ITEM#1",                 sku: "MUG", qty: 2 },
];

// Query(PK = :pk AND begins_with(SK, :prefix)), sorted by SK — the only kind of query that's cheap
function query(pk, skPrefix = "", { reverse = false } = {}) {
  const rows = table.filter((it) => it.PK === pk && it.SK.startsWith(skPrefix)).sort((a, b) => (a.SK < b.SK ? -1 : 1));
  return reverse ? rows.reverse() : rows;
}

console.log("profile + all orders in ONE query:");
for (const it of query("USER#42")) console.log("  ", it.SK, JSON.stringify({ ...it, PK: undefined, SK: undefined }));
console.log("latest order only:", query("USER#42", "ORDER#", { reverse: true })[0].SK);
console.log("orders in March 2026:", query("USER#42", "ORDER#2026-03").map((o) => o.SK));
```

:::tip The SQL vs NoSQL modelling mindset
**Relational**: model the **data** (entities and relationships, normalised), then add indexes for the queries. Flexible for new queries. **NoSQL**: model the **queries** (one table or key layout per access pattern), duplicating data as needed. Fast and scalable, but every new query may need a new table and a backfill.
:::

## How to present a data model in an interview

1. List the **core entities** right after the requirements (Hello Interview calls this "core entities"): `User`, `Post`, `Like`, `Follow`.
2. For each, write the **key fields**, the **primary key**, and the **store** (Postgres, Cassandra, Redis, S3).
3. Next to each important query, note the **index or partition key** that makes it fast.
4. Mention **denormalised counters or copies** and how they stay in sync.
5. Don't write every column. Interviewers want the fields that drive design decisions.

:::problem Model a Q&A site {level=medium tags="data modeling,denormalization"}
Design the data model for a Stack Overflow–like site. Users ask questions with tags; others post answers; everyone can upvote/downvote questions and answers (once each); questions show their score, answer count and the accepted answer. The home page lists the newest questions for a tag. Write the tables, keys and indexes, and say what you'd denormalise.

:::hint Hint
Votes are a many-to-many relationship with an extra field. Which counts are shown on every page view?
:::

:::solution
```text
users      (id PK, display_name, reputation INT, created_at)
questions  (id PK, author_id → users, title, body, score INT, answer_count INT,
            accepted_answer_id NULL → answers, created_at, deleted_at NULL)
answers    (id PK, question_id → questions, author_id → users, body, score INT, created_at)
           INDEX (question_id, score DESC)               -- answers sorted by votes
tags       (id PK, name UNIQUE)
question_tags (question_id, tag_id, created_at, PRIMARY KEY (tag_id, created_at DESC, question_id))
                                                        -- "newest questions for a tag" = one index range scan
votes      (user_id, target_type, target_id, value ±1, PRIMARY KEY (user_id, target_type, target_id))
                                                        -- one vote per user per post; changing a vote = update
```

**Denormalised:** `questions.score`, `answers.score`, `questions.answer_count`, `users.reputation`, and `created_at` copied into `question_tags` so the tag listing needs no join to sort. They're updated in the same transaction as the vote or answer insert. A popular question's score row could get hot, but vote rates per post are modest, so row-level updates are fine (shard counters only if measurements say so).

**Store:** PostgreSQL. Full-text **search** goes to Elasticsearch, fed by CDC. Hot question pages are cached.
:::
:::

```quiz
? Why is `SELECT COUNT(*) FROM likes WHERE post_id = ?` on every page view a problem for viral posts, and what's the usual fix?
+ It scans a huge number of rows per view; keep a denormalised `like_count` updated on each like (or a sharded/buffered counter)
- COUNT is not allowed in SQL
- It returns the wrong number
> Counting at read time is O(likes) per view. Maintaining the count at write time makes every read O(1).

? In Cassandra or DynamoDB, how do you usually support two different queries over the same data?
- Add a join
+ Store the data in two tables (or index layouts), each keyed for one query
- Run a full table scan for the second query
> NoSQL modelling is query-first: duplicate data so each access pattern is a single-partition read.

? What do time-sortable ids (Snowflake, UUIDv7, ULID) give a feed table?
+ The primary key order matches creation time, so "newest first" and cursor pagination work directly on the key
- Smaller rows
- Automatic sharding
> Ordering by id = ordering by time, so no extra timestamp index is needed for the main listing.
```

:::keypoints
- Start from the **access patterns** (with frequencies); every table, index and copy must serve one.
- **Normalise** for correctness (one-to-many via foreign keys, many-to-many via join tables), then **denormalise** what's read constantly: counters, copied fields, precomputed lists.
- Watch for **hot counters** (shard or buffer them) and **unbounded arrays** (model as rows).
- Useful patterns: **time-sortable ids**, **soft deletes**, **status state machines** with conditional updates, **append-only ledgers**, JSON for variable attributes.
- **NoSQL is query-first**: partition key + sort key per access pattern, duplicating data across tables.
:::
