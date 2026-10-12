---
title: Builder and Prototype
level: intermediate
time: 40
summary: The Builder pattern for objects with many optional parts — fluent builders that validate before producing an immutable object, with C++ and JavaScript code — and the Prototype pattern for creating new objects by copying configured ones, including deep vs shallow copies and a prototype registry.
---

## Builder

:::def Builder
Separates the **construction** of a complex object from its **representation**: you set the parts step by step on a builder, and a final `build()` validates them and produces the object. The same construction process can create different results.
:::

**Problem:** an HTTP request (or a pizza order, a report query, a notification) has a few required fields and many optional ones. Constructors become unreadable:

```text
new HttpRequest("POST", "https://api.example.com/orders", headers, body, 3000, 3, true, null, "gzip")
//               which argument is the timeout? which is retries? what does `true` mean?
```

This is the **telescoping constructor** problem: either many overloaded constructors, or one constructor with a long list of positional arguments that are easy to get wrong. Setting fields one by one after construction is no better: the object exists in a half-built, possibly invalid state, and can't be immutable.

A builder gives **named steps**, sensible **defaults**, **validation in one place**, and an **immutable** result:

:::tabs A fluent builder with validation
```cpp run
#include <bits/stdc++.h>
using namespace std;

class HttpRequest {                                  // immutable once built
public:
    class Builder;
    string describe() const {
        ostringstream s;
        s << method_ << " " << url_ << " timeout=" << timeoutMs_ << "ms retries=" << retries_;
        for (auto& [k, v] : headers_) s << "\n  " << k << ": " << v;
        if (!body_.empty()) s << "\n  body: " << body_;
        return s.str();
    }
private:
    HttpRequest() = default;                         // only the Builder can create one
    string method_, url_, body_;
    map<string, string> headers_;
    int timeoutMs_ = 5000, retries_ = 0;
};

class HttpRequest::Builder {
    HttpRequest r_;
public:
    Builder(string method, string url) { r_.method_ = std::move(method); r_.url_ = std::move(url); }  // required parts
    Builder& header(const string& k, const string& v) { r_.headers_[k] = v; return *this; }          // optional parts…
    Builder& body(string b) { r_.body_ = std::move(b); return *this; }
    Builder& timeoutMs(int t) { r_.timeoutMs_ = t; return *this; }
    Builder& retries(int n) { r_.retries_ = n; return *this; }
    HttpRequest build() const {                                                                     // validate once
        if (r_.url_.rfind("https://", 0) != 0) throw invalid_argument("url must be https");
        if (r_.method_ == "GET" && !r_.body_.empty()) throw invalid_argument("GET requests can't have a body");
        if (r_.retries_ > 0 && r_.method_ == "POST" && !r_.headers_.count("Idempotency-Key"))
            throw invalid_argument("retrying a POST requires an Idempotency-Key header");
        return r_;
    }
};

int main() {
    auto req = HttpRequest::Builder("POST", "https://api.example.com/orders")
                   .header("Content-Type", "application/json")
                   .header("Idempotency-Key", "7f9c2b1e")
                   .body(R"({"sku":"A12","qty":2})")
                   .timeoutMs(3000)
                   .retries(3)
                   .build();
    cout << req.describe() << "\n";

    try {
        HttpRequest::Builder("POST", "https://api.example.com/orders").retries(2).build();
    } catch (const exception& e) { cout << "build failed: " << e.what() << "\n"; }
}
```
```js run
class HttpRequest {
  constructor(parts) { Object.assign(this, parts); Object.freeze(this); Object.freeze(this.headers); }   // immutable
  describe() {
    const hs = Object.entries(this.headers).map(([k, v]) => `\n  ${k}: ${v}`).join("");
    return `${this.method} ${this.url} timeout=${this.timeoutMs}ms retries=${this.retries}${hs}${this.body ? `\n  body: ${this.body}` : ""}`;
  }
  static builder(method, url) { return new HttpRequestBuilder(method, url); }
}

class HttpRequestBuilder {
  #p;
  constructor(method, url) { this.#p = { method, url, headers: {}, body: "", timeoutMs: 5000, retries: 0 }; }   // defaults
  header(k, v) { this.#p.headers[k] = v; return this; }
  body(b) { this.#p.body = b; return this; }
  timeoutMs(t) { this.#p.timeoutMs = t; return this; }
  retries(n) { this.#p.retries = n; return this; }
  build() {                                                         // validate once
    const p = this.#p;
    if (!p.url.startsWith("https://")) throw new Error("url must be https");
    if (p.method === "GET" && p.body) throw new Error("GET requests can't have a body");
    if (p.retries > 0 && p.method === "POST" && !p.headers["Idempotency-Key"])
      throw new Error("retrying a POST requires an Idempotency-Key header");
    return new HttpRequest({ ...p, headers: { ...p.headers } });
  }
}

const req = HttpRequest.builder("POST", "https://api.example.com/orders")
  .header("Content-Type", "application/json")
  .header("Idempotency-Key", "7f9c2b1e")
  .body('{"sku":"A12","qty":2}')
  .timeoutMs(3000)
  .retries(3)
  .build();
console.log(req.describe());
console.log("frozen:", Object.isFrozen(req));

try { HttpRequest.builder("POST", "https://api.example.com/orders").retries(2).build(); }
catch (e) { console.log("build failed:", e.message); }
```
:::

