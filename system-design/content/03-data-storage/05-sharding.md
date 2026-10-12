---
title: Sharding (Partitioning)
level: intermediate
time: 45
summary: Splitting data across many databases when one machine isn't enough — range, hash and directory-based partitioning, choosing a shard key, hot spots and celebrity keys, queries that span shards, secondary indexes on sharded data, and resharding without downtime.
---

Replication copies **all** the data to every replica, so it can't help when the data itself, or the write traffic, is too big for one machine. The answer is **sharding**: split the data into pieces and give each piece to a different database server. It's how every large system stores its core data, and choosing the **shard key** is one of the highest-stakes decisions in a design.

:::def Sharding (horizontal partitioning)
Splitting a dataset's **rows** across multiple independent database nodes (**shards**), so that each shard stores and serves only a subset. Each row lives on exactly one shard (plus that shard's replicas), chosen by its **shard key**.
:::

:::note Vertical partitioning is different
**Vertical partitioning** splits by **columns or tables** (users on one database, orders on another, or a big rarely-used `bio` column moved to its own table). It's simpler and often comes first. **Horizontal** partitioning (sharding) splits the **rows** of one table.
:::

```viz algo=arch title="A sharded users table"
app     App servers [service*3]
router  Routing layer | shard = f(user_id) [service]
s0      Shard 0 [db]
s1      Shard 1 [db]
s2      Shard 2 [db]
s3      Shard 3 [db]
--
app -> router
router -> s0
router -> s1
router -> s2
router -> s3
```

Sharding gives near-linear scaling of **storage, writes and reads**: four shards ≈ four times the capacity. Each shard is usually itself replicated (a leader plus followers) for availability.

## Three ways to partition

### 1. Range-based

Each shard owns a **contiguous range** of the key: users A–F on shard 0, G–L on shard 1, …; or orders from January on shard 0, February on shard 1.

- ✓ **Range queries are efficient**: "all orders between March 1 and March 7" touch one or two shards.
- ✗ **Hot spots**: if keys aren't uniform, shards aren't either. Names cluster on some letters; **time-based keys send all new writes to the newest shard**, while old shards sit idle.

Used by HBase, Bigtable, Spanner, CockroachDB, MongoDB (range mode), which mitigate hot spots by splitting busy ranges automatically.

### 2. Hash-based

Compute `hash(key)` and use it to pick the shard, e.g. `hash(user_id) mod N`.

- ✓ **Even distribution** of data and load, even with skewed or sequential keys.
- ✗ **Range queries scatter** to every shard (adjacent keys land on different shards).
- ✗ With plain `mod N`, **changing N moves almost every key** (from shard `h mod 4` to `h mod 5`). **Consistent hashing** (next lesson) fixes this.

Used by Cassandra, DynamoDB, Redis Cluster, and most sharded MySQL/Postgres setups.

### 3. Directory-based (lookup table)

A separate **lookup service** stores the mapping from key (or key range) to shard.

