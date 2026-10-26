---
title: Design patterns in JavaScript
level: intermediate
time: 30
summary: Eight patterns that senior JavaScript interviews use (module/singleton, factory, builder, observer, strategy, decorator, proxy, command) written in idiomatic modern JavaScript.
---

Design patterns are **named solutions to common problems**. In JavaScript, many patterns are simpler than in Java or C++, because we have **functions as values**, **closures**, **modules** and dynamic objects. Learn the idea, then write it the JavaScript way.

## 1. Module and Singleton: one shared instance

An ES module is evaluated **once**, and the same exports are shared by all importers. So a plain exported object is already a singleton.

```js run title="Singleton the simple way: a module-level object"
// config.js (imagine this is a module file)
const config = {
  env: "production",
  apiUrl: "https://api.example.com",
  set(key, value) { this[key] = value; return this; },
};
Object.freeze(config);                      // optional: nobody can change it
// export default config;

// every file that imports config gets the SAME object
const a = config, b = config;
console.log(a === b);
```

A class-based singleton (when you need lazy creation or private state):

```js run title="Singleton class"
class Database {
  static #instance = null;
  #connected = false;

  constructor() {
    if (Database.#instance) return Database.#instance;      // return the existing one
    Database.#instance = this;
  }
  connect() { this.#connected = true; return "connected"; }
  get isConnected() { return this.#connected; }
}

const d1 = new Database();
const d2 = new Database();
d1.connect();
console.log(d1 === d2, d2.isConnected);
```

Singletons are **global state** in disguise: hard to test. Prefer passing the instance in (dependency injection).

## 2. Factory: create objects without `new` everywhere

```js run title="Factory"
class Email { send(m) { return `email: ${m}`; } }
class Sms { send(m) { return `sms: ${m}`; } }
class Push { send(m) { return `push: ${m}`; } }

const channels = { email: Email, sms: Sms, push: Push };

function createNotifier(type) {
  const Channel = channels[type];
  if (!Channel) throw new Error(`unknown channel: ${type}`);
  return new Channel();
}

console.log(createNotifier("sms").send("OTP 4821"));
console.log(createNotifier("push").send("New offer"));
```

The caller depends on the **name** (`"sms"`), not on the class. New channels are added in one place.

## 3. Builder: build a complex object step by step