:::note JavaScript has a lighter alternative
For simple cases, an **options object** with defaults (`new HttpRequest({ method, url, timeoutMs = 5000, retries = 0 })`) already gives named parameters. A builder still helps when construction has **steps**, **cross-field validation**, or must produce an immutable object from incremental input.
:::

The GoF version also has a **Director**: an object that runs a fixed sequence of builder steps ("build a standard margherita") on any builder, so the same steps can produce a pizza **object**, a **receipt** or a **price** through different builders. In practice, the fluent builder above is what interviewers expect.

**Where builders appear:** query builders (SQL, Elasticsearch), test-data builders, `StringBuilder`, configuration objects, protobuf message builders, and in LLD problems for complex entities like a `Trip`, a `Booking`, or a `Report` with many optional filters.

## Prototype

:::def Prototype
Create new objects by **copying an existing, configured instance** (the prototype) instead of constructing them from scratch. The object itself provides the copy operation (`clone()`).
:::

**Problem:** a game spawns hundreds of enemies, each configured with stats, equipment and AI settings loaded from files; a document editor duplicates shapes that may be of many concrete types; a test needs many slightly different copies of a complex order. Building each from scratch is slow or requires knowing the concrete class.

With a prototype, the code asks the object to **clone itself**, which works even when the caller only has a base-class pointer.

:::tabs Prototype with a registry, and deep vs shallow copies
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct Weapon { string name; int damage; };

class Enemy {
public:
    virtual ~Enemy() = default;
    virtual unique_ptr<Enemy> clone() const = 0;          // the prototype operation
    virtual string describe() const = 0;
    string name; int hp; vector<Weapon> loadout;         // vector of values: copied deeply by default
    Enemy(string n, int h, vector<Weapon> w) : name(std::move(n)), hp(h), loadout(std::move(w)) {}
};

class Orc : public Enemy {
public:
    using Enemy::Enemy;
    unique_ptr<Enemy> clone() const override { return make_unique<Orc>(*this); }   // copy constructor does the work
    string describe() const override { return "Orc " + name + " hp=" + to_string(hp) + " weapons=" + to_string(loadout.size()); }
};
class Archer : public Enemy {
public:
    using Enemy::Enemy;
    unique_ptr<Enemy> clone() const override { return make_unique<Archer>(*this); }
    string describe() const override { return "Archer " + name + " hp=" + to_string(hp) + " first weapon=" + loadout[0].name; }
};

