---
title: Object.create and prototypal inheritance
level: intermediate
time: 30
summary: Inheritance without classes: Object.create, linking constructors the classic way, overriding and calling parent methods, mixins, and why "composition over inheritance" matters.
---

## `Object.create`: link to any object

`Object.create(proto)` makes a **new empty object whose prototype is `proto`**. This is the purest form of JavaScript inheritance: one object inherits from another object directly, with no classes.

```js run title="Object.create"
const vehicle = {
  wheels: 4,
  describe() { return `${this.name} has ${this.wheels} wheels`; },
};

const bike = Object.create(vehicle);        // bike inherits from vehicle
bike.name = "Bike";
bike.wheels = 2;                            // shadows the inherited value

const car = Object.create(vehicle, {
  name: { value: "Car", enumerable: true },  // the second argument defines properties
});

console.log(bike.describe());
console.log(car.describe());
console.log(Object.getPrototypeOf(bike) === vehicle);
```

### Polyfill of `Object.create` (an old interview favourite)

```js run title="A simple Object.create"
function myCreate(proto) {
  function F() {}
  F.prototype = proto;
  return new F();                           // new F() links to proto
}

const base = { hi() { return "hi from base"; } };
const child = myCreate(base);
console.log(child.hi(), Object.getPrototypeOf(child) === base);
```

## Inheritance with constructor functions: the full recipe

To make `Student` inherit from `Person`, you need **three things**:

1. Call the parent constructor to set up the parent's data: `Person.call(this, name)`.
2. Link the prototypes: `Student.prototype = Object.create(Person.prototype)`.
3. Restore the `constructor` property.

```js run title="Student inherits from Person (ES5 style)"
function Person(name) {
  this.name = name;
}
Person.prototype.greet = function () {
  return `Hi, I am ${this.name}`;
};

function Student(name, course) {
  Person.call(this, name);                         // 1. parent's data on this new object
  this.course = course;
}

Student.prototype = Object.create(Person.prototype);   // 2. link the chain
Student.prototype.constructor = Student;                // 3. repair constructor

Student.prototype.study = function () {
  return `${this.name} studies ${this.course}`;
};

Student.prototype.greet = function () {                 // override + call the parent version
  return Person.prototype.greet.call(this) + " and I study " + this.course;
};

const s = new Student("Asha", "CS");
console.log(s.greet());
console.log(s.study());
console.log(s instanceof Student, s instanceof Person);
console.log(Object.getPrototypeOf(Student.prototype) === Person.prototype);
```

```viz algo=chain title="The chain after linking"
node s "s (instance)" @0,0 [hl]
  name: "Asha"
  course: "CS"
node sp "Student.prototype" @1,0
  constructor: Student
  study: function
  greet: function (overrides)
node pp "Person.prototype" @2,0
  constructor: Person
  greet: function
node op "Object.prototype" @3,0 [dim]
link s -> sp : [[Prototype]]
link sp -> pp : [[Prototype]]
link pp -> op : [[Prototype]]
```

When you call `s.greet()`, the engine finds `greet` first on `Student.prototype`, so it **overrides** the parent's. To use the parent's version too, call it explicitly with `Person.prototype.greet.call(this)`.

### Common mistake: `Student.prototype = Person.prototype`

```js run title="Do not assign the prototype directly"
function Person() {}
function Student() {}
Student.prototype = Person.prototype;          // WRONG: both share ONE object
Student.prototype.study = function () {};

console.log(typeof new Person().study);        // Person got study too!
```

Always use `Object.create(Person.prototype)` so the child has its **own** prototype object that links to the parent's.

### Common mistake: `Student.prototype = new Person()`

This was common in old code. It runs the parent constructor once at setup time (with no arguments) and puts that instance's data on the prototype, shared by all students. Use `Object.create` instead.

## Delegation: inheriting from plain objects

You do not need constructors at all. Objects can **delegate** to other objects:

```js run title="OLOO: objects linked to other objects"
const Person = {
  init(name) { this.name = name; return this; },
  greet() { return `Hi, I am ${this.name}`; },
};

const Student = Object.create(Person);          // Student delegates to Person
Student.enroll = function (course) { this.course = course; return this; };
Student.describe = function () { return `${this.greet()} (${this.course})`; };

const s = Object.create(Student).init("Ravi").enroll("Maths");
console.log(s.describe());
```

This style is called **OLOO** ("objects linking to other objects"). It matches the real mechanism, but most teams use `class`.

## Mixins: borrowing behaviour

JavaScript allows only **one** prototype, so you cannot inherit from two parents. To share behaviour across unrelated classes, **copy** methods in: a **mixin**.

