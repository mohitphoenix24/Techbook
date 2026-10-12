---
title: Design a Logging Framework
level: intermediate
time: 50
summary: A Log4j-style logging library — log levels and filtering, multiple appenders (console, file, memory) with their own levels, pluggable formatters (plain text, JSON), a thread-safe logger, and an asynchronous appender that moves I/O off the caller's thread with a bounded queue — combining Strategy, Observer/Chain of Responsibility, Decorator and Singleton, in C++ and JavaScript.
---

:::problem Design a Logging Framework {level=medium tags="LLD,Chain of Responsibility,Decorator,concurrency"}
Design a logging library like Log4j or Python's `logging`: applications call `logger.info("…")`; messages below a configured level are dropped; messages are written to several destinations (console, file, a remote collector) in configurable formats; logging must be thread-safe and must not slow the application down.

:::hint Hint
Separate the three things that vary independently: WHERE a message goes (appenders), HOW it looks (formatters), and WHICH messages pass (levels/filters). Then wrap a slow appender in an asynchronous one that hands records to a background thread.
:::
:::

## Requirements

- Levels **DEBUG < INFO < WARN < ERROR < FATAL**; a logger has a minimum level, and each **appender** can have its own (e.g. console shows INFO+, a file keeps DEBUG+, the pager gets only ERROR+).
- **Appenders**: console, file, in-memory (for tests), remote (HTTP/Kafka) as extensions.
- **Formatters**: plain text and JSON, configurable per appender.
- Structured context (`requestId`, `userId`) attached to records.
- **Thread-safe**; logging must not block request threads on slow I/O.

## Design

```viz algo=uml title="Logging framework classes"
class LogManager
  + getLogger(name): Logger  «singleton registry»
class Logger
  - name: string
  - minLevel: Level
  - appenders: Appender[]
  + log(level, msg, ctx)
  + debug(msg) / info(msg) / warn(msg) / error(msg)
class LogRecord
  - time
  - level
  - logger
  - message
  - context
interface Appender
  + append(r: LogRecord)
class ConsoleAppender
class MemoryAppender
class AsyncAppender
  - inner: Appender
  - queue: BoundedQueue
interface Formatter
  + format(r: LogRecord): string
class PlainFormatter
class JsonFormatter
LogManager o-- Logger : named loggers
Logger o-- Appender : 1..*
Logger ..> LogRecord : creates
ConsoleAppender ..|> Appender
MemoryAppender ..|> Appender
AsyncAppender ..|> Appender
AsyncAppender o-- Appender : wraps
ConsoleAppender --> Formatter
PlainFormatter ..|> Formatter
JsonFormatter ..|> Formatter
```

The patterns, each earning its place:

| Concern | Pattern |
|---|---|
| where records go (several destinations) | **Observer** (each appender receives every record), filtered per appender by level; a classic variant chains handlers by level (**Chain of Responsibility**) |
| how a record is rendered | **Strategy** (`Formatter`) |
| making any appender asynchronous | **Decorator** (`AsyncAppender` wraps another appender, same interface) |
| one registry of named loggers | **Singleton** (`LogManager`), or better, created once and injected |
| creating appenders from config | **Factory** |

The cheapest log statement is one that's filtered out early: the level check happens **before** formatting, and string building is avoided for disabled levels (C++ macros or lazy suppliers; JS `logger.debug(() => expensive())`).

## Implementation

