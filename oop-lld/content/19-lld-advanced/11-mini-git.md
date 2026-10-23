---
title: Design a Mini Git (version control)
level: advanced
time: 80
summary: The object model behind Git: content-addressed blobs, tree snapshots and commits forming a DAG, branches and HEAD as movable references, commit, log, checkout, diff by longest common subsequence, and merging with fast-forward, merge-base and three-way file merge with conflicts.
---

:::problem Design a Mini Git {level=hard tags="version control,DAG,hashing,immutability,merge,Composite,Memento"}
Design a simplified version control system. Users stage files and **commit** snapshots, view the **log**, create **branches**, **checkout** any commit or branch, see a **diff** between two versions, and **merge** one branch into another (fast-forward when possible, otherwise a three-way merge that detects conflicts). Content must be stored efficiently: identical content is stored once.
:::

:::hint Hint
Git is a **content-addressable store** plus a **graph of immutable objects**. A file's content is a *blob* named by the hash of its bytes. A *tree* maps paths to blob hashes (a snapshot). A *commit* points to a tree and to its parent commit(s). Branches and HEAD are just **named pointers** to commits. Almost every feature falls out of these four ideas.
:::

## Step 1: requirements

| Question | Assumption |
|---|---|
| Content model? | text files, flat paths (`src/a.txt` as a key); trees are maps path → blob id |
| Operations? | `add(path, content)` (stage), `commit(message)`, `log()`, `branch(name)`, `checkout(name or commit)`, `diff(a, b)`, `merge(branch)` |
| Storage? | content-addressed, immutable objects; deduplicated by hash |
| Branches? | movable pointers to commits; `HEAD` points to a branch (or a commit: detached) |
| Merge? | fast-forward if possible; else three-way merge per file using the merge base; conflicts produce markers and no merge commit until resolved |
| Hashing? | a simple 64-bit FNV-1a hex digest (Git uses SHA-1/SHA-256: the structure is identical) |
| Out of scope | directories as nested trees, packfiles, remotes, rebase, binary files |

## Step 2: the object model

```text
 blob  b1 = "hello"          blob b2 = "world"          blob b3 = "hello world"
   ▲                            ▲                          ▲
 tree t1 { a.txt→b1 }       tree t2 { a.txt→b1, b.txt→b2 }   tree t3 { a.txt→b3, b.txt→b2 }
   ▲                            ▲                          ▲
 commit c1 (root)  ◄── commit c2 (parent c1) ◄── commit c3 (parent c2)
                                                     ▲
                                              branch main, HEAD
```

Every object's id is the hash of its content. An unchanged file in a new commit points to the **same blob**: no copy. Commits form a **DAG**; a merge commit has **two parents**.

## Step 3: entities

```viz algo=uml title="Mini Git"
class Repository
  - objects: ObjectStore
  - refs: map<string, CommitId>
  - head: Head
  - index: map<string, string>
  + add(path: string, content: string): void
  + commit(message: string): CommitId
  + branch(name: string): void
  + checkout(target: string): void
  + merge(branch: string): MergeResult
  + log(): Commit[]
  + diff(a: CommitId, b: CommitId): string
class ObjectStore
  - blobs: map<Id, string>
  - commits: map<Id, Commit>
  + putBlob(content: string): Id
  + putCommit(c: Commit): Id
class Commit
  - id: Id
  - tree: Tree
  - parents: Id[]
  - message: string
class Tree
  - entries: map<string, Id>
class Differ
  + lines(a: string, b: string): DiffLine[]
class Merger
  + mergeBase(a: CommitId, b: CommitId): CommitId
  + threeWay(base: Tree, ours: Tree, theirs: Tree): MergeOutcome
Repository *-- ObjectStore
ObjectStore *-- Commit
Commit *-- Tree
Repository ..> Differ
Repository ..> Merger
```

## Step 4: design decisions

