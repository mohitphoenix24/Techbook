---
title: Design a Logging Framework
level: easy
time: 45
summary: Build a small logging library with levels, destinations (console, file, memory), formats, filters, safe use from many threads, and an option to log on a background thread, using Strategy, Chain of Responsibility and Decorator.
---

:::problem Design a Logging Framework {level=easy tags="Chain of Responsibility,Strategy,concurrency,infrastructure"}
Design a logging library like log4j or spdlog. Programs write messages at levels (DEBUG, INFO, WARN, ERROR). The library sends the messages to one or more destinations (console, file, memory). Each destination has its own minimum level and format. It must be safe for many threads and easy to extend with new destinations and formats.

:::hint Hint
Three things can change: **where** to write (the appender), **how** to format (the formatter), and **which messages** to accept (the level filter). Make each one its own abstraction. The logger just sends the message to all of them. Also think about who creates the logger and how it is shared.
:::
:::

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| Levels? | DEBUG < INFO < WARN < ERROR |
| Destinations? | console, file, memory (for tests). More later |
| A level for each destination? | yes. The console shows INFO and above. The file gets everything |
| Format? | a pattern like `[LEVEL] message`, with or without time. Can change for each destination |
| Many threads? | yes. Lines must not get mixed up |
| Speed? | there must be a background mode, without changing the callers |
| Setup? | built once at start. A logger is found by name |
| Not needed | log rotation, sending logs to a server (we only mention them) |

## Step 2: Find the classes

```viz algo=uml title="Logging framework"
class Logger
  - name: string
  - minLevel: Level
  - appenders: Appender[]
  + debug(msg: string): void
  + info(msg: string): void
  + warn(msg: string): void
  + error(msg: string): void
class LogRecord
  - level: Level
  - loggerName: string
  - message: string
  - time: long
interface Appender
  + append(r: LogRecord): void
  + setLevel(l: Level): void
class ConsoleAppender
class MemoryAppender
class AsyncAppender
interface Formatter
  + format(r: LogRecord): string
class SimpleFormatter
class DetailedFormatter
class LogManager
  + get(name: string): Logger
Logger o-- Appender
Appender --> Formatter
ConsoleAppender ..|> Appender
MemoryAppender ..|> Appender
AsyncAppender ..|> Appender
SimpleFormatter ..|> Formatter
DetailedFormatter ..|> Formatter
LogManager o-- Logger
Logger ..> LogRecord
```

## Step 3: Design decisions

- **Appender** and **Formatter** are Strategies. The appender holds a formatter. A new `JsonFormatter` or `SocketAppender` changes nothing else.
- **Two level checks.** The logger drops messages below its level early and cheaply (before building the record). Each appender also has its own limit. This is a small **Chain of Responsibility**: logger, then appender filters.
- **Threads:** each appender has its own mutex, so a line is written in one piece. The logger does not change after setup, so it needs no lock to read its appenders.
- **AsyncAppender is a Decorator** around any appender. It puts records in a queue, and a worker thread sends them on. Callers do not change.
- **Who owns the loggers?** A `LogManager` keeps them. It can be **passed in** (preferred), or be a Singleton for convenience. Passing a `Logger&` into classes keeps them testable (use a `MemoryAppender` in tests).
- **Build messages lazily:** `log(level, function<string()>)`, or check `isEnabled(level)` first. This avoids building a costly string that will be thrown away.

## Step 4: The code

