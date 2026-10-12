---
title: NoSQL Databases and Choosing a Data Store
level: intermediate
time: 40
summary: The NoSQL families — key-value, document, wide-column, graph, time-series and search — what each is built for, how their data models look, the trade-offs versus SQL, and a practical decision guide for picking a store in an interview.
---

"NoSQL" is a loose label for databases that drop parts of the relational model (fixed schemas, joins, multi-row transactions) to gain something else: horizontal scale, write throughput, flexible documents, or a data model that fits a specific problem. There isn't one NoSQL; there are **families**, and choosing the right one for each part of the system is a core interview skill.

:::note "Not only SQL"
The line has blurred. Postgres stores JSON documents and does full-text search; MongoDB has multi-document transactions; DynamoDB supports transactions too. Think of the families as **data models and scaling designs**, not as camps.
:::

## Key-value stores

:::def Key-value store
The simplest model: a giant distributed hash map. You `put(key, value)` and `get(key)`; the value is opaque to the database.
:::

```text
session:8f2c…        → {"userId": 42, "expires": 1767225600}
cart:user:42         → [{"sku": "A12", "qty": 2}]
rate:k_123:12:05     → 41
```

- **Examples**: Redis, Memcached (in memory); DynamoDB, Riak, etcd, RocksDB (durable).
- **Strengths**: extremely fast O(1) lookups by key, trivially partitioned by key, scales horizontally to millions of operations per second.
- **Weaknesses**: you can only look things up by key. "Find all carts containing item A12" is impossible without a secondary index or a scan.
- **Use for**: sessions, caches, user preferences, shopping carts, feature flags, rate limit counters, and any lookup by id at massive scale.

**DynamoDB** deserves a special mention because it comes up constantly. It's a managed key-value/document store where each item has a **partition key** (which decides the machine) and an optional **sort key** (which orders items within a partition). That enables queries like "all orders of user 42 in March, newest first" in a single fast request.

## Document stores

:::def Document database
Stores **self-contained documents** (JSON/BSON) that can be nested and can differ in shape. You can query and index fields inside the documents.
:::

```json
{
  "_id": "order_501",
  "userId": 42,
  "status": "PAID",
  "items": [ { "sku": "A12", "name": "Mug", "qty": 2, "priceCents": 4500 } ],
  "shipping": { "city": "Pune", "pin": "411001" },
  "createdAt": "2026-03-01T10:22:31Z"
}
```

- **Examples**: MongoDB, Couchbase, Firestore, Amazon DocumentDB.
- **Strengths**: the document matches the object your code uses (no join to assemble an order); flexible schema (add fields without migrations); good horizontal scaling by sharding on a key.
- **Weaknesses**: weak at **relationships** between documents (joins are limited and slow); denormalised data is duplicated, so updates must touch every copy; schema flexibility can become schema chaos.
- **Use for**: content management, catalogs with varied attributes (a laptop and a T-shirt have different fields), user profiles, event data, anything read and written as one aggregate.

## Wide-column stores

:::def Wide-column store
Data is organised by a **partition key** (which node holds the data) and **clustering columns** (how rows are sorted within the partition). Each partition is like a sorted map stored together on disk. Built on LSM trees for very high write throughput.
:::

```text
messages table — PRIMARY KEY ((chat_id), sent_at, msg_id)

partition chat_id = "c_77"
  sent_at 10:01:05  msg_id m1  from asha   "hi!"
  sent_at 10:01:09  msg_id m2  from bilal  "hey"
  sent_at 10:02:44  msg_id m3  from asha   "lunch?"
  …millions more, stored sorted by time
```

- **Examples**: Apache Cassandra, ScyllaDB, HBase, Google Bigtable.
- **Strengths**: massive **write throughput** and data volume across hundreds of nodes, no single primary (Cassandra), tunable consistency, efficient range scans **within a partition** ("the last 50 messages in this chat").
- **Weaknesses**: you must design tables **around your queries** (one table per access pattern is normal); no joins; limited secondary indexes; data is denormalised.
- **Use for**: chat messages, activity feeds, time-ordered event logs, IoT readings, anything write-heavy at huge scale with known query patterns. Discord stores trillions of messages this way.

