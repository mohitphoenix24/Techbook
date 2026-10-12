---
title: STL Containers — Choosing the Right Tool
level: easy
time: 45
summary: pair and tuple, stack, queue, deque, priority_queue (max-heap, min-heap, custom comparators), set/multiset, map, unordered_map/unordered_set — what each costs, the traps in each, and a decision guide for picking one.
---

Many interview solutions come down to **"put the data in the right container"**. Knowing what each STL container does, and what it costs, lets you go straight to a good solution.

## The big table

| Container | What it is | Key operations & cost |
|---|---|---|
| `vector<T>` | dynamic array | index $O(1)$, push/pop back $O(1)^*$ |
| `deque<T>` | double-ended queue | push/pop **both ends** $O(1)$, index $O(1)$ |
| `stack<T>` | LIFO adapter | `push`, `pop`, `top`: $O(1)$ |
| `queue<T>` | FIFO adapter | `push`, `pop`, `front`: $O(1)$ |
| `priority_queue<T>` | binary heap | `push`/`pop` $O(\log n)$, `top` $O(1)$ |
| `set<T>` / `multiset<T>` | balanced BST (red-black tree), sorted | insert/erase/find/`lower_bound` $O(\log n)$ |
| `map<K,V>` / `multimap` | balanced BST of key→value, sorted by key | $O(\log n)$ per operation |
| `unordered_set<T>` | hash table | insert/erase/find $O(1)$ average, $O(n)$ worst |
| `unordered_map<K,V>` | hash table of key→value | $O(1)$ average, $O(n)$ worst |

\* amortized

## pair and tuple

:::def pair
Two values glued together: `pair<int,string> p = {3, "x"}`, read with `p.first` and `p.second`. Pairs compare **lexicographically**: by `first`, then by `second` on ties. That makes them perfect for sorting by several keys.
:::

```cpp run level=easy title="Sorting by two keys for free"
#include <bits/stdc++.h>
using namespace std;

int main() {
    // (score, name): sort by score, ties broken by name
    vector<pair<int, string>> v = {{90, "zoe"}, {85, "amy"}, {90, "bob"}, {70, "cal"}};
    sort(v.begin(), v.end());
    for (auto& [score, name] : v) cout << score << ' ' << name << '\n';

    tuple<int, int, int> t = {3, 1, 2};
    auto [a, b, c] = t;
    cout << "tuple: " << a << b << c << ", get<1> = " << get<1>(t) << '\n';
}
```

## stack, queue, deque

:::def Stack (LIFO)
**L**ast **I**n, **F**irst **O**ut, like a pile of plates. You only touch the top. Used for undo, matching brackets, DFS, and the call stack itself.
:::

:::def Queue (FIFO)
**F**irst **I**n, **F**irst **O**ut, like a line at a shop. Used for BFS, scheduling and buffering.
:::

:::def Deque
A **d**ouble-**e**nded **que**ue: push and pop at both the front and the back in O(1). It's the engine behind the sliding-window-maximum trick.
:::

```cpp run level=easy title="stack, queue and deque side by side"
#include <bits/stdc++.h>
using namespace std;

int main() {
    stack<int> st;
    queue<int> q;
    deque<int> dq;
    for (int x : {1, 2, 3}) { st.push(x); q.push(x); dq.push_back(x); }
    dq.push_front(0);

    cout << "stack pops: ";
    while (!st.empty()) { cout << st.top() << ' '; st.pop(); }
    cout << "\nqueue pops: ";
    while (!q.empty()) { cout << q.front() << ' '; q.pop(); }
    cout << "\ndeque: front " << dq.front() << ", back " << dq.back() << ", dq[2] = " << dq[2] << '\n';
}
```

:::warn top()/front() on an empty container
Calling `st.top()` or `q.front()` when the container is empty is undefined behaviour, usually a crash or garbage. Always check `!st.empty()` first. Note that `pop()` returns nothing: read `top()` first, then `pop()`.
:::

## priority_queue (heaps)

:::def Priority queue
A container that always hands you the **largest** element (by default) in $O(1)$, with $O(\log n)$ insert and remove. C++ implements it as a binary heap stored inside a `vector`. How heaps work is covered in the Trees module.
:::

:::syntax
```cpp
priority_queue<int> maxHeap;                              // biggest on top
priority_queue<int, vector<int>, greater<int>> minHeap;   // smallest on top
priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;  // min by first, then second
```
:::