:::tabs Logger with levels, appenders, formatters and an async appender
```cpp run
#include <bits/stdc++.h>
using namespace std;

enum class Level { DEBUG, INFO, WARN, ERROR, FATAL };
const char* name(Level l) { return array<const char*, 5>{"DEBUG", "INFO", "WARN", "ERROR", "FATAL"}[(int)l]; }

struct LogRecord { long seq; Level level; string logger, message; map<string, string> ctx; };

struct Formatter { virtual ~Formatter() = default; virtual string format(const LogRecord&) const = 0; };
struct PlainFormatter : Formatter {
    string format(const LogRecord& r) const override {
        string s = "#" + to_string(r.seq) + " " + name(r.level) + " [" + r.logger + "] " + r.message;
        for (auto& [k, v] : r.ctx) s += " " + k + "=" + v;
        return s;
    }
};
struct JsonFormatter : Formatter {
    string format(const LogRecord& r) const override {
        string s = "{\"seq\":" + to_string(r.seq) + ",\"level\":\"" + name(r.level) + "\",\"logger\":\"" + r.logger + "\",\"msg\":\"" + r.message + "\"";
        for (auto& [k, v] : r.ctx) s += ",\"" + k + "\":\"" + v + "\"";
        return s + "}";
    }
};

struct Appender {
    Level minLevel = Level::DEBUG;
    virtual ~Appender() = default;
    void append(const LogRecord& r) { if (r.level >= minLevel) write(r); }   // per-appender filter
protected:
    virtual void write(const LogRecord& r) = 0;
};
class ConsoleAppender : public Appender {
    unique_ptr<Formatter> fmt_; mutex m_;
public:
    explicit ConsoleAppender(unique_ptr<Formatter> f, Level min = Level::DEBUG) : fmt_(std::move(f)) { minLevel = min; }
protected:
    void write(const LogRecord& r) override { lock_guard lock(m_); cout << "  console| " << fmt_->format(r) << "\n"; }
};
class MemoryAppender : public Appender {                // for tests: inspect what was logged
    mutex m_;
public:
    vector<string> lines;
    explicit MemoryAppender(Level min) { minLevel = min; }
protected:
    void write(const LogRecord& r) override { lock_guard lock(m_); lines.push_back(string(name(r.level)) + ": " + r.message); }
};

// Decorator: same interface, hands records to a background thread through a bounded queue
class AsyncAppender : public Appender {
    Appender& inner_;
    deque<LogRecord> q_; size_t capacity_;
    mutex m_; condition_variable cv_;
    bool stop_ = false;
    atomic<long> dropped_{0};
    thread worker_;
public:
    AsyncAppender(Appender& inner, size_t capacity) : inner_(inner), capacity_(capacity), worker_([this] { run(); }) {}
    ~AsyncAppender() { { lock_guard l(m_); stop_ = true; } cv_.notify_one(); worker_.join(); }   // flush on shutdown
    long dropped() const { return dropped_; }
protected:
    void write(const LogRecord& r) override {
        lock_guard lock(m_);
        if (q_.size() >= capacity_ && r.level < Level::ERROR) { dropped_++; return; }   // never block the caller; keep errors
        q_.push_back(r);
        cv_.notify_one();
    }
private:
    void run() {
        unique_lock lock(m_);
        for (;;) {
            cv_.wait(lock, [this] { return stop_ || !q_.empty(); });
            if (q_.empty() && stop_) return;
            LogRecord r = std::move(q_.front()); q_.pop_front();
            lock.unlock();
            inner_.append(r);                               // slow I/O happens here, off the caller's thread
            lock.lock();
        }
    }
};

class Logger {
    string name_; Level min_;
    vector<Appender*> appenders_;
    static inline atomic<long> seq_{0};
public:
    Logger(string name, Level min) : name_(std::move(name)), min_(min) {}
    void addAppender(Appender& a) { appenders_.push_back(&a); }
    void log(Level l, const string& msg, map<string, string> ctx = {}) {
        if (l < min_) return;                                // cheapest possible exit
        LogRecord r{++seq_, l, name_, msg, std::move(ctx)};
        for (auto* a : appenders_) a->append(r);
    }
    void debug(const string& m, map<string, string> c = {}) { log(Level::DEBUG, m, std::move(c)); }
    void info(const string& m, map<string, string> c = {}) { log(Level::INFO, m, std::move(c)); }
    void warn(const string& m, map<string, string> c = {}) { log(Level::WARN, m, std::move(c)); }
    void error(const string& m, map<string, string> c = {}) { log(Level::ERROR, m, std::move(c)); }
};

int main() {
    ConsoleAppender console(make_unique<PlainFormatter>(), Level::INFO);   // humans: INFO and up
    ConsoleAppender json(make_unique<JsonFormatter>(), Level::ERROR);      // the "pager" feed: errors only, as JSON
    MemoryAppender audit(Level::DEBUG);                                     // tests/debugging: everything
    Logger log("checkout", Level::DEBUG);
    log.addAppender(console); log.addAppender(json); log.addAppender(audit);

    log.debug("cart loaded", {{"items", "3"}});
    log.info("payment started", {{"orderId", "o-77"}});
    log.warn("payment slow", {{"ms", "2400"}});
    log.error("payment failed", {{"orderId", "o-77"}, {"code", "DECLINED"}});
    cout << "memory appender captured " << audit.lines.size() << " records, first: " << audit.lines[0] << "\n";

    // Async: 8 threads log 200 records each through a queue of 50; INFO may be dropped, ERROR never
    MemoryAppender sink(Level::DEBUG);
    long dropped = 0;
    {
        AsyncAppender async(sink, 50);
        Logger hot("api", Level::INFO);
        hot.addAppender(async);
        vector<thread> ts;
        for (int t = 0; t < 8; t++) ts.emplace_back([&, t] {
            for (int i = 0; i < 200; i++) (i % 50 == 0) ? hot.error("boom " + to_string(t)) : hot.info("req " + to_string(i));
        });
        for (auto& t : ts) t.join();
        dropped = async.dropped();
    }                                                         // destructor flushes the queue
    long errors = count_if(sink.lines.begin(), sink.lines.end(), [](auto& l) { return l.rfind("ERROR", 0) == 0; });
    cout << "async: written " << sink.lines.size() << " + dropped " << dropped << " = 1600, errors kept: " << errors << "/32\n";
}
```
```js run
const Level = Object.freeze({ DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, FATAL: 50 });
const levelName = (n) => Object.keys(Level).find((k) => Level[k] === n);

// Formatters (Strategy)
const plainFormatter = (r) => `#${r.seq} ${levelName(r.level)} [${r.logger}] ${r.message}` + Object.entries(r.ctx).map(([k, v]) => ` ${k}=${v}`).join("");
const jsonFormatter = (r) => JSON.stringify({ seq: r.seq, level: levelName(r.level), logger: r.logger, msg: r.message, ...r.ctx });

