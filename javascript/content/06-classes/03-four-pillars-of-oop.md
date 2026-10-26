---
title: The four pillars of OOP in JavaScript
level: intermediate
time: 25
summary: Encapsulation, abstraction, inheritance and polymorphism, each with a short JavaScript example and the JavaScript twist (prototypes, duck typing, no interfaces).
---

Interviewers often ask for "the four pillars of OOP". Give a definition, a tiny example, and the **JavaScript twist**. The twist is what shows you know the language.

## 1. Encapsulation: bundle data with the code that uses it, and hide the details

```js run title="Encapsulation"
class Thermostat {
  #target = 24;                                   // hidden
  get target() { return this.#target; }
  set target(t) {
    if (t < 16 || t > 30) throw new RangeError("target must be 16 to 30");
    this.#target = t;                             // rules enforced in ONE place
  }
}

const t = new Thermostat();
t.target = 22;
console.log(t.target);
try { t.target = 99; } catch (e) { console.log(e.message); }
```

**JavaScript twist:** real privacy is `#private` (or closures). Before that, it was only a convention.

## 2. Abstraction: show what an object does, hide how

Users of an object need to know **what** it offers (`send(message)`), not **how** it does it (SMTP, HTTP, queues).

```js run title="Abstraction: one simple method hides the details"
class Notifier {
  send(to, message) {
    const payload = this.#format(to, message);       // hidden steps
    return this.#deliver(payload);
  }
  #format(to, message) { return JSON.stringify({ to, message }); }
  #deliver(payload) { return `sent ${payload}`; }
}

console.log(new Notifier().send("asha@mail.com", "Hello"));
```

**JavaScript twist:** there are no `interface` or `abstract` keywords. Abstraction is by **convention** (documented method names), by **TypeScript interfaces**, or by runtime checks with `new.target`.

## 3. Inheritance: reuse and extend

```js run title="Inheritance"
class Vehicle {
  constructor(name) { this.name = name; }
  start() { return `${this.name} starts`; }
}
class ElectricCar extends Vehicle {
  start() { return super.start() + " silently"; }
  charge() { return `${this.name} is charging`; }
}

const car = new ElectricCar("Nexon EV");
console.log(car.start(), "|", car.charge());
```

**JavaScript twist:** inheritance is **prototype-based**: objects link to objects. `class` is syntax over that. An object has **one** prototype (no multiple inheritance), so we use **mixins** or **composition** for more.

## 4. Polymorphism: one call, many behaviours

The same message is sent to different objects, and each responds in its own way.

```js run title="Polymorphism by overriding"
class Shape { area() { return 0; } }
class Circle extends Shape { constructor(r) { super(); this.r = r; } area() { return +(Math.PI * this.r ** 2).toFixed(2); } }
class Rect extends Shape { constructor(w, h) { super(); this.w = w; this.h = h; } area() { return this.w * this.h; } }

const shapes = [new Circle(1), new Rect(2, 3)];
console.log(shapes.map((s) => s.area()));
```

**JavaScript twist: duck typing.** JavaScript does not need a common parent. "If it walks like a duck and quacks like a duck, it is a duck." Any object with the right method works.

```js run title="Polymorphism by duck typing: no common base class"
const logger = { write(msg) { return "console: " + msg; } };
const fileWriter = { write(msg) { return "file: " + msg; } };
const fake = { write: (msg) => "test double: " + msg };

function save(output, message) {
  return output.write(message);              // works with anything that has write()
}

console.log([logger, fileWriter, fake].map((o) => save(o, "hello")));
```

There is **no method overloading** in JavaScript (a second function with the same name replaces the first). Instead, you check arguments or use default values:

```js run title="No overloading: one function, check the arguments"
function area(a, b) {
  if (b === undefined) return a * a;         // one argument: a square
  return a * b;                              // two arguments: a rectangle
}
console.log(area(4), area(4, 5));
```

## Summary table

| Pillar | One-line meaning | In JavaScript |
|---|---|---|
| Encapsulation | Bundle data + behaviour, hide internals | `#private`, closures, getters/setters |
| Abstraction | Show what, hide how | Clear public methods; TypeScript interfaces; `new.target` for abstract classes |
| Inheritance | Reuse behaviour from a parent | Prototype chain, `class extends`, mixins |
| Polymorphism | Same call, different behaviour | Overriding + **duck typing**; no overloading |

## Is JavaScript "really" object-oriented?

Yes, but in its **own style**: it is **prototype-based**, not class-based at heart. It is also **multi-paradigm**: you can write procedural, functional and object-oriented code in the same file. Senior developers often prefer small functions and **composition** over deep class hierarchies.

:::interview Explain the four pillars of OOP with a JavaScript example for each.
"Encapsulation: bundle data and behaviour and hide internals, with `#private` fields and accessors that enforce rules. Abstraction: expose what an object does, not how, through a small public API. Inheritance: reuse behaviour through the prototype chain, with `class extends`, though an object has only one prototype so I use mixins or composition for more. Polymorphism: different objects respond to the same method differently, by overriding or by duck typing, since JavaScript does not need a shared base class and has no method overloading."
:::

## More interview questions on this topic

:::qa Does JavaScript support method overloading? {level=easy}
**Say this:** "No. Defining a function with the same name again replaces the earlier one. I handle variations by checking the number or type of arguments, or by using default and rest parameters."

**In simple words:** One name, one function. You branch inside it.
:::

:::qa What is duck typing? {level=easy}
**Say this:** "Using an object based on the methods and properties it has, not on its class. If it has `write()`, I can pass it where a writer is needed."

**In simple words:** We care about what it can do, not what it is called.
:::

:::qa Is JavaScript class-based or prototype-based? {level=easy}
**Say this:** "Prototype-based. Objects inherit directly from other objects. The `class` keyword is syntax over constructor functions and prototypes."

**In simple words:** There are no real classes underneath, just objects linked to objects.
:::

:::qa How do you create an interface or abstract class in JavaScript? {level=medium}
**Say this:** "JavaScript has none built in. In plain JS I use a base class whose constructor checks `new.target` and throws for missing methods, or I rely on documentation and duck typing. In TypeScript I use `interface` and `abstract class`."

**In simple words:** It is a rule you enforce yourself, or with TypeScript.
:::

```quiz
? Which feature gives real privacy in a class?
- _name
+ #name
- static
> # members are enforced by the engine.
? Why can JavaScript objects of unrelated classes be used the same way?
- Because of multiple inheritance
+ Because of duck typing: what matters is having the right methods
- Because all objects are the same class
> No common base is needed.
? What happens if you define two functions with the same name?
- Both exist (overloading)
+ The later one replaces the earlier one
- A SyntaxError
> JavaScript has no method overloading.
```

:::keypoints
- **Encapsulation**: `#private` + accessors. **Abstraction**: small public API. **Inheritance**: prototype chain / `extends`. **Polymorphism**: overriding + duck typing.
- JavaScript is **prototype-based** and **multi-paradigm**; `class` is syntax over prototypes.
- No overloading, no `interface`/`abstract` keywords (use checks, or TypeScript).
- One prototype per object: **mixins** and **composition** fill the gap.
:::
