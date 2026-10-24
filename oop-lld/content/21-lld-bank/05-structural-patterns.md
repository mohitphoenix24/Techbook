---
title: "LLD interview: structural patterns"
level: medium
time: 30
summary: Simple answers about Adapter, Bridge, Composite, Decorator, Facade, Flyweight and Proxy, and the pairs that interviewers like you to compare.
---

:::qa What is the Adapter pattern? {level=easy}
**Say this:** "It changes one interface into another that my code expects, so two classes that do not fit can work together."

**In simple words:** Like a travel plug adapter. A `LegacyPrinter::printText(char*)` is wrapped in a class that follows `Printer::print(const string&)`. Use it for third-party and old code.
:::

:::qa Class adapter vs object adapter? {level=medium}
**Say this:** "A class adapter inherits the other class. An object adapter holds it as a member. I prefer the object adapter."

**In simple words:** The object adapter uses composition, so it is more flexible and does not depend on the other class's insides.
:::

:::qa What is the Decorator pattern? {level=easy}
**Say this:** "It wraps an object with the same interface and adds behaviour. Wrappers can be stacked."

**In simple words:** `Compressed(Encrypted(FileStream))`. Each layer passes the call on and adds something. You avoid a class for every combination, like `EncryptedCompressedFile`.
:::

:::qa Decorator vs inheritance: why prefer decorators? {level=medium}
**Say this:** "Decorators combine features while the program runs, in any order. Inheritance needs a class for each combination."

**In simple words:** The downsides: many small objects, the order matters, and comparing the wrapped object gets confusing.
:::

:::qa Decorator vs Proxy: what is the difference? {level=medium}
**Say this:** "Both wrap an object with the same interface. A decorator adds a feature. A proxy controls access."

**In simple words:** Decorator: "add logging". Proxy: "only load the image when it is needed", "check permission first", or "cache the answer".
:::

:::qa Name the kinds of proxy. {level=medium}
**Say this:** "Virtual (lazy), protection (permissions), remote (another machine), caching, and logging."

**In simple words:** `shared_ptr` is also a proxy: it looks like a pointer and also counts references.
:::

:::qa What is the Composite pattern? {level=easy}
**Say this:** "It lets me treat one object and a group of objects the same way, using a tree."

**In simple words:** Files and folders both have `size()`. A folder adds up its children. The caller never asks "is this a file or a folder?".
:::

:::qa What are the design trade-offs in Composite? {level=hard}
**Say this:** "Where do I put `add` and `remove`: in the common interface (easy to use, but leaves must refuse) or only in the composite (safe, but callers must know the type)."

**In simple words:** If `add` and `remove` are in the common interface, every node looks the same, but a leaf must reject those calls at run time. If they are only in `Composite`, the compiler keeps leaves safe, but callers must know which kind of node they hold.
:::

:::qa What is the Facade pattern? {level=easy}
**Say this:** "One simple interface in front of a complicated group of classes."

**In simple words:** `HomeTheater::watchMovie()` turns on the amplifier, the projector and the player in order. The user calls one method. The inner classes can still be used directly.
:::

:::qa Adapter vs Facade? {level=medium}
**Say this:** "Adapter makes one class fit an interface. Facade makes a group of classes easier to use."

**In simple words:** Adapter is about **compatibility**. Facade is about **simplicity**.
:::

:::qa What is the Bridge pattern? {level=hard}
**Say this:** "It splits a class that changes in two independent ways into two separate groups, joined by a link. This stops a class explosion."

**In simple words:** `Shape` (Circle, Square) holds a `Renderer` (OpenGL, SVG). Without it you would need `OpenGLCircle`, `SVGCircle`, and so on for every pair.
:::

:::qa Bridge vs Strategy vs Adapter? {level=hard}
**Say this:** "The code looks similar, but the purpose differs. Bridge is planned to keep two things apart. Strategy swaps one algorithm. Adapter fixes a mismatch after the fact."

**In simple words:** All three hold a pointer to an interface. What changes is why.
:::

:::qa What is the Flyweight pattern? {level=medium}
**Say this:** "Share the part of many objects that never changes, to save memory."

**In simple words:** A text editor keeps one `Glyph` object for each letter and font, and passes the position in when drawing. The shared part is the **intrinsic** state. The part that differs is the **extrinsic** state.
:::

:::qa Where do you see structural patterns in the C++ standard library? {level=medium}
**Say this:** "`stack` and `queue` are adapters, `shared_ptr` is a proxy, iterators adapt containers for algorithms."

**In simple words:** `std::function` and `unique_ptr` with a custom deleter use type erasure. `string_view` is a light view.
:::

:::qa How do you make the Composite pattern safe with ownership in C++? {level=medium}
**Say this:** "The composite owns its children with `vector<unique_ptr<Component>>`. Everyone else uses plain pointers or references."

**In simple words:** A back pointer to the parent must be a plain, non-owning pointer, or you create a loop of owners.
:::

:::qa When would you NOT use the Decorator pattern? {level=hard}
**Say this:** "When the order of wrapping changes the result in confusing ways, when I need the real type often, or when a simple flag is enough."

**In simple words:** Also avoid it in a very hot loop, because each layer is a virtual call.
:::

:::qa What is the "wrapper" problem with the Proxy for identity? {level=hard}
**Say this:** "A proxy is a different object from the real one, so pointer equality and type checks differ."

**In simple words:** If code compares objects or uses `dynamic_cast`, a proxy may behave differently from the real object.
:::

```quiz
? You must give a legacy class the interface your code expects, without changing it. Which pattern?
- Facade
+ Adapter
- Decorator
> Adapter translates one interface into another.
? Files and folders both support size() and delete(), in a tree. Which pattern?
- Bridge
+ Composite
- Flyweight
> One interface for single items and groups.
```

:::keypoints
- Adapter (convert), Decorator (add a feature), Proxy (control access), Facade (simplify), Composite (tree), Bridge (two directions of change), Flyweight (share).
- Know the pairs: Adapter vs Facade, Decorator vs Proxy, Bridge vs Strategy.
:::
