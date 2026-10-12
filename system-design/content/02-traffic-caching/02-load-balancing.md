---
title: Load Balancing
level: intermediate
time: 40
summary: What load balancers do, L4 vs L7, the balancing algorithms (round robin, weighted, least connections, hashing, power of two choices) with a live simulator, health checks and connection draining, sticky sessions, and how to avoid the load balancer itself becoming a single point of failure.
---

A **load balancer** (LB) sits in front of a group of servers and spreads incoming requests across them. It's the component that turns "one server" into "a fleet": it adds capacity, hides failures, and lets you deploy without downtime. It shows up in nearly every HLD diagram, so you should be able to explain its options precisely.

:::def Load balancer
A component that receives traffic on one address and **distributes** it across a pool of backend servers, while **checking their health** and routing around the dead ones.
:::

```viz algo=arch title="A load balancer and its pool"
clients  Clients [users]
lb       Load balancer | one public address [lb]
s1       Server 1 | healthy [server]
s2       Server 2 | healthy [server]
s3       Server 3 | failing checks [server]
--
clients -> lb
lb -> s1
lb -> s2
lb ~> s3 : health check ✕
```

What a load balancer does for you:

1. **Distributes load** so no server is overwhelmed.
2. **Detects failures** with health checks and stops sending traffic to broken servers.
3. **Enables horizontal scaling**: add servers to the pool, and they start receiving traffic.
4. **Enables zero-downtime deploys**: take servers out one at a time, update them, put them back.
5. **Terminates TLS** (often), so backends handle plain HTTP and certificates live in one place.
6. Gives clients **one stable address**, hiding how many servers exist.

## Layer 4 vs layer 7

Remember the layer model from the networking lesson. Load balancers work at one of two levels:

| | L4 (transport) | L7 (application) |
|---|---|---|
| Sees | IP addresses, ports, TCP/UDP | full HTTP: method, path, headers, cookies |
| Routes by | connection | each request |
| Can do | fast forwarding, any TCP/UDP protocol | path-based routing (`/api` vs `/images`), header/cookie rules, retries, rewriting, compression, auth, rate limiting |
| Cost | very cheap, millions of connections | more CPU per request (parses HTTP, often terminates TLS) |
| Examples | AWS NLB, Google Maglev, LVS, HAProxy in TCP mode | AWS ALB, Nginx, Envoy, HAProxy in HTTP mode, Traefik |
| Typical use | front door for huge traffic, non-HTTP protocols, long-lived connections (WebSocket gateways, databases) | microservice routing, API gateways |

Large sites often stack them: an **L4** layer (very fast, anycast IPs) in front of a fleet of **L7** proxies that do the smart routing.

```viz algo=arch title="L7 routing by path"
user    Users [users]
l7      L7 load balancer | /api, /img, /ws [lb]
api     API servers [service*3]
img     Image service [service*2]
ws      WebSocket gateways [server*2]
--
user -> l7
l7 -> api : /api/*
l7 -> img : /img/*
l7 -> ws : /ws (upgrade)
```

## Balancing algorithms

How does the LB choose a server for each request? Try every algorithm in the simulator below. Turn up **slow requests** (a mix of fast and slow work, like real traffic), then **click a server to crash it** and watch what each algorithm does.

```viz algo=lb title="Load balancer simulator"
servers = 4
algo = rr
rate = 6
long = 15
weights = 3,1,1,1
```

### Round robin

Send each new request to the next server in order: 1, 2, 3, 4, 1, 2, … It's simple and fair **if every request costs the same** and every server is the same size. With mixed request costs, one server can collect several slow requests by bad luck while others sit idle.

### Weighted round robin

Like round robin, but a server with weight 3 gets three times as many requests. Use it when servers differ in size (a new 32-core machine next to old 8-core ones) or to send a small share of traffic to a new version (a canary).

### Least connections