```js run title="Builder with method chaining"
class QueryBuilder {
  #table; #fields = ["*"]; #conditions = []; #limit = null;

  from(table) { this.#table = table; return this; }
  select(...fields) { this.#fields = fields; return this; }
  where(condition) { this.#conditions.push(condition); return this; }
  limit(n) { this.#limit = n; return this; }

  build() {
    let sql = `SELECT ${this.#fields.join(", ")} FROM ${this.#table}`;
    if (this.#conditions.length) sql += ` WHERE ${this.#conditions.join(" AND ")}`;
    if (this.#limit !== null) sql += ` LIMIT ${this.#limit}`;
    return sql;
  }
}

console.log(new QueryBuilder().from("users").select("id", "name").where("age > 18").where("city = 'Pune'").limit(10).build());
```

## 4. Observer (publish/subscribe)

One object announces events. Others subscribe. This is the idea behind DOM events, Node's `EventEmitter`, Redux and RxJS.

```js run title="A small event emitter"
class Emitter {
  #handlers = new Map();
  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.off(event, fn);                // return an unsubscribe function
  }
  off(event, fn) { this.#handlers.get(event)?.delete(fn); }
  emit(event, ...args) { this.#handlers.get(event)?.forEach((fn) => fn(...args)); }
}

const shop = new Emitter();
const stopMail = shop.on("order", (id) => console.log("mail: order", id));
shop.on("order", (id) => console.log("stock: reduce for", id));

shop.emit("order", 101);
stopMail();
shop.emit("order", 102);
```

The challenge section has a full `EventEmitter` implementation with `once`, error handling and more.

## 5. Strategy: swap the algorithm

In JavaScript a strategy is often **just a function**.

```js run title="Strategy: pass the algorithm in"
const discounts = {
  none: (price) => price,
  festival: (price) => price * 0.8,
  member: (price) => price * 0.9,
  bulk: (price, qty) => (qty >= 10 ? price * 0.7 : price),
};

function checkout(price, qty, strategy) {
  return +(discounts[strategy](price, qty) * qty).toFixed(2);
}

console.log(checkout(100, 2, "none"), checkout(100, 2, "festival"), checkout(100, 12, "bulk"));
```

## 6. Decorator: add behaviour around a function

A **higher-order function** that wraps another function adds logging, caching, timing or retries without changing the original.

```js run title="Function decorators"
function withLogging(fn, label = fn.name) {
  return function (...args) {
    console.log(`calling ${label}(${args.join(", ")})`);
    const result = fn.apply(this, args);
    console.log(`  -> ${result}`);
    return result;
  };
}

function withCache(fn) {
  const cache = new Map();
  return function (n) {
    if (!cache.has(n)) cache.set(n, fn.call(this, n));
    return cache.get(n);
  };
}

function square(n) { return n * n; }
const smart = withLogging(withCache(square), "square");
smart(4);
smart(4);
```

The `@decorator` syntax for classes (TC39 stage 3, supported in TypeScript and Babel) is the same idea applied to classes and methods.

## 7. Proxy: control access to an object

```js run title="Proxy pattern with the built-in Proxy"
function withValidation(target, rules) {
  return new Proxy(target, {
    set(obj, prop, value) {
      if (rules[prop] && !rules[prop](value)) throw new TypeError(`invalid value for ${String(prop)}: ${value}`);
      obj[prop] = value;
      return true;
    },
  });
}

const user = withValidation({}, { age: (v) => Number.isInteger(v) && v >= 0, email: (v) => /@/.test(v) });
user.age = 30;
user.email = "asha@mail.com";
try { user.age = -5; } catch (e) { console.log(e.message); }
console.log(user.age, user.email);
```

You will see Proxy in detail in the [Proxy and Reflect lesson](#/l/proxy-and-reflect).

## 8. Command: turn actions into objects (undo/redo)

```js run title="Command with undo"
class Editor {
  text = "";
  #history = [];

  run(command) {
    command.do(this);
    this.#history.push(command);
  }
  undo() { this.#history.pop()?.undo(this); }
}

const insert = (s) => ({
  do(editor) { editor.text += s; },
  undo(editor) { editor.text = editor.text.slice(0, -s.length); },
});

const ed = new Editor();
ed.run(insert("Hello"));
ed.run(insert(", world"));
console.log(ed.text);
ed.undo();
console.log(ed.text);
```

## Which pattern for which problem?

| Problem | Pattern |
|---|---|
| One shared object | Module / Singleton |
| Choose which class to create at run time | Factory |
| Many optional settings, step-by-step creation | Builder |
| Many parts react to one event | Observer |
| Swap algorithms | Strategy (a function) |
| Add behaviour without changing code | Decorator (wrapper function) |
| Control access, validate, log, lazy load | Proxy |
| Undo/redo, queue actions | Command |

:::interview Which design patterns do you use in JavaScript and how are they different from Java?
"Mostly module/singleton, factory, observer, strategy and decorator. In JavaScript many are lighter because functions are first-class values: a strategy is just a function, a decorator is a higher-order function, and an ES module is already a singleton. Observer is built into the platform as DOM events and `EventEmitter`. Proxy is built into the language. I avoid singletons for anything with state, because they hide dependencies and make testing hard."
:::

## More interview questions on this topic

:::qa How do you implement a singleton in JavaScript? {level=easy}
**Say this:** "The simplest is a module that exports one object: modules are cached, so everyone gets the same instance. A class version stores the instance in a private static field and returns it from the constructor."

**In simple words:** Create one, keep it, hand out the same one.
:::

:::qa What is the observer pattern? Give two examples in the platform. {level=easy}
**Say this:** "A subject keeps a list of subscribers and notifies them when something happens. Examples: DOM `addEventListener` and Node's `EventEmitter`."

**In simple words:** "Tell me when it happens."
:::

:::qa How is the strategy pattern different in JavaScript than in Java? {level=medium}
**Say this:** "In Java you need an interface and classes. In JavaScript the strategy can simply be a function that you pass or store in an object."

**In simple words:** A function is already a "strategy".
:::

:::qa What is the decorator pattern in JavaScript? {level=medium}
**Say this:** "Wrapping a function or object with another that adds behaviour, such as logging, caching or retries, while keeping the same interface."

**In simple words:** Same function, with extra features around it.
:::

```quiz
? Why is an exported module-level object already a singleton?
- Because it is frozen
+ Because a module is evaluated once and cached
- Because of Proxy
> Every import gets the same exported object.
? A strategy in JavaScript is often…
- An abstract class
+ Just a function passed in
- A Symbol
> Functions are first-class values.
? What does the observer pattern allow?
- Hide data
+ Notify many subscribers when something changes
- Create objects without new
> One-to-many notification.
```

:::keypoints
- JavaScript patterns are **lighter**: functions, closures and modules replace many classes.
- Eight to know: **singleton, factory, builder, observer, strategy, decorator, proxy, command**.
- Modules are singletons. Strategies and decorators are functions. Observer and Proxy are built in.
- Avoid stateful singletons. Prefer **dependency injection**.
:::
