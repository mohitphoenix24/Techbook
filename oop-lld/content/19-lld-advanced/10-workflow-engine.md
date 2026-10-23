---
title: Design a Workflow Engine (DAG executor)
level: advanced
time: 75
summary: Tasks with dependencies forming a DAG, validation and cycle detection, topological scheduling with parallel execution of independent tasks, failure policies (stop, continue, retry), task states and results passing between tasks, and how this relates to build systems and Airflow.
---

:::problem Design a Workflow Engine {level=hard tags="DAG,topological sort,concurrency,thread pool,Command,State"}
Design an engine that runs a workflow made of tasks with dependencies (a directed acyclic graph). For example: `fetch → (clean, validate) → merge → report`. Tasks whose dependencies have all finished may run **in parallel**. Handle failures (retry, stop the workflow, or continue with unaffected branches), track the state of each task, allow tasks to pass results to dependents, and report the final outcome.
:::

:::hint Hint
Compute for each task the number of **unfinished dependencies** (its in-degree). Tasks with zero are **ready** and go to a worker pool. When a task finishes, decrement the counters of its **dependents**; those reaching zero become ready. That is Kahn's algorithm executed concurrently. Validate the graph first (no cycles, no missing dependencies).
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Model? | a workflow is a set of named tasks; each lists the tasks it depends on |
| Task? | a function taking its dependencies' results and returning a result (string here) or failing |
| Validation? | unknown dependency, duplicate name, **cycle** → rejected before running |
| Execution? | parallel across ready tasks on a worker pool; a task runs at most once per workflow run |
| Failure policy? | per workflow: `FailFast` (stop scheduling new tasks), `ContinueIndependent` (skip only the failed task's descendants); per task: retries |
| States? | Pending → Ready → Running → Succeeded / Failed / Skipped (upstream failed) / Cancelled |
| Results? | a task receives a map `dependencyName → result` |
| Observability? | events per state change; final report |
| Out of scope | persistence of runs, distributed workers, dynamic task generation (mention) |

## Step 2: how execution works

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

## Step 3: entities

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

## Step 4: design decisions

- **Definition vs run**: `Workflow` (static graph of `TaskDef`) is separate from a **run** (the `TaskRun` states for one execution). The same workflow can run many times, even concurrently.
- **Validation before running**: names unique, dependencies exist, no cycle (DFS with colours or Kahn: if the topological sort visits fewer nodes than exist, there is a cycle; report the cycle members).
- **Executor** uses the in-degree counters under one mutex: `markDone(task)` decrements dependents; newly ready tasks are submitted to the pool. A **condition variable** (or counting of outstanding tasks) signals completion.
- **Skip propagation**: when a task fails permanently, mark all its **descendants** `Skipped` (transitively), so the run still terminates and reports precisely what did not run.
- **Failure policy** as a Strategy: `FailFast` also cancels all not-yet-started tasks; `ContinueIndependent` lets unaffected branches finish.
- **Retries** inside the task runner (with backoff in production). A task is an idempotent unit.
- **Results**: each task's result is stored in its `TaskRun`; when a task starts it gets the map of its dependencies' results.
- **Command-like tasks**: `TaskDef.action` is a callable; you could subclass for rich tasks (shell, HTTP, SQL) through an interface.
- **Events** via listener (Observer) for UI, logs and metrics.

## Step 5: the code

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

## Design notes

| Topic | Note |
|---|---|
| **Complexity** | O(V + E) to validate and to schedule; each edge decrements one counter |
| **Why counters, not repeated scans** | each completion touches only its dependents |
| **Deadlock risk** | none from the DAG itself; do not let tasks wait on other tasks inside the pool (starvation) |
| **Locks** | one mutex guards the run state; actions run outside it |
| **Determinism** | order among simultaneously ready tasks is unspecified; results must not depend on it |
| **Skipped vs cancelled** | `Skipped` = never ran because a dependency failed; `Cancelled` = stopped by the user or fail-fast |
| **Same engine, different domains** | build systems (make, Bazel), CI pipelines, data pipelines (Airflow), job orchestration |

## Edge cases

| Case | Handling |
|---|---|
| Empty workflow | succeeds immediately |
| A task depends on itself | a one-node cycle: rejected by validation |
| Diamond dependencies | the join task has a counter of 2 and starts once |
| Task throws a non-std exception | catch-all in the runner |
| Timeout on a task | a deadline per attempt (async + `wait_for`, or cooperative cancellation) |
| Very large graphs | avoid the O(V·E) dependents scan used in `validate` by building the reverse adjacency once (as `run` does) |
| Retries with side effects | tasks should be idempotent; use attempt ids as idempotency keys |
| Run history | persist `Report` per run id |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Conditional branches / if-else tasks" | a task returns a decision; edges carry conditions; unselected branches become `Skipped` |
| "Dynamic fan-out (one task per input item)" | a task can add tasks to the running graph (under the lock) |
| "Resume after a crash" | persist task states and results; on restart skip `Succeeded` tasks |
| "Priorities and resource limits (max 2 GPU tasks)" | per-resource semaphores; a priority queue instead of FIFO |
| "Scheduling workflows (daily at 2am)" | the cron scheduler from the previous lesson triggers `run` |
| "Distributed workers" | the pool becomes a queue; workers pull tasks; the state lives in a database |
| "Visualise progress" | listener events drive a live DAG view |
| "Workflow versioning and parameters" | definitions are data (JSON/YAML) loaded by a `WorkflowBuilder` |
| "Sub-workflows" | Composite: a task whose action runs another workflow |

```quiz
? How does the engine know when a task is ready?
- It polls every task repeatedly
+ Each task has a counter of unfinished dependencies; when the last dependency finishes, the counter hits zero
- By sorting names
> Counters make scheduling O(edges), driven by completions.
? What happens to descendants of a permanently failed task?
- They run anyway with empty inputs
+ They are marked Skipped, since they can never receive their input, and the run still terminates
- They are retried forever
> Skip propagation guarantees the run finishes and reports exactly what did not run.
```

:::keypoints
- Validate (unknown deps, cycles via Kahn), then execute with in-degree counters: ready tasks go to a worker pool, completions release dependents.
- Failure policies as strategies (fail fast vs continue independent); descendants of failures are skipped; per-task retries.
- Results flow along edges; events for observability. The same core powers build systems, CI and data pipelines.
:::