```js run title="Mixins with Object.assign"
const canFly = { fly() { return `${this.name} flies`; } };
const canSwim = { swim() { return `${this.name} swims`; } };

class Animal {
  constructor(name) { this.name = name; }
}
class Duck extends Animal {}

Object.assign(Duck.prototype, canFly, canSwim);   // copy the methods onto the prototype

const d = new Duck("Donald");
console.log(d.fly(), "|", d.swim());
```

Another style: **function mixins** that take a base class and return a new class:

```js run title="Class mixins: function(Base) returns a class"
const Serializable = (Base) => class extends Base {
  serialize() { return JSON.stringify(this); }
};
const Timestamped = (Base) => class extends Base {
  stamp() { this.createdAt = "2024-01-01"; return this; }
};

class Model { constructor(id) { this.id = id; } }
class Note extends Timestamped(Serializable(Model)) {}

console.log(new Note(1).stamp().serialize());
```

## Composition over inheritance

Deep inheritance trees become rigid ("a `Dog` is an `Animal` that is a `LivingThing`..."). A common advice is: **prefer composition**. Build objects by **combining small behaviours** instead of by inheriting everything.

```js run title="Composition: pick the abilities you need"
const withLogging = (state) => ({ log: (m) => console.log(`[${state.name}] ${m}`) });
const withWalk = (state) => ({ walk: () => `${state.name} walks` });
const withSwim = (state) => ({ swim: () => `${state.name} swims` });

function createDuck(name) {
  const state = { name };
  return { ...withLogging(state), ...withWalk(state), ...withSwim(state) };
}

const duck = createDuck("Donald");
duck.log(duck.walk());
duck.log(duck.swim());
```

:::interview How does inheritance work in JavaScript without classes? How would you make Student inherit from Person using constructor functions?
"Inheritance is via the prototype chain. With constructor functions I call the parent constructor with `Person.call(this, ...)` to set up the instance data, then link the prototypes with `Student.prototype = Object.create(Person.prototype)`, and restore `Student.prototype.constructor = Student`. Overridden methods can call the parent with `Person.prototype.method.call(this)`. `class ... extends` does exactly this for me. For multiple sources of behaviour I use mixins or composition, because there is only one prototype link."
:::

## More interview questions on this topic

:::qa What does `Object.create(null)` do and when would you use it? {level=medium}
**Say this:** "It creates an object with no prototype, so it has no inherited keys like `toString`. I use it for dictionaries where keys come from users, to avoid collisions and prototype pollution, though a `Map` is often better."

**In simple words:** A truly empty object with nothing built in.
:::

:::qa Why is `Child.prototype = Parent.prototype` a bug? {level=medium}
**Say this:** "Both constructors then share the same prototype object, so adding a method to the child also adds it to the parent."

**In simple words:** You wanted a new room linked to the old one, but you gave them the same room.
:::

:::qa Why do we call the parent constructor with `Parent.call(this, ...)`? {level=medium}
**Say this:** "The parent constructor sets up the instance's own data. Calling it with the child's `this` puts that data on the new child object."

**In simple words:** The parent knows how to fill in the parent's fields. We just tell it which object to fill.
:::

:::qa What is a mixin, and why is it needed in JavaScript? {level=medium}
**Say this:** "A way to share methods between classes that do not have a common parent. It is needed because an object can have only one prototype. Mixins copy methods into the prototype, or wrap a base class in a function."

**In simple words:** If you cannot have two parents, you take the skills you need as a gift.
:::

:::qa Composition over inheritance: what does it mean? {level=medium}
**Say this:** "Build objects from small reusable parts they *have*, instead of deep chains of what they *are*. It is more flexible, avoids tight coupling to a parent class, and works well with JavaScript's dynamic objects."

**In simple words:** A duck *has* the abilities to walk and swim. It does not need to be a "SwimmingWalkingBird" subclass.
:::

```quiz
? What does `Object.create(proto)` return?
- A copy of proto
+ A new empty object whose prototype is proto
- proto itself
> It links; it does not copy.
? Why do we write `Student.prototype.constructor = Student` after using Object.create?
- To make instanceof work
+ Because the new prototype object has no own constructor property pointing to Student
- To call the parent constructor
> Without it, student.constructor would be Person.
? Which technique shares behaviour between unrelated classes?
- A deeper inheritance tree
+ Mixins
- Global variables
> Copy or compose behaviours into each class.
```

:::keypoints
- `Object.create(proto)`: a new object linked to `proto`. The core of prototypal inheritance.
- Constructor inheritance recipe: **`Parent.call(this)`** + **`Child.prototype = Object.create(Parent.prototype)`** + **restore `constructor`**.
- Override and call the parent with `Parent.prototype.method.call(this)`.
- Never `Child.prototype = Parent.prototype` or `new Parent()`.
- One prototype only, so use **mixins** or **composition** to share more.
:::
