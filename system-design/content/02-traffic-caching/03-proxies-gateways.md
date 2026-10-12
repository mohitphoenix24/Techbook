---
title: Proxies, API Gateways and Service Meshes
level: intermediate
time: 30
summary: Forward vs reverse proxies, what a reverse proxy like Nginx does, the API gateway pattern (auth, rate limiting, routing, aggregation) and the backend-for-frontend variant, and service meshes with sidecar proxies — when each one belongs in a design.
---

Between the user and your business logic there's usually at least one **proxy**: a server that receives a request and forwards it somewhere else, doing useful work on the way. Load balancers are one kind. API gateways and service meshes are two more you'll be expected to know.

## Forward vs reverse proxies

:::def Forward proxy
Sits in front of **clients** and makes requests to the internet **on their behalf**. The server sees the proxy, not the client. Used by companies to filter and log employee web traffic, by VPN-like services, and for caching at the edge of a network.
:::

:::def Reverse proxy
Sits in front of **servers** and receives requests **on their behalf**. The client thinks it's talking to the server. Nginx, HAProxy, Envoy and every load balancer are reverse proxies.
:::

```viz algo=arch title="Who does the proxy represent?"
c1      Employee laptop [client]
fwd     Forward proxy | represents clients [gateway]
net     Internet [cloud]
rev     Reverse proxy | represents servers [gateway]
srv     Servers [server*3]
--
c1 -> fwd
fwd -> net
net -> rev
rev -> srv
group Company network: c1, fwd
group Your data centre: rev, srv
```

In system design, "proxy" almost always means **reverse proxy**. What one does:

| Job | Why |
|---|---|
| **Load balancing** | spread traffic over the backends |
| **TLS termination** | handle certificates and encryption in one place |
| **Caching** | serve repeated responses without hitting the backend |
| **Compression** | gzip/brotli responses |
| **Static files** | serve them directly, very fast |
| **Security** | hide backend IPs, filter bad requests, limit request sizes, absorb slow clients ("slowloris" attacks) |
| **Buffering** | read a slow client's upload fully before bothering the app server |

## The API gateway

As a system grows into many services, clients would have to know about all of them and every service would re-implement the same cross-cutting features: authentication, rate limiting, logging. An **API gateway** centralises that.

:::def API gateway
A reverse proxy that is the **single entry point** for client API traffic. It routes each request to the right backend service and applies **cross-cutting policies** on the way: authentication, rate limiting, request validation, transformations, logging and metrics.
:::

```viz algo=arch title="An API gateway in front of microservices"
web     Web app [browser]
mobile  Mobile app [mobile]
gw      API gateway | auth · rate limit · routing [gateway]
auth    Auth service [shield]
users   User service [service]
orders  Order service [service]
pay     Payment service [service]
--
web -> gw
mobile -> gw
gw -> auth : verify token
gw -> users : /users/*
gw -> orders : /orders/*
gw -> pay : /payments/*
--
flow GET /orders/991
mobile > gw : GET /orders/991 with a bearer token.
gw > auth : Validate the token (or check a cached JWT signature locally). User 42, allowed.
gw > orders : Rate limit OK → route /orders/* to the order service, adding X-User-Id: 42.
orders > gw : The order JSON comes back. The gateway logs latency and status.
gw > mobile : Response to the client.
```

Common gateway features:

- **Routing** by path, host, header or version (`/v1` vs `/v2`).
- **Authentication** (validate JWTs or API keys once, pass the user identity downstream) and coarse **authorisation**.
- **Rate limiting and quotas** per user, API key or IP (next lessons).
- **Request/response transformation**: protocol translation (REST outside, gRPC inside), header changes, field filtering.
- **Aggregation**: one client call fans out to several services and the gateway combines the results.
- **Observability**: access logs, metrics, tracing headers for every request.
- **Canary releases and A/B routing**: send 5% of requests to a new version.

Examples: Kong, AWS API Gateway, Apigee, Envoy-based gateways, Nginx with plugins, or a small custom service.

:::warn Don't let the gateway become a monolith
Put **cross-cutting** concerns in the gateway, not **business logic**. If every feature needs a gateway change, you've built a distributed monolith with a single team bottleneck. The gateway is also on the path of **every** request, so it must be stateless, horizontally scaled and highly available.
:::

### Backend for Frontend (BFF)

