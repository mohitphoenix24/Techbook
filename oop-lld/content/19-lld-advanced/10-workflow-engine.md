---
title: Design a Workflow Engine (DAG executor)
level: advanced
time: 75
summary: Run tasks that depend on each other. Learn how to check the graph, how to run independent tasks at the same time, what to do when a task fails (stop, continue, retry), how to track task states and pass results along, and how this is the same idea as build tools and Airflow.
---

:::problem Design a Workflow Engine {level=hard tags="DAG,topological sort,concurrency,thread pool,Command,State"}
Design an engine that runs a workflow made of tasks with dependencies (a directed graph with no loops, a DAG). For example: `fetch → (clean, validate) → merge → report`. Tasks whose dependencies have all finished may run **at the same time**. Handle failures (retry, stop the whole workflow, or go on with the branches that are not affected), track the state of each task, let tasks pass results to the tasks that depend on them, and report the final result.
:::

:::hint Hint
For each task, count the number of **dependencies that are not finished yet**. Tasks with zero are **ready**, and go to a worker pool. When a task finishes, reduce the counters of the tasks that **depend on it**. The ones that reach zero become ready. This is Kahn's algorithm run at the same time on many threads. Check the graph first (no loops, no missing dependencies).
:::

## First, an everyday picture

Think of cooking a meal. You cannot make the sauce before you chop the onions. But chopping onions and boiling water can happen **at the same time**. A workflow engine is the cook that knows this: it starts every task as soon as everything that task needs is ready.

## Step 1: Ask questions (requirements)

| Question | Our assumption |
|---|---|
| The model? | a workflow is a set of named tasks. Each lists the tasks it depends on |
| A task? | a function that takes the results of its dependencies and returns a result (a string here), or fails |
| Checks? | an unknown dependency, a repeated name, or a **loop** is refused before running |
| Running? | ready tasks run at the same time on a worker pool. A task runs at most once in a run |
| If a task fails? | rule for the workflow: `FailFast` (stop starting new tasks) or `ContinueIndependent` (skip only the tasks that depend on the failed one). A task can also have retries |
| States? | Pending, Ready, Running, then Succeeded, Failed, Skipped (a task before it failed) or Cancelled |
| Results? | a task gets a map `dependencyName → result` |
| Watching? | events for each state change, and a final report |
| Not needed | saving runs, workers on other machines, tasks made while running (we mention it) |

## Step 2: How running works

```text
          ┌── clean ──┐
fetch ───►│           ├──► merge ──► report
          └─ validate ┘

pending count:  fetch 0 · clean 1 · validate 1 · merge 2 · report 1
ready queue:    [fetch]
 fetch done  → clean 0, validate 0 → both ready (run in PARALLEL)
 clean done  → merge 1
 validate done → merge 0 → ready
 merge done  → report 0 → ready ... report done → workflow succeeded
 if validate FAILS (ContinueIndependent): merge and report are SKIPPED (descendants); clean still finishes.
```

## Step 3: Find the classes

```viz algo=uml title="Workflow engine"
class WorkflowEngine
  + validate(w: Workflow): Result
  + run(w: Workflow, policy: FailurePolicy): RunReport
class Workflow
  - tasks: map<string, TaskDef>
  + add(def: TaskDef): void
  + topologicalOrder(): string[]
  + hasCycle(): bool
class TaskDef
  - name: string
  - deps: string[]
  - action: function
  - retries: int
enum TaskState
class TaskRun
  - state: TaskState
  - result: string
  - attempts: int
interface FailurePolicy
  + onFailure(task: string): Decision
class FailFast
class ContinueIndependent
class ThreadPool
interface RunListener
  + onState(task: string, s: TaskState): void
WorkflowEngine --> Workflow
WorkflowEngine --> ThreadPool
WorkflowEngine --> FailurePolicy
WorkflowEngine o-- RunListener
Workflow *-- TaskDef
WorkflowEngine *-- TaskRun
FailFast ..|> FailurePolicy
ContinueIndependent ..|> FailurePolicy
```

## Step 4: Design decisions

- **Definition and run are separate.** `Workflow` (the fixed graph of `TaskDef`) is different from a **run** (the `TaskRun` states for one execution). The same workflow can run many times, even together.
- **Check before running:** names are unique, dependencies exist, and there is no loop (a DFS with colours, or Kahn: if the topological sort reaches fewer nodes than there are, there is a loop. Report the members of the loop).
- **The executor** uses the counters under one mutex. `markDone(task)` reduces the counters of the dependents. Newly ready tasks go to the pool. A **condition variable** (or counting the tasks still out) says when it is all finished.
- **Skipping:** when a task fails for good, mark all the tasks that depend on it (directly or not) as `Skipped`. So the run still ends, and tells exactly what did not run.
- **Failure rule is a Strategy:** `FailFast` also cancels all tasks that have not started. `ContinueIndependent` lets the unaffected branches finish.
- **Retries** are inside the task runner (with waiting time in real use). A task should be safe to repeat.
- **Results:** each task's result is stored in its `TaskRun`. When a task starts, it gets the map of the results of its dependencies.
- **Tasks like Commands:** `TaskDef.action` is something you can call. You could make subclasses for richer tasks (shell, HTTP, SQL) through an interface.
- **Events** go to a listener (Observer) for screens, logs and numbers.