Send the request to the server with the **fewest requests in flight** right now. It adapts automatically to slow requests and slow servers, which makes it a great default for varied workloads. Variants divide by weight ("weighted least connections") or use measured response time ("least response time").

### Hashing (IP hash, consistent hashing)

Compute `hash(client IP or user id or URL) mod N` to pick the server. The same client always lands on the same server, which is useful for **affinity**: a server's local cache already holds that user's data, or a WebSocket must reconnect to the same place. Its weakness: if a few clients are very busy, their servers are overloaded (try it in the simulator), and when `N` changes, almost every client moves to a different server. **Consistent hashing** fixes the second problem. It gets its own lesson in the Databases module.

### Random, and the power of two choices

Picking a random server works surprisingly well with many requests, but random luck still creates hot spots. A tiny change fixes most of it:

:::def Power of two choices
Pick **two** servers at random, and send the request to the **less loaded** of the two. This simple trick shrinks the worst-case load dramatically compared with one random choice, and unlike "least connections" it doesn't need an accurate global view of every server. Many large-scale balancers use it (Envoy, NGINX's `random two least_conn`).
:::

```js run title="One random choice vs power of two choices"
// Throw 100,000 requests at 100 servers and look at the busiest server.
let seed = 99;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const N = 100, REQUESTS = 100_000;

function maxLoad(choose) {
  const load = new Array(N).fill(0);
  for (let r = 0; r < REQUESTS; r++) load[choose(load)]++;
  return Math.max(...load);
}

const oneChoice = () => Math.floor(rand() * N);
const twoChoices = (load) => {
  const a = Math.floor(rand() * N), b = Math.floor(rand() * N);
  return load[a] <= load[b] ? a : b;
};

const even = REQUESTS / N;
const one = maxLoad(oneChoice), two = maxLoad(twoChoices);
console.log("perfectly even share per server:", even);
console.log(`busiest server, 1 random choice : ${one}  (+${one - even} over its share)`);
console.log(`busiest server, best of 2 random: ${two}  (+${two - even} over its share)`);
```

### Which one to pick

| Algorithm | Good when | Watch out for |
|---|---|---|
| Round robin | identical servers, uniform requests | uneven request costs |
| Weighted round robin | servers of different sizes, canaries | still blind to actual load |
| Least connections | varied request durations (most real APIs) | needs connection counts; new servers get flooded at first ("slow start" helps) |
| IP / key hash | affinity: local caches, sessions, sockets | hot keys; reshuffling when servers change (use consistent hashing) |
| Power of two choices | large fleets, many balancers without shared state | slightly random |

## Health checks

:::def Health check
A periodic probe from the load balancer to each backend, such as `GET /healthz` every 5 seconds. After a few consecutive failures the server is marked **unhealthy** and receives no traffic; after a few successes it's added back.
:::

Two kinds:

- **Active** checks: the LB calls a health endpoint on a schedule.
- **Passive** checks (outlier detection): the LB watches real traffic, and ejects a server that returns too many `5xx` errors or timeouts.

:::tip What should /healthz check?
A **liveness** check answers "is the process alive?" A **readiness** check answers "can I serve traffic right now?" (warmed up, has database connections). Be careful about checking dependencies: if every server's health check calls the shared database, a brief database hiccup marks **all** servers unhealthy at once, and the LB has nowhere to send traffic. Keep health checks mostly local.
:::

### Connection draining

When a server is being removed (a deploy, scale-in), you don't want to cut off requests in progress. **Connection draining** (deregistration delay) stops sending **new** requests to the server but lets in-flight ones finish, for up to 30–300 seconds, before removing it. Rolling deploys depend on this.

## Sticky sessions

:::def Sticky sessions (session affinity)
The LB sends all requests from one client to the same backend, usually by setting a cookie that names the server, or by hashing the client IP.
:::

