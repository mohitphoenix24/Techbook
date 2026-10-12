---
title: Monoliths, Microservices and Service Boundaries
level: intermediate
time: 40
summary: Monolith vs modular monolith vs microservices, what microservices really cost, how to find service boundaries (bounded contexts, data ownership), synchronous vs asynchronous communication between services, service discovery, and the anti-patterns (distributed monolith, shared database) to avoid.
---

"Should this be microservices?" comes up in nearly every architecture discussion. The fashionable answer ("yes, of course") is often wrong. This lesson gives you the vocabulary and the trade-offs to answer it well, and to draw sensible service boundaries in an HLD interview.

## Three architectures

:::def Monolith
One deployable application containing all features (users, orders, payments, search), usually with one database. One codebase, one build, one deploy.
:::

:::def Modular monolith
Still one deployable, but internally split into well-separated **modules** with clear interfaces and (ideally) separate database schemas. Modules don't reach into each other's internals or tables.
:::

:::def Microservices
The system is split into many **small, independently deployable services**, each owning **one business capability** and **its own data**, communicating over the network (HTTP/gRPC calls and events).
:::

```viz algo=arch title="The shop as a monolith"
web      Clients [users]
lb       Load balancer [lb]
mono     Monolith | users + catalog + orders + payments [server*3]
mdb      One database [db]
--
web -> lb
lb -> mono
mono -> mdb
```

```viz algo=arch title="The same shop as microservices"
web      Clients [users]
gw       API gateway [gateway]
users    User service [service]
cat      Catalog service [service]
ord      Order service [service]
pay      Payment service [pay]
udb      Users DB [db]
cdb      Catalog DB [db]
odb      Orders DB [db]
pdb      Payments DB [db]
--
web -> gw
gw -> users
gw -> cat
gw -> ord
ord -> pay
users -> udb
cat -> cdb
ord -> odb
pay -> pdb
```

## The honest trade-offs

| | Monolith | Microservices |
|---|---|---|
| Development speed (small team) | fast: one codebase, easy refactoring | slower: contracts, versioning, many repos/pipelines |
| Development speed (100+ engineers) | slows down: merge conflicts, one release train | teams ship independently |
| Deployment | all or nothing | each service independently; small blast radius |
| Scaling | scale the whole app | scale each service to its own load |
| Technology | one stack | per service (a blessing and a curse) |
| Data consistency | local ACID transactions | distributed: sagas, outbox, eventual consistency |
| Failure modes | in-process calls don't fail | every call can time out; cascading failures |
| Debugging | one stack trace | distributed tracing needed |
| Operations | one thing to run | dozens to hundreds of things to deploy, monitor and secure |
| Latency | function calls (nanoseconds) | network hops (milliseconds each) |

:::tip The real driver is organisational
Microservices mostly solve a **people** problem: letting many teams work and deploy independently (Conway's law: system structure mirrors team structure). Their technical benefits (independent scaling, fault isolation) are real but secondary. A team of 8 engineers rarely benefits; an organisation of 300 usually does.
:::

A sensible path for most products: start with a **modular monolith**, keep module boundaries clean, and **extract** services when there's a concrete reason: a module needs very different scaling (video transcoding), a different reliability profile (payments), a separate team, or a different technology.

## Finding service boundaries

Bad boundaries are expensive: services that must change together, call each other constantly, or share tables. Good boundaries follow the **business domain**:

:::def Bounded context
A part of the business with its own consistent language and model (from Domain-Driven Design). "Product" means something different to the Catalog context (description, images), the Inventory context (stock levels per warehouse) and the Shipping context (weight, dimensions). Each context is a natural service boundary, with its own model of "product".
:::

Rules of thumb:

1. **One service owns each piece of data.** Only the Order service writes to the orders database. Others ask the Order service (API) or listen to its events.
2. **High cohesion, low coupling.** Things that change together stay together. If every feature touches three services, the boundaries are wrong.
3. **Minimise synchronous chains.** A request that calls A → B → C → D is only as available as the product of all four, and as slow as their sum.
4. **Align with teams.** One team should be able to own a service end to end.

:::warn Two anti-patterns
- **Shared database**: several services reading and writing the same tables. Any schema change breaks other services; there's no real independence. Each service gets its own database (or at least its own schema with no cross-access).
- **Distributed monolith**: services that must be deployed together, call each other synchronously for every request, and share libraries with business logic. You get all the costs of microservices and none of the benefits.
:::

## How services talk

| Style | When | Watch out |
|---|---|---|
| **Synchronous request/response** (REST, gRPC) | the caller needs the answer **now** (fetch the price for this checkout) | latency adds up; failures cascade: use timeouts, retries, circuit breakers |
| **Asynchronous events** (Kafka, pub/sub) | others should **react** to something that happened (OrderPlaced) | eventual consistency; ordering and duplicates |
| **Asynchronous commands** (a queue) | ask one service to **do work** later (GenerateInvoice) | needs idempotency and status tracking |

A healthy system leans on **events for propagation** and keeps **synchronous calls for queries the user is waiting on**, shallow and with fallbacks.

```viz algo=seq title="Checkout: sync where the user waits, async for the rest"
participant c Client [mobile]
participant o Order service [service]
participant p Pricing service [service]
participant k Kafka [stream]
participant m Email service [mail]
c -> o : POST /checkout
o -> p : getPrice(cart) | Synchronous: the order total is needed right now (timeout 200 ms).
p --> o : ₹1,299
o -> o : save order + outbox event (one transaction)
o --> c : 201 Created
o ->> k : OrderPlaced | Published via the outbox, asynchronously.
k ->> m : OrderPlaced → send confirmation email | The client never waits for email delivery.
```

## Service discovery

Service instances come and go (autoscaling, deploys, failures), so callers can't hard-code IP addresses.

:::def Service discovery
A way for a service to find the current network locations of another service's healthy instances. A **service registry** (Consul, etcd, Eureka, or Kubernetes' built-in Services/DNS) holds the list; instances register themselves (or the platform does it) and are removed when health checks fail.
:::

