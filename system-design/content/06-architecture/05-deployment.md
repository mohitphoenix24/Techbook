---
title: Deployment, Autoscaling and Safe Releases
level: intermediate
time: 40
summary: How code reaches production safely — containers and Kubernetes in a nutshell, autoscaling (reactive, scheduled, predictive) with the HPA formula, rolling, blue-green and canary releases, feature flags, zero-downtime database migrations (expand and contract), and infrastructure as code.
---

Most outages are caused by **changes**: a bad deploy, a config push, a migration. Systems that deploy dozens of times a day without breaking rely on a toolkit of release practices. In interviews, these come up as "how would you roll this out?", "how does it scale for the evening peak?", and "how do you migrate the schema without downtime?".

## Containers and orchestration in a nutshell

:::def Container
A packaged application with its dependencies (an image), run in an isolated process with its own filesystem view and resource limits. Same image in testing and production; starts in seconds.
:::

:::def Container orchestrator (Kubernetes)
A system that runs containers across a cluster of machines and keeps the **desired state**: "run 12 replicas of checkout v42, each with 1 CPU and 2 GB, spread across 3 zones, restart them if they die, route traffic only to healthy ones".
:::

The Kubernetes vocabulary you'll use:

| Concept | What it is |
|---|---|
| **Pod** | one or more containers scheduled together; the unit of deployment |
| **Deployment** | desired number of identical pods + how to roll out new versions |
| **Service** | a stable name and virtual IP that load-balances across a set of pods |
| **Ingress / Gateway** | HTTP routing from outside into Services |
| **ConfigMap / Secret** | configuration and secrets injected into pods |
| **HPA** (Horizontal Pod Autoscaler) | changes the replica count based on metrics |
| **Liveness / readiness probes** | restart broken pods / keep unready pods out of rotation |

Serverless platforms (AWS Lambda, Cloud Run, Cloud Functions) go further: you deploy functions or containers, and the platform scales them from zero automatically, at the cost of cold starts, execution limits, and less control.

## Autoscaling

:::def Horizontal autoscaling
Automatically adding instances when load rises and removing them when it falls, based on a metric (CPU, requests per second per instance, queue depth, custom metrics).
:::

Kubernetes' HPA uses a simple proportional rule:

:::formula HPA desired replicas
\text{desired} = \left\lceil \text{current} \times \frac{\text{current metric}}{\text{target metric}} \right\rceil
:::

```js run title="Proportional autoscaling, with limits and a scale-down cool-down"
function desiredReplicas({ current, metric, target, min = 2, max = 50 }) {
  const raw = Math.ceil(current * (metric / target));
  if (Math.abs(metric / target - 1) < 0.1) return current;       // within 10% tolerance: don't flap
  return Math.min(max, Math.max(min, raw));
}

// Target: 60% CPU per pod. Simulate a day: [hour, average CPU % at the current size]
let replicas = 4, lastScaleDown = -Infinity;
for (const [hour, cpu] of [[6, 30], [8, 75], [9, 92], [12, 70], [13, 64], [18, 95], [21, 40], [23, 22]]) {
  let next = desiredReplicas({ current: replicas, metric: cpu, target: 60 });
  if (next < replicas && hour - lastScaleDown < 2) next = replicas;      // scale down slowly (avoid thrashing)
  if (next < replicas) lastScaleDown = hour;
  console.log(`${String(hour).padStart(2)}:00  CPU ${String(cpu).padStart(2)}% on ${String(replicas).padStart(2)} pods → ${next} pods`);
  replicas = next;
}
```

Practical lessons:

- **Scale on the right metric**: CPU for CPU-bound services; **requests per instance** or **latency** for I/O-bound ones; **queue depth/age** for workers.
- **Scale up fast, scale down slowly** (cool-downs) to avoid flapping.
- **New instances aren't instant**: pulling images, booting, warming caches and JIT compilers take tens of seconds to minutes, and a node may need to be added too. Keep **headroom** (e.g. target 60% CPU, not 90%) and pre-warm for known events.
- **Scheduled scaling** for predictable peaks (sales at 12:00, the evening TV slot) and **predictive scaling** from historical patterns.
- Autoscaling the app tier is easy; the **database** usually isn't elastic. Make sure scaling app servers doesn't just move the bottleneck (connection limits!).

## Release strategies

### Rolling deployment

Replace instances a few at a time: start some v2 pods, wait until they're ready, drain and stop some v1 pods, repeat. It's the default in Kubernetes. Cheap and simple, but v1 and v2 run **side by side** during the rollout (so they must be compatible), and rolling back means rolling forward again.

### Blue-green deployment

Run two complete environments: **blue** (current) and **green** (new). Deploy and test green, then switch **all** traffic at the load balancer or DNS. Rollback is instant (switch back). It costs double the capacity during the switch, and databases are shared between both, so schema changes still need care.

### Canary release

Send a **small percentage** of real traffic (1% → 5% → 25% → 100%) to the new version, comparing its error rate and latency with the old version at each step, and automatically **roll back** if it's worse.