- **Immutability**: objects are never modified; a "change" creates new objects. This makes history trustworthy (the id of a commit includes its parents' ids: a Merkle DAG), sharing safe, and caching trivial.
- **Content addressing**: `putBlob(content)` returns `hash(content)`; storing the same text twice stores it once. Commit id = hash of (tree entries, parents, message).
- **Refs**: `refs["main"] = commitId`; `HEAD` = name of the current branch (or a detached commit id). `commit` moves the current branch pointer. **Branching is O(1)** (copy a pointer).
- **Index (staging area)**: the proposed next tree. `commit` freezes the index into a tree and a commit.
- **Checkout** sets the index/working tree to a commit's tree and moves HEAD. (We keep the "working directory" as a map in memory.)
- **Diff** = line-based **LCS** (longest common subsequence) between two blobs; output `+`/`-` lines.
- **Merge base**: the nearest common ancestor of two commits: collect all ancestors of A (BFS) then walk B's ancestors in BFS order until one is in A's set.
- **Three-way merge** per path with `(base, ours, theirs)`:
  - ours == theirs → take it;
  - base == ours → take theirs (only they changed it);
  - base == theirs → take ours;
  - otherwise → **conflict** (write conflict markers).
- **Fast-forward**: if the current commit is an ancestor of the target, just move the pointer; no new commit.

## Step 5: the code

```cpp run title="Blobs, trees, commits, branches, diff and three-way merge"
#include <algorithm>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <map>
#include <optional>
#include <queue>
#include <set>
#include <sstream>
#include <string>
#include <vector>
using namespace std;

using Id = string;
string hashOf(const string& s) {                              // FNV-1a 64-bit as a stand-in for SHA-1
    uint64_t h = 1469598103934665603ULL;
    for (unsigned char c : s) { h ^= c; h *= 1099511628211ULL; }
    ostringstream o; o << hex << setw(16) << setfill('0') << h; return o.str().substr(0, 7);
}

using Tree = map<string, Id>;                                // path -> blob id
struct Commit { Id id; Tree tree; vector<Id> parents; string message; };

struct DiffLine { char tag; string text; };                  // ' ' same, '+' added, '-' removed
vector<string> splitLines(const string& s) { vector<string> v; stringstream ss(s); string l; while (getline(ss, l)) v.push_back(l); return v; }
vector<DiffLine> diffLines(const string& a, const string& b) {   // LCS table, then walk back
    auto x = splitLines(a), y = splitLines(b);
    vector<vector<int>> lcs(x.size() + 1, vector<int>(y.size() + 1, 0));
    for (size_t i = x.size(); i-- > 0;) for (size_t j = y.size(); j-- > 0;) lcs[i][j] = x[i] == y[j] ? lcs[i + 1][j + 1] + 1 : max(lcs[i + 1][j], lcs[i][j + 1]);
    vector<DiffLine> out; size_t i = 0, j = 0;
    while (i < x.size() && j < y.size()) {
        if (x[i] == y[j]) { out.push_back({' ', x[i]}); ++i; ++j; }
        else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push_back({'-', x[i++]});
        else out.push_back({'+', y[j++]});
    }
    while (i < x.size()) out.push_back({'-', x[i++]});
    while (j < y.size()) out.push_back({'+', y[j++]});
    return out;
}

class Repository {
    map<Id, string> blobs_;                                   // content-addressed, immutable
    map<Id, Commit> commits_;
    map<string, Id> branches_;                                // refs
    string head_ = "main";                                    // the current branch name
    Tree index_;                                              // staged snapshot = the "working tree" here
    Id blob(const Id& id) const;
    string content(const Id& blobId) const { return blobs_.at(blobId); }

    Id currentCommit() const { auto it = branches_.find(head_); return it == branches_.end() ? Id{} : it->second; }
    set<Id> ancestors(const Id& start) const {                // all commits reachable from start (including itself)
        set<Id> seen; queue<Id> q; if (!start.empty()) q.push(start);
        while (!q.empty()) { Id c = q.front(); q.pop(); if (!seen.insert(c).second) continue; for (auto& p : commits_.at(c).parents) q.push(p); }
        return seen;
    }
    Id mergeBase(const Id& a, const Id& b) const {            // nearest common ancestor: BFS from b until we hit an ancestor of a
        auto ancA = ancestors(a);
        queue<Id> q; q.push(b); set<Id> seen;
        while (!q.empty()) { Id c = q.front(); q.pop(); if (ancA.count(c)) return c; if (!seen.insert(c).second) continue; for (auto& p : commits_.at(c).parents) q.push(p); }
        return {};
    }
public:
    Id add(const string& path, const string& text) { Id b = hashOf(text); blobs_[b] = text; index_[path] = b; return b; }
    void remove(const string& path) { index_.erase(path); }

    Id commit(const string& message, const vector<Id>& extraParents = {}) {
        Commit c; c.tree = index_; c.message = message;
        if (Id parent = currentCommit(); !parent.empty()) c.parents.push_back(parent);
        for (auto& p : extraParents) c.parents.push_back(p);
        string material = message; for (auto& [p, b] : c.tree) material += p + b; for (auto& p : c.parents) material += p;   // id covers tree + parents + message (a Merkle DAG)
        c.id = hashOf(material);
        commits_[c.id] = c;
        branches_[head_] = c.id;                              // the current branch moves forward
        return c.id;
    }
    void branch(const string& name) { branches_[name] = currentCommit(); }
    void checkout(const string& target) {
        if (branches_.count(target)) { head_ = target; index_ = commits_.at(branches_[target]).tree; }
        else throw runtime_error("unknown branch " + target);
    }
    vector<Commit> log() const {                              // newest first along the first-parent chain
        vector<Commit> out; Id c = currentCommit();
        while (!c.empty()) { out.push_back(commits_.at(c)); const auto& p = commits_.at(c).parents; c = p.empty() ? Id{} : p[0]; }
        return out;
    }
    string diff(const Id& a, const Id& b) const {
        const Tree& ta = commits_.at(a).tree; const Tree& tb = commits_.at(b).tree;
        set<string> paths; for (auto& [p, _] : ta) paths.insert(p); for (auto& [p, _] : tb) paths.insert(p);
        ostringstream out;
        for (auto& path : paths) {
            auto ia = ta.find(path), ib = tb.find(path);
            if (ia != ta.end() && ib != tb.end() && ia->second == ib->second) continue;      // identical blob ids: no need to compare text
            out << "    --- " << path << "\n";
            for (auto& d : diffLines(ia == ta.end() ? "" : content(ia->second), ib == tb.end() ? "" : content(ib->second))) if (d.tag != ' ') out << "    " << d.tag << " " << d.text << "\n";
        }
        return out.str();
    }

    struct MergeResult { string kind; vector<string> conflicts; Id commit; };
    MergeResult merge(const string& other) {
        Id ours = currentCommit(), theirs = branches_.at(other);
        if (ancestors(ours).count(theirs)) return {"already up to date", {}, ours};
        if (ancestors(theirs).count(ours)) { branches_[head_] = theirs; index_ = commits_.at(theirs).tree; return {"fast-forward", {}, theirs}; }   // our branch is behind: just move the pointer
        Id base = mergeBase(ours, theirs);
        const Tree empty; const Tree& tb = base.empty() ? empty : commits_.at(base).tree;
        const Tree& to = commits_.at(ours).tree; const Tree& tt = commits_.at(theirs).tree;
        set<string> paths; for (auto* t : {&tb, &to, &tt}) for (auto& [p, _] : *t) paths.insert(p);
        Tree merged; vector<string> conflicts;
        auto get = [](const Tree& t, const string& p) -> optional<Id> { auto it = t.find(p); return it == t.end() ? nullopt : optional<Id>(it->second); };
        for (auto& p : paths) {
            auto b = get(tb, p), o = get(to, p), t = get(tt, p);
            optional<Id> pick;
            if (o == t) pick = o;                             // both sides agree
            else if (b == o) pick = t;                        // only THEY changed it
            else if (b == t) pick = o;                        // only WE changed it
            else {                                            // both changed it differently: conflict
                conflicts.push_back(p);
                string text = "<<<<<<< ours\n" + (o ? content(*o) : "") + "\n=======\n" + (t ? content(*t) : "") + "\n>>>>>>> " + other + "\n";
                pick = add(p, text);
            }
            if (pick) merged[p] = *pick;
        }
        index_ = merged;
        if (!conflicts.empty()) return {"conflicts (resolve and commit)", conflicts, {}};
        return {"merge commit", {}, commit("Merge branch '" + other + "'", {theirs})};
    }
    const Tree& workingTree() const { return index_; }
    string show(const string& path) const { auto it = index_.find(path); return it == index_.end() ? "(missing)" : content(it->second); }
    size_t blobCount() const { return blobs_.size(); }
    string headName() const { return head_; }
};

int main() {
    Repository repo;
    repo.add("a.txt", "line1\nline2\nline3"); repo.add("b.txt", "bee");
    Id c1 = repo.commit("initial commit");
    repo.add("a.txt", "line1\nline2 edited\nline3");
    Id c2 = repo.commit("edit a.txt");
    cout << "two commits; blobs stored: " << repo.blobCount() << " (b.txt unchanged: its blob is shared, not copied)\n";
    cout << "log:\n"; for (auto& c : repo.log()) cout << "  " << c.id << " " << c.message << "\n";
    cout << "diff " << c1 << ".." << c2 << ":\n" << repo.diff(c1, c2);

    cout << "branching is just copying a pointer:\n";
    repo.branch("feature"); repo.checkout("feature");
    repo.add("c.txt", "from feature"); repo.add("a.txt", "line1\nline2 edited\nline3\nline4 (feature)");
    repo.commit("feature work");
    repo.checkout("main");
    cout << "  on main the feature changes are not there: c.txt is " << repo.show("c.txt") << "\n";

    cout << "merge feature into main (main has not moved, so it is a fast-forward):\n";
    auto r1 = repo.merge("feature"); cout << "  " << r1.kind << "; c.txt now: " << repo.show("c.txt") << "\n";

    cout << "diverge: both branches change different files, then merge (a three-way merge succeeds):\n";
    repo.branch("docs"); repo.checkout("docs");
    repo.add("README", "docs branch readme"); repo.commit("add readme");
    repo.checkout("main");
    repo.add("b.txt", "bee (changed on main)"); repo.commit("edit b on main");
    auto r2 = repo.merge("docs");
    cout << "  " << r2.kind << "; README: " << repo.show("README") << "; b.txt: " << repo.show("b.txt") << "\n";
    cout << "  merge commit has two parents; log (first-parent chain):\n"; for (auto& c : repo.log()) cout << "    " << c.id << " " << c.message << (c.parents.size() > 1 ? "  [merge]" : "") << "\n";

    cout << "conflict: both branches edit the same line of a.txt\n";
    repo.branch("left"); repo.branch("right");
    repo.checkout("left");  repo.add("a.txt", "LEFT version"); repo.commit("left edits a");
    repo.checkout("right"); repo.add("a.txt", "RIGHT version"); repo.commit("right edits a");
    repo.checkout("left");
    auto r3 = repo.merge("right");
    cout << "  " << r3.kind << ": "; for (auto& c : r3.conflicts) cout << c << " "; cout << "\n  a.txt now contains:\n";
    for (auto& l : splitLines(repo.show("a.txt"))) cout << "    " << l << "\n";
    cout << "  merging again before resolving gives the same answer: " << repo.merge("right").kind << "\n";
}
```

## How the pieces map to real Git

| Mini Git | Real Git |
|---|---|
| `Id` = 7 hex digits of FNV | full SHA-1 (or SHA-256) of a typed object (`blob <size>\0...`) |
| `Tree` = flat map | nested tree objects per directory; unchanged subtrees are shared |
| `branches_` map | `.git/refs/heads/*` files |
| `head_` | `.git/HEAD` (`ref: refs/heads/main`) |
| `index_` | `.git/index` (staging area), separate from the working directory |
| `ancestors`/`mergeBase` | `git merge-base`, commit-graph |
| `diffLines` LCS | Myers' O(ND) diff |
| three-way merge per file | per-hunk three-way merge (`git merge-file`), then recursive/ort strategies |

## Edge cases

| Case | Handling |
|---|---|
| Committing with nothing staged/changed | detect identical tree to the parent and refuse ("nothing to commit") |
| Same content added under two paths | same blob id: stored once |
| Criss-cross merges (two merge bases) | recursive strategy: merge the bases first; we pick one |
| Deleting a file on one branch, editing on the other | conflict (modify/delete) |
| Detached HEAD | `head_` holds a commit id instead of a branch name |
| Hash collisions | cryptographic hashes make them negligible; FNV here is for the demo only |
| Large files | chunking and delta compression in packfiles |
| Renames | detected by similarity of blob content, not stored explicitly |

## Extensions and follow-ups

| Follow-up | Design response |
|---|---|
| "Nested directories" | `Tree` entries become `(name → Blob or Tree)`: a Composite; commit hashing recurses |
| "Rebase" | replay commits onto a new base by cherry-picking: apply the diff of each commit |
| "Remotes: push and pull" | exchange missing objects (walk the DAG from refs, send unknown ids) |
| "Tags and annotated tags" | more refs |
| "Garbage collection" | mark reachable objects from refs, delete the rest |
| "Blame / bisect" | walk the DAG with diffs; binary search over the commit list |
| "Hooks and permissions" | Observer events around commit/push |
| "Line-level merge" | run diff3 between base/ours/theirs and merge hunks that do not overlap |
| "Performance on huge repos" | packfiles with delta chains, commit-graph files, partial clones |

```quiz
? Why is branching nearly free in Git?
- Branches copy all files
+ A branch is just a named pointer to a commit; no content is copied
- Branches are compressed
> The commit DAG and immutable objects make a new branch O(1).
? How is a merge conflict decided in a three-way merge?
- Any difference is a conflict
+ A path conflicts only if both sides changed it differently relative to the common ancestor
- Randomly
> If only one side changed it, that side's version wins automatically.
```

:::keypoints
- Content-addressed immutable objects (blob, tree, commit) form a Merkle DAG; branches and HEAD are movable pointers.
- Diff = LCS over lines; merge base = nearest common ancestor; merge = fast-forward or per-file three-way merge.
- Identical content is stored once; history cannot be altered without changing ids. Real Git adds nested trees, packfiles and remotes.
:::