```cpp run title="Logger, appenders, formatters, async decorator"
#include <atomic>
#include <condition_variable>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <queue>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
using namespace std;

enum class Level { Debug = 0, Info = 1, Warn = 2, Error = 3 };
const char* name(Level l) { static const char* n[] = {"DEBUG", "INFO", "WARN", "ERROR"}; return n[static_cast<int>(l)]; }

struct LogRecord { Level level; string logger; string message; long time; };

// ---------- formatter strategy ----------
struct Formatter { virtual ~Formatter() = default; virtual string format(const LogRecord& r) const = 0; };
struct SimpleFormatter : Formatter { string format(const LogRecord& r) const override { return string("[") + name(r.level) + "] " + r.message; } };
struct DetailedFormatter : Formatter {
    string format(const LogRecord& r) const override { ostringstream o; o << "t=" << r.time << " [" << name(r.level) << "] " << r.logger << ": " << r.message; return o.str(); }
};

// ---------- appender strategy ----------
class Appender {
protected:
    Level min_ = Level::Debug;
    shared_ptr<const Formatter> fmt_;
public:
    explicit Appender(shared_ptr<const Formatter> f) : fmt_(move(f)) {}
    virtual ~Appender() = default;
    void setLevel(Level l) { min_ = l; }
    void append(const LogRecord& r) { if (r.level >= min_) write(fmt_->format(r)); }      // appender-level filter
    virtual void flush() {}
protected:
    virtual void write(const string& line) = 0;
};
class ConsoleAppender : public Appender {
    mutex m_; string prefix_;
public:
    ConsoleAppender(shared_ptr<const Formatter> f, string prefix) : Appender(move(f)), prefix_(move(prefix)) {}
protected:
    void write(const string& line) override { lock_guard l(m_); cout << prefix_ << line << "\n"; }        // one lock: lines never interleave
};
class MemoryAppender : public Appender {                   // for tests: collects lines
    mutable mutex m_; vector<string> lines_;
public:
    using Appender::Appender;
    vector<string> lines() const { lock_guard l(m_); return lines_; }
protected:
    void write(const string& line) override { lock_guard l(m_); lines_.push_back(line); }
};

// ---------- async decorator: same interface, a worker thread behind it ----------
class AsyncAppender : public Appender {
    shared_ptr<Appender> inner_;
    queue<LogRecord> q_; mutex m_; condition_variable cv_; bool stop_ = false; thread worker_;
public:
    explicit AsyncAppender(shared_ptr<Appender> inner) : Appender(make_shared<SimpleFormatter>()), inner_(move(inner)), worker_([this] { loop(); }) {}
    void close() { { lock_guard l(m_); stop_ = true; } cv_.notify_all(); if (worker_.joinable()) worker_.join(); }   // drains the queue, then stops
    ~AsyncAppender() override { close(); }
    void submit(const LogRecord& r) { { lock_guard l(m_); q_.push(r); } cv_.notify_one(); }
protected:
    void write(const string&) override {}                  // not used: the async path forwards records, see Logger
private:
    void loop() {
        for (;;) {
            unique_lock l(m_);
            cv_.wait(l, [this] { return stop_ || !q_.empty(); });
            if (stop_ && q_.empty()) return;
            LogRecord r = move(q_.front()); q_.pop();
            l.unlock();
            inner_->append(r);
        }
    }
};

// ---------- the logger ----------
class Logger {
    string name_;
    Level min_;
    vector<shared_ptr<Appender>> appenders_;
    vector<shared_ptr<AsyncAppender>> asyncs_;
    atomic<long>* clock_;
public:
    Logger(string n, Level l, atomic<long>* clock) : name_(move(n)), min_(l), clock_(clock) {}
    void addAppender(shared_ptr<Appender> a) { appenders_.push_back(move(a)); }
    void addAsync(shared_ptr<AsyncAppender> a) { asyncs_.push_back(move(a)); }
    bool enabled(Level l) const { return l >= min_; }
    void log(Level l, const string& msg) {
        if (!enabled(l)) return;                           // cheap early exit
        LogRecord r{l, name_, msg, ++*clock_};
        for (auto& a : appenders_) a->append(r);
        for (auto& a : asyncs_) a->submit(r);
    }
    void debug(const string& m) { log(Level::Debug, m); }
    void info(const string& m) { log(Level::Info, m); }
    void warn(const string& m) { log(Level::Warn, m); }
    void error(const string& m) { log(Level::Error, m); }
};

class LogManager {                                         // a registry: inject it, or keep one instance in main
    map<string, shared_ptr<Logger>> loggers_;
    atomic<long> clock_{0};                                // a simple logical clock keeps the demo deterministic
public:
    shared_ptr<Logger> get(const string& name, Level level = Level::Debug) {
        auto& l = loggers_[name];
        if (!l) l = make_shared<Logger>(name, level, &clock_);
        return l;
    }
};

int main() {
    LogManager manager;
    auto log = manager.get("payments");

    auto console = make_shared<ConsoleAppender>(make_shared<SimpleFormatter>(), "  console> ");
    console->setLevel(Level::Info);                        // console: INFO and above
    auto memory = make_shared<MemoryAppender>(make_shared<DetailedFormatter>());       // memory: everything, detailed
    log->addAppender(console);
    log->addAppender(memory);

    log->debug("cache warmed");
    log->info("payment started");
    log->warn("retrying gateway");
    log->error("payment failed");

    cout << "memory appender captured " << memory->lines().size() << " lines:\n";
    for (const auto& l : memory->lines()) cout << "  mem> " << l << "\n";

    cout << "thread-safety: 4 threads x 250 messages into one memory appender\n";
    auto busy = manager.get("busy");
    auto sink = make_shared<MemoryAppender>(make_shared<SimpleFormatter>());
    busy->addAppender(sink);
    vector<thread> ts;
    for (int t = 0; t < 4; ++t) ts.emplace_back([&] { for (int i = 0; i < 250; ++i) busy->info("hello"); });
    for (auto& t : ts) t.join();
    cout << "  lines recorded: " << sink->lines().size() << " (expected 1000)\n";

    cout << "async appender: callers return immediately, a worker writes\n";
    {
        auto asyncLog = manager.get("async");
        auto asyncSink = make_shared<MemoryAppender>(make_shared<SimpleFormatter>());
        auto async = make_shared<AsyncAppender>(asyncSink);
        asyncLog->addAsync(async);
        for (int i = 0; i < 5; ++i) asyncLog->info("queued message " + to_string(i));
        async->close();                                    // shutdown: drain the queue, then stop the worker
        cout << "  lines delivered after shutdown: " << asyncSink->lines().size() << " (expected 5)\n";
    }
}
```

