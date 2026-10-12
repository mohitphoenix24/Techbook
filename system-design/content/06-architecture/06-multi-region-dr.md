---
title: Multi-Region Architecture and Disaster Recovery
level: advanced
time: 40
summary: Surviving the loss of a whole data centre or region — availability zones vs regions, RPO and RTO, the four disaster-recovery strategies from backup-and-restore to active-active, routing users between regions, data replication and write conflicts, data residency, cell-based isolation, and proving it all works with chaos engineering.
---

Servers fail daily, racks occasionally, and entire data centres or cloud regions a few times a year (power, cooling, networking, a bad configuration push). Designs for highly available or global products must answer: **what happens when a whole region disappears?** And separately: **how close to users are we?** Both lead to multi-region architecture, one of the most expensive and complex decisions in system design.

## Zones and regions

:::def Availability zone (AZ)
One or more data centres within a region, with independent power, cooling and networking, connected to the other zones by fast links (~1–2 ms). Spreading replicas across 3 AZs survives a data-centre failure with almost no latency cost.
:::

:::def Region
A geographic area (us-east-1, eu-west-1, ap-south-1) containing several AZs, hundreds or thousands of kilometres from other regions (tens to 200+ ms apart).
:::

**Multi-AZ** is the baseline for anything serious: load balancers, app servers and database replicas spread over 3 zones, with synchronous or semi-synchronous replication between them. **Multi-region** is needed for surviving regional disasters, serving global users with low latency, or legal data-residency requirements.

## RPO and RTO

Two numbers define a disaster-recovery requirement:

:::def RPO (Recovery Point Objective)
How much **data** you can afford to lose, measured in time. RPO = 1 hour means after a disaster you may lose up to the last hour of writes. RPO ≈ 0 means no acknowledged write may be lost.
:::

:::def RTO (Recovery Time Objective)
How long the system can be **down** before service is restored. RTO = 4 hours vs RTO = 1 minute.
:::

```text
            last good backup / replicated point        disaster          service restored
 ──────────────────●────────────────────────────────────────✕──────────────────────●──────►
                   └───────────── RPO (data lost) ──────────┘└──────── RTO ─────────┘
```

Lower RPO and RTO cost more. A payment ledger might need RPO = 0 and RTO = minutes; an internal analytics tool can live with RPO = 24 h and RTO = a day. Ask, and choose per system.

## Four DR strategies

| Strategy | Normal operation | On disaster | RPO | RTO | Cost |
|---|---|---|---|---|---|
| **Backup & restore** | backups copied to another region | rebuild infrastructure, restore backups | hours | hours–days | $ |
| **Pilot light** | data continuously replicated; minimal core (DB replica) running in the DR region | scale up app tier, switch traffic | minutes | tens of minutes | $$ |
| **Warm standby** | a scaled-down but fully working copy runs in the DR region | scale it up, switch traffic | seconds–minutes | minutes | $$$ |
| **Active-active (multi-site)** | every region serves live traffic | route traffic away from the failed region | ~0 (or seconds) | ~0–minutes | $$$$ |

