---
title: Proxy
level: intermediate
time: 35
summary: A stand-in object that looks the same as the real one but controls access to it. See lazy loading, permission checks, caching, logging, smart pointers as proxies, and how Proxy differs from Decorator and Adapter.
---

## What is the Proxy pattern?

Don't memorise the definition yet. Think of it like this:

> "Sometimes you should not talk to the real object directly. A **stand-in** stands in front of it and decides when, and whether, to pass your request on."

:::analogy Think of everyday proxies
A cheque is a stand-in for cash. A security guard at an office is a stand-in for the building: you reach the people inside only through him, and he checks your pass. A receptionist who says "she is in a meeting, I will take a message" is a stand-in for your manager.
:::

:::def Proxy
A **stand-in object** with the **same interface** as the real object. It controls access to the real one. The user cannot tell the difference.
:::

## The structure

```viz algo=uml title="Proxy"
interface Image
  + display(): void
class RealImage
  - file: string
  + display(): void
class ImageProxy
  - real: RealImage
  - file: string
  + display(): void
class Client
RealImage ..|> Image
ImageProxy ..|> Image
ImageProxy --> RealImage : creates and uses
Client --> Image
```

The user talks to an `Image`. It might be holding a `RealImage` or an `ImageProxy`. The proxy decides **when and whether** to use the real one.

## Kinds of proxy

| Kind | What it does | Example |
|---|---|---|
| **Virtual proxy** | creates a costly object **only when needed** (lazy) | load a big image only when it is shown |
| **Protection proxy** | checks **permission** before passing on | only admins may delete |
| **Caching proxy** | remembers answers | avoid repeating a slow call |
| **Logging proxy** | records calls and time | audit trail |
| **Remote proxy** | local stand-in for an object on **another machine** | a network call stub |
| **Smart reference** | does extra work on access | `shared_ptr` counting references |

## 1. Virtual proxy: load late

```cpp run title="The image loads only when first displayed"
#include <iostream>
#include <memory>
#include <string>
#include <vector>
using namespace std;

class Image {
public:
    virtual ~Image() = default;
    virtual void display() = 0;
};

class RealImage : public Image {
    string file_;
public:
    explicit RealImage(string f) : file_(move(f)) { cout << "  (loading " << file_ << " from disk: slow)\n"; }
    void display() override { cout << "  showing " << file_ << "\n"; }
};

class ImageProxy : public Image {
    string file_;
    unique_ptr<RealImage> real_;                           // not created until needed
public:
    explicit ImageProxy(string f) : file_(move(f)) {}      // cheap
    void display() override {
        if (!real_) real_ = make_unique<RealImage>(file_); // create on first use
        real_->display();
    }
};

int main() {
    vector<unique_ptr<Image>> gallery;
    for (const char* f : {"a.jpg", "b.jpg", "c.jpg"}) gallery.push_back(make_unique<ImageProxy>(f));
    cout << "gallery created: nothing loaded yet\n";
    gallery[1]->display();                                 // loads b.jpg only
    gallery[1]->display();                                 // already loaded
}
```

The image is loaded only the first time we call `display()`. If we never display it, we never pay the cost.

## 2. Protection proxy: check permissions

```cpp run title="Permission check in front of a document"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

class Document {
public:
    virtual ~Document() = default;
    virtual string read() const = 0;
    virtual void write(const string& text) = 0;
};
class RealDocument : public Document {
    string text_ = "confidential plan";
public:
    string read() const override { return text_; }
    void write(const string& t) override { text_ = t; }
};

enum class Role { Viewer, Editor };

class ProtectedDocument : public Document {
    unique_ptr<Document> real_;
    Role role_;
public:
    ProtectedDocument(unique_ptr<Document> d, Role r) : real_(move(d)), role_(r) {}
    string read() const override { return real_->read(); }                    // everyone may read
    void write(const string& t) override {
        if (role_ != Role::Editor) { cout << "  access denied: viewers cannot write\n"; return; }
        real_->write(t);
    }
};

int main() {
    ProtectedDocument viewer(make_unique<RealDocument>(), Role::Viewer);
    ProtectedDocument editor(make_unique<RealDocument>(), Role::Editor);
    viewer.write("hack");
    editor.write("revised plan");
    cout << viewer.read() << " | " << editor.read() << "\n";
}
```

## 3. Caching proxy

```cpp run title="Cache expensive lookups"
#include <iostream>
#include <map>
#include <memory>
#include <string>
using namespace std;

class WeatherService {
public:
    virtual ~WeatherService() = default;
    virtual int temperature(const string& city) = 0;
};
class RemoteWeather : public WeatherService {
public:
    int temperature(const string& city) override { cout << "  (network call for " << city << ")\n"; return city == "Pune" ? 28 : 31; }
};
class CachingWeather : public WeatherService {
    unique_ptr<WeatherService> real_;
    map<string, int> cache_;
public:
    explicit CachingWeather(unique_ptr<WeatherService> r) : real_(move(r)) {}
    int temperature(const string& city) override {
        auto it = cache_.find(city);
        if (it != cache_.end()) return it->second;          // hit: no network
        int t = real_->temperature(city);
        cache_[city] = t;
        return t;
    }
};

int main() {
    CachingWeather w(make_unique<RemoteWeather>());
    int a = w.temperature("Pune");
    int b = w.temperature("Pune");
    int c = w.temperature("Delhi");
    cout << a << " " << b << " " << c << "\n";
}
```