## Edge cases

| Case | What happens |
|---|---|
| The message is below the level | dropped at the logger (cheap) |
| Building the message is costly | check `enabled(level)` first, or pass a lambda |
| An appender fails (disk full) | catch the error inside the logger so the program does not crash. Fall back to the console |
| Shutdown while messages are still queued | `close()` (also called by the destructor) empties the queue, then joins the thread |
| The same logger name is asked twice | the manager gives back the same object |
| Log injection (new lines in a message) | a formatter can escape control characters |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "A file appender with rotation" | `RollingFileAppender`, with the size or time rule as a Strategy |
| "JSON logs" | a `JsonFormatter`, and key-value fields on the record |
| "Logger groups (`com.shop.payments` inside `com.shop`)" | parent pointers and level inheritance |
| "Change the level while running" | make `min_` atomic. Reload from config |
| "A request id on every line" | a thread-local context read by the formatter |
| "Send logs to a server" | a `SocketAppender`, wrapped in the async and retry decorators |
| "Avoid a global" | pass `LogManager` to the components. A Singleton only at the very top |

## Short answer to say in an interview

:::interview How would you design a logging framework?
"I separate three things: the logger decides which messages to accept by level, the appender decides where to write, and the formatter decides how the line looks. Appenders and formatters are strategies. Each appender has its own lock so lines are not mixed. For speed, an async appender is a decorator that queues records and writes them on a worker thread, and it empties its queue on close. The logger manager is passed in so tests can use a memory appender."
:::

```quiz
? Why check the level in both the logger and the appender?
- It is a bug
+ The logger drops useless messages cheaply, and each appender can have a stricter limit
- To double the output
> Two small filters give control for each destination, with an early exit.
? Why is AsyncAppender a Decorator?
- It decorates strings
+ It has the same interface as a normal appender, but sends the work to another thread, so callers do not change
- It changes the level
> Same interface, extra behaviour.
```

:::keypoints
- Logger (levels), Appender (where), Formatter (how). The first two are Strategies. Async is a Decorator over an appender.
- Each appender has its own lock so lines stay whole. Empty the queue on shutdown. Pass in the manager, or keep one in `main`.
- Check the level early, build messages lazily, and handle errors safely inside the logging path.
:::
