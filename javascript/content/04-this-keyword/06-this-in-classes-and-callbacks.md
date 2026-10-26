---
title: this in classes, callbacks, promises and the DOM
level: intermediate
time: 25
summary: How this behaves in class methods, getters, static methods, inheritance, method chaining, promises and DOM events, and how to bind handlers safely in React-style code.
---

## `this` in a class

In a class, `this` is the **instance** when a method is called as `instance.method()`. Class code is always strict, so a detached method gets `undefined`.

```js run title="Class methods and detached methods"
class Counter {
  count = 0;

  increment() {
    this.count++;
    return this;                      // return this: enables chaining
  }

  get double() { return this.count * 2; }

  static create() {
    return new this();                // in a static method, this is the class itself
  }
}

const c = Counter.create();
c.increment().increment().increment();     // method chaining
console.log(c.count, c.double);

const detached = c.increment;
try { detached(); } catch (e) { console.log(e.name + ": " + e.message); }
```

## Four ways to keep `this` in a class method

```js run title="Four fixes for handler methods"
class Clicker {
  clicks = 0;

  constructor() {
    this.onBind = this.onBind.bind(this);        // 1. bind once in the constructor
  }

  onBind() { return ++this.clicks; }
  onArrow = () => ++this.clicks;                 // 2. arrow class field
  onNormal() { return ++this.clicks; }           // 3. wrapper at the call site
}

const c = new Clicker();
const { onBind, onArrow } = c;
console.log(onBind(), onArrow());

const handler = () => c.onNormal();              // wrapper
console.log(handler());

const handler2 = c.onNormal.bind(c);             // 4. bind at the call site
console.log(handler2());
```

| Way | Pros | Cons |
|---|---|---|
| `bind` in constructor | One function per instance, explicit | Boilerplate for each method |
| Arrow class field | Short, very common in React | One function per instance, not on prototype |
| Wrapper at the call site | No extra setup | New function on every call (can break memoization/equality) |
| `bind` at the call site | Clear | New function each time |

## `this` in inheritance and `super`

```js run title="this is the same object in parent and child"
class Animal {
  constructor(name) { this.name = name; }
  describe() { return `${this.name} makes ${this.sound()}`; }
  sound() { return "a sound"; }
}

class Dog extends Animal {
  sound() { return "woof"; }
  describe() { return super.describe() + "!"; }  // super.method() runs the parent's code with the SAME this
}

console.log(new Dog("Bruno").describe());
```

`super.describe()` calls the parent method, but `this` is still the `Dog` instance, so `this.sound()` finds `Dog`'s override. This is polymorphism.

In a derived class constructor, you **must call `super()` before using `this`**:

```js run title="this before super() is an error" expect-error
class Base { constructor() { this.ready = true; } }
class Child extends Base {
  constructor() {
    this.extra = 1;           // too early: this does not exist until super() returns
    super();
  }
}
new Child();
```

## `this` in promises and async code

Promise callbacks are called plainly, so the same rules apply. Arrow functions are the usual answer.

```js run title="this in promise chains"
class Loader {
  prefix = "[loader]";

  load() {
    return Promise.resolve("data")
      .then((d) => `${this.prefix} got ${d}`);       // arrow: this = the Loader
  }

  async loadAsync() {
    const d = await Promise.resolve("more data");
    return `${this.prefix} got ${d}`;                // await does not change this
  }
}

const l = new Loader();
l.load().then(console.log);
l.loadAsync().then(console.log);
```

## `this` in DOM events

```html run preview height=80 title="Handlers: this and event.currentTarget"
<button id="a">A</button> <button id="b">B</button>
<script>
  class Panel {
    name = "panel";
    onClickBroken(e) { console.log("broken: this is", this === e.currentTarget ? "the button" : "something else"); }
    onClickGood = (e) => console.log("good: this.name =", this.name, "| button =", e.currentTarget.id);
  }
  const p = new Panel();
  document.getElementById("a").addEventListener("click", p.onClickBroken);
  document.getElementById("b").addEventListener("click", p.onClickGood);
  document.getElementById("a").click();
  document.getElementById("b").click();
</script>
```

- A normal function handler gets `this = the element` (same as `e.currentTarget`).
- An arrow function handler keeps your object as `this`, and you read the element from `e.currentTarget`.

## React class components (the famous bug)

```jsx
class Toggle extends React.Component {
  constructor(props) {
    super(props);
    this.state = { on: false };
    this.handleClick = this.handleClick.bind(this);   // without this line, `this` is undefined in handleClick
  }
  handleClick() {
    this.setState((s) => ({ on: !s.on }));
  }
  render() {
    return <button onClick={this.handleClick}>{this.state.on ? "ON" : "OFF"}</button>;
  }
}
```

`onClick={this.handleClick}` passes the **function only**, so React calls it plainly. Function components with hooks avoid the whole problem, because they do not use `this`.

## Getters, setters and `this`

`this` in a getter or setter is the object it is read from, which can be a **child** object through the prototype chain:

```js run title="this in getters follows the receiver"
const base = {
  get label() { return "I am " + this.name; },
};
const child = Object.create(base, { name: { value: "child" } });
console.log(child.label);                // this = child, not base
```

:::interview Why do React class component handlers need bind, and what are the alternatives?
"The handler is passed as a plain function reference like `onClick={this.handleClick}`, so React calls it without the component as `this`. In class code, which is strict, `this` is `undefined`. I can bind in the constructor, use an arrow function class field, or wrap the call in an arrow function at the call site. With function components and hooks, there is no `this`, so the problem does not exist."
:::

## More interview questions on this topic

:::qa What is `this` inside a static method? {level=medium}
**Say this:** "The class (constructor) itself, because you call it as `ClassName.method()`."

**In simple words:** The object before the dot is the class, so that is `this`.
:::

:::qa Why must `super()` be called before `this` in a derived constructor? {level=hard}
**Say this:** "In a derived class the parent constructor creates the object. Until `super()` runs, there is no `this` yet, so touching it throws a ReferenceError."

**In simple words:** The child cannot build on something that does not exist yet.
:::

:::qa How do you chain methods like `a.add(1).add(2)`? {level=easy}
**Say this:** "Return `this` from each method."

**In simple words:** Each call gives you the same object back, so you can call the next method on it.
:::

:::qa Arrow function class field vs bind in the constructor: which one and why? {level=hard}
**Say this:** "Both fix the problem. The arrow field is shorter, but it creates a new function per instance and is not on the prototype, so subclasses cannot override it with `super`. For few instances that is fine."

**In simple words:** Arrow fields are fine for UI components. For thousands of objects, shared prototype methods are lighter.
:::

```quiz
? What is `this` inside `static create() {}` when called as `Counter.create()`?
- An instance
+ The Counter class
- undefined
> The object before the dot is the class.
? What does `super.method()` do to `this`?
- Changes it to the parent
+ Keeps the same instance as this
- Makes it undefined
> The parent's code runs with the current object as this.
? In a derived constructor, what happens if you use `this` before `super()`?
- It is undefined
+ ReferenceError
- Works fine
> The object is created by the parent constructor.
```

:::keypoints
- In classes `this` is the **instance** for `instance.method()`, the **class** for static methods.
- Class code is strict: a detached method gets `undefined`.
- Keep `this` with: **bind in constructor**, **arrow class field**, or a **wrapper**.
- `super.method()` keeps the **same `this`**. Call `super()` **before** using `this` in a derived constructor.
- Promise and `async` code follow normal rules: use arrow callbacks.
:::