## 4. Logging proxy

```cpp run title="A reusable timing/logging proxy"
#include <iostream>
#include <memory>
#include <string>
using namespace std;

struct Calculator {
    virtual ~Calculator() = default;
    virtual int add(int a, int b) = 0;
    virtual int divide(int a, int b) = 0;
};
struct RealCalculator : Calculator {
    int add(int a, int b) override { return a + b; }
    int divide(int a, int b) override { if (b == 0) throw runtime_error("divide by zero"); return a / b; }
};
class LoggingCalculator : public Calculator {
    unique_ptr<Calculator> real_;
public:
    explicit LoggingCalculator(unique_ptr<Calculator> r) : real_(move(r)) {}
    int add(int a, int b) override {
        cout << "  call add(" << a << ", " << b << ")\n";
        int r = real_->add(a, b);
        cout << "  -> " << r << "\n";
        return r;
    }
    int divide(int a, int b) override {
        cout << "  call divide(" << a << ", " << b << ")\n";
        try { int r = real_->divide(a, b); cout << "  -> " << r << "\n"; return r; }
        catch (const exception& e) { cout << "  !! " << e.what() << "\n"; throw; }
    }
};

int main() {
    LoggingCalculator calc(make_unique<RealCalculator>());
    calc.add(2, 3);
    try { calc.divide(1, 0); } catch (const exception&) { cout << "caller saw the exception too\n"; }
}
```

## 5. Smart pointers are proxies too

`std::unique_ptr` and `std::shared_ptr` look like normal pointers (`->`, `*`). But behind the scenes they also manage the object's life (deleting it, counting references). That is a proxy at work.

Another example: `vector<bool>`'s `operator[]` returns a small helper object that stands in for one bit.

```cpp run title="A tiny smart-reference proxy: counting accesses"
#include <iostream>
using namespace std;

struct Data { int value = 42; };

template <typename T>
class CountedRef {                                          // looks like a pointer, counts how often it is used
    T* p_;
    mutable int accesses_ = 0;
public:
    explicit CountedRef(T* p) : p_(p) {}
    T* operator->() const { ++accesses_; return p_; }
    int accesses() const { return accesses_; }
};

int main() {
    Data d;
    CountedRef<Data> ref(&d);
    int a = ref->value, b = ref->value + 1;
    cout << a << " " << b << " accesses: " << ref.accesses() << "\n";
}
```

## Proxy vs Decorator vs Adapter

| | Proxy | Decorator | Adapter |
|---|---|---|---|
| Interface vs the real object | **same** | **same** | **different** |
| Purpose | **control access** | **add a feature** | **convert** an interface |
| Who creates the real object? | often the proxy itself (lazily) | the user passes it in | the user passes it in |
| How many wrappers? | usually one | often several, stacked | one |

The code can look the same as a decorator. The **purpose** gives it the name. If you control *whether and when* the real object is used, it is a proxy. If you *add* to what it does, it is a decorator.

## Mistakes to avoid

- If a proxy adds extra methods, it is no longer a perfect stand-in. Keep the interface identical.
- A remote proxy looks like a local call but is not. Handle timeouts and failures.
- A caching proxy needs a way to **clear old data** and must be thread-safe.
- Do not build a proxy when a simple `unique_ptr` with lazy creation is enough.

## Short answer to say in an interview

:::interview What is the difference between Proxy and Decorator?
"Both wrap an object and have the same interface. A decorator adds a feature that the user chooses, and decorators are often stacked. A proxy controls access to the real object. It might create it lazily, check permissions, cache results, or call over a network. A proxy often manages the real object's lifetime."
:::

```quiz
? What is a virtual proxy used for?
- Checking permissions
+ Delaying the creation of a costly object until it is really needed
- Converting interfaces
> It stands in for the real object and builds it on first use.
? Compared with the real object, a proxy's interface is...
- Simpler
+ The same
- Bigger
> Users must not be able to tell whether they hold the proxy or the real object.
? Which one of these is a proxy?
- std::vector
+ std::shared_ptr
- std::sort
> A smart pointer looks like a pointer and also manages the object's life.
```

:::keypoints
- Proxy = a stand-in with the same interface that controls access: lazy, permission, cache, logging, remote, smart reference.
- It often manages the real object's creation or lifetime. Users cannot tell it apart.
- Smart pointers are proxies. Do not confuse it with Decorator (adds a feature) or Adapter (changes the interface).
:::
