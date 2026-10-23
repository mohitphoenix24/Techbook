---
title: Design a Logging Framework
level: easy
time: 45
summary: Levels, appenders (console, file, memory), formatters, per-appender filters, a logger hierarchy configured once, thread-safe output, and an asynchronous option behind the same interface, with the patterns it uses (Strategy, Chain of Responsibility, Singleton alternative, Decorator).
---

:::problem Design a Logging Framework {level=easy tags="Chain of Responsibility,Strategy,concurrency,infrastructure"}
Design a logging library like log4j or spdlog. Applications log messages at levels (DEBUG, INFO, WARN, ERROR). The framework sends messages to one or more destinations (console, file, memory), each with its own minimum level and format. It must be thread-safe and easy to extend with new destinations and formats.

:::hint Hint
Three things vary: **where** to write (appender), **how** to format (formatter), and **which messages** to accept (level filter). Make each its own abstraction; the logger just fans out. Think about who creates the logger instance and how it is shared.
:::
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Levels? | DEBUG < INFO < WARN < ERROR |
| Destinations? | console, file, in-memory (for tests); add more later |
| Per-destination level? | yes: console shows INFO and above, the "file" gets everything |
| Format? | a pattern: `[LEVEL] message` or with a timestamp; changeable per appender |
| Thread-safety? | many threads log at once; lines must not interleave |
| Performance? | an async mode must be possible without changing callers |
| Configuration? | built once at start-up; a logger obtained by name |
| Out of scope | log rotation, remote shipping (mention) |

## Step 2: entities

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

## Step 3: design decisions

- **Appender** and **Formatter** are Strategies; the appender holds a formatter. Adding a `JsonFormatter` or a `SocketAppender` touches nothing else.
- **Level filtering twice**: the logger drops messages below its level cheaply (before building a record); each appender has its own threshold. That is a small **Chain of Responsibility**: logger → appender filters.
- **Thread-safety**: each appender owns a mutex so a line is written atomically. The logger is immutable after configuration (no lock needed to read its appender list).
- **AsyncAppender is a Decorator** around any appender: it queues records and a worker thread forwards them, using the blocking-queue ideas. Callers do not change.
- **Who owns the loggers?** A `LogManager` registry, which can be **injected** (preferred) or exposed as a Singleton for convenience. Passing a `Logger&` to classes keeps them testable (inject a `MemoryAppender`).
- **Lazy message building**: `log(level, const function<string()>&)` or checking `isEnabled(level)` avoids building expensive strings that will be dropped.

## Step 4: the code

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

| Case | Handling |
|---|---|
| Message below the level | dropped at the logger (cheap) |
| Expensive message construction | check `enabled(level)` first, or pass a lambda |
| Appender throws (disk full) | catch inside the logger so the application does not crash; fall back to console |
| Shutdown with queued async messages | `close()` (also called by the destructor) drains the queue, then joins |
| Same logger name requested twice | the manager returns the same instance |
| Log injection (newlines in messages) | a formatter may escape control characters |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "File appender with rotation" | `RollingFileAppender` (size/time policy as a Strategy) |
| "Structured JSON logs" | `JsonFormatter`, key-value fields on the record |
| "Logger hierarchy (`com.shop.payments` inherits from `com.shop`)" | parent pointers and level inheritance |
| "Change the level at run time" | make `min_` atomic; expose via config reload |
| "Context (request id) on every line" | a thread-local context (MDC) read by the formatter |
| "Ship logs to a server" | a `SocketAppender`, wrapped by the async decorator and a retry decorator |
| "Avoid a global" | `LogManager` is passed to components, or a Singleton for the very top level only |

```quiz
? Why have a level check in both the logger and the appender?
- It is a bug
+ The logger drops useless messages cheaply, while each appender can have its own stricter threshold
- To double the output
> Two filters (a small chain) give per-destination control with an early exit.
? Why is AsyncAppender a Decorator?
- It decorates strings
+ It has the same interface as a normal appender but forwards on another thread, so callers do not change
- It changes the level
> Same interface, added behaviour.
```

:::keypoints
- Logger (levels, fan-out), Appender (where), Formatter (how): Strategies. Async is a Decorator over an appender.
- Per-appender locks keep lines whole; drain the queue on shutdown. Inject the manager or keep one in `main`.
- Early exit on level, lazy message building, safe error handling inside the logging path.
:::