:::warn Backups you haven't restored aren't backups
Test restores regularly (automated), keep backups in another region and account (so a compromised account can't delete them), and use point-in-time recovery for databases. Ransomware and accidental `DELETE`s are far more common than meteor strikes, and replication faithfully copies a mistake to every replica within milliseconds. Only backups (and soft deletes, versioning) let you go back in time.
:::

## Active-passive vs active-active

### Active-passive

One **primary region** handles all traffic (or all writes); a standby region receives replicated data and takes over on failure.

- ✓ Simple data model: one writer, no conflicts.
- ✗ Asynchronous cross-region replication means **RPO > 0** (the last seconds of writes can be lost); failover takes minutes and is a risky, rarely exercised operation; standby capacity sits mostly idle; users far from the primary get higher latency.

### Active-active

Every region serves users, typically the nearest ones.

```viz algo=arch title="Active-active across two regions"
users    Global users [users]
dns      GeoDNS / anycast | health-checked [dns]
lbE      LB · eu-west [lb]
appE     App · eu-west [service*3]
dbE      DB · eu-west [db]
lbA      LB · ap-south [lb]
appA     App · ap-south [service*3]
dbA      DB · ap-south [db]
--
users -> dns
dns -> lbE : Europe, Africa
dns -> lbA : Asia, Oceania
lbE -> appE
lbA -> appA
appE -> dbE
appA -> dbA
dbE <-> dbA : async replication
group eu-west: lbE, appE, dbE
group ap-south: lbA, appA, dbA
```

- ✓ Low latency everywhere, no idle capacity, and failover is just "stop routing to that region" (it's exercised every day).
- ✗ **Writes in several regions** create the multi-leader conflict problem (from the replication lesson); each region needs spare capacity to absorb a failed region's traffic (two regions → each runs at ≤ 50%; three regions → ≤ 67%).

### Taming writes across regions

The approaches, from simplest:

1. **Single write region, global reads**: writes go to one region (higher latency for distant users' writes), reads are served locally from replicas. Many systems are fine with this.
2. **Home region per user (or per tenant)**: each user's data has one home region that accepts their writes; others hold read replicas. No conflicts for per-user data, and it also helps with data residency. A user travelling abroad still writes to their home region.
3. **Conflict-tolerant data**: CRDTs, last-write-wins where acceptable (preferences, presence), append-only events merged later.
4. **Globally consistent databases** (Spanner, CockroachDB, YugabyteDB, DynamoDB global tables in strong mode): consensus across regions, so writes pay a cross-region round trip, but there are no conflicts and RPO = 0.

## Failing over

```viz algo=seq title="A regional failover, step by step"
participant mon Health checks [chart]
participant dns DNS / traffic manager [dns]
participant eu Region eu-west (failing) [server]
participant ap Region ap-south [server]
mon -> eu : probes failing from several vantage points
note mon : declare region unhealthy (avoid flapping: require sustained failure)
mon -> dns : drain eu-west
dns -> ap : route EU users to ap-south | Seconds to minutes, depending on DNS TTLs and client caching.
ap -> ap : scale up to absorb the extra traffic | Pre-provisioned headroom avoids a cascade.
note ap : promote replicas for EU-homed data if the region stays down (accepting RPO)
```

Things to plan in advance: **who decides** to fail over (automatic for stateless traffic, often a human for promoting databases with possible data loss), **capacity headroom** in surviving regions, **static stability** (the surviving regions must not depend on anything in the failed one, including the control plane), and **failback** (bringing the region back and resyncing data).

## Cell-based architecture

:::def Cell
A complete, independent copy of the service stack (app servers, caches, databases) serving a **subset of users**. A thin routing layer maps each user or tenant to a cell.
:::

Cells limit the **blast radius**: a bad deploy, a poison request, or a noisy customer affects one cell's users, not everyone. Deploys go cell by cell (a natural canary). AWS and Slack build large services this way. Cells also scale predictably: when you outgrow a cell, add another.

## Data residency and sovereignty

Laws (GDPR, India's DPDP Act, and others) may require certain personal data to stay in a country or region. The design consequences: home-region routing by user country, regional data stores, careful handling of backups, logs and analytics copies (they're data too), and global features (search across all users, global uniqueness) designed with only non-personal or aggregated data crossing borders.

## Proving it works: chaos engineering

DR plans rot when they're never exercised. **Chaos engineering** (Netflix's Chaos Monkey, which randomly kills production instances; Chaos Kong, which evacuates entire regions) injects failures deliberately to verify that redundancy and failover actually work. **Game days** rehearse disasters with the team. A failover you've practised monthly is far more likely to work at 3 a.m.

:::interview Answering "what if the region goes down?"
Start by asking for the RPO/RTO the business needs. Then pick a tier and state its costs: *"Within the region we're multi-AZ with semi-sync replication, so an AZ loss is invisible. For regional disasters we run warm standby in a second region with async replication: RPO of a few seconds, RTO around 10 minutes via health-checked DNS. If the product needs RPO = 0 across regions, I'd move the ledger to a consensus-replicated database and accept higher write latency."*
:::

```quiz
? A system replicates asynchronously to another region with ~3 s of lag. The primary region is destroyed. What's the RPO?
+ About 3 seconds of writes may be lost
- Zero, because there's replication
- The time to switch DNS
> Asynchronous replication means the last few seconds of acknowledged writes may never have left the region.

? What's the main data challenge of active-active multi-region designs?
- Reads become slower
+ Concurrent writes to the same data in different regions can conflict
- DNS can't route to two regions
> Multi-leader writes need conflict avoidance (home regions), conflict resolution, or a globally consistent database.

? Why can't replication replace backups?
+ Replication copies mistakes and deletions to every replica almost instantly; only backups (and versioning) let you restore an earlier state
- Replication is too slow
- Backups are faster to restore than replicas
> A dropped table is dropped everywhere within milliseconds.

? With three active-active regions that must survive the loss of one, about how loaded can each region be normally?
- 100%
- 90%
+ About 67%
> After a failure, the two survivors must carry all traffic: each must be able to grow by 50%, so normal load ≤ 2/3.
```

:::keypoints
- **Multi-AZ** is the baseline; **multi-region** for regional disasters, global latency and data residency.
- Define **RPO** (data you may lose) and **RTO** (downtime you can tolerate) per system.
- DR strategies: **backup & restore** → **pilot light** → **warm standby** → **active-active**, each cheaper RPO/RTO at higher cost. Test restores; backups protect against mistakes, replication doesn't.
- **Active-passive**: simple writes, async RPO, risky failovers. **Active-active**: low latency and routine failover, but write conflicts (use home regions, CRDTs, or global consensus databases) and capacity headroom.
- **Cells** limit blast radius; **chaos engineering** and game days prove failover works.
:::