```cpp run level=easy title="Max-heap, min-heap and a custom order"
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v = {5, 1, 8, 3, 9, 2};
    priority_queue<int> mx(v.begin(), v.end());
    priority_queue<int, vector<int>, greater<int>> mn(v.begin(), v.end());
    cout << "max-heap top: " << mx.top() << ", min-heap top: " << mn.top() << '\n';

    // custom comparator: order tasks by deadline (earliest first), then by name
    struct Task { int deadline; string name; };
    auto later = [](const Task& a, const Task& b) {
        if (a.deadline != b.deadline) return a.deadline > b.deadline;   // ">" puts the SMALLEST on top
        return a.name > b.name;
    };
    priority_queue<Task, vector<Task>, decltype(later)> tasks(later);
    tasks.push({3, "write tests"}); tasks.push({1, "fix bug"}); tasks.push({3, "deploy"});
    while (!tasks.empty()) { cout << tasks.top().deadline << ' ' << tasks.top().name << '\n'; tasks.pop(); }
}
```

:::warn The comparator is "backwards"
`priority_queue` puts the element that compares **largest** on top. With `less` (the default), that's the max. To get a min-heap, use `greater`, or a lambda that returns `a > b`. It feels backwards. Remember it as: *the comparator says "a has lower priority than b"*.
:::

## set and multiset (ordered)

A `set` keeps unique elements **sorted** at all times. It's a self-balancing binary search tree, so every operation is $O(\log n)$. The killer feature is `lower_bound`: "the smallest element ≥ x" in $O(\log n)$.

```cpp run level=intermediate title="Sorted set: neighbours, ranges and multiset counts"
#include <bits/stdc++.h>
using namespace std;

int main() {
    set<int> s = {10, 40, 20, 50, 30};
    s.insert(20);                                   // duplicate: ignored
    cout << "set:"; for (int x : s) cout << ' ' << x; cout << '\n';

    auto it = s.lower_bound(25);                    // first element >= 25
    cout << "lower_bound(25) = " << *it << ", its predecessor = " << *prev(it) << '\n';
    cout << "upper_bound(30) = " << *s.upper_bound(30) << " (first element > 30)\n";
    cout << "min " << *s.begin() << ", max " << *s.rbegin() << '\n';

    multiset<int> ms = {5, 5, 5, 7};
    ms.erase(ms.find(5));                           // remove ONE copy
    cout << "multiset count(5) after erasing one = " << ms.count(5) << '\n';
    ms.erase(5);                                    // careful: removes ALL copies of 5
    cout << "after erase(5): size " << ms.size() << '\n';
}
```

:::warn multiset::erase(value) removes every copy
`ms.erase(x)` deletes **all** elements equal to `x`. To remove one copy, use `ms.erase(ms.find(x))`, and check that `find` didn't return `end()` first.
:::

## map (ordered dictionary)

```cpp run level=easy title="map: counting and iterating in key order"
#include <bits/stdc++.h>
using namespace std;

int main() {
    string text = "the cat and the hat and the bat";
    stringstream ss(text);
    map<string, int> freq;
    string w;
    while (ss >> w) freq[w]++;                 // operator[] creates missing keys with value 0

    for (auto& [word, c] : freq) cout << word << '=' << c << ' ';   // sorted by key
    cout << '\n';

    if (freq.count("dog") == 0) cout << "no dog\n";                  // check without inserting
    cout << "size = " << freq.size() << '\n';
    cout << freq["dog"] << " <- reading with [] INSERTED dog; size is now " << freq.size() << '\n';
}
```

:::warn `m[key]` inserts
Reading `m[key]` for a key that doesn't exist **inserts** it with a default value. That changes `size()` and can break "does it exist?" logic. Use `m.count(key)`, `m.find(key)` or (C++20) `m.contains(key)` to check membership.
:::

## unordered_map and unordered_set (hash tables)

Hash tables give $O(1)$ average lookups but no ordering. They're your default for "have I seen this?" and "how many times?".

```cpp run level=intermediate title="Hashing pairs needs a custom hash"
#include <bits/stdc++.h>
using namespace std;

struct PairHash {
    size_t operator()(const pair<int, int>& p) const {
        return hash<long long>()(((long long)p.first << 32) ^ (unsigned)p.second);
    }
};

int main() {
    unordered_set<int> seen;
    for (int x : {4, 1, 4, 2, 1}) {
        if (seen.count(x)) cout << x << " is a repeat\n";
        seen.insert(x);
    }

    // unordered_set<pair<int,int>> doesn't compile without a hash function:
    unordered_set<pair<int, int>, PairHash> visited;
    visited.insert({2, 3});
    cout << "visited (2,3)? " << visited.count({2, 3}) << '\n';
}
```

:::note map vs unordered_map
Use `unordered_map` for speed when order doesn't matter. Use `map` when you need **sorted keys**, `lower_bound`, or guaranteed $O(\log n)$. Hash tables can degrade to $O(n)$ per operation on adversarial input. The Hashing lesson explains why, and how a randomized hash protects you.
:::

## Choosing a container

:::flow Ask in this order
Need order of insertion? | vector / deque
Need LIFO or FIFO? | stack / queue
Always need min or max? | priority_queue
Need "is x present?" / counts? | unordered_set / unordered_map
Need sorted order, floor/ceiling? | set / map (lower_bound)
:::

