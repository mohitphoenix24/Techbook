---
title: Start Here — What System Design Is
level: easy
time: 20
summary: What "system design" means, the two kinds of design interview (high-level and low-level), what a real system looks like from the outside, how this course is organised, and how to use its diagrams, simulators and C++/JavaScript code.
---

Every app you use is more than code on one computer. When you open a feed, send a message or pay for a ride, your request crosses the internet, reaches one of thousands of servers, reads from caches and databases, and may start work that finishes minutes later. **System design** is the skill of planning all of that: which pieces you need, how they talk to each other, and what happens when traffic grows 100× or a machine dies.

This course takes you from "I can write code" to "I can design a system and defend it in an interview". No prior system design knowledge is assumed.

## Two kinds of design

:::def System design
Deciding the **components** of a software system, **how they connect**, and **how data flows** between them, so that the system meets its functional requirements (what it does) and non-functional requirements (how fast, how big, how reliable).
:::

System design interviews come in two flavours. Most companies ask both, usually in separate rounds.

| | High-level design (HLD) | Low-level design (LLD) |
|---|---|---|
| Also called | "System design", architecture | Object-oriented design, machine coding |
| The question | "Design YouTube" | "Design a parking lot" |
| You produce | boxes and arrows: services, databases, caches, queues | classes, interfaces, methods, and often working code |
| You reason about | scale, latency, availability, consistency, cost | clean abstractions, SOLID, design patterns, extensibility, thread safety |
| Zoom level | the whole city | the floor plan of one building |
| Length | 45–60 min of discussion | 45–90 min, often with code that must run |

:::analogy City planning vs. architecture
HLD is **city planning**: where the roads, power plants and water mains go, and how they cope with rush hour. LLD is **architecture of one building**: rooms, doors and wiring, arranged so you can add a floor later without tearing the building down. Good engineers can switch between both zoom levels.
:::

## What a real system looks like

Here is the shape of almost every web application you will design in this course. Don't worry about the names yet. Each box gets its own lesson. Press **▶** to follow a request through the system.

```viz algo=arch title="A typical web application"
user     User | browser or app     [mobile]
dns      DNS                       [dns]
cdn      CDN | images, video, JS   [cdn]
lb       Load balancer             [lb]
app      App servers | stateless   [service*3]
cache    Cache | Redis             [cache]
db       Database | primary + replicas [db]
queue    Queue                     [queue]
worker   Workers | emails, thumbnails [worker*2]
--
user -> dns : 1. where is example.com?
user -> cdn : static files
user -> lb : API calls
lb -> app
app -> cache : hot data
app -> db : source of truth
app ~> queue : slow jobs
queue ~> worker
worker -> db
--
flow Load a profile page
user > dns : The app asks DNS for the IP address of api.example.com.
user > cdn : Images and scripts come from a CDN server close to the user.
user > lb : The API request (GET /profile/42) goes to the load balancer.
lb > app : The load balancer picks one healthy app server.
app > cache : The server checks the cache first. It's a hit, so the database is skipped.
app > lb : The server builds the JSON response…
lb > user : …and the user sees the profile, typically in under 200 ms.
flow Upload a photo
user > lb : POST /photos with the image.
lb > app : An app server receives it.
app > db : It saves the photo record (owner, time, status = "processing").
app > queue : It drops a "make thumbnails" job on the queue and replies at once.
queue > worker : A worker picks up the job in the background…
worker > db : …resizes the image and marks the photo "ready".
```

Notice three ideas that come up again and again:

1. **Many copies of the same thing** (three app servers, two workers). One machine can't handle millions of users, and one machine can die.
2. **Fast paths and slow paths.** The cache answers popular questions fast. The queue moves slow work out of the user's way.
3. **A single source of truth.** The database holds the real data, and everything else is a copy that helps with speed.

## How an interview conversation flows

Design interviews are conversations, not exams with one right answer. The interviewer plays the client and you lead. Here is the rhythm of an HLD interview. You'll learn each step in **The HLD Interview Method** module.

```viz algo=seq title="The shape of a 45-minute design interview"
participant you You [user]
participant int Interviewer [users]
you -> int : clarifying questions | Who uses it? Which features matter most? How many users?
int --> you : scope + numbers
you -> you : back-of-the-envelope math | QPS, storage, bandwidth: this decides what the design needs
you -> int : API + data model | the contract: endpoints and the main entities
you -> int : high-level diagram | boxes and arrows that satisfy every requirement
int --> you : "What if traffic grows 100×?"
you -> int : deep dive + trade-offs | caching, sharding, consistency, failure handling
int --> you : "What breaks first?"
you -> int : bottlenecks + improvements | the senior signal: you find the weak spots yourself
```

:::interview What interviewers actually grade
Not "did you draw the same diagram as Netflix". They grade whether you **ask good questions**, **make reasonable estimates**, **produce a design that works**, **explain the trade-offs of each choice**, and **spot the bottlenecks and failure modes yourself**. A simple design you can defend beats a complicated one you can't.
:::

## Low-level design in one picture

LLD questions ask you to model a small world with classes. Here is a first taste: a parking lot. You'll build the full version, in C++ and JavaScript, in the LLD Interview Problems module.

```viz algo=uml title="A first class diagram: parking lot (simplified)"
class ParkingLot
  - floors: Floor[]
  - pricing: PricingStrategy
  + park(v: Vehicle): Ticket
  + leave(t: Ticket): Money
class Floor
  - spots: Spot[]
  + findSpot(v: Vehicle): Spot
class Spot
  - size: Size
  - vehicle: Vehicle
abstract class Vehicle
  # plate: string
  + size(): Size
class Car
class Truck
interface PricingStrategy
  + price(t: Ticket): Money
class HourlyPricing
ParkingLot *-- Floor : has
Floor *-- Spot : has
Spot --> Vehicle : holds
Car --|> Vehicle
Truck --|> Vehicle
ParkingLot --> PricingStrategy
HourlyPricing ..|> PricingStrategy
```

