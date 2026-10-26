---
title: Composition vs inheritance
level: intermediate
time: 25
summary: When to use "is-a" and when to use "has-a", the problems with deep hierarchies, dependency injection, and how to refactor an inheritance tree into small composed parts.
---

## The two questions

- **Inheritance** answers: "**What is it?**" A `Dog` **is an** `Animal`.
- **Composition** answers: "**What can it do?**" A `Robot` **has** the ability to walk, and **has** the ability to speak.

Both reuse code. Inheritance reuses by **copying a family tree**. Composition reuses by **plugging in parts**.

:::analogy LEGO or a family tree?
Inheritance is a family tree: you get what your parents had, all of it, even what you did not want. Composition is LEGO: you pick exactly the bricks you need and snap them together.
:::

## The problem with deep inheritance

Imagine a game with characters:

```
Character
  ├─ Warrior
  ├─ Mage
  └─ Archer
```

Now you need a **flying** warrior, a **swimming** mage, and a **flying and swimming** archer. With inheritance, you start to create `FlyingWarrior`, `SwimmingMage`, `FlyingSwimmingArcher`... The tree explodes. This is the **gorilla and banana problem**: "You wanted a banana, but you got a gorilla holding the banana and the whole jungle."

```js run title="The inheritance trap"
class Duck { fly() { return "flies"; } swim() { return "swims"; } }
class RubberDuck extends Duck {
  fly() { throw new Error("rubber ducks cannot fly"); }     // breaks the parent's promise (Liskov!)
}

try { new RubberDuck().fly(); } catch (e) { console.log(e.message); }
```

A `RubberDuck` inherits `fly` just because it is a duck. Then we override it to throw. That is a sign that **inheritance was the wrong tool**.

## Composition: assemble from small parts

```js run title="Composition with small behaviour functions"
const canFly = (state) => ({ fly: () => `${state.name} flies at ${state.altitude}m` });
const canSwim = (state) => ({ swim: () => `${state.name} swims` });
const canQuack = (state) => ({ quack: () => `${state.name} says quack` });

function createDuck(name) {
  const state = { name, altitude: 100 };
  return { name, ...canFly(state), ...canSwim(state), ...canQuack(state) };
}

function createRubberDuck(name) {
  const state = { name };
  return { name, ...canSwim(state), squeak: () => `${name} squeaks` };    // no fly at all
}

const real = createDuck("Donald");
const rubber = createRubberDuck("Rubby");
console.log(real.fly(), "|", real.quack());
console.log(rubber.swim(), "|", rubber.squeak(), "|", typeof rubber.fly);
```

Each ability is a small function. Objects are made by combining only what they need. No fake `fly()` methods.

## Composition with classes: "has-a" through fields

You can also compose with classes by **holding other objects** in fields and **delegating** to them.

```js run title="Delegation: has-a"
class Engine {
  start() { return "engine started"; }
}
class GPS {
  navigate(to) { return `navigating to ${to}`; }
}

class Car {
  #engine = new Engine();
  #gps = new GPS();
  drive(to) { return `${this.#engine.start()}, ${this.#gps.navigate(to)}`; }
}

console.log(new Car().drive("Pune"));
```

A `Car` is not an `Engine`. It **has** one. If tomorrow you need an `ElectricMotor`, you change one field. You do not touch a family tree.

## Dependency injection: pass the parts in

Better still, do not create the parts inside. **Pass them in**, so you can swap them (for tests or other implementations).

```js run title="Dependency injection makes parts swappable"
class OrderService {
  constructor(paymentGateway, notifier) {            // the dependencies come from outside
    this.payment = paymentGateway;
    this.notifier = notifier;
  }
  checkout(amount) {
    const receipt = this.payment.charge(amount);
    this.notifier.send(`paid ${amount}`);
    return receipt;
  }
}

const realPayment = { charge: (a) => `charged ₹${a} on the real card` };
const fakePayment = { charge: (a) => `pretend charge ₹${a}` };       // for tests
const sent = [];
const fakeNotifier = { send: (m) => sent.push(m) };

console.log(new OrderService(realPayment, fakeNotifier).checkout(500));
console.log(new OrderService(fakePayment, fakeNotifier).checkout(80));
console.log(sent);
```

## When inheritance is fine

Use inheritance when:

- There is a **true "is-a"** relationship and the child can be used **anywhere** the parent is used (Liskov substitution).
- The hierarchy is **shallow** (1 or 2 levels).
- The parent is designed to be extended (a framework base class like `Error`, `EventEmitter`, `React.Component`).

Use composition when:

- Behaviour **varies independently** (flying, swimming, logging, caching).
- You want to **swap** parts at run time or in tests.
- A class is starting to need "except in this one case" overrides.

| | Inheritance | Composition |
|---|---|---|
| Relationship | **is-a** | **has-a** / **can-do** |
| Coupling | Tight (child depends on parent internals) | Loose (depends on small interfaces) |
| Change risk | A parent change can break all children | Changes are local |
| Reuse | Whole parent | Only what you pick |
| Testing | Harder (need the parent chain) | Easy (inject fakes) |

:::interview Composition over inheritance: what does it mean and why?
"It means preferring to build objects from small, independent parts they own and delegate to, rather than inheriting from a parent. Inheritance creates tight coupling and deep trees: a child gets everything from the parent, including things it should not have, and a change in the parent can break all children. Composition is more flexible: parts can be swapped, tested with fakes, and combined in new ways. I still use inheritance for real is-a relationships that are shallow, such as extending `Error`."
:::

## More interview questions on this topic

:::qa What is the "gorilla-banana" problem? {level=medium}
**Say this:** "You want one small thing from a parent class, but inheriting brings the whole parent with all its state and behaviour. Composition lets you take only the part you need."

**In simple words:** You asked for a banana. You got the gorilla and the jungle.
:::

:::qa How do you decide between "is-a" and "has-a"? {level=easy}
**Say this:** "I ask: can the child be used everywhere the parent is used without surprises? If yes, inheritance can work. If it only needs some behaviour of another thing, it should *have* it."

**In simple words:** A square is a shape: ok. A car is not an engine: it has one.
:::

:::qa What is dependency injection and why does it help? {level=medium}
**Say this:** "Giving an object its dependencies from outside, usually through the constructor, instead of creating them inside. It makes the code loosely coupled and easy to test with fakes."

**In simple words:** The object does not choose its tools. They are handed to it.
:::

:::qa What are the downsides of composition? {level=hard}
**Say this:** "More small pieces and more wiring, and some boilerplate to delegate methods. Also, there is less obvious discoverability than a class hierarchy. I keep the number of parts small and name them clearly."

**In simple words:** It is flexible, but you need to assemble things yourself.
:::

```quiz
? Which relationship does inheritance model?
- has-a
+ is-a
- uses-a
> A Dog is an Animal.
? A subclass overrides a parent method to throw "not supported". What does this suggest?
- Good design
+ Inheritance may be the wrong choice (a Liskov violation)
- A performance problem
> The child cannot honour the parent's contract.
? What does dependency injection allow?
- Hiding private fields
+ Swapping dependencies, for example to use fakes in tests
- Faster code
> Dependencies come from outside.
```

:::keypoints
- Inheritance = **is-a**; composition = **has-a / can-do**.
- Deep hierarchies are rigid and tightly coupled (**gorilla–banana**).
- Compose from small functions/objects, **delegate**, and **inject dependencies**.
- Use inheritance for **shallow, true is-a** relationships and for framework base classes.
:::