## Step 5: The code

```cpp run title="DAG validation, parallel execution, retries, failure policies"
#include <atomic>
#include <condition_variable>
#include <functional>
#include <iostream>
#include <map>
#include <mutex>
#include <queue>
#include <set>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
using namespace std;

using Results = map<string, string>;                         // dependency name -> its result
struct TaskDef { string name; vector<string> deps; function<string(const Results&, int attempt)> action; int retries = 0; };   // the action throws on failure

enum class TaskState { Pending, Running, Succeeded, Failed, Skipped };
const char* name(TaskState s) { static const char* n[] = {"pending", "running", "succeeded", "failed", "skipped"}; return n[static_cast<int>(s)]; }

class Workflow {
    map<string, TaskDef> tasks_;
public:
    Workflow& add(TaskDef t) { if (tasks_.count(t.name)) throw invalid_argument("duplicate task " + t.name); tasks_[t.name] = move(t); return *this; }
    const map<string, TaskDef>& tasks() const { return tasks_; }
    // empty string = valid; otherwise the problem. Kahn's algorithm: if fewer tasks than exist can be ordered, there is a cycle.
    string validate() const {
        map<string, int> indeg; for (auto& [n, t] : tasks_) indeg[n] = 0;
        for (auto& [n, t] : tasks_) for (auto& d : t.deps) { if (!tasks_.count(d)) return "task '" + n + "' depends on unknown task '" + d + "'"; ++indeg[n]; }
        vector<string> ready; for (auto& [n, d] : indeg) if (d == 0) ready.push_back(n);
        size_t visited = 0;
        while (!ready.empty()) {
            string x = ready.back(); ready.pop_back(); ++visited;
            for (auto& [n, t] : tasks_) for (auto& d : t.deps) if (d == x && --indeg[n] == 0) ready.push_back(n);
        }
        if (visited != tasks_.size()) { string cyc; for (auto& [n, d] : indeg) if (d > 0) cyc += n + " "; return "cycle among: " + cyc; }
        return "";
    }
};

enum class Policy { FailFast, ContinueIndependent };

struct RunListener { virtual ~RunListener() = default; virtual void onState(const string& task, TaskState s) = 0; };

struct Report { map<string, TaskState> states; map<string, string> results; map<string, int> attempts; bool success = false; };

class WorkflowEngine {
    // a tiny worker pool
    struct Pool {
        mutex m; condition_variable cv; queue<function<void()>> q; bool stop = false; vector<thread> workers;
        explicit Pool(int n) { for (int i = 0; i < n; ++i) workers.emplace_back([this] { for (;;) { function<void()> job; { unique_lock l(m); cv.wait(l, [&] { return stop || !q.empty(); }); if (stop && q.empty()) return; job = move(q.front()); q.pop(); } job(); } }); }
        void submit(function<void()> f) { { lock_guard l(m); q.push(move(f)); } cv.notify_one(); }
        ~Pool() { { lock_guard l(m); stop = true; } cv.notify_all(); for (auto& w : workers) w.join(); }
    };
public:
    Report run(const Workflow& wf, Policy policy, RunListener* listener, int threads = 3) {
        if (string err = wf.validate(); !err.empty()) throw invalid_argument(err);
        const auto& tasks = wf.tasks();
        Report rep; mutex m; condition_variable done; int outstanding = 0;
        map<string, int> pending; map<string, vector<string>> dependents;
        for (auto& [n, t] : tasks) { rep.states[n] = TaskState::Pending; pending[n] = static_cast<int>(t.deps.size()); for (auto& d : t.deps) dependents[d].push_back(n); }
        bool aborted = false;
        auto setState = [&](const string& n, TaskState s) { rep.states[n] = s; if (listener) listener->onState(n, s); };

        Pool pool(threads);
        function<void(const string&)> submit;
        function<void(const string&)> skipDescendants = [&](const string& failed) {            // caller holds m
            for (auto& d : dependents[failed]) if (rep.states[d] == TaskState::Pending) { setState(d, TaskState::Skipped); skipDescendants(d); }
        };
        submit = [&](const string& n) {                                                          // caller holds m: mark as running and hand to the pool
            ++outstanding; setState(n, TaskState::Running);
            Results inputs; for (auto& d : tasks.at(n).deps) inputs[d] = rep.results[d];
            pool.submit([&, n, inputs] {
                const TaskDef& def = tasks.at(n);
                string result; bool ok = false; int attempt = 0;
                while (attempt <= def.retries && !ok) { ++attempt; try { result = def.action(inputs, attempt); ok = true; } catch (const exception&) {} }
                lock_guard l(m);
                rep.attempts[n] = attempt;
                if (ok) {
                    rep.results[n] = result; setState(n, TaskState::Succeeded);
                    if (!aborted) for (auto& d : dependents[n]) if (--pending[d] == 0 && rep.states[d] == TaskState::Pending) submit(d);     // newly ready tasks start immediately
                } else {
                    setState(n, TaskState::Failed);
                    skipDescendants(n);                                                          // anything that needed this task can never run
                    if (policy == Policy::FailFast) { aborted = true; for (auto& [t, s] : rep.states) if (s == TaskState::Pending) setState(t, TaskState::Skipped); }
                }
                if (--outstanding == 0) done.notify_all();
            });
        };
        {
            unique_lock lock(m);
            for (auto& [n, p] : pending) if (p == 0) submit(n);                                   // roots start first
            done.wait(lock, [&] { return outstanding == 0; });
        }
        rep.success = all_of(rep.states.begin(), rep.states.end(), [](auto& kv) { return kv.second == TaskState::Succeeded; });
        return rep;
    }
};

struct Logger : RunListener {
    mutex m; vector<string> lines;
    void onState(const string& t, TaskState s) override { lock_guard l(m); lines.push_back(t + " " + name(s)); }
};

void printReport(const Report& r) {
    for (auto& [n, s] : r.states) cout << "    " << n << ": " << name(s) << (r.attempts.count(n) && r.attempts.at(n) > 1 ? " (after " + to_string(r.attempts.at(n)) + " attempts)" : "") << (r.results.count(n) ? "  -> " + r.results.at(n) : "") << "\n";
    cout << "    workflow " << (r.success ? "SUCCEEDED" : "did NOT succeed") << "\n";
}

int main() {
    auto pipeline = [](bool validateFails, int validateRetries) {
        Workflow w;
        w.add({"fetch", {}, [](const Results&, int) { return string("raw-data"); }, 0});
        w.add({"clean", {"fetch"}, [](const Results& in, int) { return "clean(" + in.at("fetch") + ")"; }, 0});
        w.add({"validate", {"fetch"}, [=](const Results& in, int attempt) -> string { if (validateFails && attempt <= validateRetries + 1) throw runtime_error("bad schema"); return "valid(" + in.at("fetch") + ")"; }, validateRetries});
        w.add({"merge", {"clean", "validate"}, [](const Results& in, int) { return "merge(" + in.at("clean") + "," + in.at("validate") + ")"; }, 0});
        w.add({"report", {"merge"}, [](const Results& in, int) { return "report[" + in.at("merge") + "]"; }, 0});
        return w;
    };
    WorkflowEngine engine;

    cout << "1) all tasks succeed:\n";
    { Logger lg; auto r = engine.run(pipeline(false, 0), Policy::FailFast, &lg); printReport(r); }

    cout << "2) 'flaky' fails on its first attempt but has retries=2: it succeeds on the second attempt\n";
    { Workflow w2;
      w2.add({"fetch", {}, [](const Results&, int) { return string("raw"); }, 0});
      w2.add({"flaky", {"fetch"}, [](const Results& in, int attempt) -> string { if (attempt == 1) throw runtime_error("temporary"); return "ok(" + in.at("fetch") + ")"; }, 2});
      printReport(engine.run(w2, Policy::FailFast, nullptr)); }

    cout << "3) 'validate' keeps failing, ContinueIndependent: unaffected 'clean' still runs, descendants are skipped\n";
    { auto r = engine.run(pipeline(true, 5), Policy::ContinueIndependent, nullptr); printReport(r); }

    cout << "4) independent branches really run in parallel (each sleeps 50 ms; 4 branches finish in about 50-100 ms, not 200)\n";
    { Workflow w; atomic<int> concurrent{0}, peak{0};
      for (int i = 0; i < 4; ++i) w.add({"branch" + to_string(i), {}, [&](const Results&, int) { int now = ++concurrent; int p = peak.load(); while (now > p && !peak.compare_exchange_weak(p, now)) {} this_thread::sleep_for(chrono::milliseconds(50)); --concurrent; return string("done"); }, 0});
      w.add({"join", {"branch0", "branch1", "branch2", "branch3"}, [](const Results& in, int) { return to_string(in.size()) + " inputs"; }, 0});
      auto r = engine.run(w, Policy::FailFast, nullptr, 4);
      cout << "    join result: " << r.results["join"] << "; more than one task ran at the same time: " << boolalpha << (peak > 1) << "\n"; }

    cout << "5) validation rejects bad graphs before running anything\n";
    { Workflow w; w.add({"a", {"b"}, nullptr, 0}); w.add({"b", {"c"}, nullptr, 0}); w.add({"c", {"a"}, nullptr, 0});
      try { engine.run(w, Policy::FailFast, nullptr); } catch (const exception& e) { cout << "    rejected: " << e.what() << "\n"; }
      Workflow m; m.add({"x", {"ghost"}, nullptr, 0});
      try { engine.run(m, Policy::FailFast, nullptr); } catch (const exception& e) { cout << "    rejected: " << e.what() << "\n"; } }
}
```