```viz algo=arch title="A canary release"
users    Users [users]
lb       Load balancer | weighted routing [lb]
stable   v41 · stable | 95% of traffic [service*4]
canary   v42 · canary | 5% of traffic [service]
mon      Canary analysis | errors, p99 vs stable [chart]
--
users -> lb
lb -> stable : 95%
lb -> canary : 5%
stable ~> mon
canary ~> mon
```

It limits the **blast radius** of a bad release to a small fraction of users and catches problems that only appear with real traffic. Variants: canaries by region or by internal users first ("dogfooding"), and **shadow traffic** (copy real requests to the new version and discard its responses, to test it with zero user impact).

| | Rolling | Blue-green | Canary |
|---|---|---|---|
| Extra capacity | little | 2× during the switch | a little |
| Rollback | redeploy old version | instant switch | shift traffic back |
| Users exposed to a bad release | grows with the rollout | all at once (after testing) | a small percentage first |
| Complexity | low | medium | higher (metrics, automation) |

## Feature flags

:::def Feature flag
A runtime switch that turns a code path on or off without a deploy, optionally for a subset of users (by id, percentage, country, plan).
:::

Flags **separate deploying from releasing**: code ships dark, then the feature is enabled for employees, then 1% of users, then everyone. They also act as **kill switches** during incidents (turn off the expensive recommendation widget under load). Use a flag service (LaunchDarkly, Unleash, OpenFeature, or homegrown), and **delete flags** once a rollout is complete: stale flags are technical debt and a source of bugs.

## Zero-downtime database migrations

During a rolling or canary deploy, old and new code run **at the same time** against the **same database**. A migration that renames a column breaks the old code instantly. The standard technique is **expand and contract**:

:::flow Expand and contract (renaming `name` to `full_name`)
Expand | add the new column `full_name` (nullable); old code ignores it
Dual-write | deploy code that writes both columns and reads the old one
Backfill | copy existing data into `full_name` in small batches
Switch reads | deploy code that reads `full_name` (still writing both)
Contract | stop writing `name`, then drop the column later
:::

Other rules: add indexes **concurrently** (`CREATE INDEX CONCURRENTLY` in Postgres) so tables aren't locked; run large backfills in throttled batches; make every migration **backward compatible** with the previous release; and never couple a schema change and the code that depends on it into one irreversible step.

## Infrastructure as code and CI/CD

- **Infrastructure as code** (Terraform, Pulumi, CloudFormation): servers, networks, databases and permissions defined in version-controlled files, reviewed like code, reproducible across environments.
- **CI/CD pipelines**: every change is built, tested (unit, integration, contract tests), scanned for vulnerabilities, and deployed automatically through staging to production with the strategies above.
- **GitOps**: the desired cluster state lives in Git, and an agent (Argo CD, Flux) continuously applies it.
- **Immutable infrastructure**: never patch servers in place; build a new image and replace instances.

:::interview Rollout answer template
*"Services run on Kubernetes with an HPA on requests per pod (target 60% headroom), plus scheduled scale-up before the 8 p.m. peak. Releases go out as canaries (1% → 10% → 50% → 100%) with automated rollback on error rate or p99 regression. New features ship behind flags. Schema changes use expand-and-contract so old and new versions can run together."*
:::

```quiz
? A deployment renames a database column in the same release that starts using the new name. What breaks during a rolling deploy?
+ Old instances still running query the old column name and fail until the rollout finishes
- Nothing; rolling deploys stop all old instances first
- Only the new instances fail
> Old and new code overlap during the rollout. Expand-and-contract keeps both working at every step.

? What's the main advantage of a canary release?
- It needs no monitoring
+ A bad version reaches only a small fraction of users before automated checks catch it and roll back
- It doubles capacity
> It limits the blast radius and tests with real traffic.

? An HPA targets 60% CPU. 10 pods are running at 90% CPU. How many replicas does it ask for?
- 9
+ 15
- 60
> ceil(10 × 90 / 60) = 15.

? What do feature flags let you do?
+ Release a feature to chosen users (or turn it off) at runtime, independently of deploying the code
- Deploy faster by skipping tests
- Replace canary releases entirely
> Flags separate deploy from release and give you kill switches.
```

:::keypoints
- **Containers** package apps; **Kubernetes** keeps the desired state (pods, deployments, services, probes, HPA). Serverless trades control for zero-ops scaling.
- **Autoscale** on the right metric (CPU, requests per instance, queue depth), scale up fast and down slowly, keep headroom, pre-scale for known peaks; watch the non-elastic database.
- **Rolling** (simple), **blue-green** (instant switch/rollback, 2× capacity), **canary** (small blast radius, automated analysis); **shadow** traffic for zero-risk testing.
- **Feature flags** separate deploy from release and give kill switches; clean them up.
- **Expand and contract** for zero-downtime schema changes; concurrent index builds; throttled backfills.
- **Infrastructure as code**, CI/CD and GitOps make all of this repeatable.
:::
