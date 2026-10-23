---
title: "LLD interview: structural patterns"
level: medium
time: 30
summary: Adapter, Bridge, Composite, Decorator, Facade, Flyweight and Proxy: intent, class vs object adapter, decorator vs inheritance, proxy kinds, and the pairs of patterns interviewers ask you to compare.
---

:::qa What is the Adapter pattern? {level=easy}
It converts one interface into another the client expects, so incompatible classes can work together. A `LegacyPrinter::printText(char*)` is wrapped in a class implementing `Printer::print(const string&)`. Use it for third-party and legacy code.
:::

:::qa Class adapter vs object adapter? {level=medium}
A **class adapter** inherits from the adaptee (multiple/private inheritance in C++). An **object adapter** holds the adaptee as a member and delegates. Prefer the object adapter: more flexible and avoids inheritance coupling.
:::

:::qa What is the Decorator pattern? {level=easy}
It wraps an object to add behaviour dynamically while keeping the same interface: `Compressed(Encrypted(FileStream))`. Each decorator forwards to the wrapped object and adds something before/after. It avoids a subclass explosion (`EncryptedCompressedFile` ...).
:::

:::qa Decorator vs inheritance: why prefer decorators? {level=medium}
Inheritance fixes behaviour at compile time and multiplies classes per combination. Decorators combine behaviours at **run time** in any order. Downsides: many small objects, order matters, and identity checks (`==`) on the wrapped object get confusing.
:::

:::qa Decorator vs Proxy: what is the difference? {level=medium}
Both wrap an object with the same interface. A **decorator** adds responsibilities chosen by the client; a **proxy** controls access to the object (lazy loading, caching, security, remote calls) and usually creates/owns the real subject itself.
:::

:::qa Name the kinds of proxy. {level=medium}
Virtual proxy (lazy creation of an expensive object), protection proxy (permission checks), remote proxy (stand-in for an object in another process), caching proxy, logging/smart-reference proxy (`shared_ptr` is a smart-reference proxy).
:::

:::qa What is the Composite pattern? {level=easy}
It lets clients treat individual objects and groups uniformly using a tree: `Component` interface, `Leaf`, and `Composite` that holds children. Examples: files and folders, UI widgets, menu items, org charts. A call on the root recurses through the tree.
:::

:::qa What are the design trade-offs in Composite? {level=hard}
Transparency vs safety. If `add`/`remove` are declared in `Component`, every node looks the same to clients (transparent), but leaves must reject those calls (unsafe at run time). If they are declared only in `Composite`, the compiler keeps leaves safe, but clients must know which kind of node they hold. Also watch for cycles and ownership (`unique_ptr` children).
:::

:::qa What is the Facade pattern? {level=easy}
A simple interface in front of a complex subsystem. `HomeTheater::watchMovie()` calls the amplifier, projector and player in order. It reduces coupling between clients and the subsystem; the subsystem classes stay accessible if needed.
:::

:::qa Adapter vs Facade? {level=medium}
Adapter changes **one** interface to match what a client expects (about compatibility). Facade provides a **new, simpler** interface over **several** classes (about simplification).
:::

:::qa What is the Bridge pattern? {level=hard}
It separates an abstraction from its implementation so both can vary independently: `Shape` (Circle, Square) holds a `Renderer` (OpenGL, SVG). Without it you would need `OpenGLCircle`, `SVGCircle`, ... (a class explosion). It is composition used to avoid inheritance in two dimensions.
:::

:::qa Bridge vs Strategy vs Adapter? {level=hard}
Structurally similar (a class delegating to an interface) but different in intent: **Bridge** is designed up front so abstraction and implementation evolve separately; **Strategy** swaps an algorithm at run time; **Adapter** fixes an incompatibility after the fact.
:::

:::qa What is the Flyweight pattern? {level=medium}
It shares fine-grained objects to save memory by splitting state into **intrinsic** (shared, immutable) and **extrinsic** (passed in by the client). A text editor shares one `Glyph` object per character and passes position/colour when drawing. A factory returns the shared instances.
:::

:::qa Where do you see structural patterns in the C++ standard library? {level=medium}
`std::stack`/`queue` are adapters over containers; `shared_ptr` is a smart-reference proxy; iterators adapt containers for algorithms; `std::function` and `unique_ptr<T, Deleter>` use type erasure/bridge-like composition; `std::string_view` is a lightweight view.
:::

:::qa How do you make the Composite pattern safe with ownership in C++? {level=medium}
The composite owns children with `vector<unique_ptr<Component>>`; leaves have no children. Pass non-owning `Component*`/references for traversal. Avoid parent pointers or use raw non-owning back-pointers carefully.
:::

:::qa When would you NOT use the Decorator pattern? {level=hard}
When the order of wrapping matters in subtle ways, when you need to access the concrete type's members often, or when a simple parameter/flag would do. Also for performance-critical inner loops (virtual calls per layer).
:::

:::qa What is the "wrapper" problem with the Proxy for identity? {level=hard}
A proxy is a different object from the real subject, so pointer equality, `dynamic_cast` and typeid differ. Be careful when code compares objects or expects the real type.
:::

```quiz
? You must give a legacy class an interface your code expects, without modifying it. Which pattern?
- Facade
+ Adapter
- Decorator
> Adapter translates one interface to another.
? Files and folders that both support size() and delete(), arranged in a tree. Which pattern?
- Bridge
+ Composite
- Flyweight
> Uniform treatment of leaves and groups.
```

:::keypoints
- Adapter (convert), Decorator (add behaviour), Proxy (control access), Facade (simplify), Composite (tree), Bridge (two dimensions), Flyweight (share).
- Know the pairs: Adapter vs Facade, Decorator vs Proxy, Bridge vs Strategy.
:::
