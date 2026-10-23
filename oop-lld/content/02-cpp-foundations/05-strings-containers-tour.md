---
title: Strings, containers and algorithms: a tour
level: easy
time: 30
summary: The standard-library pieces every LLD solution uses: string and string_view, vector, array, map, unordered_map, set, queue, stack, priority_queue, plus sort, find_if, accumulate and lambdas, with the complexity of each operation.
---

In an LLD round you almost never write your own list or hash table. You pick the right standard container in five seconds and say *why*. This lesson is a map of the standard library for that purpose.

## Choosing a container

| Need | Use | Lookup | Insert | Notes |
|---|---|---|---|---|
| Sequence, fast index, grows at the end | `vector<T>` | O(1) by index | O(1) amortised at end | default choice |
| Fixed size, known at compile time | `array<T,N>` | O(1) | n/a | no heap |
| Fast at both ends | `deque<T>` | O(1) by index | O(1) at both ends | used by `queue` |
| Insert/erase in the middle with a handle | `list<T>` | O(n) | O(1) at iterator | rarely needed |
| Key → value, sorted by key | `map<K,V>` | O(log n) | O(log n) | ordered iteration |
| Key → value, fastest lookup | `unordered_map<K,V>` | O(1) average | O(1) average | no order |
| Unique values | `set<T>` / `unordered_set<T>` | as above | as above | |
| First in, first out | `queue<T>` | | O(1) | |
| Last in, first out | `stack<T>` | | O(1) | |
| Always give me the biggest/smallest | `priority_queue<T>` | top O(1) | O(log n) | binary heap |

## string and string_view

```cpp run title="Everyday string operations"
#include <iostream>
#include <string>
#include <string_view>
using namespace std;

// string_view: a read-only window onto characters owned by someone else. No copy.
size_t countVowels(string_view s) {
    size_t n = 0;
    for (char c : s) if (string("aeiou").find(c) != string::npos) ++n;
    return n;
}

int main() {
    string s = "object oriented";
    s += " design";
    cout << s << " (" << s.size() << " chars)\n";
    cout << s.substr(0, 6) << " | find 'oriented' at " << s.find("oriented") << "\n";
    cout << countVowels(s) << " vowels, " << countVowels("literal") << " in a literal\n";
    cout << to_string(42) + "!" << " " << stoi("123") + 1 << "\n";
}
```

:::warn string_view does not own the characters
`string_view v = string("temp");` leaves `v` pointing at a destroyed string. Use `string_view` for *parameters* you read right away, not for storing in a class.
:::

## vector: the default

```cpp run title="vector essentials"
#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> v{5, 2, 9, 1};
    v.push_back(7);                              // grow at the end
    v.insert(v.begin() + 1, 100);                // insert in the middle: O(n)
    sort(v.begin(), v.end());                    // 1 2 5 7 9 100
    for (int x : v) cout << x << " ";
    cout << "| size " << v.size() << "\n";

    // erase-remove: delete every element matching a condition
    v.erase(remove_if(v.begin(), v.end(), [](int x) { return x % 2 == 1; }), v.end());
    for (int x : v) cout << x << " ";
    cout << "\n";

    // v.at(i) checks bounds and throws; v[i] does not check (undefined behaviour if wrong)
    try { v.at(99); } catch (const out_of_range& e) { cout << "caught out_of_range\n"; }
}
```

:::warn Iterators and references can be invalidated
After `push_back` causes a reallocation, every iterator, pointer and reference into the vector is **dead**. After `erase`, the erased position and everything after it are invalid. When you store pointers to elements, think about this.
:::

## map, unordered_map, set

```cpp run title="Key-value lookup"
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <unordered_map>
using namespace std;

int main() {
    map<string, int> stock;                  // sorted by key
    stock["pen"] = 10;
    stock["book"] += 3;                      // operator[] creates a default (0) if missing!
    stock.insert({"bag", 2});
    for (const auto& [item, qty] : stock) cout << item << "=" << qty << " ";
    cout << "\n";

    if (auto it = stock.find("lamp"); it == stock.end()) cout << "no lamp\n";   // find does not create
    cout << "contains pen? " << stock.count("pen") << "\n";

    unordered_map<int, string> byId{{3, "c"}, {1, "a"}, {2, "b"}};
    cout << byId.at(2) << " " << byId.size() << "\n";   // iteration order of an unordered_map is unspecified

    set<int> seen{4, 1, 4, 3, 1};            // duplicates are dropped, sorted
    for (int x : seen) cout << x << " ";
    cout << "\n";
}
```