- ✓ **Total flexibility**: move a single big tenant to its own shard, rebalance any way you like.
- ✗ The directory is an extra hop and a critical component that must be fast and highly available (it's usually cached heavily).

Common for **multi-tenant** SaaS: tenant → shard.

Explore the trade-offs in the simulator. Compare data, write and read balance for each strategy, turn on the **celebrity**, and change the number of shards to see how much data moves.

```viz algo=sharding title="Choosing a shard key"
strategy = range_id
shards = 4
```

What it shows:

- **Range by user id**: data is even, but all **writes** go to the last shard, because new users get the highest ids. Classic hot spot.
- **Range by name**: uneven everything, because first letters aren't uniform.
- **Hash**: everything is even, until a celebrity makes **one key** hot. No partitioning scheme fixes a hot key by itself.
- **Resharding with mod-N**: going from 4 to 5 shards moves about 80% of the data.

## Choosing the shard key

A good shard key:

1. **Has high cardinality**: many distinct values (user id, order id), not "country" (a few values, very uneven).
2. **Spreads load evenly**, for both data and traffic, including writes.
3. **Matches the main access pattern**: the most frequent queries should include the shard key, so they hit **one** shard.
4. **Keeps related data together**: data that's read or updated together (a user and their settings, an order and its items) lives on the same shard, so it can be joined and updated in one local transaction.

| System | Good shard key | Why |
|---|---|---|
| Social app (users, posts) | `user_id` | most queries are "this user's …" |
| Chat | `conversation_id` | messages are read per conversation |
| Multi-tenant SaaS | `tenant_id` | tenants are isolated; joins stay local |
| E-commerce orders | `user_id` (customer view) or `order_id` (hash) | depends on the dominant query |
| Time series / logs | `(source_id, time bucket)` | avoids the newest-time hot spot |

:::warn The shard key is very hard to change later
Changing it means moving and re-indexing every row. Spend the time in the design (and in the interview) to justify it against the top queries.
:::

## Hot spots and celebrity keys

Even with a perfect hash, **one key** can get a huge share of traffic: a celebrity with 100 M followers, a viral post, the biggest customer of a SaaS product. Its shard melts while the others idle.

Mitigations:

- **Split the hot key**: append a random suffix (`post:123#0` … `#9`) to spread writes over 10 partitions, and have readers gather from all 10. Good for counters and append-heavy data (likes, view counts).
- **Cache** hot reads aggressively (often in-process; see the caching-at-scale lesson).
- **Give big tenants their own shard** (directory-based sharding makes this easy).
- **Handle celebrities differently** in the application. The news feed case study does exactly this for accounts with huge follower counts.

## Queries across shards

Once data is sharded, some operations get harder:

- **Scatter-gather queries**: a query without the shard key (e.g. "find users by email" when sharded by user id) must ask **every** shard and merge the results. Slower, and its latency is the **slowest** shard's. Fine for rare queries; terrible as the main path.
- **Global secondary indexes**: to look up by email efficiently, maintain a separate index sharded by **email** that maps email → user id. It's updated asynchronously (eventually consistent) or with a cross-shard transaction (slow).
- **Joins** across shards: avoid them. Co-locate data that's joined together, denormalise, or join in the application.
- **Transactions** across shards need distributed protocols (two-phase commit, sagas), covered in the Distributed Systems module. Design so that most transactions stay within one shard.
- **Unique constraints** across shards (unique usernames) need a global index or a dedicated service.
- **Global ids**: auto-increment ids per shard collide. Use UUIDs or a distributed id generator (Snowflake), also covered later.
- **Aggregates** ("total revenue today") become scatter-gather or a separate analytics pipeline.

```viz algo=seq title="Scatter-gather: a query without the shard key"
participant app App [service]
participant s0 Shard 0 [db]
participant s1 Shard 1 [db]
participant s2 Shard 2 [db]
app -> s0 : SELECT … WHERE email = 'asha@ex.com'
app -> s1 : SELECT … WHERE email = 'asha@ex.com'
app -> s2 : SELECT … WHERE email = 'asha@ex.com'
s0 --> app : none
s1 --> app : user 1042
s2 --> app : none (slow: 300 ms) | The whole query waits for the slowest shard.
note app : merge results → user 1042
```

## Resharding

Data grows, so you'll need more shards. Approaches, from crude to elegant:

1. **Hash mod N, then rehash everything**: simple until the day you change N, when ~all data must move. Avoid.
2. **Consistent hashing**: adding a node moves only ~1/N of the keys. Next lesson.
3. **Many logical partitions, few physical nodes**: create far more partitions than machines from day one (e.g. 1,024 partitions on 8 nodes, 128 each). To scale, **move whole partitions** to new machines; keys never change partition. Used by Elasticsearch, Kafka, Couchbase, Redis Cluster (16,384 slots), and Vitess. This is simple and robust, and a great interview answer.
4. **Dynamic splitting**: split a range when it grows too big or too hot, and move one half (HBase, Bigtable, CockroachDB, DynamoDB).

Moving data live, without downtime, follows a standard dance: **copy** the partition to the new node in the background, **stream** ongoing changes to it, **switch** routing for that partition once caught up (briefly blocking or forwarding writes), then **delete** the old copy.

:::tip Shard as late as possible
Sharding adds permanent complexity to every query, migration and transaction. Exhaust the cheaper options first: better indexes, caching, read replicas, vertical scaling, archiving old data, splitting tables by feature. In an interview, show that you know **when** sharding becomes necessary (the estimate says the data or write rate exceeds one machine), not just how.
:::

:::problem Shard a ride-hailing trips table {level=medium tags="sharding,shard key"}
A ride-hailing app stores 20 million trips per day. Riders view their own trip history (most frequent), drivers view theirs, and city operations teams want "all trips in Mumbai in the last hour". Choose a shard key, explain how each of the three queries is served, and what happens on New Year's Eve when one city's trips spike 20×.

:::hint Hint
No single key serves all three queries. Pick one for the dominant path and serve the others with something else.
:::

:::solution
- **Shard key: `rider_id`** (hashed). Rider history is the most frequent query, and it hits one shard with an index on `(rider_id, start_time)`. Hashing spreads riders evenly, and no city spike can overload one shard because each city's riders are spread over all shards.
- **Driver history**: a **secondary index table sharded by `driver_id`** (trip id + summary), written asynchronously from the trip-created event. Slight lag is fine for driver history.
- **City operations**: this is an **analytics** query; don't scatter-gather it across the OLTP shards. Stream trip events into an analytics store (or a real-time store partitioned by city and time bucket) and query there.
- **New Year's Eve**: rider-hashed sharding absorbs the spike across all shards. The hot spot moves to the **real-time city store**, so its partitions use `(city, minute-bucket)` keys, possibly with sub-partitions for the busiest cities.

Why not shard by city? It makes city queries local but creates enormous imbalance (Mumbai vs a small town) and concentrates exactly the NYE spike onto one shard.
:::
:::

```quiz
? Orders are range-sharded by creation time. What problem appears?
- Range queries become slow
+ All new orders (all writes) go to the newest shard, creating a write hot spot
- Old orders can't be read
> Monotonically increasing keys concentrate every new write on one range. Hash the key, or add a prefix that spreads writes.

? Which is the weakest shard key for a large social network?
- user_id
+ country
- post_id (hashed)
> Few distinct values and huge imbalance: one shard for India, one for Iceland.

? Why do many systems create, say, 1,024 logical partitions even when they have only 8 servers?
+ To scale out later by moving whole partitions to new servers, without changing which partition any key belongs to
- Because more partitions always make queries faster
- To avoid needing replication
> Keys stay mapped to the same partition forever; only the partition → server assignment changes.

? Your users table is sharded by user_id, and login needs a lookup by email. What's a scalable approach?
- Scatter-gather to every shard on each login
+ A separate global index (email → user_id) sharded by email
- Re-shard the users table by email
> A global secondary index turns the lookup into two single-shard reads.
```

:::keypoints
- **Sharding** splits rows across nodes so storage, writes and reads scale out; each shard is usually replicated too.
- **Range** sharding keeps ranges together but creates hot spots (especially time-ordered keys); **hash** sharding spreads load but scatters range queries; **directory** sharding is flexible at the cost of a lookup service.
- A good shard key has high cardinality, spreads load evenly, matches the main access pattern and co-locates related data. It's very hard to change later.
- **Hot keys** need special handling: key splitting, caching, dedicated shards, application logic.
- Cross-shard queries, joins, transactions and unique constraints get hard: use **global secondary indexes**, co-location and denormalisation.
- Reshard with **consistent hashing**, **many fixed logical partitions**, or **dynamic splitting**, never by rehashing everything.
:::
