SHEETS.define({
  id: "course-schedule",
  viz: "graph",
  io: { fn: "canFinish", params: [["numCourses", "int"], ["prerequisites", "int[][]"]], ret: "bool", labels: { prerequisites: "prerequisites [a, b] = take b before a" } },

  statement: `There are \`numCourses\` courses labelled \`0\` to \`numCourses − 1\`. You are given an array \`prerequisites\` where \`prerequisites[i] = [a, b]\` means you must take course \`b\` **before** course \`a\`.

Return \`true\` if you can finish **all** the courses, otherwise \`false\`.`,
  examples: [
    { input: "numCourses = 2, prerequisites = [[1, 0]]", output: "true", explain: "Take course 0, then course 1." },
    { input: "numCourses = 2, prerequisites = [[1, 0], [0, 1]]", output: "false", explain: "Course 1 needs 0 and course 0 needs 1: a circular dependency, so neither can ever start." },
  ],
  constraints: ["$1 \\le$ `numCourses` $\\le 2000$", "$0 \\le$ `prerequisites.length` $\\le 5000$", "`prerequisites[i].length == 2`, $0 \\le a_i, b_i <$ `numCourses`", "All pairs `[a, b]` are distinct."],
  check(input) {
    if (input.numCourses > 9) return "for the animation use at most 9 courses";
    for (const p of input.prerequisites) if (p.length !== 2 || p[0] < 0 || p[1] < 0 || p[0] >= input.numCourses || p[1] >= input.numCourses) return "each prerequisite must be a pair [a, b] with both numbers between 0 and numCourses − 1";
    return null;
  },

  intuition: {
    find: "A yes/no answer: is there an **order** of all the courses in which every course comes after its prerequisites? In graph terms: is the dependency graph free of **cycles**?",
    beginner: "Repeatedly look for a course whose prerequisites are all already done, take it, and cross it off. If at some point no course is available but some remain, answer `false`.",
    works: "A course with no unfinished prerequisites can safely be taken now. Taking it never blocks anything else (it only frees courses that depended on it), so if an order exists, this greedy removal finds it.",
    slow: "If each round **scans all courses** to find an available one, that is $O(n)$ per round and $n$ rounds, plus re-checking prerequisites: about $O(n^2 + n \\cdot e)$.",
    repeat: "In every round we **rescan all courses and all their prerequisites** to find which became available, although only the courses that depend on the one we just took can have changed.",
    remember: "Keep, for every course, the **number of prerequisites not yet taken** (its *in-degree*), and a list of the courses that depend on it. Courses with in-degree 0 are available.",
    observation: "When we take course `u`, only the courses that list `u` as a prerequisite change: decrement their counters. Any counter that reaches 0 means that course is now available, so put it in a queue. If every course eventually gets processed, there was no cycle; if some courses never reach 0, they lie on or behind a cycle.",
    leads: "**Kahn's algorithm:** build `adj[b]` (who depends on `b`) and `indeg[a]`. Queue all courses with `indeg == 0`. Pop one, count it as taken, decrement the counters of its dependants and enqueue the ones that hit 0. At the end the answer is `taken == numCourses`. $O(V + E)$.",
  },

  flow: [
    "Repeatedly find a course with no remaining prerequisites, take it, cross it off.",
    "Taking an available course never blocks another, so greedy removal finds an order if one exists.",
    "Scanning every course every round costs $O(n^2 + ne)$.",
    "Only the dependants of the course just taken can become available.",
    "Track each course's count of untaken prerequisites (in-degree) and a list of dependants.",
    "Queue the in-degree-0 courses; pop, decrement, enqueue new zeros: $O(V + E)$ (Kahn).",
  ],

  brute: {
    idea: "**Brute force:** keep a boolean `done[]`. In each round scan every course; pick one that is not done and whose prerequisites are all done, mark it done. If a full scan finds none while some courses remain, return `false`.",
    why: "Each round costs a scan of all courses and, for each, a scan of its prerequisites, and there can be $n$ rounds: $O(n \\cdot (n + e))$. Nearly all of that work re-examines courses that nothing has changed for.",
    time: "O(n·(n+e))", space: "O(n)",
    measure: { fTex: "n^2", f: (n) => n * n, ns: [10, 100, 1000, 2000] },
    cpp: `class Solution {
public:
    bool canFinish(int n, vector<vector<int>>& prereq) {
        vector<bool> done(n, false);
        for (int round = 0; round < n; round++) {
            bool progressed = false;
            for (int c = 0; c < n && !progressed; c++) {
                if (done[c]) continue;
                bool ok = true;
                for (auto& p : prereq) if (p[0] == c && !done[p[1]]) { ok = false; break; }
                if (ok) { done[c] = true; progressed = true; }
            }
            if (!progressed) return false;
        }
        return true;
    }
};`,
    js: `function canFinish(n, prereq) {
  const done = new Array(n).fill(false);
  for (let round = 0; round < n; round++) {
    let progressed = false;
    for (let c = 0; c < n && !progressed; c++) {
      if (done[c]) continue;
      if (prereq.every((p) => p[0] !== c || done[p[1]])) { done[c] = true; progressed = true; }
    }
    if (!progressed) return false;
  }
  return true;
}`,
  },

  pattern: {
    name: "Topological Sort (Kahn / BFS)",
    why: "Courses with prerequisites form a **directed graph** (an edge `b → a` means *b before a*). A valid schedule is a **topological order**, which exists exactly when the graph has no cycle. Kahn's algorithm builds such an order by repeatedly removing nodes with no incoming edges, and fails (leaves nodes behind) precisely when a cycle exists.",
    recognize: [
      "**Dependencies, prerequisites, build order, task scheduling**: *\"A must come before B\"*.",
      "The question is whether a valid **order** exists, or you must output one.",
      "A directed graph where you need to detect a **cycle**.",
      "In-degree counts and a queue of \"ready\" items are a natural fit.",
    ],
  },

  optimal: {
    idea: "Build the graph: for each pair `[a, b]` add an edge `b → a` and increment `indeg[a]`. Put every course with `indeg 0` in a queue (nothing blocks them). Repeatedly pop a course `u`, count it as taken, and for each course `v` that depends on `u` decrement `indeg[v]`; when it reaches 0, enqueue `v`. If you take exactly `numCourses` courses, the schedule exists.",
    steps: [
      "Create `adj` (list of dependants per course) and `indeg` (number of prerequisites per course).",
      "For each `[a, b]`: `adj[b].push_back(a)` and `indeg[a]++`.",
      "Push all courses with `indeg == 0` into a queue.",
      "While the queue is not empty: pop `u`, `taken++`; for each dependant `v` of `u`: `if (--indeg[v] == 0) push v`.",
      "Return `taken == numCourses`.",
    ],
    invariant: "**Every course in the queue or already popped has all its prerequisites taken; `indeg[v]` always equals the number of prerequisites of `v` not yet taken.**",
    correct: "*If the graph has no cycle:* it has a node with in-degree 0; removing it leaves an acyclic graph, which again has such a node, and so on, so Kahn's algorithm removes every node and `taken == n`. *If it has a cycle:* no node on the cycle can ever reach in-degree 0, because each has an incoming edge from another cycle node that is never removed first. So those nodes are never queued and `taken < n`. Hence `taken == n` exactly when a valid order exists.",
  },

  cpp: `class Solution {
public:
    bool canFinish(int n, vector<vector<int>>& prereq) {
        vector<vector<int>> adj(n);                                    // adj[b]: courses that need b //@init
        vector<int> indeg(n, 0);                                       // untaken prerequisites
        for (auto& p : prereq) { adj[p[1]].push_back(p[0]); indeg[p[0]]++; }   //@build
        queue<int> q;
        for (int i = 0; i < n; i++) if (indeg[i] == 0) q.push(i);      // ready now //@seed
        int taken = 0;
        while (!q.empty()) {                                           //@loop
            int u = q.front(); q.pop(); taken++;                       //@pop
            for (int v : adj[u]) if (--indeg[v] == 0) q.push(v);       // v lost one prerequisite //@relax
        }
        return taken == n;                                             //@ret
    }
};`,
  js: `function canFinish(n, prereq) {
  const adj = Array.from({ length: n }, () => []);                     // adj[b]: courses that need b //@init
  const indeg = new Array(n).fill(0);                                  // untaken prerequisites
  for (const [a, b] of prereq) { adj[b].push(a); indeg[a]++; }         //@build
  const q = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) q.push(i);           // ready now //@seed
  let taken = 0;
  for (let h = 0; h < q.length; h++) {                                 //@loop
    const u = q[h]; taken++;                                           //@pop
    for (const v of adj[u]) if (--indeg[v] === 0) q.push(v);           // v lost one prerequisite //@relax
  }
  return taken === n;                                                  //@ret
}`,

  tests: [
    { name: "Example 1: 0 then 1", kind: "normal", input: { numCourses: 2, prerequisites: [[1, 0]] } },
    { name: "Example 2: a cycle", kind: "normal", input: { numCourses: 2, prerequisites: [[1, 0], [0, 1]] } },
    { name: "A diamond of dependencies", kind: "normal", input: { numCourses: 4, prerequisites: [[1, 0], [2, 0], [3, 1], [3, 2]] } },
    { name: "No prerequisites at all", kind: "edge", input: { numCourses: 3, prerequisites: [] }, why: "Every course has in-degree 0, so all of them are queued immediately and taken: `true`. The algorithm needs no special case for an empty prerequisite list." },
    { name: "A course that is its own prerequisite", kind: "edge", input: { numCourses: 1, prerequisites: [[0, 0]] }, why: "A self-loop: course 0 waits for itself, so its in-degree is 1 and it is never queued: `taken = 0 ≠ 1`, so `false`. It is the smallest possible cycle." },
    { name: "A cycle hidden inside a bigger graph", kind: "edge", input: { numCourses: 5, prerequisites: [[1, 0], [2, 1], [1, 2], [3, 2], [4, 0]] }, why: "Courses 0 and 4 can be taken, but 1 and 2 wait for each other, and 3 waits for 2. Only 2 of 5 get taken, so the answer is `false`. This is why the check is `taken == n`, not just *\"was the queue ever empty?\"*." },
    { name: "A single course", kind: "corner", input: { numCourses: 1, prerequisites: [] }, why: "One course, nothing to wait for: queued, taken, `true`." },
    { name: "A long chain", kind: "corner", input: { numCourses: 6, prerequisites: [[1, 0], [2, 1], [3, 2], [4, 3], [5, 4]] }, why: "Only one course is available at any moment, so the queue never holds more than one item. The order is forced: 0, 1, 2, 3, 4, 5." },
    { name: "Two separate groups", kind: "corner", input: { numCourses: 6, prerequisites: [[1, 0], [2, 1], [4, 3], [5, 4]] }, why: "Two independent chains: the graph is not connected, and Kahn's algorithm handles it because *every* in-degree-0 course starts in the queue (0 and 3)." },
  ],

  trace(input, T) {
    const n = input.numCourses, prereq = input.prerequisites;
    const adj = Array.from({ length: n }, () => []), indeg = new Array(n).fill(0);
    const edges = prereq.map(([a, b]) => [b, a]);
    const q = [], order = [], state = new Array(n).fill("");
    let taken = 0, whyIn = false, whyQ = false, whyCycle = false;
    // circle layout
    const nodes = Array.from({ length: n }, (_, i) => ({ id: i, label: String(i), x: 130 + 100 * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: 120 + 100 * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) }));
    const S = (o = {}) => () => {
      const hl = {}, tags = {};
      for (let i = 0; i < n; i++) { tags[i] = `in ${indeg[i]}`; if (state[i] === "done") hl[i] = "ok"; }
      q.forEach((v) => { if (state[v] !== "done") hl[v] = "win"; });
      if (o.cur != null) hl[o.cur] = "cur";
      if (o.dep != null) hl[o.dep] = o.depCls || "cmp";
      if (o.bad) o.bad.forEach((v) => (hl[v] = "bad"));
      const ehl = {};
      if (o.edge) ehl[o.edge[0] + "-" + o.edge[1]] = "hot";
      return { nodes, edges, directed: true, hl, ehl, tags, queue: q.map((v) => ({ t: String(v), id: "c" + v })).filter((x) => state[+x.t] !== "done"), queueTitle: "queue of ready courses", order: order.slice(), orderLabel: "courses taken, in order", regs: [{ k: "taken", v: taken, cls: "hit" }, { k: "courses", v: n, cls: "dim" }], note: o.note, label: "an arrow  b → a  means  take b before a" };
    };
    T.step("init", { vars: { numCourses: n, prerequisites: prereq.length }, state: S(), phase: "Build the graph", say: `${n} course${n === 1 ? "" : "s"} and ${prereq.length} prerequisite${prereq.length === 1 ? "" : "s"}. Each \`[a, b]\` becomes an arrow **b → a** (b must be taken first). Each course counts how many arrows point **into** it.`, op: `adj = ${n} empty lists,  indeg = [0, …, 0]`, act: "START" });
    for (const [a, b] of prereq) { adj[b].push(a); indeg[a]++; }
    T.step("build", { vars: { indeg: indeg.slice() }, state: S(), say: `The in-degrees are \`[${indeg.join(", ")}]\`: \`indeg[c]\` is the number of prerequisites of course \`c\` that are not taken yet.`, op: `indeg = [${indeg.join(", ")}]`, act: "COUNT_PREREQUISITES",
      why: { title: "Why count incoming arrows?", text: "A course can be taken exactly when all its prerequisites are done, i.e. when its in-degree has dropped to 0. The counter lets us notice that moment without rescanning." } });
    whyIn = true;
    for (let i = 0; i < n; i++) if (indeg[i] === 0) q.push(i);
    T.step("seed", { vars: { queue: q.slice() }, state: S({ note: q.length ? `ready now: ${q.join(", ")}` : "no course is ready: every course has a prerequisite" }), phase: "Take ready courses, one by one", say: q.length ? `Courses with in-degree 0 have no prerequisites, so they are **ready**: ${q.join(", ")}. They go into the queue.` : "**No course has in-degree 0**: every course waits for another one. Nothing can start, so there must be a cycle.", op: q.length ? `queue = [${q.join(", ")}]` : "queue = [ ]", act: q.length ? "SEED_QUEUE" : "NOTHING_READY",
      why: whyQ || !q.length ? null : { title: "Why start with the in-degree-0 courses?", text: "They are the only courses that can be taken first. Everything else depends on something. If there were none, no first step would exist." } });
    whyQ = true;
    let h = 0;
    while (h < q.length) {
      const u = q[h++];
      taken++; order.push(u);
      state[u] = "done";
      T.step("pop", { vars: { u, taken, queue: q.slice(h) }, state: S({ cur: u }), say: `Take course **${u}**: it is ready, so \`taken\` becomes **${taken}**. Now every course that needs ${u} has one prerequisite fewer.`, op: `u = ${u};  taken = ${taken}`, act: "TAKE_COURSE" });
      for (const v of adj[u]) {
        indeg[v]--;
        const ready = indeg[v] === 0;
        if (ready) q.push(v);
        T.step("relax", { vars: { u, v, [`indeg[${v}]`]: indeg[v] }, state: S({ cur: u, dep: v, depCls: ready ? "hit" : "cmp", edge: [u, v] }), say: ready ? `Course **${v}** needed ${u}; now its in-degree is **0**: all its prerequisites are done, so it is **ready**. Enqueue it.` : `Course **${v}** needed ${u}. Its in-degree drops to **${indeg[v]}**: it is still waiting for ${indeg[v]} other prerequisite${indeg[v] === 1 ? "" : "s"}.`, op: `--indeg[${v}] = ${indeg[v]}${ready ? "  ⇒  push " + v : ""}`, act: ready ? "BECOMES_READY" : "STILL_WAITING" });
      }
    }
    const ok = taken === n;
    const stuck = []; for (let i = 0; i < n; i++) if (state[i] !== "done") stuck.push(i);
    T.step("ret", { vars: { taken, numCourses: n }, state: S({ bad: stuck, note: ok ? undefined : `stuck: ${stuck.join(", ")} (on or behind a cycle)` }), say: ok ? `The queue is empty and all **${n}** courses were taken: a valid order exists (**${order.join(" → ")}**). Return \`true\`.` : `The queue is empty but only **${taken}** of **${n}** courses were taken. Courses **${stuck.join(", ")}** are still waiting on each other (a cycle, or something behind one). Return \`false\`.`, op: `taken == numCourses  →  ${taken} == ${n}  →  ${ok}`, act: ok ? "ALL_TAKEN" : "CYCLE_FOUND",
      why: ok || whyCycle ? null : { title: "Why does a cycle block the courses?", text: "Every course on a cycle has an arrow coming from another course on the same cycle, and none of them can be taken before the others. Their in-degrees can never reach 0, so they never enter the queue." } });
    T.result(ok);
  },
  fuzz(rnd) {
    const n = 1 + Math.floor(rnd() * 6), set = new Set(), pr = [];
    const k = Math.floor(rnd() * 8);
    for (let i = 0; i < k; i++) { const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n), key = a + "," + b; if (!set.has(key)) { set.add(key); pr.push([a, b]); } }
    return { numCourses: n, prerequisites: pr };
  },
  gen(n) { return { numCourses: n, prerequisites: Array.from({ length: n - 1 }, (_, i) => [i + 1, i]) }; },

  complexity: {
    time: {
      tex: "O(V + E)", title: "each course is queued once, each prerequisite is examined once", short: "V = courses, E = prerequisites",
      derive: [
        "T_{\\text{build}} = O(V + E) || create the lists and count in-degrees: one step per prerequisite",
        "\\text{each course enters the queue at most once} \\;\\Rightarrow\\; \\text{pops} \\le V || a course is queued only when its in-degree first hits 0",
        "\\text{each edge } (u \\to v) \\text{ is examined exactly once, when } u \\text{ is popped} \\;\\Rightarrow\\; \\text{relaxations} \\le E || the inner loop runs over `adj[u]`",
        "T(V, E) = O(V + E) + O(V) + O(E) || three linear pieces",
        "!T(V, E) = O(V + E) || versus $O(n(n + e))$ for rescanning",
      ],
      where: "Every vertex and every edge is touched a constant number of times: the optimal bound for any graph traversal. In the lab the step counter grows linearly with the length of a chain of courses.",
    },
    space: {
      tex: "O(V + E)", title: "adjacency lists, in-degrees and the queue", short: "the graph itself dominates",
      derive: [
        "S = \\underbrace{O(V + E)}_{\\text{adjacency lists}} + \\underbrace{O(V)}_{\\text{in-degrees}} + \\underbrace{O(V)}_{\\text{queue}} || three structures",
        "!S = O(V + E) || the lists store each edge once",
      ],
      where: "Any algorithm that must read the prerequisites needs $\\Omega(E)$ to store them; the extra structures are linear in the number of courses.",
    },
    limit: "Reading the input already costs $\\Theta(V + E)$, so this is optimal. Detecting cycles in a directed graph cannot be done faster than looking at every edge.",
    measure: { label: "n = number of courses (a chain)", fTex: "n", f: (n) => n, sizes: [8, 16, 32, 64, 128, 256], growth: "linear" },
  },

  mistakes: [
    { title: "Reversing the edge direction", what: "Adding `adj[a].push_back(b)` and `indeg[b]++`.", why: "`[a, b]` is read as \"a then b\", while the problem says b comes *before* a.", breaks: "The order is reversed; for acyclic input the answer is still right (reversing all arrows keeps acyclicity), but when you must output an order it is backwards, and mixing the two parts (list vs counter) breaks everything.", avoid: "`[a, b]`: edge `b → a`, so `adj[b]` gets `a` and `indeg[a]++`." },
    { title: "Returning `true` when the queue empties without counting", what: "`return true;` after the loop.", why: "The loop ended without an error.", breaks: "Courses stuck on a cycle are never queued, but nothing complains: the function returns `true` for `[[1,0],[0,1]]`.", avoid: "Count the processed courses and compare with `numCourses`." },
    { title: "Forgetting disconnected courses", what: "Starting the traversal from course 0 only.", why: "Thinking of a graph traversal from a single source.", breaks: "Courses not reachable from 0 are never processed.", avoid: "Seed the queue with **every** course of in-degree 0." },
    { title: "Using DFS without distinguishing \"visiting\" from \"visited\"", what: "A DFS with a single `visited` flag.", why: "It works for undirected graphs.", breaks: "In a directed graph, reaching an already *finished* node is fine, but reaching one *on the current path* means a cycle; one flag cannot tell them apart and you report false cycles (diamonds) or miss real ones.", avoid: "Use three states (unvisited / in progress / done), or use Kahn's algorithm as here." },
    { title: "Decrementing the in-degree but not checking for 0", what: "`indeg[v]--;` without a test.", why: "Forgetting to enqueue newly ready courses.", breaks: "Only the initial in-degree-0 courses are ever processed; the answer is `false` for any non-trivial graph.", avoid: "`if (--indeg[v] == 0) q.push(v);`" },
  ],

  followUps: [
    {
      q: "Return **an order** in which to take the courses (*Course Schedule II*).",
      a: "The same algorithm: append each popped course to an `order` vector. If `order.size() == numCourses` return it; otherwise return an empty array. The order is a valid topological order (there may be many).",
      cpp: `vector<int> findOrder(int n, vector<vector<int>>& prereq) {
    vector<vector<int>> adj(n); vector<int> indeg(n, 0), order;
    for (auto& p : prereq) { adj[p[1]].push_back(p[0]); indeg[p[0]]++; }
    queue<int> q;
    for (int i = 0; i < n; i++) if (indeg[i] == 0) q.push(i);
    while (!q.empty()) {
        int u = q.front(); q.pop(); order.push_back(u);
        for (int v : adj[u]) if (--indeg[v] == 0) q.push(v);
    }
    return (int)order.size() == n ? order : vector<int>{};
}`,
      js: `function findOrder(n, prereq) {
  const adj = Array.from({ length: n }, () => []), indeg = new Array(n).fill(0), order = [];
  for (const [a, b] of prereq) { adj[b].push(a); indeg[a]++; }
  const q = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) q.push(i);
  for (let h = 0; h < q.length; h++) {
    const u = q[h]; order.push(u);
    for (const v of adj[u]) if (--indeg[v] === 0) q.push(v);
  }
  return order.length === n ? order : [];
}`,
      time: "O(V + E)", space: "O(V + E)",
    },
    {
      q: "Solve it with **DFS** (three-colour cycle detection).",
      a: "Mark each node 0 (unvisited), 1 (on the current DFS path) or 2 (finished). DFS from every unvisited node: entering a node sets 1; reaching a node with state 1 means a **back edge**, hence a cycle; after exploring all its dependants set 2. The reverse of the finishing order is a topological order. Also $O(V + E)$; recursion depth up to $V$.",
      time: "O(V + E)", space: "O(V + E)",
    },
    {
      q: "What is the **minimum number of semesters** if you can take any number of available courses per semester?",
      a: "Process Kahn's algorithm **level by level**: all courses in the queue at the start of a round are taken in the same semester; count the rounds (the length of the longest dependency chain). It is the BFS-by-levels pattern, $O(V + E)$.",
      time: "O(V + E)", space: "O(V + E)",
    },
    {
      q: "Print the courses that are **part of a cycle**.",
      a: "After Kahn's algorithm, the courses never taken are on a cycle **or** depend on one. To isolate the cycle itself run the same algorithm on the *reversed* graph (peeling nodes with out-degree 0) or use Tarjan's / Kosaraju's algorithm to find strongly connected components of size > 1 (or with a self-loop).",
      time: "O(V + E)", space: "O(V + E)",
    },
  ],

  related: [
    { id: "alien-dictionary", why: "Build the graph from word comparisons, then run exactly this topological sort to produce the order." },
    { id: "graph-valid-tree", why: "Another graph property question (tree = connected and acyclic), solved with Union-Find." },
    { id: "number-of-islands", why: "Graph traversal on a grid: BFS/DFS with a visited mark." },
    { id: "clone-graph", why: "Graph traversal that builds a new graph while walking the old one." },
  ],
  patternNote: "**Topological sort (Kahn)** processes a dependency graph by repeatedly removing nodes with no remaining prerequisites. Keep an in-degree counter and a queue of ready nodes; each removal decrements its dependants. If the removal never finishes (some nodes stay behind), there is a cycle.",
  takeaways: [
    "Model prerequisites as a directed graph: `[a, b]` → edge `b → a`; a schedule exists iff there is **no cycle**.",
    "Count in-degrees; queue the nodes with in-degree 0; pop, decrement dependants, queue new zeros.",
    "Return `taken == numCourses`: the queue emptying alone does not prove success.",
    "Time $O(V + E)$, space $O(V + E)$. Recording the pop order gives the schedule itself.",
    "Seed with **all** in-degree-0 nodes (the graph may be disconnected).",
  ],
});