:::interview map vs unordered_map?
`map` is a balanced tree (often red-black): sorted, O(log n), works for any type with `<`. `unordered_map` is a hash table: O(1) average but O(n) worst case, needs a hash function for the key, and its order is unspecified. Use `map` when you need order or range queries (for example, "all bookings between 10:00 and 12:00"), otherwise `unordered_map`.
:::

## queue, stack, priority_queue

```cpp run title="Adapters"
#include <iostream>
#include <queue>
#include <stack>
#include <string>
#include <vector>
using namespace std;

struct Task { int priority; string name; };
struct ByPriority {                              // priority_queue puts the "largest" first
    bool operator()(const Task& a, const Task& b) const { return a.priority < b.priority; }
};

int main() {
    queue<int> q;  q.push(1); q.push(2); q.push(3);
    cout << "queue front " << q.front() << ", ";  q.pop();
    cout << "next " << q.front() << "\n";

    stack<char> st;  for (char c : string("abc")) st.push(c);
    cout << "stack top " << st.top() << "\n";

    priority_queue<Task, vector<Task>, ByPriority> pq;
    pq.push({2, "write tests"}); pq.push({9, "fix outage"}); pq.push({5, "review"});
    while (!pq.empty()) { cout << pq.top().priority << ":" << pq.top().name << "  "; pq.pop(); }
    cout << "\n";
}
```

## Algorithms and lambdas

Do not write raw loops for common jobs. `<algorithm>` and `<numeric>` have the standard ones, and a **lambda** is a small unnamed function you write in place.

```cpp run title="sort, find_if, count_if, accumulate, transform"
#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

struct Employee { string name; int salary; };

int main() {
    vector<Employee> staff{{"asha", 90}, {"ravi", 70}, {"meera", 120}, {"kiran", 70}};

    sort(staff.begin(), staff.end(), [](const Employee& a, const Employee& b) {
        if (a.salary != b.salary) return a.salary > b.salary;     // higher salary first
        return a.name < b.name;                                    // tie: by name
    });
    for (const auto& e : staff) cout << e.name << ":" << e.salary << " ";
    cout << "\n";

    auto it = find_if(staff.begin(), staff.end(), [](const Employee& e) { return e.salary < 80; });
    cout << "first below 80: " << it->name << "\n";

    int threshold = 85;
    cout << "above " << threshold << ": "
         << count_if(staff.begin(), staff.end(), [threshold](const Employee& e) { return e.salary > threshold; }) << "\n";

    int total = accumulate(staff.begin(), staff.end(), 0, [](int sum, const Employee& e) { return sum + e.salary; });
    cout << "total " << total << "\n";

    vector<string> names(staff.size());
    transform(staff.begin(), staff.end(), names.begin(), [](const Employee& e) { return e.name; });
    cout << names.front() << ".." << names.back() << "\n";
}
```

The `[threshold]` part is the **capture list**: it copies `threshold` into the lambda. `[&]` captures everything by reference, `[=]` by value. Capture only what you need.

```quiz
? Which container would you pick for "look up a booking by its id" with no ordering needs?
- vector
+ unordered_map
- list
> Hash lookup is O(1) on average. Use map only if you need sorted order or range queries.
? What happens to a vector's iterators after `push_back` reallocates?
- They stay valid
+ They are all invalidated
- Only the last one is invalidated
> Reallocation moves elements to a new buffer, so old iterators, pointers and references dangle.
? `stock["lamp"]` on a `map<string,int>` when "lamp" does not exist...
- throws
+ inserts a default value 0 and returns it
- returns -1
> operator[] always creates the key. Use find, count or at when you only want to look.
```

:::keypoints
- Default to `vector`. Use `unordered_map` for fast lookup, `map` for sorted order, `priority_queue` for "best first".
- Know the complexity of each, and say it in the interview.
- `string_view` is a non-owning view; do not store it beyond the owner's life.
- Prefer algorithms with lambdas over hand-written loops. Watch out for iterator invalidation.
:::