Different clients want different things: the mobile app wants small payloads and few round trips on a slow network; the web app wants richer data; partners want a stable public API. One general-purpose gateway serves none of them well.

:::def Backend for Frontend (BFF)
A separate, thin API layer **per client type** (web BFF, mobile BFF, partner API), each owned by the team that builds that client. Each BFF calls the shared backend services and shapes the responses for its client.
:::

```viz algo=arch title="One BFF per client type"
web      Web app [browser]
mob      Mobile app [mobile]
bffw     Web BFF [gateway]
bffm     Mobile BFF | small payloads [gateway]
users    User service [service]
feed     Feed service [service]
media    Media service [service]
--
web -> bffw
mob -> bffm
bffw -> users
bffw -> feed
bffw -> media
bffm -> users
bffm -> feed
bffm -> media
```

GraphQL is often used as a BFF: one schema that each client queries in its own shape.

## Service mesh

Inside the data centre, services call each other constantly. Each call needs the same things: service discovery, load balancing, retries, timeouts, encryption (mTLS), and metrics. Implementing them in every service, in every language, is error-prone.

:::def Service mesh
An infrastructure layer that handles service-to-service communication. A small proxy (a **sidecar**, usually Envoy) runs next to every service instance and intercepts all its network traffic. A central **control plane** (Istio, Linkerd, Consul) configures all the sidecars: routing rules, retries, timeouts, mutual TLS certificates, and telemetry.
:::

```viz algo=arch title="Sidecar proxies: the network logic leaves your code"
cp      Control plane | Istio / Linkerd [service]
a       Orders service [service]
sa      Sidecar proxy [gateway]
sb      Sidecar proxy [gateway]
b       Payments service [service]
--
a -> sa : plain local call
sa -> sb : mTLS, retries, timeouts, metrics
sb -> b
cp ~> sa : config + certs
cp ~> sb : config + certs
```

**Gains:** consistent retries, timeouts and circuit breaking everywhere; encryption and identity between services without code changes; uniform metrics and tracing; traffic shifting for canary deploys.
**Costs:** an extra hop (sub-millisecond, but on every call), more moving parts to run and debug, and real operational complexity. It pays off at **many services and many teams**, not for five services.

## Putting it together

| Component | Sits between | Main job |
|---|---|---|
| CDN | users and your origin | cache and serve content at the edge |
| L4/L7 load balancer | clients and a pool of identical servers | spread load, health checks |
| Reverse proxy (Nginx) | clients and app servers | TLS, static files, buffering, routing |
| API gateway | external clients and your services | one entry point; auth, rate limits, routing |
| BFF | one client type and your services | shape APIs for that client |
| Service mesh | service and service | reliable, secure internal calls |

In practice these overlap a lot: one Envoy deployment can be your L7 load balancer, your API gateway and your mesh sidecars. In an interview, draw **one box** at the front labelled something like "API gateway / L7 LB" and list its responsibilities. Don't draw five proxies in a row.

```quiz
? Which is a reverse proxy?
- A corporate proxy that filters employees' web browsing
+ Nginx in front of your app servers, terminating TLS and routing requests
- A VPN client on a laptop
> A reverse proxy represents the servers. A forward proxy represents the clients.

? Which responsibility does NOT belong in an API gateway?
- Validating authentication tokens
- Per-API-key rate limiting
+ Calculating an order's discount according to business rules
- Routing /v2 requests to the new service version
> Gateways handle cross-cutting concerns. Business logic belongs in the services.

? What does a service mesh sidecar give you?
+ Retries, timeouts, mutual TLS, load balancing and metrics for service-to-service calls without changing application code
- A database for each service
- A faster programming language
> The sidecar intercepts network traffic, so the mesh can apply consistent policies to every call.
```

:::keypoints
- A **forward proxy** acts for clients; a **reverse proxy** acts for servers (load balancing, TLS, caching, compression, security).
- An **API gateway** is the single entry point for client traffic: routing, auth, rate limiting, transformation, observability. Keep business logic out of it, and scale it like any stateless tier.
- **BFFs** give each client type (web, mobile, partners) its own thin, tailored API layer.
- A **service mesh** puts a sidecar proxy beside each service to handle discovery, retries, timeouts, mTLS and telemetry. It's worth it with many services and teams.
- In interviews, one "API gateway / L7 LB" box with its responsibilities listed is usually enough.
:::