// Appenders: append(record) with their own minimum level
class Appender {
  constructor(minLevel = Level.DEBUG) { this.minLevel = minLevel; }
  append(r) { if (r.level >= this.minLevel) this.write(r); }
}
class ConsoleAppender extends Appender {
  constructor(formatter, minLevel) { super(minLevel); this.formatter = formatter; }
  write(r) { console.log("  console| " + this.formatter(r)); }
}
class MemoryAppender extends Appender { lines = []; write(r) { this.lines.push(`${levelName(r.level)}: ${r.message}`); } }

// Decorator: buffers records and writes them in batches later, so slow I/O never blocks the caller
class AsyncAppender extends Appender {
  #queue = []; #scheduled = false;
  constructor(inner, capacity) { super(Level.DEBUG); this.inner = inner; this.capacity = capacity; this.dropped = 0; }
  write(r) {
    if (this.#queue.length >= this.capacity && r.level < Level.ERROR) { this.dropped++; return; }   // keep errors
    this.#queue.push(r);
    if (!this.#scheduled) { this.#scheduled = true; setTimeout(() => this.flush(), 0); }
  }
  flush() { const batch = this.#queue.splice(0); this.#scheduled = false; for (const r of batch) this.inner.append(r); }
}

let seq = 0;
class Logger {
  #appenders = [];
  constructor(name, minLevel) { this.name = name; this.minLevel = minLevel; }
  addAppender(a) { this.#appenders.push(a); return this; }
  log(level, message, ctx = {}) {
    if (level < this.minLevel) return;                          // cheapest possible exit
    if (typeof message === "function") message = message();     // lazy messages: only built if enabled
    const r = { seq: ++seq, level, logger: this.name, message, ctx };
    for (const a of this.#appenders) a.append(r);
  }
  debug(m, c) { this.log(Level.DEBUG, m, c); } info(m, c) { this.log(Level.INFO, m, c); }
  warn(m, c) { this.log(Level.WARN, m, c); } error(m, c) { this.log(Level.ERROR, m, c); }
}

// A registry of named loggers (the "LogManager"): one instance, created at startup
const LogManager = { loggers: new Map(), get(name, level = Level.DEBUG) { if (!this.loggers.has(name)) this.loggers.set(name, new Logger(name, level)); return this.loggers.get(name); } };

const audit = new MemoryAppender(Level.DEBUG);
const log = LogManager.get("checkout")
  .addAppender(new ConsoleAppender(plainFormatter, Level.INFO))
  .addAppender(new ConsoleAppender(jsonFormatter, Level.ERROR))
  .addAppender(audit);

log.debug("cart loaded", { items: 3 });
log.info("payment started", { orderId: "o-77" });
log.warn("payment slow", { ms: 2400 });
log.error("payment failed", { orderId: "o-77", code: "DECLINED" });
console.log(`memory appender captured ${audit.lines.length} records, first: ${audit.lines[0]}`);
console.log("same logger from the registry:", LogManager.get("checkout") === log);

let built = 0;
LogManager.get("quiet", Level.WARN).debug(() => { built++; return "expensive dump"; });
console.log("lazy message built for a disabled level?", built > 0);

const sink = new MemoryAppender();
const asyncAppender = new AsyncAppender(sink, 50);
const hot = new Logger("api", Level.INFO).addAppender(asyncAppender);
for (let i = 0; i < 400; i++) (i % 50 === 0 ? hot.error(`boom ${i}`) : hot.info(`req ${i}`));
console.log("written synchronously so far:", sink.lines.length, "(the caller never waited on I/O)");
await new Promise((r) => setTimeout(r, 0));
console.log(`after flush: written ${sink.lines.length} + dropped ${asyncAppender.dropped} = 400, errors kept: ${sink.lines.filter((l) => l.startsWith("ERROR")).length}/8`);
```
:::

## Design discussion

- **Per-appender levels** let one log call feed a quiet console, a verbose file and an errors-only alert channel.
- **Async appender = Decorator**: callers enqueue a record (microseconds) and return; a background thread does the slow I/O. The queue is **bounded**; when full, the policy is a choice: **block** (never lose logs, but slow callers), **drop** low-priority records (shown; count them in a metric), or drop oldest. Errors are never dropped here.
- **Flush on shutdown** (the destructor joins the worker after draining) so the last records, often the most important ones, aren't lost on exit.
- **Thread safety**: appenders that write shared resources lock (console, files); the async appender's queue is the only shared structure on the hot path.
- **Structured logging** (key–value context, JSON output) is what log pipelines (Elasticsearch, Loki, Datadog) need; the observability lesson explains why.

| Extension | How |
|---|---|
| File rotation by size/date | a `RollingFileAppender` that switches files; old files compressed |
| Remote shipping (Kafka/HTTP) | a remote appender, always wrapped in `AsyncAppender`, with batching and retries |
| Logger hierarchy (`com.shop` → `com.shop.checkout`) | loggers inherit level and appenders from their parent in `LogManager` |
| Sampling noisy logs | a filter (or decorator) that passes 1 in N DEBUG records |
| Request context everywhere | thread-local (C++) / AsyncLocalStorage (Node) context merged into every record |
| Config from a file | a factory builds appenders/formatters from YAML/JSON at startup |

```quiz
? Why should the level check happen before the message is formatted?
+ Most debug-level calls are disabled in production; skipping formatting and string building for them saves real CPU
- Formatting changes the level
- Levels are stored inside the formatted string
> The cheapest log call is the one that returns immediately.

? What does wrapping a file appender in an AsyncAppender give you?
+ Callers only enqueue the record and return; a background thread performs the slow I/O
- Logs are written twice
- Guaranteed delivery with no possibility of loss
> It's a Decorator that moves I/O off the request path. A bounded queue then needs a full-queue policy.

? Which pattern lets one log record be sent to several destinations with different levels and formats?
+ Observer-style appenders (each with its own level filter and formatter strategy)
- Singleton
- Prototype
> The logger notifies all its appenders; each decides whether and how to write.
```

:::keypoints
- Three independent axes: **appenders** (where), **formatters** (how, Strategy), **levels/filters** (which).
- Filter early (logger level, then per-appender level); build messages lazily for disabled levels.
- **AsyncAppender** (Decorator + bounded queue + background thread) keeps I/O off request threads; choose a full-queue policy and **flush on shutdown**.
- A **LogManager** registry of named loggers; prefer creating it once and injecting it.
- Production extras: structured context, rotation, remote shipping, hierarchy, sampling.
:::
