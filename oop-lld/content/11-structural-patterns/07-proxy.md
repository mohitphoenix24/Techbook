---
title: Proxy
level: intermediate
time: 35
summary: A stand-in object with the same interface that controls access to the real one: virtual (lazy), protection, caching, logging and remote proxies, smart pointers as proxies, and the differences from Decorator and Adapter.
---

:::def Proxy
Provide a **surrogate or placeholder** for another object to **control access to it**. The proxy has the **same interface** as the real subject, so clients cannot tell the difference.
:::

:::analogy Think of it like this
A cheque is a proxy for cash. A security guard at an office is a proxy for the building: you reach the people inside only through him, and he checks your pass. A receptionist who says "she is in a meeting, I will take a message" is a proxy for your manager.
:::

## Structure

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

The client talks to an `Image`. It may hold a `RealImage` or an `ImageProxy`. The proxy decides **when and whether** to involve the real one.

## Kinds of proxy

| Kind | Purpose | Example |
|---|---|---|
| **Virtual proxy** | create an expensive object **lazily** | load a large image only when displayed |
| **Protection proxy** | check **permissions** before forwarding | only admins may delete |
| **Caching proxy** | remember results | avoid repeating a slow call |
| **Logging/monitoring proxy** | record calls, timing | audit trail |
| **Remote proxy** | local stand-in for an object in **another process/machine** | an RPC stub that serialises calls |
| **Smart reference** | extra bookkeeping on access | reference counting, locking (`shared_ptr`) |

## 1. Virtual proxy: lazy loading

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

## 2. Protection proxy: access control

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

## 4. Logging proxy: a generic wrapper with a template

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

## 5. Smart pointers are proxies

`std::unique_ptr` and `std::shared_ptr` are *smart reference* proxies: they look like pointers (`->`, `*`), and add lifetime management (deleting, reference counting) behind the same syntax. The `std::vector<bool>::reference` object returned by `operator[]` is also a proxy (it stands in for a single bit).

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
| Interface vs the wrapped object | **same** | **same** | **different** |
| Intent | **control access** to the subject | **add behaviour/responsibility** | **convert** an interface |
| Who creates the real subject? | often the proxy itself (lazy) | the client passes it in | the client passes it in |
| Typical lifecycle | proxy manages the subject's lifecycle | client builds a chain | n/a |
| Number of wrappers | usually one | often several, stacked | one |

The code can look identical to Decorator; the **intent** decides the name. If you are controlling *whether and when* the real object is used, it is a proxy; if you are *enriching* what it does, it is a decorator.

## Pitfalls

- A proxy that exposes extra methods breaks substitutability: keep the interface identical.
- Remote proxies must handle failures (timeouts, retries); the call looks local but is not.
- Caching proxies need an **invalidation** strategy and thread-safety.
- Do not use a proxy when plain `unique_ptr` + a lazily created member is enough.

:::interview Proxy vs Decorator?
"Both wrap an object with the same interface. A decorator adds behaviour the client composes; a proxy controls access to its subject: it may create it lazily, check permissions, cache results or forward over a network, and often manages the subject's lifetime. A proxy usually has one wrapped subject; decorators are stacked."
:::

```quiz
? What is a virtual proxy for?
- Checking permissions
+ Delaying creation of an expensive object until it is actually needed
- Converting interfaces
> It stands in for the real object and builds it on first use.
? A proxy's interface compared with the real subject's is...
- Simplified
+ The same
- Larger
> Clients must not be able to tell whether they hold the proxy or the real object.
? Which of these is a proxy?
- std::vector
+ std::shared_ptr
- std::sort
> A smart pointer is a smart-reference proxy: pointer syntax plus lifetime management.
```

:::keypoints
- Proxy = same-interface stand-in that controls access: virtual (lazy), protection, caching, logging, remote, smart reference.
- It usually manages the real object's creation or lifetime; clients cannot tell it apart.
- Smart pointers are proxies. Distinguish from Decorator (adds behaviour) and Adapter (changes interface).
:::