## Notes on the design

| Topic | Note |
|---|---|
| **Cost** | O(V + E) to check and to schedule. Each link reduces one counter |
| **Why counters, not scanning again and again** | each finished task touches only the tasks that depend on it |
| **Deadlock risk** | none from the DAG itself. Do not let tasks wait for other tasks inside the pool (starvation) |
| **Locks** | one mutex protects the run state. Actions run outside it |
| **Order** | the order of tasks that are ready at the same time is not fixed. Results must not depend on it |
| **Skipped or cancelled** | `Skipped` = never ran because something it needs failed. `Cancelled` = stopped by the user or by fail-fast |
| **Same engine, many places** | build tools (make, Bazel), CI pipelines, data pipelines (Airflow), job orchestration |

## Edge cases

| Case | What happens |
|---|---|
| An empty workflow | succeeds at once |
| A task depends on itself | a loop of one node, refused by the check |
| Diamond dependencies | the joining task has a counter of 2 and starts once |
| A task throws something that is not a std error | a catch-all in the runner |
| A time limit for a task | a deadline for each try (async and `wait_for`, or polite cancelling) |
| Very big graphs | avoid the O(V·E) scan used in `validate`. Build the reverse links once (as `run` does) |
| Retries with side effects | tasks should be safe to repeat. Use the attempt id as an idempotency key |
| Run history | save the `Report` for each run id |

