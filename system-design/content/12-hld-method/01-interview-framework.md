---
title: The System Design Interview Framework
level: intermediate
time: 40
summary: A repeatable, timed method for 45–60 minute HLD interviews — requirements, core entities, API, high-level design, deep dives, and wrap-up — what to say and draw at each step, how to manage the clock, what interviewers grade at junior, mid, senior and staff levels, and how to drive the conversation.
---

You now know the building blocks. The interview tests whether you can **use** them under time pressure, out loud, in a structured way. Candidates with similar knowledge get very different results depending on how they run the 45 minutes. This lesson gives you a framework to follow every time, so your energy goes into the design, not into deciding what to do next.

## The six steps and the clock

:::flow A 45-minute HLD interview
Requirements · 5 min | functional (what) + non-functional (how well); agree on scope
Entities & estimates · 3–5 min | core nouns; the numbers that change the design
API · 5 min | one endpoint or event per functional requirement
High-level design · 10–15 min | boxes and arrows that satisfy every functional requirement
Deep dives · 10–15 min | non-functional requirements: scale, consistency, failures, hot spots
Wrap-up · 2–3 min | bottlenecks, trade-offs, what you'd do next
:::

For a 60-minute slot, give the extra time to the deep dives. Keep a clock visible and say out loud when you move on: *"I think we have enough requirements; let me sketch the API."*

## Step 1: requirements (≈5 minutes)

**Functional requirements**: what users can do. Aim for the **3 most important**, phrased as "users should be able to…". For Twitter: post tweets, follow users, see a home timeline. Explicitly park the rest: "search, DMs and ads are out of scope unless you'd like them in."

**Non-functional requirements**: the qualities that will drive the design. Use the checklist from the requirements lesson and turn each into something concrete:

| Quality | Example phrasing |
|---|---|
| Scale | "~200 M DAU, read-heavy (100 reads per write)" |
| Latency | "timeline loads in < 200 ms p99" |
| Availability vs consistency | "availability over consistency for the timeline; a few seconds of staleness is fine" |
| Durability | "a posted tweet must never be lost" |
| Special constraints | "global users", "spiky traffic during events", "strict ordering per chat" |

:::tip Ask, then propose
Don't interrogate the interviewer with 15 questions. Ask a few, then **propose** reasonable assumptions and confirm: *"I'll assume 100 M daily users and that reads dominate. Does that match what you have in mind?"* It shows judgement and saves time.
:::

## Step 2: core entities and estimates (≈3–5 minutes)

List the **core entities** (the nouns your system stores and moves): `User`, `Tweet`, `Follow`, `Timeline`. You'll refine them as you go.

Then do **only the estimates that change the design**: QPS (read and write, peak), storage growth, sometimes bandwidth or memory for a cache. Conclude each with a decision: *"600K reads/s at peak means the read path must be served from cache."* Many interviewers now say "skip the math"; if so, state the scale qualitatively and move on.

## Step 3: API (≈5 minutes)

One endpoint per functional requirement, with the key parameters and responses (REST by default; mention WebSockets/SSE where real-time is needed). Note pagination, idempotency keys and auth briefly.

```text
POST /v1/tweets                      {text, mediaIds[]}           → 201 {tweetId}
GET  /v1/timeline?cursor=…&limit=20                               → 200 {tweets[], nextCursor}
POST /v1/users/{id}/follow                                        → 204
```

## Step 4: high-level design (≈10–15 minutes)

Draw the components needed to make **each functional requirement work end to end**. Walk through one request at a time ("when a user posts a tweet…"), adding boxes as you need them: clients, load balancer/API gateway, services, databases, cache, queue, object storage, CDN.

Rules of thumb:

- **Start simple and correct**; don't add Kafka, sharding and multi-region before they're justified.
- **Name the data store and its schema/keys** for each piece of data, briefly.
- **Narrate the data flow**, not just the boxes.
- It's fine to leave obvious weaknesses for the deep dive, and say so: *"This timeline query will be too slow at our scale; I'll fix it in the deep dive."*

## Step 5: deep dives (≈10–15 minutes)

Now satisfy the **non-functional requirements**. Pick 2–3 deep dives, ideally the ones the interviewer cares about (watch for their hints and questions). Typical deep dives:

- **Scaling the hot path**: caching, precomputation (fan-out), read replicas, sharding with a stated shard key.
- **Consistency and correctness**: double booking, idempotency, ordering, exactly-once effects.
- **Hot spots**: celebrity accounts, viral content, flash sales.
- **Failures**: what happens when this service/region/queue dies; retries, backpressure, failover.
- **Latency**: where milliseconds go; CDNs, edge, precomputed results.
- **Special mechanisms**: real-time delivery, geospatial indexing, search, video transcoding pipelines, rate limiting.