## How code works in this course

HLD is mostly diagrams and reasoning. But many building blocks (rate limiters, consistent hashing, caches, ID generators) are small algorithms, and LLD is all about code. Code appears in **C++ and JavaScript, side by side**. Pick a tab once, and every example in the course switches to that language. Every example is editable. Press **▶ Run** or `Ctrl` + `Enter`.

Here is a tiny taste of an idea from the URL-shortener case study: turning a number into a short code with base-62 encoding.

:::tabs Base-62 encoding: database id → short code
```cpp run
#include <bits/stdc++.h>
using namespace std;

const string ALPHABET =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Turn an auto-increment id into a short, URL-safe code.
string encode(unsigned long long id) {
    if (id == 0) return "0";
    string code;
    while (id > 0) {
        code += ALPHABET[id % 62];   // last "digit" first
        id /= 62;
    }
    reverse(code.begin(), code.end());
    return code;
}

int main() {
    for (unsigned long long id : {1ULL, 61ULL, 62ULL, 125ULL, 1000000ULL, 56800235583ULL})
        cout << id << " -> " << encode(id) << "\n";
    // 7 characters cover 62^7 ≈ 3.5 trillion ids
    cout << "62^7 = " << (unsigned long long)pow(62, 7) << "\n";
}
```
```js run
const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Turn an auto-increment id into a short, URL-safe code.
function encode(id) {
  if (id === 0) return "0";
  let code = "";
  while (id > 0) {
    code = ALPHABET[id % 62] + code;   // prepend the next "digit"
    id = Math.floor(id / 62);
  }
  return code;
}

for (const id of [1, 61, 62, 125, 1_000_000, 56_800_235_583]) {
  console.log(`${id} -> ${encode(id)}`);
}
// 7 characters cover 62^7 ≈ 3.5 trillion ids
console.log("62^7 =", 62 ** 7);
```
:::

Change the ids and run it again. This small function lets a service create billions of short links. Later you'll see why the hard parts are elsewhere: generating unique ids across many servers, caching hot links, and handling 100,000 redirects per second.

## The map of the course

:::flow From zero to interview-ready
Foundations | how requests travel, APIs, estimation, requirements
Building blocks | load balancers, caches, databases, sharding, queues
Distributed systems | CAP, consistency, consensus, transactions
LLD | OOP, SOLID, design patterns, concurrency, 12 problems
Interview method | the framework, the trade-offs, a mock interview
Case studies | 20 classic questions, worked end to end
:::

- **Modules 1–6 (HLD building blocks).** Each lesson explains one component in plain English, shows it in a diagram or simulator, and ends with the trade-offs interviewers ask about.
- **Modules 7–11 (LLD).** Object-oriented design, SOLID, 22 design patterns, concurrency and 12 classic LLD problems, all in C++ and JavaScript.
- **Modules 12–15 (interview).** The method, 20 case studies, and a final cheat sheet and study plan.
- **Project Lab.** Build a mini Redis, Raft, a mini Kafka, an LSM-tree storage engine and more, to understand them from the inside.

:::tip How to study
Go in order the first time: each lesson builds on the ones before. For each case study, **close the page and design it yourself for 20 minutes first**, on paper, then compare. That's the single most effective way to prepare. The **Questions** page tracks every interview question in the course.
:::

## Mindset: there is no single right answer

Every design decision is a **trade-off**. A cache makes reads fast but can serve stale data. Copying data to three regions survives disasters but makes writes slower or less consistent. A queue smooths out traffic spikes but adds delay. The goal is never "the best system". It is **the right system for these requirements**, with the costs stated out loud.

:::warn The most common beginner mistake
Jumping straight to "I'll use Kafka, Cassandra and Kubernetes" before knowing what the system must do or how big it is. Interviewers read that as cargo-culting. **Requirements first, numbers second, design third.** Every component you add should answer a problem you can name.
:::

```quiz
? What is the main output of a high-level design (HLD) interview?
- A working implementation of every class
+ A diagram of components (services, data stores, caches, queues) and how data flows between them, with the trade-offs explained
- A list of programming languages the system will use
> HLD is about the architecture: the components, how they connect, and why. LLD is where you design classes and write code.

? A design interview is going well when you…
- name as many technologies as possible
- draw the exact architecture that the real company uses
+ ask clarifying questions, estimate the scale, propose a simple working design, and explain the trade-offs and bottlenecks
> Interviewers grade the reasoning: requirements, estimates, a design that works, and the trade-offs behind each decision.

? In the "typical web application" diagram, why does the upload flow put a job on a queue?
- Queues make the database faster
+ Resizing images is slow, so it happens in the background and the user gets a reply at once
- Workers can't talk to the database directly
> Queues move slow work out of the request path. The user doesn't wait for thumbnails to be generated.
```

:::keypoints
- System design = choosing components, connecting them, and deciding how data flows, so that the system is fast, scalable and reliable enough for its requirements.
- **HLD** designs the whole system (services, databases, caches, queues). **LLD** designs the classes and code inside one component.
- Real systems use **many copies** of each part, **fast and slow paths** (caches and queues), and **one source of truth**.
- Interviews reward clarifying questions, estimates, a simple design that works, and clearly stated trade-offs.
- Code in this course comes in **C++ and JavaScript**. Pick a tab and the whole course follows.
:::