Two patterns:

- **Server-side discovery**: callers send requests to a stable address (a load balancer or a Kubernetes Service name like `payments.default.svc`), which forwards to a healthy instance. Simple for clients.
- **Client-side discovery**: the caller asks the registry for the instance list and load-balances itself (gRPC clients, service mesh sidecars). One fewer hop, smarter balancing.

In Kubernetes, the platform handles this: `http://payments` resolves via DNS to a virtual IP that balances across the healthy pods.

## Configuration and shared concerns

Every service needs config, secrets, logging, metrics, tracing, auth, retries and timeouts. Don't make every team rebuild these:

- **Central config** (a config service or Kubernetes ConfigMaps) and **secret management** (Vault, cloud secret managers).
- A **platform layer**: API gateway, service mesh, standard libraries or templates ("paved roads") so each new service starts with logging, metrics, tracing and health checks built in.
- **Contracts**: OpenAPI/Protobuf schemas, versioning rules, and **contract tests** so a change in one service can't silently break its callers.

:::interview How to handle "monolith or microservices?" in an interview
Most HLD interviews expect **service boxes** (users, feed, media, notifications…), because they make the data flow and scaling discussion clear. Draw them, but show you understand the costs: *"I'm drawing these as separate services because they scale very differently. Media processing is CPU-heavy and bursty, and the feed is read-heavy. In a startup I'd begin as a modular monolith and extract media processing first."*
:::

```quiz
? A 6-person startup is building its first product. What's usually the best starting architecture?
+ A modular monolith with clean internal boundaries, extracting services later when there's a concrete need
- 30 microservices, to be ready for scale
- A monolith with no internal structure
> Microservices add operational cost that a tiny team can't absorb; clean modules keep the option open.

? Two services both read and write the same `orders` table. What's the problem?
- It's faster than calling an API
+ They're coupled through the schema: neither can change it independently, and there's no single owner of the data's rules
- Databases can't handle two clients
> Each piece of data should be owned by one service; others use its API or events.

? A user-facing request goes through 5 services in a synchronous chain, each 99.9% available. Why is this a concern?
+ The request's availability is roughly 0.999⁵ ≈ 99.5%, and the latencies add up; a slow service delays everything
- It isn't; more services means more reliability
- Synchronous calls can't use HTTP
> Deep synchronous chains multiply failure probability and latency. Prefer shallow calls and async events.

? What does service discovery provide?
- Encryption between services
+ The current addresses of a service's healthy instances, as they scale up, move and fail
- A list of all APIs for documentation
> A registry (or Kubernetes Services/DNS) tracks instances so callers don't hard-code IPs.
```

:::keypoints
- **Monolith**: simple, fast for small teams, one deploy. **Modular monolith**: the same, with clean boundaries. **Microservices**: independent deploys and scaling per capability, at a high operational and consistency cost.
- Microservices mainly solve **organisational scaling**; start modular, extract services for concrete reasons.
- Draw boundaries around **bounded contexts**; **one service owns each piece of data**; avoid the **shared database** and the **distributed monolith**.
- Use **synchronous calls** only where the user waits (shallow, with timeouts and fallbacks) and **events** to propagate changes.
- **Service discovery** (registry, Kubernetes DNS, client- or server-side) finds healthy instances; provide config, secrets and observability as a shared platform.
:::