| You need… | Use |
|---|---|
| A list you index and append to | `vector` |
| Add/remove at both ends | `deque` |
| Undo / matching / DFS | `stack` |
| BFS / processing in arrival order | `queue` |
| Repeatedly take the smallest or largest | `priority_queue` |
| Fast membership or counting | `unordered_set` / `unordered_map` |
| Sorted unique items, "nearest value ≥ x" | `set` + `lower_bound` |
| Sorted keys with values, ranges | `map` |
| Sorted items with duplicates, running median, sliding order statistics | `multiset` |

## Problems

:::problem Last Stone Weight {level=easy lc=last-stone-weight tags="heap,priority queue"}
Each turn, take the two **heaviest** stones `x ≤ y` and smash them. If `x == y` both are destroyed. Otherwise a stone of weight `y - x` remains. Return the weight of the last stone, or `0` if none are left.

Example: `[2,7,4,1,8,1]` → `1`.

:::hint Hint
"Repeatedly take the largest" is exactly what a max-heap is for.
:::

:::solution
```cpp run
#include <bits/stdc++.h>
using namespace std;

int lastStoneWeight(const vector<int>& stones) {
    priority_queue<int> pq(stones.begin(), stones.end());   // heapify: O(n)
    while (pq.size() > 1) {
        int y = pq.top(); pq.pop();
        int x = pq.top(); pq.pop();
        if (y != x) pq.push(y - x);
    }
    return pq.empty() ? 0 : pq.top();
}

int main() {
    cout << lastStoneWeight({2, 7, 4, 1, 8, 1}) << ' ' << lastStoneWeight({1}) << ' ' << lastStoneWeight({3, 3}) << '\n';
}
```

:::complexity
Time | O(n \log n) | at most n rounds, each O(log n)
Space | O(n) | the heap
:::
:::
:::

:::problem Find Players With Zero or One Losses {level=medium lc=find-players-with-zero-or-one-losses tags="hash map,map,sorting"}
`matches[i] = [winner, loser]`. Return two **sorted** lists: players who never lost, and players who lost exactly once. Only include players who played at least one match.

Example: `[[1,3],[2,3],[3,6],[5,6],[5,7],[4,5],[4,8],[4,9],[10,4],[10,9]]` → `[[1,2,10],[4,5,7,8]]`.

:::hint Hint
Count losses per player, making sure winners appear with 0 losses. Then read the counts back **in sorted order**. Which container keeps keys sorted for you?
:::

:::solution
A `map<int,int>` of loss counts gives sorted output for free. (With `unordered_map` you'd sort both lists at the end, which has the same O(n log n).)

```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<vector<int>> findWinners(const vector<vector<int>>& matches) {
    map<int, int> losses;
    for (auto& m : matches) {
        losses[m[0]] += 0;          // make sure every winner exists
        losses[m[1]] += 1;
    }
    vector<vector<int>> ans(2);
    for (auto& [player, l] : losses) {
        if (l == 0) ans[0].push_back(player);
        else if (l == 1) ans[1].push_back(player);
    }
    return ans;
}

int main() {
    auto ans = findWinners({{1,3},{2,3},{3,6},{5,6},{5,7},{4,5},{4,8},{4,9},{10,4},{10,9}});
    for (auto& v : ans) { for (int x : v) cout << x << ' '; cout << '\n'; }
}
```

:::complexity
Time | O(m \log p) | m matches, p distinct players in the map
Space | O(p) |
:::
:::
:::

## Check yourself

```quiz
? You need the smallest element repeatedly, with insertions in between. Best container?
- vector, sorted after each insertion
+ priority_queue with greater<>
- unordered_set
> A min-heap: O(log n) insert and remove, O(1) peek.

? How do you remove exactly one copy of 5 from `multiset<int> ms`?
- ms.erase(5)
+ ms.erase(ms.find(5))
- ms.pop(5)
> erase(value) removes every copy.

? Which container answers "smallest stored value ≥ x" in O(log n)?
+ set with lower_bound
- unordered_set
- queue
> Only ordered containers support lower_bound.

? What happens when you read `m["missing"]` on a `map<string,int>`?
- It throws
+ It inserts "missing" with value 0 and returns 0
- It returns -1
> operator[] default-constructs missing entries.
```

:::keypoints
- `pair`/`tuple` compare lexicographically, which gives multi-key sorting for free.
- `stack` = LIFO, `queue` = FIFO, `deque` = both ends. Check `empty()` before `top()`/`front()`.
- `priority_queue` is a max-heap. Use `greater<>` or an `a > b` comparator for a min-heap.
- `set`/`map` are sorted trees with $O(\log n)$ operations and `lower_bound`. `unordered_*` are hash tables, $O(1)$ on average.
- Traps: `m[key]` inserts; `multiset::erase(value)` removes all copies; pairs need a custom hash in `unordered_*`.
:::