Sometimes stickiness is needed (WebSocket connections, servers with large per-user in-memory state, some legacy apps). But it causes uneven load, and when the server dies, the users pinned to it lose their state. The better design, as you saw in the scaling lesson, is **stateless servers with shared session storage**. Use stickiness as an optimisation (for cache locality), never for correctness.

## Who balances the load balancer?

A single load balancer is itself a **single point of failure**. Production setups remove it:

- **Active–passive pair**: two LBs share a **virtual IP**. If the active one dies, the passive one takes over the IP (via VRRP / keepalived) within seconds.
- **Active–active fleet**: many LB instances behind **DNS** (several A records) or **anycast/ECMP** routing, which spreads traffic over all of them. Cloud load balancers (AWS ALB/NLB, Google Cloud LB) do this for you behind one name.
- **Multiple layers**: GeoDNS → regional L4 → L7 proxies → services.

```viz algo=arch title="No single point of failure at the front door"
users    Users [users]
dns      DNS | several A records / anycast [dns]
lb1      LB 1 [lb]
lb2      LB 2 [lb]
app      App servers [server*4]
--
users -> dns
users -> lb1
users -> lb2
lb1 -> app
lb2 -> app
```

## Client-side load balancing

Inside a microservice system, services often skip a central LB entirely. Each client gets the list of healthy instances from a **service registry** (Consul, etcd, Kubernetes endpoints, or DNS) and picks one itself, using the same algorithms. A **service mesh** (Envoy sidecars) does this transparently for every service. That removes a network hop and a central bottleneck. The microservices lesson covers it.

## Global load balancing

Across regions, balancing happens at the DNS or anycast level: users go to the **nearest healthy region** (GeoDNS, latency-based routing, anycast). Within the region, regular load balancers take over. Failover between regions is coarse (minutes), as covered in the DNS lesson.

:::interview Load balancer talking points
In a design, draw the LB, then say: *"L7 load balancer, TLS terminated there, least-connections across stateless app servers, health checks on /healthz, and it's a managed redundant service so it isn't a single point of failure."* That one sentence covers what most interviewers want. Go deeper (L4 vs L7, hashing for affinity, WebSocket balancing by connection count) only if the problem needs it.
:::

```quiz
? Requests to your API take anywhere from 5 ms to 3 s. Which algorithm spreads the load best?
- Round robin
+ Least connections (or power of two choices)
- IP hash
> Round robin ignores how busy each server is. Least connections sends work to servers with the fewest requests in flight, which adapts to slow requests.

? You need `/api/*` to go to one pool and `/static/*` to another. What kind of load balancer do you need?
- Layer 4
+ Layer 7
- DNS round robin
> Routing by URL path requires understanding HTTP, which is layer 7.

? What problem does "power of two choices" solve compared with picking one random server?
+ It sharply reduces the load on the busiest server, without needing a global view of all servers
- It guarantees perfectly equal load
- It keeps each client on the same server
> Choosing the less loaded of two random servers avoids most of the hot spots that pure randomness creates.

? During a deploy, users see errors for requests that were in progress on servers being restarted. What's missing?
- Sticky sessions
+ Connection draining: stop new requests to the server and let in-flight ones finish before stopping it
- A shorter DNS TTL
> Draining (deregistration delay) is what makes rolling deploys invisible to users.
```

:::keypoints
- A load balancer **distributes traffic, health-checks backends, and enables horizontal scaling and zero-downtime deploys**. It often terminates TLS.
- **L4** routes connections by IP/port (fast, any protocol). **L7** understands HTTP and routes each request by path, headers or cookies.
- Algorithms: **round robin** (uniform work), **weighted** (unequal servers, canaries), **least connections** (varied work, a strong default), **hashing** (affinity), **power of two choices** (near-optimal with little state).
- Use **health checks** (keep them local) and **connection draining**. Prefer stateless servers to **sticky sessions**.
- Avoid making the LB a SPOF: redundant pairs, fleets behind DNS or anycast, or managed cloud load balancers.
:::
