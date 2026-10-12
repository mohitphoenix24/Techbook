---
title: Study Plan and Checklist
level: easy
time: 20
summary: How to turn this course into interview readiness — an 8-week plan (and a 2-week crash plan), a weekly routine of learning, designing and mocking, how to practise case studies so they stick, and a final readiness checklist.
---

Knowing the material and performing in a 45-minute interview are different skills. This plan builds both: **understanding** (lessons and simulators), **recall** (quizzes and the question tracker), and **performance** (timed designs and mocks).

## The 8-week plan

| Week | Learn | Practise |
|---|---|---|
| 1 | Foundations: how the web works, networking, APIs, real-time, estimation, NFRs, the scaling journey | estimate 3 systems from the cheat sheet; explain the scaling journey out loud |
| 2 | Traffic & caching; data storage (SQL, NoSQL, indexes, replication) | redo the sims (LB, cache, replication); design Pastebin with a timer |
| 3 | Sharding, consistent hashing, blob storage, data modelling; distributed systems I (CAP, consistency, time, Raft) | URL shortener + rate limiter, timed |
| 4 | Distributed systems II (quorums, transactions, IDs, probabilistic structures, locks); messaging | KV store + notification system, timed |
| 5 | Architecture (microservices, resilience, observability, security, deployment, DR, search, geo) | news feed + chat; first mock with a friend |
| 6 | LLD: OOP, UML, SOLID, all patterns, concurrency | 4 LLD problems in your language, from a blank file |
| 7 | Remaining LLD problems; HLD method lessons | 4 advanced case studies (YouTube, Uber, Ticketmaster, payments); second mock |
| 8 | Review: cheat sheet, trade-offs, your mistakes list | 2 mocks; 3 timed case studies you haven't seen in a while; rest the day before |

**Two-week crash plan** (if the interview is close): day 1–2 estimation, caching, databases, sharding; day 3–4 CAP, quorums, queues, Kafka; day 5 the framework + mock lesson; days 6–10 two case studies per day (URL shortener, rate limiter, chat, news feed, notification, KV store, YouTube, Uber, Ticketmaster, payments); days 11–12 the most common LLD problems (parking lot, LRU, elevator, movie booking); days 13–14 mocks + cheat sheet.

## A weekly routine

- **3 learning sessions** (60–90 min): read lessons, run every example, play with every simulator until you can predict what it will do.
- **2 design sessions** (45 min each): pick a case study **before reading it**, design it on paper with a timer, then read the walkthrough and write down what you missed.
- **1 mock** (from week 5): one person interviews, the other designs; swap. Use the framework lesson's structure.
- **Daily 10 minutes**: quizzes and the question tracker; reread your mistakes list.

## Practising case studies so they stick

1. **Design first, read second.** Reading a walkthrough feels like understanding; designing from a blank page reveals the gaps.
2. **Say it out loud.** Interviews are spoken; practise narrating decisions ("I'll use X because requirement Y; the cost is Z").
3. **Vary the problem.** After the URL shortener, ask: what if links were editable? What if analytics had to be real time? Changing one requirement and re-deciding is the best practice there is.
4. **Keep a mistakes list.** Every missed hot key, idempotency gap or failure mode goes in it. Read it before every mock.
5. **Write the LLD code.** Type the core classes and flows for each LLD problem in C++ or JavaScript without looking, then compare.

## Final readiness checklist

:::keypoints
- I can estimate QPS, storage and bandwidth in under 5 minutes and draw a conclusion from each number.
- I can explain caching strategies, replication, sharding, consistent hashing, quorums, CAP/PACELC and consensus, with when to use each.
- I can pick between SQL and NoSQL, push and pull, sync and async, strong and eventual consistency **per feature**, and justify it.
- I can design the 20 case studies at a whiteboard in 45 minutes, including 2–3 deep dives each.
- I can write the main LLD problems from scratch with clean interfaces, patterns where they help, and thread safety.
- I always cover failures, idempotency, hot spots and monitoring before finishing.
- I have done at least 4 mock interviews and fixed the issues they revealed.
:::

```quiz
? What's the most effective way to practise a case study?
+ Design it yourself with a timer before reading the walkthrough, then note what you missed
- Read the walkthrough several times
- Memorise the diagram
> Recall and generation beat rereading.

? A week before the interview, what should you prioritise?
+ Timed designs, mocks, the cheat sheet and your mistakes list
- Starting brand-new advanced topics
- Reading only, without practising out loud
> Consolidate and rehearse; don't cram new material.
```