For each: state the **problem** (with numbers when possible), propose a **solution**, and name the **trade-off**. Better still, compare 2 options and choose: *"Fan-out on write makes reads instant but is expensive for celebrities; fan-out on read is cheap to write but slow to read. I'll use a hybrid."*

## Step 6: wrap-up (≈2–3 minutes)

Summarise the design against the requirements, list remaining **bottlenecks or risks**, and what you'd do with more time (monitoring, analytics, multi-region). Interviewers often use the last minutes to probe; leave room.

## What interviewers grade, by level

| | Junior / new grad | Mid-level | Senior | Staff+ |
|---|---|---|---|---|
| Requirements | covers the basics with help | gathers them independently | quickly finds the ones that matter, including NFRs | reframes the problem; spots hidden requirements |
| High-level design | a working design with some guidance | a complete, sensible design | a clean design produced quickly, leaving time for depth | a design that anticipates evolution and org constraints |
| Depth | knows what components do | can go deep in 1 area | goes deep in 2–3 areas with real trade-offs and numbers | deep in several; knows production realities (ops, cost, failure modes) |
| Drive | interviewer leads | shared | **candidate leads** | candidate leads and teaches |
| Trade-offs | names some | explains several | quantifies and chooses deliberately | considers long-term and cross-team impact |

The biggest jump is from mid to senior: **leading the conversation** and **spending most of the time in deep dives** that you chose because they matter.

## Communicating while you design

- **Think aloud**, but in complete thoughts: "I'm choosing Cassandra here because…".
- **Check in** at the end of each step: "Does this cover what you wanted before I go deeper?"
- **Use the whiteboard** consistently: requirements top-left, numbers below, API, then the diagram. Label arrows with what flows (requests, events) and boxes with the technology when it matters.
- **Respond to hints**: if the interviewer asks "what about a celebrity with 50 M followers?", that's where they want the deep dive.
- **Don't panic about unknowns**: "I haven't used X, but I'd expect it to need Y; here's how I'd reason about it" is fine.

:::warn The common failure modes
1. Spending 20 minutes on requirements and estimates, leaving no time for depth.
2. Drawing a huge "standard" architecture (Kafka, Kubernetes, sharding) with no reason given for any of it.
3. Never reaching the hard part of the problem (the timeline fan-out, the seat contention, the geo index).
4. Going silent for minutes.
5. Defending a choice to the end instead of acknowledging a better option the interviewer points out.
:::

## A one-page template

Use this skeleton for every case study in the next two modules:

```text
1. Functional reqs:     users can … (top 3), out of scope: …
2. Non-functional:      scale (DAU, read/write ratio), latency target, CAP choice per feature, durability, special
3. Entities:            A, B, C …
   Estimates:           write QPS, read QPS (peak), storage/yr → design conclusions
4. API:                 endpoints / events
5. High-level design:   walk each requirement through the boxes
6. Deep dives (2–3):    problem → options → choice → trade-off
7. Wrap-up:             bottlenecks, failure modes, next steps
```

```quiz
? You're 25 minutes into a 45-minute interview and still refining requirements and estimates. What's the main risk?
+ No time left for the deep dives, which is where most of the senior-level signal comes from
- The interviewer will think you're too careful
- Estimates will be wrong
> Timebox requirements (~5 min) and estimates (~5 min); depth is what differentiates candidates.

? When should you introduce sharding into your design?
- At the start, to show you know it
+ When a stated requirement or estimate shows the data or write load exceeds what one primary (plus replicas) can handle
- Never in an interview
> Every component should solve a problem you've identified.

? The interviewer asks "what happens when a celebrity with 50 million followers tweets?" What does this signal?
+ They want a deep dive on the fan-out/hot-key problem; steer your deep dive there
- They want you to restart the design
- It's a trick question to ignore
> Interviewer questions are hints about where they want depth.
```

:::keypoints
- Follow the same six steps every time: **requirements → entities & estimates → API → high-level design → deep dives → wrap-up**, with a clock.
- Requirements: top 3 functional, concrete non-functional (scale, latency, CAP choice, durability).
- Estimates only when they change the design; API with one endpoint per requirement.
- High-level design: simple and correct, walking each requirement through the boxes.
- Spend the most time in **2–3 deep dives** on the non-functional requirements, each as problem → options → choice → trade-off.
- Senior signal = leading the conversation, speed through the basics, depth with numbers and trade-offs.
:::