## Graph databases

:::def Graph database
Stores **nodes** (entities) and **edges** (relationships) as first-class data, with properties on both. Queries walk relationships directly instead of joining tables.
:::

```text
(Asha)-[:FOLLOWS]->(Bilal)-[:FOLLOWS]->(Chen)
(Asha)-[:LIKES]->(Post 9)<-[:WROTE]-(Chen)

MATCH (me:User {name: 'Asha'})-[:FOLLOWS]->()-[:FOLLOWS]->(fof)
WHERE NOT (me)-[:FOLLOWS]->(fof)  RETURN fof   // friends-of-friends to suggest
```

- **Examples**: Neo4j, Amazon Neptune, JanusGraph.
- **Strengths**: multi-hop relationship queries (friends of friends, shortest path, fraud rings) that would need many expensive self-joins in SQL.
- **Weaknesses**: harder to scale horizontally (graphs don't partition cleanly), niche tooling.
- **Use for**: social graphs, recommendations, fraud detection, knowledge graphs, network topology. (Large social networks often store the graph in sharded SQL or KV stores and use specialised graph services, e.g. Facebook's TAO.)

## Time-series databases

Optimised for data points stamped with time, written in huge volumes and queried by time ranges with aggregation ("average CPU per minute for the last 6 hours").

- **Examples**: InfluxDB, TimescaleDB (Postgres extension), Prometheus, ClickHouse (also a general analytics DB).
- **Strengths**: compression of timestamps and values, downsampling, retention policies, fast time-window aggregations.
- **Use for**: metrics and monitoring, IoT sensors, financial ticks. Covered in the metrics-platform case study.

## Search engines

- **Examples**: Elasticsearch, OpenSearch, Solr.
- Built on **inverted indexes** (word → list of documents) for full-text search, relevance ranking, fuzzy matching, faceting, and log analytics.
- Usually a **secondary** store: the source of truth is elsewhere, and data is synced into the search index (lesson in the Architecture module).

## Column-oriented analytics (OLAP)

Different from wide-column stores despite the similar name. **Columnar** databases (ClickHouse, BigQuery, Snowflake, Redshift, Apache Druid) store each **column** together on disk, so a query like "sum of revenue by country for 2025" reads only two columns out of fifty, compressed. They power dashboards and analytics over billions of rows, and they're terrible for "update this one order".

:::def OLTP vs OLAP
**OLTP** (online transaction processing): many small reads/writes of individual records, low latency, e.g. placing an order. Row-oriented SQL and NoSQL stores. **OLAP** (online analytical processing): few huge queries scanning millions of rows to aggregate. Columnar warehouses. Real systems use both, with a pipeline copying data from OLTP to OLAP.
:::

## SQL vs NoSQL: the honest comparison

| | Relational (SQL) | NoSQL (typical) |
|---|---|---|
| Data model | tables, normalised, joins | key-value, documents, wide rows, graphs |
| Schema | enforced up front | flexible / per item |
| Transactions | multi-row ACID | often single-item; some support more |
| Scaling | vertical + read replicas; sharding is manual work | built to partition horizontally |
| Query flexibility | high: ad-hoc queries, joins | low: design around access patterns |
| Consistency | strong by default | often eventual or tunable |
| Sweet spot | business data with relationships and invariants | huge scale, simple access patterns, flexible data |

:::warn "NoSQL because it scales" is a weak answer
Interviewers push back on it. A well-run Postgres handles far more than most products ever need. Pick NoSQL for a **reason in the requirements**: write volume beyond one primary, an access pattern that's purely by key, time-ordered data at huge scale, a genuinely flexible schema, or relationship traversals.
:::

## A decision guide

```viz algo=arch title="Picking the store for each kind of data (a typical social app)"
app      App services [service*3]
pg       PostgreSQL | users, payments, settings [sql]
cass     Cassandra | messages, activity [nosql]
redis    Redis | sessions, counters, cache [cache]
es       Elasticsearch | search [search]
s3       Object storage | photos, video [storage]
olap     Warehouse | analytics [chart]
--
app -> pg
app -> cass
app -> redis
app -> es
app -> s3
pg ~> olap : nightly / CDC
cass ~> olap
```

| If the data / access pattern is… | Reach for |
|---|---|
| Relational, needs transactions (users, orders, payments, inventory) | **PostgreSQL / MySQL** (distributed SQL if it must span regions) |
| Lookups by key at huge scale, simple values | **DynamoDB, Redis, Cassandra** |
| Self-contained objects with varying fields | **MongoDB / document store** (or Postgres JSONB) |
| Time-ordered, write-heavy, huge (messages, events, feeds) | **Cassandra / ScyllaDB / Bigtable** |
| Hot data needed in < 1 ms | **Redis / Memcached** (as a cache) |
| Full-text search, fuzzy matching, faceting | **Elasticsearch / OpenSearch** |
| Many-hop relationships | **Graph database** |
| Metrics, sensor data | **Time-series DB** |
| Analytics over billions of rows | **Columnar warehouse** (ClickHouse, BigQuery, Snowflake) |
| Files, images, videos, backups | **Object storage** (S3) |

Using several stores, each for what it does best, is called **polyglot persistence**. It's normal in large systems, but every extra store is another thing to operate, back up and keep in sync. Start with as few as the requirements allow.

:::problem Pick the stores for a food-delivery app {level=medium tags="data stores,polyglot persistence"}
A food-delivery app needs: restaurant menus (items with very different options: sizes, spice levels, add-ons), orders and payments, live courier locations updated every 4 seconds, restaurant search by name and cuisine ("biryani near me"), order history per user, and a dashboard showing orders per city per hour. Choose a store for each and justify it.

:::hint Hint
Separate the transactional core (money!) from the high-volume, the search-heavy and the analytical parts.
:::

:::solution
- **Orders and payments**: **PostgreSQL**. Transactions across order status, payment records and restaurant payouts; strong consistency; idempotent payment writes.
- **Menus**: a **document store** (or Postgres JSONB): each menu item has a different option structure, and the menu is read as one aggregate per restaurant. Heavily **cached** (Redis/CDN) since menus change rarely.
- **Live courier locations**: **Redis** (geo commands or a geohash index in memory), since only the latest position matters, writes are very frequent, and the data is disposable. Optionally append the history to a time-series/wide-column store for analytics and disputes.
- **Restaurant search**: **Elasticsearch** with geo queries and text relevance, synced from the source tables via CDC.
- **Order history per user**: read straight from Postgres (indexed by `user_id, created_at`), or at very large scale a **wide-column table** partitioned by `user_id`, sorted by time.
- **Dashboard**: stream order events into a **columnar warehouse** (ClickHouse/BigQuery) and aggregate there, never on the production database.
:::
:::

```quiz
? Which store fits chat messages for a messenger with billions of messages per day, read as "the latest 50 in this chat"?
- A graph database
+ A wide-column store (Cassandra/ScyllaDB) partitioned by chat id, sorted by time
- A relational database with one table and no indexes
> Massive write volume plus a fixed access pattern (one partition, ordered by time) is exactly what wide-column stores are built for.

? Which is the clearest reason to choose a relational database?
+ Orders, payments and inventory must change together in transactions with enforced constraints
- The data is huge
- The schema changes every week
> Multi-row ACID transactions and constraints are the relational database's core strength.

? "Sum of revenue per country for the last year" over 5 billion rows should run on…
- the production OLTP database
+ a columnar analytics warehouse (OLAP)
- Redis
> Columnar stores read only the needed columns, compressed, and are built for big aggregations. Running them on the OLTP database would hurt production traffic.
```

:::keypoints
- NoSQL is a set of families with different data models: **key-value**, **document**, **wide-column**, **graph**, **time-series**, **search**, plus columnar **OLAP** warehouses.
- **Key-value**: O(1) by key, massive scale. **Document**: flexible nested aggregates. **Wide-column**: huge write volumes, queries designed per table. **Graph**: multi-hop relationships.
- SQL wins on transactions, constraints and query flexibility; NoSQL wins on horizontal scale and specialised models, usually at the cost of joins, flexibility, or strong consistency.
- Choose each store for a **specific requirement**. Using several (polyglot persistence) is normal, but each one costs operational effort.
:::