## What if the interviewer asks for more?

| Follow-up | Our answer |
|---|---|
| "If-else branches" | a task returns a decision. Links carry conditions. Branches not chosen become `Skipped` |
| "One task for each input item (fan-out)" | a task can add tasks to the running graph (under the lock) |
| "Continue after a crash" | save task states and results. On restart, skip tasks that `Succeeded` |
| "Priorities and limits (max 2 GPU tasks)" | a semaphore for each resource. A priority queue instead of a plain queue |
| "Run workflows on a schedule (daily at 2 am)" | the cron scheduler from the earlier lesson calls `run` |
| "Workers on other machines" | the pool becomes a queue. Workers pull tasks. The state lives in a database |
| "Show progress" | listener events feed a live DAG view |
| "Versions and parameters" | definitions are data (JSON or YAML) read by a `WorkflowBuilder` |
| "Sub-workflows" | Composite: a task whose action runs another workflow |

## Short answer to say in an interview

:::interview How does a workflow engine run tasks in the right order, in parallel?
"I first check the graph: names are unique, dependencies exist, and there is no cycle. Then I give each task a counter of unfinished dependencies. Tasks with a counter of zero are ready and go to a worker pool. When a task finishes, I reduce the counters of its dependents, and the ones that reach zero are submitted. This is Kahn's algorithm run concurrently, and it costs O(V plus E). If a task fails for good, I mark all tasks that depend on it as skipped, so the run always ends and reports clearly. The failure rule, like fail-fast, is a strategy."
:::

```quiz
? How does the engine know a task is ready?
- It checks every task again and again
+ Each task has a counter of unfinished dependencies. When the last one finishes, the counter reaches zero
- By sorting names
> Counters make scheduling cost O(links), driven by finished tasks.
? What happens to tasks that depend on a task that failed for good?
- They run anyway with empty inputs
+ They are marked Skipped, because they can never get their input, and the run still ends
- They are retried for ever
> Skipping makes sure the run finishes and tells exactly what did not run.
```

:::keypoints
- Check first (unknown dependencies, loops with Kahn). Then run with counters: ready tasks go to a worker pool, and finished tasks release the ones that depend on them.
- Failure rules are strategies (fail fast or continue the independent ones). Tasks that depend on a failure are skipped. Each task can have retries.
- Results flow along the links. Events help watching. The same core powers build tools, CI and data pipelines.
:::