int main() {
    // A registry of configured prototypes (in a real game: loaded from data files once)
    map<string, unique_ptr<Enemy>> registry;
    registry["orc-grunt"] = make_unique<Orc>("grunt", 120, vector<Weapon>{{"axe", 15}});
    registry["archer"] = make_unique<Archer>("scout", 70, vector<Weapon>{{"longbow", 22}, {"dagger", 6}});

    vector<unique_ptr<Enemy>> wave;
    for (string kind : {"orc-grunt", "orc-grunt", "archer"}) wave.push_back(registry[kind]->clone());
    wave[0]->hp -= 50;                                   // damaging one copy…
    wave[0]->loadout[0].damage = 99;                     // …and its weapon
    for (auto& e : wave) cout << e->describe() << "\n";
    cout << "prototype untouched: hp=" << registry["orc-grunt"]->hp
         << " axe damage=" << registry["orc-grunt"]->loadout[0].damage << "\n";
}
```
```js run
class Enemy {
  constructor({ name, hp, loadout }) { Object.assign(this, { name, hp, loadout }); }
  clone() { return new this.constructor(structuredClone({ name: this.name, hp: this.hp, loadout: this.loadout })); }   // deep copy
}
class Orc extends Enemy { describe() { return `Orc ${this.name} hp=${this.hp} weapons=${this.loadout.length}`; } }
class Archer extends Enemy { describe() { return `Archer ${this.name} hp=${this.hp} first weapon=${this.loadout[0].name}`; } }

const registry = {
  "orc-grunt": new Orc({ name: "grunt", hp: 120, loadout: [{ name: "axe", damage: 15 }] }),
  archer: new Archer({ name: "scout", hp: 70, loadout: [{ name: "longbow", damage: 22 }, { name: "dagger", damage: 6 }] }),
};

const wave = ["orc-grunt", "orc-grunt", "archer"].map((kind) => registry[kind].clone());
wave[0].hp -= 50;
wave[0].loadout[0].damage = 99;
wave.forEach((e) => console.log(e.describe()));
console.log(`prototype untouched: hp=${registry["orc-grunt"].hp} axe damage=${registry["orc-grunt"].loadout[0].damage}`);

// The classic bug: a SHALLOW copy shares nested objects with the prototype
const shallow = Object.assign(Object.create(Orc.prototype), registry["orc-grunt"]);
shallow.loadout[0].damage = 1;
console.log("after editing a shallow copy, the prototype's axe damage is", registry["orc-grunt"].loadout[0].damage, "← shared!");
```
:::

:::warn Deep vs shallow copies
A **shallow** copy duplicates the top-level object but **shares** nested objects (arrays, maps, referenced objects), so editing the copy's weapon edits the prototype's weapon. A **deep** copy duplicates everything reachable. In C++, members held by value (`vector<Weapon>`) are deep-copied by the copy constructor, but raw pointers and `shared_ptr` members are shared; in JavaScript, spread and `Object.assign` are shallow, while `structuredClone` is deep (for plain data). Decide deliberately which parts should be shared (immutable assets like textures) and which copied (mutable state).
:::

**Where prototypes appear:** JavaScript's whole object model (`Object.create(proto)` delegates to a prototype object), "duplicate" features in editors (copy a slide, a shape, a form field), game entity spawning, caching pre-configured expensive objects, and test fixtures.

```quiz
? A `Report` has 2 required and 12 optional parameters, with rules like "a date range needs both ends". Which pattern fits?
+ Builder: named optional steps, defaults, and validation in build()
- Prototype
- Singleton
> Builders solve telescoping constructors and centralise cross-field validation.

? Why does the builder's build() method validate, rather than each setter?
+ Some rules involve several fields that may be set in any order; build() sees the complete set and guarantees no invalid object is ever created
- Setters can't throw exceptions
- To make the builder faster
> Cross-field invariants can only be checked once all parts are known.

? You clone a prototype with a shallow copy and then change the clone's nested list. What happens to the prototype?
- Nothing
+ Its list changes too, because the shallow copy shares nested objects
- It's deleted
> Shallow copies share references to nested data. Use deep copies for mutable nested state.

? When is Prototype most useful?
+ When objects are expensive or complicated to configure, or the caller only knows an abstract type but needs a copy
- When there must be only one instance
- When the object has many optional constructor parameters
> clone() lets the object copy itself without the caller knowing its concrete class.
```

:::keypoints
- **Builder**: step-by-step construction with named optional parts, defaults, and **validation in `build()`**, producing an **immutable** object; fixes telescoping constructors. In JS, an options object often suffices for simple cases.
- **Prototype**: create objects by **cloning** configured instances via a virtual/polymorphic `clone()`; a **registry** of prototypes replaces many factory branches.
- Be deliberate about **deep vs shallow** copies: share immutable parts, copy mutable state.
:::
